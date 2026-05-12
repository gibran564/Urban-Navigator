import type { Incident, Graph } from './types';

export const NROWS = 11;
export const NCOLS = 11;

/**
 * Base cost per cuadra (seconds).
 * H streets (avenidas): 40 km/h → 200m / (40000/3600) ≈ 18 s.
 * V streets (calles):   30 km/h → 200m / (30000/3600) ≈ 24 s.
 * We use 60 s as a round "comfortable" baseline (includes lights etc).
 */
export const BASE_SEC = 60;

/** Minimum edge cost used by the A* heuristic (must be ≤ any real edge) */
export const MIN_EDGE_SEC = BASE_SEC; // no incident → factor=1 → cost=60

export const nid = (r: number, c: number): number => r * NCOLS + c;
export const nrc = (id: number) => ({ r: Math.floor(id / NCOLS), c: id % NCOLS });

export const hName = (r: number) => `Av. ${2 * (r + 1)}`;
export const vName = (c: number) => `C. ${2 * c + 1}`;

/** 1 = east/south, -1 = west/north */
export const hDir = (r: number) => r % 2 === 0 ? 1 : -1;
export const vDir = (c: number) => c % 2 === 0 ? 1 : -1;

export const hDirLabel = (r: number) => r % 2 === 0 ? 'este' : 'oeste';
export const vDirLabel = (c: number) => c % 2 === 0 ? 'sur' : 'norte';

/**
 * Speed factor at node (r,c).
 * Returns 0 if blocked, else fraction in (0,1].
 */
export function speedFactor(r: number, c: number, incidents: Incident[]): number {
  let factor = 1.0;
  for (const inc of incidents) {
    if (inc.type === 'none') continue;
    if (Math.abs(r - inc.hIdx) <= 1 && Math.abs(c - inc.vIdx) <= 1) {
      if (inc.type === 'block') return 0;
      if (inc.type === 'traffic') factor = Math.min(factor, 0.25);
      if (inc.type === 'radar')   factor = Math.min(factor, 0.50);
    }
  }
  return factor;
}

/**
 * Edge cost in seconds between adjacent nodes.
 * Applies worst-case factor from both endpoints.
 */
export function edgeCost(
  r1: number, c1: number,
  r2: number, c2: number,
  incidents: Incident[]
): number {
  const f = Math.min(speedFactor(r1, c1, incidents), speedFactor(r2, c2, incidents));
  if (f === 0) return Infinity;
  return Math.round(BASE_SEC / f);
}

/**
 * Build adjacency list for the directed city grid.
 * Horizontal even rows go east; odd rows go west.
 * Vertical even cols go south; odd cols go north.
 */
export function buildGraph(incidents: Incident[]): Graph {
  const g: Graph = {};
  for (let r = 0; r < NROWS; r++)
    for (let c = 0; c < NCOLS; c++)
      g[nid(r, c)] = [];

  // Horizontal edges
  for (let r = 0; r < NROWS; r++) {
    const d = hDir(r);
    for (let c = 0; c < NCOLS - 1; c++) {
      if (d === 1) {
        const cost = edgeCost(r, c, r, c + 1, incidents);
        if (isFinite(cost)) g[nid(r, c)].push({ to: nid(r, c + 1), cost });
      } else {
        const cost = edgeCost(r, c + 1, r, c, incidents);
        if (isFinite(cost)) g[nid(r, c + 1)].push({ to: nid(r, c), cost });
      }
    }
  }

  // Vertical edges
  for (let c = 0; c < NCOLS; c++) {
    const d = vDir(c);
    for (let r = 0; r < NROWS - 1; r++) {
      if (d === 1) {
        const cost = edgeCost(r, c, r + 1, c, incidents);
        if (isFinite(cost)) g[nid(r, c)].push({ to: nid(r + 1, c), cost });
      } else {
        const cost = edgeCost(r + 1, c, r, c, incidents);
        if (isFinite(cost)) g[nid(r + 1, c)].push({ to: nid(r, c), cost });
      }
    }
  }

  return g;
}

/** Re-compute exact cost of a complete path through the graph */
export function pathCost(graph: Graph, path: number[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const edge = (graph[path[i]] || []).find(e => e.to === path[i + 1]);
    total += edge?.cost ?? 0;
  }
  return total;
}
