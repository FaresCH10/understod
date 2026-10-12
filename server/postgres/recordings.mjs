import { randomUUID } from 'node:crypto';
import { inspectWav } from '../audio.mjs';
import { domainTransaction,domainAudit,requirePrincipal } from './domain.mjs';
import {acceptingRepeat,consumeRepeat} from './case-repeats.mjs';

const uuid = (value) => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const receipt = (row,duplicate) => ({id:row.id,status:row.status,receivedAt:row.received_at?.toISOString() || null,duplicate});

async function lockedAssignment(client,session,assignmentId) {
  await requirePrincipal(client,session,'worker');
  const row = (await client.query(`SELECT id,publication_id,due_at FROM assignments WHERE id=$1 AND org_id=$2 AND site_id=$3 AND worker_id=$4 FOR UPDATE`,
    [assignmentId,session.org_id,session.site_id,session.principal_id])).rows[0];
  if (!row) throw new Error('Assignment unavailable');
  return row;
}

async function acceptingAssignment(client,session,assignment) {
  const row = (await client.query(`SELECT state,publication_content_available(id) AS content_available FROM publications WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR SHARE`,
    [assignment.publication_id,session.org_id,session.site_id])).rows[0];
  if (row?.state!=='published' || !row.content_available) throw new Error('Assignment unavailable');
  return acceptingRepeat(client,session,assignment);
}

export async function receiveRecording(pool,session,assignmentId,submissionId,bytes,storage,{schema='public'}={}) {
  if (typeof assignmentId!=='string' || !assignmentId || assignmentId.length>100 || !uuid(submissionId)) throw new Error('Invalid submission ID');
  if (typeof storage?.save!=='function' || typeof storage.remove!=='function') throw new Error('Private storage unavailable');
  const info = inspectWav(bytes);
  const staged = await domainTransaction(pool,schema,async (client) => {
    const assignment = await lockedAssignment(client,session,assignmentId);
    const old = (await client.query(`SELECT id,status,received_at,sha256,bytes FROM recordings
      WHERE assignment_id=$1 AND org_id=$2 AND site_id=$3 AND submission_id=$4`,[assignmentId,session.org_id,session.site_id,submissionId])).rows[0];
    if (old) {
      if (old.sha256!==info.sha256 || old.bytes!==info.bytes) throw new Error('Submission ID conflict');
      if (old.received_at) return {duplicate:receipt(old,true)};
      if (old.status==='storing') throw new Error('Recording storage still in progress');
      throw new Error('Recording unavailable; use a new recording');
    }
    await acceptingAssignment(client,session,assignment);
    if ((await client.query('SELECT 1 FROM attempts WHERE assignment_id=$1 AND submission_id=$2',[assignmentId,submissionId])).rows.length) throw new Error('Submission ID conflict');
    const row = {...info,id:randomUUID(),org_id:session.org_id,site_id:session.site_id,assignment_id:assignmentId,submission_id:submissionId,token:randomUUID()};
    await client.query(`INSERT INTO recordings(id,org_id,site_id,assignment_id,submission_id,sha256,duration_seconds,bytes,status,lease_token,lease_until)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'storing',$9,clock_timestamp()+interval '90 seconds')`,
    [row.id,row.org_id,row.site_id,row.assignment_id,row.submission_id,row.sha256,row.durationSeconds,row.bytes,row.token]);
    return row;
  });
  if (staged.duplicate) return staged.duplicate;
  try {
    await storage.save(staged,bytes);
    return await domainTransaction(pool,schema,async (client) => {
      const assignment = await lockedAssignment(client,session,assignmentId);
      const repeatId=await acceptingAssignment(client,session,assignment);
      const current = (await client.query(`SELECT id FROM recordings WHERE id=$1 AND org_id=$2 AND site_id=$3 AND status='storing'
        AND lease_token=$4 AND lease_until>clock_timestamp() FOR UPDATE`,[staged.id,session.org_id,session.site_id,staged.token])).rows[0];
      if (!current) throw new Error('Recording storage lease expired');
      const accepted = (await client.query(`INSERT INTO submission_receipts(org_id,assignment_id,submission_id,kind,received_at)
        VALUES ($1,$2,$3,'audio',clock_timestamp()) RETURNING received_at`,[session.org_id,assignmentId,submissionId])).rows[0];
      const row = (await client.query(`UPDATE recordings SET status='received',received_at=$2,lease_token=NULL,lease_until=NULL,error=NULL WHERE id=$1
        RETURNING id,status,received_at`,[staged.id,accepted.received_at])).rows[0];
      await consumeRepeat(client,repeatId,submissionId,accepted.received_at);
      await domainAudit(client,session,'answer.received',staged.id);
      return receipt(row,false);
    });
  } catch {
    // A lost COMMIT acknowledgement may already have accepted the recording. Confirm before deleting its object.
    const current = await domainTransaction(pool,schema,async (client) => {
      const row = (await client.query('SELECT id,status,received_at FROM recordings WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR UPDATE',
        [staged.id,staged.org_id,staged.site_id])).rows[0];
      if (row?.received_at) return row;
      await client.query(`UPDATE recordings SET lease_token=NULL,lease_until=clock_timestamp(),error='Private storage cleanup required'
        WHERE id=$1 AND status='storing' AND received_at IS NULL`,[staged.id]);
      return null;
    });
    if (current) return receipt(current,true);
    let removed = false;
    try {await storage.remove(staged); removed=true;} catch { /* Keep the staged reference for later private-object cleanup. */ }
    if (removed) await domainTransaction(pool,schema,async (client) => client.query(`UPDATE recordings SET status='failed',
      error='Private storage failed before receipt',lease_until=NULL,lease_token=NULL WHERE id=$1 AND status='storing' AND received_at IS NULL`,[staged.id]));
    throw new Error('Private recording was not received');
  }
}

async function recordingForSession(client,session,recordingId) {
  const type = session?.principal_type;
  if (!['staff','worker'].includes(type) || (type==='staff' && !['owner','supervisor','auditor'].includes(session.role))) throw new Error('Forbidden');
  if (type==='worker') await requirePrincipal(client,session,'worker');
  else await requirePrincipal(client,session,'staff',['owner','supervisor','auditor']);
  const row = (await client.query(`SELECT r.* FROM recordings r JOIN assignments a ON a.id=r.assignment_id AND a.org_id=r.org_id AND a.site_id=r.site_id
    WHERE r.id=$1 AND r.org_id=$2 AND r.site_id=$3 AND r.received_at IS NOT NULL ${type==='worker' ? 'AND a.worker_id=$4' : ''}`,
  [recordingId,session.org_id,session.site_id,...(type==='worker' ? [session.principal_id] : [])])).rows[0];
  if (!row) throw new Error('Recording unavailable');
  return row;
}

export async function getRecording(pool,session,recordingId,{schema='public'}={}) {
  return domainTransaction(pool,schema,async (client) => {
    const row = await recordingForSession(client,session,recordingId);
    return {id:row.id,status:row.status,receivedAt:row.received_at.toISOString(),
      aiStatus:row.status==='transcribed' ? 'transcribed' : ['failed','blocked'].includes(row.status) ? row.status : 'pending'};
  });
}

export async function getRecordingAudio(pool,session,recordingId,storage,{schema='public'}={}) {
  if(session?.principal_type==='staff' && !['owner','supervisor'].includes(session.role)) throw new Error('Forbidden');
  const row = await domainTransaction(pool,schema,async (client) => recordingForSession(client,session,recordingId));
  if(!['received','processing','blocked','transcribed'].includes(row.status))throw new Error('Recording unavailable');
  if(typeof storage?.read!=='function') throw new Error('Private storage unavailable');
  const bytes = await storage.read(row), info = inspectWav(bytes);
  if (info.sha256!==row.sha256 || info.bytes!==row.bytes) throw new Error('Private recording integrity check failed');
  const current=await domainTransaction(pool,schema,client=>recordingForSession(client,session,recordingId));
  if(!['received','processing','blocked','transcribed'].includes(current.status))throw new Error('Recording unavailable');
  return bytes;
}

export async function expireStagedRecording(pool,storage,{schema='public'}={}) {
  const row = await domainTransaction(pool,schema,async (client) => {
    const candidate = (await client.query(`SELECT * FROM recordings WHERE status='storing' AND received_at IS NULL
      AND lease_until<=clock_timestamp() ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
    if (!candidate) return null;
    const token = randomUUID();
    await client.query(`UPDATE recordings SET lease_token=$2,lease_until=clock_timestamp()+interval '90 seconds',error='Private storage cleanup required' WHERE id=$1`,[candidate.id,token]);
    return {...candidate,token};
  });
  if (!row) return false;
  try {
    await storage.remove(row);
    if(typeof storage.exists!=='function' || await storage.exists(row)!==false)throw Error('Private staged audio absence not verified');
    await domainTransaction(pool,schema,async (client) => client.query(`UPDATE recordings SET status='failed',lease_token=NULL,lease_until=NULL,error='Storage interrupted before receipt'
      WHERE id=$1 AND lease_token=$2 AND received_at IS NULL AND status='storing' AND lease_until>clock_timestamp()`,[row.id,row.token]));
  } catch { /* The cleanup lease expires for another bounded attempt; never issue a receipt. */ }
  return true;
}
