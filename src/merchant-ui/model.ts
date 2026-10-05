import type {AgDataSourcesDefinition,AgFieldDefinition} from 'ag-studio';
import type {MerchantDemand} from '../merchant/demand.js';

export function sameCohortScope(previous:readonly string[]|undefined,current:readonly string[]):boolean {
  return previous!==undefined&&previous.length===current.length&&[...previous].sort().join('|')===[...current].sort().join('|');
}

// Explicit browser/agent schema: no inference from raw consumer or fixture records.
export const PUBLIC_FIELDS:AgFieldDefinition[]=[
  {id:'cohortId',name:'Cohort',format:'textFormat'}, {id:'groupSize',name:'Group size',format:'integerFormat'},
  {id:'targetDate',name:'Arrival date',format:'textFormat'}, {id:'endDate',name:'Departure date',format:'textFormat'},
  {id:'month',name:'Month',format:'textFormat'}, {id:'packageName',name:'Package',format:'textFormat'},
  {id:'potentialGmv',name:'Group value · USD',format:'integerFormat',formatOptions:{format:new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2})},description:'Undiscounted quote in USD, not guaranteed revenue.'},
  {id:'stage',name:'Stage',format:'textFormat'}, {id:'blocker',name:'Primary blocker',format:'textFormat'},
  {id:'priceGapBand',name:'Price gap band',format:'textFormat'}, {id:'qualityTier',name:'Package quality tier',format:'textFormat'},
  {id:'commitmentProgress',name:'Commitments',format:'textFormat'}, {id:'nearConversion',name:'Near conversion',format:'booleanFormat'},
  {id:'active',name:'Active intents',format:'integerFormat',description:'1 when unresolved, 0 when purchased.'},
  {id:'eligibleGmv',name:'Potential group GMV · USD',format:'integerFormat',formatOptions:{format:new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2})},description:'Quote only when unresolved and feasible or unlockable with an allowed discount of at most 10%.'},
  {id:'nearCount',name:'Near-conversion groups',format:'integerFormat'}, {id:'fullCount',name:'Fully committed groups',format:'integerFormat'},
];
export function studioData(rows:MerchantDemand[]):AgDataSourcesDefinition {
  const data=rows.map(r=>({cohortId:r.cohortId,groupSize:r.groupSize,targetDate:r.targetDate,endDate:r.endDate,month:r.month,packageName:r.packageName,potentialGmv:r.potentialGmvCents/100,stage:r.stage,blocker:r.blocker,priceGapBand:r.priceGapBand,qualityTier:r.qualityTier,commitmentProgress:`${r.committedCount}/${r.groupSize}`,nearConversion:r.nearConversion,active:r.stage==='PURCHASED'?0:1,eligibleGmv:r.potentialEligible?r.potentialGmvCents/100:0,nearCount:r.nearConversion?1:0,fullCount:r.stage==='FULLY_COMMITTED'?1:0}));
  const steps=['1 · Intent created','2 · Constraints collected','3 · Feasible plan','4 · At least one commitment','5 · Fully committed','6 · Purchased'];
  const funnel=rows.flatMap(r=>[true,r.constraintsCollected,r.feasible,r.feasible&&r.committedCount>0,r.feasible&&r.committedCount===r.groupSize,r.stage==='PURCHASED'].flatMap((qualifies,i)=>qualifies?[{cohortId:r.cohortId,step:steps[i]!,groups:1}]:[]));
  return {description:'Commit: 50 deterministic synthetic group purchase intents for fictional Summit Weekend in 2027. Cohorts are anonymous. No participant constraints or financial resources exist here. The funnel is cumulative, not a chronological sales forecast.',sources:[{id:'demand',name:'Group demand',description:'One row per anonymous group. Near conversion means an allowed ≤10% offer makes it feasible, or a feasible group is fully committed/one commitment away. Potential GMV is the original quote for active feasible or price-recoverable cohorts; never a purchase prediction.',data,fields:PUBLIC_FIELDS},{id:'funnel',name:'Commitment funnel',description:'One record for each milestone a cohort qualifies for. Sum groups by step. Linked to demand by anonymous cohort ID.',data:funnel,fields:[{id:'cohortId',format:'textFormat'},{id:'step',name:'Milestone',format:'textFormat'},{id:'groups',name:'Groups',format:'integerFormat'}]}],relationships:[{id:'cohort-funnel',source:{tableId:'demand',fieldId:'cohortId'},target:{tableId:'funnel',fieldId:'cohortId'},type:'one-to-many'}],options:{fanout:{warning:true,execute:'prevent'}}};
}
