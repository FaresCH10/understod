// UI affordances only; server repositories remain authoritative.
export function canManageStaff(role:string|null|undefined) {
  return role==='owner' || role==='supervisor';
}

export function staffDate(timezone:string|undefined,now=new Date()) {
  try {
    return now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:timezone || 'UTC'});
  } catch {
    return `${now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})} (UTC)`;
  }
}

export function staffGreeting(timezone:string|undefined,now=new Date()) {
  let hour=now.getUTCHours();
  try {hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'numeric',hourCycle:'h23',timeZone:timezone || 'UTC'}).format(now));} catch { /* Invalid site zone uses UTC. */ }
  return hour<12 ? 'Good morning' : hour<18 ? 'Good afternoon' : 'Good evening';
}
