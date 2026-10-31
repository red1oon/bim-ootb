#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-BILL-MIX: prompts/DXF2BIM_ARCHITECT_REVIEW.md §D99 P4 BUILD SPEC. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the shed's DETAILS sheet states "Footing, Column, Grade Beam Casting Ratio = 1:1.5:3" and the notes reader puts it on the bodies,
 * but the bill priced every concrete body at the 1:2:4 rows. A drawing's stated mix must choose the SoR row, and a mix the pack has no row for must never be priced as another.
 *   M1 ROWS      — shed (--complete, pwd2024_bd): every footing line at 07.3.1, every column at 07.3.2 (1:1.5:3 stated), the slab at 07.2.3 (1:2:4 stated), every beam at the
 *                  pack's first row 07.2.3 with mix null and "not stated" (the note names grade beams; the shed's beams are not).
 *   M2 DELTA     — with vs without the stated mix: exactly the 128 lines stating 1:1.5:3 change, each keeps its quantity (amount / rate) and only its rate moves, and the total moves by their sum.
 *   M3 FALSIFIER — a footing stating 1:3:6 (no row in the pack) -> amount 0 + flag no_rate_for_mix:1:3:6, never the 1:2:4 rate.
 *   M4 NO MIXES  — a pack whose rows state no mix (cidb2024_my) prices the same bodies identically with and without the stated mix.
 *   M5 SOURCES   — every 1:1.5:3 row of the pack names its SoR item, page and "checked against the page image".
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> §SKIP.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2bim_cli.js')), BL = require(path.join(M, 'dxf2bill.js')), RG = require(path.join(M, 'reg_report.js')), LS = require(path.join(M, 'load_summary.js'));
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
if (!fs.existsSync(MK)) { console.log('§SKIP W-BILL-MIX no marked shed set at ' + MK); process.exit(0); }
const files = fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f));
const res = C.run(C.parseArgs(['--sheets', ...files, '--out', path.join(os.tmpdir(), 'w_bill_mix_' + process.pid), '--pack', 'pwd2024_bd', '--complete']), () => {});
const R = res.out.gate.R, ref = JSON.parse(fs.readFileSync(path.join(M, 'synthetic_ref.json'), 'utf8')), pack = name => JSON.parse(fs.readFileSync(path.join(M, '..', 'viewer', 'rates', name + '.json'), 'utf8'));
const run = (els, name) => RG.billAndLoad(els, R.defaults_table, { LS, BL, ref, pack: pack(name), packName: name }).bill;
const strip = els => els.map(e => { if (!(e.ifc && e.ifc.props && e.ifc.props.Note_CastingRatio)) return e; const p = Object.assign({}, e.ifc.props); delete p.Note_CastingRatio; return Object.assign({}, e, { ifc: Object.assign({}, e.ifc, { props: p }) }); });
const A = run(R.els, 'pwd2024_bd'), B0 = run(strip(R.els), 'pwd2024_bd');
const of = (b, cls) => b.lines.filter(l => l.class === cls && /concrete/i.test(l.material || '') && l.unit === 'M3');   // the concrete line (each RC body also has its Grade 400 rebar line, 08.1.2)
const items = ls => [...new Set(ls.map(l => (l.rate_source || {}).item + '@' + l.rate + '/' + (l.mix === undefined ? '-' : l.mix)))].join(',');
console.log('§BILL_MIX total=' + A.totals.amount.toFixed(2) + ' without_mix=' + B0.totals.amount.toFixed(2) + ' footing=' + items(of(A, 'IfcFooting')) + ' column=' + items(of(A, 'IfcColumn')) + ' slab=' + items(of(A, 'IfcSlab')) + ' beam=' + items(of(A, 'IfcBeam')));
// M1
const F = of(A, 'IfcFooting'), Co = of(A, 'IfcColumn'), Sl = of(A, 'IfcSlab'), Be = of(A, 'IfcBeam'), it = (l, i) => (l.rate_source || {}).item === i;
ok('M1 ROWS footings ' + F.length + ' at 07.3.1, columns ' + Co.length + ' at 07.3.2, slab ' + Sl.length + ' at 07.2.3 (1:2:4), beams ' + Be.length + ' at 07.2.3 mix not stated',
  F.length === 32 && F.every(l => it(l, '07.3.1') && l.mix === '1:1.5:3') && Co.length === 96 && Co.every(l => it(l, '07.3.2') && l.mix === '1:1.5:3') && Sl.length === 1 && Sl.every(l => it(l, '07.2.3') && l.mix === '1:2:4') &&
  Be.length === 35 && Be.every(l => it(l, '07.2.3') && l.mix === null && /not stated/.test(l.mix_note || '')), 'footing=' + items(F) + ' column=' + items(Co) + ' slab=' + items(Sl) + ' beam=' + items(Be));
// M2
const ch = A.lines.filter(l => { const o = B0.lines.find(q => q.id === l.id && q.unit === l.unit && q.formula === l.formula); return o && o.rate !== l.rate; });
const pairs = ch.map(l => [l, B0.lines.find(q => q.id === l.id && q.unit === l.unit && q.formula === l.formula)]), sameQ = pairs.every(([l, o]) => Math.abs(l.amount / l.rate - o.amount / o.rate) < 1e-6 * Math.max(1, o.amount / o.rate));
const want = pairs.reduce((d, [l, o]) => d + (l.amount - o.amount), 0), got = A.totals.amount - B0.totals.amount, kinds = [...new Set(ch.map(l => l.class + '/' + l.mix))].join(',');
ok('M2 DELTA the stated mix changes ' + ch.length + ' lines (' + kinds + '), each the same quantity at the new rate; the total moves by ' + got.toFixed(2) + ' BDT = their sum', ch.length === 128 && ch.every(l => l.mix === '1:1.5:3') && sameQ && Math.abs(got - want) < 1e-6 && got > 0, 'sum=' + want.toFixed(2) + ' diff=' + (got - want).toExponential(2));
// M3
const f0 = R.els.find(e => e.class === 'IfcFooting'), bad = Object.assign({}, f0, { ifc: Object.assign({}, f0.ifc, { props: Object.assign({}, f0.ifc.props, { Note_CastingRatio: '1:3:6' }) }) }), L3 = run([bad], 'pwd2024_bd').lines[0];
ok('M3 FALSIFIER a footing stating 1:3:6: amount ' + L3.amount + ', flags ' + JSON.stringify(L3.flags) + ' (never the 1:2:4 rate)', L3.amount === 0 && L3.flags.includes('no_rate_for_mix:1:3:6') && L3.rate !== 13504, '');
// M4
const P1 = run(R.els, 'cidb2024_my'), P0 = run(strip(R.els), 'cidb2024_my');
ok('M4 NO MIXES cidb2024_my: the same total with and without the stated mix (' + P1.totals.amount.toFixed(2) + ')', Math.abs(P1.totals.amount - P0.totals.amount) < 1e-9, '');
// M5
const rows = Object.values(pack('pwd2024_bd').material_rates).flat().filter(r => r.mix === '1:1.5:3');
ok('M5 SOURCES ' + rows.length + ' rows at 1:1.5:3, each with item, page and the page-image check', rows.length === 4 && rows.every(r => /^07\.3\.\d$/.test(r.source.item) && /^13[67]$/.test(r.source.page) && /page image/.test(r.source.read)), rows.map(r => r.source.item + ' p' + r.source.page + ' ' + r.rate).join(', '));
console.log(fail ? '§VERDICT FAIL W-BILL-MIX judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-BILL-MIX judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0);
