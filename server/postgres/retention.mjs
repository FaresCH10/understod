import {randomUUID} from 'node:crypto';
import {domainTransaction,requirePrincipal,domainAudit} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {audioRetentionDays,retentionInput} from '../retention-input.mjs';
import {staffRecoveryScope} from '../staff-input.mjs';

export function getRetention(pool,session,{schema='public'}={}){
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','administrator','supervisor','auditor']);
    const policy=(await client.query('SELECT revision,audio_days,updated_at FROM retention_policies WHERE org_id=$1 AND site_id=$2',[session.org_id,session.site_id])).rows[0];
    const jobs=(await client.query('SELECT status,count(*)::integer AS count FROM recording_purges WHERE org_id=$1 AND site_id=$2 GROUP BY status',[session.org_id,session.site_id])).rows;
    const sourceJobs=(await client.query('SELECT status,count(*)::integer AS count FROM source_audio_purges WHERE org_id=$1 AND site_id=$2 GROUP BY status',[session.org_id,session.site_id])).rows;
    return {revision:policy?.revision || 0,audioDays:policy?.audio_days ?? null,updatedAt:policy?.updated_at || null,textRetentionAvailable:true,caseRetentionAvailable:true,generatedRetentionAvailable:true,activityRetentionAvailable:true,briefingRetentionAvailable:true,
      recoveryScope:staffRecoveryScope(session),canWrite:['owner','administrator'].includes(session.role),audioOptions:audioRetentionDays,jobs:Object.fromEntries(jobs.map(row=>[row.status,row.count])),sourceJobs:Object.fromEntries(sourceJobs.map(row=>[row.status,row.count])),activityRetention:'separate_policy',
      limitations:'Audio cleanup applies to the current application storage view of worker recordings and supervisor source audio (original and canonical). Transcripts, drafts and response history have a separate retention lifecycle. Provider history, backups and disconnected devices are not verified as erased by this operation.'};
  });
}
export function retentionReceipt(pool,session,requestId,{schema='public'}={}){
  retentionInput({requestId,revision:0,audioDays:7,confirmed:true});
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','administrator']);
    const row=(await client.query('SELECT * FROM retention_requests WHERE id=$1 AND org_id=$2 AND site_id=$3 AND actor_id=$4',[requestId,session.org_id,session.site_id,session.principal_id])).rows[0];
    return row?{requestId:row.id,request:row.request_json,revision:row.revision}:null;
  });
}
export function saveRetention(pool,session,input,{schema='public'}={}){
  const value=retentionInput(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','administrator']);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`retention:${input.requestId}`]);
    const old=(await client.query('SELECT * FROM retention_requests WHERE id=$1',[input.requestId])).rows[0];
    if(old){if(old.org_id!==session.org_id || old.site_id!==session.site_id || old.actor_id!==session.principal_id || old.request_json.revision!==value.revision || old.request_json.audioDays!==value.audioDays || old.request_json.confirmed!==true)throw new Error('Retention request conflict');return {revision:old.revision,duplicate:true};}
    await client.query('SELECT id FROM sites WHERE id=$1 AND org_id=$2 FOR UPDATE',[session.site_id,session.org_id]);
    const current=(await client.query('SELECT revision FROM retention_policies WHERE site_id=$1 AND org_id=$2',[session.site_id,session.org_id])).rows[0];
    if((current?.revision || 0)!==value.revision)throw new Error('Retention revision changed');
    const revision=value.revision+1;
    await client.query(`INSERT INTO retention_policies VALUES($1,$2,$3,$4,clock_timestamp()) ON CONFLICT(site_id) DO UPDATE SET
      revision=excluded.revision,audio_days=excluded.audio_days,updated_at=excluded.updated_at`,[session.site_id,session.org_id,revision,value.audioDays]);
    await client.query('INSERT INTO retention_requests VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())',[input.requestId,session.org_id,session.site_id,session.principal_id,JSON.stringify(value),revision]);
    await domainAudit(client,session,'retention.policy.updated',session.site_id);
    return {revision,duplicate:false};
  });
}
export async function processOneAudioPurge(pool,storage,{schema='public'}={}){
  const claimed=await domainTransaction(pool,schema,async client=>{
    const expired=(await client.query(`SELECT r.*,EXISTS(SELECT 1 FROM worker_deletion_requests x WHERE x.worker_id=a.worker_id) AS deletion_pending
      FROM recordings r JOIN assignments a ON a.id=r.assignment_id
      LEFT JOIN retention_policies p ON p.site_id=r.site_id AND p.org_id=r.org_id
      WHERE r.status<>'storing' AND ((r.received_at IS NOT NULL AND r.received_at<=clock_timestamp()-p.audio_days*interval '1 day')
      OR EXISTS(SELECT 1 FROM worker_deletion_requests x WHERE x.worker_id=a.worker_id))
      AND NOT EXISTS(SELECT 1 FROM recording_purges d WHERE d.recording_id=r.id)
      ORDER BY r.received_at,r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`)).rows[0];
    if(expired){
      await client.query("INSERT INTO recording_purges(recording_id,org_id,site_id,status,created_at) VALUES($1,$2,$3,'queued',clock_timestamp())",[expired.id,expired.org_id,expired.site_id]);
      await client.query("UPDATE recordings SET status='failed',lease_token=NULL,lease_until=NULL,retry_at=NULL,error=$2 WHERE id=$1",[expired.id,expired.deletion_pending?'Worker deletion pending':'Audio retention expired']);
    }
    const row=(await client.query(`SELECT r.*,d.attempts AS purge_attempts FROM recording_purges d JOIN recordings r ON r.id=d.recording_id
      WHERE (d.status='queued' AND (d.retry_at IS NULL OR d.retry_at<=clock_timestamp())) OR (d.status='processing' AND d.lease_until<=clock_timestamp())
      ORDER BY d.created_at,d.recording_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED`)).rows[0];
    if(!row)return null;
    const token=randomUUID();
    await client.query("UPDATE recording_purges SET status='processing',attempts=attempts+1,lease_token=$1,lease_until=clock_timestamp()+interval '90 seconds',retry_at=NULL,error=NULL WHERE recording_id=$2",[token,row.id]);
    return {...row,token};
  });
  if(!claimed)return false;
  try{
    await storage.remove(claimed);
    if(typeof storage.exists!=='function' || await storage.exists(claimed)!==false)throw new Error('Private audio absence not verified');
    await domainTransaction(pool,schema,async client=>{
      const result=await client.query("UPDATE recording_purges SET status='complete',completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,error=NULL WHERE recording_id=$1 AND status='processing' AND lease_token=$2 AND lease_until>clock_timestamp()",[claimed.id,claimed.token]);
      if(result.rowCount)await client.query('INSERT INTO audit(id,org_id,site_id,actor_type,actor_id,action,object_id) VALUES($1,$2,$3,\'system\',\'retention-worker\',\'recording.audio.purged\',$4)',[randomUUID(),claimed.org_id,claimed.site_id,claimed.id]);
    });
  }catch{
    await domainTransaction(pool,schema,client=>client.query("UPDATE recording_purges SET status='queued',lease_token=NULL,lease_until=NULL,retry_at=clock_timestamp()+$1*interval '1 second',error='Private audio cleanup failed' WHERE recording_id=$2 AND status='processing' AND lease_token=$3",[Math.min(3600,30*2**Math.min(claimed.purge_attempts,7)),claimed.id,claimed.token]));
  }
  return true;
}
