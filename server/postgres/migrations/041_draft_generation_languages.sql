ALTER TABLE draft_creations ADD COLUMN generation_languages_json jsonb
  CHECK(generation_languages_json IS NULL OR generation_languages_json IN
    ('["en"]'::jsonb,'["en","ar"]'::jsonb,'["en","ur"]'::jsonb,'["en","ar","ur"]'::jsonb));
