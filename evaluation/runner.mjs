import {bundleHash} from '../server/ai/prepared-bundle.mjs';
import {assessmentInputHash} from '../server/ai/assessment-config.mjs';
import {validatedAssessment} from '../server/postgres/assessment-worker.mjs';
import {EVALUATION_DATASETS} from './catalog.mjs';

export const OUTCOMES=Object.freeze(['matched','clarification','unassessable']);
export const FIXTURES=Object.freeze(['labeled_response','malformed_json','empty_response','blocked_response','http_error',
  'transport_error','missing_evidence','invented_quote','invalid_fact_index','invalid_reasons']);
const categories=['correct','paraphrase','dialect','missing_fact','shelf_swap','negation','location','contradiction',
  'ambiguity','unrelated','injection','silence','noise','unsupported_language','version_change','numbers','question_alignment','malformed_output','provider_error'];
const reasonCodes=['asked_facts_present','missing_asked_fact','contradictory_placement','uncertain_placement','empty_answer',
  'instruction_like_answer','unsupported_wording','unsupported_synthetic_rubric','synthetic_evidence_limit','invalid_input',
  'invalid_evidence','missing_evidence','unassessable_answer','untrusted_instruction','contradicted_fact','unrelated_answer',
  'uncertain_answer','unsupported_language','silent_answer','unintelligible_answer'];
const object=(value,keys)=>value && typeof value==='object' && !Array.isArray(value)
  && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
const text=(value,max)=>typeof value==='string' && value.trim().length>0 && value.length<=max;
const id=value=>typeof value==='string' && /^[a-z][a-z0-9-]{0,79}$/.test(value);
const freeze=value=>{if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

export function evaluationDataset(value) {
  if(!object(value,['schemaVersion','version','dataClass','labelProvenance','pilotTolerances','publications','samples'])
    || !['assessment-evaluation-dataset-v1','assessment-evaluation-dataset-v2'].includes(value.schemaVersion) || !id(value.version) || value.dataClass!=='synthetic'
    || !text(value.labelProvenance,300) || !object(value.pilotTolerances,['status']) || value.pilotTolerances.status!=='awaiting_agreement'
    || !Array.isArray(value.publications) || !value.publications.length || value.publications.length>30
    || !Array.isArray(value.samples) || !value.samples.length || value.samples.length>1000)throw Error('Invalid synthetic evaluation dataset');
  const publications=new Map(),samples=new Set();
  for(const publication of value.publications) {
    const localized=value.schemaVersion==='assessment-evaluation-dataset-v2';
    if(!object(publication,['id','version','source','question','askedFacts','languages',...(localized ? ['languageQuestions'] : [])]) || !id(publication.id) || publications.has(publication.id)
      || !Number.isSafeInteger(publication.version) || publication.version<1 || !text(publication.source,4000) || !text(publication.question,500)
      || !Array.isArray(publication.askedFacts) || !publication.askedFacts.length || publication.askedFacts.length>6
      || !publication.askedFacts.every(fact=>text(fact,500)) || new Set(publication.askedFacts).size!==publication.askedFacts.length
      || !Array.isArray(publication.languages) || !publication.languages.length || publication.languages.length>3
      || !publication.languages.every(language=>['en','ar','ur'].includes(language)) || new Set(publication.languages).size!==publication.languages.length)
      throw Error('Invalid evaluation publication');
    if(localized && (!object(publication.languageQuestions,publication.languages)
      || !publication.languages.every(language=>text(publication.languageQuestions[language],500)
        && (!['ar','ur'].includes(language) || /[\u0600-\u06ff]/.test(publication.languageQuestions[language])))
      || publication.languageQuestions.en!==publication.question))throw Error('Invalid localized evaluation questions');
    publications.set(publication.id,publication);
  }
  for(const sample of value.samples) {
    if(!object(sample,['id','language','publicationId','category','answer','expected','fixture']) || !id(sample.id) || samples.has(sample.id)
      || !publications.has(sample.publicationId) || !/^[a-z]{2}$/.test(sample.language || '') || !categories.includes(sample.category)
      || typeof sample.answer!=='string' || sample.answer.length>2000 || !OUTCOMES.includes(sample.expected) || !FIXTURES.includes(sample.fixture)
      || (!publications.get(sample.publicationId).languages.includes(sample.language)
        && (sample.category!=='unsupported_language' || sample.expected!=='unassessable')))throw Error('Invalid evaluation sample');
    samples.add(sample.id);
  }
  if(EVALUATION_DATASETS[value.version]!==bundleHash(value))throw Error('Invalid evaluation dataset version/content hash');
  return freeze(structuredClone(value));
}

export function sampleInput(dataset,sample) {
  const publication=dataset.publications.find(item=>item.id===sample.publicationId);
  if(!publication)throw Error('Evaluation publication unavailable');
  return freeze({answer:sample.answer,question:publication.languageQuestions?.[sample.language] ?? publication.question,askedFacts:[...publication.askedFacts],language:sample.language,
    publicationId:publication.id,version:publication.version});
}

export function evaluationProvenance(value) {
  if(!object(value,['adapter','dataClass','model','promptVersion','schemaVersion']) || value.dataClass!=='synthetic'
    || !['adapter','model','promptVersion','schemaVersion'].every(key=>typeof value[key]==='string' && /^[a-z0-9][a-z0-9._-]{0,99}$/.test(value[key])))
    throw Error('Invalid evaluation provenance');
  return freeze(structuredClone(value));
}

const rate=(count,denominator)=>({count,denominator,rate:denominator ? count/denominator : null});
export function evaluationMetrics(rows) {
  const confusion=Object.fromEntries(OUTCOMES.map(expected=>[expected,Object.fromEntries([...OUTCOMES,'unresolved','not_run'].map(actual=>[actual,0]))]));
  for(const row of rows)confusion[row.expected][row.status==='not_run' ? 'not_run' : row.actual ?? 'unresolved']++;
  const assessed=rows.filter(row=>row.status==='completed'),positive=assessed.filter(row=>row.expected==='matched'),negative=assessed.filter(row=>row.expected!=='matched');
  return {total:rows.length,completed:assessed.length,failed:rows.filter(row=>row.status==='failed').length,notRun:rows.filter(row=>row.status==='not_run').length,
    outcomeDisagreements:assessed.filter(row=>row.expected!==row.actual).length,
    falseMatches:rate(negative.filter(row=>row.actual==='matched').length,negative.length),
    falseClarifications:rate(positive.filter(row=>row.actual==='clarification').length,positive.length),
    falseUnassessable:rate(positive.filter(row=>row.actual==='unassessable').length,positive.length),
    unassessable:assessed.filter(row=>row.actual==='unassessable').length,
    unresolvedExpectedMatches:rows.filter(row=>row.expected==='matched' && row.status==='failed').length,
    confusion};
}

export async function evaluateDataset(value,{mode,provenance,evaluate,now=()=>new Date().toISOString()}={}) {
  const dataset=evaluationDataset(value),base=evaluationProvenance(provenance);
  if(!['synthetic-local','mocked-gemini-contract','observed-runtime'].includes(mode) || typeof evaluate!=='function')throw Error('Invalid evaluation mode');
  const startedAt=now(),results=[];
  for(const sample of dataset.samples) {
    let input=sampleInput(dataset,sample);const publication=dataset.publications.find(item=>item.id===sample.publicationId);
    const observation=await evaluate({sample,input,publication});
    if(!observation || !['completed','failed','not_run'].includes(observation.status)
      || (observation.status!=='completed' && !['provider_error','invalid_output','unsupported_local_rubric','fault_not_applicable','observation_missing','runtime_pending','runtime_failed','runtime_blocked'].includes(observation.diagnostic)))
      throw Error('Invalid evaluation observation');
    if(observation.runtimePublicationId!==undefined) {
      if(mode!=='observed-runtime' || typeof observation.runtimePublicationId!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(observation.runtimePublicationId))
        throw Error('Invalid runtime evaluation publication');
      input=freeze({...input,publicationId:observation.runtimePublicationId});
    }
    const row={id:sample.id,language:sample.language,category:sample.category,expected:sample.expected,status:observation.status,actual:null,
      inputHash:assessmentInputHash(input),datasetPublicationId:sample.publicationId,publicationId:input.publicationId,version:input.version,questionHash:bundleHash(input.question),
      rubricHash:bundleHash(input.askedFacts),sourceHash:bundleHash(publication.source),
      provenance:observation.provenance ? evaluationProvenance(observation.provenance) : base,diagnostic:observation.diagnostic ?? null,
      reasonCodes:[],resultHash:null,evidenceHash:null,evidenceCount:0,contractPassed:typeof observation.contractPassed==='boolean' ? observation.contractPassed : null};
    if(observation.transcriptionEvidence!==undefined) {
      const evidence=observation.transcriptionEvidence;
      if(mode!=='observed-runtime' || observation.status!=='completed' || !object(evidence,['inputHash','provenance'])
        || typeof evidence.inputHash!=='string' || !/^[a-f0-9]{64}$/.test(evidence.inputHash))throw Error('Invalid transcription evidence');
      row.transcriptionEvidence={inputHash:evidence.inputHash,provenance:evaluationProvenance(evidence.provenance)};
    }
    if(observation.status==='completed') {
      // Use the same exact-substring/fact-index checks as the PostgreSQL completion boundary.
      const result=validatedAssessment(observation.assessment,input.answer,input.askedFacts);
      row.actual=result.outcome;row.resultHash=bundleHash(result);row.evidenceHash=bundleHash(result.evidence);row.evidenceCount=result.evidence.length;
      row.reasonCodes=[...new Set(result.reasons.map(reason=>reasonCodes.includes(reason) ? reason : 'unrecognized_reason'))];
    }
    results.push(row);
  }
  const grouped=key=>Object.fromEntries([...new Set(results.map(row=>row[key]))].sort().map(name=>[name,evaluationMetrics(results.filter(row=>row[key]===name))]));
  const contractRows=results.filter(row=>row.contractPassed!==null);
  const semanticIds=new Set(dataset.samples.filter(sample=>sample.fixture==='labeled_response').map(sample=>sample.id));
  const semanticRows=results.filter(row=>semanticIds.has(row.id)),faultRows=results.filter(row=>!semanticIds.has(row.id));
  return freeze({schemaVersion:'assessment-evaluation-report-v1',datasetVersion:dataset.version,datasetHash:bundleHash(dataset),dataClass:'synthetic',
    labelProvenance:dataset.labelProvenance,mode,provenance:base,startedAt,finishedAt:now(),
    pilotAcceptance:{status:'not_evaluated',toleranceAgreement:'awaiting_agreement',independentLanguageQa:'not_provided',realDataAllowed:false},
    metrics:evaluationMetrics(results),byLanguage:grouped('language'),byCategory:grouped('category'),
    semanticMetrics:evaluationMetrics(semanticRows),faultMetrics:evaluationMetrics(faultRows),
    byModel:Object.fromEntries([...new Set(results.map(row=>row.provenance.model))].sort().map(model=>[model,evaluationMetrics(results.filter(row=>row.provenance.model===model))])),
    evidenceLimits:{providerTransport:'not_verified',semanticAccuracyClaim:false,hardwareAudio:'not_tested',
      faultSamples:'Mocked protocol faults; not observations of real provider error frequency'},
    contractChecks:{total:contractRows.length,passed:contractRows.filter(row=>row.contractPassed).length,failed:contractRows.filter(row=>!row.contractPassed).length},results});
}
