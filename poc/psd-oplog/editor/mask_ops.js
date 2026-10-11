// Layer masks for the editor log: op 'mask' (add | delete | invert | apply | sel) and mask painting (stroke/smudge with t:'mask'). Spec: witness_log/HYPOTHESES.md "Level 2a" (M1-M9).
// Painting on a mask runs the SAME brush code on a grayscale surrogate layer (m,m,m,1); channel 0 is copied back (only where the selection is 1, when there is one).
(function (root) {
  const F = Math.fround, PAINT = { stroke: 1, smudge: 1 };
  const layerOf = (st, o) => { const l = st.L[o.layer]; if (!l) throw new Error(o.op + ': unknown layer ' + o.layer); return l; };
  function surrogate(st, layer) { const l = st.L[layer], W = st.W, pix = new Float32Array(W * W * 4); for (let i = 0; i < W * W; i++) { const m = l.mask[i]; pix[i*4] = pix[i*4+1] = pix[i*4+2] = m; pix[i*4+3] = 1; } return { work: pix, sh: { pix }, shSt: { W, L: { [layer]: { pix } } } }; }
  function merge(real, work, selMask, W, b) { const [x0, y0, x1, y1] = b; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (!selMask || selMask[i]) real[i] = work[i*4]; } }
  // soft mask edge: two passes of a separable box blur of width 2r+1 (rows then columns, twice), edges clamped to the nearest cell; double arithmetic with + - * / only, one float32 rounding at the end (spec Level 2h)
  function featherMask(src, W, r) {
    const w = 2 * r + 1; let a = Float64Array.from(src), b = new Float64Array(W * W);
    const line = (get, set) => { for (let c = 0; c < W; c++) { let s = 0; for (let k = -r; k <= r; k++) s += get(c, Math.min(W - 1, Math.max(0, k))); for (let i = 0; i < W; i++) { set(c, i, s / w); s += get(c, Math.min(W - 1, i + r + 1)) - get(c, Math.max(0, i - r)); } } };
    for (let pass = 0; pass < 2; pass++) { line((y, x) => a[y * W + x], (y, x, v) => { b[y * W + x] = v; }); line((x, y) => b[y * W + x], (x, y, v) => { a[y * W + x] = v; }); }
    return Float32Array.from(a, (v) => F(v < 1e-9 ? 0 : v > 1 - 1e-9 ? 1 : v));   // snap the ~1e-17 residue of the running sums, so far-outside is exactly 0 and deep-inside exactly 1 (spec amendment F5)
  }
  function apply(st, o, base) {
    const W = st.W;
    if (o.op === 'mask') { const l = st.L[o.layer] || st.A[o.layer]; if (!l) throw new Error('mask: unknown layer ' + o.layer); const isAdj = !st.L[o.layer]; if ('feather' in o && (o.kind !== 'sel' || !Number.isInteger(o.feather) || o.feather < 1 || o.feather > 32)) throw new Error('mask: feather must be an integer 1..32 and only goes with kind sel');
      switch (o.kind) {
        case 'add': if (l.mask) throw new Error('mask: layer ' + o.layer + ' already has a mask'); l.mask = new Float32Array(W * W).fill(1); return true;
        case 'delete': if (!l.mask) throw new Error('mask: layer ' + o.layer + ' has no mask'); l.mask = null; return true;
        case 'invert': if (!l.mask) throw new Error('mask: layer ' + o.layer + ' has no mask'); for (let i = 0; i < W * W; i++) l.mask[i] = F(1 - l.mask[i]); return true;
        case 'apply': if (isAdj) throw new Error('mask: apply does not work on an adjustment (nothing to bake)'); if (!l.mask) throw new Error('mask: layer ' + o.layer + ' has no mask'); for (let i = 0; i < W * W; i++) { const m = l.mask[i]; for (let k = 0; k < 4; k++) l.pix[i*4+k] = F(l.pix[i*4+k] * m); } l.mask = null; return true;
        case 'sel': if (!st.sel) throw new Error('mask: no selection'); l.mask = o.feather ? featherMask(st.sel.mask, W, o.feather) : Float32Array.from(st.sel.mask, (v) => v); return true;
        default: throw new Error('mask: unknown kind ' + o.kind); } }
    if (o.t === 'mask' && PAINT[o.op]) { if (st.A[o.layer]) throw new Error(o.op + ': painting on an adjustment mask is not supported'); const l = layerOf(st, o); if (!l.mask) throw new Error(o.op + ': layer ' + o.layer + ' has no mask'); if (o.op === 'stroke' && o.kind === 'erase') throw new Error('erase does not work on a mask');
      const { work, shSt } = surrogate(st, o.layer); base(shSt, o); merge(l.mask, work, st.sel ? st.sel.mask : null, W, [0, 0, W - 1, W - 1]); return true; }
    return false;
  }
  const api = { apply, surrogate, merge, featherMask };
  if (typeof module !== 'undefined') module.exports = api; else root.MaskOps = api;
})(this);
