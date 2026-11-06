#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-TABLES (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D111). Read the log after every run.
// Issue it exposes: a schedule read wrongly puts a value under the wrong heading, drops a repeated tag, or loses a merged cell, and nothing downstream can tell.
// Each fixture states one rule; the red control shifts a column and must break the arithmetic. PRIVATE_SET_DXF = a folder of real sheets, judged by invariants only (no project text in this file).
'use strict';
const fs = require('fs'), path = require('path'), M = path.join(__dirname, '..'), T = require(path.join(M, 'dxf2tables.js')), DT = require(path.join(M, 'dxf2doortags.js'));
const checks = []; const ok = (n, v, d) => { checks.push(!!v); console.log('  ' + (v ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const quiet = fn => { const l = console.log; let s = ''; console.log = x => { s += x + '\n'; }; try { return [fn(), s]; } finally { console.log = l; } };
// a ruled block: xs left to right, ys top to bottom, cells { 'r,c': text }, noV { 'r,e': 1 } = no vertical at edge e in row r, noH { 'b,c': 1 } = no rule under row b in column c
function block(xs, ys, cells, noV, noH, h) {
  const E = [], line = (a, b, c, d) => E.push({ type: 'LINE', vertices: [{ x: a, y: b }, { x: c, y: d }] }); noV = noV || {}; noH = noH || {}; h = h || 3;
  for (let r = 0; r < ys.length - 1; r++) for (let e = 0; e < xs.length; e++) if (!noV[r + ',' + e]) line(xs[e], ys[r], xs[e], ys[r + 1]);
  for (let b = 0; b < ys.length; b++) for (let c = 0; c < xs.length - 1; c++) if (!noH[(b - 1) + ',' + c]) line(xs[c], ys[b], xs[c + 1], ys[b]);
  Object.keys(cells).forEach(k => { const [r, c] = k.split(',').map(Number); E.push({ type: 'MTEXT', text: cells[k], height: h, attachmentPoint: 5, position: { x: (xs[c] + xs[c + 1]) / 2, y: (ys[r] + ys[r + 1]) / 2 }, handle: 'H' + k }); });
  return E;
}
const read = ents => quiet(() => T.read({ name: 'fixture', dxf: { entities: ents } }));
const xs = [0, 40, 80, 120, 160, 200], rowsAt = (top, n) => Array.from({ length: n + 1 }, (_, i) => top - i * 10);
// 1. heading block + two bodies with the same edges, a repeated tag kept twice
const head = block(xs, rowsAt(300, 2), { '0,0': 'DOOR SCHEDULE', '1,0': 'TAG', '1,1': 'WIDTH', '1,2': 'HEIGHT', '1,3': 'RATING', '1,4': 'NOTE' }, { '0,1': 1, '0,2': 1, '0,3': 1, '0,4': 1 });
const b1 = block(xs, rowsAt(260, 2), { '0,0': 'A-1', '0,1': '900', '0,2': '2100', '0,3': '60', '0,4': 'x', '1,0': 'A-2', '1,1': '1000', '1,2': '2200', '1,3': '60', '1,4': 'y' });
const b2 = block(xs, rowsAt(220, 2), { '0,0': 'A-2', '0,1': '2094', '0,2': '3855', '0,3': '90', '0,4': 'z', '1,0': 'A-3', '1,1': '800', '1,2': '2100', '1,3': '30', '1,4': 'w' });
let [r] = read(head.concat(b1, b2)), t = r.tables[0];
ok('heading block + 2 bodies = one table of 4 rows, named columns', r.tables.length === 1 && t.rows.length === 4 && t.blocks === 3 && t.columns.join() === 'TAG,WIDTH,HEIGHT,RATING,NOTE', JSON.stringify(t && t.columns));
ok('a tag printed twice keeps both rows and both sizes', t.rows.filter(x => x.cells[0] === 'A-2').map(x => x.cells[1]).join() === '1000,2094');
// 2. merged cells hold their text in the middle row; the run gets it, and only the run
const X = [0, 40, 70, 100, 130, 170], Y = rowsAt(200, 4);
const feeder = (name, r_, y_, b_, tot) => block(X, Y, { '0,0': 'NAME', '0,1': 'R', '0,2': 'Y', '0,3': 'B', '0,4': 'TOTAL', '2,0': name, '2,4': tot, '1,1': r_, '2,2': y_, '3,3': b_ }, null, { '1,0': 1, '2,0': 1, '1,4': 1, '2,4': 1 });
const sumOK = t => { const g = {}; t.rows.forEach(x => { const k = x.cells[0] + '|' + x.cells[4]; g[k] = g[k] || [0, parseFloat(x.cells[4])]; g[k][0] += (parseFloat(x.cells[1]) || 0) + (parseFloat(x.cells[2]) || 0) + (parseFloat(x.cells[3]) || 0); }); return Object.values(g).length > 0 && Object.values(g).every(v => Math.abs(v[0] - v[1]) < 0.01); };
[r] = read(feeder('MDB', '10.50', '11.25', '12.25', '34.00')); t = r.tables[0];
ok('a merged name and total (text in the middle row) reach all three phase rows', t && t.rows.length === 3 && t.rows.every(x => x.cells[0] === 'MDB' && x.cells[4] === '34.00'), t && JSON.stringify(t.rows.map(x => x.cells)));
ok('the phases add up to the stated total', t && sumOK(t));
// red control: the same feeder with the phase values in the wrong column must fail the same check
const red = feeder('MDB', '10.50', '11.25', '12.25', '34.00'); red.filter(e => e.type === 'MTEXT' && e.text === '12.25').forEach(e => { e.position.x = (X[4] + X[5]) / 2; });
const [rr] = read(red);
ok('RED CONTROL: a value moved to the wrong column breaks the arithmetic', rr.tables[0] && !sumOK(rr.tables[0]));
// 3. a heading over two grid columns is one column; a stray rule cannot strand a value
const Xs = [0, 40, 80, 100, 120], st = block(Xs, rowsAt(150, 4), { '0,0': 'TAG', '0,1': 'SIZE', '0,2': 'LOAD', '1,0': 'P1', '1,1': '10', '1,2': '5', '2,0': 'P2', '2,1': '20', '2,3': '7', '3,0': 'P3', '3,1': '30', '3,2': '9' }, { '0,3': 1 });
[r] = read(st); t = r.tables[0];
ok('one heading over two grid columns reads as one column, whichever half holds the value', t && t.columns.join() === 'TAG,SIZE,LOAD' && t.rows.map(x => x.cells[2]).join() === '5,7,9', t && JSON.stringify(t.columns));
// 4. same edges, own title: a second table, not more rows of the first
const titled = top => block(xs, rowsAt(top, 4), { '0,0': 'BEAM SCHEDULE', '1,0': 'MARK', '1,1': 'W', '1,2': 'D', '1,3': 'BARS', '1,4': 'LINKS', '2,0': 'B1', '2,1': '300', '2,2': '600', '2,3': '4T20', '2,4': 'T10', '3,0': 'B2', '3,1': '300', '3,2': '800', '3,3': '4T16', '3,4': 'T10' }, { '0,1': 1, '0,2': 1, '0,3': 1, '0,4': 1 });
[r] = read(titled(400).concat(titled(300)));
ok('a block with its own title starts a new table', r.tables.length === 2 && r.tables.every(x => x.rows.length === 2), 'tables=' + r.tables.length);
// 5. a list with no number column, with group rows
const reg = block([0, 40, 140, 170], rowsAt(100, 7), { '0,0': 'REGISTER', '1,0': 'SHEET', '1,1': 'NAME', '1,2': 'SCALE', '2,0': 'GENERAL', '3,0': 'G1', '3,1': 'NOTES', '3,2': 'NTS', '4,0': 'G2', '4,1': 'LEGEND', '4,2': 'NTS', '5,0': 'PLANS', '6,0': 'P1', '6,1': 'GROUND', '6,2': 'A' }, { '0,1': 1, '0,2': 1, '2,1': 1, '2,2': 1, '5,1': 1, '5,2': 1 });
[r] = read(reg); t = r.tables[0];
ok('a register with no numbers reads, with its group rows as sections', t && t.headerBasis === 'no-number-row' && t.rows.map(x => x.cells[0] + '@' + x.section).join() === 'G1@GENERAL,G2@GENERAL,P1@PLANS', t && JSON.stringify(t.rows.map(x => x.cells[0] + '@' + x.section)));
// 6. two different texts with no rule between them are a missing rule, not a merge
const miss = block(xs, rowsAt(80, 4), { '0,0': 'A', '0,1': 'B', '0,2': 'C', '0,3': 'D', '0,4': 'E', '1,0': 'one', '1,1': '1', '1,2': '2', '2,0': 'two', '2,1': '3', '2,2': '4', '3,0': 'tre', '3,1': '5', '3,2': '6' }, null, { '1,0': 1 });
[r] = read(miss); t = r.tables[0];
ok('no rule between two different texts: each stays where it is drawn', t && t.rows.map(x => x.cells[0]).join() === 'one,two,tre', t && JSON.stringify(t.rows.map(x => x.cells[0])));
// 7. linework that closes cells with nothing in them is not a table, and the log says so
const plan = block(xs, rowsAt(60, 5), { '1,1': 'ROOM' }); const [rp, lg] = read(plan);
ok('a plan grid with empty cells gives no table, and the log says INCONCLUSIVE', rp.tables.length === 0 && /INCONCLUSIVE/.test(lg), 'tables=' + rp.tables.length);
const [r0, l0] = read([]);
ok('an empty sheet gives no table, and the log says INCONCLUSIVE', r0.tables.length === 0 && /INCONCLUSIVE/.test(l0));
// real set, private and optional: invariants only
const SET = process.env.PRIVATE_SET_DXF;
if (!SET || !fs.existsSync(SET)) console.log('§W-DXF-TABLES-REAL SKIP PRIVATE_SET_DXF not set: no real sheet judged');
else {
  const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), all = []; (function w(d) { fs.readdirSync(d).forEach(f => { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) w(p); else if (/\.dxf$/i.test(p)) all.push(p); }); })(SET);
  const load = p => ({ name: path.basename(p), role: 'drawing', dxf: new DxfParser().parseSync(fs.readFileSync(p, 'utf8')) });
  const doors = all.filter(p => /DOOR SCHEDULE/i.test(p));
  doors.forEach(p => { const sh = load(p), [o] = quiet(() => T.read(sh)), t = o.tables[0], old = DT.scheduleRows([sh]), col = n => t.columns.findIndex(c => c.includes(n)), by = {}; t.rows.forEach(x => { (by[x.cells[0]] = by[x.cells[0]] || []).push(x); });
    const dup = Object.keys(by).filter(k => by[k].length > 1), bad = Object.keys(old).filter(k => !by[k] || !by[k].some(x => x.cells[col('WIDTH')] === String(old[k].w) && x.cells[col('HEIGHT')] === String(old[k].h)));
    ok('real door schedule: every tag of the old reader agrees on width and height', bad.length === 0 && Object.keys(old).length > 0, `rows=${t.rows.length} old=${Object.keys(old).length} repeated=${dup.length} disagree=${bad.length}`); });
  let good = 0, tot = 0; const off = [];
  all.forEach(p => { const [o] = quiet(() => T.read(load(p))); o.tables.forEach(t => { const f = rx => t.columns.findIndex(c => rx.test(c)), R = f(/R-\s*PH/i), Y = f(/Y-\s*PH/i), B = f(/B-\s*PH/i), L = f(/TOTAL\s*Load/i), n = s => parseFloat(s) || 0; if (Math.min(R, Y, B, L) < 0) return; const g = []; t.rows.forEach(x => { const c = x.cells; if (n(c[L]) <= 0) return; const nm = c[1] || c[0], last = g[g.length - 1]; if (last && last.t === c[L] && last.nm === nm) last.s += n(c[R]) + n(c[Y]) + n(c[B]); else g.push({ t: c[L], nm, s: n(c[R]) + n(c[Y]) + n(c[B]) }); }); g.forEach(v => { tot++; if (Math.abs(v.s - n(v.t)) <= Math.max(0.03, 0.002 * n(v.t))) good++; else off.push(v.nm + ' ' + v.s.toFixed(2) + ' vs ' + v.t); }); }); });
  console.log('§W-DXF-TABLES-FEEDERS good=' + good + ' of ' + tot + (off.length ? ' off (the printed numbers differ, listed for the checker): ' + off.join('; ') : '') + (tot ? '' : ' INCONCLUSIVE: no panel schedule'));
  ok('real panels: most feeders add up, so the columns are the right ones', tot > 0 && good / tot >= 0.7, good + ' of ' + tot);
}
const f = checks.filter(x => !x).length; console.log('§WITNESS_DXF_TABLES ' + (f ? 'FAIL ' : 'PASS ') + (checks.length - f) + '/' + checks.length); process.exit(f ? 1 : 0);
