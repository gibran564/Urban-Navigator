import { enrichRoute } from '@/engine/simulation';
import { impactAtNode } from '@/engine/events';
import { inferRouteDecision } from '@/inference/tauPrologEngine';
import { buildGraph, nid, nrc } from '@/lib/graph';
import { yenK } from '@/lib/pathfinding';
import type { Incident, SimulationResult } from '@/lib/types';

export async function calculateUrbanRoutes(params: {
  incidents: Incident[];
  originH: number;
  originV: number;
  destH: number;
  destV: number;
  limit?: number;
}): Promise<SimulationResult> {
  const start = nid(params.originH, params.originV);
  const end = nid(params.destH, params.destV);

  if (start === end) {
    return { routes: [], explanation: 'El origen y el destino son el mismo punto.' };
  }

  const strictGraph = buildGraph(params.incidents, { avoidEventZones: true });
  const graph = buildGraph(params.incidents);
  const origin = nrc(start);
  const destination = nrc(end);
  const originImpact = impactAtNode(origin.r, origin.c, params.incidents);
  const destinationImpact = impactAtNode(destination.r, destination.c, params.incidents);

  if (originImpact.blocked) {
    return {
      routes: [],
      explanation: 'No puedo crear la ruta: el origen esta dentro del radio de un cierre vial o bloqueo.',
    };
  }

  if (destinationImpact.blocked) {
    return {
      routes: [],
      explanation: 'No puedo crear la ruta: el destino esta cubierto por el radio de una eventualidad bloqueante.',
    };
  }

  const strictCandidates = yenK(strictGraph, start, end, params.limit ?? 12)
    .map((route, index) => enrichRoute(route, strictGraph, index));

  if (strictCandidates.length > 0) {
    return inferRouteDecision(strictCandidates);
  }

  const rawCandidates = yenK(graph, start, end, params.limit ?? 12);
  const candidates = rawCandidates.map((route, index) => enrichRoute(route, graph, index));
  if (!candidates.length) {
    return {
      routes: [],
      explanation: 'No puedo crear la ruta: las eventualidades bloquean completamente el transito hacia el destino.',
    };
  }

  return {
    routes: [],
    explanation: 'No puedo crear una ruta segura: todos los caminos disponibles atraviesan el radio de una eventualidad.',
  };
}
