import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest} from '../server/auth.mjs';
import {createAppServer} from '../server/index.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {changeTemplate,ensureTemplateSchema} from '../server/templates.mjs';
import {CANONICAL_SOURCE} from '../server/domain.mjs';

const port=Number(process.env.UNDERSTOOD_ARTIFACTS_FIXTURE_PORT ?? 3210),origin=`http://127.0.0.1:${port}`;
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
const db=openDatabase(':memory:');seed(db);ensureTemplateSchema(db);
db.prepare('INSERT INTO staff VALUES(?,?,?,?,?,1)').run('artifact-auditor','cedar','beirut','Synthetic auditor','auditor');
provisionStaffCredential(db,'maya','fixture@example.test','Disposable synthetic password only');
provisionStaffCredential(db,'artifact-auditor','auditor@fixture.example.test','Disposable synthetic auditor password only');
const templateId=randomUUID(),owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
changeTemplate(db,owner,'create',null,{requestId:templateId,confirmed:true,title:'Artifact QA template',description:'Synthetic only',source:CANONICAL_SOURCE,question:'',facts:[],askedFacts:[]});
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:origin,mail:{mode:'disabled'}});
const handler=api.listeners('request')[0],publicBuild=await loadPublicBuild('dist');
const fingerprint=()=>createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM publications ORDER BY id').all())).digest('hex');
const before=fingerprint(),faults={};
const ui=createServer((req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__qa/stop' && req.method==='POST'){requireLocalRequest(req);res.writeHead(200);res.end('Stopping disposable artifact fixture');setImmediate(stop);return;}
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET') {
    requireLocalRequest(req);const session=createSession(db,db.prepare('SELECT * FROM staff WHERE id=?').get(url.searchParams.get('auditor')==='1'?'artifact-auditor':'maya'),'staff','credential');
    res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds),location:'/#templates','cache-control':'no-store'});return res.end();
  }
  if(url.pathname==='/api/qa-close' && req.method==='GET') {
    requireLocalRequest(req);res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store','clear-site-data':'"cache", "cookies", "storage"','set-cookie':sessionCookie('',0)});return res.end('Disposable artifact QA closed.');
  }
  const mutation=url.pathname.match(/^\/api\/(templates|glossary)(?:\/[^/]+\/(edit|archive|remove|restore|duplicate|use|regenerate))?$/);
  const receipt=url.pathname.match(/^\/api\/(templates|glossary)\/receipts\/([^/]+)$/);
  const fail=(status,message)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:message}));};
  if(receipt && req.method==='GET') {
    const state=Object.values(faults).find(value=>value.requestId===receipt[2]);
    if(state?.stage===1){state.stage=2;return fail(503,'Synthetic receipt unavailable. Original intent remains saved.');}
    if(state?.stage===2 && state.kind==='edit'){state.stage=3;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end('{"found":false}');}
  }
  if(mutation && req.method==='POST') {
    const family=mutation[1],kind=mutation[2] || 'create',key=`${family}:${kind}`,state=faults[key]??={family,kind,posts:0,stage:0,requestId:null,rejected:0};state.posts++;
    if(kind==='edit' && state.posts===2){state.rejected++;return fail(403,'Synthetic later rejection; earlier request must remain saved.');}
    if(state.posts===1) {
      const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===200 || status===201;return writeHead(committed?503:status,...args);};
      res.end=(body,...args)=>{
        if(committed){const table=family==='templates'?'template_requests':'glossary_requests';state.requestId=db.prepare(`SELECT request_id FROM ${table} ORDER BY rowid DESC LIMIT 1`).get().request_id;state.stage=1;}
        return end(committed?JSON.stringify({error:'Synthetic acknowledgement interrupted after commit.'}):body,...args);
      };
    }
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  return publicBuild(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);ui.close(()=>{
  console.log(JSON.stringify({terminal:true,faults,publicationsUnchanged:fingerprint()===before,
    templateReceipts:db.prepare('SELECT count(*) n FROM template_requests').get().n,glossaryReceipts:db.prepare('SELECT count(*) n FROM glossary_requests').get().n,
    templates:db.prepare('SELECT revision,status FROM templates ORDER BY id').all(),terms:db.prepare('SELECT revision,status FROM glossary_terms ORDER BY id').all(),
    freshDrafts:db.prepare('SELECT id,state,revision,prepared_json FROM briefings WHERE id IN (SELECT briefing_id FROM template_requests WHERE briefing_id IS NOT NULL)').all(),externalRequests:0}));
  db.close();process.stdin.pause();
});ui.closeIdleConnections();}
const timeout=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(`Built memory-only artifact QA: ${origin}/api/qa-bootstrap. All eleven first acknowledgements withheld after commit; first receipt reads fail; edit retries reject once. Seed template ${templateId}. Send stop for local evidence and shutdown.`);
