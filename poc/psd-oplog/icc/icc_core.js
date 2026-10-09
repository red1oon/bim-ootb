// ICC checks shared by Node and the browser. `L` = lcms-wasm module namespace, `lcms` = instantiated module.
// cmykIcc: Uint8Array of a real CMYK press profile (fetched by fetch_profiles.sh, never committed).
(function (root) {
  const CM = typeof require !== 'undefined' ? require('./color_math.js') : root.ColorMath;
  const IW = typeof require !== 'undefined' ? require('./icc_write.js') : root.IccWrite;
  const sha = typeof require !== 'undefined' ? require('../stack.js').sha256 : root.Stack.sha256;
  const GRID = [0, 32, 64, 96, 128, 160, 192, 224, 255], grid8 = () => { const a = []; for (const r of GRID) for (const g of GRID) for (const b of GRID) a.push(r, g, b); return Uint8Array.from(a); };
  const GRID17 = Array.from({ length: 17 }, (_, i) => Math.min(255, i * 16)), grid17 = () => { const a = []; for (const r of GRID17) for (const g of GRID17) for (const b of GRID17) a.push(r, g, b); return Uint8Array.from(a); };
  const q = (a) => { const s = [...a].sort((x, y) => x - y); return { median: +s[s.length >> 1].toFixed(3), p95: +s[Math.floor(s.length * 0.95)].toFixed(3), max: +s[s.length - 1].toFixed(3), mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(3) }; };
  const lab16 = (u) => { const o = []; for (let i = 0; i < u.length; i += 3) o.push([u[i] / 65535 * 100, u[i+1] / 65535 * 255 - 128, u[i+2] / 65535 * 255 - 128]); return o; };   // Lab V4 16-bit encoding
  const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };

  function run(L, lcms, cmykIcc, perfPixels) {
    const out = { checks: {}, hashes: {}, fails: [] }, fail = (m) => out.fails.push(m);
    const open = (b) => { const p = lcms.cmsOpenProfileFromMem(b, b.length); if (!p) throw new Error('cannot open profile'); return p; };
    const xform = (a, fa, b, fb, intent, flags) => { const t = lcms.cmsCreateTransform(a, fa, b, fb, intent, flags); if (!t) throw new Error('no transform'); return t; };
    const apply = (t, data, n) => lcms.cmsDoTransform(t, data, n);
    const RELCOL = L.INTENT_RELATIVE_COLORIMETRIC, BPC = L.cmsFLAGS_BLACKPOINTCOMPENSATION;
    const sRGB = lcms.cmsCreate_sRGBProfile(), p3Bytes = IW.matrixProfile('p3', 'Display P3 (generated)'), P3 = open(p3Bytes), CMYK = open(cmykIcc);
    const rgb = grid8(), n = rgb.length / 3;
    // 0. oracle self-checks
    const st = CM.selfTest(); out.checks.deltaE2000_vs_Sharma_max_err = +st.toExponential(2); if (st > 1e-3) fail('deltaE2000 implementation disagrees with Sharma test pairs');
    const m = CM.M.p3, sums = [0, 1, 2].map((i) => m[i][0] + m[i][1] + m[i][2]); out.checks.p3_colorants_sum_to_D50 = sums.map((x, i) => +(x - CM.D50[i]).toExponential(1));
    if (sums.some((x, i) => Math.abs(x - CM.D50[i]) > 1e-4)) fail('P3 colorants do not sum to D50 white');
    // 1. sRGB -> Lab (lcms) vs float64 oracle
    for (const [name, flags] of [['default', 0], ['nooptimize', L.cmsFLAGS_NOOPTIMIZE]]) {
      const t = xform(sRGB, L.TYPE_RGB_8, lcms.cmsCreateLab4Profile(null) || 0, L.TYPE_Lab_16, RELCOL, flags), lab = lab16(apply(t, rgb, n)); lcms.cmsDeleteTransform(t);
      const de = []; for (let i = 0; i < n; i++) de.push(CM.dE2000(lab[i], CM.xyzToLab(CM.rgbToXyz('srgb', [rgb[i*3], rgb[i*3+1], rgb[i*3+2]]))));
      out.checks['srgb_to_lab_dE2000_vs_oracle_' + name] = q(de); if (Math.max(...de) > 0.1) fail('sRGB->Lab (' + name + ') deviates from oracle by dE2000 ' + Math.max(...de).toFixed(3));
    }
    // 2. sRGB -> Display P3 (8-bit) vs float64 oracle, and round trip
    for (const [name, flags] of [['default', 0], ['nooptimize', L.cmsFLAGS_NOOPTIMIZE]]) {
      const tf = xform(sRGB, L.TYPE_RGB_8, P3, L.TYPE_RGB_8, RELCOL, flags), tb = xform(P3, L.TYPE_RGB_8, sRGB, L.TYPE_RGB_8, RELCOL, flags);
      const got = apply(tf, rgb, n), exp = new Float64Array(n * 3);
      for (let i = 0; i < n; i++) CM.xyzToRgb8('p3', CM.rgbToXyz('srgb', [rgb[i*3], rgb[i*3+1], rgb[i*3+2]])).forEach((v, k) => exp[i*3+k] = v);
      let mx = 0; for (let i = 0; i < exp.length; i++) mx = Math.max(mx, Math.abs(got[i] - exp[i]));
      const back = apply(tb, got, n), rt = maxDiff(back, rgb);
      // the oracle's own 8-bit round trip: quantise to 8-bit P3 in the middle, then back. Inherent loss of going 8-bit -> wider gamut -> 8-bit.
      let ort = 0; for (let i = 0; i < n; i++) { const mid = CM.xyzToRgb8('p3', CM.rgbToXyz('srgb', [rgb[i*3], rgb[i*3+1], rgb[i*3+2]])).map(Math.round), bk = CM.xyzToRgb8('srgb', CM.rgbToXyz('p3', mid)); for (let k = 0; k < 3; k++) ort = Math.max(ort, Math.abs(Math.round(bk[k]) - rgb[i*3+k])); }
      out.checks['srgb_to_p3_' + name] = { max_levels_vs_oracle: +mx.toFixed(2), roundtrip_8bit_max_levels: rt, oracle_8bit_roundtrip_max_levels: ort };
      if (mx > 1.5) fail('sRGB->P3 (' + name + ') ' + mx.toFixed(2) + ' levels from oracle'); if (rt > ort + 1) fail('sRGB->P3->sRGB 8-bit round trip ' + rt + ' levels vs oracle ' + ort);
      if (name === 'default') { out.hashes.srgb_to_p3_8bit = sha(got); } lcms.cmsDeleteTransform(tf); lcms.cmsDeleteTransform(tb);
    }
    { const res = {}, in16 = Uint16Array.from(rgb, (v) => v * 257);   // 16-bit round trip under three optimisation settings
      for (const [name, flags] of [['default', 0], ['highres', L.cmsFLAGS_HIGHRESPRECALC], ['nooptimize', L.cmsFLAGS_NOOPTIMIZE]]) {
        const t1 = xform(sRGB, L.TYPE_RGB_16, P3, L.TYPE_RGB_16, RELCOL, flags), t2 = xform(P3, L.TYPE_RGB_16, sRGB, L.TYPE_RGB_16, RELCOL, flags), mid = apply(t1, in16, n), bk = apply(t2, mid, n);
        let m16 = 0; for (let i = 0; i < in16.length; i++) m16 = Math.max(m16, Math.abs(bk[i] - in16[i]) / 257); res[name] = +m16.toFixed(3);
        if (name === 'nooptimize') { out.hashes.srgb_to_p3_16bit_nooptimize = sha(mid); out.hashes.p3_back_to_srgb_16bit_nooptimize = sha(bk); }
        lcms.cmsDeleteTransform(t1); lcms.cmsDeleteTransform(t2); }
      out.checks.srgb_p3_srgb_roundtrip_16bit_max_levels = Object.assign(res, { finding: 'default/highres lcms optimisation (precomputed CLUT) loses accuracy near the gamut edge; canonical path must use cmsFLAGS_NOOPTIMIZE' });
      if (res.nooptimize > 0.5) fail('16-bit NOOPTIMIZE round trip ' + res.nooptimize + ' levels'); }
    // P3 -> sRGB gamut clipping: saturated P3 colours must land at the sRGB edge, not wrap
    { const t = xform(P3, L.TYPE_RGB_8, sRGB, L.TYPE_RGB_8, RELCOL, 0), o = apply(t, Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255]), 3), clipOK = [255,0,0, 0,255,0, 0,0,255].every((v, i) => o[i] === v);   // out-of-gamut P3 primaries clip to the sRGB edge (relative colorimetric, no gamut mapping)
      out.checks.p3_primaries_clip_to_srgb_edge = { out: Array.from(o), ok: clipOK }; if (!clipOK) fail('P3 primaries did not clip cleanly into sRGB'); lcms.cmsDeleteTransform(t); }
    // 3. CMYK with a real press profile
    const toC = xform(sRGB, L.TYPE_RGB_8, CMYK, L.TYPE_CMYK_8, RELCOL, BPC), fromC = xform(CMYK, L.TYPE_CMYK_8, sRGB, L.TYPE_RGB_8, RELCOL, BPC);
    const probe = Uint8Array.from([0,0,0,0, 0,0,0,255, 255,0,0,0, 0,255,0,0, 0,0,255,0]), pr = apply(fromC, probe, 5);
    out.checks.cmyk_probe_srgb = { paper: Array.from(pr.slice(0, 3)), K100: Array.from(pr.slice(3, 6)), C100: Array.from(pr.slice(6, 9)), M100: Array.from(pr.slice(9, 12)), Y100: Array.from(pr.slice(12, 15)) };
    if (Math.min(...pr.slice(0, 3)) < 235) fail('CMYK paper white is not near white'); if (Math.max(...pr.slice(3, 6)) > 70) fail('CMYK 100% K is not dark'); if (!(pr[8] > pr[6])) fail('C100 should be bluer than red'); if (!(pr[9] > pr[10])) fail('M100 should be red-ish'); if (!(pr[12] > pr[14] && pr[13] > pr[14])) fail('Y100 should be yellow-ish');
    const kramp = Uint8Array.from(Array.from({ length: 17 }, (_, i) => [0, 0, 0, Math.min(255, i * 16)]).flat()), kl = apply(fromC, kramp, 17); let mono = true; for (let i = 1; i < 17; i++) if (kl[i*3+1] > kl[(i-1)*3+1] + 1) mono = false;
    out.checks.k_ramp_monotonic = mono; if (!mono) fail('K ramp not monotonic');
    const g17 = grid17(), n17 = g17.length / 3, cmyk = apply(toC, g17, n17), back = apply(fromC, cmyk, n17), de = [], deGray = [];
    const labT = xform(sRGB, L.TYPE_RGB_8, lcms.cmsCreateLab4Profile(null), L.TYPE_Lab_16, RELCOL, 0), la = lab16(apply(labT, g17, n17)), lb = lab16(apply(labT, back, n17));
    for (let i = 0; i < n17; i++) { const d = CM.dE2000(la[i], lb[i]); de.push(d); if (g17[i*3] === g17[i*3+1] && g17[i*3] === g17[i*3+2]) deGray.push(d); }
    out.checks.srgb_cmyk_srgb_roundtrip_dE2000 = { all_4913: q(de), neutrals_17: q(deGray), pct_over_5: +(100 * de.filter((x) => x > 5).length / de.length).toFixed(1), note: 'informational: sRGB gamut exceeds a press gamut, so large errors are expected for saturated colours' };
    out.hashes.srgb_to_cmyk = sha(cmyk); out.hashes.cmyk_to_srgb_roundtrip = sha(back);
    // 4. throughput (informational)
    if (perfPixels) { const big = new Uint8Array(perfPixels * 3); for (let i = 0; i < big.length; i++) big[i] = (i * 2654435761 >>> 24) & 255;
      const time = (t, data, cnt) => { const t0 = performance.now(); apply(t, data, cnt); return +(cnt / 1e6 / ((performance.now() - t0) / 1000)).toFixed(1); }, tp = xform(sRGB, L.TYPE_RGB_8, P3, L.TYPE_RGB_8, RELCOL, 0);
      const tn = xform(sRGB, L.TYPE_RGB_8, P3, L.TYPE_RGB_8, RELCOL, L.cmsFLAGS_NOOPTIMIZE), big16 = new Uint16Array(perfPixels * 3).map((_, i) => (i * 2654435761 >>> 16) & 65535), tn16 = xform(sRGB, L.TYPE_RGB_16, P3, L.TYPE_RGB_16, RELCOL, L.cmsFLAGS_NOOPTIMIZE);
      out.checks.throughput_MPx_per_s = { srgb_to_p3_8bit_default: time(tp, big, perfPixels), srgb_to_p3_8bit_nooptimize: time(tn, big, perfPixels), srgb_to_p3_16bit_nooptimize: time(tn16, big16, perfPixels), srgb_to_cmyk_8bit_default: time(toC, big, perfPixels), pixels: perfPixels }; lcms.cmsDeleteTransform(tp); lcms.cmsDeleteTransform(tn); lcms.cmsDeleteTransform(tn16); }
    out.checks.lcms_wasm_version = L.LCMS_VERSION;
    out.p3Bytes = p3Bytes;
    return out;
  }
  const api = { run, grid8, grid17 };
  if (typeof module !== 'undefined') module.exports = api; else root.IccCore = api;
})(this);
