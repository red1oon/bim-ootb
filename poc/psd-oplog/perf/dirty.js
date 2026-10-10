// Dirty-tile compositor. Keeps a persistent premultiplied backdrop; after an op, recomposites only the TxT tiles the op can change, by cropping every layer / mask /
// group / adjustment to the tile and running the UNCHANGED canonical S.composite on the crop (per-pixel arithmetic is the same code). W must be a multiple of T.
// Spec and thresholds: witness_log/HYPOTHESES.md "Dirty-tile compositing" (D1-D6).
const S = require('../stack.js');
function makeDirty(st, T = 64) {
  const W = st.W, tn = W / T; if (W % T) throw new Error(`dirty tiles need W multiple of ${T}, got ${W}`);
  const back = new Float32Array(W * W * 4);
  const crop = (a, ch, tx, ty) => { const o = new Float32Array(T * T * ch); for (let y = 0; y < T; y++) { const s = ((ty * T + y) * W + tx * T) * ch; o.set(a.subarray(s, s + T * ch), y * T * ch); } return o; };
  // ids of every dab/mdab touch: same bounds as stack.apply; all other ops are non-local (null = every tile)
  function tilesOf(o) {
    if (o.op === 'blur' && !o.rect) return null;   // a full-layer blur writes every pixel
    if (o.op !== 'dab' && o.op !== 'mdab' && o.op !== 'blur') return null;
    // blur with a rect writes only inside the rect (it READS neighbours outside, which does not matter for what changes)
    const rr = o.op === 'blur' ? { x0: o.rect[0], x1: o.rect[0] + o.rect[2] - 1, y0: o.rect[1], y1: o.rect[1] + o.rect[3] - 1 } : null;
    const x0 = rr ? rr.x0 : Math.max(0, Math.floor(o.x - o.r)), x1 = rr ? rr.x1 : Math.min(W - 1, Math.ceil(o.x + o.r)), y0 = rr ? rr.y0 : Math.max(0, Math.floor(o.y - o.r)), y1 = rr ? rr.y1 : Math.min(W - 1, Math.ceil(o.y + o.r)), out = [];
    if (x1 < x0 || y1 < y0) return out;
    for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++) for (let tx = Math.floor(x0 / T); tx <= Math.floor(x1 / T); tx++) out.push(ty * tn + tx);
    return out;
  }
  function cropState(tx, ty) {
    const L = {}, G = {}, A = {};
    for (const id of Object.keys(st.L)) { const l = st.L[id]; L[id] = { mode: l.mode, opacity: l.opacity, pix: crop(l.pix, 4, tx, ty), mask: l.mask ? crop(l.mask, 1, tx, ty) : null, parent: l.parent, clip: l.clip }; }
    for (const id of Object.keys(st.G)) { const g = st.G[id]; G[id] = { mode: g.mode, opacity: g.opacity, mask: g.mask ? crop(g.mask, 1, tx, ty) : null, children: g.children, parent: g.parent }; }
    for (const id of Object.keys(st.A)) { const a = st.A[id]; A[id] = { kind: a.kind, params: a.params, opacity: a.opacity, mask: a.mask ? crop(a.mask, 1, tx, ty) : null, parent: a.parent }; }
    return { W: T, order: st.order, L, G, A, root: st.root, hasTree: st.hasTree };
  }
  function blit(tx, ty, out) { for (let y = 0; y < T; y++) back.set(out.subarray(y * T * 4, (y + 1) * T * 4), ((ty * T + y) * W + tx * T) * 4); }
  const renderTile = (idx) => { const tx = idx % tn, ty = (idx / tn) | 0; blit(tx, ty, S.composite(cropState(tx, ty))); };
  const all = () => Array.from({ length: tn * tn }, (_, i) => i);
  // call AFTER S.apply(st, o); returns the tile ids it recomposited
  function after(o) { const t = tilesOf(o) || all(); for (const i of t) renderTile(i); return t; }
  return { back, T, tn, tilesOf, cropState, blit, renderTile, after, full: () => { for (const i of all()) renderTile(i); } };
}
module.exports = { makeDirty };
