import type { Incident, IncidentType, RoutePenalty } from '@/lib/types';

export interface UrbanEventConfig {
  label: string;
  icon: string;
  color: string;
  radius: number;
  severity: number;
  speedFactor: number;
  risk: number;
  blocksRoad: boolean;
}

export const MAX_EVENT_RADIUS = 1;

function clampEventRadius(radius: number): number {
  return Math.max(0, Math.min(MAX_EVENT_RADIUS, radius));
}

export const URBAN_EVENT_CONFIG: Record<IncidentType, UrbanEventConfig> = {
  accident: { label: 'Accidente', icon: '!', color: '#ef4444', radius: 1, severity: 0.85, speedFactor: 0.35, risk: 8, blocksRoad: false },
  construction: { label: 'Obra vial', icon: 'W', color: '#f59e0b', radius: 1, severity: 0.55, speedFactor: 0.55, risk: 4, blocksRoad: false },
  protest: { label: 'Manifestacion', icon: 'M', color: '#a855f7', radius: 1, severity: 0.75, speedFactor: 0.42, risk: 6, blocksRoad: false },
  emergency: { label: 'Emergencia', icon: 'E', color: '#06b6d4', radius: 1, severity: 0.65, speedFactor: 0.48, risk: 7, blocksRoad: false },
  signal: { label: 'Semaforo danado', icon: 'S', color: '#f97316', radius: 1, severity: 0.45, speedFactor: 0.62, risk: 5, blocksRoad: false },
  closure: { label: 'Cierre vial', icon: 'X', color: '#dc2626', radius: 1, severity: 1, speedFactor: 0, risk: 10, blocksRoad: true },
  congestion: { label: 'Congestion', icon: 'C', color: '#f97316', radius: 1, severity: 0.6, speedFactor: 0.5, risk: 3, blocksRoad: false },
  block: { label: 'Bloqueo', icon: 'X', color: '#dc2626', radius: 1, severity: 1, speedFactor: 0, risk: 10, blocksRoad: true },
  traffic: { label: 'Trafico intenso', icon: 'T', color: '#f97316', radius: 1, severity: 0.65, speedFactor: 0.45, risk: 4, blocksRoad: false },
  radar: { label: 'Radar', icon: 'R', color: '#38bdf8', radius: 1, severity: 0.35, speedFactor: 0.7, risk: 2, blocksRoad: false },
  none: { label: 'Inactivo', icon: '-', color: '#94a3b8', radius: 0, severity: 0, speedFactor: 1, risk: 0, blocksRoad: false },
};

export interface EventImpact {
  speedFactor: number;
  delaySeconds: number;
  risk: number;
  blocked: boolean;
  penalties: RoutePenalty[];
}

export function normalizeIncident(incident: Incident): Incident {
  const config = URBAN_EVENT_CONFIG[incident.type];
  return {
    ...incident,
    radius: clampEventRadius(incident.radius ?? config.radius),
    severity: incident.severity ?? config.severity,
  };
}

export function normalizeIncidents(incidents: Incident[]): Incident[] {
  return incidents.filter((event) => event.type !== 'none').map(normalizeIncident);
}

export function impactAtNode(r: number, c: number, incidents: Incident[]): EventImpact {
  return impactAtDistance((event) => Math.max(Math.abs(r - event.hIdx), Math.abs(c - event.vIdx)), incidents);
}

export function impactAtEdge(
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  incidents: Incident[]
): EventImpact {
  return impactAtDistance((event) => distanceFromEventToSegment(event.hIdx, event.vIdx, r1, c1, r2, c2), incidents);
}

function impactAtDistance(distanceFor: (event: Incident) => number, incidents: Incident[]): EventImpact {
  let speedFactor = 1;
  let delaySeconds = 0;
  let risk = 0;
  let blocked = false;
  const penalties: RoutePenalty[] = [];

  for (const rawEvent of normalizeIncidents(incidents)) {
    const config = URBAN_EVENT_CONFIG[rawEvent.type];
    const radius = clampEventRadius(rawEvent.radius ?? config.radius);
    const severity = rawEvent.severity ?? config.severity;
    const distance = distanceFor(rawEvent);

    if (distance > radius) continue;

    const falloff = 1 - distance / (radius + 1);
    const weight = Math.max(0, Math.min(1, severity * falloff));
    const eventFactor = config.blocksRoad && distance <= radius ? 0 : 1 - (1 - config.speedFactor) * weight;
    const eventDelay = Math.round(60 * (1 / Math.max(eventFactor, 0.15) - 1));
    const eventRisk = Math.round(config.risk * weight * 10) / 10;

    if (config.blocksRoad && distance <= radius) blocked = true;
    speedFactor = Math.min(speedFactor, Math.max(0, eventFactor));
    delaySeconds += eventDelay;
    risk += eventRisk;
    penalties.push({
      eventId: rawEvent.id,
      type: rawEvent.type,
      label: config.label,
      minutes: Math.round((eventDelay / 60) * 10) / 10,
      risk: eventRisk,
      affectedBlocks: distance === 0 ? 1 : 0,
    });
  }

  return { speedFactor, delaySeconds, risk, blocked, penalties };
}

function distanceFromEventToSegment(
  eventR: number,
  eventC: number,
  r1: number,
  c1: number,
  r2: number,
  c2: number
): number {
  if (r1 === r2) {
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);
    const columnDistance = eventC < minC ? minC - eventC : eventC > maxC ? eventC - maxC : 0;
    return Math.max(Math.abs(eventR - r1), columnDistance);
  }

  const minR = Math.min(r1, r2);
  const maxR = Math.max(r1, r2);
  const rowDistance = eventR < minR ? minR - eventR : eventR > maxR ? eventR - maxR : 0;
  return Math.max(Math.abs(eventC - c1), rowDistance);
}

export function mergePenalties(items: RoutePenalty[]): RoutePenalty[] {
  const byEvent = new Map<string, RoutePenalty>();

  for (const item of items) {
    const current = byEvent.get(item.eventId);
    if (!current) {
      byEvent.set(item.eventId, { ...item });
      continue;
    }
    current.minutes = Math.round((current.minutes + item.minutes) * 10) / 10;
    current.risk = Math.round((current.risk + item.risk) * 10) / 10;
    current.affectedBlocks += item.affectedBlocks;
  }

  return [...byEvent.values()].sort((a, b) => b.minutes + b.risk - (a.minutes + a.risk));
}
