#!/usr/bin/env node
/**
 * W-UBBL-ROOM-DEMO — §UBBL-TIERS value witness (PURE NODE, REAL Duplex). ubblRoomSizeDemo() is a STATIC per-room UBBL-style
 * DEMO indicator over as-extracted `spatial_structure` IfcSpace rows (UBBL_RULES_GATE.md §SOURCED + §MISCITE, bim-compiler).
 * ISSUE (2026-09-26): it applied the habitable-room minimums (6.5 m², 2.5 m, cited as By-law 42 though 2.5 m is 44(1)(a)) to
 * EVERY room, so a legal bathroom was flagged. Now two tiers from the gazetted text; this witness recomputes both itself:
 *   ANY-ROOM floor (real breach → `flagged`): area ≥ 0.9375 m² (43(b)) · width ≥ 0.75 m (43) · height ≥ 2.0 m (44 proviso)
 *   HABITABLE tier (→ `check`, "would fail IF living room/bedroom"): area ≥ 6.5 (42(1)) · width ≥ 2 (42(2)) · height ≥ 2.5 (44(1)(a))
 *   U1 real data      — Duplex feeds exactly 21 measured IfcSpace rooms.
 *   U2 floor          — `flagged` == the rooms that breach the any-room floor, recomputed here (no misses, no extras).
 *   U3 check          — `check` == the rooms that pass the floor but miss the habitable tier, recomputed here.
 *   U3b no-overflag   — no room is flagged only for missing a habitable minimum (the defect this change fixes); A104
 *                       (1.456 × 2.171 = 3.161 m²) is in `check`, not `flagged`. RED on main (it was flagged).
 *   U4 synthetic WC   — 0.7 × 1.2 × 2.4 m → flagged, citing 43(b) and 43.
 *   U4b height        — 3 × 3 × 1.9 m → flagged (44 proviso); 3 × 3 × 2.2 m → check only (44(1)(a)).
 *   U5 labels         — flagged/unmeasured rows carry the demo label, check rows the "would fail IF" label, verbatim.
 *   U6 params         — thresholds are explicit params (habitable area 30 m² ⇒ recomputed check count).
 *   U7 non-invent     — a NULL-dim room goes to `unmeasured`, never guessed.
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};

var ROOT = path.join(__dirname, '..');
var SdgGate = require(path.join(ROOT, 'sdg_gate.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'Duplex_extracted.db');

var LABEL = "UBBL-style demo indicator — not a compliance verdict";
var CHECK_LABEL = "would fail IF this is a living room/bedroom — room type not in the model";
// independent oracle (gazetted UBBL 1984, UBBL_RULES_GATE.md §SOURCED) — NOT read from sdg_gate.js
var ANY = { area: 0.9375, width: 0.75, height: 2.0 }, HAB = { area: 6.5, width: 2.0, height: 2.5 };
function misses(s, T) { return (s.size_x * s.size_y < T.area) || (Math.min(s.size_x, s.size_y) < T.width) || (s.size_z < T.height); }

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
  console.log('§UBBL-DEMO checked=' + out.checked + ' flagged=' + out.flagged.length + ' check=' + (out.check || []).length + ' unmeasured=' + out.unmeasured.length);
  chk('U1 real data: Duplex feeds exactly 21 measured IfcSpace rooms', out.checked === 21 && out.unmeasured.length === 0, 'checked=' + out.checked);
  (out.flagged || []).concat(out.check || []).forEach(function (f) { console.log('§UBBL-DEMO ' + (f.tier || '?') + ' ' + f.name + ' ' + f.size_x + '×' + f.size_y + '×' + f.size_z + ' ' + JSON.stringify(f.why || f)); });

  var names = function (a) { return (a || []).map(function (f) { return f.name; }).sort(); };
  var expFloor = spaces.filter(function (s) { return misses(s, ANY); }).map(function (s) { return s.name; }).sort();
  var expCheck = spaces.filter(function (s) { return !misses(s, ANY) && misses(s, HAB); }).map(function (s) { return s.name; }).sort();
  chk('U2 floor: flagged == rooms breaching the any-room floor (recomputed)', JSON.stringify(names(out.flagged)) === JSON.stringify(expFloor),
    'gate=[' + names(out.flagged) + '] recomputed=[' + expFloor + ']');
  chk('U3 check: check == rooms passing the floor but missing the habitable tier (recomputed, non-empty)',
    JSON.stringify(names(out.check)) === JSON.stringify(expCheck) && expCheck.length > 0, 'gate=[' + names(out.check) + '] recomputed=[' + expCheck + ']');
  var a104f = (out.flagged || []).find(function (f) { return f.name === 'A104'; }), a104c = (out.check || []).find(function (f) { return f.name === 'A104'; });
  chk('U3b no-overflag: nothing flagged only for a habitable minimum; A104 (3.161 m²) is check, not flagged',
    (out.flagged || []).every(function (f) { return misses(f, ANY); }) && !a104f && !!a104c && Math.abs(a104c.area - 3.161) < 0.001,
    'A104 flagged=' + !!a104f + ' check=' + (a104c ? a104c.area + 'm²' : 'no'));

  var wc = SdgGate.ubblRoomSizeDemo([{ guid: 'FIX1', name: 'FIXTURE-WC', size_x: 0.7, size_y: 1.2, size_z: 2.4 }]);
  chk('U4 synthetic WC 0.7×1.2 m → flagged citing 43(b) + 43', wc.flagged.length === 1 && /43\(b\)/.test(wc.flagged[0].why.join()) && /By-law 43\)/.test(wc.flagged[0].why.join()),
    JSON.stringify(wc.flagged[0] && wc.flagged[0].why));
  var low = SdgGate.ubblRoomSizeDemo([{ guid: 'FIX2', name: 'LOW', size_x: 3, size_y: 3, size_z: 1.9 }, { guid: 'FIX3', name: 'MID', size_x: 3, size_y: 3, size_z: 2.2 }]);
  chk('U4b height: 1.9 m → flagged (44 proviso); 2.2 m → check only (44(1)(a))',
    names(low.flagged).join() === 'LOW' && names(low.check).join() === 'MID' && /44 proviso/.test(low.flagged[0].why.join()) && /44\(1\)\(a\)/.test(low.check[0].why.join()),
    'flagged=[' + names(low.flagged) + '] check=[' + names(low.check) + ']');

  var nul = SdgGate.ubblRoomSizeDemo([{ guid: 'FIX4', name: 'FIXTURE-NULL', size_x: null, size_y: 2, size_z: 2.6 }]);
  var allOuts = [out, wc, low, nul];
  var labelOk = allOuts.every(function (o) {
    return o.label === LABEL && o.flagged.every(function (f) { return f.label === LABEL; }) && (o.check || []).every(function (f) { return f.label === CHECK_LABEL; })
      && o.unmeasured.every(function (u) { return u.label === LABEL; });
  });
  chk('U5 labels: flagged/unmeasured = demo label, check = "would fail IF" label, verbatim', labelOk, labelOk ? '"' + out.label + '"' : 'LABEL MISSING/DRIFTED');

  var strict = SdgGate.ubblRoomSizeDemo(spaces, { habitable: { area: 30 } });
  var exp30 = spaces.filter(function (s) { return !misses(s, ANY) && misses(s, { area: 30, width: HAB.width, height: HAB.height }); }).length;
  chk('U6 params: habitable area is an explicit param (30 m² ⇒ recomputed check count)', strict.check.length === exp30, 'check@30=' + strict.check.length + ' recomputed=' + exp30);
  chk('U7 non-invent: a NULL-dim room goes to unmeasured (no guessing)', nul.checked === 0 && nul.flagged.length === 0 && nul.unmeasured.length === 1, JSON.stringify(nul.unmeasured));

  console.log('W-UBBL-ROOM-DEMO: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
