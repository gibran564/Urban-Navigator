'use client';
import type { Incident, IncidentType } from '@/lib/types';
import { NROWS, NCOLS } from '@/lib/graph';

const INC_ICONS: Record<string, string> = { block:'🚧', traffic:'🚦', radar:'📷', none:'⬜' };
const TYPES: [IncidentType, string][] = [['block','Bloqueo'],['traffic','Tráfico'],['radar','Radar'],['none','Inactivo']];

export default function IncidentPanel({ incidents, onChange }: { incidents:Incident[]; onChange:(i:Incident[])=>void }) {
  const upd = (idx:number, patch:Partial<Incident>) => onChange(incidents.map((inc,i)=>i===idx?{...inc,...patch}:inc));
  const rm  = (idx:number) => onChange(incidents.filter((_,i)=>i!==idx));
  const add = () => {
    if (incidents.length >= 10) return;
    onChange([...incidents, { id:crypto.randomUUID(), type:'block', hIdx:5, vIdx:5 }]);
  };
  return (
    <div className="section-card">
      <div className="section-title"><span className="section-title-icon">⚠️</span> Incidencias</div>
      <div className="inc-list">
        {!incidents.length && <p className="inc-empty">Sin incidencias — usa clic derecho en el mapa para añadir 👆</p>}
        {incidents.map((inc, idx) => (
          <div key={inc.id} className="inc-row">
            <div className={`inc-type-badge ${inc.type}`}>{INC_ICONS[inc.type]}</div>
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
            </div>
            <button className="inc-del" onClick={()=>rm(idx)}>×</button>
          </div>
        ))}
      </div>
      <button className="btn-add-inc" onClick={add} disabled={incidents.length>=10}>
        + Añadir manualmente
      </button>
    </div>
  );
}
