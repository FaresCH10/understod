import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {transaction} from '../server/db.mjs';
import {consumeAuthBudget,AUTH_GLOBAL_KEY,AUTH_GLOBAL_LIMIT,AUTH_KEY_LIMIT} from '../server/auth-budget.mjs';
import {consumeAuthBudget as consumePostgres} from '../server/postgres/auth-budget.mjs';
import {tokenHash} from '../server/auth-crypto.mjs';

async function fixture(postgres) {
  const db=postgres ? new PGlite() : new DatabaseSync(':memory:');
  const sql=`CREATE TABLE auth_attempts(key_hash TEXT PRIMARY KEY,count INTEGER NOT NULL CHECK(count>=0),window_started_at ${postgres ? 'TIMESTAMPTZ' : 'TEXT'} NOT NULL)`;
  if(postgres) await db.exec(sql);else db.exec(sql);
  const query=async(sql,values=[])=>postgres ? (await db.query(sql,values)).rows : db.prepare(sql.replaceAll(/\$\d+/g,'?')).all(...values);
  const consume=async(keys,limit,options)=>{
    if(!postgres) return transaction(db,()=>consumeAuthBudget(db,keys,limit,options));
    await db.exec('BEGIN');
    try {const result=await consumePostgres(db,keys,limit,options);await db.exec('COMMIT');return result;}
    catch(error) {await db.exec('ROLLBACK');throw error;}
  };
  const put=async(key,count,at=new Date().toISOString())=>query('INSERT INTO auth_attempts VALUES($1,$2,$3)',[key,count,at]);
  return {db,query,consume,put};
}

for(const postgres of [false,true]) {
  const name=postgres ? 'PostgreSQL' : 'SQLite';
  test(`${name} authentication admission stops writes for blocked identities and shares a global ceiling`,async()=>{
    const {db,query,consume,put}=await fixture(postgres);
    try {
      const ip=tokenHash('test-ip'),email=tokenHash('test-email');
      for(let n=0;n<5;n++) assert.equal(await consume([ip,email],5),true);
      const before=await query('SELECT * FROM auth_attempts ORDER BY key_hash');
      for(let n=0;n<20;n++) assert.equal(await consume([ip,tokenHash(`changed-email-${n}`)],5),false);
      assert.deepEqual(await query('SELECT * FROM auth_attempts ORDER BY key_hash'),before);
      await query('UPDATE auth_attempts SET count=$1 WHERE key_hash=$2',[AUTH_GLOBAL_LIMIT-1,AUTH_GLOBAL_KEY]);
      assert.equal(await consume([tokenHash('invitation-token'),tokenHash('invitation-ip')],10),true);
      const capped=await query('SELECT * FROM auth_attempts ORDER BY key_hash');
      assert.equal(await consume([tokenHash('reset-token'),tokenHash('reset-ip')],5),false);
      assert.deepEqual(await query('SELECT * FROM auth_attempts ORDER BY key_hash'),capped);
      await put(tokenHash('old-private-hash'),99,'2000-01-01T00:00:00.000Z');
      assert.equal(await consume([ip],5),false);
      assert.equal((await query('SELECT * FROM auth_attempts WHERE key_hash=$1',[tokenHash('old-private-hash')])).length,0);
      await query('UPDATE auth_attempts SET window_started_at=$1',['2000-01-01T00:00:00.000Z']);
      assert.equal(await consume([ip,email],5),true);
      assert.equal((await query('SELECT COUNT(*) n FROM auth_attempts'))[0].n,3);
      assert(!JSON.stringify(await query('SELECT * FROM auth_attempts')).includes('test-email'));
    }finally {await db.close();}
  });
  test(`${name} authentication admission bounds key cardinality and reserves failure-only login counters`,async()=>{
    const {db,query,consume,put}=await fixture(postgres);
    try {
      const keys=[tokenHash('login-email'),tokenHash('login-ip')];
      assert.equal(await consume(keys,5,{increment:false}),true);
      assert.deepEqual((await query('SELECT count FROM auth_attempts WHERE key_hash<>$1 ORDER BY key_hash',[AUTH_GLOBAL_KEY])).map(row=>row.count),[0,0]);
      if(postgres) await query(`INSERT INTO auth_attempts SELECT md5(n::text)||md5(n::text),1,clock_timestamp() FROM generate_series(1,$1) n`,[AUTH_KEY_LIMIT-3]);
      else transaction(db,()=>{const save=db.prepare('INSERT INTO auth_attempts VALUES(?,?,?)');for(let n=0;n<AUTH_KEY_LIMIT-3;n++) save.run(tokenHash(`fill-${n}`),1,new Date().toISOString());});
      assert.equal((await query('SELECT COUNT(*) n FROM auth_attempts'))[0].n,AUTH_KEY_LIMIT);
      const before=await query('SELECT * FROM auth_attempts ORDER BY key_hash');
      assert.equal(await consume([tokenHash('new-email'),keys[1]],5),false);
      assert.deepEqual(await query('SELECT * FROM auth_attempts ORDER BY key_hash'),before);
      assert.equal(await consume(keys,5,{increment:false}),true);
      assert.equal((await query('SELECT COUNT(*) n FROM auth_attempts'))[0].n,AUTH_KEY_LIMIT);
    }finally {await db.close();}
  });
}
