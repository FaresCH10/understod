import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {neonTestConnection} from './neon-test-config.mjs';
import {neonTestRoles} from './neon-role-check.mjs';

function bounded(promise,milliseconds){
  let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Synthetic worker wait expired')),milliseconds);})]).finally(()=>clearTimeout(timer));
}
export async function interruptNeonAssessment(env,{runId,schema,jobId},{spawnWorker=fork}={}){
  neonTestConnection(env);neonTestRoles(runId);assert.equal(schema,'understood_neon_test_'+runId.replaceAll('-',''));
  assert.match(jobId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  const childEnv={UNDERSTOOD_NEON_TEST_URL:env.UNDERSTOOD_NEON_TEST_URL,UNDERSTOOD_NEON_TEST_ISOLATED:'true',UNDERSTOOD_NEON_WORKER_CHILD_RUN:runId};
  for(const key of ['PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])if(process.env[key])childEnv[key]=process.env[key];
  const child=spawnWorker(new URL('./neon-interrupted-worker.mjs',import.meta.url),[runId,jobId],{env:childEnv,execArgv:[],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  let closed=false;const exit=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;resolve({code,signal});}));
  try{
    await bounded(new Promise((resolve,reject)=>{
      child.once('error',()=>reject(Error('Synthetic worker could not start')));
      child.once('exit',()=>reject(Error('Synthetic worker exited before interruption')));
      child.on('message',message=>{
        if(message?.type==='claimed' && message.runId===runId && message.jobId===jobId && message.pid===child.pid)resolve();
        else if(message?.type==='failed')reject(Error('Synthetic worker claim unavailable'));
      });
    }),30000);
    assert.equal(child.kill('SIGKILL'),true);
    await bounded(exit,10000);
    return {kind:'owned-process-interruption',childExited:true,signalRequested:'SIGKILL',processDeathVerified:true};
  }finally{
    // Only the process handle created above can be stopped; no PID lookup or other process is targeted.
    if(!closed){child.kill('SIGKILL');await bounded(exit,10000);}
  }
}
