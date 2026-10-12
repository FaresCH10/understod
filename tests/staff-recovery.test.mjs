import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readPendingStaff,savePendingStaff,clearPendingStaff,checkedStaffResult} from '../src/staff-recovery.ts';
test('staff recovery storage prevents overwrite, requires persistence, validates acknowledgements and isolates sessions',()=>{
  const records=new Map(),storage={getItem:k=>records.get(k) ?? null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};
  const pending={requestId:randomUUID(),id:'rami',action:'role',body:{revision:1,role:'auditor',confirmed:true}};
  savePendingStaff(storage,'one',pending);assert.deepEqual(readPendingStaff(storage,'one'),pending);assert.equal(readPendingStaff(storage,'other'),null);
  assert.throws(()=>savePendingStaff(storage,'one',{...pending,requestId:randomUUID()}),/Resolve/);assert.throws(()=>savePendingStaff({getItem:()=>null,setItem(){},removeItem(){}},'one',pending),/No request was sent/);
  const result={id:'rami',revision:2,role:'auditor',active:true};assert.deepEqual(checkedStaffResult(result,pending),result);
  for(const patch of [{id:'other'},{revision:3},{role:'owner'},{active:false}]) assert.throws(()=>checkedStaffResult({...result,...patch},pending),/cannot be verified/);
  assert.throws(()=>clearPendingStaff(storage,'one',randomUUID()),/changed/);clearPendingStaff(storage,'one',pending.requestId);assert.equal(readPendingStaff(storage,'one'),null);
});
