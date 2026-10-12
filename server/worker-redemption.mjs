import {transaction,NOW} from './db.mjs';
import {requireWorkerSiteAccess} from './site-access.mjs';
import {clientSessionContext} from './session-context.mjs';

export function redemptionDigest(value){
  if(typeof value!=='string' || !/^[a-f0-9]{64}$/.test(value))throw Error('Invalid worker redemption check');
  return value;
}
export function redemptionHttpInput(req,url){
  if(url.search || typeof req.headers['x-client-session-context']!=='string')throw Error('Invalid worker redemption check');
  return redemptionDigest(req.headers['x-worker-grant-digest']);
}
export function readWorkerRedemption(db,session,digest){
  redemptionDigest(digest);
  if(session.principal_type!=='worker' || session.access_mode!=='credential')throw Error('Forbidden');
  return transaction(db,()=>{
    requireWorkerSiteAccess(db,session.org_id,session.site_id);
    const row=db.prepare(`SELECT se.*,w.language FROM sessions se
      JOIN workers w ON w.id=se.principal_id AND w.org_id=se.org_id AND w.site_id=se.site_id AND w.active=1
      JOIN worker_grants g ON g.id=se.grant_id AND g.worker_id=w.id AND g.org_id=se.org_id AND g.site_id=se.site_id
      WHERE se.token_hash=? AND se.principal_id=? AND se.org_id=? AND se.site_id=?
      AND se.principal_type='worker' AND se.access_mode='credential' AND se.revoked_at IS NULL AND se.expires_at>?
      AND g.token_hash=? AND g.redeemed_at IS NOT NULL AND g.revoked_at IS NULL AND g.expires_at>?`)
      .get(session.token_hash,session.principal_id,session.org_id,session.site_id,NOW(),digest,NOW());
    return row?{matches:true,clientContext:clientSessionContext(row).clientContext}:{matches:false};
  });
}
