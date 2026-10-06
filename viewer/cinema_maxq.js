// §MAXQ — Max-Quality Orbiter export (Alt+M).
// Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §MAXQ SPEC (2026-07-19).
// Ports the proven offline PoC loop in-app: each frame is a COMPLETE Alt+S fold (photoshoot
// staging + 16-sample TAA + full §PHOTO_AO converge) captured to a per-feature IDB store, then
// replay-recorded onto a proxy canvas at MAXQ_FPS (MediaRecorder in its real-time happy path —
// the same recorder pattern Cinema Orbit ships with, NOT the frame-starved capture that sank the
// retired TM exporter). Single tab = serial: ~1.3s/frame → 360 frames ≈ 8 min cook + 24s stitch.
(function() {
  'use strict';
  // <split-driver> (readUnsplit() in viewer/tests/_split_families.js rebuilds the original body here)
  // Body split move-only into maxq_buildup_ghost.js, maxq_infra.js, maxq_hud_layers.js, maxq_capture_stitch.js, maxq_start.js (loaded before this file) by scripts/split_closure.js
  // (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md). Each part is a generator: phase 1 (to its `yield`) hoists its
  // functions/vars and publishes shared names on MQS; phase 2 runs its original statements, parts in original order.
  var R = (typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts || {};
  var ORDER = ["buildup_ghost","infra","hud_layers","capture_stitch","start"];
  var missing = ORDER.filter(function (n) { return typeof R[n] !== 'function'; });
  if (missing.length) { console.warn('§SPLIT_PART_MISSING cinema_maxq ' + missing.join(',')); return; }
  var MQS = {};
  var parts = ORDER.map(function (n) { return R[n](MQS); });
  parts.forEach(function (p) { p.next(); });   // phase 1
  parts.forEach(function (p) { p.next(); });   // phase 2
  // </split-driver>
})();
