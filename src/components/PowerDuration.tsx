import { useMemo } from 'react';
import type { Activity } from '../lib/activity';
import { fmtInt } from '../lib/activity';

// ---------------------------------------------------------------------------
// Best-effort power curve: the best average power held for 5 s → 20 min, with
// the rider's FTP drawn as a reference line. Only shown when a power meter
// recorded the activity.
// ---------------------------------------------------------------------------

const TARGETS: Array<[number, string]> = [
  [5, '5s'],
  [15, '15s'],
  [30, '30s'],
  [60, '1m'],
  [180, '3m'],
  [300, '5m'],
  [600, '10m'],
  [1200, '20m'],
];

const VB_W = 1000;
const VB_H = 220;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 16;
const PAD_B = 30;

interface Props {
  activity: Activity;
  ftp: number | null;
}

export default function PowerDuration({ activity, ftp }: Props) {
  const model = useMemo(() => {
    const pts = activity.points;
    const n = pts.length;
    let withPower = 0;
    for (const p of pts) if (p.power != null && p.power > 0) withPower++;
    if (withPower < n * 0.4 || n < 20) return null;

    const rate = activity.stats.duration / Math.max(1, n - 1); // seconds per sample
    const power = pts.map((p) => (p.power != null ? p.power : 0));

    // rolling sums for O(n) window averages
    const efforts: Array<{ dur: number; label: string; watts: number }> = [];
    for (const [dur, label] of TARGETS) {
      const win = Math.max(1, Math.round(dur / Math.max(0.5, rate)));
      if (win > n) continue;
      let sum = 0;
      for (let i = 0; i < win; i++) sum += power[i];
      let best = sum / win;
      for (let i = win; i < n; i++) {
        sum += power[i] - power[i - win];
        const avg = sum / win;
        if (avg > best) best = avg;
      }
      efforts.push({ dur, label, watts: best });
    }
    if (efforts.length < 2) return null;

    const minDur = efforts[0].dur;
    const maxDur = efforts[efforts.length - 1].dur;
    const logMin = Math.log10(minDur);
    const logMax = Math.log10(maxDur);
    let yMax = Math.max(...efforts.map((e) => e.watts), ftp ?? 0) * 1.08;
    yMax = Math.max(50, yMax);

    const xOf = (dur: number) =>
      PAD_L + ((Math.log10(dur) - logMin) / Math.max(1e-6, logMax - logMin)) * (VB_W - PAD_L - PAD_R);
    const yOf = (w: number) => PAD_T + (1 - w / yMax) * (VB_H - PAD_T - PAD_B);

    let path = '';
    efforts.forEach((e, i) => {
      path += `${i === 0 ? 'M' : 'L'}${xOf(e.dur).toFixed(1)},${yOf(e.watts).toFixed(1)}`;
    });
    let area = path;
    area += `L${xOf(maxDur).toFixed(1)},${(VB_H - PAD_B).toFixed(1)}L${xOf(minDur).toFixed(1)},${(VB_H - PAD_B).toFixed(1)}Z`;

    return { efforts, xOf, yOf, path, area, yMax, ftpY: ftp != null && ftp <= yMax ? yOf(ftp) : null };
  }, [activity, ftp]);

  if (!model) return null;

  const best20 = model.efforts.find((e) => e.dur === 1200) ?? model.efforts[model.efforts.length - 1];
  const best5 = model.efforts.find((e) => e.dur === 5);

  return (
    <div className="px-4 pb-4 pt-3">
      {/* headline best efforts */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {best5 && (
          <div className="rounded-lg border border-line bg-ink-950/50 px-2.5 py-2">
            <div className="font-mono text-[8.5px] tracking-[0.14em] text-mist-500 uppercase">Best 5 s</div>
            <div className="mt-0.5 font-mono text-[15px] font-semibold text-zinc-100 tabular-nums">
              {fmtInt(best5.watts)} <span className="text-[10px] text-mist-500">W</span>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-line bg-ink-950/50 px-2.5 py-2">
          <div className="font-mono text-[8.5px] tracking-[0.14em] text-mist-500 uppercase">Best 20 m</div>
          <div className="mt-0.5 font-mono text-[15px] font-semibold text-volt-300 tabular-nums">
            {fmtInt(best20.watts)} <span className="text-[10px] text-mist-500">W</span>
          </div>
        </div>
        {ftp != null && (
          <div className="rounded-lg border border-line bg-ink-950/50 px-2.5 py-2">
            <div className="font-mono text-[8.5px] tracking-[0.14em] text-mist-500 uppercase">FTP</div>
            <div className="mt-0.5 font-mono text-[15px] font-semibold text-zinc-100 tabular-nums">
              {fmtInt(ftp)} <span className="text-[10px] text-mist-500">W</span>
            </div>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block h-40 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pd-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b5f13e" stopOpacity="0.22" />
            <stop offset="1" stopColor="#b5f13e" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* horizontal power guides */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD_L}
            x2={VB_W - PAD_R}
            y1={PAD_T + f * (VB_H - PAD_T - PAD_B)}
            y2={PAD_T + f * (VB_H - PAD_T - PAD_B)}
            stroke="#1d2836"
            strokeWidth="1"
            strokeDasharray="3 6"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* FTP reference line */}
        {model.ftpY != null && (
          <line
            x1={PAD_L}
            x2={VB_W - PAD_R}
            y1={model.ftpY}
            y2={model.ftpY}
            stroke="#b5f13e"
            strokeOpacity="0.5"
            strokeWidth="1.2"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        <path d={model.area} fill="url(#pd-fill)" />
        <path d={model.path} fill="none" stroke="#b5f13e" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

        {/* effort markers + duration labels */}
        {model.efforts.map((e) => (
          <g key={e.dur}>
            <circle cx={model.xOf(e.dur)} cy={model.yOf(e.watts)} r="3.5" fill="#05080c" stroke="#b5f13e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <text
              x={model.xOf(e.dur)}
              y={VB_H - 10}
              textAnchor="middle"
              fill="#475569"
              fontSize="12"
              fontFamily="IBM Plex Mono, monospace"
            >
              {e.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-1 px-1 text-center font-mono text-[9px] tracking-[0.14em] text-mist-600 uppercase">
        Best average power by effort length · dashed line = FTP
      </div>
    </div>
  );
}
