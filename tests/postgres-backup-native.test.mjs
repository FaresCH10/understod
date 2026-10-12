import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPostgresPool} from '../server/postgres/db.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {localAudioStore} from '../server/private-storage.mjs';
import {backupKey} from '../server/backup-files.mjs';
import {inspectWav} from '../server/audio.mjs';
import {encodeWav} from '../src/audio.ts';
import {createPostgresBackup,restorePostgresBackup} from '../scripts/postgres-backup.mjs';

const enabled=process.env.UNDERSTOOD_BACKUP_TEST_ISOLATED==='true'
  && process.env.UNDERSTOOD_BACKUP_TEST_SOURCE_URL && process.env.UNDERSTOOD_BACKUP_TEST_RESTORE_URL;
test('native pg_dump/pg_restore use synchronized full relational archive and isolated private object readback',
  {skip:!enabled?'Requires explicitly isolated source/empty-target PostgreSQL databases and installed native tools':false,timeout:180000},async()=>{
    const config=prefix=>({connectionString:process.env[`${prefix}_URL`],tls:process.env.UNDERSTOOD_BACKUP_TEST_TLS==='true',caFile:process.env.UNDERSTOOD_BACKUP_TEST_CA_FILE});
    const connection=config('UNDERSTOOD_BACKUP_TEST_SOURCE'),targetConnection=config('UNDERSTOOD_BACKUP_TEST_RESTORE');
    assert.notEqual(connection.connectionString,targetConnection.connectionString);
    const source=await createPostgresPool(connection),target=await createPostgresPool(targetConnection),root=await mkdtemp(join(tmpdir(),'understood-native-restore-'));
    const schema=`understood_test_backup_${randomBytes(6).toString('hex')}`,key=backupKey(randomBytes(32).toString('hex'));let created=false,restored=false;
    const sourceStorage=localAudioStore(join(root,'source-audio')),targetStorage=localAudioStore(join(root,'target-audio'));
    try {
      assert.match(schema,/^understood_test_backup_[a-f0-9]{12}$/);
      await source.query(`CREATE SCHEMA "${schema}"`);created=true;await runMigrations(source,{schema});
      const client=await source.connect();
      const bytes=Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>new Float32Array(16000).fill(0.2)}));
      const recording={id:randomUUID(),org_id:'synthetic',site_id:'test',...inspectWav(bytes)};
      try {
        await client.query(`SET search_path TO "${schema}",pg_catalog`);
        await client.query("INSERT INTO organizations(id,name) VALUES('synthetic','Synthetic backup test')");
        await client.query("INSERT INTO sites(id,org_id,name,timezone) VALUES('test','synthetic','Test','UTC')");
        await client.query("INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','synthetic','test','Synthetic 001','en')");
        await client.query("INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('brief','synthetic','test','Test','Synthetic source','ready')");
        await client.query("INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('pub','synthetic','test','brief',1,'{\"synthetic\":true}','published')");
        await client.query("INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','synthetic','test','pub','worker','en')");
        await client.query("INSERT INTO system_controls(id,revision,jobs_paused,provider_paused) VALUES('global',1,true,true)");
        await client.query(`INSERT INTO recordings(id,org_id,site_id,assignment_id,submission_id,sha256,duration_seconds,bytes,status,received_at)
          VALUES($1,'synthetic','test','assignment','synthetic-submission',$2,1,$3,'received',clock_timestamp())`,[recording.id,recording.sha256,recording.bytes]);
      }finally {client.release();}
      await sourceStorage.save(recording,bytes);
      const directory=join(root,'backup');
      const backup=await createPostgresBackup({pool:source,storage:sourceStorage,directory,scratchDirectory:join(root,'backup-scratch'),key,connection,schema,writersStopped:true,
        dumpTool:process.env.UNDERSTOOD_PG_DUMP || 'pg_dump'});assert.equal(backup.complete,true);
      const report=await restorePostgresBackup({pool:target,storage:targetStorage,directory,scratchDirectory:join(root,'restore-scratch'),key,connection:targetConnection,
        isolatedTarget:true,trustedArchive:true,restoreTool:process.env.UNDERSTOOD_PG_RESTORE || 'pg_restore'});restored=true;
      assert.equal(report.quarantined,true);assert.equal(report.objectReadbackVerified,true);assert.equal(report.activationAllowed,false);
      assert.deepEqual(await targetStorage.read(recording),bytes);
      const targetClient=await target.connect();
      try {
        await targetClient.query(`SET search_path TO "${schema}",pg_catalog`);
        assert.equal((await targetClient.query('SELECT count(*)::int AS n FROM assignments')).rows[0].n,1);
        await assert.rejects(targetClient.query("UPDATE publications SET snapshot_json='{}'"),/immutable/);
      }finally {targetClient.release();}
    }finally {
      key.fill(0);
      if(created)await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      if(restored)await target.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.end();await target.end();await rm(root,{recursive:true,force:true});
    }
  });
