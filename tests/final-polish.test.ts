import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser presentation only
import {canRetainView,loadingPage,createAppViews} from '../product-public/app-views.js';
// @ts-expect-error Fictional, in-memory projections only
import {designFixtures} from '../scripts/design-fixtures.mjs';

test('refresh retention never crosses participant, group or route boundaries',()=>{
 const current={scope:'group-one/kelly',path:'/group'};
 assert.equal(canRetainView(current,{...current}),true);
 for(const next of [{scope:'group-one/sarah',path:'/group'},{scope:'group-two/kelly',path:'/group'},{scope:'group-one/kelly',path:'/you'}])assert.equal(canRetainView(current,next),false);
 assert.equal(canRetainView(null,current),false);
 assert.equal(canRetainView({scope:current.scope,path:'/commit?proposal=old'},{scope:current.scope,path:'/commit?proposal=new'}),false);
});
test('contextual loading presents no financial result or synthetic participant completion',async()=>{
 const f=await designFixtures();
 const loading=loadingPage({knownGroup:f.group.name});
 assert.match(loading,/aria-busy="true"/);assert.match(loading,/Updating your group/);assert.match(loading,/aria-hidden="true"/);
 assert.doesNotMatch(loading,/\$390|AUTHORIZED|Confirmed|data-action=|data-commitment=|of 4 committed|Finalize/);
 const shell=createAppViews({session:f.session,path:'/group'}).shell(loading);
 assert.match(shell,/aria-label="Main navigation"/);assert.match(shell,/Vermont Ski Weekend/);
});
test('loading group titles are escaped without creating an action or displaying private needs',()=>{
 const html=loadingPage({knownGroup:'Friends <script>alert(1)</script>'});
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|data-action=/);
});
test('waiting and checking remain non-success states after the presentation polish',async()=>{
 const f=await designFixtures(),views=createAppViews({session:f.session,path:'/commit'}),ledger=structuredClone(f.ledger);
 ledger.current.state='ORDER_CREATED';ledger.current.reconciliation='CHECKING';
 const pending=views.commitPage(f.group,ledger);
 assert.match(pending,/data-provider-approved="false"/);assert.match(pending,/Approval not confirmed/);assert.doesNotMatch(pending,/<strong>Held, not charged/);
 const waiting=createAppViews({session:f.session,path:'/waiting'}).waitingPage(f.approved);
 assert.match(waiting,/Waiting for Alex/);assert.doesNotMatch(waiting,/data-action="review-finalize"/);
});
