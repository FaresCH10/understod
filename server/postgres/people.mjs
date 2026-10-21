import { randomUUID } from 'node:crypto';
import { inputKeys,name,validateWorkerInput,workerFilters,crewChangeInput,crewFilters,crewRecipientId,reactivationInput,reactivationReplay } from '../people.mjs';
import { domainTransaction,domainAudit,requirePrincipal } from './domain.mjs';

async function workerRow(client,session,workerId,{lock=false}={}) {
  const row=(await client.query(`SELECT w.id,w.org_id,w.site_id,w.code,w.language,w.active,cm.crew_id,c.name AS crew_name FROM workers w
    LEFT JOIN crew_memberships cm ON cm.worker_id=w.id AND cm.org_id=w.org_id AND cm.site_id=w.site_id
    LEFT JOIN crews c ON c.id=cm.crew_id AND c.org_id=w.org_id AND c.site_id=w.site_id
    WHERE w.id=$1 AND w.org_id=$2 AND w.site_id=$3 ${lock ? 'FOR UPDATE OF w' : ''}`,[workerId,session.org_id,session.site_id])).rows[0];
  if (!row) throw new Error('Worker unavailable');
  return row;
}

export async function listWorkers(pool,session,filters={}, {schema='public'}={}) {
  const {page,pageSize,search,selectedLanguage,status,crewId,workerId}=workerFilters(filters);
  return domainTransaction(pool,schema,async (client) => {
    await requirePrincipal(client,session,'staff');
    if(!['all','none'].includes(crewId)) await crewRow(client,session,crewId);
    // Count and page are from one statement snapshot, including an empty requested page.
    const row=(await client.query(`WITH filtered AS (SELECT w.id,w.org_id,w.site_id,w.code,w.language,w.active,cm.crew_id,c.name AS crew_name
      FROM workers w LEFT JOIN crew_memberships cm ON cm.worker_id=w.id AND cm.org_id=w.org_id AND cm.site_id=w.site_id
      LEFT JOIN crews c ON c.id=cm.crew_id AND c.org_id=w.org_id AND c.site_id=w.site_id
      WHERE w.org_id=$1 AND w.site_id=$2 AND ($3='' OR strpos(lower(w.code),lower($3))>0)
      AND ($4='all' OR w.language=$4) AND ($5='all' OR w.active=($5='active'))
      AND ($6='all' OR ($6='none' AND cm.worker_id IS NULL) OR cm.crew_id=$6) AND ($9::text IS NULL OR w.id=$9))
      SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
        (SELECT COALESCE(jsonb_agg(result ORDER BY lower(result.code),result.id),'[]') FROM
          (SELECT * FROM filtered ORDER BY lower(code),id LIMIT $7 OFFSET $8) result) AS items`,
    [session.org_id,session.site_id,search.trim(),selectedLanguage,status,crewId,pageSize,(page-1)*pageSize,workerId])).rows[0];
    return {...row,page,pageSize};
  });
}

async function writeConflict(operation) {
  try {return await operation();} catch (error) {
    if (error.code==='23505') throw new Error('Directory entry already exists');
    throw error;
  }
}

export async function createWorker(pool,session,input,{schema='public'}={}) {
  const content=validateWorkerInput(input),workerId=randomUUID();
  return writeConflict(() => domainTransaction(pool,schema,async (client) => {
    await requirePrincipal(client,session,'staff');
    await client.query('INSERT INTO workers(id,org_id,site_id,code,language) VALUES ($1,$2,$3,$4,$5)',[workerId,session.org_id,session.site_id,content.code,content.language]);
    await domainAudit(client,session,'worker.created',workerId);
    return workerRow(client,session,workerId);
  }));
}

export async function updateWorker(pool,session,workerId,input,{schema='public'}={}) {
  inputKeys(input,['code','language']);
  if (!Object.keys(input).length) throw new Error('Invalid input');
  return writeConflict(() => domainTransaction(pool,schema,async (client) => {
    await requirePrincipal(client,session,'staff');
    const before=await workerRow(client,session,workerId,{lock:true});
    const content=validateWorkerInput({code:input.code ?? before.code,language:input.language ?? before.language});
    if (input.code===null || input.language===null) throw new Error('Invalid input');
    if (content.code!==before.code || content.language!==before.language) {
      await client.query('UPDATE workers SET code=$4,language=$5 WHERE id=$1 AND org_id=$2 AND site_id=$3',[workerId,session.org_id,session.site_id,content.code,content.language]);
      await domainAudit(client,session,'worker.updated',workerId);
    }
    return workerRow(client,session,workerId);
  }));
}

export async function disableWorker(pool,session,workerId,{schema='public'}={}) {
  return domainTransaction(pool,schema,async (client) => {
    await requirePrincipal(client,session,'staff');
    const before=await workerRow(client,session,workerId,{lock:true});
    if (before.active) {
      await client.query('UPDATE workers SET active=false WHERE id=$1 AND org_id=$2 AND site_id=$3',[workerId,session.org_id,session.site_id]);
      await client.query('UPDATE worker_grants SET revoked_at=clock_timestamp() WHERE worker_id=$1 AND org_id=$2 AND site_id=$3 AND revoked_at IS NULL',[workerId,session.org_id,session.site_id]);
      await client.query(`UPDATE sessions SET revoked_at=clock_timestamp() WHERE principal_type='worker' AND principal_id=$1 AND org_id=$2 AND site_id=$3 AND revoked_at IS NULL`,[workerId,session.org_id,session.site_id]);
      await domainAudit(client,session,'worker.disabled',workerId);
    }
    return workerRow(client,session,workerId);
  });
}

async function oldReactivation(client,session,id,change,kind) {
  const old=(await client.query('SELECT * FROM directory_reactivations WHERE request_id=$1 AND org_id=$2 AND site_id=$3',
    [change.requestId,session.org_id,session.site_id])).rows[0];
  return reactivationReplay(old,id,change,kind);
}

async function recordReactivation(client,session,id,change,kind) {
  await client.query(`INSERT INTO directory_reactivations(request_id,org_id,site_id,worker_id,crew_id,expected_label,requested_by)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[change.requestId,session.org_id,session.site_id,kind==='worker' ? id : null,kind==='crew' ? id : null,change.expectedLabel,session.principal_id]);
}

export async function reenableWorker(pool,session,id,input,{schema='public'}={}) {
  const change=reactivationInput(id,input,'worker');
  return domainTransaction(pool,schema,async (client) => {
    await requirePrincipal(client,session,'staff');
    const before=await workerRow(client,session,id,{lock:true});
    if((await client.query('SELECT 1 FROM worker_deletion_requests WHERE worker_id=$1',[id])).rows.length)throw new Error('Worker deletion pending');
    if(await oldReactivation(client,session,id,change,'worker')) return {...before,duplicate:true};
    if(before.code!==change.expectedLabel) throw new Error('Worker code changed');
    if(!before.active) {
      await client.query('UPDATE workers SET active=true WHERE id=$1 AND org_id=$2 AND site_id=$3',[id,session.org_id,session.site_id]);
      await client.query('UPDATE worker_grants SET revoked_at=clock_timestamp() WHERE worker_id=$1 AND org_id=$2 AND site_id=$3 AND revoked_at IS NULL',[id,session.org_id,session.site_id]);
      await client.query("UPDATE sessions SET revoked_at=clock_timestamp() WHERE principal_type='worker' AND principal_id=$1 AND org_id=$2 AND site_id=$3 AND revoked_at IS NULL",[id,session.org_id,session.site_id]);
      await domainAudit(client,session,'worker.reenabled',id);
    }
    await recordReactivation(client,session,id,change,'worker');
    return {...await workerRow(client,session,id),duplicate:false};
  });
}

export async function listCrews(pool,session,filters={}, {schema='public'}={}) {
  const {page,pageSize,search,status}=crewFilters(filters);
  return domainTransaction(pool,schema,client=>readCrewPage(client,session,{page,pageSize,search,status}));
}

export async function readCrewPage(client,session,{page,pageSize,search,status}) {
    await requirePrincipal(client,session,'staff');
    const row=(await client.query(`WITH filtered AS (
      SELECT c.id,c.name,c.active FROM crews c WHERE c.org_id=$1 AND c.site_id=$2
        AND ($3='' OR strpos(lower(c.name),lower($3))>0) AND ($4='all' OR c.active=($4='active'))),
      page AS (SELECT f.*,(SELECT COUNT(*)::int FROM crew_memberships cm JOIN workers w ON w.id=cm.worker_id
        AND w.org_id=cm.org_id AND w.site_id=cm.site_id WHERE cm.crew_id=f.id
        AND cm.org_id=$1 AND cm.site_id=$2 AND w.active) AS member_count
        FROM filtered f ORDER BY lower(f.name),f.id LIMIT $5 OFFSET $6)
      SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
        (SELECT COALESCE(jsonb_agg(page ORDER BY lower(page.name),page.id),'[]') FROM page) AS items`,
      [session.org_id,session.site_id,search,status,pageSize,(page-1)*pageSize])).rows[0];
    return {...row,page,pageSize};
}

export async function createCrew(pool,session,input,{schema='public'}={}) {
  inputKeys(input,['name']); const crewName=name(input.name,'crew name'),crewId=randomUUID();
  return writeConflict(() => domainTransaction(pool,schema,async (client) => {
    await requirePrincipal(client,session,'staff');
    await client.query('INSERT INTO crews(id,org_id,site_id,name) VALUES ($1,$2,$3,$4)',[crewId,session.org_id,session.site_id,crewName]);
    await domainAudit(client,session,'crew.created',crewId);
    return {id:crewId,org_id:session.org_id,site_id:session.site_id,name:crewName,active:true,member_count:0};
  }));
}

export async function listCrewRecipients(pool,session,id,filters={}, {schema='public'}={}) {
  crewRecipientId(id,filters);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff');
    const crew=await crewRow(client,session,id,{lock:'share'});
    if(!crew.active)throw Error('Crew unavailable');
    const items=(await client.query(`SELECT w.id,w.code,w.language,c.name AS crew_name FROM crew_memberships cm
      JOIN crews c ON c.id=cm.crew_id AND c.org_id=cm.org_id AND c.site_id=cm.site_id
      JOIN workers w ON w.id=cm.worker_id AND w.org_id=cm.org_id AND w.site_id=cm.site_id
      WHERE cm.crew_id=$1 AND cm.org_id=$2 AND cm.site_id=$3 AND w.active
      ORDER BY lower(w.code),w.id LIMIT 5001`,[id,session.org_id,session.site_id])).rows;
    if(items.length>5000)throw Error('Crew recipient limit exceeded');
    return {crew:{id:crew.id,name:crew.name},items,asOf:new Date().toISOString()};
  });
}

async function crewRow(client,session,id,{lock=false}={}) {
  const row=(await client.query(`SELECT c.id,c.org_id,c.site_id,c.name,c.active,
    (SELECT COUNT(*)::int FROM crew_memberships cm JOIN workers w ON w.id=cm.worker_id
      AND w.org_id=cm.org_id AND w.site_id=cm.site_id WHERE cm.crew_id=c.id
      AND cm.org_id=c.org_id AND cm.site_id=c.site_id AND w.active) AS member_count
    FROM crews c WHERE c.id=$1 AND c.org_id=$2 AND c.site_id=$3 ${lock==='share' ? 'FOR SHARE OF c' : lock ? 'FOR UPDATE OF c' : ''}`,
  [id,session.org_id,session.site_id])).rows[0];
  if(!row) throw new Error('Crew unavailable');
  return row;
}

export function getCrew(pool,session,id,{schema='public'}={}){
  crewRecipientId(id);return domainTransaction(pool,schema,async client=>{await requirePrincipal(client,session,'staff');return crewRow(client,session,id);});
}

export async function renameCrew(pool,session,id,input,{schema='public'}={}) {
  const change=crewChangeInput(id,input,'rename');
  return writeConflict(() => domainTransaction(pool,schema,async (client) => {
    await requirePrincipal(client,session,'staff');
    const before=await crewRow(client,session,id,{lock:true});
    if(!before.active) throw new Error('Crew is archived');
    if(before.name===change.name) return before;
    if(before.name!==change.expectedName) throw new Error('Crew name changed');
    await client.query('UPDATE crews SET name=$4 WHERE id=$1 AND org_id=$2 AND site_id=$3',[id,session.org_id,session.site_id,change.name]);
    await domainAudit(client,session,'crew.renamed',id);
    return crewRow(client,session,id);
  }));
}

export async function archiveCrew(pool,session,id,input,{schema='public'}={}) {
  const change=crewChangeInput(id,input,'archive');
  return domainTransaction(pool,schema,async (client) => {
    await requirePrincipal(client,session,'staff');
    // Membership moves hold a share lock on this same crew before accepting new members.
    const before=await crewRow(client,session,id,{lock:true});
    if(before.name!==change.expectedName) throw new Error('Crew name changed');
    if(before.active) {
      await client.query('UPDATE crews SET active=false WHERE id=$1 AND org_id=$2 AND site_id=$3',[id,session.org_id,session.site_id]);
      await domainAudit(client,session,'crew.archived',id);
    }
    return crewRow(client,session,id);
  });
}

export async function restoreCrew(pool,session,id,input,{schema='public'}={}) {
  const change=reactivationInput(id,input,'crew');
  return domainTransaction(pool,schema,async (client) => {
    await requirePrincipal(client,session,'staff');
    const before=await crewRow(client,session,id,{lock:true});
    if(await oldReactivation(client,session,id,change,'crew')) return {...before,duplicate:true};
    if(before.name!==change.expectedLabel) throw new Error('Crew name changed');
    if(!before.active) {
      await client.query('UPDATE crews SET active=true WHERE id=$1 AND org_id=$2 AND site_id=$3',[id,session.org_id,session.site_id]);
      await domainAudit(client,session,'crew.restored',id);
    }
    await recordReactivation(client,session,id,change,'crew');
    return {...await crewRow(client,session,id),duplicate:false};
  });
}

export async function moveWorkerToCrew(pool,session,workerId,crewId,{schema='public'}={}) {
  if (crewId!==null && (typeof crewId!=='string' || !crewId || crewId.length>100)) throw new Error('Invalid crew');
  return domainTransaction(pool,schema,async (client) => {
    await requirePrincipal(client,session,'staff');
    const worker=await workerRow(client,session,workerId,{lock:true});
    if (!worker.active) throw new Error('Worker unavailable');
    if (crewId!==null && !(await client.query('SELECT id FROM crews WHERE id=$1 AND org_id=$2 AND site_id=$3 AND active=true FOR SHARE',[crewId,session.org_id,session.site_id])).rows.length) throw new Error('Crew unavailable');
    if (worker.crew_id!==crewId) {
      if (crewId===null) await client.query('DELETE FROM crew_memberships WHERE worker_id=$1 AND org_id=$2 AND site_id=$3',[workerId,session.org_id,session.site_id]);
      else await client.query(`INSERT INTO crew_memberships(worker_id,org_id,site_id,crew_id) VALUES ($1,$2,$3,$4)
        ON CONFLICT(worker_id) DO UPDATE SET crew_id=excluded.crew_id,joined_at=clock_timestamp()`,[workerId,session.org_id,session.site_id,crewId]);
      await domainAudit(client,session,'worker.crew_moved',workerId);
    }
    return workerRow(client,session,workerId);
  });
}
