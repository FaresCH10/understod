import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {insertSession,inSchema,provisionStaffCredential} from '../server/postgres/auth.mjs';
import {processOnePreparation} from '../server/postgres/preparation.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';

const port=Number(process.env.UNDERSTOOD_DRAFT_FIXTURE_PORT??3213),schema='understood_test_draft_flow_browser',db=new PGlite();
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let release;queue=new Promise(done=>{release=done;});await previous;
  return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release};}};
const origin=`http://127.0.0.1:${port}`;
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec(`INSERT INTO organizations VALUES('qa','Synthetic Draft QA');
  INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner');
  INSERT INTO workers(id,org_id,site_id,code,language,active) VALUES('worker-en','qa','qa','Worker 001','en',true),('worker-ar','qa','qa','Worker 002','ar',true);`);
await provisionStaffCredential(pool,{staffId:'owner',orgId:'qa',siteId:'qa',email:'owner@draft.example.test',password:`Synthetic-${randomUUID()}!`},{schema});
const api=createPostgresRehearsalServer(pool,{schema,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin,publicBuild:await loadPublicBuild('dist')});
const handler=api.listeners('request')[0];api.removeAllListeners('request');const commands={};
api.on('request',(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET'){
    (async()=>{requireLocalRequest(req);const session=await inSchema(pool,schema,client=>insertSession(client,{id:'owner',org_id:'qa',site_id:'qa'},'staff'));
      res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:'/#overview'});res.end();})()
      .catch(()=>{res.writeHead(503);res.end('Synthetic fixture unavailable');});return;
  }
  if(!['GET','HEAD','OPTIONS'].includes(req.method))commands[`${req.method} ${url.pathname}`]=(commands[`${req.method} ${url.pathname}`]??0)+1;
  handler(req,res);
});
await new Promise((done,reject)=>{api.once('error',reject);api.listen(port,'127.0.0.1',done);});
let stopping=false,running=null;
const worker=setInterval(()=>{if(stopping || running)return;running=processOnePreparation(pool,{schema,integrationMode:'synthetic'}).catch(()=>console.log('Synthetic fixture worker failed')).finally(()=>{running=null;});},250);
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);clearInterval(worker);api.close(async()=>{
  if(running)await running;
  const counts={};for(const table of ['briefings','publications','assignments','jobs','attempts'])counts[table]=Number((await db.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
  console.log(JSON.stringify({terminal:true,commands,counts,externalCalls:0}));await db.close();process.stdin.pause();});api.closeIdleConnections();}
const timeout=setTimeout(stop,15*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-draft-flow',url:`${origin}/api/qa-bootstrap`,expiresInSeconds:900}));
