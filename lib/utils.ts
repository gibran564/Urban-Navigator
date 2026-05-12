import type { Graph, RouteStep } from './types';
import { nrc, hName, vName } from './graph';

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m} min`;
  return `${m}m ${s}s`;
}

export function fmtDist(hops: number): string {
  return `${hops} cuadra${hops !== 1 ? 's' : ''}`;
}

export function pathToSteps(path: number[], graph: Graph): RouteStep[] {
  if (path.length < 2) return [];
  const steps: RouteStep[] = [];
  let dir = '', count = 0, street = '', timeSec = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const { r: r1, c: c1 } = nrc(path[i]);
    const { r: r2, c: c2 } = nrc(path[i + 1]);
    const nd = r1 === r2
      ? (c2 > c1 ? 'este' : 'oeste')
      : (r2 > r1 ? 'sur'  : 'norte');
    const ns = r1 === r2 ? hName(r1) : vName(c1);
    const edge = (graph[path[i]] ?? []).find(e => e.to === path[i + 1]);
    const edgeSec = edge?.cost ?? 0;

    if (nd === dir && ns === street) { count++; timeSec += edgeSec; }
    else {
      if (dir) steps.push({ dir, count, street, timeSec });
      dir = nd; count = 1; street = ns; timeSec = edgeSec;
    }
  }
  if (dir) steps.push({ dir, count, street, timeSec });
  return steps;
}

export function dirArrow(dir: string): string {
  return { este: '→', oeste: '←', sur: '↓', norte: '↑' }[dir] ?? '•';
}
