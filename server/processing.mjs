import {processingRowsSql} from './processing-rows.mjs';
import {processingProvenanceFilters,processingProvenancePage} from './processing-provenance.mjs';
export function processingJobId(value) {
  if(typeof value!=='string' || !/^(?:(?:source_transcription|response_transcription|answer_check):)?[A-Za-z0-9_-]{1,100}$/.test(value))throw Error('Invalid processing job reference');
  return value;
}
export function processingFilters(input={}) {
  if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['search','status','kind','sort','page','pageSize'].includes(key))) throw new Error('Invalid processing filter');
  const {search='',status='all',kind='all',sort='newest'}=input,page=Number(input.page ?? 1),pageSize=Number(input.pageSize ?? 20);
  if(typeof search!=='string' || search.length>80 || !['all','queued','processing','ready','complete','failed','blocked'].includes(status)
    || !['all','prepare','source_transcription','response_transcription','answer_check'].includes(kind)
    || !['newest','oldest'].includes(sort) || !Number.isSafeInteger(page) || page<1 || page>5000
    || !Number.isInteger(pageSize) || pageSize<1 || pageSize>100) throw new Error('Invalid processing filter');
  return {search:search.trim(),status,kind,sort,page,pageSize};
}

export function processingJob(row) {
  const iso=value=>value===null || value===undefined?null:new Date(value).toISOString();
  const retryAvailable=row.kind==='prepare' && row.status==='failed' && row.draft_state==='failed' && row.revision===row.draft_revision && !row.archived_at && !row.content_expired;
  // Never return provider errors, lease details, source text, or private artifacts.
  const labels={prepare:'Preparation',source_transcription:'Source transcription',response_transcription:'Response transcription',answer_check:'Answer check'};
  if(!labels[row.kind])throw Error('Processing job unavailable');
  const error=row.kind==='prepare' && row.error==='Briefing archived' ? 'Briefing archived' : row.kind==='prepare' && row.error==='Obsolete draft revision' ? 'Older draft revision'
    : row.status==='failed' ? row.kind==='prepare'?'Preparation failed. Review the source before retrying.':`${labels[row.kind]} failed. Review the recorded status before another attempt.`
    : row.status==='blocked'?`${labels[row.kind]} is blocked. Processing prerequisites are unavailable.`:null;
  return {id:row.id,kind:row.kind,status:row.status,attempts:row.attempts,revision:row.revision,title:row.title,briefing_id:row.briefing_id,
    draft_revision:row.draft_revision,draft_state:row.draft_state,archived_at:iso(row.archived_at),created_at:iso(row.created_at),due_at:iso(row.due_at),error,retryAvailable,
    mode:row.mode,publication_id:row.publication_id ?? null,publication_version:row.publication_version ?? null,assignment_id:row.assignment_id ?? null,
    source_request_id:row.source_request_id ?? null,own_source:Boolean(row.own_source),sourceRetryAvailable:Boolean(row.can_source_retry),contentExpired:Boolean(row.content_expired)};
}

function authority(db,session) {
  if(session?.principal_type!=='staff' || !['owner','supervisor','auditor'].includes(session.role)
    || !db.prepare('SELECT id FROM staff WHERE id=? AND org_id=? AND site_id=? AND role=? AND active=1').get(session.principal_id,session.org_id,session.site_id,session.role)) throw new Error('Forbidden');
}

function rowsSql(db) {
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('source_audio_requests','recordings','source_audio_purges','briefing_content_purges')").all().map(row=>row.name));
  return processingRowsSql('sqlite',{source:tables.has('source_audio_requests'),recording:tables.has('recordings'),sourcePurges:tables.has('source_audio_purges'),contentPurges:tables.has('briefing_content_purges')});
}

export function listProcessing(db,session,input={}) {
  const {search,status,kind,sort,page,pageSize}=processingFilters(input);authority(db,session);
  const order=sort==='newest' ? 'created_at DESC,id' : 'created_at,id';
  const row=db.prepare(`${rowsSql(db)},filtered AS (SELECT * FROM processing_rows WHERE org_id=:org AND site_id=:site
    AND (:search='' OR instr(lower(title),lower(:search))>0) AND (:status='all' OR status=:status) AND (:kind='all' OR kind=:kind))
    SELECT (SELECT COUNT(*) FROM filtered) AS total,
      (SELECT json_group_array(json(result)) FROM (SELECT json_object('id',id,'kind',kind,'status',status,'mode',mode,'attempts',attempts,'error',error,
        'created_at',created_at,'due_at',due_at,'revision',revision,'title',title,'briefing_id',briefing_id,'draft_revision',draft_revision,'draft_state',draft_state,'archived_at',archived_at,
        'publication_id',publication_id,'publication_version',publication_version,'assignment_id',assignment_id,'source_request_id',source_request_id,
        'own_source',own_source,'can_source_retry',can_source_retry,'content_expired',content_expired) AS result
        FROM filtered ORDER BY ${order} LIMIT :limit OFFSET :offset)) AS items`).get({':actor':session.principal_id,':org':session.org_id,':site':session.site_id,':search':search,':status':status,':kind':kind,':limit':pageSize,':offset':(page-1)*pageSize});
  return {items:JSON.parse(row.items).map(processingJob),total:row.total,page,pageSize};
}

export function getProcessing(db,session,id) {
  authority(db,session);processingJobId(id);
  const row=db.prepare(`${rowsSql(db)} SELECT * FROM processing_rows WHERE id=:id AND org_id=:org AND site_id=:site`).get({':actor':session.principal_id,':id':id,':org':session.org_id,':site':session.site_id});
  if(!row) throw new Error('Processing job unavailable');
  return processingJob(row);
}
export function getProcessingProvenance(db,session,id,input={}){
  const filters=processingProvenanceFilters(input),job=getProcessing(db,session,id);
  return processingProvenancePage(job,filters,0,[],false);
}
