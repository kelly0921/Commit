import type {AgAiTool} from 'ag-studio';
// Studio's native query tool does not automatically inherit page filters.
// Bind the existing tool to the same anonymous cohort scope as the simulator.
export function bindQueryScope(tool:AgAiTool,scope:()=>Promise<string[]>):AgAiTool {
 return {...tool,execute:async(call,ctx)=>{
  const cohortIds=await scope();if(!cohortIds.length)return ctx.success('The current Studio view has no matching cohorts.',{rows:[],scopeCount:0});
  const query=call.args.query;
  if(!query||typeof query!=='object'||Array.isArray(query))return ctx.error('A valid Studio query is required.');
  const original=query as Record<string,unknown>,serialized=JSON.stringify(original);
  const table=serialized.includes('demand.')?'demand':serialized.includes('funnel.')?'funnel':'demand';
  const bound={field:{id:table+'.cohortId'},operator:'isIn',value:cohortIds};
  const filter=original.filter?{combinator:'and',conditions:[original.filter,bound]}:bound;
  if(!tool.execute)return ctx.error('Studio query execution is unavailable.');
  return tool.execute({...call,args:{...call.args,query:{...original,filter}}},ctx);
 }};
}
