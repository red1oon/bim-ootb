#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-COL-TO-BEAM: prompts/DXF2BIM_ARCHITECT_REVIEW.md §D100 (b). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES (owner 2026-10-31: "Wouldn't this default as standardized for such building model? Thus requiring precision from me."): the shed's columns on
 * lines 36–41 are drawn 1.52 m tall under beams at 3.10 m; the standard reading is that a column under a beam end carries it, so it must default to the beam's underside (yellow, one
 * setting for the whole model, changeable) — never asking the user to state each column, never silently.
 *   K1 DEFAULT   — the shed (--complete): exactly the columns under a beam they stop short of are raised (12, lines 36–41 × both long walls) to the beam's underside; load_path 0;
 *                  column.top_under_beam is a USED row (kind guess) in the defaults table; each raised column is derived with SizeBasis top:default.
 *   K2 AS DRAWN  — --choice column.top_under_beam=as_drawn: nothing raised, load_path flags the 10 beams again, the bill = the run without this setting (byte-equal total).
 *   K3 NOTHING ELSE — every body that is not a raised column has the same vertices in K1 and K2.
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> §SKIP.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2bim_cli.js'));
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
if (!fs.existsSync(MK)) { console.log('§SKIP W-COL-TO-BEAM no marked shed set at ' + MK); process.exit(0); }
const files = fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f));
async function run(extra, tag) {
  const out = path.join(os.tmpdir(), 'w_col_to_beam_' + process.pid + '_' + tag), args = C.parseArgs(['--sheets', ...files, '--out', out, '--pack', 'pwd2024_bd', '--complete', '--report', ...extra]);
  const res = C.run(args, () => {}); C.write(res, out); await C.writeIfc(res, out);
  const lines = [], orig = console.log; console.log = s => lines.push(String(s)); try { await C.writeReport(res, out, args); } finally { console.log = orig; }
  const lp = lines.find(l => /rule=load_path /.test(l)) || '', n = +((/findings=(\d+)/.exec(lp) || [])[1]);
  console.log('  [' + tag + '] ' + lp.replace(/ of=.*/, '') + ' | bill ' + res.bill.totals.amount.toFixed(2));
  return { res, lp: n };
}
(async () => {
  const A = await run([], 'default'), B = await run(['--choice', 'column.top_under_beam=as_drawn'], 'as_drawn');
  const RA = A.res.out.gate.R, RB = B.res.out.gate.R, raised = RA.els.filter(e => e.size && e.size.top && e.size.top.key === 'column.top_under_beam');
  const row = (RA.defaults_table || []).find(r => r.key === 'column.top_under_beam'), xs = [...new Set(raised.map(e => (e.vertices.reduce((s, v) => s + v[0], 0) / e.vertices.length).toFixed(2)))].sort();
  // K1
  ok('K1 DEFAULT ' + raised.length + ' columns raised ' + [...new Set(raised.map(e => e.size.top.drawn + ' -> ' + e.size.top.value))].join(', ') + ' m on ' + xs.length + ' lines; load_path ' + A.lp + '; the setting is a used guess row',
    raised.length === 12 && xs.length === 6 && A.lp === 0 && row && row.used && row.kind === 'guess' && raised.every(e => e.prov === 'derived' && /top:default/.test((e.ifc && e.ifc.props && e.ifc.props.SizeBasis) || '')),
    'lines x=' + xs.join(' ') + ' | row used=' + (row && row.used) + ' source=' + (row && row.source));
  // K2
  const raisedB = RB.els.filter(e => e.size && e.size.top).length;
  ok('K2 AS DRAWN nothing raised (' + raisedB + '), load_path flags ' + B.lp + ' again, bill ' + B.res.bill.totals.amount.toFixed(2), raisedB === 0 && B.lp === 10 && Math.abs(B.res.bill.totals.amount - 6188538.09) < 0.01, '');
  // K3
  const byG = {}, ids = new Set(raised.map(e => e.guid)); RB.els.forEach(e => { byG[e.guid] = e; });
  const moved = RA.els.filter(e => !ids.has(e.guid)).filter(e => { const b = byG[e.guid]; return !b || JSON.stringify(b.vertices) !== JSON.stringify(e.vertices); });
  ok('K3 NOTHING ELSE every other body (' + (RA.els.length - ids.size) + ') has the same vertices with and without the default', moved.length === 0 && RA.els.length === RB.els.length, 'moved=' + moved.length + (moved[0] ? ' e.g. ' + moved[0].class : ''));
  console.log(fail ? '§VERDICT FAIL W-COL-TO-BEAM judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-COL-TO-BEAM judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1); });
