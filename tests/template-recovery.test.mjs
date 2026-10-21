import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readPendingTemplate,savePendingTemplate,clearPendingTemplate,pendingTemplateSignature,checkedTemplateResult} from '../src/template-recovery.ts';
import {templateInput,templateSignature,templateRecoveryScope} from '../server/template-input.mjs';
function store() {const rows=new Map();return {getItem:key=>rows.get(key) || null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};}
const pending=()=>({requestId:randomUUID(),kind:'create',templateId:null,body:{title:'Template recovery',description:'',source:'Synthetic template source',question:'',facts:[],askedFacts:[],confirmed:true}});
test('pending template requests are validated, tab-scoped, immutable and receipt-comparable after reload',()=>{
  const storage=store(),one=pending();savePendingTemplate(storage,'staff/site',one);
  assert.deepEqual(readPendingTemplate(storage,'staff/site'),one);assert.equal(readPendingTemplate(storage,'other/site'),null);assert.equal(readPendingTemplate(storage,'staff/other'),null);
  assert.throws(()=>savePendingTemplate(storage,'staff/site',pending()),/Recover/);
  assert.throws(()=>savePendingTemplate(storage,'staff/site',{...one,body:{...one.body,title:'Changed request'}}),/Recover/);
  assert.throws(()=>clearPendingTemplate(storage,'staff/site',randomUUID()),/Another/);
  const canonical=templateInput(one.kind,one.templateId,{...one.body,requestId:one.requestId});
  assert.equal(checkedTemplateResult({id:one.requestId,revision:1,status:'active'},one).id,one.requestId);
  for(const result of [null,{}, {id:'foreign',revision:1},{id:one.requestId,revision:99}]) assert.throws(()=>checkedTemplateResult(result,one),/acknowledgement/);
  assert.equal(pendingTemplateSignature(one),templateSignature(Object.fromEntries(Object.entries(canonical).reverse())));
  clearPendingTemplate(storage,'staff/site',one.requestId);assert.equal(readPendingTemplate(storage,'staff/site'),null);
  for(const invalid of [{...one,extra:true},{...one,requestId:'bad'},{...one,templateId:'forged'},{...one,body:{...one.body,requestId:one.requestId}},{...one,body:{...one.body,confirmed:false}},{...one,body:{...one.body,facts:['a',' a']}}]) {
    storage.setItem('understood:templates:bad',JSON.stringify(invalid));assert.throws(()=>readPendingTemplate(storage,'bad'),/cannot be read/);
  }
  assert.throws(()=>savePendingTemplate({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},'staff',one),/No request was sent/);
  for(const kind of ['edit','archive','restore','duplicate','use']) {
    const value={...pending(),kind,templateId:randomUUID(),body:{confirmed:true,revision:1,...(kind==='edit' ? one.body : ['duplicate','use'].includes(kind) ? {title:'Recovered title'} : {})}};
    savePendingTemplate(storage,'staff/site',value);assert.deepEqual(readPendingTemplate(storage,'staff/site'),value);clearPendingTemplate(storage,'staff/site',value.requestId);
  }
  const staff={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
  assert.equal(templateRecoveryScope(staff),JSON.stringify(['cedar','beirut','maya']));assert.equal(templateRecoveryScope({...staff,role:'supervisor'}),templateRecoveryScope(staff));
  assert.equal(templateRecoveryScope({...staff,role:'auditor'}),null);assert.equal(templateRecoveryScope({...staff,principal_type:'worker'}),null);
});
