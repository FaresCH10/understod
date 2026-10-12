export function processingFilters(input={}) {
  if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['search','status','sort','page','pageSize'].includes(key))) throw new Error('Invalid processing filter');
  const {search='',status='all',sort='newest'}=input,page=Number(input.page ?? 1),pageSize=Number(input.pageSize ?? 20);
  if(typeof search!=='string' || search.length>80 || !['all','queued','processing','ready','failed'].includes(status)
    || !['newest','oldest'].includes(sort) || !Number.isSafeInteger(page) || page<1 || page>5000
    || !Number.isInteger(pageSize) || pageSize<1 || pageSize>100) throw new Error('Invalid processing filter');
  return {search:search.trim(),status,sort,page,pageSize};
}

export function processingJob(row) {
  const iso=value=>value instanceof Date ? value.toISOString() : value;
  const retryAvailable=row.kind==='prepare' && row.status==='failed' && row.draft_state==='failed' && row.revision===row.draft_revision && !row.archived_at;
  // Never return provider errors, lease details, source text, or private artifacts.
  const error=row.error==='Briefing archived' ? 'Briefing archived' : row.error==='Obsolete draft revision' ? 'Older draft revision' : row.status==='failed' ? 'Preparation failed. Review the source before retrying.' : null;
  return {id:row.id,kind:row.kind,status:row.status,attempts:row.attempts,revision:row.revision,title:row.title,briefing_id:row.briefing_id,
    draft_revision:row.draft_revision,draft_state:row.draft_state,archived_at:iso(row.archived_at),created_at:iso(row.created_at),due_at:iso(row.due_at),error,retryAvailable};
}

function authority(db,session) {
  if(session?.principal_type!=='staff' || !['owner','supervisor','auditor'].includes(session.role)
    || !db.prepare('SELECT id FROM staff WHERE id=? AND org_id=? AND site_id=? AND role=? AND active=1').get(session.principal_id,session.org_id,session.site_id,session.role)) throw new Error('Forbidden');
}

const columns=`j.id,j.kind,j.status,j.attempts,j.error,j.created_at,j.due_at,j.revision,b.title,b.id AS briefing_id,b.revision AS draft_revision,b.state AS draft_state,a.occurred_at AS archived_at`;
const joins=`FROM jobs j JOIN briefings b ON b.id=j.briefing_id AND b.org_id=j.org_id AND b.site_id=j.site_id
  LEFT JOIN briefing_archives a ON a.briefing_id=b.id AND a.org_id=b.org_id AND a.site_id=b.site_id`;

export function listProcessing(db,session,input={}) {
  const {search,status,sort,page,pageSize}=processingFilters(input);authority(db,session);
  const order=sort==='newest' ? 'created_at DESC,id' : 'created_at,id';
  const row=db.prepare(`WITH filtered AS (SELECT ${columns} ${joins} WHERE j.org_id=? AND j.site_id=?
    AND (?='' OR instr(lower(b.title),lower(?))>0) AND (?='all' OR j.status=?))
    SELECT (SELECT COUNT(*) FROM filtered) AS total,
      (SELECT json_group_array(json(result)) FROM (SELECT json_object('id',id,'kind',kind,'status',status,'attempts',attempts,'error',error,
        'created_at',created_at,'due_at',due_at,'revision',revision,'title',title,'briefing_id',briefing_id,'draft_revision',draft_revision,'draft_state',draft_state,'archived_at',archived_at) AS result
        FROM filtered ORDER BY ${order} LIMIT ? OFFSET ?)) AS items`).get(session.org_id,session.site_id,search,search,status,status,pageSize,(page-1)*pageSize);
  return {items:JSON.parse(row.items).map(processingJob),total:row.total,page,pageSize};
}

export function getProcessing(db,session,id) {
  authority(db,session);
  const row=db.prepare(`SELECT ${columns} ${joins} WHERE j.id=? AND j.org_id=? AND j.site_id=?`).get(id,session.org_id,session.site_id);
  if(!row) throw new Error('Processing job unavailable');
  return processingJob(row);
}
