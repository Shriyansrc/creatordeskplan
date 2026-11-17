import { captionCues } from './captions';
import type { EditorProject, TranscriptWord } from './types';

export type WrappingSettings = { enabled: boolean; centreX: number; centreY: number; radiusX: number; radiusY: number };
export const DEFAULT_WRAPPING: WrappingSettings = { enabled: false, centreX: 50, centreY: 36, radiusX: 31, radiusY: 20 };
export function bubbleScale(seconds: number) {
  const t = Math.max(0,seconds);
  return 1 - Math.exp(-13*t)*Math.cos(18*t)*0.18;
}
/** Speech-timed three-word groups around a manually placed subject-safe ellipse. No face tracking is claimed. */
export function wrappingWords(project: EditorProject, words: TranscriptWord[], time: number) {
  const cues=captionCues(project,words);
  const current=cues.findIndex(c=>time>=c.start&&time<c.end);
  if(current<0)return [];
  const c=cues[current]!;
  const phrase=cues.filter(x=>x.phrase===c.phrase);
  const local=phrase.indexOf(c),group=phrase.slice(Math.floor(local/3)*3,Math.floor(local/3)*3+3);
  return group.filter(x=>time>=x.start).map((cue,i)=>({text:cue.text,keyword:cue.keyword,slot:i,scale:bubbleScale(time-cue.start),start:cue.start}));
}
export function drawWrapping(context:CanvasRenderingContext2D, canvas:HTMLCanvasElement, project:EditorProject, words:TranscriptWord[], time:number, settings:WrappingSettings) {
  const active=wrappingWords(project,words,time);
  for(const cue of active){
    const angle=([-90,-150,-30][cue.slot] ?? -90)*Math.PI/180;
    const x=canvas.width*(settings.centreX+Math.cos(angle)*settings.radiusX)/100;
    const y=canvas.height*(settings.centreY+Math.sin(angle)*settings.radiusY)/100;
    const maxWidth=canvas.width*(cue.slot===0?.68:.43);
    const size=canvas.width*(cue.slot===0?.12:.085);
    context.save();context.translate(x,y);context.rotate(Math.sin(time*2+cue.slot)*.025);context.scale(cue.scale,cue.scale);
    context.font=`900 ${size}px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
    context.textAlign='center';context.textBaseline='middle';context.lineJoin='round';context.strokeStyle='rgba(12,17,28,.7)';context.lineWidth=size*.08;
    context.fillStyle=cue.keyword?'#FBED4F':'#F4F1EA';context.strokeText(cue.text,0,0,maxWidth);context.fillText(cue.text,0,0,maxWidth);context.restore();
  }
}
