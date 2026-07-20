import { useId, useMemo, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { Activity } from '../lib/activity';
import { fmtDur, fmtInt, fmtKm, fmtKmh } from '../lib/activity';
import type { ZoneResult } from '../lib/zones';
import { ZONES } from '../lib/zones';

const VB_W = 1000;
const VB_H = 240;
const PAD_T = 18;
const PAD_B = 38;

interface Props {
  activity: Activity;
  hoverIdx: number | null;
  onHover: (idx: number | null) => void;
  zones?: ZoneResult;
}

export default function ElevationChart({ activity, hoverIdx, onHover, zones }: Props) {
  const gid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);

  const model = useMemo(() => {
    const pts = activity.points;
    const step = Math.max(1, Math.floor(pts.length / 760));
    const idxs: number[] = [];
    for (let i = 0; i < pts.length; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== pts.length - 1) idxs.push(pts.length - 1);

    const { minAlt, maxAlt, distance } = activity.stats;
    const span = Math.max(8, maxAlt - minAlt);
    const totalKm = distance / 1000;

    const xs = idxs.map((i) => (pts[i].dist / Math.max(1, distance)) * VB_W);
    const ys = idxs.map((i) => PAD_T + (1 - (pts[i].alt - minAlt) / span) * (VB_H - PAD_T - PAD_B));

    let line = '';
    for (let k = 0; k < idxs.length; k++) line += `${k === 0 ? 'M' : 'L'}${xs[k].toFixed(2)},${ys[k].toFixed(2)}`;
    const area = `${line}L${VB_W},${VB_H - PAD_B}L0,${VB_H - PAD_B}Z`;

    const tickKm = [1, 2, 5, 10, 20, 50, 100].find((t) => totalKm / t <= 8) ?? 100;
    const ticks: Array<{ x: number; label: string }> = [];
    for (let km = tickKm; km < totalKm; km += tickKm) {
      ticks.push({ x: (km / totalKm) * VB_W, label: `${km}` });
    }
    return { idxs, xs, ys, line, area, ticks, minAlt, maxAlt };
  }, [activity]);

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const x = frac * VB_W;
    // nearest sampled index by x
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

  // map hoverIdx → sampled position for crosshair
  let cross: { x: number; y: number; frac: number } | null = null;
  if (hoverIdx != null) {
    let lo = 0;
    let hi = model.idxs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (model.idxs[mid] < hoverIdx) lo = mid + 1;
      else hi = mid;
    }
    const k = Math.min(model.idxs.length - 1, lo);
    cross = { x: model.xs[k], y: model.ys[k], frac: model.xs[k] / VB_W };
  }
  const pt = hoverIdx != null ? activity.points[hoverIdx] : null;

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="relative cursor-crosshair touch-none select-none"
        onPointerMove={handleMove}
        onPointerDown={handleMove}
        onPointerLeave={() => onHover(null)}
      >
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block h-44 w-full md:h-52" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#b5f13e" stopOpacity="0.34" />
              <stop offset="1" stopColor="#b5f13e" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* horizontal guides */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={VB_W}
              y1={PAD_T + f * (VB_H - PAD_T - PAD_B)}
              y2={PAD_T + f * (VB_H - PAD_T - PAD_B)}
              stroke="#1d2836"
              strokeWidth="1"
              strokeDasharray="3 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* km ticks */}
          {model.ticks.map((t) => (
            <g key={t.x}>
              <line x1={t.x} x2={t.x} y1={VB_H - PAD_B} y2={VB_H - PAD_B + 6} stroke="#2b3c50" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <text x={t.x} y={VB_H - 10} textAnchor="middle" fill="#475569" fontSize="13" fontFamily="IBM Plex Mono, monospace">
                {t.label}k
              </text>
            </g>
          ))}

          <path d={model.area} fill={`url(#${gid}-fill)`} />
          <path d={model.line} fill="none" stroke="#b5f13e" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

          {cross && (
            <g>
              <line x1={cross.x} x2={cross.x} y1={PAD_T - 8} y2={VB_H - PAD_B} stroke="#e2e8f0" strokeOpacity="0.35" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              <circle cx={cross.x} cy={cross.y} r="5" fill="#ffffff" stroke="#b5f13e" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </svg>

        {/* hover tooltip */}
        {pt && cross && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full"
            style={{ left: `${Math.min(88, Math.max(12, cross.frac * 100))}%` }}
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
              <span className="text-volt-300">{fmtKm(pt.dist)} km</span>
              <span className="text-mist-300">{fmtInt(pt.alt)} m</span>
              <span className="text-mist-300">{fmtKmh(pt.speed)} km/h</span>
              {pt.power != null && <span className="text-lime-300">{pt.power} W</span>}
              {pt.cadence != null && <span className="text-teal-300">{pt.cadence} rpm</span>}
              <span className={pt.grade >= 0 ? 'text-amber-300' : 'text-sky-300'}>{pt.grade >= 0 ? '+' : ''}{pt.grade.toFixed(1)}%</span>
              {pt.hr != null && <span className="text-rose-300">{pt.hr} bpm</span>}
              <span className="text-mist-500">{fmtDur(pt.t)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between px-1 font-mono text-[10px] tracking-[0.14em] text-mist-500 uppercase">
        <span>Min {fmtInt(model.minAlt)} m</span>
        <span>Max {fmtInt(model.maxAlt)} m</span>
      </div>
    </div>
  );
}
