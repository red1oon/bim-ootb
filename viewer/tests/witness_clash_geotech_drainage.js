#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CLASH_GEOTECH_DRAINAGE (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §PARTNER_DISCS D7)
// Scope: the civil pair GEOTECH×DRAINAGE in viewer/clash_rules.json + NON-IMPACT on the building fleet.
// Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: cross-vendor clash (partner geotech piles/nails/drains vs the road
// drainage, separate files) reported nothing because no rule paired them. RED = origin/main rules → 0
// GEOTECH×DRAINAGE rows. GREEN = new rules → N>0 rows == this file's own brute-force bbox oracle, count ==
// list; fleet (Hospital/Terminal/LTU/Duplex) guid-pair lists identical under old vs new rules.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (no GEOTECH or no DRAINAGE loaded, DB missing), RED CONTROL.
// Env: OLD_REF (default origin/main) · CIVIL_DB · BLD_DIR · FLEET · LOG
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process'), crypto = require('crypto');
const Database = require('/home/red1/bim-compiler/node_modules/better-sqlite3');
const { Witness } = require('../../witness_kit/contract');
const VIEWER = path.join(__dirname, '..');
const OLD_REF = process.env.OLD_REF || 'origin/main';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const FLEET = (process.env.FLEET || 'Hospital_meta,Terminal_meta,LTU_AHouse_meta,Duplex_extracted').split(',');
const LOG = process.env.LOG || '/tmp/witness_clash_geotech_drainage.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }

function src(rel, ref) {
  return ref ? cp.execSync('git show ' + ref + ':viewer/' + rel, { cwd: VIEWER, maxBuffer: 64 << 20 }).toString()
             : fs.readFileSync(path.join(VIEWER, rel), 'utf8');
}

// in-memory copy of the two tables the clash engine reads + the R-tree it would build
function openDb(file) {
  const db = new Database(':memory:');
  db.exec("ATTACH '" + file.replace(/'/g, "''") + "' AS s");
  db.exec('CREATE TABLE elements_meta AS SELECT guid, discipline, ifc_class, element_name, storey FROM s.elements_meta');
  db.exec('CREATE TABLE element_transforms AS SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM s.element_transforms');
  const hasPsets = db.prepare("SELECT COUNT(*) n FROM s.sqlite_master WHERE name='element_psets'").get().n > 0;
  if (hasPsets) db.exec("CREATE TABLE element_psets AS SELECT guid, value FROM s.element_psets WHERE name='02_Type'");
  db.exec('DETACH s');
  db.exec('CREATE VIRTUAL TABLE elements_rtree USING rtree(id, minX, maxX, minY, maxY, minZ, maxZ)');
  db.exec('INSERT INTO elements_rtree SELECT rowid, center_x - bbox_x/2, center_x + bbox_x/2, center_y - bbox_y/2, center_y + bbox_y/2, center_z - bbox_z/2, center_z + bbox_z/2 FROM element_transforms WHERE bbox_x IS NOT NULL');
  return { db, hasPsets };
}

// the real measure.js + clash_matrix.js, loaded into a vm against the in-memory DB
function engine(db, ref) {
  const quiet = { log() {}, warn() {}, error() {} };
  const A = {
    db: { run: s => db.exec(s), exec: s => { const st = db.prepare(s); return st.reader ? [{ values: st.raw().all() }] : (st.run(), []); } },
    dbQuery: s => { const st = db.prepare(s); return st.reader ? st.raw().all() : (st.run(), []); },
    status: { textContent: '' }, _hasBbox: true,
  };
  const ctx = { console: quiet, performance, setTimeout() {}, clearTimeout() {}, Math, JSON, Object, Array, String, Number, Promise,
    document: { getElementById() { return null; }, createElement() { return { style: {} }; }, head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {} },
    window: {}, navigator: { userAgent: 'node' }, localStorage: { getItem() { return null; }, setItem() {} }, A };
  // THREE is only touched by setup-time constants in measure.js (no clash query uses it) → an inert stub
  const inert = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : inert, apply: () => inert, construct: () => inert });
  ctx.THREE = inert;
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(src('measure.js', ref) + '\n;setupMeasure(A);', ctx, { filename: 'measure.js@' + (ref || 'HEAD') });
  vm.runInContext(src('clash_matrix.js', ref) + '\n;setupClashMatrix(A);', ctx, { filename: 'clash_matrix.js@' + (ref || 'HEAD') });
  A._clashIndexesReady = true; A._clashRtreeReady = true;
  A._ensureClashIndexes = function () {};
  return A;
}

function tolOf(r) { return typeof r.tolerance_m === 'number' ? r.tolerance_m : 0.025; }
function pairRows(A, rules, r) {
  rules._activeTolerance = tolOf(r); A._CLASH_PAGE_SIZE = 1e9; A._clashDiscCache = {};
  const rows = A._queryClashesPairRtree(null, rules, r.source.discipline, r.target.discipline, 0, null);
  const keys = rows.map(x => (x[0] < x[1] ? x[0] + '|' + x[1] : x[1] + '|' + x[0])).sort();
  A._clashDiscCache = {};
  const count = A._countClashesRtree(null, rules, r.source.discipline, r.target.discipline);
  return { keys, count, hash: crypto.createHash('sha1').update(keys.join('\n')).digest('hex').slice(0, 12) };
}
function oracle(db, a, b, tol) {
  const q = d => db.prepare("SELECT t.guid, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE m.discipline=? AND m.ifc_class <> 'IfcOpeningElement'").raw().all(d);
  const A = q(a), B = q(b), keys = [];
  for (const p of A) for (const r of B) {
    const ox = Math.min(p[1] + p[4] / 2, r[1] + r[4] / 2) - Math.max(p[1] - p[4] / 2, r[1] - r[4] / 2);
    const oy = Math.min(p[2] + p[5] / 2, r[2] + r[5] / 2) - Math.max(p[2] - p[5] / 2, r[2] - r[5] / 2);
    const oz = Math.min(p[3] + p[6] / 2, r[3] + r[6] / 2) - Math.max(p[3] - p[6] / 2, r[3] - r[6] / 2);
    if (ox > 0 && oy > 0 && oz > 0 && Math.min(ox, oy, oz) >= tol) keys.push(p[0] < r[0] ? p[0] + '|' + r[0] : r[0] + '|' + p[0]);
  }
  return { nA: A.length, nB: B.length, keys: keys.sort() };
}
const CIVIL = process.env.CIVIL_DB || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC', 'CivilWorks.db');
const newRules = JSON.parse(src('clash_rules.json'));
const oldRules = JSON.parse(src('clash_rules.json', OLD_REF));
const isGD = r => r.source.discipline === 'GEOTECH' && r.target.discipline === 'DRAINAGE';
const rule = newRules.clash_rules.find(isGD);
const rows = [];
log('§CGD start old=' + OLD_REF + ' ruleInNew=' + !!rule + ' ruleInOld=' + oldRules.clash_rules.some(isGD) + (rule ? ' family=' + rule.family + ' tol=' + rule.tolerance_m : ''));
if (!rule) { log('§CGD INCONCLUSIVE no GEOTECH vs DRAINAGE rule in clash_rules.json'); }
else if (!fs.existsSync(CIVIL)) log('§CGD INCONCLUSIVE db missing ' + CIVIL);
else {
  const { db } = openDb(CIVIL);
  const Anew = engine(db, null);
  const o = oracle(db, 'GEOTECH', 'DRAINAGE', tolOf(rule));
  const nw = pairRows(Anew, JSON.parse(JSON.stringify(newRules)), rule);
  // RED control: the origin/main rule set (no such pair) asked for the same pair
  const od = pairRows(Anew, JSON.parse(JSON.stringify(oldRules)), rule);
  const vacuous = !o.nA || !o.nB;
  const same = nw.keys.length === o.keys.length && nw.keys.every((k, i) => k === o.keys[i]);
  log('§CGD_PAIR GEOTECH=' + o.nA + ' DRAINAGE=' + o.nB + ' oracle=' + o.keys.length + ' new.list=' + nw.keys.length + ' new.count=' + nw.count +
    ' mainRules.list=' + od.keys.length + ' mainRules.count=' + od.count + ' listMatchesOracle=' + same + ' hash=' + nw.hash + (vacuous ? ' INCONCLUSIVE(vacuous: a side has 0 elements)' : ''));
  if (nw.keys.length) {
    const cls = {}, q = db.prepare('SELECT m.ifc_class, m.element_name, t.center_x, t.center_y, t.center_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.guid=?');
    nw.keys.forEach(k => k.split('|').forEach(g => { const r = q.get(g); const c = r.ifc_class + '/' + (r.element_name || '').replace(/[0-9]+/g, '#').slice(0, 40); cls[c] = (cls[c] || 0) + 1; }));
    log('§CGD_NAMES ' + Object.entries(cls).sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e[0] + '=' + e[1]).join(' ; '));
    nw.keys.slice(0, 5).forEach(k => k.split('|').forEach(g => { const r = q.get(g); log('§CGD_SAMPLE ' + k + ' guid=' + g + ' ' + r.ifc_class + ' "' + r.element_name + '" xyz=' + [r.center_x, r.center_y, r.center_z].map(v => (+v).toFixed(2)).join(',')); }));
  }
  rows.push({ bld: 'CivilWorks', family: 'civil', vacuous, oracle: o.keys.length, newList: nw.keys.length, newCount: nw.count, oldList: od.keys.length, oldCount: od.count, listMatchesOracle: same, oldHash: od.hash, newHash: nw.hash });
  db.close();
}
for (const b of FLEET) {
  const f = path.join(BLD_DIR, b + '.db');
  if (!fs.existsSync(f)) { log('§CGD ' + b + ' INCONCLUSIVE db missing'); continue; }
  const { db } = openDb(f);
  const Anew = engine(db, null), Aold = engine(db, OLD_REF);
  let tn = 0, to = 0, allSame = true;
  for (const r of oldRules.clash_rules) {
    const od = pairRows(Aold, JSON.parse(JSON.stringify(oldRules)), r);
    const nw = pairRows(Anew, JSON.parse(JSON.stringify(newRules)), r);
    tn += nw.keys.length; to += od.keys.length; if (od.hash !== nw.hash || od.count !== nw.count) allSame = false;
  }
  const clauseSame = Aold._clashWhereParts(JSON.parse(JSON.stringify(oldRules))).ignoreClause === Anew._clashWhereParts(JSON.parse(JSON.stringify(newRules))).ignoreClause;
  const gd = pairRows(Anew, JSON.parse(JSON.stringify(newRules)), rule);
  const nGeo = db.prepare("SELECT COUNT(*) FROM elements_meta WHERE discipline='GEOTECH'").raw().get()[0];
  log('§CGD_FLEET ' + b + ' pairsJudged=' + oldRules.clash_rules.length + ' totalOld=' + to + ' totalNew=' + tn + ' allListsAndCountsIdentical=' + allSame + ' noPairClauseSame=' + clauseSame + ' geotechGuids=' + nGeo + ' newPairRows=' + gd.keys.length);
  rows.push({ bld: b, family: 'building', vacuous: false, oracle: -1, newList: tn, newCount: tn, oldList: to, oldCount: to, listMatchesOracle: allSame, oldHash: '', newHash: '', clauseSame, newPairRows: gd.keys.length });
  db.close();
}
const civil = rs => rs.filter(r => r.family === 'civil' && !r.vacuous);
const fleet = rs => rs.filter(r => r.family === 'building');
Witness('clash_geotech_drainage')
  .population(() => rows)
  .schema({ type: 'object', required: ['bld', 'family', 'newList', 'newCount', 'oldList', 'oldCount'], properties: { newList: { type: 'integer', minimum: 0 } } })
  .invariant('civil: not vacuous — GEOTECH and DRAINAGE both loaded (INCONCLUSIVE otherwise)', rs => civil(rs).length > 0)
  .invariant('civil: GEOTECH×DRAINAGE has clashes (N>0)', rs => civil(rs).some(r => r.newList > 0))
  .invariant('civil: RED — origin/main rules give 0 for the pair', rs => civil(rs).every(r => r.oldList === 0 && r.oldCount === 0))
  .invariant('civil: list == own bbox oracle and count == list', rs => civil(rs).every(r => r.listMatchesOracle && r.newList === r.oracle && r.newCount === r.newList))
  .invariant('fleet: at least one building judged', rs => fleet(rs).length > 0)
  .invariant('fleet: every old pair list+count identical old vs new, no-pair clause identical', rs => fleet(rs).every(r => r.listMatchesOracle && r.clauseSame))
  .invariant('fleet: new pair fires 0 rows on buildings', rs => fleet(rs).every(r => r.newPairRows === 0))
  .redControl(rs => rs.map(r => r.family === 'civil' ? Object.assign(r, { newList: 0 }) : Object.assign(r, { listMatchesOracle: false })))
  .run();
logStream.end();
