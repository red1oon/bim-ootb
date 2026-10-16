#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — prompts/EGRESS_SANITY.md T3 witness (READ THE LOG after every run)
 * SCOPE: proves viewer/egress_sanity.js's EgressSanity.evaluate() against (1) a synthetic door
 * fixture (known-narrow, known-wide) in a real in-memory sql.js DB, and (2) a regression guard
 * against real buildings/Hospital_meta.db — the evaluator's real door_clear_width/circulation_
 * distance/isolated_room counts, now that rule 2 tries RoomGraph.escapeRoute() first (real exit
 * detection, prompts/EXIT_DETECTION.md) and falls back to circulation-spine distance only when
 * escapeRoute() can't reach one (see witness_egress_travel_distance.js for the underlying
 * RoomGraph numbers this evaluator is built on — 149/156 rooms reach a real exit post-fix, 7
 * isolated).
 * RUN: node tests/test_egress_sanity_rules.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require('./_sqljs.js').requireSqlJs();   // §SQLJS_MISSING: local dep first, sibling checkout second — never a bare MODULE_NOT_FOUND
const EgressSanity = require('../viewer/egress_sanity.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const SCHEMA = `
CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT);
CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL);
`;

(async () => {
  console.log('§W-EGRESS-SANITY synthetic door fixture');
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(SCHEMA);

  function meta(guid, cls, name, storey) { return [guid, cls, name, storey, 'ARC', '', '', 'Fixture']; }
  function xform(guid, cx, cy, cz, bx, by, bz) { return [guid, cx, cy, cz, 0, 0, 0, bx, by, bz]; }

  db.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', meta('door-narrow', 'IfcDoor', 'Narrow Door', 'L1'));
  db.run('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?,?,?,?)', xform('door-narrow', 0, 0, 1, 0.6, 0.2, 2.1)); // width 0.6 < critical 0.80
  db.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', meta('door-wide', 'IfcDoor', 'Wide Door', 'L1'));
  db.run('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?,?,?,?)', xform('door-wide', 10, 0, 1, 1.2, 0.2, 2.1)); // width 1.2 > warning 0.85

  function dbQuery(sql, params) { const r = params ? db.exec(sql, params) : db.exec(sql); return r.length ? r[0].values : []; }
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '../viewer/rates/egress_rules.json'), 'utf8'));
  const logs = [];
  const rows = EgressSanity.evaluate(dbQuery, rules, { log: (m) => logs.push(m) });
  logs.forEach(l => console.log('  ' + l));
  const byGuid = {};
  rows.forEach(r => { (byGuid[r.guid] = byGuid[r.guid] || []).push(r); });

  // door_clear_width ships WARNING-ceiling only (max_severity in egress_rules.json) — same
  // discipline as every other uncited threshold in this PR — so a below-critical door still
  // surfaces as severity 'WARNING', not 'CRITICAL'; the ratio (0.6m, under critical_m 0.80) is
  // what proves it would be critical if this rule were ever un-capped.
  chk('narrow door flagged (WARNING-capped, ratio proves it is below critical_m)',
    (byGuid['door-narrow'] || []).some(r => r.rule === 'door_clear_width' && r.severity === 'WARNING' && r.ratio < 0.80),
    JSON.stringify(byGuid['door-narrow']));
  chk('wide door NOT flagged', !byGuid['door-wide'], JSON.stringify(byGuid['door-wide']));

  // ── Real Hospital_meta.db regression guard — full evaluator pipeline, not just raw RoomGraph ──
  // BIM_BUILDINGS: a worktree's buildings/ holds only the two TRACKED DBs, so without it this
  // real-DB guard reports itself skipped exactly where it is most needed. Never a symlink INTO
  // buildings/ (T11.5 trap 5).
  const HOSPITAL_DB = path.join(process.env.BIM_BUILDINGS || path.join(__dirname, '../buildings'), 'Hospital_meta.db');
  if (fs.existsSync(HOSPITAL_DB)) {
    console.log('§W-EGRESS-SANITY real Hospital_meta.db');
    const hdb = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL_DB)));
    function hq(sql, params) { const r = params ? hdb.exec(sql, params) : hdb.exec(sql); return r.length ? r[0].values : []; }
    const hlogs = [];
    const hrows = EgressSanity.evaluate(hq, rules, { log: (m) => hlogs.push(m) });
    hlogs.forEach(l => console.log('  ' + l));

    const doorRows = hrows.filter(r => r.rule === 'door_clear_width');
    chk('Hospital door_clear_width: 0 flagged (all 440 real doors ≥0.859m, matches EGRESS_SANITY.md SOURCE OF TRUTH)',
      doorRows.length === 0, 'count=' + doorRows.length);

    const isolatedRows = hrows.filter(r => r.rule === 'isolated_room');
    chk('Hospital isolated_room count matches RoomGraph ground truth (7)', isolatedRows.length === 7, 'count=' + isolatedRows.length);

    const circRows = hrows.filter(r => r.rule === 'circulation_distance');
    chk('Hospital circulation_distance flags a large majority now that it measures real exit distance (>=100 of ~149 reachable rooms)',
      circRows.length >= 100, 'count=' + circRows.length);
    const viaExit = circRows.filter(r => r.target === 'exit').length;
    chk('Hospital circulation_distance rows are mostly measuring real EXIT distance, not the fallback',
      viaExit > 0 && viaExit >= circRows.length * 0.8, 'viaExit=' + viaExit + '/' + circRows.length);
  } else {
    console.log('§W-EGRESS-SANITY SKIP real-DB regression guard — buildings/Hospital_meta.db not present in this worktree');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
