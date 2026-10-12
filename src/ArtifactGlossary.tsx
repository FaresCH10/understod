import {useEffect,useState} from 'react';
import {BookOpen,ChevronLeft,ChevronRight,RefreshCw,Search} from 'lucide-react';
import {checkedArtifactGlossary,type ArtifactGlossaryPage} from './artifact-glossary';
import {artifactGlossaryDependency} from './artifact-review';
import {ArtifactCopy} from './ArtifactCopy';

export function ArtifactGlossary({target,context,prepared,disabled=false}:{target:string;context:string;prepared:unknown;disabled?:boolean}) {
  const [search,setSearch]=useState(''),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[data,setData]=useState<ArtifactGlossaryPage|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const dependency=artifactGlossaryDependency(prepared);
  useEffect(()=>{const controller=new AbortController();let current=true;setData(null);setError('');setLoading(true);
    const timer=setTimeout(()=>{fetch(`/api/glossary?${new URLSearchParams({sourceLanguage:'en',targetLanguage:target,status:'active',search,page:String(page),pageSize:'20'})}`,
      {credentials:'include',cache:'no-store',headers:{'x-client-session-context':context},signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error();return checkedArtifactGlossary(await response.json(),target,page);})
      .then(value=>{if(current)setData(value);}).catch(()=>{if(current)setError('Current site terminology is unavailable.');}).finally(()=>{if(current)setLoading(false);});},200);
    const timeout=setTimeout(()=>controller.abort(),15000);
    return()=>{current=false;clearTimeout(timer);clearTimeout(timeout);controller.abort();};
  },[target,context,search,page,refresh]);
  return <section className="artifact-glossary" aria-label="Artifact terminology"><h2>Recorded glossary dependency</h2>{dependency?<p>Revision {dependency.revision} · <bdi>{dependency.hash}</bdi></p>:<p>No glossary dependency recorded for this version.</p>}
    <h2>Current site terminology</h2><p className="muted">Current terms are separate from the selected version's recorded dependency.</p>
    <div className="filters"><label className="search-box"><Search size={18}/><input aria-label="Search artifact terminology" maxLength={80} disabled={disabled} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label><button className="icon-button" title="Refresh artifact terminology" aria-label="Refresh artifact terminology" disabled={loading || disabled} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={20}/></button><a className="button outline" href={disabled?undefined:'#glossary'} aria-disabled={disabled} tabIndex={disabled?-1:undefined}><BookOpen size={18}/>Company glossary</a></div>
    {loading && <p role="status">Loading current terminology...</p>}{error && <p role="alert">{error}</p>}{data && <><div className="table-wrap" role="region" aria-label="Current site terminology" tabIndex={0}><table><thead><tr><th scope="col">English term</th><th scope="col">Translation</th><th scope="col">Version</th><th scope="col">Copy</th></tr></thead><tbody>{data.items.map(row=><tr key={row.id}><td><a href={disabled?undefined:`#glossary/${encodeURIComponent(row.id)}`} aria-disabled={disabled} tabIndex={disabled?-1:undefined} dir="auto">{row.term}</a></td><td lang={target} dir={target==='en'?'ltr':'rtl'}>{row.content.override || row.content.suggestion || 'Not generated'}<small>{row.content.override?'Company override':row.content.provenance?.live?'AI suggestion':row.content.suggestion?'Synthetic suggestion':'No suggestion'}</small></td><td>v{row.revision}</td><td><ArtifactCopy key={`${row.id}:${row.revision}`} value={row.content.override || row.content.suggestion || ''} label={`Copy translation of ${row.term}`} context={context} disabled={disabled}/></td></tr>)}</tbody></table></div>{!data.items.length && <p>No current terms match this language pair.</p>}<div className="audit-pagination"><span>{data.total} terms · Page {page}</span><button className="icon-button" title="Previous artifact terms" aria-label="Previous artifact terms" disabled={disabled || page<=1} onClick={()=>setPage(n=>n-1)}><ChevronLeft size={20}/></button><button className="icon-button" title="Next artifact terms" aria-label="Next artifact terms" disabled={disabled || page*20>=data.total} onClick={()=>setPage(n=>n+1)}><ChevronRight size={20}/></button></div></>}
  </section>;
}
