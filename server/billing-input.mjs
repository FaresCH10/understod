const uuid=value=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const text=(value,max)=>typeof value==='string' && value.trim().length>0 && value.length<=max;
export function civilDate(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z'))
    && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
export function moneyCents(value) {
  if(typeof value!=='string' || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid USD amount');
  const [whole,fraction='']=value.split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(cents) || cents<1 || cents>1000000000) throw new Error('Invalid USD amount');
  return cents;
}
export function invoiceInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || !uuid(input.requestId) || input.confirmed!==true
    || typeof input.number!=='string' || !/^[A-Z0-9][A-Z0-9-]{0,39}$/.test(input.number)
    || !text(input.description,500) || !civilDate(input.issueDate) || !civilDate(input.dueDate) || input.dueDate<input.issueDate
    || Object.keys(input).some(key=>!['requestId','number','description','issueDate','dueDate','amount','confirmed'].includes(key))) throw new Error('Invalid invoice request');
  return {number:input.number,description:input.description.trim(),issueDate:input.issueDate,dueDate:input.dueDate,amountCents:moneyCents(input.amount),currency:'USD'};
}
export function paymentInput(input,now=new Date()) {
  if(!input || typeof input!=='object' || Array.isArray(input) || !uuid(input.requestId) || input.confirmed!==true
    || !text(input.reference,120) || typeof input.note!=='string' || input.note.length>500 || !civilDate(input.date)
    || Object.keys(input).some(key=>!['requestId','reference','note','date','amount','confirmed'].includes(key))) throw new Error('Invalid payment request');
  if(input.date>now.toISOString().slice(0,10)) throw new Error('Payment date must not be in the future');
  return {reference:input.reference.trim(),note:input.note.trim(),date:input.date,amountCents:moneyCents(input.amount)};
}
export function voidInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || !uuid(input.requestId) || input.confirmed!==true
    || typeof input.number!=='string' || !/^[A-Z0-9][A-Z0-9-]{0,39}$/.test(input.number)
    || !text(input.reason,500) || input.reason.trim().length<3
    || Object.keys(input).some(key=>!['requestId','number','amount','reason','confirmed'].includes(key))) throw new Error('Invalid invoice void request');
  return {number:input.number,amountCents:moneyCents(input.amount),reason:input.reason.trim()};
}
export function invoiceFilters(input={}) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['search','status','page','pageSize'].includes(key))) throw new Error('Invalid invoice filter');
  const {search='',status='all'}=input,page=Number(input.page ?? 1),pageSize=Number(input.pageSize ?? 20);
  if(typeof search!=='string' || search.length>80 || !['all','unpaid','partial','paid','void'].includes(status) || !Number.isInteger(page) || page<1 || page>5000
    || !Number.isInteger(pageSize) || pageSize<1 || pageSize>100) throw new Error('Invalid invoice filter');
  return {search:search.trim(),status,page,pageSize};
}
export function paymentFilters(input={}) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['page','pageSize'].includes(key))) throw new Error('Invalid invoice filter');
  const {page,pageSize}=invoiceFilters(input);return {page,pageSize};
}
export function invoiceTotals(row) {
  const amountCents=Number(row.amount_cents),paidCents=Number(row.paid_cents || 0),voidedCents=Number(row.voided_cents || 0);
  if(!Number.isSafeInteger(amountCents) || amountCents<1 || !Number.isSafeInteger(paidCents) || paidCents<0 || paidCents>amountCents
    || !Number.isSafeInteger(voidedCents) || (voidedCents!==0 && (voidedCents!==amountCents || paidCents!==0))) throw new Error('Invoice ledger invalid');
  return {amountCents,paidCents,voidedCents,balanceCents:amountCents-paidCents-voidedCents,status:voidedCents ? 'void' : paidCents===amountCents ? 'paid' : paidCents ? 'partial' : 'unpaid'};
}
export function invoiceView(row) {
  return {id:row.id,number:row.number,description:row.description,issueDate:row.issue_date,dueDate:row.due_date,currency:row.currency,
    issuerName:row.issuer_name,siteName:row.site_name,createdAt:row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,...invoiceTotals(row)};
}
export function sameBillingRequest(old,value) {
  return old && Object.keys(old).length===Object.keys(value).length && Object.keys(value).every(key=>old[key]===value[key]);
}
export function billingRequestId(kind,value) {if(!['invoice','payment','void'].includes(kind) || !uuid(value)) throw new Error('Invalid billing request ID');return value;}
export function billingRequestSignature(kind,id,invoiceId,value) {
  billingRequestId(kind,id);
  if(!uuid(invoiceId) || !value || typeof value!=='object' || Array.isArray(value)
    || Object.values(value).some(item=>typeof item!=='string' && typeof item!=='number'))throw Error('Invalid billing receipt');
  return JSON.stringify(['understood:billing-intent:v1',kind,id,invoiceId,Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)]);
}
export const billingRecoveryScope=session=>session.principal_type==='staff' && session.role==='owner' ? JSON.stringify([session.org_id,session.site_id,session.principal_id]) : null;
