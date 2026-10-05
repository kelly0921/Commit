// Isolated live acceptance harness. Current application code, untouched UI.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,appendFileSync} from 'node:fs';
import {ProductDatabase} from '../src/product/db.ts';
import {ProductService} from '../src/product/service.ts';
import {OfflineDemoProvider} from '../src/product/ai.ts';
import {CommitmentService} from '../src/product/commitments.ts';
import {CaptureSagaService} from '../src/product/capture-saga.ts';
import {AgentCoordinator} from '../src/product/agents.ts';
import {createProductServer} from '../src/product/server.ts';
import {PayPalAdapter} from '../src/paypal.ts';
const dir='data/phase-6-1a',path=dir+'/live.sqlite',fresh=process.argv.includes('--fresh');
assert.equal((process.env.PAYPAL_ENVIRONMENT??'sandbox').toLowerCase(),'sandbox');assert.ok(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET);
if(fresh)assert.ok(!existsSync(path),'Refuse overwrite of a live acceptance ledger');else assert.ok(existsSync(path),'Prepare fresh ledger first');
mkdirSync(dir,{recursive:true});mkdirSync('docs/assets/phase-6-1a',{recursive:true});
const db=new ProductDatabase(path);
if(fresh){
 // Fictional $40 group/$10 share catalog exists only in this new test DB.
 for(const row of db.all('SELECT id,data_json FROM merchant_packages')){const p=JSON.parse(row.data_json);p.available=p.id==='summit-lodge';p.merchantBoundaries.availableInventory=p.available?2:0;
  if(p.available){p.name='Sandbox verification package';p.description='Fictional four-person payment test: $10 USD per share; no reservation.';p.sharedBaseCostCents=4000;for(const k of ['liftTicketPriceCents','rentalPriceCents','bedSupplementCents','parkingFeeCents'])p[k]=0;p.merchantBoundaries.minimumTotalCents=4000;p.merchantBoundaries.costCents=2800;p.merchantBoundaries.listSharedBaseCostCents=4000;}
  db.run('UPDATE merchant_packages SET data_json=? WHERE id=?',JSON.stringify(p),row.id);
 }
}
const base=new PayPalAdapter(process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET);
const gateway=new Proxy(base,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return async(...args)=>{const at=new Date().toISOString();try{const result=await value.apply(target,args);appendFileSync('docs/assets/phase-6-1a/provider-calls.jsonl',JSON.stringify({at,completedAt:new Date().toISOString(),path:'current-consumer-worker',operation:key,resourceId:result.resource?.id??args[0],state:result.resource?.status??null,httpStatus:result.httpStatus,debugId:result.debugId,requestKey:['createAuthorizationOrder','authorizeOrder','voidAuthorization'].includes(key)?args[1]:undefined})+'\n');return result;}catch(error){appendFileSync('docs/assets/phase-6-1a/provider-calls.jsonl',JSON.stringify({at,operation:key,error:error.code??'UNKNOWN'})+'\n');throw error;}};}});
const payments=new CommitmentService(db,gateway,'http://127.0.0.1:3040',process.env.PAYPAL_MERCHANT_ID),sagas=new CaptureSagaService(db,payments,gateway),service=new ProductService(db,new OfflineDemoProvider(),'offline-demo',payments,sagas),coordinator=new AgentCoordinator(db,service),stop=coordinator.start();
const server=createProductServer(service,undefined,{coordinator,cookieName:'commit_phase6_1a'});
server.on('request',req=>appendFileSync('docs/assets/phase-6-1a/browser-requests.jsonl',JSON.stringify({at:new Date().toISOString(),method:req.method,path:new URL(req.url,'http://127.0.0.1:3040').pathname})+'\n'));
server.listen(3040,'127.0.0.1',()=>{appendFileSync('docs/assets/phase-6-1a/server-lifecycle.jsonl',JSON.stringify({at:new Date().toISOString(),action:'START',fresh,pid:process.pid})+'\n');console.log('Current consumer acceptance: http://127.0.0.1:3040/demo | isolated $10 shares | Sandbox only');});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stop();server.close(()=>{appendFileSync('docs/assets/phase-6-1a/server-lifecycle.jsonl',JSON.stringify({at:new Date().toISOString(),action:'STOP',pid:process.pid})+'\n');db.close();process.exit(0);});});
