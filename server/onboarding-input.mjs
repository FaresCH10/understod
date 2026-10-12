import {reviewRequestId} from './briefing-input.mjs';

export const onboardingSteps=['organization','team','languages','provider','access','briefing'];
export function onboardingInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || input.confirmed!==true
    || Object.keys(input).some(key=>!['requestId','revision','step','firstBriefingId','confirmed'].includes(key))
    || !Number.isSafeInteger(input.revision) || input.revision<0 || input.revision>1000000000 || !onboardingSteps.includes(input.step)
    || !(input.firstBriefingId===null || typeof input.firstBriefingId==='string' && input.firstBriefingId.length>0 && input.firstBriefingId.length<=100 && !/[\x00-\x1f\x7f]/.test(input.firstBriefingId)))throw Error('Invalid onboarding request');
  reviewRequestId(input.requestId);
  return {revision:input.revision,step:input.step,firstBriefingId:input.firstBriefingId,confirmed:true};
}
export const onboardingTechnical=()=>({processing:'synthetic-only',liveReady:false,realDataAllowed:false,
  reason:'Live transcription, translation, speech and answer checking have not been verified for production. Gemini free tier is restricted to synthetic data.'});
export const sameOnboarding=(a,b)=>Object.keys(a).length===Object.keys(b).length && Object.keys(b).every(key=>a[key]===b[key]);
export function onboardingModel(context,state,resources) {
  const technical=onboardingTechnical();
  return {revision:state?.revision ?? 0,step:state?.step ?? 'organization',firstBriefingId:state?.first_briefing_id ?? null,
    organization:context.organization,site:context.site,resources,technical,
    savedTechnical:state?.technical_json ? typeof state.technical_json==='string'?JSON.parse(state.technical_json):state.technical_json:null,
    checks:{organization:!!context.organization.name && !!context.site.name && !!context.site.timezone,
      support:!!context.organization.supportEmail,supervisor:context.site.primaryContact?.available===true,
      languages:context.site.generationLanguages.length>0,provider:technical.liveReady,
      access:resources.workers>0 && resources.activeGrants>0,briefing:!!resources.firstBriefing && resources.firstBriefing.publicationState==='published'},
    canWrite:context.canWrite};
}
