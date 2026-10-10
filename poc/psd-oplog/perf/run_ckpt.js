// Usage: node perf/run_ckpt.js   Checkpoints as tile blobs with dedup: C1-C6 (pre-registered in witness_log/HYPOTHESES.md before this file existed).
const fs = require('fs'), path = require('path'), zlib = require('zlib'), initSqlJs = require('sql.js'), S = require('../stack.js'), TS = require('../tiles/tilestore.js');
const rec = [], fails = [], num = {};
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); };
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r4 = (x) => Math.round(x * 1e4) / 1e4;
const now = () => Number(process.hrtime.bigint()) / 1e6, MODES = ['normal', 'multiply', 'screen'];
const heads = () => [0, 1, 2, 3].map((i) => ({ op: 'layer', id: i, mode: i === 0 ? 'normal' : MODES[i % 3], opacity: 0.9, mask: false }));
function ops(n, W, seed, box) { const rnd = rng(seed), o = [...heads(), { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }]; const [bx, by, bs] = box || [0, 0, W];
  for (let i = 0; i < n; i++) o.push({ op: 'dab', layer: i % 4, x: r4(bx + rnd() * bs), y: r4(by + rnd() * bs), r: r4(6 + rnd() * 34), c: [r4(rnd()), r4(rnd()), r4(rnd())], a: r4(0.2 + rnd() * 0.7) }); return o; }
const fold = (W, o) => { const st = S.newState(W); for (const x of o) S.apply(st, x); return st; };
const layerBytes = (l) => new Uint8Array(l.pix.buffer, l.pix.byteOffset, l.pix.byteLength);
const layerHashes = (st) => Object.keys(st.L).map((k) => S.hashF32(st.L[k].pix).slice(0, 16));
const sha = S.sha256;
function store(SQL, W, bytes, shaFn) { return TS.open(SQL, { tile: 64, bytes, sha: shaFn }); }
const nativeSha = (d) => require('crypto').createHash('sha256').update(d).digest('hex');
function checkpoint(ts, st, W) { const ids = {}; let added = 0, total = 0; for (const k of Object.keys(st.L)) { const r = ts.putBlob(layerBytes(st.L[k]), W, W, 16); ids[k] = r.id; added += r.newTiles; total += r.totalTiles; } return { ids, added, total }; }
function load(ts, ids, W) { const o = {}; for (const k of Object.keys(ids)) { const b = ts.getBlob(ids[k]); o[k] = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); } return o; }
function resume(W, headOps, cp, tail) { const st = S.newState(W); for (const x of headOps) S.apply(st, x); for (const k of Object.keys(cp)) st.L[k].pix.set(cp[k]); for (const x of tail) S.apply(st, x); return st; }

(async () => {
  const SQL = await initSqlJs(), W = 1024, TILE_BYTES = 64 * 64 * 16, LOGICAL = 4 * W * W * 16;
  // ---- C1, C2, C4, C6: uniform worst case
  const U = ops(40000, W, 7), head = U.slice(0, 5), CUT = 5 + 30000;
  let a = now(); const full = fold(W, U); const tFull = now() - a, hFull = S.hashF32(S.composite(full));
  const mid = fold(W, U.slice(0, CUT)), ts = store(SQL, W);
  a = now(); const cpA = checkpoint(ts, mid, W); const tPutA = now() - a;
  const st2 = fold(W, U.slice(0, 5 + 40000)); a = now(); const cpB = checkpoint(ts, st2, W); const tPutB = now() - a;
  const stats = ts.stats(); const dbBytes = ts.exportDb();
  num.uniform = { full_ms: tFull, put_A_ms: tPutA, put_B_ms: tPutB, A: { added: cpA.added, total: cpA.total }, B: { added: cpB.added, total: cpB.total }, tile_bytes: stats.tileBytes, logical_per_ckpt: LOGICAL, sqlite_export_bytes: dbBytes.length };
  const ts2 = store(SQL, W, dbBytes);   // fresh reopen from the exported file
  a = now(); const cp = load(ts2, cpA.ids, W); const rs = resume(W, head, cp, U.slice(CUT)); const tRes = now() - a, hRes = S.hashF32(S.composite(rs));
  const eqLayers = layerHashes(mid).join() === layerHashes(resume(W, head, cp, [])).join();
  chk('C1', 'stored -> exported -> reopened -> reloaded checkpoint: all 4 layer f32 hashes equal the originals', eqLayers, '==', true);
  chk('C1', 'resume from the stored checkpoint + 10k tail: composite f32 hash equals the full 40k fold', hRes === hFull, '==', true);
  chk('C2', `uniform worst case: checkpoint B (10k dabs later) adds ${cpB.added}/${cpB.total} new tiles (${(100 * cpB.added / cpB.total).toFixed(1)}%)`, +(cpB.added / cpB.total).toFixed(3), '>=', 0.9);
  chk('C6', `resume via the store ${tRes.toFixed(0)} ms (load+verify+tail) vs full fold ${tFull.toFixed(0)} ms`, +(tRes / tFull).toFixed(3), '<=', 0.5);
  num.uniform.resume_ms = tRes; num.uniform.ratio = tRes / tFull;
  // C7: same scenario with a native sha256 injected into the tile store
  { const tsN = store(SQL, W, undefined, nativeSha); a = now(); const cpN = checkpoint(tsN, mid, W); const tPutN = now() - a, bytesN = tsN.exportDb(), ts3 = store(SQL, W, bytesN, nativeSha);
    a = now(); const cpl = load(ts3, cpN.ids, W); const rsN = resume(W, head, cpl, U.slice(CUT)); const tResN = now() - a, hN = S.hashF32(S.composite(rsN));
    chk('C7', 'native sha256 gives the same blob ids as the pure-JS sha256 (4 layers)', JSON.stringify(cpN.ids) === JSON.stringify(cpA.ids), '==', true);
    chk('C7', 'resume with the native-hash store: composite f32 hash equals the full fold', hN === hFull, '==', true);
    chk('C7', `resume with the native-hash store ${tResN.toFixed(0)} ms vs full fold ${tFull.toFixed(0)} ms (put ${tPutN.toFixed(0)} ms vs ${tPutA.toFixed(0)} ms pure JS)`, +(tResN / tFull).toFixed(3), '<=', 0.5);
    num.native = { put_ms: tPutN, resume_ms: tResN, ratio: tResN / tFull }; }
  // C4: zlib over the tiles of checkpoint A
  { let raw = 0, z = 0; const m = ts.meta(cpA.ids[0]); const ids = new Set(); for (const k of Object.keys(cpA.ids)) for (const t of ts.meta(cpA.ids[k]).ids) ids.add(t);
    for (const t of ids) { const d = ts.readTile(t, TILE_BYTES); raw += d.length; z += zlib.deflateSync(d, { level: 6 }).length; }
    num.zlib = { unique_tiles: ids.size, raw, zlib: z, ratio: z / raw }; chk('C4', `zlib level 6 over the ${ids.size} unique tiles of checkpoint A: ${(raw / 1e6).toFixed(1)} -> ${(z / 1e6).toFixed(1)} MB`, +(z / raw).toFixed(3), '>=', 0.5); }

  // ---- C3: localized session
  { const L = ops(10000, W, 9, [384, 384, 256]), headL = L.slice(0, 5), tsL = store(SQL, W), adds = []; const st = S.newState(W); for (const x of headL) S.apply(st, x);
    for (let c = 0; c < 10; c++) { for (let i = 0; i < 1000; i++) S.apply(st, L[5 + c * 1000 + i]); adds.push(checkpoint(tsL, st, W)); }
    const addBytes = adds.map((x) => x.added * TILE_BYTES), stL = tsL.stats(), maxLater = Math.max(...addBytes.slice(1));
    num.local = { added_tiles: adds.map((x) => x.added), tile_bytes_total: stL.tileBytes, logical_total: 10 * LOGICAL };
    chk('C3', `localized: later checkpoints add at most ${(maxLater / 1e6).toFixed(2)} MB of tiles (logical checkpoint ${(LOGICAL / 1e6).toFixed(1)} MB; tiles per checkpoint ${adds.map((x) => x.added).join('/')})`, +(maxLater / LOGICAL).toFixed(4), '<=', 0.1);
    chk('C3', `localized: 10 checkpoints stored in ${(stL.tileBytes / 1e6).toFixed(1)} MB vs ${(10 * LOGICAL / 1e6).toFixed(0)} MB logical`, +(stL.tileBytes / (10 * LOGICAL)).toFixed(4), '<=', 0.25); }

  // ---- C5: corruption at small size (W=256), 20 random single-byte flips
  { const W5 = 256, O = ops(3000, W5, 3), st = fold(W5, O), t0 = store(SQL, W5), cp5 = checkpoint(t0, st, W5), bytes = t0.exportDb(), rnd = rng(77); let detected = 0, silent = 0;
    const all = (() => { const r = []; const q = t0.db.prepare('SELECT id FROM tiles'); while (q.step()) r.push(q.getAsObject().id); q.free(); return r; })();
    for (let f = 0; f < 20; f++) { const t = store(SQL, W5, bytes), tid = all[(rnd() * all.length) | 0], q = t.db.prepare('SELECT data FROM tiles WHERE id=?'); q.bind([tid]); q.step(); const d = new Uint8Array(q.getAsObject().data); q.free(); d[(rnd() * d.length) | 0] ^= 1 << ((rnd() * 8) | 0); t.db.run('UPDATE tiles SET data=? WHERE id=?', [d, tid]);
      try { load(t, cp5.ids, W5); silent++; } catch (e) { detected++; } }
    chk('C5', `20 random single-bit corruptions of stored tiles: detected ${detected}, silently loaded ${silent}`, silent, '==', 0); chk('C5', 'all 20 flips detected (each flipped tile belongs to some layer blob of the checkpoint)', detected, '==', 20); }

  const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, numbers: num, checks: rec, node: process.version, cpus: require('os').cpus()[0].model };
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'ckpt.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
