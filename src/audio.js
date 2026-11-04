// Tiny procedural sound engine. No external assets, no autoplay issues:
// the AudioContext is created on the first user gesture.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.gates = Object.create(null);
    this.noiseBuffer = null;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.ctx.currentTime, 0.02);
    }
  }

  makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.4);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  gate(key, ms) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (this.gates[key] && (now - this.gates[key]) * 1000 < ms) return false;
    this.gates[key] = now;
    return true;
  }

  tone(freq, duration, opts = {}) {
    if (!this.ctx || this.muted) return;
    const {
      type = 'sine',
      volume = 0.06,
      slideTo = null,
      delay = 0,
      attack = 0.008,
    } = opts;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  noise(duration, opts = {}) {
    if (!this.ctx || this.muted) return;
    const {
      volume = 0.05,
      type = 'lowpass',
      frequency = 1200,
      slideTo = null,
      delay = 0,
    } = opts;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, t0);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  ui() {
    if (!this.gate('ui', 40)) return;
    this.tone(520, 0.045, { type: 'square', volume: 0.018, slideTo: 760 });
  }

  upgrade() {
    const notes = [392, 523.25, 659.25, 783.99];
    notes.forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', volume: 0.05, delay: i * 0.055 }));
    this.noise(0.25, { volume: 0.02, type: 'highpass', frequency: 2400 });
  }

  reforge() {
    this.noise(0.3, { volume: 0.05, type: 'bandpass', frequency: 500, slideTo: 3000 });
    [261.6, 392, 523.25].forEach((f, i) =>
      this.tone(f, 0.32, { type: 'sawtooth', volume: 0.028, delay: 0.05 + i * 0.04, slideTo: f * 1.5 }),
    );
  }

  waveStart(boss = false) {
    this.tone(boss ? 55 : 70, 0.5, { type: 'sawtooth', volume: 0.06, slideTo: boss ? 90 : 110 });
    this.noise(0.5, { volume: 0.03, type: 'lowpass', frequency: 400 });
    if (boss) {
      this.tone(110, 0.8, { type: 'square', volume: 0.035, delay: 0.15, slideTo: 82 });
    }
  }

  waveClear() {
    [523.25, 659.25, 783.99].forEach((f, i) =>
      this.tone(f, 0.24, { type: 'triangle', volume: 0.04, delay: i * 0.07 }),
    );
  }

  shoot(form) {
    const gates = { pulse: 38, mortar: 100, cryo: 70, blaze: 80, tesla: 90, rail: 120 };
    if (!this.gate(`shoot-${form}`, gates[form] || 60)) return;
    switch (form) {
      case 'pulse':
        this.tone(980, 0.05, { type: 'triangle', volume: 0.022, slideTo: 1500 });
        break;
      case 'mortar':
        this.tone(120, 0.18, { type: 'sine', volume: 0.1, slideTo: 48 });
        this.noise(0.16, { volume: 0.055, type: 'lowpass', frequency: 700 });
        break;
      case 'cryo':
        this.tone(1500, 0.09, { type: 'sine', volume: 0.03, slideTo: 850 });
        this.noise(0.08, { volume: 0.02, type: 'highpass', frequency: 3200 });
        break;
      case 'blaze':
        this.noise(0.12, { volume: 0.028, type: 'bandpass', frequency: 900 });
        this.tone(180, 0.09, { type: 'sawtooth', volume: 0.012, slideTo: 120 });
        break;
      case 'tesla':
        this.tone(220, 0.1, { type: 'sawtooth', volume: 0.035, slideTo: 70 });
        this.noise(0.08, { volume: 0.03, type: 'highpass', frequency: 2500 });
        break;
      case 'rail':
        this.tone(95, 0.24, { type: 'sawtooth', volume: 0.07, slideTo: 34 });
        this.noise(0.22, { volume: 0.05, type: 'bandpass', frequency: 1800, slideTo: 300 });
        break;
      default:
        break;
    }
  }

  impact() {
    if (!this.gate('impact', 45)) return;
    this.noise(0.05, { volume: 0.018, type: 'highpass', frequency: 1800 });
  }

  death() {
    if (!this.gate('death', 45)) return;
    this.noise(0.12, { volume: 0.035, type: 'lowpass', frequency: 1400, slideTo: 300 });
    this.tone(260, 0.12, { type: 'square', volume: 0.02, slideTo: 90 });
  }

  bossDeath() {
    this.noise(0.8, { volume: 0.1, type: 'lowpass', frequency: 1200, slideTo: 80 });
    this.tone(80, 0.8, { type: 'sawtooth', volume: 0.08, slideTo: 30 });
    this.tone(180, 0.45, { type: 'square', volume: 0.04, slideTo: 45, delay: 0.1 });
  }

  leak() {
    this.tone(440, 0.16, { type: 'square', volume: 0.05 });
    this.tone(330, 0.24, { type: 'square', volume: 0.05, delay: 0.16 });
  }

  victory() {
    [261.6, 329.6, 392, 523.25, 659.25].forEach((f, i) =>
      this.tone(f, 0.5, { type: 'triangle', volume: 0.05, delay: i * 0.12 }),
    );
  }

  defeat() {
    [330, 277, 220, 165].forEach((f, i) =>
      this.tone(f, 0.4, { type: 'sawtooth', volume: 0.04, delay: i * 0.14 }),
    );
  }
}
