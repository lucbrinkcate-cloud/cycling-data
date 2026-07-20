import { useId, useMemo, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { Activity, TrackPoint } from '../lib/activity';
import { fmtKmh } from '../lib/activity';
import type { ZoneResult } from '../lib/zones';
import { ZONES } from '../lib/zones';

// ---------------------------------------------------------------------------
// Multi-stream telemetry chart. Each sensor (power, speed, HR, cadence, temp)
// gets its own lane on a shared distance axis, scrub-synced with the map and
// the elevation profile through the same hoverIdx. When zoning by power, the
// FTP zone boundaries are drawn as guides on the power lane.
// ---------------------------------------------------------------------------

const VB_W = 1000; // viewBox width (matches ElevationChart → identical hover mapping)
const LANE_VB = 100; // viewBox height per lane
const PAD_T = 10;
const PAD_B = 16;
const LANE_PX = 62; // rendered pixel height per lane

interface LaneDef {
  key: string;
  label: string;
  unit: string;
  color: string;
  get: (p: TrackPoint) => number | null;
  fmt: (v: number) => string;
  zeroBased: boolean; // pin the lane minimum to 0 (power/speed/cadence)
}

const LANE_DEFS: LaneDef[] = [
  { key: 'power', label: 'Power', unit: 'W', color: '#b5f13e', get: (p) => p.power, fmt: (v) => `${Math.round(v)}`, zeroBased: true },
  { key: 'speed', label: 'Speed', unit: 'km/h', color: '#38bdf8', get: (p) => p.speed, fmt: (v) => fmtKmh(v, 1), zeroBased: true },
  { key: 'hr', label: 'Heart rate', unit: 'bpm', color: '#f87171', get: (p) => p.hr, fmt: (v) => `${Math.round(v)}`, zeroBased: false },
  { key: 'cadence', label: 'Cadence', unit: 'rpm', color: '#4ade80', get: (p) => p.cadence, fmt: (v) => `${Math.round(v)}`, zeroBased: true },
  { key: 'temp', label: 'Temp', unit: '°C', color: '#fb923c', get: (p) => p.temp, fmt: (v) => `${Math.round(v)}`, zeroBased: false },
];

interface Props {
  activity: Activity;
  hoverIdx: number | null;
  onHover: (idx: number | null) => void;
  zones: ZoneResult;
}

interface LaneModel {
  def: LaneDef;
  path: string;
  min: number;
  max: number;
  sampled: Array<{ x: number; y: number; v: number } | null>; // per sampled index
}

export default function TelemetryChart({ activity, hoverIdx, onHover, zones }: Props) {
  const gid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);

  const model = useMemo(() => {
    const pts = activity.points;
    const n = pts.length;
    const step = Math.max(1, Math.floor(n / 900));
    const idxs: number[] = [];
    for (let i = 0; i < n; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);

    const distance = activity.stats.distance;
    const xs = idxs.map((i) => (pts[i].dist / Math.max(1, distance)) * VB_W);

    // Which lanes have enough data to show
    let cPower = 0;
    let cHr = 0;
    let cCad = 0;
    let cTemp = 0;
    for (const p of pts) {
      if (p.power != null && p.power > 0) cPower++;
      if (p.hr != null) cHr++;
      if (p.cadence != null) cCad++;
      if (p.temp != null) cTemp++;
    }
    const available: Record<string, boolean> = {
      power: cPower > n * 0.2,
      speed: true,
      hr: cHr > n * 0.2,
      cadence: cCad > n * 0.2,
      temp: cTemp > n * 0.2,
    };
    const defs = LANE_DEFS.filter((d) => available[d.key]);

    const lanes: LaneModel[] = defs.map((def, li) => {
      // min/max over sampled non-null values
      let dMin = Infinity;
      let dMax = -Infinity;
      for (const i of idxs) {
        const v = def.get(pts[i]);
        if (v == null || !isFinite(v)) continue;
        if (v < dMin) dMin = v;
        if (v > dMax) dMax = v;
      }
      if (!isFinite(dMin)) {
        dMin = 0;
        dMax = 1;
      }
      let min = def.zeroBased ? 0 : dMin;
      let max = dMax;
      if (!def.zeroBased) {
        const pad = Math.max(1, (max - min) * 0.08);
        min -= pad;
        max += pad;
      } else {
        max = Math.max(max * 1.05, 1);
      }

      const top = li * LANE_VB + PAD_T;
      const bottom = (li + 1) * LANE_VB - PAD_B;
      const span = Math.max(1e-6, max - min);
      const yOf = (v: number) => bottom - ((v - min) / span) * (bottom - top);

      let path = '';
      let pen = false;
      const sampled: LaneModel['sampled'] = [];
      for (let k = 0; k < idxs.length; k++) {
        const v = def.get(pts[idxs[k]]);
        if (v == null || !isFinite(v)) {
          sampled.push(null);
          pen = false;
          continue;
        }
        const x = xs[k];
        const y = yOf(v);
        sampled.push({ x, y, v });
        path += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
        pen = true;
      }
      return { def, path, min, max, sampled };
    });

    // Power-lane zone guides (FTP %) when zoning by power
    const powerLaneIdx = lanes.findIndex((l) => l.def.key === 'power');
    let zoneGuides: Array<{ y: number; pct: number; color: string }> = [];
    if (powerLaneIdx >= 0 && zones.metric === 'power') {
      const lane = lanes[powerLaneIdx];
      const top = powerLaneIdx * LANE_VB + PAD_T;
      const bottom = (powerLaneIdx + 1) * LANE_VB - PAD_B;
      const span = Math.max(1e-6, lane.max - lane.min);
      for (const z of ZONES) {
        if (z.minPct <= 0) continue;
        const w = (zones.threshold * z.minPct) / 100;
        if (w < lane.min || w > lane.max) continue;
        zoneGuides.push({ y: bottom - ((w - lane.min) / span) * (bottom - top), pct: z.minPct, color: z.color });
      }
    }

    const vbH = lanes.length * LANE_VB;
    return { lanes, idxs, xs, zoneGuides, powerLaneIdx, vbH };
  }, [activity, zones]);

  if (!model.lanes.length) return null;

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const x = frac * VB_W;
    let lo = 0;
    let hi = model.xs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (model.xs[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    const prev = Math.max(0, lo - 1);
    const best = Math.abs(model.xs[lo] - x) < Math.abs(model.xs[prev] - x) ? lo : prev;
    onHover(model.idxs[best]);
  };

  // Resolve hover → sampled index for crosshair/dots
  let hoverK: number | null = null;
  if (hoverIdx != null) {
    let lo = 0;
    let hi = model.idxs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (model.idxs[mid] < hoverIdx) lo = mid + 1;
      else hi = mid;
    }
    hoverK = Math.min(model.idxs.length - 1, lo);
  }
  const crossX = hoverK != null ? model.xs[hoverK] : null;
  const hoverPt = hoverIdx != null ? activity.points[hoverIdx] : null;

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="relative cursor-crosshair touch-none select-none overflow-hidden rounded-lg"
        style={{ height: model.lanes.length * LANE_PX }}
        onPointerMove={handleMove}
        onPointerDown={handleMove}
        onPointerLeave={() => onHover(null)}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${model.vbH}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          <defs>
            {model.lanes.map((l, i) => (
              <linearGradient key={i} id={`${gid}-${l.def.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={l.def.color} stopOpacity="0.10" />
                <stop offset="1" stopColor={l.def.color} stopOpacity="0.01" />
              </linearGradient>
            ))}
          </defs>

          {/* lane separators + faint backgrounds */}
          {model.lanes.map((l, i) => (
            <g key={i}>
              <rect x="0" y={i * LANE_VB} width={VB_W} height={LANE_VB} fill={i % 2 ? 'rgba(148,163,184,0.025)' : 'rgba(148,163,184,0.045)'} />
              {i > 0 && (
                <line x1="0" x2={VB_W} y1={i * LANE_VB} y2={i * LANE_VB} stroke="#1d2836" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              )}
            </g>
          ))}

          {/* power-lane FTP zone guides */}
          {model.zoneGuides.map((g, i) => (
            <line
              key={i}
              x1="0"
              x2={VB_W}
              y1={g.y}
              y2={g.y}
              stroke={g.color}
              strokeOpacity={g.pct === 100 ? 0.55 : 0.22}
              strokeWidth={g.pct === 100 ? 1.4 : 1}
              strokeDasharray={g.pct === 100 ? '0' : '4 5'}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* traces */}
          {model.lanes.map((l, i) => (
            <path
              key={i}
              d={l.path}
              fill="none"
              stroke={l.def.color}
              strokeWidth="1.6"
              strokeOpacity="0.92"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* lane labels + ranges (HTML to avoid viewBox text distortion) */}
        {model.lanes.map((l, i) => (
          <div
            key={l.def.key}
            className="pointer-events-none absolute left-2 flex items-center gap-1.5"
            style={{ top: i * LANE_PX + 5 }}
          >
            <span className="h-2 w-2 rounded-[3px]" style={{ background: l.def.color }} />
            <span className="font-mono text-[9px] font-semibold tracking-[0.12em] text-zinc-300 uppercase">{l.def.label}</span>
            <span className="font-mono text-[8.5px] text-mist-600 tabular-nums">
              {l.def.key === 'speed' ? fmtKmh(l.min, 0) : Math.round(l.min)}–{l.def.key === 'speed' ? fmtKmh(l.max, 0) : Math.round(l.max)} {l.def.unit}
            </span>
          </div>
        ))}

        {/* FTP label on the power lane (aligned to its guide line) */}
        {model.powerLaneIdx >= 0 && zones.metric === 'power' && (() => {
          const pl = model.lanes[model.powerLaneIdx];
          const topVB = model.powerLaneIdx * LANE_VB + PAD_T;
          const botVB = (model.powerLaneIdx + 1) * LANE_VB - PAD_B;
          const span = Math.max(1e-6, pl.max - pl.min);
          const yVB = botVB - ((zones.threshold - pl.min) / span) * (botVB - topVB);
          const topPx = (yVB / model.vbH) * (model.lanes.length * LANE_PX);
          return (
            <div
              className="pointer-events-none absolute right-2 -translate-y-1/2 font-mono text-[8.5px] font-semibold tracking-[0.1em] text-volt-300/90 uppercase"
              style={{ top: topPx }}
            >
              FTP {Math.round(zones.threshold)} W
            </div>
          );
        })()}

        {/* crosshair + per-lane dots */}
        {crossX != null && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-slate-200/40"
              style={{ left: `${(crossX / VB_W) * 100}%` }}
            />
            {model.lanes.map((l) => {
              const s = hoverK != null ? l.sampled[hoverK] : null;
              if (!s) return null;
              return (
                <span
                  key={l.def.key}
                  className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-950"
                  style={{ left: `${(s.x / VB_W) * 100}%`, top: `${(s.y / model.vbH) * 100}%`, background: l.def.color }}
                />
              );
            })}
          </>
        )}
      </div>

      {/* hover readout */}
      {hoverPt && crossX != null && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full"
          style={{ left: `${Math.min(86, Math.max(14, (crossX / VB_W) * 100))}%` }}
        >
          <div className="flex items-center gap-3 whitespace-nowrap rounded-lg border border-line-strong bg-ink-950/95 px-3 py-2 font-mono text-[11px] shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
            {zones && hoverIdx != null && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-ink-950"
                style={{ background: ZONES[zones.idx[hoverIdx]].color }}
                title={ZONES[zones.idx[hoverIdx]].name}
              >
                {ZONES[zones.idx[hoverIdx]].short}
              </span>
            )}
            {model.lanes.map((l) => {
              const v = l.def.get(hoverPt);
              if (v == null) return null;
              return (
                <span key={l.def.key} className="flex items-center gap-1" style={{ color: l.def.color }}>
                  {l.def.fmt(v)}
                  <span className="text-mist-500">{l.def.unit}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
