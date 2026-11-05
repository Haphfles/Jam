import { playScreen, exitPlayScreen } from './src/play-screen.mjs';
import { phoneConfig } from './src/channel.mjs';
import { HostSession } from './src/host-session.mjs';
import { BandAudio } from './src/audio.mjs';
import { INSTRUMENTS } from './src/music-core.mjs';
import { names, controls, keyboard } from './src/controls.mjs';
import qrcode from './vendor/qrcode.mjs';
const $ = selector => document.querySelector(selector);
const audio = new BandAudio(); let host, toastTimer, soloInstrument = null;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 5000); }
INSTRUMENTS.forEach((instrument, index) => {
  const card = document.createElement('article'); card.className = `instrument-card ${instrument}`; card.id = `card-${instrument}`;
  card.innerHTML = `<div class="card-top"><span>0${index + 1}</span><span class="seat-tag">AVAILABLE</span></div><h3>${names[instrument]}</h3><div class="seat-person"><span>Available</span></div><button class="seat-button play-here">Play</button><button class="seat-button invite" disabled>Invite</button><p class="link-status"></p><button class="release text-button hidden">Release</button>`;
  card.querySelector('.play-here').onclick = () => chooseInstrument(instrument);
  card.querySelector('.invite').onclick = () => pairing(instrument);
  card.querySelector('.release').onclick = () => { host.remove(host.seats.slots[instrument]); if (!host.local) { soloInstrument = null; $('#local-instrument').value = ''; $('#desktop-controls').replaceChildren(); } };
  $('#instruments').append(card);
});
function render() {
  if (!host) return;
  $('#player-count').textContent = `${Object.values(host.seats.slots).filter(Boolean).length} / 5 players`;
  $('#queue-count').textContent = `${host.seats.queue.length} waiting`;
  $('#transport').disabled = false; $('#transport').textContent = host.running ? 'Pause' : 'Resume';
  $('#room-qr').disabled = host.network !== 'ready'; $('#local-instrument').disabled = false;
  $('#room-message').textContent = host.seats.queue.length ? `${host.seats.queue.length} waiting for an instrument.` : 'One player per instrument.';
  $('#drop-count').textContent = `Dropped notes: ${host.gate.dropped}`;
  for (const instrument of INSTRUMENTS) {
    const card = $(`#card-${instrument}`), peer = host.seats.slots[instrument];
    card.querySelector('.play-here').disabled = !!peer && peer !== host.id;
    card.querySelector('.seat-tag').textContent = peer ? 'PLAYING' : 'AVAILABLE';
    card.querySelector('.seat-person span').textContent = peer ? host.seats.players.get(peer).name : 'Available';
    card.querySelector('.invite').disabled = host.network !== 'ready';
    card.querySelector('.invite').textContent = peer ? 'Join queue' : 'Invite';
    card.querySelector('.link-status').textContent = peer === host.id ? 'This device' : peer ? (host.direct.get(peer)?.ready ? 'Direct' : 'Relay') : '';
    card.querySelector('.release').classList.toggle('hidden', !peer);
    $(`#local-instrument option[value="${instrument}"]`).disabled = !!peer && peer !== host.id;
  }
}
function connection(status, error) {
  $('#connection-dot').classList.toggle('online', status === 'ready');
  $('#connection-text').textContent = status === 'ready' ? 'CONNECTED' : status.toUpperCase();
  $('#host-status').textContent = error || ({ ready: 'Connected. Share an invitation.', connecting: 'Connecting…', disconnected: 'Connection lost. Reconnecting; playback is stopped.' }[status] || status);
  render();
}
$('#host-button').onclick = async () => {
  $('#host-button').disabled = true;
  try {
    await audio.enable(); const config = await phoneConfig();
    host?.close(); host = new HostSession(config, audio, { change: render, status: connection, flash: instrument => {
      const card = $(`#card-${instrument}`); card.classList.add('playing'); setTimeout(() => card.classList.remove('playing'), 120);
    } });
    $('#host-button').textContent = 'Hosting'; $('#dock-status').textContent = 'AUDIO ON';
    audio.context.onstatechange = () => { if (audio.context.state !== 'running') { host?.stop(); $('#host-status').textContent = 'Audio paused. Tap Resume playing to resume.'; } };
    host.start(); if (soloInstrument) host.localInstrument(soloInstrument); render();
  } catch (e) { toast(e.message); $('#host-status').textContent = e.message; $('#host-button').disabled = false; }
};
$('#transport').onclick = async () => {
  try { if (host.running) host.stop(); else { if (document.hidden) return; await audio.enable(); host.start(); } render(); } catch (e) { toast(e.message); }
};
function play(note) {
  if (host) host.localNote(note);
  else if (soloInstrument && !document.hidden) audio.note(soloInstrument, note, performance.now() + 2, .75);
}
async function chooseInstrument(instrument) {
  try {
    await audio.enable();
    if (host) host.localInstrument(instrument);
    audio.stop(); soloInstrument = instrument || null;
    $('#local-instrument').value = instrument;
    if (instrument) { $('.control-hint').textContent = ({guitar:'Select a chord · Swipe strings · A S D F G H',bass:'Select a chord · Pluck or swipe · A S D F',synth:'Select a chord · Play keys · A S D F G H J K'})[instrument] || 'Touch to play · A S D F G H J K'; controls($('#desktop-controls'), instrument, play); playScreen($('.player-panel')); }
    else { $('#desktop-controls').replaceChildren(); exitPlayScreen($('.player-panel')); }
    $('#dock-status').textContent = 'AUDIO ON';
  } catch (e) { toast(e.message); $('#local-instrument').value = host?.local || soloInstrument || ''; }
}
$('#local-instrument').onchange = () => chooseInstrument($('#local-instrument').value);
$('#play-here').onclick = () => chooseInstrument(host ? (host.local || INSTRUMENTS.find(i => !host.seats.slots[i]) || '') : (soloInstrument || 'guitar'));
$('#exit-play').onclick = () => exitPlayScreen($('.player-panel'));
$('#join-band').onclick = () => $('#join-dialog').showModal();
$('#join-form').onsubmit = event => {
  event.preventDefault();
  try {
    const link = new URL($('#join-link').value), expected = new URL('./controller.html', location.href);
    const params = new URLSearchParams(link.hash.slice(1));
    if (link.origin !== expected.origin || link.pathname !== expected.pathname || !/^[a-f0-9]{32}$/.test(params.get('room') || '') || !/^[a-f0-9]{32}$/.test(params.get('host') || '')) throw Error('Paste a band invitation from this site.');
    location.href = link.href;
  } catch (e) { toast(e.message); }
};
keyboard(play);
function pairing(instrument = '') {
  if (!host?.channel.ready) return;
  const url = new URL('./controller.html', location.href); url.hash = new URLSearchParams({ room: host.room, host: host.id, instrument });
  $('#pair-title').textContent = instrument ? `Invite · ${names[instrument]}` : 'Invite';
  $('#pair-link').value = url.href;
  const qr = qrcode(0, 'M'); qr.addData(url.href); qr.make();
  const canvas = $('#qr-canvas'), n = qr.getModuleCount(), cell = 5; canvas.width = canvas.height = (n + 8) * cell;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#10271e';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) ctx.fillRect((x + 4) * cell, (y + 4) * cell, cell, cell);
  $('#pair-status').textContent = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? 'Local preview link: phones cannot open localhost. Open the GitHub Pages site on the host before scanning, or use your computer’s LAN address.' : 'Ready to scan. Keep this stage open.';
  $('#pair-dialog').showModal();
}
$('#room-qr').onclick = () => pairing();
$('#copy-link').onclick = async () => { try { await navigator.clipboard.writeText($('#pair-link').value); toast('Link copied.'); } catch { $('#pair-link').select(); toast('Select and copy the link.'); } };
$('#about-button').onclick = () => $('#about-dialog').showModal();
for (const button of document.querySelectorAll('.close-dialog')) button.onclick = () => button.closest('dialog').close();
$('#mute-button').onclick = async () => { if (!audio.context) { toast('Open the stage first.'); return; } await audio.enable(); audio.muted = !audio.muted; audio.setVolume(audio.volume); $('#mute-button').textContent = audio.muted ? 'Unmute' : 'Mute'; $('#dock-status').textContent = audio.muted ? 'MUTED' : 'AUDIO ON'; };
$('#volume').oninput = () => { audio.setVolume(Number($('#volume').value) / 100); $('#volume-label').textContent = `${$('#volume').value}%`; };
document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.stop(); host?.stop(); if (host) $('#host-status').textContent = 'Playback stopped because the host was backgrounded. Tap Resume playing to resume.'; } });
window.addEventListener('pagehide', () => host?.close());
