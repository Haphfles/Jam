import { BandAudio } from './src/audio.mjs';
import { playScreen, exitPlayScreen, LiveMix } from './src/play-screen.mjs';
import { DirectLink } from './src/direct-link.mjs';
import { PhoneChannel, phoneConfig, randomId, validId } from './src/channel.mjs';
import { ClockSync, INSTRUMENTS } from './src/music-core.mjs';
import { names, controls, keyboard } from './src/controls.mjs';
const $ = s => document.querySelector(s), params = new URLSearchParams(location.hash.slice(1));
const room = params.get('room'), host = params.get('host');
let preferred = params.get('instrument');
let client = randomId();
try { const saved = sessionStorage.getItem(`greenlight-${room}`); if (validId(saved)) client = saved; else sessionStorage.setItem(`greenlight-${room}`, client); } catch {}
let direct, directGeneration = -1, lastPong = -Infinity;
let joinTimeout, channel, state, instrument, lastState = -Infinity, revision = -1, seq = Date.now(), commandSeq = Date.now(), commandPending, pingTimer, pulseTimer;
const audio = new BandAudio(), mix = new LiveMix();
const sync = new ClockSync(), pings = new Map(); let lastPing = 0, name = '', connecting = false;
function show(message) { $('#phone-status').textContent = message; }
function usable() { return !commandPending && !!channel?.ready && state?.running && !!instrument && sync.ready(performance.now()) && performance.now() - lastState < 3000 && !document.hidden; }
function render() {
  const active = usable();
  for (const button of $('#phone-controls').querySelectorAll('button')) button.disabled = !active;
  $('#track-volume').disabled = !instrument || !!commandPending || !channel?.ready;
  $('#phone-route').textContent = direct?.ready ? 'Direct · WebRTC' : 'Relay · Supabase';
  if (!state) return;
  const picker = $('#phone-instrument');
  picker.disabled = !!commandPending || !channel?.ready || performance.now() - lastState > 3000;
  for (const option of picker.options) {
    if (!option.value) { option.hidden = !!instrument; option.disabled = true; continue; }
    const occupied = !!state.slots?.[option.value] && option.value !== instrument;
    option.disabled = occupied;
    option.textContent = names[option.value] + (occupied ? ' · occupied' : option.value === instrument ? ' · you' : ' · available');
  }
  if (!commandPending) picker.value = instrument || '';

  if (!channel?.ready || performance.now() - lastState > 3000) show('Host connection lost. Inputs are disabled while reconnecting.');
  else if (!instrument) show(`You’re #${state.position} in line. ${state.preferred ? 'Waiting for ' + names[state.preferred] + '.' : 'Waiting for an instrument.'} You can choose an available instrument above.`);
  else if (document.hidden) show('Return to this page to play.');
  else if (!sync.ready(performance.now())) show('Synchronizing with the host clock…');
  else if (!state.running) show('Connected. The host has paused playing.');
  else show(`Live · ${names[instrument]}`);
  $('#latency').textContent = sync.ready(performance.now()) ? `Round trip ${Math.round(sync.rtt)} ms · ${sync.rtt > 200 ? 'Slow connection: late notes may be dropped.' : 'Clock synchronized · live inputs are never replayed.'}` : 'Synchronizing clocks…';

}
function ping() {
  if (!channel?.ready || !state || document.hidden) return;
  const now = performance.now();
  if (direct?.ready && now - lastPong > 3000) direct.close();
  if (now - lastPing < (sync.ready(now) ? 1000 : 180)) return;
  lastPing = now; const ping = randomId(); pings.set(ping, { sent: now, path: direct?.ready ? 'direct' : 'relay' });
  for (const [key, t] of pings) if (now - t.sent > 2500) pings.delete(key);
  liveSend({ type: 'ping', ping, t0: now });
}
function hello() { return channel.reliable({ type: 'hello', name, preferred: INSTRUMENTS.includes(preferred) ? preferred : null }, host); }
function liveSend(m) {
  // Never retry a musical packet on another route if the direct send is congested.
  if (direct?.ready) return direct.send(m);
  if (channel?.ws?.bufferedAmount > 1024) return false;
  return channel?.send(m, host);
}
function routeChanged() { sync.reset(); pings.clear(); lastPing = 0; lastPong = performance.now(); render(); }
function receive(m, path = 'relay') {
  if (m.from !== host) return;
  if (m.type === 'performance') {
    if (!channel?.ready || document.hidden || performance.now() - lastState > 3000) return;
    const target = mix.accept(m, state, sync, performance.now());
    if (target !== null) audio.note(m.instrument, m.note, target, m.volume);
    return;
  }
  if (m.type === 'rtc') {
    if (!validId(m.session) || !Number.isSafeInteger(m.generation) || m.generation <= directGeneration || m.description?.type !== 'offer') return;
    directGeneration = m.generation; direct?.close();
    direct = new DirectLink({ session: m.session, generation: m.generation,
      signal: value => channel.reliable(value, host), status: routeChanged,
      message: value => receive({ ...value, from: host }, 'direct') });
    direct.accept(m.description); return;
  }
  if (['ended','removed','rejected'].includes(m.type)) { disconnect(false); show(m.error || (m.type === 'removed' ? 'Your spot was released by the host. Tap Connect to rejoin.' : 'The host ended this room. Scan a new QR code.')); return; }
  if (m.type === 'pong') {
    const sample = pings.get(m.ping); if (!sample || sample.sent !== m.t0 || sample.path !== path || path !== (direct?.ready ? 'direct' : 'relay')) return;
    pings.delete(m.ping); lastPong = performance.now(); sync.add(sample.sent, lastPong, m.hostTime); render(); return;
  }
  if (m.type === 'result' && commandPending?.seq === m.commandSeq) {
    clearTimeout(commandPending.timer); commandPending = null; $('#command-status').textContent = m.error || 'Confirmed'; $('#instrument-status').textContent = m.error || '';  render(); return;
  }
  if (m.type !== 'state' || !Number.isSafeInteger(m.revision) || m.revision <= revision || !validId(m.epoch) || typeof m.running !== 'boolean') return;
  clearTimeout(joinTimeout);
  if (state?.epoch !== m.epoch || !m.running) audio.stop();
  revision = m.revision; lastState = performance.now(); state = m;
  const next = INSTRUMENTS.includes(m.instrument) ? m.instrument : null;
  if (next !== instrument) { audio.stop(); instrument = next; if (instrument) preferred = instrument; $('#phone-title').textContent = instrument ? names[instrument] : 'Waiting'; if (instrument) controls($('#phone-controls'), instrument, play); else $('#phone-controls').replaceChildren(); }
  if (!commandPending && instrument) $('#track-volume').value = Math.round((m.volumes?.[instrument] ?? .75) * 100);
  $('#connect-form').classList.add('hidden'); $('#phone-session').classList.remove('hidden');
  render(); ping();
}
async function connect() {
  if (connecting || channel) return;
  preferred = $('#join-instrument').value;
  connecting = true; $('#connect').disabled = true; name = $('#phone-name').value.trim() || 'Player'; show('Connecting to the stage…');
  try {
    await audio.enable();
    playScreen($('.phone-page'));
    const config = await phoneConfig();
    channel = new PhoneChannel(config, room, client, { message: receive, status: (status, error) => {
      $('#phone-network').textContent = status === 'ready' ? 'CONNECTED' : status.toUpperCase();
      if (status === 'ready') { hello().catch(e => { show('Host did not respond. Keep its stage open, or scan a new code.'); }); }
      else { direct?.close(); sync.reset(); pings.clear(); show(error || 'Reconnecting… Inputs are disabled.'); }
      render();
    } });
    joinTimeout = setTimeout(() => { if (!state) { disconnect(false); show('The host did not respond. Keep its stage open and scan a fresh QR code.'); } }, 12000);
    pingTimer = setInterval(ping, 180);
    pulseTimer = setInterval(() => { if (channel?.ready && performance.now() - lastState > 3000) hello().catch(() => {}); render(); }, 1200);
  } catch (e) { disconnect(false); show(e.message); }
  finally { connecting = false; $('#connect').disabled = false; }
}
function play(note) {
  if (!usable()) return;
  if (audio.context?.state !== 'running') { show('Tap Enable sound to resume audio.'); return; }
  audio.note(instrument, note, performance.now() + 2, state.volumes?.[instrument] ?? .75);
  // Never use reliable delivery for music. Timestamp against the measured host clock.
  liveSend({ type: 'note', assignment: state.assignment, localAudio: true, seq: ++seq, epoch: state.epoch, at: sync.hostTime(performance.now()), note });
}
async function command(action, value) {
  if (!channel?.ready || (!instrument && action !== 'instrument') || commandPending) return;
  const current = ++commandSeq;
  commandPending = { seq: current, timer: setTimeout(() => { if (commandPending?.seq !== current) return; commandPending = null; $('#command-status').textContent = 'Not confirmed. Check the current selection and try again.'; render(); }, 6500) };
  $('#command-status').textContent = 'Sending control…'; render();
  try { await channel.reliable({ type: 'command', commandSeq: current, action, value, epoch: state.epoch }, host); }
  catch (e) { if (commandPending?.seq === current) { clearTimeout(commandPending.timer); commandPending = null; $('#command-status').textContent = e.message; render(); } }
}
function disconnect(notify = true) {
  audio.stop(); exitPlayScreen($('.phone-page'));
  clearTimeout(joinTimeout);
  if (notify) channel?.send({ type: 'leave' }, host);
  direct?.close(); direct = null; directGeneration = -1;
  channel?.close(); channel = null; clearInterval(pingTimer); clearInterval(pulseTimer);
  if (commandPending) clearTimeout(commandPending.timer); commandPending = null;
  state = null; instrument = null; revision = -1; sync.reset(); pings.clear(); lastState = -Infinity;
  $('#phone-controls').replaceChildren(); $('#connect-form').classList.remove('hidden'); $('#phone-session').classList.add('hidden'); $('#phone-title').textContent = 'Join band'; $('#phone-network').textContent = 'DISCONNECTED'; show('Disconnected. Tap Connect to rejoin.');
}
$('#join-instrument').value = INSTRUMENTS.includes(preferred) ? preferred : '';
$('#phone-instrument').onchange = () => { audio.stop(); command('instrument', $('#phone-instrument').value); };
$('#connect-form').onsubmit = event => { event.preventDefault(); connect(); };
$('#enable-sound').onclick = async () => { try { await audio.enable(); playScreen($('.phone-page')); } catch (e) { show(e.message); } };
$('#exit-play').onclick = () => exitPlayScreen($('.phone-page'));
$('#disconnect').onclick = () => disconnect();
$('#track-volume').onchange = () => command('volume', Number($('#track-volume').value) / 100);
keyboard(play);
setInterval(render, 100);
document.addEventListener('visibilitychange', () => { audio.stop(); sync.reset(); pings.clear(); render(); if (!document.hidden) ping(); });
window.addEventListener('pagehide', () => disconnect());
if (!validId(room) || !validId(host)) { $('#connect').disabled = true; show('Open the stage on a computer and scan a fresh controller QR code.'); }
