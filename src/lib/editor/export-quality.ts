/** Count actual encoded WebM video samples, not animation callbacks. */
export async function inspectExportQuality(blob: Blob, seconds: number) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  function vint(at: number, keep = false) {
    let n=1; while(n<=8 && !(bytes[at]! & (1 << (8-n)))) n++;
    if(n>8 || at+n>bytes.length) throw Error('Unreadable WebM export.');
    let value=keep ? bytes[at]! : bytes[at]! & ((1 << (8-n))-1);
    for(let i=1;i<n;i++) value=value*256+bytes[at+i]!;
    const unknown=!keep && Array.from(bytes.subarray(at,at+n)).every((b,i)=>b===(i===0 ? (1 << (9-n))-1 : 255));
    return {n,value,unknown};
  }
  function elements(start: number, end: number) {
    const out:{id:number;start:number;end:number}[]=[];
    for(let at=start;at<end;) {
      const id=vint(at,true),size=vint(at+id.n),data=at+id.n+size.n;
      const next=size.unknown ? end : data+size.value;
      if(next>bytes.length || next<=at || data>next) throw Error('Unreadable WebM export.');
      out.push({id:id.value,start:data,end:next}); at=next;
    }
    return out;
  }
  const uint=(start:number,end:number)=>{let value=0;for(let i=start;i<end;i++)value=value*256+bytes[i]!;return value};
  const segment=elements(0,bytes.length).find(e=>e.id===0x18538067);
  if(!segment)throw Error('Unreadable WebM export.');
  const children=elements(segment.start,segment.end);
  const tracks=children.find(e=>e.id===0x1654ae6b);
  let videoTrack=0;
  if(tracks)for(const entry of elements(tracks.start,tracks.end).filter(e=>e.id===0xae)) {
    const fields=elements(entry.start,entry.end),type=fields.find(e=>e.id===0x83),number=fields.find(e=>e.id===0xd7);
    if(type && number && uint(type.start,type.end)===1)videoTrack=uint(number.start,number.end);
  }
  if(!videoTrack)throw Error('The export has no readable video track.');
  let frames=0;
  const block=(start:number,end:number)=>{const track=vint(start);if(track.value!==videoTrack)return;const flags=bytes[start+track.n+2];if(flags===undefined || start+track.n+3>end)throw Error('Unreadable video block.');const laced=flags & 6;frames+=laced ? (bytes[start+track.n+3]??0)+1 : 1};
  const pending = children.filter(e=>e.id===0x1f43b675);
  while (pending.length) {
    const cluster = pending.pop()!;
    for (const e of elements(cluster.start, cluster.end)) {
      if (e.id===0xa3) block(e.start,e.end);
      if (e.id===0xa0) for(const b of elements(e.start,e.end)) if(b.id===0xa1) block(b.start,b.end);
      // Live muxers use unknown cluster sizes. Later clusters then appear nested
      // to a size-only reader; descend rather than dropping their video blocks.
      if (e.id===0x1f43b675) pending.push(e);
    }
  }
  if(!Number.isFinite(seconds)||seconds<=0)throw Error('Invalid export duration.');
  return {frames,seconds,fps:frames/seconds};
}
export async function requireExportQuality(blob: Blob, seconds: number) {
  const quality=await inspectExportQuality(blob,seconds);
  // Conservative completion gate. This is not a guarantee of smoothness or sync.
  if(quality.frames<Math.max(1,Math.floor(seconds*15)))throw Error(`Export stopped: only ${quality.frames} video frames were encoded over ${seconds.toFixed(2)} seconds (${quality.fps.toFixed(1)} fps). This is below the 15 fps completion minimum. Close heavy tabs or shorten/simplify the edit, then retry. Your source and edit are unchanged.`);
  return quality;
                                                                                                                                                                           }
