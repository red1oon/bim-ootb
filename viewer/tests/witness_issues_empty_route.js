#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS W-ISSUES-EMPTY-ROUTE (2026-11-28, bim-compiler prompts/MOBILE_PERF.md §2026-11-28 finding 4)
// ISSUE THIS PROVES OR DISPROVES: the empty Issue Log told the user "Use Site Camera to snap and save photos", but no code ever
// shows #site-cam-btn, and the Snag button (#snag-btn-row → #snag-btn-fixed) is shown only while a Walk is on — so the text sent
// the user to a control they cannot reach. Every control the empty-state text names must be reachable:
//   R1 the text names no Site Camera unless some code shows #site-cam-btn;
//   R2 it names "Walk" and a Walk action exists in the pill actions (panels.js) — the route's first step;
//   R3 it names "Snag" and the Snag button exists (viewer.html, data-trl="ui_snag") and is shown during a Walk (picking.js: walkModeActive → 'block').
// RED control: the old text (issues.js at 2993df25, before this fix; env OLD_REF) must FAIL R1 — a fixed ref, so the control still bites after the merge. Read the log; the exit code is not evidence.
// Run: node viewer/tests/witness_issues_empty_route.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const V = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(V, f), 'utf8');
const LOG = []; let judged = 0, fails = 0;
const S = m => { LOG.push(m); console.log(m); };
const check = (ok, label, detail) => { judged++; if (!ok) fails++; S('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? ' — ' + detail : '')); return ok; };
const emptyText = src => { const m = /class="issues-empty">([^']*)'\s*\+\s*\(bld[^)]*\)\s*\+\s*'([^']*)'/.exec(src); return m ? (m[1] + ' <bld>' + m[2]).replace(/<br>/g, ' ') : null; };
const jsAll = fs.readdirSync(V).filter(f => /\.js$/.test(f)).map(f => rd(f)).join('\n');
const siteCamShown = /site-cam-btn['"]\)[^;\n]*\.style\.display\s*=\s*['"](?!none)/.test(jsAll) || /site-cam-btn[^\n]*classList\.remove\(['"]hidden/.test(jsAll);
const walkAction = /\{\s*id:\s*'walk'/.test(rd('panels.js'));
const snagBtn = /data-trl="ui_snag"/.test(rd('viewer.html')), snagInWalk = /snagRow\.style\.display = A\.walkModeActive \? 'block' : 'none'/.test(rd('picking.js'));
function judge(tag, text) {
  S('§ISSUES_EMPTY_TEXT ' + tag + ' "' + text + '"');
  const r1 = !/site camera/i.test(text || '') || siteCamShown;
  const r2 = /\bwalk\b/i.test(text || '') && walkAction, r3 = /\bsnag\b/i.test(text || '') && snagBtn && snagInWalk;
  return { r1, r2, r3 };
}
const cur = emptyText(rd('issues.js'));
check(!!cur, 'the empty-state text is found in issues.js', cur ? '' : 'pattern not found (VACUOUS)');
S('§ISSUES_EMPTY_FACTS site_cam_btn_shown_by_code=' + siteCamShown + ' walk_action=' + walkAction + ' snag_btn=' + snagBtn + ' snag_shown_in_walk=' + snagInWalk);
const j = judge('now', cur);
check(j.r1, 'R1 names no Site Camera unless #site-cam-btn is shown by code');
check(j.r2, 'R2 names Walk, and a Walk pill action exists');
check(j.r3, 'R3 names Snag, the Snag button exists and is shown during a Walk');
let old = null; try { old = emptyText(cp.execSync('git show ' + (process.env.OLD_REF || '2993df25') + ':viewer/issues.js', { cwd: V, maxBuffer: 64 << 20 }).toString()); } catch (e) {}
const jo = old ? judge(process.env.OLD_REF || '2993df25', old) : null, redOk = !!jo && !(jo.r1 && jo.r2 && jo.r3);
S('§ISSUES_EMPTY_RED old text ' + (jo ? (redOk ? 'FAILS as required' : 'PASSED (witness blind!)') : 'not readable'));
const verdict = !cur || !redOk ? (fails ? 'FAIL' : 'INCONCLUSIVE') : fails ? 'FAIL' : 'PASS';
S(`§WITNESS_ISSUES_EMPTY_ROUTE ${verdict} judged=${judged} fails=${fails} red_control=${redOk ? 'detected' : 'not detected'}`);
fs.writeFileSync(path.join(__dirname, 'witness_issues_empty_route.log'), LOG.join('\n') + '\n');
process.exit(verdict === 'PASS' ? 0 : 1);
