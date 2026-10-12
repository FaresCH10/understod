import {GEMINI_MODELS} from './gemini.mjs';

const methods=(handle,names)=>names.every(name=>typeof handle?.[name]==='function');
const synthetic=handle=>handle?.provenance?.dataClass==='synthetic';
const bundle=handle=>synthetic(handle) && handle.provenance.adapter==='gemini-bundle-v1';
const textLanguages=Object.freeze(['en','ar','ur']);
const speechLanguages=Object.freeze(['en','ar']);

// Project only known runtime contracts. Never serialize handles, credentials or input allowlists.
export function pipelineStatus(config={}) {
  const preparation=config.preparationAdapter,source=config.sourceAdapter,recording=config.recordingAdapter,
    assessment=config.assessmentAdapter,followup=config.caseFollowupAdapter;
  const prepared=bundle(preparation) && methods(preparation,['prepare','checkPreparation','translate','checkTranslation','speech','permitsPreparation','withJournal']);
  const rows=[
    ['source','Source transcription',synthetic(source) && source.provenance.adapter==='gemini-source-allowlist-v1' && methods(source,['transcribe','permitsSourceAudio','withJournal']),[GEMINI_MODELS.transcription],[],
      'Exact synthetic WAV allowlist, current source authority and request quotas required. Transcription language coverage is unverified.'],
    ['preparation','Content preparation',prepared,[GEMINI_MODELS.text],textLanguages,
      'Exact complete-input allowlist, current requester authority and request quotas required.'],
    ['translation','Translation',prepared,[GEMINI_MODELS.text],textLanguages,
      'Generated text and question must pass structured completeness checks. Declared language support is not an accuracy evaluation.'],
    ['speech','Generated speech',prepared,[GEMINI_MODELS.speech],speechLanguages,
      'Private WAV generation and exact readback required. Urdu speech is unsupported by this adapter.'],
    ['assessment','Typed answer checking',synthetic(assessment) && assessment.provenance.adapter==='gemini-typed-assessment-v1' && methods(assessment,['assess','permitsAssessment','withJournal']),[GEMINI_MODELS.text],textLanguages,
      'Exact answer/question/frozen-rubric allowlist, active worker, current job and request quotas required.'],
    ['recording','Recorded answer checking',synthetic(recording) && recording.provenance.adapter==='gemini-recording-allowlist-v1' && methods(recording,['transcribe','assess','permitsRecording','withJournal']),[GEMINI_MODELS.transcription,GEMINI_MODELS.text],[],
      'Exact synthetic WAV allowlist, active worker and separate transcription/assessment quotas required. Audio language coverage is unverified.'],
    ['followup','Clarification follow-up',bundle(followup) && methods(followup,['prepare','translate','speech','withJournal']),[GEMINI_MODELS.text,GEMINI_MODELS.speech],speechLanguages,
      'Scoped staff request, current case authority and request quotas required. Urdu audio follow-up is unsupported.'],
  ];
  return Object.freeze({dataClass:'synthetic',realDataAllowed:false,productionReady:false,
    stages:Object.freeze(rows.map(([id,name,enabled,models,languages,evidence])=>Object.freeze({id,name,
      configuration:enabled?'configured':'disabled',verification:'not_tested',
      models:Object.freeze(enabled?[...models]:[]),declaredLanguages:Object.freeze(enabled?[...languages]:[]),
      evidence:enabled?evidence:'Provider stage is disabled. Local synthetic fixtures are not live provider evidence.'}))) });
}
