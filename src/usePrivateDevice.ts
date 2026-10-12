import {useEffect,useState} from 'react';
import {privateDeviceAllowed,subscribeDevicePolicy} from './worker-device-policy';
export function usePrivateDevice(context:string){
  const [allowed,setAllowed]=useState(()=>privateDeviceAllowed(context));
  useEffect(()=>{const update=()=>setAllowed(privateDeviceAllowed(context));update();const stop=subscribeDevicePolicy(update);const timer=setInterval(update,1000);return()=>{stop();clearInterval(timer);};},[context]);
  return allowed;
}
