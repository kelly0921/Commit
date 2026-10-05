import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalAdapter } from '../src/paypal.js';
test('SDK saga transport uses full refund, capture finality, fixed Sandbox mock header and related resource bindings',async t=>{
 t.mock.method(console,'info',()=>{});const adapter=new PayPalAdapter('test','secret');const calls:any[]=[];const a=adapter as unknown as {payments:any};const response=(resource:any)=>async(input:any)=>{calls.push(input);return {result:resource,statusCode:200,headers:{}};};
 a.payments={captureAuthorizedPayment:response({id:'C',status:'COMPLETED',amount:{value:'395.00',currencyCode:'USD'},finalCapture:true,supplementaryData:{relatedIds:{authorizationId:'A',orderId:'O'}}}),refundCapturedPayment:response({id:'R',status:'COMPLETED',amount:{value:'395.00',currencyCode:'USD'},links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/payments/captures/C'}]}),getRefund:response({id:'R',status:'PENDING',amount:{value:'395.00',currencyCode:'USD'}})};
 const cap=await adapter.captureAuthorization('A','395.00','saved-capture-key','AUTHORIZATION_EXPIRED');assert.equal(cap.resource.authorizationId,'A');assert.equal(cap.resource.finalCapture,true);assert.deepEqual(JSON.parse(calls[0].paypalMockResponse),{mock_application_codes:'AUTHORIZATION_EXPIRED'});assert.equal(calls[0].body.finalCapture,true);const refund=await adapter.refundCapture('C','saved-refund-key');assert.deepEqual(calls[1].body,{});assert.equal(calls[1].paypalRequestId,'saved-refund-key');assert.equal(refund.resource.captureId,'C');assert.equal((await adapter.getRefund('R')).resource.status,'PENDING');
});

test('official SDK adapter uses AUTHORIZE and forwards separate operation request IDs', async t => {
  t.mock.method(console, 'info', () => {});
  const adapter = new PayPalAdapter('fixture-public-id', 'fixture-secret');
  const internals = adapter as unknown as { orders: Record<string, (...args: unknown[]) => Promise<unknown>>; payments: Record<string, (...args: unknown[]) => Promise<unknown>> };
  const calls: { method: string; input: any }[] = [];
  const auth = { id: 'AUTH123', status: 'CREATED', amount: { value: '10.00', currencyCode: 'USD' } };
  const order = { id: 'ORDER123', status: 'CREATED', intent: 'AUTHORIZE', purchaseUnits: [{ amount: auth.amount, payments: { authorizations: [auth] } }] };
  const capture = { id: 'CAPTURE123', status: 'COMPLETED', amount: auth.amount };
  function response(method: string, resource: unknown) { return async (input: unknown) => { calls.push({ method, input }); return { result: resource, statusCode: 200, headers: { 'Paypal-Debug-Id': 'test-debug-id' } }; }; }
  internals.orders = { createOrder: response('createOrder', order), getOrder: response('getOrder', order), authorizeOrder: response('authorizeOrder', order) };
  internals.payments = { getAuthorizedPayment: response('getAuthorizedPayment', auth), captureAuthorizedPayment: response('captureAuthorizedPayment', capture),
    getCapturedPayment: response('getCapturedPayment', capture), voidPayment: response('voidPayment', null) };
  const created = await adapter.createAuthorizationOrder('local-id', 'create-request');
  assert.equal(created.resource.id, 'ORDER123'); assert.equal(created.debugId, 'test-debug-id');
  await adapter.getOrder('ORDER123'); await adapter.authorizeOrder('ORDER123', 'authorize-request');
  await adapter.getAuthorization('AUTH123'); await adapter.captureAuthorization('AUTH123', '10.00', 'capture-request');
  await adapter.getCapture('CAPTURE123'); assert.equal((await adapter.voidAuthorization('AUTH123', 'void-request')).resource, null);
  assert.equal(calls.find(call => call.method === 'createOrder')?.input.body.intent, 'AUTHORIZE');
  assert.equal(calls.find(call => call.method === 'createOrder')?.input.body.purchaseUnits[0].amount.value, '10.00');
  assert.equal(calls.find(call => call.method === 'authorizeOrder')?.input.paypalRequestId, 'authorize-request');
  assert.equal(calls.find(call => call.method === 'captureAuthorizedPayment')?.input.body.finalCapture, true);
  assert.equal(calls.find(call => call.method === 'captureAuthorizedPayment')?.input.paypalRequestId, 'capture-request');
  assert.equal(calls.find(call => call.method === 'voidPayment')?.input.paypalRequestId, 'void-request');
});
test('adapter never exposes raw transport errors containing secrets', async t => {
  const logs: string[] = []; t.mock.method(console, 'warn', (message: string) => { logs.push(message); });
  const adapter = new PayPalAdapter('fixture-public-id', 'fixture-secret');
  const internals = adapter as unknown as { orders: { getOrder: () => Promise<never> } };
  internals.orders = { getOrder: async () => { throw new Error('Authorization Bearer secret-token fixture-secret'); } };
  await assert.rejects(adapter.getOrder('ORDER123'), error => error instanceof Error && error.message === 'PAYPAL_NETWORK_OR_RESPONSE_ERROR');
  assert.doesNotMatch(logs.join('\n'), /secret-token|fixture-secret|Bearer/);
});
test('allocation orders reuse SDK transport with exact amount, supported checkout context and safe resource metadata',async t=>{
  t.mock.method(console,'info',()=>{});const adapter=new PayPalAdapter('fixture-public-id','fixture-secret');let input:any;
  const internals=adapter as unknown as {orders:{createOrder:(value:unknown)=>Promise<unknown>}};
  internals.orders={createOrder:async value=>{input=value;return {statusCode:201,headers:{},result:{id:'ORDER-ALLOCATION',status:'PAYER_ACTION_REQUIRED',intent:'AUTHORIZE',purchaseUnits:[{referenceId:'commitment-id',customId:'commitment-id',amount:{value:'390.00',currencyCode:'USD'},payee:{merchantId:'MERCHANT',emailAddress:'private-merchant@example.test'}}],links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-ALLOCATION'}],payer:{emailAddress:'private-buyer@example.test'}}};}};
  const result=await adapter.createAuthorizationOrder('commitment-id','durable-key',{amount:{value:'390.00',currencyCode:'USD'},description:'Commit Sandbox - opaque proposal',returnUrl:'http://127.0.0.1:3002/commit/return',cancelUrl:'http://127.0.0.1:3002/commit/cancel'});
  assert.equal(input.body.intent,'AUTHORIZE');assert.equal(input.body.purchaseUnits[0].amount.value,'390.00');assert.equal(input.paypalRequestId,'durable-key');assert.equal(input.body.paymentSource.paypal.experienceContext.returnUrl,'http://127.0.0.1:3002/commit/return');assert.equal(input.body.paymentSource.paypal.experienceContext.shippingPreference,'NO_SHIPPING');assert.equal(result.resource.unitCount,1);assert.equal(result.resource.customId,'commitment-id');assert.equal(result.resource.merchantId,'MERCHANT');assert.match(result.resource.approvalUrl!,/^https:\/\/www.sandbox.paypal.com/);assert.doesNotMatch(JSON.stringify(result),/email|private-buyer|private-merchant/);
});
test('order adapter preserves an authorization ID even when its details require later reconciliation',async t=>{
  t.mock.method(console,'info',()=>{});const adapter=new PayPalAdapter('fixture-public-id','fixture-secret');const internals=adapter as unknown as {orders:{authorizeOrder:(value:unknown)=>Promise<unknown>}};
  internals.orders={authorizeOrder:async()=>({statusCode:201,headers:{},result:{id:'ORDER-KNOWN',status:'COMPLETED',intent:'AUTHORIZE',purchaseUnits:[{payments:{authorizations:[{id:'AUTH-KNOWN'}]}}]}})};
  const result=await adapter.authorizeOrder('ORDER-KNOWN','stable-authorization-key');assert.equal(result.resource.authorizations[0]!.id,'AUTH-KNOWN');assert.equal(result.resource.authorizations[0]!.status,'UNKNOWN');assert.equal(result.resource.authorizations[0]!.amount.value,'');
});
