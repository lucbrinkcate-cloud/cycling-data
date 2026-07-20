// ---------------------------------------------------------------------------
// Route Reel — 7-zone engine (Coggan power zones) with speed-zone fallback
// ---------------------------------------------------------------------------
import type { Activity } from './activity';

export interface ZoneDef {
  idx: number;
  short: string;
  name: string;
  minPct: number; // inclusive
  maxPct: number; // exclusive (Infinity for Z7)
  color: string;
}

export const ZONES: ZoneDef[] = [
  { idx: 0, short: 'Z1', name: 'Active Recovery', minPct: 0, maxPct: 55, color: '#94a3b8' },
  { idx: 1, short: 'Z2', name: 'Endurance', minPct: 55, maxPct: 75, color: '#38bdf8' },
  { idx: 2, short: 'Z3', name: 'Tempo', minPct: 75, maxPct: 90, color: '#4ade80' },
  { idx: 3, short: 'Z4', name: 'Threshold', minPct: 90, maxPct: 105, color: '#facc15' },
  { idx: 4, short: 'Z5', name: 'VO2 Max', minPct: 105, maxPct: 120, color: '#fb923c' },
  { idx: 5, short: 'Z6', name: 'Anaerobic', minPct: 120, maxPct: 150, color: '#f87171' },
  { idx: 6, short: 'Z7', name: 'Neuromuscular', minPct: 150, maxPct: Infinity, color: '#e879f9' },
];

export function zoneForPct(pct: number): number {
  if (pct < 55) return 0;
  if (pct < 75) return 1;
  if (pct < 90) return 2;
  if (pct < 105) return 3;
  if (pct < 120) return 4;
  if (pct < 150) return 5;
  return 6;
}

export interface ZoneResult {
  metric: 'power' | 'speed';
  threshold: number; // watts or m/s
  colors: string[]; // per-point zone color
  idx: Int8Array; // per-point zone index
  timeInZone: number[]; // seconds per zone
  distInZone: number[]; // meters per zone
  value: Float32Array; // smoothed metric used for zoning (W or m/s)
  avgValue: number; // average of the smoothed metric
  maxValue: number; // max of the smoothed metric
  np: number | null; // normalized power (W)
  intensityFactor: number | null;
  tss: number | null;
}

function rollingAvg(src: number[], win: number): number[] {
  const out = new Array<number>(src.length);
  const w = Math.max(1, Math.round(win));
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i - w >= 0) sum -= src[i - w];
    const lo = Math.max(0, i - w + 1);
    out[i] = sum / (i - lo + 1);
  }
  return out;
}

/** Best rolling-window average speed of length `windowSec` (m/s). */
export function bestRollingSpeed(activity: Activity, windowSec: number): number {
  const pts = activity.points;
  const n = pts.length;
  if (n < 4) return 0;
  const rate = activity.stats.duration / Math.max(1, n - 1); // seconds per record
  const win = Math.max(1, Math.min(n - 1, Math.round(windowSec / Math.max(0.5, rate))));
  const speeds = pts.map((p) => p.speed);
  const roll = rollingAvg(speeds, win);
  let best = 0;
  for (let i = win; i < n; i++) if (roll[i] > best) best = roll[i];
  if (best === 0) for (const v of roll) if (v > best) best = v;
  return best;
}

export function hasMeaningfulPower(activity: Activity): boolean {
  let withPower = 0;
  for (const p of activity.points) if (p.power != null && p.power > 5) withPower++;
  return withPower > activity.points.length * 0.4;
}

/** Estimated threshold speed from the best 20-minute effort. */
export function estimateThresholdSpeed(activity: Activity): number {
  const win = Math.min(1200, Math.max(120, activity.stats.duration * 0.45));
  return bestRollingSpeed(activity, win);
}

export function computeZones(
  activity: Activity,
  ftp: number,
  threshSpeed: number, // m/s
): ZoneResult {
  const pts = activity.points;
  const n = pts.length;
  const powerOK = hasMeaningfulPower(activity) && ftp >= 40 && ftp <= 600;
  const metric: 'power' | 'speed' = powerOK ? 'power' : 'speed';
  const threshold = powerOK ? ftp : Math.max(1.2, threshSpeed);

  const raw = pts.map((p) =>
    powerOK ? Math.max(0, p.power ?? 0) : p.speed,
  );
  const rate = activity.stats.duration / Math.max(1, n - 1);
  const smooth = rollingAvg(raw, Math.max(3, Math.round(7 / Math.max(0.5, rate))));

  const idx = new Int8Array(n);
  const colors = new Array<string>(n);
  for (let i = 0; i < n; i++) {
    const z = zoneForPct((smooth[i] / threshold) * 100);
    idx[i] = z;
    colors[i] = ZONES[z].color;
  }

  const timeInZone = new Array<number>(7).fill(0);
  const distInZone = new Array<number>(7).fill(0);
  for (let i = 1; i < n; i++) {
    const dt = Math.max(0, pts[i].t - pts[i - 1].t);
    const dd = Math.max(0, pts[i].dist - pts[i - 1].dist);
    timeInZone[idx[i]] += dt;
    distInZone[idx[i]] += dd;
  }

  // Normalized power (30 s rolling fourth-power mean), IF and TSS
  let np: number | null = null;
  let intensityFactor: number | null = null;
  let tss: number | null = null;
  if (powerOK) {
    const win30 = Math.max(1, Math.round(30 / Math.max(0.5, rate)));
    const r30 = rollingAvg(raw, win30);
    let q = 0;
    let cnt = 0;
    for (let i = win30; i < n; i++) {
      const v = r30[i] * r30[i];
      q += v * v;
      cnt++;
    }
    if (cnt > 0) {
      np = Math.pow(q / cnt, 0.25);
      intensityFactor = np / ftp;
      tss = (activity.stats.duration * intensityFactor * intensityFactor * 100) / 3600;
    }
  }

  let sumV = 0;
  let maxV = 0;
  for (let i = 0; i < n; i++) {
    sumV += smooth[i];
    if (smooth[i] > maxV) maxV = smooth[i];
  }

  return {
    metric,
    threshold,
    colors,
    idx,
    timeInZone,
    distInZone,
    value: Float32Array.from(smooth),
    avgValue: n ? sumV / n : 0,
    maxValue: maxV,
    np,
    intensityFactor,
    tss,
  };
}
