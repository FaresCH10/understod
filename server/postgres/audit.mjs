import { randomUUID } from 'node:crypto';
import { auditFilters,eventRow,auditCsv } from '../audit.mjs';
import { domainTransaction,requirePrincipal,domainAudit } from './domain.mjs';

const roles=['owner','supervisor','auditor'];
const eventQuery=`SELECT e.id,e.actor_type,e.actor_id,e.action,e.object_id,e.occurred_at,
  CASE WHEN d.event_id IS NOT NULL THEN 'Expired actor' WHEN e.actor_type='staff' THEN s.name WHEN e.actor_type='worker' THEN w.code ELSE 'System' END AS actor,
  d.event_id IS NOT NULL AS identity_expired
  FROM audit e
  LEFT JOIN activity_identity_purges d ON d.event_id=e.id AND d.org_id=e.org_id AND d.site_id=e.site_id
  LEFT JOIN staff s ON e.actor_type='staff' AND s.id=e.actor_id AND s.org_id=e.org_id AND s.site_id=e.site_id
  LEFT JOIN workers w ON e.actor_type='worker' AND w.id=e.actor_id AND w.org_id=e.org_id AND w.site_id=e.site_id`;

async function authority(client,session) {
  await requirePrincipal(client,session,'staff',roles);
  return (await client.query('SELECT timezone FROM sites WHERE id=$1 AND org_id=$2',[session.site_id,session.org_id])).rows[0].timezone;
}

async function filtered(client,session,filters) {
  const {date,search,actorType,action,page,pageSize}=auditFilters(filters);
  const timezone=await authority(client,session);
  const args=[session.org_id,session.site_id],where=['e.org_id=$1','e.site_id=$2'];
  const bind=(value) => {args.push(value); return `$${args.length}`;};
  if (date) {
    const midnight=Date.parse(`${date}T00:00:00.000Z`);
    where.push(`e.occurred_at>=${bind(new Date(midnight-2*86400000))} AND e.occurred_at<${bind(new Date(midnight+2*86400000))}`);
    where.push(`(e.occurred_at AT TIME ZONE ${bind(timezone)})::date=${bind(date)}::date`);
  }
  if (actorType!=='all') where.push(`e.actor_type=${bind(actorType)}`);
  if (action) where.push(`e.action=${bind(action)}`);
  if (search) where.push(`strpos(lower(e.action||' '||e.object_id||' '||CASE WHEN d.event_id IS NOT NULL THEN '' ELSE COALESCE(s.name,w.code,'') END),lower(${bind(search)}))>0`);
  const rows=(await client.query(`${eventQuery} WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC,e.id DESC LIMIT 5001`,args)).rows;
  if (rows.length>5000) throw new Error('Activity exceeds limit; narrow the date, actor or action filter');
  const actions=(await client.query('SELECT DISTINCT action FROM audit WHERE org_id=$1 AND site_id=$2 ORDER BY action LIMIT 100',[session.org_id,session.site_id])).rows.map((row) => row.action);
  return {rows:rows.map(eventRow),total:rows.length,page,pageSize,timezone,asOf:new Date().toISOString(),actions};
}

export async function listAuditEvents(pool,session,filters={}, {schema='public'}={}) {
  return domainTransaction(pool,schema,async (client) => {
    const result=await filtered(client,session,filters);
    return {...result,rows:result.rows.slice((result.page-1)*result.pageSize,result.page*result.pageSize)};
  });
}

export async function getAuditEvent(pool,session,id,{schema='public'}={}) {
  return domainTransaction(pool,schema,async (client) => {
    const timezone=await authority(client,session);
    const row=(await client.query(`${eventQuery} WHERE e.id=$1 AND e.org_id=$2 AND e.site_id=$3`,[id,session.org_id,session.site_id])).rows[0];
    if (!row) throw new Error('Event unavailable');
    return {...eventRow(row),timezone};
  });
}

export async function exportAuditEvents(pool,session,filters={}, {schema='public'}={}) {
  return domainTransaction(pool,schema,async (client) => {
    const {rows,timezone}=await filtered(client,session,filters),csv=auditCsv(rows,timezone);
    await domainAudit(client,session,'audit.exported',randomUUID());
    return csv;
  });
}
