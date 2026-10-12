import {randomUUID} from 'node:crypto';
import {bindPreparationAuthority} from './preparation-authority.mjs';
import {regenerationInput} from '../regeneration-input.mjs';
import {reviewRequestId} from '../briefing-input.mjs';
import {bundleHash,reviewContent} from '../ai/prepared-bundle.mjs';
import {domainTransaction,requirePrincipal,requireActiveBriefing,domainAudit} from './domain.mjs';
import {draftGeneratedEvidence,generatedBundleEvidence} from './generated-audio.mjs';

export async function regenerateDraftTarget(pool,session,id,input,{schema='public'}={}) {
  const content=regenerationInput(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`understood:regenerate:${schema}:${session.org_id}:${session.site_id}:${input.requestId}`]);
    const draft=(await client.query('SELECT * FROM briefings WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR UPDATE',[id,session.org_id,session.site_id])).rows[0];
    if(!draft) throw Error('Briefing unavailable');
    const old=(await client.query('SELECT * FROM briefing_regeneration_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3',[input.requestId,session.org_id,session.site_id])).rows[0];
    if(old) {
      if(old.briefing_id!==id || bundleHash(old.request_json)!==bundleHash(content)) throw Error('Regeneration request conflict');
      return {id,revision:old.accepted_revision,duplicate:true};
    }
    await requireActiveBriefing(client,session,id);
    if(draft.revision!==content.revision) throw Error('Draft revision changed');
    let evidence;
    try {evidence=await draftGeneratedEvidence(client,{...session,briefing_id:id},draft);}catch {throw Error('Draft regeneration unavailable');}
    if(!evidence.manifest.languages[content.language]) throw Error('Draft regeneration unavailable');
    const saved=(await client.query('SELECT content_json FROM draft_reviews WHERE briefing_id=$1 AND org_id=$2 AND site_id=$3',[id,session.org_id,session.site_id])).rows[0]?.content_json ?? null;
    const review=reviewContent(saved,draft.revision),revision=draft.revision+1,jobId=randomUUID();
    if(review) {
      const next=structuredClone(review);next.revision=revision;
      if(content.kind==='translation' && next.translations) {
        delete next.translations[content.language];
        if(!Object.keys(next.translations).length) delete next.translations;
      }
      await client.query('UPDATE draft_reviews SET content_json=$4 WHERE briefing_id=$1 AND org_id=$2 AND site_id=$3',[id,session.org_id,session.site_id,JSON.stringify(next)]);
    }
    await client.query("UPDATE jobs SET status='failed',lease_token=NULL,lease_until=NULL,error='Obsolete draft revision' WHERE briefing_id=$1 AND org_id=$2 AND site_id=$3 AND kind='prepare' AND status IN ('queued','processing')",[id,session.org_id,session.site_id]);
    await client.query("UPDATE briefings SET revision=$4,state='processing',prepared_json=NULL,updated_at=clock_timestamp() WHERE id=$1 AND org_id=$2 AND site_id=$3",[id,session.org_id,session.site_id,revision]);
    await client.query("INSERT INTO jobs(id,org_id,site_id,briefing_id,revision,kind,status,due_at) VALUES($1,$2,$3,$4,$5,'prepare','queued',clock_timestamp())",[jobId,session.org_id,session.site_id,id,revision]);
    await bindPreparationAuthority(client,session,jobId);
    await client.query(`INSERT INTO briefing_regeneration_requests(request_id,org_id,site_id,briefing_id,accepted_revision,baseline_revision,baseline_bundle_id,job_id,request_json,baseline_review_json,requested_by,requested_role,requested_session_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[input.requestId,session.org_id,session.site_id,id,revision,draft.revision,evidence.row.id,jobId,JSON.stringify(content),review===null ? null : JSON.stringify(review),session.principal_id,session.role,session.token_hash ?? null]);
    await domainAudit(client,session,'briefing.target_regeneration_requested',id);
    return {id,revision,duplicate:false};
  });
}

export async function regenerationReceipt(pool,session,requestId,{schema='public'}={}) {
  try {reviewRequestId(requestId);}catch {throw Error('Invalid regeneration request');}
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff');
    const row=(await client.query('SELECT briefing_id AS id,accepted_revision AS revision,request_json AS request FROM briefing_regeneration_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3',[requestId,session.org_id,session.site_id])).rows[0];
    return row ? {found:true,...row} : {found:false};
  });
}

export async function loadTargetRegeneration(client,job) {
  const row=(await client.query('SELECT * FROM briefing_regeneration_requests WHERE job_id=$1 AND org_id=$2 AND site_id=$3 AND briefing_id=$4 AND accepted_revision=$5',[job.id,job.org_id,job.site_id,job.briefing_id,job.revision])).rows[0];
  if(!row) return null;
  const baseline=(await client.query('SELECT manifest_json,manifest_hash FROM generated_bundles WHERE id=$1 AND org_id=$2 AND site_id=$3 AND briefing_id=$4',[row.baseline_bundle_id,job.org_id,job.site_id,job.briefing_id])).rows[0];
  if(!baseline) throw Error('Draft regeneration unavailable');
  const evidence=await generatedBundleEvidence(client,job,{...baseline.manifest_json,artifactBundle:{id:row.baseline_bundle_id,manifestHash:baseline.manifest_hash}});
  return {row,evidence};
}
