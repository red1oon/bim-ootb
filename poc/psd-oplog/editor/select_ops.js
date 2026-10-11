// Selection for the editor log: op 'sel' (rect | ellipse | invert | none) and selection-respecting painting. Spec: witness_log/HYPOTHESES.md "Level 1c" (S1-S8).
// A painting op under a selection runs on a SHADOW copy of the layer; the result is written back per pixel by SELECT (inside: shadow, outside: original). Masks are binary, so no arithmetic.
(function (root) {
  const PAINT = { stroke: 1, smudge: 1 };
  function maskOf(kind, x0, y0, x1, y1, W) {
    const m = new Uint8Array(W * W);
    if (kind === 'rect') { for (let y = y0; y < y1; y++) m.fill(1, y * W + x0, y * W + x1); return m; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    for (let y = y0; y < y1; y++) { const dy = (y + 0.5 - cy) / ry, dy2 = dy * dy; for (let x = x0; x < x1; x++) { const dx = (x + 0.5 - cx) / rx; if (dx * dx + dy2 <= 1) m[y * W + x] = 1; } }
    return m;
  }
  function setSel(st, o) {
    const W = st.W;
    if (o.kind === 'none') { st.sel = null; return; }
    if (o.kind === 'invert') { if (!st.sel) throw new Error('sel: nothing to invert'); const m = new Uint8Array(st.sel.mask.length); for (let i = 0; i < m.length; i++) m[i] = st.sel.mask[i] ^ 1; st.sel = { ...st.sel, inv: !st.sel.inv, mask: m }; return; }
    if (o.kind !== 'rect' && o.kind !== 'ellipse') throw new Error('sel: unknown kind ' + o.kind);
    const { x0, y0, x1, y1 } = o; for (const v of [x0, y0, x1, y1]) if (!Number.isInteger(v)) throw new Error('sel: integer box needed');
    if (!(x0 >= 0 && y0 >= 0 && x1 <= W && y1 <= W && x0 < x1 && y0 < y1)) throw new Error('sel: box outside the canvas or empty');
    st.sel = { kind: o.kind, box: [x0, y0, x1, y1], inv: false, mask: maskOf(o.kind, x0, y0, x1, y1, W) };
  }
  // copy the shadow's pixels into the real layer where the mask is 1, inside pixel box b = [x0,y0,x1,y1] inclusive
  function merge(real, work, mask, W, b) { const [x0, y0, x1, y1] = b; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (mask[i]) { const p = i * 4; real[p] = work[p]; real[p + 1] = work[p + 1]; real[p + 2] = work[p + 2]; real[p + 3] = work[p + 3]; } } }
  function shadow(st, layer) { const l = st.L[layer]; if (!l) throw new Error('unknown layer ' + layer); const work = new Float32Array(l.pix); return { work, sh: { pix: work }, shSt: { W: st.W, L: { [layer]: { pix: work } } } }; }
  function apply(st, o, base) {   // true when handled here
    if (o.op === 'sel') { setSel(st, o); return true; }
    if (st.sel && PAINT[o.op]) { const { work, shSt } = shadow(st, o.layer); base(shSt, o); merge(st.L[o.layer].pix, work, st.sel.mask, st.W, [0, 0, st.W - 1, st.W - 1]); return true; }
    return false;
  }
  const api = { apply, maskOf, merge, shadow };
  if (typeof module !== 'undefined') module.exports = api; else root.SelectOps = api;
})(this);
