import {NOW,transaction} from './db.mjs';
import {crewFilters,readCrewPage} from './people.mjs';
import {responseColumns} from './recordings.mjs';
import {crewOverviewResult,crewActivityActions} from './crew-overview.mjs';

export function siteCrewOverview(db,session,input={}) {
  const filters=crewFilters(input);
  return transaction(db,()=>{
    const page=readCrewPage(db,session,filters);
    if(session.token_hash!==undefined && !db.prepare(`SELECT 1 FROM sessions WHERE token_hash=? AND principal_type='staff'
      AND principal_id=? AND org_id=? AND site_id=? AND revoked_at IS NULL AND expires_at>?`)
      .get(session.token_hash,session.principal_id,session.org_id,session.site_id,NOW()))throw Error('Sign in required');
    const site=db.prepare('SELECT id,name,timezone FROM sites WHERE id=? AND org_id=?').get(session.site_id,session.org_id);
    if(!site)throw Error('Forbidden');
    const settings=db.prepare('SELECT primary_contact_id,deputy_contact_id FROM site_settings WHERE site_id=? AND org_id=?').get(session.site_id,session.org_id);
    const contact=id=>id?db.prepare("SELECT name,role FROM staff WHERE id=? AND org_id=? AND site_id=? AND active=1 AND role IN ('owner','supervisor')").get(id,session.org_id,session.site_id) || null:null;
    const contacts={primary:contact(settings?.primary_contact_id),deputy:contact(settings?.deputy_contact_id)};
    const row=db.prepare(`SELECT id,briefing_id,version,snapshot_json,published_at FROM publications WHERE org_id=? AND site_id=?
      AND state='published' ORDER BY published_at DESC,id LIMIT 1`).get(session.org_id,session.site_id);
    const publication=row?{id:row.id,briefingId:row.briefing_id,version:row.version,title:JSON.parse(row.snapshot_json).title,publishedAt:row.published_at}:null;
    const responses=row?db.prepare(`SELECT a.id AS assignment_id,${responseColumns} FROM assignments a
      WHERE a.org_id=? AND a.site_id=? AND a.publication_id=? ORDER BY a.id LIMIT 5001`).all(session.org_id,session.site_id,row.id):[];
    const hasTable=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    const audience=row && hasTable('publication_report_audience')?db.prepare('SELECT assignment_id,crew_id FROM publication_report_audience WHERE org_id=? AND site_id=? AND publication_id=?').all(session.org_id,session.site_id,row.id):[];
    const deletionTable=hasTable('worker_deletion_requests');
    const activity=db.prepare(`SELECT e.id,e.action,e.occurred_at,s.name AS actor,
      CASE WHEN e.action LIKE 'crew.%' THEN c.name ELSE ${deletionTable?'CASE WHEN d.id IS NULL THEN w.code ELSE NULL END':'NULL'} END AS item
      FROM audit e LEFT JOIN staff s ON e.actor_type='staff' AND s.id=e.actor_id AND s.org_id=e.org_id AND s.site_id=e.site_id
      LEFT JOIN crews c ON e.action LIKE 'crew.%' AND c.id=e.object_id AND c.org_id=e.org_id AND c.site_id=e.site_id
      LEFT JOIN workers w ON e.action LIKE 'worker.%' AND w.id=e.object_id AND w.org_id=e.org_id AND w.site_id=e.site_id
      ${deletionTable?'LEFT JOIN worker_deletion_requests d ON d.worker_id=w.id AND d.org_id=w.org_id AND d.site_id=w.site_id':''}
      WHERE e.org_id=? AND e.site_id=? AND e.action IN (${crewActivityActions.map(()=>'?').join(',')})
      ORDER BY e.occurred_at DESC,e.id DESC LIMIT 6`).all(session.org_id,session.site_id,...crewActivityActions);
    return crewOverviewResult({page,site,contacts,publication,responses,audience,activity,asOf:NOW()});
  });
}
