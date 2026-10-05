import type {PayPalGateway,CaptureGateway,Order,Authorization,Capture,Refund,AuthorizationOrderInput} from '../src/model.js';
import {PayPalError} from '../src/model.js';
const response=<T>(resource:T)=>({resource:structuredClone(resource),httpStatus:200});
export class OfferGateway implements PayPalGateway,CaptureGateway {
 orders=new Map<string,Order>();auths=new Map<string,Authorization>();captures=new Map<string,Capture>();refunds=new Map<string,Refund>();requests=new Map<string,string>();
 calls:{op:string;id:string;amount?:string}[]=[];voidFails=false;unconfirmedVoid=false;failCapture=0;
 async createAuthorizationOrder(id:string,key:string,input?:AuthorizationOrderInput){this.calls.push({op:'create',id});const o:Order={id:'O-'+id,status:'CREATED',intent:'AUTHORIZE',amount:input!.amount,unitCount:1,referenceId:id,customId:id,merchantId:'MERCHANT',authorizations:[],captures:[],approvalUrl:'https://www.sandbox.paypal.com/checkoutnow?token=O-'+id};this.orders.set(o.id,o);return response(o);}
 async getOrder(id:string){return response(this.orders.get(id)!);}
 async authorizeOrder(id:string,key:string){this.calls.push({op:'authorize',id});const o=this.orders.get(id)!;const a:Authorization={id:'A-'+id,status:'CREATED',amount:o.amount!,createTime:new Date().toISOString(),expirationTime:new Date(Date.now()+29*86400000).toISOString()};this.auths.set(a.id,a);o.status='COMPLETED';o.authorizations=[a];return response(o);}
 async getAuthorization(id:string){return response(this.auths.get(id)!);}
 async voidAuthorization(id:string,key:string){this.calls.push({op:'void',id});if(this.voidFails)throw new PayPalError('VOID_FAILED');if(!this.unconfirmedVoid)this.auths.get(id)!.status='VOIDED';return {resource:null,httpStatus:204};}
 async captureAuthorization(id:string,amount:string,key:string){this.calls.push({op:'capture',id,amount});if(this.calls.filter(c=>c.op==='capture').length===this.failCapture)throw new PayPalError('AUTHORIZATION_EXPIRED',422);const a=this.auths.get(id)!,o=[...this.orders.values()].find(o=>o.authorizations.some(a=>a.id===id))!;const c:Capture={id:this.requests.get(key)??'C-'+id,status:'COMPLETED',amount:{currencyCode:'USD',value:amount},authorizationId:id,orderId:o.id,finalCapture:true};this.requests.set(key,c.id);this.captures.set(c.id,c);a.status='CAPTURED';o.captures=[c];return response(c);}
 async getCapture(id:string){return response(this.captures.get(id)!);}
 async refundCapture(id:string,key:string){const c=this.captures.get(id)!,r:Refund={id:'R-'+id,status:'COMPLETED',amount:c.amount,captureId:id};this.refunds.set(r.id,r);c.status='REFUNDED';this.orders.get(c.orderId!)!.refunds=[r];return response(r);}
 async getRefund(id:string){return response(this.refunds.get(id)!);}
}
