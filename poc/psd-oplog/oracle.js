// Independent oracles for the composite step. (1) spec-form float64 straight-alpha compositor written
// separately from stack.js; (2) the browser's own Canvas2D compositing (W3C-conformant, 8-bit).
(function (root) {
  const hl = (cb, cs) => cs <= 0.5 ? cb * 2 * cs : cb + (2 * cs - 1) - cb * (2 * cs - 1);
  const B = { normal: (b, s) => s, multiply: (b, s) => b * s, screen: (b, s) => b + s - b * s, overlay: (b, s) => hl(s, b), 'hard-light': hl,
    darken: Math.min, lighten: Math.max, difference: (b, s) => Math.abs(b - s), exclusion: (b, s) => b + s - 2 * b * s,
    'soft-light': (cb, cs) => { if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb); const D = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb); return cb + (2 * cs - 1) * (D - cb); } };
  // st: fold state from stack.js (layer pix premult f32, masks). Returns straight RGBA8.
  function spec64(st) {
    const W = st.W, n = W * W, C = new Float64Array(n * 3), A = new Float64Array(n);
    for (const id of st.order) { const l = st.L[id];
      for (let i = 0; i < n; i++) {
        const la = l.pix[i*4+3]; if (la <= 0) continue; const as = la * l.opacity * (l.mask ? l.mask[i] : 1); if (as <= 0) continue;
        const ab = A[i], ar = as + ab * (1 - as);
        for (let k = 0; k < 3; k++) { const cs = l.pix[i*4+k] / la, cb = C[i*3+k]; C[i*3+k] = (1 - as / ar) * cb + (as / ar) * ((1 - ab) * cs + ab * B[l.mode](cb, cs)); }
        A[i] = ar;
      } }
    const out = new Uint8Array(n * 4), q = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5)));
    for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) out[i*4+k] = A[i] > 0 ? q(C[i*3+k]) : 0; out[i*4+3] = q(A[i]); }
    return out;
  }
  // Browser Canvas2D oracle (page only). Layers go in as straight RGBA8 with mask baked into alpha, opacity as globalAlpha.
  function canvas2d(st) {
    const W = st.W, main = document.createElement('canvas'); main.width = main.height = W; const mx = main.getContext('2d', { willReadFrequently: true });
    const q = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5)));
    for (const id of st.order) { const l = st.L[id], img = new ImageData(W, W);
      for (let i = 0; i < W*W; i++) { const la = l.pix[i*4+3]; if (la <= 0) continue; const m = l.mask ? l.mask[i] : 1;
        for (let k = 0; k < 3; k++) img.data[i*4+k] = q(l.pix[i*4+k] / la); img.data[i*4+3] = q(la * m); }
      const c = document.createElement('canvas'); c.width = c.height = W; c.getContext('2d').putImageData(img, 0, 0);
      mx.globalAlpha = l.opacity; mx.globalCompositeOperation = l.mode === 'normal' ? 'source-over' : l.mode; mx.drawImage(c, 0, 0); }
    return new Uint8Array(mx.getImageData(0, 0, W, W).data.buffer.slice(0));
  }
  const api = { spec64, canvas2d };
  if (typeof module !== 'undefined') module.exports = api; else root.Oracle = api;
})(this);
