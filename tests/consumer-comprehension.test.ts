import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductDatabase} from '../src/product/db.js';
import {ProductService} from '../src/product/service.js';
import {OfflineDemoProvider} from '../src/product/ai.js';
// @ts-expect-error Existing browser module
import {createAppViews,comparisonFor} from '../product-public/app-views.js';
// @ts-expect-error Isolated fixture builder
import {designFixtures} from '../scripts/design-fixtures.mjs';
Object.defineProperty(globalThis,'window',{value:{addEventListener(){},matchMedia:()=>({matches:false}),isSecureContext:false},configurable:true});
// @ts-expect-error Existing browser module
const {coordinationStatus,activityPage}=await import('../product-public/agent-ui.js');
const f=await designFixtures();

test('permission presentation distinguishes revoked, paused, stale and not granted without claiming agency',()=>{
 const active={status:'ACTIVE',boundariesCurrent:true,allowAutomaticReplan:true,allowAutomaticBetterOffers:false};
 assert.equal(coordinationStatus(null).label,'Not enabled');
 assert.equal(coordinationStatus(active).label,'Your permission is active');
 assert.equal(coordinationStatus({...active,boundariesCurrent:false}).label,'Fresh permission needed');
 assert.equal(coordinationStatus({...active,status:'PAUSED'}).label,'Coordination paused');
 assert.equal(coordinationStatus({...active,status:'REVOKED'}).label,'Permission revoked');
 assert.equal(coordinationStatus({...active,allowAutomaticReplan:false}).label,'No automatic tasks selected');
 assert.equal(coordinationStatus({...active,status:'UNKNOWN'}).label,'Coordination is off');
});
test('reading an unresolved approval retains its action and labels it Needs you, never approval success',()=>{
 const html=activityPage({items:[{id:'read-request',type:'APPROVAL_REQUIRED',title:'Review approval',body:'Explicit buyer consent required.',actionable:true,resolved_at:null,read_at:'2026-10-12',created_at:'2026-10-12T14:00:00Z',deep_link:'/commit?group=g&proposal=p'},{id:'unread',type:'PLAN_READY',title:'Plan ready',body:'A plan was found.',actionable:false,read_at:null,created_at:'2026-10-12T14:00:00Z',deep_link:'/proposal'}]});
 assert.match(html,/Needs you · Read/);assert.match(html,/href="\/commit\?group=g&amp;proposal=p"/);assert.match(html,/>Mark read<\/button>/);
 assert.doesNotMatch(html,/data-action="commit-authorize"|data-action="finalize|>✓<\/button>/);
});
test('a hold is claimed only after verified authorization, including ambiguous provider states',()=>{
 for(const state of ['NOT_STARTED','ORDER_CREATED','PAYER_APPROVED','NEEDS_VERIFICATION','FAILED','VOIDED']){
  const ledger=structuredClone(f.ledger);ledger.current.state=state;ledger.current.reconciliation=['ORDER_CREATED','PAYER_APPROVED'].includes(state)?'CHECKING':null;
  const html=createAppViews({session:f.session,path:'/commit'}).commitPage(f.group,ledger);
  assert.doesNotMatch(html,/<strong>Held, not charged/);
 }
 const ledger=structuredClone(f.ledger);ledger.current.state='AUTHORIZED';
 assert.match(createAppViews({session:f.session,path:'/commit'}).commitPage(f.approved,ledger),/<strong>Held, not charged/);
});
test('confirmed presentation describes verified payment and makes reservation limits visible before imagery',()=>{
 const view=createAppViews({session:f.session,path:'/waiting'}),html=view.waitingPage(f.completed);
 assert.match(html,/Group payment confirmed/);assert.match(html,/Sandbox payments verified/);
 assert.ok(html.indexOf('No accommodation reservation')<html.indexOf('<figure'));
 assert.doesNotMatch(html,/You’re going to Vermont|weekend is confirmed|is booked/);
 assert.match(view.groupPage(f.completed),/Your group payment is confirmed/);
 const progress=view.waitingPage(f.progressing);assert.match(progress,/Finalizing your purchase/);assert.doesNotMatch(progress,/Group payment confirmed/);
});
test('waiting links only to existing plan details, preserves exact share and explicit incomplete purchase',()=>{
 const html=createAppViews({session:f.session,path:'/waiting'}).waitingPage(f.approved);
 assert.match(html,/Waiting for Alex/);assert.match(html,/\$390/);assert.match(html,/Held, not charged/);assert.match(html,/group is not purchased yet/);
 assert.match(html,/class="waiting-plan-link" href="\/proposal" data-nav/);assert.match(html,/Payment details/);
 assert.doesNotMatch(html,/data-action="review-finalize"|data-action="remind|data-action="commit-create"/);
});
test('comparison review uses genuine feasible alternatives without changing the committed fixture or catalog',async()=>{
 const original=structuredClone(f.group),db=new ProductDatabase(':memory:');
 try{
  const service=new ProductService(db,new OfflineDemoProvider(),'offline-demo'),identity=db.createSession();
  service.create(identity,'Separate comparison fixture','A fictional review group declares its own needs.',true);
  for(const row of db.constraintRows(db.session(identity.id)!.group_id!)){
   const parsed=JSON.parse(row.parsed_json);parsed.hardMax=600;parsed.preferredMax=350;
   db.run('UPDATE constraints SET parsed_json=? WHERE group_id=? AND user_id=?',JSON.stringify(parsed),row.group_id,row.user_id);
  }
  const g=await service.solve(identity),best=comparisonFor(g.proposal,'best'),cost=comparisonFor(g.proposal,'cost'),experience=comparisonFor(g.proposal,'experience');
  assert.equal(best.package.id,'summit-lodge');assert.equal(cost.package.id,'summit-lodge');assert.equal(best.totalCents,145500);
  assert.equal(experience.package.id,'slopeside');assert.equal(experience.totalCents,170000);assert.ok(experience.feasible);
  const html=createAppViews({session:{...service.sessionView(identity),aiMode:'offline-demo'},path:'/proposal',planSegment:'experience'}).proposalPage(g);
  assert.match(html,/Costs \$245 more/);assert.match(html,/\$455/);assert.doesNotMatch(html,/data-action="commit|href="\/commit"/);
  assert.equal(db.all('SELECT * FROM commitments').length,0);assert.deepEqual(f.group,original);
 }finally{db.close();}
});
