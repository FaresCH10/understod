import {bindOfflineSession,browserOfflineStore,fetchOfflineBriefing,readBoundOfflineBundle,saveOfflineBriefing} from '../../src/worker-offline';
import {browserAudioDraftFor,readAudioOutbox,saveAudioDraft} from '../../src/worker-audio-draft';
import {encodeWav} from '../../src/audio';
import {clearWorkerLocalData} from '../../src/worker-local-data';
import {allowPrivateDevice,privateDeviceAllowed} from '../../src/worker-device-policy';

const button=document.querySelector<HTMLButtonElement>('#run')!,result=document.querySelector<HTMLElement>('#result')!;
function check(value:unknown,message:string){if(!value)throw Error(message);}
document.querySelector<HTMLButtonElement>('#clear')!.addEventListener('click',async()=>{try{check(await clearWorkerLocalData(),'Synthetic fixture cleanup failed');button.disabled=false;result.textContent='Previous synthetic private fixture data removed.';}catch{result.textContent='FAIL: synthetic cleanup could not be verified.';}});
button.addEventListener('click',async()=>{
  button.disabled=true;result.textContent='Checking native encrypted storage...';
  try{
    const session=await (await fetch('/api/session',{credentials:'include',cache:'no-store'})).json();
    check(!privateDeviceAllowed(session.clientContext),'Fresh tab must default to shared mode');allowPrivateDevice(session);check(privateDeviceAllowed(session.clientContext),'Explicit private choice failed');
    check(!await browserOfflineStore.read(),'Remove prior synthetic cache before running this disposable fixture');check((await readAudioOutbox(session)).length===0,'Remove prior synthetic recordings first');
    const detail=await (await fetch('/api/worker/briefings/assignment-30',{credentials:'include',cache:'no-store'})).json(),scope={assignmentId:detail.id,publicationId:detail.publicationId,version:detail.version,language:detail.language};
    const item=await fetchOfflineBriefing(fetch,session,scope);await saveOfflineBriefing(session,item,true);bindOfflineSession(session);
    const stored=await browserOfflineStore.read(),saved=await readBoundOfflineBundle();check(stored && !stored.key.extractable && saved?.briefings[0].audio.body && saved.briefings[0].audio.question,'Native private audio/cache readback failed');
    const samples=Float32Array.from({length:16000},(_,i)=>Math.sin(i/10)*.5),bytes=encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>samples});
    await saveAudioDraft(await browserAudioDraftFor(scope),session,scope,{bytes,submissionId:crypto.randomUUID(),capturedAt:new Date().toISOString()},true);
    const queue=await readAudioOutbox(session);check(queue.length===1 && queue[0].draft.bytes.every((byte,index)=>byte===bytes[index]),'Offline recording readback changed');
    const evidence=await (await fetch('/qa/evidence')).json();check(evidence.workerMutationPosts===0 && evidence.recordings===0 && evidence.answerReceipts===0,'Saving local work mutated server response state');
    result.textContent=JSON.stringify({result:'PASS',nativeIndexedDB:true,nonextractableKey:true,textAndBothAudio:true,sameTabLease:true,exactRecording:true,microphoneRequested:false,...evidence},null,2);document.querySelector<HTMLAnchorElement>('#open')!.hidden=false;
  }catch(error){result.textContent=`FAIL: ${error instanceof Error?error.message:'Unknown failure'}`;}
});
