// Usage: node filters/run_brush.js   Hard brush / stroke / smudge: K1-K12 (pre-registered in witness_log/HYPOTHESES.md before this file existed). Needs system python3 (numpy, cairocffi) and system Chrome (CHROMIUM env).
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process'), S = require('../stack.js'), Br = require('./brush.js'), { makeDirty } = require('../perf/dirty.js');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const rec = [], fails = [], num = {}, F = Math.fround;
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); };
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r4 = (x) => Math.round(x * 1e4) / 1e4, r1 = (x) => Math.round(x * 10) / 10;
const now = () => Number(process.hrtime.bigint()) / 1e6, med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const f32b = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength), eqB = (a, b) => Buffer.compare(f32b(a), f32b(b)) === 0;
const softDab = (rnd, W, layer, rmin, rmax) => ({ op: 'dab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4(rmin + rnd() * (rmax - rmin)), c: [r4(rnd()), r4(rnd()), r4(rnd())], a: r4(0.2 + rnd() * 0.7) });
const newSt = (W, nl = 1) => { const st = S.newState(W); for (let i = 0; i < nl; i++) S.apply(st, { op: 'layer', id: i, mode: i === 0 ? 'normal' : ['multiply', 'screen', 'overlay'][i % 3], opacity: 0.9, mask: false }); return st; };
const contentLayer = (W, n, seed) => { const rnd = rng(seed), st = newSt(W); for (let i = 0; i < n; i++) S.apply(st, softDab(rnd, W, 0, 3, W * 0.15)); return st.L[0].pix; };
const withPix = (W, pix) => { const st = newSt(W); st.L[0].pix.set(pix); return st; };
const run = (W, pix, ops, defect) => { const st = pix ? withPix(W, pix) : newSt(W); for (const o of ops) Br.applyOp(st, o, defect); return st.L[0].pix; };

// ---- references (one python call)
const jobs = [], cairo = [];
const L128 = contentLayer(128, 60, 4);
const hd = (x, y, r, a, c = [0.9, 0.3, 0.2]) => ({ op: 'hdab', layer: 0, x, y, r, a, c });
const rnd0 = rng(2), fifty = []; for (let i = 0; i < 50; i++) fifty.push(hd(r4(rnd0() * 128), r4(rnd0() * 128), r4(3 + rnd0() * 27), r4(0.3 + rnd0() * 0.7), [r4(rnd0()), r4(rnd0()), r4(rnd0())]));
const SM = [[30, 40], [90, 60], [100, 100]];
const defs = [['k1_one', 128, L128, [hd(40.37, 51.62, 12.3, 0.8)]], ['k1_fifty', 128, L128, fifty], ['k7_s07', 128, L128, [{ op: 'smudge', layer: 0, pts: SM, r: 15, s: 0.7 }]], ['k7_s03', 128, L128, [{ op: 'smudge', layer: 0, pts: SM, r: 15, s: 0.3 }]],
  ['k4_stroke', 128, L128, [{ op: 'stroke', layer: 0, kind: 'hard', pts: [[20.5, 30], [100, 70.3], [60, 110]], r: 9, c: [0.2, 0.7, 0.4], a: 0.8 }]]];
defs.push(['k1b_one', 128, L128, defs[0][3], true], ['k1b_fifty', 128, L128, defs[1][3], true]);
for (const [name, W, pix, ops, f32in] of defs) { const input = path.join(OUT, name + '.in.f32'), out = path.join(OUT, name + '.ref.f64'); fs.writeFileSync(input, f32b(pix)); jobs.push({ name, W, input, ops, out, f32in }); }
for (const [r, x, y] of [[4, 20.3, 21.7], [9.5, 31.25, 30.6], [20.3, 32.4, 31.9]]) cairo.push({ name: `r${r}`, W: 64, x, y, r, out: path.join(OUT, `cairo_r${r}.f64`) });
fs.writeFileSync(path.join(OUT, 'spec.json'), JSON.stringify({ jobs, cairo }));
const py = spawnSync(process.env.PYTHON || 'python3', ['-I', path.join(__dirname, 'check_brush_ref.py'), path.join(OUT, 'spec.json')], { encoding: 'utf8' }); if (py.status !== 0) { console.error(py.stderr); process.exit(2); }
num.reference = JSON.parse(py.stdout.trim().split('\n').pop());
const ref = (name) => { const b = fs.readFileSync(path.join(OUT, name)); return new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8); };
const maxd = (a, r) => { let m = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - r[i]); if (d > m) m = d; } return m; };

(async () => {
  // ---- K1, K7, K4(ref) and K12 controls
  const got = {}; for (const j of jobs) got[j.name] = run(j.W, L128, j.ops);
  chk('K1', `hard dab vs numpy: one dab max ${maxd(got.k1_one, ref('k1_one.ref.f64')).toExponential(2)}`, maxd(got.k1_one, ref('k1_one.ref.f64')) <= 1e-6, '==', true);
  chk('K1', `hard dab vs numpy: 50 overlapping dabs max ${maxd(got.k1_fifty, ref('k1_fifty.ref.f64')).toExponential(2)}`, maxd(got.k1_fifty, ref('k1_fifty.ref.f64')) <= 1e-6, '==', true);
  chk('K1', `stroke (hard, bent, 3 vertices, expanded in both languages) vs numpy max ${maxd(got.k4_stroke, ref('k4_stroke.ref.f64')).toExponential(2)}`, maxd(got.k4_stroke, ref('k4_stroke.ref.f64')) <= 1e-6, '==', true);
  chk('K1b', `hard dab vs numpy with float32-rounded inputs: one dab max ${maxd(got.k1b_one, ref('k1b_one.ref.f64')).toExponential(2)}`, maxd(got.k1b_one, ref('k1b_one.ref.f64')) <= 1e-6, '==', true);
  chk('K1b', `hard dab vs numpy with float32-rounded inputs: 50 dabs max ${maxd(got.k1b_fifty, ref('k1b_fifty.ref.f64')).toExponential(2)}`, maxd(got.k1b_fifty, ref('k1b_fifty.ref.f64')) <= 1e-6, '==', true);
  chk('K7', `smudge s=0.7 vs numpy max ${maxd(got.k7_s07, ref('k7_s07.ref.f64')).toExponential(2)}`, maxd(got.k7_s07, ref('k7_s07.ref.f64')) <= 2e-6, '==', true);
  chk('K7', `smudge s=0.3 vs numpy max ${maxd(got.k7_s03, ref('k7_s03.ref.f64')).toExponential(2)}`, maxd(got.k7_s03, ref('k7_s03.ref.f64')) <= 2e-6, '==', true);
  { const bad1 = maxd(run(128, L128, defs[0][3], 'ramp'), ref('k1_one.ref.f64')), bad7 = maxd(run(128, L128, defs[2][3], 'nodecay'), ref('k7_s07.ref.f64'));
    num.K12 = { ramp_max: bad1, nodecay_max: bad7 }; chk('K12', `edge ramp off by 0.25 px is detected (max ${bad1.toExponential(2)} > 1e-6)`, bad1 > 1e-6, '==', true); chk('K12', `smudge without the P decay is detected (max ${bad7.toExponential(2)} > 2e-6)`, bad7 > 2e-6, '==', true); }
  // ---- K2 properties
  { const W = 64; let viol = 0; const lay = run(W, null, [{ op: 'hdab', layer: 0, x: 30.3, y: 31.7, r: 10.4, c: [0.25, 0.5, 0.75], a: 1 }]);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const d = F(Math.sqrt(F(F(F(x + 0.5) - F(30.3)) ** 2 + F(F(y + 0.5) - F(31.7)) ** 2))), p = lay.subarray((y * W + x) * 4, (y * W + x) * 4 + 4);
      if (d <= F(10.4) - 0.5 - 1e-4) { if (p[0] !== F(0.25) || p[1] !== F(0.5) || p[2] !== F(0.75) || p[3] !== 1) viol++; } else if (d >= F(10.4) + 0.5 + 1e-4) { if (p[0] || p[1] || p[2] || p[3]) viol++; } }
    chk('K2', 'interior holds exactly c (bitwise) with alpha 1; outside r+0.5 is bitwise 0 (a=1, r=10.4)', viol, '==', 0);
    const rnd = rng(9); let worst = 0; for (let t = 0; t < 20; t++) { const r = 5 + rnd() * 25, a = 0.4 + rnd() * 0.6, l2 = run(128, null, [{ op: 'hdab', layer: 0, x: 40 + rnd() * 48, y: 40 + rnd() * 48, r, c: [1, 1, 1], a }]); let m = 0; for (let i = 3; i < l2.length; i += 4) m += l2[i]; worst = Math.max(worst, Math.abs(m - Math.PI * r * r * a) / (Math.PI * r * r * a)); }
    chk('K2', `alpha mass vs pi r^2 a over 20 random dabs: worst error ${(worst * 100).toFixed(3)}%`, +(worst * 100).toFixed(3), '<=', 1); }
  // ---- K3 cairo
  { const rs = [4, 9.5, 20.3], centers = [[20.3, 21.7], [31.25, 30.6], [32.4, 31.9]], res = []; for (let i = 0; i < 3; i++) { const lay = run(64, null, [{ op: 'hdab', layer: 0, x: centers[i][0], y: centers[i][1], r: rs[i], c: [1, 1, 1], a: 1 }]), cr = ref(`cairo_r${rs[i]}.f64`); let mx = 0, sm = 0; for (let k = 0; k < 64 * 64; k++) { const d = Math.abs(lay[k * 4 + 3] - cr[k]); mx = Math.max(mx, d); sm += d; } res.push({ r: rs[i], max: mx, mean: sm / (64 * 64) }); }
    num.K3 = res; for (const x of res) chk('K3', `vs cairo exact circle coverage, r=${x.r}: max ${x.max.toFixed(3)}, mean ${x.mean.toFixed(5)}`, x.max <= 0.15 && x.mean <= 0.01, '==', true); }
  // ---- K4 stroke expansion
  { const W = 160, lay = run(W, null, [{ op: 'stroke', layer: 0, kind: 'hard', pts: [[20, 32], [120, 32]], r: 10, c: [1, 0, 0], a: 1 }]); let unc = 0; for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const xc = x + 0.5, yc = y + 0.5; if (Math.abs(yc - 32) <= 9 && xc >= 20 && xc <= 120 && lay[(y * W + x) * 4 + 3] !== 1) unc++; }
    const n1 = Br.positions([[20, 32], [120, 32]], 10, 0.25).length, bent = [[10, 10], [60, 40.5], [30, 90], [100, 100]]; let L = 0; for (let i = 0; i + 1 < bent.length; i++) L += Math.hypot(bent[i + 1][0] - bent[i][0], bent[i + 1][1] - bent[i][1]); const step = 2.5, n2 = Br.positions(bent, 10, 0.25).length;
    chk('K4', 'straight hard stroke: every pixel with |y-y0| <= r-1 inside the path is fully covered', unc, '==', 0); chk('K4', `straight stroke dab count ${n1} vs floor(100/2.5)+1 = 41 (+-1)`, Math.abs(n1 - 41) <= 1, '==', true); chk('K4', `bent 3-segment stroke dab count ${n2} vs floor(${L.toFixed(2)}/2.5)+1 = ${Math.floor(L / step) + 1} (+-1)`, Math.abs(n2 - (Math.floor(L / step) + 1)) <= 1, '==', true); }
  // ---- K5 log economy
  { const bez = (t) => { const u = 1 - t, P = [[50, 400], [200, 50], [350, 450], [550, 100]]; return [0, 1].map((k) => r1(u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k])); }, pts = Array.from({ length: 40 }, (_, i) => bez(i / 39));
    const op = { op: 'stroke', layer: 0, kind: 'hard', pts, r: 20, c: [0.2, 0.4, 0.8], a: 0.9 }, bytes = JSON.stringify(op).length, dabs = Br.expand(op).map((d) => ({ ...d, x: r4(d.x), y: r4(d.y) })), db = JSON.stringify(dabs).length;
    num.K5 = { stroke_bytes: bytes, dabs: dabs.length, dab_bytes: db, ratio: bytes / db }; chk('K5', `stroke op ${bytes} B vs ${dabs.length} expanded dabs ${db} B (ratio ${(bytes / db).toFixed(3)})`, +(bytes / db).toFixed(3), '<=', 0.1); }
  // ---- K8 smudge properties, K9 edge
  { const W = 128; const id = run(W, L128, [{ op: 'smudge', layer: 0, pts: SM, r: 15, s: 0 }]); chk('K8', 's = 0 is the identity (bitwise)', eqB(id, L128), '==', true);
    const U = new Float32Array(W * W * 4); for (let i = 0; i < W * W; i++) U.set([0.3, 0.2, 0.1, 0.6], i * 4); const u2 = run(W, U, [{ op: 'smudge', layer: 0, pts: SM, r: 15, s: 0.8 }]); let um = 0; for (let i = 0; i < U.length; i++) um = Math.max(um, Math.abs(u2[i] - U[i]));
    chk('K8', `uniform layer unchanged by a smudge (max change ${um.toExponential(2)})`, um <= 1e-6, '==', true);
    const lo = [0, 0, 0, 0], hi = [0, 0, 0, 0]; for (let i = 0; i < L128.length; i++) hi[i % 4] = Math.max(hi[i % 4], L128[i]); let rv = 0; const o2 = got.k7_s07; for (let i = 0; i < o2.length; i++) rv = Math.max(rv, o2[i] - hi[i % 4] - 1e-6, lo[i % 4] - o2[i] - 1e-6); chk('K8', 'every output channel within [min(0,in), max(in)] of the input channel (convexity)', rv <= 0, '==', true); }
  { const W = 256, E = new Float32Array(W * W * 4); for (let y = 0; y < W; y++) for (let x = 0; x < 128; x++) E.set([1, 0, 0, 1], (y * W + x) * 4);
    const o = run(W, E, [{ op: 'smudge', layer: 0, pts: [[68, 128], [228, 128]], r: 20, s: 0.9 }]), A = (x) => o[(128 * W + x) * 4 + 3], a1 = A(133), a2 = A(188); num.K9 = { alpha_edge_plus_0_25r: a1, alpha_edge_plus_3r: a2, alpha_edge_minus_1: A(127) };
    chk('K9', `smudge drags colour across the edge: alpha ${a1.toFixed(3)} at edge+0.25r (> 0.1) and ${a2.toFixed(3)} at edge+3r (< the first)`, a1 > 0.1 && a2 < a1, '==', true); }
  // ---- K6 log exactness (+ Chromium)
  { const W = 256, rnd = rng(31), ops = []; for (let i = 0; i < 3; i++) ops.push({ op: 'layer', id: i, mode: ['normal', 'multiply', 'screen'][i], opacity: 0.9, mask: false }); ops.push({ op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 });
    for (let i = 0; i < 40; i++) ops.push(softDab(rnd, W, i % 3, 5, 40)); const cut = ops.length;
    ops.push({ op: 'stroke', layer: 1, kind: 'hard', pts: [[30, 40.5], [120, 200.25], [220, 60]], r: 14, c: [0.9, 0.2, 0.1], a: 0.9 }, { op: 'smudge', layer: 1, pts: [[40, 50], [110, 190]], r: 12, s: 0.6 },
      { op: 'stroke', layer: 2, kind: 'soft', pts: [[200, 30], [60, 130]], r: 25, c: [0.1, 0.4, 0.9], a: 0.7, spacing: 0.2 }, { op: 'smudge', layer: 0, pts: [[100, 100], [180, 150], [140, 220]], r: 18, s: 0.8 }, { op: 'hdab', layer: 2, x: 128, y: 128, r: 30, c: [1, 1, 0], a: 0.5 });
    for (let i = 0; i < 20; i++) ops.push(softDab(rnd, W, i % 3, 5, 40));
    const fold = (o) => { const st = S.newState(W); for (const x of o) Br.applyOp(st, x); return st; }, f1 = fold(ops), f2 = fold(ops), h1 = S.hashF32(S.composite(f1)), h2 = S.hashF32(S.composite(f2));
    const mid = fold(ops.slice(0, cut)), st = S.newState(W); for (const x of ops.slice(0, 4)) Br.applyOp(st, x); for (const k of Object.keys(mid.L)) st.L[k].pix.set(mid.L[k].pix); for (const x of ops.slice(cut)) Br.applyOp(st, x);
    chk('K6', 'two folds of a log with strokes (hard, soft), smudges and an hdab give the same composite hash', h1 === h2, '==', true); chk('K6', 'the hash chain verifies', S.verifyChain(JSON.parse(JSON.stringify(S.chain(ops)))), '==', -1);
    chk('K6', 'checkpoint before the first stroke + tail equals the full fold', S.hashF32(S.composite(st)) === h1, '==', true);
    const layerHashes = Object.keys(f1.L).map((k) => S.hashF32(f1.L[k].pix));
    const { chromium } = require('playwright-core'), br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), pg = await br.newPage(); await pg.goto('about:blank');
    await pg.addScriptTag({ path: path.join(__dirname, '..', 'stack.js') }); await pg.addScriptTag({ path: path.join(__dirname, 'brush.js') });
    const ch = await pg.evaluate(({ ops, W }) => { const st = Stack.newState(W); for (const o of ops) Brush.applyOp(st, o); return Object.keys(st.L).map((k) => Stack.hashF32(st.L[k].pix)); }, { ops, W }); await br.close();
    chk('K6', 'Node == Chromium: f32 hash of every layer after the log', JSON.stringify(ch) === JSON.stringify(layerHashes), '==', true); num.K6 = { ops: ops.length, hash: h1.slice(0, 12) }; }
  // ---- K10 dirty tiles
  { const W = 512, rnd = rng(61), st = newSt(W, 4); S.apply(st, { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }); for (let l = 0; l < 4; l++) for (let k = 0; k < 8; k++) S.apply(st, softDab(rnd, W, l, 20, 120));
    const D = makeDirty(st); D.full(); let mism = 0, outside = 0, prev = S.composite(st); const seq = [
      { op: 'stroke', layer: 1, kind: 'hard', pts: [[60, 80], [200, 150.5], [180, 300]], r: 15, c: [0.9, 0.3, 0.1], a: 0.9 }, softDab(rnd, W, 2, 10, 60), { op: 'smudge', layer: 1, pts: [[70, 90], [190, 160], [175, 290]], r: 14, s: 0.7 }, { op: 'hdab', layer: 3, x: 400.5, y: 120.2, r: 33, c: [0.1, 0.7, 0.5], a: 0.8 },
      { op: 'stroke', layer: 2, kind: 'soft', pts: [[300, 400], [450, 380]], r: 30, c: [0.2, 0.2, 0.9], a: 0.6 }, softDab(rnd, W, 0, 10, 60), { op: 'smudge', layer: 0, pts: [[250, 250], [330, 320]], r: 22, s: 0.9 }, { op: 'stroke', layer: 3, kind: 'hard', pts: [[5, 500], [500, 505]], r: 8, c: [1, 1, 1], a: 1 }, softDab(rnd, W, 1, 10, 60),
      { op: 'stroke', layer: 1, kind: 'hard', pts: [[480, 20], [20, 25]], r: 5, c: [0, 0, 0], a: 1 }, { op: 'smudge', layer: 2, pts: [[10, 10], [60, 40]], r: 20, s: 0.5 }, { op: 'hdab', layer: 0, x: 256, y: 256, r: 60, c: [0.5, 0.2, 0.9], a: 0.4 }];
    for (const o of seq) { Br.applyOp(st, o); const tiles = D.tilesOf(o); D.after(o); const full = S.composite(st); if (!eqB(D.back, full)) mism++; const set = new Set(tiles || []);
      if (tiles) for (let i = 0; i < full.length; i += 4) if (full[i] !== prev[i] || full[i+1] !== prev[i+1] || full[i+2] !== prev[i+2] || full[i+3] !== prev[i+3]) { const p = i >> 2, t = (((p / W) | 0) >> 6) * D.tn + ((p % W) >> 6); if (!set.has(t)) { outside++; break; } } prev = full; }
    chk('K10', `dirty-tile backdrop == full composite after each of ${seq.length} brush/smudge ops`, mism, '==', 0); chk('K10', 'no pixel changes outside the reported tiles', outside, '==', 0); }
  // ---- K11 speed at 2048
  { const W = 2048, rnd = rng(81), st = newSt(W, 8); S.apply(st, { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }); for (let l = 0; l < 8; l++) for (let k = 0; k < 40; k++) S.apply(st, softDab(rnd, W, l, 20, 200));
    const D = makeDirty(st); D.full(); const walk = (len, n) => { const x = 100 + rnd() * 1500, y = 100 + rnd() * 1500, a = rnd() * 6.28, pts = []; for (let i = 0; i < n; i++) pts.push([r1(x + Math.cos(a) * len * i / (n - 1)), r1(y + Math.sin(a) * len * i / (n - 1))]); return pts; };
    const tH = [], tS = [], tE = [], tl = []; for (let i = 0; i < 20; i++) { const h = { op: 'stroke', layer: i % 8, kind: 'hard', pts: walk(495, 6), r: 20, c: [0.8, 0.4, 0.2], a: 0.9 }, sm = { op: 'smudge', layer: (i + 3) % 8, pts: walk(200, 4), r: 20, s: 0.7 };
      let a = now(); Br.applyOp(st, h); tH.push(now() - a); a = now(); Br.applyOp(st, sm); tS.push(now() - a); const h2 = { ...h, layer: (i + 1) % 8, pts: walk(495, 6) }; a = now(); Br.applyOp(st, h2); const nt = D.after(h2).length; tE.push(now() - a); tl.push(nt); }
    const nd = Br.expand({ op: 'stroke', layer: 0, kind: 'hard', pts: walk(495, 6), r: 20, c: [0, 0, 0], a: 1 }).length, ns = Br.positions(walk(200, 4), 20, 0.1).length;
    num.K11 = { hard_stroke_apply_ms: med(tH), smudge_apply_ms: med(tS), hard_edit_with_dirty_ms: med(tE), tiles_median: med(tl), dabs_per_stroke: nd, smudge_steps: ns };
    chk('K11', `hard stroke (${nd} dabs, r=20) apply median ${med(tH).toFixed(1)} ms`, +med(tH).toFixed(1), '<=', 30); chk('K11', `smudge (${ns} steps, r=20) apply median ${med(tS).toFixed(1)} ms`, +med(tS).toFixed(1), '<=', 100); chk('K11', `hard stroke incl. dirty composite of 8 layers, median ${med(tE).toFixed(1)} ms (${med(tl)} tiles)`, +med(tE).toFixed(1), '<=', 60); }
  const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, numbers: num, checks: rec, node: process.version, cpus: require('os').cpus()[0].model };
  fs.writeFileSync(path.join(OUT, 'brush.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
