import { describe, expect, it } from 'vitest';
import { karaokeAt } from './karaoke';
import { createProject,clipFromAsset } from './project';
import type { ClipAsset,TranscriptWord } from './types';
const clip=clipFromAsset({sourceId:'a',duration:8,name:'clip'} as ClipAsset);clip.id='a';clip.originId='a';const project={...createProject(),clips:[clip]};
const words:TranscriptWord[]=[{id:'1',clipId:'a',word:'One',start:1,end:1.2},{id:'2',clipId:'a',word:'real',start:1.3,end:1.8},{id:'3',clipId:'a',word:'timing.',start:1.85,end:2.2}];
describe('karaoke captions',()=>{
 it('uses measured start/end without distributing words evenly',()=>{expect(karaokeAt(project,words,.9)).toBeNull();expect(karaokeAt(project,words,1.1)?.filter(w=>w.active).map(w=>w.text)).toEqual(['One']);expect(karaokeAt(project,words,1.5)?.filter(w=>w.active).map(w=>w.text)).toEqual(['real']);expect(karaokeAt(project,words,1.25)).toBeNull();});
 it('follows trim and speed without mutating detected timing',()=>{const p={...project,clips:[{...clip,trimIn:1,speed:2}]};expect(karaokeAt(p,words,.25)?.find(w=>w.active)?.text).toBe('real');expect(words[1]?.start).toBe(1.3);});
});
