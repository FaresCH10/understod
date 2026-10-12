import {FileText,Sparkles,Languages,Send} from 'lucide-react';
import {draftSteps,type DraftFlowState,type DraftStep} from './draft-flow';

export default function DraftSteps({draft,active,disabled=false,onSelect}:{draft:DraftFlowState|null;active:DraftStep;disabled?:boolean;onSelect?:(step:DraftStep)=>void}){
  const icons={source:FileText,processing:Sparkles,languages:Languages,publish:Send};
  return <nav className="draft-steps" aria-label="Drafting steps"><ol>{draftSteps(draft).map(step=>{const Icon=icons[step.id];return <li key={step.id}><button type="button" aria-current={active===step.id?'step':undefined} disabled={disabled || !step.available || !onSelect} onClick={()=>onSelect?.(step.id)}><Icon size={20}/><span><strong>{step.label}</strong><small>{step.status}</small></span></button></li>;})}</ol></nav>;
}
