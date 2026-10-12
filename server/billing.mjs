import {randomUUID} from 'node:crypto';
import {NOW,transaction} from './db.mjs';
import {invoiceInput,paymentInput,voidInput,invoiceFilters,paymentFilters,invoiceTotals,invoiceView,billingRequestId} from './billing-input.mjs';

export function ensureBillingSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    number TEXT NOT NULL,description TEXT NOT NULL,issue_date TEXT NOT NULL,due_date TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000),currency TEXT NOT NULL CHECK(currency='USD'),
    request_json TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES staff(id),created_at TEXT NOT NULL,issuer_name TEXT NOT NULL,site_name TEXT NOT NULL,
    UNIQUE(org_id,site_id,number),CHECK(due_date>=issue_date)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS invoice_voids (
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(id),reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 500),
    request_json TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES staff(id),created_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS invoice_payments (
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),invoice_id TEXT NOT NULL REFERENCES invoices(id),
    amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000),payment_date TEXT NOT NULL,reference TEXT NOT NULL,note TEXT NOT NULL,
    request_json TEXT NOT NULL,recorded_by TEXT NOT NULL REFERENCES staff(id),recorded_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS invoice_payment_total ON invoice_payments(invoice_id,org_id,site_id);
  CREATE TRIGGER IF NOT EXISTS invoices_scope BEFORE INSERT ON invoices WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.created_by AND org_id=NEW.org_id AND site_id=NEW.site_id)
    OR NOT EXISTS(SELECT 1 FROM sites WHERE id=NEW.site_id AND org_id=NEW.org_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS invoice_payments_scope BEFORE INSERT ON invoice_payments WHEN
    NOT EXISTS(SELECT 1 FROM invoices WHERE id=NEW.invoice_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    OR NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.recorded_by AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS invoice_payments_balance BEFORE INSERT ON invoice_payments WHEN
    NEW.amount_cents+COALESCE((SELECT SUM(amount_cents) FROM invoice_payments WHERE invoice_id=NEW.invoice_id),0)>(SELECT amount_cents FROM invoices WHERE id=NEW.invoice_id)
    BEGIN SELECT RAISE(ABORT,'Payment exceeds outstanding balance'); END;
  CREATE TRIGGER IF NOT EXISTS invoice_voids_scope BEFORE INSERT ON invoice_voids WHEN
    NOT EXISTS(SELECT 1 FROM invoices WHERE id=NEW.invoice_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    OR NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.created_by AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS invoice_voids_unpaid BEFORE INSERT ON invoice_voids WHEN
    EXISTS(SELECT 1 FROM invoice_payments WHERE invoice_id=NEW.invoice_id)
    BEGIN SELECT RAISE(ABORT,'Only unpaid invoices can be voided'); END;
  CREATE TRIGGER IF NOT EXISTS invoice_payments_not_void BEFORE INSERT ON invoice_payments WHEN
    EXISTS(SELECT 1 FROM invoice_voids WHERE invoice_id=NEW.invoice_id)
    BEGIN SELECT RAISE(ABORT,'Invoice is voided'); END;`);
  for(const table of ['invoices','invoice_payments','invoice_voids']) for(const action of ['UPDATE','DELETE']) db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_frozen_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Invoice record is immutable'); END;`);
}
function authority(db,session,write=false) {
  if(session?.principal_type!=='staff' || !(write ? ['owner'] : ['owner','auditor']).includes(session.role)
    || !db.prepare('SELECT id FROM staff WHERE id=? AND org_id=? AND site_id=? AND role=? AND active=1').get(session.principal_id,session.org_id,session.site_id,session.role)) throw new Error('Forbidden');
}
const paid=`COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payments p WHERE p.invoice_id=i.id AND p.org_id=i.org_id AND p.site_id=i.site_id),0)`;
const voided=`CASE WHEN EXISTS(SELECT 1 FROM invoice_voids v WHERE v.invoice_id=i.id AND v.org_id=i.org_id AND v.site_id=i.site_id) THEN i.amount_cents ELSE 0 END`;
function scoped(db,session,id) {
  const row=db.prepare(`SELECT i.*,${paid} AS paid_cents,${voided} AS voided_cents FROM invoices i WHERE i.id=? AND i.org_id=? AND i.site_id=?`).get(id,session.org_id,session.site_id);
  if(!row) throw new Error('Invoice unavailable');return row;
}
function audit(db,session,action,id) {db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),session.org_id,session.site_id,'staff',session.principal_id,action,id,NOW());}
export function createInvoice(db,session,input) {
  const value=invoiceInput(input),payload=JSON.stringify(value);
  return transaction(db,()=>{
    authority(db,session,true);
    const old=db.prepare('SELECT * FROM invoices WHERE id=? AND org_id=? AND site_id=?').get(input.requestId,session.org_id,session.site_id);
    if(old) {if(old.request_json!==payload) throw new Error('Invoice request conflict');return {id:old.id,duplicate:true};}
    if(db.prepare('SELECT id FROM invoices WHERE number=? AND org_id=? AND site_id=?').get(value.number,session.org_id,session.site_id)) throw new Error('Invoice number already exists');
    const issuer=db.prepare('SELECT o.name AS issuer_name,s.name AS site_name FROM organizations o JOIN sites s ON s.org_id=o.id WHERE o.id=? AND s.id=?').get(session.org_id,session.site_id);
    db.prepare('INSERT INTO invoices VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(input.requestId,session.org_id,session.site_id,value.number,value.description,value.issueDate,value.dueDate,value.amountCents,value.currency,payload,session.principal_id,NOW(),issuer.issuer_name,issuer.site_name);
    audit(db,session,'invoice.created',input.requestId);return {id:input.requestId,duplicate:false};
  });
}
export function recordPayment(db,session,id,input) {
  const value=paymentInput(input),payload=JSON.stringify(value);
  return transaction(db,()=>{
    authority(db,session,true);const invoice=scoped(db,session,id);
    const old=db.prepare('SELECT * FROM invoice_payments WHERE id=? AND org_id=? AND site_id=?').get(input.requestId,session.org_id,session.site_id);
    if(old) {if(old.invoice_id!==id || old.request_json!==payload) throw new Error('Payment request conflict');return {id:old.id,duplicate:true};}
    if(invoiceTotals(invoice).status==='void') throw new Error('Invoice is voided');
    if(value.amountCents>invoiceTotals(invoice).balanceCents) throw new Error('Payment exceeds outstanding balance');
    db.prepare('INSERT INTO invoice_payments VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(input.requestId,session.org_id,session.site_id,id,value.amountCents,value.date,value.reference,value.note,payload,session.principal_id,NOW());
    audit(db,session,'invoice.payment_recorded',input.requestId);return {id:input.requestId,duplicate:false};
  });
}
export function voidInvoice(db,session,id,input) {
  const value=voidInput(input),payload=JSON.stringify(value);
  return transaction(db,()=>{
    authority(db,session,true);const invoice=scoped(db,session,id);
    const old=db.prepare('SELECT * FROM invoice_voids WHERE id=? AND org_id=? AND site_id=?').get(input.requestId,session.org_id,session.site_id);
    if(old) {if(old.invoice_id!==id || old.request_json!==payload) throw new Error('Invoice void request conflict');return {id:old.id,duplicate:true};}
    if(invoice.number!==value.number || invoice.amount_cents!==value.amountCents) throw new Error('Invoice details changed');
    if(invoiceTotals(invoice).status==='void') throw new Error('Invoice is voided');
    if(invoice.paid_cents!==0) throw new Error('Only unpaid invoices can be voided');
    db.prepare('INSERT INTO invoice_voids VALUES(?,?,?,?,?,?,?,?)').run(input.requestId,session.org_id,session.site_id,id,value.reason,payload,session.principal_id,NOW());
    audit(db,session,'invoice.voided',input.requestId);return {id:input.requestId,duplicate:false};
  });
}
export function getInvoice(db,session,id,input={}) {
  const {page,pageSize}=paymentFilters(input);
  return transaction(db,()=>{
    authority(db,session);const row=scoped(db,session,id);
    const paymentCount=db.prepare('SELECT COUNT(*) n FROM invoice_payments WHERE invoice_id=? AND org_id=? AND site_id=?').get(id,session.org_id,session.site_id).n;
    const payments=db.prepare('SELECT id,amount_cents AS amountCents,payment_date AS date,reference,note,recorded_at AS recordedAt FROM invoice_payments WHERE invoice_id=? AND org_id=? AND site_id=? ORDER BY recorded_at DESC,id LIMIT ? OFFSET ?').all(id,session.org_id,session.site_id,pageSize,(page-1)*pageSize);
    const voidRecord=db.prepare('SELECT reason,created_at AS createdAt FROM invoice_voids WHERE invoice_id=? AND org_id=? AND site_id=?').get(id,session.org_id,session.site_id) || null;
    return {...invoiceView(row),voidRecord,payments,paymentCount,paymentPage:page,paymentPageSize:pageSize};
  });
}
export function listInvoices(db,session,input={}) {
  const {search,status,page,pageSize}=invoiceFilters(input);authority(db,session);
  const row=db.prepare(`WITH scoped AS (SELECT i.*,${paid} AS paid_cents,${voided} AS voided_cents FROM invoices i WHERE i.org_id=? AND i.site_id=?),
    filtered AS (SELECT * FROM scoped WHERE (?='' OR instr(lower(number || ' ' || description),lower(?))>0)
      AND (?='all' OR (?='paid' AND paid_cents=amount_cents) OR (?='partial' AND paid_cents>0 AND paid_cents<amount_cents) OR (?='unpaid' AND paid_cents=0 AND voided_cents=0) OR (?='void' AND voided_cents>0)))
    SELECT (SELECT COUNT(*) FROM filtered) AS total,
      (SELECT json_group_array(json_object('id',id,'number',number,'description',description,'issue_date',issue_date,'due_date',due_date,
        'amount_cents',amount_cents,'paid_cents',paid_cents,'voided_cents',voided_cents,'currency',currency,'created_at',created_at,'issuer_name',issuer_name,'site_name',site_name)) FROM (SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT ? OFFSET ?)) AS items`)
    .get(session.org_id,session.site_id,search,search,status,status,status,status,status,pageSize,(page-1)*pageSize);
  return {items:JSON.parse(row.items).map(invoiceView),total:row.total,page,pageSize};
}
export function billingReceipt(db,session,kind,id) {
  billingRequestId(kind,id);authority(db,session,true);
  const row=db.prepare(kind==='invoice' ? 'SELECT id,id AS invoiceId FROM invoices WHERE id=? AND org_id=? AND site_id=? AND created_by=?'
    : kind==='void' ? 'SELECT id,invoice_id AS invoiceId FROM invoice_voids WHERE id=? AND org_id=? AND site_id=? AND created_by=?'
    : 'SELECT id,invoice_id AS invoiceId FROM invoice_payments WHERE id=? AND org_id=? AND site_id=? AND recorded_by=?').get(id,session.org_id,session.site_id,session.principal_id);
  return row ? {found:true,kind,...row} : {found:false};
}
