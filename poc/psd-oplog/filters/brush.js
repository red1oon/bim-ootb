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
  // ---- eraser dab: same coverage as hdab, destination-out on all four premultiplied channels (`c` ignored)
  function edab(l, W, o) {
    const r = F(o.r), x0 = Math.max(0, Math.floor(o.x - o.r - 1)), x1 = Math.min(W - 1, Math.ceil(o.x + o.r + 1)), y0 = Math.max(0, Math.floor(o.y - o.r - 1)), y1 = Math.min(W - 1, Math.ceil(o.y + o.r + 1)), pix = l.pix, a = F(o.a);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = F(F(x + 0.5) - F(o.x)), dy = F(F(y + 0.5) - F(o.y)), d = F(Math.sqrt(F(F(dx * dx) + F(dy * dy)))), t = F(F(r - d) + 0.5); if (t <= 0) continue;
      const cov = F((t >= 1 ? 1 : t) * a), ia = F(1 - cov), i = (y * W + x) * 4; for (let k = 0; k < 4; k++) pix[i+k] = F(pix[i+k] * ia);
    }
  }
  // ---- deterministic expansion of a polyline into positions every `step` along it (first at the first point, remainder carried across vertices).
  // PositionBuilder takes points one at a time (live drawing); `positions` is the same code fed a whole polyline, so live == batch by construction.
  function PositionBuilder(r, spacing) {
    const step = Math.max(F(F(spacing) * F(r)), 1); let last = null, carry = 0;
    return { push(x, y) {
      const out = []; if (last === null) { last = [x, y]; out.push([x, y]); return out; }
      const px = last[0], py = last[1], dx = x - px, dy = y - py, len = Math.sqrt(dx * dx + dy * dy); last = [x, y]; if (len === 0) return out;
      let t = step - carry; while (t <= len) { out.push([px + dx * (t / len), py + dy * (t / len)]); t += step; } carry = len - (t - step); return out; } };
  }
  function positions(pts, r, spacing) { const b = PositionBuilder(r, spacing), out = []; for (const p of pts) for (const q of b.push(p[0], p[1])) out.push(q); return out; }
  const expand = (o) => positions(o.pts, o.r, o.spacing === undefined ? 0.25 : o.spacing).map(([x, y]) => (o.kind === 'hard' ? { op: 'hdab', layer: o.layer, x, y, r: o.r, c: o.c, a: o.a } : { op: 'dab', layer: o.layer, x, y, r: o.r, c: o.c, a: o.a }));
  // ---- smudge: carried footprint P, integer anchors, soft falloff, convex updates. SmudgeBuilder takes dab positions one at a time; `smudge` feeds it a whole stroke.
  function SmudgeBuilder(l, W, o, defect) {
    const s = F(o.s), R = Math.ceil(o.r), n = 2 * R + 1, r2 = F(o.r * o.r), pix = l.pix, P = new Float32Array(n * n * 4), f = new Float32Array(n * n), is = F(1 - s); let started = false;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const d2 = F(F(i * i) + F(j * j)); const t = F(1 - F(d2 / r2)); f[(j + R) * n + i + R] = t > 0 ? F(t * t) : 0; }
    const at = (cx, cy, i, j, k) => { const x = cx + i, y = cy + j; return x < 0 || y < 0 || x >= W || y >= W ? 0 : pix[(y * W + x) * 4 + k]; };
    return { active: s > 0, step(pos) {
      if (!(s > 0)) return; const cx = Math.floor(pos[0]), cy = Math.floor(pos[1]);
      if (!started) { started = true; for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) for (let k = 0; k < 4; k++) P[((j + R) * n + i + R) * 4 + k] = at(cx, cy, i, j, k); return; }
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const fi = f[(j + R) * n + i + R]; if (fi <= 0) continue; const x = cx + i, y = cy + j, inside = x >= 0 && y >= 0 && x < W && y < W, w = F(s * fi), iw = F(1 - w);
        for (let k = 0; k < 4; k++) { const pi = ((j + R) * n + i + R) * 4 + k, B = inside ? pix[(y * W + x) * 4 + k] : 0, Pv = P[pi];
          if (inside) pix[(y * W + x) * 4 + k] = F(F(B * iw) + F(Pv * w));
          P[pi] = defect === 'nodecay' ? Pv : F(F(Pv * s) + F(B * is)); } } } };
  }
  function smudge(l, W, o, defect) { const sb = SmudgeBuilder(l, W, o, defect), pb = PositionBuilder(o.r, 0.1); if (!sb.active) return; for (const p of o.pts) for (const q of pb.push(p[0], p[1])) sb.step(q); }
  // ---- blur brush: per dab, blur the surrounding square into a separate buffer and mix it back with the soft falloff * strength
  function BlurBrushBuilder(l, W, o, defect) {
    const Bl = node ? require('./blur.js') : root.Blur, s = F(o.s), R = Math.ceil(o.r), r2 = F(o.r * o.r), sigma = Math.max(1, F(0.2 * o.r)), pix = l.pix, pb = PositionBuilder(o.r, 0.15), n = 2 * R + 1, f = new Float32Array(n * n);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const d2 = F(F(i * i) + F(j * j)), t = F(1 - F(d2 / r2)); f[(j + R) * n + i + R] = t > 0 ? F(t * t) : 0; }
    function dab(pos) {
      const ax = Math.floor(pos[0]), ay = Math.floor(pos[1]), x0 = Math.max(0, ax - R), y0 = Math.max(0, ay - R), x1 = Math.min(W - 1, ax + R), y1 = Math.min(W - 1, ay + R); if (x1 < x0 || y1 < y0) return;
      const rw = x1 - x0 + 1, rh = y1 - y0 + 1, out = Bl.blurRectTo(pix, W, defect === 'sigma' ? sigma * 2 : sigma, [x0, y0, rw, rh]);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const fi = f[(y - ay + R) * n + (x - ax + R)]; if (fi <= 0) continue; const w = F(s * fi), iw = F(1 - w), i = (y * W + x) * 4, k0 = ((y - y0) * rw + (x - x0)) * 4; for (let k = 0; k < 4; k++) pix[i+k] = F(F(pix[i+k] * iw) + F(out[k0+k] * w)); }
    }
    // push: plan AND apply at once (batch / replay). queue + drain: plan now, apply later within a time budget (live drawing on slow devices); the sequence of applied dabs is identical, so results do not depend on the schedule
    const q = []; let head = 0;
    return { active: s > 0, push(x, y) { const ps = pb.push(x, y); for (const p of ps) if (s > 0) dab(p); return ps; },
      queue(x, y) { const ps = pb.push(x, y); if (s > 0) for (const p of ps) q.push(p); return ps; }, pending() { return q.length - head; },
      drain(budgetMs, clock) { const t0 = (clock || Date.now)(), done = []; while (head < q.length) { if (done.length > 0 && (clock || Date.now)() - t0 >= budgetMs) break; const p = q[head++]; dab(p); done.push(p); } if (head === q.length) { q.length = 0; head = 0; } return done; } };
  }
  // ---- stroke: dabs applied as positions arrive (live) or all at once (batch); same code
  function StrokeBuilder(st, o, defect) { if (o.kind === 'blur') { if (!st.L[o.layer]) throw new Error('stroke: unknown layer ' + o.layer); return BlurBrushBuilder(st.L[o.layer], st.W, o, defect); } const pb = PositionBuilder(o.r, o.spacing === undefined ? 0.25 : o.spacing);
    return { push(x, y) { const ps = pb.push(x, y); for (const [px, py] of ps) { const d = { op: o.kind === 'erase' ? 'edab' : o.kind === 'hard' ? 'hdab' : 'dab', layer: o.layer, x: px, y: py, r: o.r, c: o.c, a: o.a }; if (d.op === 'edab') edab(st.L[o.layer], st.W, d); else if (d.op === 'hdab') hdab(st.L[o.layer], st.W, d, defect); else S.apply(st, d); } return ps; } }; }
  function applyOp(st, o, defect) {
    if (o.op === 'hdab') { const l = st.L[o.layer]; if (!l) throw new Error('hdab: unknown layer ' + o.layer); return hdab(l, st.W, o, defect); }
    if (o.op === 'edab') { const l = st.L[o.layer]; if (!l) throw new Error('edab: unknown layer ' + o.layer); return edab(l, st.W, o); }
    if (o.op === 'stroke') { if (!st.L[o.layer]) throw new Error('stroke: unknown layer ' + o.layer); const sb = StrokeBuilder(st, o, defect); for (const p of o.pts) sb.push(p[0], p[1]); return; }
    if (o.op === 'smudge') { const l = st.L[o.layer]; if (!l) throw new Error('smudge: unknown layer ' + o.layer); return smudge(l, st.W, o, defect); }
    return S.apply(st, o);
  }
  // pixel bbox a stroke/smudge op can write (conservative), for the dirty-tile compositor
  function bbox(o, W) { if (o.op === 'hdab' || o.op === 'edab' || o.op === 'dab') return [Math.max(0, Math.floor(o.x - o.r - 1)), Math.max(0, Math.floor(o.y - o.r - 1)), Math.min(W - 1, Math.ceil(o.x + o.r + 1)), Math.min(W - 1, Math.ceil(o.y + o.r + 1))];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of o.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const m = Math.ceil(o.r) + 2; return [Math.max(0, Math.floor(x0) - m), Math.max(0, Math.floor(y0) - m), Math.min(W - 1, Math.ceil(x1) + m), Math.min(W - 1, Math.ceil(y1) + m)]; }
  const api = { hdab, edab, positions, expand, smudge, applyOp, bbox, PositionBuilder, SmudgeBuilder, StrokeBuilder, BlurBrushBuilder };
  if (node) module.exports = api; else root.Brush = api;
})(this);
