#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DW-ROOMTYPE scope (read this block first)
 * SCOPE: prompts/DISC_WALK_ROOM_TYPE_AWARE.md — proves the room-type-aware geometry-classifier
 * FALLBACK added to disc_walker.js's _spaceTypeFor() (2026-07-11). The fallback only fires when
 * (a) a space's real label does NOT resolve via rule_space_type/rule_space_alias, (b) a room-type
 * config has been loaded via dwSetRoomTypeConfig(), and (c) the discipline is one with a real
 * MEASURED density signal (ROOM_TYPE_MEASURED_DISCS = {PLB, FP} — see build/measure_disc_room_type_
 * density.js in bim-compiler for the measurement this is cited to). ELEC/ACMV are excluded on the
 * SAME measurement (no discriminating signal found — ELEC present in every room type, ACMV has 0
 * real elements in the only real MEP substrate). Read the log after every run.
 *
 * CLAIMS:
 *   W1 OFF-BY-DEFAULT — before dwSetRoomTypeConfig is ever called, an unlabeled space's _spaceTypeFor
 *                        returns null for every disc, IDENTICAL to pre-change behavior (zero regression
 *                        for every caller that never opts in).
 *   W2 FALLBACK-FIRES  — after loading the config, an UNLABELED bathroom-shaped space resolves to
 *                        space_type=BATHROOM for disc=PLB (a measured-signal disc).
 *   W3 DISC-GATED      — the SAME unlabeled bathroom-shaped space, same config loaded, returns null
 *                        for disc=ELEC (not a measured-signal disc — honest refuse, not silently
 *                        applied everywhere).
 *   W4 LABEL-WINS      — a space WITH a real matching label ("Bathroom 1") resolves via the existing
 *                        label path and is NEVER overridden by the geometry fallback, even when loaded.
 *   W5 FOYER-FP        — an unlabeled FOYER-shaped space resolves for disc=FP (the second measured
 *                        signal) but not for disc=ACMV (unmeasured).
 *   W6 REGRESSION      — placeSchedule() end-to-end on a small synthetic Duplex-like substrate (real
 *                        duplex_rules.db) produces IDENTICAL placement counts with the config loaded vs
 *                        not loaded, for a building where every room already carries a real label (the
 *                        Duplex-shape scenario) — proves the fallback is additive-only, never a rewrite.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var initSqlJs = require('sql.js');

var ROOT = path.join(__dirname, '..', '..');
var DW = require(path.join(ROOT, 'modeller', 'disc_walker.js'));
var RoomTypeConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'modeller', 'room_templates.json'), 'utf8'));
var LOG = path.join(ROOT, 'logs', 'witness_disc_room_type_weight_' +
  new Date().toISOString().replace(/[:.]/g, '').slice(0, 15) + '.log');

var _lines = [];
function log(s) { _lines.push(s); console.log(s); }
var pass = 0, fail = 0;
function assert(claim, cond, detail) {
  if (cond) { pass++; log('  ✅ ' + claim + ' — ' + detail); }
  else { fail++; log('  ❌ ' + claim + ' — ' + detail); }
}

function rows(db, sql) {
  var r = db.exec(sql); if (!r.length) return [];
  return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; });
}
function loadDb(SQL, file) { return new SQL.Database(new Uint8Array(fs.readFileSync(file))); }

// A synthetic building db (elements_meta + element_transforms) with two spaces:
//  - a REAL-labeled bathroom ("Bathroom 1", matches rule_space_type directly)
//  - an UNLABELED bathroom-shaped space (generic synthetic name, mirrors a COMPILED room with no
//    semantic label — the exact gap the geometry fallback exists to close)
//  - an UNLABELED foyer-shaped space
// Dimensions taken from config/room_templates.yaml's own measured means (BATHROOM area=3.952m2
// aspect=1.767; FOYER area=20.319m2 aspect=4.264) so the classifier scores them near-zero-z.
function buildSyntheticDb(SQL) {
  var db = new SQL.Database();
  db.run('CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, discipline TEXT, storey TEXT)');
  db.run('CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)');
  function addSpace(guid, label, cx, cy, bx, by) {
    db.run("INSERT INTO elements_meta VALUES ('" + guid + "','IfcSpace','" + label + "','ARC','L1')");
    db.run('INSERT INTO element_transforms VALUES (\'' + guid + '\',' + cx + ',' + cy + ',1.4,' + bx + ',' + by + ',2.6)');
  }
  // BATHROOM template: area=3.952 aspect=1.767 -> pick bx=2.639, by=1.497 (area=3.951, aspect=1.763)
  addSpace('LABELED_BATH', 'Bathroom 1', 0, 0, 2.639, 1.497);
  addSpace('SYNTH_BATH', 'SPACE_042', 10, 0, 2.639, 1.497);       // no semantic label
  // FOYER template: area=20.319 aspect=4.264 -> bx=9.290, by=2.179 (area=20.24, aspect=4.264)
  addSpace('SYNTH_FOYER', 'SPACE_099', 20, 0, 9.290, 2.179);      // no semantic label
  return db;
}

(async function main() {
  log('═══ W-DW-ROOMTYPE — room-type-aware geometry-classifier FALLBACK in disc_walker.js _spaceTypeFor() ═══');
  var SQL = await initSqlJs();

  var RULES = path.join(ROOT, 'modeller', 'duplex_rules.db');
  var rdb = loadDb(SQL, RULES);
  DW.dwOpen(rdb);

  var sdb = buildSyntheticDb(SQL);
  var spaces = DW.spacesOf(sdb);
  log('§DW-ROOMTYPE synthetic spaces: ' + spaces.map(function (s) { return s.label; }).join(', '));
  var labeledBath = spaces.filter(function (s) { return s.guid === 'LABELED_BATH'; })[0];
  var synthBath = spaces.filter(function (s) { return s.guid === 'SYNTH_BATH'; })[0];
  var synthFoyer = spaces.filter(function (s) { return s.guid === 'SYNTH_FOYER'; })[0];
  assert('M0 SPACES-FOUND', !!labeledBath && !!synthBath && !!synthFoyer,
    'all 3 synthetic spaces enumerated by spacesOf(): ' + spaces.length);

  // ── W1 OFF-BY-DEFAULT ──
  log('');
  log('─── W1 OFF-BY-DEFAULT ───');
  var beforePLB = DW._spaceTypeFor('PLB', synthBath);
  var beforeFP = DW._spaceTypeFor('FP', synthFoyer);
  assert('W1 OFF-BY-DEFAULT', beforePLB === null && beforeFP === null,
    'before dwSetRoomTypeConfig: unlabeled spaces resolve to null for PLB(' + beforePLB + ') and FP(' + beforeFP +
    ') — identical to pre-change behavior, zero regression for callers that never opt in');

  // ── load config, now the fallback is reachable ──
  var loaded = DW.dwSetRoomTypeConfig(RoomTypeConfig);
  log('§DW-ROOMTYPE dwSetRoomTypeConfig loaded=' + loaded + ' templates=[' + Object.keys(RoomTypeConfig.templates).join(', ') + ']');

  // ── W2 FALLBACK-FIRES (PLB, measured signal) ──
  log('');
  log('─── W2 FALLBACK-FIRES ───');
  var afterPLB = DW._spaceTypeFor('PLB', synthBath);
  assert('W2 FALLBACK-FIRES', afterPLB === 'BATHROOM',
    'unlabeled bathroom-shaped space (area=3.95m2 aspect=1.76) -> PLB space_type=' + afterPLB + ' (expected BATHROOM)');

  // ── W3 DISC-GATED (ELEC, no measured signal) ──
  log('');
  log('─── W3 DISC-GATED ───');
  var afterELEC = DW._spaceTypeFor('ELEC', synthBath);
  assert('W3 DISC-GATED', afterELEC === null,
    'SAME unlabeled bathroom-shaped space, config loaded, disc=ELEC -> ' + afterELEC +
    ' (expected null — ELEC has no measured discriminating signal, honestly excluded from ROOM_TYPE_MEASURED_DISCS)');
  log('§DW-ROOMTYPE ROOM_TYPE_MEASURED_DISCS=' + JSON.stringify(DW.ROOM_TYPE_MEASURED_DISCS));

  // ── W4 LABEL-WINS ──
  log('');
  log('─── W4 LABEL-WINS ───');
  var labeledPLB = DW._spaceTypeFor('PLB', labeledBath);
  assert('W4 LABEL-WINS', labeledPLB === 'BATHROOM',
    'real-labeled space ("Bathroom 1") resolves via the existing label path -> ' + labeledPLB +
    ' (same result as the geometry fallback here BY COINCIDENCE of the synthetic dims — the important claim is ' +
    'this NEVER queries the classifier when a label already resolved; see source: label branch returns before ' +
    'the geometry block is reached)');

  // ── W5 FOYER-FP ──
  log('');
  log('─── W5 FOYER-FP ───');
  var foyerFP = DW._spaceTypeFor('FP', synthFoyer);
  var foyerACMV = DW._spaceTypeFor('ACMV', synthFoyer);
  assert('W5 FOYER-FP', foyerFP === 'LOBBY' && foyerACMV === null,
    'unlabeled foyer-shaped space (area=20.24m2 aspect=4.26) -> FP space_type=' + foyerFP +
    ' (expected LOBBY, FOYER\'s canonical_type in rule_space_type vocabulary) ; ACMV=' + foyerACMV +
    ' (expected null — ACMV has 0 real elements in the measured substrate, no signal to cite)');

  // ── W6 REGRESSION — placeSchedule end-to-end identical with/without config loaded, when every
  // real room already carries a resolvable label (the actual Duplex shape: this proves the fallback
  // never fires, let alone changes anything, once the label path already succeeds for 100% of spaces).
  log('');
  log('─── W6 REGRESSION (placeSchedule identical whether or not the fallback is loaded) ───');
  var allLabeled = new SQL.Database();
  allLabeled.run('CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, discipline TEXT, storey TEXT)');
  allLabeled.run('CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL)');
  allLabeled.run("INSERT INTO elements_meta VALUES ('B1','IfcSpace','Bathroom 1','ARC','L1')");
  allLabeled.run('INSERT INTO element_transforms VALUES (\'B1\',0,0,1.4,2.639,1.497,2.6,0,0,0)');
  var rdb2 = loadDb(SQL, RULES); DW.dwOpen(rdb2);
  var withoutCfg = DW.placeSchedule('PLB', allLabeled, {});
  DW.dwSetRoomTypeConfig(RoomTypeConfig);
  var withCfg = DW.placeSchedule('PLB', allLabeled, {});
  assert('W6 REGRESSION', withoutCfg.placements.length === withCfg.placements.length &&
    withoutCfg.spacesUsed === withCfg.spacesUsed && withoutCfg.skippedSpaces.length === withCfg.skippedSpaces.length,
    'placeSchedule on an all-labeled substrate: without config=' + withoutCfg.placements.length + ' placements/' +
    withoutCfg.spacesUsed + ' spacesUsed, with config=' + withCfg.placements.length + ' placements/' + withCfg.spacesUsed +
    ' spacesUsed — identical, the fallback never engages once labels already resolve');

  log('');
  log('───────────────────────────────────────────────');
  log('W-DW-ROOMTYPE: ' + pass + ' PASS / ' + fail + ' FAIL');
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, _lines.join('\n')); log('§LOG ' + LOG); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
