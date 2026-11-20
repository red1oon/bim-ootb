// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — shim_bonds_run.js. SCOPE: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.37.2. Read the §SHIM_* lines after every run.
// ONE loader for scripts/shim_bonds_report.js and viewer/tests/witness_shim_bonds.js: the persisted run (PRIMAL LAW 5, never a re-solve), the played
// layer, the owners' contact graph and election, the declared aggregates of the DB the run was built from (raw file + the viewer's patch), the bonds.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SG = require(path.join(ROOT, 'viewer', 'schedule_gate.js')); global.ScheduleGate = SG;
const CPM = require(path.join(ROOT, 'viewer', 'cpm_schedule.js'));
const SB = require(path.join(ROOT, 'viewer', 'shim_bonds.js'));
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
const BP = require(path.join(ROOT, 'scripts', 'lib', 'apply_building_patch.js'));
const PK = require(path.join(ROOT, 'scripts', 'lib', 'shim_bonds_pack.js'));
const BLD = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const quiet = fn => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };   // the owners' § lines are in witness.log already

async function sql() {
  const init = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
  return init({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
}
// aggregates(run, SQL) -> { has, parentOf: {child: parent}, parentCls: {child: parent ifc_class}, why }
function aggregates(run, SQL) {
  const out = { has: false, parentOf: {}, parentCls: {}, why: '' };
  const dbPath = run.dbFile ? path.join(BLD, run.dbFile) : null;
  if (!dbPath || !fs.existsSync(dbPath)) { out.why = 'db not readable: ' + dbPath; return out; }
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  try {
    const pr = run.patched ? quiet(() => BP.applyTo(db, run.dbFile, () => {}, run.patched)) : null;
    if (run.patched && (!pr || pr.failed.length)) { out.why = 'patch did not apply'; return out; }
    let r;
    try { r = db.exec('SELECT a.child_guid, a.parent_guid, p.ifc_class FROM rel_aggregates a LEFT JOIN elements_meta p ON p.guid = a.parent_guid'); }
    catch (e) { out.why = 'no rel_aggregates table'; return out; }
    out.has = true;
    if (r.length) r[0].values.forEach(v => { out.parentOf[v[0]] = v[1]; if (v[2]) out.parentCls[v[0]] = v[2]; });
    return out;
  } finally { db.close(); }
}
// load(bld, SQL, table?) -> null when there is no persisted run, else everything a judge needs. `source` says where the bonds came from:
// 'persisted' = run.json `bonds` (§Q.37 S2, the normal case), 'computed' = a custom table was asked for or the run carries none for this table.
function load(bld, SQL, table) {
  const run = CACHE.read(bld); if (!run) return null;
  const L = CACHE.layerOf(run, 'played'); if (L.missing) return null;
  const items = run.els.filter(e => L.map[e.guid]).map(e => Object.assign({}, e, { s: L.map[e.guid].s, e: L.map[e.guid].e }));
  const G = quiet(() => CPM.contactGraph(items)); if (!G.ok) return null;
  const des = quiet(() => CPM.designatedSupport(items, G));
  const stored = table ? null : PK.unpack(run.bonds, SB);
  if (stored && stored.n === items.length) return { bld, run, items, G, des, agg: stored.agg, res: stored, source: 'persisted', fresh: () => fresh(run, items, G, SQL) };
  const f = fresh(run, items, G, SQL, table);
  return { bld, run, items, G, des, agg: f.agg, res: f.res, source: 'computed', fresh: () => f };
}
// fresh(...) -> { agg, res } computed now from the db the run was built from (raw file + the viewer's patch) — the independent recomputation.
function fresh(run, items, G, SQL, table) {
  const agg = aggregates(run, SQL);
  return { agg: agg, res: SB.compute(items, G, { EPS: SG.EPS, GAP: SG.GAP, parentOf: agg.parentOf, parentCls: agg.parentCls, table: table }) };
}
module.exports = { sql, load, fresh, aggregates, SB, SG, CACHE, PK };
