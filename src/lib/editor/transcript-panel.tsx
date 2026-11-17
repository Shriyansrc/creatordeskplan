import { useState } from 'react';
import type { EditorProject, TranscriptWord } from './types';
import { wordTimelineTime } from './project';
export function TranscriptPanel({project,words,change,seek,transcribe,busy}:{project:EditorProject;words:TranscriptWord[];change:(words:TranscriptWord[])=>void;seek:(time:number)=>void;transcribe:()=>void;busy:boolean}) {
 const [selected,setSelected]=useState('');
 const current=words.find(word=>word.id===selected);
 return <section className="transcript-panel"><div className="row"><span className="lab">Word editor</span><span className="sp"/><button className="btn s g" onClick={transcribe} disabled={!project.clips.length||busy}>Transcribe locally</button></div><p className="note">English speech recognition on this device. First use downloads the model. Lovable multilingual transcription is not enabled yet.</p>
 {!words.length?<p>No transcript yet. Transcribe your own clip to create words with detected timing.</p>:<><p className="note">Select a word to correct its text or timing. Saved captions update with it.</p><div className="transcript-words">{words.map(word=><button key={word.id} className={selected===word.id?'selected':''} onClick={()=>{setSelected(word.id);const time=wordTimelineTime(project,word);if(time!==null)seek(time)}} title={`${word.start.toFixed(2)} to ${word.end.toFixed(2)} seconds`}>{word.word}</button>)}</div></>}
 {current&&<div className="word-editor"><h3>Edit selected word</h3><label>Word<input aria-label="Selected transcript word" className="field" value={current.word} onChange={event=>change(words.map(word=>word.id===current.id?{...word,word:event.target.value}:word))}/></label><p className="note">Timing is source-video time, before trim and speed.</p><div className="row">{(['start','end'] as const).map(key=><label key={key}>{key}<input aria-label={`Word ${key} time`} className="field" type="number" min="0" step="0.01" value={current[key]} onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>=0&&(key==='start'?value<current.end:value>current.start))change(words.map(word=>word.id===current.id?{...word,[key]:value}:word))}}/></label>)}</div></div>}
 </section>
}
