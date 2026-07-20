// ---------------------------------------------------------------------------
// Route Reel — cinematic route-replay renderer + in-browser video recorder
// Draws an animated, telemetry-rich replay of the activity onto a canvas,
// which can be previewed live or captured to a real video file via
// canvas.captureStream() + MediaRecorder.
// ---------------------------------------------------------------------------
import type { Activity } from './activity';
import { fmtDur, fmtInt, fmtKm, fmtKmh, speedColor } from './activity';
import { ZONES } from './zones';

export type ReelAspect = '16:9' | '9:16' | '1:1';
export type ReelThemeId = 'volt' | 'glacier' | 'ember';

export interface ReelTheme {
  id: ReelThemeId;
  name: string;
  accent: string;
  accentSoft: string;
  bg0: string;
  bg1: string;
  ghost: string;
}

export const REEL_THEMES: ReelTheme[] = [
  { id: 'volt', name: 'Volt', accent: '#b5f13e', accentSoft: 'rgba(181,241,62,0.16)', bg0: '#070b10', bg1: '#0d1420', ghost: 'rgba(148,163,184,0.20)' },
  { id: 'glacier', name: 'Glacier', accent: '#67e8f9', accentSoft: 'rgba(103,232,249,0.16)', bg0: '#060a12', bg1: '#0b1626', ghost: 'rgba(148,163,184,0.20)' },
  { id: 'ember', name: 'Ember', accent: '#fb923c', accentSoft: 'rgba(251,146,60,0.16)', bg0: '#0c0705', bg1: '#1a0f08', ghost: 'rgba(184,158,138,0.22)' },
];

export const REEL_ASPECTS: Array<{ id: ReelAspect; name: string; tag: string }> = [
  { id: '16:9', name: 'Landscape', tag: '1280 × 720' },
  { id: '9:16', name: 'Story', tag: '720 × 1280' },
  { id: '1:1', name: 'Square', tag: '960 × 960' },
];

export interface ReelOpts {
  aspect: ReelAspect;
  themeId: ReelThemeId;
  durationSec: number;
  /** Optional FTP/speed-zone overlay: colours the route + drives the HUD zone chip. */
  zone?: {
    colors: string[]; // per-point zone colour
    idx: Int8Array; // per-point zone index (0–6)
    metric: 'power' | 'speed';
    threshold: number; // W or m/s
  } | null;
}

export function reelDims(aspect: ReelAspect): { w: number; h: number } {
  if (aspect === '16:9') return { w: 1280, h: 720 };
  if (aspect === '9:16') return { w: 720, h: 1280 };
  return { w: 960, h: 960 };
}

export const REEL_DURATIONS = [15, 25, 40];

// ------------------------------------------------------------------ helpers

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

const mono = (weight: number, size: number) => `${weight} ${size}px "IBM Plex Mono", ui-monospace, monospace`;
const disp = (weight: number, size: number) => `${weight} ${size}px "Space Grotesk", ui-sans-serif, sans-serif`;

// ------------------------------------------------------------------ renderer

export class ReelRenderer {
  readonly w: number;
  readonly h: number;
  readonly s: number; // global scale factor
  readonly opts: ReelOpts;
  readonly theme: ReelTheme;
  private activity: Activity;
  private n: number;

  private base: HTMLCanvasElement;
  private prog: HTMLCanvasElement;
  private progCtx: Ctx;
  private progIdx = -1;

  private px: Float32Array; // projected coords (canvas space)
  private py: Float32Array;
  private drawOrder: number[]; // resampled indices for progressive drawing
  private mapRect: { x: number; y: number; w: number; h: number };
  private chartRect: { x: number; y: number; w: number; h: number };
  private chartInner: { x: number; y: number; w: number; h: number };
  private chartPts: Array<{ x: number; y: number }> = [];
  private portrait: boolean;

  // zone overlay (optional) — colours the route trace + the HUD chip
  private zoneColors: string[] | null = null;
  private zoneIdx: Int8Array | null = null;
  private zoneMetric: 'power' | 'speed' = 'power';
  private zoneThreshold = 0;

  constructor(activity: Activity, opts: ReelOpts) {
    this.activity = activity;
    this.opts = opts;
    this.theme = REEL_THEMES.find((t) => t.id === opts.themeId) ?? REEL_THEMES[0];
    const { w, h } = reelDims(opts.aspect);
    this.w = w;
    this.h = h;
    this.s = Math.min(w, h) / 720;
    this.portrait = h > w;
    this.n = activity.points.length;

    if (opts.zone && opts.zone.colors.length === this.n) {
      this.zoneColors = opts.zone.colors;
      this.zoneIdx = opts.zone.idx;
      this.zoneMetric = opts.zone.metric;
      this.zoneThreshold = opts.zone.threshold;
    }

    this.base = document.createElement('canvas');
    this.base.width = w;
    this.base.height = h;
    this.prog = document.createElement('canvas');
    this.prog.width = w;
    this.prog.height = h;
    this.progCtx = this.prog.getContext('2d') as Ctx;

    const pad = (this.portrait ? 36 : 44) * this.s;
    const chartH = (this.portrait ? 200 : 168) * this.s;
    const topBand = (this.portrait ? 150 : 116) * this.s;
    const bottomBand = 34 * this.s;
    this.chartRect = {
      x: pad,
      y: h - bottomBand - chartH,
      w: w - pad * 2,
      h: chartH,
    };
    this.mapRect = {
      x: pad,
      y: topBand,
      w: w - pad * 2,
      h: this.chartRect.y - topBand - 30 * this.s,
    };
    this.chartInner = {
      x: this.chartRect.x + 18 * this.s,
      y: this.chartRect.y + 22 * this.s,
      w: this.chartRect.w - 36 * this.s,
      h: this.chartRect.h - 60 * this.s,
    };

    const { px, py } = this.project();
    this.px = px;
    this.py = py;

    // resample for progressive stroke work (max ~1500 segments)
    const order: number[] = [];
    const stride = Math.max(1, Math.ceil(this.n / 1500));
    for (let i = 0; i < this.n; i += stride) order.push(i);
    if (order[order.length - 1] !== this.n - 1) order.push(this.n - 1);
    this.drawOrder = order;

    this.buildChartPaths();
    this.drawStaticBase();
  }

  // ------------------------------------------------------------- projection
  private project(): { px: Float32Array; py: Float32Array } {
    const pts = this.activity.points;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const lat0 = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const kx = Math.cos(lat0);
    const spanX = Math.max(1e-9, (maxLng - minLng) * kx);
    const spanY = Math.max(1e-9, maxLat - minLat);
    const inset = 26 * this.s;
    const availW = this.mapRect.w - inset * 2;
    const availH = this.mapRect.h - inset * 2;
    const scale = Math.min(availW / spanX, availH / spanY);
    const offX = this.mapRect.x + (this.mapRect.w - spanX * scale) / 2;
    const offY = this.mapRect.y + (this.mapRect.h - spanY * scale) / 2;
    const px = new Float32Array(this.n);
    const py = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      px[i] = offX + (pts[i].lng - minLng) * kx * scale;
      py[i] = offY + (maxLat - pts[i].lat) * scale;
    }
    return { px, py };
  }

  private chartX(i: number): number {
    const d = this.activity.points[i].dist / Math.max(1, this.activity.stats.distance);
    return this.chartInner.x + d * this.chartInner.w;
  }

  private chartY(altV: number): number {
    const { minAlt, maxAlt } = this.activity.stats;
    const span = Math.max(10, maxAlt - minAlt);
    return this.chartInner.y + this.chartInner.h - ((altV - minAlt) / span) * this.chartInner.h;
  }

  private buildChartPaths() {
    const pts = this.activity.points;
    const step = Math.max(1, Math.floor(this.n / 600));
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < this.n; i += step) {
      out.push({ x: this.chartX(i), y: this.chartY(pts[i].alt) });
    }
    out.push({ x: this.chartX(this.n - 1), y: this.chartY(pts[this.n - 1].alt) });
    this.chartPts = out;
  }

  /** Trace the elevation profile onto `c` (area when `close`, else polyline). */
  private traceChart(c: Ctx, close: boolean) {
    const pts = this.chartPts;
    if (!pts.length) return;
    const base = this.chartInner.y + this.chartInner.h;
    c.beginPath();
    c.moveTo(pts[0].x, close ? base : pts[0].y);
    if (close) c.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    if (close) {
      c.lineTo(pts[pts.length - 1].x, base);
      c.closePath();
    }
  }

  // ------------------------------------------------------------ static base
  private drawStaticBase() {
    const ctx = this.base.getContext('2d') as Ctx;
    const { w, h, s, theme } = this;

    // background
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, theme.bg1);
    g.addColorStop(0.55, theme.bg0);
    g.addColorStop(1, theme.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = 'rgba(148,163,184,0.055)';
    ctx.lineWidth = 1;
    const step = 64 * s;
    ctx.beginPath();
    for (let x = step; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // faint full route (ghost)
    const lw = Math.max(1.6, 2.4 * s);
    ctx.strokeStyle = this.theme.ghost;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const stride = Math.max(1, Math.ceil(this.n / 900));
    for (let i = 0; i < this.n; i += stride) {
      if (i === 0) ctx.moveTo(this.px[i], this.py[i]);
      else ctx.lineTo(this.px[i], this.py[i]);
    }
    ctx.lineTo(this.px[this.n - 1], this.py[this.n - 1]);
    ctx.stroke();

    // start / end markers (anti-collide labels on loop routes)
    const dx = this.px[this.n - 1] - this.px[0];
    const dy = this.py[this.n - 1] - this.py[0];
    const close = Math.hypot(dx, dy) < 72 * s;
    this.marker(ctx, this.px[0], this.py[0], this.theme.accent, 'START', close ? 'above' : 'below');
    this.marker(ctx, this.px[this.n - 1], this.py[this.n - 1], '#ffffff', 'FINISH', 'below');

    // compass
    this.compass(ctx);

    // chart panel
    const cr = this.chartRect;
    rr(ctx, cr.x, cr.y, cr.w, cr.h, 14 * s);
    ctx.fillStyle = 'rgba(148,163,184,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // chart ghost profile
    ctx.save();
    this.traceChart(ctx, true);
    ctx.fillStyle = 'rgba(148,163,184,0.07)';
    ctx.fill();
    this.traceChart(ctx, false);
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();
    ctx.restore();

    // km ticks under chart
    const totalKm = this.activity.stats.distance / 1000;
    const tickKm = [1, 2, 5, 10, 20, 50, 100].find((t) => totalKm / t <= 7) ?? 100;
    ctx.fillStyle = 'rgba(148,163,184,0.55)';
    ctx.font = mono(500, 10.5 * s);
    try { ctx.letterSpacing = '1px'; } catch { /* noop */ }
    ctx.textAlign = 'center';
    for (let km = tickKm; km < totalKm; km += tickKm) {
      const x = this.chartInner.x + (km / totalKm) * this.chartInner.w;
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.beginPath();
      ctx.moveTo(x, this.chartInner.y + this.chartInner.h + 4 * s);
      ctx.lineTo(x, this.chartInner.y + this.chartInner.h + 9 * s);
      ctx.stroke();
      ctx.fillText(`${km} km`, x, this.chartInner.y + this.chartInner.h + 24 * s);
    }
    try { ctx.letterSpacing = '0px'; } catch { /* noop */ }

    // vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  private marker(ctx: Ctx, x: number, y: number, color: string, tag: string, tagPos: 'above' | 'below' = 'below') {
    const s = this.s;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(5,8,12,0.9)';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.arc(x, y, 6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = mono(600, 10 * s);
    try { ctx.letterSpacing = '1.5px'; } catch { /* noop */ }
    ctx.fillStyle = 'rgba(226,232,240,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText(tag, x, tagPos === 'below' ? y + 20 * s : y - 14 * s);
    try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
    ctx.restore();
  }

  private compass(ctx: Ctx) {
    const s = this.s;
    const x = this.mapRect.x + this.mapRect.w - 16 * s;
    const y = this.mapRect.y + 18 * s;
    ctx.save();
    ctx.strokeStyle = 'rgba(226,232,240,0.5)';
    ctx.fillStyle = 'rgba(226,232,240,0.75)';
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.arc(x, y, 11 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + 6 * s);
    ctx.lineTo(x - 4 * s, y + 2 * s);
    ctx.lineTo(x, y - 7 * s);
    ctx.lineTo(x + 4 * s, y + 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------- zone chip
  private drawZoneChip(c: Ctx, idx: number) {
    if (!this.zoneColors || !this.zoneIdx) return;
    const s = this.s;
    const z = ZONES[this.zoneIdx[idx]] ?? ZONES[0];
    const pt = this.activity.points[idx];
    const value =
      this.zoneMetric === 'power'
        ? `${pt.power != null ? Math.round(pt.power) : 0} W`
        : `${fmtKmh(pt.speed)} km/h`;
    const label = `${z.short}  ${z.name.toUpperCase()}`;

    c.save();
    c.font = mono(600, 12 * s);
    const labelW = c.measureText(label).width;
    c.font = mono(700, 12 * s);
    const valueW = c.measureText(value).width;
    const swatch = 22 * s;
    const padX = 12 * s;
    const gap = 9 * s;
    const hChip = 30 * s;
    const wChip = swatch + padX + labelW + gap + valueW + padX;

    const x = this.mapRect.x + 8 * s;
    const y = this.mapRect.y + 8 * s;

    // body
    rr(c, x, y, wChip, hChip, 8 * s);
    c.fillStyle = 'rgba(5,8,12,0.7)';
    c.fill();
    c.strokeStyle = 'rgba(148,163,184,0.22)';
    c.lineWidth = 1;
    c.stroke();

    // coloured zone swatch with the Z number
    rr(c, x + 3 * s, y + 3 * s, swatch - 3 * s, hChip - 6 * s, 5 * s);
    c.fillStyle = z.color;
    c.fill();
    c.font = mono(700, 11 * s);
    c.fillStyle = 'rgba(5,8,12,0.9)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(z.short, x + 3 * s + (swatch - 3 * s) / 2, y + hChip / 2 + 0.5);

    // zone name
    c.textAlign = 'left';
    c.font = mono(600, 12 * s);
    c.fillStyle = 'rgba(241,245,249,0.92)';
    c.fillText(label, x + swatch + padX - 4 * s, y + hChip / 2 + 0.5);

    // live value
    c.font = mono(700, 12 * s);
    c.fillStyle = z.color;
    c.fillText(value, x + swatch + padX - 4 * s + labelW + gap, y + hChip / 2 + 0.5);
    c.textBaseline = 'alphabetic';
    c.restore();
  }

  // --------------------------------------------------- progressive route layer
  private paintProgressTo(idx: number) {
    if (idx < this.progIdx) {
      this.progCtx.clearRect(0, 0, this.w, this.h);
      this.progIdx = -1;
    }
    if (idx === this.progIdx) return;
    const order = this.drawOrder;
    const ctx = this.progCtx;
    const s = this.s;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // find position in draw order
    let k = 0;
    while (k < order.length && order[k] <= this.progIdx) k++;
    if (this.progIdx < 0) k = 0;
    for (; k < order.length; k++) {
      const i = order[k];
      if (i > idx) break;
      const prev = k === 0 ? 0 : order[k - 1];
      const color = this.zoneColors ? this.zoneColors[i] : this.activity.points[i].color;
      // glow underlay
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 7.5 * s;
      ctx.beginPath();
      ctx.moveTo(this.px[prev], this.py[prev]);
      ctx.lineTo(this.px[i], this.py[i]);
      ctx.stroke();
      // core
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      ctx.moveTo(this.px[prev], this.py[prev]);
      ctx.lineTo(this.px[i], this.py[i]);
      ctx.stroke();
      // in-fill micro segments between resampled indices (keeps line continuous)
      if (i - prev > 1) {
        ctx.lineWidth = 3.4 * s;
        ctx.beginPath();
        ctx.moveTo(this.px[prev], this.py[prev]);
        for (let mIdx = prev + 1; mIdx <= i; mIdx++) ctx.lineTo(this.px[mIdx], this.py[mIdx]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    this.progIdx = idx;
  }

  // ------------------------------------------------------------------ frame
  draw(ctx: CanvasRenderingContext2D, p: number, timeSec: number) {
    const c = ctx as Ctx;
    const { w, h, s, theme } = this;
    const clamped = Math.min(1, Math.max(0, p));
    const idx = Math.min(this.n - 1, Math.round(clamped * (this.n - 1)));
    const pt = this.activity.points[idx];
    const st = this.activity.stats;

    c.clearRect(0, 0, w, h);
    c.drawImage(this.base, 0, 0);

    this.paintProgressTo(idx);
    c.drawImage(this.prog, 0, 0);

    // moving marker + pulse (ring takes the current zone colour when zoning)
    const x = this.px[idx];
    const y = this.py[idx];
    const markerColor = this.zoneColors ? this.zoneColors[idx] : theme.accent;
    const pulse = (timeSec * 1.1) % 1;
    c.save();
    c.strokeStyle = markerColor;
    c.globalAlpha = (1 - pulse) * 0.7;
    c.lineWidth = 2 * s;
    c.beginPath();
    c.arc(x, y, (8 + pulse * 20) * s, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
    c.shadowColor = markerColor;
    c.shadowBlur = 16 * s;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x, y, 5.2 * s, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = markerColor;
    c.lineWidth = 2.4 * s;
    c.beginPath();
    c.arc(x, y, 8.4 * s, 0, Math.PI * 2);
    c.stroke();
    c.restore();

    // ------- elevation chart progress
    this.drawChart(c, idx, pt);

    // ------- HUD
    if (this.portrait) this.drawHudPortrait(c, idx, pt, clamped);
    else this.drawHudLandscape(c, idx, pt, clamped);

    // ------- live zone chip (when zoning)
    this.drawZoneChip(c, idx);

    // ------- top progress hairline
    c.save();
    c.fillStyle = 'rgba(148,163,184,0.15)';
    c.fillRect(0, 0, w, 3 * s);
    const grad = c.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, speedColor(0.2));
    grad.addColorStop(1, theme.accent);
    c.fillStyle = grad;
    c.fillRect(0, 0, w * clamped, 3 * s);
    c.restore();

    // ------- finish callout
    if (clamped > 0.975) {
      const a = Math.min(1, (clamped - 0.975) / 0.025);
      const fx = this.px[this.n - 1];
      const fy = this.py[this.n - 1];
      const txt = `${fmtKm(st.distance)} km · ${fmtDur(st.duration)}`;
      c.save();
      c.globalAlpha = a;
      c.font = mono(600, 13 * s);
      const tw = c.measureText(txt).width;
      const bw = tw + 28 * s;
      const bh = 30 * s;
      let bx = fx - bw / 2;
      bx = Math.max(8 * s, Math.min(w - bw - 8 * s, bx));
      let by = fy - 52 * s;
      if (by < 40 * s) by = fy + 18 * s;
      rr(c, bx, by, bw, bh, 8 * s);
      c.fillStyle = 'rgba(5,8,12,0.85)';
      c.fill();
      c.strokeStyle = theme.accent;
      c.lineWidth = 1.2 * s;
      c.stroke();
      c.fillStyle = theme.accent;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(txt, bx + bw / 2, by + bh / 2 + 1);
      c.textBaseline = 'alphabetic';
      c.restore();
    }
  }

  // -------------------------------------------------------------- chart dyn
  private drawChart(c: Ctx, idx: number, pt: { alt: number; grade: number; dist: number }) {
    const s = this.s;
    const theme = this.theme;
    const cx = this.chartX(idx);
    const cy = this.chartY(pt.alt);
    const inner = this.chartInner;

    c.save();
    c.beginPath();
    c.rect(inner.x - 4, 0, cx - inner.x + 4, this.h);
    c.clip();
    const g = c.createLinearGradient(0, inner.y, 0, inner.y + inner.h);
    g.addColorStop(0, theme.accentSoft.replace(/0\.16\)/, '0.55)'));
    g.addColorStop(1, theme.accentSoft);
    this.traceChart(c, true);
    c.fillStyle = g;
    c.fill();
    this.traceChart(c, false);
    c.strokeStyle = theme.accent;
    c.lineWidth = 2 * s;
    c.stroke();
    c.restore();

    // crosshair
    c.save();
    c.strokeStyle = 'rgba(226,232,240,0.25)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx, inner.y - 6 * s);
    c.lineTo(cx, inner.y + inner.h + 4 * s);
    c.stroke();
    // dot on profile
    c.shadowColor = theme.accent;
    c.shadowBlur = 10 * s;
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(cx, cy, 3.8 * s, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = theme.accent;
    c.lineWidth = 1.8 * s;
    c.beginPath();
    c.arc(cx, cy, 6.4 * s, 0, Math.PI * 2);
    c.stroke();

    // current altitude label near dot (kept inside panel)
    const labelTxt = `${fmtInt(pt.alt)} m`;
    c.font = mono(600, 12 * s);
    const tw = c.measureText(labelTxt).width;
    let lx = cx + 12 * s;
    if (lx + tw > inner.x + inner.w) lx = cx - 12 * s - tw;
    const ly = Math.max(inner.y + 4 * s, cy - 16 * s);
    c.fillStyle = theme.accent;
    c.textAlign = 'left';
    c.fillText(labelTxt, lx, ly + 4 * s);

    // grade readout — top-right above the plot, clear of km ticks
    const grd = `${pt.grade >= 0 ? '+' : ''}${pt.grade.toFixed(1)}%`;
    c.textAlign = 'right';
    c.fillStyle = 'rgba(226,232,240,0.6)';
    c.font = mono(500, 11 * s);
    try { c.letterSpacing = '1px'; } catch { /* noop */ }
    c.fillText(`GRADE ${grd}`, inner.x + inner.w, inner.y - 8 * s);
    try { c.letterSpacing = '0px'; } catch { /* noop */ }

    // "ELEVATION" tag — top-left above the plot
    c.textAlign = 'left';
    c.fillStyle = 'rgba(226,232,240,0.4)';
    c.font = mono(600, 10 * s);
    try { c.letterSpacing = '2px'; } catch { /* noop */ }
    c.fillText('ELEVATION', inner.x, inner.y - 8 * s);
    try { c.letterSpacing = '0px'; } catch { /* noop */ }
    c.restore();
  }

  // ---------------------------------------------------------------- HUD bits
  private chip(c: Ctx, x: number, y: number, text: string, accentText = false): number {
    const s = this.s;
    c.save();
    c.font = mono(600, 13.5 * s);
    const tw = c.measureText(text).width;
    const padX = 12 * s;
    const hChip = 30 * s;
    rr(c, x, y, tw + padX * 2, hChip, 8 * s);
    c.fillStyle = 'rgba(5,8,12,0.62)';
    c.fill();
    c.strokeStyle = 'rgba(148,163,184,0.2)';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = accentText ? this.theme.accent : 'rgba(241,245,249,0.92)';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(text, x + padX, y + hChip / 2 + 0.5);
    c.textBaseline = 'alphabetic';
    c.restore();
    return tw + padX * 2;
  }

  private hudLabel(c: Ctx, text: string, x: number, y: number, align: CanvasTextAlign = 'left') {
    const s = this.s;
    c.save();
    c.font = disp(600, 11.5 * s);
    try { c.letterSpacing = '2.5px'; } catch { /* noop */ }
    c.fillStyle = 'rgba(148,163,184,0.72)';
    c.textAlign = align;
    c.fillText(text.toUpperCase(), x, y);
    try { c.letterSpacing = '0px'; } catch { /* noop */ }
    c.restore();
  }

  private titleBlock(c: Ctx) {
    const s = this.s;
    const a = this.activity;
    const yBase = 44 * s;
    c.save();
    c.textAlign = 'left';
    c.font = disp(700, 24 * s);
    c.fillStyle = 'rgba(248,250,252,0.96)';
    const name = a.name.length > 42 ? `${a.name.slice(0, 40)}…` : a.name;
    c.fillText(name, 44 * s, yBase);
    c.font = mono(500, 11.5 * s);
    c.fillStyle = 'rgba(148,163,184,0.78)';
    const dateStr = a.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const meta = `${dateStr}  ·  ${a.sport.toUpperCase()}  ·  ${fmtInt(a.stats.points)} GPS POINTS${a.device ? `  ·  ${a.device.toUpperCase()}` : ''}`;
    try { c.letterSpacing = '1.2px'; } catch { /* noop */ }
    c.fillText(meta, 44 * s, yBase + 20 * s);
    try { c.letterSpacing = '0px'; } catch { /* noop */ }
    // wordmark top-right
    c.textAlign = 'right';
    c.font = disp(700, 13 * s);
    try { c.letterSpacing = '3px'; } catch { /* noop */ }
    c.fillStyle = this.theme.accent;
    c.fillText('ROUTE REEL', this.w - 44 * s, yBase - 2 * s);
    c.font = mono(500, 9.5 * s);
    c.fillStyle = 'rgba(148,163,184,0.6)';
    c.fillText('FIT → VIDEO · CLIENT-SIDE RENDER', this.w - 44 * s, yBase + 14 * s);
    try { c.letterSpacing = '0px'; } catch { /* noop */ }
    c.restore();
  }

  private drawHudLandscape(c: Ctx, idx: number, pt: any, p: number) {
    const s = this.s;
    const st = this.activity.stats;
    this.titleBlock(c);

    // big distance, bottom-left above chart
    const baseX = this.mapRect.x + 6 * s;
    const baseY = this.mapRect.y + this.mapRect.h - 18 * s;
    c.save();
    c.font = mono(700, 54 * s);
    c.fillStyle = 'rgba(248,250,252,0.97)';
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 12 * s;
    c.textAlign = 'left';
    const kmTxt = fmtKm(this.activity.points[idx].dist);
    const kmW = c.measureText(kmTxt).width;
    c.fillText(kmTxt, baseX, baseY);
    c.shadowBlur = 0;
    c.font = disp(600, 16 * s);
    c.fillStyle = 'rgba(148,163,184,0.85)';
    c.fillText(' KM', baseX + kmW + 8 * s, baseY);
    c.restore();

    // chips row along bottom of map (right of distance)
    const chipY = this.mapRect.y + this.mapRect.h - 44 * s;
    let cx = baseX + kmW + 64 * s;
    cx += this.chip(c, cx, chipY, `TIME ${fmtDur(pt.t)}`) + 10 * s;
    cx += this.chip(c, cx, chipY, `SPD ${fmtKmh(pt.speed)} km/h`, true) + 10 * s;
    this.chip(c, cx, chipY, `ALT ${fmtInt(pt.alt)} m`);

    // right stat stack
    const rx = this.mapRect.x + this.mapRect.w - 6 * s;
    let ry = this.mapRect.y + 58 * s;
    const stack: Array<[string, string]> = [
      ['ELEV GAIN', `+${fmtInt(st.gainPrefix[idx])} m`],
      ['AVG SPEED', `${fmtKmh(st.avgSpeed)} km/h`],
    ];
    if (pt.hr != null) stack.push(['HEART RATE', `${pt.hr} bpm`]);
    if (pt.power != null) stack.push(['POWER', `${pt.power} W`]);
    c.save();
    for (const [label, value] of stack) {
      this.hudLabel(c, label, rx, ry, 'right');
      c.font = mono(600, 21 * s);
      c.fillStyle = 'rgba(248,250,252,0.95)';
      c.textAlign = 'right';
      c.fillText(value, rx, ry + 24 * s);
      ry += 56 * s;
    }
    c.restore();

    // progress % bottom-right under stack
    c.save();
    c.font = mono(500, 11 * s);
    c.fillStyle = 'rgba(148,163,184,0.6)';
    c.textAlign = 'right';
    c.fillText(`${Math.round(p * 100)}%`, rx, this.mapRect.y + this.mapRect.h - 18 * s);
    c.restore();
  }

  private drawHudPortrait(c: Ctx, idx: number, pt: any, p: number) {
    const s = this.s;
    const st = this.activity.stats;
    this.titleBlock(c);

    const baseX = this.chartRect.x;
    const rowY = this.chartRect.y - 74 * s;

    // big distance
    c.save();
    c.font = mono(700, 46 * s);
    c.fillStyle = 'rgba(248,250,252,0.97)';
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 10 * s;
    c.textAlign = 'left';
    const kmTxt = fmtKm(this.activity.points[idx].dist);
    const kmW = c.measureText(kmTxt).width;
    c.fillText(kmTxt, baseX, rowY);
    c.shadowBlur = 0;
    c.font = disp(600, 15 * s);
    c.fillStyle = 'rgba(148,163,184,0.85)';
    c.fillText(' KM', baseX + kmW + 6 * s, rowY);
    c.restore();

    // gain on right of distance
    c.save();
    this.hudLabel(c, 'ELEV GAIN', this.chartRect.x + this.chartRect.w, rowY - 22 * s, 'right');
    c.font = mono(600, 24 * s);
    c.fillStyle = this.theme.accent;
    c.textAlign = 'right';
    c.fillText(`+${fmtInt(st.gainPrefix[idx])} m`, this.chartRect.x + this.chartRect.w, rowY);
    c.restore();

    // chips row
    const chipY = rowY + 16 * s;
    let cx = baseX;
    cx += this.chip(c, cx, chipY, `${fmtDur(pt.t)}`) + 8 * s;
    cx += this.chip(c, cx, chipY, `${fmtKmh(pt.speed)} km/h`, true) + 8 * s;
    if (pt.hr != null) this.chip(c, cx, chipY, `${pt.hr} bpm`);

    // percent
    c.save();
    c.font = mono(500, 11 * s);
    c.fillStyle = 'rgba(148,163,184,0.65)';
    c.textAlign = 'right';
    c.fillText(`${Math.round(p * 100)}%`, this.chartRect.x + this.chartRect.w, chipY + 21 * s);
    c.restore();
  }
}

// --------------------------------------------------------------- font warm-up

let fontsReady: Promise<unknown> | null = null;
export function ensureReelFonts(): Promise<unknown> {
  if (!fontsReady) {
    const loads = [
      ['400', 'Space Grotesk'], ['500', 'Space Grotesk'], ['600', 'Space Grotesk'], ['700', 'Space Grotesk'],
      ['400', 'IBM Plex Mono'], ['500', 'IBM Plex Mono'], ['600', 'IBM Plex Mono'], ['700', 'IBM Plex Mono'],
    ].map(([wght, fam]) => document.fonts.load(`${wght} 16px "${fam}"`).catch(() => null));
    fontsReady = Promise.all(loads).then(() => document.fonts.ready.catch(() => null));
  }
  return fontsReady;
}

// ------------------------------------------------------------------ recorder

export function canRecordVideo(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

export interface ReelResult {
  blob: Blob;
  url: string;
  mime: string;
  ext: string;
  sizeBytes: number;
  durationSec: number;
  width: number;
  height: number;
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs="avc1.42E01E"',
  'video/mp4',
];

export async function recordReel(
  activity: Activity,
  opts: ReelOpts,
  onProgress?: (p: number) => void,
): Promise<ReelResult> {
  if (!canRecordVideo()) throw new Error('Video capture is not supported in this browser.');
  await ensureReelFonts();

  const renderer = new ReelRenderer(activity, opts);
  const canvas = document.createElement('canvas');
  canvas.width = renderer.w;
  canvas.height = renderer.h;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const mime = MIME_CANDIDATES.find((m) => {
    try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
  }) ?? '';

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(
    stream,
    mime
      ? { mimeType: mime, videoBitsPerSecond: 9_000_000 }
      : { videoBitsPerSecond: 9_000_000 },
  );
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Recorder failed while encoding.'));
    recorder.onstop = () => {
      const type = recorder.mimeType || mime || 'video/webm';
      resolve(new Blob(chunks, { type }));
    };
  });

  renderer.draw(ctx, 0, 0);
  recorder.start(250);

  const dur = opts.durationSec;
  const tailHold = 0.6; // hold last frame slightly so the video doesn't cut abruptly
  const t0 = performance.now();

  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const el = (now - t0) / 1000;
      const p = Math.min(1, el / dur);
      renderer.draw(ctx, p, el);
      onProgress?.(Math.min(1, el / (dur + tailHold)));
      if (el >= dur + tailHold) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  stream.getTracks().forEach((t) => t.stop());
  recorder.stop();
  const blob = await done;
  if (!blob.size) throw new Error('Encoding produced an empty file — try a shorter duration.');
  const realMime = blob.type || mime || 'video/webm';
  const ext = realMime.includes('mp4') ? 'mp4' : 'webm';
  onProgress?.(1);
  return {
    blob,
    url: URL.createObjectURL(blob),
    mime: realMime,
    ext,
    sizeBytes: blob.size,
    durationSec: dur,
    width: renderer.w,
    height: renderer.h,
  };
}
