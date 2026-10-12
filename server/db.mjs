import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {createHash} from 'node:crypto';
import {upgradeStaffRoles,ensureStaffSchema} from './staff-schema.mjs';
import {ensureAccountSchema} from './account-schema.mjs';
import {ensureScheduleSchema} from './schedule-schema.mjs';
import {ensureReminderSchema} from './reminder-schema.mjs';
import {ensureSiteSchema} from './site-schema.mjs';

export const NOW = () => new Date().toISOString();

export function openDatabase(path = process.env.UNDERSTOOD_DB || 'data/understood.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.function('sha256',{deterministic:true},(value)=>createHash('sha256').update(value).digest('hex'));
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL, timezone TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id), name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','administrator','supervisor','auditor')), active INTEGER NOT NULL DEFAULT 1
    ) STRICT;
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id), code TEXT NOT NULL,
      language TEXT NOT NULL CHECK(language IN ('en','ar','ur')),
      active INTEGER NOT NULL DEFAULT 1, UNIQUE(org_id, code)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS briefings (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id), title TEXT NOT NULL,
      source TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      next_version INTEGER NOT NULL DEFAULT 1,
      state TEXT NOT NULL CHECK(state IN ('draft','processing','ready','failed')),
      prepared_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS publications (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id), briefing_id TEXT NOT NULL REFERENCES briefings(id),
      version INTEGER NOT NULL, snapshot_json TEXT NOT NULL, published_at TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('published','withdrawn','superseded','archived')),
      UNIQUE(briefing_id, version)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id), publication_id TEXT NOT NULL REFERENCES publications(id),
      worker_id TEXT NOT NULL REFERENCES workers(id), due_at TEXT, created_at TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','ar','ur')),
      UNIQUE(publication_id, worker_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      assignment_id TEXT NOT NULL REFERENCES assignments(id),
      submission_id TEXT NOT NULL, answer_text TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('matched','clarification','unassessable')),
      reasons_json TEXT NOT NULL, received_at TEXT NOT NULL,
      UNIQUE(assignment_id, submission_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS clarifications (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      assignment_id TEXT NOT NULL REFERENCES assignments(id),
      attempt_id TEXT REFERENCES attempts(id), reason TEXT NOT NULL,
      owner_staff_id TEXT REFERENCES staff(id), status TEXT NOT NULL CHECK(status IN ('open','resolved')),
      notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      UNIQUE(attempt_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id), briefing_id TEXT NOT NULL REFERENCES briefings(id),
      revision INTEGER NOT NULL, kind TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued','processing','ready','failed')),
      attempts INTEGER NOT NULL DEFAULT 0, due_at TEXT NOT NULL,
      lease_until TEXT, error TEXT, created_at TEXT NOT NULL,
      UNIQUE(briefing_id, revision, kind)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id), principal_type TEXT NOT NULL CHECK(principal_type IN ('staff','worker')),
      principal_id TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT,
      grant_id TEXT REFERENCES worker_grants(id),
      access_mode TEXT NOT NULL DEFAULT 'demo' CHECK(access_mode IN ('demo','credential'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS staff_credentials (
      staff_id TEXT PRIMARY KEY REFERENCES staff(id), email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
      changed_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS worker_grants (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id), worker_id TEXT NOT NULL REFERENCES workers(id),
      token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
      redeemed_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS auth_attempts (
      key_hash TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK(count >= 0),
      window_started_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id), actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL, action TEXT NOT NULL, object_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_assignments_worker ON assignments(worker_id, publication_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_assignment ON attempts(assignment_id, received_at);
    CREATE INDEX IF NOT EXISTS idx_clarifications_org_status ON clarifications(org_id, status);
    CREATE INDEX IF NOT EXISTS idx_jobs_status_due ON jobs(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_worker_grants_worker ON worker_grants(worker_id, revoked_at);
    CREATE INDEX IF NOT EXISTS idx_audit_scope_time ON audit(org_id,site_id,occurred_at DESC,id);
    CREATE TRIGGER IF NOT EXISTS audit_frozen_update BEFORE UPDATE ON audit
      BEGIN SELECT RAISE(ABORT,'Audit events are read-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_frozen_delete BEFORE DELETE ON audit
      BEGIN SELECT RAISE(ABORT,'Audit events are read-only'); END;
  `);
  upgradeStaffRoles(db,path);
  ensureStaffSchema(db);
  if (!db.prepare("PRAGMA table_info(sessions)").all().some((column) => column.name === 'grant_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN grant_id TEXT REFERENCES worker_grants(id)');
  }
  if (!db.prepare("PRAGMA table_info(sessions)").all().some((column) => column.name === 'access_mode')) {
    db.exec("ALTER TABLE sessions ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'demo' CHECK(access_mode IN ('demo','credential'))");
  }
  if (!db.prepare('PRAGMA table_info(assignments)').all().some((column) => column.name === 'language')) {
    transaction(db, () => {
      const legacy = db.prepare(`SELECT a.id,w.language,p.snapshot_json FROM assignments a
        JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
        JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id`).all();
      if (legacy.length !== db.prepare('SELECT COUNT(*) AS n FROM assignments').get().n) throw new Error('Legacy assignment scope mismatch');
      const values = legacy.map((row) => {
        const languages = JSON.parse(row.snapshot_json).languages;
        const language = languages?.[row.language] ? row.language : languages?.en ? 'en' : null;
        if (!language) throw new Error('Legacy assignment language unavailable');
        return [language,row.id];
      });
      db.exec("ALTER TABLE assignments ADD COLUMN language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','ar','ur'))");
      const update = db.prepare('UPDATE assignments SET language=? WHERE id=?');
      for (const value of values) update.run(...value);
    });
  }
  db.exec(`CREATE TRIGGER IF NOT EXISTS assignment_language_frozen BEFORE UPDATE OF language ON assignments
    WHEN NEW.language IS NOT OLD.language BEGIN SELECT RAISE(ABORT,'Assignment language is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS assignment_language_available BEFORE INSERT ON assignments
    WHEN NOT EXISTS(SELECT 1 FROM publications p WHERE p.id=NEW.publication_id
      AND json_type(p.snapshot_json,'$.languages.'||NEW.language)='object')
    BEGIN SELECT RAISE(ABORT,'Assignment language unavailable'); END;`);
  db.exec(`CREATE TABLE IF NOT EXISTS notification_reads (
    event_id TEXT NOT NULL REFERENCES audit(id),staff_id TEXT NOT NULL REFERENCES staff(id),
    org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),read_at TEXT NOT NULL,
    PRIMARY KEY(event_id,staff_id)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS notification_reads_staff ON notification_reads(org_id,site_id,staff_id,event_id);
  CREATE TRIGGER IF NOT EXISTS notification_reads_immutable_update BEFORE UPDATE ON notification_reads
    BEGIN SELECT RAISE(ABORT,'Notification read receipt is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS notification_reads_immutable_delete BEFORE DELETE ON notification_reads
    BEGIN SELECT RAISE(ABORT,'Notification read receipt is immutable'); END;`);
  const scopedRelations = {
    notification_reads: `NOT EXISTS (SELECT 1 FROM audit e WHERE e.id=NEW.event_id AND e.org_id=NEW.org_id AND e.site_id=NEW.site_id)
      OR NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=NEW.staff_id AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id)`,
    staff: `NOT EXISTS (SELECT 1 FROM sites s WHERE s.id=NEW.site_id AND s.org_id=NEW.org_id)`,
    workers: `NOT EXISTS (SELECT 1 FROM sites s WHERE s.id=NEW.site_id AND s.org_id=NEW.org_id)`,
    briefings: `NOT EXISTS (SELECT 1 FROM sites s WHERE s.id=NEW.site_id AND s.org_id=NEW.org_id)`,
    publications: `NOT EXISTS (SELECT 1 FROM briefings b WHERE b.id=NEW.briefing_id AND b.org_id=NEW.org_id AND b.site_id=NEW.site_id)`,
    assignments: `NOT EXISTS (SELECT 1 FROM publications p WHERE p.id=NEW.publication_id AND p.org_id=NEW.org_id AND p.site_id=NEW.site_id)
      OR NOT EXISTS (SELECT 1 FROM workers w WHERE w.id=NEW.worker_id AND w.org_id=NEW.org_id AND w.site_id=NEW.site_id)`,
    attempts: `NOT EXISTS (SELECT 1 FROM assignments a WHERE a.id=NEW.assignment_id AND a.org_id=NEW.org_id)`,
    clarifications: `NOT EXISTS (SELECT 1 FROM assignments a WHERE a.id=NEW.assignment_id AND a.org_id=NEW.org_id)
      OR (NEW.attempt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attempts t WHERE t.id=NEW.attempt_id AND t.org_id=NEW.org_id AND t.assignment_id=NEW.assignment_id))
      OR (NEW.owner_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s JOIN assignments a ON a.id=NEW.assignment_id WHERE s.id=NEW.owner_staff_id AND s.org_id=NEW.org_id AND s.site_id=a.site_id))`,
    jobs: `NOT EXISTS (SELECT 1 FROM briefings b WHERE b.id=NEW.briefing_id AND b.org_id=NEW.org_id AND b.site_id=NEW.site_id)`,
    worker_grants: `NOT EXISTS (SELECT 1 FROM workers w WHERE w.id=NEW.worker_id AND w.org_id=NEW.org_id AND w.site_id=NEW.site_id)`,
    sessions: `NOT EXISTS (SELECT 1 FROM sites s WHERE s.id=NEW.site_id AND s.org_id=NEW.org_id)
      OR (NEW.principal_type='staff' AND NOT EXISTS (SELECT 1 FROM staff p WHERE p.id=NEW.principal_id AND p.org_id=NEW.org_id AND p.site_id=NEW.site_id))
      OR (NEW.principal_type='worker' AND NOT EXISTS (SELECT 1 FROM workers p WHERE p.id=NEW.principal_id AND p.org_id=NEW.org_id AND p.site_id=NEW.site_id))
      OR (NEW.grant_id IS NOT NULL AND (NEW.principal_type!='worker' OR NOT EXISTS
        (SELECT 1 FROM worker_grants g WHERE g.id=NEW.grant_id AND g.worker_id=NEW.principal_id AND g.org_id=NEW.org_id AND g.site_id=NEW.site_id)))`,
    audit: `NOT EXISTS (SELECT 1 FROM sites s WHERE s.id=NEW.site_id AND s.org_id=NEW.org_id)`,
  };
  db.exec('DROP TRIGGER IF EXISTS sessions_scope_insert; DROP TRIGGER IF EXISTS sessions_scope_update;');
  for (const [table, invalid] of Object.entries(scopedRelations)) {
    for (const operation of ['INSERT', 'UPDATE']) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_scope_${operation.toLowerCase()}
        BEFORE ${operation} ON ${table} WHEN ${invalid}
        BEGIN SELECT RAISE(ABORT, 'Scope mismatch'); END;`);
    }
  }
  ensureAccountSchema(db);
  ensureSiteSchema(db);
  ensureScheduleSchema(db);
  ensureReminderSchema(db);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
