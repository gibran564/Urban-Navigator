export type IncidentType =
  | 'accident'
  | 'construction'
  | 'protest'
  | 'emergency'
  | 'signal'
  | 'closure'
  | 'congestion'
  | 'block'
  | 'traffic'
  | 'radar'
  | 'none';

export interface Incident {
  id: string;
  type: IncidentType;
  hIdx: number;
  vIdx: number;
  radius?: number;
  severity?: number;
}

export interface Route {
  id?: string;
  label?: string;
  path: number[];
  cost: number;
  baseMinutes?: number;
  delayMinutes?: number;
  totalMinutes?: number;
  riskScore?: number;
  exposureScore?: number;
  efficiencyScore?: number;
  penalties?: RoutePenalty[];
  decision?: RouteDecision;
}

export interface RoutePenalty {
  eventId: string;
  type: IncidentType;
  label: string;
  minutes: number;
  risk: number;
  affectedBlocks: number;
}

export interface RouteDecision {
  rank: number;
  verdict: 'recommended' | 'alternative' | 'discarded';
  reason: string;
  prologFacts: string[];
}

export interface RouteStep {
  street: string;
  dir: string;
  count: number;
  timeSec: number;
}

export interface GraphEdge {
  to: number;
  cost: number;
  weight: number;
  baseCost: number;
  risk: number;
  penalties: RoutePenalty[];
}

export type Graph = Record<number, GraphEdge[]>;

export interface SimulationResult {
  routes: Route[];
  recommendedRouteId?: string;
  explanation?: string;
}
