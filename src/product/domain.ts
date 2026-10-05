export const PLAN_STATES = ['DRAFT', 'COLLECTING_CONSTRAINTS', 'SOLVING', 'PROPOSED', 'AWAITING_COMMITMENTS', 'READY_TO_CAPTURE', 'CAPTURING', 'CONFIRMED', 'PROPOSAL_STALE', 'REPLAN_REQUIRED', 'CAPTURE_FAILED', 'COMPENSATING', 'FAILED'] as const;
export const COMMITMENT_STATES = ['NOT_STARTED', 'ORDER_CREATED', 'PAYER_APPROVED', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED', 'FAILED', 'STALE'] as const;
export type PlanState = typeof PLAN_STATES[number];
export type AiSource = 'OPENAI' | 'OFFLINE_DEMO' | 'SEED';
export type Visibility = 'PRIVATE' | 'PUBLIC';
export type Rule = { key: string; value: boolean | number; visibility: Visibility; weight?: number };
export type ParsedConstraint = { hardMax: number | null; preferredMax: number | null; requirements: Rule[]; preferences: Rule[]; confidence: number; clarifications: string[] };
export type Constraint = { userId: string; name: string; confirmed: boolean; hardMaxCents: number | null; preferredMaxCents: number | null; requirements: Rule[]; preferences: Rule[] };
export type PackageQuality = { rating: number; reviewCount: number; accommodationQuality: number; cancellationFlexibility: 'NONE' | 'PARTIAL' | 'FLEXIBLE'; includedAmenities: ('wifi' | 'breakfast' | 'shuttle' | 'hotTub')[] };
export type PackageTerms = { startDate: string; endDate: string; cancelBy: string; refundPercent: number };
export type MerchantBoundaries = { minimumTotalCents: number; costCents: number; minimumMarginBps: number; maximumDiscountBps: number; listSharedBaseCostCents: number; eligibleStartDate: string; eligibleEndDate: string; availableInventory: number; redemptionLimit: number; redeemedCount: number };
export type OfferPackageTerms = {id:string;version:number;merchantId:string;discountPercent:number;minimumGroupSize:number;eligiblePackageIds:string[];eligibleStartDate:string;eligibleEndDate:string;validFrom:string;validUntil:string;maxRedemptions:number};
export type MerchantPackage = { id: string; merchantId: string; name: string; description: string; sharedBaseCostCents: number; capacity: number; privateBeds: number; liftTicketPriceCents: number; rentalPriceCents: number; bedSupplementCents: number; parkingIncluded: boolean; parkingFeeCents: number; distanceMinutes: number; available: boolean; badge: string; quality: PackageQuality; terms: PackageTerms; merchantBoundaries: MerchantBoundaries;offer?:OfferPackageTerms };
export type Allocation = { userId: string; name: string; shareCents: number; components: { sharedCents: number; liftCents: number; rentalCents: number; bedCents: number } };
export type Check = { userId?: string; key: string; passed: boolean; visibility: Visibility };
export type ValueScores = { priceEfficiency: number; quality: number; preferenceFit: number; fairness: number; value: number };
export type Evaluation = { packageId: string; feasible: boolean; totalCents: number; allocations: Allocation[]; checks: Check[]; softPenalty: number; scores: ValueScores | null; rank: number | null };
export type SolverResult = { feasible: boolean; selected: Evaluation | null; evaluations: Evaluation[]; policyVersion: string; catalogSnapshot: MerchantPackage[]; rankedPackageIds: string[]; comparisons: { recommendedId: string | null; lowestCostId: string | null; bestExperienceId: string | null } };
export type CommitmentEnvelope = { proposalId: string; proposalVersion: number; merchantId: string; packageId: string; participantId: string; amountCeilingCents: number; buyerHardMaxCents: number; buyerHardConditions: Rule[]; currency: 'USD'; packageTerms: Omit<MerchantPackage,'merchantBoundaries'>; merchantBoundaryFingerprint: string; valuePolicyVersion: string };
export function publicPackage(pkg:MerchantPackage) { const {merchantBoundaries: _private,...publicTerms}=pkg; return publicTerms; }
export type Fact = { id: string; text: string };
export class ProductError extends Error { constructor(public code: string, public status = 400) { super(code); } }
export function invariant(condition: unknown, code: string, status = 400): asserts condition { if (!condition) throw new ProductError(code, status); }
export function cents(dollars: number) {
  invariant(typeof dollars === 'number' && Number.isFinite(dollars) && dollars >= 0 && dollars <= 100000, 'INVALID_MONEY');
  const amount = Math.round(dollars * 100);
  invariant(Number.isSafeInteger(amount) && Math.abs(dollars * 100 - amount) < 1e-7, 'FRACTIONAL_CENT_NOT_ALLOWED');
  return amount;
}
export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
export const HARD_KEYS = ['rentalsRequired', 'ownBed', 'parkingIncluded', 'maxDistanceMinutes', 'minRating', 'minReviewCount', 'minAccommodationQuality', 'flexibleCancellationRequired', 'minRefundPercent', 'wifiRequired', 'breakfastRequired'];
const softKeys = ['distanceMinutes', 'parkingIncluded', 'canDrive'];
function object(value: unknown): asserts value is Record<string, unknown> { invariant(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_AI_SCHEMA'); }
function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  invariant(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key)), 'INVALID_AI_SCHEMA');
}
function rules(value: unknown, soft: boolean): Rule[] {
  invariant(Array.isArray(value) && value.length <= 8, 'INVALID_AI_SCHEMA');
  const seen = new Set<string>();
  return value.map(item => {
    object(item); exactKeys(item, ['key', 'value', 'visibility'], soft ? ['weight'] : []);
    invariant(typeof item.key === 'string' && (soft ? softKeys : HARD_KEYS).includes(item.key) && !seen.has(item.key), 'UNSUPPORTED_OR_DUPLICATE_CONSTRAINT');
    seen.add(item.key);
    invariant(item.visibility === 'PRIVATE' || item.visibility === 'PUBLIC', 'INVALID_AI_SCHEMA');
    if (item.key === 'maxDistanceMinutes' || item.key === 'distanceMinutes') invariant(typeof item.value === 'number' && Number.isInteger(item.value) && item.value > 0 && item.value <= 600, 'INVALID_DISTANCE');
    else if (item.key === 'minRating') invariant(typeof item.value === 'number' && Number.isFinite(item.value) && item.value >= 0 && item.value <= 5 && Number.isInteger(item.value * 10), 'INVALID_QUALITY_FLOOR');
    else if (['minReviewCount','minAccommodationQuality','minRefundPercent'].includes(item.key)) invariant(typeof item.value === 'number' && Number.isSafeInteger(item.value) && item.value >= (item.key === 'minAccommodationQuality' ? 1 : 0) && item.value <= (item.key === 'minAccommodationQuality' ? 5 : item.key === 'minRefundPercent' ? 100 : 1000000), 'INVALID_QUALITY_FLOOR');
    else invariant(typeof item.value === 'boolean', 'INVALID_REQUIREMENT_TYPE');
    const weight = Object.hasOwn(item,'weight') ? item.weight : 1;
    if (soft) invariant(typeof weight === 'number' && Number.isInteger(weight) && weight >= 1 && weight <= 5, 'INVALID_WEIGHT');
    return { key: item.key, value: item.value as number | boolean, visibility: item.visibility, ...(soft ? { weight: weight as number } : {}) };
  });
}
export function validateParsed(value: unknown, forcePrivate = false): ParsedConstraint {
  object(value); exactKeys(value, ['hardMax', 'preferredMax', 'requirements', 'preferences', 'confidence', 'clarifications']);
  for (const key of ['hardMax', 'preferredMax']) { invariant(value[key] === null || typeof value[key] === 'number', 'INVALID_AI_SCHEMA'); if (value[key] !== null) cents(value[key] as number); }
  invariant(value.preferredMax === null || value.hardMax === null || (value.preferredMax as number) <= (value.hardMax as number), 'PREFERENCE_EXCEEDS_CEILING');
  invariant(typeof value.confidence === 'number' && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1, 'INVALID_AI_SCHEMA');
  invariant(Array.isArray(value.clarifications) && value.clarifications.length <= 5 && value.clarifications.every(v => typeof v === 'string' && v.length <= 200), 'INVALID_AI_SCHEMA');
  const requirements = rules(value.requirements, false); const preferences = rules(value.preferences, true);
  if (forcePrivate) for (const item of [...requirements, ...preferences]) item.visibility = 'PRIVATE';
  return { hardMax: value.hardMax as number | null, preferredMax: value.preferredMax as number | null, requirements, preferences, confidence: value.confidence, clarifications: value.clarifications as string[] };
}
export function normalize(parsed: ParsedConstraint, userId: string, name: string, confirmed: boolean): Constraint {
  return { userId, name, confirmed, hardMaxCents: parsed.hardMax === null ? null : cents(parsed.hardMax), preferredMaxCents: parsed.preferredMax === null ? null : cents(parsed.preferredMax), requirements: parsed.requirements.map(r=>({...r})), preferences: parsed.preferences.map(r=>({...r})) };
}
export const PERSONAS = [{ id: 'kelly', name: 'Kelly', color: 'purple' }, { id: 'lawrence', name: 'Lawrence', color: 'blue' }, { id: 'sarah', name: 'Sarah', color: 'rose' }, { id: 'alex', name: 'Alex', color: 'green' }] as const;
