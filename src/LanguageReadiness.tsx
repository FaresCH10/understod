import {useEffect,useState} from 'react';
import {CheckCircle2,Globe,RefreshCw,TriangleAlert} from 'lucide-react';
import {ProviderStages,type PipelineStatus} from './ProviderStages';
import {ProviderStageTests,type StageTest} from './ProviderStageTests';

type Check={state:string;evidence:string};
type Language={code:string;name:string;direction:'ltr'|'rtl';generationDefault:boolean;ui:Check;content:Check;translation:Check;speech:Check};
type Readiness={generatedAt:string;mode:string;dataClass:string;realDataAllowed:boolean;pipeline:PipelineStatus;stageTests:StageTest[];provider:{adapter:string;connection:Check;evidence:string};publication:{id:string;version:number;state:string}|null;languages:Language[];tests:{connection:Check;translation:Check;speech:Check}};

async function request<T>(path:string,options:RequestInit={}):Promise<T>{const response=await fetch(`/api${path}`,{credentials:'include',headers:{'content-type':'application/json'},...options});const data=await response.json();if(!response.ok) throw new Error(data.error || 'Language readiness request failed');return data;}
function stateLabel(value:string){return value.replaceAll('_',' ');}
function State({value}:{value:Check}){const good=value.state==='ready',bad=value.state==='failed' || value.state==='unavailable';return <span className={`readiness-state readiness-state-${good?'ready':bad?'failed':'pending'}`}><span aria-hidden="true">{good?<CheckCircle2 size={16}/>:<TriangleAlert size={16}/>}</span>{stateLabel(value.state)}</span>;}

export function LanguageReadiness({refresh=0}:{refresh?:number}){
  const [data,setData]=useState<Readiness|null>(null),[loading,setLoading]=useState(true),[running,setRunning]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const load=async()=>{setLoading(true);setError('');try{setData(await request<Readiness>('/language-readiness'));}catch(error){setError((error as Error).message);}finally{setLoading(false);}};
  useEffect(()=>{void load();},[refresh]);
  async function run(){if(running)return;setRunning(true);setError('');setMessage('');try{setData(await request<Readiness>('/language-readiness/test',{method:'POST',body:'{}'}));setMessage('Stored content and configuration inspected. No provider request was sent.');}catch(error){setError((error as Error).message);}finally{setRunning(false);}}
  return <><div className="page-header"><div><h1>Language readiness</h1><p>Review UI coverage, stored content and provider evidence before launch.</p></div><div className="actions"><button className="icon-button" aria-label="Refresh language readiness" title="Refresh language readiness" disabled={loading || running} onClick={()=>void load()}><RefreshCw size={20}/></button><button className="button primary" disabled={running || loading} onClick={()=>void run()}><RefreshCw size={18}/>{running?'Inspecting...':'Inspect readiness'}</button></div></div>
    {loading && !data ? <p role="status">Loading language readiness...</p> : error && !data ? <p role="alert" className="record-error">{error}</p> : data && <>
      <div className="readiness-banner"><Globe size={24}/><div><strong>{data.realDataAllowed?'Provider access is enabled.':'Synthetic-only environment.'}</strong><p>{data.provider.evidence}</p></div></div>
      {message && <p role="status">{message}</p>}{error && <p role="alert" className="record-error">{error}</p>}
      <div className="readiness-grid">{data.languages.map(language=><section className="panel readiness-card" key={language.code}><div className="readiness-card-heading"><div><h2>{language.name}</h2><span>{language.code.toUpperCase()} · {language.direction==='rtl'?'RTL':'LTR'}</span></div></div><dl><div><dt>Generation default</dt><dd>{language.generationDefault?'Selected':'Not selected'}</dd></div><div><dt>Worker UI</dt><dd><State value={language.ui}/></dd></div><div><dt>Stored content</dt><dd><State value={language.content}/></dd></div><div><dt>Translation</dt><dd><State value={language.translation}/></dd></div><div><dt>Speech</dt><dd><State value={language.speech}/></dd></div></dl><p className="muted">{language.content.evidence}</p></section>)}</div>
      <section className="readiness-stages"><h2>Provider stages</h2><ProviderStages pipeline={data.pipeline}/></section>
      <section className="readiness-stages"><h2>Fixed synthetic stage tests</h2><ProviderStageTests tests={data.stageTests}/><p className="muted">Technical results apply only to the current server test configuration and fixed fixtures. They do not certify language accuracy, speech quality, Urdu speech or production readiness.</p></section>
      <section className="panel readiness-evidence"><h2>Production evaluation</h2><dl><div><dt>Full provider pipeline</dt><dd><State value={data.tests.connection}/><span>{data.tests.connection.evidence}</span></dd></div><div><dt>Translation accuracy</dt><dd><State value={data.tests.translation}/><span>{data.tests.translation.evidence}</span></dd></div><div><dt>Speech quality</dt><dd><State value={data.tests.speech}/><span>{data.tests.speech.evidence}</span></dd></div></dl><p className="muted">Last inspected {new Date(data.generatedAt).toLocaleString()}. Configuration and stored content do not verify provider connection, language accuracy or permission to send real worker data.</p></section>
    </>}
  </>;
}
