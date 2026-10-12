export type PendingBilling={requestId:string;kind:'invoice'|'payment'|'void';invoiceId:string|null;body:Record<string,string|boolean>};
const key=(scope:string)=>`understood:billing:${scope}`;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
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
  return value;
}
export function savePendingBilling(storage:Store,scope:string,pending:PendingBilling) {
  const old=readPendingBilling(storage,scope);
  if(old && old.requestId!==pending.requestId) throw new Error('Recover the pending billing record before creating another.');
  storage.setItem(key(scope),JSON.stringify(pending));
  if(storage.getItem(key(scope))!==JSON.stringify(pending)) throw new Error('This tab cannot retain the billing request safely. No request was sent.');
}
export function clearPendingBilling(storage:Store,scope:string,id:string) {
  const old=readPendingBilling(storage,scope);if(old && old.requestId!==id) throw new Error('Another billing request is pending.');
  storage.removeItem(key(scope));
  if(storage.getItem(key(scope))) throw new Error('Pending billing receipt could not be cleared.');
}
