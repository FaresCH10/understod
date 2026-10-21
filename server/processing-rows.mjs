const fields=['id','org_id','site_id','kind','mode','status','attempts','revision','title','briefing_id','draft_revision','draft_state','archived_at',
  'created_at','due_at','error','lease_token','publication_id','publication_version','assignment_id','source_request_id','own_source','can_source_retry','content_expired'];
export function processingRowsSql(dialect,{source=true,recording=true,sourcePurges=true,contentPurges=true}={}) {
  if(!['postgres','sqlite'].includes(dialect))throw Error('Invalid processing dialect');
  const pg=dialect==='postgres',yes=pg?'true':'1',no=pg?'false':'0',actor='(SELECT actor FROM processing_context)';
  const empty=field=>pg?`NULL::${['attempts','revision','draft_revision','publication_version'].includes(field)?'integer':['created_at','due_at','archived_at'].includes(field)?'timestamptz':'text'}`:'NULL';
  const select=(values,from)=>`SELECT ${fields.map(field=>`${values[field] ?? (['own_source','can_source_retry','content_expired'].includes(field)?no:empty(field))} AS ${field}`).join(',')} ${from}`;
  const expired=contentPurges?'EXISTS(SELECT 1 FROM briefing_content_purges cp WHERE cp.briefing_id=b.id AND cp.org_id=b.org_id AND cp.site_id=b.site_id)':no;
  const publishedTitle=pg?"COALESCE(p.snapshot_json->>'title',p.snapshot_json->'languages'->'en'->>'title','[Untitled publication]')":"COALESCE(json_extract(p.snapshot_json,'$.title'),json_extract(p.snapshot_json,'$.languages.en.title'),'[Untitled publication]')";
  const title=`CASE WHEN ${expired} THEN '[Expired briefing]' ELSE ${publishedTitle} END`;
  const archiveJoin='LEFT JOIN briefing_archives ba ON ba.briefing_id=b.id AND ba.org_id=b.org_id AND ba.site_id=b.site_id';
  const jobs=select({id:'j.id',org_id:'j.org_id',site_id:'j.site_id',kind:"'prepare'",mode:"'durable'",status:'j.status',attempts:'j.attempts',revision:'j.revision',
    title:'b.title',briefing_id:'b.id',draft_revision:'b.revision',draft_state:'b.state',archived_at:'ba.occurred_at',created_at:'j.created_at',due_at:'j.due_at',error:'j.error',
    lease_token:pg?'j.lease_token':undefined,content_expired:expired},
  `FROM jobs j JOIN briefings b ON b.id=j.briefing_id AND b.org_id=j.org_id AND b.site_id=j.site_id ${archiveJoin} WHERE j.kind='prepare'`);
  const rows=[jobs];
  if(source)rows.push(select({id:"'source_transcription:'||r.request_id",org_id:'r.org_id',site_id:'r.site_id',kind:"'source_transcription'",mode:"'durable'",
    status:"CASE r.status WHEN 'received' THEN 'queued' WHEN 'transcribed' THEN 'complete' ELSE r.status END",attempts:'r.attempts',title:'r.title',briefing_id:'b.id',
    draft_revision:'b.revision',draft_state:'b.state',archived_at:'ba.occurred_at',created_at:'r.received_at',due_at:'COALESCE(r.retry_at,r.received_at)',error:'r.error',
    source_request_id:'r.request_id',own_source:`r.requested_by=${actor}`,
    can_source_retry:sourcePurges?`r.requested_by=${actor} AND r.status IN ('failed','blocked') AND NOT EXISTS(SELECT 1 FROM source_audio_purges sp WHERE sp.request_id=r.request_id)`:no,
    content_expired:expired},
  `FROM source_audio_requests r LEFT JOIN briefings b ON b.id=r.briefing_id AND b.org_id=r.org_id AND b.site_id=r.site_id ${archiveJoin} WHERE r.received_at IS NOT NULL AND r.status<>'storing'`));
  const assignmentJoin=pg?'AND a.site_id=r.site_id':'',publicationJoin='JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id',briefingJoin='JOIN briefings b ON b.id=p.briefing_id AND b.org_id=p.org_id AND b.site_id=p.site_id';
  if(recording)rows.push(select({id:"'response_transcription:'||r.id",org_id:'r.org_id',site_id:'r.site_id',kind:"'response_transcription'",mode:"'durable'",
    status:"CASE r.status WHEN 'received' THEN 'queued' WHEN 'transcribed' THEN 'complete' ELSE r.status END",attempts:'r.attempts',title,briefing_id:'b.id',
    draft_revision:'b.revision',draft_state:'b.state',archived_at:'ba.occurred_at',created_at:'r.received_at',due_at:'COALESCE(r.retry_at,r.received_at)',error:'r.error',
    publication_id:'p.id',publication_version:'p.version',assignment_id:'a.id',content_expired:expired},
  `FROM recordings r JOIN assignments a ON a.id=r.assignment_id AND a.org_id=r.org_id ${assignmentJoin} ${publicationJoin} AND p.site_id=r.site_id ${briefingJoin} ${archiveJoin} WHERE r.received_at IS NOT NULL AND r.status<>'storing'`));
  if(pg)rows.push(select({id:"'answer_check:'||j.id",org_id:'j.org_id',site_id:'j.site_id',kind:"'answer_check'",mode:"'durable'",status:'j.status',attempts:'j.attempts',
    title,briefing_id:'b.id',draft_revision:'b.revision',draft_state:'b.state',archived_at:'ba.occurred_at',created_at:'j.created_at',due_at:'j.due_at',error:'j.error',
    publication_id:'p.id',publication_version:'p.version',assignment_id:'a.id',content_expired:expired},
  `FROM assessment_jobs j JOIN attempts t ON t.id=j.attempt_id AND t.org_id=j.org_id AND t.site_id=j.site_id AND t.assignment_id=j.assignment_id
    JOIN assignments a ON a.id=t.assignment_id AND a.org_id=t.org_id AND a.site_id=t.site_id ${publicationJoin} AND p.site_id=j.site_id ${briefingJoin} ${archiveJoin}`));
  else rows.push(select({id:"'answer_check:'||t.id",org_id:'p.org_id',site_id:'p.site_id',kind:"'answer_check'",mode:"'inline-synthetic'",status:"'complete'",attempts:'1',
    title,briefing_id:'b.id',draft_revision:'b.revision',draft_state:'b.state',archived_at:'ba.occurred_at',created_at:'t.received_at',due_at:'t.received_at',
    publication_id:'p.id',publication_version:'p.version',assignment_id:'a.id',content_expired:expired},
  `FROM attempts t JOIN assignments a ON a.id=t.assignment_id AND a.org_id=t.org_id ${publicationJoin} ${briefingJoin} ${archiveJoin}`));
  return `WITH processing_context AS (SELECT ${pg?'$3::text':':actor'} AS actor),processing_rows AS (${rows.join(' UNION ALL ')})`;
}
