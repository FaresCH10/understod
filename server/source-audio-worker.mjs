import {randomUUID} from 'node:crypto';
import {NOW,transaction} from './db.mjs';
import {scheduleAuthority} from './schedules.mjs';
import {createDraftInTransaction,ensureBriefingSchema,briefingAudit} from './preparation.mjs';
import {ensureSourceAudioSchema} from './source-audio.mjs';
import {sourceAudioReferences} from './source-audio-input.mjs';
import {audioStore,verifySourceOriginal} from './private-storage.mjs';
import {inspectWav} from './audio.mjs';
import {DEFAULT_AUDIO_ROOT} from './recordings.mjs';

export function sourceAudioActor(row) {
  const authority=typeof row.authority_json==='string'?JSON.parse(row.authority_json):row.authority_json;
  return {principal_type:'staff',principal_id:row.requested_by,org_id:row.org_id,site_id:row.site_id,role:authority.role};
}
export function sourceAudioDraftInput(row,text) {
  if(typeof text!=='string' || text.trim().length<10 || text.length>4000)throw Error('Source transcript unavailable');
  return {requestId:row.request_id,title:row.title,source:text.trim(),
    ...(row.generation_languages_json!==null?{generationLanguages:typeof row.generation_languages_json==='string'?JSON.parse(row.generation_languages_json):row.generation_languages_json}:{})};
}

export async function processSourceAudioWithJournal(journal,adapter,storage) {
  const row=await journal.claim();
  if(!row)return false;
  if(row.exhausted)return true;
  try {
    if(!await journal.validate(row))return true;
    if(typeof adapter?.transcribe!=='function') {await journal.block(row);return true;}
    if(adapter.provenance?.dataClass==='synthetic' && (typeof adapter.permitsSourceAudio!=='function' || adapter.permitsSourceAudio(row)!==true)) {
      await journal.block(row);return true;
    }
    const references=sourceAudioReferences(row);
    verifySourceOriginal(references.original,await storage.readOriginal(references.original));
    const bytes=await storage.read(references.canonical),info=inspectWav(bytes);
    if(info.sha256!==row.sha256 || info.bytes!==row.bytes)throw Error('Private source integrity check failed');
    if(!await journal.validate(row))return true;
    const result=await adapter.transcribe(bytes,'audio/wav',row);
    await journal.finish(row,sourceAudioDraftInput(row,result?.text),{providerOperationId:result?.providerOperationId ?? null});
  }catch {await journal.fail(row);}
  return true;
}

export function sourceAudioProcessingJournal(db) {
  ensureSourceAudioSchema(db);ensureBriefingSchema(db);
  function valid(row) {
    const current=db.prepare("SELECT * FROM source_audio_requests WHERE request_id=? AND status='processing' AND lease_token=? AND lease_until>?").get(row.request_id,row.lease_token,NOW());
    if(!current || db.prepare('SELECT 1 FROM source_audio_purges WHERE request_id=?').get(row.request_id))return null;
    try {if(JSON.stringify(scheduleAuthority(db,sourceAudioActor(current)))!==current.authority_json)throw Error('Changed');}
    catch {db.prepare("UPDATE source_audio_requests SET status='blocked',lease_token=NULL,lease_until=NULL,retry_at=NULL,error='Source audio authority changed' WHERE request_id=?").run(row.request_id);return null;}
    return current;
  }
  return {
    claim() {return transaction(db,()=>{
      const row=db.prepare(`SELECT * FROM source_audio_requests WHERE ((status='received' AND (retry_at IS NULL OR retry_at<=?))
        OR (status='processing' AND lease_until<=?)) AND NOT EXISTS(SELECT 1 FROM source_audio_purges p WHERE p.request_id=source_audio_requests.request_id)
        ORDER BY created_at,request_id LIMIT 1`).get(NOW(),NOW());
      if(!row)return null;
      if(row.attempts>=3) {db.prepare("UPDATE source_audio_requests SET status='failed',lease_token=NULL,lease_until=NULL,retry_at=NULL,error='Source transcription attempts exhausted' WHERE request_id=?").run(row.request_id);return {...row,exhausted:true};}
      const token=randomUUID();db.prepare("UPDATE source_audio_requests SET status='processing',lease_token=?,lease_until=?,attempts=attempts+1,retry_at=NULL,error=NULL WHERE request_id=?")
        .run(token,new Date(Date.now()+180000).toISOString(),row.request_id);
      return {...row,lease_token:token,attempts:row.attempts+1};
    });},
    validate(row) {return transaction(db,()=>!!valid(row));},
    finish(row,input) {return transaction(db,()=>{
      if(!valid(row))return;
      createDraftInTransaction(db,sourceAudioActor(row),input);
      db.prepare("UPDATE source_audio_requests SET status='transcribed',briefing_id=?,lease_token=NULL,lease_until=NULL,retry_at=NULL,error=NULL WHERE request_id=?").run(input.requestId,row.request_id);
      briefingAudit(db,sourceAudioActor(row),'briefing.source_audio_transcribed',row.request_id);
    });},
    block(row) {db.prepare("UPDATE source_audio_requests SET status='blocked',lease_token=NULL,lease_until=NULL,retry_at=NULL,error='Source transcription provider unavailable' WHERE request_id=? AND status='processing' AND lease_token=? AND lease_until>?").run(row.request_id,row.lease_token,NOW());},
    fail(row) {db.prepare("UPDATE source_audio_requests SET status=?,lease_token=NULL,lease_until=NULL,retry_at=?,error='Source transcription failed' WHERE request_id=? AND status='processing' AND lease_token=? AND lease_until>?")
      .run(row.attempts>=3?'failed':'received',row.attempts>=3?null:new Date(Date.now()+row.attempts*15000).toISOString(),row.request_id,row.lease_token,NOW());},
  };
}
export async function processOneSourceAudio(db,adapter,root=DEFAULT_AUDIO_ROOT) {
  return processSourceAudioWithJournal(sourceAudioProcessingJournal(db),adapter,audioStore(root));
}
