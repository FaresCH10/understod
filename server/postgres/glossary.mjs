import {randomUUID} from 'node:crypto';
import {bindPreparationAuthority} from './preparation-authority.mjs';
import {domainTransaction,domainAudit,requirePrincipal} from './domain.mjs';
import {glossaryInput,glossarySignature,glossaryFilters,glossaryHistory,glossaryRequestId,termKey,syntheticTermSuggestion} from '../glossary-input.mjs';
import {glossarySnapshot} from '../glossary-snapshot.mjs';
export async function readGlossarySnapshot(client,orgId,siteId) {
  return glossarySnapshot((await client.query('SELECT t.*,v.content_json FROM glossary_terms t JOIN glossary_versions v ON v.term_id=t.id AND v.revision=t.revision AND v.org_id=t.org_id AND v.site_id=t.site_id WHERE t.org_id=$1 AND t.site_id=$2 ORDER BY t.id',[orgId,siteId])).rows);
}
export async function listGlossary(pool,session,input={}, {schema='public'}={}) {
  const {search,status,sourceLanguage,targetLanguage,page,pageSize}=glossaryFilters(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','supervisor','auditor']);
    const row=(await client.query(`WITH filtered AS (SELECT t.id,t.term,t.source_lang AS "sourceLanguage",t.target_lang AS "targetLanguage",t.revision,t.status,v.content_json AS content FROM glossary_terms t JOIN glossary_versions v ON v.term_id=t.id AND v.revision=t.revision AND v.org_id=t.org_id AND v.site_id=t.site_id
      WHERE t.org_id=$1 AND t.site_id=$2 AND ($3='all' OR t.status=$3) AND ($4='all' OR t.source_lang=$4) AND ($5='all' OR t.target_lang=$5) AND ($6='' OR strpos(lower(t.term),lower($6))>0 OR strpos(lower(COALESCE(v.content_json->>'override','')),lower($6))>0 OR strpos(lower(COALESCE(v.content_json->>'suggestion','')),lower($6))>0))
      SELECT (SELECT COUNT(*)::int FROM filtered) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY lower(r.term),r.id) FROM (SELECT * FROM filtered ORDER BY lower(term),id LIMIT $7 OFFSET $8) r),'[]'::jsonb) AS items`,[session.org_id,session.site_id,status,sourceLanguage,targetLanguage,search,pageSize,(page-1)*pageSize])).rows[0];
    return {...row,page,pageSize};
  });
}
export async function getGlossaryTerm(pool,session,id,input={}, {schema='public'}={}) {
  const {page,version}=glossaryHistory(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','supervisor','auditor']);
    const row=(await client.query('SELECT id,term,source_lang AS "sourceLanguage",target_lang AS "targetLanguage",revision,status FROM glossary_terms WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR SHARE',[id,session.org_id,session.site_id])).rows[0];
    if(!row) throw new Error('Glossary term unavailable');
    const selected=(await client.query('SELECT revision,status,content_json AS content,created_at FROM glossary_versions WHERE term_id=$1 AND org_id=$2 AND site_id=$3 AND revision=$4',[id,session.org_id,session.site_id,version ?? row.revision])).rows[0];
    if(!selected) throw new Error('Glossary term unavailable');
    const items=(await client.query('SELECT revision,status,created_at FROM glossary_versions WHERE term_id=$1 AND org_id=$2 AND site_id=$3 ORDER BY revision DESC LIMIT 20 OFFSET $4',[id,session.org_id,session.site_id,(page-1)*20])).rows;
    return {...row,selected:{...selected,created_at:selected.created_at.toISOString()},history:{items:items.map(item=>({...item,created_at:item.created_at.toISOString()})),total:row.revision,page,pageSize:20}};
  });
}
export async function glossaryReceipt(pool,session,requestId,{schema='public'}={}) {
  glossaryRequestId(requestId);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff');
    const row=(await client.query('SELECT request_json AS request,result_json AS result FROM glossary_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3',[requestId,session.org_id,session.site_id])).rows[0];
    return row ? {found:true,...row} : {found:false};
  });
}
export async function changeGlossary(pool,session,kind,id,input,{schema='public'}={}) {
  const change=glossaryInput(kind,id,input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff');
    // Serialize site terminology edits, then lock drafts before jobs, as preparation completion does.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`understood:glossary:${schema}:${session.org_id}:${session.site_id}`]);
    const old=(await client.query('SELECT request_json,result_json FROM glossary_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3',[input.requestId,session.org_id,session.site_id])).rows[0];
    if(old) {if(glossarySignature(old.request_json)!==glossarySignature(change)) throw new Error('Glossary request conflict');return {...old.result_json,duplicate:true};}
    const current=kind==='create' ? null : (await client.query('SELECT t.*,v.content_json FROM glossary_terms t JOIN glossary_versions v ON v.term_id=t.id AND v.revision=t.revision WHERE t.id=$1 AND t.org_id=$2 AND t.site_id=$3 FOR UPDATE OF t',[id,session.org_id,session.site_id])).rows[0];
    if(kind!=='create' && !current) throw new Error('Glossary term unavailable');
    if(current && current.revision!==change.revision) throw new Error('Glossary revision changed');
    if(current?.status==='removed' && kind!=='restore') throw new Error('Glossary term is removed');
    if(kind==='restore' && current.status!=='removed') throw new Error('Glossary term is active');
    if(kind==='create' && (await client.query('SELECT id FROM glossary_terms WHERE org_id=$1 AND site_id=$2 AND source_lang=$3 AND target_lang=$4 AND term_key=$5',[session.org_id,session.site_id,change.sourceLanguage,change.targetLanguage,termKey(change.term)])).rows.length) throw new Error('Glossary term already exists');
    const previous=current?.content_json,suggestion=['create','regenerate'].includes(kind) ? syntheticTermSuggestion(change.term ?? current.term,change.sourceLanguage ?? current.source_lang,change.targetLanguage ?? current.target_lang) : null;
    if(kind==='regenerate' && !suggestion) throw new Error('Live glossary generation unavailable');
    const content=kind==='create' ? {override:change.override,suggestion:suggestion?.text ?? null,provenance:suggestion?.provenance ?? null} : {...previous,...(kind==='edit' ? {override:change.override} : kind==='regenerate' ? {suggestion:suggestion.text,provenance:suggestion.provenance} : {})};
    const target=kind==='create' ? input.requestId : id,revision=kind==='create' ? 1 : current.revision+1,status=kind==='remove' ? 'removed' : 'active';
    if(!Number.isSafeInteger(revision) || revision>2147483647) throw new Error('Glossary revision exhausted');
    if(kind==='create') {
      if((await client.query('SELECT id FROM glossary_terms WHERE id=$1',[target])).rows.length) throw new Error('Glossary request conflict');
      await client.query('INSERT INTO glossary_terms(id,org_id,site_id,term,term_key,source_lang,target_lang,revision,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[target,session.org_id,session.site_id,change.term,termKey(change.term),change.sourceLanguage,change.targetLanguage,revision,status]);
    } else await client.query('UPDATE glossary_terms SET revision=$4,status=$5,updated_at=clock_timestamp() WHERE id=$1 AND org_id=$2 AND site_id=$3',[target,session.org_id,session.site_id,revision,status]);
    await client.query('INSERT INTO glossary_versions(term_id,org_id,site_id,revision,status,content_json,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[target,session.org_id,session.site_id,revision,status,JSON.stringify(content),session.principal_id]);
    const drafts=(await client.query(`SELECT b.id,b.revision,b.state,(b.prepared_json IS NOT NULL) AS has_prepared FROM briefings b WHERE b.org_id=$1 AND b.site_id=$2 AND NOT EXISTS(SELECT 1 FROM briefing_archives a WHERE a.briefing_id=b.id AND a.org_id=b.org_id AND a.site_id=b.site_id) ORDER BY b.id FOR UPDATE OF b`,[session.org_id,session.site_id])).rows;
    for(const draft of drafts) {
      const next=draft.revision+1,process=draft.state!=='draft' || draft.has_prepared;
      if(next>2147483647) throw new Error('Glossary revision exhausted');
      await client.query('UPDATE briefings SET revision=$4,state=$5,prepared_json=NULL,updated_at=clock_timestamp() WHERE id=$1 AND org_id=$2 AND site_id=$3',[draft.id,session.org_id,session.site_id,next,process ? 'processing' : 'draft']);
      await client.query("UPDATE draft_reviews SET content_json=jsonb_set(content_json,'{revision}',$4::jsonb) WHERE briefing_id=$1 AND org_id=$2 AND site_id=$3",[draft.id,session.org_id,session.site_id,String(next)]);
      await client.query("UPDATE jobs SET status='failed',lease_token=NULL,lease_until=NULL,error='Glossary dependency changed' WHERE briefing_id=$1 AND org_id=$2 AND site_id=$3 AND kind='prepare' AND status IN ('queued','processing')",[draft.id,session.org_id,session.site_id]);
      if(process) {
        const jobId=randomUUID();
        await client.query("INSERT INTO jobs(id,org_id,site_id,briefing_id,revision,kind,status,due_at) VALUES($1,$2,$3,$4,$5,'prepare','queued',clock_timestamp())",[jobId,session.org_id,session.site_id,draft.id,next]);
        await bindPreparationAuthority(client,session,jobId);
      }
    }
    const result={id:target,revision,status,invalidatedDrafts:drafts.length};
    await client.query('INSERT INTO glossary_requests(request_id,org_id,site_id,term_id,request_json,result_json,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[input.requestId,session.org_id,session.site_id,target,JSON.stringify(change),JSON.stringify(result),session.principal_id]);
    await domainAudit(client,session,`glossary.${kind}`,target);return {...result,duplicate:false};
  });
}
