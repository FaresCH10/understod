import {randomUUID,createHash} from 'node:crypto';
import {domainTransaction} from './domain.mjs';
import {inspectWav} from '../audio.mjs';

function probeBytes() {
  const bytes=Buffer.alloc(8044);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);
  bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(8000,40);
  for(let offset=44;offset<bytes.length;offset+=2)bytes.writeInt16LE(offset%4?1000:-1000,offset);
  return bytes;
}
export async function processStorageProbe(pool,storage,{schema='public',adapter='local',enabled=false}={}) {
  if(typeof enabled!=='boolean' || !['local','r2'].includes(adapter))throw Error('Invalid storage health configuration');
  const run=fn=>domainTransaction(pool,schema,fn);
  const claim=await run(async client=>{
    // Serialize only admission; no database transaction stays open during storage I/O.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':storage-probe',0))");
    const active=(await client.query("SELECT *,lease_until>clock_timestamp() AS leased,retry_at>clock_timestamp() AS waiting FROM storage_probes WHERE adapter=$1 AND state<>'complete' FOR UPDATE",[adapter])).rows[0];
    if(active?.leased || active?.waiting)return null;
    if(!active && !enabled)return null;
    const token=randomUUID();
    if(active) {
      const row=(await client.query("UPDATE storage_probes SET state='cleanup_pending',retry_at=NULL,lease_token=$2,lease_until=clock_timestamp()+interval '10 minutes' WHERE id=$1 RETURNING *",[active.id,token])).rows[0];
      return {...row,fresh:false};
    }
    if((await client.query("SELECT 1 FROM storage_probes WHERE adapter=$1 AND completed_at>clock_timestamp()-interval '5 minutes' LIMIT 1",[adapter])).rows.length)return null;
    const row=(await client.query("INSERT INTO storage_probes(id,adapter,state,lease_token,lease_until) VALUES($1,$2,'processing',$3,clock_timestamp()+interval '10 minutes') RETURNING *",[randomUUID(),adapter,token])).rows[0];
    return {...row,fresh:true};
  });
  if(!claim)return false;
  const wav=probeBytes(),original=Buffer.from('Understood synthetic private-storage health probe.'),scope={id:claim.id,org_id:'operations_probe',site_id:'storage_health'};
  const canonical={...scope,...inspectWav(wav)},source={...scope,bytes:original.length,sha256:createHash('sha256').update(original).digest('hex')};
  let readback=claim.readback_verified,absent=false;
  try {
    if(claim.fresh) {
      await storage.save(canonical,wav);await storage.saveOriginal(source,original);
      const a=await storage.read(canonical),b=await storage.readOriginal(source);
      if(!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || !a.equals(wav) || !b.equals(original))throw Error('Storage probe readback failed');
      await run(client=>client.query("UPDATE storage_probes SET readback_verified=true WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp()",[claim.id,claim.lease_token]));
      readback=true;
    }
  }catch {readback=false;}
  // Only this journal's random synthetic references are removed, never customer objects.
  try{await storage.remove(canonical);}catch{}
  try{await storage.removeOriginal(source);}catch{}
  try{const a=await storage.exists(canonical),b=await storage.existsOriginal(source);absent=a===false && b===false;}catch{}
  await run(client=>client.query(`UPDATE storage_probes SET state=$3,result=$4,completed_at=CASE WHEN $3='complete' THEN clock_timestamp() END,
    retry_at=CASE WHEN $3='cleanup_pending' THEN clock_timestamp()+interval '5 minutes' END,
    lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp()`,
  [claim.id,claim.lease_token,absent?'complete':'cleanup_pending',absent?(readback?'verified':'failed'):null]));
  return true;
}
export async function readStorageHealth(client) {
  const row=(await client.query(`SELECT adapter,state,result,readback_verified AS "readbackVerified",created_at AS "createdAt",completed_at AS "completedAt",
    completed_at>clock_timestamp()-interval '6 minutes' AS fresh FROM storage_probes ORDER BY created_at DESC,id DESC LIMIT 1`)).rows[0];
  return {status:!row?'unverified':row.state==='cleanup_pending'?'cleanup pending':row.state==='processing'?'checking':!row.fresh?'not recently verified':row.result==='verified'?'responding':'failed',
    observation:row ?? null,privacy:'unverified',productionReady:false};
}
