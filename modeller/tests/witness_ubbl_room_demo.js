#!/usr/bin/env node
/**
 * W-UBBL-ROOM-DEMO — §UBBL-DEMO value witness (PURE NODE, REAL Duplex). The 5th sdg_gate case:
 * ubblRoomSizeDemo() — a STATIC per-room UBBL-style DEMO indicator over as-extracted `spatial_structure`
 * IfcSpace rows (NOT delta-based like cases 1-4; a pre-existing undersized room is exactly what it
 * reports). Implementing UBBL_RULES_GATE.md §2 (bim-compiler prompts). DEMO/MOCKUP SCOPE ONLY
 * (user decision 2026-07-05) — every output must carry the not-a-compliance-verdict label verbatim.
 * Only the two independently-verified By-Law 42 numbers are wired: area >= 6.5 m² ("all other rooms"
 * floor), headroom >= 2.5 m. No 11/9.3 m² tiers, no per-type thresholds (spec §1c: classifier BLOCKED).
 *
 *   U1 real data      — Duplex's REAL spatial_structure has exactly 21 IfcSpace rooms, all measured
 *                       (issue: does the extraction actually feed the gate 21 real rooms, or fewer?)
 *   U2 real flags     — the gate names EXACTLY the rooms whose measured size_x*size_y < 6.5 m²
 *                       (recomputed independently in this witness from the same DB rows — the witness
 *                       does not trust the gate's own arithmetic), incl. spec §2's example A104
 *                       (1.456×2.171 = 3.161 m²) (issue: does the gate flag the right real rooms with
 *                       the right measured numbers — no false positives, no misses?)
 *   U3 real headroom  — zero Duplex rooms sit below 2.5 m (min measured size_z = 2.581) — so the
 *                       belowHeadroom branch CANNOT be proven on real data; U4b covers it
 *                       (issue: is "no headroom flags" a real measurement result, not a dead branch?)
 *   U4 synthetic fire — a 1m×1m fixture room IS flagged belowArea (issue: does the gate silently pass
 *                       an obviously undersized room? must be NO)
 *   U4b synthetic hdr — a 3m×3m×2.0m fixture IS flagged belowHeadroom (issue: is the headroom branch
 *                       dead code given no real Duplex room can trip it? must be NO)
 *   U5 label          — EVERY output (summary + each flagged row) carries the demo-indicator label
 *                       VERBATIM (issue: can any result escape the not-a-compliance-verdict guardrail?)
 *   U6 non-invent     — thresholds are explicit params (raise minArea to 30 ⇒ more rooms flag);
 *                       nothing hardcoded beyond the two §1b defaults
 *   U7 non-invent     — a room with NULL dims goes to `unmeasured`, never guessed at
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};

var ROOT = path.join(__dirname, '..');
var SdgGate = require(path.join(ROOT, 'sdg_gate.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'Duplex_extracted.db');

var LABEL = "UBBL-style demo indicator (By-Law 42, 'all other rooms' minimum only) — not a compliance verdict";

var pass = 0, fail = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  console.log('═══ W-UBBL-ROOM-DEMO — §UBBL-DEMO static room-size indicator (node, REAL Duplex) ═══');
  var db = new SQL.Database(fs.readFileSync(DBPATH));
  var res = db.exec("SELECT guid, name, size_x, size_y, size_z FROM spatial_structure WHERE type='IfcSpace' ORDER BY name");
  var spaces = (res[0] ? res[0].values : []).map(function (v) {
    return { guid: v[0], name: v[1], size_x: v[2], size_y: v[3], size_z: v[4] };
  });

  // U1 — real data: 21 measured rooms reach the gate
  var out = SdgGate.ubblRoomSizeDemo(spaces);
  console.log('§UBBL-DEMO checked=' + out.checked + ' flagged=' + out.flagged.length + ' unmeasured=' + out.unmeasured.length);
  chk('U1 real data: Duplex feeds exactly 21 measured IfcSpace rooms', out.checked === 21 && out.unmeasured.length === 0, 'checked=' + out.checked);

  // U2 — real flags: witness recomputes the below-area set INDEPENDENTLY from the same DB rows
  var expectBelow = spaces.filter(function (s) { return s.size_x * s.size_y < 6.5; }).map(function (s) { return s.name; }).sort();
  var gotBelow = out.flagged.filter(function (f) { return f.belowArea; }).map(function (f) { return f.name; }).sort();
  out.flagged.forEach(function (f) {
    console.log('§UBBL-DEMO FLAG ' + f.name + ' ' + f.size_x + '×' + f.size_y + '=' + f.area + 'm² z=' + f.size_z + 'm'
      + (f.belowArea ? ' <' + f.minArea + 'm²' : '') + (f.belowHeadroom ? ' <' + f.minHeadroom + 'm' : ''));
  });
  chk('U2 real flags: gate names exactly the measured below-6.5m² rooms (no misses, no false positives)',
    JSON.stringify(gotBelow) === JSON.stringify(expectBelow) && gotBelow.length > 0,
    'gate=[' + gotBelow + '] recomputed=[' + expectBelow + ']');
  var a104 = out.flagged.find(function (f) { return f.name === 'A104'; });
  chk('U2b spec §2 example A104: 1.456×2.171 = 3.161 m² < 6.5 (verified against live DB, not copied)',
    !!a104 && a104.belowArea && Math.abs(a104.area - 3.161) < 0.001 && Math.abs(a104.size_x - 1.456) < 0.001 && Math.abs(a104.size_y - 2.171) < 0.001,
    a104 ? a104.size_x + '×' + a104.size_y + '=' + a104.area + 'm²' : 'A104 NOT FLAGGED');

  // U3 — real headroom: no Duplex room is below 2.5m, and that matches the raw measurements
  var minZ = Math.min.apply(null, spaces.map(function (s) { return s.size_z; }));
  var hdrFlags = out.flagged.filter(function (f) { return f.belowHeadroom; });
  chk('U3 real headroom: zero rooms below 2.5m — consistent with min measured size_z',
    hdrFlags.length === 0 && minZ >= 2.5, 'minZ=' + minZ.toFixed(3) + 'm hdrFlags=' + hdrFlags.length);

  // U4 — synthetic fire: does the gate silently pass an obviously undersized room? Must be NO.
  var tiny = SdgGate.ubblRoomSizeDemo([{ guid: 'FIX1', name: 'FIXTURE-1x1', size_x: 1, size_y: 1, size_z: 2.6 }]);
  var tf = tiny.flagged[0];
  chk('U4 synthetic 1m×1m fixture fires belowArea (gate does NOT silently pass an undersized room)',
    tiny.flagged.length === 1 && tf.belowArea && !tf.belowHeadroom && Math.abs(tf.area - 1) < 1e-9,
    'flagged=' + JSON.stringify(tiny.flagged));

  // U4b — synthetic headroom: the belowHeadroom branch is not dead code (U3 shows real data can't trip it)
  var low = SdgGate.ubblRoomSizeDemo([{ guid: 'FIX2', name: 'FIXTURE-LOW', size_x: 3, size_y: 3, size_z: 2.0 }]);
  var lf = low.flagged[0];
  chk('U4b synthetic 2.0m-headroom fixture fires belowHeadroom (branch not dead despite no real trigger)',
    low.flagged.length === 1 && lf.belowHeadroom && !lf.belowArea, 'flagged=' + JSON.stringify(low.flagged));

  // U5 — label: EVERY output carries the demo-indicator label verbatim
  var allOuts = [out, tiny, low];
  var labelOk = allOuts.every(function (o) {
    return o.label === LABEL && o.flagged.every(function (f) { return f.label === LABEL; })
      && o.unmeasured.every(function (u) { return u.label === LABEL; });
  });
  chk('U5 label: summary + every flagged row says the not-a-compliance-verdict label VERBATIM', labelOk, labelOk ? '"' + out.label + '"' : 'LABEL MISSING/DRIFTED');

  // U6 — non-invent: thresholds are explicit params, not buried constants
  var strict = SdgGate.ubblRoomSizeDemo(spaces, { minArea: 30 });
  var below30 = spaces.filter(function (s) { return s.size_x * s.size_y < 30; }).length;
  chk('U6 non-invent: minArea is an explicit param (30m² ⇒ recomputed count matches)',
    strict.flagged.filter(function (f) { return f.belowArea; }).length === below30,
    'flagged@30=' + strict.flagged.length + ' recomputed=' + below30);

  // U7 — non-invent: NULL dims are reported unmeasured, never guessed
  var nul = SdgGate.ubblRoomSizeDemo([{ guid: 'FIX3', name: 'FIXTURE-NULL', size_x: null, size_y: 2, size_z: 2.6 }]);
  chk('U7 non-invent: a NULL-dim room goes to unmeasured (checked=0, flagged=0 — no guessing)',
    nul.checked === 0 && nul.flagged.length === 0 && nul.unmeasured.length === 1 && nul.unmeasured[0].name === 'FIXTURE-NULL',
    JSON.stringify(nul.unmeasured));

  console.log('W-UBBL-ROOM-DEMO: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
