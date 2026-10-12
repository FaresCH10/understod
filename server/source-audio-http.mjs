import {send,readJson} from './http.mjs';
import {verifyClientSession} from './session-context.mjs';
import {MAX_SOURCE_ORIGINAL_BYTES} from './private-storage.mjs';

const MAX_BODY=8+2048+2880044+MAX_SOURCE_ORIGINAL_BYTES;
export async function readSourceAudio(req) {
  if(req.headers['content-type']!=='application/octet-stream' || req.headers['content-encoding']!==undefined
    || (req.headers['content-length']!==undefined && (!/^\d+$/.test(req.headers['content-length']) || Number(req.headers['content-length'])>MAX_BODY)))throw Error('Invalid source audio body');
  const chunks=[];let length=0;
  for await(const chunk of req) {length+=chunk.length;if(length>MAX_BODY)throw Error('Invalid source audio body');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks,length);
  if(length<9)throw Error('Invalid source audio body');
  const metadataBytes=bytes.readUInt32LE(0),wavBytes=bytes.readUInt32LE(4),offset=8+metadataBytes;
  if(metadataBytes<2 || metadataBytes>2048 || wavBytes<8044 || wavBytes>2880044 || offset+wavBytes>=length
    || length-offset-wavBytes>MAX_SOURCE_ORIGINAL_BYTES)throw Error('Invalid source audio body');
  let input;
  try {input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(8,offset)));}
  catch {throw Error('Invalid source audio body');}
  return {input,wav:bytes.subarray(offset,offset+wavBytes),original:bytes.subarray(offset+wavBytes)};
}

export async function handleSourceAudioRoute(req,res,session,url,operations) {
  const match=url.pathname.match(/^\/api\/source-audio\/([^/]+)(?:\/(audio|original))?$/);
  const retry=url.pathname.match(/^\/api\/source-audio\/([^/]+)\/retries(?:\/([^/]+))?$/);
  if(url.pathname!=='/api/source-audio' && !match && !retry)return false;
  try {
    if(session?.principal_type!=='staff' || !['owner','supervisor'].includes(session.role))throw Error('Forbidden');
    const listing=url.pathname==='/api/source-audio' && req.method==='GET';
    if(url.search && !listing)throw Error('Invalid source audio request');
    verifyClientSession(req,session,url.pathname);
    if(retry) {
      const id=decodeURIComponent(retry[1]);
      if(req.method==='GET' && retry[2])send(res,200,await operations.retryReceipt(session,id,decodeURIComponent(retry[2])));
      else if(req.method==='POST' && !retry[2]) {
        if(req.headers['content-type']!=='application/json' || req.headers['content-encoding']!==undefined)throw Error('Invalid source retry request');
        send(res,200,await operations.retry(session,id,await readJson(req,4096)));
      }else send(res,405,{error:'Method not allowed'});
      return true;
    }
    if(listing) {
      const filters={};for(const [key,value] of url.searchParams){if(key in filters)throw Error('Invalid source audio page');filters[key]=value;}
      send(res,200,await operations.list(session,filters));return true;
    }
    if(url.pathname==='/api/source-audio' && req.method==='POST') {
      const {input,original,wav}=await readSourceAudio(req);
      const result=await operations.receive(session,input,original,wav);
      send(res,result.duplicate?200:201,result);return true;
    }
    if(match && req.method==='GET') {
      const id=decodeURIComponent(match[1]);
      if(!match[2])send(res,200,await operations.receipt(session,id));
      else {
        const kind=match[2]==='original'?'original':'canonical',bytes=await operations.audio(session,id,kind);
        res.writeHead(200,{'content-type':kind==='original'?'application/octet-stream':'audio/wav','content-length':bytes.length,
          'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
          ...(kind==='original'?{'content-disposition':'attachment; filename="source-original.bin"'}:{})});
        res.end(bytes);
      }
      return true;
    }
    send(res,405,{error:'Method not allowed'});return true;
  } catch(error) {
    const message=error.message,status=message==='Forbidden'?403:message==='Sign in required'?401:
      /conflict|in progress|Session context changed|authority changed|Source audio expired|Source retry state changed/.test(message)?409:
        /^Invalid|Request too large|Unsupported or corrupt recording|Source audio unavailable/.test(message)?400:503;
    send(res,status,{error:status===503?'Source audio operation unavailable':message});return true;
  }
}
