// Ping and message sounds, made with WebAudio so there are no files to ship.
// Normal ping: a rising three-note bell ("ping-ping-PING"), played twice.
// Urgent ping: a hi–lo alarm, three times over.
// Chat message: a soft "blip-blip" that slides up in pitch.
// All sit around 1–1.6 kHz, where laptop speakers are loudest, and go
// through a compressor so they can be loud without crackling.

type Priority = 'NORMAL' | 'URGENT';

let ctx: AudioContext | null = null;
let out: AudioNode | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC() as AudioContext;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 6;
  comp.ratio.value = 12;
  comp.attack.value = 0.002;
  comp.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp);
  comp.connect(ctx.destination);
  out = master;
  return ctx;
}

// Browsers keep a page silent until it has been clicked or typed in once.
// The autostart window opens by itself, so unlock on the first interaction
// anywhere in the app; a ping that arrives later is then heard.
export function primeSound(): () => void {
  if (typeof window === 'undefined') return () => {};
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const stop = (): void => events.forEach(e => window.removeEventListener(e, unlock));
  function unlock(): void {
    const c = audio();
    if (!c) return stop();
    c.resume().then(() => { if (c.state === 'running') stop(); }, () => {});
  }
  events.forEach(e => window.addEventListener(e, unlock, { passive: true }));
  return stop;
}

export function playPingSound(priority: Priority) {
  start((c, t) => (priority === 'URGENT' ? alarm : bells)(c, t));
}

// A chat message: a short soft "blip-blip", quieter than any ping. A burst
// of messages makes one sound, not one each.
let lastMessageSound = 0;
export function playMessageSound() {
  if (Date.now() - lastMessageSound < 3000) return;
  lastMessageSound = Date.now();
  start(blips);
}

function start(sound: (c: AudioContext, t: number) => void) {
  if (typeof window === 'undefined') return;
  const c = audio();
  if (!c) return;
  const play = () => sound(c, c.currentTime + 0.03);
  if (c.state === 'running') return play();
  // Not unlocked yet: resume() waits for the next click, and a chime
  // that late would be confusing, so only play if it starts straight away.
  const asked = Date.now();
  c.resume().then(() => { if (Date.now() - asked < 1000) play(); }, () => {});
}

function bells(c: AudioContext, t: number) {
  const notes = [1047, 1319, 1568]; // C6, E6, G6
  for (const start of [0, 0.85]) {
    notes.forEach((f, i) => bell(c, f, t + start + i * 0.11, i === 2 ? 0.7 : 0.35, 0.6));
  }
}

function alarm(c: AudioContext, t: number) {
  for (const start of [0, 0.8, 1.6]) {
    [1568, 1047, 1568, 1047].forEach((f, i) => buzz(c, f, t + start + i * 0.16, 0.14, 0.35));
  }
}

function blips(c: AudioContext, t: number) {
  blip(c, 700, 1050, t, 0.1, 0.4);
  blip(c, 900, 1350, t + 0.13, 0.12, 0.4);
}

// A short tone that slides up in pitch: a "bubble", unlike the ping bells.
function blip(c: AudioContext, from: number, to: number, t: number, dur: number, level: number) {
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(level, t + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(out!);
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
  o.connect(env);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// A struck bell: quick attack, ringing decay, with overtones for a bright edge.
function bell(c: AudioContext, freq: number, t: number, dur: number, level: number) {
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(level, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(out!);
  const partials: [number, OscillatorType, number][] = [[1, 'triangle', 1], [2, 'sine', 0.35], [2.76, 'sine', 0.12]];
  for (const [mult, type, amp] of partials) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq * mult;
    const g = c.createGain();
    g.gain.value = amp;
    o.connect(g);
    g.connect(env);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

// A flat square-wave tone: harsh on purpose, so urgent never sounds like normal.
function buzz(c: AudioContext, freq: number, t: number, dur: number, level: number) {
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(level, t + 0.01);
  env.gain.setValueAtTime(level, t + dur - 0.03);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(out!);
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.value = freq;
  o.connect(env);
  o.start(t);
  o.stop(t + dur + 0.02);
}
