import {domainTransaction,domainAudit} from './domain.mjs';
import {dispatchAllowed,dispatchPredicate} from './operations-gates.mjs';
import {requireSiteOperational} from './site-lifecycle.mjs';
import {caseDeadlineOverride} from './case-reviews.mjs';

const actor=(orgId,siteId)=>({org_id:orgId,site_id:siteId,principal_type:'system',principal_id:'case-routing-worker'});

export async function routeNewCase(client,orgId,siteId,id) {
  const row=(await client.query("SELECT owner_staff_id,created_at FROM clarifications WHERE id=$1 AND org_id=$2 AND site_id=$3 AND status='open'",[id,orgId,siteId])).rows[0];
  if(!row || (await client.query('SELECT 1 FROM case_routing WHERE case_id=$1',[id])).rows.length)return;
  const contact=(await client.query(`SELECT s.id FROM site_settings t JOIN staff s ON s.id IN (t.primary_contact_id,t.deputy_contact_id)
    AND s.org_id=t.org_id AND s.site_id=t.site_id AND s.active=true AND s.role IN ('owner','supervisor')
    WHERE t.org_id=$1 AND t.site_id=$2 ORDER BY CASE WHEN s.id=t.primary_contact_id THEN 0 ELSE 1 END LIMIT 1 FOR SHARE OF s`,[orgId,siteId])).rows[0];
  const owner=row.owner_staff_id ?? contact?.id ?? null;
  await client.query(`INSERT INTO case_routing(case_id,org_id,site_id,routed_owner_id,due_at,created_at,manual)
    VALUES($1,$2,$3,$4,$5::timestamptz+interval '24 hours',$5,$6)`,[id,orgId,siteId,owner,row.created_at,!!row.owner_staff_id]);
  if(owner && !row.owner_staff_id){await client.query('UPDATE clarifications SET owner_staff_id=$1 WHERE id=$2',[owner,id]);await domainAudit(client,actor(orgId,siteId),'clarification.routed',id);}
}

export function processOneCaseEscalation(pool,{schema='public'}={}) {
  return domainTransaction(pool,schema,async client=>{
    const candidate=(await client.query(`SELECT r.case_id,r.org_id,r.site_id,t.deputy_contact_id FROM case_routing r
      JOIN clarifications c ON c.id=r.case_id AND c.org_id=r.org_id AND c.site_id=r.site_id
      JOIN assignments a ON a.id=c.assignment_id AND a.org_id=r.org_id AND a.site_id=r.site_id
      JOIN workers w ON w.id=a.worker_id AND w.org_id=r.org_id AND w.site_id=r.site_id AND w.active=true
      JOIN site_settings t ON t.org_id=r.org_id AND t.site_id=r.site_id
      JOIN staff s ON s.id=t.deputy_contact_id AND s.org_id=r.org_id AND s.site_id=r.site_id AND s.active=true AND s.role IN ('owner','supervisor')
      WHERE c.status='open' AND c.owner_staff_id IS NOT DISTINCT FROM r.routed_owner_id AND s.id IS DISTINCT FROM c.owner_staff_id
      AND r.manual=false AND r.escalated_at IS NULL AND COALESCE(${caseDeadlineOverride},r.due_at)<=clock_timestamp() AND ${dispatchPredicate('r')}
      AND NOT EXISTS(SELECT 1 FROM site_lifecycle l WHERE l.site_id=r.site_id AND l.org_id=r.org_id AND l.state='archived')
      ORDER BY COALESCE(${caseDeadlineOverride},r.due_at),r.case_id LIMIT 1`)).rows[0];
    if(!candidate || !await dispatchAllowed(client,candidate.org_id))return false;
    const {org_id:orgId,site_id:siteId,case_id:id}=candidate;
    await requireSiteOperational(client,orgId,siteId);
    // Contacts/principal precede the case lock, matching manual ownership changes.
    const deputy=(await client.query(`SELECT s.id FROM site_settings t JOIN staff s ON s.id=t.deputy_contact_id AND s.org_id=t.org_id AND s.site_id=t.site_id
      WHERE t.org_id=$1 AND t.site_id=$2 AND s.active=true AND s.role IN ('owner','supervisor') FOR SHARE OF t,s`,[orgId,siteId])).rows[0];
    const worker=(await client.query(`SELECT w.id FROM workers w JOIN assignments a ON a.worker_id=w.id AND a.org_id=w.org_id AND a.site_id=w.site_id
      JOIN clarifications c ON c.assignment_id=a.id AND c.org_id=a.org_id AND c.site_id=a.site_id
      WHERE c.id=$1 AND c.org_id=$2 AND c.site_id=$3 AND w.active=true FOR SHARE OF w`,[id,orgId,siteId])).rows[0];
    await client.query('SELECT id FROM clarifications WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR UPDATE',[id,orgId,siteId]);
    const current=(await client.query(`SELECT c.owner_staff_id,c.status,r.routed_owner_id,r.manual,r.escalated_at,COALESCE(${caseDeadlineOverride},r.due_at)<=clock_timestamp() AS due
      FROM clarifications c JOIN case_routing r ON r.case_id=c.id AND r.org_id=c.org_id AND r.site_id=c.site_id
      WHERE c.id=$1 AND c.org_id=$2 AND c.site_id=$3 FOR UPDATE OF c,r`,[id,orgId,siteId])).rows[0];
    if(!deputy || !worker || !current || current.status!=='open' || current.manual || current.escalated_at || !current.due
      || current.owner_staff_id!==current.routed_owner_id || deputy.id===current.owner_staff_id)return false;
    await client.query('UPDATE clarifications SET owner_staff_id=$1 WHERE id=$2',[deputy.id,id]);
    await client.query('UPDATE case_routing SET escalated_at=clock_timestamp() WHERE case_id=$1',[id]);
    await domainAudit(client,actor(orgId,siteId),'clarification.escalated',id);return true;
  });
}
