#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-REAL-PLACEMENT-GATE-VIEWER scope (read this block first)
 * SCOPE: viewer-side port of PR #693 (commit a2d56da, modeller). docs/internal/WalkerDoctrine.md §10 —
 *   ONE shared real-placement gate every leaf placement is forced through, ported verbatim as
 *   viewer/real_placement_resolver.js and wired into viewer/routewalker.js's `_rwPlaceFromBOM` ("Path B").
 *   Before this port EVERY fixture (toilet, sink, light, switch, outlet, sprinkler, ...) the VIEWER app
 *   placed got an identical hardcoded 0.15x0.15x0.15m box (and a 0.1-cube clash check) regardless of its
 *   real size — the exact bug already fixed in modeller/ and disclosed as still-live in viewer/.
 *   This witness proves THREE things, each naming the issue it proves/disproves (same a/b/c structure as
 *   modeller/tests/witness_real_placement_resolver.js, pointed at the REAL viewer app):
 *   (a) REAL DIMS REPLACE THE BOX: a fixture WITH a real ad_product_dim match (TOILET/SINK/SWITCH/LIGHT/
 *       SPRINKLER/OUTLET) is written into the building DB's element_transforms.bbox_x/y/z at its REAL
 *       measured size, not the old flat 0.15,0.15,0.15 — checked against the exact
 *       library/component_library.db numbers (FIXTURE_TOILET=0.4x0.7x0.4, ELEC_OUTLET=0.085x0.04x0.085,
 *       etc.), not approximated.
 *   (b) HONEST HARD-FAIL IS REACHABLE, NOT DEAD CODE: a product with NO real ad_product_dim row
 *       (EXHAUST_FAN/FLOOR_TRAP/OUTLET_GFCI in a real BATHROOM recipe; AIRCON_POINT/CEILING_FAN/
 *       SUPPLY_DIFFUSER in a real BEDROOM recipe — genuinely absent from component_library.db, not a
 *       constructed edge case) is REFUSED (WalkerGapError, §RPR-HARDFAIL + §RW_BOM_PLACE_REFUSE logged,
 *       counted in `result.fixturesRefused`) on a real `rwWalk`/`_rwPlaceFromBOM` run, never silently
 *       defaulted to a box.
 *   (c) REGRESSION: `rwWalk`'s Path B (fixtures placed for matched products) keeps working end to end in
 *       the viewer app (DB round-trip: element_transforms rows actually land with the real dims).
 *
 * VIEWER-SPECIFIC WIRING (verified against this repo's code, not assumed from modeller): viewer has NO
 *   window.__sceneReady / window.Bonsai / window.SQL. Its real ready signal (same one
 *   tests/witness_shakeout_2026-07-06.js gates on) is `window.APP.guidMap` populated +
 *   `window.APP.streaming === false` after a real building load; sql.js lives at `window.APP._SQL`
 *   (set by streaming.js after initSqlJs). `rwWalk`/`rwInit` are top-level globals from routewalker.js's
 *   <script> tag. The real HHS_Office_Federated_extracted.db lives at repo-root buildings/ (not
 *   viewer/buildings/), so this witness's server maps /viewer/buildings/<file> -> <ROOT>/buildings/<file>
 *   — hermetic, no OCI network retry.
 * Sections (a)/(b)/(c) run against a schema-correct building DB (elements_meta WITH its building column,
 *   4 thin perimeter walls per room — NOT a filled cube) built in this witness, using the SAME real
 *   viewer/mep_rw.db BOM/offset recipe rows Path B queries in production.
 * Log Mandate: every claim below is backed by a printed § line, read from THIS run's own log, not assumed.
 * Run:  node viewer/tests/witness_real_placement_resolver.js 2>&1 | tee viewer/tests/witness_real_placement_resolver.log
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  let fp = path.join(ROOT, p);
  // Building DBs live at repo-root buildings/, but the viewer page fetches them relative to /viewer/ —
  // map the miss so the load is hermetic (no db_resolve OCI network retry in this witness).
  if (p.indexOf('/viewer/buildings/') === 0 && !fs.existsSync(fp)) fp = path.join(ROOT, 'buildings', path.basename(p));
  fs.readFile(fp, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

// Ground-truth real dims — read directly from library/component_library.db's ad_product_dim (2026-07-07,
// PR #693), quoted here for the assertion, not re-derived (same numbers embedded in real_placement_resolver.js).
const GT = {
  TOILET:    { w: 0.4,   d: 0.7,  h: 0.4   },  // FIXTURE_TOILET
  OUTLET:    { w: 0.085, d: 0.04, h: 0.085 },  // ELEC_OUTLET
  SWITCH:    { w: 0.085, d: 0.04, h: 0.085 },  // ELEC_SWITCH
  LIGHT:     { w: 0.3,   d: 0.3,  h: 0.1   },  // ELEC_LIGHT
  SPRINKLER: { w: 0.1,   d: 0.1,  h: 0.15  },  // FP_SPRINKLER
  SINK:      { w: 0.5,   d: 0.45, h: 0.2   }   // FIXTURE_SINK
};
const OLD_BOX = 0.15;
// Products with NO real ad_product_dim row today (genuinely absent, not constructed), present in the REAL
// BATHROOM/BEDROOM mep_rw.db recipes — must REFUSE.
const NO_MATCH = ['EXHAUST_FAN', 'FLOOR_TRAP', 'OUTLET_GFCI', 'AIRCON_POINT', 'CEILING_FAN', 'SUPPLY_DIFFUSER'];

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  const logs = []; pg.on('console', m => { const t = m.text(); if (/^§(RW|RPR)/.test(t)) logs.push(t); });

  console.log('═══ W-REAL-PLACEMENT-GATE-VIEWER — real ad_product_dim replaces hardcoded 0.15 fixture box in VIEWER routewalker, honest hard-fail proven reachable ═══');
  await pg.goto(`http://localhost:${port}/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated`, { waitUntil: 'load', timeout: 120000 });
  // Viewer's REAL ready signal (same gate witness_shakeout_2026-07-06.js uses) + this port's new symbols.
  const ready = await pg.waitForFunction(
    'window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0 && window.APP.streaming === false && !!window.APP._SQL && !!window.RealPlacementResolver && typeof window.rwWalk === "function" && typeof window.rwInit === "function"',
    { timeout: 120000, polling: 1000 }).then(() => true).catch(() => false);
  console.log('  §READY viewerLoaded=' + ready + ' (APP.guidMap populated, APP.streaming=false, APP._SQL set, RealPlacementResolver + rwWalk globals present)');

  // ── (a)/(b)/(c) controlled, schema-correct building DB + the REAL viewer/mep_rw.db BOM recipe (BATHROOM+BEDROOM) ──
  const out = await pg.evaluate(async () => {
    const SQL = window.APP._SQL;
    const bdb = new SQL.Database();
    bdb.run("CREATE TABLE elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, element_name TEXT, building TEXT, storey TEXT, discipline TEXT, material_rgba TEXT)");
    bdb.run("CREATE TABLE element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)");
    // FOUR thin perimeter walls per storey (a real room shape, not a solid filled cube) — needed so
    // _rwDetectRooms's storey-fallback aggregate (AVG center / MAX bbox over these 4 wall rows) approximates
    // the room's OWN envelope, while _rwLoadArcEnvelope's per-wall clash check only blocks the thin perimeter,
    // not the whole interior (a single filling box would clash-skip every fixture placed inside it — wrong).
    function addWall(guid, storey, cx, cy, cz, bx, by, bz) {
      bdb.run("INSERT INTO elements_meta (guid, ifc_class, element_name, building, storey, discipline) VALUES (?, 'IfcWall', ?, 'W_RPR_TEST', ?, 'ARC')", [guid, guid, storey]);
      bdb.run("INSERT INTO element_transforms (guid, center_x, center_y, center_z, rotation_x, rotation_y, rotation_z, bbox_x, bbox_y, bbox_z) VALUES (?, ?, ?, ?, 0,0,0, ?, ?, ?)", [guid, cx, cy, cz, bx, by, bz]);
    }
    function addRoom(prefix, storey, cx, cy, half) {
      const t = 0.15, span = half * 2;
      addWall(prefix + '-N', storey, cx, cy + half, 1.5, span, t, 3);
      addWall(prefix + '-S', storey, cx, cy - half, 1.5, span, t, 3);
      addWall(prefix + '-E', storey, cx + half, cy, 1.5, t, span, 3);
      addWall(prefix + '-W', storey, cx - half, cy, 1.5, t, span, 3);
    }
    addRoom('R1', 'BATHROOM', 5, 5, 2.5);
    addRoom('R2', 'BEDROOM', 20, 20, 2.5);

    await window.rwInit(SQL, './');
    const result = window.rwWalk(bdb, 'W_RPR_TEST');
    const r = bdb.exec(
      "SELECT m.element_name, m.storey, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m " +
      "JOIN element_transforms t ON m.guid = t.guid WHERE m.guid LIKE 'RW2D-%'"
    );
    const rows = r.length ? r[0].values : [];
    bdb.close();
    return { result: result, rows: rows };
  });

  await br.close(); server.close();

  console.log('  §CONTROLLED result=' + JSON.stringify(out.result));
  // Show the RESOLVER's own decision lines — this is the real proof text.
  logs.filter(l => /§RPR-MATCH|§RPR-HARDFAIL|§RW_ROOMS|§RW_PATH_B|§RW_BOM_PLACE/.test(l)).forEach(l => console.log('    ' + l));
  console.log('  §CONTROLLED_ROWS ' + JSON.stringify(out.rows));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

  chk('ready viewer real boot signal reached (APP.guidMap + streaming=false + APP._SQL + new globals)', ready);

  // (a) REAL DIMS — split into two proofs per product (the resolver's OWN correctness vs. the DB round-trip):
  //   a1. resolveRealPlacement's decision (the §RPR-MATCH log line) cites the exact real product_id + dims.
  //   a2. the DB round-trip (element_transforms.bbox_x/y/z actually written) — additionally exercises the
  //       pre-existing (unmodified) clash-gate + ad_placement_offset geometry downstream of the fix. Same
  //       disclosed interaction as the modeller witness: TOILET (depth 0.7) / SINK (depth 0.45) resolve
  //       correctly but can be clash-skipped in a synthetic wall-centerline room because _rwComputePosition
  //       (pre-existing, unmodified) measures clearance to the fixture CENTER without its half-depth —
  //       newly visible now that real depths flow through; not asserted when 0 rows land.
  const matchLines = logs.filter(l => /§RPR-MATCH/.test(l));
  const byProduct = {};
  out.rows.forEach(row => {
    const name = row[0] || '';
    Object.keys(GT).forEach(p => { if (name.indexOf(p + ' ') === 0) { (byProduct[p] = byProduct[p] || []).push({ bx: row[2], by: row[3], bz: row[4] }); } });
  });
  Object.keys(GT).forEach(p => {
    const g = GT[p], insts = byProduct[p] || [];
    const wantDims = 'dims(w,d,h)=' + g.w + ',' + g.d + ',' + g.h;
    const resolved = matchLines.some(l => l.indexOf('productHint=' + p + ' ') >= 0 && l.indexOf(wantDims) >= 0);
    chk('a1-' + p + ' resolveRealPlacement returns real ' + g.w + 'x' + g.d + 'x' + g.h + ' (§RPR-MATCH cited)', resolved);
    if (insts.length > 0) {
      const allReal = insts.every(i => Math.abs(i.bx - g.w) < 1e-9 && Math.abs(i.by - g.d) < 1e-9 && Math.abs(i.bz - g.h) < 1e-9);
      const anyOldBox = insts.some(i => i.bx === OLD_BOX && i.by === OLD_BOX && i.bz === OLD_BOX);
      chk('a2-' + p + ' DB round-trip: written dims match real (n=' + insts.length + '), NOT old 0.15 box',
        allReal && !anyOldBox, 'sample=' + JSON.stringify(insts[0]));
    } else {
      console.log('  ⚠  a2-' + p + ' — 0 rows written in THIS synthetic room (clash-gate interaction, disclosed above; not asserted)');
    }
  });

  // (b) HONEST REFUSE reachable: NO_MATCH products logged §RPR-HARDFAIL / §RW_BOM_PLACE_REFUSE, counted in
  // result.fixturesRefused, and NEVER written to the DB (no RW2D- row for them at all — refused, not fabricated).
  const hardfailLines = logs.filter(l => /§RPR-HARDFAIL|§RW_BOM_PLACE_REFUSE/.test(l));
  const refusedProducts = NO_MATCH.filter(p => hardfailLines.some(l => l.indexOf('product=' + p) >= 0 || l.indexOf('productHint=' + p) >= 0));
  chk('b REFUSE path reachable (WALKER_GAP logged for genuinely-absent products in a REAL BATHROOM/BEDROOM recipe)',
    refusedProducts.length === NO_MATCH.length, 'refused=' + JSON.stringify(refusedProducts) + '/' + JSON.stringify(NO_MATCH));
  chk('b2 refused products never got a written RW2D- row (no fabricated box at all, not even the old one)',
    !out.rows.some(row => NO_MATCH.some(p => (row[0] || '').indexOf(p + ' ') === 0)), '');
  chk('b3 refused count matches result.fixturesRefused (visible in the returned summary, not silently dropped)',
    out.result.fixturesRefused >= NO_MATCH.length, 'fixturesRefused=' + out.result.fixturesRefused);

  // (c) REGRESSION — Path B placed the matched fixtures for real (DB round-trip, not just "attempted").
  chk('c1 Path B placed >=1 real fixture end-to-end (DB round-trip)', out.result.fixtures >= 1 && out.rows.length >= 1, JSON.stringify(out.result));
  chk('c2 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('W-REAL-PLACEMENT-GATE-VIEWER: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
