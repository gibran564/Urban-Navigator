import { impactAtEdge, impactAtNode } from '@/engine/events';
import type { Incident, Graph, RoutePenalty } from './types';

export const NROWS = 11;
export const NCOLS = 11;

export const BASE_SEC = 60;

export const MIN_EDGE_SEC = BASE_SEC;

export const nid = (r: number, c: number): number => r * NCOLS + c;
export const nrc = (id: number) => ({ r: Math.floor(id / NCOLS), c: id % NCOLS });

export const hName = (r: number) => `Av. ${2 * (r + 1)}`;
export const vName = (c: number) => `C. ${2 * c + 1}`;

/** 1 = este/sur, -1 = oeste/norte */
export const hDir = (r: number) => r % 2 === 0 ? 1 : -1;
export const vDir = (c: number) => c % 2 === 0 ? 1 : -1;

export const hDirLabel = (r: number) => r % 2 === 0 ? 'este' : 'oeste';
export const vDirLabel = (c: number) => c % 2 === 0 ? 'sur' : 'norte';

export function speedFactor(r: number, c: number, incidents: Incident[]): number {
  const impact = impactAtNode(r, c, incidents);
  return impact.blocked ? 0 : impact.speedFactor;
}

export function edgeCost(
  r1: number, c1: number,
  r2: number, c2: number,
  incidents: Incident[]
): number {
  const impact = impactAtEdge(r1, c1, r2, c2, incidents);
  if (impact.blocked || impact.speedFactor === 0) return Infinity;
  return Math.round(BASE_SEC / impact.speedFactor);
}

export function edgeImpact(
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  incidents: Incident[]
): { risk: number; penalties: RoutePenalty[] } {
  const impact = impactAtEdge(r1, c1, r2, c2, incidents);
  return {
    risk: Math.round(impact.risk * 10) / 10,
    penalties: impact.penalties,
  };
}

function decisionWeight(cost: number, risk: number, penalties: RoutePenalty[]): number {
  const penaltyMinutes = penalties.reduce((total, penalty) => total + penalty.minutes, 0);
  return Math.round(cost + risk * 55 + penaltyMinutes * 30);
}

function graphEdge(
  to: number,
  cost: number,
  risk: number,
  penalties: RoutePenalty[]
) {
  return { to, cost, weight: decisionWeight(cost, risk, penalties), baseCost: BASE_SEC, risk, penalties };
}

/**
 * arma la lista de calles con sentido
 * filas pares van al este y las impares al oeste
 * columnas pares van al sur y las impares al norte
 */
interface BuildGraphOptions {
  avoidEventZones?: boolean;
}

export function buildGraph(incidents: Incident[], options: BuildGraphOptions = {}): Graph {
  const g: Graph = {};
  for (let r = 0; r < NROWS; r++)
    for (let c = 0; c < NCOLS; c++)
      g[nid(r, c)] = [];

  // calles horizontales
  for (let r = 0; r < NROWS; r++) {
    const hDirVal = hDir(r);
    for (let c = 0; c < NCOLS - 1; c++) {
      if (hDirVal === 1) {
        const cost = edgeCost(r, c, r, c + 1, incidents);
        if (isFinite(cost)) {
          const impact = edgeImpact(r, c, r, c + 1, incidents);
          if (options.avoidEventZones && impact.penalties.length > 0) continue;
          g[nid(r, c)].push(graphEdge(nid(r, c + 1), cost, impact.risk, impact.penalties));
        }
      } else {
        const cost = edgeCost(r, c + 1, r, c, incidents);
        if (isFinite(cost)) {
          const impact = edgeImpact(r, c + 1, r, c, incidents);
          if (options.avoidEventZones && impact.penalties.length > 0) continue;
          g[nid(r, c + 1)].push(graphEdge(nid(r, c), cost, impact.risk, impact.penalties));
        }
      }
    }
  }

  // calles verticales
  for (let c = 0; c < NCOLS; c++) {
    const vDirVal = vDir(c);
    for (let r = 0; r < NROWS - 1; r++) {
      if (vDirVal === 1) {
        const cost = edgeCost(r, c, r + 1, c, incidents);
        if (isFinite(cost)) {
          const impact = edgeImpact(r, c, r + 1, c, incidents);
          if (options.avoidEventZones && impact.penalties.length > 0) continue;
          g[nid(r, c)].push(graphEdge(nid(r + 1, c), cost, impact.risk, impact.penalties));
        }
      } else {
        const cost = edgeCost(r + 1, c, r, c, incidents);
        if (isFinite(cost)) {
          const impact = edgeImpact(r + 1, c, r, c, incidents);
          if (options.avoidEventZones && impact.penalties.length > 0) continue;
          g[nid(r + 1, c)].push(graphEdge(nid(r, c), cost, impact.risk, impact.penalties));
        }
      }
    }
  }

  return g;
}

/** vuelve a calcular el costo de una ruta completa */
export function pathCost(graph: Graph, path: number[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const edge = (graph[path[i]] || []).find(e => e.to === path[i + 1]);
    total += edge?.weight ?? edge?.cost ?? 0;
  }
  return total;
}
