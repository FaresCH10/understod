-- Row-lock permission must not become authority to rotate credentials or staff access.
CREATE FUNCTION restrict_identity_runtime_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT has_table_privilege(current_user,TG_RELID,'UPDATE') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Restricted runtime identity lock columns are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['staff','staff_accounts','staff_credentials','staff_access_revisions'] LOOP
    EXECUTE format('CREATE TRIGGER identity_runtime_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION restrict_identity_runtime_update()',table_name);
  END LOOP;
END $$;
