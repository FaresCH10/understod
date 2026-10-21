import {useEffect,useRef,useState} from 'react';
import {Pause,Play,RefreshCw,RotateCcw} from 'lucide-react';
import {playbackSeconds,playbackSeek,playbackTime,workerPlaybackRates,workerPlaybackText} from './worker-playback';
import type {WorkerUiLanguage} from './worker-ui-language';

type Props={src:string;label:string;language:WorkerUiLanguage;onPlayer?:(player:HTMLAudioElement|null)=>void;onPlay?:()=>void};

export function WorkerAudioPlayer({src,label,language,onPlayer,onPlay}:Props){
  const audio=useRef<HTMLAudioElement|null>(null),generation=useRef(0);
  const [playing,setPlaying]=useState(false),[waiting,setWaiting]=useState(false),[failed,setFailed]=useState(false);
  const [position,setPosition]=useState(0),[duration,setDuration]=useState(0),[rate,setRate]=useState(1),[canSeek,setCanSeek]=useState(false);
  const t=workerPlaybackText[language];
  const sync=()=>{
    const player=audio.current;if(!player)return;
    setPosition(playbackSeconds(player.currentTime));setDuration(playbackSeconds(player.duration));
    const ranges=Array.from({length:player.seekable.length},(_,index)=>({start:player.seekable.start(index),end:player.seekable.end(index)}));
    setCanSeek(playbackSeek(0,player.duration,ranges)!==null);
  };
  useEffect(()=>{
    const player=audio.current;generation.current++;
    setPlaying(false);setWaiting(false);setFailed(false);setPosition(0);setDuration(0);setCanSeek(false);setRate(1);
    if(player)player.playbackRate=1;
    return()=>{generation.current++;player?.pause();};
  },[src]);
  const play=async()=>{
    const player=audio.current;if(!player)return;
    const request=++generation.current;setFailed(false);setWaiting(true);
    try{await player.play();}
    catch{if(request===generation.current){setFailed(true);setPlaying(false);setWaiting(false);}}
  };
  const seek=(value:number)=>{
    const player=audio.current;if(!player)return;
    const ranges=Array.from({length:player.seekable.length},(_,index)=>({start:player.seekable.start(index),end:player.seekable.end(index)}));
    const target=playbackSeek(value,player.duration,ranges);if(target===null)return;
    try{player.currentTime=target;sync();}catch{setFailed(true);}
  };
  const pause=()=>{generation.current++;audio.current?.pause();setWaiting(false);};
  return <div className="worker-player" role="group" aria-label={label}>
    <audio src={src} preload="metadata" ref={element=>{audio.current=element;onPlayer?.(element);}}
      onLoadedMetadata={sync} onDurationChange={sync} onTimeUpdate={sync} onProgress={sync} onSeeked={sync}
      onPlay={()=>{setPlaying(true);onPlay?.();}} onPlaying={()=>{setPlaying(true);setWaiting(false);setFailed(false);}}
      onPause={()=>{setPlaying(false);setWaiting(false);}} onEnded={()=>{setPlaying(false);setWaiting(false);sync();}}
      onWaiting={()=>setWaiting(true)} onError={()=>{setFailed(true);setPlaying(false);setWaiting(false);}}
      onRateChange={()=>setRate(audio.current?.playbackRate??1)}/>
    <div className="worker-player-controls">
      <button type="button" className="worker-player-play" aria-label={playing||waiting?t.pause:t.play} title={playing||waiting?t.pause:t.play} onClick={()=>playing||waiting?pause():void play()}>
        {playing||waiting?<Pause size={25} aria-hidden="true"/>:<Play size={25} aria-hidden="true"/>}
      </button>
      <div className="worker-player-position" dir="ltr">
        <span className="worker-player-time">{playbackTime(position)} / {duration>0?playbackTime(duration):'--:--'}</span>
        <input type="range" min={0} max={duration||1} step={0.1} value={Math.min(position,duration||0)} disabled={!canSeek||failed}
          aria-label={t.seek} aria-valuetext={`${playbackTime(position)} / ${duration>0?playbackTime(duration):'--:--'}`}
          onChange={event=>seek(Number(event.target.value))}/>
      </div>
      <button type="button" className="icon-button" disabled={!canSeek||failed} aria-label={t.replay} title={t.replay} onClick={()=>{seek(0);void play();}}><RotateCcw size={24} aria-hidden="true"/></button>
      <select aria-label={t.speed} title={t.speed} value={rate} onChange={event=>{const value=Number(event.target.value);if(audio.current&&workerPlaybackRates.some(rate=>rate===value))audio.current.playbackRate=value;}}>
        {workerPlaybackRates.map(value=><option key={value} value={value}>{value}x</option>)}
      </select>
    </div>
    {waiting&&!failed&&<p role="status" className="muted">{t.loading}</p>}
    {failed&&<div className="worker-player-failure"><p role="alert">{t.failed}</p><button type="button" className="icon-button" aria-label={t.reload} title={t.reload} onClick={()=>{generation.current++;setFailed(false);setPlaying(false);setWaiting(false);setPosition(0);setDuration(0);setCanSeek(false);audio.current?.load();}}><RefreshCw size={20} aria-hidden="true"/></button></div>}
  </div>;
}
