// Dirty-tile compositor. Keeps a persistent premultiplied backdrop; after an op, recomposites only the TxT tiles the op can change, by cropping every layer / mask /
// group / adjustment to the tile and running the UNCHANGED canonical S.composite on the crop (per-pixel arithmetic is the same code). W must be a multiple of T.
// Spec and thresholds: witness_log/HYPOTHESES.md "Dirty-tile compositing" (D1-D6).
(function (root) {
const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, Brush = () => (node ? require('../filters/brush.js') : root.Brush);
function makeDirty(st, T = 64) {
  const W = st.W, tn = W / T; if (W % T) throw new Error(`dirty tiles need W multiple of ${T}, got ${W}`);
  const back = new Float32Array(W * W * 4);
  const crop = (a, ch, tx, ty) => { const o = new Float32Array(T * T * ch); for (let y = 0; y < T; y++) { const s = ((ty * T + y) * W + tx * T) * ch; o.set(a.subarray(s, s + T * ch), y * T * ch); } return o; };
  // Filter layers (Level 2j, spec B.2): a tile depends on the backdrop within R = the sum of the radii of all visible filter layers. halo() = R (0 when there is no filter layer).
  const halo = () => { let h = 0; for (const id of Object.keys(st.A)) { const a = st.A[id], sp = S.spatial[a.kind]; if (sp && a.opacity > 0) h += sp.radius(a.params); } return h; };
  const nfil = () => { let n = 0; for (const id of Object.keys(st.A)) { const a = st.A[id]; if (S.spatial[a.kind] && a.opacity > 0) n++; } return n; };   // visible filter layers
  const refl = (i) => { if (i >= 0 && i < W) return i; const n2 = 2 * W, m = ((i % n2) + n2) % n2; return m < W ? m : n2 - 1 - m; };   // the blur's own edge rule (filters/blur.js idx, 'reflect')
  const tilesOfBox = (x0, y0, x1, y1) => { const h = halo(), out = []; x0 = Math.max(0, x0 - h); y0 = Math.max(0, y0 - h); x1 = Math.min(W - 1, x1 + h); y1 = Math.min(W - 1, y1 + h); if (x1 < x0 || y1 < y0) return out;
    for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++) for (let tx = Math.floor(x0 / T); tx <= Math.floor(x1 / T); tx++) out.push(ty * tn + tx); return out; };
  // ids of every dab/mdab touch: same bounds as stack.apply; all other ops are non-local (null = every tile)
  function tilesOf(o) {
    if (o.op === 'hdab' || o.op === 'stroke' || o.op === 'smudge') { const [bx0, by0, bx1, by1] = Brush().bbox(o, W); return tilesOfBox(bx0, by0, bx1, by1); }   // brush ops: tiles of the stroke bbox (filters/brush.js bbox is conservative)
    if (o.op === 'blur' && !o.rect) return null;   // a full-layer blur writes every pixel
    if (o.op !== 'dab' && o.op !== 'mdab' && o.op !== 'blur') return null;
    // blur with a rect writes only inside the rect (it READS neighbours outside, which does not matter for what changes)
    const rr = o.op === 'blur' ? { x0: o.rect[0], x1: o.rect[0] + o.rect[2] - 1, y0: o.rect[1], y1: o.rect[1] + o.rect[3] - 1 } : null;
    const x0 = rr ? rr.x0 : Math.max(0, Math.floor(o.x - o.r)), x1 = rr ? rr.x1 : Math.min(W - 1, Math.ceil(o.x + o.r)), y0 = rr ? rr.y0 : Math.max(0, Math.floor(o.y - o.r)), y1 = rr ? rr.y1 : Math.min(W - 1, Math.ceil(o.y + o.r));
    return tilesOfBox(x0, y0, x1, y1);
  }
  function cropState(tx, ty, h = 0) {
    const L = {}, G = {}, A = {}, Sz = T + 2 * h, ix = new Int32Array(Sz), iy = new Int32Array(Sz); for (let i = 0; i < Sz; i++) { ix[i] = refl(tx * T - h + i); iy[i] = refl(ty * T - h + i); }
    const cr = (a, ch) => { if (!h) return crop(a, ch, tx, ty); const o = new Float32Array(Sz * Sz * ch); for (let y = 0; y < Sz; y++) for (let x = 0; x < Sz; x++) { const s = (iy[y] * W + ix[x]) * ch, d = (y * Sz + x) * ch; for (let c = 0; c < ch; c++) o[d + c] = a[s + c]; } return o; };
    for (const id of Object.keys(st.L)) { const l = st.L[id]; L[id] = { mode: l.mode, opacity: l.opacity, pix: cr(l.pix, 4), mask: l.mask ? cr(l.mask, 1) : null, parent: l.parent, clip: l.clip }; }
    for (const id of Object.keys(st.G)) { const g = st.G[id]; G[id] = { mode: g.mode, opacity: g.opacity, mask: g.mask ? cr(g.mask, 1) : null, children: g.children, parent: g.parent }; }
    for (const id of Object.keys(st.A)) { const a = st.A[id]; A[id] = { kind: a.kind, params: a.params, opacity: a.opacity, mask: a.mask ? cr(a.mask, 1) : null, parent: a.parent }; }
    return { W: Sz, order: st.order, L, G, A, root: st.root, hasTree: st.hasTree };
  }
  function blit(tx, ty, out) { for (let y = 0; y < T; y++) back.set(out.subarray(y * T * 4, (y + 1) * T * 4), ((ty * T + y) * W + tx * T) * 4); }
  const blitFrom = (tx, ty, comp, Wc, ox, oy) => { for (let y = 0; y < T; y++) back.set(comp.subarray(((oy + y) * Wc + ox) * 4, ((oy + y) * Wc + ox + T) * 4), ((ty * T + y) * W + tx * T) * 4); };
  const renderTile = (idx, fullComp) => { const tx = idx % tn, ty = (idx / tn) | 0, h = halo();
    if (!h) return blit(tx, ty, S.composite(cropState(tx, ty)));
    const edge = tx * T - h < 0 || ty * T - h < 0 || tx * T + T + h > W || ty * T + T + h > W;   // FL6 amendment: with more than one filter, a crop that crosses the canvas edge is not bitwise equal (mirrored summation order), so it uses the full frame
    if (fullComp || T + 2 * h >= W || (edge && nfil() > 1)) return blitFrom(tx, ty, fullComp || S.composite(st), W, tx * T, ty * T);   // the halo reaches across the whole canvas: one full-frame composite is the cheaper, identical thing
    blitFrom(tx, ty, S.composite(cropState(tx, ty, h)), T + 2 * h, h, h); };   // the centre T x T of a crop that carries the halo (reflect-extended at the canvas edge)
  const all = () => Array.from({ length: tn * tn }, (_, i) => i);
  // a batch of tiles: with filter layers, if the halo crops would cost more than one full frame, composite the full frame once
  function renderTiles(list) { const h = halo(); if (!h) { for (const i of list) renderTile(i); return; } const cost = list.length * (T + 2 * h) * (T + 2 * h); const m = nfil() > 1 && list.some((i) => { const tx = i % tn, ty = (i / tn) | 0; return tx * T - h < 0 || ty * T - h < 0 || tx * T + T + h > W || ty * T + T + h > W; }), fc = cost >= W * W || T + 2 * h >= W || m ? S.composite(st) : null; for (const i of list) renderTile(i, fc); }
  // call AFTER S.apply(st, o); returns the tile ids it recomposited
  function after(o) { const t = tilesOf(o) || all(); renderTiles(t); return t; }
  return { back, T, tn, tilesOf, cropState, blit, renderTile, renderTiles, halo, after, full: () => { if (halo()) { const fc = S.composite(st); for (const i of all()) renderTile(i, fc); } else for (const i of all()) renderTile(i); } };
}
if (node) module.exports = { makeDirty }; else root.Dirty = { makeDirty };
})(this);
