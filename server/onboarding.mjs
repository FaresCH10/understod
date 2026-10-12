import {transaction,NOW} from './db.mjs';
import {getSettings} from './settings.mjs';
import {briefingAuthority,briefingAudit} from './preparation.mjs';
import {onboardingInput,onboardingTechnical,onboardingModel} from './onboarding-input.mjs';

export function ensureOnboardingSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS site_onboarding (
    site_id TEXT PRIMARY KEY REFERENCES sites(id),org_id TEXT NOT NULL REFERENCES organizations(id),revision INTEGER NOT NULL CHECK(revision>0),
    step TEXT NOT NULL CHECK(step IN ('organization','team','languages','provider','access','briefing')),
    first_briefing_id TEXT REFERENCES briefings(id),technical_json TEXT NOT NULL,updated_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS onboarding_requests (
    request_id TEXT NOT NULL,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    request_json TEXT NOT NULL,revision INTEGER NOT NULL,requested_by TEXT NOT NULL REFERENCES staff(id),occurred_at TEXT NOT NULL,
    PRIMARY KEY(org_id,site_id,request_id)
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS site_onboarding_scope BEFORE INSERT ON site_onboarding WHEN
    NOT EXISTS(SELECT 1 FROM sites WHERE id=NEW.site_id AND org_id=NEW.org_id) OR
    (NEW.first_briefing_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM briefings WHERE id=NEW.first_briefing_id AND org_id=NEW.org_id AND site_id=NEW.site_id))
    BEGIN SELECT RAISE(ABORT,'Onboarding scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS site_onboarding_scope_update BEFORE UPDATE ON site_onboarding WHEN NEW.org_id<>OLD.org_id OR NEW.site_id<>OLD.site_id OR
    (NEW.first_briefing_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM briefings WHERE id=NEW.first_briefing_id AND org_id=NEW.org_id AND site_id=NEW.site_id))
    BEGIN SELECT RAISE(ABORT,'Onboarding scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS onboarding_request_scope BEFORE INSERT ON onboarding_requests WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.requested_by AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Onboarding scope mismatch'); END;`);
  for(const action of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS onboarding_request_frozen_${action.toLowerCase()} BEFORE ${action} ON onboarding_requests BEGIN SELECT RAISE(ABORT,'Onboarding receipt is immutable'); END;`);
}
export function getOnboarding(db,session) {
  ensureOnboardingSchema(db);const context=getSettings(db,session);
  return transaction(db,()=>{
    const state=db.prepare('SELECT * FROM site_onboarding WHERE site_id=? AND org_id=?').get(session.site_id,session.org_id);
    const resources={workers:db.prepare('SELECT COUNT(*) n FROM workers WHERE org_id=? AND site_id=? AND active=1').get(session.org_id,session.site_id).n,
      activeGrants:db.prepare('SELECT COUNT(*) n FROM worker_grants g JOIN workers w ON w.id=g.worker_id AND w.org_id=g.org_id AND w.site_id=g.site_id WHERE g.org_id=? AND g.site_id=? AND g.expires_at>? AND g.revoked_at IS NULL AND w.active=1').get(session.org_id,session.site_id,NOW()).n,
      firstBriefing:state?.first_briefing_id?db.prepare(`SELECT b.id,b.title,b.state,(SELECT state FROM publications p WHERE p.briefing_id=b.id AND p.org_id=b.org_id AND p.site_id=b.site_id ORDER BY version DESC LIMIT 1) AS publicationState FROM briefings b WHERE b.id=? AND b.org_id=? AND b.site_id=?`).get(state.first_briefing_id,session.org_id,session.site_id) ?? null:null};
    return onboardingModel(context,state,resources);
  });
}
export function saveOnboarding(db,session,input) {
  const value=onboardingInput(input);ensureOnboardingSchema(db);
  return transaction(db,()=>{
    briefingAuthority(db,session);if(session.role!=='owner')throw Error('Forbidden');
    const old=db.prepare('SELECT * FROM onboarding_requests WHERE request_id=? AND org_id=? AND site_id=?').get(input.requestId,session.org_id,session.site_id);
    if(old){if(old.requested_by!==session.principal_id || old.request_json!==JSON.stringify(value))throw Error('Onboarding request conflict');return {revision:old.revision,duplicate:true};}
    const state=db.prepare('SELECT revision FROM site_onboarding WHERE site_id=? AND org_id=?').get(session.site_id,session.org_id);
    if((state?.revision ?? 0)!==value.revision)throw Error('Onboarding revision changed');
    if(value.firstBriefingId && !db.prepare('SELECT id FROM briefings WHERE id=? AND org_id=? AND site_id=?').get(value.firstBriefingId,session.org_id,session.site_id))throw Error('Invalid onboarding briefing');
    const revision=value.revision+1,now=NOW();
    db.prepare('INSERT INTO site_onboarding VALUES(?,?,?,?,?,?,?) ON CONFLICT(site_id) DO UPDATE SET revision=excluded.revision,step=excluded.step,first_briefing_id=excluded.first_briefing_id,technical_json=excluded.technical_json,updated_at=excluded.updated_at')
      .run(session.site_id,session.org_id,revision,value.step,value.firstBriefingId,JSON.stringify(onboardingTechnical()),now);
    db.prepare('INSERT INTO onboarding_requests VALUES(?,?,?,?,?,?,?)').run(input.requestId,session.org_id,session.site_id,JSON.stringify(value),revision,session.principal_id,now);
    briefingAudit(db,session,'onboarding.progress_saved',input.requestId);return {revision,duplicate:false};
  });
}
export function onboardingReceipt(db,session,id) {
  const context=getSettings(db,session);if(!context.canWrite)throw Error('Forbidden');
  const row=db.prepare('SELECT revision,request_json FROM onboarding_requests WHERE request_id=? AND org_id=? AND site_id=? AND requested_by=?').get(id,session.org_id,session.site_id,session.principal_id);
  return row?{found:true,revision:row.revision,request:JSON.parse(row.request_json)}:{found:false};
}
