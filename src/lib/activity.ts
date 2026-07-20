// ---------------------------------------------------------------------------
// Route Reel — activity data model, stats engine, colors, formatters
// ---------------------------------------------------------------------------

export interface TrackPoint {
  lat: number; // degrees
  lng: number; // degrees
  alt: number; // meters (lightly smoothed)
  speed: number; // m/s (smoothed)
  dist: number; // cumulative distance, meters
  time: number; // ms epoch
  t: number; // seconds since start
  hr: number | null;
  power: number | null;
  cadence: number | null; // rpm (crank)
  temp: number | null; // °C (ambient sensor)
  lrBalance: number | null; // right-leg contribution %, if a dual-sided meter
  grade: number; // % grade over ~15 m window
  sn: number; // normalized speed 0..1
  color: string; // speed-derived color
}

export interface LapInfo {
  index: number;
  startTime: Date | null;
  distance: number; // meters
  duration: number; // seconds (timer time)
  elevGain: number; // meters
  elevLoss: number; // meters
  avgSpeed: number | null; // m/s
  maxSpeed: number | null; // m/s
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number | null;
  maxPower: number | null;
  avgCadence: number | null;
}

export interface SensorInfo {
  deviceIndex: number;
  manufacturer: string | null;
  product: string | null;
  type: string | null; // e.g. "power", "heart_rate", "barometer"
  battery: string | null; // e.g. "good"
  chargePercent: number | null;
  voltage: number | null;
}

export interface ActivityStats {
  distance: number; // meters
  duration: number; // seconds (elapsed)
  movingTime: number; // seconds (timer time — clock stopped)
  elapsedTime: number; // seconds (clock running)
  elevGain: number; // meters
  elevLoss: number; // meters
  minAlt: number;
  maxAlt: number;
  avgSpeed: number; // m/s
  maxSpeed: number; // m/s
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number | null;
  maxPower: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgTemp: number | null;
  maxTemp: number | null;
  calories: number | null;
  // Device-computed training metrics (present when a power meter recorded them)
  deviceNp: number | null; // normalized power (W)
  deviceIf: number | null; // intensity factor
  deviceTss: number | null; // training stress score
  thresholdPower: number | null; // FTP stored in the file (W)
  points: number;
  gainPrefix: Float64Array; // cumulative elevation gain per point index
}

export interface Activity {
  id: string;
  name: string;
  sport: string; // e.g. "cycling"
  date: Date;
  device: string | null;
  fileName: string | null;
  fileSize: number | null;
  points: TrackPoint[];
  stats: ActivityStats;
  laps: LapInfo[];
  sensors: SensorInfo[];
}

// ---------------------------------------------------------------- geo math

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const a =
    s1 * s1 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function movingAvg(values: number[], win: number): number[] {
  const out = new Array<number>(values.length);
  const h = Math.floor(win / 2);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i - win >= 0) sum -= values[i - win];
    const lo = Math.max(0, i - h);
    const hi = Math.min(values.length - 1, i + h);
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[i];
}

/**
 * Decode a FIT left/right pedal-balance field into the right-leg contribution
 * percentage. The parser yields either a raw byte (bit 0x80 = "right") or an
 * object like `{ value: 53, right: false }`. Returns null for single-sided
 * meters that don't report balance.
 */
function lrRightPct(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    const isRight = (raw & 0x80) !== 0;
    const v = raw & 0x7f;
    return isRight ? v : 100 - v;
  }
  if (typeof raw === 'object') {
    const o = raw as { value?: number; right?: boolean };
    const v = Number(o.value);
    if (!isFinite(v)) return null;
    return o.right ? v : 100 - v;
  }
  return null;
}

// ---------------------------------------------------------------- colors

const SPEED_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [56, 189, 248]], // glacier blue (slow)
  [0.3, [52, 211, 153]], // mint
  [0.55, [181, 241, 62]], // volt
  [0.78, [250, 204, 21]], // amber
  [1.0, [248, 113, 113]], // hot red (fast)
];

export function speedColor(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < SPEED_STOPS.length; i++) {
    if (x <= SPEED_STOPS[i][0]) {
      const [t0, c0] = SPEED_STOPS[i - 1];
      const [t1, c1] = SPEED_STOPS[i];
      const k = t1 === t0 ? 0 : (x - t0) / (t1 - t0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * k);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * k);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * k);
      return `rgb(${r},${g},${b})`;
    }
  }
  return 'rgb(248,113,113)';
}

export const SPEED_GRADIENT_CSS =
  'linear-gradient(90deg, rgb(56,189,248), rgb(52,211,153), rgb(181,241,62), rgb(250,204,21), rgb(248,113,113))';

// ------------------------------------------------------------- raw records

export interface RawRecord {
  timestamp: Date;
  lat: number;
  lng: number;
  altitude?: number | null;
  speed?: number | null;
  distance?: number | null;
  heart_rate?: number | null;
  power?: number | null;
  cadence?: number | null;
  temperature?: number | null;
  grade?: number | null; // device-reported grade (%)
  left_right_balance?: unknown; // parser decodes to { value, right } or a number
}

export interface RawSession {
  sport?: string;
  start_time?: Date;
  total_distance?: number;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_ascent?: number;
  total_descent?: number;
  total_calories?: number;
  avg_speed?: number;
  max_speed?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_power?: number;
  max_power?: number;
  avg_cadence?: number;
  max_cadence?: number;
  avg_temperature?: number;
  max_temperature?: number;
  min_temperature?: number;
  avg_altitude?: number;
  max_altitude?: number;
  min_altitude?: number;
  normalized_power?: number;
  intensity_factor?: number;
  training_stress_score?: number;
  threshold_power?: number;
  num_laps?: number;
}

export interface BuildMeta {
  name: string;
  device?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  session?: RawSession | null;
  laps?: RawSession[] | null;
  sensors?: SensorInfo[] | null;
}

export function buildActivity(records: RawRecord[], meta: BuildMeta): Activity {
  const clean = records
    .filter(
      (r) =>
        r.timestamp instanceof Date &&
        !isNaN(r.timestamp.getTime()) &&
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lng) &&
        Math.abs(r.lat) <= 90 &&
        Math.abs(r.lng) <= 180,
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (clean.length < 8) {
    throw new Error('This FIT file has no usable GPS track (need at least a few position records).');
  }

  const n = clean.length;
  const t0 = clean[0].timestamp.getTime();

  // distance — prefer device-reported cumulative distance when monotonic
  const dist = new Array<number>(n);
  let useDeviceDist = false;
  if (clean.every((r) => typeof r.distance === 'number' && isFinite(r.distance as number))) {
    useDeviceDist = true;
    for (let i = 1; i < n; i++) {
      if ((clean[i].distance as number) < (clean[i - 1].distance as number) - 0.5) {
        useDeviceDist = false;
        break;
      }
    }
  }
  dist[0] = 0;
  for (let i = 1; i < n; i++) {
    if (useDeviceDist) {
      dist[i] = Math.max(dist[i - 1], (clean[i].distance as number) - (clean[0].distance as number));
    } else {
      const step = haversineM(clean[i - 1].lat, clean[i - 1].lng, clean[i].lat, clean[i].lng);
      dist[i] = dist[i - 1] + (step < 120 ? step : 0); // drop GPS teleports
    }
  }

  // altitude: fill gaps by nearest, then light smoothing
  const rawAlt = clean.map((r) =>
    typeof r.altitude === 'number' && isFinite(r.altitude) ? (r.altitude as number) : NaN,
  );
  let last = 0;
  for (let i = 0; i < n; i++) {
    if (isFinite(rawAlt[i])) last = rawAlt[i];
    else rawAlt[i] = last;
  }
  for (let i = n - 2; i >= 0; i--) if (!isFinite(clean[i].altitude as number)) rawAlt[i] = rawAlt[i + 1];
  const alt = movingAvg(rawAlt, 5);

  // speed: device speed or derived, smoothed
  const rawSpeed = clean.map((r, i) => {
    if (typeof r.speed === 'number' && isFinite(r.speed) && r.speed >= 0 && r.speed < 60) {
      return r.speed;
    }
    if (i === 0) return 0;
    const dt = (clean[i].timestamp.getTime() - clean[i - 1].timestamp.getTime()) / 1000;
    return dt > 0 ? (dist[i] - dist[i - 1]) / dt : 0;
  });
  const speed = movingAvg(rawSpeed, 7).map((s) => Math.min(s, 55));

  // normalized speed → color
  const moving = speed.filter((s) => s > 0.5).sort((a, b) => a - b);
  const lo = percentile(moving, 5);
  const hi = Math.max(lo + 0.5, percentile(moving, 96));

  // grade over a ~25 m lookback, smoothed to kill single-point altitude spikes
  const gradeRaw = new Array<number>(n).fill(0);
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (j < i && dist[i] - dist[j] > 25) j++;
    const dd = dist[i] - dist[j];
    gradeRaw[i] = dd > 5 ? ((alt[i] - alt[j]) / dd) * 100 : 0;
  }
  const grade = movingAvg(gradeRaw, 9).map((g) => Math.max(-26, Math.min(26, g)));

  // cumulative elevation gain prefix (smoothed altitude)
  const gainPrefix = new Float64Array(n);
  let rawGain = 0;
  let rawLoss = 0;
  for (let i = 1; i < n; i++) {
    const d = alt[i] - alt[i - 1];
    if (d > 0) rawGain += d;
    else rawLoss += -d;
    gainPrefix[i] = rawGain;
  }

  const s = meta.session ?? null;
  const elevGain = s?.total_ascent && s.total_ascent > 0 ? s.total_ascent : rawGain;
  const elevLoss = s?.total_descent && s.total_descent > 0 ? s.total_descent : rawLoss;
  // keep the live gain counter consistent with the headline total
  if (rawGain > 1 && elevGain > 0) {
    const k = elevGain / rawGain;
    for (let i = 0; i < n; i++) gainPrefix[i] *= k;
  }

  const hrVals = clean.map((r) => r.heart_rate).filter((v): v is number => typeof v === 'number' && v > 30 && v < 240);
  const pwVals = clean.map((r) => r.power).filter((v): v is number => typeof v === 'number' && v >= 0 && v < 2500);
  const cadVals = clean.map((r) => r.cadence).filter((v): v is number => typeof v === 'number' && v > 0 && v < 255);
  const tempVals = clean
    .map((r) => r.temperature)
    .filter((v): v is number => typeof v === 'number' && isFinite(v) && v > -60 && v < 70);

  const duration = Math.max(
    1,
    s?.total_timer_time ?? s?.total_elapsed_time ?? (clean[n - 1].timestamp.getTime() - t0) / 1000,
  );
  const distance = Math.max(dist[n - 1], s?.total_distance ?? 0);
  const movingTime = Math.max(1, s?.total_timer_time ?? duration);
  const elapsedTime = Math.max(movingTime, s?.total_elapsed_time ?? movingTime);

  let minAlt = Infinity;
  let maxAlt = -Infinity;
  for (const a of alt) {
    if (a < minAlt) minAlt = a;
    if (a > maxAlt) maxAlt = a;
  }

  const points: TrackPoint[] = clean.map((r, i) => {
    const sn = Math.min(1, Math.max(0, (speed[i] - lo) / (hi - lo)));
    return {
      lat: r.lat,
      lng: r.lng,
      alt: alt[i],
      speed: speed[i],
      dist: dist[i],
      time: r.timestamp.getTime(),
      t: (r.timestamp.getTime() - t0) / 1000,
      hr: typeof r.heart_rate === 'number' && r.heart_rate > 0 ? r.heart_rate : null,
      power: typeof r.power === 'number' && r.power >= 0 ? r.power : null,
      cadence: typeof r.cadence === 'number' && r.cadence >= 0 && r.cadence < 255 ? r.cadence : null,
      temp: typeof r.temperature === 'number' && isFinite(r.temperature) ? r.temperature : null,
      lrBalance: lrRightPct(r.left_right_balance),
      grade: grade[i],
      sn,
      color: speedColor(sn),
    };
  });

  const stats: ActivityStats = {
    distance,
    duration,
    movingTime,
    elapsedTime,
    elevGain,
    elevLoss,
    minAlt,
    maxAlt,
    avgSpeed: distance / duration,
    maxSpeed: s?.max_speed && s.max_speed < 60 ? s.max_speed : Math.max(...speed),
    avgHr: s?.avg_heart_rate ?? (hrVals.length ? hrVals.reduce((a, b) => a + b, 0) / hrVals.length : null),
    maxHr: s?.max_heart_rate ?? (hrVals.length ? Math.max(...hrVals) : null),
    avgPower: s?.avg_power ?? (pwVals.length ? pwVals.reduce((a, b) => a + b, 0) / pwVals.length : null),
    maxPower: s?.max_power ?? (pwVals.length ? Math.max(...pwVals) : null),
    avgCadence: s?.avg_cadence ?? (cadVals.length ? cadVals.reduce((a, b) => a + b, 0) / cadVals.length : null),
    maxCadence: s?.max_cadence ?? (cadVals.length ? Math.max(...cadVals) : null),
    avgTemp: s?.avg_temperature ?? (tempVals.length ? tempVals.reduce((a, b) => a + b, 0) / tempVals.length : null),
    maxTemp: s?.max_temperature ?? (tempVals.length ? Math.max(...tempVals) : null),
    calories: s?.total_calories ?? null,
    deviceNp: typeof s?.normalized_power === 'number' ? s.normalized_power : null,
    deviceIf: typeof s?.intensity_factor === 'number' ? s.intensity_factor : null,
    deviceTss: typeof s?.training_stress_score === 'number' ? s.training_stress_score : null,
    thresholdPower: typeof s?.threshold_power === 'number' ? s.threshold_power : null,
    points: n,
    gainPrefix,
  };

  const laps: LapInfo[] = (meta.laps ?? []).map((lp, i) => ({
    index: i + 1,
    startTime: lp.start_time instanceof Date ? lp.start_time : null,
    distance: lp.total_distance ?? 0,
    duration: Math.max(1, lp.total_timer_time ?? lp.total_elapsed_time ?? 0),
    elevGain: lp.total_ascent ?? 0,
    elevLoss: lp.total_descent ?? 0,
    avgSpeed: typeof lp.avg_speed === 'number' ? lp.avg_speed : null,
    maxSpeed: typeof lp.max_speed === 'number' ? lp.max_speed : null,
    avgHr: typeof lp.avg_heart_rate === 'number' ? lp.avg_heart_rate : null,
    maxHr: typeof lp.max_heart_rate === 'number' ? lp.max_heart_rate : null,
    avgPower: typeof lp.avg_power === 'number' ? lp.avg_power : null,
    maxPower: typeof lp.max_power === 'number' ? lp.max_power : null,
    avgCadence: typeof lp.avg_cadence === 'number' ? lp.avg_cadence : null,
  }));

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: meta.name,
    sport: (s?.sport ?? 'activity').replace(/_/g, ' '),
    date: s?.start_time instanceof Date ? s.start_time : clean[0].timestamp,
    device: meta.device ?? null,
    fileName: meta.fileName ?? null,
    fileSize: meta.fileSize ?? null,
    points,
    stats,
    laps,
    sensors: meta.sensors ?? [],
  };
}

// ---------------------------------------------------------------- formatters

export function fmtKm(m: number, digits = 2): string {
  return (m / 1000).toFixed(digits);
}

export function fmtKmh(ms: number, digits = 1): string {
  const v = ms * 3.6;
  return (Math.abs(v) < 0.05 ? 0 : v).toFixed(digits);
}

export function fmtDur(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtInt(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function prettyFileName(name: string): string {
  return name
    .replace(/\.fit$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.fit$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'activity'
  );
}

export function sportLabel(sport: string): string {
  const s = sport.toLowerCase();
  if (s.includes('cycl')) return 'Ride';
  if (s.includes('run')) return 'Run';
  if (s.includes('walk') || s.includes('hik')) return 'Hike';
  if (s.includes('swim')) return 'Swim';
  return 'Activity';
}

export function speedUnitLabel(sport: string): string {
  return sport.toLowerCase().includes('swim') ? 'm/s' : 'km/h';
}

// ------------------------------------------------- synthetic demo fallback

/**
 * Fallback "virtual climb" dataset used when the bundled sample files cannot
 * be fetched. Generates a plausible alpine loop with climb, switchbacks and
 * a fast descent so every feature of the app can be exercised.
 */
export function makeSyntheticRide(): { records: RawRecord[]; session: RawSession } {
  const n = 1500;
  const start = Date.UTC(2024, 5, 16, 8, 32, 0);
  const baseLat = 47.135;
  const baseLng = 11.355;
  const lats = new Array<number>(n);
  const lngs = new Array<number>(n);
  const alts = new Array<number>(n);
  const dists = new Array<number>(n);
  let alt = 640;
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const theta = u * Math.PI * 2;
    const wob = Math.sin(theta * 3.1) * 0.35 + Math.sin(theta * 7.3) * 0.12;
    const rLat = 0.052 * (1 + 0.38 * Math.sin(theta * 2.2 + 1.3)) * (1 + wob * 0.18);
    const rLng = 0.062 * (1 + 0.3 * Math.cos(theta * 1.7)) * (1 + wob * 0.15);
    const lat = baseLat + rLat * Math.cos(theta);
    const lng = baseLng + rLng * Math.sin(theta) + Math.sin(theta * 11) * 0.0022;
    const climbShape = u < 0.55 ? u / 0.55 : 1 - (u - 0.55) / 0.45;
    const targetAlt = 640 + 980 * Math.pow(climbShape, 1.15) + Math.sin(theta * 14) * 26;
    alt += (targetAlt - alt) * 0.12;
    if (i > 0) dist += haversineM(lats[i - 1], lngs[i - 1], lat, lng);
    lats[i] = lat;
    lngs[i] = lng;
    alts[i] = alt;
    dists[i] = dist;
  }
  const records: RawRecord[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const downhill = u > 0.62;
    const uphill = u > 0.08 && u < 0.55;
    const base = uphill
      ? 5.2 + Math.sin(u * 60) * 1.3
      : downhill
        ? 13.5 + Math.sin(u * 48) * 3.4
        : 8.4 + Math.sin(u * 40) * 2.1;
    const speed = Math.max(2.4, Math.min(18.5, base));
    const effort = uphill ? 0.86 : downhill ? 0.42 : 0.62;
    records.push({
      timestamp: new Date(start + i * 4400),
      lat: lats[i],
      lng: lngs[i],
      altitude: alts[i],
      speed,
      distance: dists[i],
      heart_rate: Math.round(96 + effort * 68 + Math.sin(u * 90) * 7),
      power: Math.round(effort * 265 + Math.sin(u * 110) * 30),
    });
  }
  return {
    records,
    session: {
      sport: 'cycling',
      start_time: records[0].timestamp,
      total_distance: dists[n - 1],
      total_elapsed_time: (records[n - 1].timestamp.getTime() - records[0].timestamp.getTime()) / 1000,
      total_ascent: 1020,
      total_descent: 1010,
      total_calories: 1560,
    },
  };
}
