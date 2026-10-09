// Independent oracles for the composite step. (1) spec-form float64 straight-alpha compositor written
// separately from stack.js; (2) the browser's own Canvas2D compositing (W3C-conformant, 8-bit).
(function (root) {
  const hl = (cb, cs) => cs <= 0.5 ? cb * 2 * cs : cb + (2 * cs - 1) - cb * (2 * cs - 1);
  const B = { normal: (b, s) => s, multiply: (b, s) => b * s, screen: (b, s) => b + s - b * s, overlay: (b, s) => hl(s, b), 'hard-light': hl,
    darken: Math.min, lighten: Math.max, difference: (b, s) => Math.abs(b - s), exclusion: (b, s) => b + s - 2 * b * s,
    'soft-light': (cb, cs) => { if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb); const D = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb); return cb + (2 * cs - 1) * (D - cb); } };
  // st: fold state from stack.js (layer pix premult f32, masks). Returns straight RGBA8.
  function spec64raw(st) {   // returns float64 straight colour C (n*3, 0..1) and alpha A
    const W = st.W, n = W * W, C = new Float64Array(n * 3), A = new Float64Array(n);
    for (const id of st.order) { const l = st.L[id];
      for (let i = 0; i < n; i++) {
        const la = l.pix[i*4+3]; if (la <= 0) continue; const as = la * l.opacity * (l.mask ? l.mask[i] : 1); if (as <= 0) continue;
        const ab = A[i], ar = as + ab * (1 - as);
        for (let k = 0; k < 3; k++) { const cs = l.pix[i*4+k] / la, cb = C[i*3+k]; C[i*3+k] = (1 - as / ar) * cb + (as / ar) * ((1 - ab) * cs + ab * B[l.mode](cb, cs)); }
        A[i] = ar;
      } }
    return { C, A };
  }

  // Independent float64 straight-alpha tree compositor (groups + clipping), written from the W3C compositing maths and Porter-Duff source-atop.
  function spec64tree(st) {
    const n = st.W * st.W, Bf = B;
    const zero = () => ({ C: new Float64Array(n * 3), A: new Float64Array(n) });
    const layerSrc = (l) => { const C = new Float64Array(n * 3), A = new Float64Array(n); for (let i = 0; i < n; i++) { const a = l.pix[i*4+3]; A[i] = a; if (a > 0) for (let k = 0; k < 3; k++) C[i*3+k] = l.pix[i*4+k] / a; } return { C, A }; };
    const over64 = (dst, src, mode, op, mask) => { for (let i = 0; i < n; i++) { const as = src.A[i] * op * (mask ? mask[i] : 1); if (as <= 0) continue; const ab = dst.A[i], ar = as + ab * (1 - as);
      for (let k = 0; k < 3; k++) { const cs = src.C[i*3+k], cb = dst.C[i*3+k]; dst.C[i*3+k] = (1 - as / ar) * cb + (as / ar) * ((1 - ab) * cs + ab * Bf[mode](cb, cs)); } dst.A[i] = ar; } };
    const clip64 = (base, chain) => { const iso = layerSrc(base), A = iso.A.slice();   // rule K2: alpha carried through the chain, base alpha reimposed at the end
      for (const c of chain) { const src = layerSrc(c);
        for (let i = 0; i < n; i++) { const as = src.A[i] * c.opacity * (c.mask ? c.mask[i] : 1), ab = A[i]; if (as <= 0 || ab <= 0) continue; const ar = as + ab * (1 - as);
          for (let k = 0; k < 3; k++) { const cs = src.C[i*3+k], cb = iso.C[i*3+k]; iso.C[i*3+k] = (1 - as / ar) * cb + (as / ar) * ((1 - ab) * cs + ab * Bf[c.mode](cb, cs)); } A[i] = ar; } }
      return iso; };   // iso.A still holds the base alpha
    const run = (ids, dst) => { let j = 0;
      while (j < ids.length) { const id = ids[j], g = st.G[id];
        if (g) { j++;
          if (g.mode === 'pass-through') { const inner = run(g.children, { C: dst.C.slice(), A: dst.A.slice() });
            for (let i = 0; i < n; i++) { const k = g.opacity * (g.mask ? g.mask[i] : 1), ab = dst.A[i], ai = inner.A[i], al = (1 - k) * ab + k * ai;
              for (let c = 0; c < 3; c++) dst.C[i*3+c] = al > 0 ? ((1 - k) * ab * dst.C[i*3+c] + k * ai * inner.C[i*3+c]) / al : 0; dst.A[i] = al; } }
          else over64(dst, run(g.children, zero()), g.mode, g.opacity, g.mask);
          continue; }
        const l = st.L[id]; j++; const chain = []; while (j < ids.length && st.L[ids[j]] && st.L[ids[j]].clip) chain.push(st.L[ids[j++]]);
        if (chain.length) over64(dst, clip64(l, chain), l.mode, l.opacity, l.mask);
        else over64(dst, layerSrc(l), l.mode, l.opacity, l.mask); }
      return dst; };
    return run(st.root, zero());
  }
  function spec64(st) {
    const { C, A } = spec64raw(st), n = A.length, out = new Uint8Array(n * 4), q = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5)));
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
  const api = { spec64, spec64raw, spec64tree, canvas2d };
  if (typeof module !== 'undefined') module.exports = api; else root.Oracle = api;
})(this);
