import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readPendingGlossary,savePendingGlossary,clearPendingGlossary,pendingGlossarySignature,checkedGlossaryResult} from '../src/glossary-recovery.ts';
import {glossaryInput,glossarySignature} from '../server/glossary-input.mjs';
function storage() {const rows=new Map();return {getItem:key=>rows.get(key) ?? null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};}
const pending=()=>({requestId:randomUUID(),kind:'create',termId:null,body:{term:'blue shelf',sourceLanguage:'en',targetLanguage:'ar',override:'',confirmed:true}});
test('glossary reload recovery validates original inputs, scope and exact immutable receipts before clearing',()=>{
  const store=storage(),one=pending();savePendingGlossary(store,'owner/site',one);assert.deepEqual(readPendingGlossary(store,'owner/site'),one);assert.equal(readPendingGlossary(store,'owner/other-site'),null);assert.equal(readPendingGlossary(store,'other-owner/site'),null);
  assert.throws(()=>savePendingGlossary(store,'owner/site',pending()),/Resolve/);assert.throws(()=>savePendingGlossary(store,'owner/site',{...one,body:{...one.body,override:'Changed'}}),/Resolve/);assert.throws(()=>clearPendingGlossary(store,'owner/site',randomUUID()),/changed/);
  const canonical=glossaryInput(one.kind,one.termId,{...one.body,requestId:one.requestId});assert.equal(pendingGlossarySignature(one),glossarySignature(Object.fromEntries(Object.entries(canonical).reverse())));
  const accepted={id:one.requestId,revision:1,status:'active',invalidatedDrafts:2};assert.equal(checkedGlossaryResult(accepted,one).revision,1);
  for(const result of [null,{}, {...accepted,id:'foreign'},{...accepted,revision:2},{...accepted,status:'removed'},{...accepted,invalidatedDrafts:-1},{...accepted,invalidatedDrafts:1.2}]) assert.throws(()=>checkedGlossaryResult(result,one),/cannot be verified/);
  clearPendingGlossary(store,'owner/site',one.requestId);assert.equal(readPendingGlossary(store,'owner/site'),null);
  for(const bad of [{...one,extra:true},{...one,termId:'forged'},{...one,requestId:'bad'},{...one,body:{...one.body,requestId:one.requestId}},{...one,body:{...one.body,confirmed:false}},{...one,body:{...one.body,override:null}},{...one,body:{...one.body,org_id:'foreign'}}]) {store.setItem('understood:glossary:bad',JSON.stringify(bad));assert.throws(()=>readPendingGlossary(store,'bad'),/cannot be verified/);}
  store.setItem('understood:glossary:bad',' '.repeat(6001));assert.throws(()=>readPendingGlossary(store,'bad'),/cannot be verified/);
  assert.throws(()=>savePendingGlossary({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},'owner',one),/No new request was sent/);
  for(const kind of ['edit','remove','restore','regenerate']) {const value={requestId:randomUUID(),kind,termId:randomUUID(),body:{revision:3,confirmed:true,...(kind==='edit' ? {override:'Terminology'} : {})}};savePendingGlossary(store,'owner/site',value);assert.deepEqual(readPendingGlossary(store,'owner/site'),value);assert.equal(checkedGlossaryResult({id:value.termId,revision:4,status:kind==='remove' ? 'removed' : 'active',invalidatedDrafts:0},value).revision,4);clearPendingGlossary(store,'owner/site',value.requestId);}
});
