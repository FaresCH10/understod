import {randomUUID} from 'node:crypto';
import {inSchema,lockStaffAccount,insertSession} from './auth.mjs';
import {cookieToken} from '../auth.mjs';
import {tokenHash} from '../auth-crypto.mjs';
import {accountSiteFilters,accountSiteInput} from '../account-input.mjs';

// Internal acceptance primitive; the caller authenticates account/invitation and owns the transaction.
export async function linkAccountMembership(client,accountId,staffId) {
  const account=(await client.query('SELECT id FROM staff_accounts WHERE id=$1 AND active=true FOR UPDATE',[accountId])).rows[0];
  const staff=(await client.query('SELECT id,org_id,site_id FROM staff WHERE id=$1 AND active=true FOR UPDATE',[staffId])).rows[0];
  if(!account || !staff) throw new Error('Account membership unavailable');
  const existing=(await client.query('SELECT account_id FROM staff_account_memberships WHERE staff_id=$1',[staffId])).rows[0];
  if(existing) {if(existing.account_id!==accountId) throw new Error('Account membership conflict');return;}
  await client.query('INSERT INTO staff_account_memberships VALUES($1,$2,$3,$4)',[staff.id,accountId,staff.org_id,staff.site_id]);
}

export async function listAccountSites(pool,session,input={}, {schema='public'}={}) {
  const {page,pageSize}=accountSiteFilters(input);
  if(session?.principal_type!=='staff' || session.access_mode!=='credential') throw new Error('Forbidden');
  return inSchema(pool,schema,async client=>{
    const row=(await client.query(`WITH identity AS (SELECT a.id FROM staff s JOIN staff_account_memberships m ON m.staff_id=s.id
      JOIN staff_accounts a ON a.id=m.account_id JOIN staff_credentials c ON c.staff_id=a.credential_staff_id
      WHERE s.id=$1 AND s.org_id=$2 AND s.site_id=$3 AND s.active=true AND a.active=true),
      sites AS (SELECT s.id AS "staffId",o.name AS organization,st.name AS site,s.role,s.site_id AS "siteId",(s.id=$1) AS current
        FROM staff_account_memberships m JOIN staff s ON s.id=m.staff_id JOIN organizations o ON o.id=s.org_id
        JOIN sites st ON st.id=s.site_id AND st.org_id=s.org_id WHERE m.account_id=(SELECT id FROM identity) AND s.active=true)
      SELECT (SELECT COUNT(*)::int FROM sites) AS total,(SELECT COALESCE(jsonb_agg(items ORDER BY lower(items.organization),lower(items.site),items."staffId"),'[]')
        FROM (SELECT * FROM sites ORDER BY lower(organization),lower(site),"staffId" LIMIT $4 OFFSET $5) items) AS items FROM identity`,
    [session.principal_id,session.org_id,session.site_id,pageSize,(page-1)*pageSize])).rows[0];
    if(!row) throw new Error('Sign in required');return {...row,page,pageSize};
  });
}

export async function switchAccountSite(pool,req,input,{schema='public',cookieName='understood_session'}={}) {
  const staffId=accountSiteInput(input),token=cookieToken(req,cookieName);
  if(typeof token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Sign in required');
  return inSchema(pool,schema,async client=>{
    const reference=(await client.query(`SELECT principal_id,org_id,site_id FROM sessions WHERE token_hash=$1
      AND principal_type='staff' AND access_mode='credential' AND revoked_at IS NULL AND expires_at>clock_timestamp()`,[tokenHash(token)])).rows[0];
    if(!reference) throw new Error('Sign in required');
    const account=await lockStaffAccount(client,reference.principal_id);if(!account) throw new Error('Sign in required');
    const staff=(await client.query(`SELECT s.* FROM staff s JOIN staff_account_memberships m ON m.staff_id=s.id
      WHERE m.account_id=$1 AND s.id IN ($2,$3) ORDER BY s.id FOR UPDATE OF s`,[account.account_id,reference.principal_id,staffId])).rows;
    const source=staff.find(row=>row.id===reference.principal_id),target=staff.find(row=>row.id===staffId);
    const credential=(await client.query('SELECT 1 FROM staff_credentials WHERE staff_id=$1',[account.credential_staff_id])).rows[0];
    if(!source?.active || source.org_id!==reference.org_id || source.site_id!==reference.site_id || !credential) throw new Error('Sign in required');
    if(!target?.active) throw new Error('Account membership unavailable');
    const current=(await client.query(`SELECT floor(EXTRACT(EPOCH FROM expires_at-clock_timestamp()))::int AS seconds FROM sessions
      WHERE token_hash=$1 AND principal_type='staff' AND access_mode='credential' AND principal_id=$2 AND org_id=$3 AND site_id=$4
      AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`,[tokenHash(token),source.id,source.org_id,source.site_id])).rows[0];
    if(!current || current.seconds<1) throw new Error('Sign in required');
    const next=await insertSession(client,target,'staff',null,Math.min(8*3600,current.seconds));
    await client.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[tokenHash(token)]);
    await client.query(`INSERT INTO audit(id,org_id,site_id,actor_type,actor_id,action,object_id)
      VALUES($1,$2,$3,'staff',$4,'account.site_selected',$4)`,[randomUUID(),target.org_id,target.site_id,target.id]);
    return next;
  });
}
