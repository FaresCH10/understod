import {randomUUID} from 'node:crypto';
import {domainTransaction,requirePrincipal,domainAudit} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {requireSiteOperational} from './site-lifecycle.mjs';
import {staffRecordingInput,staffRecordingPage,staffRecordingReceipt,exactStaffRecording,inspectStaffRecording} from '../staff-case-recording-input.mjs';

async function scoped(client,session,caseId,write=false){
  await requirePrincipal(client,session,'staff',['owner','supervisor']);
  const find=()=>client.query(`SELECT c.id,c.status,c.assignment_id,a.worker_id,w.active,p.id AS publication_id,
    publication_content_available(p.id) AS content_available,
    EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=w.id) AS deleted,
    EXISTS(SELECT 1 FROM case_content_purges d WHERE d.case_id=c.id) AS expired,
    EXISTS(SELECT 1 FROM site_lifecycle l WHERE l.org_id=c.org_id AND l.site_id=c.site_id AND l.state='archived') AS archived
    FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
    JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
    JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id
    WHERE c.id=$1 AND c.org_id=$2 AND c.site_id=$3`,[caseId,session.org_id,session.site_id]);
  let row=(await find()).rows[0];if(!row)throw Error('Clarification unavailable');
  if(write){
    await requireSiteOperational(client,session.org_id,session.site_id);
    await client.query('SELECT id FROM workers WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR SHARE',[row.worker_id,session.org_id,session.site_id]);
    await client.query('SELECT id FROM assignments WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR UPDATE',[row.assignment_id,session.org_id,session.site_id]);
    await client.query('SELECT id FROM clarifications WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR UPDATE',[caseId,session.org_id,session.site_id]);
    row=(await find()).rows[0];if(!row||!recordable(row))throw Error('Staff recording unavailable');
  }
  return row;
}
const recordable=row=>row.status==='open'&&row.active&&!row.deleted&&!row.expired&&!row.archived&&row.content_available;
const available=`v.status='received' AND v.cleanup_state='active'
  AND NOT EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=v.worker_id)
  AND NOT EXISTS(SELECT 1 FROM case_content_purges d WHERE d.case_id=v.requested_case_id)
  AND NOT EXISTS(SELECT 1 FROM retention_policies p WHERE p.org_id=v.org_id AND p.site_id=v.site_id
    AND v.received_at<=clock_timestamp()-p.audio_days*interval '1 day')`;

export function staffCaseRecordingReceipt(pool,session,caseId,requestId,{schema='public'}={}){
  staffRecordingInput(caseId,requestId);
  return domainTransaction(pool,schema,async client=>{
    await scoped(client,session,caseId);
    return staffRecordingReceipt(exactStaffRecording((await client.query('SELECT * FROM case_voice WHERE request_id=$1',[requestId])).rows[0],session,caseId,requestId));
  });
}
export function listStaffCaseRecordings(pool,session,caseId,input={}, {schema='public'}={}){
  staffRecordingInput(caseId,'00000000-0000-4000-8000-000000000000');const page=staffRecordingPage(input);
  return responseRead(pool,schema,async client=>{
    const thread=await scoped(client,session,caseId),params=[caseId,session.org_id,session.site_id];
    const where="v.requested_case_id=$1 AND v.org_id=$2 AND v.site_id=$3 AND v.actor_type='staff' AND v.kind='in_person'";
    const total=Number((await client.query(`SELECT count(*) AS n FROM case_voice v WHERE ${where}`,params)).rows[0].n);
    if(total>50000)throw Error('Invalid staff recording page');
    const rows=(await client.query(`SELECT v.request_id,v.actor_id,v.actor_role,v.language,v.status,v.created_at,v.received_at,v.duration_seconds,s.name AS actor_name,
      (${available}) AS available FROM case_voice v LEFT JOIN staff s ON s.id=v.actor_id AND s.org_id=v.org_id AND s.site_id=v.site_id
      WHERE ${where} ORDER BY v.created_at DESC,v.request_id COLLATE "C" DESC LIMIT $4 OFFSET $5`,[...params,page.pageSize,(page.page-1)*page.pageSize])).rows;
    const iso=value=>value instanceof Date?value.toISOString():value??null;
    return {caseId,...page,total,canRecord:!!recordable(thread),items:rows.map(row=>({requestId:row.request_id,actorId:row.actor_id,actorRole:row.actor_role,actorName:row.actor_name??null,
      language:row.language,status:row.status,createdAt:iso(row.created_at),receivedAt:iso(row.received_at),durationSeconds:row.duration_seconds,available:row.available===true}))};
  });
}
export async function receiveStaffCaseRecording(pool,session,caseId,requestId,language,bytes,storage,{schema='public'}={}){
  staffRecordingInput(caseId,requestId,language);if(language===undefined)throw Error('Invalid staff recording request');
  const info=inspectStaffRecording(bytes);
  if(!storage||!['save','read','remove','exists'].every(key=>typeof storage[key]==='function'))throw Error('Staff recording unavailable');
  const staged=await domainTransaction(pool,schema,async client=>{
    await scoped(client,session,caseId);await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`case-voice:${requestId}`]);
    const old=(await client.query('SELECT * FROM case_voice WHERE request_id=$1',[requestId])).rows[0];
    if(old){exactStaffRecording(old,session,caseId,requestId);if(old.sha256!==info.sha256||old.bytes!==info.bytes||old.language!==language)throw Error('Staff recording conflict');return {receipt:staffRecordingReceipt(old)};}
    const thread=await scoped(client,session,caseId,true);
    if((await client.query('SELECT id FROM case_messages WHERE id=$1 UNION ALL SELECT id FROM case_followups WHERE id=$1',[requestId])).rows.length)throw Error('Staff recording conflict');
    return (await client.query(`INSERT INTO case_voice(id,request_id,org_id,site_id,assignment_id,worker_id,kind,requested_case_id,language,sha256,bytes,duration_seconds,status,lease_token,lease_until,actor_type,actor_id,actor_role)
      VALUES($1,$2,$3,$4,$5,$6,'in_person',$7,$8,$9,$10,$11,'storing',$12,clock_timestamp()+interval '120 seconds','staff',$13,$14) RETURNING *`,
    [randomUUID(),requestId,session.org_id,session.site_id,thread.assignment_id,thread.worker_id,caseId,language,info.sha256,info.bytes,info.durationSeconds,randomUUID(),session.principal_id,session.role])).rows[0];
  });
  if(staged.receipt)return staged.receipt;
  try{
    try{await storage.save(staged,bytes);}catch{/* Readback reconciles a lost conditional-save acknowledgement. */}
    const read=inspectStaffRecording(Buffer.from(await storage.read(staged)));if(read.sha256!==info.sha256||read.bytes!==info.bytes)throw Error('Staff recording audio unavailable');
    return await domainTransaction(pool,schema,async client=>{
      await scoped(client,session,caseId,true);
      const accepted=(await client.query(`UPDATE case_voice SET status='received',case_id=requested_case_id,received_at=clock_timestamp(),lease_token=NULL,lease_until=NULL
        WHERE id=$1 AND actor_type='staff' AND status='storing' AND cleanup_state='active' AND lease_token=$2 AND lease_until>clock_timestamp() RETURNING *`,[staged.id,staged.lease_token])).rows[0];
      if(!accepted)throw Error('Staff recording unavailable');
      await domainAudit(client,session,'clarification.in_person_recorded',requestId);return staffRecordingReceipt(accepted);
    });
  }catch{
    // Do not retire an object before checking an uncertain acceptance commit.
    return domainTransaction(pool,schema,async client=>{
      await scoped(client,session,caseId);
      const row=(await client.query('SELECT * FROM case_voice WHERE id=$1 FOR UPDATE',[staged.id])).rows[0];
      if(row?.received_at)return staffRecordingReceipt(row);
      const failed=(await client.query("UPDATE case_voice SET status='failed',lease_token=NULL,lease_until=NULL WHERE id=$1 AND status='storing' RETURNING *",[staged.id])).rows[0];
      if(!failed)throw Error('Staff recording unavailable');return staffRecordingReceipt(failed);
    });
  }
}
export async function getStaffCaseRecordingAudio(pool,session,caseId,requestId,storage,{schema='public'}={}){
  staffRecordingInput(caseId,requestId);
  const load=()=>domainTransaction(pool,schema,async client=>{
    await scoped(client,session,caseId);
    const row=(await client.query(`SELECT v.* FROM case_voice v WHERE v.request_id=$1 AND v.requested_case_id=$2 AND v.org_id=$3 AND v.site_id=$4
      AND v.actor_type='staff' AND v.kind='in_person' AND ${available}`,[requestId,caseId,session.org_id,session.site_id])).rows[0];
    if(!row)throw Error('Staff recording audio unavailable');return row;
  });
  const row=await load();let bytes;
  try{bytes=Buffer.from(await storage.read(row));const info=inspectStaffRecording(bytes);if(info.sha256!==row.sha256||info.bytes!==row.bytes)throw Error();}catch{throw Error('Staff recording audio unavailable');}
  const after=await load();if(after.id!==row.id||after.sha256!==row.sha256)throw Error('Staff recording audio unavailable');return bytes;
}
