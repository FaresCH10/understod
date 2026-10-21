import { useEffect, useRef, useState } from 'react';
import { Mic, Play, RotateCcw, Send, Square, Trash2,RefreshCw,Save } from 'lucide-react';
import { createRecordingSubmission } from './audio';
import type { RecordingSubmission } from './audio';
import { recordingNotice,conversationRecordingNotice,staffCaseRecordingNotice,siteNoticeText,conversationRecorderText } from './recording-notice';
import {workerRecordingNotice} from './notice-recovery';
import {recorderHasUnsent} from './worker-unsent';
import {WorkerAudioRetryError,workerAudioRetryText} from './worker-audio-retry';
import type {OfflineNotice} from './worker-offline';

const labels = {
  en: { title: 'Record my answer', requesting: 'Waiting for microphone...', stop: 'Stop recording', cancel: 'Cancel', preview: 'Listen before sending', again: 'Record again', discard: 'Discard', send: 'Send recording', uploading: 'Uploading...', received: 'Recording received', permission: 'Microphone access is unavailable. Check browser permission or type your answer.', empty: 'No audio was recorded. Try again.', interrupted: 'Recording stopped unexpectedly. Please record again.', format: 'This recording could not be prepared. Record again or type your answer.', error: 'Receipt could not be confirmed. Your preview remains here; retrying uses the same submission ID.' },
  ar: { title: 'سجّل إجابتي', requesting: 'جارٍ انتظار الميكروفون...', stop: 'إيقاف التسجيل', cancel: 'إلغاء', preview: 'استمع قبل الإرسال', again: 'سجّل مرة أخرى', discard: 'حذف', send: 'إرسال التسجيل', uploading: 'جارٍ الإرسال...', received: 'تم استلام التسجيل', permission: 'الميكروفون غير متاح. تحقق من إذن المتصفح أو اكتب إجابتك.', empty: 'لم يُسجّل أي صوت. حاول مرة أخرى.', interrupted: 'توقف التسجيل بشكل غير متوقع. يرجى إعادة التسجيل.', format: 'تعذّر تجهيز التسجيل. سجّل مرة أخرى أو اكتب إجابتك.', error: 'تعذّر تأكيد الاستلام. بقي التسجيل هنا، وستستخدم إعادة المحاولة رقم الإرسال نفسه.' },
  ur: { title: 'میرا جواب ریکارڈ کریں', requesting: 'مائیکروفون کا انتظار ہے...', stop: 'ریکارڈنگ بند کریں', cancel: 'منسوخ کریں', preview: 'بھیجنے سے پہلے سنیں', again: 'دوبارہ ریکارڈ کریں', discard: 'حذف کریں', send: 'ریکارڈنگ بھیجیں', uploading: 'بھیجا جا رہا ہے...', received: 'ریکارڈنگ موصول ہو گئی', permission: 'مائیکروفون دستیاب نہیں۔ براؤزر کی اجازت دیکھیں یا جواب لکھیں۔', empty: 'آواز ریکارڈ نہیں ہوئی۔ دوبارہ کوشش کریں۔', interrupted: 'ریکارڈنگ غیر متوقع طور پر رک گئی۔ دوبارہ ریکارڈ کریں۔', format: 'ریکارڈنگ تیار نہیں ہو سکی۔ دوبارہ ریکارڈ کریں یا جواب لکھیں۔', error: 'وصولی کی تصدیق نہیں ہو سکی۔ پیش نظارہ موجود ہے؛ دوبارہ کوشش میں وہی ارسال شناخت استعمال ہو گی۔' },
};

export const staffRecorderText={
  en:{title:'Record in-person clarification',preview:'Listen before saving',send:'Save private recording',received:'Private recording saved',permission:'Microphone is unavailable. Check browser permission or add written resolution notes instead.',format:'Recording could not be prepared. Record again or add written notes.',error:'Save receipt is unconfirmed. Keep this preview and check the private recording receipt.'},
  ar:{title:'تسجيل توضيح حضوري',preview:'استمع قبل الحفظ',send:'حفظ التسجيل الخاص',received:'تم حفظ التسجيل الخاص',permission:'الميكروفون غير متاح. تحقق من إذن المتصفح أو أضف ملاحظات حل مكتوبة بدلًا من ذلك.',format:'تعذر تجهيز التسجيل. سجّل مجددًا أو أضف ملاحظات مكتوبة.',error:'استلام الحفظ غير مؤكد. احتفظ بهذه المعاينة وتحقق من استلام التسجيل الخاص.'},
  ur:{title:'بالمشافہ وضاحت ریکارڈ کریں',preview:'محفوظ کرنے سے پہلے سنیں',send:'نجی ریکارڈنگ محفوظ کریں',received:'نجی ریکارڈنگ محفوظ ہو گئی',permission:'مائیکروفون دستیاب نہیں۔ براؤزر کی اجازت چیک کریں یا تحریری حل کے نوٹس شامل کریں۔',format:'ریکارڈنگ تیار نہیں ہو سکی۔ دوبارہ ریکارڈ کریں یا تحریری نوٹس شامل کریں۔',error:'محفوظ ہونے کی تصدیق نہیں ہو سکی۔ پیش نظارہ برقرار رکھیں اور نجی ریکارڈنگ کی وصولی چیک کریں۔'},
};
export type RecorderProps = { language: 'en' | 'ar' | 'ur'; noticeLanguage?:'en'|'ar'|'ur'; purpose?:'answer'|'help'|'reply'|'in_person'; loadSiteNotice?:(language:'en'|'ar'|'ur',signal:AbortSignal)=>Promise<string|null>; retryOnly?:boolean; localOnlyNotice?:OfflineNotice; synthetic: boolean; disabled:boolean; saveAllowed:boolean;onSave:(bytes:Uint8Array,id:string,capturedAt:string)=>Promise<void>; onSend: (bytes: Uint8Array, submissionId: string) => Promise<void>;onUnsavedChange:(unsaved:boolean)=>void };
type Phase = 'idle' | 'requesting' | 'recording' | 'preview' | 'uploading' | 'received';

function stopTracks(live: MediaStream | null) {
  live?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
}

async function decodeRecording(source: Blob): Promise<AudioBuffer> {
  const context = new AudioContext();
  try { return await context.decodeAudioData(await source.arrayBuffer()); }
  finally { await context.close().catch(() => {}); }
}

export function WorkerRecorder({ language, noticeLanguage=language, purpose='answer', loadSiteNotice, retryOnly=false, localOnlyNotice, synthetic,disabled,saveAllowed,onSave, onSend,onUnsavedChange }: RecorderProps) {
  const t = {...labels[language],...(purpose==='in_person'?staffRecorderText[language]:purpose==='help'||purpose==='reply'?conversationRecorderText[language]:{})};
  const notice = purpose==='answer'?recordingNotice(language, synthetic):purpose==='in_person'?staffCaseRecordingNotice(language):conversationRecordingNotice(language);
  const title=purpose==='answer'||purpose==='in_person'?t.title:purpose==='help'?{en:'Record a help request',ar:'سجّل طلب مساعدة',ur:'مدد کی درخواست ریکارڈ کریں'}[language]:{en:'Record a reply',ar:'سجّل ردًا',ur:'جواب کا پیغام ریکارڈ کریں'}[language];
  const siteText=siteNoticeText[language];
  const [siteNotice,setSiteNotice]=useState<string|null>(null),[noticeReady,setNoticeReady]=useState(false),[noticeError,setNoticeError]=useState(false),[noticeTick,setNoticeTick]=useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState('');
  const [saving,setSaving]=useState(false),[saveStatus,setSaveStatus]=useState('');
  const saveText={en:{save:'Save recording on this device',saving:'Saving recording here...',saved:'Recording saved here, not sent.',failed:'Saving could not be confirmed. Your current preview remains.'},ar:{save:'احفظ التسجيل على هذا الجهاز',saving:'جارٍ حفظ التسجيل هنا...',saved:'حُفظ التسجيل هنا ولم يُرسل.',failed:'تعذر تأكيد الحفظ. تبقى المعاينة الحالية.'},ur:{save:'اس آلے پر ریکارڈنگ محفوظ کریں',saving:'ریکارڈنگ یہاں محفوظ ہو رہی ہے...',saved:'ریکارڈنگ یہاں محفوظ ہے، بھیجی نہیں گئی۔',failed:'محفوظ ہونے کی تصدیق نہیں ہو سکی۔ موجودہ پیش نظارہ باقی ہے۔'}}[language];
  const mounted = useRef(false);
  const generation = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  const media = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const blob = useRef<Blob | null>(null);
  const submission = useRef<RecordingSubmission | null>(null);
  const previewUrl = useRef('');
  const sending = useRef(false);
  const elapsed = useRef(0);
  const requestedStop = useRef(false);

  const changePhase = (next: Phase) => { phaseRef.current = next; if (mounted.current) setPhase(next); };
  const clearPreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = '';
    blob.current = null;
    submission.current = null;
    if(mounted.current)setSaveStatus('');
    if (mounted.current) setUrl('');
  };
  const releaseCapture = () => {
    const recorder = media.current;
    media.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* Already stopped by the browser. */ }
      }
    }
    stopTracks(stream.current);
    stream.current = null;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      releaseCapture();
      clearPreview();
    };
  }, []);
  useEffect(()=>{onUnsavedChange(recorderHasUnsent(phase));},[phase,onUnsavedChange]);
  useEffect(()=>()=>onUnsavedChange(false),[onUnsavedChange]);
  useEffect(()=>{
    const controller=new AbortController();setNoticeReady(false);setNoticeError(false);setSiteNotice(null);
    if(localOnlyNotice!==undefined){
      try{setSiteNotice(workerRecordingNotice(localOnlyNotice,noticeLanguage));setNoticeReady(true);}catch{setNoticeError(true);}
      return()=>controller.abort();
    }
    if(!loadSiteNotice){setNoticeError(true);return()=>controller.abort();}
    const load=loadSiteNotice(noticeLanguage,controller.signal);
    load.then(value=>{
      if(!controller.signal.aborted){setSiteNotice(value);setNoticeReady(true);}
    }).catch(()=>{if(!controller.signal.aborted)setNoticeError(true);});
    return()=>controller.abort();
  },[noticeLanguage,noticeTick,localOnlyNotice,loadSiteNotice,purpose]);
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => {
      elapsed.current = Math.min(90, elapsed.current + 1);
      setSeconds(elapsed.current);
      if (elapsed.current === 90 && media.current?.state === 'recording') {
        requestedStop.current = true;
        media.current.stop();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const discard = () => {
    generation.current++;
    releaseCapture();
    clearPreview();
    elapsed.current = 0;
    setSeconds(0);
    setError('');
    changePhase('idle');
  };

  const cancelRequest = () => {
    generation.current++;
    setError('');
    changePhase(blob.current ? 'preview' : 'idle');
  };

  const start = async () => {
    if (disabled || retryOnly || !noticeReady || !['idle', 'preview'].includes(phaseRef.current)) return;
    const request = ++generation.current;
    setError('');
    changePhase('requesting');
    let live: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error(t.permission);
      live = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
      if (!mounted.current || request !== generation.current) { stopTracks(live); return; }
      const preferred = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
        .find((mime) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mime));
      const recorder = preferred ? new MediaRecorder(live, { mimeType: preferred }) : new MediaRecorder(live);
      const chunks: Blob[] = [];
      let interrupted = false;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        stopTracks(live);
        if (stream.current === live) stream.current = null;
        if (media.current === recorder) media.current = null;
        if (!mounted.current || request !== generation.current) return;
        if (interrupted || !requestedStop.current) { setError(t.interrupted); changePhase('idle'); return; }
        const recorded = new Blob(chunks, { type: recorder.mimeType });
        if (!recorded.size) { setError(t.empty); changePhase('idle'); return; }
        blob.current = recorded;
        submission.current = createRecordingSubmission(recorded, crypto.randomUUID(), decodeRecording);
        previewUrl.current = URL.createObjectURL(recorded);
        setUrl(previewUrl.current);
        changePhase('preview');
      };
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = finish;
      recorder.onerror = () => {
        interrupted = true;
        if (recorder.state === 'inactive') finish();
        else { try { recorder.stop(); } catch { finish(); } }
      };
      for (const track of live.getTracks()) track.onended = () => {
        if (request !== generation.current) return;
        interrupted = true;
        if (recorder.state === 'inactive') finish();
        else { try { recorder.stop(); } catch { finish(); } }
      };
      recorder.start(500);
      clearPreview();
      stream.current = live;
      media.current = recorder;
      elapsed.current = 0;
      requestedStop.current = false;
      setSeconds(0);
      changePhase('recording');
    } catch {
      stopTracks(live);
      if (!mounted.current || request !== generation.current) return;
      setError(t.permission);
      changePhase(blob.current ? 'preview' : 'idle');
    }
  };

  const stop = () => {
    if (media.current?.state !== 'recording') return;
    try { requestedStop.current = true; media.current.stop(); }
    catch {
      generation.current++;
      releaseCapture();
      setError(t.interrupted);
      changePhase('idle');
    }
  };

  const send = async () => {
    if (localOnlyNotice!==undefined || disabled || !noticeReady || phaseRef.current !== 'preview' || sending.current || !blob.current || !submission.current) return;
    sending.current = true;
    const request = generation.current;
    const recordedSubmission = submission.current;
    changePhase('uploading');
    setError('');
    let startedUpload = false;
    try {
      const bytes = await recordedSubmission.bytes();
      if (!mounted.current || request !== generation.current) return;
      startedUpload = true;
      await onSend(bytes, recordedSubmission.submissionId);
      if (mounted.current && request === generation.current) {
        clearPreview();
        changePhase('received');
      }
    } catch (cause) {
      if (mounted.current && request === generation.current) {
        setError(cause instanceof WorkerAudioRetryError ? workerAudioRetryText[language][cause.code] : cause instanceof Error && /No audio|between 0\.25 and 90 seconds/.test(cause.message)
          ? t.empty : startedUpload ? t.error : t.format);
        changePhase('preview');
      }
    } finally { sending.current = false; }
  };

  const savePreview=async()=>{
    if(disabled || !saveAllowed || !noticeReady || sending.current || phaseRef.current!=='preview' || !submission.current)return;
    const recordedSubmission=submission.current,request=generation.current;sending.current=true;setSaving(true);setSaveStatus(saveText.saving);
    try {
      const bytes=await recordedSubmission.bytes();if(!mounted.current || request!==generation.current)return;
      await onSave(bytes,recordedSubmission.submissionId,recordedSubmission.capturedAt);
      if(mounted.current && request===generation.current)setSaveStatus(saveText.saved);
    }catch {if(mounted.current && request===generation.current)setSaveStatus(saveText.failed);}
    finally {sending.current=false;if(mounted.current)setSaving(false);}
  };

  return <div className="record-answer">
    <aside className="recording-notice" aria-label={notice.title}>
      <h3>{notice.title}</h3><p>{notice.local}</p><p>{notice.access} {notice.processing}</p><p>{notice.retention}</p>
      {!noticeReady && <p role={noticeError?'alert':'status'}>{noticeError?siteText.error:siteText.loading}</p>}
      {noticeError && <button className="button outline" onClick={()=>setNoticeTick(value=>value+1)}><RefreshCw size={18}/>{siteText.retry}</button>}
      {siteNotice && <><h3>{siteText.title}</h3><p className="recording-site-copy" lang={noticeLanguage} dir={noticeLanguage==='en'?'ltr':'rtl'}>{siteNotice}</p></>}
    </aside>
    {phase === 'idle' && <button className="button primary full" disabled={disabled || !noticeReady} onClick={start}><Mic size={20} />{title}</button>}
    {phase === 'requesting' && <><p role="status">{t.requesting}</p><button className="button outline full" onClick={cancelRequest}>{t.cancel}</button></>}
    {phase === 'recording' && <><div className="record-timer" role="status">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</div><button className="button primary full" onClick={stop}><Square size={18} />{t.stop}</button>{purpose!=='in_person'&&<button className="button outline full" onClick={discard}><Trash2 size={18} />{t.discard}</button>}</>}
    {(phase === 'preview' || phase === 'uploading') && <><label className="field">{t.preview}<audio controls src={url} /></label>{localOnlyNotice===undefined && <button className="button primary full" disabled={disabled || saving || phase === 'uploading' || !noticeReady} onClick={send}><Send size={18} />{phase === 'uploading' ? t.uploading : t.send}</button>}{purpose==='answer' && <button className="button outline full" disabled={disabled || saving || !saveAllowed || phase === 'uploading' || !noticeReady} onClick={()=>void savePreview()}><Save size={18}/>{saveText.save}</button>}<button className="button outline full" disabled={disabled || retryOnly || saving || phase === 'uploading' || !noticeReady} onClick={start}><RotateCcw size={18} />{t.again}</button>{purpose!=='in_person'&&<button className="button subtle full" disabled={retryOnly || saving || phase === 'uploading'} onClick={discard}><Trash2 size={18} />{t.discard}</button>}</>}
    {saveStatus && <p role="status">{saveStatus}</p>}
    {phase === 'received' && <><p className="record-receipt"><Play size={18} />{t.received}</p>{purpose!=='answer' && <button className="button outline full" disabled={disabled||retryOnly||!noticeReady} onClick={()=>{discard();void start();}}><Mic size={18}/>{title}</button>}</>}
    {error && <p role="alert" className="record-error">{error}</p>}
  </div>;
}
