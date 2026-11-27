#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS W-CLASH-COUNT-AGREE (2026-11-28, bim-compiler prompts/MOBILE_PERF.md §2026-11-28 CLASH COUNT SPEC)
// Scope: one tolerance per clash pair, read from THAT pair's rule, for the matrix count, the list, the report and the share link.
// Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES (found by the FILM-M1 recording, 2026-11-27): the clash matrix said MEP|ARC 956 while the
// list header for the same pair said "Total: 501". Cause (code read): `_countClashesRtree` took `rules._activeTolerance || 0`
// — unset when the matrix counts (0 mm), or LEFT OVER from the last pair clicked — while the list used the pair's rule
// (25 mm). The share link took the FIRST rule's tolerance, not the clash's pair. Fix = `A._pairTolerance(rules, a, b)`.
// Per pair it records: matrix count (fresh rules), matrix count after another pair left a stale 0.1 m "active" tolerance,
// list length (`_queryClashesPairAll`), the link's tol, and the same matrix count from OLD code (origin/main).
// GREEN = matrix == list == stale-matrix on every judged pair, link tol == the pair's rule; RED reproduced = OLD code's
// matrix != list on at least one pair. VACUOUS per pair (a side has 0 elements) is not judged; no judged pair = FAIL.
// Env: OLD_REF (default origin/main) · FLEET (comma list of DB paths) · LOG
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process');
const Database = require('/home/red1/bim-compiler/node_modules/better-sqlite3');
const { Witness } = require('../../witness_kit/contract');
const VIEWER = path.join(__dirname, '..');
const OLD_REF = process.env.OLD_REF || 'origin/main';
const FLEET = (process.env.FLEET || [path.join(VIEWER, 'buildings', 'Duplex_extracted.db'),
  path.join(os.homedir(), 'bim-ootb', 'buildings', 'Terminal_meta.db'), path.join(os.homedir(), 'bim-ootb', 'buildings', 'Hospital_meta.db')].join(',')).split(',');
const LOG = process.env.LOG || path.join(__dirname, 'witness_clash_count_agree.log');
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const src = (rel, ref) => ref ? cp.execSync('git show ' + ref + ':viewer/' + rel, { cwd: VIEWER, maxBuffer: 64 << 20 }).toString() : fs.readFileSync(path.join(VIEWER, rel), 'utf8');

// in-memory copy of the tables the clash engine reads + the R-tree it builds (pattern: witness_clash_civil_pairs.js)
function openDb(file) {
  const db = new Database(':memory:');
  db.exec("ATTACH '" + file.replace(/'/g, "''") + "' AS s");
  db.exec('CREATE TABLE elements_meta AS SELECT guid, discipline, ifc_class, element_name, storey FROM s.elements_meta');
  db.exec('CREATE TABLE element_transforms AS SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM s.element_transforms');
  db.exec('DETACH s');
  db.exec('CREATE VIRTUAL TABLE elements_rtree USING rtree(id, minX, maxX, minY, maxY, minZ, maxZ)');
  db.exec('INSERT INTO elements_rtree SELECT rowid, center_x - bbox_x/2, center_x + bbox_x/2, center_y - bbox_y/2, center_y + bbox_y/2, center_z - bbox_z/2, center_z + bbox_z/2 FROM element_transforms WHERE bbox_x IS NOT NULL');
  return db;
}
// the real measure.js + clash_matrix.js in a vm against the in-memory DB
function engine(db, ref) {
  const quiet = { log() {}, warn() {}, error() {} };
  const A = { dbQuery: (s, p) => { const st = db.prepare(s); return st.reader ? st.raw().all(...(p || [])) : (st.run(...(p || [])), []); },
    status: { textContent: '' }, _hasBbox: true, camera: { position: { x: 1, y: 2, z: 3 } }, controls: { target: { x: 0, y: 0, z: 0 } } };
  const ctx = { console: quiet, performance, setTimeout() {}, clearTimeout() {}, Math, JSON, Object, Array, String, Number, Promise, URLSearchParams, encodeURIComponent,
    location: { origin: 'http://x', pathname: '/viewer/viewer.html', search: '?db=d' },
    document: { getElementById() { return null; }, createElement() { return { style: {} }; }, head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {} },
    navigator: { userAgent: 'node' }, localStorage: { getItem() { return null; }, setItem() {} }, A };
  const inert = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : inert, apply: () => inert, construct: () => inert });
  ctx.THREE = inert; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(src('measure.js', ref) + '\n;setupMeasure(A);', ctx, { filename: 'measure.js@' + (ref || 'HEAD') });
  vm.runInContext(src('clash_matrix.js', ref) + '\n;setupClashMatrix(A);', ctx, { filename: 'clash_matrix.js@' + (ref || 'HEAD') });
  A._clashIndexesReady = true; A._clashRtreeReady = true; A._ensureClashIndexes = function () {};
  return A;
}
const tolOf = r => typeof r.tolerance_m === 'number' ? r.tolerance_m : 0.025;
const RULES = JSON.parse(src('clash_rules.json'));
const rows = [];
log('§CCA start old=' + OLD_REF + ' rules=' + RULES.clash_rules.length + ' fleet=' + FLEET.length);
for (const f of FLEET) {
  const b = path.basename(f, '.db');
  if (!fs.existsSync(f)) { log('§CCA ' + b + ' INCONCLUSIVE db missing ' + f); continue; }
  const db = openDb(f), An = engine(db, null), Ao = engine(db, OLD_REF);
  const have = new Set(db.prepare('SELECT DISTINCT discipline FROM elements_meta').raw().all().map(x => x[0]));
  for (const r of RULES.clash_rules) {
    const a = r.source.discipline, c = r.target.discipline, pair = a + '|' + c, tol = tolOf(r);
    if (!have.has(a) || !have.has(c)) continue;
    const nA = db.prepare("SELECT COUNT(*) FROM elements_meta WHERE discipline=?").raw().get(a)[0], nB = db.prepare("SELECT COUNT(*) FROM elements_meta WHERE discipline=?").raw().get(c)[0];
    const R = () => JSON.parse(JSON.stringify(RULES));
    An._clashDiscCache = {}; const matrix = An._countClashesRtree(null, R(), a, c);                         // the matrix pass: fresh rules, nothing clicked
    const stale = R(); stale._activeTolerance = 0.1; An._clashDiscCache = {};                               // another pair's click left a 'current' tolerance
    const matrixStale = An._countClashesRtree(null, stale, a, c);
    const listRows = An._queryClashesPairAll(R(), a, c) || [], list = listRows.length;
    let linkTol = null;
    if (listRows.length) { const rr = R(); An._currentClashRules = rr; const u = An._buildClashDeepLink(listRows[0]); linkTol = +((/[&#]tol=(\d+)/.exec(u) || [])[1]); }
    Ao._clashDiscCache = {}; const oldMatrix = Ao._countClashesRtree(null, R(), a, c);
    const row = { bld: b, pair, tolMm: Math.round(tol * 1000), nA, nB, vacuous: !nA || !nB, matrix, matrixStale, list, linkTol, oldMatrix };
    log('§CLASH_COUNT_AGREE ' + b + ' ' + pair + ' tol=' + row.tolMm + 'mm matrix=' + matrix + ' matrix_stale=' + matrixStale + ' list=' + list + ' link_tol=' + linkTol + ' old_matrix=' + oldMatrix + (row.vacuous ? ' VACUOUS' : ''));
    rows.push(row);
  }
  db.close();
}
const judged = rs => rs.filter(r => !r.vacuous);
log('§CCA judged=' + judged(rows).length + ' of ' + rows.length);
Witness('clash_count_agree')
  .population(() => rows)
  .schema({ type: 'object', required: ['bld', 'pair', 'tolMm', 'matrix', 'matrixStale', 'list', 'oldMatrix'],
    properties: { matrix: { type: 'integer', minimum: 0 }, list: { type: 'integer', minimum: 0 } } })
  .invariant('at least one pair judged (not all VACUOUS)', rs => judged(rs).length > 0)
  .invariant('at least one judged pair has clashes (else the agreement is unproven)', rs => judged(rs).some(r => r.list > 0))
  .invariant('matrix count == list length, every judged pair', rs => judged(rs).every(r => r.matrix === r.list))
  .invariant('matrix count does not depend on a left-over active tolerance', rs => judged(rs).every(r => r.matrixStale === r.matrix))
  .invariant('share link tol == the clash pair\'s own rule tolerance', rs => judged(rs).every(r => r.list === 0 || r.linkTol === r.tolMm))
  .invariant('RED reproduced: OLD code\'s matrix count != list on at least one pair', rs => judged(rs).some(r => r.oldMatrix !== r.list))
  .redControl(rs => rs.map(r => Object.assign(r, { matrix: r.oldMatrix })))
  .run();
logStream.end();
