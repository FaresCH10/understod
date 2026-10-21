import {send} from './http.mjs';
import {verifyClientSession} from './session-context.mjs';
export async function handleProcessingProvenanceRoute(req,res,session,url,read){
  const match=/^\/api\/processing\/([^/]+)\/provenance$/.exec(url.pathname);if(!match)return false;
  try{
    verifyClientSession(req,session,url.pathname);
    if(req.method!=='GET'){send(res,405,{error:'Method not allowed'});return true;}
    const filters={};for(const [key,value] of url.searchParams){if(key in filters)throw Error('Invalid provider history page');filters[key]=value;}
    send(res,200,await read(session,decodeURIComponent(match[1]),filters));
  }catch(error){
    const message=error.message,status=message==='Sign in required'?401:message==='Forbidden'?403:message==='Session context changed'?409:message==='Processing job unavailable'?404:/^Invalid provider history|^Invalid processing job|^URI malformed/.test(message)?400:503;
    send(res,status,{error:status===503?'Provider history unavailable. Refresh after checking the service.':message});
  }return true;
}
