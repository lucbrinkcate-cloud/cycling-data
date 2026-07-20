import { Activity as ActivityIcon, Gauge, Zap } from 'lucide-react';
import type { ActivityStats } from '../lib/activity';
import { fmtDur, fmtInt, fmtKmh } from '../lib/activity';
import type { ZoneResult } from '../lib/zones';
import { ZONES } from '../lib/zones';

interface Props {
  zones: ZoneResult;
  stats: ActivityStats;
  ftpSource: 'rider' | 'device' | 'default';
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-950/50 px-3 py-2.5">
      <div className="font-mono text-[9px] tracking-[0.18em] text-mist-500 uppercase">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-lg font-semibold text-zinc-100 tabular-nums">{value}</span>
        {unit && <span className="font-mono text-[10px] text-mist-500">{unit}</span>}
      </div>
    </div>
  );
}

export default function ZonePanel({ zones, stats, ftpSource }: Props) {
  const isPower = zones.metric === 'power';
  const totalTime = zones.timeInZone.reduce((a, b) => a + b, 0) || 1;

  // Prefer the device's own NP/IF/TSS when it recorded them, else our computation.
  const np = stats.deviceNp ?? zones.np;
  const iff = stats.deviceIf ?? zones.intensityFactor;
  const tss = stats.deviceTss ?? zones.tss;
  const showTraining = np != null || iff != null || tss != null;

  const sourceLabel =
    ftpSource === 'rider' ? 'your profile' : ftpSource === 'device' ? 'detected in file' : 'default — set yours';

  return (
    <div className="space-y-4 px-4 py-4">
      {/* ---------------- metric + threshold ---------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] text-mist-500 uppercase">
            {isPower ? <Zap className="h-3 w-3 text-volt-400" /> : <Gauge className="h-3 w-3 text-sky-400" />}
            Zoning metric
          </div>
          <div className="mt-1 font-display text-[15px] font-bold text-zinc-100">
            {isPower ? 'Power zones' : 'Speed zones'}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-mist-400">
            {isPower
              ? 'Coggan 7-zone model · % of FTP'
              : 'No power meter detected · zones from % of threshold speed'}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] tracking-[0.2em] text-mist-500 uppercase">
            {isPower ? 'FTP' : 'Threshold speed'}
          </div>
          <div className="mt-0.5 font-mono text-xl font-semibold text-volt-300 tabular-nums">
            {isPower ? `${fmtInt(zones.threshold)} W` : `${fmtKmh(zones.threshold)} km/h`}
          </div>
          {isPower && (
            <div
              className={`mt-0.5 font-mono text-[9.5px] ${
                ftpSource === 'default' ? 'text-amber-300' : 'text-mist-500'
              }`}
            >
              {sourceLabel}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- NP / IF / TSS ---------------- */}
      {showTraining && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Norm. power" value={np != null ? fmtInt(np) : '—'} unit={np != null ? 'W' : undefined} />
          <Stat label="Intensity" value={iff != null ? iff.toFixed(2) : '—'} unit={iff != null ? 'IF' : undefined} />
          <Stat label="TSS" value={tss != null ? fmtInt(tss) : '—'} />
        </div>
      )}

      {/* avg / max of the zoning metric */}
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label={isPower ? 'Avg power' : 'Avg speed'}
          value={isPower ? fmtInt(zones.avgValue) : fmtKmh(zones.avgValue)}
          unit={isPower ? 'W' : 'km/h'}
        />
        <Stat
          label={isPower ? 'Max power' : 'Max speed'}
          value={isPower ? fmtInt(zones.maxValue) : fmtKmh(zones.maxValue)}
          unit={isPower ? 'W' : 'km/h'}
        />
      </div>

      {/* ---------------- zone distribution ---------------- */}
      <div>
        <div className="mb-2 flex items-center justify-between font-mono text-[9px] tracking-[0.2em] text-mist-500 uppercase">
          <span className="flex items-center gap-1.5">
            <ActivityIcon className="h-3 w-3" /> Time in zone
          </span>
          <span>distance</span>
        </div>
        <div className="space-y-1.5">
          {ZONES.map((z) => {
            const time = zones.timeInZone[z.idx];
            const dist = zones.distInZone[z.idx];
            const pct = (time / totalTime) * 100;
            return (
              <div key={z.idx} className="group flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: z.color }} />
                <span className="w-7 shrink-0 font-mono text-[10px] font-semibold text-zinc-200">{z.short}</span>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-ink-950/60">
                  <div
                    className="absolute inset-y-0 left-0 rounded transition-[width] duration-500"
                    style={{ width: `${Math.max(pct > 0 ? 1.5 : 0, pct)}%`, background: z.color, opacity: 0.85 }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[8.5px] tracking-wide text-white/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                    {z.name}
                  </span>
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-[10px] text-zinc-200 tabular-nums">
                  {fmtDur(time)}
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-[9.5px] text-mist-500 tabular-nums">
                  {pct.toFixed(0)}%
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-[9.5px] text-mist-500 tabular-nums">
                  {(dist / 1000).toFixed(1)} km
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
