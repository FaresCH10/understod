import { randomUUID } from 'node:crypto';
import { NOW, transaction } from './db.mjs';

export function requirePeopleStaff(db,session) {
  if (session?.principal_type !== 'staff' || !['owner', 'supervisor'].includes(session.role)
    || !db.prepare('SELECT id FROM staff WHERE id=? AND org_id=? AND site_id=? AND role=? AND active=1')
      .get(session.principal_id,session.org_id,session.site_id,session.role)) throw new Error('Forbidden');
}

export function inputKeys(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !allowed.includes(key))) throw new Error('Invalid input');
}

export function name(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'-]{1,79}$/u.test(text)) throw new Error(`Invalid ${label}`);
  return text;
}

function language(value) {
  if (!['en', 'ar', 'ur'].includes(value)) throw new Error('Invalid language');
  return value;
}

function audit(db, session, action, objectId) {
  db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?,?,?)').run(
    randomUUID(), session.org_id, session.site_id, 'staff', session.principal_id, action, objectId, NOW(),
  );
}

export function ensurePeopleSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crews (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id), name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      UNIQUE(org_id,site_id,name)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS crew_memberships (
      worker_id TEXT PRIMARY KEY REFERENCES workers(id),
      org_id TEXT NOT NULL REFERENCES organizations(id),
      site_id TEXT NOT NULL REFERENCES sites(id),
      crew_id TEXT NOT NULL REFERENCES crews(id), joined_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_crews_scope ON crews(org_id,site_id,active,name);
    CREATE INDEX IF NOT EXISTS idx_crew_memberships_crew ON crew_memberships(crew_id,org_id,site_id);
    CREATE TABLE IF NOT EXISTS directory_reactivations (
      request_id TEXT NOT NULL,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
      worker_id TEXT REFERENCES workers(id),crew_id TEXT REFERENCES crews(id),expected_label TEXT NOT NULL CHECK(length(trim(expected_label)) BETWEEN 2 AND 80),
      requested_by TEXT NOT NULL REFERENCES staff(id),occurred_at TEXT NOT NULL,
      PRIMARY KEY(org_id,site_id,request_id),CHECK((worker_id IS NULL) != (crew_id IS NULL))
    ) STRICT;
    CREATE TRIGGER IF NOT EXISTS directory_reactivation_scope BEFORE INSERT ON directory_reactivations
      WHEN NOT EXISTS(SELECT 1 FROM staff s WHERE s.id=NEW.requested_by AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id)
        OR (NEW.worker_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workers w WHERE w.id=NEW.worker_id AND w.org_id=NEW.org_id AND w.site_id=NEW.site_id))
        OR (NEW.crew_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM crews c WHERE c.id=NEW.crew_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id))
      BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
    CREATE TRIGGER IF NOT EXISTS directory_reactivation_frozen_update BEFORE UPDATE ON directory_reactivations
      BEGIN SELECT RAISE(ABORT,'Reactivation receipt is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS directory_reactivation_frozen_delete BEFORE DELETE ON directory_reactivations
      BEGIN SELECT RAISE(ABORT,'Reactivation receipt is immutable'); END;
  `);
  for (const operation of ['INSERT', 'UPDATE']) {
    const op = operation.toLowerCase();
    db.exec(`CREATE TRIGGER IF NOT EXISTS crews_scope_${op}
      BEFORE ${operation} ON crews
      WHEN NOT EXISTS (SELECT 1 FROM sites s WHERE s.id=NEW.site_id AND s.org_id=NEW.org_id)
      BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS crew_memberships_scope_${op}
      BEFORE ${operation} ON crew_memberships
      WHEN NOT EXISTS (SELECT 1 FROM workers w WHERE w.id=NEW.worker_id AND w.org_id=NEW.org_id AND w.site_id=NEW.site_id)
        OR NOT EXISTS (SELECT 1 FROM crews c WHERE c.id=NEW.crew_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id)
      BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;`);
  }
}

function workerRow(db, session, id) {
  const row = db.prepare(`SELECT w.id,w.org_id,w.site_id,w.code,w.language,w.active,
    cm.crew_id,c.name AS crew_name FROM workers w
    LEFT JOIN crew_memberships cm ON cm.worker_id=w.id AND cm.org_id=w.org_id AND cm.site_id=w.site_id
    LEFT JOIN crews c ON c.id=cm.crew_id AND c.org_id=w.org_id AND c.site_id=w.site_id
    WHERE w.id=? AND w.org_id=? AND w.site_id=?`).get(id, session.org_id, session.site_id);
  if (!row) throw new Error('Worker unavailable');
  return { ...row, active: !!row.active };
}

export function listWorkers(db, session, filters = {}) {
  return transaction(db,() => {
  requirePeopleStaff(db,session);
  const {page,pageSize,search,selectedLanguage,status,crewId,workerId}=workerFilters(filters);
  const where = ['w.org_id=?', 'w.site_id=?'];
  const args = [session.org_id, session.site_id];
  if(workerId!==null){where.push('w.id=?');args.push(workerId);}
  if (search.trim()) { where.push('instr(lower(w.code),lower(?))>0'); args.push(search.trim()); }
  if (selectedLanguage !== 'all') { where.push('w.language=?'); args.push(selectedLanguage); }
  if (status !== 'all') { where.push('w.active=?'); args.push(status === 'active' ? 1 : 0); }
  if(crewId!=='all') {
    if(crewId!=='none') crewRow(db,session,crewId);
    where.push(`${crewId==='none' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM crew_memberships filter_membership
      WHERE filter_membership.worker_id=w.id AND filter_membership.org_id=w.org_id AND filter_membership.site_id=w.site_id${crewId==='none' ? '' : ' AND filter_membership.crew_id=?'})`);
    if(crewId!=='none') args.push(crewId);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM workers w WHERE ${clause}`).get(...args).n;
  const items = db.prepare(`SELECT w.id,w.org_id,w.site_id,w.code,w.language,w.active,
      cm.crew_id,c.name AS crew_name FROM workers w
      LEFT JOIN crew_memberships cm ON cm.worker_id=w.id AND cm.org_id=w.org_id AND cm.site_id=w.site_id
      LEFT JOIN crews c ON c.id=cm.crew_id AND c.org_id=w.org_id AND c.site_id=w.site_id
      WHERE ${clause} ORDER BY w.code COLLATE NOCASE,w.id LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize).map((row) => ({ ...row, active: !!row.active }));
  return { items, total, page, pageSize };
  });
}

export function workerFilters(filters={}) {
  inputKeys(filters, ['search', 'language', 'status', 'page', 'pageSize','crewId','workerId']);
  const page = filters.page === undefined ? 1 : Number(filters.page);
  const pageSize = filters.pageSize === undefined ? 5 : Number(filters.pageSize);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      page > Math.floor(Number.MAX_SAFE_INTEGER / pageSize)) throw new Error('Invalid page');
  const search = filters.search === undefined ? '' : filters.search;
  if (typeof search !== 'string' || search.length > 80) throw new Error('Invalid search');
  const selectedLanguage = filters.language ?? 'all';
  if (!['all', 'en', 'ar', 'ur'].includes(selectedLanguage)) throw new Error('Invalid language');
  const status = filters.status ?? 'active';
  if (!['all', 'active', 'inactive'].includes(status)) throw new Error('Invalid status');
  const crewId=filters.crewId===undefined ? 'all' : filters.crewId;
  if(typeof crewId!=='string' || !crewId || crewId.length>100) throw new Error('Invalid crew');
  const workerId=filters.workerId??null;
  if(workerId!==null && (typeof workerId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(workerId)))throw Error('Invalid worker');
  return {page,pageSize,search,selectedLanguage,status,crewId,workerId};
}

export function createWorker(db, session, input) {
  requirePeopleStaff(db,session);
  const { code, language: preferredLanguage } = validateWorkerInput(input);
  const id = randomUUID();
  transaction(db, () => {
    db.prepare('INSERT INTO workers (id,org_id,site_id,code,language,active) VALUES (?,?,?,?,?,1)')
      .run(id, session.org_id, session.site_id, code, preferredLanguage);
    audit(db, session, 'worker.created', id);
  });
  return workerRow(db, session, id);
}

export function validateWorkerInput(input) {
  inputKeys(input, ['code', 'language']);
  return { code: name(input.code, 'worker code'), language: language(input.language) };
}

export function updateWorker(db, session, id, input) {
  requirePeopleStaff(db,session);
  inputKeys(input, ['code', 'language']);
  if (!Object.keys(input).length) throw new Error('Invalid input');
  const before = workerRow(db, session, id);
  const code = input.code === undefined ? before.code : name(input.code, 'worker code');
  const preferredLanguage = input.language === undefined ? before.language : language(input.language);
  if (code !== before.code || preferredLanguage !== before.language) {
    transaction(db, () => {
      db.prepare('UPDATE workers SET code=?,language=? WHERE id=? AND org_id=? AND site_id=?')
        .run(code, preferredLanguage, id, session.org_id, session.site_id);
      audit(db, session, 'worker.updated', id);
    });
  }
  return workerRow(db, session, id);
}

export function disableWorker(db, session, id) {
  requirePeopleStaff(db,session);
  return transaction(db, () => {
    const worker = workerRow(db, session, id);
    if (worker.active) {
      const now = NOW();
      db.prepare('UPDATE workers SET active=0 WHERE id=? AND org_id=? AND site_id=?')
        .run(id, session.org_id, session.site_id);
      db.prepare('UPDATE worker_grants SET revoked_at=? WHERE worker_id=? AND org_id=? AND site_id=? AND revoked_at IS NULL')
        .run(now, id, session.org_id, session.site_id);
      db.prepare("UPDATE sessions SET revoked_at=? WHERE principal_type='worker' AND principal_id=? AND org_id=? AND site_id=? AND revoked_at IS NULL")
        .run(now, id, session.org_id, session.site_id);
      audit(db, session, 'worker.disabled', id);
    }
    return workerRow(db, session, id);
  });
}

export function reactivationInput(id,input,kind) {
  const label=kind==='worker' ? 'expectedCode' : 'expectedName';
  inputKeys(input,['requestId',label,'confirmed']);
  if(typeof id!=='string' || !id || id.length>100 || input.confirmed!==true
    || typeof input.requestId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new Error('Invalid reactivation request');
  return {requestId:input.requestId,expectedLabel:name(input[label],kind==='worker' ? 'worker code' : 'crew name')};
}

export function reactivationReplay(old,id,change,kind) {
  if(!old) return false;
  if(old[`${kind}_id`]!==id || old.expected_label!==change.expectedLabel) throw new Error('Reactivation request conflict');
  return true;
}

function recordReactivation(db,session,id,change,kind) {
  db.prepare('INSERT INTO directory_reactivations VALUES(?,?,?,?,?,?,?,?)')
    .run(change.requestId,session.org_id,session.site_id,kind==='worker' ? id : null,kind==='crew' ? id : null,change.expectedLabel,session.principal_id,NOW());
}

export function reenableWorker(db,session,id,input) {
  const change=reactivationInput(id,input,'worker');
  return transaction(db,() => {
    requirePeopleStaff(db,session);
    const before=workerRow(db,session,id);
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='worker_deletion_requests'").get()
      && db.prepare('SELECT 1 FROM worker_deletion_requests WHERE worker_id=?').get(id))throw new Error('Worker deletion pending');
    const old=db.prepare('SELECT * FROM directory_reactivations WHERE request_id=? AND org_id=? AND site_id=?').get(change.requestId,session.org_id,session.site_id);
    if(reactivationReplay(old,id,change,'worker')) return {...before,duplicate:true};
    if(before.code!==change.expectedLabel) throw new Error('Worker code changed');
    if(!before.active) {
      db.prepare('UPDATE workers SET active=1 WHERE id=? AND org_id=? AND site_id=?').run(id,session.org_id,session.site_id);
      const now=NOW();
      db.prepare('UPDATE worker_grants SET revoked_at=? WHERE worker_id=? AND org_id=? AND site_id=? AND revoked_at IS NULL').run(now,id,session.org_id,session.site_id);
      db.prepare("UPDATE sessions SET revoked_at=? WHERE principal_type='worker' AND principal_id=? AND org_id=? AND site_id=? AND revoked_at IS NULL").run(now,id,session.org_id,session.site_id);
      audit(db,session,'worker.reenabled',id);
    }
    recordReactivation(db,session,id,change,'worker');
    return {...workerRow(db,session,id),duplicate:false};
  });
}

export function crewFilters(filters={}) {
  inputKeys(filters,['search','status','page','pageSize']);
  const page=filters.page===undefined ? 1 : Number(filters.page),pageSize=filters.pageSize===undefined ? 5 : Number(filters.pageSize);
  const search=filters.search===undefined ? '' : filters.search,status=filters.status===undefined ? 'all' : filters.status;
  if([filters.page,filters.pageSize].some((value) => value!==undefined && !['number','string'].includes(typeof value)) ||
    !Number.isInteger(page) || page<1 || page>5000 || !Number.isInteger(pageSize) || pageSize<1 || pageSize>100) throw new Error('Invalid page');
  if(typeof search!=='string' || search.length>80) throw new Error('Invalid search');
  if(!['all','active','inactive'].includes(status)) throw new Error('Invalid status');
  return {page,pageSize,search:search.trim(),status};
}

export function listCrews(db, session, filters={}) {
  const {page,pageSize,search,status}=crewFilters(filters);
  return transaction(db,() => {
    requirePeopleStaff(db,session);
    const where="c.org_id=? AND c.site_id=? AND (?='' OR instr(lower(c.name),lower(?))>0) AND (?='all' OR c.active=?)";
    const args=[session.org_id,session.site_id,search,search,status,status==='active' ? 1 : 0];
    const total=db.prepare(`SELECT COUNT(*) AS n FROM crews c WHERE ${where}`).get(...args).n;
    const items=db.prepare(`SELECT c.id,c.name,c.active,
      (SELECT COUNT(*) FROM crew_memberships cm JOIN workers w ON w.id=cm.worker_id
        AND w.org_id=cm.org_id AND w.site_id=cm.site_id WHERE cm.crew_id=c.id
        AND cm.org_id=c.org_id AND cm.site_id=c.site_id AND w.active=1) AS member_count
      FROM crews c WHERE ${where} ORDER BY c.name COLLATE NOCASE,c.id LIMIT ? OFFSET ?`)
      .all(...args,pageSize,(page-1)*pageSize).map((row) => ({...row,active:!!row.active}));
    return {items,total,page,pageSize};
  });
}

export function crewRecipientId(id,filters={}) {
  inputKeys(filters,[]);
  if(typeof id!=='string' || !id || id.length>100)throw Error('Invalid crew');
  return id;
}

export function listCrewRecipients(db,session,id,filters={}) {
  crewRecipientId(id,filters);
  return transaction(db,()=>{
    requirePeopleStaff(db,session);
    if(session.token_hash!==undefined && !db.prepare(`SELECT 1 FROM sessions WHERE token_hash=? AND principal_type='staff' AND principal_id=? AND org_id=? AND site_id=? AND revoked_at IS NULL AND expires_at>?`).get(session.token_hash,session.principal_id,session.org_id,session.site_id,NOW()))throw Error('Sign in required');
    const crew=crewRow(db,session,id);
    if(!crew.active)throw Error('Crew unavailable');
    const items=db.prepare(`SELECT w.id,w.code,w.language,c.name AS crew_name FROM crew_memberships cm
      JOIN crews c ON c.id=cm.crew_id AND c.org_id=cm.org_id AND c.site_id=cm.site_id
      JOIN workers w ON w.id=cm.worker_id AND w.org_id=cm.org_id AND w.site_id=cm.site_id
      WHERE cm.crew_id=? AND cm.org_id=? AND cm.site_id=? AND w.active=1
      ORDER BY w.code COLLATE NOCASE,w.id LIMIT 5001`).all(id,session.org_id,session.site_id);
    if(items.length>5000)throw Error('Crew recipient limit exceeded');
    return {crew:{id:crew.id,name:crew.name},items,asOf:NOW()};
  });
}

export function createCrew(db, session, input) {
  requirePeopleStaff(db,session);
  inputKeys(input, ['name']);
  const crewName = name(input.name, 'crew name');
  const id = randomUUID();
  transaction(db, () => {
    db.prepare('INSERT INTO crews (id,org_id,site_id,name,active) VALUES (?,?,?,?,1)')
      .run(id, session.org_id, session.site_id, crewName);
    audit(db, session, 'crew.created', id);
  });
  return crewRow(db, session, id);
}

export function crewChangeInput(id, input, action) {
  if (typeof id !== 'string' || !id || id.length > 100) throw new Error('Invalid crew');
  inputKeys(input, action === 'rename' ? ['name', 'expectedName'] : ['expectedName', 'confirmed']);
  const expectedName = name(input.expectedName, 'crew name');
  if (action === 'archive' && input.confirmed !== true) throw new Error('Invalid input');
  return { expectedName, ...(action === 'rename' ? { name: name(input.name, 'crew name') } : {}) };
}

function crewRow(db, session, id) {
  const row = db.prepare(`SELECT c.id,c.org_id,c.site_id,c.name,c.active,
    (SELECT COUNT(*) FROM crew_memberships cm JOIN workers w ON w.id=cm.worker_id
      AND w.org_id=cm.org_id AND w.site_id=cm.site_id WHERE cm.crew_id=c.id
      AND cm.org_id=c.org_id AND cm.site_id=c.site_id AND w.active=1) AS member_count
    FROM crews c WHERE c.id=? AND c.org_id=? AND c.site_id=?`).get(id, session.org_id, session.site_id);
  if (!row) throw new Error('Crew unavailable');
  return { ...row, active: !!row.active };
}

export function getCrew(db,session,id){
  crewRecipientId(id);requirePeopleStaff(db,session);return crewRow(db,session,id);
}

export function renameCrew(db, session, id, input) {
  const change = crewChangeInput(id, input, 'rename');
  return transaction(db, () => {
    requirePeopleStaff(db, session);
    const before = crewRow(db, session, id);
    if (!before.active) throw new Error('Crew is archived');
    if (before.name === change.name) return before;
    if (before.name !== change.expectedName) throw new Error('Crew name changed');
    db.prepare('UPDATE crews SET name=? WHERE id=? AND org_id=? AND site_id=?')
      .run(change.name, id, session.org_id, session.site_id);
    audit(db, session, 'crew.renamed', id);
    return crewRow(db, session, id);
  });
}

export function archiveCrew(db, session, id, input) {
  const change = crewChangeInput(id, input, 'archive');
  return transaction(db, () => {
    requirePeopleStaff(db, session);
    const before = crewRow(db, session, id);
    if (before.name !== change.expectedName) throw new Error('Crew name changed');
    if (before.active) {
      db.prepare('UPDATE crews SET active=0 WHERE id=? AND org_id=? AND site_id=?')
        .run(id, session.org_id, session.site_id);
      audit(db, session, 'crew.archived', id);
    }
    return crewRow(db, session, id);
  });
}

export function restoreCrew(db,session,id,input) {
  const change=reactivationInput(id,input,'crew');
  return transaction(db,() => {
    requirePeopleStaff(db,session);
    const before=crewRow(db,session,id);
    const old=db.prepare('SELECT * FROM directory_reactivations WHERE request_id=? AND org_id=? AND site_id=?').get(change.requestId,session.org_id,session.site_id);
    if(reactivationReplay(old,id,change,'crew')) return {...before,duplicate:true};
    if(before.name!==change.expectedLabel) throw new Error('Crew name changed');
    if(!before.active) {
      db.prepare('UPDATE crews SET active=1 WHERE id=? AND org_id=? AND site_id=?').run(id,session.org_id,session.site_id);
      audit(db,session,'crew.restored',id);
    }
    recordReactivation(db,session,id,change,'crew');
    return {...crewRow(db,session,id),duplicate:false};
  });
}

export function moveWorkerToCrew(db, session, workerId, crewId) {
  requirePeopleStaff(db,session);
  if (crewId !== null && (typeof crewId !== 'string' || !crewId || crewId.length > 100)) throw new Error('Invalid crew');
  return transaction(db, () => {
    const worker = workerRow(db, session, workerId);
    if (!worker.active) throw new Error('Worker unavailable');
    if (crewId !== null && !db.prepare('SELECT 1 FROM crews WHERE id=? AND org_id=? AND site_id=? AND active=1')
      .get(crewId, session.org_id, session.site_id)) throw new Error('Crew unavailable');
    if (worker.crew_id !== crewId) {
      if (crewId === null) db.prepare('DELETE FROM crew_memberships WHERE worker_id=? AND org_id=? AND site_id=?')
        .run(workerId, session.org_id, session.site_id);
      else db.prepare(`INSERT INTO crew_memberships (worker_id,org_id,site_id,crew_id,joined_at) VALUES (?,?,?,?,?)
        ON CONFLICT(worker_id) DO UPDATE SET crew_id=excluded.crew_id,joined_at=excluded.joined_at`)
        .run(workerId, session.org_id, session.site_id, crewId, NOW());
      audit(db, session, 'worker.crew_moved', workerId);
    }
    return workerRow(db, session, workerId);
  });
}
