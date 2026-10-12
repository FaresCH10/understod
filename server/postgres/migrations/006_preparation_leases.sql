ALTER TABLE jobs ADD COLUMN lease_token text;
-- Old processing jobs predate token fencing. Requeue them rather than adopt an unknown worker.
UPDATE jobs SET status='queued',lease_until=NULL WHERE status='processing';
ALTER TABLE jobs ADD CONSTRAINT jobs_processing_lease CHECK
  ((status='processing' AND lease_until IS NOT NULL AND lease_token IS NOT NULL)
    OR (status<>'processing' AND lease_until IS NULL AND lease_token IS NULL));
