import { PhoneChannel, randomId, validId } from './channel.mjs';
import { INSTRUMENTS, Seats, InputGate, MusicalClock, LoopTrack, INPUT_DELAY } from './music-core.mjs';
export class HostSession {
  constructor(config, audio, { change = () => {}, status = () => {}, flash = () => {}, ChannelClass = PhoneChannel } = {}) {
    Object.assign(this, { audio, change, status, flash });
    this.room = randomId(); this.id = randomId(); this.epoch = randomId(); this.revision = 0;
    this.seats = new Seats(); this.gate = new InputGate(); this.clock = new MusicalClock();
    this.tracks = Object.fromEntries(INSTRUMENTS.map(i => [i, new LoopTrack()]));
    this.local = null;
    this.channel = new ChannelClass(config, this.room, this.id, {
      message: m => this.receive(m),
      status: (s, error) => { this.network = s; status(s, error); if (s !== 'ready') this.stop(); }
    });
    this.pulse = setInterval(() => this.heartbeat(), 750);
    this.scheduler = setInterval(() => this.schedule(), 25);
  }
  start() {
    if (this.audio.context?.state !== 'running') throw Error('Enable host sound first.');
    this.epoch = randomId(); this.clock.start(performance.now());
    for (const track of Object.values(this.tracks)) { track.stop(); if (track.pattern.length) { track.mode = 'loop'; track.playFrom = 0; } }
    this.publish(true);
  }
  stop() {
    if (!this.clock.running) return;
    this.clock.stop(); this.epoch = randomId(); this.audio.stop();
    for (const track of Object.values(this.tracks)) track.stop();
    this.publish(true);
  }
  setTempo(value) {
    if (this.clock.running) throw Error('Stop the transport before changing tempo.');
    if (!Number.isInteger(value) || value < 50 || value > 180) throw Error('Choose a tempo between 50 and 180 BPM.');
    this.clock.bpm = value; this.publish(true);
  }
  localInstrument(instrument) {
    if (instrument === this.local) return;
    if (instrument && (!INSTRUMENTS.includes(instrument) || this.seats.slots[instrument])) throw Error('That instrument is occupied.');
    if (this.local) this.release(this.id);
    if (!instrument) { this.local = null; this.change(); return; }
    if (!INSTRUMENTS.includes(instrument) || this.seats.slots[instrument]) throw Error('That instrument is occupied.');
    this.seats.join(this.id, 'Host keyboard', instrument, performance.now()); this.local = instrument; this.publish(true);
  }
  localNote(note) {
    if (!this.local || !this.clock.running) return;
    this.perform(this.local, note, performance.now() + INPUT_DELAY);
  }
  perform(instrument, note, target) {
    const track = this.tracks[instrument]; track.capture(note, target, this.clock);
    this.audio.note(instrument, note, target, track.volume); this.flash(instrument, note);
  }
  schedule() {
    if (this.audio.context?.state !== 'running') { this.stop(); return; }
    for (const tick of this.clock.due(performance.now())) {
      for (const instrument of INSTRUMENTS) for (const note of this.tracks[instrument].tick(tick.step)) {
        this.audio.note(instrument, note, tick.at, this.tracks[instrument].volume); this.flash(instrument, note);
      }
    }
  }
  command(instrument, action, value) {
    const track = this.tracks[instrument]; if (!track) throw Error('No instrument assigned.');
    if (action === 'record') { if (!this.clock.running) throw Error('Ask the host to start the clock first.'); this.audio.stop(instrument); track.record(this.clock, performance.now()); }
    else if (action === 'loop-start') { if (!this.clock.running) throw Error('Ask the host to start the clock first.'); track.start(this.clock, performance.now()); }
    else if (action === 'loop-stop') { track.stop(); this.audio.stop(instrument); }
    else if (action === 'clear') { track.clear(); this.audio.stop(instrument); }
    else if (action === 'volume') { if (!Number.isFinite(value) || value < 0 || value > 1) throw Error('Invalid volume.'); track.volume = value; }
    else throw Error('Unknown control.');
    this.publish(true);
  }
  receive(m) {
    const now = performance.now();
    if (!validId(m.from)) return;
    if (m.type === 'hello') {
      try { this.seats.join(m.from, m.name, m.preferred, now); this.publish(true); }
      catch (e) { this.channel.reliable({ type: 'rejected', error: e.message }, m.from).catch(() => {}); }
      return;
    }
    const player = this.seats.players.get(m.from); if (!player) return;
    player.seen = now;
    if (m.type === 'ping' && Number.isFinite(m.t0) && validId(m.ping)) {
      this.channel.send({ type: 'pong', ping: m.ping, t0: m.t0, hostTime: performance.now(), epoch: this.epoch }, m.from); return;
    }
    if (m.type === 'leave') { this.release(m.from); return; }
    if (m.type === 'note' && player.instrument && this.clock.running) {
      const target = this.gate.accept(m.from, m, now, this.epoch);
      if (target !== null) this.perform(player.instrument, m.note, target);
      return;
    }
    if (m.type === 'command' && Number.isSafeInteger(m.commandSeq)) {
      let error = null;
      if (m.epoch !== this.epoch) error = 'The clock changed. Try the control again.';
      else if (m.commandSeq <= player.command) error = 'That control was superseded. Try again.';
      else {
        player.command = m.commandSeq;
        try { this.command(player.instrument, m.action, m.value); } catch (e) { error = e.message; }
      }
      this.channel.reliable({ type: 'result', commandSeq: m.commandSeq, error }, m.from).catch(() => {});
    }
  }
  release(id) {
    const instrument = this.seats.leave(id);
    if (instrument) { this.tracks[instrument].clear(); this.audio.stop(instrument); }
    this.gate.forget(id);
    if (id === this.id) this.local = null;
    this.publish(true);
  }
  remove(id) {
    if (id !== this.id) this.channel.reliable({ type: 'removed' }, id).catch(() => {});
    this.release(id);
  }
  snapshot(peer) {
    const now = performance.now();
    return { type: 'state', revision: ++this.revision, epoch: this.epoch, running: this.clock.running, bpm: this.clock.bpm, origin: this.clock.origin, now,
      instrument: this.seats.players.get(peer)?.instrument || null, position: this.seats.queue.indexOf(peer) + 1,
      slots: Object.fromEntries(INSTRUMENTS.map(i => [i, this.seats.slots[i] ? { name: this.seats.players.get(this.seats.slots[i]).name } : null])),
      loops: Object.fromEntries(INSTRUMENTS.map(i => [i, { mode: this.tracks[i].mode, label: this.tracks[i].label(this.clock, now), count: this.tracks[i].pattern.length, volume: this.tracks[i].volume }])), dropped: this.gate.dropped };
  }
  publish(reliable = false) {
    if (this.channel?.ready) for (const peer of this.seats.players.keys()) {
      if (peer === this.id) continue;
      const snapshot = this.snapshot(peer);
      if (reliable) this.channel.reliable(snapshot, peer).catch(() => {});
      else this.channel.send(snapshot, peer);
    }
    this.change();
  }
  heartbeat() {
    const local = this.seats.players.get(this.id); if (local) local.seen = performance.now();
    for (const id of this.seats.expire(performance.now())) this.release(id);
    this.publish();
  }
  close() {
    this.stop(); clearInterval(this.pulse); clearInterval(this.scheduler);
    for (const peer of this.seats.players.keys()) this.channel.send({ type: 'ended' }, peer);
    this.channel.close(); this.audio.stop();
  }
}
