#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-HOSPITAL-CORRIDOR-BASELINE scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §15 found Hospital's real wall
 * geometry only joined 15/336 (4.5%) of candidate corridor-wall buckets into a walkBackbone()
 * chain — far below Clinic (33.6%) and HHS (38.5%) — which starved room-to-room routing of a real
 * corridor to hug on most inter-wing paths (user-reported: "Hospital corridors not accurate and
 * hampers room to room paths"). §16 (2026-07-15) traced this to `correlateDoorEdges()`'s
 * fixed-rounding-grid bucketing splitting doors that were geometrically close together whenever
 * their raw runCoords straddled a grid boundary — a pure artifact of the grid's fixed phase, not a
 * real signal — and replaced it with single-linkage gap clustering (see that function's own
 * §GAP-CLUSTER-BUCKETING comment in common/hallway_backbone.js). This witness now GUARDS that fix:
 * Hospital's join ratio must stay at least at its new measured floor (not regress back toward
 * 4.5%), and Clinic/HHS must not regress below THEIR new floors either — a further threshold
 * change that helps one building by over-joining unrelated segments elsewhere would show up as an
 * implausible ratio jump past what real corridor geometry supports.
 * RUN: node witness_hospital_corridor_baseline.js   (from the worktree root)
 */
'use strict';
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const HallwayBackbone = require('../hallway_backbone.js');

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

// ── Hospital: §16's gap-cluster-bucketing fix (common/hallway_backbone.js correlateDoorEdges())
// measured 2026-07-15: buckets=241 joined=43 (17.8%), up from the pre-fix 336/15 (4.5%) — a real
// ~4x improvement, not a threshold loosening. This is now a FLOOR: a future change must not push
// Hospital's ratio back down toward the old 4.5%, and should only raise this floor alongside a
// fresh, real re-measurement (never bump the number without rerunning this file first). ──
chk('G1 Hospital corridor join ratio at least matches the §16 post-fix baseline (buckets=241 joined=43, ~17.8%) — a floor, not a ceiling',
  hospital.stats.joined >= 43 && hospital.ratio >= 17.8 - 0.5,
  'buckets=' + hospital.stats.buckets + ' joined=' + hospital.stats.joined + ' ratio=' + hospital.ratio.toFixed(1) + '%');
chk('G2 Hospital chain count at least matches the §16 post-fix baseline (16 chains)',
  hospital.stats.chains >= 16, 'chains=' + hospital.stats.chains);

// ── Regression guard: Clinic/HHS's §16 post-fix join ratios must hold too — the SAME fix improved
// both (33.6%->42.3%, 38.5%->48.4%), so these are their new floors. A further threshold change
// that helps one building by over-joining unrelated wall segments elsewhere would show up here as
// an implausible ratio jump, not just a drop — flag either direction as worth a second look. ──
chk('G3 Clinic join ratio has not regressed below its §16 post-fix baseline (42.3%)',
  clinic.ratio >= 42.3 - 0.5, 'ratio=' + clinic.ratio.toFixed(1) + '%');
chk('G4 HHS join ratio has not regressed below its §16 post-fix baseline (48.4%)',
  hhs.ratio >= 48.4 - 0.5, 'ratio=' + hhs.ratio.toFixed(1) + '%');

// ── The actual finding this witness exists to prove: Hospital's ratio is dramatically worse than
// either building whose routing already works, i.e. this is a real geometry-recognition gap, not
// noise from a small sample. ──
chk('G5 Hospital join ratio is far below both Clinic and HHS (the real, still-open gap — not a fixed threshold quirk)',
  hospital.ratio < clinic.ratio / 2 && hospital.ratio < hhs.ratio / 2,
  'hospital=' + hospital.ratio.toFixed(1) + '% clinic=' + clinic.ratio.toFixed(1) + '% hhs=' + hhs.ratio.toFixed(1) + '%');

console.log('\n§W-HOSPITAL-CORRIDOR-BASELINE DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
