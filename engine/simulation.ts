import { mergePenalties } from '@/engine/events';
import type { Graph, Route, RoutePenalty } from '@/lib/types';

const BASE_MINUTES_PER_BLOCK = 1;

export function enrichRoute(route: Route, graph: Graph, index: number): Route {
  let totalSeconds = 0;
  let baseSeconds = 0;
  let riskScore = 0;
  const penalties: RoutePenalty[] = [];

  for (let i = 0; i < route.path.length - 1; i++) {
    const edge = graph[route.path[i]]?.find((item) => item.to === route.path[i + 1]);
    if (!edge) continue;
    totalSeconds += edge.cost;
    baseSeconds += edge.baseCost;
    riskScore += edge.risk;
    penalties.push(...edge.penalties);
  }

  const totalMinutes = Math.max(BASE_MINUTES_PER_BLOCK, Math.round(totalSeconds / 60));
  const baseMinutes = Math.max(0, Math.round(baseSeconds / 60));
  const delayMinutes = Math.max(0, totalMinutes - baseMinutes);
  const normalizedRisk = Math.round(riskScore * 10) / 10;
  const mergedPenalties = mergePenalties(penalties);
  const exposureScore = Math.round(mergedPenalties.reduce((total, penalty) => {
    return total + penalty.risk + penalty.minutes * 2 + penalty.affectedBlocks;
  }, 0) * 10) / 10;
  const efficiencyScore = Math.max(0, Math.round((100 - totalMinutes * 2.5 - normalizedRisk * 3 - exposureScore * 2) * 10) / 10);

  return {
    ...route,
    id: `route_${index + 1}`,
    label: index === 0 ? 'Ruta recomendada' : `Alternativa ${index}`,
    cost: totalSeconds,
    baseMinutes,
    delayMinutes,
    totalMinutes,
    riskScore: normalizedRisk,
    exposureScore,
    efficiencyScore,
    penalties: mergedPenalties,
  };
}

export function sortRoutesForDecision(routes: Route[]): Route[] {
  return [...routes].sort((a, b) => {
    const scoreA = (a.totalMinutes ?? a.cost / 60) * 1.3 + (a.riskScore ?? 0) * 1.4 + (a.exposureScore ?? 0) * 2.4 - (a.efficiencyScore ?? 0) / 20;
    const scoreB = (b.totalMinutes ?? b.cost / 60) * 1.3 + (b.riskScore ?? 0) * 1.4 + (b.exposureScore ?? 0) * 2.4 - (b.efficiencyScore ?? 0) / 20;
    return scoreA - scoreB;
  });
}
