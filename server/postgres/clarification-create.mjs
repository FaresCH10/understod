import {domainTransaction,domainAudit,requirePrincipal} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {requireSiteOperational} from './site-lifecycle.mjs';
import {routeNewCase} from './case-routing.mjs';
import {clarificationCreationInput,clarificationSubjectFilters,creationIdentifier,creationRequestId,clarificationSubjectRow,exactClarificationCreation} from '../clarification-create-input.mjs';

const eligible=`w.active AND p.state='published' AND publication_content_available(p.id)
  AND NOT EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=w.id AND d.org_id=w.org_id AND d.site_id=w.site_id)`;
const subject=`SELECT a.id,a.publication_id,a.language,a.created_at,w.code AS worker,p.version,p.snapshot_json->>'title' AS title
  FROM assignments a JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
  JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id`;
export function listClarificationSubjects(pool,session,input={}, {schema='public'}={}){
  const {search,page,pageSize}=clarificationSubjectFilters(input);
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','supervisor']);await requireSiteOperational(client,session.org_id,session.site_id);
    const args=[session.org_id,session.site_id,search],where=`a.org_id=$1 AND a.site_id=$2 AND ${eligible} AND ($3='' OR strpos(lower(w.code||' '||COALESCE(p.snapshot_json->>'title','')),lower($3))>0)`;
    const total=Number((await client.query(`SELECT count(*)::int AS n FROM (${subject} WHERE ${where}) rows`,args)).rows[0].n);
    if(total>5000)throw Error('Clarification subjects exceed limit');
    const rows=(await client.query(`${subject} WHERE ${where} ORDER BY lower(w.code),a.created_at DESC,a.id LIMIT $4 OFFSET $5`,[...args,pageSize,(page-1)*pageSize])).rows;
    return {items:rows.map(clarificationSubjectRow),total,page,pageSize,search};
  });
}
export function getClarificationSubject(pool,session,id,{schema='public'}={}){
  if(!creationIdentifier(id))throw Error('Invalid clarification subject');
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','supervisor']);await requireSiteOperational(client,session.org_id,session.site_id);
    const row=(await client.query(`${subject} WHERE a.id=$1 AND a.org_id=$2 AND a.site_id=$3 AND ${eligible}`,[id,session.org_id,session.site_id])).rows[0];
    if(!row)throw Error('Clarification subject unavailable');
    const attempt=(await client.query(`SELECT t.id,t.answer_text,t.outcome,t.assessment_status,t.received_at,c.id AS case_id FROM attempts t
      LEFT JOIN clarifications c ON c.attempt_id=t.id AND c.org_id=t.org_id AND c.site_id=t.site_id
      WHERE t.assignment_id=$1 AND t.org_id=$2 AND t.site_id=$3 ORDER BY t.received_at DESC,t.id DESC LIMIT 1`,[id,session.org_id,session.site_id])).rows[0];
    return {...clarificationSubjectRow(row),latestAttempt:attempt?{id:attempt.id,text:attempt.answer_text,outcome:attempt.outcome,complete:attempt.assessment_status==='complete',
      receivedAt:attempt.received_at instanceof Date?attempt.received_at.toISOString():attempt.received_at,existingCaseId:attempt.case_id??null}:null};
  });
}
export function createStaffClarification(pool,session,input,{schema='public'}={}){
  const command=clarificationCreationInput(input),value=command.content;
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','supervisor']);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`clarification-create:${command.id}`]);
    const old=(await client.query('SELECT * FROM clarification_creations WHERE request_id=$1',[command.id])).rows[0];
    if(old)return exactClarificationCreation(old,session,command);
    await requireSiteOperational(client,session.org_id,session.site_id);
    const worker=(await client.query(`SELECT w.id FROM workers w JOIN assignments a ON a.worker_id=w.id AND a.org_id=w.org_id AND a.site_id=w.site_id
      WHERE a.id=$1 AND a.org_id=$2 AND a.site_id=$3 AND w.active FOR SHARE OF w`,[value.assignmentId,session.org_id,session.site_id])).rows[0];
    if(!worker)throw Error('Clarification subject unavailable');
    const assignment=(await client.query('SELECT id,publication_id FROM assignments WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR UPDATE',[value.assignmentId,session.org_id,session.site_id])).rows[0];
    const publication=(await client.query('SELECT id,version,state,publication_content_available(id) AS available FROM publications WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR SHARE',[assignment.publication_id,session.org_id,session.site_id])).rows[0];
    if(publication?.id!==value.publicationId||publication.version!==value.version||publication.state!=='published'||!publication.available
      ||(await client.query('SELECT 1 FROM worker_deletion_requests WHERE worker_id=$1 AND org_id=$2 AND site_id=$3',[worker.id,session.org_id,session.site_id])).rows.length)throw Error('Clarification subject unavailable');
    if(value.attemptId){
      const latest=(await client.query('SELECT id,outcome,assessment_status FROM attempts WHERE assignment_id=$1 AND org_id=$2 AND site_id=$3 ORDER BY received_at DESC,id DESC LIMIT 1',[assignment.id,session.org_id,session.site_id])).rows[0];
      if(latest?.id!==value.attemptId)throw Error('Clarification selected answer changed');
      if(latest.assessment_status!=='complete'||!latest.outcome)throw Error('Clarification selected answer unavailable');
      if((await client.query('SELECT 1 FROM clarifications WHERE attempt_id=$1',[value.attemptId])).rows.length)throw Error('Clarification answer already has a case');
    }
    if((await client.query('SELECT 1 FROM clarifications WHERE id=$1',[command.id])).rows.length)throw Error('Clarification creation conflict');
    const createdAt=(await client.query(`INSERT INTO clarifications(id,org_id,site_id,assignment_id,attempt_id,reason,status)
      VALUES($1,$2,$3,$4,$5,$6,'open') RETURNING created_at`,[command.id,session.org_id,session.site_id,assignment.id,value.attemptId,`Staff follow-up: ${value.reason}`])).rows[0].created_at;
    await routeNewCase(client,session.org_id,session.site_id,command.id);
    const row=(await client.query(`INSERT INTO clarification_creations(request_id,org_id,site_id,case_id,assignment_id,publication_id,publication_version,attempt_id,actor_id,actor_role,request_hash,created_at)
      VALUES($1,$2,$3,$1,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[command.id,session.org_id,session.site_id,assignment.id,publication.id,publication.version,value.attemptId,session.principal_id,session.role,command.hash,createdAt])).rows[0];
    await domainAudit(client,session,'clarification.created',command.id);return exactClarificationCreation(row,session,command);
  });
}
export function staffClarificationCreationReceipt(pool,session,id,{schema='public'}={}){
  if(!creationRequestId(id))throw Error('Invalid clarification creation');
  return responseRead(pool,schema,async client=>{await requirePrincipal(client,session,'staff',['owner','supervisor']);
    return exactClarificationCreation((await client.query('SELECT * FROM clarification_creations WHERE request_id=$1 AND org_id=$2 AND site_id=$3 AND actor_id=$4 AND actor_role=$5',[id,session.org_id,session.site_id,session.principal_id,session.role])).rows[0],session);});
}
