import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readPendingReview,savePendingReview,clearPendingReview,pendingReviewContent,checkedReviewResult} from '../src/review-recovery.ts';
import {sameReview} from '../server/briefing-input.mjs';
function store() {const rows=new Map();return {getItem:key=>rows.get(key) || null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};}
const pending=()=>({requestId:randomUUID(),briefingId:'shelf',body:{revision:1,question:'',facts:[],askedFacts:[],confirmed:true}});
test('review requests survive scoped reload reads, cannot overwrite uncertainty and verify exact acknowledgements',()=>{
  const storage=store(),one=pending();savePendingReview(storage,'staff/site',one);
  assert.deepEqual(readPendingReview(storage,'staff/site'),one);assert.equal(readPendingReview(storage,'other/site'),null);assert.equal(readPendingReview(storage,'staff/other'),null);
  assert.throws(()=>savePendingReview(storage,'staff/site',pending()),/Recover/);assert.throws(()=>savePendingReview(storage,'staff/site',{...one,body:{...one.body,question:'Changed'}}),/Recover/);
  assert.throws(()=>clearPendingReview(storage,'staff/site',randomUUID()),/Another/);
  const content=pendingReviewContent(one);assert.equal(sameReview(content,Object.fromEntries(Object.entries(content).reverse())),true);
  assert.deepEqual(checkedReviewResult({id:'shelf',revision:2},one),{id:'shelf',revision:2});
  for(const result of [null,{}, {id:'foreign',revision:2},{id:'shelf',revision:99}]) assert.throws(()=>checkedReviewResult(result,one),/acknowledgement/);
  clearPendingReview(storage,'staff/site',one.requestId);assert.equal(readPendingReview(storage,'staff/site'),null);
  for(const invalid of [{...one,extra:true},{...one,briefingId:''},{...one,requestId:'bad'},{...one,body:{...one.body,confirmed:false}},{...one,body:{...one.body,requestId:one.requestId}},{...one,body:{...one.body,facts:['a',' a']}},null]) {
    storage.setItem('understood:review:bad',JSON.stringify(invalid));assert.throws(()=>readPendingReview(storage,'bad'),/cannot be read/);
  }
  storage.setItem('understood:review:bad','x'.repeat(16001));assert.throws(()=>readPendingReview(storage,'bad'),/cannot be read/);
  assert.throws(()=>savePendingReview({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},'staff',one),/No request was sent/);
});

test('translated review recovery retains exact multilingual text above the old 16 KiB boundary',()=>{
  const storage=store(),one=pending();one.body.translations={ar:{title:'الرفوف',text:'ع'.repeat(5000),question:'أين الرفوف؟'},ur:{title:'شیلف',text:'ع'.repeat(5000),question:'کہاں؟'}};
  assert.ok(new TextEncoder().encode(JSON.stringify(one)).length>16000);
  savePendingReview(storage,'staff/site',one);assert.deepEqual(readPendingReview(storage,'staff/site'),one);
  const content=pendingReviewContent(one);assert.deepEqual(content.translations,one.body.translations);
  assert.throws(()=>savePendingReview(storage,'staff/site',{...one,body:{...one.body,translations:{...one.body.translations,ar:{...one.body.translations.ar,question:'أين؟'}}}}),/Recover/);
  clearPendingReview(storage,'staff/site',one.requestId);assert.equal(readPendingReview(storage,'staff/site'),null);
  assert.throws(()=>savePendingReview(storage,'bad',{...one,body:{...one.body,translations:{en:one.body.translations.ar}}}),/Invalid/);
  storage.setItem('understood:review:bad',' '.repeat(100001));assert.throws(()=>readPendingReview(storage,'bad'),/cannot be read/);
});
