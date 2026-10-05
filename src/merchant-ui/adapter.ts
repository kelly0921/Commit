import type {AgLlmAdapter,AgLlmResponse,AgAiEvent} from 'ag-studio';
export type Transport=(path:string,value:unknown,signal?:AbortSignal)=>Promise<unknown>;
export function merchantAdapter(transport:Transport):AgLlmAdapter {
  return {executeTurn(request,options){
    const complete=transport('/api/merchant/agent-turn',request,options?.signal) as Promise<AgLlmResponse>;
    return {complete,stream:{async *[Symbol.asyncIterator]():AsyncGenerator<AgAiEvent>{
      const response=await complete;
      for(const item of response.output){
        if(item.type==='message'){
          yield {type:'TEXT_MESSAGE_START',messageId:item.id,role:'assistant'};
          for(const part of item.content)if(part.type==='text')yield {type:'TEXT_MESSAGE_CONTENT',messageId:item.id,delta:part.text};
          yield {type:'TEXT_MESSAGE_END',messageId:item.id};
        }else if(item.type==='function_call'){
          yield {type:'TOOL_CALL_START',toolCallId:item.callId,toolCallName:item.name};
          yield {type:'TOOL_CALL_ARGS',toolCallId:item.callId,delta:item.arguments};
          yield {type:'TOOL_CALL_END',toolCallId:item.callId};
        }
      }
    }}};
  }};
}
