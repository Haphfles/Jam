// Adapted from RODA's PhoneChannel: Phoenix protocol, heartbeat and retry lifecycle.
// GREENLIGHT adds recipient-bound acknowledgements, bounded queues and failure feedback.
export const validId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
export const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
export async function phoneConfig() {
  const response = await fetch(new URL('../shared-config.json', import.meta.url), { signal: AbortSignal.timeout(10000), cache: 'no-cache' });
  if (!response.ok) throw Error('Missing shared-config.json. Upload the entire deployment folder.');
  const c = await response.json();
  if (!c.url || !c.publishableKey || !/^https:\/\//.test(c.url) || !c.publishableKey.startsWith('sb_publishable_')) throw Error('Use a Supabase HTTPS URL and public publishable key in shared-config.json.');
  return c;
}
export class PhoneChannel {
  constructor(config, room, self, { message = () => {}, status = () => {}, WebSocketClass = globalThis.WebSocket } = {}) {
    if (!validId(room) || !validId(self)) throw Error('Invalid room link. Scan a fresh QR code.');
    Object.assign(this, { config, self, message, status, WebSocketClass });
    this.topic = `realtime:greenlight-band-${room}`;
    this.pending = new Map(); this.delivered = new Map(); this.ref = 0; this.attempts = 0; this.closed = false;
    this.deliveryTimer = setInterval(() => this.retryPending(), 100);
    this.connect();
  }
  connect() {
    if (this.closed) return;
    this.ready = false; this.status('connecting');
    const url = new URL(this.config.url); url.protocol = 'wss:'; url.pathname = '/realtime/v1/websocket';
    url.search = new URLSearchParams({ apikey: this.config.publishableKey, vsn: '1.0.0' });
    const ws = this.ws = new this.WebSocketClass(url);
    this.timeout = setTimeout(() => ws.close(), 10000);
    ws.onopen = () => {
      this.join = String(++this.ref);
      this.raw('phx_join', { config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, private: false } }, this.topic, this.join);
      this.lastHeartbeat = Date.now();
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastHeartbeat > 55000) { ws.close(); return; }
        this.raw('heartbeat', {}, 'phoenix');
      }, 25000);
    };
    ws.onmessage = event => {
      if (typeof event.data !== 'string' || event.data.length > 24000) return;
      let m; try { m = JSON.parse(event.data); } catch { return; }
      if (m.topic === 'phoenix' && m.event === 'phx_reply') this.lastHeartbeat = Date.now();
      if (m.topic === this.topic && m.event === 'phx_reply' && m.ref === this.join) {
        clearTimeout(this.timeout);
        if (m.payload?.status === 'ok') { this.ready = true; this.attempts = 0; this.status('ready'); }
        else { this.close(); this.status('error', 'Supabase refused this channel. Enable public Realtime channels for the configured project.'); }
      } else if (m.topic === this.topic && m.event === 'broadcast' && m.payload?.event === 'music') this.deliver(m.payload.payload);
      else if (m.event === 'phx_error' || m.event === 'phx_close') ws.close();
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      clearTimeout(this.timeout); clearInterval(this.heartbeat); this.ready = false;
      if (this.closed) return;
      this.status('disconnected');
      this.retry = setTimeout(() => this.connect(), Math.min(10000, 500 * 2 ** Math.min(this.attempts++, 5)));
    };
  }
  raw(event, payload, topic = this.topic, ref = String(++this.ref)) {
    if (this.ws?.readyState !== 1 || this.ws.bufferedAmount > 16000) return false;
    this.ws.send(JSON.stringify({ topic, event, payload, ref, join_ref: topic === 'phoenix' ? null : this.join })); return true;
  }
  send(payload, to) {
    if (!validId(to)) return false;
    return !!this.ready && this.raw('broadcast', { type: 'broadcast', event: 'music', payload: { ...payload, from: this.self, to } });
  }
  reliable(payload, to) {
    if (this.closed || !validId(to)) return Promise.reject(Error('Connection is unavailable.'));
    if (this.pending.size >= 32) return Promise.reject(Error('Too many pending controls. Wait for the connection.'));
    const id = randomId(), message = { ...payload, deliveryId: id };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { message, to, resolve, reject, started: Date.now(), sent: Date.now() });
      this.send(message, to);
    });
  }
  retryPending() {
    const now = Date.now();
    for (const [id, item] of this.pending) {
      if (now - item.started > 5000) { this.pending.delete(id); item.reject(Error('Control was not confirmed. Check the connection and try again.')); }
      else if (now - item.sent >= 350 && this.send(item.message, item.to)) item.sent = now;
    }
    for (const [id, time] of this.delivered) if (now - time > 30000) this.delivered.delete(id);
  }
  deliver(m) {
    if (!m || m.to !== this.self || !validId(m.from) || m.from === this.self) return;
    if (validId(m.deliveryAck)) {
      const pending = this.pending.get(m.deliveryAck);
      if (pending?.to === m.from) { this.pending.delete(m.deliveryAck); pending.resolve(); }
      return;
    }
    if (validId(m.deliveryId)) {
      this.send({ deliveryAck: m.deliveryId }, m.from);
      const key = `${m.from}:${m.deliveryId}`;
      if (this.delivered.has(key)) return;
      if (this.delivered.size >= 2048) this.delivered.delete(this.delivered.keys().next().value);
      this.delivered.set(key, Date.now());
    }
    this.message(m);
  }
  close() {
    this.closed = true; this.ready = false;
    clearInterval(this.deliveryTimer); clearInterval(this.heartbeat); clearTimeout(this.timeout); clearTimeout(this.retry);
    for (const item of this.pending.values()) item.reject(Error('Connection closed.'));
    this.pending.clear(); this.ws?.close();
  }
}
