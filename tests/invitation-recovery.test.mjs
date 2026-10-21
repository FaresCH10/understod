import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {invitationEmailKey} from '../server/invitation-input.mjs';
import {completeStaffRequest} from '../src/staff-request.ts';
import {invitationLinkToken,acceptanceHash,readPendingInvitation,savePendingInvitation,clearPendingInvitation,checkedInvitationResult,checkedInvitationReceipt,checkedInvitationPreview,checkedInvitationPage,readPendingAcceptance,savePendingAcceptance,clearPendingAcceptance,checkedAcceptanceResult} from '../src/invitation-recovery.ts';
const fixture=()=>{const records=new Map();return {records,storage:{getItem:key=>records.get(key) ?? null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)}};};
const preview={organization:'Synthetic Works',site:'Test site',name:'Test recipient',role:'supervisor',emailHint:'t***@example.test',expiresAt:'2026-10-08T09:00:00.000Z'};
test('invitation links and acceptance recovery retain only token digests and bounded metadata',async()=>{
  const token='A'.repeat(43),hash=await acceptanceHash(token),{storage,records}=fixture(),pending={requestId:randomUUID(),kind:'signup',preview};
  assert.equal(invitationLinkToken(`#accept-invitation/${token}`),token);
  for(const fragment of [`#accept-invitation/${token}?extra=1`,`#accept-invitation/${token}/extra`,`#accept-invitation/${token.slice(1)}`,'#accept-invitation']) assert.equal(invitationLinkToken(fragment),'');
  assert.equal(hash,createHash('sha256').update(token).digest('hex'));
  savePendingAcceptance(storage,hash,pending);assert.deepEqual(readPendingAcceptance(storage,hash),pending);
  assert.equal(readPendingAcceptance(storage,'b'.repeat(64)),null);
  const serialized=JSON.stringify([...records]);assert.ok(!serialized.includes(token));assert.ok(!serialized.includes('password'));
  assert.throws(()=>savePendingAcceptance(storage,hash,{...pending,password:'Never persist this'}),/invalid/);
  assert.throws(()=>savePendingAcceptance(storage,hash,{...pending,kind:'existing'}),/Resolve/);
  assert.throws(()=>savePendingAcceptance(storage,hash,{...pending,requestId:randomUUID()}),/Resolve/);
  assert.throws(()=>clearPendingAcceptance(storage,hash,randomUUID()),/changed/);
  clearPendingAcceptance(storage,hash,pending.requestId);assert.equal(records.size,0);
});
test('staff invitation recovery is scope-isolated and proves normalized request receipts',async()=>{
  const {storage}=fixture(),id=randomUUID(),pending={requestId:id,id,action:'issue',body:{name:' Test recipient ',email:' TEST@EXAMPLE.TEST ',role:'supervisor',confirmed:true}};
  savePendingInvitation(storage,'actor:site',pending);assert.deepEqual(readPendingInvitation(storage,'actor:site'),pending);assert.equal(readPendingInvitation(storage,'actor:other-site'),null);
  assert.throws(()=>savePendingInvitation(storage,'actor:site',{...pending,requestId:randomUUID()}),/invalid/);
  const result={id,revision:1,state:'pending',delivery:'queued',duplicate:false};assert.deepEqual(checkedInvitationResult(result,pending),result);
  const receipt={accepted:true,id,action:'issue',request:{name:'Test recipient',role:'supervisor',emailHash:createHash('sha256').update(invitationEmailKey('test@example.test')).digest('hex')},result};
  assert.deepEqual(await checkedInvitationReceipt(receipt,pending),result);assert.equal(await checkedInvitationReceipt({accepted:false},pending),false);
  await assert.rejects(()=>checkedInvitationReceipt({accepted:false,result},pending),/does not match/);
  await assert.rejects(()=>checkedInvitationReceipt({...receipt,token:'never accepted'},pending),/does not match/);
  assert.throws(()=>clearPendingInvitation(storage,'actor:site',id,{...pending,body:{...pending.body,role:'owner'}}),/changed/);
  assert.deepEqual(readPendingInvitation(storage,'actor:site'),pending);
  for(const request of [{...receipt.request,role:'owner'},{...receipt.request,emailHash:'wrong'},{...receipt.request,site:'another-site'}]) await assert.rejects(()=>checkedInvitationReceipt({...receipt,request},pending),/does not match/);
  for(const patch of [{id:randomUUID()},{revision:2},{state:'accepted'},{delivery:'sent'},{duplicate:null}]) assert.throws(()=>checkedInvitationResult({...result,...patch},pending),/cannot be verified/);
  clearPendingInvitation(storage,'actor:site',id);assert.equal(readPendingInvitation(storage,'actor:site'),null);
});

test('invitation asynchronous receipt completion never clears saved intent after authority changes or while verification is held',async()=>{
  const {storage}=fixture(),id=randomUUID(),pending={requestId:id,id,action:'issue',body:{name:'Test recipient',email:'test@example.test',role:'supervisor',confirmed:true}};
  const receipt={accepted:true,id,action:'issue',request:{name:'Test recipient',role:'supervisor',emailHash:createHash('sha256').update(invitationEmailKey('test@example.test')).digest('hex')},result:{id,revision:1,state:'pending',delivery:'queued',duplicate:false}};
  savePendingInvitation(storage,'actor:site',pending);
  for(const gate of ['identity','held']) {
    let current=true,allowed=true,release;const waiting=new Promise(resolve=>{release=resolve;});
    const completion=completeStaffRequest(receipt,async value=>{await waiting;return checkedInvitationReceipt(value,pending);},()=>clearPendingInvitation(storage,'actor:site',id,pending),()=>current,()=>allowed);
    if(gate==='identity')current=false;else allowed=false;release();
    await assert.rejects(completion,/context changed|verification is pending/i);
    assert.deepEqual(readPendingInvitation(storage,'actor:site'),pending);
  }
  await completeStaffRequest(receipt,value=>checkedInvitationReceipt(value,pending),()=>clearPendingInvitation(storage,'actor:site',id,pending),()=>true);
  assert.equal(readPendingInvitation(storage,'actor:site'),null);
});
test('resend and cancellation recovery require the exact action and revision',async()=>{
  const id=randomUUID();
  for(const action of ['resend','cancel']) {
    const pending={requestId:randomUUID(),id,action,body:{revision:2,confirmed:true}},result={id,revision:action==='resend' ? 3 : 2,state:action==='resend' ? 'pending' : 'cancelled',...(action==='resend' ? {delivery:'queued'} : {}),duplicate:true};
    assert.deepEqual(await checkedInvitationReceipt({accepted:true,id,action,request:{revision:2},result},pending),result);
    await assert.rejects(()=>checkedInvitationReceipt({accepted:true,id,action,request:{revision:1},result},pending),/does not match/);
    assert.throws(()=>checkedInvitationResult({...result,revision:4},pending),/cannot be verified/);
  }
});
test('blocked or corrupt storage stops writes and acceptance acknowledgements are checked',async()=>{
  const {storage,records}=fixture(),hash='c'.repeat(64),pending={requestId:randomUUID(),kind:'signup',preview};
  assert.throws(()=>savePendingAcceptance({...storage,setItem(){}},hash,pending),/No request was sent/);
  assert.throws(()=>readPendingAcceptance({...storage,getItem(){throw new Error();}},hash),/unavailable/);
  savePendingAcceptance(storage,hash,pending);records.set([...records.keys()][0],'x'.repeat(4001));assert.throws(()=>readPendingAcceptance(storage,hash),/cannot be verified/);
  assert.throws(()=>checkedInvitationPreview({...preview,token:'never cached'}),/cannot be verified/);
  assert.throws(()=>checkedInvitationPreview({...preview,expiresAt:'invalid'}),/cannot be verified/);
  const result={completed:true,staffId:randomUUID(),signInRequired:true,duplicate:false};assert.deepEqual(checkedAcceptanceResult(result,'signup'),result);
  assert.throws(()=>checkedAcceptanceResult(result,'existing'),/cannot be verified/);
  for(const patch of [{completed:false},{staffId:'not-a-reference'},{duplicate:null}]) assert.throws(()=>checkedAcceptanceResult({...result,...patch},'signup'));
});
test('private invitation list rejects malformed rows, duplicates and foreign fields before rendering',()=>{
  const item={id:randomUUID(),name:preview.name,role:preview.role,emailHint:preview.emailHint,state:'pending',revision:1,createdAt:'2026-10-06T09:00:00.000Z',expiresAt:preview.expiresAt,delivery:'queued'},page={items:[item],total:1,page:1,pageSize:5,canWrite:true};
  assert.deepEqual(checkedInvitationPage(page,1),page);
  for(const patch of [{role:'unknown'},{state:null},{emailHint:null},{revision:0},{delivery:'delivered'},{createdAt:'invalid'},{token:'raw link'}]) assert.throws(()=>checkedInvitationPage({...page,items:[{...item,...patch}]},1));
  assert.throws(()=>checkedInvitationPage({...page,total:2,items:[item,item]},1),/cannot be verified/);
  assert.throws(()=>checkedInvitationPage(page,2),/cannot be verified/);
});
