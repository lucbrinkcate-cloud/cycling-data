import { useMemo, useState } from 'react';
import {
  Activity as ActivityIcon,
  Calendar,
  ChartLine,
  FileDigit,
  Gauge,
  HardDrive,
  Map as MapIcon,
  RotateCcw,
  Settings as SettingsIcon,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Activity } from '../lib/activity';
import { SPEED_GRADIENT_CSS, fmtBytes, fmtDate, fmtKm, fmtTime, sportLabel } from '../lib/activity';
import { computeZones, estimateThresholdSpeed, ZONES } from '../lib/zones';
import { resolveFtp } from '../lib/settings';
import { useAthleteSettings } from '../hooks/useAthleteSettings';
import { Chip, Logo, Panel, PanelHeader } from './ui';
import RouteMap from './RouteMap';
import ElevationChart from './ElevationChart';
import TelemetryChart from './TelemetryChart';
import StatsGrid from './StatsGrid';
import Studio from './Studio';
import ZonePanel from './ZonePanel';
import SettingsModal from './SettingsModal';

interface Props {
  activity: Activity;
  onReset: () => void;
}

type ColorMode = 'zone' | 'speed';

export default function Dashboard({ activity, onReset }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [settings, updateSettings] = useAthleteSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>('zone');

  const s = activity.stats;

  // Resolve which FTP to zone with (rider profile → file's stored FTP → default).
  const { ftp, source: ftpSource } = useMemo(
    () => resolveFtp(settings, s.thresholdPower),
    [settings, s.thresholdPower],
  );

  // The 7-zone model: power zones when a meter is present, else speed fallback.
  const zones = useMemo(
    () => computeZones(activity, ftp, estimateThresholdSpeed(activity)),
    [activity, ftp],
  );

  const pointColors = colorMode === 'zone' ? zones.colors : null;

  return (
    <div className="min-h-screen bg-ink-950">
      {/* ============================== header ============================== */}
      <header className="sticky top-0 z-50 border-b border-line/80 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={30} />
            <div className="hidden leading-none sm:block">
              <div className="font-display text-[13.5px] font-bold tracking-[0.18em] text-zinc-100">ROUTE REEL</div>
              <div className="mt-1 font-mono text-[8.5px] tracking-[0.3em] text-mist-500">FIT → VIDEO STUDIO</div>
            </div>
          </div>

          <div className="hidden min-w-0 items-center gap-2 md:flex">
            <span className="flex max-w-[300px] items-center gap-2 truncate rounded-lg border border-line bg-ink-900 px-3 py-1.5">
              <FileDigit className="h-3.5 w-3.5 shrink-0 text-volt-400" />
              <span className="truncate font-mono text-[11.5px] text-zinc-200">{activity.fileName ?? 'synthetic-ride.fit'}</span>
              {activity.fileSize != null && <span className="shrink-0 font-mono text-[10px] text-mist-500">{fmtBytes(activity.fileSize)}</span>}
            </span>
            <Chip tone="volt">{sportLabel(activity.sport)}</Chip>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-ink-900 px-3 py-2 font-mono text-[10.5px] tracking-[0.08em] text-mist-300 uppercase transition-colors hover:border-volt-400/50 hover:text-volt-300"
              title="Athlete profile & FTP"
            >
              <Zap className="h-3.5 w-3.5 text-volt-400" />
              <span className="hidden sm:inline">{settings.ftp != null ? `FTP ${settings.ftp} W` : s.thresholdPower != null ? `FTP ${s.thresholdPower} W*` : 'Set FTP'}</span>
            </button>
            <span className="hidden items-center gap-1.5 font-mono text-[10.5px] text-mist-500 lg:flex">
              <Calendar className="h-3.5 w-3.5" />
              {fmtDate(activity.date)} · {fmtTime(activity.date)}
            </span>
            <button
              onClick={onReset}
              className="flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 font-mono text-[10.5px] tracking-[0.12em] text-mist-300 uppercase transition-colors hover:border-volt-400/50 hover:text-volt-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New file
            </button>
          </div>
        </div>
      </header>

      {/* ============================== content ============================== */}
      <main className="mx-auto max-w-[1440px] px-4 py-5 lg:px-7 lg:py-7">
        {/* title strip */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] text-volt-400 uppercase">
              <ActivityIcon className="h-3.5 w-3.5" />
              Parsed successfully · {activity.points.length.toLocaleString()} GPS records
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-zinc-50 md:text-[34px]">
              {activity.name}
            </h1>
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px] text-mist-400">
            {activity.device && (
              <span className="hidden items-center gap-1.5 sm:flex">
                <HardDrive className="h-3.5 w-3.5 text-mist-500" />
                {activity.device}
              </span>
            )}
            <span className="text-zinc-200">{fmtKm(s.distance)} km</span>
            <span className="text-volt-300">+{Math.round(s.elevGain).toLocaleString()} m</span>
          </div>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* ---------------------------- left column ---------------------------- */}
          <div className="flex min-w-0 flex-col gap-5">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.05 }}>
              <Panel>
                <PanelHeader
                  title={colorMode === 'zone' ? 'ROUTE MAP · COLORED BY FTP ZONES' : 'ROUTE MAP · COLORED BY SPEED'}
                  icon={<MapIcon className="h-3.5 w-3.5" />}
                  right={
                    <div className="flex items-center gap-3">
                      {/* color-mode toggle */}
                      <div className="flex items-center gap-0.5 rounded-lg border border-line bg-ink-950/60 p-0.5">
                        <button
                          onClick={() => setColorMode('zone')}
                          className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[9px] tracking-[0.1em] uppercase transition-colors ${
                            colorMode === 'zone' ? 'bg-volt-400 font-semibold text-ink-950' : 'text-mist-400 hover:text-zinc-200'
                          }`}
                        >
                          <Target className="h-3 w-3" /> Zones
                        </button>
                        <button
                          onClick={() => setColorMode('speed')}
                          className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[9px] tracking-[0.1em] uppercase transition-colors ${
                            colorMode === 'speed' ? 'bg-volt-400 font-semibold text-ink-950' : 'text-mist-400 hover:text-zinc-200'
                          }`}
                        >
                          <Gauge className="h-3 w-3" /> Speed
                        </button>
                      </div>
                      {/* legend */}
                      {colorMode === 'zone' ? (
                        <div className="hidden items-center gap-1.5 sm:flex" title="Zone 1 (easy) → Zone 7 (max)">
                          <span className="font-mono text-[8.5px] tracking-[0.1em] text-mist-500 uppercase">Z1</span>
                          <span className="flex overflow-hidden rounded-full">
                            {ZONES.map((z) => (
                              <span key={z.idx} className="h-1.5 w-3.5" style={{ background: z.color }} title={`${z.short} ${z.name}`} />
                            ))}
                          </span>
                          <span className="font-mono text-[8.5px] tracking-[0.1em] text-mist-500 uppercase">Z7</span>
                        </div>
                      ) : (
                        <div className="hidden items-center gap-2 sm:flex">
                          <span className="font-mono text-[9px] tracking-[0.14em] text-mist-500 uppercase">Slow</span>
                          <span className="h-1.5 w-24 rounded-full" style={{ background: SPEED_GRADIENT_CSS }} />
                          <span className="font-mono text-[9px] tracking-[0.14em] text-mist-500 uppercase">Fast</span>
                        </div>
                      )}
                    </div>
                  }
                />
                <div className="relative h-[400px] md:h-[470px] xl:h-[560px]">
                  <RouteMap activity={activity} hoverIdx={hoverIdx} pointColors={pointColors} />
                </div>
              </Panel>
            </motion.div>

            {/* ------------------- FTP / speed zones breakdown ------------------- */}
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.09 }}>
              <Panel>
                <PanelHeader
                  title={zones.metric === 'power' ? 'TRAINING ZONES · POWER (1–7)' : 'TRAINING ZONES · SPEED (1–7)'}
                  icon={<Target className="h-3.5 w-3.5" />}
                  right={
                    <button
                      onClick={() => setSettingsOpen(true)}
                      className="flex items-center gap-1 font-mono text-[9px] tracking-[0.1em] text-mist-400 uppercase transition-colors hover:text-volt-300"
                    >
                      <SettingsIcon className="h-3 w-3" /> Edit FTP
                    </button>
                  }
                />
                <ZonePanel zones={zones} stats={s} ftpSource={ftpSource} />
              </Panel>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.12 }}>
              <Panel>
                <PanelHeader
                  title="ELEVATION PROFILE · HOVER TO SCRUB"
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  right={
                    <span className="font-mono text-[9.5px] text-mist-500">
                      {fmtKm(s.distance)} km · ↑{Math.round(s.elevGain).toLocaleString()} m ↓{Math.round(s.elevLoss).toLocaleString()} m
                    </span>
                  }
                />
                <div className="px-4 pb-3 pt-4">
                  <ElevationChart activity={activity} hoverIdx={hoverIdx} onHover={setHoverIdx} zones={zones} />
                </div>
              </Panel>
            </motion.div>

            {/* ----------------------- multi-stream telemetry ----------------------- */}
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.15 }}>
              <Panel>
                <PanelHeader
                  title="TELEMETRY STREAMS · SYNCED SCRUB"
                  icon={<ChartLine className="h-3.5 w-3.5" />}
                  right={
                    <span className="font-mono text-[9.5px] text-mist-500">
                      {zones.metric === 'power' ? `zones guided by FTP ${Math.round(zones.threshold)} W` : 'speed-zoned'}
                    </span>
                  }
                />
                <div className="px-4 pb-4 pt-4">
                  <TelemetryChart activity={activity} hoverIdx={hoverIdx} onHover={setHoverIdx} zones={zones} />
                </div>
              </Panel>
            </motion.div>
          </div>

          {/* ---------------------------- right column ---------------------------- */}
          <div className="flex min-w-0 flex-col gap-5">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.08 }}>
              <Panel>
                <PanelHeader title="TELEMETRY SUMMARY" icon={<ActivityIcon className="h-3.5 w-3.5" />} />
                <StatsGrid activity={activity} />
              </Panel>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.16 }} id="studio">
              <Panel className="border-volt-400/25">
                <PanelHeader
                  title="REEL STUDIO · VIDEO EXPORT"
                  icon={<MapIcon className="h-3.5 w-3.5" />}
                  right={<span className="flex h-1.5 w-1.5 rounded-full bg-volt-400 shadow-[0_0_8px_rgba(181,241,62,0.9)]" />}
                />
                <Studio activity={activity} />
              </Panel>
            </motion.div>
          </div>
        </div>

        <footer className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-line/60 pt-5 pb-2 sm:flex-row">
          <span className="font-mono text-[9.5px] tracking-[0.22em] text-mist-600">ROUTE REEL · EVERYTHING RENDERED LOCALLY</span>
          <span className="font-mono text-[9.5px] text-mist-600">Map data © OpenStreetMap contributors · © CARTO</span>
        </footer>
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
        detectedFtp={s.thresholdPower}
      />
    </div>
  );
}
