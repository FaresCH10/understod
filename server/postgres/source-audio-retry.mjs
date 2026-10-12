import {domainTransaction} from './domain.mjs';
import {scheduleAuthority} from './schedules.mjs';
import {reviewRequestId} from '../briefing-input.mjs';
import {sourceRetryInput,sourceRetryReceipt} from '../source-audio-retry.mjs';
import {randomUUID} from 'node:crypto';
import {scheduleHash} from '../schedule-input.mjs';

export async function retrySourceAudio(pool,session,sourceId,input,{schema='public'}={}) {
  reviewRequestId(sourceId);sourceRetryInput(input);
  return domainTransaction(pool,schema,async client=>{
    const authority=await scheduleAuthority(client,session);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`source-retry:${input.requestId}`]);
    const source=(await client.query('SELECT * FROM source_audio_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3 AND requested_by=$4 FOR UPDATE',
      [sourceId,session.org_id,session.site_id,session.principal_id])).rows[0];
    if(!source || source.request_hash!==input.sourceHash)throw Error('Source audio request conflict');
    if((await client.query('SELECT 1 FROM source_audio_purges WHERE request_id=$1',[sourceId])).rows.length)throw Error('Source audio expired');
    if(scheduleHash(source.authority_json)!==scheduleHash(authority))throw Error('Source audio authority changed');
    const old=(await client.query('SELECT * FROM source_audio_retries WHERE retry_id=$1',[input.requestId])).rows[0];
    if(old) {
      if(old.source_request_id!==sourceId || old.org_id!==session.org_id || old.site_id!==session.site_id
        || old.requested_by!==session.principal_id || old.source_hash!==input.sourceHash)throw Error('Source retry request conflict');
      return sourceRetryReceipt(old);
    }
    if(!source.received_at || source.briefing_id || !['blocked','failed'].includes(source.status))throw Error('Source retry state changed');
    const row=(await client.query(`INSERT INTO source_audio_retries(retry_id,source_request_id,org_id,site_id,requested_by,source_hash,created_at)
      VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()) RETURNING *`,[input.requestId,sourceId,session.org_id,session.site_id,session.principal_id,input.sourceHash])).rows[0];
    await client.query("UPDATE source_audio_requests SET status='received',attempts=0,lease_token=NULL,lease_until=NULL,retry_at=NULL,error=NULL WHERE request_id=$1",[sourceId]);
    await client.query('INSERT INTO audit VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())',
      [randomUUID(),session.org_id,session.site_id,'staff',session.principal_id,'briefing.source_audio_retry_requested',sourceId]);
    return sourceRetryReceipt(row);
  });
}
export async function getSourceRetryReceipt(pool,session,sourceId,retryId,{schema='public'}={}) {
  reviewRequestId(sourceId);reviewRequestId(retryId);
  return domainTransaction(pool,schema,async client=>{
    await scheduleAuthority(client,session);
    const row=(await client.query('SELECT * FROM source_audio_retries WHERE retry_id=$1 AND source_request_id=$2 AND org_id=$3 AND site_id=$4 AND requested_by=$5',
      [retryId,sourceId,session.org_id,session.site_id,session.principal_id])).rows[0];
    return row?sourceRetryReceipt(row):{found:false,retryId,sourceRequestId:sourceId};
  });
}
