/** Add the finite timeline duration omitted by MediaRecorder's live WebM muxer. */
export async function withWebmDuration(blob: Blob, milliseconds: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const vint = (at: number, keep: boolean) => {
    let n = 1; while (n <= 8 && !(bytes[at]! & (1 << (8 - n)))) n++;
    if (n > 8 || at + n > bytes.length) throw new Error("Invalid WebM header");
    let value = keep ? bytes[at]! : bytes[at]! & ((1 << (8 - n)) - 1);
    for (let i = 1; i < n; i++) value = value * 256 + bytes[at + i]!;
    return { n, value };
  };
  let segment = 0;
  for (let at = 0; at < bytes.length;) {
    const id = vint(at, true), size = vint(at + id.n, false);
    if (id.value === 0x18538067) { segment = at + id.n + size.n; break; }
    at += id.n + size.n + size.value;
  }
  for (let at = segment; segment && at < bytes.length;) {
    const id = vint(at, true), sizeAt = at + id.n, size = vint(sizeAt, false);
    const start = sizeAt + size.n, end = start + size.value;
    if (id.value === 0x1549a966) {
      let scale = 1000000;
      for (let p = start; p < end;) {
        const child = vint(p, true), length = vint(p + child.n, false), data = p + child.n + length.n;
        if (child.value === 0x2ad7b1) { scale = 0; for(let k=0;k<length.value;k++) scale=scale*256+bytes[data+k]!; }
        if (child.value === 0x4489) return blob;
        p = data + length.value;
      }
      const duration = new Uint8Array(11); duration.set([0x44,0x89,0x88]);
      new DataView(duration.buffer).setFloat64(3, milliseconds * 1000000 / scale);
      const result = new Uint8Array(bytes.length + duration.length);
      result.set(bytes.subarray(0,end)); result.set(duration,end); result.set(bytes.subarray(end),end+11);
      let value = size.value + 11;
      for(let i=size.n-1;i>=0;i--) { result[sizeAt+i]=value%256; value=Math.floor(value/256); }
      result[sizeAt] = result[sizeAt]! | (1 << (8-size.n));
      return new Blob([result], {type:blob.type});
    }
    if (!Number.isFinite(end) || end <= at) break;
    at = end;
  }
  throw new Error("WebM duration could not be written. Try MP4 export.");
}
