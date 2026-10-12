import {randomUUID} from 'node:crypto';
import {transaction,NOW} from './db.mjs';
import {tokenHash} from './auth-crypto.mjs';
import {consumeAuthBudget} from './auth-budget.mjs';
import {sendAuthMail} from './auth-mail.mjs';
import {pilotInput,pilotReceiptInput,pilotReceipt,pilotMessage} from './pilot-input.mjs';

export function ensurePilotSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS pilot_inquiries (
    id TEXT PRIMARY KEY,receipt_hash TEXT NOT NULL,request_hash TEXT NOT NULL,content_json TEXT,
    destination TEXT,state TEXT NOT NULL CHECK(state IN ('saved','queued','processing','sent','failed','expired')),
    created_at TEXT NOT NULL,expires_at TEXT NOT NULL,next_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,
    lease_token TEXT,lease_until TEXT,provider_id TEXT
  ) STRICT;
  CREATE INDEX IF NOT EXISTS pilot_inquiries_queue ON pilot_inquiries(state,next_at);
  CREATE INDEX IF NOT EXISTS pilot_inquiries_expiry ON pilot_inquiries(expires_at);`);
}
export function savePilot(db,input,address,{mail={available:false},destination=null}={}) {
  const value=pilotInput(input);ensurePilotSchema(db);
  const admitted=transaction(db,()=>consumeAuthBudget(db,[tokenHash(`pilot:ip:${address}`),tokenHash(`pilot:email:${value.content.email}`)],5));
  if(!admitted)throw Error('Pilot request limit reached');
  return transaction(db,()=>{
    const old=db.prepare('SELECT * FROM pilot_inquiries WHERE id=?').get(value.id);
    if(old){if(old.receipt_hash!==value.receiptHash || old.request_hash!==value.requestHash)throw Error('Pilot request conflict');return pilotReceipt(old);}
    if(db.prepare('SELECT COUNT(*) n FROM pilot_inquiries').get().n>=10000)throw Error('Pilot storage unavailable');
    const now=NOW(),expires=new Date(Date.now()+30*86400000).toISOString(),state=mail.available && destination ? 'queued' : 'saved';
    db.prepare('INSERT INTO pilot_inquiries(id,receipt_hash,request_hash,content_json,destination,state,created_at,expires_at,next_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(value.id,value.receiptHash,value.requestHash,JSON.stringify(value.content),state==='queued'?destination:null,state,now,expires,now);
    return pilotReceipt(db.prepare('SELECT * FROM pilot_inquiries WHERE id=?').get(value.id));
  });
}
export function readPilot(db,id,secret) {
  const value=pilotReceiptInput(id,secret);ensurePilotSchema(db);
  return pilotReceipt(db.prepare('SELECT id,state,created_at,expires_at FROM pilot_inquiries WHERE id=? AND receipt_hash=?').get(value.id,value.receiptHash));
}
export async function processOnePilot(db,mail,{destination=null,fetchImpl=fetch}={}) {
  ensurePilotSchema(db);
  const row=transaction(db,()=>{
    const now=NOW();
    db.prepare("UPDATE pilot_inquiries SET content_json=NULL,destination=NULL,state='expired',lease_token=NULL,lease_until=NULL WHERE expires_at<=? AND state!='expired'").run(now);
    // The receipt remains a bounded tombstone after contact details have expired.
    db.prepare("DELETE FROM pilot_inquiries WHERE expires_at<?").run(new Date(Date.now()-30*86400000).toISOString());
    db.prepare("UPDATE pilot_inquiries SET state='failed',lease_token=NULL,lease_until=NULL WHERE state IN ('queued','processing') AND (created_at<=? OR (attempts>=3 AND lease_until<=?))").run(new Date(Date.now()-23*3600000).toISOString(),now);
    if(!mail.available || !destination)return null;
    const next=db.prepare("SELECT * FROM pilot_inquiries WHERE destination=? AND attempts<3 AND next_at<=? AND (state='queued' OR (state='processing' AND lease_until<=?)) ORDER BY created_at LIMIT 1").get(destination,now,now);
    if(!next)return null;
    const lease=randomUUID();db.prepare("UPDATE pilot_inquiries SET state='processing',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?").run(lease,new Date(Date.now()+30000).toISOString(),next.id);
    return {...next,lease_token:lease,attempts:next.attempts+1};
  });
  if(!row)return false;
  try {const result=await sendAuthMail(mail,row.id,pilotMessage(row),fetchImpl);
    db.prepare("UPDATE pilot_inquiries SET state='sent',provider_id=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND expires_at>?").run(result.providerId,row.id,row.lease_token,NOW());
  }catch {db.prepare("UPDATE pilot_inquiries SET state=?,next_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND expires_at>?")
    .run(row.attempts>=3?'failed':'queued',new Date(Date.now()+60000).toISOString(),row.id,row.lease_token,NOW());}
  return true;
}
