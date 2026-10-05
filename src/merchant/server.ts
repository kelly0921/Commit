import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {invariant,ProductError} from '../product/domain.js';
import {merchantDemand,demandMetrics,simulateGroupOffer,DEMAND_VERSION,OFFER_BOUNDARIES} from './demand.js';
import {executeMerchantTurn} from './provider.js';
import {ProductDatabase} from '../product/db.js';
import {MerchantOfferService} from './offers.js';
import {AuthorityService} from '../product/authority.js';
type Options={origin?:string;cookieName?:string;key?:string;model?:string;licenseKey?:string;assetRoot?:string;fetcher?:typeof fetch;offers?:MerchantOfferService};
export function createMerchantServer(options:Options={}) {
  const sessions=new Map<string,{id:string;csrf:string;expires:number;requests:number;busy:boolean}>();
  return createServer(async(req:IncomingMessage,res:ServerResponse)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    // AG's theme engine sets inline styles. This applies only to the isolated merchant origin.
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json=(value:unknown,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const host=req.headers.host??'',origin=options.origin??`http://${host}`;invariant(options.origin?host===new URL(options.origin).host:/^(127\.0\.0\.1|localhost):\d+$/.test(host),'INVALID_HOST',403);
      const path=new URL(req.url??'/',`http://${host}`).pathname;
      if(!path.startsWith('/api/')){
        invariant(req.method==='GET','METHOD_NOT_ALLOWED',405);
        const file=path==='/merchant/group-demand'||path==='/'?'index.html':path==='/merchant.js'?'merchant.js':path==='/merchant.css'?'merchant.css':null;
        invariant(file,'NOT_FOUND',404);const root=options.assetRoot??fileURLToPath(new URL('../../merchant-public/',import.meta.url));
        res.writeHead(200,{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'});res.end(await readFile(resolve(root,file)));return;
      }
      const cookieName=options.cookieName??'commit_merchant';invariant(/^[a-z0-9_]+$/.test(cookieName),'INVALID_COOKIE_NAME',500);const cookie=new RegExp('\\b'+cookieName+'=([a-f0-9]{64})\\b').exec(req.headers.cookie??'')?.[1];
      let session=cookie?sessions.get(cookie):undefined;
      if(path==='/api/merchant/session'&&req.method==='GET'){
        if(!session||session.expires<Date.now()){
          for(const [id,s] of sessions)if(s.expires<Date.now())sessions.delete(id);
          invariant(sessions.size<200,'DEMO_SESSION_LIMIT',429);
          const token=randomBytes(32).toString('hex');session={id:token,csrf:randomBytes(32).toString('hex'),expires:Date.now()+86400000,requests:0,busy:false};sessions.set(token,session);
          res.setHeader('Set-Cookie',`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${origin.startsWith('https:')?'; Secure':''}`);
        }
        json({csrf:session.csrf,merchant:'Summit Weekend',synthetic:true,aiConfigured:Boolean(options.key),model:options.model??'gpt-5.6-terra',licenseKey:options.licenseKey??null});return;
      }
      invariant(session&&session.expires>Date.now(),'MERCHANT_SESSION_REQUIRED',401);
      if(path==='/api/merchant/demand'&&req.method==='GET'){const rows=merchantDemand(options.offers?.database);json({version:DEMAND_VERSION,rows,metrics:demandMetrics(rows),boundaries:OFFER_BOUNDARIES});return;}
      if(path==='/api/merchant/offers'&&req.method==='GET'){invariant(options.offers,'OFFERS_NOT_ENABLED',503);json({offers:options.offers.list()});return;}
      if(path==='/api/merchant/policy'&&req.method==='GET'){invariant(options.offers,'OFFERS_NOT_ENABLED',503);const db=options.offers.database;json({...new AuthorityService(db).policyView(),activity:db.all("SELECT title,body,created_at FROM activity_events WHERE recipient_kind='MERCHANT' ORDER BY created_at DESC LIMIT 50"),audit:db.all("SELECT title,body,authority_version AS authorityVersion,created_at AS createdAt FROM agent_activity WHERE audience='MERCHANT' ORDER BY created_at DESC LIMIT 50")});return;}
      invariant(req.method==='POST','NOT_FOUND',404);
      invariant(req.headers.origin===origin,'INVALID_ORIGIN',403);invariant(req.headers['x-csrf-token']===session.csrf,'INVALID_CSRF',403);
      invariant(['/api/merchant/simulate','/api/merchant/agent-turn','/api/merchant/policy','/api/merchant/offers/draft','/api/merchant/offers/review','/api/merchant/offers/publish','/api/merchant/offers/revoke'].includes(path),'NOT_FOUND',404);
      invariant(req.headers['content-type']?.split(';')[0]==='application/json','JSON_REQUIRED',415);
      let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;invariant(size<=(path.endsWith('agent-turn')?350000:16000),'BODY_TOO_LARGE',413);chunks.push(chunk);}
      let data:unknown;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ProductError('INVALID_JSON');}
      if(path==='/api/merchant/policy'){invariant(options.offers,'OFFERS_NOT_ENABLED',503);json(new AuthorityService(options.offers.database).policy(session.id,data));return;}
      if(path.endsWith('simulate')){json(options.offers?options.offers.simulate(session.id,data):simulateGroupOffer(data));return;}
      if(path.includes('/offers/')){
        invariant(options.offers,'OFFERS_NOT_ENABLED',503);invariant(data&&typeof data==='object'&&!Array.isArray(data),'INVALID_OFFER');const v=data as Record<string,unknown>;
        if(path.endsWith('/draft'))json(options.offers.draft(session.id,data));
        else if(path.endsWith('/review'))json(options.offers.review(session.id,v.offerId));
        else if(path.endsWith('/publish'))json(options.offers.publish(session.id,data));
        else json(options.offers.revoke(session.id,v.offerId,v.confirmExactTerms));return;
      }
      invariant(!session.busy,'AGENT_ALREADY_ANALYZING',429);invariant(session.requests<120,'AGENT_DEMO_LIMIT',429);
      session.busy=true;session.requests++;
      try{json(await executeMerchantTurn(data,options.key??'',options.model??'gpt-5.6-terra',options.fetcher));}finally{session.busy=false;}
    }catch(e){if(e instanceof ProductError)json({error:e.code},e.status);else json({error:'MERCHANT_REQUEST_FAILED'},500);}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.MERCHANT_PORT??3005);invariant(Number.isInteger(port)&&port>0&&port<65536,'INVALID_PORT');
  const database=new ProductDatabase(process.env.PRODUCT_DATABASE_PATH??resolve('data/phase-6.sqlite'));
  const server=createMerchantServer({cookieName:'commit_merchant_phase6',origin:process.env.PUBLIC_MERCHANT_ORIGIN,key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL,licenseKey:process.env.AG_STUDIO_LICENSE_KEY,offers:new MerchantOfferService(database)});
  server.listen(port,process.env.BIND_ADDRESS??'127.0.0.1',()=>console.log(`Commit merchant analytics: http://127.0.0.1:${port}/merchant/group-demand | merchant-safe fixture + group demand`));
  for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close(()=>{database.close();process.exit(0);}));
}
