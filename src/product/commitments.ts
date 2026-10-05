import { createHash, randomUUID } from 'node:crypto';
import { ProductDatabase, type ProposalRow, type Session } from './db.js';
import { invariant, normalize, validateParsed, publicPackage, ProductError, type CommitmentEnvelope, type SolverResult } from './domain.js';
import { VALUE_POLICY_VERSION } from './solver.js';
import { catalogForGroup } from './catalog.js';
import { PayPalError, type Authorization, type Order, type PayPalGateway, type Money } from '../model.js';

// Participant approvals never receive capture/refund capabilities; the organizer saga owns those.
export type CommitmentGateway = Pick<PayPalGateway,'createAuthorizationOrder'|'getOrder'|'authorizeOrder'|'getAuthorization'|'voidAuthorization'>;
type Operation = 'create'|'authorize'|'void';
export type CommitmentRow = {
  id:string;allocation_id:string;proposal_id:string;user_id:string;goal_id:string;revision:number;share_cents:number;
  state:string;authorized_ceiling_cents:number;currency:string;proposal_version:number;proposal_fingerprint:string;
  paypal_order_id:string|null;paypal_authorization_id:string|null;paypal_capture_id:string|null;order_status:string|null;authorization_status:string|null;
  authorized_amount_cents:number|null;authorized_currency:string|null;authorized_at:string|null;expires_at:string|null;
  verified_at:string|null;merchant_id:string|null;approval_url:string|null;created_at:string;updated_at:string;
  create_request_key:string;authorize_request_key:string;void_request_key:string;
  create_attempt_at:string|null;authorize_attempt_at:string|null;void_attempt_at:string|null;
  pending_operation:Operation|null;lock_owner:string|null;lock_until:string|null;last_error:string|null;
  capture_detected:number;observed_capture_cents:number;
  approved_envelope_json:string|null;
};
const SELECT = 'SELECT c.*,a.proposal_id,a.user_id,a.share_cents,p.goal_id,p.revision FROM commitments c JOIN proposal_allocations a ON a.id=c.allocation_id JOIN proposals p ON p.id=a.proposal_id';
const FRESH_MS=5*60*1000, DEADLINE_MS=24*60*60*1000, ORDERS_RETRY_MS=6*60*60*1000;
function cents(money:Money|undefined):number {
  invariant(money && /^\d{1,8}\.\d{2}$/.test(money.value),'PAYPAL_INVALID_AMOUNT',502);
  const value=Number(money.value.replace('.',''));invariant(Number.isSafeInteger(value),'PAYPAL_INVALID_AMOUNT',502);return value;
}
function approvalUrl(value:string|undefined):string|null {
  if(!value)return null;
  let url:URL;try{url=new URL(value);}catch{throw new ProductError('PAYPAL_INVALID_APPROVAL_URL',502);}
  invariant(url.protocol==='https:' && ['www.sandbox.paypal.com','sandbox.paypal.com'].includes(url.hostname) && !url.username && !url.password && !url.port,'PAYPAL_INVALID_APPROVAL_URL',502);
  return url.href;
}

export class CommitmentService {
  private readonly processId=randomUUID();
  constructor(readonly database:ProductDatabase,readonly gateway:CommitmentGateway|undefined,readonly origin='http://127.0.0.1:3002',readonly expectedMerchantId?:string) {
    let checkout:URL;try{checkout=new URL(origin);}catch{throw new ProductError('INVALID_CHECKOUT_ORIGIN',500);}
    invariant(checkout.origin===origin&&!checkout.username&&!checkout.password&&(checkout.protocol==='https:'||/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)),'INVALID_CHECKOUT_ORIGIN',500);
  }
  get available(){return !!this.gateway;}
  private participant(session:Session) {
    const fresh=this.database.session(session.id);invariant(fresh,'SESSION_EXPIRED',401);
    invariant(fresh.persona!=='merchant','PARTICIPANT_ONLY',403);invariant(fresh.group_id,'CREATE_OR_TRY_DEMO_FIRST',409);
    return fresh as Session & {group_id:string};
  }
  rows(proposalId:string){return this.database.all<CommitmentRow>(SELECT+' WHERE a.proposal_id=? ORDER BY a.user_id',proposalId);}
  private row(id:string){const row=this.database.get<CommitmentRow>(SELECT+' WHERE c.id=?',id);invariant(row,'COMMITMENT_NOT_FOUND',404);return row;}
  fingerprint(proposal:ProposalRow) {
    const db=this.database;const goal=db.get<{group_id:string;description:string}>('SELECT group_id,description FROM purchase_goals WHERE id=?',proposal.goal_id)!;
    return createHash('sha256').update(JSON.stringify({id:proposal.id,revision:proposal.revision,goal:goal.description,policy:VALUE_POLICY_VERSION,
      merchant:db.get('SELECT merchant_id FROM groups WHERE id=?',goal.group_id),
      package:db.get('SELECT group_id FROM group_catalogs WHERE group_id=?',goal.group_id)||db.get('SELECT id FROM offer_applications WHERE proposal_id=?',proposal.id)
        ? {merchant_id:db.get<{merchant_id:string}>('SELECT merchant_id FROM groups WHERE id=?',goal.group_id)!.merchant_id,data_json:JSON.stringify(catalogForGroup(db,goal.group_id).find(p=>p.id===proposal.package_id))}
        : db.get('SELECT merchant_id,data_json FROM merchant_packages WHERE id=?',proposal.package_id),
      approvedCatalog:JSON.parse(proposal.result_json).catalogSnapshot,
      members:db.all('SELECT user_id,role FROM group_members WHERE group_id=? ORDER BY user_id',goal.group_id),
      constraints:db.all('SELECT user_id,version,confirmed,parsed_json FROM constraints WHERE group_id=? ORDER BY user_id',goal.group_id),
      allocations:db.all('SELECT id,user_id,share_cents,components_json FROM proposal_allocations WHERE proposal_id=? ORDER BY user_id',proposal.id)
    })).digest('hex');
  }
  private envelope(proposal:ProposalRow,userId:string,amountCeilingCents:number):CommitmentEnvelope {
    const result=JSON.parse(proposal.result_json) as SolverResult;
    const pkg=result.catalogSnapshot?.find(p=>p.id===proposal.package_id);
    invariant(pkg && result.policyVersion===VALUE_POLICY_VERSION,'FRESH_COMMERCIAL_PROPOSAL_REQUIRED',409);
    const goal=this.database.get<{group_id:string}>('SELECT group_id FROM purchase_goals WHERE id=?',proposal.goal_id)!;
    const member=this.database.constraintRows(goal.group_id).find(c=>c.user_id===userId)!;
    const buyer=normalize(validateParsed(JSON.parse(member.parsed_json)),userId,member.name,!!member.confirmed);
    invariant(buyer.confirmed && buyer.hardMaxCents!==null && amountCeilingCents<=buyer.hardMaxCents,'BUYER_BOUNDARY_VIOLATED',409);
    return {proposalId:proposal.id,proposalVersion:proposal.revision,merchantId:pkg.merchantId,packageId:pkg.id,participantId:userId,amountCeilingCents,buyerHardMaxCents:buyer.hardMaxCents,buyerHardConditions:buyer.requirements,currency:'USD',packageTerms:publicPackage(pkg),merchantBoundaryFingerprint:createHash('sha256').update(JSON.stringify(pkg.merchantBoundaries)).digest('hex'),valuePolicyVersion:result.policyVersion};
  }
  // Caller holds a short SQL transaction. Existing Phase 1 proposals are backfilled once.
  ensure(proposal:ProposalRow,actor:string) {
    if(proposal.state!=='PROPOSED')return;
    if(this.database.get('SELECT id FROM capture_sagas WHERE proposal_id=?',proposal.id))return;
    const db=this.database;const result=JSON.parse(proposal.result_json) as SolverResult;
    invariant(result.feasible && result.selected,'NO_FEASIBLE_PROPOSAL',409);
    const allocations=db.all<{id:string;user_id:string;share_cents:number}>('SELECT * FROM proposal_allocations WHERE proposal_id=?',proposal.id);
    invariant(allocations.length===4 && allocations.every(a=>result.selected!.allocations.some(s=>s.userId===a.user_id && s.shareCents===a.share_cents)) && allocations.reduce((sum,a)=>sum+a.share_cents,0)===result.selected.totalCents,'ALLOCATION_INTEGRITY_FAILED',409);
    const fingerprint=proposal.commitment_fingerprint ?? this.fingerprint(proposal);const now=new Date().toISOString();
    db.run('UPDATE proposals SET commitment_fingerprint=COALESCE(commitment_fingerprint,?) WHERE id=?',fingerprint,proposal.id);
    for(const a of allocations){
      if(db.get('SELECT id FROM commitments WHERE allocation_id=?',a.id))continue;
      const envelope=this.envelope(proposal,a.user_id,a.share_cents);
      const id=randomUUID();db.run(`INSERT INTO commitments(id,allocation_id,state,authorized_ceiling_cents,proposal_version,proposal_fingerprint,created_at,updated_at,create_request_key,authorize_request_key,void_request_key,approved_envelope_json)
        VALUES(?,?,'NOT_STARTED',?,?,?,?,?,?,?,?,?)`,id,a.id,a.share_cents,proposal.revision,fingerprint,now,now,randomUUID(),randomUUID(),randomUUID(),JSON.stringify(envelope));
      db.audit(actor,'COMMITMENT_CREATED',id,proposal.revision);
    }
  }
  markStale(goalId:string,actor:string) {
    const db=this.database;for(const row of db.all<CommitmentRow>(SELECT+" WHERE p.goal_id=? AND c.state NOT IN ('STALE','VOIDED','CAPTURED','REFUNDED')",goalId)){
      db.run("UPDATE commitments SET state='STALE',verified_at=NULL,updated_at=? WHERE id=?",new Date().toISOString(),row.id);db.audit(actor,'COMMITMENT_STALE',row.id,row.revision);
    }
    db.run("UPDATE proposals SET financial_state='PROPOSAL_STALE' WHERE goal_id=? AND state!='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM capture_sagas s WHERE s.proposal_id=proposals.id AND s.frozen_at IS NOT NULL)",goalId);
  }
  reconcileIntegrity(groupId:string,actor:string) {
    const db=this.database;const goal=db.goal(groupId);const p=db.latestProposal(goal.id);
    if(!p || p.state!=='PROPOSED' || p.revision!==goal.revision)return;
    if(db.get('SELECT id FROM capture_sagas WHERE proposal_id=?',p.id))return;
    if(!p.commitment_fingerprint){db.transaction(()=>this.ensure(p,actor));return;}
    if(p.commitment_fingerprint!==this.fingerprint(p))db.transaction(()=>{
      this.markStale(goal.id,actor);db.run("UPDATE proposals SET state='PROPOSAL_STALE' WHERE goal_id=? AND state!='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM capture_sagas s WHERE s.proposal_id=proposals.id AND s.frozen_at IS NOT NULL)",goal.id);
      db.run("UPDATE purchase_goals SET revision=revision+1,state='COLLECTING_CONSTRAINTS' WHERE id=? AND revision=?",goal.id,goal.revision);
      db.audit(actor,'PROPOSAL_INTEGRITY_CHANGED',p.id,goal.revision);
    });
  }
  isCurrent(c:CommitmentRow) {
    const db=this.database;const p=db.get<ProposalRow>('SELECT * FROM proposals WHERE id=?',c.proposal_id)!;
    const goal=db.get<{revision:number}>('SELECT revision FROM purchase_goals WHERE id=?',c.goal_id)!;
    return p.state==='PROPOSED' && p.revision===goal.revision && c.proposal_version===p.revision && c.proposal_fingerprint===p.commitment_fingerprint && p.commitment_fingerprint===this.fingerprint(p) && c.share_cents===c.authorized_ceiling_cents && !!c.approved_envelope_json && c.approved_envelope_json===JSON.stringify(this.envelope(p,c.user_id,c.share_cents));
  }
  private currentOwned(session:Session,proposalId:unknown) {
    const fresh=this.participant(session);invariant(typeof proposalId==='string','PROPOSAL_REQUIRED');
    this.reconcileIntegrity(fresh.group_id,fresh.persona);const goal=this.database.goal(fresh.group_id);const p=this.database.latestProposal(goal.id);
    this.database.assertMutable(fresh.group_id);
    invariant(p?.id===proposalId && p.revision===goal.revision && p.state==='PROPOSED','PROPOSAL_CHANGED_REVIEW_AGAIN',409);
    invariant(!this.database.get("SELECT id FROM offer_applications WHERE proposal_id=? AND cleanup_state!='COMPLETE'",p.id),'STALE_AUTHORIZATION_CLEANUP_REQUIRED',409);
    this.database.transaction(()=>this.ensure(p,fresh.persona));const c=this.rows(p.id).find(c=>c.user_id===fresh.persona);invariant(c,'COMMITMENT_NOT_FOUND',404);
    invariant(this.isCurrent(c) && c.state!=='STALE','COMMITMENT_STALE',409);return {fresh,c};
  }
  private ownById(session:Session,id:unknown) {
    const fresh=this.participant(session);invariant(typeof id==='string','COMMITMENT_REQUIRED');
    const c=this.database.get<CommitmentRow>(SELECT+' JOIN purchase_goals g ON g.id=p.goal_id WHERE c.id=? AND a.user_id=? AND g.group_id=?',id,fresh.persona,fresh.group_id);
    invariant(c,'COMMITMENT_NOT_FOUND',404);return {fresh,c};
  }
  private completed(session:Session){const fresh=this.participant(session);invariant(fresh.persona===session.persona && fresh.group_id===session.group_id,'PERSONA_CHANGED',409);return this.own(fresh);}
  private privateView(c:CommitmentRow) {
    const watch=this.database.get<{source_hash:string}>('SELECT source_hash FROM agent_watch_state WHERE id=?',`approval:${c.id}`),poll=watch?JSON.parse(watch.source_hash):null;
    return {id:c.id,proposalId:c.proposal_id,proposalVersion:c.proposal_version,amountCents:c.authorized_ceiling_cents,currency:c.currency,state:c.state,
      reconciliation:poll?.attention?'ATTENTION':['ORDER_CREATED','PAYER_APPROVED'].includes(c.state)||(c.state==='FAILED'&&poll)?'CHECKING':null,
      orderId:c.paypal_order_id,authorizationId:c.paypal_authorization_id,orderStatus:c.order_status,authorizationStatus:c.authorization_status,
      authorizedAmountCents:c.authorized_amount_cents,authorizedAt:c.authorized_at,expiresAt:c.expires_at,verifiedAt:c.verified_at,
      approvalUrl:c.state==='ORDER_CREATED'||c.state==='PAYER_APPROVED'||c.state==='FAILED'?c.approval_url:null,
      pendingOperation:c.pending_operation,lastError:c.last_error,createdAt:c.created_at,updatedAt:c.updated_at,envelope:c.approved_envelope_json?JSON.parse(c.approved_envelope_json) as CommitmentEnvelope:null};
  }
  own(session:Session) {
    const fresh=this.participant(session);this.reconcileIntegrity(fresh.group_id,fresh.persona);
    const goal=this.database.goal(fresh.group_id);const p=this.database.latestProposal(goal.id);const current=p?.state==='PROPOSED' && p.revision===goal.revision?p:null;
    if(current)this.database.transaction(()=>this.ensure(current,fresh.persona));
    const rows=this.database.all<CommitmentRow>(SELECT+' JOIN purchase_goals g ON g.id=p.goal_id WHERE a.user_id=? AND g.group_id=? ORDER BY c.created_at DESC',fresh.persona,fresh.group_id);
    return {available:this.available,current:rows.find(c=>c.proposal_id===current?.id) ? this.privateView(rows.find(c=>c.proposal_id===current?.id)!) : null,
      history:rows.filter(c=>c.proposal_id!==current?.id).map(c=>this.privateView(c))};
  }
  progress(p:ProposalRow) {
    return this.database.transaction(()=>this.calculateProgress(this.database.get<ProposalRow>('SELECT * FROM proposals WHERE id=?',p.id)!));
  }
  private calculateProgress(p:ProposalRow) {
    const db=this.database;const rows=this.rows(p.id);const now=Date.now();
    const saga=db.get<{state:string}>('SELECT state FROM capture_sagas WHERE proposal_id=?',p.id);
    if(saga){const steps=db.all<{operation:string;state:string;amount_cents:number}>("SELECT * FROM financial_steps WHERE saga_id=(SELECT id FROM capture_sagas WHERE proposal_id=?)",p.id);return {ready:false,state:saga.state,committedCount:rows.filter(c=>['AUTHORIZED','CAPTURED','REFUNDED'].includes(c.state)).length,requiredCount:rows.length,authorizedCents:rows.filter(c=>c.state==='AUTHORIZED').reduce((s,c)=>s+c.share_cents,0),capturedCents:steps.filter(s=>s.operation==='CAPTURE'&&s.state==='SUCCEEDED').reduce((a,s)=>a+s.amount_cents,0),captureDetected:false,deadline:null,statuses:Object.fromEntries(rows.map(c=>[c.user_id,c.state]))};}
    const times=rows.filter(c=>c.authorized_at).map(c=>Date.parse(c.authorized_at!)).filter(Number.isFinite);
    const deadline=times.length?Math.min(...times)+DEADLINE_MS:null;
    const valid=(c:CommitmentRow)=>this.isCurrent(c) && c.state==='AUTHORIZED' && c.pending_operation===null && c.authorization_status==='CREATED' && !!c.paypal_authorization_id &&
      c.authorized_amount_cents===c.share_cents && c.authorized_currency==='USD' && !c.capture_detected &&
      !!c.verified_at && now-Date.parse(c.verified_at)>=-FRESH_MS && now-Date.parse(c.verified_at)<=FRESH_MS &&
      !!c.authorized_at && Date.parse(c.authorized_at)<=now+FRESH_MS && !!c.expires_at && Date.parse(c.expires_at)>now && deadline!==null && deadline>now;
    const accepted=rows.filter(valid);const members=db.all<{user_id:string}>('SELECT user_id FROM group_members WHERE group_id=(SELECT group_id FROM purchase_goals WHERE id=?)',p.goal_id);
    const history=db.all<CommitmentRow>(SELECT+' WHERE p.goal_id=?',p.goal_id);
    const ready=!history.some(c=>!!c.capture_detected) && members.length===4 && rows.length===members.length && members.every(m=>rows.some(c=>c.user_id===m.user_id)) && accepted.length===members.length;
    const state=ready?'READY_TO_CAPTURE':'AWAITING_COMMITMENTS';
    if(p.state==='PROPOSED' && db.get<{revision:number}>('SELECT revision FROM purchase_goals WHERE id=?',p.goal_id)?.revision===p.revision){
      if(p.financial_state!==state){db.run('UPDATE proposals SET financial_state=? WHERE id=?',state,p.id);if(ready)db.audit('system','PROPOSAL_READY_TO_CAPTURE',p.id,p.revision);}
      db.run('UPDATE purchase_goals SET state=? WHERE id=?',state,p.goal_id);
    }
    return {ready,state,committedCount:accepted.length,requiredCount:members.length,authorizedCents:accepted.reduce((sum,c)=>sum+c.authorized_amount_cents!,0),
      capturedCents:history.reduce((sum,c)=>sum+c.observed_capture_cents,0),captureDetected:history.some(c=>!!c.capture_detected),
      deadline:deadline!==null&&Number.isFinite(deadline)?new Date(deadline).toISOString():null,
      statuses:Object.fromEntries(rows.map(c=>[c.user_id,c.state==='AUTHORIZED'&&!valid(c)?'NEEDS_VERIFICATION':c.state]))};
  }
  private event(c:CommitmentRow,operation:string,status:string,requestKey:string|null=null,debugId?:string) {
    this.database.run('INSERT INTO payment_events VALUES(?,?,NULL,?,?,?,?,?)',randomUUID(),c.id,operation,status,requestKey,debugId??null,new Date().toISOString());
  }
  private transition(c:CommitmentRow,state:string,action:string) {
    const latest=this.row(c.id);const actual=latest.state==='STALE'||!this.isCurrent(latest)?'STALE':state;
    this.database.run('UPDATE commitments SET state=?,updated_at=? WHERE id=?',actual,new Date().toISOString(),c.id);
    if(latest.state!==actual)this.database.audit(c.user_id,actual==='STALE'?'COMMITMENT_STALE':action,c.id,c.revision);
  }
  private renew(c:CommitmentRow){const result=this.database.run('UPDATE commitments SET lock_until=? WHERE id=? AND lock_owner=? AND lock_until>=?',new Date(Date.now()+120000).toISOString(),c.id,this.processId,new Date().toISOString());invariant(Number(result.changes)===1,'COMMITMENT_LEASE_LOST',409);}
  private request(c:CommitmentRow,op:Operation) {
    const latest=this.row(c.id);const at=latest[`${op}_attempt_at`];
    const window=op==='void'?45*86400000:ORDERS_RETRY_MS;invariant(!at || Date.now()-Date.parse(at)<window,'PAYPAL_RETRY_WINDOW_EXPIRED_RECONCILE',409);
    this.database.run(`UPDATE commitments SET ${op}_attempt_at=COALESCE(${op}_attempt_at,?),pending_operation=?,updated_at=? WHERE id=?`,new Date().toISOString(),op,new Date().toISOString(),c.id);
    this.renew(c);return latest[`${op}_request_key`];
  }
  private async locked<T>(c:CommitmentRow,op:string,work:()=>Promise<T>):Promise<T> {
    const db=this.database;const now=new Date().toISOString();
    const locked=db.run('UPDATE commitments SET lock_owner=?,lock_until=? WHERE id=? AND (lock_owner IS NULL OR lock_until<?)',this.processId,new Date(Date.now()+120000).toISOString(),c.id,now);
    invariant(Number(locked.changes)===1,'COMMITMENT_IN_PROGRESS',409);
    if(op==='void')db.run("UPDATE commitments SET pending_operation='void' WHERE id=?",c.id);
    try{return await work();}catch(error){
      if(!(error instanceof ProductError && ['APPROVAL_NOT_READY','COMMITMENT_LEASE_LOST','FRESH_PROPOSAL_REQUIRED_AFTER_VOID'].includes(error.code))){
        const code=error instanceof ProductError||error instanceof PayPalError?error.code:'PAYPAL_UNEXPECTED_ERROR';
        db.run('UPDATE commitments SET last_error=?,verified_at=NULL,updated_at=? WHERE id=?',code,new Date().toISOString(),c.id);
        this.transition(c,'FAILED','PAYMENT_FAILED');this.event(c,op,code,null,error instanceof PayPalError?error.debugId:undefined);
      }
      if(error instanceof PayPalError)throw new ProductError(error.code,502);throw error;
    }finally{db.run('UPDATE commitments SET lock_owner=NULL,lock_until=NULL WHERE id=? AND lock_owner=?',c.id,this.processId);}
  }
  private adopt(c:CommitmentRow,order:Order) {
    const db=this.database;const current=this.row(c.id);
    // Persist identifiers before trusting money/status or making another network call.
    if(!current.paypal_order_id)db.run('UPDATE commitments SET paypal_order_id=? WHERE id=?',order.id,c.id);
    if(order.authorizations[0]){
      const id=order.authorizations[0].id;
      invariant(!current.paypal_authorization_id || current.paypal_authorization_id===id,'PAYPAL_AUTHORIZATION_ID_CHANGED',502);
      db.run('UPDATE commitments SET paypal_authorization_id=? WHERE id=?',id,c.id);
    }
    db.run('UPDATE commitments SET order_status=?,updated_at=? WHERE id=?',order.status,new Date().toISOString(),c.id);
    if(order.captures.length)db.run('UPDATE commitments SET capture_detected=1,observed_capture_cents=? WHERE id=?',order.captures.filter(x=>x.status==='COMPLETED').reduce((sum,x)=>sum+cents(x.amount),0),c.id);
  }
  private validateOrder(c:CommitmentRow,order:Order) {
    const latest=this.row(c.id);
    invariant(order.id===latest.paypal_order_id && order.intent==='AUTHORIZE' && order.unitCount===1 && order.referenceId===c.id && order.customId===c.id,'PAYPAL_ORDER_BINDING_MISMATCH',502);
    invariant(order.amount?.currencyCode==='USD' && cents(order.amount)===c.authorized_ceiling_cents,'PAYPAL_ORDER_AMOUNT_MISMATCH',502);
    invariant(order.authorizations.length<=1 && order.captures.length===0,'PAYPAL_UNEXPECTED_PAYMENT_RESOURCE',502);
    invariant(order.merchantId && (!this.expectedMerchantId||order.merchantId===this.expectedMerchantId) && (!latest.merchant_id||latest.merchant_id===order.merchantId),'PAYPAL_MERCHANT_MISMATCH',502);
    invariant(this.database.all<{merchant_id:string}>(SELECT+' WHERE p.goal_id=? AND c.merchant_id IS NOT NULL',c.goal_id).every(other=>other.merchant_id===order.merchantId),'PAYPAL_MERCHANT_MISMATCH',502);
    this.database.run('UPDATE commitments SET merchant_id=? WHERE id=?',order.merchantId,c.id);
  }
  private saveAuthorization(c:CommitmentRow,auth:Authorization) {
    const db=this.database;const latest=this.row(c.id);
    invariant(auth.id===latest.paypal_authorization_id,'PAYPAL_AUTHORIZATION_BINDING_MISMATCH',502);
    const amount=cents(auth.amount);
    db.run('UPDATE commitments SET authorized_amount_cents=?,authorized_currency=?,authorization_status=?,authorized_at=?,expires_at=? WHERE id=?',amount,auth.amount.currencyCode,auth.status,auth.createTime??null,auth.expirationTime??null,c.id);
    if(auth.status==='CAPTURED'||auth.status==='PARTIALLY_CAPTURED')db.run('UPDATE commitments SET capture_detected=1 WHERE id=?',c.id);
    invariant(auth.amount.currencyCode==='USD' && amount===c.authorized_ceiling_cents,'PAYPAL_AUTHORIZATION_AMOUNT_MISMATCH',502);
    const created=Date.parse(auth.createTime??''),expiry=Date.parse(auth.expirationTime??'');
    if(auth.status==='VOIDED'){db.run("UPDATE commitments SET state='VOIDED',updated_at=? WHERE id=?",new Date().toISOString(),c.id);if(latest.state!=='VOIDED')db.audit(c.user_id,'PAYPAL_VOIDED',c.id,c.revision);return;}
    invariant(auth.status==='CREATED','PAYPAL_AUTHORIZATION_NOT_ACTIVE',409);
    invariant(Number.isFinite(created) && created<=Date.now()+FRESH_MS && Number.isFinite(expiry) && expiry>created && expiry>Date.now(),'PAYPAL_AUTHORIZATION_INVALID_TIMES',409);
    this.transition(c,'AUTHORIZED','PAYPAL_AUTHORIZED');
  }
  private async verifyLocked(c:CommitmentRow) {
    const gateway=this.gateway!;const latest=this.row(c.id);invariant(latest.paypal_order_id,'PAYPAL_ORDER_NOT_CREATED',409);
    this.renew(c);const response=await gateway.getOrder(latest.paypal_order_id);const order=response.resource;this.adopt(c,order);this.validateOrder(c,order);
    this.event(c,'getOrder',order.status,null,response.debugId);
    if(order.authorizations.length){
      invariant(order.status==='COMPLETED','PAYPAL_AUTHORIZED_ORDER_STATUS_MISMATCH',502);
      this.renew(c);const authorization=await gateway.getAuthorization(this.row(c.id).paypal_authorization_id!);
      invariant(latest.pending_operation!=='void'||authorization.resource.status==='VOIDED','PAYPAL_VOID_OUTCOME_PENDING',409);
      this.saveAuthorization(c,authorization.resource);this.event(c,'getAuthorization',authorization.resource.status,null,authorization.debugId);
      this.database.run('UPDATE commitments SET pending_operation=NULL,last_error=NULL,verified_at=?,updated_at=? WHERE id=?',new Date().toISOString(),new Date().toISOString(),c.id);
      // A successful operator retry also resumes routine background freshness checks.
      this.database.run('UPDATE agent_watch_state SET source_hash=?,updated_at=? WHERE id=?',JSON.stringify({failures:0,attention:false,nextAt:Date.now()+60000}),new Date().toISOString(),`approval:${c.id}`);
    }else{
      invariant(!latest.paypal_authorization_id,'PAYPAL_AUTHORIZATION_MISSING_FROM_ORDER',502);
      if(order.status==='APPROVED')this.transition(c,'PAYER_APPROVED','PAYER_APPROVED');
      else {invariant(order.status==='CREATED'||order.status==='PAYER_ACTION_REQUIRED','PAYPAL_ORDER_NOT_APPROVABLE',409);this.transition(c,'ORDER_CREATED','PAYPAL_ORDER_CREATED');}
    }
    return this.row(c.id);
  }
  async create(session:Session,proposalId:unknown) {
    invariant(this.gateway,'PAYPAL_SANDBOX_NOT_CONFIGURED',503);const {fresh,c}=this.currentOwned(session,proposalId);
    await this.locked(c,'create',async()=>{
      invariant(this.isCurrent(this.row(c.id))&&this.row(c.id).state!=='STALE','COMMITMENT_STALE',409);
      const latest=this.row(c.id);invariant(latest.state!=='VOIDED','FRESH_PROPOSAL_REQUIRED_AFTER_VOID',409);
      if(latest.paypal_order_id){await this.verifyLocked(c);return;}
      const request=this.request(c,'create');const response=await this.gateway!.createAuthorizationOrder(c.id,request,{amount:{currencyCode:'USD',value:(c.authorized_ceiling_cents/100).toFixed(2)},
        description:`Commit Sandbox - proposal ${c.proposal_id} v${c.proposal_version}`,returnUrl:this.origin+'/commit/return',cancelUrl:this.origin+'/commit/cancel'});
      this.adopt(c,response.resource);this.database.run('UPDATE commitments SET approval_url=? WHERE id=?',approvalUrl(response.resource.approvalUrl),c.id);
      this.event(c,'create',response.resource.status,request,response.debugId);this.transition(c,'ORDER_CREATED','PAYPAL_ORDER_CREATED');
      this.database.run("UPDATE commitments SET pending_operation=NULL WHERE id=?",c.id);
      await this.verifyLocked(c);
    });return this.completed(fresh);
  }
  async authorize(session:Session,proposalId:unknown) {
    invariant(this.gateway,'PAYPAL_SANDBOX_NOT_CONFIGURED',503);const {fresh,c}=this.currentOwned(session,proposalId);
    await this.completeAuthorization(c);return this.completed(fresh);
  }
  private assertApprovalCurrent(c:CommitmentRow) {
    const latest=this.row(c.id),group=this.database.get<{group_id:string}>('SELECT group_id FROM purchase_goals WHERE id=?',c.goal_id)!;
    this.database.assertMutable(group.group_id);
    invariant(!this.database.get('SELECT id FROM capture_sagas WHERE proposal_id=?',c.proposal_id),'USE_SAGA_RECONCILIATION',409);
    invariant(!this.database.get("SELECT id FROM offer_applications WHERE proposal_id=? AND cleanup_state!='COMPLETE'",c.proposal_id),'STALE_AUTHORIZATION_CLEANUP_REQUIRED',409);
    invariant(latest.state!=='STALE'&&this.isCurrent(latest),'COMMITMENT_STALE',409);
  }
  private async completeAuthorization(c:CommitmentRow) {
    await this.locked(c,'authorize',async()=>{
      this.assertApprovalCurrent(c);
      let latest=await this.verifyLocked(c);if(latest.paypal_authorization_id)return;
      invariant(latest.state==='PAYER_APPROVED','APPROVAL_NOT_READY',409);
      // Terms may have changed during the provider GET. Recheck immediately before POST.
      this.assertApprovalCurrent(c);
      const request=this.request(c,'authorize');const response=await this.gateway!.authorizeOrder(latest.paypal_order_id!,request);
      this.adopt(c,response.resource);this.event(c,'authorize',response.resource.status,request,response.debugId);
      invariant(this.row(c.id).paypal_authorization_id,'PAYPAL_AUTHORIZATION_MISSING',502);
      await this.verifyLocked(c);
    });
  }
  // Internal worker entry point: only finish an already-created, exact buyer checkout.
  // Never creates an order, accepts frontend approval, captures, refunds, or changes terms.
  async reconcileApproval(id:string) {
    invariant(this.gateway,'PAYPAL_SANDBOX_NOT_CONFIGURED',503);const c=this.row(id);
    invariant(c.pending_operation!=='void'&&c.state!=='VOIDED','FRESH_PROPOSAL_REQUIRED_AFTER_VOID',409);
    invariant(c.paypal_order_id,'PAYPAL_ORDER_NOT_CREATED',409);
    const group=this.database.get<{group_id:string}>('SELECT group_id FROM purchase_goals WHERE id=?',c.goal_id)!;
    this.reconcileIntegrity(group.group_id,'system');
    if(this.row(id).state==='STALE'||!this.isCurrent(this.row(id)))return 'STALE';
    invariant(!c.authorized_at||Date.now()-Date.parse(c.authorized_at)<DEADLINE_MS,'GROUP_APPROVAL_WINDOW_EXPIRED',409);
    try{await this.completeAuthorization(c);}catch(error){if(error instanceof ProductError&&error.code==='APPROVAL_NOT_READY')return 'PENDING';throw error;}
    return this.row(id).state;
  }
  async verify(session:Session,id:unknown) {
    invariant(this.gateway,'PAYPAL_SANDBOX_NOT_CONFIGURED',503);const {fresh,c}=this.ownById(session,id);
    invariant(!this.database.get('SELECT id FROM capture_sagas WHERE proposal_id=?',c.proposal_id),'USE_SAGA_RECONCILIATION',409);
    await this.locked(c,'verify',()=>this.verifyLocked(c));return this.completed(fresh);
  }
  async void(session:Session,id:unknown) {
    invariant(this.gateway,'PAYPAL_SANDBOX_NOT_CONFIGURED',503);const {fresh,c}=this.ownById(session,id);
    await this.voidResource(c);return this.completed(fresh);
  }
  private async voidResource(c:CommitmentRow) {
    invariant(!this.database.get('SELECT id FROM capture_sagas WHERE proposal_id=?',c.proposal_id),'USE_SAGA_RECONCILIATION',409);
    invariant(c.paypal_order_id,'PAYPAL_ORDER_NOT_CREATED',409);
    await this.locked(c,'void',async()=>{
      // Stale resources can be voided; bindings still must match their original allocation.
      this.renew(c);const order=(await this.gateway!.getOrder(c.paypal_order_id!)).resource;this.adopt(c,order);this.validateOrder(c,order);
      const latest=this.row(c.id);invariant(latest.paypal_authorization_id,'PAYPAL_AUTHORIZATION_NOT_CREATED',409);
      this.renew(c);const auth=(await this.gateway!.getAuthorization(latest.paypal_authorization_id)).resource;
      invariant(auth.id===latest.paypal_authorization_id,'PAYPAL_AUTHORIZATION_BINDING_MISMATCH',502);
      if(auth.status!=='VOIDED'){
        invariant(auth.status==='CREATED','PAYPAL_AUTHORIZATION_NOT_VOIDABLE',409);const request=this.request(c,'void');
        this.database.audit('system','AUTHORIZATION_VOID_REQUESTED',c.id,c.revision);
        const response=await this.gateway!.voidAuthorization(auth.id,request);this.event(c,'void','REQUESTED',request,response.debugId);
      }
      this.renew(c);const verified=(await this.gateway!.getAuthorization(auth.id)).resource;
      invariant(verified.id===auth.id && verified.status==='VOIDED','PAYPAL_VOID_NOT_CONFIRMED',502);
      this.database.run("UPDATE commitments SET state='VOIDED',authorization_status='VOIDED',pending_operation=NULL,last_error=NULL,verified_at=?,updated_at=? WHERE id=?",new Date().toISOString(),new Date().toISOString(),c.id);
      if(latest.state!=='VOIDED')this.database.audit(c.user_id,'PAYPAL_VOIDED',c.id,c.revision);this.event(c,'getAuthorization','VOIDED');
      this.database.audit('system','AUTHORIZATION_VOID_CONFIRMED',c.id,c.revision);
    });
  }
  // Called only by the authenticated organizer's explicit offer acceptance/retry.
  // It shares the owner void implementation and original provider-binding checks.
  async cleanupSuperseded(session:Session,proposalId:string) {
    const fresh=this.participant(session);invariant(this.database.organizer(fresh.group_id,fresh.persona),'ORGANIZER_ONLY',403);
    invariant(this.database.get("SELECT p.id FROM proposals p JOIN purchase_goals g ON g.id=p.goal_id WHERE p.id=? AND g.group_id=? AND p.state='PROPOSAL_STALE'",proposalId,fresh.group_id),'SUPERSEDED_PROPOSAL_REQUIRED',409);
    const failures:string[]=[];
    for(const c of this.rows(proposalId)){
      if(!c.paypal_order_id){if(c.pending_operation||c.lock_owner)failures.push('PAYPAL_OUTCOME_UNRESOLVED');continue;}
      if(c.state==='VOIDED'&&c.authorization_status==='VOIDED')continue;
      try{
        invariant(this.gateway,'PAYPAL_SANDBOX_NOT_CONFIGURED',503);
        if(!c.paypal_authorization_id){
          await this.locked(c,'cleanup',async()=>{this.renew(c);const order=(await this.gateway!.getOrder(c.paypal_order_id!)).resource;this.adopt(c,order);this.validateOrder(c,order);
            if(!order.authorizations.length){invariant(!this.row(c.id).paypal_authorization_id,'PAYPAL_AUTHORIZATION_MISSING_FROM_ORDER',502);this.database.run('UPDATE commitments SET pending_operation=NULL WHERE id=?',c.id);}});
        }
        if(this.row(c.id).paypal_authorization_id)await this.voidResource(this.row(c.id));
      }catch(error){failures.push(error instanceof ProductError?error.code:'STALE_VOID_FAILED');}
    }
    return {complete:failures.length===0,failures};
  }
  async refreshGroup(session:Session) {
    invariant(this.gateway,'PAYPAL_SANDBOX_NOT_CONFIGURED',503);const fresh=this.participant(session);this.reconcileIntegrity(fresh.group_id,fresh.persona);
    const goal=this.database.goal(fresh.group_id);const p=this.database.latestProposal(goal.id);
    invariant(!p||!this.database.get('SELECT id FROM capture_sagas WHERE proposal_id=?',p.id),'USE_SAGA_RECONCILIATION',409);
    invariant(p?.state==='PROPOSED' && p.revision===goal.revision,'NO_FEASIBLE_PROPOSAL',409);
    const failures:string[]=[];
    for(const c of this.rows(p.id).filter(c=>c.paypal_order_id))try{await this.locked(c,'refresh',()=>this.verifyLocked(c));}catch(error){failures.push(error instanceof ProductError?error.code:'PAYPAL_VERIFICATION_FAILED');}
    return {failures,progress:this.progress(this.database.get<ProposalRow>('SELECT * FROM proposals WHERE id=?',p.id)!)};
  }
}
