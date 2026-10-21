import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {StaffRequestError} from '../src/staff-request.ts';
import {canonicalCaseReview,readCaseReview,retainCaseReview,clearCaseReview,caseReviewRecoveryHash,readCaseRepeat,retainCaseRepeat,clearCaseRepeat,mayReleaseFreshCaseRejection} from '../src/case-workflow-recovery.ts';
import {checkedRepeatReceipt,checkedReviewReceipt,checkedRepeatPage,checkedReviewPage,caseWorkflowHash} from '../src/case-workflow-contract.ts';
import {civilTimeInstant} from '../src/civil-time.ts';

const session=()=>({authenticated:true,role:'staff',staffRole:'owner',staffScope:'["qa","beirut","owner"]',siteState:'active',mode:'credential',clientContext:'a'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString()});
const store=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const due=()=>new Date(Date.now()+3600000).toISOString();
const context='a'.repeat(64),createdAt='2026-10-20T07:00:00.000Z';
const reviewRow=async(content)=>({id:randomUUID(),caseId:'case-14',kind:content.kind,createdAt,dueAt:content.dueAt??null,expectedDueAt:content.expectedDueAt??null,reason:content.reason??null,attemptId:content.kind==='disagree'?'attempt-14':null,actorId:'owner',requestHash:await caseReviewRecoveryHash(content)});

test('repeat recovery preserves the exact original deadline, checks storage and never silently resends changed intent',()=>{
  const storage=store(),scope=session(),dueAt=due(),retained=retainCaseRepeat(storage,scope,'case-14',dueAt,()=>true);
  assert.deepEqual(readCaseRepeat(storage,scope,'case-14'),retained);assert.deepEqual(retainCaseRepeat(storage,scope,'case-14',dueAt,()=>true),retained);
  assert.throws(()=>retainCaseRepeat(storage,scope,'case-14',new Date(Date.parse(dueAt)+60000).toISOString(),()=>true),error=>error.code==='conflict');
  assert.throws(()=>retainCaseRepeat(storage,scope,'case-14',dueAt,()=>false),error=>error.code==='session');
  assert.throws(()=>clearCaseRepeat(storage,scope,'case-14',{...retained,id:randomUUID()}),error=>error.code==='conflict');
  assert.equal(readCaseRepeat(storage,{...scope,clientContext:'b'.repeat(64)},'case-14'),null);
  const receipt={...retained,caseId:'case-14',status:'pending',createdAt,submittedAt:null,clientContext:context};
  checkedRepeatReceipt(receipt,'case-14',retained,context);
  for(const row of [{...receipt,dueAt:createdAt},{...receipt,submittedAt:createdAt},{...receipt,caseId:'other'},{...receipt,clientContext:'b'.repeat(64)},{...receipt,private:'not allowed'}])assert.throws(()=>checkedRepeatReceipt(row,'case-14',retained,context));
  clearCaseRepeat(storage,scope,'case-14',retained);assert.equal(storage.values.size,0);
  assert.throws(()=>retainCaseRepeat({...storage,setItem(){}},scope,'case-14',dueAt,()=>true),error=>error.code==='storage');
  assert.throws(()=>retainCaseRepeat(storage,scope,'case-14',createdAt,()=>true,Date.parse(createdAt)+1000),error=>error.code==='input');
});

test('new review metadata is canonical, scoped and private, and cannot overwrite a prior uncertain request',async()=>{
  const storage=store(),scope=session(),content={kind:'disagree',reason:'  Synthetic private disagreement  '},retained=await retainCaseReview(storage,scope,'case-14',content,()=>true);
  assert.equal(retained.legacy,false);assert.equal(retained.hash,createHash('sha256').update(JSON.stringify({kind:'disagree',reason:content.reason.trim()})).digest('hex'));
  assert.equal(JSON.stringify([...storage.values]).includes(content.reason.trim()),false);assert.deepEqual(readCaseReview(storage,scope,'case-14'),retained);
  assert.deepEqual(await retainCaseReview(storage,scope,'case-14',{...content,reason:content.reason.trim()},()=>true),retained);
  await assert.rejects(retainCaseReview(storage,scope,'case-14',{...content,reason:'Another synthetic private reason'},()=>true),error=>error.code==='conflict');
  clearCaseReview(storage,scope,'case-14',retained);
  const deadline={kind:'deadline',dueAt:due(),expectedDueAt:null},next=await retainCaseReview(storage,scope,'case-14',deadline,()=>true);
  assert.equal(next.hash,await caseWorkflowHash(JSON.stringify(deadline)));assert.equal(JSON.stringify([...storage.values]).includes(deadline.dueAt),false);
  for(const value of [{kind:'disagree',reason:'bad'},{kind:'deadline',dueAt:due()},{...deadline,extra:1},{...deadline,expectedDueAt:'bad'}])assert.throws(()=>canonicalCaseReview(value));
});

test('review hashing rechecks authority, full staff binding and concurrent storage before retaining metadata',async()=>{
  for(const change of ['authority','scope','context','expiry']){
    const storage=store(),scope=session();let live=true;const result=retainCaseReview(storage,scope,'case-14',{kind:'disagree',reason:'Synthetic draft'},()=>live);
    if(change==='authority')live=false;if(change==='scope')scope.staffScope='["qa","tripoli","owner"]';if(change==='context')scope.clientContext='b'.repeat(64);if(change==='expiry')scope.expiresAt='2000-01-01T00:00:00.000Z';
    await assert.rejects(result,error=>error.code==='session');assert.equal(storage.values.size,0);
  }
  const storage=store(),scope=session(),result=retainCaseReview(storage,scope,'case-14',{kind:'disagree',reason:'Synthetic draft'},()=>true);
  storage.setItem(`understood:case-review-action:${context}:case-14`,JSON.stringify({id:randomUUID(),kind:'disagree',hash:'c'.repeat(64)}));
  await assert.rejects(result,error=>error.code==='conflict');
});

test('legacy review metadata is retained and verified without plaintext migration or accidental deletion',async()=>{
  const storage=store(),scope=session(),reason='Synthetic legacy private reason',id=randomUUID(),hash=await caseWorkflowHash(reason);
  storage.setItem(`understood:case-review:${context}:case-14`,JSON.stringify({id,kind:'disagree',hash}));
  const pending=readCaseReview(storage,scope,'case-14');assert.equal(pending.legacy,true);assert.equal((await retainCaseReview(storage,scope,'case-14',{kind:'disagree',reason},()=>true)).id,id);
  const row={...await reviewRow({kind:'disagree',reason}),id,clientContext:context};await checkedReviewReceipt(row,'case-14',pending,context);
  await assert.rejects(checkedReviewReceipt({...row,reason:'[Deleted]'},'case-14',pending,context),error=>error.code==='retired');assert.deepEqual(readCaseReview(storage,scope,'case-14'),pending);
  clearCaseReview(storage,scope,'case-14',pending);assert.equal(storage.values.size,0);
  storage.setItem(`understood:case-review:${context}:case-14`,'broken');await assert.rejects(retainCaseReview(storage,scope,'case-14',{kind:'disagree',reason},()=>true),error=>error.code==='storage');
});

test('review receipt validates canonical content and original intent even when the private reason was retired',async()=>{
  const content={kind:'disagree',reason:'Synthetic original review reason'},row={...await reviewRow(content),clientContext:context},pending={id:row.id,kind:row.kind,hash:row.requestHash,legacy:false};
  await checkedReviewReceipt(row,'case-14',pending,context);await checkedReviewReceipt({...row,reason:'[Expired]'},'case-14',pending,context);
  for(const value of [{...row,reason:'Forged different private reason'},{...row,actorId:''},{...row,attemptId:null},{...row,clientContext:'b'.repeat(64)},{...row,requestHash:'c'.repeat(64)},{...row,provider:'private'}])await assert.rejects(checkedReviewReceipt(value,'case-14',pending,context));
  const deadline={kind:'deadline',dueAt:due(),expectedDueAt:createdAt},receipt={...await reviewRow(deadline),clientContext:context};
  await checkedReviewReceipt(receipt,'case-14',{id:receipt.id,kind:'deadline',hash:receipt.requestHash,legacy:false},context);
});

test('strict workflow pages reject incoherent capabilities, paging, duplicates, foreign cases and diagnostics',async()=>{
  const repeat={caseId:'case-14',caseStatus:'open',items:[],total:0,page:1,pageSize:10,canRequest:false,blockedReason:'no_answer',clientContext:context};
  checkedRepeatPage(repeat,'case-14',1,10,context);
  for(const row of [{...repeat,canRequest:true},{...repeat,total:1},{...repeat,blockedReason:'unknown'},{...repeat,clientContext:'b'.repeat(64)}])assert.throws(()=>checkedRepeatPage(row,'case-14',1,10,context));
  const review={caseId:'case-14',caseStatus:'open',items:[await reviewRow({kind:'disagree',reason:'Synthetic case review'})],total:1,page:1,pageSize:10,effectiveDueAt:null,hasAssessment:true,canChangeDeadline:true,canDisagree:true,blockedReason:null,clientContext:context};
  checkedReviewPage(review,'case-14',1,10,context);
  for(const row of [{...review,hasAssessment:false},{...review,items:[...review.items,...review.items],total:2},{...review,caseStatus:'resolved'},{...review,effectiveDueAt:'yesterday'},{...review,diagnostic:'PRIVATE'}])assert.throws(()=>checkedReviewPage(row,'case-14',1,10,context));
});

test('only a known first-attempt HTTP rejection can release freshly retained recovery metadata',()=>{
  assert.equal(mayReleaseFreshCaseRejection(true,new StaffRequestError('Case deadline changed',false,409)),true);
  for(const [fresh,error] of [[false,new StaffRequestError('not found',false,404)],[true,new StaffRequestError('unknown',true,503)],[true,new StaffRequestError('changed',false,409,true)],[true,Error('rejected')]])assert.equal(mayReleaseFreshCaseRejection(fresh,error),false);
});

test('case deadline conversion uses the site zone and rejects gaps or an unchosen repeated occurrence',()=>{
  assert.equal(civilTimeInstant('2026-10-20T16:00','Asia/Beirut',''),'2026-10-20T13:00:00.000Z');
  assert.throws(()=>civilTimeInstant('2026-03-08T02:30','America/New_York',''),/does not exist/);
  assert.throws(()=>civilTimeInstant('2026-11-01T01:30','America/New_York',''),/occurs twice/);
  assert.notEqual(civilTimeInstant('2026-11-01T01:30','America/New_York','earlier'),civilTimeInstant('2026-11-01T01:30','America/New_York','later'));
});
