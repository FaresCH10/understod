CREATE TABLE invoice_voids (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,invoice_id text NOT NULL UNIQUE,
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 500),request_json jsonb NOT NULL,
  created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(invoice_id,org_id,site_id) REFERENCES invoices(id,org_id,site_id),
  FOREIGN KEY(created_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TRIGGER invoice_voids_immutable BEFORE UPDATE OR DELETE ON invoice_voids FOR EACH ROW EXECUTE FUNCTION protect_invoice_record();
CREATE FUNCTION check_invoice_void() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM invoices WHERE id=NEW.invoice_id AND org_id=NEW.org_id AND site_id=NEW.site_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM invoice_payments WHERE invoice_id=NEW.invoice_id) THEN
    RAISE EXCEPTION 'Only unpaid invoices can be voided' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_void_unpaid BEFORE INSERT ON invoice_voids FOR EACH ROW EXECUTE FUNCTION check_invoice_void();
CREATE FUNCTION check_invoice_payment_not_void() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM invoices WHERE id=NEW.invoice_id AND org_id=NEW.org_id AND site_id=NEW.site_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM invoice_voids WHERE invoice_id=NEW.invoice_id) THEN
    RAISE EXCEPTION 'Invoice is voided' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_payment_not_void BEFORE INSERT ON invoice_payments FOR EACH ROW EXECUTE FUNCTION check_invoice_payment_not_void();
