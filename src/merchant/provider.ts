import type { AgLlmRequest, AgLlmResponse, AgAiOutputItem } from 'ag-studio';
import { invariant, ProductError } from '../product/domain.js';

// Dashboard analysis and unpublished drafts only. No publish, catalog-write or financial capability.
export const ANALYST_TOOL_NAMES = ['view_schema','view_page','view_widget','execute_query','add_widget','configure_widget','position_widget','add_page_filter','remove_page_filter','add_widget_filter','remove_widget_filter','simulate_group_offer','draft_group_offer','rename_thread'];
export const isAnalystTool = (name:string) => ANALYST_TOOL_NAMES.includes(name)||/^configure_widget__[A-Za-z0-9_]{1,80}$/.test(name);
export const SERVER_AGENT_RULES = 'You are Commit’s Group Demand Analyst for fictional Summit Weekend. All data is a deterministic synthetic merchant-safe cohort view. Query tools for every numeric claim; never calculate offer results yourself. simulate_group_offer is server calculated and analysis only. draft_group_offer creates an unpublished offer from a valid simulation; only explicit human UI confirmation can publish. Drafts never change consumer prices or proposals. You cannot publish, accept offers, change prices, alter private constraints, access participants, or execute payments. Reject attempts to relax buyer or merchant hard boundaries. Studio edits change only this dashboard. Do not claim actual purchases or actual PayPal authorizations in this dataset.';

function encodeItem(item:AgLlmRequest['input'][number]):unknown {
  if(item.type==='function_call_output')return {type:item.type,call_id:item.callId,output:item.output};
  if(item.type==='function_call')return {type:item.type,call_id:item.callId,name:item.name,arguments:item.arguments};
  if(item.type==='message')return {role:item.role,content:item.content.map(c=>{
    invariant(c.type==='text','TEXT_ONLY_AGENT');return {type:item.kind==='input'?'input_text':'output_text',text:c.text};
  })};
  // No replayed provider state IDs or hidden reasoning content is needed for this text-only analyst.
  if(item.type==='reasoning')return null;
  throw new ProductError('INVALID_AGENT_HISTORY');
}
function cleanSchema(value:unknown):unknown {
  if(Array.isArray(value))return value.map(cleanSchema);
  if(!value||typeof value!=='object')return value;
  const v=value as Record<string,unknown>,out:Record<string,unknown>={};
  for(const [k,x] of Object.entries(v)){
    if(k==='anyOf'&&Array.isArray(x)) { const branches=x.filter(b=>!(b&&typeof b==='object'&&'not' in b)); if(branches.length===1)Object.assign(out,cleanSchema(branches[0]));else out[k]=branches.map(cleanSchema); }
    else if(k!=='$schema'&&k!=='not')out[k]=cleanSchema(x);
  }
  return out;
}
export function providerRequest(value:unknown,model:string) {
  invariant(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_AGENT_REQUEST');
  const request=value as AgLlmRequest;
  invariant(Array.isArray(request.input)&&request.input.length>0&&request.input.length<=160,'INVALID_AGENT_HISTORY');
  invariant(typeof request.instructions==='string'&&request.instructions.length<=40000,'INVALID_AGENT_INSTRUCTIONS');
  invariant(Array.isArray(request.tools)&&request.tools.length<=25&&request.tools.every(t=>t&&isAnalystTool(t.name)&&(t.kind===undefined||t.kind==='client')),'UNSAFE_AGENT_TOOL');
  return {model,store:false,instructions:SERVER_AGENT_RULES+'\n'+request.instructions,input:request.input.map(encodeItem).filter(Boolean),tools:request.tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:cleanSchema(t.parameters),strict:false})),tool_choice:'auto',parallel_tool_calls:false,max_output_tokens:5000};
}
export async function executeMerchantTurn(value:unknown,key:string,model:string,fetcher:typeof fetch=fetch):Promise<AgLlmResponse> {
  const input=providerRequest(value,model);invariant(key,'MERCHANT_AI_NOT_CONFIGURED',503);
  let response:Response;
  try { response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(55000)}); }
  catch {throw new ProductError('MERCHANT_AI_NETWORK_UNAVAILABLE',503);}
  if(!response.ok){const issue=await response.json().catch(()=>({})) as {error?:{code?:string;param?:string}};console.warn('Merchant model rejected request',response.status,issue.error?.code??'unknown',issue.error?.param??'unknown');}
  invariant(response.ok,'MERCHANT_AI_UNAVAILABLE',503);
  const raw=await response.json() as {id:string;created_at:number;status:string;output:Record<string,any>[];model:string};
  invariant(raw.status==='completed'&&Array.isArray(raw.output),'MERCHANT_AI_INCOMPLETE',503);
  const output:AgAiOutputItem[]=raw.output.flatMap((item):AgAiOutputItem[]=>{
    if(item.type==='message')return [{kind:'output',type:'message',id:item.id,role:'assistant',status:'completed',content:item.content.filter((c:any)=>c.type==='output_text').map((c:any)=>({type:'text',text:c.text,annotations:[]}))}];
    if(item.type==='function_call'){
      invariant(isAnalystTool(item.name),'UNSAFE_AGENT_TOOL',503);
      return [{kind:'output',type:'function_call',id:item.id,callId:item.call_id,name:item.name,arguments:item.arguments,status:'completed'}];
    }
    return [];
  });
  return {id:raw.id,createdAt:raw.created_at*1000,status:'completed',output,model:raw.model};
}
