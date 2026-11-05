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
export function guitarControls(el, play) {
  el.className = 'instrument-controls guitar-controls'; el.replaceChildren();
  let selected = 'Cm';
  const bank = document.createElement('div'); bank.className = 'chord-bank'; bank.setAttribute('aria-label','Guitar chords');
  const strings = document.createElement('div'); strings.className = 'guitar-strings'; strings.setAttribute('aria-label','Strum strings');
  const buttons = [], pointers = new Map();
  const pluck = index => {
    const button = buttons[index]; if (!button || button.disabled) return;
    const midi = chords[selected][index]; if (midi === null) return;
    play(encodeGuitar(midi)); button.classList.remove('pressed'); void button.offsetWidth; button.classList.add('pressed');
    setTimeout(()=>button.classList.remove('pressed'),130);
  };
  const update = () => {
    for (const button of bank.children) button.setAttribute('aria-pressed',String(button.textContent === selected));
    buttons.forEach((button,i)=>{const pitch=chords[selected][i];button.querySelector('.pitch').textContent=noteName(pitch);button.classList.toggle('muted-string',pitch===null);button.setAttribute('aria-label',`String ${6-i}: ${noteName(pitch)}`);});
  };
  for (const name of Object.keys(chords)) {
    const button=document.createElement('button');button.type='button';button.className='chord-button';button.textContent=name;
    const select=()=>{selected=name;update();};
    button.onpointerdown=e=>{e.preventDefault();select();};button.onclick=select;bank.append(button);
  }
  for(let i=0;i<6;i++) {
    const button=document.createElement('button');button.type='button';button.className='guitar-string';button.style.setProperty('--weight',`${3-i*.35}px`);
    button.innerHTML=`<span class="pitch"></span><span class="string-line"></span><small>${['A','S','D','F','G','H'][i]}</small>`;
    button.onclick=e=>{if(e.detail===0)pluck(i);}; buttons.push(button);strings.append(button);
  }
  const centers=()=>buttons.map(b=>{const r=b.getBoundingClientRect();return r.top+r.height/2;});
  strings.onpointerdown=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    if(buttons.every(b=>b.disabled))return;
    e.preventDefault(); strings.setPointerCapture(e.pointerId);
    const ys=centers(),index=ys.reduce((best,y,i)=>Math.abs(y-e.clientY)<Math.abs(ys[best]-e.clientY)?i:best,0);
    pointers.set(e.pointerId,{y:e.clientY,last:index});pluck(index);
  };
  strings.onpointermove=e=>{
    const pointer=pointers.get(e.pointerId);if(!pointer)return;
    const rect=strings.getBoundingClientRect();
    if(e.clientX<rect.left||e.clientX>rect.right){pointer.y=e.clientY;pointer.last=null;return;}
    const samples=e.getCoalescedEvents?.();
    for(const sample of samples?.length?samples:[e]) {
      for(const index of crossedStrings(pointer.y,sample.clientY,centers())) {if(index!==pointer.last)pluck(index);pointer.last=index;}
      pointer.y=sample.clientY;
    }
  };
  const release=e=>pointers.delete(e.pointerId);
  strings.onpointerup=release;strings.onpointercancel=release;strings.onlostpointercapture=release;
  el.append(bank,strings);update();
  return index=>{if(index<6)pluck(index);};
}
