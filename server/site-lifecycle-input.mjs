import {siteAccessInput} from './site-input.mjs';

export function siteLifecycleInput(input) {
  if(!['active','archived'].includes(input?.state))throw Error('Invalid site lifecycle request');
  try{return {...siteAccessInput({...input,state:input.state==='archived'?'paused':'active'}),state:input.state};}
  catch{throw Error('Invalid site lifecycle request');}
}

// Active operational dependencies must be closed explicitly, not silently discarded by archive.
export const siteDependencies=[
  ['publications','published briefings',"state='published'"],
  ['publication_schedules','publication schedules',"state='queued'"],
  ['jobs','preparation jobs',"status IN ('queued','processing')"],
  ['assessment_jobs','answer checks',"status IN ('queued','processing')"],
  ['report_exports','report exports',"status IN ('queued','processing')"],
  ['recordings','unprocessed answers',"status IN ('storing','received','processing','blocked')"],
  ['source_audio_requests','source audio',"status IN ('storing','received','processing','blocked') AND NOT EXISTS(SELECT 1 FROM source_audio_purges p WHERE p.request_id=source_audio_requests.request_id AND p.status='complete')"],
  ['assignment_reminders','reminders',"state='queued'"],
  ['staff_invitations','staff invitations',"state='pending'"],
];

export const siteAdmissionTables=[
  ['workers','NEW.active'],['staff','NEW.active'],['crews','NEW.active'],['crew_memberships','true'],
  ['briefings','true'],['publications',"NEW.state='published'"],['assignments','true'],
  ['jobs',"NEW.status IN ('queued','processing')"],['assessment_jobs',"NEW.status IN ('queued','processing')"],
  ['recordings',"NEW.status IN ('storing','received','processing','blocked')"],
  ['source_audio_requests',"NEW.status IN ('storing','received','processing','blocked')"],
  ['publication_schedules',"NEW.state='queued'"],['assignment_reminders',"NEW.state='queued'"],
  ['staff_invitations',"NEW.state='pending'"],['report_exports',"NEW.status IN ('queued','processing')"],
  ['worker_grants','NEW.revoked_at IS NULL'],
  ['templates','true'],['template_versions','true'],['glossary_terms','true'],['glossary_versions','true'],
  ['site_settings','true'],['site_onboarding','true'],['recording_notices','true'],
];

export function archivedWriteAllowed(path,method) {
  if(['GET','HEAD','OPTIONS'].includes(method))return true;
  return path==='/api/settings/sites/lifecycle' || path==='/api/logout' || path==='/api/account/site'
    || path==='/api/retention' || /^\/api\/people\/workers\/[^/]+\/deletion$/.test(path);
}
