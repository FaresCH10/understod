import {Languages} from 'lucide-react';
import {caseText,type CaseLocale} from './clarification-locale';

export function CaseLocalePicker({locale,onChange,disabled=false}:{locale:CaseLocale;onChange:(locale:CaseLocale)=>void;disabled?:boolean}){
  const label=caseText(locale,'Interface language');
  return <label className="case-locale-picker"><Languages size={18}/><span className="sr-only">{label}</span><select aria-label={label} value={locale} disabled={disabled} onChange={event=>onChange(event.target.value as CaseLocale)}><option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option><option value="ur" lang="ur">اردو</option></select></label>;
}
