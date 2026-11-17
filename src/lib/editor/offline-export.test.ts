import {describe,it,expect} from 'vitest';
import {ivfHeader,ivfPacket,wavPcm} from './offline-export';
describe('offline media packaging',()=>{
 it('writes a 30 fps IVF timebase and exact frame count',()=>{const b=ivfHeader(720,1280,240),v=new DataView(b.buffer);expect(new TextDecoder().decode(b.slice(0,4))).toBe('DKIF');expect(v.getUint16(12,true)).toBe(720);expect(v.getUint16(14,true)).toBe(1280);expect(v.getUint32(16,true)).toBe(30);expect(v.getUint32(20,true)).toBe(1);expect(v.getUint32(24,true)).toBe(240)});
 it('keeps frame index timestamps independent of elapsed render time',()=>{const b=ivfPacket(new Uint8Array([1,2,3]),239),v=new DataView(b.buffer);expect(v.getUint32(0,true)).toBe(3);expect(v.getBigUint64(4,true)).toBe(239n);expect([...b.slice(12)]).toEqual([1,2,3])});
 it('interleaves stereo PCM with clipping and sample-rate metadata',()=>{const audio={numberOfChannels:2,length:3,sampleRate:48000,getChannelData:(c:number)=>new Float32Array(c?[.5,0,-2]:[1,-1,2])} as AudioBuffer;const b=wavPcm(audio),v=new DataView(b.buffer);expect(v.getUint32(40,true)).toBe(12);expect(v.getUint32(24,true)).toBe(48000);expect([0,1,2,3,4,5].map(i=>v.getInt16(44+i*2,true))).toEqual([32767,16384,-32768,0,32767,-32768])});
});
