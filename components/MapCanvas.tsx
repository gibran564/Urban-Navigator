'use client';

import { useEffect, useRef } from 'react';
import type { Incident, Route } from '@/lib/types';
import { nrc, hDir, vDir, NROWS, NCOLS } from '@/lib/graph';

// ─── Layout ───────────────────────────────────────────────────────────────────
const STREET = 16, BLOCK = 54, STEP = STREET + BLOCK; // 70px per cell
const MOFF   = 54;
const GRID   = NCOLS * STEP - BLOCK; // 726 - 54 = 672... let me recalc
// 11 intersections → 10 blocks + 11 streets
// Width = 11*STREET + 10*BLOCK = 11*16 + 10*54 = 176 + 540 = 716
const GRID_W = NCOLS * STREET + (NCOLS - 1) * BLOCK; // 716
const CW = MOFF * 2 + GRID_W;  // 108 + 716 = 824
const CH = CW;

// Node center positions
const nx = (c: number) => MOFF + c * STEP + STREET / 2;
const ny = (r: number) => MOFF + r * STEP + STREET / 2;

// ─── Warm palette ─────────────────────────────────────────────────────────────
const C = {
  bg:        0xfdf7ee,  // warm cream canvas
  street:    0xe0d4c0,  // warm tan street surface
  streetLn:  0xcdc0a8,  // street center-line darker
  block:     0xf5eddb,  // lighter cream for manzanas
  blockEdge: 0xe8dbc8,  // slightly darker block edge
  interDot:  0xc8b89a,  // intersection dot
  arrowDir:  0xbaa888,  // direction tick

  // Routes — vivid on light bg
  r0: 0x3aa857, r1: 0x3b82f6, r2: 0xe8742a,

  // Incidents
  iBlock:   0xe03c3c,
  iTraffic: 0xe8742a,
  iRadar:   0x38bdf8,

  // Markers
  originFill: 0x3aa857,
  destFill:   0xe03c3c,
  white:      0xffffff,
  textDark:   0x3c2a1e,
  textMuted:  0x9a8070,

  // Taxi
  taxiBody:   0xfdd835,
  taxiRoof:   0xf9a825,
  taxiGlass:  0x90caf9,
  taxiWheel:  0x4e342e,
  taxiLight:  0xfff9c4,
};

// Traffic car palette — warm varied colors visible on light bg
const CAR_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0x00897b, 0xd81b60, 0xf4511e];

// Layer map
const L = { BG:0, GRID:1, INC_HALO:2, TRAFFIC:3, R0:4, R1:5, R2:6, MARKERS:7, LABELS:8, HOVER:9, TAXI:10 };

const ROUTE_COLORS = [C.r0, C.r1, C.r2];

// ─── Types ────────────────────────────────────────────────────────────────────
interface TrafficCar {
  x1:number; y1:number; x2:number; y2:number;
  isH:boolean; progress:number; speed:number;
  laneOff:number; color:number;
}

export interface MapCanvasProps {
  incidents:   Incident[];
  routes:      Route[];
  originH:number; originV:number;
  destH:number;   destV:number;
  isPlaying:boolean; playSpeed:number; selectedRoute:number;
  taxiProgress:number;
  onContextMenu:(r:number,c:number,sx:number,sy:number)=>void;
  onTaxiProgress:(p:number)=>void;
  onTaxiDone:()=>void;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MapCanvas(p: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctxRef  = useRef<{PIXI:any;app:any;layers:any[]}|null>(null);
  const pRef    = useRef(p);

  const animRef = useRef({
    revealProg:[0,0,0] as number[], revealKey:'',
    taxiProg:0, taxiAngle:0, taxiTrail:[] as {x:number;y:number}[],
    cars:[] as TrafficCar[], incKey:'',
    hoverNode:null as {r:number;c:number}|null,
    t:0,
  });

  pRef.current = p;

  // Taxi progress sync
  useEffect(() => {
    animRef.current.taxiProg = p.taxiProgress;
    if (p.taxiProgress === 0) { animRef.current.taxiTrail = []; animRef.current.taxiAngle = 0; }
  }, [p.taxiProgress]);

  // Route reveal reset
  const rKey = p.routes.map(r => r.cost).join(',');
  if (rKey !== animRef.current.revealKey) {
    animRef.current.revealProg = [0,0,0];
    animRef.current.revealKey = rKey;
  }

  useEffect(() => { if (ctxRef.current) redrawStatic(); });

  // ── Mount ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hostRef.current) return;
    let alive = true;
    (async () => {
      const PIXI = await import('pixi.js');
      if (!alive || !hostRef.current) return;

      const app = new PIXI.Application({
        width: CW, height: CH,
        backgroundColor: C.bg,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      hostRef.current!.appendChild(app.view as HTMLCanvasElement);
      app.stage.eventMode = 'static';
      app.stage.hitArea = new PIXI.Rectangle(0, 0, CW, CH);

      const layers: any[] = [];
      for (let i = 0; i < 11; i++) {
        const c = new PIXI.Container();
        app.stage.addChild(c);
        layers.push(c);
      }
      ctxRef.current = { PIXI, app, layers };

      app.stage.on('pointermove', (e: any) => {
        animRef.current.hoverNode = nearestNode(e.global.x, e.global.y);
        drawHover();
      });
      app.stage.on('pointerleave', () => { animRef.current.hoverNode = null; drawHover(); });

      const canvas = app.view as HTMLCanvasElement;
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cx   = (e.clientX - rect.left) * (CW / rect.width);
        const cy   = (e.clientY - rect.top)  * (CH / rect.height);
        const node = nearestNode(cx, cy);
        if (node) pRef.current.onContextMenu(node.r, node.c, e.clientX, e.clientY);
      });

      redrawStatic();

      app.ticker.add((delta: number) => {
        const anim = animRef.current;
        const cp   = pRef.current;
        anim.t += delta * 0.04;

        // Re-init traffic cars if incidents changed
        const incKey = cp.incidents.map(i => `${i.type}:${i.hIdx}:${i.vIdx}`).join('|');
        if (incKey !== anim.incKey) { anim.incKey = incKey; initCars(cp.incidents); }

        // Route reveal
        let dirty = false;
        for (let i = 0; i < 3; i++) {
          if (i < cp.routes.length && anim.revealProg[i] < 1) {
            anim.revealProg[i] = Math.min(1, anim.revealProg[i] + delta * 0.025);
            dirty = true;
          }
        }
        if (dirty) drawRoutes();

        // Traffic cars
        for (const car of anim.cars) car.progress = (car.progress + delta * car.speed) % 1;
        if (anim.cars.length) drawTraffic();

        // Taxi
        if (cp.isPlaying) {
          anim.taxiProg = Math.min(1, anim.taxiProg + delta * 0.0022 * cp.playSpeed);
          cp.onTaxiProgress(anim.taxiProg);
          if (anim.taxiProg >= 1) cp.onTaxiDone();
        }
        drawTaxi();
        drawMarkers();
      });
    })();
    return () => { alive = false; ctxRef.current?.app.destroy(true); ctxRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  function layer(i: number) {
    const ctx = ctxRef.current;
    if (!ctx) return null;
    ctx.layers[i]?.removeChildren();
    return ctx.layers[i];
  }

  function redrawStatic() {
    drawBackground();
    drawGrid();
    drawIncidentHalos();
    drawRoutes();
    drawMarkers();
    drawLabels();
    drawHover();
  }

  // ── Warm background ────────────────────────────────────────────────────────
  function drawBackground() {
    const ctx = ctxRef.current; const con = layer(L.BG); if (!ctx || !con) return;
    const { PIXI } = ctx;
    const g = new PIXI.Graphics();
    g.beginFill(C.bg); g.drawRect(0, 0, CW, CH); g.endFill();
    con.addChild(g);
  }

  // ── City grid ──────────────────────────────────────────────────────────────
  function drawGrid() {
    const ctx = ctxRef.current; const con = layer(L.GRID); if (!ctx || !con) return;
    const { PIXI } = ctx;

    // Street surface fill (entire grid area becomes streets)
    const streets = new PIXI.Graphics();
    streets.beginFill(C.street);
    streets.drawRoundedRect(MOFF, MOFF, GRID_W, GRID_W, 4);
    streets.endFill();
    con.addChild(streets);

    // City blocks on top — they're the "solid" parts
    const blocks = new PIXI.Graphics();
    for (let r = 0; r < NROWS - 1; r++) {
      for (let c = 0; c < NCOLS - 1; c++) {
        const bx = MOFF + c * STEP + STREET;
        const by = MOFF + r * STEP + STREET;
        // Shadow (bottom-right offset)
        blocks.beginFill(C.blockEdge);
        blocks.drawRoundedRect(bx + 2, by + 2, BLOCK, BLOCK, 5);
        blocks.endFill();
        // Block surface
        blocks.beginFill(C.block);
        blocks.drawRoundedRect(bx, by, BLOCK, BLOCK, 5);
        blocks.endFill();
      }
    }
    con.addChild(blocks);

    // Center dashes on streets (dashed centerline)
    const dash = new PIXI.Graphics();
    dash.lineStyle(1, C.streetLn, 0.4);
    for (let r = 0; r < NROWS; r++) {
      const y = ny(r);
      for (let c = 0; c < NCOLS - 1; c++) {
        const x1 = nx(c) + 12, x2 = nx(c + 1) - 12;
        const mid = (x1 + x2) / 2;
        dash.moveTo(x1, y); dash.lineTo(mid - 3, y);
        dash.moveTo(mid + 3, y); dash.lineTo(x2, y);
      }
    }
    for (let c = 0; c < NCOLS; c++) {
      const x = nx(c);
      for (let r = 0; r < NROWS - 1; r++) {
        const y1 = ny(r) + 12, y2 = ny(r + 1) - 12;
        const mid = (y1 + y2) / 2;
        dash.moveTo(x, y1); dash.lineTo(x, mid - 3);
        dash.moveTo(x, mid + 3); dash.lineTo(x, y2);
      }
    }
    con.addChild(dash);

    // Direction tick arrows
    const ticks = new PIXI.Graphics();
    ticks.lineStyle(1.5, C.arrowDir, 0.65);
    for (let r = 0; r < NROWS; r++) {
      const d = hDir(r);
      for (let c = 0; c < NCOLS - 1; c++) {
        const xm = (nx(c) + nx(c + 1)) / 2, ym = ny(r);
        ticks.moveTo(xm - d*6, ym); ticks.lineTo(xm + d*6, ym);
        ticks.moveTo(xm + d*6, ym); ticks.lineTo(xm + d*3, ym - 3);
        ticks.moveTo(xm + d*6, ym); ticks.lineTo(xm + d*3, ym + 3);
      }
    }
    for (let c = 0; c < NCOLS; c++) {
      const d = vDir(c);
      for (let r = 0; r < NROWS - 1; r++) {
        const xm = nx(c), ym = (ny(r) + ny(r + 1)) / 2;
        ticks.moveTo(xm, ym - d*6); ticks.lineTo(xm, ym + d*6);
        ticks.moveTo(xm, ym + d*6); ticks.lineTo(xm - 3, ym + d*3);
        ticks.moveTo(xm, ym + d*6); ticks.lineTo(xm + 3, ym + d*3);
      }
    }
    con.addChild(ticks);

    // Intersection rounded squares
    const nodes = new PIXI.Graphics();
    for (let r = 0; r < NROWS; r++) for (let c = 0; c < NCOLS; c++) {
      nodes.beginFill(C.interDot);
      nodes.drawRoundedRect(nx(c) - 3, ny(r) - 3, 6, 6, 2);
      nodes.endFill();
    }
    con.addChild(nodes);
  }

  // ── Incident halos ─────────────────────────────────────────────────────────
  function drawIncidentHalos() {
    const ctx = ctxRef.current; const con = layer(L.INC_HALO); if (!ctx || !con) return;
    const { PIXI } = ctx;
    for (const inc of pRef.current.incidents) {
      if (inc.type === 'none') continue;
      const col = inc.type === 'block' ? C.iBlock : inc.type === 'traffic' ? C.iTraffic : C.iRadar;
      const halo = new PIXI.Graphics();
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = inc.hIdx + dr, cc = inc.vIdx + dc;
        if (rr < 0 || rr >= NROWS || cc < 0 || cc >= NCOLS) continue;
        halo.beginFill(col, dr === 0 && dc === 0 ? 0.18 : 0.07);
        halo.drawRect(MOFF + cc * STEP, MOFF + rr * STEP, STEP, STEP);
        halo.endFill();
      }
      con.addChild(halo);

      if (inc.type !== 'traffic') {
        const cx = nx(inc.vIdx), cy = ny(inc.hIdx);
        const ring = new PIXI.Graphics();
        ring.lineStyle(2.5, col, 0.6);
        ring.drawCircle(cx, cy, 13);
        con.addChild(ring);
        const dot = new PIXI.Graphics();
        dot.beginFill(col); dot.drawCircle(cx, cy, 8); dot.endFill();
        con.addChild(dot);
        const sym = inc.type === 'block' ? '✕' : '◎';
        const txt = new PIXI.Text(sym, {fontFamily:'Nunito,sans-serif',fontSize:10,fill:0xffffff,fontWeight:'bold'});
        txt.anchor.set(0.5); txt.position.set(cx, cy + 0.5);
        con.addChild(txt);
      }
    }
  }

  // ── Animated traffic cars ─────────────────────────────────────────────────
  function drawTraffic() {
    const ctx = ctxRef.current; const con = layer(L.TRAFFIC); if (!ctx || !con) return;
    const { PIXI } = ctx;
    const anim = animRef.current;
    const incs  = pRef.current.incidents.filter(i => i.type === 'traffic');
    if (!incs.length) return;

    // Pulsing icon at center
    const pulse = new PIXI.Graphics();
    for (const inc of incs) {
      const cx = nx(inc.vIdx), cy = ny(inc.hIdx);
      const r  = 11 + Math.sin(anim.t * 2.5) * 1.5;
      const a  = 0.55 + Math.abs(Math.sin(anim.t * 2.5)) * 0.3;
      pulse.lineStyle(2.5, C.iTraffic, a);
      pulse.drawCircle(cx, cy, r);
      pulse.beginFill(C.iTraffic, 0.85 + Math.sin(anim.t * 2) * 0.1);
      pulse.drawCircle(cx, cy, 7);
      pulse.endFill();
    }
    con.addChild(pulse);

    // Cars
    const g = new PIXI.Graphics();
    for (const car of anim.cars) {
      const t   = car.progress;
      const px  = car.x1 + t * (car.x2 - car.x1);
      const py  = car.y1 + t * (car.y2 - car.y1);
      const brk = 0.5 + 0.45 * Math.abs(Math.sin(anim.t * 3.5 + car.progress * 7));

      // ─────────────────────────────────────────────────────────────────────
      // SPRITE SLOT — swap the Graphics block below with your sprite:
      //
      //   const spr = new PIXI.Sprite(carTexture);
      //   spr.width  = car.isH ? 18 : 11;
      //   spr.height = car.isH ? 11 : 18;
      //   spr.anchor.set(0.5);
      //   spr.x = px + (car.isH ? 0 : car.laneOff);
      //   spr.y = py + (car.isH ? car.laneOff : 0);
      //   spr.rotation = car.isH ? (car.x2>car.x1 ? 0 : Math.PI) : (car.y2>car.y1 ? Math.PI/2 : -Math.PI/2);
      //   con.addChild(spr);   ← add to con, not g
      // ─────────────────────────────────────────────────────────────────────

      if (car.isH) {
        const ox = 0, oy = car.laneOff;
        const fd = car.x2 > car.x1 ? 1 : -1;
        // Body
        g.beginFill(car.color, 0.92);
        g.drawRoundedRect(px - 9 + ox, py - 5 + oy, 18, 10, 3);
        g.endFill();
        // Windshield
        g.beginFill(0x90caf9, 0.65);
        g.drawRoundedRect(px + (fd === 1 ? 2 : -8) + ox, py - 4 + oy, 6, 8, 1.5);
        g.endFill();
        // Roof tint
        g.beginFill(0x000000, 0.1);
        g.drawRoundedRect(px - 5 + ox, py - 4 + oy, 10, 8, 2);
        g.endFill();
        // Brake lights
        g.beginFill(0xf44336, brk * 0.9);
        g.drawCircle(px - (fd === 1 ? 9 : -9) + ox, py - 3 + oy, 1.8);
        g.drawCircle(px - (fd === 1 ? 9 : -9) + ox, py + 3 + oy, 1.8);
        g.endFill();
        // Headlights
        g.beginFill(0xfff9c4, 0.8);
        g.drawCircle(px + (fd === 1 ? 9 : -9) + ox, py - 3 + oy, 1.5);
        g.drawCircle(px + (fd === 1 ? 9 : -9) + ox, py + 3 + oy, 1.5);
        g.endFill();
      } else {
        const ox = car.laneOff, oy = 0;
        const fd = car.y2 > car.y1 ? 1 : -1;
        g.beginFill(car.color, 0.92);
        g.drawRoundedRect(px - 5 + ox, py - 9 + oy, 10, 18, 3);
        g.endFill();
        g.beginFill(0x90caf9, 0.65);
        g.drawRoundedRect(px - 4 + ox, py + (fd === 1 ? 2 : -8) + oy, 8, 6, 1.5);
        g.endFill();
        g.beginFill(0x000000, 0.1);
        g.drawRoundedRect(px - 4 + ox, py - 5 + oy, 8, 10, 2);
        g.endFill();
        g.beginFill(0xf44336, brk * 0.9);
        g.drawCircle(px - 3 + ox, py - (fd === 1 ? 9 : -9) + oy, 1.8);
        g.drawCircle(px + 3 + ox, py - (fd === 1 ? 9 : -9) + oy, 1.8);
        g.endFill();
        g.beginFill(0xfff9c4, 0.8);
        g.drawCircle(px - 3 + ox, py + (fd === 1 ? 9 : -9) + oy, 1.5);
        g.drawCircle(px + 3 + ox, py + (fd === 1 ? 9 : -9) + oy, 1.5);
        g.endFill();
      }
    }
    con.addChild(g);
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  function drawRoutes() {
    const ctx = ctxRef.current; if (!ctx) return;
    const { PIXI } = ctx;
    const { routes } = pRef.current;
    const { revealProg } = animRef.current;
    // Widths: thicker + straight (no perpendicular offset)
    const LWS = [11, 9, 8];

    routes.forEach((route, ri) => {
      const con = layer(L.R0 + ri); if (!con) return;
      const col  = ROUTE_COLORS[ri];
      const lw   = LWS[ri];
      const prog = Math.min(revealProg[ri] ?? 0, 1);
      if (prog <= 0) return;

      const pts = route.path.map(id => { const { r, c } = nrc(id); return { x: nx(c), y: ny(r) }; });

      // 1) White outline — makes the line pop off the map background
      const outline = new PIXI.Graphics();
      outline.lineStyle(lw + 6, 0xffffff, 0.85, 0.5, true);
      drawPartial(outline, pts, prog, 0);
      con.addChild(outline);

      // 2) Soft color glow
      const glow = new PIXI.Graphics();
      glow.lineStyle(lw + 10, col, 0.18, 0.5, true);
      drawPartial(glow, pts, prog, 0);
      con.addChild(glow);

      // 3) Solid colored line
      const line = new PIXI.Graphics();
      line.lineStyle(lw, col, 0.95, 0.5, true);
      drawPartial(line, pts, prog, 0);
      con.addChild(line);

      // 4) Filled arrowhead chevrons at each segment midpoint
      if (prog > 0.12) {
        const n  = Math.floor(prog * (pts.length - 1));
        const ar = new PIXI.Graphics();
        for (let i = 0; i < n; i++) {
          const p1 = pts[i], p2 = pts[i + 1];
          const dx = p2.x - p1.x, dy = p2.y - p1.y;
          const len = Math.sqrt(dx * dx + dy * dy); if (len < 1) continue;
          const ux = dx / len, uy = dy / len;
          const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
          const sz = 6;
          // Filled white triangle (outline)
          ar.beginFill(0xffffff, 0.9);
          ar.drawPolygon([
            mx + ux * sz,           my + uy * sz,
            mx - ux * sz - uy * sz * 0.7, my - uy * sz + ux * sz * 0.7,
            mx - ux * sz + uy * sz * 0.7, my - uy * sz - ux * sz * 0.7,
          ]);
          ar.endFill();
          // Filled color triangle on top (slightly smaller)
          ar.beginFill(col, 1);
          ar.drawPolygon([
            mx + ux * (sz - 1),           my + uy * (sz - 1),
            mx - ux * (sz - 1) - uy * (sz - 1) * 0.7, my - uy * (sz - 1) + ux * (sz - 1) * 0.7,
            mx - ux * (sz - 1) + uy * (sz - 1) * 0.7, my - uy * (sz - 1) - ux * (sz - 1) * 0.7,
          ]);
          ar.endFill();
        }
        con.addChild(ar);
      }

      // 5) Leading ball during animation
      if (prog < 1) {
        const pos = pathAt(pts, prog);
        const ld = new PIXI.Graphics();
        ld.beginFill(0xffffff, 0.9); ld.drawCircle(pos.x, pos.y, lw * 0.7 + 3); ld.endFill();
        ld.beginFill(col, 1);        ld.drawCircle(pos.x, pos.y, lw * 0.7);     ld.endFill();
        con.addChild(ld);
      }
    });
  }

  // ── O/D Markers ──────────────────────────────────────────────────────────
  function drawMarkers() {
    const ctx = ctxRef.current; const con = layer(L.MARKERS); if (!ctx || !con) return;
    const { PIXI } = ctx;
    const { originH, originV, destH, destV } = pRef.current;
    const t = animRef.current.t;

    const items = [
      { r: originH, c: originV, fill: C.originFill, label: 'O' },
      { r: destH,   c: destV,   fill: C.destFill,   label: 'D' },
    ];

    for (const m of items) {
      const x = nx(m.c), y = ny(m.r);
      const pulse = 1 + Math.sin(t * 1.8 + m.r + m.c) * 0.1;

      // Outer pulse ring
      const ring = new PIXI.Graphics();
      ring.lineStyle(2, m.fill, 0.25 + Math.abs(Math.sin(t * 1.8)) * 0.2);
      ring.drawCircle(x, y, 18 * pulse);
      con.addChild(ring);

      // White shadow
      const shadow = new PIXI.Graphics();
      shadow.beginFill(m.fill, 0.15);
      shadow.drawCircle(x, y, 14);
      shadow.endFill();
      con.addChild(shadow);

      // Circle
      const circle = new PIXI.Graphics();
      circle.beginFill(m.fill); circle.drawCircle(x, y, 10); circle.endFill();
      circle.lineStyle(2.5, C.white); circle.drawCircle(x, y, 10);
      con.addChild(circle);

      // Label
      const txt = new PIXI.Text(m.label, {
        fontFamily: 'Nunito, sans-serif', fontSize: 10,
        fontWeight: '800', fill: C.white,
      });
      txt.anchor.set(0.5, 0.5); txt.position.set(x, y + 0.5);
      con.addChild(txt);
    }
  }

  // ── Axis labels ───────────────────────────────────────────────────────────
  function drawLabels() {
    const ctx = ctxRef.current; const con = layer(L.LABELS); if (!ctx || !con) return;
    const { PIXI } = ctx;
    const st = { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: C.textMuted, fontWeight: '500' };
    for (let r = 0; r < NROWS; r++) {
      const t = new PIXI.Text(`${2*(r+1)}`, st);
      t.anchor.set(1, 0.5); t.position.set(MOFF - 10, ny(r));
      con.addChild(t);
    }
    for (let c = 0; c < NCOLS; c++) {
      const t = new PIXI.Text(`${2*c+1}`, st);
      t.anchor.set(0.5, 1); t.position.set(nx(c), MOFF - 10);
      con.addChild(t);
    }
  }

  // ── Hover ──────────────────────────────────────────────────────────────────
  function drawHover() {
    const ctx = ctxRef.current; const con = layer(L.HOVER); if (!ctx || !con) return;
    const { PIXI } = ctx;
    const hn = animRef.current.hoverNode;
    if (!hn) return;

    const x = nx(hn.c), y = ny(hn.r);
    const ring = new PIXI.Graphics();
    ring.lineStyle(2.5, C.r2, 0.7); ring.drawCircle(x, y, 12);
    ring.beginFill(C.r2, 0.12); ring.drawCircle(x, y, 12); ring.endFill();
    con.addChild(ring);

    const lbl = `H-${2*(hn.r+1)} · V-${2*hn.c+1}`;
    const txt = new PIXI.Text(lbl, {
      fontFamily: 'Nunito, sans-serif', fontSize: 11,
      fontWeight: '700', fill: 0xffffff, padding: 4,
    });
    txt.anchor.set(0.5, 1); txt.position.set(x, y - 16);
    const bg = new PIXI.Graphics();
    bg.beginFill(0x5c3d2e, 0.88);
    bg.drawRoundedRect(txt.x - txt.width/2 - 6, txt.y - txt.height - 3, txt.width + 12, txt.height + 6, 6);
    bg.endFill();
    con.addChild(bg); con.addChild(txt);
  }

  // ── Taxi ──────────────────────────────────────────────────────────────────
  function drawTaxi() {
    const ctx = ctxRef.current; const con = layer(L.TAXI); if (!ctx || !con) return;
    const { PIXI } = ctx;
    const { routes, selectedRoute } = pRef.current;
    const anim = animRef.current;
    const route = routes[selectedRoute];
    if (!route || anim.taxiProg <= 0) return;

    const pts = route.path.map(id => { const { r, c } = nrc(id); return { x: nx(c), y: ny(r) }; });
    const pos  = pathAt(pts, anim.taxiProg);
    anim.taxiAngle = lerpAngle(anim.taxiAngle, angleAt(pts, anim.taxiProg), 0.16);
    const ang  = anim.taxiAngle;

    // Trail
    if (pRef.current.isPlaying || (anim.taxiProg > 0 && anim.taxiProg < 1)) {
      anim.taxiTrail.unshift({ x: pos.x, y: pos.y });
      if (anim.taxiTrail.length > 36) anim.taxiTrail.pop();
    }
    const rc = ROUTE_COLORS[selectedRoute];
    const trail = new PIXI.Graphics();
    anim.taxiTrail.forEach((pt, i) => {
      trail.beginFill(rc, (1 - i / anim.taxiTrail.length) * 0.28);
      trail.drawCircle(pt.x, pt.y, 2.8 * (1 - i / anim.taxiTrail.length) + 0.5);
      trail.endFill();
    });
    con.addChild(trail);

    // Headlight glow
    const hl = new PIXI.Graphics();
    const hx = pos.x + Math.cos(ang) * 17, hy = pos.y + Math.sin(ang) * 17;
    hl.beginFill(0xfff9c4, 0.18); hl.drawCircle(hx, hy, 20); hl.endFill();
    hl.beginFill(0xfff9c4, 0.08); hl.drawCircle(hx, hy, 32); hl.endFill();
    con.addChild(hl);

    // ─────────────────────────────────────────────────────────────────────────
    // TAXI SPRITE SLOT
    // Swap the Graphics taxi body below with a PIXI.Sprite:
    //
    //   const spr = new PIXI.Sprite(taxiTexture);
    //   spr.anchor.set(0.5);
    //   spr.width = 28; spr.height = 17;  // pivot = center
    //   spr.x = pos.x; spr.y = pos.y;
    //   spr.rotation = ang;
    //   con.addChild(spr);
    //   return;   ← skip the Graphics code below
    // ─────────────────────────────────────────────────────────────────────────

    const taxi = new PIXI.Container();
    taxi.position.set(pos.x, pos.y);
    taxi.rotation = ang;

    const b = new PIXI.Graphics();
    // Body
    b.beginFill(C.taxiBody); b.drawRoundedRect(-14, -9, 28, 18, 5); b.endFill();
    // Roof
    b.beginFill(C.taxiRoof); b.drawRoundedRect(-10, -7, 20, 14, 3); b.endFill();
    // Front windshield
    b.beginFill(C.taxiGlass, 0.7); b.drawRoundedRect(4, -6, 8, 12, 2); b.endFill();
    b.lineStyle(1, C.taxiGlass, 0.5); b.moveTo(8, -6); b.lineTo(8, 6);
    b.lineStyle(0);
    // Rear window
    b.beginFill(C.taxiGlass, 0.5); b.drawRoundedRect(-12, -5, 5, 10, 1.5); b.endFill();
    // Taxi roof sign
    b.beginFill(0xffffff, 0.95); b.drawRoundedRect(-5, -14, 10, 6, 2); b.endFill();
    b.beginFill(C.iTraffic, 0.7); b.drawRoundedRect(-3, -13, 6, 4, 1); b.endFill();
    // Checker stripe
    for (let i = -6; i <= 4; i += 2) {
      b.beginFill(0x333333, 0.18);
      b.drawRect(i, i % 4 === 0 ? -1 : 0, 2, i % 4 === 0 ? 2 : -2);
      b.endFill();
    }
    // Wheels
    [[-9,-10],[9,-10],[-9,10],[9,10]].forEach(([wx,wy]) => {
      b.beginFill(C.taxiWheel); b.drawCircle(wx, wy, 4.5); b.endFill();
      b.beginFill(0xaaaaaa); b.drawCircle(wx, wy, 2); b.endFill();
    });
    // Headlights
    b.beginFill(C.taxiLight, 0.95); b.drawCircle(14, -6, 2.5); b.drawCircle(14, 6, 2.5); b.endFill();
    // Taillights
    b.beginFill(0xf44336, 0.9); b.drawCircle(-14, -6, 2); b.drawCircle(-14, 6, 2); b.endFill();

    taxi.addChild(b);
    con.addChild(taxi);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function initCars(incidents: Incident[]) {
    const cars: TrafficCar[] = [];
    for (const inc of incidents) {
      if (inc.type !== 'traffic') continue;
      const segs: Omit<TrafficCar, 'progress'|'speed'|'laneOff'|'color'>[] = [];
      for (let dc = -1; dc <= 0; dc++) {
        const c1 = inc.vIdx + dc, c2 = inc.vIdx + dc + 1;
        if (c1 < 0 || c2 >= NCOLS) continue;
        const d = hDir(inc.hIdx);
        segs.push(d===1
          ?{x1:nx(c1),y1:ny(inc.hIdx),x2:nx(c2),y2:ny(inc.hIdx),isH:true}
          :{x1:nx(c2),y1:ny(inc.hIdx),x2:nx(c1),y2:ny(inc.hIdx),isH:true});
      }
      for (let dr = -1; dr <= 0; dr++) {
        const r1 = inc.hIdx + dr, r2 = inc.hIdx + dr + 1;
        if (r1 < 0 || r2 >= NROWS) continue;
        const d = vDir(inc.vIdx);
        segs.push(d===1
          ?{x1:nx(inc.vIdx),y1:ny(r1),x2:nx(inc.vIdx),y2:ny(r2),isH:false}
          :{x1:nx(inc.vIdx),y1:ny(r2),x2:nx(inc.vIdx),y2:ny(r1),isH:false});
      }
      for (const seg of segs) {
        for (let i = 0; i < 4; i++) {
          cars.push({
            ...seg,
            progress: (i / 4 + Math.random() * 0.15) % 1,
            speed: 0.0016 + Math.random() * 0.0014,
            laneOff: (Math.random() - 0.5) * 6,
            color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
          });
        }
      }
    }
    animRef.current.cars = cars;
  }

  return (
    <div ref={hostRef} className="map-canvas-host" style={{ width: CW, height: CH }} />
  );
}

// ─── Pure geometry ─────────────────────────────────────────────────────────
function nearestNode(px:number, py:number): {r:number,c:number}|null {
  let best = Infinity, br = -1, bc = -1;
  for (let r = 0; r < NROWS; r++) for (let c = 0; c < NCOLS; c++) {
    const d = Math.hypot(px - nx(c), py - ny(r));
    if (d < best) { best = d; br = r; bc = c; }
  }
  return best < STEP * 0.42 ? { r:br, c:bc } : null;
}

function applyOff(pts:{x:number;y:number}[], i:number, perp:number) {
  const p = pts[i], next = pts[Math.min(i+1, pts.length-1)];
  const h = Math.abs(p.y - next.y) < 0.1;
  return { x: p.x + (h ? 0 : perp), y: p.y + (h ? perp : 0) };
}

function drawPartial(g:any, pts:{x:number;y:number}[], prog:number, perp:number) {
  const n = pts.length - 1; if (n <= 0) return;
  const p0 = applyOff(pts, 0, perp); g.moveTo(p0.x, p0.y);
  const target = prog * n, full = Math.floor(target), frac = target - full;
  for (let i = 0; i < full; i++) { const p = applyOff(pts,i+1,perp); g.lineTo(p.x,p.y); }
  if (full < n) {
    const a = applyOff(pts,full,perp), b = applyOff(pts,full+1,perp);
    g.lineTo(a.x + frac*(b.x-a.x), a.y + frac*(b.y-a.y));
  }
}

function pathAt(pts:{x:number;y:number}[], prog:number) {
  const n = pts.length - 1; if (n <= 0) return pts[0];
  const t = Math.min(prog * n, n - 0.001), i = Math.floor(t), f = t - i;
  return { x: pts[i].x + f*(pts[i+1].x-pts[i].x), y: pts[i].y + f*(pts[i+1].y-pts[i].y) };
}

function angleAt(pts:{x:number;y:number}[], prog:number) {
  const n = pts.length - 1; if (n <= 0) return 0;
  const i = Math.min(Math.floor(prog * n), n - 1);
  return Math.atan2(pts[i+1].y - pts[i].y, pts[i+1].x - pts[i].x);
}

function lerpAngle(a:number, b:number, t:number) {
  let d = b - a;
  while (d > Math.PI)  d -= 2*Math.PI;
  while (d < -Math.PI) d += 2*Math.PI;
  return a + d * t;
}
