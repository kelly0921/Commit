import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {merchantDemand,merchantSimulationImpact,simulateGroupOffer,type MerchantDemand} from '../src/merchant/demand.js';
import {ProductDatabase} from '../src/product/db.js';
import {ProductService} from '../src/product/service.js';
import {OfflineDemoProvider} from '../src/product/ai.js';
import {MerchantOfferService} from '../src/merchant/offers.js';
import {createMerchantServer} from '../src/merchant/server.js';
import {MerchantImpactResult} from '../src/merchant-ui/impact.js';
import type {SolverResult} from '../src/product/domain.js';

const february=merchantDemand().filter(r=>r.month==='2027-02'&&r.nearConversion).map(r=>r.cohortId);
const scenario={discountPercent:8,minimumGroupSize:4,cohortIds:february};

test('February impact counts only infeasible-to-feasible transitions and aliases GMV exactly as PayPal TPV',()=>{
  const legacy=simulateGroupOffer(scenario),impact=merchantSimulationImpact(scenario);
  assert.equal(legacy.eligibleGroups,12);
  assert.deepEqual([impact.beforeFeasibleGroups,impact.afterFeasibleGroups,impact.newlyFeasibleGroups],[3,12,9]);
  assert.equal(impact.modeledIncrementalGmvCents,1253040);
  assert.equal(impact.modeledIncrementalPaypalTpvCents,1253040);
  assert.equal(impact.merchantDiscountCostCents,108960);
  assert.equal(impact.modeledIncrementalGmvCents,legacy.projectedIncrementalGmvCents);
  assert.match(impact.newlyFeasibleDefinition,/Infeasible before.*feasible after.*deterministic buyer, quality and merchant boundaries/);
  assert.equal(impact.scenarioEstimate,true);
});

test('already feasible groups and zero-discount scenarios contribute no incremental GMV, TPV or cost',()=>{
  const row=merchantDemand().find(r=>r.feasible&&r.stage!=='PURCHASED'&&r.groupSize>=4)!;
  const impact=merchantSimulationImpact({discountPercent:8,cohortIds:[row.cohortId]});
  assert.deepEqual([impact.beforeFeasibleGroups,impact.afterFeasibleGroups,impact.newlyFeasibleGroups],[1,1,0]);
  for(const r of [impact,merchantSimulationImpact({discountPercent:0,minimumGroupSize:4}),merchantSimulationImpact({discountPercent:8,cohortIds:[]})]){
    assert.equal(r.modeledIncrementalGmvCents,0);assert.equal(r.modeledIncrementalPaypalTpvCents,0);assert.equal(r.merchantDiscountCostCents,0);
  }
});

test('quality, configuration, availability and incomplete participation cannot become incremental payment volume',()=>{
  for(const row of merchantDemand().filter(r=>['QUALITY','CONFIGURATION','AVAILABILITY'].includes(r.blocker)||!r.constraintsCollected||r.stage==='PURCHASED')){
    const impact=merchantSimulationImpact({discountPercent:10,cohortIds:[row.cohortId]});
    assert.equal(impact.newlyFeasibleGroups,0,row.cohortId);assert.equal(impact.modeledIncrementalPaypalTpvCents,0,row.cohortId);
  }
  const rejected=merchantSimulationImpact({discountPercent:25,minimumGroupSize:4});
  assert.equal(rejected.beforeFeasibleGroups,10);assert.equal(rejected.afterFeasibleGroups,null);assert.equal(rejected.modeledIncrementalPaypalTpvCents,0);
  for(const extra of [{hardMaxCents:999999},{minimumMarginPercent:0},{publish:true},{participantName:'private'}])assert.throws(()=>merchantSimulationImpact({...scenario,...extra}));
});

test('live aggregate curves count new transitions rather than the net change and never read participant tables',()=>{
  const db=new ProductDatabase(':memory:');
  try{
    const template=merchantDemand().find(r=>r.feasible&&r.groupSize>=4)!;
    const ids=['L-1111111111111111','L-2222222222222222','L-3333333333333333'];
    for(const [i,id] of ids.entries()){
      const row:MerchantDemand={...template,cohortId:id,stage:'INTENT',feasible:i===1,blocker:i===1?'NONE':'PRICE'};
      // Safe projection fixtures: one unlock, one lost to a merchant floor, one still blocked.
      const curve=Array.from({length:11},(_,discountPercent)=>({discountPercent,feasible:discountPercent===0?i===1:i===0,totalCents:discountPercent===0?100000:92000,blockedByMerchantFloor:discountPercent>0&&i===1}));
      db.run('INSERT INTO merchant_demand_projection VALUES(?,?,?,?)',id,JSON.stringify(row),JSON.stringify(curve),new Date().toISOString());
    }
    const all=db.all.bind(db);db.all=((sql:string,...args:any[])=>{assert.doesNotMatch(sql,/\b(constraints|users|group_members|commitments|proposals|payment_events)\b/i);return all(sql,...args);}) as typeof db.all;
    const impact=merchantSimulationImpact({discountPercent:8,cohortIds:ids},db);
    assert.deepEqual([impact.beforeFeasibleGroups,impact.afterFeasibleGroups,impact.newlyFeasibleGroups],[1,1,1]);
    assert.equal(impact.modeledIncrementalPaypalTpvCents,92000);assert.equal(impact.merchantDiscountCostCents,8000);
    assert.doesNotMatch(JSON.stringify(impact),/Kelly|Lawrence|Sarah|Alex|hardMax|preferredMax|statement|requirements|authorizationId|L-1111/);
  }finally{db.close();}
});

test('the presentation projection leaves immutable simulation receipts and offer drafting byte-compatible',()=>{
  const db=new ProductDatabase(':memory:');
  try{
    const offers=new MerchantOfferService(db),saved=offers.simulate('fixture-merchant',scenario);
    const receipt=db.get<{result_json:string}>('SELECT result_json FROM merchant_offer_simulations WHERE id=?',saved.simulationId)!.result_json;
    merchantSimulationImpact(scenario,db);
    assert.equal(receipt,JSON.stringify(simulateGroupOffer(scenario,db)));
    assert.equal(JSON.parse(receipt).impact,undefined);
    const draft=offers.draft('fixture-merchant',{sourceSimulationId:saved.simulationId});
    assert.equal(draft.status,'DRAFT');assert.equal(draft.sourceSimulationId,saved.simulationId);
    assert.deepEqual(draft.impact,{newlyFeasibleGroups:9,incrementalGmvCents:1253040,discountCostCents:108960});
    assert.equal(db.get<{result_json:string}>('SELECT result_json FROM merchant_offer_simulations WHERE id=?',saved.simulationId)!.result_json,receipt);
    assert.equal(db.all("SELECT id FROM merchant_offer_versions WHERE status='PUBLISHED'").length,0);
  }finally{db.close();}
});

test('existing offer/application/proposal links identify the exact intervention behind a newly feasible plan',async()=>{
  const db=new ProductDatabase(':memory:');
  try{
    const service=new ProductService(db,new OfflineDemoProvider(),'offline-demo'),session=db.createSession(),offers=new MerchantOfferService(db);
    service.create(session,'Attribution fixture','Four fictional friends plan a February weekend.',true);service.offers.seed(session);
    const fresh=db.session(session.id)!,own=db.constraintRows(fresh.group_id!).find(r=>r.user_id==='kelly')!,parsed=JSON.parse(own.parsed_json);
    parsed.hardMax=370;parsed.preferredMax=null;
    db.run('UPDATE constraints SET parsed_json=? WHERE group_id=? AND user_id=?',JSON.stringify(parsed),fresh.group_id!,'kelly');
    await service.solve(session);const previous=service.group(session).proposal!;assert.equal(previous.feasible,false);
    const simulation=offers.simulate('fixture-merchant',scenario),draft=offers.draft('fixture-merchant',{sourceSimulationId:simulation.simulationId});
    // Fixture-only prepublished terms. No publication API, worker or provider is invoked.
    db.run("UPDATE merchant_offer_versions SET status='PUBLISHED',published_at=? WHERE id=?",new Date().toISOString(),draft.id);
    const next=await service.offers.apply(session,{offerId:draft.id,previousProposalId:previous.id,confirmNewProposal:true});
    const linked=db.get<{source_simulation_id:string;version:number;previous_proposal_id:string;proposal_id:string;offer_snapshot_json:string}>(
      'SELECT o.source_simulation_id,o.version,a.previous_proposal_id,a.proposal_id,a.offer_snapshot_json FROM offer_applications a JOIN merchant_offer_versions o ON o.id=a.offer_id WHERE a.proposal_id=?',next.proposalId)!;
    assert.equal(linked.source_simulation_id,simulation.simulationId);assert.equal(linked.version,draft.version);assert.equal(linked.previous_proposal_id,previous.id);
    const before=JSON.parse(db.get<{result_json:string}>('SELECT result_json FROM proposals WHERE id=?',previous.id)!.result_json) as SolverResult;
    const after=JSON.parse(db.get<{result_json:string}>('SELECT result_json FROM proposals WHERE id=?',next.proposalId)!.result_json) as SolverResult;
    assert.equal(before.feasible,false);assert.equal(after.feasible,true);assert.equal(after.selected!.totalCents,139380);
    const binding=after.catalogSnapshot.find(p=>p.id===after.selected!.packageId)!.offer!;
    assert.equal(binding.id,draft.id);assert.equal(binding.version,linked.version);assert.deepEqual(JSON.parse(linked.offer_snapshot_json),binding);
    assert.equal(service.group(session).committedCount,0);assert.equal(db.all('SELECT id FROM payment_events').length,0);
  }finally{db.close();}
});

test('merchant result displays all six metrics and the conditional chain without revenue or profitability estimates',()=>{
  const result={...simulateGroupOffer(scenario),impact:merchantSimulationImpact(scenario)};
  const html=renderToStaticMarkup(React.createElement(MerchantImpactResult,{result}));
  for(const label of ['Before: feasible groups','After: feasible groups','Newly feasible groups','Modeled incremental GMV','Merchant discount cost','Modeled incremental PayPal TPV','Scenario estimate'])assert.ok(html.includes(label),label);
  const steps=['Blocked demand','Merchant offer','Newly feasible groups','Group replans','Fresh consumer approvals','Potential PayPal checkout volume'];
  const chain=html.slice(html.indexOf('<ol'));
  assert.ok(steps.every((s,i)=>i===0||chain.indexOf(s)>chain.indexOf(steps[i-1]!)));
  assert.ok(html.includes('$12,530.40'));assert.ok(html.includes('$1,089.60'));
  assert.doesNotMatch(html,/Merchant revenue|resultingMerchantRevenue|Kelly|hardMax|authorizationId/);
  const rejected={...simulateGroupOffer({discountPercent:25}),impact:merchantSimulationImpact({discountPercent:25})};
  const rejectedHtml=renderToStaticMarkup(React.createElement(MerchantImpactResult,{result:rejected}));
  assert.match(rejectedHtml,/Outside your merchant boundaries/);assert.doesNotMatch(rejectedHtml,/Potential intervention chain/);
});

test('HTTP impact is session-isolated, cohort-aggregate and does not alter the saved commercial result',async()=>{
  const db=new ProductDatabase(':memory:'),server=createMerchantServer({offers:new MerchantOfferService(db)});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{
    assert.equal((await fetch(base+'/api/merchant/demand')).status,401);
    const session=await fetch(base+'/api/merchant/session'),cookie=session.headers.get('set-cookie')!.split(';')[0]!,s=await session.json() as {csrf:string};
    const headers={cookie,origin:base,'content-type':'application/json','x-csrf-token':s.csrf};
    const res=await fetch(base+'/api/merchant/simulate',{method:'POST',headers,body:JSON.stringify(scenario)});
    assert.equal(res.status,200);const result=await res.json() as {impact:ReturnType<typeof merchantSimulationImpact>;simulationId:string;message:string};
    assert.deepEqual(result.impact,merchantSimulationImpact(scenario,db));assert.equal(result.message,result.impact.message);
    const receipt=db.get<{result_json:string}>('SELECT result_json FROM merchant_offer_simulations WHERE id=?',result.simulationId)!.result_json;
    assert.equal(receipt,JSON.stringify(simulateGroupOffer(scenario,db)));
    assert.doesNotMatch(JSON.stringify(result),/Kelly|Lawrence|Sarah|Alex|hardMax|preferredMax|statement|requirements|paypal_order_id|paypal_authorization_id/);
    assert.equal((await fetch(base+'/api/merchant/simulate',{method:'POST',headers:{...headers,cookie:'commit_consumer=fake'},body:JSON.stringify(scenario)})).status,401);
    assert.equal(db.all("SELECT id FROM merchant_offer_versions WHERE status='PUBLISHED'").length,0);assert.equal(db.all('SELECT id FROM payment_events').length,0);
  }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}
});
