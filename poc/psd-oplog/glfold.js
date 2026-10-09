// WebGL2 version of the same fold: one full-screen pass per op, ping-pong float textures.
(function (root) {
  const VS = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0,1);}';
  const FS = `#version 300 es
precision highp float;uniform sampler2D prev;uniform vec2 o;uniform float r,a;uniform vec3 c;uniform int m;out vec4 outc;
void main(){vec3 b=texelFetch(prev,ivec2(gl_FragCoord.xy),0).rgb;vec2 d=gl_FragCoord.xy-o;
float t=1.0-dot(d,d)/(r*r);if(t<=0.0){outc=vec4(b,1);return;}t*=t;float cov=a*t;
vec3 bl=m==0?c:(m==1?b*c:b+c-b*c);outc=vec4(b+(bl-b)*cov,1);}`;
  function renderer() { const g = document.createElement('canvas').getContext('webgl2'); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }
  function fold(ops, W, bits) {
    const cv = document.createElement('canvas'); cv.width = cv.height = W;
    const gl = cv.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no EXT_color_buffer_float');
    const I = bits === 16 ? gl.RGBA16F : gl.RGBA32F, T = bits === 16 ? gl.HALF_FLOAT : gl.FLOAT;
    const prog = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(prog, sh); }
    gl.linkProgram(prog); gl.useProgram(prog);
    const bf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, I, W, W, 0, gl.RGBA, T, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f }; };
    const A = mk(), B = mk(); gl.viewport(0, 0, W, W);
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.f); gl.clearColor(0.5, 0.5, 0.5, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const U = (n) => gl.getUniformLocation(prog, n), mode = { normal: 0, multiply: 1, screen: 2 };
    let src = A, dst = B;
    for (const o of ops) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.bindTexture(gl.TEXTURE_2D, src.t);
      gl.uniform2f(U('o'), o.x, o.y); gl.uniform1f(U('r'), o.r); gl.uniform1f(U('a'), o.a); gl.uniform3f(U('c'), o.c[0], o.c[1], o.c[2]); gl.uniform1i(U('m'), mode[o.m]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); [src, dst] = [dst, src];
    }
    // resolve to RGBA8 (hardware rounding), read back
    const R = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, R); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, W, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const rf = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, rf); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R, 0);
    gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(U('m'), 0); gl.uniform1f(U('r'), 1e-6); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const px = new Uint8Array(W * W * 4); gl.readPixels(0, 0, W, W, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = new Uint8Array(W * W * 3); for (let i = 0; i < W * W; i++) { out[i*3] = px[i*4]; out[i*3+1] = px[i*4+1]; out[i*3+2] = px[i*4+2]; }
    return out;
  }
  root.GLFold = { fold, renderer };
})(this);
