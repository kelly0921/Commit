import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ProductDatabase} from '../src/product/db.ts';
import {CommitmentService} from '../src/product/commitments.ts';
import {normalize,validateParsed,publicPackage,ProductError} from '../src/product/domain.ts';
import {solve,VALUE_POLICY_VERSION,QUALITY_FLOORS,VALUE_WEIGHTS} from '../src/product/solver.ts';
import {PayPalAdapter} from '../src/paypal.ts';
import {PayPalError} from '../src/model.ts';

// Independent PayPal GET evidence only. Buyer approval/authorization/void use the product.
// Private buyer conditions are compared in memory, then recorded only as hashes/checks.
const [proposalId,label,stage='prepared']=process.argv.slice(2);
const hash=value=>createHash('sha256').update(value).digest('hex');
const path=resolve('docs/phase-2-1-sandbox-evidence.json');
let database;
try{
  assert.match(proposalId??'',/^[a-f0-9-]{36}$/);assert.match(label??'',/^[a-z0-9-]{1,60}$/);
  assert.ok(['prepared','partial','ready','stale','voided'].includes(stage));
  assert.ok(!process.env.PAYPAL_ENVIRONMENT||process.env.PAYPAL_ENVIRONMENT.toLowerCase()==='sandbox');
  database=new ProductDatabase(process.env.PRODUCT_DATABASE_PATH??resolve('data/commit.sqlite'));
  const db=database,payments=new CommitmentService(db,undefined);
  const proposal=db.get('SELECT * FROM proposals WHERE id=?',proposalId);assert.ok(proposal);
  const goal=db.get('SELECT * FROM purchase_goals WHERE id=?',proposal.goal_id);
  const result=JSON.parse(proposal.result_json);assert.equal(result.policyVersion,VALUE_POLICY_VERSION);assert.ok(result.feasible);
  const selected=result.catalogSnapshot.find(p=>p.id===result.selected.packageId);assert.ok(selected);
  const rows=payments.rows(proposalId);assert.equal(rows.length,4);
  assert.equal(new Set(rows.map(c=>c.user_id)).size,4);
  assert.equal(rows.reduce((sum,c)=>sum+c.share_cents,0),result.selected.totalCents);
  const fingerprint=payments.fingerprint(proposal);
  const current=proposal.state==='PROPOSED'&&goal.revision===proposal.revision&&proposal.commitment_fingerprint===fingerprint;
  const oldEvidenceHash=hash(readFileSync('docs/phase-2-sandbox-evidence.json'));
  const evidence=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{environment:'PayPal Sandbox',implementation:'POST_PHASE_1_1',syntheticPersonas:true,sameBuyerAllowed:true,originalPhase2EvidenceSha256:oldEvidenceHash,snapshots:[]};
  assert.equal(evidence.originalPhase2EvidenceSha256,oldEvidenceHash,'Historical evidence changed');
  if(['prepared','partial','ready'].includes(stage))assert.equal(current,true);
  if(current){
    const catalog=db.all('SELECT data_json FROM merchant_packages ORDER BY id').map(r=>JSON.parse(r.data_json));
    const members=db.constraintRows(goal.group_id).map(r=>normalize(validateParsed(JSON.parse(r.parsed_json)),r.user_id,r.name,!!r.confirmed));
    assert.deepEqual(solve(catalog,members),result,'Current solver differs from persisted proposal');
  }
  const envelopes=rows.map(c=>{
    assert.equal(c.share_cents,result.selected.allocations.find(a=>a.userId===c.user_id)?.shareCents);
    assert.equal(c.proposal_version,proposal.revision);assert.equal(c.proposal_fingerprint,proposal.commitment_fingerprint);
    assert.equal(c.share_cents,c.authorized_ceiling_cents);assert.ok(c.approved_envelope_json);
    const e=JSON.parse(c.approved_envelope_json);
    assert.equal(e.proposalId,proposalId);assert.equal(e.proposalVersion,proposal.revision);assert.equal(e.participantId,c.user_id);
    assert.equal(e.merchantId,selected.merchantId);assert.equal(e.packageId,selected.id);assert.equal(e.amountCeilingCents,c.share_cents);
    assert.equal(e.currency,'USD');assert.equal(e.valuePolicyVersion,result.policyVersion);assert.deepEqual(e.packageTerms,publicPackage(selected));
    assert.equal(e.merchantBoundaryFingerprint,hash(JSON.stringify(selected.merchantBoundaries)));
    assert.ok(e.amountCeilingCents<=e.buyerHardMaxCents);
    if(current){
      const owner=db.constraintRows(goal.group_id).find(r=>r.user_id===c.user_id);
      const buyer=normalize(validateParsed(JSON.parse(owner.parsed_json)),owner.user_id,owner.name,!!owner.confirmed);
      assert.equal(buyer.confirmed,true);assert.equal(e.buyerHardMaxCents,buyer.hardMaxCents);assert.deepEqual(e.buyerHardConditions,buyer.requirements);
    }
    const envelopeSha256=hash(c.approved_envelope_json);
    const previous=evidence.snapshots.flatMap(s=>s.envelopes).find(v=>v.commitmentId===c.id);
    if(previous)assert.equal(envelopeSha256,previous.envelopeSha256,'Approved envelope changed');
    return {participant:c.user_id,commitmentId:c.id,allocationId:c.allocation_id,proposalId,proposalVersion:e.proposalVersion,merchantId:e.merchantId,packageId:e.packageId,amountCeilingCents:e.amountCeilingCents,currency:e.currency,packageTerms:e.packageTerms,merchantBoundaryFingerprint:e.merchantBoundaryFingerprint,valuePolicyVersion:e.valuePolicyVersion,envelopeSha256,buyerHardCeilingSatisfied:true,privateBuyerConditionsCompared:current,privateBuyerConditionsPublished:false};
  });
  const resources=[];
  if(stage==='prepared')assert.ok(rows.every(c=>c.state==='NOT_STARTED'&&!c.paypal_order_id&&!c.paypal_authorization_id));
  const gateway=stage==='prepared'?undefined:(assert.ok(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET),new PayPalAdapter(process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET));
  for(const c of rows){
    let order=null,authorization=null;
    if(c.paypal_order_id){
      const response=await gateway.getOrder(c.paypal_order_id);order=response.resource;
      assert.equal(order.id,c.paypal_order_id);assert.equal(order.intent,'AUTHORIZE');assert.equal(order.unitCount,1);
      assert.equal(order.referenceId,c.id);assert.equal(order.customId,c.id);assert.equal(order.amount.currencyCode,'USD');
      assert.equal(order.amount.value,(c.share_cents/100).toFixed(2));assert.equal(order.captures.length,0);assert.equal(c.capture_detected,0);
      if(c.paypal_authorization_id){
        assert.equal(order.status,'COMPLETED');assert.equal(order.authorizations.length,1);assert.equal(order.authorizations[0].id,c.paypal_authorization_id);
        authorization=(await gateway.getAuthorization(c.paypal_authorization_id)).resource;
        assert.equal(authorization.id,c.paypal_authorization_id);assert.equal(authorization.amount.currencyCode,'USD');
        assert.equal(authorization.amount.value,(c.share_cents/100).toFixed(2));assert.equal(authorization.status,stage==='voided'?'VOIDED':'CREATED');
        assert.equal(c.authorization_status,authorization.status);
        assert.equal(c.authorized_amount_cents,c.share_cents);assert.equal(c.authorized_currency,'USD');
        assert.equal(c.state,stage==='stale'?'STALE':stage==='voided'?'VOIDED':'AUTHORIZED');
        if(stage!=='voided'){assert.ok(Date.parse(authorization.expirationTime)>Date.now());assert.ok(Date.parse(authorization.createTime)<=Date.now()+300000);}
      }else assert.equal(order.authorizations.length,0);
    }else assert.equal(c.paypal_authorization_id,null);
    resources.push({participant:c.user_id,commitmentId:c.id,allocationId:c.allocation_id,proposalVersion:c.proposal_version,amountCents:c.share_cents,localState:c.state,orderId:order?.id??null,orderStatus:order?.status??null,merchantId:order?.merchantId??null,authorizationId:authorization?.id??null,authorizationStatus:authorization?.status??null,authorizationAmount:authorization?.amount??null,authorizedAt:authorization?.createTime??null,expiresAt:authorization?.expirationTime??null,captures:[]});
  }
  const authorizationCount=resources.filter(r=>r.authorizationId).length;
  for(const key of ['orderId','authorizationId']){
    const ids=resources.map(r=>r[key]).filter(Boolean);assert.equal(new Set(ids).size,ids.length);
    const otherProposals=evidence.snapshots.filter(s=>s.proposal.id!==proposalId).flatMap(s=>s.resources);
    assert.ok(ids.every(id=>!otherProposals.some(r=>r[key]===id)),'Old proposal resource reused');
  }
  const merchantIds=new Set(resources.filter(r=>r.orderId).map(r=>r.merchantId));
  assert.ok(merchantIds.size<=1);assert.ok([...merchantIds].every(id=>typeof id==='string'&&id.length>0));
  if(process.env.PAYPAL_MERCHANT_ID)assert.ok([...merchantIds].every(id=>id===process.env.PAYPAL_MERCHANT_ID));
  let staleReuseChecks=null;
  if(stage==='stale'){
    // Exercise the actual application guards against these persisted live commitments.
    // A forbidden gateway guarantees the probes cannot send any provider operation.
    const sessionRow=db.get("SELECT id FROM demo_sessions WHERE group_id=? AND persona='lawrence'",goal.group_id);
    assert.ok(sessionRow,'Lawrence session is needed for the stale reuse probe');
    const session=db.session(sessionRow.id);let providerCalls=0;
    const forbidden=async()=>{providerCalls++;throw new Error('Unexpected provider operation during stale reuse probe');};
    const guard=new CommitmentService(db,{createAuthorizationOrder:forbidden,getOrder:forbidden,authorizeOrder:forbidden,getAuthorization:forbidden,voidAuthorization:forbidden});
    const rejected=error=>error instanceof ProductError&&error.code==='PROPOSAL_CHANGED_REVIEW_AGAIN';
    await assert.rejects(()=>guard.create(session,proposalId),rejected);
    await assert.rejects(()=>guard.authorize(session,proposalId),rejected);
    assert.equal(providerCalls,0);assert.deepEqual(guard.rows(proposalId),rows);
    staleReuseChecks={oldProposalCreateRejected:true,oldProposalAuthorizeRejected:true,code:'PROPOSAL_CHANGED_REVIEW_AGAIN',providerCalls,commitmentsUnchanged:true};
  }
  const progress=payments.progress(proposal);
  assert.equal(progress.capturedCents,0);assert.equal(progress.captureDetected,false);
  if(stage==='ready'){assert.equal(authorizationCount,4);assert.ok(rows.every(c=>c.state==='AUTHORIZED'));assert.equal(progress.ready,true);assert.equal(progress.committedCount,4);assert.equal(progress.authorizedCents,result.selected.totalCents);}
  if(stage==='stale'){assert.equal(current,false);assert.equal(authorizationCount,4);assert.ok(rows.every(c=>c.state==='STALE'));assert.equal(progress.ready,false);assert.equal(progress.committedCount,0);assert.equal(progress.authorizedCents,0);}
  if(stage==='voided'){assert.equal(authorizationCount,4);assert.ok(rows.every(c=>c.state==='VOIDED'));assert.equal(progress.ready,false);assert.equal(progress.authorizedCents,0);}
  if(stage==='partial'){assert.ok(authorizationCount<4);assert.equal(progress.ready,false);}
  const implementationFiles=['src/product/domain.ts','src/product/solver.ts','src/product/service.ts','src/product/commitments.ts','src/product/db.ts','src/product/server.ts','src/paypal.ts','src/model.ts','product-public/app.js'];
  const implementationSha256=hash(implementationFiles.map(file=>file+'\n'+hash(readFileSync(file))).join('\n'));
  const snapshot={verifiedAt:new Date().toISOString(),label,stage,implementationSha256,currentProposal:current,proposal:{id:proposal.id,version:proposal.revision,state:proposal.state,financialState:db.get('SELECT financial_state FROM proposals WHERE id=?',proposalId).financial_state,fingerprint:proposal.commitment_fingerprint,policyVersion:result.policyVersion,selectedPackage:publicPackage(selected),totalCents:result.selected.totalCents,allocations:result.selected.allocations.map(a=>({participant:a.userId,amountCents:a.shareCents})),comparisons:result.comparisons,qualityFloors:QUALITY_FLOORS,valueWeights:VALUE_WEIGHTS,merchantBoundaries:selected.merchantBoundaries,allHardChecksPass:result.selected.checks.every(c=>c.passed),alternatives:result.evaluations.map(e=>({packageId:e.packageId,totalCents:e.totalCents,feasible:e.feasible,rank:e.rank,failedBoundaries:e.checks.filter(c=>!c.passed).map(c=>({participant:c.userId??null,key:c.key})),scores:e.scores}))},envelopes,resources,authorizationCount,progress,staleReuseChecks,audit:db.all('SELECT actor_id,action,entity_id,revision,created_at FROM audit_events WHERE entity_id=? OR entity_id IN (SELECT c.id FROM commitments c JOIN proposal_allocations a ON a.id=c.allocation_id WHERE a.proposal_id=?) ORDER BY created_at',proposalId,proposalId)};
  evidence.snapshots.push(snapshot);writeFileSync(path,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({label,stage,proposalId,version:proposal.revision,package:result.selected.packageId,totalCents:result.selected.totalCents,envelopesVerified:4,authorizationCount,currentProposal:current,ready:progress.ready,committedCount:progress.committedCount,authorizedCents:progress.authorizedCents,capturedCents:0,evidenceFile:path}));
}catch(error){
  console.error(JSON.stringify({status:'FAILED',code:error instanceof ProductError||error instanceof PayPalError?error.code:error?.code??'VERIFICATION_FAILED',label,stage}));process.exitCode=1;
}finally{database?.close();}
