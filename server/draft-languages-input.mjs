import {reviewRequestId,expectedRevision} from './briefing-input.mjs';
import {generationLanguages} from './settings-input.mjs';

export function draftLanguagesInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || input.confirmed!==true
    || Object.keys(input).some(key=>!['requestId','revision','generationLanguages','confirmed'].includes(key)))throw Error('Invalid draft languages request');
  reviewRequestId(input.requestId);expectedRevision(input.revision);
  return {revision:input.revision,generationLanguages:input.generationLanguages===null ? null : generationLanguages(input.generationLanguages),confirmed:true};
}
export const sameDraftLanguages=(a,b)=>JSON.stringify(draftLanguagesInput({...a,requestId:'00000000-0000-4000-8000-000000000000'}))===JSON.stringify(draftLanguagesInput({...b,requestId:'00000000-0000-4000-8000-000000000000'}));
