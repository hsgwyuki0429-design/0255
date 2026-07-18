// WebAudio による全効果音のプロシージャル生成 (音声ファイル不要)
let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

function now() { return ctx ? ctx.currentTime : 0; }

function tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, when = 0) {
  if (!ctx) return;
  const t = now() + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.3, freq = 1000, q = 1, when = 0) {
  if (!ctx) return;
  const t = now() + when;
  const len = Math.max(1, ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export const SFX = {
  hit()        { tone(880, 0.1, 'square', 0.3, 440); noise(0.08, 0.3, 3000, 1); },
  jump()       { tone(240, 0.18, 'sine', 0.25, 480); },
  land()       { noise(0.1, 0.25, 300, 0.7); },
  step(alt)    { noise(0.045, 0.09, alt ? 700 : 550, 1.2); },
  jailed()     { tone(440, 0.16, 'sawtooth', 0.25, 220); tone(330, 0.2, 'sawtooth', 0.25, 165, 0.14); tone(220, 0.35, 'sawtooth', 0.25, 110, 0.3); },
  rescued()    { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.25, null, i * 0.07)); },
  frozen()     { [1800, 2400, 3000].forEach((f, i) => tone(f, 0.2, 'sine', 0.18, f * 0.8, i * 0.05)); noise(0.25, 0.15, 4000, 2); },
  unfrozen()   { [3000, 2200, 1500].forEach((f, i) => tone(f, 0.12, 'sine', 0.16, f * 1.2, i * 0.05)); },
  swapped()    { tone(200, 0.3, 'sawtooth', 0.3, 600); tone(600, 0.2, 'square', 0.2, 300, 0.2); },
  countdown()  { tone(880, 0.12, 'square', 0.3); },
  go()         { tone(1320, 0.4, 'square', 0.35); tone(1760, 0.3, 'square', 0.2, null, 0.05); },
  tick()       { tone(1200, 0.05, 'square', 0.15); },
  win()        { [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.3, null, i * 0.12)); },
  lose()       { [400, 350, 300, 250].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.22, f * 0.9, i * 0.15)); },
  join()       { tone(660, 0.1, 'triangle', 0.2); tone(880, 0.1, 'triangle', 0.2, null, 0.08); },
  touch()      { tone(1046, 0.1, 'triangle', 0.25); tone(1319, 0.12, 'triangle', 0.22, null, 0.06); }
};
