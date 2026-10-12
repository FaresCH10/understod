import {useState} from 'react';
import {civilTimeChoices,type CivilTimeChoice} from './civil-time';

export default function CivilTimeField({name,label,timezone,required=false,onChanged}:{name:string;label:string;timezone:string;required?:boolean;onChanged:()=>void}) {
  const [choices,setChoices]=useState<CivilTimeChoice[]>([]),[error,setError]=useState(''),[occurrence,setOccurrence]=useState('');
  function changed(input:HTMLInputElement) {
    const value=input.value;
    onChanged();setOccurrence('');setError('');setChoices([]);
    input.setCustomValidity('');
    if(value)try {setChoices(civilTimeChoices(value,timezone));}catch(reason){const message=(reason as Error).message;setError(message);input.setCustomValidity(message);}
  }
  const choice=choices.length===1 ? choices[0] : occurrence ? choices[occurrence==='later'?1:0] : null;
  return <div className="civil-time-field">
    <label className="field">{label} ({timezone}{required?'':', optional'})<input name={name} type="datetime-local" min="2000-01-01T00:00" max="9999-12-31T23:59" required={required} onInput={event=>changed(event.currentTarget)} onChange={event=>changed(event.currentTarget)} aria-describedby={`${name}-civil-result`} aria-invalid={!!error}/></label>
    {choices.length===2 && <label className="field">{label} occurrence<select name={`${name}Occurrence`} value={occurrence} required onChange={event=>{setOccurrence(event.target.value);onChanged();}}>
      <option value="">Choose occurrence</option>{choices.map((choice,index)=><option key={choice.instant} value={index===0?'earlier':'later'}>{index===0?'First':'Second'} (UTC{choice.offset})</option>)}
    </select></label>}
    <p id={`${name}-civil-result`} className={error?'record-error':'civil-time-result'} role={error?'alert':'status'}>{error || (choice ? `${choice.instant.replace('T',' ').replace('.000Z',' UTC')} · UTC${choice.offset}` : choices.length===2 ? 'This time occurs twice. Choose an occurrence.' : '')}</p>
  </div>;
}
