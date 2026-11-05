import { invitationURL, hostIsLive } from './src/invitation.mjs';
import { QRScanner } from './src/qr-scanner.mjs';
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
function setMode(mode) {
  document.body.dataset.mode = mode;
  document.body.classList.toggle('landing',mode === 'welcome');
  $('#welcome').classList.toggle('hidden',mode !== 'welcome');
  $('#session-panel').classList.toggle('hidden',mode === 'welcome');
  $('.transport').classList.toggle('hidden',mode !== 'host');
  $('#session-mode').textContent = mode === 'host' ? 'HOST' : 'SOLO';
  $('#session-title').textContent = mode === 'host' ? 'Your band' : 'Choose an instrument';
  $('#home-button').textContent = mode === 'host' ? 'End session' : 'Home';
  updateLive();
}
function updateLive() {
  const live = hostIsLive(host);
  document.body.classList.toggle('host-live',live);
  for(const badge of document.querySelectorAll('.live-status')) {
    badge.classList.toggle('hidden',!host);badge.classList.toggle('is-live',live);
    badge.querySelector('span').textContent = live ? 'LIVE' : host?.network === 'ready' ? 'PAUSED' : 'CONNECTING';
  }
  $('#share-link').disabled = $('#copy-link').disabled = !host?.channel.ready;
  if(host && $('#pair-dialog').open) $('#pair-status').textContent = host.network === 'ready' ? 'Share this invitation. Keep the host page open.' : 'Connecting… Sharing will be available when the host is ready.';
}
INSTRUMENTS.forEach((instrument, index) => {
  const card = document.createElement('article'); card.className = `instrument-card ${instrument}`; card.id = `card-${instrument}`;
  card.innerHTML = `<div class="card-top"><span>0${index + 1}</span><span class="seat-tag">AVAILABLE</span></div><h3>${names[instrument]}</h3><div class="seat-person"><span>Available</span></div><button class="seat-button play-here">Play</button><button class="seat-button invite" disabled>Invite</button><p class="link-status"></p><button class="release text-button hidden">Release</button>`;
  card.querySelector('.play-here').onclick = () => chooseInstrument(instrument);
  card.querySelector('.invite').onclick = () => pairing(instrument);
  card.querySelector('.release').onclick = () => { host.remove(host.seats.slots[instrument]); if (!host.local) { soloInstrument = null; $('#local-instrument').value = ''; $('#desktop-controls').replaceChildren(); } };
  $('#instruments').append(card);
});
function render() {
  updateLive();
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
  $('#host-button').disabled = true; $('#host-button').textContent = 'Connecting…';
  try {
    await audio.enable(); const config = await phoneConfig();
    host?.close(); host = new HostSession(config, audio, { change: render, status: connection, flash: instrument => {
      const card = $(`#card-${instrument}`); card.classList.add('playing'); setTimeout(() => card.classList.remove('playing'), 120);
    } });
    $('#host-button').textContent = 'Hosting'; $('#dock-status').textContent = 'AUDIO ON';
    audio.context.onstatechange = () => { if (audio.context.state !== 'running') { host?.stop(); $('#host-status').textContent = 'Audio paused. Tap Resume playing to resume.'; } };
    host.start(); if (soloInstrument) host.localInstrument(soloInstrument); setMode('host'); render(); pairing();
  } catch (e) { toast(e.message); $('#host-status').textContent = e.message; $('#host-button').disabled = false; $('#host-button').textContent = 'Host'; }
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
$('#play-here').onclick = () => { setMode('solo'); $('#host-status').textContent = ''; };
$('#exit-play').onclick = () => exitPlayScreen($('.player-panel'));
$('#home-button').onclick = () => {
  host?.close(); host = null; audio.stop(); soloInstrument = null;
  $('#desktop-controls').replaceChildren(); $('#local-instrument').value = '';
  for(const option of $('#local-instrument').options) option.disabled = false;
  for(const card of document.querySelectorAll('.instrument-card')) {
    card.querySelector('.play-here').disabled = false;card.querySelector('.seat-tag').textContent = 'AVAILABLE';
    card.querySelector('.seat-person span').textContent = 'Available';card.querySelector('.link-status').textContent = '';
    card.querySelector('.release').classList.add('hidden');
  }
  $('#connection-text').textContent = 'LOCAL';$('#connection-dot').classList.remove('online');
  $('#host-button').disabled = false;$('#host-button').textContent = 'Host';setMode('welcome');
};
const scanner = new QRScanner($('#scanner-video'), {
  status:message=>$('#scan-status').textContent=message,
  found:value=>{ const url=invitationURL(value,location.href); scanner.stop(); location.href=url; }
});
function stopScanner(){scanner.stop();$('#scanner-panel').classList.add('hidden');$('#scan-qr').disabled=false;}
$('#join-band').onclick = () => { $('#scan-status').textContent=''; $('#join-dialog').showModal(); };
$('#scan-qr').onclick = async () => {
  $('#scan-qr').disabled=true;$('#scanner-panel').classList.remove('hidden');
  try { await scanner.start(); } catch(e) {
    stopScanner();$('#scan-status').textContent=e.name==='NotAllowedError'?'Camera access denied. Allow it in your browser or paste the invitation below.':e.name==='NotFoundError'?'No camera found. Paste the invitation below.':e.message;
  }
};
$('#stop-scan').onclick=()=>{stopScanner();$('#scan-status').textContent='Camera stopped.';};
$('#join-dialog').addEventListener('close',stopScanner);
$('#join-form').onsubmit = event => {
  event.preventDefault();
  try { const url=invitationURL($('#join-link').value,location.href); stopScanner(); location.href=url; }
  catch(e){$('#scan-status').textContent=e.message;}
};
keyboard(play);
function pairing(instrument = '') {
  if (!host) return;
  const url = new URL('./controller.html', location.href); url.hash = new URLSearchParams({ room: host.room, host: host.id, instrument });
  $('#pair-title').textContent = instrument ? `Invite · ${names[instrument]}` : 'Invite';
  $('#pair-link').value = url.href;
  const qr = qrcode(0, 'M'); qr.addData(url.href); qr.make();
  const canvas = $('#qr-canvas'), n = qr.getModuleCount(), cell = 5; canvas.width = canvas.height = (n + 8) * cell;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#10271e';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) ctx.fillRect((x + 4) * cell, (y + 4) * cell, cell, cell);
  $('#pair-status').textContent = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? 'Local preview link: phones cannot open localhost. Open the GitHub Pages site on the host before scanning, or use your computer’s LAN address.' : 'Ready to scan. Keep this stage open.';
  if (!$('#pair-dialog').open) $('#pair-dialog').showModal(); updateLive();
}
$('#room-qr').onclick = () => pairing();
$('#copy-link').onclick = async () => { try { await navigator.clipboard.writeText($('#pair-link').value); toast('Link copied.'); } catch { $('#pair-link').select(); toast('Select and copy the link.'); } };
$('#share-link').onclick = async () => {
  const url = $('#pair-link').value;
  try {
    if(navigator.share) await navigator.share({title:'GREENLIGHT JAMMER',text:'Join my band',url});
    else {await navigator.clipboard.writeText(url);$('#pair-status').textContent='Invitation copied. Paste it into a message.';}
  } catch(e) {if(e.name !== 'AbortError'){ $('#pair-link').select();$('#pair-status').textContent='Use Copy, or select and copy the invitation link.';}}
};
$('#about-button').onclick = () => $('#about-dialog').showModal();
for (const button of document.querySelectorAll('.close-dialog')) button.onclick = () => button.closest('dialog').close();
$('#mute-button').onclick = async () => { if (!audio.context) { toast('Open the stage first.'); return; } await audio.enable(); audio.muted = !audio.muted; audio.setVolume(audio.volume); $('#mute-button').textContent = audio.muted ? 'Unmute' : 'Mute'; $('#dock-status').textContent = audio.muted ? 'MUTED' : 'AUDIO ON'; };
$('#volume').oninput = () => { audio.setVolume(Number($('#volume').value) / 100); $('#volume-label').textContent = `${$('#volume').value}%`; };
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopScanner(); audio.stop(); host?.stop(); if (host) $('#host-status').textContent = 'Playback stopped because the host was backgrounded. Tap Resume playing to resume.'; } });
window.addEventListener('pagehide', () => { stopScanner(); host?.close(); });
setMode('welcome');
