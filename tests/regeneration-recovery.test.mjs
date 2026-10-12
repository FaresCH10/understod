import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readPendingRegeneration,savePendingRegeneration,clearPendingRegeneration,pendingRegenerationContent,checkedRegenerationResult,checkedRegenerationReceipt} from '../src/regeneration-recovery.ts';
const store=()=>{const values=new Map();return {getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const pending=()=>({requestId:randomUUID(),briefingId:'shelf',body:{revision:1,language:'ar',kind:'translation',confirmed:true}});
test('target regeneration recovery keeps exact selection and request ID scoped, bounded and immutable',()=>{
  const storage=store(),one=pending();savePendingRegeneration(storage,'staff/site',one);
  assert.deepEqual(readPendingRegeneration(storage,'staff/site'),one);assert.equal(readPendingRegeneration(storage,'foreign/site'),null);
  assert.deepEqual(pendingRegenerationContent(one),{revision:1,language:'ar',kind:'translation'});
  savePendingRegeneration(storage,'staff/site',one);
  for(const value of [pending(),{...one,body:{...one.body,kind:'audio'}},{...one,briefingId:'other'}]) assert.throws(()=>savePendingRegeneration(storage,'staff/site',value),/Recover/);
  assert.throws(()=>clearPendingRegeneration(storage,'staff/site',randomUUID()),/Another/);
  clearPendingRegeneration(storage,'staff/site',one.requestId);assert.equal(readPendingRegeneration(storage,'staff/site'),null);
  for(const invalid of [null,[],{...one,extra:true},{...one,briefingId:''},{...one,body:{...one.body,requestId:one.requestId}},
    {...one,body:{...one.body,confirmed:false}},{...one,body:{...one.body,language:'en'}},{...one,body:{...one.body,baseline:'forged'}},{...one,body:{...one.body,revision:2147483647}}]) {
    storage.setItem('understood:regeneration:bad',JSON.stringify(invalid));assert.throws(()=>readPendingRegeneration(storage,'bad'),/cannot be read/);
  }
  storage.setItem('understood:regeneration:bad',' '.repeat(2001));assert.throws(()=>readPendingRegeneration(storage,'bad'),/cannot be read/);
  assert.throws(()=>savePendingRegeneration({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},'staff',one),/No request was sent/);
});
test('regeneration recovery proves the selected briefing, accepted revision and exact stored request before clearing',()=>{
  const one=pending(),request=pendingRegenerationContent(one),accepted={found:true,id:'shelf',revision:2,request};
  assert.deepEqual(checkedRegenerationResult(accepted,one),{id:'shelf',revision:2});
  assert.deepEqual(checkedRegenerationReceipt({...accepted,request:Object.fromEntries(Object.entries(request).reverse())},one),{id:'shelf',revision:2});
  assert.equal(checkedRegenerationReceipt({found:false},one),null);
  for(const value of [null,{}, {found:'false'},{found:false,id:'shelf'}, {...accepted,id:'other'},{...accepted,revision:3},
    {...accepted,request:{...request,kind:'audio'}},{...accepted,request:{...request,language:'ur'}},{...accepted,request:{...request,revision:2}},
    {...accepted,request:{...request,confirmed:true}},{...accepted,request:{...request,baseline:'foreign'}},{...accepted,request:[]},{...accepted,request:null}]) assert.throws(()=>checkedRegenerationReceipt(value,one));
});
