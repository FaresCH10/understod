import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {ensureRecordingSchema} from '../server/recordings.mjs';
import {provisionStaffCredential} from '../server/auth.mjs';
import {issueInvitation,acceptInvitation,processOneInvitation,previewInvitation} from '../server/invitations.mjs';
import {backupLocal,restoreLocal} from '../scripts/local-backup.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {importSqliteBackup} from '../server/postgres/import-sqlite.mjs';
const password='Synthetic-backup-invitation-password-123',mail={available:true,key:Buffer.alloc(32,7),publicOrigin:'http://127.0.0.1:3140'};
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner',access_mode:'credential'};
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'understood-invitation-backup-')),path=join(root,'source.sqlite'),db=openDatabase(path);seed(db);ensureRecordingSchema(db);
  provisionStaffCredential(db,'maya','owner@example.test',password);
  const issue=email=>{const value={requestId:randomUUID(),name:'Synthetic recipient',email,role:'supervisor',confirmed:true};issueInvitation(db,owner,value,mail);return value.requestId;};
  const accepted=issue('accepted@example.test');let acceptedToken;
  await processOneInvitation(db,mail,{send:async(c,id,message)=>{acceptedToken=message.text.match(/#accept-invitation\/([A-Za-z0-9_-]{43})/)[1];return {providerId:'synthetic'};}});
  await acceptInvitation(db,null,'signup',{requestId:randomUUID(),token:acceptedToken,password,confirmation:password},'fixture',mail);
  const pending=issue('pending@example.test');let pendingToken;
  await processOneInvitation(db,mail,{send:async(c,id,message)=>{pendingToken=message.text.match(/#accept-invitation\/([A-Za-z0-9_-]{43})/)[1];throw new Error('Synthetic pending delivery');}});
  const queued=issue('queued@example.test');
  const snapshot=()=>JSON.stringify(Object.fromEntries(['staff','staff_accounts','staff_account_memberships','staff_credentials','staff_invitations','staff_invitation_tokens','staff_invitation_mail','staff_invitation_requests','staff_invitation_acceptances','publications','assignments','attempts','audit'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()])));
  const before=snapshot(),backup=join(root,'backup');await backupLocal({database:path,audioRoot:join(root,'audio'),destination:backup});
  return {root,db,backup,accepted,pending,queued,pendingToken,before,snapshot,async close(){db.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'understood-invitation-backup-'));await rm(root,{recursive:true});}};
}
test('native invitation restore preserves receipts while revoking every outstanding link and private outbox',async()=>{
  const f=await fixture();try {
    const destination=join(f.root,'restored');await restoreLocal({source:f.backup,destination});const restored=new DatabaseSync(join(destination,'understood.sqlite'));
    try {
      for(const id of [f.pending,f.queued]) {const row=restored.prepare('SELECT state,email_payload FROM staff_invitations WHERE id=?').get(id);assert.equal(row.state,'expired');assert.equal(row.email_payload,null);}
      assert.equal(restored.prepare('SELECT state FROM staff_invitations WHERE id=?').get(f.accepted).state,'accepted');
      assert.deepEqual(restored.prepare('SELECT * FROM staff_invitation_acceptances ORDER BY token_hash').all(),f.db.prepare('SELECT * FROM staff_invitation_acceptances ORDER BY token_hash').all());
      assert.equal(restored.prepare('SELECT count(*) n FROM staff_invitation_tokens WHERE revoked_at IS NULL').get().n,0);
      assert.equal(restored.prepare("SELECT count(*) n FROM staff_invitation_mail WHERE payload IS NOT NULL OR state IN ('queued','processing')").get().n,0);
      assert.throws(()=>previewInvitation(restored,{token:f.pendingToken},'restored'),/Invitation unavailable/);
      assert.equal(f.snapshot(),f.before);
    }finally {restored.close();}
  }finally {await f.close();}
});
test('synthetic PostgreSQL cutover preserves invitation history and account links but omits ciphertext and live delivery',async()=>{
  const f=await fixture(),pg=new PGlite(),schema='understood_test_invitation_import';
  const client={release(){},async query(sql,values){return values?.length ? pg.query(sql,values) : (await pg.exec(sql)).at(-1) || {rows:[]};}},pool={async connect(){return client;}};
  try {
    await pg.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
    const request={source:f.backup,schema,requestId:randomUUID(),dataClass:'synthetic'};
    const dry=await importSqliteBackup(pool,request);assert.equal(dry.counts.staff_invitations,3);assert.equal(dry.counts.staff_invitation_acceptances,1);assert.equal((await pg.query('SELECT count(*)::int n FROM staff_invitations')).rows[0].n,0);
    const committed=await importSqliteBackup(pool,{...request,dryRun:false});assert.equal(committed.credentialsImported,false);
    assert.equal((await importSqliteBackup(pool,{...request,dryRun:false})).duplicate,true);
    const rows=(await pg.query('SELECT id,state,email_payload FROM staff_invitations ORDER BY id')).rows;
    assert.equal(rows.find(row=>row.id===f.accepted).state,'accepted');for(const id of [f.pending,f.queued]) assert.equal(rows.find(row=>row.id===id).state,'expired');assert.ok(rows.every(row=>row.email_payload===null));
    assert.equal((await pg.query('SELECT count(*)::int n FROM staff_credentials')).rows[0].n,0);
    assert.equal((await pg.query('SELECT count(*)::int n FROM staff_invitation_tokens WHERE revoked_at IS NULL')).rows[0].n,0);
    assert.equal((await pg.query("SELECT count(*)::int n FROM staff_invitation_mail WHERE payload IS NOT NULL OR state IN ('queued','processing')")).rows[0].n,0);
    const accepted=(await pg.query('SELECT * FROM staff_invitation_acceptances')).rows[0],source=f.db.prepare('SELECT * FROM staff_invitation_acceptances').get();
    assert.equal(accepted.request_id,source.request_id);assert.equal(accepted.account_id,source.account_id);assert.equal(accepted.staff_id,source.staff_id);assert.equal(accepted.created_at.toISOString(),source.created_at);
    assert.equal(f.snapshot(),f.before);
  }finally {await pg.close();await f.close();}
});
