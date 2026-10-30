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
const bad = []; Object.keys(mr).forEach(c => mr[c].forEach(r => { const s = r.source || {}; if (!(r.rate > 0) || !['M3', 'M2', 'M', 'EA'].includes(r.unit) || !s.item || !s.page || !s.column || !s.doc) bad.push(c + '/' + r.material); }));
ok('M4 SOURCED every shipped material row has rate > 0, a unit, and source doc + item + page + column (' + Object.keys(mr).length + ' classes)', bad.length === 0, bad.join(','));
const noPack = Object.assign({}, pack, { material_rates: undefined }), colOld = BL.bill([body('c', 'IfcColumn', box(0, 0, 0, 0.3, 0.3, 3))], { ref, pack: noPack }).lines[0];
const other = Object.assign({}, pack, { material_rates: { IfcColumn: [{ material: 'Structural steel', rate: 1, unit: 'M3' }] } }), colOther = BL.bill([body('c', 'IfcColumn', box(0, 0, 0, 0.3, 0.3, 3))], { ref, pack: other }).lines[0];
ok('M5 CONTROL without material_rates the column is the class-rate line (unit M, rate ' + colOld.rate + '); a row for another material does not match', colOld.unit === 'M' && colOld.rate === pack.materials.IfcColumn.rate && JSON.stringify(colOther) === JSON.stringify(colOld) && colOld.amount !== col.amount, 'old amount=' + colOld.amount + ' new=' + col.amount);
console.log(fail ? 'FAIL ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
