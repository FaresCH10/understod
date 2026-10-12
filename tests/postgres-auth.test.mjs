import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { runMigrations } from '../server/postgres/migrate.mjs';
import { provisionStaffCredential, authenticateStaff, requireSession, revokeSession,
  issueWorkerGrant, redeemWorkerGrant, revokeWorkerGrant,listWorkerGrants } from '../server/postgres/auth.mjs';
import { tokenHash, passwordMatches, passwordMatchesSync, passwordRecord, passwordRecordSync } from '../server/auth-crypto.mjs';
import { sessionCookie } from '../server/auth.mjs';
import {AUTH_GLOBAL_KEY,AUTH_GLOBAL_LIMIT} from '../server/auth-budget.mjs';

const options = { schema:'understood_test_auth' };
const password = 'Synthetic-auth-test-password-123';
const owner = { principal_type:'staff',principal_id:'owner-a',org_id:'org-a',site_id:'site-a',role:'owner' };
const other = { ...owner,principal_id:'owner-b',org_id:'org-b',site_id:'site-b' };
const request = (token) => ({ headers:{cookie:`understood_session=${token}`} });

async function fixture() {
  const db = new PGlite(); let fail = false;
  const client = { async query(sql,values) {
    if (fail && sql.startsWith('INSERT INTO audit')) throw new Error('Injected audit failure');
    return values?.length ? db.query(sql,values) : (await db.exec(sql)).at(-1) || {rows:[]};
  }, release() {} };
  const pool = { async connect() { return client; } };
  await db.exec(`CREATE SCHEMA ${options.schema}; SET search_path TO ${options.schema},pg_catalog`);
  await runMigrations(pool,options);
  await db.query("INSERT INTO organizations(id,name) VALUES ('org-a','A'),('org-b','B')");
  await db.query("INSERT INTO sites(id,org_id,name,timezone) VALUES ('site-a','org-a','A','UTC'),('site-c','org-a','C','UTC'),('site-b','org-b','B','UTC')");
  await db.query(`INSERT INTO staff(id,org_id,site_id,name,role) VALUES ('owner-a','org-a','site-a','Owner A','owner'),
    ('owner-b','org-b','site-b','Owner B','owner'),('auditor-a','org-a','site-a','Auditor','auditor')`);
  await db.query(`INSERT INTO workers(id,org_id,site_id,code,language) VALUES ('worker-a','org-a','site-a','001','en'),
    ('worker-c','org-a','site-c','002','ar'),('worker-b','org-b','site-b','001','ur')`);
  await provisionStaffCredential(pool,{staffId:'owner-a',orgId:'org-a',siteId:'site-a',email:'owner@example.test',password},options);
  return { db,pool,setFail(value) { fail=value; } };
}

test('shared password derivation remains compatible, bounds input and supports Secure cookies', async () => {
  for (const record of [passwordRecordSync(password),await passwordRecord(password)]) {
    const row = { password_salt:record.salt,password_hash:record.derived };
    assert.equal(passwordMatchesSync(password,row),true);
    assert.equal(await passwordMatches(password,row),true);
    assert.equal(await passwordMatches('Wrong password',row),false);
    assert.equal(await passwordMatches('x'.repeat(257),row),false);
    assert.equal(passwordMatchesSync(password,{password_salt:'invalid',password_hash:'invalid'}),false);
  }
  assert.match(sessionCookie('token',60,{secure:true}),/HttpOnly; SameSite=Strict;.*; Secure$/);
  assert.ok(!sessionCookie('token',60).includes('Secure'));
});

test('PostgreSQL credential login/session/rotation are atomic, scoped, hashed and revocable', async () => {
  const { db,pool,setFail } = await fixture();
  try {
    const login = await authenticateStaff(pool,' OWNER@EXAMPLE.TEST ',password,'127.0.0.1',options);
    assert.equal(login.principal.role,'owner'); assert.ok(!JSON.stringify(login).includes('password_hash'));
    assert.equal((await db.query('SELECT token_hash FROM sessions')).rows[0].token_hash,tokenHash(login.session.token));
    assert.equal((await requireSession(pool,request(login.session.token),options)).site_id,'site-a');
    await revokeSession(pool,request(login.session.token),options);
    await assert.rejects(requireSession(pool,request(login.session.token),options),/Sign in required/);
    await revokeSession(pool,request(login.session.token),options);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM audit WHERE action='session.revoked'")).rows[0].n,1);
    const second = await authenticateStaff(pool,'owner@example.test',password,'127.0.0.1',options);
    const replacement = `${password}-new`;
    await provisionStaffCredential(pool,{staffId:'owner-a',orgId:'org-a',siteId:'site-a',email:'owner@example.test',password:replacement},options);
    await assert.rejects(requireSession(pool,request(second.session.token),options),/Sign in required/);
    await assert.rejects(authenticateStaff(pool,'owner@example.test',password,'127.0.0.2',options),/Invalid credentials/);
    assert.equal((await authenticateStaff(pool,'owner@example.test',replacement,'127.0.0.2',options)).principal.id,'owner-a');
    await assert.rejects(provisionStaffCredential(pool,{staffId:'owner-a',orgId:'org-b',siteId:'site-b',email:'forged@example.test',password},options),/unavailable/);
    const before = (await db.query('SELECT COUNT(*)::int n FROM sessions')).rows[0].n;
    setFail(true);
    await assert.rejects(authenticateStaff(pool,'owner@example.test',replacement,'127.0.0.3',options),/Injected/);
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM sessions')).rows[0].n,before);
    setFail(false);
    const live = await authenticateStaff(pool,'owner@example.test',replacement,'127.0.0.3',options);
    await db.query("UPDATE sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[tokenHash(live.session.token)]);
    await assert.rejects(requireSession(pool,request(live.session.token),options),/Sign in required/);
    const active = await authenticateStaff(pool,'owner@example.test',replacement,'127.0.0.3',options);
    await db.query("UPDATE staff SET active=false WHERE id='owner-a'");
    await assert.rejects(requireSession(pool,request(active.session.token),options),/Sign in required/);
    await assert.rejects(authenticateStaff(pool,'owner@example.test',replacement,'127.0.0.4',options),/Invalid credentials/);
  } finally { await db.close(); }
});

test('PostgreSQL failed-login counters persist despite generic errors and reset only after their window', async () => {
  const { db,pool } = await fixture();
  try {
    for (let n=0;n<5;n++) await assert.rejects(authenticateStaff(pool,'owner@example.test','Incorrect password','127.0.0.1',options),/Invalid credentials/);
    assert.deepEqual((await db.query('SELECT count FROM auth_attempts WHERE key_hash<>$1 ORDER BY key_hash',[AUTH_GLOBAL_KEY])).rows.map((row) => row.count),[5,5]);
    await assert.rejects(authenticateStaff(pool,'owner@example.test',password,'127.0.0.1',options),/Invalid credentials/);
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM sessions')).rows[0].n,0);
    await db.query("UPDATE auth_attempts SET window_started_at=clock_timestamp()-interval '16 minutes'");
    await assert.rejects(authenticateStaff(pool,'owner@example.test','Incorrect password','127.0.0.1',options),/Invalid credentials/);
    assert.deepEqual((await db.query('SELECT count FROM auth_attempts WHERE key_hash<>$1 ORDER BY key_hash',[AUTH_GLOBAL_KEY])).rows.map((row) => row.count),[1,1]);
    await authenticateStaff(pool,'owner@example.test',password,'127.0.0.1',options);
    assert.equal((await db.query('SELECT count FROM auth_attempts WHERE key_hash=$1',[tokenHash('ip:127.0.0.1')])).rows[0].count,1);
    await assert.rejects(authenticateStaff(pool,'unknown@example.test',password,'127.0.0.2',options),/Invalid credentials/);
    await assert.rejects(authenticateStaff(pool,'owner@example.test','x'.repeat(257),'127.0.0.3',options),/Invalid credentials/);
  } finally { await db.close(); }
});

test('PostgreSQL global admission denies valid credentials without creating a session or audit',async()=>{
  const {db,pool}=await fixture();try {
    await db.query('INSERT INTO auth_attempts VALUES($1,$2,clock_timestamp())',[AUTH_GLOBAL_KEY,AUTH_GLOBAL_LIMIT]);
    const before=(await db.query('SELECT count(*)::int n FROM audit')).rows[0].n;
    await assert.rejects(authenticateStaff(pool,'owner@example.test',password,'new-ip',options),/Invalid credentials/);
    assert.equal((await db.query('SELECT count(*)::int n FROM auth_attempts')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int n FROM sessions')).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM audit')).rows[0].n,before);
  }finally {await db.close();}
});

test('PostgreSQL grants redeem once, reissue/revoke invalidate sessions and audit failure rolls back', async () => {
  const { db,pool,setFail } = await fixture();
  try {
    await assert.rejects(issueWorkerGrant(pool,other,'worker-a',240,options),/unavailable/);
    await assert.rejects(issueWorkerGrant(pool,owner,'worker-c',240,options),/unavailable/);
    await assert.rejects(issueWorkerGrant(pool,{...owner,principal_id:'auditor-a',role:'auditor'},'worker-a',240,options),/Forbidden/);
    await assert.rejects(issueWorkerGrant(pool,{...owner,site_id:'site-c'},'worker-a',240,options),/Forbidden/);
    await assert.rejects(issueWorkerGrant(pool,owner,'worker-a',1,options),/expiry/);
    const grant = await issueWorkerGrant(pool,owner,'worker-a',5,options);
    assert.equal((await db.query('SELECT token_hash FROM worker_grants WHERE id=$1',[grant.id])).rows[0].token_hash,tokenHash(grant.token));
    setFail(true);
    await assert.rejects(redeemWorkerGrant(pool,grant.token,options),/Injected/);
    assert.equal((await db.query('SELECT redeemed_at FROM worker_grants WHERE id=$1',[grant.id])).rows[0].redeemed_at,null);
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM sessions')).rows[0].n,0);
    setFail(false);
    const redeemed = await redeemWorkerGrant(pool,grant.token,options);
    assert.ok(redeemed.maxSeconds<=300); assert.ok(redeemed.maxSeconds>0);
    assert.equal((await requireSession(pool,request(redeemed.token),options)).principal_id,'worker-a');
    await assert.rejects(redeemWorkerGrant(pool,grant.token,options),/Invalid credentials/);
    const newer = await issueWorkerGrant(pool,owner,'worker-a',240,options);
    await assert.rejects(requireSession(pool,request(redeemed.token),options),/Sign in required/);
    await assert.rejects(redeemWorkerGrant(pool,grant.token,options),/Invalid credentials/);
    const current = await redeemWorkerGrant(pool,newer.token,options);
    await assert.rejects(revokeWorkerGrant(pool,other,newer.id,options),/unavailable/);
    await revokeWorkerGrant(pool,owner,newer.id,options);
    await revokeWorkerGrant(pool,owner,newer.id,options);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM audit WHERE action='grant.revoked'")).rows[0].n,1);
    await assert.rejects(requireSession(pool,request(current.token),options),/Sign in required/);
    const expires = await issueWorkerGrant(pool,owner,'worker-a',5,options);
    await db.query("UPDATE worker_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expires.id]);
    await assert.rejects(redeemWorkerGrant(pool,expires.token,options),/Invalid credentials/);
    await db.query("UPDATE staff SET active=false WHERE id='owner-a'");
    await assert.rejects(issueWorkerGrant(pool,owner,'worker-a',240,options),/Forbidden/);
  } finally { await db.close(); }
});

test('PostgreSQL access metadata has complete bounded pages, status precedence and no token material',async () => {
  const {db,pool}=await fixture();
  try {
    await db.query(`INSERT INTO worker_grants(id,org_id,site_id,worker_id,token_hash,created_at,expires_at,revoked_at)
      SELECT 'old-'||lpad(n::text,3,'0'),'org-a','site-a','worker-a',lpad(to_hex(n),64,'0'),
        '2000-01-01'::timestamptz,'2001-01-01'::timestamptz,'2000-02-01'::timestamptz FROM generate_series(0,124) n`);
    const grant=await issueWorkerGrant(pool,owner,'worker-a',30,options);
    let result=await listWorkerGrants(pool,owner,'worker-a',{pageSize:20},options);
    assert.equal(result.total,126);assert.equal(result.items[0].status,'available');assert.equal(result.items[0].id,grant.id);
    assert.deepEqual(Object.keys(result.items[0]).sort(),['id','workerId','createdAt','expiresAt','redeemedAt','revokedAt','status'].sort());
    assert.ok(!/token|hash|rubric|answer|notes/.test(JSON.stringify(result)));
    result=await listWorkerGrants(pool,owner,'worker-a',{page:7,pageSize:20},options);assert.equal(result.items.length,6);assert.equal(result.items.at(-1).id,'old-000');
    assert.deepEqual((await listWorkerGrants(pool,owner,'worker-a',{page:5000},options)).items,[]);
    for(const input of [{page:5001},{pageSize:51},{page:0},{token:true},{org_id:'org-b'}]) await assert.rejects(listWorkerGrants(pool,owner,'worker-a',input,options),/Invalid/);
    await assert.rejects(listWorkerGrants(pool,other,'worker-a',{},options),/unavailable/);
    await assert.rejects(listWorkerGrants(pool,owner,'worker-c',{},options),/unavailable/);
    for(const principal of [{...owner,principal_type:'worker'},{...owner,principal_id:'missing'},{...owner,role:'supervisor'}]) await assert.rejects(listWorkerGrants(pool,principal,'worker-a',{},options),/Forbidden/);
    await redeemWorkerGrant(pool,grant.token,options);assert.equal((await listWorkerGrants(pool,owner,'worker-a',{},options)).items[0].status,'redeemed');
    await revokeWorkerGrant(pool,owner,grant.id,options);assert.equal((await listWorkerGrants(pool,owner,'worker-a',{},options)).items[0].status,'revoked');
    const expired=await issueWorkerGrant(pool,owner,'worker-a',5,options);
    await db.query("UPDATE worker_grants SET expires_at='2000-01-01' WHERE id=$1",[expired.id]);
    assert.equal((await listWorkerGrants(pool,owner,'worker-a',{},options)).items[0].status,'expired');
    const auditBefore=(await db.query('SELECT COUNT(*)::int n FROM audit')).rows[0].n;
    await db.query("UPDATE workers SET active=false WHERE id='worker-a'");
    assert.equal((await listWorkerGrants(pool,owner,'worker-a',{},options)).workerActive,false);
    await db.query("UPDATE staff SET active=false WHERE id='owner-a'");
    await assert.rejects(listWorkerGrants(pool,owner,'worker-a',{},options),/Forbidden/);
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM audit')).rows[0].n,auditBefore);
  } finally {await db.close();}
});
