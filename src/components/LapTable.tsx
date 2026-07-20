import type { Activity } from '../lib/activity';
import { fmtDur, fmtInt, fmtKm, fmtKmh } from '../lib/activity';

export default function LapTable({ activity }: { activity: Activity }) {
  const laps = activity.laps;
  if (laps.length < 2) return null;

  const hasPower = laps.some((l) => l.avgPower != null);
  const hasHr = laps.some((l) => l.avgHr != null);
  const hasCad = laps.some((l) => l.avgCadence != null);

  return (
    <div className="overflow-x-auto px-2 pb-3 pt-1">
      <table className="w-full border-collapse font-mono text-[10.5px] tabular-nums">
        <thead>
          <tr className="text-mist-500">
            <th className="px-2 py-1.5 text-left font-medium tracking-[0.12em] uppercase">Lap</th>
            <th className="px-2 py-1.5 text-right font-medium tracking-[0.12em] uppercase">Dist</th>
            <th className="px-2 py-1.5 text-right font-medium tracking-[0.12em] uppercase">Time</th>
            <th className="px-2 py-1.5 text-right font-medium tracking-[0.12em] uppercase">Avg</th>
            <th className="px-2 py-1.5 text-right font-medium tracking-[0.12em] uppercase">↑m</th>
            {hasPower && <th className="px-2 py-1.5 text-right font-medium tracking-[0.12em] uppercase">W</th>}
            {hasHr && <th className="px-2 py-1.5 text-right font-medium tracking-[0.12em] uppercase">HR</th>}
            {hasCad && <th className="px-2 py-1.5 text-right font-medium tracking-[0.12em] uppercase">RPM</th>}
          </tr>
        </thead>
        <tbody>
          {laps.map((l) => (
            <tr key={l.index} className="border-t border-line/70 text-zinc-200 transition-colors hover:bg-ink-850">
              <td className="px-2 py-1.5 text-left">
                <span className="inline-flex h-4 w-6 items-center justify-center rounded bg-volt-400/10 text-[9px] font-semibold text-volt-300">
                  {l.index}
                </span>
              </td>
              <td className="px-2 py-1.5 text-right">{fmtKm(l.distance, 2)}</td>
              <td className="px-2 py-1.5 text-right">{fmtDur(l.duration)}</td>
              <td className="px-2 py-1.5 text-right text-mist-300">{l.avgSpeed != null ? fmtKmh(l.avgSpeed) : '—'}</td>
              <td className="px-2 py-1.5 text-right text-mist-400">{fmtInt(l.elevGain)}</td>
              {hasPower && <td className="px-2 py-1.5 text-right text-lime-300">{l.avgPower != null ? fmtInt(l.avgPower) : '—'}</td>}
              {hasHr && <td className="px-2 py-1.5 text-right text-rose-300">{l.avgHr != null ? fmtInt(l.avgHr) : '—'}</td>}
              {hasCad && <td className="px-2 py-1.5 text-right text-teal-300">{l.avgCadence != null ? fmtInt(l.avgCadence) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
