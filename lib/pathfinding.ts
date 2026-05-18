import type { Graph, Route } from './types';
import { nrc, MIN_EDGE_SEC, pathCost } from './graph';

class MinHeap {
  private h: [number, number][] = [];

  push(f: number, node: number) {
    this.h.push([f, node]);
    this._up(this.h.length - 1);
  }

  pop(): [number, number] | undefined {
    if (!this.h.length) return undefined;
    const top = this.h[0];
    const last = this.h.pop()!;
    if (this.h.length) { this.h[0] = last; this._down(0); }
    return top;
  }

  get size() { return this.h.length; }

  private _up(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[p][0] <= this.h[i][0]) break;
      [this.h[p], this.h[i]] = [this.h[i], this.h[p]]; i = p;
    }
  }

  private _down(i: number) {
    const n = this.h.length;
    for (;;) {
      let s = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this.h[l][0] < this.h[s][0]) s = l;
      if (r < n && this.h[r][0] < this.h[s][0]) s = r;
      if (s === i) break;
      [this.h[s], this.h[i]] = [this.h[i], this.h[s]]; i = s;
    }
  }
}

function heuristic(u: number, end: number): number {
  const a = nrc(u), b = nrc(end);
  return (Math.abs(a.r - b.r) + Math.abs(a.c - b.c)) * MIN_EDGE_SEC;
}

/**
 * A* shortest path on a directed graph.
 *
 * @param forbiddenEdges  Set of "u-v" string keys to skip
 * @param forbiddenNodes  Set of node ids to skip (except destination)
 */
export function astar(
  graph: Graph,
  start: number,
  end: number,
  forbiddenEdges: Set<string> = new Set(),
  forbiddenNodes: Set<number> = new Set()
): Route | null {
  const g = new Map<number, number>();
  const prev = new Map<number, number>();
  const closed = new Set<number>();

  g.set(start, 0);
  const pq = new MinHeap();
  pq.push(heuristic(start, end), start);

  while (pq.size > 0) {
    const [, u] = pq.pop()!;
    if (closed.has(u)) continue;
    closed.add(u);
    if (u === end) break;

    for (const { to, cost, weight } of (graph[u] ?? [])) {
      if (forbiddenEdges.has(`${u}-${to}`)) continue;
      if (forbiddenNodes.has(to) && to !== end) continue;

      const ng = (g.get(u) ?? Infinity) + (weight ?? cost);
      if (ng < (g.get(to) ?? Infinity)) {
        g.set(to, ng);
        prev.set(to, u);
        pq.push(ng + heuristic(to, end), to);
      }
    }
  }

  const cost = g.get(end);
  if (cost === undefined || !isFinite(cost)) return null;

  // Reconstruct path
  const path: number[] = [];
  let cur: number | undefined = end;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return { path, cost };
}

export function yenK(graph: Graph, start: number, end: number, K = 3): Route[] {
  const r0 = astar(graph, start, end);
  if (!r0) return [];

  const A: Route[] = [r0];
  const B: Route[] = [];

  for (let k = 1; k < K; k++) {
    const prevRoute = A[k - 1];

    for (let i = 0; i < prevRoute.path.length - 1; i++) {
      const spurNode = prevRoute.path[i];
      const rootPath = prevRoute.path.slice(0, i + 1);
      const rootSig  = rootPath.join(',');

      const forbEdges = new Set<string>();
      for (const route of A) {
        if (route.path.slice(0, i + 1).join(',') === rootSig) {
          forbEdges.add(`${route.path[i]}-${route.path[i + 1]}`);
        }
      }

      const forbNodes = new Set<number>(rootPath.slice(0, -1));

      const spurRes = astar(graph, spurNode, end, forbEdges, forbNodes);
      if (!spurRes) continue;

      const fullPath = [...rootPath.slice(0, -1), ...spurRes.path];
      const sig = fullPath.join(',');

      const duplicate =
        B.some(x => x.path.join(',') === sig) ||
        A.some(x => x.path.join(',') === sig);

      if (!duplicate) {
        B.push({ path: fullPath, cost: pathCost(graph, fullPath) });
      }
    }

    if (!B.length) break;
    B.sort((a, b) => a.cost - b.cost);
    A.push(B.shift()!);
  }

  return A;
}
