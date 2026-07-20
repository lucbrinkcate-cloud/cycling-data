import { useEffect, useState } from 'react';
import { Check, RotateCcw, X, Zap } from 'lucide-react';
import type { AthleteSettings } from '../lib/settings';
import { DEFAULT_SETTINGS } from '../lib/settings';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: AthleteSettings;
  onChange: (next: AthleteSettings) => void;
  /** FTP stored in the currently loaded file (for the "use detected" shortcut). */
  detectedFtp?: number | null;
}

interface FieldDef {
  key: keyof AthleteSettings;
  label: string;
  unit: string;
  placeholder: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

const FIELDS: FieldDef[] = [
  {
    key: 'ftp',
    label: 'Functional Threshold Power (FTP)',
    unit: 'W',
    placeholder: 'auto-detect from file',
    min: 40,
    max: 600,
    step: 1,
    hint: 'The max average power you hold for ~1 hour. Drives power zones 1–7. Leave blank to use the value recorded in each file.',
  },
  {
    key: 'weight',
    label: 'Body weight',
    unit: 'kg',
    placeholder: 'not set',
    min: 30,
    max: 200,
    step: 0.1,
    hint: 'Used for watts-per-kg (coming next).',
  },
  {
    key: 'maxHr',
    label: 'Max heart rate',
    unit: 'bpm',
    placeholder: 'not set',
    min: 100,
    max: 230,
    step: 1,
    hint: 'Used for heart-rate zones (coming next).',
  },
  {
    key: 'lthr',
    label: 'Lactate-threshold HR (LTHR)',
    unit: 'bpm',
    placeholder: 'not set',
    min: 80,
    max: 220,
    step: 1,
    hint: 'Your 30-min time-trial heart rate. Used for HR zones (coming next).',
  },
];

export default function SettingsModal({ open, onClose, settings, onChange, detectedFtp }: Props) {
  const [draft, setDraft] = useState<AthleteSettings>(settings);

  // Re-sync the draft each time the modal is (re)opened.
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const setNum = (key: keyof AthleteSettings, raw: string) => {
    const n = raw.trim() === '' ? null : Number(raw);
    setDraft((d) => ({ ...d, [key]: n != null && isFinite(n) && n > 0 ? n : null }));
  };

  const save = () => {
    onChange(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink-950/80 p-4 backdrop-blur-sm sm:p-8">
      <div className="relative my-4 w-full max-w-lg overflow-hidden rounded-2xl border border-line-strong bg-ink-900 shadow-[0_30px_90px_-30px_rgba(0,0,0,0.9)]">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-volt-400/10 text-volt-400">
              <Zap className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-[15px] font-bold tracking-wide text-zinc-100">Athlete profile</h2>
              <p className="font-mono text-[9.5px] tracking-[0.16em] text-mist-500 uppercase">Saved on this device only</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mist-400 transition-colors hover:border-line-strong hover:text-zinc-100"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="space-y-5 px-5 py-5">
          {detectedFtp != null && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-volt-400/25 bg-volt-400/[0.06] px-3.5 py-2.5">
              <span className="font-mono text-[10.5px] leading-relaxed text-mist-300">
                This file records an FTP of <span className="font-semibold text-volt-300">{detectedFtp} W</span>.
              </span>
              <button
                onClick={() => setDraft((d) => ({ ...d, ftp: detectedFtp }))}
                className="shrink-0 rounded-md border border-volt-400/40 px-2.5 py-1.5 font-mono text-[10px] tracking-wide text-volt-300 uppercase transition-colors hover:bg-volt-400/10"
              >
                Use it
              </button>
            </div>
          )}

          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="flex items-baseline justify-between">
                <span className="font-mono text-[10.5px] font-medium tracking-[0.06em] text-zinc-200">{f.label}</span>
                <span className="font-mono text-[9px] text-mist-500">{f.unit}</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={f.min}
                max={f.max}
                step={f.step}
                value={draft[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setNum(f.key, e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-line bg-ink-950/60 px-3 py-2.5 font-mono text-sm text-zinc-100 tabular-nums outline-none transition-colors placeholder:text-mist-600 focus:border-volt-400/60"
              />
              <p className="mt-1.5 font-mono text-[9.5px] leading-relaxed text-mist-500">{f.hint}</p>
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line bg-ink-950/40 px-5 py-4">
          <button
            onClick={() => setDraft({ ...DEFAULT_SETTINGS })}
            className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-mist-400 uppercase transition-colors hover:text-zinc-200"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-line px-4 py-2.5 font-mono text-[11px] tracking-[0.08em] text-mist-300 uppercase transition-colors hover:border-line-strong hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="flex items-center gap-1.5 rounded-lg bg-volt-400 px-5 py-2.5 font-display text-[12px] font-bold tracking-wide text-ink-950 uppercase transition-all hover:bg-volt-300 hover:shadow-[0_0_24px_rgba(181,241,62,0.3)]"
            >
              <Check className="h-4 w-4" /> Save profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
