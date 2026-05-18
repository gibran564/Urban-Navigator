'use client';
import type { Incident, IncidentType } from '@/lib/types';
import { NROWS, NCOLS } from '@/lib/graph';
import { MAX_EVENT_RADIUS } from '@/engine/events';
import {
  AlertTriangle,
  Ban,
  Camera,
  CircleOff,
  Cone,
  Plus,
  Siren,
  Trash2,
  TrafficCone,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const TYPES: [IncidentType, string][] = [
  ['accident','Accidente'],
  ['construction','Obra'],
  ['protest','Manifestación'],
  ['emergency','Emergencia'],
  ['signal','Semáforo dañado'],
  ['closure','Cierre vial'],
  ['congestion','Congestión'],
  ['traffic','Tráfico'],
  ['radar','Radar'],
  ['none','Inactivo'],
];

const EVENT_ICONS: Partial<Record<IncidentType, LucideIcon>> = {
  accident: AlertTriangle,
  construction: Cone,
  protest: Users,
  emergency: Siren,
  signal: TrafficCone,
  closure: Ban,
  congestion: TrafficCone,
  block: Ban,
  traffic: TrafficCone,
  radar: Camera,
  none: CircleOff,
};

export default function IncidentPanel({ incidents, onChange }: { incidents:Incident[]; onChange:(i:Incident[])=>void }) {
  const upd = (idx:number, patch:Partial<Incident>) => onChange(incidents.map((inc,i)=>i===idx?{...inc,...patch}:inc));
  const rm  = (idx:number) => onChange(incidents.filter((_,i)=>i!==idx));
  const add = () => {
    if (incidents.length >= 10) return;
    onChange([...incidents, { id:crypto.randomUUID(), type:'accident', hIdx:5, vIdx:5, radius:MAX_EVENT_RADIUS, severity:0.8 }]);
  };
  return (
    <div className="section-card">
      <div className="section-title"><Zap size={14} /> Eventos urbanos</div>
      <div className="inc-list">
        {!incidents.length && <p className="inc-empty">Sin incidencias. Usa clic derecho en el mapa para añadir.</p>}
        {incidents.map((inc, idx) => {
          const Icon = EVENT_ICONS[inc.type] ?? AlertTriangle;
          return (
          <div key={inc.id} className="inc-row">
            <div className={`inc-type-badge ${inc.type}`}><Icon size={15} /></div>
            <div className="inc-selects">
              <select className="inc-sel" value={inc.type} onChange={e=>upd(idx,{type:e.target.value as IncidentType})}>
                {TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
              <select className="inc-sel" value={inc.hIdx} onChange={e=>upd(idx,{hIdx:+e.target.value})}>
                {Array.from({length:NROWS},(_,r)=><option key={r} value={r}>H-{2*(r+1)}</option>)}
              </select>
              <select className="inc-sel" value={inc.vIdx} onChange={e=>upd(idx,{vIdx:+e.target.value})}>
                {Array.from({length:NCOLS},(_,c)=><option key={c} value={c}>V-{2*c+1}</option>)}
              </select>
              <select className="inc-sel" value={Math.min(inc.radius ?? MAX_EVENT_RADIUS, MAX_EVENT_RADIUS)} onChange={e=>upd(idx,{radius:+e.target.value})}>
                {[0,1].map(v=><option key={v} value={v}>{v === 1 ? '3x3' : 'Punto'}</option>)}
              </select>
            </div>
            <button className="inc-del" onClick={()=>rm(idx)} title="Eliminar evento"><Trash2 size={14} /></button>
          </div>
        )})}
      </div>
      <button className="btn-add-inc" onClick={add} disabled={incidents.length>=10}>
        <Plus size={14} />
        Añadir evento
      </button>
    </div>
  );
}
