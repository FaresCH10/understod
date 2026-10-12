import {NOW,transaction} from './db.mjs';
import {siteLifecycleState} from './site-lifecycle.mjs';
import {searchRoles,searchFilters,allowedSearchKinds,searchSelect,searchPage} from './search-input.mjs';

export function searchSite(db,session,input){
  return transaction(db,()=>{
    if(session?.principal_type!=='staff' || !searchRoles.includes(session.role)
      || !db.prepare('SELECT id FROM staff WHERE id=? AND org_id=? AND site_id=? AND role=? AND active=1').get(session.principal_id,session.org_id,session.site_id,session.role))throw Error('Forbidden');
    if(session.token_hash!==undefined && !db.prepare(`SELECT 1 FROM sessions WHERE token_hash=? AND principal_type='staff' AND principal_id=? AND org_id=? AND site_id=? AND revoked_at IS NULL AND expires_at>?`)
      .get(session.token_hash,session.principal_id,session.org_id,session.site_id,NOW()))throw Error('Sign in required');
    const filters=searchFilters(input),kinds=allowedSearchKinds(session.role,siteLifecycleState(db,session.org_id,session.site_id).state==='archived');
    if(filters.kind!=='all' && !kinds.includes(filters.kind))throw Error('Forbidden');
    const where=column=>`t.org_id=? AND t.site_id=? AND instr(lower(${column}),lower(?))>0`;
    const sql=kinds.map(kind=>searchSelect(kind,where)).join(' UNION ALL '),args=kinds.flatMap(()=>[session.org_id,session.site_id,filters.query]);
    const counts={briefing:0,worker:0,crew:0};
    for(const row of db.prepare(`SELECT kind,COUNT(*) AS total FROM (${sql}) matched GROUP BY kind`).all(...args))counts[row.kind]=row.total;
    const rows=db.prepare(`SELECT * FROM (${sql}) matched ${filters.kind==='all'?'':'WHERE kind=?'}
      ORDER BY CASE kind WHEN 'briefing' THEN 0 WHEN 'worker' THEN 1 ELSE 2 END,lower(label),label,id LIMIT ? OFFSET ?`)
      .all(...args,...(filters.kind==='all'?[]:[filters.kind]),filters.pageSize,(filters.page-1)*filters.pageSize);
    return searchPage(rows,counts,filters,kinds);
  });
}
