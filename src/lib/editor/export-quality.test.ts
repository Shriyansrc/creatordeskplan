import {describe,it,expect,vi} from 'vitest';
import {Blob as NodeBlob} from 'node:buffer';
vi.stubGlobal('Blob',NodeBlob);
import {inspectExportQuality,requireExportQuality} from './export-quality';
const element=(id:number[],content:number[])=>[...id,0x80|content.length,...content];
function video(count:number,track=1) {
 const tracks=element([0x16,0x54,0xae,0x6b],element([0xae],[...element([0xd7],[track]),...element([0x83],[1])]));
 const cluster=element([0x1f,0x43,0xb6,0x75],Array.from({length:count},()=>element([0xa3],[0x80|track,0,0,0,0])).flat());
 return new Blob([new Uint8Array([0x18,0x53,0x80,0x67,0xff,...tracks,...cluster])],{type:'video/webm'});
}
describe('encoded video quality gate',()=>{
 it('counts video blocks with unknown segment length',async()=>{expect(await inspectExportQuality(video(3),1)).toEqual({frames:3,seconds:1,fps:3})});
 it('rejects a near-still file instead of returning download',async()=>{await expect(requireExportQuality(video(9),8)).rejects.toThrow(/only 9 video frames/)});
 it('accepts the minimum for short clips',async()=>{expect((await requireExportQuality(video(3),.2)).fps).toBe(15)});
 it('finds a nondefault video track',async()=>{expect((await inspectExportQuality(video(2,2),1)).frames).toBe(2)});
 it('counts blocks in later unknown-length clusters',async()=>{
 const first=new Uint8Array(await video(1).arrayBuffer());
 const prefix=Array.from(first.slice(0,-12));
 const unknown=[0x1f,0x43,0xb6,0x75,0xff];
 const block=element([0xa3],[0x81,0,0,0,0]);
 const tracks=element([0x16,0x54,0xae,0x6b],element([0xae],[...element([0xd7],[1]),...element([0x83],[1])]));
 const blob=new Blob([new Uint8Array([0x18,0x53,0x80,0x67,0xff,...tracks,...unknown,...block,...unknown,...block])]);
 expect((await inspectExportQuality(blob,1)).frames).toBe(2);
 });
 it('rejects corrupt containers and invalid timebase',async()=>{await expect(inspectExportQuality(new Blob(['bad']),1)).rejects.toThrow();await expect(inspectExportQuality(video(2),NaN)).rejects.toThrow(/duration/)});
});
