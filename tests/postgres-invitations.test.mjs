import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {provisionStaffCredential,authenticateStaff,requireSession} from '../server/postgres/auth.mjs';
import * as invites from '../server/postgres/invitations.mjs';
import {openMail} from '../server/auth-mail.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {AUTH_MAIL_QUEUE_LIMIT} from '../server/auth-mail-budget.mjs';
import {requestRecovery} from '../server/postgres/account-recovery.mjs';
const password='Synthetic-invitation-password-123';
const options={schema:'understood_test_invitations'};
const mail={available:true,key:Buffer.alloc(32,7),publicOrigin:'http://127.0.0.1:3140'};
const owner={principal_type:'staff',principal_id:'owner',org_id:'a',site_id:'a',role:'owner',access_mode:'credential'};
const input=(email='recipient@example.test',role='supervisor')=>({requestId:randomUUID(),name:'Synthetic recipient',email,role,confirmed:true});
const change=revision=>({requestId:randomUUID(),revision,confirmed:true});
const signup=(token,requestId=randomUUID())=>({requestId,token,password,confirmation:password});
async function fixture() {
  const db=new PGlite();let queue=Promise.resolve(),failAction=null;
  const pool={async connect(){const previous=queue;let release;queue=new Promise(done=>{release=done;});await previous;
    return {release,async query(sql,values){if(failAction && sql.startsWith('INSERT INTO audit') && values?.includes(failAction)) throw new Error('Injected private invitation audit');
      return values?.length ? db.query(sql,values) : (await db.exec(sql)).at(-1) || {rows:[]};}};
  }};
  await db.exec(`CREATE SCHEMA ${options.schema};SET search_path TO ${options.schema},pg_catalog`);await runMigrations(pool,options);
  const q=async(sql,values=[])=> (await db.query(sql,values)).rows;
  await q("INSERT INTO organizations VALUES('a','Organization A'),('b','Organization B')");
  await q("INSERT INTO sites VALUES('a','a','Site A','UTC'),('b','b','Site B','UTC')");
  await q("INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','a','a','Owner','owner'),('admin','a','a','Administrator','administrator'),('recipient','b','b','Recipient home','auditor')");
  await provisionStaffCredential(pool,{staffId:'owner',orgId:'a',siteId:'a',email:'owner@example.test',password},options);
  await provisionStaffCredential(pool,{staffId:'admin',orgId:'a',siteId:'a',email:'admin@example.test',password},options);
  const issue=value=>invites.issueInvitation(pool,owner,value,mail,options);
  const update=(id,action,value)=>invites.changeInvitation(pool,owner,id,action,value,mail,options);
  const deliver=async(send)=>{let message;await invites.processOneInvitation(pool,mail,{...options,send:async(c,id,value)=>{message=value;return send ? send(c,id,value) : {providerId:'synthetic'};}});
    return message?.text.match(/#accept-invitation\/([A-Za-z0-9_-]{43})/)[1];};
  const accept=(token,request=signup(token))=>invites.acceptInvitation(pool,null,'signup',request,'synthetic-ip',mail,options);
  return {db,pool,q,issue,update,deliver,accept,fail(action){failAction=action;}};
}
test('PostgreSQL shared mail backlog rolls back invitation issue and reserves one-for-one resend capacity',async()=>{
  const f=await fixture();try {
    await f.q(`INSERT INTO staff_recovery_mail(id,purpose,email_hash,expires_at,state)
      SELECT 'capacity-'||n,'reset',repeat('a',64),clock_timestamp()+interval '1 hour','queued' FROM generate_series(1,$1) n`,[AUTH_MAIL_QUEUE_LIMIT]);
    const value=input();await assert.rejects(f.issue(value),/Email delivery unavailable/);
    assert.equal((await f.q('SELECT count(*)::int n FROM staff_invitations'))[0].n,0);
    assert.equal((await invites.invitationReceipt(f.pool,owner,value.requestId,options)).accepted,false);
    assert.equal((await f.q("SELECT count(*)::int n FROM audit WHERE action='staff.invitation_issued'"))[0].n,0);
    await f.q("UPDATE staff_recovery_mail SET state='failed' WHERE id='capacity-1'");
    const issued=await f.issue(value);assert.equal((await f.issue(value)).duplicate,true);
    await requestRecovery(f.pool,{email:'cannot-enqueue@example.test'},'capacity-ip',mail,options);
    assert.equal((await f.q('SELECT COUNT(*)::int n FROM staff_recovery_mail'))[0].n,AUTH_MAIL_QUEUE_LIMIT);
    assert.equal((await f.update(issued.id,'resend',change(1))).revision,2);
    assert.equal((await f.q("SELECT count(*)::int n FROM staff_invitation_mail WHERE state IN ('queued','processing')"))[0].n,1);
  }finally {await f.db.close();}
});

test('PostgreSQL invitation issue, private paging, exact replay and new-account acceptance are atomic',async()=>{
  const f=await fixture();try {
    const value=input(),issued=await f.issue(value);assert.equal(issued.delivery,'queued');assert.equal((await f.issue(value)).duplicate,true);
    const row=(await f.q('SELECT * FROM staff_invitations'))[0];assert.equal(openMail(mail,row.id,row.email_payload).email,value.email);assert.ok(!JSON.stringify(row).includes(value.email));
    assert.equal((await f.q('SELECT count(*)::int n FROM staff_invitation_tokens'))[0].n,0);
    for(let index=0;index<5;index++) await f.issue(input(`page-${index}@example.test`));
    const page=await invites.listInvitations(f.pool,owner,{page:2},options);assert.equal(page.total,6);assert.equal(page.items.length,1);assert.ok(!/payload|email_hash|token_hash/.test(JSON.stringify(page)));
    const token=await f.deliver(),request=signup(token),preview=await invites.previewInvitation(f.pool,{token},'preview-ip',options);assert.equal(preview.site,'Site A');
    const [a,b]=await Promise.all([f.accept(token,request),f.accept(token,request)]);assert.equal(a.staffId,b.staffId);assert.equal(Number(a.duplicate)+Number(b.duplicate),1);
    const principal=(await authenticateStaff(f.pool,value.email,password,'login-ip',options)).principal;assert.equal(principal.role,'supervisor');assert.equal(principal.site_id,'a');
    assert.equal((await f.q('SELECT count(*)::int n FROM staff_invitation_acceptances'))[0].n,1);
    await assert.rejects(f.accept(token),/Invitation unavailable/);
    await assert.rejects(f.accept(token,{...request,password:password+'wrong',confirmation:password+'wrong'}),/Invitation unavailable/);
    await assert.rejects(f.q("UPDATE staff_invitation_acceptances SET kind='existing'"),/immutable/);
    await assert.rejects(f.q('UPDATE staff_invitation_tokens SET used_at=NULL WHERE token_hash IN(SELECT token_hash FROM staff_invitation_acceptances)'),/immutable/);
    assert.equal((await f.q('SELECT email_payload FROM staff_invitations WHERE id=$1',[issued.id]))[0].email_payload,null);
  }finally {await f.db.close();}
});
test('PostgreSQL existing-account acceptance preserves passwords and cannot reuse revoked sessions or grant elevated roles',async()=>{
  const f=await fixture();try {
    await provisionStaffCredential(f.pool,{staffId:'recipient',orgId:'b',siteId:'b',email:'recipient@example.test',password},options);
    const login=await authenticateStaff(f.pool,'recipient@example.test',password,'login-ip',options);
    const actor=await requireSession(f.pool,{headers:{cookie:`understood_session=${login.session.token}`}},options);
    const credential=(await f.q("SELECT * FROM staff_credentials WHERE staff_id='recipient'"))[0];
    const value=input();await f.issue(value);const token=await f.deliver();await assert.rejects(f.accept(token),/Sign in to accept/);
    const request={requestId:randomUUID(),token};await f.q("UPDATE sessions SET revoked_at=clock_timestamp() WHERE principal_id='recipient'");
    await assert.rejects(invites.acceptInvitation(f.pool,actor,'existing',request,'synthetic-ip',mail,options),/Sign in to accept/);
    const fresh=await authenticateStaff(f.pool,'recipient@example.test',password,'login-ip',options),current=await requireSession(f.pool,{headers:{cookie:`understood_session=${fresh.session.token}`}},options);
    const result=await invites.acceptInvitation(f.pool,current,'existing',request,'synthetic-ip',mail,options);assert.equal(result.signInRequired,false);
    assert.equal((await invites.acceptInvitation(f.pool,current,'existing',request,'synthetic-ip',mail,options)).duplicate,true);
    assert.deepEqual((await f.q("SELECT * FROM staff_credentials WHERE staff_id='recipient'"))[0],credential);assert.equal((await f.q("SELECT role FROM staff WHERE id='recipient'"))[0].role,'auditor');
    assert.equal((await f.q('SELECT role FROM staff WHERE id=$1',[result.staffId]))[0].role,'supervisor');
    assert.equal((await f.q("SELECT count(*)::int n FROM staff_account_memberships WHERE account_id='recipient'"))[0].n,2);
    await assert.rejects(f.issue(input()),/already has a site membership/);
    for(const role of ['owner','administrator']) await assert.rejects(invites.issueInvitation(f.pool,{...owner,principal_id:'admin',role:'administrator'},input(`forbidden-${role}@example.test`,role),mail,options),/Forbidden/);
    assert.equal((await invites.listInvitations(f.pool,current,{},options)).total,0);
  }finally {await f.db.close();}
});
test('PostgreSQL resend, cancellation and authority epochs fence old links and inflight provider acknowledgements',async()=>{
  const f=await fixture();try {
    const value=input();await f.issue(value);const token=await f.deliver();
    await f.q("UPDATE staff_accounts SET active=false WHERE id='owner'");await f.q("UPDATE staff_accounts SET active=true WHERE id='owner'");
    await assert.rejects(invites.previewInvitation(f.pool,{token},'preview-ip',options),/Invitation unavailable/);
    const request=change(1);assert.equal((await f.update(value.requestId,'resend',request)).revision,2);assert.equal((await f.update(value.requestId,'resend',request)).duplicate,true);
    const fresh=await f.deliver();assert.notEqual(fresh,token);await assert.rejects(f.accept(token),/Invitation unavailable/);
    assert.equal((await invites.previewInvitation(f.pool,{token:fresh},'preview-ip',options)).role,'supervisor');
    const cancelled=change(2);await f.update(value.requestId,'cancel',cancelled);assert.equal((await f.update(value.requestId,'cancel',cancelled)).duplicate,true);await assert.rejects(f.accept(fresh),/Invitation unavailable/);
    const second=input('inflight@example.test');await f.issue(second);await f.deliver(async()=>{await f.update(second.requestId,'cancel',change(1));return {providerId:'late'};});
    const job=(await f.q('SELECT state,provider_id,payload FROM staff_invitation_mail WHERE invitation_id=$1',[second.requestId]))[0];assert.deepEqual(job,{state:'ignored',provider_id:null,payload:null});
    const third=input('authority@example.test');await f.issue(third);const thirdToken=await f.deliver();await f.q("UPDATE staff SET role='auditor' WHERE id='owner'");await assert.rejects(f.accept(thirdToken),/Invitation unavailable/);
  }finally {await f.db.close();}
});
test('PostgreSQL invitation rollback, stable delivery retries, corrupt envelopes and expired read status are private and bounded',async()=>{
  const f=await fixture();try {
    f.fail('staff.invitation_issued');await assert.rejects(f.issue(input()),/Injected/);assert.equal((await f.q('SELECT count(*)::int n FROM staff_invitations'))[0].n,0);f.fail(null);
    const value=input();await f.issue(value);f.fail('staff.invitation_prepared');await assert.rejects(f.deliver(),/Injected/);assert.equal((await f.q('SELECT count(*)::int n FROM staff_invitation_tokens'))[0].n,0);f.fail(null);
    const deliveries=[];const failure=async(c,id,message)=>{deliveries.push({id,message});throw new Error('Synthetic provider failure');};const token=await f.deliver(failure);
    await f.q("UPDATE staff_invitation_mail SET next_at='2000-01-01'");await f.deliver(failure);assert.deepEqual(deliveries[1],deliveries[0]);
    f.fail('staff.invitation_accepted');await assert.rejects(f.accept(token),/Injected/);assert.equal((await f.q('SELECT count(*)::int n FROM staff_invitation_acceptances'))[0].n,0);assert.equal((await f.q('SELECT used_at FROM staff_invitation_tokens'))[0].used_at,null);f.fail(null);
    await f.q("UPDATE staff_invitation_mail SET payload='corrupt',next_at='2000-01-01'");assert.equal(await f.deliver(async()=>assert.fail('Must not deliver corrupt envelope')),undefined);
    assert.equal((await f.q('SELECT state,payload FROM staff_invitation_mail'))[0].state,'failed');
    await f.q("UPDATE staff_invitations SET expires_at='2000-01-01' WHERE id=$1",[value.requestId]);
    assert.equal((await invites.listInvitations(f.pool,owner,{status:'expired'},options)).total,1);assert.equal((await f.q('SELECT state FROM staff_invitations'))[0].state,'pending');
    await invites.expireInvitations(f.pool,options);assert.equal((await f.q('SELECT state,email_payload FROM staff_invitations'))[0].state,'expired');
    await assert.rejects(f.accept(token),/Invitation unavailable/);assert.equal((await f.issue(input())).delivery,'queued');
  }finally {await f.db.close();}
});

test('PostgreSQL invitation HTTP shares the private route, origin, receipt and no-auto-login contract',async()=>{
  const f=await fixture(),server=createPostgresRehearsalServer(f.pool,{tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',...options,publicOrigin:mail.publicOrigin,mail});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
  const login=await authenticateStaff(f.pool,'owner@example.test',password,'login-ip',options),cookie=`understood_pg_rehearsal=${login.session.token}`;
  const call=(path,body,actor='',origin=mail.publicOrigin)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json',origin,...(actor ? {cookie:actor} : {})},body:JSON.stringify(body)});
  try {
    const value=input();assert.equal((await call('/api/settings/invitations',value)).status,401);
    assert.equal((await call('/api/settings/invitations',value,cookie,'https://foreign.test')).status,403);
    assert.equal((await call('/api/settings/invitations',{...value,siteId:'b'},cookie)).status,400);
    const issued=await call('/api/settings/invitations',value,cookie);assert.equal(issued.status,202);assert.equal((await issued.json()).delivery,'queued');
    assert.equal((await call('/api/settings/invitations',value,cookie)).status,200);
    const receipt=await fetch(url+`/api/settings/invitations/receipts/${value.requestId}`,{headers:{cookie}});assert.equal((await receipt.json()).accepted,true);
    const token=await f.deliver(),preview=await call('/api/auth/invitations/preview',{token});assert.equal(preview.status,200);assert.equal(preview.headers.get('referrer-policy'),'no-referrer');assert.ok(!JSON.stringify(await preview.json()).includes(value.email));
    assert.equal((await call('/api/auth/invitations/preview?token='+token,{token})).status,400);
    assert.equal((await call('/api/auth/invitations/accept',{token,requestId:randomUUID()})).status,401);
    assert.equal((await call('/api/auth/invitations/signup',signup(token),cookie)).status,401);
    const request=signup(token),accepted=await call('/api/auth/invitations/signup',request);assert.equal(accepted.status,200);assert.match(accepted.headers.get('set-cookie'),/understood_pg_rehearsal=.*Max-Age=0/);
    assert.equal((await accepted.json()).signInRequired,true);assert.equal((await call('/api/auth/invitations/signup',request)).status,200);
    assert.equal((await fetch(url+'/api/session')).status,200);assert.equal((await (await fetch(url+'/api/session')).json()).authenticated,false);
    f.fail('staff.invitation_issued');const failed=await call('/api/settings/invitations',input('rollback@example.test'),cookie);assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private'));
  }finally {await new Promise(resolve=>server.close(resolve));await f.db.close();}
});
