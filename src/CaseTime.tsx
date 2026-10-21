import {caseTimestamp,type CaseLocale} from './clarification-locale';

export function CaseTime({value,language,timezone='UTC',className}:{value:string;language:CaseLocale;timezone?:string;className?:string}){
  const {text,offset}=caseTimestamp(language,value,timezone);
  return <time dateTime={value} className={className}><bdi>{text}</bdi>{' '}<bdi dir="ltr" className="case-time-offset">{offset}</bdi></time>;
}
