// Usage: node tiles/run_tiles.js   Tile store behind raster blobs. Every check is logged as {id,name,value,cmp,limit,pass}. Pre-registered in witness_log/HYPOTHESES.md (H32-H38).
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..'); const S = require('../stack.js'), TS = require('./tilestore.js'), DF = require('../doc/docfold.js'), Sch = require('../doc/schema.js'), { exportPsd } = require('../doc/psd_export.js'), { importPsd } = require('../doc/psd_import.js');
const rec = [], fails = [], nodeSha = (u) => crypto.createHash('sha256').update(u).digest('hex');
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push(`${id} ${name}: got ${value}, need ${cmp} ${limit}`); };
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const noise = (n, rnd) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (rnd() * 256) | 0; return b; };
(async () => {
  const SQL = await initSqlJs(), rnd = rng(5), W = 128;
  // ---- H32: byte-exact round trip, ids equal the whole-blob sha, odd sizes, 1 and 4 channels
  { const st = TS.open(SQL, { sha: nodeSha }); const sizes = [[1, 1], [63, 65], [130, 70], [64, 64], [65, 64], [200, 3], [3, 200], [128, 128]]; let bad = 0, idBad = 0, n = 0;
    for (let k = 0; k < 40; k++) { const [w, h] = sizes[k % sizes.length], ch = k % 2 ? 1 : 4, b = noise(w * h * ch, rnd), r = st.putBlob(b, w, h, ch); n++; if (r.id !== nodeSha(b)) idBad++; const g = st.getBlob(r.id); if (Buffer.compare(Buffer.from(g), Buffer.from(b)) !== 0) bad++; }
    chk('H32', `blobs round-tripped byte-exactly (of ${n}, odd sizes, 1 and 4 channels): mismatches`, bad, '==', 0); chk('H32', 'blob id == sha256(whole blob): mismatches', idBad, '==', 0);
    const same = noise(64 * 64 * 4, rnd); const a = st.putBlob(same, 64, 64, 4), b2 = st.putBlob(same, 64, 64, 4); chk('H32', 're-putting an identical blob adds no tiles', b2.newTiles + (a.id === b2.id ? 0 : 1), '==', 0); }
  // ---- H33: dedupe over 51 versions of an 8-layer document (W=512, tile 64, 50 edits of ~100x100)
  const big = TS.open(SQL, { sha: nodeSha }), WL = 512, layers = Array.from({ length: 8 }, () => noise(WL * WL * 4, rnd)); let logicalTiles = 0, ids = [];
  const putAll = () => { for (const l of layers) { const r = big.putBlob(l, WL, WL, 4); logicalTiles += 64; ids.push([r.id, l.slice()]); } };
  putAll(); const tilesAfterV0 = big.stats().tiles;
  for (let e = 0; e < 50; e++) { const l = layers[(rnd() * 8) | 0], cx = (rnd() * (WL - 100)) | 0, cy = (rnd() * (WL - 100)) | 0; for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) { const i = ((cy + y) * WL + cx + x) * 4; l[i] = 255 - l[i]; } putAll(); }
  const stats = big.stats(); chk('H33', `unique tiles stored / logical tiles of 51 versions (${stats.tiles} / ${logicalTiles}) in percent`, +(100 * stats.tiles / logicalTiles).toFixed(3), '<=', 4.0);
  chk('H33', 'non-vacuous: version 0 stored all its tiles', tilesAfterV0, '==', 8 * 64); chk('H33', 'every one of the 408 versions reconstructs byte-exactly (mismatches)', ids.reduce((m, [id, bytes]) => m + (Buffer.compare(Buffer.from(big.getBlob(id)), Buffer.from(bytes)) !== 0 ? 1 : 0), 0), '==', 0);
  // ---- H34: persistence. Export the SQLite file, reopen in a fresh sql.js instance (Node) and in Chromium
  const dbBytes = big.exportDb(); const re = TS.open(SQL, { sha: nodeSha, bytes: dbBytes }); chk('H34', 'reopened from exported SQLite file in a fresh instance: mismatches', ids.filter(([id, bytes]) => Buffer.compare(Buffer.from(re.getBlob(id)), Buffer.from(bytes)) !== 0).length, '==', 0);
  chk('H34', 'exported database size (KiB, informational)', Math.round(dbBytes.length / 1024), '<=', 1e9);
  // ---- H37: region reads
  { const st = TS.open(SQL, { sha: nodeSha }), blob = noise(WL * WL * 4, rnd), id = st.putBlob(blob, WL, WL, 4).id; let badTiles = 0, badBytes = 0;
    for (let k = 0; k < 200; k++) { const rw = 1 + ((rnd() * 150) | 0), rh = 1 + ((rnd() * 150) | 0), x = (rnd() * (WL - rw + 1)) | 0, y = (rnd() * (WL - rh + 1)) | 0, r = st.getRegion(id, x, y, rw, rh);
      const want = (Math.floor((x + rw - 1) / 64) - Math.floor(x / 64) + 1) * (Math.floor((y + rh - 1) / 64) - Math.floor(y / 64) + 1); if (r.tilesRead !== want) badTiles++;
      for (let yy = 0; yy < rh; yy++) { const a = ((y + yy) * WL + x) * 4; if (Buffer.compare(Buffer.from(r.bytes.subarray(yy * rw * 4, (yy + 1) * rw * 4)), Buffer.from(blob.subarray(a, a + rw * 4))) !== 0) { badBytes++; break; } } }
    chk('H37', 'region reads touching a wrong number of tiles (of 200)', badTiles, '==', 0); chk('H37', 'region bytes differing from the slice of the full blob (of 200)', badBytes, '==', 0); }
  // ---- H36 + H38: corruption detection and negative control
  { const small = TS.open(SQL, { sha: nodeSha }), blobsM = []; for (let k = 0; k < 6; k++) { const b = noise(130 * 70 * 4, rnd); blobsM.push([small.putBlob(b, 130, 70, 4).id, b]); } const base = small.exportDb(); let detected = 0, silent = 0, total = 300;
    for (let t = 0; t < total; t++) { const s2 = TS.open(SQL, { sha: nodeSha, bytes: base }), [id, orig] = blobsM[t % blobsM.length], m = s2.meta(id), kind = t % 3;
      if (kind === 0) { const tid = m.ids[(rnd() * m.ids.length) | 0], r = s2.db.exec("SELECT data FROM tiles WHERE id='" + tid + "'")[0].values[0][0], bad = r.slice(); bad[(rnd() * bad.length) | 0] ^= 1 << ((rnd() * 8) | 0); s2.db.run('UPDATE tiles SET data=? WHERE id=?', [bad, tid]); }
      else if (kind === 1) { const i = (rnd() * m.ids.length) | 0; let j = (rnd() * m.ids.length) | 0; if (j === i) j = (i + 1) % m.ids.length; const ids2 = m.ids.slice(); [ids2[i], ids2[j]] = [ids2[j], ids2[i]]; s2.db.run('UPDATE blobs SET manifest=? WHERE id=?', [JSON.stringify(ids2), id]); }
      else s2.db.run('UPDATE blobs SET manifest=? WHERE id=?', [JSON.stringify(m.ids.slice(0, -1)), id]);
      let threw = false, out; try { out = s2.getBlob(id); } catch (e) { threw = true; } if (threw) detected++; else if (Buffer.compare(Buffer.from(out), Buffer.from(orig)) !== 0) silent++; }
    chk('H36', `corruptions detected (of ${total}: tile bit flip, swapped manifest ids, truncated manifest)`, detected, '==', total); chk('H36', 'silent wrong reads', silent, '==', 0);
    const s3 = TS.open(SQL, { sha: nodeSha, bytes: base }); s3.db.run('UPDATE blobs SET tile=63 WHERE id=?', [blobsM[0][0]]); let caught = false; try { s3.getBlob(blobsM[0][0]); } catch (e) { caught = true; } chk('H38', 'negative control: reading with a wrong tile size (63 instead of 64) is detected', caught, '==', true); }
  // ---- H35: docfold backed by the tile store gives the same result as Map-backed blobs
  const L = await import('lcms-wasm'), lcms = await L.instantiate();
  { const rr = rng(9), r4 = (x) => Math.round(x * 1e4) / 1e4, dabs = (ops, layer, n, big) => { for (let i = 0; i < n; i++) ops.push({ op: 'dab', layer, x: r4(rr() * W), y: r4(rr() * W), r: r4((big ? 12 : 6) + rr() * 24), c: [r4(rr()), r4(rr()), r4(rr())], a: r4(0.3 + rr() * 0.65) }); };
    const Ly = (id, mode, op, ex = {}) => ({ op: 'layer', id, mode, opacity: op, mask: !!ex.mask, space: 'srgb', ...(ex.parent !== undefined ? { parent: ex.parent } : {}), ...(ex.clip ? { clip: true } : {}) }), docs = {};
    { const o = [{ op: 'doc', v: 1, w: W, h: W, working: 'p3', gamma: 'encoded' }, Ly(0, 'normal', 1), { op: 'fill', layer: 0, c: [0.5, 0.55, 0.6], a: 1 }]; dabs(o, 0, 20); o.push(Ly(1, 'multiply', 0.8)); dabs(o, 1, 30); docs.flat_p3 = o; }
    { const o = [{ op: 'doc', v: 2, w: W, h: W, working: 'srgb', gamma: 'encoded' }, Ly(0, 'normal', 1), { op: 'fill', layer: 0, c: [0.55, 0.5, 0.5], a: 1 }]; dabs(o, 0, 20); o.push({ op: 'group', id: 10, mode: 'pass-through', opacity: 0.8, mask: false }, Ly(1, 'normal', 1, { parent: 10 })); dabs(o, 1, 30);
      o.push(Ly(2, 'multiply', 1, { parent: 10, clip: true })); dabs(o, 2, 30, true); o.push(Ly(3, 'hue', 0.7), Ly(4, 'luminosity', 0.8, { clip: true })); dabs(o, 3, 25); dabs(o, 4, 25, true); docs.groups_clip_nonsep = o; }
    let same = 0, total = 0, tileBytesSaved = 0;
    for (const [name, ops] of Object.entries(docs)) { const ctx0 = { L, lcms, blobs: new Map() }, ex = exportPsd(ops, ctx0), imp = importPsd(ex.bytes), mapBlobs = new Map(imp.blobs), store = TS.open(SQL, { sha: nodeSha }), W2 = ops[0].w;
      for (const o of imp.ops) if (o.op === 'raster' || o.op === 'maskraster') { const b = imp.blobs.get(o.pixels); const r = store.putBlob(b, W2, W2, o.op === 'raster' ? 4 : 1); if (r.id !== o.pixels) fails.push('tile store id differs from blob id for ' + name); }
      const view = { get: (id) => store.has(id) ? store.get(id) : undefined }, errs = Sch.validate(imp.ops, view); chk('H35', `${name}: schema validation against the tile-store-backed blobs (errors)`, errs.length, '==', 0);
      const hashOf = (blobs) => { const c = { L, lcms, blobs }, f = DF.fold(imp.ops, c), back = DF.composite(f, c); return S.hashF32(back) + S.sha256(DF.render(back, f, 'srgb', c)); }; total++; if (hashOf(mapBlobs) === hashOf(view)) same++; tileBytesSaved += store.stats().tiles; }
    chk('H35', 'documents whose f32 + sRGB render hashes are identical for Map-backed and tile-store-backed blobs', same, '==', total); }
  // ---- Chromium: reopen the exported SQLite file with sql.js in the browser and reconstruct every blob (H34)
  const { chromium } = require('playwright-core'), srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
  const br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), pg = await br.newPage(); pg.on('pageerror', (e) => fails.push('page error: ' + e.message)); const base = 'http://127.0.0.1:' + srv.address().port;
  await pg.goto(base + '/icc/blank.html'); for (const s of ['/node_modules/sql.js/dist/sql-wasm.js', '/stack.js', '/tiles/tilestore.js']) await pg.addScriptTag({ url: base + s });
  const uniq = [...new Map(ids.map(([id]) => [id, 1])).keys()].slice(0, 60);
  const res = await pg.evaluate(async ({ b64, list }) => { const SQL = await initSqlJs({ locateFile: (f) => '/node_modules/sql.js/dist/' + f }), bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), st = TileStore.open(SQL, { bytes }); let ok = 0; for (const id of list) { const g = st.getBlob(id); if (Stack.sha256(g) === id) ok++; } return ok; }, { b64: Buffer.from(dbBytes).toString('base64'), list: uniq });
  await br.close(); srv.close(); chk('H34', `Chromium (fresh sql.js, pure-JS sha256) reconstructs blobs that match their ids (of ${uniq.length})`, res, '==', uniq.length);
  console.log(JSON.stringify({ checks: rec, n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
