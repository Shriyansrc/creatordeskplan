import { captionCues } from './captions';
import { captionFontString, paintCaptionText } from './caption-font';
import type { EditorProject, TranscriptWord } from './types';
/** Three real timed words at a time. Never derives timing from text length. */
export function karaokeAt(project:EditorProject,words:TranscriptWord[],time:number){
 const cues=captionCues(project,words);const active=cues.findIndex(cue=>time>=cue.start&&time<cue.spokenEnd);if(active<0)return null;
 let first=active;while(first>0&&cues[first-1]!.phrase===cues[active]!.phrase)first--;
 const group=first+Math.floor((active-first)/3)*3;return cues.slice(group,group+3).filter(cue=>cue.phrase===cues[active]!.phrase).map(cue=>({text:cue.word.word,active:cue===cues[active]}));
}
export function drawKaraoke(context:CanvasRenderingContext2D,canvas:HTMLCanvasElement,project:EditorProject,words:TranscriptWord[],time:number){
 const line=karaokeAt(project,words,time);if(!line)return;const style=project.captionStyle;const s=canvas.width/720;const size=style.size*s;
 context.save();context.font=captionFontString(style,'caption',size);context.textAlign='left';context.textBaseline='middle';
 const gap=context.measureText(' ').width;const widths=line.map(word=>context.measureText(word.text).width);const total=widths.reduce((sum,width)=>sum+width,0)+gap*(line.length-1);const scale=Math.min(1,canvas.width*.9/Math.max(1,total));context.translate(canvas.width/2,canvas.height*style.position/100);context.scale(scale,scale);let x=-total/2;
 line.forEach((word,i)=>{context.fillStyle=word.active?'#FBED4F':style.color;paintCaptionText(context,word.text,x,0,style,s,'caption');x+=widths[i]!+gap});context.restore();
}
