import test from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import {ProductDatabase} from '../src/product/db.js';
import {ProductService} from '../src/product/service.js';
import {OfflineDemoProvider} from '../src/product/ai.js';
import {createProductServer} from '../src/product/server.js';
import {needsPriceGuide} from '../src/product/needs-guide.js';
import {PACKAGES} from '../src/product/seed.js';
import {discountedCatalog} from '../src/product/catalog.js';
import {PERSONAS,type ParsedConstraint} from '../src/product/domain.js';
import {AuthorityService} from '../src/product/authority.js';
// @ts-expect-error Browser presentation module
import {budgetStatement,createAppViews} from '../product-public/app-views.js';

const empty:ParsedConstraint={hardMax:null,preferredMax:null,requirements:[],preferences:[],clarifications:[],confidence:1};
const ids=['kelly','lawrence','sarah','alex'];
function setup(){const db=new ProductDatabase(':memory:'),service=new ProductService(db,new OfflineDemoProvider(),'offline-demo'),session=db.createSession();service.create(session,'Private needs test','Find a ski weekend for four friends.',true);return {db,service,session};}
function snapshot(db:ProductDatabase){return Object.fromEntries(db.all<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(t=>[t.name,db.all(`SELECT * FROM ${t.name} ORDER BY rowid`)]));}

test('price exploration needs no ceiling, consent or AI and retains deterministic quality floors',()=>{
 const guide=needsPriceGuide(PACKAGES,ids,'kelly',empty,1);
 assert.equal(guide.minShareCents,33500);assert.equal(guide.maxShareCents,39000);
 assert.deepEqual(guide.options.map(o=>o.id),['summit-lodge','pine-retreat','slopeside']);
 assert.equal(guide.groupFeasibilityVerified,false);assert.doesNotMatch(JSON.stringify(guide),/hardMax|preferredMax|recommended|scores|allocations|merchantBoundaries/);
});
test('own required extras use the existing cent allocation without pricing another participant’s needs',()=>{
 const needs={...empty,requirements:[{key:'rentalsRequired',value:true,visibility:'PRIVATE' as const}]};
 const g=needsPriceGuide(PACKAGES,ids,'kelly',needs,1);
 assert.equal(g.minShareCents,39000);assert.equal(g.maxShareCents,45500);assert.equal(g.rentalsIncluded,true);
 assert.equal(g.options.find(o=>o.id==='summit-lodge')!.components.rentalCents,5500);
});
test('explicit own ceilings and cancellation floors constrain exploration without inventing consent',()=>{
 const g=needsPriceGuide(PACKAGES,ids,'kelly',{...empty,hardMax:400,requirements:[{key:'rentalsRequired',value:true,visibility:'PRIVATE'},{key:'flexibleCancellationRequired',value:true,visibility:'PRIVATE'}]},1);
 assert.deepEqual(g.options.map(o=>o.id),['summit-lodge']);
 assert.equal(needsPriceGuide(PACKAGES,ids,'kelly',{...empty,hardMax:10},1).options.length,0);
});
test('merchant minimum price, margin, inventory and discount cannot be bypassed for price guidance',()=>{
 for(const mutate of [(p:any)=>p.merchantBoundaries.minimumTotalCents=9999999,(p:any)=>p.merchantBoundaries.minimumMarginBps=10000,(p:any)=>p.merchantBoundaries.availableInventory=0,(p:any)=>p.merchantBoundaries.listSharedBaseCostCents=9999999]){
  const p=structuredClone(PACKAGES[1]!);mutate(p);assert.equal(needsPriceGuide([p],ids,'kelly',empty,1).options.length,0);
 }
});
test('offer-adjusted price context uses catalog cents without modifying original merchant prices',()=>{
 const original=structuredClone(PACKAGES),catalog=discountedCatalog(PACKAGES,{id:'guide-test',version:1,merchantId:'summit-weekend',discountPercent:8,minimumGroupSize:4,eligiblePackageIds:['summit-lodge'],eligibleStartDate:'2026-12-01',eligibleEndDate:'2026-12-31',validFrom:'2026-10-01',validUntil:'2026-11-01',maxRedemptions:20});
 assert.equal(needsPriceGuide(catalog,ids,'kelly',empty,1).options[0]!.minShareCents,30820);assert.deepEqual(PACKAGES,original);
});
test('incomplete group quotes disclose four-person assumption and bound cent rounding',()=>{
 const p=structuredClone(PACKAGES[1]!);p.sharedBaseCostCents+=1;
 const guide=needsPriceGuide([p],['kelly'],'kelly',empty,1);assert.equal(guide.groupSize,4);assert.equal(guide.joinedCount,1);
 assert.equal(guide.options[0]!.minShareCents,33500);assert.equal(guide.options[0]!.maxShareCents,33501);
 assert.equal(needsPriceGuide([p],['kelly'],'kelly',{...empty,hardMax:335},1).options.length,0);
});
test('participant price guide is read-only and invariant to other private ceilings and requirements',()=>{
 const f=setup();try{
  const before=snapshot(f.db),g=f.service.priceGuide(f.session);assert.deepEqual(snapshot(f.db),before);
  const own=f.service.ownConstraint(f.session);f.db.run('UPDATE constraints SET parsed_json=? WHERE group_id=? AND user_id=?',JSON.stringify({...empty,hardMax:12,requirements:[{key:'ownBed',value:true,visibility:'PRIVATE'}]}),f.db.session(f.session.id)!.group_id,'sarah');
  assert.deepEqual(f.service.priceGuide(f.session),g);assert.deepEqual(f.service.ownConstraint(f.session),own);
 }finally{f.db.close();}
});
test('fresh hosted-style groups use their February catalog rather than global seed dates',()=>{
 const f=setup();try{new AuthorityService(f.db).createFresh(f.session,'Fresh guide group','Four friends find a February ski weekend.','Casey');const guide=f.service.priceGuide(f.session);assert.equal(guide.joinedCount,1);assert.ok(guide.options.length);assert.ok(guide.options.every(o=>o.startDate==='2027-02-12'&&o.endDate==='2027-02-14'));}finally{f.db.close();}
});
test('private draft price context rejects foreign, expired and revised drafts',async()=>{
 const f=setup();try{
  const draft=await f.service.interpret(f.session,'I need rentals.');assert.ok(f.service.priceGuide(f.session,draft.draftId).rentalsIncluded);
  const other=f.db.createSession();f.db.run('UPDATE demo_sessions SET group_id=?,persona=? WHERE id=?',f.db.session(f.session.id)!.group_id,'lawrence',other.id);
  assert.throws(()=>f.service.priceGuide(other,draft.draftId),/DRAFT_NOT_FOUND/);
  f.db.run('UPDATE purchase_goals SET revision=revision+1');assert.throws(()=>f.service.priceGuide(f.session,draft.draftId),/PLAN_CHANGED/);
  f.db.run("UPDATE constraint_drafts SET created_at='2000-01-01'");assert.throws(()=>f.service.priceGuide(f.session,draft.draftId),/DRAFT_EXPIRED/);
 }finally{f.db.close();}
});
test('guided clarification preserves unconfirmed state until the existing explicit confirmation',async()=>{
 const f=setup();try{
  const own=f.service.ownConstraint(f.session),first=await f.service.interpret(f.session,'I need rentals.');assert.equal(first.parsed.hardMax,null);
  assert.deepEqual(f.service.ownConstraint(f.session),own);assert.throws(()=>f.service.confirm(f.session,first.draftId,{...first.parsed,hardMax:450,clarifications:[]}),/CLARIFY/);
  const statement=budgetStatement('I need rentals.','450','400'),review=await f.service.interpret(f.session,statement);
  assert.equal(review.parsed.hardMax,450);assert.equal(review.parsed.preferredMax,400);assert.deepEqual(review.parsed.clarifications,[]);assert.deepEqual(f.service.ownConstraint(f.session),own);
  assert.equal(f.db.all('SELECT * FROM commitments').length,0);const confirmed=f.service.confirm(f.session,review.draftId,review.parsed);
  assert.equal(confirmed.parsed.hardMax,450);assert.equal(confirmed.confirmed,true);assert.equal(f.db.all('SELECT * FROM commitments').length,0);
 }finally{f.db.close();}
});
test('budget entry rejects empty, fractional-cent and preferred-above-ceiling input without AI guesses',()=>{
 for(const [max,pref] of [['',''],['400.001',''],['400','450'],['NaN',''],['-1',''],['100001','']])assert.throws(()=>budgetStatement('',max,pref));
 assert.match(budgetStatement('','0',''),/hard maximum is \$0.00/);assert.doesNotMatch(budgetStatement('','450',''),/I would prefer \$/);
});
test('budget-free description has context, optional prompts, no default ceiling and separate payment approval',()=>{
 const guide=needsPriceGuide(PACKAGES,ids,'kelly',empty,1),session={hasGroup:true,persona:'kelly',personas:PERSONAS,aiMode:'openai'},own={statement:'',parsed:empty,confirmed:false};
 const initial=createAppViews({session,path:'/constraints'}).constraintsPage(own,guide);assert.match(initial,/Let’s find your fit/);assert.match(initial,/Private to you/);assert.match(initial,/Not sure — show me prices first/);
 assert.doesNotMatch(initial,/name="hardMax"|value="450"|data-action="commit-create"/);
 const budget=createAppViews({session,path:'/constraints',needsMode:'budget'}).constraintsPage(own,guide);
 assert.match(budget,/Maximum spend · USD/);assert.match(budget,/name="hardMax"[^>]+required[^>]+placeholder/);assert.doesNotMatch(budget,/name="hardMax"[^>]+value=/);
 assert.match(budget,/not a confirmed group fit/);assert.match(budget,/does not approve a payment/);
});
test('complete requests skip extra questions and unresolved needs remain blocked',()=>{
 const session={persona:'kelly',personas:PERSONAS,aiMode:'openai'},draft={draftId:'review',parsed:{...empty,hardMax:450,preferredMax:400}},own={statement:'',parsed:empty};
 const complete=createAppViews({session,draft}).constraintsPage(own);assert.match(complete,/Here’s what I understood/);assert.doesNotMatch(complete,/needs-budget-form/);
 const unresolved=createAppViews({session,draft:{...draft,parsed:{...draft.parsed,clarifications:['Please clarify your transport requirement.']}}}).constraintsPage(own);
 assert.match(unresolved,/type="submit" disabled/);assert.match(unresolved,/Edit your words before confirming/);
});
test('failed interpretation review preserves the person’s typed amounts without adopting catalog prices',()=>{
 const session={persona:'kelly',personas:PERSONAS,aiMode:'openai'},own={statement:'',parsed:empty};
 const html=createAppViews({session,needsMode:'budget',needsAmounts:{maximum:'450.01',preferred:'400.02'},statementInput:'I need rentals.'}).constraintsPage(own);
 assert.match(html,/name="hardMax"[^>]+value="450.01"/);assert.match(html,/name="preferredMax"[^>]+value="400.02"/);assert.match(html,/I need rentals\./);
 assert.doesNotMatch(html,/confirm-form|commit-create/);
});
test('HTTP price guide requires participant session, is uncached and performs no mutation',async()=>{
 const f=setup(),server=createProductServer(f.service);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{const origin='http://127.0.0.1:'+(server.address() as AddressInfo).port;
  assert.equal((await fetch(origin+'/api/constraints/price-guide')).status,401);
  const before=snapshot(f.db),response=await fetch(origin+'/api/constraints/price-guide',{headers:{cookie:'commit_demo='+f.session.id}});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json() as any).kind,'PRICE_GUIDE');assert.deepEqual(snapshot(f.db),before);
  f.service.switchPersona(f.session,'merchant');assert.equal((await fetch(origin+'/api/constraints/price-guide',{headers:{cookie:'commit_demo='+f.session.id}})).status,403);
 }finally{await new Promise<void>(r=>server.close(()=>r()));f.db.close();}
});
