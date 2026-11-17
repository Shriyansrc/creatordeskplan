import {describe,it,expect} from 'vitest';
import {createProject} from './project';
import {needsSubjectMasks,subjectBeatError,subjectModeAt} from './subject-beats';
import type {EditorProject} from './types';
const p=():EditorProject=>({...createProject(),clips:[{id:'a',trimIn:2,trimOut:10,speed:2} as EditorProject['clips'][0]],subjectBeats:[{id:'one',start:.5,end:1.5,mode:'sticker'},{id:'two',start:1.5,end:2.5,mode:'silhouette'}]});
describe('timed subject looks',()=>{
 it('leaves original default and old projects unchanged',()=>{expect(subjectModeAt(createProject(),1)).toBe('original');expect(needsSubjectMasks(createProject())).toBe(false)});
 it('switches at exact timeline boundaries without overlaps',()=>{const x=p();expect(subjectModeAt(x,.49)).toBe('original');expect(subjectModeAt(x,.5)).toBe('sticker');expect(subjectModeAt(x,1.5)).toBe('silhouette');expect(subjectModeAt(x,2.5)).toBe('original');expect(subjectBeatError(x)).toBeNull()});
 it('uses global look outside beats and requires masks for beats',()=>{const x={...p(),subjectMode:'silhouette' as const};expect(subjectModeAt(x,0)).toBe('silhouette');expect(needsSubjectMasks(p())).toBe(true)});
 it('rejects overlapping and reversed cues',()=>{const x=p();x.subjectBeats![1]!.start=1;expect(subjectBeatError(x)).toMatch(/overlap/);x.subjectBeats![1]!.end=.5;expect(subjectBeatError(x)).toMatch(/timeline/)});
 it('checks edited duration after speed or trim changes',()=>{const x=p();x.clips[0]!.speed=4;expect(subjectBeatError(x)).toMatch(/timeline/)});
 it('rejects invalid numbers and too many cues',()=>{const x=p();x.subjectBeats![0]!.start=NaN;expect(subjectBeatError(x)).toMatch(/timeline/);x.subjectBeats=Array(17).fill({start:0,end:1,mode:'sticker'});expect(subjectBeatError(x)).toMatch(/16/)});
});
