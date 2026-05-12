'use client';
import { useEffect, useRef } from 'react';
import type { IncidentType } from '@/lib/types';

export interface CtxState {
  visible:boolean; r:number; c:number;
  screenX:number; screenY:number; hasIncident:boolean;
}

interface Props {
  state: CtxState;
  onClose: () => void;
  onSetOrigin:      (r:number,c:number) => void;
  onSetDest:        (r:number,c:number) => void;
  onAddIncident:    (r:number,c:number,type:IncidentType) => void;
  onRemoveIncident: (r:number,c:number) => void;
}

export default function ContextMenu({ state, onClose, onSetOrigin, onSetDest, onAddIncident, onRemoveIncident }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { visible, r, c, screenX, screenY, hasIncident } = state;

  useEffect(() => {
    if (!visible) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey   = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [visible, onClose]);

  if (!visible) return null;

  const menuH = hasIncident ? 270 : 230;
  const x = Math.min(screenX, window.innerWidth  - 210);
  const y = Math.min(screenY, window.innerHeight - menuH);

  const go = (fn: () => void) => { fn(); onClose(); };

  return (
    <>
      <div className="ctx-overlay" onClick={onClose} />
      <div ref={ref} className="ctx-menu" style={{ left:x, top:y }}>
        <div className="ctx-header">
          <div className="ctx-node">H-{2*(r+1)} × V-{2*c+1}</div>
          <div className="ctx-hint">¿Qué hacemos aquí?</div>
        </div>

        <div className="ctx-group">
          <button className="ctx-btn" onClick={() => go(() => onSetOrigin(r,c))}>
            <span className="ctx-btn-icon green">🟢</span>
            Fijar como <strong>Origen</strong>
          </button>
          <button className="ctx-btn" onClick={() => go(() => onSetDest(r,c))}>
            <span className="ctx-btn-icon red">🔴</span>
            Fijar como <strong>Destino</strong>
          </button>
        </div>

        <div className="ctx-sep" />

        <div className="ctx-group">
          <button className="ctx-btn" onClick={() => go(() => onAddIncident(r,c,'block'))}>
            <span className="ctx-btn-icon red">🚧</span>
            Añadir <strong>Bloqueo</strong>
          </button>
          <button className="ctx-btn" onClick={() => go(() => onAddIncident(r,c,'traffic'))}>
            <span className="ctx-btn-icon orange">🚦</span>
            Añadir <strong>Tráfico intenso</strong>
          </button>
          <button className="ctx-btn" onClick={() => go(() => onAddIncident(r,c,'radar'))}>
            <span className="ctx-btn-icon sky">📷</span>
            Añadir <strong>Radar</strong>
          </button>
        </div>

        {hasIncident && (
          <>
            <div className="ctx-sep" />
            <div className="ctx-group">
              <button className="ctx-btn ctx-danger" onClick={() => go(() => onRemoveIncident(r,c))}>
                <span className="ctx-btn-icon muted">🗑️</span>
                Quitar incidencia
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
