const { chromium } = require('playwright-core');
const html = `<!doctype html><body><script>
window.run = async () => {
  const out = {};
  const W=256;
  // ---- A. precision: darken x0.25 then brighten x4 on a 0..255 ramp
  const ramp = new Uint8ClampedArray(W*4); for(let i=0;i<W;i++){ramp[i*4]=ramp[i*4+1]=ramp[i*4+2]=i;ramp[i*4+3]=255;}
  const mk=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const src=mk(W,1); src.getContext('2d').putImageData(new ImageData(ramp,W,1),0,0);
  const c1=mk(W,1), c2=mk(W,1);
  c1.getContext('2d').filter='brightness(0.25)'; c1.getContext('2d').drawImage(src,0,0);
  c2.getContext('2d').filter='brightness(4)'; c2.getContext('2d').drawImage(c1,0,0);
  const d2=c2.getContext('2d').getImageData(0,0,W,1).data; const u2=new Set(); for(let i=0;i<W;i++)u2.add(d2[i*4]);
  out.canvas2d_levels_after_roundtrip=u2.size;
  // WebGL2 float16 FBO
  function glRoundtrip(fmt){
    const c=mk(W,1); const gl=c.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
    const ext=gl.getExtension('EXT_color_buffer_float')||gl.getExtension('EXT_color_buffer_half_float');
    if(!ext) return 'no float RT';
    const vs='#version 300 es\\nin vec2 p;out vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0,1);}';
    const fs=(m)=>'#version 300 es\\nprecision highp float;uniform sampler2D t;uniform float m;in vec2 uv;out vec4 o;void main(){o=texture(t,uv)*vec4(vec3(m),1.0);}';
    const prog=gl.createProgram();
    for(const [t,s] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs()]]){const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))return gl.getShaderInfoLog(sh);gl.attachShader(prog,sh);}
    gl.linkProgram(prog);gl.useProgram(prog);
    const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    const tex=(internal,type,data)=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,internal,W,1,0,gl.RGBA,type,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);return t;};
    const t0=tex(gl.RGBA8,gl.UNSIGNED_BYTE,new Uint8Array(ramp.buffer));
    const mid=tex(fmt.i,fmt.t,null); const mid2=tex(fmt.i,fmt.t,null);
    const fbo=gl.createFramebuffer();
    const pass=(from,to,m)=>{gl.bindFramebuffer(gl.FRAMEBUFFER,to?fbo:null);if(to)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,to,0);gl.viewport(0,0,W,1);gl.bindTexture(gl.TEXTURE_2D,from);gl.uniform1f(gl.getUniformLocation(prog,'m'),m);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);};
    pass(t0,mid,.25); pass(mid,mid2,4); pass(mid2,null,1);
    const px=new Uint8Array(W*4);gl.readPixels(0,0,W,1,gl.RGBA,gl.UNSIGNED_BYTE,px);const u=new Set();for(let i=0;i<W;i++)u.add(px[i*4]);return u.size;
  }
  out.webgl_rgba8_levels=glRoundtrip({i:WebGL2RenderingContext.RGBA8,t:WebGL2RenderingContext.UNSIGNED_BYTE});
  out.webgl_rgba16f_levels=glRoundtrip({i:WebGL2RenderingContext.RGBA16F,t:WebGL2RenderingContext.HALF_FLOAT});
  out.webgl_rgba32f_levels=glRoundtrip({i:WebGL2RenderingContext.RGBA32F,t:WebGL2RenderingContext.FLOAT});
  // ---- B. blend modes: Canvas2D vs W3C formulas (float reference)
  const f={multiply:(b,s)=>b*s,screen:(b,s)=>b+s-b*s,overlay:(b,s)=>b<=.5?2*b*s:1-2*(1-b)*(1-s)==0?0:1-2*(1-b)*(1-s),
    'hard-light':(b,s)=>s<=.5?2*b*s:1-2*(1-b)*(1-s),darken:Math.min,lighten:Math.max,difference:(b,s)=>Math.abs(b-s),exclusion:(b,s)=>b+s-2*b*s,
    'color-dodge':(b,s)=>b===0?0:s>=1?1:Math.min(1,b/(1-s)),'color-burn':(b,s)=>b>=1?1:s<=0?0:1-Math.min(1,(1-b)/s),
    'soft-light':(b,s)=>{if(s<=.5)return b-(1-2*s)*b*(1-b);const d=b<=.25?((16*b-12)*b+4)*b:Math.sqrt(b);return b+(2*s-1)*(d-b);}};
  f.overlay=(b,s)=>f['hard-light'](s,b);
  out.blend={};
  for(const m of Object.keys(f)){
    const N=64; let maxe=0;
    for(let bi=0;bi<N;bi++)for(let si=0;si<N;si++){
      const bv=Math.round(bi*255/(N-1)),sv=Math.round(si*255/(N-1));
      const c=mk(1,1),x=c.getContext('2d');x.fillStyle='rgb('+bv+','+bv+','+bv+')';x.fillRect(0,0,1,1);x.globalCompositeOperation=m;x.fillStyle='rgb('+sv+','+sv+','+sv+')';x.fillRect(0,0,1,1);
      const got=x.getImageData(0,0,1,1).data[0], exp=255*f[m](bv/255,sv/255);maxe=Math.max(maxe,Math.abs(got-exp));
    }
    out.blend[m]=+maxe.toFixed(2);
  }
  // ---- C. speed: composite 12 layers at 4096x4096
  const S=4096,L=12;
  const layers=[];for(let i=0;i<L;i++){const c=mk(S,S);const x=c.getContext('2d');x.fillStyle='hsl('+(i*30)+',70%,50%)';x.fillRect(0,0,S,S);layers.push(c);}
  const dst=mk(S,S),dx=dst.getContext('2d');
  let t=performance.now();for(const l of layers){dx.globalCompositeOperation='multiply';dx.drawImage(l,0,0);}dx.getImageData(0,0,1,1);
  out.canvas2d_ms_12x4096_composite=Math.round(performance.now()-t);
  // ---- D. determinism: seeded op-log fold, 3 replays, hash
  const ops=[];let s=12345;const rnd=()=>(s=(s*1664525+1013904223)>>>0)/4294967296;
  for(let i=0;i<400;i++)ops.push({k:'dab',x:rnd()*512,y:rnd()*512,r:5+rnd()*40,c:'hsla('+(rnd()*360|0)+',80%,50%,'+(0.2+rnd()*.6).toFixed(2)+')',m:['source-over','multiply','screen','overlay'][i%4]});
  const fold=async()=>{const c=mk(512,512),x=c.getContext('2d');x.fillStyle='#888';x.fillRect(0,0,512,512);for(const o of ops){x.globalCompositeOperation=o.m;x.fillStyle=o.c;x.beginPath();x.arc(o.x,o.y,o.r,0,7);x.fill();}
    const d=x.getImageData(0,0,512,512).data;let h=2166136261;for(let i=0;i<d.length;i++){h^=d[i];h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
  out.replay_hashes=[await fold(),await fold(),await fold()];
  out.gl_renderer=(()=>{const g=mk(1,1).getContext('webgl2');const e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'?';})();
  return out;
};
</script></body>`;
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROMIUM||'/opt/pw-browsers/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const p=await b.newPage();await p.setContent(html);
  console.log(JSON.stringify(await p.evaluate(()=>window.run()),null,1));await b.close();
})();
