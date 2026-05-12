'use client';
import type { Route } from '@/lib/types';
import { fmtTime } from '@/lib/utils';

interface Props {
  routes:Route[]; selectedRoute:number; isPlaying:boolean;
  playSpeed:number; taxiProgress:number;
  onSelectRoute:(i:number)=>void; onPlay:()=>void; onPause:()=>void;
  onReset:()=>void; onSpeedCycle:()=>void;
}

const SPEEDS = [0.5,1,2,4];
const SPEED_LABEL: Record<number,string> = {0.5:'½×',1:'1×',2:'2×',4:'4×'};
const TAB_CLASS = ['rt1','rt2','rt3'];
const ROUTE_NAMES = ['Ruta 1','Ruta 2','Ruta 3'];
const PLAY_BG = ['#3aa857','#3b82f6','#e8742a'];

export default function PlayHUD({ routes, selectedRoute, isPlaying, playSpeed, taxiProgress,
  onSelectRoute, onPlay, onPause, onReset, onSpeedCycle }: Props) {
  if (!routes.length) return null;
  const route = routes[selectedRoute];
  const done  = taxiProgress >= 1;
  const barColor = ['var(--green)','var(--blue)','var(--orange)'][selectedRoute];

  return (
    <div className="play-hud">
      {/* Route tabs */}
      <div className="hud-route-tabs">
        {routes.map((r,i)=>(
          <button key={i} className={`hud-tab ${selectedRoute===i?TAB_CLASS[i]:''}`}
            onClick={()=>onSelectRoute(i)} title={`${ROUTE_NAMES[i]} · ${fmtTime(r.cost)}`}>
            {ROUTE_NAMES[i]}
          </button>
        ))}
      </div>

      <div className="hud-sep"/>

      {/* Progress */}
      <div className="hud-progress">
        <div className="hud-time-row">
          <span className="hud-elapsed" style={{color:barColor}}>
            {fmtTime(Math.round(route.cost * taxiProgress))}
          </span>
          <span className="hud-total">de {fmtTime(route.cost)}</span>
        </div>
        <div className="hud-track">
          <div className="hud-fill" style={{width:`${taxiProgress*100}%`,background:barColor}}/>
        </div>
      </div>

      <div className="hud-sep"/>

      {/* Controls */}
      <div className="hud-controls">
        <button className="hud-icon-btn" onClick={onReset} title="Reiniciar">↺</button>

        <button className="hud-play-btn"
          style={{background: PLAY_BG[selectedRoute]}}
          onClick={done ? onReset : isPlaying ? onPause : onPlay}
          title={done?'Reiniciar':isPlaying?'Pausar':'¡Dale!'}>
          {done ? '↺' : isPlaying ? '⏸' : '▶'}
        </button>

        <button className="hud-speed" onClick={onSpeedCycle} title="Cambiar velocidad">
          {SPEED_LABEL[playSpeed]}
        </button>
      </div>
    </div>
  );
}
