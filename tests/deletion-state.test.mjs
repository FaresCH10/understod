import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readDeletionReceipt,verifyDeletionAcceptance} from '../src/deletion-state.ts';

test('deletion status binds the selected worker and requires real completed-stage evidence',()=>{
  const row={id:randomUUID(),workerId:'worker',reason:'worker_request',createdAt:new Date().toISOString(),status:'queued',completedAt:null,contentRedactedAt:null,identityPseudonymizedAt:null};
  assert.equal(readDeletionReceipt(null,'worker'),null);
  assert.deepEqual(readDeletionReceipt(row,'worker'),row);
  const complete={...row,status:'complete',completedAt:row.createdAt,contentRedactedAt:row.createdAt,identityPseudonymizedAt:row.createdAt};
  assert.deepEqual(readDeletionReceipt(complete,'worker'),complete);
  for(const value of [undefined,[],{},false,{...row,id:'bad'},{...row,workerId:'foreign'},{...row,createdAt:'bad'},{...row,reason:'other'},
    {...row,status:'complete'},{...row,completedAt:row.createdAt},{...row,identityPseudonymizedAt:row.createdAt},
    {...complete,contentRedactedAt:null},{...complete,identityPseudonymizedAt:null},{...row,contentRedactedAt:undefined}])assert.throws(()=>readDeletionReceipt(value,'worker'),/cannot be verified/);
});
test('deletion acknowledgement matches the exact UUID and cannot fake an accepted request',()=>{
  const id=randomUUID();
  for(const status of ['queued','complete'])for(const duplicate of [false,true])assert.doesNotThrow(()=>verifyDeletionAcceptance({id,status,duplicate},id));
  for(const value of [null,[],{},false,{id:randomUUID(),status:'queued',duplicate:false},{id,status:'queued'},{id,status:'unknown',duplicate:false},
    {id,status:'queued',duplicate:'true'}])assert.throws(()=>verifyDeletionAcceptance(value,id),/cannot be verified/);
});
