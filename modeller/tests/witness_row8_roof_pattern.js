#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROW8-ROOF-PATTERN scope (read the log after every run)
 * SCOPE: MODELLER_MASTER §OPEN LIST row 8 (O10) — "roof plates walked PER-ELEMENT on the measured pattern (user accepted
 * 1.3 % count err; gate = positional)". Spec: bim-compiler prompts/Modeller/NEXT_0926/SPEC_ROW8_ROOF_PERELEMENT.md.
 * Drives the PRODUCTION engine path the Outliner "roof" row reaches — DiscWalker.dwWalk('roof', bdb, {schedule:true})
 * → placeMeasured — in Node against the real resident DBs (Terminal_ARC.db 33,324 IfcPlate = the oracle; HHS/Clinic/
 * Hospital = buildings whose IfcPlate are glazing panels, not a roof tessellation). No browser: the engine is dual-mode.
 *
 * ISSUE THIS PROVES/DISPROVES: "the shipped roof walk is a BULK AREA FILL at the flat band-mid z — RMS 2.627 m to the
 * real plates, 10,584 of 33,324 placed (−68 %), cadence 0.45 m vs the real 0.15 m — and it FABRICATES plate arrays on
 * buildings that have no roof tessellation (Clinic: 331 plates, RMS 638 m)." Measured on origin/main 2b570a26,
 * 2026-09-26 (session log measure_roof_base.log). RED-first there; GREEN on §ROOF-PATTERN.
 *   R0 TESSELLATING-ROW  — exactly ONE rule_placement row in terminal_rules.db (roof/IfcPlate) and ZERO in duplex_rules.db
 *                          has fill = bbox_dx·bbox_dy·n/src_area ≥ 0.5 → the branch is derived from measured numbers, not a
 *                          class whitelist, and can never reach an MEP row.
 *   R1 PATTERN-MEASURED  — §ROOF-PATTERN on Terminal: n=33324, modal-unit share ≥ 90 %, nn 0.150 ± 0.01, cv ≤ 0.05,
 *                          x-lattice 0.495 ± 0.005 (the row's "plate-centre spacing uniformity measured").
 *   R2 NO-DUPLICATE      — the measured array IS the building's own plates → 0 placed + §ROOF-PATTERN-PRESENT (an exact second
 *                          copy is not generation). RED on main: 10,584 plates filled at the band-mid z, RMS 2.627 m.
 *   R3 SEEDED            — every real IfcPlate is discipline='ARC', i.e. already committed by the ARC seed.
 *   R5 NO-FAKE-ARRAY     — HHS + Clinic (no plates in the roof band) → 0 placed with §ROOF-PATTERN-NOPLATES; Hospital
 *                          (390 glazing panels IN the band, unit 0.19×0.97×1.86, cv 0.16) → 0 placed with
 *                          §ROOF-PATTERN-REFUSE; no §NOSPACES-TOPUP for roof anywhere. RED on main: Clinic 331.
 *   R6 FALSIFIER         — Terminal with its IfcPlate rows deleted → 0 placed, §ROOF-PATTERN-NOPLATES, no top-up
 *                          (the branch fabricates nothing when the measured array is absent).
 *   R7 OTHER-DISCS-SAME  — ELEC/FP/ACMV/PLB measured-band placements on Terminal_ARC.db: count + sorted-xyz hash printed;
 *                          asserted equal to ROW8_BASE_HASH when given (run once on base, once on fix), else INCONCLUSIVE.
 * INCONCLUSIVE (never PASS) when Terminal_ARC.db is absent or carries 0 IfcPlate rows.
 * Run: NODE_PATH=~/bim-ootb/tests/node_modules:~/bim-compiler/node_modules node modeller/tests/witness_row8_roof_pattern.js
 *      [ROOT=<tree> ROW8_BASE_HASH=<hash from the base run>]
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
var initSqlJs = require('sql.js');
var DW = require(path.join(ROOT, 'modeller', 'disc_walker.js'));
var pass = 0, fail = 0, inconclusive = 0;
function chk(n, c, x) { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } }
function inc(n, x) { inconclusive++; console.log('  ⚪ ' + n + ' INCONCLUSIVE' + (x ? '  ' + x : '')); }
function rows(db, sql) { var r = db.exec(sql); if (!r.length) return []; var c = r[0].columns; return r[0].values.map(function (v) { var o = {}; c.forEach(function (k, i) { o[k] = v[i]; }); return o; }); }
function q(arr, p) { var s = arr.slice().sort(function (a, b) { return a - b; }); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
function rms(arr) { return Math.sqrt(arr.reduce(function (s, v) { return s + v * v; }, 0) / arr.length); }
function Grid(pts, cell) { this.cell = cell; this.m = {}; this.pts = pts; for (var i = 0; i < pts.length; i++) { var k = this.key(pts[i]); (this.m[k] = this.m[k] || []).push(i); } }
Grid.prototype.key = function (p) { var c = this.cell; return Math.floor(p.x / c) + ',' + Math.floor(p.y / c) + ',' + Math.floor(p.z / c); };
Grid.prototype.nearest = function (p, skip) {
  var c = this.cell, cx = Math.floor(p.x / c), cy = Math.floor(p.y / c), cz = Math.floor(p.z / c), best = Infinity;
  for (var ring = 0; ring <= 6; ring++) {
    for (var dx = -ring; dx <= ring; dx++) for (var dy = -ring; dy <= ring; dy++) for (var dz = -ring; dz <= ring; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== ring) continue;
      var b = this.m[(cx + dx) + ',' + (cy + dy) + ',' + (cz + dz)]; if (!b) continue;
      for (var j = 0; j < b.length; j++) { if (b[j] === skip) continue; var o = this.pts[b[j]]; var d = Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z); if (d < best) best = d; }
    }
    if (isFinite(best) && best <= ring * c) break;
  }
  return best;
};
function nnMedian(pts) { var g = new Grid(pts, 2), ds = []; for (var i = 0; i < pts.length; i++) { var d = g.nearest(pts[i], i); if (isFinite(d)) ds.push(d); } return ds.length ? q(ds, 0.5) : NaN; }
function hashXYZ(pts) { var s = pts.map(function (p) { return p.ifc_class + ':' + p.x.toFixed(4) + ',' + p.y.toFixed(4) + ',' + p.z.toFixed(4); }).sort().join('|'); var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(16); }
function open(SQL, file) { var p = path.join(ROOT, 'modeller', file); if (!fs.existsSync(p) || fs.statSync(p).size === 0) return null; return new SQL.Database(new Uint8Array(fs.readFileSync(p))); }
function capture(fn) { var lines = [], orig = console.log; console.log = function () { var t = Array.prototype.join.call(arguments, ' '); lines.push(t); orig.apply(console, arguments); }; try { return { r: fn(), log: lines }; } finally { console.log = orig; } }

(async function () {
  console.log('═══ W-ROW8-ROOF-PATTERN — roof plates per-element on the measured pattern (Node, production dwWalk path) ROOT=' + ROOT + ' ═══');
  var SQL = await initSqlJs();
  var rulesT = open(SQL, 'terminal_rules.db'), rulesD = open(SQL, 'duplex_rules.db');
  // R0 — the tessellating test over EVERY placement row of both rules DBs
  function fills(db) { return rows(db, 'SELECT disc, ifc_class, bbox_dx, bbox_dy, n_measured, src_storey_area_m2 FROM rule_placement').map(function (r) { return { k: r.disc + '/' + r.ifc_class, fill: (r.bbox_dx > 0 && r.bbox_dy > 0 && r.n_measured > 0 && r.src_storey_area_m2 > 0) ? r.bbox_dx * r.bbox_dy * r.n_measured / r.src_storey_area_m2 : 0 }; }); }
  var fT = fills(rulesT), fD = rulesD ? fills(rulesD) : [];
  var tessT = fT.filter(function (f) { return f.fill >= 0.5; }), tessD = fD.filter(function (f) { return f.fill >= 0.5; });
  var maxOtherT = Math.max.apply(null, fT.filter(function (f) { return f.k !== 'roof/IfcPlate'; }).map(function (f) { return f.fill; }));
  console.log('  §ROW8-FILL terminal rows=' + fT.length + ' tessellating=' + tessT.map(function (f) { return f.k + '=' + f.fill.toFixed(2); }).join(',') + ' maxOther=' + maxOtherT.toFixed(3) + ' | duplex rows=' + fD.length + ' tessellating=' + tessD.length);
  chk('R0 TESSELLATING-ROW (exactly roof/IfcPlate in terminal_rules, none in duplex_rules — derived, no whitelist)', tessT.length === 1 && tessT[0].k === 'roof/IfcPlate' && tessD.length === 0, 'terminal=' + tessT.map(function (f) { return f.k; }).join(',') + ' duplex=' + tessD.length + ' next-highest fill=' + maxOtherT.toFixed(3));

  // Terminal — the oracle
  DW.dwOpen(rulesT);
  var tdb = open(SQL, 'Terminal_ARC.db');
  var real = tdb ? rows(tdb, "SELECT t.center_x x, t.center_y y, t.center_z z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class='IfcPlate'") : [];
  if (!tdb || !real.length) { inc('R1-R4,R6', 'Terminal_ARC.db absent or 0 IfcPlate rows — nothing judged'); }
  else {
    var cap = capture(function () { return DW.dwWalk('roof', tdb, 'Terminal', { schedule: true }); });
    var w = cap.r, pl = (w.placements || []).map(function (p) { return { x: p.x, y: p.y, z: p.z, prov: p.prov }; });
    var pat = cap.log.find(function (l) { return /§ROOF-PATTERN-PRESENT roof\/IfcPlate/.test(l); }) || '';
    var m = { n: +((pat.match(/ n=(\d+)/) || [])[1] || 0), share: +((pat.match(/share=([\d.]+)%/) || [])[1] || 0), nn: +((pat.match(/ nn=([\d.]+)/) || [])[1] || NaN), cv: +((pat.match(/ cv=([\d.]+)/) || [])[1] || NaN), sx: +((pat.match(/ sx=([\d.]+)/) || [])[1] || NaN) };
    chk('R1 PATTERN-MEASURED (§ROOF-PATTERN: n=33324, share ≥ 90 %, nn 0.150±0.01, cv ≤ 0.05, sx 0.495±0.005)',
      m.n === real.length && m.share >= 90 && Math.abs(m.nn - 0.150) <= 0.01 && m.cv <= 0.05 && Math.abs(m.sx - 0.495) <= 0.005,
      pat ? pat.replace(/^§DW /, '').slice(0, 160) : 'no §ROOF-PATTERN line (base: bulk fill)');
    // §ROOF-PATTERN-PRESENT (review 2026-09-26): the measured array is the building's own IfcPlate rows, already committed by the
    // ARC seed (discipline='ARC'). The walk must NOT re-place them — an exact second copy (RMS 0 by identity) is not generation.
    var seeded = rows(tdb, "SELECT COUNT(*) n FROM elements_meta WHERE ifc_class='IfcPlate' AND discipline='ARC'")[0];
    chk('R2 NO-DUPLICATE (the array is present → 0 placed, not 33,324 copies; base placed 10,584 fill at RMS 2.627)',
      pl.length === 0 && /nothing to generate/.test(pat), 'placed=' + pl.length + ' refused=' + JSON.stringify(w.refused || null));
    chk('R3 SEEDED (every real IfcPlate is ARC-discipline, i.e. already on screen from the seed)', seeded && seeded.n === real.length,
      'ARC IfcPlate=' + (seeded && seeded.n) + ' real=' + real.length);
    // R6 falsifier — same substrate, plates deleted
    var fdb = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ROOT, 'modeller', 'Terminal_ARC.db'))));   // fresh buffer (sql.js shares storage otherwise — RESUME trap)
    fdb.run("DELETE FROM element_transforms WHERE guid IN (SELECT guid FROM elements_meta WHERE ifc_class='IfcPlate')"); fdb.run("DELETE FROM elements_meta WHERE ifc_class='IfcPlate'");
    var capF = capture(function () { return DW.dwWalk('roof', fdb, 'Terminal-noplates', { schedule: true }); });
    var topupF = capF.log.some(function (l) { return /§NOSPACES-TOPUP roof/.test(l); }), nopl = capF.log.some(function (l) { return /§ROOF-PATTERN-NOPLATES/.test(l); });
    chk('R6 FALSIFIER (plates deleted → 0 placed, §ROOF-PATTERN-NOPLATES, no §NOSPACES-TOPUP: fabricates nothing)', (capF.r.placed || 0) === 0 && nopl && !topupF, 'placed=' + (capF.r.placed || 0) + ' noplates=' + nopl + ' topup=' + topupF);
    fdb.close();
  }
  // R5 — three real residents whose IfcPlate are glazing panels, not a roof tessellation
  var r5 = [], r5ok = true;
  [['HHS', 'HHS_ARC.db', 'NOPLATES'], ['Clinic', 'Clinic_ARC.db', 'NOPLATES'], ['Hospital', 'Hospital_ARC.db', 'REFUSE']].forEach(function (b) {
    var db = open(SQL, b[1]); if (!db) { r5.push(b[0] + ':absent'); return; }
    var c = capture(function () { return DW.dwWalk('roof', db, b[0], { schedule: true }); });
    var placed = c.r.placed || 0, line = c.log.find(function (l) { return /§ROOF-PATTERN-(NOPLATES|REFUSE)/.test(l); }) || '';
    var kind = (line.match(/§ROOF-PATTERN-(NOPLATES|REFUSE)/) || [])[1] || 'none', topup = c.log.some(function (l) { return /§NOSPACES-TOPUP roof/.test(l); });
    var ok = placed === 0 && kind === b[2] && !topup; r5ok = r5ok && ok; r5.push(b[0] + ':placed=' + placed + ' ' + kind + (topup ? ' TOPUP' : ''));
    db.close();
  });
  chk('R5 NO-FAKE-ARRAY (HHS/Clinic → NOPLATES, Hospital → REFUSE, all 0 placed, no top-up; base Clinic 331 plates at RMS 638 m)', r5ok, r5.join(' | '));
  // R7 — the other terminal_rules disciplines' measured-band placements are unchanged (hash across base/fix runs)
  if (tdb) {
    var others = [];
    // same production entry as the roof (dwWalk → placeMeasured for a terminal_rules resident); host-bind off so the
    // hash is the placer's own output, not the shim's — the branch under test sits before either.
    ['ELEC', 'FP', 'ACMV', 'PLB'].forEach(function (d) { var c = capture(function () { return DW.dwWalk(d, tdb, 'Terminal', { schedule: true, noHostBind: true }); }); (c.r.placements || []).forEach(function (p) { others.push({ ifc_class: p.ifc_class, x: p.x, y: p.y, z: p.z }); }); });
    var h = hashXYZ(others);
    console.log('  §ROW8-OTHERS discs=ELEC,FP,ACMV,PLB placements=' + others.length + ' hash=' + h);
    if (process.env.ROW8_BASE_HASH) chk('R7 OTHER-DISCS-SAME (ELEC/FP/ACMV/PLB placeMeasured byte-identical to base run)', h === process.env.ROW8_BASE_HASH, 'hash=' + h + ' base=' + process.env.ROW8_BASE_HASH + ' n=' + others.length);
    else inc('R7 OTHER-DISCS-SAME', 'no ROW8_BASE_HASH given — hash=' + h + ' n=' + others.length + ' (compare against the base run)');
    tdb.close();
  } else inc('R7 OTHER-DISCS-SAME', 'no Terminal_ARC.db');
  console.log('W-ROW8-ROOF-PATTERN: ' + pass + ' PASS / ' + fail + ' FAIL / ' + inconclusive + ' INCONCLUSIVE');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('FATAL', e && e.stack || e); process.exit(2); });
