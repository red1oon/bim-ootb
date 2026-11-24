#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-L43 (a stair from the sheet, prompts/DXF2BIM_MODELLER_LANE.md §L43). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a two-storey set had no stair: A-FLOR-STRS was ignored everywhere. With @STAIR + outline + walk line, are the treads
 * cut where the sheet says, one going apart, rising to the next storey, and does every failure state itself instead of guessing?
 *   T1 straight run 1.0 x 4.0 m, walk line down the middle, 5 risers, going 0.30: 4 treads, each 1.0 x 0.30 m, tops at 1/5..4/5 of the storey
 *   T2 half turn round a spine (the DE-1 geometry, BIMCompiler §50): 15 treads, all inside the outline, none over the spine, the run's ends inside the walk line
 *   T3 falsifiers: no walk line / a too-short walk line / no storey above -> the stated GAP, nothing built
 *   T4 the mark grammar: @STAIR=16,179,273 parses; @STAIR=1,179,273 and @STAIR=16,x,273 are MARK:malformed
 * Usage: node modeller/tests/witness_dxf_stair.js   (synthetic entities, no input files)
 */
'use strict';
const path = require('path'), D = path.join(__dirname, '..', 'dxf2bim') + '/';
const ST = require(D + 'dxf2stair.js'), MK = require(D + 'dxf2marks.js');
let fail = 0, n = 0; const check = (id, issue, ok, d) => { n++; if (!ok) fail++; console.log((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const poly = (pts, closed, bulges) => ({ type: 'LWPOLYLINE', layer: 'A-FLOR-STRS', shape: !!closed, handle: 'H' + Math.random().toString(16).slice(2, 6), vertices: pts.map((p, i) => ({ x: p[0], y: p[1], bulge: (bulges || {})[i] || 0 })) });
const rect = (x0, y0, x1, y1) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
const zr = V => [Math.min(...V.map(v => v[2])), Math.max(...V.map(v => v[2]))];
const box = V => [Math.min(...V.map(v => v[0])), Math.min(...V.map(v => v[1])), Math.max(...V.map(v => v[0])), Math.max(...V.map(v => v[1]))];

// T1: outline x 0..1, y 0..4 (m); walk line x 0.5 from y 0.2 to 3.8 (3.6 m); 5 risers, going 0.30 -> 4 treads over 1.2 m, centred: start at 0.2 + (3.6 - 1.2) / 2 = 1.4
const t1 = ST.build([rect(0, 0, 1, 4), poly([[0.5, 0.2], [0.5, 3.8]], false)], 1, { risers: 5, rise_mm: 170, going_mm: 300 }, 0, 2.5, {});
const ok1 = t1.body && t1.treads === 4 && t1.tread_list.every((t, i) => Math.abs(t.area - 0.30) < 1e-6 && Math.abs(t.top - 2.5 * (i + 1) / 5) < 1e-6);
check('T1', 'straight run: 4 treads of 1.0 x 0.30 m, tops at k/5 of the storey', ok1, JSON.stringify(t1.tread_list) + ' info ' + JSON.stringify(t1.info));
const b1 = t1.body && box(t1.body.vertices);
check('T1b', 'the run is centred on the walk line (1.4 .. 2.6 m) and stays inside the outline', !!b1 && Math.abs(b1[1] - 1.4) < 1e-6 && Math.abs(b1[3] - 2.6) < 1e-6 && b1[0] >= -1e-9 && b1[2] <= 1 + 1e-9, JSON.stringify(b1));

// T2: the DE-1 stair (mm, sheet y up as the emitter writes it: y -> -y). outline 5246..7447 x 5050..7432, spine 6247..6468 x 5050..6428
const mm = 0.001, Y = y => -y;
const de = [rect(5246, Y(5050), 7447, Y(7432)), rect(6247, Y(5050), 6468, Y(6428)), poly([[6949, Y(5100)], [6949, Y(6428)], [5765, Y(6428)], [5765, Y(5500)]], false, { 1: -1 })];
const t2 = ST.build(de, mm, { risers: 16, rise_mm: 179, going_mm: 273 }, 0, 2.855, {});
const sp = [6.247, -6.428, 6.468, -5.050], ou = [5.246, -7.432, 7.447, -5.050];
const insideOut = t2.body && t2.body.vertices.every(v => v[0] >= ou[0] - 1e-6 && v[0] <= ou[2] + 1e-6 && v[1] >= ou[1] - 1e-6 && v[1] <= ou[3] + 1e-6);
const overSpine = t2.body && t2.body.vertices.filter(v => v[0] > sp[0] + 1e-4 && v[0] < sp[2] - 1e-4 && v[1] > sp[1] + 1e-4 && v[1] < sp[3] - 1e-4).length;
check('T2', 'half turn round the spine: 15 treads, all inside the outline, no vertex over the spine, z 0..2.855', !!t2.body && t2.treads === 15 && insideOut && overSpine === 0 && Math.abs(zr(t2.body.vertices)[1] - 2.855 * 15 / 16) < 1e-6,
  'treads=' + t2.treads + ' areas=' + (t2.tread_list || []).map(t => t.area.toFixed(3)).join(',') + ' info=' + JSON.stringify(t2.info) + ' gaps=' + JSON.stringify(t2.gaps));
const tot = (t2.tread_list || []).reduce((a, t) => a + t.area, 0);
check('T2b', 'no tread wraps the spine (no holes), every tread has area, the turn is stated (WINDER) and T1 is not', !!t2.body && t2.tread_list.every(t => t.holes === 0 && t.area > 0.05) && t2.info.turns === true && t1.info.turns === false, 'total tread area m2=' + tot.toFixed(3));

// T3 falsifiers
const f1 = ST.build([rect(0, 0, 1, 4)], 1, { risers: 5, rise_mm: 170, going_mm: 300 }, 0, 2.5, {});
const f2 = ST.build([rect(0, 0, 1, 4), poly([[0.5, 0.2], [0.5, 1.0]], false)], 1, { risers: 5, rise_mm: 170, going_mm: 300 }, 0, 2.5, {});
const f3 = ST.build([rect(0, 0, 1, 4), poly([[0.5, 0.2], [0.5, 3.8]], false)], 1, { risers: 5, rise_mm: 170, going_mm: 300 }, 0, 0, {});
check('T3', 'no walk line / too short / no storey above: the stated GAP, nothing built', !f1.body && f1.gaps[0].code === 'GAP:stair_walk_line' && !f2.body && f2.gaps[0].code === 'GAP:stair_walk_short' && !f3.body && f3.gaps[0].code === 'GAP:stair_no_upper_storey',
  [f1, f2, f3].map(f => f.gaps.map(g => g.code).join()).join(' | '));

// T4 the mark
const mark = t => { const m = MK.readMarks ? MK : null; return m; };
const parse = txt => MK.parse ? MK.parse([{ text: txt, handle: '1' }]) : null;
const ents = txt => [{ type: 'TEXT', layer: 'DXF2BIM-MARK', handle: '1', text: txt, startPoint: { x: 0, y: 0 } }];
const rd = txt => MK.describe(MK.readMarks(ents(txt)));   // read the TEXT, then describe it as the importer does
const good = rd('@STAIR=16,179,273 @BY=user'), bad1 = rd('@STAIR=1,179,273 @BY=user'), bad2 = rd('@STAIR=16,x,273 @BY=user');
const gs = (good.desc || good).stair, e1 = (bad1.errors || []).map(e => e.code), e2 = (bad2.errors || []).map(e => e.code);
check('T4', '@STAIR parses to risers/rise/going; 1 riser or a non-number is MARK:malformed', !!gs && gs.risers === 16 && gs.rise_mm === 179 && gs.going_mm === 273 && e1.includes('MARK:malformed') && e2.includes('MARK:malformed'),
  JSON.stringify(gs) + ' | ' + e1 + ' | ' + e2);
// T5 (§L44) the outline owner: the largest closed ring, null without one
const o5 = ST.outline(de, mm), o5n = ST.outline([poly([[0, 0], [1, 0]], false)], 1);
check('T5', 'Dxf2Stair.outline = the largest closed A-FLOR-STRS ring (the outline, not the spine); null without a closed ring', !!o5 && Math.abs(Math.min(...o5.map(p => p[0])) - 5.246) < 1e-9 && Math.abs(Math.max(...o5.map(p => p[0])) - 7.447) < 1e-9 && o5n === null, JSON.stringify(o5));
console.log((n ? '' : 'verdict=INCONCLUSIVE ') + 'SUMMARY fail=' + fail + ' of ' + n); process.exit(fail || !n ? 1 : 0);
