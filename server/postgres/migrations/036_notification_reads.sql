ALTER TABLE audit ADD CONSTRAINT audit_scoped_identity UNIQUE(id,org_id,site_id);
CREATE TABLE notification_reads (
  event_id text NOT NULL,staff_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,
  read_at timestamptz NOT NULL,
  PRIMARY KEY(event_id,staff_id),
  FOREIGN KEY(event_id,org_id,site_id) REFERENCES audit(id,org_id,site_id),
  FOREIGN KEY(staff_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE INDEX notification_reads_staff ON notification_reads(org_id,site_id,staff_id,event_id);
CREATE FUNCTION protect_notification_read() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Notification read receipt is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER notification_reads_immutable BEFORE UPDATE OR DELETE ON notification_reads
  FOR EACH ROW EXECUTE FUNCTION protect_notification_read();
