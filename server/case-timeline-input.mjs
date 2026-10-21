import {caseMessageId} from './case-message-input.mjs';

export function caseTimelineInput(caseId,input={}){
  caseMessageId(caseId);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['page','pageSize'].includes(key)))throw Error('Invalid case timeline page');
  for(const key of ['page','pageSize'])if(input[key]!==undefined&&typeof input[key]!=='number'&&(typeof input[key]!=='string'||!(/^[1-9][0-9]*$/).test(input[key])))throw Error('Invalid case timeline page');
  const page=Number(input.page??1),pageSize=Number(input.pageSize??10);
  if(!Number.isSafeInteger(page)||page<1||page>5000||pageSize!==10)throw Error('Invalid case timeline page');
  return {page,pageSize};
}

// Only recorded event clocks are projected. Current status is never used to invent a past event.
export function caseTimelineQuery(postgres,staffRecordings=postgres){
  const p=n=>postgres?`$${n}`:`:p${n}`;
  const target=`SELECT c.id,c.assignment_id,c.attempt_id,c.created_at FROM clarifications c
    JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id ${postgres?'AND a.site_id=c.site_id':''}
    WHERE c.id=${p(1)} AND c.org_id=${p(2)} AND a.site_id=${p(3)}`;
  const scoped=alias=>`${alias}.org_id=${p(2)} AND ${alias}.site_id=${p(3)}`;
  const relatedRepeat=postgres?`OR EXISTS(SELECT 1 FROM case_repeats r WHERE r.case_id=c.id AND r.assignment_id=t.assignment_id AND r.submission_id=t.submission_id AND ${scoped('r')})`:'';
  const attempts=`SELECT t.id,t.outcome,t.received_at FROM attempts t JOIN target c ON c.assignment_id=t.assignment_id
    WHERE t.org_id=${p(2)} ${postgres?`AND t.site_id=${p(3)}`:''} AND (t.id=c.attempt_id ${relatedRepeat})`;
  const events=[
    `SELECT 'case:'||c.id AS id,'case_opened' AS kind,c.created_at AS occurred_at,s.name AS actor_name,CAST(NULL AS text) AS outcome,${postgres?'CAST(NULL AS timestamptz)':'CAST(NULL AS text)'} AS due_at
      FROM target c LEFT JOIN clarification_creations cr ON cr.case_id=c.id AND ${scoped('cr')}
      LEFT JOIN staff s ON s.id=cr.actor_id AND ${scoped('s')}`,
    `SELECT 'response:'||id,'response_received',received_at,NULL,NULL,NULL FROM linked_attempts`,
    `SELECT 'assessment:'||e.id,'assessment_recorded',e.occurred_at,NULL,t.outcome,NULL FROM audit e
      JOIN linked_attempts t ON t.id=e.object_id WHERE ${scoped('e')} AND e.action='answer.checked'`,
    `SELECT 'audit:'||e.id,CASE e.action WHEN 'clarification.assigned' THEN 'owner_changed' WHEN 'clarification.resolved' THEN 'resolution_recorded' END,
      e.occurred_at,s.name,NULL,NULL FROM audit e JOIN target c ON c.id=e.object_id
      LEFT JOIN staff s ON s.id=e.actor_id AND e.actor_type='staff' AND ${scoped('s')}
      WHERE ${scoped('e')} AND e.action IN ('clarification.assigned','clarification.resolved')`,
    `SELECT 'route:'||e.id,'owner_routed',e.occurred_at,s.name,NULL,NULL FROM audit e JOIN target c ON c.id=e.object_id
      JOIN case_routing r ON r.case_id=c.id AND ${scoped('r')}
      LEFT JOIN staff s ON s.id=r.routed_owner_id AND ${scoped('s')}
      WHERE ${scoped('e')} AND e.action='clarification.routed' AND r.routed_owner_id IS NOT NULL`,
    `SELECT 'escalation:'||r.case_id,'escalated',r.escalated_at,NULL,NULL,NULL FROM case_routing r JOIN target c ON c.id=r.case_id
      WHERE ${scoped('r')} AND r.escalated_at IS NOT NULL`,
    `SELECT 'message:'||m.id,'message_received',m.created_at,s.name,NULL,NULL FROM case_messages m JOIN target c ON c.id=m.case_id
      LEFT JOIN staff s ON s.id=m.actor_id AND m.actor_type='staff' AND ${scoped('s')} WHERE ${scoped('m')} AND m.assignment_id=c.assignment_id
      ${postgres?`AND NOT EXISTS(SELECT 1 FROM case_followups f WHERE f.id=m.id AND f.case_id=c.id AND ${scoped('f')})`:''}`,
  ];
  if(staffRecordings)events.push(`SELECT 'inperson:'||e.id,'in_person_recorded',e.occurred_at,s.name,NULL,NULL FROM audit e
    JOIN case_voice v ON v.request_id=e.object_id AND ${scoped('v')} AND v.actor_type='staff' AND v.kind='in_person' AND v.received_at IS NOT NULL
    JOIN target c ON c.id=v.requested_case_id AND c.assignment_id=v.assignment_id
    LEFT JOIN staff s ON s.id=e.actor_id AND e.actor_type='staff' AND ${scoped('s')}
    WHERE ${scoped('e')} AND e.action='clarification.in_person_recorded'`);
  if(postgres)events.push(
    `SELECT 'followup:'||f.id,'followup_queued',f.created_at,s.name,NULL,NULL FROM case_followups f JOIN target c ON c.id=f.case_id
      LEFT JOIN staff s ON s.id=f.actor_id AND ${scoped('s')} WHERE ${scoped('f')} AND f.assignment_id=c.assignment_id`,
    `SELECT 'delivery:'||f.id,'followup_delivered',f.delivered_at,NULL,NULL,NULL FROM case_followups f JOIN target c ON c.id=f.case_id
      WHERE ${scoped('f')} AND f.assignment_id=c.assignment_id AND f.delivered_at IS NOT NULL`,
    `SELECT 'repeat:'||r.id,'repeat_requested',r.created_at,s.name,NULL,r.due_at FROM case_repeats r JOIN target c ON c.id=r.case_id
      LEFT JOIN staff s ON s.id=r.actor_id AND ${scoped('s')} WHERE ${scoped('r')} AND r.assignment_id=c.assignment_id`,
    `SELECT 'review:'||r.id,CASE r.kind WHEN 'deadline' THEN 'deadline_changed' ELSE 'assessment_disputed' END,r.created_at,s.name,NULL,r.due_at
      FROM case_reviews r JOIN target c ON c.id=r.case_id LEFT JOIN staff s ON s.id=r.actor_id AND ${scoped('s')}
      WHERE ${scoped('r')} AND r.assignment_id=c.assignment_id`,
  );
  const cte=`WITH target AS (${target}),linked_attempts AS (${attempts}),events AS (${events.join('\nUNION ALL\n')})`;
  return {count:`${cte} SELECT count(*) AS total FROM events`,
    rows:`${cte} SELECT * FROM events ORDER BY occurred_at ASC,id COLLATE ${postgres?'"C"':'BINARY'} ASC LIMIT ${p(4)} OFFSET ${p(5)}`};
}

export function caseTimelinePage(caseId,input,total,rows){
  total=Number(total);if(!Number.isSafeInteger(total)||total<0||total>50000)throw Error('Case timeline exceeds limit');
  const iso=value=>value instanceof Date?value.toISOString():value;
  return {caseId,...input,total,items:rows.map(row=>({id:row.id,kind:row.kind,occurredAt:iso(row.occurred_at),actorName:row.actor_name??null,outcome:row.outcome??null,dueAt:iso(row.due_at)??null}))};
}
