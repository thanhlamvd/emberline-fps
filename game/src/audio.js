// Sound, synthesised: no audio files ship with the game, every effect is a
// WebAudio oscillator or filtered noise burst built at run time. The context is
// created on the first user gesture, so loading the page stays silent.
let ctx = null;
let master = null;
let noiseBuf = null;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

function burst(dur, filterFreq, gain, type = 'lowpass') {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(filter).connect(g).connect(master);
  src.start();
  src.stop(ctx.currentTime + dur);
}

function tone(freq, dur, gain, type = 'square', slideTo = 0) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(g).connect(master);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

export const sfx = {
  shot(kind) {
    if (kind === 'longbow') { burst(0.22, 900, 0.5); tone(160, 0.16, 0.25, 'sawtooth', 60); }
    else if (kind === 'rook') { burst(0.09, 2400, 0.28); tone(320, 0.05, 0.12, 'square', 180); }
    else if (kind === 'p9') { burst(0.1, 1800, 0.32); tone(240, 0.06, 0.14, 'square', 120); }
    else { burst(0.12, 1500, 0.36); tone(200, 0.08, 0.16, 'square', 90); }
  },
  dry() { tone(1200, 0.03, 0.1, 'square'); },
  reload() { tone(900, 0.04, 0.12, 'square'); setTimeout(() => tone(600, 0.04, 0.12, 'square'), 160); },
  hit() { tone(1600, 0.05, 0.16, 'sine'); },
  kill() { tone(880, 0.08, 0.18, 'sine'); setTimeout(() => tone(1320, 0.1, 0.18, 'sine'), 70); },
  hurt() { burst(0.15, 500, 0.3); tone(110, 0.12, 0.2, 'sawtooth', 70); },
  explode() { burst(0.9, 400, 0.7); tone(90, 0.7, 0.4, 'sine', 35); },
  beep() { tone(1250, 0.07, 0.14, 'sine'); },
  plant() { tone(700, 0.1, 0.16, 'sine'); setTimeout(() => tone(1050, 0.12, 0.16, 'sine'), 120); },
  buy() { tone(660, 0.06, 0.14, 'sine'); setTimeout(() => tone(990, 0.08, 0.14, 'sine'), 60); },
  win() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.16, 'sine'), i * 110)); },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.14, 'sine'), i * 120)); },
  step() { burst(0.05, 700, 0.07); },
  bounce() { tone(300, 0.05, 0.1, 'sine', 180); },
};
