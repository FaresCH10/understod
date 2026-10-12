import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {requestHelp} from '../server/postgres/clarifications.mjs';
import {processOneCaseFollowup} from '../server/postgres/case-followups.mjs';
import {provisionStaffCredential,insertSession,inSchema,issueWorkerGrant,redeemWorkerGrant} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {encodeWav} from '../src/audio.ts';

const db=new PGlite(),schema='understood_test_followup_browser',objects=new Map();
let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let unlock;queue=new Promise(resolve=>{unlock=resolve;});await previous;
  return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release:unlock};}};
const options={schema},owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,options);
await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic Follow-up QA');INSERT INTO sites VALUES('beirut','cedar','Synthetic Beirut','UTC');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Maya','owner');
  INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker-14','cedar','beirut','Worker 014','ar');
  INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('shelf','cedar','beirut','Shelf colour handover','Synthetic shelf instructions','draft');
  INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('shelf-v3','cedar','beirut','shelf',3,
    '{"title":"Shelf colour handover","source":"Synthetic shelf instructions","languages":{"ar":{"title":"تسليم الرفوف","text":"ضع المنتجات المكتملة على الرف الأزرق وغير المكتملة على الرف الأصفر.","question":"أين ستضع المنتجات المكتملة وغير المكتملة؟"}},"facts":["Finished items go on the blue shelf.","Unfinished items go on the yellow shelf."],"rubric":{"askedFacts":["Finished items go on the blue shelf.","Unfinished items go on the yellow shelf."]}}','published');
  INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment-14','cedar','beirut','shelf-v3','worker-14','ar');`);
await provisionStaffCredential(pool,{staffId:'maya',orgId:'cedar',siteId:'beirut',email:'fixture@example.test',password:`Synthetic-${randomUUID()}!`},options);
const caseId=randomUUID();await requestHelp(pool,{...owner,principal_type:'worker',principal_id:'worker-14'},'assignment-14',{requestId:caseId,text:'Synthetic help: please explain the second shelf.'},options);
const calls=[];
const adapter={provenance:{adapter:'synthetic-browser-fixture',dataClass:'synthetic',textModel:'fixture',speechModel:'tone-fixture',voice:'tone',promptVersion:'v1',schemaVersion:'v1'},
  capabilities:{textLanguages:['en','ar','ur'],speechLanguages:['en','ar']},prepare(){},checkPreparation(){},
  async translate(){calls.push('translate');return {title:'متابعة',text:'أين ستضع العناصر غير المكتملة؟',question:'يرجى الرد بكلماتك الخاصة.'};},
  async checkTranslation(){calls.push('check');return {faithful:true,complete:true,languageCorrect:true,terminologyApplied:true,reasons:[]};},
  async speech(){calls.push('speech');return Buffer.from(encodeWav({duration:2,sampleRate:16000,numberOfChannels:1,getChannelData:()=>Float32Array.from({length:32000},(_,n)=>Math.sin(n*Math.PI*2*440/16000)*0.2)}));}};
const storage={async save(row,bytes){if(objects.has(row.id))throw Error('Exists');objects.set(row.id,Buffer.from(bytes));},
  async read(row){if(!objects.has(row.id))throw Error('Unavailable');return Buffer.from(objects.get(row.id));},async remove(row){objects.delete(row.id);},async exists(row){return objects.has(row.id);}};
const api=createPostgresRehearsalServer(pool,{...options,storage,tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',caseFollowupAdapter:adapter,publicOrigin:'http://127.0.0.1:3192'});
const handler=api.listeners('request')[0],publicBuild=await loadPublicBuild('dist');
let posts=0,reads=0,audioReads=0,ticking=false,stopping=false;
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:3192');
  if(req.method==='GET' && url.pathname==='/api/qa-bootstrap') {
    (async()=>{
      requireLocalRequest(req);const worker=url.searchParams.get('role')==='worker';
      const session=worker?await redeemWorkerGrant(pool,(await issueWorkerGrant(pool,owner,'worker-14',30,options)).token,options)
        :await inSchema(pool,schema,client=>insertSession(client,{id:'maya',org_id:'cedar',site_id:'beirut'},'staff'));
      res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:worker?'/#worker/assignment-14':`/#clarifications/${caseId}`,'cache-control':'no-store'});res.end();
    })().catch(()=>{res.writeHead(503);res.end('Fixture unavailable');});return;
  }
  if(req.method==='GET' && url.pathname==='/api/qa-stats') {
    (async()=>{requireLocalRequest(req);const stats=await inSchema(pool,schema,async client=>({posts,reads,audioReads,calls,objects:objects.size,
      messages:(await client.query('SELECT count(*)::int n FROM case_messages')).rows[0].n,requests:(await client.query('SELECT count(*)::int n FROM case_followups')).rows[0].n}));
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(stats));})().catch(()=>res.end('Unavailable'));return;
  }
  if(req.method==='POST' && url.pathname===`/api/clarifications/${caseId}/followups` && ++posts===1) {
    const end=res.end.bind(res);res.end=function(...args){if(this.statusCode===202){this.statusCode=503;return end(JSON.stringify({error:'Synthetic lost acknowledgement; check the receipt.'}));}return end(...args);};
  }
  if(req.method==='GET' && url.pathname.startsWith(`/api/clarifications/${caseId}/followups/`) && ++reads===1){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic receipt read unavailable'}));}
  if(req.method==='GET' && url.pathname.endsWith('/audio'))audioReads++;
  if(url.pathname.startsWith('/api/'))return handler(req,res);return publicBuild(req,res,url);
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3192,'127.0.0.1',resolve);});
const timer=setInterval(async()=>{if(ticking || stopping)return;ticking=true;try{await processOneCaseFollowup(pool,adapter,storage,{...options,dataClass:'synthetic'});}catch{console.error('Fixture worker unavailable');}finally{ticking=false;}},750);
function stop(){if(stopping)return;stopping=true;clearInterval(timer);server.close(async()=>{while(ticking)await new Promise(resolve=>setTimeout(resolve,10));await db.close();});server.closeIdleConnections();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log('Built disposable PostgreSQL follow-up QA: http://127.0.0.1:3192/api/qa-bootstrap; ?role=worker selects Arabic worker. One lost queue acknowledgement and receipt read. Tone playback only, not live speech. No external services or saved database.');
