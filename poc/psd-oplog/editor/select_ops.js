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
  const F = Math.fround;
  function bboxOf(m, W) { let x0 = W, y0 = W, x1 = -1, y1 = -1; for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? [0, 0, 0, 0] : [x0, y0, x1 + 1, y1 + 1]; }
  // magic wand: spec "Level 2e" (W1-W9). Colour of a pixel = straight RGBA float32 of the layer's own pixels; match = max channel difference <= tol/255 (double arithmetic).
  function wandMask(st, o) {
    const W = st.W, l = st.L[o.layer]; if (!l) throw new Error('sel: unknown layer ' + o.layer); if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) throw new Error('sel: wand needs x and y');
    const sx = Math.floor(o.x), sy = Math.floor(o.y); if (sx < 0 || sy < 0 || sx >= W || sy >= W) throw new Error('sel: wand seed outside the canvas');
    if (!Number.isInteger(o.tol) || o.tol < 0 || o.tol > 255) throw new Error('sel: tol must be an integer 0..255'); if (typeof o.contiguous !== 'boolean') throw new Error('sel: contiguous must be boolean');
    const tol = o.tol / 255, pix = l.pix, col = (i, k) => { const a = pix[i*4+3]; return k === 3 ? (a > 0 ? a : 0) : (a > 0 ? F(pix[i*4+k] / a) : 0); }, s0 = sy * W + sx, c0 = [col(s0, 0), col(s0, 1), col(s0, 2), col(s0, 3)];
    const match = (i) => { for (let k = 0; k < 4; k++) if (Math.abs(c0[k] - col(i, k)) > tol) return false; return true; }, m = new Uint8Array(W * W);
    if (!o.contiguous) { for (let i = 0; i < W * W; i++) if (match(i)) m[i] = 1; return m; }
    const q = new Int32Array(W * W); let h = 0, t = 0; m[s0] = 1; q[t++] = s0; const seen = new Uint8Array(W * W); seen[s0] = 1;
    while (h < t) { const i = q[h++], x = i % W, y = (i / W) | 0; for (let d = 0; d < 4; d++) { const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0), ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0); if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue; const j = ny * W + nx; if (seen[j]) continue; seen[j] = 1; if (match(j)) { m[j] = 1; q[t++] = j; } } }
    return m;
  }
  function growMask(m, W, n) {
    const up = n > 0; let cur = m; for (let it = 0; it < Math.abs(n); it++) { const nx = new Uint8Array(W * W);
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x, a = x > 0 ? cur[i - 1] : (up ? 0 : 1), b = x < W - 1 ? cur[i + 1] : (up ? 0 : 1), c = y > 0 ? cur[i - W] : (up ? 0 : 1), d = y < W - 1 ? cur[i + W] : (up ? 0 : 1); nx[i] = up ? (cur[i] | a | b | c | d) : (cur[i] & a & b & c & d); }
      cur = nx; } return cur;
  }
  function setSel(st, o) {
    const W = st.W;
    if (o.kind === 'wand') { const mode = o.mode === undefined ? 'new' : o.mode; if (mode !== 'new' && mode !== 'add' && mode !== 'sub') throw new Error('sel: mode must be new, add or sub'); if (mode === 'sub' && !st.sel) throw new Error('sel: nothing to subtract from');
      let m = wandMask(st, o); if (st.sel && mode !== 'new') { const p = st.sel.mask, r = new Uint8Array(W * W); for (let i = 0; i < W * W; i++) r[i] = mode === 'add' ? (p[i] | m[i]) : (p[i] & (m[i] ^ 1)); m = r; }
      st.sel = { kind: 'wand', box: bboxOf(m, W), inv: st.sel && mode !== 'new' ? st.sel.inv : false, mask: m }; return; }
    if (o.kind === 'grow') { if (!st.sel) throw new Error('sel: nothing to grow'); if (!Number.isInteger(o.n) || o.n === 0 || Math.abs(o.n) > 32) throw new Error('sel: n must be an integer with 1 <= |n| <= 32'); const m = growMask(st.sel.mask, W, o.n); st.sel = { kind: 'mask', box: bboxOf(m, W), inv: st.sel.inv, mask: m }; return; }
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
  const api = { apply, maskOf, merge, shadow, wandMask, growMask, bboxOf };
  if (typeof module !== 'undefined') module.exports = api; else root.SelectOps = api;
})(this);
