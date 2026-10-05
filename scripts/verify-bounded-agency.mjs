import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {ProductDatabase} from '../src/product/db.ts';
import {ProductService} from '../src/product/service.ts';
import {OpenAiProvider} from '../src/product/ai.ts';
import {VALUE_POLICY_VERSION} from '../src/product/solver.ts';

// Published fictional inputs only; no PayPal adapter or payment operations are available here.
if(!process.env.OPENAI_API_KEY){console.log('Bounded agency live verification pending: local API key missing.');process.exit(2);}
const model=process.env.OPENAI_MODEL??'gpt-5.6-terra';
const db=new ProductDatabase('data/bounded-agency-verification.sqlite');
try{
  const service=new ProductService(db,new OpenAiProvider(process.env.OPENAI_API_KEY,model),'openai'),session=db.createSession();
  service.create(session,'Bounded value verification','Our four fictional friends want a ski weekend in Vermont.',true);
  const before=service.ownConstraint(session);
  const statement='My hard max is $450. I need rentals. The minimum rating is 4.5 out of 5 with at least 100 reviews, and minimum accommodation quality is 4 out of 5. I require flexible cancellation with a 100% refund if I cancel by the published package cancellation deadline. Wi-Fi and breakfast are required.';
  const draft=await service.interpret(session,statement);assert.equal(draft.source,'OPENAI');assert.equal(draft.parsed.hardMax,450);assert.deepEqual(draft.parsed.clarifications,[]);
  for(const [key,value] of Object.entries({rentalsRequired:true,minRating:4.5,minReviewCount:100,minAccommodationQuality:4,flexibleCancellationRequired:true,minRefundPercent:100,wifiRequired:true,breakfastRequired:true}))assert.ok(draft.parsed.requirements.some(r=>r.key===key&&r.value===value&&r.visibility==='PRIVATE'));
  assert.deepEqual(service.ownConstraint(session),before);console.log('Live quality/refund interpretation and unchanged confirmed boundaries PASS');
  service.confirm(session,draft.draftId,draft.parsed);const group=await service.solve(session);
  assert.equal(group.proposal.valuePolicyVersion,VALUE_POLICY_VERSION);assert.equal(group.proposal.package.id,'summit-lodge');assert.equal(group.proposal.totalCents,145500);assert.equal(group.proposal.explanationSource,'OPENAI');
  assert.doesNotMatch(JSON.stringify(group),/merchantBoundaries|minimumMarginBps|costCents|hardMaxCents|preferenceFit|softPenalty|parsed_json/);
  assert.equal(db.get('SELECT count(*) AS n FROM commitments').n,0);
  const evidence={verifiedAt:new Date().toISOString(),status:'PASS',source:'LIVE_OPENAI',model,syntheticDataOnly:true,statement,parsed:draft.parsed,confirmedBoundaryUnchangedUntilReview:true,valuePolicyVersion:VALUE_POLICY_VERSION,proposal:{id:group.proposal.id,revision:group.proposal.revision,packageId:group.proposal.package.id,totalCents:group.proposal.totalCents,explanation:group.proposal.explanation},qualityAndRefundFloors:'PASS',privacy:'PASS',paymentCalls:0,commitmentRows:0};
  await writeFile('docs/bounded-agency-live-evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log('Live bounded-value explanation and privacy PASS; no payment calls. Evidence: docs/bounded-agency-live-evidence.json');
}catch(error){console.log('Bounded agency live verification FAIL: '+(error.code??(error.name==='AssertionError'?'ASSERTION_FAILED':'VERIFICATION_ERROR')));process.exitCode=1;}
finally{db.close();}
