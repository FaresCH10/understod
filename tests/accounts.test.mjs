import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase,transaction} from '../server/db.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import * as localAuth from '../server/auth.mjs';
import * as pgAuth from '../server/postgres/auth.mjs';
import * as localAccount from '../server/accounts.mjs';
import * as pgAccount from '../server/postgres/accounts.mjs';
import * as localRecovery from '../server/account-recovery.mjs';
import * as pgRecovery from '../server/postgres/account-recovery.mjs';
import {createAppServer} from '../server/index.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {passwordMatches,tokenHash} from '../server/auth-crypto.mjs';
import {DatabaseSync} from 'node:sqlite';
import {ensureAccountSchema} from '../server/account-schema.mjs';

const password='Synthetic-account-password-123';
const config={tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:'http://127.0.0.1:3031'};
const mail={available:true,key:Buffer.alloc(32,7),publicOrigin:config.publicOrigin};

async function fixture(backend) {
  const postgres=backend==='PostgreSQL',db=postgres ? new PGlite() : openDatabase(':memory:');
  const options={schema:'understood_test_accounts',cookieName:postgres ? 'understood_pg_rehearsal' : 'understood_session'};
  let failed=false,queue=Promise.resolve();
  const pool={async connect(){const pending=queue;let release;queue=new Promise(done=>{release=done;});await pending;
    return {release,async query(sql,values){
      if(failed && sql.startsWith('INSERT INTO audit')) throw new Error('Injected private audit failure');
      return values?.length ? db.query(sql,values) : (await db.exec(sql)).at(-1) || {rows:[]};
    }};
  }};
  if(postgres){await db.exec(`CREATE SCHEMA ${options.schema};SET search_path TO ${options.schema},pg_catalog`);await runMigrations(pool,options);}
  const q=async (sql,values=[])=>{
    if(postgres) return (await db.query(sql,values)).rows;
    const args=values.length ? [Object.fromEntries(values.map((value,index)=>[`$${index+1}`,value]))] : [];
    return /^(SELECT|WITH|PRAGMA)/.test(sql) ? db.prepare(sql).all(...args) : (db.prepare(sql).run(...args),[]);
  };
  await q("INSERT INTO organizations(id,name) VALUES('a','A'),('b','B')");
  await q("INSERT INTO sites(id,org_id,name,timezone) VALUES('a','a','A','UTC'),('c','a','C','UTC'),('b','b','B','UTC')");
  await q(`INSERT INTO staff(id,org_id,site_id,name,role) VALUES('home','a','a','Person','owner'),
    ('linked-c','a','c','Person C','supervisor'),('linked-b','b','b','Person B','auditor'),('foreign','b','b','Other person','owner')`);
  const provision=async (staffId,email,newPassword=password)=>{
    if(!postgres) return localAuth.provisionStaffCredential(db,staffId,email,newPassword);
    const staff=(await q('SELECT org_id,site_id FROM staff WHERE id=$1',[staffId]))[0];
    return pgAuth.provisionStaffCredential(pool,{staffId,orgId:staff.org_id,siteId:staff.site_id,email,password:newPassword},options);
  };
  await provision('home','person@example.test');await provision('foreign','other@example.test');
  const request=token=>({headers:{cookie:`${options.cookieName}=${token}`}});
  const login=async (email='person@example.test',newPassword=password)=>{
    if(postgres) return pgAuth.authenticateStaff(pool,email,newPassword,'127.0.0.1',options);
    const principal=localAuth.authenticateStaff(db,email,newPassword,'127.0.0.1');
    return {principal,session:localAuth.createSession(db,principal,'staff','credential')};
  };
  const session=async token=>postgres ? pgAuth.requireSession(pool,request(token),options) : localAuth.requireSession(db,request(token),config);
  const list=async (value,input={})=>postgres ? pgAccount.listAccountSites(pool,value,input,options) : localAccount.listAccountSites(db,value,input);
  const select=async (token,input)=>postgres ? pgAccount.switchAccountSite(pool,request(token),input,options) : localAccount.switchAccountSite(db,request(token),config,input);
  const link=async (accountId,staffId)=>postgres ? pgAuth.inSchema(pool,options.schema,client=>pgAccount.linkAccountMembership(client,accountId,staffId))
    : transaction(db,()=>localAccount.linkAccountMembership(db,accountId,staffId));
  const deliver=async ()=>{
    if(postgres) await pgRecovery.requestRecovery(pool,{email:'person@example.test'},'127.0.0.2',mail,options);
    else localRecovery.requestRecovery(db,{email:'person@example.test'},'127.0.0.2',mail);
    let message;const send=async (_,id,value)=>{message=value;return {providerId:'synthetic'};};
    if(postgres) await pgRecovery.processOneRecovery(pool,mail,{...options,send});else await localRecovery.processOneRecovery(db,mail,{send});
    return message?.text.match(/#reset-password\/([A-Za-z0-9_-]{43})/)?.[1];
  };
  const reset=async token=>{
    const input={token,password:`${password}-new`,confirmation:`${password}-new`};
    return postgres ? pgRecovery.resetPassword(pool,input,'127.0.0.3',mail,options) : localRecovery.resetPassword(db,input,'127.0.0.3',mail);
  };
  const failAudit=async value=>{
    failed=value;if(postgres) return;
    if(value) db.exec("CREATE TRIGGER account_test_audit_failure BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'Injected private audit failure');END");
    else db.exec('DROP TRIGGER account_test_audit_failure');
  };
  return {db,pool,q,provision,login,session,list,select,link,deliver,reset,failAudit,options,
    server:()=>postgres ? createPostgresRehearsalServer(pool,{...config,...options,dataClass:'synthetic'}) : createAppServer(db,{...config,mail:{mode:'disabled'}}),
    close:async ()=>db.close()};
}

test('SQLite account upgrade preserves credential/staff rows, invalidates old recovery and is idempotent',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE sites(id TEXT PRIMARY KEY,org_id TEXT,name TEXT);
      CREATE TABLE staff(id TEXT PRIMARY KEY,org_id TEXT,site_id TEXT,name TEXT,role TEXT,active INTEGER);
      CREATE TABLE staff_credentials(staff_id TEXT PRIMARY KEY,email TEXT,password_salt TEXT,password_hash TEXT,changed_at TEXT);
      CREATE TABLE staff_recovery_tokens(token_hash TEXT PRIMARY KEY,used_at TEXT,revoked_at TEXT);
      CREATE TABLE staff_recovery_mail(state TEXT,payload TEXT,lease_token TEXT,lease_until TEXT);
      INSERT INTO organizations VALUES('a','A');INSERT INTO sites VALUES('a','a','A');
      INSERT INTO staff VALUES('home','a','a','Person','owner',1);
      INSERT INTO staff_credentials VALUES('home','synthetic@example.test','synthetic-salt','synthetic-hash','2026-10-01');
      INSERT INTO staff_recovery_tokens VALUES('old-secret',NULL,NULL);
      INSERT INTO staff_recovery_mail VALUES('processing','private-payload','old-lease','2000-01-01');`);
    const staff=db.prepare('SELECT * FROM staff').all(),credentials=db.prepare('SELECT * FROM staff_credentials').all();
    ensureAccountSchema(db);
    assert.deepEqual(db.prepare('SELECT * FROM staff').all(),staff);assert.deepEqual(db.prepare('SELECT * FROM staff_credentials').all(),credentials);
    assert.equal(db.prepare('SELECT * FROM staff_account_memberships').get().account_id,'home');
    assert.ok(db.prepare('SELECT revoked_at FROM staff_recovery_tokens').get().revoked_at);
    assert.deepEqual({...db.prepare('SELECT * FROM staff_recovery_mail').get()},{state:'expired',payload:null,lease_token:null,lease_until:null});
    db.prepare('INSERT INTO staff_recovery_tokens VALUES(?,NULL,NULL)').run('new-secret');ensureAccountSchema(db);
    assert.equal(db.prepare('SELECT revoked_at FROM staff_recovery_tokens WHERE token_hash=?').get('new-secret').revoked_at,null);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM staff_accounts').get().n,1);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{db.close();}
});

for(const backend of ['SQLite','PostgreSQL']) {
  test(`${backend} accounts link independent scoped staff IDs without moving credentials or exposing foreign sites`,async ()=>{
    const f=await fixture(backend);
    try {
      const before=await f.q('SELECT * FROM staff WHERE id=$1',['home']);
      await f.link('home','linked-c');await f.link('home','linked-b');await f.link('home','linked-c');
      assert.deepEqual(await f.q('SELECT * FROM staff WHERE id=$1',['home']),before);
      assert.equal((await f.q('SELECT COUNT(*) n FROM staff_credentials'))[0].n,2);
      const login=await f.login(),session=await f.session(login.session.token);
      let result=await f.list(session,{page:1,pageSize:2});assert.equal(result.total,3);assert.equal(result.items.length,2);
      assert.deepEqual(result.items.map(row=>row.staffId),['home','linked-c']);assert.equal(result.items[0].current,true);
      result=await f.list(session,{page:2,pageSize:2});assert.deepEqual(result.items.map(row=>row.staffId),['linked-b']);assert.equal(result.items[0].role,'auditor');
      assert.deepEqual(Object.keys(result.items[0]).sort(),['staffId','organization','site','role','siteId','current'].sort());
      assert.ok(!/password|credential|token|account_id|other@example.test/.test(JSON.stringify(result)));
      assert.deepEqual((await f.list(session,{page:5000})).items,[]);
      for(const input of [{page:0},{pageSize:51},{page:true},{page:'1e2'},{orgId:'b'}]) await assert.rejects(f.list(session,input),/Invalid/);
      await assert.rejects(f.list({...session,principal_type:'worker'}),/Forbidden/);
      await assert.rejects(f.list({...session,access_mode:'demo'}),/Forbidden/);
      await assert.rejects(f.link('foreign','linked-c'),/conflict/);
      await assert.rejects(f.q('UPDATE staff_account_memberships SET account_id=$1 WHERE staff_id=$2',['foreign','linked-c']),/immutable/);
      await assert.rejects(f.q('DELETE FROM staff_account_memberships WHERE staff_id=$1',['linked-c']),/immutable/);
      await assert.rejects(f.q('INSERT INTO staff_account_memberships VALUES($1,$2,$3,$4)',['missing','home','a','missing']),/Scope mismatch|foreign key/);
      await f.q("INSERT INTO staff(id,org_id,site_id,name,role) VALUES('duplicate-site','a','a','Duplicate site','auditor')");
      await assert.rejects(f.link('home','duplicate-site'),/UNIQUE|unique constraint/);
    }finally{await f.close();}
  });

  test(`${backend} site selection rotates only the current session, preserves expiry and rolls back audit failure`,async ()=>{
    const f=await fixture(backend);
    try {
      await f.link('home','linked-c');await f.link('home','linked-b');
      const first=await f.login(),independent=await f.login();
      await assert.rejects(f.select(first.session.token,{staffId:'foreign'}),/unavailable/);
      await assert.rejects(f.select(first.session.token,{staffId:'linked-c',role:'owner'}),/Invalid/);
      await f.failAudit(true);await assert.rejects(f.select(first.session.token,{staffId:'linked-c'}),/Injected/);
      assert.equal((await f.q('SELECT COUNT(*) n FROM sessions'))[0].n,2);
      assert.equal((await f.session(first.session.token)).principal_id,'home');
      await f.failAudit(false);
      const switched=await f.select(first.session.token,{staffId:'linked-b'});
      assert.ok(switched.maxSeconds<=first.session.maxSeconds);assert.ok(Date.parse(switched.expiresAt)<=Date.parse(first.session.expiresAt));
      await assert.rejects(f.session(first.session.token),/Sign in required/);
      const session=await f.session(switched.token);assert.equal(session.principal_id,'linked-b');assert.equal(session.role,'auditor');assert.equal(session.org_id,'b');
      assert.equal((await f.session(independent.session.token)).principal_id,'home');
      assert.equal(Number((await f.q("SELECT COUNT(*) n FROM audit WHERE action='account.site_selected'"))[0].n),1);
      await f.q('UPDATE staff SET active=false WHERE id=$1',['linked-b']);
      await assert.rejects(f.session(switched.token),/Sign in required/);
      await assert.rejects(f.select(independent.session.token,{staffId:'linked-b'}),/unavailable/);
    }finally{await f.close();}
  });

  test(`${backend} account password rotation from a secondary site revokes all linked sessions only`,async ()=>{
    const f=await fixture(backend);
    try {
      await f.link('home','linked-c');
      const home=await f.login(),secondary=await f.select(home.session.token,{staffId:'linked-c'}),another=await f.login();
      const foreign=await f.login('other@example.test');
      await f.provision('linked-c','renamed@example.test',`${password}-rotated`);
      await assert.rejects(f.session(secondary.token),/Sign in required/);await assert.rejects(f.session(another.session.token),/Sign in required/);
      assert.equal((await f.session(foreign.session.token)).principal_id,'foreign');
      assert.equal((await f.q('SELECT COUNT(*) n FROM staff_credentials'))[0].n,2);
      assert.equal((await f.q('SELECT staff_id FROM staff_credentials WHERE email=$1',['renamed@example.test']))[0].staff_id,'home');
      assert.equal(await passwordMatches(`${password}-rotated`,(await f.q('SELECT * FROM staff_credentials WHERE staff_id=$1',['home']))[0]),true);
      await assert.rejects(f.login(),/Invalid credentials/);
      assert.equal((await f.login('renamed@example.test',`${password}-rotated`)).principal.id,'home');
      const original=(await f.q('SELECT * FROM staff_credentials WHERE staff_id=$1',['home']))[0];
      await assert.rejects(f.q('INSERT INTO staff_credentials(staff_id,email,password_salt,password_hash,changed_at) VALUES($1,$2,$3,$4,$5)',
        ['linked-c','forged@example.test',original.password_salt,original.password_hash,new Date().toISOString()]),/account credential identity/);
    }finally{await f.close();}
  });

  test(`${backend} inactive home membership still permits another site and recovery revokes the whole account`,async ()=>{
    const f=await fixture(backend);
    try {
      await f.link('home','linked-c');await f.link('home','linked-b');
      await f.q('UPDATE staff SET active=false WHERE id=$1',['home']);
      const first=await f.login();assert.equal(first.principal.id,'linked-c');
      const other=await f.select(first.session.token,{staffId:'linked-b'}),additional=await f.login();
      const foreign=await f.login('other@example.test');
      const token=await f.deliver();assert.ok(token);
      const target=(await f.q('SELECT staff_id FROM staff_recovery_tokens WHERE token_hash=$1',[tokenHash(token)]))[0];assert.equal(target.staff_id,'linked-c');
      assert.deepEqual(await f.reset(token),{completed:true,signInRequired:true});
      await assert.rejects(f.session(other.token),/Sign in required/);await assert.rejects(f.session(additional.session.token),/Sign in required/);
      assert.equal((await f.session(foreign.session.token)).principal_id,'foreign');
      assert.equal((await f.login('person@example.test',`${password}-new`)).principal.id,'linked-c');
      assert.equal((await f.q('SELECT staff_id FROM staff_credentials WHERE email=$1',['person@example.test']))[0].staff_id,'home');
    }finally{await f.close();}
  });

  test(`${backend} disabled/restored accounts reject earlier links and credentials without changing site roles`,async ()=>{
    const f=await fixture(backend);
    try {
      await f.link('home','linked-c');const login=await f.login(),token=await f.deliver();
      await f.q('UPDATE staff_accounts SET active=false WHERE id=$1',['home']);
      await assert.rejects(f.login(),/Invalid credentials/);await assert.rejects(f.session(login.session.token),/Sign in required/);
      await assert.rejects(f.link('home','linked-b'),/unavailable/);await assert.rejects(f.reset(token),/Invalid recovery/);
      await f.q('UPDATE staff_accounts SET active=true WHERE id=$1',['home']);
      await assert.rejects(f.reset(token),/Invalid recovery/);
      await assert.rejects(f.session(login.session.token),/Sign in required/);
      await assert.rejects(f.select(login.session.token,{staffId:'linked-c'}),/Sign in required/);
      assert.equal((await f.q('SELECT revision FROM staff_accounts WHERE id=$1',['home']))[0].revision,3);
      assert.equal((await f.q('SELECT role FROM staff WHERE id=$1',['linked-c']))[0].role,'supervisor');
      await assert.rejects(f.q('UPDATE staff_accounts SET credential_staff_id=$1 WHERE id=$2',['foreign','home']),/immutable/);
      assert.equal((await f.login()).principal.id,'home');
    }finally{await f.close();}
  });

  test(`${backend} account site HTTP enforces origin, cookie rotation, private scope and redacted errors`,async ()=>{
    const f=await fixture(backend);let server;
    try {
      await f.link('home','linked-c');server=f.server();await new Promise(done=>server.listen(0,'127.0.0.1',done));
      const base=`http://127.0.0.1:${server.address().port}`;
      const post=(path,body,cookie,origin=config.publicOrigin)=>fetch(`${base}${path}`,{method:'POST',headers:{origin,'content-type':'application/json',...(cookie ? {cookie} : {})},body:JSON.stringify(body)});
      assert.equal((await fetch(`${base}/api/account/sites`)).status,401);
      const login=await post('/api/auth/staff/login',{email:'person@example.test',password});assert.equal(login.status,200);
      const cookie=login.headers.get('set-cookie').split(';')[0];
      const listed=await fetch(`${base}/api/account/sites`,{headers:{cookie}});assert.equal(listed.status,200);assert.equal((await listed.json()).total,2);
      assert.equal((await post('/api/account/site',{staffId:'linked-c'},cookie,'https://foreign.example.test')).status,403);
      assert.equal((await post('/api/account/site?org=b',{staffId:'linked-c'},cookie)).status,400);
      assert.equal((await post('/api/account/site',{staffId:'foreign'},cookie)).status,404);
      await f.failAudit(true);
      const failed=await post('/api/account/site',{staffId:'linked-c'},cookie);assert.equal(failed.status,503);assert.ok(!JSON.stringify(await failed.json()).includes('Injected'));
      await f.failAudit(false);
      const selected=await post('/api/account/site',{staffId:'linked-c'},cookie);assert.equal(selected.status,200);
      const next=selected.headers.get('set-cookie').split(';')[0];assert.ok(next.startsWith(`${f.options.cookieName}=`));assert.notEqual(next,cookie);
      assert.equal((await fetch(`${base}/api/account/sites`,{headers:{cookie}})).status,401);
      const context=await fetch(`${base}/api/session`,{headers:{cookie:next}});const value=await context.json();
      assert.equal(value.authenticated,true);assert.equal(value.site,'C');assert.equal(value.staffRole,'supervisor');
      assert.equal(value.staffScope,JSON.stringify(['a','c','linked-c']));
      assert.ok(!/password|credential_staff_id|account_id/.test(JSON.stringify(value)));
    }finally{if(server?.listening) await new Promise(done=>server.close(done));await f.close();}
  });
}
