import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ProductDatabase } from '../src/product/db.ts';
import { ProductService } from '../src/product/service.ts';
import { OpenAiProvider } from '../src/product/ai.ts';
import { SEED_STATEMENTS, SEED_CONSTRAINTS } from '../src/product/seed.ts';

// Only the published fictional scenario is transmitted. Never serialize provider headers or errors.
if(!process.env.OPENAI_API_KEY){console.log('Live AI verification pending: OPENAI_API_KEY is missing.');process.exit(2);}
const model=process.env.OPENAI_MODEL ?? 'gpt-5.6-terra';
const dbPath=resolve('data/live-ai-verification.sqlite');const db=new ProductDatabase(dbPath);
const ai=new OpenAiProvider(process.env.OPENAI_API_KEY,model);const service=new ProductService(db,ai,'openai');
const session=db.createSession();const evidence={verifiedAt:null,mode:'LIVE_OPENAI',model,syntheticDataOnly:true,interpreter:[],negativeInterpretation:[],proposal:null,privacy:'PENDING',persistence:'PENDING',status:'PENDING'};
try {
  service.create(session,'Live verification — Vermont Ski Weekend','Book a ski weekend in Vermont with our four fictional friends.',true);
  for(const persona of ['kelly','lawrence','sarah','alex']){
    service.switchPersona(session,persona);const draft=await service.interpret(session,SEED_STATEMENTS[persona]);
    assert.equal(draft.source,'OPENAI');assert.equal(draft.parsed.hardMax,SEED_CONSTRAINTS[persona].hardMax);assert.equal(draft.parsed.preferredMax,SEED_CONSTRAINTS[persona].preferredMax);assert.deepEqual(draft.parsed.clarifications,[]);
    for(const expected of SEED_CONSTRAINTS[persona].requirements)assert.ok(draft.parsed.requirements.some(r=>r.key===expected.key&&r.value===expected.value&&r.visibility==='PRIVATE'));
    if(persona==='alex')assert.ok(draft.parsed.preferences.some(r=>r.key==='canDrive'&&r.value===true));
    service.confirm(session,draft.draftId,draft.parsed);evidence.interpreter.push({persona,source:draft.source,validated:true,confirmed:true,parsed:draft.parsed});console.log(`Live interpreter: ${persona} PASS`);
  }
  service.switchPersona(session,'lawrence');const example=await service.interpret(session,"I'd prefer to stay near $350, but I absolutely cannot go over $400. I own my equipment.");assert.equal(example.parsed.hardMax,400);assert.equal(example.parsed.preferredMax,350);assert.equal(example.parsed.clarifications.length,0);evidence.negativeInterpretation.push({case:'natural-language preference and absolute ceiling',passed:true});
  const unsupported=await service.interpret(session,'My hard max is $400, and a helicopter transfer is a hard requirement.');assert.ok(unsupported.parsed.clarifications.length>0);assert.throws(()=>service.confirm(session,unsupported.draftId,unsupported.parsed),/CLARIFY/);evidence.negativeInterpretation.push({case:'unsupported hard requirement blocked',passed:true});
  const group=await service.solve(session);assert.equal(group.proposal.explanationSource,'OPENAI');assert.equal(group.proposal.package.id,'summit-lodge');assert.equal(group.proposal.totalCents,145500);assert.equal(group.proposal.evaluations.length,6);assert.equal(group.members.reduce((n,m)=>n+m.shareCents,0),145500);
  assert.doesNotMatch(JSON.stringify(group),/hardMaxCents|preferredMax|softPenalty|parsed_json|statement/);evidence.privacy='PASS';
  evidence.proposal={id:group.proposal.id,revision:group.proposal.revision,packageId:group.proposal.package.id,totalCents:group.proposal.totalCents,allocations:group.members.map(m=>({persona:m.id,shareCents:m.shareCents})),explanation:group.proposal.explanation,source:group.proposal.explanationSource};
  const id=session.id;db.close();const reopened=new ProductDatabase(dbPath);try{assert.equal(new ProductService(reopened,ai,'openai').group(reopened.session(id)).proposal.id,group.proposal.id);evidence.persistence='PASS';}finally{reopened.close();}
  evidence.verifiedAt=new Date().toISOString();evidence.status='PASS';await mkdir('docs',{recursive:true});await writeFile('docs/live-ai-evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log('Live interpreter, explainer, privacy and persistence PASS. Evidence: docs/live-ai-evidence.json');
}catch(error){try{db.close();}catch{}console.log(`Live AI verification FAIL: ${error.code ?? (error.name==='AssertionError'?'ASSERTION_FAILED':'VERIFICATION_ERROR')}`);process.exitCode=1;}
