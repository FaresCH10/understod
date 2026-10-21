import {readFileSync,writeFileSync,existsSync,lstatSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Secret relocation is a configuration operation; never print the value or enable a provider.
export function relocateGeminiKey(root) {
  const source=resolve(root,'.env.example'),target=resolve(root,'.env');
  for(const path of [source,target])if(existsSync(path) && !lstatSync(path).isFile())throw Error('Environment path must be a regular file');
  const text=readFileSync(source,'utf8'),key=parseEnv(text).GEMINI_API_KEY;
  if(!key)return {relocated:false,localKeyPresent:existsSync(target)&&!!parseEnv(readFileSync(target,'utf8')).GEMINI_API_KEY};
  if(key.length>500 || /[\x00-\x1f\x7f]/.test(key) || key.includes('"') && key.includes("'"))throw Error('Gemini value cannot be relocated safely; configuration left unchanged');
  const lines=text.split(/\r?\n/),indexes=lines.flatMap((line,i)=>/^\s*(?:export\s+)?GEMINI_API_KEY\s*=/.test(line)?[i]:[]);
  if(indexes.length!==1 || parseEnv(lines[indexes[0]]).GEMINI_API_KEY!==key)throw Error('Gemini key must have one single-line assignment');
  let local=existsSync(target)?readFileSync(target,'utf8'):'';
  const prior=parseEnv(local).GEMINI_API_KEY;
  if(prior && prior!==key)throw Error('Local Gemini key differs; neither file was changed');
  if(!prior) {
    if(/^\s*(?:export\s+)?GEMINI_API_KEY\s*=/m.test(local))throw Error('Local Gemini placeholder exists; neither file was changed');
    const quote=key.includes('"')?"'":'"';
    local+=(local&&!local.endsWith('\n')?'\n':'')+'GEMINI_API_KEY='+quote+key+quote+'\n';
    writeFileSync(target,local,{flag:existsSync(target)?'w':'wx',mode:0o600});
  }
  if(parseEnv(readFileSync(target,'utf8')).GEMINI_API_KEY!==key)throw Error('Local key persistence failed; example left unchanged');
  lines[indexes[0]]='GEMINI_API_KEY=';
  writeFileSync(source,lines.join(text.includes('\r\n')?'\r\n':'\n'));
  return {relocated:true,localKeyPresent:true,exampleKeyPresent:!!parseEnv(readFileSync(source,'utf8')).GEMINI_API_KEY};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(relocateGeminiKey(process.cwd())));}
  catch {console.error('Gemini key relocation failed. No credential was printed. Inspect configuration locally.');process.exitCode=1;}
}
