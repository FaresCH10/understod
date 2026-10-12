CREATE TABLE pilot_inquiries (
  id text PRIMARY KEY,receipt_hash text NOT NULL,request_hash text NOT NULL,content_json jsonb,
  destination text,state text NOT NULL CHECK(state IN ('saved','queued','processing','sent','failed','expired')),
  created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,next_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,lease_token text,lease_until timestamptz,provider_id text
);
CREATE INDEX pilot_inquiries_queue ON pilot_inquiries(state,next_at);
CREATE INDEX pilot_inquiries_expiry ON pilot_inquiries(expires_at);
