import {invoiceInput,paymentInput,voidInput,billingRequestSignature} from '../server/billing-input.mjs';
export type PendingBilling={requestId:string;kind:'invoice'|'payment'|'void';invoiceId:string|null;body:Record<string,string|boolean>};
const key=(scope:string)=>`understood:billing:${scope}`;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function pendingBillingSignature(value:PendingBilling) {
  const input={...value.body,requestId:value.requestId};
  // A receipt's accepted date must not change meaning when the local clock moves backwards.
  const normalized=value.kind==='invoice'?invoiceInput(input):value.kind==='void'?voidInput(input):paymentInput(input,new Date('9999-12-31T23:59:59.999Z'));
  return billingRequestSignature(value.kind,value.requestId,value.kind==='invoice'?value.requestId:value.invoiceId,normalized);
}
export async function checkedBillingReceipt(value:unknown,pending:PendingBilling):Promise<string|null> {
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('Billing receipt cannot be verified.');
  const receipt=value as {found?:unknown;kind?:unknown;id?:unknown;invoiceId?:unknown;requestHash?:unknown};
  if(receipt.found===false && Object.keys(receipt).length===1)return null;
  if(receipt.found!==true || Object.keys(receipt).some(key=>!['found','kind','id','invoiceId','requestHash'].includes(key))
    || receipt.kind!==pending.kind || receipt.id!==pending.requestId || receipt.invoiceId!==(pending.kind==='invoice'?pending.requestId:pending.invoiceId)
    || typeof receipt.requestHash!=='string' || !/^[a-f0-9]{64}$/.test(receipt.requestHash))throw Error('Billing receipt does not match this request.');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pendingBillingSignature(pending)));
  const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hash!==receipt.requestHash)throw Error('Billing receipt intent does not match the saved request.');
  return receipt.invoiceId as string;
}
export function checkedBillingResult(value:unknown,pending:PendingBilling) {
  const result=value as {id?:unknown;duplicate?:unknown};
  if(!result || typeof result!=='object' || Array.isArray(result) || result.id!==pending.requestId || typeof result.duplicate!=='boolean')throw Error('Billing acknowledgement does not match the saved request.');
  return result;
}
export function readPendingBilling(storage:Store,scope:string):PendingBilling|null {
  const raw=storage.getItem(key(scope));if(!raw) return null;
  const invalid=()=>new Error('Pending billing record cannot be read. Do not re-enter the payment; check its invoice ledger first.');
  if(raw.length>5000) throw invalid();
  let value:PendingBilling;try {value=JSON.parse(raw) as PendingBilling;}catch {throw invalid();}
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(name=>!['requestId','kind','invoiceId','body'].includes(name))
    || !/^[0-9a-f-]{36}$/i.test(value.requestId) || !['invoice','payment','void'].includes(value.kind)
    || (value.kind!=='invoice' ? typeof value.invoiceId!=='string' || !/^[0-9a-f-]{36}$/i.test(value.invoiceId) : value.invoiceId!==null)
    || !value.body || typeof value.body!=='object' || Array.isArray(value.body) || value.body.confirmed!==true
    || Object.entries(value.body).some(([name,item])=>!['amount','date','reference','note','number','description','issueDate','dueDate','reason','confirmed'].includes(name) || (name==='confirmed' ? item!==true : typeof item!=='string' || item.length>500))
    || typeof value.body.amount!=='string') throw invalid();
  try{pendingBillingSignature(value);}catch{throw invalid();}return value;
}
export function savePendingBilling(storage:Store,scope:string,pending:PendingBilling) {
  const old=readPendingBilling(storage,scope);
  const signature=pendingBillingSignature(pending);
  if(old && (old.requestId!==pending.requestId || pendingBillingSignature(old)!==signature)) throw new Error('Recover the pending billing record before creating another or changing its intent.');
  storage.setItem(key(scope),JSON.stringify(pending));
  if(storage.getItem(key(scope))!==JSON.stringify(pending)) throw new Error('This tab cannot retain the billing request safely. No request was sent.');
}
export function clearPendingBilling(storage:Store,scope:string,id:string,expected?:PendingBilling) {
  const old=readPendingBilling(storage,scope);if(old && old.requestId!==id) throw new Error('Another billing request is pending.');
  if(expected && (!old || pendingBillingSignature(old)!==pendingBillingSignature(expected)))throw Error('Pending billing intent changed.');
  storage.removeItem(key(scope));
  if(storage.getItem(key(scope))) throw new Error('Pending billing receipt could not be cleared.');
}
