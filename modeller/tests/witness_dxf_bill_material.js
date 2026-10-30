#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-BILL-MATERIAL: prompts/DXF2BIM_ARCHITECT_REVIEW.md "T14 material rates". Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the bill priced the shed's reinforced-concrete columns and beams at the pack's STEEL class rate per metre
 * (IfcColumn "Structural Steel Column" 16,000 BDT/M) and its brick walls as blockwork, because rates were keyed by IFC class alone.
 *   M1 COLUMN  — a Reinforced concrete column prices at the PWD SoR 2022 item 07.2.2 per m3 of the mesh volume, not the steel per-metre class rate.
 *   M2 BEAM/FOOTING/SLAB/WALL — each uses its own extracted row (07.2.3, 07.2.1, 07.2.3, 04.2), quantity = V of the mesh.
 *   M3 NO-GUESS — a material with no row (Concrete blockwork wall) keeps the class rate exactly as before (no invented concrete/brick rate).
 *   M4 SOURCED — every shipped material row has rate > 0, a known unit, and a source with item + page + column.
 *   M5 CONTROL — a pack without material_rates bills byte-identically to the class-rate path; a row for another material does not match.
 *   M6 STEEL   — T14b: an angle member weighed by load_summary.js (kN) prices at SoR 10.6 per kg = kN*1000/9.80665; an unweighed member is flagged no_input:kN and costs 0.
 *   M7 ROOF    — Profiled metal roofing at SoR 10.21 per sqm of the sheet's face A.
 *   M8 REBAR   — an RC body brings a reinforcement line (08.1.2 per kg = V x p/100 x 77.0 x 1000/9.80665), 'assumed' while p is the default, 'derived' when stated.
 *   M9 NOT-PRICED — the bill lists shuttering as excluded for the RC lines and the §BILL log names it.
 *   M10 CONTROL — no values given: the rebar line is flagged no_input (never priced at a guessed percent).
 * Falsify: make materialRate() return null -> M1 + M2 RED.
 */
'use strict';
const BL = require('../dxf2bill.js'), ref = require('../synthetic_ref.json'), pack = require('../../viewer/rates/pwd2024_bd.json');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const box = (x0, y0, z0, x1, y1, z1) => { const V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  return { vertices: V, faces: [[4, 5, 6], [4, 6, 7], [0, 2, 1], [0, 3, 2], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]] }; };
const body = (id, cls, m, label) => Object.assign({ guid: id, class: cls, kind: cls, prov: 'drawn', ifc: label ? { type_name: label } : null }, m);
const mr = pack.material_rates, near = (a, b) => Math.abs(a - b) < 1e-3;
const col = BL.bill([body('c', 'IfcColumn', box(0, 0, 0, 0.3, 0.3, 3))], { ref, pack }).lines[0];
ok('M1 a 0.3 x 0.3 x 3 m RC column: quantity 0.27 M3, rate 13863 (07.2.2), amount 3743.01, basis material; the steel class rate (' + pack.materials.IfcColumn.rate + '/' + pack.materials.IfcColumn.unit + ') is NOT used',
  col.unit === 'M3' && near(col.quantity, 0.27) && col.rate === 13863 && near(col.amount, 3743.01) && col.rate_basis === 'material' && col.rate_source.item === '07.2.2' && col.flags.length === 0, JSON.stringify(col).slice(0, 380));
const rows = [['IfcBeam', box(0, 0, 0, 5, 0.3, 0.5), null, 0.75, 13648, '07.2.3'], ['IfcFooting', box(0, 0, 0, 1.5, 1.5, 0.5), null, 1.125, 13504, '07.2.1'],
  ['IfcSlab', box(0, 0, 0, 4, 5, 0.15), null, 3, 13648, '07.2.3'], ['IfcWall', box(0, 0, 0, 3, 0.254, 2), '10" Brick Wall', 1.524, 8174, '04.2']];
rows.forEach(([c, m, lab, v, r, it]) => { const l = BL.bill([body('x', c, m, lab)], { ref, pack }).lines[0];
  ok('M2 ' + c + ' (' + l.material + '): V ' + v + ' m3 x ' + r + ' (item ' + it + ')', l.unit === 'M3' && near(l.quantity, v) && l.rate === r && near(l.amount, v * r) && l.rate_source && l.rate_source.item === it && l.flags.length === 0, 'qty=' + l.quantity + ' amount=' + l.amount); });
const blk = BL.bill([body('b', 'IfcWall', box(0, 0, 0, 3, 0.15, 2), '6" Block Wall')], { ref, pack }).lines[0], blkOld = BL.bill([body('b', 'IfcWall', box(0, 0, 0, 3, 0.15, 2), '6" Block Wall')], { ref, pack: Object.assign({}, pack, { material_rates: undefined }) }).lines[0];
ok('M3 NO-GUESS a Concrete blockwork wall has no material row: priced at the class rate, same line as without material_rates', blk.material === 'Concrete blockwork' && blk.rate_basis === undefined && JSON.stringify(blk) === JSON.stringify(blkOld), 'rate=' + blk.rate + ' ' + blk.unit);
const bad = []; [].concat(...Object.keys(mr).map(c => mr[c].map(r => [c, r])), ...Object.keys(pack.material_adds || {}).map(m => pack.material_adds[m].map(r => [m, r]))).forEach(([c, r]) => { const s = r.source || {}; if (!(r.rate > 0) || !['M3', 'M2', 'M', 'EA', 'KG'].includes(r.unit) || !s.item || !s.page || !s.column || !s.doc) bad.push(c + '/' + (r.material || r.what)); });
ok('M4 SOURCED every shipped material row has rate > 0, a unit, and source doc + item + page + column (' + Object.keys(mr).length + ' classes + ' + Object.keys(pack.material_adds || {}).length + ' material adds)', bad.length === 0, bad.join(','));
const noPack = Object.assign({}, pack, { material_rates: undefined }), colOld = BL.bill([body('c', 'IfcColumn', box(0, 0, 0, 0.3, 0.3, 3))], { ref, pack: noPack }).lines[0];
const other = Object.assign({}, pack, { material_rates: { IfcColumn: [{ material: 'Structural steel', rate: 1, unit: 'M3' }] } }), colOther = BL.bill([body('c', 'IfcColumn', box(0, 0, 0, 0.3, 0.3, 3))], { ref, pack: other }).lines[0];
ok('M5 CONTROL without material_rates the column is the class-rate line (unit M, rate ' + colOld.rate + '); a row for another material does not match', colOld.unit === 'M' && colOld.rate === pack.materials.IfcColumn.rate && JSON.stringify(colOther) === JSON.stringify(colOld) && colOld.amount !== col.amount, 'old amount=' + colOld.amount + ' new=' + col.amount);
// ── T14b ──
const LS = require('../load_summary.js'), DEF = require('../element_defaults.json').defaults || require('../element_defaults.json');
const val = k => (DEF[k] && DEF[k].value), values = { 'load.rc_steel_percent': val('load.rc_steel_percent'), 'load.unit_weight.steel': val('load.unit_weight.steel'), 'load.unit_weight.concrete': val('load.unit_weight.concrete'), 'load.unit_weight.brick': val('load.unit_weight.brick'), 'load.roof_sheet': val('load.roof_sheet') };
const ang = Object.assign(body('m', 'IfcMember', box(0, 0, 0, 6, 0.05, 0.05), '2"x2"x1/4" Angle'), {});
const lsr = LS.compute([ang], { values, sources: {} }).rows[0];
const mem = BL.bill([ang], { ref, pack, weights: lsr.kN != null ? { m: lsr.kN } : {}, values }).lines[0], kg = lsr.kN * 1000 / 9.80665;
ok('M6 STEEL an angle member (label 2"x2"x1/4" Angle, 6 m) weighed by load_summary (' + (lsr.kN != null ? lsr.kN.toFixed(4) + ' kN' : lsr.missing) + '): ' + kg.toFixed(3) + ' kg x 129 (10.6)',
  lsr.kN > 0 && mem.unit === 'KG' && near(mem.quantity, kg) && mem.rate === 129 && near(mem.amount, kg * 129) && mem.rate_source.item === '10.6' && mem.flags.length === 0, JSON.stringify({ q: mem.quantity, a: mem.amount, f: mem.formula }));
const memNo = BL.bill([body('n', 'IfcMember', box(0, 0, 0, 6, 0.05, 0.05))], { ref, pack, weights: {}, values }).lines[0];
ok('M6b CONTROL a member load_summary could not weigh (no section on its label) is flagged no_input:kN and costs 0', memNo.amount === 0 && memNo.flags.includes('no_input:kN'), JSON.stringify(memNo.flags));
const rf = BL.bill([body('r', 'IfcRoof', box(0, 0, 0, 10, 6, 0.0254))], { ref, pack, values }).lines[0];
ok('M7 ROOF a 10 x 6 m sheet: A 60 m2 x 578 (10.21)', rf.unit === 'M2' && near(rf.quantity, 60) && rf.rate === 578 && near(rf.amount, 34680) && rf.rate_source.item === '10.21', 'q=' + rf.quantity + ' a=' + rf.amount);
const p = values['load.rc_steel_percent'], uw = values['load.unit_weight.steel'], rb = BL.bill([body('c', 'IfcColumn', box(0, 0, 0, 0.3, 0.3, 3))], { ref, pack, values, sources: {} });
const rl = rb.lines.find(l => l.kind === 'add'), rkg = 0.27 * p / 100 * uw * 1000 / 9.80665;
ok('M8 REBAR the 0.27 m3 RC column brings a reinforcement line: ' + rkg.toFixed(3) + ' kg (p ' + p + '%, steel ' + uw + ' kN/m3) x 100 (08.1.2), assumed (p is the default)',
  rb.lines.length === 2 && rl && rl.add === 'reinforcement' && near(rl.quantity, rkg) && rl.rate === 100 && near(rl.amount, rkg * 100) && rl.prov === 'assumed' && rl.rate_source.item === '08.1.2' && near(rb.totals.amount, rb.lines[0].amount + rl.amount) && near(rb.totals.by_prov.assumed, rl.amount), JSON.stringify({ q: rl && rl.quantity, prov: rl && rl.prov, inputs: rl && rl.inputs }));
const rs = BL.bill([body('c', 'IfcColumn', box(0, 0, 0, 0.3, 0.3, 3))], { ref, pack, values, sources: { 'load.rc_steel_percent': 'choice', 'load.unit_weight.steel': 'file' } }).lines.find(l => l.kind === 'add');
ok('M8b the same line is derived once the percent and the steel weight were stated (choice / file)', rs.prov === 'derived', rs.prov);
ok('M9 NOT-PRICED shuttering is listed as excluded for the RC line and named in the log', rb.excluded.length === 1 && /shuttering/.test(rb.excluded[0].what) && rb.excluded[0].lines === 1 && /NOT_PRICED=Reinforced concrete:shuttering/.test(rb.log), rb.log);
const r0 = BL.bill([body('c', 'IfcColumn', box(0, 0, 0, 0.3, 0.3, 3))], { ref, pack }).lines.find(l => l.kind === 'add');
ok('M10 CONTROL no defaults given: the reinforcement line is flagged no_input and costs 0 (no guessed percent)', r0.amount === 0 && r0.flags.some(f => /^no_input:load_/.test(f)), JSON.stringify(r0.flags));
console.log(fail ? 'FAIL ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
