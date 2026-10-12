import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { openDatabase } from '../server/db.mjs';
import { seed } from '../server/seed.mjs';
import { createSession, issueWorkerGrant } from '../server/auth.mjs';
import { receiveRecording } from '../server/recordings.mjs';
import { readPrivateWav } from '../server/audio.mjs';
import { backupLocal, restoreLocal } from '../scripts/local-backup.mjs';
import {ensureRecoverySchema} from '../server/account-recovery.mjs';
import {saveRetention,processOneAudioPurge} from '../server/retention.mjs';

function wav() {
  const bytes = Buffer.alloc(32044);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(32000, 40); bytes.writeInt16LE(1000, 44); return bytes;
}

test('audio retention tombstones survive backup and restore without resurrecting deleted recordings',async()=>{
  const root=await mkdtemp(join(tmpdir(),'understood-retention-restore-'));
  const path=join(root,'source.sqlite'),audio=join(root,'audio'),db=openDatabase(path);seed(db);
  try{
    const receipt=await receiveRecording(db,{principal_type:'worker',principal_id:'worker-30',org_id:'cedar',site_id:'beirut'},'assignment-30',randomUUID(),wav(),audio);
    saveRetention(db,{principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'},{requestId:randomUUID(),revision:0,audioDays:7,confirmed:true});
    await processOneAudioPurge(db,audio,{now:new Date(Date.now()+8*86400000).toISOString()});
    await assert.rejects(readPrivateWav(audio,receipt.id),/ENOENT/);
    const backup=join(root,'backup'),restoredRoot=join(root,'restored');
    assert.equal((await backupLocal({database:path,audioRoot:audio,destination:backup})).recordings,0);
    await restoreLocal({source:backup,destination:restoredRoot});
    const restored=openDatabase(join(restoredRoot,'understood.sqlite'));
    try{
      assert.equal(restored.prepare('SELECT status FROM recording_purges WHERE recording_id=?').get(receipt.id).status,'complete');
      assert.equal(restored.prepare('SELECT status FROM recordings WHERE id=?').get(receipt.id).status,'failed');
      assert.equal(restored.prepare('SELECT audio_days FROM retention_policies').get().audio_days,7);
      await assert.rejects(readPrivateWav(join(restoredRoot,'private-audio'),receipt.id),/ENOENT/);
    }finally{restored.close();}
  }finally{db.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'understood-retention-restore-'));await rm(root,{recursive:true});}
});

test('isolated SQLite plus audio restore preserves exact evidence and revokes restored sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'understood-restore-'));
  const dbPath = join(root, 'source.sqlite'), audio = join(root, 'source-audio');
  const db = openDatabase(dbPath); seed(db);
  try {
    createSession(db, db.prepare('SELECT * FROM staff WHERE id=?').get('maya'), 'staff', 'demo');
    issueWorkerGrant(db, { principal_type: 'staff', principal_id: 'maya', org_id: 'cedar', site_id: 'beirut', role: 'owner' }, 'worker-30');
    ensureRecoverySchema(db);
    db.prepare('INSERT INTO staff_recovery_mail VALUES(?,?,?,?,?,?,?,?,0,NULL,NULL,NULL)').run('reset-mail','reset','hash','encrypted-payload','2026-01-01','2099-01-01','2026-01-01','queued');
    db.prepare('INSERT INTO staff_recovery_tokens VALUES(?,?,?,?,?,?,?,NULL,NULL)').run('synthetic-token-hash','reset-mail','maya','cedar','beirut','credential-fingerprint','2099-01-01');
    const receipt = await receiveRecording(db, { principal_type: 'worker', principal_id: 'worker-30', org_id: 'cedar', site_id: 'beirut' },
      'assignment-30', randomUUID(), wav(), audio);
    const backupDirectory = join(root, 'backup');
    assert.equal((await backupLocal({ database: dbPath, audioRoot: audio, destination: backupDirectory })).recordings, 1);
    const restoredDirectory = join(root, 'restored');
    await restoreLocal({ source: backupDirectory, destination: restoredDirectory });
    const restored = new DatabaseSync(join(restoredDirectory, 'understood.sqlite'), { readOnly: true });
    try {
      assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM assignments WHERE publication_id=?').get('shelf-v3').n, 30);
      assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 24);
      assert.equal(restored.prepare('SELECT status FROM recordings WHERE id=?').get(receipt.id).status, 'received');
      assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL').get().n, 0);
      assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM worker_grants WHERE revoked_at IS NULL').get().n, 0);
      assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM staff_recovery_tokens WHERE revoked_at IS NULL').get().n,0);
      assert.equal(restored.prepare('SELECT payload FROM staff_recovery_mail').get().payload,null);
      assert.equal(restored.prepare('SELECT state FROM staff_recovery_mail').get().state,'expired');
      assert.equal(db.prepare('SELECT revoked_at FROM staff_recovery_tokens').get().revoked_at,null);
      assert.equal(db.prepare('SELECT payload FROM staff_recovery_mail').get().payload,'encrypted-payload');
      assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='backup.restored'").get().n, 2);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL').get().n, 1);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM worker_grants WHERE revoked_at IS NULL').get().n, 1);
      assert.deepEqual(await readPrivateWav(join(restoredDirectory, 'private-audio'), receipt.id), wav());
    } finally { restored.close(); }
    await assert.rejects(() => restoreLocal({ source: backupDirectory, destination: restoredDirectory }), /EEXIST/);
    await assert.rejects(() => backupLocal({ database: dbPath, audioRoot: audio, destination: backupDirectory }), /EEXIST/);
    const originalDatabase = await readFile(join(backupDirectory, 'understood.sqlite'));
    await writeFile(join(backupDirectory, 'understood.sqlite'), Buffer.concat([originalDatabase, Buffer.from('corrupt')]));
    await assert.rejects(() => restoreLocal({ source: backupDirectory, destination: join(root, 'checksum') }), /checksum failed/);
    await writeFile(join(backupDirectory, 'understood.sqlite'), originalDatabase);
    const originalManifest = await readFile(join(backupDirectory, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(originalManifest); manifest.recordings[0].file = '../../outside.wav';
    await writeFile(join(backupDirectory, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(() => restoreLocal({ source: backupDirectory, destination: join(root, 'unsafe') }), /manifest mismatch/);
    await writeFile(join(backupDirectory, 'manifest.json'), originalManifest);
    await unlink(join(backupDirectory, 'private-audio', `${receipt.id}.wav`));
    await assert.rejects(() => restoreLocal({ source: backupDirectory, destination: join(root, 'missing') }), /ENOENT/);
    await writeFile(join(backupDirectory, 'private-audio', `${receipt.id}.wav`), Buffer.alloc(50));
    await assert.rejects(() => restoreLocal({ source: backupDirectory, destination: join(root, 'corrupt') }), /recording/i);
  } finally {
    db.close();
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'understood-restore-'));
    await rm(root, { recursive: true });
  }
});
