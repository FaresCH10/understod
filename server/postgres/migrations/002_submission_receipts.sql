-- Receipt sequence determines the latest typed or audio submission when timestamps tie.
-- Keep this migration additive: 001_initial.sql may already be applied.

ALTER TABLE assignments ADD CONSTRAINT assignments_id_org_key UNIQUE (id, org_id);

CREATE TABLE submission_receipts (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  assignment_id text NOT NULL,
  submission_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('typed', 'audio')),
  received_at timestamptz NOT NULL,
  FOREIGN KEY (assignment_id, org_id) REFERENCES assignments(id, org_id),
  UNIQUE (assignment_id, submission_id)
);

CREATE FUNCTION protect_submission_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Receipt is immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER submission_receipts_frozen BEFORE UPDATE ON submission_receipts
  FOR EACH ROW EXECUTE FUNCTION protect_submission_receipt();

CREATE INDEX idx_submission_receipts_latest ON submission_receipts(assignment_id, sequence DESC);
