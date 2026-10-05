import { invariant, money, type Allocation, type Check, type Constraint, type Evaluation, type Fact, type MerchantPackage, type SolverResult } from './domain.js';

export const VALUE_POLICY_VERSION = 'bounded-value-v1';
export const QUALITY_FLOORS = Object.freeze({ minRating:4, minReviewCount:25, minAccommodationQuality:3 });
export const VALUE_WEIGHTS = Object.freeze({ priceEfficiency:25, quality:35, preferenceFit:25, fairness:15 });
const scale = (value:number) => Math.max(0,Math.min(1000,Math.round(value)));
function date(value:unknown): value is string {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
function validateCommercialData(pkg:MerchantPackage) {
  const q=pkg.quality,t=pkg.terms,b=pkg.merchantBoundaries;
  invariant(typeof pkg.merchantId==='string' && pkg.merchantId.length>0 && q && t && b,'COMMERCIAL_TERMS_REQUIRED');
  invariant(Number.isFinite(q.rating) && q.rating>=0 && q.rating<=5 && Number.isInteger(q.rating*10) && Number.isSafeInteger(q.reviewCount) && q.reviewCount>=0 && q.reviewCount<=1000000 && Number.isInteger(q.accommodationQuality) && q.accommodationQuality>=1 && q.accommodationQuality<=5,'INVALID_PACKAGE_QUALITY');
  invariant(['NONE','PARTIAL','FLEXIBLE'].includes(q.cancellationFlexibility) && Array.isArray(q.includedAmenities) && new Set(q.includedAmenities).size===q.includedAmenities.length && q.includedAmenities.every(a=>['wifi','breakfast','shuttle','hotTub'].includes(a)),'INVALID_PACKAGE_QUALITY');
  invariant(date(t.startDate) && date(t.endDate) && date(t.cancelBy) && t.endDate>t.startDate && t.cancelBy<=t.startDate && Number.isInteger(t.refundPercent) && t.refundPercent>=0 && t.refundPercent<=100,'INVALID_PACKAGE_TERMS');
  invariant(q.cancellationFlexibility==='FLEXIBLE'?t.refundPercent===100:q.cancellationFlexibility==='NONE'?t.refundPercent===0:t.refundPercent>0&&t.refundPercent<100,'INVALID_CANCELLATION_TERMS');
  for(const n of [b.minimumTotalCents,b.costCents,b.listSharedBaseCostCents])invariant(Number.isSafeInteger(n)&&n>=0&&n<=10000000,'INVALID_MERCHANT_BOUNDARY');
  for(const n of [b.minimumMarginBps,b.maximumDiscountBps])invariant(Number.isInteger(n)&&n>=0&&n<=10000,'INVALID_MERCHANT_BOUNDARY');
  for(const n of [b.availableInventory,b.redemptionLimit,b.redeemedCount])invariant(Number.isSafeInteger(n)&&n>=0,'INVALID_MERCHANT_BOUNDARY');
  invariant(date(b.eligibleStartDate)&&date(b.eligibleEndDate)&&b.eligibleEndDate>=b.eligibleStartDate,'INVALID_MERCHANT_BOUNDARY');
}
function qualityScore(pkg:MerchantPackage) {
  const q=pkg.quality;
  const rating=scale(q.rating*200), evidence=scale(Math.min(q.reviewCount,200)*5);
  const cancellation=q.cancellationFlexibility==='FLEXIBLE'?1000:q.cancellationFlexibility==='PARTIAL'?500:0;
  const accommodation=q.accommodationQuality*200, distance=scale((30-Math.min(pkg.distanceMinutes,30))*1000/30), amenities=q.includedAmenities.length*250;
  return scale((rating*30+evidence*10+cancellation*20+accommodation*25+distance*10+amenities*5)/100);
}

export function splitShared(total: number, ids: string[]): Map<string, number> {
  invariant(Number.isSafeInteger(total) && total >= 0 && ids.length > 0 && new Set(ids).size === ids.length, 'INVALID_SHARED_ALLOCATION');
  const ordered = [...ids].sort(); const base = Math.floor(total / ids.length); const remainder = total % ids.length;
  return new Map(ordered.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
}
function bool(member: Constraint, key: string) { return member.requirements.find(rule => rule.key === key)?.value === true; }
export function evaluatePackage(pkg: MerchantPackage, members: Constraint[]): Evaluation {
  validateCommercialData(pkg);
  invariant(members.length > 0 && new Set(members.map(m=>m.userId)).size === members.length, 'INVALID_MEMBERS');
  for (const amount of [pkg.sharedBaseCostCents, pkg.liftTicketPriceCents, pkg.rentalPriceCents, pkg.bedSupplementCents, pkg.parkingFeeCents]) invariant(Number.isSafeInteger(amount) && amount >= 0 && amount <= 10000000, 'INVALID_PACKAGE_PRICE');
  invariant(Number.isInteger(pkg.capacity) && pkg.capacity >= 0 && Number.isInteger(pkg.privateBeds) && pkg.privateBeds >= 0 && Number.isInteger(pkg.distanceMinutes) && pkg.distanceMinutes >= 0, 'INVALID_PACKAGE');
  invariant(typeof pkg.available==='boolean' && typeof pkg.parkingIncluded==='boolean','INVALID_PACKAGE');
  const sharedCost = pkg.sharedBaseCostCents + (pkg.parkingIncluded ? 0 : pkg.parkingFeeCents);
  const shared = splitShared(sharedCost, members.map(member=>member.userId));
  const checks: Check[] = [
    { key: 'available', passed: pkg.available, visibility: 'PUBLIC' },
    { key: 'capacity', passed: pkg.capacity >= members.length, visibility: 'PUBLIC' },
    { key: 'beds', passed: pkg.privateBeds >= members.filter(m=>bool(m,'ownBed')).length, visibility: 'PRIVATE' },
    { key:'qualityRating',passed:pkg.quality.rating>=QUALITY_FLOORS.minRating,visibility:'PUBLIC' },
    { key:'qualityEvidence',passed:pkg.quality.reviewCount>=QUALITY_FLOORS.minReviewCount,visibility:'PUBLIC' },
    { key:'qualityAccommodation',passed:pkg.quality.accommodationQuality>=QUALITY_FLOORS.minAccommodationQuality,visibility:'PUBLIC' },
    { key:'merchantDates',passed:pkg.terms.startDate>=pkg.merchantBoundaries.eligibleStartDate&&pkg.terms.endDate<=pkg.merchantBoundaries.eligibleEndDate,visibility:'PUBLIC' },
    { key:'merchantInventory',passed:pkg.merchantBoundaries.availableInventory>=1,visibility:'PUBLIC' },
    { key:'merchantRedemptions',passed:pkg.merchantBoundaries.redeemedCount<pkg.merchantBoundaries.redemptionLimit,visibility:'PUBLIC' },
  ];
  const allocations: Allocation[] = []; let softPenalty = 0;
  for (const member of members) {
    const components = { sharedCents: shared.get(member.userId)!, liftCents: pkg.liftTicketPriceCents, rentalCents: bool(member,'rentalsRequired') ? pkg.rentalPriceCents : 0, bedCents: bool(member,'ownBed') ? pkg.bedSupplementCents : 0 };
    const shareCents = Object.values(components).reduce((a,b)=>a+b,0);
    allocations.push({ userId: member.userId, name: member.name, shareCents, components });
    checks.push({ userId: member.userId, key: 'confirmed', passed: member.confirmed, visibility: 'PRIVATE' });
    checks.push({ userId: member.userId, key: 'hardMax', passed: member.hardMaxCents !== null && Number.isSafeInteger(member.hardMaxCents) && member.hardMaxCents >= shareCents, visibility: 'PRIVATE' });
    for (const rule of member.requirements) {
      let passed = false;
      if (rule.key === 'rentalsRequired' && typeof rule.value === 'boolean') passed = !rule.value || components.rentalCents === pkg.rentalPriceCents;
      if (rule.key === 'ownBed' && typeof rule.value === 'boolean') passed = !rule.value || checks[2]!.passed;
      if (rule.key === 'parkingIncluded' && typeof rule.value === 'boolean') passed = !rule.value || pkg.parkingIncluded;
      if (rule.key === 'maxDistanceMinutes' && typeof rule.value === 'number' && Number.isInteger(rule.value) && rule.value > 0) passed = pkg.distanceMinutes <= rule.value;
      if (rule.key === 'minRating' && typeof rule.value === 'number' && Number.isFinite(rule.value) && rule.value>=0 && rule.value<=5) passed=pkg.quality.rating>=rule.value;
      if (rule.key === 'minReviewCount' && typeof rule.value === 'number' && Number.isSafeInteger(rule.value) && rule.value>=0) passed=pkg.quality.reviewCount>=rule.value;
      if (rule.key === 'minAccommodationQuality' && typeof rule.value === 'number' && Number.isInteger(rule.value) && rule.value>=1 && rule.value<=5) passed=pkg.quality.accommodationQuality>=rule.value;
      if (rule.key === 'flexibleCancellationRequired' && typeof rule.value === 'boolean') passed=!rule.value||pkg.quality.cancellationFlexibility==='FLEXIBLE';
      if (rule.key === 'minRefundPercent' && typeof rule.value === 'number' && Number.isInteger(rule.value) && rule.value>=0 && rule.value<=100) passed=pkg.terms.refundPercent>=rule.value;
      if (rule.key === 'wifiRequired' && typeof rule.value === 'boolean') passed=!rule.value||pkg.quality.includedAmenities.includes('wifi');
      if (rule.key === 'breakfastRequired' && typeof rule.value === 'boolean') passed=!rule.value||pkg.quality.includedAmenities.includes('breakfast');
      checks.push({ userId: member.userId, key: rule.key, passed, visibility: rule.visibility });
    }
    if (member.preferredMaxCents !== null) { invariant(Number.isSafeInteger(member.preferredMaxCents) && member.preferredMaxCents >= 0, 'INVALID_PREFERENCE'); softPenalty += Math.max(0, shareCents-member.preferredMaxCents); }
    for (const pref of member.preferences) {
      const weight = pref.weight ?? 1;
      invariant(Number.isInteger(weight) && weight >= 1 && weight <= 5, 'INVALID_WEIGHT');
      if (pref.key === 'distanceMinutes' && typeof pref.value === 'number') { invariant(Number.isInteger(pref.value) && pref.value>0 && pref.value<=600,'INVALID_DISTANCE');softPenalty += Math.max(0,pkg.distanceMinutes-pref.value) * 100 * weight; }
      else if (pref.key === 'parkingIncluded' && typeof pref.value === 'boolean') softPenalty += pref.value && !pkg.parkingIncluded ? 2500 * weight : 0;
      else if (pref.key === 'canDrive' && typeof pref.value === 'boolean') { /* Capability only; no undocumented financial credit. */ }
      else invariant(false,'UNSUPPORTED_PREFERENCE');
    }
  }
  const totalCents = allocations.reduce((sum,a)=>sum+a.shareCents,0);
  const expected = sharedCost + pkg.liftTicketPriceCents*members.length + pkg.rentalPriceCents*members.filter(m=>bool(m,'rentalsRequired')).length + pkg.bedSupplementCents*members.filter(m=>bool(m,'ownBed')).length;
  invariant(totalCents === expected && Number.isSafeInteger(totalCents), 'ALLOCATION_DOES_NOT_BALANCE',500);
  const b=pkg.merchantBoundaries,listTotal=totalCents-pkg.sharedBaseCostCents+b.listSharedBaseCostCents;
  checks.push({key:'merchantMinimumPrice',passed:totalCents>=b.minimumTotalCents,visibility:'PUBLIC'},
    {key:'merchantMinimumMargin',passed:(totalCents-b.costCents)*10000>=totalCents*b.minimumMarginBps,visibility:'PUBLIC'},
    {key:'merchantMaximumDiscount',passed:Math.max(0,listTotal-totalCents)*10000<=listTotal*b.maximumDiscountBps,visibility:'PUBLIC'});
  return { packageId: pkg.id, feasible: checks.every(c=>c.passed), totalCents, allocations, checks, softPenalty, scores:null, rank:null };
}
export function solve(packages: MerchantPackage[], members: Constraint[]): SolverResult {
  invariant(packages.length > 0 && new Set(packages.map(p=>p.id)).size === packages.length, 'INVALID_CATALOG');
  const evaluations = packages.map(pkg=>evaluatePackage(pkg,members));
  const feasible=evaluations.filter(e=>e.feasible),lowest=Math.min(...feasible.map(e=>e.totalCents));
  for(const e of feasible){
    const prices=e.allocations.map(a=>a.shareCents),average=e.totalCents/prices.length;
    const scores={priceEfficiency:e.totalCents===0?1000:scale(lowest*1000/e.totalCents),quality:qualityScore(packages.find(p=>p.id===e.packageId)!),preferenceFit:scale(1000-e.softPenalty/20),fairness:average===0?1000:scale(1000-(Math.max(...prices)-Math.min(...prices))*1000/average),value:0};
    scores.value=scale((scores.priceEfficiency*VALUE_WEIGHTS.priceEfficiency+scores.quality*VALUE_WEIGHTS.quality+scores.preferenceFit*VALUE_WEIGHTS.preferenceFit+scores.fairness*VALUE_WEIGHTS.fairness)/100);e.scores=scores;
  }
  const stable=(a:Evaluation,b:Evaluation)=>a.totalCents-b.totalCents||a.packageId.localeCompare(b.packageId,'en');
  const ranked=[...feasible].sort((a,b)=>b.scores!.value-a.scores!.value||b.scores!.quality-a.scores!.quality||stable(a,b));
  ranked.forEach((e,index)=>e.rank=index+1);
  return { feasible: ranked.length>0,selected:ranked[0]??null,evaluations,policyVersion:VALUE_POLICY_VERSION,catalogSnapshot:structuredClone(packages),rankedPackageIds:ranked.map(e=>e.packageId),
    comparisons:{recommendedId:ranked[0]?.packageId??null,lowestCostId:[...feasible].sort(stable)[0]?.packageId??null,bestExperienceId:[...feasible].sort((a,b)=>b.scores!.quality-a.scores!.quality||stable(a,b))[0]?.packageId??null} };
}
export function publicFacts(result: SolverResult, packages: MerchantPackage[]): Fact[] {
  if (!result.selected) return [{ id:'no-match', text:'None of the available packages meets all of the group’s confirmed needs. Update your own needs or explore another configuration.' }];
  const pkg = packages.find(p=>p.id === result.selected!.packageId)!;
  const e = result.selected;
  const facts: Fact[] = [
    {id:'fit',text:`${pkg.name} meets every participant’s confirmed hard requirements.`},
    {id:'ranking',text:'It ranks first for best value after every hard buyer, quality and merchant boundary passes. The fixed value formula weighs price efficiency 25%, quality 35%, preference fit 25% and fairness 15%.'},
    {id:'total',text:`The group total is ${money(e.totalCents)}, allocated exactly across ${e.allocations.length} people.`},
    {id:'quality',text:`Merchant-reported demo quality: ${pkg.quality.rating.toFixed(1)}/5 from ${pkg.quality.reviewCount} reviews; accommodation ${pkg.quality.accommodationQuality}/5; ${pkg.distanceMinutes} minutes to lifts; ${pkg.terms.refundPercent}% refund when cancelled by ${pkg.terms.cancelBy}.`},
    {id:'shared',text:'Shared lodging and parking costs are split equally. Each person pays only their own add-ons.'},
    {id:'capture',text:'Each person commits to their own share. Authorization does not complete the purchase.'},
  ];
  return facts;
}
export function renderExplanation(selection: unknown, facts: Fact[]): string {
  invariant(selection && typeof selection === 'object' && !Array.isArray(selection), 'INVALID_EXPLANATION');
  const data = selection as Record<string, unknown>;
  invariant(Object.keys(data).length === 1 && Array.isArray(data.factIds) && data.factIds.length >= 1 && data.factIds.length <= 4 && new Set(data.factIds).size === data.factIds.length, 'INVALID_EXPLANATION');
  const ordered = data.factIds.map(id=>{ const fact=facts.find(f=>f.id === id); invariant(fact,'UNKNOWN_EXPLANATION_FACT'); return fact.text; });
  // All prose and numbers come from deterministic facts; the LLM chooses emphasis/order only.
  return ordered.join(' ');
}
