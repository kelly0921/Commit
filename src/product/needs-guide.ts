import { evaluatePackage } from './solver.js';
import { cents, type Constraint, type MerchantPackage, type ParsedConstraint } from './domain.js';

// Exploration only. No invented ceiling, confirmed constraint, ranking or proposal.
// Other participants contribute identity for cent splitting, never private needs.
export function needsPriceGuide(catalog: MerchantPackage[], identities: string[], persona: string, needs: ParsedConstraint, revision: number) {
  const ids = [...identities];
  for (let i = 0; ids.length < 4; i++) ids.push(`price-guide-placeholder-${i}`);
  const members: Constraint[] = ids.map(userId => ({userId, name: '', confirmed: false, hardMaxCents: userId===persona&&needs.hardMax!==null?cents(needs.hardMax):null, preferredMaxCents: null,
    requirements: userId === persona ? needs.requirements.map(r => ({...r, visibility: 'PRIVATE'})) : [], preferences: []}));
  const options = catalog.flatMap(pkg => {
    const evaluated = evaluatePackage(pkg, members);
    // Ignore missing consent/budget for exploration; retain merchant/quality floors
    // and the current person's must-haves. Never claim group feasibility.
    const valid = evaluated.checks.every(c => c.key === 'confirmed' || (c.key === 'hardMax' && (c.userId!==persona || needs.hardMax===null)) || c.passed);
    if (!valid) return [];
    const allocation = evaluated.allocations.find(a => a.userId === persona)!;
    const uncertainSplit = identities.length < ids.length;
    const sharedTotal = pkg.sharedBaseCostCents + (pkg.parkingIncluded ? 0 : pkg.parkingFeeCents);
    const extras = allocation.components.liftCents + allocation.components.rentalCents + allocation.components.bedCents;
    if (needs.hardMax !== null && uncertainSplit && Math.ceil(sharedTotal / ids.length) + extras > cents(needs.hardMax)) return [];
    return [{id: pkg.id, name: pkg.name, startDate: pkg.terms.startDate, endDate: pkg.terms.endDate,
      minShareCents: uncertainSplit ? Math.floor(sharedTotal / ids.length) + extras : allocation.shareCents,
      maxShareCents: uncertainSplit ? Math.ceil(sharedTotal / ids.length) + extras : allocation.shareCents,
      components: allocation.components, rentalPriceCents: pkg.rentalPriceCents, bedSupplementCents: pkg.bedSupplementCents,
      rating: pkg.quality.rating, reviewCount: pkg.quality.reviewCount, distanceMinutes: pkg.distanceMinutes,
      refundPercent: pkg.terms.refundPercent, cancelBy: pkg.terms.cancelBy}];
  }).sort((a,b) => a.minShareCents-b.minShareCents || a.id.localeCompare(b.id));
  return {kind: 'PRICE_GUIDE' as const, revision, currency: 'USD' as const, groupSize: ids.length,
    joinedCount: identities.length, fictional: true, groupFeasibilityVerified: false,
    minShareCents: options.length ? Math.min(...options.map(o => o.minShareCents)) : null,
    maxShareCents: options.length ? Math.max(...options.map(o => o.maxShareCents)) : null,
    rentalsIncluded: needs.requirements.some(r => r.key === 'rentalsRequired' && r.value === true),
    ownBedIncluded: needs.requirements.some(r => r.key === 'ownBed' && r.value === true), options};
}
