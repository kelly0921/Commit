import {randomUUID} from 'node:crypto';
import {ProductDatabase,type Session,type ProposalRow} from './db.js';
import {invariant,normalize,validateParsed,type MerchantPackage,type OfferPackageTerms,type SolverResult} from './domain.js';
import {catalogForGroup,discountedCatalog} from './catalog.js';
import {solve,publicFacts} from './solver.js';
import {MerchantOfferService,offerEligibility,type OfferRow} from '../merchant/offers.js';
import {winterCatalog} from '../merchant/demand.js';
import type {CommitmentService} from './commitments.js';
import {mandatesPermit} from './authority.js';

export class ConsumerOfferService {
 readonly offers:MerchantOfferService;
 constructor(readonly database:ProductDatabase,readonly commitments?:CommitmentService){this.offers=new MerchantOfferService(database);}
 private participant(session:Session){const fresh=this.database.session(session.id);invariant(fresh&&fresh.group_id,'GROUP_REQUIRED',409);invariant(fresh.persona!=='merchant','PARTICIPANT_ONLY',403);return fresh as Session&{group_id:string};}
 private current(session:Session){const fresh=this.participant(session),goal=this.database.goal(fresh.group_id),proposal=this.database.latestProposal(goal.id);invariant(proposal?.revision===goal.revision&&['PROPOSED','REPLAN_REQUIRED'].includes(proposal.state),'CURRENT_PROPOSAL_REQUIRED',409);invariant(!this.database.get('SELECT id FROM capture_sagas WHERE proposal_id=?',proposal.id),'PURCHASE_ALREADY_STARTED',409);return {fresh,goal,proposal};}
 seed(session:Session){
  const fresh=this.participant(session);invariant(this.database.organizer(fresh.group_id,fresh.persona),'ORGANIZER_ONLY',403);const db=this.database;
  invariant(!db.latestProposal(db.goal(fresh.group_id).id),'UNSOLVED_DEMO_REQUIRED',409);
  db.transaction(()=>{
   db.run('INSERT INTO group_catalogs VALUES(?,?,?)',fresh.group_id,JSON.stringify(winterCatalog({packageId:'summit-lodge',targetDate:'2027-02-12',endDate:'2027-02-14'})),'phase-5-february');
   // A separately declared synthetic group has Lawrence's own-bed requirement from the Phase 3 fixture.
   const row=db.constraintRows(fresh.group_id).find(c=>c.user_id==='lawrence')!,parsed=validateParsed(JSON.parse(row.parsed_json));
   if(!parsed.requirements.some(r=>r.key==='ownBed'))parsed.requirements.push({key:'ownBed',value:true,visibility:'PRIVATE'});
   db.run('UPDATE constraints SET parsed_json=? WHERE group_id=? AND user_id=?',JSON.stringify(parsed),fresh.group_id,'lawrence');
   db.audit(fresh.persona,'OFFER_DEMO_SEEDED',fresh.group_id,1);
  });
 }
 private quote(row:OfferRow,proposal:ProposalRow,groupId:string){
  const db=this.database,catalog=catalogForGroup(db,groupId);
  const used=db.get<{n:number}>("SELECT COUNT(*) AS n FROM offer_applications WHERE offer_id=? AND state IN ('RESERVED','CONSUMED')",row.id)!.n;
  const size=db.get<{n:number}>('SELECT COUNT(*) AS n FROM group_members WHERE group_id=?',groupId)!.n;
  const allowed=catalog.filter(p=>!p.offer&&!offerEligibility(row,p,size,used));if(!allowed.length)return {unavailable:offerEligibility(row,catalog.find(p=>p.id===proposal.package_id)??catalog[0]!,size,used)??'OFFER_UNAVAILABLE',result:null};
  const terms=JSON.parse(row.terms_json) as OfferPackageTerms;
  const members=db.constraintRows(groupId).map(r=>normalize(validateParsed(JSON.parse(r.parsed_json)),r.user_id,r.name,!!r.confirmed));
  const result=solve(discountedCatalog(catalog,terms),members);
  if(!result.selected||(!result.catalogSnapshot.find(p=>p.id===result.selected!.packageId)?.offer||!allowed.some(p=>p.id===result.selected!.packageId)))return {unavailable:'HARD_BOUNDARIES_OR_VALUE',result:null};
  const previous=JSON.parse(proposal.result_json) as SolverResult,base=previous.selected??previous.evaluations.find(e=>e.packageId===result.selected!.packageId)!;
  if(result.selected.totalCents>=base.totalCents)return {unavailable:'NO_PRICE_IMPROVEMENT',result:null};
  return {unavailable:null,result};
 }
 available(session:Session){
  const fresh=this.participant(session),db=this.database,goal=db.goal(fresh.group_id),proposal=db.latestProposal(goal.id);
  this.offers.expire();if(!proposal||!['PROPOSED','REPLAN_REQUIRED'].includes(proposal.state)||proposal.revision!==goal.revision||db.get('SELECT id FROM capture_sagas WHERE proposal_id=?',proposal.id)||JSON.parse(proposal.result_json).catalogSnapshot.find((p:MerchantPackage)=>p.id===proposal.package_id)?.offer)return [];
  return db.all<OfferRow>("SELECT * FROM merchant_offer_versions WHERE status='PUBLISHED' ORDER BY version DESC").flatMap(row=>{
    const quote=this.quote(row,proposal,fresh.group_id);if(quote.unavailable)return [];
    const before=JSON.parse(proposal.result_json) as SolverResult,base=before.selected??before.evaluations.find(e=>e.packageId===quote.result!.selected!.packageId)!;return [{...JSON.parse(row.terms_json) as OfferPackageTerms,previousProposalId:proposal.id,previousTotalCents:base.totalCents,newTotalCents:quote.result!.selected!.totalCents,allocations:quote.result!.selected!.allocations.map(a=>({userId:a.userId,name:a.name,shareCents:a.shareCents}))}];
  });
 }
 automaticCandidate(session:Session){
  const fresh=this.participant(session),proposal=this.database.latestProposal(this.database.goal(fresh.group_id).id);if(!proposal)return null;
  const eligible=this.available(fresh),before=JSON.parse(proposal.result_json) as SolverResult;
  if(!eligible.length)return null;
  const variants=before.catalogSnapshot.map(pkg=>({...pkg,id:`${pkg.id}:current`}));
  const offersByVariant=new Map<string,(typeof eligible)[number]>();
  for(const offer of eligible){const row=this.offers.get(offer.id),quote=this.quote(row,proposal,fresh.group_id);if(!quote.result?.selected)continue;const pkg=quote.result.catalogSnapshot.find(p=>p.id===quote.result!.selected!.packageId)!,id=`${pkg.id}:offer:${offer.id}`;variants.push({...pkg,id});offersByVariant.set(id,offer);}
  const members=this.database.constraintRows(fresh.group_id).map(r=>normalize(validateParsed(JSON.parse(r.parsed_json)),r.user_id,r.name,!!r.confirmed));
  // One shared feasible pool supplies price efficiency, quality, fit and fairness.
  // Internal variant IDs disambiguate quotes; the saved exact package ID is never changed.
  const ranked=solve(variants,members);return ranked.selected?offersByVariant.get(ranked.selected.packageId)??null:null;
 }
 applied(session:Session){
  const fresh=this.participant(session),db=this.database,goal=db.goal(fresh.group_id),proposal=db.latestProposal(goal.id);if(!proposal||proposal.revision!==goal.revision)return null;
  this.reconcileReservations();const row=db.get<{previous_proposal_id:string;offer_snapshot_json:string;cleanup_state:string;state:string}>('SELECT * FROM offer_applications WHERE proposal_id=?',proposal.id);if(!row)return null;
  const before=JSON.parse(db.get<ProposalRow>('SELECT * FROM proposals WHERE id=?',row.previous_proposal_id)!.result_json) as SolverResult,result=JSON.parse(proposal.result_json) as SolverResult;
  const base=before.selected??before.evaluations.find(e=>e.packageId===result.selected!.packageId)!;
  return {terms:JSON.parse(row.offer_snapshot_json) as OfferPackageTerms,previousProposalId:row.previous_proposal_id,previousTotalCents:base.totalCents,previousOwnShareCents:base.allocations.find(a=>a.userId===fresh.persona)!.shareCents,newTotalCents:result.selected!.totalCents,savingsCents:base.totalCents-result.selected!.totalCents,cleanupState:row.cleanup_state,redemptionState:row.state};
 }
 async apply(session:Session,value:unknown,delegated=false,onApplied?:()=>void){
  invariant(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_OFFER_APPLICATION');const v=value as Record<string,unknown>;
  invariant(Object.keys(v).every(k=>['offerId','previousProposalId','confirmNewProposal'].includes(k))&&typeof v.offerId==='string'&&typeof v.previousProposalId==='string'&&v.confirmNewProposal===true,'EXPLICIT_GROUP_ACCEPTANCE_REQUIRED',403);
  const {fresh,goal,proposal}=this.current(session);invariant(this.database.organizer(fresh.group_id,fresh.persona),'ORGANIZER_ONLY',403);invariant(proposal.id===v.previousProposalId,'PROPOSAL_CHANGED_REVIEW_AGAIN',409);
  const db=this.database;let nextId='';
  db.transaction(()=>{
   db.assertMutable(fresh.group_id);invariant(db.goal(fresh.group_id).revision===goal.revision,'PROPOSAL_CHANGED_REVIEW_AGAIN',409);
   if(delegated)invariant(mandatesPermit(db,fresh.group_id,'better_offers'),'CONSUMER_MANDATE_REQUIRED',403);
   invariant(!db.get("SELECT c.id FROM commitments c JOIN proposal_allocations a ON a.id=c.allocation_id WHERE a.proposal_id=? AND (c.pending_operation IS NOT NULL OR c.lock_owner IS NOT NULL)",proposal.id),'PAYMENT_IN_PROGRESS_TRY_AGAIN',409);
   const row=this.offers.get(v.offerId as string),quote=this.quote(row,proposal,fresh.group_id);invariant(!quote.unavailable&&quote.result,quote.unavailable??'OFFER_UNAVAILABLE',409);
   const result=quote.result,revision=goal.revision+1,now=new Date().toISOString();nextId=randomUUID();
   this.commitments?.markStale(goal.id,fresh.persona);db.run("UPDATE proposals SET state='PROPOSAL_STALE' WHERE id=?",proposal.id);db.audit(fresh.persona,'PROPOSAL_SUPERSEDED',proposal.id,proposal.revision);
   db.run("UPDATE purchase_goals SET revision=?,state='PROPOSED' WHERE id=?",revision,goal.id);
   const facts=publicFacts(result,result.catalogSnapshot);db.run("INSERT INTO proposals(id,goal_id,revision,package_id,state,result_json,explanation,explanation_source,created_at) VALUES(?,?,?,?,'PROPOSED',?,?,'OFFLINE_DEMO',?)",nextId,goal.id,revision,result.selected!.packageId,JSON.stringify(result),facts.slice(0,3).map(f=>f.text).join(' '),now);
   for(const a of result.selected!.allocations)db.run('INSERT INTO proposal_allocations VALUES(?,?,?,?,?)',randomUUID(),nextId,a.userId,a.shareCents,JSON.stringify(a.components));
   db.run("INSERT INTO offer_applications VALUES(?,?,?,?,?,?,'RESERVED','PENDING',?,NULL)",randomUUID(),row.id,fresh.group_id,proposal.id,nextId,row.terms_json,now);
   this.commitments?.ensure(db.get<ProposalRow>('SELECT * FROM proposals WHERE id=?',nextId)!,fresh.persona);
   for(const c of this.commitments?.rows(nextId)??[])db.audit('system','NEW_COMMITMENT_CREATED',c.id,revision);
   db.audit(fresh.persona,'OFFER_APPLIED_TO_PROPOSAL',nextId,revision);onApplied?.();
  });
  if(delegated){const oldOrders=db.get("SELECT c.id FROM commitments c JOIN proposal_allocations a ON a.id=c.allocation_id WHERE a.proposal_id=? AND c.paypal_order_id IS NOT NULL",proposal.id);db.run('UPDATE offer_applications SET cleanup_state=? WHERE proposal_id=?',oldOrders?'REQUIRES_RETRY':'COMPLETE',nextId);}else await this.cleanup(fresh,nextId);return {proposalId:nextId};
 }
 async cleanup(session:Session,proposalId:unknown){
  const fresh=this.participant(session);invariant(this.database.organizer(fresh.group_id,fresh.persona),'ORGANIZER_ONLY',403);invariant(typeof proposalId==='string','PROPOSAL_REQUIRED');
  const row=this.database.get<{id:string;previous_proposal_id:string;cleanup_state:string}>("SELECT a.* FROM offer_applications a JOIN proposals p ON p.id=a.proposal_id JOIN purchase_goals g ON g.id=p.goal_id WHERE a.proposal_id=? AND a.group_id=? AND p.revision=g.revision",proposalId,fresh.group_id);invariant(row,'OFFER_APPLICATION_NOT_FOUND',404);
  if(row.cleanup_state==='COMPLETE')return {complete:true,failures:[]};
  const result=this.commitments?await this.commitments.cleanupSuperseded(fresh,row.previous_proposal_id):{complete:true,failures:[]};
  this.database.run('UPDATE offer_applications SET cleanup_state=? WHERE id=?',result.complete?'COMPLETE':'REQUIRES_RETRY',row.id);return result;
 }
 reconcileReservations(){const db=this.database;db.transaction(()=>{
  for(const row of db.all<{id:string;proposal_id:string;revision:number;state:string}>("SELECT a.id,a.proposal_id,p.revision,s.state FROM offer_applications a JOIN proposals p ON p.id=a.proposal_id JOIN capture_sagas s ON s.proposal_id=p.id WHERE a.state='RESERVED' AND (s.state='COMPENSATED' OR (s.state='CONFIRMED' AND p.state='CONFIRMED'))")){
   const consumed=row.state==='CONFIRMED';const updated=db.run("UPDATE offer_applications SET state=?,consumed_at=? WHERE id=? AND state='RESERVED'",consumed?'CONSUMED':'RELEASED',consumed?new Date().toISOString():null,row.id);
   if(Number(updated.changes))db.audit('system',consumed?'OFFER_REDEMPTION_CONSUMED':'OFFER_RESERVATION_RELEASED',row.proposal_id,row.revision);
  }
 });}
}
