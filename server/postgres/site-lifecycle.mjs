import {siteDependencies} from '../site-lifecycle-input.mjs';

export async function requireSiteOperational(client,orgId,siteId) {
  await client.query('SELECT id FROM sites WHERE id=$1 AND org_id=$2 FOR SHARE',[siteId,orgId]);
  const row=(await client.query('SELECT state FROM site_lifecycle WHERE site_id=$1 AND org_id=$2',[siteId,orgId])).rows[0];
  if(row?.state==='archived')throw Error('Site archived');
}
export async function siteLifecycleState(client,orgId,siteId) {
  return (await client.query('SELECT revision,state FROM site_lifecycle WHERE site_id=$1 AND org_id=$2',[siteId,orgId])).rows[0] ?? {revision:0,state:'active'};
}
export async function siteArchiveDependencies(client,orgId,siteId) {
  const items=[];
  for(const [table,label,where] of siteDependencies){
    const count=(await client.query(`SELECT COUNT(*)::int n FROM ${table} WHERE org_id=$1 AND site_id=$2 AND (${where})`,[orgId,siteId])).rows[0].n;
    if(count)items.push({key:table,label,count});
  }
  const count=(await client.query("SELECT COUNT(*)::int n FROM clarifications WHERE org_id=$1 AND site_id=$2 AND status='open'",[orgId,siteId])).rows[0].n;
  if(count)items.push({key:'clarifications',label:'unresolved cases',count});
  return items;
}
