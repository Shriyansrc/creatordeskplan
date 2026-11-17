import { captionCues } from './captions';
import { projectDuration } from './project';
import type { EditorProject, SfxEvent, TranscriptWord } from './types';
export type MotionWord={text:string;start:number;end:number};
export type MotionScene={id:string;start:number;end:number;kind:'statement'|'rail'|'source'|'orbit';words:MotionWord[]};
export function buildMotionScenes(project:EditorProject,transcript:TranscriptWord[]):MotionScene[]{
 const cues=captionCues(project,transcript).filter(c=>c.text),groups:typeof cues[]=[];
 for(const cue of cues){const last=groups.at(-1);if(!last||last.length>=6||cue.start-last[0]!.start>2.4||cue.start-last.at(-1)!.spokenEnd>.4)groups.push([cue]);else last.push(cue)}
 return groups.map((group,i)=>({id:`motion-${i}`,start:group[0]!.start,end:Math.min(projectDuration(project),groups[i+1]?.[0]?.start??group.at(-1)!.spokenEnd),kind:(['statement','rail','source','orbit'] as const)[i%4]!,words:group.map(c=>({text:c.text,start:c.start,end:Math.min(c.spokenEnd,groups[i+1]?.[0]?.start??projectDuration(project))}))}));
}
export function motionTimelineKey(project:EditorProject){return JSON.stringify(project.clips.map(c=>[c.id,c.sourceId,c.trimIn,c.trimOut,c.speed]))}
export function motionError(project:EditorProject){if(project.motionScenes?.length&&project.motionTimelineKey!==motionTimelineKey(project))return 'The timeline changed. Rebuild motion scenes from the transcript before exporting.';const total=projectDuration(project);let end=-1;for(const s of project.motionScenes??[]){if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<=s.start||s.end>total+.001||s.start<end||!s.words.length||s.words.some(w=>!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<s.start||w.end>s.end+.001||w.end<=w.start))return 'Motion scenes no longer match the timeline. Rebuild them from the transcript after trim, speed or clip changes.';end=s.end}return null}
export function motionSounds(scenes:MotionScene[]):SfxEvent[]{return scenes.flatMap((s,i)=>[{id:`motion-in-${i}`,kind:'whoosh' as const,time:s.start,duration:Math.min(.2,(s.end-s.start)/2),reason:'Motion scene entry'},{id:`motion-hit-${i}`,kind:'impact' as const,time:s.words[0]!.start,duration:.12,reason:'Motion keyword reveal'}])}
const ease=(t:number)=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
export function drawMotion(ctx:CanvasRenderingContext2D,canvas:HTMLCanvasElement,video:HTMLVideoElement,project:EditorProject,time:number){
 const scenes=project.motionScenes??[],scene=scenes.find(s=>time>=s.start&&time<s.end);if(!scene)return;
 const index=scenes.indexOf(scene),w=canvas.width,h=canvas.height,dark=scene.kind==='orbit',paper=index%2?'#E9DECD':'#F5F3F0',ink=dark?'#F4F1EA':'#262D3A',accent=dark?'#FBED4F':'#7A2D34',local=time-scene.start,enter=ease(local/.32);
 ctx.save();ctx.fillStyle=dark?'#111722':paper;ctx.fillRect(0,0,w,h);
 ctx.strokeStyle=dark?'rgba(244,241,234,.05)':'rgba(52,78,52,.06)';ctx.lineWidth=1;
 const drift=(time*7)%60;for(let x=-60+drift;x<w+60;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=-60+drift;y<h+60;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
 for(let i=0;i<9;i++){const x=w*(.08+((i*.137)% .86)),y=h*(.12+((i*.231)% .75))+Math.sin(time*1.2+i)*8;ctx.fillStyle=accent+'22';ctx.beginPath();ctx.arc(x,y,2+(i%3),0,Math.PI*2);ctx.fill()}
 ctx.fillStyle=accent;ctx.font=`700 ${w*.023}px CDBody,sans-serif`;ctx.textAlign='left';ctx.fillText(`MOTION / ${String(index+1).padStart(2,'0')}`,w*.08,h*.1);
 const shown=scene.words.filter(x=>time>=x.start),active=shown.at(-1),keyword=scene.words.reduce((a,b)=>a.text.length>b.text.length?a:b);
 const text=(value:string,x:number,y:number,size:number,color:string,max=w*.82)=>{ctx.font=`800 ${size}px CDBody,sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,x,y,max)};
 if(scene.kind==='statement'){
  ctx.save();ctx.translate(w/2,h*.43+(1-enter)*h*.06+Math.sin(time*2)*4);ctx.scale(.88+.12*enter,.88+.12*enter);text(active?.text??'',0,0,w*.16,accent,w*.84);ctx.fillStyle='#28C8A0';ctx.fillRect(-w*.33,w*.13,w*.66*ease((local-.12)/.35),w*.018);ctx.restore();
  shown.forEach((word,i)=>{if(word!==active)text(word.text,w*.5,h*.58+i*h*.035,w*.043,ink+'99')});
 }else if(scene.kind==='rail'){
  ctx.strokeStyle='#28C8A0';ctx.lineWidth=w*.007;ctx.beginPath();ctx.moveTo(w*.12,h*.27);ctx.lineTo(w*.12,h*.8);ctx.stroke();
  shown.forEach((word,i)=>{const p=ease((time-word.start)/.25),y=h*(.29+i*.082);ctx.fillStyle=i===shown.length-1?accent:'#344E34';ctx.beginPath();ctx.arc(w*.12,y,w*.018*p,0,Math.PI*2);ctx.fill();ctx.save();ctx.globalAlpha=p;ctx.translate((1-p)*w*.12,0);text(word.text,w*.53,y,w*(word===keyword ? .1 : .067),i===shown.length-1?accent:ink,w*.66);ctx.restore()});
 }else if(scene.kind==='source'){
  const x=w*.12,y=h*.23+Math.sin(time*1.8)*h*.006,cw=w*.76,ch=h*.4;
  ctx.save();ctx.translate(w/2,h*.42);ctx.rotate(Math.sin(time)*.025);ctx.translate(-w/2,-h*.42);ctx.fillStyle='#262D3A';ctx.fillRect(x+8,y+10,cw,ch);ctx.fillStyle='#FFFFFF';ctx.fillRect(x-5,y-5,cw+10,ch+10);if(video.videoWidth){const scale=Math.max(cw/video.videoWidth,ch/video.videoHeight);ctx.beginPath();ctx.rect(x,y,cw,ch);ctx.clip();ctx.drawImage(video,x+(cw-video.videoWidth*scale)/2,y+(ch-video.videoHeight*scale)/2,video.videoWidth*scale,video.videoHeight*scale)}ctx.restore();
  text(active?.text??'',w/2,h*.75,w*.12,accent);text('Your source footage',w/2,h*.87,w*.027,ink+'99');
 }else{
  ctx.save();ctx.translate(w/2,h*.47);ctx.rotate(time*.08);ctx.strokeStyle='#28C8A0';ctx.lineWidth=w*.004;ctx.setLineDash([w*.02,w*.018]);ctx.beginPath();ctx.ellipse(0,0,w*.34,h*.21,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  text(active?.text??'',w/2,h*.46,w*.14,accent);
  shown.filter(s=>s!==active).forEach((word,i)=>{const angle=-Math.PI/2+i*1.25+Math.sin(time)*.04;text(word.text,w/2+Math.cos(angle)*w*.29,h*.47+Math.sin(angle)*h*.2,w*.05,ink,w*.4)});
 }
 ctx.fillStyle=accent;ctx.fillRect(w*.08,h*.92,w*.84*Math.min(1,local/(scene.end-scene.start)),h*.004);
 // Short maroon wipe bridges layouts without holding a static card.
 if(local<.16){ctx.fillStyle='#7A2D34';ctx.fillRect(0,-h*ease(local/.16),w,h)}
 ctx.restore();
}
