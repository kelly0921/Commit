import { ApiError, CheckoutPaymentIntent, Client, Environment, OrdersController, PaymentsController, PaypalExperienceUserAction, PaypalWalletContextShippingPreference } from '@paypal/paypal-server-sdk';
import type { Order as SdkOrder, OrderAuthorizeResponse, PaymentAuthorization, CapturedPayment, Refund as SdkRefund } from '@paypal/paypal-server-sdk';
import { PayPalError, type ApiResult, type Authorization, type Capture, type Order, type PayPalGateway, type AuthorizationOrderInput, type Refund } from './model.js';

const required = (value: string | undefined, field: string): string => {
  if (!value) throw new PayPalError(`PAYPAL_RESPONSE_MISSING_${field}`);
  return value;
};
function authorization(value: PaymentAuthorization): Authorization {
  return { id: required(value.id, 'AUTHORIZATION_ID'), status: required(value.status, 'AUTHORIZATION_STATUS'),
    amount: { value: required(value.amount?.value, 'AMOUNT'), currencyCode: required(value.amount?.currencyCode, 'CURRENCY') },
    expirationTime: value.expirationTime, createTime: value.createTime };
}
function capture(value: CapturedPayment): Capture {
  return { id: required(value.id, 'CAPTURE_ID'), status: value.status??'UNKNOWN',
    amount: { value: value.amount?.value??'', currencyCode: value.amount?.currencyCode??'' },
    authorizationId:value.supplementaryData?.relatedIds?.authorizationId ?? value.links?.find(l=>l.rel==='up')?.href?.match(/\/authorizations\/([^/]+)$/)?.[1],
    orderId:value.supplementaryData?.relatedIds?.orderId,finalCapture:value.finalCapture,customId:value.customId };
}
function refund(value:SdkRefund):Refund {return {id:required(value.id,'REFUND_ID'),status:value.status??'UNKNOWN',amount:{value:value.amount?.value??'',currencyCode:value.amount?.currencyCode??''},captureId:value.links?.find(l=>l.rel==='up')?.href?.match(/\/captures\/([^/]+)$/)?.[1]};}
function authorizationReference(value:PaymentAuthorization):Authorization {
  // Order responses must deliver a known ID even when details need reconciliation.
  // The independent authorization GET still uses the strict mapper above.
  return {id:required(value.id,'AUTHORIZATION_ID'),status:value.status??'UNKNOWN',
    amount:{value:value.amount?.value??'',currencyCode:value.amount?.currencyCode??''},
    expirationTime:value.expirationTime,createTime:value.createTime};
}
function order(value: SdkOrder | OrderAuthorizeResponse): Order {
  const unit = value.purchaseUnits?.[0];
  return { id: required(value.id, 'ORDER_ID'), status: required(value.status, 'ORDER_STATUS'), intent: value.intent,
    amount: unit?.amount && { value: unit.amount.value, currencyCode: unit.amount.currencyCode },
    authorizations: value.purchaseUnits?.flatMap(unit => unit.payments?.authorizations?.map(authorizationReference) ?? []) ?? [],
    captures: value.purchaseUnits?.flatMap(unit => unit.payments?.captures?.map(capture) ?? []) ?? [],
    refunds:value.purchaseUnits?.flatMap(unit=>unit.payments?.refunds?.map(refund)??[])??[],
    unitCount:value.purchaseUnits?.length,referenceId:unit?.referenceId,customId:unit?.customId,merchantId:unit?.payee?.merchantId,
    approvalUrl:value.links?.find(link=>link.rel==='approve'||link.rel==='payer-action')?.href };
}
function header(headers: Record<string, string>, name: string): string | undefined {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}
function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,100}$/.test(value) ? value : undefined;
}

export class PayPalAdapter implements PayPalGateway {
  private orders: OrdersController;
  private payments: PaymentsController;
  constructor(clientId: string, clientSecret: string) {
    const client = new Client({
      environment: Environment.Sandbox,
      clientCredentialsAuthCredentials: { oAuthClientId: clientId, oAuthClientSecret: clientSecret },
      timeout: 30000,
      httpClientOptions: { retryConfig: { maxNumberOfRetries: 0 } },
      // SDK defaults to NullLogger. Never enable body/header logging for this harness.
    });
    this.orders = new OrdersController(client);
    this.payments = new PaymentsController(client);
  }
  private async call<T, R>(operation: string, requestId: string | undefined,
    call: () => Promise<{ result: T; statusCode: number; headers: Record<string, string> }>, map: (result: T) => R): Promise<ApiResult<R>> {
    try {
      const response = await call();
      const debugId = header(response.headers, 'paypal-debug-id');
      console.info(JSON.stringify({ operation, requestId, debugId, httpStatus: response.statusCode }));
      return { resource: map(response.result), debugId, httpStatus: response.statusCode };
    } catch (error) {
      if (error instanceof PayPalError) throw error;
      let code = 'PAYPAL_NETWORK_OR_RESPONSE_ERROR';
      let httpStatus: number | undefined;
      let debugId: string | undefined;
      if (error instanceof ApiError) {
        httpStatus = error.statusCode;
        debugId = header(error.headers, 'paypal-debug-id');
        try {
          const body = typeof error.body === 'string' ? JSON.parse(error.body) : error.body;
          code = safeCode(body?.details?.[0]?.issue) ?? safeCode(body?.name) ?? 'PAYPAL_API_ERROR';
        } catch { code = 'PAYPAL_API_ERROR'; }
      }
      console.warn(JSON.stringify({ operation, requestId, debugId, httpStatus, code }));
      throw new PayPalError(code, httpStatus, debugId);
    }
  }
  createAuthorizationOrder(id: string, requestId: string, input?: AuthorizationOrderInput) {
    return this.call('create', requestId, () => this.orders.createOrder({
      paypalRequestId: requestId, prefer: 'return=representation',
      body: { intent: CheckoutPaymentIntent.Authorize, purchaseUnits: [{
        referenceId: id, customId: id, description: input?.description ?? 'Commit feasibility spike — Sandbox only',
        amount: input?.amount ?? { currencyCode: 'USD', value: '10.00' },
      }], ...(input ? {paymentSource:{paypal:{experienceContext:{brandName:'Commit Sandbox',
        returnUrl:input.returnUrl,cancelUrl:input.cancelUrl,userAction:PaypalExperienceUserAction.Continue,
        shippingPreference:PaypalWalletContextShippingPreference.NoShipping}}}} : {}) },
    }), order);
  }
  getOrder(id: string) { return this.call('getOrder', undefined, () => this.orders.getOrder({ id }), order); }
  authorizeOrder(id: string, requestId: string) {
    return this.call('authorize', requestId, () => this.orders.authorizeOrder({ id, paypalRequestId: requestId, prefer: 'return=representation' }), order);
  }
  getAuthorization(id: string) {
    return this.call('getAuthorization', undefined, () => this.payments.getAuthorizedPayment({ authorizationId: id }), authorization);
  }
  captureAuthorization(id: string, amount: string, requestId: string, mockCode?:'AUTHORIZATION_EXPIRED') {
    return this.call('capture', requestId, () => this.payments.captureAuthorizedPayment({ authorizationId: id,
      paypalRequestId: requestId, prefer: 'return=representation', ...(mockCode?{paypalMockResponse:JSON.stringify({mock_application_codes:mockCode})}:{}), body: { amount: { value: amount, currencyCode: 'USD' }, finalCapture: true },
    }), capture);
  }
  getCapture(id: string) { return this.call('getCapture', undefined, () => this.payments.getCapturedPayment({ captureId: id }), capture); }
  refundCapture(id:string,requestId:string) {return this.call('refund',requestId,()=>this.payments.refundCapturedPayment({captureId:id,paypalRequestId:requestId,prefer:'return=representation',body:{}}),refund);}
  getRefund(id:string) {return this.call('getRefund',undefined,()=>this.payments.getRefund({refundId:id}),refund);}
  voidAuthorization(id: string, requestId: string) {
    return this.call('void', requestId, () => this.payments.voidPayment({ authorizationId: id, paypalRequestId: requestId, prefer: 'return=representation' }),
      value => value ? authorization(value) : null);
  }
}
