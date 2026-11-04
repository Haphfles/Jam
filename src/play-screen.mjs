export function playScreen(panel) {
  panel.classList.add('play-screen');
  document.body.classList.add('is-playing');
  // Mobile browsers without the Fullscreen API still get a viewport-filling instrument.
  panel.requestFullscreen?.().catch(() => {});
}
export function exitPlayScreen(panel) {
  panel.classList.remove('play-screen');
  document.body.classList.remove('is-playing');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
export class LiveMix {
  constructor() { this.last = 0; }
  accept(m, state, sync, now) {
    if (!state?.running || m.epoch !== state.epoch || !sync.ready(now) ||
        !Number.isSafeInteger(m.seq) || m.seq <= this.last ||
        !Number.isInteger(m.note) || m.note < 0 || m.note > 7 ||
        !['guitar','bass','synth','drums','percussion'].includes(m.instrument) ||
        !Number.isFinite(m.at) || !Number.isFinite(m.volume) || m.volume < 0 || m.volume > 1) return null;
    this.last = m.seq;
    const age = sync.hostTime(now) - m.at;
    if (age > 180 || age < -30) return null;
    return now + 2;
  }
}
