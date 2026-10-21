import {send,readJson} from './http.mjs';
import {verifyClientSession} from './session-context.mjs';
export async function handleProcessingRetryRoute(req,res,session,url,operations){
  const match=/^\/api\/processing\/([^/]+)\/retries(?:\/([^/]+))?$/.exec(url.pathname);if(!match)return false;
  try{
    verifyClientSession(req,session,url.pathname);if(url.search)throw Error('Invalid processing retry request');
    const jobId=decodeURIComponent(match[1]);
    if(req.method==='GET')send(res,200,match[2]?await operations.receipt(session,jobId,decodeURIComponent(match[2])):await operations.context(session,jobId));
    else if(req.method==='POST' && !match[2]){
      if(req.headers['content-type']!=='application/json' || req.headers['content-encoding']!==undefined)throw Error('Invalid processing retry request');
      send(res,202,await operations.retry(session,jobId,await readJson(req,4096)));
    }else send(res,405,{error:'Method not allowed'});
  }catch(error){
    const message=error.message,status=message==='Forbidden'?403:message==='Sign in required'?401:message==='Session context changed' || /^Processing retry (request conflict|state changed)$/.test(message)?409:
      message==='Processing retry unavailable'?404:/^Invalid processing retry|^Invalid JSON|^URI malformed/.test(message)?400:message==='Request too large'?413:503;
    send(res,status,{error:status===503?'Processing retry unavailable. Check the saved request before trying again.':message});
  }return true;
}
