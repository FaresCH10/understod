import {bundleHash} from '../ai/prepared-bundle.mjs';

const fields={
  briefing:['id','org_id','site_id','revision','next_version','state','created_at','updated_at'],
  archive:['request_id','org_id','site_id','briefing_id','request_sha256','publication_ids','archived_by','occurred_at'],
  publications:['id','org_id','site_id','briefing_id','version','state','published_at'],
  assignments:['id','org_id','site_id','publication_id','worker_id','language','due_at','created_at'],
  attempts:['id','org_id','site_id','assignment_id','submission_id','assessment_status','outcome','received_at','text_expired'],
  recordings:['id','org_id','site_id','assignment_id','submission_id','status','sha256','bytes','received_at'],
  clarifications:['id','org_id','site_id','assignment_id','attempt_id','status','created_at','resolved_at'],
  generated_bundles:['id','org_id','site_id','briefing_id','revision','manifest_hash','dependency_hash','state','removed_at'],
  jobs:['id','org_id','site_id','briefing_id','revision','kind','status'],
  schedules:['id','org_id','site_id','briefing_id','state','publication_id','created_at','finished_at'],
};
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const exact=(value,keys)=>object(value) && Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const timestamp=value=>typeof value==='string' && Number.isFinite(Date.parse(value));
const digest=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const identifier=value=>typeof value==='string' && value.length>0 && value.length<=100;
const contentKinds=['briefings','publications','draft_reviews','briefing_review_requests','briefing_regeneration_requests','generated_bundles','briefing_copies','source_audio_requests'];

export function validBriefingContentProofs(proofs,briefingId) {
  return object(proofs) && object(proofs.briefings) && digest(proofs.briefings[briefingId])
    && Object.entries(proofs).every(([kind,values])=>contentKinds.includes(kind) && object(values)
      && Object.keys(values).length<=50000 && Object.entries(values).every(([key,value])=>identifier(key) && digest(value)));
}

export function briefingContentProofsMatch(target,original) {
  return Object.entries(target).every(([kind,values])=>Object.entries(values).every(([key,value])=>original[kind]?.[key]===value));
}

// This is source eligibility evidence, never authority to copy an old cleanup success.
export function validateBriefingExpiryOrigin(origin,{purge,policy,capturedAt}) {
  const fail=()=>{throw Error('Original briefing expiry provenance unavailable');};
  const context=origin?.context_json,receipt=origin?.source_receipt_json;
  if(!exact(origin,['briefing_id','org_id','site_id','context_json','source_receipt_json','source_policy_json','captured_at'])
    || !exact(context,Object.keys(fields)) || bundleHash(receipt)!==bundleHash(purge)
    || bundleHash(origin.source_policy_json)!==bundleHash(policy)
    || !timestamp(origin.captured_at) || !timestamp(receipt?.completed_at)
    || Date.parse(origin.captured_at)<Date.parse(receipt.completed_at) || Date.parse(origin.captured_at)>Date.parse(capturedAt)
    || ['briefing_id','org_id','site_id'].some(key=>origin[key]!==receipt[key]))fail();
  const cutoff=Date.parse(receipt.completed_at)-receipt.days*86400000;
  for(const [kind,keys] of Object.entries(fields)) {
    const rows=['briefing','archive'].includes(kind)?[context[kind]]:context[kind];
    if(!Array.isArray(rows) || rows.length>50000)fail();
    const ids=new Set();
    for(const row of rows) {
      if(!exact(row,keys) || row.org_id!==origin.org_id || row.site_id!==origin.site_id)fail();
      const id=row.id ?? row.request_id;
      if(!identifier(id) || ids.has(id))fail();ids.add(id);
      for(const [key,value] of Object.entries(row)) {
        if(key==='publication_ids') {
          if(!Array.isArray(value) || value.length>50000 || value.some(id=>!identifier(id)) || new Set(value).size!==value.length)fail();
        } else if(value!==null && !['string','number','boolean'].includes(typeof value) || typeof value==='string' && value.length>100)fail();
        if(/_at$/.test(key) && value!==null && (!timestamp(value) || key!=='due_at' && Date.parse(value)>Date.parse(receipt.completed_at)))fail();
        if(/(?:sha256|_hash)$/.test(key) && !digest(value))fail();
      }
      if(row.briefing_id!==undefined && row.briefing_id!==origin.briefing_id)fail();
    }
  }
  if(context.briefing.id!==origin.briefing_id || !Number.isSafeInteger(context.briefing.revision) || context.briefing.revision<1
    || !Number.isSafeInteger(context.briefing.next_version) || context.briefing.next_version<1
    || Date.parse(context.archive.occurred_at)>cutoff
    || context.publications.some(row=>!['archived','superseded','withdrawn'].includes(row.state))
    || context.jobs.some(row=>['queued','processing'].includes(row.status))
    || context.schedules.some(row=>row.state==='queued')
    || context.attempts.some(row=>typeof row.text_expired!=='boolean' || row.assessment_status!=='complete' && !row.text_expired || Date.parse(row.received_at)>cutoff)
    || context.recordings.some(row=>['storing','received','processing'].includes(row.status) || Date.parse(row.received_at)>cutoff)
    || context.clarifications.some(row=>row.status!=='resolved' || !timestamp(row.resolved_at) || Date.parse(row.resolved_at)>cutoff)
    || context.generated_bundles.some(row=>row.state!=='cleaned' || !timestamp(row.removed_at)))fail();
  const publications=new Set(context.publications.map(row=>row.id)),assignments=new Set(context.assignments.map(row=>row.id)),attempts=new Set(context.attempts.map(row=>row.id));
  if(context.archive.publication_ids.some(id=>!publications.has(id))
    || context.assignments.some(row=>!publications.has(row.publication_id))
    || [...context.attempts,...context.recordings,...context.clarifications].some(row=>!assignments.has(row.assignment_id))
    || context.clarifications.some(row=>row.attempt_id!==null && !attempts.has(row.attempt_id))
    || context.schedules.some(row=>row.publication_id!==null && !publications.has(row.publication_id)))fail();
  return origin;
}
