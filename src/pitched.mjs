export const chordNotes = {
  Cm:[0,3,7], 'E♭':[3,7,10], Fm:[5,8,12], Gm:[7,10,14],
  'B♭':[10,14,17], C:[0,4,7], G:[7,11,14], Am:[9,12,16]
};
export const pitchBase = {guitar:40,bass:28,synth:48};
export const encodePitch = (instrument,midi) => midi - pitchBase[instrument] + 8;
export const decodePitch = (instrument,note) => note - 8 + pitchBase[instrument];
export const maxNote = instrument => Object.hasOwn(pitchBase,instrument) ? 55 : 7;
export function voicing(instrument,chord) {
  const notes=chordNotes[chord];
  if(instrument==='bass') return [36+notes[0],36+notes[1],36+notes[2],48+notes[0]];
  return Array.from({length:8},(_,i)=>48+notes[i%3]+12*Math.floor(i/3));
}
