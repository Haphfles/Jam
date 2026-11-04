import { phoneConfig } from './src/channel.mjs';
import { HostSession } from './src/host-session.mjs';
import { BandAudio } from './src/audio.mjs';
import { INSTRUMENTS } from './src/music-core.mjs';
import { names, controls, keyboard } from './src/controls.mjs';
import { drawings } from './art.mjs';
import qrcode from './vendor/qrcode.mjs';
const $ = selector => document.querySelector(selector);
const audio = new BandAudio(); let host, toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 5000); }
const descriptions = ['A little six-string soul.','Hold down the good vibrations.','A different kind of daydream.','Give the room a heartbeat.','The little things make the groove.'];
INSTRUMENTS.forEach((instrument, index) => {
  const card = document.createElement('article'); card.className = `instrument-card ${instrument}`; card.id = `card-${instrument}`;
  card.innerHTML = `<div class="card-top"><span>0${index + 1}</span><span class="seat-tag">OPEN SPOT</span></div><div class="instrument-art" aria-hidden="true"><svg viewBox="0 0 135 120">${drawings[instrument]}</svg></div><h3>${names[instrument]}</h3><p class="description">${descriptions[index]}</p><div class="seat-person"><i></i><span>Could be you</span></div><button class="seat-button invite" disabled>Connect phone <span>↗</span></button><p class="link-status">Live input</p><button class="release text-button hidden">Release spot</button>`;
  card.querySelector('.invite').onclick = () => pairing(instrument);
  card.querySelector('.release').onclick = () => { host.remove(host.seats.slots[instrument]); if (!host.local) { $('#local-instrument').value = ''; $('#desktop-controls').replaceChildren(); } };
  $('#instruments').append(card);
});
function render() {
  if (!host) return;
  $('#player-count').textContent = `${Object.values(host.seats.slots).filter(Boolean).length} / 5 on stage`;
  $('#queue-count').textContent = `${host.seats.queue.length} waiting`;
  $('#transport').disabled = false; $('#transport').textContent = host.running ? 'Pause playing ■' : 'Resume playing ▶';
  $('#room-qr').disabled = host.network !== 'ready'; $('#local-instrument').disabled = false;
  $('#room-message').textContent = host.seats.queue.length ? `${host.seats.queue.length} waiting. The next open instrument goes to the first phone in line.` : 'Five spots. Scan an instrument’s code or share the room invitation.';
  $('#drop-count').textContent = `Late / invalid notes dropped: ${host.gate.dropped}`;
  for (const instrument of INSTRUMENTS) {
    const card = $(`#card-${instrument}`), peer = host.seats.slots[instrument];
    card.querySelector('.seat-tag').textContent = peer ? 'ON STAGE' : 'OPEN SPOT';
    card.querySelector('.seat-person span').textContent = peer ? host.seats.players.get(peer).name : 'Could be you';
    card.querySelector('.invite').disabled = host.network !== 'ready';
    card.querySelector('.invite').textContent = peer ? 'Invite / join queue ↗' : 'Connect phone ↗';
    card.querySelector('.link-status').textContent = peer === host.id ? 'Keyboard · immediate' : peer ? (host.direct.get(peer)?.ready ? 'Direct connection · WebRTC' : 'Relay connection · Supabase') : 'Ready for live input';
    card.querySelector('.release').classList.toggle('hidden', !peer);
    $(`#local-instrument option[value="${instrument}"]`).disabled = !!peer && peer !== host.id;
  }
}
function connection(status, error) {
  $('#connection-dot').classList.toggle('online', status === 'ready');
  $('#connection-text').textContent = status === 'ready' ? 'LIVE & TOGETHER' : status.toUpperCase();
  $('#host-status').textContent = error || ({ ready: 'Stage connected. Invite phones and play live.', connecting: 'Connecting the stage…', disconnected: 'Connection lost. Reconnecting; playback is stopped.' }[status] || status);
  render();
}
$('#host-button').onclick = async () => {
  $('#host-button').disabled = true;
  try {
    await audio.enable(); const config = await phoneConfig();
    host?.close(); host = new HostSession(config, audio, { change: render, status: connection, flash: instrument => {
      const card = $(`#card-${instrument}`); card.classList.add('playing'); setTimeout(() => card.classList.remove('playing'), 120);
    } });
    $('#host-button').textContent = 'Stage is open ✓'; $('#dock-status').textContent = 'HOST AUDIO · ON';
    audio.context.onstatechange = () => { if (audio.context.state !== 'running') { host?.stop(); $('#host-status').textContent = 'Audio paused. Tap Resume playing to resume.'; } };
    host.start(); render();
  } catch (e) { toast(e.message); $('#host-status').textContent = e.message; $('#host-button').disabled = false; }
};
$('#transport').onclick = async () => {
  try { if (host.running) host.stop(); else { if (document.hidden) return; await audio.enable(); host.start(); } render(); } catch (e) { toast(e.message); }
};
$('#local-instrument').onchange = () => {
  try { host.localInstrument($('#local-instrument').value); if (host.local) controls($('#desktop-controls'), host.local, note => host.localNote(note)); else $('#desktop-controls').replaceChildren(); }
  catch (e) { toast(e.message); $('#local-instrument').value = host.local || ''; }
};
keyboard(note => host?.localNote(note));
function pairing(instrument = '') {
  if (!host?.channel.ready) return;
  const url = new URL('./controller.html', location.href); url.hash = new URLSearchParams({ room: host.room, host: host.id, instrument });
  $('#pair-title').textContent = instrument ? `Bring the ${names[instrument].toLowerCase()}.` : 'Join the band.';
  $('#pair-link').value = url.href;
  const qr = qrcode(0, 'M'); qr.addData(url.href); qr.make();
  const canvas = $('#qr-canvas'), n = qr.getModuleCount(), cell = 5; canvas.width = canvas.height = (n + 8) * cell;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#10271e';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) ctx.fillRect((x + 4) * cell, (y + 4) * cell, cell, cell);
  $('#pair-status').textContent = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? 'Local preview link: phones cannot open localhost. Open the GitHub Pages site on the host before scanning, or use your computer’s LAN address.' : 'Ready to scan. Keep this stage open.';
  $('#pair-dialog').showModal();
}
$('#room-qr').onclick = () => pairing();
$('#copy-link').onclick = async () => { try { await navigator.clipboard.writeText($('#pair-link').value); toast('Controller link copied.'); } catch { $('#pair-link').select(); toast('Select and copy the link.'); } };
$('#about-button').onclick = () => $('#about-dialog').showModal();
for (const button of document.querySelectorAll('.close-dialog')) button.onclick = () => button.closest('dialog').close();
$('#mute-button').onclick = async () => { if (!audio.context) { toast('Open the stage first.'); return; } await audio.enable(); audio.muted = !audio.muted; audio.setVolume(audio.volume); $('#mute-button').textContent = audio.muted ? '◖×' : '◖))'; $('#dock-status').textContent = audio.muted ? 'HOST AUDIO · MUTED' : 'HOST AUDIO · ON'; };
$('#volume').oninput = () => { audio.setVolume(Number($('#volume').value) / 100); $('#volume-label').textContent = `${$('#volume').value}%`; };
document.addEventListener('visibilitychange', () => { if (document.hidden) { host?.stop(); $('#host-status').textContent = 'Playback stopped because the host was backgrounded. Tap Resume playing to resume.'; } });
window.addEventListener('pagehide', () => host?.close());
