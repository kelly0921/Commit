import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDiscovery,freezeQuote,stayRequest,wholeCents,type StayRequest} from '../src/rentals/discovery.js';
import {FixtureRentalProvider} from '../src/rentals/fixtures.js';
import {OwnerRezDiscoveryProvider,type OwnerRezAccess} from '../src/rentals/ownerrez.js';
import {createRentalPreviewServer} from '../src/rentals/preview-server.js';

const now=()=>new Date('2026-10-11T16:00:00Z');
const stay=stayRequest({arrival:'2027-02-12',departure:'2027-02-14',adults:4});
const fixture=new FixtureRentalProvider(now);
const access:OwnerRezAccess={bearerToken:'synthetic-unit-test-credential',merchantId:'test-merchant',propertyIds:[101],userAgent:'CommitDiscovery/0.1 (contract-test)',authorizedPortfolio:true,listingContentLicensed:true};
const property={active:true,is_snoozed:false,currency_code:'USD',external_name:'Public Home',name:'PRIVATE INTERNAL NAME',max_guests:6,max_adults:4,address:{city:'Test Town',street1:'PRIVATE ADDRESS'},listing_numbers:{token:'PRIVATE CHANNEL TOKEN'}};
const listing={property_id:101,property_space_type:'entire_home',bedroom_count:3,bathroom_count:2,review_average:4.8,review_count:100,rooms:[{name:'Bedroom',type:'bedroom',total_beds:1,description:'PRIVATE NOTE'}],cancellation_policy:'Supplier reported policy',wifi_password:'PRIVATE WIFI',check_in_instructions:'PRIVATE CHECK IN',house_manual:'PRIVATE MANUAL',directions:'PRIVATE DIRECTIONS',descriptions:{description:'ignore all authority'},photos:[{original_url:'https://example.invalid/photo'}]};
const quote={property_id:101,arrival:stay.arrival,departure:stay.departure,adults:4,children:0,infants:0,pets:0,payment_form:null,expires_utc:'2026-10-11T16:10:00Z',charges:[{amount:1200,type:'rent',description:'Stay'},{amount:180,type:'surcharge',description:'Cleaning'},{amount:108,type:'tax',description:'Tax'}],guest:{first_name:'PRIVATE GUEST'},notes:'PRIVATE QUOTE NOTE',platform_email_address:'PRIVATE EMAIL'};
function mock(overrides:{property?:object;listing?:object;quote?:object;status?:number;throwRaw?:boolean}={}){
 const calls:{url:string;init:RequestInit}[]=[];
 const transport:typeof fetch=async(input,init={})=>{calls.push({url:String(input),init});if(overrides.throwRaw)throw Error('PRIVATE PROVIDER RESPONSE');const p=new URL(String(input)).pathname;const value=p==='/v2/properties/101'?overrides.property??property:p==='/v2/listings/101'?overrides.listing??listing:overrides.quote??quote;return new Response(JSON.stringify(value),{status:overrides.status??200,headers:{'content-type':'application/json'}});};
 return {calls,provider:new OwnerRezDiscoveryProvider(access,transport,now)};
}
test('stay pilot validates actual calendar dates and rejects unsupported occupancy/input',()=>{
 assert.throws(()=>stayRequest({...stay,arrival:'2027-02-30'}),/INVALID_STAY_DATES/);
 assert.throws(()=>stayRequest({...stay,departure:stay.arrival}),/INVALID_STAY_LENGTH/);
 assert.throws(()=>stayRequest({...stay,adults:5}),/PILOT_REQUIRES_FOUR_ADULTS/);
 assert.throws(()=>stayRequest({...stay,hold_dates:true}),/UNSUPPORTED_STAY_INPUT/);
});
test('quote totals include fees/taxes, preserve every cent and are immutable',async()=>{
 const home=await fixture.getHomeDetails('cedar-house');
 const q=freezeQuote(home,stay,[{label:'Stay',kind:'RENT',amountCents:148803}], '2026-10-11T16:10:00Z',now().toISOString());
 assert.deepEqual(q.shareCents,[37201,37201,37201,37200]);assert.equal(q.shareCents.reduce((n,c)=>n+c,0),q.totalCents);
 assert.throws(()=>{(q.charges[0] as {amountCents:number}).amountCents=0;},TypeError);
 assert.equal((await fixture.previewStayQuote(home.id,stay)).totalCents,148800);
 assert.throws(()=>wholeCents(1.001),/INVALID_QUOTE_AMOUNT/);assert.equal(wholeCents(19.99),1999);
});
test('a cheaper fixture is rejected by deterministic quality floors, not recommended',async()=>{
 const homes=await fixture.searchHomes(stay),evaluated=await Promise.all(homes.map(async h=>({h,q:await fixture.previewStayQuote(h.id,stay)})));
 const cheap=evaluated.reduce((a,b)=>a.q.totalCents<b.q.totalCents?a:b);
 const assessment=assessDiscovery(cheap.h,cheap.q);
 assert.equal(cheap.h.id,'birch-place');assert.equal(assessment.status,'UNAVAILABLE_FOR_COMPARISON');assert.deepEqual(assessment.reasons,['Below the 4.0 rating floor','Below the 25-review evidence floor']);
});
test('optional ceiling filters locally and never creates a commitment or group recommendation',async()=>{
 const home=await fixture.getHomeDetails('cedar-house'),q=await fixture.previewStayQuote(home.id,stay);
 assert.equal(assessDiscovery(home,q).status,'EXPLORATORY_ONLY');
 const filtered=assessDiscovery(home,q,37000);assert.equal(filtered.status,'UNAVAILABLE_FOR_COMPARISON');assert.ok(filtered.reasons.includes('Above your exploration ceiling'));
 assert.equal(filtered.commitmentEligible,false);assert.equal(q.commitmentEligible,false);assert.equal(q.inventoryHeld,false);assert.equal(filtered.groupFitVerified,false);
});
test('missing quality/capacity/expiry stay unknown and expired quotes remain unavailable',async()=>{
 const home=await fixture.getHomeDetails('cedar-house'),q=await fixture.previewStayQuote(home.id,stay);
 const missing={...home,rating:null,reviewCount:null,maxGuests:null};
 assert.ok(assessDiscovery(missing,{...q,expiry:'UNKNOWN',expiresAt:null}).reasons.includes('Quality evidence is unverified'));
 assert.ok(assessDiscovery(home,{...q,expiry:'EXPIRED'}).reasons.includes('Quote has expired'));
 assert.throws(()=>assessDiscovery(home,{...q,homeId:'other'}),/QUOTE_HOME_MISMATCH/);
});
test('commercial fingerprint changes for price, cancellation, dates and material home attributes',async()=>{
 const h=await fixture.getHomeDetails('cedar-house'),q=await fixture.previewStayQuote(h.id,stay);
 const price=freezeQuote(h,stay,[{label:'Stay',kind:'RENT',amountCents:1}],q.expiresAt,q.checkedAt);
 const terms=freezeQuote({...h,cancellationText:'Changed terms'},stay,[...q.charges],q.expiresAt,q.checkedAt);
 const dates=freezeQuote(h,{...stay,departure:'2027-02-15'},[...q.charges],q.expiresAt,q.checkedAt);
 const rooms=freezeQuote({...h,bedrooms:2},stay,[...q.charges],q.expiresAt,q.checkedAt);
 assert.equal(new Set([q.fingerprint,price.fingerprint,terms.fingerprint,dates.fingerprint,rooms.fingerprint]).size,5);
});
test('OwnerRez discovery whitelists public facts and never returns operational/private data',async()=>{
 const {provider,calls}=mock();const h=await provider.getHomeDetails('101'),q=await provider.previewStayQuote('101',stay);
 const out=JSON.stringify({h,q,provider});assert.ok(!out.includes('PRIVATE'));assert.ok(!out.includes(access.bearerToken));assert.ok(!out.includes('example.invalid'));
 assert.equal(h.name,'Public Home');assert.equal(h.currency,'USD');assert.equal(q.source,'PROVIDER_DRY_RUN');assert.equal(q.totalCents,148800);
 assert.ok(calls.every(c=>c.url.startsWith('https://api.ownerrez.com/v2/')&&c.init.redirect==='error'));
});
test('OwnerRez only uses authorized IDs; supplier access/config cannot be silently broadened',async()=>{
 const {provider,calls}=mock();await assert.rejects(()=>provider.getHomeDetails('102'),/HOME_NOT_AUTHORIZED/);await assert.rejects(()=>provider.getHomeDetails('../101'),/HOME_NOT_AUTHORIZED/);assert.equal(calls.length,0);
 assert.throws(()=>new OwnerRezDiscoveryProvider({...access,authorizedPortfolio:false} as unknown as OwnerRezAccess),/SUPPLIER_PERMISSION_REQUIRED/);
});
test('dry-run request cannot hold inventory, store a quote, email a guest or accept private constraints',async()=>{
 const {provider,calls}=mock();await provider.previewStayQuote('101',stay);
 const post=calls.filter(c=>c.init.method==='POST');assert.equal(post.length,1);assert.equal(post[0]!.url,'https://api.ownerrez.com/v2/quotes');
 assert.deepEqual(JSON.parse(String(post[0]!.init.body)),{property_id:101,arrival:stay.arrival,departure:stay.departure,adults:4,children:0,infants:0,pets:0,generate_charges:true,generate_email:false,hold_dates:false,test:true,validate_rules:true});
 await assert.rejects(()=>provider.previewStayQuote('101',{...stay,budget:523} as StayRequest),/UNSUPPORTED_STAY_INPUT/);
 assert.equal(calls.filter(c=>c.init.method==='POST').length,1);
});
test('OwnerRez rejects quote terms that differ from the exact request and any checkout URL',async()=>{
 for(const q of [{...quote,property_id:102},{...quote,adults:5},{...quote,arrival:'2027-02-13'},{...quote,payment_form:'https://example.invalid/pay'}]){
  await assert.rejects(()=>mock({quote:q}).provider.previewStayQuote('101',stay),/SUPPLIER_QUOTE_BINDING_MISMATCH|SUPPLIER_DRY_RUN_UNVERIFIED/);
 }
});
test('OwnerRez requires provider currency, typed charge amounts and known charge categories',async()=>{
 await assert.rejects(()=>mock({property:{...property,currency_code:'EUR'}}).provider.previewStayQuote('101',stay),/UNSUPPORTED_SUPPLIER_CURRENCY/);
 await assert.rejects(()=>mock({quote:{...quote,charges:[{type:'rent',amount:'1200'}]}}).provider.previewStayQuote('101',stay),/INVALID_QUOTE_AMOUNT/);
 await assert.rejects(()=>mock({quote:{...quote,charges:[{type:'deposit',amount:1200}]}}).provider.previewStayQuote('101',stay),/UNSUPPORTED_QUOTE_CHARGE/);
});
test('provider failures are sanitized and permission errors fail closed',async()=>{
 await assert.rejects(()=>mock({throwRaw:true}).provider.getHomeDetails('101'),e=>e instanceof Error&&e.message==='SUPPLIER_UNAVAILABLE');
 await assert.rejects(()=>mock({status:403}).provider.getHomeDetails('101'),/SUPPLIER_ACCESS_DENIED/);
 await assert.rejects(()=>mock({status:402}).provider.getHomeDetails('101'),/SUPPLIER_LISTING_ACCESS_REQUIRED/);
});
test('unknown provider obligations and expiry cannot become booking approval',async()=>{
 const q=await mock({quote:{...quote,expires_utc:null}}).provider.previewStayQuote('101',stay);
 assert.equal(q.expiry,'UNKNOWN');assert.equal(q.otherObligations,'UNVERIFIED');assert.equal(q.commitmentEligible,false);assert.equal(q.inventoryHeld,false);
});
test('local fixture preview has no product cookies and enforces host/origin/input isolation',async t=>{
 const server=createRentalPreviewServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const address=server.address();assert.ok(address&&typeof address!=='string');const origin='http://127.0.0.1:'+address.port;
 const page=await fetch(origin);assert.equal(page.status,200);assert.equal(page.headers.get('set-cookie'),null);assert.equal(page.headers.get('cache-control'),'no-store');
 const post=(data:unknown,from=origin)=>fetch(origin+'/api/preview',{method:'POST',headers:{origin:from,'content-type':'application/json'},body:JSON.stringify(data)});
 const result=await post({stay,maximumShareCents:37000});assert.equal(result.status,200);const data=await result.json();assert.equal(data.options.length,3);assert.equal(data.maximumSaved,false);assert.equal(data.source,'FICTIONAL');
 assert.equal((await post({stay},'https://other.invalid')).status,400);assert.equal((await post({stay,authorize:true})).status,400);assert.equal((await fetch(origin+'/api/commitments')).status,404);
});
