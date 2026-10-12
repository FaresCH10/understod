import {randomBytes,randomUUID} from 'node:crypto';
import {NOW,transaction} from './db.mjs';
import {tokenHash,passwordRecord} from './auth-crypto.mjs';
import {recoveryRequestInput,recoveryResetInput,recoveryFingerprint as fingerprint} from './recovery-input.mjs';
import {sealMail,openMail,sendAuthMail} from './auth-mail.mjs';
import {consumeAuthBudget} from './auth-budget.mjs';
import {authMailCapacity} from './auth-mail-budget.mjs';

export function ensureRecoverySchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS staff_recovery_mail (
    id TEXT PRIMARY KEY,purpose TEXT NOT NULL CHECK(purpose IN ('reset','notice')),email_hash TEXT NOT NULL,payload TEXT,
    created_at TEXT NOT NULL,expires_at TEXT NOT NULL,next_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('queued','processing','sent','ignored','failed','expired')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),lease_token TEXT,lease_until TEXT,provider_id TEXT
  ) STRICT;
  CREATE INDEX IF NOT EXISTS staff_recovery_mail_due ON staff_recovery_mail(state,next_at,lease_until);
  CREATE TABLE IF NOT EXISTS staff_recovery_tokens (
    token_hash TEXT PRIMARY KEY,mail_id TEXT NOT NULL UNIQUE REFERENCES staff_recovery_mail(id),staff_id TEXT NOT NULL REFERENCES staff(id),
    org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),credential_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,used_at TEXT,revoked_at TEXT
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS staff_recovery_token_scope BEFORE INSERT ON staff_recovery_tokens WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.staff_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;`);
}
const generic={accepted:true,delivery:'queued'};
const date=(milliseconds)=>new Date(Date.now()+milliseconds).toISOString();
function throttle(db,keys,now) {
  return !consumeAuthBudget(db,keys,5,{now});
}
export function requestRecovery(db,input,remoteAddress,config) {
  const email=recoveryRequestInput(input,remoteAddress);
  if(!config.available) throw new Error('Email delivery unavailable');
  ensureRecoverySchema(db);
  return transaction(db,()=>{
    const now=NOW(),emailHash=tokenHash(`reset-email:${email}`);
    if(throttle(db,[emailHash,tokenHash(`reset-ip:${remoteAddress}`)],now) || !authMailCapacity(db)) return generic;
    // Do not look up an account on the public request path. The private worker does that later.
    const id=randomUUID(),payload=sealMail(config,id,{email});
    db.prepare('INSERT INTO staff_recovery_mail VALUES(?,?,?,?,?,?,?,?,0,NULL,NULL,NULL)').run(id,'reset',emailHash,payload,now,date(30*60000),now,'queued');
    return generic;
  });
}
function audit(db,staff,action,id) {
  db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),staff.org_id,staff.site_id,'system','account-recovery',action,id,NOW());
}
function currentCredential(db,hash) {
  const row=db.prepare(`SELECT t.*,s.active,s.role,COALESCE(r.revision,1) AS access_revision,a.id AS account_id,a.active AS account_active,
    a.revision AS account_revision,a.credential_staff_id,c.email,c.password_salt,c.password_hash FROM staff_recovery_tokens t
    JOIN staff s ON s.id=t.staff_id AND s.org_id=t.org_id AND s.site_id=t.site_id
    JOIN staff_account_memberships m ON m.staff_id=s.id JOIN staff_accounts a ON a.id=m.account_id
    JOIN staff_credentials c ON c.staff_id=a.credential_staff_id
    LEFT JOIN staff_access_revisions r ON r.staff_id=s.id AND r.org_id=s.org_id AND r.site_id=s.site_id
    WHERE t.token_hash=?`).get(hash);
  return row && row.active===1 && row.account_active===1 && !row.used_at && !row.revoked_at && row.expires_at>NOW() && row.credential_hash===fingerprint(row) ? row : null;
}
export async function resetPassword(db,input,remoteAddress,config) {
  recoveryResetInput(input,remoteAddress);
  if(!config.available) throw new Error('Email delivery unavailable');
  ensureRecoverySchema(db);
  const allowed=transaction(db,()=>!throttle(db,[tokenHash(`reset-token:${input.token}`),tokenHash(`reset-redeem-ip:${remoteAddress}`)],NOW()));
  if(!allowed) throw new Error('Invalid recovery link or input');
  // Derive outside the write transaction; recheck the token and current credential before committing.
  const record=await passwordRecord(input.password);
  return transaction(db,()=>{
    const row=currentCredential(db,tokenHash(input.token));if(!row) throw new Error('Invalid recovery link or input');
    if(!authMailCapacity(db)) throw new Error('Email delivery unavailable');
    const now=NOW();
    db.prepare('UPDATE staff_credentials SET password_salt=?,password_hash=?,changed_at=? WHERE staff_id=?').run(record.salt,record.derived,now,row.credential_staff_id);
    db.prepare(`UPDATE staff_recovery_tokens SET revoked_at=? WHERE used_at IS NULL AND revoked_at IS NULL AND staff_id IN
      (SELECT staff_id FROM staff_account_memberships WHERE account_id=?)`).run(now,row.account_id);
    db.prepare('UPDATE staff_recovery_tokens SET used_at=? WHERE token_hash=?').run(now,tokenHash(input.token));
    db.prepare(`UPDATE sessions SET revoked_at=? WHERE principal_type='staff' AND revoked_at IS NULL AND principal_id IN
      (SELECT staff_id FROM staff_account_memberships WHERE account_id=?)`).run(now,row.account_id);
    const id=randomUUID(),payload=sealMail(config,id,{email:row.email,subject:'Your Understood password was changed',text:'Your Understood password was changed and existing sessions were ended. If you did not request this change, contact your workspace owner immediately.'});
    db.prepare('INSERT INTO staff_recovery_mail VALUES(?,?,?,?,?,?,?,?,0,NULL,NULL,NULL)').run(id,'notice',tokenHash(`reset-email:${row.email}`),payload,now,date(24*3600000),now,'queued');
    audit(db,row,'credential.recovered',row.staff_id);
    return {completed:true,signInRequired:true};
  });
}
export function expireRecovery(db) {
  ensureRecoverySchema(db);
  return transaction(db,()=>{
    const now=NOW();db.prepare("UPDATE staff_recovery_mail SET state='expired',payload=NULL,lease_token=NULL,lease_until=NULL WHERE expires_at<=? AND state IN ('queued','processing')").run(now);
    db.prepare('UPDATE staff_recovery_tokens SET revoked_at=? WHERE expires_at<=? AND revoked_at IS NULL AND used_at IS NULL').run(now,now);
    // Terminal jobs no longer need private delivery payloads; metadata retention is a separate policy.
    db.prepare("UPDATE staff_recovery_mail SET payload=NULL WHERE state IN ('sent','ignored','failed','expired')").run();
  });
}
export async function processOneRecovery(db,config,{send=sendAuthMail}={}) {
  if(!config.available) return false;
  ensureRecoverySchema(db);expireRecovery(db);
  const job=transaction(db,()=>{
    const now=NOW(),row=db.prepare(`SELECT * FROM staff_recovery_mail WHERE expires_at>? AND attempts<3
      AND ((state='queued' AND next_at<=?) OR (state='processing' AND lease_until<=?)) ORDER BY created_at,id LIMIT 1`).get(now,now,now);
    if(!row) return null;
    const lease=randomUUID();db.prepare("UPDATE staff_recovery_mail SET state='processing',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?").run(lease,date(30000),row.id);
    const failed=()=>{db.prepare("UPDATE staff_recovery_mail SET state='failed',payload=NULL,lease_token=NULL,lease_until=NULL WHERE id=?").run(row.id);return {ignored:true};};
    let message;try {message=openMail(config,row.id,row.payload);}catch {return failed();}
      if(row.purpose==='reset') {
        let token=db.prepare('SELECT * FROM staff_recovery_tokens WHERE mail_id=?').get(row.id);
        if(!token) {
          const staff=db.prepare(`SELECT s.id,s.org_id,s.site_id,s.role,COALESCE(r.revision,1) AS access_revision,a.revision AS account_revision,c.email,c.password_hash
            FROM staff_credentials c JOIN staff_accounts a ON a.credential_staff_id=c.staff_id JOIN staff_account_memberships m ON m.account_id=a.id
            JOIN staff s ON s.id=m.staff_id LEFT JOIN staff_access_revisions r ON r.staff_id=s.id AND r.org_id=s.org_id AND r.site_id=s.site_id
            WHERE c.email=? AND s.active=1 AND a.active=1 ORDER BY (s.id=c.staff_id) DESC,s.org_id,s.site_id,s.id LIMIT 1`).get(message.email);
          if(!staff) {db.prepare("UPDATE staff_recovery_mail SET state='ignored',payload=NULL,lease_token=NULL,lease_until=NULL WHERE id=?").run(row.id);return {ignored:true};}
          const secret=randomBytes(32).toString('base64url');
          token={token_hash:tokenHash(secret),expires_at:row.expires_at};
          db.prepare('INSERT INTO staff_recovery_tokens VALUES(?,?,?,?,?,?,?,NULL,NULL)').run(token.token_hash,row.id,staff.id,staff.org_id,staff.site_id,fingerprint(staff),token.expires_at);
          message={email:staff.email,subject:'Reset your Understood password',text:`Reset your Understood password using this one-use link within 30 minutes:\n${config.publicOrigin}/#reset-password/${secret}\n\nIf you did not request this, ignore this email. Your existing password and sessions have not changed.`};
          db.prepare('UPDATE staff_recovery_mail SET payload=? WHERE id=?').run(sealMail(config,row.id,message),row.id);
          audit(db,staff,'credential.recovery_queued',row.id);
        }
        if(!currentCredential(db,token.token_hash)) return failed();
      }
      return {...row,lease,message};
  });
  if(!job) return false;if(job.ignored) return true;
  try {
    const result=await send(config,job.id,job.message);
    if(typeof result?.providerId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(result.providerId)) throw new Error('Unverified delivery');
    db.prepare("UPDATE staff_recovery_mail SET state='sent',payload=NULL,provider_id=?,lease_token=NULL,lease_until=NULL WHERE id=? AND state='processing' AND lease_token=? AND lease_until>?").run(result.providerId,job.id,job.lease,NOW());
  }catch {
    db.prepare("UPDATE staff_recovery_mail SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,next_at=?,payload=CASE WHEN attempts>=3 THEN NULL ELSE payload END,lease_token=NULL,lease_until=NULL WHERE id=? AND state='processing' AND lease_token=? AND lease_until>?").run(date(30000*(job.attempts+1)),job.id,job.lease,NOW());
  }
  return true;
}
