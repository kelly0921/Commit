import {randomBytes} from 'node:crypto';
import type {ProductDatabase} from './db.js';
import {catalogForGroup,discountedCatalog} from './catalog.js';
import {normalize,validateParsed,type OfferPackageTerms} from './domain.js';
import {solve} from './solver.js';
import type {MerchantDemand} from '../merchant/demand.js';
// Consumer-trust boundary: private needs become safe commercial signals here.
// Merchant code reads only the projection; no user/group IDs, names, limits or raw checks.
export function projectDemand(db:ProductDatabase,groupId:string){
 const goal=db.goal(groupId),catalog=catalogForGroup(db,groupId),members=db.constraintRows(groupId).map(r=>normalize(validateParsed(JSON.parse(r.parsed_json)),r.user_id,r.name,!!r.confirmed));
 const result=solve(catalog,members),selected=result.selected??result.evaluations.slice().sort((a,b)=>Number(a.checks.some(c=>!c.passed&&c.key!=='hardMax'))-Number(b.checks.some(c=>!c.passed&&c.key!=='hardMax'))||a.totalCents-b.totalCents||a.packageId.localeCompare(b.packageId))[0];if(!selected)return;
 const pkg=catalog.find(p=>p.id===selected.packageId)!,old=db.get<{cohort_id:string}>('SELECT cohort_id FROM group_projection_bindings WHERE group_id=?',groupId),cohortId=old?.cohort_id??`L-${randomBytes(8).toString('hex')}`;
 const current=db.latestProposal(goal.id),approved=current?db.get<{n:number}>("SELECT COUNT(*) AS n FROM commitments c JOIN proposal_allocations a ON a.id=c.allocation_id WHERE a.proposal_id=? AND c.state IN ('AUTHORIZED','CAPTURED')",current.id)!.n:0;
 const failed=selected.checks.filter(c=>!c.passed).map(c=>c.key),collected=members.every(m=>m.confirmed);
 const blocker=!collected?'PARTICIPATION':failed.some(k=>k.startsWith('merchant')||k==='available')?'AVAILABILITY':failed.some(k=>k.startsWith('quality')||['minRating','minReviewCount','minAccommodationQuality','flexibleCancellationRequired','minRefundPercent'].includes(k))?'QUALITY':failed.some(k=>k!=='hardMax')?'CONFIGURATION':failed.length?'PRICE':approved<members.length?'PARTICIPATION':'NONE';
 const curve=Array.from({length:11},(_,discountPercent)=>{
  const offer:OfferPackageTerms={id:'projection-only',version:1,merchantId:pkg.merchantId,discountPercent,minimumGroupSize:2,eligiblePackageIds:[pkg.id],eligibleStartDate:pkg.terms.startDate,eligibleEndDate:pkg.terms.endDate,validFrom:new Date(0).toISOString(),validUntil:'2099-01-01T00:00:00.000Z',maxRedemptions:20};
  const evaluation=solve(discountedCatalog([pkg],offer),members).evaluations[0]!;
  return {discountPercent,feasible:evaluation.feasible,totalCents:evaluation.totalCents,blockedByMerchantFloor:evaluation.checks.some(c=>c.key.startsWith('merchant')&&!c.passed)};
 });
 const unlock=curve.find(c=>c.discountPercent>0&&c.feasible)?.discountPercent;
 const purchased=goal.state==='CONFIRMED',row:MerchantDemand={cohortId,groupSize:members.length,targetDate:pkg.terms.startDate,endDate:pkg.terms.endDate,month:pkg.terms.startDate.slice(0,7),currentPackageId:pkg.id,packageName:pkg.name,potentialGmvCents:selected.totalCents,stage:purchased?'PURCHASED':!result.feasible?'INTENT':approved===members.length?'FULLY_COMMITTED':approved>0?'PARTIALLY_COMMITTED':'FEASIBLE',blocker,priceGapBand:blocker==='PRICE'?unlock!==undefined?(unlock<=5?'0_5_PERCENT':'5_10_PERCENT'):'10_PLUS_PERCENT':'NOT_APPLICABLE',qualityTier:pkg.quality.accommodationQuality>=4?'Premium':'Standard',constraintsCollected:collected,feasible:result.feasible,committedCount:approved,nearConversion:!purchased&&collected&&((blocker==='PRICE'&&unlock!==undefined)||(result.feasible&&approved>=members.length-1)),potentialEligible:!purchased&&(result.feasible||unlock!==undefined)};
 db.transaction(()=>{db.run('INSERT INTO merchant_demand_projection VALUES(?,?,?,?) ON CONFLICT(cohort_id) DO UPDATE SET data_json=excluded.data_json,curve_json=excluded.curve_json,updated_at=excluded.updated_at',cohortId,JSON.stringify(row),JSON.stringify(curve),new Date().toISOString());if(!old)db.run('INSERT INTO group_projection_bindings VALUES(?,?)',groupId,cohortId);});
 return row;
}
