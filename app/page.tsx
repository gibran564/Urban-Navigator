'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { Incident, IncidentType, Route } from '@/lib/types';
import { buildGraph, NROWS, NCOLS, nid } from '@/lib/graph';
import { yenK } from '@/lib/pathfinding';
import IncidentPanel from '@/components/IncidentPanel';
import RouteResults  from '@/components/RouteResults';
import PlayHUD       from '@/components/PlayHUD';
import ContextMenu, { type CtxState } from '@/components/ContextMenu';

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

const SPEEDS  = [0.5, 1, 2, 4];
const CLOSED: CtxState = { visible:false, r:0, c:0, screenX:0, screenY:0, hasIncident:false };

export default function Page() {
  const [incidents,  setIncidents ] = useState<Incident[]>([]);
  const [originH,    setOriginH   ] = useState(0);
  const [originV,    setOriginV   ] = useState(0);
  const [destH,      setDestH     ] = useState(NROWS - 1);
  const [destV,      setDestV     ] = useState(NCOLS - 1);
  const [routes,     setRoutes    ] = useState<Route[]>([]);
  const [error,      setError     ] = useState('');
  const [isPlaying,  setIsPlaying ] = useState(false);
  const [playSpeed,  setPlaySpeed ] = useState(1);
  const [selRoute,   setSelRoute  ] = useState(0);
  const [taxiProg,   setTaxiProg  ] = useState(0);
  const [ctx,        setCtx       ] = useState<CtxState>(CLOSED);

  const graph = useMemo(() => buildGraph(incidents), [incidents]);

  const resetTaxi   = () => { setIsPlaying(false); setTaxiProg(0); };
  const clearRoutes = useCallback(() => { setRoutes([]); setError(''); setIsPlaying(false); setTaxiProg(0); }, []);

  const calcRoutes = () => {
    setError(''); resetTaxi();
    const s = nid(originH, originV), e = nid(destH, destV);
    if (s === e) { setRoutes([]); setError('El origen y el destino son el mismo punto.'); return; }
    const res = yenK(graph, s, e, 3);
    setRoutes(res);
    if (!res.length) setError('No hay ruta posible. Revisa los bloqueos.');
  };

  const fullReset = () => {
    setIncidents([]); setRoutes([]); setError('');
    setOriginH(0); setOriginV(0); setDestH(NROWS-1); setDestV(NCOLS-1);
    resetTaxi(); setCtx(CLOSED);
  };

  // Menu con clic derecho
  const onCtxMenu = useCallback((r:number, c:number, sx:number, sy:number) => {
    setIncidents(inc => {
      const has = inc.some(i => i.hIdx===r && i.vIdx===c && i.type!=='none');
      setCtx({ visible:true, r, c, screenX:sx, screenY:sy, hasIncident:has });
      return inc;
    });
  }, []);

  const ctxOrigin = useCallback((r:number,c:number) => { setOriginH(r); setOriginV(c); clearRoutes(); }, [clearRoutes]);
  const ctxDest   = useCallback((r:number,c:number) => { setDestH(r);   setDestV(c);   clearRoutes(); }, [clearRoutes]);

  const ctxAddInc = useCallback((r:number,c:number,type:IncidentType) => {
    setIncidents(prev => {
      const filtered = prev.filter(i => !(i.hIdx===r && i.vIdx===c));
      return [...filtered, { id:crypto.randomUUID(), type, hIdx:r, vIdx:c }];
    });
    clearRoutes();
  }, [clearRoutes]);

  const ctxRmInc = useCallback((r:number,c:number) => {
    setIncidents(prev => prev.filter(i => !(i.hIdx===r && i.vIdx===c)));
    clearRoutes();
  }, [clearRoutes]);

  const onTaxiProg = useCallback((p:number) => setTaxiProg(p), []);
  const onTaxiDone = useCallback(() => setIsPlaying(false), []);

  const hOpts = Array.from({length:NROWS}, (_,r) => ({v:r, l:`H-${2*(r+1)}`}));
  const vOpts = Array.from({length:NCOLS}, (_,c) => ({v:c, l:`V-${2*c+1}`}));

  return (
    <div className="app-layout">
      {/* Panel lateral */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-row">
            <div className="brand-icon-wrap">🗺️</div>
            <div className="brand-text-wrap">
              <div className="brand-title">Urban Navigator</div>
              <div className="brand-tagline">Busca el mejor camino · A* + Yen&apos;s K</div>
            </div>
          </div>
        </div>

        <div className="sidebar-scroll">
          {/* Origen y destino */}
          <div className="section-card">
            <div className="section-title">
              <span className="section-title-icon">📍</span> Origen y Destino
            </div>
            <div className="od-grid">
              <div className="od-field">
                <div className="od-field-label">
                  <div className="od-badge origin">O</div> Origen H
                </div>
                <select className="od-select" value={originH} onChange={e=>{setOriginH(+e.target.value);clearRoutes();}}>
                  {hOpts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="od-field">
                <div className="od-field-label">
                  <div className="od-badge origin">O</div> Origen V
                </div>
                <select className="od-select" value={originV} onChange={e=>{setOriginV(+e.target.value);clearRoutes();}}>
                  {vOpts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="od-field">
                <div className="od-field-label">
                  <div className="od-badge dest">D</div> Destino H
                </div>
                <select className="od-select" value={destH} onChange={e=>{setDestH(+e.target.value);clearRoutes();}}>
                  {hOpts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="od-field">
                <div className="od-field-label">
                  <div className="od-badge dest">D</div> Destino V
                </div>
                <select className="od-select" value={destV} onChange={e=>{setDestV(+e.target.value);clearRoutes();}}>
                  {vOpts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            </div>
            <div className="hint-box">
              <span className="hint-icon">🖱️</span>
              <div className="hint-text">
                <strong>Clic derecho</strong> en cualquier intersección del mapa para fijar puntos o añadir incidencias rápidamente.
              </div>
            </div>
          </div>

          {/* Incidencias */}
          <IncidentPanel incidents={incidents}
            onChange={inc=>{setIncidents(inc);clearRoutes();}}/>

          {/* Botones */}
          <div className="action-row">
            <button className="btn-calc" onClick={calcRoutes}>
              ⚡ Calcular rutas
            </button>
            <button className="btn-secondary" onClick={fullReset} title="Reiniciar todo">
              ↺
            </button>
          </div>

          {/* Leyenda */}
          <div className="section-card">
            <div className="section-title"><span className="section-title-icon">🗺️</span> Leyenda</div>
            <div className="legend-wrap">
              {([
                ['#e0d4c0','Calle'],['#f5eddb','Manzana'],
                ['#e03c3c','Bloqueo 🚧'],['#e8742a','Tráfico 🚦'],
                ['#38bdf8','Radar 📷'],['#3aa857','Ruta 1'],
                ['#3b82f6','Ruta 2'],['#e8742a','Ruta 3'],
                ['#fdd835','Taxi 🚕'],
              ] as [string,string][]).map(([bg,lbl])=>(
                <div key={lbl} className="leg-row">
                  <div className="leg-dot" style={{background:bg, border:'1.5px solid rgba(0,0,0,0.1)'}}/>{lbl}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Mapa */}
      <div className="main-area">
        <div className="map-wrap">
          <MapCanvas
            incidents={incidents} routes={routes}
            originH={originH} originV={originV}
            destH={destH} destV={destV}
            isPlaying={isPlaying} playSpeed={playSpeed}
            selectedRoute={selRoute} taxiProgress={taxiProg}
            onContextMenu={onCtxMenu}
            onTaxiProgress={onTaxiProg}
            onTaxiDone={onTaxiDone}
          />

          {routes.length > 0 && (
            <PlayHUD
              routes={routes} selectedRoute={selRoute}
              isPlaying={isPlaying} playSpeed={playSpeed} taxiProgress={taxiProg}
              onSelectRoute={(i)=>{setSelRoute(i);resetTaxi();}}
              onPlay={()=>setIsPlaying(true)}
              onPause={()=>setIsPlaying(false)}
              onReset={resetTaxi}
              onSpeedCycle={()=>setPlaySpeed(p=>{const i=SPEEDS.indexOf(p);return SPEEDS[(i+1)%SPEEDS.length];})}
            />
          )}
        </div>

        <RouteResults routes={routes} graph={graph} error={error} />
      </div>

      <ContextMenu state={ctx} onClose={()=>setCtx(CLOSED)}
        onSetOrigin={ctxOrigin} onSetDest={ctxDest}
        onAddIncident={ctxAddInc} onRemoveIncident={ctxRmInc}/>
    </div>
  );
}
