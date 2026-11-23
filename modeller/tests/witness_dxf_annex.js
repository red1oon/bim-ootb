#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-L40 (an annex volume on a storey, prompts/DXF2BIM_MODELLER_LANE.md §L40). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a lower annex beside the main volume on one plan (a garage beside a house) broke the main volume: the upper slab's underside
 * conflicted (every lower exterior wall counted), the main volume's walls left their face (bounding-box test), and a 5.01 m garage door was over gap_max.
 *   L40b R1   — the upper slab's underside comes from the lower walls UNDER the upper footprint; falsifier: the same low walls moved under it -> the conflict is back.
 *   (R2, a face rule for walls, was measured and WITHDRAWN: an elevation band cannot tell depth, JKR3 E4 regressed; with R1 the walls an annex pulls off the
 *    bounding-box face fall to the slab-above convention at the same height - the BIMCompiler garage witness W-S22g proves the main volume unchanged.)
 *   L40d R3   — a gap over gap_max with ONE drawn opening spanning it is bridged (gap_stated_by); falsifiers: the same gap with a narrower opening, or two openings, stays unbounded.
 * Usage: node modeller/tests/witness_dxf_annex.js   (synthetic ops, no input files)
 */
'use strict';
const path = require('path'), crypto = require('crypto'), D = path.join(__dirname, '..', 'dxf2bim') + '/';
const SH = require(D + 'dxf2shell.js'), SHC = require(D + 'dxf2shell_config.js'), CFG = SHC.CFG;
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0, n = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { n++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
let hid = 0; const wall = (r, extra) => ({ op_type: 'DXF_WALL', output_guid: 'w' + (++hid), input_guids: [], params: Object.assign({ handle: (100 + hid).toString(16), part: 0, layer: 'A-WALL-FULL', run_id: 'r', rect: r, footprint: true }, extra || {}) });
const seen = (h, z) => ({ height_source: 'elevation', base: 0, height: h, pending_elevation: false, ...(z || {}) });

// ---- L40b R1: house 0..10 x 0..10 (two storeys), annex x -6..0 one storey lower ----
const ring = (x0, y0, x1, y1, t, ex) => [wall([x0, y0, x1, y0 + t], ex), wall([x0, y1 - t, x1, y1], ex), wall([x0, y0, x0 + t, y1], ex), wall([x1 - t, y0, x1, y1], ex)];
const upper = { level: 3, ops: ring(0, 0, 10, 10, 0.3, seen(2.75)) };
const houseLow = ring(0, 0, 10, 10, 0.3, seen(2.75)), annex = [wall([-6, 3, 0, 3.24], seen(2.5)), wall([-6, 8.76, 0, 9], seen(2.5)), wall([-6, 3.24, -5.76, 8.76], seen(2.5))];
const z1 = SH.slabZ(upper, { level: 0, ops: houseLow.concat(annex) }, CFG, null);
check('L40b', 'R1 underside from the walls under the upper footprint only', z1.bottom === 2.75 && z1.thickness === 0.25 && !(z1.gaps || []).length, JSON.stringify({ bottom: z1.bottom, thickness: z1.thickness, gaps: z1.gaps }));
const inside = [wall([2, 3, 8, 3.24], seen(2.5))];   // falsifier: a low wall UNDER the upper footprint does carry it -> conflict
const z2 = SH.slabZ(upper, { level: 0, ops: houseLow.concat(inside) }, CFG, null);
check('L40b-F', 'R1 falsifier: a low wall under the footprint still conflicts', (z2.gaps || []).some(g => g.code === 'GAP:slab_underside_conflict'), JSON.stringify(z2.gaps));

// ---- L40d R3: two pieces, a 5.5 m gap (gap_max ${CFG.opening.gap_max}); windows by their drawn box ----
const GAP = CFG.opening.gap_max + 0.5, pc = (x0, x1) => wall([x0, 0, x1, 0.24], { height: 2.5, base: 0, start: [x0, 0.12], end: [x1, 0.12], thickness: 0.24, length: x1 - x0 }), win = (h, x0, x1) => ({ op_type: 'DXF_OPENING', output_guid: 'o' + h, input_guids: [], params: { kind: 'window', handle: h, sill: 0.9, height: 1.2, bbox: [x0, 0, x1, 0.24] } });
const run = opens => SH.bridgeOpenings([pc(0, 1), pc(1 + GAP, 2 + GAP)].concat(opens), CFG, { level: 0, hashHex });
const b1 = run([win('W1', 1, 1 + GAP)]), b2 = run([win('W2', 2, 3)]), b3 = run([win('W3', 1, 1 + GAP / 2), win('W4', 1 + GAP / 2, 1 + GAP)]);
const unb = b => b.gaps.filter(g => g.code === 'GAP:opening_gap_unbounded').length;
check('L40d', 'R3 one drawn opening spanning a gap over gap_max is bridged and says so', b1.infill.length > 0 && b1.infill.every(i => i.params.gap_stated_by === 'W1') && !unb(b1), `infill=${b1.infill.length} stated=${b1.infill.map(i => i.params.gap_stated_by)} unbounded=${unb(b1)}`);
check('L40d-F', 'R3 falsifiers: a narrower opening, or two openings, in the same gap stay unbounded', !b2.infill.length && unb(b2) === 1 && !b3.infill.length && unb(b3) === 2, `narrow: infill=${b2.infill.length} unbounded=${unb(b2)} | two: infill=${b3.infill.length} unbounded=${unb(b3)}`);
say((n ? '' : 'verdict=INCONCLUSIVE ') + 'SUMMARY fail=' + fail + ' of ' + n); process.exit(fail || !n ? 1 : 0);
