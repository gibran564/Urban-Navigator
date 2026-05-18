import { NCOLS, NROWS } from '@/lib/graph';

export const STREET = 16;
export const BLOCK = 54;
export const STEP = STREET + BLOCK;
export const MAP_OFFSET = 54;
export const GRID_SIZE = NCOLS * STREET + (NCOLS - 1) * BLOCK;
export const CANVAS_WIDTH = MAP_OFFSET * 2 + GRID_SIZE;
export const CANVAS_HEIGHT = CANVAS_WIDTH;

export interface Point {
  x: number;
  y: number;
}

export function nodeX(c: number): number {
  return MAP_OFFSET + c * STEP + STREET / 2;
}

export function nodeY(r: number): number {
  return MAP_OFFSET + r * STEP + STREET / 2;
}

export function nearestNode(px: number, py: number): { r: number; c: number } | null {
  let best = Infinity;
  let row = -1;
  let col = -1;

  for (let r = 0; r < NROWS; r++) {
    for (let c = 0; c < NCOLS; c++) {
      const distance = Math.hypot(px - nodeX(c), py - nodeY(r));
      if (distance < best) {
        best = distance;
        row = r;
        col = c;
      }
    }
  }

  return best < STEP * 0.42 ? { r: row, c: col } : null;
}

export function pathAt(points: Point[], progress: number): Point {
  const segmentCount = points.length - 1;
  if (segmentCount <= 0) return points[0] ?? { x: 0, y: 0 };
  const t = Math.min(progress * segmentCount, segmentCount - 0.001);
  const index = Math.floor(t);
  const fraction = t - index;
  const start = points[index];
  const end = points[index + 1];
  return {
    x: start.x + fraction * (end.x - start.x),
    y: start.y + fraction * (end.y - start.y),
  };
}

export function angleAt(points: Point[], progress: number): number {
  const segmentCount = points.length - 1;
  if (segmentCount <= 0) return 0;
  const index = Math.min(Math.floor(progress * segmentCount), segmentCount - 1);
  return Math.atan2(points[index + 1].y - points[index].y, points[index + 1].x - points[index].x);
}

export function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return a + delta * t;
}
