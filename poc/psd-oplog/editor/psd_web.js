// PSD export of an editor state, usable in the page (needs the vendored ag-psd bundle) and in Node. For sRGB-working editor logs only: it repeats exactly what editor/export_psd.js + doc/psd_export.js do for such a log
// (layers quantised to 8-bit straight RGBA, refolded for the merged preview, generateThumbnail:false, sRGB profile resource 1039) without lcms. Spec: HYPOTHESES.md "Editor v0.1" (G5).
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, IW = node ? require('../icc/icc_write.js') : root.IccWrite, PI = node ? require('../doc/psd_icc.js') : root.PsdIcc, AG = node ? require('ag-psd') : root.agPsd;
  const F = Math.fround, q8 = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5))), r4 = (x) => Math.round(x * 1e4) / 1e4, q255 = (o) => Math.round(o * 255 + 1e-4) / 255;
  const MODE_OUT = { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', 'soft-light': 'soft light', 'hard-light': 'hard light', darken: 'darken', lighten: 'lighten', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity' };
  const DESC = 'sRGB-like matrix profile (psd-oplog generated)';
  function exportEditorPsd(st, W) {
    const n = W * W, fs = S.newState(W), children = [], LO = node ? require('./layer_ops.js') : root.LayerOps, meta = LO.meta(st), hiddenIds = [];
    for (const id of st.order) {
      const l = st.L[id], rgba8 = new Uint8ClampedArray(n * 4);   // editor layer -> straight RGBA8 (what the Node exporter writes as a raster blob)
      for (let i = 0; i < n; i++) { const a = l.pix[i*4+3]; rgba8[i*4+3] = q8(a); if (a > 0) for (let k = 0; k < 3; k++) rgba8[i*4+k] = q8(F(l.pix[i*4+k] / a)); }
      S.apply(fs, { op: 'layer', id, mode: l.mode, opacity: r4(meta[id].opacity), mask: false }); const fl = fs.L[id];   // refold as docfold does for a raster op
      for (let i = 0; i < n; i++) { const a = F(rgba8[i*4+3] / 255); fl.pix[i*4+3] = a; for (let k = 0; k < 3; k++) fl.pix[i*4+k] = F(F(rgba8[i*4+k] / 255) * a); }
      const out = new Uint8ClampedArray(n * 4);   // docfold -> psd_export mkLayer: float -> 16-bit -> 8-bit (identity conversion, sRGB working == layer space)
      for (let i = 0; i < n; i++) { const a = fl.pix[i*4+3]; out[i*4+3] = q8(a); if (a > 0) for (let k = 0; k < 3; k++) { const v16 = Math.max(0, Math.min(65535, Math.floor(F(fl.pix[i*4+k] / a) * 65535 + 0.5))); out[i*4+k] = Math.floor(v16 / 257 + 0.5); } }
      if (meta[id].hidden) hiddenIds.push(id); children.push({ name: meta[id].name, ...(meta[id].hidden ? { hidden: true } : {}), left: 0, top: 0, right: W, bottom: W, blendMode: MODE_OUT[l.mode], opacity: q255(fl.opacity), imageData: { width: W, height: W, data: out } });
    }
    for (const id of hiddenIds) fs.L[id].opacity = 0;   // hidden: in the file, not in the merged image
    const back = S.composite(fs), res = new Uint8Array(n * 4);   // merged preview, same as DF.render with an identity transform
    for (let i = 0; i < n; i++) { const a = back[i*4+3]; if (a > 0) for (let k = 0; k < 3; k++) { const v16 = Math.max(0, Math.min(65535, Math.floor(F(back[i*4+k] / a) * 65535 + 0.5))); res[i*4+k] = Math.floor(v16 / 257 + 0.5); } res[i*4+3] = q8(a); }
    let bytes = new Uint8Array(AG.writePsd({ width: W, height: W, children, imageData: { width: W, height: W, data: new Uint8ClampedArray(res) } }, { generateThumbnail: false }));
    return PI.setResource(bytes, 1039, IW.matrixProfile('srgb', DESC));
  }
  const api = { exportEditorPsd, MODE_OUT };
  if (node) module.exports = api; else root.PsdWeb = api;
})(this);
