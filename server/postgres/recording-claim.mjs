import {dispatchAllowed} from './operations-gates.mjs';

export async function currentRecordingClaim(client,{id,org_id,site_id,token}) {
  if(!await dispatchAllowed(client,org_id,{provider:true}))return null;
  const worker=(await client.query(`SELECT w.active FROM recordings r JOIN assignments a ON a.id=r.assignment_id AND a.org_id=r.org_id AND a.site_id=r.site_id
    JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
    WHERE r.id=$1 AND r.org_id=$2 AND r.site_id=$3 FOR SHARE OF w`,[id,org_id,site_id])).rows[0];
  if(!worker?.active)return null;
  return (await client.query(`SELECT r.* FROM recordings r WHERE r.id=$1 AND r.org_id=$2 AND r.site_id=$3
    AND r.status='processing' AND r.received_at IS NOT NULL AND r.lease_token=$4 AND r.lease_until>clock_timestamp()
    AND assignment_content_available(r.assignment_id)
    AND NOT EXISTS(SELECT 1 FROM recording_purges p WHERE p.recording_id=r.id) FOR SHARE OF r`,[id,org_id,site_id,token])).rows[0] ?? null;
}
