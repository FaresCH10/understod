import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {createAppServer} from '../server/index.mjs';
import {createSession,provisionStaffCredential,revokeSession,sessionCookie} from '../server/auth.mjs';
import {fetchBootstrapSession} from '../src/worker-offline.ts';
import {validStaffSession,sameStaffSession} from '../src/session-state.ts';
import {recheckStaffSession,confirmStaffSession} from '../src/staff-session-recovery.ts';

async function fixture() {
  const db=openDatabase(':memory:');seed(db);
  for(const id of ['maya','harbor-owner'])provisionStaffCredential(db,id,`${id}@session.example.test`,'Synthetic-session-password-123');
  const server=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:'http://127.0.0.1:3031',mail:{mode:'disabled'}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${server.address().port}`;let cookie='',reads=0;
  const issue=(id='maya')=>{const value=createSession(db,db.prepare('SELECT * FROM staff WHERE id=?').get(id),'staff','credential');cookie=sessionCookie(value.token,value.maxSeconds).split(';')[0];return value;};
  const read=()=>fetchBootstrapSession(async(path,options)=>{
    assert.equal(path,'/api/session');assert.equal(options.method,undefined);assert.equal(options.cache,'no-store');reads++;
    const response=await fetch(origin+path,{...options,headers:{...options.headers,cookie}});
    assert.equal(response.headers.get('cache-control'),'no-store');return response;
  },new AbortController().signal);
  const snapshot=()=>Object.fromEntries(['organizations','sites','workers','briefings','publications','assignments','attempts','clarifications','audit'].map(table=>[table,createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM '+table+' ORDER BY id').all())).digest('hex')]));
  return {db,issue,read,snapshot,get cookie(){return cookie;},get reads(){return reads;},
    async close(){await new Promise(resolve=>server.close(resolve));db.close();}};
}

test('actual session API recovery observes exact staff authority and foreign cookie rotation without business writes',async()=>{
  const f=await fixture();
  try {
    f.issue();const before=f.snapshot(),expected=await f.read();assert.equal(validStaffSession(expected),true);
    const same=await recheckStaffSession(expected,f.read,()=>true);assert.equal(same.kind,'same');assert.ok(sameStaffSession(expected,await confirmStaffSession(same.session,f.read,()=>true)));
    f.issue('harbor-owner');const different=await recheckStaffSession(expected,f.read,()=>true);assert.equal(different.kind,'different');assert.equal(different.session.organization,'Harbor Tools');assert.notEqual(different.session.staffScope,expected.staffScope);
    f.issue();await assert.rejects(confirmStaffSession(different.session,f.read,()=>true),/Session unavailable/);
    assert.equal(f.reads,7);assert.deepEqual(f.snapshot(),before);
  }finally{await f.close();}
});

test('actual expired, revoked or disabled staff sessions recover only to a verified guest, never the old workspace',async()=>{
  const f=await fixture();
  try {
    for(const action of ['expired','revoked','disabled']) {
      f.db.prepare("UPDATE staff SET active=1 WHERE id='maya'").run();
      const issued=f.issue(),expected=await f.read(),before=f.snapshot();assert.equal(validStaffSession(expected),true);
      if(action==='expired')f.db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run('2020-01-01T00:00:00.000Z',createHash('sha256').update(issued.token).digest('hex'));
      if(action==='revoked')revokeSession(f.db,{headers:{cookie:f.cookie}});
      if(action==='disabled')f.db.prepare("UPDATE staff SET active=0 WHERE id='maya'").run();
      const observed=await recheckStaffSession(expected,f.read,()=>true);assert.equal(observed.kind,'guest');
      const confirmed=await confirmStaffSession(observed.session,f.read,()=>true);assert.equal(confirmed.authenticated,false);
      assert.deepEqual(f.snapshot(),before);
    }
  }finally{await f.close();}
});

test('actual archived site policy change is explicitly different, and a policy race cannot confirm it',async()=>{
  const f=await fixture();
  try {
    f.issue();const expected=await f.read(),before=f.snapshot();
    f.db.prepare("INSERT INTO site_lifecycle(site_id,org_id,revision,state,reason,updated_at) VALUES('beirut','cedar',1,'archived','pilot_closed',?)").run(new Date().toISOString());
    const observed=await recheckStaffSession(expected,f.read,()=>true);assert.equal(observed.kind,'different');assert.equal(observed.session.siteState,'archived');
    assert.equal((await confirmStaffSession(observed.session,f.read,()=>true)).siteState,'archived');
    f.db.prepare("UPDATE site_lifecycle SET state='active',revision=revision+1 WHERE site_id='beirut'").run();
    await assert.rejects(confirmStaffSession(observed.session,f.read,()=>true),/Session unavailable/);
    assert.deepEqual(f.snapshot(),before);
  }finally{await f.close();}
});
