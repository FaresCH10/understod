import {randomBytes,randomUUID} from 'node:crypto';
import {inSchema,lockStaffAccount} from './auth.mjs';
import {tokenHash,passwordRecord} from '../auth-crypto.mjs';
import {recoveryRequestInput,recoveryResetInput,recoveryFingerprint} from '../recovery-input.mjs';
import {sealMail,openMail,sendAuthMail} from '../auth-mail.mjs';
import {consumeAuthBudget} from './auth-budget.mjs';
import {authMailCapacity} from './auth-mail-budget.mjs';

const generic={accepted:true,delivery:'queued'};
const invalid=()=>new Error('Invalid recovery link or input');

async function throttle(client,keys) {
  return !await consumeAuthBudget(client,keys,5);
}

async function audit(client,row,action,id) {
  await client.query(`INSERT INTO audit(id,org_id,site_id,actor_type,actor_id,action,object_id)
    VALUES($1,$2,$3,'system','account-recovery',$4,$5)`,[randomUUID(),row.org_id,row.site_id,action,id]);
}

// Account first, then staff/credential/token: password rotation and login share this lock order.
async function lockCredential(client,reference) {
  const account=await lockStaffAccount(client,reference.staff_id);if(!account) return null;
  const staff=(await client.query(`SELECT id,org_id,site_id,role FROM staff
    WHERE id=$1 AND org_id=$2 AND site_id=$3 AND active=true FOR UPDATE`,
  [reference.staff_id,reference.org_id,reference.site_id])).rows[0];
  if(!staff) return null;
  const credential=(await client.query('SELECT email,password_hash FROM staff_credentials WHERE staff_id=$1 FOR UPDATE',[account.credential_staff_id])).rows[0];
  if(!credential) return null;
  const revision=(await client.query('SELECT revision FROM staff_access_revisions WHERE staff_id=$1',[staff.id])).rows[0];
  return {...staff,...credential,...account,access_revision:revision?.revision ?? 1};
}

async function currentCredential(client,hash) {
  const reference=(await client.query('SELECT staff_id,org_id,site_id FROM staff_recovery_tokens WHERE token_hash=$1',[hash])).rows[0];
  if(!reference) return null;
  const credential=await lockCredential(client,reference);
  if(!credential) return null;
  const token=(await client.query(`SELECT * FROM staff_recovery_tokens WHERE token_hash=$1 AND used_at IS NULL
    AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`,[hash])).rows[0];
  return token && token.credential_hash===recoveryFingerprint(credential) ? {...token,...credential} : null;
}

export async function requestRecovery(pool,input,remoteAddress,config,{schema='public'}={}) {
  const email=recoveryRequestInput(input,remoteAddress);
  if(!config.available) throw new Error('Email delivery unavailable');
  return inSchema(pool,schema,async client=>{
    const emailHash=tokenHash(`reset-email:${email}`);
    if(await throttle(client,[emailHash,tokenHash(`reset-ip:${remoteAddress}`)]) || !await authMailCapacity(client)) return generic;
    // No account lookup or link generation on the public request path.
    const id=randomUUID();
    await client.query(`INSERT INTO staff_recovery_mail(id,purpose,email_hash,payload,expires_at,state)
      VALUES($1,'reset',$2,$3,clock_timestamp()+interval '30 minutes','queued')`,[id,emailHash,sealMail(config,id,{email})]);
    return generic;
  });
}

export async function resetPassword(pool,input,remoteAddress,config,{schema='public'}={}) {
  recoveryResetInput(input,remoteAddress);
  if(!config.available) throw new Error('Email delivery unavailable');
  const allowed=await inSchema(pool,schema,async client=>!await throttle(client,
    [tokenHash(`reset-token:${input.token}`),tokenHash(`reset-redeem-ip:${remoteAddress}`)]));
  if(!allowed) throw invalid();
  const record=await passwordRecord(input.password),hash=tokenHash(input.token);
  return inSchema(pool,schema,async client=>{
    const row=await currentCredential(client,hash);if(!row) throw invalid();
    if(!await authMailCapacity(client)) throw new Error('Email delivery unavailable');
    await client.query(`UPDATE staff_credentials SET password_salt=$1,password_hash=$2,changed_at=clock_timestamp()
      WHERE staff_id=$3`,[record.salt,record.derived,row.credential_staff_id]);
    await client.query(`UPDATE staff_recovery_tokens SET revoked_at=clock_timestamp()
      WHERE used_at IS NULL AND revoked_at IS NULL AND staff_id IN
      (SELECT staff_id FROM staff_account_memberships WHERE account_id=$1)`,[row.account_id]);
    await client.query('UPDATE staff_recovery_tokens SET used_at=clock_timestamp() WHERE token_hash=$1',[hash]);
    await client.query(`UPDATE sessions SET revoked_at=clock_timestamp() WHERE principal_type='staff' AND revoked_at IS NULL
      AND principal_id IN (SELECT staff_id FROM staff_account_memberships WHERE account_id=$1)`,[row.account_id]);
    const id=randomUUID(),message={email:row.email,subject:'Your Understood password was changed',
      text:'Your Understood password was changed and existing sessions were ended. If you did not request this change, contact your workspace owner immediately.'};
    await client.query(`INSERT INTO staff_recovery_mail(id,purpose,email_hash,payload,expires_at,state)
      VALUES($1,'notice',$2,$3,clock_timestamp()+interval '24 hours','queued')`,[id,tokenHash(`reset-email:${row.email}`),sealMail(config,id,message)]);
    await audit(client,row,'credential.recovered',row.staff_id);
    return {completed:true,signInRequired:true};
  });
}

export async function expireRecovery(pool,{schema='public'}={}) {
  return inSchema(pool,schema,async client=>{
    await client.query(`UPDATE staff_recovery_mail SET state='expired',payload=NULL,lease_token=NULL,lease_until=NULL
      WHERE expires_at<=clock_timestamp() AND state IN ('queued','processing')`);
    await client.query(`UPDATE staff_recovery_tokens SET revoked_at=clock_timestamp()
      WHERE expires_at<=clock_timestamp() AND used_at IS NULL AND revoked_at IS NULL`);
  });
}

export async function processOneRecovery(pool,config,{schema='public',send=sendAuthMail}={}) {
  if(!config.available) return false;
  await expireRecovery(pool,{schema});
  const job=await inSchema(pool,schema,async client=>{
    const row=(await client.query(`SELECT * FROM staff_recovery_mail WHERE expires_at>clock_timestamp() AND attempts<3
      AND ((state='queued' AND next_at<=clock_timestamp()) OR (state='processing' AND lease_until<=clock_timestamp()))
      ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
    if(!row) return null;
    const lease=randomUUID();
    await client.query(`UPDATE staff_recovery_mail SET state='processing',attempts=attempts+1,
      lease_token=$1,lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$2`,[lease,row.id]);
    const terminal=async state=>{
      await client.query(`UPDATE staff_recovery_mail SET state=$1,payload=NULL,lease_token=NULL,lease_until=NULL WHERE id=$2`,[state,row.id]);
      return {ignored:true};
    };
    let message;try {message=openMail(config,row.id,row.payload);}catch {return terminal('failed');}
    if(row.purpose==='reset') {
      let token=(await client.query('SELECT token_hash FROM staff_recovery_tokens WHERE mail_id=$1',[row.id])).rows[0];
      if(!token) {
        const reference=(await client.query(`SELECT s.id AS staff_id,s.org_id,s.site_id FROM staff_credentials c
          JOIN staff_accounts a ON a.credential_staff_id=c.staff_id JOIN staff_account_memberships m ON m.account_id=a.id
          JOIN staff s ON s.id=m.staff_id WHERE c.email=$1 AND s.active=true AND a.active=true
          ORDER BY (s.id=c.staff_id) DESC,s.org_id,s.site_id,s.id LIMIT 1`,[message.email])).rows[0];
        const staff=reference && await lockCredential(client,reference);
        if(!staff || staff.email!==message.email) return terminal('ignored');
        const secret=randomBytes(32).toString('base64url');token={token_hash:tokenHash(secret)};
        await client.query(`INSERT INTO staff_recovery_tokens(token_hash,mail_id,staff_id,org_id,site_id,credential_hash,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,[token.token_hash,row.id,staff.id,staff.org_id,staff.site_id,recoveryFingerprint(staff),row.expires_at]);
        message={email:staff.email,subject:'Reset your Understood password',
          text:`Reset your Understood password using this one-use link within 30 minutes:\n${config.publicOrigin}/#reset-password/${secret}\n\nIf you did not request this, ignore this email. Your existing password and sessions have not changed.`};
        await client.query('UPDATE staff_recovery_mail SET payload=$1 WHERE id=$2',[sealMail(config,row.id,message),row.id]);
        await audit(client,staff,'credential.recovery_queued',row.id);
      }
      if(!await currentCredential(client,token.token_hash)) return terminal('failed');
    }
    return {...row,lease,message};
  });
  if(!job) return false;if(job.ignored) return true;
  try {
    const result=await send(config,job.id,job.message);
    if(typeof result?.providerId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(result.providerId)) throw new Error('Unverified delivery');
    await inSchema(pool,schema,client=>client.query(`UPDATE staff_recovery_mail SET state='sent',payload=NULL,provider_id=$1,lease_token=NULL,lease_until=NULL
      WHERE id=$2 AND state='processing' AND lease_token=$3 AND lease_until>clock_timestamp() AND expires_at>clock_timestamp()`,[result.providerId,job.id,job.lease]));
  }catch {
    await inSchema(pool,schema,client=>client.query(`UPDATE staff_recovery_mail SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,
      next_at=clock_timestamp()+$1*interval '1 second',payload=CASE WHEN attempts>=3 THEN NULL ELSE payload END,lease_token=NULL,lease_until=NULL
      WHERE id=$2 AND state='processing' AND lease_token=$3 AND lease_until>clock_timestamp() AND expires_at>clock_timestamp()`,[30*(job.attempts+1),job.id,job.lease]));
  }
  return true;
}
