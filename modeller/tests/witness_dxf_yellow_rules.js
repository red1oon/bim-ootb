#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-YELLOW-RULES (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D107). Read the log after every run: exit code is not evidence.
// Each yellow default rule fits a Revit-exported set AND is a setting: the earlier behaviour comes back from a choice or a drawing's @DEFAULT. Generated sheets, so it runs anywhere.
// A rule that never fired on its own positive case prints FAIL, never PASS: every "none" line below is paired with a line where the same rule DOES fire.
'use strict';
const path = require('path'), fs = require('fs');
const M = path.join(__dirname, '..'), SG = require(path.join(M, 'dxf2suggest.js')), MK = require(path.join(M, 'dxf2bim/dxf2marks.js')), PN = require(path.join(M, 'dxf2panels.js')), MR = require(path.join(M, 'dxf2markrefs.js')), B = require(path.join(M, 'dxf2bodies.js'));
const REG = JSON.parse(fs.readFileSync(path.join(M, 'element_defaults.json'), 'utf8')).defaults;
let fails = 0, passes = 0, h = 100;
const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (c) passes++; else fails++; };
const L = (layer, x0, y0, x1, y1) => ({ type: 'LINE', layer, handle: (h++).toString(16), vertices: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
const T = (type, layer, text, x, y) => ({ type, layer, text, handle: (h++).toString(16), startPoint: type === 'TEXT' ? { x, y } : undefined, position: type === 'MTEXT' ? { x, y } : undefined });
const mark = (key, value, x, y, rule) => ({ key, value: String(value), x: x || 0, y: y || 0, rule: rule || null });
const sheet = (name, entities, marks) => ({ name, dxf: { header: { $INSUNITS: 4 }, entities }, marks: marks || [] });
const props = (sh, all, choices) => { choices = choices || {}; const sheets = all || [sh]; return SG.create({ MK, sheets: () => sheets, gridLayers: () => ['A-GRID'], levelLayers: () => ['A-ANNO-LEVL'], setting: k => choices[k] }).proposalsFor(sh); };
const rows = (r, rule, key) => r.list.filter(p => p.rule === rule && (!key || p.key === key));
const vals = (r, rule, key) => rows(r, rule, key).map(p => p.value).sort().join(',');
const PLAN = [mark('VIEW', 'PLAN'), mark('UNITS', 'mm'), mark('LEVEL', 0)];

// Y1 ticks: a label + one short vertical tick near it
const tickPlan = (marks, extra) => sheet('p.dxf', [L('Dim', 5000, 0, 5000, 300), T('TEXT', 'Dim', '7', 5000, 400)].concat(extra || []), PLAN.concat(marks || []));
const two = [mark('GRIDX', 'A1', 280), mark('GRIDX', 'A2', 9680)];
ok('YR1a no grid stated: the tick rule still fires (the shed path)', vals(props(tickPlan()), 'PR-GRID-TICK', 'GRIDX') === '7');
ok('YR1b 2 stated grids stop the ticks', vals(props(tickPlan(two)), 'PR-GRID-TICK', 'GRIDX') === '');
ok('YR1c set back: always brings the guess back', vals(props(tickPlan(two), null, { 'suggest.grid_ticks': 'always' }), 'PR-GRID-TICK', 'GRIDX') === '7');
ok('YR1d off: no guess even with no grid stated', vals(props(tickPlan(), null, { 'suggest.grid_ticks': 'off' }), 'PR-GRID-TICK', 'GRIDX') === '');
ok('YR1e a mark this rule wrote does not stop it (a partly accepted list stays complete)', vals(props(tickPlan([mark('GRIDX', '1', 100, 0, 'PR-GRID-TICK'), mark('GRIDX', '2', 200, 0, 'PR-GRID-TICK')])), 'PR-GRID-TICK', 'GRIDX') === '7');
// Y1 region
ok('YR2a a tick outside @REGION: none', vals(props(tickPlan([mark('REGION', '20000,20000,30000,30000')])), 'PR-GRID-TICK', 'GRIDX') === '');
ok('YR2b a tick inside @REGION: still read', vals(props(tickPlan([mark('REGION', '0,0,6000,1000')])), 'PR-GRID-TICK', 'GRIDX') === '7');
// Y4 labels
const gridPlan = (label, reach, layer) => sheet('p.dxf', [L(layer || 'S-GRID', 280, 0, 280, 50000), T('MTEXT', 'S-GRID-IDEN', label, 280, 50000 + reach)], PLAN);
ok('YR3a A1 at 1.0 m beyond the end, on S-GRID: read', vals(props(gridPlan('A1', 1000)), 'PR-GRID', 'GRIDX') === 'A1');
ok('YR3b MTEXT format codes do not hide a label', vals(props(gridPlan('{\\fArial;A1}', 1000)), 'PR-GRID', 'GRIDX') === 'A1');
ok('YR3c set back: letters_or_digits refuses A1', vals(props(gridPlan('A1', 1000), null, { 'suggest.grid_label': 'letters_or_digits' }), 'PR-GRID', 'GRIDX') === '');
ok('YR3d set back: reach 0.7 refuses it', vals(props(gridPlan('A1', 1000), null, { 'suggest.grid_reach': '0.7' }), 'PR-GRID', 'GRIDX') === '');
ok('YR3e set back: a_grid_only does not search S-GRID', vals(props(gridPlan('A1', 1000), null, { 'suggest.grid_layer': 'a_grid_only' }), 'PR-GRID', 'GRIDX') === '');
ok('YR3h a label anchored 0.37 m sideways (a text corner, not its centre): read', vals(props(sheet('p.dxf', [L('S-GRID', 280, 0, 280, 50000), T('MTEXT', 'S-GRID-IDEN', 'A1', 280 - 370, 50800)], PLAN)), 'PR-GRID', 'GRIDX') === 'A1');
ok('YR3i set back: along 0.06 refuses it', vals(props(sheet('p.dxf', [L('S-GRID', 280, 0, 280, 50000), T('MTEXT', 'S-GRID-IDEN', 'A1', 280 - 370, 50800)], PLAN), null, { 'suggest.grid_along': '0.06' }), 'PR-GRID', 'GRIDX') === '');
const noLabel = props(sheet('p.dxf', [L('S-GRID', 280, 0, 280, 50000)], PLAN));
ok('YR3f a GRID-named layer with no label proposes nothing: the name alone decides nothing', vals(noLabel, 'PR-GRID', 'GRIDX') === '');
const skew = props(sheet('p.dxf', [L('S-GRID', 0, 0, 1000, 3000), T('MTEXT', 'S-GRID-IDEN', 'B1', 1000, 4000)], PLAN));
ok('YR3g a rotated grid line never becomes an axis grid (GRIDX): it is its own row (§D108)', vals(skew, 'PR-GRID', 'GRIDX') === '' && rows(skew, 'PR-GRID-A').length === 1);
// Y2 levels
const ELEV = [mark('VIEW', 'ELEV'), mark('UNITS', 'mm'), mark('FACE', 'minX')];
const elev = ents => sheet('e.dxf', ents, ELEV);
const lev = () => elev([L('A-FLOR-LEVL', 0, 0, 40000, 0), L('A-FLOR-LEVL', 0, 4000, 40000, 4000), L('Ground', 0, -300, 44000, -300), T('MTEXT', 'A-ANNO-SYMB', 'EL: +0.000 m', 0, 600), T('MTEXT', 'A-FLOR-LEVL', '+4.00 m', 0, 3200)]);
const lr = props(lev());
ok('YR4a value + line at that height: both read', rows(lr, 'PR-Z').map(p => p.value + '@' + p.y).sort().join(' ') === '0@0 4@4000', rows(lr, 'PR-Z').map(p => p.value + '@' + p.y).join(' '));
ok('YR4b the ground guess does not fire when a level was read', rows(lr, 'PR-Z-GROUND').length === 0);
const lrBack = props(lev(), null, { 'suggest.level_text': 'level_layer_only' });
ok('YR4c set back: the earlier result (nothing read, the ground guess takes the lowest long line)', rows(lrBack, 'PR-Z').length === 0 && rows(lrBack, 'PR-Z-GROUND').map(p => p.y).join() === '-300', JSON.stringify(rows(lrBack, 'PR-Z-GROUND').map(p => p.y)));
ok('YR4d a value with no line at its height is not read', rows(props(elev([L('A', 0, 0, 40000, 0), T('MTEXT', 'X', '+7.00 m', 0, 100)])), 'PR-Z').length === 0);
// Y3 titles
const roleOf = (ents, c) => vals(props(sheet('s.dxf', ents, []), null, c), 'PR-VIEW');
ok('YR5a an MTEXT title with codes gives the role', roleOf([T('MTEXT', 'TB', '\\LGROUND FLOOR PLAN', 0, 0)]) === 'PLAN');
ok('YR5b set back: text_only does not read it', roleOf([T('MTEXT', 'TB', '\\LGROUND FLOOR PLAN', 0, 0)], { 'suggest.title_text': 'text_only' }) === '');
ok('YR5c a note is not a title (BEAM, SEE PLAN)', roleOf([T('MTEXT', 'N', 'BEAM, SEE PLAN', 0, 0)]) === '');
ok('YR5d two spellings of one title are one', roleOf([T('MTEXT', 'TB', 'LEVEL 1 - FLOOR PLAN', 0, 0), T('MTEXT', 'TB', 'LEVEL 1 FLOOR PLAN', 0, 9)]) === 'PLAN');
ok('YR5e two real titles still refuse', roleOf([T('MTEXT', 'TB', 'ATTIC SLAB PARTIAL PLAN', 0, 0), T('MTEXT', 'TB', 'LOW ROOF FRAMING PLAN', 0, 9)]) === '');
ok('YR5g a sentence-case MTEXT label is not a title (regression: a details sheet read as a section)', roleOf([T('MTEXT', 'N', 'Footing Section', 0, 0)]) === '');
ok('YR5f WALL ELEVATION GRID A1 is an elevation', roleOf([T('MTEXT', 'TB', 'WALL ELEVATION GRID A1', 0, 0)]) === 'ELEV');
// Y6 the plane: three wings
const wings = { factor: 0.001, desc: { gridsX: { A1: 280, A2: 9680, C1: 75683, C2: 85083 }, gridsY: { AA: 57407, AE: 19701 } } };
const MODE = REG['panel.plane'].value, ed = { gridsH: { AA: 1, AE: 2 } };
const near = (a, b) => a !== null && Math.abs(a - b) < 1e-9;
ok('YR6a new default: an elevation on family A stands on wing A\'s end line, not the far wing', near(PN.facePlane(wings, 'maxX', { desc: ed, mode: MODE }), 9.68), String(PN.facePlane(wings, 'maxX', { desc: ed, mode: MODE })));
ok('YR6b set back: the plan\'s outermost line', near(PN.facePlane(wings, 'maxX', { desc: ed, mode: 'end grid line, centred' }), 85.083));
ok('YR6c no opts (every older caller): the outermost line', near(PN.facePlane(wings, 'maxX'), 85.083));
ok('YR6d @PLANE wins over both', near(PN.facePlane(wings, 'maxX', { desc: Object.assign({ plane: 'A1' }, ed), mode: MODE }), 0.28));
const flat = { factor: 0.001, desc: { gridsX: { 1: 0, 2: 5000, 3: 9000 }, gridsY: { A: 0, B: 4000 } } };
ok('YR6e labels with no family: same as before', near(PN.facePlane(flat, 'maxX', { desc: { gridsH: { A: 1, B: 2 } }, mode: MODE }), 9));
ok('YR6f mixed families: same as before', near(PN.facePlane(wings, 'maxX', { desc: { gridsH: { AA: 1, CA: 2 } }, mode: MODE }), 85.083));
// PR-PLANE
const planMarks = PLAN.concat([mark('GRIDX', 'A1', 280), mark('GRIDX', 'A2', 9680)]), P0 = sheet('p.dxf', [], planMarks);
const eOn = t => sheet('e.dxf', [T('MTEXT', 'TB', t, 0, 0)], ELEV);
ok('YR7a the title names a plan grid line: PR-PLANE', (s => vals(props(s, [P0, s]), 'PR-PLANE'))(eOn('WALL ELEVATION GRID A1')) === 'A1');
ok('YR7b a line the plan does not hold: refused with the reason', (s => { const r = props(s, [P0, s]); return vals(r, 'PR-PLANE') === '' && r.refused.some(q => q.rule === 'PR-PLANE'); })(eOn('WALL ELEVATION GRID Z9')));
ok('YR7d the plane is the family\'s end line: the face follows', (s => vals(props(s, [P0, s]), 'PR-FACE-PLANE'))(sheet('e.dxf', [T('MTEXT', 'TB', 'WALL ELEVATION GRID A2', 0, 0)], [mark('VIEW', 'ELEV'), mark('UNITS', 'mm')])) === 'maxX');
const P3 = sheet('p.dxf', [], PLAN.concat([mark('GRIDX', 'A1', 280), mark('GRIDX', 'A2', 5000), mark('GRIDX', 'A3', 9680)]));
ok('YR7e an interior line gives no face: left to the person', (s => vals(props(s, [P3, s]), 'PR-FACE-PLANE') === '' && vals(props(s, [P3, s]), 'PR-PLANE') === 'A2')(sheet('e.dxf', [T('MTEXT', 'TB', 'WALL ELEVATION GRID A2', 0, 0)], [mark('VIEW', 'ELEV'), mark('UNITS', 'mm')])));
ok('YR7c @PLANE is a valid marking, and is not required', (() => { const d = MK.describe([{ raw: '@VIEW=ELEV', handle: '1', x: 0, y: 0 }, { raw: '@PLANE=A1', handle: '2', x: 0, y: 0 }]); return d.desc.plane === 'A1' && !d.errors.some(e => /PLANE/.test(e.message || '')); })());
// Y8 missing sheets
const a = { desc: { sheetno: 'A-100' }, dxf: { entities: [T('MTEXT', 'SYM', 'A-300', 0, 0), T('MTEXT', 'SYM', 'EX-03', 0, 1), T('MTEXT', 'SYM', 'S-012', 0, 2), T('MTEXT', 'SYM', '{\\fArial;S-406}', 0, 3)] } }, s = { desc: { sheetno: 'S-012' }, dxf: { entities: [] } };
const sr = MR.sheetRefs([a, s], { clean: B.cleanText });
ok('YR8a referred and not held = missing; a door mark never counts', sr.missing.join() === 'A-300,S-406', sr.log);
ok('YR8b advisories only, one per sheet', sr.advisories.length === 2 && sr.advisories.every(x => x.code === 'QF:sheet_referred_missing'));
ok('YR8c no @SHEETNO in the set: nothing to report (older sets unchanged)', MR.sheetRefs([{ desc: {}, dxf: { entities: a.dxf.entities } }]).missing.length === 0);
ok('YR8d PR-SHEETNO from the file name; door-mark-like words in the rest do not confuse it', vals(props(sheet('PJ - A-Sheet - A-100 - GROUND FLOOR PLAN.dxf', [], [])), 'PR-SHEETNO') === 'A-100');
ok('YR8e two numbers in a file name: none', vals(props(sheet('A-100 and A-101.dxf', [], [])), 'PR-SHEETNO') === '');
// Y9 @DEFAULT
const withDef = (kv, sh) => { sh.marks = sh.marks.concat([mark('DEFAULT', kv)]); return sh; };
ok('YR9a @DEFAULT sets grid_ticks back', vals(props(withDef('suggest.grid_ticks,always', tickPlan(two))), 'PR-GRID-TICK', 'GRIDX') === '7');
ok('YR9b @DEFAULT sets grid_label back', vals(props(withDef('suggest.grid_label,letters_or_digits', gridPlan('A1', 1000))), 'PR-GRID', 'GRIDX') === '');
ok('YR9c @DEFAULT sets reach back', vals(props(withDef('suggest.grid_reach,0.7', gridPlan('A1', 1000))), 'PR-GRID', 'GRIDX') === '');
ok('YR9d @DEFAULT sets grid_layer back', vals(props(withDef('suggest.grid_layer,a_grid_only', gridPlan('A1', 1000))), 'PR-GRID', 'GRIDX') === '');
ok('YR9e @DEFAULT sets level_text back', rows(props(withDef('suggest.level_text,level_layer_only', lev())), 'PR-Z').length === 0);
ok('YR9f @DEFAULT sets title_text back', vals(props(withDef('suggest.title_text,text_only', sheet('s.dxf', [T('MTEXT', 'TB', 'GROUND FLOOR PLAN', 0, 0)], []))), 'PR-VIEW') === '');
ok('YR9g a choice loses to the drawing\'s @DEFAULT', vals(props(withDef('suggest.grid_ticks,always', tickPlan(two)), null, { 'suggest.grid_ticks': 'off' }), 'PR-GRID-TICK', 'GRIDX') === '7');
// §D108 rotated grid lines
const rot = (lab, extra) => { const u = [Math.cos(73.835 * Math.PI / 180), Math.sin(73.835 * Math.PI / 180)], a = [25817, 20000], b = [a[0] + u[0] * 49000, a[1] + u[1] * 49000]; const e = [L('S-GRID', a[0], a[1], b[0], b[1])]; if (lab) e.push(T('MTEXT', 'S-GRID-IDEN', lab, b[0] + u[0] * 800, b[1] + u[1] * 800)); return sheet('p.dxf', e, PLAN.concat(extra || [])); };
ok('YR11a a labelled rotated line proposes @GRIDA at its own angle', (r => rows(r, 'PR-GRID-A').length === 1 && /^B1,73\.835/.test(rows(r, 'PR-GRID-A')[0].value))(props(rot('B1'))));
ok('YR11b set back: off, only counted', (r => rows(r, 'PR-GRID-A').length === 0 && r.refused.some(q => /not parallel/.test(q.why)))(props(rot('B1'), null, { 'suggest.grid_rotated': 'off' })));
ok('YR11c an unlabelled rotated line: none, counted', (r => rows(r, 'PR-GRID-A').length === 0 && r.refused.some(q => /no label/.test(q.why)))(props(rot(null))));
ok('YR11d @DEFAULT sets it back', rows(props(withDef('suggest.grid_rotated,off', rot('B1'))), 'PR-GRID-A').length === 0);
ok('YR11e @GRIDA is a valid marking', (() => { const d = MK.describe([{ raw: '@VIEW=PLAN', handle: '1', x: 0, y: 0 }, { raw: '@GRIDA=B1,73.835', handle: '2', x: 5, y: 7 }]); return d.desc.gridsA.B1 && d.desc.gridsA.B1.angle === 73.835 && d.desc.gridsA.B1.x === 5; })());
// §D108 planeFit, known answers: a rotated wing with B1 at the origin, BA crossing at distance 0, BB at 10 m, BC at 25 m along B1
const th = 73.835 * Math.PI / 180, uu = [Math.cos(th), Math.sin(th)], at0 = d => ({ x: uu[0] * d * 1000, y: uu[1] * d * 1000, angle: 163.835 });
const wing = { factor: 0.001, desc: { gridsX: { C1: 75000 }, gridsY: { CA: 50000 }, gridsA: { B1: { x: 0, y: 0, angle: 73.835 }, BA: at0(0), BB: at0(10), BC: at0(25) } } };
const onLine = (q, d) => Math.hypot(q[0] - uu[0] * d, q[1] - uu[1] * d) < 1e-6;
const fw = PN.planeFit(wing, { plane: 'B1', gridsH: { BA: 1000, BB: 11000, BC: 26000 } }, { k: 0.001 }), fr = PN.planeFit(wing, { plane: 'B1', gridsH: { BA: 26000, BB: 16000, BC: 1000 } }, { k: 0.001 });
ok('YR12a a rotated line: drawing x lands on the line at its grid distance', fw && fw.fit === 'grid' && onLine(fw.at(11000), 10) && onLine(fw.at(26000), 25) && fw.spread < 1e-6);
ok('YR12b a sheet drawn the other way round: the sign comes from the grid', fr && fr.sg === -1 && onLine(fr.at(16000), 10) && onLine(fr.at(1000), 25));
ok('YR12c the spread is reported when the drawing and the plan disagree', (f => f.spread > 0.09 && f.spread < 0.11)(PN.planeFit(wing, { plane: 'B1', gridsH: { BA: 1000, BB: 11100, BC: 26000 } }, { k: 0.001 })));
// one rule, not two: on an axis-parallel line the same point as the axis route
const sq = { factor: 0.001, desc: { gridsX: { A1: 280, A2: 9680 }, gridsY: { AA: 57407, AB: 51369, AE: 19701 } } }, eA = { plane: 'A2', view: 'ELEV', units: 'mm', haxis: '+Y', gridsH: { AA: 40000, AB: 33962, AE: 2294 }, zs: [{ z: 0, y: 0 }, { z: 4, y: 4000 }] };
const fa = PN.planeFit(sq, eA, { k: 0.001 }), alg = MK.align(Object.assign({ units: 'mm', view: 'PLAN' }, sq.desc), eA, 0.001);
ok('YR13 an axis-parallel line gives the axis route\'s point', fa && alg.map && [40000, 33962, 12345].every(h => { const q = fa.at(h); return Math.abs(q[0] - 9.68) < 1e-6 && Math.abs(q[1] - alg.map.toPlan(h)) < 1e-6; }), JSON.stringify(fa && fa.at(12345)));
// no grid in the view
const noG = { plane: 'A2', gridsH: {} };
const fc = PN.planeFit(sq, noG, { k: 0.001, hc: 5000, mode: 'centre_on_wing' });
ok('YR14a no crossing labels: centred on the family\'s span and said so', fc && fc.fit === 'centred' && Math.abs(fc.at(5000)[1] - (57.407 + 19.701) / 2) < 1e-6 && fc.spread === null);
ok('YR14b set back: lie_flat gives null', PN.planeFit(sq, noG, { k: 0.001, hc: 5000, mode: 'lie_flat' }) === null);
ok('YR14c a line the plan does not hold: null', PN.planeFit(sq, { plane: 'Z9', gridsH: {} }, { k: 0.001, mode: 'centre_on_wing' }) === null);
// §D108 levels by name
const eL = (extra) => sheet('e.dxf', [T('MTEXT', 'LV', 'EL: +4.800 m', 0, 4400), T('MTEXT', 'LV', 'HALL LEVEL 01', 0, 4900), T('MTEXT', 'LV', 'EL: +9.050 m', 0, 8650), T('MTEXT', 'LV', 'HALL ROOF', 0, 9150)].concat(extra || []), ELEV);
const pT = t => sheet('p.dxf', [T('MTEXT', 'TB', t, 0, 0)], [mark('VIEW', 'PLAN'), mark('UNITS', 'mm')]);
const lvl = (t, e, c) => { const p = pT(t), s = e || eL(); return props(p, [p, s], c); };
ok('YR15a LEVEL 1 PLAN = HALL LEVEL 01 (01 and 1 agree): 4.8', vals(lvl('LEVEL 1 FRAMING PLAN'), 'PR-LEVEL-NAME') === '4.8');
ok('YR15b ROOF when no LEVEL n matches: 9.05', vals(lvl('LEVEL 2 ROOF FRAMING PLAN'), 'PR-LEVEL-NAME') === '9.05');
ok('YR15c two values for one match: refused with both', (r => vals(r, 'PR-LEVEL-NAME') === '' && r.refused.some(q => q.rule === 'PR-LEVEL-NAME' && /9\.05/.test(q.why) && /4/.test(q.why)))(lvl('ROOF FRAMING PLAN', eL([T('MTEXT', 'LV', '+4.00 m', 50000, 3600), T('MTEXT', 'LV', 'RESIDENCES ROOF', 50000, 4100)]))));
ok('YR15f one stray name against the rest: the most-named value, and the row says so', (() => { const p = pT('LEVEL 1 FRAMING PLAN'), e1 = eL(), e2 = eL(), e3 = eL([T('MTEXT', 'LV', 'EL: +0.000 m', 90000, 0), T('MTEXT', 'LV', 'Level 1', 90000, 500)]), r = props(p, [p, e1, e2, e3]); return vals(r, 'PR-LEVEL-NAME') === '4.8' && /also named at 0 \(1x\)/.test(rows(r, 'PR-LEVEL-NAME')[0].why); })());
ok('YR15d no match: none', vals(lvl('FOUNDATION PLAN'), 'PR-LEVEL-NAME') === '');
ok('YR15e set back: off', vals(lvl('LEVEL 1 FRAMING PLAN', null, { 'suggest.level_name': 'off' }), 'PR-LEVEL-NAME') === '');
// §D109 P1 the gate opens: @PLANE says where an elevation stands, so a sheet with one grid line or none still holds its role
const elMarks = (extra) => [{ raw: '@SET=S', handle: '1', x: 0, y: 0 }, { raw: '@VIEW=ELEV', handle: '2', x: 0, y: 0 }, { raw: '@UNITS=mm', handle: '3', x: 0, y: 0 }, { raw: '@GRIDH=A1', handle: '4', x: 5000, y: 0 }].concat(extra);
const need = (r) => r.errors.filter(e => e.code === 'MARK:missing').reduce((a, e) => a.concat(e.keys || []), []).sort().join(',');
const zz = [{ raw: '@Z=0', handle: '5', x: 0, y: 0 }, { raw: '@Z=4.8', handle: '6', x: 0, y: 4800 }], pl = { raw: '@PLANE=A1', handle: '7', x: 0, y: 0 };
ok('YR16a @PLANE, one grid line, two @Z: nothing missing', (m => m === '')(need(MK.describe(elMarks(zz.concat(pl))))), need(MK.describe(elMarks(zz.concat(pl)))));
ok('YR16b the same sheet without @PLANE misses FACE, HAXIS and GRIDH (the old result)', need(MK.describe(elMarks(zz))) === 'FACE,GRIDH(>=2),HAXIS', need(MK.describe(elMarks(zz))));
ok('YR16c @PLANE does not lift the heights: one @Z still misses Z(>=2)', need(MK.describe(elMarks([zz[0], pl]))) === 'Z(>=2)', need(MK.describe(elMarks([zz[0], pl]))));
const alNo = (() => { try { return MK.align({ units: 'mm', gridsX: {}, gridsY: {} }, { units: 'mm', gridsH: {}, zs: [] }, 0.001); } catch (e) { return { thrown: e.message }; } })();
ok('YR17 align with no @HAXIS: MARK:align_fail, not an exception', !alNo.thrown && !alNo.map && alNo.errors.some(e => e.code === 'MARK:align_fail'), JSON.stringify(alNo.thrown || alNo.errors));
// a real judgement over generated sheets: one column on the plan, its heights stated, the elevation stands only by @PLANE
const IM = require(path.join(M, 'dxf2bim_import.js')), BD = require(path.join(M, 'dxf2bodies.js')), ST = require(path.join(M, 'dxf2structure.js'));
const colRect = () => ({ type: 'LWPOLYLINE', layer: 'COL', shape: true, handle: (h++).toString(16), vertices: [{ x: 1000, y: 1000 }, { x: 1400, y: 1000 }, { x: 1400, y: 1550 }, { x: 1000, y: 1550 }] });
const planS = () => ({ name: 'p.dxf', role: 'plan', level: 0, factor: 0.001, sha: 'p', marks: 1, errors: [], dxf: { entities: [colRect()] }, desc: { view: 'PLAN', units: 'mm', level: 0, gridsX: { A1: 0, A2: 9000 }, gridsY: { AA: 0, AB: 9000 }, gridsH: {}, gridsA: {}, zs: [], layers: [{ layer: 'COL', type: 'column' }], bodyz: [{ kind: 'column', z0: 0, z1: 4.8 }], excludes: [], labels: [], tags: [], sizes: [] } });
const elevS = (d) => ({ name: 'e.dxf', role: 'elev', factor: 0.001, sha: 'e', marks: 1, errors: [], face: d.face, dxf: { entities: [] }, desc: Object.assign({ view: 'ELEV', units: 'mm', gridsX: {}, gridsY: {}, gridsH: { A1: 5000 }, gridsA: {}, zs: [{ z: 0, y: 0 }, { z: 4.8, y: 4800 }], layers: [], bodyz: [], excludes: [], labels: [], tags: [], sizes: [] }, d) });
const jd = (e) => ST.judge([planS(), e], { I: IM, B: BD }).gate;
const gP = jd(elevS({ plane: 'A1' })), gOld = jd(elevS({ haxis: '+Y', face: 'minX' }));
const planeOnly = g => g.verdict.advisory.filter(a => a.code === 'GAP:body_elevation_plane_only').length;
console.log('§YR18 plane sheet: ok=' + gP.ok + ' verdict=' + gP.verdict.verdict + ' bodies=' + gP.structure.bodies + ' left_out=' + gP.structure.left_out + ' plane_only=' + planeOnly(gP) + ' refused=' + gP.refused.length + ' | no plane: verdict=' + gOld.verdict.verdict + ' blocking=' + gOld.verdict.blocking.map(b => b.code).join(','));
ok('YR18a an elevation that stands only by @PLANE: 1 body, qualifies, said once, nothing left out', gP.ok && gP.verdict.verdict === 'qualifies' && gP.structure.bodies === 1 && gP.structure.left_out === 0 && planeOnly(gP) === 1);
ok('YR18b the same sheet with no @PLANE still blocks (the old result)', gOld.verdict.verdict === 'blocked' && gOld.verdict.blocking.some(b => b.code === 'GAP:body_elevation_not_aligned') && planeOnly(gOld) === 0);
const badZ = jd(elevS({ plane: 'A1', haxis: '+Y', gridsH: { AA: 0, AB: 9000 }, zs: [{ z: 0, y: 0 }, { z: 4.8, y: 9000 }] }));
ok('YR18c heights that disagree still block, @PLANE or not', badZ.verdict.verdict === 'blocked' && badZ.verdict.blocking.some(b => b.code === 'GAP:body_elevation_not_aligned') && planeOnly(badZ) === 0, badZ.verdict.blocking.map(b => b.message).join(' | '));
const gGate = IM.gate([planS(), elevS({ plane: 'A1' }), elevS({ plane: 'A2' })], { set: 'STD' });
ok('YR18d the standard gate judges a stated face only: no false "two elevations on @FACE=undefined"', !gGate.refused.some(r => /two elevations on @FACE/.test(r.reason)), JSON.stringify(gGate.refused));
const gFace = IM.gate([planS(), elevS({ face: 'minX' }), elevS({ face: 'minX' })], { set: 'STD' });
ok('YR18e two sheets on one stated face are still refused', gFace.refused.some(r => /two elevations on @FACE=minX/.test(r.reason)));
// §D109 P1 PR-LEVEL-FOOTING: a foundation plan states its own level
const ftg = (t, texts, c) => { const p = sheet('p.dxf', [T('MTEXT', 'TB', t, 0, 0)].concat((texts || []).map((x, i) => T('MTEXT', 'SPOT', x, 100 * i, 500))), [mark('VIEW', 'PLAN'), mark('UNITS', 'mm')]); return props(p, [p], c); };
ok('YR19a one T/FOOTING value: the plan is at that level', vals(ftg('FOUNDATION PLAN', ['T/FOOTING: -1.250 m', 'T/FOOTING: -1.250 m']), 'PR-LEVEL-FOOTING') === '-1.25', vals(ftg('FOUNDATION PLAN', ['T/FOOTING: -1.250 m']), 'PR-LEVEL-FOOTING'));
ok('YR19b two values: refused with both', (r => vals(r, 'PR-LEVEL-FOOTING') === '' && r.refused.some(q => q.rule === 'PR-LEVEL-FOOTING' && /-1\.25/.test(q.why) && /-2/.test(q.why)))(ftg('FOUNDATION PLAN', ['T/FOOTING: -1.250 m', 'T/FOOTING: -2.000 m'])));
ok('YR19c no such text: none', vals(ftg('FOUNDATION PLAN', ['T/SLAB: -1.250 m']), 'PR-LEVEL-FOOTING') === '');
ok('YR19d a title that states its level wins', (r => vals(r, 'PR-LEVEL-FOOTING') === '' && vals(r, 'PR-LEVEL-TITLE') === '0.5')(ftg('FOUNDATION PLAN (EL +0.500)', ['T/FOOTING: -1.250 m'])));
ok('YR19e set back: off', vals(ftg('FOUNDATION PLAN', ['T/FOOTING: -1.250 m'], { 'suggest.level_footing': 'off' }), 'PR-LEVEL-FOOTING') === '');
const ftgD = (() => { const p = sheet('p.dxf', [T('MTEXT', 'TB', 'FOUNDATION PLAN', 0, 0), T('MTEXT', 'SPOT', 'T/FOOTING: -1.250 m', 0, 500)], [mark('VIEW', 'PLAN'), mark('UNITS', 'mm')]); return props(withDef('suggest.level_footing,off', p)); })();
ok('YR19f @DEFAULT sets it back', vals(ftgD, 'PR-LEVEL-FOOTING') === '');
// §D109 P2 a footprint in any direction. Generated corners at a known angle; the answers are computed here, not read back.
const rotP = (deg, cx, cy) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return (u, v) => ({ x: cx + u * c - v * s, y: cy + u * s + v * c }); };
const loopL = (layer, pts) => pts.map((p, i) => ({ type: 'LINE', layer, handle: (h++).toString(16), vertices: [p, pts[(i + 1) % pts.length]] }));
const rectAt = (R, u0, v0, u1, v1) => [R(u0, v0), R(u1, v0), R(u1, v1), R(u0, v1)];
const planB = (ents, level, extra) => { const d = planS(); d.level = level === undefined ? 0 : level; d.desc.level = d.level; d.name = 'p' + d.level + '.dxf'; d.dxf = { entities: ents }; d.desc.bodyz = []; return Object.assign(d, { desc: Object.assign(d.desc, extra || {}) }); };
const stdZ = { bodyz: [{ kind: 'column', z0: 0, z1: 4.8 }] }, build = (ps, c) => ST.judge(ps.concat(elevS({ plane: 'A1' })), { I: IM, B: BD, choices: c || {} });
const AT = rotP(16.165, 40000, 30000), R0 = rectAt(AT, -200, -275, 200, 275);
const bLines = build([planB(loopL('COL', R0), 0, stdZ)]).gate.R.els, bPoly = build([planB([{ type: 'LWPOLYLINE', layer: 'COL', shape: true, handle: (h++).toString(16), vertices: R0 }], 0, stdZ)]).gate.R.els;
const volOf = e => Math.abs(require(path.join(M, 'dxf2prep.js')).Solid.vol(e));
const cornersOk = (e, pts) => pts.every(p => e.vertices.some(v => Math.hypot(v[0] - p.x * 0.001, v[1] - p.y * 0.001) < 1e-6));
console.log('§YR20 lines=' + bLines.length + ' poly=' + bPoly.length + ' plan=' + JSON.stringify(bLines[0] && bLines[0].size && bLines[0].size.plan) + ' vol=' + (bLines[0] ? volOf(bLines[0]) : null));
ok('YR20a a 400 x 550 loop at 16.165 deg gives those sizes, not its bounding box', bLines.length === 1 && Math.abs(bLines[0].size.plan.w - 0.55) < 1e-6 && Math.abs(bLines[0].size.plan.d - 0.4) < 1e-6);
ok('YR20b its corners are the drawn corners, within 1 micron', bLines.length === 1 && cornersOk(bLines[0], R0));
ok('YR20c its volume is w x d x h', bLines.length === 1 && Math.abs(volOf(bLines[0]) - 0.4 * 0.55 * 4.8) < 1e-6, bLines[0] && String(volOf(bLines[0])));
ok('YR20d a closed polyline at the same angle gives the same body', bPoly.length === 1 && cornersOk(bPoly[0], R0) && Math.abs(volOf(bPoly[0]) - 0.4 * 0.55 * 4.8) < 1e-6);
const offSq = [{ x: 1000, y: 1000 }, { x: 2000, y: 1000.1 }, { x: 1999.9, y: 1300.1 }, { x: 999.9, y: 1300 }];
ok('YR21a a loop 0.1 mm off square on a sheet axis is read, the snap tolerance unchanged', build([planB(loopL('COL', offSq), 0, stdZ)]).gate.R.els.length === 1);
ok('YR21b set back: skew_tol 0 gives the old result', build([planB(loopL('COL', offSq), 0, stdZ)], { 'loops.skew_tol': 0 }).gate.R.els.length === 0);
const R2 = rotP(2, 0, 0), bent = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, R2(1000, 500), { x: 0, y: 500 }].map(q => q);
ok('YR21c a loop with a corner 2 deg off is not a square: not read', build([planB(loopL('COL', [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1017, y: 500 }, { x: 0, y: 500 }]), 0, stdZ)]).gate.R.els.length === 0);
const Ipl = [rectAt(AT, -214, -8.5, 214, 8.5), rectAt(AT, -244.5, -141.5, -214, 141.5), rectAt(AT, 214, -141.5, 244.5, 141.5)], IV = (428 * 17 + 2 * 30.5 * 283) * 1e-6 * 4.8;
const bI = build([planB([].concat(...Ipl.map(q => loopL('COL', q))), 0, stdZ)]).gate.R.els, bIs = build([planB([].concat(...Ipl.map(q => loopL('COL', q))), 0, stdZ)], { 'bodies.touching_parts': 'separate' }).gate.R.els;
console.log('§YR22 one=' + bI.length + ' vol=' + (bI[0] ? volOf(bI[0]) : null) + ' want=' + IV + ' separate=' + bIs.length);
ok('YR22a an I from 3 touching plates is one body with the volume of the plates', bI.length === 1 && Math.abs(volOf(bI[0]) - IV) < 1e-6 && bI[0].size.plan.parts === 3);
ok('YR22b set back: separate gives 3 bodies', bIs.length === 3);
const far = [rectAt(AT, -200, -275, 200, 275), rectAt(AT, 3000, -275, 3400, 275)];
ok('YR22c two far rectangles stay 2 bodies', build([planB([].concat(...far.map(q => loopL('COL', q))), 0, stdZ)]).gate.R.els.length === 2);
const twoP = [planB(loopL('COL', R0), 0, stdZ), planB(loopL('COL', rectAt(rotP(16.165, 40000.4, 30000), -200, -275, 200, 275)), 4.8, stdZ)];
ok('YR23 one footprint on two plans, under the body tolerance: one body', build(twoP).gate.R.els.length === 1, String(build(twoP).gate.R.els.length));
// P2b heights from the plans
const pz = (lv, withCol) => planB(withCol ? loopL('COL', R0) : [colRect2(lv)], lv), colRect2 = lv => ({ type: 'LINE', layer: 'OTHER', handle: (h++).toString(16), vertices: [{ x: lv, y: 0 }, { x: lv + 1, y: 0 }] });
const zOf = (ps, c) => { const g = build(ps, c).gate; return { els: g.R.els.map(e => [e.z0, e.z1, e.height_source, e.prov]), gaps: g.R.bodies.gaps.filter(q => /body_no_elevation/.test(q.code)).length, used: (g.R.defaults_table || []).filter(q => q.key === 'column.z_from_plans').map(q => q.source) }; };
const z2 = zOf([pz(0, 1), pz(4.8, 1), pz(9.05, 0)]), z1 = zOf([pz(0, 1), pz(4.8, 0), pz(9.05, 0)]), zT = zOf([pz(0, 0), pz(4.8, 0), pz(9.05, 1)]), zOff = zOf([pz(0, 1), pz(4.8, 0)], { 'column.z_from_plans': 'off' }), zOne = zOf([pz(0, 1)]);
console.log('§YR24 ' + JSON.stringify({ z2, z1, zT, zOff, zOne }));
ok('YR24a drawn on 0 and 4.8 of 0, 4.8, 9.05: runs 0 to 9.05, derived', z2.els.length === 1 && z2.els[0][0] === 0 && z2.els[0][1] === 9.05 && z2.els[0][2] === 'plans' && z2.els[0][3] === 'derived');
ok('YR24b drawn on 0 alone: 0 to 4.8', z1.els.length === 1 && z1.els[0][1] === 4.8);
ok('YR24c drawn only on the top plan: nothing states its top, a gap', zT.els.length === 0 && zT.gaps === 1);
ok('YR24d set back: off, the gap', zOff.els.length === 0 && zOff.gaps === 1);
ok('YR24e a one-level set: the gap (the shed path)', zOne.els.length === 0 && zOne.gaps === 1);
const zB = zOf([planB(loopL('COL', R0), 0, stdZ), pz(4.8, 0)]);
ok('YR24f a stated @BODYZ wins', zB.els.length === 1 && zB.els[0][1] === 4.8 && zB.els[0][2] === 'stated');
// the drawing's @DEFAULT sets each one back
const dfl = (key, value) => ({ defaults: [{ key, value, by: 'test' }] });
ok('YR25a @DEFAULT loops.skew_tol,0', build([planB(loopL('COL', R0), 0, Object.assign({}, stdZ, dfl('loops.skew_tol', '0')))]).gate.R.els.length === 0);
ok('YR25b @DEFAULT bodies.touching_parts,separate', build([planB([].concat(...Ipl.map(q => loopL('COL', q))), 0, Object.assign({}, stdZ, dfl('bodies.touching_parts', 'separate')))]).gate.R.els.length === 3);
ok('YR25c @DEFAULT column.z_from_plans,off', build([planB(loopL('COL', R0), 0, dfl('column.z_from_plans', 'off')), pz(4.8, 0)]).gate.R.els.length === 0);
// §D109 P2c footings from the foundation plan: known areas, known thickness labels
const ftP = (ents, c, extra) => { const d = planB(ents, -1.25, Object.assign({ layers: [{ layer: 'FTG', type: 'footing' }] }, extra || {})); return { gate: ST.judge([d, planB([], 4.8), elevS({ plane: 'A1' })], { I: IM, B: BD, choices: c || {} }).gate }; };
const sqAt = (x, y, w, dd) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + dd }, { x, y: y + dd }], tx = (t, x, y) => T('MTEXT', 'NOTE', t, x, y);
const fOf = g => ({ els: g.R.els.filter(e => e.kind === 'footing').map(e => ({ c: e.class, z0: e.z0, z1: e.z1, mark: e.mark, stated: e.size && e.size.thickness })), gaps: g.R.bodies.gaps.filter(q => /footing_no_thickness|body_no_elevation/.test(q.code)).map(q => q.code + ' ' + (q.detail || '')), nested: (g.R.bodies.report.kinds.footing || {}).nested_same || 0 });
const f1 = fOf(ftP(loopL('FTG', sqAt(0, 0, 2500, 2500)).concat(tx('F2', 1000, 1000))).gate);
console.log('§YR26 pad ' + JSON.stringify(f1));
ok('YR26a one F mark inside: a pad, top at the plan level, depth the yellow row, mark kept', f1.els.length === 1 && f1.els[0].c === 'IfcFooting' && f1.els[0].z1 === -1.25 && Math.abs(f1.els[0].z0 + 1.65) < 1e-9 && f1.els[0].mark === 'F2');
const f2 = fOf(ftP(loopL('FTG', sqAt(0, 0, 9000, 9000)).concat(tx('400mm TH', 1000, 1000))).gate);
ok('YR26b a thickness label: a raft, IfcSlab, that thick', f2.els.length === 1 && f2.els[0].c === 'IfcSlab' && Math.abs(f2.els[0].z0 + 1.65) < 1e-9, JSON.stringify(f2));
const f3 = fOf(ftP(loopL('FTG', sqAt(0, 0, 9000, 9000)).concat(tx('RAFT 700mm', 1000, 1000), tx('600mm TH', 2000, 1000), tx('600mm TH', 3000, 1000))).gate);
ok('YR26c the most-named thickness wins and the body states the other', f3.els.length === 1 && Math.abs(f3.els[0].z0 + 1.85) < 1e-9 && /700/.test(JSON.stringify(f3.els[0].stated)), JSON.stringify(f3));
const f4 = fOf(ftP(loopL('FTG', sqAt(0, 0, 9000, 9000)).concat(tx('RAFT 700mm', 1000, 1000), tx('600mm TH', 2000, 1000))).gate);
ok('YR26d a tie: the gap, naming both', f4.els.length === 0 && f4.gaps.some(q => /footing_no_thickness/.test(q) && /700/.test(q) && /600/.test(q)), JSON.stringify(f4));
const f5 = fOf(ftP(loopL('FTG', sqAt(0, 0, 9000, 9000)).concat(tx('400mm TH', 500, 500), loopL('FTG', sqAt(1000, 1000, 2000, 2000)), loopL('FTG', sqAt(4000, 4000, 2000, 2000)), tx('600mm TH', 5000, 5000))).gate);
console.log('§YR26e ' + JSON.stringify(f5));
ok('YR26e inside a 400 raft: no label = same thickness, dropped and counted; labelled 600 stays', f5.els.length === 2 && f5.nested === 1 && f5.els.some(e => Math.abs(e.z0 + 1.85) < 1e-9) && f5.els.some(e => Math.abs(e.z0 + 1.65) < 1e-9));
const f6 = fOf(ftP(loopL('FTG', sqAt(0, 0, 9000, 9000))).gate);
ok('YR26f no label and no raft around it: the gap', f6.els.length === 0 && f6.gaps.some(q => /footing_no_thickness/.test(q)), JSON.stringify(f6));
const pent = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 2000, y: 4500 }, { x: 0, y: 3000 }], f7g = ftP(loopL('FTG', pent).concat(tx('400mm TH', 1000, 1000))).gate, f7v = f7g.R.els.filter(e => e.kind === 'footing').map(volOf);
ok('YR26g a true 5-sided loop keeps its outline: volume = its area x thickness', f7v.length === 1 && Math.abs(f7v[0] - (4 * 3 + 0.5 * 4 * 1.5) * 0.4) < 1e-6, String(f7v));
const f8 = fOf(ftP(loopL('FTG', sqAt(0, 0, 2500, 2500)).concat(tx('F2', 1000, 1000)), { 'footing.z_from_plan': 'off' }).gate);
ok('YR26h set back: off, the earlier gap', f8.els.length === 0 && f8.gaps.some(q => /body_no_elevation/.test(q)), JSON.stringify(f8));
// every rule key is a registry row with the earlier behaviour on offer
const BACK = { 'suggest.grid_ticks': 'always', 'suggest.grid_label': 'letters_or_digits', 'suggest.grid_reach': 0.7, 'suggest.grid_along': 0.06, 'suggest.grid_layer': 'a_grid_only', 'suggest.level_text': 'level_layer_only', 'suggest.title_text': 'text_only', 'suggest.sheet_refs': 'off', 'suggest.grid_rotated': 'off', 'suggest.elev_no_grid': 'lie_flat', 'suggest.level_name': 'off', 'suggest.level_footing': 'off', 'loops.skew_tol': 0, 'bodies.touching_parts': 'separate', 'column.z_from_plans': 'off', 'footing.z_from_plan': 'off', 'panel.plane': 'end grid line, centred' };
ok('YR10 every rule is a registry row offering the earlier behaviour', Object.keys(BACK).every(k => REG[k] && (REG[k].options || []).includes(BACK[k]) && REG[k].value !== BACK[k]));
console.log('§W-YELLOW-RULES PASS=' + passes + ' FAIL=' + fails + ' of ' + (passes + fails));
process.exit(fails ? 1 : 0);
