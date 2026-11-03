const $ = s => document.querySelector(s);
const names = { guitar:'Guitar',bass:'Bass',synth:'Synth',drums:'Drums',percussion:'Percussion' };
const descriptions = { guitar:'A little six-string soul.',bass:'Hold down the good vibrations.',synth:'A different kind of daydream.',drums:'Give the room a heartbeat.',percussion:'The little things make the groove.' };
const keys = ['a','s','d','f','g','h','j','k'];
const pitches = ['C','E♭','F','G','B♭','C↑','E♭↑','F↑'];
const drums = ['Kick','Snare','Hi-hat','Open hat','Low tom','High tom','Clap','Crash'];
const percussion = ['Conga','Bongo','Shaker','Claves','Cowbell','Tambourine','Woodblock','Bell'];
const drawings = {
 guitar:`<g transform="rotate(35 65 55)"><path d="M57 63 C33 50 25 67 30 82 C18 109 48 119 63 101 C87 101 97 75 76 68 L74 58Z" fill="#c2a477" stroke="#536647" stroke-width="1.5"/><path d="M57 65L65 10L75 10L70 69" fill="#9e865e" stroke="#536647" stroke-width="1.5"/><path d="M63 14L65 1L79 1L77 15Z" fill="#657451"/><circle cx="58" cy="82" r="10" fill="#344d37"/><path d="M43 96L59 103M66 16L55 96M70 16L59 96M74 16L63 97" stroke="#e8ddbe" stroke-width="1"/><path d="M63 4h-5m5 5h-5m21-4h5m-6 5h5" stroke="#657451" stroke-width="3"/></g>`,
 bass:`<g transform="rotate(30 65 55)"><path d="M54 61 C35 51 47 78 32 78 C19 99 47 119 63 99 C87 98 91 75 74 68L72 57L63 75Z" fill="#bb8e54" stroke="#705d3d" stroke-width="1.5"/><path d="M61 76L65 8L73 8L70 77" fill="#e0c18e" stroke="#705d3d"/><path d="M65 12L62 0L76-1L76 13" fill="#a07c49"/><path d="M47 90L63 95M51 84L67 88" stroke="#534d38" stroke-width="5"/><path d="M67 9L54 94M70 9L57 94" stroke="#f0dfb6"/><path d="M63 2h-5m6 6h-5m18-5h5m-5 6h5" stroke="#856a42" stroke-width="3"/></g>`,
 synth:`<g transform="rotate(-12 65 60)"><rect x="12" y="31" width="111" height="61" rx="5" fill="#a8a1bd" stroke="#655e7c" stroke-width="1.5"/><rect x="21" y="42" width="28" height="10" rx="2" fill="#d3e1c6"/><g fill="#655e7c"><circle cx="63" cy="46" r="3"/><circle cx="75" cy="46" r="3"/><circle cx="87" cy="46" r="3"/><circle cx="104" cy="46" r="4"/></g><rect x="21" y="61" width="94" height="24" fill="#f7f5ec"/><path d="M33 61v24m12-24v24m12-24v24m12-24v24m12-24v24m12-24v24m12-24v24" stroke="#9c97a9"/><path d="M33 61v14m12-14v14m24-14v14m12-14v14m12-14v14" stroke="#4e4d5e" stroke-width="6"/></g>`,
 drums:`<g stroke="#756653" stroke-width="1.5"><path d="M21 47v55m-10 7l10-7 10 7M109 42v60m-10 7l10-7 10 7M65 51V22" fill="none"/><ellipse cx="21" cy="43" rx="20" ry="5" fill="#d7bd86"/><ellipse cx="108" cy="40" rx="21" ry="5" fill="#d7bd86"/><path d="M32 45v23q12 8 23 0V45M70 43v24q12 8 23 0V43" fill="#ba8769"/><ellipse cx="43.5" cy="45" rx="11.5" ry="5" fill="#eee1c6"/><ellipse cx="81.5" cy="43" rx="11.5" ry="5" fill="#eee1c6"/><circle cx="63" cy="85" r="27" fill="#bd8868"/><circle cx="63" cy="85" r="23" fill="#eee2c8"/><circle cx="70" cy="93" r="5" fill="#756653"/><path d="M42 103l-6 10m48-10l6 10"/></g>`,
 percussion:`<g transform="rotate(-12 65 60)" stroke="#577d75" stroke-width="1.5"><path d="M21 48L27 96q13 14 28 0L61 48" fill="#bc9c68"/><ellipse cx="41" cy="48" rx="20" ry="9" fill="#ece2c2"/><path d="M64 34L70 84q14 14 27-1L103 34" fill="#8cab9d"/><ellipse cx="83" cy="34" rx="20" ry="9" fill="#f0e8cc"/><path d="M28 55l4 40m17-40l-1 42m23-55l4 39m18-39l-3 42" stroke="#e3d7b7"/><ellipse cx="83" cy="95" rx="20" ry="9" fill="#d2b476"/><ellipse cx="83" cy="93" rx="16" ry="6" fill="#e9ddbb"/><path d="M68 96v7m10-6v7m10-7v7m10-9v7" stroke="#6d8c7f" stroke-width="4"/></g>`
};
let reconnectTimer;
let session, events, state, instrument = null, queueing = false, controller = location.hash.startsWith('#controller='), connected = false;
let audio, master, enabled = false, muted = false, activeVoices = 0, toastTimer, waveTimer, selected;
const cardTimers = new Map();
function toast(message) { $('#toast').textContent=message; $('#toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),4500); }
async function api(action, data={}) {
 const response=await fetch(`/api/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...session,...data})});
 const result=await response.json(); if(!response.ok) throw new Error(result.error || 'Connection failed.'); return result;
}
function updateAudio() {
 const on=enabled&&!muted;
 $('#listen-button span').textContent=on?'You’re listening':'Start listening';
 $('#dock-status').textContent=`LIVE · ${on?'SOUND IS ON':'SOUND IS OFF'}`;
 $('#mute-button').textContent=on?'◖))':'◖×'; $('#mute-button').setAttribute('aria-label',on?'Mute sound':'Enable sound');
 $('#phone-sound').textContent=on?'Mute sound on this phone':'Enable sound on this phone';
 if(master) master.gain.setTargetAtTime(on?Number($('#volume').value)/100*.55:0,audio.currentTime,.025);
}
async function enableAudio() {
 try {
  if(!audio) { audio=new AudioContext({latencyHint:'interactive'});master=audio.createGain();const limiter=audio.createDynamicsCompressor();limiter.threshold.value=-14;limiter.ratio.value=8;master.connect(limiter);limiter.connect(audio.destination); }
  await audio.resume();enabled=true;muted=false;updateAudio();
 } catch { toast('Audio could not start. Try a recent browser and tap again.'); }
}
function noise(duration, highpass=1500, level=.18) {
 const count=Math.ceil(audio.sampleRate*duration),buffer=audio.createBuffer(1,count,audio.sampleRate),samples=buffer.getChannelData(0);
 for(let i=0;i<count;i++)samples[i]=Math.random()*2-1;
 const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain(),t=audio.currentTime;
 source.buffer=buffer;filter.type='highpass';filter.frequency.value=highpass;gain.gain.setValueAtTime(level,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
 source.connect(filter);filter.connect(gain);gain.connect(master);source.start(t);source.stop(t+duration);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
}
function tone(frequency,type,duration,level=.22,slide=0) {
 const source=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter(),t=audio.currentTime;
 source.type=type;source.frequency.setValueAtTime(frequency,t);if(slide)source.frequency.exponentialRampToValueAtTime(slide,t+duration*.65);
 filter.type='lowpass';filter.frequency.setValueAtTime(type==='sawtooth'?2300:6000,t);filter.frequency.exponentialRampToValueAtTime(type==='sawtooth'?350:1800,t+duration);
 gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(level,t+.008);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
 source.connect(filter);filter.connect(gain);gain.connect(master);source.start(t);source.stop(t+duration+.02);activeVoices++;source.onended=()=>{activeVoices--;source.disconnect();filter.disconnect();gain.disconnect();};
}
function sound(type,note) {
 if(!enabled||muted||audio.state!=='running'||activeVoices>45)return;
 const n=note%8,scale=[0,3,5,7,10,12,15,17],frequency=130.8128*2**(scale[n]/12);
 if(type==='guitar'){tone(frequency*2,'triangle',1.25,.25);tone(frequency*4,'sine',.35,.07);}
 if(type==='bass')tone(frequency/2,'triangle',.65,.4);
 if(type==='synth'){tone(frequency*2,'sawtooth',.8,.11);tone(frequency*2*1.004,'triangle',.85,.12);}
 if(type==='drums'){
  if(n===0)tone(150,'sine',.38,.75,42);
  if(n===1){noise(.18,1200,.28);tone(180,'triangle',.13,.17);}
  if(n===2)noise(.055,7000,.22);
  if(n===3)noise(.32,6500,.18);
  if(n===4)tone(160,'sine',.32,.45,70);
  if(n===5)tone(240,'sine',.24,.35,110);
  if(n===6){noise(.12,950,.3);}
  if(n===7)noise(.95,4000,.16);
 }
 if(type==='percussion'){
  if(n===0)tone(300,'sine',.2,.4,150);
  if(n===1)tone(470,'sine',.14,.35,270);
  if(n===2)noise(.09,6000,.19);
  if(n===3)tone(1700,'sine',.07,.3);
  if(n===4){tone(540,'square',.15,.08);tone(800,'square',.13,.05);}
  if(n===5)noise(.23,8000,.18);
  if(n===6)tone(850,'triangle',.08,.3);
  if(n===7){tone(1046.5,'sine',1.5,.2);tone(1569.8,'sine',.65,.06);}
 }
}
function flash(type,note) {
 const card=$(`#card-${type}`);if(card){card.classList.add('playing');clearTimeout(cardTimers.get(type));cardTimers.set(type,setTimeout(()=>card.classList.remove('playing'),150));}
 $('#activity-wave').classList.add('active');clearTimeout(waveTimer);waveTimer=setTimeout(()=>$('#activity-wave').classList.remove('active'),230);
 if(type===instrument){const key=$(`[data-note="${note%8}"]`);if(key){key.classList.add('pressed');setTimeout(()=>key.classList.remove('pressed'),140);}}
}
async function play(note) {
 if(!instrument||!connected)return;
 if(!controller&&!enabled)await enableAudio();
 sound(instrument,note);flash(instrument,note);
 try{await api('note',{note});}catch(e){toast(e.message);}
}
function controls(target,type) {
 const el=$(target);el.className='instrument-controls '+(['guitar','bass'].includes(type)?'strings':type==='synth'?'keys':'pads');el.replaceChildren();
 const labels=type==='drums'?drums:type==='percussion'?percussion:pitches;
 labels.forEach((label,index)=>{const button=document.createElement('button');button.className='note-key';button.dataset.note=index;button.setAttribute('aria-label',`Play ${label}`);const text=document.createElement('span');text.textContent=label;const small=document.createElement('small');small.textContent=keys[index].toUpperCase();button.append(text,small);button.addEventListener('pointerdown',event=>{event.preventDefault();play(index);});button.addEventListener('click',event=>{if(event.detail===0)play(index);});el.append(button);});
}
function render() {
 if(!state||controller)return;
 const own=Object.entries(state.seats).find(([,seat])=>seat?.id===session.id)?.[0]||null;
 queueing=state.queue.some(p=>p.id===session.id);
 if(own!==instrument){instrument=own;$('#player-panel').classList.toggle('hidden',!instrument);if(instrument){$('#player-title').textContent=`You’re on ${names[instrument].toLowerCase()}. Make it yours.`;controls('#desktop-controls',instrument);}else if($('#pair-dialog').open)$('#pair-dialog').close();}
 $('#player-count').textContent=state.players;$('#listener-count').textContent=state.listeners;
 for(const [type,label]of Object.entries(names)){
  const card=$(`#card-${type}`),seat=state.seats[type],mine=seat?.id===session.id,button=card.querySelector('button');
  card.querySelector('.seat-tag').textContent=seat?(mine?'YOU’RE ON':'ON STAGE'):'OPEN SPOT';card.querySelector('.seat-tag').classList.toggle('busy',!!seat);
  const person=card.querySelector('.seat-person');person.classList.toggle('occupied',!!seat);person.querySelector('span').textContent=seat?seat.name:'Could be you';
  button.replaceChildren();const text=document.createElement('span');text.textContent=mine?'Your instrument':seat?'On stage':'Take this spot';const arrow=document.createElement('span');arrow.textContent=mine?'♫':seat?'●':'↗';button.append(text,arrow);
  button.disabled=!!seat||!!instrument||queueing||!connected;button.classList.toggle('mine',mine);
 }
 const full=state.players===5,position=state.queue.findIndex(p=>p.id===session.id)+1;
 $('#queue-button').classList.toggle('hidden',!full||!!instrument||queueing);$('#queue-button').disabled=!connected;
 $('#leave-button').classList.toggle('hidden',!instrument&&!queueing);$('#leave-button').textContent=queueing?'Leave the queue ↗':'Leave the stage ↗';
 $('#room-message').textContent=queueing?`You’re #${position} in line. Stay here; the next open instrument is yours.`:instrument?'You’re part of the band. Listen, play, and leave a little room for each other.':full?`A full house. Join the waiting list and enjoy the music while you wait.${state.queue.length?` ${state.queue.length} waiting.`:''}`:'There’s room for you. Grab an instrument and say hello with a note.';
}
for(const [i,[type,name]]of Object.entries(Object.entries(names))){
 const card=document.createElement('article');card.className=`instrument-card ${type}`;card.id=`card-${type}`;
 card.innerHTML=`<div class="card-top"><span>0${Number(i)+1}</span><span class="seat-tag">OPEN SPOT</span></div><div class="instrument-art" aria-hidden="true"><svg viewBox="0 0 135 120">${drawings[type]}</svg></div><h3>${name}</h3><p class="description">${descriptions[type]}</p><div class="seat-person"><i></i><span>Could be you</span></div><button class="seat-button" disabled>Take this spot <span>↗</span></button>`;
 card.querySelector('button').addEventListener('click',()=>openJoin(type));$('#instruments').append(card);
}
function openJoin(type){selected=type;$('#join-title').textContent=type==='queue'?'Good things are worth a little wait.':`A little ${names[type].toLowerCase()}. A little you.`;$('#join-form button').textContent=type==='queue'?'Join the waiting list ↗':'Let’s play ↗';$('#join-dialog').showModal();}
$('#join-form').addEventListener('submit',async event=>{event.preventDefault();const button=$('#join-form button');button.disabled=true;try{await enableAudio();await api(selected==='queue'?'queue':'join',{instrument:selected,name:$('#player-name').value});$('#join-dialog').close();}catch(e){toast(e.message);}finally{button.disabled=false;}});
$('#queue-button').onclick=()=>openJoin('queue');
$('#leave-button').onclick=async()=>{try{await api('leave');}catch(e){toast(e.message);}};
$('#listen-button').onclick=enableAudio;
$('#mute-button').onclick=async()=>{if(!enabled||muted)await enableAudio();else{muted=true;updateAudio();}};
$('#phone-sound').onclick=$('#mute-button').onclick;
$('#volume').oninput=()=>{$('#volume-label').textContent=`${$('#volume').value}%`;updateAudio();};
$('#reconnect-button').onclick=()=>location.reload();
$('#about-button').onclick=()=>$('#about-dialog').showModal();
for(const button of document.querySelectorAll('.close-dialog'))button.onclick=()=>button.closest('dialog').close();
$('#phone-button').onclick=async()=>{
 $('#pair-dialog').showModal();$('#qr-loading').classList.remove('hidden');$('#qr-image').classList.add('hidden');$('#pair-status').textContent='';$('#pair-link').value='';
 try{const pair=await api('pair');$('#qr-image').src=pair.qr;$('#qr-image').classList.remove('hidden');$('#pair-link').value=pair.link;}catch(e){$('#pair-status').textContent=e.message;}finally{$('#qr-loading').classList.add('hidden');}
};
$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#pair-link').value);toast('Phone link copied.');}catch{$('#pair-link').select();toast('Select and copy the link above.');}};
document.addEventListener('keydown',event=>{if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;const note=keys.indexOf(event.key.toLowerCase());if(note!==-1){event.preventDefault();play(note);}});
function connection(ok){connected=ok;if(ok){clearTimeout(reconnectTimer);reconnectTimer=null;$('#reconnect-button').classList.add('hidden');}else if(!reconnectTimer){reconnectTimer=setTimeout(()=>{$('#reconnect-button').classList.remove('hidden');toast('The connection was interrupted. Reload to rejoin; your previous spot may have been released.');},15000);}$('#connection-dot').classList.toggle('online',ok);$('#connection-text').textContent=ok?'LIVE & TOGETHER':'RECONNECTING';render();}
async function start(){
 try{
  session=await api('session');events=new EventSource(`/api/events?id=${session.id}&secret=${session.secret}`);
  const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Could not connect to the room. Reload to try again.')),12000);events.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});});
  events.onopen=()=>connection(true);events.onerror=()=>connection(false);
  events.addEventListener('state',event=>{state=JSON.parse(event.data);render();});
  events.addEventListener('note',event=>{const note=JSON.parse(event.data);if(note.source!==session.id){sound(note.instrument,note.note);flash(note.instrument,note.note);}});
  events.addEventListener('assigned',event=>{const assigned=JSON.parse(event.data);toast(`You’re up! Your ${names[assigned.instrument].toLowerCase()} spot is ready.`);});
  events.addEventListener('paired',event=>{const paired=JSON.parse(event.data);$('#pair-status').textContent=paired.connected?'✓ Phone connected. You’re ready to play.':'Phone disconnected. Create a new link to pair again.';toast(paired.connected?'Phone connected. Let’s play.':'Your phone disconnected.');});
  events.addEventListener('unpaired',()=>{instrument=null;$('#phone-controls').replaceChildren();$('#phone-status').textContent='This phone has been disconnected. Scan a new QR code from the stage to reconnect.';});
  if(controller){const pairingToken=location.hash.slice('#controller='.length);history.replaceState(null,'',location.pathname);$('#stage-page').classList.add('hidden');$('#phone-page').classList.remove('hidden');await ready;const pair=await api('connect',{token:pairingToken});instrument=pair.instrument;$('#phone-title').textContent=names[instrument];$('#phone-status').textContent=`Connected to ${pair.name}’s spot. Make some music.`;controls('#phone-controls',instrument);}else await ready;
 }catch(e){connection(false);$('#connection-text').textContent='OFFLINE';toast(e.message);if(controller){$('#phone-title').textContent='Let’s reconnect.';$('#phone-status').textContent=e.message;}}
}
start();
