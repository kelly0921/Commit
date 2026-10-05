import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { designFixtures } from './design-fixtures.mjs';
const fixtures=await designFixtures();
const names=Object.keys(fixtures.scenarios);
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if(req.method!=='GET'){res.writeHead(405);res.end('Read-only design preview');return;}
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/styles.css'){res.writeHead(200,{'content-type':'text/css'});res.end(await readFile('product-public/styles.css'));return;}
  const name=path==='/'?'landing':path.replace('/review/','');
  if(!names.includes(name)){res.writeHead(404);res.end('Design view not found');return;}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Commit design review · ${name}</title><link rel="stylesheet" href="/styles.css"></head><body><div class="review-banner">Read-only design preview · simulated statuses · no payment actions <a href="/review/landing">Home</a></div>${fixtures.render(name)}</body></html>`);
});
server.listen(3003,'127.0.0.1',()=>console.log('Read-only design review: http://localhost:3003/review/landing | no payment adapter'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
