let decoderPromise;
export function loadDecoder() {
  if (globalThis.jsQR) return Promise.resolve(globalThis.jsQR);
  if (!decoderPromise) decoderPromise = new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=new URL('../vendor/jsQR.js',import.meta.url).href;
    script.onload=()=>resolve(globalThis.jsQR);
    script.onerror=()=>{decoderPromise=null;script.remove();reject(Error('QR reader could not load. Paste the invitation link instead.'));};
    document.head.append(script);
  });
  return decoderPromise;
}
export class QRScanner {
  constructor(video,{found,status,mediaDevices=globalThis.navigator?.mediaDevices,decoder=loadDecoder}={}) {
    Object.assign(this,{video,found,status,mediaDevices,decoder});this.generation=0;this.stream=null;this.timer=null;
  }
  async start() {
    this.stop();const generation=this.generation;
    if(!this.mediaDevices?.getUserMedia)throw Error('Camera unavailable. Use HTTPS or paste an invitation link.');
    this.status('Allow camera access, then point at the host’s QR code.');
    try {
      const decode=await this.decoder();if(generation!==this.generation)return;
      const stream=await this.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
      if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video.srcObject=stream;await this.video.play();
      if(generation!==this.generation)return;
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx)throw Error('Camera preview unavailable. Paste the invitation link instead.');
      this.status('Point at a GREENLIGHT JAMMER QR code.');
      const scan=()=>{
        if(generation!==this.generation)return;
        try {
          if(this.video.readyState>=2&&this.video.videoWidth){
            const scale=Math.min(1,720/this.video.videoWidth);
            canvas.width=Math.round(this.video.videoWidth*scale);canvas.height=Math.round(this.video.videoHeight*scale);
            ctx.drawImage(this.video,0,0,canvas.width,canvas.height);
            const frame=ctx.getImageData(0,0,canvas.width,canvas.height),code=decode(frame.data,frame.width,frame.height,{inversionAttempts:'dontInvert'});
            if(code){try{if(this.found(code.data)!==false){this.stop();return;}}catch(e){this.status(e.message);}}
          }
        } catch {this.status('Could not read the camera frame. Try again or paste a link.');this.stop();return;}
        this.timer=setTimeout(scan,140);
      };
      scan();
    } catch(e){if(generation!==this.generation)return;this.stop();throw e;}
  }
  stop(){this.generation++;clearTimeout(this.timer);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.pause();this.video.srcObject=null;}
}
