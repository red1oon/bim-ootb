#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-IMPACT: prompts/DXF2BIM_ARCHITECT_REVIEW.md §D99 P2 SPEC. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the defaults list showed the used settings as equals while two carry almost all the assumed value and most move nothing; a person
 * hunts through equals. The ranking must come from MEASURING each option through the real pipeline, never from a hand list.
 *   I1 RANK      — on the shed (--complete, pwd2024_bd) the top two are synth.slab.thickness and section.spacing, with the deltas the pipeline gives for them (re-run here
 *                  independently: run() with that one --choice vs without).
 *   I2 INERT     — the settings whose every option moves neither bill, own weight nor bodies are exactly the inert set; each inert row's tries are all 0.
 *   I3 ONE OWNER — the CLI's §IMPACT lines are the module's own tries (one line per try, the same numbers).
 *   I4 FALSIFIER — synth.roof.overhang (wired into dxf2synth) is NOT inert; a stated-by-the-drawing setting is skipped, never ranked.
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> §SKIP.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2bim_cli.js'));
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
if (!fs.existsSync(MK)) { console.log('§SKIP W-IMPACT no marked shed set at ' + MK); process.exit(0); }
const files = fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f));
const args = extra => C.parseArgs(['--sheets', ...files, '--out', path.join(os.tmpdir(), 'w_impact_' + process.pid), '--pack', 'pwd2024_bd', '--complete', ...extra]);
const lines = [], I = C.impact(args([]), l => lines.push(l));
lines.filter(l => /§IMPACT_RANK/.test(l)).forEach(l => console.log('  ' + l));
const total = extra => { const r = C.run(args(extra), () => {}); return { t: r.bill.totals.amount, n: r.out.gate.R.els.length }; }, b = total([]);
// I1
const top2 = I.active.slice(0, 2).map(r => r.key), d = k => { const r = I.rows.find(x => x.key === k); return r.top; };
const s = total(['--choice', 'synth.slab.thickness=' + d('synth.slab.thickness').option]), p = total(['--choice', 'section.spacing=' + d('section.spacing').option]);
ok('I1 RANK top two = ' + top2.join(', ') + '; their deltas = an independent run with that one choice (' + d('synth.slab.thickness').dBill.toFixed(2) + ' / ' + d('section.spacing').dBill.toFixed(2) + ' BDT)',
  top2[0] === 'synth.slab.thickness' && top2[1] === 'section.spacing' && Math.abs((s.t - b.t) - d('synth.slab.thickness').dBill) < 1e-6 && Math.abs((p.t - b.t) - d('section.spacing').dBill) < 1e-6 && (p.n - b.n) === d('section.spacing').dBodies,
  'independent ' + (s.t - b.t).toFixed(2) + ' / ' + (p.t - b.t).toFixed(2) + ' bodies ' + (p.n - b.n));
// I2
const inert = I.inert.map(r => r.key).sort();
ok('I2 INERT ' + inert.length + ' settings move nothing (' + inert.join(', ') + '): every try 0 on bill, weight, bodies; every active row moves at least one',
  inert.length > 0 && I.inert.every(r => r.tries.every(t => Math.abs(t.dBill) < 1e-6 && Math.abs(t.dKN) < 1e-6 && t.dBodies === 0)) && I.active.every(r => r.tries.some(t => Math.abs(t.dBill) >= 1e-6 || Math.abs(t.dKN) >= 1e-6 || t.dBodies !== 0)),
  'active=' + I.active.map(r => r.key + ':' + r.top.dBill.toFixed(0) + '/' + r.top.dKN.toFixed(2) + 'kN').join(','));
// I3
const L = lines.filter(l => /^§IMPACT key=/.test(l)), tries = I.rows.reduce((n, r) => n + r.tries.length, 0);
const same = I.rows.every(r => r.tries.every(t => L.some(l => l.indexOf('key=' + r.key + ' ') > 0 && l.indexOf('option=' + t.option + ' dBill=' + t.dBill.toFixed(2) + ' ') > 0)));
ok('I3 ONE OWNER the §IMPACT lines (' + L.length + ') = the module\'s tries (' + tries + '), same numbers', L.length === tries && same, '');
// I4
const ov = I.rows.find(r => r.key === 'synth.roof.overhang');
ok('I4 FALSIFIER synth.roof.overhang is active (' + (ov && ov.top.dBill.toFixed(2)) + ' BDT at ' + (ov && ov.top.option) + '); skipped ' + I.skipped.length + ' (' + I.skipped.map(x => x.key + ': ' + x.why).join('; ') + ')',
  ov && !ov.inert && I.skipped.every(x => !I.rows.some(r => r.key === x.key)), '');
console.log(fail ? '§VERDICT FAIL W-IMPACT judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-IMPACT judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0);
