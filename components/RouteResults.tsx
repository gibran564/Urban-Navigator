'use client';
import type { Route, Graph } from '@/lib/types';
import { pathToSteps, fmtTime, fmtDist, dirArrow } from '@/lib/utils';

interface Props { routes:Route[]; graph:Graph; error?:string; }

const LABELS = ['Ruta óptima 🥇','Alternativa A','Alternativa B'];

export default function RouteResults({ routes, graph, error }: Props) {
  if (error) return (
    <div className="results-wrap"><div className="error-box">😕 {error}</div></div>
  );
  if (!routes.length) return null;
  const fastest = routes[0].cost;

  return (
    <div className="results-wrap">
      <div className="results-row">
        {routes.map((route, ri) => {
          const steps = pathToSteps(route.path, graph);
          const pct   = ri > 0 ? `+${Math.round((route.cost-fastest)/fastest*100)}%` : null;
          return (
            <div key={ri} className={`result-card r${ri+1}`}>
              <div className="result-head">
                <span className="result-label">{LABELS[ri]}</span>
                <span className="result-time">{fmtTime(route.cost)}</span>
              </div>
              <div className="result-badges">
                <span className="badge badge-hops">{fmtDist(route.path.length-1)}</span>
                {pct && <span className="badge badge-slower">{pct} más lento</span>}
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
