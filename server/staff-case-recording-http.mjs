import {clientSessionContext} from './session-context.mjs';
import {sendPrivateWav} from './audio-response.mjs';
import {staffRecordingHttpError} from './staff-case-recording-input.mjs';

async function readAudio(req){
  if(req.headers['content-type']!=='audio/wav')throw Error('Expected WAV audio');
  const chunks=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>2880044)throw Error('Request too large');chunks.push(chunk);}
  return Buffer.concat(chunks,bytes);
}
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(JSON.stringify(value));};
export async function handleStaffCaseRecordingRoute(req,res,session,path,search,operations){
  const match=path.match(/^\/api\/clarifications\/([^/]+)\/in-person-recordings(?:\/([^/]+)(?:\/(audio))?)?$/);if(!match)return false;
  try{
    if(session?.principal_type!=='staff'||!['owner','supervisor'].includes(session.role))throw Error('Forbidden');
    const [,caseId,requestId,audio]=match;
    if(!requestId&&req.method==='GET'){
      if(new Set(search.keys()).size!==[...search.keys()].length)throw Error('Invalid staff recording page');
      return json(res,200,{...await operations.list(session,caseId,Object.fromEntries(search)),clientContext:clientSessionContext(session).clientContext}),true;
    }
    if(search.size)throw Error('Invalid staff recording request');
    if(audio&&req.method==='GET'){sendPrivateWav(req,res,await operations.audio(session,caseId,requestId));return true;}
    if(requestId&&!audio&&req.method==='GET'){json(res,200,{...await operations.receipt(session,caseId,requestId),clientContext:clientSessionContext(session).clientContext});return true;}
    if(requestId&&!audio&&req.method==='POST'){
      json(res,200,{...await operations.receive(session,caseId,requestId,req.headers['x-recording-language'],await readAudio(req)),clientContext:clientSessionContext(session).clientContext});return true;
    }
    json(res,405,{error:'Method not allowed'});return true;
  }catch(error){if(res.headersSent){res.destroy();return true;}const failure=staffRecordingHttpError(error);json(res,failure.status,{error:failure.error});return true;}
}
