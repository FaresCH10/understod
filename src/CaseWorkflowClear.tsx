import {useId,useRef} from 'react';
import {Trash2} from 'lucide-react';
import {keepDialogFocus} from './dialog-focus';
import {caseText,type CaseLocale,type CaseTextKey} from './clarification-locale';

export function CaseWorkflowClear({label,token,visible,disabled,current,onClear,focusFallback,language:locale='en'}:{label:'repeat'|'review';token:string;visible:boolean;disabled:boolean;current:()=>boolean;onClear:()=>void;focusFallback:()=>void;language?:CaseLocale}){
  const t=(key:CaseTextKey)=>caseText(locale,key);
  const title=useId(),description=useId(),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),intent=useRef<string|null>(null),latest=useRef({token,disabled,current,onClear,focusFallback});latest.current={token,disabled,current,onClear,focusFallback};
  return <>{visible&&<button ref={trigger} className="button outline case-workflow-clear" disabled={disabled} onClick={()=>{intent.current=token;dialog.current?.showModal();}}><Trash2 size={18}/>{t(label==='repeat'?'Clear repeat draft':'Clear review draft')}</button>}
    <dialog ref={dialog} className="withdraw-dialog" aria-labelledby={title} aria-describedby={description} onKeyDown={keepDialogFocus} onClose={()=>{intent.current=null;if(trigger.current?.isConnected)trigger.current.focus();else latest.current.focusFallback();}}><h2 id={title}>{t(label==='repeat'?'Clear this unsent repeat draft?':'Clear this unsent review draft?')}</h2><p id={description}>{t('This only clears the draft on this screen. It does not cancel a pending request or remove a saved record.')}</p><div className="actions"><button autoFocus className="button outline" onClick={()=>dialog.current?.close()}>{t('Cancel')}</button><button className="button danger" onClick={()=>{const value=latest.current;if(!value.disabled&&value.current()&&value.token===intent.current)value.onClear();dialog.current?.close();}}>{t('Clear draft')}</button></div></dialog>
  </>;
}
