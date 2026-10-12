import {useEffect,useState} from 'react';
import {publicShellReady} from './public-shell-state';

type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
type ShellStatus='unavailable'|'loading'|'waiting'|'ready'|'failed'|'removed';
let status:ShellStatus='unavailable',registration:ServiceWorkerRegistration|null=null,pending:InstallEvent|null=null;
let generation=0;
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());
export async function registerPublicShell(repair=false) {
  if(!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext)return;
  if(status==='loading')return;
  const operation=++generation;
  status='loading';notify();
  const verify=async(worker:ServiceWorker)=>{const ready=await publicShellReady(worker,repair);if(operation===generation){status=ready?'ready':'failed';notify();}};
  try {
    registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
    if(operation!==generation)return;
    const worker=registration.installing || registration.waiting;
    if(!worker){if(!registration.active)throw Error();await verify(registration.active);return;}
    const changed=()=>{
      if(operation!==generation){worker.removeEventListener('statechange',changed);return;}
      if(worker.state==='activated'){worker.removeEventListener('statechange',changed);void verify(worker);}
      else if(worker.state==='redundant'){status='failed';notify();worker.removeEventListener('statechange',changed);}
      else if(worker.state==='installed' && registration?.active){status='waiting';notify();}
    };
    worker.addEventListener('statechange',changed);changed();
  }catch {if(operation===generation){status='failed';notify();}}
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pending=event as InstallEvent;notify();});
window.addEventListener('appinstalled',()=>{pending=null;notify();});
async function removePublicShell() {
  generation++;
  try {
    const current=await navigator.serviceWorker.getRegistration('/');
    const worker=current?.active || current?.waiting || current?.installing;
    if(current && worker?.scriptURL===new URL('/sw.js',location.origin).href)await current.unregister();
    for(const key of await caches.keys())if(key.startsWith('understood-shell-v1-'))await caches.delete(key);
    registration=null;status='removed';notify();
  }catch {status='failed';notify();}
}
export function usePublicShell() {
  const [,render]=useState(0),[installing,setInstalling]=useState(false),[installError,setInstallError]=useState(false);
  useEffect(()=>{const listener=()=>render(value=>value+1);listeners.add(listener);return()=>{listeners.delete(listener);};},[]);
  const install=async()=>{
    if(!pending || installing)return;
    const prompt=pending;pending=null;setInstalling(true);setInstallError(false);notify();
    try {await prompt.prompt();await prompt.userChoice;}catch {setInstallError(true);}
    finally {setInstalling(false);}
  };
  return {status,canInstall:!!pending,installing,installError,install,recheck:()=>registerPublicShell(true),remove:removePublicShell};
}
