import {metricsFromResponses} from './domain.mjs';

export const crewActivityActions=Object.freeze(['crew.created','crew.renamed','crew.archived','crew.restored','worker.created','worker.crew_moved']);

export function crewOverviewResult({page,site,contacts,publication,responses,audience,activity,asOf}) {
  if(responses.length>5000)throw Error('Crew overview assignment limit exceeded');
  const members=new Map(audience.map(row=>[row.assignment_id,row.crew_id]));
  const snapshotAvailable=!!publication && responses.length>0 && members.size===responses.length
    && audience.length===responses.length && responses.every(row=>members.has(row.assignment_id));
  const grouped=new Map();
  if(snapshotAvailable)for(const row of responses){const id=members.get(row.assignment_id);if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(row);}
  return {
    total:page.total,page:page.page,pageSize:page.pageSize,
    items:page.items.map(row=>({id:row.id,name:row.name,active:row.active,member_count:row.member_count,metrics:snapshotAvailable?metricsFromResponses(grouped.get(row.id)||[]):null})),
    site,contacts,publication,metrics:publication?metricsFromResponses(responses):null,
    metricScope:'latest_publication_frozen_crew_audience',crewSnapshotAvailable:snapshotAvailable,
    activity:activity.map(row=>({id:row.id,action:row.action,actor:row.actor || null,item:row.item || null,
      occurredAt:row.occurred_at instanceof Date?row.occurred_at.toISOString():row.occurred_at})),asOf,
  };
}

export function crewOverviewHttpError(error) {
  const message=error instanceof Error?error.message:'';
  const status=message==='Forbidden'?403:message==='Sign in required'?401:
    ['Invalid input','Invalid page','Invalid search','Invalid status','Invalid crew overview request','Crew overview assignment limit exceeded'].includes(message)?400:503;
  return {status,message:status===503?'Crew overview unavailable':message};
}
