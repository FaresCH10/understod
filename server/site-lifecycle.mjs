import {siteDependencies} from './site-lifecycle-input.mjs';

export function requireSiteOperational(db,orgId,siteId) {
  if(db.prepare("SELECT 1 FROM site_lifecycle WHERE site_id=? AND org_id=? AND state='archived'").get(siteId,orgId))throw Error('Site archived');
}
export function siteLifecycleState(db,orgId,siteId) {
  return db.prepare('SELECT revision,state FROM site_lifecycle WHERE site_id=? AND org_id=?').get(siteId,orgId) ?? {revision:0,state:'active'};
}
export function siteArchiveDependencies(db,orgId,siteId) {
  const items=[];
  for(const [table,label,where] of siteDependencies){
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
    const count=db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE org_id=? AND site_id=? AND (${where})`).get(orgId,siteId).n;
    if(count)items.push({key:table,label,count});
  }
  const count=db.prepare("SELECT COUNT(*) n FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id WHERE a.org_id=? AND a.site_id=? AND c.status='open'").get(orgId,siteId).n;
  if(count)items.push({key:'clarifications',label:'unresolved cases',count});
  return items;
}
