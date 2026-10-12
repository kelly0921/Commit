import {freezeQuote,requireRental,RentalError,stayRequest,wholeCents,type Charge,type RentalHome,type RentalProvider,type StayRequest} from './discovery.js';

export interface OwnerRezAccess {
  // Server-only credential obtained through the merchant's grant. Never exposed by this class.
  bearerToken:string;merchantId:string;propertyIds:readonly number[];userAgent:string;
  authorizedPortfolio:true;listingContentLicensed:true;
}
type Fetch=typeof globalThis.fetch;
const record=(v:unknown):Record<string,unknown>=>{requireRental(!!v&&typeof v==='object'&&!Array.isArray(v),'INVALID_SUPPLIER_RESPONSE');return v as Record<string,unknown>;};
const plain=(v:unknown,max=500):string|null=>typeof v==='string'&&v.trim()?v.replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f]/g,' ').slice(0,max).trim():null;
const integer=(v:unknown):number|null=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=1000000?Number(v):null;
export class OwnerRezDiscoveryProvider implements RentalProvider {
  readonly #access:OwnerRezAccess;
  constructor(access:OwnerRezAccess,private readonly transport:Fetch=globalThis.fetch,private readonly now=()=>new Date()){
    requireRental(access.authorizedPortfolio===true&&access.listingContentLicensed===true,'SUPPLIER_PERMISSION_REQUIRED');
    requireRental(typeof access.bearerToken==='string'&&access.bearerToken.length>0&&!/[\r\n]/.test(access.bearerToken),'SUPPLIER_CREDENTIAL_REQUIRED');
    requireRental(/^[a-z0-9-]{3,80}$/.test(access.merchantId),'INVALID_SUPPLIER_MERCHANT');
    requireRental(access.propertyIds.length>0&&access.propertyIds.length<=10&&new Set(access.propertyIds).size===access.propertyIds.length&&access.propertyIds.every(n=>Number.isSafeInteger(n)&&n>0),'INVALID_AUTHORIZED_PORTFOLIO');
    requireRental(access.userAgent.length>=8&&access.userAgent.length<=200&&!/[\r\n]/.test(access.userAgent),'SUPPLIER_USER_AGENT_REQUIRED');
    this.#access={...access,propertyIds:Object.freeze([...access.propertyIds])};
  }
  private id(id:string){requireRental(/^[1-9]\d*$/.test(id)&&this.#access.propertyIds.includes(Number(id)),'HOME_NOT_AUTHORIZED');return Number(id);}
  private async request(path:string,body?:unknown):Promise<unknown>{
    // Fixed host and no redirects; no provider URL or pagination link is followed.
    try{
      const response=await this.transport('https://api.ownerrez.com'+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+this.#access.bearerToken,'User-Agent':this.#access.userAgent,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(!response.ok)throw new RentalError(response.status===401||response.status===403?'SUPPLIER_ACCESS_DENIED':response.status===402?'SUPPLIER_LISTING_ACCESS_REQUIRED':response.status===429?'SUPPLIER_RATE_LIMITED':'SUPPLIER_UNAVAILABLE');
      requireRental(response.headers.get('content-type')?.includes('application/json'),'INVALID_SUPPLIER_RESPONSE');
      requireRental(response.body,'INVALID_SUPPLIER_RESPONSE');
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;requireRental(size<=524288,'SUPPLIER_RESPONSE_TOO_LARGE');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    }catch(error){if(error instanceof RentalError)throw error;throw new RentalError('SUPPLIER_UNAVAILABLE');}
  }
  async getHomeDetails(id:string):Promise<RentalHome>{
    const propertyId=this.id(id);
    const property=record(await this.request('/v2/properties/'+propertyId));
    requireRental(property.active===true&&property.is_snoozed!==true,'HOME_UNAVAILABLE');
    requireRental(property.currency_code==='USD','UNSUPPORTED_SUPPLIER_CURRENCY');
    const listing=record(await this.request('/v2/listings/'+propertyId));
    requireRental(listing.property_id===propertyId,'SUPPLIER_PROPERTY_MISMATCH');
    requireRental(Array.isArray(listing.rooms)&&listing.rooms.length<=100,'SUPPLIER_ROOMS_UNVERIFIED');
    const rooms=listing.rooms.map(v=>{const r=record(v);return Object.freeze({name:plain(r.name,80)??'Room',type:plain(r.type,40)??'unknown',totalBeds:integer(r.total_beds)});});
    const address=property.address&&typeof property.address==='object'?property.address as Record<string,unknown>:{};
    const name=plain(property.external_name,100);requireRental(name,'SUPPLIER_PUBLIC_NAME_REQUIRED');
    const rating=typeof listing.review_average==='number'&&listing.review_average>=0&&listing.review_average<=5?listing.review_average:null;
    const spaceType=['entire_home','private_room','shared_room'].includes(String(listing.property_space_type))?listing.property_space_type as RentalHome['spaceType']:null;
    // Explicit whitelist excludes host instructions, addresses, guest/contact data,
    // Wi-Fi credentials, photos (licensing/URL policy), notes and payment URLs.
    return Object.freeze({id,name,supplier:'OWNERREZ',merchantId:this.#access.merchantId,city:plain(address.city,80),spaceType,currency:'USD',bedrooms:integer(listing.bedroom_count),bathrooms:integer(listing.bathroom_count),maxGuests:integer(property.max_guests),maxAdults:integer(property.max_adults),rooms:Object.freeze(rooms),rating,reviewCount:integer(listing.review_count),cancellationText:plain(listing.cancellation_policy,2000),source:'SUPPLIER',checkedAt:this.now().toISOString()});
  }
  async searchHomes(input:StayRequest){
    stayRequest(input);
    // Portfolio discovery only. Date/rule availability is checked by each dry-run
    // quote, never inferred from the listing or undocumented propertysearch shape.
    return Promise.all(this.#access.propertyIds.map(id=>this.getHomeDetails(String(id))));
  }
  async previewStayQuote(id:string,input:StayRequest){
    const request=stayRequest(input),propertyId=this.id(id),home=await this.getHomeDetails(id);
    requireRental(home.spaceType==='entire_home'&&home.maxGuests!==null&&home.maxGuests>=4&&(home.maxAdults===null||home.maxAdults>=4),'HOME_CAPACITY_OR_TYPE_UNVERIFIED');
    const q=record(await this.request('/v2/quotes',{property_id:propertyId,arrival:request.arrival,departure:request.departure,adults:4,children:0,infants:0,pets:0,generate_charges:true,generate_email:false,hold_dates:false,test:true,validate_rules:true}));
    requireRental(q.property_id===propertyId&&q.arrival===request.arrival&&q.departure===request.departure&&q.adults===4&&q.children===0&&q.infants===0&&q.pets===0,'SUPPLIER_QUOTE_BINDING_MISMATCH');
    requireRental(q.payment_form===null,'SUPPLIER_DRY_RUN_UNVERIFIED');
    requireRental(Array.isArray(q.charges)&&q.charges.length>0&&q.charges.length<=100,'INVALID_QUOTE_CHARGES');
    const charges:Charge[]=q.charges.map(v=>{const c=record(v);requireRental(['rent','surcharge','tax','tax_other','surcharge_other'].includes(String(c.type)),'UNSUPPORTED_QUOTE_CHARGE');return {label:plain(c.description,160)??'Supplier charge',kind:c.type==='rent'?'RENT':c.type==='tax'||c.type==='tax_other'?'TAX':'FEE',amountCents:wholeCents(c.amount)};});
    const expiry=q.expires_utc===null||q.expires_utc===undefined?null:plain(q.expires_utc,80);requireRental(q.expires_utc==null||expiry,'INVALID_QUOTE_EXPIRY');
    return freezeQuote(home,request,charges,expiry,this.now().toISOString(),true);
  }
}
