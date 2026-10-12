CREATE TABLE activity_retention_policies (
  site_id text PRIMARY KEY,org_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  days integer CHECK(days IN (7,30,90,365)),updated_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE activity_retention_requests (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,actor_id text NOT NULL,
  request_json jsonb NOT NULL,revision integer NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(actor_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TRIGGER activity_retention_requests_frozen BEFORE UPDATE OR DELETE ON activity_retention_requests
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE TABLE activity_identity_purges (
  event_id text PRIMARY KEY REFERENCES audit(id),org_id text NOT NULL,site_id text NOT NULL,
  policy_revision integer NOT NULL CHECK(policy_revision>0),days integer NOT NULL CHECK(days IN (7,30,90,365)),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE INDEX activity_identity_purges_scope ON activity_identity_purges(org_id,site_id);
CREATE INDEX audit_retention_due ON audit(org_id,site_id,occurred_at,id);
CREATE TRIGGER activity_identity_purges_frozen BEFORE UPDATE OR DELETE ON activity_identity_purges
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE FUNCTION guard_activity_identity_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM audit e JOIN activity_retention_policies p ON p.org_id=e.org_id AND p.site_id=e.site_id
    WHERE e.id=NEW.event_id AND e.org_id=NEW.org_id AND e.site_id=NEW.site_id
      AND p.revision=NEW.policy_revision AND p.days=NEW.days
      AND e.occurred_at<=clock_timestamp()-p.days*interval '1 day') THEN
    RAISE EXCEPTION 'Activity retention scope or policy unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activity_identity_purge_scope BEFORE INSERT ON activity_identity_purges
  FOR EACH ROW EXECUTE FUNCTION guard_activity_identity_purge();
CREATE FUNCTION verify_activity_identity_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM audit WHERE id=NEW.event_id AND org_id=NEW.org_id AND site_id=NEW.site_id AND actor_id='' AND object_id='') THEN
    RAISE EXCEPTION 'Activity identity redaction incomplete';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER activity_identity_purge_complete AFTER INSERT ON activity_identity_purges
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_activity_identity_purge();
CREATE OR REPLACE FUNCTION protect_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.actor_id='' AND NEW.object_id=''
    AND (NEW.id,NEW.org_id,NEW.site_id,NEW.actor_type,NEW.action,NEW.occurred_at)
      IS NOT DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.actor_type,OLD.action,OLD.occurred_at)
    AND EXISTS(SELECT 1 FROM activity_identity_purges d WHERE d.event_id=OLD.id AND d.org_id=OLD.org_id AND d.site_id=OLD.site_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Audit events are read-only' USING ERRCODE='23514';
END $$;
