#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-ACCEPT (prompts/DXF2BIM_MODELLER_LANE.md §L37). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: an owner's ruling on a set's rows reached nothing, and an override could wave through what must never pass. Does @ACCEPT move only what it may, keep the rows, and leave a set without it untouched?
// Pure, node: the qualifier's real entry, fed a small sheet and stated gaps. VACUOUS (exit 2) if the unmarked sheet does not block on the fed rows.
// usage: node modeller/tests/witness_dxf_accept.js
'use strict';
const path = require('path'), R = path.join(__dirname, '..');
const Q = require(path.join(R, 'dxf2bim/dxf2qualify.js')), C = require(path.join(R, 'dxf2bim/dxf2shell_config.js'));
const S = (C.STD && C.STD.QUALIFY) || C.QUALIFY;
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const DxfParser = require(path.join(R, 'lib/dxf-parser.js'));
const mark = (t, i) => ['0', 'TEXT', '5', (0x100 + i).toString(16).toUpperCase(), '8', 'DXF2BIM-MARK', '10', '-3000', '20', String(-2500 - 300 * i), '30', '0', '40', '150', '1', t];
const dxf = marks => new DxfParser().parseSync(['0', 'SECTION', '2', 'ENTITIES'].concat(...marks.map(mark), ['0', 'ENDSEC', '0', 'EOF']).join('\n') + '\n');
const BASE = ['@UNITS=mm @BY=user', '@SET=STD @BY=user', '@VIEW=PLAN @BY=user', '@LEVEL=0.15 @BY=user'];
const GAPS = [{ code: 'GAP:fill_size_mismatch', sheet: 'plan.dxf', shape: 'openings', handle: '1A' }, { code: 'GAP:type_size_mismatch', sheet: 'plan.dxf', shape: 'openings', handle: '2B' }];
const run = extra => Q.qualify({ files: [{ name: 'plan.dxf', dxf: dxf(BASE.concat(extra || [])), layer_maps: [] }], plan_ops: {}, gaps: GAPS, resolved: {} }, S);
const OK = 'owner,2026-11-04,a recorded reason, with a comma';
const a0 = run(), codes = v => v.blocking.map(b => b.code);
if (a0.verdict !== 'blocked' || !codes(a0).includes('GAP:fill_size_mismatch') || codes(a0).includes('QF:units_unstated')) { console.log('§VACUOUS the unmarked sheet did not block on the fed rows: ' + JSON.stringify(a0.counts)); process.exit(2); }
console.log('§BASE blocking ' + a0.blocking.length + ' ' + JSON.stringify(a0.counts));
ok('A1 no mark: blocked, no new key in the verdict', a0.accepted === undefined && a0.accepted_counts === undefined);
// the whole of what this little sheet blocks on, then the rows the sheet itself raises that may not be accepted
const a2 = run(['@ACCEPT=GAP:fill_size_mismatch,' + OK + ' @BY=user', '@ACCEPT=GAP:type_size_mismatch,' + OK + ' @BY=user']), acc2 = a2.accepted || [];
ok('A2 accepted rows leave blocking and keep their fields, who, when and why', !codes(a2).includes('GAP:fill_size_mismatch') && !codes(a2).includes('GAP:type_size_mismatch') && acc2.length === 2 && acc2[0].sheet === 'plan.dxf' && acc2[0].handles.length === 1 && acc2[0].accepted_by.who === 'owner' && acc2[0].accepted_by.date === '2026-11-04' && acc2[0].accepted_by.reason === 'a recorded reason, with a comma', JSON.stringify(a2.accepted_counts));
ok('A2b a row accepted leaves the count, and the total of rows is kept', a2.blocking.length + acc2.length === a0.blocking.length, a2.blocking.length + ' + ' + acc2.length + ' = ' + a0.blocking.length);
const a3 = run(['@ACCEPT=GAP:fill_size_mismatch,' + OK + ' @BY=user']);
ok('A3 one code marked: the other still blocks', !codes(a3).includes('GAP:fill_size_mismatch') && codes(a3).includes('GAP:type_size_mismatch') && a3.verdict === 'blocked');
for (const hard of ['GAP:no_lod400_geometry', 'GAP:lod400_library_unreachable', 'QF:mark_invalid', 'GAP:pipeline_not_run', 'QF:setting_missing']) { const a4 = run(['@ACCEPT=' + hard + ',' + OK + ' @BY=user']); ok('A4 ' + hard + ' cannot be accepted', a4.verdict === 'blocked' && a4.blocking.some(b => b.code === 'QF:accept_refused' && b.accept === hard) && !a4.accepted); }
const a5 = run(['@ACCEPT=GAP:fill_size_mismatch,' + OK + ' @BY=model']), a5b = run(['@ACCEPT=GAP:fill_size_mismatch,' + OK]);
ok('A5 not stated by a person: refused, the row still blocks', [a5, a5b].every(v => v.blocking.some(b => b.code === 'QF:accept_refused') && codes(v).includes('GAP:fill_size_mismatch') && !v.accepted));
const a6 = run(['@ACCEPT=QF:grid_label_series,' + OK + ' @BY=user']);
ok('A6 accepted with no such row: advisory, so a stale acceptance says so', a6.advisory.some(b => b.code === 'QF:accept_unused' && b.accept === 'QF:grid_label_series'));
for (const bad of ['GAP:fill_size_mismatch', 'GAP:fill_size_mismatch,owner', 'GAP:fill_size_mismatch,owner,2026-11-04', 'GAP:fill_size_mismatch,owner,yesterday,why', 'GAP:fill_size_mismatch,,2026-11-04,why']) { const a7 = run(['@ACCEPT=' + bad + ' @BY=user']); ok('A7 malformed is refused: ' + bad, a7.blocking.some(b => b.code === 'QF:mark_invalid' && b.mark_code === 'MARK:malformed') && !a7.accepted); }
console.log('§RESULT judged=' + judged + ' fails=' + fails + ' ' + (fails ? 'FAIL' : 'PASS')); process.exit(fails ? 1 : 0);
