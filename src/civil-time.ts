import {Temporal} from '@js-temporal/polyfill';

export type CivilTimeChoice={instant:string;offset:string};

export function civilTimeChoices(value:string,timezone:string):CivilTimeChoice[] {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Enter a complete date and time.');
  let date:Temporal.PlainDateTime;
  try {date=Temporal.PlainDateTime.from(value,{overflow:'reject'});}catch {throw Error('Enter a valid calendar date and time.');}
  if(date.year<2000)throw Error('Enter a date from 2000 onwards.');
  if(!timezone || timezone.length>80 || /^[+-]/.test(timezone))throw Error('Site time zone is unavailable.');
  try {new Intl.DateTimeFormat('en',{timeZone:timezone});}catch {throw Error('Site time zone is unavailable.');}
  const earlier=date.toZonedDateTime(timezone,{disambiguation:'earlier'}),later=date.toZonedDateTime(timezone,{disambiguation:'later'});
  // Temporal resolves gaps by shifting; those are not the civil time the user entered.
  if(!earlier.toPlainDateTime().equals(date) || !later.toPlainDateTime().equals(date))throw Error(`This time does not exist in ${timezone}. Choose another time.`);
  const choice=(value:Temporal.ZonedDateTime)=>{
    const instant=new Date(value.epochMilliseconds).toISOString();
    if(!/^\d{4}-/.test(instant))throw Error('The UTC date must be before year 10000.');
    return {instant,offset:value.offset};
  };
  return earlier.epochNanoseconds===later.epochNanoseconds ? [choice(earlier)] : [choice(earlier),choice(later)];
}

export function civilTimeInstant(value:string,timezone:string,occurrence:string):string {
  if(!['','earlier','later'].includes(occurrence))throw Error('Invalid repeated-time choice.');
  const choices=civilTimeChoices(value,timezone);
  if(choices.length===2 && !occurrence)throw Error(`This time occurs twice in ${timezone}. Choose the first or second occurrence.`);
  return choices[choices.length===2 && occurrence==='later'?1:0].instant;
}

export function publicationTimes(fields:FormData,siteTimezone:string,scheduled:boolean) {
  const timezone=String(fields.get('timezone') || '');
  if(![siteTimezone,'UTC'].includes(timezone))throw Error('Choose the site time zone or UTC.');
  const deadline=String(fields.get('deadline') || ''),publishAt=String(fields.get('publishAt') || '');
  const dueAt=deadline ? civilTimeInstant(deadline,timezone,String(fields.get('deadlineOccurrence') || '')) : null;
  const scheduledAt=scheduled ? civilTimeInstant(publishAt,timezone,String(fields.get('publishAtOccurrence') || '')) : null;
  if(scheduledAt && dueAt && dueAt<=scheduledAt)throw Error('Response deadline must follow publication time.');
  return {dueAt,scheduledAt};
}
