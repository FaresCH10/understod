import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {issueWorkerGrant,redeemWorkerGrant} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../server/domain.mjs';
import {processOneAssessment} from '../server/postgres/assessment-worker.mjs';
import {syntheticAssessmentAdapter} from '../server/postgres/runtime.mjs';
import {requestHelp,resolveClarification} from '../server/postgres/clarifications.mjs';
import {sendCaseMessage} from '../server/postgres/case-messages.mjs';

const port=Number(process.env.UNDERSTOOD_NAVIGATION_FIXTURE_PORT??3215),schema='understood_test_worker_navigation',db=new PGlite();
if(!Number.isInteger(port)||port<1024||port>65535||[3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let release;queue=new Promise(done=>{release=done;});await previous;return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release};}};
const origin=`http://127.0.0.1:${port}`,owner={principal_type:'staff',principal_id:'owner',org_id:'qa',site_id:'qa',role:'owner'};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec(`INSERT INTO organizations VALUES('qa','Synthetic Navigation QA'),('foreign','Foreign synthetic organization');
  INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut'),('foreign','foreign','Foreign QA','UTC');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner');
  INSERT INTO workers(id,org_id,site_id,code,language,active) VALUES('worker','qa','qa','Worker 001','en',true),('other','qa','qa','Other worker','en',true),('foreign','foreign','foreign','Foreign worker','en',true);`);
for(let n=1;n<=10;n++){
  const foreign=n===10,org=foreign?'foreign':'qa',worker=n===9?'other':foreign?'foreign':'worker',title=n<=7?`Own current briefing ${n}`:n===8?'Own withdrawn history':n===9?'OTHER WORKER PRIVATE TITLE':'FOREIGN PRIVATE TITLE';
  const content=syntheticPrepare(CANONICAL_SOURCE);content.title=title;for(const value of Object.values(content.languages))value.title=title;
  await db.query("INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES($1,$2,$2,$3,$4,'ready')",['brief'+n,org,title,CANONICAL_SOURCE]);
  await db.query("INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state,published_at) VALUES($1,$2,$2,$3,1,$4,$5,clock_timestamp()+$6::integer*interval '1 second')",['publication'+n,org,'brief'+n,JSON.stringify(content),n===8?'withdrawn':'published',n]);
  await db.query("INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES($1,$2,$2,$3,$4,'en')",['assignment'+n,org,'publication'+n,worker]);
}
if(process.env.UNDERSTOOD_SUBMISSION_FIXTURE==='true'){
  for(let n=0;n<9;n++){
    const id='history-'+n,kind=[3,4,5].includes(n)?'audio':'typed',outcome={0:'matched',1:'clarification',2:'unassessable',7:'matched'}[n]??null;
    if(kind==='typed')await db.query("INSERT INTO attempts(id,org_id,site_id,assignment_id,submission_id,answer_text,outcome,reasons_json,assessment_status) VALUES($1,'qa','qa','assignment7',$1,$2,$3,'[]',$4)",[id,'Synthetic own history answer '+n,outcome,outcome?'complete':'pending']);
    if([4,5].includes(n))await db.query("INSERT INTO recordings(id,org_id,site_id,assignment_id,submission_id,sha256,duration_seconds,bytes,status,received_at) VALUES($1,'qa','qa','assignment7',$2,$3,1,32044,$4,clock_timestamp())",['recording-'+n,id,'0'.repeat(64),n===4?'blocked':'failed']);
    await db.query("INSERT INTO submission_receipts(org_id,assignment_id,submission_id,kind,received_at) VALUES('qa','assignment7',$1,$2,clock_timestamp())",[id,kind]);
  }
}
if(process.env.UNDERSTOOD_HELP_HISTORY_FIXTURE==='true'){
  for(let n=1;n<=7;n++){
    const id=`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
    await requestHelp(pool,{principal_type:'worker',principal_id:'worker',org_id:'qa',site_id:'qa'},'assignment7',{requestId:id,text:`Synthetic own help ${n}: please clarify the second shelf.`},{schema});
    if(n===7)await resolveClarification(pool,owner,id,{notes:'PRIVATE_SYNTHETIC_SUPERVISOR_NOTES'},{schema});
  }
  for(const [id,principal,org] of [['assignment9','other','qa'],['assignment10','foreign','foreign']])
    await requestHelp(pool,{principal_type:'worker',principal_id:principal,org_id:org,site_id:org},id,{requestId:`00000000-0000-4000-8000-${org==='qa'?'000000000009':'000000000010'}`,text:'OTHER_WORKER_PRIVATE_HELP'},{schema});
}
if(process.env.UNDERSTOOD_CONVERSATION_FIXTURE==='true'){
  if(process.env.UNDERSTOOD_HELP_HISTORY_FIXTURE!=='true')throw Error('Conversation QA requires isolated help history');
  for(let n=1;n<=23;n++)await sendCaseMessage(pool,n%2?owner:{principal_type:'worker',principal_id:'worker',org_id:'qa',site_id:'qa'},'00000000-0000-4000-8000-000000000006',
    {requestId:`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,text:`Synthetic conversation message ${n}: رف أصفر · پیلا شیلف · Worker 014 ${n===23?'W'.repeat(180):'unfinished items go on the yellow shelf.'}`},{schema});
}
const voiceObjects=new Map(),voiceStorage=process.env.UNDERSTOOD_VOICE_FIXTURE==='true'?{
  async save(row,bytes){if(voiceObjects.has(row.id))throw Error('Synthetic object exists');voiceObjects.set(row.id,Buffer.from(bytes));},
  async read(row){if(!voiceObjects.has(row.id))throw Error('Synthetic object unavailable');return Buffer.from(voiceObjects.get(row.id));},
  async remove(row){voiceObjects.delete(row.id);},async exists(row){return voiceObjects.has(row.id);},
}:undefined;
const server=createPostgresRehearsalServer(pool,{schema,storage:voiceStorage,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin,publicBuild:await loadPublicBuild(process.env.UNDERSTOOD_NAVIGATION_BUILD??'dist')});
const handler=server.listeners('request')[0];server.removeAllListeners('request');
let fault='none',stopping=false,receiptReads=0,historyReads=0,helpHistoryReads=0,conversationReads=0,messagePosts=0,messageReceiptReads=0;const counters={answerPosts:0,helpPosts:0,otherPosts:0,listReads:0,detailReads:0};
const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
const state=async()=>({fixture:'memory-only-worker-navigation',counters,receiptReads,historyReads,helpHistoryReads,conversationReads,messagePosts,messageReceiptReads,voiceObjects:voiceObjects.size,messages:Number((await db.query('SELECT count(*) n FROM case_messages')).rows[0].n),attempts:Number((await db.query('SELECT count(*) n FROM attempts')).rows[0].n),cases:Number((await db.query('SELECT count(*) n FROM clarifications')).rows[0].n),externalCalls:0});
server.on('request',(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/qa-navigation')){
    (async()=>{
      requireLocalRequest(req);if(req.method!=='GET')return send(res,405,{error:'Fixture GET only'});
      if(url.pathname==='/api/qa-navigation-state')return send(res,200,await state());
      if(url.pathname==='/api/qa-navigation-stop'){send(res,200,{stopping:true});setImmediate(stop);return;}
      if(url.pathname==='/api/qa-navigation-control'){
        const value=url.searchParams.get('mode');
        if(value==='close-conversation'&&process.env.UNDERSTOOD_CONVERSATION_FIXTURE==='true'){
          await resolveClarification(pool,owner,'00000000-0000-4000-8000-000000000006',{notes:'Synthetic conversation closure QA'},{schema});return send(res,200,{closed:true});
        }
        if(value==='assess-one'&&process.env.UNDERSTOOD_RECEIPT_FIXTURE==='true')return send(res,200,{processed:await processOneAssessment(pool,syntheticAssessmentAdapter,{schema})});
        if(!['none','hold-list-once','fail-list-once','hold-detail-once','hold-history-once','fail-history-once','invalid-history-once','context-history-once','fail-receipt-once','hold-receipt-once','invalid-receipt-once','context-receipt-once','hold-help-history-once','fail-help-history-once','invalid-help-history-once','context-help-history-once',
          ...(process.env.UNDERSTOOD_CONVERSATION_FIXTURE==='true'?['fail-conversation-once','invalid-conversation-once','context-conversation-once','hold-conversation-once','lose-message-once','invalid-message-once']:[])].includes(value))return send(res,400,{error:'Invalid fixed fixture control'});
        fault=value;return send(res,200,{fault});
      }
      if(url.pathname!=='/api/qa-navigation')return send(res,404,{error:'Fixture unavailable'});
      const language=url.searchParams.get('language')??'en';if(!['en','ar','ur'].includes(language))return send(res,400,{error:'Invalid fixture language'});
      await db.query("UPDATE workers SET language=$1 WHERE id='worker'",[language]);
      const grant=await issueWorkerGrant(pool,owner,'worker',240,{schema}),session=await redeemWorkerGrant(pool,grant.token,{schema});
      res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:'/#inbox'});res.end();
    })().catch(()=>send(res,503,{error:'Synthetic fixture unavailable'}));return;
  }
  if(req.method==='POST'){
    if(/\/worker\/briefings\/[^/]+\/help$/.test(url.pathname))counters.helpPosts++;
    else if(/\/worker\/briefings\/[^/]+\/answers$/.test(url.pathname))counters.answerPosts++;
    else counters.otherPosts++;
  }
  const list=req.method==='GET'&&['/api/worker/briefings','/api/worker/history'].includes(url.pathname),detail=req.method==='GET'&&/^\/api\/worker\/briefings\/[^/]+$/.test(url.pathname);
  const history=req.method==='GET'&&/^\/api\/worker\/briefings\/[^/]+\/submissions$/.test(url.pathname);
  const exactReceipt=req.method==='GET'&&/^\/api\/worker\/briefings\/[^/]+\/submissions\/[^/]+$/.test(url.pathname);
  const helpHistory=req.method==='GET'&&/^\/api\/worker\/briefings\/[^/]+\/help-history$/.test(url.pathname);
  const conversation=req.method==='GET'&&/^\/api\/clarifications\/[^/]+\/messages$/.test(url.pathname);
  const messageReceipt=req.method==='GET'&&/^\/api\/clarifications\/[^/]+\/messages\/[^/]+$/.test(url.pathname);
  const messagePost=req.method==='POST'&&/^\/api\/clarifications\/[^/]+\/messages$/.test(url.pathname);
  if(conversation)conversationReads++;if(messageReceipt)messageReceiptReads++;if(messagePost)messagePosts++;
  if(conversation&&fault==='fail-conversation-once'){fault='none';send(res,503,{error:'PRIVATE_CONVERSATION_DIAGNOSTIC'});return;}
  if(conversation&&['invalid-conversation-once','context-conversation-once'].includes(fault)||messagePost&&['lose-message-once','invalid-message-once'].includes(fault)){
    const mode=fault;fault='none';const end=res.end.bind(res);res.end=(body,...args)=>{
      if(res.statusCode===200){
        const value=JSON.parse(String(body));
        if(mode==='lose-message-once'){res.statusCode=503;return end(JSON.stringify({error:'PRIVATE_LOST_MESSAGE_ACK'}),...args);}
        if(mode==='context-conversation-once')value.clientContext='f'.repeat(64);else value.unexpected='PRIVATE_CONVERSATION_DIAGNOSTIC';
        return end(JSON.stringify(value),...args);
      }return end(body,...args);
    };
  }
  if(helpHistory)helpHistoryReads++;
  if(helpHistory&&fault==='fail-help-history-once'){fault='none';send(res,503,{error:'PRIVATE_HELP_HISTORY_FIXTURE_MARKER'});return;}
  if(helpHistory&&['invalid-help-history-once','context-help-history-once'].includes(fault)){
    const mode=fault;fault='none';const end=res.end.bind(res);res.end=(body,...args)=>{
      if(res.statusCode===200){const value=JSON.parse(String(body));if(mode==='context-help-history-once')value.clientContext='f'.repeat(64);else value.unexpected='PRIVATE_HELP_HISTORY_FIXTURE_MARKER';return end(JSON.stringify(value),...args);}return end(body,...args);
    };
  }
  if(history)historyReads++;if(exactReceipt)receiptReads++;
  if(exactReceipt&&fault==='fail-receipt-once'){fault='none';send(res,503,{error:'PRIVATE_RECEIPT_FIXTURE_MARKER'});return;}
  if(exactReceipt&&['invalid-receipt-once','context-receipt-once'].includes(fault)){
    const mode=fault;fault='none';const end=res.end.bind(res);res.end=(body,...args)=>{
      if(res.statusCode===200){const value=JSON.parse(String(body));if(mode==='context-receipt-once')value.clientContext='f'.repeat(64);else value.unexpected='PRIVATE_RECEIPT_FIXTURE_MARKER';return end(JSON.stringify(value),...args);}return end(body,...args);
    };
  }
  if(history&&fault==='fail-history-once'){fault='none';send(res,503,{error:'PRIVATE_HISTORY_FIXTURE_MARKER'});return;}
  if(history&&['invalid-history-once','context-history-once'].includes(fault)){
    const mode=fault;fault='none';const end=res.end.bind(res);res.end=(body,...args)=>{
      if(res.statusCode===200){const value=JSON.parse(String(body));if(mode==='context-history-once')value.clientContext='f'.repeat(64);else value.unexpected='PRIVATE_HISTORY_FIXTURE_MARKER';return end(JSON.stringify(value),...args);}return end(body,...args);
    };
  }
  if(list)counters.listReads++;if(detail)counters.detailReads++;
  if(list&&fault==='fail-list-once'){fault='none';send(res,503,{error:'PRIVATE_FIXTURE_READ_ERROR'});return;}
  if(list&&fault==='hold-list-once'||detail&&fault==='hold-detail-once'||history&&fault==='hold-history-once'||exactReceipt&&fault==='hold-receipt-once'||helpHistory&&fault==='hold-help-history-once'||conversation&&fault==='hold-conversation-once'){fault='none';setTimeout(()=>{if(!res.destroyed)handler(req,res);},8000);return;}
  handler(req,res);
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
async function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);server.close(async()=>{console.log(JSON.stringify({terminal:true,...await state()}));await db.close();process.stdin.pause();});server.closeIdleConnections();}
const timeout=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')void stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-worker-navigation',url:origin+'/api/qa-navigation',expiresInSeconds:1200}));
