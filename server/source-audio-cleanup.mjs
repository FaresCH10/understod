import {randomUUID} from 'node:crypto';
import {NOW,transaction} from './db.mjs';
import {ensureSourceAudioSchema} from './source-audio.mjs';
import {ensureRetentionSchema} from './retention.mjs';
import {sourceAudioReferences} from './source-audio-input.mjs';
import {audioStore} from './private-storage.mjs';
import {DEFAULT_AUDIO_ROOT} from './recordings.mjs';

export async function processSourceAudioCleanup(journal,storage) {
  const row=await journal.claim();if(!row)return false;
  try {
    const refs=sourceAudioReferences(row);
    await storage.removeOriginal(refs.original);await storage.remove(refs.canonical);
    if(await storage.existsOriginal(refs.original) || await storage.exists(refs.canonical))throw Error('Source objects remain');
    await journal.finish(row);
  }catch {await journal.fail(row);}
  return true;
}
export function sourceAudioCleanupJournal(db,{now:fixedNow}={}) {
  const clock=()=>fixedNow ?? NOW();
  if(!Number.isFinite(Date.parse(clock())))throw Error('Invalid cleanup clock');
  ensureSourceAudioSchema(db);ensureRetentionSchema(db);
  return {
    claim(){return transaction(db,()=>{
      const now=clock();
      const expired=db.prepare(`SELECT r.* FROM source_audio_requests r LEFT JOIN retention_policies p ON p.org_id=r.org_id AND p.site_id=r.site_id
        WHERE NOT EXISTS(SELECT 1 FROM source_audio_purges d WHERE d.request_id=r.request_id)
          AND ((r.received_at IS NULL AND julianday(r.created_at)<=julianday(?)-1 AND (r.lease_until IS NULL OR r.lease_until<=?))
            OR (r.received_at IS NOT NULL AND julianday(r.received_at)<=julianday(?)-p.audio_days))
        ORDER BY r.created_at,r.request_id LIMIT 1`).get(now,now,now);
      if(expired){
        db.prepare("INSERT INTO source_audio_purges(request_id,org_id,site_id,reason,status,created_at) VALUES(?,?,?,?,'queued',?)")
          .run(expired.request_id,expired.org_id,expired.site_id,expired.received_at?'audio_retention':'staged_expired',now);
        db.prepare('UPDATE source_audio_requests SET lease_token=NULL,lease_until=NULL,retry_at=NULL WHERE request_id=?').run(expired.request_id);
      }
      const row=db.prepare(`SELECT r.*,d.attempts AS purge_attempts,d.completed_at AS purge_completed_at FROM source_audio_purges d
        JOIN source_audio_requests r ON r.request_id=d.request_id WHERE
        (d.status='queued' AND (d.retry_at IS NULL OR d.retry_at<=?)) OR (d.status='processing' AND d.lease_until<=?)
        OR (d.status='complete' AND julianday(d.verified_at)<=julianday(?)-1.0/24)
        ORDER BY COALESCE(d.verified_at,d.created_at),d.request_id LIMIT 1`).get(now,now,now);
      if(!row)return null;const token=randomUUID();
      db.prepare("UPDATE source_audio_purges SET status='processing',attempts=attempts+1,lease_token=?,lease_until=?,retry_at=NULL,error=NULL WHERE request_id=?")
        .run(token,new Date(Date.parse(now)+90000).toISOString(),row.request_id);
      return {...row,token};
    });},
    finish(row){return transaction(db,()=>{
      const now=clock();
      const result=db.prepare("UPDATE source_audio_purges SET status='complete',completed_at=COALESCE(completed_at,?),verified_at=?,lease_token=NULL,lease_until=NULL,retry_at=NULL,error=NULL WHERE request_id=? AND status='processing' AND lease_token=? AND lease_until>?")
        .run(now,now,row.request_id,row.token,now);
      if(result.changes && !row.purge_completed_at)db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)')
        .run(randomUUID(),row.org_id,row.site_id,'system','retention-worker','briefing.source_audio_purged',row.request_id,now);
    });},
    fail(row){db.prepare("UPDATE source_audio_purges SET status='queued',lease_token=NULL,lease_until=NULL,retry_at=?,error='Private source cleanup failed' WHERE request_id=? AND status='processing' AND lease_token=?")
      .run(new Date(Date.parse(clock())+Math.min(3600,30*2**Math.min(row.purge_attempts,7))*1000).toISOString(),row.request_id,row.token);},
  };
}
export async function processOneSourceAudioCleanup(db,storage=DEFAULT_AUDIO_ROOT,options) {
  return processSourceAudioCleanup(sourceAudioCleanupJournal(db,options),audioStore(storage));
}
