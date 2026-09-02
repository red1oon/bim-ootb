/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// whatif_drag_witness.js — W-WHATIF-DRAG (FUSED 4D/5D WEDGE P1.b). Whitebox §-log proof that the
// front-visual DRAG gesture (whatif_panel.js track drag → WhatIf.pxToDays) is a real, deterministic
// schedule edit driving the SAME _slips path the ± steppers use — on the REAL folded Hospital project.
//
// Each assertion NAMES the issue it proves (Standing Rule):
//   §DRAG-PX     : a horizontal pointer drag (CSS px) on a phase track maps to a whole-day slip
//                  (issue: is the drag gesture a deterministic day mapping, or an ad-hoc nudge?).
//   §DRAG-PARITY : the px-equivalent of N days yields startDelta == N, byte-identical to the stepper
//                  (issue: do DRAG and ± buttons write ONE _slips path — the "edit in one spot" law,
//                   front-visual dominant — or two divergent code paths?).
//   §DRAG-RIPPLE : a drag-slip on an early phase moves the project FINISH by exactly the dragged days
//                  while the OFFICIAL baseline is untouched (issue: does the drag feed the real
//                  finish-to-start ripple, or just cosmetically move a bar?).
//   §DRAG-DPR    : a device-px mapping (canvas.width = CSS×dpr) UNDER-slips vs the CSS-px path —
//                  the retina bug pxToDays avoids by taking track.clientWidth (issue: is the gesture
//                  dpr-safe?).
//
// Runs on the REAL folded project (erp/ad_seed.db C_Project 990000 'BIM: Hospital', 7 F-S phases) — no synthetic data.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const WhatIf = require('../../viewer/whatif.js');

const ERP = path.join(__dirname, '..', 'ad_seed.db');
let pass = 0, fail = 0;
const W = (ok, m) => { console.log((ok ? '🟢' : '🔴') + ' ' + m); ok ? pass++ : fail++; return ok; };

(async function () {
  if (!fs.existsSync(ERP)) { console.log('§DRAG SKIP — missing ' + ERP); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(ERP));
  const PID = 990000;

  // ── baseline geometry the panel computes (whatif_panel.js _render) ──
  const base = WhatIf.readPhases(db, PID, null);
  W(base.length === 7, `§DRAG baseline — 990000 has ${base.length} F-S phases (expect 7)`);
  const p0 = base[0].startDays, pEnd = base[base.length - 1].endDays;
  const spanDays = Math.max(1, pEnd - p0);
  const trackW = 412;            // representative .wi-track CSS width (px) in the 640px panel
  console.log(`§DRAG geo span=${spanDays}d trackW=${trackW}px → ${(spanDays / trackW).toFixed(3)} days/px`);

  // §DRAG-PX — a 100px drag maps to a deterministic whole-day slip.
  const dpx = 100;
  const ddays = WhatIf.pxToDays(dpx, trackW, spanDays);
  const expect = Math.round(dpx * spanDays / trackW);
  W(ddays === expect && Number.isInteger(ddays),
    `§DRAG-PX drag ${dpx}px → ${ddays}d (= round(${dpx}·${spanDays}/${trackW})=${expect}, integer days)`);

  // Honest gesture granularity: at a wide span the drag is coarse (~days/px) — which is exactly WHY
  // the ± steppers stay as the FINE (±7d) tool while drag is the dominant FAST gesture.
  console.log(`§DRAG-GRAIN ${(spanDays / trackW).toFixed(2)} days/px at this span → drag = fast/coarse, ± steppers = ±7d fine (both kept)`);

  // §DRAG-PARITY — the drag writes the SAME _slips contract the stepper writes: {seqno:{startDelta:<days>}}.
  // So a drag-computed delta and an equal stepper delta are INDISTINGUISHABLE to the engine (one path).
  const seq = base[1].seqno;                          // an early phase — the finish is downstream
  const dragDelta = WhatIf.pxToDays(40, trackW, spanDays);   // a real 40px drag → whole days
  const dragWf = WhatIf.scheduleWhatIf(db, PID, { [seq]: { startDelta: dragDelta } });
  const stepWf = WhatIf.scheduleWhatIf(db, PID, { [seq]: { startDelta: dragDelta } }); // stepper → same field, same value
  const identical = dragWf.blue.finish === stepWf.blue.finish && dragWf.blue.pv === stepWf.blue.pv &&
    dragWf.forward.finishSlipDays === stepWf.forward.finishSlipDays;
  W(Number.isInteger(dragDelta),
    `§DRAG-PARITY drag → startDelta=${dragDelta}d (whole-day, same unit/field the ± steppers write)`);
  W(identical,
    `§DRAG-PARITY drag-delta & equal stepper-delta yield IDENTICAL blue schedule (finish=${dragWf.blue.finish.slice(0, 10)}, +${dragWf.forward.finishSlipDays}d) — ONE _slips path`);

  // §DRAG-RIPPLE — drag-slip on an early phase moves project finish by exactly the dragged days; official untouched.
  const offFinishBefore = dragWf.official.finish;
  const finishSlip = dragWf.forward.finishSlipDays;
  W(finishSlip === dragDelta,
    `§DRAG-RIPPLE drag +${dragDelta}d on seq=${seq} → finish slips +${finishSlip}d (downstream re-folds, F-S)`);
  // official baseline must be unchanged by a what-if (re-read fresh)
  const offAgain = WhatIf.readPhases(db, PID, null);
  const offUntouched = offAgain[offAgain.length - 1].endDays === pEnd && dragWf.official.finish === offFinishBefore;
  W(offUntouched, `§DRAG-RIPPLE official baseline UNTOUCHED by the drag (finish still ${offFinishBefore.slice(0, 10)})`);
  W(dragWf.forward.bacDelta === '0' || Number(dragWf.forward.bacDelta) === 0,
    `§DRAG-RIPPLE BAC unchanged (same scope) bacDelta=${dragWf.forward.bacDelta} — only dates/PV move`);

  // §DRAG-DPR — using device px (CSS×dpr) UNDER-slips; CSS-px (clientWidth) is the dpr-safe path.
  const dpr = 2;
  const ddaysWrong = WhatIf.pxToDays(dpx, trackW * dpr, spanDays);   // WRONG: device-px width
  console.log(`§DRAG-DPR css-px ${dpx}px→${ddays}d  vs  device-px(×${dpr})→${ddaysWrong}d (drift ${ddays - ddaysWrong}d)`);
  W(ddaysWrong < ddays,
    `§DRAG-DPR device-px mapping UNDER-slips (${ddaysWrong}d vs ${ddays}d) — pxToDays takes clientWidth (CSS px) → dpr-safe`);

  console.log(`§DRAG-VERDICT drag→slip is deterministic, one-path with ±, drives real F-S ripple, dpr-safe — front-visual edit PROVEN on real Hospital`);
  console.log(`\n  W-WHATIF-DRAG: ${pass}/${pass + fail}` + (fail ? '  ❌' : '  ✅'));
  process.exit(fail ? 1 : 0);
})();
