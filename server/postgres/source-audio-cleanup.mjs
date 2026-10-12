import {randomUUID} from 'node:crypto';
import {domainTransaction} from './domain.mjs';
import {processSourceAudioCleanup} from '../source-audio-cleanup.mjs';

export function sourceAudioCleanupJournal(pool,{schema='public'}={}) {
  const run=fn=>domainTransaction(pool,schema,fn);
  return {
    claim(){return run(async client=>{
      const expired=(await client.query(`SELECT r.* FROM source_audio_requests r LEFT JOIN retention_policies p ON p.org_id=r.org_id AND p.site_id=r.site_id
        WHERE NOT EXISTS(SELECT 1 FROM source_audio_purges d WHERE d.request_id=r.request_id)
          AND ((r.received_at IS NULL AND r.created_at<=clock_timestamp()-interval '1 day' AND (r.lease_until IS NULL OR r.lease_until<=clock_timestamp()))
            OR (r.received_at IS NOT NULL AND r.received_at<=clock_timestamp()-p.audio_days*interval '1 day'))
        ORDER BY r.created_at,r.request_id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`)).rows[0];
      if(expired){
        await client.query("INSERT INTO source_audio_purges(request_id,org_id,site_id,reason,status,created_at) VALUES($1,$2,$3,$4,'queued',clock_timestamp())",[expired.request_id,expired.org_id,expired.site_id,expired.received_at?'audio_retention':'staged_expired']);
        await client.query('UPDATE source_audio_requests SET lease_token=NULL,lease_until=NULL,retry_at=NULL WHERE request_id=$1',[expired.request_id]);
      }
      const row=(await client.query(`SELECT r.*,d.attempts AS purge_attempts,d.completed_at AS purge_completed_at FROM source_audio_purges d
        JOIN source_audio_requests r ON r.request_id=d.request_id WHERE
        (d.status='queued' AND (d.retry_at IS NULL OR d.retry_at<=clock_timestamp())) OR (d.status='processing' AND d.lease_until<=clock_timestamp())
        OR (d.status='complete' AND d.verified_at<=clock_timestamp()-interval '1 hour')
        ORDER BY COALESCE(d.verified_at,d.created_at),d.request_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED`)).rows[0];
      if(!row)return null;const token=randomUUID();
      await client.query("UPDATE source_audio_purges SET status='processing',attempts=attempts+1,lease_token=$2,lease_until=clock_timestamp()+interval '90 seconds',retry_at=NULL,error=NULL WHERE request_id=$1",[row.request_id,token]);
      return {...row,token};
    });},
    finish(row){return run(async client=>{
      const result=await client.query("UPDATE source_audio_purges SET status='complete',completed_at=COALESCE(completed_at,clock_timestamp()),verified_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,retry_at=NULL,error=NULL WHERE request_id=$1 AND status='processing' AND lease_token=$2 AND lease_until>clock_timestamp()",[row.request_id,row.token]);
      if(result.rowCount && !row.purge_completed_at)await client.query("INSERT INTO audit(id,org_id,site_id,actor_type,actor_id,action,object_id) VALUES($1,$2,$3,'system','retention-worker','briefing.source_audio_purged',$4)",[randomUUID(),row.org_id,row.site_id,row.request_id]);
    });},
    fail(row){return run(client=>client.query("UPDATE source_audio_purges SET status='queued',lease_token=NULL,lease_until=NULL,retry_at=clock_timestamp()+$3*interval '1 second',error='Private source cleanup failed' WHERE request_id=$1 AND status='processing' AND lease_token=$2",[row.request_id,row.token,Math.min(3600,30*2**Math.min(row.purge_attempts,7))]));},
  };
}
export async function processOneSourceAudioCleanup(pool,storage,options) {
  return processSourceAudioCleanup(sourceAudioCleanupJournal(pool,options),storage);
}
