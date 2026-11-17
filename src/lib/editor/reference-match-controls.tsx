import { useEffect, useRef, useState } from 'react';
import { matchVisualColor, measureVideo, type VisualStats } from './reference-match';
import type { ClipAsset, EditorProject } from './types';
import type { EditOperation } from './contracts';
export function ReferenceMatch({ project, assets, onPropose }: { project:EditorProject; assets:ClipAsset[]; onPropose:(operations:EditOperation[],summary:string)=>void }) {
 const [reference,setReference]=useState<{name:string;url:string}|null>(null);
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[stats,setStats]=useState<VisualStats|null>(null);
 const generation=useRef(0);
 useEffect(()=>()=>{if(reference)URL.revokeObjectURL(reference.url)},[reference]);
 const choose=(file:File|undefined)=>{if(!file||busy)return;if(!file.type.startsWith('video/')){setError('Choose a video file for the reference.');return}generation.current++;setReference({name:file.name,url:URL.createObjectURL(file)});setStats(null);setError('')};
 const analyze=async()=>{
  if(!reference)return;const run=++generation.current;setError('');
  try{
   if(!project.clips.length)throw new Error('Add your own footage in Media first. The reference is never added to your timeline.');
   const absent=project.clips.filter(clip=>!assets.some(a=>a.sourceId===clip.sourceId));if(absent.length)throw new Error('Choose your source footage again in Media before matching.');
   setBusy('Measuring reference frames...');const target=await measureVideo(reference.url,0,undefined,n=>setBusy(`Reading reference frame ${n}/12...`));
   const operations:EditOperation[]=[];for(const clip of project.clips){const asset=assets.find(a=>a.sourceId===clip.sourceId)!;setBusy(`Comparing ${clip.name}...`);const source=await measureVideo(asset.url,clip.trimIn,clip.trimOut);operations.push(matchVisualColor(clip,source,target))}
   if(run!==generation.current)return;setStats(target);onPropose(operations,'Colour proposal: brightness, contrast, saturation and warmth. Preview only until you accept.');
  }catch(cause){if(run===generation.current)setError(cause instanceof Error?cause.message:'Reference analysis failed. No edits applied.')}finally{if(run===generation.current)setBusy('')}
 };
 return <section aria-label="Reference video"><p>Reference only. Your footage stays in Media.</p>
 <label className="dropzone reference-drop" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(!busy)choose(event.dataTransfer.files[0])}}><b>{reference?reference.name:'Drop a reference video'}</b><span>or click to choose. Stays on this device.</span><input aria-label="Choose reference video" type="file" accept="video/*" disabled={Boolean(busy)} hidden onChange={event=>{choose(event.target.files?.[0]);event.target.value=''}}/></label>
 {reference&&<details className="reference-preview"><summary>Preview reference</summary><video aria-label="Reference preview" src={reference.url} controls playsInline preload="metadata" style={{display:'block',width:'100%',height:160,objectFit:'contain',marginTop:8,background:'#192434'}}/></details>}
 <div className="lab" style={{marginTop:12}}>Basic visual match</div><p>Samples 12 frames from up to 20 seconds. Colour only, processed on this device. No upload.</p>
 <button className="btn s" disabled={!reference||Boolean(busy)||!project.clips.length} onClick={analyze}>{busy||'Compare and preview basic colour'}</button>
 {stats&&<p role="status">Read {stats.frames} frames across {stats.seconds.toFixed(1)} seconds. Review below.</p>}
 <p className="note">Full AI matching is not enabled. Pacing, captions, transitions and music are not matched.</p>
 {error&&<p role="alert">{error}</p>}
 </section>;
}
