#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS W-CLASH-COUNT-AGREE (2026-11-28, bim-compiler prompts/MOBILE_PERF.md §2026-11-28 CLASH COUNT SPEC + §WO-20)
// Scope: one tolerance per clash pair, read from THAT pair's rule, for the matrix count, the list, the report and the share link — and ONE method
// (the R-tree) at every moment: until the index is built, count / list / exists WAIT for it, they never count another way.
// Read the log after every run — the exit code is not evidence.
//
// ISSUE (found by the FILM-M1 recording, 2026-11-27): the clash matrix said MEP|ARC 956 while the list header for the same pair said "Total: 501".
// Cause: `_countClashesRtree` took `rules._activeTolerance || 0` — unset when the matrix counts (0 mm), or LEFT OVER from the last pair clicked —
// while the list used the pair's rule (25 mm). The share link took the FIRST rule's tolerance. Fix = `A._pairTolerance(rules, a, b)`.
// Per pair it records: matrix count (fresh rules), matrix count after another pair left a stale 0.1 m "active" tolerance, list length
// (`_queryClashesPairAll`), the link's tol, and the same matrix count from OLD code (OLD_REF). GREEN = matrix == list == stale-matrix on every
// judged pair, link tol == the pair's rule; RED reproduced = OLD code's matrix != list on >= 1 pair. A side with 0 elements is VACUOUS (not judged).
//
// WO-20 (designer ruling 2026-11-28): the SQL cross-join fallback used until the R-tree is built is DELETED. A call made before the index is
// ready awaits `A._whenClashIndexReady()` and then runs the R-tree path. Legs (each needs a non-empty population, else INCONCLUSIVE):
//   K1  `_clashRtreeReady=false` + a builder stub that flips ready after a tick: for EVERY judged pair, list length (`_queryClashesPairAll`) ==
//       count (`_countClashesAsync`) == the R-tree matrix count, the first page holds no row below the pair's tolerance, `_clashExistsPerPair`
//       == (matrix>0), and `§CLASH_WAIT_INDEX what=list|count|exists` was logged for each. ALL fleet buildings — nothing slow is left.
//   K2  the clash REPORT's number per pair (`_exportClashReport`, started not-ready) == the matrix count.
//   K3  a count cached at one tolerance is NOT served for another (report under rules+0.2 m == the R-tree count under those rules, and differs
//       from the first for >= 1 pair; the cache key carries the tolerance).
//   K4  while the index is not ready, no SQL statement joins `element_transforms a` to `element_transforms b` (spy on the db: the pattern is
//       the cross-join of the code that was deleted) — zero statements, and the R-tree statements DID run.
//   K5  the REAL builder with an R-tree that cannot be created: the call REJECTS with the builder's own message, the status line shows it,
//       the same call keeps rejecting (no restart loop), and nothing returns 0 / [] in its place.
//   R1  red control: the fallback code BEFORE WO-20 (FB_OLD_REF) run not-ready fails K1 on >= 1 pair; both numbers are printed.
//   R2  red control: the first fix's cross-join (fixtures/clash_crossjoin_fix1.js, frozen) put back in front of the R-tree path fails K4.
// Env: OLD_REF (default 2993df25 = R-tree code before the count fix) · FB_OLD_REF (default 03f67130 = the fallback code before WO-20)
//      · OLD_FB_MAX (default 8000: R1 runs the OLD O(n^2) fallback only on buildings up to this many elements) · FLEET (comma list of DB paths) · LOG
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process');
const Database = require('/home/red1/bim-compiler/node_modules/better-sqlite3');
const { Witness } = require('../../witness_kit/contract');
const crossJoinListSql = require('./fixtures/clash_crossjoin_fix1.js');
const VIEWER = path.join(__dirname, '..');
const OLD_REF = process.env.OLD_REF || '2993df25';
const FB_OLD_REF = process.env.FB_OLD_REF || '03f67130';
const OLD_FB_MAX = +(process.env.OLD_FB_MAX || 8000);
const firstExisting = (...ps) => ps.find(p => fs.existsSync(p)) || ps[0];   // a /tmp worktree has no LFS DBs: fall back to the shared checkout's
const FLEET = (process.env.FLEET || [firstExisting(path.join(VIEWER, 'buildings', 'Duplex_extracted.db'), path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db')),
  path.join(os.homedir(), 'bim-ootb', 'buildings', 'Terminal_meta.db'), path.join(os.homedir(), 'bim-ootb', 'buildings', 'Hospital_meta.db')].join(',')).split(',');
const LOG = process.env.LOG || path.join(__dirname, 'witness_clash_count_agree.log');
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const src = (rel, ref) => ref ? cp.execSync('git show ' + ref + ':viewer/' + rel, { cwd: VIEWER, maxBuffer: 64 << 20 }).toString() : fs.readFileSync(path.join(VIEWER, rel), 'utf8');

// in-memory copy of the tables the clash engine reads + the R-tree it builds (pattern: witness_clash_civil_pairs.js)
function openDb(file, noRtree) {
  const db = new Database(':memory:');
  db.exec("ATTACH '" + file.replace(/'/g, "''") + "' AS s");
  db.exec('CREATE TABLE elements_meta AS SELECT guid, discipline, ifc_class, element_name, storey FROM s.elements_meta');
  db.exec('CREATE TABLE element_transforms AS SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM s.element_transforms');
  db.exec('DETACH s');
  db.exec('CREATE INDEX idx_meta_disc ON elements_meta(discipline); CREATE INDEX idx_meta_storey ON elements_meta(storey); CREATE INDEX idx_trans_cx ON element_transforms(center_x); CREATE INDEX idx_meta_guid ON elements_meta(guid); CREATE INDEX idx_trans_guid ON element_transforms(guid)');   // only the OLD fallback leg (R1) needs them: the shipped DBs index guid (PRIMARY KEY autoindex)
  if (noRtree) return db;
  db.exec('CREATE VIRTUAL TABLE elements_rtree USING rtree(id, minX, maxX, minY, maxY, minZ, maxZ)');
  db.exec('INSERT INTO elements_rtree SELECT rowid, center_x - bbox_x/2, center_x + bbox_x/2, center_y - bbox_y/2, center_y + bbox_y/2, center_z - bbox_z/2, center_z + bbox_z/2 FROM element_transforms WHERE bbox_x IS NOT NULL');
  return db;
}
// the real measure.js + clash_matrix.js (+ clash_report.js) in a vm against the in-memory DB
//   opts.notReady  : _clashRtreeReady=false + a builder STUB that flips ready after a tick (the real builder is exercised by K5)
//   opts.realBuilder: the REAL _ensureClashIndexes against opts.sqlJs (a sql.js-shaped db) — K5
//   opts.oldFallback: pre-WO-20 code (sync API, SQL fallback) with the R-tree off — R1
function engine(db, ref, opts) {
  opts = opts || {};
  const queue = [], waits = [], sqlLog = [];
  const cap = (...a) => { const l = a.join(' '); if (l.indexOf('§CLASH_WAIT_INDEX') === 0) waits.push(l); };
  const cons = { log: cap, warn: cap, error() {} };
  const A = { dbQuery: (s, p) => { sqlLog.push({ sql: s, ready: !!A._clashRtreeReady }); const st = db.prepare(s); return st.reader ? st.raw().all(...(p || [])) : (st.run(...(p || [])), []); },
    status: { textContent: '' }, _hasBbox: true, camera: { position: { x: 1, y: 2, z: 3 } }, controls: { target: { x: 0, y: 0, z: 0 } } };
  const ctx = { console: cons, performance, setTimeout(fn) { queue.push(fn); }, clearTimeout() {}, Date, Math, JSON, Object, Array, String, Number, Promise, Error, URLSearchParams, encodeURIComponent,
    location: { origin: 'http://x', pathname: '/viewer/viewer.html', search: '?db=d' },
    document: { getElementById() { return null; }, createElement() { return { style: {} }; }, head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {} },
    navigator: { userAgent: 'node' }, localStorage: { getItem() { return null; }, setItem() {} }, A };
  const inert = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : inert, apply: () => inert, construct: () => inert });
  ctx.THREE = inert; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(src('measure.js', ref) + '\n;setupMeasure(A);', ctx, { filename: 'measure.js@' + (ref || 'HEAD') });
  vm.runInContext(src('clash_matrix.js', ref) + '\n;setupClashMatrix(A);', ctx, { filename: 'clash_matrix.js@' + (ref || 'HEAD') });
  vm.runInContext(src('clash_report.js', ref) + '\n;setupClashReporter(A);', ctx, { filename: 'clash_report.js@' + (ref || 'HEAD') });
  A.__waits = waits; A.__sql = sqlLog;
  A.__drain = function () { let n = 0; while (queue.length) { queue.shift()(); if (++n > 1e6) throw new Error('drain runaway'); } };
  if (opts.realBuilder) { A.db = opts.sqlJs; A._clashRtreeReady = false; return A; }                        // K5: nothing stubbed — the real builder runs
  A._clashIndexesReady = true; A._ensureClashIndexes = function () {};
  if (opts.oldFallback) {                                                                                     // R1: old code, R-tree off, the list open (its async count only ran then)
    A._clashRtreeReady = false; A._clashRevealActive = true; A._clashListDiv = { querySelector() { return { textContent: '' }; } };
    return A;
  }
  if (opts.notReady) {                                                                                        // K1-K4: the index is "still building" until a tick passes
    A.db = {}; A._clashRtreeReady = false;
    A._ensureClashIndexes = function () { setTimeout(function () { A._clashRtreeReady = true; A._clashIndexSettle(); }, 0); };   // node's own timer: a builder stub that flips ready after a tick
    A.__unready = function () { A._clashRtreeReady = false; };
    return A;
  }
  A._clashRtreeReady = true;
  return A;
}
// run the engine's queued (vm) timers while a promise settles
async function pump(A, p) {
  let st = 'pending', v, e; p.then(x => { st = 'ok'; v = x; }, x => { st = 'err'; e = x; });
  while (st === 'pending') { A.__drain(); await new Promise(r => setImmediate(r)); }
  if (st === 'err') throw e; return v;
}
const tolOf = r => typeof r.tolerance_m === 'number' ? r.tolerance_m : 0.025;
const RULES = JSON.parse(src('clash_rules.json'));
const R = () => JSON.parse(JSON.stringify(RULES));
const CROSS_JOIN = s => /element_transforms\s+a\b/i.test(s) && /element_transforms\s+b\b/i.test(s);
const waitKinds = A => A.__waits.map(l => (/what=(\w+)/.exec(l) || [])[1]);

// K1 on the NEW code: not ready, every entry point waits for the stub builder, then the R-tree runs
async function waitMeasure(F, a, c, tol) {
  F.__waits.length = 0;
  F.__unready(); const listRows = await pump(F, F._queryClashesPairAll(R(), a, c));
  F.__unready(); F._clashPairBoxTotal = undefined; F._cachedPairCounts = null; const count = await pump(F, F._countClashesAsync(R(), a, c));
  F.__unready(); const page = await pump(F, F._queryClashesPair(null, R(), a, c, 0));
  return { list: listRows.length, count, pageBelowTol: page.filter(x => !(x[8] >= tol - 1e-12)).length, waits: waitKinds(F).slice() };
}
// R1: the code BEFORE WO-20 (sync API, SQL cross-join fallback) measured the way the old witness did
function oldFbMeasure(F, a, c) {
  const listRows = F._queryClashesPairAll(R(), a, c) || [];
  F._clashPairBoxTotal = undefined; F._cachedPairCounts = null; F._countClashesAsync(R(), a, c); F.__drain();
  return { list: listRows.length, count: F._clashPairBoxTotal };
}
// the report's number per rule key, started NOT ready
async function reportCounts(F, rules) {
  let resolveFn; const done = new Promise(r => { resolveFn = r; });
  F._buildExportHtml = function (r, b, d, st, pl, all, pc) { resolveFn(pc); };
  F._exportInProgress = false; F._currentClashRules = rules; F._reportPairCounts = null;
  F.__unready(); F._exportClashReport();
  return pump(F, done);
}

(async () => {
  const rows = [], exists = [], bld = [];
  let r2 = null, k5 = null;
  log('§CCA start old=' + OLD_REF + ' fb_old=' + FB_OLD_REF + ' rules=' + RULES.clash_rules.length + ' fleet=' + FLEET.length);
  for (const f of FLEET) {
    const b = path.basename(f, '.db');
    if (!fs.existsSync(f)) { log('§CCA ' + b + ' INCONCLUSIVE db missing ' + f); continue; }
    const db = openDb(f), An = engine(db, null), Ao = engine(db, OLD_REF);
    const Fn = engine(db, null, { notReady: true });
    const nEl = db.prepare('SELECT COUNT(*) FROM elements_meta').raw().get()[0], oldOn = nEl <= OLD_FB_MAX;
    const Fo = oldOn ? engine(db, FB_OLD_REF, { oldFallback: true }) : null;
    if (!oldOn) log('§CCA ' + b + ' R1 old-fallback leg SKIPPED (' + nEl + ' elements > OLD_FB_MAX=' + OLD_FB_MAX + ', the old cross-join is O(n^2)) — K1-K5 still run here');
    const have = new Set(db.prepare('SELECT DISTINCT discipline FROM elements_meta').raw().all().map(x => x[0]));
    const bRows = [];
    for (const r of RULES.clash_rules) {
      const a = r.source.discipline, c = r.target.discipline, pair = a + '|' + c, tol = tolOf(r);
      if (!have.has(a) || !have.has(c)) continue;
      const nA = db.prepare("SELECT COUNT(*) FROM elements_meta WHERE discipline=?").raw().get(a)[0], nB = db.prepare("SELECT COUNT(*) FROM elements_meta WHERE discipline=?").raw().get(c)[0];
      An._clashDiscCache = {}; const matrix = An._countClashesRtree(null, R(), a, c);                         // the matrix pass: fresh rules, nothing clicked
      const stale = R(); stale._activeTolerance = 0.1; An._clashDiscCache = {};                               // another pair's click left a 'current' tolerance
      const matrixStale = An._countClashesRtree(null, stale, a, c);
      const listRows = (await An._queryClashesPairAll(R(), a, c)) || [], list = listRows.length;
      let linkTol = null;
      if (listRows.length) { An._currentClashRules = R(); const u = An._buildClashDeepLink(listRows[0]); linkTol = +((/[&#]tol=(\d+)/.exec(u) || [])[1]); }
      Ao._clashDiscCache = {}; const oldMatrix = Ao._countClashesRtree(null, R(), a, c);
      const fb = await waitMeasure(Fn, a, c, tol);                                                            // K1: same pair, not ready
      const ofb = oldOn ? oldFbMeasure(Fo, a, c) : {};                                                         // R1: the old fallback, same pair, same DB
      const row = { bld: b, pair, a, c, tolMm: Math.round(tol * 1000), nA, nB, vacuous: !nA || !nB, matrix, matrixStale, list, linkTol, oldMatrix,
        fbList: fb.list, fbCount: fb.count, fbPageBelowTol: fb.pageBelowTol, fbWaits: fb.waits, oldFbList: ofb.list, oldFbCount: ofb.count };
      log('§CLASH_COUNT_AGREE ' + b + ' ' + pair + ' tol=' + row.tolMm + 'mm matrix=' + matrix + ' matrix_stale=' + matrixStale + ' list=' + list + ' link_tol=' + linkTol + ' old_matrix=' + oldMatrix + (row.vacuous ? ' VACUOUS' : ''));
      log('§CCA_NOT_READY ' + b + ' ' + pair + ' rtree=' + matrix + ' list=' + fb.list + ' count=' + fb.count + ' page_below_tol=' + fb.pageBelowTol + ' waits=' + fb.waits.join(',') +
        (oldOn ? ' | before-WO-20 fb_list=' + ofb.list + ' fb_count=' + ofb.count : '') + (row.vacuous ? ' VACUOUS' : ''));
      rows.push(row); bRows.push(row);
    }
    const judgedB = bRows.filter(r => !r.vacuous);
    // K1 EXISTS (not ready): the matrix sphere must say clash iff the R-tree count > 0
    Fn.__waits.length = 0; Fn.__unready();
    const ex = await pump(Fn, Fn._clashExistsPerPair(null, R())), exWaits = waitKinds(Fn).slice();
    judgedB.forEach(r => { const k = r.a + '|' + r.c; exists.push({ bld: r.bld, pair: r.pair, rtree: r.matrix > 0 ? 1 : 0, nb: ex[k], waits: exWaits }); });
    // K2 / K3: the report started not ready; then again at a different tolerance with the cache the first run filled
    Fn._cachedPairCounts = null;
    const rep1 = await reportCounts(Fn, R());
    const rules2 = R(); rules2.clash_rules.forEach(r => { r.tolerance_m = tolOf(r) + 0.2; });
    const rep2 = await reportCounts(Fn, rules2);
    judgedB.forEach(r => {
      An._clashDiscCache = {}; const matrix2 = An._countClashesRtree(null, rules2, r.a, r.c);
      r.report = rep1 && rep1[r.a + '|' + r.c]; r.matrix2 = matrix2; r.report2 = rep2 && rep2[r.a + '|' + r.c];
      if (r.matrix > 0 || matrix2 > 0) log('§CCA_REPORT ' + b + ' ' + r.pair + ' rtree=' + r.matrix + ' report=' + r.report + ' | at +200mm tolerance rtree=' + matrix2 + ' report=' + r.report2);
    });
    // K4: every statement the not-ready engine ran
    const crossN = Fn.__sql.filter(x => CROSS_JOIN(x.sql)).length, rtreeN = Fn.__sql.filter(x => /elements_rtree/.test(x.sql)).length;
    bld.push({ bld: b, statements: Fn.__sql.length, crossJoin: crossN, rtreeStatements: rtreeN, notReadyStatements: Fn.__sql.filter(x => !x.ready).length });
    log('§CCA_SQL_SPY ' + b + ' statements=' + Fn.__sql.length + ' cross_join=' + crossN + ' rtree_statements=' + rtreeN);
    // R2: the first fix's cross-join put back in front of the R-tree path, on the smallest building only (a cross-join is the thing being refused)
    if (!r2 && nEl <= OLD_FB_MAX && judgedB.some(r => r.matrix > 0)) {
      const G = engine(db, null, { notReady: true }), pr = judgedB.find(r => r.matrix > 0), rule = R().clash_rules.find(x => x.source.discipline === pr.a && x.target.discipline === pr.c);
      const orig = G._queryClashesPairAll;
      G._queryClashesPairAll = function (rules, a, c) { return G._clashRtreeReady ? orig(rules, a, c) : Promise.resolve(G.dbQuery(crossJoinListSql(tolOf(rule), a, c))); };   // the rejected fix: no wait, SQL cross-join
      G.__unready(); await pump(G, G._queryClashesPairAll(R(), pr.a, pr.c));
      r2 = { bld: b, pair: pr.pair, crossJoin: G.__sql.filter(x => CROSS_JOIN(x.sql)).length };
      log('§CCA R2 first-fix cross-join put back: ' + b + ' ' + pr.pair + ' cross_join_statements=' + r2.crossJoin);
    }
    db.close();
  }
  // K5: the REAL builder, an R-tree that cannot be created
  {
    const f = FLEET.find(x => fs.existsSync(x));
    if (f) {
      const db = openDb(f, true);
      const sqlJs = { run(sql) { if (/CREATE VIRTUAL TABLE elements_rtree/i.test(sql)) throw new Error('no such module: rtree'); }, exec() { return []; } };
      const K = engine(db, null, { realBuilder: true, sqlJs });
      const rule = RULES.clash_rules[0], a = rule.source.discipline, c = rule.target.discipline;
      const attempt = async fn => { try { const v = await pump(K, fn()); return { rejected: false, value: v }; } catch (e) { return { rejected: true, message: e.message }; } };
      const first = await attempt(() => K._queryClashesPairAll(R(), a, c));
      const statusAfter = K.status.textContent;
      const second = await attempt(() => K._countClashesAsync(R(), a, c));
      const third = await attempt(() => K._clashExistsPerPair(null, R()));
      k5 = { first, second, third, statusAfter, builderMessage: 'no such module: rtree' };
      log('§CCA_K5 first=' + JSON.stringify(first) + ' status=' + JSON.stringify(statusAfter) + ' second=' + JSON.stringify(second) + ' third=' + JSON.stringify(third));
      db.close();
    }
  }
  const judged = rs => rs.filter(r => !r.vacuous);
  log('§CCA judged=' + judged(rows).length + ' of ' + rows.length);
  // ---- predicates (shared by the invariants, the red control and the verdict line) ----
  const hasAll = (ws, kinds) => kinds.every(k => ws.indexOf(k) >= 0);
  const k1pop = rs => judged(rs).length > 0 && judged(rs).some(r => r.matrix > 0) && exists.length > 0;
  const k1 = rs => judged(rs).every(r => r.fbList === r.matrix && r.fbCount === r.matrix && r.fbPageBelowTol === 0 && hasAll(r.fbWaits || [], ['list', 'count', 'list'])) &&
    exists.every(e => e.nb === e.rtree && hasAll(e.waits || [], ['exists']));
  const k2pop = rs => judged(rs).some(r => r.matrix > 0);
  const k2 = rs => judged(rs).every(r => r.report === r.matrix);
  const k3pop = rs => judged(rs).some(r => r.matrix2 !== r.matrix);
  const k3 = rs => judged(rs).every(r => r.report2 === r.matrix2) && k3pop(rs);
  const k4pop = () => bld.length > 0 && bld.every(x => x.rtreeStatements > 0);
  const k4 = () => bld.every(x => x.crossJoin === 0);
  const k5pop = () => !!k5;
  const k5ok = () => !!k5 && [k5.first, k5.second, k5.third].every(x => x.rejected && x.message === k5.builderMessage) && k5.statusAfter === k5.builderMessage;
  const r1 = rs => judged(rs).some(r => r.oldFbList !== undefined && (r.oldFbList !== r.matrix || r.oldFbCount !== r.matrix));
  const r1pop = rs => judged(rs).some(r => r.oldFbList !== undefined);
  const r2d = () => !!r2 && r2.crossJoin > 0;
  Witness('clash_count_agree')
    .population(() => rows)
    .schema({ type: 'object', required: ['bld', 'pair', 'tolMm', 'matrix', 'matrixStale', 'list', 'oldMatrix', 'fbList', 'fbCount'],
      properties: { matrix: { type: 'integer', minimum: 0 }, list: { type: 'integer', minimum: 0 }, fbList: { type: 'integer', minimum: 0 }, fbCount: { type: 'integer', minimum: 0 } } })
    .invariant('at least one pair judged (not all VACUOUS)', rs => judged(rs).length > 0)
    .invariant('at least one judged pair has clashes (else the agreement is unproven)', rs => judged(rs).some(r => r.list > 0))
    .invariant('matrix count == list length, every judged pair', rs => judged(rs).every(r => r.matrix === r.list))
    .invariant('matrix count does not depend on a left-over active tolerance', rs => judged(rs).every(r => r.matrixStale === r.matrix))
    .invariant('share link tol == the clash pair\'s own rule tolerance', rs => judged(rs).every(r => r.list === 0 || r.linkTol === r.tolMm))
    .invariant('RED reproduced: OLD code\'s matrix count != list on at least one pair', rs => judged(rs).some(r => r.oldMatrix !== r.list))
    .invariant('K1 not ready: list == count == R-tree matrix, first page >= tol, EXISTS == (matrix>0), §CLASH_WAIT_INDEX logged; population > 0', rs => k1pop(rs) && k1(rs))
    .invariant('K2 the report\'s number for the pair == the matrix count (report started not ready); population > 0', rs => k2pop(rs) && k2(rs))
    .invariant('K3 a count cached at one tolerance is not served for another; population > 0', rs => k3pop(rs) && k3(rs))
    .invariant('K4 while not ready no statement joins element_transforms a to b (and the R-tree statements ran)', () => k4pop() && k4())
    .invariant('K5 a failed index build rejects with the builder\'s message, shows it, keeps rejecting', () => k5pop() && k5ok())
    .invariant('R1 RED reproduced: the fallback code BEFORE WO-20 (' + FB_OLD_REF + ') fails K1 on >= 1 pair', rs => r1pop(rs) && r1(rs))
    .invariant('R2 RED reproduced: the first fix\'s cross-join put back fails K4', () => r2d())
    .redControl(rs => rs.map(r => Object.assign(r, { matrix: r.oldMatrix, fbList: r.oldFbList === undefined ? -1 : r.oldFbList, fbCount: r.oldFbCount === undefined ? -1 : r.oldFbCount })))
    .run(log);
  const st = (pop, ok) => !pop ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL';
  const bad = judged(rows).find(r => r.oldFbList !== undefined && (r.oldFbList !== r.matrix || r.oldFbCount !== r.matrix));
  if (bad) log('§CCA R1 red numbers: ' + bad.bld + ' ' + bad.pair + ' fallback code before WO-20 (' + FB_OLD_REF + '): list=' + bad.oldFbList + ' count=' + bad.oldFbCount + ' vs R-tree matrix=' + bad.matrix);
  if (r2) log('§CCA R2 red numbers: ' + r2.bld + ' ' + r2.pair + ' cross_join_statements=' + r2.crossJoin + ' (K4 needs 0)');
  const redN = (r1pop(rows) && r1(rows) ? 1 : 0) + (r2d() ? 1 : 0);
  log('§CCA_VERDICT K1=' + st(k1pop(rows), k1pop(rows) && k1(rows)) + ' K2=' + st(k2pop(rows), k2pop(rows) && k2(rows)) + ' K3=' + st(k3pop(rows), k3(rows)) +
    ' K4=' + st(k4pop(), k4pop() && k4()) + ' K5=' + st(k5pop(), k5ok()) + ' red_control=' + (redN === 2 ? 'detected(2/2)' : 'NOT_DETECTED(' + redN + '/2)') +
    ' judged=' + judged(rows).length + ' of ' + rows.length);
  logStream.end();
})().catch(e => { console.log('§CCA WITNESS_ERROR ' + (e && e.stack || e)); process.exitCode = 2; logStream.end(); });
