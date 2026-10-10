// Hard brush, stroke and smudge ops for the canonical layer stack. Spec: witness_log/HYPOTHESES.md "Hard brush, stroke op and smudge op" (K1-K12).
// Ops: {op:'hdab',layer,x,y,r,c,a} | {op:'stroke',layer,kind:'hard'|'soft',pts,r,c,a,spacing?} | {op:'smudge',layer,pts,r,s}. Only + - * / Math.sqrt, every step through Math.fround.
(function (root) {
  const F = Math.fround, node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack;
  // ---- hard round dab: 1-pixel linear anti-aliased edge (coverage 0.5*a on the circle), premultiplied source-over like the soft dab
  function hdab(l, W, o, defect) {
    const r = F(o.r), x0 = Math.max(0, Math.floor(o.x - o.r - 1)), x1 = Math.min(W - 1, Math.ceil(o.x + o.r + 1)), y0 = Math.max(0, Math.floor(o.y - o.r - 1)), y1 = Math.min(W - 1, Math.ceil(o.y + o.r + 1)), half = defect === 'ramp' ? 0.75 : 0.5, pix = l.pix, a = F(o.a);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = F(F(x + 0.5) - F(o.x)), dy = F(F(y + 0.5) - F(o.y)), d = F(Math.sqrt(F(F(dx * dx) + F(dy * dy)))), t = F(F(r - d) + half); if (t <= 0) continue;
      const cov = F((t >= 1 ? 1 : t) * a), i = y * W + x, ia = F(1 - cov);
      for (let k = 0; k < 3; k++) pix[i*4+k] = F(F(F(o.c[k]) * cov) + F(pix[i*4+k] * ia));
      pix[i*4+3] = F(cov + F(pix[i*4+3] * ia));
    }
  }
  // ---- deterministic expansion of a polyline into positions every `step` along it (first at pts[0], remainder carried across vertices)
  function positions(pts, r, spacing) {
    const step = Math.max(F(F(spacing) * F(r)), 1), out = [[pts[0][0], pts[0][1]]]; let carry = 0;
    for (let s = 0; s + 1 < pts.length; s++) {
      const px = pts[s][0], py = pts[s][1], qx = pts[s + 1][0], qy = pts[s + 1][1], dx = qx - px, dy = qy - py, len = Math.sqrt(dx * dx + dy * dy); if (len === 0) continue;
      let t = step - carry; while (t <= len) { out.push([px + dx * (t / len), py + dy * (t / len)]); t += step; } carry = len - (t - step);
    }
    return out;
  }
  const expand = (o) => positions(o.pts, o.r, o.spacing === undefined ? 0.25 : o.spacing).map(([x, y]) => (o.kind === 'hard' ? { op: 'hdab', layer: o.layer, x, y, r: o.r, c: o.c, a: o.a } : { op: 'dab', layer: o.layer, x, y, r: o.r, c: o.c, a: o.a }));
  // ---- smudge: carried footprint P, integer anchors, soft falloff, convex updates
  function smudge(l, W, o, defect) {
    const s = F(o.s); if (!(s > 0)) return; const R = Math.ceil(o.r), n = 2 * R + 1, r2 = F(o.r * o.r), pos = positions(o.pts, o.r, 0.1), pix = l.pix, P = new Float32Array(n * n * 4), f = new Float32Array(n * n);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const d2 = F(F(i * i) + F(j * j)); let t = F(1 - F(d2 / r2)); f[(j + R) * n + i + R] = t > 0 ? F(t * t) : 0; }
    const ax = (p) => Math.floor(p[0]), ay = (p) => Math.floor(p[1]), at = (cx, cy, i, j, k) => { const x = cx + i, y = cy + j; return x < 0 || y < 0 || x >= W || y >= W ? 0 : pix[(y * W + x) * 4 + k]; };
    { const cx = ax(pos[0]), cy = ay(pos[0]); for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) for (let k = 0; k < 4; k++) P[((j + R) * n + i + R) * 4 + k] = at(cx, cy, i, j, k); }
    const is = F(1 - s);
    for (let q = 1; q < pos.length; q++) { const cx = ax(pos[q]), cy = ay(pos[q]);
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const fi = f[(j + R) * n + i + R]; if (fi <= 0) continue; const x = cx + i, y = cy + j, inside = x >= 0 && y >= 0 && x < W && y < W, w = F(s * fi), iw = F(1 - w);
        for (let k = 0; k < 4; k++) { const pi = ((j + R) * n + i + R) * 4 + k, B = inside ? pix[(y * W + x) * 4 + k] : 0, Pv = P[pi];
          if (inside) pix[(y * W + x) * 4 + k] = F(F(B * iw) + F(Pv * w));
          P[pi] = defect === 'nodecay' ? Pv : F(F(Pv * s) + F(B * is)); } } }
  }
  function applyOp(st, o, defect) {
    if (o.op === 'hdab') { const l = st.L[o.layer]; if (!l) throw new Error('hdab: unknown layer ' + o.layer); return hdab(l, st.W, o, defect); }
    if (o.op === 'stroke') { for (const d of expand(o)) { if (d.op === 'hdab') applyOp(st, d, defect); else S.apply(st, d); } return; }
    if (o.op === 'smudge') { const l = st.L[o.layer]; if (!l) throw new Error('smudge: unknown layer ' + o.layer); return smudge(l, st.W, o, defect); }
    return S.apply(st, o);
  }
  // pixel bbox a stroke/smudge op can write (conservative), for the dirty-tile compositor
  function bbox(o, W) { if (o.op === 'hdab' || o.op === 'dab') return [Math.max(0, Math.floor(o.x - o.r - 1)), Math.max(0, Math.floor(o.y - o.r - 1)), Math.min(W - 1, Math.ceil(o.x + o.r + 1)), Math.min(W - 1, Math.ceil(o.y + o.r + 1))];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of o.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const m = Math.ceil(o.r) + 2; return [Math.max(0, Math.floor(x0) - m), Math.max(0, Math.floor(y0) - m), Math.min(W - 1, Math.ceil(x1) + m), Math.min(W - 1, Math.ceil(y1) + m)]; }
  const api = { hdab, positions, expand, smudge, applyOp, bbox };
  if (node) module.exports = api; else root.Brush = api;
})(this);
