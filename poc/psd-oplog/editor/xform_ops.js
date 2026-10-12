// Move / scale of a whole layer (pixels + mask) for the editor log: op 'xform'. Spec: witness_log/HYPOTHESES.md "Level 1g" (X1-X9).
// {op:'xform', layer, s (per mille 100..4000), cx, cy (pivot 0..W), dx, dy (shift -2048..2048)}; bilinear, premultiplied float32, double arithmetic with + - * / and floor only; mask outside = 1.
(function (root) {
  const F = Math.fround, KEYS = ['op', 'layer', 's', 'cx', 'cy', 'dx', 'dy'].sort().join();
  // src: Float32Array W*W*ch; returns a new Float32Array. outside = the value of neighbours beyond the canvas (0 for pixels, 1 for masks).
  function resample(src, W, ch, s, cx, cy, dx, dy, outside) {
    const k = s / 1000, out = new Float32Array(W * W * ch), o = F(outside);
    for (let y = 0; y < W; y++) {
      const v = (y + 0.5 - dy - cy) / k + cy - 0.5, j0 = Math.floor(v), fy = v - j0, ry = j0 >= 0 && j0 < W, ry1 = j0 + 1 >= 0 && j0 + 1 < W;
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5 - dx - cx) / k + cx - 0.5, i0 = Math.floor(u), fx = u - i0, d = (y * W + x) * ch, in0 = i0 >= 0 && i0 < W, in1 = i0 + 1 >= 0 && i0 + 1 < W;
        if (fx === 0 && fy === 0) { if (in0 && ry) for (let c = 0; c < ch; c++) out[d + c] = src[(j0 * W + i0) * ch + c]; else if (outside !== 0) for (let c = 0; c < ch; c++) out[d + c] = o; continue; }
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        for (let c = 0; c < ch; c++) {
          const a = in0 && ry ? src[(j0 * W + i0) * ch + c] : outside, b = in1 && ry ? src[(j0 * W + i0 + 1) * ch + c] : outside, e = in0 && ry1 ? src[((j0 + 1) * W + i0) * ch + c] : outside, f = in1 && ry1 ? src[((j0 + 1) * W + i0 + 1) * ch + c] : outside;
          out[d + c] = F(w00 * a + w10 * b + w01 * e + w11 * f);
        }
      }
    }
    return out;
  }
  const isInt = Number.isInteger;
  function validate(st, o) {
    if (Object.keys(o).sort().join() !== KEYS) throw new Error('xform: needs exactly op, layer, s, cx, cy, dx, dy');
    const W = st.W; if (!isInt(o.layer) || !st.L[o.layer]) throw new Error('xform: ' + (st.G[o.layer] ? 'a group' : st.A[o.layer] ? 'an adjustment' : 'unknown layer ' + o.layer) + ' cannot be moved here');
    if (!isInt(o.s) || o.s < 100 || o.s > 4000) throw new Error('xform: s must be an integer 100..4000 (per mille)');
    if (!isInt(o.cx) || !isInt(o.cy) || o.cx < 0 || o.cx > W || o.cy < 0 || o.cy > W) throw new Error('xform: the pivot must be integers 0..' + W);
    if (!isInt(o.dx) || !isInt(o.dy) || Math.abs(o.dx) > 2048 || Math.abs(o.dy) > 2048) throw new Error('xform: dx and dy must be integers within +-2048');
  }
  function apply(st, o) {
    if (o.op !== 'xform') return false; validate(st, o); const l = st.L[o.layer], W = st.W;
    const pix = resample(l.pix, W, 4, o.s, o.cx, o.cy, o.dx, o.dy, 0), mask = l.mask ? resample(l.mask, W, 1, o.s, o.cx, o.cy, o.dx, o.dy, 1) : null;
    l.pix.set(pix); if (mask) l.mask.set(mask); return true;
  }
  // centre of the non-transparent bounding box (integers); the canvas centre for an empty layer
  function pivotOf(pix, W) { let x0 = W, y0 = W, x1 = -1, y1 = -1; for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (pix[(y * W + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? [W >> 1, W >> 1] : [(x0 + x1 + 1) >> 1, (y0 + y1 + 1) >> 1]; }
  const api = { apply, validate, resample, pivotOf };
  if (typeof module !== 'undefined') module.exports = api; else root.XformOps = api;
})(this);
