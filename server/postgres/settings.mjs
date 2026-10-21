import {domainTransaction,requirePrincipal,domainAudit} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {settingsInput,settingsRequestId,sameSettingsRequest,generationLanguages,siteContactFilters,siteContactDto} from '../settings-input.mjs';
import {staffRecoveryScope} from '../staff-input.mjs';
export async function getDraftLanguageSelection(client,orgId,siteId,briefingId) {
  const latest=(await client.query('SELECT request_json FROM briefing_language_requests WHERE org_id=$1 AND site_id=$2 AND briefing_id=$3 ORDER BY accepted_revision DESC LIMIT 1',[orgId,siteId,briefingId])).rows[0];
  if(latest)return latest.request_json.generationLanguages;
  const draft=(await client.query('SELECT generation_languages_json FROM draft_creations WHERE org_id=$1 AND site_id=$2 AND briefing_id=$3',[orgId,siteId,briefingId])).rows[0];
  return draft?.generation_languages_json ? generationLanguages(draft.generation_languages_json) : null;
}
export async function readGenerationLanguages(client,orgId,siteId,fallback=['en','ar','ur'],briefingId=null) {
  if(briefingId){const selected=await getDraftLanguageSelection(client,orgId,siteId,briefingId);if(selected)return generationLanguages(selected);}
  const row=(await client.query('SELECT generation_languages_json FROM site_settings WHERE org_id=$1 AND site_id=$2',[orgId,siteId])).rows[0];
  return generationLanguages(row?row.generation_languages_json:fallback);
}
async function context(client,session) {
  const organization=(await client.query(`SELECT o.id,o.name,COALESCE(s.revision,0) AS revision,COALESCE(s.support_email,'') AS "supportEmail"
    FROM organizations o LEFT JOIN organization_settings s ON s.org_id=o.id WHERE o.id=$1`,[session.org_id])).rows[0];
  const site=(await client.query(`SELECT s.id,s.name,s.timezone,COALESCE(t.revision,0) AS revision FROM sites s LEFT JOIN site_settings t ON t.site_id=s.id AND t.org_id=s.org_id WHERE s.id=$1 AND s.org_id=$2`,[session.site_id,session.org_id])).rows[0];
  const contacts=(await client.query('SELECT primary_contact_id,deputy_contact_id FROM site_settings WHERE site_id=$1 AND org_id=$2',[session.site_id,session.org_id])).rows[0];
  const contact=async id=>siteContactDto(id?(await client.query('SELECT id,name,role,active FROM staff WHERE id=$1 AND org_id=$2 AND site_id=$3',[id,session.org_id,session.site_id])).rows[0]:null);
  if(!organization || !site) throw new Error('Settings unavailable');return {organization,site:{...site,generationLanguages:await readGenerationLanguages(client,session.org_id,session.site_id),primaryContact:await contact(contacts?.primary_contact_id),deputyContact:await contact(contacts?.deputy_contact_id)}};
}
export function listSiteContacts(pool,session,input={},{schema='public'}={}) {
  const f=siteContactFilters(input);
  return responseRead(pool,schema,async client=>{await requirePrincipal(client,session,'staff',['owner','administrator']);const values=[session.org_id,session.site_id,f.search.toLowerCase()],where="org_id=$1 AND site_id=$2 AND active=true AND role IN ('owner','supervisor') AND (strpos(lower(name),$3)>0 OR strpos(lower(id),$3)>0)";
    const total=(await client.query(`SELECT COUNT(*)::int AS n FROM staff WHERE ${where}`,values)).rows[0].n;
    const items=(await client.query(`SELECT id,name,role,active FROM staff WHERE ${where} ORDER BY lower(name) COLLATE "C",id COLLATE "C" LIMIT $4 OFFSET $5`,[...values,f.pageSize,(f.page-1)*f.pageSize])).rows.map(siteContactDto);
    return {items,total,page:f.page,pageSize:f.pageSize};});
}
export function getSettings(pool,session,{schema='public'}={}) {
  return responseRead(pool,schema,async client=>{await requirePrincipal(client,session,'staff',['owner','administrator','supervisor','auditor']);return {...await context(client,session),recoveryScope:staffRecoveryScope(session),canWrite:session.role==='owner',canWriteSite:['owner','administrator'].includes(session.role)};});
}
export function settingsReceipt(pool,session,kind,id,{schema='public'}={}){
  settingsRequestId(id);if(!['organization','site'].includes(kind))throw Error('Invalid settings request');
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',kind==='site'?['owner','administrator']:['owner']);
    const row=(await client.query('SELECT * FROM settings_requests WHERE id=$1 AND org_id=$2 AND site_id=$3 AND kind=$4 AND created_by=$5',[id,session.org_id,session.site_id,kind,session.principal_id])).rows[0];
    return row?{requestId:row.id,kind:row.kind,request:row.request_json,revision:row.revision}:null;
  });
}
export function updateSettings(pool,session,kind,input,{schema='public'}={}) {
  const value=settingsInput(kind,input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',kind==='site' ? ['owner','administrator'] : ['owner']);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`settings:${session.org_id}:${session.site_id}:${input.requestId}`]);
    const old=(await client.query('SELECT * FROM settings_requests WHERE id=$1 AND org_id=$2 AND site_id=$3',[input.requestId,session.org_id,session.site_id])).rows[0];
    if(old) {if(old.created_by!==session.principal_id || old.kind!==kind || !sameSettingsRequest(old.request_json,value)) throw new Error('Settings request conflict');return {revision:old.revision,duplicate:true};}
    if(kind==='organization') await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[session.org_id]);
    else await client.query('SELECT id FROM sites WHERE id=$1 AND org_id=$2 FOR UPDATE',[session.site_id,session.org_id]);
    const current=(await context(client,session))[kind];
    if(current.revision!==value.revision) throw new Error('Settings revision changed');
    if(current.name===value.name && (kind==='organization' ? current.supportEmail===value.supportEmail : current.timezone===value.timezone && (value.generationLanguages===undefined || JSON.stringify(current.generationLanguages)===JSON.stringify(value.generationLanguages)) && (value.primaryContactId===undefined || (value.primaryContactId===(current.primaryContact?.id ?? null) && value.deputyContactId===(current.deputyContact?.id ?? null))))) throw new Error('Settings unchanged');
    if(kind==='site' && value.primaryContactId!==undefined)for(const id of [value.primaryContactId,value.deputyContactId].filter(Boolean).sort())if(!(await client.query("SELECT id FROM staff WHERE id=$1 AND org_id=$2 AND site_id=$3 AND active=true AND role IN ('owner','supervisor') FOR SHARE",[id,session.org_id,session.site_id])).rows.length)throw Error('Invalid site contact');
    const revision=value.revision+1;
    if(kind==='organization') {
      await client.query('UPDATE organizations SET name=$1 WHERE id=$2',[value.name,session.org_id]);
      await client.query('INSERT INTO organization_settings VALUES($1,$2,$3) ON CONFLICT(org_id) DO UPDATE SET revision=excluded.revision,support_email=excluded.support_email',[session.org_id,revision,value.supportEmail]);
    } else {
      await client.query('UPDATE sites SET name=$1,timezone=$2 WHERE id=$3 AND org_id=$4',[value.name,value.timezone,session.site_id,session.org_id]);
      await client.query('INSERT INTO site_settings(site_id,org_id,revision,generation_languages_json,primary_contact_id,deputy_contact_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(site_id) DO UPDATE SET revision=excluded.revision,generation_languages_json=excluded.generation_languages_json,primary_contact_id=excluded.primary_contact_id,deputy_contact_id=excluded.deputy_contact_id',[session.site_id,session.org_id,revision,JSON.stringify(value.generationLanguages ?? current.generationLanguages),value.primaryContactId===undefined?(current.primaryContact?.id ?? null):value.primaryContactId,value.deputyContactId===undefined?(current.deputyContact?.id ?? null):value.deputyContactId]);
    }
    try {await client.query('INSERT INTO settings_requests(id,org_id,site_id,kind,request_json,revision,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[input.requestId,session.org_id,session.site_id,kind,JSON.stringify(value),revision,session.principal_id]);}
    catch(error) {if(error.code==='23505') throw new Error('Settings request conflict');throw error;}
    await domainAudit(client,session,`settings.${kind}_updated`,input.requestId);return {revision,duplicate:false};
  });
}
