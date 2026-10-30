#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-REG-REPORT: prompts/DXF2BIM_ARCHITECT_REVIEW.md RR.5 (the Regulatory Report). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a report attached to a submission must state the model's facts exactly as their owners computed them, say plainly what
 * was not judged or not stated, and never read as a certificate. A composer that recomputes, rounds differently, or hides an empty check would mislead an authority.
 *   G1 BILL      — the page's bill total = Dxf2Bill's totals.amount (the CLI's own bill), same rounding.
 *   G2 LOAD      — the page's own weight = LoadSummary.compute total_kN; footings count + heaviest footing = its footings.
 *   G3 RULES     — the page's "Rules N: k ran" = the §RULE_COVERAGE lines the rule engines printed (state=ran count / total); each rule row's result word matches its line.
 *   G4 AREA      — floor area = Σ Dxf2Bill.measures(slab).A over the IfcSlab bodies (witness recompute).
 *   G5 NO-SLAB   — the same set WITHOUT --complete: "no floor slab modelled: floor area not measured", areas verdict INCONCLUSIVE (never a number from nowhere).
 *   G6 FACTS     — no fact given: every fact row reads "not stated", foundations NOT STATED; --fact soil_kPa=150 -> the stated value + its ratio, verdict PASS/FINDINGS.
 *   G7 SELF-CONTAINED + WORDS — no external src/href/link/script; the word "compliant" never appears; the not-a-certificate line does.
 *   G8 FALSIFIER — compose() with the bill total changed by +1000 prints the changed total (the page reads its input, it does not carry a number of its own).
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> INCONCLUSIVE (exit 2).
 * Usage: NODE_PATH=<dir with web-ifc, sql.js> node modeller/tests/witness_reg_report.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2bim_cli.js')), RG = require(path.join(M, 'reg_report.js')), BL = require(path.join(M, 'dxf2bill.js'));
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const text = h => h.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const fmt = (v, dp) => Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
async function report(extra, tag) {
  if (!fs.existsSync(MK)) { console.log('§VERDICT INCONCLUSIVE no marked shed set at ' + MK); process.exit(2); }
  const out = path.join(os.tmpdir(), 'w_reg_report_' + process.pid + '_' + tag);
  const args = C.parseArgs(['--sheets', ...fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f)), '--out', out, '--pack', 'pwd2024_bd', '--report', ...extra]);
  const res = C.run(args); C.write(res, out); await C.writeIfc(res, out);
  const lines = [], orig = console.log; console.log = s => lines.push(String(s));
  let rr; try { rr = await C.writeReport(res, out, args); } finally { console.log = orig; }
  lines.filter(l => /§REG_REPORT/.test(l)).forEach(l => console.log('  ' + l));
  return { res, rr, lines, t: text(rr.html) };
}
(async () => {
  const A = await report(['--complete'], 'a'), t = A.t, res = A.res;
  // G1
  const bt = fmt(res.bill.totals.amount, 0) + ' ' + res.bill.currency;
  ok('G1 BILL page total = the bill\'s totals.amount (' + bt + ')', t.includes('Total ' + bt), (t.match(/Total [\d,]+ BDT/) || ['none'])[0]);
  // G2
  const L = res.loadSummary, heavy = L.footings.reduce((m, f) => Math.max(m, f.kN), 0);
  ok('G2 LOAD own weight = LoadSummary total ' + fmt(L.total_kN, 1) + ' kN, ' + L.footings.length + ' footings, heaviest ' + fmt(heavy, 1) + ' kN', t.includes('Own weight weighed ' + fmt(L.total_kN, 1) + ' kN') && t.includes('Footings ' + L.footings.length) && t.includes('Heaviest footing ' + fmt(heavy, 1) + ' kN'),
    (t.match(/Own weight weighed [^(]+/) || [''])[0]);
  // G3
  const cov = A.lines.filter(l => /^§RULE_COVERAGE kind=\w+ rule=/.test(l)), ran = cov.filter(l => /state=ran/.test(l)), m3 = /Rules (\d+): (\d+) ran/.exec(t);
  const rowOk = cov.every(l => { const r = /rule=(\S+) state=(\S+) judged=(\d+) findings=(\d+)/.exec(l); if (!r) return false; const want = r[2] === 'ran' ? (+r[4] ? 'FINDINGS ' + r[4] : 'PASS') : r[2] === 'nothing_to_judge' ? 'INCONCLUSIVE' : ''; return t.includes(r[1] + ' ' + want); });
  ok('G3 RULES page "Rules N: k ran" = the engines\' §RULE_COVERAGE lines (' + ran.length + ' of ' + cov.length + ') and every rule row carries its own result word', !!m3 && +m3[1] === cov.length && +m3[2] === ran.length && rowOk, m3 ? m3[0] : 'no rules line');
  // G4
  const slabs = res.out.gate.R.els.filter(b => b.class === 'IfcSlab'), area = slabs.reduce((a, b) => a + BL.measures(b).A, 0);
  ok('G4 AREA floor area = Σ slab plan area (' + slabs.length + ' slab, ' + fmt(area, 2) + ' m2)', slabs.length > 0 && t.includes('Total floor area (slabs) ' + fmt(area, 2) + ' m2'), (t.match(/Total floor area \(slabs\) [^ ]+ m2/) || ['none'])[0]);
  // G5
  const N = await report([], 'b');
  ok('G5 NO-SLAB without --complete: "floor area not measured", areas INCONCLUSIVE', N.rr.verdicts.areas === 'INCONCLUSIVE' && N.t.includes('no floor slab modelled: floor area not measured') && N.t.includes('Total floor area (slabs) not measured'), 'areas=' + N.rr.verdicts.areas);
  // G6
  const nf = (t.match(/not stated/g) || []).length, S = await report(['--complete', '--fact', 'soil_kPa=150'], 'c');
  const maxP = L.footings.reduce((m, f) => Math.max(m, f.area > 0 ? f.kN / f.area : 0), 0), want = maxP > 150 ? 'FINDINGS 1' : 'PASS';
  ok('G6 FACTS none given: foundations NOT STATED, ' + nf + ' "not stated"; soil 150 kPa stated: ratio ' + fmt(maxP / 150, 2) + ', verdict ' + want, A.rr.verdicts.foundations === 'NOT STATED' && t.includes('Soil bearing capacity (kPa, from a soil report) not stated') &&
    S.rr.verdicts.foundations === want && S.t.includes('150.0 kPa (stated); highest pressure / capacity = ' + fmt(maxP / 150, 2)), 'stated run foundations=' + S.rr.verdicts.foundations);
  // G7
  const h = A.rr.html, ext = /<(script|link|img|iframe)\b[^>]*(src|href)=|(src|href)="https?:/i.test(h);
  ok('G7 SELF-CONTAINED no external src/href; never "compliant"; states it is not a compliance certificate', !ext && !/\bcompliant\b/i.test(h) && /not a compliance certificate/.test(h), 'external=' + ext);
  // G8
  const inp2 = { identity: { set: 'X' }, bill: JSON.parse(JSON.stringify(res.bill)), bodies: [], storeys: [] }; inp2.bill.totals.amount += 1000;
  const p2 = text(RG.compose(inp2).html), bt2 = fmt(res.bill.totals.amount + 1000, 0) + ' ' + res.bill.currency;
  ok('G8 FALSIFIER the bill total +1000 in the input -> the page prints ' + bt2, p2.includes('Total ' + bt2) && !p2.includes('Total ' + bt), '');
  console.log(fail ? '§VERDICT FAIL W-REG-REPORT fail=' + fail : '§VERDICT PASS W-REG-REPORT judged=8 fail=0'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1); });
