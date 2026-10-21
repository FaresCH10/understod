import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedProcessingJob,checkedProcessingPage} from '../src/processing-state.ts';
const source={id:'source_transcription:source',kind:'source_transcription',status:'blocked',mode:'durable',attempts:1,revision:null,title:'Synthetic source',briefing_id:null,
  draft_revision:null,draft_state:null,archived_at:null,created_at:'2026-10-14T10:00:00.000Z',due_at:'2026-10-14T10:00:00.000Z',error:'Unavailable',retryAvailable:false,
  publication_id:null,publication_version:null,assignment_id:null,source_request_id:'source',own_source:true,sourceRetryAvailable:true,contentExpired:false};
test('processing DTO refuses mismatched identities, private metadata and invented readiness',()=>{
  assert.equal(checkedProcessingJob(source,source.id),source);
  for(const update of [{id:'source_transcription:other'},{id:'source'},{revision:1},{status:'ready'},{own_source:false},{sourceRetryAvailable:'true'},
    {lease_token:'private'},{title:''},{created_at:'2026-10-14'},{publication_id:'new-publication'},{mode:'inline-synthetic'},{attempts:-1},{retryAvailable:true}])assert.throws(()=>checkedProcessingJob({...source,...update}));
  assert.throws(()=>checkedProcessingJob(source,'other'));
  for(const kind of ['response_transcription','answer_check']){
    const row={...source,id:`${kind}:response`,kind,status:'complete',publication_id:'frozen-publication',publication_version:3,assignment_id:'assignment',briefing_id:'briefing',source_request_id:null,own_source:false,sourceRetryAvailable:false};
    assert.equal(checkedProcessingJob(row).publication_version,3);
    for(const update of [{publication_id:null},{publication_version:null},{assignment_id:null},{briefing_id:null},{status:'ready'},{source_request_id:'source'}])assert.throws(()=>checkedProcessingJob({...row,...update}));
    if(kind==='answer_check')assert.equal(checkedProcessingJob({...row,mode:'inline-synthetic'}).status,'complete');
    else assert.throws(()=>checkedProcessingJob({...row,mode:'inline-synthetic'}));
  }
});
test('processing pages reject duplicate, corrupt, oversized and mismatched pagination results',()=>{
  const value={items:[source],page:1,pageSize:20,total:1};assert.deepEqual(checkedProcessingPage(value,1),value);
  for(const update of [{page:2},{pageSize:100},{total:0},{total:1.5},{items:[source,source],total:2},{items:[{...source,id:'wrong'}]},{extra:true},{items:Array(21).fill(source),total:21}])assert.throws(()=>checkedProcessingPage({...value,...update},1));
});
