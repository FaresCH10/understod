import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,CheckCircle2,KeyRound,Mail} from 'lucide-react';

export function AccountRecovery({reset,token,onBack,onReset}:{reset:boolean;token:string;onBack:()=>void;onReset:()=>void}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[complete,setComplete]=useState(false),[error,setError]=useState('');
  const heading=useRef<HTMLHeadingElement>(null),sending=useRef(false);
  useEffect(()=>{heading.current?.focus();},[reset,complete]);
  async function submit(event:FormEvent) {
    event.preventDefault();if(sending.current) return;setError('');
    if(reset && (!token || password!==confirmation)) {setError(!token ? 'This recovery link is unavailable.' : 'The passwords do not match.');return;}
    sending.current=true;setBusy(true);
    try {
      let response:Response,value;
      try {response=await fetch(`/api/auth/${reset ? 'reset-password' : 'recovery'}`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(reset ? {token,password,confirmation} : {email})});value=await response.json();}
      catch {throw new Error('The result could not be confirmed. Try signing in before requesting another link.');}
      if(!response.ok) throw new Error(value.error || 'Recovery unavailable.');
      if(reset ? value.completed!==true || value.signInRequired!==true : value.accepted!==true || value.delivery!=='queued') throw new Error('Recovery response could not be verified.');
      setPassword('');setConfirmation('');setComplete(true);if(reset) onReset();
    }catch(err) {setError((err as Error).message);}
    finally {sending.current=false;setBusy(false);}
  }
  return <section className="account-recovery"><button className="button subtle" disabled={busy} onClick={onBack}><ArrowLeft size={18}/>Back to sign in</button>
    <div className="account-recovery-icon">{complete ? <CheckCircle2 size={30}/> : reset ? <KeyRound size={30}/> : <Mail size={30}/>}</div>
    <h1 ref={heading} tabIndex={-1}>{complete ? reset ? 'Password changed' : 'Check your email' : reset ? 'Set a new password' : 'Account recovery'}</h1>
    {complete ? <><p role="status">{reset ? 'Existing sessions have ended. Sign in with your new password.' : 'If an eligible account exists, a recovery email has been queued. Delivery is not yet confirmed.'}</p><button className="button primary full" onClick={onBack}><ArrowLeft size={18}/>Back to sign in</button></> : <>
      <p>{reset ? 'Choose a new password for your account.' : 'Enter the email used for your staff account.'}</p>
      {reset && !token ? <p role="alert">This recovery link is unavailable. Request a new link.</p> : <form className="entry-form" onSubmit={event=>void submit(event)}>
        {reset ? <><label className="field">New password<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={busy} value={password} onChange={event=>setPassword(event.target.value)}/></label><label className="field">Confirm password<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={busy} value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label></> : <label className="field">Staff email<input type="email" autoComplete="email" maxLength={254} required disabled={busy} value={email} onChange={event=>setEmail(event.target.value)}/></label>}
        {error && <p role="alert" className="record-error">{error}</p>}<button className="button primary full" disabled={busy}>{reset ? <KeyRound size={18}/> : <Mail size={18}/>} {busy ? 'Saving...' : reset ? 'Change password' : 'Request recovery email'}</button>
      </form>}
    </>}
  </section>;
}
