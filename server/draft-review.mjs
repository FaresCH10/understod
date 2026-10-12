import {randomUUID} from 'node:crypto';
import {transaction,NOW} from './db.mjs';
import {briefingAuthority,briefingAudit,assertBriefingActive} from './preparation.mjs';
import {reviewInput,sameReview,reviewRequestId} from './briefing-input.mjs';

export function ensureDraftReviewSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS draft_reviews (
    briefing_id TEXT PRIMARY KEY REFERENCES briefings(id),org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),content_json TEXT NOT NULL
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS draft_review_scope BEFORE INSERT ON draft_reviews
    WHEN NOT EXISTS(SELECT 1 FROM briefings WHERE id=NEW.briefing_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS draft_review_scope_update BEFORE UPDATE ON draft_reviews
    WHEN NEW.briefing_id IS NOT OLD.briefing_id OR NEW.org_id IS NOT OLD.org_id OR NEW.site_id IS NOT OLD.site_id
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TABLE IF NOT EXISTS briefing_review_requests (
    request_id TEXT NOT NULL,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    briefing_id TEXT NOT NULL REFERENCES briefings(id),accepted_revision INTEGER NOT NULL CHECK(accepted_revision>1),request_json TEXT NOT NULL,
    requested_by TEXT NOT NULL REFERENCES staff(id),occurred_at TEXT NOT NULL,PRIMARY KEY(org_id,site_id,request_id)
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS briefing_review_request_scope BEFORE INSERT ON briefing_review_requests
    WHEN NOT EXISTS(SELECT 1 FROM briefings WHERE id=NEW.briefing_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
      OR NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.requested_by AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS briefing_review_request_update BEFORE UPDATE ON briefing_review_requests BEGIN SELECT RAISE(ABORT,'Draft review receipt is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS briefing_review_request_delete BEFORE DELETE ON briefing_review_requests BEGIN SELECT RAISE(ABORT,'Draft review receipt is immutable'); END;`);
}
export function getDraftReview(db,id,orgId,siteId) {
  const row=db.prepare('SELECT content_json FROM draft_reviews WHERE briefing_id=? AND org_id=? AND site_id=?').get(id,orgId,siteId);
  return row ? JSON.parse(row.content_json) : null;
}
export function saveDraftReview(db,session,id,input) {
  const content=reviewInput(input);
  return transaction(db,()=>{
    briefingAuthority(db,session);
    const row=db.prepare('SELECT revision FROM briefings WHERE id=? AND org_id=? AND site_id=?').get(id,session.org_id,session.site_id);
    if(!row) throw new Error('Briefing unavailable');
    const old=db.prepare('SELECT * FROM briefing_review_requests WHERE request_id=? AND org_id=? AND site_id=?').get(input.requestId,session.org_id,session.site_id);
    if(old) {
      if(old.briefing_id!==id || !sameReview(JSON.parse(old.request_json),content)) throw new Error('Draft review request conflict');
      return {id,revision:old.accepted_revision,duplicate:true};
    }
    assertBriefingActive(db,session,id);
    if(row.revision!==content.revision) throw new Error('Draft revision changed');
    const revision=row.revision+1,now=NOW(),jobId=randomUUID();
    db.prepare("UPDATE jobs SET status='failed',lease_until=NULL,error='Obsolete draft revision' WHERE briefing_id=? AND org_id=? AND site_id=? AND kind='prepare' AND status IN ('queued','processing')").run(id,session.org_id,session.site_id);
    db.prepare("UPDATE briefings SET revision=?,state='processing',prepared_json=NULL,updated_at=? WHERE id=? AND org_id=? AND site_id=?").run(revision,now,id,session.org_id,session.site_id);
    db.prepare('INSERT INTO draft_reviews VALUES(?,?,?,?) ON CONFLICT(briefing_id) DO UPDATE SET content_json=excluded.content_json').run(id,session.org_id,session.site_id,JSON.stringify({...content,revision}));
    db.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,'prepare','queued',0,?,NULL,NULL,?)").run(jobId,session.org_id,session.site_id,id,revision,now,now);
    db.prepare('INSERT INTO briefing_review_requests VALUES(?,?,?,?,?,?,?,?)').run(input.requestId,session.org_id,session.site_id,id,revision,JSON.stringify(content),session.principal_id,now);
    briefingAudit(db,session,'briefing.review_updated',id);
    return {id,revision,duplicate:false};
  });
}
export function draftReviewReceipt(db,session,requestId) {
  reviewRequestId(requestId);briefingAuthority(db,session);
  const row=db.prepare('SELECT briefing_id,accepted_revision,request_json FROM briefing_review_requests WHERE request_id=? AND org_id=? AND site_id=?').get(requestId,session.org_id,session.site_id);
  return row ? {found:true,id:row.briefing_id,revision:row.accepted_revision,request:JSON.parse(row.request_json)} : {found:false};
}
