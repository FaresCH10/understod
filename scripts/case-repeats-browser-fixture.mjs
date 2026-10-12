import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {submitAnswer} from '../server/postgres/domain.mjs';
import {processOneAssessment} from '../server/postgres/assessment-worker.mjs';
import {provisionStaffCredential,insertSession,inSchema,issueWorkerGrant,redeemWorkerGrant} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {receiveCaseVoice} from '../server/postgres/case-voice.mjs';
import {encodeWav} from '../src/audio.ts';

const reviewMode=process.argv.includes('--reviews');
const voiceMode=process.argv.includes('--voice');
const db=new PGlite(),schema='understood_test_repeat_browser',options={schema};
let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let unlock;queue=new Promise(resolve=>{unlock=resolve;});await previous;
  return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release:unlock};}};
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'},worker={principal_type:'worker',principal_id:'worker-14',org_id:'cedar',site_id:'beirut'};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,options);
await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic Repeat QA');INSERT INTO sites VALUES('beirut','cedar','Synthetic Beirut','UTC');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Maya','owner');
  INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker-14','cedar','beirut','Worker 014','en');
  INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('shelf','cedar','beirut','Shelf colour handover','Synthetic instructions','draft');
  INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('shelf-v3','cedar','beirut','shelf',3,
    '{"title":"Shelf colour handover","source":"Synthetic instructions","question":"Where will you put finished and unfinished items?","facts":["Finished items: blue shelf","Unfinished items: yellow shelf"],"rubric":{"askedFacts":["Finished items: blue shelf","Unfinished items: yellow shelf"]},"languages":{"en":{"title":"Shelf colour handover","text":"Finished items go on the blue shelf. Unfinished items go on the yellow shelf.","question":"Where will you put finished and unfinished items?"}}}','published');
  INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment-14','cedar','beirut','shelf-v3','worker-14','en');`);
const adapter={assess:async()=>({outcome:'clarification',reasons:['missing_asked_fact'],evidence:[]})};
const original=await submitAnswer(pool,worker,'assignment-14',randomUUID(),'Finished items go on the blue shelf.',options);await processOneAssessment(pool,adapter,options);
await inSchema(pool,schema,client=>client.query("UPDATE assignments SET due_at=clock_timestamp()-interval '1 day'"));
const caseId=await inSchema(pool,schema,async client=>(await client.query('SELECT id FROM clarifications')).rows[0].id);
const originalHash=await inSchema(pool,schema,async client=>createHash('sha256').update(JSON.stringify((await client.query('SELECT * FROM attempts WHERE id=$1',[original.id])).rows)).digest('hex'));
await provisionStaffCredential(pool,{staffId:'maya',orgId:'cedar',siteId:'beirut',email:'fixture@example.test',password:`Synthetic-${randomUUID()}!`},options);
const objects=new Map(),storage={async save(row,bytes){objects.set(row.id,Buffer.from(bytes));},async read(row){if(!objects.has(row.id))throw Error('Unavailable');return Buffer.from(objects.get(row.id));},async remove(row){objects.delete(row.id);},async exists(row){return objects.has(row.id);}};
if(voiceMode) {
  const bytes=Buffer.from(encodeWav({duration:2,sampleRate:16000,numberOfChannels:1,getChannelData:()=>Float32Array.from({length:32000},(_,i)=>0.2*Math.sin(2*Math.PI*440*i/16000))}));
  await receiveCaseVoice(pool,worker,'assignment-14','reply',caseId,randomUUID(),bytes,storage,options);
}
const api=createPostgresRehearsalServer(pool,{...options,storage:voiceMode?storage:{},tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:'http://127.0.0.1:3193'});
const handler=api.listeners('request')[0],publicBuild=await loadPublicBuild('dist');let posts=0,reads=0,ticking=false,stopping=false;
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:3193');
  if(req.method==='GET' && url.pathname==='/api/qa-bootstrap') {
    (async()=>{requireLocalRequest(req);const isWorker=url.searchParams.get('role')==='worker';
      const session=isWorker?await redeemWorkerGrant(pool,(await issueWorkerGrant(pool,owner,'worker-14',30,options)).token,options)
        :await inSchema(pool,schema,client=>insertSession(client,{id:'maya',org_id:'cedar',site_id:'beirut'},'staff'));
      res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:isWorker?voiceMode?'/#worker/assignment-14':'/#inbox':`/#clarifications/${caseId}`,'cache-control':'no-store'});res.end();
    })().catch(()=>{res.writeHead(503);res.end('Fixture unavailable');});return;
  }
  const commandPath=`/api/clarifications/${caseId}/${reviewMode?'reviews':'repeats'}`;
  if(req.method==='POST' && url.pathname===commandPath && ++posts===1) {
    const end=res.end.bind(res);res.end=function(...args){if(this.statusCode===200)return end(JSON.stringify({error:'Synthetic lost acknowledgement; check the receipt.'}));return end(...args);};
  }
  if(req.method==='GET' && url.pathname.startsWith(`${commandPath}/`) && ++reads===1){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic receipt read unavailable'}));}
  if(url.pathname.startsWith('/api/'))return handler(req,res);return publicBuild(req,res,url);
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3193,'127.0.0.1',resolve);});
const timer=setInterval(async()=>{if(ticking || stopping)return;ticking=true;try{await processOneAssessment(pool,adapter,options);}finally{ticking=false;}},750);
function stop(){if(stopping)return;stopping=true;clearInterval(timer);server.close(async()=>{while(ticking)await new Promise(resolve=>setTimeout(resolve,10));
  const evidence=await inSchema(pool,schema,async client=>({posts,reads,originalUnchanged:originalHash===createHash('sha256').update(JSON.stringify((await client.query('SELECT * FROM attempts WHERE id=$1',[original.id])).rows)).digest('hex'),
    assignments:(await client.query('SELECT count(*)::int n FROM assignments')).rows[0].n,receipts:(await client.query('SELECT count(*)::int n FROM submission_receipts')).rows[0].n,cases:(await client.query('SELECT count(*)::int n FROM clarifications')).rows[0].n,
    repeats:(await client.query('SELECT status FROM case_repeats')).rows,reviews:(await client.query('SELECT kind,due_at FROM case_reviews ORDER BY sequence')).rows,
    voices:(await client.query('SELECT kind,status,cleanup_state FROM case_voice')).rows}));console.log(JSON.stringify(evidence));await db.close();process.stdin.pause();});server.closeIdleConnections();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});
console.log(`Disposable built PostgreSQL ${voiceMode?'voice':reviewMode?'review':'repeat'} QA: http://127.0.0.1:3193/api/qa-bootstrap; ?role=worker selects worker. Synthetic in-memory assessment and generated tone; no external services or saved database. Enter stop for evidence and graceful shutdown.`);
