import {bundleHash} from '../ai/prepared-bundle.mjs';

const contracts={
  publications:{fields:['org_id','site_id','briefing_id','version']},
  assignments:{fields:['org_id','site_id','publication_id','worker_id','language']},
  submission_receipts:{key:row=>[row.assignment_id,row.submission_id],fields:['org_id','site_id','sequence','kind','received_at']},
  attempts:{fields:['org_id','site_id','assignment_id','submission_id','received_at']},
  recordings:{fields:['org_id','site_id','assignment_id','submission_id','sha256','bytes'],clock:'received_at'},
  source_audio_requests:{fields:['org_id','site_id','request_id','sha256','bytes','original_id','original_sha256','original_bytes'],clock:'received_at',link:'briefing_id'},
  generated_bundles:{fields:['org_id','site_id','briefing_id','revision','manifest_hash','dependency_hash'],clock:'stored_at'},
  generated_audio:{fields:['org_id','site_id','bundle_id','language','text_hash','sha256','bytes']},
  case_followups:{fields:['org_id','site_id','case_id','assignment_id','actor_id','request_hash','created_at'],clock:'delivered_at'},
  case_followup_audio:{fields:['org_id','site_id','request_id','job_lease','language','text_hash','sha256','bytes','created_at']},
  case_voice:{fields:['org_id','site_id','assignment_id','worker_id','request_id','requested_case_id','kind','language','created_at','sha256','bytes'],clock:'received_at'},
  clarifications:{fields:['org_id','site_id','assignment_id','attempt_id','created_at']},
  help_requests:{key:row=>[row.case_id],fields:['org_id','site_id','assignment_id']},
  case_messages:{fields:['org_id','site_id','case_id','assignment_id','actor_id','request_hash','created_at']},
  case_reviews:{fields:['org_id','site_id','case_id','assignment_id','actor_id','kind','request_hash','created_at']},
};
const same=(left,right)=>bundleHash(left ?? null)===bundleHash(right ?? null);

// This comparison never manufactures an acceptance clock, submission order or result.
// Missing later input is recovered through a fresh stopped-source DB/object backup.
export function compareRestoreInputs(source,target,sourceObjects,targetObjects){
  const gaps=[];
  const receiptKey=row=>JSON.stringify([row.assignment_id,row.submission_id]);
  const receipts=new Map(source.submission_receipts.map(row=>[receiptKey(row),row]));
  for(const family of ['attempts','recordings'])for(const row of source[family]){
    if(family==='recordings' && row.received_at===null)continue;
    const receipt=receipts.get(receiptKey(row));
    if(!receipt || receipt.org_id!==row.org_id || receipt.site_id!==row.site_id || receipt.received_at!==row.received_at
      || family==='recordings' && receipt.kind!=='audio')
      gaps.push({family,key:JSON.stringify([row.id]),reason:'source_acceptance_unbound'});
  }
  for(const [family,contract] of Object.entries(contracts)){
    const key=row=>JSON.stringify(contract.key?contract.key(row):[row.id]);
    const sources=new Map(source[family].map(row=>[key(row),row]));
    const targets=new Map(target[family].map(row=>[key(row),row]));
    for(const [identity,row] of sources){
      const restored=targets.get(identity);
      const add=reason=>gaps.push({family,key:identity,reason});
      if(!restored){add('missing_source_input');continue;}
      if(contract.fields.some(field=>!same(row[field],restored[field]))){add('input_identity_changed');continue;}
      if(contract.clock && !same(row[contract.clock],restored[contract.clock]))
        add(restored[contract.clock]===null && row[contract.clock]!==null?'accepted_after_backup':'acceptance_clock_changed');
      if(contract.link && !same(row[contract.link],restored[contract.link]))add('accepted_result_link_changed');
      if(family==='attempts' && !row.redacted && (!same(row.input_sha256,restored.input_sha256) || !same(row.result_sha256,restored.result_sha256)))
        add('accepted_answer_or_result_changed');
      if(family==='recordings' && !row.transcript_cleared && !same(row.transcript_sha256,restored.transcript_sha256))add('accepted_transcript_changed');
    }
    for(const identity of targets.keys())if(!sources.has(identity))gaps.push({family,key:identity,reason:'source_input_unavailable'});
  }
  const targets=new Map(targetObjects.map(row=>[row.id,row]));
  for(const row of sourceObjects){
    if(!row.retained)continue;
    const restored=targets.get(row.id);
    if(!restored || !restored.retained || ['family','org_id','site_id','sha256','bytes','format'].some(field=>row[field]!==restored[field]))
      gaps.push({family:'private_objects',key:JSON.stringify([row.id]),reason:'accepted_private_object_unavailable'});
  }
  return {compared:true,gaps,gapCount:gaps.length,sourceInputsRepresented:gaps.length===0,
    recoveryRequired:gaps.length?'fresh_stopped_source_backup':null,
    sourceCutoffEstablished:false,activationAllowed:false,productionReady:false};
}
