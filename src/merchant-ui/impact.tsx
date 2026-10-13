import React from 'react';
import type {simulateGroupOffer,merchantSimulationImpact} from '../merchant/demand.js';
export type ImpactSimulation=ReturnType<typeof simulateGroupOffer>&{impact:ReturnType<typeof merchantSimulationImpact>;simulationId?:string};
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:n%100===0?0:2,maximumFractionDigits:2}).format(n/100);
export function MerchantImpactResult({result}:{result:ImpactSimulation}){
  const impact=result.impact;
  return <div className={'simulation-result impact-result '+(!result.accepted?'boundary':'')} aria-live="polite">
    <div className="result-heading"><strong>{result.accepted?`${result.input.discountPercent}% offer · scenario estimate`:'Outside your merchant boundaries'}</strong><span>{result.input.minimumGroupSize??2}+ people</span></div>
    {result.accepted?<><div className="impact-hero" aria-label="Modeled intervention impact">
      <div className="impact-groups"><b>{impact.newlyFeasibleGroups}</b><span>Newly feasible groups</span></div>
      <div className="paypal-impact-volume"><b>{money(impact.modeledIncrementalPaypalTpvCents)}</b><span>Potential checkout volume</span><small>Modeled incremental PayPal TPV</small></div>
      <div><b>{money(impact.merchantDiscountCostCents)}</b><span>Merchant discount cost</span></div>
    </div><div className="result-numbers impact-comparison">
      <div><b>{impact.beforeFeasibleGroups}</b><span>Before: feasible groups</span></div><div><b>{impact.afterFeasibleGroups}</b><span>After: feasible groups</span></div>
      <div><b>{money(impact.modeledIncrementalGmvCents)}</b><span>Modeled incremental GMV</span></div>
    </div>
    <ol className="impact-path" aria-label="Potential intervention chain">
      {['Blocked demand','Merchant offer','Newly feasible groups','Group replans','Fresh consumer approvals','Potential PayPal checkout volume'].map((step,i)=><li key={step}><span aria-hidden="true">{i+1}</span>{step}</li>)}
    </ol></>:null}
    <p className="estimate-note">Scenario estimate, not a purchase forecast or processed PayPal volume.</p>
    <details className="impact-assumptions"><summary>Scenario assumptions &amp; boundaries</summary>
      {result.accepted&&<p className="impact-definition">{impact.newlyFeasibleDefinition}</p>}
      <p>{result.accepted?impact.message:result.message}</p>
      {result.blockedGroupsByMerchantFloor>0&&<p>{result.blockedGroupsByMerchantFloor} eligible cohorts remain excluded by merchant dates, inventory, price or margin rules.</p>}
    </details>
  </div>;
}
