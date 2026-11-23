// Tiny synthesized sound effects (no audio files needed)
let ctx = null;
let master = null;
let noiseBuf = null;

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function getNoise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise({ dur = 0.2, freq = 1000, freqEnd, q = 1, type = 'lowpass', vol = 0.5, attack = 0.002, delay = 0 }) {
  if (!ctx || vol <= 0.001) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = getNoise();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function tone({ freq = 440, freqEnd, dur = 0.15, type = 'sine', vol = 0.3, delay = 0 }) {
  if (!ctx || vol <= 0.001) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  pistol(v = 1) {
    noise({ dur: 0.12, freq: 3500, freqEnd: 400, vol: 0.45 * v });
    tone({ freq: 900, freqEnd: 180, dur: 0.06, type: 'square', vol: 0.07 * v });
  },
  sniper(v = 1) {
    noise({ dur: 0.55, freq: 2500, freqEnd: 120, vol: 0.9 * v });
    tone({ freq: 160, freqEnd: 40, dur: 0.4, type: 'sawtooth', vol: 0.25 * v });
  },
  shotgun(v = 1) {
    noise({ dur: 0.35, freq: 1800, freqEnd: 150, vol: 0.85 * v });
    tone({ freq: 110, freqEnd: 35, dur: 0.25, type: 'sawtooth', vol: 0.3 * v });
  },
  pump(v = 1) {
    noise({ dur: 0.06, freq: 1200, freqEnd: 900, type: 'bandpass', q: 3, vol: 0.25 * v, delay: 0.25 });
    noise({ dur: 0.07, freq: 900, freqEnd: 1400, type: 'bandpass', q: 3, vol: 0.25 * v, delay: 0.38 });
  },
  swing(v = 1) {
    noise({ dur: 0.25, freq: 500, freqEnd: 3000, type: 'bandpass', q: 2, vol: 0.4 * v, attack: 0.06 });
  },
  punch(v = 1) {
    noise({ dur: 0.12, freq: 400, freqEnd: 1500, type: 'bandpass', q: 1.5, vol: 0.3 * v, attack: 0.03 });
  },
  slash() {
    noise({ dur: 0.2, freq: 5000, freqEnd: 800, type: 'highpass', vol: 0.35 });
    tone({ freq: 200, freqEnd: 60, dur: 0.15, type: 'triangle', vol: 0.35 });
  },
  thud() {
    noise({ dur: 0.1, freq: 700, vol: 0.5 });
    tone({ freq: 140, freqEnd: 60, dur: 0.12, type: 'triangle', vol: 0.4 });
  },
  hitmark() { tone({ freq: 1500, dur: 0.05, type: 'square', vol: 0.05 }); },
  headshot() {
    tone({ freq: 1800, dur: 0.12, vol: 0.2 });
    tone({ freq: 2600, dur: 0.25, vol: 0.15, delay: 0.06 });
  },
  hurt() {
    tone({ freq: 220, freqEnd: 100, dur: 0.2, type: 'sawtooth', vol: 0.12 });
    noise({ dur: 0.1, freq: 500, vol: 0.3 });
  },
  empty() { tone({ freq: 1300, dur: 0.03, type: 'square', vol: 0.07 }); },
  reload() {
    tone({ freq: 500, dur: 0.04, type: 'square', vol: 0.07 });
    tone({ freq: 750, dur: 0.04, type: 'square', vol: 0.07, delay: 0.18 });
  },
  beep(hi) { tone({ freq: hi ? 880 : 440, dur: hi ? 0.45 : 0.15, type: 'square', vol: 0.08 }); },
  roundWin() { [660, 880].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'triangle', vol: 0.15, delay: i * 0.1 })); },
  roundLose() { [330, 220].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.15, delay: i * 0.12 })); },
  dash(v = 1) {
    noise({ dur: 0.25, freq: 300, freqEnd: 4000, type: 'bandpass', q: 1, vol: 0.5 * v, attack: 0.02 });
  },
  deflectOn(v = 1) { tone({ freq: 600, freqEnd: 1300, dur: 0.22, type: 'triangle', vol: 0.15 * v }); },
  deflect() {
    tone({ freq: 2400, freqEnd: 1800, dur: 0.12, type: 'square', vol: 0.07 });
    noise({ dur: 0.08, freq: 6000, type: 'highpass', vol: 0.3 });
  },
  parry() {
    tone({ freq: 1600, dur: 0.35, type: 'triangle', vol: 0.25 });
    tone({ freq: 2400, dur: 0.35, vol: 0.15 });
    noise({ dur: 0.1, freq: 7000, type: 'highpass', vol: 0.4 });
  },
  ult(v = 1) {
    [220, 330, 440, 660].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'sawtooth', vol: 0.08 * v, delay: i * 0.06 }));
  },
  ultReady() { [880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.12, delay: i * 0.09 })); },
  shield(v = 1) { tone({ freq: 200, freqEnd: 520, dur: 0.35, vol: 0.3 * v }); },
  explode(v = 1) {
    noise({ dur: 0.6, freq: 1500, freqEnd: 80, vol: 0.9 * v });
    tone({ freq: 90, freqEnd: 30, dur: 0.5, vol: 0.5 * v });
  },
  throw(v = 1) { noise({ dur: 0.15, freq: 800, freqEnd: 300, type: 'bandpass', vol: 0.3 * v }); },
  grapple(v = 1) {
    tone({ freq: 300, freqEnd: 1200, dur: 0.25, type: 'square', vol: 0.06 * v });
    noise({ dur: 0.3, freq: 2000, type: 'highpass', vol: 0.2 * v });
  },
  recon(v = 1) {
    tone({ freq: 1000, dur: 0.4, vol: 0.15 * v });
    tone({ freq: 1000, dur: 0.4, vol: 0.1 * v, delay: 0.25 });
  },
  rail(v = 1) {
    noise({ dur: 0.5, freq: 4000, freqEnd: 200, vol: 0.8 * v });
    tone({ freq: 1800, freqEnd: 120, dur: 0.4, type: 'sawtooth', vol: 0.15 * v });
  },
  denied() { tone({ freq: 180, dur: 0.08, type: 'square', vol: 0.06 }); },
  stun() { tone({ freq: 3000, freqEnd: 2700, dur: 1.2, vol: 0.06 }); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.15, delay: i * 0.12 })); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'triangle', vol: 0.15, delay: i * 0.15 })); },
};
