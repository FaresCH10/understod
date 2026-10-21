import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {domainTransaction,publish,submitAnswer,withdrawPublication} from './domain.mjs';
import {issueWorkerGrant,redeemWorkerGrant,revokeWorkerGrant,requireSession} from './auth.mjs';
import {consumeAuthBudget} from './auth-budget.mjs';
import {AUTH_GLOBAL_KEY,AUTH_GLOBAL_LIMIT,AUTH_KEY_LIMIT} from '../auth-budget.mjs';
import {tokenHash} from '../auth-crypto.mjs';
import {createInvoice,recordPayment,voidInvoice,getInvoice} from './billing.mjs';
import {getProcessingRetryContext,getProcessingRetryReceipt,retryProcessing} from './processing-retry.mjs';
import {processOneAssessment} from './assessment-worker.mjs';
import {syntheticAssessmentAdapter} from './runtime.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../domain.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function checkNeonConcurrency(pool,{schema,runId,owner,worker,publicationId,checkpoint=async()=>{},interruptAssessment}={}){
  assert.match(runId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.equal(schema,'understood_neon_test_'+runId.replaceAll('-',''));
  const options={schema,integrationMode:'synthetic'},tx=fn=>domainTransaction(pool,schema,fn);
  const result={kind:'extended-synthetic-concurrency',state:'checking',checks:[],providerCalls:0,realDataUsed:false,processDeathVerified:false,productionVerdict:false};
  const save=async phase=>{result.phase=phase;await checkpoint({...result,checks:[...result.checks]});};
  let releaseStale,staleRun;
  try{
    await save('concurrency-preflight');
    const original=await tx(async client=>{
      const identity=(await client.query('SELECT current_user AS current,session_user AS session')).rows[0];assert.equal(identity.current,identity.session);
      const marker=(await client.query("SELECT obj_description(oid,'pg_namespace') AS marker,pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname=$1",[schema])).rows[0];
      assert.equal(marker?.marker,'Understood synthetic Neon rehearsal '+runId);assert.equal(marker.owner,identity.current);
      return {attempts:hash((await client.query('SELECT * FROM attempts ORDER BY id')).rows),snapshot:hash((await client.query('SELECT snapshot_json FROM publications WHERE id=$1',[publicationId])).rows)};
    });
    await save('grant-redemption');
    const grant=await issueWorkerGrant(pool,owner,worker.principal_id,30,options);
    const redemptions=await Promise.allSettled([redeemWorkerGrant(pool,grant.token,options),redeemWorkerGrant(pool,grant.token,options)]);
    assert.equal(redemptions.filter(row=>row.status==='fulfilled').length,1);
    assert.equal(redemptions.find(row=>row.status==='rejected').reason.message,'Invalid credentials');
    const session=redemptions.find(row=>row.status==='fulfilled').value,req={headers:{cookie:'understood_session='+session.token}};
    assert.equal((await requireSession(pool,req,options)).principal_id,worker.principal_id);
    await revokeWorkerGrant(pool,owner,grant.id,options);await assert.rejects(requireSession(pool,req,options),/Sign in required/);
    await tx(async client=>{
      assert.equal((await client.query("SELECT count(*)::int AS n FROM audit WHERE action='grant.redeemed' AND object_id=$1",[grant.id])).rows[0].n,1);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM sessions WHERE grant_id=$1 AND revoked_at IS NULL",[grant.id])).rows[0].n,0);
    });result.checks.push('single-use-grant-redemption-and-session-revocation');
    await save('processing-retry');
    await tx(client=>client.query("INSERT INTO briefings(id,org_id,site_id,title,source,state,prepared_json) VALUES('retry-briefing','a','a','Synthetic concurrency recovery',$1,'ready',$2)",[CANONICAL_SOURCE,JSON.stringify(syntheticPrepare(CANONICAL_SOURCE))]));
    const fresh=await publish(pool,owner,'retry-briefing',{requestId:randomUUID(),revision:1,nextVersion:1,workerIds:[worker.principal_id]},options);
    const assignment=await tx(async client=>(await client.query('SELECT id FROM assignments WHERE publication_id=$1',[fresh.id])).rows[0].id);
    const answer='Finished items on the blue shelf; unfinished items on the yellow shelf.',attempt=await submitAnswer(pool,worker,assignment,randomUUID(),answer,options);
    const job=await tx(async client=>{
      const row=(await client.query('SELECT id FROM assessment_jobs WHERE attempt_id=$1',[attempt.id])).rows[0];
      await client.query("UPDATE assessment_jobs SET status='failed',attempts=3 WHERE id=$1",[row.id]);return row.id;
    }),jobId='answer_check:'+job;
    const context=await getProcessingRetryContext(pool,owner,jobId,options);assert.equal(context.available,true);
    const intent={requestId:randomUUID(),jobId,publicationId:fresh.id,assignmentId:assignment,generation:context.generation,confirmed:true};
    const accepted=await Promise.all([retryProcessing(pool,owner,jobId,intent,options),retryProcessing(pool,owner,jobId,intent,options)]);
    assert.deepEqual(accepted[0],accepted[1]);
    const receipt=await getProcessingRetryReceipt(pool,owner,jobId,intent.requestId,options);assert.equal(receipt.found,true);assert.deepEqual(receipt.result,accepted[0]);
    await tx(client=>client.query("UPDATE assessment_jobs SET status='failed',attempts=3 WHERE id=$1",[job]));
    await Promise.all([retryProcessing(pool,owner,jobId,intent,options),retryProcessing(pool,owner,jobId,intent,options)]);
    assert.equal((await getProcessingRetryContext(pool,owner,jobId,options)).status,'failed');
    const next=await getProcessingRetryContext(pool,owner,jobId,options);assert.equal(next.generation,1);
    const competitors=await Promise.allSettled([0,1].map(()=>retryProcessing(pool,owner,jobId,{...intent,requestId:randomUUID(),generation:next.generation},options)));
    assert.equal(competitors.filter(row=>row.status==='fulfilled').length,1);assert.equal(competitors.find(row=>row.status==='rejected').reason.message,'Processing retry state changed');
    await tx(async client=>{
      assert.equal((await client.query('SELECT count(*)::int AS n FROM processing_retries WHERE job_id=$1',[job])).rows[0].n,2);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM audit WHERE action='answer.processing_retry_requested' AND object_id=$1",[job])).rows[0].n,2);
    });result.checks.push('concurrent-exact-retry-receipt-replay-and-generation-race');
    await save('expired-lease-takeover');
    let entered;const started=new Promise(resolve=>{entered=resolve;}),held=new Promise(resolve=>{releaseStale=resolve;});
    staleRun=processOneAssessment(pool,{async assess(){entered();await held;return {outcome:'unassessable',reasons:['Synthetic obsolete claim'],evidence:[]};}},options);
    let timeout;try{await Promise.race([started,staleRun.then(()=>{throw Error('Expected synthetic held claim');}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Synthetic claim timeout')),20000);})]);}finally{clearTimeout(timeout);}
    const obsolete=await tx(async client=>{
      const row=(await client.query('SELECT status,lease_token,attempts FROM assessment_jobs WHERE id=$1',[job])).rows[0];assert.equal(row.status,'processing');assert.equal(row.attempts,1);assert.ok(row.lease_token);
      await client.query("UPDATE assessment_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1 AND lease_token=$2",[job,row.lease_token]);return row.lease_token;
    });
    assert.equal(await processOneAssessment(pool,syntheticAssessmentAdapter,options),true);
    const completed=await tx(async client=>{
      const row=(await client.query('SELECT status,lease_token,attempts FROM assessment_jobs WHERE id=$1',[job])).rows[0];assert.equal(row.status,'complete');assert.equal(row.lease_token,null);assert.equal(row.attempts,2);
      const rows=(await client.query('SELECT * FROM attempts WHERE id=$1',[attempt.id])).rows;assert.equal(rows[0].outcome,'matched');assert.equal(rows[0].assessment_status,'complete');return hash(rows);
    });
    releaseStale();assert.equal(await staleRun,true);staleRun=null;
    await tx(async client=>{
      assert.equal(hash((await client.query('SELECT * FROM attempts WHERE id=$1',[attempt.id])).rows),completed);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM audit WHERE action='answer.checked' AND object_id=$1",[attempt.id])).rows[0].n,1);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM clarifications WHERE attempt_id=$1',[attempt.id])).rows[0].n,0);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM assessment_jobs WHERE lease_token=$1',[obsolete])).rows[0].n,0);
    });
    assert.deepEqual(await retryProcessing(pool,owner,jobId,intent,options),accepted[0]);
    result.checks.push('expired-lease-takeover-rejects-late-obsolete-completion');
    if(interruptAssessment){
      await save('owned-worker-interruption');
      await tx(client=>client.query("INSERT INTO briefings(id,org_id,site_id,title,source,state,prepared_json) VALUES('death-briefing','a','a','Synthetic worker interruption',$1,'ready',$2)",[CANONICAL_SOURCE,JSON.stringify(syntheticPrepare(CANONICAL_SOURCE))]));
      const deathPublication=await publish(pool,owner,'death-briefing',{requestId:randomUUID(),revision:1,nextVersion:1,workerIds:[worker.principal_id]},options);
      const deathAssignment=await tx(async client=>(await client.query('SELECT id FROM assignments WHERE publication_id=$1',[deathPublication.id])).rows[0].id);
      const deathAttempt=await submitAnswer(pool,worker,deathAssignment,randomUUID(),answer,options);
      const deathJob=await tx(async client=>(await client.query('SELECT id FROM assessment_jobs WHERE attempt_id=$1',[deathAttempt.id])).rows[0].id);
      result.interruption=await interruptAssessment({runId,schema,jobId:deathJob});assert.equal(result.interruption.kind,'owned-process-interruption');assert.equal(result.interruption.childExited,true);assert.equal(result.interruption.processDeathVerified,true);
      await tx(async client=>{
        const row=(await client.query('SELECT status,lease_token,attempts FROM assessment_jobs WHERE id=$1',[deathJob])).rows[0];assert.equal(row.status,'processing');assert.equal(row.attempts,1);assert.ok(row.lease_token);
        assert.equal((await client.query('SELECT assessment_status FROM attempts WHERE id=$1',[deathAttempt.id])).rows[0].assessment_status,'pending');
        assert.equal((await client.query("SELECT count(*)::int AS n FROM audit WHERE action='answer.checked' AND object_id=$1",[deathAttempt.id])).rows[0].n,0);
        await client.query("UPDATE assessment_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1 AND lease_token=$2",[deathJob,row.lease_token]);
      });
      assert.equal(await processOneAssessment(pool,syntheticAssessmentAdapter,options),true);
      await tx(async client=>{
        const row=(await client.query('SELECT status,lease_token,attempts FROM assessment_jobs WHERE id=$1',[deathJob])).rows[0];assert.equal(row.status,'complete');assert.equal(row.lease_token,null);assert.equal(row.attempts,2);
        const attempt=(await client.query('SELECT outcome,assessment_status FROM attempts WHERE id=$1',[deathAttempt.id])).rows[0];assert.equal(attempt.outcome,'matched');assert.equal(attempt.assessment_status,'complete');
        assert.equal((await client.query("SELECT count(*)::int AS n FROM audit WHERE action='answer.checked' AND object_id=$1",[deathAttempt.id])).rows[0].n,1);
      });result.processDeathVerified=true;result.checks.push('owned-worker-process-death-and-expired-lease-recovery');
    }
    await save('billing-race');
    const invoiceInput={requestId:randomUUID(),number:'SYNTHETIC-RACE',description:'Synthetic race record only',issueDate:'2026-10-01',dueDate:'2026-10-10',amount:'25.00',confirmed:true};
    const invoice=await createInvoice(pool,owner,invoiceInput,options);
    const billing=await Promise.allSettled([
      voidInvoice(pool,owner,invoice.id,{requestId:randomUUID(),number:invoiceInput.number,amount:'25',reason:'Synthetic conflict',confirmed:true},options),
      recordPayment(pool,owner,invoice.id,{requestId:randomUUID(),amount:'1',date:'2026-10-01',reference:'Synthetic test only',note:'',confirmed:true},options),
    ]);
    assert.equal(billing.filter(row=>row.status==='fulfilled').length,1);assert.match(billing.find(row=>row.status==='rejected').reason.message,/Only unpaid|voided/);
    const totals=await getInvoice(pool,owner,invoice.id,{},options);
    assert.ok(totals.status==='void' && totals.paidCents===0 && totals.voidedCents===2500 || totals.status==='partial' && totals.paidCents===100 && totals.voidedCents===0);
    result.checks.push('payment-versus-void-single-consistent-winner');
    await save('withdrawal-race');
    const withdrawal={requestId:randomUUID(),publicationId,version:1,reason:'Synthetic concurrent withdrawal'};
    const withdrawn=await Promise.all([withdrawPublication(pool,owner,'briefing',withdrawal,options),withdrawPublication(pool,owner,'briefing',withdrawal,options)]);
    assert.equal(withdrawn.filter(row=>!row.duplicate).length,1);
    await tx(async client=>{
      assert.equal((await client.query('SELECT count(*)::int AS n FROM publication_withdrawals WHERE publication_id=$1',[publicationId])).rows[0].n,1);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM audit WHERE action='briefing.withdrawn' AND object_id=$1",[publicationId])).rows[0].n,1);
      assert.equal(hash((await client.query('SELECT snapshot_json FROM publications WHERE id=$1',[publicationId])).rows),original.snapshot);
      assert.equal(hash((await client.query('SELECT * FROM attempts WHERE assignment_id IN(SELECT id FROM assignments WHERE publication_id=$1) ORDER BY id',[publicationId])).rows),original.attempts);
    });result.checks.push('concurrent-withdrawal-preserves-frozen-snapshot-and-earlier-answer');
    await save('auth-capacity');assert.ok(AUTH_KEY_LIMIT<=10000 && AUTH_KEY_LIMIT>=3);
    await tx(async client=>{await client.query('DELETE FROM auth_attempts');await client.query('INSERT INTO auth_attempts VALUES($1,$2,clock_timestamp())',[AUTH_GLOBAL_KEY,AUTH_GLOBAL_LIMIT-1]);});
    const global=await Promise.all([0,1].map(n=>tx(client=>consumeAuthBudget(client,[tokenHash('synthetic-global-'+n)],5))));assert.equal(global.filter(Boolean).length,1);
    await tx(async client=>{
      assert.equal((await client.query('SELECT count FROM auth_attempts WHERE key_hash=$1',[AUTH_GLOBAL_KEY])).rows[0].count,AUTH_GLOBAL_LIMIT);
      await client.query('DELETE FROM auth_attempts');await client.query('INSERT INTO auth_attempts VALUES($1,0,clock_timestamp())',[AUTH_GLOBAL_KEY]);
      await client.query('INSERT INTO auth_attempts SELECT md5(n::text)||md5(n::text),1,clock_timestamp() FROM generate_series(1,$1) n',[AUTH_KEY_LIMIT-2]);
    });
    const keys=await Promise.all([0,1].map(n=>tx(client=>consumeAuthBudget(client,[tokenHash('synthetic-key-'+n)],5))));assert.equal(keys.filter(Boolean).length,1);
    assert.equal(await tx(async client=>(await client.query('SELECT count(*)::int AS n FROM auth_attempts')).rows[0].n),AUTH_KEY_LIMIT);
    result.checks.push('global-and-key-auth-admission-cannot-oversubscribe');result.state='passed';
  }catch(error){result.state='failed';result.failedPhase=result.phase;result.error='Extended synthetic concurrency checks did not pass.';if(/^[0-9A-Z]{5}$/.test(error?.code||''))result.sqlState=error.code;}
  finally{releaseStale?.();if(staleRun)try{await staleRun;}catch{}await save('concurrency-finished');}
  return result;
}
