import {randomUUID} from 'node:crypto';
import {domainTransaction,domainAudit,requirePrincipal} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {textRetentionDays,textRetentionInput,textRetentionRequestId} from '../text-retention-input.mjs';
import {bundleHash} from '../ai/prepared-bundle.mjs';
import {staffRecoveryScope} from '../staff-input.mjs';

export function getGeneratedRetention(pool,session,{schema='public'}={}) {
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','administrator','supervisor','auditor']);
    const policy=(await client.query('SELECT revision,days FROM generated_retention_policies WHERE org_id=$1 AND site_id=$2',[session.org_id,session.site_id])).rows[0];
    const counts=(await client.query(`SELECT count(*)::integer AS retired,count(*) FILTER(WHERE r.bundle_id IS NOT NULL)::integer AS removed
      FROM generated_audio_retirements t LEFT JOIN generated_audio_removals r ON r.bundle_id=t.bundle_id
      WHERE t.org_id=$1 AND t.site_id=$2`,[session.org_id,session.site_id])).rows[0];
    const scope=staffRecoveryScope(session);
    return {revision:policy?.revision ?? 0,days:policy?.days ?? null,canWrite:['owner','administrator'].includes(session.role),
      recoveryScope:scope?`generated:${scope}`:null,options:textRetentionDays,completed:counts,
      limitations:'Generated body/question speech expires from its verified storage date, including current published and draft versions. Playback and publishing expired bundles stop before retryable object removal. Text, immutable publication snapshots, assignment history and provenance remain. Disabling this policy cannot undo retirement or cancel already queued cleanup. Backups and device copies have separate lifecycles.'};
  });
}
export function generatedRetentionReceipt(pool,session,requestId,{schema='public'}={}) {
  textRetentionRequestId(requestId);
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','administrator']);
    const row=(await client.query('SELECT * FROM generated_retention_requests WHERE id=$1 AND org_id=$2 AND site_id=$3 AND actor_id=$4',[requestId,session.org_id,session.site_id,session.principal_id])).rows[0];
    return row?{requestId:row.id,request:row.request_json,revision:row.revision}:null;
  });
}
export function saveGeneratedRetention(pool,session,input,{schema='public'}={}) {
  const value=textRetentionInput(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','administrator']);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`generated-retention:${input.requestId}`]);
    const old=(await client.query('SELECT * FROM generated_retention_requests WHERE id=$1',[input.requestId])).rows[0];
    if(old){if(old.org_id!==session.org_id || old.site_id!==session.site_id || old.actor_id!==session.principal_id || bundleHash(old.request_json)!==bundleHash(value))throw Error('Generated retention request conflict');return {revision:old.revision,duplicate:true};}
    await client.query('SELECT id FROM sites WHERE id=$1 AND org_id=$2 FOR UPDATE',[session.site_id,session.org_id]);
    const current=(await client.query('SELECT revision FROM generated_retention_policies WHERE org_id=$1 AND site_id=$2',[session.org_id,session.site_id])).rows[0];
    if((current?.revision ?? 0)!==value.revision)throw Error('Generated retention revision changed');
    const revision=value.revision+1;
    await client.query(`INSERT INTO generated_retention_policies VALUES($1,$2,$3,$4,clock_timestamp()) ON CONFLICT(site_id)
      DO UPDATE SET revision=excluded.revision,days=excluded.days,updated_at=excluded.updated_at`,[session.site_id,session.org_id,revision,value.days]);
    await client.query('INSERT INTO generated_retention_requests VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())',[input.requestId,session.org_id,session.site_id,session.principal_id,JSON.stringify(value),revision]);
    await domainAudit(client,session,'retention.generated_policy.updated',session.site_id);return {revision,duplicate:false};
  });
}
export function retireOneGeneratedBundle(pool,{schema='public'}={}) {
  return domainTransaction(pool,schema,async client=>{
    const policy=(await client.query(`SELECT p.* FROM generated_retention_policies p WHERE p.days IS NOT NULL
      AND EXISTS(SELECT 1 FROM generated_bundles b WHERE b.org_id=p.org_id AND b.site_id=p.site_id AND b.state='attached'
        AND b.stored_at<=clock_timestamp()-p.days*interval '1 day') ORDER BY p.updated_at,p.site_id LIMIT 1 FOR UPDATE OF p SKIP LOCKED`)).rows[0];
    if(!policy)return false;
    const bundle=(await client.query(`SELECT id FROM generated_bundles WHERE org_id=$1 AND site_id=$2 AND state='attached'
      AND stored_at<=clock_timestamp()-$3*interval '1 day' ORDER BY stored_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,[policy.org_id,policy.site_id,policy.days])).rows[0];
    if(!bundle)return false;
    await client.query('INSERT INTO generated_audio_retirements(bundle_id,org_id,site_id,policy_revision,days) VALUES($1,$2,$3,$4,$5)',[bundle.id,policy.org_id,policy.site_id,policy.revision,policy.days]);
    await client.query("UPDATE generated_bundles SET state='cleaning',cleanup_token=$2,cleanup_until=clock_timestamp() WHERE id=$1",[bundle.id,randomUUID()]);
    await domainAudit(client,{...policy,principal_type:'system',principal_id:'generated-retention-worker'},'retention.generated_audio.retired',bundle.id);
    return true;
  });
}
