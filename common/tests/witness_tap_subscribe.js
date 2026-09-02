// Witness: HISTORY_KNOB_SIGNAL_TAP §SESSION — bar subscribes to the tap + ONE knob.
// Whitebox §-log on the REAL common/history_tap.js (loaded in node — UMD attaches to globalThis).
// Each assertion NAMES the issue it proves/disproves (CLAUDE.md: tests expose issues).
'use strict';
require('../history_tap.js');            // side-effect: defines globalThis.HistoryTap + globalThis.S
var T = globalThis.HistoryTap, S = globalThis.S;
var fails = 0;
function ok(name, cond, detail) { console.log('§W ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : '')); if (!cond) fails++; }

// The EXACT skip set the viewer adapter passes to historySince (universal_history.js _EXPLICIT_TAGS).
var EXPLICIT = { KERNEL_OP:1, BUILDING_OPEN:1, GRID_MOVE:1, ELEMENT_PLACE:1, ELEMENT_PICK:1,
                 PICK:1, FOCUS:1, PHASE_LENS:1, FILTER:1, ROOM:1, CLASH_INSPECT:1, SECTION_CUT:1, MEASURE:1 };

// ── W-KNOB-ONE: one dial governs the net (proves the two-knob disagreement is gone) ──────────────
// Issue: the bar's depth and the tap's level were independent; dialing one left the other stale.
S('BUILDING_OPEN', 'Opened Duplex');                      // a 'low' milestone tag
S('KBD_ROUTE', 'Alt+X → ghost-xray', { ghost: true });    // a 'high'-only aid tag (also flips ambient.ghost)
T.setKnob('low');
var lo = T.historySince(-1, {}).map(function (e) { return e.tag; });
T.setKnob('high');
var hi = T.historySince(-1, {}).map(function (e) { return e.tag; });
ok('W-KNOB-ONE.low-excludes-aid', lo.indexOf('KBD_ROUTE') === -1 && lo.indexOf('BUILDING_OPEN') !== -1, 'low=[' + lo + ']');
ok('W-KNOB-ONE.high-includes-aid', hi.indexOf('KBD_ROUTE') !== -1, 'high=[' + hi + ']');

// ── W-DRAIN-XC: X/C dot from the stream, no per-feature wiring, no duplicate ──────────────────────
// Issue (the audit headline): §KBD_ROUTE never produced a dot because the bar ignored the tap.
T.clear();
T.seed({ ghost: false, xray: false });   // known ambient (the toggle reducer is relative; W-KNOB-ONE left ghost=true)
var fired = 0; T.onFeed(function () { fired++; });
T.setKnob('high');
S('KBD_ROUTE', 'Alt+X → ghost-xray', { ghost: true });
var fresh = T.historySince(-1, EXPLICIT);
var xc = fresh.filter(function (e) { return e.tag === 'KBD_ROUTE'; })[0];
ok('W-DRAIN-XC.observer-fired', fired >= 1, 'onFeed fired=' + fired);
ok('W-DRAIN-XC.crumb-present', !!xc, xc ? 'label="' + xc.label + '"' : 'MISSING');
ok('W-DRAIN-XC.view-stamped', !!(xc && xc.view && xc.view.ghost === true), 'view=' + JSON.stringify(xc && xc.view));
var hw = xc ? xc.t : -1;
var redrain = T.historySince(hw, EXPLICIT).filter(function (e) { return e.tag === 'KBD_ROUTE'; });
ok('W-DRAIN-XC.no-duplicate', redrain.length === 0, 're-drain at hw=' + hw + ' yields ' + redrain.length);

// ── W-DRAIN-SKIP: explicit tags never double-mint; kernel tier untouched ──────────────────────────
// Issue: the read-only drain must not re-record what an explicit push already minted (op/pick/etc).
T.clear();
S('PICK', 'door 1a2b3c');           // picking.js already HB.pushes ELEMENT_PICK
S('KERNEL_OP', 'committed id=7');    // the signed kernel tier — must stay explicit-only
S('KBD_ROUTE', 'Alt+Z → xray', { xray: true });
var drained = T.historySince(-1, EXPLICIT).map(function (e) { return e.tag; });
ok('W-DRAIN-SKIP.pick-skipped', drained.indexOf('PICK') === -1, 'drained=[' + drained + ']');
ok('W-DRAIN-SKIP.kernel-skipped', drained.indexOf('KERNEL_OP') === -1, 'kernel op never read-only-minted');
ok('W-DRAIN-SKIP.gap-tag-kept', drained.indexOf('KBD_ROUTE') !== -1, 'the uncovered tag still dots');

console.log('§W SUMMARY fails=' + fails);
process.exit(fails ? 1 : 0);
