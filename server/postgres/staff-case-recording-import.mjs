import {staffRecordingInput} from '../staff-case-recording-input.mjs';

// Historical authors may have changed role or left. Validate their original scoped
// identity without pretending they are authorized to create a new recording now.
export function validateImportedCaseVoice(snapshot){
  const assignments=new Map(snapshot.assignments.map(row=>[row.id,row])),staff=new Map(snapshot.staff.map(row=>[row.id,row]));
  const cases=new Map(snapshot.clarifications.map(row=>[row.id,row])),messages=new Map(snapshot.case_messages.map(row=>[row.id,row]));
  const ids=new Set(),requests=new Set();
  for(const row of snapshot.case_voice){
    const invalid=()=>{throw Error('Invalid source case voice evidence');};
    try{staffRecordingInput(row.requested_case_id,row.request_id,row.language);}catch{invalid();}
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id)||ids.has(row.id)||requests.has(row.request_id))invalid();
    ids.add(row.id);requests.add(row.request_id);
    const assignment=assignments.get(row.assignment_id),thread=cases.get(row.requested_case_id),actor=staff.get(row.actor_id);
    if(!assignment||assignment.org_id!==row.org_id||assignment.site_id!==row.site_id||assignment.worker_id!==row.worker_id)invalid();
    if(row.actor_type==='staff'){
      if(row.kind!=='in_person'||!['owner','supervisor'].includes(row.actor_role)||!actor||actor.org_id!==row.org_id||actor.site_id!==row.site_id
        ||!thread||thread.assignment_id!==row.assignment_id||thread.org_id!==row.org_id||thread.site_id!==row.site_id)invalid();
    }else if(row.actor_type!=='worker'||!['help','reply'].includes(row.kind)||row.actor_id!==null||row.actor_role!==null||assignment.language!==row.language)invalid();
    if(!/^[0-9a-f]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<8044||row.bytes>2880044
      ||!Number.isFinite(row.duration_seconds)||row.duration_seconds<.25||row.duration_seconds>90
      ||!['storing','received','failed'].includes(row.status)||!['active','cleaning','cleaned'].includes(row.cleanup_state))invalid();
    const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
    if(!stamp(row.created_at)||row.received_at!==null&&!stamp(row.received_at))invalid();
    if(row.status==='received'){
      if(!row.received_at||row.case_id!==row.requested_case_id||!thread||thread.org_id!==row.org_id||thread.assignment_id!==row.assignment_id)invalid();
      if(row.actor_type==='worker'){
        const message=messages.get(row.request_id);
        if(!message||message.case_id!==row.case_id||message.assignment_id!==row.assignment_id||message.org_id!==row.org_id||message.site_id!==row.site_id
          ||message.actor_type!=='worker'||message.actor_id!==row.worker_id||message.request_hash!==row.sha256)invalid();
      }
    }else if(row.received_at!==null||row.case_id!==null)invalid();
    if(row.status==='storing'&&(!row.lease_token||!stamp(row.lease_until)))invalid();
    if(row.cleanup_state==='cleaning'&&(!row.cleanup_token||!stamp(row.cleanup_until)))invalid();
  }
}

export function normalizeImportedCaseVoice(row,now){
  const copy={...row,lease_token:null,lease_until:null};
  if(copy.status==='storing')copy.status='failed';
  if(copy.cleanup_state==='cleaning')copy.cleanup_until=now;
  if(copy.cleanup_state==='cleaned')copy.cleanup_checked_at=now;
  return copy;
}
