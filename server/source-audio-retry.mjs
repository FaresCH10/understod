import {NOW,transaction} from './db.mjs';
import {scheduleAuthority} from './schedules.mjs';
import {briefingAudit} from './preparation.mjs';
import {ensureSourceAudioSchema} from './source-audio.mjs';
import {reviewRequestId} from './briefing-input.mjs';

export function sourceRetryInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input)
    || Object.keys(input).sort().join(',')!=='confirmed,requestId,sourceHash'
    || input.confirmed!==true || typeof input.sourceHash!=='string' || !/^[a-f0-9]{64}$/.test(input.sourceHash))throw Error('Invalid source retry request');
  reviewRequestId(input.requestId);return input;
}
export function sourceRetryReceipt(row) {
  return {found:true,retryId:row.retry_id,sourceRequestId:row.source_request_id,sourceHash:row.source_hash,
    acceptedAt:row.created_at instanceof Date?row.created_at.toISOString():row.created_at};
}
export function ensureSourceRetrySchema(db) {
  ensureSourceAudioSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS source_audio_retries (
    retry_id TEXT PRIMARY KEY,source_request_id TEXT NOT NULL REFERENCES source_audio_requests(request_id),
    org_id TEXT NOT NULL,site_id TEXT NOT NULL,requested_by TEXT NOT NULL,source_hash TEXT NOT NULL CHECK(length(source_hash)=64),created_at TEXT NOT NULL
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS source_audio_retries_scope BEFORE INSERT ON source_audio_retries
    WHEN NOT EXISTS(SELECT 1 FROM source_audio_requests WHERE request_id=NEW.source_request_id AND org_id=NEW.org_id
      AND site_id=NEW.site_id AND requested_by=NEW.requested_by AND request_hash=NEW.source_hash)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS source_audio_retries_no_update BEFORE UPDATE ON source_audio_retries
    BEGIN SELECT RAISE(ABORT,'Source retry history is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS source_audio_retries_no_delete BEFORE DELETE ON source_audio_retries
    BEGIN SELECT RAISE(ABORT,'Source retry history is immutable'); END;`);
}
export function retrySourceAudio(db,session,sourceId,input) {
  reviewRequestId(sourceId);sourceRetryInput(input);ensureSourceRetrySchema(db);
  return transaction(db,()=>{
    const authority=JSON.stringify(scheduleAuthority(db,session));
    const source=db.prepare('SELECT * FROM source_audio_requests WHERE request_id=? AND org_id=? AND site_id=? AND requested_by=?')
      .get(sourceId,session.org_id,session.site_id,session.principal_id);
    if(!source || source.request_hash!==input.sourceHash)throw Error('Source audio request conflict');
    if(db.prepare('SELECT 1 FROM source_audio_purges WHERE request_id=?').get(sourceId))throw Error('Source audio expired');
    if(source.authority_json!==authority)throw Error('Source audio authority changed');
    const old=db.prepare('SELECT * FROM source_audio_retries WHERE retry_id=?').get(input.requestId);
    if(old) {
      if(old.source_request_id!==sourceId || old.org_id!==session.org_id || old.site_id!==session.site_id
        || old.requested_by!==session.principal_id || old.source_hash!==input.sourceHash)throw Error('Source retry request conflict');
      return sourceRetryReceipt(old);
    }
    if(!source.received_at || source.briefing_id || !['blocked','failed'].includes(source.status))throw Error('Source retry state changed');
    const row={retry_id:input.requestId,source_request_id:sourceId,org_id:session.org_id,site_id:session.site_id,
      requested_by:session.principal_id,source_hash:input.sourceHash,created_at:NOW()};
    db.prepare('INSERT INTO source_audio_retries VALUES(?,?,?,?,?,?,?)').run(...Object.values(row));
    db.prepare("UPDATE source_audio_requests SET status='received',attempts=0,lease_token=NULL,lease_until=NULL,retry_at=NULL,error=NULL WHERE request_id=?").run(sourceId);
    briefingAudit(db,session,'briefing.source_audio_retry_requested',sourceId);
    return sourceRetryReceipt(row);
  });
}
export function getSourceRetryReceipt(db,session,sourceId,retryId) {
  reviewRequestId(sourceId);reviewRequestId(retryId);ensureSourceRetrySchema(db);
  return transaction(db,()=>{
    scheduleAuthority(db,session);
    const row=db.prepare('SELECT * FROM source_audio_retries WHERE retry_id=? AND source_request_id=? AND org_id=? AND site_id=? AND requested_by=?')
      .get(retryId,sourceId,session.org_id,session.site_id,session.principal_id);
    return row?sourceRetryReceipt(row):{found:false,retryId,sourceRequestId:sourceId};
  });
}
