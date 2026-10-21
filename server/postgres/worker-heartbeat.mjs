export async function startWorkerHeartbeat(publish,snapshot,{intervalMs=5000,onFailure=()=>{}}={}) {
  if(typeof publish!=='function' || typeof snapshot!=='function' || typeof onFailure!=='function'
    || !Number.isInteger(intervalMs) || intervalMs<10 || intervalMs>10000)throw Error('Invalid worker heartbeat');
  let timer=null,inFlight=null,closing=false,failed=false,stopPromise;
  const failure=()=>{
    if(failed)return;failed=true;
    try{onFailure();}catch{}
  };
  const current=()=>publish(snapshot());
  function schedule(){
    if(closing || failed)return;
    timer=setTimeout(()=>{
      timer=null;
      inFlight=Promise.resolve().then(current).catch(failure).finally(()=>{inFlight=null;schedule();});
    },intervalMs);
    timer.unref?.();
  }
  try{await current();}catch{failure();throw Error('Worker heartbeat unavailable');}
  schedule();
  return {
    assertHealthy(){if(failed || closing)throw Error('Worker heartbeat unavailable');},
    stop(finalSnapshot){
      if(stopPromise)return stopPromise;
      // Drain the last publication before the terminal write; never let a late beat reopen it.
      closing=true;clearTimeout(timer);
      const pending=inFlight;
      stopPromise=(async()=>{
        if(pending)await pending;
        try{await publish(typeof finalSnapshot==='function'?finalSnapshot():finalSnapshot);}catch{throw Error('Worker heartbeat stop unavailable');}
      })();
      return stopPromise;
    },
  };
}
