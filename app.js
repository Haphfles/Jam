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
  card.innerHTML = `<div class="card-top"><span>0${index + 1}</span><span class="seat-tag">OPEN SPOT</span></div><div class="instrument-art" aria-hidden="true"><svg viewBox="0 0 135 120">${drawings[instrument]}</svg></div><h3>${names[instrument]}</h3><p class="description">${descriptions[index]}</p><div class="seat-person"><i></i><span>Could be you</span></div><button class="seat-button invite" disabled>Connect phone <span>↗</span></button><p class="track-status">No loop yet</p><div class="track-actions"><button data-action="record" title="Record four bars" disabled>● Record</button><button data-action="loop-start" disabled>▶ Loop</button><button data-action="loop-stop" disabled>■ Stop</button><button data-action="clear" disabled>× Clear</button></div><button class="release text-button hidden">Release spot</button>`;
  card.querySelector('.invite').onclick = () => pairing(instrument);
  card.querySelector('.release').onclick = () => { host.remove(host.seats.slots[instrument]); if (!host.local) { $('#local-instrument').value = ''; $('#desktop-controls').replaceChildren(); } };
  for (const button of card.querySelectorAll('[data-action]')) button.onclick = () => { try { host.command(instrument, button.dataset.action); } catch (e) { toast(e.message); } };
  $('#instruments').append(card);
});
function render() {
  if (!host) return;
  $('#player-count').textContent = `${Object.values(host.seats.slots).filter(Boolean).length} / 5 on stage`;
  $('#queue-count').textContent = `${host.seats.queue.length} waiting`;
  $('#transport').disabled = false; $('#transport').textContent = host.clock.running ? 'Stop the clock ■' : 'Start the clock ▶';
  $('#tempo').disabled = host.clock.running; $('#room-qr').disabled = host.network !== 'ready'; $('#local-instrument').disabled = false;
  $('#room-message').textContent = host.seats.queue.length ? `${host.seats.queue.length} waiting. The next open instrument goes to the first phone in line.` : 'Five spots. Scan an instrument’s code or share the room invitation.';
  $('#drop-count').textContent = `Late / invalid notes dropped: ${host.gate.dropped}`;
  for (const instrument of INSTRUMENTS) {
    const card = $(`#card-${instrument}`), peer = host.seats.slots[instrument], track = host.tracks[instrument];
    card.querySelector('.seat-tag').textContent = peer ? 'ON STAGE' : 'OPEN SPOT';
    card.querySelector('.seat-person span').textContent = peer ? host.seats.players.get(peer).name : 'Could be you';
    card.querySelector('.invite').disabled = host.network !== 'ready';
    card.querySelector('.invite').textContent = peer ? 'Invite / join queue ↗' : 'Connect phone ↗';
    card.querySelector('.track-status').textContent = track.label(host.clock, performance.now());
    card.querySelector('.release').classList.toggle('hidden', !peer);
    for (const button of card.querySelectorAll('[data-action]')) button.disabled = !peer || (['record','loop-start'].includes(button.dataset.action) && !host.clock.running);
    $(`#local-instrument option[value="${instrument}"]`).disabled = !!peer && peer !== host.id;
  }
}
function connection(status, error) {
  $('#connection-dot').classList.toggle('online', status === 'ready');
  $('#connection-text').textContent = status === 'ready' ? 'LIVE & TOGETHER' : status.toUpperCase();
  $('#host-status').textContent = error || ({ ready: 'Stage connected. Invite phones, then start the clock.', connecting: 'Connecting the stage…', disconnected: 'Connection lost. Reconnecting; playback is stopped.' }[status] || status);
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
    audio.context.onstatechange = () => { if (audio.context.state !== 'running') { host?.stop(); $('#host-status').textContent = 'Audio paused. Tap Start the clock to resume.'; } };
    render();
  } catch (e) { toast(e.message); $('#host-status').textContent = e.message; $('#host-button').disabled = false; }
};
$('#transport').onclick = async () => {
  try { if (host.clock.running) host.stop(); else { if (document.hidden) return; await audio.enable(); host.start(); } render(); } catch (e) { toast(e.message); }
};
$('#tempo').onchange = () => { try { host?.setTempo(Number($('#tempo').value)); } catch (e) { toast(e.message); } $('#tempo').value = host?.clock.bpm || 100; };
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
setInterval(() => {
  if (!host) return;
  const beat = host.clock.running ? Math.max(0, Math.floor(host.clock.stepAt(performance.now()) / 4)) : -1;
  $('#bar-label').textContent = beat < 0 ? 'Clock stopped' : `Bar ${Math.floor(beat / 4) + 1} · Beat ${beat % 4 + 1}`;
  [...$('#beat-dots').children].forEach((dot, index) => dot.classList.toggle('on', beat >= 0 && index === beat % 4));
}, 60);
document.addEventListener('visibilitychange', () => { if (document.hidden) { host?.stop(); $('#host-status').textContent = 'Playback stopped because the host was backgrounded. Tap Start the clock to resume.'; } });
window.addEventListener('pagehide', () => host?.close());
