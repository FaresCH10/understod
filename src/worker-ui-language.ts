import {validWorkerSession,type PageSession} from './session-state.ts';

export type WorkerUiLanguage='en'|'ar'|'ur';
export const workerUiLanguageKey='understood:worker-ui-language';
export function readWorkerUiLanguage(storage:Pick<Storage,'getItem'>,session:PageSession,now=Date.now()):WorkerUiLanguage {
  const fallback=session.language==='ar' || session.language==='ur'?session.language:'en';
  if(!validWorkerSession(session,now))return fallback;
  try {
    const raw=storage.getItem(workerUiLanguageKey);if(!raw || raw.length>300)return fallback;
    const value=JSON.parse(raw);
    return value && value.context===session.clientContext && value.expiresAt===session.expiresAt
      && ['en','ar','ur'].includes(value.language)?value.language:fallback;
  }catch {return fallback;}
}
export function saveWorkerUiLanguage(storage:Pick<Storage,'getItem'|'setItem'>,session:PageSession,language:WorkerUiLanguage,now=Date.now()) {
  if(!validWorkerSession(session,now) || !['en','ar','ur'].includes(language))throw Error('Language selection unavailable');
  const raw=JSON.stringify({context:session.clientContext,expiresAt:session.expiresAt,language});
  storage.setItem(workerUiLanguageKey,raw);
  if(storage.getItem(workerUiLanguageKey)!==raw)throw Error('Language selection was not saved');
}
export const workerUiLanguageText={
  en:{label:'Interface language',failed:'The interface language could not be saved. Your current language is unchanged.',content:'Assigned briefing languages stay unchanged.'},
  ar:{label:'لغة الواجهة',failed:'تعذر حفظ لغة الواجهة. لم تتغير اللغة الحالية.',content:'تبقى لغات التعليمات المسندة دون تغيير.'},
  ur:{label:'انٹرفیس کی زبان',failed:'انٹرفیس کی زبان محفوظ نہیں ہو سکی۔ موجودہ زبان تبدیل نہیں ہوئی۔',content:'تفویض شدہ ہدایات کی زبانیں تبدیل نہیں ہوں گی۔'},
};
