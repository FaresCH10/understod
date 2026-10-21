ALTER TABLE storage_probes DROP CONSTRAINT storage_probes_adapter_check;
ALTER TABLE storage_probes ADD CONSTRAINT storage_probes_adapter_check
  CHECK(adapter IN ('local','r2','neon'));
