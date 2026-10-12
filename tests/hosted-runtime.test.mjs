import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {PGlite} from '@electric-sql/pglite';
import {hostedSyntheticConfig} from '../server/postgres/hosted-config.mjs';
import {startHostedApi} from '../server/postgres/hosted-runtime.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {configureRuntimePermissions} from '../server/postgres/runtime-permissions.mjs';
import {provisionStaffCredential} from '../server/postgres/auth.mjs';
import {sessionCookie,cookieToken,clearSessionCookie} from '../server/auth.mjs';
import {tokenHash} from '../server/auth-crypto.mjs';
import {pilotDestination} from '../server/pilot-input.mjs';

const env={UNDERSTOOD_TIER:'staging',UNDERSTOOD_AI_MODE:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',UNDERSTOOD_DATA_CLASS:'synthetic',
  UNDERSTOOD_PUBLIC_ORIGIN:'https://understood.example.test',UNDERSTOOD_POSTGRES_SCHEMA:'understood_stage_test',UNDERSTOOD_POSTGRES_URL:'postgres://fixture@example.test/synthetic',UNDERSTOOD_POSTGRES_TLS:'true',
  UNDERSTOOD_TRUSTED_PROXY_NETWORKS:'["127.0.0.1/32"]',UNDERSTOOD_R2_ACCOUNT_ID:'a'.repeat(32),UNDERSTOOD_R2_BUCKET:'synthetic-fixture',UNDERSTOOD_R2_ACCESS_KEY_ID:'test-only',UNDERSTOOD_R2_SECRET_ACCESS_KEY:'test-only'};
const proxyHeaders={host:'understood.example.test','x-forwarded-proto':'https','x-forwarded-for':'198.51.100.20'};
function proxyRequest(url,options={}) {
  return new Promise((resolve,reject)=>{
    const req=httpRequest(url,{method:options.method ?? 'GET',headers:{...proxyHeaders,...options.headers}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);
      res.on('end',()=>{const headers=new Headers();for(const [name,value] of Object.entries(res.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
        resolve(new Response([204,304].includes(res.statusCode)?null:Buffer.concat(chunks),{status:res.statusCode,headers}));});
    });req.on('error',reject);req.end(options.body);
  });
}
test('hosted configuration rejects real/production/demo/insecure/untrusted configurations without any connection',()=>{
  const config=hostedSyntheticConfig(env);assert.equal(config.port,10000);assert.equal(config.storageChecks,false);assert.equal(config.mail.available,false);
  assert.equal(pilotDestination(config.pilotDestination),null);
  assert.equal(config.requestAddress({socket:{remoteAddress:'::ffff:127.0.0.1'},headers:proxyHeaders}),'198.51.100.20');
  for(const patch of [{UNDERSTOOD_TIER:'production'},{UNDERSTOOD_DATA_CLASS:'real'},{UNDERSTOOD_ACCESS_MODE:'demo'},{UNDERSTOOD_AI_MODE:'live'},
    {UNDERSTOOD_PUBLIC_ORIGIN:'http://understood.example.test'},{UNDERSTOOD_PUBLIC_ORIGIN:'https://[::1]'},{UNDERSTOOD_PUBLIC_ORIGIN:'https://localhost'},
    {UNDERSTOOD_PUBLIC_ORIGIN:'https://understood.example.test/path'},{UNDERSTOOD_POSTGRES_SCHEMA:'public'},{UNDERSTOOD_POSTGRES_TLS:'false'},
    {UNDERSTOOD_TRUSTED_PROXY_NETWORKS:'[]'},{UNDERSTOOD_TRUSTED_PROXY_NETWORKS:'["0.0.0.0/0"]'},{UNDERSTOOD_R2_SECRET_ACCESS_KEY:''},
    {UNDERSTOOD_PROVIDER_TESTS:'gemini-free'},{UNDERSTOOD_SOURCE_TRANSCRIPTION:'gemini-free'},{UNDERSTOOD_RECORDING_ADAPTER:'gemini-free'},{UNDERSTOOD_PREPARATION_ADAPTER:'gemini-free'},{UNDERSTOOD_ASSESSMENT_ADAPTER:'gemini-free'},{PORT:'0'},{UNDERSTOOD_STORAGE_CHECKS:'yes'}])assert.throws(()=>hostedSyntheticConfig({...env,...patch}));
  assert.throws(()=>config.requestAddress({socket:{remoteAddress:'203.0.113.20'},headers:proxyHeaders}),/Forbidden transport/);
  for(const headers of [{...proxyHeaders,host:'forged.example.test'},{...proxyHeaders,'x-forwarded-proto':'http'},
    {...proxyHeaders,'x-forwarded-for':'198.51.100.20, 203.0.113.1'},{...proxyHeaders,'x-forwarded-for':undefined}])assert.throws(()=>config.requestAddress({socket:{remoteAddress:'127.0.0.1'},headers}),/Forbidden transport/);
});
test('host-prefixed session cookies are Secure, HttpOnly, host-only and cleared under the same identity',()=>{
  const name='__Host-understood_session',cookie=sessionCookie('test-token',60,{name,secure:true});
  assert.match(cookie,/^__Host-understood_session=test-token; HttpOnly; SameSite=Strict; Path=\/; Max-Age=60; Secure$/);assert.doesNotMatch(cookie,/Domain=/);
  assert.equal(cookieToken({headers:{cookie:'unrelated=one; '+cookie.split(';')[0]}},name),'test-token');
  assert.match(clearSessionCookie({name,secure:true}),/Max-Age=0; Secure$/);
  assert.throws(()=>sessionCookie('x',60,{name}),/require Secure/);assert.throws(()=>sessionCookie('x',60,{name:123}),/Invalid session cookie/);
});
test('hosted API serves built public files and the real scoped credential routes with strict proxy/origin cookies',async()=>{
  const db=new PGlite(),commands=[],pool={async connect(){return {async query(sql,values){commands.push(sql);return values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)??{rows:[]};},release(){}};}};
  const config={...hostedSyntheticConfig(env),port:0};let server;
  try {
    await db.exec(`CREATE SCHEMA ${config.schema};SET search_path TO ${config.schema},pg_catalog`);await runMigrations(pool,config);
    await db.exec("INSERT INTO organizations VALUES('a','Synthetic A'),('b','Synthetic B');INSERT INTO sites VALUES('a','a','Site A','UTC'),('b','b','Site B','UTC');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','a','a','Synthetic owner','owner')");
    const password='Synthetic-hosted-password';await provisionStaffCredential(pool,{staffId:'owner',orgId:'a',siteId:'a',email:'owner@example.test',password},config);
    await assert.rejects(startHostedApi(pool,{},config),/unprivileged/);
    await db.exec('CREATE ROLE hosted_runtime LOGIN');
    await configureRuntimePermissions(pool,{schema:config.schema,role:'hosted_runtime',dedicatedDatabase:true,writersStopped:true});
    await db.exec('SET SESSION AUTHORIZATION hosted_runtime');commands.length=0;
    server=await startHostedApi(pool,{},config);assert.equal(commands.some(sql=>/^\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/.test(sql)),false);
    const base=`http://127.0.0.1:${server.address().port}`,request=(path,options={})=>proxyRequest(base+path,options);
    const root=await request('/');assert.equal(root.status,200);assert.match(root.headers.get('content-type'),/text\/html/);assert.match(root.headers.get('strict-transport-security'),/31536000/);assert.match(root.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    const html=await root.text();assert.doesNotMatch(html,/\/src\/entry/);const asset=html.match(/src="(\/assets\/[^"]+\.js)"/)[1];
    const js=await request(asset);assert.equal(js.status,200);assert.match(js.headers.get('cache-control'),/immutable/);assert.match(js.headers.get('content-type'),/javascript/);
    assert.equal((await request(asset,{headers:{'if-none-match':js.headers.get('etag')}})).status,304);
    const sw=await request('/sw.js');assert.equal(sw.status,200);assert.match(sw.headers.get('cache-control'),/must-revalidate/);assert.equal(sw.headers.get('service-worker-allowed'),'/');
    assert.equal((await request('/.env')).status,404);assert.equal((await request('/server/auth.mjs')).status,404);assert.equal((await request('/assets/hidden.map')).status,404);
    assert.equal((await request('/',{method:'POST'})).status,405);assert.equal((await request('/',{headers:{'x-forwarded-proto':'http'}})).status,403);
    assert.equal((await request('/api/overview')).status,401);assert.equal((await request('/api/demo/session',{method:'POST',headers:{origin:env.UNDERSTOOD_PUBLIC_ORIGIN}})).status,404);
    const credentials={method:'POST',headers:{'content-type':'application/json',origin:env.UNDERSTOOD_PUBLIC_ORIGIN},body:JSON.stringify({email:'owner@example.test',password})};
    assert.equal((await request('/api/auth/staff/login',{...credentials,headers:{...credentials.headers,origin:'https://forged.example.test'}})).status,403);
    const login=await request('/api/auth/staff/login',credentials);assert.equal(login.status,200);const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/^__Host-understood_session=.*; Secure$/);
    const cookie=setCookie.split(';')[0],session=await (await request('/api/session',{headers:{cookie}})).json();assert.equal(session.authenticated,true);assert.equal(session.mode,'synthetic-credential');
    assert.equal((await request('/api/overview',{headers:{cookie}})).status,200);
    assert.equal((await request('/api/overview',{headers:{cookie:cookie.replace('__Host-understood_session','understood_pg_rehearsal')}})).status,401);
    assert.equal((await request('/api/ops/session')).status,200);assert.equal((await (await request('/api/ops/session')).json()).available,false);
    const invalid=await request('/api/auth/staff/login',{...credentials,body:JSON.stringify({email:'unknown@example.test',password:'invalid'})});assert.equal(invalid.status,401);
    assert.equal((await db.query('SELECT count FROM auth_attempts WHERE key_hash=$1',[tokenHash('ip:198.51.100.20')])).rows[0].count,1);
    const logout=await request('/api/logout',{method:'POST',headers:{cookie,origin:env.UNDERSTOOD_PUBLIC_ORIGIN,'x-client-session-context':session.clientContext}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0; Secure$/);
    assert.equal((await request('/api/overview',{headers:{cookie}})).status,401);
    const health=await (await fetch(base+'/api/health')).json();assert.equal(health.backend,'postgres-hosted-synthetic');
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
});
