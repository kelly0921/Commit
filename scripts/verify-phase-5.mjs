// Independent provider GETs only. Never creates, authorizes, captures, voids or refunds.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PayPalAdapter} from '../src/paypal.ts';
const db=new DatabaseSync(process.env.PRODUCT_DATABASE_PATH??resolve('data/commit.sqlite'),{readOnly:true});
try{
 const groupId=process.argv[2]??db.prepare("SELECT c.group_id FROM group_catalogs c JOIN groups g ON g.id=c.group_id WHERE c.fixture='phase-5-february' ORDER BY g.created_at DESC LIMIT 1").get()?.group_id;
 assert.ok(typeof groupId==='string'&&/^[a-f0-9-]{36}$/.test(groupId),'Phase 5 group is required');
 const goal=db.prepare('SELECT * FROM purchase_goals WHERE group_id=?').get(groupId);
 const p=db.prepare('SELECT * FROM proposals WHERE goal_id=? AND revision=?').get(goal.id,goal.revision);
 const result=JSON.parse(p.result_json),applied=db.prepare('SELECT * FROM offer_applications WHERE proposal_id=?').get(p.id);
 const rows=db.prepare('SELECT c.*,a.user_id,a.share_cents FROM commitments c JOIN proposal_allocations a ON a.id=c.allocation_id WHERE a.proposal_id=? ORDER BY a.user_id').all(p.id);
 const gateway=new PayPalAdapter(process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET),facts=[];
 for(const c of rows){
  const envelope=JSON.parse(c.approved_envelope_json);assert.equal(envelope.proposalId,p.id);assert.equal(envelope.proposalVersion,p.revision);assert.equal(envelope.amountCeilingCents,c.share_cents);
  if(applied)assert.equal(envelope.packageTerms.offer.id,applied.offer_id);
  if(!c.paypal_order_id){facts.push({participant:c.user_id,amountCents:c.share_cents,state:c.state,orderId:null,authorizationId:null,captureId:null});continue;}
  const o=(await gateway.getOrder(c.paypal_order_id)).resource;assert.equal(o.id,c.paypal_order_id);assert.equal(o.intent,'AUTHORIZE');assert.equal(o.referenceId,c.id);assert.equal(o.customId,c.id);assert.equal(o.unitCount,1);assert.equal(o.amount.value,(c.share_cents/100).toFixed(2));assert.equal(o.amount.currencyCode,'USD');if(c.merchant_id)assert.equal(o.merchantId,c.merchant_id);
  let auth=null,cap=null;
  if(c.paypal_authorization_id){auth=(await gateway.getAuthorization(c.paypal_authorization_id)).resource;assert.equal(auth.id,c.paypal_authorization_id);assert.ok(o.authorizations.some(a=>a.id===auth.id));assert.equal(auth.amount.value,(c.share_cents/100).toFixed(2));assert.equal(auth.amount.currencyCode,'USD');assert.ok(['CREATED','CAPTURED'].includes(auth.status));}
  if(c.paypal_capture_id){cap=(await gateway.getCapture(c.paypal_capture_id)).resource;assert.equal(cap.status,'COMPLETED');assert.equal(cap.amount.value,(c.share_cents/100).toFixed(2));assert.equal(cap.amount.currencyCode,'USD');assert.equal(cap.authorizationId,auth.id);assert.equal(cap.orderId,o.id);assert.equal(cap.finalCapture,true);}
  facts.push({participant:c.user_id,amountCents:c.share_cents,state:c.state,orderId:o.id,orderStatus:o.status,authorizationId:auth?.id??null,authorizationStatus:auth?.status??null,captureId:cap?.id??null,captureStatus:cap?.status??null});
 }
 const old=[];
 if(applied)for(const c of db.prepare('SELECT c.*,a.user_id FROM commitments c JOIN proposal_allocations a ON a.id=c.allocation_id WHERE a.proposal_id=?').all(applied.previous_proposal_id)){
  assert.ok(['STALE','VOIDED'].includes(c.state));if(c.paypal_authorization_id){const auth=(await gateway.getAuthorization(c.paypal_authorization_id)).resource;assert.equal(auth.status,'VOIDED');old.push({participant:c.user_id,state:c.state,authorizationId:auth.id,authorizationStatus:auth.status});}else old.push({participant:c.user_id,state:c.state,authorizationId:null});
 }
 for(const key of ['orderId','authorizationId','captureId']){const ids=facts.map(f=>f[key]).filter(Boolean);assert.equal(new Set(ids).size,ids.length,'Each participant requires a distinct provider resource');}
 const saga=db.prepare('SELECT * FROM capture_sagas WHERE proposal_id=?').get(p.id);
 const steps=saga?db.prepare('SELECT * FROM financial_steps WHERE saga_id=? ORDER BY position,operation').all(saga.id):[];
 const preflight=saga?db.prepare("SELECT created_at FROM audit_events WHERE entity_id=? AND action='PREFLIGHT_PASSED'").get(saga.id):null;
 if(saga?.state==='CONFIRMED'){
  assert.equal(facts.filter(f=>f.captureStatus==='COMPLETED'&&f.authorizationStatus==='CAPTURED'&&f.state==='CAPTURED').length,4);
  assert.equal(facts.reduce((s,f)=>s+f.amountCents,0),result.selected.totalCents);assert.equal(p.state,'CONFIRMED');assert.equal(goal.state,'CONFIRMED');assert.equal(applied.state,'CONSUMED');assert.ok(saga.frozen_at&&preflight);
  const snapshot=JSON.parse(saga.snapshot_json);assert.equal(snapshot.totalCents,result.selected.totalCents);assert.equal(saga.proposal_version,p.revision);assert.equal(snapshot.fingerprint,p.commitment_fingerprint);
  for(const f of facts){const c=rows.find(r=>r.user_id===f.participant),s=steps.find(s=>s.commitment_id===c.id&&s.operation==='CAPTURE'),m=snapshot.members.find(m=>m.userId===f.participant);assert.equal(s.state,'SUCCEEDED');assert.ok(s.verified_at);assert.equal(s.capture_id,f.captureId);assert.equal(s.amount_cents,f.amountCents);assert.equal(m.authorizationId,f.authorizationId);assert.equal(m.envelope,c.approved_envelope_json);}
  assert.equal(steps.filter(s=>s.operation!=='CAPTURE'&&s.state!=='PENDING').length,0);
 }
 const stage=saga?.state??(p.financial_state==='READY_TO_CAPTURE'?'READY_TO_CAPTURE':'AWAITING_APPROVALS');
 if(stage==='READY_TO_CAPTURE'){assert.equal(facts.filter(f=>f.authorizationStatus==='CREATED'&&f.state==='AUTHORIZED').length,4);assert.ok(rows.every(c=>c.verified_at&&Date.now()-Date.parse(c.verified_at)<=300000&&!c.pending_operation));}
 const providerGetCount=facts.reduce((n,f)=>n+Number(!!f.orderId)+Number(!!f.authorizationId)+Number(!!f.captureId),0)+old.filter(c=>c.authorizationId).length;
 const evidence={timestamp:new Date().toISOString(),groupId,proposalId:p.id,proposalVersion:p.revision,offerId:applied?.offer_id??null,totalCents:result.selected.totalCents,stage,localFinancialState:p.financial_state,independentProviderGets:providerGetCount>0,providerGetCount,resources:facts,previousCommitments:old,sagaId:saga?.id??null,preflightPassedAt:preflight?.created_at??null,frozenAt:saga?.frozen_at??null,captureSteps:steps.filter(s=>s.operation==='CAPTURE').map(s=>({position:s.position,state:s.state,amountCents:s.amount_cents,captureId:s.capture_id,verifiedAt:s.verified_at}))};
 let history=[];try{history=JSON.parse(readFileSync('docs/phase-5-sandbox-evidence.json','utf8')).checks??[];}catch{}
 history.push(evidence);writeFileSync('docs/phase-5-sandbox-evidence.json',JSON.stringify({checks:history},null,2)+'\n');
 console.log(JSON.stringify(evidence,null,2));
}finally{db.close();}
