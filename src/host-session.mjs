import { DirectLink } from './direct-link.mjs';
import { PhoneChannel, randomId, validId } from './channel.mjs';
import { INSTRUMENTS, Seats, InputGate } from './music-core.mjs';
export class HostSession {
  constructor(config, audio, { change = () => {}, status = () => {}, flash = () => {}, ChannelClass = PhoneChannel, DirectClass = DirectLink } = {}) {
    Object.assign(this, { audio, change, status, flash, DirectClass }); this.direct = new Map(); this.attempts = new Map(); this.generation = 0;
    this.room = randomId(); this.id = randomId(); this.epoch = randomId(); this.revision = 0; this.performanceSeq = 0;
    this.seats = new Seats(); this.gate = new InputGate(); this.running = false;
    this.volumes = Object.fromEntries(INSTRUMENTS.map(i => [i, .75]));
    this.local = null;
    this.channel = new ChannelClass(config, this.room, this.id, {
      message: m => this.receive(m),
      status: (s, error) => { this.network = s; status(s, error); if (s !== 'ready') { this.stop(); for (const link of this.direct.values()) link.close(); } }
    });
    this.pulse = setInterval(() => this.heartbeat(), 750);
  }
  start() {
    if (this.audio.context?.state !== 'running') throw Error('Enable host sound first.');
    this.epoch = randomId(); this.running = true; this.publish(true);
  }
  stop() {
    if (!this.running) return;
    this.running = false; this.epoch = randomId(); this.audio.stop(); this.publish(true);
  }
  ensureDirect(peer) {
    if (peer === this.id || !this.seats.players.get(peer)?.instrument || !this.channel?.ready) return;
    const old = this.direct.get(peer);
    if (old && !old.closed) return;
    if (performance.now() - (this.attempts.get(peer) ?? -Infinity) < 15000) return;
    this.attempts.set(peer, performance.now());
    const link = new this.DirectClass({ session: randomId(), generation: ++this.generation, initiator: true,
      signal: m => this.channel.reliable(m, peer),
      message: m => this.receive({ ...m, from: peer }, 'direct'), status: () => this.change() });
    this.direct.set(peer, link);
  }
  localInstrument(instrument) {
    if (instrument === this.local) return;
    if (instrument && (!INSTRUMENTS.includes(instrument) || this.seats.slots[instrument])) throw Error('That instrument is occupied.');
    if (this.local) this.release(this.id);
    if (!instrument) { this.local = null; this.change(); return; }
    if (!INSTRUMENTS.includes(instrument) || this.seats.slots[instrument]) throw Error('That instrument is occupied.');
    this.seats.join(this.id, 'Playing here', instrument, performance.now()); this.local = instrument; this.publish(true);
  }
  localNote(note) {
    if (!this.local || !this.running) return;
    this.perform(this.local, note, performance.now() + 2);
  }
  perform(instrument, note, target, origin = this.id) {
    this.audio.note(instrument, note, target, this.volumes[instrument]); this.flash(instrument, note);
    const message = { type: 'performance', epoch: this.epoch, seq: ++this.performanceSeq, instrument, note, at: target, volume: this.volumes[instrument] };
    for (const peer of this.seats.players.keys()) {
      if (peer === this.id || peer === origin) continue;
      const link = this.direct.get(peer);
      if (link?.ready) link.send(message);
      else if (!(this.channel.ws?.bufferedAmount > 1024)) this.channel.send(message, peer);
    }
  }
  command(instrument, action, value) {
    if (!INSTRUMENTS.includes(instrument)) throw Error('No instrument assigned.');
    if (action !== 'volume') throw Error('Unknown control.');
    if (!Number.isFinite(value) || value < 0 || value > 1) throw Error('Invalid volume.');
    this.volumes[instrument] = value; this.publish(true);
  }
  receive(m, path = 'relay') {
    const now = performance.now();
    if (!validId(m.from)) return;
    if (m.type === 'hello') {
      try { this.seats.join(m.from, m.name, m.preferred, now); this.publish(true); this.ensureDirect(m.from); }
      catch (e) { this.channel.reliable({ type: 'rejected', error: e.message }, m.from).catch(() => {}); }
      return;
    }
    const player = this.seats.players.get(m.from); if (!player) return;
    player.seen = now;
    if (m.type === 'rtc') {
      const link = this.direct.get(m.from);
      if (link && m.session === link.session && m.description?.type === 'answer') link.accept(m.description);
      return;
    }
    if (m.type === 'ping' && Number.isFinite(m.t0) && validId(m.ping)) {
      const pong = { type: 'pong', ping: m.ping, t0: m.t0, hostTime: performance.now(), epoch: this.epoch };
      if (path === 'direct') this.direct.get(m.from)?.send(pong); else this.channel.send(pong, m.from); return;
    }
    if (m.type === 'leave') { this.release(m.from); return; }
    if (m.type === 'note' && player.instrument && this.running) {
      const target = this.gate.accept(m.from, m, now, this.epoch, path);
      if (target !== null) this.perform(player.instrument, m.note, target, m.localAudio === true ? m.from : null);
      return;
    }
    if (m.type === 'command' && Number.isSafeInteger(m.commandSeq)) {
      let error = null;
      if (m.epoch !== this.epoch) error = 'The stage changed. Try the control again.';
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
    if (instrument) { this.volumes[instrument] = .75; this.audio.stop(instrument); }
    this.direct.get(id)?.close(); this.direct.delete(id); this.attempts.delete(id);
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
    return { type: 'state', revision: ++this.revision, epoch: this.epoch, running: this.running, now,
      instrument: this.seats.players.get(peer)?.instrument || null, position: this.seats.queue.indexOf(peer) + 1,
      slots: Object.fromEntries(INSTRUMENTS.map(i => [i, this.seats.slots[i] ? { name: this.seats.players.get(this.seats.slots[i]).name } : null])),
      volumes: { ...this.volumes }, dropped: this.gate.dropped };
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
    for (const peer of this.seats.players.keys()) this.ensureDirect(peer);
    if (this.audio.context?.state !== 'running') this.stop();
    this.publish();
  }
  close() {
    this.stop(); clearInterval(this.pulse);
    for (const peer of this.seats.players.keys()) this.channel.send({ type: 'ended' }, peer);
    for (const link of this.direct.values()) link.close();
    this.channel.close(); this.audio.stop();
  }
}
