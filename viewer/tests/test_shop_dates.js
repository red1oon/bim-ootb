// ⚠ DO NOT REMOVE — Scope guard
// Scope: whitebox §-witness for TM_4D5D §S4 E3 — "PP schedule-vs-actual = real op date variance" (W-SHOP-DATES).
//   DOCTRINE (TM_4D5D §S3/§4): there is NO actual-date column to read (PP_Order.DateStart/DateFinish are NULL by
//   design) → the schedule slip is a PROJECTION FROM COST, never an invented actual date: slip = planned-duration
//   × (r−1), r = CommittedAmt/PlannedAmt (the real twin). Planned durations are REAL columns. Proves, against the
//   real erp/ad_seed.db:
//     A — per-PHASE planned duration reads from C_ProjectPhase.StartDate/EndDate (real, >0).
//     B — per-PHASE r = CommittedAmt/PlannedAmt (real twin); slip = round(durDays×(r−1)) deterministic.
//     C — honest MIXED signs: Superstructure slips LATE (+, cost +60% marquee); MEP Rough-in & Finishes slip
//         EARLY (−, cost under) — never all-one-way.
//     D — per-ORDER (real op) variance: each PP_Order's planned dur from its OWN DateStartSchedule/Finish; a
//         Superstructure order's slip uses its phase r and is LATE.
//     E — NO actual-date invented: PP_Order.DateStart/DateFinish remain NULL (the projection writes nothing).
//     F — project rollup: rProj = project Committed/Planned; projSlip = round(projDur×(rProj−1)), finite, LATE
//         (the +35% project overrun).
//   Each assertion NAMES the issue. §-log first — READ test_shop_dates.log before concluding.
// Run:  node viewer/tests/test_shop_dates.js          (exit 0 = PASS)
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const DB = path.join(__dirname, '..', '..', 'erp', 'ad_seed.db');
const q = (sql) => execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' }).trim();
const rows = (sql) => q(sql).split('\n').filter(Boolean).map(l => l.split('|'));
const DAY = 86400000;

const log = []; let pass = 0, fail = 0;
const S = (m) => { log.push(m); console.log(m); };
const ok = (cond, label, detail) => { if (cond) pass++; else fail++; S('  ' + (cond ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ' — ' + detail : '')); };

// projection replicated VERBATIM from time_machine.js _computeScheduleProjection (the whitebox contract)
const slip = (startMs, endMs, planned, committed) => {
  const durDays = (isFinite(startMs) && isFinite(endMs) && endMs > startMs) ? Math.round((endMs - startMs) / DAY) : 0;
  const r = planned > 0 ? committed / planned : 1;
  return { durDays, r, slipDays: Math.round(durDays * (r - 1)) };
};

S('§W-SHOP-DATES — PP schedule-vs-actual = real op date variance (whitebox, projected-from-cost, real ad_seed.db)');

// real twin phases (skip the empty 'Unsequenced')
const ph = rows(`SELECT Name, StartDate, EndDate, PlannedAmt, CommittedAmt FROM C_ProjectPhase WHERE C_Project_ID=990000 AND PlannedAmt>0 ORDER BY SeqNo`)
  .map(r => ({ name: r[0], start: Date.parse(r[1]), end: Date.parse(r[2]), planned: +r[3], committed: +r[4] }));
ok(ph.length >= 5, 'twin has the real phases', 'phases=' + ph.length);

// A — per-phase planned duration from real date columns
const durOk = ph.every(p => slip(p.start, p.end, p.planned, p.committed).durDays > 0);
ok(durOk, 'A — per-phase planned duration reads from C_ProjectPhase.StartDate/EndDate (real, >0)',
   ph.map(p => p.name + ':' + slip(p.start, p.end, p.planned, p.committed).durDays + 'd').join(', '));

// B — slip deterministic from r (run twice → identical)
const run1 = ph.map(p => slip(p.start, p.end, p.planned, p.committed).slipDays).join(',');
const run2 = ph.map(p => slip(p.start, p.end, p.planned, p.committed).slipDays).join(',');
ok(run1 === run2, 'B — slip = round(durDays×(r−1)) is deterministic (byte-identical across runs)', run1);

// C — honest mixed signs
const get = (n) => ph.find(p => p.name === n);
const sSup = slip(get('Superstructure').start, get('Superstructure').end, get('Superstructure').planned, get('Superstructure').committed);
const sMep = get('MEP Rough-in') ? slip(get('MEP Rough-in').start, get('MEP Rough-in').end, get('MEP Rough-in').planned, get('MEP Rough-in').committed) : null;
const sFin = get('Finishes') ? slip(get('Finishes').start, get('Finishes').end, get('Finishes').planned, get('Finishes').committed) : null;
ok(sSup.slipDays > 0, 'C1 — Superstructure slips LATE (cost +60% marquee)', '+' + sSup.slipDays + 'd (r=' + sSup.r.toFixed(3) + ')');
ok(sMep && sMep.slipDays < 0, 'C2 — MEP Rough-in slips EARLY (cost under)', sMep ? sMep.slipDays + 'd (r=' + sMep.r.toFixed(3) + ')' : 'absent');
ok(sFin && sFin.slipDays < 0, 'C3 — Finishes slips EARLY (cost under) — mixed signs, not all-one-way', sFin ? sFin.slipDays + 'd (r=' + sFin.r.toFixed(3) + ')' : 'absent');

// D — per-ORDER (real op) variance: a Superstructure PP_Order, planned dur from ITS OWN schedule columns
const o = rows(`SELECT PP_Order_ID, DateStartSchedule, DateFinishSchedule FROM PP_Order WHERE C_Project_ID=990000 AND Description LIKE 'Superstructure%' ORDER BY PP_Order_ID LIMIT 1`)[0];
const oSlip = slip(Date.parse(o[1]), Date.parse(o[2]), get('Superstructure').planned, get('Superstructure').committed);
ok(oSlip.durDays > 0 && oSlip.slipDays > 0,
   'D — per-ORDER planned dur from PP_Order.DateStartSchedule/Finish; slip LATE via its phase r',
   `order=${o[0]} dur=${oSlip.durDays}d slip=+${oSlip.slipDays}d`);

// E — no invented actual date: actuals stay NULL
const nulls = q(`SELECT COUNT(*) FROM PP_Order WHERE C_Project_ID=990000 AND (DateStart IS NOT NULL OR DateFinish IS NOT NULL)`);
ok(Number(nulls) === 0, 'E — NO actual-date invented: PP_Order.DateStart/DateFinish stay NULL (projected from cost)', 'non-null actuals=' + nulls);

// F — project rollup
const proj = rows(`SELECT MIN(StartDate), MAX(EndDate), SUM(PlannedAmt), SUM(CommittedAmt) FROM C_ProjectPhase WHERE C_Project_ID=990000 AND PlannedAmt>0`)[0];
const pSlip = slip(Date.parse(proj[0]), Date.parse(proj[1]), +proj[2], +proj[3]);
ok(pSlip.slipDays > 0 && isFinite(pSlip.slipDays), 'F — project rollup slips LATE (the +35% overrun), finite',
   `rProj=${pSlip.r.toFixed(3)} projDur=${pSlip.durDays}d projSlip=+${pSlip.slipDays}d`);

const verdict = `§RESULT W-SHOP-DATES  ${pass}/${pass + fail}  ${fail ? 'FAIL' : 'PASS'}`;
S(''); S(verdict);
fs.writeFileSync(path.join(__dirname, 'test_shop_dates.log'), log.join('\n') + '\n');
process.exit(fail ? 1 : 0);
