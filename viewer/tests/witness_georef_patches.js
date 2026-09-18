#!/usr/bin/env node
/* ⚠ WITNESS — W-GEOREF-PATCH, §GEOREF (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §3.3).
 *
 * THE ISSUE IT PROVES OR DISPROVES:
 *   Every shipped *_extracted.db predates the georef fix — Hospital_extracted.db's
 *   project_metadata holds building_name and import_date and nothing else, with no
 *   true_north_angle row at all. buildings/patches/<db>.sql carries the real values to a live
 *   user without a binary crossing the network. A patch file that is committed but does not
 *   actually apply, or applies and yields the wrong rows, is indistinguishable from a working one
 *   until someone opens the building — which is precisely how the original stub survived. This
 *   runs each patch through the SAME chunked-statement path viewer/scene.js A._applyPendingPatch
 *   uses, against a real copy of the real DB, and reads the rows back.
 *
 * IT ALSO GATES THE THREE THINGS A PATCH MUST NOT DO:
 *   - it must be IDEMPOTENT (the loader applies it on EVERY load, cache-hit included), so
 *     applying twice must leave the same single row per key;
 *   - it must not touch anything but project_metadata — asserted by counting elements_meta and
 *     element_transforms before and after;
 *   - it must leave the building actually usable by the consumer, so the sun compass is built
 *     against the patched DB and its readings are checked against the source-IFC values.
 *
 * NO-OP / VACUOUS / WRONG:
 *   VACUOUS: the *_extracted.db binaries are not in git (CLAUDE.md bans binary DB commits) — a
 *            checkout without a local copy judges nothing and prints INCONCLUSIVE, exit 2.
 *   NO-OP:   a patch that inserted nothing would fail the row-count assertion, not pass quietly.
 *   WRONG:   each expected value is quoted here from the source IFC named in the patch header.
 *
 * RUN: node viewer/tests/witness_georef_patches.js
 *      GEOREF_DB_DIR=/path/to/deploy/buildings node viewer/tests/witness_georef_patches.js
 */
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var SEP = '|~|';
var DB_DIR = process.env.GEOREF_DB_DIR || '/home/red1/bim-compiler/deploy/buildings';
var PATCH_DIR = path.join(__dirname, '..', 'buildings', 'patches');

// ── What each patch must produce. Quoted from the source IFC named in that patch's own header,
// which is the same value DAGCompiler/python/extractIFCtoDB.py `extract_georef` returns for it
// (bim-compiler scripts/witness_georef_extract.py asserts that side independently).
var EXPECT = {
  'SampleHouse_extracted.db': {
    true_north_angle: '0.000000', true_north_source: 'ifc_truenorth',
    site_latitude: '51.50015259', site_longitude: '-0.12623620',
    site_elevation_m: '0.0000', site_latlong_source: 'ifc_site' },
  'SampleCastle_extracted.db': {
    true_north_angle: '0.000000', true_north_source: 'ifc_truenorth',
    site_latitude: '52.15000000', site_longitude: '5.38333333',
    site_elevation_m: '20.0000', site_latlong_source: 'ifc_site' },
  'HHS_Office_Federated_extracted.db': {
    true_north_angle: '0', true_north_source: 'default_zero',
    site_latitude: '48.13300000', site_longitude: '11.58300000',
    site_elevation_m: '0.0000', site_latlong_source: 'ifc_site' },
  'Clinic_extracted.db': {
    true_north_angle: '0', true_north_source: 'default_zero',
    site_latitude: '42.35842896', site_longitude: '-71.05977631',
    site_elevation_m: '0.0000', site_latlong_source: 'ifc_site' },
  'Duplex_extracted.db': {
    true_north_angle: '0', true_north_source: 'default_zero',
    site_latitude: '41.87440000', site_longitude: '-87.63940000',
    site_elevation_m: '0.0000', site_latlong_source: 'ifc_site' }
};

function inconclusive(why) {
  console.log('§GEOREF_PATCH_WITNESS INCONCLUSIVE — ' + why + '. Nothing judged; not a PASS.');
  process.exit(2);
}
try { cp.execSync('sqlite3 -version', { stdio: 'ignore' }); }
catch (e) { inconclusive('the sqlite3 CLI is not installed'); }

// ── The SAME statement-aware chunker viewer/scene.js ships (A._runSqlChunked). Reproduced here
// rather than imported because scene.js is a browser module with no export surface; the point is
// that a patch must survive being split into ~500-statement batches at statement boundaries,
// which is what the real loader does (§PATCH_CHUNK — a single giant db.run() crashes the bundled
// sql-wasm.wasm). A patch whose statements this splits wrongly would fail here too.
function chunkStatements(sql) {
  var rawLines = sql.split('\n'), statements = [], stBuf = [];
  for (var li = 0; li < rawLines.length; li++) {
    var ln = rawLines[li];
    if (!ln.trim().length) continue;
    stBuf.push(ln);
    if (/;\s*$/.test(ln)) { statements.push(stBuf.join('\n')); stBuf = []; }
  }
  if (stBuf.length) statements.push(stBuf.join('\n'));
  return statements;
}

function sqlite(db, sql) {
  return cp.execFileSync('sqlite3', ['-noheader', '-separator', SEP, db],
                         { input: sql, maxBuffer: 1 << 28 }).toString();
}
// Apply one statement at a time and COUNT the failures instead of dying on the first.
// Why not just run the file: a patch file may already contain statements that fail against a
// particular copy of its DB, and that is a real, separate finding this witness must REPORT rather
// than either crash on or swallow. MEASURED 2026-09-18: the pre-existing
// HHS_Office_Federated_extracted.db.sql declares `spatial_structure` with 12 columns while the
// local copy of that DB has 13, so all ~2,200 of its INSERTs are rejected. That is not caused by
// the §GEOREF block and is not fixed here — it is printed, and it is exactly why the §GEOREF block
// is PREPENDED rather than appended (a sql.js db.run() stops at its first throw).
// Batches of 500 first — the same size the loader uses — and only a batch that FAILS is re-run one
// statement at a time to find out which ones. A flat per-statement loop spawns one sqlite3 process
// per statement and took ~2 minutes on the 2,244-statement HHS patch; this is seconds, and it
// still localises every failure. Batching is also closer to what the loader actually does.
function applyStatements(db, statements) {
  var failed = [], CHUNK = 500;
  for (var i = 0; i < statements.length; i += CHUNK) {
    var batch = statements.slice(i, i + CHUNK);
    try { sqlite(db, batch.join('\n')); continue; }
    catch (batchErr) { /* fall through and localise it */ }
    for (var j = 0; j < batch.length; j++) {
      try { sqlite(db, batch[j]); }
      catch (e) {
        var msg = (e.stderr ? e.stderr.toString() : e.message).split('\n')[0];
        failed.push({ index: i + j, msg: msg, head: batch[j].slice(0, 70).replace(/\s+/g, ' ') });
      }
    }
  }
  return failed;
}
function rows(db, sql) {
  var out = sqlite(db, sql).trim();
  return out ? out.split('\n').map(function (l) { return l.split(SEP); }) : [];
}

var fails = 0, checks = 0, judged = 0, tmps = [];
function truth(name, cond, detail) {
  checks++;
  if (!cond) fails++;
  console.log('  §GP ' + (cond ? 'ok   ' : 'WRONG') + ' ' + name + (detail ? '   ' + detail : ''));
}

console.log('§GEOREF_PATCH_WITNESS dbDir=' + DB_DIR + ' patches=' + PATCH_DIR);

Object.keys(EXPECT).forEach(function (dbName) {
  var patch = path.join(PATCH_DIR, dbName + '.sql');
  var db = path.join(DB_DIR, dbName);
  if (!fs.existsSync(patch)) { truth(dbName + ': patch file exists', false, patch); return; }
  if (!fs.existsSync(db)) {
    console.log('  §GP skip ' + dbName + ' — no local copy of the DB (binaries are not in git)');
    return;
  }
  judged++;
  var tmp = path.join(os.tmpdir(), 'wgp_' + process.pid + '_' + dbName);
  fs.copyFileSync(db, tmp);
  tmps.push(tmp);

  var before = {
    meta: rows(tmp, 'SELECT COUNT(*) FROM elements_meta;')[0][0],
    tr: rows(tmp, 'SELECT COUNT(*) FROM element_transforms;')[0][0]
  };

  var sql = fs.readFileSync(patch, 'utf8');
  var statements = chunkStatements(sql);
  truth(dbName + ': the patch parses into whole statements', statements.length > 0,
        statements.length + ' statements');
  var failed = applyStatements(tmp, statements);
  if (failed.length) {
    console.log('  §GP note ' + dbName + ': ' + failed.length + '/' + statements.length +
      ' PRE-EXISTING statements in this patch fail against this DB copy — NOT introduced by the ' +
      '§GEOREF block, and not fixed here. First: ' + failed[0].msg + ' | ' + failed[0].head);
  }
  // The §GEOREF block is the first thing in the file, so a pre-existing failure further down
  // cannot strand it. Assert that directly rather than inferring it from the row read-back.
  var geoFailures = failed.filter(function (f) { return f.index < 7; });
  truth(dbName + ': the §GEOREF block applied cleanly', geoFailures.length === 0,
        geoFailures.length ? JSON.stringify(geoFailures[0]) : '');

  var got = {};
  rows(tmp, "SELECT key,value FROM project_metadata;").forEach(function (r) { got[r[0]] = r[1]; });
  var want = EXPECT[dbName];
  Object.keys(want).forEach(function (k) {
    truth(dbName + ': ' + k, got[k] === want[k], 'got ' + JSON.stringify(got[k]) +
          ' want ' + JSON.stringify(want[k]));
  });

  // IDEMPOTENCE — the loader applies on every load, cache-hit included.
  applyStatements(tmp, statements);
  var after = {};
  rows(tmp, "SELECT key,value FROM project_metadata;").forEach(function (r) { after[r[0]] = r[1]; });
  var dupes = rows(tmp, "SELECT key,COUNT(*) FROM project_metadata GROUP BY key HAVING COUNT(*)>1;");
  truth(dbName + ': applying twice changes nothing', JSON.stringify(after) === JSON.stringify(got));
  truth(dbName + ': no duplicated keys after a second apply', dupes.length === 0,
        dupes.length ? JSON.stringify(dupes) : '');

  // It must not touch the model.
  var afterCounts = {
    meta: rows(tmp, 'SELECT COUNT(*) FROM elements_meta;')[0][0],
    tr: rows(tmp, 'SELECT COUNT(*) FROM element_transforms;')[0][0]
  };
  truth(dbName + ': element rows untouched',
        afterCounts.meta === before.meta && afterCounts.tr === before.tr,
        'elements_meta ' + before.meta + '->' + afterCounts.meta +
        ', element_transforms ' + before.tr + '->' + afterCounts.tr);

  // And the consumer must now work: the sun compass builds on the patched DB and reads back the
  // same coordinates. This is the end of the chain — a patch that lands rows the consumer cannot
  // use is not done.
  try {
    var setupSunPath = require(path.join(__dirname, '..', 'sun_path.js')).setupSunPath;
    var setupCpeSunCompass = require(path.join(__dirname, '..', 'cpe_sun_compass.js')).setupCpeSunCompass;
    global.window = global.window || {};
    if (!global.window.THREE) {
      function V3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
      V3.prototype.clone = function () { return new V3(this.x, this.y, this.z); };
      V3.prototype.project = function () { return new V3(0, 0, 0.5); };
      function Group() { this.children = []; this.name = ''; }
      Group.prototype.add = function (o) { this.children.push(o); };
      Group.prototype.traverse = function (fn) { this.children.forEach(fn); fn(this); };
      function BG() { this.points = []; }
      BG.prototype.setFromPoints = function (p) { this.points = p.slice(); return this; };
      BG.prototype.dispose = function () {};
      global.window.THREE = { Vector3: V3, Group: Group, BufferGeometry: BG,
        Line: function (g, m) { this.geometry = g; this.material = m; this.visible = true; },
        LineBasicMaterial: function (o) { this.opts = o; this.dispose = function () {}; } };
    }
    var A = { modelOffset: { x: 0, y: 0, z: 0 }, camera: {} };
    A.ifc2three = function (ix, iy, iz) { return { x: ix, y: iz, z: -iy }; };
    A.ifc2threeDir = function (ix, iy, iz) { return { x: ix, y: iz, z: -iy }; };
    A.three2ifcDir = function (x, y, z) { return { ix: x, iy: -z, iz: y }; };
    A.scene = { objs: [], add: function (o) { this.objs.push(o); }, remove: function () {} };
    A.dbQuery = function (q) { return rows(tmp, q.replace(/;?\s*$/, ';')); };
    var _log = console.log; console.log = function () {};
    setupSunPath(A); setupCpeSunCompass(A);
    var built = A.sunCompassBuild();
    console.log = _log;
    truth(dbName + ': the patched DB builds a sun compass', !!built);
    if (built) {
      truth(dbName + ': the compass reads the patched latitude',
            Math.abs(built.lat - parseFloat(want.site_latitude)) < 1e-8, 'lat=' + built.lat);
      truth(dbName + ': the compass reads the patched longitude',
            Math.abs(built.lon - parseFloat(want.site_longitude)) < 1e-8, 'lon=' + built.lon);
      var info = A.sunCompassAt(Date.UTC(2026, 5, 21, 12, 0));
      truth(dbName + ': and reports a sun for a real cursor', !!info,
            info ? 'az=' + info.azimuth.toFixed(1) + ' el=' + info.elevation.toFixed(1) : '');
    }
  } catch (e) {
    truth(dbName + ': the consumer runs against the patched DB', false, e.message);
  }
});

tmps.forEach(function (f) { try { fs.unlinkSync(f); } catch (e) {} });
if (judged === 0) inconclusive('VACUOUS — no local copy of any patched DB under ' + DB_DIR);
var verdict = fails === 0 ? 'PASS' : 'FAIL';
console.log('§GEOREF_PATCH_WITNESS ' + verdict + ' dbs=' + judged + '/' + Object.keys(EXPECT).length +
            ' checks=' + checks + ' wrong=' + fails);
process.exit(fails === 0 ? 0 : 1);
