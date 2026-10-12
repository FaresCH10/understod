import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {openDatabase,NOW} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {provisionStaffCredential,authenticateStaff,createSession,requireSession} from '../server/auth.mjs';
import {requestRecovery,processOneRecovery,resetPassword,expireRecovery,ensureRecoverySchema} from '../server/account-recovery.mjs';
import {resolveMailConfig,sealMail,openMail,sendAuthMail} from '../server/auth-mail.mjs';
import {createAppServer} from '../server/index.mjs';
import {AUTH_MAIL_QUEUE_LIMIT} from '../server/auth-mail-budget.mjs';

const email='maya@example.test',password='synthetic old password',replacement='synthetic new password';
const mailOptions={mode:'resend',apiKey:'re_synthetic_key',from:'support@example.test',key:'01'.repeat(32),publicOrigin:'http://127.0.0.1:3020',allowLocal:true};
const config=resolveMailConfig(mailOptions);
function fixture() {const db=openDatabase(':memory:');seed(db);provisionStaffCredential(db,'maya',email,password);ensureRecoverySchema(db);return db;}
async function deliver(db,recipient=email) {
  requestRecovery(db,{email:recipient},randomBytes(6).toString('hex'),config);let token;
  await processOneRecovery(db,config,{send:async(c,id,msg)=>{token=msg.text.match(/reset-password\/([A-Za-z0-9_-]{43})/)?.[1];return {providerId:'synthetic-delivery'};}});return token;
}
const reset=(db,token,pw=replacement)=>resetPassword(db,{token,password:pw,confirmation:pw},randomBytes(6).toString('hex'),config);

test('blocked recovery IP cannot grow counters or enqueue varied recipients',()=>{
  const db=fixture();try {
    for(let n=0;n<5;n++) requestRecovery(db,{email:`unknown-${n}@example.test`},'blocked-ip',config);
    const before=JSON.stringify(db.prepare('SELECT * FROM auth_attempts ORDER BY key_hash').all());
    for(let n=5;n<30;n++) assert.deepEqual(requestRecovery(db,{email:`unknown-${n}@example.test`},'blocked-ip',config),{accepted:true,delivery:'queued'});
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM auth_attempts ORDER BY key_hash').all()),before);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM staff_recovery_mail').get().n,5);
  }finally {db.close();}
});

test('full recovery outbox denies enqueues generically and rolls back password change until notice capacity is available',async()=>{
  const db=fixture();try {
    const token=await deliver(db),now=NOW(),expiry=new Date(Date.now()+3600000).toISOString();
    const insert=db.prepare("INSERT INTO staff_recovery_mail VALUES(?,'reset',?,NULL,?,?,?,'queued',0,NULL,NULL,NULL)");
    for(let n=0;n<AUTH_MAIL_QUEUE_LIMIT;n++) insert.run(`capacity-${n}`,'a'.repeat(64),now,expiry,now);
    const before=JSON.stringify(db.prepare('SELECT * FROM staff_credentials').all());
    assert.deepEqual(requestRecovery(db,{email:'unknown-capacity@example.test'},'capacity-ip',config),{accepted:true,delivery:'queued'});
    assert.equal(db.prepare("SELECT COUNT(*) n FROM staff_recovery_mail WHERE state='queued'").get().n,AUTH_MAIL_QUEUE_LIMIT);
    await assert.rejects(reset(db,token),/Email delivery unavailable/);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM staff_credentials').all()),before);
    assert.equal(db.prepare('SELECT used_at FROM staff_recovery_tokens').get().used_at,null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE action='credential.recovered'").get().n,0);
    db.prepare("UPDATE staff_recovery_mail SET state='failed' WHERE id='capacity-0'").run();
    assert.deepEqual(await reset(db,token),{completed:true,signInRequired:true});
    assert.equal(db.prepare("SELECT COUNT(*) n FROM staff_recovery_mail WHERE state IN ('queued','processing')").get().n,AUTH_MAIL_QUEUE_LIMIT);
  }finally {db.close();}
});

test('recovery mail config, encrypted envelopes and provider contract do not expose private errors',async()=>{
  assert.deepEqual(resolveMailConfig({mode:'disabled'}),{available:false});
  for(const override of [{key:'bad'},{apiKey:'bad'},{from:'a@example.test\r\nBcc:x@example.test'},{publicOrigin:'https://safe.test/attack'},{publicOrigin:'http://evil.test'}]) assert.throws(()=>resolveMailConfig({...mailOptions,...override}),/configuration/);
  const id='00000000-0000-0000-0000-000000000001',value={email,subject:'Reset your Understood password',text:'Synthetic message'};
  const encrypted=sealMail(config,id,value);assert(!encrypted.includes(email));assert.deepEqual(openMail(config,id,encrypted),value);
  assert.throws(()=>openMail(config,'different-id',encrypted),/unavailable/);assert.throws(()=>openMail({...config,key:Buffer.alloc(32)},id,encrypted),/unavailable/);
  let call;assert.deepEqual(await sendAuthMail(config,id,value,async(url,options)=>{call={url,options};return new Response(JSON.stringify({id:'mail-001'}));}),{providerId:'mail-001'});
  assert.equal(call.url,'https://api.resend.com/emails');assert.equal(call.options.redirect,'error');assert.equal(call.options.headers['idempotency-key'],`auth/${id}`);
  assert.deepEqual(JSON.parse(call.options.body),{from:config.from,to:[email],subject:value.subject,text:value.text});
  for(const fake of [async()=>new Response('private error with key',{status:429}),async()=>new Response('bad'),async()=>new Response('x'.repeat(5000)),async()=>{throw new Error('private secret');}]) await assert.rejects(sendAuthMail(config,id,value,fake),/^Error: Email delivery could not be confirmed$/);
});

test('recovery request is generic, deferred, encrypted, bounded and never public token delivery',async()=>{
  const db=fixture();try {
    assert.deepEqual(requestRecovery(db,{email},'same-ip',config),requestRecovery(db,{email:'unknown@example.test'},'other-ip',config));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM staff_recovery_tokens').get().n,0);
    assert(!JSON.stringify(db.prepare('SELECT * FROM staff_recovery_mail').all()).includes(email));
    let sent=0;while(await processOneRecovery(db,config,{send:async()=>{sent++;return {providerId:'synthetic'};}})) {}
    assert.equal(sent,1);assert.equal(db.prepare("SELECT COUNT(*) n FROM staff_recovery_mail WHERE state='ignored'").get().n,1);
    for(let i=0;i<9;i++) assert.deepEqual(requestRecovery(db,{email},'limited-ip',config),{accepted:true,delivery:'queued'});
    assert.equal(db.prepare('SELECT COUNT(*) n FROM staff_recovery_mail').get().n,6);
    assert.throws(()=>requestRecovery(db,{email,orgId:'forged'},'x',config),/Invalid/);
    assert.throws(()=>requestRecovery(db,{email},'x',{available:false}),/unavailable/);
    const before=db.prepare('SELECT password_hash FROM staff_credentials WHERE staff_id=?').get('maya');
    assert.deepEqual(authenticateStaff(db,email,password).id,'maya');assert.deepEqual(db.prepare('SELECT password_hash FROM staff_credentials WHERE staff_id=?').get('maya'),before);
  }finally {db.close();}
});

test('one-use recovery changes only the scoped password, revokes all sessions and queues a private notice',async()=>{
  const db=fixture();try {
    const old=createSession(db,{id:'maya',org_id:'cedar',site_id:'beirut'},'staff','credential');
    const token=await deliver(db);assert(token);const token2=await deliver(db);assert(token2);
    const before=JSON.stringify(db.prepare('SELECT * FROM publications').all());
    assert.deepEqual(await reset(db,token),{completed:true,signInRequired:true});
    assert.throws(()=>requireSession(db,{headers:{cookie:`understood_session=${old.token}`}},{accessMode:'credential'}),/Sign in/);
    assert.throws(()=>authenticateStaff(db,email,password),/Invalid credentials/);assert.equal(authenticateStaff(db,email,replacement).id,'maya');
    await assert.rejects(reset(db,token),/Invalid recovery/);await assert.rejects(reset(db,token2),/Invalid recovery/);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM publications').all()),before);
    let notice;await processOneRecovery(db,config,{send:async(c,id,msg)=>{notice=msg;return {providerId:'notice'};}});
    assert.equal(notice.subject,'Your Understood password was changed');assert(!notice.text.includes(replacement));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE action='credential.recovered'").get().n,1);
  }finally {db.close();}
});

test('expired, revoked, rotated, disabled and restored staff recovery links cannot gain access',async()=>{
  for(const action of ['expire','revoke','rotate','disable','restore','role']) {
    const db=fixture();try {
      const token=await deliver(db);
      if(action==='expire') {db.prepare('UPDATE staff_recovery_tokens SET expires_at=?').run('2000-01-01');db.prepare("UPDATE staff_recovery_mail SET expires_at=?").run('2000-01-01');expireRecovery(db);}
      if(action==='revoke') db.prepare('UPDATE staff_recovery_tokens SET revoked_at=?').run(NOW());
      if(action==='rotate') provisionStaffCredential(db,'maya',email,'other synthetic password');
      if(['disable','restore'].includes(action)) {db.prepare("UPDATE staff SET active=0 WHERE id='maya'").run();if(action==='restore') db.prepare("UPDATE staff SET active=1 WHERE id='maya'").run();}
      if(action==='role') db.prepare("UPDATE staff SET role='supervisor' WHERE id='maya'").run();
      await assert.rejects(reset(db,token),/Invalid recovery/);assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE action='credential.recovered'").get().n,0);
    }finally {db.close();}
  }
});

test('delivery retries retain the exact encrypted link and provider key, while stale completion cannot commit',async()=>{
  const db=fixture();try {
    requestRecovery(db,{email},'ip',config);let original,id;
    await processOneRecovery(db,config,{send:async(c,i,msg)=>{original=msg;id=i;throw new Error('Unknown external acknowledgement');}});
    const retry=db.prepare('SELECT * FROM staff_recovery_mail WHERE id=?').get(id);assert.equal(retry.state,'queued');assert.equal(retry.attempts,1);assert(!retry.payload.includes(email));
    db.prepare('UPDATE staff_recovery_mail SET next_at=? WHERE id=?').run('2000-01-01',id);
    await processOneRecovery(db,config,{send:async(c,i,msg)=>{assert.equal(i,id);assert.deepEqual(msg,original);db.prepare('UPDATE staff_recovery_mail SET lease_token=? WHERE id=?').run('newer-lease',id);return {providerId:'old-result'};}});
    assert.equal(db.prepare('SELECT provider_id FROM staff_recovery_mail WHERE id=?').get(id).provider_id,null);
    db.prepare('UPDATE staff_recovery_mail SET lease_until=? WHERE id=?').run('2000-01-01',id);
    await processOneRecovery(db,config,{send:async(c,i,msg)=>{assert.deepEqual(msg,original);return {providerId:'final'};}});
    assert.deepEqual({...db.prepare('SELECT state,attempts,payload,provider_id FROM staff_recovery_mail WHERE id=?').get(id)},{state:'sent',attempts:3,payload:null,provider_id:'final'});
  }finally {db.close();}
});

test('recovery audit failure rolls back credential, token consumption, notices and session changes',async()=>{
  const db=fixture();try {
    const token=await deliver(db);const session=createSession(db,{id:'maya',org_id:'cedar',site_id:'beirut'},'staff','credential');
    db.exec("CREATE TRIGGER fail_recovery_audit BEFORE INSERT ON audit WHEN NEW.action='credential.recovered' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;");
    await assert.rejects(reset(db,token),/audit failure/);assert.equal(authenticateStaff(db,email,password).id,'maya');assert.equal(db.prepare("SELECT used_at FROM staff_recovery_tokens").get().used_at,null);
    assert.equal(requireSession(db,{headers:{cookie:`understood_session=${session.token}`}},{accessMode:'credential'}).principal_id,'maya');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM staff_recovery_mail WHERE purpose='notice'").get().n,0);
    db.exec('DROP TRIGGER fail_recovery_audit');assert.equal((await reset(db,token)).completed,true);
  }finally {db.close();}
});

test('recovery preparation audit failure leaves no token or delivery and simultaneous resets consume once',async()=>{
  const db=fixture();try {
    requestRecovery(db,{email},'prepare-fixture',config);
    db.exec("CREATE TRIGGER fail_recovery_prepare BEFORE INSERT ON audit WHEN NEW.action='credential.recovery_queued' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;");
    await assert.rejects(processOneRecovery(db,config,{send:async()=>assert.fail('Uncommitted recovery must not be sent')}),/audit failure/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM staff_recovery_tokens').get().n,0);
    assert.deepEqual({...db.prepare('SELECT state,attempts FROM staff_recovery_mail').get()},{state:'queued',attempts:0});
    db.exec('DROP TRIGGER fail_recovery_prepare');let token;
    await processOneRecovery(db,config,{send:async(c,id,message)=>{token=message.text.match(/reset-password\/([A-Za-z0-9_-]{43})/)[1];return {providerId:'synthetic-only'};}});
    const results=await Promise.allSettled([reset(db,token),reset(db,token)]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.match(results.find(result=>result.status==='rejected').reason.message,/Invalid recovery/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE action='credential.recovered'").get().n,1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM staff_recovery_mail WHERE purpose='notice'").get().n,1);
  }finally {db.close();}
});

test('corrupt private recovery envelopes fail closed without delivery and purge the payload',async()=>{
  const db=fixture();try {
    requestRecovery(db,{email},'corrupt-fixture',config);
    db.prepare('UPDATE staff_recovery_mail SET payload=?').run('corrupt-encrypted-envelope');
    assert.equal(await processOneRecovery(db,config,{send:async()=>assert.fail('Corrupt mail must not be sent')}),true);
    assert.deepEqual({...db.prepare('SELECT state,payload,lease_token,lease_until FROM staff_recovery_mail').get()},{state:'failed',payload:null,lease_token:null,lease_until:null});
    assert.equal(db.prepare('SELECT COUNT(*) n FROM staff_recovery_tokens').get().n,0);
  }finally {db.close();}
});

test('credential recovery HTTP requires origin, rejects forged input and has no public delivery receipt or token',async()=>{
  const db=fixture(),server=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',mail:mailOptions});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
  try {
    const call=(path,body,origin=config.publicOrigin)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
    assert.equal((await call('/api/auth/recovery',{email},'https://other.test')).status,403);
    const response=await call('/api/auth/recovery',{email});assert.equal(response.status,202);assert.deepEqual(await response.json(),{accepted:true,delivery:'queued'});
    assert.equal((await call('/api/auth/recovery?token=forged',{email})).status,400);
    assert.equal((await call('/api/auth/recovery',{email,role:'owner'})).status,400);
    assert.equal((await fetch(url+'/api/auth/recovery')).status,401);
    let token;await processOneRecovery(db,config,{send:async(c,id,msg)=>{token=msg.text.match(/reset-password\/([A-Za-z0-9_-]{43})/)[1];return {providerId:'synthetic'};}});
    const resetResponse=await call('/api/auth/reset-password',{token,password:replacement,confirmation:replacement});assert.equal(resetResponse.status,200);assert.match(resetResponse.headers.get('set-cookie'),/Max-Age=0/);
    assert.equal((await call('/api/auth/reset-password',{token,password:replacement,confirmation:replacement})).status,400);
  }finally {await new Promise(resolve=>server.close(resolve));db.close();}
});
