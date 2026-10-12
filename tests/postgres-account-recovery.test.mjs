import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {provisionStaffCredential,authenticateStaff,requireSession} from '../server/postgres/auth.mjs';
import {requestRecovery,resetPassword,processOneRecovery,expireRecovery} from '../server/postgres/account-recovery.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {rehearsalTasks,runWorkerCycle} from '../server/postgres/runtime.mjs';
import {tokenHash,passwordMatches} from '../server/auth-crypto.mjs';
import {openMail} from '../server/auth-mail.mjs';
import {AUTH_MAIL_QUEUE_LIMIT} from '../server/auth-mail-budget.mjs';

const options={schema:'understood_test_recovery'},password='Synthetic-recovery-password-123';
const mail={available:true,key:Buffer.alloc(32,7),publicOrigin:'http://127.0.0.1:3031'};
const reset=token=>({token,password:`${password}-new`,confirmation:`${password}-new`});
const req=token=>({headers:{cookie:`understood_session=${token}`}});

async function fixture() {
  const db=new PGlite();let failAudit=false,previous=Promise.resolve(),lostCommit=false;
  // PGlite is one connection. Serialize transactions; this is not a real-server concurrency test.
  const pool={async connect() {
    const pending=previous;let release;previous=new Promise(done=>{release=done;});await pending;
    return {async query(sql,values) {
      if(failAudit && sql.startsWith('INSERT INTO audit')) throw new Error('Injected audit failure');
      const result=values?.length ? await db.query(sql,values) : (await db.exec(sql)).at(-1) || {rows:[]};
      if(sql==='COMMIT' && lostCommit) {lostCommit=false;throw new Error('Injected lost commit acknowledgement');}
      return result;
    },release};
  }};
  await db.exec(`CREATE SCHEMA ${options.schema};SET search_path TO ${options.schema},pg_catalog`);
  await runMigrations(pool,options);
  await db.exec(`INSERT INTO organizations(id,name) VALUES('a','A'),('b','B');
    INSERT INTO sites(id,org_id,name,timezone) VALUES('a','a','A','UTC'),('b','b','B','UTC');
    INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner-a','a','a','Owner A','owner'),('owner-b','b','b','Owner B','owner')`);
  for(const id of ['a','b']) await provisionStaffCredential(pool,{staffId:`owner-${id}`,orgId:id,siteId:id,email:`${id}@example.test`,password},options);
  const count=async table=>(await db.query(`SELECT COUNT(*)::int n FROM ${table}`)).rows[0].n;
  const deliver=async (email='a@example.test',send)=>{
    await requestRecovery(pool,{email},'127.0.0.1',mail,options);
    let message;
    await processOneRecovery(pool,mail,{...options,send:async (config,id,value)=>{
      message=value;return send ? send(config,id,value) : {providerId:'synthetic-delivery'};
    }});
    return message?.text.match(/#reset-password\/([A-Za-z0-9_-]{43})/)?.[1];
  };
  return {db,pool,count,deliver,failAudit:value=>{failAudit=value;},loseCommit:()=>{lostCommit=true;}};
}

test('PostgreSQL full recovery outbox preserves credential, token and audit until notice capacity is available',async()=>{
  const {db,pool,deliver}=await fixture();try {
    const token=await deliver(),before=(await db.query('SELECT * FROM staff_credentials ORDER BY staff_id')).rows;
    await db.query(`INSERT INTO staff_recovery_mail(id,purpose,email_hash,expires_at,state)
      SELECT 'capacity-'||n,'reset',repeat('a',64),clock_timestamp()+interval '1 hour','queued' FROM generate_series(1,$1) n`,[AUTH_MAIL_QUEUE_LIMIT]);
    assert.deepEqual(await requestRecovery(pool,{email:'unknown-capacity@example.test'},'capacity-ip',mail,options),{accepted:true,delivery:'queued'});
    assert.equal((await db.query("SELECT count(*)::int n FROM staff_recovery_mail WHERE state='queued'")).rows[0].n,AUTH_MAIL_QUEUE_LIMIT);
    await assert.rejects(resetPassword(pool,reset(token),'reset-ip',mail,options),/Email delivery unavailable/);
    assert.deepEqual((await db.query('SELECT * FROM staff_credentials ORDER BY staff_id')).rows,before);
    assert.equal((await db.query('SELECT used_at FROM staff_recovery_tokens')).rows[0].used_at,null);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM audit WHERE action='credential.recovered'")).rows[0].n,0);
    await db.query("UPDATE staff_recovery_mail SET state='failed' WHERE id='capacity-1'");
    assert.deepEqual(await resetPassword(pool,reset(token),'reset-ip',mail,options),{completed:true,signInRequired:true});
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM staff_recovery_mail WHERE state IN ('queued','processing')")).rows[0].n,AUTH_MAIL_QUEUE_LIMIT);
  }finally {await db.close();}
});

test('PostgreSQL recovery is generic, deferred, encrypted, rate limited and unavailable when disabled',async ()=>{
  const {db,pool,count}=await fixture();
  try {
    for(const email of [' A@EXAMPLE.TEST ','unknown@example.test']) assert.deepEqual(
      await requestRecovery(pool,{email},'127.0.0.1',mail,options),{accepted:true,delivery:'queued'});
    assert.equal(await count('staff_recovery_tokens'),0);
    const rows=(await db.query('SELECT * FROM staff_recovery_mail ORDER BY created_at')).rows;
    assert.ok(!JSON.stringify(rows).includes('@example.test'));
    assert.deepEqual(openMail(mail,rows[0].id,rows[0].payload),{email:'a@example.test'});
    for(let n=0;n<6;n++) await requestRecovery(pool,{email:'a@example.test'},'127.0.0.1',mail,options);
    assert.equal(await count('staff_recovery_mail'),5);
    assert.equal((await db.query('SELECT count FROM auth_attempts WHERE key_hash=$1',[tokenHash('reset-ip:127.0.0.1')])).rows[0].count,5);
    let sent=0;
    while(await processOneRecovery(pool,mail,{...options,send:async ()=>{sent++;return {providerId:'synthetic'};}})) {}
    assert.equal(sent,4);assert.equal(await count('staff_recovery_tokens'),4);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM staff_recovery_mail WHERE state='ignored' AND payload IS NULL")).rows[0].n,1);
    await assert.rejects(requestRecovery(pool,{email:'a@example.test'},'127.0.0.2',{available:false},options),/Email delivery unavailable/);
    for(const input of [{email:'invalid'},{email:'a@example.test',siteId:'b'},null])
      await assert.rejects(requestRecovery(pool,input,'127.0.0.2',mail,options),/Invalid/);
    assert.equal(await processOneRecovery(pool,{available:false},options),false);
    await db.query("UPDATE auth_attempts SET window_started_at='2000-01-01'");
    await requestRecovery(pool,{email:'a@example.test'},'127.0.0.1',mail,options);assert.equal(await count('staff_recovery_mail'),6);
  }finally{await db.close();}
});

test('PostgreSQL reset commits password/token/session/notice/audit once and preserves other tenants',async ()=>{
  const {db,pool,count,deliver,failAudit}=await fixture();
  try {
    const a=await authenticateStaff(pool,'a@example.test',password,'127.0.0.1',options);
    const b=await authenticateStaff(pool,'b@example.test',password,'127.0.0.2',options);
    const first=await deliver(),second=await deliver();assert.ok(first && second);
    const before=(await db.query("SELECT * FROM staff_credentials WHERE staff_id='owner-a'")).rows[0];
    failAudit(true);await assert.rejects(resetPassword(pool,reset(first),'127.0.0.1',mail,options),/Injected/);
    assert.deepEqual((await db.query("SELECT * FROM staff_credentials WHERE staff_id='owner-a'")).rows[0],before);
    assert.equal((await requireSession(pool,req(a.session.token),options)).id,'owner-a');
    assert.equal((await db.query('SELECT used_at,revoked_at FROM staff_recovery_tokens WHERE token_hash=$1',[tokenHash(first)])).rows[0].used_at,null);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM staff_recovery_mail WHERE purpose='notice'")).rows[0].n,0);
    failAudit(false);
    const results=await Promise.allSettled([resetPassword(pool,reset(first),'127.0.0.1',mail,options),resetPassword(pool,reset(first),'127.0.0.1',mail,options)]);
    assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
    assert.deepEqual(results.find(row=>row.status==='fulfilled').value,{completed:true,signInRequired:true});
    await assert.rejects(resetPassword(pool,reset(second),'127.0.0.1',mail,options),/Invalid recovery/);
    await assert.rejects(requireSession(pool,req(a.session.token),options),/Sign in required/);
    assert.equal((await requireSession(pool,req(b.session.token),options)).id,'owner-b');
    const changed=(await db.query("SELECT * FROM staff_credentials WHERE staff_id='owner-a'")).rows[0];
    assert.equal(await passwordMatches(`${password}-new`,changed),true);
    assert.equal(await passwordMatches(password,changed),false);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM audit WHERE action='credential.recovered'")).rows[0].n,1);
    assert.equal(await count('sessions'),2);
    const notice=(await db.query("SELECT * FROM staff_recovery_mail WHERE purpose='notice'")).rows[0];
    assert.equal(openMail(mail,notice.id,notice.payload).email,'a@example.test');
    await assert.rejects(db.query('UPDATE staff_recovery_tokens SET used_at=NULL WHERE token_hash=$1',[tokenHash(first)]),/immutable/);
    await assert.rejects(db.query('UPDATE staff_recovery_tokens SET site_id=$1 WHERE token_hash=$2',['b',tokenHash(first)]),/immutable/);
    await assert.rejects(db.query(`INSERT INTO staff_recovery_tokens VALUES($1,$2,'owner-a','b','b',$3,clock_timestamp()+interval '1 minute',NULL,NULL)`,
      ['f'.repeat(64),notice.id,'a'.repeat(64)]),/foreign key/);
  }finally{await db.close();}
});

test('PostgreSQL links fail after role/access or credential changes and expiry',async ()=>{
  const {db,pool,deliver}=await fixture();
  try {
    const role=await deliver();await db.query("UPDATE staff SET role='supervisor' WHERE id='owner-a'");
    await db.query("UPDATE staff SET role='owner' WHERE id='owner-a'");
    await assert.rejects(resetPassword(pool,reset(role),'127.0.0.1',mail,options),/Invalid recovery/);
    const access=await deliver();await db.query("UPDATE staff SET active=false WHERE id='owner-a'");
    await db.query("UPDATE staff SET active=true WHERE id='owner-a'");
    await assert.rejects(resetPassword(pool,reset(access),'127.0.0.1',mail,options),/Invalid recovery/);
    const rotated=await deliver();await provisionStaffCredential(pool,{staffId:'owner-a',orgId:'a',siteId:'a',email:'a@example.test',password},options);
    await assert.rejects(resetPassword(pool,reset(rotated),'127.0.0.1',mail,options),/Invalid recovery/);
    await requestRecovery(pool,{email:'a@example.test'},'127.0.0.1',mail,options);
    await db.query("UPDATE staff_recovery_mail SET expires_at='2000-01-01' WHERE state='queued'");
    const expiredMail=(await db.query("SELECT id FROM staff_recovery_mail WHERE state='queued'")).rows[0].id;
    await db.query(`INSERT INTO staff_recovery_tokens(token_hash,mail_id,staff_id,org_id,site_id,credential_hash,expires_at)
      SELECT $1,$2,staff_id,org_id,site_id,credential_hash,'2000-01-01' FROM staff_recovery_tokens LIMIT 1`,[tokenHash('e'.repeat(43)),expiredMail]);
    await expireRecovery(pool,options);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM staff_recovery_mail WHERE state='expired' AND payload IS NULL")).rows[0].n,1);
    assert.ok((await db.query('SELECT revoked_at FROM staff_recovery_tokens WHERE token_hash=$1',[tokenHash('e'.repeat(43))])).rows[0].revoked_at);
    await assert.rejects(resetPassword(pool,reset('e'.repeat(43)),'127.0.0.3',mail,options),/Invalid recovery/);
    await assert.rejects(resetPassword(pool,{...reset(rotated),password:'short',confirmation:'short'},'127.0.0.3',mail,options),/Invalid credential input/);
    await assert.rejects(resetPassword(pool,{...reset(rotated),confirmation:'mismatch'},'127.0.0.3',mail,options),/Invalid recovery/);
    for(let n=0;n<6;n++) await assert.rejects(resetPassword(pool,reset('x'.repeat(43)),'127.0.0.4',mail,options),/Invalid recovery/);
    assert.equal((await db.query('SELECT count FROM auth_attempts WHERE key_hash=$1',[tokenHash('reset-redeem-ip:127.0.0.4')])).rows[0].count,5);
  }finally{await db.close();}
});

test('PostgreSQL preparation rollback, fixed retries, stale lease and corrupted mail are fenced',async ()=>{
  const {db,pool,count,failAudit}=await fixture();
  try {
    await requestRecovery(pool,{email:'a@example.test'},'127.0.0.1',mail,options);
    let sends=0,messages=[];const send=async (_,id,message)=>{sends++;messages.push({id,message});throw new Error('private provider secret');};
    failAudit(true);await assert.rejects(processOneRecovery(pool,mail,{...options,send}),/Injected/);
    assert.equal(await count('staff_recovery_tokens'),0);assert.equal(sends,0);
    assert.equal((await db.query('SELECT attempts,state FROM staff_recovery_mail')).rows[0].attempts,0);
    failAudit(false);
    for(let n=0;n<3;n++) {
      await db.query("UPDATE staff_recovery_mail SET next_at='2000-01-01' WHERE state='queued'");
      await processOneRecovery(pool,mail,{...options,send});
    }
    assert.equal(sends,3);assert.deepEqual(messages[1],messages[0]);assert.deepEqual(messages[2],messages[0]);
    const failed=(await db.query('SELECT * FROM staff_recovery_mail')).rows[0];
    assert.equal(failed.state,'failed');assert.equal(failed.payload,null);assert.equal(failed.attempts,3);
    assert.ok(!JSON.stringify(failed).includes('private provider secret'));
    await requestRecovery(pool,{email:'a@example.test'},'127.0.0.2',mail,options);
    let release,started;const start=new Promise(done=>{started=done;});const wait=new Promise(done=>{release=done;});
    const stale=processOneRecovery(pool,mail,{...options,send:async ()=>{started();await wait;return {providerId:'stale'};}});
    await start;
    await db.query("UPDATE staff_recovery_mail SET lease_until='2000-01-01' WHERE state='processing'");
    assert.equal(await processOneRecovery(pool,mail,{...options,send:async ()=>({providerId:'current'})}),true);
    release();await stale;
    assert.equal((await db.query("SELECT provider_id FROM staff_recovery_mail WHERE state='sent'")).rows[0].provider_id,'current');
    await requestRecovery(pool,{email:'a@example.test'},'127.0.0.3',mail,options);
    await db.query("UPDATE staff_recovery_mail SET payload='corrupt' WHERE state='queued'");
    await processOneRecovery(pool,mail,{...options,send:async ()=>{throw new Error('Should not send');}});
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM staff_recovery_mail WHERE state='failed' AND payload IS NULL")).rows[0].n,2);
  }finally{await db.close();}
});

test('PostgreSQL committed reset remains consumed after an acknowledgement is lost',async ()=>{
  const {db,pool,deliver,loseCommit}=await fixture();
  try {
    const token=await deliver();let commit=0;
    const wrapped={async connect(){const client=await pool.connect();return {release:client.release,
      async query(sql,values){if(sql==='COMMIT' && ++commit===2) loseCommit();return client.query(sql,values);}};}};
    await assert.rejects(resetPassword(wrapped,reset(token),'127.0.0.1',mail,options),/lost commit acknowledgement/);
    assert.equal(await passwordMatches(`${password}-new`,(await db.query("SELECT * FROM staff_credentials WHERE staff_id='owner-a'")).rows[0]),true);
    await assert.rejects(resetPassword(pool,reset(token),'127.0.0.1',mail,options),/Invalid recovery/);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM audit WHERE action='credential.recovered'")).rows[0].n,1);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM staff_recovery_mail WHERE purpose='notice'")).rows[0].n,1);
  }finally{await db.close();}
});

test('PostgreSQL lost preparation acknowledgement does not send until its persisted lease is reclaimed',async ()=>{
  const {db,pool,loseCommit}=await fixture();
  try {
    await requestRecovery(pool,{email:'a@example.test'},'127.0.0.1',mail,options);
    let commit=0,sends=0;
    const wrapped={async connect(){const client=await pool.connect();return {release:client.release,
      async query(sql,values){if(sql==='COMMIT' && ++commit===2) loseCommit();return client.query(sql,values);}};}};
    await assert.rejects(processOneRecovery(wrapped,mail,{...options,send:async ()=>{sends++;return {providerId:'synthetic'};}}),/lost commit acknowledgement/);
    assert.equal(sends,0);
    const row=(await db.query('SELECT * FROM staff_recovery_mail')).rows[0];assert.equal(row.state,'processing');assert.equal(row.attempts,1);
    const original=openMail(mail,row.id,row.payload);
    assert.equal(await processOneRecovery(pool,mail,{...options,send:async ()=>{throw new Error('Should not reclaim live lease');}}),false);
    await db.query("UPDATE staff_recovery_mail SET lease_until='2000-01-01' WHERE id=$1",[row.id]);
    await processOneRecovery(pool,mail,{...options,send:async (_,id,message)=>{
      sends++;assert.equal(id,row.id);assert.deepEqual(message,original);return {providerId:'synthetic'};
    }});
    assert.equal(sends,1);
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM staff_recovery_tokens')).rows[0].n,1);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM audit WHERE action='credential.recovery_queued'")).rows[0].n,1);
    assert.equal((await db.query('SELECT state,attempts FROM staff_recovery_mail')).rows[0].state,'sent');
  }finally{await db.close();}
});

test('PostgreSQL HTTP recovery enforces origin/input, clears only its cookie and schedules expiry',async ()=>{
  const {db,pool,deliver}=await fixture();let server;
  try {
    const config={tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:mail.publicOrigin,dataClass:'synthetic',...options};
    const tasks=rehearsalTasks(pool,{},config);
    assert.equal(await tasks.recoveryMail(),false);
    await runWorkerCycle({recoveryExpiry:tasks.recoveryExpiry});
    server=createPostgresRehearsalServer(pool,config);
    await new Promise(done=>server.listen(0,'127.0.0.1',done));let base=`http://127.0.0.1:${server.address().port}`;
    const post=(path,body,origin=mail.publicOrigin)=>fetch(`${base}${path}`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
    let response=await post('/api/auth/recovery',{email:'a@example.test'});assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'Email delivery unavailable'});
    await new Promise(done=>server.close(done));
    server=createPostgresRehearsalServer(pool,{...config,mail});await new Promise(done=>server.listen(0,'127.0.0.1',done));
    base=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await post('/api/auth/recovery',{email:'a@example.test'},'https://other.example.test')).status,403);
    assert.equal((await post('/api/auth/recovery?token=secret',{email:'a@example.test'})).status,400);
    assert.equal((await post('/api/auth/recovery',{email:'a@example.test',token:'secret'})).status,400);
    response=await post('/api/auth/recovery',{email:'unknown@example.test'});assert.equal(response.status,202);
    assert.deepEqual(await response.json(),{accepted:true,delivery:'queued'});
    await processOneRecovery(pool,mail,{...options,send:async ()=>{throw new Error('Should not send unknown');}});
    const token=await deliver();assert.ok(token);
    response=await post('/api/auth/reset-password',reset(token));assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{completed:true,signInRequired:true});
    assert.match(response.headers.get('set-cookie'),/^understood_pg_rehearsal=;.*Max-Age=0/);
    assert.equal((await post('/api/auth/reset-password',reset(token))).status,400);
    assert.equal((await post('/api/auth/reset-password?token=secret',reset(token))).status,400);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM sessions")).rows[0].n,0);
  }finally{if(server?.listening) await new Promise(done=>server.close(done));await db.close();}
});
