import { guitarControls } from './guitar.mjs';
let guitarKeyboard = null;
export const names = { guitar: 'Guitar', bass: 'Bass', synth: 'Synth', drums: 'Drums', percussion: 'Percussion' };
export const keys = ['a','s','d','f','g','h','j','k'];
export function controls(el, instrument, play) {
  guitarKeyboard = null;
  if (instrument === 'guitar') { guitarKeyboard = guitarControls(el, play); return; }
  el.className = 'instrument-controls ' + (['guitar','bass'].includes(instrument) ? 'strings' : instrument === 'synth' ? 'keys' : 'pads');
  el.replaceChildren();
  const labels = instrument === 'drums' ? ['Kick','Snare','Hi-hat','Open hat','Low tom','High tom','Clap','Crash'] : instrument === 'percussion' ? ['Conga','Bongo','Shaker','Claves','Cowbell','Tambourine','Woodblock','Bell'] : ['C','E♭','F','G','B♭','C↑','E♭↑','F↑'];
  labels.forEach((label, note) => {
    const button = document.createElement('button'); button.className = 'note-key'; button.dataset.note = note; button.setAttribute('aria-label', `Play ${label}`);
    const text = document.createElement('span'); text.textContent = label;
    const key = document.createElement('small'); key.textContent = keys[note].toUpperCase(); button.append(text, key);
    const trigger = () => { play(note); button.classList.add('pressed'); setTimeout(() => button.classList.remove('pressed'), 120); };
    button.onpointerdown = event => { event.preventDefault(); trigger(); };
    button.onpointerenter = event => { if (event.buttons && ['guitar','bass'].includes(instrument)) trigger(); };
    button.onclick = event => { if (event.detail === 0) trigger(); }; el.append(button);
  });
}
export function keyboard(play) {
  document.addEventListener('keydown', e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]') || ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    const note = keys.indexOf(e.key.toLowerCase()); if (note >= 0) { e.preventDefault(); if (guitarKeyboard) guitarKeyboard(note); else play(note); }
  });
}
