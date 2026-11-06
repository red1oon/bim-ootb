#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-SETCHECK (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D112). Read the log after every run.
// Issue it exposes: a checker that calls a revision package "missing sheets" blames the author for nothing (owner's law, §D110 G6c), and one that reports a false sum teaches the reader to ignore it.
// RED: each finding is shown to appear when the fault is planted and to vanish when it is not. PRIVATE_SET_DXF = a real set, judged by invariants only.
'use strict';
const fs = require('fs'), path = require('path'), M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2setcheck.js')), { block, rowsAt } = require('./dxf_table_fixture.js');
const checks = []; const ok = (n, v, d) => { checks.push(!!v); console.log('  ' + (v ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const quiet = fn => { const l = console.log; let s = ''; console.log = x => { s += x + '\n'; }; try { return [fn(), s]; } finally { console.log = l; } };
const run = (sheets) => quiet(() => C.check([{ name: 'G', sheets }]));
const sheet = (name, entities) => ({ name, role: 'drawing', dxf: { entities } });
const X = [0, 40, 140, 180];
// 1. the register's own revision column decides: older = not re-issued; current and absent = the one to ask about; held = held
const reg = rows => sheet('A-000 LIST.dxf', block(X, rowsAt(300, rows.length + 2), Object.assign({ '0,0': 'DRAWING REGISTER', '1,0': 'SHEET NUMBER', '1,1': 'SHEET NAME', '1,2': 'REVISION' }, ...rows.map((r, i) => ({ [(i + 2) + ',0']: r[0], [(i + 2) + ',1']: r[1], [(i + 2) + ',2']: r[2] }))), { '0,1': 1, '0,2': 1 }));
const R4 = [['A-001', 'HERE', '01'], ['A-002', 'OLDER ONE', '00'], ['A-003', 'OLDER TWO', '00'], ['A-004', 'SHOULD BE HERE', '01']];
let [r] = run([reg(R4), sheet('A-001 PLAN.dxf', [])]), s = r.groups[0].sheets;
ok('a sheet listed at an older revision is "not re-issued", not missing', s.status === 'read' && s.not_reissued === 2 && s.absent.filter(a => a.says === 'not_reissued').map(a => a.no).join() === 'A-002,A-003', JSON.stringify(s.absent.map(a => a.no + ':' + a.says)));
ok('a sheet listed at the current revision and absent is the one to ask about', s.current_but_absent === 1 && s.absent.find(a => a.says === 'current_but_absent').no === 'A-004');
ok('a sheet that is here is not listed as absent', s.held === 1 && !s.absent.some(a => a.no === 'A-001'), 'held=' + s.held);
[r] = run([reg(R4), sheet('A-001 PLAN.dxf', []), sheet('A-004 SHOULD.dxf', [])]);
ok('RED CONTROL: the same sheet supplied clears the finding', r.groups[0].sheets.current_but_absent === 0);
// 2. a list with no revision column says nothing, and the checker does not guess
const noRev = sheet('S-000.dxf', block([0, 40, 140], rowsAt(200, 6), { '0,0': 'REGISTER', '1,0': 'DRAWING NUMBER', '1,1': 'DRAWING TITLE', '2,0': 'S-001', '2,1': 'ONE', '3,0': 'S-002', '3,1': 'TWO', '4,0': 'S-003', '4,1': 'THREE', '5,0': 'S-004', '5,1': 'FOUR' }, { '0,1': 1 }));
[r] = run([noRev]); s = r.groups[0].sheets;
ok('no revision column: "no statement", neither missing nor fine', s.no_statement === 4 && s.current_but_absent === 0 && s.not_reissued === 0, JSON.stringify({ n: s.no_statement }));
// 3. a heading printed with an underline code still reads (the fix in dxf2beams clean)
const under = sheet('A-000 U.dxf', block(X, rowsAt(300, 5), { '0,0': 'DRAWING REGISTER', '1,0': '\\LSHEET NUMBER', '1,1': '\\LSHEET NAME', '1,2': '\\LREVISION', '2,0': 'A-001', '2,1': 'ONE', '2,2': '01', '3,0': 'A-002', '3,1': 'TWO', '3,2': '00', '4,0': 'A-003', '4,1': 'THREE', '4,2': '01' }, { '0,1': 1, '0,2': 1 }));
[r] = run([under]);
ok('an underlined register heading is read, not skipped', r.groups[0].sheets.status === 'read' && r.groups[0].sheets.listed === 3);
// 4. repeated tags: two rows with different contents is a finding; one merged name over its rows is not
const xs = [0, 40, 80, 120, 160, 200], doors = rowB => sheet('D.dxf', block(xs, rowsAt(300, 5), { '0,0': 'DOOR SCHEDULE', '1,0': 'DOOR NO.', '1,1': 'TYPE', '1,2': 'WIDTH', '1,3': 'HEIGHT', '1,4': 'RATING', '2,0': 'D-1', '2,1': 'WD', '2,2': '900', '2,3': '2100', '2,4': '60', '3,0': rowB, '3,1': 'PT', '3,2': '1000', '3,3': '2200', '3,4': '90', '4,0': 'D-3', '4,1': 'PT', '4,2': '800', '4,3': '2100', '4,4': '30' }, { '0,1': 1, '0,2': 1, '0,3': 1, '0,4': 1 }));
[r] = run([doors('D-1')]);
ok('one tag on two different rows is reported with both rows', r.totals.repeated === 1 && r.groups[0].repeated[0].key === 'D-1' && r.groups[0].repeated[0].rows.length === 2, JSON.stringify(r.groups[0].repeated[0] && r.groups[0].repeated[0].rows));
[r] = run([doors('D-2')]);
ok('RED CONTROL: different tags report nothing, and the keys were judged', r.totals.repeated === 0 && r.totals.keys_judged === 3, 'judged=' + r.totals.keys_judged);
const Xp = [0, 40, 80, 110, 140, 170, 210], feeder = (nm, a, b, c, tot, top) => block(Xp, rowsAt(top, 4), { '0,0': 'CKT NO.', '0,1': 'NAME', '0,2': 'R- PH', '0,3': 'Y- PH', '0,4': 'B- PH', '0,5': 'TOTAL LOAD', '1,0': '1', '2,0': '2', '3,0': '3', '2,1': nm, '2,5': tot, '1,2': a, '2,3': b, '3,4': c }, null, { '1,1': 1, '2,1': 1, '1,5': 1, '2,5': 1 });
[r] = run([sheet('P.dxf', feeder('MDB', '10.50', '11.25', '12.25', '34.00', 300))]);
ok('a merged name over three phase rows is not a repeated tag', r.totals.repeated === 0, JSON.stringify(r.groups[0].repeated));
// 5. sums: rows that share one merged total are one feeder, whatever else differs on those rows
ok('three phase rows under one merged total add up: nothing reported', r.totals.sums_judged === 1 && r.totals.sums_off === 0, JSON.stringify(r.totals));
[r] = run([sheet('P.dxf', feeder('MDB', '10.50', '11.25', '12.25', '35.00', 300))]);
ok('RED CONTROL: a wrong printed total is reported with both numbers', r.totals.sums_off === 1 && r.groups[0].sums[0].off[0].found === 34 && r.groups[0].sums[0].off[0].printed === '35.00', JSON.stringify(r.groups[0].sums[0] && r.groups[0].sums[0].off));
const mh = bad => sheet('M.dxf', block(xs, rowsAt(100, 4), { '0,0': 'MANHOLE NO.', '0,1': 'COVER LEVEL', '0,2': 'INVERT LEVEL', '0,3': 'DEPTH', '0,4': 'SIZE', '1,0': 'MH-1', '1,1': '6.38', '1,2': '5.53', '1,3': bad, '1,4': '600', '2,0': 'MH-2', '2,1': '6.21', '2,2': '5.37', '2,3': '0.84', '2,4': '600', '3,0': 'MH-3', '3,1': '6.36', '3,2': '5.25', '3,3': '1.11', '3,4': '600' }));
[r] = run([mh('0.85')]);
ok('cover less invert equals depth on all rows: nothing reported', r.totals.sums_judged === 3 && r.totals.sums_off === 0, JSON.stringify(r.groups[0].sums));
[r] = run([mh('0.95')]);
ok('RED CONTROL: a wrong depth is reported', r.totals.sums_off === 1 && r.groups[0].sums[0].off[0].row === 'MH-1');
// 6. nothing judged says so
const [r0, l0] = run([sheet('EMPTY.dxf', [])]);
ok('a set with nothing to read says INCONCLUSIVE, never a clean bill', r0.status === 'INCONCLUSIVE' && /§SETCHECK INCONCLUSIVE/.test(l0) && r0.groups[0].sheets.status === 'INCONCLUSIVE');
// real set, private and optional
const SET = process.env.PRIVATE_SET_DXF;
if (!SET || !fs.existsSync(SET)) console.log('§W-DXF-SETCHECK-REAL SKIP PRIVATE_SET_DXF not set: no real sheet judged');
else {
  const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), groups = [];
  (function w(d) { const h = fs.readdirSync(d).map(f => path.join(d, f)), x = h.filter(p => /\.dxf$/i.test(p)); if (x.length) groups.push({ name: path.basename(d), sheets: x.map(p => ({ name: path.basename(p), role: 'drawing', dxf: new DxfParser().parseSync(fs.readFileSync(p, 'utf8')) })) }); h.filter(p => fs.statSync(p).isDirectory()).forEach(w); })(SET);
  const [rr, lg] = quiet(() => C.check(groups)), T = rr.totals;
  console.log(lg.split('\n').filter(l => /^§SETCHECK/.test(l)).join('\n'));
  ok('real set: every listed sheet is held or absent, and every absent one carries a statement', T.listed === T.held + T.not_reissued + T.current_but_absent + T.no_statement && T.listed > 0, JSON.stringify(T));
  ok('real set: most sums hold, so the columns are the right ones', T.sums_judged > 0 && T.sums_off / T.sums_judged <= 0.25, T.sums_off + ' off of ' + T.sums_judged);
}
const f = checks.filter(x => !x).length; console.log('§WITNESS_DXF_SETCHECK ' + (f ? 'FAIL ' : 'PASS ') + (checks.length - f) + '/' + checks.length); process.exit(f ? 1 : 0);
