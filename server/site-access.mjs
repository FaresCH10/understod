import {requireSiteOperational} from './site-lifecycle.mjs';
export function requireWorkerSiteAccess(db,orgId,siteId) {
  const row=db.prepare(`SELECT s.id,COALESCE(c.state,'active') AS state FROM sites s
    LEFT JOIN site_access_controls c ON c.site_id=s.id AND c.org_id=s.org_id WHERE s.id=? AND s.org_id=?`).get(siteId,orgId);
  if(!row)throw Error('Forbidden');
  requireSiteOperational(db,orgId,siteId);
  if(row.state!=='active')throw Error('Worker access paused');
}
