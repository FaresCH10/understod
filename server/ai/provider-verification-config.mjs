import {createHash} from 'node:crypto';
import {CANONICAL_SOURCE} from '../domain.mjs';
import {createGeminiAdapter,GEMINI_MODELS} from './gemini.mjs';
import {STAGE_FIXTURE_VERSION,stageFixtureHash,runStageTest} from './provider-stage-verification.mjs';

export function resolveProviderVerification(env=process.env,{fetchImpl=fetch}={}) {
  const mode=env.UNDERSTOOD_PROVIDER_TESTS ?? 'disabled',apiKey=env.GEMINI_API_KEY,configured=typeof apiKey==='string' && !!apiKey.trim();
  if(!['disabled','gemini-free'].includes(mode))throw Error('Invalid provider verification mode');
  if(mode!=='disabled' && (!configured || env.UNDERSTOOD_TIER!=='local' || env.UNDERSTOOD_AI_MODE!=='synthetic' || env.UNDERSTOOD_DATA_CLASS!=='synthetic' || env.UNDERSTOOD_ACCESS_MODE!=='credential'))throw Error('Provider verification requires an isolated synthetic credential runtime');
  const fingerprint=createHash('sha256').update(JSON.stringify([mode,configured?apiKey:null,GEMINI_MODELS,STAGE_FIXTURE_VERSION,stageFixtureHash])).digest('hex');
  const metadata=Object.freeze({provider:'Gemini Free',credentialsConfigured:configured,testEnabled:mode==='gemini-free',dataClass:'synthetic',realDataAllowed:false,
    models:GEMINI_MODELS,declaredTextLanguages:['en','ar','ur'],declaredSpeechLanguages:['en','ar']});
  return Object.freeze({metadata,fingerprint,...(mode==='gemini-free'?{async run(journal){
    await createGeminiAdapter({apiKey,dataClass:'synthetic',fetchImpl,requestJournal:journal}).prepare(CANONICAL_SOURCE);
    return {capability:'synthetic-text-preparation',model:GEMINI_MODELS.text};
  },async runStage(test,journal){
    return runStageTest(createGeminiAdapter({apiKey,dataClass:'synthetic',fetchImpl,requestJournal:journal}),test);
  }}:{})});
}
