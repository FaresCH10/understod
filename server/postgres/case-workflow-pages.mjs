import {responseRead} from './responses.mjs';
import {requirePrincipal} from './domain.mjs';
import {caseDeadlineOverride,caseReviewRow} from './case-reviews.mjs';
import {repeatRow} from './case-repeats.mjs';

const iso=value=>value instanceof Date?value.toISOString():value;
export function caseWorkflowPageInput(caseId,input={}){
  if(typeof caseId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(caseId)||!input||typeof input!=='object'||Array.isArray(input)
    ||Object.keys(input).some(key=>!['page','pageSize'].includes(key)))throw Error('Invalid case workflow page');
  const {page=1,pageSize=10}=input;
  if(!['string','number'].includes(typeof page)||!/^[1-9][0-9]{0,3}$/.test(String(page))||Number(page)>5000||![5,10,20,'5','10','20'].includes(pageSize))throw Error('Invalid case workflow page');
  return {page:Number(page),pageSize:Number(pageSize)};
}
async function context(client,session,caseId){
  await requirePrincipal(client,session,'staff',['owner','supervisor','auditor']);
  const row=(await client.query(`SELECT c.status,c.assignment_id,c.attempt_id,t.outcome,w.active,p.state,
    publication_content_available(p.id) AS publication_available,COALESCE(${caseDeadlineOverride},r.due_at,a.due_at) AS effective_due,
    EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=w.id AND d.org_id=w.org_id AND d.site_id=w.site_id) AS deleting,
    EXISTS(SELECT 1 FROM case_content_purges cp WHERE cp.case_id=c.id AND cp.org_id=c.org_id AND cp.site_id=c.site_id) AS expired,
    EXISTS(SELECT 1 FROM site_lifecycle sl WHERE sl.site_id=c.site_id AND sl.org_id=c.org_id AND sl.state='archived') AS archived,
    EXISTS(SELECT 1 FROM submission_receipts sr WHERE sr.assignment_id=a.id AND sr.org_id=a.org_id) AS has_answer,
    EXISTS(SELECT 1 FROM case_repeats cr JOIN clarifications cc ON cc.id=cr.case_id AND cc.org_id=cr.org_id AND cc.site_id=cr.site_id
      WHERE cr.assignment_id=a.id AND cr.org_id=a.org_id AND cr.site_id=a.site_id AND cr.status='pending' AND cr.due_at>clock_timestamp() AND cc.status='open') AS active_repeat
    FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
    JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
    JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id
    LEFT JOIN attempts t ON t.id=c.attempt_id AND t.assignment_id=a.id AND t.org_id=a.org_id AND t.site_id=a.site_id
    LEFT JOIN case_routing r ON r.case_id=c.id AND r.org_id=c.org_id AND r.site_id=c.site_id
    WHERE c.id=$1 AND c.org_id=$2 AND c.site_id=$3`,[caseId,session.org_id,session.site_id])).rows[0];
  if(!row)throw Error('Clarification unavailable');return row;
}
const blocked=(row,session)=>!['owner','supervisor'].includes(session.role)?'read_only':row.archived?'workspace_archived':!row.active||row.deleting?'worker_unavailable':row.expired?'content_expired':null;
async function history(client,session,caseId,table,page,pageSize){
  // The table is selected only by the two fixed exports below, never by request input.
  const args=[caseId,session.org_id,session.site_id],total=Number((await client.query(`SELECT count(*)::int n FROM ${table} WHERE case_id=$1 AND org_id=$2 AND site_id=$3`,args)).rows[0].n);
  if(!Number.isSafeInteger(total)||total>25000)throw Error('Case workflow history exceeds limit');
  const order=table==='case_reviews'?'sequence DESC':'created_at DESC,id DESC';
  const rows=(await client.query(`SELECT * FROM ${table} WHERE case_id=$1 AND org_id=$2 AND site_id=$3 ORDER BY ${order} LIMIT $4 OFFSET $5`,[...args,pageSize,(page-1)*pageSize])).rows;
  return {rows,total,page,pageSize};
}
export function caseRepeatPage(pool,session,caseId,input={}, {schema='public'}={}){
  const {page,pageSize}=caseWorkflowPageInput(caseId,input);
  return responseRead(pool,schema,async client=>{
    const row=await context(client,session,caseId),result=await history(client,session,caseId,'case_repeats',page,pageSize);
    const reason=blocked(row,session)||(row.status==='resolved'?'case_resolved':row.state!=='published'||!row.publication_available?'publication_unavailable':!row.has_answer?'no_answer':row.active_repeat?'active_repeat':null);
    return {caseId,caseStatus:row.status,items:result.rows.map(repeatRow),total:result.total,page,pageSize,canRequest:reason===null,blockedReason:reason};
  });
}
export function caseReviewPage(pool,session,caseId,input={}, {schema='public'}={}){
  const {page,pageSize}=caseWorkflowPageInput(caseId,input);
  return responseRead(pool,schema,async client=>{
    const row=await context(client,session,caseId),result=await history(client,session,caseId,'case_reviews',page,pageSize),reason=blocked(row,session),hasAssessment=!!row.attempt_id&&!!row.outcome;
    return {caseId,caseStatus:row.status,items:result.rows.map(caseReviewRow),total:result.total,page,pageSize,effectiveDueAt:iso(row.effective_due)??null,
      hasAssessment,canChangeDeadline:reason===null&&row.status==='open',canDisagree:reason===null&&hasAssessment,blockedReason:reason};
  });
}
