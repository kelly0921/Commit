import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ProductDatabase, type ProposalRow, type Session } from './db.js';
import { CommitmentService, type CommitmentRow } from './commitments.js';
import { invariant, ProductError, PERSONAS,normalize,validateParsed,type SolverResult } from './domain.js';
import { solve } from './solver.js';
import { PayPalError, type CaptureGateway, type Order, type Authorization, type Money } from '../model.js';

export type SagaState='PREFLIGHT'|'READY'|'CAPTURING'|'RECONCILING'|'CONFIRMED'|'CAPTURE_FAILED'|'COMPENSATING'|'COMPENSATED'|'COMPENSATION_FAILED'|'REQUIRES_MANUAL_REVIEW';
type Operation='CAPTURE'|'REFUND'|'VOID';
export type FinancialStep={id:string;saga_id:string;commitment_id:string;position:number;operation:Operation;state:'PENDING'|'REQUESTING'|'UNKNOWN'|'SUCCEEDED'|'FAILED';request_id:string;authorization_id:string;capture_id:string|null;refund_id:string|null;amount_cents:number;currency:string;attempts:number;last_error:string|null;provider_status:string|null;first_attempt_at:string|null;verified_at:string|null};
type FrozenMember={id:string;userId:string;orderId:string;authorizationId:string;merchantId:string;amountCents:number;envelope:string;fingerprint:string};
type Snapshot={fingerprint:string;packageId:string;packageName:string;totalCents:number;members:FrozenMember[]};
export type CaptureSaga={id:string;proposal_id:string;proposal_version:number;state:SagaState;snapshot_json:string;negative_test:number;failure_reason:string|null;frozen_at:string|null;created_at:string;updated_at:string;completed_at:string|null;lock_owner:string|null;lock_until:string|null};
const now=()=>new Date().toISOString();
const money=(m:Money|undefined)=>m&&m.currencyCode==='USD'&&/^\d{1,8}\.\d{2}$/.test(m.value)?Number(m.value.replace('.','')):-1;
const code=(e:unknown)=>e instanceof ProductError||e instanceof PayPalError?e.code:'PAYPAL_TRANSPORT_UNCERTAIN';
const definite=(e:unknown)=>e instanceof PayPalError&&[400,401,403,404,422].includes(e.paypalHttpStatus??0)&&!['AUTHORIZATION_ALREADY_CAPTURED','PREVIOUS_REQUEST_IN_PROGRESS'].includes(e.code);
const requestId=(saga:string,commitment:string,op:Operation)=>'c3-'+createHash('sha256').update(`${saga}:${commitment}:${op}`).digest('hex').slice(0,32);

export class CaptureSagaService {
  private owner=randomUUID();
  constructor(readonly db:ProductDatabase,readonly commitments:CommitmentService,readonly gateway:CaptureGateway|undefined,readonly allowNegativeTest=false){}
  private participant(session:Session){const fresh=this.db.session(session.id);invariant(fresh&&fresh.group_id&&fresh.persona!=='merchant','PARTICIPANT_ONLY',403);return fresh as Session&{group_id:string};}
  private organizer(session:Session){const f=this.participant(session);invariant(this.db.get<{role:string}>('SELECT role FROM group_members WHERE group_id=? AND user_id=?',f.group_id,f.persona)?.role==='ORGANIZER','ORGANIZER_ONLY',403);return f;}
  get(id:string){const s=this.db.get<CaptureSaga>('SELECT * FROM capture_sagas WHERE id=?',id);invariant(s,'SAGA_NOT_FOUND',404);return s;}
  steps(id:string){return this.db.all<FinancialStep>('SELECT * FROM financial_steps WHERE saga_id=? ORDER BY position,operation',id);}
  private snapshot(s:CaptureSaga){return JSON.parse(s.snapshot_json) as Snapshot;}
  private delegation(groupId:string,authorityId:string){const grant=this.db.get<{id:string;auto_finalize:number}>('SELECT id,auto_finalize FROM group_agent_settings WHERE group_id=? ORDER BY version DESC LIMIT 1',groupId);invariant(grant?.id===authorityId&&grant.auto_finalize===1,'AUTO_FINALIZE_AUTHORITY_CHANGED',409);}
  view(session:Session){const f=this.participant(session),p=this.db.latestProposal(this.db.goal(f.group_id).id);const s=p&&this.db.get<CaptureSaga>('SELECT * FROM capture_sagas WHERE proposal_id=?',p.id);if(!s)return null;
    const snap=this.snapshot(s),steps=this.steps(s.id);return {id:s.id,proposalId:s.proposal_id,proposalVersion:s.proposal_version,state:s.state,packageName:snap.packageName,totalCents:snap.totalCents,negativeTest:!!s.negative_test,failureReason:s.failure_reason,createdAt:s.created_at,updatedAt:s.updated_at,
      capturedCents:steps.filter(x=>x.operation==='CAPTURE'&&x.state==='SUCCEEDED').reduce((a,x)=>a+x.amount_cents,0),refundedCents:steps.filter(x=>x.operation==='REFUND'&&x.state==='SUCCEEDED').reduce((a,x)=>a+x.amount_cents,0),
      participants:snap.members.map(m=>({userId:m.userId,name:this.db.get<{name:string}>('SELECT name FROM users WHERE id=?',m.userId)!.name,amountCents:m.amountCents,steps:steps.filter(x=>x.commitment_id===m.id).map(x=>({operation:x.operation,state:x.state,attempts:x.attempts,providerStatus:x.provider_status,...(m.userId===f.persona?{authorizationId:x.authorization_id,captureId:x.capture_id,refundId:x.refund_id}: {})}))}))};}
  private state(s:CaptureSaga,state:SagaState,reason?:string){this.db.transaction(()=>{this.db.run('UPDATE capture_sagas SET state=?,failure_reason=COALESCE(?,failure_reason),updated_at=?,completed_at=? WHERE id=?',state,reason??null,now(),['CONFIRMED','COMPENSATED'].includes(state)?now():null,s.id);
    this.db.run('UPDATE proposals SET financial_state=? WHERE id=?',state,s.proposal_id);
    const goalState=state==='CONFIRMED'?'CONFIRMED':state==='COMPENSATED'?'REPLAN_REQUIRED':state==='CAPTURE_FAILED'?'CAPTURE_FAILED':state==='COMPENSATING'?'COMPENSATING':state==='READY'?'READY_TO_CAPTURE':state==='PREFLIGHT'?'READY_TO_CAPTURE':['COMPENSATION_FAILED','REQUIRES_MANUAL_REVIEW'].includes(state)?'FAILED':'CAPTURING';
    this.db.run('UPDATE purchase_goals SET state=? WHERE id=(SELECT goal_id FROM proposals WHERE id=?)',goalState,s.proposal_id);
    if(state==='CONFIRMED'){invariant(this.steps(s.id).filter(x=>x.operation==='CAPTURE'&&x.state==='SUCCEEDED'&&x.verified_at).length===4,'FOUR_VERIFIED_CAPTURES_REQUIRED',500);this.db.run("UPDATE proposals SET state='CONFIRMED' WHERE id=?",s.proposal_id);}
    if(state==='COMPENSATED')this.db.run("UPDATE proposals SET state='REPLAN_REQUIRED' WHERE id=?",s.proposal_id);
    if(state==='COMPENSATING')this.db.audit('system','SAGA_RECOVERY_STARTED',s.id,s.proposal_version);
    const action=state==='CONFIRMED'?'SAGA_CONFIRMED':state==='COMPENSATED'?'SAGA_COMPENSATED':state==='REQUIRES_MANUAL_REVIEW'?'SAGA_MANUAL_REVIEW':null;if(action)this.db.audit('system',action,s.id,s.proposal_version);
  });}
  private freshlyVerified(c:CommitmentRow){const age=Date.now()-Date.parse(c.verified_at??'');return Number.isFinite(age)&&age>=-300000&&age<=300000;}
  private local(p:ProposalRow,rows:CommitmentRow[],requireFresh=true){const goal=this.db.get<{revision:number;group_id:string}>('SELECT * FROM purchase_goals WHERE id=?',p.goal_id)!;
    invariant(p.state==='PROPOSED'&&p.revision===goal.revision&&this.db.latestProposal(p.goal_id)?.id===p.id,'PREFLIGHT_PROPOSAL_CHANGED',409);
    const members=this.db.constraintRows(goal.group_id);invariant(rows.length===4&&members.length===4&&members.every(u=>rows.some(c=>c.user_id===u.user_id)),'PREFLIGHT_PARTICIPANTS_MISSING',409);
    const saved=JSON.parse(p.result_json) as SolverResult,recomputed=solve(saved.catalogSnapshot,this.db.constraintRows(goal.group_id).map(c=>normalize(validateParsed(JSON.parse(c.parsed_json)),c.user_id,c.name,!!c.confirmed)));
    invariant(recomputed.feasible&&isDeepStrictEqual(saved,recomputed),'PREFLIGHT_DETERMINISTIC_BOUNDARIES_FAILED',409);
    invariant(rows.every(c=>this.commitments.isCurrent(c)&&c.state==='AUTHORIZED'&&!c.pending_operation&&!c.lock_owner&&c.authorization_status==='CREATED'&&c.paypal_order_id&&c.paypal_authorization_id&&!c.capture_detected&&c.authorized_amount_cents===c.share_cents&&c.authorized_currency==='USD'&&c.currency==='USD'&&(!requireFresh||this.freshlyVerified(c))&&c.expires_at&&Date.parse(c.expires_at)>Date.now()&&c.authorized_at&&Date.parse(c.authorized_at)<=Date.now()+300000&&Date.now()-Date.parse(c.authorized_at)<86400000),'PREFLIGHT_LOCAL_BOUNDARY_FAILED',409);
  }
  async finalize(session:Session,proposalId:unknown,negativeTest:unknown=false,delegationId?:string){const f=this.organizer(session);invariant(this.gateway,'PAYPAL_SANDBOX_NOT_CONFIGURED',503);invariant(typeof proposalId==='string','PROPOSAL_REQUIRED');invariant(typeof negativeTest==='boolean'&&(!negativeTest||this.allowNegativeTest),'SANDBOX_NEGATIVE_TEST_DISABLED',403);if(delegationId)this.delegation(f.group_id,delegationId);
    const goal=this.db.goal(f.group_id),p=this.db.get<ProposalRow>('SELECT * FROM proposals WHERE id=? AND goal_id=?',proposalId,goal.id);invariant(p,'PROPOSAL_NOT_FOUND',404);
    let s=this.db.get<CaptureSaga>('SELECT * FROM capture_sagas WHERE proposal_id=?',p.id);
    if(!s){try{const rows=this.commitments.rows(p.id);this.local(p,rows,false);
      // A delayed organizer click refreshes provider facts, never approved terms.
      // All other local boundaries pass first; refreshGroup uses GETs only.
      if(rows.some(c=>!this.freshlyVerified(c))){const refreshed=await this.commitments.refreshGroup(f);invariant(!refreshed.failures.length,'PREFLIGHT_REFRESH_FAILED',409);this.db.audit(f.persona,'PREFLIGHT_VERIFICATION_REFRESHED',p.id,p.revision);}
      const current=this.organizer(f);invariant(current.persona===f.persona&&current.group_id===f.group_id,'PERSONA_CHANGED',409);this.local(p,this.commitments.rows(p.id));
    }catch(e){this.db.audit(f.persona,'PREFLIGHT_FAILED',p.id,p.revision);throw e;}
      s=this.db.transaction(()=>{const existing=this.db.get<CaptureSaga>('SELECT * FROM capture_sagas WHERE proposal_id=?',p.id);if(existing)return existing;const rows=this.commitments.rows(p.id);this.local(p,rows);const result=JSON.parse(p.result_json);const snap:Snapshot={fingerprint:p.commitment_fingerprint!,packageId:p.package_id!,packageName:result.catalogSnapshot.find((x:{id:string})=>x.id===p.package_id).name,totalCents:result.selected.totalCents,members:this.db.constraintRows(f.group_id).map(u=>{const c=rows.find(c=>c.user_id===u.user_id)!;return {id:c.id,userId:c.user_id,orderId:c.paypal_order_id!,authorizationId:c.paypal_authorization_id!,merchantId:c.merchant_id!,amountCents:c.share_cents,envelope:c.approved_envelope_json!,fingerprint:c.proposal_fingerprint};})};
        invariant(snap.members.reduce((a,c)=>a+c.amountCents,0)===snap.totalCents,'PREFLIGHT_TOTAL_MISMATCH',409);
        if(delegationId)this.delegation(f.group_id,delegationId);
        const id=randomUUID();this.db.run("INSERT INTO capture_sagas(id,proposal_id,proposal_version,state,snapshot_json,negative_test,created_at,updated_at) VALUES(?,?,?,'PREFLIGHT',?,?,?,?)",id,p.id,p.revision,JSON.stringify(snap),negativeTest?1:0,now(),now());if(delegationId)this.db.run('INSERT INTO saga_delegations VALUES(?,?)',id,delegationId);
        snap.members.forEach((c,i)=>{for(const op of ['CAPTURE','REFUND','VOID'] as Operation[])this.db.run("INSERT INTO financial_steps(id,saga_id,commitment_id,position,operation,state,request_id,authorization_id,amount_cents,currency,created_at,updated_at) VALUES(?,?,?,?,?,'PENDING',?,?,?,'USD',?,?)",randomUUID(),id,c.id,i+1,op,requestId(id,c.id,op),c.authorizationId,c.amountCents,now(),now());});this.db.audit(f.persona,'CAPTURE_SAGA_CREATED',id,p.revision);return this.get(id);
      });}
    await this.run(s.id);return this.view(f);
  }
  async resume(session:Session,sagaId:unknown){const f=this.organizer(session);invariant(typeof sagaId==='string','SAGA_REQUIRED');const s=this.get(sagaId);invariant(this.db.get('SELECT p.id FROM proposals p JOIN purchase_goals g ON g.id=p.goal_id WHERE p.id=? AND g.group_id=?',s.proposal_id,f.group_id),'SAGA_NOT_FOUND',404);await this.run(s.id);return this.view(f);}
  private renew(id:string){invariant(Number(this.db.run('UPDATE capture_sagas SET lock_until=? WHERE id=? AND lock_owner=? AND lock_until>=?',new Date(Date.now()+120000).toISOString(),id,this.owner,now()).changes)===1,'SAGA_LEASE_LOST',409);}
  private async remote<T>(s:CaptureSaga,call:()=>Promise<T>){this.renew(s.id);const r=await call();this.renew(s.id);return r;}
  private orderBinding(m:FrozenMember,o:Order){invariant(o.id===m.orderId&&o.status==='COMPLETED'&&o.intent==='AUTHORIZE'&&o.unitCount===1&&o.referenceId===m.id&&o.customId===m.id&&o.merchantId===m.merchantId&&(!this.commitments.expectedMerchantId||o.merchantId===this.commitments.expectedMerchantId)&&money(o.amount)===m.amountCents&&o.authorizations.length===1&&o.authorizations[0]!.id===m.authorizationId,'PAYPAL_ORDER_BINDING_MISMATCH',502);}
  private authBinding(m:FrozenMember,a:Authorization){invariant(a.id===m.authorizationId&&money(a.amount)===m.amountCents,'PAYPAL_AUTHORIZATION_BINDING_MISMATCH',502);}
  private async inspect(s:CaptureSaga,m:FrozenMember){const o=(await this.remote(s,()=>this.gateway!.getOrder(m.orderId))).resource;this.orderBinding(m,o);const a=(await this.remote(s,()=>this.gateway!.getAuthorization(m.authorizationId))).resource;this.authBinding(m,a);return {o,a};}
  private async preflight(s:CaptureSaga){const p=this.db.get<ProposalRow>('SELECT * FROM proposals WHERE id=?',s.proposal_id)!;this.local(p,this.commitments.rows(p.id));
    for(const m of this.snapshot(s).members){const {o,a}=await this.inspect(s,m);invariant(o.captures.length===0&&a.status==='CREATED'&&Date.parse(a.expirationTime??'')>Date.now()&&Date.parse(a.createTime??'')<=Date.now()+300000&&Date.now()-Date.parse(a.createTime??'')<86400000,'PREFLIGHT_PROVIDER_NOT_CAPTURABLE',409);this.db.run('UPDATE commitments SET verified_at=? WHERE id=?',now(),m.id);}
    this.db.transaction(()=>{this.local(p,this.commitments.rows(p.id));invariant(this.commitments.fingerprint(p)===this.snapshot(s).fingerprint,'PREFLIGHT_TERMS_CHANGED',409);const delegated=this.db.get<{authority_id:string}>('SELECT authority_id FROM saga_delegations WHERE saga_id=?',s.id);if(delegated)this.delegation(this.db.get<{group_id:string}>('SELECT group_id FROM purchase_goals WHERE id=?',p.goal_id)!.group_id,delegated.authority_id);this.db.run('UPDATE capture_sagas SET frozen_at=?,state=\'READY\',updated_at=? WHERE id=?',now(),now(),s.id);this.db.audit('system','PREFLIGHT_PASSED',s.id,s.proposal_version);});this.state(s,'READY');
  }
  private step(s:CaptureSaga,m:FrozenMember,op:Operation){return this.steps(s.id).find(x=>x.commitment_id===m.id&&x.operation===op)!;}
  private saveId(step:FinancialStep,field:'capture_id'|'refund_id',id:string){invariant(id&&(!step[field]||step[field]===id),'PAYPAL_RESOURCE_ID_CHANGED',502);this.db.run(`UPDATE financial_steps SET ${field}=?,updated_at=? WHERE id=?`,id,now(),step.id);if(field==='capture_id')this.db.run('UPDATE commitments SET paypal_capture_id=? WHERE id=?',id,step.commitment_id);}
  private request(s:CaptureSaga,step:FinancialStep){this.renew(s.id);invariant(step.attempts<3&&(!step.first_attempt_at||Date.now()-Date.parse(step.first_attempt_at)<45*86400000),'FINANCIAL_RETRY_LIMIT_REQUIRES_REVIEW',409);
    this.db.transaction(()=>{this.db.run("UPDATE financial_steps SET state='REQUESTING',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?),updated_at=? WHERE id=?",now(),now(),step.id);this.db.audit('system',step.operation+'_REQUESTED',step.id,s.proposal_version);});return step.request_id;}
  private succeeded(s:CaptureSaga,step:FinancialStep,status:string){this.db.transaction(()=>{this.db.run("UPDATE financial_steps SET state='SUCCEEDED',provider_status=?,verified_at=?,last_error=NULL,updated_at=? WHERE id=?",status,now(),now(),step.id);const state=step.operation==='CAPTURE'?'CAPTURED':step.operation==='REFUND'?'REFUNDED':'VOIDED';this.db.run('UPDATE commitments SET state=?,captured_cents=CASE WHEN ?=\'CAPTURE\' THEN ? ELSE captured_cents END,authorization_status=CASE WHEN ?=\'VOID\' THEN \'VOIDED\' ELSE authorization_status END,verified_at=?,updated_at=? WHERE id=?',state,step.operation,step.amount_cents,step.operation,now(),now(),step.commitment_id);this.db.audit('system',step.operation+'_CONFIRMED',step.id,s.proposal_version);});}
  private async capture(s:CaptureSaga,m:FrozenMember):Promise<'DONE'|'WAIT'|'FAILED'>{let step=this.step(s,m,'CAPTURE');if(step.state==='SUCCEEDED')return 'DONE';if(step.state==='FAILED')return 'FAILED';
    const {o,a}=await this.inspect(s,m);invariant(o.captures.length<=1,'UNEXPECTED_MULTIPLE_CAPTURES',502);
    if(o.captures[0]){this.saveId(step,'capture_id',o.captures[0].id);step=this.step(s,m,'CAPTURE');}
    if(step.capture_id){const cap=(await this.remote(s,()=>this.gateway!.getCapture(step.capture_id!))).resource;invariant(cap.id===step.capture_id&&money(cap.amount)===m.amountCents&&cap.authorizationId===m.authorizationId&&(!cap.orderId||cap.orderId===m.orderId)&&cap.finalCapture===true,'PAYPAL_CAPTURE_BINDING_MISMATCH',502);
      if(cap.status==='COMPLETED'){invariant(o.captures.some(x=>x.id===cap.id)&&a.status==='CAPTURED','PAYPAL_CAPTURE_NOT_RECONCILED',502);this.succeeded(s,step,cap.status);return 'DONE';}
      if(['DECLINED','FAILED'].includes(cap.status)){this.db.run("UPDATE financial_steps SET state='FAILED',provider_status=?,last_error='CAPTURE_DECLINED',updated_at=? WHERE id=?",cap.status,now(),step.id);this.db.audit('system','CAPTURE_FAILED',step.id,s.proposal_version);return 'FAILED';}
      invariant(cap.status==='PENDING','PAYPAL_CAPTURE_UNEXPECTED_STATE',502);this.db.run("UPDATE financial_steps SET state='UNKNOWN',provider_status='PENDING',updated_at=? WHERE id=?",now(),step.id);return 'WAIT';
    }
    invariant(a.status==='CREATED'&&Date.parse(a.expirationTime??'')>Date.now(),'PAYPAL_CAPTURE_OUTCOME_UNSAFE',409);
    const key=this.request(s,step);
    try{const cap=await this.remote(s,()=>this.gateway!.captureAuthorization(m.authorizationId,(m.amountCents/100).toFixed(2),key,s.negative_test&&step.position===3?'AUTHORIZATION_EXPIRED':undefined));this.saveId(step,'capture_id',cap.resource.id);}
    catch(e){const failed=definite(e);this.db.run('UPDATE financial_steps SET state=?,last_error=?,updated_at=? WHERE id=?',failed?'FAILED':'UNKNOWN',code(e),now(),step.id);this.db.audit('system',failed?'CAPTURE_FAILED':'CAPTURE_UNKNOWN',step.id,s.proposal_version);if(failed)return 'FAILED';this.state(s,'RECONCILING',code(e));return 'WAIT';}
    // Read independently before moving to the next participant. Never recursively issue another POST.
    return this.capture(s,m);
  }
  private async compensateOne(s:CaptureSaga,m:FrozenMember):Promise<boolean>{const capture=this.step(s,m,'CAPTURE'),op:Operation=capture.state==='SUCCEEDED'?'REFUND':'VOID';let step=this.step(s,m,op);if(step.state==='SUCCEEDED')return true;
    if(op==='REFUND'){
      invariant(capture.capture_id,'CAPTURE_ID_REQUIRED',500);const cap=(await this.remote(s,()=>this.gateway!.getCapture(capture.capture_id!))).resource;invariant(cap.id===capture.capture_id&&money(cap.amount)===m.amountCents&&cap.authorizationId===m.authorizationId,'REFUND_CAPTURE_BINDING_MISMATCH',502);
      if(!step.refund_id&&step.attempts){const {o}=await this.inspect(s,m);const refunds=o.refunds??[];invariant(refunds.length<=1,'UNEXPECTED_REFUNDS_REQUIRE_REVIEW',409);if(refunds[0]){this.saveId(step,'refund_id',refunds[0].id);step=this.step(s,m,op);}else invariant(cap.status==='COMPLETED','REFUND_OUTCOME_REQUIRES_REVIEW',409);}
      if(!step.refund_id){invariant(cap.status==='COMPLETED','REFUND_OUTCOME_REQUIRES_REVIEW',409);this.db.run('UPDATE financial_steps SET capture_id=? WHERE id=?',capture.capture_id,step.id);const key=this.request(s,step);const res=await this.remote(s,()=>this.gateway!.refundCapture(capture.capture_id!,key));this.saveId(step,'refund_id',res.resource.id);step=this.step(s,m,op);}
      const r=(await this.remote(s,()=>this.gateway!.getRefund(step.refund_id!))).resource;invariant(r.id===step.refund_id&&r.captureId===capture.capture_id&&money(r.amount)===m.amountCents,'PAYPAL_REFUND_BINDING_MISMATCH',502);
      if(r.status==='COMPLETED'){this.succeeded(s,step,r.status);return true;}invariant(r.status==='PENDING','PAYPAL_REFUND_FAILED',502);this.db.run("UPDATE financial_steps SET state='UNKNOWN',provider_status='PENDING',updated_at=? WHERE id=?",now(),step.id);return false;
    }
    const {o,a}=await this.inspect(s,m);invariant(o.captures.every(c=>c.id===capture.capture_id&&['DECLINED','FAILED'].includes(c.status)),'UNCAPTURED_AUTH_HAS_CAPTURE',502);
    if(a.status!=='VOIDED'){invariant(a.status==='CREATED','AUTH_NOT_VOIDABLE_REQUIRES_REVIEW',409);const key=this.request(s,step);await this.remote(s,()=>this.gateway!.voidAuthorization(m.authorizationId,key));}
    const a2=(await this.remote(s,()=>this.gateway!.getAuthorization(m.authorizationId))).resource;this.authBinding(m,a2);invariant(a2.status==='VOIDED','PAYPAL_VOID_PENDING',502);this.succeeded(s,step,'VOIDED');return true;
  }
  private async compensate(s:CaptureSaga){this.state(s,'COMPENSATING');let done=true,failed=false,manual=false;
    for(const m of this.snapshot(s).members){try{if(!await this.compensateOne(s,m))done=false;}catch(e){const op=this.step(s,m,'CAPTURE').state==='SUCCEEDED'?'REFUND':'VOID',step=this.step(s,m,op);this.db.run('UPDATE financial_steps SET state=?,last_error=?,updated_at=? WHERE id=?',definite(e)?'FAILED':'UNKNOWN',code(e),now(),step.id);done=false;failed=true;if(e instanceof ProductError&&e.code!=='PAYPAL_VOID_PENDING')manual=true;}}
    this.state(s,done?'COMPENSATED':manual?'REQUIRES_MANUAL_REVIEW':failed?'COMPENSATION_FAILED':'COMPENSATING',manual?'COMPENSATION_REQUIRES_MANUAL_REVIEW':failed?'COMPENSATION_NEEDS_RECONCILIATION':undefined);
  }
  async run(id:string){invariant(this.gateway,'PAYPAL_SANDBOX_NOT_CONFIGURED',503);let s=this.get(id);if(['CONFIRMED','COMPENSATED'].includes(s.state))return;
    const claim=this.db.run('UPDATE capture_sagas SET lock_owner=?,lock_until=? WHERE id=? AND (lock_owner IS NULL OR lock_until<?)',this.owner,new Date(Date.now()+120000).toISOString(),id,now());if(!Number(claim.changes))return;
    try{s=this.get(id);if(s.state==='PREFLIGHT'){try{await this.preflight(s);}catch(e){this.db.audit('system','PREFLIGHT_FAILED',s.id,s.proposal_version);this.state(s,'REQUIRES_MANUAL_REVIEW',code(e));return;}}
      s=this.get(id);if(['CAPTURE_FAILED','COMPENSATING','COMPENSATION_FAILED'].includes(s.state)){await this.compensate(s);return;}
      if(s.state==='REQUIRES_MANUAL_REVIEW')return;
      this.state(s,'CAPTURING');
      for(const m of this.snapshot(s).members){const outcome=await this.capture(s,m);if(outcome==='WAIT'){this.state(s,'RECONCILING');return;}if(outcome==='FAILED'){this.state(s,'CAPTURE_FAILED',this.step(s,m,'CAPTURE').last_error??'CAPTURE_FAILED');this.db.audit('system','COMPENSATION_STARTED',s.id,s.proposal_version);await this.compensate(s);return;}}
      // Refresh earlier captures too: external refunds or changed resources must not confirm a booking.
      for(const m of this.snapshot(s).members){const step=this.step(s,m,'CAPTURE'),cap=(await this.remote(s,()=>this.gateway!.getCapture(step.capture_id!))).resource;invariant(cap.id===step.capture_id&&cap.status==='COMPLETED'&&cap.authorizationId===m.authorizationId&&money(cap.amount)===m.amountCents&&cap.finalCapture===true,'FINAL_CAPTURE_CONFIRMATION_CHANGED',409);this.db.run('UPDATE financial_steps SET verified_at=?,updated_at=? WHERE id=?',now(),now(),step.id);}
      this.state(s,'CONFIRMED');
    }catch(e){if(e instanceof ProductError&&e.code==='SAGA_LEASE_LOST')throw e;this.state(s,e instanceof PayPalError&&!definite(e)?'RECONCILING':'REQUIRES_MANUAL_REVIEW',code(e));}
    finally{this.db.run('UPDATE capture_sagas SET lock_owner=NULL,lock_until=NULL WHERE id=? AND lock_owner=?',id,this.owner);}
  }
}
