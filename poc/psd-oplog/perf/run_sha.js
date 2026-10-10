// Usage: node perf/run_sha.js   Browser sha256 speed for tile checkpoints: S1-S6 (pre-registered in witness_log/HYPOTHESES.md before this file existed). Needs system Chrome (CHROMIUM env).
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), S = require('../stack.js'), FS = require('./fastsha.js');
const ROOT = path.join(__dirname, '..'), rec = [], fails = [], num = {};
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); };
(async () => {
  // ---- Node side of S2 (correctness vs S.sha256 and node crypto; speed)
  { let bad = 0, n = 0; const sizes = [0, 1, 2, 3, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 65536, 1 << 20]; for (let i = 0; i < 2000 - sizes.length; i++) sizes.push((crypto.randomInt(0, 301)));
    for (const s of sizes) { const b = crypto.randomBytes(s), a = FS.sha256(b); n++; if (a !== S.sha256(b) || a !== crypto.createHash('sha256').update(b).digest('hex')) bad++; }
    chk('S2', `Node: fast sha256 == S.sha256 == node crypto on ${n} inputs (incl. block-boundary sizes, 64 KB, 1 MB)`, bad, '==', 0);
    const big = crypto.randomBytes(16 << 20), t = (f) => { const a = process.hrtime.bigint(); f(); return Number(process.hrtime.bigint() - a) / 1e6; }; const tf = t(() => FS.sha256(big)), tp = t(() => S.sha256(big));
    num.node = { fast_MBps: 16 / (tf / 1000), pure_MBps: 16 / (tp / 1000) }; }
  // ---- Chromium
  const { chromium } = require('playwright-core'), srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), pg = await br.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.setDefaultTimeout(600000);
  await pg.goto(base + '/icc/blank.html'); for (const s of ['/node_modules/sql.js/dist/sql-wasm.js', '/stack.js', '/tiles/tilestore.js', '/perf/fastsha.js', '/perf/async_tiles.js']) await pg.addScriptTag({ url: base + s });
  const R = await pg.evaluate(async () => {
    const out = { secure: self.isSecureContext }, subtle = crypto.subtle, now = () => performance.now();
    const lcg = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, rnd = lcg(1);
    const fill = (u) => { for (let i = 0; i < u.length; i++) u[i] = (rnd() * 256) | 0; return u; };
    // correctness of S.sha256 / FastSha / subtle on 2000 inputs
    { const sizes = [0, 1, 2, 3, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 65536, 1 << 20]; while (sizes.length < 2000) sizes.push((rnd() * 301) | 0); let bad = 0, badSubtle = 0; for (const s of sizes) { const b = fill(new Uint8Array(s)), a = Stack.sha256(b), f = FastSha.sha256(b), w = await AsyncTiles.sha(subtle, b); if (a !== f) bad++; if (a !== w) badSubtle++; } out.cmp = { n: sizes.length, fastMismatch: bad, subtleMismatch: badSubtle }; }
    // speed: 512 x 64 KB and one 16 MB
    const tiles = []; const big = fill(new Uint8Array(32 << 20)); for (let i = 0; i < 512; i++) tiles.push(big.subarray(i * 65536, (i + 1) * 65536)); const one16 = big.subarray(0, 16 << 20);
    const T = async (f) => { const a = now(); await f(); return now() - a; };
    out.pure64k_ms = await T(() => { for (const t of tiles) Stack.sha256(t); }); out.fast64k_ms = await T(() => { for (const t of tiles) FastSha.sha256(t); }); out.pure16m_ms = await T(() => Stack.sha256(one16)); out.fast16m_ms = await T(() => FastSha.sha256(one16));
    const big2 = fill(new Uint8Array(64 << 20)); const t4096 = []; for (let i = 0; i < 1024; i++) t4096.push(big2.subarray(i * 65536, (i + 1) * 65536));   // 64 MB, 1024 tiles (4096 would need 256 MB)
    out.subtle_1024x64k_ms = await T(() => AsyncTiles.batched(subtle, t4096, 256)); out.subtle16m_ms = await T(() => AsyncTiles.sha(subtle, one16));
    return out; });
  num.chromium_speed = R; chk('S1', `Chromium: pure-JS sha256 ${(32 / (R.pure64k_ms / 1000)).toFixed(0)} MB/s on 64 KB inputs, ${(16 / (R.pure16m_ms / 1000)).toFixed(0)} MB/s on 16 MB (reported)`, true, '==', true);
  chk('S2', `Chromium: fast sha256 == S.sha256 on ${R.cmp.n} inputs`, R.cmp.fastMismatch, '==', 0); chk('S2', `Chromium: fast sha256 speedup on 512 x 64 KB = ${(R.pure64k_ms / R.fast64k_ms).toFixed(1)}x (${(32 / (R.fast64k_ms / 1000)).toFixed(0)} MB/s)`, +(R.pure64k_ms / R.fast64k_ms).toFixed(2), '>=', 2);
  chk('S3', `Chromium: WebCrypto == S.sha256 on ${R.cmp.n} inputs`, R.cmp.subtleMismatch, '==', 0); const subMBps = 64 / (R.subtle_1024x64k_ms / 1000), pureMBps = 32 / (R.pure64k_ms / 1000); chk('S3', `Chromium: WebCrypto batched ${subMBps.toFixed(0)} MB/s (${(subMBps / pureMBps).toFixed(1)}x pure JS; single 16 MB ${(16 / (R.subtle16m_ms / 1000)).toFixed(0)} MB/s)`, +(subMBps / pureMBps).toFixed(1), '>=', 10);
  // ---- S4, S5, S6 in the page
  const Rs = await pg.evaluate(async () => {
    const SQL = await initSqlJs({ locateFile: (f) => '/node_modules/sql.js/dist/' + f }), subtle = crypto.subtle, now = () => performance.now(), r4 = (x) => Math.round(x * 1e4) / 1e4, F = Math.fround;
    const lcg = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
    const MODES = ['normal', 'multiply', 'screen'], heads = () => [0, 1, 2, 3].map((i) => ({ op: 'layer', id: i, mode: i === 0 ? 'normal' : MODES[i % 3], opacity: 0.9, mask: false }));
    const ops = (n, W, seed) => { const r = lcg(seed), o = [...heads(), { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }]; for (let i = 0; i < n; i++) o.push({ op: 'dab', layer: i % 4, x: r4(r() * W), y: r4(r() * W), r: r4(6 + r() * 34), c: [r4(r()), r4(r()), r4(r())], a: r4(0.2 + r() * 0.7) }); return o; };
    const fold = (W, o) => { const st = Stack.newState(W); for (const x of o) Stack.apply(st, x); return st; }, lb = (l) => new Uint8Array(l.pix.buffer, l.pix.byteOffset, l.pix.byteLength);
    const out = {};
    // S4/S5 at 256^2
    { const W = 256, st = fold(W, ops(3000, W, 3)), A = TileStore.open(SQL, { tile: 64 }), B = TileStore.open(SQL, { tile: 64 }), ids = { a: {}, b: {} }; let equal = true;
      for (const k of Object.keys(st.L)) { const ra = await AsyncTiles.putBlobAsync(A, subtle, lb(st.L[k]), W, W, 16), rb = B.putBlob(lb(st.L[k]), W, W, 16); ids.a[k] = ra.id; ids.b[k] = rb.id; if (ra.id !== rb.id || JSON.stringify(A.meta(ra.id).ids) !== JSON.stringify(B.meta(rb.id).ids)) equal = false; }
      const bytes = A.exportDb(); const C = TileStore.open(SQL, { tile: 64, bytes }); let readOk = true; for (const k of Object.keys(st.L)) { const g = C.getBlob(ids.a[k]); if (g.length !== lb(st.L[k]).length || Stack.sha256(g) !== ids.a[k]) readOk = false; }
      out.S4 = { idsEqual: equal, syncReadsAsyncDb: readOk };
      const lr = lcg(77); let detected = 0, silent = 0; const tids = []; { const q = A.db.prepare('SELECT id FROM tiles'); while (q.step()) tids.push(q.getAsObject().id); q.free(); }
      for (let f = 0; f < 20; f++) { const T2 = TileStore.open(SQL, { tile: 64, bytes }), tid = tids[(lr() * tids.length) | 0], q = T2.db.prepare('SELECT data FROM tiles WHERE id=?'); q.bind([tid]); q.step(); const d = new Uint8Array(q.getAsObject().data); q.free(); d[(lr() * d.length) | 0] ^= 1 << ((lr() * 8) | 0); T2.db.run('UPDATE tiles SET data=? WHERE id=?', [d, tid]);
        try { for (const k of Object.keys(ids.a)) await AsyncTiles.getBlobAsync(T2, subtle, ids.a[k]); silent++; } catch (e) { detected++; } }
      out.S5 = { detected, silent }; }
    // S6 at 1024^2
    { const W = 1024, U = ops(40000, W, 7), head = U.slice(0, 5), CUT = 5 + 30000; let a = now(); const full = fold(W, U); const tFull = now() - a, hFull = Stack.hashF32(Stack.composite(full)), mid = fold(W, U.slice(0, CUT));
      const resume = (cp, tail) => { const st = Stack.newState(W); for (const x of head) Stack.apply(st, x); for (const k of Object.keys(cp)) st.L[k].pix.set(cp[k]); for (const x of tail) Stack.apply(st, x); return st; };
      const tail = U.slice(CUT), asF32 = (b) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
      // (a) async WebCrypto path
      const A = TileStore.open(SQL, { tile: 64 }), idA = {}; a = now(); for (const k of Object.keys(mid.L)) idA[k] = (await AsyncTiles.putBlobAsync(A, subtle, lb(mid.L[k]), W, W, 16)).id; const putA = now() - a; const bytesA = A.exportDb();
      a = now(); const A2 = TileStore.open(SQL, { tile: 64, bytes: bytesA }), cpA = {}; for (const k of Object.keys(idA)) cpA[k] = asF32(await AsyncTiles.getBlobAsync(A2, subtle, idA[k])); const rsA = resume(cpA, tail); const resA = now() - a, hA = Stack.hashF32(Stack.composite(rsA));
      // (b) sync store with the fast JS sha
      const B = TileStore.open(SQL, { tile: 64, sha: FastSha.sha256 }), idB = {}; a = now(); for (const k of Object.keys(mid.L)) idB[k] = B.putBlob(lb(mid.L[k]), W, W, 16).id; const putB = now() - a; const bytesB = B.exportDb();
      a = now(); const B2 = TileStore.open(SQL, { tile: 64, sha: FastSha.sha256, bytes: bytesB }), cpB = {}; for (const k of Object.keys(idB)) cpB[k] = asF32(B2.getBlob(idB[k])); const rsB = resume(cpB, tail); const resB = now() - a, hB = Stack.hashF32(Stack.composite(rsB));
      out.S6 = { tFull, hFull: hFull.slice(0, 12), putA, resA, hEqA: hA === hFull, putB, resB, hEqB: hB === hFull, idsSame: JSON.stringify(idA) === JSON.stringify(idB) }; }
    return out; });
  await br.close(); srv.close(); num.chromium_store = Rs;
  chk('S4', 'async tile path: blob ids and every tile id equal the sync store; the sync store reads the async-written DB identically', Rs.S4.idsEqual && Rs.S4.syncReadsAsyncDb, '==', true);
  chk('S5', `async get: ${Rs.S5.detected}/20 single-bit corruptions detected, ${Rs.S5.silent} silent`, Rs.S5.silent === 0 && Rs.S5.detected === 20, '==', true);
  chk('S6', 'Chromium resume (WebCrypto path) composite hash == full fold', Rs.S6.hEqA, '==', true); chk('S6', 'Chromium resume (sync store + fast JS sha) composite hash == full fold', Rs.S6.hEqB, '==', true);
  chk('S6', `Chromium (a) WebCrypto: resume ${Rs.S6.resA.toFixed(0)} ms vs full fold ${Rs.S6.tFull.toFixed(0)} ms (put ${Rs.S6.putA.toFixed(0)} ms)`, +(Rs.S6.resA / Rs.S6.tFull).toFixed(3), '<=', 0.5);
  chk('S6', `Chromium (b) fast JS sha: resume ${Rs.S6.resB.toFixed(0)} ms vs full fold ${Rs.S6.tFull.toFixed(0)} ms (put ${Rs.S6.putB.toFixed(0)} ms)`, +(Rs.S6.resB / Rs.S6.tFull).toFixed(3), '<=', 1.0);
  if (errs.length) chk('S0', 'page errors: ' + errs.join(' | ').slice(0, 200), errs.length, '==', 0);
  const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, numbers: num, checks: rec, node: process.version, cpus: require('os').cpus()[0].model };
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'sha.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
