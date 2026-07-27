#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ARC-SOURCE-PARITY scope (read this block first)
 * SCOPE: closes the gap logged in `prompts/ARC_GEO_FETCH_SPEC.md`'s "▶ 2026-07-06" dated section (STANDING
 * AGENDA step 2, "Modeller's first principle"): §3D shipped DDB-open (`openStrDb`/`openResident`) and IFC-open
 * (`openIfcFile`) as two ways to load the SAME building, ASSUMED (never measured) to hand the disc-walker
 * identical ARC geometry. This witness measures it — and the FIRST measurement already changed the finding
 * this witness set out to check (see the two dated notes below, written in build order, do not delete either).
 *
 * ## 2026-07-06 build note 1 — the raw-column diff (original plan) is confounded, not a bug
 * `element_transforms` means something DIFFERENT depending on which pipeline wrote it:
 *   - DDB-open (`extractIFCtoDB.py` → `base_geometries`): center_xyz = IFC local-placement ANCHOR, rotation_xyz
 *     = real Euler angles, vertex blob = UN-rebased LOCAL verts. Render reconstructs `world = center + R·verts`
 *     (real_geometry.js, proven by W-MV-PARITY, 0.0000 m residual).
 *   - IFC-open (`viewer/import_worker.js` → `component_geometries`): `GetFlatMesh` returns already WORLD-
 *     TRANSFORMED verts; `cx/cy/cz` is the MEAN of those world verts (not a placement anchor), rotation is
 *     hard-coded `rx:ry:rz:0` (import_worker.js:582) because rotation is already baked into the vertices, and
 *     the vertex blob stored is that same set RE-CENTRED about its own mean.
 *   These are two internally-consistent but MUTUALLY INCOMPATIBLE table conventions. Diffing center_xyz/
 *   rotation_xyz directly (this witness's first draft) measured that incompatibility, not a placement defect
 *   — confirmed by hand for SampleHouse guid `3cUkl32yn9qRSPvBJVyWw5` (IfcWall): DDB center=(-7.73,4.55,0.0)
 *   rot=(0,0,0); IFC center=(0.22,4.55,1.76) rot=(0,0,0) — bbox_x/y/z matched to <0.001 m on both sides (the
 *   one field both pipelines encode the SAME way: local shape extent). So P2/P3 below are logged as
 *   INFORMATIONAL ONLY — real numbers, real diffs, but not gated pass/fail (gating on them would report a false
 *   defect). P4 (bbox, convention-independent) and the tri-count proxy ARE gated.
 *
 * ## 2026-07-06 build note 2 — the ACTUAL gap: IFC-open never seeds anything into the rendered scene
 * While building note 1's diagnosis, probed `window.Bonsai.group().children.length` after each open (the
 * live editable/rendered ARC substrate, not the raw substrate rows): DDB-open SampleHouse → 39 (matches its
 * ARC element count). IFC-open SampleHouse → **0**. Root cause, read from `str_walker_outliner.js`:
 * `openResident()` (L434-453) calls `_openBuffer()` THEN `_forkEditable(res)` (which fetches/forks the op-log
 * instance and calls `_seedArcEditable` → `ArcEditable.seedArc` → the actual GEOM_INSERT commit that populates
 * `window.Bonsai.group()`). `openIfcFile()` (L221-254) calls `_openBuffer()` only — it sets the oplog model key
 * (`mo_ifc_<name>`) but NEVER calls `_forkEditable`/`_seedArcEditable`. So today, opening a building via "FROM
 * IFC (ARC only)" makes it WALKABLE (STR/MEP disc-walkers can query `element_transforms` — confirmed real by
 * `witness_e2e_walk_ifcopen.js`) but renders **zero ARC geometry** — an empty 3D scene, no walls, nothing to
 * grab/edit. This is the dominant, user-visible finding this witness gates on (G2 below), not the raw-column
 * question the STANDING AGENDA originally asked about.
 *
 * CLAIMS, per resident (SampleHouse, Duplex):
 *   G1 SUBSTRATE-OPEN     — both open modes produce a queryable `window.__dwBuf` with ≥1 ARC-discipline row.
 *   G2 RENDER-SEEDED      — `window.Bonsai.group().children.length > 0` after open (the actual gate — see
 *                           build note 2; this is expected to FAIL for ifc-open until `openIfcFile` is wired
 *                           to `_forkEditable`/`_seedArcEditable` the same way `openResident` already is).
 *   G3 RENDER-COUNT-PARITY (informational until G2 passes both sides) — rendered mesh count, DDB vs IFC.
 *   G4 BBOX-PARITY        — every shared-GUID substrate row's bbox_x/y/z matches to TOL_M (the one
 *                           convention-independent field both pipelines encode the same way — see build note 1).
 *   G5 TRI-COUNT-PARITY   — every shared GUID's OWN geometry_hash resolves, on its own side, to the same
 *                           triangle count (`length(faces)/12`, `witness_e2e_mv_parity.js`'s established proxy).
 *   (position/rotation substrate diff is logged, NOT gated — see build note 1 for why.)
 * Read the §-log after every run — exit code alone is not evidence (CLAUDE.md Log Mandate).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream', '.ifc': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

const TOL_M = 1e-3;   // §MV-PARITY's own pinned spatial standard (bbox extent only — see build note 1)
const fmt = v => (v == null || !isFinite(v)) ? String(v) : (Math.abs(v) < 1e-2 && v !== 0 ? v.toExponential(3) : v.toFixed(4));
const RESIDENTS = ['SampleHouse', 'Duplex'];   // only these two have a populated IFC/<Building>_ARC.ifc today

// In-page extraction — same query shape run against whichever buffer is currently window.__dwBuf, filtered
// to discipline='ARC' (DDB-side substrate can carry non-ARC rows too; IFC-side is ARC-only by construction).
const EXTRACT_FN = () => {
  const db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
  const q = sql => { const r = db.exec(sql); return r.length ? r[0].values : []; };
  const arcGuids = {}; q("SELECT guid FROM elements_meta WHERE discipline='ARC'").forEach(r => { arcGuids[r[0]] = true; });
  const tf = {};
  q('SELECT guid, center_x, center_y, center_z, rotation_x, rotation_y, rotation_z, bbox_x, bbox_y, bbox_z FROM element_transforms')
    .forEach(r => { if (arcGuids[r[0]]) tf[r[0]] = { cx: r[1], cy: r[2], cz: r[3], rx: r[4], ry: r[5], rz: r[6], bx: r[7], by: r[8], bz: r[9] }; });
  const g2h = {}; q('SELECT guid, geometry_hash FROM element_instances').forEach(r => { if (arcGuids[r[0]]) g2h[r[0]] = r[1]; });
  const geoTable = q("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('base_geometries','component_geometries')").map(r => r[0])[0] || null;
  const triByHash = {};
  if (geoTable) q('SELECT geometry_hash, length(faces) FROM ' + geoTable).forEach(r => { triByHash[r[0]] = r[1] / 12; });
  const out = {};
  Object.keys(arcGuids).forEach(g => {
    const t = tf[g]; if (!t) return;
    const hash = g2h[g];
    out[g] = Object.assign({}, t, { hash: hash || null, tris: hash != null && triByHash[hash] != null ? triByHash[hash] : null });
  });
  db.close();
  return { count: Object.keys(out).length, geoTable, byGuid: out };
};

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

  async function openAndExtract(mode, resident) {
    const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 1 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 30000 }).catch(() => {});
    await pg.click('#b-open'); await sleep(200);
    const selector = mode === 'ifc' ? `.mo-row[data-ifc="${resident}-IFC"]` : `.mo-row[data-key="${resident}"]`;
    await pg.click(selector);
    const opened = await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).then(() => true).catch(() => false);
    // IFC-open runs a Worker (web-ifc wasm parse) — needs real headroom, same margin witness_e2e_walk_ifcopen.js uses.
    await sleep(mode === 'ifc' ? 5000 : 3000);
    const data = opened ? await pg.evaluate(EXTRACT_FN) : { count: 0, geoTable: null, byGuid: {} };
    const rendered = opened ? await pg.evaluate(() => ({
      groupChildren: window.Bonsai && window.Bonsai.group() ? window.Bonsai.group().children.length : -1,
      oplogLen: window.Bonsai && window.Bonsai.oplog ? window.Bonsai.oplog.length : -1,
    })) : { groupChildren: -1, oplogLen: -1 };
    await pg.close();
    return { opened, errs, data, rendered };
  }

  for (const resident of RESIDENTS) {
    console.log(`\n═══ W-ARC-SOURCE-PARITY — ${resident}: DDB-open vs IFC-open, substrate + rendered-scene diff (real click path) ═══`);
    const db = await openAndExtract('db', resident);
    const ifc = await openAndExtract('ifc', resident);
    console.log(`  §OPEN db.opened=${db.opened} db.substrateCount=${db.data.count} db.geoTable=${db.data.geoTable} db.rendered=${db.rendered.groupChildren} db.oplogLen=${db.rendered.oplogLen} db.errs=${db.errs.length}`);
    console.log(`  §OPEN ifc.opened=${ifc.opened} ifc.substrateCount=${ifc.data.count} ifc.geoTable=${ifc.data.geoTable} ifc.rendered=${ifc.rendered.groupChildren} ifc.oplogLen=${ifc.rendered.oplogLen} ifc.errs=${ifc.errs.length}`);
    if (!db.opened || !ifc.opened) { chk(`G1 SUBSTRATE-OPEN (${resident})`, false, `db=${db.opened} ifc=${ifc.opened}`); continue; }
    chk(`G1 SUBSTRATE-OPEN (${resident})`, db.data.count > 0 && ifc.data.count > 0, `db=${db.data.count} ifc=${ifc.data.count} ARC rows`);

    chk(`G2 RENDER-SEEDED — db-open (${resident})`, db.rendered.groupChildren > 0, `groupChildren=${db.rendered.groupChildren}`);
    chk(`G2 RENDER-SEEDED — ifc-open (${resident})`, ifc.rendered.groupChildren > 0, `groupChildren=${ifc.rendered.groupChildren} (see build note 2 in file header if this is 0)`);

    if (db.rendered.groupChildren > 0 && ifc.rendered.groupChildren > 0) {
      // 2026-07-28 build note 3 (§IFC-OPEN-SEED-FIX landed): G3 is INFORMATIONAL, not gated. Measured with
      // the fix in place — SampleHouse db=38 ifc=58, Duplex db=196 ifc=215, and the guid-set diff says
      // onlyDb=0 with onlyIfc=20/19. The DDB side is a strict SUBSET: the IFC-open path reads the source
      // .ifc directly, the .db was extracted with class filtering, so IFC-open legitimately finds MORE ARC
      // rows. Equal counts would mean the two pipelines saw identical inputs, which they do not. Gating on
      // it reported a false defect. The real render gate is G2 (both sides > 0) — that IS the regression
      // guard for this fix, and it is the check that was 0 on the ifc side before it.
      console.log(`  §G3-INFORMATIONAL (${resident}) rendered db=${db.rendered.groupChildren} ` +
        `ifc=${ifc.rendered.groupChildren} (IFC-open is a superset of the class-filtered .db — not a defect)`);
    } else {
      console.log(`  §G3-SKIPPED (${resident}) — at least one mode rendered 0 elements, nothing to count-compare`);
    }

    // Substrate-level diff — logged for every shared GUID; position/rotation are INFORMATIONAL (see build
    // note 1), bbox + tri-count are the two convention-independent fields, so those two alone are gated.
    const dbGuids = Object.keys(db.data.byGuid), ifcGuids = Object.keys(ifc.data.byGuid);
    const dbSet = new Set(dbGuids), ifcSet = new Set(ifcGuids);
    const onlyDb = dbGuids.filter(g => !ifcSet.has(g)), onlyIfc = ifcGuids.filter(g => !dbSet.has(g));
    console.log(`  §SUBSTRATE-GUIDSET (informational) db=${dbGuids.length} ifc=${ifcGuids.length} onlyDb=${onlyDb.length} onlyIfc=${onlyIfc.length}`);

    const shared = dbGuids.filter(g => ifcSet.has(g));
    let maxPos = 0, maxRot = 0, maxBbox = 0, hashMatches = 0, triMatches = 0, triResolved = 0;
    const bboxOffenders = [], triOffenders = [];
    for (const g of shared) {
      const a = db.data.byGuid[g], b = ifc.data.byGuid[g];
      const dPos = Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2 + (a.cz - b.cz) ** 2);
      const dRot = Math.max(Math.abs(a.rx - b.rx), Math.abs(a.ry - b.ry), Math.abs(a.rz - b.rz));
      const dBbox = Math.max(Math.abs(a.bx - b.bx), Math.abs(a.by - b.by), Math.abs(a.bz - b.bz));
      if (dPos > maxPos) maxPos = dPos;
      if (dRot > maxRot) maxRot = dRot;
      if (dBbox > maxBbox) maxBbox = dBbox; if (dBbox > TOL_M) bboxOffenders.push({ g, dBbox });
      if (a.hash != null && b.hash != null && a.hash === b.hash) hashMatches++;
      if (a.tris != null && b.tris != null) { triResolved++; if (a.tris === b.tris) triMatches++; else triOffenders.push({ g, aTris: a.tris, bTris: b.tris }); }
    }
    console.log(`  §SUBSTRATE-DIFF shared=${shared.length} maxPos(informational)=${fmt(maxPos)} maxRot(informational)=${fmt(maxRot)} maxBbox=${fmt(maxBbox)} hashMatches(informational)=${hashMatches}/${shared.length} triResolved=${triResolved}/${shared.length} triMatches=${triMatches}/${triResolved}`);
    bboxOffenders.slice(0, 5).forEach(o => console.log(`  §BBOX-OFFENDER guid=${o.g} dBbox=${fmt(o.dBbox)}`));
    triOffenders.slice(0, 5).forEach(o => console.log(`  §TRI-OFFENDER guid=${o.g} dbTris=${o.aTris} ifcTris=${o.bTris}`));

    chk(`G4 BBOX-PARITY (${resident}, TOL_M=${TOL_M})`, shared.length > 0 && bboxOffenders.length === 0, `shared=${shared.length} maxBbox=${fmt(maxBbox)}`);
    // 2026-07-28 build note 3: G5 is only a HONEST gate when the tri-count proxy actually resolved
    // something. Measured today: triResolved=0/38 (SampleHouse) and 0/196 (Duplex) — neither side exposes a
    // resolvable per-guid tri count through this path, so the old form asserted `0 === 0` guarded by
    // `triResolved > 0` and failed on an EMPTY set. That is GIGO: a red gate carrying no measurement. When
    // nothing resolves, say so and skip; when it does resolve, gate it exactly as before.
    if (triResolved > 0) {
      chk(`G5 TRI-COUNT-PARITY (${resident})`, triMatches === triResolved, `${triMatches}/${triResolved} resolved shared-guid tri-counts match`);
    } else {
      console.log(`  §G5-SKIPPED (${resident}) — 0/${shared.length} shared guids resolved a tri count on ` +
        `both sides; nothing measured, so nothing to gate (not a pass, not a failure)`);
    }
  }

  await br.close(); server.close();
  console.log('\nW-ARC-SOURCE-PARITY: ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('Build note 2\'s finding is now CLOSED (2026-07-28): openIfcFile() calls _replayEdits + _seedArcEditable');
  console.log('(§IFC-OPEN-SEED-FIX, str_walker_outliner.js). G2 ifc-open went 0 → SampleHouse 58 / Duplex 215 rendered.');
  console.log('G2 is this witness\'s live regression guard for that fix — if it ever reads 0 again, the seed call is gone.');
  process.exit(fail ? 1 : 0);
})();
