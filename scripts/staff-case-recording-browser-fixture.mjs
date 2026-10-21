import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {provisionStaffCredential,authenticateStaff} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../server/domain.mjs';
import {submitAnswer} from '../server/postgres/domain.mjs';
import {processOneAssessment} from '../server/postgres/assessment-worker.mjs';
import {receiveStaffCaseRecording} from '../server/postgres/staff-case-recordings.mjs';
import {encodeWav} from '../src/audio.ts';

const port=Number(process.env.UNDERSTOOD_STAFF_AUDIO_QA_PORT??3234),build=resolve(process.env.UNDERSTOOD_STAFF_AUDIO_QA_BUILD??'.tools/staff-audio-preview-20261021/dist');
if(!Number.isSafeInteger(port)||port<1024||port>65535||[3020,3021].includes(port))throw Error('Use an isolated synthetic fixture port');
const host=process.env.UNDERSTOOD_STAFF_AUDIO_QA_HOST??'127.0.0.1';
if(!['127.0.0.1','localhost'].includes(host))throw Error('Use a local synthetic fixture origin');
const origin=`http://${host}:${port}`,schema='understood_test_staff_audio_browser',db=new PGlite();
const followupMode=process.env.UNDERSTOOD_STAFF_AUDIO_QA_FOLLOWUP??'disabled';
if(!['disabled','queue-only'].includes(followupMode))throw Error('Use a declared synthetic follow-up fixture mode');
const language=process.env.UNDERSTOOD_STAFF_AUDIO_QA_LANGUAGE??'ar';
if(!['en','ar','ur'].includes(language))throw Error('Use a supported synthetic assignment language');
const caseFollowupAdapter=followupMode==='queue-only'?{provenance:{dataClass:'synthetic'},capabilities:{textLanguages:['en','ar','ur'],speechLanguages:['en','ar','ur']}}:null;
let tail=Promise.resolve();const pool={async connect(){const previous=tail;let release;tail=new Promise(done=>{release=done;});await previous;return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release};}};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec(`INSERT INTO organizations VALUES('qa','Synthetic Staff Audio QA');INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner');`);
await db.query("INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','qa','qa','Worker 014',$1)",[language]);
const snapshot=syntheticPrepare(CANONICAL_SOURCE),owner={principal_type:'staff',principal_id:'owner',org_id:'qa',site_id:'qa',role:'owner'};
await db.query("INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('brief','qa','qa','Synthetic shelf handover',$1,'ready')",[CANONICAL_SOURCE]);
await db.query("INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('publication','qa','qa','brief',3,$1,'published')",[JSON.stringify(snapshot)]);
await db.query("INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','qa','qa','publication','worker',$1)",[language]);
const original=await submitAnswer(pool,{principal_type:'worker',principal_id:'worker',org_id:'qa',site_id:'qa'},'assignment',randomUUID(),'Finished items go on the blue shelf.',{schema});
await processOneAssessment(pool,{assess:async()=>({outcome:'clarification',reasons:['missing_asked_fact'],evidence:[]})},{schema});
const caseId=(await db.query('SELECT id FROM clarifications WHERE attempt_id=$1',[original.id])).rows[0].id;
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex'),originalHash=fingerprint((await db.query('SELECT * FROM attempts ORDER BY id')).rows);
const samples=new Float32Array(16000);for(let n=0;n<samples.length;n++)samples[n]=.1*Math.sin(n*2*Math.PI*220/16000);
const wav=Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>samples}));
const objects=new Map(),corrupt=new Set();let storageMode='normal',releaseHold=null,held=false;
const storage={async save(row,bytes){if(objects.has(row.id))throw Error('Synthetic overwrite refused');objects.set(row.id,Buffer.from(bytes));if(storageMode==='corrupt'){storageMode='normal';corrupt.add(row.id);}if(storageMode==='hold'){storageMode='normal';held=true;await new Promise(done=>{releaseHold=done;});held=false;}},
  async read(row){if(!objects.has(row.id))throw Error('Unavailable');const bytes=Buffer.from(objects.get(row.id));if(corrupt.has(row.id))bytes[44]^=1;return bytes;},async remove(row){objects.delete(row.id);},async exists(row){return objects.has(row.id);}};
const password='Synthetic staff audio '+randomUUID();await provisionStaffCredential(pool,{staffId:'owner',orgId:'qa',siteId:'qa',email:'owner@qa.example.test',password},{schema});
let fault='none',microphone='normal',stopping=false,holdList=false,listHeld=false,releaseList=null;const counters={audioPosts:0,receiptReads:0,listReads:0,listPages:[],noticeReads:0,playbackReads:0,otherPosts:0,simulatedMicrophoneRequests:0,seededRecordings:0};
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
const mockScript=`'use strict';
// Test-only fixed tone source. No real media API is invoked.
const tone=Uint8Array.from(atob(${JSON.stringify(wav.toString('base64'))}),c=>c.charCodeAt(0));
let nextMode='normal';
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{async getUserMedia(){const response=await fetch('/api/qa-staff-mic',{cache:'no-store'});nextMode=(await response.json()).mode;if(nextMode==='denied')throw new DOMException('Synthetic permission denial','NotAllowedError');const track={onended:null,stop(){clearTimeout(this.timer);}};const stream={getTracks:()=>[track]};if(nextMode==='interrupted')track.timer=setTimeout(()=>track.onended?.(),600);return stream;}}});
window.MediaRecorder=class {static isTypeSupported(){return false;}constructor(stream){this.stream=stream;this.state='inactive';this.mimeType='audio/wav';}start(){this.mode=nextMode;this.state='recording';}stop(){if(this.state==='inactive')return;this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(this.mode==='empty'?[]:[tone],{type:'audio/wav'})});this.onstop?.();});}};
addEventListener('DOMContentLoaded',()=>{const banner=document.createElement('p');banner.textContent='Synthetic microphone simulator: fixed tone only. No real microphone.';banner.style.cssText='margin:0;padding:6px 12px;background:#fff1cc;color:#322800;font:13px Arial;';document.body.prepend(banner);});`;
const baseBuild=await loadPublicBuild(build),html=(await readFile(join(build,'index.html'),'utf8')).replace('<head>','<head><script src="/qa-staff-microphone.js"></script>');
const publicBuild=(req,res,url)=>{
  if(url.pathname==='/qa-staff-microphone.js'){res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});res.end(mockScript);return;}
  if(url.pathname==='/'||url.pathname==='/index.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'",'permissions-policy':'microphone=(), camera=(), geolocation=()'});res.end(html);return;}
  return baseBuild(req,res,url);
};
const server=createPostgresRehearsalServer(pool,{schema,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin,mail:{mode:'disabled'},storage,publicBuild,caseFollowupAdapter});
const handler=server.listeners('request')[0];server.removeAllListeners('request');
async function state(){const client=await pool.connect();try{const rows=(await client.query('SELECT * FROM attempts ORDER BY id')).rows;return {...counters,externalCalls:0,actualMicrophoneUsed:false,held,listHeld,objects:objects.size,originalAttemptUnchanged:fingerprint(rows)===originalHash,
  attempts:rows.length,submissionReceipts:Number((await client.query('SELECT count(*) n FROM submission_receipts')).rows[0].n),caseMessages:Number((await client.query('SELECT count(*) n FROM case_messages')).rows[0].n),
  caseStatus:(await client.query('SELECT status FROM clarifications WHERE id=$1',[caseId])).rows[0].status,language,followupMode,followups:(await client.query('SELECT id,status,language FROM case_followups ORDER BY created_at,id')).rows,recordings:(await client.query('SELECT request_id,actor_id,actor_role,language,status,received_at FROM case_voice ORDER BY created_at,request_id')).rows};}finally{client.release();}}
server.on('request',(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/qa-staff')){
    (async()=>{requireLocalRequest(req);if(req.method!=='GET')return json(res,405,{error:'Fixture GET only'});
      if(url.pathname==='/api/qa-staff-state')return json(res,200,await state());
      if(url.pathname==='/api/qa-staff-stop'){json(res,200,{stopping:true});setImmediate(stop);return;}
      if(url.pathname==='/api/qa-staff-mic'){counters.simulatedMicrophoneRequests++;return json(res,200,{mode:microphone});}
      if(url.pathname==='/api/qa-staff-control'){
        const mode=url.searchParams.get('mode');
        if(['normal','denied','empty','interrupted'].includes(mode)){microphone=mode;return json(res,200,{microphone});}
        if(mode==='hold-storage'||mode==='corrupt-storage'){storageMode=mode==='hold-storage'?'hold':'corrupt';return json(res,200,{storageMode});}
        if(mode==='release-storage'){releaseHold?.();releaseHold=null;return json(res,200,{released:true});}
        if(mode==='hold-list-once'){holdList=true;return json(res,200,{holdList:true});}
        if(mode==='release-list'){releaseList?.();releaseList=null;return json(res,200,{released:true});}
        if(mode==='seed-history'){for(let n=0;n<12;n++){await receiveStaffCaseRecording(pool,owner,caseId,randomUUID(),n%2?'en':'ur',wav,storage,{schema});counters.seededRecordings++;}return json(res,200,{seeded:counters.seededRecordings});}
        if(!['none','invalid-upload-once','context-upload-once','fail-list-once','invalid-list-once','context-list-once','fail-receipt-once'].includes(mode))return json(res,400,{error:'Unknown fixed control'});fault=mode;return json(res,200,{fault});
      }
      if(url.pathname!=='/api/qa-staff')return json(res,404,{error:'Fixture unavailable'});
      const {session}=await authenticateStaff(pool,'owner@qa.example.test',password,'127.0.0.1',{schema});res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),'cache-control':'no-store',location:'/#clarifications/'+caseId});res.end();
    })().catch(()=>json(res,503,{error:'Synthetic fixture unavailable'}));return;
  }
  const route=url.pathname.match(/^\/api\/clarifications\/[^/]+\/in-person-recordings(?:\/([^/]+)(?:\/(audio))?)?$/),list=!!route&&!route[1]&&req.method==='GET',receipt=!!route&&!!route[1]&&!route[2]&&req.method==='GET',upload=!!route&&!!route[1]&&!route[2]&&req.method==='POST';
  if(list){counters.listReads++;counters.listPages.push(url.searchParams.get('page'));}if(receipt)counters.receiptReads++;if(upload)counters.audioPosts++;else if(req.method==='POST')counters.otherPosts++;if(route?.[2])counters.playbackReads++;if(url.pathname==='/api/privacy/recording-notice')counters.noticeReads++;
  if(list&&holdList){holdList=false;listHeld=true;void new Promise(done=>{releaseList=done;}).then(()=>{listHeld=false;handler(req,res);});return;}
  if(list&&fault==='fail-list-once'||receipt&&fault==='fail-receipt-once'){fault='none';return json(res,503,{error:'PRIVATE_SYNTHETIC_DIAGNOSTIC'});}
  if(list&&['invalid-list-once','context-list-once'].includes(fault)||upload&&['invalid-upload-once','context-upload-once'].includes(fault)){
    const mode=fault;fault='none';const end=res.end.bind(res);res.end=(body,...args)=>{if(res.statusCode===200){const value=JSON.parse(String(body));if(mode.startsWith('context'))value.clientContext='f'.repeat(64);else value.unexpected='PRIVATE_SYNTHETIC_DIAGNOSTIC';return end(JSON.stringify(value),...args);}return end(body,...args);};
  }
  handler(req,res);
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
async function stop(){if(stopping)return;stopping=true;releaseHold?.();releaseList?.();clearTimeout(timer);server.close(async()=>{console.log(JSON.stringify({terminal:true,...await state()}));await db.close();process.stdin.pause();});server.closeIdleConnections();}
const timer=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')void stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-staff-recording-with-fixed-microphone-simulator',url:origin+'/api/qa-staff',actualMicrophoneUsed:false,expiresInSeconds:1200}));
