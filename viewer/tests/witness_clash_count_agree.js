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
//
// WO-20 (bim-compiler prompts/MOBILE_PERF.md §WO-20, 2026-11-28): the FALLBACK path — the SQL cross-join used until the R-tree is built
// (`_clashRtreeReady=false`) — must give the same answer as the R-tree walk. Legs (each judged per pair, population > 0 else INCONCLUSIVE):
//   K1  fallback list length (`_queryClashesPairAll`) == fallback count (`_countClashesAsync`, drained) == R-tree matrix count; the
//       fallback first page never holds a row below the pair's tolerance; `_clashExistsPerPair` == (matrix>0).
//   K2  the clash REPORT's number for the pair (`_exportClashReport`, reading the pair-count cache the fallback filled) == them.
//   K3  a count cached by the fallback is NOT served by the report when the pair's tolerance differs (cache key carries the tolerance).
//   R1  red control: the SAME K1 measured on FB_OLD_REF (the code before WO-20) must FAIL on >=1 pair; both numbers are printed.
// Env: OLD_REF (default 2993df25 = the R-tree code before the count fix) · FB_OLD_REF (default 03f67130 = the fallback code before WO-20)
//      · FB_MAX (default 8000: fallback legs run only on buildings up to this many elements; larger ones are judged on the R-tree legs only and say so)
//      · FLEET (comma list of DB paths) · LOG
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process');
const Database = require('/home/red1/bim-compiler/node_modules/better-sqlite3');
const { Witness } = require('../../witness_kit/contract');
const VIEWER = path.join(__dirname, '..');
const OLD_REF = process.env.OLD_REF || '2993df25';
const FB_OLD_REF = process.env.FB_OLD_REF || '03f67130';
const FB_MAX = +(process.env.FB_MAX || 8000);   // the SQL cross-join is O(n*m) (why the R-tree exists): fallback legs run only on buildings up to this many elements
const firstExisting = (...ps) => ps.find(p => fs.existsSync(p)) || ps[0];   // a /tmp worktree has no LFS DBs: fall back to the shared checkout's
const FLEET = (process.env.FLEET || [firstExisting(path.join(VIEWER, 'buildings', 'Duplex_extracted.db'), path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db')),
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
  db.exec('CREATE INDEX idx_meta_disc ON elements_meta(discipline); CREATE INDEX idx_meta_storey ON elements_meta(storey); CREATE INDEX idx_trans_cx ON element_transforms(center_x); CREATE INDEX idx_meta_guid ON elements_meta(guid); CREATE INDEX idx_trans_guid ON element_transforms(guid)');   // the 3 indexes _ensureClashIndexes builds before the fallback runs + the guid index the shipped DBs have (PRIMARY KEY autoindex)
  db.exec('CREATE VIRTUAL TABLE elements_rtree USING rtree(id, minX, maxX, minY, maxY, minZ, maxZ)');
  db.exec('INSERT INTO elements_rtree SELECT rowid, center_x - bbox_x/2, center_x + bbox_x/2, center_y - bbox_y/2, center_y + bbox_y/2, center_z - bbox_z/2, center_z + bbox_z/2 FROM element_transforms WHERE bbox_x IS NOT NULL');
  return db;
}
// the real measure.js + clash_matrix.js in a vm against the in-memory DB
function engine(db, ref, opts) {
  opts = opts || {};
  const queue = [];
  const quiet = { log() {}, warn() {}, error() {} };
  const A = { dbQuery: (s, p) => { const st = db.prepare(s); return st.reader ? st.raw().all(...(p || [])) : (st.run(...(p || [])), []); },
    status: { textContent: '' }, _hasBbox: true, camera: { position: { x: 1, y: 2, z: 3 } }, controls: { target: { x: 0, y: 0, z: 0 } } };
  const ctx = { console: quiet, performance, setTimeout(fn) { queue.push(fn); }, clearTimeout() {}, Date, Math, JSON, Object, Array, String, Number, Promise, URLSearchParams, encodeURIComponent,
    location: { origin: 'http://x', pathname: '/viewer/viewer.html', search: '?db=d' },
    document: { getElementById() { return null; }, createElement() { return { style: {} }; }, head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {} },
    navigator: { userAgent: 'node' }, localStorage: { getItem() { return null; }, setItem() {} }, A };
  const inert = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : inert, apply: () => inert, construct: () => inert });
  ctx.THREE = inert; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(src('measure.js', ref) + '\n;setupMeasure(A);', ctx, { filename: 'measure.js@' + (ref || 'HEAD') });
  vm.runInContext(src('clash_matrix.js', ref) + '\n;setupClashMatrix(A);', ctx, { filename: 'clash_matrix.js@' + (ref || 'HEAD') });
  if (opts.report) vm.runInContext(src('clash_report.js', ref) + '\n;setupClashReporter(A);', ctx, { filename: 'clash_report.js@' + (ref || 'HEAD') });
  A._clashIndexesReady = true; A._clashRtreeReady = !opts.fallback; A._ensureClashIndexes = function () {};
  if (opts.fallback) { A._clashRevealActive = true; A._clashListDiv = { querySelector() { return { textContent: '' }; } }; }   // the async fallback count only runs while the list is open
  A._drain = function () { let n = 0; while (queue.length) { queue.shift()(); if (++n > 1e6) throw new Error('drain runaway'); } };
  return A;
}
const tolOf = r => typeof r.tolerance_m === 'number' ? r.tolerance_m : 0.025;
const RULES = JSON.parse(src('clash_rules.json'));
const R = () => JSON.parse(JSON.stringify(RULES));
// FALLBACK measurement of one pair on one engine (rtree off): list, async count, first page, EXISTS
function fbMeasure(F, a, c, tol) {
  const listRows = F._queryClashesPairAll(R(), a, c) || [];
  F._clashPairBoxTotal = undefined; F._cachedPairCounts = null; F._countClashesAsync(R(), a, c); F._drain();
  const page = F._queryClashesPair(null, R(), a, c, 0) || [];
  const minPage = page.length ? Math.min.apply(null, page.map(x => x[8])) : null;
  return { list: listRows.length, count: F._clashPairBoxTotal, pageN: page.length, pageMinOverlap: minPage, pageBelowTol: page.filter(x => !(x[8] >= tol - 1e-12)).length };
}
// the clash REPORT's number per rule key, read from whatever pair-count cache the fallback filled
function reportCounts(F, rules) {
  let got = null; F._currentClashRules = rules; F._exportInProgress = false; F._reportPairCounts = null;
  F._buildExportHtml = function (r, b, d, st, pl, all, pc) { got = pc; };
  F._exportClashReport(); F._drain();
  return got;
}
const rows = [], exists = [];
log('§CCA start old=' + OLD_REF + ' fb_old=' + FB_OLD_REF + ' rules=' + RULES.clash_rules.length + ' fleet=' + FLEET.length);
for (const f of FLEET) {
  const b = path.basename(f, '.db');
  if (!fs.existsSync(f)) { log('§CCA ' + b + ' INCONCLUSIVE db missing ' + f); continue; }
  const db = openDb(f), An = engine(db, null), Ao = engine(db, OLD_REF);
  const Fn = engine(db, null, { fallback: true, report: true }), Fo = engine(db, FB_OLD_REF, { fallback: true, report: true });
  const nEl = db.prepare('SELECT COUNT(*) FROM elements_meta').raw().get()[0], fbOn = nEl <= FB_MAX;
  if (!fbOn) log('§CCA ' + b + ' fallback legs SKIPPED (' + nEl + ' elements > FB_MAX=' + FB_MAX + ') — R-tree legs only');
  const have = new Set(db.prepare('SELECT DISTINCT discipline FROM elements_meta').raw().all().map(x => x[0]));
  const bRows = [];
  for (const r of RULES.clash_rules) {
    const a = r.source.discipline, c = r.target.discipline, pair = a + '|' + c, tol = tolOf(r);
    if (!have.has(a) || !have.has(c)) continue;
    const nA = db.prepare("SELECT COUNT(*) FROM elements_meta WHERE discipline=?").raw().get(a)[0], nB = db.prepare("SELECT COUNT(*) FROM elements_meta WHERE discipline=?").raw().get(c)[0];
    An._clashDiscCache = {}; const matrix = An._countClashesRtree(null, R(), a, c);                         // the matrix pass: fresh rules, nothing clicked
    const stale = R(); stale._activeTolerance = 0.1; An._clashDiscCache = {};                               // another pair's click left a 'current' tolerance
    const matrixStale = An._countClashesRtree(null, stale, a, c);
    const listRows = An._queryClashesPairAll(R(), a, c) || [], list = listRows.length;
    let linkTol = null;
    if (listRows.length) { const rr = R(); An._currentClashRules = rr; const u = An._buildClashDeepLink(listRows[0]); linkTol = +((/[&#]tol=(\d+)/.exec(u) || [])[1]); }
    Ao._clashDiscCache = {}; const oldMatrix = Ao._countClashesRtree(null, R(), a, c);
    const fb = fbOn ? fbMeasure(Fn, a, c, tol) : {}, ofb = fbOn ? fbMeasure(Fo, a, c, tol) : {};                // K1 + its red control, same pair, same DB
    const row = { bld: b, pair, a, c, fbOn, tolMm: Math.round(tol * 1000), nA, nB, vacuous: !nA || !nB, matrix, matrixStale, list, linkTol, oldMatrix,
      fbList: fb.list, fbCount: fb.count, fbPageBelowTol: fb.pageBelowTol, oldFbList: ofb.list, oldFbCount: ofb.count };
    log('§CLASH_COUNT_AGREE ' + b + ' ' + pair + ' tol=' + row.tolMm + 'mm matrix=' + matrix + ' matrix_stale=' + matrixStale + ' list=' + list + ' link_tol=' + linkTol + ' old_matrix=' + oldMatrix + (row.vacuous ? ' VACUOUS' : ''));
    log('§CCA_FALLBACK ' + b + ' ' + pair + ' rtree=' + matrix + ' fb_list=' + fb.list + ' fb_count=' + fb.count + ' fb_page_below_tol=' + fb.pageBelowTol + ' | before-WO-20 fb_list=' + ofb.list + ' fb_count=' + ofb.count + (row.vacuous ? ' VACUOUS' : '') + (fbOn ? '' : ' FB_SKIPPED'));
    rows.push(row); bRows.push(row);
  }
  // K1 EXISTS: the matrix sphere (fallback LIMIT 1 probe) must say clash iff the R-tree count > 0
  const ex = fbOn ? Fn._clashExistsPerPair(null, R()) : {}, exOld = fbOn ? Fo._clashExistsPerPair(null, R()) : {};
  if (fbOn) bRows.filter(r => !r.vacuous).forEach(r => { const k = r.a + '|' + r.c; exists.push({ bld: r.bld, pair: r.pair, rtree: r.matrix > 0 ? 1 : 0, fb: ex[k], oldFb: exOld[k] }); });
  // K2 / K3: the report, with the fallback-filled cache. Cache filled by fallback counts under RULES (pairs with count>0 only judged).
  const fbRows = fbOn ? bRows.filter(r => !r.vacuous) : [];
  const rep = (F, rules) => { F._cachedPairCounts = null; fbRows.forEach(r => { F._clashPairBoxTotal = undefined; F._countClashesAsync(R(), r.a, r.c); F._drain(); }); return reportCounts(F, rules); };
  const repN = fbOn ? rep(Fn, R()) : null;                                   // same tolerance: the report must show the fallback's number
  const rules2 = R(); rules2.clash_rules.forEach(r => { r.tolerance_m = tolOf(r) + 0.2; });
  const repN2 = fbOn ? reportCounts(Fn, rules2) : null;                      // different tolerance, same cache: must NOT be served
  const repO = fbOn ? rep(Fo, R()) : null, repO2 = fbOn ? reportCounts(Fo, rules2) : null;
  fbRows.filter(r => r.matrix > 0).forEach(r => {
    const key = r.a + '|' + r.c, key2 = r.c + '|' + r.a;
    const pick = (m, k) => (m && (m[k] !== undefined ? m[k] : m[key2]));
    log('§CCA_REPORT ' + b + ' ' + r.pair + ' rtree=' + r.matrix + ' report=' + pick(repN, key) + ' report_at_other_tol=' + pick(repN2, key) + ' | before-WO-20 report=' + pick(repO, key) + ' report_at_other_tol=' + pick(repO2, key));
    r.report = pick(repN, key); r.reportOtherTol = pick(repN2, key); r.oldReport = pick(repO, key); r.oldReportOtherTol = pick(repO2, key);
  });
  db.close();
}
const judged = rs => rs.filter(r => !r.vacuous);
log('§CCA judged=' + judged(rows).length + ' of ' + rows.length);
// ---- predicates (shared by the invariants, the red control and the verdict line) ----
const fbj = rs => judged(rs).filter(r => r.fbOn);
const k1 = rs => fbj(rs).every(r => r.fbList === r.matrix && r.fbCount === r.matrix && r.fbPageBelowTol === 0) && exists.every(e => e.fb === e.rtree);
const k2 = rs => fbj(rs).filter(r => r.matrix > 0).every(r => r.report === r.matrix);
const k3 = rs => fbj(rs).filter(r => r.matrix > 0).every(r => r.reportOtherTol === undefined || r.reportOtherTol === null);
const k1pop = rs => fbj(rs).length > 0 && fbj(rs).some(r => r.matrix > 0) && exists.length > 0;
const k23pop = rs => fbj(rs).some(r => r.matrix > 0);
Witness('clash_count_agree')
  .population(() => rows)
  .schema({ type: 'object', required: ['bld', 'pair', 'tolMm', 'matrix', 'matrixStale', 'list', 'oldMatrix', 'fbOn'],
    properties: { matrix: { type: 'integer', minimum: 0 }, list: { type: 'integer', minimum: 0 }, fbList: { type: 'integer', minimum: 0 }, fbCount: { type: 'integer', minimum: 0 } } })
  .invariant('at least one pair judged (not all VACUOUS)', rs => judged(rs).length > 0)
  .invariant('at least one judged pair has clashes (else the agreement is unproven)', rs => judged(rs).some(r => r.list > 0))
  .invariant('matrix count == list length, every judged pair', rs => judged(rs).every(r => r.matrix === r.list))
  .invariant('matrix count does not depend on a left-over active tolerance', rs => judged(rs).every(r => r.matrixStale === r.matrix))
  .invariant('share link tol == the clash pair\'s own rule tolerance', rs => judged(rs).every(r => r.list === 0 || r.linkTol === r.tolMm))
  .invariant('RED reproduced: OLD code\'s matrix count != list on at least one pair', rs => judged(rs).some(r => r.oldMatrix !== r.list))
  .invariant('K1 fallback (rtree not ready): list == count == R-tree matrix, first page >= tol, EXISTS == (matrix>0); population > 0', rs => k1pop(rs) && k1(rs))
  .invariant('K2 the report\'s number for the pair == the fallback count == the matrix; population > 0', rs => k23pop(rs) && k2(rs))
  .invariant('K3 a fallback-cached count is not served to a report at a different tolerance; population > 0', rs => k23pop(rs) && k3(rs))
  .invariant('R1 RED reproduced: the fallback code BEFORE WO-20 (' + FB_OLD_REF + ') fails K1 on >=1 pair', rs => fbj(rs).some(r => r.oldFbList !== r.matrix || r.oldFbCount !== r.matrix) || exists.some(e => e.oldFb !== e.rtree))
  .redControl(rs => rs.map(r => Object.assign(r, { matrix: r.oldMatrix, fbList: r.oldFbList, fbCount: r.oldFbCount, report: r.oldReport, reportOtherTol: r.oldReportOtherTol })))
  .run(log);
{
  const st = (pop, ok) => !pop ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL';
  const bad = fbj(rows).filter(r => r.oldFbList !== r.matrix || r.oldFbCount !== r.matrix)[0];
  const exBad = exists.filter(e => e.oldFb !== e.rtree)[0];
  const rc = !fbj(rows).length ? 'INCONCLUSIVE' : (bad || exBad) ? 'detected' : 'NOT_DETECTED';
  if (bad) log('§CCA R1 red numbers: ' + bad.bld + ' ' + bad.pair + ' fallback code before WO-20 (' + FB_OLD_REF + '): list=' + bad.oldFbList + ' count=' + bad.oldFbCount + ' vs R-tree matrix=' + bad.matrix);
  else if (exBad) log('§CCA R1 red numbers: ' + exBad.bld + ' ' + exBad.pair + ' EXISTS before WO-20 = ' + exBad.oldFb + ' vs R-tree ' + exBad.rtree);
  log('§CCA_VERDICT K1=' + st(k1pop(rows), k1(rows)) + ' K2=' + st(k23pop(rows), k2(rows)) + ' K3=' + st(k23pop(rows), k3(rows)) + ' red_control=' + rc + ' judged=' + judged(rows).length + ' of ' + rows.length + ' fallback_judged=' + fbj(rows).length);
}
logStream.end();
