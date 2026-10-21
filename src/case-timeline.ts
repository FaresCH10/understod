import {ClarificationContractError} from './clarification-contract.ts';

export const timelineKinds=['case_opened','response_received','assessment_recorded','owner_changed','owner_routed','escalated','resolution_recorded','message_received','followup_queued','followup_delivered','repeat_requested','deadline_changed','assessment_disputed','in_person_recorded'] as const;
export type TimelineKind=typeof timelineKinds[number];
export type TimelineItem={id:string;kind:TimelineKind;occurredAt:string;actorName:string|null;outcome:'matched'|'clarification'|'unassessable'|null;dueAt:string|null};
export type TimelinePage={caseId:string;page:number;pageSize:10;total:number;items:TimelineItem[];clientContext:string};
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const invalid=()=>{throw new ClarificationContractError('invalid');};
export function checkedCaseTimeline(value:unknown,caseId:string,page:number,context:string):TimelinePage{
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(caseId)||!Number.isSafeInteger(page)||page<1||page>5000||!/^[a-f0-9]{64}$/.test(context)||!exact(value,['caseId','page','pageSize','total','items','clientContext']))return invalid();
  if(value.clientContext!==context)throw new ClarificationContractError('session');
  if(value.caseId!==caseId||value.page!==page||value.pageSize!==10||!Number.isSafeInteger(value.total)||Number(value.total)<0||Number(value.total)>50000
    ||!Array.isArray(value.items)||value.items.length!==Math.min(10,Math.max(0,Number(value.total)-(page-1)*10)))return invalid();
  const ids=new Set<string>();let previous:TimelineItem|null=null;
  for(const raw of value.items){
    if(!exact(raw,['id','kind','occurredAt','actorName','outcome','dueAt'])||typeof raw.id!=='string'||!/^[a-z]+:[A-Za-z0-9_-]{1,100}$/.test(raw.id)||ids.has(raw.id)
      ||!timelineKinds.includes(raw.kind as TimelineKind)||!date(raw.occurredAt)||raw.actorName!==null&&(typeof raw.actorName!=='string'||!raw.actorName.trim()||raw.actorName.length>500)
      ||(raw.kind==='assessment_recorded'?!['matched','clarification','unassessable'].includes(raw.outcome as string):raw.outcome!==null)
      ||(['repeat_requested','deadline_changed'].includes(raw.kind as string)?!date(raw.dueAt):raw.dueAt!==null))return invalid();
    const row=raw as unknown as TimelineItem;
    if(previous&&(row.occurredAt<previous.occurredAt||row.occurredAt===previous.occurredAt&&row.id<=previous.id))return invalid();
    ids.add(row.id);previous=row;
  }
  return value as unknown as TimelinePage;
}
