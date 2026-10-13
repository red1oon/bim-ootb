// Gradient paint op for the editor log: {op:'grad', layer, kind:'linear'|'radial', x0, y0, x1, y1, c0:[r,g,b], c1:[r,g,b], a0, a1, target?:'pixels'|'mask'}.
// Spec: prompts/OPLOGPIC_GRADIENT_FILTERS.md A.1; witness_log/HYPOTHESES.md "Level 2i" (GD1-GD4). Only + - * / Math.sqrt, every step through Math.fround.
// Limited to the active selection (st.sel.mask, final 0/1 per pixel); target 'mask' REPLACES the layer mask value inside the selection.
(function (root) {
  const F = Math.fround, node = typeof require !== 'undefined';
  const KEYS = ['op', 'layer', 'kind', 'x0', 'y0', 'x1', 'y1', 'c0', 'c1', 'a0', 'a1', 'target'];
  const unit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1, col = (c) => Array.isArray(c) && c.length === 3 && c.every(unit);
  function validate(st, o) {
    const W = st.W, bad = (m) => { throw new Error('grad: ' + m); };
    for (const k of Object.keys(o)) if (!KEYS.includes(k)) bad('unknown field ' + k);
    const l = st.L[o.layer]; if (!l) bad('unknown layer ' + o.layer);
    if (o.kind !== 'linear' && o.kind !== 'radial') bad('kind must be linear or radial');
    for (const k of ['x0', 'y0', 'x1', 'y1']) if (!Number.isInteger(o[k]) || o[k] < 0 || o[k] >= W) bad(k + ' must be an integer inside the canvas');
    if (o.x0 === o.x1 && o.y0 === o.y1) bad('start and end point are the same');
    if (!unit(o.a0) || !unit(o.a1)) bad('a0 and a1 must be numbers in 0..1');
    const target = o.target === undefined ? 'pixels' : o.target; if (target !== 'pixels' && target !== 'mask') bad('target must be pixels or mask');
    if (target === 'pixels') { if (!col(o.c0) || !col(o.c1)) bad('c0 and c1 must be [r,g,b] in 0..1'); } else { if ('c0' in o || 'c1' in o) bad('a mask gradient takes no colours'); if (!l.mask) bad('layer ' + o.layer + ' has no mask'); }
    return { l, target };
  }
  function apply(st, o) {
    if (o.op !== 'grad') return false;
    const W = st.W, { l, target } = validate(st, o), sel = st.sel ? st.sel.mask : null;
    const x0 = F(o.x0), y0 = F(o.y0), dx = F(F(o.x1) - x0), dy = F(F(o.y1) - y0), den = F(F(dx * dx) + F(dy * dy)), rad = F(Math.sqrt(den)), radial = o.kind === 'radial';
    const a0 = F(o.a0), da = F(F(o.a1) - a0), c0 = target === 'pixels' ? o.c0.map(F) : null, dc = target === 'pixels' ? [0, 1, 2].map((k) => F(F(o.c1[k]) - c0[k])) : null;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (sel && !sel[i]) continue;
      const px = F(x + 0.5), py = F(y + 0.5), ex = F(px - x0), ey = F(py - y0); let t;
      if (radial) t = F(F(Math.sqrt(F(F(ex * ex) + F(ey * ey)))) / rad); else t = F(F(F(ex * dx) + F(ey * dy)) / den);
      t = t < 0 ? 0 : t > 1 ? 1 : t; const a = F(a0 + F(t * da));
      if (target === 'mask') { l.mask[i] = a; continue; }
      if (a <= 0) continue; const ia = F(1 - a), p = i * 4;
      for (let k = 0; k < 3; k++) l.pix[p + k] = F(F(F(c0[k] + F(t * dc[k])) * a) + F(l.pix[p + k] * ia));
      l.pix[p + 3] = F(a + F(l.pix[p + 3] * ia));
    }
    return true;
  }
  const label = (o) => 'Gradient ' + o.kind + (o.target === 'mask' ? ' on mask' : '') + ' (' + o.x0 + ',' + o.y0 + ')->(' + o.x1 + ',' + o.y1 + ')';
  const api = { apply, validate, label };
  if (node) module.exports = api; else root.GradOps = api;
})(this);
