import {domainTransaction,requirePrincipal,domainAudit} from './domain.mjs';
import {getSettings} from './settings.mjs';
import {onboardingInput,onboardingTechnical,onboardingModel,sameOnboarding} from '../onboarding-input.mjs';

export async function getOnboarding(pool,session,{schema='public'}={}) {
  const context=await getSettings(pool,session,{schema});
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','supervisor','administrator','auditor']);
    const scope=[session.org_id,session.site_id],state=(await client.query('SELECT * FROM site_onboarding WHERE org_id=$1 AND site_id=$2',scope)).rows[0];
    const resources={workers:(await client.query('SELECT COUNT(*)::int n FROM workers WHERE org_id=$1 AND site_id=$2 AND active=true',scope)).rows[0].n,
      activeGrants:(await client.query('SELECT COUNT(*)::int n FROM worker_grants g JOIN workers w ON w.id=g.worker_id AND w.org_id=g.org_id AND w.site_id=g.site_id WHERE g.org_id=$1 AND g.site_id=$2 AND g.expires_at>clock_timestamp() AND g.revoked_at IS NULL AND w.active=true',scope)).rows[0].n,
      firstBriefing:state?.first_briefing_id?(await client.query(`SELECT b.id,b.title,b.state,(SELECT state FROM publications p WHERE p.briefing_id=b.id AND p.org_id=b.org_id AND p.site_id=b.site_id ORDER BY version DESC LIMIT 1) AS "publicationState" FROM briefings b WHERE b.id=$3 AND b.org_id=$1 AND b.site_id=$2`,[...scope,state.first_briefing_id])).rows[0] ?? null:null};
    return onboardingModel(context,state,resources);
  });
}
export async function saveOnboarding(pool,session,input,{schema='public'}={}) {
  const value=onboardingInput(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner']);
    await client.query('SELECT id FROM sites WHERE id=$1 AND org_id=$2 FOR UPDATE',[session.site_id,session.org_id]);
    const old=(await client.query('SELECT * FROM onboarding_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3',[input.requestId,session.org_id,session.site_id])).rows[0];
    if(old){if(old.requested_by!==session.principal_id || !sameOnboarding(old.request_json,value))throw Error('Onboarding request conflict');return {revision:old.revision,duplicate:true};}
    const state=(await client.query('SELECT revision FROM site_onboarding WHERE site_id=$1 AND org_id=$2',[session.site_id,session.org_id])).rows[0];
    if((state?.revision ?? 0)!==value.revision)throw Error('Onboarding revision changed');
    if(value.firstBriefingId && !(await client.query('SELECT id FROM briefings WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR SHARE',[value.firstBriefingId,session.org_id,session.site_id])).rows.length)throw Error('Invalid onboarding briefing');
    const revision=value.revision+1;
    await client.query(`INSERT INTO site_onboarding VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()) ON CONFLICT(site_id) DO UPDATE SET revision=excluded.revision,step=excluded.step,first_briefing_id=excluded.first_briefing_id,technical_json=excluded.technical_json,updated_at=excluded.updated_at`,[session.site_id,session.org_id,revision,value.step,value.firstBriefingId,JSON.stringify(onboardingTechnical())]);
    await client.query('INSERT INTO onboarding_requests(request_id,org_id,site_id,request_json,revision,requested_by) VALUES($1,$2,$3,$4,$5,$6)',[input.requestId,session.org_id,session.site_id,JSON.stringify(value),revision,session.principal_id]);
    await domainAudit(client,session,'onboarding.progress_saved',input.requestId);return {revision,duplicate:false};
  });
}
export function onboardingReceipt(pool,session,id,{schema='public'}={}) {
  return domainTransaction(pool,schema,async client=>{await requirePrincipal(client,session,'staff',['owner']);
    const row=(await client.query('SELECT revision,request_json AS request FROM onboarding_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3 AND requested_by=$4',[id,session.org_id,session.site_id,session.principal_id])).rows[0];return row?{found:true,...row}:{found:false};});
}
