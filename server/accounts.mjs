import {randomUUID} from 'node:crypto';
import {NOW,transaction} from './db.mjs';
import {requireSession,createSession} from './auth.mjs';
import {accountSiteFilters,accountSiteInput} from './account-input.mjs';
import {accountIdentity} from './account-schema.mjs';
export {accountIdentity} from './account-schema.mjs';

// Internal acceptance primitive. Its caller must authenticate the account and authorize the invitation in the same transaction.
export function linkAccountMembership(db,accountId,staffId) {
  const account=db.prepare('SELECT id FROM staff_accounts WHERE id=? AND active=1').get(accountId);
  const staff=db.prepare('SELECT id,org_id,site_id FROM staff WHERE id=? AND active=1').get(staffId);
  if(!account || !staff) throw new Error('Account membership unavailable');
  const existing=accountIdentity(db,staffId);
  if(existing) {if(existing.account_id!==accountId) throw new Error('Account membership conflict');return;}
  db.prepare('INSERT INTO staff_account_memberships VALUES(?,?,?,?)').run(staff.id,accountId,staff.org_id,staff.site_id);
}

function authority(db,session) {
  if(session?.principal_type!=='staff' || session.access_mode!=='credential') throw new Error('Forbidden');
  const row=db.prepare(`SELECT a.id FROM staff s JOIN staff_account_memberships m ON m.staff_id=s.id
    JOIN staff_accounts a ON a.id=m.account_id JOIN staff_credentials c ON c.staff_id=a.credential_staff_id
    WHERE s.id=? AND s.org_id=? AND s.site_id=? AND s.active=1 AND a.active=1`).get(session.principal_id,session.org_id,session.site_id);
  if(!row) throw new Error('Sign in required');return row.id;
}

export function listAccountSites(db,session,input={}) {
  const {page,pageSize}=accountSiteFilters(input);
  return transaction(db,()=>{
    const accountId=authority(db,session);
    const total=db.prepare(`SELECT COUNT(*) n FROM staff_account_memberships m JOIN staff s ON s.id=m.staff_id
      WHERE m.account_id=? AND s.active=1`).get(accountId).n;
    const items=db.prepare(`SELECT s.id AS staffId,o.name AS organization,st.name AS site,s.role,s.site_id AS siteId
      FROM staff_account_memberships m JOIN staff s ON s.id=m.staff_id JOIN organizations o ON o.id=s.org_id
      JOIN sites st ON st.id=s.site_id AND st.org_id=s.org_id WHERE m.account_id=? AND s.active=1
      ORDER BY lower(o.name),lower(st.name),s.id LIMIT ? OFFSET ?`).all(accountId,pageSize,(page-1)*pageSize)
      .map(row=>({...row,current:row.staffId===session.principal_id}));
    return {items,total,page,pageSize};
  });
}

export function switchAccountSite(db,req,config,input) {
  const staffId=accountSiteInput(input);
  return transaction(db,()=>{
    const session=requireSession(db,req,config),accountId=authority(db,session);
    const target=db.prepare(`SELECT s.* FROM staff_account_memberships m JOIN staff s ON s.id=m.staff_id
      WHERE m.account_id=? AND s.id=? AND s.active=1`).get(accountId,staffId);
    if(!target) throw new Error('Account membership unavailable');
    const remaining=Math.floor((Date.parse(session.expires_at)-Date.now())/1000);
    if(remaining<1) throw new Error('Sign in required');
    const next=createSession(db,target,'staff','credential',null,Math.min(8*3600,remaining));
    db.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(NOW(),session.token_hash);
    db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),target.org_id,target.site_id,'staff',target.id,'account.site_selected',target.id,NOW());
    return next;
  });
}
