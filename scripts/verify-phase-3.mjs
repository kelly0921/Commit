import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ProductDatabase} from '../src/product/db.ts';
import {CommitmentService} from '../src/product/commitments.ts';
import {PayPalAdapter} from '../src/paypal.ts';
const [proposalId,label,stage]=process.argv.slice(2);
assert.ok(proposalId&&label&&['prepared','partial','ready','confirmed','compensated'].includes(stage),'proposal ID, label and valid stage required');
const sha=v=>createHash('sha256').update(v).digest('hex');
const path='docs/phase-3-sandbox-evidence.json';const evidence=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{historicalHashes:Object.fromEntries(['docs/phase-2-sandbox-evidence.json','docs/phase-2-1-sandbox-evidence.json'].map(p=>[p,sha(readFileSync(p))])),snapshots:[]};
for(const [p,digest] of Object.entries(evidence.historicalHashes))assert.equal(sha(readFileSync(p)),digest,'historical evidence changed');
assert.ok(!evidence.snapshots.some(x=>x.label===label),'evidence label already recorded');
assert.ok(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET,'local Sandbox configuration required');
const db=new ProductDatabase(process.env.PRODUCT_DATABASE_PATH??'data/commit.sqlite'),gateway=new PayPalAdapter(process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET),payments=new CommitmentService(db,gateway,'http://127.0.0.1:3002',process.env.PAYPAL_MERCHANT_ID);
const cents=m=>{assert.equal(m.currencyCode,'USD');assert.match(m.value,/^\d+\.\d{2}$/);return Number(m.value.replace('.',''));};
try{
const p=db.get('SELECT * FROM proposals WHERE id=?',proposalId);assert.ok(p);const goal=db.get('SELECT * FROM purchase_goals WHERE id=?',p.goal_id),result=JSON.parse(p.result_json),rows=payments.rows(p.id),saga=db.get('SELECT * FROM capture_sagas WHERE proposal_id=?',p.id),steps=saga?db.all('SELECT * FROM financial_steps WHERE saga_id=? ORDER BY position,operation',saga.id):[];
assert.equal(result.selected.packageId,'summit-lodge');assert.equal(result.selected.totalCents,151500);assert.equal(rows.length,4);
assert.deepEqual(Object.fromEntries(rows.map(c=>[c.user_id,c.share_cents])),{alex:33500,kelly:39000,lawrence:39500,sarah:39500});
assert.equal(p.revision,goal.revision);assert.equal(payments.fingerprint(p),p.commitment_fingerprint);
const resources=[];
for(const userId of ['kelly','lawrence','sarah','alex']){
const c=rows.find(c=>c.user_id===userId);assert.equal(c.proposal_version,p.revision);assert.equal(c.authorized_ceiling_cents,c.share_cents);const envelope=JSON.parse(c.approved_envelope_json);assert.equal(envelope.proposalId,p.id);assert.equal(envelope.amountCeilingCents,c.share_cents);assert.equal(envelope.currency,'USD');
for(const previous of evidence.snapshots.flatMap(x=>x.resources)){if(previous.commitmentId===c.id)assert.equal(previous.envelopeHash,sha(c.approved_envelope_json));else {if(c.paypal_authorization_id)assert.notEqual(previous.authorizationId,c.paypal_authorization_id);if(c.paypal_order_id)assert.notEqual(previous.orderId,c.paypal_order_id);}}
const record={userId,commitmentId:c.id,shareCents:c.share_cents,localState:c.state,envelopeHash:sha(c.approved_envelope_json),orderId:c.paypal_order_id,authorizationId:c.paypal_authorization_id,captureId:c.paypal_capture_id};
if(c.paypal_order_id){const order=(await gateway.getOrder(c.paypal_order_id)).resource;assert.equal(order.id,c.paypal_order_id);assert.equal(order.intent,'AUTHORIZE');assert.equal(order.unitCount,1);assert.equal(order.referenceId,c.id);assert.equal(order.customId,c.id);assert.equal(cents(order.amount),c.share_cents);assert.equal(order.merchantId,c.merchant_id);record.order={...order,approvalUrl:undefined};
if(c.paypal_authorization_id){const a=(await gateway.getAuthorization(c.paypal_authorization_id)).resource;assert.equal(a.id,c.paypal_authorization_id);assert.equal(cents(a.amount),c.share_cents);assert.equal(order.authorizations[0].id,a.id);record.authorization=a;
if(stage==='ready')assert.equal(a.status,'CREATED');
const capStep=steps.find(s=>s.commitment_id===c.id&&s.operation==='CAPTURE'),refundStep=steps.find(s=>s.commitment_id===c.id&&s.operation==='REFUND'),voidStep=steps.find(s=>s.commitment_id===c.id&&s.operation==='VOID');
if(c.paypal_capture_id){const cap=(await gateway.getCapture(c.paypal_capture_id)).resource;assert.equal(cap.id,c.paypal_capture_id);assert.equal(cap.authorizationId,a.id);assert.equal(cents(cap.amount),c.share_cents);assert.equal(cap.finalCapture,true);assert.ok(order.captures.some(x=>x.id===cap.id));record.capture=cap;assert.equal(capStep.capture_id,cap.id);assert.equal(capStep.state,'SUCCEEDED');assert.ok(capStep.verified_at);
if(stage==='confirmed'){assert.equal(a.status,'CAPTURED');assert.equal(cap.status,'COMPLETED');assert.equal(c.state,'CAPTURED');}
if(stage==='compensated'){assert.equal(cap.status,'REFUNDED');assert.ok(refundStep.refund_id);const r=(await gateway.getRefund(refundStep.refund_id)).resource;assert.equal(r.status,'COMPLETED');assert.equal(r.captureId,cap.id);assert.equal(cents(r.amount),c.share_cents);assert.equal(refundStep.state,'SUCCEEDED');assert.equal(c.state,'REFUNDED');record.refund=r;}
}else if(stage==='compensated'){assert.equal(a.status,'VOIDED');assert.equal(c.state,'VOIDED');assert.equal(voidStep.state,'SUCCEEDED');assert.equal(order.captures.length,0);}
}else assert.ok(['prepared','partial'].includes(stage));
}else {assert.ok(['prepared','partial'].includes(stage));assert.equal(c.state,'NOT_STARTED');}
resources.push(record);
}
if(stage==='ready'){assert.ok(!saga);assert.equal(payments.progress(p).ready,true);assert.equal(resources.length,4);}
if(stage==='confirmed'){assert.equal(saga.state,'CONFIRMED');assert.equal(p.state,'CONFIRMED');assert.equal(goal.state,'CONFIRMED');assert.equal(resources.filter(r=>r.capture).length,4);assert.equal(steps.filter(s=>s.operation==='CAPTURE'&&s.state==='SUCCEEDED').reduce((a,s)=>a+s.amount_cents,0),151500);assert.equal(steps.filter(s=>s.operation!=='CAPTURE'&&s.state!=='PENDING').length,0);}
if(stage==='compensated'){assert.equal(saga.state,'COMPENSATED');assert.equal(p.state,'REPLAN_REQUIRED');assert.equal(goal.state,'REPLAN_REQUIRED');assert.equal(resources.filter(r=>r.capture).length,2);assert.equal(resources.filter(r=>r.refund).length,2);assert.equal(steps.find(s=>s.operation==='CAPTURE'&&s.position===3).state,'FAILED');assert.equal(steps.find(s=>s.operation==='CAPTURE'&&s.position===4).attempts,0);}
const sourceFiles=['src/product/capture-saga.ts','src/product/commitments.ts','src/product/service.ts','src/product/db.ts','src/product/server.ts','src/product/migration-4.sql','src/model.ts','src/paypal.ts','product-public/app.js'];
evidence.snapshots.push({label,stage,verifiedAt:new Date().toISOString(),proposalId:p.id,proposalVersion:p.revision,proposalState:p.state,financialState:p.financial_state,goalState:goal.state,packageId:p.package_id,totalCents:151500,implementationHash:sha(sourceFiles.map(f=>f+'\n'+readFileSync(f,'utf8')).join('\n')),saga:saga?{id:saga.id,state:saga.state,negativeTest:!!saga.negative_test,failureReason:saga.failure_reason,frozenAt:saga.frozen_at}:null,steps:steps.map(s=>({operation:s.operation,position:s.position,state:s.state,requestId:s.request_id,attempts:s.attempts,authorizationId:s.authorization_id,captureId:s.capture_id,refundId:s.refund_id,amountCents:s.amount_cents,providerStatus:s.provider_status,verifiedAt:s.verified_at,lastError:s.last_error})),resources,audit:db.all('SELECT action,entity_id,created_at FROM audit_events WHERE entity_id IN (SELECT id FROM capture_sagas WHERE proposal_id=?) OR entity_id IN (SELECT id FROM financial_steps WHERE saga_id=?) ORDER BY created_at',p.id,saga?.id??'')});
writeFileSync(path,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({verified:true,label,stage,proposalId:p.id,version:p.revision,sagaState:saga?.state??null}));
}finally{db.close();}
