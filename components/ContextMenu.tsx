'use client';
import { useEffect, useRef } from 'react';
import type { IncidentType } from '@/lib/types';
import { AlertTriangle, Ban, CircleDot, Flag, Gauge, Trash2 } from 'lucide-react';

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
          <div className="ctx-hint">Nodo urbano seleccionado</div>
        </div>

        <div className="ctx-group">
          <button className="ctx-btn" onClick={() => go(() => onSetOrigin(r,c))}>
            <span className="ctx-btn-icon green"><CircleDot size={15} /></span>
            Fijar como <strong>Origen</strong>
          </button>
          <button className="ctx-btn" onClick={() => go(() => onSetDest(r,c))}>
            <span className="ctx-btn-icon red"><Flag size={15} /></span>
            Fijar como <strong>Destino</strong>
          </button>
        </div>

        <div className="ctx-sep" />

        <div className="ctx-group">
          <button className="ctx-btn" onClick={() => go(() => onAddIncident(r,c,'accident'))}>
            <span className="ctx-btn-icon red"><AlertTriangle size={15} /></span>
            Añadir <strong>Accidente</strong>
          </button>
          <button className="ctx-btn" onClick={() => go(() => onAddIncident(r,c,'congestion'))}>
            <span className="ctx-btn-icon orange"><Gauge size={15} /></span>
            Añadir <strong>Congestión</strong>
          </button>
          <button className="ctx-btn" onClick={() => go(() => onAddIncident(r,c,'closure'))}>
            <span className="ctx-btn-icon sky"><Ban size={15} /></span>
            Añadir <strong>Cierre vial</strong>
          </button>
        </div>

        {hasIncident && (
          <>
            <div className="ctx-sep" />
            <div className="ctx-group">
              <button className="ctx-btn ctx-danger" onClick={() => go(() => onRemoveIncident(r,c))}>
                <span className="ctx-btn-icon muted"><Trash2 size={15} /></span>
                Quitar incidencia
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
