// Export the layer stack to PSD (ag-psd), read it back, re-composite, compare.
// Strict check: PSD read-back == the 8-bit quantised model, byte for byte, and composites hash-equal.
// Loose check: quantised composite vs original float composite (the 8-bit interchange cost).
const fs = require('fs'), path = require('path');
const { writePsd, readPsd, initializeCanvas } = require('ag-psd'), S = require('./stack.js');
initializeCanvas(() => { throw new Error('no canvas'); }, (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));
const W = 128, F = Math.fround, q = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5)));
const PSD_MODE = { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', 'soft-light': 'soft light', 'hard-light': 'hard light', darken: 'darken', lighten: 'lighten', difference: 'difference', exclusion: 'exclusion' };
const MODE_BACK = Object.fromEntries(Object.entries(PSD_MODE).map(([k, v]) => [v, k]));
function quantise(st) {   // float layer -> 8-bit straight RGBA + 8-bit mask + byte opacity
  return st.order.map((id) => { const l = st.L[id], rgba = new Uint8ClampedArray(W*W*4);
    for (let i = 0; i < W*W; i++) { const a = l.pix[i*4+3]; rgba[i*4+3] = q(a); if (a > 0) for (let k = 0; k < 3; k++) rgba[i*4+k] = q(l.pix[i*4+k] / a); }
    return { id, mode: l.mode, opacity: Math.round(l.opacity * 255), rgba, mask: l.mask ? Uint8Array.from(l.mask, (m) => q(m)) : null }; });
}
function stateFrom(layers) {   // quantised model -> fold state (premult float) for the canonical compositor
  const st = { W, order: [], L: {} };
  for (const L of layers) { const pix = new Float32Array(W*W*4);
    for (let i = 0; i < W*W; i++) { const a = F(L.rgba[i*4+3] / 255); pix[i*4+3] = a; for (let k = 0; k < 3; k++) pix[i*4+k] = F(F(L.rgba[i*4+k] / 255) * a); }
    st.L[L.id] = { mode: L.mode, opacity: F(L.opacity / 255), pix, mask: L.mask ? Float32Array.from(L.mask, (m) => F(m / 255)) : null }; st.order.push(L.id); }
  return st;
}
const fails = [], res = [];
for (const seed of [1, 2, 3]) {
  const st = S.fold(S.makeScene(seed, W), W), orig8 = S.toRGBA8(S.composite(st)), Q = quantise(st);
  const psd = { width: W, height: W, children: Q.map((L) => ({ name: 'L' + L.id, left: 0, top: 0, right: W, bottom: W, blendMode: PSD_MODE[L.mode], opacity: L.opacity / 255,
    imageData: { width: W, height: W, data: L.rgba },
    ...(L.mask ? { mask: { left: 0, top: 0, right: W, bottom: W, defaultColor: 255, imageData: { width: W, height: W, data: Uint8ClampedArray.from({ length: W*W*4 }, (_, j) => (j & 3) === 3 ? 255 : L.mask[j >> 2]) } } } : {}) })) };
  const t0 = Date.now(), buf = writePsd(psd, { generateThumbnail: false });
  if (process.env.EMIT_DIR) {   // for check_psd_independent.py
    fs.mkdirSync(process.env.EMIT_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.EMIT_DIR, 'seed' + seed + '.psd'), Buffer.from(buf));
    fs.writeFileSync(path.join(process.env.EMIT_DIR, 'seed' + seed + '.rgba8'), orig8);
    fs.writeFileSync(path.join(process.env.EMIT_DIR, 'seed' + seed + '.layers.bin'), Buffer.concat(Q.map((L) => Buffer.from(L.rgba.buffer))));
    fs.writeFileSync(path.join(process.env.EMIT_DIR, 'seed' + seed + '.masks.bin'), Buffer.concat(Q.map((L) => Buffer.from(L.mask || new Uint8Array(W*W)))));
    fs.writeFileSync(path.join(process.env.EMIT_DIR, 'seed' + seed + '.json'), JSON.stringify({ W, layers: Q.map((L) => ({ mode: PSD_MODE[L.mode], opacity: L.opacity, has_mask: !!L.mask })) }));
  }
  const back = readPsd(Buffer.from(buf), { useImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  const L2 = back.children.map((c, i) => { const src = Q[i], rgba = c.imageData ? c.imageData.data : new Uint8ClampedArray(W*W*4), full = new Uint8ClampedArray(W*W*4);
    const ox = c.left || 0, oy = c.top || 0, w = c.imageData ? c.imageData.width : 0, h = c.imageData ? c.imageData.height : 0;   // PSD may trim; re-place on the canvas
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) full.set(rgba.subarray((y*w+x)*4, (y*w+x)*4+4), ((oy+y)*W + ox+x)*4);
    let mask = null; if (src.mask) { mask = new Uint8Array(W*W).fill(c.mask && c.mask.defaultColor !== undefined ? c.mask.defaultColor : 255);
      if (c.mask && c.mask.imageData) { const mw = c.mask.imageData.width, mh = c.mask.imageData.height, mx = c.mask.left || 0, my = c.mask.top || 0; for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) mask[(my+y)*W + mx+x] = c.mask.imageData.data[(y*mw+x)*4]; } }
    return { id: src.id, mode: MODE_BACK[c.blendMode], opacity: Math.round(c.opacity * 255), rgba: full, mask }; });
  let bad = 0, maskBad = 0;
  L2.forEach((L, i) => { const s = Q[i]; if (L.mode !== s.mode || L.opacity !== s.opacity) bad++;
    for (let p = 0; p < W*W; p++) { if (L.rgba[p*4+3] !== s.rgba[p*4+3]) bad++; else if (s.rgba[p*4+3] > 0) for (let k = 0; k < 3; k++) if (L.rgba[p*4+k] !== s.rgba[p*4+k]) bad++; if (s.mask && L.mask[p] !== s.mask[p]) maskBad++; } });
  const hQ = S.sha256(S.toRGBA8(S.composite(stateFrom(Q)))), hR = S.sha256(S.toRGBA8(S.composite(stateFrom(L2))));
  const cost = S.diff(S.toRGBA8(S.composite(stateFrom(Q))), orig8, true);
  const r = { seed, layers: Q.length, psd_kib: +(buf.byteLength / 1024).toFixed(0), ms: Date.now() - t0, layer_param_or_pixel_mismatches: bad, mask_mismatches: maskBad, composite_hash_equal: hQ === hR, interchange_cost_vs_float: cost };
  if (bad || maskBad || hQ !== hR) fails.push('seed' + seed + ' ' + JSON.stringify(r)); res.push(r);
}
console.log(JSON.stringify({ results: res, gate: fails.length ? 'FAIL' : 'PASS', fails }, null, 1)); process.exit(fails.length ? 1 : 0);
