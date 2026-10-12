import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactField,artifactVoiceLanguage,artifactSpeechUrls,languageArtifacts} from '../src/language-artifacts.ts';
import {syntheticPrepare,CANONICAL_SOURCE} from '../server/domain.mjs';

test('language inspection distinguishes stored text, device demo, missing and unverified audio without mutating evidence',() => {
  const prepared=syntheticPrepare(CANONICAL_SOURCE),before=JSON.stringify(prepared);
  for(const code of ['en','ar','ur']) {
    const result=languageArtifacts(prepared,CANONICAL_SOURCE,code);
    assert.equal(result.text.status,'present');assert.equal(result.question.status,'present');
    assert.equal(result.audio,'device-demo');assert.equal(result.canPreview,true);
    assert.equal(languageArtifacts(prepared,'Changed source',code).canPreview,false);
  }
  assert.equal(JSON.stringify(prepared),before);
  const absent=languageArtifacts(null,CANONICAL_SOURCE,'ar');
  assert.equal(absent.text.status,'missing');assert.equal(absent.audio,'missing');assert.equal(absent.canPreview,false);
  assert.equal(languageArtifacts(prepared,CANONICAL_SOURCE,'xyz').supported,false);
  const empty=structuredClone(prepared);empty.source='';
  assert.equal(languageArtifacts(empty,'','ar').canPreview,false);
  const invalid=structuredClone(prepared);invalid.languages.ar.text=' '.repeat(5);invalid.languages.ar.question=7;
  assert.equal(languageArtifacts(invalid,CANONICAL_SOURCE,'ar').text.status,'invalid');
  assert.equal(languageArtifacts(invalid,CANONICAL_SOURCE,'ar').canPreview,false);
  for(const speech of ['https://provider.invalid/private.wav',{key:'private/path'},'generated',false]) {
    const changed=structuredClone(prepared);changed.languages.ar.speech=speech;
    assert.equal(languageArtifacts(changed,CANONICAL_SOURCE,'ar').audio,'unverified');
    assert.equal(languageArtifacts(changed,CANONICAL_SOURCE,'ar').canPreview,false);
  }
  const live=structuredClone(prepared);live.provenance.live=true;
  assert.equal(languageArtifacts(live,CANONICAL_SOURCE,'ar').canPreview,false);
});

test('artifact field validation and device voice matching do not substitute a different language',() => {
  for(const value of [undefined,null,'']) assert.equal(artifactField(value,5).status,'missing');
  for(const value of [{},false,1,'   ','sixsix']) assert.equal(artifactField(value,5).status,'invalid');
  assert.deepEqual(artifactField('Hello',5),{value:'Hello',status:'present'});
  for(const voice of ['ar','AR-lb','ar_SA']) assert.equal(artifactVoiceLanguage(voice,'ar'),true);
  for(const voice of ['en-US','ur-PK','arabic']) assert.equal(artifactVoiceLanguage(voice,'ar'),false);
});

test('staff audio URLs must match the exact same-origin briefing, version, revision, language and kind',()=>{
  const make=base=>({ar:{body:`${base}/body`,question:`${base}/question`}});
  const base='/api/briefings/brief/artifacts/draft/3/ar',valid=make(base);
  assert.deepEqual(artifactSpeechUrls(valid,'brief','draft',3,'ar'),valid.ar);
  assert.equal(artifactSpeechUrls(valid,'brief','draft',4,'ar'),null);
  assert.equal(artifactSpeechUrls(valid,'other','draft',3,'ar'),null);
  assert.equal(artifactSpeechUrls(valid,'brief','publication',3,'ar'),null);
  assert.equal(artifactSpeechUrls(valid,'brief','draft',3,'ur'),null);
  for(const value of [null,'generated',{ar:'generated'},make(`https://evil.invalid${base}`),make('//evil.invalid/path'),make(`${base}?worker=other`),{ar:{body:valid.ar.question,question:valid.ar.body}}])
    assert.equal(artifactSpeechUrls(value,'brief','draft',3,'ar'),null);
  const published=make('/api/briefings/brief/artifacts/publication/frozen/ar');
  assert.deepEqual(artifactSpeechUrls(published,'brief','frozen',99,'ar'),published.ar);
  assert.equal(artifactSpeechUrls(published,'brief','newer',99,'ar'),null);
});
