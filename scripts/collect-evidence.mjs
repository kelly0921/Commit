import { readFile, writeFile } from 'node:fs/promises';
let payments = [];
try { payments = JSON.parse(await readFile('data/payments.json', 'utf8')).payments; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
function evidence(flowType) {
  const payment = payments.filter(item => item.flowType === flowType).at(-1);
  if (!payment) return { flowType, result: 'PENDING', reason: 'No test record exists' };
  const expected = flowType === 'VOID_TEST' ? 'VOIDED' : 'CAPTURED';
  const verified = payment.state === expected && payment.paypalOrderId && payment.paypalAuthorizationId && payment.verifiedAt &&
    payment.events.some(event => event.operation === 'authorize' && event.resourceId === payment.paypalAuthorizationId) &&
    (flowType === 'VOID_TEST' ? !payment.paypalCaptureId && payment.events.some(event => event.operation === 'getAuthorization' && event.status === 'VOIDED') :
      payment.paypalCaptureId && payment.capturedAmount === '10.00' && payment.events.some(event => event.operation === 'getCapture' && event.status === 'COMPLETED'));
  return { flowType, result: verified ? 'PASS' : 'PENDING', orderId: payment.paypalOrderId, authorizationId: payment.paypalAuthorizationId,
    captureId: payment.paypalCaptureId, state: payment.state, orderStatus: payment.orderStatus, authorizationStatus: payment.authorizationStatus,
    captureStatus: payment.captureStatus, amount: payment.amount, currency: payment.currency, capturedAmount: payment.capturedAmount,
    verifiedAt: payment.verifiedAt, events: payment.events };
}
const flows = ['VOID_TEST', 'CAPTURE_TEST'].map(evidence);
const separateOrders = flows[0].orderId && flows[1].orderId && flows[0].orderId !== flows[1].orderId;
const document = { checkedAt: new Date().toISOString(), environment: 'sandbox', sdk: '@paypal/paypal-server-sdk@2.5.0',
  provenance: 'Persisted harness records; not an independent PayPal audit. Automated mock tests are excluded.',
  result: flows.every(flow => flow.result === 'PASS') && separateOrders ? 'PASS WITH LIMITATIONS' : 'PENDING — spike incomplete', flows };
await writeFile('docs/sandbox-evidence.json', JSON.stringify(document, null, 2) + '\n');
console.log(document.result);
for (const flow of flows) console.log(`${flow.flowType}: ${flow.result}; ${flow.state ?? 'no record'}`);
if (!separateOrders || flows.some(flow => flow.result !== 'PASS')) process.exitCode = 1;
