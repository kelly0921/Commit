import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {FixtureRentalProvider} from './fixtures.js';
import {assessDiscovery,RentalError,requireRental,stayRequest} from './discovery.js';

// Local, fictional, read-only lab. No product DB, identity, coordinator or live provider.
export function createRentalPreviewServer(){
  const provider=new FixtureRentalProvider();
  const assets=new Map([['/','index.html'],['/app.js','app.js'],['/styles.css','styles.css']]);
  return createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json=(v:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(v));};
    try{
      requireRental(/^127\.0\.0\.1:\d+$/.test(req.headers.host??''),'INVALID_HOST');
      const origin='http://'+req.headers.host,url=new URL(req.url??'/',origin);
      if(req.method==='GET'&&assets.has(url.pathname)){
        const filename=assets.get(url.pathname)!;const data=await readFile(fileURLToPath(new URL('../../rental-preview-public/'+filename,import.meta.url)));
        res.writeHead(200,{'Content-Type':filename.endsWith('.html')?'text/html; charset=utf-8':filename.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(data);return;
      }
      requireRental(req.method==='POST'&&url.pathname==='/api/preview','NOT_FOUND');
      requireRental(req.headers.origin===origin,'INVALID_ORIGIN');
      requireRental(req.headers['content-type']==='application/json','JSON_REQUIRED');
      let size=0;const chunks:Buffer[]=[];for await(const c of req){size+=c.length;requireRental(size<=2048,'BODY_TOO_LARGE');chunks.push(c);}
      let input:Record<string,unknown>;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new RentalError('INVALID_JSON');}
      requireRental(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>['stay','maximumShareCents'].includes(k)),'INVALID_PREVIEW_INPUT');
      const stay=stayRequest(input.stay),max=input.maximumShareCents??null;
      requireRental(max===null||typeof max==='number'&&Number.isSafeInteger(max)&&max>=0&&max<=10000000,'INVALID_EXPLORATION_LIMIT');
      const homes=await provider.searchHomes(stay),options=[];
      for(const home of homes){const quote=await provider.previewStayQuote(home.id,stay);options.push({home,quote,assessment:assessDiscovery(home,quote,max as number|null)});}
      json({source:'FICTIONAL',stay,options,maximumSaved:false,groupFitVerified:false,commitmentEligible:false});
    }catch(error){json({error:error instanceof RentalError?error.code:'PREVIEW_UNAVAILABLE'},error instanceof RentalError&&error.code==='NOT_FOUND'?404:400);}
  });
}
