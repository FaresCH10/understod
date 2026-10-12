import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {requestWorkerDeletion} from '../server/deletions.mjs';
import {requestWorkerDeletion as pgDelete} from '../server/postgres/deletions.mjs';
import * as local from '../server/worker-import.mjs';
import * as postgres from '../server/postgres/worker-import.mjs';

const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
const upload=(filename,text='New Synthetic')=>({requestId:randomUUID(),filename,bytes:Buffer.from(`worker_id,language\n${text},en\n`)});

for(const backend of ['SQLite','PostgreSQL'])test(`${backend} deletion minimizes filenames atomically, binds exact replay and expires later matching uploads`,async()=>{
  const pg=backend==='PostgreSQL',db=pg?new PGlite():openDatabase(':memory:');
  const client={async query(sql,values){return values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};
  const connection=pg?{async connect(){return client;}}:db,api=pg?postgres:local;
  const query=async(sql,values=[])=>pg?(await db.query(sql,values)).rows:db.prepare(sql.replace(/\$\d+/g,'?')).all(...values);
  try{
    if(pg){
      await runMigrations(connection);
      await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic');INSERT INTO sites VALUES('beirut','cedar','Synthetic','UTC');
        INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Synthetic','owner');
        INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker-30','cedar','beirut','Worker 030','en');`);
    }else seed(db);
    const inputs=[upload('Worker 030.csv'),upload('crew.csv','Worker 030')];
    for(const input of inputs)await api.previewWorkerImport(connection,owner,input);
    const unrelated=upload('unrelated.csv');await api.previewWorkerImport(connection,owner,unrelated);
    const old=upload('old Worker 030.csv');
    await query(`INSERT INTO worker_imports(id,org_id,site_id,requested_by,filename,sha256,status,rows_json,errors_json,created_at,expires_at)
      VALUES($1,'cedar','beirut','maya',$2,$3,'expired',NULL,NULL,'2000-01-01T00:00:00.000Z','2000-01-02T00:00:00.000Z')`,
      [old.requestId,old.filename,local.importInput(old).sha]);
    await (pg?pgDelete:requestWorkerDeletion)(connection,owner,'worker-30',{requestId:randomUUID(),expectedCode:'Worker 030',reason:'worker_request',confirmed:true});
    if(pg)await db.exec(`CREATE FUNCTION fail_metadata_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='workers.import_deletion_purged' THEN RAISE EXCEPTION 'Injected audit failure'; END IF;RETURN NEW;END;$$;
      CREATE TRIGGER fail_metadata_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_metadata_audit();`);
    else db.exec("CREATE TRIGGER fail_metadata_audit BEFORE INSERT ON audit WHEN NEW.action='workers.import_deletion_purged' BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END;");
    await assert.rejects(async()=>api.expireWorkerImports(connection),/Injected/);
    assert.equal((await query('SELECT filename FROM worker_imports WHERE id=$1',[inputs[0].requestId]))[0].filename,inputs[0].filename);
    await db.exec(pg?'DROP TRIGGER fail_metadata_audit ON audit':'DROP TRIGGER fail_metadata_audit');
    assert.equal(await api.expireWorkerImports(connection),3);
    for(const input of [...inputs,old]){
      const row=(await query('SELECT * FROM worker_imports WHERE id=$1',[input.requestId]))[0];
      assert.equal(row.filename,'[Deleted].csv');assert.equal(row.filename_hash,local.importFilenameHash(input.filename));
      assert.equal(row.rows_json,null);assert.equal(row.errors_json,null);assert.equal(row.status,'expired');
      const replay=await api.previewWorkerImport(connection,owner,input);
      assert.equal(replay.duplicate,true);assert.equal(replay.status,'expired');assert.equal(replay.filename,'[Deleted].csv');
      await assert.rejects(async()=>api.previewWorkerImport(connection,owner,{...input,filename:'different.csv'}),/conflict/);
      await assert.rejects(async()=>api.previewWorkerImport(connection,owner,{...input,bytes:Buffer.from('worker_id,language\nChanged,en\n')}),/conflict/);
      await assert.rejects(async()=>query('UPDATE worker_imports SET filename=$1 WHERE id=$2',[input.filename,input.requestId]),/immutable/);
      await assert.rejects(async()=>query('UPDATE worker_imports SET filename_hash=NULL WHERE id=$1',[input.requestId]),/immutable/);
      await assert.rejects(async()=>query("UPDATE worker_imports SET status='imported',imported_count=99 WHERE id=$1",[input.requestId]),/immutable/);
    }
    assert.equal((await api.getWorkerImport(connection,owner,unrelated.requestId)).status,'validated');
    const later=upload('later.csv','Worker 030');
    const received=await api.previewWorkerImport(connection,owner,later);
    assert.equal(received.status,'expired');assert.deepEqual(received.rows,[]);assert.equal(received.filename,'[Deleted].csv');
    assert.equal(await api.expireWorkerImports(connection),0);
    assert.equal(Number((await query("SELECT count(*) AS count FROM audit WHERE action='workers.import_deletion_purged'"))[0].count),4);
  }finally{await db.close();}
});
