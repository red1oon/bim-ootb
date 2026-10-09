// Usage: node doc/run_groups.js [--update]   Groups + clipping masks. Every check is logged as {id, name, value, cmp, limit, pass}.
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..'), GOLD = path.join(__dirname, 'golden_groups.json'), update = process.argv.includes('--update');
const { execFileSync } = require('child_process'); const S = require('../stack.js'), O = require('../oracle.js'), CM = require('../icc/color_math.js'), Sch = require('./schema.js'), DF = require('./docfold.js'), { exportPsd } = require('./psd_export.js'), { importPsd } = require('./psd_import.js');
const W = 128, F = Math.fround, rec = [], fails = [], hashes = {};
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push(`${id} ${name}: got ${value}, need ${cmp} ${limit}`); };
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r4 = (x) => Math.round(x * 1e4) / 1e4;
const dabs = (ops, layer, n, rnd, big) => { for (let i = 0; i < n; i++) ops.push({ op: 'dab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4((big ? 14 : 5) + rnd() * W * (big ? 0.3 : 0.18)), c: [r4(rnd()), r4(rnd()), r4(rnd())], a: r4(0.2 + rnd() * 0.75) }); };
const mdabs = (ops, layer, n, rnd) => { for (let i = 0; i < n; i++) ops.push({ op: 'mdab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4(10 + rnd() * W * 0.25), v: [0, 1, 0.5][i % 3], a: r4(0.5 + rnd() * 0.5) }); };
const Ly = (id, mode, opacity, mask, space, parent, clip) => ({ op: 'layer', id, mode, opacity, mask, space, ...(parent !== undefined ? { parent } : {}), ...(clip ? { clip: true } : {}) });
const Gp = (id, mode, opacity, mask, parent) => ({ op: 'group', id, mode, opacity, mask, ...(parent !== undefined ? { parent } : {}) });
// ---- the full mixed scene: nested pass-through + isolated groups with masks, clip chains inside and outside groups, mixed layer spaces
function groupScene(seed, working, gamma, spaces) {
  const rnd = rng(seed), sp = (i) => spaces[i % spaces.length], ops = [{ op: 'doc', v: 2, w: W, h: W, working, gamma }];
  ops.push(Ly(0, 'normal', 1, false, sp(0)), { op: 'fill', layer: 0, c: [0.6, 0.55, 0.5], a: 1 }); dabs(ops, 0, 25, rnd);
  ops.push(Gp(10, 'pass-through', 0.7, true));
  ops.push(Ly(1, 'multiply', 0.9, false, sp(1), 10)); dabs(ops, 1, 35, rnd);
  ops.push(Ly(2, 'screen', 0.8, true, sp(2), 10)); dabs(ops, 2, 35, rnd); mdabs(ops, 2, 10, rnd);
  ops.push(Gp(11, 'overlay', 0.8, false, 10), Ly(3, 'normal', 1, false, sp(0), 11)); dabs(ops, 3, 30, rnd); ops.push(Ly(4, 'difference', 0.9, false, sp(1), 11)); dabs(ops, 4, 30, rnd);
  mdabs(ops, 10, 10, rnd);
  ops.push(Ly(5, 'normal', 0.95, false, sp(2))); dabs(ops, 5, 40, rnd);
  ops.push(Ly(6, 'multiply', 1, false, sp(0), undefined, true)); dabs(ops, 6, 40, rnd, true);
  ops.push(Ly(7, 'normal', 0.6, false, sp(1), undefined, true)); dabs(ops, 7, 40, rnd, true);
  ops.push(Gp(12, 'normal', 1, false), Ly(8, 'normal', 1, false, sp(2), 12)); dabs(ops, 8, 35, rnd); ops.push(Ly(9, 'soft-light', 0.8, false, sp(0), 12, true)); dabs(ops, 9, 35, rnd, true);
  ops.push(Ly(13, 'soft-light', 0.7, false, sp(1))); dabs(ops, 13, 30, rnd);
  return ops;
}
// ---- flat reference scene (bg + 4 layers, non-normal modes, one mask) and its grouped variants
function flatLayers(seed, allNormal) { const rnd = rng(seed), modes = allNormal ? ['normal', 'normal', 'normal', 'normal'] : ['multiply', 'screen', 'overlay', 'difference'], ops = [];
  ops.push(Ly(0, 'normal', 1, false, 'srgb'), { op: 'fill', layer: 0, c: [0.5, 0.55, 0.6], a: 1 }); dabs(ops, 0, 20, rnd);
  modes.forEach((m, i) => { ops.push(Ly(i + 1, m, 0.6 + 0.1 * i, i === 1, 'srgb')); dabs(ops, i + 1, 30, rnd); if (i === 1) mdabs(ops, i + 1, 8, rnd); }); return ops; }
const wrap = (layersOps, groupOp, ids, nest) => { // put layers `ids` inside groupOp (and optionally a second nested group)
  const out = [{ op: 'doc', v: 2, w: W, h: W, working: 'srgb', gamma: 'encoded' }]; let opened = false;
  for (const o of layersOps) { const id = o.op === 'layer' ? o.id : o.layer;
    if (ids.includes(id)) { if (!opened) { out.push(groupOp); if (nest) out.push({ ...nest, parent: groupOp.id }); opened = true; } out.push(o.op === 'layer' ? { ...o, parent: nest ? nest.id : groupOp.id } : o); } else out.push(o); }
  return out; };
const flatDoc = (lo) => [{ op: 'doc', v: 2, w: W, h: W, working: 'srgb', gamma: 'encoded' }, ...lo];
const comp = (ops) => { const st = S.fold(ops.slice(1), W); return { st, back: S.composite(st) }; };
const maxAbs = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
const lv = (a, b) => { const x = S.toRGBA8(a), y = S.toRGBA8(b); let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - y[i])); return m; };
(async () => {
  const L = await import('lcms-wasm'), lcms = await L.instantiate(), ctx = { L, lcms, blobs: new Map() };
  // ---------- A. algebraic invariants on the canonical f32 compositor
  const lo = flatLayers(3, false), flat = comp(flatDoc(lo)), g1 = Gp(20, 'pass-through', 1, false), ids = [1, 2, 3, 4];
  const grouped = comp(wrap(lo, g1, ids)), nested = comp(wrap(lo, g1, ids, Gp(21, 'pass-through', 1, false)));
  chk('H16a', 'pass-through group (opacity 1) == flat stack, f32 hash', S.hashF32(grouped.back) === S.hashF32(flat.back), '==', true);
  chk('H16b', 'two nested pass-through groups == flat stack, f32 hash', S.hashF32(nested.back) === S.hashF32(flat.back), '==', true);
  chk('H16c', 'negative control: pass-through opacity 0.999 differs from flat (sensitivity)', S.hashF32(comp(wrap(lo, Gp(20, 'pass-through', 0.999, false), ids)).back) !== S.hashF32(flat.back), '==', true);
  const lon = flatLayers(3, true), flatN = comp(flatDoc(lon)), isoN = comp(wrap(lon, Gp(20, 'normal', 1, false), ids));
  chk('H17', 'isolated normal group, all-normal children == flat (max abs f32 diff)', maxAbs(isoN.back, flatN.back), '<=', 1e-5);
  chk('H19', 'negative control: non-normal layers inside an ISOLATED group differ from flat (levels)', lv(comp(wrap(lo, Gp(20, 'normal', 1, false), ids)).back, flat.back), '>=', 8);
  // H18 clipping invariants (no backdrop layer: base opacity 1, so unit alpha must equal base alpha bit for bit)
  const rc = rng(9), co = [{ op: 'doc', v: 2, w: W, h: W, working: 'srgb', gamma: 'encoded' }, Ly(0, 'normal', 1, false, 'srgb')]; dabs(co, 0, 30, rc);
  const baseOnly = comp(co), baseA = new Float32Array(W * W); for (let i = 0; i < W * W; i++) baseA[i] = baseOnly.back[i*4+3];
  const withClip = [...co, Ly(1, 'multiply', 1, false, 'srgb', undefined, true)]; dabs(withClip, 1, 40, rc, true); withClip.push(Ly(2, 'normal', 0.7, false, 'srgb', undefined, true)); dabs(withClip, 2, 40, rc, true);
  const wc = comp(withClip); let alphaViol = 0, outside = 0, colourChanged = 0;
  for (let i = 0; i < W * W; i++) { if (wc.back[i*4+3] !== baseA[i]) alphaViol++; if (baseA[i] === 0) { outside++; for (let k = 0; k < 4; k++) if (wc.back[i*4+k] !== 0) alphaViol++; } else for (let k = 0; k < 3; k++) if (wc.back[i*4+k] !== baseOnly.back[i*4+k]) { colourChanged++; break; } }
  chk('H18a', 'clip unit alpha == base alpha and nothing outside the base (violating samples)', alphaViol, '==', 0);
  chk('H18b', 'non-vacuous: pixels inside the base where clipped layers changed colour', colourChanged, '>=', 300); chk('H18c', 'non-vacuous: pixels outside the base shape', outside, '>=', 3000);
  const unclipped = comp(withClip.map((o) => o.op === 'layer' && o.clip ? (({ clip, ...r }) => r)(o) : o)); let leak = 0; for (let i = 0; i < W * W; i++) if (baseA[i] === 0 && unclipped.back[i*4+3] !== 0) leak++;
  chk('H18d', 'negative control: the SAME layers without clip DO draw outside the base (pixels)', leak, '>=', 500);
  // H21 no-op invariants
  const none = flat.back, withG = (g) => comp(wrap(lo, g, ids)).back, h = (b) => S.hashF32(b);
  const opsEmpty = [...flatDoc(lo), Gp(30, 'pass-through', 1, false), Gp(31, 'normal', 1, false, undefined)];
  chk('H21a', 'empty groups (pass-through and isolated) are no-ops', h(comp(opsEmpty).back) === h(flat.back), '==', true);
  { const ops0 = wrap(lo, Gp(20, 'pass-through', 0, false), ids), z = comp(ops0).back; const lo2 = lo.filter((o) => !(o.op === 'layer' ? ids.includes(o.id) : ids.includes(o.layer)));
    chk('H21b', 'pass-through opacity 0 == the document without those layers', h(z) === h(comp(flatDoc(lo2)).back), '==', true);
    const zi = comp(wrap(lo, Gp(20, 'normal', 0, false), ids)).back; chk('H21c', 'isolated opacity 0 == the document without those layers', h(zi) === h(comp(flatDoc(lo2)).back), '==', true);
    const m0 = comp(wrap(lo, Gp(20, 'pass-through', 1, true), ids)); m0.st.G[20].mask.fill(0); const m0b = S.composite(m0.st); chk('H21d', 'pass-through with an all-zero mask == the document without those layers', h(m0b) === h(comp(flatDoc(lo2)).back), '==', true);
    const half = comp(wrap(lo, Gp(20, 'pass-through', 0.5, false), ids)).back, full = withG(Gp(20, 'pass-through', 1, false)); let dm = 0; for (let i = 0; i < half.length; i++) dm = Math.max(dm, Math.abs(half[i] - 0.5 * (comp(flatDoc(lo2)).back[i] + full[i]))); chk('H21e', 'pass-through opacity 0.5 is the midpoint of before/after (max abs f32 diff)', dm, '<=', 1e-6); }
  // ---------- B. colour-managed documents vs the independent float64 tree compositor
  const refName = (sp) => sp, work8 = (a) => a;
  function reference(ops, display) {
    const f = DF.fold(ops, ctx), doc = f.doc, n = W * W, wk = doc.working + (doc.gamma === 'linear' ? '_linear' : ''), st = { W, order: f.st.order.slice(), L: {}, G: f.st.G, root: f.st.root, hasTree: f.st.hasTree };
    for (const id of st.order) { const l = f.st.L[id], sp = f.spaceOf[id], pix = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { const a = l.pix[i*4+3]; pix[i*4+3] = a; if (a > 0) { const w = CM.fromXyz01(wk, CM.toXyz01(sp, [0, 1, 2].map((k) => l.pix[i*4+k] / a))); for (let k = 0; k < 3; k++) pix[i*4+k] = F(w[k] * a); } }
      st.L[id] = { ...l, pix }; }
    const { C, A } = O.spec64tree(st), res = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { const d = CM.fromXyz01(display, CM.toXyz01(wk, [C[i*3], C[i*3+1], C[i*3+2]])); for (let k = 0; k < 3; k++) res[i*4+k] = Math.floor(d[k] * 255 + 0.5); res[i*4+3] = Math.floor(A[i] * 255 + 0.5); }
    return res;
  }
  const d8 = (a, b) => { let mx = 0, sum = 0; for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(a[i+k] - b[i+k]); mx = Math.max(mx, d); sum += d; } return { max: mx, mean: sum / (a.length * 0.75) }; };
  const jobs = []; for (const seed of [1, 2, 3]) for (const working of ['srgb', 'p3', 'adobe']) jobs.push({ key: `s${seed}_${working}_encoded`, ops: groupScene(seed, working, 'encoded', ['srgb', 'p3', 'adobe']) });
  jobs.push({ key: 's1_p3_linear', ops: groupScene(1, 'p3', 'linear', ['srgb', 'p3', 'adobe']) });
  const schemaErrs = jobs.map((j) => Sch.validate(j.ops, ctx.blobs).length).reduce((a, b) => a + b, 0); chk('SCH0', 'scene documents validate under schema v2 (errors)', schemaErrs, '==', 0);
  for (const j of jobs) { const f = DF.fold(j.ops, ctx), back = DF.composite(f, ctx);
    chk('H23x', `${j.key}: has tree (non-vacuous)`, f.st.hasTree, '==', true);
    for (const disp of ['working', 'srgb']) { const display = disp === 'working' ? j.ops[0].working + (j.ops[0].gamma === 'linear' ? '' : '') : 'srgb'; const out = DF.render(back, f, display, ctx), ref = reference(j.ops, display), d = d8(out, ref);
      chk('H20', `${j.key} canonical+lcms vs float64 tree reference on ${display} display (max levels)`, d.max, '<=', disp === 'working' ? 1 : 2); chk('H20m', `${j.key} ${display} mean levels`, +d.mean.toFixed(4), '<=', 0.05);
      if (disp === 'srgb') hashes['render_' + j.key] = S.sha256(out); }
    hashes['f32_' + j.key] = S.hashF32(back); }
  // H26 mutations: the reference must notice a broken compositor
  { const j = jobs[0], disp = j.ops[0].working, ref = reference(j.ops, disp), mk = (fn) => { const f = DF.fold(j.ops, ctx); fn(f.st); return d8(DF.render(DF.composite(f, ctx), f, disp, ctx), ref).max; };
    chk('H26a', 'mutation: pass-through groups treated as isolated normal -> levels from reference', mk((st) => { for (const g of Object.values(st.G)) if (g.mode === 'pass-through') g.mode = 'normal'; }), '>=', 4);
    chk('H26b', 'mutation: clip flags dropped -> levels from reference', mk((st) => { for (const l of Object.values(st.L)) l.clip = false; }), '>=', 4);
    chk('H26c', 'mutation: group opacity ignored -> levels from reference', mk((st) => { for (const g of Object.values(st.G)) g.opacity = 1; }), '>=', 4);
    chk('H26d', 'unmutated control on the same document (levels)', mk(() => {}), '<=', 1); }
  // ---------- C. schema rejections (new constructs)
  const D2 = { op: 'doc', v: 2, w: 8, h: 8, working: 'srgb', gamma: 'encoded' }, ly = (id, x = {}) => ({ op: 'layer', id, mode: 'normal', opacity: 1, mask: false, space: 'srgb', ...x }), gr = (id, x = {}) => ({ op: 'group', id, mode: 'pass-through', opacity: 1, mask: false, ...x });
  const deep = [D2]; for (let i = 0; i < 17; i++) deep.push(gr(i, i ? { parent: i - 1 } : {}));
  const neg = { 'v1 document using a group': [{ ...D2, v: 1 }, gr(1)], 'v1 layer with parent': [{ ...D2, v: 1 }, ly(0, { parent: 1 })], 'v1 layer with clip': [{ ...D2, v: 1 }, ly(0), ly(1, { clip: true })], 'clipped layer first in list': [D2, ly(0, { clip: true })],
    'clip base is a group': [D2, gr(1), ly(2, { clip: true })], 'clip with no base inside a group': [D2, ly(0), gr(1), ly(2, { parent: 1, clip: true })], 'unknown parent': [D2, ly(0, { parent: 9 })], 'parent is a layer, not a group': [D2, ly(0), ly(1, { parent: 0 })],
    'pass-through as a layer mode': [D2, ly(0, { mode: 'pass-through' })], 'nesting deeper than 16': deep, 'id shared between layer and group': [D2, ly(0), gr(0)], 'fill on a group': [D2, gr(1), { op: 'fill', layer: 1, c: [0, 0, 0], a: 1 }],
    'mask paint on a group without a mask': [D2, gr(1), { op: 'mdab', layer: 1, x: 1, y: 1, r: 2, v: 0, a: 1 }], 'group missing mode': [D2, (({ mode, ...r }) => r)(gr(1))], 'group with a layer space field': [D2, gr(1, { space: 'srgb' })], 'clip must be boolean': [D2, ly(0), ly(1, { clip: 1 })] };
  let rejected = 0; const accepted = []; for (const [name, ops] of Object.entries(neg)) { if (Sch.validate(ops, new Map()).length) rejected++; else accepted.push(name); }
  chk('SCH1', `invalid v2 logs rejected (of ${Object.keys(neg).length}); accepted: ${accepted.join(', ') || 'none'}`, rejected, '==', Object.keys(neg).length);
  const pos = [[D2, gr(1), ly(0, { parent: 1 }), ly(2, { parent: 1, clip: true }), ly(3, { parent: 1, clip: true }), gr(4, { parent: 1, mode: 'multiply' }), ly(5, { parent: 4 })]]; chk('SCH2', 'valid nested group + 2-layer clip chain accepted (errors)', pos.map((o) => Sch.validate(o, new Map()).length).reduce((a, b) => a + b, 0), '==', 0);
  let threw = false; try { const st = S.fold([ly(0, { clip: true }), ly(1)].map((o) => o), W); S.composite(st); } catch (e) { threw = /no base layer/.test(e.message); } chk('SCH3', 'compositor throws on a clipped layer without a base instead of skipping it', threw, '==', true);
  // ---------- D. Node vs Chromium (canonical + lcms, wasm) on the group documents
  const { chromium } = require('playwright-core'), srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
  const br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), pg = await br.newPage(); pg.on('pageerror', (e) => fails.push('page error: ' + e.message)); const base = 'http://127.0.0.1:' + srv.address().port;
  await pg.goto(base + '/icc/blank.html'); for (const s of ['/icc/color_math.js', '/icc/icc_write.js', '/stack.js', '/doc/schema.js', '/doc/docfold.js']) await pg.addScriptTag({ url: base + s });
  const bh = await pg.evaluate(async (jobs) => { const L = await import('/node_modules/lcms-wasm/dist/lcms.js'), lcms = await L.instantiate(), out = {}; for (const j of jobs) { const ctx = { L, lcms, blobs: new Map() }, f = DocFold.fold(j.ops, ctx), back = DocFold.composite(f, ctx); out['f32_' + j.key] = Stack.hashF32(back); out['render_' + j.key] = Stack.sha256(DocFold.render(back, f, 'srgb', ctx)); } return out; }, jobs.map((j) => ({ key: j.key, ops: j.ops })));
  await br.close(); srv.close(); let same = 0, tot = 0; for (const k of Object.keys(bh)) { tot++; if (bh[k] === hashes[k]) same++; } chk('PAR1', 'Node vs Chromium: group documents with identical f32 hash and sRGB render hash', same, '==', tot);
  // ---------- E. PSD export / import of groups and clipping (H22, H24, H25)
  const q8 = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5))), EMIT = path.join(__dirname, '.emit_groups'); fs.mkdirSync(EMIT, { recursive: true });
  const desc = (st, ids) => ids.map((id) => st.G[id] ? `G:${st.G[id].mode}:${Math.round(st.G[id].opacity * 255)}${st.G[id].mask ? 'm' : ''}[${desc(st, st.G[id].children)}]` : `L:${st.L[id].mode}:${Math.round(st.L[id].opacity * 255)}${st.L[id].mask ? 'm' : ''}${st.L[id].clip ? 'c' : ''}`).join(',');
  const tree = (st, ids) => ids.map((id) => st.G[id] ? { kind: 'group', mode: st.G[id].mode, opacity: Math.round(st.G[id].opacity * 255), mask: !!st.G[id].mask, children: tree(st, st.G[id].children) } : { kind: 'layer', mode: st.L[id].mode, opacity: Math.round(st.L[id].opacity * 255), mask: !!st.L[id].mask, clip: !!st.L[id].clip });
  // float64 reference that applies the same 8-bit quantisation as a PSD (layers AND groups)
  function referenceQ(ops, display) {
    const f = DF.fold(ops, ctx), doc = f.doc, n = W * W, wk = doc.working, st = { W, order: f.st.order.slice(), L: {}, G: {}, root: f.st.root, hasTree: f.st.hasTree };
    for (const id of st.order) { const l = f.st.L[id], sp = f.spaceOf[id], pix = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { const a = l.pix[i*4+3], a8 = q8(a); pix[i*4+3] = F(a8 / 255); if (a > 0 && a8 > 0) { const w = CM.fromXyz01(wk, CM.toXyz01(sp, [0, 1, 2].map((k) => l.pix[i*4+k] / a))); for (let k = 0; k < 3; k++) pix[i*4+k] = F(F(q8(w[k]) / 255) * pix[i*4+3]); } }
      st.L[id] = { ...l, opacity: F(Math.round(l.opacity * 255) / 255), mask: l.mask ? Float32Array.from(l.mask, (m) => F(q8(m) / 255)) : null, pix }; }
    for (const [id, g] of Object.entries(f.st.G)) st.G[id] = { ...g, opacity: F(Math.round(g.opacity * 255) / 255), mask: g.mask ? Float32Array.from(g.mask, (m) => F(q8(m) / 255)) : null };
    const { C, A } = O.spec64tree(st), res = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { const d = CM.fromXyz01(display, CM.toXyz01(wk, [C[i*3], C[i*3+1], C[i*3+2]])); for (let k = 0; k < 3; k++) res[i*4+k] = Math.floor(d[k] * 255 + 0.5); res[i*4+3] = q8(A[i]); }
    return res;
  }
  const expectG = {}; let psdSeen = 0;
  for (const j of jobs.filter((x) => /_(srgb|p3)_encoded$/.test(x.key) && /^s[12]_/.test(x.key))) {
    const f0 = DF.fold(j.ops, ctx), ex = exportPsd(j.ops, { ...ctx, _profiles: undefined }), imp = importPsd(ex.bytes), all = new Map([...ctx.blobs, ...imp.blobs]), c2 = { L, lcms, blobs: all }, f1 = DF.fold(imp.ops, c2), wk = j.ops[0].working;
    psdSeen++; chk('H22a', `${j.key}: tree preserved by export+import (nesting, modes incl. pass-through, clip, mask flags, opacity bytes)`, desc(f1.st, f1.st.root) === desc(f0.st, f0.st.root), '==', true);
    chk('H22a2', `${j.key}: imported doc is schema v2 and validates (errors)`, imp.ops[0].v === 2 ? Sch.validate(imp.ops, all).length : 999, '==', 0);
    const back = DF.render(DF.composite(f1, c2), f1, wk, c2), ref = referenceQ(j.ops, wk), d = d8(back, ref);
    chk('H22b', `${j.key}: export+import render vs quantised float64 tree reference, ${wk} display (max levels)`, d.max, '<=', 1); chk('H22bm', `${j.key}: mean levels`, +d.mean.toFixed(4), '<=', 0.01);
    const ex2 = exportPsd(imp.ops, c2), imp2 = importPsd(ex2.bytes); chk('H22c', `${j.key}: export->import->export->import is a fixed point (ops identical)`, JSON.stringify(imp2.ops) === JSON.stringify(imp.ops), '==', true);
    fs.writeFileSync(path.join(EMIT, j.key + '.psd'), ex.bytes); fs.writeFileSync(path.join(EMIT, j.key + '.work.rgba8'), ex.merged); expectG[j.key] = { tree: tree(f0.st, f0.st.root), W };
    hashes['psd_' + j.key] = S.sha256(ex.bytes);
  }
  fs.writeFileSync(path.join(EMIT, 'expect.json'), JSON.stringify(expectG)); chk('H22n', 'PSD documents exercised', psdSeen, '>=', 4);
  { const bad = (b, off, v) => { const c = b.slice(); c[off] = v; return c; }; let ok = false; const ex = exportPsd(jobs[0].ops, { ...ctx, _profiles: undefined }); try { importPsd(bad(ex.bytes, 24, 0)); importPsd(bad(ex.bytes, 25, 4)); } catch (e) { ok = /colour mode/.test(e.message); } chk('H22d', 'unsupported PSD (CMYK mode) still rejected after the group refactor', ok, '==', true); }
  let ind; try { ind = JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'check_groups.py'), EMIT], { encoding: 'utf8' })); } catch (e) { ind = { error: String(e.stdout || e.message).slice(0, 600), checks: [] }; fails.push('psd-tools check failed to run: ' + ind.error); }
  for (const c of ind.checks || []) chk(c.id, c.name, c.value, c.cmp, c.limit);
  // ---------- E. golden
  if (update) fs.writeFileSync(GOLD, JSON.stringify(hashes, null, 1) + '\n'); else { const want = JSON.parse(fs.readFileSync(GOLD, 'utf8')); let ch = 0; for (const k of Object.keys(want)) if (hashes[k] !== want[k]) ch++; chk('GOLD', 'golden hashes changed', ch, '==', 0); }
  console.log(JSON.stringify({ checks: rec, n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
