// Current code + deterministic gateway only. No .env or real provider.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {ProductDatabase} from '../src/product/db.ts';
import {ProductService} from '../src/product/service.ts';
import {OfflineDemoProvider} from '../src/product/ai.ts';
import {CommitmentService} from '../src/product/commitments.ts';
import {AgentCoordinator} from '../src/product/agents.ts';
import {PayPalError} from '../src/model.ts';
import {OfferGateway} from '../tests/offer-gateway.ts';
import {createAppViews} from '../product-public/app-views.js';
const receipts=[];
for(const scenario of ['UNCONFIRMED','AMBIGUOUS_THEN_VERIFIED']){
 const db=new ProductDatabase(':memory:'),gateway=new OfferGateway(),keys=[];const original=gateway.authorizeOrder.bind(gateway);let once=true;
 gateway.authorizeOrder=async(id,key)=>{keys.push(key);if(scenario==='UNCONFIRMED')throw new PayPalError('PAYPAL_NETWORK_OR_RESPONSE_ERROR');const result=await original(id,key);if(once){once=false;throw new PayPalError('PAYPAL_NETWORK_OR_RESPONSE_ERROR');}return result;};
 const payments=new CommitmentService(db,gateway,'http://127.0.0.1:3040','MERCHANT'),product=new ProductService(db,new OfflineDemoProvider(),'offline-demo',payments),session=db.createSession(),agent=new AgentCoordinator(db,product);try{
  product.create(session,'Fake uncertainty acceptance','Four synthetic friends ski together.',true);await product.solve(session);const proposal=product.group(session).proposal.id;await payments.create(session,proposal);const c=payments.rows(proposal).find(c=>c.user_id==='kelly');gateway.orders.get(c.paypal_order_id).status='APPROVED';const observations=[];
  for(let i=0;i<(scenario==='UNCONFIRMED'?7:2);i++){
   const watch=db.get('SELECT source_hash FROM agent_watch_state WHERE id=?',`approval:${c.id}`);if(watch){const state=JSON.parse(watch.source_hash);state.nextAt=0;db.run('UPDATE agent_watch_state SET source_hash=? WHERE id=?',JSON.stringify(state),`approval:${c.id}`);}await agent.drain();
   const ledger=payments.own(session),group=product.group(session),html=createAppViews({session:product.sessionView(session),path:'/commit'}).commitPage(group,ledger);const heading=/<h1[^>]*>(.*?)<\/h1>/.exec(html)?.[1];
   observations.push({attempt:i+1,state:ledger.current.state,reconciliation:ledger.current.reconciliation,committedCount:group.committedCount,heading,verified:!!ledger.current.verifiedAt});
   if(scenario==='UNCONFIRMED'||i===0){assert.notEqual(ledger.current.state,'AUTHORIZED');assert.equal(group.committedCount,0);assert.doesNotMatch(html,/You’re committed/);assert.match(heading,/Checking your approval|We need your attention/);}
  }
  assert.equal(new Set(keys).size,1,'Durable authorization key must be reused');if(scenario==='UNCONFIRMED'){assert.equal(keys.length,5);assert.equal(observations.at(-1).reconciliation,'ATTENTION');assert.equal(db.all("SELECT id FROM activity_events WHERE dedupe_key LIKE 'approval-attention:%'").length,1);}else{assert.equal(keys.length,1);assert.equal(observations.at(-1).state,'AUTHORIZED');assert.equal(observations.at(-1).verified,true);}
  receipts.push({scenario,gateway:'deterministic fake',realProviderCalls:0,authorizationPostAttempts:keys.length,distinctRequestKeys:new Set(keys).size,observations});
 }finally{db.close();}
}
writeFileSync('docs/assets/phase-6-1a/failure-evidence.json',JSON.stringify({at:new Date().toISOString(),receipts},null,2)+'\n');console.log('PASS: uncertainty never commits; bounded private attention; ambiguous resource adopted only after GET verification. No real failure injected.');
