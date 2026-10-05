#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CLASH_CIVIL_PAIRS (2026-10-05, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §V.1)
// Scope: civil discipline pairs in the clash engine + the NON-IMPACT proof on the building fleet.
// Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: "a civil model (JELAPANG, all IfcBuildingElementProxy) gets 0 clash
// items". Two causes: no civil pair in clash_rules.json, and every rule's ignore_classes merged into one
// global set (ARC vs STR drops IfcBuildingElementProxy → every proxy is dropped from every pair).
// RED (origin/main measure.js + clash_matrix.js, even WITH the new civil rules) = 0 on every civil pair.
// GREEN = each civil pair count from the production _countClashesRtree AND _queryClashesPairRtree equals
// this file's own brute-force bbox oracle; building pairs (Hospital/Terminal/LTU/Duplex) give the SAME
// guid-pair list old code vs new code; the no-pair ignore clause is the same string.
// CAN REPORT ITS OWN FAILURE: VACUOUS per pair (a side has 0 elements), INCONCLUSIVE (DB missing),
// RED CONTROL (witness_kit).
// Env: OLD_REF (default origin/main) · JELAPANG (DB path) · BLD_DIR · FLEET (comma list) · LOG
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process'), crypto = require('crypto');
const Database = require('/home/red1/bim-compiler/node_modules/better-sqlite3');
const { Witness } = require('../../witness_kit/contract');
const VIEWER = path.join(__dirname, '..');
const OLD_REF = process.env.OLD_REF || 'origin/main';
const JEL = process.env.JELAPANG || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC', 'JELAPANG_AFTER.db');
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const FLEET = (process.env.FLEET || 'Hospital_meta,Terminal_meta,LTU_AHouse_meta,Duplex_extracted').split(',');
const LOG = process.env.LOG || '/tmp/witness_clash_civil_pairs.log';
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
  rules._activeTolerance = tolOf(r); A._CLASH_PAGE_SIZE = 1e9;
  const rows = A._queryClashesPairRtree(null, rules, r.source.discipline, r.target.discipline, 0, null);
  const keys = rows.map(x => (x[0] < x[1] ? x[0] + '|' + x[1] : x[1] + '|' + x[0])).sort();
  A._clashDiscCache = {};
  const count = A._countClashesRtree(null, rules, r.source.discipline, r.target.discipline);
  return { keys, count, hash: crypto.createHash('sha1').update(keys.join('\n')).digest('hex').slice(0, 12) };
}
// this witness's own oracle: every A×B element pair, open-box overlap ≥ tolerance, no R-tree, no ignore set
function oracle(db, a, b, tol) {
  const q = d => db.prepare("SELECT t.guid, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE m.discipline=? AND m.ifc_class <> 'IfcOpeningElement' AND t.bbox_x IS NOT NULL").raw().all(d);
  const A = q(a), B = q(b), keys = [];
  for (const p of A) for (const r of B) {
    const ox = Math.min(p[1] + p[4] / 2, r[1] + r[4] / 2) - Math.max(p[1] - p[4] / 2, r[1] - r[4] / 2);
    const oy = Math.min(p[2] + p[5] / 2, r[2] + r[5] / 2) - Math.max(p[2] - p[5] / 2, r[2] - r[5] / 2);
    const oz = Math.min(p[3] + p[6] / 2, r[3] + r[6] / 2) - Math.max(p[3] - p[6] / 2, r[3] - r[6] / 2);
    if (ox > 0 && oy > 0 && oz > 0 && Math.min(ox, oy, oz) >= tol) keys.push(p[0] < r[0] ? p[0] + '|' + r[0] : r[0] + '|' + p[0]);
  }
  return { nA: A.length, nB: B.length, keys: keys.sort() };
}

const newRules = JSON.parse(src('clash_rules.json'));
const oldRules = JSON.parse(src('clash_rules.json', OLD_REF));
const civilRules = newRules.clash_rules.filter(r => r.family === 'civil');
const rows = [];

log('§CCP start old=' + OLD_REF + ' civilRules=' + civilRules.length + ' buildingRules=' + oldRules.clash_rules.length);
if (!fs.existsSync(JEL)) log('§CCP JELAPANG INCONCLUSIVE db missing ' + JEL);
else {
  const { db, hasPsets } = openDb(JEL);
  const Anew = engine(db, null), Aold = engine(db, OLD_REF);
  const disc = db.prepare('SELECT discipline, ifc_class, COUNT(*) n FROM elements_meta GROUP BY 1,2').all();
  log('§CCP JELAPANG classes ' + disc.map(d => d.discipline + '/' + d.ifc_class + '=' + d.n).join(' '));
  for (const r of civilRules) {
    const pair = r.source.discipline + '×' + r.target.discipline;
    const o = oracle(db, r.source.discipline, r.target.discipline, tolOf(r));
    const nw = pairRows(Anew, JSON.parse(JSON.stringify(newRules)), r);
    const od = pairRows(Aold, JSON.parse(JSON.stringify(newRules)), r);   // OLD code, SAME new rules → isolates the ignore-set merge
    const vacuous = !o.nA || !o.nB;
    const same = nw.keys.length === o.keys.length && nw.keys.every((k, i) => k === o.keys[i]);
    log('§CIVIL_CLASH ' + pair + ' A=' + o.nA + ' B=' + o.nB + ' oracle=' + o.keys.length + ' new.list=' + nw.keys.length +
      ' new.count=' + nw.count + ' old.list=' + od.keys.length + ' old.count=' + od.count + ' listMatchesOracle=' + same + (vacuous ? ' VACUOUS' : ''));
    if (hasPsets && nw.keys.length) {
      const typ = {}; const tq = db.prepare('SELECT value FROM element_psets WHERE guid=?');
      nw.keys.forEach(k => k.split('|').forEach(g => { const t = tq.get(g); if (t) typ[t.value] = (typ[t.value] || 0) + 1; }));
      log('§CIVIL_CLASH_TYPES ' + pair + ' ' + (Object.keys(typ).length ? Object.entries(typ).sort((x, y) => y[1] - x[1]).map(e => e[0] + '=' + e[1]).join(' ; ') : 'no 02_Type on either side'));
    }
    rows.push({ bld: 'JELAPANG', family: 'civil', pair, vacuous, oracle: o.keys.length, newList: nw.keys.length, newCount: nw.count, oldList: od.keys.length, oldCount: od.count, listMatchesOracle: same, oldHash: od.hash, newHash: nw.hash });
  }
  db.close();
}

for (const b of FLEET) {
  const f = path.join(BLD_DIR, b + '.db');
  if (!fs.existsSync(f)) { log('§CCP ' + b + ' INCONCLUSIVE db missing'); continue; }
  const t0 = Date.now();
  const { db } = openDb(f);
  const Anew = engine(db, null), Aold = engine(db, OLD_REF);
  const clauseOld = Aold._clashWhereParts(JSON.parse(JSON.stringify(oldRules))).ignoreClause;
  const clauseNew = Anew._clashWhereParts(JSON.parse(JSON.stringify(newRules))).ignoreClause;
  log('§CCP ' + b + ' noPairIgnoreClause same=' + (clauseOld === clauseNew));
  for (const r of oldRules.clash_rules) {
    const pair = r.source.discipline + '×' + r.target.discipline;
    const od = pairRows(Aold, JSON.parse(JSON.stringify(oldRules)), r);
    const nw = pairRows(Anew, JSON.parse(JSON.stringify(newRules)), r);
    log('§FLEET_CLASH ' + b + ' ' + pair + ' old=' + od.keys.length + '/' + od.count + '#' + od.hash + ' new=' + nw.keys.length + '/' + nw.count + '#' + nw.hash);
    rows.push({ bld: b, family: 'building', pair, vacuous: false, oracle: -1, newList: nw.keys.length, newCount: nw.count, oldList: od.keys.length, oldCount: od.count, listMatchesOracle: true, oldHash: od.hash, newHash: nw.hash, clauseSame: clauseOld === clauseNew });
  }
  log('§CCP ' + b + ' done ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  db.close();
}

const civil = rs => rs.filter(r => r.family === 'civil' && !r.vacuous);
const fleet = rs => rs.filter(r => r.family === 'building');
Witness('clash_civil_pairs')
  .population(() => rows)
  .schema({ type: 'object', required: ['bld', 'family', 'pair', 'newList', 'newCount', 'oldList', 'oldCount', 'oldHash', 'newHash'],
    properties: { newList: { type: 'integer', minimum: 0 }, newCount: { type: 'integer', minimum: 0 } } })
  .invariant('civil: at least one civil pair judged (not all VACUOUS)', rs => civil(rs).length > 0)
  .invariant('civil: at least one civil pair has clashes (else the 0 is unproven)', rs => civil(rs).some(r => r.oracle > 0))
  .invariant('civil: production list == own bbox oracle, every pair', rs => civil(rs).every(r => r.listMatchesOracle && r.newList === r.oracle))
  .invariant('civil: production count (_countClashesRtree) == list length', rs => civil(rs).every(r => r.newCount === r.newList))
  .invariant('civil: RED reproduced — old code gives 0 on every civil pair', rs => civil(rs).every(r => r.oldList === 0 && r.oldCount === 0))
  .invariant('fleet: at least one building judged', rs => fleet(rs).length > 0)
  .invariant('fleet: every building pair — same guid-pair list + count old vs new', rs => fleet(rs).every(r => r.oldHash === r.newHash && r.oldCount === r.newCount))
  .invariant('fleet: no-pair ignore clause identical', rs => fleet(rs).every(r => r.clauseSame))
  .redControl(rs => rs.map(r => r.family === 'building' ? Object.assign(r, { newHash: 'x' }) : r))
  .run();
logStream.end();
