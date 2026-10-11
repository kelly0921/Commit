import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// @ts-expect-error Browser presentation module
import {interactionDelta,motionTokens,createAppViews,createInteraction} from '../product-public/app-views.js';
// @ts-expect-error Offline presentation fixture only
import {designFixtures} from '../scripts/design-fixtures.mjs';
const snapshot=(overrides:Record<string,unknown>={})=>({scope:'fictional/kelly',path:'/waiting',proposal:'same-terms',people:[{id:'kelly',state:'AUTHORIZED'},{id:'alex',state:'NOT_STARTED'}],links:[],events:[],outcomes:[],prices:['$1,515','$390'],ready:false,approval:'checking',approvalKey:'approved-order',sagaKey:'existing-saga',purchase:'CAPTURING',segment:'best',...overrides});
test('participant/path resolution happens only on changed rendered state within the same scope and exact proposal',()=>{
 const before=snapshot(),after=snapshot({people:[{id:'kelly',state:'AUTHORIZED'},{id:'alex',state:'AUTHORIZED'}],ready:true});
 assert.deepEqual(interactionDelta(before,after).people,['alex']);assert.deepEqual(interactionDelta(before,after).links,['kelly']);assert.equal(interactionDelta(before,after).ready,true);
 assert.deepEqual(interactionDelta(after,after).people,[]);assert.equal(interactionDelta(after,after).ready,false);
 for(const changed of [{scope:'fictional/alex'},{proposal:'changed-terms'}]){const delta=interactionDelta(before,{...after,...changed});assert.deepEqual(delta.people,[]);assert.equal(delta.ready,false);}
 assert.deepEqual(interactionDelta(null,after).people,[]);
});
test('checking cannot signal verified completion from a return, ambiguous or stale state, or substituted commitment',()=>{
 const before=snapshot(),after=snapshot({approval:'verified'});assert.equal(interactionDelta(before,after).verified,true);
 for(const changed of [{approval:'checking'},{approval:'unconfirmed'},{approvalKey:'another-order'},{proposal:'changed-terms'},{scope:'other/kelly'}])assert.equal(interactionDelta(before,{...after,...changed}).verified,false);
 assert.equal(interactionDelta(after,after).verified,false);
 const stale=snapshot({people:[{id:'kelly',state:'AUTHORIZED'},{id:'alex',state:'STALE'}]});assert.deepEqual(interactionDelta(stale,snapshot({people:[{id:'kelly',state:'AUTHORIZED'},{id:'alex',state:'AUTHORIZED'}]})).people,[]);
});
test('plan switching moves selection but never animates identical money',()=>{
 const before=snapshot({path:'/proposal'}),same=snapshot({path:'/proposal',segment:'experience'});assert.equal(interactionDelta(before,same).plan,true);assert.deepEqual(interactionDelta(before,same).prices,[]);
 assert.deepEqual(interactionDelta(before,{...same,prices:['$1,320','$365']}).prices,[0,1]);assert.equal(interactionDelta(before,before).plan,false);
});
test('Activity differentiates new event identities from inline read/resolution updates and unchanged polls',()=>{
 const before=snapshot({path:'/activity',events:[{id:'a',read:'false',resolved:'false'}]}),after={...before,events:[{id:'b',read:'false',resolved:'false'},{id:'a',read:'true',resolved:'false'}]};
 assert.deepEqual(interactionDelta(before,after).events,[{id:'b',inserted:true},{id:'a',inserted:false}]);assert.deepEqual(interactionDelta(after,after).events,[]);assert.deepEqual(interactionDelta(null,after).events,[]);
});
test('sequential settlement animates changed individual outcomes and only existing verified CONFIRMED arrival',()=>{
 const before=snapshot({outcomes:[{id:'sarah',state:'Processing…'},{id:'alex',state:'Waiting'}]}),after={...before,outcomes:[{id:'sarah',state:'✓ Confirmed'},{id:'alex',state:'Processing…'}]};
 assert.deepEqual(interactionDelta(before,after).outcomes,['sarah','alex']);assert.equal(interactionDelta(before,after).confirmed,false);assert.equal(interactionDelta(before,{...after,purchase:'CONFIRMED'}).confirmed,true);
 assert.equal(interactionDelta(before,{...after,purchase:'CONFIRMED',sagaKey:'substituted'}).confirmed,false);
});
test('presentation exposes provider receipt only from PAYER_APPROVED and success only from the existing double-authorized condition',async()=>{
 const f=await designFixtures(),views=createAppViews({session:f.session,path:'/commit'}),ledger=structuredClone(f.ledger);
 ledger.current.state='ORDER_CREATED';ledger.current.reconciliation='CHECKING';assert.match(views.commitPage(f.group,ledger),/data-provider-approved="false"/);assert.match(views.commitPage(f.group,ledger),/data-approval-state="checking"/);
 ledger.current.state='PAYER_APPROVED';assert.match(views.commitPage(f.group,ledger),/data-provider-approved="true"/);
 ledger.current.state='AUTHORIZED';ledger.current.reconciliation=null;assert.match(views.commitPage(f.group,ledger),/data-approval-state="unconfirmed"/);
 assert.match(views.commitPage(f.approved,ledger),/data-approval-state="verified"/);
});
test('motion is local presentation only, bounded in duration and explicitly reduced-motion aware',()=>{
 assert.deepEqual([motionTokens.fast,motionTokens.standard,motionTokens.meaningful],[140,220,400]);
 const source=readFileSync('product-public/app-views.js','utf8').split('// Motion observes already-rendered projections.')[1]!.split('export function createAppViews')[0]!;
 assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|sessionStorage|navigator\.vibrate|setInterval|\/api\//);assert.match(source,/prefers-reduced-motion/);assert.match(source,/animation\.cancel\(\)/);
});
test('reduced motion renders a real participant/readiness update instantly with no motion effects',()=>{
 const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{matchMedia:()=>({matches:true,addEventListener(){}}),scrollY:0,innerHeight:844}});
 let ready=false,attempts=0;
 const node=(id:string,state:string)=>({dataset:{person:id,commitment:state},closest:()=>null,querySelector:()=>({animate(){attempts++;throw Error('Reduced motion must not animate');}})});
 let people=[node('kelly','AUTHORIZED'),node('alex','NOT_STARTED')];
 const root={addEventListener(){},querySelector(selector:string){if(selector==='[data-motion-proposal]')return {dataset:{motionProposal:'same-terms'}};if(selector==='.signature-waiting')return {dataset:{ready:String(ready)}};return null;},querySelectorAll(selector:string){return ['main .avatars [data-person]','.avatar-progress'].includes(selector)?people:[];}};
 try{const renderer=createInteraction(root),context={scope:'fictional/kelly',path:'/waiting'};renderer.commit(renderer.prepare(context),context);const ticket=renderer.prepare(context);ready=true;people=[node('kelly','AUTHORIZED'),node('alex','AUTHORIZED')];renderer.commit(ticket,context);assert.equal(attempts,0);assert.equal(people[1]!.dataset.commitment,'AUTHORIZED');}
 finally{if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');}
});
