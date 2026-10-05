// Read-only acceptance checks against this task's fresh ledgers and receipts.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const root='docs/assets/phase-6-1a',read=p=>JSON.parse(readFileSync(p,'utf8'));
const lines=p=>readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const evidence=read(root+'/live-evidence.json'),calls=lines(root+'/provider-calls.jsonl'),requests=lines(root+'/browser-requests.jsonl'),lifecycle=lines(root+'/server-lifecycle.jsonl');
const obs=label=>{const value=evidence.observations.find(o=>o.label===label);assert.ok(value,label+' missing');return value;};
const first=obs('void-verified'),second=obs('capture-verified'),paused=obs('capture-approved-server-stopped');
assert.equal(first.after.authorization.status,'VOIDED');assert.equal(first.after.capture,null);
assert.equal(second.after.authorization.status,'CAPTURED');assert.equal(second.after.capture.status,'COMPLETED');assert.equal(second.after.capture.finalCapture,true);
assert.equal(paused.commitment.localState,'ORDER_CREATED');assert.equal(paused.before.order.status,'APPROVED');assert.equal(paused.before.authorization,null);
assert.notEqual(first.commitment.orderId,second.commitment.orderId);
for(const [p,h] of Object.entries(evidence.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'),h,p+' changed');
const db=new DatabaseSync('data/phase-6-1a/live.sqlite',{readOnly:true});
const receipts=[];
try{
 assert.equal(db.prepare('SELECT count(*) n FROM commitments WHERE paypal_order_id IS NOT NULL').get().n,2);
 assert.equal(db.prepare('SELECT count(*) n FROM capture_sagas').get().n,0);
 assert.equal(db.prepare('SELECT count(*) n FROM merchant_offer_versions').get().n,0);
 for(const o of [first,second]){
  const c=db.prepare('SELECT * FROM commitments WHERE id=?').get(o.commitment.id);
  assert.equal(c.paypal_order_id,o.commitment.orderId);assert.equal(c.paypal_authorization_id,o.before.authorization.id);assert.equal(c.authorized_ceiling_cents,1000);
  assert.equal(createHash('sha256').update(c.approved_envelope_json).digest('hex'),o.commitment.approvedEnvelopeHash);
  const created=calls.filter(x=>x.operation==='createAuthorizationOrder'&&x.resourceId===c.paypal_order_id);
  const authorized=calls.filter(x=>x.operation==='authorizeOrder'&&x.resourceId===c.paypal_order_id);
  assert.equal(created.length,1);assert.equal(authorized.length,1);
  const approval=calls.find(x=>x.operation==='getOrder'&&x.resourceId===c.paypal_order_id&&x.state==='APPROVED');assert.ok(approval);
  assert.ok(Date.parse(approval.completedAt)<=Date.parse(authorized[0].at));
  const verified=calls.find(x=>x.operation==='getAuthorization'&&x.resourceId===c.paypal_authorization_id&&x.state==='CREATED');assert.ok(verified);
  const audit=db.prepare("SELECT created_at FROM audit_events WHERE entity_id=? AND action='PAYPAL_AUTHORIZED' ORDER BY created_at LIMIT 1").get(c.id);assert.ok(audit);
  assert.ok(Date.parse(audit.created_at)>=Date.parse(verified.completedAt));
  assert.equal(c.state,o===first?'VOIDED':'AUTHORIZED');
  receipts.push({commitmentId:c.id,orderId:c.paypal_order_id,authorizationId:c.paypal_authorization_id,amount:'10.00',currency:'USD',successfulOrderCreations:created.length,authorizationPosts:authorized.length,providerApprovalObservedAt:approval.completedAt,providerAuthorizationPostCompletedAt:authorized[0].completedAt,providerAuthorizationGetVerifiedAt:verified.completedAt,firstLocalAuthorizedAt:audit.created_at,verificationAfterApprovalMs:Date.parse(verified.completedAt)-Date.parse(approval.completedAt),finalProductLedgerState:c.state});
 }
 const stop=lifecycle.find(x=>x.label==='stopped-before-second-approval');assert.ok(stop);
 const restart=lifecycle.find(x=>x.action==='START'&&Date.parse(x.at)>Date.parse(paused.at));assert.ok(restart);assert.equal(restart.fresh,false);
 receipts[1].restartAt=restart.at;receipts[1].restartToVerifiedMs=Date.parse(receipts[1].providerAuthorizationGetVerifiedAt)-Date.parse(restart.at);
}finally{db.close();}
const manual=requests.filter(r=>r.method==='POST'&&/^\/api\/commitments\/(authorize|verify|refresh)$/.test(r.path));assert.equal(manual.length,0);
assert.equal(calls.filter(x=>['captureAuthorization','refundCapture'].includes(x.operation)).length,0);
const ledger=read('data/phase-6-1a/capture-test/payments.json');assert.equal(ledger.payments.length,1);const p=ledger.payments[0];assert.equal(p.state,'CAPTURED');assert.equal(p.captureStatus,'COMPLETED');assert.equal(p.paypalCaptureId,second.after.capture.id);
assert.equal(p.events.filter(e=>e.operation==='capture').length,1);assert.equal(p.events.filter(e=>['create','authorize'].includes(e.operation)).length,0);
const result={at:new Date().toISOString(),result:'PASS',receipts,normalManualCompletionPosts:manual.length,workerCaptureOrRefundCalls:0,successfulCapturePosts:1,captureId:p.paypalCaptureId,captureStatus:p.captureStatus,currentProductSourceUnchanged:true,scope:'Two $10 consumer approval checks; second capture uses unchanged Phase 1 test capture path. Four-person saga not rerun.',reconciliationSemantics:'GET approved order, idempotent authorize POST, GET order and authorization; worker is not strictly read-only.'};
writeFileSync(root+'/live-assertions.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
