import {readFile,readdir,realpath,lstat} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';

const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',webmanifest:'application/manifest+json; charset=utf-8',csv:'text/csv; charset=utf-8'};
const publicFiles=['index.html','sw.js','manifest.webmanifest','favicon.svg','icon-192.png','icon-512.png','product-workspace.jpg','worker-import-template.csv'];
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
export async function loadPublicBuild(directory) {
  const root=await realpath(resolve(directory)),files=new Map();let total=0;
  const names=await readdir(join(root,'assets'));
  const assets=names.filter(name=>/^[A-Za-z0-9_.-]+\.(?:js|css)$/.test(name));
  if(!assets.length || assets.length>250)throw Error('Optimized public build is unavailable');
  for(const path of [...publicFiles,...assets.map(name=>`assets/${name}`)]) {
    const target=join(root,path),actual=await realpath(target),inside=relative(root,actual);
    if(inside.startsWith('..') || isAbsolute(inside) || !(await lstat(target)).isFile())throw Error('Invalid public build file');
    const bytes=await readFile(target);total+=bytes.length;if(total>20*1024*1024)throw Error('Public build exceeds delivery limit');
    files.set('/'+path,{bytes,type:types[path.split('.').at(-1)],etag:`"${createHash('sha256').update(bytes).digest('hex')}"`});
  }
  const html=files.get('/index.html').bytes.toString('utf8');
  if(html.includes('/src/') || !/src="\/assets\/[A-Za-z0-9_.-]+\.js"/.test(html))throw Error('Use an optimized public build, not development HTML');
  for(const match of html.matchAll(/(?:src|href)="(\/(?:assets\/[^"?#]+|favicon\.svg|manifest\.webmanifest|icon-192\.png))"/g))if(!files.has(match[1]))throw Error('Public build references a missing file');
  return (req,res,url)=>{
    const headers={'x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':csp,'permissions-policy':'microphone=(self), camera=(), geolocation=()'};
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers,'cache-control':'no-store',allow:'GET, HEAD'});return res.end();}
    const path=url.pathname==='/'?'/index.html':url.pathname,file=files.get(path);
    if(!file){res.writeHead(404,{...headers,'cache-control':'no-store'});return res.end();}
    const immutable=/^\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:js|css)$/.test(path);
    const cache=url.search?'no-store':immutable?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate';
    const responseHeaders={...headers,'content-type':file.type,'cache-control':cache,etag:file.etag,...(path==='/sw.js'?{'service-worker-allowed':'/'}:{})};
    if(req.headers['if-none-match']===file.etag){res.writeHead(304,responseHeaders);return res.end();}
    res.writeHead(200,{...responseHeaders,'content-length':file.bytes.length});res.end(req.method==='HEAD'?undefined:file.bytes);
  };
}
