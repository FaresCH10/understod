import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {checkedWorkerGrant,checkedWorkerGrantPage,checkedGrantRevocation,copyWorkerGrant} from '../src/worker-access-state.ts';
const time=Date.parse('2026-10-13T12:00:00.000Z'),now=()=>time;
const session={authenticated:true,role:'staff',staffRole:'owner',staffScope:JSON.stringify(['org','site','actor']),siteState:'active',mode:'synthetic-credential',clientContext:'a'.repeat(64),expiresAt:new Date(time+3600000).toISOString()};
const grant=()=>({id:randomUUID(),workerId:'worker',token:'A'.repeat(43),expiresAt:new Date(time+1800000).toISOString()});

test('private grant evidence is worker-specific, bounded and never accepts a bearer token in list/revoke data',()=>{
  const issued=grant();assert.deepEqual(checkedWorkerGrant(issued,'worker',time),issued);
  for(const patch of [{workerId:'foreign'},{token:'wrong'},{expiresAt:new Date(time).toISOString()},{id:''},{secret:'private'}])assert.throws(()=>checkedWorkerGrant({...issued,...patch},'worker',time),/verified/);
  const item={id:issued.id,workerId:'worker',createdAt:new Date(time).toISOString(),expiresAt:issued.expiresAt,redeemedAt:null,revokedAt:null,status:'available'},page={items:[item],total:1,page:1,pageSize:5,asOf:new Date(time).toISOString(),workerActive:true};
  assert.deepEqual(checkedWorkerGrantPage(page,'worker',1),page);
  for(const patch of [{items:[{...item,token:issued.token}]},{items:[{...item,workerId:'foreign'}]},{items:[{...item,status:'revoked'}]},{total:0},{page:2},{workerActive:'yes'},{items:[item,item],total:2}])assert.throws(()=>checkedWorkerGrantPage({...page,...patch},'worker',1),/verified/);
  assert.deepEqual(checkedGrantRevocation({ok:true}),{ok:true});for(const value of [{ok:false},{ok:true,token:issued.token},null])assert.throws(()=>checkedGrantRevocation(value),/verified/);
});

test('private link clipboard writes require the exact live original staff identity and original link selection',async()=>{
  const issued=grant(),writes=[];let current=true,allowed=true;
  await copyWorkerGrant(issued,'worker','http://127.0.0.1:3020',session,async()=>session,async value=>writes.push(value),()=>current,()=>allowed,now);
  assert.equal(writes.length,1);assert.equal(writes[0],`http://127.0.0.1:3020/#worker-access/${issued.token}`);
  for(const changed of [{...session,clientContext:'b'.repeat(64)},{...session,staffScope:JSON.stringify(['org','other','actor'])},{...session,staffRole:'auditor'},{...session,siteState:'archived'},{...session,expiresAt:new Date(time).toISOString()}])await assert.rejects(copyWorkerGrant(issued,'worker','http://127.0.0.1:3020',session,async()=>changed,async value=>writes.push(value),()=>current,()=>allowed,now),/Copy/);
  current=false;await assert.rejects(copyWorkerGrant(issued,'worker','http://127.0.0.1:3020',session,async()=>session,async value=>writes.push(value),()=>current,()=>allowed,now));
  current=true;allowed=false;await assert.rejects(copyWorkerGrant(issued,'worker','http://127.0.0.1:3020',session,async()=>session,async value=>writes.push(value),()=>current,()=>allowed,now));
  allowed=true;await assert.rejects(copyWorkerGrant(issued,'worker','http://127.0.0.1:3020',session,async()=>{current=false;return session;},async value=>writes.push(value),()=>current,()=>allowed,now));
  assert.equal(writes.length,1);
});

test('clipboard completion cannot announce success after selection changes during the write',async()=>{
  let current=true;const issued=grant();
  await assert.rejects(copyWorkerGrant(issued,'worker','http://127.0.0.1:3020',session,async()=>session,async()=>{current=false;},()=>current,()=>true,now),/Copy/);
});

test('clipboard verification never adopts a mutated expected session during its private read',async()=>{
  const mutable={...session},writes=[];
  await assert.rejects(copyWorkerGrant(grant(),'worker','http://127.0.0.1:3020',mutable,async()=>{mutable.clientContext='b'.repeat(64);mutable.staffScope=JSON.stringify(['org','other','actor']);return mutable;},async value=>writes.push(value),()=>true,()=>true,now),/Copy/);
  assert.equal(writes.length,0);
});
