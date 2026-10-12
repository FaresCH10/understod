import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readPendingBilling,savePendingBilling,clearPendingBilling} from '../src/billing-recovery.ts';
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
