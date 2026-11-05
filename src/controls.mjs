import { guitarControls, noteName } from './guitar.mjs';
import { chordNotes, voicing, encodePitch } from './pitched.mjs';
let instrumentKeyboard = null;
export const names = { guitar: 'Guitar', bass: 'Bass', synth: 'Synth', drums: 'Drums', percussion: 'Percussion' };
export const keys = ['a','s','d','f','g','h','j','k'];
export const drumLayout = [
  {name:'Kick',part:'kick',x:52,y:76,size:30},
  {name:'Snare',part:'snare',x:28,y:54,size:25},
  {name:'Hi-hat',part:'hi-hat',x:13,y:31,size:23},
  {name:'Open hat',part:'open-hat',x:13,y:79,size:19},
  {name:'Floor tom',part:'floor-tom',x:83,y:58,size:27},
  {name:'High tom',part:'high-tom',x:51,y:34,size:24},
  {name:'Clap',part:'clap',x:86,y:86,size:17},
  {name:'Crash',part:'crash',x:77,y:14,size:24}
];
function flash(button) {
  button.classList.add('pressed');setTimeout(()=>button.classList.remove('pressed'),120);
}
function hitButton(label,index,trigger) {
  const button=document.createElement('button');button.type='button';button.className='note-key';button.dataset.note=index;
  button.setAttribute('aria-label',`Play ${label}`);
  const text=document.createElement('span');text.textContent=label;
  const key=document.createElement('small');key.textContent=keys[index].toUpperCase();button.append(text,key);
  const hit=()=>{if(button.disabled)return;trigger();flash(button);};
  button.onpointerdown=e=>{e.preventDefault();hit();};
  button.onclick=e=>{if(e.detail===0)hit();};
  return {button,hit};
}
function synthControls(el,play) {
  el.className='instrument-controls synth-controls';el.replaceChildren();
  let selected='Cm';
  const bank=document.createElement('div');bank.className='chord-bank';bank.setAttribute('aria-label','Synth chords');
  const piano=document.createElement('div');piano.className='synth-keys';
  const hits=[];
  const update=()=>{
    for(const button of bank.children)button.setAttribute('aria-pressed',String(button.textContent===selected));
    voicing('synth',selected).forEach((midi,i)=>{
      const button=piano.children[i],label=noteName(midi);
      button.firstChild.textContent=label;button.setAttribute('aria-label',`Play ${label}, octave ${Math.floor(midi/12)-1}`);
    });
  };
  for(const name of Object.keys(chordNotes)) {
    const button=document.createElement('button');button.type='button';button.className='chord-button';button.textContent=name;
    const select=()=>{if(button.disabled)return;selected=name;update();};
    button.onpointerdown=e=>{e.preventDefault();select();};button.onclick=select;bank.append(button);
  }
  for(let i=0;i<8;i++) {
    const {button,hit}=hitButton('',i,()=>play(encodePitch('synth',voicing('synth',selected)[i])));
    piano.append(button);hits.push(hit);
  }
  el.append(bank,piano);update();return index=>hits[index]?.();
}
export function controls(el,instrument,play) {
  instrumentKeyboard=null;
  if(instrument==='guitar'||instrument==='bass') {instrumentKeyboard=guitarControls(el,play,instrument);return;}
  if(instrument==='synth') {instrumentKeyboard=synthControls(el,play);return;}
  el.className='instrument-controls '+(instrument==='drums'?'drum-kit':'pads');el.replaceChildren();
  const labels=instrument==='drums'?drumLayout.map(d=>d.name):['Conga','Bongo','Shaker','Claves','Cowbell','Tambourine','Woodblock','Bell'];
  const hits=[];
  labels.forEach((label,index)=>{
    const {button,hit}=hitButton(label,index,()=>play(index));
    if(instrument==='drums'){
      const d=drumLayout[index];button.classList.add('drum-pad',d.part);
      button.style.setProperty('--x',d.x+'%');button.style.setProperty('--y',d.y+'%');button.style.setProperty('--size',d.size+'%');
    }
    el.append(button);hits.push(hit);
  });
  instrumentKeyboard=index=>hits[index]?.();
}
export function keyboard(play) {
  document.addEventListener('keydown',e=>{
    if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
    const note=keys.indexOf(e.key.toLowerCase());if(note>=0){e.preventDefault();if(instrumentKeyboard)instrumentKeyboard(note);else play(note);}
  });
}
