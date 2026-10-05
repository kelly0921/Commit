import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, validateParsed, cents, type Constraint } from '../src/product/domain.js';
import { PACKAGES, SEED_CONSTRAINTS } from '../src/product/seed.js';
import { solve, splitShared, publicFacts, renderExplanation } from '../src/product/solver.js';
const members=()=>Object.entries(SEED_CONSTRAINTS).map(([id,p])=>normalize(p,id,id,true));
test('six packages are checked, all hard checks pass for selected exact allocations',()=>{
  const result=solve(PACKAGES,members());assert.equal(result.evaluations.length,6);assert.equal(result.selected?.packageId,'summit-lodge');assert.equal(result.selected?.totalCents,145500);
  assert.deepEqual(Object.fromEntries(result.selected!.allocations.map(a=>[a.userId,a.shareCents])),{kelly:39000,lawrence:33500,sarah:39500,alex:33500});
  for(const e of result.evaluations) assert.equal(e.feasible,e.checks.every(c=>c.passed));
  assert.equal(result.evaluations.find(e=>e.packageId==='trail-cabin')!.checks.find(c=>c.key==='beds')!.passed,false);
  assert.equal(result.evaluations.find(e=>e.packageId==='slopeside')!.feasible,false);
  assert.equal(result.evaluations.find(e=>e.packageId==='north-peak')!.feasible,false);
  assert.equal(result.evaluations.find(e=>e.packageId==='cozy-loft')!.feasible,false);
});
test('ceilings, missing confirmation, unknown requirements, and distance are hard gates',()=>{
  for(const mutate of [(m:Constraint)=>m.hardMaxCents=0,(m:Constraint)=>m.hardMaxCents=null,(m:Constraint)=>m.confirmed=false,(m:Constraint)=>m.requirements.push({key:'unrecognized',value:true,visibility:'PRIVATE'}),(m:Constraint)=>m.requirements.push({key:'maxDistanceMinutes',value:1,visibility:'PRIVATE'})]){
    const m=members();mutate(m[0]!);assert.equal(solve(PACKAGES,m).feasible,false);
  }
});
test('remainder is stable by member ID and every cent is conserved',()=>{
  assert.deepEqual([...splitShared(1001,['c','a','b'])],[['a',334],['b',334],['c',333]]);
  const pkg={...PACKAGES[1]!,sharedBaseCostCents:96001,parkingIncluded:false,parkingFeeCents:37};const result=solve([pkg],members());
  assert.equal(result.selected!.totalCents,145538);assert.equal(result.selected!.allocations.reduce((n,a)=>n+a.shareCents,0),145538);
  assert.throws(()=>splitShared(5,['a','a']));assert.throws(()=>cents(4.005));
});
test('preference fit contributes to bounded value; stable package ID resolves equal value and price',()=>{
  const m=members();m[0]!.preferences.push({key:'distanceMinutes',value:5,weight:5,visibility:'PRIVATE'});
  assert.equal(solve(PACKAGES,m).selected?.packageId,'summit-lodge');
  const cheap={...PACKAGES[1]!,id:'z',sharedBaseCostCents:96000,distanceMinutes:100};const close={...cheap,id:'a',sharedBaseCostCents:96400,distanceMinutes:5};
  assert.equal(solve([cheap,close],m).selected?.packageId,'a');assert.equal(solve([{...close,id:'z'},close],members()).selected?.packageId,'a');
});
test('unsupported, conflicting, malformed, fractional, and extra AI data is rejected',()=>{
  const base=SEED_CONSTRAINTS.kelly!;for(const changed of [{extra:1},{hardMax:-2},{hardMax:2.003},{hardMax:Infinity},{preferredMax:500},{requirements:[{key:'ownBed',value:'yes',visibility:'PRIVATE'}]},{requirements:[{key:'petFriendly',value:true,visibility:'PRIVATE'}]},{requirements:[{key:'ownBed',value:true,visibility:'PRIVATE'},{key:'ownBed',value:false,visibility:'PRIVATE'}]}]) assert.throws(()=>validateParsed({...base,...changed}));
  assert.equal(validateParsed({...base,requirements:[{key:'ownBed',value:true,visibility:'PUBLIC'}]},true).requirements[0]!.visibility,'PRIVATE');
});
test('explanation only renders canonical facts with deterministic numbers and no private ceilings',()=>{
  const result=solve(PACKAGES,members());const facts=publicFacts(result,PACKAGES);const prose=renderExplanation({factIds:['fit','total']},facts);
  assert.match(prose,/\$1,455\.00/);assert.doesNotMatch(prose,/\$450|\$400|\$500|\$350/);
  assert.throws(()=>renderExplanation({factIds:['total'],text:'$1'},facts));assert.throws(()=>renderExplanation({factIds:['made-up']},facts));assert.throws(()=>renderExplanation({factIds:['total','total']},facts));
});
