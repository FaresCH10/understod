import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {provisionStaffCredential,authenticateStaff} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {syntheticPrepare,CANONICAL_SOURCE} from '../server/domain.mjs';
import {submitAnswer} from '../server/postgres/domain.mjs';
import {processOneAssessment} from '../server/postgres/assessment-worker.mjs';
import {requestHelp,assignClarification,getClarification} from '../server/postgres/clarifications.mjs';
import {requestCaseRepeat} from '../server/postgres/case-repeats.mjs';
import {saveCaseReview} from '../server/postgres/case-reviews.mjs';

const port=Number(process.env.UNDERSTOOD_CLARIFICATION_FIXTURE_PORT??3222),schema='understood_test_clarification_browser';
if(!Number.isInteger(port)||port<1024||port>65535||[3020,3021].includes(port))throw Error('Use an isolated fixture port');
const origin=`http://127.0.0.1:${port}`,db=new PGlite(),owner={principal_type:'staff',principal_id:'owner',org_id:'qa',site_id:'qa',role:'owner'};
const workflow=process.env.UNDERSTOOD_CASE_WORKFLOW_FIXTURE==='true',timezone=process.env.UNDERSTOOD_CASE_WORKFLOW_TIMEZONE??'Asia/Beirut';
const creation=process.env.UNDERSTOOD_CLARIFICATION_CREATION_FIXTURE==='true';
if(!['Asia/Beirut','America/New_York'].includes(timezone))throw Error('Use a fixed synthetic QA timezone');
let primaryCaseId='20000000-0000-4000-8000-000000000001',originalAttemptId=null,originalAttemptHash=null;
let queue=Promise.resolve();const pool={async connect(){const previous=queue;let release;queue=new Promise(done=>{release=done;});await previous;return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release};}};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec(`INSERT INTO organizations VALUES('qa','Synthetic Clarification QA');INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner'),('other','qa','qa','Synthetic Supervisor','supervisor');
  INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker1','qa','qa','Worker 014','en'),('worker2','qa','qa','Worker 021','ar');`);
await db.query('UPDATE sites SET timezone=$1 WHERE id=\'qa\'',[timezone]);
for(let n=1;n<=2;n++){
  const snapshot=syntheticPrepare(CANONICAL_SOURCE);snapshot.title='Synthetic shelf handover '+n;
  await db.query("INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES($1,'qa','qa',$2,$3,'ready')",['brief'+n,snapshot.title,CANONICAL_SOURCE]);
  await db.query("INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES($1,'qa','qa',$2,3,$3,'published')",['publication'+n,'brief'+n,JSON.stringify(snapshot)]);
  await db.query("INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES($1,'qa','qa',$2,$3,'en')",['assignment'+n,'publication'+n,'worker'+n]);
  if(workflow&&n===1){
    const worker={principal_type:'worker',principal_id:'worker1',org_id:'qa',site_id:'qa'};
    const attempt=await submitAnswer(pool,worker,'assignment1',randomUUID(),'Finished items go on the blue shelf.',{schema});originalAttemptId=attempt.id;
    await processOneAssessment(pool,{assess:async()=>({outcome:'clarification',reasons:['missing_asked_fact'],evidence:[{factIndex:0,quote:'Finished items go on the blue shelf.'}]})},{schema});
    primaryCaseId=(await db.query('SELECT id FROM clarifications WHERE attempt_id=$1',[originalAttemptId])).rows[0].id;
    originalAttemptHash=createHash('sha256').update(JSON.stringify((await db.query('SELECT * FROM attempts WHERE id=$1',[originalAttemptId])).rows[0])).digest('hex');
    for(let index=1;index<=12;index++)await saveCaseReview(pool,owner,primaryCaseId,{requestId:randomUUID(),kind:'disagree',reason:'Synthetic seeded private review '+index},{schema});
    for(let index=1;index<=13;index++){
      await requestCaseRepeat(pool,owner,primaryCaseId,{requestId:randomUUID(),dueAt:new Date(Date.now()+3600000).toISOString()},{schema});
      await submitAnswer(pool,worker,'assignment1',randomUUID(),'Synthetic deliberate repeat '+index,{schema});
    }
  }else if(creation&&n===2){
    await submitAnswer(pool,{principal_type:'worker',principal_id:'worker2',org_id:'qa',site_id:'qa'},'assignment2',randomUUID(),CANONICAL_SOURCE,{schema});
    await processOneAssessment(pool,{assess:async(answer,_question,askedFacts)=>({outcome:'matched',reasons:['asked_facts_present'],evidence:askedFacts.map((_,factIndex)=>({factIndex,quote:answer}))})},{schema});
    if((await db.query("SELECT assessment_status,outcome FROM attempts WHERE assignment_id='assignment2'")).rows[0]?.outcome!=='matched')throw Error('Synthetic creation assessment did not complete');
  }else await requestHelp(pool,{principal_type:'worker',principal_id:'worker'+n,org_id:'qa',site_id:'qa'},'assignment'+n,{requestId:`20000000-0000-4000-8000-00000000000${n}`,text:'Synthetic help: please clarify the unfinished shelf.'},{schema});
}
const password='Synthetic clarification QA '+randomUUID();await provisionStaffCredential(pool,{staffId:'owner',orgId:'qa',siteId:'qa',email:'owner@qa.example.test',password},{schema});
const creationAttemptHash=creation?createHash('sha256').update(JSON.stringify((await db.query('SELECT * FROM attempts ORDER BY id')).rows)).digest('hex'):null;
const server=createPostgresRehearsalServer(pool,{schema,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin,mail:{mode:'disabled'},publicBuild:await loadPublicBuild(process.env.UNDERSTOOD_CLARIFICATION_BUILD??'.tools/clarification-preview/dist')});
const handler=server.listeners('request')[0];server.removeAllListeners('request');
let fault='none',stopping=false;const counters={listReads:0,detailReads:0,timelineReads:0,actionPosts:0,receiptReads:0,otherPosts:0,fixtureOwnerChanges:0,repeatPosts:0,reviewPosts:0,workflowReads:0,workflowReceipts:0,fixtureRepeatChanges:0,fixtureReviewChanges:0,fixtureAnswers:0,creationPosts:0,creationReceipts:0,creationSubjectReads:0};
const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
async function state(){const result={...counters,externalCalls:0};for(const table of ['clarification_action_receipts','clarification_creations','clarifications','help_requests','attempts','case_messages','case_reviews','case_repeats','submission_receipts'])result[table]=Number((await db.query('SELECT count(*) n FROM '+table)).rows[0].n);
  if(creation)result.creationAttemptsUnchanged=createHash('sha256').update(JSON.stringify((await db.query('SELECT * FROM attempts ORDER BY id')).rows)).digest('hex')===creationAttemptHash;
  if(workflow){result.originalAttemptUnchanged=createHash('sha256').update(JSON.stringify((await db.query('SELECT * FROM attempts WHERE id=$1',[originalAttemptId])).rows[0])).digest('hex')===originalAttemptHash;
    result.latestDeadline=(await db.query("SELECT due_at FROM case_reviews WHERE case_id=$1 AND kind='deadline' ORDER BY sequence DESC LIMIT 1",[primaryCaseId])).rows[0]?.due_at??null;}return result;}
server.on('request',(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/qa-clarifications')){
    (async()=>{
      requireLocalRequest(req);if(req.method!=='GET')return send(res,405,{error:'Fixture GET only'});
      if(url.pathname==='/api/qa-clarifications-state')return send(res,200,await state());
      if(url.pathname==='/api/qa-clarifications-stop'){send(res,200,{stopping:true});setImmediate(stop);return;}
      if(url.pathname==='/api/qa-clarifications-control'){
        const mode=url.searchParams.get('mode');
        if(mode==='change-owner'){await assignClarification(pool,owner,primaryCaseId,{ownerId:'other'},{schema});counters.fixtureOwnerChanges++;return send(res,200,{changed:true});}
        if(workflow&&mode==='change-deadline'){const current=await getClarification(pool,owner,primaryCaseId,{schema});await saveCaseReview(pool,owner,primaryCaseId,{requestId:randomUUID(),kind:'deadline',dueAt:new Date(Date.now()+2*86400000).toISOString(),expectedDueAt:current.case_due_at??current.due_at??null},{schema});counters.fixtureReviewChanges++;return send(res,200,{changed:true});}
        if(workflow&&mode==='compete-repeat'){await requestCaseRepeat(pool,{...owner,principal_id:'other',role:'supervisor'},primaryCaseId,{requestId:randomUUID(),dueAt:new Date(Date.now()+3600000).toISOString()},{schema});counters.fixtureRepeatChanges++;return send(res,200,{changed:true});}
        if(workflow&&mode==='submit-repeat'){await submitAnswer(pool,{principal_type:'worker',principal_id:'worker1',org_id:'qa',site_id:'qa'},'assignment1',randomUUID(),'Synthetic fixture-controlled deliberate answer',{schema});counters.fixtureAnswers++;return send(res,200,{submitted:true});}
        if(!['none','fail-detail-once','invalid-detail-once','hold-detail-once','context-detail-once','invalid-action-once','fail-action-before-once','fail-timeline-once','invalid-timeline-once','context-timeline-once','hold-timeline-once',...(creation?['invalid-creation-once','fail-creation-before-once','fail-creation-subject-once','invalid-creation-subject-once','context-creation-subject-once','hold-creation-subject-once']:[]),...(workflow?['fail-workflow-once','invalid-workflow-once','context-workflow-once','hold-workflow-once']:[])].includes(mode))return send(res,400,{error:'Unknown fixed fixture control'});
        fault=mode;return send(res,200,{fault});
      }
      if(url.pathname!=='/api/qa-clarifications')return send(res,404,{error:'Fixture unavailable'});
      const {session}=await authenticateStaff(pool,'owner@qa.example.test',password,'127.0.0.1',{schema});
      res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),'cache-control':'no-store',location:workflow?'/#clarifications/'+primaryCaseId:'/#clarifications'});res.end();
    })().catch(()=>send(res,503,{error:'Synthetic fixture unavailable'}));return;
  }
  const detail=req.method==='GET'&&/^\/api\/clarifications\/[^/]+$/.test(url.pathname),coreAction=req.method==='POST'&&/^\/api\/clarifications\/[^/]+\/(assign|resolve)$/.test(url.pathname),reviewAction=req.method==='POST'&&/^\/api\/clarifications\/[^/]+\/reviews$/.test(url.pathname),repeatAction=req.method==='POST'&&/^\/api\/clarifications\/[^/]+\/repeats$/.test(url.pathname),action=coreAction||reviewAction||repeatAction;
  const workflowRead=req.method==='GET'&&/^\/api\/clarifications\/[^/]+\/(reviews|repeats)$/.test(url.pathname);
  const timelineRead=req.method==='GET'&&/^\/api\/clarifications\/[^/]+\/timeline$/.test(url.pathname);
  if(timelineRead)counters.timelineReads++;
  const creationPost=req.method==='POST'&&url.pathname==='/api/clarification-creations',creationSubject=req.method==='GET'&&/^\/api\/clarification-creations\/subjects\/[^/]+$/.test(url.pathname);
  if(creationPost)counters.creationPosts++;if(creationSubject)counters.creationSubjectReads++;
  if(req.method==='GET'&&/^\/api\/clarification-creations\/(?!subjects$)[^/]+$/.test(url.pathname))counters.creationReceipts++;
  if(workflowRead)counters.workflowReads++;if(req.method==='GET'&&/^\/api\/clarifications\/[^/]+\/(reviews|repeats)\/[^/]+$/.test(url.pathname))counters.workflowReceipts++;
  if(detail)counters.detailReads++;if(coreAction)counters.actionPosts++;else if(reviewAction)counters.reviewPosts++;else if(repeatAction)counters.repeatPosts++;else if(req.method==='POST')counters.otherPosts++;
  if(req.method==='GET'&&url.pathname==='/api/clarifications')counters.listReads++;
  if(req.method==='GET'&&/^\/api\/clarifications\/[^/]+\/actions\/[^/]+$/.test(url.pathname))counters.receiptReads++;
  if(detail&&fault==='fail-detail-once'){fault='none';return send(res,503,{error:'PRIVATE_FIXTURE_DETAIL_DIAGNOSTIC'});}
  if(timelineRead&&fault==='fail-timeline-once'){fault='none';return send(res,503,{error:'PRIVATE_TIMELINE_DIAGNOSTIC'});}
  if(timelineRead&&fault==='hold-timeline-once'){fault='none';setTimeout(()=>{if(!res.destroyed)handler(req,res);},8000);return;}
  if(action&&fault==='fail-action-before-once'){fault='none';return send(res,503,{error:'PRIVATE_FIXTURE_ACTION_DIAGNOSTIC'});}
  if(workflowRead&&fault==='fail-workflow-once'){fault='none';return send(res,503,{error:'PRIVATE_WORKFLOW_DIAGNOSTIC'});}
  if(workflowRead&&fault==='hold-workflow-once'){fault='none';setTimeout(()=>{if(!res.destroyed)handler(req,res);},8000);return;}
  if(detail&&fault==='hold-detail-once'){fault='none';setTimeout(()=>{if(!res.destroyed)handler(req,res);},8000);return;}
  if(creationPost&&fault==='fail-creation-before-once'||creationSubject&&fault==='fail-creation-subject-once'){fault='none';return send(res,503,{error:'PRIVATE_CREATION_DIAGNOSTIC'});}
  if(creationSubject&&fault==='hold-creation-subject-once'){fault='none';setTimeout(()=>{if(!res.destroyed)handler(req,res);},8000);return;}
  if(detail&&['invalid-detail-once','context-detail-once'].includes(fault)||timelineRead&&['invalid-timeline-once','context-timeline-once'].includes(fault)||action&&fault==='invalid-action-once'||workflowRead&&['invalid-workflow-once','context-workflow-once'].includes(fault)||creationPost&&fault==='invalid-creation-once'||creationSubject&&['invalid-creation-subject-once','context-creation-subject-once'].includes(fault)){
    const mode=fault;fault='none';const end=res.end.bind(res);res.end=(body,...args)=>{
      if(res.statusCode===200){const value=JSON.parse(String(body));if(mode==='context-detail-once'||mode==='context-workflow-once'||mode==='context-creation-subject-once'||mode==='context-timeline-once')value.clientContext='f'.repeat(64);else value.unexpected='PRIVATE_FIXTURE_DIAGNOSTIC';return end(JSON.stringify(value),...args);}return end(body,...args);
    };
  }
  handler(req,res);
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
async function stop(){if(stopping)return;stopping=true;clearTimeout(timer);server.close(async()=>{console.log(JSON.stringify({terminal:true,...await state()}));await db.close();process.stdin.pause();});server.closeIdleConnections();}
const timer=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')void stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'memory-only-synthetic-clarifications',url:origin+'/api/qa-clarifications',expiresInSeconds:1200}));
