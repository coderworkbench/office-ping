'use client';

// Guided tour: spotlights real controls one by one with a short explanation.
// Started from Help ("Show me around") or the one-time offer on Overview, via
// window.dispatchEvent(new Event('op:tour')).
//
// Each stop names candidate targets ([data-tour=...]); the first one that is
// visible is used, so the same tour works with the desktop rail and with the
// phone tab bar. A stop whose target isn't on screen is skipped.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';

type Role = 'ADMIN' | 'HR' | 'MEMBER';
type Stop = {
  id: string;
  title: string;
  body: string;
  /** Wording for phones (<640px), where the controls differ. */
  phoneBody?: string;
  /** Page the target lives on; the tour navigates there first. */
  page?: string;
  /** Candidate selectors, first visible wins. No targets = centred card. */
  targets?: string[];
  roles?: Role[];
};

const STOPS: Stop[] = [
  { id: 'welcome', title: 'Welcome to Office Ping 👋',
    body: 'A one-minute tour of the main things. Use Next (or the → key) to move on, or Skip any time.' },
  { id: 'search', page: '/dashboard', targets: ['[data-tour="composer-search"]'],
    title: 'Find who you need', body: 'Type a name, team or email here and pick the person from the list.' },
  { id: 'mode', page: '/dashboard', targets: ['[data-tour="composer-mode"]'], roles: ['HR', 'ADMIN'],
    title: '…or a whole group', body: 'Switch to Group to ping everyone in a team at once.' },
  { id: 'recent', page: '/dashboard', targets: ['[data-tour="composer-recent"]'],
    title: 'Your regulars', body: 'People you pinged lately, with one-click Nudge (a quick tap, no message) and Ping (write a message).',
    phoneBody: 'Tap a face to choose that person. Press and hold a face to send a 👋 Nudge straight away.' },
  { id: 'templates', page: '/dashboard', targets: ['[data-tour="composer-templates"]'],
    title: 'Pick a quick message', body: 'Tap a ready-made message, or type your own in the box below.' },
  { id: 'urgent', page: '/dashboard', targets: ['[data-tour="composer-urgent"]'],
    title: 'Urgent? Only when it really is', body: 'Urgent pings show in red and jump ahead of other pings.' },
  { id: 'send', page: '/dashboard', targets: ['[data-tour="composer-send"]'],
    title: 'Send', body: 'They get a pop-up straight away and answer with Acknowledge or a quick reply like “On my way”, which you see at once.',
    phoneBody: 'They get a pop-up straight away and answer with a quick reply like “On my way”. With the message box empty, this sends a 👋 Nudge.' },
  { id: 'quickping', targets: ['[data-tour="quick-ping"]'],
    title: 'Ping from anywhere', body: 'Press Ctrl + K (⌘ K on a Mac), or click here, to ping someone without leaving the page you’re on.' },
  { id: 'status', targets: ['[data-tour="status"]', '[data-tour="nav-more"]'],
    title: 'Your status', body: 'In a meeting or need to focus? Set a status here. People see it, and normal pings wait quietly in your Inbox; urgent ones still pop up.',
    phoneBody: 'In a meeting or need to focus? Set a status under More. People see it, and normal pings wait quietly in your Inbox; urgent ones still pop up.' },
  { id: 'notify', targets: ['[data-tour="notify-enable"]'],
    title: 'Turn on desktop notifications', body: 'Click Enable so pings reach you even when this tab is in the background.' },
  { id: 'people', targets: ['[data-tour="nav-people"]'],
    title: 'People', body: "See who's online and who's busy, and Nudge or Ping anyone in one click." },
  { id: 'inbox', targets: ['[data-tour="nav-inbox"]'],
    title: 'Inbox', body: 'Pings sent to you land here, unanswered urgent ones first. The number shows how many you haven’t read.' },
  { id: 'messages', targets: ['[data-tour="nav-messages"]'],
    title: 'Messages', body: 'Quiet one-to-one chat: no pop-up and no sound, just a red number, so it never interrupts like a ping does.' },
  { id: 'history', targets: ['[data-tour="nav-history"]', '[data-tour="nav-more"]'],
    title: 'History', body: 'Check whether your pings were delivered and acknowledged, see replies, and search or filter past pings.',
    phoneBody: 'Under More: check whether your pings were delivered and acknowledged, see replies, and search past pings.' },
  { id: 'groups', targets: ['[data-tour="nav-groups"]', '[data-tour="nav-manage"]', '[data-tour="nav-more"]'], roles: ['HR', 'ADMIN'],
    title: 'Groups and templates', body: 'Create teams to ping together, and manage the quick messages everyone sees. They’re under Manage in the sidebar, or More on a phone.' },
  { id: 'users', targets: ['[data-tour="nav-users"]', '[data-tour="nav-manage"]', '[data-tour="nav-more"]'], roles: ['ADMIN'],
    title: 'Users and audit log', body: 'Create accounts, change roles, reset forgotten passwords and review the audit log, all under Manage (More on a phone).' },
  { id: 'help', targets: ['[data-tour="nav-help"]', '[data-tour="nav-more"]'],
    title: 'Help, any time', body: 'Step-by-step guides with animated demos. On a phone it’s under More.' },
  { id: 'account', targets: ['[data-tour="account"]'],
    title: 'Your password', body: 'Change your password here.' },
  { id: 'done', title: "You're all set ✓",
    body: 'Keep Office Ping open (a pinned browser tab is easiest) so pings can reach you. You can replay this tour from Help.' },
];

const PAD = 6;
const doneKey = (uid: number) => `op_tour_done_${uid}`;
// Every page mounts its own shell (and tour), so a running tour keeps its
// place here while it moves between pages.
const RUN_KEY = 'op_tour_step';

function visibleMatch(selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
    }
  }
  return null;
}

export function Tour() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  // The measured target belongs to one step; a new step never shows the
  // previous step's position, even for the one render before it's measured.
  const [measured, setMeasured] = useState<{ idx: number; r: DOMRect } | null>(null);
  const idxRef = useRef(0);
  idxRef.current = idx;
  const rect = measured && measured.idx === idx ? measured.r : null;
  const setRect = (r: DOMRect | null) => setMeasured(r ? { idx: idxRef.current, r } : null);
  const [offer, setOffer] = useState(false);
  const dir = useRef(1);
  const target = useRef<HTMLElement | null>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);

  const role = (user?.role || 'MEMBER') as Role;
  const stops = STOPS.filter(s => !s.roles || s.roles.includes(role));
  const stop = stops[Math.min(idx, stops.length - 1)];

  const finish = useCallback(() => {
    setActive(false); setRect(null); target.current = null;
    try { sessionStorage.removeItem(RUN_KEY); } catch {}
    if (user) try { localStorage.setItem(doneKey(user.id), '1'); } catch {}
  }, [user]);

  // Pick up a tour that was running on the previous page.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(RUN_KEY);   // "step:direction"
      if (saved !== null) {
        const [i, d] = saved.split(':').map(Number);
        dir.current = d === -1 ? -1 : 1;
        setIdx(i || 0); setActive(true);
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (!active) return;
    try { sessionStorage.setItem(RUN_KEY, `${idx}:${dir.current}`); } catch {}
  }, [active, idx]);

  const start = useCallback(() => {
    setOffer(false); dir.current = 1; setIdx(0); setRect(null); setActive(true);
  }, []);

  // Start requests from Help / the offer card.
  useEffect(() => {
    const on = () => start();
    window.addEventListener('op:tour', on);
    return () => window.removeEventListener('op:tour', on);
  }, [start]);

  // One-time offer on Overview for people who haven't taken (or dismissed) it.
  useEffect(() => {
    if (!user || active || pathname !== '/dashboard') { setOffer(false); return; }
    let seen = '1';
    try { seen = localStorage.getItem(doneKey(user.id)) || ''; } catch {}
    if (seen) return;
    const t = setTimeout(() => setOffer(true), 1500);
    return () => clearTimeout(t);
  }, [user, active, pathname]);

  // Resolve the current stop: navigate if needed, find the target, measure it.
  useEffect(() => {
    if (!active || !stop) return;
    setRect(null); target.current = null;
    if (!stop.targets) return;
    if (stop.page && pathname !== stop.page) { router.push(stop.page); return; }
    let tries = 0;
    const iv = setInterval(() => {
      const el = visibleMatch(stop.targets!);
      if (el) {
        clearInterval(iv);
        target.current = el;
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        setTimeout(() => { if (target.current === el) setRect(el.getBoundingClientRect()); }, 380);
      } else if (++tries > 20) {
        clearInterval(iv);   // not on this screen: skip in the direction of travel
        setIdx(i => Math.max(0, Math.min(stops.length - 1, i + dir.current)));
      }
    }, 100);
    return () => clearInterval(iv);
  }, [active, idx, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the spotlight on the element while scrolling / resizing.
  useEffect(() => {
    if (!active) return;
    const update = () => { if (target.current) setRect(target.current.getBoundingClientRect()); };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [active]);

  const next = useCallback(() => {
    dir.current = 1;
    if (idx >= stops.length - 1) finish(); else setIdx(i => i + 1);
  }, [idx, stops.length, finish]);
  const back = useCallback(() => { dir.current = -1; setIdx(i => Math.max(0, i - 1)); }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, back, finish]);

  // Focus the primary action whenever the card changes.
  const ready = active && (!stop?.targets || !!rect);
  useEffect(() => { if (ready) nextBtn.current?.focus({ preventScroll: true }); }, [ready, idx]);

  if (!user) return null;

  if (offer && !active) {
    return (
      <div role="dialog" aria-label="Take the tour"
           className="fixed bottom-24 right-4 z-[80] w-[min(340px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-4 shadow-lg animate-slideIn lg:bottom-20 lg:right-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-soft text-xl" aria-hidden>🧭</span>
          <div className="min-w-0">
            <div className="font-bold text-ink">New to Office Ping?</div>
            <p className="mt-0.5 text-sm text-ink-2">Take a one-minute tour of the main things.</p>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={finish}>Not now</button>
          <button className="btn-primary btn-sm" onClick={start}>Start tour</button>
        </div>
      </div>
    );
  }

  if (!active || !stop) return null;

  // Position the card: under the target if there's room, else above; on phones
  // pin it to the top or bottom edge, away from the target.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const cardW = Math.min(360, vw - 32);
  let cardStyle: React.CSSProperties;
  if (!rect) {
    cardStyle = { left: (vw - cardW) / 2, top: Math.max(16, vh / 2 - 120), width: cardW };
  } else if (vw < 640) {
    cardStyle = rect.top + rect.height / 2 > vh / 2
      ? { left: 16, right: 16, top: 'calc(16px + env(safe-area-inset-top))' }
      : { left: 16, right: 16, bottom: 'calc(96px + env(safe-area-inset-bottom))' };
  } else {
    const below = rect.bottom + PAD + 12;
    const fitsBelow = below + 220 < vh;
    const left = Math.max(16, Math.min(rect.left, vw - cardW - 16));
    cardStyle = fitsBelow
      ? { left, top: below, width: cardW }
      : { left, top: Math.max(16, rect.top - PAD - 12 - 220), width: cardW };
  }

  const n = stops.length;
  return (
    <div className="fixed inset-0 z-[90]" aria-live="polite">
      {/* Blocks clicks on the page underneath while touring. */}
      <div className={'absolute inset-0 ' + (rect ? '' : 'bg-[rgb(20_14_2_/_.58)] animate-fadeIn')} />
      {rect && (
        <div className="pointer-events-none absolute rounded-xl animate-tourPulse transition-all duration-300"
             style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      )}
      {(!stop.targets || rect) && (
        <div role="dialog" aria-modal="true" aria-labelledby="tour-title" key={stop.id}
             className="absolute rounded-2xl border border-line bg-surface p-4 shadow-2xl animate-popIn sm:p-5" style={cardStyle}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="eyebrow">Tour · {idx + 1} of {n}</span>
            <button onClick={finish} className="-mr-1 rounded-lg px-2 py-1 text-sm font-semibold text-ink-3 hover:bg-inset hover:text-ink">Skip</button>
          </div>
          <h2 id="tour-title" className="text-lg font-bold text-ink">{stop.title}</h2>
          <p className="mt-1 text-sm text-ink-2">{vw < 640 && stop.phoneBody ? stop.phoneBody : stop.body}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex gap-1" aria-hidden>
              {stops.map((s, i) => (
                <span key={s.id} className={'h-1.5 rounded-full transition-all duration-300 ' + (i === idx ? 'w-4 bg-gold-fill' : i < idx ? 'w-1.5 bg-gold' : 'w-1.5 bg-line')} />
              ))}
            </div>
            <div className="flex gap-2">
              {idx > 0 && <button onClick={back} className="btn-neutral btn-sm">Back</button>}
              <button ref={nextBtn} onClick={next} className="btn-primary btn-sm">
                {idx === n - 1 ? 'Finish' : idx === 0 ? 'Start' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
