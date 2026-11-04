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
// every rule key is a registry row with the earlier behaviour on offer
const BACK = { 'suggest.grid_ticks': 'always', 'suggest.grid_label': 'letters_or_digits', 'suggest.grid_reach': 0.7, 'suggest.grid_along': 0.06, 'suggest.grid_layer': 'a_grid_only', 'suggest.level_text': 'level_layer_only', 'suggest.title_text': 'text_only', 'suggest.sheet_refs': 'off', 'suggest.grid_rotated': 'off', 'suggest.elev_no_grid': 'lie_flat', 'suggest.level_name': 'off', 'panel.plane': 'end grid line, centred' };
ok('YR10 every rule is a registry row offering the earlier behaviour', Object.keys(BACK).every(k => REG[k] && (REG[k].options || []).includes(BACK[k]) && REG[k].value !== BACK[k]));
console.log('§W-YELLOW-RULES PASS=' + passes + ' FAIL=' + fails + ' of ' + (passes + fails));
process.exit(fails ? 1 : 0);
