'use client';
import type { Route, Graph } from '@/lib/types';
import { pathToSteps, fmtTime, fmtDist, dirArrow } from '@/lib/utils';

interface Props { routes:Route[]; graph:Graph; error?:string; isCalculating?: boolean; }

const LABELS = ['Ruta recomendada','Alternativa A','Alternativa B'];

export default function RouteResults({ routes, graph, error, isCalculating }: Props) {
  if (isCalculating) return (
    <div className="results-wrap"><div className="status-box">Tau Prolog evaluando tiempo, riesgo y penalizaciones...</div></div>
  );
  if (error) return (
    <div className="results-wrap"><div className="error-box">{error}</div></div>
  );
  if (!routes.length) return null;
  const fastest = routes[0].cost;

  return (
    <div className="results-wrap">
      <div className="results-row">
        {routes.map((route, ri) => {
          const steps = pathToSteps(route.path, graph);
          const pct   = ri > 0 ? `+${Math.round((route.cost-fastest)/fastest*100)}%` : null;
          const mainPenalty = route.penalties?.[0];
          return (
            <div key={ri} className={`result-card r${ri+1}`}>
              <div className="result-head">
                <span className="result-label">{LABELS[ri]}</span>
                <span className="result-time">{route.totalMinutes ?? Math.round(route.cost / 60)} min</span>
              </div>
              <div className="result-badges">
                <span className="badge badge-hops">{fmtDist(route.path.length-1)}</span>
                <span className="badge badge-risk">Riesgo {route.riskScore?.toFixed(1) ?? '0.0'}</span>
                {pct && <span className="badge badge-slower">{pct} más lento</span>}
              </div>
              <p className="result-reason">{route.decision?.reason}</p>
              <div className="time-breakdown">
                Base {route.baseMinutes ?? route.path.length - 1} min
                {' + '}
                eventos {route.delayMinutes ?? 0} min
                {mainPenalty ? ` · mayor impacto: ${mainPenalty.label}` : ''}
              </div>
              <div className="result-steps">
                {steps.map((s,si)=>(
                  <div key={si} className="step-row">
                    {dirArrow(s.dir)} <span className="step-street">{s.street}</span>
                    {' · '}{s.count} cdr
                    <span className="step-t"> ({fmtTime(s.timeSec)})</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
