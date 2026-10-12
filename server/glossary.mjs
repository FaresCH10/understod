import {randomUUID} from 'node:crypto';
import {NOW,transaction} from './db.mjs';
import {briefingAuthority,briefingAudit} from './preparation.mjs';
import {glossaryInput,glossarySignature,glossaryFilters,glossaryHistory,glossaryRequestId,termKey,syntheticTermSuggestion} from './glossary-input.mjs';
import {glossarySnapshot} from './glossary-snapshot.mjs';
export function ensureGlossarySchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS glossary_terms (
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    term TEXT NOT NULL,term_key TEXT NOT NULL,source_lang TEXT NOT NULL CHECK(source_lang IN ('en','ar','ur')),target_lang TEXT NOT NULL CHECK(target_lang IN ('en','ar','ur')),
    revision INTEGER NOT NULL CHECK(revision>0),status TEXT NOT NULL CHECK(status IN ('active','removed')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
    CHECK(source_lang<>target_lang),UNIQUE(org_id,site_id,source_lang,target_lang,term_key)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS glossary_versions (
    term_id TEXT NOT NULL REFERENCES glossary_terms(id),org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),revision INTEGER NOT NULL CHECK(revision>0),
    status TEXT NOT NULL CHECK(status IN ('active','removed')),content_json TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES staff(id),created_at TEXT NOT NULL,PRIMARY KEY(term_id,revision)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS glossary_requests (
    request_id TEXT NOT NULL,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),term_id TEXT NOT NULL REFERENCES glossary_terms(id),
    request_json TEXT NOT NULL,result_json TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES staff(id),created_at TEXT NOT NULL,PRIMARY KEY(org_id,site_id,request_id)
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS glossary_scope BEFORE INSERT ON glossary_terms WHEN NOT EXISTS(SELECT 1 FROM sites WHERE id=NEW.site_id AND org_id=NEW.org_id) BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS glossary_identity BEFORE UPDATE ON glossary_terms WHEN NEW.id IS NOT OLD.id OR NEW.org_id IS NOT OLD.org_id OR NEW.site_id IS NOT OLD.site_id OR NEW.term IS NOT OLD.term OR NEW.term_key IS NOT OLD.term_key OR NEW.source_lang IS NOT OLD.source_lang OR NEW.target_lang IS NOT OLD.target_lang OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;`);
  for(const table of ['glossary_versions','glossary_requests']) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_scope BEFORE INSERT ON ${table} WHEN NOT EXISTS(SELECT 1 FROM glossary_terms WHERE id=NEW.term_id AND org_id=NEW.org_id AND site_id=NEW.site_id) OR NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.created_by AND org_id=NEW.org_id AND site_id=NEW.site_id) BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;`);
    for(const action of ['UPDATE','DELETE']) db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Glossary evidence is immutable'); END;`);
  }
}
function authority(db,session) {
  if(session?.principal_type!=='staff' || !['owner','supervisor','auditor'].includes(session.role) || !db.prepare('SELECT id FROM staff WHERE id=? AND org_id=? AND site_id=? AND role=? AND active=1').get(session.principal_id,session.org_id,session.site_id,session.role)) throw new Error('Forbidden');
}
const scopedRows=db=>db.prepare('SELECT t.*,v.content_json FROM glossary_terms t JOIN glossary_versions v ON v.term_id=t.id AND v.revision=t.revision AND v.org_id=t.org_id AND v.site_id=t.site_id WHERE t.org_id=? AND t.site_id=? ORDER BY t.id');
export function readGlossarySnapshot(db,orgId,siteId) {
  ensureGlossarySchema(db);return glossarySnapshot(scopedRows(db).all(orgId,siteId));
}
export function listGlossary(db,session,input={}) {
  const {search,status,sourceLanguage,targetLanguage,page,pageSize}=glossaryFilters(input);authority(db,session);
  const row=db.prepare(`WITH filtered AS (SELECT t.id,t.term,t.source_lang,t.target_lang,t.revision,t.status,t.updated_at,v.content_json FROM glossary_terms t JOIN glossary_versions v ON v.term_id=t.id AND v.revision=t.revision AND v.org_id=t.org_id AND v.site_id=t.site_id
    WHERE t.org_id=? AND t.site_id=? AND (?='all' OR t.status=?) AND (?='all' OR t.source_lang=?) AND (?='all' OR t.target_lang=?) AND (?='' OR instr(lower(t.term),lower(?))>0 OR instr(lower(COALESCE(json_extract(v.content_json,'$.override'),'')),lower(?))>0 OR instr(lower(COALESCE(json_extract(v.content_json,'$.suggestion'),'')),lower(?))>0))
    SELECT (SELECT COUNT(*) FROM filtered) AS total,(SELECT json_group_array(json_object('id',id,'term',term,'sourceLanguage',source_lang,'targetLanguage',target_lang,'revision',revision,'status',status,'content',json(content_json))) FROM (SELECT * FROM filtered ORDER BY lower(term),id LIMIT ? OFFSET ?)) AS items`).get(session.org_id,session.site_id,status,status,sourceLanguage,sourceLanguage,targetLanguage,targetLanguage,search,search,search,search,pageSize,(page-1)*pageSize);
  return {items:JSON.parse(row.items),total:row.total,page,pageSize};
}
export function getGlossaryTerm(db,session,id,input={}) {
  const {page,version}=glossaryHistory(input);
  return transaction(db,()=>{
    authority(db,session);
    const row=db.prepare('SELECT id,term,source_lang AS sourceLanguage,target_lang AS targetLanguage,revision,status FROM glossary_terms WHERE id=? AND org_id=? AND site_id=?').get(id,session.org_id,session.site_id);
    if(!row) throw new Error('Glossary term unavailable');
    const selected=db.prepare('SELECT revision,status,content_json,created_at FROM glossary_versions WHERE term_id=? AND org_id=? AND site_id=? AND revision=?').get(id,session.org_id,session.site_id,version ?? row.revision);
    if(!selected) throw new Error('Glossary term unavailable');
    const items=db.prepare('SELECT revision,status,created_at FROM glossary_versions WHERE term_id=? AND org_id=? AND site_id=? ORDER BY revision DESC LIMIT 20 OFFSET ?').all(id,session.org_id,session.site_id,(page-1)*20);
    return {...row,selected:{revision:selected.revision,status:selected.status,content:JSON.parse(selected.content_json),created_at:selected.created_at},history:{items,total:row.revision,page,pageSize:20}};
  });
}
export function glossaryReceipt(db,session,requestId) {
  glossaryRequestId(requestId);briefingAuthority(db,session);
  const row=db.prepare('SELECT request_json,result_json FROM glossary_requests WHERE request_id=? AND org_id=? AND site_id=?').get(requestId,session.org_id,session.site_id);
  return row ? {found:true,request:JSON.parse(row.request_json),result:JSON.parse(row.result_json)} : {found:false};
}
export function changeGlossary(db,session,kind,id,input) {
  const change=glossaryInput(kind,id,input);
  return transaction(db,()=>{
    briefingAuthority(db,session);
    const old=db.prepare('SELECT request_json,result_json FROM glossary_requests WHERE request_id=? AND org_id=? AND site_id=?').get(input.requestId,session.org_id,session.site_id);
    if(old) {if(glossarySignature(JSON.parse(old.request_json))!==glossarySignature(change)) throw new Error('Glossary request conflict');return {...JSON.parse(old.result_json),duplicate:true};}
    const current=kind==='create' ? null : db.prepare('SELECT t.*,v.content_json FROM glossary_terms t JOIN glossary_versions v ON v.term_id=t.id AND v.revision=t.revision WHERE t.id=? AND t.org_id=? AND t.site_id=?').get(id,session.org_id,session.site_id);
    if(kind!=='create' && !current) throw new Error('Glossary term unavailable');
    if(current && current.revision!==change.revision) throw new Error('Glossary revision changed');
    if(current?.status==='removed' && kind!=='restore') throw new Error('Glossary term is removed');
    if(kind==='restore' && current.status!=='removed') throw new Error('Glossary term is active');
    if(kind==='create' && db.prepare('SELECT id FROM glossary_terms WHERE org_id=? AND site_id=? AND source_lang=? AND target_lang=? AND term_key=?').get(session.org_id,session.site_id,change.sourceLanguage,change.targetLanguage,termKey(change.term))) throw new Error('Glossary term already exists');
    const previous=current ? JSON.parse(current.content_json) : null,suggestion=['create','regenerate'].includes(kind) ? syntheticTermSuggestion(change.term ?? current.term,change.sourceLanguage ?? current.source_lang,change.targetLanguage ?? current.target_lang) : null;
    if(kind==='regenerate' && !suggestion) throw new Error('Live glossary generation unavailable');
    const content=kind==='create' ? {override:change.override,suggestion:suggestion?.text ?? null,provenance:suggestion?.provenance ?? null} : {...previous,...(kind==='edit' ? {override:change.override} : kind==='regenerate' ? {suggestion:suggestion.text,provenance:suggestion.provenance} : {})};
    const target=kind==='create' ? input.requestId : id,revision=kind==='create' ? 1 : current.revision+1,status=kind==='remove' ? 'removed' : 'active',now=NOW();
    if(!Number.isSafeInteger(revision)) throw new Error('Glossary revision exhausted');
    if(kind==='create' && db.prepare('SELECT id FROM glossary_terms WHERE id=?').get(target)) throw new Error('Glossary request conflict');
    if(kind==='create') db.prepare('INSERT INTO glossary_terms VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(target,session.org_id,session.site_id,change.term,termKey(change.term),change.sourceLanguage,change.targetLanguage,revision,status,now,now);
    else db.prepare('UPDATE glossary_terms SET revision=?,status=?,updated_at=? WHERE id=? AND org_id=? AND site_id=?').run(revision,status,now,target,session.org_id,session.site_id);
    db.prepare('INSERT INTO glossary_versions VALUES(?,?,?,?,?,?,?,?)').run(target,session.org_id,session.site_id,revision,status,JSON.stringify(content),session.principal_id,now);
    const drafts=db.prepare(`SELECT b.id,b.revision,b.state,b.prepared_json IS NOT NULL AS has_prepared FROM briefings b WHERE b.org_id=? AND b.site_id=? AND NOT EXISTS(SELECT 1 FROM briefing_archives a WHERE a.briefing_id=b.id AND a.org_id=b.org_id AND a.site_id=b.site_id) ORDER BY b.id`).all(session.org_id,session.site_id);
    for(const draft of drafts) {
      const next=draft.revision+1,process=draft.state!=='draft' || !!draft.has_prepared;
      if(!Number.isSafeInteger(next)) throw new Error('Glossary revision exhausted');
      db.prepare('UPDATE briefings SET revision=?,state=?,prepared_json=NULL,updated_at=? WHERE id=?').run(next,process ? 'processing' : 'draft',now,draft.id);
      const review=db.prepare('SELECT content_json FROM draft_reviews WHERE briefing_id=?').get(draft.id);
      if(review) db.prepare('UPDATE draft_reviews SET content_json=? WHERE briefing_id=?').run(JSON.stringify({...JSON.parse(review.content_json),revision:next}),draft.id);
      db.prepare("UPDATE jobs SET status='failed',lease_until=NULL,error='Glossary dependency changed' WHERE briefing_id=? AND kind='prepare' AND status IN ('queued','processing')").run(draft.id);
      if(process) db.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,'prepare','queued',0,?,NULL,NULL,?)").run(randomUUID(),session.org_id,session.site_id,draft.id,next,now,now);
    }
    const result={id:target,revision,status,invalidatedDrafts:drafts.length};
    db.prepare('INSERT INTO glossary_requests VALUES(?,?,?,?,?,?,?,?)').run(input.requestId,session.org_id,session.site_id,target,JSON.stringify(change),JSON.stringify(result),session.principal_id,now);
    briefingAudit(db,session,`glossary.${kind}`,target);return {...result,duplicate:false};
  });
}
