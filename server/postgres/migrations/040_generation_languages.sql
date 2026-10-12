ALTER TABLE site_settings ADD COLUMN generation_languages_json jsonb NOT NULL DEFAULT '["en","ar","ur"]'::jsonb
  CHECK(generation_languages_json IN ('["en"]'::jsonb,'["en","ar"]'::jsonb,'["en","ur"]'::jsonb,'["en","ar","ur"]'::jsonb));
