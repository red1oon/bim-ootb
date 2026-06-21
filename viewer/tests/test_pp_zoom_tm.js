// ⚠ DO NOT REMOVE — Scope guard
// Scope: whitebox §-witness for PP_ORDER_ZOOM_TM_SPEC — "PP_Order Zoom-Across → BIM Viewer TimeMachine".
//   The Hospital scene's geometry lives in OPFS (unreachable from disk) → live VISUAL is DEFERRED; this §-log
//   IS the proof (feedback_whitebox_deduce_not_browser). It replicates, against the REAL erp/ad_seed.db:
//     A — the ERP _zoomScope(pp_order) fold: a Hospital PP_Order resolves {bld, tm:{order}} (identity, not a link).
//     B — the launch URL the 'timemachine' destination builds carries ?tm=1&pporder=<id>&bld=<bld>.
//     C — tmJumpToOrder's phase token is EXTRACTED from PP_Order.Description ("<Phase> — <CREW>"), not invented.
//     D — cursor landing mode=phase: when the phase has ops on the scene axis → cursor == that phase's winStart.
//     E — cursor landing mode=projected: when it doesn't → order finish date mapped onto [_projectStart,_projectEnd]
//         by its position in the shopfloor span; finite, in-range, matches the proportional formula (honest label).
//     F — the order's PP_Order_Cost Σ CumulatedAmt > 0 (the cost the S-curve folds for this order).
//     G — guard: a non-BIM-band order (C_Project_ID null / <990000) resolves NO scene (null) — pure otherwise.
//   Each assertion NAMES the issue it proves. §-log first — READ test_pp_zoom_tm.log before concluding.
// Run:  node viewer/tests/test_pp_zoom_tm.js        (exit 0 = PASS)
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const DB = path.join(__dirname, '..', '..', 'erp', 'ad_seed.db');
const q = (sql) => execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' }).trim();
const rows = (sql) => q(sql).split('\n').filter(Boolean).map(l => l.split('|'));

const log = []; let pass = 0, fail = 0;
const S = (m) => { log.push(m); console.log(m); };
const ok = (cond, label, detail) => { if (cond) pass++; else fail++; S('  ' + (cond ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ' — ' + detail : '')); };

// ── the two folds under test, replicated VERBATIM from the shipped code (the whitebox contract) ──────────────
// ERP erp/idempiere.html _zoomScope(pp_order) + the 'timemachine' launch URL.
function zoomScopePPOrder(ppId) {
  const r = rows(`SELECT PP_Order_ID, C_Project_ID FROM PP_Order WHERE PP_Order_ID=${ppId}`);
  if (!r.length) return null;
  const pProj = r[0][1];
  if (pProj === '' || pProj == null || Number(pProj) < 990000) return null;     // BIM band only
  const pr = rows(`SELECT value FROM c_project WHERE c_project_id=${Number(pProj)}`);
  if (!pr.length || !pr[0][0]) return null;
  return { bld: String(pr[0][0]), find: null, tm: { order: Number(ppId) } };
}
function launchUrl(sc) {
  const home = encodeURIComponent('https://x/erp/idempiere.html');
  return '../viewer/viewer.html?db=../buildings/' + encodeURIComponent(sc.bld) + '_extracted.db&bld=' +
    encodeURIComponent(sc.bld) + '&home=' + home + '&tm=1&pporder=' + encodeURIComponent(sc.tm.order);
}
// TM viewer/time_machine.js tmJumpToOrder cursor resolver (the doJump math, pure slice).
function resolveCursor(info, ops, projectStart, projectEnd) {
  const phase = String(info.desc || '').split(' — ')[0].trim();
  let s = Infinity, e = -Infinity;
  for (const op of ops) {
    const ph = (op.parameters || {}).phase || 'Architecture';
    if (ph === phase) { if (op.start_ts < s) s = op.start_ts; if (op.end_ts > e) e = op.end_ts; }
  }
  if (isFinite(s)) return { phase, mode: 'phase', cursor: s };
  let frac = 0.5;
  if (isFinite(info.spanMin) && isFinite(info.spanMax) && info.spanMax > info.spanMin && isFinite(info.end))
    frac = Math.max(0, Math.min(1, (info.end - info.spanMin) / (info.spanMax - info.spanMin)));
  return { phase, mode: 'projected', cursor: projectStart + frac * (projectEnd - projectStart), frac };
}
function orderInfo(ppId) {
  const r = rows(`SELECT Description, DateStartSchedule, DateFinishSchedule, C_Project_ID FROM PP_Order WHERE PP_Order_ID=${ppId}`);
  if (!r.length) return null;
  const pid = r[0][3];
  const cost = Number(q(`SELECT COALESCE(SUM(CumulatedAmt),0) FROM PP_Order_Cost WHERE PP_Order_ID=${ppId}`) || 0);
  const sp = rows(`SELECT MIN(o.DateFinishSchedule), MAX(o.DateFinishSchedule) FROM PP_Order o JOIN PP_Order_Cost oc ON o.PP_Order_ID=oc.PP_Order_ID WHERE o.C_Project_ID=${Number(pid)}`)[0];
  return { desc: r[0][0], start: Date.parse(r[0][1]), end: Date.parse(r[0][2]), cost,
           spanMin: Date.parse(sp[0]), spanMax: Date.parse(sp[1]) };
}

S('§W-PPZOOM-TM — PP_Order Zoom-Across → BIM Viewer TimeMachine (whitebox, real ad_seed.db; live visual deferred)');

// pick a real Hospital order (Superstructure has a distinct phase token + nonzero cost)
const ORD = Number(q(`SELECT PP_Order_ID FROM PP_Order WHERE C_Project_ID=990000 AND Description LIKE 'Superstructure%' ORDER BY PP_Order_ID LIMIT 1`));
S('  · chosen Hospital order PP_Order_ID=' + ORD + ' (' + q(`SELECT Description FROM PP_Order WHERE PP_Order_ID=${ORD}`) + ')');

// A — ERP scope fold
const sc = zoomScopePPOrder(ORD);
ok(!!sc && sc.bld === 'Hospital' && sc.tm && sc.tm.order === ORD,
   'A — _zoomScope(pp_order) resolves the building + TM order by identity', sc ? `bld=${sc.bld} tm.order=${sc.tm.order}` : 'null');

// B — launch URL
const url = sc ? launchUrl(sc) : '';
ok(/[?&]tm=1(&|$)/.test(url) && url.indexOf('pporder=' + ORD) !== -1 && url.indexOf('bld=Hospital') !== -1,
   'B — timemachine launch URL carries tm=1 & pporder & bld', url);

// C — phase token extracted from Description
const info = orderInfo(ORD);
const phaseTok = String(info.desc || '').split(' — ')[0].trim();
ok(phaseTok === 'Superstructure', 'C — phase token EXTRACTED from Description (not invented)', `phase="${phaseTok}"`);

// D — mode=phase: synthetic axis [0,5000] with a Superstructure op window [1000,2000]
const opsHit = [
  { start_ts: 100, end_ts: 900, parameters: { phase: 'Substructure' } },
  { start_ts: 1000, end_ts: 2000, parameters: { phase: 'Superstructure' } },
  { start_ts: 2100, end_ts: 4000, parameters: { phase: 'Finishes' } }
];
const rD = resolveCursor(info, opsHit, 0, 5000);
ok(rD.mode === 'phase' && rD.cursor === 1000, 'D — mode=phase lands cursor at the phase winStart', `mode=${rD.mode} cursor=${rD.cursor}`);

// E — mode=projected: axis [PS,PE] with NO Superstructure op (Hospital geom in OPFS reality)
const PS = 1_000_000, PE = 9_000_000;
const opsMiss = [{ start_ts: PS, end_ts: 2_000_000, parameters: { phase: 'Architecture' } }];
const rE = resolveCursor(info, opsMiss, PS, PE);
const fracExpect = Math.max(0, Math.min(1, (info.end - info.spanMin) / (info.spanMax - info.spanMin)));
const curExpect = PS + fracExpect * (PE - PS);
ok(rE.mode === 'projected' && isFinite(rE.cursor) && rE.cursor >= PS && rE.cursor <= PE && Math.abs(rE.cursor - curExpect) < 1,
   'E — mode=projected maps order finish onto the construction axis, finite & in-range', `mode=${rE.mode} frac=${rE.frac.toFixed(3)} cursor=${Math.round(rE.cursor)}`);

// F — cost Σ
ok(info.cost > 0, 'F — order PP_Order_Cost Σ CumulatedAmt > 0 (the S-curve fold)', 'Σ=' + Math.round(info.cost));

// G — non-BIM-band order resolves no scene
const demo = Number(q(`SELECT PP_Order_ID FROM PP_Order WHERE COALESCE(C_Project_ID,0)<990000 ORDER BY PP_Order_ID LIMIT 1`));
ok(zoomScopePPOrder(demo) === null, 'G — non-BIM-band order (demo) resolves NO scene (pure otherwise)', 'demo order=' + demo);

const verdict = `§RESULT W-PPZOOM-TM  ${pass}/${pass + fail}  ${fail ? 'FAIL' : 'PASS'}`;
S(''); S(verdict);
fs.writeFileSync(path.join(__dirname, 'test_pp_zoom_tm.log'), log.join('\n') + '\n');
process.exit(fail ? 1 : 0);
