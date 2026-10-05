import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ProductDatabase } from './db.js';
import { ProductService } from './service.js';
import { OpenAiProvider, OfflineDemoProvider } from './ai.js';
import { invariant, ProductError } from './domain.js';
import { CommitmentService } from './commitments.js';
import { PayPalAdapter } from '../paypal.js';
import { CaptureSagaService } from './capture-saga.js';
import {AgentCoordinator} from './agents.js';
import {CommunicationService} from './communication.js';
import {invitePreview} from './invite-preview.js';

const pages=new Set(['/','/create','/start','/join','/replay','/activity','/you','/demo','/agent','/updates','/group','/constraints','/proposal','/merchant','/commit','/commit/return','/commit/cancel','/waiting']);
async function body(request:IncomingMessage) {
  invariant(request.headers['content-type']?.split(';')[0]==='application/json','JSON_REQUIRED',415);
  let size=0;const chunks:Buffer[]=[];for await(const chunk of request){size+=chunk.length;invariant(size<=12000,'BODY_TOO_LARGE',413);chunks.push(chunk);}
  try {const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));invariant(value && typeof value==='object' && !Array.isArray(value),'INVALID_JSON');return value as Record<string,unknown>;}catch {throw new ProductError('INVALID_JSON');}
}
export function createProductServer(service:ProductService, assetRoot=fileURLToPath(new URL('../../product-public/',import.meta.url)),options:{coordinator?:AgentCoordinator;origin?:string;cookieName?:string;allowHistoricalReplay?:boolean}={}) {
  const coordinator=options.coordinator??new AgentCoordinator(service.database,service);
  return createServer(async(request:IncomingMessage,response:ServerResponse)=>{
    response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('Cache-Control','no-store');response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json=(value:unknown,status=200)=>{response.writeHead(status,{'content-type':'application/json; charset=utf-8'});response.end(JSON.stringify(value));};
    try {
      const host=request.headers.host ?? '';invariant(options.origin?host===new URL(options.origin).host:/^(?:127\.0\.0\.1|localhost):\d+$/.test(host),'INVALID_HOST',403);
      const origin=options.origin??`http://${host}`;const url=new URL(request.url ?? '/',origin);const path=url.pathname;
      if(path==='/api/replay'&&request.method==='GET'){invariant(options.allowHistoricalReplay!==false,'REPLAY_LOCAL_ONLY',404);json(JSON.parse(await readFile(resolve(assetRoot,'replay.json'),'utf8')));return;}
      if(path==='/api/invites/preview'&&request.method==='GET'){json(invitePreview(service.database,url.searchParams.get('invite')));return;}
      if(!path.startsWith('/api/')) {
        invariant(request.method==='GET','METHOD_NOT_ALLOWED',405);
        const allowed=new Set(['app.js','app-views.js','views.js','offers.js','styles.css','pwa.js','agent-ui.js','sw.js','manifest.webmanifest','offline.html']);const basename=path.slice(1);const file=pages.has(path)?'index.html':allowed.has(basename)?basename:/^\/icons\/commit-(192|512|maskable-512)\.png$/.test(path)?basename:null;invariant(file,'NOT_FOUND',404);
        if(file==='sw.js')response.setHeader('Service-Worker-Allowed','/');const data=await readFile(resolve(assetRoot,file));response.writeHead(200,{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json; charset=utf-8':'text/css; charset=utf-8'});response.end(data);return;
      }
      const cookieName=options.cookieName??'commit_demo';invariant(/^[a-z0-9_]+$/.test(cookieName),'INVALID_COOKIE_NAME',500);const cookie=new RegExp('\\b'+cookieName+'=([a-f0-9]{64})\\b').exec(request.headers.cookie ?? '')?.[1];let session=service.database.session(cookie);
      if(path==='/api/session' && request.method==='GET') {
        if(!session){session=service.database.createSession();response.setHeader('Set-Cookie',`${cookieName}=${session.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${origin.startsWith('https:')?'; Secure':''}`);}
        json(service.sessionView(session));return;
      }
      invariant(session,'SESSION_REQUIRED',401);
      if(request.method==='GET') {
        if(path==='/api/activity'){json(coordinator.communication.list(session));return;}
        if(path==='/api/agent'){json({...coordinator.authority.view(session),timeline:coordinator.timeline(session)});return;}
        if(path==='/api/updates'){json(coordinator.communication.preferences(session));return;}
        if(path==='/api/group') json(service.group(session));else if(path==='/api/constraints/me') json(service.ownConstraint(session));else if(path==='/api/catalog') json(service.catalog());else if(path==='/api/commitments/me'){invariant(service.commitments,'PAYMENTS_NOT_ENABLED',503);json(service.commitments.own(session));}else throw new ProductError('NOT_FOUND',404);return;
      }
      invariant(request.method==='POST','METHOD_NOT_ALLOWED',405);
      invariant(request.headers.origin===origin,'INVALID_ORIGIN',403);invariant(request.headers['x-csrf-token']===session.csrf_token,'INVALID_CSRF',403);
      const data=await body(request);
      if(path==='/api/activity/read')json(coordinator.communication.read(session,data.id));
      else if(path==='/api/agent/mandate')json(coordinator.authority.mandate(session,data));
      else if(path==='/api/agent/auto-finalize')json(coordinator.authority.autoFinalize(session,data));
      else if(path==='/api/updates/preferences')json(coordinator.communication.setPreferences(session,data));
      else if(path==='/api/updates/subscribe')json(coordinator.communication.subscribe(session,data));
      else if(path==='/api/updates/unsubscribe')json(coordinator.communication.unsubscribe(session));
      else if(path==='/api/groups/fresh')json(coordinator.authority.createFresh(session,data.name,data.goal,data.displayName));
      else if(path==='/api/groups/invite')json(coordinator.authority.invite(session));
      else if(path==='/api/groups/join')json(coordinator.authority.join(session,data.invite,data.displayName));
      else if(path==='/api/demo') json(service.create(session,'Vermont Ski Weekend','Book a ski weekend in Vermont with our four friends.',true));
      else if(path==='/api/offer-demo'){service.create(session,'February Summit Weekend','Book Summit Lodge for four friends on February 12–14, 2027.',true);service.offers.seed(session);json(await service.solve(session));}
      else if(path==='/api/offers/apply'){json(await service.offers.apply(session,data));}
      else if(path==='/api/offers/cleanup'){json(await service.offers.cleanup(session,data.proposalId));}
      else if(path==='/api/groups') json(service.create(session,data.name,data.goal));
      else if(path==='/api/persona') json(service.switchPersona(session,data.persona));
      else if(path==='/api/constraints/interpret') json(await service.interpret(session,data.statement));
      else if(path==='/api/constraints/confirm') json(service.confirm(session,data.draftId,data.parsed));
      else if(path==='/api/solve') json(await service.solve(session));
      else if(path==='/api/capture-sagas/finalize'){invariant(service.sagas,'PAYMENTS_NOT_ENABLED',503);const result=await service.sagas.finalize(session,data.proposalId,data.negativeTest??false);service.offers.reconcileReservations();json(result);}
      else if(path==='/api/capture-sagas/resume'){invariant(service.sagas,'PAYMENTS_NOT_ENABLED',503);const result=await service.sagas.resume(session,data.sagaId);service.offers.reconcileReservations();json(result);}
      else if(path.startsWith('/api/commitments/')){
        invariant(service.commitments,'PAYMENTS_NOT_ENABLED',503);const payments=service.commitments;
        if(path==='/api/commitments/create')json(await payments.create(session,data.proposalId));
        else if(path==='/api/commitments/authorize')json(await payments.authorize(session,data.proposalId));
        else if(path==='/api/commitments/verify')json(await payments.verify(session,data.commitmentId));
        else if(path==='/api/commitments/void')json(await payments.void(session,data.commitmentId));
        else if(path==='/api/commitments/refresh')json(await payments.refreshGroup(session));
        else throw new ProductError('NOT_FOUND',404);
      }
      else throw new ProductError('NOT_FOUND',404);
    }catch(error) {if(error instanceof ProductError) json({error:error.code},error.status);else json({error:'INTERNAL_ERROR'},500);}
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const mode=process.env.AI_MODE ?? 'openai';invariant(mode==='openai'||mode==='offline-demo','INVALID_AI_MODE',500);
  const database=new ProductDatabase(process.env.PRODUCT_DATABASE_PATH ?? resolve('data/phase-6.sqlite'));
  const ai=mode==='offline-demo'?new OfflineDemoProvider():new OpenAiProvider(process.env.OPENAI_API_KEY ?? '',process.env.OPENAI_MODEL ?? 'gpt-5.6-terra');
  const port=Number(process.env.PRODUCT_PORT ?? 3002);invariant(Number.isInteger(port)&&port>0&&port<65536,'INVALID_PORT',500);
  invariant(!process.env.PAYPAL_ENVIRONMENT||process.env.PAYPAL_ENVIRONMENT.toLowerCase()==='sandbox','SANDBOX_ONLY',500);
  const gateway=process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET?new PayPalAdapter(process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET):undefined;
  const commitments=new CommitmentService(database,gateway,process.env.PUBLIC_CONSUMER_ORIGIN??process.env.PRODUCT_ORIGIN??`http://127.0.0.1:${port}`,process.env.PAYPAL_MERCHANT_ID);
  const sagas=new CaptureSagaService(database,commitments,gateway,process.env.ENABLE_SANDBOX_SAGA_NEGATIVE_TEST==='true');
  const service=new ProductService(database,ai,mode,commitments,sagas);const communication=new CommunicationService(database,{publicKey:process.env.WEB_PUSH_VAPID_PUBLIC_KEY,privateKey:process.env.WEB_PUSH_VAPID_PRIVATE_KEY,contact:process.env.WEB_PUSH_CONTACT});const coordinator=new AgentCoordinator(database,service,communication);const stopWorker=coordinator.start();const server=createProductServer(service,undefined,{coordinator,cookieName:'commit_demo_phase6',origin:process.env.PUBLIC_CONSUMER_ORIGIN,allowHistoricalReplay:process.env.COMMIT_STAGING!=='true'});
  server.listen(port,process.env.BIND_ADDRESS??'127.0.0.1',()=>console.log(`Commit Phase 6: http://127.0.0.1:${port} | AI: ${mode} | Sandbox: ${gateway?'configured':'missing'} | durable agent worker enabled`));
  for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{stopWorker();server.close(()=>{database.close();process.exit(0);});});
}
