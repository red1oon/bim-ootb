// Filter layers for the canonical layer stack (Level 2j; spec prompts/OPLOGPIC_GRADIENT_FILTERS.md Part B, witness_log/HYPOTHESES.md "Level 2j", FL1-FL10).
// Kinds `gblur` {sigma_x10: 1..400} and `sharpen` {amount: 1..500, radius_x10: 1..100, threshold: 0..255}, all integers. They act on the PREMULTIPLIED float32 RGBA of the backdrop (alpha is filtered too), then
// lerp with the backdrop by k = opacity * mask in premultiplied space. The blur is filters/blur.js blurRectTo over the whole canvas. Registered in Stack.spatial (stack.js cannot require blur.js).
(function (root) {
  const F = Math.fround, node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, Bl = node ? require('./blur.js') : root.Blur;
  const KEYS = { gblur: ['sigma_x10'], sharpen: ['amount', 'radius_x10', 'threshold'] }, RANGE = { sigma_x10: [1, 400], amount: [1, 500], radius_x10: [1, 100], threshold: [0, 255] };
  const DEFAULTS = { gblur: () => ({ sigma_x10: 30 }), sharpen: () => ({ amount: 100, radius_x10: 10, threshold: 0 }) };
  function validate(kind, P) {
    const keys = KEYS[kind]; if (!keys) throw new Error('adjust: unknown filter kind ' + kind);
    if (!P || typeof P !== 'object' || Array.isArray(P) || Object.keys(P).sort().join() !== [...keys].sort().join()) throw new Error('adjust: ' + kind + ' needs exactly ' + keys.join(', ') + ' (integers)');
    for (const k of keys) if (!Number.isInteger(P[k]) || P[k] < RANGE[k][0] || P[k] > RANGE[k][1]) throw new Error('adjust: ' + kind + ' ' + k + ' must be an integer ' + RANGE[k][0] + '..' + RANGE[k][1]);
  }
  const sigmaOf = (kind, P) => (kind === 'gblur' ? P.sigma_x10 : P.radius_x10) / 10;
  const radius = (kind, P) => Math.floor(4 * sigmaOf(kind, P) + 0.5);
  const full = (W) => [0, 0, W, W];
  function lerpInto(back, out, a, W) {   // back = lerp(back, out, opacity * mask) on all four premultiplied channels
    const n = W * W; for (let i = 0; i < n; i++) { const k = F(a.opacity * (a.mask ? a.mask[i] : 1)); if (k <= 0) continue; const ik = F(1 - k);
      for (let c = 0; c < 4; c++) { const p = i * 4 + c; back[p] = k >= 1 ? out[p] : F(F(back[p] * ik) + F(out[p] * k)); } }
  }
  // coarse preview (Stack.preview.scale > 1, set by the editor only while a slider is dragged): box-downsample, blur with sigma / scale, bilinear upsample. NOT part of the definition; never used by a fold.
  function down(back, W, s) { const Wc = W / s, out = new Float32Array(Wc * Wc * 4), inv = F(1 / (s * s)); for (let y = 0; y < Wc; y++) for (let x = 0; x < Wc; x++) for (let c = 0; c < 4; c++) { let sum = 0; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) sum += back[((y * s + j) * W + x * s + i) * 4 + c]; out[(y * Wc + x) * 4 + c] = F(sum * inv); } return out; }
  function up(c, Wc, W, s) { const out = new Float32Array(W * W * 4); for (let y = 0; y < W; y++) { const fy = Math.min(Math.max((y + 0.5) / s - 0.5, 0), Wc - 1), y0 = Math.floor(fy), y1 = Math.min(y0 + 1, Wc - 1), ty = fy - y0;
      for (let x = 0; x < W; x++) { const fx = Math.min(Math.max((x + 0.5) / s - 0.5, 0), Wc - 1), x0 = Math.floor(fx), x1 = Math.min(x0 + 1, Wc - 1), tx = fx - x0; for (let k = 0; k < 4; k++) { const a = c[(y0 * Wc + x0) * 4 + k] * (1 - tx) + c[(y0 * Wc + x1) * 4 + k] * tx, b = c[(y1 * Wc + x0) * 4 + k] * (1 - tx) + c[(y1 * Wc + x1) * 4 + k] * tx; out[(y * W + x) * 4 + k] = a * (1 - ty) + b * ty; } } } return out; }
  const blurred = (back, W, sigma) => { const s = S.preview.scale; if (s > 1 && W % s === 0) { const Wc = W / s; return up(Bl.blurRectTo(down(back, W, s), Wc, sigma / s, full(Wc)), Wc, W, s); } return Bl.blurRectTo(back, W, sigma, full(W)); };
  function applyBlur(back, a, W) { if (!(a.opacity > 0)) return; const out = blurred(back, W, a.params.sigma_x10 / 10); lerpInto(back, out, a, W); }
  function applySharpen(back, a, W) {
    if (!(a.opacity > 0)) return; const P = a.params, pb = blurred(back, W, P.radius_x10 / 10), amt = F(P.amount / 100), thr = P.threshold, n = W * W, out = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const al = back[i * 4 + 3]; out[i * 4 + 3] = al;
      for (let c = 0; c < 3; c++) { const p = back[i * 4 + c], d = F(p - pb[i * 4 + c]); if (F(Math.abs(d) * 255) < thr) { out[i * 4 + c] = p; continue; } let o = F(p + F(amt * d)); o = o < 0 ? 0 : o > al ? al : o; out[i * 4 + c] = o; } }
    lerpInto(back, out, a, W);
  }
  S.spatial.gblur = { apply: applyBlur, radius: (P) => radius('gblur', P) };
  S.spatial.sharpen = { apply: applySharpen, radius: (P) => radius('sharpen', P) };
  const label = (kind, o) => (kind === 'gblur' ? 'Adjust blur ' + o.id + ': radius ' + (o.params.sigma_x10 / 10) : 'Adjust sharpen ' + o.id + ': ' + o.params.amount + '%, ' + (o.params.radius_x10 / 10) + ' px' + (o.params.threshold ? ', threshold ' + o.params.threshold : ''));
  const scaleFor = (h) => (h <= 12 ? 1 : h <= 48 ? 2 : 4);   // preview scale from the total filter radius
  const api = { validate, DEFAULTS, radius, label, scaleFor, KINDS: ['gblur', 'sharpen'] };
  if (node) module.exports = api; else root.FilterLayers = api;
})(this);
