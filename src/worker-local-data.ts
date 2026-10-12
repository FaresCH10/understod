export async function clearWorkerLocalData(context?:string,storage?:Storage,clearAudio?:()=>Promise<void>,clearBriefings?:()=>Promise<void>){
  let cleared=true;
  try {const tab=storage ?? sessionStorage;for(const key of Object.keys(tab))if(key.startsWith('understood:'))tab.removeItem(key);}catch {cleared=false;}
  try {
    if(clearAudio)await clearAudio();
    else {const {clearAudioDraft}=await import('./worker-audio-draft.ts');await clearAudioDraft(undefined,context);}
  }catch {cleared=false;}
  try {
    if(clearBriefings)await clearBriefings();
    else {const {clearOfflineBriefings}=await import('./worker-offline.ts');await clearOfflineBriefings(context);}
  }catch {cleared=false;}
  return cleared;
}
export const localCleanupText={
  en:{failed:'Session ended, but local cleanup could not be confirmed. Remove saved data before sharing this device.',remove:'Remove local saved data'},
  ar:{failed:'انتهت الجلسة، لكن تعذر تأكيد تنظيف البيانات المحلية. احذف البيانات المحفوظة قبل مشاركة هذا الجهاز.',remove:'احذف البيانات المحلية المحفوظة'},
  ur:{failed:'سیشن ختم ہو گیا، مگر مقامی صفائی کی تصدیق نہیں ہو سکی۔ آلہ مشترک کرنے سے پہلے محفوظ ڈیٹا ہٹائیں۔',remove:'مقامی محفوظ ڈیٹا ہٹائیں'},
};
