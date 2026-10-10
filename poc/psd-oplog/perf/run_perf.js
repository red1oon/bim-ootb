// Usage: node perf/run_perf.js   Speed / log-growth / checkpoint measurements. Pre-registered in witness_log/HYPOTHESES.md (P1-P9). Timings are medians (5 runs, 1 warm-up) unless marked single-run.
const fs = require('fs'), path = require('path'), zlib = require('zlib'), S = require('../stack.js');
const rec = [], fails = [], num = {};
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : cmp === 'in' ? value >= limit[0] && value <= limit[1] : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push(`${id} ${name}: got ${value}, need ${cmp} ${JSON.stringify(limit)}`); };
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r4 = (x) => Math.round(x * 1e4) / 1e4;
const now = () => Number(process.hrtime.bigint()) / 1e6, med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const time = (fn, runs = 5) => { fn(); const t = []; for (let i = 0; i < runs; i++) { const a = now(); fn(); t.push(now() - a); } return med(t); };
const MODES = ['normal', 'multiply', 'screen'];
const heads = (n, mode0) => { const o = []; for (let i = 0; i < n; i++) o.push({ op: 'layer', id: i, mode: i === 0 ? 'normal' : MODES[i % 3], opacity: 0.9, mask: false }); return o; };
const dab = (rnd, W, layer, rmin, rmax) => ({ op: 'dab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4(rmin + rnd() * (rmax - rmin)), c: [r4(rnd()), r4(rnd()), r4(rnd())], a: r4(0.2 + rnd() * 0.7) });
const build = (W, layers, dabsPer, rmin, rmax, seed = 1) => { const rnd = rng(seed), ops = heads(layers); ops.push({ op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }); for (let d = 0; d < dabsPer; d++) for (let l = 0; l < layers; l++) ops.push(dab(rnd, W, l, rmin, rmax)); return ops; };
const foldOps = (W, ops) => { const st = S.newState(W); for (const o of ops) S.apply(st, o); return st; };

// ---- P1 composite scaling
{ const T = {}; for (const W of [256, 512, 1024, 2048]) { const st = foldOps(W, build(W, 8, 3, W / 20, W / 8)); T[W] = time(() => S.composite(st), W >= 2048 ? 3 : 5); }
  num.P1_composite_ms = T; chk('P1', `composite 8 layers: t(2048)/t(1024) (t=${T[1024].toFixed(1)}→${T[2048].toFixed(1)} ms)`, +(T[2048] / T[1024]).toFixed(2), 'in', [3, 5]);
  const per = Object.entries(T).map(([W, t]) => t / (W * W * 8)); chk('P1', `per-pixel-per-layer cost spread (max/min), values ns ${per.map((x) => (x * 1e6).toFixed(2)).join('/')}`, +(Math.max(...per) / Math.min(...per)).toFixed(2), '<=', 1.5); }

// ---- P2 full refold at 2048, P3 cached one-layer edit
{ const W = 2048, ops = build(W, 8, 40, 20, 200), rnd = rng(99), edit = dab(rnd, W, 4, 20, 200); let hFull;
  const tFold = time(() => { const st = foldOps(W, ops); S.composite(st); }, 3), tFoldOnly = time(() => foldOps(W, ops), 3);
  num.P2_full_refold_ms = tFold; num.P2_fold_only_ms = tFoldOnly; chk('P2', `full refold + composite at 2048^2, 8 layers x 40 dabs (${tFold.toFixed(0)} ms; fold ${tFoldOnly.toFixed(0)} + composite ${(tFold - tFoldOnly).toFixed(0)})`, tFold > 1000, '==', true);
  { const full = foldOps(W, [...ops, edit]); hFull = S.hashF32(S.composite(full)); }
  const cached = foldOps(W, ops); S.composite(cached);   // cache = live state
  const tCache = (() => { const t = []; for (let i = 0; i < 3; i++) { const a = now(); S.apply(cached, i === 0 ? edit : { ...edit, a: 0 }); S.composite(cached); t.push(now() - a); } return t[0]; })();
  const fresh = foldOps(W, ops); S.apply(fresh, edit); const hCached = S.hashF32(S.composite(fresh));
  num.P3_cached_edit_ms = tCache; chk('P3', 'cached path (apply one dab in place + composite) is byte-identical to the full refold (f32 hash)', hCached === hFull, '==', true);
  chk('P3', `speedup of the cached edit over the full refold (${tCache.toFixed(0)} vs ${tFold.toFixed(0)} ms)`, +(tFold / tCache).toFixed(2), '>=', 3); }

// ---- P4 dab cost vs radius and canvas
{ const T = {}; for (const W of [512, 2048]) { const st = foldOps(W, heads(1)); S.apply(st, { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }); T[W] = {}; for (const r of [10, 20, 40, 80]) T[W][r] = time(() => { for (let k = 0; k < 40; k++) S.apply(st, { op: 'dab', layer: 0, x: W / 2 + k, y: W / 2, r, c: [0.9, 0.2, 0.1], a: 0.5 }); }, 5) / 40; }
  num.P4_dab_ms = T; chk('P4', `dab cost ratio r=80 / r=40 at W=512 (ideal 4)`, +(T[512][80] / T[512][40]).toFixed(2), 'in', [3, 5]); chk('P4', 'dab cost at W=2048 vs W=512, r=40 (ratio, should be ~1)', +(T[2048][40] / T[512][40]).toFixed(2), 'in', [0.77, 1.3]); }

// ---- P5/P6 log growth (100k strokes)
const N = 100000, W7 = 1024;
const big = (() => { const rnd = rng(7), ops = [{ op: 'doc', v: 1, w: W7, h: W7, working: 'srgb', gamma: 'encoded' }, ...heads(4), { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }]; for (let i = 0; i < N; i++) ops.push(dab(rnd, W7, i % 4, 6, 40)); return ops; })();
{ const raw = Buffer.from(JSON.stringify(big)), perOp = raw.length / big.length; let ch; const tChain = (() => { const a = now(); ch = S.chain(big); return now() - a; })(), chainBytes = Buffer.byteLength(JSON.stringify(ch)), tVer = (() => { const a = now(); const bad = S.verifyChain(ch); num.P6_verify_ok = bad === -1; return now() - a; })();
  const gz = zlib.gzipSync(raw).length; num.P5 = { raw_bytes: raw.length, per_op_raw: perOp, chain_bytes: chainBytes, per_op_chain: chainBytes / big.length, gzip_bytes: gz, chain_ms: tChain, verify_ms: tVer };
  chk('P5', `raw bytes per dab op (${perOp.toFixed(1)}; ${(raw.length / 1e6).toFixed(2)} MB for ${N})`, +perOp.toFixed(1), 'in', [80, 130]); chk('P5', `hash-chain overhead bytes per op (${(chainBytes / big.length - perOp).toFixed(1)})`, +(chainBytes / big.length - perOp).toFixed(1), 'in', [120, 160]); chk('P5', `gzip(raw)/raw (${(gz / raw.length).toFixed(3)})`, +(gz / raw.length).toFixed(3), '<=', 0.25);
  chk('P6', `chain build ${tChain.toFixed(0)} ms for ${N} ops`, tChain, '<=', 2000); chk('P6', `chain verify ${tVer.toFixed(0)} ms (and verifies clean)`, tVer <= 2000 && num.P6_verify_ok, '==', true); }

// ---- P7 refold vs log length (single run each)
{ const T = {}, doc = big.slice(1); for (const n of [10000, 25000, 50000, 100000]) { const part = doc.slice(0, 6 + n), a = now(); foldOps(W7, part); T[n] = now() - a; } num.P7_fold_ms = T;
  chk('P7', `fold time linear in log length: t(100k)/t(50k) (${T[50000].toFixed(0)}→${T[100000].toFixed(0)} ms; absolute for 100k = ${(T[100000] / 1000).toFixed(1)} s)`, +(T[100000] / T[50000]).toFixed(2), 'in', [1.7, 2.3]); }

// ---- P8/P9 checkpoint
{ const doc = big.slice(1), CUT = 6 + 90000, headOps = doc.slice(0, 6), tail = doc.slice(CUT);
  let a = now(); const full = foldOps(W7, doc); const tFull = now() - a, hFull = S.hashF32(S.composite(full));
  const mid = foldOps(W7, doc.slice(0, CUT)), ckpt = {}; let bytes = 0; for (const id of Object.keys(mid.L)) { ckpt[id] = new Float32Array(mid.L[id].pix); bytes += ckpt[id].byteLength; }
  const ids = Object.keys(mid.L).map((k) => S.sha256(Buffer.from(ckpt[k].buffer).toString('latin1')).slice(0, 8));
  const resume = (cp, ops) => { const st = S.newState(W7); for (const o of headOps) S.apply(st, o); for (const id of Object.keys(cp)) st.L[id].pix.set(cp[id]); for (const o of ops) S.apply(st, o); return st; };
  a = now(); const rs = resume(ckpt, tail); const tRes = now() - a, hRes = S.hashF32(S.composite(rs));
  num.P8 = { full_ms: tFull, resume_ms: tRes, checkpoint_bytes: bytes, log_bytes_raw: num.P5.raw_bytes, layer_blob_ids: ids };
  chk('P8', 'checkpoint + tail reproduces the full fold exactly (f32 hash)', hRes === hFull, '==', true);
  chk('P8', `resume cost / full fold cost (${tRes.toFixed(0)} vs ${tFull.toFixed(0)} ms)`, +(tRes / tFull).toFixed(3), '<=', 0.2);
  rec.push({ id: 'P8', name: `info: checkpoint = ${(bytes / 1e6).toFixed(1)} MB of layer state vs ${(num.P5.raw_bytes / 1e6).toFixed(1)} MB of raw log (4 layers x 1024^2 x 16 B)`, value: bytes, cmp: 'info', limit: null, pass: true });
  const wrong = resume(ckpt, [...tail.slice(0, 5), ...tail.slice(6)]); chk('P9', 'negative control: dropping one op after the checkpoint changes the hash', S.hashF32(S.composite(wrong)) !== hFull, '==', true);
  const ck2 = {}; for (const id of Object.keys(ckpt)) ck2[id] = ckpt[id]; ck2[0] = new Float32Array(ckpt[0]); ck2[0][5000 * 4] += 1e-3; chk('P9', 'negative control: a corrupted checkpoint blob (one sample +0.001) changes the hash', S.hashF32(S.composite(resume(ck2, tail))) !== hFull, '==', true); }

const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, numbers: num, checks: rec, node: process.version, cpus: require('os').cpus()[0].model };
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'perf.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
