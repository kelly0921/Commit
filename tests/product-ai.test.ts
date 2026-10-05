import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiProvider, OfflineDemoProvider } from '../src/product/ai.js';
import { SEED_CONSTRAINTS } from '../src/product/seed.js';
function response(output:unknown){return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]}));}
test('OpenAI uses strict structured outputs, private interpretation and store=false',async()=>{
  let sent:any;const provider=new OpenAiProvider('test-key','test-model',async(_url,init)=>{sent=JSON.parse(init!.body as string);return response(SEED_CONSTRAINTS.kelly);});
  const result=await provider.interpret('My max is $450 and I need rentals.');assert.equal(result.source,'OPENAI');assert.equal(result.parsed.hardMax,450);assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.text.format.schema.additionalProperties,false);assert.equal(sent.model,'test-model');assert.ok(sent.instructions.includes('Unsupported hard requirements'));
});
test('provider refusals, rate limits, malformed schema, incompleteness and bad JSON fail safely',async()=>{
  const cases:[Response,string][]=[ [new Response('',{status:429}),'AI_RATE_LIMITED'],[new Response('',{status:401}),'AI_CREDENTIALS_REJECTED'],[new Response(JSON.stringify({status:'incomplete'})),'AI_INCOMPLETE_RESPONSE'],[new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]})),'AI_REFUSED'],[new Response(JSON.stringify({status:'completed',output:'wrong'})),'AI_INVALID_RESPONSE'],[response({...SEED_CONSTRAINTS.kelly!,unexpected:true}),'INVALID_AI_SCHEMA'],[new Response('not-json'),'AI_INVALID_RESPONSE'] ];
  for(const [r,code] of cases){const provider=new OpenAiProvider('test-secret','model',async()=>r);await assert.rejects(()=>provider.interpret('My hard max is $450.'),new RegExp(code));}
  await assert.rejects(()=>new OpenAiProvider('').interpret('My max is $400.'),/AI_KEY_REQUIRED/);
});
test('explicit offline adapter labels provenance and blocks unsupported or missing hard needs',async()=>{
  const ai=new OfflineDemoProvider();const example=await ai.interpret("I'd prefer to stay near $350, but I absolutely cannot go over $400. I own my equipment.");assert.equal(example.source,'OFFLINE_DEMO');assert.equal(example.parsed.hardMax,400);assert.equal(example.parsed.preferredMax,350);assert.equal(example.parsed.clarifications.length,0);
  assert.ok((await ai.interpret('My max is $450 and I need a helicopter transfer.')).parsed.clarifications.length>0);assert.ok((await ai.interpret('I prefer $300 and can drive.')).parsed.clarifications.length>0);
});
test('explanation provider schema bounds selection to the renderer limit and available facts',async()=>{
  let sent:any;const ai=new OpenAiProvider('test-key','model',async(_url,init)=>{sent=JSON.parse(init!.body as string);return response({factIds:['no-match']});});
  await ai.explain([{id:'no-match',text:'No package fits.'}]);assert.equal(sent.text.format.schema.properties.factIds.minItems,1);assert.equal(sent.text.format.schema.properties.factIds.maxItems,1);
  await ai.explain(['a','b','c','d','e'].map(id=>({id,text:id})));assert.equal(sent.text.format.schema.properties.factIds.maxItems,4);assert.deepEqual(sent.text.format.schema.properties.factIds.items.enum,['a','b','c','d','e']);
});
