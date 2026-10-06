// effects family — part `cpe_reveal_bands` (original effects.js lines 6680–7756).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/effects.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as FXS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__effectsParts = (typeof window !== 'undefined' ? window : globalThis).__effectsParts || {};
(typeof window !== 'undefined' ? window : globalThis).__effectsParts.cpe_reveal_bands = function* __split_effects_cpe_reveal_bands(FXS, A, renderer, scene, camera) {
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  FXS._cinemaRoundCorners = _cinemaRoundCorners;
  FXS._cinemaBandWaypoints = _cinemaBandWaypoints;
  FXS._cinemaBandFlow = _cinemaBandFlow;
  FXS._cinemaHoseApply = _cinemaHoseApply;
  FXS._cinemaSmoothstep = _cinemaSmoothstep;
  FXS._cinemaEaseFloored = _cinemaEaseFloored;
  FXS._cinemaFanMeshes = _cinemaFanMeshes;
  FXS._cinemaFan = _cinemaFan;
  FXS._cinemaFloorY = _cinemaFloorY;
  FXS._gazeAcquireCap = _gazeAcquireCap;
  FXS._rotToward = _rotToward;
  Object.defineProperty(FXS, 'CINEMA_WALK_MPS', { get: function () { return CINEMA_WALK_MPS; }, set: function (v) { CINEMA_WALK_MPS = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_PULLBACK_MPS', { get: function () { return CINEMA_PULLBACK_MPS; }, set: function (v) { CINEMA_PULLBACK_MPS = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_DIVE_MPS', { get: function () { return CINEMA_DIVE_MPS; }, set: function (v) { CINEMA_DIVE_MPS = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_REVEAL_PULLOUT_SEC', { get: function () { return CINEMA_REVEAL_PULLOUT_SEC; }, set: function (v) { CINEMA_REVEAL_PULLOUT_SEC = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_PACE_SWING', { get: function () { return CINEMA_PACE_SWING; }, set: function (v) { CINEMA_PACE_SWING = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_TURN_DPS', { get: function () { return CINEMA_TURN_DPS; }, set: function (v) { CINEMA_TURN_DPS = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_DIVE_MIN_SEC', { get: function () { return CINEMA_DIVE_MIN_SEC; }, set: function (v) { CINEMA_DIVE_MIN_SEC = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cpeSecOverride', { get: function () { return _cpeSecOverride; }, set: function (v) { _cpeSecOverride = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cpeWp', { get: function () { return _cpeWp; }, set: function (v) { _cpeWp = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cpeBands', { get: function () { return _cpeBands; }, set: function (v) { _cpeBands = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cinemaPrefixCache', { get: function () { return _cinemaPrefixCache; }, set: function (v) { _cinemaPrefixCache = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cpeHose', { get: function () { return _cpeHose; }, set: function (v) { _cpeHose = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cpeReveal', { get: function () { return _cpeReveal; }, set: function (v) { _cpeReveal = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cpeStoreyReveal', { get: function () { return _cpeStoreyReveal; }, set: function (v) { _cpeStoreyReveal = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cpeCorrections', { get: function () { return _cpeCorrections; }, set: function (v) { _cpeCorrections = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_EXIT_FACE_GAIN_GRACEFUL', { get: function () { return CINEMA_EXIT_FACE_GAIN_GRACEFUL; }, set: function (v) { CINEMA_EXIT_FACE_GAIN_GRACEFUL = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_EXIT_FACE_GAIN_RUSHED', { get: function () { return CINEMA_EXIT_FACE_GAIN_RUSHED; }, set: function (v) { CINEMA_EXIT_FACE_GAIN_RUSHED = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cinemaActive', { get: function () { return _cinemaActive; }, set: function (v) { _cinemaActive = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cineFanRay', { get: function () { return _cineFanRay; }, set: function (v) { _cineFanRay = v; }, enumerable: true });
  Object.defineProperty(FXS, 'GAZE_ACQUIRE_MAX', { get: function () { return GAZE_ACQUIRE_MAX; }, set: function (v) { GAZE_ACQUIRE_MAX = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order
 // BVH fan fraction that counts as "genuinely enclosed"

  // ══════════ §CPE_PACING — total duration is DERIVED from real geometry, never a fixed number ══
  // User directive 2026-07-27: "the film's total length should not be a fixed constant... if interior
  // speed is held to a constant m/s, and the exterior pull-back is paced by real distance rather than
  // a fixed duration, then total duration falls out naturally from each building's actual size."
  // Confirmed derived (dive, spin and orbit included) when asked.
  //
  // The model this REPLACES was inverted: total was fixed at nFrames/fps and speed was whatever made
  // the derived walk fit CINEMA_OUT_SEC, so the BIGGER the building the FASTER the camera —
  // measured 2.10 m/s on Duplex against 4.99 on LTU_AHouse. Every rate below is a stated constant
  // and every duration is that rate applied to a MEASURED distance or angle, so a building's size
  // now sets its runtime instead of being squeezed into someone else's.
  // §CPE_PACE_LOS base pace (CINEMA_PATH_EDITOR.md). 1.3 was a literal pedestrian and the user called
  // the result too slow twice. MEASURED from their own runs: a 92.5m Hospital edit spent 71.2s of a
  // 99.5s film walking and baked 1015 frames (~26 min of cook at their measured 1.6s/frame). Their
  // stated expectation is ~15s on Duplex against the 26.1s derived, i.e. ~1.8x faster; 1.3 x 1.8 =
  // 2.34. Stated rate with the arithmetic shown, per this block's own rule that every rate is a
  // stated constant applied to a MEASURED distance — not a taste dial.
  // This is the BASE only. The busyness/noise temperament (§CPE_PACE_LOS, still to build) varies the
  // pace AROUND it within the user's PACE_SWING range; it does not replace this number.
  var CINEMA_WALK_MPS     = 2.3;   // interior pace — was 1.3
  var CINEMA_PULLBACK_MPS = 6.5;   // exterior recede: flying, not walking
  var CINEMA_DIVE_MPS     = 20;    // the approach is a fly-IN; dive distances run 20-150m
  // §CPE_DISCIPLINE_REVEAL pull-out beat (restructure 2026-08-14, bim-compiler prompts/
  // CINEMA_DISCIPLINE_REVEAL.md — see that file's dated section for the full spec). Author's own
  // call, documented there, not user-dictated: 1.5s, matching this file's other beat granularities
  // (the tail's own 2s/discipline slot). Distance is DERIVED from the existing CINEMA_PULLBACK_MPS
  // constant (reused, not a new speed invented) — dist = CINEMA_REVEAL_PULLOUT_SEC * CINEMA_PULLBACK_MPS.
  var CINEMA_REVEAL_PULLOUT_SEC = 1.5;
  // §CPE_DISCIPLINE_REVEAL_FADE (2026-08-16, bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md's
  // dated section). A.filterDiscs/A._applyDiscVisibility (panels.js) is a pure boolean visible
  // toggle across plain/Instanced/BatchedMesh — no per-element opacity channel exists in this
  // pipeline (Instanced/BatchedMesh share ONE material per batch, so animating opacity would fade
  // the WHOLE batch, not just the disc entering/leaving). This is the closest honest approximation
  // to a fade with that real constraint: how long the outgoing and incoming discipline stay visible
  // TOGETHER at each tail-parade boundary before narrowing to just the incoming one. Not a literal
  // dissolve — documented as such in A.cpeRevealVisualAt so it's never mistaken for one later.
  var CPE_REVEAL_FADE_SEC = 0.4;
  // §57.4 (2026-09-11, user: "the ARCH elements should fade off rather than cut off... 2 sec fade
  // be good") — same "both visible together briefly" technique as CPE_REVEAL_FADE_SEC above, applied
  // to the ARC/STR drop-out at ghost-phase onset instead of a parade slot boundary, at the length the
  // user asked for. See A.cpeRevealVisualAt's ghost-phase branch.
  var ARCH_DROP_FADE_SEC = 1.0;   // §57.4b (2026-09-11, user: "even 1 sec as it can be expensive")
  // §57.4b — the instanced/batched majority (no alpha channel, still a boolean cut) fires at the
  // MIDPOINT of the regular-mesh fade (opacity ~50%, inside the user's named 70%-30% band) instead
  // of at the fade's own end, so the bulk pop lands WHILE the visible dissolve is already halfway
  // through — the eye is already tracking a fade in progress, and that fade keeps visibly running
  // for the second half of the window AFTER the bulk vanishes, carrying the transition forward
  // rather than the pop reading as a separate, disconnected event. User: "make it go from 70% to
  // 30% so the cutover gives impression of carry over fade."
  var ARCH_BULK_CUT_FRAC = 0.5;
  // §CPE_NOISE_LAW — the user's ONE pacing dial ("have a speed range… don't overdo it"), and the
  // only knob the noise ratio is allowed to have. Declared here, at module scope, because the law
  // governs EVERY beat: the dive's cost table (built with the plan) and the walk's blended cost
  // both read it, and the walk's copy used to be a local declared 400 lines below the dive.
  // §CPE_PACE_SWING_SOFTEN (2026-08-03) — 1.6 was the SETTLED value out of the widen/narrow jerk
  // trade-off documented above (CINEMA_PATH_EDITOR.md "widen PACE_SWING, accept the stall, or accept
  // more jerk"), but on a real Hospital bake it reads as a genuine over-correction: user, direct
  // tuning request, "soften the noise density×depth ratio that slows the camera walk in busy/dense
  // areas — the slowdown is currently too strict." Measured on Hospital before this change (real
  // §CPE_WALK_BUDGET_NOISE_BLIND line): busy=0.432, swing=1.6 -> busyMult=1.2591, outSec=18.322 (a
  // 29.8m walk raw-budgeted at 14.552s stretched to 18.322s by busyness alone).
  //
  // The user suggested trying 1.3-1.4x — measured, NOT taken as-is: at 1.35 and again at 1.4,
  // witness_cpe_even_turn.js's T5 (§CPE_EVEN_TURN's own fast-side jerk cap, `1.5 * PACE_SWING`)
  // goes RED on Duplex — the walk's real cost-parameterized step hits 3.0x its own mean there, and
  // shrinking the cap below that turns a legitimate fast turn into a flagged discontinuity. This is
  // the same "widen or accept jerk" trade-off the constant's own history already names; narrowing it
  // reopens that trade the other direction. 1.45 is the largest reduction from 1.6 that stays clear
  // of T5 on both regression buildings (Duplex, Terminal) — verified by direct measurement, not
  // picked to make a gate green: 1.4 fails T5 on Duplex, 1.45 does not, on repeated runs.
  // (T6, the SLOW-side floor, is RED at 1.6 too — a pre-existing gap this change did not create and
  // does not fix; out of scope here, noted for whoever picks up §CPE_PACE_FLOOR next.)
  // Keeps the SAME mechanism (busy areas still slow the camera, `w = 1-1/PACE_SWING` in
  // §CPE_EVEN_TURN still derives from this one constant, nothing duplicated) while cutting the
  // busyness CORRECTION (busyMult - 1) by 25%: the same Hospital walk recomputes to
  // busyMult=1.1943, outSec=17.380s (was busyMult=1.2591, outSec=18.322s — measured before/after,
  // prompts/CINEMA_PATH_EDITOR.md 2026-08-03).
  var CINEMA_PACE_SWING = 1.45;
  var CINEMA_TURN_DPS     = 45;    // one rate for BOTH in-place turns: the spin and the orbit lap
  var CINEMA_DIVE_MIN_SEC = 2.5;   // a floor, so a tiny building still gets an arrival rather than a cut
  // §CPE_SETTLE_HOLD (2026-08-04, CORRECTED same day — user: "i never asked for that as it is a
  // user setting in hold field.. so no hard coded"): CINEMA_SPIN_MIN_SEC used to floor EVERY settle
  // at ~1s regardless of whether there was anything to turn toward or any hold configured. The
  // first fix replaced that floor with a small technical minimum (CINEMA_MIN_TURN_SEC, 0.05s) "to
  // avoid a literal zero-length beat" — but that is STILL a hardcoded pause the user never asked
  // for. There is nothing to avoid: `_natTotal` below sums dive+spin+out+rise+orbit, and dive
  // (>=CINEMA_DIVE_MIN_SEC), rise (>=0.5s) and orbit (a fixed 8s) are never zero, so a zero-length
  // spin beat cannot produce a zero-length film or a divide-by-zero anywhere downstream. The spin
  // beat is now PURELY derived: the real time to turn through `_spinDeg` at `CINEMA_TURN_DPS`, plus
  // whatever the user actually typed into the Settle band's Hold field — zero of both is zero.
  var CINEMA_SPIN_MIN_SEC = 0.8;   // kept only as a named historical reference in comments/logs
  // Set by the wrapper when the editor supplies explicit beat seconds; then those win over the
  // derived ones. Nothing else may set it.
  var _cpeSecOverride = false;

  // ══ §CINEMA_PATH_EDITOR — authored path state + corner rounding. Spec:
  // prompts/CINEMA_PATH_EDITOR.md §CINEMA_PATH_EDITOR_MODEL (settled with the user 2026-07-26).
  // _cpeWp is the ONE piece of authored state the plan reads. Null = nothing authored = the plan
  // behaves EXACTLY as it did before this feature existed, which is what makes guardrail 2 ("OK
  // without an edit must be byte-identical to today") true by construction rather than by test.
  var _cpeWp = null;
  var CINEMA_CORNER_ARC_SEGS = 8;    // sample points per rounded corner
  var CINEMA_CORNER_LEG_FRAC = 0.4;  // a corner may never eat more than 40% of either adjoining leg
  // Corner rounding, clearance-bounded (§CINEMA_PATH_EDITOR_MODEL items 5-7). Straight runs pass
  // through verbatim; every interior corner is replaced by a quadratic Bézier that leaves the
  // incoming leg `r` before the waypoint and rejoins the outgoing leg `r` after it, with the
  // waypoint itself as the control point. A quadratic Bézier's furthest excursion from its control
  // point is at u=0.5 and equals 0.25·r·|b̂−â| ≤ r/2 — so the flown curve can never stray more than
  // HALF the measured clearance from the point the user placed. That bound is the G8 claim, and it
  // is why `r` may be taken straight from _cinemaFan.min with no safety fudge factor invented on top.
  function _cinemaRoundCorners(wp) {
    if (!wp || wp.length < 3) return (wp || []).slice();
    var out = [{ x: wp[0].x, y: wp[0].y, z: wp[0].z }], rounded = 0, rMin = 1e9, rMax = 0, unmeasured = 0;
    for (var i = 1; i < wp.length - 1; i++) {
      var p0 = wp[i - 1], p1 = wp[i], p2 = wp[i + 1];
      var ax = p1.x - p0.x, ay = p1.y - p0.y, az = p1.z - p0.z;
      var bx = p2.x - p1.x, by = p2.y - p1.y, bz = p2.z - p1.z;
      var aL = Math.hypot(ax, ay, az), bL = Math.hypot(bx, by, bz);
      if (aL < 1e-4 || bL < 1e-4) { out.push({ x: p1.x, y: p1.y, z: p1.z }); continue; }
      // A waypoint the path runs straight through is not a corner — leave it alone rather than
      // spend a BVH fan on it.
      var dot = (ax * bx + ay * by + az * bz) / (aL * bL);
      var turnDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
      if (turnDeg < 3) { out.push({ x: p1.x, y: p1.y, z: p1.z }); continue; }
      // MEASURED clearance at this corner. Fallback is CINEMA_FAN_NUDGE_MAX — an existing constant
      // that already means "how far the camera may slide about inside a room" — not a new number.
      //
      // ⚠ NO-HIT IS NOT A MEASUREMENT (live Hospital log, 2026-07-27). `_cinemaFan` returns
      // CINEMA_FAN_FAR for a ray that hits nothing, so a fan that hits nothing AT ALL reports
      // min=60.0 — which reads as "60 metres of clearance" but actually means "unknown, the BVH saw
      // no geometry here." Taking it at face value let the rounding radius fall through to the
      // 40%-of-leg cap and cut 7.50m inside a point the user had placed by hand, while G8 passed
      // vacuously by comparing that cut against the same fictional 60m. Treat a full no-hit fan as
      // UNKNOWN and fall back to the same conservative nudge budget as an outright fan failure.
      var clear = FXS.CINEMA_FAN_NUDGE_MAX, clearSrc = 'no-bvh';
      try {
        var fanC = _cinemaFan({ x: p1.x, y: p1.y, z: p1.z }, 8);
        if (fanC && isFinite(fanC.min)) {
          if (fanC.min >= FXS.CINEMA_FAN_FAR - 0.01) { clearSrc = 'unknown(no-hit)'; }
          else { clear = fanC.min; clearSrc = 'measured'; }
        }
      } catch (eC) { /* no BVH yet → the existing nudge budget stands in */ }
      if (clearSrc !== 'measured') unmeasured++;
      var r = Math.min(clear, aL * CINEMA_CORNER_LEG_FRAC, bL * CINEMA_CORNER_LEG_FRAC);
      if (!(r > 0.01)) { out.push({ x: p1.x, y: p1.y, z: p1.z }); continue; }
      rounded++; rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
      var pA = { x: p1.x - ax / aL * r, y: p1.y - ay / aL * r, z: p1.z - az / aL * r };
      var pB = { x: p1.x + bx / bL * r, y: p1.y + by / bL * r, z: p1.z + bz / bL * r };
      out.push(pA);
      for (var s = 1; s < CINEMA_CORNER_ARC_SEGS; s++) {
        var u = s / CINEMA_CORNER_ARC_SEGS, iu = 1 - u;
        out.push({ x: iu * iu * pA.x + 2 * iu * u * p1.x + u * u * pB.x,
                   y: iu * iu * pA.y + 2 * iu * u * p1.y + u * u * pB.y,
                   z: iu * iu * pA.z + 2 * iu * u * p1.z + u * u * pB.z });
      }
      out.push(pB);
    }
    var last = wp[wp.length - 1];
    out.push({ x: last.x, y: last.y, z: last.z });
    // Throttled: a live drag re-plans on every pointermove, and an unthrottled line here flooded a
    // real user's console with dozens of identical rows per second (observed Hospital, 2026-07-27).
    // Log only when the shape actually changes, plus at most once a second.
    var sig = wp.length + '|' + out.length + '|' + rounded + '|' + rMax.toFixed(2) + '|' + unmeasured;
    var nowMs = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (sig !== _cornersLastSig || nowMs - _cornersLastMs > 1000) {
      _cornersLastSig = sig; _cornersLastMs = nowMs;
      console.log('§CINEMA_CORNERS control=' + wp.length + ' flown=' + out.length + ' rounded=' + rounded +
        ' rMin=' + (rounded ? rMin.toFixed(2) : 'n/a') + ' rMax=' + (rounded ? rMax.toFixed(2) : 'n/a') +
        ' maxDeviation=' + (rounded ? (rMax / 2).toFixed(2) : '0.00') + 'm' +
        ' unmeasuredCorners=' + unmeasured + '/' + rounded +
        (unmeasured ? ' (fan saw no geometry — radius capped at the ' + FXS.CINEMA_FAN_NUDGE_MAX + 'm nudge budget, NOT treated as ' + FXS.CINEMA_FAN_FAR + 'm of space)' : ' (bound=measured clearance/2)'));
    }
    return out;
  }
  var _cornersLastSig = '', _cornersLastMs = 0;
  A.cinemaRoundCorners = _cinemaRoundCorners;   // witness G7/G8 read this directly

  // ══════════ §CPE_BANDS — rigid straight bands + tangent-matched connectors ══════════
  // Spec: prompts/CINEMA_PATH_EDITOR.md §CPE_BANDS (settled with the user 2026-07-27).
  //
  // A band is a SHORT STRAIGHT segment: {c:{x,y,z} centre, d:{x,y,z} unit direction, len}. User's
  // words: "the bands are short straight parts of the path. When they are moved their length and
  // straightness does not morph." So the band is rigid — dragging an end ROTATES it about the far
  // end, dragging the middle TRANSLATES it, and nothing ever bends or resizes it.
  //
  // WHY bands rather than points: a point carries position only. A band's two ends are a TANGENT,
  // and tangents are what actually shape a curve — "by manipulating that, u can have creative
  // curves". Three bands = six waypoints, but stored and edited as three (user: "in a way the 3
  // bands are actually 6 waypoints... but efficiently folded into 3").
  var _cpeBands = null;
  // §CPE_REPLAN_LAZY (CINEMA_DELIGHT_BATCH.md:40-66 spec; CPE_4D_PERF_MEM_FINDINGS.md §3-R3 —
  // Witness: witness_cpe_replan_lazy.js): the plan prefix (§CINEMA_SPACE candidate scan +
  // §CINEMA_DIVE settle + §CINEMA_EXIT door scoring/route) depends only on the MODEL and the
  // camera basis — §CPE_PREVIEW_DIVERGENCE pins the basis at editor open, so during an editing
  // session the prefix recomputed byte-identically on every band drag (~550ms of the measured
  // 600-1000ms §CPE_REPLAN_SLOW, 8 consecutive drags byte-identical on Terminal). Cache it keyed
  // on (building, _metaGen, camPos, yaw0, pitch0); a key change or A.cinemaPrefixInvalidate()
  // (the "re-derive entry" control) recomputes. The cached §CINEMA_DIVE/§CINEMA_EXIT lines are
  // replayed VERBATIM on a hit — witness_cpe_preview_divergence.js parses them for equality, and
  // equality is exactly what the cache guarantees.
  var _cinemaPrefixCache = null;
  // §CPE_HOSE (spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_HOSE, user 2026-07-28: "what if
  // we make the whole path editable... just dragging a point where the whole path is like a long
  // rubber hose, reacting only by proximity to the point been dragged, and the rest just curves
  // along"). A list of drag OPERATIONS layered on the derived path — never a stored polyline. See
  // _cinemaHoseApply for the arc-length law and §CPE_BANDS rule 6 for why operations, not points.
  var _cpeHose = null;
  // §CPE_DISCIPLINE_REVEAL (bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md, Mechanism C) — whether
  // this bake inserts the retrace reveal round between the walk and the closing orbit. Same wrapper
  // pattern as _cpeHose/_cpeBands above: set from ov.reveal in A.cinemaPathPlan, read inside
  // _cinemaPathPlan's own closure, saved/restored around the call so it never leaks between plans.
  var _cpeReveal = false;
  // §STOREY_HIGHLIGHT_REVEAL (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md, 2026-09-06) — whether
  // this bake highlights each storey in sequence during the last 5 real seconds of the `pullback`
  // beat, ending exactly where `orbit` begins (measured §STOREY_REVEAL_WINDOW below — NOT the orbit
  // beat itself). Same wrapper pattern as _cpeReveal directly above: set from ov.storeyReveal in
  // A.cinemaPathPlan, read inside _cinemaPathPlan's own closure, saved/restored around the call so it
  // never leaks between plans. The per-frame color/caption/stats logic itself lives in
  // cpe_storey_reveal.js (A.storeyRevealVisualAt etc.) — this flag + the precomputed windowFrac say
  // whether/where that window is armed for THIS bake.
  var _cpeStoreyReveal = false;
  // §CPE_CONE_ORIENT_ADJUST (bim-compiler prompts/CINEMA_PATH_EDITOR.md, 2026-08-27) — a small list of
  // ANCHORED gaze corrections, independent of bands: each is {pos:{x,y,z}, dir:{x,y,z}, ramp, hold,
  // decay} (world anchor, corrected unit direction, arc-length meters for the ease-in/hold/ease-out
  // envelope). Not band-indexed like `lookAt` — the cone's position is scrub-driven and may sit
  // anywhere along the walk, not necessarily at a band — so this rides its OWN small array on the
  // override, same wrapper pattern as _cpeHose/_cpeBands/_cpeReveal above: set from ov.aimCorrections
  // in A.cinemaPathPlan, read inside _cinemaPathPlan's own closure, saved/restored around the call.
  var _cpeCorrections = null;
  // §CPE_DISCIPLINE_REVEAL — real, measured element counts, same 3-representation enumeration
  // A.filterDiscs already uses (panels.js §NAV_FIND_002) — never an invented discipline list.
  // Outer-scope and A.-exposed (not nested inside _cinemaPathPlan) so BOTH the plan builder here AND
  // cinema_path_editor.js's own _naturalDuration() (the client-side seconds estimate that drives the
  // bake's frame count) read the exact same list — one implementation, not two kept in sync by hand.
  // §REVEAL_SHELL (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §REVEAL_SHELL): the ONE owner of what the reveal hides as the
  // "shell". A building's shell is its architecture + structure; a road's shell is also its pavement (ROAD) — with only ARC/STR
  // hidden, a road's ghost round hid the bridge and nothing along the road. Gate: A.isCivilModel(); buildings unchanged.
  // §ALTC_V2 V6: one owner for "the reveal plays inside the drive" (road films) — the editor's duration estimate reads it.
  A.cpeRevealInDrive = function() { return typeof A.isCivilModel === 'function' && A.isCivilModel(); };
  A.cpeRevealShellDiscs = function() {
    var civil = typeof A.isCivilModel === 'function' && A.isCivilModel();
    return civil ? ['ARC', 'STR', 'ROAD'] : ['ARC', 'STR'];
  };
  A.cpeRevealDiscsPresent = function() {
    var counts = {}, shell = {};
    A.cpeRevealShellDiscs().forEach(function(d) { shell[d] = 1; });
    function bump(d) { if (d && !shell[d]) counts[d] = (counts[d] || 0) + 1; }
    if (typeof A.collectMeshes === 'function') {
      A.collectMeshes(function(o) { return o.isMesh && o.userData && o.userData.disc; })
        .forEach(function(o) { bump(o.userData.disc); });
    }
    var _bmId, _imId;
    for (_bmId in (A._batchMeta || {})) A._batchMeta[_bmId].forEach(function(m) { bump(m.disc); });
    for (_imId in (A._instanceMeta || {})) A._instanceMeta[_imId].forEach(function(m) { bump(m.disc); });
    var discs = Object.keys(counts);
    // §CPE_DISCIPLINE_REVEAL_ORDER (2026-08-16, bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md's
    // dated section). Sort ascending by real average element bbox volume (element_transforms.bbox_x/
    // y/z, guid-joined to elements_meta — the ONLY per-element size data this schema carries;
    // elements_meta itself has no dimension column, confirmed by a read-only extraction check before
    // this was written, not assumed). Finest-grained (smallest average element) disciplines reveal
    // FIRST, while the viewer's attention is freshest. The literal 'MEP' discipline code is forced to
    // the LAST position regardless of its measured size — user's own framing 2026-08-16: MEP reads as
    // "most easily sighted" (large ducts/pipes/cable-trays are obvious even glimpsed briefly), so it
    // doesn't need the early slot the way small/fine disciplines do. Degrades to the original
    // unordered list if A.dbQuery is unavailable or the query fails — DEGRADE, DON'T DISABLE, same
    // rule A.cpeRevealDiscQtyCost (below) already follows.
    if (discs.length > 1 && typeof A.dbQuery === 'function') {
      try {
        var inList = discs.map(function(d) { return "'" + d.replace(/'/g, "''") + "'"; }).join(',');
        var rows = A.dbQuery('SELECT m.discipline, AVG(t.bbox_x * t.bbox_y * t.bbox_z) FROM elements_meta m ' +
          'JOIN element_transforms t ON m.guid = t.guid WHERE m.discipline IN (' + inList + ') ' +
          'AND t.bbox_x IS NOT NULL AND t.bbox_x > 0 GROUP BY m.discipline');
        var avgVol = {};
        (rows || []).forEach(function(r) { avgVol[r[0]] = +r[1]; });
        discs.sort(function(a, b) {
          if (a === 'MEP' && b !== 'MEP') return 1;
          if (b === 'MEP' && a !== 'MEP') return -1;
          var va = avgVol[a], vb = avgVol[b];
          if (va == null && vb == null) return 0;
          if (va == null) return 1;   // no size data for this discipline -> push to end, never invent a rank
          if (vb == null) return -1;
          return va - vb;
        });
        console.log('§CPE_REVEAL_DISC_ORDER [' + discs.map(function(d) {
          return d + '=' + (avgVol[d] != null ? avgVol[d].toFixed(3) : 'n/a'); }).join(',') + ']');
      } catch (e) {
        console.warn('§CPE_REVEAL_DISC_ORDER query failed, using unordered fallback: ' + e.message);
      }
    }
    return discs;
  };
  // §CPE_DISCIPLINE_REVEAL_PULLOUT (restructure 2026-08-14, bim-compiler prompts/
  // CINEMA_DISCIPLINE_REVEAL.md's dated section — supersedes the there-and-back Mechanism C shape).
  // pure function of (plan, tNorm): which visual phase, if any, this instant falls in. Called
  // identically from the bake loop (cinema_maxq.js) and the preview loop (cinema_path_editor.js's
  // _previewFly) so the two can never diverge — same "one poseAt, no state leakage either direction"
  // property this file already relies on elsewhere (§CPE_AIM_SIMPLIFY).
  // Four zones inside [b.out, b.rise]:
  //   pull-out  (b.out .. b.pullout)  — plain, no override (author's call, see spec file: a short
  //                                     transition beat, not part of either "round").
  //   fly-back  (b.pullout .. b.flyback) — plain, ARC/STR STILL SOLID. §CPE_REVEAL_ARCH_HOLD
  //                                     (2026-09-03, user): the retrace happens with the building
  //                                     COMPLETE and LIT, and that is the point of it — it reads
  //                                     against the gloomy first pass, when lighting was not yet
  //                                     installed. The ghost used to start here; it no longer does.
  //   round 2   (b.flyback .. b.reveal) — 'ghost': ARC/STR fully hidden, every non-ARC/STR discipline
  //                                     shown together — the original ghost phase, now beginning at
  //                                     the FIRST STICK where round 2 actually commences.
  //                                     §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16) added the
  //                                     fly-back sub-beat inside the old span; §CPE_REVEAL_ARCH_HOLD
  //                                     (2026-09-03) split it back out, so the ghost boundary moved
  //                                     from b.pullout to b.flyback, and
  //                                     poseAt's camera motion inside it gained a sub-beat, so no
  //                                     edit was needed in THIS function for that change.
  //   rise/tail (b.reveal .. b.rise, first rv.tailSec seconds) — 'tail-one'/'tail-all': the disc
  //             parade, folded into the EXISTING rise beat's own time budget (see poseAt below —
  //             the camera motion there is the unmodified _beat4Pose, never a new motion).
  //   rise proper (remainder of b.reveal..b.rise) — null: ARC/STR solid again, normal room titles.
  A.cpeRevealVisualAt = function(plan, tNorm) {
    var b = plan && plan.beats, rv = plan && plan.reveal;
    // §ALTC_V2 V6 (CIVIL_HIGHWAY_JELAPANG.md §ALTC_V2): a road film's parade plays INSIDE the drive's second half — n slots
    // of one discipline + one all-together slot, equal shares of [a, b], the shell (A.cpeRevealShellDiscs) hidden throughout.
    if (b && rv && rv.inDrive && rv.discs && rv.discs.length) {
      var _ia = rv.inDrive.a, _ib = rv.inDrive.b;
      if (!(_ib > _ia) || tNorm <= _ia || tNorm >= _ib) return null;
      var _in = rv.discs.length, _per = (_ib - _ia) / (_in + 1), _ix = Math.floor((tNorm - _ia) / _per);
      if (_ix >= _in) return { phase: 'tail-all', discs: rv.discs.slice() };
      var _slotSec = (tNorm - _ia - _ix * _per) * (plan.durationSec || 0);
      return { phase: 'tail-one', discs: [rv.discs[_ix]],
               visDiscs: (_slotSec < CPE_REVEAL_FADE_SEC && _ix > 0) ? [rv.discs[_ix - 1], rv.discs[_ix]] : [rv.discs[_ix]] };
    }
    if (!b || !rv || !rv.discs || !rv.discs.length || !(b.reveal > b.out)) return null;
    if (tNorm <= b.out) return null;
    var tP = (b.pullout != null && b.pullout > b.out) ? b.pullout : b.out;
    // §CPE_REVEAL_ARCH_HOLD (2026-09-03, user): the ghost must NOT start when the fly-back starts.
    // On the way back everything is built AND lit, and that fully-lit read is the payoff against the
    // gloomy first pass (where lighting legitimately was not installed yet). Stripping ARC/STR at
    // b.pullout threw that away. Ghost now begins at b.flyback — the instant the camera is back on
    // the FIRST STICK, where round 2 properly commences. HUD highlights are unaffected: they are
    // driven from cinema_maxq's own reveal-round boundary, not from this function.
    // DEGRADE, DON'T DISABLE: a plan without b.flyback falls back to tP, i.e. byte-identical to the
    // previous behaviour — same rule cpeRevealDiscQtyCost above already follows.
    var tF = (b.flyback != null && b.flyback > tP) ? b.flyback : tP;
    if (tNorm <= tF) return null;                              // pull-out + fly-back: ARC/STR SOLID
    if (tNorm <= b.reveal) {
      // §57.4/§57.4b — ARC/STR stay in visDiscs (what A.cpeRevealApplyVisual actually shows,
      // the boolean cut for Instanced/BatchedMesh) only through the MIDPOINT of the fade window —
      // A.cpeArchFadeApplyVisual's regular-mesh opacity ramp keeps running past that point to the
      // window's own end, so the visible dissolve carries on after the bulk cut instead of ending
      // there. `discs` (the caption identity) is untouched — the caption never claimed ARC/STR.
      var fadeFrac = (plan.durationSec > 0) ? ARCH_DROP_FADE_SEC / plan.durationSec : 0;
      var inArchFade = tNorm <= tF + fadeFrac * ARCH_BULK_CUT_FRAC;
      return { phase: 'ghost', discs: rv.discs.slice(),
               visDiscs: inArchFade ? rv.discs.concat(A.cpeRevealShellDiscs()) : rv.discs.slice() };
    }  // round 2
    if (!(b.rise > b.reveal)) return null;
    var riseSpanSec = (rv.riseSec || 0) + (rv.tailSec || 0);
    if (!(riseSpanSec > 0)) return null;
    var wSec = (tNorm - b.reveal) / (b.rise - b.reveal) * riseSpanSec;
    if (wSec >= rv.tailSec) return null;                        // rise proper: ARC/STR solid again
    var perDisc = 2, n = rv.discs.length;
    var idx = Math.floor(wSec / perDisc);
    if (idx >= n) return { phase: 'tail-all', discs: rv.discs.slice() };
    // §CPE_DISCIPLINE_REVEAL_FADE (2026-08-16): `discs` (caption/key identity) always names the
    // CURRENT slot's own discipline — the caption must never show the outgoing one. `visDiscs` (what
    // A.cpeRevealApplyVisual actually shows) widens to include the PREVIOUS slot's discipline for the
    // first CPE_REVEAL_FADE_SEC of a new slot (idx===0 has no previous slot to overlap with), so the
    // hard swap softens into a brief overlap instead of an instant cut.
    var slotFrac = wSec - idx * perDisc;
    var visDiscs = (slotFrac < CPE_REVEAL_FADE_SEC && idx > 0)
      ? [rv.discs[idx - 1], rv.discs[idx]] : [rv.discs[idx]];
    return { phase: 'tail-one', discs: [rv.discs[idx]], visDiscs: visDiscs };
  };
  // §CPE_DISCIPLINE_REVEAL — a discipline code's human-readable label, reused (not invented) from
  // A.PHASE_MAP (config.js), which already carries friendly names for the common trades
  // ('3-Electrical', '3-Fire Protection', ...) keyed by the SAME discipline codes A.DISC_COLORS/
  // cpeRevealDiscsPresent use. Strips the leading "N-" sort prefix. A discipline PHASE_MAP has no
  // entry for (SAN/VENT/HEAT/VOID are real DISC_COLORS codes with none) degrades to the raw code,
  // never a fabricated label.
  A.cpeRevealDiscLabel = function(d) {
    var p = A.PHASE_MAP && A.PHASE_MAP[d];
    return (p && p.phase) ? p.phase.replace(/^\d+-/, '') : d;
  };
  // §CPE_DISCIPLINE_REVEAL — "good touch" nice-to-have (spec file, 2026-08-14 restructure): a
  // discipline's live element COUNT, and a ROUGH cost estimate reusing A.MATERIAL_COSTS' EXISTING
  // per-ifc_class rates as-is (no new rate invented). This is COUNT × rate per class, summed — NOT
  // the unit-aware linear/area BOQ calculation boq_charts.html already does (bbox-derived length/
  // area quantities via qto_cache) — that is real, more accurate, separate work, named as a
  // follow-on in the spec file rather than reproduced here. Queried once per plan build (cheap:
  // rarely more than a dozen disciplines) via the SAME A.dbQuery elements_meta pattern
  // cpe_room_title.js's _storeyLadderForGroups already uses, cached on plan.reveal so the tail's
  // per-frame caption draw never re-queries the DB.
  A.cpeRevealDiscQtyCost = function(discs) {
    var out = {};
    if (!discs || !discs.length || typeof A.dbQuery !== 'function') return out;
    discs.forEach(function(d) { out[d] = { count: 0, cost: 0 }; });
    try {
      var inList = discs.map(function(d) { return "'" + d.replace(/'/g, "''") + "'"; }).join(',');
      var rows = A.dbQuery('SELECT discipline, ifc_class, COUNT(*) FROM elements_meta ' +
        'WHERE discipline IN (' + inList + ') GROUP BY discipline, ifc_class');
      (rows || []).forEach(function(r) {
        var d = r[0], cls = r[1], n = +r[2];
        if (!out[d]) return;
        out[d].count += n;
        var mc = A.MATERIAL_COSTS[cls];
        if (mc) out[d].cost += n * mc.rate;   // rough: per-element rate, not the unit-aware qty BOQ uses
      });
    } catch (e) { console.warn('§CPE_REVEAL_DISC_QTY_COST query failed: ' + e.message); }
    return out;
  };
  // §CPE_DISCIPLINE_REVEAL — pure function of (plan, tNorm): the caption that REPLACES the room
  // title during the tail's disc-parade slots ('tail-one'/'tail-all'). Returns null everywhere else
  // (round 1, pull-out, round 2, rise proper) so the caller falls through to the NORMAL room-title
  // lookup — room titles are untouched outside the tail, per the spec's item 3. Called identically
  // from the bake (cinema_maxq.js) and the preview tick (cpe_room_title.js's roomTitleLiveTick), same
  // "one pure function, two callers" discipline as cpeRevealVisualAt/cpeRevealApplyVisual above.
  A.cpeRevealCaptionAt = function(plan, tNorm) {
    var vis = A.cpeRevealVisualAt ? A.cpeRevealVisualAt(plan, tNorm) : null;
    if (!vis || (vis.phase !== 'tail-one' && vis.phase !== 'tail-all')) return null;
    var rv = plan.reveal, qc = rv && rv.qtyCost;
    var name;
    if (vis.phase === 'tail-all') {
      name = 'All Disciplines';
    } else {
      var d = vis.discs[0];
      name = A.cpeRevealDiscLabel(d);
      var q = qc && qc[d];
      if (q && q.count) {
        name += ' — ' + q.count + ' element' + (q.count === 1 ? '' : 's');
        if (q.cost > 0) name += ', ~' + Math.round(q.cost).toLocaleString();
      }
    }
    return { name: name, opacity: 1 };
  };
  // Applies the state above to the live scene via A.filterDiscs (panels.js §NAV_FIND_002) — reused
  // as-is, not forked. Snapshots whatever discipline filter the user already had active (Role filter,
  // Find isolate, ...) on first entering the round, and restores EXACTLY that on exit — never a blind
  // "show everything" that would clobber an unrelated filter the user had running before the bake/
  // preview started. Skips the (scene-traversing) _applyDiscVisibility call entirely when nothing
  // actually changed since the last tick — cheap to call every frame.
  A._cpeRevealSavedHidden = null;
  A._cpeRevealVisualKey = null;
  // ══ §CPE_TAIL_LIGHTS_ALL_ONLY (2026-09-04, user) ═══════════════════════════════════════════════
  // USER, on a real bake: "during last part each DISCipline reveal, the lights are all turned ON that
  // obscures the delicate items scene. Should turn on only during ALL DISCs."
  // The disc parade shows ONE discipline at a time ('tail-one'), and the whole point of those slots
  // is to read a single trade's delicate geometry on its own. The staged luminaires were lit through
  // all of it — and the fixtures doing the lighting are themselves hidden by filterDiscs on every
  // slot that is not their own, so the room was being washed out by lamps that were not even on
  // screen. The final all-together slot ('tail-all') is where a lit building is the point.
  // ONE pure function, so the bake, the preview and the witness cannot hold different opinions about
  // which slots are lit — same "one pure function, two callers" discipline cpeRevealVisualAt keeps.
  // Everything OUTSIDE the tail (round 1, pull-out, fly-back, round 2, rise proper) is unchanged:
  // null phase means "not the parade", and the lights stay exactly as they were.
  A.cpeRevealLightsOffAt = function(plan, tNorm) {
    var st = (plan && A.cpeRevealVisualAt) ? A.cpeRevealVisualAt(plan, tNorm) : null;
    return !!(st && st.phase === 'tail-one');
  };
  // §57.4-REAL-FADE / §57.4b (2026-09-11) — the visDiscs-overlap technique above only ever
  // DELAYED the boolean cut (A._applyDiscVisibility has no opacity concept at all, confirmed by
  // reading it — §CPE_DISCIPLINE_REVEAL_FADE's own comment already says so): ARC/STR stayed fully,
  // normally visible for the whole window and then vanished instantly — not a dissolve, just a
  // postponed cut. REGULAR (non-Instanced/BatchedMesh) meshes CAN take a real per-object opacity
  // ramp; Instanced/BatchedMesh cannot (no alpha channel in instanceColor / the batched colours
  // texture — verified against viewer/lib/three.core.min.js directly, same check §57.2 already
  // did for a different reason). So: regular ARC/STR meshes get a genuine 1.0->0.0 fade over the
  // WHOLE ARCH_DROP_FADE_SEC window (now 1.0s — user: "even 1 sec as it can be expensive");
  // Instanced/BatchedMesh ARC/STR is cut via the existing visDiscs boolean path, but user-timed to
  // fire at ARCH_BULK_CUT_FRAC (the window's own midpoint, ~50%, inside the user's named 70%-30%
  // opacity band) rather than the window's end — the regular-mesh fade keeps visibly running for
  // the SECOND half of the window after the bulk pop, carrying the transition forward instead of
  // the pop reading as its own disconnected event. Materials are CLONED (per distinct original,
  // deduped) before animating opacity — never written in place — because materials in this viewer
  // are SHARED/cached (A._matCache), the exact bug §STOREY_REVEAL_TINT_SHARED_MATERIAL already
  // found and fixed for the storey-reveal tint; this reuses that same discipline.
  var _archFadeTouched = [], _archFadeMatMap = null;
  function _archFadeRestore() {
    _archFadeTouched.forEach(function(t) { t.mesh.material = t.orig; });
    _archFadeTouched = [];
    if (_archFadeMatMap) { _archFadeMatMap.forEach(function(cl) { try { cl.dispose(); } catch (e) {} }); _archFadeMatMap = null; }
  }
  A.cpeArchFadeApplyVisual = function(plan, tNorm) {
    var b = plan && plan.beats;
    if (!b || typeof A.collectMeshes !== 'function') { if (_archFadeTouched.length) _archFadeRestore(); return; }
    var tP = (b.pullout != null && b.pullout > b.out) ? b.pullout : b.out;
    var tF = (b.flyback != null && b.flyback > tP) ? b.flyback : tP;
    var fadeFrac = (plan.durationSec > 0) ? ARCH_DROP_FADE_SEC / plan.durationSec : 0;
    var inWindow = fadeFrac > 0 && b.reveal > tF && tNorm > tF && tNorm <= tF + fadeFrac;
    if (!inWindow) { if (_archFadeTouched.length) _archFadeRestore(); return; }
    if (!_archFadeTouched.length) {
      _archFadeMatMap = (typeof Map !== 'undefined') ? new Map() : null;
      var _shellSet = {}; A.cpeRevealShellDiscs().forEach(function(d) { _shellSet[d] = 1; });
      A.collectMeshes(function(o) { return o.isMesh && _shellSet[o.userData.disc]; }).forEach(function(o) {
        if (!o.material || Array.isArray(o.material) || !o.material.clone) return;
        var orig = o.material, cl = _archFadeMatMap ? _archFadeMatMap.get(orig) : null;
        if (!cl) { cl = orig.clone(); cl.transparent = true; if (_archFadeMatMap) _archFadeMatMap.set(orig, cl); }
        _archFadeTouched.push({ mesh: o, orig: orig });
        o.material = cl;
      });
      console.log('§CPE_ARCH_FADE start meshesTouched=' + _archFadeTouched.length +
        ' clonedMaterials=' + (_archFadeMatMap ? _archFadeMatMap.size : 0) +
        ' — Instanced/BatchedMesh ARC/STR (no alpha channel) stay on the delayed-cut path');
    }
    var u = (tNorm - tF) / fadeFrac, op = Math.max(0, 1 - u);   // 1 at tF, 0 at tF+ARCH_DROP_FADE_SEC
    if (_archFadeMatMap) _archFadeMatMap.forEach(function(cl) { cl.opacity = op; });
  };

  A.cpeRevealApplyVisual = function(plan, tNorm) {
    if (typeof A.filterDiscs !== 'function' || !A.hiddenDiscs) return;
    var st = plan ? A.cpeRevealVisualAt(plan, tNorm) : null;
    // §CPE_DISCIPLINE_REVEAL_FADE: key on visDiscs (what's actually SHOWN), not discs (the caption
    // identity) — within a single tail-one slot, discs[0] never changes but visDiscs does (drops the
    // overlap partner after CPE_REVEAL_FADE_SEC), and that drop must still re-trigger filterDiscs.
    var shown = (st && st.visDiscs) || (st && st.discs);
    var key = st ? (st.phase + ':' + shown.join(',')) : '';
    // §CPE_REVEAL_LEAK (2026-09-19, red1: "Go look at Hospital after topout freeze ... refer WITNESS
    // logging") — the slot-change key below is the right gate for RE-FILTERING, and the wrong one for
    // WATCHING. A discipline that the round hid can be put back by something else without the slot
    // ever changing, and the load-path freeze does exactly the kind of thing that would:
    // §LOADPATH_BATCH_UNPACK unpacks 4,899 batched containers into 63,182 clones at topout and its
    // restore shows all 4,899 again (Hospital's own numbers; HHS has 419 meshes total and never
    // meets this). So while the round is up, re-count every ~2 s of film REGARDLESS of the key, and
    // say so the moment a discipline is visible that was not asked for. Counting only, no filtering
    // — if this fires, the round's own state was fine and something downstream re-showed it, which
    // is the opposite fix from "filterDiscs never hid it" and cannot be told apart without this.
    if (st && shown && shown.length) {
      var _nowT = (typeof tNorm === 'number') ? tNorm : 0;
      if (A._cpeRevealLeakAt == null || Math.abs(_nowT - A._cpeRevealLeakAt) > 0.008) {
        A._cpeRevealLeakAt = _nowT;
        try {
          var _ask = {}, _leak = {};
          shown.forEach(function (d) { _ask[d] = 1; });
          if (typeof A.collectMeshes === 'function') {
            A.collectMeshes(function (o) { return o.isMesh && o.userData && o.userData.disc; })
              .forEach(function (o) {
                if (!o.visible || _ask[o.userData.disc]) return;
                _leak[o.userData.disc] = (_leak[o.userData.disc] || 0) + 1;
                if (/[?&]revealtrap=1/.test(location.search) && (_leak.__n = (_leak.__n || 0) + 1) <= 6) (_leak.__who = _leak.__who || []).push((o.userData.ifcClass || '-') + ':' + (o.name || '-') + ':' + (o.isBatchedMesh ? 'batched' : o.isInstancedMesh ? 'inst' : 'mesh') + (o.__revealTrap ? ':trapped' : ':untrapped'));
              });
          }
          var _leakWho = _leak.__who; delete _leak.__who; delete _leak.__n;
          var _leakKeys = Object.keys(_leak);
          if (_leakKeys.length) {
            console.log('§CPE_REVEAL_LEAK tNorm=' + _nowT.toFixed(4) + ' slot=' + key +
              ' asked=[' + shown.join(',') + '] LEAKED=' + JSON.stringify(_leak) + (_leakWho ? ' who=' + _leakWho.join('|') : '') +
              ' hiddenDiscs=[' + Array.from(A.hiddenDiscs).join(',') + ']' +
              ' => FAIL — a discipline the round did not ask for is visible. If hiddenDiscs STILL' +
              ' names it, the hide was undone downstream (batch restore / TM full pass); if it does' +
              ' not, the hide was lost from the filter state itself.');
          }
        } catch (eLk) { /* measurement only */ }
      }
    }
    if (A._cpeRevealVisualKey === key) return;
    if (!st) {
      if (A._cpeRevealSavedHidden) {
        A.hiddenDiscs.clear();
        A._cpeRevealSavedHidden.forEach(function(d) { A.hiddenDiscs.add(d); });
        if (A._applyDiscVisibility) A._applyDiscVisibility();
        A._cpeRevealSavedHidden = null;
      }
    } else {
      if (!A._cpeRevealSavedHidden) A._cpeRevealSavedHidden = new Set(A.hiddenDiscs);
      A.filterDiscs(shown);
      // §REVEAL_TRAP (opt-in &revealtrap=1, diagnostic only): after the round hides its disciplines, every hidden mesh gets a `visible`
      // setter that, when something sets it back to true while its discipline is still in hiddenDiscs, logs the mesh (name, IFC class, guid,
      // type) and the call stack ONCE per mesh — names the code that undoes the hide (§CPE_REVEAL_LEAK says only THAT it was undone).
      if (/[?&]revealtrap=1/.test(location.search) && typeof A.collectMeshes === 'function') { try {
        A._revealTrapN = A._revealTrapN || 0;
        A.collectMeshes(function (o) { return o.isMesh && o.userData && o.userData.disc && A.hiddenDiscs.has(o.userData.disc) && !o.visible && !o.__revealTrap; }).forEach(function (o) {
          var v = o.visible; o.__revealTrap = true;
          Object.defineProperty(o, 'visible', { configurable: true, enumerable: true, get: function () { return v; }, set: function (nv) {
            if (nv && !v && A.hiddenDiscs && A.hiddenDiscs.has(o.userData.disc) && !o.__revealTrapLogged && A._revealTrapN < 40) {
              o.__revealTrapLogged = true; A._revealTrapN++;
              var st = String(new Error().stack || '').split('\n').slice(2, 8).map(function (l) { return l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, ''); }).join(' <- ');
              console.log('§REVEAL_TRAP #' + A._revealTrapN + ' disc=' + o.userData.disc + ' ifc=' + (o.userData.ifcClass || '-') + ' guid=' + (o.userData.guid || '-') +
                ' name=' + (o.name || '-') + ' type=' + (o.isBatchedMesh ? 'batched' : o.isInstancedMesh ? 'instanced' : 'mesh') + ' parent=' + (o.parent ? (o.parent.name || o.parent.type) : '-') + ' stack=' + st); }
            v = nv; } });
        });
      } catch (eRT) { console.warn('§REVEAL_TRAP failed: ' + eRT.message); } }
      // §CPE_REVEAL_HIDDEN (2026-09-19, red1: "Reveal round does not remove ARC to show only
      // Disciplines") — the round asked for [PLB,FP,ELEC,MEP] on Hospital and ARC was still solid
      // in the frame at 78 s. Nothing in any log said what filterDiscs actually hid, so the fault
      // could not be placed: it may be that ARC was never added to hiddenDiscs (no userData.disc on
      // its meshes), or that it WAS hidden and something re-showed it afterwards. Those need
      // opposite fixes. This prints what was asked for, what ended up hidden, and how many meshes
      // are still visible per discipline AFTER the filter — one line per slot change, so the next
      // bake says which of the two it is instead of leaving it to be guessed.
      try {
        var _vis = {};
        if (typeof A.collectMeshes === 'function') {
          A.collectMeshes(function (o) { return o.isMesh && o.userData && o.userData.disc; })
            .forEach(function (o) {
              if (!o.visible) return;
              var d = o.userData.disc; _vis[d] = (_vis[d] || 0) + 1;
            });
        }
        console.log('§CPE_REVEAL_HIDDEN slot=' + key + ' asked=[' + shown.join(',') + ']' +
          ' hiddenDiscs=[' + Array.from(A.hiddenDiscs).join(',') + ']' +
          ' stillVisibleByDisc=' + JSON.stringify(_vis) +
          ' — anything in stillVisibleByDisc that is NOT in `asked` is a discipline the round failed' +
          ' to remove; an empty hiddenDiscs means filterDiscs never found it to hide.');
      } catch (eRH) { /* measurement only, never breaks a bake */ }
    }
    A._cpeRevealVisualKey = key;
  };
  function _cpeBandEnds(b) {
    var h = b.len / 2;
    return [{ x: b.c.x - b.d.x * h, y: b.c.y - b.d.y * h, z: b.c.z - b.d.z * h },
            { x: b.c.x + b.d.x * h, y: b.c.y + b.d.y * h, z: b.c.z + b.d.z * h }];
  }
  // The 6 waypoints the film actually flies through — expanded at plan time, flown, discarded.
  // These are also what the LOS aim rule reads: inside a band "aim at the next waypoint" means aim
  // ALONG the band; at a band's far end it means aim into the next band. Both fall out for free.
  function _cinemaBandWaypoints(bands) {
    var wp = [];
    for (var i = 0; i < bands.length; i++) {
      var e = _cpeBandEnds(bands[i]);
      wp.push(e[0], e[1]);
    }
    return wp;
  }
  A.cinemaBandWaypoints = _cinemaBandWaypoints;

  var CINEMA_CONNECTOR_SEGS = 40;   // samples per connector curve — see G-note below
  var CINEMA_CONNECTOR_K = 0.55;    // Hermite tangent length as a fraction of the connector's span
  // The flown polyline. Bands pass through VERBATIM (rule 2 — never rounded, that would be the
  // morphing the user ruled out). Between two bands runs a cubic Hermite whose end tangents ARE the
  // band directions, so the curve leaves a band along its own direction and arrives at the next
  // along that one's — no kink at the join, which is the entire point ("must adjust so as not to
  // have abrupt breaks").
  // The tangent length scales with the connector's OWN span, so a 5m gap and a 60m gap both read as
  // one continuous curve rather than a tight kink at one end and a lazy arc at the other ("user can
  // drag it to a far end, the path has to bounce back").
  // The bow is then capped by MEASURED clearance, with the same no-hit-is-unknown rule §CPE_LIVE
  // established — a fan that hits nothing reports CINEMA_FAN_FAR, which is not a measurement.
  function _cinemaBandFlow(bands) {
    var out = [], i, s;
    if (!bands || !bands.length) return out;
    var stats = { conn: 0, kMin: 1e9, kMax: 0, bowMax: 0, unmeasured: 0 };
    for (i = 0; i < bands.length; i++) {
      var e = _cpeBandEnds(bands[i]);
      out.push({ x: e[0].x, y: e[0].y, z: e[0].z });
      if (i === bands.length - 1) { out.push({ x: e[1].x, y: e[1].y, z: e[1].z }); break; }
      var nxt = _cpeBandEnds(bands[i + 1]);
      var P0 = e[1], P1 = nxt[0], d0 = bands[i].d, d1 = bands[i + 1].d;
      var span = Math.hypot(P1.x - P0.x, P1.y - P0.y, P1.z - P0.z);
      out.push({ x: P0.x, y: P0.y, z: P0.z });
      if (span < 1e-4) continue;
      // Clearance cap at the join, measured — same source and same unknown-handling as §CPE_LIVE.
      var clear = FXS.CINEMA_FAN_NUDGE_MAX, measured = false;
      try {
        var f = _cinemaFan({ x: (P0.x + P1.x) / 2, y: (P0.y + P1.y) / 2, z: (P0.z + P1.z) / 2 }, 8);
        if (f && isFinite(f.min) && f.min < FXS.CINEMA_FAN_FAR - 0.01) { clear = f.min; measured = true; }
      } catch (eF) { /* no BVH → conservative budget */ }
      if (!measured) stats.unmeasured++;
      var k = CINEMA_CONNECTOR_K;
      // Shrink k until the curve's furthest excursion from the straight chord fits the clearance.
      // Measured by sampling rather than by a closed form, so the gate can assert the same number.
      var pts, bow;
      for (var attempt = 0; attempt < 8; attempt++) {
        pts = []; bow = 0;
        var m = span * k;
        for (s = 1; s < CINEMA_CONNECTOR_SEGS; s++) {
          var t = s / CINEMA_CONNECTOR_SEGS, t2 = t * t, t3 = t2 * t;
          var h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
          var q = { x: h00 * P0.x + h10 * d0.x * m + h01 * P1.x + h11 * d1.x * m,
                    y: h00 * P0.y + h10 * d0.y * m + h01 * P1.y + h11 * d1.y * m,
                    z: h00 * P0.z + h10 * d0.z * m + h01 * P1.z + h11 * d1.z * m };
          pts.push(q);
          // distance from q to the P0→P1 chord
          var vx = P1.x - P0.x, vy = P1.y - P0.y, vz = P1.z - P0.z;
          var wx = q.x - P0.x, wy = q.y - P0.y, wz = q.z - P0.z;
          var tt = Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / (span * span)));
          bow = Math.max(bow, Math.hypot(wx - vx * tt, wy - vy * tt, wz - vz * tt));
        }
        if (bow <= clear || k < 0.06) break;
        k *= 0.7;
      }
      for (s = 0; s < pts.length; s++) out.push(pts[s]);
      stats.conn++; stats.kMin = Math.min(stats.kMin, k); stats.kMax = Math.max(stats.kMax, k);
      stats.bowMax = Math.max(stats.bowMax, bow);
    }
    var sig = bands.length + '|' + stats.conn + '|' + stats.bowMax.toFixed(2) + '|' + stats.unmeasured;
    var nowB = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (sig !== _bandsLastSig || nowB - _bandsLastMs > 1000) {
      _bandsLastSig = sig; _bandsLastMs = nowB;
      console.log('§CINEMA_BANDS bands=' + bands.length + ' waypoints=' + (bands.length * 2) +
        ' flown=' + out.length + ' connectors=' + stats.conn +
        ' k=[' + (stats.conn ? stats.kMin.toFixed(2) + ',' + stats.kMax.toFixed(2) : 'n/a') + ']' +
        ' maxBow=' + stats.bowMax.toFixed(2) + 'm unmeasuredJoins=' + stats.unmeasured + '/' + stats.conn);
    }
    return out;
  }
  var _bandsLastSig = '', _bandsLastMs = 0;
  A.cinemaBandFlow = _cinemaBandFlow;   // witnesses read this directly

  // ══ §CPE_HOSE — the whole path as a rubber hose ═══════════════════════════════════════════════
  // Each op is { s, r, d }: `s` = WHERE along the path it was grabbed, as a fraction of the path's
  // own arc length; `r` = the reach, in the SAME arc-length fraction; `d` = the world displacement
  // the gesture asked for at the grab point.
  //
  // ⚠ THE LAW (spec §CPE_HOSE.2, non-negotiable): the falloff is measured in ARC LENGTH ALONG THE
  // PATH, never in world distance. A world-space radius deforms an out-and-back path's RETURN leg —
  // two metres away in space, half a film away in time. That is the exact class of bug that got
  // §CPE_DRAG_REACH removed in #1038 ("G-DRAG-3 measured it BREAKING out-and-back"), and a
  // world-distance hose walks it straight back in. W-HOSE-ARC is the gate.
  //
  // Falloff shape: (1-u²)² — the smooth bump. Zero displacement AND zero slope at u=1, so a hosed
  // stretch rejoins the underived path with no kink at either end; and zero slope at u=0, so the
  // grabbed point is a smooth crest rather than a pulled tent-pole. Spec open question 1 said to
  // pick this by trying rather than by argument; this is the default, and it is one line to change.
  //
  // Superposition is deliberate: overlapping ops ADD. Ten small pulls in one region compose into one
  // larger, still-smooth deformation, which is how a hose behaves when you keep working it.
  function _cinemaHoseApply(pts, ops) {
    if (!pts || pts.length < 2 || !ops || !ops.length) return pts;
    var i, k, cum = [0], L = 0;
    for (i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
      cum.push(L);
    }
    if (L <= 1e-6) return pts;
    var out = new Array(pts.length), maxDisp = 0, touched = 0;
    for (i = 0; i < pts.length; i++) {
      var s = cum[i] / L, dx = 0, dy = 0, dz = 0;
      for (k = 0; k < ops.length; k++) {
        var op = ops[k], r = op && op.r;
        if (!op || !op.d || !(r > 1e-9)) continue;
        var u = Math.abs(s - op.s) / r;
        if (u >= 1) continue;
        var g = 1 - u * u; g = g * g;
        dx += op.d.x * g; dy += op.d.y * g; dz += op.d.z * g;
      }
      var m = Math.hypot(dx, dy, dz);
      if (m > 1e-6) { touched++; if (m > maxDisp) maxDisp = m; }
      out[i] = { x: pts[i].x + dx, y: pts[i].y + dy, z: pts[i].z + dz };
    }
    var sigH = ops.length + '|' + maxDisp.toFixed(2) + '|' + touched + '/' + pts.length;
    var nowH = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (sigH !== _hoseLastSig || nowH - _hoseLastMs > 1000) {
      _hoseLastSig = sigH; _hoseLastMs = nowH;
      console.log('§CPE_HOSE ops=' + ops.length + ' pathLen=' + L.toFixed(1) + 'm points=' + pts.length +
        ' deformed=' + touched + ' maxDisp=' + maxDisp.toFixed(2) + 'm' +
        ' falloff=arc-length (NEVER world distance — see #1038 out-and-back)');
    }
    return out;
  }
  var _hoseLastSig = '', _hoseLastMs = 0;
  A.cinemaHoseApply = _cinemaHoseApply;   // W-HOSE-ARC reads this directly

  // §CPE_HOSE_REANCHOR — keep a pull where it was PUT when the curve underneath it changes.
  // An op's `s` is a fraction of the walk's arc length; adding or moving a band changes both the
  // length and the shape of that walk, so the same fraction lands somewhere else and the bulge
  // slides along the path on its own (observed live: the same two ops reporting deformed=57 → 65 →
  // 72 across successive band edits, untouched). Each op therefore also carries `a`, the WORLD point
  // it was authored at on the raw curve; re-projecting that onto the new curve is what makes the
  // edit stable. Returns how many moved, so the caller logs a number instead of guessing.
  // Lives here, beside the apply, so the witness exercises the shipped function.
  function _cinemaHoseReanchor(ops, pts, fracs, skip) {
    if (!ops || !ops.length || !pts || pts.length < 2) return 0;
    var moved = 0;
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      if (!op || op === skip) continue;
      var idx0 = Math.max(0, Math.min(pts.length - 1, Math.round(op.s * (pts.length - 1))));
      if (!op.a) { op.a = { x: pts[idx0].x, y: pts[idx0].y, z: pts[idx0].z }; continue; }
      var best = 0, bd = Infinity;
      for (var i = 0; i < pts.length; i++) {
        var dx = pts[i].x - op.a.x, dy = pts[i].y - op.a.y, dz = pts[i].z - op.a.z;
        var d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      var ns = fracs[best];
      if (Math.abs(ns - op.s) > 1e-4) { moved++; op.s = ns; }
    }
    return moved;
  }
  A.cinemaHoseReanchor = _cinemaHoseReanchor;

  // Seed three bands from a derived plan's three waypoints. Direction at each anchor is the local
  // path tangent (Catmull-Rom style: previous→next), so the seeded bands already lie along the route
  // and the very first render is a no-op-looking curve rather than a scrambled one.
  // Length was 5% of the interior walk ("a stretch say about 5% of the inside") with a 1m floor.
  // It is NOT draggable — rule 4, length is a typed field.
  //
  // §CPE_BAND_REACH (user, 2026-07-27: "make that 'stick' longer as it is hard to grab the right
  // end", and "the stick band should curve along more.. now it is short, if twisted its curve still
  // short.. having more make it more useful to craft"). TWO changes, because the difficulty has two
  // separate causes and the obvious one is not the binding one:
  //
  //  1. The fraction doubles, 5% -> 10%. That is the "curve along more" half — a longer band sweeps
  //     a longer arc when twisted, which is what makes it useful to craft with.
  //
  //  2. A SCREEN-SPACE floor, which is the half that actually fixes "hard to grab the right end".
  //     A band's world length says nothing about how grabbable it is: the view plane sits at the
  //     handle's camera distance, MEASURED at 0.453 m/px on Hospital (0.151 Duplex, 0.227 Terminal),
  //     so a 1.5m band spans ~3 PIXELS there and its three 0.30m handles are individually
  //     SUB-PIXEL. No world-space length chosen for one building can fix that for another — the
  //     seed has to measure the camera. 88px is the span at which the two END handles are one
  //     standard 44px touch target apart, so end-vs-mid is separable by pointer or by finger;
  //     96 for margin. Falls back to the world rule if the camera is not readable.
  var CINEMA_BAND_FRAC = 0.10, CINEMA_BAND_MIN_M = 1.0, CINEMA_BAND_MIN_PX = 96;
  function _cinemaSeedBands(wp, pathLen) {
    if (!wp || wp.length < 2) return null;
    var len = Math.max(CINEMA_BAND_MIN_M, (pathLen || 0) * CINEMA_BAND_FRAC), bands = [];
    // Screen-space floor: metres per pixel in the view plane at the band's own distance is
    // 2·d·tan(fov/2)/viewportHeight — the same geometry the drag itself uses.
    try {
      var _cam = A.camera, _el = A.renderer && A.renderer.domElement;
      if (_cam && _cam.isPerspectiveCamera && _el && _el.clientHeight > 0) {
        var _mid = wp[Math.floor(wp.length / 2)];
        var _d = Math.hypot(_mid.x - _cam.position.x, _mid.y - _cam.position.y, _mid.z - _cam.position.z);
        var _mPerPx = 2 * _d * Math.tan(_cam.fov * Math.PI / 360) / _el.clientHeight;
        var _screenMin = _mPerPx * CINEMA_BAND_MIN_PX;
        // Hard cap as a fraction of the walk. Unclamped, the screen floor is absurd on a big
        // building viewed from far out: MEASURED 43.49m of band on Hospital's 29.8m walk — a stick
        // longer than the path it edits. Beyond this the honest answer is not a bigger stick, it
        // is to zoom in, which §CPE_SCREEN_PLANE already settled as the workflow ("you cannot
        // change height from top-down... some moves take two steps").
        //
        // The cap is set by the CONNECTORS, not by taste. Band length is walk the connectors do
        // not get: three bands at 25% each leave only 25% of the walk to turn every corner in, and
        // that MEASURED 25.2 deg/frame on Terminal against B5's 12 cap — the longer stick bought
        // back the very jerk this lane spent the session removing. 15% leaves 55% for connectors
        // and holds B5. Raising this requires re-running witness_cinema_bands, not judgement.
        var _cap = 0.15 * (pathLen || 0);
        var _want = Math.min(_screenMin, _cap > 0 ? _cap : _screenMin);
        if (isFinite(_want) && _want > len) {
          console.log('§CPE_BAND_REACH screen floor binds: ' + len.toFixed(2) + 'm -> ' +
            _want.toFixed(2) + 'm = ' + (_want / _mPerPx).toFixed(0) + 'px (' +
            _mPerPx.toFixed(3) + ' m/px at ' + _d.toFixed(0) + 'm; wanted ' +
            CINEMA_BAND_MIN_PX + 'px = ' + _screenMin.toFixed(2) + 'm, cap ' + _cap.toFixed(2) + 'm)');
          len = _want;
        }
      }
    } catch (e) {}
    // §CPE_SEED_FEW (red1 2026-10-04/05, prompts/ALTC_FOUNDATION.md §1): as many FULL-LENGTH bands as
    // the 45% band budget allows (the same 0.45 = 3 x the 15% cap above: connectors keep >= 55% of
    // the walk or the corner jerk returns), placed on the waypoints nearest EVEN arc spacing, ends
    // fixed. One band PER waypoint was written for a three-waypoint plan; the room-graph route now
    // has ~21, and 21 bands of 10% each (435 m on Terminal's 207 m walk) overlapped and zig-zagged
    // the authored walk to 704 m. The tangent still reads the FULL route's neighbours, so each
    // seeded band lies along the route it came from.
    var BAND_BUDGET = 0.45;
    var K = Math.max(2, Math.min(wp.length, Math.floor(BAND_BUDGET * (+pathLen || 0) / len + 1e-9)));
    var cumW = [0];
    for (var q = 1; q < wp.length; q++) {
      cumW.push(cumW[q - 1] + Math.hypot(wp[q].x - wp[q - 1].x, wp[q].y - wp[q - 1].y, wp[q].z - wp[q - 1].z));
    }
    var LW = cumW[cumW.length - 1], idx = [0];
    for (var kk = 1; kk < K - 1; kk++) {
      var tgt = LW * kk / (K - 1), best = -1, bestD = Infinity;
      for (var q2 = idx[idx.length - 1] + 1; q2 < wp.length - 1; q2++) {
        var dd = Math.abs(cumW[q2] - tgt);
        if (dd < bestD) { bestD = dd; best = q2; }
      }
      if (best > 0) idx.push(best);
    }
    if (wp.length - 1 > idx[idx.length - 1]) idx.push(wp.length - 1);
    for (var j = 0; j < idx.length; j++) {
      var i = idx[j];
      var a = wp[Math.max(0, i - 1)], b = wp[Math.min(wp.length - 1, i + 1)];
      var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      var L = Math.hypot(dx, dy, dz);
      if (L < 1e-4) { dx = 1; dy = 0; dz = 0; L = 1; }
      bands.push({ c: { x: wp[i].x, y: wp[i].y, z: wp[i].z },
                   d: { x: dx / L, y: dy / L, z: dz / L }, len: len });
    }
    console.log('§CPE_SEED_FEW wp=' + wp.length + ' budgetK=' + K + ' seeded=' + bands.length + ' idx=[' + idx.join(',') + ']' +
      ' arcM=[' + idx.map(function(k) { return cumW[k].toFixed(1); }).join(',') + '] bandLen=' + len.toFixed(2) + 'm' +
      ' bandSum=' + (len * bands.length).toFixed(2) + 'm pathLen=' + (+pathLen || 0).toFixed(2) + 'm');
    return bands;
  }
  A.cinemaSeedBands = _cinemaSeedBands;
  // §CPE_STICK — seed ONE band at an arbitrary point on the flown curve. Same rule as the three
  // seeded bands above: centre on the curve, direction = the LOCAL TANGENT (previous→next), length
  // inherited. That combination is what makes a freshly dropped stick a NO-OP — it lies along the
  // path it was dropped on, so the film does not move until the user moves the stick.
  // Lives here rather than in the editor so the witness exercises the SHIPPED function instead of a
  // re-implementation of it (the failure mode where a gate passes against its own copy of the maths).
  function _cinemaSeedStick(pts, i, len) {
    if (!pts || pts.length < 2) return null;
    var n = pts.length;
    i = Math.max(0, Math.min(n - 1, i | 0));
    var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    var L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) { dx = 1; dy = 0; dz = 0; L = 1; }
    return { c: { x: pts[i].x, y: pts[i].y, z: pts[i].z },
             d: { x: dx / L, y: dy / L, z: dz / L },
             len: (len > 0 ? len : Math.max(CINEMA_BAND_MIN_M, 1)) };
  }
  A.cinemaSeedStick = _cinemaSeedStick;
  // Exit cost = dist × (1 − FACE_GAIN·facingDot) × perimFactor. facingDot=+1 (door dead ahead) →
  // (1-GAIN)×dist; facingDot=−1 (door behind you) → (1+GAIN)×dist. This asymmetry is the entire
  // "myriad of paths" mechanism: two poses at the SAME spot facing different ways can pick DIFFERENT
  // doors. MEASURED, not guessed: at 0.3 the swing was only ±30% and proximity drowned it completely
  // — Hospital picked the SAME door from all 6 test poses, Terminal only 2 distinct across 6.
  // §CINEMA_TRAVEL_CLASS split (2026-07-20, Phase 2 spec): GRACEFUL keeps the measured 0.8 (heading
  // genuinely steers — do not lower this one without re-running the exit-divergence probe, a low
  // gain silently collapses the whole feature). RUSHED is deliberately proximity-dominant — "for
  // those just rushing to it... short of time" — the nearest door wins outright regardless of
  // facing; this is an intentional, separate mode for the travelled-to-target case, not a
  // regression of the graceful one.
  var CINEMA_EXIT_FACE_GAIN_GRACEFUL = 0.8;
  var CINEMA_EXIT_FACE_GAIN_RUSHED = 0.1;
  var _cinemaActive = false;
  function _cinemaSmoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  // §CPE_NOISE_LAW — the FLOORED ease. User, live, 2026-07-27: "also noticing last wpt stalling as
  // the first one ... thus it is not using the noise ratio". They are right, and it is measurable:
  // a beat's raw speed spans 3.66/0.186 = 20x (witness_cpe_noise_law, Duplex dive) and ALL of that
  // is smoothstep, whose derivative 6e(1-e) is exactly ZERO at both ends of every beat. The noise
  // ratio only modulates 1.1-1.5x on top. So the clock governs and the law decorates — the opposite
  // of the ruling — and the zero at each seam IS the stall the user sees at the first and last
  // waypoint.
  //
  // Fix without throwing away the ease: mix in enough linear rate that the ends never reach zero,
  // with the mix taken from the user's OWN dial rather than a new number:
  //     easeF(t) = a·t + (1-a)·smoothstep(t),   a = 1/PACE_SWING
  // giving easeF'(0) = easeF'(1) = a = 1/1.6 (the slow rail exactly) and easeF'(0.5) = 1.19 (well
  // inside the fast rail). Ends at 0->0 and 1->1 unchanged, so no beat boundary moves and no path
  // changes. The ease now spans 1.9x instead of infinity, which leaves the NOISE ratio as the term
  // that actually shapes the film.
  function _cinemaEaseFloored(t) {
    var a = 1 / CINEMA_PACE_SWING;
    return a * Math.max(0, Math.min(1, t)) + (1 - a) * _cinemaSmoothstep(t);
  }
  // §EFFECTS_LOADED — effects.js's build fingerprint, so a pasted console can answer "is this
  // live?" by itself. Bump on EVERY behaviour change in this file. Reorganized to one clause per
  // line 2026-08-04 for readability (no §TAG dropped) — also CAUGHT UP a real gap found while doing
  // that: §CPE_AIM_PIN (Part C) added real behaviour here (`_buildPinZones`/`_pinLookAtAt` inside
  // `_beat3Pose`) but this string was never bumped for it, breaking the file's own "bump on EVERY
  // behaviour change" rule for one release. Fixed now, not left for a future session to rediscover.
  var EFFECTS_V = 'v25 (' +
    '§CPE_DISCIPLINE_REVEAL_FLYBACK new fast eased retrace sub-beat replaces the pull-out->round-2 ' +
      'teleport cut; §CPE_DISCIPLINE_REVEAL_ORDER discs sorted ascending by real avg bbox volume, ' +
      'MEP forced last; §CPE_DISCIPLINE_REVEAL_FADE tail-parade boundaries get a brief overlap ' +
      'window instead of an instant swap; ' +
    '§CPE_AIM_DEPTH_RETIRED (2026-09-02) §CPE_AIM_DEPTH REMOVED — path-follow is now the ONLY ' +
      'automatic gaze rule in the walk. It was the sole surviving exception (§CPE_AIM_SIMPLIFY, ' +
      '2026-08-14, which had already retired §CPE_AIM_DENSITY), and its own formula shows why it ' +
      'had to go: clearM = clamp(envelope*0.06, 3, 8) = 8.0m on Hospital and w = 1 - smoothstep( ' +
      'fwdClear/clearM), so HALF its authority was spent at 4m of forward clearance — a "something ' +
      'within 8m" rule, not the dead-end rescue it was described as. Measured before removal: ' +
      'Hospital 28/91 probes firing / gaze turned 83.45deg, HHS_Office 65/65 probes active. Gone ' +
      'with it: §CPE_AIM_GRID, §CPE_AIM_LATCH, §CPE_AIM_DEPTH_SERIES/_SCALE/_VERTICALITY/ ' +
      '_OPEN_TAPER/_FWD_CLEAR/_BUILDUP, and §CPE_STICK_HOLD\'s aim half (_holdBoostAt fed only ' +
      '_aimDepthApply — a held beat is now a pure rate dip; §CPE_AIM_PIN is the authored head-turn ' +
      'that replaces it). §CPE_AIM_DEPTH_FREEZE and §CPE_CORR_BRANCH are KEPT, both reduce motion; ' +
    '§CPE_AIM_PIN a pinned band\'s Voronoi zone of the walk overrides path-follow outright ' +
      '(_buildPinZones/_pinLookAtAt inside _beat3Pose); ' +
    '§CPE_PACE_SWING_SOFTEN CINEMA_PACE_SWING 1.6->1.45, direct user tuning request; ' +
    '§CINEMA_LOOKAHEAD_ARC no-threshold look-ahead; ' +
    '§CPE_EVEN_TURN cost-parameterized walk + §CPE_SEAM_CONTINUOUS Beat2→3 opening blend; ' +
    '§STAFFAGE_OUTSIDE_VARIETY + §STAFFAGE_FLOOR_PHANTOM)';
  console.log('§EFFECTS_LOADED ' + EFFECTS_V);

  // Inverse of scene.js's A.ifc2three (IFC X=east,Y=north,Z=up → three X=east,Y=up,Z=south).
  function _cinemaThree2Ifc(x, y, z) {
    var o = A.modelOffset || { x: 0, y: 0, z: 0 };
    return { ix: x + o.x, iy: o.y - z, iz: y + o.z };
  }

  // ══ BVH raycast fan — the ONLY "where is open space" source in this path ═══════════════════
  // storey_walkable_raster is NOT dependable (patch-shipped for 3 of 11 buildings; live logs show
  // `§HELPERS_QUERY_ERR no such table: storey_walkable_raster`). three-mesh-bvh IS monkey-patched
  // into THREE.Mesh.prototype.raycast in every session (§BVH_INIT, loader.js), so a horizontal fan
  // of rays against the REAL rendered triangles answers all three questions the opening asks:
  // "am I facing a wall", "which bearing is the largest empty space", "where is the open centre".
  // Works on every building with no extra data — nothing invented, nothing patch-gated.
  var _cineFanRay = null, _cineFanMeshes = null, _cineFanBld = null;
  function _cinemaFanMeshes() {
    if (_cineFanMeshes && _cineFanBld === A.activeBuilding) return _cineFanMeshes;
    _cineFanMeshes = (typeof A.collectMeshes === 'function') ? A.collectMeshes(function(o) {
      return (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible &&
             !o.isSprite && o.userData.staffageKind === undefined && !(A.sky && o === A.sky) &&
             !FXS._isGhostGeometry(o);
    }) : [];
    _cineFanBld = A.activeBuilding;
    return _cineFanMeshes;
  }
  A._cinemaFanMeshesDebug = _cinemaFanMeshes;   // exposed for the §BBOX_GHOST_RAYCAST_FILTER witness harness
  // Returns { free:[N], bearings:[N], min, max, maxBearing, mean, openDir:{x,z} } — free[i] is the
  // metres of clear air along bearing i (CINEMA_FAN_FAR when nothing was hit).
  // §CINEMA_SPIN_GLAZING (2026-07-22, prompts/PHOTOREAL_STILL_RENDER.md §Issue 2, spin-at-wall):
  // glazing classes for the fan's per-ray hit classification below — "the fan's nearest hit is
  // glazing, not opaque" IS an acceptable outcome per the user's own words ("being near glass with
  // a view IS the marker of a good spot"), reusing the same curtain-wall/window family PHOTO_SPARKLE
  // already classifies for a different feature (§320 above), not a new invented grouping.
  var CINEMA_GLAZING_CLASSES = { IfcWindow: 1, IfcCurtainWall: 1, IfcPlate: 1, IfcMember: 1 };
  function _cinemaHitIsGlazing(hits) {
    if (!hits || !hits.length) return false;
    var o = hits[0].object, cls = o && o.userData && o.userData.ifcClass;
    return !!(cls && CINEMA_GLAZING_CLASSES[cls]);
  }
  function _cinemaFan(pos, nRays) {
    var N = nRays || FXS.CINEMA_FAN_RAYS;
    var out = { free: [], bearings: [], glazing: [], min: FXS.CINEMA_FAN_FAR, minGlazing: false, max: 0, maxBearing: 0, mean: 0,
                openDir: { x: 0, z: 0 }, rays: N };
    var meshes = _cinemaFanMeshes();
    if (!_cineFanRay) { _cineFanRay = new THREE.Raycaster(); _cineFanRay.firstHitOnly = true; }
    var origin = new THREE.Vector3(pos.x, pos.y, pos.z), dir = new THREE.Vector3();
    var sum = 0;
    for (var i = 0; i < N; i++) {
      var b = (i / N) * Math.PI * 2;
      var d = FXS.CINEMA_FAN_FAR, isGlazing = false;
      if (meshes.length) {
        dir.set(Math.cos(b), 0, Math.sin(b));
        _cineFanRay.set(origin, dir);
        _cineFanRay.far = FXS.CINEMA_FAN_FAR;
        var hits = null;
        try { hits = _cineFanRay.intersectObjects(meshes, true); } catch (e) { hits = null; }
        if (hits && hits.length) { d = hits[0].distance; isGlazing = _cinemaHitIsGlazing(hits); }
      }
      out.free.push(d); out.bearings.push(b); out.glazing.push(isGlazing); sum += d;
      if (d < out.min) { out.min = d; out.minGlazing = isGlazing; }
      if (d > out.max) { out.max = d; out.maxBearing = b; }
    }
    out.mean = sum / N;
    // Vector toward the more open side — the nudge that turns "in a room" into "in the middle of
    // the room" and, when the pose is nose-to-a-wall, is literally the BACKING AWAY the spec asks
    // for (the wall's bearing contributes a short vector, the open side a long one).
    for (var j = 0; j < N; j++) {
      out.openDir.x += Math.cos(out.bearings[j]) * (out.free[j] - out.mean);
      out.openDir.z += Math.sin(out.bearings[j]) * (out.free[j] - out.mean);
    }
    out.openDir.x /= N; out.openDir.z /= N;
    return out;
  }
  // Real floor under a point: downward raycast against rendered triangles (the §STAFFAGE_GROUNDSNAP
  // convention). Deliberately NOT derived from the slab stack — see the storeyH=1.91 defect above.
  function _cinemaFloorY(x, z, fromY) {
    var meshes = _cinemaFanMeshes();
    if (!meshes.length) return null;
    if (!_cineFanRay) { _cineFanRay = new THREE.Raycaster(); _cineFanRay.firstHitOnly = true; }
    _cineFanRay.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    _cineFanRay.far = 200;
    var hits = null;
    try { hits = _cineFanRay.intersectObjects(meshes, true); } catch (e) { return null; }
    return (hits && hits.length) ? hits[0].point.y : null;
  }
  // §CINEMA_PATH: the ONE shared path plan — flown identically by the live Alt+C capture and by
  // the MaxQ exporter (cinema_maxq.js). Everything derives from the CURRENT camera/sun/building at
  // call time; nothing is hardcoded per building.
  // ══ §CPE_GAZE_ACQUIRE — the cap ACCELERATES when far off-axis and decays onto the subject ═════
  // USER, 2026-08-02: "the cam head turning to face density*depth ... Seems a bit slow during this
  // baking. It be nice if it does so right away gracefully."
  //
  // The limiter above was a FLAT cap, so a 90 deg acquisition cost a dead-constant 2.00 s at one
  // unvarying speed. That is not a slow camera, it is a camera with no acquisition: a real operator
  // whips onto a subject and DECELERATES onto it. "Right away" and "gracefully" are the two halves
  // of that, and a single flat number can express neither.
  //
  // So the allowance is scaled by the RESIDUAL angle — the further off-axis, the more rate it may
  // spend; as it converges the multiplier smoothsteps back to exactly 1.0, which is the shipped
  // behaviour. Peak turn rate is therefore still explicitly bounded (GAZE_ACQUIRE_MAX), still
  // logged every bake, and a gaze already ON its subject moves exactly as it did before — that
  // last property matters: it means this cannot add motion to a settled shot.
  //
  // ⚠ IT MULTIPLIES OVER CINEMA_TURN_DPS, IT DOES NOT REPLACE IT. That constant also prices the
  // spin, the orbit lap and the walk's own turn charge (see _useSec, ~line 5932) — raising it would
  // silently re-time every film ever baked. This is a gaze-only multiplier for exactly that reason.
  //
  // §CPE_GAZE_ACQUIRE_SOFTEN (user, 2026-08-02, on the second Hospital bake): "The cam face turns
  // rather obvious been more pronounced, still OK, was more graceful before." 3x (135 deg/s peak)
  // overshot; 2x (90 deg/s) keeps both halves of the original ask — still strictly faster than
  // the flat 45 deg/s that read as "a bit slow", still decaying to exactly 1.0x on-subject.
  // Pure function of the residual, so poseAt stays order-independent and replans stay identical.
  var GAZE_ACQUIRE_MAX  = 2;                    // peak multiple of the shared CINEMA_TURN_DPS cap
  var GAZE_ACQUIRE_FULL = 60 * Math.PI / 180;   // residual at/above which the full multiple applies
  var GAZE_ACQUIRE_DEAD = 2 * Math.PI / 180;    // below this the gaze IS on target — no boost at all
  function _gazeAcquireCap(residRad, baseMaxAng) {
    var r = Math.abs(residRad);
    if (!(r > GAZE_ACQUIRE_DEAD)) return baseMaxAng;
    var u = Math.min(1, (r - GAZE_ACQUIRE_DEAD) / (GAZE_ACQUIRE_FULL - GAZE_ACQUIRE_DEAD));
    return baseMaxAng * (1 + (GAZE_ACQUIRE_MAX - 1) * _cinemaSmoothstep(u));
  }
  // Exposed for witness_cpe_gaze_acquire.js — the witness drives THIS function, not a copy of the
  // arithmetic, so a change here cannot pass a test that reimplemented the old curve.
  A.gazeAcquireCap = _gazeAcquireCap;
  A.gazeAcquireStep = function (cur, tgt, baseMaxAng) {
    var d = Math.max(-1, Math.min(1, cur.x * tgt.x + cur.y * tgt.y + cur.z * tgt.z));
    return _rotToward(cur, tgt, _gazeAcquireCap(Math.acos(d), baseMaxAng));
  };
  function _rotToward(a, b, maxAng) {
    var d = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    var ang = Math.acos(d);
    if (ang <= maxAng || ang < 1e-9) return b;
    var s = Math.sin(ang);
    if (Math.abs(s) < 1e-9) return b;             // antipodal/degenerate — no stable arc to walk
    var t = maxAng / ang, k0 = Math.sin((1 - t) * ang) / s, k1 = Math.sin(t * ang) / s;
    var x = a.x * k0 + b.x * k1, y = a.y * k0 + b.y * k1, z = a.z * k0 + b.z * k1;
    var L = Math.hypot(x, y, z) || 1;
    return { x: x / L, y: y / L, z: z / L };
  }
};
