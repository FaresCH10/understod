import test from 'node:test';
import assert from 'node:assert/strict';
import {recordingNotice} from '../src/recording-notice.ts';

test('recording notice localizes every privacy statement and distinguishes synthetic from configured AI',()=>{
  const notices=['en','ar','ur'].map(language=>{
    const synthetic=recordingNotice(language,true),configured=recordingNotice(language,false);
    assert.deepEqual(Object.keys(synthetic),['title','local','access','processing','retention']);
    for(const value of Object.values(synthetic))assert.ok(typeof value==='string' && value.trim().length>0);
    for(const field of ['title','local','access','retention'])assert.equal(synthetic[field],configured[field]);
    assert.notEqual(synthetic.processing,configured.processing);
    assert.doesNotMatch(Object.values(synthetic).join(' '),/\b(?:30|90) days\b|GDPR compliant|legally consented/);
    return synthetic;
  });
  assert.equal(new Set(notices.map(value=>value.local)).size,3);
  assert.match(notices[0].local,/Leaving or reloading can lose an unsaved preview/);
  assert.match(notices[0].local,/unless you explicitly save a copy/);
  assert.match(notices[0].local,/Saving does not send it; sending requires a separate action/);
  assert.match(notices[0].processing,/not sent to a live AI provider/);
  assert.match(notices[0].retention,/does not erase old backups/);
  assert.match(notices[1].local,/[\u0600-\u06ff]/);
  assert.match(notices[2].local,/[\u0600-\u06ff]/);
});
