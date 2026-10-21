import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest} from '../server/auth.mjs';
import {createAppServer} from '../server/index.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {requestExport,processOneExport} from '../server/exports.mjs';
import {ensurePeopleSchema} from '../server/people.mjs';
import {captureReportAudience} from '../server/report-scope.mjs';

const port=Number(process.env.UNDERSTOOD_REPORT_REQUEST_FIXTURE_PORT ?? 3211),host=process.env.UNDERSTOOD_REPORT_REQUEST_FIXTURE_HOST??'127.0.0.1',origin=`http://${host}:${port}`;
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
if(!['127.0.0.1','localhost'].includes(host))throw Error('Use a local fixture origin');
const db=openDatabase(':memory:');seed(db);
const localeStates=process.env.UNDERSTOOD_REPORT_REQUEST_FIXTURE_LOCALE_STATES==='1';
if(localeStates){
  ensurePeopleSchema(db);
  db.prepare("INSERT INTO crews(id,org_id,site_id,name,active) VALUES('morning','cedar','beirut','Morning crew · الفريق الصباحي · صبح کی ٹیم',1)").run();
  for(let n=1;n<=12;n++)db.prepare("INSERT INTO crew_memberships(worker_id,org_id,site_id,crew_id,joined_at) VALUES(?,'cedar','beirut','morning',?)").run(`worker-${n}`,new Date().toISOString());
  captureReportAudience(db,'shelf-v3');
  const snapshot=db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json;
  for(let n=0;n<22;n++){const value=JSON.parse(snapshot);value.title=`Synthetic historical ${n+1} · العربية · اردو`;
    db.prepare("INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,published_at,state) VALUES(?,'cedar','beirut','shelf',?,?,?,'superseded')").run(`locale-history-${n+1}`,n+4,JSON.stringify(value),new Date(Date.now()-(n+1)*86400000).toISOString());}
}
db.prepare('INSERT INTO staff VALUES(?,?,?,?,?,1)').run('report-auditor','cedar','beirut','Synthetic auditor','auditor');
provisionStaffCredential(db,'maya','fixture@example.test','Disposable synthetic password only');
provisionStaffCredential(db,'report-auditor','auditor@fixture.example.test','Disposable synthetic auditor password only');
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
const failed=requestExport(db,owner,{requestId:randomUUID(),publicationId:'shelf-v3'});
db.prepare("UPDATE report_exports SET status='failed',attempts=1,error='Synthetic failure for retry QA' WHERE id=?").run(failed.id);
let seededReady=null;
if(localeStates){
  seededReady=requestExport(db,owner,{requestId:randomUUID(),publicationId:'shelf-v3'});processOneExport(db);
  requestExport(db,owner,{requestId:randomUUID(),publicationId:'shelf-v3'});
  const processing=requestExport(db,owner,{requestId:randomUUID(),publicationId:'shelf-v3'});
  db.prepare("UPDATE report_exports SET status='processing',attempts=1,lease_token='synthetic-held-lease',lease_until=? WHERE id=?").run(new Date(Date.now()+3600000).toISOString(),processing.id);
  const source=db.prepare('SELECT * FROM report_exports WHERE id=?').get(seededReady.id);
  db.prepare("INSERT INTO report_exports(id,org_id,site_id,publication_id,requested_by,created_at,expires_at,status,snapshot_json,filters_json) VALUES(?,'cedar','beirut','shelf-v3','maya',?,?,'queued',?,?)").run(randomUUID(),new Date(Date.now()-172800000).toISOString(),new Date(Date.now()-86400000).toISOString(),source.snapshot_json,source.filters_json);
}
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:origin,mail:{mode:'disabled'}});
const handler=api.listeners('request')[0],publicBuild=await loadPublicBuild(process.env.UNDERSTOOD_REPORT_REQUEST_FIXTURE_BUILD??'dist');
const fingerprint=()=>createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM publications ORDER BY id').all())).digest('hex'),before=fingerprint();
const faults={create:{posts:0,stage:0,rejected:0},retry:{posts:0,stage:0,rejected:0}};
const reportReads=[],publicationReads=[],commands=[],downloads=[];let readFault='none',releaseRead=null,readHeld=false;
const attemptsBefore=createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM attempts ORDER BY id').all())).digest('hex');
function state(){return {faults,reportReads,publicationReads,commands,downloads,readHeld,seededReady:seededReady?.id??null,publicationsUnchanged:fingerprint()===before,
  attemptsUnchanged:createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM attempts ORDER BY id').all())).digest('hex')===attemptsBefore,
  exports:db.prepare('SELECT id,requested_by,status,attempts,filters_json,checksum FROM report_exports ORDER BY id').all(),retryReceipts:db.prepare('SELECT request_id,export_id,attempts,requested_by FROM report_export_retries ORDER BY request_id').all(),externalRequests:0};}
const ui=createServer((req,res)=>{
  const url=new URL(req.url,origin);
  const json=value=>{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  if(['/api/qa-state','/api/qa-stop','/api/qa-control'].includes(url.pathname)){
    requireLocalRequest(req);if(req.method!=='GET'){res.writeHead(405);return res.end();}
    if(url.pathname==='/api/qa-state')return json(state());
    if(url.pathname==='/api/qa-stop'){json({stopping:true});setImmediate(stop);return;}
    const mode=url.searchParams.get('mode');
    if(mode==='release-read'){releaseRead?.();releaseRead=null;return json({released:true});}
    if(mode==='drain-exports'){let count=0;while(count<10&&processOneExport(db))count++;return json({processed:count});}
    if(!['none','fail-report-once','fail-exports-once','fail-publications-once','hold-report-once','hold-exports-once','hold-publications-once'].includes(mode)){res.writeHead(400);return res.end();}
    readFault=mode;return json({readFault});
  }
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET') {
    requireLocalRequest(req);const session=createSession(db,db.prepare('SELECT * FROM staff WHERE id=?').get(url.searchParams.get('auditor')==='1'?'report-auditor':'maya'),'staff','credential');
    res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds),location:'/#reports','cache-control':'no-store'});return res.end();
  }
  const receipt=url.pathname.match(/^\/api\/reports\/exports\/receipts\/(create|retry)\/[^/]+$/);
  const mutation=url.pathname==='/api/reports/exports'?'create':/^\/api\/reports\/exports\/[^/]+\/retry$/.test(url.pathname)?'retry':null;
  const reject=(status,message)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:message}));};
  const reading=req.method==='GET'&&(url.pathname==='/api/reports'?'report':url.pathname==='/api/reports/exports'?'exports':url.pathname==='/api/reports/publications'?'publications':null);
  if(reading==='report')reportReads.push(Object.fromEntries(url.searchParams));if(reading==='publications')publicationReads.push(Object.fromEntries(url.searchParams));
  if(reading&&readFault===`fail-${reading}-once`){readFault='none';return reject(503,'PRIVATE_SYNTHETIC_REPORT_DIAGNOSTIC');}
  if(reading&&readFault===`hold-${reading}-once`){readFault='none';readHeld=true;new Promise(done=>{releaseRead=done;}).then(()=>{readHeld=false;if(!res.destroyed)handler(req,res);});return;}
  if(req.method==='GET'&&/^\/api\/reports\/exports\/[^/]+\/download$/.test(url.pathname)){
    const end=res.end.bind(res);res.end=(body,...args)=>{const bytes=Buffer.from(body??'');downloads.push({id:url.pathname.split('/')[4],status:res.statusCode,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});return end(body,...args);};
  }
  if(receipt && req.method==='GET') {
    const state=faults[receipt[1]];
    if(state.stage===1){state.stage=2;return reject(503,'Synthetic export receipt unavailable.');}
    if(state.stage===2){state.stage=3;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end('{"found":false}');}
  }
  if(mutation && req.method==='POST') {
    // Observe parser pushes without putting the request into flowing mode before the API reads it.
    const push=req.push.bind(req),chunks=[];let bytes=0;
    req.push=(chunk,encoding)=>{if(chunk===null){try{if(bytes>4096)throw Error('Fixture body limit');commands.push({kind:mutation,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch{commands.push({kind:mutation,invalid:true});}}
      else{const value=Buffer.from(chunk);bytes+=value.length;if(bytes<=4096)chunks.push(value);}return push(chunk,encoding);};
    const state=faults[mutation];state.posts++;
    if(state.posts===2){state.rejected++;return reject(403,'Synthetic later rejection. Original export intent must remain saved.');}
    if(state.posts===1){
      const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===202;return writeHead(committed?503:status,...args);};
      res.end=(body,...args)=>{if(committed){state.stage=1;processOneExport(db);}return end(committed?JSON.stringify({error:'Synthetic export acknowledgement interrupted after commit.'}):body,...args);};
    }
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  return publicBuild(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;releaseRead?.();clearTimeout(timeout);ui.close(()=>{
  console.log(JSON.stringify({terminal:true,...state()}));db.close();process.stdin.pause();
});ui.closeIdleConnections();}
const timeout=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(`Built memory-only report recovery QA: ${origin}/api/qa-bootstrap. First create/retry acknowledgements withheld after commit; receipt outage/missing and one later rejected retry. Seed failed export ${failed.id}. Send stop for evidence and shutdown.`);
