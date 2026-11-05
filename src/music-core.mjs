import { maxNote } from './pitched.mjs';
export const INSTRUMENTS = ['guitar', 'bass', 'synth', 'drums', 'percussion'];
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
  constructor() { this.sequence = new Map(); this.rates = new Map(); this.timing = new Map(); this.dropped = 0; }
  accept(peer, m, now, epoch, path = 'relay', instrument = null) {
    if (!m || m.epoch !== epoch || !Number.isSafeInteger(m.seq) || m.seq < 0 || !Number.isInteger(m.note) || m.note < 0 || m.note > maxNote(instrument) || !Number.isFinite(m.at)) return this.drop();
    if (m.seq <= (this.sequence.get(peer) ?? -1)) return this.drop();
    this.sequence.set(peer, m.seq);
    const age = now - m.at, direct = path === 'direct';
    let timing = this.timing.get(peer);
    if (!timing || timing.path !== path) timing = { path, delay: direct ? 12 : 45, ages: [] };
    // A sudden delayed packet must not expand its own deadline. Never replay backlog.
    const deadline = direct ? Math.min(100, Math.max(40, timing.delay + 25)) : Math.min(180, Math.max(100, timing.delay + 40));
    if (age < -30 || age > deadline) return this.drop();
    const rate = this.rates.get(peer) || { start: now, count: 0 };
    if (now - rate.start > 1000) { rate.start = now; rate.count = 0; }
    this.rates.set(peer, rate); if (++rate.count > (instrument === 'guitar' ? 96 : 40)) return this.drop();
    timing.ages.push(Math.max(0, age)); timing.ages = timing.ages.slice(-24);
    const sorted = [...timing.ages].sort((a,b) => a-b);
    const p80 = sorted[Math.floor((sorted.length - 1) * .8)];
    timing.delay = Math.min(direct ? 35 : 80, Math.max(direct ? 6 : 12, p80 + 3));
    this.timing.set(peer, timing);
    return Math.max(now + 2, m.at + timing.delay);
  }
  drop() { this.dropped++; return null; }
  forget(peer) { this.sequence.delete(peer); this.rates.delete(peer); this.timing.delete(peer); }
}
export class Seats {
  constructor() { this.players = new Map(); this.slots = Object.fromEntries(INSTRUMENTS.map(i => [i, null])); this.queue = []; this.assignment = 0; }
  join(id, name, preferred, now) {
    if (this.players.has(id)) { this.players.get(id).seen = now; return; }
    if (this.players.size >= 30) throw Error('This room’s waiting list is full.');
    const free = INSTRUMENTS.find(i => !this.slots[i]);
    const wanted = INSTRUMENTS.includes(preferred) ? preferred : null;
    const instrument = wanted ? (!this.slots[wanted] ? wanted : null) : free;
    this.players.set(id, { id, name: String(name || 'Player').slice(0, 24), instrument: instrument || null, preferred: wanted, assignment: ++this.assignment, seen: now, command: -1 });
    if (instrument) this.slots[instrument] = id; else this.queue.push(id);
  }
  leave(id) {
    const p = this.players.get(id); if (!p) return null;
    if (p.instrument) this.slots[p.instrument] = null;
    this.players.delete(id); this.queue = this.queue.filter(peer => peer !== id);
    this.promote();
    return p.instrument;
  }
  promote() {
    for (const instrument of INSTRUMENTS) {
      if (this.slots[instrument]) continue;
      const index = this.queue.findIndex(id => !this.players.get(id).preferred || this.players.get(id).preferred === instrument);
      if (index < 0) continue;
      const [id] = this.queue.splice(index,1), player = this.players.get(id);
      player.instrument = instrument; player.assignment = ++this.assignment; this.slots[instrument] = id;
    }
  }
  switchInstrument(id, instrument) {
    const player = this.players.get(id);
    if (!player || !INSTRUMENTS.includes(instrument)) throw Error('Choose a valid instrument.');
    if (player.instrument === instrument) return;
    if (this.slots[instrument]) throw Error('That instrument is occupied. Choose an available instrument.');
    const old = player.instrument;
    // Reserve the destination before releasing the old seat or promoting the queue.
    this.slots[instrument] = id;
    if (old) this.slots[old] = null;
    this.queue = this.queue.filter(peer => peer !== id);
    player.instrument = instrument; player.preferred = instrument;
    player.assignment = ++this.assignment; player.switched = true;
    this.promote();
    return old;
  }
  expire(now) { return [...this.players.values()].filter(p => now - p.seen > 10000).map(p => p.id); }
}
