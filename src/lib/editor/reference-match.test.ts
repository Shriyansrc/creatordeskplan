import {describe,it,expect} from 'vitest';
import {frameStats,matchVisualColor} from './reference-match';
import type {EditorClip} from './types';
const stats={luma:100,contrast:25,saturation:.3,warmth:.1,frames:12,seconds:8};
describe('measured reference colour',()=>{
 it('measures real pixels',()=>{const v=frameStats(new Uint8ClampedArray([255,0,0,255,0,0,255,255]));expect(v.luma).toBeCloseTo(36.312);expect(v.warmth).toBe(0);expect(v.saturation).toBe(1)});
 it('keeps matching measurements neutral',()=>{expect(matchVisualColor({id:'a'} as EditorClip,stats,stats)).toEqual({type:'color',clipId:'a',brightness:100,contrast:100,saturation:100,temperature:0})});
 it('bounds estimates, including dark clips',()=>{const result=matchVisualColor({id:'a'} as EditorClip,{...stats,luma:0,contrast:0,saturation:0},{...stats,luma:255,contrast:120,saturation:1,warmth:1});expect(result).toMatchObject({brightness:130,contrast:125,saturation:130,temperature:25})});
});
