CREATE TABLE invoices (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,
  number text NOT NULL CHECK(number ~ '^[A-Z0-9][A-Z0-9-]{0,39}$'),description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 500),
  issue_date date NOT NULL,due_date date NOT NULL,amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000),
  currency text NOT NULL CHECK(currency='USD'),request_json jsonb NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  issuer_name text NOT NULL,site_name text NOT NULL,
  UNIQUE(id,org_id,site_id),UNIQUE(org_id,site_id,number),CHECK(due_date>=issue_date),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),FOREIGN KEY(created_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TABLE invoice_payments (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,invoice_id text NOT NULL,
  amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000),payment_date date NOT NULL,
  reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 120),note text NOT NULL CHECK(length(note)<=500),request_json jsonb NOT NULL,
  recorded_by text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(invoice_id,org_id,site_id) REFERENCES invoices(id,org_id,site_id),
  FOREIGN KEY(recorded_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE INDEX invoice_payment_total ON invoice_payments(invoice_id,org_id,site_id);
CREATE FUNCTION protect_invoice_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Invoice record is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_invoice_record();
CREATE TRIGGER invoice_payments_immutable BEFORE UPDATE OR DELETE ON invoice_payments FOR EACH ROW EXECUTE FUNCTION protect_invoice_record();
CREATE FUNCTION check_invoice_payment_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total integer; paid bigint;
BEGIN
  SELECT amount_cents INTO total FROM invoices WHERE id=NEW.invoice_id AND org_id=NEW.org_id AND site_id=NEW.site_id FOR UPDATE;
  IF total IS NULL THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(SUM(amount_cents),0) INTO paid FROM invoice_payments WHERE invoice_id=NEW.invoice_id AND org_id=NEW.org_id AND site_id=NEW.site_id;
  IF paid+NEW.amount_cents>total THEN RAISE EXCEPTION 'Payment exceeds outstanding balance' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_payment_balance BEFORE INSERT ON invoice_payments FOR EACH ROW EXECUTE FUNCTION check_invoice_payment_balance();
