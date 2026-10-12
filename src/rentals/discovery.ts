import {createHash} from 'node:crypto';

// Exploration is deliberately separate from MerchantPackage, proposal and payment authority.
export class RentalError extends Error {
  constructor(readonly code:string){super(code);this.name='RentalError';}
}
export function requireRental(condition:unknown,code:string):asserts condition {if(!condition)throw new RentalError(code);}
export interface StayRequest {arrival:string;departure:string;adults:4}
export interface RentalHome {
  id:string;supplier:'FIXTURE'|'OWNERREZ';merchantId:string;name:string;city:string|null;
  spaceType:'entire_home'|'private_room'|'shared_room'|null;currency:'USD';
  bedrooms:number|null;bathrooms:number|null;maxGuests:number|null;maxAdults:number|null;
  rooms:ReadonlyArray<{name:string;type:string;totalBeds:number|null}>;
  rating:number|null;reviewCount:number|null;cancellationText:string|null;
  // No synthetic accommodation score, merchant costs, inferred amenities or room assignments.
  source:'FICTIONAL'|'SUPPLIER';checkedAt:string;
}
export interface Charge {label:string;kind:'RENT'|'FEE'|'TAX';amountCents:number}
export interface StayQuote {
  fingerprint:string;homeId:string;merchantId:string;supplier:RentalHome['supplier'];
  source:'FICTIONAL'|'PROVIDER_DRY_RUN';request:Readonly<StayRequest>;currency:'USD';
  charges:ReadonlyArray<Charge>;totalCents:number;shareCents:ReadonlyArray<number>;
  checkedAt:string;expiresAt:string|null;expiry:'CURRENT'|'EXPIRED'|'UNKNOWN';
  availability:'RULES_VALIDATED'|'FICTIONAL';inventoryHeld:false;
  cancellationText:string|null;otherObligations:'UNVERIFIED';commitmentEligible:false;
}
export interface RentalProvider {
  searchHomes(request:StayRequest):Promise<ReadonlyArray<RentalHome>>;
  getHomeDetails(id:string):Promise<RentalHome>;
  previewStayQuote(id:string,request:StayRequest):Promise<StayQuote>;
}
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function stayRequest(input:unknown):StayRequest {
  requireRental(!!input&&typeof input==='object'&&!Array.isArray(input),'INVALID_STAY');
  const r=input as Record<string,unknown>;
  requireRental(Object.keys(r).every(k=>['arrival','departure','adults'].includes(k)),'UNSUPPORTED_STAY_INPUT');
  requireRental(date(r.arrival)&&date(r.departure),'INVALID_STAY_DATES');
  const nights=(Date.parse(r.departure)-Date.parse(r.arrival))/86400000;
  requireRental(nights>=1&&nights<=28,'INVALID_STAY_LENGTH');
  requireRental(r.adults===4,'PILOT_REQUIRES_FOUR_ADULTS');
  return Object.freeze({arrival:r.arrival,departure:r.departure,adults:4});
}
export function wholeCents(value:unknown):number {
  requireRental(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value*100-Math.round(value*100))<1e-7,'INVALID_QUOTE_AMOUNT');
  const cents=Math.round(value*100);requireRental(Number.isSafeInteger(cents)&&Math.abs(cents)<=10000000,'INVALID_QUOTE_AMOUNT');return cents;
}
export function freezeQuote(home:RentalHome,request:StayRequest,charges:Charge[],expiresAt:string|null,checkedAt:string,provider=false):StayQuote {
  requireRental(charges.length>0&&charges.length<=100&&charges.every(c=>Number.isSafeInteger(c.amountCents)&&Math.abs(c.amountCents)<=10000000),'INVALID_QUOTE_CHARGES');
  const totalCents=charges.reduce((n,c)=>n+c.amountCents,0);
  requireRental(Number.isSafeInteger(totalCents)&&totalCents>0&&totalCents<=10000000,'INVALID_QUOTE_TOTAL');
  requireRental(expiresAt===null||Number.isFinite(Date.parse(expiresAt)),'INVALID_QUOTE_EXPIRY');
  const shareCents=Array.from({length:4},(_,i)=>Math.floor(totalCents/4)+(i<totalCents%4?1:0));
  const terms={homeId:home.id,merchantId:home.merchantId,supplier:home.supplier,request,currency:home.currency,charges,totalCents,cancellationText:home.cancellationText};
  const attributes={spaceType:home.spaceType,bedrooms:home.bedrooms,bathrooms:home.bathrooms,maxGuests:home.maxGuests,maxAdults:home.maxAdults,rooms:home.rooms,rating:home.rating,reviewCount:home.reviewCount};
  const fingerprint=createHash('sha256').update(JSON.stringify({...terms,attributes})).digest('hex');
  return Object.freeze({...terms,fingerprint,source:provider?'PROVIDER_DRY_RUN':'FICTIONAL',request:Object.freeze({...request}),charges:Object.freeze(charges.map(c=>Object.freeze({...c}))),shareCents:Object.freeze(shareCents),checkedAt,expiresAt,
    expiry:expiresAt===null?'UNKNOWN':Date.parse(expiresAt)<=Date.parse(checkedAt)?'EXPIRED':'CURRENT',availability:provider?'RULES_VALIDATED':'FICTIONAL',inventoryHeld:false,cancellationText:home.cancellationText,otherObligations:'UNVERIFIED',commitmentEligible:false} as StayQuote);
}
export function assessDiscovery(home:RentalHome,quote:StayQuote,maximumShareCents:number|null=null){
  requireRental(home.id===quote.homeId&&home.merchantId===quote.merchantId&&home.supplier===quote.supplier,'QUOTE_HOME_MISMATCH');
  requireRental(maximumShareCents===null||Number.isSafeInteger(maximumShareCents)&&maximumShareCents>=0&&maximumShareCents<=10000000,'INVALID_EXPLORATION_LIMIT');
  const reasons:string[]=[];
  if(home.spaceType!=='entire_home')reasons.push(home.spaceType===null?'Whole-home type is unverified':'This is not an entire home');
  if(home.maxGuests===null)reasons.push('Guest capacity is unverified');else if(home.maxGuests<4)reasons.push('Not enough guest capacity');
  if(home.maxAdults!==null&&home.maxAdults<4)reasons.push('Not enough adult capacity');
  if(home.rating===null||home.reviewCount===null)reasons.push('Quality evidence is unverified');
  else {if(home.rating<4)reasons.push('Below the 4.0 rating floor');if(home.reviewCount<25)reasons.push('Below the 25-review evidence floor');}
  if(quote.expiry!=='CURRENT')reasons.push(quote.expiry==='EXPIRED'?'Quote has expired':'Quote expiry is unverified');
  if(maximumShareCents!==null&&Math.max(...quote.shareCents)>maximumShareCents)reasons.push('Above your exploration ceiling');
  return Object.freeze({status:reasons.length?'UNAVAILABLE_FOR_COMPARISON':'EXPLORATORY_ONLY',reasons:Object.freeze(reasons),groupFitVerified:false,commitmentEligible:false,
    limitations:Object.freeze(['Stay only; transport, meals and activities excluded','Room assignments and separate-bed needs are not verified','Deposits, later charges and exact cancellation obligations need verification','No reservation, date hold or payment approval','Full best-value ranking awaits complete merchant and quality boundaries'])});
}
