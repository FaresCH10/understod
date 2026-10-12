import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {insertSession,inSchema,provisionStaffCredential} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';

const port=Number(process.env.UNDERSTOOD_SEARCH_FIXTURE_PORT??3212),schema='understood_test_search_browser',db=new PGlite();
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let release;queue=new Promise(done=>{release=done;});await previous;
  return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release};}};
const origin=`http://127.0.0.1:${port}`;
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec(`INSERT INTO organizations VALUES('qa','Synthetic Search QA'),('foreign','Synthetic Foreign');
  INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut'),('other','foreign','Foreign QA','UTC');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner'),('auditor','qa','qa','Synthetic Auditor','auditor');
  INSERT INTO crews(id,org_id,site_id,name) VALUES('morning','qa','qa','Morning crew'),('rtl','qa','qa','فريق الصباح'),('foreign','foreign','other','Foreign secret crew');
  INSERT INTO workers(id,org_id,site_id,code,language,active) VALUES('target','qa','qa','Worker 014','ur',false),('rtl-worker','qa','qa','عامل في الفريق الصباحي','ar',true),('foreign','foreign','other','Foreign secret worker','en',true);
  INSERT INTO crew_memberships(worker_id,org_id,site_id,crew_id) VALUES('target','qa','qa','morning'),('rtl-worker','qa','qa','rtl');`);
for(const id of ['owner','auditor'])await provisionStaffCredential(pool,{staffId:id,orgId:'qa',siteId:'qa',email:`${id}@search.example.test`,password:`Synthetic-${randomUUID()}!`},{schema});
for(let i=1;i<=27;i++)await db.query('INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES($1,$2,$3,$4,$5,$6)',
  [`brief-${i}`,'qa','qa',i===1?'Shelf colour handover':`Shelf colour handover ${i}`,'PRIVATE_SYNTHETIC_SOURCE_NOT_SEARCHABLE','draft']);
await db.query('INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES($1,$2,$3,$4,$5,$6)',
  ['long','qa','qa','إرشادات تسليم الرفوف والتواصل مع الفريق الصباحي مع تعليمات طويلة للتحقق من العرض','Synthetic source','draft']);
const fingerprint=async()=>{
  const result={};for(const [table,order] of [['briefings','id'],['workers','id'],['crews','id'],['crew_memberships','worker_id']])result[table]=createHash('sha256').update(JSON.stringify((await db.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows)).digest('hex');
  return result;
};
const before=await fingerprint(),api=createPostgresRehearsalServer(pool,{schema,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin,publicBuild:await loadPublicBuild('dist')});
const handler=api.listeners('request')[0];api.removeAllListeners('request');let searches=0,writes=0;
api.on('request',(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET'){
    (async()=>{requireLocalRequest(req);const id=url.searchParams.get('role')==='auditor'?'auditor':'owner';
      const session=await inSchema(pool,schema,client=>insertSession(client,{id,org_id:'qa',site_id:'qa'},'staff'));
      res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:'/#overview'});res.end();})()
      .catch(()=>{res.writeHead(503);res.end('Synthetic fixture unavailable');});return;
  }
  if(url.pathname==='/api/search')searches++;
  if(!['GET','HEAD','OPTIONS'].includes(req.method))writes++;
  handler(req,res);
});
await new Promise((done,reject)=>{api.once('error',reject);api.listen(port,'127.0.0.1',done);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);api.close(async()=>{
  const after=await fingerprint();console.log(JSON.stringify({terminal:true,searches,writes,businessUnchanged:JSON.stringify(before)===JSON.stringify(after),externalCalls:0}));
  await db.close();process.stdin.pause();});api.closeIdleConnections();}
const timeout=setTimeout(stop,15*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-search',url:`${origin}/api/qa-bootstrap`,expiresInSeconds:900}));
