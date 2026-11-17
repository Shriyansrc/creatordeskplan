import { locateTime, projectDuration } from './project';
import { prepareSoundtrack } from './soundtrack';
import { requireExportQuality } from './export-quality';
import type { ClipAsset, EditorProject, TranscriptWord, EditorClip } from './types';

export function ivfHeader(width:number,height:number,frames:number,fps=30) {
  const data=new Uint8Array(32),v=new DataView(data.buffer);
  data.set(new TextEncoder().encode('DKIF'));v.setUint16(6,32,true);data.set(new TextEncoder().encode('VP80'),8);
  v.setUint16(12,width,true);v.setUint16(14,height,true);v.setUint32(16,fps,true);v.setUint32(20,1,true);v.setUint32(24,frames,true);return data;
}
export function ivfPacket(bytes:Uint8Array,index:number) {
  const data=new Uint8Array(12+bytes.length),v=new DataView(data.buffer);v.setUint32(0,bytes.length,true);v.setBigUint64(4,BigInt(index),true);data.set(bytes,12);return data;
}
export function wavPcm(buffer:AudioBuffer) {
  const channels=buffer.numberOfChannels,bytes=buffer.length*channels*2,data=new Uint8Array(44+bytes),v=new DataView(data.buffer),text=(at:number,s:string)=>data.set(new TextEncoder().encode(s),at);
  text(0,'RIFF');v.setUint32(4,36+bytes,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,bytes,true);
  for(let i=0;i<buffer.length;i++)for(let c=0;c<channels;c++){const n=Math.max(-1,Math.min(1,buffer.getChannelData(c)[i]??0));v.setInt16(44+(i*channels+c)*2,Math.round(n*(n<0?32768:32767)),true)}return data;
}
function videoEvent(video:HTMLVideoElement,event:string,change?:()=>void) {
  return new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>finish(new Error('Source decoding timed out. Your edit is unchanged.')),20000);
    const finish=(error?:Error)=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',fail);error?reject(error):resolve()};
    const done=()=>finish(),fail=()=>finish(new Error('The source clip could not be decoded.'));
    video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});change?.();
  });
}
export async function renderOffline(project:EditorProject,assets:ClipAsset[],transcript:TranscriptWord[],canvas:HTMLCanvasElement,draw:(video:HTMLVideoElement,clip:EditorClip,time:number)=>void,onProgress:(value:number,label:string)=>void) {
  if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')throw Error('Frame-by-frame export needs a current browser with WebCodecs, such as Chrome or Edge. No real-time fallback was used.');
  const fps=30,total=projectDuration(project),count=Math.ceil(total*fps);
  if(!Number.isFinite(total)||total<=0)throw Error('Add a valid clip before exporting.');
  const config:VideoEncoderConfig={codec:'vp8',width:canvas.width,height:canvas.height,bitrate:5_000_000,framerate:fps,latencyMode:'quality'};
  if(!(await VideoEncoder.isConfigSupported(config)).supported)throw Error('This browser cannot encode the required offline VP8 video. No real-time fallback was used.');
  const packets:Uint8Array<ArrayBuffer>[]=[];let encoded=0,bytes=0,encoderError:Error|undefined;
  const encoder=new VideoEncoder({output(chunk){const b=new Uint8Array(chunk.byteLength);chunk.copyTo(b);packets.push(ivfPacket(b,Math.round(chunk.timestamp*fps/1e6)));encoded++;bytes+=b.length;if(bytes>256*1024*1024)encoderError=new Error('This edit exceeds the 256 MB local encoded-video limit. Export a shorter section.');},error(e){encoderError=e}});
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
  const audio=new OfflineAudioContext(2,Math.max(1,Math.ceil(total*48000)),48000);
  let currentSource='';
  try {
    encoder.configure(config);
    onProgress(0,'Preparing offline audio…');const soundtrack=await prepareSoundtrack(audio,project,assets,transcript);
    for(let i=0;i<count;i++) {
      if(encoderError)throw encoderError;
      const time=i/fps,position=locateTime(project,time);if(!position)throw Error('The timeline is empty.');
      const {clip,sourceTime}=position,asset=assets.find(a=>a.sourceId===clip.sourceId);if(!asset)throw Error('Choose the original clip again before exporting.');
      if(currentSource!==asset.sourceId){await videoEvent(video,'loadeddata',()=>{video.src=asset.url;video.load()});currentSource=asset.sourceId}
      const target=Math.min(sourceTime,Math.max(0,video.duration-.001));
      if(Math.abs(video.currentTime-target)>.00001)await videoEvent(video,'seeked',()=>{video.currentTime=target});
      draw(video,clip,time);
      const frame=new VideoFrame(canvas,{timestamp:Math.round(time*1e6),duration:Math.round(1e6/fps)});
      try{encoder.encode(frame,{keyFrame:i%60===0})}finally{frame.close()}
      if(i%8===7)await encoder.flush();
      onProgress(.85*(i+1)/count,`Rendering frame ${i+1} of ${count} (offline)`);
    }
    await encoder.flush();if(encoderError)throw encoderError;if(encoded!==count)throw Error(`Offline encoder returned ${encoded} of ${count} frames. Export stopped.`);
    onProgress(.86,'Packing video and audio locally…');
    const [{FFmpeg},{default:coreURL},{default:wasmURL}]=await Promise.all([import('@ffmpeg/ffmpeg'),import('@ffmpeg/core?url'),import('@ffmpeg/core/wasm?url')]);
    const ffmpeg=new FFmpeg();
    try {
      let loadTimer:ReturnType<typeof setTimeout>|undefined;
      try { await Promise.race([ffmpeg.load({coreURL,wasmURL}),new Promise<never>((_,reject)=>{loadTimer=setTimeout(()=>reject(new Error('The local video packer did not load within 60 seconds. No finished file was created.')),60000)})]); }
      finally { if(loadTimer)clearTimeout(loadTimer); }
      const ivf=new Blob([ivfHeader(canvas.width,canvas.height,count),...packets]);
      await ffmpeg.writeFile('frames.ivf',new Uint8Array(await ivf.arrayBuffer()));await ffmpeg.writeFile('audio.wav',wavPcm(soundtrack.mix));
      // The installed single-thread core's Opus encoder traps on non-silent PCM.
      // Vorbis is already included and keeps WebM audio without a new dependency.
      const code=await ffmpeg.exec(['-i','frames.ivf','-i','audio.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','libvorbis','-threads','1','-t',String(total),'offline.webm'],120000);
      if(code!==0)throw Error(`Local video/audio packing failed (${code}). No finished file was created.`);
      const result=await ffmpeg.readFile('offline.webm');if(typeof result==='string')throw Error('Local packing returned no video.');
      const blob=new Blob([new Uint8Array(result)],{type:'video/webm'});const quality=await requireExportQuality(blob,total);
      if(quality.frames!==count)throw Error(`Packed file contains ${quality.frames} of ${count} expected frames. Export stopped.`);
      return blob;
    }finally{ffmpeg.terminate()}
  }finally{if(encoder.state!=='closed')encoder.close();video.pause();video.removeAttribute('src');video.load()}
        }
