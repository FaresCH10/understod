import {createHash} from 'node:crypto';
import {sourceAudioMetadata} from './briefing-input.mjs';
import {inspectWav} from './audio.mjs';
import {MAX_SOURCE_ORIGINAL_BYTES} from './private-storage.mjs';

export function sourceAudioInput(input,original,wav) {
  const metadata=sourceAudioMetadata(input);
  if(!Buffer.isBuffer(original) || original.length<1 || original.length>MAX_SOURCE_ORIGINAL_BYTES)
    throw Error('Invalid source audio request');
  const info=inspectWav(wav);
  if(info.durationSeconds<0.25)throw Error('Invalid source audio duration');
  const content={title:metadata.title,originalType:metadata.originalType,
    ...(metadata.generationLanguages!==undefined?{generationLanguages:metadata.generationLanguages}:{}),
    sha256:info.sha256,bytes:info.bytes,durationSeconds:info.durationSeconds,
    originalSha256:createHash('sha256').update(original).digest('hex'),originalBytes:original.length};
  return {...content,requestId:input.requestId,requestHash:createHash('sha256').update(JSON.stringify(content)).digest('hex')};
}

const iso=value=>value instanceof Date?value.toISOString():value ?? null;
export function sourceAudioPage(filters={}) {
  if(!filters || typeof filters!=='object' || Array.isArray(filters) || Object.keys(filters).some(key=>key!=='page'))throw Error('Invalid source audio page');
  const page=Number(filters.page ?? 1);
  if(!Number.isSafeInteger(page) || page<1 || page>100000)throw Error('Invalid source audio page');
  return {page,pageSize:20};
}
export function sourceAudioListItem(row) {
  return {...sourceAudioReceipt(row),title:row.title};
}
export function sourceAudioReceipt(row) {
  return {requestId:row.request_id,requestHash:row.request_hash,status:row.status,receivedAt:iso(row.received_at),
    briefingId:row.briefing_id ?? null,...(row.audio_cleanup_id?{audioStatus:row.audio_removed_at?'removed':'cleanup_pending'}:{})};
}
export function sourceAudioReplay(row,session,input) {
  if(row.org_id!==session.org_id || row.site_id!==session.site_id || row.requested_by!==session.principal_id
    || row.request_hash!==input.requestHash)throw Error('Source audio request conflict');
}
export function sourceAudioReferences(row) {
  return {canonical:{id:row.id,org_id:row.org_id,site_id:row.site_id,sha256:row.sha256,bytes:row.bytes},
    original:{id:row.original_id,org_id:row.org_id,site_id:row.site_id,sha256:row.original_sha256,bytes:row.original_bytes}};
}
