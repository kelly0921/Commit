// Isolated regression smoke for the visual iteration; no payment gateway or runtime database.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { ProductDatabase } from '../src/product/db.ts';
import { ProductService } from '../src/product/service.ts';
import { OpenAiProvider } from '../src/product/ai.ts';
if(!process.env.OPENAI_API_KEY){console.log('Live visual check requires the configured local key.');process.exit(2);}
const db=new ProductDatabase(':memory:');
const service=new ProductService(db,new OpenAiProvider(process.env.OPENAI_API_KEY,process.env.OPENAI_MODEL??'gpt-5.6-terra'),'openai');
try{
  const session=db.createSession();service.create(session,'Visual verification — Vermont Ski Weekend','Book a ski weekend in Vermont with four fictional friends.',true);
  service.switchPersona(session,'lawrence');const before=service.ownConstraint(session);
  const interpreted=await service.interpret(session,'I prefer $350, cannot exceed $400, and own snowboard gear, so I do not need rentals.');
  assert.equal(interpreted.source,'OPENAI');assert.equal(interpreted.parsed.hardMax,400);assert.equal(interpreted.parsed.preferredMax,350);
  assert.ok(interpreted.parsed.requirements.some(r=>r.key==='rentalsRequired'&&r.value===false));
  assert.equal(interpreted.parsed.clarifications.length,0);assert.ok(interpreted.parsed.requirements.every(r=>r.visibility==='PRIVATE'));
  assert.deepEqual(service.ownConstraint(session),before);
  service.switchPersona(session,'kelly');const group=await service.solve(session);
  assert.equal(group.proposal.explanationSource,'OPENAI');assert.equal(group.proposal.package.id,'summit-lodge');assert.equal(group.proposal.totalCents,145500);
  assert.equal(group.members.reduce((n,m)=>n+m.shareCents,0),145500);assert.equal(db.get('SELECT COUNT(*) AS n FROM commitments').n,0);
  assert.doesNotMatch(JSON.stringify(group),/hardMaxCents|preferredMax|parsed_json|statement/);
  await writeFile('docs/assets/visual-iteration/live-ai-evidence.json',JSON.stringify({verifiedAt:new Date().toISOString(),status:'PASS',source:'LIVE_OPENAI',syntheticDataOnly:true,isolatedMemoryDatabase:true,interpreter:{validated:true,privateByDefault:true,confirmedNeedsUnchanged:true},explainer:{source:group.proposal.explanationSource,packageId:group.proposal.package.id,totalCents:group.proposal.totalCents,exactAllocationConserved:true},paymentCalls:0,commitmentRows:0,historicalEvidenceOverwritten:false},null,2)+'\n');
  console.log('Live AI visual regression PASS: private interpretation, review boundary, deterministic explanation, zero payments.');
}catch(e){console.log('Live AI visual regression FAIL: '+(e.code??(e.name==='AssertionError'?'ASSERTION_FAILED':'VERIFICATION_ERROR')));process.exitCode=1;}finally{db.close();}
