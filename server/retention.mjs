import {randomUUID} from 'node:crypto';
import {NOW,transaction} from './db.mjs';
import {ensureRecordingSchema,DEFAULT_AUDIO_ROOT} from './recordings.mjs';
import {audioStore} from './private-storage.mjs';
import {audioRetentionDays as DAYS,retentionInput} from './retention-input.mjs';
import {staffRecoveryScope} from './staff-input.mjs';
import {ensureDeletionSchema} from './deletions.mjs';

export function ensureRetentionSchema(db){
  ensureRecordingSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS retention_policies (
    site_id TEXT PRIMARY KEY REFERENCES sites(id),org_id TEXT NOT NULL REFERENCES organizations(id),
    revision INTEGER NOT NULL CHECK(revision>0),audio_days INTEGER NOT NULL CHECK(audio_days IN (7,30,90,365)),updated_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS retention_requests (
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL,site_id TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES staff(id),
    request_json TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS recording_purges (
    recording_id TEXT PRIMARY KEY REFERENCES recordings(id),org_id TEXT NOT NULL,site_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('queued','processing','complete')),created_at TEXT NOT NULL,completed_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,lease_token TEXT,lease_until TEXT,retry_at TEXT,error TEXT
  ) STRICT;
  CREATE INDEX IF NOT EXISTS recording_purges_due ON recording_purges(status,retry_at,lease_until);
  CREATE TRIGGER IF NOT EXISTS retention_policy_scope BEFORE INSERT ON retention_policies WHEN
    NOT EXISTS(SELECT 1 FROM sites WHERE id=NEW.site_id AND org_id=NEW.org_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS retention_policy_scope_update BEFORE UPDATE ON retention_policies WHEN
    NEW.site_id<>OLD.site_id OR NEW.org_id<>OLD.org_id BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS recording_purges_scope BEFORE INSERT ON recording_purges WHEN
    NOT EXISTS(SELECT 1 FROM recordings WHERE id=NEW.recording_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS recording_purges_identity BEFORE UPDATE ON recording_purges WHEN
    NEW.recording_id<>OLD.recording_id OR NEW.org_id<>OLD.org_id OR NEW.site_id<>OLD.site_id OR NEW.created_at<>OLD.created_at
    OR OLD.status='complete' BEGIN SELECT RAISE(ABORT,'Purge history is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS recording_purges_no_delete BEFORE DELETE ON recording_purges
    BEGIN SELECT RAISE(ABORT,'Purge history is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS retention_requests_scope BEFORE INSERT ON retention_requests WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.actor_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;`);
  for(const action of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS retention_requests_frozen_${action.toLowerCase()}
    BEFORE ${action} ON retention_requests BEGIN SELECT RAISE(ABORT,'Retention receipt is immutable'); END;`);
}

function authority(db,session,write=false){
  if(session?.principal_type!=='staff' || !(write?['owner','administrator']:['owner','administrator','supervisor','auditor']).includes(session.role)
    || !db.prepare('SELECT id FROM staff WHERE id=? AND org_id=? AND site_id=? AND role=? AND active=1')
      .get(session.principal_id,session.org_id,session.site_id,session.role))throw new Error('Forbidden');
}
function policy(db,session){
  const row=db.prepare('SELECT * FROM retention_policies WHERE org_id=? AND site_id=?').get(session.org_id,session.site_id);
  return {revision:row?.revision || 0,audioDays:row?.audio_days ?? null,updatedAt:row?.updated_at || null};
}
export function getRetention(db,session){
  ensureRetentionSchema(db);authority(db,session);
  const jobs=db.prepare(`SELECT status,count(*) AS count FROM recording_purges WHERE org_id=? AND site_id=? GROUP BY status`).all(session.org_id,session.site_id);
  const sourceJobs=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='source_audio_purges'").get()
    ?db.prepare('SELECT status,count(*) AS count FROM source_audio_purges WHERE org_id=? AND site_id=? GROUP BY status').all(session.org_id,session.site_id):[];
  return {...policy(db,session),recoveryScope:staffRecoveryScope(session),canWrite:['owner','administrator'].includes(session.role),audioOptions:DAYS,
    jobs:Object.fromEntries(jobs.map(row=>[row.status,row.count])),sourceJobs:Object.fromEntries(sourceJobs.map(row=>[row.status,row.count])),activityRetention:'not_configured',
    limitations:'Audio cleanup applies to server worker recordings and supervisor source audio (original and canonical). Transcripts, drafts and response history have a separate retention lifecycle. Backups and disconnected devices are not erased by this operation.'};
}
export function retentionReceipt(db,session,requestId){
  ensureRetentionSchema(db);authority(db,session,true);
  retentionInput({requestId,revision:0,audioDays:7,confirmed:true});
  const row=db.prepare('SELECT * FROM retention_requests WHERE id=? AND org_id=? AND site_id=? AND actor_id=?')
    .get(requestId,session.org_id,session.site_id,session.principal_id);
  return row?{requestId:row.id,request:JSON.parse(row.request_json),revision:row.revision}:null;
}
export function saveRetention(db,session,input){
  ensureRetentionSchema(db);
  const parsed=retentionInput(input);
  return transaction(db,()=>{
    authority(db,session,true);
    const value=JSON.stringify(parsed);
    const old=db.prepare('SELECT * FROM retention_requests WHERE id=?').get(input.requestId);
    if(old){if(old.org_id!==session.org_id || old.site_id!==session.site_id || old.actor_id!==session.principal_id || old.request_json!==value)throw new Error('Retention request conflict');return {revision:old.revision,duplicate:true};}
    if(policy(db,session).revision!==input.revision)throw new Error('Retention revision changed');
    const revision=input.revision+1,now=NOW();
    db.prepare(`INSERT INTO retention_policies VALUES(?,?,?,?,?) ON CONFLICT(site_id) DO UPDATE SET
      revision=excluded.revision,audio_days=excluded.audio_days,updated_at=excluded.updated_at`).run(session.site_id,session.org_id,revision,input.audioDays,now);
    db.prepare('INSERT INTO retention_requests VALUES(?,?,?,?,?,?,?)').run(input.requestId,session.org_id,session.site_id,session.principal_id,value,revision,now);
    db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),session.org_id,session.site_id,'staff',session.principal_id,'retention.policy.updated',session.site_id,now);
    return {revision,duplicate:false};
  });
}

export async function processOneAudioPurge(db,storage=DEFAULT_AUDIO_ROOT,{now=NOW()}={}){
  ensureRetentionSchema(db);ensureDeletionSchema(db);
  const claimed=transaction(db,()=>{
    // Fence processing before object deletion; keep the row for retry and receipt history.
    const expired=db.prepare(`SELECT r.*,EXISTS(SELECT 1 FROM worker_deletion_requests x WHERE x.worker_id=a.worker_id) AS deletion_pending
      FROM recordings r JOIN assignments a ON a.id=r.assignment_id
      LEFT JOIN retention_policies p ON p.site_id=r.site_id AND p.org_id=r.org_id
      WHERE r.status<>'storing' AND ((r.received_at IS NOT NULL AND julianday(r.received_at)<=julianday(?)-p.audio_days)
      OR EXISTS(SELECT 1 FROM worker_deletion_requests x WHERE x.worker_id=a.worker_id))
      AND NOT EXISTS(SELECT 1 FROM recording_purges d WHERE d.recording_id=r.id) ORDER BY r.received_at,r.id LIMIT 1`).get(now);
    if(expired){
      db.prepare("INSERT INTO recording_purges(recording_id,org_id,site_id,status,created_at) VALUES(?,?,?,'queued',?)").run(expired.id,expired.org_id,expired.site_id,now);
      db.prepare("UPDATE recordings SET status='failed',lease_token=NULL,lease_until=NULL,retry_at=NULL,error=? WHERE id=?")
        .run(expired.deletion_pending?'Worker deletion pending':'Audio retention expired',expired.id);
    }
    const row=db.prepare(`SELECT r.*,d.attempts AS purge_attempts FROM recording_purges d JOIN recordings r ON r.id=d.recording_id
      WHERE (d.status='queued' AND (d.retry_at IS NULL OR d.retry_at<=?)) OR (d.status='processing' AND d.lease_until<=?)
      ORDER BY d.created_at,d.recording_id LIMIT 1`).get(now,now);
    if(!row)return null;
    const token=randomUUID();
    db.prepare("UPDATE recording_purges SET status='processing',attempts=attempts+1,lease_token=?,lease_until=?,retry_at=NULL,error=NULL WHERE recording_id=?")
      .run(token,new Date(Date.parse(now)+90_000).toISOString(),row.id);
    return {...row,token};
  });
  if(!claimed)return false;
  try{
    const store=audioStore(storage);
    await store.remove(claimed);
    if(typeof store.exists!=='function' || await store.exists(claimed)!==false)throw new Error('Private audio absence not verified');
    transaction(db,()=>{
      const completedAt=NOW();
      const updated=db.prepare("UPDATE recording_purges SET status='complete',completed_at=?,lease_token=NULL,lease_until=NULL,error=NULL WHERE recording_id=? AND status='processing' AND lease_token=? AND lease_until>?")
        .run(completedAt,claimed.id,claimed.token,completedAt);
      if(updated.changes)db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),claimed.org_id,claimed.site_id,'system','retention-worker','recording.audio.purged',claimed.id,NOW());
    });
  }catch{
    db.prepare("UPDATE recording_purges SET status='queued',lease_token=NULL,lease_until=NULL,retry_at=?,error='Private audio cleanup failed' WHERE recording_id=? AND status='processing' AND lease_token=?")
      .run(new Date(Date.parse(now)+Math.min(3600,30*2**Math.min(claimed.purge_attempts,7))*1000).toISOString(),claimed.id,claimed.token);
  }
  return true;
}
