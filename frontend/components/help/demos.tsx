'use client';

// The Help page's animated demos. Each Stage draws a simplified mock of the
// real screen in Sunbeam style; positions are % of a 16:10 stage and must
// line up with the pointer coordinates in that demo's steps.

import { At, Demo, Icon, MiniAvatar, T, TLg, TSm } from './DemoPlayer';

// Shared mock pieces ----------------------------------------------------------

const card = 'rounded-[1.6cqw] border border-line bg-surface shadow-sm';
const field = 'flex items-center gap-[1cqw] rounded-[1.2cqw] border border-line bg-surface px-[1.4cqw]';
const goldBtn = (pressed = false) =>
  'grid place-items-center rounded-[1.4cqw] font-bold transition-colors duration-200 ' +
  (pressed ? 'bg-brand text-gold-fill' : 'bg-gold-fill text-on-gold');
const outlineBtn = 'grid place-items-center rounded-full border border-gold-fill font-bold text-brand';
const chip = (active = false) =>
  'grid place-items-center whitespace-nowrap rounded-full border font-bold transition-colors duration-200 ' +
  (active ? 'border-gold-fill bg-gold-fill text-on-gold' : 'border-line bg-surface text-ink-2');
const pill = (tone: 'sent' | 'delivered' | 'ack') =>
  'inline-flex items-center gap-[0.6cqw] whitespace-nowrap rounded-full px-[1cqw] py-[0.3cqw] font-bold ' +
  (tone === 'ack' ? 'bg-success-soft text-success' : tone === 'delivered' ? 'bg-brand-soft text-brand' : 'bg-inset text-ink-2');
const Toast = ({ text, show }: { text: string; show: boolean }) => (
  <At x={30} y={4} w={40} h={8} show={show}
      className={'grid place-items-center rounded-full bg-success-soft font-bold text-success ' + T}>
    ✓ {text}
  </At>
);

// 1. Sending a ping (Overview composer) ----------------------------------------

export const sendPing: Demo = {
  id: 'send-ping',
  title: 'Send a ping',
  steps: [
    { caption: 'On the Overview page, click the search box.', ms: 1500, cursor: { x: 30, y: 31, click: true } },
    { caption: 'Type a few letters of their name…', ms: 1500, cursor: { x: 30, y: 31 } },
    { caption: '…and pick the person from the list.', ms: 1300, cursor: { x: 26, y: 44, click: true } },
    { caption: 'Click a quick template, or type your own message.', ms: 1600, cursor: { x: 21, y: 57, click: true } },
    { caption: 'Click Send ping.', ms: 1200, cursor: { x: 82, y: 87, click: true } },
    { caption: 'Done. They get a pop-up straight away.', ms: 2200, cursor: { x: 82, y: 87 } },
  ],
  Stage: ({ step }) => (
    <>
      <At x={4} y={5} w={92} h={90} className={card} />
      <At x={8} y={10} className={TLg + ' text-ink'}>Who do you need?</At>
      <At x={8} y={24} w={84} h={12} className={field + ' ' + T + (step === 0 || step === 1 ? ' border-brand shadow-ring' : '')}>
        {step >= 2 ? (
          <><MiniAvatar name="Rahul D" online /><span className="font-bold text-ink">Rahul D</span></>
        ) : (
          <><span className="text-ink-3">🔍</span>
            <span className={step === 1 ? 'text-ink' : 'text-ink-3'}>{step === 1 ? 'Rah' : 'Type a name, team, or email…'}</span>
            {step === 1 && <span className="h-[2.4cqw] w-[0.25cqw] animate-pulse bg-ink" />}</>
        )}
      </At>
      <At x={8} y={37} w={52} h={13} show={step === 1} className={card + ' flex items-center gap-[1.2cqw] px-[1.4cqw] shadow-lg ' + T}>
        <MiniAvatar name="Rahul D" online />
        <span><b className="text-ink">Rahul D</b><br /><span className={TSm + ' text-ink-2'}>Backend · Online</span></span>
      </At>
      <At x={8} y={52} w={28} h={9} className={chip(step >= 3) + ' ' + TSm}>Please come to my desk</At>
      <At x={38} y={52} w={22} h={9} className={chip() + ' ' + TSm}>Meeting room</At>
      <At x={62} y={52} w={20} h={9} className={chip() + ' ' + TSm}>Contact HR</At>
      <At x={8} y={65} w={84} h={13} className={field + ' items-start pt-[1.2cqw] ' + T}>
        <span className={step >= 3 ? 'text-ink' : 'text-ink-3'}>{step >= 3 ? 'Please come to my desk' : 'A short message…'}</span>
      </At>
      <At x={8} y={84} w={40} h={7} show={step >= 5} className={'flex items-center font-bold text-success ' + T}>✓ Sent to Rahul D</At>
      <At x={70} y={82} w={22} h={10} className={goldBtn(step === 4) + ' ' + T}>Send ping</At>
    </>
  ),
};

// 2. Receiving a ping ------------------------------------------------------------

export const receive: Demo = {
  id: 'receive',
  title: 'Receive a ping',
  steps: [
    { caption: "You're working as usual…", ms: 1400, cursor: { x: 62, y: 70 } },
    { caption: 'A ping pops up in the middle of the screen, with a chime.', ms: 2000, cursor: { x: 62, y: 70 } },
    { caption: 'A desktop notification appears too, and stays until you click it.', ms: 2000, cursor: { x: 62, y: 70 } },
    { caption: "Click Acknowledge to say 'got it'.", ms: 1300, cursor: { x: 58, y: 70, click: true } },
    { caption: 'Sneha instantly sees that you acknowledged it.', ms: 2200, cursor: { x: 58, y: 70 } },
    { caption: 'Busy? Click Later instead…', ms: 1600, cursor: { x: 40, y: 70, click: true } },
    { caption: '…and the ping waits in your Inbox.', ms: 2200, cursor: { x: 14, y: 46 } },
  ],
  Stage: ({ step }) => {
    const popup = (step >= 1 && step <= 3) || step === 5;
    return (
      <>
        {/* the page behind */}
        <At x={0} y={0} w={18} h={100} className="bg-sidebar" />
        <At x={3} y={8} w={12} h={4} className="rounded bg-white/20" />
        {['Overview', 'People', 'Inbox', 'History'].map((l, i) => (
          <At key={l} x={3} y={22 + i * 12} w={13} className={TSm + ' flex items-center gap-[0.8cqw] font-semibold ' + (l === 'Inbox' && step === 6 ? 'text-gold-fill' : 'text-white/70')}>
            {l}
            {l === 'Inbox' && step === 6 && <span className="grid h-[2.4cqw] w-[2.4cqw] place-items-center rounded-full bg-gold-fill text-on-gold">1</span>}
          </At>
        ))}
        <At x={24} y={10} w={70} h={80} className={card} />
        <At x={28} y={16} className={TLg + ' text-ink'}>Who do you need?</At>
        <At x={28} y={32} w={62} h={9} className="rounded-[1cqw] bg-inset" />
        <At x={28} y={46} w={62} h={9} className="rounded-[1cqw] bg-inset" />
        {/* dim + pop-up */}
        <At x={0} y={0} w={100} h={100} show={popup} className="bg-black/50" />
        <At x={30} y={18} w={40} h={64} show={popup} className={card + ' overflow-hidden shadow-2xl ' + (popup ? 'animate-popIn' : '')}>
          <div className="h-[1cqw] bg-gold-fill" />
          <div className={'flex flex-col items-center gap-[1cqw] p-[2cqw] text-center ' + T}>
            <span className="grid h-[6cqw] w-[6cqw] place-items-center rounded-full bg-gold-soft text-[3cqw]"><span className="animate-ring">🔔</span></span>
            <span className="flex items-center gap-[0.8cqw] font-bold text-ink"><MiniAvatar name="Sneha K" />Sneha K</span>
            <span className={'font-extrabold text-ink text-[clamp(8px,2.6cqw,18px)]'}>Please come to the meeting room</span>
          </div>
        </At>
        <At x={33} y={66} w={14} h={8} show={popup} className={'grid place-items-center rounded-[1.2cqw] border border-line bg-surface font-semibold text-ink ' + T}>Later</At>
        <At x={49} y={66} w={18} h={8} show={popup} className={goldBtn(step === 3) + ' ' + T}>Acknowledge</At>
        {/* desktop notification */}
        <At x={66} y={4} w={31} h={15} show={step === 2 || step === 3}
            className={card + ' flex items-center gap-[1cqw] px-[1.4cqw] shadow-lg ' + TSm}>
          <span className="text-[2.6cqw]">🔔</span>
          <span><b className="text-ink">Sneha K</b><br /><span className="text-ink-2">Please come to the meeting room</span></span>
        </At>
        {/* what the sender sees */}
        <At x={52} y={60} w={40} h={22} show={step === 4} className={card + ' p-[1.4cqw] shadow-lg ' + TSm}>
          <div className="mb-[0.8cqw] font-bold text-ink-2">Sneha's History</div>
          <div className="flex items-center justify-between gap-[1cqw]">
            <span className="font-semibold text-ink">→ you</span>
            <span className={pill('ack')}>● Acknowledged</span>
          </div>
        </At>
      </>
    );
  },
};

// 3. People: Nudge and Ping --------------------------------------------------------

export const people: Demo = {
  id: 'people',
  title: 'Nudge or ping from People',
  steps: [
    { caption: 'People lists everyone, with who is online at the top.', ms: 1700, cursor: { x: 50, y: 92 } },
    { caption: 'Nudge sends “👋 Nudge” instantly, with no typing.', ms: 1800, cursor: { x: 70, y: 30, click: true } },
    { caption: 'Ping opens a small window with quick templates.', ms: 1700, cursor: { x: 85, y: 50, click: true } },
    { caption: 'Pick a template…', ms: 1600, cursor: { x: 37, y: 52, click: true } },
    { caption: '…then click Send ping (or press Ctrl + Enter).', ms: 1300, cursor: { x: 68, y: 77, click: true } },
    { caption: 'Sent. You can follow it on the History page.', ms: 2200, cursor: { x: 68, y: 77 } },
  ],
  Stage: ({ step }) => {
    const rows = [
      { n: 'Rahul D', d: 'Backend', on: true },
      { n: 'Sneha K', d: 'Frontend', on: true },
      { n: 'Amit V', d: 'Frontend', on: false },
    ];
    const dialog = step === 3 || step === 4;
    return (
      <>
        <At x={6} y={6} className={TLg + ' text-ink'}>Who's here?</At>
        <At x={6} y={20} w={88} h={66} className={card} />
        {rows.map((r, i) => (
          <At key={r.n} x={9} y={25 + i * 20} w={82} h={14} className={'flex items-center gap-[1.4cqw] ' + T}>
            <MiniAvatar name={r.n} online={r.on} />
            <span className="flex-1"><b className="text-ink">{r.n}</b><br /><span className={TSm + ' text-ink-2'}>{r.d}</span></span>
            <span className={TSm + ' w-[9cqw] font-bold ' + (r.on ? 'text-success' : 'text-ink-3')}>{r.on ? 'ONLINE' : 'OFFLINE'}</span>
            <span className={'grid h-[5cqw] w-[10cqw] place-items-center rounded-full font-semibold text-ink-2 ' + (step === 1 && i === 0 ? 'bg-inset' : '')}>Nudge</span>
            <span className={outlineBtn + ' h-[5cqw] w-[10cqw] ' + (step === 2 && i === 1 ? 'bg-gold-soft' : '')}>Ping</span>
          </At>
        ))}
        <Toast text="Nudged Rahul D" show={step === 1} />
        <Toast text="Sent to Sneha K" show={step === 5} />
        {/* ping dialog */}
        <At x={0} y={0} w={100} h={100} show={dialog} className="bg-black/50" />
        <At x={20} y={22} w={60} h={64} show={dialog} className={card + ' overflow-hidden shadow-2xl'}>
          <div className="h-[0.8cqw] bg-gold-fill" />
          <div className={'space-y-[1.2cqw] p-[2cqw] ' + T}>
            <div className="flex items-center gap-[1cqw] font-bold text-ink"><MiniAvatar name="Sneha K" online /> Ping Sneha K</div>
            <div className="flex flex-wrap gap-[0.8cqw]">
              <span className={chip(step >= 3) + ' px-[1.4cqw] py-[0.6cqw] ' + TSm}>Please come to my desk</span>
              <span className={chip() + ' px-[1.4cqw] py-[0.6cqw] ' + TSm}>Contact HR</span>
            </div>
            <div className={'rounded-[1cqw] border border-line px-[1.2cqw] py-[1.4cqw] ' + (step >= 3 ? 'text-ink' : 'text-ink-3')}>Please come to my desk</div>
          </div>
        </At>
        <At x={60} y={73} w={17} h={8} show={dialog} className={goldBtn(step === 4) + ' ' + T}>Send ping</At>
      </>
    );
  },
};

// 4. What the statuses mean (History) -------------------------------------------

export const status: Demo = {
  id: 'status',
  title: 'Ping status',
  steps: [
    { caption: "Sent: it hasn't reached their screen yet (they're offline or Office Ping is closed).", ms: 2600 },
    { caption: "Delivered: it's on their screen, but they haven't acknowledged it yet.", ms: 2400 },
    { caption: 'Acknowledged: they clicked Acknowledge. Done!', ms: 2600 },
  ],
  Stage: ({ step }) => (
    <>
      {/* your History row */}
      <At x={4} y={8} className={TSm + ' font-bold uppercase tracking-wide text-gold'}>Your History</At>
      <At x={4} y={16} w={50} h={26} className={card + ' space-y-[1cqw] p-[1.6cqw] ' + T}>
        <div className="flex items-center gap-[0.8cqw] font-semibold text-ink"><MiniAvatar name="You" gold /> → <MiniAvatar name="Rahul D" /> Rahul D</div>
        <div className="font-bold text-ink">Please come to my desk</div>
        <span className={pill(step === 0 ? 'sent' : step === 1 ? 'delivered' : 'ack') + ' ' + TSm}>
          ● {step === 0 ? 'Sent' : step === 1 ? 'Delivered' : 'Acknowledged'}
        </span>
      </At>
      {/* progress track */}
      <At x={4} y={52} w={50} h={10} className={'flex items-center justify-between ' + TSm}>
        {['Sent', 'Delivered', 'Acknowledged'].map((l, i) => (
          <span key={l} className="flex flex-col items-center gap-[0.6cqw]">
            <span className={'grid h-[3.4cqw] w-[3.4cqw] place-items-center rounded-full font-bold transition-colors duration-300 ' +
              (i <= step ? (i === 2 ? 'bg-success text-white' : 'bg-gold-fill text-on-gold') : 'bg-inset text-ink-3')}>{i + 1}</span>
            <span className={i <= step ? 'font-bold text-ink' : 'text-ink-3'}>{l}</span>
          </span>
        ))}
      </At>
      <At x={8} y={55} w={42} h={1} className="-z-0 bg-line" />
      {/* Rahul's laptop */}
      <At x={60} y={10} w={36} h={50} className={'rounded-[1.4cqw] border-[0.6cqw] border-ink/80 transition-colors duration-300 ' + (step === 0 ? 'bg-ink-3/40' : 'bg-page')} />
      <At x={56} y={60} w={44} h={4} className="rounded-b-[1.4cqw] bg-ink/80" />
      <At x={60} y={66} w={36} className={'text-center font-semibold ' + T + (step === 0 ? ' text-ink-3' : ' text-ink-2')}>
        Rahul's screen {step === 0 && '(Office Ping closed)'}
      </At>
      <At x={64} y={20} w={28} h={30} show={step >= 1} className={card + ' flex flex-col items-center justify-center gap-[0.8cqw] shadow-lg ' + TSm}>
        <span className="font-extrabold text-ink">Please come to my desk</span>
        <span className={'rounded-[0.8cqw] px-[1.4cqw] py-[0.5cqw] font-bold ' + (step === 2 ? 'bg-brand text-gold-fill' : 'bg-gold-fill text-on-gold')}>Acknowledge</span>
      </At>
      <At x={64} y={80} w={30} show={step === 2} className={'text-center font-bold text-success ' + T}>✓ Rahul acknowledged</At>
    </>
  ),
};

// 5. Change your password ------------------------------------------------------------

export const password: Demo = {
  id: 'password',
  title: 'Change your password',
  steps: [
    { caption: 'Click the key icon at the bottom of the sidebar (on a phone: More → Change password).', ms: 2200, cursor: { x: 13, y: 89, click: true } },
    { caption: 'Enter your current password.', ms: 1500, cursor: { x: 55, y: 33, click: true } },
    { caption: 'Enter your new password twice.', ms: 1800, cursor: { x: 55, y: 63, click: true } },
    { caption: 'Click Change password. Use the new one next time you sign in.', ms: 2400, cursor: { x: 45, y: 79, click: true } },
  ],
  Stage: ({ step }) => {
    const dots = (n: number, on: boolean) => (on ? '●'.repeat(n) : '');
    return (
      <>
        <At x={0} y={0} w={22} h={100} className="bg-sidebar" />
        {['Overview', 'People', 'Inbox', 'History', 'Help'].map((l, i) => (
          <At key={l} x={3} y={10 + i * 10} className={TSm + ' font-semibold text-white/70'}>{l}</At>
        ))}
        <At x={3} y={84} w={6} h={10} className="grid place-items-center"><MiniAvatar name="You" gold /></At>
        <At x={11} y={85} w={5} h={8} className={'grid place-items-center rounded-[0.8cqw] text-[2.6cqw] ' + (step === 0 ? 'bg-white/15 text-gold-fill' : 'text-white/60')}><Icon name="key" size={14} className="h-[2.4cqw] w-[2.4cqw]" /></At>
        <At x={28} y={8} className={TLg + ' text-ink'}>Change password</At>
        <At x={28} y={20} w={56} h={70} className={card} show={step >= 1} />
        {[
          { l: 'Current password', y: 26, v: dots(8, step >= 1) },
          { l: 'New password', y: 41, v: dots(12, step >= 2) },
          { l: 'Confirm new password', y: 56, v: dots(12, step >= 2) },
        ].map(f => (
          <At key={f.l} x={32} y={f.y} w={48} show={step >= 1} className={TSm}>
            <div className="mb-[0.5cqw] font-semibold text-ink-2">{f.l}</div>
            <div className={field + ' h-[5cqw] tracking-widest text-ink'}>{f.v}</div>
          </At>
        ))}
        <At x={32} y={75} w={26} h={8} show={step >= 1} className={goldBtn(step === 3) + ' ' + TSm}>Change password</At>
        <At x={60} y={75} w={22} h={8} show={step === 3} className={'grid place-items-center rounded-[1cqw] bg-success-soft font-bold text-success ' + TSm}>✓ Password changed</At>
      </>
    );
  },
};

// 6. Groups (HR & admins) -------------------------------------------------------------

export const groups: Demo = {
  id: 'groups',
  title: 'Make a group',
  steps: [
    { caption: 'On Groups, type a name for the new group.', ms: 1700, cursor: { x: 25, y: 22, click: true } },
    { caption: 'Click Create.', ms: 1300, cursor: { x: 86, y: 22, click: true } },
    { caption: 'Choose people from “+ Add member…”.', ms: 1700, cursor: { x: 22, y: 77, click: true } },
    { caption: 'They appear in the group. Now ping the whole group from Overview → A group.', ms: 2600, cursor: { x: 22, y: 77 } },
  ],
  Stage: ({ step }) => (
    <>
      <At x={4} y={6} w={92} h={22} className={card} />
      <At x={8} y={14} w={44} h={10} className={field + ' ' + T + (step === 0 ? ' border-brand shadow-ring' : '')}>
        <span className="text-ink">Design Team</span>
      </At>
      <At x={54} y={14} w={24} h={10} className={field + ' text-ink-3 ' + TSm}>Description</At>
      <At x={80} y={14} w={12} h={10} className={goldBtn(step === 1) + ' ' + T}>Create</At>
      <At x={4} y={34} w={92} h={58} show={step >= 2} className={card + ' ' + (step === 2 ? 'animate-slideIn' : '')} />
      <At x={8} y={40} show={step >= 2} className={'flex items-center gap-[1.2cqw] ' + T}>
        <span className="grid h-[4.4cqw] w-[4.4cqw] place-items-center rounded-[1cqw] bg-inset text-brand">👥</span>
        <span><b className="text-ink">Design Team</b><br /><span className={TSm + ' text-ink-2'}>{step >= 3 ? '2 members' : '0 members'}</span></span>
      </At>
      <At x={8} y={56} show={step >= 3} className={'flex gap-[1cqw] ' + TSm}>
        {['Sneha K', 'Amit V'].map(n => (
          <span key={n} className="flex items-center gap-[0.6cqw] rounded-full bg-inset py-[0.3cqw] pl-[0.4cqw] pr-[1.2cqw] font-semibold text-ink-2"><MiniAvatar name={n} />{n}</span>
        ))}
      </At>
      <At x={8} y={72} w={34} h={10} show={step >= 2} className={field + ' text-ink-2 ' + TSm}>+ Add member…</At>
    </>
  ),
};

// 7. Reset someone's password (admins) ---------------------------------------------------

export const reset: Demo = {
  id: 'reset',
  title: "Reset someone's password",
  steps: [
    { caption: 'On Admin → Users, click Reset password in their row.', ms: 1800, cursor: { x: 78, y: 32, click: true } },
    { caption: 'A strong, easy-to-read password is suggested. Click Copy.', ms: 1800, cursor: { x: 64, y: 50, click: true } },
    { caption: 'Click Reset password.', ms: 1300, cursor: { x: 64, y: 74, click: true } },
    { caption: 'Give it to them privately and ask them to change it after signing in.', ms: 2600, cursor: { x: 64, y: 74 } },
  ],
  Stage: ({ step }) => {
    const dialog = step >= 1;
    return (
      <>
        <At x={4} y={8} className={TLg + ' text-ink'}>Users</At>
        <At x={4} y={22} w={92} h={44} className={card} />
        {[{ n: 'Amit V', u: '@amit' }, { n: 'Sneha K', u: '@sneha' }].map((r, i) => (
          <At key={r.n} x={7} y={26 + i * 18} w={86} h={12} className={'flex items-center gap-[1.2cqw] ' + T}>
            <MiniAvatar name={r.n} />
            <span className="flex-1"><b className="text-ink">{r.n}</b> <span className={TSm + ' text-ink-2'}>{r.u}</span></span>
            <span className={'grid h-[5cqw] w-[18cqw] place-items-center rounded-[1cqw] border border-line font-semibold text-ink ' + TSm + (step === 0 && i === 0 ? ' bg-inset' : ' bg-surface')}><span className="inline-flex items-center gap-[0.5cqw]"><Icon name="key" size={10} className="h-[1.8cqw] w-[1.8cqw]" />Reset password</span></span>
            <span className={TSm + ' font-semibold text-rose'}>Deactivate</span>
          </At>
        ))}
        <At x={0} y={0} w={100} h={100} show={dialog} className="bg-black/50" />
        <At x={24} y={18} w={52} h={68} show={dialog} className={card + ' overflow-hidden shadow-2xl'}>
          <div className="h-[0.8cqw] bg-gold-fill" />
          <div className={'space-y-[1.2cqw] p-[2cqw] ' + T}>
            <div className="flex items-center gap-[1cqw]"><MiniAvatar name="Amit V" /><span><span className={TSm + ' font-extrabold uppercase text-gold'}>Reset password</span><br /><b className="text-ink">Amit V</b></span></div>
            <div className={field + ' h-[5.4cqw] font-bold tracking-wide text-ink'}>Kp7m-Qx4z-Rt9w</div>
          </div>
        </At>
        <At x={28} y={45} w={14} h={7} show={dialog} className={'grid place-items-center rounded-[1cqw] border border-line bg-surface font-semibold text-ink ' + TSm}>Generate</At>
        <At x={58} y={45} w={14} h={7} show={dialog} className={'grid place-items-center rounded-[1cqw] border border-line font-semibold ' + TSm + (step >= 1 && step <= 2 ? ' bg-success-soft text-success' : ' bg-surface text-ink')}>{step >= 1 ? '✓ Copied' : 'Copy'}</At>
        <At x={28} y={57} w={44} show={step === 3} className={'rounded-[1cqw] bg-success-soft px-[1.2cqw] py-[0.8cqw] font-semibold text-success ' + TSm}>✓ Password reset. Share it with Amit privately.</At>
        <At x={52} y={70} w={22} h={8} show={dialog && step < 3} className={goldBtn(step === 2) + ' ' + TSm}>Reset password</At>
      </>
    );
  },
};

export const DEMOS: Record<string, Demo> = {
  [sendPing.id]: sendPing,
  [receive.id]: receive,
  [people.id]: people,
  [status.id]: status,
  [password.id]: password,
  [groups.id]: groups,
  [reset.id]: reset,
};
