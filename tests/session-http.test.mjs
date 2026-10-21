import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionContextFetch} from './helpers/session-http.mjs';
import {staffBriefingContextRequired,staffBillingContextRequired,staffPeopleContextRequired,staffResponseContextRequired,staffPolicyContextRequired,staffWorkspaceContextRequired,staffArtifactContextRequired,staffReportContextRequired,staffNotificationContextRequired,staffOnboardingContextRequired,staffUsageContextRequired} from '../server/session-context.mjs';
import {staffApplicationContextRequired} from '../server/session-context.mjs';

test('source JSON history and retry receipts require captured context while native private bytes remain cookie-bound',()=>{
  for(const path of ['/api/source-audio','/api/source-audio/id','/api/source-audio/id/retries/retry'])for(const method of ['GET','HEAD'])assert.equal(staffBriefingContextRequired(path,method),true);
  for(const path of ['/api/source-audio','/api/source-audio/id/retries'])assert.equal(staffBriefingContextRequired(path,'POST'),true);
  for(const path of ['/api/source-audio/id/audio','/api/source-audio/id/original'])for(const method of ['GET','HEAD'])assert.equal(staffBriefingContextRequired(path,method),false);
});

test('application JSON reads and local readiness inspection require captured staff context, not native CSV/audio URLs',()=>{
  for(const path of ['/api/overview','/api/processing','/api/processing/id','/api/audit','/api/audit/id','/api/language-readiness'])for(const method of ['GET','HEAD'])assert.equal(staffApplicationContextRequired(path,method),true);
  assert.equal(staffApplicationContextRequired('/api/language-readiness/test','POST'),true);
  for(const path of ['/api/audit.csv','/api/recordings/id/audio','/api/staff/speech/id','/api/worker/briefings'])assert.equal(staffApplicationContextRequired(path,'GET'),false);
});

test('usage metadata, owner inbox, personal receipt and request submission require original staff context',()=>{
  for(const path of ['/api/usage','/api/usage/requests','/api/usage/requests/id'])for(const method of ['GET','HEAD'])assert.equal(staffUsageContextRequired(path,method),true);
  assert.equal(staffUsageContextRequired('/api/usage/requests','POST'),true);
  for(const path of ['/api/usage','/api/usage/requests/id','/api/invoices/id/download','/api/recordings/id/audio'])assert.equal(staffUsageContextRequired(path,'POST'),false);
});

test('setup metadata, save and exact receipts require captured staff context without changing unrelated native paths',()=>{
  for(const path of ['/api/settings/onboarding','/api/settings/onboarding/receipts/id'])for(const method of ['GET','HEAD'])assert.equal(staffOnboardingContextRequired(path,method),true);
  assert.equal(staffOnboardingContextRequired('/api/settings/onboarding','POST'),true);
  for(const path of ['/api/recordings/id/audio','/api/settings/onboarding/receipts/id','/api/settings/site'])assert.equal(staffOnboardingContextRequired(path,'POST'),false);
});

test('personal notification list, mark and exact receipt require staff context without changing native byte URLs',()=>{
  for(const path of ['/api/notifications','/api/notifications/id/receipt'])for(const method of ['GET','HEAD'])assert.equal(staffNotificationContextRequired(path,method),true);
  assert.equal(staffNotificationContextRequired('/api/notifications/id/read','POST'),true);
  for(const path of ['/api/notifications/id/read','/api/recordings/id/audio','/api/reports/exports/id/download'])assert.equal(staffNotificationContextRequired(path,'GET'),false);
});

test('report JSON and export mutations/receipts require staff context while native CSV URLs do not',()=>{
  for(const path of ['/api/reports','/api/reports/publications','/api/reports/exports','/api/reports/exports/receipts/create/id','/api/reports/exports/receipts/retry/id'])for(const method of ['GET','HEAD'])assert.equal(staffReportContextRequired(path,method),true);
  for(const path of ['/api/reports/exports','/api/reports/exports/id/retry'])assert.equal(staffReportContextRequired(path,'POST'),true);
  for(const path of ['/api/reports.csv','/api/reports/exports/id/download','/api/recordings/id/audio','/api/worker/briefings'])assert.equal(staffReportContextRequired(path,'GET'),false);
});

test('artifact list, exact versions, receipts and all eleven actions require staff context',()=>{
  for(const family of ['templates','glossary']) {
    for(const path of [`/api/${family}`,`/api/${family}/id`,`/api/${family}/receipts/id`])for(const method of ['GET','HEAD'])assert.equal(staffArtifactContextRequired(path,method),true);
    assert.equal(staffArtifactContextRequired(`/api/${family}`,'POST'),true);
  }
  for(const action of ['edit','archive','restore','duplicate','use'])assert.equal(staffArtifactContextRequired(`/api/templates/id/${action}`,'POST'),true);
  for(const action of ['edit','remove','restore','regenerate'])assert.equal(staffArtifactContextRequired(`/api/glossary/id/${action}`,'POST'),true);
  for(const path of ['/api/recordings/id/audio','/api/templates/id/download','/api/worker/briefings'])assert.equal(staffArtifactContextRequired(path,'GET'),false);
});

test('synthetic fixture client captures a staff cookie once, preserves explicit stale headers and leaves native audio headers alone',async()=>{
  const calls=[];let context='a'.repeat(64);
  const fixtureFetch=createSessionContextFetch(async(input,options)=>{
    calls.push({url:String(input),headers:new Headers(options?.headers)});
    return String(input).endsWith('/api/session')?Response.json({authenticated:true,role:'staff',clientContext:context}):Response.json({ok:true});
  });
  const root='http://127.0.0.1:12345/api',cookie='synthetic-cookie=synthetic-fixture-only';
  await fixtureFetch(root+'/briefings',{headers:{cookie}});context='b'.repeat(64);
  await fixtureFetch(root+'/briefings/brief',{headers:{cookie}});
  assert.equal(calls.filter(call=>call.url.endsWith('/api/session')).length,1);
  assert.equal(calls.at(-1).headers.get('x-client-session-context'),'a'.repeat(64));
  await fixtureFetch(root+'/briefings/brief',{headers:{cookie,'x-client-session-context':'deliberately-invalid'}});
  assert.equal(calls.at(-1).headers.get('x-client-session-context'),'deliberately-invalid');
  await fixtureFetch(root+'/briefings/brief/artifacts/draft/1/en/body',{headers:{cookie}});
  assert.equal(calls.at(-1).headers.has('x-client-session-context'),false);
  await assert.rejects(fixtureFetch('https://external.example.test/api/briefings',{headers:{cookie}}),/loopback/);
});

test('billing context covers ledger JSON/mutations/receipts but never requires custom headers for native invoice download',()=>{
  for(const path of ['/api/invoices','/api/invoices/id','/api/invoices/requests/payment/id'])assert.equal(staffBillingContextRequired(path,'GET'),true);
  for(const path of ['/api/invoices','/api/invoices/id/payments','/api/invoices/id/void'])assert.equal(staffBillingContextRequired(path,'POST'),true);
  assert.equal(staffBillingContextRequired('/api/invoices/id/download','GET'),false);
});

test('People context covers migrated private controls and imports without requiring headers on native CSV',()=>{
  for(const path of ['/api/people/workers','/api/people/crews','/api/people/crews/id'])assert.equal(staffPeopleContextRequired(path,'GET'),true);
  for(const path of ['/api/people/workers/id','/api/people/crews/id'])assert.equal(staffPeopleContextRequired(path,'PATCH'),true);
  for(const path of ['/api/people/workers','/api/people/crews','/api/people/workers/id/disable','/api/people/workers/id/reenable','/api/people/workers/id/crew','/api/people/crews/id/archive','/api/people/crews/id/restore'])assert.equal(staffPeopleContextRequired(path,'POST'),true);
  assert.equal(staffPeopleContextRequired('/api/people/imports/id/errors.csv','GET'),false);
  for(const path of ['/api/people/workers/id/access','/api/people/workers/id/deletion','/api/people/workers/id/assignments','/api/privacy/workers'])assert.equal(staffPeopleContextRequired(path,'GET'),true);
  for(const path of ['/api/worker-grants','/api/worker-grants/id/revoke','/api/people/workers/id/deletion'])assert.equal(staffPeopleContextRequired(path,'POST'),true);
  assert.equal(staffPeopleContextRequired('/api/people/imports/preview','POST'),true);
  assert.equal(staffPeopleContextRequired('/api/people/imports/id/confirm','POST'),true);
  assert.equal(staffPeopleContextRequired('/api/people/imports/id','GET'),true);
});

test('staff response JSON reads are captured-context bound without changing native audio URLs',()=>{
  for(const path of ['/api/publications/id/responses','/api/publications/id/responses/assignment'])assert.equal(staffResponseContextRequired(path,'GET'),true);
  for(const path of ['/api/recordings/id/audio','/api/staff/speech/id','/api/worker/briefings/id/submissions'])assert.equal(staffResponseContextRequired(path,'GET'),false);
});

test('policy metadata, saves and receipts are staff context bound while unrelated worker byte paths stay unchanged',()=>{
  for(const path of ['/api/retention','/api/privacy/recording-notice',...['text','cases','generated','activity','briefings'].map(name=>`/api/retention/${name}`)]){
    for(const method of ['GET','HEAD','POST'])assert.equal(staffPolicyContextRequired(path,method),true);
    assert.equal(staffPolicyContextRequired(`${path}/requests/id`,'GET'),true);
    assert.equal(staffPolicyContextRequired(`${path}/requests/id`,'POST'),false);
  }
  for(const path of ['/api/recordings/id/audio','/api/worker/briefings','/api/privacy/workers'])assert.equal(staffPolicyContextRequired(path,'GET'),false);
});
test('workspace settings and site JSON require captured context without extending to unrelated handlers',()=>{
  for(const path of ['/api/settings','/api/settings/contacts','/api/settings/sites','/api/settings/site/receipts/id','/api/settings/organization/receipts/id','/api/settings/sites/receipts/id','/api/settings/sites/access/receipts/id','/api/settings/sites/lifecycle/receipts/id','/api/settings/sites/id/lifecycle'])for(const method of ['GET','HEAD'])assert.equal(staffWorkspaceContextRequired(path,method),true,path);
  for(const path of ['/api/settings/organization','/api/settings/site','/api/settings/sites','/api/settings/sites/access','/api/settings/sites/lifecycle'])assert.equal(staffWorkspaceContextRequired(path,'POST'),true,path);
  for(const path of ['/api/settings/onboarding','/api/settings/staff','/api/settings/invitations','/api/recordings/id/audio'])assert.equal(staffWorkspaceContextRequired(path,'GET'),false,path);
});

test('briefing header policy covers the JSON contract without breaking native private-byte URLs or other unfinished handlers',()=>{
  for(const path of ['/api/briefings','/api/briefings/brief','/api/briefings/brief/schedules','/api/draft-creation-receipts/id','/api/briefings/brief/publication-receipts/publish/id'])assert.equal(staffBriefingContextRequired(path,'GET'),true);
  for(const action of ['copy','archive','withdraw','publish','schedules','process'])assert.equal(staffBriefingContextRequired('/api/briefings/brief/'+action,'POST'),true);
  assert.equal(staffBriefingContextRequired('/api/briefings/brief','PATCH'),true);
  assert.equal(staffBriefingContextRequired('/api/briefings/brief/schedules/id/cancel','POST'),true);
  for(const path of ['/api/briefings/brief/artifacts/draft/1/en/body','/api/recordings/id/audio','/api/staff/speech/id'])assert.equal(staffBriefingContextRequired(path,'GET'),false);
  for(const path of ['/api/briefings/brief/review','/api/briefings/brief/regenerate','/api/briefing-review/receipts/id/verify'])assert.equal(staffBriefingContextRequired(path,'POST'),true);
  for(const path of ['/api/briefing-review/receipts/id','/api/briefing-regeneration/receipts/id'])assert.equal(staffBriefingContextRequired(path,'GET'),true);
});
