export type FlowType = 'VOID_TEST' | 'CAPTURE_TEST';
export type Operation = 'create' | 'authorize' | 'capture' | 'void';
export type State = 'NEW' | 'CREATED' | 'PAYER_APPROVED' | 'AUTHORIZED' | 'VOIDED' | 'CAPTURE_PENDING' | 'CAPTURED' | 'BLOCKED';
export type Money = { value: string; currencyCode: string };
export type Authorization = { id: string; status: string; amount: Money; expirationTime?: string; createTime?: string };
export type Capture = { id: string; status: string; amount: Money; authorizationId?:string; orderId?:string; finalCapture?:boolean; customId?:string };
export type Refund = {id:string;status:string;amount:Money;captureId?:string};
export type CaptureGateway = Pick<PayPalGateway,'getOrder'|'getAuthorization'|'getCapture'|'voidAuthorization'> & {
  captureAuthorization(id:string,amount:string,requestId:string,mockCode?:'AUTHORIZATION_EXPIRED'):Promise<ApiResult<Capture>>;
  refundCapture(id:string,requestId:string):Promise<ApiResult<Refund>>;
  getRefund(id:string):Promise<ApiResult<Refund>>;
};
export type Order = { id: string; status: string; intent?: string; amount?: Money; authorizations: Authorization[]; captures: Capture[];
  unitCount?: number; referenceId?: string; customId?: string; merchantId?: string; approvalUrl?: string;refunds?:Refund[] };
export type AuthorizationOrderInput = {amount: Money; description: string; returnUrl: string; cancelUrl: string};
export type ApiResult<T> = { resource: T; debugId?: string; httpStatus: number };
export type PaymentSpike = {
  id: string;
  clientKey: string;
  flowType: FlowType;
  amount: '10.00';
  currency: 'USD';
  state: State;
  paypalOrderId?: string;
  paypalAuthorizationId?: string;
  paypalCaptureId?: string;
  orderStatus?: string;
  authorizationStatus?: string;
  captureStatus?: string;
  capturedAmount?: string;
  authorizationCreatedAt?: string;
  authorizationExpiresAt?: string;
  pendingOperation?: Operation;
  verifiedAt?: string;
  lastError?: { code: string; operation: string; debugId?: string; httpStatus?: number };
  requests: Record<Operation, { id: string; firstAttemptAt?: string }>;
  events: { at: string; operation: string; status: string; resourceId?: string; requestId?: string; debugId?: string; httpStatus?: number }[];
  createdAt: string;
  updatedAt: string;
};

export interface PayPalGateway {
  createAuthorizationOrder(id: string, requestId: string, input?: AuthorizationOrderInput): Promise<ApiResult<Order>>;
  getOrder(id: string): Promise<ApiResult<Order>>;
  authorizeOrder(id: string, requestId: string): Promise<ApiResult<Order>>;
  getAuthorization(id: string): Promise<ApiResult<Authorization>>;
  captureAuthorization(id: string, amount: string, requestId: string): Promise<ApiResult<Capture>>;
  getCapture(id: string): Promise<ApiResult<Capture>>;
  voidAuthorization(id: string, requestId: string): Promise<ApiResult<Authorization | null>>;
}

export class SpikeError extends Error {
  constructor(public code: string, public httpStatus = 409, public debugId?: string) { super(code); }
}

export class PayPalError extends SpikeError {
  constructor(code: string, public paypalHttpStatus?: number, debugId?: string) { super(code, 502, debugId); }
}
