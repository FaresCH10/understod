import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {issueWorkerGrant,redeemWorkerGrant} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../server/domain.mjs';
import {submitAnswer} from '../server/postgres/domain.mjs';
import {processOneAssessment} from '../server/postgres/assessment-worker.mjs';
import {sendCaseMessage} from '../server/postgres/case-messages.mjs';
import {resolveClarification} from '../server/postgres/clarifications.mjs';
import {saveRecordingNotice} from '../server/postgres/recording-notices.mjs';
import {encodeWav} from '../src/audio.ts';

const port=Number(process.env.UNDERSTOOD_WORKER_VOICE_QA_PORT??3238),build=resolve(process.env.UNDERSTOOD_WORKER_VOICE_QA_BUILD??'.tools/worker-voice-preview-20261021/dist');
if(!Number.isSafeInteger(port)||port<1024||port>65535||[3020,3021,3237].includes(port))throw Error('Use an isolated synthetic voice fixture port');
const sessionSeconds=process.env.UNDERSTOOD_WORKER_VOICE_QA_SESSION_SECONDS===undefined?null:Number(process.env.UNDERSTOOD_WORKER_VOICE_QA_SESSION_SECONDS);
if(sessionSeconds!==null&&(!Number.isSafeInteger(sessionSeconds)||sessionSeconds<15||sessionSeconds>120))throw Error('Use a short synthetic session duration');
const origin=`http://127.0.0.1:${port}`,schema='understood_test_worker_voice_browser',db=new PGlite();
let tail=Promise.resolve();const pool={async connect(){const previous=tail;let release;tail=new Promise(done=>{release=done;});await previous;return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release};}};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec(`INSERT INTO organizations VALUES('qa','Synthetic Worker Voice QA');INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Supervisor','owner');
  INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','qa','qa','Worker 014','en');`);
const owner={principal_type:'staff',principal_id:'owner',org_id:'qa',site_id:'qa',role:'owner'},worker={principal_type:'worker',principal_id:'worker',org_id:'qa',site_id:'qa'};
for(const id of ['answered','fresh']){
  const snapshot=syntheticPrepare(CANONICAL_SOURCE),title=id==='answered'?'Shelf handover with saved answer':'Arrival point without an answer';snapshot.title=title;for(const value of Object.values(snapshot.languages))value.title=title;
  await db.query("INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES($1,'qa','qa',$2,$3,'ready')",['brief-'+id,title,CANONICAL_SOURCE]);
  await db.query("INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES($1,'qa','qa',$2,3,$3,'published')",['publication-'+id,'brief-'+id,JSON.stringify(snapshot)]);
  await db.query("INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES($1,'qa','qa',$2,'worker','en')",[id,'publication-'+id]);
}
const original=await submitAnswer(pool,worker,'answered',randomUUID(),'Finished items go on the blue shelf.',{schema});
await processOneAssessment(pool,{assess:async()=>({outcome:'clarification',reasons:['missing_asked_fact'],evidence:[]})},{schema});
const caseId=(await db.query('SELECT id FROM clarifications WHERE attempt_id=$1',[original.id])).rows[0].id;
await sendCaseMessage(pool,owner,caseId,{requestId:randomUUID(),text:'Tell me where unfinished items should go. Your original answer stays saved.'},{schema});
await saveRecordingNotice(pool,owner,{requestId:randomUUID(),revision:0,confirmed:true,scope:JSON.stringify(['qa','qa','owner']),notices:{
  en:'Synthetic site notice: recordings are private. Contact your supervisor about access and retention.',
  ar:'إشعار الموقع التجريبي: التسجيلات خاصة. اسأل المشرف عن الوصول ومدة الاحتفاظ.',
  ur:'آزمائشی سائٹ کا نوٹس: ریکارڈنگ نجی ہے۔ رسائی اور رکھنے کی مدت کے لیے سپروائزر سے رابطہ کریں۔',
}},{schema});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),originalHash=hash((await db.query('SELECT * FROM attempts ORDER BY id')).rows);
const samples=new Float32Array(16000);for(let n=0;n<samples.length;n++)samples[n]=.1*Math.sin(n*2*Math.PI*220/16000);
const wav=Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>samples})),objects=new Map(),corrupt=new Set();
let storageMode='normal',microphone='normal',fault='none',held=false,releaseHold=null,stopping=false;
const counters={helpPosts:0,replyPosts:0,receiptReads:0,playbackReads:0,noticeReads:0,otherPosts:0,simulatedMicrophoneRequests:0,postRequestIds:[]};
const storage={async save(row,bytes){if(objects.has(row.id))throw Error('Synthetic overwrite refused');objects.set(row.id,Buffer.from(bytes));if(storageMode==='corrupt'){storageMode='normal';corrupt.add(row.id);}if(storageMode==='hold'){storageMode='normal';held=true;await new Promise(done=>{releaseHold=done;});held=false;}},
  async read(row){if(!objects.has(row.id))throw Error('Unavailable');const bytes=Buffer.from(objects.get(row.id));if(corrupt.has(row.id))bytes[44]^=1;return bytes;},async remove(row){objects.delete(row.id);},async exists(row){return objects.has(row.id);}};
const microphoneScript=`'use strict';
const tone=Uint8Array.from(atob(${JSON.stringify(wav.toString('base64'))}),c=>c.charCodeAt(0));let nextMode='normal';
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{async getUserMedia(){nextMode=(await(await fetch('/api/qa-worker-voice-mic',{cache:'no-store'})).json()).mode;if(nextMode==='denied')throw new DOMException('Synthetic denial','NotAllowedError');const track={onended:null,stop(){clearTimeout(this.timer);}};if(nextMode==='interrupted')track.timer=setTimeout(()=>track.onended?.(),600);return {getTracks:()=>[track]};}}});
window.MediaRecorder=class {static isTypeSupported(){return false;}constructor(stream){this.stream=stream;this.state='inactive';this.mimeType='audio/wav';}start(){this.mode=nextMode;this.state='recording';}stop(){if(this.state==='inactive')return;this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(this.mode==='empty'?[]:[tone],{type:'audio/wav'})});this.onstop?.();});}};
addEventListener('DOMContentLoaded',()=>{const p=document.createElement('p');p.textContent='Synthetic microphone simulator: fixed tone only. No real microphone.';p.style.cssText='margin:0;padding:6px 12px;background:#fff1cc;color:#322800;font:13px Arial';document.body.prepend(p);});`;
const baseBuild=await loadPublicBuild(build),html=(await readFile(join(build,'index.html'),'utf8')).replace('<head>','<head><script src="/qa-worker-microphone.js"></script>');
const publicBuild=(req,res,url)=>{
  if(url.pathname==='/qa-worker-microphone.js'){res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});res.end(microphoneScript);return;}
  if(url.pathname==='/'||url.pathname==='/index.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'",'permissions-policy':'microphone=(), camera=(), geolocation=()'});res.end(html);return;}
  return baseBuild(req,res,url);
};
const server=createPostgresRehearsalServer(pool,{schema,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin,mail:{mode:'disabled'},storage,publicBuild});
const handler=server.listeners('request')[0];server.removeAllListeners('request');
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
async function state(){const client=await pool.connect();try{return {...counters,actualMicrophoneUsed:false,externalCalls:0,held,objects:objects.size,
  originalAttemptUnchanged:hash((await client.query('SELECT * FROM attempts ORDER BY id')).rows)===originalHash,
  attempts:Number((await client.query('SELECT count(*) n FROM attempts')).rows[0].n),submissionReceipts:Number((await client.query('SELECT count(*) n FROM submission_receipts')).rows[0].n),
  cases:Number((await client.query('SELECT count(*) n FROM clarifications')).rows[0].n),messages:Number((await client.query('SELECT count(*) n FROM case_messages')).rows[0].n),
  recordings:(await client.query('SELECT request_id,kind,assignment_id,status,received_at FROM case_voice ORDER BY created_at,request_id')).rows,
  assignmentLanguages:(await client.query('SELECT id,language FROM assignments ORDER BY id')).rows,profileLanguage:(await client.query("SELECT language FROM workers WHERE id='worker'")).rows[0].language};}finally{client.release();}}
server.on('request',(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/qa-worker-voice')){
    (async()=>{requireLocalRequest(req);if(req.method!=='GET')return json(res,405,{error:'Fixture GET only'});
      if(url.pathname==='/api/qa-worker-voice-state')return json(res,200,await state());
      if(url.pathname==='/api/qa-worker-voice-stop'){json(res,200,{stopping:true});setImmediate(stop);return;}
      if(url.pathname==='/api/qa-worker-voice-mic'){counters.simulatedMicrophoneRequests++;return json(res,200,{mode:microphone});}
      if(url.pathname==='/api/qa-worker-voice-control'){
        const mode=url.searchParams.get('mode');
        if(['normal','denied','empty','interrupted'].includes(mode)){microphone=mode;return json(res,200,{microphone});}
        if(mode==='hold-storage'||mode==='corrupt-storage'){storageMode=mode==='hold-storage'?'hold':'corrupt';return json(res,200,{storageMode});}
        if(mode==='release-storage'){releaseHold?.();releaseHold=null;return json(res,200,{released:true});}
        if(mode==='close-original-case'){await resolveClarification(pool,owner,caseId,{notes:'Synthetic closure; original evidence preserved.'},{schema});return json(res,200,{closed:true});}
        if(!['none','invalid-ack-once','lose-ack-once','context-ack-once','fail-receipt-once','fail-notice','invalid-notice','wrong-notice-language','context-notice'].includes(mode))return json(res,400,{error:'Unknown fixed control'});
        fault=mode;return json(res,200,{fault});
      }
      if(url.pathname!=='/api/qa-worker-voice')return json(res,404,{error:'Fixture unavailable'});
      const grant=await issueWorkerGrant(pool,owner,'worker',240,{schema}),session=await redeemWorkerGrant(pool,grant.token,{schema});
      if(sessionSeconds!==null){const row=(await db.query("UPDATE sessions SET expires_at=clock_timestamp()+$1*interval '1 second' WHERE token_hash=$2 RETURNING expires_at",[sessionSeconds,createHash('sha256').update(session.token).digest('hex')])).rows[0];if(!row)throw Error('Synthetic session unavailable');session.expiresAt=row.expires_at.toISOString();session.maxSeconds=sessionSeconds;}
      res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),'cache-control':'no-store',location:'/#worker/answered'});res.end();
    })().catch(()=>json(res,503,{error:'Synthetic fixture unavailable'}));return;
  }
  const help=url.pathname.match(/^\/api\/worker\/briefings\/[^/]+\/help-audio\/([^/]+)$/),reply=url.pathname.match(/^\/api\/clarifications\/[^/]+\/voice\/([^/]+)$/),receipt=(help||reply)&&req.method==='GET',upload=(help||reply)&&req.method==='POST';
  const notice=url.pathname==='/api/privacy/recording-notice'&&req.method==='GET';
  if(upload){counters[help?'helpPosts':'replyPosts']++;counters.postRequestIds.push((help||reply)[1]);}else if(req.method==='POST')counters.otherPosts++;
  if(receipt)counters.receiptReads++;if(/\/messages\/[^/]+\/voice$/.test(url.pathname))counters.playbackReads++;if(notice)counters.noticeReads++;
  if(receipt&&fault==='fail-receipt-once'){fault='none';return json(res,503,{error:'PRIVATE_SYNTHETIC_DIAGNOSTIC'});}
  if(notice&&fault==='fail-notice')return json(res,503,{error:'PRIVATE_SYNTHETIC_DIAGNOSTIC'});
  if(notice&&fault==='context-notice')return json(res,409,{error:'Session context changed'});
  if(upload&&['invalid-ack-once','lose-ack-once','context-ack-once'].includes(fault)||notice&&['invalid-notice','wrong-notice-language'].includes(fault)){
    const mode=fault;if(upload)fault='none';const end=res.end.bind(res);res.end=(body,...args)=>{if(res.statusCode===200){const value=JSON.parse(String(body));
      if(mode==='lose-ack-once'){res.statusCode=503;return end(JSON.stringify({error:'PRIVATE_SYNTHETIC_DIAGNOSTIC'}),...args);}
      if(mode==='context-ack-once')value.clientContext='f'.repeat(64);else if(mode==='wrong-notice-language')value.language=value.language==='en'?'ar':'en';else value.unexpected='PRIVATE_SYNTHETIC_DIAGNOSTIC';
      return end(JSON.stringify(value),...args);}return end(body,...args);};
  }
  handler(req,res);
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
async function stop(){if(stopping)return;stopping=true;releaseHold?.();clearTimeout(timer);server.close(async()=>{console.log(JSON.stringify({terminal:true,...await state()}));await db.close();process.stdin.pause();});server.closeIdleConnections();}
const timer=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')void stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-worker-help-and-reply-with-fixed-tone',url:origin+'/api/qa-worker-voice',actualMicrophoneUsed:false,expiresInSeconds:1200}));
