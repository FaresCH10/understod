import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {createDraft,queuePreparation,editDraft} from '../server/preparation.mjs';
import {createAppServer} from '../server/index.mjs';
import {createSession,sessionCookie,requireLocalRequest,provisionStaffCredential} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {CANONICAL_SOURCE,submitAnswer} from '../server/domain.mjs';
import {receiveSourceAudio} from '../server/source-audio.mjs';
import {receiveRecording} from '../server/recordings.mjs';
import {encodeWav} from '../src/audio.ts';
const port=Number(process.env.UNDERSTOOD_PROCESSING_KINDS_FIXTURE_PORT ?? 3235),origin=`http://127.0.0.1:${port}`;
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
const db=openDatabase(':memory:');seed(db);
provisionStaffCredential(db,'maya','maya@queue.example.test','Disposable synthetic queue fixture password');
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'},worker=id=>({...owner,principal_type:'worker',principal_id:id});
const objects=new Map(),storage={async save(row,bytes){objects.set(row.id,Buffer.from(bytes));},async read(row){return objects.get(row.id);},async saveOriginal(row,bytes){objects.set(row.id,Buffer.from(bytes));},async readOriginal(row){return objects.get(row.id);},async remove(row){objects.delete(row.id);}};
const bytes=Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>Float32Array.from({length:16000},(_,index)=>Math.sin(index/10)*0.2)}));
const draft=createDraft(db,owner,{requestId:randomUUID(),title:'Synthetic pending preparation',source:CANONICAL_SOURCE});queuePreparation(db,owner,draft.id,1);
const source=await receiveSourceAudio(db,owner,{requestId:randomUUID(),title:'Synthetic source transcription',originalType:'audio/wav'},bytes,bytes,storage);
db.prepare("UPDATE source_audio_requests SET status='blocked',attempts=1,error='Private provider detail' WHERE request_id=?").run(source.requestId);
const assignment=db.prepare("SELECT id FROM assignments WHERE worker_id='worker-1'").get();
const voiceAssignment=db.prepare("SELECT id FROM assignments WHERE worker_id='worker-30'").get();
await receiveRecording(db,worker('worker-30'),voiceAssignment.id,randomUUID(),bytes,storage);
submitAnswer(db,worker('worker-1'),assignment.id,randomUUID(),'Finished items go on the blue shelf; unfinished items go on the yellow shelf.');
editDraft(db,owner,'shelf',{revision:1,title:'Unpublished replacement title',source:CANONICAL_SOURCE});
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:origin,audioRoot:storage,mail:{mode:'disabled'}});
const handler=api.listeners('request')[0],build=await loadPublicBuild('dist');
const tables=['organizations','sites','workers','publications','assignments','attempts','clarifications'],hash=table=>createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).digest('hex');
const before=Object.fromEntries(tables.map(table=>[table,hash(table)]));let reads=0,retries=0;
const ui=createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__qa/stop' && req.method==='POST'){requireLocalRequest(req);res.writeHead(200);res.end('Stopping disposable fixture');setImmediate(stop);return;}
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET'){
    requireLocalRequest(req);const session=createSession(db,db.prepare("SELECT * FROM staff WHERE id='maya'").get(),'staff','credential');
    res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds),location:'/#processing'});return res.end();
  }
  if(url.pathname.startsWith('/api/processing') && req.method==='GET')reads++;
  if(/^\/api\/source-audio\/[^/]+\/retries$/.test(url.pathname) && req.method==='POST')retries++;
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  return build(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);ui.close(()=>{
  console.log(JSON.stringify({terminal:true,reads,retries,protectedTables:tables.map(table=>({table,unchanged:before[table]===hash(table)})),externalCalls:0}));db.close();process.stdin.pause();
});ui.closeIdleConnections();}
const timeout=setTimeout(stop,15*60_000);process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-processing-kinds',url:`${origin}/api/qa-bootstrap`,sourceId:source.requestId,assignmentId:assignment.id,expiresInSeconds:900}));
