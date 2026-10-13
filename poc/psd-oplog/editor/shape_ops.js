// Shape paint op for the editor log: {op:'shape', layer, kind:'rect'|'ellipse'|'line', x0, y0, x1, y1, r?, fill?, c?, a?, stroke?:{w, c, a}}.
// Spec: prompts/OPLOGPIC_DESIGN_KIT.md S.1; witness_log/HYPOTHESES.md "Level 2k" (SP1-SP8). Signed distance -> coverage clamp(0.5 - d); only + - * / Math.sqrt, every step through Math.fround.
// Limited to the active selection (st.sel.mask, final 0/1 per pixel) exactly as the brush ops are.
(function (root) {
  const F = Math.fround, node = typeof require !== 'undefined';
  const KEYS = ['op', 'layer', 'kind', 'x0', 'y0', 'x1', 'y1', 'r', 'fill', 'c', 'a', 'stroke'];
  const unit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1, col = (c) => Array.isArray(c) && c.length === 3 && c.every(unit);
  // pure validation of the op against a canvas size W (also used by amend); throws 'shape: ...'
  function validateShape(o, W) {
    const bad = (m) => { throw new Error('shape: ' + m); };
    for (const k of Object.keys(o)) if (!KEYS.includes(k)) bad('unknown field ' + k);
    if (o.kind !== 'rect' && o.kind !== 'ellipse' && o.kind !== 'line') bad('kind must be rect, ellipse or line');
    for (const k of ['x0', 'y0', 'x1', 'y1']) if (!Number.isInteger(o[k]) || o[k] < 0 || o[k] > W) bad(k + ' must be an integer in 0..' + W);
    const line = o.kind === 'line';
    if (!line && (o.x0 >= o.x1 || o.y0 >= o.y1)) bad('the box needs x0 < x1 and y0 < y1');
    if (o.r !== undefined) { if (o.kind !== 'rect') bad('r only goes with rect'); if (!Number.isInteger(o.r) || o.r < 0 || o.r > Math.floor(Math.min(o.x1 - o.x0, o.y1 - o.y0) / 2)) bad('r must be an integer 0..floor(min(w, h) / 2)'); }
    if (line && 'fill' in o) bad('a line has no fill');
    const fill = line ? false : o.fill === undefined ? true : o.fill; if (typeof fill !== 'boolean') bad('fill must be a boolean');
    if (fill) { if (!col(o.c) || !unit(o.a)) bad('fill needs c [r,g,b] in 0..1 and a in 0..1'); } else if ('c' in o || 'a' in o) bad('c and a only go with a fill');
    if (o.stroke !== undefined) { const s = o.stroke; if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).sort().join() !== 'a,c,w' || !Number.isInteger(s.w) || s.w < 1 || s.w > 64 || !col(s.c) || !unit(s.a)) bad('stroke must be exactly {w: integer 1..64, c: [r,g,b], a}'); }
    if (!fill && o.stroke === undefined) bad(line ? 'a line needs a stroke' : 'nothing to paint: no fill and no stroke');
    if (line && o.x0 === o.x1 && o.y0 === o.y1 && !(o.stroke && o.stroke.w >= 1)) bad('a zero-length line needs a stroke');
    return fill;
  }
  function apply(st, o) {
    if (o.op !== 'shape') return false;
    const W = st.W, l = st.L[o.layer]; if (!l) throw new Error('shape: unknown layer ' + o.layer);
    const fill = validateShape(o, W), sel = st.sel ? st.sel.mask : null, line = o.kind === 'line', S = o.stroke, w2 = S ? F(S.w / 2) : 0;
    const cx = F(F(o.x0 + o.x1) / 2), cy = F(F(o.y0 + o.y1) / 2), hw = F(F(o.x1 - o.x0) / 2), hh = F(F(o.y1 - o.y0) / 2), rr = o.r === undefined ? 0 : o.r, ex = F(hw - rr), ey = F(hh - rr), minh = F(Math.min(hw, hh));
    const lx = F(o.x1 - o.x0), ly = F(o.y1 - o.y0), ll = F(F(lx * lx) + F(ly * ly));
    // region: the shape box grown by the stroke margin + 1 (everything outside has coverage 0)
    const m = Math.ceil((S ? S.w / 2 : 0) + 1), bx0 = Math.max(0, Math.min(o.x0, o.x1) - m), by0 = Math.max(0, Math.min(o.y0, o.y1) - m), bx1 = Math.min(W - 1, Math.max(o.x0, o.x1) + m), by1 = Math.min(W - 1, Math.max(o.y0, o.y1) + m);
    const fc = fill ? o.c.map(F) : null, fa = fill ? F(o.a) : 0, sc = S ? S.c.map(F) : null, sa = S ? F(S.a) : 0, pix = l.pix;
    const over = (i, c, a) => { if (a <= 0) return; const ia = F(1 - a), p = i * 4; for (let k = 0; k < 3; k++) pix[p + k] = F(F(c[k] * a) + F(pix[p + k] * ia)); pix[p + 3] = F(a + F(pix[p + 3] * ia)); };
    const cov = (d) => { const v = F(0.5 - d); return v < 0 ? 0 : v > 1 ? 1 : v; };
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const i = y * W + x; if (sel && !sel[i]) continue; const px = F(x + 0.5), py = F(y + 0.5); let d;
      if (line) { const ax = F(px - o.x0), ay = F(py - o.y0); let h = ll > 0 ? F(F(F(ax * lx) + F(ay * ly)) / ll) : 0; h = h < 0 ? 0 : h > 1 ? 1 : h; const dx = F(ax - F(lx * h)), dy = F(ay - F(ly * h)); d = F(F(Math.sqrt(F(F(dx * dx) + F(dy * dy)))) - w2); over(i, sc, F(cov(d) * sa)); continue; }
      if (o.kind === 'rect') { const qx = F(F(Math.abs(F(px - cx))) - ex), qy = F(F(Math.abs(F(py - cy))) - ey), mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, inner = Math.min(Math.max(qx, qy), 0); d = F(F(F(Math.sqrt(F(F(mx * mx) + F(my * my)))) + F(inner)) - rr); }
      else { const u = F(F(px - cx) / hw), v = F(F(py - cy) / hh), f = F(Math.sqrt(F(F(u * u) + F(v * v)))); if (f === 0) d = F(-minh); else { const gu = F(u / hw), gv = F(v / hh), g = F(Math.sqrt(F(F(gu * gu) + F(gv * gv)))); d = F(F(F(f - 1) * f) / g); } }
      if (fill) over(i, fc, F(cov(d) * fa));
      if (S) over(i, sc, F(cov(F(F(Math.abs(d)) - w2)) * sa));
    }
    return true;
  }
  const NAMES = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line' };
  const label = (o) => (o.kind === 'rect' && o.r ? 'Rounded rectangle' : NAMES[o.kind]) + ' on layer ' + o.layer + ' (' + o.x0 + ',' + o.y0 + ')-(' + o.x1 + ',' + o.y1 + ')';
  const api = { apply, validateShape, label };
  if (node) module.exports = api; else root.ShapeOps = api;
})(this);
