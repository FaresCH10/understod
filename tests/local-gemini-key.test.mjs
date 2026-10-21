import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {relocateGeminiKey} from '../scripts/local-gemini-key.mjs';

const fake='synthetic-local-configuration-key-only';
function fixture(t,example,local) {
  const root=mkdtempSync(join(tmpdir(),'understood-key-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(join(root,'.env.example'),example);
  if(local!==undefined)writeFileSync(join(root,'.env'),local);
  return root;
}
test('local key relocation preserves other example configuration, keeps secrets out of its result, and is idempotent',t=>{
  const root=fixture(t,'# Configuration\r\nOTHER=retained\r\nGEMINI_API_KEY="'+fake+'"\r\n');
  const result=relocateGeminiKey(root);
  assert.deepEqual(result,{relocated:true,localKeyPresent:true,exampleKeyPresent:false});
  assert.equal(JSON.stringify(result).includes(fake),false);
  assert.equal(readFileSync(join(root,'.env.example'),'utf8'),'# Configuration\r\nOTHER=retained\r\nGEMINI_API_KEY=\r\n');
  assert.equal(parseEnv(readFileSync(join(root,'.env'),'utf8')).GEMINI_API_KEY,fake);
  assert.deepEqual(relocateGeminiKey(root),{relocated:false,localKeyPresent:true});
});
test('local key relocation refuses conflicts or ambiguous input without modifying either configuration',t=>{
  for(const [example,local] of [['GEMINI_API_KEY='+fake,'GEMINI_API_KEY=another-synthetic-local-test-key'],
    ['GEMINI_API_KEY='+fake+'\nGEMINI_API_KEY='+fake,'OTHER=kept'],['GEMINI_API_KEY="unsafe\nvalue"','OTHER=kept']]) {
    const root=fixture(t,example,local);assert.throws(()=>relocateGeminiKey(root));
    assert.equal(readFileSync(join(root,'.env.example'),'utf8'),example);assert.equal(readFileSync(join(root,'.env'),'utf8'),local);
  }
});
test('local key relocation preserves unrelated local settings and does not turn on live adapters',t=>{
  const root=fixture(t,'GEMINI_API_KEY='+fake+'\nUNDERSTOOD_PROVIDER_TESTS=disabled\n','OTHER=retained\n');
  relocateGeminiKey(root);
  const local=parseEnv(readFileSync(join(root,'.env'),'utf8'));
  assert.deepEqual(local,{OTHER:'retained',GEMINI_API_KEY:fake});
  assert.equal(parseEnv(readFileSync(join(root,'.env.example'),'utf8')).UNDERSTOOD_PROVIDER_TESTS,'disabled');
});
test('local key relocation protects an invalid credential without guessing or changing its value',t=>{
  const invalid='https://invalid.example.test/not-an-api-key?test=only',root=fixture(t,'GEMINI_API_KEY="'+invalid+'"');
  relocateGeminiKey(root);
  assert.equal(parseEnv(readFileSync(join(root,'.env'),'utf8')).GEMINI_API_KEY,invalid);
  assert.equal(parseEnv(readFileSync(join(root,'.env.example'),'utf8')).GEMINI_API_KEY,'');
});
