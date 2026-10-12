// Short transaction locks serialize access/dispatch checks with operator controls.
export async function lockOperationsGate(client,exclusive=false) {
  await client.query(`SELECT pg_advisory_xact_lock${exclusive?'':'_shared'}(hashtextextended(current_schema()||':operations-gate',0))`);
}
export async function requireTenantActive(client,orgId) {
  await lockOperationsGate(client);
  const row=(await client.query(`SELECT o.id,COALESCE(t.state,'active') AS state FROM organizations o LEFT JOIN tenant_controls t ON t.org_id=o.id WHERE o.id=$1 FOR SHARE OF o`,[orgId])).rows[0];
  if(!row || row.state!=='active')throw Error('Workspace access paused');
}
export async function dispatchAllowed(client,orgId,{provider=false}={}) {
  await lockOperationsGate(client);
  const control=(await client.query("SELECT jobs_paused,provider_paused FROM system_controls WHERE id='global'")).rows[0];
  if(control?.jobs_paused || provider && control?.provider_paused)return false;
  if(orgId===null)return true;
  try {await requireTenantActive(client,orgId);return true;}catch(error){if(error.message==='Workspace access paused')return false;throw error;}
}
export function dispatchPredicate(alias,{provider=false}={}) {
  if(!/^[a-z_]+$/.test(alias))throw Error('Invalid dispatch alias');
  const content=['recordings','assessment_jobs','case_followups','case_voice','assignment_reminders'].includes(alias)?` AND assignment_content_available(${alias}.assignment_id)`:
    ['jobs','source_audio_requests','publication_schedules'].includes(alias)?` AND NOT EXISTS(SELECT 1 FROM briefing_content_purges bp WHERE bp.briefing_id=${alias}.briefing_id)`:'';
  return `NOT EXISTS(SELECT 1 FROM tenant_controls tc WHERE tc.org_id=${alias}.org_id AND tc.state='suspended')
    AND NOT EXISTS(SELECT 1 FROM system_controls sc WHERE sc.id='global' AND (sc.jobs_paused${provider?' OR sc.provider_paused':''}))${content}`;
}
