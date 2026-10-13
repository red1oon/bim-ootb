// Layer effects for the editor log: {op:'fx', layer, kind:'shadow', dx, dy, blur_x10, c, a} | {op:'fx', layer, kind:'stroke', w, c, a}.
// Spec: prompts/OPLOGPIC_DESIGN_KIT.md X.1; witness_log/HYPOTHESES.md "Level 2l" (FX1-FX7). Acts on the layer's own premultiplied float32 pixels; only + - * / Math.sqrt, every step through Math.fround.
// shadow: the layer's alpha shifted by (dx, dy), tinted, blurred (filters/blur.js on a copy padded with R transparent pixels), composited BEHIND the layer. stroke: an outside outline from the exact Euclidean distance to the 50 % alpha edge, behind the layer.
// Limited to the active selection (st.sel.mask) exactly as the brush ops are.
(function (root) {
  const F = Math.fround, node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, Bl = node ? require('../filters/blur.js') : root.Blur;
  const KEYS = { shadow: ['op', 'layer', 'kind', 'dx', 'dy', 'blur_x10', 'c', 'a'], stroke: ['op', 'layer', 'kind', 'w', 'c', 'a'] };
  const unit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1, col = (c) => Array.isArray(c) && c.length === 3 && c.every(unit), int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  function validateFx(o) {   // pure: no layer lookup (also used by amend)
    const bad = (m) => { throw new Error('fx: ' + m); }, keys = KEYS[o.kind]; if (!keys) bad('kind must be shadow or stroke');
    for (const k of Object.keys(o)) if (!keys.includes(k)) bad('unknown field ' + k + ' for ' + o.kind);
    if (!col(o.c) || !unit(o.a)) bad('c must be [r,g,b] and a a number, both in 0..1');
    if (o.kind === 'shadow') { if (!int(o.dx, -256, 256) || !int(o.dy, -256, 256)) bad('dx and dy must be integers -256..256'); if (!int(o.blur_x10, 0, 400)) bad('blur_x10 must be an integer 0..400'); }
    else if (!int(o.w, 1, 32)) bad('w must be an integer 1..32');
  }
  // exact squared Euclidean distance transform (Felzenszwalb): f = 0 on the source set, INF elsewhere; integer-valued doubles, so exact
  const INF = 1e20;
  function dt1d(f, n, d, v, z) { let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF; for (let q = 1; q < n; q++) { let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); } k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; } }
  function edt2(inside, W) { const g = new Float64Array(W * W), f = new Float64Array(W), d = new Float64Array(W), v = new Int32Array(W), z = new Float64Array(W + 1);
    for (let x = 0; x < W; x++) { for (let y = 0; y < W; y++) f[y] = inside[y * W + x] ? 0 : INF; dt1d(f, W, d, v, z); for (let y = 0; y < W; y++) g[y * W + x] = d[y]; }
    for (let y = 0; y < W; y++) { for (let x = 0; x < W; x++) f[x] = g[y * W + x]; dt1d(f, W, d, v, z); for (let x = 0; x < W; x++) g[y * W + x] = d[x]; } return g; }
  function ringOf(l, W, o) { const n = W * W, inside = new Uint8Array(n); let any = false; for (let i = 0; i < n; i++) if (l.pix[i * 4 + 3] >= 0.5) { inside[i] = 1; any = true; } if (!any) return null;
    const d2 = edt2(inside, W), k = new Float32Array(n), a = F(o.a), wp = F(o.w + 0.5); for (let i = 0; i < n; i++) { if (inside[i]) continue; const d = F(Math.sqrt(d2[i])), v = F(wp - d); k[i] = v <= 0 ? 0 : F((v >= 1 ? 1 : v) * a); } return k; }
  function shadowOf(l, W, o) {   // premultiplied float32 RGBA of the shadow, W x W
    const sigma = o.blur_x10 / 10, R = o.blur_x10 > 0 ? Math.floor(4 * sigma + 0.5) : 0, P = W + 2 * R, c = o.c.map(F), a = F(o.a), sh = new Float32Array(P * P * 4);
    for (let y = 0; y < W; y++) { const sy = y - o.dy; if (sy < 0 || sy >= W) continue; for (let x = 0; x < W; x++) { const sx = x - o.dx; if (sx < 0 || sx >= W) continue; const al = l.pix[(sy * W + sx) * 4 + 3]; if (al <= 0) continue; const v = F(a * al), p = ((y + R) * P + x + R) * 4; sh[p] = F(c[0] * v); sh[p + 1] = F(c[1] * v); sh[p + 2] = F(c[2] * v); sh[p + 3] = v; } }
    const out = R > 0 ? Bl.blurRectTo(sh, P, sigma, [0, 0, P, P]) : sh, res = new Float32Array(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const s = ((y + R) * P + x + R) * 4, d = (y * W + x) * 4; res[d] = out[s]; res[d + 1] = out[s + 1]; res[d + 2] = out[s + 2]; res[d + 3] = out[s + 3]; } return res; }
  function apply(st, o) {
    if (o.op !== 'fx') return false;
    validateFx(o); const l = st.L[o.layer]; if (!l) throw new Error('fx: unknown layer ' + o.layer);
    const W = st.W, n = W * W, sel = st.sel ? st.sel.mask : null, pix = l.pix;
    if (o.kind === 'shadow') { const sh = shadowOf(l, W, o); for (let i = 0; i < n; i++) { if (sel && !sel[i]) continue; const ia = F(1 - pix[i * 4 + 3]), p = i * 4; for (let k = 0; k < 4; k++) pix[p + k] = F(pix[p + k] + F(sh[p + k] * ia)); } return true; }
    const ring = ringOf(l, W, o); if (!ring) return true; const c = o.c.map(F);
    for (let i = 0; i < n; i++) { const k = ring[i]; if (k <= 0 || (sel && !sel[i])) continue; const ia = F(1 - pix[i * 4 + 3]), p = i * 4; for (let q = 0; q < 3; q++) pix[p + q] = F(pix[p + q] + F(F(c[q] * k) * ia)); pix[p + 3] = F(pix[p + 3] + F(k * ia)); }
    return true;
  }
  const label = (o) => (o.kind === 'shadow' ? 'Drop shadow on layer ' + o.layer + ' (' + o.dx + ',' + o.dy + '), blur ' + o.blur_x10 / 10 : 'Outline on layer ' + o.layer + ', ' + o.w + ' px');
  const api = { apply, validateFx, label, edt2 };
  if (node) module.exports = api; else root.FxOps = api;
})(this);
