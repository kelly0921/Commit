// Isolated real-component gallery; no .env, PayPal adapter or runtime database.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {designFixtures} from './design-fixtures.mjs';
const fixtures=await designFixtures();
await build({entryPoints:['scripts/final-review-preview.tsx'],bundle:true,format:'esm',outfile:'data/final-review-preview.js',logLevel:'silent'});
const offer={id:'visual-only-draft',version:1,status:'DRAFT',discountPercent:8,minimumGroupSize:4,eligiblePackageIds:['summit-lodge','slopeside','pine-retreat'],eligibleStartDate:'2027-02-05',eligibleEndDate:'2027-02-21',validFrom:'2026-10-03T17:51:52Z',validUntil:'2026-10-04T17:51:52Z',maxRedemptions:20,redemptions:0,impact:{newlyFeasibleGroups:9,incrementalGmvCents:1253040,discountCostCents:108960}};
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
 if(req.method!=='GET'){res.writeHead(405);res.end('Read-only display harness');return;}
 const path=new URL(req.url,'http://localhost').pathname;
 const assets={'/styles.css':['product-public/styles.css','text/css'],'/merchant.css':['merchant-public/merchant.css','text/css'],'/merchant-review.js':['data/final-review-preview.js','text/javascript']};
 if(assets[path]){res.writeHead(200,{'content-type':assets[path][1]});res.end(await readFile(assets[path][0]));return;}
 if(path==='/api/merchant/offers'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({offers:[offer]}));return;}
 const merchant=path==='/review/merchant-draft';const name=path==='/'?'landing':path.replace('/review/','');
 if(!merchant&&!fixtures.scenarios[name]){res.writeHead(404);res.end('Design view not found');return;}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
 const content=merchant?'<header class="merchant-header"><a class="wordmark" href="/review/landing">Commit<span>↗</span></a><span class="workspace-label">MERCHANT REVIEW · READ ONLY</span></header><main><p class="eyebrow">Synthetic display fixture · no publication authority</p><h1>Unpublished offer review</h1><div id="merchant-review"></div></main><script type="module" src="/merchant-review.js"></script>':fixtures.render(name);
 res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Commit read-only review · ${name}</title><link rel="stylesheet" href="${merchant?'/merchant.css':'/styles.css'}"></head><body><div class="${merchant?'inline-error':'review-banner'}">Read-only design preview · simulated statuses · no payment/publication actions</div>${content}</body></html>`);
});
server.listen(3003,'127.0.0.1',()=>console.log('Read-only real-component review: http://localhost:3003/review/group'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
