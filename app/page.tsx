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

const VELOCIDADES  = [0.5, 1, 2, 4];
const MENU_CERRADO: CtxState = { visible:false, r:0, c:0, screenX:0, screenY:0, hasIncident:false };

export default function Page() {
  const [incidencias,  setIncidencias ] = useState<Incident[]>([]);
  const [origenH,    setOrigenH   ] = useState(0);
  const [origenV,    setOrigenV   ] = useState(0);
  const [destinoH,      setDestinoH     ] = useState(NROWS - 1);
  const [destinoV,      setDestinoV     ] = useState(NCOLS - 1);
  const [rutas,     setRutas    ] = useState<Route[]>([]);
  const [mensajeError,      setMensajeError     ] = useState('');
  const [estaReproduciendo,  setEstaReproduciendo ] = useState(false);
  const [velocidadReproduccion,  setVelocidadReproduccion ] = useState(1);
  const [rutaSeleccionada,   setRutaSeleccionada  ] = useState(0);
  const [progresoTaxi,   setProgresoTaxi  ] = useState(0);
  const [estadoMenu,        setEstadoMenu       ] = useState<CtxState>(MENU_CERRADO);

  const grafo = useMemo(() => buildGraph(incidencias), [incidencias]);

  const reiniciarTaxi   = () => { setEstaReproduciendo(false); setProgresoTaxi(0); };
  const limpiarRutas = useCallback(() => { setRutas([]); setMensajeError(''); setEstaReproduciendo(false); setProgresoTaxi(0); }, []);

  const calcularRutas = () => {
    setMensajeError(''); reiniciarTaxi();
    const s = nid(origenH, origenV), e = nid(destinoH, destinoV);
    if (s === e) { setRutas([]); setMensajeError('El origen y el destino son el mismo punto.'); return; }
    const res = yenK(grafo, s, e, 3);
    setRutas(res);
    if (!res.length) setMensajeError('No hay ruta posible. Revisa los bloqueos.');
  };

  const reinicioCompleto = () => {
    setIncidencias([]); setRutas([]); setMensajeError('');
    setOrigenH(0); setOrigenV(0); setDestinoH(NROWS-1); setDestinoV(NCOLS-1);
    reiniciarTaxi(); setEstadoMenu(MENU_CERRADO);
  };

  // Menu con clic derecho
  const alAbrirMenuContextual = useCallback((r:number, c:number, sx:number, sy:number) => {
    setIncidencias(inc => {
      const has = inc.some(i => i.hIdx===r && i.vIdx===c && i.type!=='none');
      setEstadoMenu({ visible:true, r, c, screenX:sx, screenY:sy, hasIncident:has });
      return inc;
    });
  }, []);

  const menuPonerOrigen = useCallback((r:number,c:number) => { setOrigenH(r); setOrigenV(c); limpiarRutas(); }, [limpiarRutas]);
  const menuPonerDestino   = useCallback((r:number,c:number) => { setDestinoH(r);   setDestinoV(c);   limpiarRutas(); }, [limpiarRutas]);

  const menuAgregarIncidencia = useCallback((r:number,c:number,type:IncidentType) => {
    setIncidencias(prev => {
      const filtered = prev.filter(i => !(i.hIdx===r && i.vIdx===c));
      return [...filtered, { id:crypto.randomUUID(), type, hIdx:r, vIdx:c }];
    });
    limpiarRutas();
  }, [limpiarRutas]);

  const menuQuitarIncidencia = useCallback((r:number,c:number) => {
    setIncidencias(prev => prev.filter(i => !(i.hIdx===r && i.vIdx===c)));
    limpiarRutas();
  }, [limpiarRutas]);

  const alCambiarProgresoTaxi = useCallback((p:number) => setProgresoTaxi(p), []);
  const alTerminarTaxi = useCallback(() => setEstaReproduciendo(false), []);

  const opcionesH = Array.from({length:NROWS}, (_,r) => ({v:r, l:`H-${2*(r+1)}`}));
  const opcionesV = Array.from({length:NCOLS}, (_,c) => ({v:c, l:`V-${2*c+1}`}));

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
                <select className="od-select" value={origenH} onChange={e=>{setOrigenH(+e.target.value);limpiarRutas();}}>
                  {opcionesH.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="od-field">
                <div className="od-field-label">
                  <div className="od-badge origin">O</div> Origen V
                </div>
                <select className="od-select" value={origenV} onChange={e=>{setOrigenV(+e.target.value);limpiarRutas();}}>
                  {opcionesV.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="od-field">
                <div className="od-field-label">
                  <div className="od-badge dest">D</div> Destino H
                </div>
                <select className="od-select" value={destinoH} onChange={e=>{setDestinoH(+e.target.value);limpiarRutas();}}>
                  {opcionesH.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="od-field">
                <div className="od-field-label">
                  <div className="od-badge dest">D</div> Destino V
                </div>
                <select className="od-select" value={destinoV} onChange={e=>{setDestinoV(+e.target.value);limpiarRutas();}}>
                  {opcionesV.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
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
          <IncidentPanel incidents={incidencias}
            onChange={inc=>{setIncidencias(inc);limpiarRutas();}}/>

          {/* Botones */}
          <div className="action-row">
            <button className="btn-calc" onClick={calcularRutas}>
              ⚡ Calcular rutas
            </button>
            <button className="btn-secondary" onClick={reinicioCompleto} title="Reiniciar todo">
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
            incidents={incidencias} routes={rutas}
            originH={origenH} originV={origenV}
            destH={destinoH} destV={destinoV}
            isPlaying={estaReproduciendo} playSpeed={velocidadReproduccion}
            selectedRoute={rutaSeleccionada} taxiProgress={progresoTaxi}
            onContextMenu={alAbrirMenuContextual}
            onTaxiProgress={alCambiarProgresoTaxi}
            onTaxiDone={alTerminarTaxi}
          />

          {rutas.length > 0 && (
            <PlayHUD
              routes={rutas} selectedRoute={rutaSeleccionada}
              isPlaying={estaReproduciendo} playSpeed={velocidadReproduccion} taxiProgress={progresoTaxi}
              onSelectRoute={(i)=>{setRutaSeleccionada(i);reiniciarTaxi();}}
              onPlay={()=>setEstaReproduciendo(true)}
              onPause={()=>setEstaReproduciendo(false)}
              onReset={reiniciarTaxi}
              onSpeedCycle={()=>setVelocidadReproduccion(p=>{const i=VELOCIDADES.indexOf(p);return VELOCIDADES[(i+1)%VELOCIDADES.length];})}
            />
          )}
        </div>

        <RouteResults routes={rutas} graph={grafo} error={mensajeError} />
      </div>

      <ContextMenu state={estadoMenu} onClose={()=>setEstadoMenu(MENU_CERRADO)}
        onSetOrigin={menuPonerOrigen} onSetDest={menuPonerDestino}
        onAddIncident={menuAgregarIncidencia} onRemoveIncident={menuQuitarIncidencia}/>
    </div>
  );
}
