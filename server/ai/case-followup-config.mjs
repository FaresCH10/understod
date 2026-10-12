import {createGeminiAdapter} from './gemini.mjs';

// Explicit opt-in shares the existing synthetic adapter and request quota journal.
export function resolveCaseFollowup(env=process.env,{fetchImpl=fetch}={}) {
  const mode=env.UNDERSTOOD_CASE_FOLLOWUP_ADAPTER ?? 'disabled';
  if(mode==='disabled')return null;
  if(mode!=='gemini' || env.UNDERSTOOD_DATA_CLASS!=='synthetic')throw Error('Invalid follow-up adapter configuration');
  const options={apiKey:env.GEMINI_API_KEY,dataClass:'synthetic',fetchImpl};
  const adapter=createGeminiAdapter(options);
  return Object.freeze({...adapter,withJournal:requestJournal=>createGeminiAdapter({...options,requestJournal})});
}
