import {createGeminiAdapter,GEMINI_MODELS,GEMINI_ASSESSMENT_VERSION} from '../server/ai/gemini.mjs';
import {syntheticAssessmentAdapter} from '../server/postgres/runtime.mjs';
import {validatedAssessment} from '../server/postgres/assessment-worker.mjs';
import {bundleHash} from '../server/ai/prepared-bundle.mjs';
import {assessmentInputHash} from '../server/ai/assessment-config.mjs';
import {evaluationProvenance} from './runner.mjs';

export const LOCAL_PROVENANCE=Object.freeze({adapter:'synthetic-local-v1',dataClass:'synthetic',model:'none',promptVersion:'synthetic-shelf-v1',schemaVersion:'synthetic-shelf-v1'});
export const GEMINI_PROVENANCE=Object.freeze({adapter:'gemini-typed-assessment-v1',dataClass:'synthetic',model:GEMINI_MODELS.text,
  promptVersion:GEMINI_ASSESSMENT_VERSION,schemaVersion:GEMINI_ASSESSMENT_VERSION});

export async function evaluateLocal({sample,input}) {
  if(sample.fixture!=='labeled_response')return {status:'not_run',diagnostic:'fault_not_applicable'};
  if(input.askedFacts.join('|')!=='finished -> blue shelf|unfinished -> yellow shelf')return {status:'not_run',diagnostic:'unsupported_local_rubric'};
  return {status:'completed',assessment:await syntheticAssessmentAdapter.assess(input.answer,input.question,input.askedFacts)};
}

export function createContractEvaluator({onRequest=()=>{}}={}) {
  return async ({sample,input})=>{
    let requests=0,requestValidated=false;
    // Engineering-label responses test transport/validation, never semantic accuracy.
    const labeled={outcome:sample.expected,reasons:[sample.expected==='matched' ? 'asked_facts_present' : sample.expected==='clarification' ? 'missing_asked_fact' : 'unassessable_answer'],
      evidence:sample.expected==='matched' ? input.askedFacts.map((_,factIndex)=>({factIndex,quote:input.answer})) : []};
    const fixture=sample.fixture;
    const adapter=createGeminiAdapter({apiKey:'synthetic-evaluation-mock-only',dataClass:'synthetic',fetchImpl:async(url,options)=>{
      requests++;const request=JSON.parse(options.body),sent=JSON.parse(request.contents[0].parts[0].text);
      if(requests!==1 || url!==`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS.text}:generateContent`
        || bundleHash(sent)!==bundleHash({answer:input.answer,question:input.question,askedFacts:input.askedFacts}))throw Error('Evaluation request mismatch');
      requestValidated=true;
      onRequest({sampleId:sample.id,inputHash:assessmentInputHash(input)});
      if(fixture==='transport_error')throw Error('Synthetic transport failure');
      if(fixture==='http_error')return new Response('',{status:429});
      const result=structuredClone(labeled);
      if(fixture==='missing_evidence')result.evidence=[];
      if(fixture==='invented_quote')result.evidence[0].quote='Invented quote never spoken';
      if(fixture==='invalid_fact_index')result.evidence[0].factIndex=input.askedFacts.length;
      if(fixture==='invalid_reasons')result.reasons=null;
      return Response.json({candidates:[{finishReason:fixture==='blocked_response' ? 'SAFETY' : 'STOP',content:{parts:fixture==='empty_response' ? []
        : [{text:fixture==='malformed_json' ? '{invalid' : JSON.stringify(result)}]}}]});
    }});
    try {
      const assessment=validatedAssessment(await adapter.assess(input.answer,input.question,input.askedFacts),input.answer,input.askedFacts);
      const expected=fixture==='labeled_response' ? input.answer.trim() ? sample.expected : 'unassessable' : 'unassessable';
      return {status:'completed',assessment,contractPassed:assessment.outcome===expected && requests===(input.answer.trim() ? 1 : 0)
        && (requests===0 || requestValidated)};
    }catch {
      const providerError=['http_error','transport_error'].includes(fixture);
      return {status:'failed',diagnostic:providerError ? 'provider_error' : 'invalid_output',
        contractPassed:['http_error','transport_error','malformed_json','empty_response','blocked_response','invalid_reasons'].includes(fixture) && requests===1 && requestValidated};
    }
  };
}

export function observedEvaluator(observations) {
  if(!Array.isArray(observations) || observations.length>1000)throw Error('Invalid runtime observations');
  const records=new Map();
  for(const record of observations) {
    if(!record || typeof record.id!=='string' || records.has(record.id) || !/^[a-f0-9]{64}$/.test(record.inputHash || '')
      || !['completed','failed','pending','blocked'].includes(record.status)
      || (record.publicationId!==undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(record.publicationId)))throw Error('Invalid runtime observation');
    evaluationProvenance(record.provenance);records.set(record.id,structuredClone(record));
  }
  return async({sample,input})=>{
    if(sample.fixture!=='labeled_response')return {status:'not_run',diagnostic:'fault_not_applicable'};
    const record=records.get(sample.id);
    if(!record)return {status:'not_run',diagnostic:'observation_missing'};
    const runtimePublicationId=record.publicationId ?? input.publicationId;
    if(record.inputHash!==assessmentInputHash({...input,publicationId:runtimePublicationId}))throw Error('Runtime observation does not match exact evaluation input');
    if(record.status!=='completed')return {status:record.status==='pending' ? 'not_run' : 'failed',diagnostic:`runtime_${record.status}`,provenance:record.provenance,runtimePublicationId};
    return {status:'completed',assessment:record.assessment,provenance:record.provenance,runtimePublicationId,
      ...(record.transcriptionEvidence!==undefined ? {transcriptionEvidence:record.transcriptionEvidence} : {})};
  };
}
