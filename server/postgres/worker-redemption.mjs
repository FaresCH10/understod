import {inSchema} from './auth.mjs';
import {requireWorkerSiteAccess} from './site-access.mjs';
import {requireTenantActive} from './operations-gates.mjs';
import {clientSessionContext} from '../session-context.mjs';
import {redemptionDigest} from '../worker-redemption.mjs';

export async function readWorkerRedemption(pool,session,digest,{schema='public'}={}){
  redemptionDigest(digest);
  if(session.principal_type!=='worker' || session.access_mode!=='credential')throw Error('Forbidden');
  return inSchema(pool,schema,async client=>{
    await requireTenantActive(client,session.org_id);await requireWorkerSiteAccess(client,session.org_id,session.site_id);
    const row=(await client.query(`SELECT se.*,w.language FROM sessions se
      JOIN workers w ON w.id=se.principal_id AND w.org_id=se.org_id AND w.site_id=se.site_id AND w.active=true
      JOIN worker_grants g ON g.id=se.grant_id AND g.worker_id=w.id AND g.org_id=se.org_id AND g.site_id=se.site_id
      WHERE se.token_hash=$1 AND se.principal_id=$2 AND se.org_id=$3 AND se.site_id=$4
      AND se.principal_type='worker' AND se.access_mode='credential' AND se.revoked_at IS NULL AND se.expires_at>clock_timestamp()
      AND g.token_hash=$5 AND g.redeemed_at IS NOT NULL AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()`,
      [session.token_hash,session.principal_id,session.org_id,session.site_id,digest])).rows[0];
    return row?{matches:true,clientContext:clientSessionContext(row).clientContext}:{matches:false};
  });
}
