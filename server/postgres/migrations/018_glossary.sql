CREATE TABLE glossary_terms (
  id text PRIMARY KEY, org_id text NOT NULL, site_id text NOT NULL,
  term text NOT NULL, term_key text NOT NULL,
  source_lang text NOT NULL CHECK(source_lang IN ('en','ar','ur')), target_lang text NOT NULL CHECK(target_lang IN ('en','ar','ur')),
  revision integer NOT NULL CHECK(revision>0), status text NOT NULL CHECK(status IN ('active','removed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(source_lang<>target_lang), UNIQUE(id,org_id,site_id), UNIQUE(org_id,site_id,source_lang,target_lang,term_key),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE glossary_versions (
  term_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  status text NOT NULL CHECK(status IN ('active','removed')),content_json jsonb NOT NULL,
  created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(term_id,revision),
  FOREIGN KEY(term_id,org_id,site_id) REFERENCES glossary_terms(id,org_id,site_id),
  FOREIGN KEY(created_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TABLE glossary_requests (
  request_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,term_id text NOT NULL,
  request_json jsonb NOT NULL,result_json jsonb NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(org_id,site_id,request_id),FOREIGN KEY(term_id,org_id,site_id) REFERENCES glossary_terms(id,org_id,site_id),
  FOREIGN KEY(created_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION freeze_glossary_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Glossary evidence is immutable'; END;
$$;
CREATE TRIGGER glossary_versions_frozen BEFORE UPDATE OR DELETE ON glossary_versions FOR EACH ROW EXECUTE FUNCTION freeze_glossary_evidence();
CREATE TRIGGER glossary_requests_frozen BEFORE UPDATE OR DELETE ON glossary_requests FOR EACH ROW EXECUTE FUNCTION freeze_glossary_evidence();
CREATE FUNCTION freeze_glossary_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.term IS DISTINCT FROM OLD.term OR NEW.term_key IS DISTINCT FROM OLD.term_key
    OR NEW.source_lang IS DISTINCT FROM OLD.source_lang OR NEW.target_lang IS DISTINCT FROM OLD.target_lang OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER glossary_identity_frozen BEFORE UPDATE ON glossary_terms FOR EACH ROW EXECUTE FUNCTION freeze_glossary_identity();
