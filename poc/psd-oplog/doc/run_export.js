// Usage: node doc/run_export.js [--update]   PSD export: round trip, fixed point, independent reader (psd-tools), refusals, golden.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const S = require('../stack.js'), O = require('../oracle.js'), CM = require('../icc/color_math.js'), IW = require('../icc/icc_write.js'), PI = require('./psd_icc.js'), DF = require('./docfold.js'), { exportPsd } = require('./psd_export.js'), { importPsd } = require('./psd_import.js');
const W = 128, EMIT = path.join(__dirname, '.emit_export'), GOLD = path.join(__dirname, 'golden_export.json'), update = process.argv.includes('--update'), fails = [], checks = {}, hashes = {}, fail = (m) => fails.push(m);
const diff8 = (a, b) => { let mx = 0, sum = 0, o1 = 0, n = 0; for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(a[i+k] - b[i+k]); mx = Math.max(mx, d); sum += d; n++; if (d > 1) o1++; } return { max: mx, mean: +(sum / n).toFixed(4), pct_over_1: +(100 * o1 / n).toFixed(3) }; };
const refName = (sp) => sp.startsWith('icc:') ? 'custom18' : sp, F = Math.fround, q8 = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5)));
// Independent reference for what an 8-bit PSD of this document must show: every layer converted to the working space with float64 colour math
// (no ICC engine), then quantised to 8 bits (colour, alpha, mask, opacity), then composited and shown on `display`.
function refQuantised(ops, ctx, display) {
  const f = DF.fold(ops, ctx), doc = f.doc, n = W * W, wk = refName(doc.working), st = { W, order: f.st.order.slice(), L: {} };
  for (const id of st.order) { const l = f.st.L[id], sp = refName(f.spaceOf[id]), pix = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const a = l.pix[i*4+3], a8 = q8(a); pix[i*4+3] = F(a8 / 255); if (a > 0 && a8 > 0) { const c = [0, 1, 2].map((k) => l.pix[i*4+k] / a), w = CM.fromXyz01(wk, CM.toXyz01(sp, c)); for (let k = 0; k < 3; k++) pix[i*4+k] = F(F(q8(w[k]) / 255) * pix[i*4+3]); } }
    st.L[id] = { mode: l.mode, opacity: F(Math.round(l.opacity * 255 + 1e-4) / 255), pix, mask: l.mask ? Float32Array.from(l.mask, (m) => F(q8(m) / 255)) : null }; }
  const { C, A } = O.spec64raw(st), res = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { const d = CM.fromXyz01(refName(display), CM.toXyz01(wk, [C[i*3], C[i*3+1], C[i*3+2]])); for (let k = 0; k < 3; k++) res[i*4+k] = Math.floor(d[k] * 255 + 0.5); res[i*4+3] = q8(A[i]); }
  return res;
}
(async () => {
  const L = await import('lcms-wasm'), lcms = await L.instantiate(), blobs = new Map(), ctx0 = { L, lcms, blobs };
  const custom = IW.matrixProfile('custom18', 'custom gamma-1.8 test profile'), customSha = S.sha256(custom); blobs.set(customSha, custom);
  const makeDoc = (seed, working, gamma, spaces) => [{ op: 'doc', v: 1, w: W, h: W, working, gamma }, ...S.makeScene(seed, W).map((o) => o.op === 'layer' ? { ...o, space: spaces[o.id % spaces.length] } : o)];
  const docs = [['srgb_mixed', makeDoc(1, 'srgb', 'encoded', ['srgb', 'p3', 'adobe'])], ['p3_mixed', makeDoc(1, 'p3', 'encoded', ['srgb', 'p3', 'adobe'])], ['adobe_mixed', makeDoc(1, 'adobe', 'encoded', ['srgb', 'p3', 'adobe'])], ['p3_pure', makeDoc(2, 'p3', 'encoded', ['p3'])],
    ['embedded_custom_working', makeDoc(2, 'icc:' + customSha, 'encoded', ['srgb', 'icc:' + customSha, 'p3'])]];
  fs.mkdirSync(EMIT, { recursive: true }); const expect = {}; checks.cases = {};
  for (const [name, ops] of docs) {
    const r = {}, c1 = { ...ctx0, _profiles: undefined }, f0 = DF.fold(ops, c1), orig = DF.render(DF.composite(f0, c1), f0, 'srgb', c1), origWork = DF.render(DF.composite(f0, c1), f0, ops[0].working, c1);
    const ex = exportPsd(ops, { ...ctx0, _profiles: undefined }), ex2 = exportPsd(ops, { ...ctx0, _profiles: undefined });
    r.export_deterministic = Buffer.compare(Buffer.from(ex.bytes), Buffer.from(ex2.bytes)) === 0; if (!r.export_deterministic) fail(name + ': export is not deterministic');
    r.converted_layers = ex.info.converted_layers.length; r.psd_kib = +(ex.bytes.length / 1024).toFixed(0);
    const m = PI.meta(ex.bytes), wantProf = ops[0].working.startsWith('icc:') ? custom : IW.matrixProfile(ops[0].working, ops[0].working); r.embedded_profile_is_working_space = !!m.icc && PI.identify(m.icc).space === (ops[0].working.startsWith('icc:') ? null : ops[0].working); if (!r.embedded_profile_is_working_space) fail(name + ': wrong profile embedded');
    // export -> import -> fold -> same picture (up to 8-bit requantisation + conversion into the working space)
    const imp = importPsd(ex.bytes), all = new Map([...blobs, ...imp.blobs]), c2 = { L, lcms, blobs: all }, f1 = DF.fold(imp.ops, c2), back = DF.render(DF.composite(f1, c2), f1, 'srgb', c2);
    const backWork = DF.render(DF.composite(f1, c2), f1, ops[0].working, c2);
    r.export_import_vs_quantised_float64_reference_in_working_space = diff8(backWork, refQuantised(ops, { ...ctx0, _profiles: undefined }, ops[0].working)); if (r.export_import_vs_quantised_float64_reference_in_working_space.max > 2) fail(name + ': export+import differs from the independent quantised reference (working space) ' + JSON.stringify(r.export_import_vs_quantised_float64_reference_in_working_space));
    r.export_import_vs_quantised_float64_reference_on_sRGB_display = diff8(back, refQuantised(ops, { ...ctx0, _profiles: undefined }, 'srgb')); if (r.export_import_vs_quantised_float64_reference_on_sRGB_display.max > 4 || r.export_import_vs_quantised_float64_reference_on_sRGB_display.mean > 0.05) fail(name + ': export+import differs from the independent quantised reference (sRGB display; a 1-level working-space flip can become ~3 display levels near the gamut edge) ' + JSON.stringify(r.export_import_vs_quantised_float64_reference_on_sRGB_display));
    // the stored merged picture converted to sRGB by (a) our lcms 16-bit NOOPTIMIZE path and (b) the float64 oracle: ground truth for the independent reader's conversion
    { const wk = ops[0].working, P = (sp) => { const by = sp.startsWith('icc:') ? custom : IW.matrixProfile(sp, sp); return lcms.cmsOpenProfileFromMem(by, by.length); }, n = W * W, in16 = new Uint16Array(n * 3);
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) in16[i*3+k] = ex.merged[i*4+k] * 257;
      const t = lcms.cmsCreateTransform(P(wk), L.TYPE_RGB_16, P('srgb'), L.TYPE_RGB_16, L.INTENT_RELATIVE_COLORIMETRIC, L.cmsFLAGS_NOOPTIMIZE), o16 = lcms.cmsDoTransform(t, in16, n), ours = new Uint8Array(n * 4), orc = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) { const d = CM.fromXyz01('srgb', CM.toXyz01(refName(wk), [0, 1, 2].map((k) => ex.merged[i*4+k] / 255))); for (let k = 0; k < 3; k++) { ours[i*4+k] = Math.floor(o16[i*3+k] / 257 + 0.5); orc[i*4+k] = Math.floor(d[k] * 255 + 0.5); } ours[i*4+3] = orc[i*4+3] = 255; }
      r.our_conversion_of_stored_picture_vs_float64_oracle = diff8(ours, orc); if (r.our_conversion_of_stored_picture_vs_float64_oracle.max > 1) fail(name + ': our lcms conversion deviates from the float64 oracle ' + JSON.stringify(r.our_conversion_of_stored_picture_vs_float64_oracle));
      fs.writeFileSync(path.join(EMIT, name + '.oracle_srgb.rgba8'), orc); }
    r.drift_vs_unquantised_original_sRGB_display = diff8(back, orig); if (r.drift_vs_unquantised_original_sRGB_display.mean > 0.5) fail(name + ': mean drift vs original too high ' + JSON.stringify(r.drift_vs_unquantised_original_sRGB_display));
    r.imported_space_matches_working = (imp.info.space.startsWith('icc:') ? 'icc' : imp.info.space) === (ops[0].working.startsWith('icc:') ? 'icc' : ops[0].working); if (!r.imported_space_matches_working) fail(name + ': imported as ' + imp.info.space);
    // fixed point: export(import(export(x))) must equal export(x) in content
    const ex3 = exportPsd(imp.ops, c2), imp3 = importPsd(ex3.bytes); r.second_generation_ops_identical = JSON.stringify(imp.ops) === JSON.stringify(imp3.ops) && [...imp.blobs.keys()].sort().join() === [...imp3.blobs.keys()].sort().join();
    if (!r.second_generation_ops_identical) fail(name + ': export/import is not a fixed point after the first pass');
    const c3 = { L, lcms, blobs: new Map([...blobs, ...imp3.blobs]) }, ex4 = exportPsd(imp3.ops, c3); r.bytes_identical_from_generation_2 = Buffer.compare(Buffer.from(ex3.bytes), Buffer.from(ex4.bytes)) === 0;
    r.generation_1_vs_2_bytes_identical_info = Buffer.compare(Buffer.from(ex.bytes), Buffer.from(ex3.bytes)) === 0;   // may differ: the stored merged preview is recomputed from the 8-bit layers
    if (!r.bytes_identical_from_generation_2) fail(name + ': PSD bytes are not stable from generation 2');
    fs.writeFileSync(path.join(EMIT, name + '.srgb.rgba8'), back);
    hashes['psd_' + name] = S.sha256(ex.bytes); hashes['render_' + name] = S.sha256(back); checks.cases[name] = r;
    fs.writeFileSync(path.join(EMIT, name + '.psd'), ex.bytes); fs.writeFileSync(path.join(EMIT, name + '.work.rgba8'), ex.merged);
    expect[name] = { icc_sha256: S.sha256(ops[0].working.startsWith('icc:') ? custom : IW.matrixProfile(ops[0].working, { srgb: 'sRGB-like matrix profile (psd-oplog generated)', p3: 'Display-P3-like matrix profile (psd-oplog generated)', adobe: 'Adobe-RGB-like matrix profile (psd-oplog generated)' }[ops[0].working])), layers: ex.info.layers, W, masks: ops.filter((o) => o.op === 'layer' && o.mask).length };
  }
  fs.writeFileSync(path.join(EMIT, 'expect.json'), JSON.stringify(expect));
  // refusals
  const lin = makeDoc(1, 'srgb', 'linear', ['srgb']); let refused = false; try { exportPsd(lin, { ...ctx0, _profiles: undefined }); } catch (e) { refused = /linear/.test(e.message); } checks.linear_document_refused = refused; if (!refused) fail('linear-light document was exported');
  let invalid = false; try { exportPsd([{ op: 'layer' }], { ...ctx0 }); } catch (e) { invalid = /invalid op-log/.test(e.message); } checks.invalid_oplog_refused = invalid; if (!invalid) fail('invalid op-log was exported');
  if (update) fs.writeFileSync(GOLD, JSON.stringify(hashes, null, 1) + '\n'); else { const want = JSON.parse(fs.readFileSync(GOLD, 'utf8')); for (const k of Object.keys(want)) if (hashes[k] !== want[k]) fail('golden ' + k + ' changed'); }
  if (process.argv.includes('--no-python')) { console.log(JSON.stringify({ samples_written_to: EMIT, files: fs.readdirSync(EMIT).filter((f) => f.endsWith('.psd')), gate: fails.length ? 'FAIL' : 'PASS', fails }, null, 1)); process.exit(fails.length ? 1 : 0); }
  let ind; try { ind = JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'check_export.py'), EMIT], { encoding: 'utf8' })); } catch (e) { ind = { error: String(e.stdout || e.message).slice(0, 600) }; fail('independent reader check failed to run: ' + ind.error); }
  if (ind.fails) ind.fails.forEach((x) => fail('psd-tools: ' + x)); checks.independent_reader_psd_tools = ind.results || ind;
  console.log(JSON.stringify({ checks, gate: fails.length ? 'FAIL' : 'PASS', fails }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
