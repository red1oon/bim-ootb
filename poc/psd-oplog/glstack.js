// WebGL2 twin of stack.js: per-layer ping-pong float textures, one full-screen pass per op, then composite.
(function (root) {
  const VS = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0,1);}';
  const HEAD = '#version 300 es\nprecision highp float;precision highp int;out vec4 outc;\n';
  const COV = 'vec2 d=gl_FragCoord.xy-o;float t=1.0-dot(d,d)/(r*r);float cov=t<=0.0?0.0:a*t*t;\n';
  const FS_DAB = HEAD + 'uniform sampler2D prev;uniform vec2 o;uniform float r,a;uniform vec3 c;void main(){vec4 b=texelFetch(prev,ivec2(gl_FragCoord.xy),0);' + COV + 'float ia=1.0-cov;outc=vec4(c*cov+b.rgb*ia,cov+b.a*ia);}';
  const FS_MDAB = HEAD + 'uniform sampler2D prev;uniform vec2 o;uniform float r,a,v;void main(){vec4 b=texelFetch(prev,ivec2(gl_FragCoord.xy),0);' + COV + 'outc=vec4(b.r+(v-b.r)*cov,0,0,1);}';
  const FS_FILL = HEAD + 'uniform vec4 col;void main(){outc=col;}';
  const BL = `vec3 hardlight(vec3 b,vec3 s){vec3 m=b*(2.0*s),sc=b+(2.0*s-1.0)-b*(2.0*s-1.0);return mix(sc,m,lessThanEqual(s,vec3(0.5)));}
vec3 blendf(int m,vec3 b,vec3 s){
 if(m==0)return s; if(m==1)return b*s; if(m==2)return b+s-b*s; if(m==3)return hardlight(s,b); if(m==5)return hardlight(b,s);
 if(m==6)return min(b,s); if(m==7)return max(b,s); if(m==8)return abs(b-s); if(m==9)return b+s-2.0*b*s;
 vec3 lo=b-(1.0-2.0*s)*b*(1.0-b);vec3 dd=mix(sqrt(b),((16.0*b-12.0)*b+4.0)*b,lessThanEqual(b,vec3(0.25)));vec3 hi=b+(2.0*s-1.0)*(dd-b);
 return mix(hi,lo,lessThanEqual(s,vec3(0.5)));}`;
  const FS_COMP = HEAD + BL + 'uniform sampler2D back,lay,msk;uniform int mode,hasMask;uniform float opacity;void main(){ivec2 q=ivec2(gl_FragCoord.xy);vec4 bk=texelFetch(back,q,0),ly=texelFetch(lay,q,0);'
    + 'float la=ly.a;float mk=hasMask==1?texelFetch(msk,q,0).r:1.0;float as=la*(opacity*mk);if(la<=0.0||as<=0.0){outc=bk;return;}'
    + 'float ab=bk.a;vec3 Cs=ly.rgb/la;vec3 Cb=ab>0.0?bk.rgb/ab:vec3(0.0);vec3 B=blendf(mode,Cb,Cs);'
    + 'vec3 co=(as*(1.0-ab))*Cs+(as*ab)*B+(1.0-as)*bk.rgb;outc=vec4(co,(as+ab)-as*ab);}';
  const FS_OUT = HEAD + 'uniform sampler2D back;void main(){vec4 b=texelFetch(back,ivec2(gl_FragCoord.xy),0);outc=b.a>0.0?vec4(b.rgb/b.a,b.a):vec4(0.0);}';
  const MODE_ID = { normal:0, multiply:1, screen:2, overlay:3, 'soft-light':4, 'hard-light':5, darken:6, lighten:7, difference:8, exclusion:9 };
  function renderer() { const g = document.createElement('canvas').getContext('webgl2'); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }
  function run(ops, W, bits) {
    const cv = document.createElement('canvas'); cv.width = cv.height = W;
    const gl = cv.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no EXT_color_buffer_float');
    const I = bits === 16 ? gl.RGBA16F : gl.RGBA32F, T = bits === 16 ? gl.HALF_FLOAT : gl.FLOAT;
    const mkProg = (fs) => { const p = gl.createProgram(); for (const [t, s] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); } gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); return p; };
    const P = { dab: mkProg(FS_DAB), mdab: mkProg(FS_MDAB), fill: mkProg(FS_FILL), comp: mkProg(FS_COMP), out: mkProg(FS_OUT) };
    const bf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, W, W);
    const mkTex = (internal, type, fmt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, internal, W, W, 0, fmt || gl.RGBA, type, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f }; };
    const surf = (clear) => { const s = { a: mkTex(I, T), b: mkTex(I, T) }; for (const x of [s.a, s.b]) { gl.bindFramebuffer(gl.FRAMEBUFFER, x.f); gl.clearColor(clear[0], clear[1], clear[2], clear[3]); gl.clear(gl.COLOR_BUFFER_BIT); } return s; };
    const U = (p, n) => gl.getUniformLocation(p, n);
    const pass = (prog, s, setup, srcs) => {   // read s.a (cur), write s.b, swap
      gl.useProgram(prog); gl.bindFramebuffer(gl.FRAMEBUFFER, s.b.f);
      const bind = srcs || [['prev', s.a.t]];
      bind.forEach(([n, tex], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U(prog, n), i); });
      setup(); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); [s.a, s.b] = [s.b, s.a];
    };
    const L = {}, order = [];
    for (const o of ops) {
      if (o.op === 'layer') { L[o.id] = { mode: o.mode, opacity: o.opacity, pix: surf([0,0,0,0]), mask: o.mask ? surf([1,0,0,1]) : null }; order.push(o.id); continue; }
      const l = L[o.layer];
      if (o.op === 'set') { if (o.mode) l.mode = o.mode; if (o.opacity !== undefined) l.opacity = o.opacity; }
      else if (o.op === 'fill') pass(P.fill, l.pix, () => gl.uniform4f(U(P.fill, 'col'), o.c[0]*o.a, o.c[1]*o.a, o.c[2]*o.a, o.a));
      else if (o.op === 'dab') pass(P.dab, l.pix, () => { gl.uniform2f(U(P.dab,'o'), o.x, o.y); gl.uniform1f(U(P.dab,'r'), o.r); gl.uniform1f(U(P.dab,'a'), o.a); gl.uniform3f(U(P.dab,'c'), o.c[0], o.c[1], o.c[2]); });
      else if (o.op === 'mdab') pass(P.mdab, l.mask, () => { gl.uniform2f(U(P.mdab,'o'), o.x, o.y); gl.uniform1f(U(P.mdab,'r'), o.r); gl.uniform1f(U(P.mdab,'a'), o.a); gl.uniform1f(U(P.mdab,'v'), o.v); });
    }
    const back = surf([0,0,0,0]);
    for (const id of order) { const l = L[id];
      pass(P.comp, back, () => { gl.uniform1i(U(P.comp,'mode'), MODE_ID[l.mode]); gl.uniform1f(U(P.comp,'opacity'), l.opacity); gl.uniform1i(U(P.comp,'hasMask'), l.mask ? 1 : 0); },
        [['back', back.a.t], ['lay', l.pix.a.t], ['msk', (l.mask || l.pix).a.t]]); }
    const R = mkTex(gl.RGBA8, gl.UNSIGNED_BYTE); gl.useProgram(P.out); gl.bindFramebuffer(gl.FRAMEBUFFER, R.f); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, back.a.t); gl.uniform1i(U(P.out,'back'), 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const px = new Uint8Array(W*W*4); gl.readPixels(0, 0, W, W, gl.RGBA, gl.UNSIGNED_BYTE, px); return px;
  }
  root.GLStack = { run, renderer };
})(this);
