import {CANONICAL_SOURCE,QUESTION,syntheticPrepare} from '../domain.mjs';
import {inspectWav} from '../audio.mjs';
import {bundleHash,translatedContent,translationCheck} from './prepared-bundle.mjs';

export const STAGE_FIXTURE_VERSION='provider-stage-fixture-v3';
export const STAGE_TESTS=Object.freeze([
  Object.freeze({stage:'translation',language:'ar',maxRequests:2}),
  Object.freeze({stage:'translation',language:'ur',maxRequests:2}),
  Object.freeze({stage:'speech',language:'en',maxRequests:1}),
  Object.freeze({stage:'speech',language:'ar',maxRequests:1}),
]);
const source=Object.freeze({title:'Shelf colour handover',text:CANONICAL_SOURCE,question:QUESTION});
const speech=Object.freeze({en:CANONICAL_SOURCE,ar:syntheticPrepare(CANONICAL_SOURCE).languages.ar.text});
export const stageFixtureHash=bundleHash({version:STAGE_FIXTURE_VERSION,source,speech});

export function stageTest(stage,language) {
  const test=STAGE_TESTS.find(test=>test.stage===stage && test.language===language);
  if(!test)throw Error('Unsupported provider stage test');return test;
}
export async function runStageTest(adapter,{stage,language}) {
  const test=stageTest(stage,language),base={fixtureVersion:STAGE_FIXTURE_VERSION,language,requestCount:test.maxRequests};
  if(stage==='translation') {
    const translated=translatedContent(await adapter.translate(source,language),language);
    translationCheck(await adapter.checkTranslation(source,translated,language));
    return {...base,capability:'synthetic-translation',model:adapter.provenance.textModel,
      checks:['structured_translation','automated_comparison'],outputHash:bundleHash(translated)};
  }
  const bytes=await adapter.speech(speech[language],language),info=inspectWav(bytes);
  if(info.durationSeconds<0.25)throw Error('Provider speech test too short');
  return {...base,capability:'synthetic-speech',model:adapter.provenance.speechModel,
    checks:['mono_pcm16_wav','nonempty_audio'],outputHash:info.sha256,bytes:info.bytes,durationSeconds:info.durationSeconds};
}
export function checkedStageResult(result,{stage,language,maxRequests},model) {
  const keys=['fixtureVersion','language','requestCount','capability','model','checks','outputHash',...(stage==='speech'?['bytes','durationSeconds']:[])].sort();
  if(!result || typeof result!=='object' || Object.keys(result).sort().join(',')!==keys.join(',')
    || result.fixtureVersion!==STAGE_FIXTURE_VERSION || result.language!==language || result.requestCount!==maxRequests
    || result.model!==model || result.capability!==`synthetic-${stage}` || !/^[a-f0-9]{64}$/.test(result.outputHash || '')
    || JSON.stringify(result.checks)!==JSON.stringify(stage==='translation'?['structured_translation','automated_comparison']:['mono_pcm16_wav','nonempty_audio'])
    || stage==='speech' && (!Number.isInteger(result.bytes) || result.bytes<8044 || result.bytes>2880044
      || !Number.isFinite(result.durationSeconds) || result.durationSeconds<0.25 || result.durationSeconds>90
      || result.bytes!==44+result.durationSeconds*32000))throw Error('Provider test evidence unavailable');
  return structuredClone(result);
}

export function stageVerificationPipeline(pipeline,tests) {
  return {...pipeline,stages:pipeline.stages.map(stage=>{
    const relevant=tests.filter(test=>test.stage===stage.id);
    if(!relevant.length || stage.configuration!=='configured' || relevant.some(test=>test.evidence && !stage.models.includes(test.evidence.model)))return stage;
    const states=relevant.map(test=>test.state),verification=states.every(state=>state==='verified')?'fixed_fixtures_passed'
      :states.includes('pending')?'pending':states.includes('uncertain')?'uncertain':states.includes('failed')?'failed'
        :states.includes('interrupted')?'interrupted':states.includes('verified')?'partially_tested':'not_tested';
    return {...stage,verification};
  })};
}
