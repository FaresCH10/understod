import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {domainTransaction} from './domain.mjs';
import {consumeAuthBudget} from './auth-budget.mjs';
import {credentialInput,normalizeEmail,passwordRecord,passwordMatches,tokenHash} from '../auth-crypto.mjs';
import {cookieToken} from '../auth.mjs';
import {operatorContext} from '../operator-input.mjs';

export const OPERATOR_COOKIE='understood_operator';
export async function operatorAudit(client,id,action,objectType,objectId) {
  await client.query('INSERT INTO operator_audit(id,operator_id,action,object_type,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,action,objectType,objectId]);
}
// Maintenance-only provisioning. Never exposed through a customer or public endpoint.
export async function provisionOperator(pool,{id,email,password,name},{schema='public'}={}) {
  const normalized=credentialInput(email,password);
  if(typeof id!=='string' || !/^[a-f0-9-]{36}$/i.test(id) || typeof name!=='string' || !name.trim() || name.length>100 || /[\x00-\x1f\x7f]/.test(name))throw Error('Invalid operator provisioning');
  const record=await passwordRecord(password);
  return domainTransaction(pool,schema,async client=>{
    await client.query('INSERT INTO platform_operators(id,email,name,password_salt,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,password_salt=excluded.password_salt,password_hash=excluded.password_hash,revision=platform_operators.revision+1,changed_at=clock_timestamp()',
      [id,normalized,name.trim(),record.salt,record.derived]);
    await client.query('UPDATE operator_sessions SET revoked_at=clock_timestamp() WHERE operator_id=$1 AND revoked_at IS NULL',[id]);
    await operatorAudit(client,id,'operator.credential_rotated','operator',id);
    return {id};
  });
}
export async function authenticateOperator(pool,input,address,{schema='public'}={}) {
  if(!input || Object.keys(input).some(key=>!['email','password'].includes(key)) || typeof input.email!=='string' || input.email.length>254 || typeof input.password!=='string' || input.password.length>256 || typeof address!=='string' || address.length>128)throw Error('Invalid operator login');
  const email=normalizeEmail(input.email);
  if(!await domainTransaction(pool,schema,client=>consumeAuthBudget(client,[tokenHash(`operator:ip:${address}`),tokenHash(`operator:email:${email}`)],5)))throw Error('Invalid credentials');
  const row=await domainTransaction(pool,schema,async client=>(await client.query('SELECT * FROM platform_operators WHERE email=$1',[email])).rows[0]);
  const matches=await passwordMatches(input.password,row);
  if(!row?.active || !matches)throw Error('Invalid credentials');
  return domainTransaction(pool,schema,async client=>{
    if(!(await client.query('SELECT id FROM platform_operators WHERE id=$1 AND active=true AND revision=$2 FOR UPDATE',[row.id,row.revision])).rows.length)throw Error('Invalid credentials');
    await client.query('DELETE FROM operator_sessions WHERE expires_at<=clock_timestamp() OR revoked_at IS NOT NULL');
    await client.query('UPDATE operator_sessions SET revoked_at=clock_timestamp() WHERE operator_id=$1',[row.id]);
    const token=randomBytes(32).toString('base64url'),hash=tokenHash(token),maxSeconds=3600;
    const session=(await client.query("INSERT INTO operator_sessions VALUES($1,$2,$3,clock_timestamp()+interval '1 hour',NULL) RETURNING *",[hash,row.id,row.revision])).rows[0];
    await operatorAudit(client,row.id,'operator.signed_in','operator',row.id);
    return {token,maxSeconds,session:{...session,name:row.name}};
  });
}
export async function requireOperatorInTransaction(client,identity) {
  const row=(await client.query(`SELECT s.*,o.name FROM operator_sessions s JOIN platform_operators o ON o.id=s.operator_id
    WHERE s.token_hash=$1 AND o.active=true AND o.revision=s.operator_revision AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE OF s,o`,[identity?.token_hash ?? ''])).rows[0];
  if(!row)throw Error('Operator sign in required');
  return row;
}
export async function requireOperator(pool,req,{schema='public',context=true}={}) {
  const token=cookieToken(req,OPERATOR_COOKIE);
  if(typeof token!=='string' || !/^[a-zA-Z0-9_-]{43}$/.test(token))throw Error('Operator sign in required');
  const row=await domainTransaction(pool,schema,client=>requireOperatorInTransaction(client,{token_hash:tokenHash(token)}));
  const provided=req.headers['x-operator-context'],expected=operatorContext(row);
  if(context && (typeof provided!=='string' || !/^[a-f0-9]{64}$/.test(provided) || !timingSafeEqual(Buffer.from(provided,'hex'),Buffer.from(expected,'hex'))))throw Error('Operator context changed');
  return row;
}
export function operatorSession(row) {return {available:true,authenticated:true,name:row.name,clientContext:operatorContext(row),expiresAt:new Date(row.expires_at).toISOString()};}
export function revokeOperator(pool,identity,{schema='public'}={}) {
  return domainTransaction(pool,schema,async client=>{const actor=await requireOperatorInTransaction(client,identity);
    await client.query('UPDATE operator_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[actor.token_hash]);
    await operatorAudit(client,actor.operator_id,'operator.signed_out','operator',actor.operator_id);});
}
