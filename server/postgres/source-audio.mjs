import {randomUUID} from 'node:crypto';
import {domainTransaction,domainAudit} from './domain.mjs';
import {scheduleAuthority} from './schedules.mjs';
import {receiveSourceAudioWithJournal} from '../source-audio.mjs';
import {sourceAudioReceipt,sourceAudioReplay,sourceAudioReferences,sourceAudioPage,sourceAudioListItem} from '../source-audio-input.mjs';
import {scheduleHash} from '../schedule-input.mjs';
import {reviewRequestId} from '../briefing-input.mjs';
import {inspectWav} from '../audio.mjs';
import {verifySourceOriginal} from '../private-storage.mjs';

export function sourceAudioJournal(pool,{schema='public'}={}) {
  const run=fn=>domainTransaction(pool,schema,fn);
  return {
    reserve(session,content) {return run(async client=>{
      const authority=await scheduleAuthority(client,session);
      // Lock the request key even before a row exists, so concurrent first uploads cannot race.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`source-audio:${content.requestId}`]);
      const old=(await client.query('SELECT *,lease_until>clock_timestamp() AS leased FROM source_audio_requests WHERE request_id=$1 FOR UPDATE',[content.requestId])).rows[0];
      if(old) {
        sourceAudioReplay(old,session,content);
        if((await client.query('SELECT 1 FROM source_audio_purges WHERE request_id=$1',[content.requestId])).rows.length)throw Error('Source audio expired');
        if(old.received_at)return old;
        if(scheduleHash(old.authority_json)!==scheduleHash(authority))throw Error('Source audio authority changed');
        if(old.leased)throw Error('Source audio upload is in progress');
        return (await client.query("UPDATE source_audio_requests SET lease_token=$2,lease_until=clock_timestamp()+interval '180 seconds',error=NULL WHERE request_id=$1 RETURNING *",[content.requestId,randomUUID()])).rows[0];
      }
      return (await client.query(`INSERT INTO source_audio_requests(request_id,org_id,site_id,requested_by,request_hash,title,generation_languages_json,
        id,sha256,bytes,duration_seconds,original_id,original_sha256,original_bytes,original_type,authority_json,status,created_at,lease_token,lease_until)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'storing',clock_timestamp(),$17,clock_timestamp()+interval '180 seconds') RETURNING *`,
      [content.requestId,session.org_id,session.site_id,session.principal_id,content.requestHash,content.title,
        content.generationLanguages?JSON.stringify(content.generationLanguages):null,randomUUID(),content.sha256,content.bytes,content.durationSeconds,
        randomUUID(),content.originalSha256,content.originalBytes,content.originalType,JSON.stringify(authority),randomUUID()])).rows[0];
    });},
    accept(session,row) {return run(async client=>{
      const authority=await scheduleAuthority(client,session);
      const current=(await client.query('SELECT *,lease_until>clock_timestamp() AS leased FROM source_audio_requests WHERE request_id=$1 FOR UPDATE',[row.request_id])).rows[0];
      if(!current || scheduleHash(current.authority_json)!==scheduleHash(authority) || current.requested_by!==session.principal_id
        || current.org_id!==session.org_id || current.site_id!==session.site_id)throw Error('Source audio authority changed');
      if((await client.query('SELECT 1 FROM source_audio_purges WHERE request_id=$1',[row.request_id])).rows.length)throw Error('Source audio expired');
      if(current.received_at)return current;
      if(current.lease_token!==row.lease_token || !current.leased)throw Error('Source audio storage lease expired');
      const accepted=(await client.query("UPDATE source_audio_requests SET status='received',received_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,error=NULL WHERE request_id=$1 RETURNING *",[row.request_id])).rows[0];
      await domainAudit(client,session,'briefing.source_audio_received',row.request_id);
      return accepted;
    });},
    lookup(session,id) {return run(async client=>{
      await scheduleAuthority(client,session);reviewRequestId(id);
      return (await client.query(`SELECT r.*,p.completed_at AS audio_removed_at,p.request_id AS audio_cleanup_id FROM source_audio_requests r
        LEFT JOIN source_audio_purges p ON p.request_id=r.request_id WHERE r.request_id=$1 AND r.org_id=$2 AND r.site_id=$3 AND r.requested_by=$4`,
        [id,session.org_id,session.site_id,session.principal_id])).rows[0] ?? null;
    });},
    release(row) {return run(client=>client.query("UPDATE source_audio_requests SET lease_token=NULL,lease_until=clock_timestamp(),error='Private upload requires recovery' WHERE request_id=$1 AND status='storing' AND lease_token=$2",[row.request_id,row.lease_token]));},
  };
}
export async function receiveSourceAudio(pool,session,input,original,wav,storage,repository) {
  return receiveSourceAudioWithJournal(sourceAudioJournal(pool,repository),session,input,original,wav,storage);
}
export async function getSourceAudioReceipt(pool,session,id,repository) {
  const row=await sourceAudioJournal(pool,repository).lookup(session,id);
  return row?{found:true,...sourceAudioReceipt(row)}:{found:false,requestId:id};
}
export async function listSourceAudio(pool,session,filters={}, {schema='public'}={}) {
  const {page,pageSize}=sourceAudioPage(filters);
  return domainTransaction(pool,schema,async client=>{
    await scheduleAuthority(client,session);const values=[session.org_id,session.site_id,session.principal_id];
    const where='org_id=$1 AND site_id=$2 AND requested_by=$3 AND received_at IS NOT NULL';
    const total=Number((await client.query(`SELECT count(*) n FROM source_audio_requests WHERE ${where}`,values)).rows[0].n);
    const items=(await client.query(`SELECT request_id,request_hash,title,status,received_at,briefing_id,
      (SELECT p.request_id FROM source_audio_purges p WHERE p.request_id=source_audio_requests.request_id) AS audio_cleanup_id,
      (SELECT p.completed_at FROM source_audio_purges p WHERE p.request_id=source_audio_requests.request_id) AS audio_removed_at
      FROM source_audio_requests WHERE ${where} ORDER BY received_at DESC,request_id DESC LIMIT $4 OFFSET $5`,[...values,pageSize,(page-1)*pageSize])).rows.map(sourceAudioListItem);
    return {items,total,page,pageSize};
  });
}
export async function getSourceAudio(pool,session,id,storage,kind='canonical',repository) {
  if(!['canonical','original'].includes(kind))throw Error('Invalid source audio kind');
  const journal=sourceAudioJournal(pool,repository),row=await journal.lookup(session,id);
  if(!row?.received_at || row.audio_cleanup_id)throw Error('Source audio unavailable');
  const reference=sourceAudioReferences(row)[kind];
  const bytes=await (kind==='original'?storage.readOriginal(reference):storage.read(reference));
  if(kind==='original')verifySourceOriginal(reference,bytes);
  else {const info=inspectWav(bytes);if(info.sha256!==reference.sha256 || info.bytes!==reference.bytes)throw Error('Private source integrity check failed');}
  const current=await journal.lookup(session,id);
  if(!current?.received_at || current.audio_cleanup_id)throw Error('Source audio unavailable');
  return bytes;
}
