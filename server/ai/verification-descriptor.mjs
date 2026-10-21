import {GEMINI_MODELS} from './gemini.mjs';
import {createHash} from 'node:crypto';
import {STAGE_FIXTURE_VERSION,stageFixtureHash} from './provider-stage-verification.mjs';

export const verificationCapabilityHash=createHash('sha256').update(JSON.stringify([GEMINI_MODELS,STAGE_FIXTURE_VERSION,stageFixtureHash])).digest('hex');
export function registeredVerificationDescriptor(fingerprint) {
  return providerVerificationDescriptor({fingerprint,metadata:{provider:'Gemini Free',credentialsConfigured:true,testEnabled:true,
    dataClass:'synthetic',realDataAllowed:false,models:GEMINI_MODELS,declaredTextLanguages:['en','ar','ur'],declaredSpeechLanguages:['en','ar']}});
}

export function providerVerificationDescriptor(config) {
  const metadata=config?.metadata;
  if(!/^[a-f0-9]{64}$/.test(config?.fingerprint || '') || !metadata || metadata.provider!=='Gemini Free'
    || metadata.credentialsConfigured!==true || metadata.testEnabled!==true || metadata.dataClass!=='synthetic' || metadata.realDataAllowed!==false
    || Object.keys(metadata).sort().join(',')!=='credentialsConfigured,dataClass,declaredSpeechLanguages,declaredTextLanguages,models,provider,realDataAllowed,testEnabled'
    || !metadata.models || Object.keys(metadata.models).sort().join(',')!=='speech,text,transcription'
    || Object.entries(GEMINI_MODELS).some(([key,value])=>metadata.models[key]!==value)
    || JSON.stringify(metadata.declaredTextLanguages)!=='["en","ar","ur"]' || JSON.stringify(metadata.declaredSpeechLanguages)!=='["en","ar"]')
    throw Error('Provider verification unavailable');
  return Object.freeze({dispatch:'worker',fingerprint:config.fingerprint,metadata:Object.freeze({...metadata,models:GEMINI_MODELS,
    declaredTextLanguages:Object.freeze(['en','ar','ur']),declaredSpeechLanguages:Object.freeze(['en','ar'])})});
}
export function checkedVerificationDescriptor(value) {
  if(!value || Object.keys(value).sort().join(',')!=='dispatch,fingerprint,metadata' || value.dispatch!=='worker')throw Error('Provider verification unavailable');
  return providerVerificationDescriptor(value);
}
