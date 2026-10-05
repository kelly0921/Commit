// Isolated acceptance. Never loads .env, constructs PayPalAdapter or sends money.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {ProductDatabase} from '../src/product/db.ts';
import {ProductService} from '../src/product/service.ts';
import {OfflineDemoProvider} from '../src/product/ai.ts';
import {CommitmentService} from '../src/product/commitments.ts';
import {CaptureSagaService} from '../src/product/capture-saga.ts';
import {AgentCoordinator} from '../src/product/agents.ts';
import {merchantDemand} from '../src/merchant/demand.ts';
import {OfferGateway} from '../tests/offer-gateway.ts';
const db=new ProductDatabase(':memory:'),gateway=new OfferGateway(),payments=new CommitmentService(db,gateway,'http://localhost:3010','MERCHANT'),sagas=new CaptureSagaService(db,payments,gateway),product=new ProductService(db,new OfflineDemoProvider(),'offline-demo',payments,sagas),session=db.createSession();
const terms={eligiblePackageIds:['summit-lodge'],eligibleStartDate:'2027-02-01',eligibleEndDate:'2027-02-28',maxDiscountPercent:8,minimumMarginPercent:20,minimumGroupSize:4,minimumQualifyingGroups:5,maxRedemptions:20,autoPublishWithinPolicy:true};
try{
 product.create(session,'Agentic acceptance fixture','Four synthetic friends choose the February Summit stay.',true);product.offers.seed(session);await product.solve(session);
 const groupId=db.session(session.id).group_id,initial=product.group(session).proposal;
 const qualifying=merchantDemand().filter(r=>r.month==='2027-02'&&r.nearConversion&&r.blocker==='PRICE'&&r.groupSize>=4&&r.currentPackageId==='summit-lodge');let demand=qualifying.slice(0,4);
 const coordinator=new AgentCoordinator(db,product,undefined,()=>demand);
 // Explicit human grants are modeled as test inputs, never impersonated UI approval.
 for(const user of ['kelly','lawrence','sarah','alex']){product.switchPersona(session,user);coordinator.authority.mandate(session,{status:'ACTIVE',allowAutomaticReplan:true,allowAutomaticBetterOffers:true,confirmDelegation:true});}
 product.switchPersona(session,'kelly');coordinator.authority.policy('acceptance-human',{status:'ACTIVE',terms,confirmDelegation:true});await coordinator.drain();assert.equal(db.all('SELECT offer_id FROM policy_publications').length,0);
 demand=qualifying;await coordinator.drain();const updated=product.group(session).proposal;assert.equal(updated.totalCents,139380);assert.equal(db.all('SELECT offer_id FROM policy_publications').length,1);assert.equal(gateway.calls.length,0);
 const receipt=db.get('SELECT p.version,p.id AS policyId,r.offer_id AS offerId,r.simulation_id AS simulationId,r.demand_snapshot_json AS snapshot FROM policy_publications r JOIN merchant_agent_policies p ON p.id=r.policy_id');
 const noPayment={orders:gateway.orders.size,authorizations:gateway.auths.size,captures:gateway.captures.size,operations:gateway.calls.length};
 const activity=coordinator.communication.list(session),timeline=coordinator.timeline(session);
 coordinator.authority.autoFinalize(session,{enabled:true,confirmDelegation:true});
 for(const user of ['kelly','lawrence','sarah','alex']){product.switchPersona(session,user);await payments.create(session,updated.id);const own=payments.rows(updated.id).find(c=>c.user_id===user);gateway.orders.get(own.paypal_order_id).status='APPROVED';await payments.authorize(session,updated.id);}
 product.switchPersona(session,'kelly');await coordinator.drain();db.enqueue('GROUP_PROGRESS',groupId,null,'acceptance-duplicate-ready');await coordinator.drain();assert.equal(gateway.calls.filter(c=>c.op==='capture').length,4);
 const saga=db.get('SELECT id,state FROM capture_sagas WHERE proposal_id=?',updated.id);assert.equal(saga.state,'CONFIRMED');
 writeFileSync('docs/assets/phase-6/agentic-acceptance.json',JSON.stringify({capturedAt:new Date().toISOString(),environment:'isolated in-memory database; explicit test grants; fake payment gateway; no browser or real provider',threshold:{before:4,after:qualifying.length,minimum:5},publication:{policyId:receipt.policyId,policyVersion:receipt.version,offerId:receipt.offerId,simulationId:receipt.simulationId,discountPercent:8,anonymousDemandSnapshot:JSON.parse(receipt.snapshot)},replan:{previousProposalId:initial.id,currentProposalId:updated.id,previousTotalCents:initial.totalCents,currentTotalCents:updated.totalCents,shares:payments.rows(updated.id).map(c=>({participant:c.user_id,shareCents:c.share_cents}))},automaticLoopPaymentOperations:noPayment,activity:{count:activity.items.length,approvalRequired:activity.items.some(a=>a.type==='APPROVAL_REQUIRED')},agentAudit:timeline.map(({title,body,authorityVersion})=>({title,body,authorityVersion})),autoFinalize:{gateway:'fake',sagaId:saga.id,state:saga.state,sagas:1,captureCalls:4,duplicateCaptureCalls:0},realPayPalApiCalls:0},null,2)+'\n');
 console.log('PASS: 4 → '+qualifying.length+' anonymous groups; one 8% publication; $1,515.00 → $1,393.80; zero automatic buyer operations; existing fake saga captured four shares exactly once.');
}finally{db.close();}
