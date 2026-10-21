import {randomUUID} from 'node:crypto';
import {NOW,transaction} from './db.mjs';
import {requireClarificationPrincipal} from './clarifications.mjs';
import {requireSiteOperational} from './site-lifecycle.mjs';
import {routeNewCase} from './case-routing.mjs';
import {clarificationCreationInput,clarificationSubjectFilters,creationIdentifier,creationRequestId,clarificationSubjectRow,exactClarificationCreation} from './clarification-create-input.mjs';

const eligible=`w.active=1 AND p.state='published' AND NOT EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=w.id AND d.org_id=w.org_id AND d.site_id=w.site_id)`;
const subject=`SELECT a.id,a.publication_id,a.language,a.created_at,w.code AS worker,p.version,json_extract(p.snapshot_json,'$.title') AS title
  FROM assignments a JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
  JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id`;
function authority(db,session){requireClarificationPrincipal(db,session,'staff',true);requireSiteOperational(db,session.org_id,session.site_id);}
export function listClarificationSubjects(db,session,input={}){
  const {search,page,pageSize}=clarificationSubjectFilters(input);
  return transaction(db,()=>{
    authority(db,session);const args=[session.org_id,session.site_id,search,search];
    const where=`a.org_id=? AND a.site_id=? AND ${eligible} AND (?='' OR instr(lower(w.code||' '||COALESCE(json_extract(p.snapshot_json,'$.title'),'')),lower(?))>0)`;
    const total=db.prepare(`SELECT count(*) AS n FROM (${subject} WHERE ${where})`).get(...args).n;
    if(total>5000)throw Error('Clarification subjects exceed limit');
    const rows=db.prepare(`${subject} WHERE ${where} ORDER BY lower(w.code),a.created_at DESC,a.id LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize);
    return {items:rows.map(clarificationSubjectRow),total,page,pageSize,search};
  });
}
export function getClarificationSubject(db,session,id){
  if(!creationIdentifier(id))throw Error('Invalid clarification subject');
  return transaction(db,()=>{
    authority(db,session);const row=db.prepare(`${subject} WHERE a.id=? AND a.org_id=? AND a.site_id=? AND ${eligible}`).get(id,session.org_id,session.site_id);
    if(!row)throw Error('Clarification subject unavailable');
    const attempt=db.prepare(`SELECT t.id,t.answer_text,t.outcome,t.received_at,c.id AS case_id FROM attempts t LEFT JOIN clarifications c ON c.attempt_id=t.id AND c.org_id=t.org_id
      WHERE t.assignment_id=? AND t.org_id=? ORDER BY t.received_at DESC,t.id DESC LIMIT 1`).get(id,session.org_id);
    return {...clarificationSubjectRow(row),latestAttempt:attempt?{id:attempt.id,text:attempt.answer_text,outcome:attempt.outcome,complete:!!attempt.outcome,receivedAt:attempt.received_at,existingCaseId:attempt.case_id??null}:null};
  });
}
export function createStaffClarification(db,session,input){
  const command=clarificationCreationInput(input),value=command.content;
  return transaction(db,()=>{
    requireClarificationPrincipal(db,session,'staff',true);
    const old=db.prepare('SELECT * FROM clarification_creations WHERE request_id=?').get(command.id);if(old)return exactClarificationCreation(old,session,command);
    requireSiteOperational(db,session.org_id,session.site_id);
    const row=db.prepare(`${subject} WHERE a.id=? AND a.org_id=? AND a.site_id=? AND ${eligible}`).get(value.assignmentId,session.org_id,session.site_id);
    if(!row||row.publication_id!==value.publicationId||row.version!==value.version)throw Error('Clarification subject unavailable');
    if(value.attemptId){
      const latest=db.prepare('SELECT id,outcome FROM attempts WHERE assignment_id=? AND org_id=? ORDER BY received_at DESC,id DESC LIMIT 1').get(row.id,session.org_id);
      if(latest?.id!==value.attemptId)throw Error('Clarification selected answer changed');
      if(!latest.outcome)throw Error('Clarification selected answer unavailable');
      if(db.prepare('SELECT 1 FROM clarifications WHERE attempt_id=?').get(value.attemptId))throw Error('Clarification answer already has a case');
    }
    if(db.prepare('SELECT 1 FROM clarifications WHERE id=?').get(command.id))throw Error('Clarification creation conflict');
    const createdAt=NOW();
    db.prepare(`INSERT INTO clarifications(id,org_id,assignment_id,attempt_id,reason,owner_staff_id,status,notes,created_at)
      VALUES(?,?,?,?,?,NULL,'open','',?)`).run(command.id,session.org_id,row.id,value.attemptId,`Staff follow-up: ${value.reason}`,createdAt);
    routeNewCase(db,session.org_id,session.site_id,command.id);
    db.prepare(`INSERT INTO clarification_creations(request_id,org_id,site_id,case_id,assignment_id,publication_id,publication_version,attempt_id,actor_id,actor_role,request_hash,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(command.id,session.org_id,session.site_id,command.id,row.id,row.publication_id,row.version,value.attemptId,session.principal_id,session.role,command.hash,createdAt);
    db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),session.org_id,session.site_id,'staff',session.principal_id,'clarification.created',command.id,createdAt);
    return exactClarificationCreation(db.prepare('SELECT * FROM clarification_creations WHERE request_id=?').get(command.id),session,command);
  });
}
export function staffClarificationCreationReceipt(db,session,id){
  if(!creationRequestId(id))throw Error('Invalid clarification creation');
  return transaction(db,()=>{requireClarificationPrincipal(db,session,'staff',true);
    return exactClarificationCreation(db.prepare('SELECT * FROM clarification_creations WHERE request_id=? AND org_id=? AND site_id=? AND actor_id=? AND actor_role=?').get(id,session.org_id,session.site_id,session.principal_id,session.role),session);});
}
