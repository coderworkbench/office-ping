'use client';

// Animated, captioned walkthroughs for the Help page.
//
// A demo is a list of steps (caption + duration + optional pointer position)
// and a Stage that draws a small mock of the real screen for a given step.
// The mock is illustrative (aria-hidden); the numbered captions carry the
// meaning for screen readers. Coordinates are percentages of the stage, which
// keeps a 16:10 ratio; text inside uses container units so it scales with it.

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Icon } from '../ui';

export type DemoStep = {
  caption: string;
  ms: number;
  /** Pointer position in % of the stage; click=true plays a press ripple. */
  cursor?: { x: number; y: number; click?: boolean };
};

export type Demo = {
  id: string;
  title: string;
  steps: DemoStep[];
  Stage: (props: { step: number }) => JSX.Element;
};

export function DemoPlayer({ demo }: { demo: Demo }) {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const ref = useRef<HTMLElement>(null);
  const visible = useInView(ref);

  // People who ask for less motion get the steps without autoplay.
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);

  useEffect(() => {
    if (!playing || !visible) return;
    const t = setTimeout(() => setStep(s => (s + 1) % demo.steps.length), demo.steps[step].ms);
    return () => clearTimeout(t);
  }, [step, playing, visible, demo.steps]);

  const go = (n: number) => { setPlaying(false); setStep((n + demo.steps.length) % demo.steps.length); };
  const cur = demo.steps[step].cursor;
  const last = step === demo.steps.length - 1;

  return (
    <figure ref={ref} className="overflow-hidden rounded-2xl border border-line bg-surface-2">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-page [container-type:inline-size]" aria-hidden>
        <demo.Stage step={step} />
        {cur && <Pointer x={cur.x} y={cur.y} click={!!cur.click} stepKey={step} />}
      </div>

      <figcaption className="border-t border-line bg-surface p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="eyebrow">Demo · {demo.title}</span>
          <div className="flex items-center gap-1" role="group" aria-label={`${demo.title} demo controls`}>
            <CtrlButton label="Previous step" onClick={() => go(step - 1)}>‹</CtrlButton>
            <CtrlButton label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(p => !p)}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </CtrlButton>
            <CtrlButton label="Next step" onClick={() => go(step + 1)}>›</CtrlButton>
            <CtrlButton label="Start again" onClick={() => { setStep(0); setPlaying(true); }}>↺</CtrlButton>
          </div>
        </div>
        <ol className="space-y-1">
          {demo.steps.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}
                className={'flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-150 ' +
                  (i === step ? 'bg-gold-soft text-ink' : 'text-ink-2 hover:bg-inset')}>
                <span className={'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ' +
                  (i === step ? 'bg-gold-fill text-on-gold' : i < step ? 'bg-success-soft text-success' : 'bg-inset text-ink-3')}>
                  {i < step || (last && i === step && !playing) ? '✓' : i + 1}
                </span>
                <span className={i === step ? 'font-semibold' : ''}>{s.caption}</span>
              </button>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}

function CtrlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="grid h-9 w-9 place-items-center rounded-lg text-lg font-bold text-ink-2 hover:bg-inset hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
      {children}
    </button>
  );
}
const PlayIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>;
const PauseIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>;

// The pointer glides between positions; a ring expands where it clicks.
function Pointer({ x, y, click, stepKey }: { x: number; y: number; click: boolean; stepKey: number }) {
  return (
    <div className="pointer-events-none absolute z-20 transition-[left,top] duration-700 ease-in-out"
         style={{ left: `${x}%`, top: `${y}%` }}>
      {click && <span key={stepKey} className="absolute -left-[2.2cqw] -top-[2.2cqw] h-[4.4cqw] w-[4.4cqw] rounded-full border-2 border-brand animate-clickRing" />}
      <svg className="relative h-[3.6cqw] w-[3.6cqw] min-h-[14px] min-w-[14px] drop-shadow" viewBox="0 0 24 24">
        <path d="M4 2l15 11-6.5 1.2L16.5 21l-3 1.4-3.6-7L4 19z" fill="#241B04" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ---------- tiny drawing primitives for the stages (all sizes in %) ----------

/** Absolutely positioned box: x, y, w, h in % of the stage. */
export function At({ x, y, w, h, className = '', children, show = true }: {
  x: number; y: number; w?: number; h?: number; className?: string; children?: ReactNode; show?: boolean;
}) {
  return (
    <div className={'absolute transition-opacity duration-300 ' + (show ? 'opacity-100' : 'pointer-events-none opacity-0') + ' ' + className}
         style={{ left: `${x}%`, top: `${y}%`, width: w !== undefined ? `${w}%` : undefined, height: h !== undefined ? `${h}%` : undefined }}>
      {children}
    </div>
  );
}

/** Text that scales with the stage width. */
export const T = 'text-[clamp(7px,2.1cqw,15px)] leading-tight';
export const TSm = 'text-[clamp(6px,1.6cqw,12px)] leading-tight';
export const TLg = 'text-[clamp(10px,3.6cqw,26px)] leading-tight font-extrabold';

export function MiniAvatar({ name, gold = false, online }: { name: string; gold?: boolean; online?: boolean }) {
  const ini = name.split(' ').map(w => w[0]).join('').slice(0, 2);
  return (
    <span className={'relative inline-grid h-[4.2cqw] w-[4.2cqw] shrink-0 place-items-center rounded-full font-bold text-on-gold ' + TSm + ' ' +
      (gold ? 'bg-gold-fill' : 'bg-inset')}>
      {ini}
      {online !== undefined && (
        <span className={'absolute -bottom-[0.2cqw] -right-[0.2cqw] h-[1.4cqw] w-[1.4cqw] rounded-full ring-1 ring-surface ' + (online ? 'bg-success' : 'bg-ink-3/60')} />
      )}
    </span>
  );
}

export { Icon };

// ---------- hooks ----------

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

function useInView(ref: React.RefObject<HTMLElement>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}
