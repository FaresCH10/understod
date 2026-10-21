import {useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ChevronLeft,ChevronRight,Globe,KeyRound,MessageCircle,UserRound,Zap} from 'lucide-react';
import {type WorkerUiLanguage} from './worker-ui-language';
import {type PageSession} from './session-state';
import {workerEntryIdentity,workerEntryLanguages,workerEntryText} from './worker-entry-presentation';

export {workerEntryText} from './worker-entry-presentation';
export function WorkerAccessEntry({language,onLanguage,token,onToken,busy,blocked,authenticated,session,supported,failed,onSubmit,onCancel,children}:{language:WorkerUiLanguage;onLanguage:(value:WorkerUiLanguage)=>void;token:string;onToken:(value:string)=>void;busy:boolean;blocked:boolean;authenticated:boolean;session?:PageSession;supported:boolean;failed:boolean;onSubmit:()=>void;onCancel:()=>void;children:React.ReactNode}) {
  const t=workerEntryText[language],rtl=language!=='en',Forward=rtl?ArrowLeft:ArrowRight,Back=rtl?ArrowRight:ArrowLeft,Chevron=rtl?ChevronLeft:ChevronRight;
  const identity=workerEntryIdentity(session,language),tokenInput=useRef<HTMLInputElement>(null);
  const [linkOpen,setLinkOpen]=useState(!token),[helpOpen,setHelpOpen]=useState(false),[anotherOpen,setAnotherOpen]=useState(false);
  return <main className="entry-page worker-access-entry" lang={language} dir={rtl?'rtl':'ltr'}>{children}<section aria-labelledby="worker-entry-title">
    <header className="worker-entry-heading"><h1 id="worker-entry-title">{t.title}</h1><p>{t.choose}</p></header>
    {identity && <div className="worker-entry-identity"><UserRound size={24} aria-hidden="true"/><div><span>{t.current}</span><strong><bdi>{identity.name}</bdi></strong><p><bdi>{identity.organization}</bdi> · <bdi>{identity.site}</bdi></p></div></div>}
    <form onSubmit={event=>{event.preventDefault();if(!busy && !blocked && supported && token.trim())onSubmit();}}>
      <fieldset className="worker-entry-languages" disabled={busy}><legend>{t.language}</legend>{workerEntryLanguages.map(item=><label key={item.value} className={language===item.value?'selected':''}><span lang={item.value} dir={item.value==='en'?'ltr':'rtl'}>{item.label}</span><input type="radio" name="worker-entry-language" value={item.value} checked={language===item.value} onChange={()=>onLanguage(item.value)}/></label>)}</fieldset>
      {supported?<><details className="worker-entry-link" open={linkOpen} onToggle={event=>setLinkOpen(event.currentTarget.open)}><summary>{t.link}</summary>{token && <p>{t.provided}</p>}<label className="field">{t.token}<input ref={tokenInput} type="password" dir="ltr" autoComplete="off" autoCapitalize="none" spellCheck={false} value={token} disabled={busy || blocked} onChange={event=>onToken(event.target.value)} required maxLength={256}/></label></details>{authenticated && <p className="notice notice-amber">{t.handoff}</p>}<button className="button primary full worker-entry-continue" type="submit" disabled={busy || blocked || !token.trim()}>{busy?t.busy:t.open}<Forward size={24} aria-hidden="true"/></button></>:<p role="status">{t.unsupported}</p>}
    </form>
    <div className="worker-entry-notes"><p><Zap size={22} aria-hidden="true"/><span>{t.synthetic}</span></p><p><Globe size={22} aria-hidden="true"/><span>{t.languages}</span></p></div>
    {failed && <p role="alert">{t.failed}</p>}
    <div className="worker-entry-support">
      {supported && <><button className="worker-entry-action" disabled={busy} aria-expanded={anotherOpen} aria-controls="worker-entry-another" onClick={()=>{setAnotherOpen(true);onToken('');setLinkOpen(true);requestAnimationFrame(()=>tokenInput.current?.focus());}}><KeyRound size={22} aria-hidden="true"/><span>{t.another}</span><Chevron size={22} aria-hidden="true"/></button><p id="worker-entry-another" hidden={!anotherOpen}>{t.anotherBody}</p></>}
      <button className="worker-entry-action" disabled={busy} aria-expanded={helpOpen} aria-controls="worker-entry-help" onClick={()=>setHelpOpen(value=>!value)}><MessageCircle size={22} aria-hidden="true"/><span>{t.help}</span><Chevron size={22} aria-hidden="true"/></button><p id="worker-entry-help" hidden={!helpOpen}>{t.helpBody}</p>
      <button className="worker-entry-back" disabled={busy} onClick={onCancel}><Back size={20} aria-hidden="true"/>{t.cancel}</button>
    </div>
  </section></main>;
}
