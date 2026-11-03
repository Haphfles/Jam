import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';

export const INSTRUMENTS = ['guitar', 'bass', 'synth', 'drums', 'percussion'];
const token = () => randomBytes(24).toString('hex');
const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
export function createBandServer({ publicUrl = process.env.PUBLIC_URL, graceMs = 15000 } = {}) {
  const clients = new Map(), pairings = new Map();
  const seats = Object.fromEntries(INSTRUMENTS.map(i => [i, null]));
  let queue = [], sequence = 0;
  function send(client, event, data) {
    for (const stream of client.streams) stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  function snapshot() {
    return { seats: Object.fromEntries(INSTRUMENTS.map(i => [i, seats[i] ? { id: seats[i], name: clients.get(seats[i])?.name || 'Player' } : null])),
      queue: queue.map(id => ({ id, name: clients.get(id)?.name || 'Player' })),
      listeners: [...clients.values()].filter(c => c.streams.size && !c.controllerFor && !c.instrument).length,
      players: Object.values(seats).filter(Boolean).length };
  }
  function publish() { const state = snapshot(); for (const c of clients.values()) send(c, 'state', state); }
  function fillSeats() {
    queue = queue.filter(id => clients.has(id));
    for (const instrument of INSTRUMENTS) {
      if (seats[instrument] || !queue.length) continue;
      const id = queue.shift(), c = clients.get(id); seats[instrument] = id; c.instrument = instrument;
      send(c, 'assigned', { instrument });
    }
  }
  function revokePair(c) {
    if (c.pairToken) { pairings.delete(c.pairToken); c.pairToken = null; }
    if (c.phone) { const phone = clients.get(c.phone); if (phone) { phone.controllerFor = null; send(phone, 'unpaired', {}); } c.phone = null; }
  }
  function leave(c) {
    if (c.instrument && seats[c.instrument] === c.id) seats[c.instrument] = null;
    c.instrument = null; queue = queue.filter(id => id !== c.id); revokePair(c); fillSeats(); publish();
  }
  function remove(c) {
    leave(c);
    if (c.controllerFor) { const owner = clients.get(c.controllerFor); if (owner?.phone === c.id) { owner.phone = null; send(owner, 'paired', { connected: false }); } }
    clients.delete(c.id); publish();
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const c of clients.values()) {
      if (c.streams.size) send(c, 'ping', { time: now });
      else if (now - c.lastSeen > graceMs) remove(c);
    }
    for (const [key, pair] of pairings) if (pair.expires < now) pairings.delete(key);
  }, Math.min(graceMs, 5000));
  sweep.unref();
  function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
  async function body(req) {
    let value = ''; for await (const chunk of req) { value += chunk; if (value.length > 4096) fail('Request too large.', 413); }
    try { return JSON.parse(value || '{}'); } catch { fail('Invalid JSON.'); }
  }
  function baseUrl(req) {
    if (publicUrl) return publicUrl.replace(/\/$/, '');
    const port = server.address().port;
    const host = String(req.headers.host || 'localhost').split(':')[0];
    if (host === 'localhost' || host === '127.0.0.1') {
      const interfaces = networkInterfaces();
      const physical = Object.entries(interfaces).filter(([name]) => /^(en\d+|eth\d+|wlan\d+|wl\w+|Wi-Fi|Ethernet)$/i.test(name)).flatMap(([, addresses]) => addresses);
      const lan = [...physical, ...Object.values(interfaces).flat()].find(n => n.family === 'IPv4' && !n.internal);
      return `http://${lan?.address || 'localhost'}:${port}`;
    }
    if (!/^[a-zA-Z0-9.-]+$/.test(host)) fail('Invalid host.');
    return `http://${host}:${port}`;
  }
  const server = http.createServer(async (req, res) => {
    const reply = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      if (req.method === 'GET' && url.pathname === '/api/health') return reply({ ok: true });
      if (req.method === 'GET' && url.pathname === '/api/events') {
        const c = clients.get(url.searchParams.get('id'));
        if (!c || c.secret !== url.searchParams.get('secret')) fail('Session expired. Reload to reconnect.', 401);
        if (c.streams.size >= 2) fail('Too many connections.', 429);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        c.streams.add(res); c.lastSeen = Date.now(); send(c, 'state', snapshot()); publish();
        req.on('close', () => { c.streams.delete(res); c.lastSeen = Date.now(); }); return;
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        // Browser requests must originate on this host; the API does not enable CORS.
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) fail('Origin not allowed.', 403);
        const data = await body(req);
        if (url.pathname === '/api/session') {
          if (clients.size >= 500) fail('This room is at capacity. Try again shortly.', 503);
          const id = token(), secret = token();
          const c = { id, secret, name: `Guest ${++sequence}`, streams: new Set(), instrument: null, lastSeen: Date.now(), count: 0, window: Date.now() };
          clients.set(id, c); return reply({ id, secret });
        }
        const c = clients.get(data.id);
        if (!c || c.secret !== data.secret) fail('Session expired. Reload to reconnect.', 401);
        c.lastSeen = Date.now();
        if (Date.now() - c.window > 1000) { c.count = 0; c.window = Date.now(); }
        if (++c.count > 50) fail('Slow down for a moment.', 429);
        if (url.pathname === '/api/join') {
          if (c.controllerFor) fail('This phone is controlling another player.');
          if (c.instrument || queue.includes(c.id)) return reply({ instrument: c.instrument, queued: queue.includes(c.id) });
          c.name = typeof data.name === 'string' ? data.name.trim().slice(0, 24) || c.name : c.name;
          if (!INSTRUMENTS.includes(data.instrument)) fail('Choose an instrument.');
          if (seats[data.instrument]) fail('That instrument was just taken. Choose an open spot.');
          seats[data.instrument] = c.id; c.instrument = data.instrument; publish(); return reply({ instrument: c.instrument });
        }
        if (url.pathname === '/api/queue') {
          if (c.controllerFor || c.instrument) fail('You already have a role in this room.');
          c.name = typeof data.name === 'string' ? data.name.trim().slice(0, 24) || c.name : c.name;
          if (!queue.includes(c.id)) queue.push(c.id); fillSeats(); publish(); return reply({ queued: queue.includes(c.id), instrument: c.instrument });
        }
        if (url.pathname === '/api/leave') { leave(c); return reply({ ok: true }); }
        if (url.pathname === '/api/pair') {
          if (!c.instrument) fail('Join an instrument first.');
          revokePair(c); const key = token(); c.pairToken = key;
          pairings.set(key, { owner: c.id, expires: Date.now() + 5 * 60 * 1000 });
          const link = `${baseUrl(req)}/#controller=${key}`;
          return reply({ link, qr: await QRCode.toDataURL(link, { width: 260, margin: 2, color: { dark: '#112820', light: '#ffffff' } }) });
        }
        if (url.pathname === '/api/connect') {
          const pair = pairings.get(data.token), owner = pair && clients.get(pair.owner);
          if (!pair || pair.expires < Date.now() || !owner?.instrument) fail('This pairing link has expired. Generate a new QR code on the stage.');
          if (c.instrument || queue.includes(c.id) || c.controllerFor) fail('This browser already has a role.');
          if (owner.id === c.id) fail('Open this link on your phone.');
          revokePair(owner); c.controllerFor = owner.id; owner.phone = c.id;
          send(owner, 'paired', { connected: true }); publish(); return reply({ instrument: owner.instrument, name: owner.name });
        }
        if (url.pathname === '/api/note') {
          const owner = c.controllerFor ? clients.get(c.controllerFor) : c;
          if (!owner?.instrument) fail('Join the stage before playing.', 403);
          if (!Number.isInteger(data.note) || data.note < 0 || data.note > 11) fail('Invalid note.');
          const note = { instrument: owner.instrument, note: data.note, player: owner.id, source: c.id, time: Date.now() };
          for (const listener of clients.values()) send(listener, 'note', note);
          return reply({ ok: true });
        }
        fail('Not found.', 404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') fail('Method not allowed.', 405);
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
      const file = files[url.pathname]; if (!file) fail('Not found.', 404);
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      const content = await readFile(`${publicDir}${file[0]}`); res.end(req.method === 'HEAD' ? undefined : content);
    } catch (e) { if (!res.headersSent) reply({ error: e.status ? e.message : 'Something went wrong. Try again.' }, e.status || 500); else res.end(); }
  });
  server.on('close', () => { clearInterval(sweep); for (const c of clients.values()) for (const stream of c.streams) stream.end(); });
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createBandServer();
  server.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log(`GREENLIGHT Band is live at http://localhost:${server.address().port}`));
}
