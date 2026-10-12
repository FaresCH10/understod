# Frozen Assignment Language

New SQLite publications capture each selected worker's language on the assignment, matching PostgreSQL. The database rejects later language changes and assignments whose publication lacks that language. Worker current/history/detail DTOs, report language denominators, clarification reads and recording assessment use this captured value. Current worker preference remains editable for future publications. Browser speech and content direction use the assignment language, independently of current interface language.

Legacy local synthetic assignments lacked language evidence. The one-time transactional schema upgrade freezes the currently preferred language where the existing snapshot supports it, otherwise its supported English fallback. This is not proof of the language used historically. Missing scope/content prevents upgrade. Later startups and preference changes do not overwrite the frozen value.

The synthetic SQLite-to-PostgreSQL importer accepts both known old and new assignment column shapes. Captured values survive cutover; a legacy backup uses its current worker preference only and requires the publication to support it. Unknown columns and unavailable languages remain failures. No real data or cloud migration occurred.

## Verification

- `tests/assignment-language.test.mjs`: preference change preserves worker content, reports and clarification language; mutation denied; next publication captures new preference; simulated legacy upgrade runs once and leaves publication/attempt rows unchanged.
- `tests/recording-worker.test.mjs`: changing a worker's current preference before assessment does not change the original Urdu question.
- `tests/postgres-import.test.mjs`: modern captured language differs from current preference and survives cutover; old column shape explicitly takes current preference. Embedded PostgreSQL only.
- Before upgrading the running database, native SQLite/private-audio backup was created at `data/backups/pre-language-freeze-2026-10-04`, manifest `40327bce-0bc6-4c9e-84cb-ff06416b2f68`.
- After restart, SHA-256 comparisons of publications (1), attempts (26), receipt records (26), cases (4), audit (15) and original assignment columns (30) were identical. Counts/hashes are saved in `evidence/language-freeze-preservation-2026-10-04.json`.
- Browser report remains v3: 30 assigned, 25 received, 22 matches, 3 clarifications, 5 pending, 83%. Frozen EN/AR/UR groups are 12/10/8, with received 12/10/3. The label now says Assignment language. Screenshot: `evidence/frozen-language-report-2026-10-04.jpg`.

Latest complete suite: 119 tests, 117 pass, no failures, two external PostgreSQL skips; strict TypeScript/Vite build passes. This checkpoint is not production readiness, historical language proof, real-server concurrency/TLS verification or a cloud restore drill.
