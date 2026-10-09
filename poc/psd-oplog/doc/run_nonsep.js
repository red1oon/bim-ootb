// Usage: node doc/run_nonsep.js [--update]   Non-separable blend modes (hue, saturation, color, luminosity). Every check logged as {id,name,value,cmp,limit,pass}.
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), GOLD = path.join(__dirname, 'golden_nonsep.json'), update = process.argv.includes('--update');
const S = require('../stack.js'), O = require('../oracle.js'), CM = require('../icc/color_math.js'), Sch = require('./schema.js'), DF = require('./docfold.js'), { exportPsd } = require('./psd_export.js'), { importPsd } = require('./psd_import.js');
const W = 128, F = Math.fround, rec = [], fails = [], hashes = {}, MODES4 = S.NONSEP;
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push(`${id} ${name}: got ${value}, need ${cmp} ${limit}`); };
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r4 = (x) => Math.round(x * 1e4) / 1e4;
const dabs = (ops, layer, n, rnd, big) => { for (let i = 0; i < n; i++) ops.push({ op: 'dab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4((big ? 14 : 6) + rnd() * W * 0.22), c: [r4(rnd()), r4(rnd()), r4(rnd())], a: r4(0.25 + rnd() * 0.7) }); };
const Ly = (id, mode, opacity, space, extra = {}) => ({ op: 'layer', id, mode, opacity, mask: !!extra.mask, space, ...(extra.parent !== undefined ? { parent: extra.parent } : {}), ...(extra.clip ? { clip: true } : {}) });
function modeDoc(mode, seed, working = 'srgb') { const rnd = rng(seed), ops = [{ op: 'doc', v: 2, w: W, h: W, working, gamma: 'encoded' }, Ly(0, 'normal', 1, 'srgb'), { op: 'fill', layer: 0, c: [0.5, 0.45, 0.55], a: 1 }]; dabs(ops, 0, 40, rnd, true);
  ops.push(Ly(1, mode, 0.8, 'srgb')); dabs(ops, 1, 60, rnd, true); return ops; }
function allModesDoc(seed, working) { const rnd = rng(seed), ops = [{ op: 'doc', v: 2, w: W, h: W, working, gamma: 'encoded' }, Ly(0, 'normal', 1, 'srgb'), { op: 'fill', layer: 0, c: [0.55, 0.5, 0.5], a: 1 }]; dabs(ops, 0, 40, rnd, true);
  ops.push({ op: 'group', id: 10, mode: 'pass-through', opacity: 0.85, mask: false }); ops.push(Ly(1, 'hue', 0.9, 'srgb', { parent: 10 })); dabs(ops, 1, 40, rnd, true); ops.push(Ly(2, 'saturation', 0.8, 'p3', { parent: 10 })); dabs(ops, 2, 40, rnd, true);
  ops.push(Ly(3, 'color', 0.7, 'srgb')); dabs(ops, 3, 40, rnd, true); ops.push(Ly(4, 'luminosity', 0.9, 'p3', { clip: true })); dabs(ops, 4, 40, rnd, true); ops.push(Ly(5, 'color', 0.8, 'srgb', { clip: true })); dabs(ops, 5, 30, rnd, true);
  ops.push({ op: 'group', id: 11, mode: 'luminosity', opacity: 0.8, mask: false }); ops.push(Ly(6, 'normal', 1, 'srgb', { parent: 11 })); dabs(ops, 6, 40, rnd, true); return ops; }
(async () => {
  const L = await import('lcms-wasm'), lcms = await L.instantiate(), ctx = { L, lcms, blobs: new Map() };
  // ---- H30a/b: property tests on random colour pairs (canonical f32)
  { const rnd = rng(77); let dev = { hue: 0, saturation: 0, color: 0, luminosity: 0 }, lo = 1, hi = 0; const lumF = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    for (let i = 0; i < 200000; i++) { const cb = [F(rnd()), F(rnd()), F(rnd())], cs = [F(rnd()), F(rnd()), F(rnd())];
      for (const m of MODES4) { const B = S.BLEND[m](cb, cs), target = m === 'luminosity' ? lumF(cs) : lumF(cb); dev[m] = Math.max(dev[m], Math.abs(lumF(B) - target)); lo = Math.min(lo, ...B); hi = Math.max(hi, ...B); } }
    for (const m of MODES4) chk('H30a', `luminosity preserved by ${m} (200k random pairs, max abs deviation)`, dev[m], '<=', 5e-6);
    chk('H30b', 'results stay inside [0,1]: min', lo, '>=', -1e-6); chk('H30b', 'results stay inside [0,1]: max', hi, '<=', 1 + 1e-6);
    // degenerate inputs that exercise the branches: grey backdrop (Sat 0), grey source, equal channels, extremes
    const cases = [[[0.5, 0.5, 0.5], [0.9, 0.2, 0.1]], [[0.9, 0.2, 0.1], [0.5, 0.5, 0.5]], [[0, 0, 0], [1, 1, 1]], [[1, 1, 1], [0, 0, 0]], [[0.3, 0.3, 0.7], [0.7, 0.3, 0.3]], [[1, 0, 0], [0, 0, 1]], [[0.2, 0.9, 0.9], [0.9, 0.9, 0.2]]]; let bad = 0;
    for (const [cb, cs] of cases) for (const m of MODES4) { const a = S.BLEND[m](cb.map(F), cs.map(F)), b = O.spec64raw ? null : null; if (a.some((v) => !(v >= -1e-6 && v <= 1 + 1e-6))) bad++; }
    chk('H30b', 'degenerate colour pairs (grey, black, white, equal channels) produce in-range finite results (violations)', bad, '==', 0); }
  // ---- H30c: canonical + lcms vs independent float64 oracle in documents
  const refPipeline = (ops, display, q16) => { const f = DF.fold(ops, ctx), doc = f.doc, n = W * W, wk = doc.working, st = { W, order: f.st.order.slice(), L: {}, G: f.st.G, root: f.st.root, hasTree: f.st.hasTree };
    for (const id of st.order) { const l = f.st.L[id], sp = f.spaceOf[id], pix = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const a = l.pix[i*4+3]; pix[i*4+3] = a; if (a > 0) { const w = CM.fromXyz01(wk, CM.toXyz01(sp, [0, 1, 2].map((k) => l.pix[i*4+k] / a))); for (let k = 0; k < 3; k++) pix[i*4+k] = F((q16 ? Math.round(w[k] * 65535) / 65535 : w[k]) * a); } } st.L[id] = { ...l, pix }; }
    const { C, A } = O.spec64tree(st), res = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { const d = CM.fromXyz01(display, CM.toXyz01(wk, [C[i*3], C[i*3+1], C[i*3+2]])); for (let k = 0; k < 3; k++) res[i*4+k] = Math.floor(d[k] * 255 + 0.5); res[i*4+3] = Math.floor(A[i] * 255 + 0.5); } return res; };
  const d8 = (a, b) => { let mx = 0, sum = 0; for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(a[i+k] - b[i+k]); mx = Math.max(mx, d); sum += d; } return { max: mx, mean: sum / (a.length * 0.75) }; };
  const jobs = []; for (const m of MODES4) for (const seed of [1, 2]) jobs.push({ key: `${m}_s${seed}`, ops: modeDoc(m, seed) }); for (const w of ['srgb', 'p3']) jobs.push({ key: 'all_modes_groups_clips_' + w, ops: allModesDoc(3, w) });
  chk('SCH0', 'documents validate under schema v2 (errors)', jobs.map((j) => Sch.validate(j.ops, ctx.blobs).length).reduce((a, b) => a + b, 0), '==', 0);
  for (const j of jobs) { const f = DF.fold(j.ops, ctx), back = DF.composite(f, ctx), wk = j.ops[0].working, out = DF.render(back, f, wk, ctx), d = d8(out, refPipeline(j.ops, wk));
    chk('H30c', `${j.key}: pipeline vs EXACT float64 oracle (max levels, working space)`, d.max, '<=', 2); chk('H30cm', `${j.key}: mean levels`, +d.mean.toFixed(4), '<=', 0.05);
    // H30c4: the oracle gets the EXACT converted layers the canonical composite saw (lcms output)
    { const cs = DF.compositeState(f, ctx), b32 = S.composite(cs), { C } = O.spec64tree(cs), qq = (v) => Math.floor(v * 255 + 0.5), n = W * W; let mx = 0, over1 = 0;
      for (let i = 0; i < n; i++) { const a32 = b32[i*4+3]; for (let k = 0; k < 3; k++) { const dd = Math.abs(qq(a32 > 0 ? b32[i*4+k] / a32 : 0) - qq(C[i*3+k])); mx = Math.max(mx, dd); if (dd > 1) over1++; } }
      chk('H30c4', `${j.key}: oracle fed the lcms-converted layers vs canonical: max levels`, mx, '<=', 1); chk('H30c4', `${j.key}: samples over 1 level`, over1, '==', 0); }
    // compositor only: identical converted layers (the ones the canonical composite actually sees)
    { const n = W * W, cst = { W, order: f.st.order.slice(), L: {}, G: f.st.G, root: f.st.root, hasTree: f.st.hasTree };
      for (const id of cst.order) { const l = f.st.L[id], sp = f.spaceOf[id], pix = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const a = l.pix[i*4+3]; pix[i*4+3] = a; if (a > 0) { const w = CM.fromXyz01(wk, CM.toXyz01(sp, [0, 1, 2].map((k) => l.pix[i*4+k] / a))); for (let k = 0; k < 3; k++) pix[i*4+k] = F(w[k] * a); } } cst.L[id] = { ...l, pix }; }
      const b32 = S.compositeTree(cst), { C, A } = O.spec64tree(cst), qq = (v) => Math.floor(v * 255 + 0.5); let mx = 0, over1 = 0; for (let i = 0; i < n; i++) { const a32 = b32[i*4+3]; for (let k = 0; k < 3; k++) { const dd = Math.abs(qq(a32 > 0 ? b32[i*4+k] / a32 : 0) - qq(C[i*3+k])); mx = Math.max(mx, dd); if (dd > 1) over1++; } }
      chk('H30c2', `${j.key}: compositor-only, identical converted layers: max levels`, mx, '<=', 1); chk('H30c2', `${j.key}: compositor-only samples over 1 level`, over1, '==', 0); }
    hashes['f32_' + j.key] = S.hashF32(back); hashes['render_' + j.key] = S.sha256(DF.render(back, f, 'srgb', ctx)); }
  // ---- H30e: mutation controls
  { const ref = refPipeline(jobs[0].ops, 'srgb'), mk = (fn) => { const f = DF.fold(jobs[0].ops, ctx); fn(f.st); return d8(DF.render(DF.composite(f, ctx), f, 'srgb', ctx), ref).max; };
    chk('H30e', 'control: unmutated hue document vs oracle (levels)', mk(() => {}), '<=', 1);
    for (const [to, tag] of [['color', 'hue->color'], ['normal', 'hue->normal'], ['saturation', 'hue->saturation']]) chk('H30e', `mutation ${tag} is detected (levels from oracle)`, mk((st) => { st.L[1].mode = to; }), '>=', 4); }
  // ---- H30g: schema
  { const D1 = { op: 'doc', v: 1, w: 8, h: 8, working: 'srgb', gamma: 'encoded' }, D2 = { ...D1, v: 2 }; let rej = 0, acc = 0; for (const m of MODES4) { if (Sch.validate([D1, Ly(0, m, 1, 'srgb')], new Map()).length) rej++; if (!Sch.validate([D2, Ly(0, m, 1, 'srgb')], new Map()).length) acc++;
      if (!Sch.validate([D2, { op: 'group', id: 1, mode: m, opacity: 1, mask: false }], new Map()).length) acc++; }
    chk('H30g', 'v1 rejects all four modes', rej, '==', 4); chk('H30g', 'v2 accepts all four modes on layers and on groups', acc, '==', 8); chk('H30g', 'existing 10 modes still valid in v1', S.MODES.filter((m) => !Sch.validate([D1, Ly(0, m, 1, 'srgb')], new Map()).length).length, '==', 10); }
  // ---- H30f + H30d: PSD export/import and the independent psd-tools compositor
  const EMIT = path.join(__dirname, '.emit_nonsep'); fs.mkdirSync(EMIT, { recursive: true }); const expect = {};
  const treeOf = (st, ids) => ids.map((id) => st.G[id] ? { kind: 'group', mode: st.G[id].mode, opacity: Math.round(st.G[id].opacity * 255), mask: !!st.G[id].mask, children: treeOf(st, st.G[id].children) } : { kind: 'layer', mode: st.L[id].mode, opacity: Math.round(st.L[id].opacity * 255), mask: !!st.L[id].mask, clip: !!st.L[id].clip });
  for (const j of jobs.filter((x) => /^(hue_s1|saturation_s1|color_s1|luminosity_s1|all_modes_groups_clips_)/.test(x.key))) { const f0 = DF.fold(j.ops, ctx), ex = exportPsd(j.ops, { ...ctx, _profiles: undefined }), imp = importPsd(ex.bytes), all = new Map([...ctx.blobs, ...imp.blobs]), c2 = { L, lcms, blobs: all }, f1 = DF.fold(imp.ops, c2);
    const modes0 = JSON.stringify(treeOf(f0.st, f0.st.root)), modes1 = JSON.stringify(treeOf(f1.st, f1.st.root)); chk('H30f', `${j.key}: PSD export->import preserves modes and tree`, modes1 === modes0, '==', true);
    const ex2 = exportPsd(imp.ops, c2), imp2 = importPsd(ex2.bytes); chk('H30f', `${j.key}: fixed point after the first pass (ops identical)`, JSON.stringify(imp2.ops) === JSON.stringify(imp.ops), '==', true);
    // like for like: the picture psd-tools is compared with is OUR composite of the same 8-bit layers it reads (not the float picture)
    fs.writeFileSync(path.join(EMIT, j.key + '.psd'), ex.bytes); fs.writeFileSync(path.join(EMIT, j.key + '.work.rgba8'), DF.render(DF.composite(f1, c2), f1, j.ops[0].working, c2)); expect[j.key] = { tree: treeOf(f0.st, f0.st.root), W }; hashes['psd_' + j.key] = S.sha256(ex.bytes); }
  fs.writeFileSync(path.join(EMIT, 'expect.json'), JSON.stringify(expect));
  { let ind; try { ind = JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'check_nonsep.py'), EMIT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch (e) { ind = { checks: [] }; fails.push('psd-tools check failed to run'); } for (const c of ind.checks) chk(c.id, c.name, c.value, c.cmp, c.limit); }
  // ---- Chromium parity
  const { chromium } = require('playwright-core'), srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
  const br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), pg = await br.newPage(); pg.on('pageerror', (e) => fails.push('page error: ' + e.message)); const base = 'http://127.0.0.1:' + srv.address().port;
  await pg.goto(base + '/icc/blank.html'); for (const s of ['/icc/color_math.js', '/icc/icc_write.js', '/stack.js', '/doc/schema.js', '/doc/docfold.js']) await pg.addScriptTag({ url: base + s });
  const bh = await pg.evaluate(async (jobs) => { const L = await import('/node_modules/lcms-wasm/dist/lcms.js'), lcms = await L.instantiate(), out = {}; for (const j of jobs) { const ctx = { L, lcms, blobs: new Map() }, f = DocFold.fold(j.ops, ctx), back = DocFold.composite(f, ctx); out['f32_' + j.key] = Stack.hashF32(back); out['render_' + j.key] = Stack.sha256(DocFold.render(back, f, 'srgb', ctx)); } return out; }, jobs.map((j) => ({ key: j.key, ops: j.ops })));
  await br.close(); srv.close(); let same = 0, tot = 0; for (const k of Object.keys(bh)) { tot++; if (bh[k] === hashes[k]) same++; } chk('H30h', 'Node vs Chromium: f32 and sRGB-render hashes identical', same, '==', tot);
  if (update) fs.writeFileSync(GOLD, JSON.stringify(hashes, null, 1) + '\n'); else { const want = JSON.parse(fs.readFileSync(GOLD, 'utf8')); let ch = 0; for (const k of Object.keys(want)) if (hashes[k] !== want[k]) ch++; chk('GOLD', 'golden hashes changed', ch, '==', 0); }
  console.log(JSON.stringify({ checks: rec, n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
