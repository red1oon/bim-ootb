// Usage: node doc/run_doc.js [--update]   (run `sh icc/fetch_profiles.sh` once first)
// Schema-driven colour-managed fold + PSD import. Checks: lcms pipeline vs independent float64 reference, schema rejections,
// replay/JSON/hash-chain behaviour, PSD ICC resource round trip + import, Node vs Chromium, golden hashes.
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), GOLD = path.join(__dirname, 'golden_doc.json'), EMIT = path.join(__dirname, '.emit'), update = process.argv.includes('--update');
const S = require('../stack.js'), O = require('../oracle.js'), CM = require('../icc/color_math.js'), IW = require('../icc/icc_write.js'), Sch = require('./schema.js'), DF = require('./docfold.js'), PI = require('./psd_icc.js'), { importPsd } = require('./psd_import.js');
const { writePsd } = require('ag-psd'), F = Math.fround, W = 128, fails = [], checks = {}, hashes = {};
const fail = (m) => fails.push(m), b64 = (u) => Buffer.from(u).toString('base64');
(async () => {
  const L = await import('lcms-wasm'), lcms = await L.instantiate(), blobs = new Map(), ctx = { L, lcms, blobs };
  const customIcc = IW.matrixProfile('custom18', 'custom gamma-1.8 test profile'), customSha = S.sha256(customIcc); blobs.set(customSha, customIcc);
  const refName = (sp) => sp.startsWith('icc:') ? 'custom18' : sp;   // the only embedded profile used in these tests
  // ---------- scenes
  const makeDoc = (seed, working, gamma, spaces) => [{ op: 'doc', v: 1, w: W, h: W, working, gamma }, ...S.makeScene(seed, W).map((o) => o.op === 'layer' ? { ...o, space: spaces[o.id % spaces.length] } : o)];
  const jobs = []; // {key, ops, blobs(Map), display}
  for (const working of ['srgb', 'p3', 'adobe']) for (const gamma of ['encoded', 'linear']) for (const display of ['srgb', 'p3']) jobs.push({ key: `s1_${working}_${gamma}_${display}`, ops: makeDoc(1, working, gamma, ['srgb', 'p3', 'adobe']), display });
  jobs.push({ key: 's2_icc_encoded_srgb', ops: makeDoc(2, 'icc:' + customSha, 'encoded', ['srgb', 'icc:' + customSha, 'p3']), display: 'srgb' });
  jobs.push({ key: 's2_srgb_encoded_icc', ops: makeDoc(2, 'srgb', 'encoded', ['p3', 'icc:' + customSha, 'srgb']), display: 'icc:' + customSha });
  // ---------- independent float64 reference
  function reference(ops, display) {
    const f = DF.fold(ops, ctx), doc = f.doc, work = DF.workName(doc).replace(/^icc:.*?(_linear)?$/, 'custom18$1'), workRef = refName(doc.working) + (doc.gamma === 'linear' ? '_linear' : ''), n = W * W;
    const st = { W, order: f.st.order.slice(), L: {} };
    for (const id of st.order) { const l = f.st.L[id], sp = refName(f.spaceOf[id]), pix = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { const a = l.pix[i*4+3]; pix[i*4+3] = a; if (a > 0) { const c = [0, 1, 2].map((k) => l.pix[i*4+k] / a), w = CM.fromXyz01(workRef, CM.toXyz01(sp, c)); for (let k = 0; k < 3; k++) pix[i*4+k] = F(w[k] * a); } }
      st.L[id] = { mode: l.mode, opacity: l.opacity, pix, mask: l.mask }; }
    const { C, A } = O.spec64raw(st), res = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { const d = CM.fromXyz01(refName(display), CM.toXyz01(workRef, [C[i*3], C[i*3+1], C[i*3+2]])); for (let k = 0; k < 3; k++) res[i*4+k] = Math.floor(d[k] * 255 + 0.5); res[i*4+3] = Math.floor(A[i] * 255 + 0.5); }
    return res;
  }
  const diff8 = (a, b) => { let mx = 0, sum = 0; for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(a[i+k] - b[i+k]); mx = Math.max(mx, d); sum += d; } return { max: mx, mean: +(sum / (a.length * 0.75)).toFixed(4) }; };
  checks.pipeline_vs_float64_reference = {};
  for (const j of jobs) { const f = DF.fold(j.ops, ctx), out = DF.render(DF.composite(f, ctx), f, j.display, ctx), d = diff8(out, reference(j.ops, j.display));
    checks.pipeline_vs_float64_reference[j.key] = d; if (d.max > 2 || d.mean > 0.3) fail(j.key + ' differs from float64 reference ' + JSON.stringify(d)); hashes['render_' + j.key] = S.sha256(out); }
  // ---------- schema / semantics
  const base = makeDoc(1, 'p3', 'encoded', ['srgb', 'p3', 'adobe']), L1 = { op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false, space: 'srgb' }, D = { op: 'doc', v: 1, w: 8, h: 8, working: 'srgb', gamma: 'encoded' };
  const neg = { 'no doc op': [L1], 'doc not first': [L1, D], 'two doc ops': [D, D], 'bad version': [{ ...D, v: 3 }], 'non-square': [{ ...D, h: 4 }], 'unknown working space': [{ ...D, working: 'rec2020' }], 'bad gamma value': [{ ...D, gamma: 'srgb' }],
    'linear with embedded profile': [{ ...D, working: 'icc:' + customSha, gamma: 'linear' }], 'bad blend mode': [D, { ...L1, mode: 'hue' }], 'opacity > 1': [D, { ...L1, opacity: 1.5 }], 'missing layer space': [D, (({ space, ...r }) => r)(L1)], 'duplicate layer id': [D, L1, L1],
    'unknown op': [D, { op: 'blur', layer: 0 }], 'unknown field': [D, { ...L1, extra: 1 }], 'op on unknown layer': [D, { op: 'fill', layer: 9, c: [0, 0, 0], a: 1 }], 'colour out of range': [D, L1, { op: 'fill', layer: 0, c: [2, 0, 0], a: 1 }],
    'mask paint without mask': [D, L1, { op: 'mdab', layer: 0, x: 1, y: 1, r: 2, v: 0, a: 1 }], 'raster blob missing': [D, L1, { op: 'raster', layer: 0, pixels: 'a'.repeat(64) }], 'NaN geometry': [D, L1, { op: 'dab', layer: 0, x: NaN, y: 1, r: 2, c: [0, 0, 0], a: 1 }] };
  checks.schema_rejections = {}; for (const [name, ops] of Object.entries(neg)) { const e = Sch.validate(ops, new Map()); checks.schema_rejections[name] = e.length > 0; if (!e.length) fail('schema accepted invalid log: ' + name); }
  if (Sch.validate(base, blobs).length) fail('valid scene rejected: ' + Sch.validate(base, blobs).join('; '));
  { const bad = new Map(blobs); const g = new Uint8Array(W * W * 4); const sha = S.sha256(g); bad.set(sha, g.slice(0, 10)); const e = Sch.validate([...base.slice(0, 2), { op: 'raster', layer: base[1].id, pixels: sha }], bad); checks.schema_rejections['blob wrong size'] = e.length > 0; if (!e.length) fail('wrong-size blob accepted');
    const lie = new Map(blobs); lie.set('b'.repeat(64), g); const e2 = Sch.validate([...base.slice(0, 2), { op: 'raster', layer: base[1].id, pixels: 'b'.repeat(64) }], lie); checks.schema_rejections['blob hash mismatch'] = e2.length > 0; if (!e2.length) fail('blob with wrong hash accepted'); }
  const run1 = (ops) => { const f = DF.fold(ops, ctx); return S.sha256(DF.render(DF.composite(f, ctx), f, 'srgb', ctx)); };
  const h0 = run1(base), h1 = run1(JSON.parse(JSON.stringify(base)));
  const sem = { replay_twice_identical: h0 === run1(base), json_roundtrip_identical: h0 === h1,
    working_space_is_recorded: h0 !== run1([{ ...base[0], working: 'srgb' }, ...base.slice(1)]), gamma_flag_is_recorded: h0 !== run1([{ ...base[0], gamma: 'linear' }, ...base.slice(1)]),
    layer_space_tag_is_recorded: h0 !== run1(base.map((o) => o.op === 'layer' && o.id === 2 ? { ...o, space: 'srgb' } : o)) };
  const log = S.chain(base); sem.chain_verifies = S.verifyChain(log) === -1; const t = JSON.parse(JSON.stringify(log)); t[0].op.gamma = 'linear'; sem.tamper_with_doc_op_detected_at_0 = S.verifyChain(t) === 0; sem.chain_head = log[log.length - 1].h.slice(0, 16);
  checks.semantics = sem; for (const [k, v] of Object.entries(sem)) if (v === false) fail('semantics: ' + k); hashes.chain_head_s1_p3 = log[log.length - 1].h;
  // ---------- PSD: embed profiles, import, compare
  const quant = (st) => st.order.map((id) => { const l = st.L[id], rgba = new Uint8ClampedArray(W * W * 4); for (let i = 0; i < W * W; i++) { const a = l.pix[i*4+3]; rgba[i*4+3] = Math.floor(a * 255 + 0.5); if (a > 0) for (let k = 0; k < 3; k++) rgba[i*4+k] = Math.max(0, Math.min(255, Math.floor(l.pix[i*4+k] / a * 255 + 0.5))); }
    return { mode: l.mode, opacity: Math.round(l.opacity * 255 + 1e-4) / 255, rgba, mask: l.mask ? Uint8Array.from(l.mask, (m) => Math.floor(m * 255 + 0.5)) : null }; });
  const PSD_MODE = { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', 'soft-light': 'soft light', 'hard-light': 'hard light', darken: 'darken', lighten: 'lighten', difference: 'difference', exclusion: 'exclusion' };
  const layers = quant(S.fold(S.makeScene(1, W), W));
  const mkPsd = () => new Uint8Array(writePsd({ width: W, height: W, children: layers.map((l, i) => ({ name: 'L' + i, left: 0, top: 0, right: W, bottom: W, blendMode: PSD_MODE[l.mode], opacity: l.opacity, imageData: { width: W, height: W, data: l.rgba },
    ...(l.mask ? { mask: { left: 0, top: 0, right: W, bottom: W, defaultColor: 255, imageData: { width: W, height: W, data: Uint8ClampedArray.from({ length: W * W * 4 }, (_, j) => (j & 3) === 3 ? 255 : l.mask[j >> 2]) } } } : {}) })) }, { generateThumbnail: false }));
  const gsRgb = fs.existsSync(path.join(ROOT, 'icc/profiles/default_rgb.icc')) ? new Uint8Array(fs.readFileSync(path.join(ROOT, 'icc/profiles/default_rgb.icc'))) : null;
  const psdCases = [['tagged_srgb', IW.matrixProfile('srgb', 'srgb')], ['tagged_p3', IW.matrixProfile('p3', 'p3')], ['tagged_adobe', IW.matrixProfile('adobe', 'adobe')], ['tagged_custom18_embedded', customIcc], ['untagged', null]];
  if (gsRgb) psdCases.push(['tagged_gs_default_rgb_v2', gsRgb]);
  checks.psd = {}; fs.mkdirSync(EMIT, { recursive: true }); const psdJobs = [], expectJson = {};
  for (const [name, icc] of psdCases) {
    const raw = mkPsd(), bytes = icc ? PI.setResource(raw, 1039, icc) : raw, r = { icc_roundtrips_byte_identical: icc ? Buffer.compare(Buffer.from(PI.meta(bytes).icc || []), Buffer.from(icc)) === 0 : PI.meta(bytes).icc === null };
    if (!r.icc_roundtrips_byte_identical) fail(name + ': ICC resource did not round trip');
    const imp = importPsd(bytes), sp = imp.info.space; r.import_space = sp.startsWith('icc:') ? 'icc:' + sp.slice(4, 12) + '…' : sp; r.profile_decision = imp.info.profile;
    const want = { tagged_srgb: 'srgb', tagged_p3: 'p3', tagged_adobe: 'adobe', untagged: 'srgb', tagged_gs_default_rgb_v2: 'srgb' }[name]; if (want && sp !== want) fail(name + ': imported as ' + sp + ', expected ' + want); if (name === 'tagged_custom18_embedded' && !sp.startsWith('icc:')) fail(name + ': custom profile was wrongly matched to a built-in');
    // pixel fidelity of the import
    let bad = 0; imp.ops.filter((o) => o.op === 'raster').forEach((o) => { const got = imp.blobs.get(o.pixels), src = layers[o.layer].rgba; for (let i = 0; i < W * W; i++) { if (got[i*4+3] !== src[i*4+3]) bad++; else if (src[i*4+3] > 0) for (let k = 0; k < 3; k++) if (got[i*4+k] !== src[i*4+k]) bad++; } });
    imp.ops.filter((o) => o.op === 'maskraster').forEach((o) => { const got = imp.blobs.get(o.pixels), src = layers[o.layer].mask; for (let i = 0; i < W * W; i++) if (got[i] !== src[i]) bad++; });
    r.import_pixel_mismatches = bad; if (bad) fail(name + ': ' + bad + ' pixel/mask mismatches after import');
    const all = new Map([...blobs, ...imp.blobs]); if (Sch.validate(imp.ops, all).length) fail(name + ': imported op-log fails validation: ' + Sch.validate(imp.ops, all).join('; '));
    const c2 = { L, lcms, blobs: all }, f = DF.fold(imp.ops, c2), out = DF.render(DF.composite(f, c2), f, 'srgb', c2);
    // reference: tagged data in space `sp` -> sRGB display, built from the source layer bytes with no ICC engine (custom18 stands in for the embedded profile)
    const rs = refName(sp), st = { W, order: layers.map((_, i) => i), L: {} };
    layers.forEach((l, i) => { const pix = new Float32Array(W * W * 4); for (let p = 0; p < W * W; p++) { const a = F(l.rgba[p*4+3] / 255); pix[p*4+3] = a; if (a > 0) { const w = CM.fromXyz01(rs, CM.toXyz01(rs, [l.rgba[p*4] / 255, l.rgba[p*4+1] / 255, l.rgba[p*4+2] / 255])); for (let k = 0; k < 3; k++) pix[p*4+k] = F(w[k] * a); } }
      st.L[i] = { mode: l.mode, opacity: F(l.opacity), pix, mask: l.mask ? Float32Array.from(l.mask, (m) => F(m / 255)) : null }; });
    const { C, A } = O.spec64raw(st), ref = new Uint8Array(W * W * 4); for (let p = 0; p < W * W; p++) { const d = CM.fromXyz01('srgb', CM.toXyz01(rs, [C[p*3], C[p*3+1], C[p*3+2]])); for (let k = 0; k < 3; k++) ref[p*4+k] = Math.floor(d[k] * 255 + 0.5); ref[p*4+3] = Math.floor(A[p] * 255 + 0.5); }
    r.render_vs_float64_reference = diff8(out, ref); if (name !== 'tagged_gs_default_rgb_v2' ? (r.render_vs_float64_reference.max > 2) : (r.render_vs_float64_reference.max > 4)) fail(name + ': import+render differs from reference ' + JSON.stringify(r.render_vs_float64_reference));
    if (name === 'tagged_p3' || name === 'tagged_adobe') {   // negative control: ignore the embedded profile (treat pixels as sRGB) -> the gate must notice
      const ig = imp.ops.map((o) => o.op === 'doc' ? { ...o, working: 'srgb' } : o.op === 'layer' ? { ...o, space: 'srgb' } : o), cf = DF.fold(ig, c2), wrong = DF.render(DF.composite(cf, c2), cf, 'srgb', c2), dw = diff8(wrong, ref);
      (checks.negative_control_profile_ignored = checks.negative_control_profile_ignored || {})[name] = dw; if (dw.max <= 5) fail(name + ': negative control failed: ignoring the profile was not detected (' + JSON.stringify(dw) + ')'); }
    hashes['psd_' + name] = S.sha256(out); checks.psd[name] = r; psdJobs.push({ key: 'psd_' + name, ops: imp.ops, blobs: imp.blobs, display: 'srgb' });
    fs.writeFileSync(path.join(EMIT, name + '.psd'), bytes); expectJson[name] = { icc_sha256: icc ? S.sha256(icc) : null, layers: layers.length, modes: layers.map((l) => PSD_MODE[l.mode]), opacity: layers.map((l) => Math.round(l.opacity * 255 + 1e-4)) };
  }
  fs.writeFileSync(path.join(EMIT, 'expect.json'), JSON.stringify(expectJson));
  // rejections of unsupported PSDs
  const rawPsd = mkPsd(), patch = (off, bytes) => { const c = rawPsd.slice(); bytes.forEach((v, i) => c[off + i] = v); return c; };
  checks.psd_unsupported_rejected = {}; for (const [name, b] of Object.entries({ 'CMYK colour mode': patch(24, [0, 4]), '32-bit depth': patch(22, [0, 32]), 'PSB (version 2)': patch(4, [0, 2]), 'bad signature': patch(0, [0x58]) })) { let ok = false; try { importPsd(b); } catch (e) { ok = true; } checks.psd_unsupported_rejected[name] = ok; if (!ok) fail('unsupported PSD accepted: ' + name); }
  // ---------- Chromium parity
  const { chromium } = require('playwright-core');
  const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
  const br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), pg = await br.newPage(); pg.on('pageerror', (e) => fail('page error: ' + e.message));
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/icc/blank.html');
  for (const s of ['/icc/color_math.js', '/icc/icc_write.js', '/stack.js', '/doc/schema.js', '/doc/docfold.js']) await pg.addScriptTag({ url: 'http://127.0.0.1:' + srv.address().port + s });
  const pack = (j, extra) => ({ key: j.key, ops: j.ops, display: j.display, blobs: Object.fromEntries([...(j.blobs || extra)].map(([k, v]) => [k, b64(v)])) });
  const payload = [...jobs.map((j) => pack(j, blobs)), ...psdJobs.map((j) => pack(j, j.blobs))];
  const bh = await pg.evaluate(async (payload) => { const L = await import('/node_modules/lcms-wasm/dist/lcms.js'), lcms = await L.instantiate(), out = {};
    for (const j of payload) { const blobs = new Map(Object.entries(j.blobs).map(([k, v]) => [k, Uint8Array.from(atob(v), (c) => c.charCodeAt(0))])), ctx = { L, lcms, blobs }, f = DocFold.fold(j.ops, ctx); out[j.key] = Stack.sha256(DocFold.render(DocFold.composite(f, ctx), f, j.display, ctx)); } return out; }, payload);
  await br.close(); srv.close();
  let same = 0; for (const j of [...jobs, ...psdJobs]) { const k = j.key.startsWith('psd_') ? j.key : 'render_' + j.key; if (bh[j.key] === hashes[k]) same++; else fail('Node and Chromium differ for ' + j.key); } checks.node_equals_chromium = same + '/' + (jobs.length + psdJobs.length);
  // ---------- golden + independent PSD reader
  if (update) fs.writeFileSync(GOLD, JSON.stringify(hashes, null, 1) + '\n'); else { const want = JSON.parse(fs.readFileSync(GOLD, 'utf8')); for (const k of Object.keys(want)) if (hashes[k] !== want[k]) fail('golden ' + k + ' changed'); }
  let ind; try { ind = JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'check_psd_icc.py'), EMIT], { encoding: 'utf8' })); } catch (e) { ind = { error: String(e.stdout || e.message).slice(0, 500) }; fail('independent PSD reader check failed to run/pass: ' + ind.error); }
  if (ind.fails && ind.fails.length) ind.fails.forEach((f) => fail('psd-tools: ' + f)); checks.independent_psd_reader_psd_tools = ind.results || ind;
  console.log(JSON.stringify({ checks, hashes_count: Object.keys(hashes).length, gate: fails.length ? 'FAIL' : 'PASS', fails }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
