import {randomUUID} from 'node:crypto';
import {NOW,transaction} from './db.mjs';
import {requireClarificationPrincipal} from './clarifications.mjs';
import {requireSiteOperational} from './site-lifecycle.mjs';
import {staffRecordingInput,staffRecordingPage,staffRecordingReceipt,exactStaffRecording,inspectStaffRecording} from './staff-case-recording-input.mjs';

function scoped(db,session,caseId,write=false){
  requireClarificationPrincipal(db,session,'staff',true);
  const row=db.prepare(`SELECT c.id,c.status,c.reason,c.assignment_id,a.worker_id,w.active,
    EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=w.id) AS deleted,
    EXISTS(SELECT 1 FROM site_lifecycle l WHERE l.org_id=c.org_id AND l.site_id=a.site_id AND l.state='archived') AS archived
    FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id
    JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
    WHERE c.id=? AND c.org_id=? AND a.site_id=?`).get(caseId,session.org_id,session.site_id);
  if(!row)throw Error('Clarification unavailable');
  if(write){requireSiteOperational(db,session.org_id,session.site_id);if(!recordable(row))throw Error('Staff recording unavailable');}return row;
}
const recordable=row=>row.status==='open'&&row.active===1&&!row.deleted&&!row.archived&&!['[Deleted]','[Expired]'].includes(row.reason);
const available=`v.status='received' AND v.cleanup_state='active'
  AND NOT EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=v.worker_id)
  AND NOT EXISTS(SELECT 1 FROM clarifications c WHERE c.id=v.requested_case_id AND c.reason IN ('[Deleted]','[Expired]'))
  AND NOT EXISTS(SELECT 1 FROM retention_policies p WHERE p.org_id=v.org_id AND p.site_id=v.site_id
    AND julianday(v.received_at)<=julianday('now')-p.audio_days)`;
export function staffCaseRecordingReceipt(db,session,caseId,requestId){
  staffRecordingInput(caseId,requestId);scoped(db,session,caseId);
  return staffRecordingReceipt(exactStaffRecording(db.prepare('SELECT * FROM case_voice WHERE request_id=?').get(requestId),session,caseId,requestId));
}
export function listStaffCaseRecordings(db,session,caseId,input={}){
  staffRecordingInput(caseId,'00000000-0000-4000-8000-000000000000');const page=staffRecordingPage(input);
  db.exec('BEGIN');try{
    const thread=scoped(db,session,caseId),params=[caseId,session.org_id,session.site_id],where="v.requested_case_id=? AND v.org_id=? AND v.site_id=? AND v.actor_type='staff' AND v.kind='in_person'";
    const total=db.prepare(`SELECT count(*) n FROM case_voice v WHERE ${where}`).get(...params).n;if(total>50000)throw Error('Invalid staff recording page');
    const rows=db.prepare(`SELECT v.request_id,v.actor_id,v.actor_role,v.language,v.status,v.created_at,v.received_at,v.duration_seconds,s.name AS actor_name,
      (${available}) AS available FROM case_voice v LEFT JOIN staff s ON s.id=v.actor_id AND s.org_id=v.org_id AND s.site_id=v.site_id
      WHERE ${where} ORDER BY v.created_at DESC,v.request_id COLLATE BINARY DESC LIMIT ? OFFSET ?`).all(...params,page.pageSize,(page.page-1)*page.pageSize);
    const result={caseId,...page,total,canRecord:!!recordable(thread),items:rows.map(row=>({requestId:row.request_id,actorId:row.actor_id,actorRole:row.actor_role,actorName:row.actor_name??null,
      language:row.language,status:row.status,createdAt:row.created_at,receivedAt:row.received_at,durationSeconds:row.duration_seconds,available:row.available===1}))};db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
export async function receiveStaffCaseRecording(db,session,caseId,requestId,language,bytes,storage){
  staffRecordingInput(caseId,requestId,language);if(language===undefined)throw Error('Invalid staff recording request');const info=inspectStaffRecording(bytes);
  if(!storage||!['save','read','remove','exists'].every(key=>typeof storage[key]==='function'))throw Error('Staff recording unavailable');
  const staged=transaction(db,()=>{
    scoped(db,session,caseId);const old=db.prepare('SELECT * FROM case_voice WHERE request_id=?').get(requestId);
    if(old){exactStaffRecording(old,session,caseId,requestId);if(old.sha256!==info.sha256||old.bytes!==info.bytes||old.language!==language)throw Error('Staff recording conflict');return {receipt:staffRecordingReceipt(old)};}
    const thread=scoped(db,session,caseId,true);
    if(db.prepare('SELECT 1 FROM case_messages WHERE id=?').get(requestId))throw Error('Staff recording conflict');
    const id=randomUUID();db.prepare(`INSERT INTO case_voice(id,request_id,org_id,site_id,assignment_id,worker_id,kind,requested_case_id,language,sha256,bytes,duration_seconds,status,lease_token,lease_until,actor_type,actor_id,actor_role,created_at)
      VALUES(?,?,?,?,?,?,'in_person',?,?,?,?,?,'storing',?,?,'staff',?,?,?)`).run(id,requestId,session.org_id,session.site_id,thread.assignment_id,thread.worker_id,caseId,language,info.sha256,info.bytes,info.durationSeconds,randomUUID(),new Date(Date.now()+120000).toISOString(),session.principal_id,session.role,NOW());
    return db.prepare('SELECT * FROM case_voice WHERE id=?').get(id);
  });
  if(staged.receipt)return staged.receipt;
  try{
    try{await storage.save(staged,bytes);}catch{/* Exact readback can recover a lost save acknowledgement. */}
    const read=inspectStaffRecording(Buffer.from(await storage.read(staged)));if(read.sha256!==info.sha256||read.bytes!==info.bytes)throw Error('Staff recording audio unavailable');
    return transaction(db,()=>{
      scoped(db,session,caseId,true);const now=NOW();
      const changed=db.prepare(`UPDATE case_voice SET status='received',case_id=requested_case_id,received_at=?,lease_token=NULL,lease_until=NULL
        WHERE id=? AND actor_type='staff' AND status='storing' AND cleanup_state='active' AND lease_token=? AND lease_until>?`).run(now,staged.id,staged.lease_token,now);
      if(!changed.changes)throw Error('Staff recording unavailable');
      db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),session.org_id,session.site_id,'staff',session.principal_id,'clarification.in_person_recorded',requestId,now);
      return staffRecordingReceipt(db.prepare('SELECT * FROM case_voice WHERE id=?').get(staged.id));
    });
  }catch{
    return transaction(db,()=>{
      scoped(db,session,caseId);const row=db.prepare('SELECT * FROM case_voice WHERE id=?').get(staged.id);
      if(row?.received_at)return staffRecordingReceipt(row);
      db.prepare("UPDATE case_voice SET status='failed',lease_token=NULL,lease_until=NULL WHERE id=? AND status='storing'").run(staged.id);
      const failed=db.prepare('SELECT * FROM case_voice WHERE id=?').get(staged.id);if(!failed)throw Error('Staff recording unavailable');return staffRecordingReceipt(failed);
    });
  }
}
export async function getStaffCaseRecordingAudio(db,session,caseId,requestId,storage){
  staffRecordingInput(caseId,requestId);
  const load=()=>{scoped(db,session,caseId);const row=db.prepare(`SELECT v.* FROM case_voice v WHERE v.request_id=? AND v.requested_case_id=? AND v.org_id=? AND v.site_id=?
    AND v.actor_type='staff' AND v.kind='in_person' AND ${available}`).get(requestId,caseId,session.org_id,session.site_id);if(!row)throw Error('Staff recording audio unavailable');return row;};
  const row=load();let bytes;try{bytes=Buffer.from(await storage.read(row));const info=inspectStaffRecording(bytes);if(info.sha256!==row.sha256||info.bytes!==row.bytes)throw Error();}catch{throw Error('Staff recording audio unavailable');}
  const after=load();if(after.id!==row.id||after.sha256!==row.sha256)throw Error('Staff recording audio unavailable');return bytes;
}
export async function processOneStaffCaseRecordingPurge(db,storage){
  const job=transaction(db,()=>{
    const row=db.prepare(`SELECT v.* FROM case_voice v LEFT JOIN retention_policies p ON p.org_id=v.org_id AND p.site_id=v.site_id WHERE
      (v.cleanup_state='active' AND (v.status='failed' OR v.status='storing' AND v.lease_until<=?
        OR EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=v.worker_id)
        OR EXISTS(SELECT 1 FROM clarifications c WHERE c.id=v.requested_case_id AND c.reason IN ('[Deleted]','[Expired]'))
        OR julianday(v.received_at)<=julianday('now')-p.audio_days)) OR v.cleanup_state='cleaning' AND v.cleanup_until<=?
        OR v.cleanup_state='cleaned' AND v.cleanup_checked_at<=? ORDER BY v.created_at,v.id LIMIT 1`).get(NOW(),NOW(),new Date(Date.now()-3600000).toISOString());
    if(!row)return null;const token=randomUUID();if(row.cleanup_state!=='cleaned')db.prepare(`UPDATE case_voice SET cleanup_state='cleaning',cleanup_token=?,cleanup_until=?,
      status=CASE WHEN status='storing' THEN 'failed' ELSE status END,lease_token=NULL,lease_until=NULL WHERE id=?`).run(token,new Date(Date.now()+90000).toISOString(),row.id);
    else db.prepare('UPDATE case_voice SET cleanup_checked_at=? WHERE id=?').run(NOW(),row.id);return {...row,token};
  });
  if(!job)return false;
  try{
    await storage.remove(job);if(await storage.exists(job)!==false)throw Error('Staff recording cleanup incomplete');
    transaction(db,()=>{const changed=db.prepare("UPDATE case_voice SET cleanup_state='cleaned',cleanup_token=NULL,cleanup_until=NULL,cleanup_checked_at=? WHERE id=? AND cleanup_state='cleaning' AND cleanup_token=? AND cleanup_until>?").run(NOW(),job.id,job.token,NOW());
      if(changed.changes)db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),job.org_id,job.site_id,'system','case-voice-retention','clarification.voice_purged',job.request_id,NOW());});
  }catch{/* Retryable cleanup never reports absence before removal is verified. */}
  return true;
}
