// Layer masks for the editor log: op 'mask' (add | delete | invert | apply | sel) and mask painting (stroke/smudge with t:'mask'). Spec: witness_log/HYPOTHESES.md "Level 2a" (M1-M9).
// Painting on a mask runs the SAME brush code on a grayscale surrogate layer (m,m,m,1); channel 0 is copied back (only where the selection is 1, when there is one).
(function (root) {
  const F = Math.fround, PAINT = { stroke: 1, smudge: 1 };
  const layerOf = (st, o) => { const l = st.L[o.layer]; if (!l) throw new Error(o.op + ': unknown layer ' + o.layer); return l; };
  function surrogate(st, layer) { const l = st.L[layer], W = st.W, pix = new Float32Array(W * W * 4); for (let i = 0; i < W * W; i++) { const m = l.mask[i]; pix[i*4] = pix[i*4+1] = pix[i*4+2] = m; pix[i*4+3] = 1; } return { work: pix, sh: { pix }, shSt: { W, L: { [layer]: { pix } } } }; }
  function merge(real, work, selMask, W, b) { const [x0, y0, x1, y1] = b; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (!selMask || selMask[i]) real[i] = work[i*4]; } }
  function apply(st, o, base) {
    const W = st.W;
    if (o.op === 'mask') { const l = layerOf(st, o);
      switch (o.kind) {
        case 'add': if (l.mask) throw new Error('mask: layer ' + o.layer + ' already has a mask'); l.mask = new Float32Array(W * W).fill(1); return true;
        case 'delete': if (!l.mask) throw new Error('mask: layer ' + o.layer + ' has no mask'); l.mask = null; return true;
        case 'invert': if (!l.mask) throw new Error('mask: layer ' + o.layer + ' has no mask'); for (let i = 0; i < W * W; i++) l.mask[i] = F(1 - l.mask[i]); return true;
        case 'apply': if (!l.mask) throw new Error('mask: layer ' + o.layer + ' has no mask'); for (let i = 0; i < W * W; i++) { const m = l.mask[i]; for (let k = 0; k < 4; k++) l.pix[i*4+k] = F(l.pix[i*4+k] * m); } l.mask = null; return true;
        case 'sel': if (!st.sel) throw new Error('mask: no selection'); l.mask = Float32Array.from(st.sel.mask, (v) => v); return true;
        default: throw new Error('mask: unknown kind ' + o.kind); } }
    if (o.t === 'mask' && PAINT[o.op]) { const l = layerOf(st, o); if (!l.mask) throw new Error(o.op + ': layer ' + o.layer + ' has no mask'); if (o.op === 'stroke' && o.kind === 'erase') throw new Error('erase does not work on a mask');
      const { work, shSt } = surrogate(st, o.layer); base(shSt, o); merge(l.mask, work, st.sel ? st.sel.mask : null, W, [0, 0, W - 1, W - 1]); return true; }
    return false;
  }
  const api = { apply, surrogate, merge };
  if (typeof module !== 'undefined') module.exports = api; else root.MaskOps = api;
})(this);
