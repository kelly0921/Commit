import { type MerchantPackage, type ParsedConstraint, PERSONAS, validateParsed } from './domain.js';
const listings = [
  { id: 'trail-cabin', name: 'Trail Cabin', description: 'A simple cabin with shared sleeping spaces and plenty of mountain time.', sharedBaseCostCents: 72000, capacity: 4, privateBeds: 0, liftTicketPriceCents: 8000, rentalPriceCents: 4500, bedSupplementCents: 0, parkingIncluded: true, parkingFeeCents: 0, distanceMinutes: 25, available: true, badge: 'Budget friendly' },
  { id: 'summit-lodge', name: 'Summit Lodge', description: 'Two nights at the lodge, lift tickets, and room for everyone to settle in.', sharedBaseCostCents: 96000, capacity: 4, privateBeds: 4, liftTicketPriceCents: 9500, rentalPriceCents: 5500, bedSupplementCents: 6000, parkingIncluded: true, parkingFeeCents: 0, distanceMinutes: 12, available: true, badge: 'The balanced weekend' },
  { id: 'slopeside', name: 'Slopeside House', description: 'Wake up beside the lifts in a premium private chalet.', sharedBaseCostCents: 112000, capacity: 4, privateBeds: 4, liftTicketPriceCents: 11000, rentalPriceCents: 6500, bedSupplementCents: 7500, parkingIncluded: true, parkingFeeCents: 0, distanceMinutes: 2, available: true, badge: 'Steps from the snow' },
  { id: 'pine-retreat', name: 'Pine Retreat', description: 'A quiet woodland stay with one dedicated bed upgrade and paid parking.', sharedBaseCostCents: 92000, capacity: 4, privateBeds: 1, liftTicketPriceCents: 10000, rentalPriceCents: 5000, bedSupplementCents: 7000, parkingIncluded: false, parkingFeeCents: 4000, distanceMinutes: 28, available: true, badge: 'A quieter escape' },
  { id: 'north-peak', name: 'North Peak Inn', description: 'A well-priced inn with comfortable beds. This weekend is sold out.', sharedBaseCostCents: 88000, capacity: 4, privateBeds: 4, liftTicketPriceCents: 9000, rentalPriceCents: 4000, bedSupplementCents: 5000, parkingIncluded: true, parkingFeeCents: 0, distanceMinutes: 35, available: false, badge: 'Sold out' },
  { id: 'cozy-loft', name: 'Cozy Mountain Loft', description: 'An intimate loft for a smaller crew, close to the mountain.', sharedBaseCostCents: 56000, capacity: 3, privateBeds: 3, liftTicketPriceCents: 9000, rentalPriceCents: 4500, bedSupplementCents: 5000, parkingIncluded: true, parkingFeeCents: 0, distanceMinutes: 8, available: true, badge: 'For smaller groups' },
];
// Published fictional merchant data; neither interpreter nor explainer can write this catalog.
const quality = [
  { rating:3.7,reviewCount:18,accommodationQuality:2,cancellationFlexibility:'NONE',includedAmenities:['wifi'] },
  { rating:4.6,reviewCount:240,accommodationQuality:4,cancellationFlexibility:'FLEXIBLE',includedAmenities:['wifi','breakfast','shuttle'] },
  { rating:4.9,reviewCount:360,accommodationQuality:5,cancellationFlexibility:'FLEXIBLE',includedAmenities:['wifi','breakfast','shuttle','hotTub'] },
  { rating:4.1,reviewCount:85,accommodationQuality:3,cancellationFlexibility:'PARTIAL',includedAmenities:['wifi'] },
  { rating:4.4,reviewCount:180,accommodationQuality:4,cancellationFlexibility:'FLEXIBLE',includedAmenities:['wifi','breakfast'] },
  { rating:4.3,reviewCount:65,accommodationQuality:3,cancellationFlexibility:'PARTIAL',includedAmenities:['wifi'] },
] as const;
export const PACKAGES: MerchantPackage[] = listings.map((pkg,index)=>({ ...pkg, merchantId:'summit-weekend',
  quality:{...quality[index]!,includedAmenities:[...quality[index]!.includedAmenities]},
  terms:{startDate:'2026-12-11',endDate:'2026-12-13',cancelBy:'2026-12-04',refundPercent:quality[index]!.cancellationFlexibility==='FLEXIBLE'?100:quality[index]!.cancellationFlexibility==='PARTIAL'?50:0},
  merchantBoundaries:{minimumTotalCents:pkg.sharedBaseCostCents,costCents:Math.floor(pkg.sharedBaseCostCents*0.7),minimumMarginBps:1500,maximumDiscountBps:1500,listSharedBaseCostCents:pkg.sharedBaseCostCents,eligibleStartDate:'2026-12-01',eligibleEndDate:'2026-12-31',availableInventory:pkg.available?2:0,redemptionLimit:5,redeemedCount:0}
}));
const rule = (key: string, value: boolean | number) => ({ key, value, visibility: 'PRIVATE' as const });
export const SEED_STATEMENTS: Record<string, string> = {
  kelly: "I'd prefer to stay near $400, but my hard max is $450. I need rentals.",
  lawrence: 'My hard max is $400. I own equipment and do not need rentals.',
  sarah: 'My hard max is $500. Having my own bed is a hard requirement.',
  alex: 'My hard max is $350. I can drive.',
};
export const SEED_CONSTRAINTS: Record<string, ParsedConstraint> = {
  kelly: { hardMax: 450, preferredMax: 400, requirements: [rule('rentalsRequired', true)], preferences: [], confidence: 1, clarifications: [] },
  lawrence: { hardMax: 400, preferredMax: null, requirements: [rule('rentalsRequired', false)], preferences: [], confidence: 1, clarifications: [] },
  sarah: { hardMax: 500, preferredMax: null, requirements: [rule('ownBed', true)], preferences: [], confidence: 1, clarifications: [] },
  alex: { hardMax: 350, preferredMax: null, requirements: [], preferences: [{ ...rule('canDrive', true), weight: 1 }], confidence: 1, clarifications: [] },
};
for (const persona of PERSONAS) validateParsed(SEED_CONSTRAINTS[persona.id]);
