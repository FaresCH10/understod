import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('follow-up submit and private recorder share an action row outside the message form',async()=>{
  const source=await readFile(new URL('../src/CaseConversation.tsx',import.meta.url),'utf8');
  assert.match(source,/<form id=\{composerId\}/);
  assert.match(source,/<button type="submit" form=\{composerId\}/);
  const end=source.indexOf('</form>'),actions=source.indexOf('<div className="case-conversation-actions">');
  assert.ok(end>0&&actions>end);assert.ok(source.lastIndexOf('{!worker&&afterComposer}')>actions);
  assert.equal(source.match(/\{!worker&&afterComposer\}/g).length,1);
});

test('recording history has a persistent focus target and announces page loading without retaining private rows',async()=>{
  const source=await readFile(new URL('../src/StaffCaseRecordings.tsx',import.meta.url),'utf8');
  assert.match(source,/<h3 ref=\{historyHeading\} tabIndex=\{-1\}/);
  assert.match(source,/historyHeading\.current\?\.focus\(\);setPage\(next\)/);
  assert.match(source,/historyHeading\.current\?\.focus\(\);setTick/);
  assert.match(source,/role="status"[^>]*>\{historyLoading\?t\.loading/);
  assert.match(source,/read\.key===key&&available&&api\.current\(\)\?read\.data:null/);
  assert.match(source,/disabled=\{busy\|\|unsaved\|\|page<=1\} onClick=\{\(\)=>changePage\(page-1\)\}/);
});

test('message counter and dispatch share the purpose-specific limit without replacing the message label',async()=>{
  const source=await readFile(new URL('../src/CaseConversation.tsx',import.meta.url),'utf8');
  assert.ok(source.includes('maxLength={composerPolicy.limit}'));
  assert.ok(source.includes('aria-invalid={overLimit}'));
  assert.ok(source.includes('{text.length} / {composerPolicy.limit}'));
  assert.ok(source.includes('const kind=composerPolicy.kind;'));
  assert.ok(source.includes('recoveryFailed||overLimit||!text.trim()'));
});

test('adjacent conversation actions reset the inherited panel action margin',async()=>{
  const source=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.ok(/\.case-conversation-actions > \.actions\s*\{[^}]*margin:\s*0\s*;/.test(source),'The direct action group must align with the private recording trigger');
});
