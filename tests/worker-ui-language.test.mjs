import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorkerLockLanguage,readWorkerUiLanguage,saveWorkerUiLanguage,workerUiLanguageKey,workerUiLanguageText} from '../src/worker-ui-language.ts';
import {sameWorkerSession,validWorkerSession} from '../src/session-state.ts';
import {clearWorkerLocalData} from '../src/worker-local-data.ts';

const now=Date.parse('2026-10-08T12:00:00.000Z');
const session={authenticated:true,role:'worker',clientContext:'a'.repeat(64),workerId:'worker-14',language:'en',mode:'synthetic-credential',expiresAt:'2026-10-08T13:00:00.000Z'};
function store(){const data={};return {data,getItem:key=>data[key]??null,setItem:(key,value)=>{data[key]=value;}};}

test('locked and expired presentation retains only the exact selected interface locale, never session authority',()=>{
  const storage=store();saveWorkerUiLanguage(storage,session,'ur',now);const original=structuredClone(session);
  assert.equal(readWorkerLockLanguage(storage,session),'ur');assert.equal(readWorkerUiLanguage(storage,session,now+3600000),'en');
  assert.equal(validWorkerSession(session,now+3600000),false);assert.equal(readWorkerLockLanguage(storage,{...session,clientContext:'b'.repeat(64)}),'en');
  assert.equal(readWorkerLockLanguage(storage,{...session,expiresAt:'2026-10-08T14:00:00.000Z'}),'en');
  assert.equal(readWorkerLockLanguage({getItem:()=>{throw Error('denied');}},session),'en');assert.deepEqual(session,original);
  let reads=0;for(const change of [{authenticated:false},{role:'staff'},{clientContext:'invalid'},{expiresAt:'invalid'}])assert.equal(readWorkerLockLanguage({getItem:()=>{reads++;return null;}},{...session,...change}),'en');assert.equal(reads,0);
  storage.setItem(workerUiLanguageKey,JSON.stringify({context:session.clientContext,expiresAt:session.expiresAt,language:'ur',private:'extra'}));assert.equal(readWorkerLockLanguage(storage,session),'en');
});
test('interface language persists only for the exact unexpired session without changing assignment/session evidence',()=>{
  const storage=store(),before=structuredClone(session);
  for(const language of ['ar','ur','en']){saveWorkerUiLanguage(storage,session,language,now);assert.equal(readWorkerUiLanguage(storage,session,now),language);}
  saveWorkerUiLanguage(storage,session,'ur',now);
  assert.equal(readWorkerUiLanguage(storage,{...session,clientContext:'b'.repeat(64)},now),'en');
  assert.equal(readWorkerUiLanguage(storage,{...session,expiresAt:'2026-10-08T14:00:00.000Z'},now),'en');
  assert.equal(readWorkerUiLanguage(storage,session,now+3600000),'en');
  assert.deepEqual(session,before);assert.equal(sameWorkerSession(before,session,now),true);
  assert.throws(()=>saveWorkerUiLanguage(storage,session,'xyz',now));
  assert.throws(()=>saveWorkerUiLanguage(storage,session,'ar',now+3600000));
});
test('malformed/denied storage falls back; unsuccessful writes do not report persistence',()=>{
  const storage=store();for(const raw of ['{','null','[]',JSON.stringify({context:session.clientContext,expiresAt:session.expiresAt,language:'xyz'}),'x'.repeat(301)]){storage.setItem(workerUiLanguageKey,raw);assert.equal(readWorkerUiLanguage(storage,session,now),'en');}
  assert.equal(readWorkerUiLanguage({getItem:()=>{throw Error();}},session,now),'en');
  assert.throws(()=>saveWorkerUiLanguage({setItem:()=>{},getItem:()=>null},session,'ar',now));
  for(const language of ['en','ar','ur'])for(const text of Object.values(workerUiLanguageText[language]))assert.ok(text.trim());
});
test('shared-device cleanup removes the interface language preference',async()=>{
  const storage=store();saveWorkerUiLanguage(storage,session,'ur',now);
  const cleanup={...storage.data,removeItem:key=>{delete storage.data[key];}};
  let audio=0,briefings=0;
  assert.equal(await clearWorkerLocalData(session.clientContext,cleanup,async()=>{audio++;},async()=>{briefings++;}),true);
  assert.equal(audio,1);assert.equal(briefings,1);
  assert.equal(readWorkerUiLanguage(storage,session,now),'en');
  assert.equal(readWorkerLockLanguage(storage,session),'en');
});
