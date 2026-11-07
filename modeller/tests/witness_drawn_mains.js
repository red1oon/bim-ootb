#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-DRAWN-MAINS, prompts/DISC_WALK_DRAWN_MAINS.md §4.3, §6. Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: the record claims more than the sheet draws (a joint where two runs only cross, a main bridged across a gap, a width or height nobody drew, a sheet placed with a frame nobody checked).
// Nothing judged prints INCONCLUSIVE, never PASS. Node only. Fixtures are DXFs written by the witness with Std2dDxf and parsed with modeller/lib/dxf-parser.js (the parser dxf2bim.js S1 is given).
// Std2dDxf writes no INSERT or BLOCK, so INSERT entities (fittings, terminals) and the block table are built directly in the parsed-entity shape and appended to the parsed entities. The log says so.
// Usage: node modeller/tests/witness_drawn_mains.js > log 2>&1
'use strict';
const fs = require('fs'), path = require('path');
const M = path.join(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const DxfParser = require(path.join(M, 'lib', 'dxf-parser.js')), Std2dDxf = require(path.join(M, 'dxf2bim', 'std2d_dxf.js')), DM = require(path.join(M, 'drawn_mains.js'));
const RULES = JSON.parse(fs.readFileSync(path.join(M, 'drawn_mains_rules.json'), 'utf8'));
const log = console.log;
let pass = 0, fail = 0, inc = 0;
const ok = (id, cond, msg) => { log('§' + (cond ? 'PASS' : 'FAIL') + ' ' + id + ' ' + (msg || '')); cond ? pass++ : fail++; return cond; };
const incon = (id, why) => { log('§INCONCLUSIVE ' + id + ' ' + why); inc++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- fixtures ----
const L = { C: 'M-HVAC-DUCT-CNTR', O: 'M-HVAC-DUCT-OTLN', F: 'M-HVAC-DUCT-OTLN', G: 'S-GRID', T: 'S-GRID-IDEN', W: 'M-WALL', TERM: 'M-HVAC-CDFF-OTLN' };   // US NCS layers; a fitting is an INSERT on the outline layer
const GRID_V = [['1', 0], ['2', 6], ['3', 12], ['4', 18]], GRID_H = [['A', 0], ['B', 5], ['C', 10], ['D', 15]];   // building metres
const buildingGrid = (guid, k) => { k = k || 1; const o = []; GRID_V.forEach(v => o.push({ grid_guid: guid, tag: v[0], x0: v[1] * k, y0: -2, x1: v[1] * k, y1: 22 })); GRID_H.forEach(h => o.push({ grid_guid: guid, tag: h[0], x0: -2, y0: h[1] * k, x1: 20, y1: h[1] * k })); return o; };
const BOX1 = { entities: [{ type: 'LWPOLYLINE', vertices: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }], shape: true }] };   // 2 m x 1 m fitting block, local, in mm
const BOXNEG = { entities: [{ type: 'LWPOLYLINE', vertices: [{ x: -1000, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1000 }, { x: -1000, y: 1000 }], shape: true }] };   // 1 m box to the left of its insertion point
const BOX2 = { entities: [{ type: 'LWPOLYLINE', vertices: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }], shape: true }] };   // 1 m x 1 m

// Build one sheet. rotDeg/t: building = R(rot) * sheet + t (metres). content(B) draws in BUILDING metres; the fixture puts it on the sheet in mm.
function sheetFixture(o) {
  o = o || {}; const rot = (o.rotDeg || 0) * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot), t = o.t || [0, 0];
  const toSheet = (x, y) => { const dx = x - t[0], dy = y - t[1]; return [(c * dx + s * dy) * 1000, (-s * dx + c * dy) * 1000]; };   // inverse of the fit's map, in mm
  const d = new Std2dDxf.Doc({ layers: { [L.C]: [1, 0, 'CONTINUOUS'], [L.O]: [2, 0, 'CONTINUOUS'], [L.F]: [3, 0, 'CONTINUOUS'], [L.G]: [4, 0, 'CONTINUOUS'], [L.T]: [5, 0, 'CONTINUOUS'], [L.W]: [6, 0, 'CONTINUOUS'] }, scale: 100, dim: { txt: 2.5, asz: 2.5 } });
  const extra = [];
  const blocks = {};
  if (o.nest) {   // the grid sits inside ONE block insert (offset, rotated, optionally scaled/mirrored): block-local coordinates are the inverse of the insert's transform
    const n = o.nest, a = (n.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), sx = n.sx == null ? 1 : n.sx, sy = n.sy == null ? 1 : n.sy, ents = [];
    const toLocal = (gx, gy) => { const dx = gx - n.pos[0], dy = gy - n.pos[1]; return { x: (ca * dx + sa * dy) / sx, y: (-sa * dx + ca * dy) / sy, z: 0 }; };
    const sub = o.tagSub || (x => x), put = (tag, a0, b0, tp) => { const A = toSheet(a0[0], a0[1]), Bp = toSheet(b0[0], b0[1]), Tp = toSheet(tp[0], tp[1]); ents.push({ type: 'LINE', layer: L.G, vertices: [toLocal(A[0], A[1]), toLocal(Bp[0], Bp[1])] }); ents.push({ type: 'MTEXT', layer: L.T, position: toLocal(Tp[0], Tp[1]), text: '{\\fArial|b0;' + sub(tag) + '}\\P' }); ents.push({ type: 'INSERT', layer: L.T, name: 'BUBBLE', position: toLocal(Tp[0], Tp[1]), xScale: 1, yScale: 1, rotation: 0 }); };
    GRID_V.forEach(v => put(v[0], [v[1], -2], [v[1], 22], [v[1], -2.3])); GRID_H.forEach(h => put(h[0], [-2, h[1]], [20, h[1]], [-2.3, h[1]]));
    blocks.LINKED_MODEL = { name: 'LINKED_MODEL', position: { x: 0, y: 0, z: 0 }, entities: ents };
    extra.push({ type: 'INSERT', layer: 'M-LINK', name: 'LINKED_MODEL', position: { x: n.pos[0], y: n.pos[1], z: 0 }, xScale: sx, yScale: sy, rotation: n.rot || 0 });
  }
  if (!o.noGrid && !o.nest) {
    const sub = o.tagSub || (x => x), tag = (t, tp) => {
      const q = sub(t); if (o.mtext) extra.push({ type: 'MTEXT', layer: L.T, position: { x: tp[0], y: tp[1], z: 0 }, text: '{\\fArial|b0|i0|c0|p34;\\H200;' + q + '}\\P' }); else d.text(L.T, q, tp, 200);
      extra.push({ type: 'INSERT', layer: L.T, name: 'BUBBLE', position: { x: tp[0], y: tp[1], z: 0 }, xScale: 1, yScale: 1, rotation: 0 });   // the grid bubble: an insert on the tag layer, not a tag
    };
    GRID_V.forEach(v => { const a = toSheet(v[1], -2), b = toSheet(v[1], 22), tp = toSheet(v[1], -2.3); d.line(L.G, a, b); tag(v[0], tp); });
    GRID_H.forEach(h => { const a = toSheet(-2, h[1]), b = toSheet(20, h[1]), tp = toSheet(-2.3, h[1]); d.line(L.G, a, b); tag(h[0], tp); });
  }
  const B = {
    line: (layer, a, b) => d.line(layer, toSheet(a[0], a[1]), toSheet(b[0], b[1])),
    poly: (layer, pts) => d.lwpoly(layer, pts.map(p => toSheet(p[0], p[1])), false),
    // INSERT in the parsed shape: position in sheet mm, X scale as given (negative = mirrored)
    ins: (layer, name, x, y, xScale) => { const p = toSheet(x, y); extra.push({ type: 'INSERT', layer, name, position: { x: p[0], y: p[1], z: 0 }, xScale: xScale == null ? 1 : xScale, yScale: 1, rotation: 0 }); }
  };
  if (o.content) o.content(B);
  const parsed = new DxfParser().parseSync(d.toString());
  return { entities: parsed.entities.concat(extra), blocks: Object.assign({ BOX2000: BOX1, BOX1000: BOX2, BOXNEG, BUBBLE: { entities: [{ type: 'TEXT', layer: L.T, startPoint: { x: 0, y: 0, z: 0 }, text: 'ZZ' }] } }, parsed.blocks || {}, blocks), dxfBytes: d.toString().length };
}
const capture = f => { const lines = []; const orig = console.log; console.log = s => { lines.push(String(s)); orig(s); }; try { return { r: f(), lines }; } finally { console.log = orig; } };
function run(name, fx, grid, variant, extraArgs) {
  return capture(() => DM.read(Object.assign({ entities: fx.entities, blocks: fx.blocks, sheet: name, rules: RULES.rows, grid, unitM: RULES.sheet_unit_m, tagReachM: RULES.tag_reach_m, variant }, extraArgs || {})));
}
const G1 = buildingGrid('G1');

(async () => {
  const SQL = await initSqlJs();
  log('§W_DM FIXTURES Std2dDxf writes LINE/LWPOLYLINE/TEXT only: INSERT entities (fittings, terminals) and the block table are built directly in the parsed-entity shape; everything else goes through Std2dDxf -> DxfParser.');

  // ---- M1: two runs crossing, no fitting, stay 2 components. Red control: touch join fails M1. ----
  const m1 = sheetFixture({ content: B => { B.line(L.C, [0, 0], [10, 0]); B.line(L.C, [5, -3], [5, 3]); } });
  let r = run('m1', m1, G1);
  ok('M1 two crossing runs with no fitting stay 2 components', r.r.sheet.components === 2 && r.r.sheet.pieces === 2, 'components=' + r.r.sheet.components + ' pieces=' + r.r.sheet.pieces);
  r = run('m1-touch', m1, G1, { touchJoin: true });
  ok('M1 RED: a touch-join variant reads 1 component, so it fails M1', r.r.sheet.components === 1, 'components=' + r.r.sheet.components);

  // ---- M2: two pieces through one fitting box -> 1 component ----
  const fit2 = c => B => { B.line(L.C, [0, 0], [4, 0]); B.line(L.C, [6, 0], [10, 0]); if (c) B.ins(L.F, 'BOX2000', 4, -0.5, 1); };
  const m2 = sheetFixture({ content: fit2(true) }), m2n = sheetFixture({ content: fit2(false) });
  r = run('m2', m2, G1); const m2log = r.lines.join('\n');
  ok('M2 two pieces through one fitting box become 1 component', r.r.sheet.components === 1 && r.r.sheet.pieces === 2, 'components=' + r.r.sheet.components);
  r = run('m2-nofit', m2n, G1);
  ok('M2 RED: the same two pieces with no fitting stay 2 components', r.r.sheet.components === 2, 'components=' + r.r.sheet.components);
  // endpoint joint: end to end within 50 mm joins, 60 mm does not (hand: 0.05 m rule)
  const e1 = sheetFixture({ content: B => { B.line(L.C, [0, 0], [4, 0]); B.line(L.C, [4.04, 0], [8, 0]); } }), e2 = sheetFixture({ content: B => { B.line(L.C, [0, 0], [4, 0]); B.line(L.C, [4.07, 0], [8, 0]); } });
  ok('M2b end to end 40 mm apart joins, 70 mm apart does not', run('e1', e1, G1).r.sheet.components === 1 && run('e2', e2, G1).r.sheet.components === 2, '');

  // ---- M3: input length = recorded length, per sheet; red: a record with a piece dropped disagrees ----
  const m3 = sheetFixture({ content: B => { B.line(L.C, [0, 0], [4, 0]); B.poly(L.C, [[0, 3], [3, 3], [3, 7]]); B.line(L.C, [1, 10], [3.5, 10]); B.line(L.W, [0, 0], [50, 0]); } });
  const HAND_LEN = 4 + (3 + 4) + 2.5;   // hand: line 4, polyline 3+4, line 2.5; the wall line is not a centreline
  r = run('m3', m3, G1); const db3 = new SQL.Database(); DM.write(db3, r.r);
  const dbLen = db => db.exec('SELECT COALESCE(SUM(sqrt((x1-x0)*(x1-x0)+(y1-y0)*(y1-y0))),0), COUNT(*) FROM drawn_route')[0].values[0];
  const dl = dbLen(db3);
  ok('M3 input length = recorded length = rows length (hand 13.5 m)', near(r.r.sheet.length_m, HAND_LEN, 1e-6) && near(dl[0], HAND_LEN, 1e-6) && dl[1] === 4, 'sheet=' + r.r.sheet.length_m.toFixed(6) + ' rows=' + dl[0].toFixed(6) + ' n=' + dl[1] + ' hand=' + HAND_LEN);
  db3.run('DELETE FROM drawn_route WHERE piece=2'); const dl2 = dbLen(db3);
  ok('M3 RED: a record with a piece dropped no longer equals the input length', !near(dl2[0], HAND_LEN, 1e-6), 'rows=' + dl2[0].toFixed(6));

  // ---- M4: no centreline layer -> INCONCLUSIVE, never PASS ----
  const m4 = sheetFixture({ content: B => { B.line(L.W, [0, 0], [10, 0]); } });
  r = run('m4', m4, G1); const dbn = new SQL.Database(); const wn = DM.write(dbn, r.r);
  ok('M4 a sheet with no centreline layer prints INCONCLUSIVE, adds no row, never reads PASS', r.r.sheet.inconclusive === 'no centreline layer' && r.lines.some(l => /§MAINS-INCONCLUSIVE sheet=m4 reason=no centreline layer/.test(l)) && !r.lines.some(l => /§MAINS-READ/.test(l)) && r.r.rows.length === 0 && wn === 0 && dbn.exec('SELECT COUNT(*) FROM drawn_route')[0].values[0][0] === 0, 'rows=' + r.r.rows.length);

  // ---- M5: frame ----
  const geom = B => { B.line(L.C, [3, 2], [15, 2]); B.line(L.C, [15, 2], [15, 12.5]); };
  const frame = (name, rotDeg, t) => {
    const fx = sheetFixture({ rotDeg, t, content: geom }), q = run(name, fx, G1); const rows = q.r.rows;
    const want = [[3, 2, 15, 2], [15, 2, 15, 12.5]]; let worst = 0;
    rows.forEach((w, i) => { const e = want[i]; if (e) worst = Math.max(worst, Math.abs(w.x0 - e[0]), Math.abs(w.y0 - e[1]), Math.abs(w.x1 - e[2]), Math.abs(w.y1 - e[3])); });
    return { q, worst, n: rows.length };
  };
  [[30, [123.4, -56.7]], [-150, [-40.25, 77.125]], [0, [0, 0]], [89.5, [5, 5]]].forEach(c => {
    const f = frame('m5-rot' + c[0], c[0], c[1]);
    ok('M5a sheet rotated ' + c[0] + ' deg and offset ' + JSON.stringify(c[1]) + ' lands on the building to 1 mm', f.n === 2 && f.worst <= 0.001 && f.q.r.sheet.fit_tags === 8, 'worst=' + (f.worst * 1000).toFixed(4) + ' mm tags=' + f.q.r.sheet.fit_tags + ' rot=' + (f.q.r.sheet.fit_rot_deg == null ? 'n/a' : f.q.r.sheet.fit_rot_deg.toFixed(4)) + ' median=' + (f.q.r.sheet.fit_median_mm == null ? 'n/a' : f.q.r.sheet.fit_median_mm.toExponential(2)) + ' mm');
  });
  // b: a wrong grid tag. All tags shifted by one: lines carry the wrong names -> REFUSE with the numbers.
  const cyc = { '1': '2', '2': '3', '3': '4', '4': '1', A: 'B', B: 'C', C: 'D', D: 'A' };
  r = run('m5-wrongtags', sheetFixture({ rotDeg: 30, t: [123.4, -56.7], tagSub: x => cyc[x], content: geom }), G1);
  ok('M5b wrong grid tags make the sheet REFUSE, with the numbers, and write no piece', !!r.r.sheet.refused && /median residual/.test(r.r.sheet.refused) && r.r.rows.length === 0 && r.lines.some(l => /§MAINS-REFUSE sheet=m5-wrongtags reason=frame fit failed/.test(l)), r.r.sheet.refused);
  // b2: only 4 tags in common with the building grid (the rest named elsewhere): < 5 tags -> REFUSE
  r = run('m5-4tags', sheetFixture({ rotDeg: 30, t: [123.4, -56.7], tagSub: x => ({ '1': '1', '2': '2', A: 'A', B: 'B' }[x] || 'X' + x), content: geom }), G1);
  ok('M5b2 only 4 tags matched: REFUSE (needs 5)', !!r.r.sheet.refused && /only 4 tags/.test(r.r.sheet.refused), r.r.sheet.refused);
  // b3: INFO, not a claim: one wrong tag among 8 does not move a median fit
  r = run('m5-onewrong', sheetFixture({ rotDeg: 30, t: [123.4, -56.7], tagSub: x => (x === 'C' ? 'D' : x === 'D' ? 'C' : x), content: geom }), G1);
  log('§W_DM M5b3 INFO two swapped tags among 8: ' + (r.r.sheet.refused ? 'REFUSE ' + r.r.sheet.refused : 'fit passes, median=' + r.r.sheet.fit_median_mm.toFixed(3) + ' mm tags=' + r.r.sheet.fit_tags) + ' (the median test is by design robust to a minority; not asserted)');
  // c: no grid given
  const fxc = sheetFixture({ content: geom }); let allC = true; const msgs = [];
  [[undefined, 'undefined'], [[], 'empty']].forEach(g => { const q = run('m5-nogrid-' + g[1], fxc, g[0]); const good = q.r.sheet.refused === 'no named grid held on this route' && q.r.rows.length === 0 && q.lines.some(l => l === '§MAINS-REFUSE sheet=m5-nogrid-' + g[1] + ' reason=no named grid held on this route'); allC = allC && good; msgs.push(g[1] + ':' + good); });
  ok('M5c no grid given (absent or empty) REFUSES with the §4.2a reason and writes no row', allC, msgs.join(' '));
  // d: two grids, only one fits. Both orders, so first-wins would show.
  const G2 = buildingGrid('G2', 1.17);
  const fxd = sheetFixture({ rotDeg: 30, t: [123.4, -56.7], content: geom });
  [[G1.concat(G2), 'G1 first'], [G2.concat(G1), 'G2 first']].forEach(c => { const q = run('m5-two-' + c[1].replace(' ', '-'), fxd, c[0]); const rows = q.r.rows; const w = rows[0] ? Math.max(Math.abs(rows[0].x0 - 3), Math.abs(rows[0].y0 - 2)) : 9;
    ok('M5d two grids, only G1\'s tags fit (' + c[1] + '): the fit names grid_guid G1, and G2 is logged as failed', q.r.sheet.grid_guid === 'G1' && w <= 0.001 && q.lines.some(l => /§MAINS-FIT sheet=\S+ grid=G2 .* FAIL/.test(l)) && q.lines.some(l => /§MAINS-FIT sheet=\S+ grid=G1 .* PASS/.test(l)), 'grid_guid=' + q.r.sheet.grid_guid + ' off=' + (w * 1000).toFixed(4) + ' mm'); });
  r = run('m5-g2only', fxd, G2);
  ok('M5d RED: offered only G2, the sheet REFUSES (no other grid is borrowed)', !!r.r.sheet.refused, r.r.sheet.refused);

  // ---- M6: the converter negates an insert's X insertion point (amendment 2.3). Guarded by the sheet's own extents. ----
  const mline = q => (q.lines.find(l => /§MAINS-READ/.test(l)) || ''), fired = q => (q.lines.find(l => /§MAINS-MIRROR/.test(l)) || '');
  // (a) true box 10..11 m; the converter wrote the insert at X = -10, so the stored box is -11..-10, outside the drawing (6..15), its reflection 10..11 inside
  const m6 = sheetFixture({ content: B => { B.line(L.C, [6, 0], [10, 0]); B.line(L.C, [11, 0], [15, 0]); B.ins(L.F, 'BOXNEG', -10, -0.5, 1); } });
  r = run('m6a', m6, G1);
  ok('M6a an insert at negated X, box outside the drawn extents and its reflection inside: corrected, joins (1 component), mirrored=1, fired=yes', r.r.sheet.components === 1 && / mirrored=1 /.test(mline(r)) && /fired=yes n=1/.test(fired(r)), 'components=' + r.r.sheet.components + ' | ' + fired(r).replace(/^.*§MAINS-MIRROR/, '§MAINS-MIRROR'));
  r = run('m6b', m6, G1, { noMirrorFix: true });
  ok('M6b RED: correction off, the same set does not join (2 components)', r.r.sheet.components === 2, 'components=' + r.r.sheet.components);
  // (c) the whole drawing really sits at negative X, inserts at negative X too: nothing moves
  const m6c = sheetFixture({ content: B => { B.line(L.C, [-15, 0], [-11, 0]); B.line(L.C, [-10, 0], [-6, 0]); B.ins(L.F, 'BOXNEG', -10, -0.5, 1); } });
  r = run('m6c', m6c, G1);
  ok('M6c a sheet drawn at negative X with its inserts at negative X: mirrored=0, fired=no, the fitting joins where it stands', r.r.sheet.components === 1 && / mirrored=0 /.test(mline(r)) && /fired=no/.test(fired(r)), 'components=' + r.r.sheet.components + ' | ' + fired(r).replace(/^.*§MAINS-MIRROR/, '§MAINS-MIRROR'));
  // (d) none
  ok('M6d a set with no mirrored insert logs mirrored=0 and fired=no', / mirrored=0 /.test(m2log.split('\n').find(l => /§MAINS-READ/.test(l)) || '') && /fired=no/.test(m2log.split('\n').find(l => /§MAINS-MIRROR/.test(l)) || ''), (m2log.split('\n').find(l => /§MAINS-MIRROR/.test(l)) || '').replace(/.*§MAINS-MIRROR/, '§MAINS-MIRROR'));
  // (e) a genuinely negative scale is applied as drawn, not corrected: box 10..11 from X scale -1 at X = 11 on a 0..1000 block
  const m6e = sheetFixture({ content: B => { B.line(L.C, [6, 0], [10, 0]); B.line(L.C, [11, 0], [15, 0]); B.ins(L.F, 'BOX1000', 11, -0.5, -1); } });
  r = run('m6e', m6e, G1);
  ok('M6e a real negative X scale is applied as drawn (box 10..11): joins with mirrored=0', r.r.sheet.components === 1 && / mirrored=0 /.test(mline(r)), 'components=' + r.r.sheet.components);

  // ---- missing block definition (amendment 2.2) ----
  const m14 = sheetFixture({ content: B => { B.line(L.C, [0, 0], [10, 0]); B.ins('S-STRUCT-LINK', 'STRUCTURE_LINK_ABSENT', 0, 0, 1); } });
  let thrown = null; try { r = run('m14', m14, G1); } catch (e) { thrown = e; }
  ok('M14 an insert naming a block with no definition reads without throwing and counts missingBlocks=1, naming it', !thrown && r.r.sheet.pieces === 1 && r.r.sheet.missingBlocks === 1 && / missingBlocks=1$/.test(mline(r)) && r.lines.some(l => /§MAINS-MISSING-BLOCKS .* names=STRUCTURE_LINK_ABSENT/.test(l)), thrown ? String(thrown) : 'missingBlocks=' + r.r.sheet.missingBlocks);
  ok('M14 RED: a set whose blocks all exist logs missingBlocks=0', / missingBlocks=0$/.test(m2log.split('\n').find(l => /§MAINS-READ/.test(l)) || ''), '');

  // ---- tags as MTEXT with formatting codes, a bubble insert on the tag layer is not a tag (amendment 2.1) ----
  const fxm = sheetFixture({ rotDeg: 30, t: [123.4, -56.7], mtext: true, content: geom });
  r = run('m5-mtext', fxm, G1);
  const bub = fxm.entities.filter(e => e.type === 'INSERT' && e.name === 'BUBBLE').length, mt = fxm.entities.filter(e => e.type === 'MTEXT').length;
  ok('M5e MTEXT tags with formatting codes ({\\f..;\\H..;A}\\P) read as plain tags: fit passes on 8 tags with ' + bub + ' bubble inserts beside them, none read as a tag', mt === 8 && bub === 8 && r.r.sheet.fit_tags === 8 && !r.r.sheet.refused && r.r.rows.length === 2, 'tags=' + r.r.sheet.fit_tags + ' bubbles=' + bub);
  const strip = ['{\\fArial|b0;A}\\P', '\\A1;B1', '{\\H2.5;\\C1;C-2}', 'D'].map(t => DM.plainText({ type: 'MTEXT', text: t }));
  ok('M5e the MTEXT code stripper leaves the tag: -> ' + strip.join(','), strip.join(',') === 'A,B1,C-2,D', '');

  // ---- M7: system ----
  const m7 = sheetFixture({ content: B => {
    B.line(L.C, [0, 0], [10, 0]); B.ins(L.TERM, 'SUPPLY_DIFFUSER', 2, 0.5, 1); B.ins(L.TERM, 'RETURN_GRILLE', 8, -0.8, 1);
    B.line(L.C, [0, 5], [10, 5]); B.ins(L.TERM, 'SUPPLY_DIFFUSER', 5, 5.5, 1);
    B.line(L.C, [0, 10], [10, 10]); B.ins(L.TERM, 'SUPPLY_DIFFUSER', 5, 13, 1);
    B.line(L.C, [0, 15], [10, 15]); } });
  r = run('m7', m7, G1); const sysBy = {}; r.r.rows.forEach(w => { sysBy[w.piece] = w.system; });
  ok('M7 supply+return on one component = mixed; one kind = that kind; none in 1 m = unknown', sysBy[1] === 'mixed' && sysBy[2] === 'supply' && sysBy[3] === 'unknown' && sysBy[4] === 'unknown' && r.r.sheet.terminals === 4 && r.r.sheet.no_run === 1, JSON.stringify(sysBy) + ' terminals=' + r.r.sheet.terminals + ' no_run=' + r.r.sheet.no_run);
  r = run('m7-nearest', m7, G1, { nearestSystem: true });
  ok('M7 RED: a nearest-terminal variant calls the mixed component by one kind, so it fails M7', r.r.rows[0].system !== 'mixed', 'piece1=' + r.r.rows[0].system);
  r = run('m7-none', sheetFixture({ content: B => { B.line(L.C, [0, 0], [10, 0]); } }), G1);
  ok('M7 a sheet with no terminals reads unknown (terminals=0)', r.r.rows[0].system === 'unknown' && r.r.sheet.terminals === 0, 'system=' + r.r.rows[0].system);

  // ---- width (spec 4.5; extra claim W1) ----
  const w1 = sheetFixture({ content: B => {
    B.line(L.C, [0, 0], [10, 0]); B.line(L.O, [0, 0.2], [10, 0.2]); B.line(L.O, [0, -0.2], [10, -0.2]);        // equal offsets: 400 mm
    B.line(L.C, [0, 3], [10, 3]); B.line(L.O, [0, 3.2], [10, 3.2]); B.line(L.O, [0, 2.75], [10, 2.75]);        // 200 vs 250: not equal within 10 mm
    B.line(L.C, [0, 6], [10, 6]); B.line(L.O, [0, 6.2], [10, 6.2]);                                            // one side only
    B.line(L.C, [0, 9], [10, 9]);                                                                              // none
    B.line(L.C, [0, 12], [10, 12]); B.line(L.O, [0, 12.3], [10, 12.3]); B.line(L.O, [0, 11.705], [10, 11.705]); } });   // 300 vs 295: within 10 mm -> 595
  r = run('w1', w1, G1); const wd = r.r.rows.map(x => x.width_drawn_mm);
  ok('W1 width only where an outline sits each side at equal offset (<=10 mm), else null, never a default', wd[0] === 400 && wd[1] === null && wd[2] === null && wd[3] === null && wd[4] === 595 && near(r.r.sheet.width_share, 20 / 50, 1e-9), JSON.stringify(wd) + ' width_share=' + r.r.sheet.width_share.toFixed(3));

  // ---- M8: no z, no depth, no piece absent from the sheet. Checker is run on the true record, then on two corrupted ones. ----
  const m8 = sheetFixture({ content: B => { B.line(L.C, [0, 0], [4, 0]); B.line(L.C, [6, 0], [10, 0]); B.poly(L.C, [[1, 5], [4, 5], [4, 8]]); } });   // note a 2 m gap 4..6: must stay a gap
  const HAND = [[0, 0, 4, 0], [6, 0, 10, 0], [1, 5, 4, 5], [4, 5, 4, 8]];
  r = run('m8', m8, G1); const db8 = new SQL.Database(); DM.write(db8, r.r);
  const m8check = db => {
    const cols = ['drawn_route', 'drawn_route_sheet'].map(t => db.exec('PRAGMA table_info(' + t + ')')[0].values.map(v => v[1])).reduce((a, b) => a.concat(b), []);
    const badCol = cols.filter(c => /(^|_)(z|depth|height|elev|elevation)(_|$)/i.test(c));
    const rows = db.exec('SELECT x0,y0,x1,y1 FROM drawn_route ORDER BY piece')[0].values;
    const absent = rows.filter(rw => !HAND.some(h => (near(rw[0], h[0], 1e-6) && near(rw[1], h[1], 1e-6) && near(rw[2], h[2], 1e-6) && near(rw[3], h[3], 1e-6)) || (near(rw[0], h[2], 1e-6) && near(rw[1], h[3], 1e-6) && near(rw[2], h[0], 1e-6) && near(rw[3], h[1], 1e-6))));
    return { badCol, absent: absent.length, n: rows.length, cols: cols.length };
  };
  let ck = m8check(db8);
  ok('M8 no z/depth/height column, every row is a segment of the sheet (hand list), none bridges the 2 m gap', ck.badCol.length === 0 && ck.absent === 0 && ck.n === HAND.length, 'cols=' + ck.cols + ' rows=' + ck.n + ' absent=' + ck.absent + ' bad=' + ck.badCol.join(','));
  const dbB = new SQL.Database(); DM.write(dbB, r.r); dbB.run('INSERT INTO drawn_route VALUES(?,?,?,?,?,?,?,?,?,?)', ['m8', 99, 4, 0, 6, 0, 1, 'unknown', null, 'bridge']); ck = m8check(dbB);
  ok('M8 RED: a record with a bridge across the gap is caught (piece absent from the sheet)', ck.absent === 1, 'absent=' + ck.absent);
  const dbZ = new SQL.Database(); DM.write(dbZ, r.r); dbZ.run('ALTER TABLE drawn_route ADD COLUMN z REAL'); ck = m8check(dbZ);
  ok('M8 RED: a record with a z column is caught', ck.badCol.length === 1, 'bad=' + ck.badCol.join(','));
  // write contract: replace a sheet's rows, leave another sheet's, write nothing else
  const dbW = new SQL.Database(); DM.write(dbW, r.r); DM.write(dbW, r.r); DM.write(dbW, run('m1', m1, G1).r);
  const cnt = s => dbW.exec('SELECT COUNT(*) FROM drawn_route WHERE sheet=\'' + s + '\'')[0].values[0][0], tabs = dbW.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.map(v => v[0]).join(',');
  ok('M8w re-reading a sheet replaces its rows (no duplicates), keeps other sheets, and creates only the two tables', cnt('m8') === 4 && cnt('m1') === 2 && dbW.exec('SELECT COUNT(*) FROM drawn_route_sheet')[0].values[0][0] === 2 && tabs === 'drawn_route,drawn_route_sheet', 'm8=' + cnt('m8') + ' m1=' + cnt('m1') + ' tables=' + tabs);

  // ---- M13 (amendment 1): the grid sits inside a block insert ----
  const nests = [{ pos: [250000, -80000], rot: 37, sx: 1, sy: 1 }, { pos: [-12000, 40500], rot: 211, sx: -1, sy: 1 }];
  nests.forEach((n, i) => {
    const fxn = sheetFixture({ rotDeg: 30, t: [123.4, -56.7], nest: n, content: geom });
    const topCount = fxn.entities.filter(e => (e.type === 'TEXT' || e.layer === L.G) && e.type !== 'INSERT').length;
    r = run('m13-nest' + i, fxn, G1); const rows = r.r.rows, want = [[3, 2, 15, 2], [15, 2, 15, 12.5]]; let worst = 9;
    if (rows.length === 2) { worst = 0; rows.forEach((w, j) => { worst = Math.max(worst, Math.abs(w.x0 - want[j][0]), Math.abs(w.y0 - want[j][1]), Math.abs(w.x1 - want[j][2]), Math.abs(w.y1 - want[j][3])); }); }
    ok('M13a grid inside an offset ' + n.rot + ' deg block insert' + (n.sx < 0 ? ' with mirrored X scale' : '') + ' (top-level grid texts/lines: ' + topCount + ') fits to 1 mm', topCount === 0 && worst <= 0.001 && r.r.sheet.fit_tags === 8 && r.r.sheet.nested > 0, 'worst=' + (worst * 1000).toFixed(4) + ' mm tags=' + r.r.sheet.fit_tags + ' nested=' + r.r.sheet.nested);
    r = run('m13-toplevel' + i, fxn, G1, { topLevelOnly: true });
    ok('M13a RED: the same sheet read top-level only REFUSES (no grid lines or tags seen)', !!r.r.sheet.refused && r.r.rows.length === 0, r.r.sheet.refused);
  });

  // ---- M11: sheet identity is number + revision ----
  const fxA = sheetFixture({ content: B => { B.line(L.C, [0, 0], [4, 0]); B.line(L.C, [0, 1], [4, 1]); } }), fxC = sheetFixture({ content: B => { B.line(L.C, [0, 0], [4, 0]); B.line(L.C, [0, 1], [4, 1]); B.line(L.C, [0, 2], [4, 2]); B.line(L.C, [0, 3], [4, 3]); } });
  const rd = (num, rev, fx) => run(num, fx, G1, null, { sheet: { number: num, revision: rev } }).r;
  const dump = db => JSON.stringify([db.exec('SELECT * FROM drawn_route ORDER BY sheet,piece'), db.exec('SELECT * FROM drawn_route_sheet ORDER BY sheet')]);
  const d11 = new SQL.Database(); DM.write(d11, rd('S-101', 'B', fxA)); const nB = d11.exec("SELECT COUNT(*) FROM drawn_route WHERE sheet='S-101'")[0].values[0][0];
  const w1r = DM.write(d11, rd('S-101', 'C', fxC)), nC = d11.exec("SELECT COUNT(*) FROM drawn_route WHERE sheet='S-101'")[0].values[0][0], revC = d11.exec("SELECT revision FROM drawn_route_sheet WHERE sheet_number='S-101'")[0].values[0][0];
  ok('M11a a newer revision (B -> C) replaces the rows of that sheet number', nB === 2 && nC === 4 && revC === 'C' && w1r === 4, 'rows ' + nB + ' -> ' + nC + ' revision=' + revC);
  const before = dump(d11), rA = rd('S-101', 'A', fxA), wA = capture(() => DM.write(d11, rA));
  ok('M11b an older revision (A < C) is refused with the held revision named, and the held rows are unchanged', /older revision held \(C > A\)/.test(rA.sheet.writeRefused || '') && wA.lines.some(l => l === '§MAINS-REFUSE sheet=S-101 reason=older revision held (C > A)') && dump(d11) === before, rA.sheet.writeRefused);
  const d11b = new SQL.Database(); DM.write(d11b, rd('S-101', 'C', fxC)); DM.write(d11b, rd('S-101', 'A', fxA, true)); DM.write(d11b, rd('S-101', 'C', fxA));
  ok('M11c the same revision (C -> C) replaces; a different sheet number is its own key', d11b.exec("SELECT COUNT(*) FROM drawn_route WHERE sheet='S-101'")[0].values[0][0] === 2 && (DM.write(d11b, rd('S-102', 'A', fxC)), d11b.exec("SELECT COUNT(*) FROM drawn_route_sheet")[0].values[0][0] === 2), '');
  const dRaw = new SQL.Database(); DM.write(dRaw, rd('S-101', 'C', fxC)); const heldRaw = dump(dRaw); dRaw.run("DELETE FROM drawn_route WHERE sheet='S-101'"); dRaw.run("DELETE FROM drawn_route_sheet WHERE sheet_number='S-101'");
  ok('M11 RED: a writer that ignored revisions would have replaced the held rows (the dump differs), so the check can fail', dump(dRaw) !== heldRaw, '');
  ok('M11d revision order: A<B<Z<AA, 2<10 (numeric), equal is same', DM.cmpRev('A', 'B') < 0 && DM.cmpRev('Z', 'AA') < 0 && DM.cmpRev('2', '10') < 0 && DM.cmpRev('C', 'c') === 0 && DM.cmpRev('C', 'A') > 0, '');

  // ---- M12: round trip through exported bytes ----
  const d12 = new SQL.Database(); d12.run('CREATE TABLE elements_meta(guid TEXT, ifc_class TEXT); CREATE TABLE other(a INTEGER, b TEXT)'); d12.run("INSERT INTO elements_meta VALUES('g1','IfcWall'),('g2','IfcDoor'); INSERT INTO other VALUES(1,'x'),(2,'y'),(3,'z')");
  const cnts = db => { const o = {}; db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.forEach(v => { o[v[0]] = db.exec('SELECT COUNT(*) FROM "' + v[0] + '"')[0].values[0][0]; }); return o; };
  const c0 = cnts(d12), res12 = run('m12', sheetFixture({ rotDeg: 30, t: [123.4, -56.7], content: geom }), G1, null, { sheet: { number: 'S-201', revision: 'A' } }).r;
  DM.write(d12, res12); const bytes = d12.export(), d12b = new SQL.Database(new Uint8Array(bytes)), c1 = cnts(d12b);
  const back = d12b.exec('SELECT sheet,piece,x0,y0,x1,y1,component,system,width_drawn_mm,provenance FROM drawn_route ORDER BY piece')[0].values;
  const same = (rowsA, rowsB) => rowsA.length === rowsB.length && rowsA.every((w, i) => { const b = rowsB[i]; return w.sheet === b[0] && w.piece === b[1] && w.x0 === b[2] && w.y0 === b[3] && w.x1 === b[4] && w.y1 === b[5] && w.component === b[6] && w.system === b[7] && w.width_drawn_mm === b[8] && w.provenance === b[9]; });
  const others = Object.keys(c0).every(t => c1[t] === c0[t]), newT = Object.keys(c1).filter(t => !(t in c0)).sort().join(',');
  ok('M12 export -> reopen reads back the same rows (counts and coordinates identical); no other table changed', same(res12.rows, back) && res12.rows.length === 2 && others && newT === 'drawn_route,drawn_route_sheet' && d12b.exec('SELECT revision FROM drawn_route_sheet')[0].values[0][0] === 'A', 'rows=' + back.length + ' before=' + JSON.stringify(c0) + ' after=' + JSON.stringify(c1));
  const tam = back.map(v => v.slice()); tam[0][2] += 1e-9;
  ok('M12 RED: one coordinate off by 1e-9 is caught by the same comparison', !same(res12.rows, tam), '');

  // ---- M9: the walker, with no sheet held ----
  try {
    const H = require(path.join(__dirname, 'walk_node_harness.js')), dbf = path.join(M, 'Clinic_ARC.db');
    if (!fs.existsSync(dbf) || fs.statSync(dbf).size < 10240) incon('M9', 'Clinic_ARC.db absent or a pointer stub: no resident to walk');
    else {
      const stack = await H.loadStack(SQL), raw = fs.readFileSync(dbf); H.openBuildingRules(SQL, stack, 'Clinic');
      const mute = f => { const ls = []; const o = console.log; console.log = s => ls.push(String(s)); try { return { r: f(), ls }; } finally { console.log = o; } };
      const now = mute(() => H.walkLive(SQL, stack, 'ACMV', new Uint8Array(raw), 'Clinic', [], {})), ctl = mute(() => H.walkLive(SQL, stack, 'ACMV', new Uint8Array(raw), 'Clinic', [], { keepPatternStubs: true }));
      const line = now.ls.find(l => /§WALK-MAINS/.test(l)) || '', runs = (now.r.chainSegs || []).length, stubs = (ctl.r.chainSegs || []).length;
      log('§W_DM M9 walker line: ' + line.replace(/^.*§WALK-MAINS/, '§WALK-MAINS') + ' | runs=' + runs + ' mains=' + JSON.stringify(now.r.mains) + ' | withStubs=' + stubs);
      if (!stubs) incon('M9', 'the pattern bridge routes nothing on Clinic ACMV even with the switch, so a zero proves nothing');
      else ok('M9 no sheet held (the reader is not wired into the walker): `none reason=no sheet held`, 0 runs, no drawn= field; RED: keepPatternStubs routes ' + stubs, /none reason=no sheet held/.test(line) && runs === 0 && !/drawn=/.test(line), 'runs=' + runs);
    }
  } catch (e) { incon('M9', 'harness could not run: ' + String(e && e.message || e).slice(0, 200)); }

  log('§W_DM VERDICT pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  if (!pass && !fail) log('§W_DM VERDICT INCONCLUSIVE nothing was judged');
  else if (fail) log('§W_DM VERDICT CLAIM NOT MET');
  else log('§W_DM VERDICT ' + (inc ? 'PASS with ' + inc + ' INCONCLUSIVE' : 'PASS'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§FAIL W_DM crashed ' + (e && e.stack || e)); console.log('§W_DM VERDICT CLAIM NOT MET'); process.exit(1); });
