import { randomUUID } from 'node:crypto';
import { NOW } from './db.mjs';
import { csvCell } from './reports.mjs';

function authority(db, session) {
  if (session?.principal_type !== 'staff' || !['owner','supervisor','auditor'].includes(session.role)) throw new Error('Forbidden');
  const site = db.prepare(`SELECT st.timezone FROM staff s JOIN sites st ON st.id=s.site_id AND st.org_id=s.org_id
    WHERE s.id=? AND s.org_id=? AND s.site_id=? AND s.role=? AND s.active=1`)
    .get(session.principal_id, session.org_id, session.site_id, session.role);
  if (!site) throw new Error('Forbidden');
  return site;
}

const eventQuery = `SELECT e.id,e.actor_type,e.actor_id,e.action,e.object_id,e.occurred_at,
  CASE WHEN e.actor_type='staff' THEN s.name WHEN e.actor_type='worker' THEN w.code ELSE 'System' END AS actor
  FROM audit e
  LEFT JOIN staff s ON e.actor_type='staff' AND s.id=e.actor_id AND s.org_id=e.org_id AND s.site_id=e.site_id
  LEFT JOIN workers w ON e.actor_type='worker' AND w.id=e.actor_id AND w.org_id=e.org_id AND w.site_id=e.site_id`;

export function eventRow(row) {
  return { id: row.id, actor: row.actor || 'Former site member', actorType: row.actor_type,
    actorId: row.actor_id, action: row.action, objectId: row.object_id,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
    ...(row.identity_expired?{identityExpired:true}:{}) };
}

function localDate(value, formatter) {
  const parts = formatter.formatToParts(new Date(value));
  return ['year','month','day'].map((type) => parts.find((part) => part.type === type).value).join('-');
}

export function auditFilters(filters = {}) {
  if (!filters || typeof filters!=='object' || Array.isArray(filters)) throw new Error('Invalid activity filter');
  if (Object.keys(filters).some((key) => !['date','search','actorType','action','page','pageSize'].includes(key))) throw new Error('Invalid activity filter');
  const { date = '', search = '', actorType = 'all', action = '' } = filters;
  const page = Number(filters.page ?? 1), pageSize = Number(filters.pageSize ?? 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 5000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      typeof search !== 'string' || search.length > 80 || typeof action !== 'string' || action.length > 100 ||
      !['all','staff','worker','system'].includes(actorType) || typeof date !== 'string') throw new Error('Invalid activity filter');
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid activity date');
    const midnight = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0,10) !== date) throw new Error('Invalid activity date');
  }
  return {date,search:search.trim(),actorType,action,page,pageSize};
}

function filteredAuditEvents(db, session, filters) {
  const { timezone } = authority(db, session);
  const {date,search,actorType,action,page,pageSize} = auditFilters(filters);
  const where = ['e.org_id=?','e.site_id=?'], args = [session.org_id, session.site_id];
  if (date) {
    const midnight = new Date(`${date}T00:00:00.000Z`);
    // Use a bounded UTC window, then Intl's timezone rules for the exact civil date, including DST.
    where.push('e.occurred_at>=? AND e.occurred_at<?');
    args.push(new Date(midnight.getTime() - 2 * 86400000).toISOString(), new Date(midnight.getTime() + 2 * 86400000).toISOString());
  }
  if (actorType !== 'all') { where.push('e.actor_type=?'); args.push(actorType); }
  if (action) { where.push('e.action=?'); args.push(action); }
  if (search.trim()) {
    where.push("instr(lower(e.action||' '||e.object_id||' '||COALESCE(s.name,w.code,'')),lower(?))>0");
    args.push(search.trim());
  }
  const candidates = db.prepare(`${eventQuery} WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC,e.id DESC LIMIT 5001`).all(...args);
  if (candidates.length > 5000) throw new Error('Activity exceeds limit; narrow the date, actor or action filter');
  const formatter = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const rows = candidates.filter((row) => !date || localDate(row.occurred_at, formatter) === date).map(eventRow);
  const actions = db.prepare('SELECT DISTINCT action FROM audit WHERE org_id=? AND site_id=? ORDER BY action LIMIT 100')
    .all(session.org_id, session.site_id).map((row) => row.action);
  return { rows, total: rows.length, page, pageSize,
    timezone, asOf: NOW(), actions };
}

export function listAuditEvents(db, session, filters = {}) {
  const result = filteredAuditEvents(db, session, filters);
  return { ...result, rows: result.rows.slice((result.page-1)*result.pageSize,result.page*result.pageSize) };
}

export function getAuditEvent(db, session, id) {
  const { timezone } = authority(db, session);
  const row = db.prepare(`${eventQuery} WHERE e.id=? AND e.org_id=? AND e.site_id=?`).get(id, session.org_id, session.site_id);
  if (!row) throw new Error('Event unavailable');
  return { ...eventRow(row), timezone };
}

export function exportAuditEvents(db, session, filters = {}) {
  // Reuse the exact filters and bounds; only pagination is replaced for the download.
  const { rows, timezone } = filteredAuditEvents(db, session, filters);
  const csv = auditCsv(rows,timezone);
  db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),session.org_id,session.site_id,
    'staff',session.principal_id,'audit.exported',randomUUID(),NOW());
  return csv;
}

export function auditCsv(rows,timezone) {
  const csv = '\uFEFF' + [['event_id','occurred_at_utc','site_timezone','actor','actor_type','action','object_id'],
    ...rows.map((row) => [row.id,row.occurredAt,timezone,row.actor,row.actorType,row.action,row.objectId])]
    .map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  if (Buffer.byteLength(csv) > 2_000_000) throw new Error('Activity exceeds export limit');
  return csv;
}
