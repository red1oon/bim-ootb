// ══ §FLYTHRU_DIMENSIONS — measured spans marked in 3D during the fly-through ═════════════════════
// bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §FLYTHRU_DIMENSIONS / §FLYTHRU_SELECTION.
//
// USER'S FRAMING (2026-09-06), which decides the whole design:
//   "not showing the classic measures but again demonstrative of capability - we look for good
//    opportunity ie distance between the two wing blocks as the cam swing them into view, the height
//    of a floor, height of a part of the stairs to the floor. In short any measure that stands out in
//    the scene. Any that is not visible or confusing to note need not be it."
// So the selection criterion is SCREEN-SPACE LEGIBILITY, not how much a coordinator cares about the
// number. A technically valuable measure that reads as a dot is worse than a plain one that reads as
// a big clean line. This supersedes ranking candidates by coordination value.
//
// AND the correction that made this feature possible at all (same user, same day): "there is a lack
// of measures, it is not correct as the Measure blue dots are able to extract lengths." The blue dots
// raycast onto MESH, not onto IfcSpace — Hospital has ZERO extracted IfcSpace rows yet every corridor
// width in it is measurable. A missing semantic entity is not a missing measurement. Everything here
// measures geometry; the schema is only ever used to NAME what was measured.
//
// ONE MECHANISM, every case — "gap casts". THREE.Raycaster.intersectObjects returns EVERY hit along
// the ray, sorted by distance (measure.js:1272 only ever reads hits[0], but the whole list is there).
// Walk consecutive hits; a large empty interval between two of them is a real void with two real
// endpoints. Horizontal across the view = the gap between two wing blocks, or a corridor width.
// Vertical = floor-to-floor, or head clearance under MEP. Same code, different direction.
//
// This also sidesteps the floor-to-floor HOLD in the spec's availability table: deriving it from
// element_transforms columns is untrustworthy (mean-Z and min-Z disagree on Hospital's storey ORDER),
// but MEASURING slab-to-slab off the mesh has no such problem.
function setupCpeFlythruDims(A) {
  'use strict';
  {
    // ── Tunables. Named, not magic: each one implements a clause of the user's own sentence. ──
    var MIN_SPAN_M      = 1.2;    // below this a "gap" is a construction joint, not a feature
    var MAX_SPAN_M      = 120;    // above this the ray has escaped the building into open sky
    var MIN_SCREEN_FRAC = 0.15;   // "stands out": the drawn line must cross >15% of frame width
    var MAX_ALIGN       = 0.80;   // "not confusing": |cos(span, viewDir)| above this reads as a dot
    var EDGE_MARGIN     = 0.06;   // both ends must sit this far inside the frame, in NDC units
    var OCCL_TOL_M      = 0.25;   // camera->endpoint may hit something this much nearer (surface bias)

    // §FLYTHRU_GATE — the four tests, PURE (no scene, no THREE beyond vector maths on plain objects),
    // so the witness can sweep thousands of candidate spans without a GPU or a bake. Returns a score
    // in 0..1 with `pass`, and a `why` naming the FIRST clause that failed — a rejection must be
    // explainable, not a silent drop (§4 of the witness law: a check that cannot say why is not a
    // check). `project` is injected so the test can drive it with a known projection instead of a
    // live camera.
    //   1. on screen   — both endpoints inside the frame with margin
    //   2. long enough — drawn length > MIN_SCREEN_FRAC of frame width
    //   3. unoccluded  — caller supplies hit distances from camera to each endpoint
    //   4. not foreshortened — a span pointing at the camera is a dot, and this kills most bad ones
    A.flythruGate = function (c) {
      var s = { pass: false, score: 0, why: null };
      if (!c || !c.a || !c.b) { s.why = 'no-span'; return s; }
      var lenM = c.lengthM;
      if (!(lenM >= MIN_SPAN_M)) { s.why = 'too-short:' + (lenM || 0).toFixed(2) + 'm'; return s; }
      if (lenM > MAX_SPAN_M) { s.why = 'too-long:' + lenM.toFixed(1) + 'm (ray likely escaped the building)'; return s; }
      // 1. both endpoints on screen, with margin
      var m = EDGE_MARGIN;
      if (c.a.z < 0 || c.b.z < 0) { s.why = 'behind-camera'; return s; }
      if (Math.abs(c.a.x) > 1 - m || Math.abs(c.a.y) > 1 - m ||
          Math.abs(c.b.x) > 1 - m || Math.abs(c.b.y) > 1 - m) { s.why = 'off-screen'; return s; }
      // 2. long enough on screen to read. NDC is -1..1, so an NDC delta of 2 spans the full width.
      var dx = (c.b.x - c.a.x) / 2, dy = (c.b.y - c.a.y) / 2;
      var screenFrac = Math.sqrt(dx * dx + dy * dy);
      if (screenFrac < MIN_SCREEN_FRAC) { s.why = 'too-small-on-screen:' + screenFrac.toFixed(3); return s; }
      // 3. not occluded — the caller measured camera->endpoint; a nearer hit means the dot is behind
      //    something and the number would confuse rather than inform.
      if (c.occludedA || c.occludedB) { s.why = 'occluded'; return s; }
      // 4. not foreshortened
      var align = Math.abs(c.alignToView == null ? 0 : c.alignToView);
      if (align > MAX_ALIGN) { s.why = 'foreshortened:align=' + align.toFixed(2); return s; }
      // Score: reward a long, square-on, well-centred span. Used only to pick the BEST candidate in
      // a shot — never to admit one the gate rejected.
      var centred = 1 - Math.min(1, (Math.abs(c.a.x + c.b.x) / 2 + Math.abs(c.a.y + c.b.y) / 2) / 2);
      s.score = Math.min(1, screenFrac / 0.5) * 0.5 + (1 - align) * 0.3 + centred * 0.2;
      s.pass = true;
      return s;
    };

    // §FLYTHRU_GAPS — the void intervals along one ray. PURE: takes the sorted hit distances the
    // raycaster already produced, returns every gap wide enough to be a feature. Separated from the
    // scene so the witness can prove the interval logic (the part that is actually easy to get wrong)
    // without a renderer. `hits` = ascending distances in metres from the ray origin.
    // `fromOrigin` includes the origin->first-hit interval, which is what head clearance IS (the
    // camera stands in the void; the first thing above is the ceiling or the duct).
    A.flythruGapsAlong = function (hits, fromOrigin) {
      var out = [], i, d0, d1;
      if (!hits || !hits.length) return out;
      if (fromOrigin && hits[0] >= MIN_SPAN_M) out.push({ from: 0, to: hits[0], lengthM: hits[0], kind: 'origin' });
      for (i = 0; i < hits.length - 1; i++) {
        d0 = hits[i]; d1 = hits[i + 1];
        if (d1 - d0 >= MIN_SPAN_M) out.push({ from: d0, to: d1, lengthM: d1 - d0, kind: 'between' });
      }
      return out;
    };

    console.log('§FLYTHRU_DIMS_INIT wired (gate + gap finder; no allocation until a cast runs)');
  }
}
if (typeof window !== 'undefined') window.setupCpeFlythruDims = setupCpeFlythruDims;
