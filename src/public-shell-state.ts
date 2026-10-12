export function publicShellReady(worker:Pick<ServiceWorker,'postMessage'>,repair=false,timeoutMs=5000):Promise<boolean>{
  return new Promise(resolve=>{
    const channel=new MessageChannel();let settled=false;
    const finish=(ready:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(ready);};
    const timer=setTimeout(()=>finish(false),timeoutMs);
    channel.port1.onmessage=event=>finish(event.data?.type==='understood-shell-status' && event.data.ready===true);
    channel.port1.onmessageerror=()=>finish(false);
    try{worker.postMessage({type:'understood-shell-status',repair},[channel.port2]);}catch{finish(false);}
  });
}
