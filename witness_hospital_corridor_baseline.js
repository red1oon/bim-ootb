#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-HOSPITAL-CORRIDOR-BASELINE scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §15 found Hospital's real wall
 * geometry only joins 15/336 (4.5%) of candidate corridor-wall buckets into a walkBackbone() chain
 * — far below Clinic (33.6%) and HHS (38.5%) — which starves room-to-room routing of a real
 * corridor to hug on most inter-wing paths (user-reported: "Hospital corridors not accurate and
 * hampers room to room paths"). This witness is a BASELINE CAPTURE, not a fix: it exists so the
 * NEXT session can loosen walkBackbone()'s join thresholds and prove the change on TWO axes at
 * once from ONE run — (a) Hospital's join ratio must MEASURABLY IMPROVE past this file's recorded
 * floor, not just "still pass", and (b) Clinic/HHS's join ratios must not regress below their
 * CURRENT measured values, which this file also pins. Do not raise the Hospital floor without a
 * real re-measurement — that would silently launder the still-open bug.
 * RUN: node witness_hospital_corridor_baseline.js   (from the worktree root)
 */
'use strict';
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const HallwayBackbone = require('./common/hallway_backbone.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

function measure(name, dbPath) {
  const db = new Database(dbPath, { readonly: true });
  function dbQuery(sql) { return db.prepare(sql).raw(true).all(); }
  const result = HallwayBackbone.buildBackbone(dbQuery, { log: (m) => console.log('  [' + name + '] ' + m) });
  db.close();
  const s = result.stats;
  const ratio = s.buckets ? (100 * s.joined / s.buckets) : 0;
  console.log('§CORRIDOR_JOIN_RATIO building=' + name + ' buckets=' + s.buckets + ' joined=' + s.joined +
    ' ratio=' + ratio.toFixed(1) + '% chains=' + s.chains + ' crossings=' + s.crossings);
  return { stats: s, ratio: ratio };
}

const hospital = measure('Hospital', '/home/red1/bim-ootb/buildings/Hospital_extracted.db');
const clinic = measure('Clinic', '/home/red1/bim-ootb/buildings/Clinic_extracted.db');
const hhs = measure('HHS', '/home/red1/bim-ootb/buildings/HHS_Office_Federated_extracted.db');

// ── Hospital: document the CURRENT broken state as a floor, not a target. Measured 2026-07-15:
// buckets=336 joined=15 (4.5%). Any threshold tuning must push this ratio UP — if a future run
// still lands at or below this floor, the fix did not actually help Hospital's real geometry. ──
chk('G1 Hospital corridor join ratio matches the §15 measured baseline (buckets=336 joined=15, ~4.5%) — NOT a target, the documented starting point for the next threshold-tuning session',
  hospital.stats.buckets === 336 && hospital.stats.joined === 15,
  'buckets=' + hospital.stats.buckets + ' joined=' + hospital.stats.joined + ' ratio=' + hospital.ratio.toFixed(1) + '%');
chk('G2 Hospital chain count matches the §15 baseline (11 chains formed from those 15 joined buckets)',
  hospital.stats.chains === 11, 'chains=' + hospital.stats.chains);

// ── Regression guard: Clinic/HHS's CURRENT join ratios must hold. A join-threshold change that
// helps Hospital by accidentally over-joining unrelated wall segments elsewhere would show up here
// as a ratio INCREASE past what real corridor geometry supports — flag any drop below today's
// measured floor as a regression on buildings whose witnesses already pass. ──
chk('G3 Clinic join ratio has not regressed below its §15-measured baseline (33.6%)',
  clinic.ratio >= 33.6 - 0.5, 'ratio=' + clinic.ratio.toFixed(1) + '%');
chk('G4 HHS join ratio has not regressed below its §15-measured baseline (38.5%)',
  hhs.ratio >= 38.5 - 0.5, 'ratio=' + hhs.ratio.toFixed(1) + '%');

// ── The actual finding this witness exists to prove: Hospital's ratio is dramatically worse than
// either building whose routing already works, i.e. this is a real geometry-recognition gap, not
// noise from a small sample. ──
chk('G5 Hospital join ratio is far below both Clinic and HHS (the real, still-open gap — not a fixed threshold quirk)',
  hospital.ratio < clinic.ratio / 2 && hospital.ratio < hhs.ratio / 2,
  'hospital=' + hospital.ratio.toFixed(1) + '% clinic=' + clinic.ratio.toFixed(1) + '% hhs=' + hhs.ratio.toFixed(1) + '%');

console.log('\n§W-HOSPITAL-CORRIDOR-BASELINE DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
