import {requireClarificationPrincipal} from './clarifications.mjs';
import {caseTimelineInput,caseTimelineQuery,caseTimelinePage} from './case-timeline-input.mjs';

export function listCaseTimeline(db,session,caseId,input={}){
  const page=caseTimelineInput(caseId,input),params={p1:caseId,p2:session?.org_id??'',p3:session?.site_id??''},query=caseTimelineQuery(false,
    !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='case_voice'").get());
  db.exec('BEGIN');
  try{
    requireClarificationPrincipal(db,session);
    if(!db.prepare(`SELECT c.id FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id
      WHERE c.id=? AND c.org_id=? AND a.site_id=?`).get(caseId,session.org_id,session.site_id))throw Error('Clarification unavailable');
    const total=db.prepare(query.count).get(params).total;
    const rows=db.prepare(query.rows).all({...params,p4:page.pageSize,p5:(page.page-1)*page.pageSize});
    const result=caseTimelinePage(caseId,page,total,rows);db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
