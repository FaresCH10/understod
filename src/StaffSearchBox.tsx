import {useState} from 'react';
import {Search} from 'lucide-react';
import {searchRoute} from './staff-search';

export function StaffSearchBox({navigate,disabled,canPeople}:{navigate:(path:string)=>void;disabled:boolean;canPeople:boolean}){
  const [query,setQuery]=useState(''),label=canPeople?'Search briefings and people':'Search briefings';
  return <><form className="search-shell staff-search-box" role="search" onSubmit={event=>{event.preventDefault();if(query.trim())navigate(searchRoute(query));}}>
    <input aria-label={label} type="search" placeholder={canPeople?'Search briefings, people...':'Search briefings...'} value={query} onChange={event=>setQuery(event.target.value)} maxLength={80} required disabled={disabled}/>
    <button className="icon-button" type="submit" aria-label="Search this site" title="Search this site" disabled={disabled}><Search size={19}/></button>
  </form><button className="icon-button staff-search-mobile" aria-label="Search this site" title="Search this site" disabled={disabled} onClick={()=>navigate(query.trim()?searchRoute(query):'search')}><Search size={21}/></button></>;
}
