// Usage: node filters/run_blur.js   Gaussian blur op vs scipy etc.: B1-B8 (pre-registered in witness_log/HYPOTHESES.md before this file existed). Needs python3 with scipy (PYTHON env, default python3) and system Chrome (CHROMIUM env).
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process'), S = require('../stack.js'), B = require('./blur.js'), { makeDirty } = require('../perf/dirty.js');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const rec = [], fails = [], num = {};
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); };
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r4 = (x) => Math.round(x * 1e4) / 1e4;
const now = () => Number(process.hrtime.bigint()) / 1e6, med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const dab = (rnd, W, layer, rmin, rmax) => ({ op: 'dab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4(rmin + rnd() * (rmax - rmin)), c: [r4(rnd()), r4(rnd()), r4(rnd())], a: r4(0.2 + rnd() * 0.7) });
function layerOf(W, n, seed) { const rnd = rng(seed), st = S.newState(W); S.apply(st, { op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false }); for (let i = 0; i < n; i++) S.apply(st, dab(rnd, W, 0, 3, Math.max(4, W * 0.2))); return st.L[0].pix; }
const f32bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength), eq = (a, b) => Buffer.compare(f32bytes(a), f32bytes(b)) === 0;
const stats = (a, ref, rect, W) => { let max = 0, sum = 0, n = 0; const [rx, ry, rw, rh] = rect || [0, 0, W, W]; for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) for (let c = 0; c < 4; c++) { const i = (y * W + x) * 4 + c, d = Math.abs(a[i] - ref[i]); if (d > max) max = d; sum += d; n++; } return { max, mean: sum / n }; };
const blurred = (pix, W, sigma, rect, opts) => { const c = new Float32Array(pix); B.blurLayer(c, W, sigma, rect, opts); return c; };

// ---- scipy references (one python call for every case)
const cases = [], L256 = layerOf(256, 120, 5), L64 = layerOf(64, 40, 6), L1 = new Float32Array([0.3, 0.2, 0.1, 0.6]);
for (const s of [0.3, 0.8, 2, 5, 12]) cases.push({ name: `b1_s${s}`, W: 256, pix: L256, sigma: s });
cases.push({ name: 'b2_big_radius', W: 64, pix: L64, sigma: 20 }, { name: 'b2_corner_rect', W: 64, pix: L64, sigma: 3, rect: [0, 0, 40, 40] }, { name: 'b2_1x1', W: 1, pix: L1, sigma: 2 });
for (const c of cases) { c.input = path.join(OUT, c.name + '.in.f32'); c.out = path.join(OUT, c.name + '.ref.f64'); fs.writeFileSync(c.input, f32bytes(c.pix)); }
fs.writeFileSync(path.join(OUT, 'spec.json'), JSON.stringify(cases.map(({ name, W, input, sigma, out }) => ({ name, W, input, sigma, out }))));
const py = spawnSync(process.env.PYTHON || 'python3', ['-I', path.join(__dirname, 'check_blur_scipy.py'), path.join(OUT, 'spec.json')], { encoding: 'utf8' });
if (py.status !== 0) { console.error(py.stderr); process.exit(2); }
num.reference = JSON.parse(py.stdout.trim().split('\n').pop());
const refOf = (c) => { const b = fs.readFileSync(c.out); return new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8); };

(async () => {
  // ---- B1, B2
  const B1 = {}, MAXL = 5e-6, MEANL = 5e-7;
  for (const c of cases) { const ref = refOf(c), got = blurred(c.pix, c.W, c.sigma, c.rect), st = stats(got, ref, c.rect, c.W); c.got = got; c.stat = st; B1[c.name] = st;
    chk(c.name.startsWith('b1') ? 'B1' : 'B2', `${c.name}: max |ours - scipy| = ${st.max.toExponential(2)}, mean ${st.mean.toExponential(2)}`, st.max <= MAXL && st.mean <= MEANL, '==', true); }
  num.B1B2 = B1;
  // B2 corner rect: outside the rect must equal the input exactly
  { const c = cases.find((x) => x.name === 'b2_corner_rect'); let bad = 0; for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (x >= 40 || y >= 40) for (let k = 0; k < 4; k++) if (c.got[(y * 64 + x) * 4 + k] !== c.pix[(y * 64 + x) * 4 + k]) bad++; chk('B2', 'corner rect: pixels outside the rect untouched', bad, '==', 0); }

  // ---- B3 Chromium vs Node
  { const { chromium } = require('playwright-core'), br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), pg = await br.newPage(); await pg.goto('about:blank');
    await pg.addScriptTag({ path: path.join(__dirname, '..', 'stack.js') }); await pg.addScriptTag({ path: path.join(__dirname, 'blur.js') });
    const list = cases.map((c) => ({ name: c.name, W: c.W, sigma: c.sigma, rect: c.rect, b64: f32bytes(c.pix).toString('base64') }));
    const res = await pg.evaluate((list) => list.map((c) => { const b = Uint8Array.from(atob(c.b64), (x) => x.charCodeAt(0)), a = new Float32Array(b.buffer); Blur.blurLayer(a, c.W, c.sigma, c.rect); return [c.name, Stack.hashF32(a)]; }), list); await br.close();
    let bad = 0; for (const [name, h] of res) { const c = cases.find((x) => x.name === name); if (S.hashF32(c.got) !== h) bad++; } num.B3 = { cases: res.length, mismatches: bad };
    chk('B3', `Node vs Chromium: f32 hash of every blurred layer (${res.length} cases)`, bad, '==', 0); }

  // ---- B4 log exactness + checkpoint across a blur op
  { const W = 256, rnd = rng(31), o = [{ op: 'doc', v: 1, w: W, h: W, working: 'srgb', gamma: 'encoded' }]; for (let i = 0; i < 3; i++) o.push({ op: 'layer', id: i, mode: ['normal', 'multiply', 'screen'][i], opacity: 0.9, mask: false });
    o.push({ op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }); for (let i = 0; i < 90; i++) o.push(dab(rnd, W, i % 3, 5, 40));
    const cut = o.length; o.push({ op: 'blur', layer: 1, sigma: 2 }); for (let i = 0; i < 30; i++) o.push(dab(rnd, W, i % 3, 5, 40));
    o.push({ op: 'blur', layer: 2, sigma: 4, rect: [40, 60, 120, 100] }); for (let i = 0; i < 30; i++) o.push(dab(rnd, W, i % 3, 5, 40)); o.push({ op: 'blur', layer: 0, sigma: 1.5 });
    const run = (ops) => { const st = S.newState(W); for (const x of ops.slice(1)) B.applyOp(st, x); return st; }, f1 = run(o), f2 = run(o), h1 = S.hashF32(S.composite(f1)), h2 = S.hashF32(S.composite(f2));
    const log = S.chain(o), ver = S.verifyChain(JSON.parse(JSON.stringify(log)));
    const mid = run(o.slice(0, cut)), st = S.newState(W); for (const x of o.slice(1, 5)) B.applyOp(st, x); for (const k of Object.keys(mid.L)) st.L[k].pix.set(mid.L[k].pix); for (const x of o.slice(cut)) B.applyOp(st, x);
    chk('B4', 'two folds of a log with dabs + 3 blur ops give the same composite hash', h1 === h2, '==', true); chk('B4', 'the hash chain of that log verifies', ver, '==', -1);
    chk('B4', 'checkpoint taken before the first blur + tail (blurs included) equals the full fold', S.hashF32(S.composite(st)) === h1, '==', true);
    const bytes = JSON.stringify(o.filter((x) => x.op === 'blur')).length; num.B4 = { ops: o.length, hash: h1.slice(0, 12), blur_op_bytes: bytes / 3 }; }

  // ---- B5 rect locality
  { const W = 256, full = blurred(L256, W, 2, null), rnd = rng(55); let outside = 0, inside = 0; const full5 = blurred(L256, W, 5, null);
    for (let t = 0; t < 6; t++) { const s = t % 2 ? 5 : 2, F2 = s === 5 ? full5 : full, rw = 20 + ((rnd() * 150) | 0), rh = 20 + ((rnd() * 150) | 0), rx = (rnd() * (W - rw)) | 0, ry = (rnd() * (W - rh)) | 0, g = blurred(L256, W, s, [rx, ry, rw, rh]);
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const inR = x >= rx && x < rx + rw && y >= ry && y < ry + rh; for (let k = 0; k < 4; k++) { const i = (y * W + x) * 4 + k; if (inR) { if (g[i] !== F2[i]) inside++; } else if (g[i] !== L256[i]) outside++; } } }
    chk('B5', '6 random rects: floats outside the rect differing from the input', outside, '==', 0); chk('B5', '6 random rects: floats inside the rect differing from the full-layer blur', inside, '==', 0); }

  // ---- B6 dirty-tile compositor with blur ops
  { const W = 512, rnd = rng(61), st = S.newState(W), M = ['normal', 'multiply', 'screen', 'overlay'];
    for (let i = 0; i < 4; i++) S.apply(st, { op: 'layer', id: i, mode: M[i], opacity: 0.85, mask: false }); S.apply(st, { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 });
    for (let l = 0; l < 4; l++) for (let k = 0; k < 8; k++) S.apply(st, dab(rnd, W, l, 20, 120));
    const D = makeDirty(st); D.full(); let mism = 0, outside = 0, prev = S.composite(st), tilesBlur = [];
    const seq = []; for (let i = 0; i < 20; i++) { if (i === 5) seq.push({ op: 'blur', layer: 1, sigma: 3, rect: [100, 150, 130, 90] }); else if (i === 11) seq.push({ op: 'blur', layer: 2, sigma: 2 }); else if (i === 16) seq.push({ op: 'blur', layer: 3, sigma: 4, rect: [330, 20, 150, 200] }); else seq.push(dab(rnd, W, (rnd() * 4) | 0, 10, 90)); }
    for (const o of seq) { B.applyOp(st, o); const tiles = D.tilesOf(o); if (o.op === 'blur') tilesBlur.push(tiles === null ? 'all' : tiles.length); D.after(o); const fullc = S.composite(st); if (!eq(D.back, fullc)) mism++;
      if (tiles !== null) { const set = new Set(tiles); for (let i = 0; i < fullc.length; i += 4) if (fullc[i] !== prev[i] || fullc[i+1] !== prev[i+1] || fullc[i+2] !== prev[i+2] || fullc[i+3] !== prev[i+3]) { const p = i >> 2, t = (((p / W) | 0) >> 6) * D.tn + ((p % W) >> 6); if (!set.has(t)) { outside++; break; } } } prev = fullc; }
    num.B6 = { ops: seq.length, blur_tiles: tilesBlur }; chk('B6', `dirty-tile backdrop equals the full composite after each of ${seq.length} ops incl. 3 blurs (dirty tiles of the blurs: ${tilesBlur.join('/')})`, mism, '==', 0); chk('B6', 'no pixel changes outside the reported tiles', outside, '==', 0); }

  // ---- B7 speed
  { const W = 2048, pix = layerOf(W, 60, 8); let a = now(); const g = new Float32Array(pix); B.blurLayer(g, W, 5); const tFull = now() - a, tR = []; for (let i = 0; i < 5; i++) { const c = new Float32Array(pix.subarray(0, 0)); a = now(); B.blurLayer(pix, W, 5, [700 + i * 10, 800, 256, 256]); tR.push(now() - a); }
    num.B7 = { full_2048_sigma5_ms: tFull, rect256_sigma5_ms_median: med(tR) }; chk('B7', `full-layer blur 2048^2 sigma 5: ${tFull.toFixed(0)} ms (prediction: not interactive, > 1000 ms)`, tFull > 1000, '==', true); chk('B7', `256x256 rect blur sigma 5 on the 2048^2 layer: ${med(tR).toFixed(1)} ms median`, +med(tR).toFixed(1), '<=', 100); }

  // ---- B8 negative controls (compare with the same scipy references)
  { const c1 = cases.find((x) => x.name === 'b1_s5'), c2 = cases.find((x) => x.name === 'b2_big_radius'), r1 = refOf(c1), r2 = refOf(c2);
    const bad = stats(blurred(c1.pix, c1.W, c1.sigma, null, { kernelMode: 'badexp' }), r1, null, c1.W), clamp = stats(blurred(c2.pix, c2.W, c2.sigma, null, { edge: 'clamp' }), r2, null, c2.W);
    num.B8 = { badexp_max: bad.max, clamp_max: clamp.max }; chk('B8', `kernel exponent off by 1% is detected (max ${bad.max.toExponential(2)} > ${MAXL})`, bad.max > MAXL, '==', true); chk('B8', `clamp instead of reflect is detected on the big-radius case (max ${clamp.max.toExponential(2)} > ${MAXL})`, clamp.max > MAXL, '==', true); }

  const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, numbers: num, checks: rec, node: process.version, cpus: require('os').cpus()[0].model };
  fs.writeFileSync(path.join(OUT, 'blur.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
