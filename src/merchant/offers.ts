import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {ProductDatabase} from '../product/db.js';
import {invariant,type OfferPackageTerms,type MerchantPackage} from '../product/domain.js';
import {PRICE_FIELDS} from '../product/catalog.js';
import {simulateGroupOffer,merchantDemand,winterCatalog,OFFER_BOUNDARIES,type OfferInput} from './demand.js';

export type OfferRow={id:string;merchant_id:string;version:number;status:'DRAFT'|'PUBLISHED'|'EXPIRED'|'REVOKED';terms_json:string;terms_hash:string;source_simulation_id:string;created_by:'MERCHANT'|'AGENT_DRAFT';created_at:string;updated_at:string;published_at:string|null};
type SimulationRow={id:string;merchant_id:string;session_id:string;input_json:string;result_json:string;catalog_fingerprint:string;created_at:string};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const MERCHANT='summit-weekend';
const object=(v:unknown):Record<string,unknown>=>{invariant(v&&typeof v==='object'&&!Array.isArray(v),'INVALID_OFFER');return v as Record<string,unknown>;};
const iso=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const declaredCatalog=()=>OFFER_BOUNDARIES.packageIds.flatMap(packageId=>winterCatalog({packageId,targetDate:'2027-02-12',endDate:'2027-02-14'}));

// No participant tables, buyer data, proposal writes or payment capabilities in this service.
export class MerchantOfferService {
 constructor(readonly database:ProductDatabase,readonly now:()=>number=Date.now){}
 private fingerprint(){return hash(JSON.stringify(declaredCatalog()));}
 private revalidate(terms:OfferPackageTerms){
  invariant(terms.merchantId===MERCHANT&&Number.isInteger(terms.discountPercent)&&terms.discountPercent>0&&terms.discountPercent<=OFFER_BOUNDARIES.maximumDiscountPercent,'MERCHANT_DISCOUNT_BOUNDARY',409);
  invariant(Number.isInteger(terms.minimumGroupSize)&&terms.minimumGroupSize>=2&&terms.minimumGroupSize<=6,'INVALID_GROUP_SIZE');
  invariant(terms.eligiblePackageIds.length>0&&terms.eligiblePackageIds.every(id=>OFFER_BOUNDARIES.packageIds.includes(id)),'INELIGIBLE_PACKAGE');
  invariant(terms.eligibleStartDate>=OFFER_BOUNDARIES.eligibleStartDate&&terms.eligibleEndDate<=OFFER_BOUNDARIES.eligibleEndDate&&terms.eligibleStartDate<=terms.eligibleEndDate,'MERCHANT_DATE_BOUNDARY',409);
  invariant(iso(terms.validFrom)&&iso(terms.validUntil)&&Date.parse(terms.validUntil)>Date.parse(terms.validFrom)&&Date.parse(terms.validUntil)>this.now()&&Date.parse(terms.validUntil)<=this.now()+30*86400000,'INVALID_OFFER_VALIDITY',409);
  for(const pkg of declaredCatalog().filter(p=>terms.eligiblePackageIds.includes(p.id))){
   const b=pkg.merchantBoundaries,shared=Math.ceil(pkg.sharedBaseCostCents*(100-terms.discountPercent)/100);
   invariant(shared>=b.minimumTotalCents&&(shared-b.costCents)*10000>=shared*b.minimumMarginBps&&terms.discountPercent*100<=b.maximumDiscountBps,'MERCHANT_PRICE_MARGIN_BOUNDARY',409);
   invariant(Number.isInteger(terms.maxRedemptions)&&terms.maxRedemptions>=1&&terms.maxRedemptions<=Math.min(b.availableInventory,b.redemptionLimit-b.redeemedCount),'MERCHANT_REDEMPTION_BOUNDARY',409);
  }
 }
 simulate(sessionId:string,value:unknown){
  const result=simulateGroupOffer(value,this.database),id=randomUUID(),now=new Date(this.now()).toISOString();
  this.database.transaction(()=>{this.database.run('INSERT INTO merchant_offer_simulations VALUES(?,?,?,?,?,?,?)',id,MERCHANT,sessionId,JSON.stringify(result.input),JSON.stringify(result),this.fingerprint(),now);this.database.audit('merchant','OFFER_SIMULATED',id,null);});
  return {...result,simulationId:id};
 }
 draft(sessionId:string,value:unknown,createdBy:'MERCHANT'|'AGENT_DRAFT'='AGENT_DRAFT'){
  const v=object(value);invariant(Object.keys(v).every(k=>['sourceSimulationId','validFrom','validUntil','maxRedemptions'].includes(k)),'UNKNOWN_OFFER_FIELD');
  invariant(typeof v.sourceSimulationId==='string','VALID_SIMULATION_REQUIRED');
  return this.database.transaction(()=>{
   const source=this.database.get<SimulationRow>('SELECT * FROM merchant_offer_simulations WHERE id=? AND session_id=? AND merchant_id=?',v.sourceSimulationId as string,sessionId,MERCHANT);
   invariant(source&&this.now()-Date.parse(source.created_at)<3600000,'VALID_SIMULATION_REQUIRED',409);
   const input=JSON.parse(source.input_json) as OfferInput,result=simulateGroupOffer(input,this.database);
   invariant(result.accepted&&!result.blockedByMerchantFloor&&input.discountPercent>0,'VALID_SIMULATION_REQUIRED',409);
   invariant(source.catalog_fingerprint===this.fingerprint()&&JSON.stringify(result)===source.result_json,'SIMULATION_TERMS_CHANGED',409);
   const scope=input.cohortIds?merchantDemand(this.database).filter(r=>input.cohortIds!.includes(r.cohortId)):[];
   invariant(!input.cohortIds||scope.length>0,'EMPTY_SIMULATION_SCOPE',409);
   const now=new Date(this.now()).toISOString(),id=randomUUID(),version=(this.database.get<{v:number}>('SELECT COALESCE(MAX(version),0) AS v FROM merchant_offer_versions')!.v)+1;
   const terms:OfferPackageTerms={id,version,merchantId:MERCHANT,discountPercent:input.discountPercent,minimumGroupSize:input.minimumGroupSize??2,eligiblePackageIds:input.packageIds??(scope.length?[...new Set(scope.map(r=>r.currentPackageId))]:[...OFFER_BOUNDARIES.packageIds]),eligibleStartDate:input.startDate??(scope.length?scope.map(r=>r.targetDate).sort()[0]!:OFFER_BOUNDARIES.eligibleStartDate),eligibleEndDate:input.endDate??(scope.length?scope.map(r=>r.endDate).sort().at(-1)!:OFFER_BOUNDARIES.eligibleEndDate),validFrom:v.validFrom===undefined?now:v.validFrom as string,validUntil:v.validUntil===undefined?new Date(this.now()+86400000).toISOString():v.validUntil as string,maxRedemptions:v.maxRedemptions===undefined?20:v.maxRedemptions as number};
   this.revalidate(terms);const serialized=JSON.stringify(terms);
   this.database.run("INSERT INTO merchant_offer_versions VALUES(?,?,?,'DRAFT',?,?,?,?,?,?,NULL)",id,MERCHANT,version,serialized,hash(serialized),source.id,createdBy,now,now);
   this.database.audit('merchant','OFFER_DRAFT_CREATED',id,version);return this.view(this.get(id));
  });
 }
 get(id:string){const row=this.database.get<OfferRow>('SELECT * FROM merchant_offer_versions WHERE id=? AND merchant_id=?',id,MERCHANT);invariant(row,'OFFER_NOT_FOUND',404);return row;}
 view(row:OfferRow){const terms=JSON.parse(row.terms_json) as OfferPackageTerms;const result=JSON.parse(this.database.get<SimulationRow>('SELECT * FROM merchant_offer_simulations WHERE id=?',row.source_simulation_id)!.result_json);return {...terms,status:row.status,createdBy:row.created_by,sourceSimulationId:row.source_simulation_id,publishedAt:row.published_at,createdAt:row.created_at,impact:{newlyFeasibleGroups:result.newlyFeasibleGroups,incrementalGmvCents:result.projectedIncrementalGmvCents,discountCostCents:result.estimatedDiscountCostCents},redemptions:this.database.get<{count:number}>("SELECT COUNT(*) AS count FROM offer_applications WHERE offer_id=? AND state IN ('RESERVED','CONSUMED')",row.id)!.count};}
 expire(){const now=new Date(this.now()).toISOString();for(const row of this.database.all<OfferRow>("SELECT * FROM merchant_offer_versions WHERE status='PUBLISHED' AND json_extract(terms_json,'$.validUntil')<=?",now)){this.database.run("UPDATE merchant_offer_versions SET status='EXPIRED',updated_at=? WHERE id=? AND status='PUBLISHED'",now,row.id);this.database.audit('merchant','OFFER_EXPIRED',row.id,row.version);}}
 list(){this.expire();return this.database.all<OfferRow>('SELECT * FROM merchant_offer_versions WHERE merchant_id=? ORDER BY version DESC',MERCHANT).map(row=>this.view(row));}
 review(sessionId:string,id:unknown){
  invariant(typeof id==='string','OFFER_REQUIRED');const row=this.get(id);invariant(row.status==='DRAFT','DRAFT_REQUIRED',409);this.revalidate(JSON.parse(row.terms_json));
  const token=randomBytes(32).toString('hex');this.database.run('INSERT INTO merchant_publish_confirmations VALUES(?,?,?,?,?,NULL)',hash(token),sessionId,id,row.terms_hash,new Date(this.now()+300000).toISOString());
  return {offer:this.view(row),confirmationToken:token,expiresAt:new Date(this.now()+300000).toISOString()};
 }
 publish(sessionId:string,value:unknown){
  const v=object(value);invariant(Object.keys(v).every(k=>['offerId','confirmationToken','confirmExactTerms'].includes(k)),'UNKNOWN_PUBLICATION_FIELD');
  invariant(v.confirmExactTerms===true&&typeof v.offerId==='string'&&typeof v.confirmationToken==='string','EXPLICIT_MERCHANT_CONFIRMATION_REQUIRED',403);
  return this.database.transaction(()=>{
   const row=this.get(v.offerId as string),confirmation=this.database.get<{terms_hash:string;used_at:string|null}>("SELECT * FROM merchant_publish_confirmations WHERE token_hash=? AND session_id=? AND offer_id=? AND expires_at>?",hash(v.confirmationToken as string),sessionId,row.id,new Date(this.now()).toISOString());
   invariant(confirmation&&!confirmation.used_at&&confirmation.terms_hash===row.terms_hash,'EXPLICIT_MERCHANT_CONFIRMATION_REQUIRED',403);
   invariant(row.status==='DRAFT','DRAFT_REQUIRED',409);invariant(hash(row.terms_json)===row.terms_hash,'DRAFT_TERMS_CHANGED',409);const source=this.database.get<SimulationRow>('SELECT * FROM merchant_offer_simulations WHERE id=?',row.source_simulation_id)!;
   invariant(source.catalog_fingerprint===this.fingerprint(),'MERCHANT_TERMS_CHANGED',409);this.revalidate(JSON.parse(row.terms_json));
   const now=new Date(this.now()).toISOString();this.database.run('UPDATE merchant_publish_confirmations SET used_at=? WHERE token_hash=?',now,hash(v.confirmationToken as string));
   this.database.run("UPDATE merchant_offer_versions SET status='PUBLISHED',published_at=?,updated_at=? WHERE id=?",now,now,row.id);this.database.audit('merchant','OFFER_PUBLISHED',row.id,row.version);return this.view(this.get(row.id));
  });
 }
 // Server worker capability only: absent from HTTP routes and the LLM tool allowlist.
 publishWithinPolicy(policyId:string,offerId:string){return this.database.transaction(()=>{
  const policy=this.database.get<{id:string;version:number;status:string;terms_json:string}>('SELECT * FROM merchant_agent_policies WHERE merchant_id=? ORDER BY version DESC LIMIT 1',MERCHANT);
  invariant(policy?.id===policyId&&policy.status==='ACTIVE','ACTIVE_MERCHANT_POLICY_REQUIRED',403);
  const p=JSON.parse(policy.terms_json),row=this.get(offerId),terms=JSON.parse(row.terms_json) as OfferPackageTerms;
  invariant(p.autoPublishWithinPolicy===true&&row.status==='DRAFT'&&terms.discountPercent<=p.maxDiscountPercent&&terms.minimumGroupSize>=p.minimumGroupSize&&terms.maxRedemptions<=p.maxRedemptions&&terms.eligiblePackageIds.every(id=>p.eligiblePackageIds.includes(id))&&terms.eligibleStartDate>=p.eligibleStartDate&&terms.eligibleEndDate<=p.eligibleEndDate,'OUTSIDE_MERCHANT_POLICY',403);
  const source=this.database.get<SimulationRow>('SELECT * FROM merchant_offer_simulations WHERE id=?',row.source_simulation_id)!;
  invariant(source.session_id===`policy:${policyId}`&&source.catalog_fingerprint===this.fingerprint(),'POLICY_SIMULATION_REQUIRED',403);
  const result=simulateGroupOffer(JSON.parse(source.input_json),this.database);invariant(result.accepted&&!result.blockedByMerchantFloor&&result.newlyFeasibleGroups>=p.minimumQualifyingGroups&&JSON.stringify(result)===source.result_json,'POLICY_DEMAND_THRESHOLD',409);
  this.revalidate(terms);for(const pkg of declaredCatalog().filter(p=>terms.eligiblePackageIds.includes(p.id))){const shared=Math.ceil(pkg.sharedBaseCostCents*(100-terms.discountPercent)/100);invariant((shared-pkg.merchantBoundaries.costCents)*100>=shared*p.minimumMarginPercent,'POLICY_MARGIN_OR_PRICE_FLOOR',409);}
  const timestamp=new Date(this.now()).toISOString();this.database.run("UPDATE merchant_offer_versions SET status='PUBLISHED',published_at=?,updated_at=? WHERE id=?",timestamp,timestamp,row.id);
  this.database.audit(`agent:policy:${policyId}`,'OFFER_PUBLISHED',row.id,row.version);return this.view(this.get(row.id));
 });}
 revoke(sessionId:string,id:unknown,confirmed:unknown){invariant(sessionId&&confirmed===true&&typeof id==='string','EXPLICIT_MERCHANT_CONFIRMATION_REQUIRED',403);return this.database.transaction(()=>{const row=this.get(id as string);invariant(row.status==='PUBLISHED'||row.status==='DRAFT','OFFER_NOT_REVOCABLE',409);this.database.run("UPDATE merchant_offer_versions SET status='REVOKED',updated_at=? WHERE id=?",new Date(this.now()).toISOString(),row.id);this.database.audit('merchant','OFFER_REVOKED',row.id,row.version);return this.view(this.get(row.id));});}
}

export function offerEligibility(row:OfferRow,pkg:MerchantPackage,size:number,redemptions:number,now=Date.now()):string|null {
 const terms=JSON.parse(row.terms_json) as OfferPackageTerms;
 if(row.status!=='PUBLISHED')return 'OFFER_NOT_PUBLISHED';
 if(now<Date.parse(terms.validFrom)||now>=Date.parse(terms.validUntil))return 'OFFER_NOT_ACTIVE';
 if(pkg.merchantId!==terms.merchantId)return 'WRONG_MERCHANT';
 if(!terms.eligiblePackageIds.includes(pkg.id))return 'INELIGIBLE_PACKAGE';
 if(size<terms.minimumGroupSize)return 'GROUP_TOO_SMALL';
 if(pkg.terms.startDate<terms.eligibleStartDate||pkg.terms.endDate>terms.eligibleEndDate)return 'INELIGIBLE_DATES';
 if(redemptions>=terms.maxRedemptions)return 'OFFER_REDEMPTION_LIMIT';
 for(const key of PRICE_FIELDS)if(!Number.isSafeInteger(pkg[key]))return 'INVALID_CATALOG';
 return null;
}
