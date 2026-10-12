import { type Constraint, type MerchantPackage, type Evaluation, invariant } from '../product/domain.js';
import { solve, evaluatePackage } from '../product/solver.js';
import { PACKAGES } from '../product/seed.js';
import type {ProductDatabase} from '../product/db.js';

export const DEMAND_VERSION = 'summit-demand-v1';
export const OFFER_BOUNDARIES = Object.freeze({ maximumDiscountPercent:10, minimumMarginPercent:20, eligibleStartDate:'2027-01-01', eligibleEndDate:'2027-03-31', packageIds:['summit-lodge','slopeside','pine-retreat'] });
export type DemandStage = 'INTENT'|'FEASIBLE'|'PARTIALLY_COMMITTED'|'FULLY_COMMITTED'|'PURCHASED';
export type Blocker = 'NONE'|'PRICE'|'QUALITY'|'CONFIGURATION'|'AVAILABILITY'|'PARTICIPATION';
export type MerchantDemand = {
  cohortId:string; groupSize:number; targetDate:string; endDate:string; month:string;
  currentPackageId:string; packageName:string; potentialGmvCents:number;
  stage:DemandStage; blocker:Blocker; priceGapBand:string; qualityTier:string;
  constraintsCollected:boolean; feasible:boolean; committedCount:number; nearConversion:boolean; potentialEligible:boolean;
};
// This private fixture never enters Studio or the browser bundle. It is separate from the live database.
type Intent = { cohortId:string; targetDate:string; endDate:string; packageId:string; members:Constraint[]; committedCount:number; purchased:boolean };
const after = (date:string,days:number) => new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
export function winterCatalog(intent:{targetDate:string;endDate:string;packageId:string},discountPercent=0):MerchantPackage[] {
  const source=PACKAGES.find(p=>p.id===intent.packageId)!;
  const pkg=structuredClone(source);
  // Independently declared fictional 2027 inventory, never a write to the consumer catalog.
  pkg.capacity=pkg.id==='slopeside'?6:pkg.id==='summit-lodge'?5:4;
  pkg.privateBeds=pkg.id==='pine-retreat'?1:pkg.capacity;
  pkg.terms={...pkg.terms,startDate:intent.targetDate,endDate:intent.endDate,cancelBy:after(intent.targetDate,-7)};
  pkg.merchantBoundaries={minimumTotalCents:Math.ceil(source.sharedBaseCostCents*.85),costCents:Math.ceil(source.sharedBaseCostCents*.62),minimumMarginBps:2000,maximumDiscountBps:1000,listSharedBaseCostCents:source.sharedBaseCostCents,eligibleStartDate:OFFER_BOUNDARIES.eligibleStartDate,eligibleEndDate:OFFER_BOUNDARIES.eligibleEndDate,availableInventory:20,redemptionLimit:100,redeemedCount:0};
  for(const key of ['sharedBaseCostCents','liftTicketPriceCents','rentalPriceCents','bedSupplementCents','parkingFeeCents'] as const) pkg[key]=Math.ceil(source[key]*(100-discountPercent)/100);
  return [pkg];
}
const catalogFor=winterCatalog;
function seed():Intent[] {
  const dates=['2027-01-22','2027-02-05','2027-02-12','2027-02-19','2027-03-05'];
  return Array.from({length:50},(_,i)=>{
    const kind=i%10,groupSize=kind>=5&&kind<=7?4+(i%2):3+(i%4);
    const packageId=kind>=5&&kind<=7?'summit-lodge':OFFER_BOUNDARIES.packageIds[i%3]!;
    const targetDate=kind===9&&i%20===9?'2027-04-02':dates[Math.floor(i/10)]!;
    const members:Constraint[]=Array.from({length:groupSize},(_,n)=>({userId:`fixture-${i}-${n}`,name:`Synthetic member ${n+1}`,confirmed:kind!==0,hardMaxCents:100000,preferredMaxCents:null,requirements:n%3===0?[{key:'rentalsRequired',value:true,visibility:'PRIVATE'}]:[],preferences:[]}));
    const intent:Intent={cohortId:`G-${String(i+1).padStart(3,'0')}`,targetDate,endDate:after(targetDate,2),packageId,members,committedCount:kind===2?groupSize-1:kind===3||kind===4?groupSize:0,purchased:kind===4};
    if(kind===8) members[0]!.requirements.push({key:i%20===8?'minRating':'ownBed',value:i%20===8?5:true,visibility:'PRIVATE'});
    if(kind===8&&i%20===18) members.forEach(m=>m.requirements.push({key:'ownBed',value:true,visibility:'PRIVATE'}));
    if(kind===9&&i%20===19) members[0]!.requirements.push({key:'flexibleCancellationRequired',value:true,visibility:'PRIVATE'});
    const quote=evaluatePackage(catalogFor(intent)[0]!,members);
    quote.allocations.forEach((a,n)=>{members[n]!.hardMaxCents=a.shareCents+2500+(n*137);members[n]!.preferredMaxCents=a.shareCents;});
    const gap=kind===5?2:kind===6?4:kind===7?7:kind===9&&i%20===19?12:0;
    if(gap) members[0]!.hardMaxCents=Math.floor(quote.allocations[0]!.shareCents*(100-gap)/100);
    // A configured capacity or quality failure cannot be repaired with price.
    if(!solve(catalogFor(intent),members).feasible) { intent.purchased=false;intent.committedCount=0; }
    return intent;
  });
}
const intents=seed();
function primaryBlocker(e:Evaluation,intent:Intent):Blocker {
  const failed=e.checks.filter(c=>!c.passed).map(c=>c.key);
  if(failed.includes('confirmed'))return 'PARTICIPATION';
  if(failed.some(k=>['available','merchantDates','merchantInventory','merchantRedemptions'].includes(k)))return 'AVAILABILITY';
  if(failed.some(k=>k.startsWith('quality')||['minRating','minReviewCount','minAccommodationQuality','flexibleCancellationRequired','minRefundPercent'].includes(k)))return 'QUALITY';
  if(failed.some(k=>['capacity','beds','ownBed','parkingIncluded','maxDistanceMinutes','wifiRequired','breakfastRequired'].includes(k)))return 'CONFIGURATION';
  if(failed.length)return 'PRICE';
  return !intent.purchased&&intent.committedCount<intent.members.length?'PARTICIPATION':'NONE';
}
function derive(intent:Intent):MerchantDemand {
  const catalog=catalogFor(intent),result=solve(catalog,intent.members),e=result.evaluations[0]!;
  const blocker=primaryBlocker(e,intent),constraintsCollected=intent.members.every(m=>m.confirmed);
  const unlock=blocker==='PRICE'?Array.from({length:10},(_,n)=>n+1).find(d=>solve(catalogFor(intent,d),intent.members).feasible):undefined;
  const potentialEligible=!intent.purchased&&(result.feasible||unlock!==undefined);
  return {cohortId:intent.cohortId,groupSize:intent.members.length,targetDate:intent.targetDate,endDate:intent.endDate,month:intent.targetDate.slice(0,7),currentPackageId:intent.packageId,packageName:catalog[0]!.name,potentialGmvCents:e.totalCents,stage:intent.purchased?'PURCHASED':!result.feasible?'INTENT':intent.committedCount===intent.members.length?'FULLY_COMMITTED':intent.committedCount>0?'PARTIALLY_COMMITTED':'FEASIBLE',blocker,priceGapBand:blocker==='PRICE'?unlock!==undefined&&unlock<=5?'0_5_PERCENT':unlock!==undefined?'5_10_PERCENT':'10_PLUS_PERCENT':'NOT_APPLICABLE',qualityTier:catalog[0]!.quality.accommodationQuality>=4?'Premium':'Standard',constraintsCollected,feasible:result.feasible,committedCount:intent.committedCount,nearConversion:!intent.purchased&&(unlock!==undefined||(result.feasible&&intent.committedCount>=intent.members.length-1)),potentialEligible};
}
export function merchantDemand(database?:ProductDatabase):MerchantDemand[] { return [...intents.map(derive),...(database?.all<{data_json:string}>('SELECT data_json FROM merchant_demand_projection ORDER BY cohort_id').map(r=>JSON.parse(r.data_json) as MerchantDemand)??[])]; }
export function demandMetrics(rows:MerchantDemand[]) {
  const active=rows.filter(r=>r.stage!=='PURCHASED');
  const blockers:Blocker[]=['PRICE','QUALITY','CONFIGURATION','AVAILABILITY','PARTICIPATION'];
  return {activeGroupIntents:active.length,potentialGmvCents:active.filter(r=>r.potentialEligible).reduce((s,r)=>s+r.potentialGmvCents,0),nearConversionGroups:active.filter(r=>r.nearConversion).length,fullyCommittedGroups:active.filter(r=>r.stage==='FULLY_COMMITTED').length,blockers:blockers.map(blocker=>({blocker,count:active.filter(r=>r.blocker===blocker).length})),funnel:[{step:'1 · Intent created',groups:rows.length},{step:'2 · Constraints collected',groups:rows.filter(r=>r.constraintsCollected).length},{step:'3 · Feasible plan',groups:rows.filter(r=>r.feasible).length},{step:'4 · At least one commitment',groups:rows.filter(r=>r.feasible&&r.committedCount>0).length},{step:'5 · Fully committed',groups:rows.filter(r=>r.feasible&&r.committedCount===r.groupSize).length},{step:'6 · Purchased',groups:rows.filter(r=>r.stage==='PURCHASED').length}]};
}
export type OfferInput={discountPercent:number;minimumGroupSize?:number;startDate?:string;endDate?:string;packageIds?:string[];cohortIds?:string[]};
export const SIMULATION_FIELDS=['discountPercent','minimumGroupSize','startDate','endDate','packageIds','cohortIds'];
export function validateOffer(value:unknown,database?:ProductDatabase):OfferInput {
  invariant(value!==null&&typeof value==='object'&&!Array.isArray(value),'INVALID_SIMULATION');const v=value as Record<string,unknown>;
  invariant(Object.keys(v).every(k=>SIMULATION_FIELDS.includes(k)),'UNKNOWN_SIMULATION_FIELD');
  invariant(typeof v.discountPercent==='number'&&Number.isInteger(v.discountPercent)&&v.discountPercent>=0&&v.discountPercent<=100,'INVALID_DISCOUNT');
  if(v.minimumGroupSize!==undefined)invariant(Number.isInteger(v.minimumGroupSize)&&Number(v.minimumGroupSize)>=2&&Number(v.minimumGroupSize)<=6,'INVALID_GROUP_SIZE');
  const validDate=(d:unknown)=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  for(const k of ['startDate','endDate']) if(v[k]!==undefined)invariant(validDate(v[k]),'INVALID_DATE');
  if(v.startDate&&v.endDate)invariant(v.startDate<=v.endDate,'INVALID_DATE_RANGE');
  if(v.packageIds!==undefined)invariant(Array.isArray(v.packageIds)&&v.packageIds.length>0&&v.packageIds.length<=3&&new Set(v.packageIds).size===v.packageIds.length&&v.packageIds.every(id=>OFFER_BOUNDARIES.packageIds.includes(id)),'INELIGIBLE_PACKAGE');
  if(v.cohortIds!==undefined){const ids=new Set(merchantDemand(database).map(r=>r.cohortId));invariant(Array.isArray(v.cohortIds)&&v.cohortIds.length<=500&&new Set(v.cohortIds).size===v.cohortIds.length&&v.cohortIds.every(id=>ids.has(id)),'INVALID_COHORT_SCOPE');}
  return v as OfferInput;
}
function evaluateOfferScenario(value:unknown,database?:ProductDatabase) {
  const input=validateOffer(value,database),rows=merchantDemand(database);
  const eligible=intents.filter((g,i)=>!g.purchased&&rows[i]!.constraintsCollected&&g.members.length>=(input.minimumGroupSize??2)&&(!input.startDate||g.targetDate>=input.startDate)&&(!input.endDate||g.endDate<=input.endDate)&&(!input.packageIds||input.packageIds.includes(g.packageId))&&(!input.cohortIds||input.cohortIds.includes(g.cohortId)));
  const rejected=input.discountPercent>OFFER_BOUNDARIES.maximumDiscountPercent||(input.startDate!==undefined&&input.startDate<OFFER_BOUNDARIES.eligibleStartDate)||(input.endDate!==undefined&&input.endDate>OFFER_BOUNDARIES.eligibleEndDate);
  let newlyFeasibleGroups=0,projectedIncrementalGmvCents=0,estimatedDiscountCostCents=0,blockedGroupsByMerchantFloor=0,beforeFeasibleGroups=0,afterFeasibleGroups=0;
  for(const g of eligible){
    const before=solve(catalogFor(g),g.members);if(before.feasible)beforeFeasibleGroups++;
    if(rejected)continue;
    const afterResult=solve(catalogFor(g,input.discountPercent),g.members);if(afterResult.feasible)afterFeasibleGroups++;
    if(afterResult.evaluations.some(e=>e.checks.some(c=>c.key.startsWith('merchant')&&!c.passed)))blockedGroupsByMerchantFloor++;
    if(!before.feasible&&afterResult.selected){newlyFeasibleGroups++;projectedIncrementalGmvCents+=afterResult.selected.totalCents;estimatedDiscountCostCents+=before.evaluations[0]!.totalCents-afterResult.selected.totalCents;}
  }
  // Consumer-side projection already checked private needs. Merchant code receives
  // only aggregate feasibility curves, never those needs or participant identities.
  const live=(database?.all<{data_json:string;curve_json:string}>('SELECT data_json,curve_json FROM merchant_demand_projection')??[]).map(r=>({row:JSON.parse(r.data_json) as MerchantDemand,curve:JSON.parse(r.curve_json) as {discountPercent:number;feasible:boolean;totalCents:number;blockedByMerchantFloor:boolean}[]})).filter(({row:r})=>r.stage!=='PURCHASED'&&r.constraintsCollected&&r.groupSize>=(input.minimumGroupSize??2)&&(!input.startDate||r.targetDate>=input.startDate)&&(!input.endDate||r.endDate<=input.endDate)&&(!input.packageIds||input.packageIds.includes(r.currentPackageId))&&(!input.cohortIds||input.cohortIds.includes(r.cohortId)));
  for(const {curve} of live){const before=curve[0]!;if(before.feasible)beforeFeasibleGroups++;if(rejected)continue;const after=curve.find(p=>p.discountPercent===input.discountPercent)!;if(after.feasible)afterFeasibleGroups++;if(after.blockedByMerchantFloor)blockedGroupsByMerchantFloor++;if(!before.feasible&&after.feasible){newlyFeasibleGroups++;projectedIncrementalGmvCents+=after.totalCents;estimatedDiscountCostCents+=before.totalCents-after.totalCents;}}
  // Preserve the existing serialized result used by immutable simulation receipts
  // and offer revalidation. Analytics are projected separately, never persisted
  // into that commercial identity or used to grant additional authority.
  const result={input,readOnly:true,accepted:!rejected,eligibleGroups:eligible.length+live.length,newlyFeasibleGroups,projectedIncrementalGmvCents,estimatedDiscountCostCents,resultingMerchantRevenueCents:projectedIncrementalGmvCents,blockedByMerchantFloor:rejected||blockedGroupsByMerchantFloor>0,blockedGroupsByMerchantFloor,maximumAllowedDiscountPercent:OFFER_BOUNDARIES.maximumDiscountPercent,boundaries:OFFER_BOUNDARIES,message:rejected?`Requested terms exceed the merchant envelope. The largest allowed discount is ${OFFER_BOUNDARIES.maximumDiscountPercent}%; stays must be January–March 2027. No terms were changed.`:'Analysis only. Newly feasible does not predict purchases. Revenue is discounted incremental GMV before taxes/fees; discount cost applies only to newly feasible groups.'};
  return {result,beforeFeasibleGroups,afterFeasibleGroups:rejected?null:afterFeasibleGroups};
}
export function simulateGroupOffer(value:unknown,database?:ProductDatabase){return evaluateOfferScenario(value,database).result;}
export function merchantSimulationImpact(value:unknown,database?:ProductDatabase){
  const {result,beforeFeasibleGroups,afterFeasibleGroups}=evaluateOfferScenario(value,database);
  return {scenarioEstimate:true,beforeFeasibleGroups,afterFeasibleGroups,newlyFeasibleGroups:result.newlyFeasibleGroups,
    modeledIncrementalGmvCents:result.projectedIncrementalGmvCents,modeledIncrementalPaypalTpvCents:result.projectedIncrementalGmvCents,merchantDiscountCostCents:result.estimatedDiscountCostCents,
    newlyFeasibleDefinition:'Infeasible before the intervention; feasible after it under all existing deterministic buyer, quality and merchant boundaries, within the same eligible cohort scope.',
    message:'Scenario estimate only. GMV and PayPal TPV include discounted totals of newly feasible groups only. Potential PayPal volume assumes those groups replan, give fresh approvals and complete PayPal checkout; no purchase or processed payment is predicted. Discount cost covers those same newly feasible groups. No PayPal revenue, take rate or profit is estimated.'};
}
