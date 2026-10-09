// Op-log -> PSD export (Node; needs ag-psd). Layers are converted into the document's working space (PSD has one profile per file),
// the working-space profile is embedded as image resource 1039, and the merged composite is stored for layer-unaware viewers.
// Refuses what PSD cannot represent faithfully: linear-light compositing.
const { writePsd, initializeCanvas } = require('ag-psd'), S = require('../stack.js'), IW = require('../icc/icc_write.js'), PI = require('./psd_icc.js'), DF = require('./docfold.js'), { MODE_BACK } = require('./psd_import.js');
initializeCanvas(() => { throw new Error('no canvas'); }, (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));
const MODE_OUT = Object.fromEntries(Object.entries(MODE_BACK).map(([k, v]) => [v, k])), F = Math.fround, q8 = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5)));
const DESC = { srgb: 'sRGB-like matrix profile (psd-oplog generated)', p3: 'Display-P3-like matrix profile (psd-oplog generated)', adobe: 'Adobe-RGB-like matrix profile (psd-oplog generated)' };
function exportPsd(ops, ctx) {
  const f = DF.fold(ops, ctx), doc = f.doc, W = doc.w, n = W * W;
  if (doc.gamma === 'linear') throw new Error('cannot export a linear-light document to PSD: no verified PSD representation of linear compositing (set gamma to "encoded" to accept a different look)');
  const P = (sp) => { const c = ctx._profiles || (ctx._profiles = {}); if (c[sp]) return c[sp]; const bytes = sp.startsWith('icc:') ? ctx.blobs.get(sp.slice(4)) : IW.matrixProfile(sp, sp); return (c[sp] = ctx.lcms.cmsOpenProfileFromMem(bytes, bytes.length)); };
  const info = { converted_layers: [], layers: f.st.order.length, groups: Object.keys(f.st.G).length };
  const maskData = (m) => { const md = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { const v = q8(m[i]); md[i*4] = md[i*4+1] = md[i*4+2] = v; md[i*4+3] = 255; } return { left: 0, top: 0, right: W, bottom: W, defaultColor: 255, imageData: { width: W, height: W, data: md } }; };
  const mkLayer = (id) => {
    const l = f.st.L[id], sp = f.spaceOf[id], in16 = new Uint16Array(n * 3), rgba = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { const a = l.pix[i*4+3]; if (a > 0) for (let k = 0; k < 3; k++) in16[i*3+k] = Math.max(0, Math.min(65535, Math.floor(F(l.pix[i*4+k] / a) * 65535 + 0.5))); rgba[i*4+3] = q8(a); }
    let out = in16; if (sp !== doc.working) { const t = ctx.lcms.cmsCreateTransform(P(sp), ctx.L.TYPE_RGB_16, P(doc.working), ctx.L.TYPE_RGB_16, ctx.L.INTENT_RELATIVE_COLORIMETRIC, ctx.L.cmsFLAGS_NOOPTIMIZE); out = ctx.lcms.cmsDoTransform(t, in16, n); ctx.lcms.cmsDeleteTransform(t); info.converted_layers.push(id + ': ' + sp + ' -> ' + doc.working); }
    for (let i = 0; i < n; i++) if (rgba[i*4+3] > 0) for (let k = 0; k < 3; k++) rgba[i*4+k] = Math.floor(out[i*3+k] / 257 + 0.5);
    const child = { name: 'Layer ' + id, left: 0, top: 0, right: W, bottom: W, blendMode: MODE_OUT[l.mode], opacity: Math.round(l.opacity * 255) / 255, imageData: { width: W, height: W, data: rgba } };
    if (l.clip) child.clipping = true; if (l.mask) child.mask = maskData(l.mask); return child;
  };
  const mkAdjust = (id) => { const a = f.st.A[id], P = a.params, adj = a.kind === 'invert' ? { type: 'invert' } : a.kind === 'threshold' ? { type: 'threshold', level: P.level } : a.kind === 'posterize' ? { type: 'posterize', levels: P.levels }
      : { type: 'levels', rgb: { shadowInput: P.in_black, highlightInput: P.in_white, shadowOutput: P.out_black, highlightOutput: P.out_white, midtoneInput: P.gamma_x100 / 100 } };
    const c = { name: 'Adjustment ' + id, left: 0, top: 0, right: W, bottom: W, blendMode: 'normal', opacity: Math.round(a.opacity * 255) / 255, adjustment: adj }; if (a.mask) c.mask = maskData(a.mask); return c; };
  const mkNode = (id) => { if (f.st.A[id]) return mkAdjust(id); const g = f.st.G[id]; if (!g) return mkLayer(id);
    const c = { name: 'Group ' + id, opened: true, blendMode: g.mode === 'pass-through' ? 'pass through' : MODE_OUT[g.mode], opacity: Math.round(g.opacity * 255) / 255, children: g.children.map(mkNode) }; if (g.mask) c.mask = maskData(g.mask); return c; };
  const children = f.st.root.map(mkNode);
  const working = DF.render(DF.composite(f, ctx), f, doc.working, ctx);   // merged image in the working space (identity conversion)
  let bytes = new Uint8Array(writePsd({ width: W, height: W, children, imageData: { width: W, height: W, data: new Uint8ClampedArray(working) } }, { generateThumbnail: false }));
  const prof = doc.working.startsWith('icc:') ? ctx.blobs.get(doc.working.slice(4)) : IW.matrixProfile(doc.working, DESC[doc.working]);
  bytes = PI.setResource(bytes, 1039, prof); info.profile = doc.working; info.profile_sha256 = S.sha256(prof);
  return { bytes, info, merged: working };
}
module.exports = { exportPsd };
