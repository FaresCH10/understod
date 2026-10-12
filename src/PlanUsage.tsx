import {useEffect,useState} from 'react';
import {CircleDollarSign,Clock3,RefreshCw,TriangleAlert,Users} from 'lucide-react';
import UsageRequests from './UsageRequests';
import type {UsageSession} from './usage-request-recovery';

type Unit={key:string;label:string;used:number;limit:number;percent:number};
type Allowance={day:string;timezone:string;resetsAt:string;state:string;limit:number;reserved:number;remaining:number;requests:Record<string,number>;jobsPaused:boolean;providerPaused:boolean};
type Usage={plan:{name:string;state:string;capabilities:string[]};period:{label:string};denominator:string;units:Unit[];spend:{estimated:{evidence:string};actual:{evidence:string}};controls:{quota:{evidence:string};pause:{evidence:string}};providerAllowance?:Allowance|null;changeRequestsAvailable?:boolean};

async function load(signal:AbortSignal):Promise<Usage>{
  const response=await fetch('/api/usage',{credentials:'include',signal});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error || 'Usage could not be loaded');
  return data;
}

export function PlanUsage({refresh=0,session}:{refresh?:number;session:UsageSession}){
  const [data,setData]=useState<Usage|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [tick,setTick]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);
    setError('');
    load(controller.signal).then(setData).catch(error=>{
      if(!controller.signal.aborted)setError((error as Error).message);
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[refresh,tick]);
  return <>
    <div className="page-header"><div><h1>Plan &amp; usage</h1><p>Review plan details and briefing activity.</p></div><button className="icon-button" aria-label="Refresh plan and usage" title="Refresh plan and usage" disabled={loading} onClick={()=>setTick(value=>value+1)}><RefreshCw size={20}/></button></div>
    {error&&<p role="alert" className="record-error">{error}</p>}
    {loading&&!data&&<p role="status">Loading plan and usage...</p>}
    {data&&<>
      <section className="panel usage-plan"><Users size={24}/><div><h2>{data.plan.name}</h2><p>{data.plan.state} · {data.plan.capabilities.join(' · ')}</p></div><span className="status status-amber"><span className="status-dot"/>No live entitlements</span></section>
      <div className="usage-grid">
        <section className="panel"><h2>Briefing activity</h2><p className="muted">{data.period.label}</p><p className="muted">{data.denominator}</p>{data.units.map(unit=><div className="usage-unit" key={unit.key}><div><strong>{unit.label}</strong><span>{unit.used} / {unit.limit}</span></div><div className="usage-track"><span style={{width:`${unit.percent}%`}}/></div></div>)}</section>
        <section className="panel"><h2>Spend &amp; controls</h2><div className="usage-fact"><CircleDollarSign size={22}/><div><strong>Estimated provider cost</strong><span>Unknown</span><small>{data.spend.estimated.evidence}</small></div></div><div className="usage-fact"><Clock3 size={22}/><div><strong>Actual invoice cost</strong><span>Unknown</span><small>{data.spend.actual.evidence}</small></div></div>{data.providerAllowance?<div className="usage-fact"><TriangleAlert size={22}/><div><strong>Organization request allowance</strong><span className={`status status-${data.providerAllowance.state==='available'?'green':'amber'}`}>{data.providerAllowance.state}</span><span>{data.providerAllowance.reserved} / {data.providerAllowance.limit} slots reserved</span><small>{data.providerAllowance.remaining} unreserved organization slots · {data.providerAllowance.day} UTC</small><small>Reset {new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.providerAllowance.resetsAt))} UTC</small><small>{Object.entries(data.providerAllowance.requests).map(([state,count])=>`${count} ${state}`).join(' · ')}</small><small>All jobs: {data.providerAllowance.jobsPaused?'paused':'not paused'} · Provider jobs: {data.providerAllowance.providerPaused?'paused':'not paused'}</small><small>Reservations are not invoices. Provider readiness is not verified by quota availability.</small></div></div>:<div className="usage-fact"><TriangleAlert size={22}/><div><strong>Quota and pause controls</strong><span>Not configured</span><small>{data.controls.quota.evidence} {data.controls.pause.evidence}</small></div></div>}</section>
      </div>
      <div className="notice notice-amber"><TriangleAlert size={22}/><span>Estimates are not invoices. Real worker data is disabled in this synthetic environment.</span></div>
      {data.changeRequestsAvailable && <UsageRequests key={session.clientContext} session={session}/>}
    </>}
  </>;
}
