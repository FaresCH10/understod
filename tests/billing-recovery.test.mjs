import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readPendingBilling,savePendingBilling,clearPendingBilling,pendingBillingSignature,checkedBillingReceipt,checkedBillingResult} from '../src/billing-recovery.ts';
import {createHash} from 'node:crypto';
function store() {const rows=new Map();return {getItem:key=>rows.get(key) || null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};}
const pending=()=>({requestId:randomUUID(),kind:'payment',invoiceId:randomUUID(),body:{amount:'10.10',date:'2026-10-05',reference:'Synthetic received payment',note:'',confirmed:true}});
test('pending billing requests survive reload reads, remain principal/site scoped and never overwrite uncertainty',()=>{
  const storage=store(),one=pending();savePendingBilling(storage,'owner-a/site-a',one);
  assert.deepEqual(readPendingBilling(storage,'owner-a/site-a'),one);assert.equal(readPendingBilling(storage,'owner-b/site-a'),null);assert.equal(readPendingBilling(storage,'owner-a/site-b'),null);
  assert.throws(()=>savePendingBilling(storage,'owner-a/site-a',pending()),/Recover/);assert.throws(()=>clearPendingBilling(storage,'owner-a/site-a',randomUUID()),/Another/);
  clearPendingBilling(storage,'owner-a/site-a',one.requestId);assert.equal(readPendingBilling(storage,'owner-a/site-a'),null);
  storage.setItem('understood:billing:bad',JSON.stringify({...one,body:{...one.body,token:'secret'}}));assert.throws(()=>readPendingBilling(storage,'bad'),/cannot be read/);
  assert.throws(()=>savePendingBilling({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},'owner',one),/No request was sent/);
  const cancellation={...pending(),kind:'void',body:{number:'INV-001',amount:'25.00',reason:'Synthetic invoice error',confirmed:true}};
  savePendingBilling(storage,'owner-a/site-a',cancellation);assert.deepEqual(readPendingBilling(storage,'owner-a/site-a'),cancellation);
  clearPendingBilling(storage,'owner-a/site-a',cancellation.requestId);
});

test('billing intent is normalized, cannot be overwritten under the same ID and is checked again before cleanup',()=>{
  const storage=store(),one=pending();savePendingBilling(storage,'owner',one);
  const equivalent={...one,body:{...one.body,amount:'10.1'}};assert.equal(pendingBillingSignature(one),pendingBillingSignature(equivalent));
  for(const changed of [{...one,body:{...one.body,amount:'10.11'}},{...one,invoiceId:randomUUID()},{...one,body:{...one.body,reference:'Changed'}}]){
    assert.throws(()=>savePendingBilling(storage,'owner',changed),/Recover/);assert.throws(()=>clearPendingBilling(storage,'owner',one.requestId,changed),/intent changed/);
  }
  assert.deepEqual(readPendingBilling(storage,'owner'),one);clearPendingBilling(storage,'owner',one.requestId,one);
});

test('billing recovery verifies exact receipt ID/target/canonical intent, never a raw acknowledgement or private payload',async()=>{
  for(const one of [pending(),{requestId:randomUUID(),kind:'invoice',invoiceId:null,body:{number:'INV-003',description:'Synthetic service',issueDate:'2026-10-01',dueDate:'2026-10-10',amount:'25.00',confirmed:true}},{...pending(),kind:'void',body:{number:'INV-001',amount:'25',reason:'Synthetic error',confirmed:true}}]) {
    const invoiceId=one.kind==='invoice'?one.requestId:one.invoiceId;
    const receipt={found:true,kind:one.kind,id:one.requestId,invoiceId,requestHash:createHash('sha256').update(pendingBillingSignature(one)).digest('hex')};
    assert.equal(await checkedBillingReceipt(receipt,one),invoiceId);assert.equal(await checkedBillingReceipt({found:false},one),null);
    for(const patch of [{id:randomUUID()},{invoiceId:randomUUID()},{kind:'other'},{requestHash:'0'.repeat(64)},{request_json:one.body}])await assert.rejects(checkedBillingReceipt({...receipt,...patch},one),/match/);
    assert.equal(checkedBillingResult({id:one.requestId,duplicate:false},one).id,one.requestId);
    assert.throws(()=>checkedBillingResult({id:randomUUID(),duplicate:false},one),/match/);
    await assert.rejects(checkedBillingReceipt({found:false,id:one.requestId},one));
  }
});
