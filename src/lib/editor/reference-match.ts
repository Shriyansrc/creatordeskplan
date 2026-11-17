import type { EditOperation } from './contracts';
import type { EditorClip } from './types';
export type VisualStats = { luma: number; contrast: number; saturation: number; warmth: number; frames: number; seconds: number };
export function frameStats(data: Uint8ClampedArray) {
 let n=0,sum=0,square=0,sat=0,warm=0;
 for(let i=0;i<data.length;i+=4){const r=data[i]!,g=data[i+1]!,b=data[i+2]!,l=.2126*r+.7152*g+.0722*b;sum+=l;square+=l*l;sat+=(Math.max(r,g,b)-Math.min(r,g,b))/255;warm+=(r-b)/255;n++;}
 const luma=sum/n;return {luma,contrast:Math.sqrt(Math.max(0,square/n-luma*luma)),saturation:sat/n,warmth:warm/n};
}
export async function measureVideo(url:string,start=0,end?:number,onProgress?:(count:number)=>void):Promise<VisualStats>{
 const video=document.createElement('video');video.muted=true;video.preload='auto';video.src=url;
 const wait=(event:'loadeddata'|'seeked')=>new Promise<void>((resolve,reject)=>{const done=()=>{clearTimeout(timer);video.removeEventListener(event,ready);video.removeEventListener('error',failed)};const ready=()=>{done();resolve()};const failed=()=>{done();reject(new Error('Video could not be decoded for visual analysis.'))};const timer=setTimeout(()=>{done();reject(new Error('Video frame decoding timed out.'))},15000);video.addEventListener(event,ready,{once:true});video.addEventListener('error',failed,{once:true});});
 try{
  const loaded=wait('loadeddata');video.load();await loaded;
  const finish=Math.min(end??video.duration,video.duration,start+20);if(!Number.isFinite(finish)||finish<=start)throw new Error('No readable video range.');
  const canvas=document.createElement('canvas');canvas.width=144;canvas.height=80;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Frame analysis is unavailable in this browser.');
  const values:ReturnType<typeof frameStats>[]=[];for(let i=0;i<12;i++){const time=start+(finish-start)*(i+.5)/12;const seek=wait('seeked');video.currentTime=time;await seek;context.drawImage(video,0,0,144,80);values.push(frameStats(context.getImageData(0,0,144,80).data));onProgress?.(i+1)}
  const average=(key:keyof typeof values[number])=>values.reduce((sum,value)=>sum+value[key],0)/values.length;
  return {luma:average('luma'),contrast:average('contrast'),saturation:average('saturation'),warmth:average('warmth'),frames:values.length,seconds:finish-start};
 }finally{video.pause();video.removeAttribute('src');video.load()}
}
const limit=(value:number,min:number,max:number)=>Math.round(Math.max(min,Math.min(max,value)));
/** A measured palette approximation, never a claim to reproduce cuts, fonts, speech or motion. */
export function matchVisualColor(clip:EditorClip,source:VisualStats,target:VisualStats):EditOperation {
 return {type:'color',clipId:clip.id,brightness:limit(target.luma/Math.max(16,source.luma)*100,70,130),contrast:limit(target.contrast/Math.max(8,source.contrast)*100,80,125),saturation:limit(target.saturation/Math.max(.04,source.saturation)*100,70,130),temperature:limit((target.warmth-source.warmth)*100,-25,25)};
}
