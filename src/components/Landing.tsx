import { useRef, useState } from 'react';
import { Clapperboard, FileUp, Gauge, Loader2, Map as MapIcon, Mountain, Play, ShieldCheck, Upload, Waypoints, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { Chip, Logo } from './ui';
import SettingsModal from './SettingsModal';
import { useAthleteSettings } from '../hooks/useAthleteSettings';

export type DemoKind = 'ride' | 'run';

interface Props {
  loading: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onDemo: (kind: DemoKind) => void;
}

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } }),
};

export default function Landing({ loading, error, onFile, onDemo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const dragDepth = useRef(0);
  const [settings, updateSettings] = useAthleteSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const accept = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="min-h-screen bg-ink-950">
      {/* ============================== nav ============================== */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-line/70 bg-ink-950/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <div className="leading-none">
              <div className="font-display text-[15px] font-bold tracking-[0.18em] text-zinc-100">ROUTE REEL</div>
              <div className="mt-1 font-mono text-[9px] tracking-[0.3em] text-mist-500">FIT → VIDEO STUDIO</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-line bg-ink-900/70 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.1em] text-mist-300 uppercase transition-colors hover:border-volt-400/50 hover:text-volt-300"
              title="Athlete profile & FTP"
            >
              <Zap className="h-3 w-3 text-volt-400" />
              <span className="hidden sm:inline">{settings.ftp != null ? `FTP ${settings.ftp} W` : 'Set FTP'}</span>
            </button>
            <Chip tone="line"><ShieldCheck className="h-3 w-3 text-volt-400" /> 100% client-side</Chip>
            <a href="#how" className="hidden rounded-md border border-line px-3 py-1.5 font-mono text-[10.5px] tracking-[0.14em] text-mist-300 uppercase transition-colors hover:border-line-strong hover:text-zinc-100 sm:block">
              How it works
            </a>
          </div>
        </div>
      </header>

      {/* ============================== hero ============================== */}
      <section className="relative overflow-hidden pt-16">
        <div className="absolute inset-0">
          <video
            className="h-full w-full object-cover opacity-[0.32]"
            src="/media/hero-web.mp4"
            poster="/media/hero-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink-950/70 via-ink-950/55 to-ink-950" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/80 via-transparent to-ink-950/60" />
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-24 pt-16 md:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0} className="mb-5 flex items-center gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-volt-400 shadow-[0_0_10px_rgba(181,241,62,0.9)]" />
              <span className="font-mono text-[10.5px] tracking-[0.28em] text-volt-300 uppercase">Komoot-style tour videos · zero upload</span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={1}
              className="font-display text-[13vw] font-bold leading-[0.95] tracking-tight text-zinc-50 sm:text-6xl lg:text-[76px]"
            >
              Drop a <span className="text-volt-400 text-glow-volt">.FIT</span>.<br />
              Get a film of<br />
              your ride.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={2}
              className="mt-6 max-w-xl text-[15px] leading-relaxed text-mist-300"
            >
              Upload any recorded activity file — from your Garmin, Wahoo, Karoo or a Zwift/Strava export.
              Inspect the speed-colored route, synced elevation profile and full telemetry, then render a
              smooth animated route-replay video you can share. Everything runs locally in your browser.
            </motion.p>

            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onDemo('ride')}
                className="group flex items-center gap-2.5 rounded-lg bg-volt-400 px-5 py-3 font-display text-[13px] font-bold tracking-wide text-ink-950 uppercase transition-all hover:bg-volt-300 hover:shadow-[0_0_36px_rgba(181,241,62,0.35)]"
              >
                <Play className="h-4 w-4 transition-transform group-hover:scale-110" />
                Try the 34 km demo ride
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-2.5 rounded-lg border border-line-strong bg-ink-900/70 px-5 py-3 font-display text-[13px] font-bold tracking-wide text-zinc-100 uppercase transition-colors hover:border-volt-400/60 hover:text-volt-300"
              >
                <Upload className="h-4 w-4" />
                Upload .FIT
              </button>
            </motion.div>

            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4} className="mt-10 flex flex-wrap gap-1.5">
              {['Garmin', 'Wahoo', 'Hammerhead Karoo', 'Polar', 'Suunto', 'Zwift export', 'Strava export'].map((d) => (
                <Chip key={d} tone="line">{d}</Chip>
              ))}
            </motion.div>
          </div>

          {/* ============================== dropzone ============================== */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}>
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                dragDepth.current += 1;
                setDrag(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDrag(false);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                dragDepth.current = 0;
                setDrag(false);
                accept(e.dataTransfer.files);
              }}
              onClick={() => !loading && inputRef.current?.click()}
              className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all md:p-10 ${
                drag
                  ? 'border-volt-400 bg-volt-400/[0.07] shadow-[0_0_60px_rgba(181,241,62,0.15)]'
                  : 'border-line-strong bg-ink-900/60 hover:border-volt-400/50 hover:bg-ink-900/90'
              } backdrop-blur-sm`}
            >
              {/* animated corner grid */}
              <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)', backgroundSize: '36px 36px' }} />

              {loading ? (
                <div className="relative flex flex-col items-center gap-4 py-6">
                  <Loader2 className="h-9 w-9 animate-spin text-volt-400" />
                  <div className="font-mono text-xs tracking-[0.24em] text-zinc-200 uppercase">Decoding FIT telemetry…</div>
                  <div className="flex items-end gap-1" aria-hidden>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="eq-bar block w-1 rounded-sm bg-volt-400/70" style={{ height: 22, animationDelay: `${i * 0.12}s` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-ink-950 transition-all group-hover:border-volt-400/50 group-hover:shadow-[0_0_30px_rgba(181,241,62,0.2)]">
                    <FileUp className={`h-7 w-7 transition-colors ${drag ? 'text-volt-300' : 'text-volt-400'}`} />
                  </div>
                  <div className="font-display text-lg font-bold text-zinc-100">
                    {drag ? 'Release to parse' : 'Drag & drop your .FIT file'}
                  </div>
                  <div className="mt-2 font-mono text-[10.5px] tracking-[0.2em] text-mist-500 uppercase">
                    or click to browse · fits / fit · stays on your device
                  </div>

                  <div className="mt-7 grid grid-cols-2 gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDemo('ride');
                      }}
                      className="rounded-lg border border-line bg-ink-950/80 px-3 py-2.5 text-left transition-colors hover:border-volt-400/50"
                    >
                      <div className="font-mono text-[9px] tracking-[0.2em] text-volt-400 uppercase">Sample · FIT</div>
                      <div className="mt-1 text-[12.5px] font-semibold text-zinc-200">Hampshire loop ride</div>
                      <div className="mt-0.5 font-mono text-[10px] text-mist-500">34.1 km · 4,314 pts · HR + PWR</div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDemo('run');
                      }}
                      className="rounded-lg border border-line bg-ink-950/80 px-3 py-2.5 text-left transition-colors hover:border-volt-400/50"
                    >
                      <div className="font-mono text-[9px] tracking-[0.2em] text-volt-400 uppercase">Sample · FIT</div>
                      <div className="mt-1 text-[12.5px] font-semibold text-zinc-200">Inverness parkrun</div>
                      <div className="mt-0.5 font-mono text-[10px] text-mist-500">4.8 km · 590 pts · HR</div>
                    </button>
                  </div>

                  {error && (
                    <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2.5 text-left text-[12px] text-rose-200">
                      {error}
                    </div>
                  )}
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".fit,.fits,application/octet-stream"
                className="hidden"
                onChange={(e) => {
                  accept(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ============================== steps ============================== */}
      <section id="how" className="relative border-t border-line/60">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden px-5 py-16 sm:grid-cols-3 md:gap-4">
          {[
            {
              n: '01',
              icon: <Upload className="h-5 w-5" />,
              title: 'Upload .FIT',
              body: 'The binary FIT protocol is decoded right in this tab. Courses, workouts and recorded activities from any head unit or export tool work.',
            },
            {
              n: '02',
              icon: <Gauge className="h-5 w-5" />,
              title: 'Inspect telemetry',
              body: 'A speed-colored route on dark CARTO maps, a hover-synced elevation profile, and every stat your device recorded — HR, power, grades.',
            },
            {
              n: '03',
              icon: <Clapperboard className="h-5 w-5" />,
              title: 'Export the reel',
              body: 'A cinematic canvas replay is captured to a real video file — 16:9, 9:16 or 1:1, three themes, tickers, elevation scrub and finish card.',
            },
          ].map((s) => (
            <div key={s.n} className="group relative rounded-2xl border border-line bg-ink-900/50 p-6 transition-colors hover:border-line-strong hover:bg-ink-900">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-ink-950 text-volt-400 transition-all group-hover:border-volt-400/40 group-hover:shadow-[0_0_20px_rgba(181,241,62,0.15)]">{s.icon}</span>
                <span className="font-mono text-[11px] font-semibold tracking-[0.3em] text-mist-600">{s.n}</span>
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-zinc-100">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-mist-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================== assurance strip ============================== */}
      <section className="border-t border-line/60 bg-ink-900/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-5 py-8">
          {[
            { icon: <ShieldCheck className="h-4 w-4" />, t: 'Files never leave your device' },
            { icon: <Waypoints className="h-4 w-4" />, t: 'Native FIT binary decoding' },
            { icon: <MapIcon className="h-4 w-4" />, t: 'Speed-graded route map' },
            { icon: <Mountain className="h-4 w-4" />, t: 'Synced elevation profile' },
            { icon: <Clapperboard className="h-4 w-4" />, t: 'WebM / MP4, 30 fps export' },
          ].map((f) => (
            <div key={f.t} className="flex items-center gap-2.5 font-mono text-[10.5px] tracking-[0.16em] text-mist-400 uppercase">
              <span className="text-volt-400">{f.icon}</span>
              {f.t}
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <Logo size={22} />
            <span className="font-mono text-[10px] tracking-[0.24em] text-mist-500">ROUTE REEL · CLIENT-SIDE FIT STUDIO</span>
          </div>
          <div className="font-mono text-[10px] tracking-[0.14em] text-mist-600">Map data © OpenStreetMap · © CARTO · No account · No upload</div>
        </div>
      </footer>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
      />
    </div>
  );
}
