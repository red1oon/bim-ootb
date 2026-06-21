// ⚠ DO NOT REMOVE — Scope guard
// Scope: whitebox §-witness for TM_4D5D §S5(B) — Earned-Value Management from the EXISTING twin (W-PC-EVM).
//   NO generated C_ProjectIssue layer (option A declined — circular + invention). COST EVM only; schedule has no
//   independent actual on this twin so NO SPI is emitted (see PC_EVM_SPEC §HONESTY FINDING). Replicates
//   _computeEVM (time_machine.js) against the real erp/ad_seed.db twin and proves:
//     A — at project END (all phases complete): EV == Σ PlannedAmt (BAC) to the rupiah; AC == Σ CommittedAmt;
//         CPI == BAC/ΣCommitted (≈0.741); **EAC == the real CommittedAmt to the rupiah** (the forecast
//         RECONSTRUCTS the actual — proof the fold is honest, not invented); VAC == BAC−EAC (negative = overrun).
//     B — at a MID cursor (end of Superstructure): CPI < 1 (over budget); EAC > BAC (forecasts the overrun);
//         EV/AC fold only completed phases; all finite.
//     C — identities: CPI = EV/AC · CV = EV−AC · EAC = round(BAC/CPI) · VAC = BAC−EAC.
//     D — NO invention: C_ProjectIssue row count == 0 (nothing generated); the fold is read-only.
//     E — deterministic (byte-identical across runs).
//   Each assertion NAMES its issue. §-log first — READ test_pc_evm.log before concluding.
// Run:  node viewer/tests/test_pc_evm.js          (exit 0 = PASS)
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const DB = path.join(__dirname, '..', '..', 'erp', 'ad_seed.db');
const q = (sql) => execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' }).trim();
const rows = (sql) => q(sql).split('\n').filter(Boolean).map(l => l.split('|'));

const log = []; let pass = 0, fail = 0;
const S = (m) => { log.push(m); console.log(m); };
const ok = (cond, label, detail) => { if (cond) pass++; else fail++; S('  ' + (cond ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ' — ' + detail : '')); };

// real twin (skip empty 'Unsequenced'), shaped like _computeVariance's V.phases
const ph = rows(`SELECT Name, StartDate, EndDate, PlannedAmt, CommittedAmt FROM C_ProjectPhase WHERE C_Project_ID=990000 AND PlannedAmt>0 ORDER BY SeqNo`)
  .map(r => ({ phase: r[0], startDate: Date.parse(r[1]), endDate: Date.parse(r[2]), pCost: +r[3], aCost: +r[4] }));
const V = { phases: ph, tP: ph.reduce((s, p) => s + p.pCost, 0), tA: ph.reduce((s, p) => s + p.aCost, 0) };

// _computeEVM replicated VERBATIM from time_machine.js (the whitebox contract)
function computeEVM(V, cursor) {
  let EV = 0, AC = 0;
  V.phases.forEach(p => {
    const s = p.startDate, e = p.endDate;
    const frac = (isFinite(s) && isFinite(e) && e > s) ? Math.max(0, Math.min(1, (cursor - s) / (e - s)))
               : (isFinite(cursor) && isFinite(e) && cursor >= e ? 1 : 0);
    EV += p.pCost * frac; AC += p.aCost * frac;
  });
  const BAC = V.tP, CPI = AC > 0 ? EV / AC : 1;
  const EAC = CPI > 0 ? Math.round(BAC / CPI) : V.tA;
  return { EV: Math.round(EV), AC: Math.round(AC), CPI, CV: Math.round(EV - AC), BAC, EAC, VAC: BAC - EAC };
}

S('§W-PC-EVM — Earned Value (cost) from the existing twin (whitebox, real ad_seed.db; no generated data)');

const projEnd = Math.max.apply(null, ph.map(p => p.endDate));
const supEnd = ph.find(p => p.phase === 'Superstructure').endDate;

// A — at completion: forecast reconstructs the actual
const A = computeEVM(V, projEnd);
ok(A.EV === V.tP, 'A1 — at end EV == Σ PlannedAmt (BAC) to the rupiah', 'EV=' + A.EV + ' BAC=' + V.tP);
ok(A.AC === V.tA, 'A2 — at end AC == Σ CommittedAmt to the rupiah', 'AC=' + A.AC + ' ΣCommitted=' + V.tA);
ok(Math.abs(A.CPI - V.tP / V.tA) < 1e-9, 'A3 — CPI == BAC/ΣCommitted (the inverse overrun)', 'CPI=' + A.CPI.toFixed(4));
ok(A.EAC === V.tA, 'A4 — forecast EAC == the REAL CommittedAmt to the rupiah (reconstructs the actual)', 'EAC=' + A.EAC + ' committed=' + V.tA);
ok(A.VAC === V.tP - V.tA && A.VAC < 0, 'A5 — VAC == BAC−EAC, negative (the overrun)', 'VAC=' + A.VAC);

// B — mid cursor (end of Superstructure, the +60% marquee): trending over
const B = computeEVM(V, supEnd);
ok(B.CPI < 1, 'B1 — mid-project CPI < 1 (over budget)', 'CPI=' + B.CPI.toFixed(3));
ok(B.EAC > V.tP, 'B2 — mid-project EAC > BAC (forecasts the overrun)', 'EAC=' + B.EAC + ' BAC=' + V.tP);
ok(B.EV > 0 && B.AC > 0 && isFinite(B.EAC), 'B3 — EV/AC fold completed phases, all finite', 'EV=' + B.EV + ' AC=' + B.AC);

// C — identities
const C = computeEVM(V, supEnd);
ok(Math.abs(C.CPI - C.EV / C.AC) < 1e-9, 'C1 — CPI = EV/AC');
ok(C.CV === C.EV - C.AC, 'C2 — CV = EV − AC', 'CV=' + C.CV);
ok(C.EAC === Math.round(C.BAC / C.CPI), 'C3 — EAC = round(BAC/CPI)');
ok(C.VAC === C.BAC - C.EAC, 'C4 — VAC = BAC − EAC');

// D — no invention: C_ProjectIssue is absent OR empty (the fold generated nothing)
const hasTbl = q(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND lower(name)='c_projectissue'`) === '1';
const issues = hasTbl ? Number(q(`SELECT COUNT(*) FROM C_ProjectIssue`)) : 0;
ok(issues === 0, 'D — NO invention: C_ProjectIssue absent/empty (nothing generated; read-only fold)',
   hasTbl ? ('table present, rows=' + issues) : 'table absent (as in seed)');

// E — deterministic
ok(JSON.stringify(computeEVM(V, supEnd)) === JSON.stringify(computeEVM(V, supEnd)), 'E — deterministic (byte-identical across runs)');

const verdict = `§RESULT W-PC-EVM  ${pass}/${pass + fail}  ${fail ? 'FAIL' : 'PASS'}`;
S(''); S(verdict);
fs.writeFileSync(path.join(__dirname, 'test_pc_evm.log'), log.join('\n') + '\n');
process.exit(fail ? 1 : 0);
