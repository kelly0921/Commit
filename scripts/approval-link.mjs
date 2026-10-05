import { readFile } from 'node:fs/promises';
import { ApiError, Client, Environment, OrdersController } from '@paypal/paypal-server-sdk';

// Read-only recovery for browsers that cannot open the JS SDK checkout popup.
// Print only the order's public approval link and safe provider diagnostics.
try {
  const flowType = process.argv[2];
  if (!['VOID_TEST', 'CAPTURE_TEST'].includes(flowType)) throw new Error('INVALID_FLOW');
  const records = JSON.parse(await readFile('data/payments.json', 'utf8')).payments;
  const payment = records.filter(record => record.flowType === flowType).at(-1);
  if (!payment?.paypalOrderId) throw new Error('ORDER_REQUIRED');
  const controller = new OrdersController(new Client({
    environment: Environment.Sandbox,
    clientCredentialsAuthCredentials: {
      oAuthClientId: process.env.PAYPAL_CLIENT_ID?.trim(),
      oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET?.trim(),
    },
    timeout: 30000,
    httpClientOptions: { retryConfig: { maxNumberOfRetries: 0 } },
  }));
  const response = await controller.getOrder({ id: payment.paypalOrderId });
  const approvalUrl = response.result.links?.find(link => ['approve', 'payer-action'].includes(link.rel))?.href;
  if (approvalUrl && new URL(approvalUrl).hostname !== 'www.sandbox.paypal.com') throw new Error('SANDBOX_APPROVAL_URL_REQUIRED');
  console.log(JSON.stringify({ orderId: response.result.id, status: response.result.status, approvalUrl,
    sandboxMerchantId: response.result.purchaseUnits?.[0]?.payee?.merchantId,
    httpStatus: response.statusCode,
    debugId: Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'paypal-debug-id')?.[1],
  }));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof ApiError ? 'PAYPAL_API_ERROR' : 'APPROVAL_LINK_UNAVAILABLE',
    httpStatus: error instanceof ApiError ? error.statusCode : undefined }));
  process.exitCode = 1;
}
