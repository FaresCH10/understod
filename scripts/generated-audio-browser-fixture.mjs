import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {createDraft,queuePreparation} from '../server/postgres/preparation.mjs';
import {publish} from '../server/postgres/domain.mjs';
import {rehearsalTasks,runRehearsalWorker} from '../server/postgres/runtime.mjs';
import {issueWorkerGrant,redeemWorkerGrant,provisionStaffCredential,insertSession,inSchema} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {encodeWav} from '../src/audio.ts';
import {loadPublicBuild} from '../server/public-build.mjs';
import {changeGlossary} from '../server/postgres/glossary.mjs';

// Disposable browser evidence only: no saved database, external service or actual synthesized speech.
const built=process.env.UNDERSTOOD_ARTIFACT_FIXTURE_BUILT==='true',history=process.env.UNDERSTOOD_HISTORY_FIXTURE==='true',port=built?3216:3160,origin='http://127.0.0.1:'+port;
const db=new PGlite(),schema='understood_test_speech_browser',objects=new Map();
let audioFailure=false,lostReviewAck=false,lostRegenerationAck=false,failNextSpeech=false,historyFailure='';
let queue=Promise.resolve();
const pool={async connect(){
  const previous=queue;let unlock;queue=new Promise(resolve=>{unlock=resolve;});await previous;
  return {async query(sql,values){return values?.length ? db.query(sql,values) : (await db.exec(sql)).at(-1) || {rows:[]};},release:unlock};
}};
const options={schema,integrationMode:'synthetic'};
const owner={principal_type:'staff',principal_id:'owner',role:'owner',org_id:'qa',site_id:'qa'};
const storage={async save(row,bytes){if(objects.has(row.id)) throw Error('Object exists');objects.set(row.id,Buffer.from(bytes));},
  async read(row){if(audioFailure || !objects.has(row.id)) throw Error('Object missing');return objects.get(row.id);},async remove(row){objects.delete(row.id);}};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,options);
await db.exec("INSERT INTO organizations(id,name) VALUES('qa','Disposable Audio QA');INSERT INTO sites(id,org_id,name,timezone) VALUES('qa','qa','Beirut QA','Asia/Beirut');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic owner','owner')");
await db.exec("INSERT INTO staff(id,org_id,site_id,name,role) VALUES('auditor','qa','qa','Synthetic auditor','auditor')");
for(const staffId of ['owner','auditor']) await provisionStaffCredential(pool,{staffId,orgId:'qa',siteId:'qa',email:`${staffId}@qa.example.test`,password:`Synthetic-QA-${randomUUID()}!`},options);
for(const language of ['en','ar','ur']) await db.query('INSERT INTO workers(id,org_id,site_id,code,language) VALUES($1,\'qa\',\'qa\',$2,$3)',[`worker-${language}`,`014-${language}`,language]);
if(built)for(const [term,targetLanguage,override] of [['blue shelf','ar','الرف الأزرق'],['yellow shelf','ar','الرف الأصفر'],['blue shelf','ur','نیلی شیلف'],
  ...Array.from({length:23},(_,n)=>['QA terminology '+String(n+1).padStart(2,'0'),'ar','مصطلح تجريبي '+String(n+1)])])
  await changeGlossary(pool,owner,'create',null,{requestId:randomUUID(),confirmed:true,term,sourceLanguage:'en',targetLanguage,override},options);
const source='Finished items go on the blue shelf. Unfinished items go on the yellow shelf.',facts=source.split('. ').map(text=>text.endsWith('.') ? text : `${text}.`);
const translations={ar:{title:'تسليم الرفوف',text:'ضع المنتجات المكتملة على الرف الأزرق وغير المكتملة على الرف الأصفر.',question:'أين ستضع المنتجات المكتملة وغير المكتملة؟'},
  ur:{title:'شیلف کی ہدایات',text:'مکمل اشیاء نیلے شیلف پر اور نامکمل اشیاء پیلے شیلف پر رکھیں۔',question:'آپ مکمل اور نامکمل اشیاء کہاں رکھیں گے؟'}};
const adapter={provenance:{adapter:'synthetic-browser-fixture',dataClass:'synthetic',textModel:'fixture',speechModel:'tone-fixture',voice:'tone',promptVersion:'v1',schemaVersion:'v1'},
  capabilities:{textLanguages:['en','ar','ur'],speechLanguages:['en','ar','ur']},
  async prepare(){return {title:'Shelf colour handover',facts,question:'Where will you put finished and unfinished items?',askedFacts:facts};},
  async checkPreparation(){return {sourceGrounded:true,questionAligned:true,ambiguous:false,factEvidence:facts.map((quote,factIndex)=>({factIndex,quote})),askedFactIndexes:[0,1],reasons:[]};},
  async translate(_source,language){return translations[language];},
  async checkTranslation(_source,target){const rejected=target.question.includes('رفض');return {faithful:!rejected,complete:true,languageCorrect:true,terminologyApplied:true,reasons:rejected ? ['unsupported_content'] : []};},
  async speech(){if(failNextSpeech) {failNextSpeech=false;throw Error('Synthetic speech failure');}return Buffer.from(encodeWav({duration:3,sampleRate:16000,numberOfChannels:1,getChannelData:()=>Float32Array.from({length:48000},(_,n)=>Math.sin(n*Math.PI*2*440/16000)*0.2)}));}};
const draft=await createDraft(pool,owner,{requestId:randomUUID(),title:'Shelf colour handover',source},options);await queuePreparation(pool,owner,draft.id,1,options);
await rehearsalTasks(pool,storage,{schema,preparationAdapter:adapter,preparationLanguages:['en','ar','ur']}).preparation();
const publication=await publish(pool,owner,draft.id,{requestId:randomUUID(),revision:1,nextVersion:1,workerIds:['worker-en','worker-ar','worker-ur']},{...options,storage});
if(history)for(let version=2;version<=125;version++) {
  await db.query("UPDATE briefings SET state='ready' WHERE id=$1",[draft.id]);
  await publish(pool,owner,draft.id,{requestId:randomUUID(),revision:1,nextVersion:version,workerIds:['worker-en','worker-ar','worker-ur']},{...options,storage});
}
const readyDraft=await createDraft(pool,owner,{requestId:randomUUID(),title:'Ready synthetic draft',source},options);
await queuePreparation(pool,owner,readyDraft.id,1,options);
await rehearsalTasks(pool,storage,{schema,preparationAdapter:adapter,preparationLanguages:['en','ar','ur']}).preparation();
const assignments=Object.fromEntries((await db.query('SELECT worker_id,id FROM assignments WHERE publication_id=$1',[publication.id])).rows.map(row=>[row.worker_id,row.id]));
const before=JSON.stringify(await db.query("SELECT id,prepared_json FROM briefings ORDER BY id")),publishedBefore=JSON.stringify(await db.query('SELECT * FROM publications ORDER BY id'));
const api=createPostgresRehearsalServer(pool,{schema,storage,tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:origin,...(built?{publicBuild:await loadPublicBuild('dist')}:{})});
let reads=0,writes=0,historyReads=0,versionReads=0;
const handler=api.listeners('request')[0];api.removeAllListeners('request');
api.on('request',(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET' && /\/briefings\/[^/]+\/publications(?:\/[^/]+)?$/.test(url.pathname)) {
    const detail=/\/publications\/[^/]+$/.test(url.pathname);if(detail)versionReads++;else historyReads++;
    if(historyFailure===(detail?'detail':'catalog')){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Synthetic history read interruption'}));return;}
  }
  if(url.pathname==='/api/glossary' && req.method==='GET'){reads++;if(url.searchParams.get('search')==='QA failure'){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Synthetic read interruption'}));return;}}
  if(req.method==='POST')writes++;
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET') {
    (async()=>{
      requireLocalRequest(req);const language=url.searchParams.get('language') || 'en';if(!['en','ar','ur'].includes(language)) throw Error('Invalid fixture language');
      audioFailure=url.searchParams.get('audioFailure')==='1';
      historyFailure=url.searchParams.get('historyFailure') || '';
      lostReviewAck=url.searchParams.get('lostReviewAck')==='1';
      lostRegenerationAck=url.searchParams.get('lostRegenerationAck')==='1';
      failNextSpeech=url.searchParams.get('failNextSpeech')==='1';
      if(url.searchParams.has('staff')) {
        const staffId=url.searchParams.get('staff');if(!['owner','auditor'].includes(staffId)) throw Error('Invalid fixture staff');
        const session=await inSchema(pool,schema,client=>insertSession(client,{id:staffId,org_id:'qa',site_id:'qa'},'staff'));
        res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),'location':`/#briefings/${url.searchParams.get('draft')==='1' ? readyDraft.id : draft.id}`,'cache-control':'no-store'});res.end();return;
      }
      const workerId=`worker-${language}`,grant=await issueWorkerGrant(pool,owner,workerId,30,options),session=await redeemWorkerGrant(pool,grant.token,options);
      res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),'location':`/#worker/${assignments[workerId]}`,'cache-control':'no-store'});res.end();
    })().catch(()=>{res.writeHead(503,{'cache-control':'no-store'});res.end('Fixture unavailable');});return;
  }
  if(lostReviewAck && req.method==='POST' && /^\/api\/briefings\/[^/]+\/review$/.test(url.pathname)) {
    const end=res.end.bind(res);
    res.end=(...args)=>{if(res.statusCode===200) {lostReviewAck=false;res.destroy();return res;}return end(...args);};
  }
  if(lostRegenerationAck && req.method==='POST' && /^\/api\/briefings\/[^/]+\/regenerate$/.test(url.pathname)) {
    const end=res.end.bind(res);
    res.end=(...args)=>{if(res.statusCode===200) {lostRegenerationAck=false;res.destroy();return res;}return end(...args);};
  }
  return handler(req,res);
});
await new Promise((resolve,reject)=>{api.once('error',reject);api.listen(built?port:3161,'127.0.0.1',resolve);});
const controller=new AbortController(),workerTask=runRehearsalWorker(pool,storage,{schema,preparationAdapter:adapter,preparationLanguages:['en','ar','ur']},{signal:controller.signal});
const vite=built?null:spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit',env:{...process.env,UNDERSTOOD_WEB_PORT:'3160',UNDERSTOOD_API_PORT:'3161'}});
let stopping=false;
function stop(){if(stopping) return;stopping=true;clearTimeout(timeout);controller.abort();vite?.kill();api.close(async()=>{await workerTask;console.log(JSON.stringify({terminal:true,reads,historyReads,versionReads,writes,briefingContentUnchanged:before===JSON.stringify(await db.query('SELECT id,prepared_json FROM briefings ORDER BY id')),publicationsUnchanged:publishedBefore===JSON.stringify(await db.query('SELECT * FROM publications ORDER BY id')),externalCalls:0}));await db.close();process.stdin.pause();});api.closeIdleConnections();}
const timeout=setTimeout(stop,15*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});
process.once('SIGINT',stop);process.once('SIGTERM',stop);vite?.on('error',stop);vite?.once('exit',stop);
console.log('Disposable generated-audio QA: '+origin+'/api/qa-bootstrap (language=en/ar/ur). Fixture tones prove playback, not speech quality. No saved data or provider calls.');
