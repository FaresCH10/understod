import {NOW,transaction} from './db.mjs';
import {scheduleAuthority} from './schedules.mjs';
import {briefingAudit} from './preparation.mjs';
import {ensureRecordingSchema} from './recordings.mjs';
import {processingRetryJob,processingRetryId,processingRetryInput,processingRetryReceipt} from './processing-retry-input.mjs';
export function ensureProcessingRetrySchema(db){
  ensureRecordingSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS processing_retries (
    request_id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),requested_by TEXT NOT NULL REFERENCES staff(id),
    kind TEXT NOT NULL CHECK(kind='response_transcription'),job_id TEXT NOT NULL REFERENCES recordings(id),publication_id TEXT NOT NULL REFERENCES publications(id),assignment_id TEXT NOT NULL REFERENCES assignments(id),
    generation INTEGER NOT NULL CHECK(generation BETWEEN 0 AND 1000000),request_json TEXT NOT NULL CHECK(json_valid(request_json)),created_at TEXT NOT NULL,UNIQUE(kind,job_id,generation),
    CHECK(json_type(request_json)='object' AND json_remove(request_json,'$.jobId','$.publicationId','$.assignmentId','$.generation','$.confirmed')='{}'),
    CHECK(json_type(request_json,'$.jobId') IS 'text' AND json_extract(request_json,'$.jobId')=kind||':'||job_id),
    CHECK(json_type(request_json,'$.publicationId') IS 'text' AND json_extract(request_json,'$.publicationId')=publication_id),
    CHECK(json_type(request_json,'$.assignmentId') IS 'text' AND json_extract(request_json,'$.assignmentId')=assignment_id),
    CHECK(json_type(request_json,'$.generation') IS 'integer' AND json_extract(request_json,'$.generation')=generation),
    CHECK(json_type(request_json,'$.confirmed') IS 'true')
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS processing_retries_scope BEFORE INSERT ON processing_retries
    WHEN NOT EXISTS(SELECT 1 FROM recordings r JOIN assignments a ON a.id=r.assignment_id AND a.org_id=r.org_id AND a.site_id=r.site_id
      JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id
      JOIN staff s ON s.id=NEW.requested_by AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id
      WHERE r.id=NEW.job_id AND r.org_id=NEW.org_id AND r.site_id=NEW.site_id AND r.assignment_id=NEW.assignment_id AND a.publication_id=NEW.publication_id AND r.received_at IS NOT NULL)
    BEGIN SELECT RAISE(ABORT,'Processing retry scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS processing_retries_update BEFORE UPDATE ON processing_retries BEGIN SELECT RAISE(ABORT,'Processing retry receipt is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS processing_retries_delete BEFORE DELETE ON processing_retries BEGIN SELECT RAISE(ABORT,'Processing retry receipt is immutable'); END;`);
}
const present=(db,name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
function jobRow(db,session,jobId){
  const job=processingRetryJob(jobId);if(job.kind!=='response_transcription')throw Error('Processing retry unavailable');
  const row=db.prepare(`SELECT r.*,a.publication_id,a.worker_id,p.briefing_id,w.active AS worker_active,
    EXISTS(SELECT 1 FROM attempts t WHERE t.assignment_id=r.assignment_id AND t.submission_id=r.submission_id) AS assessed
    FROM recordings r JOIN assignments a ON a.id=r.assignment_id AND a.org_id=r.org_id AND a.site_id=r.site_id
    JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id
    JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
    WHERE r.id=? AND r.org_id=? AND r.site_id=?`).get(job.id,session.org_id,session.site_id);
  if(!row || !row.received_at)throw Error('Processing retry unavailable');return row;
}
function available(db,row){
  if(!row.worker_active || row.assessed || !['failed','blocked'].includes(row.status) || row.lease_token!==null || row.lease_until!==null)return false;
  for(const [table,column,value] of [['worker_deletion_requests','worker_id',row.worker_id],['recording_purges','recording_id',row.id],['briefing_content_purges','briefing_id',row.briefing_id]])
    if(present(db,table) && db.prepare(`SELECT 1 FROM ${table} WHERE ${column}=?`).get(value))return false;
  if(present(db,'text_retention_purges') && db.prepare("SELECT 1 FROM text_retention_purges WHERE kind='recording' AND reference_id=?").get(row.id))return false;
  if(present(db,'retention_policies')){const policy=db.prepare('SELECT audio_days FROM retention_policies WHERE org_id=? AND site_id=?').get(row.org_id,row.site_id);
    if(policy?.audio_days!==null && policy?.audio_days!==undefined && Date.parse(row.received_at)<=Date.now()-policy.audio_days*86400000)return false;}
  return true;
}
const generation=(db,id)=>db.prepare("SELECT count(*) AS n FROM processing_retries WHERE kind='response_transcription' AND job_id=?").get(id).n;
export function getProcessingRetryContext(db,session,jobId){
  scheduleAuthority(db,session);ensureProcessingRetrySchema(db);
  return transaction(db,()=>{scheduleAuthority(db,session);const row=jobRow(db,session,jobId);return {jobId,publicationId:row.publication_id,assignmentId:row.assignment_id,generation:generation(db,row.id),status:row.status==='received'?'queued':row.status==='transcribed'?'complete':row.status,available:available(db,row)};});
}
export function getProcessingRetryReceipt(db,session,jobId,requestId){
  processingRetryJob(jobId);processingRetryId(requestId);scheduleAuthority(db,session);ensureProcessingRetrySchema(db);
  return transaction(db,()=>{scheduleAuthority(db,session);const job=processingRetryJob(jobId),row=db.prepare('SELECT * FROM processing_retries WHERE request_id=? AND kind=? AND job_id=? AND org_id=? AND site_id=? AND requested_by=?').get(requestId,job.kind,job.id,session.org_id,session.site_id,session.principal_id);
    return row?processingRetryReceipt({...row,request_json:JSON.parse(row.request_json)}):{found:false};});
}
export function retryProcessing(db,session,jobId,input){
  const request=processingRetryInput(jobId,input),{requestId,...body}=request,job=processingRetryJob(jobId);scheduleAuthority(db,session);ensureProcessingRetrySchema(db);
  return transaction(db,()=>{
    scheduleAuthority(db,session);const old=db.prepare('SELECT * FROM processing_retries WHERE request_id=?').get(requestId);
    if(old){if(old.org_id!==session.org_id || old.site_id!==session.site_id || old.requested_by!==session.principal_id || old.kind!==job.kind || old.job_id!==job.id || old.request_json!==JSON.stringify(body))throw Error('Processing retry request conflict');return processingRetryReceipt({...old,request_json:JSON.parse(old.request_json)}).result;}
    const current=jobRow(db,session,jobId);
    if(current.publication_id!==request.publicationId || current.assignment_id!==request.assignmentId || generation(db,current.id)!==request.generation || !available(db,current))throw Error('Processing retry state changed');
    const row={request_id:requestId,org_id:session.org_id,site_id:session.site_id,requested_by:session.principal_id,kind:job.kind,job_id:job.id,publication_id:request.publicationId,assignment_id:request.assignmentId,generation:request.generation,request_json:JSON.stringify(body),created_at:NOW()};
    db.prepare('INSERT INTO processing_retries VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row));
    db.prepare("UPDATE recordings SET status='received',attempts=0,lease_token=NULL,lease_until=NULL,retry_at=NULL,error=NULL WHERE id=?").run(job.id);
    briefingAudit(db,session,'answer.processing_retry_requested',job.id);
    return processingRetryReceipt({...row,request_json:body}).result;
  });
}
