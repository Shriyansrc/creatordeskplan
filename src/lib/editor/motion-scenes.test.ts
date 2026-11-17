import {describe,it,expect} from 'vitest';
import {createProject} from './project';
import {buildMotionScenes,motionError,motionSounds,motionTimelineKey} from './motion-scenes';
import type {EditorProject,TranscriptWord} from './types';
const project=():EditorProject=>({...createProject(),clips:[{id:'a',originId:'a',sourceId:'source',trimIn:1,trimOut:9,speed:1} as EditorProject['clips'][0]]});
const words:TranscriptWord[]=Array.from({length:24},(_,i)=>({id:String(i),clipId:'a',word:`word${i}`,start:1+i*.3,end:1+i*.3+.25}));
describe('continuous transcript-led scenes',()=>{
 it('uses real word times mapped through trim and speed',()=>{const p=project();p.clips[0]!.speed=2;const scenes=buildMotionScenes(p,words);expect(scenes[0]?.start).toBe(0);expect(scenes[0]?.words[1]?.start).toBeCloseTo(.15);expect(scenes[0]?.words[0]?.end).toBeCloseTo(.125)});
 it('varies layouts without inventing words or speech timing',()=>{const s=buildMotionScenes(project(),words);expect(s.map(x=>x.kind)).toEqual(['statement','rail','source','orbit']);expect(s.flatMap(x=>x.words).map(x=>x.text)).toEqual(words.map(x=>x.word));expect(buildMotionScenes(project(),[])).toEqual([])});
 it('rejects stale timeline scenes after trim or speed edits',()=>{const p=project();p.motionScenes=buildMotionScenes(p,words);p.motionTimelineKey=motionTimelineKey(p);expect(motionError(p)).toBeNull();p.clips[0]!.trimIn=1.2;expect(motionError(p)).toMatch(/timeline changed/) });
 it('rejects overlap, invalid numbers and out-of-range scenes',()=>{const p=project();p.motionScenes=buildMotionScenes(p,words);p.motionTimelineKey=motionTimelineKey(p);p.motionScenes[1]!.start=0;expect(motionError(p)).toMatch(/no longer match/);p.motionScenes[1]!.start=NaN;expect(motionError(p)).toBeTruthy()});
 it('includes synthesized entry and reveal sounds at actual scene starts',()=>{const scenes=buildMotionScenes(project(),words),sounds=motionSounds(scenes);expect(sounds.length).toBe(scenes.length*2);expect(sounds[0]).toMatchObject({kind:'whoosh',time:scenes[0]!.start});expect(sounds[1]?.kind).toBe('impact')});
});
