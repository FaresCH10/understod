import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { createPostgresPool } from '../server/postgres/db.mjs';
import { runMigrations,verifyMigrations } from '../server/postgres/migrate.mjs';
import { domainTransaction,publish,submitAnswer,withdrawPublication } from '../server/postgres/domain.mjs';
import { provisionStaffCredential,issueWorkerGrant,redeemWorkerGrant,authenticateStaff,requireSession } from '../server/postgres/auth.mjs';
import {linkAccountMembership,switchAccountSite} from '../server/postgres/accounts.mjs';
import { processOneAssessment } from '../server/postgres/assessment-worker.mjs';
import { syntheticAssessmentAdapter } from '../server/postgres/runtime.mjs';
import { CANONICAL_SOURCE,syntheticPrepare } from '../server/domain.mjs';
import {createInvoice,recordPayment,voidInvoice,getInvoice} from '../server/postgres/billing.mjs';
import {changeStaff,listStaff} from '../server/postgres/staff.mjs';
import {requestRecovery,resetPassword,processOneRecovery} from '../server/postgres/account-recovery.mjs';
import {issueInvitation,acceptInvitation,changeInvitation,processOneInvitation} from '../server/postgres/invitations.mjs';
import {tokenHash,passwordMatches} from '../server/auth-crypto.mjs';
import {consumeAuthBudget} from '../server/postgres/auth-budget.mjs';
import {AUTH_GLOBAL_KEY,AUTH_GLOBAL_LIMIT,AUTH_KEY_LIMIT} from '../server/auth-budget.mjs';
import {authMailCapacity} from '../server/postgres/auth-mail-budget.mjs';
import {AUTH_MAIL_QUEUE_LIMIT} from '../server/auth-mail-budget.mjs';

const connectionString=process.env.UNDERSTOOD_PG_TEST_URL;
let target;
try {target=connectionString ? new URL(connectionString) : null;} catch {throw new Error('Invalid isolated PostgreSQL test URL');}
const allowed=target && ['localhost','127.0.0.1','::1','[::1]'].includes(target.hostname)
  && /test/i.test(decodeURIComponent(target.pathname));
if (connectionString && !allowed) throw new Error('Concurrency tests require an explicitly local test database');

test('real PostgreSQL public authentication and mixed mail admissions cannot oversubscribe',{skip:!allowed,timeout:60000},async()=>{
  const pool=await createPostgresPool({connectionString,tls:false}),schema=`understood_budget_${randomBytes(5).toString('hex')}`;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);await runMigrations(pool,{schema});
    const first=await pool.connect(),second=await pool.connect();
    try {assert.notEqual((await first.query('SELECT pg_backend_pid() pid')).rows[0].pid,(await second.query('SELECT pg_backend_pid() pid')).rows[0].pid);}
    finally {first.release();second.release();}
    const tx=fn=>domainTransaction(pool,schema,fn);
    await tx(client=>client.query('INSERT INTO auth_attempts VALUES($1,$2,clock_timestamp())',[AUTH_GLOBAL_KEY,AUTH_GLOBAL_LIMIT-1]));
    const globalRace=await Promise.all([0,1].map(n=>tx(client=>consumeAuthBudget(client,[tokenHash(`race-${n}`)],5))));
    assert.equal(globalRace.filter(Boolean).length,1);
    await tx(async client=>{
      assert.equal((await client.query('SELECT count FROM auth_attempts WHERE key_hash=$1',[AUTH_GLOBAL_KEY])).rows[0].count,AUTH_GLOBAL_LIMIT);
      await client.query('DELETE FROM auth_attempts');
      await client.query('INSERT INTO auth_attempts VALUES($1,0,clock_timestamp())',[AUTH_GLOBAL_KEY]);
      await client.query('INSERT INTO auth_attempts SELECT md5(n::text)||md5(n::text),1,clock_timestamp() FROM generate_series(1,$1) n',[AUTH_KEY_LIMIT-2]);
    });
    const keyRace=await Promise.all([0,1].map(n=>tx(client=>consumeAuthBudget(client,[tokenHash(`key-race-${n}`)],5))));
    assert.equal(keyRace.filter(Boolean).length,1);
    await tx(async client=>{
      assert.equal((await client.query('SELECT count(*)::int n FROM auth_attempts')).rows[0].n,AUTH_KEY_LIMIT);
      await client.query(`INSERT INTO staff_recovery_mail(id,purpose,email_hash,expires_at,state)
        SELECT 'capacity-'||n,'reset',repeat('a',64),clock_timestamp()+interval '1 hour','queued' FROM generate_series(1,$1) n`,[AUTH_MAIL_QUEUE_LIMIT-1]);
      await client.query("INSERT INTO organizations VALUES('a','A')");await client.query("INSERT INTO sites VALUES('a','a','A','UTC')");
      await client.query("INSERT INTO staff(id,org_id,site_id,name,role) VALUES('s','a','a','S','owner')");
      await client.query(`INSERT INTO staff_invitations(id,org_id,site_id,name,role,email_hash,email_hint,email_payload,issuer_id,issuer_revision,issuer_account_revision,state,revision,expires_at)
        VALUES('i','a','a','I','auditor',repeat('b',64),'b***@example.test','synthetic','s',1,1,'pending',1,clock_timestamp()+interval '1 hour')`);
    });
    const mailRace=await Promise.all(['recovery','invitation'].map(type=>tx(async client=>{
      if(!await authMailCapacity(client)) return false;
      if(type==='recovery') await client.query("INSERT INTO staff_recovery_mail(id,purpose,email_hash,expires_at,state) VALUES('race-mail','reset',repeat('a',64),clock_timestamp()+interval '1 hour','queued')");
      else await client.query("INSERT INTO staff_invitation_mail(id,invitation_id,generation,expires_at,state) VALUES('race-invitation','i',1,clock_timestamp()+interval '1 hour','queued')");
      return true;
    })));
    assert.equal(mailRace.filter(Boolean).length,1);
    await tx(async client=>assert.equal(await authMailCapacity(client),false));
  }finally {await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
});

test('real PostgreSQL concurrent grant redemption, publication, receipts and assessment commit once',{skip:!allowed,timeout:60000},async () => {
  const pool=await createPostgresPool({connectionString,tls:false});
  const schema=`understood_test_${randomBytes(5).toString('hex')}`;
  const options={schema,integrationMode:'synthetic'};
  const owner={principal_type:'staff',principal_id:'owner',org_id:'a',site_id:'a',role:'owner'};
  const worker={principal_type:'worker',principal_id:'w',org_id:'a',site_id:'a'};
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);await runMigrations(pool,options);await verifyMigrations(pool,options);
    const first=await pool.connect(),second=await pool.connect();
    try {
      const a=(await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const b=(await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      assert.notEqual(a,b,'The concurrency check needs two actual server connections');
    } finally {first.release();second.release();}
    await domainTransaction(pool,schema,async (client) => {
      await client.query("INSERT INTO organizations(id,name) VALUES ('a','Synthetic A')");
      await client.query("INSERT INTO sites(id,org_id,name,timezone) VALUES ('a','a','Synthetic site','UTC')");
      await client.query("INSERT INTO staff(id,org_id,site_id,name,role) VALUES ('owner','a','a','Synthetic owner','owner')");
      await client.query("INSERT INTO workers(id,org_id,site_id,code,language) VALUES ('w','a','a','001','en')");
      await client.query("INSERT INTO briefings(id,org_id,site_id,title,source,state,prepared_json) VALUES ('b','a','a','Synthetic shelf',$1,'ready',$2)",[CANONICAL_SOURCE,JSON.stringify(syntheticPrepare(CANONICAL_SOURCE))]);
    });
    await provisionStaffCredential(pool,{staffId:'owner',orgId:'a',siteId:'a',email:'synthetic@example.test',password:'isolated-synthetic-password'},options);
    const grant=await issueWorkerGrant(pool,owner,'w',30,options);
    const redemptions=await Promise.allSettled([redeemWorkerGrant(pool,grant.token,options),redeemWorkerGrant(pool,grant.token,options)]);
    assert.equal(redemptions.filter((value) => value.status==='fulfilled').length,1);
    const input={requestId:randomUUID(),revision:1,nextVersion:1,workerIds:['w']};
    const publications=await Promise.all([publish(pool,owner,'b',input,options),publish(pool,owner,'b',input,options)]);
    assert.equal(publications[0].id,publications[1].id);assert.equal(publications.filter((value) => !value.duplicate).length,1);
    const assignment=await domainTransaction(pool,schema,async (client) => (await client.query('SELECT id FROM assignments WHERE publication_id=$1',[publications[0].id])).rows[0].id);
    const submission=randomUUID(),answer='Finished blue; unfinished yellow.';
    const receipts=await Promise.all([submitAnswer(pool,worker,assignment,submission,answer,options),submitAnswer(pool,worker,assignment,submission,answer,options)]);
    assert.equal(receipts[0].id,receipts[1].id);assert.equal(receipts.filter((value) => !value.duplicate).length,1);
    const processed=await Promise.all([processOneAssessment(pool,syntheticAssessmentAdapter,options),processOneAssessment(pool,syntheticAssessmentAdapter,options)]);
    assert.equal(processed.filter(Boolean).length,1);
    await domainTransaction(pool,schema,async (client) => {
      for (const table of ['publications','publication_requests','assignments','attempts','submission_receipts','assessment_jobs'])
        assert.equal((await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n,1,table);
      assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM audit WHERE action='answer.checked'")).rows[0].n,1);
      assert.equal((await client.query('SELECT outcome,assessment_status FROM attempts')).rows[0].outcome,'matched');
    });
    const withdrawal={requestId:randomUUID(),publicationId:publications[0].id,version:1,reason:'Synthetic concurrent withdrawal'};
    const withdrawals=await Promise.all([withdrawPublication(pool,owner,'b',withdrawal,options),withdrawPublication(pool,owner,'b',withdrawal,options)]);
    assert.equal(withdrawals.filter((value) => !value.duplicate).length,1);
    await domainTransaction(pool,schema,async (client) => {
      assert.equal((await client.query('SELECT COUNT(*)::int n FROM publication_withdrawals')).rows[0].n,1);
      assert.equal((await client.query("SELECT COUNT(*)::int n FROM audit WHERE action='briefing.withdrawn'")).rows[0].n,1);
      await client.query("UPDATE briefings SET state='ready' WHERE id='b'");
    });
    const next=await publish(pool,owner,'b',{...input,requestId:randomUUID(),nextVersion:2},options);
    await domainTransaction(pool,schema,async (client) => {await client.query("UPDATE briefings SET state='ready' WHERE id='b'");});
    const race=await Promise.allSettled([
      withdrawPublication(pool,owner,'b',{requestId:randomUUID(),publicationId:next.id,version:2,reason:'Synthetic replacement race'},options),
      publish(pool,owner,'b',{...input,requestId:randomUUID(),nextVersion:3},options),
    ]);
    assert.equal(race[1].status,'fulfilled');
    if(race[0].status==='rejected') assert.match(race[0].reason.message,/no longer current/);
    await domainTransaction(pool,schema,async (client) => {
      assert.equal((await client.query('SELECT state FROM publications WHERE id=$1',[race[1].value.id])).rows[0].state,'published');
      assert.equal((await client.query('SELECT snapshot_json FROM publications WHERE id=$1',[publications[0].id])).rows[0].snapshot_json.source,CANONICAL_SOURCE);
    });
    await domainTransaction(pool,schema,async client=>{await client.query("UPDATE briefings SET state='ready' WHERE id='b'");});
    const confirmations=await Promise.allSettled([1,2].map(()=>publish(pool,owner,'b',{...input,requestId:randomUUID(),nextVersion:4},options)));
    assert.equal(confirmations.filter(result=>result.status==='fulfilled').length,1);
    assert.match(confirmations.find(result=>result.status==='rejected').reason.message,/Draft version changed/);
    const invoiceInput={requestId:randomUUID(),number:'RACE-VOID',description:'Synthetic concurrency invoice',issueDate:'2026-10-01',dueDate:'2026-10-10',amount:'25.00',confirmed:true};
    const invoice=await createInvoice(pool,owner,invoiceInput,options),voidInput={requestId:randomUUID(),number:invoiceInput.number,amount:'25',reason:'Synthetic concurrent void',confirmed:true};
    const voids=await Promise.all([voidInvoice(pool,owner,invoice.id,voidInput,options),voidInvoice(pool,owner,invoice.id,voidInput,options)]);
    assert.equal(voids.filter(row=>!row.duplicate).length,1);assert.equal((await getInvoice(pool,owner,invoice.id,{},options)).status,'void');
    const contested=await createInvoice(pool,owner,{...invoiceInput,requestId:randomUUID(),number:'RACE-PAYMENT'},options);
    const billingRace=await Promise.allSettled([
      voidInvoice(pool,owner,contested.id,{...voidInput,requestId:randomUUID(),number:'RACE-PAYMENT'},options),
      recordPayment(pool,owner,contested.id,{requestId:randomUUID(),amount:'1.00',date:'2026-10-01',reference:'Synthetic race',note:'',confirmed:true},options),
    ]);
    assert.equal(billingRace.filter(row=>row.status==='fulfilled').length,1);
    const rejection=billingRace.find(row=>row.status==='rejected');assert.match(rejection.reason.message,/Only unpaid|voided/);
    const result=await getInvoice(pool,owner,contested.id,{},options);
    assert.ok((result.status==='void' && result.paidCents===0 && result.voidedCents===2500) || (result.status==='partial' && result.paidCents===100 && result.voidedCents===0));
    const mail={available:true,key:Buffer.alloc(32,7),publicOrigin:'http://127.0.0.1:3031'};
    await requestRecovery(pool,{email:'synthetic@example.test'},'127.0.0.1',mail,options);
    let token,sends=0;
    const deliveries=await Promise.all([0,1].map(()=>processOneRecovery(pool,mail,{...options,send:async (_,id,message)=>{
      sends++;token=message.text.match(/#reset-password\/([A-Za-z0-9_-]{43})/)[1];return {providerId:'synthetic-delivery'};
    }})));
    assert.equal(deliveries.filter(Boolean).length,1);assert.equal(sends,1);
    const reset={token,password:'replacement-synthetic-password',confirmation:'replacement-synthetic-password'};
    const resets=await Promise.allSettled([resetPassword(pool,reset,'127.0.0.1',mail,options),resetPassword(pool,reset,'127.0.0.1',mail,options)]);
    assert.equal(resets.filter(row=>row.status==='fulfilled').length,1);
    assert.match(resets.find(row=>row.status==='rejected').reason.message,/Invalid recovery/);
    await domainTransaction(pool,schema,async client=>{
      const row=(await client.query('SELECT * FROM staff_recovery_tokens WHERE token_hash=$1',[tokenHash(token)])).rows[0];
      assert.ok(row.used_at && row.revoked_at);
      assert.equal((await client.query("SELECT COUNT(*)::int n FROM audit WHERE action='credential.recovered'")).rows[0].n,1);
      assert.equal((await client.query("SELECT COUNT(*)::int n FROM staff_recovery_mail WHERE purpose='notice'")).rows[0].n,1);
      assert.equal(await passwordMatches(reset.password,(await client.query("SELECT * FROM staff_credentials WHERE staff_id='owner'")).rows[0]),true);
    });
    await Promise.all(Array.from({length:8},()=>requestRecovery(pool,{email:'unknown@example.test'},'127.0.0.2',mail,options)));
    await domainTransaction(pool,schema,async client=>{
      assert.equal((await client.query('SELECT count FROM auth_attempts WHERE key_hash=$1',[tokenHash('reset-ip:127.0.0.2')])).rows[0].count,5);
      assert.equal((await client.query('SELECT COUNT(*)::int n FROM staff_recovery_mail WHERE email_hash=$1',[tokenHash('reset-email:unknown@example.test')])).rows[0].n,5);
    });
    await domainTransaction(pool,schema,async client=>{
      await client.query("INSERT INTO sites(id,org_id,name,timezone) VALUES('secondary','a','Secondary synthetic site','UTC')");
      await client.query("INSERT INTO staff(id,org_id,site_id,name,role) VALUES('linked','a','secondary','Linked synthetic supervisor','supervisor')");
      await linkAccountMembership(client,'owner','linked');
    });
    const login=await authenticateStaff(pool,'synthetic@example.test',reset.password,'127.0.0.3',options);
    const req={headers:{cookie:`understood_session=${login.session.token}`}};
    const switches=await Promise.allSettled([switchAccountSite(pool,req,{staffId:'linked'},options),switchAccountSite(pool,req,{staffId:'linked'},options)]);
    assert.equal(switches.filter(row=>row.status==='fulfilled').length,1);
    assert.match(switches.find(row=>row.status==='rejected').reason.message,/Sign in required/);
    const selected={headers:{cookie:`understood_session=${switches.find(row=>row.status==='fulfilled').value.token}`}};
    assert.equal((await requireSession(pool,selected,options)).role,'supervisor');
    await provisionStaffCredential(pool,{staffId:'linked',orgId:'a',siteId:'secondary',email:'synthetic@example.test',password:'Second-replacement-synthetic-password'},options);
    await assert.rejects(requireSession(pool,selected,options),/Sign in required/);
    await domainTransaction(pool,schema,async client=>{
      assert.equal((await client.query("SELECT count(*)::int n FROM staff_credentials WHERE staff_id='linked'")).rows[0].n,0);
      assert.equal((await client.query("SELECT count(*)::int n FROM audit WHERE action='account.site_selected'")).rows[0].n,1);
    });
    const inviter={...owner,access_mode:'credential'},inviteInput={requestId:randomUUID(),name:'Synthetic recipient',email:'invited@example.test',role:'supervisor',confirmed:true};
    const issued=await Promise.all([issueInvitation(pool,inviter,inviteInput,mail,options),issueInvitation(pool,inviter,inviteInput,mail,options)]);
    assert.equal(issued.filter(row=>row.duplicate).length,1);
    let invitationToken,invitationSends=0;
    const invitationDelivery=await Promise.all([0,1].map(()=>processOneInvitation(pool,mail,{...options,send:async(_,id,message)=>{
      invitationSends++;invitationToken=message.text.match(/#accept-invitation\/([A-Za-z0-9_-]{43})/)[1];return {providerId:'synthetic-invitation'};
    }})));
    assert.equal(invitationDelivery.filter(Boolean).length,1);assert.equal(invitationSends,1);
    const acceptInput={requestId:randomUUID(),token:invitationToken,password:'Synthetic-invited-password-123',confirmation:'Synthetic-invited-password-123'};
    const acceptRace=await Promise.all([acceptInvitation(pool,null,'signup',acceptInput,'127.0.0.10',mail,options),acceptInvitation(pool,null,'signup',acceptInput,'127.0.0.10',mail,options)]);
    assert.equal(acceptRace.filter(row=>row.duplicate).length,1);assert.equal(acceptRace[0].staffId,acceptRace[1].staffId);
    await domainTransaction(pool,schema,async client=>{
      assert.equal((await client.query('SELECT count(*)::int n FROM staff_invitation_acceptances')).rows[0].n,1);
      assert.equal((await client.query("SELECT count(*)::int n FROM staff_credentials WHERE email='invited@example.test'")).rows[0].n,1);
    });
    const cancelInput={...inviteInput,requestId:randomUUID(),email:'cancel-race@example.test'};await issueInvitation(pool,inviter,cancelInput,mail,options);
    await processOneInvitation(pool,mail,{...options,send:async(_,id,message)=>{invitationToken=message.text.match(/#accept-invitation\/([A-Za-z0-9_-]{43})/)[1];return {providerId:'synthetic-cancel-race'};}});
    const cancelRace=await Promise.allSettled([
      acceptInvitation(pool,null,'signup',{...acceptInput,requestId:randomUUID(),token:invitationToken},'127.0.0.11',mail,options),
      changeInvitation(pool,inviter,cancelInput.requestId,'cancel',{requestId:randomUUID(),revision:1,confirmed:true},mail,options),
    ]);
    assert.equal(cancelRace.filter(row=>row.status==='fulfilled').length,1);
    await domainTransaction(pool,schema,async client=>{
      const row=(await client.query('SELECT state FROM staff_invitations WHERE id=$1',[cancelInput.requestId])).rows[0];
      const n=(await client.query('SELECT count(*)::int n FROM staff_invitation_acceptances a JOIN staff_invitation_tokens t ON t.token_hash=a.token_hash WHERE t.invitation_id=$1',[cancelInput.requestId])).rows[0].n;
      assert.ok((row.state==='accepted' && n===1) || (row.state==='cancelled' && n===0));
    });
    await domainTransaction(pool,schema,async client=>{await client.query("INSERT INTO staff(id,org_id,site_id,name,role) VALUES('second-owner','a','a','Second synthetic owner','owner')");});
    const otherOwner={...owner,principal_id:'second-owner'};
    const lastOwnerRace=await Promise.allSettled([
      changeStaff(pool,owner,owner.principal_id,'role',{requestId:randomUUID(),revision:1,role:'auditor',confirmed:true},options),
      changeStaff(pool,otherOwner,otherOwner.principal_id,'role',{requestId:randomUUID(),revision:1,role:'auditor',confirmed:true},options),
    ]);
    assert.equal(lastOwnerRace.filter(row=>row.status==='fulfilled').length,1);
    assert.match(lastOwnerRace.find(row=>row.status==='rejected').reason.message,/Last active site owner/);
    const retained=lastOwnerRace[0].status==='fulfilled' ? otherOwner : owner;
    assert.equal((await listStaff(pool,retained,{},options)).activeOwners,1);
  } finally {
    if (!/^understood_test_[a-f0-9]{10}$/.test(schema)) throw new Error('Unsafe isolated cleanup schema');
    try {await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);} finally {await pool.end();}
  }
});
