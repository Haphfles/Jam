// All synthesis runs on the host. Controllers never construct an AudioContext.
export class BandAudio {
  constructor() { this.nodes = new Set(); this.volume = .65; this.muted = false; }
  async enable() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain(); const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -15; limiter.ratio.value = 10; this.master.connect(limiter); limiter.connect(this.context.destination);
    }
    await this.context.resume(); this.setVolume(this.volume);
  }
  setVolume(value) { this.volume = value; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : value * .5, this.context.currentTime, .015); }
  stop(instrument) { for (const n of this.nodes) if (!instrument || n.instrument === instrument) { try { n.source.stop(); } catch {} } }
  note(instrument, note, at, volume = .75) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.nodes.size > 96 || at < performance.now() - 25) return;
    const t = ctx.currentTime + Math.max(0, at - performance.now()) / 1000;
    const track = (source, filter, gain, duration) => {
      const entry = { source, instrument }; this.nodes.add(entry);
      source.connect(filter); filter.connect(gain); gain.connect(this.master);
      source.onended = () => { this.nodes.delete(entry); source.disconnect(); filter.disconnect(); gain.disconnect(); };
      source.start(t); source.stop(t + duration + .02);
    };
    const tone = (frequency, type, duration, level, slide = 0) => {
      const source = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
      source.type = type; source.frequency.setValueAtTime(frequency, t);
      if (slide) source.frequency.exponentialRampToValueAtTime(slide, t + duration * .65);
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(type === 'sawtooth' ? 2300 : 6000, t);
      filter.frequency.exponentialRampToValueAtTime(type === 'sawtooth' ? 350 : 1800, t + duration);
      gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(Math.max(.0002, level * volume), t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      track(source, filter, gain, duration);
    };
    const noise = (duration, highpass, level) => {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(); source.buffer = buffer;
      filter.type = 'highpass'; filter.frequency.value = highpass; gain.gain.setValueAtTime(Math.max(.0002, level * volume), t); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      track(source, filter, gain, duration);
    };
    const f = 130.8128 * 2 ** ([0, 3, 5, 7, 10, 12, 15, 17][note] / 12);
    if (instrument === 'guitar') { tone(f * 2, 'triangle', 1.25, .25); tone(f * 4, 'sine', .35, .07); }
    if (instrument === 'bass') tone(f / 2, 'triangle', .65, .4);
    if (instrument === 'synth') { tone(f * 2, 'sawtooth', .8, .11); tone(f * 2.008, 'triangle', .85, .12); }
    if (instrument === 'drums') {
      if (note === 0) tone(150, 'sine', .38, .75, 42);
      if (note === 1) { noise(.18, 1200, .28); tone(180, 'triangle', .13, .17); }
      if (note === 2) noise(.055, 7000, .22);
      if (note === 3) noise(.32, 6500, .18);
      if (note === 4) tone(160, 'sine', .32, .45, 70);
      if (note === 5) tone(240, 'sine', .24, .35, 110);
      if (note === 6) noise(.12, 950, .3);
      if (note === 7) noise(.95, 4000, .16);
    }
    if (instrument === 'percussion') {
      if (note === 0) tone(300, 'sine', .2, .4, 150);
      if (note === 1) tone(470, 'sine', .14, .35, 270);
      if (note === 2) noise(.09, 6000, .19);
      if (note === 3) tone(1700, 'sine', .07, .3);
      if (note === 4) { tone(540, 'square', .15, .08); tone(800, 'square', .13, .05); }
      if (note === 5) noise(.23, 8000, .18);
      if (note === 6) tone(850, 'triangle', .08, .3);
      if (note === 7) { tone(1046.5, 'sine', 1.5, .2); tone(1569.8, 'sine', .65, .06); }
    }
  }
}
