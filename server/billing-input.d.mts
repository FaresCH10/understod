export type CanonicalBillingRequest=Record<string,string|number>;
export function invoiceInput(input:unknown):CanonicalBillingRequest;
export function paymentInput(input:unknown,now?:Date):CanonicalBillingRequest;
export function voidInput(input:unknown):CanonicalBillingRequest;
export function billingRequestSignature(kind:string,id:string,invoiceId:string|null,value:CanonicalBillingRequest):string;
