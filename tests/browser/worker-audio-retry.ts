import {createRecordingSubmission,encodeWav} from '../../src/audio';
import {sendWorkerRecording,WorkerAudioRetryError,type RecordingScope} from '../../src/worker-audio-retry';
import type {PageSession} from '../../src/session-state';
import {browserAudioDraftStore,browserAudioDraftFor,browserAudioOutbox,saveAudioDraft,readAudioDraft,readAudioOutbox,clearAudioDraft} from '../../src/worker-audio-draft';
import {allowPrivateDevice} from '../../src/worker-device-policy';

const button=document.querySelector<HTMLButtonElement>('#run')!;
const status=document.querySelector<HTMLElement>('#result')!;
const require=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='Checking synthetic audio...';
  let context:AudioContext|undefined;
  try {
    const session=await (await fetch('/api/session',{cache:'no-store',credentials:'include'})).json() as PageSession;
    allowPrivateDevice(session);
    const detail=await (await fetch('/api/worker/briefings/assignment-30',{cache:'no-store',credentials:'include',headers:{'x-client-session-context':session.clientContext!}})).json();
    const scope:RecordingScope={assignmentId:detail.id,publicationId:detail.publicationId,version:detail.version,language:detail.language};
    context=new AudioContext();
    const synthetic=context.createBuffer(1,16000,16000);
    synthetic.getChannelData(0).set(Float32Array.from({length:16000},(_,i)=>Math.sin(i/10)*.5));
    const source=new Blob([new Uint8Array(encodeWav(synthetic))],{type:'audio/wav'});
    let decodes=0,posts=0;
    const submission=createRecordingSubmission(source,crypto.randomUUID(),async blob=>{
      decodes++;return context!.decodeAudioData(await blob.arrayBuffer());
    });
    const send:typeof fetch=async(path,options)=>{if(options?.method==='POST')posts++;return fetch(path,options);};
    const original=await submission.bytes();
    require((await browserAudioOutbox.entries()).length===0,'Remove earlier synthetic fixture recordings before rerunning');
    const large=encodeWav({duration:90,sampleRate:16000,numberOfChannels:1,getChannelData:()=>Float32Array.from({length:1440000},(_,i)=>Math.sin(i/10)*.5)});
    for(let i=0;i<9;i++){
      const scoped={...scope,assignmentId:`synthetic-limit-${i}`};
      await saveAudioDraft(await browserAudioDraftFor(scoped),session,scoped,{bytes:large,submissionId:crypto.randomUUID(),capturedAt:submission.capturedAt},true);
    }
    let byteLimit=false;const overflow={...scope,assignmentId:'synthetic-byte-overflow'};
    try{await saveAudioDraft(await browserAudioDraftFor(overflow),session,overflow,{bytes:large,submissionId:crypto.randomUUID(),capturedAt:submission.capturedAt},true);}catch{byteLimit=true;}
    require(byteLimit && (await readAudioOutbox(session)).length===9,'Native byte limit did not preserve existing recordings');
    await clearAudioDraft();require((await browserAudioOutbox.entries()).length===0,'Queue-wide purge failed');
    await saveAudioDraft(browserAudioDraftStore,session,scope,{bytes:original,submissionId:submission.submissionId,capturedAt:submission.capturedAt},true);
    const stored=await browserAudioDraftStore.read();
    require(stored && !stored.key.extractable && stored.ciphertext.byteLength>original.length,'Native encrypted storage not confirmed');
    const restored=await readAudioDraft(browserAudioDraftStore,session,scope);
    require(restored.status==='saved' && restored.draft.submissionId===submission.submissionId && restored.draft.bytes.every((value,i)=>value===original[i]),'Stored identity or bytes changed');
    require(posts===0,'Saving unexpectedly uploaded audio');
    const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(original));
    try {
      await sendWorkerRecording(send,session,scope,original,submission.submissionId);
      throw Error('Expected a lost acknowledgement');
    }catch(error){require(error instanceof WorkerAudioRetryError && error.code==='receipt','Expected uncertain acceptance');}
    original.fill(0);
    const recovery=await readAudioDraft(browserAudioDraftStore,session,scope);
    require(recovery.status==='saved','Browser recovery unavailable');
    const retry=recovery.status==='saved'?recovery.draft.bytes:await submission.bytes();
    const retryDigest=new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(retry)));
    require(new Uint8Array(digest).every((value,i)=>value===retryDigest[i]),'Retry bytes changed');
    const receipt=await sendWorkerRecording(send,session,scope,retry,submission.submissionId);
    require(receipt.requestId===submission.submissionId && receipt.duplicate===true,'Original receipt not recovered');
    const evidence=await (await fetch('/api/qa-audio-evidence',{cache:'no-store'})).json();
    require(decodes===1 && posts===1 && evidence.posts===1 && evidence.recordings===1 && evidence.receipts===1 && evidence.state==='withdrawn','Unexpected duplicate or publication state');
    for(let i=0;i<9;i++){
      const scoped={...scope,assignmentId:`synthetic-queued-${i}`};
      await saveAudioDraft(await browserAudioDraftFor(scoped),session,scoped,{bytes:retry,submissionId:crypto.randomUUID(),capturedAt:submission.capturedAt},true);
    }
    let countLimit=false;const extra={...scope,assignmentId:'synthetic-count-overflow'};
    try{await saveAudioDraft(await browserAudioDraftFor(extra),session,extra,{bytes:retry,submissionId:crypto.randomUUID(),capturedAt:submission.capturedAt},true);}catch{countLimit=true;}
    require(countLimit && (await readAudioOutbox(session)).length===10,'Native recording count limit failed');
    for(let i=1;i<9;i++)await clearAudioDraft(await browserAudioDraftFor({...scope,assignmentId:`synthetic-queued-${i}`}));
    require((await readAudioOutbox(session)).length===2,'Individual removal affected another queued recording');
    status.textContent=JSON.stringify({result:'PASS',nativeDecodes:decodes,clientPosts:posts,originalReceipt:true,identicalBytes:true,nativeIndexedDB:true,nonextractableKey:true,savingPosts:0,microphoneRequested:false,byteLimit,countLimit,outboxItems:2,individualRemoval:true,...evidence},null,2);
    document.querySelector<HTMLAnchorElement>('#open')!.hidden=false;
    document.querySelector<HTMLButtonElement>('#clear')!.hidden=false;
  }catch(error){status.textContent=`FAIL: ${error instanceof Error?error.message:'Unknown failure'}`;}
  finally{await context?.close().catch(()=>{});}
});
document.querySelector<HTMLButtonElement>('#clear')!.addEventListener('click',async()=>{
  try {await clearAudioDraft();require((await browserAudioOutbox.entries()).length===0,'Saved recordings remain');status.textContent+='\nNative saved audio removed.';}
  catch {status.textContent+='\nFAIL: removal could not be confirmed.';}
});
