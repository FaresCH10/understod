import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createSessionContextFetch} from './helpers/session-http.mjs';
const fetch=createSessionContextFetch();
import {billingRequestSignature,voidInput,paymentInput} from '../server/billing-input.mjs';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createInvoice,recordPayment,voidInvoice,getInvoice,listInvoices,billingReceipt} from '../server/postgres/billing.mjs';
import {provisionStaffCredential} from '../server/postgres/auth.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
const options={schema:'understood_test_billing',integrationMode:'synthetic'};
const owner={principal_type:'staff',principal_id:'owner',org_id:'a',site_id:'a',role:'owner'};
const invoice=()=>({requestId:randomUUID(),number:'INV-001',description:'Synthetic pilot service',issueDate:'2026-10-01',dueDate:'2026-10-10',amount:'25.00',confirmed:true});
const payment=()=>({requestId:randomUUID(),reference:'Synthetic transfer',note:'Disposable record only',date:'2026-10-01',amount:'10.10',confirmed:true});
const cancellation=()=>({requestId:randomUUID(),number:'INV-001',amount:'25.00',reason:'Synthetic issue error',confirmed:true});
async function fixture() {
  const db=new PGlite();let failure='',lost=false;
  const pool={async connect(){return {async query(sql,values){if(failure && sql.includes(failure)) throw new Error('Injected failure');const result=values?.length ? await db.query(sql,values) : (await db.exec(sql)).at(-1) || {rows:[]};if(lost && sql==='COMMIT'){lost=false;throw new Error('Commit acknowledgment lost');}return result;},release(){}};}};
  await db.exec(`CREATE SCHEMA ${options.schema}; SET search_path TO ${options.schema},pg_catalog`);await runMigrations(pool,options);
  await db.query("INSERT INTO organizations VALUES('a','Original issuer'),('b','Other issuer')");
  await db.query("INSERT INTO sites VALUES('a','a','Original site','UTC'),('b','b','Other site','UTC')");
  await db.query("INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','a','a','Owner','owner'),('auditor','a','a','Auditor','auditor'),('supervisor','a','a','Supervisor','supervisor'),('other','b','b','Other','owner')");
  return {db,pool,fail(value){failure=value;},loseCommit(){lost=true;}};
}

test('PostgreSQL unpaid void survives lost commit receipt, blocks payments and preserves original evidence',async()=>{
  const f=await fixture(),{db,pool}=f;
  try {
    const created=await createInvoice(pool,owner,invoice(),options),input=cancellation();
    await assert.rejects(voidInvoice(pool,owner,created.id,{...input,amount:'24.99'},options),/details changed/);
    f.fail('INSERT INTO audit');await assert.rejects(voidInvoice(pool,owner,created.id,input,options),/Injected/);f.fail('');
    assert.equal((await getInvoice(pool,owner,created.id,{},options)).status,'unpaid');
    f.loseCommit();await assert.rejects(voidInvoice(pool,owner,created.id,input,options),/acknowledgment lost/);
    assert.equal((await voidInvoice(pool,owner,created.id,{...input,amount:'25'},options)).duplicate,true);
    await assert.rejects(voidInvoice(pool,owner,created.id,{...input,reason:'Changed'},options),/conflict/);
    await assert.rejects(voidInvoice(pool,owner,created.id,{...input,requestId:randomUUID()},options),/voided/);
    const detail=await getInvoice(pool,owner,created.id,{},options);assert.equal(detail.amountCents,2500);assert.equal(detail.voidedCents,2500);assert.equal(detail.paidCents,0);assert.equal(detail.balanceCents,0);assert.equal(detail.status,'void');assert.equal(detail.voidRecord.reason,input.reason);
    assert.equal((await listInvoices(pool,owner,{status:'void'},options)).total,1);assert.equal((await listInvoices(pool,owner,{status:'unpaid'},options)).total,0);assert.equal((await listInvoices(pool,owner,{status:'paid'},options)).total,0);
    assert.deepEqual(await billingReceipt(pool,owner,'void',input.requestId,options),{found:true,kind:'void',id:input.requestId,invoiceId:created.id,requestHash:createHash('sha256').update(billingRequestSignature('void',input.requestId,created.id,voidInput(input))).digest('hex')});
    await assert.rejects(recordPayment(pool,owner,created.id,payment(),options),/voided/);
    await assert.rejects(db.query("INSERT INTO invoice_payments(id,org_id,site_id,invoice_id,amount_cents,payment_date,reference,note,request_json,recorded_by) VALUES($1,'a','a',$2,1,'2026-10-01','Synthetic','','{}','owner')",[randomUUID(),created.id]),/voided/);
    for(const sql of ["UPDATE invoice_voids SET reason='Changed'",'DELETE FROM invoice_voids']) await assert.rejects(db.query(sql),/immutable/);
    const paid=await createInvoice(pool,owner,{...invoice(),number:'INV-002'},options);await recordPayment(pool,owner,paid.id,payment(),options);
    await assert.rejects(voidInvoice(pool,owner,paid.id,{...cancellation(),number:'INV-002'},options),/Only unpaid/);
    await assert.rejects(db.query("INSERT INTO invoice_voids(id,org_id,site_id,invoice_id,reason,request_json,created_by) VALUES($1,'a','a',$2,'Synthetic error','{}','owner')",[randomUUID(),paid.id]),/Only unpaid/);
    await assert.rejects(voidInvoice(pool,{...owner,principal_id:'auditor',role:'auditor'},created.id,input,options),/Forbidden/);
    await assert.rejects(voidInvoice(pool,{...owner,principal_id:'other',org_id:'b',site_id:'b'},created.id,input,options),/unavailable/);
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM audit WHERE action='invoice.voided'")).rows[0].n,1);
  } finally {await db.close();}
});
test('PostgreSQL invoice/payment ledger is immutable, exact-replayable and atomic with integer-cent balances',async()=>{
  const f=await fixture(),{db,pool}=f;
  try {
    const request=invoice();f.loseCommit();await assert.rejects(createInvoice(pool,owner,request,options),/acknowledgment lost/);
    const created=await createInvoice(pool,owner,{...request,amount:'25'},options);assert.equal(created.duplicate,true);
    await assert.rejects(createInvoice(pool,owner,{...request,description:'Changed'},options),/conflict/);
    const first=payment();f.loseCommit();await assert.rejects(recordPayment(pool,owner,created.id,first,options),/acknowledgment lost/);
    assert.equal((await recordPayment(pool,owner,created.id,first,options)).duplicate,true);
    assert.deepEqual(await billingReceipt(pool,owner,'payment',first.requestId,options),{found:true,kind:'payment',id:first.requestId,invoiceId:created.id,requestHash:createHash('sha256').update(billingRequestSignature('payment',first.requestId,created.id,paymentInput(first))).digest('hex')});
    assert.equal((await billingReceipt(pool,owner,'invoice',randomUUID(),options)).found,false);
    let detail=await getInvoice(pool,owner,created.id,{},options);assert.equal(detail.paidCents,1010);assert.equal(detail.balanceCents,1490);assert.equal(detail.status,'partial');
    await assert.rejects(recordPayment(pool,owner,created.id,{...first,amount:'10.11'},options),/conflict/);
    await assert.rejects(recordPayment(pool,owner,created.id,{...payment(),amount:'14.91'},options),/balance/);
    f.fail('INSERT INTO audit');await assert.rejects(recordPayment(pool,owner,created.id,{...payment(),amount:'14.90'},options),/Injected/);f.fail('');
    assert.equal((await getInvoice(pool,owner,created.id,{},options)).balanceCents,1490);
    await recordPayment(pool,owner,created.id,{...payment(),amount:'14.90'},options);
    detail=await getInvoice(pool,owner,created.id,{},options);assert.equal(detail.balanceCents,0);assert.equal(detail.status,'paid');assert.equal(detail.payments.length,2);
    assert.equal((await recordPayment(pool,owner,created.id,first,options)).duplicate,true);
    assert.equal((await listInvoices(pool,owner,{status:'paid'},options)).total,1);
    await db.query("UPDATE organizations SET name='Renamed' WHERE id='a'");await db.query("UPDATE sites SET name='Renamed' WHERE id='a'");
    assert.equal((await getInvoice(pool,owner,created.id,{},options)).issuerName,'Original issuer');assert.equal(detail.siteName,'Original site');
    for(const table of ['invoices','invoice_payments']) for(const statement of [`UPDATE ${table} SET org_id='b'`,`DELETE FROM ${table}`]) await assert.rejects(db.query(statement),/immutable/);
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM audit WHERE action='invoice.payment_recorded'")).rows[0].n,2);
    const auditor={...owner,principal_id:'auditor',role:'auditor'};assert.equal((await getInvoice(pool,auditor,created.id,{},options)).balanceCents,0);
    await assert.rejects(createInvoice(pool,auditor,invoice(),options),/Forbidden/);
    await assert.rejects(billingReceipt(pool,auditor,'invoice',created.id,options),/Forbidden/);
    assert.equal((await billingReceipt(pool,{...owner,principal_id:'other',org_id:'b',site_id:'b'},'invoice',created.id,options)).found,false);
    for(const session of [{...owner,principal_id:'supervisor',role:'supervisor'},{...owner,principal_type:'worker'},{...owner,principal_id:'missing'}]) await assert.rejects(getInvoice(pool,session,created.id,{},options),/Forbidden/);
    await assert.rejects(getInvoice(pool,{...owner,principal_id:'other',org_id:'b',site_id:'b'},created.id,{},options),/unavailable/);
    assert.ok(!JSON.stringify(detail).includes('request_json'));
  } finally {await db.close();}
});
test('PostgreSQL invoice pages and private HTTP routes expose real totals without charging money',async()=>{
  const f=await fixture(),{db,pool}=f;
  try {
    await db.query(`INSERT INTO invoices(id,org_id,site_id,number,description,issue_date,due_date,amount_cents,currency,request_json,created_by,issuer_name,site_name)
      SELECT 'invoice-' || i,'a','a','INV-' || i,'Synthetic invoice','2026-10-01','2026-10-10',2500,'USD','{}','owner','Original issuer','Original site' FROM generate_series(1,125) i`);
    const first=await listInvoices(pool,owner,{pageSize:100},options),second=await listInvoices(pool,owner,{page:2,pageSize:100},options);
    assert.equal(first.total,125);assert.equal(first.items.length,100);assert.equal(second.items.length,25);assert.equal(new Set([...first.items,...second.items].map(row=>row.id)).size,125);
    assert.equal((await listInvoices(pool,owner,{search:'%'},options)).total,0);
    await provisionStaffCredential(pool,{staffId:'owner',orgId:'a',siteId:'a',email:'owner@example.test',password:'Synthetic-only-password-123'},options);
    const server=createPostgresRehearsalServer(pool,{schema:options.schema,tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:'http://127.0.0.1:3020'});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;
    const call=(path,cookie,body)=>fetch(base+path,{method:body ? 'POST' : 'GET',headers:{...(cookie ? {cookie} : {}),'content-type':'application/json',origin:'http://127.0.0.1:3020'},body:body ? JSON.stringify(body) : undefined});
    try {
      const login=await call('/auth/staff/login',null,{email:'owner@example.test',password:'Synthetic-only-password-123'}),cookie=login.headers.get('set-cookie').split(';')[0];
      const request={...invoice(),number:'HTTP-001'},created=await call('/invoices',cookie,request);assert.equal(created.status,201);const {id}=await created.json();
      assert.equal((await call('/invoices',cookie,request)).status,200);assert.equal((await call(`/invoices/${id}/payments`,cookie,payment())).status,201);
      const receipt=await call(`/invoices/requests/invoice/${request.requestId}`,cookie);assert.equal(receipt.status,200);assert.equal((await receipt.json()).invoiceId,id);assert.match(receipt.headers.get('cache-control'),/no-store/);
      const detail=await call(`/invoices/${id}`,cookie);assert.equal(detail.status,200);assert.match(detail.headers.get('cache-control'),/no-store/);assert.equal((await detail.json()).balanceCents,1490);
      const download=await call(`/invoices/${id}/download`,cookie);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);assert.match(await download.text(),/\$14\.90/);
      assert.equal((await call('/invoices?status=bad',cookie)).status,400);assert.equal((await call('/invoices/missing',cookie)).status,404);assert.equal((await call('/invoices',null)).status,401);
      assert.equal((await call(`/invoices/${id}/payments`,cookie,{...payment(),amount:'99.00'})).status,409);
      const fresh={...invoice(),number:'HTTP-VOID'},voidId=(await (await call('/invoices',cookie,fresh)).json()).id,input={...cancellation(),number:'HTTP-VOID'};
      assert.equal((await call(`/invoices/${voidId}/void`,cookie,{...input,confirmed:false})).status,400);
      assert.equal((await call(`/invoices/${voidId}/void`,cookie,input)).status,201);assert.equal((await call(`/invoices/${voidId}/void`,cookie,input)).status,200);
      assert.equal((await call(`/invoices/${id}/void`,cookie,{...input,number:'HTTP-001',requestId:randomUUID()})).status,409);
      assert.equal((await call(`/invoices/${voidId}/payments`,cookie,payment())).status,409);
      assert.equal((await (await call(`/invoices/requests/void/${input.requestId}`,cookie)).json()).invoiceId,voidId);
      assert.match(await (await call(`/invoices/${voidId}/download`,cookie)).text(),/Voided amount/);
    } finally {await new Promise(resolve=>server.close(resolve));}
  } finally {await db.close();}
});
