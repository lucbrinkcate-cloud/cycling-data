// ---------------------------------------------------------------------------
// Route Reel — athlete profile / settings (persisted to localStorage)
//
// FTP drives the 7-zone engine. When `ftp` is null we auto-detect it from the
// FIT file's own `threshold_power` (most Garmin/Wahoo/Karoo files store it),
// falling back to a sane default so the zones always render.
// ---------------------------------------------------------------------------

export interface AthleteSettings {
  /** Functional Threshold Power in watts. `null` = auto-detect from each file. */
  ftp: number | null;
  /** Body weight in kg (used later for W/kg). `null` = not set. */
  weight: number | null;
  /** Max heart rate in bpm (used later for HR zones). `null` = not set. */
  maxHr: number | null;
  /** Lactate-threshold heart rate in bpm. `null` = not set. */
  lthr: number | null;
}

export const DEFAULT_SETTINGS: AthleteSettings = {
  ftp: null,
  weight: null,
  maxHr: null,
  lthr: null,
};

/** Default FTP used only when neither the rider nor the file provides one. */
export const FALLBACK_FTP = 200;

const KEY = 'route-reel:athlete-settings:v1';

function asNum(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
}

export function loadSettings(): AthleteSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<AthleteSettings>;
    return {
      ftp: asNum(p.ftp),
      weight: asNum(p.weight),
      maxHr: asNum(p.maxHr),
      lthr: asNum(p.lthr),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AthleteSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/** Resolve the FTP we should actually zone with, and where it came from. */
export function resolveFtp(
  settings: AthleteSettings,
  deviceThresholdPower: number | null,
): { ftp: number; source: 'rider' | 'device' | 'default' } {
  if (settings.ftp != null) return { ftp: settings.ftp, source: 'rider' };
  if (deviceThresholdPower != null && deviceThresholdPower >= 40 && deviceThresholdPower <= 600) {
    return { ftp: deviceThresholdPower, source: 'device' };
  }
  return { ftp: FALLBACK_FTP, source: 'default' };
}
