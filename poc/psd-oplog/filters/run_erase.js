// Usage: node filters/run_erase.js   Eraser stroke: E1-E3 (pre-registered in witness_log/HYPOTHESES.md before this file existed). Needs the venv python with numpy (PYTHON env) and system Chrome (CHROMIUM env).
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process'), S = require('../stack.js'), Br = require('./brush.js'), { makeDirty } = require('../perf/dirty.js');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true }); const rec = [], fails = [], num = {}, F = Math.fround;
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); };
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r4 = (x) => Math.round(x * 1e4) / 1e4, r2 = (x) => Math.round(x * 100) / 100;
const f32b = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength), eqB = (a, b) => Buffer.compare(f32b(a), f32b(b)) === 0;
const softDab = (rnd, W, layer, rmin, rmax) => ({ op: 'dab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4(rmin + rnd() * (rmax - rmin)), c: [r4(rnd()), r4(rnd()), r4(rnd())], a: r4(0.2 + rnd() * 0.7) });
const newSt = (W, nl = 1) => { const st = S.newState(W); for (let i = 0; i < nl; i++) S.apply(st, { op: 'layer', id: i, mode: i === 0 ? 'normal' : ['multiply', 'screen', 'overlay'][i % 3], opacity: 0.9, mask: false }); return st; };
const content = (W, n, seed) => { const rnd = rng(seed), st = newSt(W); for (let i = 0; i < n; i++) S.apply(st, softDab(rnd, W, 0, 3, W * 0.15)); return st.L[0].pix; };
const run = (W, pix, ops) => { const st = newSt(W); if (pix) st.L[0].pix.set(pix); for (const o of ops) Br.applyOp(st, o); return st.L[0].pix; };
const L128 = content(128, 60, 4), ed = (x, y, r, a) => ({ op: 'edab', layer: 0, x, y, r, a, c: [0, 0, 0] }), rnd0 = rng(3), fifty = []; for (let i = 0; i < 50; i++) fifty.push(ed(r4(rnd0() * 128), r4(rnd0() * 128), r4(3 + rnd0() * 27), r4(0.3 + rnd0() * 0.7)));
const jobs = [['e1_one', [ed(40.37, 51.62, 12.3, 0.8)]], ['e1_fifty', fifty]].map(([name, ops]) => ({ name, W: 128, input: path.join(OUT, name + '.in.f32'), ops, out: path.join(OUT, name + '.ref.f64') }));
for (const j of jobs) fs.writeFileSync(j.input, f32b(L128)); fs.writeFileSync(path.join(OUT, 'spec_erase.json'), JSON.stringify({ jobs }));
const py = spawnSync(process.env.PYTHON || 'python3', ['-I', path.join(__dirname, 'check_brush_ref.py'), path.join(OUT, 'spec_erase.json')], { encoding: 'utf8' }); if (py.status !== 0) { console.error(py.stderr); process.exit(2); }
const ref = (n) => { const b = fs.readFileSync(path.join(OUT, n)); return new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8); }, maxd = (a, r) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - r[i])); return m; };
(async () => {
  const m1 = maxd(run(128, L128, jobs[0].ops), ref('e1_one.ref.f64')), m50 = maxd(run(128, L128, jobs[1].ops), ref('e1_fifty.ref.f64')); num.E1 = { one: m1, fifty: m50 };
  chk('E1', `erase dab vs numpy: one dab max ${m1.toExponential(2)} (limit 2e-6)`, m1 <= 2e-6, '==', true); chk('E1', `erase dab vs numpy: 50 dabs max ${m50.toExponential(2)} (limit 6e-6)`, m50 <= 6e-6, '==', true);
  { const W = 64; let viol = 0; const full = new Float32Array(W * W * 4).fill(0.7), lay = run(W, full, [ed(30.3, 31.7, 10.4, 1)]);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const d = F(Math.sqrt(F(F(F(x + 0.5) - F(30.3)) ** 2 + F(F(y + 0.5) - F(31.7)) ** 2))), p = lay.subarray((y * W + x) * 4, (y * W + x) * 4 + 4);
      if (d <= F(10.4) - 0.5 - 1e-4) { if (p[0] || p[1] || p[2] || p[3]) viol++; } else if (d >= F(10.4) + 0.5 + 1e-4) { if (p[0] !== F(0.7) || p[1] !== F(0.7) || p[2] !== F(0.7) || p[3] !== F(0.7)) viol++; } }
    chk('E2', 'a=1: interior is exactly 0 in all 4 channels, outside r+0.5 bitwise unchanged', viol, '==', 0);
    chk('E2', 'a=0 is the identity (bitwise)', eqB(run(128, L128, [ed(50, 50, 20, 0)]), L128), '==', true);
    const o = run(128, L128, fifty); let inc = 0; for (let i = 0; i < o.length; i++) if (o[i] > L128[i]) inc++; chk('E2', 'erasing never increases a channel', inc, '==', 0); }
  { const rnd = rng(11), W = 256; let bad = 0; for (let t = 0; t < 30; t++) { const n = 2 + ((rnd() * 30) | 0), pts = []; for (let i = 0; i < n; i++) pts.push([r2(rnd() * W), r2(rnd() * W)]);
      const o = { op: 'stroke', layer: 0, kind: 'erase', pts, r: 3 + rnd() * 30, c: [0, 0, 0], a: r4(0.3 + rnd() * 0.7) }, base = content(W, 40, 7 + t), a = run(W, base, [o]), b = newSt(W); b.L[0].pix.set(base);
      const sb = Br.StrokeBuilder(b, { ...o, pts: [] }); for (const p of pts) { sb.push(p[0], p[1]); if (rnd() < 0.3) sb.push(p[0], p[1]); } if (!eqB(a, b.L[0].pix)) bad++; }
    chk('E3', 'incremental erase builder == batch erase stroke (30 random strokes, duplicate events mixed in)', bad, '==', 0); }
  { const W = 256, rnd = rng(31), ops = []; for (let i = 0; i < 2; i++) ops.push({ op: 'layer', id: i, mode: i ? 'multiply' : 'normal', opacity: 0.9, mask: false }); ops.push({ op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }); for (let i = 0; i < 40; i++) ops.push(softDab(rnd, W, i % 2, 5, 40)); const cut = ops.length;
    ops.push({ op: 'stroke', layer: 0, kind: 'erase', pts: [[30, 40], [120, 200], [220, 60]], r: 16, c: [0, 0, 0], a: 1 }, { op: 'stroke', layer: 1, kind: 'erase', pts: [[200, 30], [60, 130]], r: 25, c: [0, 0, 0], a: 0.5 }); for (let i = 0; i < 10; i++) ops.push(softDab(rnd, W, i % 2, 5, 40));
    const fold = (o) => { const st = S.newState(W); for (const x of o) Br.applyOp(st, x); return st; }, f1 = fold(ops), f2 = fold(ops), h = S.hashF32(S.composite(f1));
    const mid = fold(ops.slice(0, cut)), st = S.newState(W); for (const x of ops.slice(0, 2)) Br.applyOp(st, x); for (const k of Object.keys(mid.L)) st.L[k].pix.set(mid.L[k].pix); for (const x of ops.slice(cut)) Br.applyOp(st, x);
    chk('E3', 'two folds of a log with erase strokes give the same hash', S.hashF32(S.composite(f2)) === h, '==', true); chk('E3', 'hash chain verifies', S.verifyChain(JSON.parse(JSON.stringify(S.chain(ops)))), '==', -1); chk('E3', 'checkpoint before the erase strokes + tail equals the full fold', S.hashF32(S.composite(st)) === h, '==', true);
    const lh = Object.keys(f1.L).map((k) => S.hashF32(f1.L[k].pix)), { chromium } = require('playwright-core'), br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), pg = await br.newPage(); await pg.goto('about:blank');
    await pg.addScriptTag({ path: path.join(__dirname, '..', 'stack.js') }); await pg.addScriptTag({ path: path.join(__dirname, 'brush.js') }); const ch = await pg.evaluate(({ ops, W }) => { const st = Stack.newState(W); for (const o of ops) Brush.applyOp(st, o); return Object.keys(st.L).map((k) => Stack.hashF32(st.L[k].pix)); }, { ops, W }); await br.close();
    chk('E3', 'Node == Chromium: layer hashes after the log', JSON.stringify(ch) === JSON.stringify(lh), '==', true); }
  { const W = 512, rnd = rng(61), st = newSt(W, 3); S.apply(st, { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }); for (let l = 0; l < 3; l++) for (let k = 0; k < 8; k++) S.apply(st, softDab(rnd, W, l, 20, 120));
    const D = makeDirty(st); D.full(); let mism = 0; for (const o of [{ op: 'stroke', layer: 1, kind: 'erase', pts: [[60, 80], [200, 150.5], [180, 300]], r: 20, c: [0, 0, 0], a: 1 }, { op: 'stroke', layer: 0, kind: 'erase', pts: [[300, 400], [450, 380]], r: 30, c: [0, 0, 0], a: 0.6 }, { op: 'stroke', layer: 2, kind: 'erase', pts: [[5, 500], [500, 505]], r: 9, c: [0, 0, 0], a: 1 }]) { Br.applyOp(st, o); D.after(o); if (!eqB(D.back, S.composite(st))) mism++; }
    chk('E3', 'dirty-tile compositor bit-identical after 3 erase strokes (one on the background layer)', mism, '==', 0); }
  const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, numbers: num, checks: rec, node: process.version };
  fs.writeFileSync(path.join(OUT, 'erase.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
