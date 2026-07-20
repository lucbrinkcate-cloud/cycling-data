import { Battery, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Cpu, HeartPulse, Thermometer, Zap } from 'lucide-react';
import type { Activity, SensorInfo } from '../lib/activity';

function iconFor(s: SensorInfo) {
  const t = (s.type ?? '').toLowerCase();
  if (t.includes('power')) return <Zap className="h-4 w-4" />;
  if (t.includes('heart') || t.includes('hr')) return <HeartPulse className="h-4 w-4" />;
  if (t.includes('temp') || t.includes('core')) return <Thermometer className="h-4 w-4" />;
  if (t.includes('barometer') || t.includes('acceler') || t.includes('gyro')) return <Cpu className="h-4 w-4" />;
  return <Cpu className="h-4 w-4" />;
}

function BatteryIcon({ pct, status }: { pct: number | null; status: string | null }) {
  const low = status === 'low' || status === 'critical' || (pct != null && pct < 20);
  if (low) return <BatteryWarning className="h-3.5 w-3.5 text-rose-400" />;
  if (pct == null) return <Battery className="h-3.5 w-3.5 text-mist-500" />;
  if (pct >= 70) return <BatteryFull className="h-3.5 w-3.5 text-emerald-400" />;
  if (pct >= 30) return <BatteryMedium className="h-3.5 w-3.5 text-amber-400" />;
  return <BatteryLow className="h-3.5 w-3.5 text-rose-400" />;
}

export default function SensorPanel({ activity }: { activity: Activity }) {
  const sensors = activity.sensors;
  if (!sensors.length) return null;

  return (
    <div className="grid grid-cols-1 gap-2 px-4 py-4">
      {sensors.map((s, i) => (
        <div key={`${s.deviceIndex}-${i}`} className="flex items-center gap-3 rounded-lg border border-line bg-ink-950/50 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-volt-400/10 text-volt-400">
            {iconFor(s)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[11.5px] font-medium text-zinc-100">
              {s.product ?? s.type ?? 'Sensor'}
            </div>
            <div className="truncate font-mono text-[9.5px] tracking-wide text-mist-500 uppercase">
              {[s.manufacturer, s.type].filter(Boolean).join(' · ') || `device ${s.deviceIndex}`}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <BatteryIcon pct={s.chargePercent} status={s.battery} />
            <span className="font-mono text-[10.5px] text-zinc-200 tabular-nums">
              {s.chargePercent != null ? `${Math.round(s.chargePercent)}%` : s.battery ?? '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
