#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MV-PARITY scope (read this block first; READ THE LOG after every run)
 * SCOPE: whitebox §-log witness proving the Modeller's ARC open ≡ the Viewer's LOD400/spatial truth,
 * measured — never eyeballed — against the SAME sqlite substrate. Four legs, all numbers from the live
 * scene or the DB (non-invent: no synthetic tolerances without a measured basis — thresholds below are
 * PINNED from run-1 measurements, see mv_parity_run*.log):
 *
 *   Leg M  — Modeller opens modeller/Duplex_extracted.db via the REAL user path (#b-open → mo-row click).
 *            Per rendered ARC element (userData.featureId → kernel_ops.output_guid): live world-AABB centre
 *            + rendered triangle count, joined by guid to the SAME file's element_transforms (centre truth)
 *            and base_geometries via element_instances.geometry_hash (LOD400 triangle truth).
 *            → §MV-PARITY-M rendered/joined/maxDC/meanDC/triExact/boxFallback/unresolved (+ offenders).
 *   Leg V  — Viewer opens the SAME modeller file (?db=/modeller/Duplex_extracted.db). Same per-element
 *            extraction (individual meshes + InstancedMesh/_instanceMeta + BatchedMesh/_batchMeta; batched
 *            slots whose geometry can't be resolved are COUNTED honestly, never guessed), world AABB
 *            inverted out of Y-up/recentred three-space (ix=tx+off.x, iy=off.y−tz, iz=ty+off.z) back into
 *            RAW DB space, joined to the same element_transforms. → §MV-PARITY-V (+ placeholders=).
 *            HONEST-RED PATH: the raw modeller file has NO elements_meta.building column — if the viewer
 *            renders 0 elements from it, that is logged as §MV-PARITY-V-RAW (a real schema finding), and
 *            the leg re-runs on a runtime fixture copy that ONLY adds building='Duplex' (label column the
 *            viewer's stream query requires — zero geometry/transform rows touched, non-invent).
 *   Leg X  — cross-app: join Leg M × Leg V per guid, both in DB space. → §MV-PARITY-X (+ offenders).
 *   Leg V2 — Viewer on its NATIVE extraction (?db=buildings/Duplex_extracted.db, a DIFFERENT file — never
 *            cross-compared with the modeller file): rendered tris vs that file's component_geometries.
 *            → §MV-PARITY-V2 triExact/placeholders.
 *
 *   Leg T  — SEMANTICS GROUND TRUTH (pure node, better-sqlite3): the two Duplex extractions share 215
 *            guids. For each, compare the native deployed extraction's placed centre against the modeller
 *            file under BOTH interpretations of element_transforms.center:
 *              (a) ANCHOR semantics (viewer): world = center + R·(raw blob verts)  →  residual after
 *                  removing any constant frame offset: max 1.44e-5 m across ALL 215 shared elements
 *                  (run-2 measured — the two files even share the same frame, offset ≈1e-8).
 *              (b) AABB-CENTRE semantics (modeller ARC seed: re-centre blob, seat AABB centre ON center)
 *                  →  displacement vs that ground truth: mean 2.74 m, max 18.03 m (run-2, 253 elements).
 *            ⇒ center_xyz in *_extracted.db is the IFC LOCAL-PLACEMENT ANCHOR, NOT the volumetric centre.
 *            recenter()+seat-on-center therefore MISPLACED every element whose vertex blob has a non-zero
 *            local origin (visually confirmed 2026-07-02: viewer assembled a closed duplex from the modeller
 *            file while the modeller's own render splayed). FIXED render-side: real_geometry.js recenter()
 *            now returns the subtracted centre as anchorOffset and bonsai_library.js foldInsert §ARC-ANCHOR
 *            adds back R·anchorOffset at fold time — signed op params byte-identical, replay-stable.
 *
 * CLAIMS: M1 join complete · M2 seat-on-anchor (rendered centre ≡ center + R·blobCentre — the modeller's
 *         convention SINCE the §ARC-ANCHOR fix; pre-fix it seated the AABB centre ON center_xyz, displacing
 *         253/265 elements) · M3 LOD400 (boxFallback=0, triExact=n/n) · T1 anchor semantics ≡ native
 *         extraction · T2 modeller placement ≡ ground truth (was the deliberate RED that exposed the bug;
 *         GREEN since the fold-side anchorOffset fix, bonsai_library.js §ARC-ANCHOR — do NOT let it regress)
 *         V1 join + anchor-corrected spatial on the same file · X1 cross-app spatial (was the second
 *         deliberate RED, same root cause as T2; GREEN since the same fix — the two apps now agree where
 *         every element sits) · V2 viewer LOD400 + anchor-corrected spatial native · NO-ERROR.
 * DISCIPLINE: save output to /tmp/wt-mv-parity/mv_parity_run<N>.log and READ THE LOG before conclusions —
 * exit code is not evidence.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');

// ── PINNED THRESHOLDS (from mv_parity_run1/run2.log — measured basis, non-invent) ──
// M seat-on-center measured maxDC=6.79e-7 m (float32 blob noise)                  → pin 1e-3 m
// T1 anchor-vs-native measured max residual=1.44e-5 m (215/215)                   → pin 1e-3 m
// V anchor-corrected maxDC=9.04e-7 m · V2 anchor-corrected maxDC=4.74e-7 m        → pin 1e-3 m
// T2/X pinned to the SAME 1e-3 spatial standard — pre-fix they FAILED RED at meanDisp=2.74 m /
// maxDisp=18.03 m (the finding this witness exposed); the §ARC-ANCHOR fold fix flips them green at the
// UNCHANGED tolerance (do NOT loosen it, ever — a loosened pin is how the bug hid for weeks).
const TOL_M = 1e-3, TOL_V = 1e-3, TOL_X = 1e-3, TOL_T = 1e-3;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const FIXDIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mv-parity-fix-'));
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  const base = p.startsWith('/fixtures/') ? FIXDIR : ROOT;
  const fp = p.startsWith('/fixtures/') ? path.join(FIXDIR, p.slice('/fixtures/'.length)) : path.join(ROOT, p);
  fs.readFile(fp, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); });
});

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const fmt = v => (v == null || !isFinite(v)) ? String(v) : (Math.abs(v) < 1e-2 && v !== 0 ? v.toExponential(3) : v.toFixed(4));

// stats over [{guid,dc,cls}] rows
function dcStats(rows) {
  let max = 0, sum = 0;
  for (const r of rows) { if (r.dc > max) max = r.dc; sum += r.dc; }
  return { max, mean: rows.length ? sum / rows.length : 0, top5: rows.slice().sort((a, b) => b.dc - a.dc).slice(0, 5) };
}

// ── ANCHOR-semantics truth (node, better-sqlite3): world centre = center + R_db·(blob bbox centre).
// R_db mirrors the viewer's EXACT render convention (streaming.js _flushInstanced/_flushBboxBatched:
// THREE.Euler(rotX, rotZ, -rotY) order 'XYZ' in Y-up three space, geometry axis-swapped (x,z,-y) by
// scene.js blobToGeometry) mapped back into RAW Z-up DB space: R_db = Mᵀ·RX(rx)·RY(rz)·RZ(−ry)·M with
// M = [[1,0,0],[0,0,1],[0,−1,0]] (three = M·db). Verified: reproduces the native deployed extraction
// with 0.0000 m residual across all 215 shared elements (Leg T / run-1).
function m3mul(a, b) { const o = [[0,0,0],[0,0,0],[0,0,0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i][j] = a[i][0]*b[0][j] + a[i][1]*b[1][j] + a[i][2]*b[2][j]; return o; }
function m3v(a, v) { return [a[0][0]*v[0]+a[0][1]*v[1]+a[0][2]*v[2], a[1][0]*v[0]+a[1][1]*v[1]+a[1][2]*v[2], a[2][0]*v[0]+a[2][1]*v[1]+a[2][2]*v[2]]; }
function RX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1,0,0],[0,c,-s],[0,s,c]]; }
function RY(a) { const c = Math.cos(a), s = Math.sin(a); return [[c,0,s],[0,1,0],[-s,0,c]]; }
function RZ(a) { const c = Math.cos(a), s = Math.sin(a); return [[c,-s,0],[s,c,0],[0,0,1]]; }
const M_SWAP = [[1,0,0],[0,0,1],[0,-1,0]], M_SWAP_T = [[1,0,0],[0,0,-1],[0,1,0]];
function rDb(rx, ry, rz) { return m3mul(M_SWAP_T, m3mul(m3mul(m3mul(RX(rx), RY(rz)), RZ(-ry)), M_SWAP)); }

function anchorTruth(dbPath, geoTable) {
  const db = new Database(dbPath, { readonly: true });
  const blobCentre = {};
  for (const r of db.prepare(`SELECT geometry_hash h, vertices v FROM ${geoTable}`).iterate()) {
    const f = new Float32Array(r.v.buffer, r.v.byteOffset, r.v.byteLength / 4);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < f.length; i += 3) {
      if (f[i] < x0) x0 = f[i]; if (f[i] > x1) x1 = f[i];
      if (f[i+1] < y0) y0 = f[i+1]; if (f[i+1] > y1) y1 = f[i+1];
      if (f[i+2] < z0) z0 = f[i+2]; if (f[i+2] > z1) z1 = f[i+2];
    }
    blobCentre[r.h] = [(x0+x1)/2, (y0+y1)/2, (z0+z1)/2];
  }
  const truth = {};
  for (const r of db.prepare(
    'SELECT t.guid g, t.center_x cx, t.center_y cy, t.center_z cz, t.rotation_x rx, t.rotation_y ry, t.rotation_z rz, i.geometry_hash h ' +
    'FROM element_transforms t JOIN element_instances i ON i.guid = t.guid').iterate()) {
    const bc = blobCentre[r.h]; if (!bc) continue;
    const o = m3v(rDb(r.rx || 0, r.ry || 0, r.rz || 0), bc);
    truth[r.g] = { ix: r.cx + o[0], iy: r.cy + o[1], iz: r.cz + o[2] };
  }
  db.close();
  return truth;
}
const dist3 = (a, b) => Math.sqrt((a.ix - b.ix) ** 2 + (a.iy - b.iy) ** 2 + (a.iz - b.iz) ** 2);

// ── in-page extractor for the VIEWER (shared by legs V and V2) — returns per-guid rendered
// centre (inverted into RAW DB space) + rendered tris, plus honest coverage counters.
async function extractViewer(pg) {
  return pg.evaluate(() => {
    const A = window.APP, THREE = window.THREE;
    A.scene.updateMatrixWorld(true);
    const off = A.modelOffset;
    const q = (sql) => A.dbQuery(sql);
    // guid → geometry_hash (for batched slots + tri truth)
    const g2h = {}; q('SELECT guid, geometry_hash FROM element_instances').forEach(r => { g2h[r[0]] = r[1]; });
    // DB tri truth per hash — whichever geometry table this file carries
    const triDb = {};
    for (const t of ['component_geometries', 'base_geometries']) {
      try { A.db.exec('SELECT geometry_hash, length(faces) FROM ' + t)[0].values.forEach(r => { triDb[r[0]] = r[1] / 12; }); } catch (e) {}
    }
    // element_transforms truth
    const tf = {}; q('SELECT guid, center_x, center_y, center_z FROM element_transforms').forEach(r => { tf[r[0]] = { cx: r[1], cy: r[2], cz: r[3] }; });
    const cls = {}; q('SELECT guid, ifc_class FROM elements_meta').forEach(r => { cls[r[0]] = r[1]; });

    const per = {};          // guid → {ix,iy,iz,tris,kind}
    let placeholders = 0, batchedUnresolved = 0, instSlots = 0, batchSlots = 0, plainMeshes = 0;
    const box = new THREE.Box3(), v = new THREE.Vector3(), m4 = new THREE.Matrix4(), wm = new THREE.Matrix4();
    const triOf = g => g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
    const put = (guid, tris, kind) => {
      const c = box.getCenter(v);
      // INVERSE of A.ifc2three (Y-up recentred → RAW DB space)
      per[guid] = { ix: c.x + off.x, iy: off.y - c.z, iz: c.y + off.z, tris, kind };
    };
    A.scene.traverse(obj => {
      if (obj.userData && obj.userData.isBboxPlaceholder && obj.visible !== false) { placeholders += (obj.count || 1); return; }
      if (obj.isInstancedMesh && obj.userData.isInstanced) {
        const meta = A._instanceMeta[obj.id] || [];
        const geo = obj.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
        for (let i = 0; i < meta.length; i++) {
          obj.getMatrixAt(i, m4); wm.multiplyMatrices(obj.matrixWorld, m4);
          box.copy(geo.boundingBox).applyMatrix4(wm);
          put(meta[i].guid, triOf(geo), 'inst'); instSlots++;
        }
      } else if (obj.isBatchedMesh && obj.userData.isBatched) {
        const meta = A._batchMeta[obj.id] || [];
        for (const slot of meta) {
          const h = g2h[slot.guid], geo = h && A.meshCache[h];
          if (!geo) { batchedUnresolved++; continue; }   // honest: no per-slot geometry — count, don't guess
          if (!geo.boundingBox) geo.computeBoundingBox();
          obj.getMatrixAt(slot.slotId, m4); wm.multiplyMatrices(obj.matrixWorld, m4);
          box.copy(geo.boundingBox).applyMatrix4(wm);
          put(slot.guid, triOf(geo), 'batch'); batchSlots++;
        }
      } else if (obj.isMesh && obj.userData && obj.userData.guid) {
        const geo = obj.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
        box.copy(geo.boundingBox).applyMatrix4(obj.matrixWorld);
        put(obj.userData.guid, triOf(geo), 'mesh'); plainMeshes++;
      }
    });
    // join to transforms
    const rows = [], per2 = {};
    let triExact = 0, joined = 0;
    for (const guid in per) {
      const p = per[guid], t = tf[guid];
      if (!t) continue;
      joined++;
      const dc = Math.sqrt((p.ix - t.cx) ** 2 + (p.iy - t.cy) ** 2 + (p.iz - t.cz) ** 2);
      const dbTris = triDb[g2h[guid]];
      const exact = dbTris != null && p.tris === dbTris;
      if (exact) triExact++;
      rows.push({ guid, dc, cls: cls[guid] || '?', tris: p.tris, dbTris: dbTris == null ? -1 : dbTris, kind: p.kind });
      per2[guid] = { ix: p.ix, iy: p.iy, iz: p.iz };
    }
    return {
      rendered: Object.keys(per).length, joined, triExact, rows, per: per2,
      placeholders, batchedUnresolved, instSlots, batchSlots, plainMeshes,
      streamed: A.streamedCount, active: A.activeBuilding
    };
  });
}

async function openViewer(br, dbUrl, tag) {
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 1 });
  const errs = [], clog = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  pg.on('console', m => { const t = m.text(); if (/§|\[S\d+\]/.test(t)) clog.push(t.slice(0, 200)); });
  await pg.goto(`http://localhost:${server.address().port}/viewer/viewer.html?db=${encodeURIComponent(dbUrl)}#bld=Duplex`, { waitUntil: 'load', timeout: 90000 });
  const ready = await pg.waitForFunction(
    () => window.APP && window.APP.db && window.APP.activeBuilding && window.APP.streaming === false && window.APP.buildingsRendered && window.APP.buildingsRendered.size > 0,
    { timeout: 60000, polling: 300 }).then(() => true).catch(() => false);
  await sleep(3000);   // let progressive flush / batch consolidation settle
  console.log('  §' + tag + '-READY ready=' + ready);
  return { pg, errs, clog, ready };
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // anchor ground truth for the modeller file (pure node) — hoisted above Leg M since the §ARC-ANCHOR fix:
  // M2 now asserts the rendered scene against THIS (center + R·blobCentre), the proven semantics, not raw center_xyz.
  const mTruth = anchorTruth(path.join(ROOT, 'modeller', 'Duplex_extracted.db'), 'base_geometries');

  // ════ Leg M — Modeller vs its own DB truth (real user open path) ════
  console.log('═══ W-MV-PARITY Leg M — Modeller opens Duplex (real click path) → live AABB/tris vs element_transforms/base_geometries ═══');
  let legM;
  {
    const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 1 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${server.address().port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 30000 }).catch(() => {});
    await pg.click('#b-open'); await sleep(200);
    await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
    await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
    const seeded = await pg.waitForFunction(() => window.Bonsai && window.Bonsai.group() && window.Bonsai.group().children.length > 250, { timeout: 60000, polling: 300 }).then(() => true).catch(() => false);
    await sleep(2000);

    legM = await pg.evaluate(async () => {
      const THREE = window.THREE;
      const db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
      const q = sql => { const r = db.exec(sql); return r.length ? r[0].values : []; };
      const tf = {}; q('SELECT guid, center_x, center_y, center_z FROM element_transforms').forEach(r => { tf[r[0]] = { cx: r[1], cy: r[2], cz: r[3] }; });
      const cls = {}; q('SELECT guid, ifc_class FROM elements_meta').forEach(r => { cls[r[0]] = r[1]; });
      const g2h = {}; q('SELECT guid, geometry_hash FROM element_instances').forEach(r => { g2h[r[0]] = r[1]; });
      const geoTable = q("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('base_geometries','component_geometries')").map(r => r[0])[0] || null;
      const triDb = {}; if (geoTable) q('SELECT geometry_hash, length(faces) FROM ' + geoTable).forEach(r => { triDb[r[0]] = r[1] / 12; });
      // featureId → guid bridge (kernel_ops.output_guid)
      const odb = window.Bonsai.oplog.db || await window.Bonsai.oplog._ensureDb();
      const f2g = {}; const kr = odb.exec('SELECT id, output_guid FROM kernel_ops WHERE output_guid IS NOT NULL');
      if (kr.length) kr[0].values.forEach(r => { f2g[r[0]] = r[1]; });
      // live scene — Z-up RAW DB space, no inversion needed
      window.A.scene.updateMatrixWorld(true);
      const box = new THREE.Box3(), v = new THREE.Vector3();
      const rows = []; const per = {};
      let rendered = 0, joined = 0, triExact = 0, boxFallback = 0;
      for (const m of window.Bonsai.group().children) {
        if (!m.isMesh || !m.userData || m.userData.featureId == null) continue;
        rendered++;
        const guid = f2g[m.userData.featureId];
        const t = guid && tf[guid];
        if (!t) continue;
        joined++;
        box.setFromObject(m); const c = box.getCenter(v);
        const tris = m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
        const dbTris = triDb[g2h[guid]];
        const exact = dbTris != null && tris === dbTris;
        if (exact) triExact++;
        if (!exact && tris === 12) boxFallback++;   // proxy-box render where the DB says otherwise
        const dc = Math.sqrt((c.x - t.cx) ** 2 + (c.y - t.cy) ** 2 + (c.z - t.cz) ** 2);
        rows.push({ guid, dc, cls: cls[guid] || '?', tris, dbTris: dbTris == null ? -1 : dbTris });
        per[guid] = { ix: c.x, iy: c.y, iz: c.z };
      }
      db.close();
      return { rendered, joined, triExact, boxFallback, rows, per, geoTable, kernelOps: Object.keys(f2g).length, dbElems: Object.keys(tf).length };
    });
    legM.errs = errs;
    const s = dcStats(legM.rows);
    // anchor-corrected spatial (the post-fix convention): rendered centre vs center + R·blobCentre. dc vs RAW
    // center_xyz is still logged — under anchor semantics it measures each blob's local-origin offset (max ≈18 m
    // on this file), NOT a rendering error; it stays as the audit trail of what the old convention would claim.
    const aM = []; for (const g in legM.per) { if (mTruth[g]) aM.push({ guid: g, dc: dist3(legM.per[g], mTruth[g]), cls: (legM.rows.find(r => r.guid === g) || {}).cls || '?' }); }
    const sM = dcStats(aM);
    console.log(`§MV-PARITY-M building=Duplex rendered=${legM.rendered} joined=${legM.joined} maxDC=${fmt(s.max)} meanDC=${fmt(s.mean)} maxDCanchor=${fmt(sM.max)} meanDCanchor=${fmt(sM.mean)} triExact=${legM.triExact}/${legM.joined} boxFallback=${legM.boxFallback} unresolved=${legM.rendered - legM.joined} geoTable=${legM.geoTable} kernelOpsGuids=${legM.kernelOps} dbElems=${legM.dbElems} seeded=${seeded}`);
    sM.top5.forEach(o => console.log(`§MV-PARITY-M-OFFENDER guid=${o.guid} dcAnchor=${fmt(o.dc)} class=${o.cls}`));

    chk('M1 JOIN-COMPLETE (every rendered ARC element resolves featureId→guid→transforms)', legM.joined === legM.rendered && legM.rendered > 250, `joined=${legM.joined}/${legM.rendered}`);
    chk(`M2 SEAT-ON-ANCHOR (rendered AABB centre ≡ center + R·blobCentre, maxDC ≤ ${TOL_M} m on >200 joined — the proven semantics, §ARC-ANCHOR)`, aM.length > 200 && sM.max <= TOL_M, `maxDCanchor=${fmt(sM.max)} meanDCanchor=${fmt(sM.mean)} joined=${aM.length}`);
    chk('M3 LOD400 (boxFallback=0, triExact=n/n)', legM.boxFallback === 0 && legM.triExact === legM.joined, `triExact=${legM.triExact}/${legM.joined} boxFallback=${legM.boxFallback}`);
    chk('M-NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));
    await pg.close();
  }

  // ════ Leg T — semantics ground truth (pure node): what does center_xyz MEAN in *_extracted.db? ════
  console.log('═══ W-MV-PARITY Leg T — anchor vs AABB-centre semantics, disambiguated against the native deployed extraction (215 shared guids) ═══');
  let nTruth;
  {
    nTruth = anchorTruth(path.join(ROOT, 'viewer', 'buildings', 'Duplex_extracted.db'), 'component_geometries');
    // T1 — ANCHOR semantics: modeller-file anchor-placed centres vs native extraction, per shared guid,
    // after removing any constant frame offset (a rigid-translation fit, NOT a naive cross-file compare).
    const common = Object.keys(mTruth).filter(g => nTruth[g]);
    const d = common.map(g => [nTruth[g].ix - mTruth[g].ix, nTruth[g].iy - mTruth[g].iy, nTruth[g].iz - mTruth[g].iz]);
    const mu = [0, 1, 2].map(k => d.reduce((s, v) => s + v[k], 0) / (d.length || 1));
    const res = d.map(v => Math.sqrt((v[0] - mu[0]) ** 2 + (v[1] - mu[1]) ** 2 + (v[2] - mu[2]) ** 2));
    const rMax = Math.max(...res, 0), rMean = res.reduce((s, v) => s + v, 0) / (res.length || 1);
    console.log(`§MV-PARITY-T anchorSemantics common=${common.length} frameOffset=(${mu.map(fmt).join(',')}) residualMax=${fmt(rMax)} residualMean=${fmt(rMean)}`);
    chk(`T1 ANCHOR-SEMANTICS ≡ NATIVE (center_xyz is the placement anchor; residual ≤ ${TOL_T} m on ${common.length} shared elements)`, common.length > 200 && rMax <= TOL_T, `residualMax=${fmt(rMax)}`);

    // T2 — the finding: modeller LIVE placement (Leg M measured) vs the anchor ground truth, same file.
    const rows = [];
    for (const g in legM.per) { if (mTruth[g]) rows.push({ guid: g, dc: dist3(legM.per[g], mTruth[g]), cls: (legM.rows.find(r => r.guid === g) || {}).cls || '?' }); }
    const s2 = dcStats(rows);
    console.log(`§MV-PARITY-M-TRUTH joined=${rows.length} maxDisp=${fmt(s2.max)} meanDisp=${fmt(s2.mean)} — modeller ARC-seed recentring vs anchor ground truth`);
    s2.top5.forEach(o => console.log(`§MV-PARITY-M-TRUTH-OFFENDER guid=${o.guid} disp=${fmt(o.dc)} class=${o.cls}`));
    chk(`T2 MODELLER ≡ GROUND TRUTH (maxDisp ≤ ${TOL_T} m) — was the deliberate RED (maxDisp 18.03 m); green = the §ARC-ANCHOR fold fix holds`, s2.max <= TOL_T, `maxDisp=${fmt(s2.max)} meanDisp=${fmt(s2.mean)}`);
  }

  // ════ Leg V — Viewer on the SAME modeller file ════
  console.log('═══ W-MV-PARITY Leg V — Viewer opens the SAME modeller/Duplex_extracted.db → invert Y-up/offset → same element_transforms ═══');
  let legV, vErrs = [];
  {
    // RAW attempt first — the raw modeller file has no elements_meta.building column
    let { pg, errs, clog, ready } = await openViewer(br, '/modeller/Duplex_extracted.db', 'MV-PARITY-V-RAWLOAD');
    let ext = await extractViewer(pg).catch(e => ({ rendered: 0, joined: 0, triExact: 0, rows: [], per: {}, placeholders: -1, batchedUnresolved: -1, err: String(e) }));
    let usedFixture = false;
    if (!ext.rendered) {
      const why = clog.filter(t => /CENTRES_QUERY_ERROR|HELPERS_QUERY_ERR|DS_EMPTY|BLOB_MISS/.test(t)).slice(0, 3).join(' || ');
      console.log(`§MV-PARITY-V-RAW rendered=0 — REAL FINDING: viewer cannot stream the raw modeller extraction (elements_meta lacks the building column its stream query requires). console: ${why}`);
      await pg.close();
      // runtime fixture: byte-copy + ADD ONLY the building label column (no geometry/transform rows touched)
      const fix = path.join(FIXDIR, 'Duplex_modeller_bld.db');
      fs.copyFileSync(path.join(ROOT, 'modeller', 'Duplex_extracted.db'), fix);
      const fdb = new Database(fix);
      fdb.exec("ALTER TABLE elements_meta ADD COLUMN building TEXT; UPDATE elements_meta SET building='Duplex';");
      fdb.close();
      usedFixture = true;
      ({ pg, errs, clog, ready } = await openViewer(br, '/fixtures/Duplex_modeller_bld.db', 'MV-PARITY-V-FIXLOAD'));
      ext = await extractViewer(pg).catch(e => ({ rendered: 0, joined: 0, triExact: 0, rows: [], per: {}, placeholders: -1, batchedUnresolved: -1, err: String(e) }));
    }
    legV = ext; legV.usedFixture = usedFixture; vErrs = errs;
    const s = dcStats(legV.rows);
    // anchor-corrected spatial: viewer rendered centre vs (center + R·blobCentre) — the semantics Leg T proved.
    // maxDC vs raw center_xyz is ALSO logged: under anchor semantics it measures each blob's local-origin
    // offset (max ≈18 m on this file), NOT a rendering error.
    const aRows = []; for (const g in legV.per) { if (mTruth[g]) aRows.push({ guid: g, dc: dist3(legV.per[g], mTruth[g]), cls: '?' }); }
    const sa = dcStats(aRows);
    console.log(`§MV-PARITY-V building=Duplex file=${usedFixture ? 'FIXTURE(+building col)' : 'raw modeller db'} rendered=${legV.rendered} joined=${legV.joined} maxDC=${fmt(s.max)} meanDC=${fmt(s.mean)} maxDCanchor=${fmt(sa.max)} meanDCanchor=${fmt(sa.mean)} triExact=${legV.triExact}/${legV.joined} placeholders=${legV.placeholders} batchedUnresolved=${legV.batchedUnresolved} kinds=inst:${legV.instSlots}/batch:${legV.batchSlots}/mesh:${legV.plainMeshes} streamed=${legV.streamed} active=${legV.active} ready=${ready}`);
    s.top5.forEach(o => console.log(`§MV-PARITY-V-OFFENDER guid=${o.guid} dcVsCenter=${fmt(o.dc)} class=${o.cls} tris=${o.tris} dbTris=${o.dbTris} kind=${o.kind}`));

    chk('V1 JOIN+SPATIAL (viewer on the modeller file: joined>0, anchor-corrected maxDC ≤ ' + TOL_V + ' m)', legV.joined > 0 && aRows.length > 200 && sa.max <= TOL_V, `joined=${legV.joined}/${legV.rendered} maxDCanchor=${fmt(sa.max)}`);
    chk('V-NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));
    await pg.close();
  }

  // ════ Leg X — cross-app, same file, DB space ════
  console.log('═══ W-MV-PARITY Leg X — Modeller centre vs Viewer centre per guid (SAME modeller file, both in RAW DB space) ═══');
  {
    const xr = [];
    for (const guid in legM.per) {
      const a = legM.per[guid], b = legV.per[guid];
      if (!b) continue;
      xr.push({ guid, dc: Math.sqrt((a.ix - b.ix) ** 2 + (a.iy - b.iy) ** 2 + (a.iz - b.iz) ** 2), cls: (legM.rows.find(r => r.guid === guid) || {}).cls || '?' });
    }
    const s = dcStats(xr);
    const denom = Math.min(Object.keys(legM.per).length, Object.keys(legV.per).length);
    console.log(`§MV-PARITY-X joined=${xr.length}/${denom} maxDC=${fmt(s.max)} meanDC=${fmt(s.mean)}`);
    s.top5.forEach(o => console.log(`§MV-PARITY-X-OFFENDER guid=${o.guid} dc=${fmt(o.dc)} class=${o.cls}`));
    chk('X1 CROSS-APP SPATIAL (joined>0, maxDC ≤ ' + TOL_X + ' m) — was the second deliberate RED (18.03 m), same root cause as T2; green = both apps agree per-element', xr.length > 0 && s.max <= TOL_X, `joined=${xr.length}/${denom} maxDC=${fmt(s.max)}`);
  }

  // ════ Leg V2 — Viewer LOD400 on its NATIVE file ════
  console.log('═══ W-MV-PARITY Leg V2 — Viewer on its native buildings/Duplex_extracted.db → rendered tris vs component_geometries ═══');
  {
    const { pg, errs, ready } = await openViewer(br, 'buildings/Duplex_extracted.db', 'MV-PARITY-V2-LOAD');
    const ext = await extractViewer(pg).catch(e => ({ rendered: 0, joined: 0, triExact: 0, rows: [], per: {}, placeholders: -1, batchedUnresolved: -1, err: String(e) }));
    const s = dcStats(ext.rows);
    const aRows = []; for (const g in ext.per) { if (nTruth[g]) aRows.push({ guid: g, dc: dist3(ext.per[g], nTruth[g]), cls: '?' }); }
    const sa = dcStats(aRows);
    console.log(`§MV-PARITY-V2 building=${ext.active} rendered=${ext.rendered} joined=${ext.joined} maxDC=${fmt(s.max)} meanDC=${fmt(s.mean)} maxDCanchor=${fmt(sa.max)} meanDCanchor=${fmt(sa.mean)} triExact=${ext.triExact}/${ext.joined} placeholders=${ext.placeholders} batchedUnresolved=${ext.batchedUnresolved} kinds=inst:${ext.instSlots}/batch:${ext.batchSlots}/mesh:${ext.plainMeshes} streamed=${ext.streamed} ready=${ready}`);
    s.top5.forEach(o => console.log(`§MV-PARITY-V2-OFFENDER guid=${o.guid} dcVsCenter=${fmt(o.dc)} class=${o.cls} tris=${o.tris} dbTris=${o.dbTris} kind=${o.kind}`));
    chk('V2 LOD400 (native file: joined>0, triExact=n/n, placeholders=0 after stream)', ext.joined > 0 && ext.triExact === ext.joined && ext.placeholders === 0, `triExact=${ext.triExact}/${ext.joined} placeholders=${ext.placeholders}`);
    chk('V2 SPATIAL (anchor-corrected maxDC ≤ ' + TOL_V + ' m on ' + aRows.length + ' joined)', aRows.length > 1000 && sa.max <= TOL_V, `maxDCanchor=${fmt(sa.max)} meanDCanchor=${fmt(sa.mean)}`);
    chk('V2-NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));
    await pg.close();
  }

  await br.close(); server.close();
  try { fs.rmSync(FIXDIR, { recursive: true, force: true }); } catch (e) {}
  console.log('W-MV-PARITY: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('W-MV-PARITY FATAL', e); server.close(); process.exit(1); });
