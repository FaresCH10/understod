CREATE FUNCTION protect_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are read-only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER audit_frozen_update_delete BEFORE UPDATE OR DELETE ON audit
  FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
