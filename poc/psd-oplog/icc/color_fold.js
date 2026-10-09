// Colour-managed document fold: layers carry a source space (sRGB | p3), the document has a working space, layers are converted
// on import with lcms (16-bit, NOOPTIMIZE), composited by the canonical stack fold, then exported to sRGB / P3 / CMYK.
// Checked against an independent float64 path built from color_math.js + oracle.js (no ICC engine).
(function (root) {
  const node = typeof require !== 'undefined';
  const CM = node ? require('./color_math.js') : root.ColorMath, S = node ? require('../stack.js') : root.Stack, O = node ? require('../oracle.js') : root.Oracle;
  const W = 128, F = Math.fround, q8 = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5))), SPACES = ['srgb', 'p3'];
  const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { median: +s[s.length >> 1].toFixed(3), p95: +s[Math.floor(s.length * 0.95)].toFixed(3), max: +s[s.length - 1].toFixed(3), mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(3) }; };
  function layers8(st, forceTag) {   // float layer -> straight RGBA8 + tag (sRGB for bg and odd ids, Display-P3 for even ids)
    return st.order.map((id) => { const l = st.L[id], rgba = new Uint8Array(W*W*4);
      for (let i = 0; i < W*W; i++) { const a = l.pix[i*4+3]; rgba[i*4+3] = q8(a); if (a > 0) for (let k = 0; k < 3; k++) rgba[i*4+k] = q8(l.pix[i*4+k] / a); }
      return { id, mode: l.mode, opacity: l.opacity, mask: l.mask, rgba, tag: forceTag || (id === 0 || id % 2 ? 'srgb' : 'p3') }; });
  }
  function buildState(L8, convertRGB) {   // convertRGB(layer) -> Float32/64 straight working RGB in 0..1, n*3
    const st = { W, order: [], L: {} };
    for (const ly of L8) { const rgb = convertRGB(ly), pix = new Float32Array(W*W*4);
      for (let i = 0; i < W*W; i++) { const a = F(ly.rgba[i*4+3] / 255); pix[i*4+3] = a; for (let k = 0; k < 3; k++) pix[i*4+k] = F(F(rgb[i*3+k]) * a); }
      st.L[ly.id] = { mode: ly.mode, opacity: ly.opacity, pix, mask: ly.mask }; st.order.push(ly.id); }
    return st;
  }
  const labOf = (rgb8, i) => CM.xyzToLab(CM.rgbToXyz('srgb', [rgb8[i], rgb8[i+1], rgb8[i+2]]));
  function dEimages(a, b) { const d = []; for (let i = 0; i < a.length; i += 4) d.push(CM.dE2000(labOf(a, i), labOf(b, i))); return stats(d); }

  function run(L, lcms, cmykIcc, p3Bytes, sha) {
    const out = { checks: {}, hashes: {}, fails: [] }, fail = (m) => out.fails.push(m), RC = L.INTENT_RELATIVE_COLORIMETRIC, NO = L.cmsFLAGS_NOOPTIMIZE, BPC = L.cmsFLAGS_BLACKPOINTCOMPENSATION;
    const prof = { srgb: lcms.cmsCreate_sRGBProfile(), p3: lcms.cmsOpenProfileFromMem(p3Bytes, p3Bytes.length) }, CMYK = lcms.cmsOpenProfileFromMem(cmykIcc, cmykIcc.length);
    const xf = {}; for (const a of SPACES) for (const b of SPACES) if (a !== b) xf[a + '>' + b] = lcms.cmsCreateTransform(prof[a], L.TYPE_RGB_16, prof[b], L.TYPE_RGB_16, RC, NO);
    const toCMYK = {}; for (const w of SPACES) toCMYK[w] = lcms.cmsCreateTransform(prof[w], L.TYPE_RGB_8, CMYK, L.TYPE_CMYK_8, RC, NO | BPC);
    const fromCMYK = lcms.cmsCreateTransform(CMYK, L.TYPE_CMYK_8, prof.srgb, L.TYPE_RGB_8, RC, NO | BPC);
    const conv16 = (a, b, v16, n) => a === b ? v16 : lcms.cmsDoTransform(xf[a + '>' + b], v16, n);
    // ---- pipeline (lcms)
    const importLcms = (work) => (ly) => { const n = W*W, in16 = new Uint16Array(n * 3); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) in16[i*3+k] = ly.rgba[i*4+k] * 257;
      const o = conv16(ly.tag, work, in16, n), r = new Float32Array(n * 3); for (let i = 0; i < r.length; i++) r[i] = F(o[i] / 65535); return r; };
    const exportLcms = (back, work, disp) => { const n = W*W, v16 = new Uint16Array(n * 3), res = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) { const a = back[i*4+3]; for (let k = 0; k < 3; k++) v16[i*3+k] = a > 0 ? Math.max(0, Math.min(65535, Math.floor(F(back[i*4+k] / a) * 65535 + 0.5))) : 0; }
      const o = conv16(work, disp, v16, n); for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) res[i*4+k] = Math.floor(o[i*3+k] / 257 + 0.5); res[i*4+3] = q8(back[i*4+3]); } return res; };
    const pipeline = (L8, work, disp) => { const st = buildState(L8, importLcms(work)), back = S.composite(st); return exportLcms(back, work, disp); };
    // ---- float64 reference path (no ICC engine)
    const importRef = (work) => (ly) => { const n = W*W, r = new Float64Array(n * 3);
      for (let i = 0; i < n; i++) { const c8 = [ly.rgba[i*4], ly.rgba[i*4+1], ly.rgba[i*4+2]]; if (ly.tag === work) for (let k = 0; k < 3; k++) r[i*3+k] = c8[k] / 255; else CM.xyzToRgb8(work, CM.rgbToXyz(ly.tag, c8)).forEach((v, k) => r[i*3+k] = v / 255); } return r; };
    const reference = (L8, work, disp) => { const st = buildState(L8, importRef(work)), { C, A } = O.spec64raw(st), n = W*W, res = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) { const c8 = [C[i*3]*255, C[i*3+1]*255, C[i*3+2]*255], d = work === disp ? c8 : CM.xyzToRgb8(disp, CM.rgbToXyz(work, c8)); for (let k = 0; k < 3; k++) res[i*4+k] = Math.max(0, Math.min(255, Math.floor(d[k] + 0.5))); res[i*4+3] = q8(A[i]); } return res; };
    const diff8 = (a, b) => { let mx = 0, sum = 0; for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(a[i+k] - b[i+k]); mx = Math.max(mx, d); sum += d; } return { max: mx, mean: +(sum / (a.length * 0.75)).toFixed(4) }; };
    const scenes = [1, 2].map((s) => ({ seed: s, L8: layers8(S.fold(S.makeScene(s, W), W)) }));
    // 1. pipeline vs reference, both working spaces, display sRGB and P3
    out.checks.pipeline_vs_float64_reference = {};
    for (const sc of scenes) for (const work of SPACES) for (const disp of SPACES) {
      const a = pipeline(sc.L8, work, disp), b = reference(sc.L8, work, disp), d = diff8(a, b), key = `seed${sc.seed}_work_${work}_display_${disp}`;
      out.checks.pipeline_vs_float64_reference[key] = d; if (d.max > 2 || d.mean > 0.3) fail(key + ' pipeline differs from reference ' + JSON.stringify(d));
      if (sc.seed === 1) out.hashes['display_' + key] = sha(a);
    }
    // 2. working-space dependence of the composite (info): same layers, composite in sRGB vs in P3, shown on an sRGB display
    const sc1 = scenes[0], allS = layers8(S.fold(S.makeScene(1, W), W), 'srgb');
    out.checks.working_space_dependence_dE2000 = {
      mixed_tags_srgb_vs_p3_working: dEimages(pipeline(sc1.L8, 'srgb', 'srgb'), pipeline(sc1.L8, 'p3', 'srgb')),
      all_layers_srgb_tagged_srgb_vs_p3_working: dEimages(pipeline(allS, 'srgb', 'srgb'), pipeline(allS, 'p3', 'srgb')),
      note: 'same pixel data, blended in different RGB primaries: blend maths is not colorimetric, so the working space changes the result' };
    // 3. gamma-encoded vs linear-light compositing (info; uses Math.pow, so not canonical)
    { const stG = buildState(allS, (ly) => Float32Array.from({ length: W*W*3 }, (_, i) => ly.rgba[((i / 3) | 0) * 4 + (i % 3)] / 255)),
        stL = buildState(allS, (ly) => Float32Array.from({ length: W*W*3 }, (_, i) => CM.dec(ly.rgba[((i / 3) | 0) * 4 + (i % 3)] / 255))), g = S.toRGBA8(S.composite(stG)), bl = S.composite(stL), lin = new Uint8Array(W*W*4);
      for (let i = 0; i < W*W; i++) { const a = bl[i*4+3]; for (let k = 0; k < 3; k++) lin[i*4+k] = a > 0 ? q8(CM.enc(Math.min(1, bl[i*4+k] / a))) : 0; lin[i*4+3] = q8(a); }
      out.checks.gamma_vs_linear_light_compositing_dE2000 = { all_blend_modes_scene: dEimages(g, lin), note: 'informational: Photoshop composites gamma-encoded by default; linear light is the physically based alternative' }; }
    // 4. export to CMYK and soft-proof gamut warning
    { const disp = pipeline(sc1.L8, 'p3', 'srgb'), n = W*W, rgb = new Uint8Array(n * 3); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rgb[i*3+k] = disp[i*4+k];
      const cm = lcms.cmsDoTransform(toCMYK.srgb, rgb, n), prf = lcms.cmsDoTransform(fromCMYK, cm, n), pr = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) pr[i*4+k] = prf[i*3+k]; pr[i*4+3] = 255; }
      const dE = []; for (let i = 0; i < n; i++) dE.push(CM.dE2000(labOf(disp, i*4), labOf(pr, i*4)));
      const neutral = new Uint8Array(n * 3).map((_, i) => Math.floor(((i / 3 | 0) % W) * 255 / (W - 1))), nc = lcms.cmsDoTransform(toCMYK.srgb, neutral, n), nb = lcms.cmsDoTransform(fromCMYK, nc, n), nd = [];
      for (let i = 0; i < n; i++) nd.push(CM.dE2000(CM.xyzToLab(CM.rgbToXyz('srgb', [neutral[i*3], neutral[i*3+1], neutral[i*3+2]])), CM.xyzToLab(CM.rgbToXyz('srgb', [nb[i*3], nb[i*3+1], nb[i*3+2]]))));
      const warn = (a) => +(100 * a.filter((x) => x > 5).length / a.length).toFixed(2);
      out.checks.softproof_cmyk = { saturated_scene: { proof_dE2000: stats(dE), gamut_warning_pct_dE_over_5: warn(dE) }, neutral_ramp: { proof_dE2000: stats(nd), gamut_warning_pct_dE_over_5: warn(nd) } };
      if (warn(nd) !== 0) fail('soft-proof flags neutrals as out of gamut'); if (warn(dE) <= 0) fail('soft-proof flagged nothing in a saturated scene');
      out.hashes.cmyk_export_seed1_work_p3 = sha(cm); out.hashes.softproof_seed1 = sha(pr); }
    return out;
  }
  const api = { run };
  if (node) module.exports = api; else root.ColorFold = api;
})(this);
