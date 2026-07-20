// ---------------------------------------------------------------------------
// Route Reel — .FIT binary parsing (browser-side) via fit-file-parser
// ---------------------------------------------------------------------------
import { buildActivity, prettyFileName } from './activity';
import type { Activity, RawRecord, RawSession } from './activity';

let polyfilled = false;

/** fit-file-parser is a CJS lib that expects a few Node-ish globals. */
function ensurePolyfills() {
  if (polyfilled || typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  w.global = w.global ?? window;
  if (!w.process) {
    w.process = { env: {}, browser: true, version: '', versions: {}, nextTick: (fn: () => void) => setTimeout(fn, 0) };
  }
  polyfilled = true;
}

async function loadParser(): Promise<any> {
  ensurePolyfills();
  const [mod, buf] = await Promise.all([import('fit-file-parser'), import('buffer')]);
  const w = window as unknown as Record<string, unknown>;
  if (!w.Buffer) w.Buffer = buf.Buffer;
  const FitParser = (mod as any).default ?? mod;
  return FitParser;
}

function toDegrees(v: number): number {
  // Garmin stores position in semicircles: deg = semi * (180 / 2^31)
  return Math.abs(v) > 180 ? (v * 180) / 2147483648 : v;
}

function coerceDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function deviceLabel(data: any): string | null {
  const fi = Array.isArray(data?.file_ids) ? data.file_ids[0] : data?.file_id;
  if (!fi) return null;
  const man = typeof fi.manufacturer === 'string' ? fi.manufacturer : null;
  const prod =
    typeof fi.product_name === 'string'
      ? fi.product_name
      : typeof fi.product === 'string'
        ? fi.product
        : null;
  const cap = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (man && prod) return `${cap(man)} ${cap(prod)}`;
  if (man) return cap(man);
  return null;
}

export interface ParsedFit {
  activity: Activity;
  recordCount: number;
  messageTypes: string[];
}

export async function parseFitBuffer(
  buf: ArrayBuffer,
  fileName: string,
  fileSize: number | null,
): Promise<Activity> {
  const FitParser = await loadParser();

  const data: any = await new Promise((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: 'm/s',
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'both',
    });
    parser.parse(buf, (err: unknown, result: unknown) => {
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve(result);
    });
  });

  const rawRecords: any[] = Array.isArray(data?.records) ? data.records : [];
  if (!rawRecords.length) {
    throw new Error('No record messages found — this may be a course or workout file rather than a recorded activity.');
  }

  const records: RawRecord[] = [];
  for (const r of rawRecords) {
    const ts = coerceDate(r?.timestamp);
    const latRaw = r?.position_lat;
    const lngRaw = r?.position_long;
    if (latRaw == null || lngRaw == null) continue;
    const lat = toDegrees(Number(latRaw));
    const lng = toDegrees(Number(lngRaw));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    records.push({
      timestamp: ts ?? new Date(0),
      lat,
      lng,
      altitude: typeof r.altitude === 'number' ? r.altitude : null,
      speed: typeof r.speed === 'number' ? r.speed : null,
      distance: typeof r.distance === 'number' ? r.distance : null,
      heart_rate: typeof r.heart_rate === 'number' ? r.heart_rate : null,
      power: typeof r.power === 'number' ? r.power : null,
      cadence: typeof r.cadence === 'number' ? r.cadence : null,
      temperature: typeof r.temperature === 'number' ? r.temperature : null,
      grade: typeof r.grade === 'number' ? r.grade : null,
      left_right_balance: r.left_right_balance ?? null,
    });
  }

  const session: RawSession | null = Array.isArray(data?.sessions) && data.sessions.length
    ? (data.sessions[0] as RawSession)
    : null;

  // Per-lap summaries (drop the nested `records`/`lengths` blobs the parser attaches)
  const laps: RawSession[] = Array.isArray(data?.laps)
    ? (data.laps as any[]).map((lp) => ({
        start_time: lp?.start_time,
        total_distance: lp?.total_distance,
        total_elapsed_time: lp?.total_elapsed_time,
        total_timer_time: lp?.total_timer_time,
        total_ascent: lp?.total_ascent,
        total_descent: lp?.total_descent,
        avg_speed: lp?.avg_speed,
        max_speed: lp?.max_speed,
        avg_heart_rate: lp?.avg_heart_rate,
        max_heart_rate: lp?.max_heart_rate,
        avg_power: lp?.avg_power,
        max_power: lp?.max_power,
        avg_cadence: lp?.avg_cadence,
      }))
    : [];

  const name = prettyFileName(fileName) || 'Untitled activity';

  return buildActivity(records, {
    name,
    device: deviceLabel(data),
    fileName,
    fileSize,
    session,
    laps,
    sensors: extractSensors(data),
  });
}

/** Summarize paired sensors (power meter, HR strap, CORE temp, etc.) + battery. */
function extractSensors(data: any): import('./activity').SensorInfo[] {
  const infos: any[] = Array.isArray(data?.device_infos) ? data.device_infos : [];
  if (!infos.length) return [];
  const cap = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const byIndex = new Map<number, import('./activity').SensorInfo>();
  for (const d of infos) {
    const idx = typeof d.device_index === 'number' ? d.device_index : byIndex.size;
    const existing = byIndex.get(idx);
    const man = typeof d.manufacturer === 'string' ? d.manufacturer : existing?.manufacturer ?? null;
    const prod =
      typeof d.product_name === 'string'
        ? d.product_name
        : (existing?.product ?? null);
    const type = typeof d.device_type === 'string' ? d.device_type : (existing?.type ?? null);
    byIndex.set(idx, {
      deviceIndex: idx,
      manufacturer: man,
      product: prod,
      // Skip generic placeholders like "barometer"/"accelerometer"? Keep them — useful.
      type: type ? cap(type) : null,
      battery: typeof d.battery_status === 'string' ? d.battery_status : (existing?.battery ?? null),
      chargePercent: typeof d.charge === 'number' ? d.charge : (existing?.chargePercent ?? null),
      voltage: typeof d.battery_voltage === 'number' ? d.battery_voltage : (existing?.voltage ?? null),
    });
  }
  // Filter out the head-unit's own internal sensors (no manufacturer, index 0) noise lightly
  return [...byIndex.values()].filter(
    (s) => s.manufacturer || s.product || s.type,
  );
}

/** Load a bundled sample file through the exact same code path as uploads. */
export async function loadSample(url: string, label: string): Promise<Activity> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load sample file (${res.status})`);
  const buf = await res.arrayBuffer();
  const fileName = url.split('/').pop() ?? 'sample.fit';
  const activity = await parseFitBuffer(buf, fileName, buf.byteLength);
  activity.name = label;
  return activity;
}
