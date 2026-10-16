#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §VERT_WELD_PARITY (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MEM_GROWTH M4-A, buildings). Read the log after every run.
// ISSUE PROVEN/DISPROVEN: a welded BUILDING DB behaves IDENTICALLY to the original in the Viewer: element registry (guid/disc/storey/class),
// layer maps (discipline + storey), merged-range table, geometry fingerprint (triangle count/area/bbox per mesh), seeded-ray picking
// (hit mesh signature + triangle + distance), and the shipped §MEP_SMOOTH_NORMALS / §DUCT_SILHOUETTE / §WIND_FLIP log numbers.
// Scope-blind guard: prints INCONCLUSIVE if the welded run did not actually have fewer vertices (nothing welded) or if <50 rays hit.
// Env: B=<building file prefix e.g. Duplex_extracted> ORIG_DIR WELD_DIR GPU=real PORT LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(path.join(__dirname, '..', '..'));
const ORIG_DIR = process.env.ORIG_DIR || '/home/red1/bim-ootb/buildings', WELD_DIR = process.env.WELD_DIR;
const B = process.env.B || 'Duplex_extracted', PORT = +(process.env.PORT || 8598), LOG = process.env.LOG || '/tmp/witness_vertex_weld_parity_' + B + '.log', REAL = process.env.GPU === 'real';
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
let useDir = ORIG_DIR;
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = null;
  if (u.startsWith('/buildings/')) for (const d of [useDir, ORIG_DIR]) { const c = path.join(d, u.slice(11)); if (fs.existsSync(c) && fs.statSync(c).isFile()) { fp = c; break; } }
  if (!fp) { const c = path.join(ROOT, u.replace(/^\/+/, '')); if (fs.existsSync(c)) fp = c; }
  if (!fp) { const alt = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(alt)) fp = alt; else { res.writeHead(404); res.end(); return; } }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(res);
} catch (e) { res.writeHead(500); res.end(); } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run(dir) {
  useDir = dir;
  const b = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wvp-')), protocolTimeout: 1800000,
    env: Object.assign({}, process.env, REAL ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {}),
    args: ['--no-sandbox', '--js-flags=--max-old-space-size=8192'].concat(REAL ? ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']) });
  try {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
    const logs = []; p.on('console', m => { const t = m.text(); if (/§(MEP_SMOOTH_NORMALS|DUCT_SILHOUETTE|WIND_FLIP)/.test(t)) logs.push(t.replace(/\b(ms|heapMB|loadMs|t)=[\d.]+/g, '$1=_')); });
    await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${B}.db`, { waitUntil: 'domcontentloaded', timeout: 900000 });
    let ok = false;
    for (let i = 0; i < 1200 && !ok; i++) { await sleep(500); try { ok = await p.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && APP.scene && APP.collectMeshes(o => o.isMesh).length > 0)); } catch (e) {} }
    if (!ok) return { ok: false };
    await sleep(4000);
    const r = await p.evaluate(() => {
      const A = APP, T = THREE, R = {};
      const keys = o => Object.keys(o || {}).sort();
      R.reg = { guidMap: keys(A.guidMap).length, batchMeta: keys(A._batchMeta).length, instMeta: keys(A._instanceMeta).length, mergedMeshes: keys(A._mergedMeta).length,
        mergedRanges: keys(A._mergedMeta).reduce((n, k) => n + A._mergedMeta[k].length, 0),
        disc: keys(A._batchDiscMap).map(k => k + ':' + A._batchDiscMap[k].length).join('|'), storey: keys(A._batchStoreyMap).map(k => k + ':' + A._batchStoreyMap[k].length).join('|') };
      // per-element identity+index-range digest (merged path) — idxStart/idxCount must be unchanged (faces untouched by the weld)
      const el = []; keys(A._mergedMeta).forEach(k => A._mergedMeta[k].forEach(g => el.push([g.guid, g.storey, g.disc, g.ifcClass, g.idxStart, g.idxCount, +(g.minX||0).toFixed(3), +(g.maxX||0).toFixed(3), +(g.minZ||0).toFixed(3), +(g.maxZ||0).toFixed(3)].join('~'))));
      const mm = o => o && o._instanceMeta; ['_batchMeta', '_instanceMeta'].forEach(n => keys(A[n]).forEach(k => { const v = A[n][k]; (Array.isArray(v) ? v : [v]).forEach(g => g && el.push([n, g.guid, g.storey, g.disc, g.ifcClass].join('~'))); }));
      el.sort(); let h = 0; el.join('\n').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); R.elDigest = el.length + ':' + h;
      // geometry fingerprint per mesh: tri count, total area (position-based, so independent of vertex sharing), bbox
      const meshes = A.collectMeshes(o => o.isMesh || o.isBatchedMesh || o.isInstancedMesh); R.meshes = meshes.length;
      let verts = 0; const sigs = [];
      meshes.forEach(m => { const g = m.geometry; if (!g || !g.attributes.position) return; const P = g.attributes.position, I = g.index; verts += P.count;
        const n = I ? I.count : P.count; let area = 0; const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
        for (let t = 0; t + 2 < n; t += 3) { const i0 = I ? I.getX(t) : t, i1 = I ? I.getX(t + 1) : t + 1, i2 = I ? I.getX(t + 2) : t + 2; a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2); area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2; }
        g.computeBoundingBox(); const bb = g.boundingBox; sigs.push([m.type, n / 3, area.toFixed(2), [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map(x => x.toFixed(2)).join(','), m.matrixWorld.elements.map(x => x.toFixed(3)).join(',')].join('|')); });
      sigs.sort(); R.sigs = sigs; R.verts = verts;
      // seeded rays over the scene bbox through real Raycaster (uses the viewer's merged/batched raycast overrides)
      const box = new T.Box3(); meshes.forEach(m => { m.updateMatrixWorld(); box.union(new T.Box3().setFromObject(m)); });
      let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      const sz = box.getSize(new T.Vector3()), ctr = box.getCenter(new T.Vector3()), rc = new T.Raycaster(), hits = [];
      for (let i = 0; i < 400; i++) { const o = new T.Vector3(box.min.x + rnd() * sz.x, box.max.y + 1, box.min.z + rnd() * sz.z); rc.set(o, new T.Vector3(0, -1, 0));
        const hs = rc.intersectObjects(meshes, false); if (hs.length) { const h0 = hs[0]; const m = h0.object; hits.push([m.type, (m.geometry.index ? m.geometry.index.count : 0) / 3, h0.faceIndex, h0.batchId, h0.instanceId, h0.distance.toFixed(4)].join('|')); } else hits.push('miss'); }
      R.hits = hits; R.nHit = hits.filter(x => x !== 'miss').length;
      return R;
    });
    r.logs = logs.sort(); r.ok = true; return r;
  } finally { try { await b.close(); } catch (e) {} }
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  log('  [gpu] ' + (REAL ? 'real' : 'swiftshader') + ' B=' + B + ' ORIG=' + ORIG_DIR + ' WELD=' + WELD_DIR);
  const o = await run(ORIG_DIR), w = await run(WELD_DIR);
  if (!o.ok || !w.ok) { log('§VERT_WELD_PARITY verdict=INCONCLUSIVE (a run never became ready)'); fs.writeFileSync(LOG, out.join('\n') + '\n'); server.close(); process.exit(2); }
  const eq = (name, a, b) => { const same = JSON.stringify(a) === JSON.stringify(b); log('§VERT_WELD_PARITY ' + name + ' ' + (same ? 'SAME' : 'DIFF orig=' + JSON.stringify(a).slice(0, 300) + ' weld=' + JSON.stringify(b).slice(0, 300))); return same; };
  let ok = true;
  ok = eq('registry', o.reg, w.reg) && ok; ok = eq('elementDigest', o.elDigest, w.elDigest) && ok; ok = eq('meshCount', o.meshes, w.meshes) && ok;
  ok = eq('geometryFingerprint(tris,area,bbox,matrix per mesh)', o.sigs, w.sigs) && ok; ok = eq('seededRayPicking(400 rays)', o.hits, w.hits) && ok;
  // §MEP_SMOOTH vertsSmoothed/vertsKeptHard count corners classified at the 55° crease boundary: merged corners can fall either side for a handful.
  // Every other number must be EXACT; those two may differ by <= 0.01 % of their sum (reported, never hidden).
  const TOLK = /vertsSmoothed=(\d+) vertsKeptHard=(\d+)/, mask = l => l.replace(TOLK, 'vertsSmoothed=# vertsKeptHard=#');
  ok = eq('shippedLogs(exact except crease-boundary counts)', o.logs.map(mask), w.logs.map(mask)) && ok;
  const ts = l => { const m = TOLK.exec(l); return m ? [+m[1], +m[2]] : null; }, to = o.logs.map(ts).find(Boolean), tw = w.logs.map(ts).find(Boolean);
  if (to && tw) { const d = Math.abs(to[0] - tw[0]) + Math.abs(to[1] - tw[1]), tot = to[0] + to[1], pct = d / tot * 100; log('§VERT_WELD_PARITY mepSmoothBoundaryCorners orig=' + to + ' weld=' + tw + ' absDiff=' + d + ' (' + pct.toFixed(5) + ' % of ' + tot + ')'); if (pct > 0.01) { ok = false; log('§VERT_WELD_PARITY mepSmoothBoundaryCorners DIFF over 0.01 %'); } }
  log('§VERT_WELD_PARITY sceneVerts orig=' + o.verts + ' weld=' + w.verts + ' (' + ((w.verts - o.verts) / o.verts * 100).toFixed(1) + '%) rayHits=' + o.nHit + ' shippedLogLines=' + o.logs.length);
  log('--- orig logs ---\n' + o.logs.join('\n'));
  const vac = w.verts >= o.verts ? 'nothing welded' : o.nHit < 50 ? 'fewer than 50 rays hit' : o.logs.length === 0 ? 'no shipped logs captured' : '';
  log(vac ? '§VERT_WELD_PARITY verdict=INCONCLUSIVE (' + vac + ')' : ok ? '§VERT_WELD_PARITY verdict=PASS all parity checks SAME' : '§VERT_WELD_PARITY verdict=FAIL (see DIFF lines)');
  fs.writeFileSync(LOG, out.join('\n') + '\n'); server.close(); process.exit(ok && !vac ? 0 : 1);
})();
