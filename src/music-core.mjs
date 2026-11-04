export const INSTRUMENTS = ['guitar', 'bass', 'synth', 'drums', 'percussion'];
export const INPUT_DELAY = 120;
export const LATE_TOLERANCE = 20;
export class ClockSync {
  constructor() { this.reset(); }
  reset() { this.samples = []; this.offset = 0; this.rtt = Infinity; this.updated = -Infinity; }
  add(sent, received, hostTime) {
    const rtt = received - sent;
    if (![sent, received, hostTime].every(Number.isFinite) || rtt < 0 || rtt > 2000) return false;
    this.samples.push({ rtt, offset: hostTime - (sent + received) / 2 });
    this.samples = this.samples.slice(-10);
    const best = this.samples.reduce((a, b) => a.rtt < b.rtt ? a : b);
    this.offset = best.offset; this.rtt = best.rtt; this.updated = received; return true;
  }
  ready(now) { return this.samples.length >= 3 && now - this.updated < 5000; }
  hostTime(now) { return now + this.offset; }
}
export class InputGate {
  constructor() { this.sequence = new Map(); this.rates = new Map(); this.dropped = 0; }
  accept(peer, m, now, epoch) {
    if (!m || m.epoch !== epoch || !Number.isSafeInteger(m.seq) || m.seq < 0 || !Number.isInteger(m.note) || m.note < 0 || m.note > 7 || !Number.isFinite(m.at)) return this.drop();
    if (m.seq <= (this.sequence.get(peer) ?? -1)) return this.drop();
    this.sequence.set(peer, m.seq);
    // Inputs are never queued/retried by the application. A buffered WebSocket frame
    // that arrives past its audible deadline is discarded, including after reconnect.
    const target = m.at + INPUT_DELAY;
    if (m.at > now + 60 || target < now - LATE_TOLERANCE) return this.drop();
    const rate = this.rates.get(peer) || { start: now, count: 0 };
    if (now - rate.start > 1000) { rate.start = now; rate.count = 0; }
    this.rates.set(peer, rate);
    if (++rate.count > 40) return this.drop();
    return Math.max(now + 5, target);
  }
  drop() { this.dropped++; return null; }
  forget(peer) { this.sequence.delete(peer); this.rates.delete(peer); }
}
export class Seats {
  constructor() { this.players = new Map(); this.slots = Object.fromEntries(INSTRUMENTS.map(i => [i, null])); this.queue = []; }
  join(id, name, preferred, now) {
    if (this.players.has(id)) { this.players.get(id).seen = now; return; }
    if (this.players.size >= 30) throw Error('This room’s waiting list is full.');
    const free = INSTRUMENTS.find(i => !this.slots[i]);
    const instrument = INSTRUMENTS.includes(preferred) && !this.slots[preferred] ? preferred : free;
    this.players.set(id, { id, name: String(name || 'Player').slice(0, 24), instrument: instrument || null, seen: now, command: -1 });
    if (instrument) this.slots[instrument] = id; else this.queue.push(id);
  }
  leave(id) {
    const p = this.players.get(id); if (!p) return null;
    if (p.instrument) this.slots[p.instrument] = null;
    this.players.delete(id); this.queue = this.queue.filter(peer => peer !== id);
    for (const instrument of INSTRUMENTS) {
      if (this.slots[instrument] || !this.queue.length) continue;
      const next = this.queue.shift(); this.players.get(next).instrument = instrument; this.slots[instrument] = next;
    }
    return p.instrument;
  }
  expire(now) { return [...this.players.values()].filter(p => now - p.seen > 10000).map(p => p.id); }
}
export class MusicalClock {
  constructor() { this.bpm = 100; this.running = false; this.origin = 0; this.next = 0; }
  get stepMs() { return 60000 / this.bpm / 4; }
  start(now) { this.origin = now + 200; this.next = 0; this.running = true; }
  stop() { this.running = false; }
  stepAt(time) { return (time - this.origin) / this.stepMs; }
  timeAt(step) { return this.origin + step * this.stepMs; }
  nextBar(now) { return Math.max(0, (Math.floor(this.stepAt(now + 120) / 16) + 1) * 16); }
  due(now, lookahead = 80) {
    if (!this.running) return [];
    const out = [];
    // Skip suspended-tab history. Never replay a backlog of old loop notes.
    this.next = Math.max(this.next, Math.ceil(this.stepAt(now - LATE_TOLERANCE)));
    while (this.timeAt(this.next) <= now + lookahead) { out.push({ step: this.next, at: this.timeAt(this.next) }); this.next++; }
    return out;
  }
}
export class LoopTrack {
  constructor() { this.clear(); this.volume = .75; }
  clear() { this.mode = 'empty'; this.pattern = []; this.recordStart = null; this.recordEnd = null; this.playFrom = Infinity; }
  record(clock, now) { this.pattern = []; this.recordStart = clock.nextBar(now); this.recordEnd = this.recordStart + 64; this.playFrom = this.recordEnd; this.mode = 'record'; }
  capture(note, target, clock) {
    if (!['record', 'loop'].includes(this.mode) || this.recordStart === null) return;
    const step = Math.round(clock.stepAt(target));
    if (step < this.recordStart || step >= this.recordEnd) return;
    const relative = step - this.recordStart;
    if (!this.pattern.some(n => n.step === relative && n.note === note)) this.pattern.push({ step: relative, note });
  }
  tick(step) {
    if (this.mode === 'record' && step >= this.recordEnd) this.mode = this.pattern.length ? 'loop' : 'empty';
    if (this.mode !== 'loop' || step < this.playFrom) return [];
    return this.pattern.filter(n => n.step === (step - this.playFrom) % 64).map(n => n.note);
  }
  stop() { this.mode = this.pattern.length ? 'stopped' : 'empty'; this.recordStart = this.recordEnd = null; }
  start(clock, now) { if (!this.pattern.length) throw Error('Record a loop first.'); this.mode = 'loop'; this.playFrom = clock.nextBar(now); }
  label(clock, now) {
    if (this.mode === 'record') return clock.stepAt(now) < this.recordStart ? 'Armed · next bar' : 'Recording · 4 bars';
    return { empty: 'No loop yet', loop: 'Looping · 4 bars', stopped: 'Loop stopped' }[this.mode];
  }
}
