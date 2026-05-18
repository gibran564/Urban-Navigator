export type ThemeName = 'light' | 'dark';

export interface MapTheme {
  background: number;
  street: number;
  streetLine: number;
  block: number;
  blockEdge: number;
  node: number;
  text: number;
  tooltip: number;
  routeColors: number[];
  origin: number;
  destination: number;
  taxi: number;
  taxiRoof: number;
}

export const MAP_THEMES: Record<ThemeName, MapTheme> = {
  light: {
    background: 0xf5f7fb,
    street: 0xd8dee9,
    streetLine: 0xb8c2d1,
    block: 0xffffff,
    blockEdge: 0xdbe3ef,
    node: 0x94a3b8,
    text: 0x475569,
    tooltip: 0x111827,
    routeColors: [0x22c55e, 0x3b82f6, 0xf97316, 0xa855f7, 0x06b6d4],
    origin: 0x22c55e,
    destination: 0xef4444,
    taxi: 0xfacc15,
    taxiRoof: 0xf59e0b,
  },
  dark: {
    background: 0x07111f,
    street: 0x1f2937,
    streetLine: 0x334155,
    block: 0x0f172a,
    blockEdge: 0x1e293b,
    node: 0x64748b,
    text: 0xcbd5e1,
    tooltip: 0x020617,
    routeColors: [0x2dd4bf, 0x60a5fa, 0xfb923c, 0xc084fc, 0x22d3ee],
    origin: 0x34d399,
    destination: 0xfb7185,
    taxi: 0xfacc15,
    taxiRoof: 0xf59e0b,
  },
};
