import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readPendingNotice,storePendingNotice,clearPendingNotice,verifyNoticeReceipt,workerRecordingNotice} from '../src/notice-recovery.ts';
const scope=JSON.stringify(['cedar','beirut','maya']),otherScope=JSON.stringify(['harbor','yard','other']);
const change=()=>({requestId:randomUUID(),revision:4,confirmed:true,scope,notices:{en:'Synthetic English notice for recovery.',ar:'معلومات تجريبية لإشعار التسجيل الخاص بالموقع.',ur:'ریکارڈنگ کے نوٹس کی آزمائشی معلومات۔'}});
test('notice recovery preserves exact original intent and proves its immutable scoped receipt',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const pending=change();storePendingNotice(storage,scope,pending);assert.deepEqual(readPendingNotice(storage,scope),pending);assert.equal(readPendingNotice(storage,otherScope),null);
  assert.throws(()=>storePendingNotice(storage,scope,change()),/Resolve/);
  assert.throws(()=>storePendingNotice(storage,otherScope,pending),/scope changed/);
  const receipt={requestId:pending.requestId,revision:5,request:{revision:4,notices:pending.notices,scope}};verifyNoticeReceipt(receipt,pending);
  for(const value of [null,{},false,{...receipt,requestId:randomUUID()},{...receipt,revision:4},{...receipt,request:{revision:4,notices:{...pending.notices,ar:'Wrong notice'}}}])assert.throws(()=>verifyNoticeReceipt(value,pending));
  assert.throws(()=>clearPendingNotice(storage,scope,randomUUID()),/changed/);clearPendingNotice(storage,scope,pending.requestId);assert.equal(readPendingNotice(storage,scope),null);
  assert.throws(()=>storePendingNotice({...storage,setItem(){}},scope,pending),/No request was sent/);
  values.set(`understood:recording-notice:${scope}`,'broken');assert.throws(()=>readPendingNotice(storage,scope),/cannot be verified/);
});
test('worker site notice validation requires exact UI language and truthful configured text',()=>{
  const dto={revision:1,configured:true,language:'ar',notice:change().notices.ar};assert.equal(workerRecordingNotice(dto,'ar'),dto.notice);
  assert.equal(workerRecordingNotice({revision:0,configured:false,language:'en',notice:null},'en'),null);
  for(const value of [null,{},false,{...dto,language:'en'},{...dto,revision:-1},{...dto,revision:'1'},{...dto,configured:'true'},{...dto,notice:null},
    {...dto,notice:'short'},{...dto,notice:'a'.repeat(2001)},{...dto,configured:false}])assert.throws(()=>workerRecordingNotice(value,'ar'),/cannot be verified/);
});
