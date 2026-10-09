// Independent oracles for the composite step. (1) spec-form float64 straight-alpha compositor written
// separately from stack.js; (2) the browser's own Canvas2D compositing (W3C-conformant, 8-bit).
(function (root) {
  const hl = (cb, cs) => cs <= 0.5 ? cb * 2 * cs : cb + (2 * cs - 1) - cb * (2 * cs - 1);
  const B = { normal: (b, s) => s, multiply: (b, s) => b * s, screen: (b, s) => b + s - b * s, overlay: (b, s) => hl(s, b), 'hard-light': hl,
    darken: Math.min, lighten: Math.max, difference: (b, s) => Math.abs(b - s), exclusion: (b, s) => b + s - 2 * b * s,
    'soft-light': (cb, cs) => { if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb); const D = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb); return cb + (2 * cs - 1) * (D - cb); } };


  // ---- non-separable modes, float64, written from the W3C pseudo-code with explicit comparisons (independent of stack.js)
  const Lum = (C) => 0.3 * C[0] + 0.59 * C[1] + 0.11 * C[2], SatOf = (C) => Math.max(C[0], C[1], C[2]) - Math.min(C[0], C[1], C[2]);
  const ClipColor = (C) => { const L = Lum(C), n = Math.min(C[0], C[1], C[2]), x = Math.max(C[0], C[1], C[2]); let R = C.slice();
    if (n < 0) R = R.map((c) => L + ((c - L) * L) / (L - n)); if (x > 1) R = R.map((c) => L + ((c - L) * (1 - L)) / (x - L)); return R; };
  const SetLum = (C, l) => { const d = l - Lum(C); return ClipColor(C.map((c) => c + d)); };
  const SetSat = (C, s) => { const [r, g, b] = C; let imax, imid, imin;
    if (r >= g) { if (g >= b) { imax = 0; imid = 1; imin = 2; } else if (r >= b) { imax = 0; imid = 2; imin = 1; } else { imax = 2; imid = 0; imin = 1; } }
    else { if (r >= b) { imax = 1; imid = 0; imin = 2; } else if (g >= b) { imax = 1; imid = 2; imin = 0; } else { imax = 2; imid = 1; imin = 0; } }
    const out = [0, 0, 0]; if (C[imax] > C[imin]) { out[imid] = ((C[imid] - C[imin]) * s) / (C[imax] - C[imin]); out[imax] = s; } return out; };
  B.hue = (cb, cs) => SetLum(SetSat(cs, SatOf(cb)), Lum(cb)); B.saturation = (cb, cs) => SetLum(SetSat(cb, SatOf(cs)), Lum(cb)); B.color = (cb, cs) => SetLum(cs, Lum(cb)); B.luminosity = (cb, cs) => SetLum(cb, Lum(cs));
  for (const m of ['hue', 'saturation', 'color', 'luminosity']) B[m].tri = true;
  const Bmix = (mode, cb3, cs3) => B[mode].tri ? B[mode](cb3, cs3) : [0, 1, 2].map((k) => B[mode](cb3[k], cs3[k]));   // returns the blend result as a triple

  // independent natural cubic spline: dense system solved by Gaussian elimination with partial pivoting, evaluated per interval with Horner (a different formulation from stack.js)
  const testHooks = { curve: null };   // test-only: lets a mutation control swap the reference curve evaluator
  function curve64(points) {
    const n = points.length, X = points.map((p) => p[0] / 255), Y = points.map((p) => p[1] / 255), A = Array.from({ length: n }, () => new Array(n + 1).fill(0)), h = []; for (let i = 0; i < n - 1; i++) h[i] = X[i + 1] - X[i];
    A[0][0] = 1; A[n - 1][n - 1] = 1; for (let i = 1; i < n - 1; i++) { A[i][i - 1] = h[i - 1]; A[i][i] = 2 * (h[i - 1] + h[i]); A[i][i + 1] = h[i]; A[i][n] = 6 * ((Y[i + 1] - Y[i]) / h[i] - (Y[i] - Y[i - 1]) / h[i - 1]); }
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
    const M = new Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * M[k]; M[r] = s / A[r][r]; }
    const seg = []; for (let i = 0; i < n - 1; i++) seg.push({ a: Y[i], b: (Y[i + 1] - Y[i]) / h[i] - (h[i] * (2 * M[i] + M[i + 1])) / 6, c: M[i] / 2, d: (M[i + 1] - M[i]) / (6 * h[i]) });
    return (t) => { if (t <= X[0]) return Math.min(1, Math.max(0, Y[0])); if (t >= X[n - 1]) return Math.min(1, Math.max(0, Y[n - 1])); let i = 0; while (t > X[i + 1]) i++; const dt = t - X[i], s = seg[i]; return Math.min(1, Math.max(0, s.a + dt * (s.b + dt * (s.c + dt * s.d)))); };
  }
  // st: fold state from stack.js (layer pix premult f32, masks). Returns straight RGBA8.
  function spec64raw(st) {   // returns float64 straight colour C (n*3, 0..1) and alpha A
    const W = st.W, n = W * W, C = new Float64Array(n * 3), A = new Float64Array(n);
    for (const id of st.order) { const l = st.L[id];
      for (let i = 0; i < n; i++) {
        const la = l.pix[i*4+3]; if (la <= 0) continue; const as = la * l.opacity * (l.mask ? l.mask[i] : 1); if (as <= 0) continue;
        const ab = A[i], ar = as + ab * (1 - as);
        { const cs3 = [0, 1, 2].map((k) => l.pix[i*4+k] / la), cb3 = [C[i*3], C[i*3+1], C[i*3+2]], bm = Bmix(l.mode, cb3, cs3); for (let k = 0; k < 3; k++) C[i*3+k] = (1 - as / ar) * cb3[k] + (as / ar) * ((1 - ab) * cs3[k] + ab * bm[k]); }
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
      { const cs3 = [src.C[i*3], src.C[i*3+1], src.C[i*3+2]], cb3 = [dst.C[i*3], dst.C[i*3+1], dst.C[i*3+2]], bm = Bmix(mode, cb3, cs3); for (let k = 0; k < 3; k++) dst.C[i*3+k] = (1 - as / ar) * cb3[k] + (as / ar) * ((1 - ab) * cs3[k] + ab * bm[k]); } dst.A[i] = ar; } };
    const clip64 = (base, chain) => { const iso = layerSrc(base), A = iso.A.slice();   // rule K2: alpha carried through the chain, base alpha reimposed at the end
      for (const c of chain) { const src = layerSrc(c);
        for (let i = 0; i < n; i++) { const as = src.A[i] * c.opacity * (c.mask ? c.mask[i] : 1), ab = A[i]; if (as <= 0 || ab <= 0) continue; const ar = as + ab * (1 - as);
          { const cs3 = [src.C[i*3], src.C[i*3+1], src.C[i*3+2]], cb3 = [iso.C[i*3], iso.C[i*3+1], iso.C[i*3+2]], bm = Bmix(c.mode, cb3, cs3); for (let k = 0; k < 3; k++) iso.C[i*3+k] = (1 - as / ar) * cb3[k] + (as / ar) * ((1 - ab) * cs3[k] + ab * bm[k]); } A[i] = ar; } }
      return iso; };   // iso.A still holds the base alpha
    const adj64 = (dst, a) => { const P = a.params;
      const f = a.kind === 'invert' ? (c) => 1 - c
        : a.kind === 'levels' ? (c) => { const ib = P.in_black / 255, iw = P.in_white / 255, ob = P.out_black / 255, ow = P.out_white / 255; let x = (c - ib) / (iw - ib); x = Math.min(1, Math.max(0, x)); x = Math.pow(x, 100 / P.gamma_x100); return Math.min(1, Math.max(0, ob + x * (ow - ob))); }
        : a.kind === 'posterize' ? (c) => Math.floor(c * (255 / 256) * P.levels) / (P.levels - 1)
        : a.kind === 'curves' ? (testHooks.curve || curve64)(P.points) : null;
      for (let i = 0; i < n; i++) { const al = dst.A[i]; if (al <= 0) continue; const k = a.opacity * (a.mask ? a.mask[i] : 1); if (k <= 0) continue; const c = [dst.C[i*3], dst.C[i*3+1], dst.C[i*3+2]];
        const out = a.kind === 'threshold' ? (Math.round(255 * (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2])) >= P.level ? [1, 1, 1] : [0, 0, 0]) : c.map(f);
        for (let q = 0; q < 3; q++) dst.C[i*3+q] = c[q] + (out[q] - c[q]) * k; } };
    const run = (ids, dst) => { let j = 0;
      while (j < ids.length) { const id = ids[j], g = st.G[id];
        if (st.A && st.A[id]) { j++; adj64(dst, st.A[id]); continue; }
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
  const api = { spec64, spec64raw, spec64tree, curve64, testHooks, canvas2d };
  if (typeof module !== 'undefined') module.exports = api; else root.Oracle = api;
})(this);
