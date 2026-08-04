// §MAXQ — Max-Quality Orbiter export (Alt+M).
// Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §MAXQ SPEC (2026-07-19).
// Ports the proven offline PoC loop in-app: each frame is a COMPLETE Alt+S fold (photoshoot
// staging + 16-sample TAA + full §PHOTO_AO converge) captured to a per-feature IDB store, then
// replay-recorded onto a proxy canvas at MAXQ_FPS (MediaRecorder in its real-time happy path —
// the same recorder pattern Cinema Orbit ships with, NOT the frame-starved capture that sank the
// retired TM exporter). Single tab = serial: ~1.3s/frame → 360 frames ≈ 8 min cook + 24s stitch.
(function() {
  'use strict';
  // §MAXQ_LOADED: version fingerprint FIRST — a pasted console log must answer "which build is
  // this?" on its own (user feedback 2026-07-19: "u got to make the logs tell u"). Bump MAXQ_V
  // on every behavior change to this module.
  // ══ §CPE_GHOST_GROUND (CINEMA_PATH_EDITOR.md) — a buildup film opens on SUBSTRUCTURE, and
  // substructure sits BELOW the ground plane (§GROUND_Y, the L1 slab datum). Measured on the user's
  // own Hospital bake: `placed=210/63421` at frame 120, every one of those 210 under an opaque paved
  // plane with 4,043 shadow casters on it. The opening was not empty — it was OCCLUDED, and no
  // camera or gaze change could have revealed it.
  //
  // While the buildup has placed nothing at or above the ground datum the plane renders at GHOST
  // opacity — the pile caps and ground beams read through it like a survey drawing. When the first
  // at-or-above-ground element lands (the L1 slab itself qualifies — user: "until its above slabs
  // appears") the plane eases back to fully opaque and STAYS there.
  //
  // The fade is a smoothstep over FILM time, not a cut (user: "it be cool when they return back to
  // opaque gradually rather than right away") and not wall time — expressed as a film FRACTION so
  // the 10 s rehearsal and the 148 s bake show the identical curve.
  //
  // Deliberately NOT "switch the ground off", which the user floated first and flagged the risk of
  // themselves: that takes §PHOTO_SHADOW's casters and the sense of a site with it, and the
  // foundation floats in blackness.
  //
  // §CPE_GHOST_GROUND_TRIGGER history (read before changing this threshold again):
  //   #1110 fired at the first at-or-above-ground element (MIN(end_ts) over above-ground ops) —
  //   measured t=0.0162 on Hospital, 2.4s of a 147.9s film.
  //   #1112 judged that too early ("over before the camera lands") and replaced it with a RATIO
  //   against the model's own above-ground total (opaque at 5% of above-ground work placed,
  //   t=0.050 on Hospital) — a deliberate, reasoned widening, not a bug.
  //   2026-08-03: the user watched real bakes and said, twice, directly, that even 5% is "quite
  //   further on" — they want the ground solid essentially the MOMENT the first slab(s) appear,
  //   not materially later. This reverts the TRIGGER to #1110's first-above-ground-element rule
  //   (still computed from tmGroundSchedule's `firstAboveMs`, so the §1113-1115 hardening below —
  //   degrade-not-disable, refusal logging, lazy arm-on-first-tick, arm-while-hidden — is untouched).
  //   NOTE FOR THE USER: #1112's "too early to be legible" concern was real and measured, not
  //   invented — reverting does trade back into that risk (a 2.4s-of-148s window is brief). This
  //   revert is implemented as directly asked, not silently split-the-difference; flagging the
  //   historical concern here rather than deciding it unilaterally.
  var GHOST_OPACITY = 0.22;      // survey-drawing translucency; low enough to read what is under it
  var GHOST_FADE_SEC = 3.0;      // floor on how fast opacity may rise, in FILM seconds — a batch of
                                 // ops landing in one frame must not snap the ground opaque.
  var _ggSched = null, _ggSpan = null, _ggSaved = null, _ggTried = false;
  // §GHOST_GROUND_LIVE_TRIGGER: `_ggFired` is a one-shot flag for the §GHOST_GROUND_TRIGGER_FIRED
  // log line only — it does NOT gate the opacity math (that stays a stateless, precomputed-threshold
  // smoothstep so the curve never depends on sampling density — see _ghostGroundAt). `_ggLastLogSec`
  // paces the periodic §GHOST_GROUND_TICK diagnostic by FILM seconds so bake (2219 frames) and
  // rehearsal (~600 frames) log at the same real cadence.
  var _ggFired = false, _ggLastLogSec = -1;

  // ══ §CPE_BUILDUP_WORK_PACED — the film advances by WORK, not by calendar ══════════════════════
  // User, after two bakes: "construction came on too fast.. is the path and TM consistent?" — and
  // their logs said no: 210/63,421 placed at t=0.054 in one run, 15,485/63,416 at t=0.053 in another.
  // The cursor was stepping linearly in DAYS while the derived 4D order dumps thousands of elements
  // at nearby timestamps, so a quarter of the model appeared in the first 5% of the film and the
  // rest of the film had little left to raise.
  //
  // Film fraction -> the k-th element PLACED, not the k-th day. 10% of the film is 10% of the
  // building on any model, and it no longer depends on how the generated timestamps cluster — which
  // is the consistency the user actually asked for.
  var _wpSched = null, _wpTried = false;

  function _workPacingArm() {
    _wpTried = true; _wpSched = null;
    if (typeof window.tmWorkSchedule !== 'function') {
      // DEGRADE, DON'T DISABLE — the §CPE_GHOST_GROUND lesson, applied up front. A stale cached
      // time_machine.js must cost pacing quality, never the film.
      console.log('§CPE_BUILDUP_PACING mode=calendar reason=tmWorkSchedule unavailable (older time_machine.js) — film advances by DAYS, work may arrive in bursts');
      return false;
    }
    var sch = window.tmWorkSchedule();
    if (!sch || !sch.total || !(sch.projectEnd > sch.projectStart)) {
      console.log('§CPE_BUILDUP_PACING mode=calendar reason=no usable work schedule');
      return false;
    }
    _wpSched = sch;
    console.log('§CPE_BUILDUP_PACING mode=work ops=' + sch.total +
      ' — t=0.10 now means 10% of the ELEMENTS placed, not 10% of the days elapsed' +
      ' (this model puts ' + (sch.workInFirstTenthOfCalendar * 100).toFixed(1) + '% of its work in the first 10% of its calendar)');
    return true;
  }

  // The cursor this frame should ask for. Pure function of the film fraction, so preview and bake
  // cannot diverge and two runs of the same film ask for identical cursors.
  function _workCursorAt(tFilm, bkState) {
    if (!_wpTried) _workPacingArm();
    var t = Math.max(0, Math.min(1, tFilm));
    if (!_wpSched) return bkState.projectStart + t * (bkState.projectEnd - bkState.projectStart);
    if (t <= 0) return _wpSched.projectStart;
    if (t >= 1) return _wpSched.projectEnd;
    // k-th completion. `ends` is sorted, so this is the instant at which exactly k ops are done.
    var k = Math.round(t * _wpSched.total);
    if (k < 1) return _wpSched.projectStart;
    if (k >= _wpSched.total) return _wpSched.projectEnd;
    return _wpSched.ends[k - 1];
  }

  function _workPacingReset() { _wpSched = null; _wpTried = false; }

  // ══ §CPE_BUILDUP_TOPOUT (2026-08-02) — the ending beats dwell on the FINISHED building ═════════
  // User, on the 1761-frame Hospital bake: "the top roof solar panels never gets to be shown - it
  // stops shy of the last task." The log agreed: placed=62700/63421 at frame 1740 (t=0.989),
  // 63421/63421 only on the final frame — the last 721 elements landed inside the closing orbit's
  // final ~1.4s, where nothing is on screen long enough to register. The buildup used to ride the
  // film fraction 1:1, so BY CONSTRUCTION 100% completion coincided with the film's last frame and
  // the topping-out was unwatchable on every plan.
  // The rule: the buildup completes at the START of the closing orbit (plan.beats.rise — the same
  // §CINEMA_BEATS fraction §CPE_ROOM_TITLE_DIVE already reads), so the pull-back shows the roof
  // topping out and the orbit circles the completed building. Work pacing (§CPE_BUILDUP_WORK_PACED)
  // is untouched — the same even element rate, compressed onto [0, topoutU] instead of [0, 1].
  var BUILDUP_TOPOUT_FALLBACK_U = 0.92;  // ≈ the orbit boundary on measured plans (Hospital 0.929),
                                         // used only when a plan carries no beats (older cache).
  function _buildupTopoutU(plan) {
    if (plan && plan.beats && plan.beats.rise > 0 && plan.beats.rise < 1) {
      return { u: plan.beats.rise, src: 'plan.beats.rise' };
    }
    return { u: BUILDUP_TOPOUT_FALLBACK_U, src: 'fallback(no beats on plan)' };
  }
  // Pure, exposed below as APP.buildupTAt: film fraction -> buildup fraction. Witnessable without a bake.
  function _buildupTAt(tFilm, plan) {
    var top = _buildupTopoutU(plan);
    var t = Math.max(0, Math.min(1, tFilm));
    return top.u < 1 ? Math.min(1, t / top.u) : t;
  }

  // Called ONCE per preview/bake, after the buildup timeline is in force. Returns true when armed.
  function _ghostGroundArm(bkState) {
    var A = window.APP;
    _ggSched = null; _ggTried = true;
    // ⚠ NO `A.ground.visible` GUARD. The ground plane is turned on by photoreal STAGING, which runs
    // per frame INSIDE the capture loop (§PHOTO_STAGING on -> §GROUND_MAP key=paved) and off again
    // after each frame. Arming happens once, BEFORE that loop, when the plane is still hidden — so a
    // visibility check here skipped the whole feature on every real bake (user, 2026-07-31: no
    // §GHOST_GROUND_SCHEDULE line and no `groundOpacity=` in §CPE_BUILDUP anywhere in their log).
    // Setting opacity on a hidden plane costs nothing and is correct the moment staging shows it.
    if (!A || !A.ground || !A.ground.material) {
      console.log('§GHOST_GROUND skip reason=no ground plane/material on APP'); return false;
    }
    // ⚠ These two used to `return false` SILENTLY, which cost a live debugging round-trip: the user
    // ran three full bakes with no §GHOST_GROUND line of any kind and no way to tell whether the
    // feature was absent, skipped, or broken. A refusal that says nothing is indistinguishable from
    // code that was never deployed. Every exit names itself now — "make the logs tell u".
    if (!bkState) { console.log('§GHOST_GROUND skip reason=no buildup state'); return false; }
    // ⚠ DEGRADE, DO NOT DISABLE. This feature spans three files (cinema_maxq + time_machine + tools),
    // and a service worker can serve one of them from an older cache — which silently killed it twice
    // in live testing. The precise rule needs `tmGroundSchedule`; when that is absent we fall back to
    // `tmPlacedCount`, which has existed since the buildup shipped, and say so in the log. A feature
    // that spans modules must not have a single point of version failure.
    var usingFallback = (typeof window.tmGroundSchedule !== 'function');
    if (usingFallback && typeof window.tmPlacedCount !== 'function') {
      console.log('§GHOST_GROUND skip reason=neither tmGroundSchedule nor tmPlacedCount is available');
      return false;
    }
    var z = A.groundIfcZ;
    if (!isFinite(z)) { console.log('§GHOST_GROUND skip reason=no groundIfcZ (tools.js §GROUND_Y never ran)'); return false; }
    var span = bkState.projectEnd - bkState.projectStart;
    if (!(span > 0)) {
      console.log('§GHOST_GROUND skip reason=buildup span is ' + span + ' (projectStart=' + bkState.projectStart +
        ' projectEnd=' + bkState.projectEnd + ')'); return false;
    }
    var sched = usingFallback ? null : window.tmGroundSchedule(z);
    if (!usingFallback) {
      if (!sched || !sched.aboveTotal) { console.log('§GHOST_GROUND skip reason=no above-ground work in this timeline'); return false; }
      // A model with NOTHING below ground has no substructure to reveal — ghosting it would be a lie
      // about that building. Self-disabling, not a special case anyone has to configure.
      if (!sched.belowTotal) { console.log('§GHOST_GROUND skip reason=this model has no below-ground elements (nothing to reveal)'); return false; }
    } else {
      // Coarse proxy: without tmGroundSchedule we cannot tell a pile cap from a parapet, so we
      // cannot locate a precise "first above-ground element" moment either. Arm as if that moment
      // is essentially the start of the buildup (firstT ~ 0 below) — strictly better than the
      // feature vanishing, and consistent with the precise rule's own intent (fire immediately).
      if (!bkState.ops) { console.log('§GHOST_GROUND skip reason=fallback needs an op count and bkState.ops is ' + bkState.ops); return false; }
      sched = { fallback: true, aboveTotal: bkState.ops, belowTotal: 0, ends: null, firstAboveMs: bkState.projectStart };
    }
    _ggSched = sched;
    _ggFired = false; _ggLastLogSec = -1;
    // §GHOST_GROUND_LIVE_TRIGGER (2026-08-03 fix — was §CPE_GHOST_GROUND_TRIGGER stuck-at-floor bug):
    // #1148 computed ONE threshold, `calendarFirstT` — a CALENDAR-time fraction — and compared it
    // against `tFilm` every frame. That was right while the buildup cursor stepped linearly through
    // the calendar, but §CPE_BUILDUP_WORK_PACED (same day) turned `tFilm` into an ELEMENTS-PLACED
    // fraction instead (`_workCursorAt`: t=0.10 means the 10th-percentile element by completion
    // order, not 10% of the calendar) — two different clocks being compared directly, which is why a
    // real bake sat pinned at the GHOST floor well past the point above-ground elements had visibly
    // started placing (t=0.035, placed=2238/63418, groundOpacity=0.220 exactly — v=0, never fired).
    //
    // FIX: use the SAME clock `tFilm` is actually expressed in. When work-pacing is active, that is
    // an ELEMENTS-fraction — the fraction of ALL ops (by end_ts order, exactly `_wpSched.ends`'
    // own order) placed by the time the first above-ground op lands. Binary-searching
    // `sched.firstAboveMs`'s RANK in that same sorted array gives the identical value
    // `_workCursorAt` would invert back to `firstAboveMs` at — i.e. `_workCursorAt(elementsFirstT)
    // === firstAboveMs` by construction. When work-pacing is NOT active, `_workCursorAt` itself
    // degrades to calendar-linear, so `calendarFirstT` is correct there instead — same branch
    // `_workCursorAt` takes, mirrored here rather than reasoned about independently.
    //
    // ⚠ This MUST stay a single precomputed constant, not something derived from "the first tFilm
    // this function happens to be called with" — G-GG-6 (witness_cpe_ghost_ground.js) exists
    // specifically because a per-call/first-observed-sample threshold makes the curve depend on
    // sampling density: the bake (2219 frames) and a 600-frame rehearsal would then trace DIFFERENT
    // curves for the identical film (measured 2026-07-31, 0.3653 vs 0.4006 at t=0.02). A live
    // `cursorMs` value is still read below, but ONLY to log when the real cursor confirms the
    // precomputed threshold — never to move the threshold itself.
    var calendarFirstT = sched.firstAboveMs == null ? 1 : (sched.firstAboveMs - bkState.projectStart) / span;
    var elementsFirstT = null, elementsFirstTSrc = 'work schedule unavailable';
    if (!_wpTried) _workPacingArm();  // force-arm early so this bake's OWN schedule is what the
                                       // threshold is computed from, not a race with frame 0.
    if (sched.firstAboveMs != null && _wpSched && _wpSched.total) {
      var _ends = _wpSched.ends, _lo = 0, _hi = _ends.length;
      while (_lo < _hi) { var _mid = (_lo + _hi) >>> 1; if (_ends[_mid] < sched.firstAboveMs) _lo = _mid + 1; else _hi = _mid; }
      elementsFirstT = (_lo + 1) / _wpSched.total;
      elementsFirstTSrc = 'rank ' + (_lo + 1) + '/' + _wpSched.total + ' in the full end_ts order';
    }
    // The domain `tFilm` is ACTUALLY in: elements-fraction when work-pacing armed (mirrors
    // `_workCursorAt`'s own branch), else calendar-fraction (mirrors its degrade branch).
    var firstT = elementsFirstT != null ? elementsFirstT : calendarFirstT;
    _ggSpan = { start: bkState.projectStart, end: bkState.projectEnd, span: span,
                firstT: firstT, calendarFirstT: calendarFirstT, elementsFirstT: elementsFirstT };
    var m = A.ground.material;
    _ggSaved = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
    console.log('§GHOST_GROUND armed rule=' + (sched.fallback ? 'FALLBACK(immediate proxy — tmGroundSchedule unavailable)' : 'first above-ground element') +
      ' aboveOps=' + sched.aboveTotal + ' belowOps=' + sched.belowTotal +
      ' firstAboveMs=' + (sched.firstAboveMs == null ? 'none' : Math.round(sched.firstAboveMs)) +
      ' triggerT=' + firstT.toFixed(4) + ' (domain=' + (elementsFirstT != null ? 'elements-placed' : 'calendar') + ')' +
      ' calendarFractionT=' + calendarFirstT.toFixed(4) +
      ' elementsFractionT=' + (elementsFirstT == null ? 'n/a(' + elementsFirstTSrc + ')' : elementsFirstT.toFixed(4) + '(' + elementsFirstTSrc + ')') +
      ' — #1148 always used calendarFractionT even when tFilm is elements-placed; this is the divergence that pinned opacity at the floor' +
      ' ghost=' + GHOST_OPACITY + ' maxRiseSec=' + GHOST_FADE_SEC);
    return true;
  }

  // Per frame. `tFilm` is the film fraction driving the cursor; `totalSec` the film's length;
  // `cursorMs` is the REAL cursor the buildup just set (`window.tmSetCursor`'s argument this frame)
  // — same value `tmPlacedCount(cursorMs)` in §CPE_BUILDUP's log line is queried against, passed
  // through ONLY as a confirmatory/diagnostic signal (see §GHOST_GROUND_LIVE_TRIGGER below — the
  // actual trigger point is the precomputed `_ggSpan.firstT`, never `cursorMs` directly). Opacity
  // follows a single smoothstep from `_ggSpan.firstT` to opaque, over at most GHOST_FADE_SEC of
  // FILM time — §CPE_GHOST_GROUND_TRIGGER above: first-above-ground-element trigger (#1110/#1148).
  //
  // §GHOST_GROUND_LIVE_TRIGGER (2026-08-03, fixes the stuck-at-floor regression in #1148):
  // #1148 computed `firstT` ONCE at arm time as a CALENDAR-fraction (`(firstAboveMs - projectStart)
  // / span`) and compared it against `tFilm` every frame. That was correct while the buildup cursor
  // stepped linearly through the calendar — but §CPE_BUILDUP_WORK_PACED (landed the same day) turned
  // `tFilm` into an ELEMENTS-PLACED fraction instead (`_workCursorAt`: t=0.10 means the
  // 10th-percentile element by completion order, not 10% of the calendar). Real bake evidence:
  // `t=0.035 placed=2238/63418` (2238/63418=0.0353≈t — proving `tFilm` IS the elements fraction),
  // while `groundOpacity` sat pinned at the 0.22 floor — the calendar-fraction `firstT` and the
  // elements-fraction `tFilm` were two different clocks that had drifted apart on this (bursty)
  // schedule (`§GHOST_GROUND armed` now logs both candidates so the gap is visible without
  // re-deriving it).
  //
  // FIX: `_ghostGroundArm` now precomputes `firstT` in the SAME domain `tFilm` is actually in —
  // an elements-placed fraction (the RANK of `firstAboveMs` within the full end_ts order,
  // `_workCursorAt`'s own indexing) whenever work-pacing is armed, else the calendar-fraction
  // (matching `_workCursorAt`'s own degrade branch). `firstT` stays a SINGLE PRECOMPUTED CONSTANT
  // per arm — NOT re-derived from whatever `tFilm`/`cursorMs` this function is first called with —
  // because a per-call/first-observed threshold makes the fade curve depend on sampling density,
  // which is exactly what G-GG-6 (witness_cpe_ghost_ground.js) was written to catch (measured
  // 2026-07-31: a 2219-frame bake and a 600-frame rehearsal traced DIFFERENT curves for the
  // identical film, 0.3653 vs 0.4006 at t=0.02, under an earlier per-call rate limiter design).
  // `cursorMs` is still read below, but only to log a one-shot CONFIRMATION the moment the real
  // cursor independently agrees the threshold has been crossed — it never moves the threshold.
  function _ghostGroundAt(tFilm, totalSec, bkState, cursorMs) {
    var A = window.APP;
    // LAZY ARM. Arming used to happen once, before the frame loop, which made the feature hostage to
    // state that is only true later (the ground plane is not even visible until photoreal staging
    // runs INSIDE the loop — that exact ordering disabled it in live testing). Arming on the first
    // tick removes the ordering dependency entirely; `_ggTried` keeps it a one-shot so a genuine
    // refusal is not re-logged 1137 times.
    if (!_ggSched && !_ggTried && bkState) { _ggTried = true; _ghostGroundArm(bkState); }
    if (!_ggSched || !A || !A.ground || !A.ground.material) return null;
    var t = Math.max(0, Math.min(1, tFilm));
    var haveCursor = isFinite(cursorMs);
    var fired = t >= _ggSpan.firstT;
    if (fired && !_ggFired) {
      _ggFired = true;
      console.log('§GHOST_GROUND_TRIGGER_FIRED tFilm=' + t.toFixed(4) +
        ' firstT=' + _ggSpan.firstT.toFixed(4) +
        ' cursorMs=' + (haveCursor ? Math.round(cursorMs) : 'n/a') +
        ' firstAboveMs=' + Math.round(_ggSched.firstAboveMs) +
        ' cursorConfirms=' + (haveCursor ? (cursorMs >= _ggSched.firstAboveMs ? 1 : 0) : 'n/a') +
        ' — first above-ground element is now placed; ground begins returning to opaque from here');
    }
    // A floor on how FAST the ramp may happen, so a batch of ops landing together cannot snap the
    // ground opaque. ⚠ Expressed against the film's own clock, NOT against the previous call: a
    // per-call rate limiter makes the curve depend on how densely it is sampled, and the bake
    // (2219 frames) and the rehearsal (~600) then trace different curves for the same film.
    // Measured 2026-07-31 — G-GG-6 caught exactly that, 0.3653 vs 0.4006 at t=0.02.
    var fadeFrac = (totalSec > 0) ? Math.min(0.5, GHOST_FADE_SEC / totalSec) : 0.05;
    var v = Math.max(0, Math.min(1, (t - _ggSpan.firstT) / Math.max(1e-6, fadeFrac)));
    var o = GHOST_OPACITY + (1 - GHOST_OPACITY) * (v * v * (3 - 2 * v));   // smoothstep, no cut
    var m = A.ground.material, solid = o > 0.999;
    m.opacity = o;
    m.transparent = !solid;
    // A translucent floor that writes depth can occlude other transparent geometry drawn after it;
    // the opaque substructure is already in the depth buffer either way. Restored with the rest.
    m.depthWrite = solid;
    // §GHOST_GROUND_TICK: periodic diagnostic (every ~5 FILM seconds, while still ghosted/fading) —
    // the gap #1148 shipped with no visibility in between "armed" and "restored". Shows the raw
    // comparison so a future session can see EXACTLY why/when the trigger did or didn't fire,
    // without re-instrumenting the file first.
    if (o < 0.999 && totalSec > 0) {
      var _sec5 = Math.floor(t * totalSec / 5);
      if (_sec5 !== _ggLastLogSec) {
        _ggLastLogSec = _sec5;
        console.log('§GHOST_GROUND_TICK tFilm=' + t.toFixed(4) + ' firstT=' + _ggSpan.firstT.toFixed(4) +
          ' cursorMs=' + (haveCursor ? Math.round(cursorMs) : 'n/a') +
          ' firstAboveMs=' + Math.round(_ggSched.firstAboveMs) +
          ' fired=' + (fired ? 1 : 0) + ' fallback=' + (_ggSched.fallback ? 1 : 0) +
          ' opacity=' + o.toFixed(3));
      }
    }
    return o;
  }

  function _ghostGroundRestore() {
    var A = window.APP;
    _ggSched = null; _ggTried = false; _ggFired = false; _ggLastLogSec = -1;
    if (_ggSaved && A && A.ground && A.ground.material) {
      var m = A.ground.material;
      m.transparent = _ggSaved.transparent; m.opacity = _ggSaved.opacity; m.depthWrite = _ggSaved.depthWrite;
      console.log('§GHOST_GROUND restored opacity=' + m.opacity + ' transparent=' + m.transparent);
    }
    _ggSaved = null;
  }

  // Reorganized 2026-08-04 into one clause per line for readability — no §TAG dropped, content
  // byte-verified against the pre-reorg single-line blob before this landed. Version NOT bumped:
  // this is a formatting-only change, zero behaviour touched (cinema_maxq.js's bake loop is
  // deliberately untouched by the whole §CPE_SCRUB/§CPE_VIEWFINDER/§CPE_AIM_PIN lane — see those
  // features' own witness gates that grep this file for zero references to their hooks).
  var MAXQ_V = 'v22 (' +
    '§GHOST_GROUND_LIVE_TRIGGER fixes #1148 stuck-at-floor regression — the trigger now compares the REAL cursor to firstAboveMs directly (same clock, epoch ms) instead of pre-converting firstAboveMs into a calendar-fraction and comparing it against tFilm, which §CPE_BUILDUP_WORK_PACED (same day) had turned into an ELEMENTS-placed fraction — two different clocks; ' +
    'adds §GHOST_GROUND_TRIGGER_FIRED (one-shot, exact frame the trigger fires) and §GHOST_GROUND_TICK (periodic, every ~5 film-seconds while still ghosted) so a future session never has to re-instrument this file blind again; ' +
    '§CPE_GHOST_GROUND_TRIGGER history: #1110 first-above-ground-element, #1112 5% above-ground-SHARE ratio, #1148 reverted to #1110 (still broken live until this fix), keeping the #1113-1115 hardening (degrade-not-disable, refusal logging, lazy arm-on-first-tick); ' +
    '§CPE_BUILDUP_WORK_PACED the film advances by ELEMENTS PLACED, not by calendar days — 10% of the film is 10% of the building on any model; ' +
    '§CPE_BUILDUP_FOLLOW_TM — the buildup PLAYS the Time Machine timeline, it does not author one; ' +
    '§CPE_PREVIEW_AFTER_RETIRED — OK records, no rehearsal either side of the editor; ' +
    '§CPE_PREVIEW_REDUNDANT pre-editor rehearsal removed; ' +
    '§CPE_CLIP in/out window remaps poseAt + scales frames; ' +
    '§MAXQ_HIDDEN_PAUSE — a hidden tab parks the bake instead of ruining it; ' +
    '§MAXQ_QUALITY health line)';
  console.log('§MAXQ_LOADED ' + MAXQ_V);
  var MAXQ_N_FRAMES = 360, MAXQ_FPS = 15;  // 24s clip (360/15) — opts-overridable
  var SETTLE_MS = 250;   // teardown→restage settle. Flicker fix, PoC-proven: without it the next
                         // staging captures mid-restore sun-tint/exposure values as "original"
                         // and the whole building oscillates color frame-to-frame.
  var IDB_NAME = 'bim_ootb_cinema_maxq', IDB_STORE = 'frames';
  var _active = false, _cancel = false;
  // §MAXQ_WAKELOCK (user 2026-07-19: left the machine, bake paused until they came back — the
  // screen slept and rAF throttled with it). Hold a screen wake lock for the duration of the
  // bake+stitch so an unattended machine keeps rendering; re-acquire on visibilitychange (the
  // browser auto-releases the lock when the tab hides). Best-effort — browsers without the API
  // just log unavailable, and the standing rule stays: keep the tab VISIBLE (rAF throttles in
  // hidden tabs regardless of any lock; frames are never lost, the bake just waits).
  var _wakeLock = null, _wakeWired = false;
  async function _wakeAcquire() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        _wakeLock = await navigator.wakeLock.request('screen');
        console.log('§MAXQ_WAKELOCK acquired (screen stays awake for the bake)');
        if (!_wakeWired) {
          _wakeWired = true;
          document.addEventListener('visibilitychange', function() {
            if (_active && document.visibilityState === 'visible' && (!_wakeLock || _wakeLock.released)) _wakeAcquire();
          });
        }
      } else {
        console.log('§MAXQ_WAKELOCK unavailable — keep the tab visible and screen awake manually');
      }
    } catch (e) { console.log('§MAXQ_WAKELOCK denied: ' + e.message); }
  }
  function _wakeRelease() {
    try { if (_wakeLock && !_wakeLock.released) _wakeLock.release(); } catch (e) {}
    _wakeLock = null;
  }

  // §MAXQ_HIDDEN_PAUSE — THE chokepoint, found by probing the browser rather than reasoning about
  // it. requestAnimationFrame does not merely slow down in a hidden tab, it STOPS: a probe counted
  // rAF ticks frozen at exactly 167 for a full 6s of hiding, resuming only on reveal. So every
  // `await _raf2()` in the bake blocks indefinitely while hidden — the loop parks HERE, before any
  // frame-boundary or fold-timeout check can run, which is why the first cut of this fix logged
  // hiddenPauses=0 after being hidden for 20 real seconds. Waiting for visibility FIRST is what
  // makes the pause observable; the rAF-vs-timeout race then covers the case where the tab hides
  // between the check and the callback, so a lost frame cannot wedge a multi-minute bake.
  function _raf2(why) {
    return (async function() {
      for (;;) {
        if (_isHidden()) await _awaitVisible(why || 'render tick');
        var got = await new Promise(function(r) {
          var settled = false;
          var fin = function(v) { if (!settled) { settled = true; r(v); } };
          requestAnimationFrame(function() { requestAnimationFrame(function() { fin(true); }); });
          setTimeout(function() { fin(false); }, 1500);
        });
        if (got) return;
      }
    })();
  }
  function _sleep(ms) { return new Promise(function(res) { setTimeout(res, ms); }); }
  function _status(t) { var A = window.APP; if (A && A.status) A.status.textContent = t; }

  // §CPE_MAXQ_STATUS_DAY_LABEL (CINEMA_PATH_EDITOR.md) — Day # and current room label, appended
  // to the same per-frame status line §CPE_STICK_APPROACH already writes to. Pure and exposed on
  // APP below (same treatment as `A.dayCounterAt`/`A.roomTitleOpacityAt` themselves) so the
  // witness can gate this exact composition without spinning up a live bake — `dayInfo`/
  // `titleInfo` are exactly the objects the per-frame loop already computed for the canvas-
  // compositing path (_captureFrame), this function only formats them into the two extra
  // status-line segments. Nothing is recomputed: `dayInfo` null means the day-counter is off for
  // this bake (§CPE_DAY_COUNTER, `_dayPos === 'off'`); `titleInfo`/`titleInfo.name` null/empty
  // means §CPE_ROOM_TITLE is off or the walk is between rooms (no active caption) — both segments
  // are omitted entirely rather than ever printing "Day null/null" or empty quotes.
  function _maxqStatusDayRoomSegs(dayInfo, titleInfo) {
    var dayTxt = (dayInfo && dayInfo.day != null && dayInfo.totalDays != null)
      ? ', Day ' + dayInfo.day + '/' + dayInfo.totalDays : '';
    var roomTxt = (titleInfo && titleInfo.name) ? ', "' + titleInfo.name + '"' : '';
    return { dayTxt: dayTxt, roomTxt: roomTxt };
  }

  // §CINEMA_DAMPING_BLEED (2026-07-26 — PHOTOREAL_STILL_RENDER.md §CINEMA_DAMPING_BLEED).
  // Both authored loops below (the 10s path preview AND the frame bake) do
  // camera.position.set(pose) → controls.update(). OrbitControls.update() recomputes the position
  // from its own spherical state with the dampened deltas applied, OVERWRITING the authored pose.
  // With scene.js's dampingFactor=0.08 the residual from whatever the user did right before Alt+C
  // bleeds in at 1.637% of the look distance on frame 0, decaying by exactly 1-dampingFactor per
  // frame — the reported "slight twitch at the first second of the movie". Damping is an
  // interaction affordance; an authored camera must not be subject to it. Paired with
  // _wakeAcquire/_wakeRelease so every exit path that releases the wake lock releases this too.
  var _dampSaved = null;
  function _dampHold() {
    var A = window.APP;
    if (!A || !A.controls || _dampSaved !== null) return;
    _dampSaved = A.controls.enableDamping;
    A.controls.enableDamping = false;
    A.controls.update();   // flush the residual BEFORE the first authored pose
    console.log('§CINEMA_DAMPING_BLEED held (enableDamping ' + _dampSaved + ' -> false for preview+bake)');
  }
  function _dampRelease() {
    var A = window.APP;
    if (_dampSaved === null) return;
    if (A && A.controls) A.controls.enableDamping = _dampSaved;
    console.log('§CINEMA_DAMPING_BLEED released (enableDamping restored to ' + _dampSaved + ')');
    _dampSaved = null;
  }

  // §MAXQ_IDB — open must NEVER hang silently. An earlier run that exited abnormally (or a second
  // app tab still holding a connection) leaves _idbDestroy's deleteDatabase() pending-blocked, and
  // every later open() then queues behind it FOREVER with no event, no error, no log — the exact
  // "stuck right after §MAXQ_PREVIEW done, zero further lines" report (LTU, v810/MAXQ v7).
  // Three guards: track+close our own connection, purge any pending delete BEFORE opening, and
  // race the whole thing against a timeout so a block surfaces as a clean §MAXQ_FAIL abort.
  var IDB_OPEN_TIMEOUT_MS = 5000;
  var _db = null;
  function _idbDelete() {
    return new Promise(function(res) {
      var rq;
      try { rq = indexedDB.deleteDatabase(IDB_NAME); } catch (e) { return res(false); }
      rq.onsuccess = function() { res(true); };
      rq.onerror = function() { res(false); };
      rq.onblocked = function() {
        console.warn('§MAXQ_IDB_BLOCKED delete blocked — another tab holds ' + IDB_NAME + ' open');
        res(false);
      };
      setTimeout(function() { res(false); }, IDB_OPEN_TIMEOUT_MS);
    });
  }
  function _idbOpen() {
    return new Promise(function(res, rej) {
      var settled = false;
      var timer = setTimeout(function() {
        if (settled) return;
        settled = true;
        rej(new Error('idb-open-timeout'));
      }, IDB_OPEN_TIMEOUT_MS);
      var done = function(fn, arg) {
        if (settled) { try { if (arg && arg.close) arg.close(); } catch (e) {} return; }
        settled = true; clearTimeout(timer); fn(arg);
      };
      var rq;
      try { rq = indexedDB.open(IDB_NAME, 1); } catch (e) { return done(rej, e); }
      rq.onupgradeneeded = function() { rq.result.createObjectStore(IDB_STORE); };
      rq.onsuccess = function() {
        var db = rq.result;
        // A later version-change request (another tab, or our own next-run delete) must not find
        // this connection still open — close on demand instead of becoming the zombie blocker.
        db.onversionchange = function() { try { db.close(); } catch (e) {} if (_db === db) _db = null; };
        done(res, db);
      };
      rq.onerror = function() { done(rej, rq.error || new Error('idb-open-error')); };
      rq.onblocked = function() {
        console.warn('§MAXQ_IDB_BLOCKED open blocked behind a pending delete of ' + IDB_NAME);
      };
    });
  }
  function _idbPut(db, k, v) {
    return new Promise(function(res, rej) {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(v, k);
      tx.oncomplete = res; tx.onerror = function() { rej(tx.error); };
    });
  }
  function _idbGet(db, k) {
    return new Promise(function(res, rej) {
      var rq = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(k);
      rq.onsuccess = function() { res(rq.result); };
      rq.onerror = function() { rej(rq.error); };
    });
  }
  function _idbDestroy(db) {
    try { if (db) db.close(); } catch (e) {}
    if (_db === db) _db = null;
    return _idbDelete();
  }

  // Deterministic staging randomness for the duration of each trigger — identical PRNG sequence
  // every frame → zero paint/puddle/skyline-sparkle flicker (staffage is NOT re-placed here; the
  // user's pre-placed Alt+P layout is ordinary scene state and stays fixed on its own).
  var _seed = 0;
  function _freezeRandom() {
    if (!window.__maxqOrigRandom) window.__maxqOrigRandom = Math.random;
    _seed = 987654321;
    Math.random = function() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; };
  }
  function _restoreRandom() { if (window.__maxqOrigRandom) Math.random = window.__maxqOrigRandom; }

  // ══ §MAXQ_HIDDEN_PAUSE (PHOTOREAL_STILL_RENDER.md §MAXQ_HIDDEN_PAUSE, 2026-07-27).
  //
  // A backgrounded tab does not merely slow the bake down — it RUINS it, silently. Chrome throttles
  // rAF to a near-stop when hidden, so the per-frame TAA fold + §PHOTO_AO never converge,
  // _waitFoldDone's wall-clock timeout expires, and §MAXQ_FRAME_TIMEOUT saves a frame that never
  // finished. Consecutive such captures come out near-duplicates, so the delivered MP4 ends in a
  // stretch of visually dead video. It does not throw, it does not stop, and the file plays fine:
  // the user lost a 45s Hospital film to this and only knew because they remembered the tab was
  // unfocused — a measurement pass looking for defects had already mis-attributed it to pacing.
  //
  // NOT re-plumbed onto timers, and the reason is physical rather than stylistic: a hidden tab does
  // not reliably composite WebGL at all, so a timer-driven fold would accumulate nothing either. It
  // would fail identically while looking fixed. A converged frame cannot be rendered in a
  // backgrounded tab, so the only honest behaviour is to refuse to pretend.
  var _hiddenMsTotal = 0, _hiddenPauses = 0, _unconverged = 0;
  function _isHidden() { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; }
  // Resolves as soon as the tab is visible. `why` is logged so a pasted console shows WHERE the bake
  // was parked, not merely that it was slow.
  function _awaitVisible(why) {
    if (!_isHidden()) return Promise.resolve(0);
    return new Promise(function(res) {
      var t0 = performance.now();
      _hiddenPauses++;
      console.log('§MAXQ_HIDDEN_PAUSE at ' + why + ' — tab is hidden; the bake is PARKED, not ' +
        'degrading. A hidden tab cannot converge a frame, so advancing here would save unconverged ' +
        'frames and silently ruin the film. Bring the tab back to resume.');
      _status('⏸ Paused — bring this tab back to the front to continue the bake');
      // Two things can notice the reveal — the visibilitychange listener and the poll below — and
      // without this guard BOTH run, so the hidden time is added twice. Measured: one 20516ms pause
      // reported totalHiddenMs=40908. A health line that overstates is as useless as one that lies.
      var settled = false;
      var done = function() {
        if (_isHidden() || settled) return;
        settled = true;
        document.removeEventListener('visibilitychange', done);
        var ms = performance.now() - t0;
        _hiddenMsTotal += ms;
        console.log('§MAXQ_HIDDEN_RESUME at ' + why + ' hiddenMs=' + Math.round(ms) +
          ' totalHiddenMs=' + Math.round(_hiddenMsTotal) + ' pauses=' + _hiddenPauses);
        res(ms);
      };
      document.addEventListener('visibilitychange', done);
      // Belt and braces: visibilitychange is the signal, but a poll means a missed event cannot
      // wedge a multi-minute bake forever.
      (function poll() { if (_isHidden()) return setTimeout(poll, 250); done(); })();
    });
  }
  // The fold's budget must be measured in VISIBLE time, AND the wait must itself park when the tab
  // goes hidden. Parking only at the frame boundary is not enough and the witness proved it: a
  // 20s hide landed entirely inside ONE frame's cook (swiftshader frames are slow), so the loop
  // never reached the boundary check, nothing was logged, and the run reported hiddenPauses=0 while
  // having been hidden for 20 seconds. A pause that does not announce itself is the same silent
  // failure this whole section exists to kill — so the wait reports through the same bookkeeping.
  async function _waitFoldDone(timeoutMs, why) {
    var A = window.APP;
    var spentVisible = 0, last = performance.now();
    for (;;) {
      if (_isHidden()) { await _awaitVisible(why); last = performance.now(); }
      if (!A._stillRefineBusy) return true;
      if (spentVisible > timeoutMs) return false;
      await _sleep(100);
      var now = performance.now();
      spentVisible += now - last;
      last = now;
    }
  }

  // One explicit composer render, then SAME-TASK drawImage into a 2D canvas (clash_snag.js's
  // proven capture pattern — the WebGL buffer is only guaranteed valid within the task that drew it).
  // §CPE_ROOM_TITLE: titleInfo ({name, opacity}, or null/opacity<=0) is composited onto THIS 2D
  // context, after the WebGL frame is drawn in but before toBlob — the only point that reaches the
  // actual exported bytes (RESUME_CPE_ROOM_TITLE.md §2's trap: a DOM caption never would).
  // §CPE_DAY_COUNTER: dayInfo ({day,totalDays} or null) rides the SAME 2D context for the SAME
  // reason as titleInfo — this is the only point that reaches the exported bytes. Drawn after the
  // caption; they occupy different corners (lower-third vs top right) so neither can clip the other.
  function _captureFrame(w, h, titleInfo, dayInfo) {
    var A = window.APP;
    if (A._composer) A._composer.render();
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(A.renderer.domElement, 0, 0, w, h);
    if (titleInfo && titleInfo.opacity > 0 && A.roomTitleCompositeOntoCanvas) {
      A.roomTitleCompositeOntoCanvas(ctx, w, h, titleInfo.name, titleInfo.opacity);
    }
    if (dayInfo && dayInfo.pos !== 'off' && A.dayCounterCompositeOntoCanvas) {
      A.dayCounterCompositeOntoCanvas(ctx, w, h, dayInfo, 1, dayInfo.pos);
    }
    return new Promise(function(res) { c.toBlob(res, 'image/webp', 0.92); });
  }

  // §MAXQ_MP4 — mp4/H.264 stitch (preferred path). Spec: PHOTOREAL_STILL_RENDER.md §MAXQ_MP4 SPEC.
  // WHY: the webm/VP9 the MediaRecorder path produces does not play on iPhone or in WhatsApp, which
  // is the entire distribution channel this movie exists for. mp4/H.264 plays everywhere.
  // Returns true if an mp4 was produced and downloaded; false = caller must run the webm fallback.
  // Every failure mode is a clean `return false` with a §MAXQ_MP4_FALLBACK reason — never a throw,
  // because losing a finished bake to a muxing bug would be far worse than shipping webm.
  var MP4_CODECS = [
    'avc1.640034',  // High 5.2 — headroom for large canvases
    'avc1.4d0034',  // Main 5.2
    'avc1.42003c',  // Baseline 6.0 (widest device compatibility, if the encoder takes the level)
    'avc1.640028',  // High 4.0
    'avc1.42001f'   // Baseline 3.1 — the universally-supported floor
  ];
  async function _stitchMp4(db, framesDone, fps, w, h) {
    var A = window.APP;
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      console.log('§MAXQ_MP4_FALLBACK reason=no-webcodecs (VideoEncoder/VideoFrame unavailable)');
      return false;
    }
    if (!window.MP4Mux || typeof window.MP4Mux.mux !== 'function') {
      console.log('§MAXQ_MP4_FALLBACK reason=no-muxer (lib/mp4_mux.js not loaded — stale precache?)');
      return false;
    }
    // H.264 requires even dimensions; the renderer really does hand us odd sizes (1854x963 seen live).
    var ew = w & ~1, eh = h & ~1;
    // Photoreal architectural footage — generous bitrate, this is a deliverable not a stream.
    var bitrate = Math.min(50e6, Math.max(2e6, Math.round(ew * eh * fps * 0.2)));
    var enc = null, chosen = null, avcC = null, chunks = [], encErr = null;
    var t0 = performance.now();
    try {
      for (var ci = 0; ci < MP4_CODECS.length; ci++) {
        var codec = MP4_CODECS[ci];
        var cfg = { codec: codec, width: ew, height: eh, bitrate: bitrate, framerate: fps,
                    avc: { format: 'avc' }, latencyMode: 'quality' };
        var sup = false;
        try { sup = (await VideoEncoder.isConfigSupported(cfg)).supported; } catch (e) { sup = false; }
        console.log('§MAXQ_MP4 probe codec=' + codec + ' supported=' + sup);
        if (!sup) continue;
        // Mozilla bug 1918769: isConfigSupported can answer true and configure() then throws.
        // Only a real configure() proves the codec — never trust the capability query alone.
        try {
          enc = new VideoEncoder({
            output: function(chunk, md) {
              if (md && md.decoderConfig && md.decoderConfig.description && !avcC) {
                var d = md.decoderConfig.description;
                avcC = new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
              }
              var buf = new Uint8Array(chunk.byteLength);
              chunk.copyTo(buf);
              // cts = presentation timestamp; chunks arrive in DECODE order, so the muxer needs
              // this to emit a ctts box when the encoder reorders (Firefox uses B-frames).
              chunks.push({ data: buf, key: chunk.type === 'key', cts: chunk.timestamp });
            },
            error: function(e) { encErr = e.message || String(e); }
          });
          enc.configure(cfg);
          chosen = codec;
          break;
        } catch (e2) {
          console.log('§MAXQ_MP4 probe codec=' + codec + ' configure-threw=' + e2.name + ':' + e2.message);
          try { if (enc) enc.close(); } catch (e3) {}
          enc = null;
        }
      }
      if (!enc) { console.log('§MAXQ_MP4_FALLBACK reason=no-usable-h264-codec'); return false; }
      console.log('§MAXQ_MP4 configured codec=' + chosen + ' size=' + ew + 'x' + eh +
        ' bitrate=' + bitrate + ' fps=' + fps + ' frames=' + framesDone);
      _status('🎬 MaxQ encoding mp4/H.264 (' + framesDone + ' frames)…');

      var cv = document.createElement('canvas');
      cv.width = ew; cv.height = eh;
      var cx = cv.getContext('2d');
      var usPerFrame = 1e6 / fps, gop = Math.max(1, Math.round(fps * 2));
      for (var i = 0; i < framesDone; i++) {
        var bmp = await createImageBitmap(await _idbGet(db, i));
        cx.drawImage(bmp, 0, 0);
        bmp.close();
        var vf = new VideoFrame(cv, { timestamp: Math.round(i * usPerFrame), duration: Math.round(usPerFrame) });
        enc.encode(vf, { keyFrame: (i % gop) === 0 });
        vf.close();
        // Backpressure — the encoder is the slow end here, not IDB.
        while (enc.encodeQueueSize > 8) await _sleep(5);
        if (encErr) throw new Error('encoder-error: ' + encErr);
      }
      await enc.flush();
      try { enc.close(); } catch (e4) {}
      enc = null;
      if (encErr) throw new Error('encoder-error: ' + encErr);
      if (!chunks.length) { console.log('§MAXQ_MP4_FALLBACK reason=zero-chunks'); return false; }
      if (!avcC) { console.log('§MAXQ_MP4_FALLBACK reason=no-avcC-description'); return false; }
      var encMs = Math.round(performance.now() - t0);
      var totalBytes = 0;
      for (var k = 0; k < chunks.length; k++) totalBytes += chunks[k].data.length;
      console.log('§MAXQ_MP4 encoded chunks=' + chunks.length + ' bytes=' + totalBytes +
        ' avcCBytes=' + avcC.length + ' ms=' + encMs +
        ' (no real-time replay — ' + (framesDone / fps).toFixed(1) + 's of footage)');

      var mp4 = window.MP4Mux.mux({ width: ew, height: eh, fps: fps, avcC: avcC, samples: chunks });
      var blob = new Blob([mp4], { type: 'video/mp4' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'BIM_MaxQ_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.mp4';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
      console.log('§MAXQ_DONE frames=' + framesDone + ' bytes=' + blob.size + ' type=video/mp4 codec=' + chosen);
      _status('🎬 MaxQ mp4 saved (' + (blob.size / 1e6).toFixed(1) + ' MB) — plays on iPhone/WhatsApp');
      return true;
    } catch (e) {
      console.log('§MAXQ_MP4_FALLBACK reason=' + (e && e.message ? e.message : String(e)));
      try { if (enc && enc.state !== 'closed') enc.close(); } catch (e5) {}
      return false;
    }
  }

  async function _stitch(db, framesDone, fps, w, h) {
    var A = window.APP;
    console.log('§MAXQ_STITCH frames=' + framesDone + ' fps=' + fps);
    _status('🎬 MaxQ stitching ' + framesDone + ' frames (' + Math.round(framesDone / fps) + 's realtime)…');
    var proxy = document.createElement('canvas');
    proxy.width = w; proxy.height = h;
    var ctx = proxy.getContext('2d');
    var stream = proxy.captureStream(fps);
    var mime = (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))
      ? 'video/webm;codecs=vp9' : 'video/webm';
    var rec = new MediaRecorder(stream, { mimeType: mime });
    var chunks = [];
    rec.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };
    var stopped = new Promise(function(res) { rec.onstop = res; });
    var bmp0 = await createImageBitmap(await _idbGet(db, 0));
    ctx.drawImage(bmp0, 0, 0); bmp0.close();
    rec.start();
    var interval = 1000 / fps;
    for (var i = 1; i < framesDone; i++) {
      var t = performance.now();
      var bmp = await createImageBitmap(await _idbGet(db, i));
      var wait = interval - (performance.now() - t);
      if (wait > 0) await _sleep(wait);
      ctx.drawImage(bmp, 0, 0); bmp.close();
    }
    await _sleep(interval);
    rec.stop();
    await stopped;
    var blob = new Blob(chunks, { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'BIM_MaxQ_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.webm';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
    console.log('§MAXQ_DONE frames=' + framesDone + ' bytes=' + blob.size + ' type=' + mime);
    _status('🎬 MaxQ movie saved (' + (blob.size / 1e6).toFixed(1) + ' MB)');
  }

  async function start(opts) {
    var A = window.APP;
    opts = opts || {};
    if (_active) { _cancel = true; console.log('§MAXQ_CANCEL requested'); return; }
    if (!A || !A.camera || !A.controls || typeof A.startStillRefine !== 'function' ||
        typeof A.stopStillRefine !== 'function' || !A._composer) {
      console.warn('§MAXQ_FAIL prerequisites missing (mobile, or effects not initialised yet)');
      return;
    }
    if (A._stillRefineActive || A._stillRefineBusy) A.stopStillRefine(true);
    // §CINEMA_GHOST_RESET (2026-07-21, broadened): the ghost bbox shell can be on either because a
    // Find-panel lens auto-engaged it OR because the user manually cycled Alt+Z to Bbox mode
    // (tools.js `cycleXrayBboxMode`) — neither case was ever cleared before starting the orbit, so
    // a cinematic film could show the wireframe shell for its whole duration. See navigate_find.js
    // §CINEMA_GHOST_RESET (keys off visibility, not just auto-ownership).
    if (typeof A.resetCinemaGhostLens === 'function') A.resetCinemaGhostLens();
    // Same problem, same fix, for X-Ray: the SAME Alt+Z cycle can leave X-Ray engaged (transparent
    // geometry) instead of Bbox — equally wrong for a "photoreal" cinematic film, however it got on.
    if (A.xrayOn && typeof A.toggleXray === 'function') {
      A.toggleXray();
      console.log('§CINEMA_XRAY_RESET x-ray was on, turned off before orbit');
    }
    var nFrames = opts.frames || MAXQ_N_FRAMES, fps = opts.fps || MAXQ_FPS;
    _active = true; _cancel = false;
    // §MAXQ_HIDDEN_PAUSE / §MAXQ_QUALITY counters are per-RUN, not per-session — a second bake must
    // not inherit the first one's pauses or its unconverged count and report someone else's health.
    _hiddenMsTotal = 0; _hiddenPauses = 0; _unconverged = 0;
    A._maxqActive = true;   // mirror for the cinema icon's busy/done check (panels.js)
    _wakeAcquire();
    _dampHold();   // §CINEMA_DAMPING_BLEED — the preview and the bake are both authored cameras
    // §MAXQ_STREAM_FIRST (user report, LTU_AHouse/122k: preview was SEEN showing boxes — initial
    // assumption was that this was a deliberate LOD-for-speed choice. WRONG, disproven by
    // investigation: dlod_nav.js already fully disengages the instant A._maxqActive is set above,
    // every frame, so DLOD/box-proxy cannot be the source — cinema_maxq.js had zero references to
    // A.streaming. The boxes were the geometry-streaming pipeline's own unpromoted-element
    // placeholders bleeding through because nothing waited for them. Same fix as tour.js's
    // §FLY_STREAM_WAIT, reused not reinvented: wait for streaming to fully drain BEFORE the preview
    // even starts, so neither the preview nor the bake ever shows a placeholder — a mid-clip switch
    // would still visibly pop in the baked video, waiting first avoids that entirely.
    // Post-fix result, load-bearing for FLY_TOUR_DLOD_SCALE.md: the preview now renders 100% real
    // geometry — zero DLOD, zero boxes, confirmed disengaged above — across the same dive→orbit
    // path plan tour.js's Fly Tour uses (shared A.cinemaPathPlan, effects.js), at a LARGER radius
    // (envelope×2.5 here vs tour.js's measured r=255) — and runs smooth. Full real geometry at a
    // wide-orbit distance is therefore not inherently expensive; whatever makes Fly Tour lag is not
    // simply "too much real geometry in view at range."
    var _streamWaitedMs = 0;
    while (A.streaming && !_cancel) {
      _status('🎬 Waiting for geometry to finish streaming…');
      await new Promise(function(r) { setTimeout(r, 500); });
      _streamWaitedMs += 500;
    }
    if (_streamWaitedMs) console.log('§MAXQ_STREAM_WAIT ms=' + _streamWaitedMs);
    if (_cancel) {
      console.log('§MAXQ_CANCEL during stream-wait — nothing baked, nothing saved');
      _status('🎬 MaxQ cancelled');
      _active = false; _cancel = false; A._maxqActive = false;
      _wakeRelease(); _dampRelease();
      return;
    }
    // §CINEMA_PATH: fly the SAME orbit-path formula as the live-capture Cinema Orbit (push-in to
    // fill-frame → hold → band, sun-glint swoop, elliptical radius, pull-back flourish) — shared
    // plan from effects.js. Fallback: plain circle at current radius/height if the plan API is
    // unavailable (old effects.js in cache).
    // §CINEMA_ROOMS — the plan is SYNCHRONOUS but its two best data sources (A.getRoomGraph for
    // the largest interior space, and the 'exit' door nodes §CINEMA_EXIT chooses from) live in the
    // LAZY navigate bundle, which a session that never opened Find has not loaded. Warm it here,
    // where we are already async, so the film gets real rooms + real doors instead of silently
    // falling back to the bbox centre and the facade. Failure is non-fatal — the plan's fallbacks
    // (DB IfcDoor query, then nearest facade) still produce a film.
    if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) {
      try { await A.loadNavigate(); } catch (eN) { console.warn('§CINEMA_ROOMS loadNavigate failed: ' + eN.message); }
    }
    if (typeof A.ensureRooms === 'function') {
      try { await A.ensureRooms({}); } catch (eR) { console.warn('§CINEMA_ROOMS ensureRooms failed: ' + eR.message); }
    }
    var plan = null;
    if (typeof A.cinemaPathPlan === 'function') {
      try { plan = A.cinemaPathPlan(nFrames / fps); } catch (e) { console.warn('§MAXQ_PATH plan failed: ' + e.message); }
    }
    // §CPE_PACING: the film's length is a CONSEQUENCE of the building, not an input. Frames used to
    // set the duration (360/15 = 24s for everything); now the plan measures its own beats from real
    // distances and angles, and the frame count follows. A caller that asked for a specific frame
    // count still gets it — only the default defers to the geometry.
    if (plan && plan.naturalTotal && !opts.frames) {
      var _natFrames = Math.max(1, Math.round(plan.naturalTotal * fps));
      if (_natFrames !== nFrames) {
        console.log('§MAXQ_DURATION_DERIVED ' + (nFrames / fps).toFixed(1) + 's→' +
          plan.naturalTotal.toFixed(1) + 's, frames ' + nFrames + '→' + _natFrames +
          ' (paced from this building, not a fixed runtime)');
        nFrames = _natFrames;
        try { plan = A.cinemaPathPlan(nFrames / fps); } catch (e2) {}
      }
    }
    var tgt = A.controls.target.clone();
    var dx = A.camera.position.x - tgt.x, dy = A.camera.position.y - tgt.y, dz = A.camera.position.z - tgt.z;
    var radius = Math.hypot(dx, dz), height = dy, az0 = Math.atan2(dz, dx);
    // ══ §CPE_CLIP — in/out markers cut a clip out of the film ══════════════════════════════════
    // Set from the editor's override below. `poseAt` is the ONE place the window is applied, so
    // every consumer — the preview, the bake loop, and anything added later — flies the clip through
    // the same function, and there is no second notion of "which part of the film this is".
    var _clip = null, _buildup = false, _bkState = null, _roomTitle = false, _titleSegs = null;
    var _dayPos = 'tr';
    function _tFilm(tNorm) { return _clip ? _clip.in + tNorm * (_clip.out - _clip.in) : tNorm; }
    function poseAt(tNorm) {
      tNorm = _tFilm(tNorm);
      if (plan) return plan.poseAt(tNorm);
      var az = az0 + tNorm * Math.PI * 2;
      return { x: tgt.x + radius * Math.cos(az), y: tgt.y + height, z: tgt.z + radius * Math.sin(az),
               tx: tgt.x, ty: tgt.y, tz: tgt.z };
    }
    // §CPE_STICK_APPROACH: same _tFilm remap as poseAt, so the reported stick matches the pose
    // actually flown THIS frame (a clip window shifts both together). No-op (null) on a circle
    // fallback plan or a plan/path with no user-dropped sticks (plan.stickCount === 0, the common
    // case) — the bake HUD then shows nothing extra, same as before this feature.
    function stickApproachAt(tNorm) {
      if (!plan || !plan.stickApproachAt) return null;
      return plan.stickApproachAt(_tFilm(tNorm));
    }
    var w = A.renderer.domElement.width, h = A.renderer.domElement.height;
    console.log('§MAXQ_START frames=' + nFrames + ' fps=' + fps + ' path=' + (plan ? 'cinema' : 'circle') +
      ' radius=' + radius.toFixed(1) + ' height=' + height.toFixed(1) + ' size=' + w + 'x' + h);
    // §MAXQ_PREVIEW (user spec 2026-07-19): 10s real-time mock of the EXACT path before baking —
    // "the user sees what its next 10 mins of rendering will be up to". Plain nav look, no Alt+S
    // staging/folds (path rehearsal, not a quality preview — per user, "the fast preview the
    // scene wont be in Alt-S mode"). Alt+C during the preview cancels the whole run for free.
    // ONE implementation, two call sites (§CPE_PREVIEW_AFTER below is the second). It reads `poseAt`,
    // which reads `plan` from this scope at CALL time — so whichever plan is current when it runs is
    // the plan it flies. That is not incidental: it is what makes the after-edit preview show the
    // EDITED film through the very same function the bake will step frame by frame, rather than a
    // second, parallel notion of the path that could drift from it (§CPE_PREVIEW_DIVERGENCE, again).
    // Returns true if the user cancelled during it.
    async function _runPreview(phase, status) {
      console.log('§MAXQ_PREVIEW start phase=' + phase +
        ' 10s real-time mock of the exact path (plain look, no Alt+S)');
      _status(status);
      var camSave = { px: A.camera.position.x, py: A.camera.position.y, pz: A.camera.position.z,
                      qx: A.controls.target.x, qy: A.controls.target.y, qz: A.controls.target.z };
      var pv0 = performance.now(), PREV_MS = 10000;
      await new Promise(function(res) {
        (function pvStep() {
          if (_cancel) return res();
          var tn = Math.min(1, (performance.now() - pv0) / PREV_MS);
          var pp = poseAt(tn);
          A.camera.position.set(pp.x, pp.y, pp.z);
          A.controls.target.set(pp.tx, pp.ty, pp.tz);
          A.controls.update();
          if (A.markDirty) A.markDirty();
          if (tn >= 1) return res();
          requestAnimationFrame(pvStep);
        })();
      });
      A.camera.position.set(camSave.px, camSave.py, camSave.pz);
      A.controls.target.set(camSave.qx, camSave.qy, camSave.qz);
      A.controls.update();
      if (A.markDirty) A.markDirty();
      if (_cancel) return true;
      console.log('§MAXQ_PREVIEW done phase=' + phase + ' — camera restored');
      return false;
    }
    function _cancelledOut(where) {
      console.log('§MAXQ_CANCEL during ' + where + ' — nothing baked, nothing saved');
      _status('🎬 MaxQ cancelled during ' + where);
      _active = false; _cancel = false; A._maxqActive = false;
      _wakeRelease(); _dampRelease();
    }
    // ══ §CPE_PREVIEW_REDUNDANT (user, 2026-07-28, after flying it: "I see the initial preview is
    // redundant. Straight showing this is good as preview button is always there and serving well.
    // Corelation with the whole pipe during the journey is great instant feedback.")
    // The pre-editor 10 s flight of the DERIVED path used to run here. It was written when the
    // editor could not preview at all — the film went from an unedited rehearsal straight to a
    // ten-minute cook. Both of its jobs are now done better by things that came after it: the editor
    // draws the whole film as a pipe the moment it opens (so the path is visible without flying it),
    // and §CPE_PREVIEW_BUTTON flies whatever is current, on demand, as many times as wanted.
    // Keeping it meant ten seconds of forced waiting before every single edit session.
    // `opts.preview` still gates §CPE_PREVIEW_AFTER below, so a caller can still turn previews off.
    if (opts.preview !== false && opts.editor === false) {
      // No editor in this run (a scripted/witness bake): the rehearsal is the ONLY chance to see the
      // path before the cook, so it still runs there.
      if (await _runPreview('derived', '🎬 Path preview (10s, plain look) — the bake follows; Alt+C cancels')) {
        _cancelledOut('preview');
        return;
      }
    }
    // ══ §CINEMA_PATH_EDITOR (prompts/CINEMA_PATH_EDITOR.md §CINEMA_PATH_EDITOR_MODEL item 12): the
    // waypoint editor opens HERE — after the preview has shown the path and put the camera back.
    //
    // Item 20, a real defect this placement exposes and must fix: `A._maxqActive`, the wake lock and
    // the damping hold are all claimed at the TOP of start(), before the plan and preview. In
    // particular `A._maxqActive` makes dlod_nav.js:307 report 'cinema' and fully disengage DLOD. A
    // user editing for five minutes would otherwise hold a screen wake lock and run Terminal/Hospital
    // at full detail with no LOD the entire time. So all three are released for the duration of the
    // editor and re-claimed on OK. Gated by G11 — proven released, not merely described as released.
    if (A.cinemaPathEditor && plan && plan.waypoints && opts.editor !== false) {
      A._maxqActive = false;
      _wakeRelease(); _dampRelease();
      console.log('§CPE_LOCKS released for editing (maxqActive=false, wake+damping released)');
      _status('🎬 Edit the path, then OK to record');
      var _cpeRes = null;
      try {
        _cpeRes = await A.cinemaPathEditor.open({ plan: plan, durationSec: nFrames / fps, fps: fps });
      } catch (eE) { console.warn('§CPE_FAIL ' + eE.message + ' — proceeding with the derived path'); }
      A._maxqActive = true;
      _wakeAcquire(); _dampHold();
      console.log('§CPE_LOCKS re-claimed for the bake (maxqActive=true)');
      if (_cpeRes && _cpeRes.action === 'cancel') {
        console.log('§MAXQ_CANCEL from path editor — nothing baked, nothing saved');
        _status('🎬 Cancelled');
        _active = false; _cancel = false; A._maxqActive = false;
        _wakeRelease(); _dampRelease();
        return;
      }
      if (_cpeRes && _cpeRes.override) {
        // Constant speed means an edited path generally changes the total, so the frame count is
        // re-derived from it (item 11 — this is the render cost the editor surfaced).
        var _framesWas = nFrames;
        nFrames = Math.max(1, Math.round(_cpeRes.durationSec * fps));
        plan = A.cinemaPathPlan(nFrames / fps, _cpeRes.override);
        // §CPE_OK_CRASH (CINEMA_PATH_EDITOR.md) — this line used to read `override.waypoints.length`
        // and threw `undefined.length` on EVERY edited path: §CPE_BANDS changed the editor's override
        // to carry `bands` (3 bands → 6 waypoints, expanded inside effects.js), and this one consumer
        // was never ported. The plan above had already succeeded — a stale LOG line was killing the
        // bake. Count what the plan actually flew, and never let this line be the thing that throws.
        var _ov = _cpeRes.override;
        // §CPE_CLIP: a clip is fewer frames of the SAME film, so the frame count scales with the
        // window — not the duration, which the editor already derived for the whole path.
        if (_ov.clip && _ov.clip.out > _ov.clip.in) {
          _clip = { in: _ov.clip.in, out: _ov.clip.out };
          var _span = _clip.out - _clip.in;
          var _framesFull = nFrames;
          nFrames = Math.max(1, Math.round(nFrames * _span));
          console.log('§CPE_CLIP applied window=' + _clip.in.toFixed(3) + '→' + _clip.out.toFixed(3) +
            ' span=' + (_span * 100).toFixed(0) + '% frames=' + _framesFull + '→' + nFrames +
            ' (poseAt remaps; the film itself is unchanged)');
        }
        _buildup = !!_ov.buildup;
        _roomTitle = !!_ov.roomTitle; // §CPE_ROOM_TITLE — off unless the editor's checkbox set it
        // §CPE_DAY_COUNTER_POS — the editor's corner choice. Absent (an older saved plan, or a bake
        // that never opened the editor) means TOP RIGHT, which is what shipped, so nothing re-bakes
        // differently by accident.
        _dayPos = _ov.dayCounter || 'tr';
        var _wpN = _ov.bands ? _ov.bands.length * 2 : (_ov.waypoints ? _ov.waypoints.length : '?');
        console.log('§CPE_APPLIED total=' + _cpeRes.durationSec.toFixed(1) + 's frames=' + nFrames +
          ' waypoints=' + _wpN + ' saved=' + !!_cpeRes.saved);
        // §MAXQ_START was printed before the editor opened, so its frame count is now stale — a
        // pasted console must not disagree with what actually gets baked (observed live: START said
        // 360, the bake ran 489).
        if (nFrames !== _framesWas)
          console.log('§MAXQ_START_REVISED frames=' + _framesWas + '→' + nFrames +
            ' (path edited; §MAXQ_START above is superseded)');
        // ══ §CPE_PREVIEW_AFTER_RETIRED (prompts/CINEMA_PATH_EDITOR.md, user 2026-07-29: "when OK, do
        // not run preview again as there is already a Preview button") — the 10 s flight of the EDITED
        // path used to run HERE, between §CPE_APPLIED and frame 0.
        //
        // It was written for a build where the editor could not preview at all: the film you authored
        // went straight to a ten-minute bake unseen, so a forced rehearsal was the only way to catch a
        // bad edit. §CPE_PREVIEW_BUTTON closed that gap directly and better — it flies the CURRENT edit
        // on demand, any number of times, and its stale marker ('Preview ●') answers "have I seen THIS
        // version?" without guessing. What was left here was ten forced seconds proving something the
        // user had already chosen when to see. This is the same cut §CPE_PREVIEW_REDUNDANT made above
        // for the PRE-editor rehearsal, on the same reasoning, applied to the other end.
        //
        // The trade, stated rather than glossed: the replacement is opt-in, so a user who never presses
        // Preview now bakes unseen. That is the user's ruling, consistent with how they ruled on the
        // pre-editor preview.
        //
        // `_runPreview` STAYS — the `opts.editor === false` branch above (scripted/witness bakes: no
        // panel, therefore no Preview button) is the one caller that still needs a rehearsal, and
        // `opts.preview` keeps its meaning for it.
      } else {
        // Guardrail 2: OK with no edit re-uses the plan object computed before the editor opened —
        // literally the same object, so the film is byte-identical to one recorded without the
        // editor existing. The default cost of this feature is one click and nothing else.
        console.log('§CPE_APPLIED none — derived plan unchanged (guardrail 2: OK is a no-op)');
      }
    }
    var db = null;
    var framesDone = 0;
    var _idbLost = false;
    var _glLost = false;
    var t0 = performance.now();
    // §MAXQ_ETA_ROLLING (user 2026-07-19: "74 mins... suddenly 38... now 33.. it is not accurate"):
    // lifetime-average ETA is poisoned by the expensive early frames (indoor prelude close-ups cost
    // far more than wide exterior frames). Use the mean of the LAST 15 frames instead — tracks the
    // current phase's real rate.
    var _etaPrev = t0, _etaRecent = [];
    var MAXQ_LOG_MS = 5000, _logPrev = t0;   // console cadence in TIME, not frames (§MAXQ_ETA_TICK)
    try {
      // IDB first, INSIDE the guard: this open used to sit bare between the preview and the warm-up,
      // so a blocked open froze the run with zero log lines, _active stuck true (swallowing the next
      // Alt+C as a cancel-toggle) and the wake lock held. Failing fast here also avoids paying the
      // warm-up fold before discovering the store is unusable.
      await _idbDelete();
      db = _db = await _idbOpen();
      console.log('§MAXQ_IDB_READY store opened');
      // Warm-up fold (discarded): staging's async assets (sunset HDRI envMap, AO bundle, textures)
      // must be resident BEFORE frame 0, or early frames bake a different global lighting baseline
      // than later ones (whole-building tint shift — measured 21.6dB vs 24.3dB PSNR in the PoC).
      _status('🎬 MaxQ warming up…');
      A.startStillRefine();
      await _waitFoldDone(30000, 'warm-up fold');
      // §CINEMA_HDRI_RACE (2026-07-24, user-reported live via their own pasted console log —
      // "flicker or snapping... before Alt-S fully applied"): _waitFoldDone above only tracks the
      // TAA/AO accumulate fold's own busy flag. A.startStillRefine() ALSO kicks off the HDRI envMap
      // load (real photographed reflections) as a separate async texture fetch+PMREM-generate, and
      // that one is NOT what the fold's "done" flag tracks — confirmed live: the user's log showed
      // `§STILL_REFINE done` firing at elapsedMs=2221 while `§LAYER2_HDRI_READY` only arrived later.
      // Wait for it explicitly too, so frame 0 doesn't bake with placeholder lighting. 20s cap (vs
      // the flagged-dead-code live-capture path's 5s) — MaxQ is an offline multi-minute bake, not
      // latency-sensitive, and this is a ONE-TIME cost per session (cached after the first load).
      if (typeof A.ensureHdriEnvMapReady === 'function') {
        var _hdriT0 = performance.now();
        await Promise.race([
          A.ensureHdriEnvMapReady(),
          new Promise(function(res) { setTimeout(res, 20000); })
        ]);
        console.log('§MAXQ_HDRI_RACE waitedMs=' + Math.round(performance.now() - _hdriT0));
      }
      A.stopStillRefine(true);
      await _raf2(); await _sleep(3000);

      // ══ §CPE_BUILDUP / §MAXQ_TIME mode D — the model assembles itself as the camera flies ══════
      // The ordering is computed over the WHOLE path (plan.poseAt, deliberately NOT the clipped
      // poseAt): with a clip, the buildup must be sampled BY the window, not re-normalised to it, or
      // every clip would open on bare ground instead of on a partially-built building
      // (PHOTOREAL_STILL_RENDER.md §MAXQ_TIME code-read, §6).
      if (_buildup) {
        if (typeof window.tmOrderByCameraPath !== 'function' || typeof window.tmActivateForBake !== 'function') {
          console.warn('§CPE_BUILDUP_SKIP reason=time_machine.js not loaded — baking without the buildup');
          _buildup = false;
        } else if (!(await window.tmActivateForBake())) {
          console.warn('§CPE_BUILDUP_SKIP reason=no derived build order (Time Machine has no ops for this building)');
          _buildup = false;
        } else {
          // ══ §CPE_BUILDUP_FOLLOW_TM — the film PLAYS the Time Machine, it does not author an order ══
          // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_SOURCE_BLIND
          // User, 2026-07-29: "do not bake anything for TM.. it is user's own plan" /
          // "this practices good separation of tasks" / "so buildup it gives as it is basis".
          //
          // What this replaces: mode D (tmOrderByCameraPath) re-keyed every op to camera-path
          // proximity. §CPE_BUILDUP_REAL_SCHEDULE had already stopped it eating a CAPTURED schedule,
          // but a GENERATED timeline — schedule_gate's geometry-gated bottom-up order, which is what
          // the TM drawer is showing — was still discarded. Reported live on Hospital (63,439 ops, 36
          // mini-Gantt bars, zero rows in `tasks`): proximity to a 73.6m walk through a building of
          // boundingR=91.4 reveals every storey at once, which is the "flattens too much too early"
          // the user saw. One verb now decides for BOTH callers, so the Preview and the bake can no
          // longer disagree about what they are showing.
          _bkState = (typeof window.tmFollowTimeline === 'function') ? window.tmFollowTimeline() : null;
          if (!_bkState) { console.warn('§CPE_BUILDUP_SKIP reason=no timeline to follow — baking without the buildup'); _buildup = false; }
          if (_bkState) {
            var _top = _buildupTopoutU(plan);
            console.log('§CPE_BUILDUP_TOPOUT topoutU=' + _top.u.toFixed(3) + ' src=' + _top.src +
              ' — construction completes at the closing-orbit boundary; the pull-back shows the' +
              ' topping-out and the orbit circles the FINISHED building (solar-panel lesson 2026-08-02)');
          }
          else if (_bkState.source === 'captured') {
            // §CPE_BUILDUP_REAL_SCHEDULE §5 — the label moves with the data. States scope and
            // coverage; claims NO predecessor logic, float or resources (this data carries none).
            _status('🎬 Building to the linked schedule (' + _bkState.leafTasks + ' phases, ' +
              _bkState.pct + '% of elements)');
          } else {
            // §5 tier 2 — a real, model-derived 4D. Never "the schedule", never "a programme".
            _status('🎬 Building to this model\'s 4D timeline (' + _bkState.placed + ' elements, as the Time Machine has it)');
          }
          // §CPE_GHOST_GROUND: armed here because this is where the buildup timeline becomes real —
          // the trigger is a cursor timestamp, so it cannot be computed before the ops are ordered.
          if (_bkState) _ghostGroundArm(_bkState);
        }
      }
      // §CPE_DAY_COUNTER — declared in the bake's scope, reset per frame. Must NOT be an implicit
      // global: two bakes in one tab would then share it and a film with no buildup would inherit
      // the previous film's badge.
      var _dayInfo = null;
      // §CPE_ROOM_TITLE — one coarse pre-pass over the WHOLE (already clip/buildup-resolved) frame
      // count, not a per-frame room query: nFrames/fps here is the bake's actual, final duration
      // (§CPE_CLIP has already resized it above), so the timeline never disagrees with what's about
      // to be captured.
      if (_roomTitle && plan && A.roomTitleBuildTimeline) {
        try { _titleSegs = A.roomTitleBuildTimeline(plan, nFrames / fps); }
        catch (eT) { console.warn('§CPE_ROOM_TITLE_ERR ' + eT.message); _titleSegs = null; }
      }
      t0 = _etaPrev = performance.now();
      for (var i = 0; i < nFrames; i++) {
        if (_cancel) { console.log('§MAXQ_CANCEL i=' + i); break; }
        // §MAXQ_CONTEXT_LOSS: scene.js's webglcontextlost handler (§S266) sets this — capturing
        // further frames now would just save blank/black canvas with no error, silently corrupting
        // the tail of the movie. Stop here and salvage whatever was captured before the loss,
        // same treatment as the IDB-connection-lost path below.
        if (A._webglContextLost) { _glLost = true; console.log('§MAXQ_GL_LOST i=' + i + ' salvaging ' + framesDone + ' already-captured frames'); break; }
        if (A._stillRefineActive) A.stopStillRefine(true);
        // §MAXQ_HIDDEN_PAUSE: park BEFORE the cook, not after. Waiting here means the frame is
        // begun with the tab already visible, so the fold has a real rAF loop to converge on.
        await _awaitVisible('frame ' + i + '/' + nFrames);
        await _raf2('frame ' + i + ' settle');
        await _sleep(SETTLE_MS);
        _freezeRandom();
        var _tn = nFrames > 1 ? i / (nFrames - 1) : 0;
        var pose = poseAt(_tn);  // tNorm hits 1.0 on the last frame so the pull-back completes
        var _stickNow = stickApproachAt(_tn);  // §CPE_STICK_APPROACH — null unless the path has sticks
        A.camera.position.set(pose.x, pose.y, pose.z);
        A.controls.target.set(pose.tx, pose.ty, pose.tz);
        A.controls.update();
        // §CPE_BUILDUP: the SECOND per-frame state advance (§MAXQ_TIME's whole premise — mode A moves
        // only the camera, this adds construction state). _tFilm keeps the cursor on the film's own
        // parameter, so a clip samples the middle of the buildup rather than restarting it.
        _dayInfo = null;
        if (_buildup && _bkState) {
          // §CPE_BUILDUP_TOPOUT: the cursor rides the remapped fraction so construction completes
          // at the orbit boundary; the camera keeps its own film fraction untouched.
          var _bkT = _buildupTAt(_tFilm(_tn), plan);
          // §CPE_BUILDUP_WORK_PACED: was `projectStart + t*span` — linear in DAYS. Now linear in
          // ELEMENTS, so the building rises at an even rate regardless of how the derived 4D order
          // clusters its timestamps.
          var _bkMs = _workCursorAt(_bkT, _bkState);
          window.tmSetCursor(_bkMs);
          // §CPE_GHOST_GROUND: same film fraction the cursor rides, so the ghost cannot drift out of
          // step with what is actually placed.
          // §CPE_DAY_COUNTER — read off `_bkMs`, the cursor the buildup is ALREADY showing. Any
          // separate clock would be a second opinion about the schedule and would drift from the
          // model on exactly the frames the counter exists to explain.
          if (A.dayCounterAt && _dayPos !== 'off') {
            _dayInfo = A.dayCounterAt(_bkMs, _bkState.projectStart, _bkState.projectEnd);
            // The corner rides ON the info object so _captureFrame needs no second parameter and
            // cannot be handed a position that belongs to a different frame.
            if (_dayInfo) _dayInfo.pos = _dayPos;
          }
          var _ggO = _ghostGroundAt(_bkT, nFrames / fps, _bkState, _bkMs);
          if (i === 0 || i === nFrames - 1 || i % 60 === 0) {
            if (_dayInfo) console.log('§CPE_DAY_COUNTER frame=' + i + ' day=' + _dayInfo.day +
              ' of=' + _dayInfo.totalDays + ' pos=' + _dayInfo.pos + ' cursor=' + Math.round(_bkMs));
            else if (_dayPos === 'off' && i === 0) console.log('§CPE_DAY_COUNTER off — the editor set it off for this bake');
            console.log('§CPE_BUILDUP frame=' + i + '/' + nFrames + ' t=' + _bkT.toFixed(3) +
              ' cursor=' + Math.round(_bkMs) + ' placed=' + (window.tmPlacedCount ? window.tmPlacedCount(_bkMs) : '?') +
              '/' + _bkState.ops +
              (_ggO == null ? '' : ' groundOpacity=' + _ggO.toFixed(3)));
          }
        }
        A.startStillRefine();
        var ok = await _waitFoldDone(30000, 'cook of frame ' + i + '/' + nFrames);
        await _raf2('frame ' + i + ' capture');
        _restoreRandom();
        // A timeout can now only mean a genuinely slow frame, since hidden time no longer counts
        // against the budget. Counted rather than merely warned: the total is what lets the run
        // state its own health at the end instead of leaving a degraded film to look identical to
        // a good one.
        if (!ok) { _unconverged++; console.warn('§MAXQ_FRAME_TIMEOUT i=' + i + ' — capturing as-is (UNCONVERGED, count=' + _unconverged + ')'); }
        var _titleInfo = (_titleSegs && A.roomTitleOpacityAt) ? A.roomTitleOpacityAt(_titleSegs, i / fps) : null;
        var blob = await _captureFrame(w, h, _titleInfo, _dayInfo);
        // §MAXQ_IDB_SALVAGE (2026-07-25, real user repro on Hospital AND HHS_Office — both mid-bake,
        // ~100+ frames in): a backgrounded/throttled tab can have Chrome force-close this run's IDB
        // connection out from under it (confirmed live: two consecutive rAF gaps of 29s and 67s right
        // before the failure — classic background-tab throttling, not a code race). Previously this
        // threw straight past the §MAXQ_PARTIAL stitch logic below (it only runs when the loop exits
        // normally/via `break`), silently discarding every frame captured so far — losing minutes of
        // cook the SAME way a manual cancel explicitly promises never to (see that logic's own
        // comment). Treat an IDB write failure the same as a cancel: stop capturing, keep what's
        // already saved, and try to hand the stitch phase a FRESH connection since the old handle is
        // permanently unusable once "closing" — reopening is cheap and the underlying stored data
        // (frames already put successfully) is untouched by the old handle dying.
        try {
          await _idbPut(db, i, blob);
        } catch (idbErr) {
          _idbLost = true;
          console.warn('§MAXQ_IDB_LOST i=' + i + ' ' + idbErr.message +
            ' — tab likely backgrounded/throttled; salvaging ' + framesDone + ' already-captured frames');
          try { db = _db = await _idbOpen(); console.log('§MAXQ_IDB_REOPEN ok'); }
          catch (reopenErr) { console.warn('§MAXQ_IDB_REOPEN_FAIL ' + reopenErr.message); }
          break;
        }
        framesDone = i + 1;
        var _etaNow = performance.now();
        _etaRecent.push(_etaNow - _etaPrev); _etaPrev = _etaNow;
        if (_etaRecent.length > 15) _etaRecent.shift();
        // §MAXQ_ETA_TICK — the progress readout is driven by MEASURED TIME, not a frame count.
        // Both used to sit behind `i % 15`, which is a rate only if frames are fast. They are not:
        // a photoreal frame cooks the 16-sample TAA fold + the 24-frame AO pass, MEASURED at
        // 1600-1812 ms/frame on Hospital (942 frames, ~25 min). At that speed `i % 15` left the
        // status line frozen on a stale number for ~24 SECONDS at a time, which is exactly long
        // enough to read as a hang — reported as "it gets stuck" on a run that was progressing
        // normally the whole time.
        //
        // So: the STATUS updates every frame (a textContent write, free next to a 1.6s cook), and
        // the CONSOLE throttles on elapsed ms rather than frame index, so its cadence is the same
        // wall-clock rhythm whether a frame takes 20ms or 2s. Nothing here needs to know how slow
        // a frame is — it measures.
        var _el = _etaNow - t0;
        var _per = _etaRecent.reduce(function(a, b) { return a + b; }, 0) / _etaRecent.length;
        var _eta = i > 0 ? Math.round(_per * (nFrames - i - 1) / 1000) : -1;
        var _etaTxt = _eta < 0 ? 'estimating'
          : _eta < 90 ? Math.max(1, Math.round(_eta)) + 's left'
          : Math.ceil(_eta / 60) + ' min left';
        // §CPE_STICK_APPROACH: live path-structure feedback appended to the existing frame/ETA
        // readout — same per-frame cadence, not a separate slower/faster timer. Omitted entirely
        // (falls back to the pre-feature text) when the path has no user-dropped sticks or the walk
        // is already past the last one.
        var _stickTxt = _stickNow ? ', approaching Stick ' + _stickNow.index + '/' + _stickNow.count : '';
        // §CPE_MAXQ_STATUS_DAY_LABEL — Day # and current room label, same per-frame cadence as the
        // stick-approach text above. `_dayInfo`/`_titleInfo` are already computed earlier THIS
        // frame for the canvas-compositing path (_captureFrame, above) — this reads the SAME
        // values through the pure, witnessed formatter, nothing is recomputed here.
        var _segs = _maxqStatusDayRoomSegs(_dayInfo, _titleInfo);
        _status('🎬 MaxQ frame ' + (i + 1) + '/' + nFrames + ' — ' + Math.round(_el / 1000) + 's, ~' +
          _etaTxt + _segs.dayTxt + _segs.roomTxt + _stickTxt + ' (Alt+C / cinema icon cancels + saves partial)');
        if (_etaNow - _logPrev >= MAXQ_LOG_MS || i === 0 || i === nFrames - 1) {
          _logPrev = _etaNow;
          console.log('§MAXQ_FRAME i=' + i + '/' + nFrames + ' elapsedMs=' + Math.round(_el) +
            ' perFrameMs=' + Math.round(_per) + ' etaSec=' + _eta + ' (rolling-15, log every ' +
            (MAXQ_LOG_MS / 1000) + 's)');
        }
      }
      if (A._stillRefineActive) A.stopStillRefine(true);
      _restoreRandom();
      // §CPE_BUILDUP: hand the user's Time Machine back exactly as it was. Every loop exit — normal
      // end, cancel, GL loss, IDB loss — passes through here, so the re-keyed order can never
      // outlive the bake and silently become what the timeline slider scrubs.
      if (_bkState && typeof window.tmRestoreDerivedOrder === 'function') {
        window.tmRestoreDerivedOrder(); _bkState = null;
      }
      // §CPE_GHOST_GROUND: same contract, same exit — a ghosted ground left behind would follow the
      // user into normal navigation for the rest of the session.
      try { _ghostGroundRestore(); } catch (eGG) {}
      _workPacingReset();
      // ══ §MAXQ_QUALITY — the run states its own health, ALWAYS, before anything is stitched.
      // The defect this exists for is a film that looks complete and plays fine while its last
      // seconds are visually dead. A degraded bake must never finish quietly: `unconverged` is the
      // load-bearing number, because it counts frames captured before the fold finished — exactly
      // the frames that come out as near-duplicates and read as the film stalling. With
      // §MAXQ_HIDDEN_PAUSE in place a hidden tab should contribute ZERO of them, so a non-zero
      // count now means genuinely slow frames and nothing else.
      console.log('§MAXQ_QUALITY frames=' + framesDone + ' unconverged=' + _unconverged +
        (_unconverged ? ' ⚠ THOSE FRAMES DID NOT FINISH — expect dead-looking video where they land' : ' (every frame converged)') +
        ' hiddenPauses=' + _hiddenPauses + ' totalHiddenMs=' + Math.round(_hiddenMsTotal) +
        (_hiddenPauses ? ' — the bake PARKED while the tab was hidden rather than degrading; the wall clock is longer, the film is not worse' : ''));
      // §MAXQ_PARTIAL: cancel SAVES what's cooked so far (user Q 2026-07-19 — losing minutes of
      // cook must never be the default). Threshold: at least 1s of footage (fps frames) on a
      // cancelled run — below that there's nothing worth stitching.
      if (framesDone >= (_cancel ? fps : 1)) {
        if (_cancel) console.log('§MAXQ_CANCEL_PARTIAL stitching ' + framesDone + ' frames (' +
          (framesDone / fps).toFixed(1) + 's of footage)');
        // §MAXQ_MP4: mp4/H.264 first (plays on iPhone/WhatsApp), webm MediaRecorder as fallback.
        // opts.forceWebm=true skips mp4 entirely — that is how the fallback path stays witnessed.
        var mp4ok = false;
        if (opts.forceWebm) console.log('§MAXQ_MP4_FALLBACK reason=forced-webm (opts.forceWebm)');
        else mp4ok = await _stitchMp4(db, framesDone, fps, w, h);
        if (!mp4ok) await _stitch(db, framesDone, fps, w, h);
      } else if (_cancel) {
        _status('🎬 MaxQ cancelled at frame ' + framesDone + ' — under 1s of footage, nothing saved');
      } else if (_idbLost) {
        // §MAXQ_IDB_SALVAGE: the non-cancel break path above falls through both branches above
        // silently otherwise — with zero user-visible feedback this reads as "hung", not "failed
        // with nothing to save" (real user report, 2026-07-26).
        _status('🎬 MaxQ stopped at frame ' + framesDone +
          ' — lost its storage connection (tab backgrounded, or another MaxQ bake running in a ' +
          'different tab of this app) before enough footage was captured to save');
      } else if (_glLost) {
        _status('🎬 MaxQ stopped at frame ' + framesDone +
          ' — the browser reclaimed the 3D view (long-idle GPU throttle) before enough footage ' +
          'was captured to save');
      }
    } catch (e) {
      console.warn('§MAXQ_FAIL ' + e.message);
      _status('🎬 MaxQ failed: ' + e.message +
        (e.message === 'idb-open-timeout' ? ' — close other tabs of this app and retry' : ''));
    } finally {
      _restoreRandom();
      // A throw mid-fold (e.g. the idb-open abort) skips the in-try stop — staging would otherwise
      // stay frozen on screen with the composer accumulating.
      try { if (A._stillRefineActive) A.stopStillRefine(true); } catch (e2) {}
      // §CPE_BUILDUP: same restore on the THROW path. A re-keyed op-log left behind by a crashed
      // bake would look like a corrupted schedule to the next person who opens the timeline.
      try { if (_bkState && window.tmRestoreDerivedOrder) { window.tmRestoreDerivedOrder(); _bkState = null; } } catch (e3) {}
      try { _ghostGroundRestore(); } catch (e4) {}
      try { _workPacingReset(); } catch (e5) {}
      // Recoverability FIRST: clearing the store can itself block for seconds behind the very
      // zombie connection that failed this run, and until these flags reset the next Alt+C is
      // swallowed as a cancel-toggle. Cleanup must never gate the ability to retry.
      _active = false; _cancel = false;
      A._maxqActive = false;
      _wakeRelease(); _dampRelease();
      await _idbDestroy(db);
    }
  }

  // No own key binding: Alt+C (scene.js §KBD_ROUTE) and the Palette cinema icon (panels.js)
  // are the triggers — this feature REPLACES the live-capture orbit at that icon per user spec.
  // start() while running = cancel (toggle), same as pressing the icon again.
  function cancel() {
    console.log('§MAXQ_CANCEL requested active=' + _active);
    if (_active) _cancel = true;
  }
  // APP may not exist at parse time — attach the public API once it does.
  var _attach = setInterval(function() {
    if (window.APP) {
      window.APP.startMaxQualityOrbit = start;
      window.APP.cancelMaxQualityOrbit = cancel;
      // §CPE_GHOST_GROUND: exported so cinema_path_editor's REHEARSAL drives the identical curve —
      // one implementation, two call sites (the §CPE_ROOM_TITLE precedent).
      // §CPE_BUILDUP_WORK_PACED: the rehearsal must ask for the same cursor as the bake, or the
      // preview shows a different construction rate from the film it is previewing.
      window.APP.buildupCursorAt = _workCursorAt;
      // §CPE_BUILDUP_TOPOUT — exposed for the preview (same remap as the bake, one implementation)
      // and for the witness, which gates the pure mapping instead of sitting through a bake.
      window.APP.buildupTAt = _buildupTAt;
      window.APP.buildupTopoutU = _buildupTopoutU;
      window.APP.buildupPacingReset = _workPacingReset;
      window.APP.ghostGroundArm = _ghostGroundArm;
      window.APP.ghostGroundAt = _ghostGroundAt;
      window.APP.ghostGroundRestore = _ghostGroundRestore;
      // §GHOST_GROUND_LIVE_TRIGGER: read-only accessor for the witness — returns the ACTUAL live
      // `firstT` this arm computed (elements-fraction or calendar-fraction, whichever domain
      // `tFilm` is really in) alongside both candidates, so a witness/diagnostic can assert against
      // the real value instead of re-deriving its own guess of which domain won.
      window.APP.ghostGroundDebugState = function() {
        return _ggSpan ? { firstT: _ggSpan.firstT, calendarFirstT: _ggSpan.calendarFirstT,
                            elementsFirstT: _ggSpan.elementsFirstT, fallback: _ggSched && _ggSched.fallback } : null;
      };
      // §CPE_MAXQ_STATUS_DAY_LABEL — exposed for the witness (gates the pure formatter directly,
      // same precedent as the other pure functions on this line, instead of sitting through a bake).
      window.APP.maxqStatusDayRoomSegs = _maxqStatusDayRoomSegs;
      clearInterval(_attach);
    }
  }, 500);
})();
