'use client';

import { useEffect, useRef } from 'react';
import type * as Pixi from 'pixi.js';
import { MAX_EVENT_RADIUS, URBAN_EVENT_CONFIG } from '@/engine/events';
import type { Incident, Route } from '@/lib/types';
import { hDir, NCOLS, NROWS, nrc, vDir } from '@/lib/graph';
import { LayerManager } from '@/renderer/LayerManager';
import {
  angleAt,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GRID_SIZE,
  lerpAngle,
  MAP_OFFSET,
  nearestNode,
  nodeX,
  nodeY,
  pathAt,
  STEP,
  STREET,
  BLOCK,
  type Point,
} from '@/renderer/mapGeometry';
import { MAP_THEMES, type ThemeName } from '@/renderer/mapTheme';

interface TrafficCar {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  horizontal: boolean;
  progress: number;
  speed: number;
  laneOffset: number;
  color: number;
}

export interface MapCanvasProps {
  incidents: Incident[];
  routes: Route[];
  originH: number;
  originV: number;
  destH: number;
  destV: number;
  isPlaying: boolean;
  playSpeed: number;
  selectedRoute: number;
  taxiProgress: number;
  theme: ThemeName;
  isCalculating: boolean;
  onContextMenu: (r: number, c: number, sx: number, sy: number) => void;
  onTaxiProgress: (p: number) => void;
  onTaxiDone: () => void;
}

interface RenderContext {
  PIXI: typeof Pixi;
  app: Pixi.Application;
  layers: LayerManager;
}

const CAR_COLORS = [0xef4444, 0x3b82f6, 0x22c55e, 0xf97316, 0xa855f7, 0x06b6d4];

export default function MapCanvas(props: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<RenderContext | null>(null);
  const propsRef = useRef(props);
  const animationRef = useRef({
    revealProgress: [] as number[],
    routeKey: '',
    taxiProgress: 0,
    taxiAngle: 0,
    taxiTrail: [] as Point[],
    cars: [] as TrafficCar[],
    incidentKey: '',
    hoverNode: null as { r: number; c: number } | null,
    clock: 0,
  });

  propsRef.current = props;

  useEffect(() => {
    animationRef.current.taxiProgress = props.taxiProgress;
    if (props.taxiProgress === 0) {
      animationRef.current.taxiTrail = [];
      animationRef.current.taxiAngle = 0;
    }
  }, [props.taxiProgress]);

  useEffect(() => {
    resetRouteReveal();
    redrawStatic();
  }, [props.routes, props.incidents, props.originH, props.originV, props.destH, props.destV, props.theme]);

  useEffect(() => {
    if (!hostRef.current) return;
    let alive = true;
    let cleanupContextMenu: (() => void) | undefined;

    async function mount() {
      const PIXI = await import('pixi.js');
      if (!alive || !hostRef.current) return;

      const theme = MAP_THEMES[propsRef.current.theme];
      const app = new PIXI.Application({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: theme.background,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });

      const canvas = app.view as HTMLCanvasElement;
      hostRef.current.appendChild(canvas);
      app.stage.eventMode = 'static';
      app.stage.hitArea = new PIXI.Rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const layers = new LayerManager(app.stage, () => new PIXI.Container());
      contextRef.current = { PIXI, app, layers };

      app.stage.on('pointermove', (event: Pixi.FederatedPointerEvent) => {
        animationRef.current.hoverNode = nearestNode(event.global.x, event.global.y);
        drawHover();
      });
      app.stage.on('pointerleave', () => {
        animationRef.current.hoverNode = null;
        drawHover();
      });

      const onContextMenu = (event: MouseEvent) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
        const y = (event.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
        const node = nearestNode(x, y);
        if (node) propsRef.current.onContextMenu(node.r, node.c, event.clientX, event.clientY);
      };

      canvas.addEventListener('contextmenu', onContextMenu);
      cleanupContextMenu = () => canvas.removeEventListener('contextmenu', onContextMenu);

      redrawStatic();

      app.ticker.add((delta) => {
        const animation = animationRef.current;
        const current = propsRef.current;
        animation.clock += delta * 0.045;
        drawAnimatedTraffic(delta);
        drawSearchAnimation();
        drawRouteReveal(delta);

        if (current.isPlaying) {
          animation.taxiProgress = Math.min(1, animation.taxiProgress + delta * 0.0022 * current.playSpeed);
          current.onTaxiProgress(animation.taxiProgress);
          if (animation.taxiProgress >= 1) current.onTaxiDone();
        }

        drawTaxi();
        drawMarkers();
      });
    }

    mount();

    return () => {
      alive = false;
      cleanupContextMenu?.();
      const context = contextRef.current;
      context?.layers.clearAll();
      context?.app.destroy(true, { children: true, texture: true, baseTexture: true });
      contextRef.current = null;
    };
  }, []);

  function theme() {
    return MAP_THEMES[propsRef.current.theme];
  }

  function resetRouteReveal() {
    const key = props.routes.map((route) => `${route.id}:${route.path.join('-')}:${route.cost}`).join('|');
    const animation = animationRef.current;
    if (key !== animation.routeKey) {
      animation.revealProgress = props.routes.map(() => 0);
      animation.routeKey = key;
      animation.taxiProgress = 0;
      animation.taxiTrail = [];
    }
  }

  function pointsFor(route: Route): Point[] {
    return route.path.map((id) => {
      const { r, c } = nrc(id);
      return { x: nodeX(c), y: nodeY(r) };
    });
  }

  function redrawStatic() {
    const context = contextRef.current;
    if (!context) return;
    context.app.renderer.background.color = theme().background;
    drawBackground();
    drawGrid();
    drawEvents();
    drawSearchAnimation();
    drawRoutes();
    drawMarkers();
    drawLabels();
    drawHover();
    syncTrafficCars();
  }

  function drawBackground() {
    const context = contextRef.current;
    if (!context) return;
    const layer = context.layers.clear('background');
    const graphic = new context.PIXI.Graphics();
    graphic.beginFill(theme().background);
    graphic.drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    graphic.endFill();
    layer.addChild(graphic);
  }

  function drawGrid() {
    const context = contextRef.current;
    if (!context) return;
    const layer = context.layers.clear('grid');
    const palette = theme();

    const streets = new context.PIXI.Graphics();
    streets.beginFill(palette.street);
    streets.drawRoundedRect(MAP_OFFSET, MAP_OFFSET, GRID_SIZE, GRID_SIZE, 6);
    streets.endFill();
    layer.addChild(streets);

    const blocks = new context.PIXI.Graphics();
    for (let r = 0; r < NROWS - 1; r++) {
      for (let c = 0; c < NCOLS - 1; c++) {
        const x = MAP_OFFSET + c * STEP + STREET;
        const y = MAP_OFFSET + r * STEP + STREET;
        blocks.beginFill(palette.blockEdge);
        blocks.drawRoundedRect(x + 2, y + 2, BLOCK, BLOCK, 6);
        blocks.endFill();
        blocks.beginFill(palette.block);
        blocks.drawRoundedRect(x, y, BLOCK, BLOCK, 6);
        blocks.endFill();
      }
    }
    layer.addChild(blocks);

    const markings = new context.PIXI.Graphics();
    markings.lineStyle(1.5, palette.streetLine, 0.65);
    for (let r = 0; r < NROWS; r++) {
      const y = nodeY(r);
      const hDirVal = hDir(r);
      for (let c = 0; c < NCOLS - 1; c++) {
        const x = (nodeX(c) + nodeX(c + 1)) / 2;
        markings.moveTo(x - hDirVal * 7, y);
        markings.lineTo(x + hDirVal * 7, y);
        markings.moveTo(x + hDirVal * 7, y);
        markings.lineTo(x + hDirVal * 3, y - 4);
        markings.moveTo(x + hDirVal * 7, y);
        markings.lineTo(x + hDirVal * 3, y + 4);
      }
    }
    for (let c = 0; c < NCOLS; c++) {
      const x = nodeX(c);
      const vDirVal = vDir(c);
      for (let r = 0; r < NROWS - 1; r++) {
        const y = (nodeY(r) + nodeY(r + 1)) / 2;
        markings.moveTo(x, y - vDirVal * 7);
        markings.lineTo(x, y + vDirVal * 7);
        markings.moveTo(x, y + vDirVal * 7);
        markings.lineTo(x - 4, y + vDirVal * 3);
        markings.moveTo(x, y + vDirVal * 7);
        markings.lineTo(x + 4, y + vDirVal * 3);
      }
    }
    layer.addChild(markings);

    const nodes = new context.PIXI.Graphics();
    for (let r = 0; r < NROWS; r++) {
      for (let c = 0; c < NCOLS; c++) {
        nodes.beginFill(palette.node, 0.8);
        nodes.drawCircle(nodeX(c), nodeY(r), 3);
        nodes.endFill();
      }
    }
    layer.addChild(nodes);
  }

  function drawEvents() {
    const context = contextRef.current;
    if (!context) return;
    const layer = context.layers.clear('events');

    for (const event of propsRef.current.incidents.filter((item) => item.type !== 'none')) {
      const config = URBAN_EVENT_CONFIG[event.type];
      const radius = Math.min(event.radius ?? config.radius, MAX_EVENT_RADIUS);
      const color = Number(config.color.replace('#', '0x'));
      const cx = nodeX(event.vIdx);
      const cy = nodeY(event.hIdx);

      const halo = new context.PIXI.Graphics();
      const coverageSize = STEP * (radius * 2 + 1);
      halo.beginFill(color, radius === 0 ? 0.12 : 0.16);
      halo.drawRoundedRect(cx - coverageSize / 2, cy - coverageSize / 2, coverageSize, coverageSize, 10);
      halo.endFill();
      halo.lineStyle(1.5, color, 0.34);
      halo.drawRoundedRect(cx - coverageSize / 2, cy - coverageSize / 2, coverageSize, coverageSize, 10);
      layer.addChild(halo);

      const marker = new context.PIXI.Graphics();
      marker.lineStyle(2, 0xffffff, 0.85);
      marker.beginFill(color, 0.95);
      marker.drawCircle(cx, cy, 11);
      marker.endFill();
      layer.addChild(marker);

      const text = new context.PIXI.Text(config.icon, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 10,
        fontWeight: '800',
        fill: 0xffffff,
      });
      text.anchor.set(0.5);
      text.position.set(cx, cy + 0.5);
      layer.addChild(text);
    }
  }

  function drawRouteReveal(delta: number) {
    const animation = animationRef.current;
    let dirty = false;
    for (let i = 0; i < propsRef.current.routes.length; i++) {
      if ((animation.revealProgress[i] ?? 0) < 1) {
        animation.revealProgress[i] = Math.min(1, (animation.revealProgress[i] ?? 0) + delta * 0.025);
        dirty = true;
      }
    }
    if (dirty) drawRoutes();
  }

  function drawSearchAnimation() {
    const context = contextRef.current;
    if (!context) return;
    const layer = context.layers.clear('analysis');
    if (!propsRef.current.isCalculating) return;

    const palette = theme();
    const clock = animationRef.current.clock;
    const origin = { x: nodeX(propsRef.current.originV), y: nodeY(propsRef.current.originH) };
    const destination = { x: nodeX(propsRef.current.destV), y: nodeY(propsRef.current.destH) };
    const progress = (clock * 0.55) % 1;
    const paths: Point[][] = buildSearchPreviewPaths(origin, destination);

    paths.forEach((points, index) => {
      const color = palette.routeColors[index % palette.routeColors.length];
      const alpha = 0.28 - index * 0.045;
      const glow = new context.PIXI.Graphics();
      glow.lineStyle(18 - index * 2, color, Math.max(0.08, alpha * 0.35), 0.5, true);
      drawPartialPath(glow, points, Math.min(1, progress + index * 0.14));
      layer.addChild(glow);

      const line = new context.PIXI.Graphics();
      line.lineStyle(7 - Math.min(index, 2), color, Math.max(0.16, alpha), 0.5, true);
      drawPartialPath(line, points, Math.min(1, progress + index * 0.14));
      layer.addChild(line);
    });

    const pulse = new context.PIXI.Graphics();
    const radius = 16 + Math.sin(clock * 5) * 5;
    pulse.lineStyle(2, palette.routeColors[0], 0.55);
    pulse.drawCircle(origin.x, origin.y, radius);
    pulse.lineStyle(2, palette.routeColors[1], 0.45);
    pulse.drawCircle(destination.x, destination.y, radius * 0.9);
    layer.addChild(pulse);
  }

  function drawRoutes() {
    const context = contextRef.current;
    if (!context) return;
    const layer = context.layers.clear('routes');
    const palette = theme();

    propsRef.current.routes.forEach((route, index) => {
      const points = pointsFor(route);
      const progress = animationRef.current.revealProgress[index] ?? 1;
      const color = palette.routeColors[index % palette.routeColors.length];
      const width = index === 0 ? 15 : 11;
      const alpha = index === 0 ? 0.96 : 0.82;

      const outline = new context.PIXI.Graphics();
      outline.lineStyle(width + 6, 0xffffff, propsRef.current.theme === 'dark' ? 0.22 : 0.85, 0.5, true);
      drawPartialPath(outline, points, progress);
      layer.addChild(outline);

      const glow = new context.PIXI.Graphics();
      glow.lineStyle(width + 14, color, 0.22, 0.5, true);
      drawPartialPath(glow, points, progress);
      layer.addChild(glow);

      const line = new context.PIXI.Graphics();
      line.lineStyle(width, color, alpha, 0.5, true);
      drawPartialPath(line, points, progress);
      layer.addChild(line);
    });
  }

  function drawMarkers() {
    const context = contextRef.current;
    if (!context) return;
    const layer = context.layers.clear('markers');
    const palette = theme();
    const items = [
      { r: propsRef.current.originH, c: propsRef.current.originV, label: 'O', color: palette.origin },
      { r: propsRef.current.destH, c: propsRef.current.destV, label: 'D', color: palette.destination },
    ];

    for (const item of items) {
      const x = nodeX(item.c);
      const y = nodeY(item.r);
      const ring = new context.PIXI.Graphics();
      ring.lineStyle(2, item.color, 0.5);
      ring.drawCircle(x, y, 18);
      layer.addChild(ring);

      const marker = new context.PIXI.Graphics();
      marker.beginFill(item.color);
      marker.drawCircle(x, y, 10);
      marker.endFill();
      marker.lineStyle(2, 0xffffff, 0.9);
      marker.drawCircle(x, y, 10);
      layer.addChild(marker);

      const text = new context.PIXI.Text(item.label, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 10,
        fontWeight: '800',
        fill: 0xffffff,
      });
      text.anchor.set(0.5);
      text.position.set(x, y + 0.5);
      layer.addChild(text);
    }
  }

  function drawLabels() {
    const context = contextRef.current;
    if (!context) return;
    const layer = context.layers.clear('labels');
    const style = {
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10,
      fill: theme().text,
      fontWeight: '500' as const,
    };

    for (let r = 0; r < NROWS; r++) {
      const text = new context.PIXI.Text(`${2 * (r + 1)}`, style);
      text.anchor.set(1, 0.5);
      text.position.set(MAP_OFFSET - 10, nodeY(r));
      layer.addChild(text);
    }
    for (let c = 0; c < NCOLS; c++) {
      const text = new context.PIXI.Text(`${2 * c + 1}`, style);
      text.anchor.set(0.5, 1);
      text.position.set(nodeX(c), MAP_OFFSET - 10);
      layer.addChild(text);
    }
  }

  function drawHover() {
    const context = contextRef.current;
    if (!context) return;
    const layer = context.layers.clear('hover');
    const hovered = animationRef.current.hoverNode;
    if (!hovered) return;

    const x = nodeX(hovered.c);
    const y = nodeY(hovered.r);
    const routeColor = theme().routeColors[2];

    const ring = new context.PIXI.Graphics();
    ring.lineStyle(2, routeColor, 0.8);
    ring.beginFill(routeColor, 0.12);
    ring.drawCircle(x, y, 13);
    ring.endFill();
    layer.addChild(ring);

    const label = `H-${2 * (hovered.r + 1)} / V-${2 * hovered.c + 1}`;
    const text = new context.PIXI.Text(label, {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 11,
      fontWeight: '700',
      fill: 0xffffff,
      padding: 4,
    });
    text.anchor.set(0.5, 1);
    text.position.set(x, y - 16);

    const bg = new context.PIXI.Graphics();
    bg.beginFill(theme().tooltip, 0.9);
    bg.drawRoundedRect(text.x - text.width / 2 - 7, text.y - text.height - 4, text.width + 14, text.height + 8, 6);
    bg.endFill();
    layer.addChild(bg);
    layer.addChild(text);
  }

  function syncTrafficCars() {
    const key = propsRef.current.incidents.map((event) => `${event.type}:${event.hIdx}:${event.vIdx}:${event.radius}:${event.severity}`).join('|');
    const animation = animationRef.current;
    if (key === animation.incidentKey) return;
    animation.incidentKey = key;
    animation.cars = buildTrafficCars(propsRef.current.incidents);
  }

  function drawAnimatedTraffic(delta: number) {
    const context = contextRef.current;
    if (!context) return;
    syncTrafficCars();
    const layer = context.layers.clear('traffic');
    const cars = animationRef.current.cars;
    if (!cars.length) return;

    const graphics = new context.PIXI.Graphics();
    for (const car of cars) {
      car.progress = (car.progress + delta * car.speed) % 1;
      const x = car.x1 + car.progress * (car.x2 - car.x1);
      const y = car.y1 + car.progress * (car.y2 - car.y1);
      graphics.beginFill(car.color, 0.92);
      if (car.horizontal) {
        graphics.drawRoundedRect(x - 8, y - 4 + car.laneOffset, 16, 8, 3);
      } else {
        graphics.drawRoundedRect(x - 4 + car.laneOffset, y - 8, 8, 16, 3);
      }
      graphics.endFill();
    }
    layer.addChild(graphics);
  }

  function drawTaxi() {
    const context = contextRef.current;
    if (!context) return;
    const layer = context.layers.clear('taxi');
    const route = propsRef.current.routes[propsRef.current.selectedRoute];
    const animation = animationRef.current;
    if (!route || animation.taxiProgress <= 0) return;

    const points = pointsFor(route);
    const position = pathAt(points, animation.taxiProgress);
    animation.taxiAngle = lerpAngle(animation.taxiAngle, angleAt(points, animation.taxiProgress), 0.16);

    if (propsRef.current.isPlaying || animation.taxiProgress < 1) {
      animation.taxiTrail.unshift(position);
      if (animation.taxiTrail.length > 34) animation.taxiTrail.pop();
    }

    const routeColor = theme().routeColors[propsRef.current.selectedRoute] ?? theme().routeColors[0];
    const trail = new context.PIXI.Graphics();
    animation.taxiTrail.forEach((point, index) => {
      trail.beginFill(routeColor, (1 - index / animation.taxiTrail.length) * 0.25);
      trail.drawCircle(point.x, point.y, 3);
      trail.endFill();
    });
    layer.addChild(trail);

    const taxi = new context.PIXI.Container();
    taxi.position.set(position.x, position.y);
    taxi.rotation = animation.taxiAngle;

    const body = new context.PIXI.Graphics();
    body.beginFill(theme().taxi);
    body.drawRoundedRect(-14, -8, 28, 16, 4);
    body.endFill();
    body.beginFill(theme().taxiRoof);
    body.drawRoundedRect(-7, -6, 14, 12, 3);
    body.endFill();
    body.beginFill(0x111827, 0.28);
    body.drawRoundedRect(4, -5, 7, 10, 2);
    body.endFill();
    body.beginFill(0xffffff, 0.95);
    body.drawCircle(14, -5, 2);
    body.drawCircle(14, 5, 2);
    body.endFill();
    taxi.addChild(body);
    layer.addChild(taxi);
  }

  return <div ref={hostRef} className="map-canvas-host" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />;
}

function drawPartialPath(graphics: Pixi.Graphics, points: Point[], progress: number): void {
  const segmentCount = points.length - 1;
  if (segmentCount <= 0) return;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  graphics.moveTo(points[0].x, points[0].y);
  const target = clampedProgress * segmentCount;
  const fullSegments = Math.floor(target);
  const fraction = target - fullSegments;

  for (let i = 0; i < fullSegments; i++) {
    graphics.lineTo(points[i + 1].x, points[i + 1].y);
  }
  if (fullSegments < segmentCount) {
    const start = points[fullSegments];
    const end = points[fullSegments + 1];
    graphics.lineTo(start.x + fraction * (end.x - start.x), start.y + fraction * (end.y - start.y));
  }
}

function buildSearchPreviewPaths(origin: Point, destination: Point): Point[][] {
  const midX = (origin.x + destination.x) / 2;
  const midY = (origin.y + destination.y) / 2;
  return [
    [origin, { x: destination.x, y: origin.y }, destination],
    [origin, { x: origin.x, y: destination.y }, destination],
    [origin, { x: midX, y: origin.y }, { x: midX, y: destination.y }, destination],
    [origin, { x: origin.x, y: midY }, { x: destination.x, y: midY }, destination],
  ];
}

function buildTrafficCars(incidents: Incident[]): TrafficCar[] {
  const cars: TrafficCar[] = [];

  for (const event of incidents) {
    if (!['traffic', 'congestion', 'accident', 'signal'].includes(event.type)) continue;
    const segments: Array<Omit<TrafficCar, 'progress' | 'speed' | 'laneOffset' | 'color'>> = [];

    for (let dc = -1; dc <= 0; dc++) {
      const c1 = event.vIdx + dc;
      const c2 = event.vIdx + dc + 1;
      if (c1 < 0 || c2 >= NCOLS) continue;
      const hDirVal = hDir(event.hIdx);
      segments.push(hDirVal === 1
        ? { x1: nodeX(c1), y1: nodeY(event.hIdx), x2: nodeX(c2), y2: nodeY(event.hIdx), horizontal: true }
        : { x1: nodeX(c2), y1: nodeY(event.hIdx), x2: nodeX(c1), y2: nodeY(event.hIdx), horizontal: true });
    }

    for (let dr = -1; dr <= 0; dr++) {
      const r1 = event.hIdx + dr;
      const r2 = event.hIdx + dr + 1;
      if (r1 < 0 || r2 >= NROWS) continue;
      const vDirVal = vDir(event.vIdx);
      segments.push(vDirVal === 1
        ? { x1: nodeX(event.vIdx), y1: nodeY(r1), x2: nodeX(event.vIdx), y2: nodeY(r2), horizontal: false }
        : { x1: nodeX(event.vIdx), y1: nodeY(r2), x2: nodeX(event.vIdx), y2: nodeY(r1), horizontal: false });
    }

    segments.forEach((segment, segmentIndex) => {
      for (let i = 0; i < 3; i++) {
        cars.push({
          ...segment,
          progress: (i / 3 + segmentIndex * 0.13) % 1,
          speed: 0.0012 + i * 0.00025,
          laneOffset: (i - 1) * 3,
          color: CAR_COLORS[(i + segmentIndex) % CAR_COLORS.length],
        });
      }
    });
  }

  return cars;
}
