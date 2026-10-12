import {requirePrincipal} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {siteLifecycleState} from './site-lifecycle.mjs';
import {searchRoles,searchFilters,allowedSearchKinds,searchSelect,searchPage} from '../search-input.mjs';

export function searchSite(pool,session,input,{schema='public'}={}){
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',searchRoles);
    const filters=searchFilters(input),kinds=allowedSearchKinds(session.role,(await siteLifecycleState(client,session.org_id,session.site_id)).state==='archived');
    if(filters.kind!=='all' && !kinds.includes(filters.kind))throw Error('Forbidden');
    const sql=kinds.map(kind=>searchSelect(kind,column=>`t.org_id=$1 AND t.site_id=$2 AND strpos(lower(${column}),lower($3))>0`)).join(' UNION ALL ');
    const counts={briefing:0,worker:0,crew:0};
    for(const row of (await client.query(`SELECT kind,COUNT(*)::int AS total FROM (${sql}) matched GROUP BY kind`,[session.org_id,session.site_id,filters.query])).rows)counts[row.kind]=row.total;
    const rows=(await client.query(`SELECT * FROM (${sql}) matched WHERE ($4='all' OR kind=$4)
      ORDER BY CASE kind WHEN 'briefing' THEN 0 WHEN 'worker' THEN 1 ELSE 2 END,lower(label) COLLATE "C",label COLLATE "C",id COLLATE "C" LIMIT $5 OFFSET $6`,
      [session.org_id,session.site_id,filters.query,filters.kind,filters.pageSize,(filters.page-1)*filters.pageSize])).rows;
    return searchPage(rows,counts,filters,kinds);
  });
}
