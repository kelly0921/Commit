import {createServer,request as upstreamRequest} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import assert from 'node:assert/strict';
import {CONSUMER_COOKIE,MERCHANT_COOKIE} from './config.mjs';

const HOP=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
function filtered(headers){
  const connection=String(headers.connection??'').toLowerCase().split(',').map(s=>s.trim());
  return Object.fromEntries(Object.entries(headers).filter(([key])=>!HOP.has(key)&&!connection.includes(key)&&key!=='forwarded'&&!key.startsWith('x-forwarded-')));
}
function digest(value){return createHash('sha256').update(value).digest();}
export function publicRoute(target){
  assert.ok(typeof target==='string'&&target.startsWith('/')&&!target.startsWith('//')&&!target.includes('#'));
  const rawPath=target.split('?')[0],parsed=new URL(target,'https://commit.invalid');
  assert.ok(!rawPath.includes('\\')&&!/%(?:2f|5c|2e)/i.test(rawPath)&&parsed.pathname===rawPath,'Ambiguous path');
  const merchant=rawPath==='/merchant'||rawPath.startsWith('/merchant/')||['/merchant.js','/merchant.css','/api/merchant'].includes(rawPath)||rawPath.startsWith('/api/merchant/');
  const mapped=rawPath==='/merchant'||rawPath==='/merchant/'?'/merchant/group-demand':rawPath;
  return {surface:merchant?'merchant':'consumer',path:mapped+target.slice(rawPath.length)};
}
export function createGateway(config,{health,available}){
  assert.equal(config.consumerOrigin,config.merchantOrigin,'One canonical public origin required');
  const canonicalHost=new URL(config.consumerOrigin).host;
  const credential=config.accessEnabled?digest(config.accessUser+':'+config.accessPassword):undefined;
  const server=createServer(async(req,res)=>{
    const send=(status,error)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(JSON.stringify(error));};
    const host=req.headers.host;
    const hosts=req.rawHeaders.filter((_,i)=>i%2===0).filter(h=>h.toLowerCase()==='host');
    if(hosts.length!==1||host!==canonicalHost){send(421,{error:'UNKNOWN_HOST'});return;}
    let route;try{route=publicRoute(req.url);}catch{send(400,{error:'INVALID_TARGET'});return;}
    if(req.url==='/health'&&(req.method==='GET'||req.method==='HEAD')){
      const ok=available()&&await health();send(ok?200:503,{status:ok?'ok':'unavailable'});return;
    }
    if(config.accessEnabled){
      const encoded=/^Basic ([A-Za-z0-9+/]+=*)$/.exec(req.headers.authorization??'')?.[1];
      const valid=encoded&&timingSafeEqual(digest(Buffer.from(encoded,'base64').toString('utf8')),credential);
      if(!valid){res.setHeader('www-authenticate','Basic realm="Commit staging", charset="UTF-8"');send(401,{error:'STAGING_ACCESS_REQUIRED'});return;}
    }
    if(!available()){send(503,{error:'STAGING_UNAVAILABLE'});return;}
    const headers=filtered(req.headers);delete headers.authorization;
    // Forward only this surface's exact cookie name. Shared origin is not a role grant.
    const name=route.surface==='merchant'?MERCHANT_COOKIE:CONSUMER_COOKIE;
    const cookies=String(headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.slice(0,s.indexOf('='))===name);
    if(cookies.length>1){send(400,{error:'AMBIGUOUS_SESSION_COOKIE'});return;}
    if(cookies.length)headers.cookie=cookies[0];else delete headers.cookie;
    // Only fixed paths select a runtime. Client parameters and forwarded headers
    // never select a surface or establish public authority.
    headers.host=host;headers['x-forwarded-host']=host;headers['x-forwarded-proto']='https';
    const upstream=upstreamRequest({hostname:'127.0.0.1',port:route.surface==='merchant'?config.merchantPort:config.consumerPort,method:req.method,path:route.path,headers,timeout:90000},reply=>{
      res.writeHead(reply.statusCode??502,filtered(reply.headers));reply.pipe(res);
      reply.on('error',()=>res.destroy());
    });
    upstream.on('timeout',()=>upstream.destroy());
    upstream.on('error',()=>{if(!res.headersSent)send(502,{error:'UPSTREAM_UNAVAILABLE'});else res.destroy();});
    req.on('aborted',()=>upstream.destroy());res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});
    req.pipe(upstream); // No retries, body rewriting, API merging or response logging.
  });
  server.headersTimeout=30000;server.requestTimeout=95000;
  server.on('upgrade',(_req,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  return server;
}
