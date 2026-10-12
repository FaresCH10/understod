CREATE TABLE directory_reactivations (
  request_id text NOT NULL,
  org_id text NOT NULL,
  site_id text NOT NULL,
  worker_id text,
  crew_id text,
  expected_label text NOT NULL CHECK(length(btrim(expected_label)) BETWEEN 2 AND 80),
  requested_by text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(org_id,site_id,request_id),
  CHECK((worker_id IS NULL) <> (crew_id IS NULL)),
  FOREIGN KEY(worker_id,org_id,site_id) REFERENCES workers(id,org_id,site_id),
  FOREIGN KEY(crew_id,org_id,site_id) REFERENCES crews(id,org_id,site_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION protect_directory_reactivation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Reactivation receipt is immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER directory_reactivations_immutable BEFORE UPDATE OR DELETE ON directory_reactivations
  FOR EACH ROW EXECUTE FUNCTION protect_directory_reactivation();
