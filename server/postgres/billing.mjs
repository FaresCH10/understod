import {domainTransaction,requirePrincipal,domainAudit} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {invoiceInput,paymentInput,voidInput,invoiceFilters,paymentFilters,invoiceTotals,invoiceView,sameBillingRequest,billingRequestId} from '../billing-input.mjs';

const paid=`COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payments p WHERE p.invoice_id=i.id AND p.org_id=i.org_id AND p.site_id=i.site_id),0)`;
const voided=`CASE WHEN EXISTS(SELECT 1 FROM invoice_voids v WHERE v.invoice_id=i.id AND v.org_id=i.org_id AND v.site_id=i.site_id) THEN i.amount_cents ELSE 0 END`;
const columns=`i.id,i.number,i.description,i.issue_date::text AS issue_date,i.due_date::text AS due_date,i.amount_cents,i.currency,i.created_at,i.issuer_name,i.site_name,${paid} AS paid_cents,${voided} AS voided_cents`;
async function scoped(client,session,id,lock=false) {
  const row=(await client.query(`SELECT ${columns} FROM invoices i WHERE i.id=$1 AND i.org_id=$2 AND i.site_id=$3 ${lock ? 'FOR UPDATE OF i' : ''}`,[id,session.org_id,session.site_id])).rows[0];
  if(!row) throw new Error('Invoice unavailable');return row;
}
export async function createInvoice(pool,session,input,{schema='public'}={}) {
  const value=invoiceInput(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner']);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`invoice:${session.org_id}:${session.site_id}:${input.requestId}`]);
    const old=(await client.query('SELECT id,request_json FROM invoices WHERE id=$1 AND org_id=$2 AND site_id=$3',[input.requestId,session.org_id,session.site_id])).rows[0];
    if(old) {if(!sameBillingRequest(old.request_json,value)) throw new Error('Invoice request conflict');return {id:old.id,duplicate:true};}
    try {
      await client.query(`INSERT INTO invoices(id,org_id,site_id,number,description,issue_date,due_date,amount_cents,currency,request_json,created_by,issuer_name,site_name)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,o.name,s.name FROM organizations o JOIN sites s ON s.org_id=o.id WHERE o.id=$2 AND s.id=$3`,
        [input.requestId,session.org_id,session.site_id,value.number,value.description,value.issueDate,value.dueDate,value.amountCents,value.currency,JSON.stringify(value),session.principal_id]);
    } catch(error) {if(error.code==='23505') throw new Error('Invoice number or request already exists');throw error;}
    await domainAudit(client,session,'invoice.created',input.requestId);return {id:input.requestId,duplicate:false};
  });
}
export async function recordPayment(pool,session,id,input,{schema='public'}={}) {
  const value=paymentInput(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner']);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`payment:${session.org_id}:${session.site_id}:${input.requestId}`]);
    const invoice=await scoped(client,session,id,true);
    const old=(await client.query('SELECT id,invoice_id,request_json FROM invoice_payments WHERE id=$1 AND org_id=$2 AND site_id=$3',[input.requestId,session.org_id,session.site_id])).rows[0];
    if(old) {if(old.invoice_id!==id || !sameBillingRequest(old.request_json,value)) throw new Error('Payment request conflict');return {id:old.id,duplicate:true};}
    if(invoiceTotals(invoice).status==='void') throw new Error('Invoice is voided');
    if(value.amountCents>invoiceTotals(invoice).balanceCents) throw new Error('Payment exceeds outstanding balance');
    try {
      await client.query(`INSERT INTO invoice_payments(id,org_id,site_id,invoice_id,amount_cents,payment_date,reference,note,request_json,recorded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[input.requestId,session.org_id,session.site_id,id,value.amountCents,value.date,value.reference,value.note,JSON.stringify(value),session.principal_id]);
    } catch(error) {if(error.code==='23505') throw new Error('Payment request conflict');throw error;}
    await domainAudit(client,session,'invoice.payment_recorded',input.requestId);return {id:input.requestId,duplicate:false};
  });
}
export async function voidInvoice(pool,session,id,input,{schema='public'}={}) {
  const value=voidInput(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner']);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`void:${session.org_id}:${session.site_id}:${input.requestId}`]);
    await scoped(client,session,id,true);
    // Read again after the lock in case another payment or void committed while waiting.
    const invoice=await scoped(client,session,id);
    const old=(await client.query('SELECT id,invoice_id,request_json FROM invoice_voids WHERE id=$1 AND org_id=$2 AND site_id=$3',[input.requestId,session.org_id,session.site_id])).rows[0];
    if(old) {if(old.invoice_id!==id || !sameBillingRequest(old.request_json,value)) throw new Error('Invoice void request conflict');return {id:old.id,duplicate:true};}
    if(invoice.number!==value.number || invoice.amount_cents!==value.amountCents) throw new Error('Invoice details changed');
    if(invoiceTotals(invoice).status==='void') throw new Error('Invoice is voided');
    if(Number(invoice.paid_cents)!==0) throw new Error('Only unpaid invoices can be voided');
    try {await client.query(`INSERT INTO invoice_voids(id,org_id,site_id,invoice_id,reason,request_json,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[input.requestId,session.org_id,session.site_id,id,value.reason,JSON.stringify(value),session.principal_id]);}
    catch(error) {if(error.code==='23505') throw new Error('Invoice void request conflict');throw error;}
    await domainAudit(client,session,'invoice.voided',input.requestId);return {id:input.requestId,duplicate:false};
  });
}
export async function getInvoice(pool,session,id,input={},{schema='public'}={}) {
  const {page,pageSize}=paymentFilters(input);
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','auditor']);const row=await scoped(client,session,id);
    const paymentCount=(await client.query('SELECT COUNT(*)::int AS total FROM invoice_payments WHERE invoice_id=$1 AND org_id=$2 AND site_id=$3',[id,session.org_id,session.site_id])).rows[0].total;
    const payments=(await client.query(`SELECT id,amount_cents AS "amountCents",payment_date::text AS date,reference,note,recorded_at AS "recordedAt"
      FROM invoice_payments WHERE invoice_id=$1 AND org_id=$2 AND site_id=$3 ORDER BY recorded_at DESC,id LIMIT $4 OFFSET $5`,[id,session.org_id,session.site_id,pageSize,(page-1)*pageSize])).rows.map(row=>({...row,recordedAt:row.recordedAt.toISOString()}));
    const record=(await client.query('SELECT reason,created_at AS "createdAt" FROM invoice_voids WHERE invoice_id=$1 AND org_id=$2 AND site_id=$3',[id,session.org_id,session.site_id])).rows[0];
    const voidRecord=record ? {...record,createdAt:record.createdAt.toISOString()} : null;
    return {...invoiceView(row),voidRecord,payments,paymentCount,paymentPage:page,paymentPageSize:pageSize};
  });
}
export async function listInvoices(pool,session,input={},{schema='public'}={}) {
  const {search,status,page,pageSize}=invoiceFilters(input);
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','auditor']);
    const row=(await client.query(`WITH scoped AS (SELECT ${columns} FROM invoices i WHERE i.org_id=$1 AND i.site_id=$2),
      filtered AS (SELECT * FROM scoped WHERE ($3='' OR strpos(lower(number || ' ' || description),lower($3))>0)
        AND ($4='all' OR ($4='paid' AND paid_cents=amount_cents) OR ($4='partial' AND paid_cents>0 AND paid_cents<amount_cents) OR ($4='unpaid' AND paid_cents=0 AND voided_cents=0) OR ($4='void' AND voided_cents>0)))
      SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
        (SELECT COALESCE(jsonb_agg(result ORDER BY result.created_at DESC,result.id),'[]') FROM (SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT $5 OFFSET $6) result) AS items`,
      [session.org_id,session.site_id,search,status,pageSize,(page-1)*pageSize])).rows[0];
    return {items:row.items.map(invoiceView),total:row.total,page,pageSize};
  });
}
export async function billingReceipt(pool,session,kind,id,{schema='public'}={}) {
  billingRequestId(kind,id);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner']);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${kind}:${session.org_id}:${session.site_id}:${id}`]);
    const row=(await client.query(kind==='invoice' ? 'SELECT id,id AS "invoiceId" FROM invoices WHERE id=$1 AND org_id=$2 AND site_id=$3 AND created_by=$4'
      : kind==='void' ? 'SELECT id,invoice_id AS "invoiceId" FROM invoice_voids WHERE id=$1 AND org_id=$2 AND site_id=$3 AND created_by=$4'
      : 'SELECT id,invoice_id AS "invoiceId" FROM invoice_payments WHERE id=$1 AND org_id=$2 AND site_id=$3 AND recorded_by=$4',[id,session.org_id,session.site_id,session.principal_id])).rows[0];
    return row ? {found:true,kind,...row} : {found:false};
  });
}
