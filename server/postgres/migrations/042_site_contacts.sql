ALTER TABLE site_settings ADD COLUMN primary_contact_id text,
  ADD COLUMN deputy_contact_id text,
  ADD FOREIGN KEY(primary_contact_id,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  ADD FOREIGN KEY(deputy_contact_id,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  ADD CHECK(deputy_contact_id IS NULL OR (primary_contact_id IS NOT NULL AND deputy_contact_id<>primary_contact_id));
