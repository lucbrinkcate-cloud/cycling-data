import {
  Cog,
  Flame,
  Gauge,
  Heart,
  HeartPulse,
  Mountain,
  Route,
  Thermometer,
  Timer,
  TrendingDown,
  TrendingUp,
  Waypoints,
  Zap,
} from 'lucide-react';
import type { Activity } from '../lib/activity';
import { fmtDur, fmtInt, fmtKm, fmtKmh } from '../lib/activity';
import type { ReactNode } from 'react';

interface Card {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}

export default function StatsGrid({ activity }: { activity: Activity }) {
  const s = activity.stats;
  const iconCls = 'h-3.5 w-3.5';

  const cards: Card[] = [
    { icon: <Route className={iconCls} />, label: 'Distance', value: fmtKm(s.distance), unit: 'km', accent: true },
    { icon: <Timer className={iconCls} />, label: 'Moving time', value: fmtDur(s.movingTime), unit: '' },
    { icon: <TrendingUp className={iconCls} />, label: 'Elev gain', value: `+${fmtInt(s.elevGain)}`, unit: 'm' },
    { icon: <TrendingDown className={iconCls} />, label: 'Elev loss', value: `-${fmtInt(s.elevLoss)}`, unit: 'm' },
    { icon: <Gauge className={iconCls} />, label: 'Avg speed', value: fmtKmh(s.avgSpeed), unit: 'km/h' },
    { icon: <Zap className={iconCls} />, label: 'Max speed', value: fmtKmh(s.maxSpeed), unit: 'km/h' },
  ];

  // Power block (only when a meter recorded data)
  if (s.avgPower != null) cards.push({ icon: <Zap className={iconCls} />, label: 'Avg power', value: `${fmtInt(s.avgPower)}`, unit: 'W' });
  if (s.maxPower != null) cards.push({ icon: <Zap className={iconCls} />, label: 'Max power', value: `${fmtInt(s.maxPower)}`, unit: 'W' });
  if (s.deviceNp != null) cards.push({ icon: <Zap className={iconCls} />, label: 'Norm. power', value: `${fmtInt(s.deviceNp)}`, unit: 'W', accent: true });
  if (s.deviceIf != null) cards.push({ icon: <Gauge className={iconCls} />, label: 'Intensity', value: s.deviceIf.toFixed(2), unit: 'IF' });
  if (s.deviceTss != null) cards.push({ icon: <Flame className={iconCls} />, label: 'TSS', value: fmtInt(s.deviceTss), unit: '' });

  // Heart rate
  if (s.avgHr != null) cards.push({ icon: <HeartPulse className={iconCls} />, label: 'Avg heart', value: `${fmtInt(s.avgHr)}`, unit: 'bpm' });
  if (s.maxHr != null) cards.push({ icon: <Heart className={iconCls} />, label: 'Max heart', value: `${fmtInt(s.maxHr)}`, unit: 'bpm' });

  // Cadence & temperature (when the sensors were present)
  if (s.avgCadence != null) cards.push({ icon: <Cog className={iconCls} />, label: 'Avg cadence', value: `${fmtInt(s.avgCadence)}`, unit: 'rpm' });
  if (s.maxCadence != null) cards.push({ icon: <Cog className={iconCls} />, label: 'Max cadence', value: `${fmtInt(s.maxCadence)}`, unit: 'rpm' });
  if (s.avgTemp != null) cards.push({ icon: <Thermometer className={iconCls} />, label: 'Avg temp', value: `${Math.round(s.avgTemp)}`, unit: '°C' });

  // Energy & terrain
  if (s.calories != null) cards.push({ icon: <Flame className={iconCls} />, label: 'Energy', value: fmtInt(s.calories), unit: 'kcal' });
  cards.push({ icon: <Mountain className={iconCls} />, label: 'Max altitude', value: fmtInt(s.maxAlt), unit: 'm' });
  cards.push({ icon: <Waypoints className={iconCls} />, label: 'GPS points', value: fmtInt(s.points), unit: '' });

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="group bg-ink-900 px-3.5 py-3.5 transition-colors hover:bg-ink-850">
          <div className="flex items-center gap-1.5 text-mist-500">
            <span className="text-mist-500 transition-colors group-hover:text-volt-400">{c.icon}</span>
            <span className="font-mono text-[9.5px] font-medium tracking-[0.18em] uppercase">{c.label}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={`font-mono text-xl font-semibold tracking-tight md:text-[22px] ${c.accent ? 'text-volt-300' : 'text-zinc-100'}`}>
              {c.value}
            </span>
            {c.unit && <span className="font-mono text-[10.5px] text-mist-500">{c.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
