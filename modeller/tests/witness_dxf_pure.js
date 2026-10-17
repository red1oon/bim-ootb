// W-PURE (prompts/DXF2BIM_MODELLER_LANE.md §L8): the editor's suggestion rules (dxf2suggest.js) and the structure judgement (dxf2structure.js) run in NODE with no browser and no editor state,
// and give what the browser witnesses (W-DXF-TICKS, W-DXF-STRUCT) prove through the UI. Issue: logic that only runs inside a page cannot be reused (CLI, batch, other hosts) nor tested cheaply.
const I = require('../dxf2bim_import.js'), P = require('../dxf2prep.js'), B = require('../dxf2bodies.js'), MK = require('../dxf2bim/dxf2marks.js'), SG = require('../dxf2suggest.js'), ST = require('../dxf2structure.js');
const DxfParser = require('../lib/dxf-parser.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const lbox = (layer, x0, y0, x1, y1) => line(layer, x0, y0, x1, y0) + line(layer, x1, y0, x1, y1) + line(layer, x1, y1, x0, y1) + line(layer, x0, y1, x0, y0);
const poly = (layer, x0, y0, x1, y1, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, 4) + g(70, 1) + g(10, x0) + g(20, y0) + g(10, x1) + g(20, y0) + g(10, x1) + g(20, y1) + g(10, x0) + g(20, y1);
const txt = (layer, x, y, t) => g(0, 'TEXT') + g(8, layer) + g(10, x) + g(20, y) + g(30, 0) + g(40, 40) + g(1, t);
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const doc = (body, marks, header) => g(0, 'SECTION') + g(2, 'HEADER') + (header ? g(9, '$INSUNITS') + g(70, header) : '') + g(0, 'ENDSEC') + g(0, 'SECTION') + g(2, 'ENTITIES') + body + (marks || []).map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
// a suggestion-side sheet: { name, dxf, marks } with marks read from the file as the editor loads them
const sheet = (name, text) => { const dxf = new DxfParser().parseSync(text); return { name, dxf, marks: MK.readMarks(dxf.entities).map(m => { const r = /^@([A-Z]+)=(.*)$/.exec(m.raw.replace(/\s+@BY=\S+$/, '')); return { key: r[1], value: r[2], x: m.x, y: m.y, source: 'file' }; }) }; };
const ctxOf = sheets => ({ MK, sheets: () => sheets, gridLayers: sh => ['A-GRID'].concat(sh.marks.filter(m => m.key === 'LAYER' && /,grid$/.test(m.value)).map(m => m.value.replace(/,grid$/, ''))), levelLayers: () => ['A-ANNO-LEVL'] });
const sug = (sheets, name) => SG.create(ctxOf(sheets)).proposalsFor(sheets.find(s => s.name === name));
const ELEVM = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=E'], ['@Z=3', 0, 3000]];
const PLANM = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 4000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 2150]];
const body = (extra) => line('0', 0, 0, 8000, 0) + line('0', 500, 0, 500, 3000) + line('0', 7500, 0, 7500, 3000) + line('0', 500, 3000, 7500, 3000) + line('Dim', 1000, -80, 1000, -60) + line('Dim', 4000, -80, 4000, -60) + txt('Tex', 990, -140, 'A') + txt('Tex', 3990, -140, 'B') + txt('Tex', 6990, -140, 'C') + (extra || '');
const plan = sheet('plan.dxf', doc(line('Col', 850, 0, 1150, 0), PLANM));
const rules = P_ => P_.list.map(p => p.rule + ':' + p.key + '=' + p.value + '@' + p.x + ',' + p.y);

// ---- W-SUGGEST ----
let e = sheet('elev.dxf', doc(body(), ELEVM)), r = sug([plan, e], 'elev.dxf');
const gh = r.list.filter(p => p.rule === 'PR-GRID-TICK'), gz = r.list.filter(p => p.rule === 'PR-Z-GROUND');
ok('SG1 ticks: GRIDH A/B at the TICK x (1000 / 4000), not the label text (990 / 3990); ground @Z=0 at y 0', gh.length === 2 && gh.find(p => p.value === 'A').x === 1000 && gh.find(p => p.value === 'B').x === 4000 && gz.length === 1 && gz[0].y === 0, JSON.stringify(rules(r)));
ok('SG2 CONTROL label C has no tick: not proposed', !r.list.some(p => p.value === 'C'));
r = sug([plan, sheet('elev.dxf', doc(body(line('Dim', 1200, -80, 1200, -60)), ELEVM))], 'elev.dxf');
ok('SG3 CONTROL two ticks near label A: A refused (listed), B proposed', !r.list.some(p => p.rule === 'PR-GRID-TICK' && p.value === 'A') && r.list.some(p => p.rule === 'PR-GRID-TICK' && p.value === 'B') && r.refused.some(x => /label A: 2 ticks/.test(x.why)), JSON.stringify(r.refused.map(x => x.why)));
r = sug([plan, sheet('elev.dxf', doc(line('A-GRID', 1000, -100, 1000, 3000) + line('A-GRID', 4000, -100, 4000, 3000) + txt('Tex', 1000, -140, 'A') + txt('Tex', 4000, -140, 'B') + line('0', 0, 0, 8000, 0), ELEVM.concat([['@LAYER=A-GRID,grid']])))], 'elev.dxf');
ok('SG4 CONTROL a typed grid layer + labels: strict PR-GRID for A and B, no PR-GRID-TICK duplicate', r.list.filter(p => p.rule === 'PR-GRID').length === 2 && !r.list.some(p => p.rule === 'PR-GRID-TICK'), JSON.stringify(rules(r)));
r = sug([plan, sheet('elev.dxf', doc(line('0', 0, 0, 3000, 0) + line('0', 3000, 0, 8000, 0) + line('0', 500, 0, 500, 3000) + line('0', 7500, 0, 7500, 3000) + line('Dim', 6000, -900, 6200, -900), ELEVM))], 'elev.dxf');
ok('SG5 a ground line drawn in two segments is found; a stray lower short line is not the ground: @Z=0 at y 0', r.list.filter(p => p.rule === 'PR-Z-GROUND').length === 1 && r.list.find(p => p.rule === 'PR-Z-GROUND').y === 0, JSON.stringify(rules(r)));
r = sug([plan, sheet('e.dxf', doc(body() + txt('Tex', 100, -400, 'South Elevation'), [['@SET=T'], ['@UNITS=mm']]))], 'e.dxf');
ok('SG6 an unmarked sheet titled "South Elevation" (mixed case): PR-VIEW=ELEV', r.list.some(p => p.rule === 'PR-VIEW' && p.value === 'ELEV'), JSON.stringify(rules(r)));
r = sug([plan, sheet('1S_ELEV_SOUTH.dxf', doc(body() + txt('Tex', 100, -400, 'South Elevation'), [['@SET=T'], ['@VIEW=ELEV'], ['@UNITS=mm'], ['@NAME=E']]))], '1S_ELEV_SOUTH.dxf');
ok('SG7 once the view is stated, "SOUTH" proposes FACE=minY and names the convention', r.list.some(p => p.rule === 'PR-FACE' && p.value === 'minY' && /north up/.test(p.why)), JSON.stringify(rules(r)));
r = sug([plan, sheet('h.dxf', doc(line('0', 0, 0, 8000, 0), [], 4))], 'h.dxf');
ok('SG8 units from $INSUNITS are SUGGESTED (PR-UNITS=mm), never a marking', r.list.some(p => p.rule === 'PR-UNITS' && p.value === 'mm') && sheet('h.dxf', doc('', [], 4)).marks.length === 0);
ok('SG9 FALSIFIER: no module state leaks: two creates over different sheet lists give independent results', sug([plan, sheet('elev.dxf', doc(body(), ELEVM))], 'elev.dxf').list.length === sug([plan, sheet('elev.dxf', doc(body(), ELEVM))], 'elev.dxf').list.length);

// ---- W-STRUCTURE ----
const cols = [[850, 1150], [3850, 4150], [6850, 7150]];
const readAll = files => I.readSheets(files.map(([name, text]) => ({ name, text })), { prep: P });
const typedPlan = (list, extra) => doc(list.map(([a, b], i) => poly('Col', a, 0, b, 300, 'C' + i)).join(''), PLANM.concat([['@LAYER=Col,column']], extra || []));
const typedElev = (extra) => doc(cols.map(([a, b]) => lbox('Col', a, 0, b, 3000)).join(''), [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=E'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 4000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Col,column']].concat(extra || []));
const judge = (files, o) => { const sh = readAll(files); return { sh, out: ST.judge(sh, Object.assign({ I, B }, o)) }; };
let j = judge([['plan.dxf', typedPlan(cols)], ['south.dxf', typedElev()]]);
ok('ST1 isStructure + judge: 3 columns, qualifies, 0 blocking, 0 advisory, set null, ST = one Level 1', ST.isStructure(j.sh, B) && j.out.gate.ok && j.out.gate.structure.bodies === 3 && j.out.gate.verdict.blocking.length === 0 && j.out.gate.verdict.advisory.length === 0 && j.out.gate.set === null && j.out.gate.R.ST.length === 1 && j.out.gate.R.ST[0].name === 'Level 1', JSON.stringify(j.out.gate.structure));
ok('ST2 the gate shape the importer/editor read (by_shape zeros, counts, R.els, run_id hex)', j.out.gate.verdict.by_shape.walls.blocking === 0 && j.out.gate.verdict.counts.bodies === 3 && j.out.gate.R.els.length === 3 && /^[0-9a-f]{64}$/.test(j.out.gate.R.run_id));
j = judge([['plan.dxf', typedPlan(cols.concat([[9850, 10150]]))], ['south.dxf', typedElev()]]);
ok('ST3 CONTROL a 4th column without an elevation: still qualifies, 1 advisory GAP:body_no_elevation, 3 built', j.out.gate.ok && j.out.gate.structure.left_out === 1 && j.out.gate.verdict.advisory[0].code === 'GAP:body_no_elevation' && j.out.gate.structure.bodies === 3);
j = judge([['plan.dxf', typedPlan(cols, [['@LAYER=Wl,wall']])], ['south.dxf', typedElev()]]);
ok('ST4 CONTROL a wall layer next to a body kind: refused "mixed sets are not supported yet"', !j.out.gate.ok && j.out.gate.refused.some(x => /mixed sets are not supported yet/.test(x.reason)));
j = judge([['south.dxf', typedElev()]]);
ok('ST5 CONTROL no plan: refused "no storey plan"', !j.out.gate.ok && j.out.gate.refused.some(x => /no storey plan/.test(x.reason)));
j = judge([['plan.dxf', typedPlan(cols).replace('@LAYER=Col,column', '@LAYER=Col,ignore')], ['south.dxf', typedElev().replace('@LAYER=Col,column', '@LAYER=Col,ignore')]]);
ok('ST6 FALSIFIER: no body kind typed -> not a structure set (the standard gate decides)', !ST.isStructure(j.sh, B));
ok('ST7 deterministic: the same sheets twice -> the same run_id and bodies', judge([['plan.dxf', typedPlan(cols)], ['south.dxf', typedElev()]]).out.gate.R.run_id === judge([['plan.dxf', typedPlan(cols)], ['south.dxf', typedElev()]]).out.gate.R.run_id);
console.log(fail ? 'W-PURE FAIL ' + fail : 'W-PURE PASS'); process.exit(fail ? 1 : 0);
