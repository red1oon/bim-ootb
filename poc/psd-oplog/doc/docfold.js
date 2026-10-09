// Schema-driven colour-managed fold. Painting and compositing use the canonical stack fold; colour conversion is lcms-wasm
// (16-bit, NOOPTIMIZE, relative colorimetric). ctx = { L, lcms, blobs: Map<sha256, Uint8Array> }.
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, Sch = node ? require('./schema.js') : root.DocSchema, IW = node ? require('../icc/icc_write.js') : root.IccWrite;
  const F = Math.fround, q8 = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5)));
  function profiles(ctx) {   // cached lcms profile handles by space name
    const cache = ctx._profiles || (ctx._profiles = {});
    return (space) => { if (cache[space]) return cache[space]; let bytes;
      if (space.startsWith('icc:')) bytes = ctx.blobs.get(space.slice(4)); else bytes = IW.matrixProfile(space, space);
      const p = ctx.lcms.cmsOpenProfileFromMem(bytes, bytes.length); if (!p) throw new Error('cannot open profile ' + space); return (cache[space] = p); };
  }
  function fold(ops, ctx) {
    const errs = Sch.validate(ops, ctx.blobs); if (errs.length) throw new Error('invalid op-log: ' + errs.slice(0, 5).join('; '));
    const doc = ops[0], W = doc.w, st = S.newState(W), spaceOf = {};
    for (const o of ops.slice(1)) {
      if (o.op === 'layer') { spaceOf[o.id] = o.space; S.apply(st, o); }
      else if (o.op === 'group' || o.op === 'adjust') S.apply(st, o);
      else if (o.op === 'raster') { const b = ctx.blobs.get(o.pixels), l = st.L[o.layer];
        for (let i = 0; i < W*W; i++) { const a = F(b[i*4+3] / 255); l.pix[i*4+3] = a; for (let k = 0; k < 3; k++) l.pix[i*4+k] = F(F(b[i*4+k] / 255) * a); } }
      else if (o.op === 'raster16') { const b = ctx.blobs.get(o.pixels), l = st.L[o.layer], u = (i) => b[i * 2] | (b[i * 2 + 1] << 8);   // little-endian 16-bit
        for (let i = 0; i < W*W; i++) { const a = F(u(i*4+3) / 65535); l.pix[i*4+3] = a; for (let k = 0; k < 3; k++) l.pix[i*4+k] = F(F(u(i*4+k) / 65535) * a); } }
      else if (o.op === 'maskraster16') { const b = ctx.blobs.get(o.pixels), l = st.L[o.layer] || st.G[o.layer] || st.A[o.layer]; l.mask = Float32Array.from({ length: W*W }, (_, i) => F((b[i*2] | (b[i*2+1] << 8)) / 65535)); }
      else if (o.op === 'maskraster') { const b = ctx.blobs.get(o.pixels), l = st.L[o.layer] || st.G[o.layer] || st.A[o.layer]; l.mask = Float32Array.from(b, (v) => F(v / 255)); }
      else S.apply(st, o);
    }
    return { doc, st, spaceOf };
  }
  const workName = (doc) => doc.gamma === 'linear' ? doc.working + '_linear' : doc.working;
  // composite in the working space (encoded or linear light). Returns premultiplied float32 RGBA.
  function compositeState(f, ctx) {
    const { doc, st, spaceOf } = f, W = doc.w, n = W*W, P = profiles(ctx), work = workName(doc), conv = {}, cst = { W, order: st.order.slice(), L: {}, G: st.G, A: st.A, root: st.root, hasTree: st.hasTree };
    for (const id of st.order) { const l = st.L[id], sp = spaceOf[id];
      if (!conv[sp]) conv[sp] = ctx.lcms.cmsCreateTransform(P(sp), ctx.L.TYPE_RGB_16, P(work), ctx.L.TYPE_RGB_16, ctx.L.INTENT_RELATIVE_COLORIMETRIC, ctx.L.cmsFLAGS_NOOPTIMIZE);
      const in16 = new Uint16Array(n * 3), pix = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { const a = l.pix[i*4+3]; if (a > 0) for (let k = 0; k < 3; k++) in16[i*3+k] = Math.max(0, Math.min(65535, Math.floor(F(l.pix[i*4+k] / a) * 65535 + 0.5))); }
      const o = (sp === work) ? in16 : ctx.lcms.cmsDoTransform(conv[sp], in16, n);
      for (let i = 0; i < n; i++) { const a = l.pix[i*4+3]; pix[i*4+3] = a; for (let k = 0; k < 3; k++) pix[i*4+k] = F(F(o[i*3+k] / 65535) * a); }
      cst.L[id] = { mode: l.mode, opacity: l.opacity, pix, mask: l.mask, parent: l.parent, clip: l.clip }; }
    return cst;
  }
  function composite(f, ctx) { return S.composite(compositeState(f, ctx)); }
  // working-space composite -> straight RGBA8 in the display space (encoded). display: built-in name or icc:<sha>
  function render(back, f, display, ctx) {
    const { doc } = f, W = doc.w, n = W*W, P = profiles(ctx), work = workName(doc), v16 = new Uint16Array(n * 3), res = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { const a = back[i*4+3]; if (a > 0) for (let k = 0; k < 3; k++) v16[i*3+k] = Math.max(0, Math.min(65535, Math.floor(F(back[i*4+k] / a) * 65535 + 0.5))); }
    const t = ctx.lcms.cmsCreateTransform(P(work), ctx.L.TYPE_RGB_16, P(display), ctx.L.TYPE_RGB_16, ctx.L.INTENT_RELATIVE_COLORIMETRIC, ctx.L.cmsFLAGS_NOOPTIMIZE), o = work === display ? v16 : ctx.lcms.cmsDoTransform(t, v16, n);
    ctx.lcms.cmsDeleteTransform(t); for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) res[i*4+k] = Math.floor(o[i*3+k] / 257 + 0.5); res[i*4+3] = q8(back[i*4+3]); }
    return res;
  }
  // 16-bit straight RGBA (Uint16Array, 0..65535) in the display space; same conversion as render(), without the 8-bit rounding
  function render16(back, f, display, ctx) {
    const { doc } = f, W = doc.w, n = W*W, P = profiles(ctx), work = workName(doc), v16 = new Uint16Array(n * 3), res = new Uint16Array(n * 4);
    for (let i = 0; i < n; i++) { const a = back[i*4+3]; if (a > 0) for (let k = 0; k < 3; k++) v16[i*3+k] = Math.max(0, Math.min(65535, Math.floor(F(back[i*4+k] / a) * 65535 + 0.5))); }
    const t = ctx.lcms.cmsCreateTransform(P(work), ctx.L.TYPE_RGB_16, P(display), ctx.L.TYPE_RGB_16, ctx.L.INTENT_RELATIVE_COLORIMETRIC, ctx.L.cmsFLAGS_NOOPTIMIZE), o = work === display ? v16 : ctx.lcms.cmsDoTransform(t, v16, n);
    ctx.lcms.cmsDeleteTransform(t); for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) res[i*4+k] = o[i*3+k]; res[i*4+3] = Math.max(0, Math.min(65535, Math.floor(back[i*4+3] * 65535 + 0.5))); } return res;
  }
  const api = { fold, composite, compositeState, render, render16, workName };
  if (node) module.exports = api; else root.DocFold = api;
})(this);
