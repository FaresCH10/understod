import {domainTransaction,requirePrincipal,domainAudit} from './domain.mjs';
import {recordingNoticeInput,noticeRequestId,sameNoticeRequest,noticeView} from '../recording-notice-input.mjs';
import {staffRecoveryScope} from '../staff-input.mjs';

async function authority(client,session,write=false){
  if(write || session?.principal_type==='staff')await requirePrincipal(client,session,'staff',write?['owner','administrator']:['owner','administrator','supervisor','auditor']);
  else await requirePrincipal(client,session,'worker');
  if(session.principal_type==='worker'){
    const row=(await client.query('SELECT language FROM workers WHERE id=$1 AND org_id=$2 AND site_id=$3',[session.principal_id,session.org_id,session.site_id])).rows[0];
    return {...session,language:row.language};
  }
  return session;
}
const current=async(client,session)=>(await client.query('SELECT * FROM recording_notices WHERE org_id=$1 AND site_id=$2',[session.org_id,session.site_id])).rows[0];
export function getRecordingNotice(pool,session,{schema='public',language}={}){
  return domainTransaction(pool,schema,async client=>{const principal=await authority(client,session);return {...noticeView(await current(client,session),principal,language),...(principal.principal_type==='staff'?{recoveryScope:staffRecoveryScope(principal)}:{})};});
}
export function recordingNoticeReceipt(pool,session,requestId,{schema='public'}={}){
  noticeRequestId(requestId);
  return domainTransaction(pool,schema,async client=>{
    await authority(client,session,true);
    const row=(await client.query('SELECT * FROM recording_notice_requests WHERE id=$1 AND org_id=$2 AND site_id=$3 AND actor_id=$4',[requestId,session.org_id,session.site_id,session.principal_id])).rows[0];
    return row?{requestId:row.id,request:row.request_json,revision:row.revision}:null;
  });
}
export function saveRecordingNotice(pool,session,input,{schema='public'}={}){
  const parsed=recordingNoticeInput(input);
  return domainTransaction(pool,schema,async client=>{
    await authority(client,session,true);
    if(parsed.scope!==staffRecoveryScope(session))throw Error('Recording notice request conflict');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`recording-notice:${input.requestId}`]);
    const old=(await client.query('SELECT * FROM recording_notice_requests WHERE id=$1',[input.requestId])).rows[0];
    if(old){if(old.org_id!==session.org_id || old.site_id!==session.site_id || old.actor_id!==session.principal_id || !sameNoticeRequest(old.request_json,parsed))throw Error('Recording notice request conflict');return {requestId:old.id,revision:old.revision,duplicate:true};}
    await client.query('SELECT id FROM sites WHERE id=$1 AND org_id=$2 FOR UPDATE',[session.site_id,session.org_id]);
    if(((await current(client,session))?.revision || 0)!==parsed.revision)throw Error('Recording notice revision changed');
    const revision=parsed.revision+1;
    await client.query(`INSERT INTO recording_notices VALUES($1,$2,$3,$4,clock_timestamp()) ON CONFLICT(site_id) DO UPDATE SET
      revision=excluded.revision,notices_json=excluded.notices_json,updated_at=excluded.updated_at`,[session.site_id,session.org_id,revision,JSON.stringify(parsed.notices)]);
    try{await client.query('INSERT INTO recording_notice_requests VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())',[input.requestId,session.org_id,session.site_id,session.principal_id,JSON.stringify(parsed),revision]);}
    catch(error){if(error.code==='23505')throw Error('Recording notice request conflict');throw error;}
    await domainAudit(client,session,'recording.notice.updated',input.requestId);return {requestId:input.requestId,revision,duplicate:false};
  });
}
