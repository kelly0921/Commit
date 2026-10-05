import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PaymentStore } from '../src/store.js';
import { PaymentService } from '../src/payments.js';
import { PayPalError, type ApiResult, type Authorization, type Capture, type Order, type PayPalGateway } from '../src/model.js';

const result = <T>(resource: T, httpStatus = 200): ApiResult<T> => ({ resource: structuredClone(resource), httpStatus, debugId: 'fixture-debug' });
class FakePayPal implements PayPalGateway {
  calls: { operation: string; requestId?: string }[] = [];
  order: Order = { id: 'ORDER123', intent: 'AUTHORIZE', status: 'CREATED', amount: { value: '10.00', currencyCode: 'USD' }, authorizations: [], captures: [] };
  auth: Authorization = { id: 'AUTH123', status: 'CREATED', amount: { value: '10.00', currencyCode: 'USD' }, expirationTime: '2099-01-01T00:00:00Z' };
  capture: Capture = { id: 'CAPTURE123', status: 'COMPLETED', amount: { value: '10.00', currencyCode: 'USD' } };
  authGetFailure = false;
  captureGetFailure = false;
  captureFailure = false;
  createFailure = false;
  voidDoesNothing = false;
  captureTimeoutAfterCommit = false;
  async createAuthorizationOrder(_id: string, requestId: string) { this.calls.push({ operation: 'create', requestId }); if (this.createFailure) throw new PayPalError('CREATE_FAILED', 500); return result(this.order, 201); }
  async getOrder() { return result(this.order); }
  async authorizeOrder(_id: string, requestId: string) { this.calls.push({ operation: 'authorize', requestId }); this.order.status = 'COMPLETED'; this.order.authorizations = [this.auth]; return result(this.order, 201); }
  async getAuthorization() { if (this.authGetFailure) throw new PayPalError('GET_AUTH_FAILED', 500); return result(this.auth); }
  async captureAuthorization(_id: string, _amount: string, requestId: string) {
    this.calls.push({ operation: 'capture', requestId });
    if (this.captureFailure) throw new PayPalError('CAPTURE_FAILED', 422);
    this.auth.status = 'CAPTURED'; this.order.captures = [this.capture];
    if (this.captureTimeoutAfterCommit) throw new PayPalError('TIMEOUT_AFTER_CAPTURE');
    return result(this.capture, 201);
  }
  async getCapture() { if (this.captureGetFailure) throw new PayPalError('GET_CAPTURE_FAILED', 500); return result(this.capture); }
  async voidAuthorization(_id: string, requestId: string) { this.calls.push({ operation: 'void', requestId }); if (!this.voidDoesNothing) this.auth.status = 'VOIDED'; return result(null, 204); }
}
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'commit-spike-'));
  let store = new PaymentStore(directory); await store.init();
  const paypal = new FakePayPal(); let service = new PaymentService(store, paypal);
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  return { paypal, get store() { return store; }, get service() { return service; }, directory,
    async restart() { await store.close(); store = new PaymentStore(directory); await store.init(); service = new PaymentService(store, paypal); },
    async authorized(flow: 'VOID_TEST' | 'CAPTURE_TEST' = 'CAPTURE_TEST') {
      const payment = await service.create(flow, randomUUID()); paypal.order.status = 'APPROVED'; return service.authorize(payment.id, paypal.order.id);
    } };
}

test('A: voided authorization never invokes a capture', async t => {
  const f = await fixture(t); const payment = await f.authorized();
  assert.equal((await f.service.void(payment.id)).state, 'VOIDED');
  await assert.rejects(f.service.capture(payment.id), { code: 'AUTHORIZATION_NOT_CAPTURABLE' });
  assert.equal(f.paypal.calls.filter(call => call.operation === 'capture').length, 0);
});
test('B: captured authorization never invokes a void', async t => {
  const f = await fixture(t); const payment = await f.authorized();
  assert.equal((await f.service.capture(payment.id)).state, 'CAPTURED');
  await assert.rejects(f.service.void(payment.id), { code: 'AUTHORIZATION_NOT_VOIDABLE' });
  assert.equal(f.paypal.calls.filter(call => call.operation === 'void').length, 0);
});
test('C: authorization ID is on disk even when subsequent verification fails', async t => {
  const f = await fixture(t); const payment = await f.service.create('VOID_TEST', randomUUID());
  f.paypal.order.status = 'APPROVED'; f.paypal.authGetFailure = true;
  await assert.rejects(f.service.authorize(payment.id, payment.paypalOrderId!), { code: 'GET_AUTH_FAILED' });
  const document = JSON.parse(await readFile(join(f.directory, 'payments.json'), 'utf8'));
  assert.equal(document.payments[0].paypalAuthorizationId, 'AUTH123');
  await f.restart(); assert.equal((await f.service.list())[0]?.paypalAuthorizationId, 'AUTH123');
});
test('D: failed capture preserves recoverable authorization, never reports success', async t => {
  const f = await fixture(t); const payment = await f.authorized(); f.paypal.captureFailure = true;
  await assert.rejects(f.service.capture(payment.id), { code: 'CAPTURE_FAILED' });
  const stored = (await f.service.list())[0]!;
  assert.equal(stored.state, 'AUTHORIZED'); assert.equal(stored.paypalCaptureId, undefined); assert.equal(stored.lastError?.code, 'CAPTURE_FAILED');
  assert.equal(stored.pendingOperation, 'capture');
  f.paypal.captureFailure = false; assert.equal((await f.service.capture(payment.id)).state, 'CAPTURED');
  const ids = f.paypal.calls.filter(call => call.operation === 'capture').map(call => call.requestId);
  assert.equal(ids[0], ids[1]);
});
test('E: concurrent repeated create, authorize, capture clicks each issue one POST', async t => {
  const f = await fixture(t); const key = randomUUID();
  const created = await Promise.all(Array.from({ length: 5 }, () => f.service.create('CAPTURE_TEST', key)));
  assert.equal(new Set(created.map(payment => payment.id)).size, 1);
  const id = created[0]!.id; f.paypal.order.status = 'APPROVED';
  await Promise.all(Array.from({ length: 5 }, () => f.service.authorize(id, f.paypal.order.id)));
  assert.equal(f.paypal.calls.filter(call => call.operation === 'capture').length, 0, 'authorization never auto captures');
  await Promise.all(Array.from({ length: 5 }, () => f.service.capture(id)));
  for (const operation of ['create', 'authorize', 'capture']) assert.equal(f.paypal.calls.filter(call => call.operation === operation).length, 1);
});
test('duplicate void after HTTP 204 is verified and issues one POST', async t => {
  const f = await fixture(t); const payment = await f.authorized('VOID_TEST');
  await Promise.all([f.service.void(payment.id), f.service.void(payment.id)]);
  const stored = (await f.service.list())[0]!;
  assert.equal(stored.state, 'VOIDED'); assert.equal(stored.paypalCaptureId, undefined);
  assert.equal(f.paypal.calls.filter(call => call.operation === 'void').length, 1);
});
test('client order substitution cannot authorize an unrelated PayPal order', async t => {
  const f = await fixture(t); const payment = await f.service.create('VOID_TEST', randomUUID());
  await assert.rejects(f.service.authorize(payment.id, 'OTHERORDER'), { code: 'ORDER_ID_MISMATCH' });
  assert.equal(f.paypal.calls.filter(call => call.operation === 'authorize').length, 0);
});
test('client approval cannot substitute for GET order approval', async t => {
  const f = await fixture(t); const payment = await f.service.create('VOID_TEST', randomUUID());
  await assert.rejects(f.service.authorize(payment.id, 'ORDER123'), { code: 'PAYER_APPROVAL_NOT_CONFIRMED' });
  assert.equal((await f.service.list())[0]?.state, 'CREATED');
});
test('remote void is discovered before capturing a locally authorized record', async t => {
  const f = await fixture(t); const payment = await f.authorized(); f.paypal.auth.status = 'VOIDED';
  await assert.rejects(f.service.capture(payment.id), { code: 'AUTHORIZATION_NOT_CAPTURABLE' });
  assert.equal((await f.service.list())[0]?.state, 'VOIDED');
});
test('capture GET failure persists capture ID and retry never issues another capture', async t => {
  const f = await fixture(t); const payment = await f.authorized(); f.paypal.captureGetFailure = true;
  await assert.rejects(f.service.capture(payment.id), { code: 'GET_CAPTURE_FAILED' });
  assert.equal((await f.service.list())[0]?.paypalCaptureId, 'CAPTURE123');
  assert.notEqual((await f.service.list())[0]?.state, 'CAPTURED');
  await f.restart(); f.paypal.captureGetFailure = false;
  assert.equal((await f.service.capture(payment.id)).state, 'CAPTURED');
  assert.equal(f.paypal.calls.filter(call => call.operation === 'capture').length, 1);
});
test('ambiguous capture timeout recovers remote capture, blocks competing void', async t => {
  const f = await fixture(t); const payment = await f.authorized(); f.paypal.captureTimeoutAfterCommit = true;
  await assert.rejects(f.service.capture(payment.id), { code: 'TIMEOUT_AFTER_CAPTURE' });
  await assert.rejects(f.service.void(payment.id), { code: 'AUTHORIZATION_NOT_VOIDABLE' });
  assert.equal((await f.service.capture(payment.id)).state, 'CAPTURED');
  assert.equal(f.paypal.calls.filter(call => call.operation === 'capture').length, 1);
});
test('PENDING capture is displayed pending, blocks void, and can later complete', async t => {
  const f = await fixture(t); const payment = await f.authorized(); f.paypal.capture.status = 'PENDING';
  assert.equal((await f.service.capture(payment.id)).state, 'CAPTURE_PENDING');
  await assert.rejects(f.service.void(payment.id), { code: 'AUTHORIZATION_NOT_VOIDABLE' });
  f.paypal.capture.status = 'COMPLETED'; assert.equal((await f.service.verify(payment.id)).state, 'CAPTURED');
});
test('void HTTP success without a verified VOIDED state never passes', async t => {
  const f = await fixture(t); const payment = await f.authorized(); f.paypal.voidDoesNothing = true;
  await assert.rejects(f.service.void(payment.id), { code: 'VOID_NOT_YET_CONFIRMED' });
  assert.equal((await f.service.list())[0]?.state, 'AUTHORIZED');
  await assert.rejects(f.service.capture(payment.id), { code: 'AUTHORIZATION_NOT_CAPTURABLE' });
});
test('create failure retries the persisted idempotency key after restart', async t => {
  const f = await fixture(t); f.paypal.createFailure = true; const key = randomUUID();
  await assert.rejects(f.service.create('VOID_TEST', key), { code: 'CREATE_FAILED' });
  assert.equal((await f.service.list())[0]?.state, 'NEW');
  await f.restart(); f.paypal.createFailure = false; await f.service.create('VOID_TEST', key);
  const calls = f.paypal.calls.filter(call => call.operation === 'create'); assert.equal(calls[0]?.requestId, calls[1]?.requestId);
});
test('expired create idempotency window prevents an unintended new order', async t => {
  const f = await fixture(t); f.paypal.createFailure = true; const key = randomUUID();
  await assert.rejects(f.service.create('VOID_TEST', key));
  const payment = (await f.service.list())[0]!; payment.requests.create.firstAttemptAt = '2000-01-01T00:00:00Z'; await f.store.save(payment);
  await assert.rejects(f.service.create('VOID_TEST', key), { code: 'IDEMPOTENCY_WINDOW_EXPIRED_RECONCILE_MANUALLY' });
  assert.equal(f.paypal.calls.filter(call => call.operation === 'create').length, 1);
});
test('authorization amount mismatch cannot be captured but preserves its resource ID', async t => {
  const f = await fixture(t); const payment = await f.service.create('CAPTURE_TEST', randomUUID());
  f.paypal.order.status = 'APPROVED'; f.paypal.auth.amount.value = '100.00';
  await assert.rejects(f.service.authorize(payment.id, 'ORDER123'), { code: 'PAYPAL_AMOUNT_MISMATCH' });
  assert.equal((await f.service.list())[0]?.paypalAuthorizationId, 'AUTH123');
  await assert.rejects(f.service.capture(payment.id)); assert.equal(f.paypal.calls.filter(call => call.operation === 'capture').length, 0);
});
test('single JSON store refuses a concurrent second process owner', async t => {
  const f = await fixture(t); const second = new PaymentStore(f.directory); await assert.rejects(second.init(), /locked/);
});
