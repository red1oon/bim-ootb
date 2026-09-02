// ⚠ DO NOT REMOVE — Scope guard
// W-MERGE-SAVE-ROUNDTRIP — prompts/LTU_TERMINAL_CLINIC_RENDER_CORRUPTION.md §U
//
// THE ISSUE THIS TEST EXPOSES (user report, 2026-08-30, verbatim): "Can open the meta/geo DBs and
// then add another IFC in this case ARC which was intentionally left out to test LTU. But when
// saving the merged one, which is extracted DB and reopening, it still does not has the merged ARC."
//
// Three defects in ONE chain, all reproduced here on REAL LTU_AHouse data shapes:
//   1. GEO FOLD DIES ON A TABLE-NAME MISMATCH. _mergeTable() only folds a table present on BOTH
//      sides. The scene's geo.db carries `base_geometries`; a client-side IFC import carries
//      `component_geometries` (import_db_builder.js:66). Neither name exists on both sides, so the
//      incoming geometry is folded NOWHERE — silently, visible only as §MERGE_TABLES skipped=[...].
//   2. THE CENTRES QUERY IS UNGUARDED. _mergeDbIntoScene/_mergeSplitDbIntoScene hardcode
//      `GROUP BY m.building`, but LTU_AHouse_meta.db's elements_meta HAS NO `building` COLUMN
//      (streaming.js:26-31 / CPE_4D_PERF_MEM_FINDINGS §R6 already measured this). The query throws,
//      is swallowed, added=[] — so the merged building is never registered and never streams.
//   3. `building` IS DISCARDED ON THE WAY IN. _mergeTable's destination-driven column intersection
//      drops the source's `building` value when the destination lacks the column, so even a
//      successful merge cannot say which rows are the new building.
//
// PHASE A  Open LTUish_meta.db + LTUish_geo.db as a split pair (the "LTU minus ARC" scene).
// PHASE B  Merge ARCimport.db (verbatim import_db_builder.js schema) — assert geometry ACTUALLY
//          folds and the new building registers.
// PHASE C  THE USER'S ACTUAL COMPLAINT: A._exportBuildingDb() → reopen those exact bytes → assert
//          the ARC elements AND their resolvable geometry survive the round-trip.
//
// §-log first — READ tests/witness_merge_save_roundtrip_2026-08-30.log before any conclusion.
// Fixtures are built by scripts/make_merge_roundtrip_fixtures.py, EXTRACTED from the real shipped
// buildings/LTU_AHouse_{meta,geo}.db — no invented rows, no invented schema.
// Run:  timeout 600 node viewer/tests/witness_merge_save_roundtrip_2026-08-30.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_ROOT = '/home/red1/bim-ootb';
const FX = process.env.FX || '/tmp/claude-1000/-home-red1-bim-compiler/44cdbb2b-5d15-48a2-a387-baa2b66d404a/scratchpad/fx';
const META = path.join(FX, 'LTUish_meta.db');
const GEO  = path.join(FX, 'LTUish_geo.db');
const ARC  = path.join(FX, 'ARCimport.db');
const ARC_BUILDING = 'LTU_AHouse_ARC';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  const send = (buf) => { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); };
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (!e) return send(buf);
    fs.readFile(path.join(DATA_ROOT, p), (e2, buf2) => {
      if (!e2) return send(buf2);
      res.writeHead(404); res.end('404 ' + p);
    });
  });
});

const log = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function save() { fs.writeFileSync(path.join(__dirname, 'witness_merge_save_roundtrip_2026-08-30.log'), log.join('\n') + '\n'); }

async function waitReady(page, secs) {
  let ready = false;
  for (let i = 0; i < (secs || 120) && !ready; i++) {
    await page.waitForTimeout(1000);
    try {
      ready = await page.evaluate(() => !!(window.APP && window.APP.guidMap
        && Object.keys(window.APP.guidMap).length > 0 && window.APP.streaming === false));
    } catch (e) {}
  }
  return ready;
}

async function openFiles(page, filePaths) {
  await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) { window.showOpenFilePicker = undefined; } });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.evaluate(() => { window.APP.openModelDb(); }),
  ]);
  await chooser.setFiles(filePaths);
}

(async () => {
  for (const f of [META, GEO, ARC]) {
    if (!fs.existsSync(f)) { S('❌ missing fixture ' + f + ' — run scripts/make_merge_roundtrip_fixtures.py first'); save(); process.exit(1); }
  }
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => cons.push(m.text()));
  page.on('pageerror', e => cons.push('PAGEERROR ' + e.message));
  const grep = (needle) => cons.filter(l => l.indexOf(needle) >= 0);

  S('── W-MERGE-SAVE-ROUNDTRIP — witness_merge_save_roundtrip_2026-08-30 ──');
  S('   ISSUE: merge an IFC into an open split-DB scene, SAVE, REOPEN — does the merged building survive?');

  // ══ PHASE A — open the "LTU minus ARC" split pair ═══════════════════════════════════════════
  S('\n── PHASE A: open LTUish_meta.db + LTUish_geo.db (split pair, elements_meta has NO `building` column) ──');
  await page.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html', { waitUntil: 'networkidle' });
  await waitReady(page, 30);
  cons.length = 0;
  await openFiles(page, [META, GEO]);
  try {
    await page.waitForSelector('#merge-modal', { state: 'visible', timeout: 5000 });
    S('     [note] a default building was auto-loaded — clicking New to force replace');
    await page.click('#merge-new-btn');
  } catch (e) { /* nothing open — straight replace */ }
  const readyA = await waitReady(page, 90);
  verdict(readyA, 'split pair loaded + streaming complete');
  if (!readyA) {
    S('   [console tail] ' + cons.slice(-40).join('\n     '));
    S('\n❌ ABORT — Phase A never became ready'); save(); await browser.close(); server.close(); process.exit(1);
  }
  const stateA = await page.evaluate(() => {
    const A = window.APP;
    const q = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values[0][0] : null; } catch (e) { return null; } };
    const tbls = (db) => { try { const r = db.exec("SELECT name FROM sqlite_master WHERE type='table'"); return r.length ? r[0].values.map(v => v[0]) : []; } catch (e) { return []; } };
    return {
      metaCount: q(A.db, 'SELECT COUNT(*) FROM elements_meta'),
      hasBuildingCol: !!(A._hasBuildingCol && A._hasBuildingCol(A.db)),
      libIsDb: A.libDb === A.db,
      dbTables: tbls(A.db),
      libTables: A.libDb ? tbls(A.libDb) : null,
      centres: Object.keys(A.buildingCentres || {}),
    };
  });
  verdict(stateA.metaCount === 300, 'scene loaded the 300 non-ARC elements from META', 'metaCount=' + stateA.metaCount);
  verdict(stateA.hasBuildingCol === false, 'fixture faithfully reproduces LTU: elements_meta has NO `building` column', 'hasBuildingCol=' + stateA.hasBuildingCol);
  verdict(stateA.libTables && stateA.libTables.indexOf('base_geometries') >= 0, 'scene geometry lives in `base_geometries` (server split shape)', 'libTables=' + JSON.stringify(stateA.libTables));
  S('     [state] centres=' + JSON.stringify(stateA.centres) + ' libIsDb=' + stateA.libIsDb);

  // ══ PHASE B — merge the import-shaped ARC DB ════════════════════════════════════════════════
  S('\n── PHASE B: Open→Merge ARCimport.db (import_db_builder.js shape: component_geometries + `building`) ──');
  cons.length = 0;
  await openFiles(page, [ARC]);
  await page.waitForSelector('#merge-modal', { state: 'visible', timeout: 30000 });
  await page.click('#merge-btn');
  let mergeDone = null;
  for (let i = 0; i < 120 && !mergeDone; i++) { await page.waitForTimeout(1000); mergeDone = grep('§MERGE_DONE')[0]; }
  S('     [console] ' + (grep('§MERGE_START')[0] || 'no §MERGE_START'));
  const tablesLine = grep('§MERGE_TABLES')[0] || '';
  S('     [console] ' + (tablesLine || 'no §MERGE_TABLES'));
  grep('§MERGE_ROWS').forEach(l => S('     [console] ' + l));
  S('     [console] ' + (grep('§MERGE_CENTRES')[0] || 'no §MERGE_CENTRES'));
  grep('§MERGE_CENTRES_FAIL').forEach(l => S('     [console] ' + l));
  verdict(!!mergeDone, '§MERGE_DONE emitted', mergeDone || 'never');
  if (!mergeDone) { S('\n❌ ABORT — merge never completed'); S('   ' + cons.slice(-25).join('\n     ')); save(); await browser.close(); server.close(); process.exit(1); }

  // DEFECT 1 — the geometry fold
  // ⚠ must match inside folded=[...] ONLY — the first cut of this matched the whole line and so
  // went GREEN while `component_geometries` sat in skipped=[...], i.e. while the defect was live.
  const foldedArr = (tablesLine.match(/folded=(\[[^\]]*\])/) || [])[1] || '[]';
  verdict(/"component_geometries"/.test(foldedArr),
    'DEFECT 1: incoming `component_geometries` is in folded=[...] (old code left it in skipped=[...])', 'folded=' + foldedArr);
  // DEFECT 2 — the centres query
  // dbQuery swallows the throw internally, so §MERGE_CENTRES_FAIL never fires — the honest signal
  // that the `GROUP BY m.building` query died is §HELPERS_QUERY_ERR (+ the added=[] below).
  const bldErr = cons.filter(l => /HELPERS_QUERY_ERR|no such column: m\.building/.test(l));
  verdict(!bldErr.length,
    'DEFECT 2: the centres query did not blow up on a DB with no `building` column',
    bldErr[0] || 'no m.building query error');
  const centresLine = grep('§MERGE_CENTRES')[0] || '';
  verdict(centresLine.indexOf(ARC_BUILDING) >= 0,
    'DEFECT 2: the merged building was actually REGISTERED as a new centre', centresLine);

  const stateB = await page.evaluate((BLD) => {
    const A = window.APP;
    const q = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values[0][0] : null; } catch (e) { return 'ERR'; } };
    const geoRows = (db) => {
      if (!db) return null;
      let n = 0;
      for (const t of ['component_geometries', 'base_geometries']) {
        const v = q(db, 'SELECT COUNT(*) FROM "' + t + '"');
        if (typeof v === 'number') n += v;
      }
      return n;
    };
    return {
      metaCount: q(A.db, 'SELECT COUNT(*) FROM elements_meta'),
      arcRows: q(A.db, "SELECT COUNT(*) FROM elements_meta WHERE building='" + BLD + "'"),
      hasBuildingCol: !!(A._hasBuildingCol && A._hasBuildingCol(A.db)),
      dbGeo: geoRows(A.db), libGeo: geoRows(A.libDb),
      centres: Object.keys(A.buildingCentres || {}),
    };
  }, ARC_BUILDING);
  verdict(stateB.metaCount === 420, 'all 120 ARC elements folded into elements_meta', 'metaCount=' + stateB.metaCount + ' (expected 420)');
  // DEFECT 3 — the building label
  verdict(stateB.arcRows === 120,
    'DEFECT 3: merged rows kept their `building` value (destination gained the column)', 'arcRows=' + stateB.arcRows);
  verdict((stateB.libGeo || 0) + (stateB.dbGeo || 0) >= 237 + 45,
    'DEFECT 1: live scene now holds BOTH geometry sets', 'dbGeo=' + stateB.dbGeo + ' libGeo=' + stateB.libGeo + ' (expected >= 282)');
  S('     [state] centres=' + JSON.stringify(stateB.centres));

  // ══ PHASE C — THE USER'S COMPLAINT: save, then reopen ══════════════════════════════════════
  S('\n── PHASE C: A._exportBuildingDb() → reopen those exact bytes (the "save and reopen" the user reported broken) ──');
  const roundTrip = await page.evaluate((BLD) => {
    const A = window.APP;
    const bytes = A._exportBuildingDb();
    if (!bytes) return { err: 'export returned null' };
    const SQL = A._SQL || A.citySQL || A._citySQL;
    const re = new SQL.Database(new Uint8Array(bytes));
    const q = (sql) => { try { const r = re.exec(sql); return r.length ? r[0].values : []; } catch (e) { return [['ERR:' + e.message]]; } };
    const one = (sql) => { const v = q(sql); return v.length ? v[0][0] : null; };
    const tables = (q("SELECT name FROM sqlite_master WHERE type='table'") || []).map(v => v[0]);
    const geoTables = tables.filter(t => t === 'component_geometries' || t === 'base_geometries');
    // Every geometry_hash reachable in the reopened DB, across BOTH geometry table names.
    const hashUnion = geoTables.map(t => 'SELECT geometry_hash FROM "' + t + '"').join(' UNION ');
    const out = {
      bytes: bytes.byteLength, tables: tables, geoTables: geoTables,
      metaCount: one('SELECT COUNT(*) FROM elements_meta'),
      arcMeta: one("SELECT COUNT(*) FROM elements_meta WHERE building='" + BLD + "'"),
      arcRenderable: hashUnion ? one(
        "SELECT COUNT(*) FROM elements_meta m JOIN element_instances i ON i.guid=m.guid " +
        "WHERE m.building='" + BLD + "' AND i.geometry_hash IN (" + hashUnion + ")") : 0,
      sceneRenderable: hashUnion ? one(
        "SELECT COUNT(*) FROM elements_meta m JOIN element_instances i ON i.guid=m.guid " +
        "WHERE m.building<>'" + BLD + "' AND i.geometry_hash IN (" + hashUnion + ")") : 0,
    };
    re.close();
    return out;
  }, ARC_BUILDING);
  if (roundTrip.err) {
    verdict(false, 'export produced bytes', roundTrip.err);
  } else {
    S('     [saved] bytes=' + roundTrip.bytes + ' geoTables=' + JSON.stringify(roundTrip.geoTables));
    S('     [saved] tables=' + JSON.stringify(roundTrip.tables));
    verdict(roundTrip.metaCount === 420, 'reopened DB has all 420 elements (300 scene + 120 ARC)', 'metaCount=' + roundTrip.metaCount);
    verdict(roundTrip.arcMeta === 120, 'reopened DB still knows which 120 rows are the merged ARC building', 'arcMeta=' + roundTrip.arcMeta);
    verdict(roundTrip.arcRenderable === 120,
      'THE USER\'S BUG: every merged ARC element resolves to real geometry in the SAVED file', 'arcRenderable=' + roundTrip.arcRenderable + '/120');
    verdict(roundTrip.sceneRenderable === 300,
      'the ORIGINAL scene geometry also survived the save (no regression on the half that already worked)', 'sceneRenderable=' + roundTrip.sceneRenderable + '/300');
  }

  S('\n── VERDICT ──');
  S('   ' + (fails === 0 ? '🟢 W-MERGE-SAVE-ROUNDTRIP PASS' : '🔴 W-MERGE-SAVE-ROUNDTRIP FAIL (' + fails + ' failed assertion(s))'));
  save();
  await browser.close(); server.close();
  process.exit(fails === 0 ? 0 : 1);
})();
