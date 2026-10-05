import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { PACKAGES, SEED_CONSTRAINTS, SEED_STATEMENTS } from './seed.js';
import { PERSONAS, invariant, type ParsedConstraint, type PlanState } from './domain.js';
export type Session = {id:string;group_id:string|null;persona:string;csrf_token:string;expires_at:string};
export type Goal = {id:string;group_id:string;description:string;revision:number;state:PlanState};
export type ConstraintRow = {group_id:string;user_id:string;statement:string;parsed_json:string;confirmed:number;version:number;source:string;updated_at:string;name:string};
export type ProposalRow = {id:string;goal_id:string;revision:number;package_id:string|null;state:string;result_json:string;explanation:string;explanation_source:string;created_at:string;commitment_fingerprint:string|null;financial_state:string};
export class ProductDatabase {
  readonly db: DatabaseSync;
  private transactionDepth=0;
  constructor(path: string) {
    if(path !== ':memory:') mkdirSync(dirname(path),{recursive:true});
    this.db = new DatabaseSync(path);
    this.db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
    const version=this.get<{version:number}>('SELECT MAX(version) AS version FROM schema_migrations')?.version ?? 0;
    invariant(version<=6,'UNSUPPORTED_DATABASE_VERSION',500);
    if(version<4)this.db.exec('PRAGMA foreign_keys=OFF');
    this.transaction(()=>{
      this.run('INSERT OR IGNORE INTO schema_migrations VALUES(1,?)',new Date().toISOString());
      if(version<2){this.db.exec(readFileSync(new URL('./migration-2.sql',import.meta.url),'utf8'));this.run('INSERT INTO schema_migrations VALUES(2,?)',new Date().toISOString());}
      if(version<3){
        this.db.exec(readFileSync(new URL('./migration-3.sql',import.meta.url),'utf8'));
        // Enrich only the fictional seeded catalog; retain all existing prices and terms.
        for(const row of this.all<{id:string;merchant_id:string;data_json:string}>('SELECT * FROM merchant_packages')){
          const seed=PACKAGES.find(p=>p.id===row.id);if(!seed)continue;
          const old=JSON.parse(row.data_json);
          const enriched={...old,merchantId:old.merchantId??row.merchant_id,quality:old.quality??seed.quality,terms:old.terms??seed.terms,merchantBoundaries:old.merchantBoundaries??seed.merchantBoundaries};
          this.run('UPDATE merchant_packages SET data_json=? WHERE id=?',JSON.stringify(enriched),row.id);
        }
        // Never attach new commercial terms or scoring policy to an old approval.
        for(const p of this.all<ProposalRow>("SELECT * FROM proposals WHERE state='PROPOSED'")){
          for(const c of this.all<{id:string;user_id:string}>("SELECT c.id,a.user_id FROM commitments c JOIN proposal_allocations a ON a.id=c.allocation_id WHERE a.proposal_id=? AND c.state NOT IN ('STALE','VOIDED','CAPTURED','REFUNDED')",p.id)){
            this.run("UPDATE commitments SET state='STALE',verified_at=NULL,updated_at=? WHERE id=?",new Date().toISOString(),c.id);this.audit(c.user_id,'COMMITMENT_STALE',c.id,p.revision);
          }
          this.run("UPDATE proposals SET state='PROPOSAL_STALE',financial_state='PROPOSAL_STALE' WHERE id=?",p.id);
          this.run("UPDATE purchase_goals SET revision=revision+1,state='COLLECTING_CONSTRAINTS' WHERE id=? AND revision=?",p.goal_id,p.revision);
          this.audit('system','VALUE_POLICY_CHANGED',p.id,p.revision);
        }
        this.run('INSERT INTO schema_migrations VALUES(3,?)',new Date().toISOString());
      }
      this.run('INSERT OR IGNORE INTO merchants VALUES(?,?,1)','summit-weekend','Summit Weekend');
      for(const user of PERSONAS) this.run('INSERT OR IGNORE INTO users VALUES(?,?,?)',user.id,user.name,user.color);
      for(const pkg of PACKAGES) this.run('INSERT OR IGNORE INTO merchant_packages VALUES(?,?,?)',pkg.id,'summit-weekend',JSON.stringify(pkg));
      if(version<4){this.db.exec(readFileSync(new URL('./migration-4.sql',import.meta.url),'utf8'));this.run('INSERT INTO schema_migrations VALUES(4,?)',new Date().toISOString());}
      if(version<5){this.db.exec(readFileSync(new URL('./migration-5.sql',import.meta.url),'utf8'));this.run('INSERT INTO schema_migrations VALUES(5,?)',new Date().toISOString());}
      if(version<6){this.db.exec(readFileSync(new URL('./migration-6.sql',import.meta.url),'utf8'));this.run('INSERT INTO schema_migrations VALUES(6,?)',new Date().toISOString());}
    });
    this.db.exec('PRAGMA foreign_keys=ON');
    invariant(this.all('PRAGMA foreign_key_check').length===0,'DATABASE_FOREIGN_KEY_CHECK_FAILED',500);
  }
  get<T>(sql:string,...values:SQLInputValue[]):T|undefined { return this.db.prepare(sql).get(...values) as T|undefined; }
  all<T>(sql:string,...values:SQLInputValue[]):T[] { return this.db.prepare(sql).all(...values) as T[]; }
  run(sql:string,...values:SQLInputValue[]) { return this.db.prepare(sql).run(...values); }
  transaction<T>(work:()=>T):T {const depth=this.transactionDepth,savepoint=`commit_nested_${depth}`;this.db.exec(depth?`SAVEPOINT ${savepoint}`:'BEGIN IMMEDIATE');this.transactionDepth++;try {const result=work();this.db.exec(depth?`RELEASE ${savepoint}`:'COMMIT');return result;}catch(error){this.db.exec(depth?`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`:'ROLLBACK');throw error;}finally{this.transactionDepth--;}}
  close(){this.db.close();}
  session(id:string|undefined):Session|undefined { return id ? this.get<Session>('SELECT s.id,s.group_id,COALESCE(j.user_id,s.persona) AS persona,s.csrf_token,s.expires_at FROM demo_sessions s LEFT JOIN joined_identities j ON j.session_id=s.id WHERE s.id=? AND s.expires_at>?',id,new Date().toISOString()) : undefined; }
  createSession():Session {const session={id:randomBytes(32).toString('hex'),group_id:null,persona:'kelly',csrf_token:randomBytes(32).toString('hex'),expires_at:new Date(Date.now()+86400000).toISOString()};this.run('INSERT INTO demo_sessions VALUES(?,?,?,?,?)',session.id,session.group_id,session.persona,session.csrf_token,session.expires_at);return session;}
  audit(actor:string,action:string,entity:string,revision:number|null){
    this.run('INSERT INTO audit_events VALUES(?,?,?,?,?,?)',randomUUID(),actor,action,entity,revision,new Date().toISOString());
    // The outbox write shares the caller's commercial transaction. No private payloads.
    if(!this.get("SELECT name FROM sqlite_master WHERE name='domain_events'"))return;
    const types:Record<string,string>={CONSTRAINT_CONFIRMED:'GROUP_NEEDS_CHANGED',GROUP_CREATED:'GROUP_MEMBERSHIP_CHANGED',PROPOSAL_EVALUATED:'PROPOSAL_CHANGED',OFFER_APPLIED_TO_PROPOSAL:'TERMS_CHANGED',OFFER_PUBLISHED:'OFFER_PUBLISHED',OFFER_REVOKED:'OFFER_UNAVAILABLE',OFFER_EXPIRED:'OFFER_UNAVAILABLE',COMMITMENT_AUTHORIZED:'GROUP_PROGRESS',SAGA_CONFIRMED:'PURCHASE_CONFIRMED',SAGA_COMPENSATED:'RECOVERY_COMPLETED',SAGA_MANUAL_REVIEW:'MANUAL_REVIEW_REQUIRED',CAPTURE_SAGA_CREATED:'FINALIZING',SAGA_RECOVERY_STARTED:'RECOVERY_STARTED'};
    if(action==='PAYPAL_AUTHORIZED')types[action]='GROUP_PROGRESS';if(action==='PROPOSAL_READY_TO_CAPTURE')types[action]='GROUP_PROGRESS';const type=types[action];if(type)this.enqueue(type,entity,revision,`${action}:${entity}:${revision??0}`);
  }
  enqueue(type:string,aggregateId:string,revision:number|null,dedupeKey:string){const now=new Date().toISOString();this.run("INSERT OR IGNORE INTO domain_events(id,type,aggregate_id,revision,dedupe_key,available_at,created_at) VALUES(?,?,?,?,?,?,?)",randomUUID(),type,aggregateId,revision,dedupeKey,now,now);}
  organizer(groupId:string,userId:string){return this.get<{role:string}>('SELECT role FROM group_members WHERE group_id=? AND user_id=?',groupId,userId)?.role==='ORGANIZER';}
  assertMutable(groupId:string|null){if(!groupId)return;invariant(!this.get("SELECT s.id FROM capture_sagas s JOIN proposals p ON p.id=s.proposal_id JOIN purchase_goals g ON g.id=p.goal_id WHERE g.group_id=? AND s.frozen_at IS NOT NULL AND s.state NOT IN ('CONFIRMED','COMPENSATED')",groupId),'TRANSACTION_TERMS_FROZEN',409);}
  createGroup(session:Session,name:string,description:string,seeded:boolean) {
    return this.transaction(()=>{
      const groupId=randomUUID();const goalId=randomUUID();const now=new Date().toISOString();
      this.run('INSERT INTO groups VALUES(?,?,?,?)',groupId,name,'summit-weekend',now);
      for(const user of PERSONAS){
        this.run('INSERT INTO group_members VALUES(?,?,?)',groupId,user.id,user.id==='kelly'?'ORGANIZER':'MEMBER');
        const parsed:ParsedConstraint=seeded?SEED_CONSTRAINTS[user.id]!:{hardMax:null,preferredMax:null,requirements:[],preferences:[],confidence:0,clarifications:[]};
        this.run('INSERT INTO constraints VALUES(?,?,?,?,?,?,?,?)',groupId,user.id,seeded?SEED_STATEMENTS[user.id]!:'',JSON.stringify(parsed),seeded?1:0,1,'SEED',now);
      }
      this.run('INSERT INTO purchase_goals VALUES(?,?,?,?,?)',goalId,groupId,description,1,'COLLECTING_CONSTRAINTS');
      this.run('UPDATE demo_sessions SET group_id=?,persona=? WHERE id=?',groupId,'kelly',session.id);
      this.audit('kelly','GROUP_CREATED',groupId,1);return groupId;
    });
  }
  goal(groupId:string){const row=this.get<Goal>('SELECT * FROM purchase_goals WHERE group_id=?',groupId);invariant(row,'GROUP_NOT_FOUND',404);return row;}
  constraintRows(groupId:string){return this.all<ConstraintRow>("SELECT c.*,u.name FROM constraints c JOIN users u ON u.id=c.user_id WHERE group_id=? ORDER BY CASE c.user_id WHEN 'kelly' THEN 0 WHEN 'lawrence' THEN 1 WHEN 'sarah' THEN 2 ELSE 3 END",groupId);}
  latestProposal(goalId:string){return this.get<ProposalRow>('SELECT * FROM proposals WHERE goal_id=? ORDER BY revision DESC LIMIT 1',goalId);}
}
