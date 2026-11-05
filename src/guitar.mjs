import { chordNotes, voicing, encodePitch } from './pitched.mjs';
// MIDI voicings from low to high string; null means a muted string.
export const chords = {
  Cm: [null,48,55,60,63,67], 'E♭': [null,51,58,63,67,70],
  Fm: [41,48,53,56,60,65], Gm: [43,50,55,58,62,67],
  'B♭': [null,46,53,58,62,65], C: [null,48,52,55,60,64],
  G: [43,47,50,55,59,67], Am: [null,45,52,57,60,64]
};
export const encodeGuitar = midi => midi - 40 + 8;
export const noteName = midi => midi === null ? '×' : ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][midi % 12];
// Hit every crossed string even if a fast pointer movement skips several rows.
export function crossedStrings(from, to, centers) {
  if (to === from) return [];
  const down = to > from;
  return centers.map((y,i)=>({y,i})).filter(({y})=>down ? y > from && y <= to : y < from && y >= to)
    .sort((a,b)=>down ? a.y-b.y : b.y-a.y).map(({i})=>i);
}
export function guitarControls(el, play, instrument = 'guitar') {
  const bass = instrument === 'bass', count = bass ? 4 : 6;
  const bankNotes = bass ? Object.fromEntries(Object.keys(chordNotes).map(name=>[name,voicing('bass',name)])) : chords;
  el.className = `instrument-controls guitar-controls ${bass ? 'bass-controls' : ''}`; el.replaceChildren();
  let selected = 'Cm';
  const bank = document.createElement('div'); bank.className = 'chord-bank'; bank.setAttribute('aria-label',`${bass ? 'Bass' : 'Guitar'} chords`);
  const strings = document.createElement('div'); strings.className = 'guitar-strings'; strings.setAttribute('aria-label','Strum strings');
  const buttons = [];
  const pluck = index => {
    const button = buttons[index]; if (!button || button.disabled) return;
    const midi = bankNotes[selected][index]; if (midi === null) return;
    play(encodePitch(instrument,midi)); button.classList.remove('pressed'); void button.offsetWidth; button.classList.add('pressed');
    setTimeout(()=>button.classList.remove('pressed'),130);
  };
  const update = () => {
    for (const button of bank.children) button.setAttribute('aria-pressed',String(button.textContent === selected));
    buttons.forEach((button,i)=>{const pitch=bankNotes[selected][i];button.querySelector('.pitch').textContent=noteName(pitch);button.classList.toggle('muted-string',pitch===null);button.setAttribute('aria-label',`String ${count-i}: ${noteName(pitch)}`);});
  };
  for (const name of Object.keys(bankNotes)) {
    const button=document.createElement('button');button.type='button';button.className='chord-button';button.textContent=name;
    const select=()=>{selected=name;update();};
    button.onpointerdown=e=>{e.preventDefault();select();};button.onclick=select;bank.append(button);
  }
  for(let i=0;i<count;i++) {
    const button=document.createElement('button');button.type='button';button.className='guitar-string';button.style.setProperty('--weight',`${3-i*.35}px`);
    button.innerHTML=`<span class="pitch"></span><span class="string-line"></span><small>${['A','S','D','F','G','H'][i]}</small>`;
    button.onclick=e=>{if(e.detail===0)pluck(i);}; buttons.push(button);strings.append(button);
  }
  const centers=()=>buttons.map(b=>{const r=b.getBoundingClientRect();return r.top+r.height/2;});
  bindStrumming(strings, centers, pluck, () => !buttons.every(b=>b.disabled));
  el.append(bank,strings);update();
  return index=>{if(index<count)pluck(index);};
}

// Touch events track each finger independently, without relying on a button's
// implicit pointer capture. Use one input path per gesture to avoid double notes.
export function bindStrumming(surface, centers, pluck, enabled = () => true) {
  const fingers = new Map(), useTouch = 'ontouchstart' in surface;
  const start = (id, x, y) => {
    if (!enabled()) return;
    const ys = centers();
    const index = ys.reduce((best, value, i) => Math.abs(value-y)<Math.abs(ys[best]-y)?i:best, 0);
    fingers.set(id,{y,last:index}); pluck(index);
  };
  const move = (id, x, y) => {
    const finger = fingers.get(id); if (!finger) return;
    if (!enabled()) { fingers.delete(id); return; }
    const rect = surface.getBoundingClientRect();
    if (x < rect.left || x > rect.right) { finger.y=y; finger.last=null; return; }
    for (const index of crossedStrings(finger.y,y,centers())) {
      if (index !== finger.last) pluck(index);
      finger.last=index;
    }
    finger.y=y;
  };
  const prevent = e => { if (e.cancelable) e.preventDefault(); };
  surface.addEventListener('touchstart', e => {
    prevent(e); for (const t of e.changedTouches) start(t.identifier,t.clientX,t.clientY);
  }, {passive:false});
  surface.addEventListener('touchmove', e => {
    prevent(e); for (const t of e.changedTouches) move(t.identifier,t.clientX,t.clientY);
  }, {passive:false});
  surface.addEventListener('touchend', e => {
    prevent(e); for (const t of e.changedTouches) { move(t.identifier,t.clientX,t.clientY); fingers.delete(t.identifier); }
  }, {passive:false});
  surface.addEventListener('touchcancel', e => {
    for (const t of e.changedTouches) fingers.delete(t.identifier);
  }, {passive:false});
  surface.onpointerdown = e => {
    if ((useTouch && e.pointerType === 'touch') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    prevent(e); start(e.pointerId,e.clientX,e.clientY);
    try { surface.setPointerCapture(e.pointerId); } catch { /* A lost pointer must not block the first note. */ }
  };
  surface.onpointermove = e => {
    if (useTouch && e.pointerType === 'touch') return;
    const samples = e.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [e]) move(e.pointerId,sample.clientX,sample.clientY);
  };
  surface.onpointerup = e => {
    if (useTouch && e.pointerType === 'touch') return;
    move(e.pointerId,e.clientX,e.clientY); fingers.delete(e.pointerId);
  };
  surface.onpointercancel = surface.onlostpointercapture = e => fingers.delete(e.pointerId);
}
