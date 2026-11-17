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
   if(run!==generation.current)return;setStats(target);onPropose(operations,'Measured a basic colour approximation from the reference and your own clips. Review brightness, contrast, saturation and warmth. Cuts, typography, transitions, masks, music and caption timing were not matched.');
  }catch(cause){if(run===generation.current)setError(cause instanceof Error?cause.message:'Reference analysis failed. No edits applied.')}finally{if(run===generation.current)setBusy('')}
 };
 return <section aria-label="Reference video"><p>Keep your footage in Media. Drop a different video here to show the look you want.</p>
 <label className="dropzone reference-drop" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(!busy)choose(event.dataTransfer.files[0])}}><b>{reference?reference.name:'Drop a reference video'}</b><span>or click to choose. Stays on this device.</span><input aria-label="Choose reference video" type="file" accept="video/*" disabled={Boolean(busy)} hidden onChange={event=>{choose(event.target.files?.[0]);event.target.value=''}}/></label>
 {reference&&<video src={reference.url} controls playsInline preload="metadata" style={{display:'block',width:'100%',maxHeight:190,marginTop:10,background:'#192434'}}/>}
 <div className="lab" style={{marginTop:16}}>Basic visual match</div><p>Measures 12 frames from the first 20 seconds of each video and proposes a colour approximation. No AI, audio analysis or upload. This does not reproduce the full edit.</p>
 <button className="btn s" disabled={!reference||Boolean(busy)||!project.clips.length} onClick={analyze}>{busy||'Compare and preview basic colour'}</button>
 {stats&&<p role="status">Read {stats.frames} reference frames across {stats.seconds.toFixed(1)} seconds. Review the proposed edits below before accepting.</p>}
 <p>Full AI reference analysis is not enabled. Matching pacing, typography, transitions and music still needs a verified analysis route and credit cost.</p>
 {error&&<p role="alert">{error}</p>}
 </section>;
    }
