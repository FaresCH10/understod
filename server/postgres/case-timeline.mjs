import {requirePrincipal} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {caseTimelineInput,caseTimelineQuery,caseTimelinePage} from '../case-timeline-input.mjs';

export function listCaseTimeline(pool,session,caseId,input={}, {schema='public'}={}){
  const page=caseTimelineInput(caseId,input),query=caseTimelineQuery(true);
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','supervisor','auditor']);
    const params=[caseId,session.org_id,session.site_id];
    if(!(await client.query('SELECT id FROM clarifications WHERE id=$1 AND org_id=$2 AND site_id=$3',params)).rows.length)throw Error('Clarification unavailable');
    const total=(await client.query(query.count,params)).rows[0].total;
    const rows=(await client.query(query.rows,[...params,page.pageSize,(page.page-1)*page.pageSize])).rows;
    return caseTimelinePage(caseId,page,total,rows);
  });
}
