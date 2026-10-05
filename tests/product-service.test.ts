import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProductDatabase } from '../src/product/db.js';
import { ProductService } from '../src/product/service.js';
import { SEED_CONSTRAINTS } from '../src/product/seed.js';
import { ProductError, type Fact } from '../src/product/domain.js';
import type { AiProvider } from '../src/product/ai.js';
const fixture:AiProvider={async interpret(){return {parsed:structuredClone(SEED_CONSTRAINTS.kelly!),source:'OPENAI'};},async explain(facts){return {selection:{factIds:facts.slice(0,3).map(f=>f.id)},source:'OPENAI'};}};
function setup(ai=fixture,path=':memory:'){const db=new ProductDatabase(path);const service=new ProductService(db,ai,'openai');const session=db.createSession();service.create(session,'Vermont Ski Weekend','A weekend in Vermont with our four friends.',true);return {db,service,session};}
test('sessions isolate groups; organizer, participants and merchant receive correct private projections',async()=>{
  const {db,service,session}=setup();try{
    await service.solve(session);const group=service.group(session);assert.equal(group.proposal!.totalCents,145500);assert.equal(group.proposal!.ownAllocation!.userId,'kelly');
    const publicJson=JSON.stringify(group);assert.doesNotMatch(publicJson,/hardMaxCents|preferredMax|parsed_json|statement|softPenalty/);assert.ok(!publicJson.includes('45000'));
    for(const persona of ['lawrence','sarah','alex']){service.switchPersona(session,persona);assert.equal(service.group(session).proposal!.ownAllocation!.userId,persona);assert.equal(service.ownConstraint(session).parsed.hardMax,SEED_CONSTRAINTS[persona]!.hardMax);for(const e of service.group(session).proposal!.evaluations)assert.ok(e.ownChecks.every(c=>c.userId===persona));}
    service.switchPersona(session,'merchant');assert.throws(()=>service.group(session),/PARTICIPANT_ONLY/);assert.throws(()=>service.ownConstraint(session),/PARTICIPANT_ONLY/);assert.equal(service.catalog().packages.length,6);
    const second=db.createSession();assert.throws(()=>service.group(second),/CREATE_OR_TRY_DEMO_FIRST/);service.create(second,'Different group','Another ski weekend in Vermont.',true);assert.notEqual(db.session(second.id)!.group_id,db.session(session.id)!.group_id);assert.equal(service.group(second).proposal,null);
    service.switchPersona(second,'alex');service.create(second,'New group','Another ski weekend with a fresh group.',false);assert.equal(service.sessionView(second).persona,'kelly');assert.equal(service.group(second).persona,'kelly');
  }finally{db.close();}
});
test('validated private drafts require owner confirmation; confirmation invalidates old proposal and allocates fresh revision',async()=>{
  const {db,service,session}=setup();try{
    await service.solve(session);const draft=await service.interpret(session,'My hard max is $450; I need rentals.');assert.equal(service.ownConstraint(session).version,1);
    service.switchPersona(session,'sarah');assert.throws(()=>service.confirm(session,draft.draftId,draft.parsed),/DRAFT_NOT_FOUND/);service.switchPersona(session,'kelly');
    const parsed={...draft.parsed,hardMax:440,requirements:draft.parsed.requirements.map(r=>({...r,visibility:'PUBLIC' as const}))};service.confirm(session,draft.draftId,parsed);
    assert.equal(service.group(session).revision,2);assert.equal(service.group(session).proposal,null);assert.equal(db.get<{state:string}>('SELECT state FROM proposals')!.state,'PROPOSAL_STALE');assert.equal(service.group(session).members.find(m=>m.id==='kelly')!.publicRequirements.length,1);
    await service.solve(session);assert.equal(db.get<{n:number}>('SELECT count(*) AS n FROM proposals')!.n,2);assert.equal(db.get<{n:number}>('SELECT count(*) AS n FROM proposal_allocations')!.n,8);assert.equal(db.get<{n:number}>('SELECT count(*) AS n FROM commitments')!.n,0);assert.equal(service.ownConstraint(session).parsed.hardMax,440);
  }finally{db.close();}
});
test('AI errors or invalid output do not change confirmed constraints or create a proposal',async()=>{
  for(const ai of [{...fixture,async interpret(){throw new ProductError('AI_PROVIDER_UNAVAILABLE',503);}},{...fixture,async interpret(){return {parsed:{...SEED_CONSTRAINTS.kelly!,hardMax:NaN},source:'OPENAI' as const};}},{...fixture,async explain(){return {selection:{factIds:['fake']},source:'OPENAI' as const};}}]){
    const {db,service,session}=setup(ai);try{const before=service.ownConstraint(session);await assert.rejects(()=>('explain' in ai && ai.explain!==fixture.explain)?service.solve(session):service.interpret(session,'My max is $450.' ));assert.deepEqual(service.ownConstraint(session),before);assert.equal(service.group(session).proposal,null);}finally{db.close();}
  }
});
test('clarifications block confirmation; absent hard maxima produce no feasible proposal',async()=>{
  const {db,service,session}=setup({...fixture,async interpret(){return {parsed:{...SEED_CONSTRAINTS.kelly!,clarifications:['Pet policy is unsupported.']},source:'OPENAI'};}});try{const draft=await service.interpret(session,'My max is $450 and I need a pet-friendly room.');assert.throws(()=>service.confirm(session,draft.draftId,{...draft.parsed,clarifications:[]}),/CLARIFY/);
    service.create(session,'New plan','Our friends want a ski weekend in Vermont.',false);const group=await service.solve(session);assert.equal(group.proposal!.feasible,false);assert.equal(group.state,'REPLAN_REQUIRED');assert.equal(db.get<{n:number}>('SELECT count(*) AS n FROM proposal_allocations')!.n,0);
  }finally{db.close();}
});
test('persona changes during an AI request discard its result before saving',async()=>{
  let resume!:(value:any)=>void;const {db,service,session}=setup({...fixture,interpret:()=>new Promise(resolve=>{resume=resolve;})});try{const pending=service.interpret(session,'My hard max is $450.');service.switchPersona(session,'lawrence');resume({parsed:SEED_CONSTRAINTS.kelly!,source:'OPENAI'});await assert.rejects(pending,/PERSONA_CHANGED/);assert.equal(db.get<{n:number}>('SELECT count(*) AS n FROM constraint_drafts')!.n,0);}finally{db.close();}
});
test('revision changes during explanation discard stale solution; repeated solves are idempotent',async()=>{
  let resume!:(value:any)=>void;let count=0;let captured:Fact[]=[];const {db,service,session}=setup({...fixture,explain:(facts)=>{count++;captured=facts;return new Promise(resolve=>{resume=resolve;});}});try{
    const pending=service.solve(session);const draft=await service.interpret(session,'My hard max is $450.');service.confirm(session,draft.draftId,draft.parsed);resume({selection:{factIds:[captured[0]!.id]},source:'OPENAI'});await assert.rejects(pending,/PLAN_CHANGED/);assert.equal(service.group(session).proposal,null);
    const pending2=service.solve(session);resume({selection:{factIds:[captured[0]!.id]},source:'OPENAI'});await pending2;await service.solve(session);assert.equal(count,2);assert.equal(db.get<{n:number}>('SELECT count(*) AS n FROM proposals')!.n,1);
  }finally{db.close();}
});
test('database reopen preserves confirmed private needs, selected proposal, allocations and audit trail',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'commit-db-'));const path=join(folder,'test.sqlite');const {db,service,session}=setup(fixture,path);await service.solve(session);const groupId=db.session(session.id)!.group_id;db.close();const reopened=new ProductDatabase(path);try{const next=new ProductService(reopened,fixture,'openai');assert.equal(reopened.session(session.id)!.group_id,groupId);assert.equal(next.ownConstraint(session).parsed.hardMax,450);assert.equal(next.group(session).proposal!.totalCents,145500);assert.equal(reopened.get<{n:number}>('SELECT count(*) AS n FROM proposal_allocations')!.n,4);assert.equal(reopened.get<{n:number}>('SELECT count(*) AS n FROM audit_events')!.n,2);}finally{reopened.close();rmSync(folder,{recursive:true});}
});
