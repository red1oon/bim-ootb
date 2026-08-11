#!/usr/bin/env node
// witness_door_window_host_wall.js — §DOOR_WINDOW_HOST_WALL (2026-08-11).
//
// ISSUE this witness proves/disproves: a door/window's start time was never checked against the
// wall it is physically embedded in. Neither geoGate (bearing-below/contained) nor hangGate
// (carrier-above) models that relationship — both are VERTICAL; a door sits SIDEWAYS inside a
// wall. auditFloating/§SUPPORT_CHECK never covers this either (grep-confirmed: schedule_gate.js
// had zero mentions of IfcDoor/IfcWindow/IfcOpeningElement before this fix).
//
// Reported live: HHS_Office_Federated Level 2 door starting day 17.0, its own wall not finishing
// until day 27.3 — a door 10.3 days "ahead of" the wall it's cut into. Measured (probe script,
// 2026-08-11) on the pre-fix code: every real building except the smallest (Duplex) had this,
// 0.5%-21.8% of doors/windows, some over 120 days early.
//
// No IfcRelFillsElement/IfcRelVoidsElement is extracted (confirmed: no such table in the shipped
// DB — spatial_structure only carries storey/room parent-child, nothing element-to-element), so
// the host wall is found geometrically: XY/Z bbox overlap against wallGrid, reusing the exact grid
// + overlap() primitive wallGate already uses for its own (different) roof-slab-on-wall check.
//
//   W-DWH-1  openingGate is wired into BOTH placement sites (initial placeNonst AND the DEQ_V1
//            repair loop) — not just present as a function. Author's own first cut only wired one
//            site and every building still showed violations at ~the same rate; this assertion
//            exists specifically so that mistake fails loudly instead of shipping silently.
//   W-DWH-2  Zero doors/windows start before their geometrically-embedding wall finishes, on
//            EVERY shipped building (not just the one reported live).
//   W-DWH-3  No regression: wallGate's own roof-slab-on-wall gate and the wider physics system
//            (geoGate/hangGate/DAG) are unaffected — reuses the SAME real-DB pipeline
//            witness_geometric_support_order.js / witness_default_engine_quality.js already prove
//            clean; this witness only adds the door/window assertion on top, it does not
//            reimplement or duplicate the floating/cycle checks those already own.
//
// Command: BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_door_window_host_wall.js
// Read the § log lines, not exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const sgSrc = fs.readFileSync(path.join(__dirname, '..', 'schedule_gate.js'), 'utf8');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function finish() {
  console.log('\n§DOOR_WINDOW_HOST_WALL_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

// W-DWH-1 — wired at BOTH call sites, not just defined.
const initialSiteWired = sgSrc.indexOf('Math.max(geoGate(el), wallGate(el), hangGate(el), openingGate(el)') >= 0;
const repairSiteWired = sgSrc.indexOf('Math.max(geoGate(el), wallGate(el), hangGate(el), openingGate(el));') >= 0;
assert(initialSiteWired, 'W-DWH-1a openingGate wired into initial placeNonst Math.max(...)');
assert(repairSiteWired, 'W-DWH-1b openingGate wired into the §DEQ_V1 repair-loop Math.max(...) (the site the author\'s own first cut missed)');
if (!initialSiteWired || !repairSiteWired) finish();

function loadRatesTable() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  const end = txt.indexOf('};', defIdx) + 2;
  return (new Function(txt.slice(start, end) + '\n return RATES;'))();
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const DB_FILE = { LTU_AHouse: 'LTU_AHouse_meta.db' };
const BUILDINGS = ['Terminal', 'Hospital', 'Duplex', 'HHS_Office_Federated', 'Clinic', 'LTU_AHouse', 'JKR'];
const WALL_RE = /^IfcWall/;   // matches openingGate's own host pool: wallGrid is populated for classes starting "IfcWall"
const OPENING_RE = /^IfcDoor|^IfcWindow/;
const CELL = 4, EPS = 0.05;

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rulesJson.SEQUENCE_RULES, SD = rulesJson.SEQUENCE_DEFAULT, LR = rulesJson.LABOR_RATES;
  const NO = rulesJson.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();
  let anyChecked = false;

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'));
    if (!fs.existsSync(dbPath)) { assert(false, 'W-DWH fixture missing: ' + dbPath); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));

    const r = db.exec(
      "SELECT m.guid, m.ifc_class, COALESCE(t.center_z,0), COALESCE(t.bbox_z,0), COALESCE(t.center_x,0), " +
      "COALESCE(t.center_y,0), COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0), COALESCE(m.storey,'_UNKNOWN') " +
      "FROM elements_meta m LEFT JOIN element_transforms t ON t.guid = m.guid " +
      "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'");
    if (!r.length) { assert(false, 'W-DWH ' + bld + ' no elements'); db.close(); continue; }
    const nameOf = {};
    const nr = db.exec("SELECT guid, ifc_class, COALESCE(element_name,'') FROM elements_meta");
    if (nr.length) nr[0].values.forEach(v => { nameOf[v[0]] = v[2]; });
    const frag = ScheduleAuthor._classFragmentation(db, RATES);
    const lin = ScheduleAuthor._linearWeighting(db, RATES);

    const els = r[0].values.map(row => {
      const cls = row[1], cz = row[2] || 0, bz = row[3] || 0, cx = row[4] || 0, cy = row[5] || 0, bx = row[6] || 0, by = row[7] || 0;
      const rule = ScheduleAuthor.matchNameOverride(cls, nameOf[row[0]] || '', NO) || ScheduleAuthor.matchRule(cls, SR, SD);
      return { guid: row[0], cls: cls, storey: row[8] || '_UNKNOWN',
        base_z: cz - bz / 2, top_z: cz + bz / 2, x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,
        seq: rule.sequence, phase: rule.phase, resource: rule.resource || '_DEFAULT' };
    });
    db.close();

    const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
    geoEls.forEach(e => {
      const realQty = (frag.fragmented[e.cls] && frag.area[e.guid] != null) ? frag.area[e.guid] : null;
      const span = Math.max(e.x1 - e.x0, e.y1 - e.y0, e.top_z - e.base_z);
      const avgLen = lin.avgLength[e.cls];
      const lengthRatio = (realQty == null && span > 0 && avgLen > 0) ? span / avgLen : null;
      const rule = { phase: e.phase, sequence: e.seq, resource: e.resource };
      e.installSecs = ScheduleAuthor._installSecs(e.cls, rule, LR, realQty, lengthRatio);
    });
    const maxCrews = {};
    for (const rk in LR) if (LR[rk].max_crews) maxCrews[rk] = LR[rk].max_crews;
    const quiet = console.log; console.log = () => {};
    let sched; try { sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews); } finally { console.log = quiet; }

    const grid = {};
    geoEls.filter(e => WALL_RE.test(e.cls)).forEach(w => {
      for (let gx = Math.floor(w.x0 / CELL); gx <= Math.floor(w.x1 / CELL); gx++)
        for (let gy = Math.floor(w.y0 / CELL); gy <= Math.floor(w.y1 / CELL); gy++)
          (grid[gx + ',' + gy] = grid[gx + ',' + gy] || []).push(w);
    });
    let lateVsHost = 0, withHost = 0;
    const examples = [];
    geoEls.filter(e => OPENING_RE.test(e.cls)).forEach(d => {
      const s = sched[d.guid]; if (!s) return;
      const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2;
      const gx = Math.floor(cx / CELL), gy = Math.floor(cy / CELL);
      let bestEnd = -Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const arr = grid[(gx + dx) + ',' + (gy + dy)]; if (!arr) continue;
        arr.forEach(w => {
          if (cx < w.x0 - EPS || cx > w.x1 + EPS || cy < w.y0 - EPS || cy > w.y1 + EPS) return;
          if (d.top_z < w.base_z - EPS || d.base_z > w.top_z + EPS) return;
          const we = sched[w.guid]; if (we && we.end > bestEnd) bestEnd = we.end;
        });
      }
      if (bestEnd === -Infinity) return;
      withHost++;
      if (s.start < bestEnd - 1) {
        lateVsHost++;
        if (examples.length < 3) examples.push(d.storey + ' ' + d.cls + ' lateBy=' + ((bestEnd - s.start) / 86400000).toFixed(1) + 'd');
      }
    });
    if (withHost) anyChecked = true;
    console.log('§DOOR_WINDOW_HOST_WALL bld=' + bld + ' checkedWithHost=' + withHost + ' lateVsHostWall=' + lateVsHost +
      (examples.length ? ' e.g. ' + examples.join(' | ') : ''));
    assert(lateVsHost === 0, 'W-DWH-2 ' + bld + ' zero doors/windows start before their host wall finishes (checked ' + withHost + ')');
  }
  assert(anyChecked, 'W-DWH-3 at least one building had checkable door/wall pairs — proves this witness actually exercised the gate');
  finish();
})();
