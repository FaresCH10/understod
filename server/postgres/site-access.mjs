import {requireSiteOperational} from './site-lifecycle.mjs';
export async function requireWorkerSiteAccess(client,orgId,siteId) {
  const row=(await client.query('SELECT id FROM sites WHERE id=$1 AND org_id=$2 FOR SHARE',[siteId,orgId])).rows[0];
  if(!row)throw Error('Forbidden');
  await requireSiteOperational(client,orgId,siteId);
  // Read after the lock wait so READ COMMITTED cannot retain a pre-pause join snapshot.
  const control=(await client.query('SELECT state FROM site_access_controls WHERE site_id=$1 AND org_id=$2',[siteId,orgId])).rows[0];
  if(control && control.state!=='active')throw Error('Worker access paused');
}
