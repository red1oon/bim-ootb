/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// whatif_witness.js — W-WHATIF (TM 4D/5D variance lane §S6). Whitebox §-log proof of the schedule what-if engine.
//
// Each assertion NAMES the issue it proves (Standing Rule: a test that doesn't reveal solved/not is not a test):
//   §WHATIF-RIPPLE  : a blue slip on an EARLY phase re-folds EVERY downstream phase forward by the same days,
//                     and the project finish moves — while the OFFICIAL baseline is untouched (issue: does the
//                     finish-to-start dependency actually ripple, or are phases still independent ranges?).
//   §WHATIF-FORWARD : forward variance = planned(official) vs blue — finishSlipDays == the slip, BAC unchanged
//                     (same scope), PV moves (totals move) (issue: is the variance the planned-vs-blue forward delta?).
//   §WHATIF-ACCEPT  : acceptSlip re-baselines — the official rows now CARRY the rippled dates, blue rows gone
//                     (issue: does accept turn the speculative schedule into the official one?).
//   §WHATIF-DISCARD : on a FRESH db, commitSlip then discardSlip → official == original, ZERO blue rows
//                     (issue: does discard restore, leaving official exactly as it never moved?).
//
// Runs on the REAL folded project (erp/ad_seed.db C_Project 990000 'BIM: Hospital', 7 F-S phases) — no synthetic data.
// KernelOps absent in node → the projection layer (the thing under test) runs guarded, exactly as shipped.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const WhatIf = require('../../viewer/whatif.js');

const ERP = path.join(__dirname, '..', 'ad_seed.db');
const out = [];
let pass = 0, fail = 0;
const W = (ok, m) => { out.push((ok ? '🟢' : '🔴') + ' ' + m); ok ? pass++ : fail++; return ok; };

(async function () {
  if (!fs.existsSync(ERP)) { console.log('§WHATIF SKIP — missing ' + ERP); process.exit(1); }
  const SQL = await initSqlJs();
  const scalar = (db, s, p) => { const r = db.exec(s, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; };
  const fresh = () => new SQL.Database(fs.readFileSync(ERP));

  const PID = 990000, SLIP = 30, BR = 'blue-whatif-test';

  // ── baseline (official) ───────────────────────────────────────────────────
  let db = fresh();
  const base = WhatIf.readPhases(db, PID, null);
  W(base.length === 7, `§WHATIF baseline — 990000 has ${base.length} F-S phases (expect 7)`);
  const contiguous = base.every((p, i) => i === 0 || p.startDays === base[i - 1].endDays);
  W(contiguous, `§WHATIF baseline — phases are a contiguous finish-to-start chain (lag=0): ${contiguous}`);
  const baseFinish = base[base.length - 1].endDays;
  out.push(`   baseline: ${base.map(p => p.name + ' [' + WhatIf._date(p.startDays).slice(0, 10) + '→' + WhatIf._date(p.endDays).slice(0, 10) + ']').join('  ')}`);

  // ── §WHATIF-RIPPLE: blue slip on the FIRST phase (+30d) ─────────────────────
  const firstSeq = base[0].seqno;
  const slips = {}; slips[firstSeq] = { startDelta: SLIP };
  await WhatIf.commitSlip(db, BR, PID, slips);

  const off = WhatIf.readPhases(db, PID, null);       // official view (branch_id IS NULL)
  const blue = WhatIf.readPhases(db, PID, BR);         // blue overlay view

  const officialUnchanged = off.length === base.length && off.every((p, i) => p.startDays === base[i].startDays && p.endDays === base[i].endDays);
  W(officialUnchanged, `§WHATIF-RIPPLE — OFFICIAL baseline untouched after blue commit: ${officialUnchanged}`);

  const allShifted = blue.length === base.length && blue.every((p, i) => p.startDays === base[i].startDays + SLIP && p.endDays === base[i].endDays + SLIP);
  W(allShifted, `§WHATIF-RIPPLE — ALL ${blue.length} downstream phases re-folded +${SLIP}d in blue: ${allShifted}`);

  const blueFinish = blue[blue.length - 1].endDays;
  W(blueFinish === baseFinish + SLIP, `§WHATIF-RIPPLE — project finish moved ${baseFinish}→${blueFinish} (+${blueFinish - baseFinish}d, expect +${SLIP})`);
  out.push(`   blue:     ${blue.map(p => p.name + ' [' + WhatIf._date(p.startDays).slice(0, 10) + '→' + WhatIf._date(p.endDays).slice(0, 10) + ']').join('  ')}`);

  // ── §WHATIF-FORWARD: forward variance = planned vs blue ─────────────────────
  // as-of date set mid-project so PV is partial on both schedules (totals genuinely move).
  const midAsOf = WhatIf._date(base[2].startDays);
  const wf = WhatIf.scheduleWhatIf(db, PID, slips, midAsOf);
  W(wf.forward.finishSlipDays === SLIP, `§WHATIF-FORWARD — finishSlipDays = ${wf.forward.finishSlipDays} (expect ${SLIP})`);
  W(wf.forward.bacDelta === '0', `§WHATIF-FORWARD — BAC unchanged (same scope), bacDelta = ${wf.forward.bacDelta}`);
  const pvMoved = wf.forward.pvDelta !== '0' && wf.official.pv !== wf.blue.pv;
  W(pvMoved, `§WHATIF-FORWARD — PV moved as-of ${midAsOf.slice(0, 10)}: official ${wf.official.pv} vs blue ${wf.blue.pv} (Δ ${wf.forward.pvDelta})`);
  out.push(`   forward:  BAC ${wf.official.bac} (==blue ${wf.blue.bac}) · finish ${wf.official.finish.slice(0,10)} → ${wf.blue.finish.slice(0,10)}`);

  // ── §WHATIF-ACCEPT: re-baseline ─────────────────────────────────────────────
  // kernel_ops is a browser-side table (absent in this node seed) — accept's op-log call is guarded; pass null.
  await WhatIf.acceptSlip(db, BR, PID, null);
  const afterAccept = WhatIf.readPhases(db, PID, null);
  const rebased = afterAccept.length === base.length && afterAccept.every((p, i) => p.startDays === base[i].startDays + SLIP && p.endDays === base[i].endDays + SLIP);
  W(rebased, `§WHATIF-ACCEPT — official rows now CARRY the rippled +${SLIP}d dates (re-baselined): ${rebased}`);
  const noBlueLeft = Number(scalar(db, "SELECT COUNT(*) FROM C_ProjectPhase WHERE C_Project_ID=? AND branch_id IS NOT NULL", [PID]) || 0);
  W(noBlueLeft === 0, `§WHATIF-ACCEPT — no blue rows remain after accept: ${noBlueLeft}`);

  // ── §WHATIF-DISCARD: restore (fresh db so 'original' is pristine) ────────────
  db = fresh();
  const orig = WhatIf.readPhases(db, PID, null).map(p => ({ s: p.startDays, e: p.endDays }));
  await WhatIf.commitSlip(db, BR, PID, slips);
  const blueRows = Number(scalar(db, "SELECT COUNT(*) FROM C_ProjectPhase WHERE C_Project_ID=? AND branch_id=?", [PID, BR]) || 0);
  W(blueRows > 0, `§WHATIF-DISCARD — commit created ${blueRows} blue phase rows`);
  WhatIf.discardSlip(db, BR, PID);
  const afterDiscard = WhatIf.readPhases(db, PID, null).map(p => ({ s: p.startDays, e: p.endDays }));
  const restored = afterDiscard.length === orig.length && afterDiscard.every((p, i) => p.s === orig[i].s && p.e === orig[i].e);
  W(restored, `§WHATIF-DISCARD — official == original after discard: ${restored}`);
  const zeroBlue = Number(scalar(db, "SELECT COUNT(*) FROM C_ProjectPhase WHERE C_Project_ID=? AND branch_id IS NOT NULL", [PID]) || 0);
  W(zeroBlue === 0, `§WHATIF-DISCARD — zero blue rows remain: ${zeroBlue}`);

  console.log('§WHATIF W-WHATIF — schedule what-if (S6) whitebox proof');
  console.log(out.join('\n'));
  console.log(`§WHATIF RESULT ${pass}/${pass + fail} pass`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('§WHATIF ERROR', e); process.exit(1); });
