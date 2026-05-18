'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { Incident, IncidentType, Route } from '@/lib/types';
import { buildGraph, NROWS, NCOLS, nid } from '@/lib/graph';
import { calculateUrbanRoutes } from '@/engine/routing';
import IncidentPanel from '@/components/IncidentPanel';
import RouteResults  from '@/components/RouteResults';
import PlayHUD       from '@/components/PlayHUD';
import ContextMenu, { type CtxState } from '@/components/ContextMenu';
import type { ThemeName } from '@/renderer/mapTheme';
import { Calculator, Map, MapPin, Moon, RotateCcw, Sun } from 'lucide-react';

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
  const [isCalculating, setIsCalculating] = useState(false);
  const [theme, setTheme] = useState<ThemeName>('dark');

  const graph = useMemo(() => buildGraph(incidents), [incidents]);

  const resetTaxi   = () => { setIsPlaying(false); setTaxiProg(0); };
  const clearRoutes = useCallback(() => {
    setRoutes([]);
    setError('');
    setIsPlaying(false);
    setTaxiProg(0);
    setSelRoute(0);
  }, []);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('urban-navigator-theme');
    if (storedTheme === 'light' || storedTheme === 'dark') setTheme(storedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('urban-navigator-theme', theme);
  }, [theme]);

  const calcRoutes = async () => {
    setError('');
    resetTaxi();
    setSelRoute(0);

    const s = nid(originH, originV), e = nid(destH, destV);
    if (s === e) {
      setRoutes([]);
      setError('El origen y el destino son el mismo punto.');
      return;
    }

    setIsCalculating(true);
    try {
      const [result] = await Promise.all([
        calculateUrbanRoutes({ incidents, originH, originV, destH, destV, limit: 12 }),
        new Promise((resolve) => setTimeout(resolve, 650)),
      ]);
      setRoutes(result.routes.slice(0, 3));
      if (!result.routes.length) setError(result.explanation ?? 'No hay ruta posible. Revisa bloqueos y cierres.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo ejecutar la inferencia.';
      setRoutes([]);
      setError(message);
    } finally {
      setIsCalculating(false);
    }
  };

  const fullReset = () => {
    setIncidents([]); setRoutes([]); setError('');
    setOriginH(0); setOriginV(0); setDestH(NROWS-1); setDestV(NCOLS-1);
    setSelRoute(0); resetTaxi(); setCtx(CLOSED);
  };

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
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-row">
            <div className="brand-icon-wrap">UN</div>
            <div className="brand-text-wrap">
              <div className="brand-title">Urban Navigator</div>
              <div className="brand-tagline">Control urbano tactico · Tau Prolog</div>
            </div>
          </div>
          <button className="theme-toggle" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>

        <div className="sidebar-scroll">
          <div className="section-card">
            <div className="section-title">
              <MapPin size={14} /> Origen y Destino
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
              <div className="hint-text">
                <strong>Clic derecho</strong> en cualquier intersección del mapa para fijar puntos o añadir incidencias rápidamente.
              </div>
            </div>
          </div>

          {/* Incidents */}
          <IncidentPanel incidents={incidents}
            onChange={inc=>{setIncidents(inc);clearRoutes();}}/>

          {/* Action buttons */}
          <div className="action-row">
            <button className="btn-calc" onClick={calcRoutes} disabled={isCalculating}>
              <Calculator size={16} />
              {isCalculating ? 'Analizando...' : 'Calcular rutas'}
            </button>
            <button className="btn-secondary" onClick={fullReset} title="Reiniciar todo">
              <RotateCcw size={15} />
            </button>
          </div>

          {/* Legend */}
          <div className="section-card">
            <div className="section-title"><Map size={14} /> Leyenda</div>
            <div className="legend-wrap">
              {([
                ['#1f2937','Calle'],['#0f172a','Manzana'],
                ['#dc2626','Cierre vial'],['#f97316','Congestion'],
                ['#a855f7','Manifestacion'],['#2dd4bf','Ruta 1'],
                ['#60a5fa','Ruta 2'],['#fb923c','Ruta 3'],
                ['#facc15','Taxi'],
              ] as [string,string][]).map(([bg,lbl])=>(
                <div key={lbl} className="leg-row">
                  <div className="leg-dot" style={{background:bg, border:'1.5px solid rgba(0,0,0,0.1)'}}/>{lbl}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Map ──────────────────────────────────────────────── */}
      <div className="main-area">
        <div className="map-wrap">
          <MapCanvas
            incidents={incidents} routes={routes}
            originH={originH} originV={originV}
            destH={destH} destV={destV}
            isPlaying={isPlaying} playSpeed={playSpeed}
            selectedRoute={selRoute} taxiProgress={taxiProg}
            theme={theme}
            isCalculating={isCalculating}
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

        <RouteResults routes={routes} graph={graph} error={error} isCalculating={isCalculating} />
      </div>

      <ContextMenu state={ctx} onClose={()=>setCtx(CLOSED)}
        onSetOrigin={ctxOrigin} onSetDest={ctxDest}
        onAddIncident={ctxAddInc} onRemoveIncident={ctxRmInc}/>
    </div>
  );
}
