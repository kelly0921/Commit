import {createServer,request as upstreamRequest} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';

const HOP=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
function filtered(headers){
  const connection=String(headers.connection??'').toLowerCase().split(',').map(s=>s.trim());
  return Object.fromEntries(Object.entries(headers).filter(([key])=>!HOP.has(key)&&!connection.includes(key)&&key!=='forwarded'&&!key.startsWith('x-forwarded-')));
}
function digest(value){return createHash('sha256').update(value).digest();}
export function createGateway(config,{health,available}){
  const routes=new Map([[new URL(config.consumerOrigin).host,config.consumerPort],[new URL(config.merchantOrigin).host,config.merchantPort]]);
  const credential=digest(config.accessUser+':'+config.accessPassword);
  const server=createServer(async(req,res)=>{
    const send=(status,error)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(JSON.stringify(error));};
    const host=req.headers.host;
    const hosts=req.rawHeaders.filter((_,i)=>i%2===0).filter(h=>h.toLowerCase()==='host');
    if(hosts.length!==1||!host||(!routes.has(host)&&host!==config.platformHost)){send(421,{error:'UNKNOWN_HOST'});return;}
    if(!req.url?.startsWith('/')||req.url.startsWith('//')){send(400,{error:'INVALID_TARGET'});return;}
    if(req.url==='/health'&&(req.method==='GET'||req.method==='HEAD')){
      const ok=available()&&await health();send(ok?200:503,{status:ok?'ok':'unavailable'});return;
    }
    if(!routes.has(host)){send(421,{error:'UNKNOWN_HOST'});return;}
    const auth=req.headers.authorization??'';
    const encoded=/^Basic ([A-Za-z0-9+/]+=*)$/.exec(auth)?.[1];
    const valid=encoded&&timingSafeEqual(digest(Buffer.from(encoded,'base64').toString('utf8')),credential);
    if(!valid){res.setHeader('www-authenticate','Basic realm="Commit staging", charset="UTF-8"');send(401,{error:'STAGING_ACCESS_REQUIRED'});return;}
    if(!available()){send(503,{error:'STAGING_UNAVAILABLE'});return;}
    const headers=filtered(req.headers);delete headers.authorization;
    // Public authority comes only from the exact configured Host/origin. Incoming
    // Forwarded and X-Forwarded-* values never select a surface or financial URL.
    headers.host=host;headers['x-forwarded-host']=host;headers['x-forwarded-proto']='https';
    const upstream=upstreamRequest({hostname:'127.0.0.1',port:routes.get(host),method:req.method,path:req.url,headers,timeout:90000},reply=>{
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
