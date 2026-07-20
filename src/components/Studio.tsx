import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Clapperboard, Download, Film, Loader2, MonitorPlay, Pause, Play, RefreshCw, RotateCcw, Smartphone, Square } from 'lucide-react';
import type { Activity } from '../lib/activity';
import { fmtBytes, fmtDur, slugify } from '../lib/activity';
import type { ReelAspect, ReelOpts, ReelResult, ReelThemeId } from '../lib/reel';
import { REEL_ASPECTS, REEL_DURATIONS, REEL_THEMES, ReelRenderer, canRecordVideo, ensureReelFonts, recordReel, reelDims } from '../lib/reel';
import type { ZoneResult } from '../lib/zones';

interface Props {
  activity: Activity;
  zones: ZoneResult;
  colorMode: 'zone' | 'speed';
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'recording'; pct: number }
  | { kind: 'done'; result: ReelResult }
  | { kind: 'error'; message: string };

export default function Studio({ activity, zones, colorMode }: Props) {
  const [aspect, setAspect] = useState<ReelAspect>('16:9');
  const [duration, setDuration] = useState(25);
  const [themeId, setThemeId] = useState<ReelThemeId>('volt');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const opts: ReelOpts = useMemo(
    () => ({
      aspect,
      themeId,
      durationSec: duration,
      zone:
        colorMode === 'zone'
          ? { colors: zones.colors, idx: zones.idx, metric: zones.metric, threshold: zones.threshold }
          : null,
    }),
    [aspect, themeId, duration, colorMode, zones],
  );
  const optsKey = `${aspect}|${themeId}|${duration}|${activity.id}|${colorMode}`;

  // ---------------------------------------------------------------- preview
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [tSec, setTSec] = useState(0);
  const tRef = useRef(0);
  const playingRef = useRef(true);
  playingRef.current = playing && phase.kind === 'idle';

  const renderer = useMemo(() => new ReelRenderer(activity, opts), [optsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dims = reelDims(aspect);

  const drawAt = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderer.draw(ctx, Math.min(1, t / duration), t);
    },
    [renderer, duration],
  );

  // reset on new renderer
  useEffect(() => {
    ensureReelFonts().then(() => drawAt(tRef.current));
    tRef.current = 0;
    setTSec(0);
    setPlaying(true);
    setPhase({ kind: 'idle' });
    drawAt(0);
  }, [renderer]); // eslint-disable-line react-hooks/exhaustive-deps

  // repaint while paused / scrubbing
  useEffect(() => {
    if (!playing) drawAt(tSec);
  }, [tSec, playing, drawAt]);

  // playback loop
  useEffect(() => {
    let raf = 0;
    let lastFrame = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      if (!playingRef.current) return;
      let t = tRef.current + dt;
      if (t >= duration) t = 0; // loop the preview
      tRef.current = t;
      setTSec(t);
      drawAt(t);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [duration, drawAt]);

  // ---------------------------------------------------------------- export
  const startExport = async () => {
    if (phase.kind === 'recording') return;
    setPlaying(false);
    setPhase({ kind: 'recording', pct: 0 });
    try {
      const result = await recordReel(activity, opts, (p) => setPhase({ kind: 'recording', pct: p }));
      setPhase({ kind: 'done', result });
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const discardResult = () => {
    if (phase.kind === 'done') URL.revokeObjectURL(phase.result.url);
    setPhase({ kind: 'idle' });
    setPlaying(true);
  };

  useEffect(
    () => () => {
      // cleanup object URL on unmount
      setPhase((prev) => {
        if (prev.kind === 'done') URL.revokeObjectURL(prev.result.url);
        return prev;
      });
    },
    [],
  );

  const supported = canRecordVideo();
  const aspectIcons: Record<ReelAspect, typeof Square> = { '16:9': MonitorPlay, '9:16': Smartphone, '1:1': Square };
  const recording = phase.kind === 'recording';

  return (
    <div className="flex flex-col">
      {/* ---------------- options ---------------- */}
      <div className="space-y-4 border-b border-line px-4 py-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9.5px] tracking-[0.2em] text-mist-500 uppercase">Format</span>
            <span className="font-mono text-[9.5px] text-mist-600">{REEL_ASPECTS.find((a) => a.id === aspect)?.tag}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-ink-950/60 p-1">
            {REEL_ASPECTS.map((a) => {
              const Icon = aspectIcons[a.id];
              const active = aspect === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setAspect(a.id)}
                  disabled={recording}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 font-mono text-[10px] tracking-[0.12em] uppercase transition-all ${
                    active ? 'bg-volt-400 text-ink-950 font-semibold' : 'text-mist-400 hover:bg-ink-800 hover:text-zinc-200'
                  } disabled:opacity-50`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {a.id}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9.5px] tracking-[0.2em] text-mist-500 uppercase">Length</span>
            <span className="font-mono text-[9.5px] text-mist-600">30 fps · HD</span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-ink-950/60 p-1">
            {REEL_DURATIONS.map((d) => {
              const active = duration === d;
              return (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  disabled={recording}
                  className={`rounded-md px-2 py-2 font-mono text-[11px] font-medium transition-all ${
                    active ? 'bg-ink-700 text-volt-300 ring-1 ring-volt-400/50' : 'text-mist-400 hover:bg-ink-800 hover:text-zinc-200'
                  } disabled:opacity-50`}
                >
                  {d}s
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-2 block font-mono text-[9.5px] tracking-[0.2em] text-mist-500 uppercase">Theme</span>
          <div className="grid grid-cols-3 gap-1.5">
            {REEL_THEMES.map((t) => {
              const active = themeId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setThemeId(t.id)}
                  disabled={recording}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all ${
                    active ? 'border-volt-400/60 bg-ink-800' : 'border-line bg-ink-950/40 hover:border-line-strong'
                  } disabled:opacity-50`}
                >
                  <span className="h-3.5 w-3.5 rounded-full ring-2 ring-white/10" style={{ background: t.accent }} />
                  <span className={`font-mono text-[10px] tracking-[0.1em] uppercase ${active ? 'text-zinc-100' : 'text-mist-500'}`}>{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------------- preview / result ---------------- */}
      <div className="px-4 pt-4">
        <div className="relative overflow-hidden rounded-xl border border-line bg-black" style={{ aspectRatio: `${dims.w} / ${dims.h}`, maxHeight: aspect === '9:16' ? 420 : undefined }}>
          {phase.kind === 'done' ? (
            <video key={phase.result.url} src={phase.result.url} className="h-full w-full object-contain" controls autoPlay loop muted playsInline />
          ) : (
            <>
              <canvas ref={canvasRef} width={renderer.w} height={renderer.h} className="h-full w-full object-contain" />
              {recording && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-ink-950/80 backdrop-blur-sm">
                  <Clapperboard className="h-6 w-6 text-volt-400" />
                  <div className="font-mono text-xs tracking-[0.2em] text-zinc-200 uppercase">Recording frames…</div>
                  <div className="h-1 w-44 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full rounded-full bg-volt-400 transition-[width]" style={{ width: `${Math.round(phase.pct * 100)}%` }} />
                  </div>
                  <div className="font-mono text-[10px] text-mist-500">{Math.round(phase.pct * 100)}% · keep this tab focused</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* transport controls */}
        {phase.kind !== 'done' && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => setPlaying((v) => !v)}
              disabled={recording}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-ink-800 text-zinc-100 transition-colors hover:border-volt-400/50 hover:text-volt-300 disabled:opacity-40"
              aria-label={playing ? 'Pause preview' : 'Play preview'}
            >
              {playing && !recording ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={tSec}
              disabled={recording}
              onChange={(e) => {
                const v = Number(e.target.value);
                tRef.current = v;
                setTSec(v);
                setPlaying(false);
              }}
              className="scrub flex-1"
              aria-label="Scrub preview"
            />
            <span className="w-24 text-right font-mono text-[10.5px] text-mist-400 tabular-nums">
              {fmtDur(tSec)} / {fmtDur(duration)}
            </span>
            <button
              onClick={() => {
                tRef.current = 0;
                setTSec(0);
                drawAt(0);
                setPlaying(true);
              }}
              disabled={recording}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-mist-400 transition-colors hover:border-line-strong hover:text-zinc-200 disabled:opacity-40"
              aria-label="Restart preview"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ---------------- actions ---------------- */}
      <div className="mt-auto px-4 pb-4 pt-4">
        {!supported ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[11px] text-amber-200">
            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This browser can't capture canvas video. Try Chrome, Edge or Firefox.
          </div>
        ) : phase.kind === 'done' ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-lg border border-line bg-ink-950/60 px-3 py-2 font-mono text-[10.5px] text-mist-400">
              <span className="uppercase tracking-[0.14em]">{phase.result.ext} · {phase.result.width}×{phase.result.height} · 30fps</span>
              <span>{fmtBytes(phase.result.sizeBytes)}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <a
                href={phase.result.url}
                download={`${slugify(activity.name)}-route-reel-${aspect.replace(':', 'x')}.${phase.result.ext}`}
                className="flex items-center justify-center gap-2 rounded-lg bg-volt-400 px-4 py-3 font-display text-[13px] font-bold tracking-wide text-ink-950 uppercase transition-all hover:bg-volt-300 hover:shadow-[0_0_30px_rgba(181,241,62,0.35)]"
              >
                <Download className="h-4 w-4" />
                Download {phase.result.ext}
              </a>
              <button
                onClick={discardResult}
                className="flex items-center gap-2 rounded-lg border border-line px-4 py-3 font-mono text-[11px] tracking-[0.1em] text-mist-300 uppercase transition-colors hover:border-line-strong hover:text-zinc-100"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-render
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <button
              onClick={startExport}
              disabled={!supported || recording}
              className="group flex w-full items-center justify-center gap-2.5 rounded-lg bg-volt-400 px-4 py-3.5 font-display text-[13px] font-bold tracking-wide text-ink-950 uppercase transition-all hover:bg-volt-300 hover:shadow-[0_0_36px_rgba(181,241,62,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {recording ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rendering {Math.round(phase.pct * 100)}%
                </>
              ) : (
                <>
                  <Film className="h-4 w-4 transition-transform group-hover:scale-110" />
                  Export video · {aspect} · {duration}s
                </>
              )}
            </button>
            {phase.kind === 'error' && (
              <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">
                {phase.message}
              </div>
            )}
            <p className="text-center font-mono text-[9.5px] leading-relaxed tracking-[0.08em] text-mist-600">
              ENCODED IN-BROWSER VIA MEDIARECORDER · NOTHING IS UPLOADED
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
