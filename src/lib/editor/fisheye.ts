import type { FisheyeSettings } from "./types";

export const DEFAULT_FISHEYE: FisheyeSettings = { enabled: false, strength: 0.35, curvature: 1.5, zoomCompensation: 0.3, edgeDarken: 0.2, lensShine: 0.1, start: 0, end: 5, grow: true };
export function lensStrength(settings: FisheyeSettings, time: number) {
  if (!settings.enabled || time < settings.start || time > settings.end || settings.end <= settings.start) return 0;
  return settings.strength * (settings.grow ? Math.max(0, Math.min(1, (time - settings.start) / (settings.end - settings.start))) : 1);
}
type Lens = { canvas: HTMLCanvasElement; gl: WebGLRenderingContext; texture: WebGLTexture; program: WebGLProgram };
const lenses = new WeakMap<HTMLCanvasElement, Lens | null>();
const cpuSources = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function createLens(): Lens | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, alpha: false });
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0.,1.);}");
  const fragment = compile(gl.FRAGMENT_SHADER, `precision mediump float;varying vec2 uv;uniform sampler2D frame;uniform float strength;uniform float curve;uniform float zoom;uniform float edge;uniform float shine;
  void main(){vec2 p=uv*2.-1.;float r=length(p)/1.414214;float factor=(1.+strength*pow(r,curve))/(1.+strength*zoom);vec2 q=p*factor*.5+.5;vec3 c=texture2D(frame,clamp(q,0.,1.)).rgb;c*=1.-edge*pow(r,2.);float glow=exp(-length(p-vec2(-.45,.55))*10.)*shine;c+=vec3(glow);gl_FragColor=vec4(c,1.);}`);
  const program = gl.createProgram(); const texture = gl.createTexture(); const buffer = gl.createBuffer();
  if (!vertex || !fragment || !program || !texture || !buffer) return null;
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { canvas, gl, texture, program };
}
export function lensMode(canvas: HTMLCanvasElement): "WebGL" | "CPU mesh fallback" | "Unavailable" {
  if (!lenses.has(canvas)) lenses.set(canvas, createLens());
  const lens = lenses.get(canvas);
  if (lens && !lens.gl.isContextLost()) return "WebGL";
  return canvas.getContext("2d") ? "CPU mesh fallback" : "Unavailable";
}
export function drawFisheye(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, settings: FisheyeSettings, time: number) {
  const strength = lensStrength(settings, time);
  if (strength <= 0) return;
  const mode = lensMode(canvas);
  const lens = lenses.get(canvas);
  if (mode === "WebGL" && lens) {
    const { gl, program } = lens;
    if (lens.canvas.width !== canvas.width || lens.canvas.height !== canvas.height) { lens.canvas.width = canvas.width; lens.canvas.height = canvas.height; }
    gl.viewport(0,0,canvas.width,canvas.height); gl.useProgram(program); gl.bindTexture(gl.TEXTURE_2D,lens.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
    for (const [name,value] of Object.entries({ strength, curve: settings.curvature, zoom: settings.zoomCompensation, edge: settings.edgeDarken, shine: settings.lensShine })) gl.uniform1f(gl.getUniformLocation(program,name),value);
    gl.drawArrays(gl.TRIANGLES,0,6); context.drawImage(lens.canvas,0,0); return;
  }
  if (mode === "Unavailable") return;
  let source = cpuSources.get(canvas);
  if (!source) { source = document.createElement("canvas"); cpuSources.set(canvas,source); }
  source.width = canvas.width; source.height = canvas.height;
  const sourceContext = source.getContext("2d"); if (!sourceContext) return;
  sourceContext.drawImage(canvas,0,0);
  // Inverse mesh warp. Each small destination cell samples a distorted source cell.
  const cells = 64;
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const px = (x + 0.5) / cells * 2 - 1; const py = (y + 0.5) / cells * 2 - 1;
    const radius = Math.hypot(px,py)/Math.SQRT2;
    const factor = (1 + strength * radius ** settings.curvature) / (1 + strength * settings.zoomCompensation);
    const sx = Math.max(0,Math.min(canvas.width-1,(px*factor+1)/2*canvas.width));
    const sy = Math.max(0,Math.min(canvas.height-1,(py*factor+1)/2*canvas.height));
    context.drawImage(source,sx,sy,Math.min(canvas.width-sx,canvas.width/cells*factor),Math.min(canvas.height-sy,canvas.height/cells*factor),x*canvas.width/cells,y*canvas.height/cells,canvas.width/cells+1,canvas.height/cells+1);
  }
  const edge = context.createRadialGradient(canvas.width/2,canvas.height/2,0,canvas.width/2,canvas.height/2,Math.hypot(canvas.width,canvas.height)/2);
  edge.addColorStop(0,"rgba(0,0,0,0)"); edge.addColorStop(1,`rgba(0,0,0,${settings.edgeDarken})`); context.fillStyle=edge; context.fillRect(0,0,canvas.width,canvas.height);
  const shine=context.createRadialGradient(canvas.width*.28,canvas.height*.22,0,canvas.width*.28,canvas.height*.22,canvas.width*.3);
  shine.addColorStop(0,`rgba(255,255,255,${settings.lensShine})`);shine.addColorStop(1,"rgba(255,255,255,0)");context.fillStyle=shine;context.fillRect(0,0,canvas.width,canvas.height);
}