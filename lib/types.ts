export type IncidentType = 'block' | 'traffic' | 'radar' | 'none';

export interface Incident {
  id: string;
  type: IncidentType;
  hIdx: number; // row index (0-10)
  vIdx: number; // col index (0-10)
}

export interface Route {
  path: number[];
  cost: number;
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
}

export type Graph = Record<number, GraphEdge[]>;
