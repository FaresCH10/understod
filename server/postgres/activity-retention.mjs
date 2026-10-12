import {domainTransaction,domainAudit,requirePrincipal} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {textRetentionDays,textRetentionInput,textRetentionRequestId} from '../text-retention-input.mjs';
import {bundleHash} from '../ai/prepared-bundle.mjs';
import {staffRecoveryScope} from '../staff-input.mjs';

export const activityRetentionDue=`e.occurred_at<=clock_timestamp()-p.days*interval '1 day'
  AND NOT EXISTS(SELECT 1 FROM activity_identity_purges d WHERE d.event_id=e.id)`;
export function getActivityRetention(pool,session,{schema='public'}={}) {
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','administrator','supervisor','auditor']);
    const policy=(await client.query('SELECT revision,days FROM activity_retention_policies WHERE org_id=$1 AND site_id=$2',[session.org_id,session.site_id])).rows[0];
    const completed=(await client.query('SELECT COUNT(*)::int AS n FROM activity_identity_purges WHERE org_id=$1 AND site_id=$2',[session.org_id,session.site_id])).rows[0].n;
    return {revision:policy?.revision ?? 0,days:policy?.days ?? null,canWrite:['owner','administrator'].includes(session.role),
      recoveryScope:staffRecoveryScope(session)?`activity:${staffRecoveryScope(session)}`:null,options:textRetentionDays,completed:{activity:completed},
      limitations:'Scheduled cleanup permanently clears actor and item identifiers from elapsed site activity. Minimal event IDs, actions, actor types, timestamps and policy provenance remain; events cannot otherwise be edited or deleted. Policy acceptance records, operational ledgers, briefing content, backups and downloaded or disconnected copies have separate lifecycles. This is not complete account erasure or a legal retention determination.'};
  });
}
export function activityRetentionReceipt(pool,session,requestId,{schema='public'}={}) {
  textRetentionRequestId(requestId);
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','administrator']);
    const row=(await client.query('SELECT id,request_json,revision FROM activity_retention_requests WHERE id=$1 AND org_id=$2 AND site_id=$3 AND actor_id=$4',[requestId,session.org_id,session.site_id,session.principal_id])).rows[0];
    return row?{requestId:row.id,request:row.request_json,revision:row.revision}:null;
  });
}
export function saveActivityRetention(pool,session,input,{schema='public'}={}) {
  const value=textRetentionInput(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','administrator']);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`activity-retention:${input.requestId}`]);
    const old=(await client.query('SELECT * FROM activity_retention_requests WHERE id=$1',[input.requestId])).rows[0];
    if(old){if(old.org_id!==session.org_id || old.site_id!==session.site_id || old.actor_id!==session.principal_id || bundleHash(old.request_json)!==bundleHash(value))throw Error('Activity retention request conflict');return {revision:old.revision,duplicate:true};}
    await client.query('SELECT id FROM sites WHERE id=$1 AND org_id=$2 FOR UPDATE',[session.site_id,session.org_id]);
    const policy=(await client.query('SELECT revision FROM activity_retention_policies WHERE org_id=$1 AND site_id=$2',[session.org_id,session.site_id])).rows[0];
    if((policy?.revision ?? 0)!==value.revision)throw Error('Activity retention revision changed');
    const revision=value.revision+1;
    await client.query(`INSERT INTO activity_retention_policies VALUES($1,$2,$3,$4,clock_timestamp()) ON CONFLICT(site_id)
      DO UPDATE SET revision=excluded.revision,days=excluded.days,updated_at=excluded.updated_at`,[session.site_id,session.org_id,revision,value.days]);
    await client.query('INSERT INTO activity_retention_requests VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())',[input.requestId,session.org_id,session.site_id,session.principal_id,JSON.stringify(value),revision]);
    await domainAudit(client,session,'retention.activity_policy.updated',session.site_id);return {revision,duplicate:false};
  });
}
export function processOneActivityPurge(pool,{schema='public'}={}) {
  return domainTransaction(pool,schema,async client=>{
    const policy=(await client.query(`SELECT p.* FROM activity_retention_policies p WHERE p.days IS NOT NULL
      AND EXISTS(SELECT 1 FROM audit e WHERE e.org_id=p.org_id AND e.site_id=p.site_id AND ${activityRetentionDue})
      ORDER BY p.updated_at,p.site_id LIMIT 1 FOR UPDATE OF p SKIP LOCKED`)).rows[0];
    if(!policy)return false;
    const event=(await client.query(`SELECT e.id FROM audit e JOIN activity_retention_policies p ON p.org_id=e.org_id AND p.site_id=e.site_id
      WHERE e.org_id=$1 AND e.site_id=$2 AND ${activityRetentionDue} ORDER BY e.occurred_at,e.id LIMIT 1 FOR UPDATE OF e`,[policy.org_id,policy.site_id])).rows[0];
    if(!event)return false;
    await client.query('INSERT INTO activity_identity_purges(event_id,org_id,site_id,policy_revision,days) VALUES($1,$2,$3,$4,$5)',[event.id,policy.org_id,policy.site_id,policy.revision,policy.days]);
    await client.query("UPDATE audit SET actor_id='',object_id='' WHERE id=$1 AND org_id=$2 AND site_id=$3",[event.id,policy.org_id,policy.site_id]);
    await domainAudit(client,{...policy,principal_type:'system',principal_id:'activity-retention-worker'},'retention.activity_identity.purged',event.id);
    return true;
  });
}
