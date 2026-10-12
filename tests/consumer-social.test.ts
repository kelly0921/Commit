import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser presentation module
import {createAppViews} from '../product-public/app-views.js';
// @ts-expect-error Isolated fixture builder
import {designFixtures} from '../scripts/design-fixtures.mjs';
Object.defineProperty(globalThis,'window',{value:{addEventListener(){},matchMedia:()=>({matches:false}),isSecureContext:false},configurable:true});
// @ts-expect-error Browser presentation module
const {matchesActivityFilter,activityPage,createActivityFilters}=await import('../product-public/agent-ui.js');
const f=await designFixtures();

test('Activity Needs you includes unresolved requests even after reading; resolved requests move to updates',()=>{
 for(const read_at of [null,'2026-10-11'])assert.equal(matchesActivityFilter({actionable:true,resolved_at:null,read_at},'needs-you'),true);
 assert.equal(matchesActivityFilter({actionable:true,resolved_at:'2026-10-11'},'needs-you'),false);
 assert.equal(matchesActivityFilter({actionable:true,resolved_at:'2026-10-11'},'updates'),true);
 assert.equal(matchesActivityFilter({actionable:false,resolved_at:null},'updates'),true);
 assert.equal(matchesActivityFilter({actionable:true,resolved_at:null},'updates'),false);
 assert.equal(matchesActivityFilter({actionable:true},'all'),true);
});
test('Activity exposes current request counts without dropping exact bodies, targets or unread controls',()=>{
 const items=[{id:'a',type:'TERMS_CHANGED',title:'Changed terms',body:'Fresh approval is required even for a lower amount.',actionable:true,resolved_at:null,read_at:'2026-10-11',deep_link:'/proposal?group=g&proposal=p',created_at:'2026-10-11T14:00:00Z'},{id:'b',type:'UNKNOWN',title:'Other update',body:'Informational detail',actionable:false,resolved_at:null,read_at:null,deep_link:'/group',created_at:'2026-10-11T14:00:00Z'}];
 const html=activityPage({items});assert.match(html,/Needs you <span>1/);assert.match(html,/Updates <span>1/);
 assert.match(html,/Fresh approval is required even for a lower amount/);assert.match(html,/href="\/commit\?group=g&amp;proposal=p"/);
 assert.match(html,/data-action="activity-read" data-id="b"/);assert.match(html,/Informational detail/);
});
test('participant peeks whitelist already shared status and share; they introduce no consent or payment capability',()=>{
 const group=structuredClone(f.approved);group.members[3].privateReason='NEVER_DISCLOSE_PRIVATE_SENTINEL';group.members[3].privateBudget=523;
 const html=createAppViews({session:f.session,path:'/group'}).groupPage(group);
 const sheet=html.slice(html.indexOf('<dialog id="person-alex"'),html.indexOf('</dialog>',html.indexOf('<dialog id="person-alex"'))+9);
 assert.match(sheet,/Alex’s part/);assert.match(sheet,/Waiting/);assert.match(sheet,/\$335/);
 assert.match(sheet,/data-contributed="false"/);assert.doesNotMatch(sheet,/NEVER_DISCLOSE_PRIVATE_SENTINEL|privateBudget|\$523|data-action|<form/);
 assert.doesNotMatch(html,/NEVER_DISCLOSE_PRIVATE_SENTINEL|privateBudget/);
 assert.match(html,/aria-label="View Alex’s shared status"/);assert.match(html,/Your share · held, not charged/);
});
test('stale and ambiguous participants never receive a contributed treatment or financial success from a peek',()=>{
 for(const state of ['STALE','PAYER_APPROVED','NEEDS_VERIFICATION']){const g=structuredClone(f.approved);g.members[3].commitmentStatus=state;const html=createAppViews({session:f.session,path:'/group'}).groupPage(g);const sheet=html.slice(html.indexOf('<dialog id="person-alex"'),html.indexOf('</dialog>',html.indexOf('<dialog id="person-alex"'))+9);assert.match(sheet,/data-contributed="false"/);assert.doesNotMatch(sheet,/✓ Committed|data-action="commit|data-action="review-finalize"/);}
});

test('local filters survive a same-owner update, reset across owner scopes, and handle an emptied feed',()=>{
 let items=[{dataset:{eventAction:'true',eventRead:'false'},hidden:false},{dataset:{eventAction:'false',eventRead:'true'},hidden:false}];
 const buttons=['all','needs-you','updates'].map(value=>({dataset:{activityFilter:value},pressed:'false',setAttribute(_key:string,value:string){this.pressed=value;}}));
 const empty={hidden:true},status={textContent:''};let click:(event:any)=>void=()=>{};
 const feed={querySelectorAll(selector:string){return selector==='[data-event-id]'?items:[];},querySelector(){return empty;}};
 const root={querySelector(selector:string){return selector==='[data-activity-feed]'?feed:selector==='[data-filter-status]'?status:null;},querySelectorAll(){return buttons;},addEventListener(_name:string,listener:(event:any)=>void){click=listener;}};
 const filters=createActivityFilters(root);filters.apply('group/kelly');click({target:{closest(){return buttons[1];}}});
 assert.equal(items[1]!.hidden,true);assert.equal(buttons[1]!.pressed,'true');assert.equal(items[0]!.dataset.eventRead,'false');
 filters.apply('group/kelly');assert.equal(buttons[1]!.pressed,'true');
 filters.apply('group/sarah');assert.equal(buttons[0]!.pressed,'true');assert.ok(items.every(x=>!x.hidden));
 click({target:{closest(){return buttons[1];}}});items=[];filters.apply('group/sarah');assert.equal(buttons[0]!.pressed,'true');assert.equal(empty.hidden,true);
});
