// Sound, synthesised with WebAudio: no audio files, no network. A shared noise
// buffer and a few oscillators make every shot, reload, hit, beep and blast.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noise(when, dur, filterFreq, gain, type = 'lowpass') {
    const c = ensure();
    if (!c || muted) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(when);
    src.stop(when + dur);
  }

  function tone(when, dur, freq, freqEnd, gain, type = 'sine') {
    const c = ensure();
    if (!c || muted) return;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, when + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g).connect(c.destination);
    osc.start(when);
    osc.stop(when + dur);
  }

  return {
    unlock() { ensure(); },
    setMuted(value) { muted = value; },
    shot(kind) {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      if (kind === 'dmr') {
        noise(now, 0.22, 900, 0.5);
        tone(now, 0.18, 160, 50, 0.4, 'triangle');
      } else if (kind === 'smg') {
        noise(now, 0.08, 2400, 0.28);
        tone(now, 0.06, 220, 90, 0.2, 'square');
      } else {
        noise(now, 0.12, 1600, 0.38);
        tone(now, 0.1, 190, 70, 0.3, 'triangle');
      }
    },
    enemyShot(distance) {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      const gain = Math.max(0.04, 0.3 - distance * 0.006);
      noise(now, 0.1, 1400, gain);
    },
    reload() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      tone(now, 0.05, 900, 500, 0.12, 'square');
      tone(now + 0.5, 0.05, 700, 400, 0.12, 'square');
    },
    hit() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 0.06, 1400, 1400, 0.15, 'square');
    },
    kill() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      tone(now, 0.09, 880, 880, 0.15, 'sine');
      tone(now + 0.09, 0.14, 1320, 1320, 0.15, 'sine');
    },
    hurt() {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, 0.15, 220, 110, 0.25, 'sawtooth');
    },
    explosion() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      noise(now, 0.9, 300, 0.7);
      tone(now, 0.7, 90, 30, 0.5, 'sine');
    },
    beep(final) {
      const c = ensure();
      if (!c) return;
      tone(c.currentTime, final ? 0.3 : 0.09, final ? 1500 : 1000, null, 0.16, 'square');
    },
    plant() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      for (let i = 0; i < 4; i += 1) tone(now + i * 0.18, 0.08, 1200, null, 0.14, 'square');
    },
    roundWin() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      [523, 659, 784].forEach((f, i) => tone(now + i * 0.12, 0.22, f, null, 0.16, 'triangle'));
    },
    roundLose() {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime;
      [392, 330, 262].forEach((f, i) => tone(now + i * 0.14, 0.24, f, null, 0.15, 'triangle'));
    },
    step() {
      const c = ensure();
      if (!c) return;
      noise(c.currentTime, 0.03, 500, 0.03);
    },
  };
}
