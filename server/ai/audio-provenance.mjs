import {bundleHash} from './prepared-bundle.mjs';

export const sourceTranscriptionInputHash=row=>bundleHash({schema:'source-transcription-input-v1',
  orgId:row.org_id,siteId:row.site_id,requestId:row.request_id,requestHash:row.request_hash,
  audioHash:row.sha256,bytes:row.bytes,originalHash:row.original_sha256,originalBytes:row.original_bytes,
  authorityHash:bundleHash(row.authority_json),mimeType:'audio/wav'});

export const recordingTranscriptionInputHash=(row,input)=>bundleHash({schema:'recording-transcription-input-v1',
  orgId:row.org_id,siteId:row.site_id,recordingId:row.id,assignmentId:row.assignment_id,
  audioHash:row.sha256,bytes:row.bytes,durationSeconds:row.duration_seconds,mimeType:'audio/wav',
  language:input.language,publicationId:input.publicationId,version:input.version,question:input.question,askedFacts:input.askedFacts});

export const transcriptionProvenance=(adapter,model)=>Object.freeze({adapter,dataClass:'synthetic',model,
  promptVersion:'gemini-verbatim-v1',schemaVersion:'gemini-interactions-transcription-v1'});
