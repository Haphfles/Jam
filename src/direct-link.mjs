// Supabase exchanges SDP only. Live notes use an unordered, zero-retry data channel.
export class DirectLink {
  constructor({ signal, message, status = () => {}, initiator = false, session, generation = 0, PeerClass = globalThis.RTCPeerConnection }) {
    Object.assign(this, { signal, message, status, session, generation }); this.closed = false;
    if (!PeerClass) { this.closed = true; return; }
    try { this.pc = new PeerClass({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); }
    catch { this.closed = true; return; }
    this.pc.onconnectionstatechange = () => { if (['failed','closed','disconnected'].includes(this.pc.connectionState)) this.close(); };
    this.pc.ondatachannel = e => this.attach(e.channel);
    this.timeout = setTimeout(() => this.close(), 12000);
    if (initiator) { try { this.attach(this.pc.createDataChannel('notes', { ordered: false, maxRetransmits: 0 })); this.offer().catch(() => this.close()); } catch { this.close(); } }
  }
  get ready() { return !this.closed && this.dc?.readyState === 'open'; }
  attach(dc) {
    if (dc.label !== 'notes' || this.dc) { dc.close(); return; }
    this.dc = dc;
    dc.onopen = () => { clearTimeout(this.timeout); this.status('direct'); };
    dc.onclose = () => this.close(); dc.onerror = () => this.close();
    dc.onmessage = e => { if (this.closed || typeof e.data !== 'string' || e.data.length > 2048) return; try { const m = JSON.parse(e.data); if (['note','performance','ping','pong'].includes(m?.type)) this.message(m); } catch {} };
  }
  async gather() {
    if (this.pc.iceGatheringState === 'complete') return;
    await new Promise(resolve => {
      const done = () => { clearTimeout(timer); this.pc.removeEventListener('icegatheringstatechange', changed); resolve(); };
      const changed = () => { if (this.pc.iceGatheringState === 'complete') done(); };
      const timer = setTimeout(done, 4000); this.pc.addEventListener('icegatheringstatechange', changed);
    });
  }
  async offer() {
    await this.pc.setLocalDescription(await this.pc.createOffer()); await this.gather();
    if (!this.closed) await this.signal({ type: 'rtc', session: this.session, generation: this.generation, description: this.pc.localDescription.toJSON() });
  }
  async accept(description) {
    if (this.closed || !description || !['offer','answer'].includes(description.type) || typeof description.sdp !== 'string' || description.sdp.length > 16000) return;
    try {
      await this.pc.setRemoteDescription(description);
      if (description.type === 'offer') {
        await this.pc.setLocalDescription(await this.pc.createAnswer()); await this.gather();
        if (!this.closed) await this.signal({ type: 'rtc', session: this.session, generation: this.generation, description: this.pc.localDescription.toJSON() });
      }
    } catch { this.close(); }
  }
  send(message) {
    if (!this.ready || this.dc.bufferedAmount > 1024) return false;
    try { this.dc.send(JSON.stringify(message)); return true; } catch { this.close(); return false; }
  }
  close() {
    if (this.closed) return; this.closed = true; clearTimeout(this.timeout);
    this.dc?.close(); this.pc?.close(); this.status('relay');
  }
}
