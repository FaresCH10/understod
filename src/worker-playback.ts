export const workerPlaybackText = {
  en: {play:'Play',pause:'Pause',replay:'Replay',seek:'Playback position',speed:'Playback speed',loading:'Loading audio...',failed:'Audio could not be played. Reload the audio or read the text.',reload:'Reload audio'},
  ar: {play:'تشغيل',pause:'إيقاف مؤقت',replay:'إعادة التشغيل',seek:'موضع التشغيل',speed:'سرعة التشغيل',loading:'جارٍ تحميل الصوت...',failed:'تعذر تشغيل الصوت. أعد تحميل الصوت أو اقرأ النص.',reload:'إعادة تحميل الصوت'},
  ur: {play:'چلائیں',pause:'روکیں',replay:'دوبارہ چلائیں',seek:'آڈیو کی موجودہ جگہ',speed:'چلانے کی رفتار',loading:'آڈیو لوڈ ہو رہی ہے...',failed:'آڈیو نہیں چل سکی۔ آڈیو دوبارہ لوڈ کریں یا متن پڑھیں۔',reload:'آڈیو دوبارہ لوڈ کریں'},
};

export const workerPlaybackRates = [0.75,1,1.25,1.5,2] as const;

export function playbackSeconds(value:number):number {
  return Number.isFinite(value) && value>=0 ? value : 0;
}

export function playbackTime(value:number):string {
  const seconds=Math.floor(playbackSeconds(value));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}

export function playbackSeek(value:number,duration:number,ranges:readonly {start:number;end:number}[]):number|null {
  if(!Number.isFinite(value)||!Number.isFinite(duration)||duration<=0)return null;
  const target=Math.max(0,Math.min(value,duration));
  const usable=ranges.filter(range=>Number.isFinite(range.start)&&Number.isFinite(range.end)&&range.start>=0&&range.end>range.start&&range.start<duration)
    .map(range=>({start:range.start,end:Math.min(range.end,duration)}));
  if(!usable.length)return null;
  for(const range of usable)if(target>=range.start&&target<=range.end)return target;
  return usable.flatMap(range=>[range.start,range.end]).reduce((best,edge)=>Math.abs(target-edge)<Math.abs(target-best)?edge:best);
}
