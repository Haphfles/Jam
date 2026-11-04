import { PhoneChannel, phoneConfig, randomId, validId } from './src/channel.mjs';
import { ClockSync, INSTRUMENTS } from './src/music-core.mjs';
import { names, controls, keyboard } from './src/controls.mjs';
const $ = s => document.querySelector(s), params = new URLSearchParams(location.hash.slice(1));
const room = params.get('room'), host = params.get('host'), preferred = params.get('instrument');
let client = randomId();
try { const saved = sessionStorage.getItem(`greenlight-${room}`); if (validId(saved)) client = saved; else sessionStorage.setItem(`greenlight-${room}`, client); } catch {}
let joinTimeout, channel, state, instrument, lastState = -Infinity, revision = -1, seq = Date.now(), commandSeq = Date.now(), commandPending, pingTimer, pulseTimer;
const sync = new ClockSync(), pings = new Map(); let lastPing = 0, name = '', connecting = false;
function show(message) { $('#phone-status').textContent = message; }
function usable() { return !!channel?.ready && state?.running && !!instrument && sync.ready(performance.now()) && performance.now() - lastState < 3000 && !document.hidden; }
function render() {
  const active = usable();
  for (const button of $('#phone-controls').querySelectorAll('button')) button.disabled = !active;
  for (const button of document.querySelectorAll('[data-action]')) button.disabled = !instrument || !channel?.ready || !!commandPending || performance.now() - lastState > 3000 || (['record','loop-start'].includes(button.dataset.action) && !state?.running);
  $('#track-volume').disabled = !instrument || !!commandPending || !channel?.ready;
  $('#phone-tempo').textContent = `${state?.bpm || 100} BPM`;
  $('#phone-loop-status').textContent = instrument ? state?.loops?.[instrument]?.label || 'No loop yet' : 'Waiting for an instrument';
  if (!state) return;
  if (!channel?.ready || performance.now() - lastState > 3000) show('Host connection lost. Inputs are disabled while reconnecting.');
  else if (!instrument) show(`You’re #${state.position} in line. Stay here for the next open instrument.`);
  else if (document.hidden) show('Return to this page to play.');
  else if (!sync.ready(performance.now())) show('Synchronizing with the host clock…');
  else if (!state.running) show('Connected. Waiting for the host to start the clock.');
  else show(`You’re on ${names[instrument].toLowerCase()}. Sound plays on the host.`);
  $('#latency').textContent = sync.ready(performance.now()) ? `Round trip ${Math.round(sync.rtt)} ms · ${sync.rtt > 200 ? 'Slow connection: late notes may be dropped.' : 'Clock synchronized · live inputs are never replayed.'}` : 'Synchronizing clocks…';
  if (state.running && sync.ready(performance.now())) {
    const beat = Math.max(0, Math.floor((sync.hostTime(performance.now()) - state.origin) / (60000 / state.bpm)));
    $('#phone-beat').textContent = `Bar ${Math.floor(beat / 4) + 1} · Beat ${beat % 4 + 1}`;
  } else $('#phone-beat').textContent = 'Clock stopped';
}
function ping() {
  if (!channel?.ready || !state || document.hidden) return;
  const now = performance.now(); if (now - lastPing < (sync.ready(now) ? 1000 : 180)) return;
  lastPing = now; const ping = randomId(); pings.set(ping, now);
  for (const [key, t] of pings) if (now - t > 2500) pings.delete(key);
  channel.send({ type: 'ping', ping, t0: now }, host);
}
function hello() { return channel.reliable({ type: 'hello', name, preferred: INSTRUMENTS.includes(preferred) ? preferred : null }, host); }
function receive(m) {
  if (m.from !== host) return;
  if (['ended','removed','rejected'].includes(m.type)) { disconnect(false); show(m.error || (m.type === 'removed' ? 'Your spot was released by the host. Tap Connect to rejoin.' : 'The host ended this room. Scan a new QR code.')); return; }
  if (m.type === 'pong') {
    const sent = pings.get(m.ping); if (sent === undefined || sent !== m.t0) return;
    pings.delete(m.ping); sync.add(sent, performance.now(), m.hostTime); render(); return;
  }
  if (m.type === 'result' && commandPending?.seq === m.commandSeq) {
    clearTimeout(commandPending.timer); commandPending = null; $('#command-status').textContent = m.error || 'Control confirmed ✓'; render(); return;
  }
  if (m.type !== 'state' || !Number.isSafeInteger(m.revision) || m.revision <= revision || !validId(m.epoch) || !Number.isFinite(m.origin) || !Number.isFinite(m.bpm) || m.bpm < 50 || m.bpm > 180) return;
  clearTimeout(joinTimeout);
  revision = m.revision; lastState = performance.now(); state = m;
  const next = INSTRUMENTS.includes(m.instrument) ? m.instrument : null;
  if (next !== instrument) { instrument = next; $('#phone-title').textContent = instrument ? names[instrument] : 'You’re on the list.'; if (instrument) controls($('#phone-controls'), instrument, play); else $('#phone-controls').replaceChildren(); }
  if (!commandPending && instrument) $('#track-volume').value = Math.round((m.loops?.[instrument]?.volume ?? .75) * 100);
  $('#connect-form').classList.add('hidden'); $('#phone-session').classList.remove('hidden');
  render(); ping();
}
async function connect() {
  if (connecting || channel) return;
  connecting = true; $('#connect').disabled = true; name = $('#phone-name').value.trim() || 'Player'; show('Connecting to the stage…');
  try {
    const config = await phoneConfig();
    channel = new PhoneChannel(config, room, client, { message: receive, status: (status, error) => {
      $('#phone-network').textContent = status === 'ready' ? 'CONNECTED' : status.toUpperCase();
      if (status === 'ready') { hello().catch(e => { show('Host did not respond. Keep its stage open, or scan a new code.'); }); }
      else { sync.reset(); pings.clear(); show(error || 'Reconnecting… Inputs are disabled.'); }
      render();
    } });
    joinTimeout = setTimeout(() => { if (!state) { disconnect(false); show('The host did not respond. Keep its stage open and scan a fresh QR code.'); } }, 12000);
    pingTimer = setInterval(ping, 180);
    pulseTimer = setInterval(() => { if (channel?.ready && performance.now() - lastState > 3000) hello().catch(() => {}); render(); }, 1200);
  } catch (e) { show(e.message); channel?.close(); channel = null; }
  finally { connecting = false; $('#connect').disabled = false; }
}
function play(note) {
  if (!usable()) return;
  // Never use reliable delivery for music. Timestamp against the measured host clock.
  channel.send({ type: 'note', seq: ++seq, epoch: state.epoch, at: sync.hostTime(performance.now()), note }, host);
}
async function command(action, value) {
  if (!channel?.ready || !instrument || commandPending) return;
  const current = ++commandSeq;
  commandPending = { seq: current, timer: setTimeout(() => { if (commandPending?.seq !== current) return; commandPending = null; $('#command-status').textContent = 'Not confirmed. Check the loop status, then try again.'; render(); }, 6500) };
  $('#command-status').textContent = 'Sending control…'; render();
  try { await channel.reliable({ type: 'command', commandSeq: current, action, value, epoch: state.epoch }, host); }
  catch (e) { if (commandPending?.seq === current) { clearTimeout(commandPending.timer); commandPending = null; $('#command-status').textContent = e.message; render(); } }
}
function disconnect(notify = true) {
  clearTimeout(joinTimeout);
  if (notify) channel?.send({ type: 'leave' }, host);
  channel?.close(); channel = null; clearInterval(pingTimer); clearInterval(pulseTimer);
  if (commandPending) clearTimeout(commandPending.timer); commandPending = null;
  state = null; instrument = null; revision = -1; sync.reset(); pings.clear(); lastState = -Infinity;
  $('#phone-controls').replaceChildren(); $('#connect-form').classList.remove('hidden'); $('#phone-session').classList.add('hidden'); $('#phone-title').textContent = 'Join the band.'; $('#phone-network').textContent = 'DISCONNECTED'; show('Disconnected. Tap Connect to rejoin.');
}
$('#connect-form').onsubmit = event => { event.preventDefault(); connect(); };
$('#disconnect').onclick = () => disconnect();
for (const button of document.querySelectorAll('[data-action]')) button.onclick = () => command(button.dataset.action);
$('#track-volume').onchange = () => command('volume', Number($('#track-volume').value) / 100);
keyboard(play);
setInterval(render, 100);
document.addEventListener('visibilitychange', () => { sync.reset(); pings.clear(); render(); if (!document.hidden) ping(); });
window.addEventListener('pagehide', () => disconnect());
if (!validId(room) || !validId(host)) { $('#connect').disabled = true; show('Open the stage on a computer and scan a fresh controller QR code.'); }
