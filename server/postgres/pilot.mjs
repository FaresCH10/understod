import {randomUUID} from 'node:crypto';
import {domainTransaction} from './domain.mjs';
import {tokenHash} from '../auth-crypto.mjs';
import {consumeAuthBudget} from './auth-budget.mjs';
import {sendAuthMail} from '../auth-mail.mjs';
import {pilotInput,pilotReceiptInput,pilotReceipt,pilotMessage} from '../pilot-input.mjs';
import {dispatchAllowed} from './operations-gates.mjs';

export async function savePilot(pool,input,address,{schema='public',mail={available:false},destination=null}={}) {
  const value=pilotInput(input);
  if(!await domainTransaction(pool,schema,client=>consumeAuthBudget(client,[tokenHash(`pilot:ip:${address}`),tokenHash(`pilot:email:${value.content.email}`)],5)))throw Error('Pilot request limit reached');
  return domainTransaction(pool,schema,async client=>{
    // Bounds storage and serializes simultaneous requests for the same public receipt.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['understood:pilot-admission']);
    const old=(await client.query('SELECT * FROM pilot_inquiries WHERE id=$1',[value.id])).rows[0];
    if(old){if(old.receipt_hash!==value.receiptHash || old.request_hash!==value.requestHash)throw Error('Pilot request conflict');return pilotReceipt(old);}
    if((await client.query('SELECT COUNT(*)::int n FROM pilot_inquiries')).rows[0].n>=10000)throw Error('Pilot storage unavailable');
    const state=mail.available && destination ? 'queued':'saved';
    return pilotReceipt((await client.query(`INSERT INTO pilot_inquiries(id,receipt_hash,request_hash,content_json,destination,state,created_at,expires_at,next_at)
      VALUES($1,$2,$3,$4,$5,$6,clock_timestamp(),clock_timestamp()+interval '30 days',clock_timestamp()) RETURNING *`,
      [value.id,value.receiptHash,value.requestHash,JSON.stringify(value.content),state==='queued'?destination:null,state])).rows[0]);
  });
}
export async function readPilot(pool,id,secret,{schema='public'}={}) {
  const value=pilotReceiptInput(id,secret);
  return domainTransaction(pool,schema,async client=>pilotReceipt((await client.query('SELECT id,state,created_at,expires_at FROM pilot_inquiries WHERE id=$1 AND receipt_hash=$2',[value.id,value.receiptHash])).rows[0]));
}
export async function processOnePilot(pool,mail,{schema='public',destination=null,fetchImpl=fetch}={}) {
  const row=await domainTransaction(pool,schema,async client=>{
    await client.query("UPDATE pilot_inquiries SET content_json=NULL,destination=NULL,state='expired',lease_token=NULL,lease_until=NULL WHERE expires_at<=clock_timestamp() AND state!='expired'");
    await client.query("DELETE FROM pilot_inquiries WHERE expires_at<clock_timestamp()-interval '30 days'");
    await client.query("UPDATE pilot_inquiries SET state='failed',lease_token=NULL,lease_until=NULL WHERE state IN ('queued','processing') AND (created_at<=clock_timestamp()-interval '23 hours' OR (attempts>=3 AND lease_until<=clock_timestamp()))");
    if(!mail.available || !destination || !await dispatchAllowed(client,null))return null;
    const next=(await client.query(`SELECT * FROM pilot_inquiries WHERE destination=$1 AND attempts<3 AND next_at<=clock_timestamp()
      AND (state='queued' OR (state='processing' AND lease_until<=clock_timestamp())) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,[destination])).rows[0];
    if(!next)return null;
    return (await client.query("UPDATE pilot_inquiries SET state='processing',attempts=attempts+1,lease_token=$2,lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 RETURNING *",[next.id,randomUUID()])).rows[0];
  });
  if(!row)return false;
  try {const result=await sendAuthMail(mail,row.id,pilotMessage(row),fetchImpl);
    await domainTransaction(pool,schema,client=>client.query("UPDATE pilot_inquiries SET state='sent',provider_id=$3,lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND expires_at>clock_timestamp()",[row.id,row.lease_token,result.providerId]));
  }catch {await domainTransaction(pool,schema,client=>client.query("UPDATE pilot_inquiries SET state=$3,next_at=clock_timestamp()+interval '1 minute',lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND expires_at>clock_timestamp()",[row.id,row.lease_token,row.attempts>=3?'failed':'queued']));}
  return true;
}
