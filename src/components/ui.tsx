import type { ReactNode } from 'react';

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="61" height="61" rx="14" fill="#0c1219" stroke="#2b3c50" strokeWidth="2" />
      <path d="M14 46 C 22 46, 20 30, 30 30 S 44 40, 44 22" stroke="#b5f13e" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="14" cy="46" r="4.2" fill="#b5f13e" />
      <path d="M41 16 L51 22 L41 28 Z" fill="#e7f9c0" />
    </svg>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const map = {
    tl: '-top-px -left-px border-t-[2.5px] border-l-[2.5px] rounded-tl-xl',
    tr: '-top-px -right-px border-t-[2.5px] border-r-[2.5px] rounded-tr-xl',
    bl: '-bottom-px -left-px border-b-[2.5px] border-l-[2.5px] rounded-bl-xl',
    br: '-bottom-px -right-px border-b-[2.5px] border-r-[2.5px] rounded-br-xl',
  } as const;
  return <span aria-hidden className={`pointer-events-none absolute z-10 h-3.5 w-3.5 border-volt-400/60 ${map[pos]}`} />;
}

export function Panel({ className = '', children, ticks = true }: { className?: string; children: ReactNode; ticks?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line bg-ink-900/85 shadow-[0_24px_70px_-35px_rgba(0,0,0,0.9)] ${className}`}>
      {ticks && (
        <>
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
        </>
      )}
      {children}
    </div>
  );
}

export function PanelHeader({ title, right, icon }: { title: string; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex items-center gap-2">
        {icon && <span className="text-volt-400">{icon}</span>}
        <h3 className="font-mono text-[10.5px] font-semibold tracking-[0.22em] text-mist-400">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function Chip({ children, tone = 'dim' }: { children: ReactNode; tone?: 'dim' | 'volt' | 'line' }) {
  const styles = {
    dim: 'bg-ink-800/80 text-mist-300 border-line',
    volt: 'bg-volt-400/10 text-volt-300 border-volt-400/30',
    line: 'bg-transparent text-mist-400 border-line',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-medium tracking-[0.14em] uppercase ${styles[tone]}`}>
      {children}
    </span>
  );
}
