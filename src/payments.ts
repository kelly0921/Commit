import { randomUUID } from 'node:crypto';
import { PaymentStore } from './store.js';
import { PayPalError, SpikeError, type ApiResult, type Authorization, type Capture, type FlowType, type Operation, type Order, type PaymentSpike, type PayPalGateway } from './model.js';

export class PaymentService {
  constructor(private store: PaymentStore, private paypal: PayPalGateway) {}
  list() { return this.store.exclusive(async () => this.store.list()); }
  private get(id: string) {
    const payment = this.store.get(id);
    if (!payment) throw new SpikeError('PAYMENT_NOT_FOUND', 404);
    return payment;
  }
  private async save(payment: PaymentSpike) { payment.updatedAt = new Date().toISOString(); await this.store.save(payment); }
  private event<T>(payment: PaymentSpike, operation: string, result: ApiResult<T>, status: string, resourceId?: string, requestId?: string) {
    payment.events.push({ at: new Date().toISOString(), operation, status, resourceId, requestId, debugId: result.debugId, httpStatus: result.httpStatus });
  }
  private async attempt(payment: PaymentSpike, operation: Operation) {
    const request = payment.requests[operation];
    // Never replay a possibly successful POST after its documented key retention expires.
    const retention = operation === 'create' || operation === 'authorize' ? 6 * 3600000 : 45 * 86400000;
    if (request.firstAttemptAt && Date.now() - Date.parse(request.firstAttemptAt) >= retention)
      throw new SpikeError('IDEMPOTENCY_WINDOW_EXPIRED_RECONCILE_MANUALLY');
    request.firstAttemptAt ??= new Date().toISOString();
    payment.pendingOperation = operation;
    await this.save(payment);
    return request.id;
  }
  private async guarded(payment: PaymentSpike, operation: string, work: () => Promise<PaymentSpike>) {
    try { return await work(); }
    catch (error) {
      const known = error instanceof SpikeError ? error : new SpikeError('INTERNAL_OR_PERSISTENCE_ERROR', 500);
      payment.lastError = { code: known.code, operation, debugId: known.debugId,
        httpStatus: error instanceof PayPalError ? error.paypalHttpStatus : known.httpStatus };
      payment.events.push({ at: new Date().toISOString(), operation, status: 'ERROR', debugId: known.debugId, httpStatus: payment.lastError.httpStatus });
      // Keep the previous state and in-flight operation. A timeout can mean PayPal committed it.
      await this.save(payment);
      throw known;
    }
  }
  private checkMoney(payment: PaymentSpike, money: { value: string; currencyCode: string }) {
    if (money.currencyCode !== payment.currency || money.value !== payment.amount) throw new SpikeError('PAYPAL_AMOUNT_MISMATCH', 502);
  }
  private adoptAuthorization(payment: PaymentSpike, auth: Authorization) {
    if (payment.paypalAuthorizationId && payment.paypalAuthorizationId !== auth.id) throw new SpikeError('AUTHORIZATION_ID_MISMATCH', 502);
    payment.paypalAuthorizationId = auth.id;
    payment.authorizationStatus = auth.status;
    this.checkMoney(payment, auth.amount);
    payment.authorizationCreatedAt = auth.createTime;
    payment.authorizationExpiresAt = auth.expirationTime;
    if (auth.status === 'CREATED' && !payment.paypalCaptureId && payment.state !== 'VOIDED' && payment.state !== 'CAPTURED') payment.state = 'AUTHORIZED';
    else if (auth.status === 'VOIDED' && !payment.paypalCaptureId) { payment.state = 'VOIDED'; payment.pendingOperation = undefined; }
    else if (auth.status === 'CAPTURED' || auth.status === 'PARTIALLY_CAPTURED') {
      if (payment.state !== 'CAPTURED') payment.state = 'CAPTURE_PENDING';
    } else if (auth.status !== 'CREATED' && payment.state !== 'CAPTURED') payment.state = 'BLOCKED';
  }
  private async adoptOrder(payment: PaymentSpike, result: ApiResult<Order>) {
    const order = result.resource;
    if (payment.paypalOrderId && payment.paypalOrderId !== order.id) throw new SpikeError('ORDER_ID_MISMATCH', 502);
    if (order.intent && order.intent !== 'AUTHORIZE') throw new SpikeError('ORDER_INTENT_MISMATCH', 502);
    if (order.amount) this.checkMoney(payment, order.amount);
    payment.paypalOrderId = order.id;
    payment.orderStatus = order.status;
    if (order.authorizations.length > 1 || order.captures.length > 1) throw new SpikeError('UNEXPECTED_MULTIPLE_PAYMENT_RESOURCES', 502);
    const auth = order.authorizations[0];
    if (auth) {
      this.adoptAuthorization(payment, auth);
      if (payment.pendingOperation === 'authorize') payment.pendingOperation = undefined;
      // Persist the authorization ID before any later GET or response to the browser.
      await this.save(payment);
    }
    const capture = order.captures[0];
    if (capture) { this.checkMoney(payment, capture.amount); payment.paypalCaptureId = capture.id; payment.captureStatus = capture.status; await this.save(payment); }
  }
  private async verifyUnlocked(payment: PaymentSpike) {
    if (payment.paypalOrderId) {
      const result = await this.paypal.getOrder(payment.paypalOrderId);
      this.event(payment, 'getOrder', result, result.resource.status, result.resource.id);
      await this.adoptOrder(payment, result);
      if (!payment.paypalAuthorizationId && result.resource.status === 'APPROVED') payment.state = 'PAYER_APPROVED';
    }
    if (payment.paypalAuthorizationId) {
      const result = await this.paypal.getAuthorization(payment.paypalAuthorizationId);
      this.event(payment, 'getAuthorization', result, result.resource.status, result.resource.id);
      this.adoptAuthorization(payment, result.resource);
      await this.save(payment);
    }
    if (payment.paypalCaptureId) {
      const result = await this.paypal.getCapture(payment.paypalCaptureId);
      if (result.resource.id !== payment.paypalCaptureId) throw new SpikeError('CAPTURE_ID_MISMATCH', 502);
      this.checkMoney(payment, result.resource.amount);
      payment.captureStatus = result.resource.status;
      payment.capturedAmount = result.resource.amount.value;
      payment.state = result.resource.status === 'COMPLETED' ? 'CAPTURED' : result.resource.status === 'PENDING' ? 'CAPTURE_PENDING' : 'BLOCKED';
      payment.pendingOperation = undefined;
      this.event(payment, 'getCapture', result, result.resource.status, result.resource.id);
    }
    payment.verifiedAt = new Date().toISOString();
    payment.lastError = undefined;
    await this.save(payment);
    return payment;
  }
  create(flowType: FlowType, clientKey: string) {
    return this.store.exclusive(async () => {
      let payment = this.store.list().find(record => record.clientKey === clientKey);
      if (payment && payment.flowType !== flowType) throw new SpikeError('CLIENT_KEY_FLOW_MISMATCH');
      if (!payment) {
        const now = new Date().toISOString();
        payment = { id: randomUUID(), clientKey, flowType, amount: '10.00', currency: 'USD', state: 'NEW', createdAt: now, updatedAt: now,
          requests: { create: { id: randomUUID() }, authorize: { id: randomUUID() }, capture: { id: randomUUID() }, void: { id: randomUUID() } }, events: [] };
        await this.save(payment);
      }
      const record = payment;
      if (record.paypalOrderId) return record;
      return this.guarded(record, 'create', async () => {
        const requestId = await this.attempt(record, 'create');
        const result = await this.paypal.createAuthorizationOrder(record.id, requestId);
        await this.adoptOrder(record, result);
        record.state = 'CREATED'; record.pendingOperation = undefined; record.lastError = undefined;
        this.event(record, 'create', result, result.resource.status, result.resource.id, requestId);
        await this.save(record); return record;
      });
    });
  }
  authorize(id: string, clientOrderId: string) {
    return this.store.exclusive(async () => {
      const payment = this.get(id);
      if (!payment.paypalOrderId || payment.paypalOrderId !== clientOrderId) throw new SpikeError('ORDER_ID_MISMATCH', 400);
      if (payment.paypalAuthorizationId) return this.guarded(payment, 'verify', () => this.verifyUnlocked(payment));
      return this.guarded(payment, 'authorize', async () => {
        const order = await this.paypal.getOrder(payment.paypalOrderId!);
        this.event(payment, 'getOrder', order, order.resource.status, order.resource.id);
        await this.adoptOrder(payment, order);
        if (payment.paypalAuthorizationId) return this.verifyUnlocked(payment);
        if (order.resource.status !== 'APPROVED') throw new SpikeError('PAYER_APPROVAL_NOT_CONFIRMED');
        payment.state = 'PAYER_APPROVED'; await this.save(payment);
        const requestId = await this.attempt(payment, 'authorize');
        const result = await this.paypal.authorizeOrder(payment.paypalOrderId!, requestId);
        await this.adoptOrder(payment, result);
        if (!payment.paypalAuthorizationId) throw new SpikeError('PAYPAL_RESPONSE_MISSING_AUTHORIZATION_ID', 502);
        this.event(payment, 'authorize', result, payment.authorizationStatus!, payment.paypalAuthorizationId, requestId);
        await this.save(payment);
        return this.verifyUnlocked(payment);
      });
    });
  }
  capture(id: string) {
    return this.store.exclusive(async () => {
      const payment = this.get(id);
      if (payment.flowType !== 'CAPTURE_TEST') throw new SpikeError('WRONG_FLOW_FOR_CAPTURE');
      if (payment.state === 'VOIDED' || payment.pendingOperation === 'void') throw new SpikeError('AUTHORIZATION_NOT_CAPTURABLE');
      return this.guarded(payment, 'capture', async () => {
        await this.verifyUnlocked(payment);
        if (payment.paypalCaptureId) return payment;
        if (!payment.paypalAuthorizationId || payment.authorizationStatus !== 'CREATED' || payment.state !== 'AUTHORIZED')
          throw new SpikeError('AUTHORIZATION_NOT_CAPTURABLE');
        if (payment.authorizationExpiresAt && Date.parse(payment.authorizationExpiresAt) <= Date.now()) throw new SpikeError('AUTHORIZATION_EXPIRED');
        const requestId = await this.attempt(payment, 'capture');
        const result = await this.paypal.captureAuthorization(payment.paypalAuthorizationId, payment.amount, requestId);
        // Save the capture resource before verification; PENDING is not success.
        payment.paypalCaptureId = result.resource.id; payment.captureStatus = result.resource.status; payment.state = 'CAPTURE_PENDING';
        this.event(payment, 'capture', result, result.resource.status, result.resource.id, requestId);
        await this.save(payment);
        this.checkMoney(payment, result.resource.amount);
        return this.verifyUnlocked(payment);
      });
    });
  }
  void(id: string) {
    return this.store.exclusive(async () => {
      const payment = this.get(id);
      if (payment.paypalCaptureId || payment.state === 'CAPTURED' || payment.pendingOperation === 'capture') throw new SpikeError('AUTHORIZATION_NOT_VOIDABLE');
      return this.guarded(payment, 'void', async () => {
        await this.verifyUnlocked(payment);
        if (payment.state === 'VOIDED') return payment;
        if (!payment.paypalAuthorizationId || payment.authorizationStatus !== 'CREATED' || payment.state !== 'AUTHORIZED')
          throw new SpikeError('AUTHORIZATION_NOT_VOIDABLE');
        const requestId = await this.attempt(payment, 'void');
        const result = await this.paypal.voidAuthorization(payment.paypalAuthorizationId, requestId);
        this.event(payment, 'void', result, result.resource?.status ?? 'VERIFY_REQUIRED', payment.paypalAuthorizationId, requestId);
        await this.save(payment);
        await this.verifyUnlocked(payment);
        if ((payment as PaymentSpike).state !== 'VOIDED') throw new SpikeError('VOID_NOT_YET_CONFIRMED', 502);
        return payment;
      });
    });
  }
  verify(id: string) { return this.store.exclusive(async () => { const payment = this.get(id); return this.guarded(payment, 'verify', () => this.verifyUnlocked(payment)); }); }
}
