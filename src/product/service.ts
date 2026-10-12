import { randomUUID } from 'node:crypto';
import { ProductDatabase, type Session } from './db.js';
import { invariant, normalize, validateParsed, publicPackage, PERSONAS, type MerchantPackage, type ParsedConstraint, type SolverResult, type Evaluation } from './domain.js';
import { solve, publicFacts, renderExplanation } from './solver.js';
import type { AiProvider } from './ai.js';
import type { CommitmentService } from './commitments.js';
import type { CaptureSagaService } from './capture-saga.js';
import { catalogForGroup } from './catalog.js';
import { ConsumerOfferService } from './offers.js';
import { AuthorityService } from './authority.js';
import { needsPriceGuide } from './needs-guide.js';

export class ProductService {
  get offers(){return new ConsumerOfferService(this.database,this.commitments);}
  constructor(readonly database: ProductDatabase, readonly ai: AiProvider, readonly aiMode: 'openai' | 'offline-demo',readonly commitments?:CommitmentService,readonly sagas?:CaptureSagaService) {}
  private current(session: Session) { const fresh=this.database.session(session.id); invariant(fresh,'SESSION_EXPIRED',401); return fresh; }
  private participant(session: Session) { const fresh=this.current(session); invariant(fresh.persona!=='merchant','PARTICIPANT_ONLY',403); invariant(fresh.group_id,'CREATE_OR_TRY_DEMO_FIRST',409); return fresh as Session & {group_id:string}; }
  private unchanged(session: Session, revision: number) { const fresh=this.participant(session); this.database.assertMutable(fresh.group_id); invariant(fresh.persona===session.persona && fresh.group_id===session.group_id,'PERSONA_CHANGED',409); invariant(this.database.goal(fresh.group_id).revision===revision,'PLAN_CHANGED_TRY_AGAIN',409); return fresh; }
  sessionView(session: Session) { const fresh=this.current(session);const joined=!!this.database.get('SELECT user_id FROM joined_identities WHERE session_id=?',fresh.id);const user=joined?this.database.get<{id:string;name:string;color:string}>('SELECT * FROM users WHERE id=?',fresh.persona):undefined;return {persona:fresh.persona,hasGroup:!!fresh.group_id,groupId:fresh.group_id,csrfToken:fresh.csrf_token,aiMode:this.aiMode,personas:joined?[user!]:[...PERSONAS,{id:'merchant',name:'Summit Weekend',color:'amber'}],demo:true,joinedIdentity:joined}; }
  switchPersona(session: Session, persona: unknown) { invariant(!this.database.get('SELECT user_id FROM joined_identities WHERE session_id=?',session.id),'INVITE_IDENTITY_CANNOT_SWITCH',403);invariant(typeof persona==='string' && [...PERSONAS.map(p=>p.id),'merchant'].includes(persona),'INVALID_PERSONA');this.database.run('UPDATE demo_sessions SET persona=? WHERE id=?',persona,session.id);return this.sessionView(session); }
  create(session: Session, name: unknown, description: unknown, seeded=false) { invariant(!this.database.get('SELECT user_id FROM joined_identities WHERE session_id=?',session.id),'INVITE_IDENTITY_CANNOT_USE_DEMO',403); invariant(typeof name==='string' && name.trim().length>=3 && name.trim().length<=80,'INVALID_PLAN_NAME');invariant(typeof description==='string' && description.trim().length>=10 && description.trim().length<=1000,'INVALID_GOAL');invariant(this.current(session).persona!=='merchant','PARTICIPANT_ONLY',403);this.database.assertMutable(this.current(session).group_id);this.database.createGroup(session,name.trim(),description.trim(),seeded);return this.group(session); }
  private catalogPackages(groupId?:string) {return catalogForGroup(this.database,groupId);}
  catalog() {return {merchant:{id:'summit-weekend',name:'Summit Weekend',fictional:true},packages:this.catalogPackages().map(publicPackage)};}
  private projection(e: Evaluation, persona: string, result:SolverResult) {
    const pkg=result.catalogSnapshot.find(p=>p.id===e.packageId)!;
    const publicFailures=e.checks.filter(c=>!c.passed && !c.userId && c.visibility==='PUBLIC').map(c=>c.key);
    return {package:publicPackage(pkg),feasible:e.feasible,publicFailures,groupNeedsMet:e.feasible,ownChecks:e.checks.filter(c=>c.userId===persona),ownAllocation:e.allocations.find(a=>a.userId===persona) ?? null,totalCents:e.totalCents,rank:e.rank,qualityScore:e.scores?.quality??null,priceEfficiency:e.scores?.priceEfficiency??null,
      comparisonLabels:!e.feasible?[]:[...(result.comparisons.recommendedId===e.packageId?['Best Value / Recommended']:[]),...(result.comparisons.lowestCostId===e.packageId?['Lowest Cost']:[]),...(result.comparisons.bestExperienceId===e.packageId?['Best Experience']:[])]};
  }
  group(session: Session) {
    const fresh=this.participant(session);const db=this.database;this.commitments?.reconcileIntegrity(fresh.group_id,fresh.persona);const goal=db.goal(fresh.group_id);const group=db.get<{name:string}>('SELECT name FROM groups WHERE id=?',fresh.group_id)!;
    const row=db.latestProposal(goal.id);const current=row && row.revision===goal.revision && row.state!=='PROPOSAL_STALE' ? row : undefined;
    const result=current ? JSON.parse(current.result_json) as SolverResult : null;
    if(current?.state==='PROPOSED' && this.commitments)db.transaction(()=>this.commitments!.ensure(current,fresh.persona));
    const progress=current && ['PROPOSED','CONFIRMED','REPLAN_REQUIRED'].includes(current.state)?this.commitments?.progress(current):undefined;
    const members=db.constraintRows(fresh.group_id).map(member=>{
      const parsed=validateParsed(JSON.parse(member.parsed_json));const allocation=result?.selected?.allocations.find(a=>a.userId===member.user_id);
      return {id:member.user_id,name:member.name,color:PERSONAS.find(p=>p.id===member.user_id)?.color??'blue',organizer:db.organizer(fresh.group_id,member.user_id),constraintsConfirmed:!!member.confirmed,shareCents:allocation?.shareCents ?? null,commitmentStatus:progress?.statuses[member.user_id]??'NOT_STARTED',publicRequirements:parsed.requirements.filter(r=>r.visibility==='PUBLIC'),publicPreferences:parsed.preferences.filter(r=>r.visibility==='PUBLIC')};
    });
    return {name:group.name,goal:goal.description,revision:goal.revision,state:progress?.state??goal.state,persona:fresh.persona,members,capturedCents:progress?.capturedCents??0,committedCount:progress?.committedCount??0,authorizedCents:progress?.authorizedCents??0,ready:progress?.ready??false,captureDetected:progress?.captureDetected??false,commitmentDeadline:progress?.deadline??null,paymentsAvailable:this.commitments?.available??false,phase:this.sagas?3:this.commitments?2:1,saga:this.sagas?.view(fresh)??null,negativeTestAvailable:this.sagas?.allowNegativeTest??false,availableOffers:this.offers.available(fresh),appliedOffer:this.offers.applied(fresh),proposal:current && result ? {id:current.id,revision:current.revision,feasible:result.feasible,package:result.selected ? publicPackage(result.catalogSnapshot.find(p=>p.id===result.selected!.packageId)!):null,totalCents:result.selected?.totalCents ?? null,explanation:current.explanation,explanationSource:current.explanation_source,valuePolicyVersion:result.policyVersion,ownAllocation:result.selected?.allocations.find(a=>a.userId===fresh.persona) ?? null,evaluations:result.evaluations.map(e=>this.projection(e,fresh.persona,result))}:null};
  }
  ownConstraint(session: Session) {const fresh=this.participant(session);const row=this.database.constraintRows(fresh.group_id).find(c=>c.user_id===fresh.persona)!;return {statement:row.statement,parsed:validateParsed(JSON.parse(row.parsed_json)),confirmed:!!row.confirmed,source:row.source,version:row.version,revision:this.database.goal(fresh.group_id).revision};}
  priceGuide(session: Session, draftId?: unknown) {
    const fresh=this.participant(session),own=this.ownConstraint(fresh);let parsed=own.parsed;
    if(draftId !== undefined) {
      invariant(typeof draftId==='string','INVALID_DRAFT');
      const draft=this.database.get<{parsed_json:string;goal_revision:number;created_at:string}>('SELECT parsed_json,goal_revision,created_at FROM constraint_drafts WHERE id=? AND group_id=? AND user_id=?',draftId,fresh.group_id,fresh.persona);
      invariant(draft,'DRAFT_NOT_FOUND',404);invariant(Date.now()-Date.parse(draft.created_at)<600000,'DRAFT_EXPIRED',409);
      invariant(draft.goal_revision===own.revision,'PLAN_CHANGED_TRY_AGAIN',409);parsed=validateParsed(JSON.parse(draft.parsed_json),true);
    }
    const merchant=this.database.get<{merchant_id:string}>('SELECT merchant_id FROM groups WHERE id=?',fresh.group_id)!.merchant_id;
    const catalog=this.catalogPackages(fresh.group_id);invariant(catalog.every(p=>p.merchantId===merchant),'MERCHANT_IDENTITY_MISMATCH',409);
    const identities=this.database.all<{user_id:string}>('SELECT user_id FROM group_members WHERE group_id=? ORDER BY user_id',fresh.group_id).map(m=>m.user_id);
    return needsPriceGuide(catalog,identities,fresh.persona,parsed,own.revision);
  }
  async interpret(session: Session, statement: unknown) {
    const fresh=this.participant(session);this.database.assertMutable(fresh.group_id);invariant(typeof statement==='string' && statement.trim().length>=10 && statement.length<=2000,'INVALID_STATEMENT');const revision=this.database.goal(fresh.group_id).revision;
    const interpreted=await this.ai.interpret(statement.trim());const parsed=validateParsed(interpreted.parsed,true);invariant(interpreted.source==='OPENAI'||interpreted.source==='OFFLINE_DEMO','INVALID_AI_SOURCE',502);
    this.unchanged(fresh,revision);const id=randomUUID();
    this.database.run('INSERT INTO constraint_drafts VALUES(?,?,?,?,?,?,?,?)',id,fresh.group_id,fresh.persona,revision,statement.trim(),JSON.stringify(parsed),interpreted.source,new Date().toISOString());
    return {draftId:id,parsed,source:interpreted.source,revision};
  }
  confirm(session: Session, draftId: unknown, input: unknown) {
    const fresh=this.participant(session);invariant(typeof draftId==='string','INVALID_DRAFT');
    return this.database.transaction(()=>{
      this.database.assertMutable(fresh.group_id);
      const draft=this.database.get<{statement:string;parsed_json:string;source:string;goal_revision:number;created_at:string}>('SELECT * FROM constraint_drafts WHERE id=? AND group_id=? AND user_id=?',draftId,fresh.group_id,fresh.persona);
      invariant(draft,'DRAFT_NOT_FOUND',404);invariant(Date.now()-Date.parse(draft.created_at)<600000,'DRAFT_EXPIRED',409);
      const original=validateParsed(JSON.parse(draft.parsed_json));invariant(!original.clarifications.length,'CLARIFY_BEFORE_CONFIRMING',409);
      const parsed=validateParsed(input);invariant(parsed.hardMax!==null && parsed.clarifications.length===0,'HARD_MAX_REQUIRED');
      const goal=this.database.goal(fresh.group_id);invariant(goal.revision===draft.goal_revision,'PLAN_CHANGED_TRY_AGAIN',409);
      const revision=goal.revision+1;
      this.commitments?.markStale(goal.id,fresh.persona);
      this.database.run('UPDATE constraints SET statement=?,parsed_json=?,confirmed=1,version=version+1,source=?,updated_at=? WHERE group_id=? AND user_id=?',draft.statement,JSON.stringify(parsed),draft.source,new Date().toISOString(),fresh.group_id,fresh.persona);
      this.database.run("UPDATE proposals SET state='PROPOSAL_STALE' WHERE goal_id=? AND state!='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM capture_sagas s WHERE s.proposal_id=proposals.id AND s.frozen_at IS NOT NULL)",goal.id);
      this.database.run("UPDATE purchase_goals SET revision=?,state='COLLECTING_CONSTRAINTS' WHERE id=?",revision,goal.id);
      this.database.run('DELETE FROM constraint_drafts WHERE id=?',draftId);this.database.audit(fresh.persona,'CONSTRAINT_CONFIRMED',goal.id,revision);
      return this.ownConstraint(fresh);
    });
  }
  async solve(session: Session) { invariant(this.database.constraintRows(this.current(session).group_id!).length===4,'INVITE_FOUR_PARTICIPANTS_FIRST',409);
    const fresh=this.participant(session);const db=this.database;const goal=db.goal(fresh.group_id);
    const existing=db.latestProposal(goal.id);if(existing?.revision===goal.revision && existing.state!=='PROPOSAL_STALE') return this.group(fresh);
    const catalog=this.catalogPackages(fresh.group_id);const catalogSnapshot=JSON.stringify(catalog);const merchant=db.get<{merchant_id:string}>('SELECT merchant_id FROM groups WHERE id=?',fresh.group_id)!.merchant_id;
    invariant(catalog.every(p=>p.merchantId===merchant),'MERCHANT_IDENTITY_MISMATCH',409);
    const members=db.constraintRows(fresh.group_id).map(row=>normalize(validateParsed(JSON.parse(row.parsed_json)),row.user_id,row.name,!!row.confirmed));
    const result=solve(catalog,members);const facts=publicFacts(result,catalog);const explained=await this.ai.explain(facts);
    invariant(explained.source==='OPENAI'||explained.source==='OFFLINE_DEMO','INVALID_AI_SOURCE',502);const explanation=renderExplanation(explained.selection,facts);this.unchanged(fresh,goal.revision);
    db.transaction(()=>{
      invariant(db.goal(fresh.group_id).revision===goal.revision,'PLAN_CHANGED_TRY_AGAIN',409);
      invariant(JSON.stringify(this.catalogPackages(fresh.group_id))===catalogSnapshot && db.get<{merchant_id:string}>('SELECT merchant_id FROM groups WHERE id=?',fresh.group_id)!.merchant_id===merchant,'CATALOG_CHANGED_TRY_AGAIN',409);
      if(db.latestProposal(goal.id)?.revision===goal.revision) return;
      const proposalId=randomUUID();const state=result.feasible?'PROPOSED':'REPLAN_REQUIRED';
      db.run('INSERT INTO proposals(id,goal_id,revision,package_id,state,result_json,explanation,explanation_source,created_at) VALUES(?,?,?,?,?,?,?,?,?)',proposalId,goal.id,goal.revision,result.selected?.packageId ?? null,state,JSON.stringify(result),explanation,explained.source,new Date().toISOString());
      for(const allocation of result.selected?.allocations ?? []) db.run('INSERT INTO proposal_allocations VALUES(?,?,?,?,?)',randomUUID(),proposalId,allocation.userId,allocation.shareCents,JSON.stringify(allocation.components));
      if(result.feasible && this.commitments)this.commitments.ensure(db.latestProposal(goal.id)!,fresh.persona);
      db.run('UPDATE purchase_goals SET state=? WHERE id=?',state,goal.id);db.audit(fresh.persona,'PROPOSAL_EVALUATED',proposalId,goal.revision);
    });
    return this.group(fresh);
  }
}
