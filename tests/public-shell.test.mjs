import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {shellWorker} from '../scripts/public-shell.mjs';

const bodies={'/index.html':'<html>Public application</html>','/assets/app-123.js':'export const app=true;'};
const manifest=Object.entries(bodies).map(([path,body])=>({path,hash:createHash('sha256').update(body).digest('hex')}));
function harness({badHash=false,failPut=false}={}) {
  const handlers={},stores=new Map(),fetches=[];let claimed=0;
  const caches={keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),open:async key=>{
    if(!stores.has(key))stores.set(key,new Map());const store=stores.get(key);
    return {put:async(path,response)=>{if(failPut)throw Error('Disk full');store.set(path,response.clone());},match:async path=>store.get(path)?.clone()};
  }};
  let network=async(path,options)=>{
    fetches.push({path:typeof path==='string'?path:path.url,options});
    return new Response(badHash?'Changed':bodies[path] || 'Network',{status:200});
  };
  runInNewContext(shellWorker(manifest),{self:{location:{origin:'https://example.test'},clients:{claim:async()=>claimed++},addEventListener:(name,handler)=>handlers[name]=handler},caches,crypto:webcrypto,Uint8Array,URL,Response,fetch:(...args)=>network(...args)});
  return {stores,fetches,get claimed(){return claimed;},network(fn){network=fn;},lifecycle:async name=>{let work;handlers[name]({waitUntil:promise=>work=promise});await work;},fetch(path,options={}){
    let response;handlers.fetch({request:{url:new URL(path,'https://example.test').href,method:options.method || 'GET',mode:options.mode || 'cors',headers:new Headers(options.headers)},respondWith:value=>response=value});return response;
  },async message(data,source='https://example.test/#device'){
    let work,response;handlers.message({data,source:{url:source},ports:[{postMessage:value=>response=value}],waitUntil:promise=>work=promise});await work;return response;
  }};
}
test('public shell installs only integrity-checked anonymous build files',async()=>{
  const h=harness();await h.lifecycle('install');assert.equal(h.stores.size,1);
  assert.deepEqual([...h.stores.values()][0].keys().toArray(),Object.keys(bodies));
  for(const call of h.fetches)assert.deepEqual({...call.options},{credentials:'omit',cache:'reload',redirect:'error'});
  assert.equal(await (await h.fetch('/assets/app-123.js')).text(),bodies['/assets/app-123.js']);
});
test('changed bytes and failed cache writes leave no partial shell',async()=>{
  for(const options of [{badHash:true},{failPut:true}]){
    const h=harness(options);await assert.rejects(h.lifecycle('install'));assert.equal(h.stores.size,0);
  }
});
test('HTTP failure or a redirected install download cannot prepare a shell',async()=>{
  for(const network of [async()=>new Response('Unavailable',{status:503}),async()=>{throw Error('Redirect refused');}]){
    const h=harness();h.network(network);await assert.rejects(h.lifecycle('install'));assert.equal(h.stores.size,0);
  }
});
test('activation removes only obsolete public-shell caches',async()=>{
  const h=harness();await h.lifecycle('install');h.stores.set('understood-shell-v1-old',new Map());h.stores.set('other-application',new Map());
  await h.lifecycle('activate');assert.equal(h.stores.size,2);assert.ok(h.stores.has('other-application'));assert.equal(h.claimed,1);
  assert.doesNotMatch(shellWorker(manifest),/skipWaiting/);
});
test('private API, access-link queries, writes, authorization and foreign origins bypass the worker',()=>{
  const h=harness();for(const [path,options] of [['/api/session',{}],['/api/worker/recordings/123',{}],['/?token=secret',{mode:'navigate'}],['/assets/app-123.js?token=secret',{}],['/',{method:'POST',mode:'navigate'}],['/',{headers:{authorization:'Bearer secret'},mode:'navigate'}],['https://other.test/assets/app-123.js',{}],['/unlisted.js',{}]])assert.equal(h.fetch(path,options),undefined);
});
test('navigation uses the network and falls back to public HTML only on outage',async()=>{
  const h=harness();await h.lifecycle('install');
  h.network(async()=>new Response('Forbidden',{status:403}));assert.equal((await h.fetch('/',{mode:'navigate'})).status,403);
  h.network(async()=>new Response('Unavailable',{status:503}));assert.equal(await (await h.fetch('/',{mode:'navigate'})).text(),bodies['/index.html']);
  h.network(async()=>{throw Error('Offline');});assert.equal(await (await h.fetch('/',{mode:'navigate'})).text(),bodies['/index.html']);
});
test('runtime misses never populate the public cache',async()=>{
  const h=harness();h.network(async()=>new Response('Network'));await h.fetch('/assets/app-123.js');assert.equal([...h.stores.values()][0].size,0);
});
test('public shell readiness verifies every cached hash, not merely an active registration',async()=>{
  const h=harness();await h.lifecycle('install');const read=()=>h.message({type:'understood-shell-status'});
  assert.equal((await read()).ready,true);
  const cache=[...h.stores.values()][0];cache.delete('/assets/app-123.js');assert.equal((await read()).ready,false);
  cache.set('/assets/app-123.js',new Response('Changed'));assert.equal((await read()).ready,false);
  h.stores.clear();assert.equal((await read()).ready,false);
});
test('explicit public-cache repair reuses anonymous integrity checks and cannot report failed repair as ready',async()=>{
  const h=harness();const repair=()=>h.message({type:'understood-shell-status',repair:true});
  assert.equal((await repair()).ready,true);
  for(const call of h.fetches)assert.deepEqual({...call.options},{credentials:'omit',cache:'reload',redirect:'error'});
  h.stores.clear();h.network(async()=>new Response('Unavailable',{status:503}));assert.equal((await repair()).ready,false);
  assert.equal([...h.stores.values()][0].size,0);
  assert.equal(await h.message({type:'understood-shell-status',repair:true},'https://other.test/'),undefined);
  assert.equal(await h.message({type:'unknown',repair:true}),undefined);
});
test('manifest rejects protected paths, duplicates and absent public HTML',()=>{
  for(const invalid of [[],[manifest[0],manifest[0]],[manifest[1]],[...manifest,{path:'/api/session',hash:manifest[0].hash}],[{path:'/index.html',hash:'invalid'}]])assert.throws(()=>shellWorker(invalid));
});
