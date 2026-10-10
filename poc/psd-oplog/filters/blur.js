// Gaussian blur filter op for the canonical layer stack. Spec: witness_log/HYPOTHESES.md "Gaussian blur filter op vs scipy" (B1-B8).
// Op: {op:'blur', layer, sigma, rect?:[x,y,w,h]}. Acts on the layer's premultiplied float32 RGBA (4 independent channels). Separable, radius floor(4*sigma+0.5) (scipy truncate=4),
// kernel exp(-0.5 i^2/sigma^2) via S.powDet (no Math.exp), normalised in double, rounded to float32; accumulation left to right with Math.fround at every step; edge mode 'reflect'.
// With `rect`, pixels inside the rect become the blur of the source (neighbours outside are read); pixels outside are untouched.
(function (root) {
  const F = Math.fround, node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, EINV = 0.36787944117144233;
  function kernel(sigma, kernelMode) {
    const r = Math.floor(4 * sigma + 0.5), w = new Float32Array(2 * r + 1), raw = new Float64Array(2 * r + 1), s2 = sigma * sigma; let sum = 0;
    for (let i = -r; i <= r; i++) { const t = 0.5 * i * i / s2, v = kernelMode === 'badexp' ? Math.exp(-t * 1.01) : S.powDet(EINV, t); raw[i + r] = v; sum += v; }
    for (let i = 0; i < raw.length; i++) w[i] = F(raw[i] / sum);
    return { r, w };
  }
  function blurLayer(pix, W, sigma, rect, opts) {
    if (!(sigma > 0)) return;
    const [rx, ry, rw, rh] = rect || [0, 0, W, W];
    if (![rx, ry, rw, rh].every(Number.isInteger) || rx < 0 || ry < 0 || rw < 1 || rh < 1 || rx + rw > W || ry + rh > W) throw new Error('blur rect outside the layer: ' + JSON.stringify(rect));
    const { r, w } = kernel(sigma, opts && opts.kernelMode), clampEdge = opts && opts.edge === 'clamp', n2 = 2 * W;
    const idx = (i) => { if (i >= 0 && i < W) return i; if (clampEdge) return i < 0 ? 0 : W - 1; const m = ((i % n2) + n2) % n2; return m < W ? m : n2 - 1 - m; };
    const rows = rh + 2 * r, tmp = new Float32Array(rows * rw * 4);
    for (let j = 0; j < rows; j++) { const sy = idx(ry - r + j) * W;   // horizontal pass on (reflected) source row, only the columns of the rect
      for (let x = 0; x < rw; x++) for (let c = 0; c < 4; c++) { let sum = 0; for (let k = -r; k <= r; k++) sum = F(sum + F(w[k + r] * pix[(sy + idx(rx + x + k)) * 4 + c])); tmp[(j * rw + x) * 4 + c] = sum; } }
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) for (let c = 0; c < 4; c++) {   // vertical pass; tmp row j holds source row ry - r + j
      let sum = 0; for (let k = 0; k <= 2 * r; k++) sum = F(sum + F(w[k] * tmp[((y + k) * rw + x) * 4 + c])); pix[((ry + y) * W + rx + x) * 4 + c] = sum; }
  }
  // same maths as blurLayer but the result goes to a NEW buffer (rect w*h*4); the source layer is not modified
  function blurRectToRef(pix, W, sigma, rect) {
    const [rx, ry, rw, rh] = rect, { r, w } = kernel(sigma), n2 = 2 * W, idx = (i) => { if (i >= 0 && i < W) return i; const m = ((i % n2) + n2) % n2; return m < W ? m : n2 - 1 - m; };
    const rows = rh + 2 * r, tmp = new Float32Array(rows * rw * 4), out = new Float32Array(rw * rh * 4);
    for (let j = 0; j < rows; j++) { const sy = idx(ry - r + j) * W; for (let x = 0; x < rw; x++) for (let c = 0; c < 4; c++) { let sum = 0; for (let k = -r; k <= r; k++) sum = F(sum + F(w[k + r] * pix[(sy + idx(rx + x + k)) * 4 + c])); tmp[(j * rw + x) * 4 + c] = sum; } }
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) for (let c = 0; c < 4; c++) { let sum = 0; for (let k = 0; k <= 2 * r; k++) sum = F(sum + F(w[k] * tmp[((y + k) * rw + x) * 4 + c])); out[(y * rw + x) * 4 + c] = sum; }
    return out;
  }
  // optimised twin of blurRectToRef: identical arithmetic and summation order (so bit-identical results), but reflected index tables, 4 channels per tap loop, a kernel cache and reused scratch buffers
  const kcache = new Map(); let scratchTmp = new Float32Array(0), scratchOut = new Float32Array(0);
  function kernelCached(sigma) { let k = kcache.get(sigma); if (!k) { k = kernel(sigma); if (kcache.size > 64) kcache.clear(); kcache.set(sigma, k); } return k; }
  function blurRectTo(pix, W, sigma, rect) {
    const [rx, ry, rw, rh] = rect, { r, w } = kernelCached(sigma), taps = 2 * r + 1, n2 = 2 * W, idx = (i) => { if (i >= 0 && i < W) return i; const m = ((i % n2) + n2) % n2; return m < W ? m : n2 - 1 - m; };
    const cols = rw + 2 * r, rows = rh + 2 * r, xi = new Int32Array(cols), yi = new Int32Array(rows); for (let i = 0; i < cols; i++) xi[i] = idx(rx - r + i) * 4; for (let j = 0; j < rows; j++) yi[j] = idx(ry - r + j) * W * 4;
    if (scratchTmp.length < rows * rw * 4) scratchTmp = new Float32Array(rows * rw * 4); if (scratchOut.length < rw * rh * 4) scratchOut = new Float32Array(rw * rh * 4); const tmp = scratchTmp, out = scratchOut;
    for (let j = 0; j < rows; j++) { const rb = yi[j]; for (let x = 0; x < rw; x++) { let a0 = 0, a1 = 0, a2 = 0, a3 = 0; for (let k = 0; k < taps; k++) { const o = rb + xi[x + k], wk = w[k]; a0 = F(a0 + F(wk * pix[o])); a1 = F(a1 + F(wk * pix[o + 1])); a2 = F(a2 + F(wk * pix[o + 2])); a3 = F(a3 + F(wk * pix[o + 3])); } const t = (j * rw + x) * 4; tmp[t] = a0; tmp[t + 1] = a1; tmp[t + 2] = a2; tmp[t + 3] = a3; } }
    const stride = rw * 4; for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { let a0 = 0, a1 = 0, a2 = 0, a3 = 0, t = y * stride + x * 4; for (let k = 0; k < taps; k++, t += stride) { const wk = w[k]; a0 = F(a0 + F(wk * tmp[t])); a1 = F(a1 + F(wk * tmp[t + 1])); a2 = F(a2 + F(wk * tmp[t + 2])); a3 = F(a3 + F(wk * tmp[t + 3])); } const o = (y * rw + x) * 4; out[o] = a0; out[o + 1] = a1; out[o + 2] = a2; out[o + 3] = a3; }
    return out;   // NOTE: a view into a reused scratch buffer: valid until the next call
  }
  function applyOp(st, o, opts) {
    if (o.op !== 'blur') return S.apply(st, o);
    const l = st.L[o.layer]; if (!l) throw new Error('blur: unknown layer ' + o.layer); blurLayer(l.pix, st.W, o.sigma, o.rect, opts);
  }
  const api = { kernel, blurLayer, blurRectTo, blurRectToRef, applyOp };
  if (node) module.exports = api; else root.Blur = api;
})(this);
