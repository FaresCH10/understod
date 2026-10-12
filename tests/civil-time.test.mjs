import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../server/domain.mjs';
import {createSchedule,processOneSchedule} from '../server/schedules.mjs';
import {civilTimeChoices,civilTimeInstant,publicationTimes} from '../src/civil-time.ts';

test('civil time uses the explicit site zone, preserves fractions of an hour and rejects malformed calendars',()=>{
  assert.deepEqual(civilTimeChoices('2026-10-08T16:00','Asia/Beirut'),[{instant:'2026-10-08T13:00:00.000Z',offset:'+03:00'}]);
  assert.equal(civilTimeInstant('2026-12-08T16:00','Asia/Beirut',''),'2026-12-08T14:00:00.000Z');
  assert.equal(civilTimeInstant('2026-10-08T16:00','Asia/Kathmandu',''),'2026-10-08T10:15:00.000Z');
  assert.equal(civilTimeInstant('2026-10-08T16:00','UTC',''),'2026-10-08T16:00:00.000Z');
  for(const value of ['','2026-02-30T12:00','2025-02-29T12:00','2026-10-08T24:00','2026-10-08T16:00Z','2026-10-08T16:00:00','2026-10-08','1999-12-31T23:59','2026-1-08T16:00','+010000-10-08T16:00'])assert.throws(()=>civilTimeChoices(value,'UTC'));
  assert.equal(civilTimeInstant('2028-02-29T12:00','UTC',''),'2028-02-29T12:00:00.000Z');
  assert.throws(()=>civilTimeChoices('9999-12-31T23:59','Etc/GMT+12'),/before year 10000/);
  for(const zone of ['', '+03:00','Bad/Zone','x'.repeat(81)])assert.throws(()=>civilTimeChoices('2026-10-08T16:00',zone));
  assert.throws(()=>civilTimeInstant('2026-10-08T16:00','UTC','compatible'));
});

test('DST gaps cannot silently shift and repeated times require an explicit first/second occurrence',()=>{
  assert.throws(()=>civilTimeChoices('2026-03-08T02:30','America/New_York'),/does not exist/);
  assert.throws(()=>civilTimeChoices('2026-10-04T02:15','Australia/Lord_Howe'),/does not exist/);
  assert.deepEqual(civilTimeChoices('2026-11-01T01:30','America/New_York'),[
    {instant:'2026-11-01T05:30:00.000Z',offset:'-04:00'},
    {instant:'2026-11-01T06:30:00.000Z',offset:'-05:00'}
  ]);
  assert.throws(()=>civilTimeInstant('2026-11-01T01:30','America/New_York',''),/occurs twice/);
  assert.equal(civilTimeInstant('2026-11-01T01:30','America/New_York','earlier'),'2026-11-01T05:30:00.000Z');
  assert.equal(civilTimeInstant('2026-11-01T01:30','America/New_York','later'),'2026-11-01T06:30:00.000Z');
  const halfHour=civilTimeChoices('2026-04-05T01:45','Australia/Lord_Howe');
  assert.equal(Date.parse(halfHour[1].instant)-Date.parse(halfHour[0].instant),30*60000);
  assert.throws(()=>civilTimeChoices('2011-12-30T12:00','Pacific/Apia'),/does not exist/);
  assert.deepEqual(civilTimeChoices('2026-10-24T23:30','Asia/Beirut'),[
    {instant:'2026-10-24T20:30:00.000Z',offset:'+03:00'},{instant:'2026-10-24T21:30:00.000Z',offset:'+02:00'}
  ]);
  assert.throws(()=>civilTimeChoices('2026-03-29T00:30','Asia/Beirut'),/does not exist/);
});

test('publication form freezes exact UTC instants, treats each repeated time independently and refuses foreign zones',()=>{
  const fields=new FormData();fields.set('timezone','America/New_York');fields.set('publishAt','2026-11-01T01:10');fields.set('deadline','2026-11-01T01:50');
  assert.throws(()=>publicationTimes(fields,'America/New_York',true),/occurs twice/);
  fields.set('deadlineOccurrence','later');assert.throws(()=>publicationTimes(fields,'America/New_York',true),/occurs twice/);
  fields.set('publishAtOccurrence','earlier');assert.deepEqual(publicationTimes(fields,'America/New_York',true),{dueAt:'2026-11-01T06:50:00.000Z',scheduledAt:'2026-11-01T05:10:00.000Z'});
  fields.set('publishAtOccurrence','later');fields.set('deadlineOccurrence','earlier');assert.throws(()=>publicationTimes(fields,'America/New_York',true),/must follow/);
  fields.set('publishAtOccurrence','earlier');fields.set('deadlineOccurrence','later');
  fields.set('timezone','UTC');assert.deepEqual(publicationTimes(fields,'America/New_York',true),{dueAt:'2026-11-01T01:50:00.000Z',scheduledAt:'2026-11-01T01:10:00.000Z'});
  fields.set('timezone','Asia/Beirut');assert.throws(()=>publicationTimes(fields,'America/New_York',true),/site time zone/);
  fields.set('timezone','UTC');fields.set('deadline','');fields.set('publishAt','not a time');assert.deepEqual(publicationTimes(fields,'America/New_York',false),{dueAt:null,scheduledAt:null});
  assert.throws(()=>publicationTimes(fields,'America/New_York',true),/complete date/);
});

test('site-civil schedule freezes the selected UTC occurrence and does not move when the site zone changes',t=>{
  const now=Date.parse('2026-10-08T12:00:00Z');t.mock.timers.enable({apis:['Date'],now});
  const db=openDatabase(':memory:');seed(db);
  try {
    db.prepare('UPDATE briefings SET state=?,prepared_json=? WHERE id=?').run('ready',JSON.stringify(syntheticPrepare(CANONICAL_SOURCE)),'shelf');
    const fields=new FormData();fields.set('timezone','Asia/Beirut');fields.set('publishAt','2026-10-24T23:10');fields.set('publishAtOccurrence','earlier');fields.set('deadline','2026-10-24T23:50');fields.set('deadlineOccurrence','later');
    const times=publicationTimes(fields,'Asia/Beirut',true),request={requestId:randomUUID(),revision:1,nextVersion:4,workerIds:['worker-28'],publishAt:times.scheduledAt,dueAt:times.dueAt,reminderMinutes:60};
    const session={principal_type:'staff',principal_id:'maya',role:'owner',org_id:'cedar',site_id:'beirut'};
    const accepted=createSchedule(db,session,'shelf',request);
    assert.equal(accepted.publishAt,'2026-10-24T20:10:00.000Z');assert.equal(accepted.dueAt,'2026-10-24T21:50:00.000Z');
    db.prepare("UPDATE sites SET timezone='Pacific/Auckland' WHERE id='beirut'").run();
    t.mock.timers.setTime(Date.parse(accepted.publishAt)-1);assert.equal(processOneSchedule(db),false);
    t.mock.timers.setTime(Date.parse(accepted.publishAt));assert.equal(processOneSchedule(db),true);assert.equal(processOneSchedule(db),false);
    const schedule=db.prepare('SELECT state,publication_id FROM publication_schedules WHERE id=?').get(request.requestId);assert.equal(schedule.state,'published');
    const row=db.prepare('SELECT a.due_at,r.due_at AS reminder_at FROM assignments a JOIN assignment_reminders r ON r.assignment_id=a.id WHERE a.publication_id=?').get(schedule.publication_id);
    assert.equal(row.due_at,accepted.dueAt);assert.equal(row.reminder_at,'2026-10-24T20:50:00.000Z');
    assert.equal(createSchedule(db,session,'shelf',request).duplicate,true);
  }finally {db.close();}
});
