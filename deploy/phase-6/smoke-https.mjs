// Read-only hosted smoke plus a new empty demo session. No commercial POSTs.
import assert from 'node:assert/strict';
const origins=[process.env.PUBLIC_CONSUMER_ORIGIN,process.env.PUBLIC_MERCHANT_ORIGIN];for(const value of origins){const u=new URL(value);assert.equal(u.protocol,'https:');assert.equal(u.origin,value);assert.ok(!/localhost|127\.0\.0\.1|\.example$|\.invalid$/.test(u.hostname),'Real public origins required');}assert.notEqual(...origins);
const headers=process.env.COMMIT_SMOKE_USER&&process.env.COMMIT_SMOKE_PASSWORD?{authorization:'Basic '+Buffer.from(process.env.COMMIT_SMOKE_USER+':'+process.env.COMMIT_SMOKE_PASSWORD).toString('base64')}:{};
async function get(origin,path){const r=await fetch(origin+path,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,'Hosted route unavailable: '+path);assert.equal(r.headers.get('cache-control'),'no-store');return r;}
const [consumer,merchant]=origins;for(const path of ['/group','/proposal','/activity','/you','/join'])await get(consumer,path);
const manifest=await (await get(consumer,'/manifest.webmanifest')).json();assert.equal(manifest.start_url,'/group');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');
assert.equal((await get(consumer,'/sw.js')).headers.get('service-worker-allowed'),'/');for(const icon of manifest.icons)await get(consumer,icon.src);
for(const [base,path,name] of [[consumer,'/api/session','commit_demo_phase6'],[merchant,'/api/merchant/session','commit_merchant_phase6']]){const r=await get(base,path),cookie=r.headers.get('set-cookie')??'';assert.ok(cookie.startsWith(name+'='));assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);assert.doesNotMatch(cookie,/Domain=/i);}
await get(merchant,'/merchant/group-demand');
console.log(JSON.stringify({capturedAt:new Date().toISOString(),consumer,merchant,httpsSmoke:'PASS',scope:'/',start:'/group',secureHostOnlyCookies:true,commercialPosts:0,installation:'NOT_VERIFIED',push:'NOT_VERIFIED'}));
