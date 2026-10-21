import {createHash} from 'node:crypto';
import {domainTransaction,requirePrincipal,domainAudit} from './domain.mjs';
import {requireSiteOperational} from './site-lifecycle.mjs';

const iso=value=>value instanceof Date?value.toISOString():value;
const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const date=value=>typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
export const caseDeadlineOverride=`(SELECT v.due_at FROM case_reviews v WHERE v.case_id=c.id AND v.org_id=c.org_id AND v.site_id=c.site_id AND v.kind='deadline' ORDER BY v.sequence DESC LIMIT 1)`;
export const caseReviewRow=row=>({id:row.id,caseId:row.case_id,kind:row.kind,createdAt:iso(row.created_at),dueAt:iso(row.due_at),expectedDueAt:iso(row.expected_due_at),reason:row.reason,attemptId:row.attempt_id,actorId:row.actor_id,requestHash:row.request_hash});
const dto=caseReviewRow;
function inputReview(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || !uuid(input.requestId))throw Error('Invalid case review');
  let content;
  if(input.kind==='deadline' && Object.keys(input).sort().join(',')==='dueAt,expectedDueAt,kind,requestId' && date(input.dueAt) && (input.expectedDueAt===null || date(input.expectedDueAt)))content={kind:input.kind,dueAt:input.dueAt,expectedDueAt:input.expectedDueAt};
  else if(input.kind==='disagree' && Object.keys(input).sort().join(',')==='kind,reason,requestId' && typeof input.reason==='string' && input.reason.trim().length>=5 && input.reason.length<=1000)content={kind:input.kind,reason:input.reason.trim()};
  else throw Error('Invalid case review');
  return {...content,id:input.requestId,hash:createHash('sha256').update(JSON.stringify(content)).digest('hex')};
}
async function thread(client,session,caseId,write=false) {
  await requirePrincipal(client,session,'staff',write?['owner','supervisor']:['owner','supervisor','auditor']);
  if(write)await requireSiteOperational(client,session.org_id,session.site_id);
  const worker=(await client.query(`SELECT w.active FROM workers w JOIN assignments a ON a.worker_id=w.id AND a.org_id=w.org_id AND a.site_id=w.site_id
    JOIN clarifications c ON c.assignment_id=a.id AND c.org_id=a.org_id AND c.site_id=a.site_id
    WHERE c.id=$1 AND c.org_id=$2 AND c.site_id=$3 ${write?'FOR SHARE OF w':''}`,[caseId,session.org_id,session.site_id])).rows[0];
  if(!worker)throw Error('Clarification unavailable');
  if(write)await client.query('SELECT id FROM clarifications WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR UPDATE',[caseId,session.org_id,session.site_id]);
  // Read the append-only deadline ledger in a fresh statement after acquiring the case lock.
  const row=(await client.query(`SELECT c.status,c.assignment_id,c.attempt_id,t.outcome,COALESCE(${caseDeadlineOverride},r.due_at,a.due_at) AS effective_due
    FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
    LEFT JOIN case_routing r ON r.case_id=c.id AND r.org_id=c.org_id AND r.site_id=c.site_id
    LEFT JOIN attempts t ON t.id=c.attempt_id AND t.assignment_id=a.id AND t.org_id=c.org_id AND t.site_id=c.site_id
    WHERE c.id=$1 AND c.org_id=$2 AND c.site_id=$3`,[caseId,session.org_id,session.site_id])).rows[0];
  return {...row,active:worker.active};
}
export function listCaseReviews(pool,session,caseId,{schema='public'}={}) {
  return domainTransaction(pool,schema,async client=>{
    await thread(client,session,caseId);return (await client.query('SELECT * FROM case_reviews WHERE case_id=$1 AND org_id=$2 AND site_id=$3 ORDER BY sequence DESC LIMIT 100',[caseId,session.org_id,session.site_id])).rows.map(dto);
  });
}
export async function caseReviewReceipt(pool,session,caseId,id,{schema='public'}={}) {
  if(!uuid(id))throw Error('Invalid case review');
  return domainTransaction(pool,schema,async client=>{
    await thread(client,session,caseId);const row=(await client.query('SELECT * FROM case_reviews WHERE id=$1 AND case_id=$2 AND org_id=$3 AND site_id=$4 AND actor_id=$5 AND actor_role=$6',[id,caseId,session.org_id,session.site_id,session.principal_id,session.role])).rows[0];
    if(!row)throw Error('Case review receipt unavailable');return dto(row);
  });
}
export async function saveCaseReview(pool,session,caseId,input,{schema='public'}={}) {
  const request=inputReview(input);
  return domainTransaction(pool,schema,async client=>{
    const current=await thread(client,session,caseId,true);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`case-review:${request.id}`]);
    const old=(await client.query('SELECT * FROM case_reviews WHERE id=$1',[request.id])).rows[0];
    if(old){if(old.case_id!==caseId || old.org_id!==session.org_id || old.site_id!==session.site_id || old.actor_id!==session.principal_id || old.actor_role!==session.role || old.request_hash!==request.hash)throw Error('Case review request conflict');return dto(old);}
    if((await client.query('SELECT 1 FROM case_content_purges WHERE case_id=$1',[caseId])).rows.length)throw Error('Case review unavailable');
    if(!current.active || (await client.query('SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=$1',[current.assignment_id])).rows.length)throw Error('Case review unavailable');
    if(request.kind==='deadline') {
      if(current.status!=='open')throw Error('Case review unavailable');
      if(iso(current.effective_due)!==request.expectedDueAt)throw Error('Case deadline changed');
      if(request.dueAt===request.expectedDueAt)throw Error('Case deadline unchanged');
      if(!(await client.query("SELECT $1::timestamptz>clock_timestamp() AND $1::timestamptz<=clock_timestamp()+interval '30 days' AS valid",[request.dueAt])).rows[0].valid)throw Error('Invalid case deadline');
    }else if(!current.attempt_id || !current.outcome)throw Error('Original assessment unavailable');
    const row=(await client.query(`INSERT INTO case_reviews(id,org_id,site_id,case_id,assignment_id,actor_id,actor_role,kind,request_hash,due_at,expected_due_at,reason,attempt_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[request.id,session.org_id,session.site_id,caseId,current.assignment_id,session.principal_id,session.role,request.kind,request.hash,
      request.dueAt??null,request.expectedDueAt??null,request.reason??null,request.kind==='disagree'?current.attempt_id:null])).rows[0];
    await domainAudit(client,session,request.kind==='deadline'?'clarification.deadline_changed':'clarification.disagreed',row.id);return dto(row);
  });
}
