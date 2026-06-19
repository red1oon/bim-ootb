/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// bake_gw_hospital_variance.js — write the budget-vs-actual VARIANCE into the iDempiere records (system of
// record) for the GW Hospital Project Order. iDempiere natively holds cost variance: PlannedAmt (budget) vs
// CommittedAmt (actual spend), on C_Project / C_ProjectPhase / C_ProjectTask. We also (a) compress the planned
// phase dates from the ~12y fold artifact to a believable ~36-month span, and (b) set IsComplete per a fixed
// "today" anchor. Spec: prompts/GW_HOSPITAL_SHOWCASE_SPEC.md §ACTUAL + BIM_ERP_ROUNDTRIP_RETHINK §TM-VARIANCE.
//
// The actual is a DETERMINISTIC over-run variant — the SAME rule as viewer/time_machine.js _phaseVariant, so
// the ERP records and the Time Machine 4D view correlate by construction (no random / no Date.now). The
// date-SLIP (actual dates) is NOT stored — iDempiere has no per-phase actual-date column; that stays a viewer
// 4D overlay. Here we persist what iDempiere CAN hold: actual COST (CommittedAmt) + planned dates + IsComplete.
//
// Witness W-GW-HOSP-COSTVAR (read the log): committed > planned (over budget); Superstructure marquee blow-out;
// per-phase CommittedAmt == round(PlannedAmt × factor); dates within the ~36mo window; IsComplete spread;
// project rollup CommittedAmt == Σ phases; deterministic. SAFE: dry-run unless --write.
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/bake_gw_hospital_variance.js [--write]

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const WRITE = process.argv.includes('--write');
const ERP = path.join(__dirname, '..', 'ad_seed.db');
const DAY = 86400000;
const TARGET_DAYS = 1080;            // ~36 months — believable hospital build (12y fold span compressed)

// ── EXACT same deterministic rule as viewer/time_machine.js _phaseVariant (correlation by construction) ──
function _strHash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function _phaseVariant(name) {
  var h = _strHash(name), marquee = /Superstructure/i.test(name);
  return { slip: (h % 18) + (marquee ? 40 : 4), stretch: (h % 26) + (marquee ? 130 : 10),
           factor: marquee ? 1.60 : (1.04 + ((h >> 8) % 36) / 100), marquee: marquee };
}
function parseDt(s) { return new Date(String(s).replace(' ', 'T') + 'Z').getTime(); }
function fmtDt(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
function days(a, b) { return Math.round((a - b) / DAY); }

const out = [];
const W = (ok, m) => { out.push((ok ? '🟢' : '🔴') + ' ' + m); return ok; };

(async function () {
  if (!fs.existsSync(ERP)) { console.log('§HOSPVAR SKIP — missing ' + ERP); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(ERP));
  const scalar = (s) => { const r = db.exec(s); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; };

  const projId = scalar("SELECT C_Project_ID FROM C_Project WHERE Value='Hospital'");
  if (projId == null) { console.log('§HOSPVAR SKIP — no Hospital C_Project (run bake_gw_hospital_seed first)'); process.exit(1); }

  const phRes = db.exec("SELECT C_ProjectPhase_ID, Name, StartDate, EndDate, PlannedAmt FROM C_ProjectPhase WHERE C_Project_ID=" + projId + " ORDER BY SeqNo");
  const phases = (phRes.length ? phRes[0].values : []).map(r => ({ id: r[0], name: r[1], pStart: parseDt(r[2]), pEnd: parseDt(r[3]), planned: r[4] }));

  // compress planned dates → ~36mo (proportional; preserves sequence + relative durations)
  const rawStart = Math.min.apply(null, phases.map(p => p.pStart));
  const rawEnd = Math.max.apply(null, phases.map(p => p.pEnd));
  const fT = TARGET_DAYS / days(rawEnd, rawStart);
  phases.forEach(p => { p.cStart = rawStart + Math.round(days(p.pStart, rawStart) * fT) * DAY;
                        p.cEnd = rawStart + Math.round(days(p.pEnd, rawStart) * fT) * DAY; });
  const anchor = rawStart + Math.round(TARGET_DAYS * 0.62) * DAY;   // fixed "today" → status spread

  let tPlanned = 0, tCommitted = 0, maxEnd = 0;
  phases.forEach(p => {
    const v = _phaseVariant(p.name);
    p.factor = v.factor; p.marquee = v.marquee;
    p.committed = Math.round(p.planned * v.factor);
    p.aEnd = p.cEnd + (v.slip + v.stretch) * DAY;       // actual finish (for IsComplete only — not stored)
    p.complete = p.aEnd < anchor ? 'Y' : 'N';
    tPlanned += Math.round(p.planned); tCommitted += p.committed;
    if (p.cEnd > maxEnd) maxEnd = p.cEnd;
  });

  // ── apply to records ──
  phases.forEach(p => {
    db.run("UPDATE C_ProjectPhase SET StartDate=?, EndDate=?, CommittedAmt=?, IsComplete=? WHERE C_ProjectPhase_ID=?",
      [fmtDt(p.cStart), fmtDt(p.cEnd), p.committed, p.complete, p.id]);
    // tasks under this phase → CommittedAmt = PlannedAmt × the phase factor (correlated)
    db.run("UPDATE C_ProjectTask SET CommittedAmt=ROUND(PlannedAmt*?) WHERE C_ProjectPhase_ID=?", [p.factor, p.id]);
  });
  db.run("UPDATE C_Project SET CommittedAmt=?, DateFinish=? WHERE C_Project_ID=?", [tCommitted, fmtDt(maxEnd), projId]);

  // ── witness ──
  const money = n => 'RM' + Math.round(n).toLocaleString('en-US');
  console.log('§HOSPVAR planned=' + tPlanned + ' committed=' + tCommitted + ' over=' + Math.round((tCommitted - tPlanned) / tPlanned * 100) + '% span=' + days(maxEnd, rawStart) + 'd');
  W(tCommitted > tPlanned, 'OVER budget in records — Planned ' + money(tPlanned) + ' → Committed ' + money(tCommitted) + ' (+' + Math.round((tCommitted - tPlanned) / tPlanned * 100) + '%)');
  const sup = phases.find(p => p.marquee);
  W(sup && sup.committed - sup.planned === Math.max.apply(null, phases.map(p => p.committed - p.planned)), 'Superstructure is the marquee cost blow-out (+' + money(sup.committed - sup.planned) + ')');
  W(phases.every(p => p.committed === Math.round(p.planned * p.factor)), 'every phase CommittedAmt == round(PlannedAmt × factor)');
  W(days(maxEnd, rawStart) <= TARGET_DAYS + 2, 'planned span compressed to ~' + TARGET_DAYS + 'd (got ' + days(maxEnd, rawStart) + 'd)');
  const nComplete = phases.filter(p => p.complete === 'Y').length;
  W(nComplete >= 1 && nComplete < phases.length, 'IsComplete spread: ' + nComplete + '/' + phases.length + ' complete');
  // rollup check from the live db
  const projCommitted = scalar("SELECT CAST(ROUND(CommittedAmt) AS INTEGER) FROM C_Project WHERE C_Project_ID=" + projId);
  W(projCommitted === tCommitted, 'C_Project.CommittedAmt == Σ phases (' + money(projCommitted) + ')');
  const phCommitted = scalar("SELECT CAST(ROUND(SUM(CommittedAmt)) AS INTEGER) FROM C_ProjectPhase WHERE C_Project_ID=" + projId);
  W(phCommitted === tCommitted, 'phase CommittedAmt persisted to the db (Σ=' + money(phCommitted) + ')');

  console.log('\nphase breakdown (in records):');
  phases.forEach(p => console.log('  ' + (p.marquee ? '⚠ ' : '  ') + p.name.padEnd(15) +
    ' planned=' + money(p.planned).padEnd(14) + ' committed=' + money(p.committed).padEnd(14) +
    ' Δ=' + (p.committed - p.planned >= 0 ? '+' : '') + money(p.committed - p.planned) + ' complete=' + p.complete));

  const pass = out.filter(l => l.startsWith('🟢')).length, total = out.length;
  console.log('\n' + out.join('\n'));
  console.log('\nW-GW-HOSP-COSTVAR ' + pass + '/' + total + (WRITE ? ' [WRITE]' : ' [dry-run]'));
  if (WRITE && pass === total) { fs.writeFileSync(ERP, Buffer.from(db.export())); console.log('§HOSPVAR WROTE ' + ERP); }
  else if (WRITE) console.log('§HOSPVAR NOT WRITTEN — witness not green');
  fs.writeFileSync(path.join(__dirname, 'bake_gw_hospital_variance.log'), out.join('\n') + '\n');
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
