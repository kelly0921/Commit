import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {ProductDatabase} from '../src/product/db.ts';
import {PayPalAdapter} from '../src/paypal.ts';
import {CommitmentService} from '../src/product/commitments.ts';

// Read-only PayPal verification. No authorization, capture or void is available here.
const proposalId=process.argv[2],expected=process.argv[3]??'CREATED';
assert.match(proposalId??'',/^[a-f0-9-]{36}$/);assert.ok(['CREATED','VOIDED'].includes(expected));
assert.ok(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET,'Sandbox credentials required locally');
assert.ok(!process.env.PAYPAL_ENVIRONMENT||process.env.PAYPAL_ENVIRONMENT.toLowerCase()==='sandbox');
const db=new ProductDatabase(process.env.PRODUCT_DATABASE_PATH??resolve('data/commit.sqlite'));
const gateway=new PayPalAdapter(process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET);
const commitments=new CommitmentService(db,undefined);const verifiedAt=new Date().toISOString();
try{
  const rows=commitments.rows(proposalId);assert.equal(rows.length,4);
  const savedProposal=db.get('SELECT * FROM proposals WHERE id=?',proposalId);
  assert.equal(savedProposal.commitment_fingerprint,commitments.fingerprint(savedProposal));
  assert.equal(db.get('SELECT revision FROM purchase_goals WHERE id=?',savedProposal.goal_id).revision,savedProposal.revision);
  assert.ok(rows.every(c=>c.proposal_version===savedProposal.revision&&c.proposal_fingerprint===savedProposal.commitment_fingerprint&&c.share_cents===c.authorized_ceiling_cents));
  const resources=[];
  for(const c of rows){
    if(!c.paypal_order_id){resources.push({participant:c.user_id,commitmentId:c.id,allocationId:c.allocation_id,proposalVersion:c.proposal_version,amountCents:c.authorized_ceiling_cents,localState:c.state,orderId:null,authorizationId:null});continue;}
    const order=(await gateway.getOrder(c.paypal_order_id)).resource;
    assert.equal(order.id,c.paypal_order_id);assert.equal(order.intent,'AUTHORIZE');assert.equal(order.unitCount,1);assert.equal(order.customId,c.id);assert.equal(order.referenceId,c.id);assert.equal(order.amount.currencyCode,'USD');assert.equal(order.amount.value,(c.authorized_ceiling_cents/100).toFixed(2));assert.equal(order.captures.length,0);
    let authorization=null;
    if(c.paypal_authorization_id){
      assert.equal(order.authorizations.length,1);assert.equal(order.authorizations[0].id,c.paypal_authorization_id);authorization=(await gateway.getAuthorization(c.paypal_authorization_id)).resource;
      assert.equal(authorization.id,c.paypal_authorization_id);assert.equal(authorization.status,expected);assert.equal(authorization.amount.currencyCode,'USD');assert.equal(authorization.amount.value,(c.authorized_ceiling_cents/100).toFixed(2));assert.equal(order.status,'COMPLETED');
      assert.equal(c.authorization_status,expected);assert.equal(c.state,expected==='CREATED'?'AUTHORIZED':'VOIDED');
    }
    resources.push({participant:c.user_id,commitmentId:c.id,allocationId:c.allocation_id,proposalVersion:c.proposal_version,amountCents:c.authorized_ceiling_cents,localState:c.state,
      orderId:order.id,orderStatus:order.status,intent:order.intent,merchantId:order.merchantId,authorizationId:authorization?.id??null,authorizationStatus:authorization?.status??null,
      authorizationAmount:authorization?.amount??null,authorizedAt:authorization?.createTime??null,expiresAt:authorization?.expirationTime??null,captures:[],verifiedAt});
  }
  const authorizationCount=resources.filter(r=>r.authorizationId).length;
  const proposal=db.get('SELECT id,revision,package_id,state,financial_state,commitment_fingerprint FROM proposals WHERE id=?',proposalId);
  const audit=db.all('SELECT actor_id,action,entity_id,revision,created_at FROM audit_events WHERE entity_id=? OR entity_id IN (SELECT c.id FROM commitments c JOIN proposal_allocations a ON a.id=c.allocation_id WHERE a.proposal_id=?) ORDER BY created_at',proposalId,proposalId);
  const snapshot={verifiedAt,expectedAuthorizationStatus:expected,proposal,authorizationCount,authorizedCents:expected==='CREATED'?resources.filter(r=>r.authorizationId).reduce((s,r)=>s+r.amountCents,0):0,capturedCents:0,resources,audit,
    acceptance:authorizationCount>=2?'MINIMUM_LIVE_AUTHORIZATIONS_VERIFIED':'PENDING_ADDITIONAL_BUYER_APPROVAL',fourParticipantMilestone:authorizationCount===4&&expected==='CREATED'&&proposal.financial_state==='READY_TO_CAPTURE'};
  const path=resolve('docs/phase-2-sandbox-evidence.json');let evidence={environment:'PayPal Sandbox',syntheticPersonas:true,sameBuyerAllowed:true,snapshots:[]};if(existsSync(path))evidence=JSON.parse(readFileSync(path,'utf8'));evidence.snapshots.push(snapshot);writeFileSync(path,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({evidenceFile:path,proposalId,authorizationCount,expected,capturedCents:0,acceptance:snapshot.acceptance,fourParticipantMilestone:snapshot.fourParticipantMilestone}));
}finally{db.close();}
