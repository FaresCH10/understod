import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readDeletionReceipt,verifyDeletionAcceptance,readPrivacyWorkerPage} from '../src/deletion-state.ts';
import {applicationCleanupEvidence,validApplicationCleanupEvidence} from '../server/deletion-scope.mjs';

test('deletion status binds the selected worker and requires real completed-stage evidence',()=>{
  const row={id:randomUUID(),workerId:'worker',reason:'worker_request',createdAt:new Date().toISOString(),status:'queued',completedAt:null,contentRedactedAt:null,identityPseudonymizedAt:null,cleanupEvidence:applicationCleanupEvidence()};
  assert.equal(readDeletionReceipt(null,'worker'),null);
  assert.deepEqual(readDeletionReceipt(row,'worker'),row);
  assert.deepEqual(readDeletionReceipt(row,'worker',{requestId:row.id,reason:row.reason}),row);
  assert.throws(()=>readDeletionReceipt(row,'worker',{requestId:randomUUID(),reason:row.reason}),/cannot be verified/);
  assert.throws(()=>readDeletionReceipt(row,'worker',{requestId:row.id,reason:'customer_policy'}),/cannot be verified/);
  assert.throws(()=>readDeletionReceipt({...row,token:'private'},'worker'),/cannot be verified/);
  const complete={...row,status:'complete',completedAt:row.createdAt,contentRedactedAt:row.createdAt,identityPseudonymizedAt:row.createdAt};
  assert.deepEqual(readDeletionReceipt(complete,'worker'),complete);
  for(const value of [undefined,[],{},false,{...row,id:'bad'},{...row,workerId:'foreign'},{...row,createdAt:'bad'},{...row,reason:'other'},
    {...row,status:'complete'},{...row,completedAt:row.createdAt},{...row,identityPseudonymizedAt:row.createdAt},
    {...complete,contentRedactedAt:null},{...complete,identityPseudonymizedAt:null},{...row,contentRedactedAt:undefined}])assert.throws(()=>readDeletionReceipt(value,'worker'),/cannot be verified/);
});

test('privacy directory requires scoped cleanup evidence, valid stage dates, bounded pages and no private fields',()=>{
  const at=new Date().toISOString(),none={id:'worker',code:'Synthetic',active:true,deletion_status:'none',requested_at:null,completed_at:null,cleanupEvidence:applicationCleanupEvidence()};
  const page={items:[none],total:1,page:1,pageSize:5};
  assert.deepEqual(readPrivacyWorkerPage(page),page);
  for(const status of ['queued','complete'])assert.equal(readPrivacyWorkerPage({...page,items:[{...none,active:false,deletion_status:status,requested_at:at,completed_at:status==='complete'?at:null}]}).items[0].deletion_status,status);
  for(const value of [null,{},[],{...page,token:'secret'},{...page,page:0},{...page,total:-1},{...page,pageSize:101},{...page,items:[none,none]},
    ...[{...none,cleanupEvidence:undefined},{...none,cleanupEvidence:{...none.cleanupEvidence,irreversibleErasure:'verified'}},
      {...none,deletion_status:'complete'},{...none,requested_at:at},{...none,completed_at:at},{...none,active:1},{...none,token:'secret'}].map(row=>({...page,items:[row]}))])
    assert.throws(()=>readPrivacyWorkerPage(value),/cannot be verified/);
});
test('deletion acknowledgement matches the exact UUID and cannot fake an accepted request',()=>{
  const id=randomUUID();
  for(const status of ['queued','complete'])for(const duplicate of [false,true])assert.doesNotThrow(()=>verifyDeletionAcceptance({id,status,duplicate,cleanupEvidence:applicationCleanupEvidence()},id));
  for(const value of [null,[],{},false,{id:randomUUID(),status:'queued',duplicate:false},{id,status:'queued'},{id,status:'unknown',duplicate:false},
    {id,status:'queued',duplicate:'true'}])assert.throws(()=>verifyDeletionAcceptance(value,id),/cannot be verified/);
  assert.throws(()=>verifyDeletionAcceptance({id:'',status:'queued',duplicate:false},''),/cannot be verified/);
  assert.throws(()=>verifyDeletionAcceptance({id,status:'queued',duplicate:false,token:'private'},id),/cannot be verified/);
});

test('application completion never implies provider history, backup, device or irreversible erasure evidence',()=>{
  const evidence=applicationCleanupEvidence(),id=randomUUID();
  assert.equal(validApplicationCleanupEvidence(evidence),true);assert.notEqual(evidence,applicationCleanupEvidence());
  const receipt={id,workerId:'worker',reason:'worker_request',createdAt:new Date().toISOString(),status:'complete',completedAt:new Date().toISOString(),contentRedactedAt:new Date().toISOString(),identityPseudonymizedAt:new Date().toISOString(),cleanupEvidence:evidence};
  assert.equal(readDeletionReceipt(receipt,'worker').cleanupEvidence.irreversibleErasure,'not_verified');
  for(const value of [null,undefined,[],{}, {...evidence,scope:'all_history'},{...evidence,privateKey:'secret'},
    ...['providerHistory','backups','deviceCaches','irreversibleErasure'].flatMap(field=>[{...evidence,[field]:'verified'},{...evidence,[field]:null}])]){
    assert.equal(validApplicationCleanupEvidence(value),false);
    assert.throws(()=>readDeletionReceipt({...receipt,cleanupEvidence:value},'worker'),/cannot be verified/);
    assert.throws(()=>verifyDeletionAcceptance({id,status:'complete',duplicate:true,cleanupEvidence:value},id),/cannot be verified/);
  }
});
