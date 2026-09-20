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
  //
  // ══ §CPE_BUILDUP_EVEN_TEMPO (2026-08-06) — RETIRES the above as the default ═══════════════════
  // User: "why does the movie baking makes the first few seconds or during the dive in jumps days
  // too fast tempo? Should be even throughout - separation of concern. Let the user plays with the
  // sticks and timings to catch this linear buildup."
  //
  // Even ELEMENT rate is uneven DAY rate, by construction — the two cannot both be constant unless
  // the schedule places elements uniformly in time, which no real 4D schedule does. Measured on
  // Duplex (witness_cpe_buildup_tempo.js, pre-fix): the per-step calendar advance ranged 0.01d to
  // 0.29d, a 57.21x swing across one 10-day buildup, and the cursor departed the straight line by
  // 9.47% of the whole span. That swing IS the reported symptom; work pacing was working exactly as
  // written.
  //
  // ⚠ THIS IS A REVERSAL OF A PRIOR USER DECISION, AND IT TRADES BACK INTO THE PROBLEM THAT
  // MOTIVATED WORK PACING — the burst the §CPE_BUILDUP_WORK_PACED note above records (a quarter of
  // the Hospital model appearing in the first 5% of the film) returns wherever a schedule clusters
  // its elements. That is the deliberate trade, made on the user's stated grounds: SEPARATION OF
  // CONCERN. The buildup engine does one predictable thing — linear days — and dramatic pacing
  // belongs to the path editor, where the user places sticks and sets their timings and can see what
  // they are doing. Two mechanisms silently competing to set tempo is what produced a pacing nobody
  // asked for and nobody could steer.
  //
  // Work pacing is kept intact behind this one flag rather than deleted, so the revert is one line
  // and the measured history above stays runnable.
  var BUILDUP_EVEN_TEMPO = true;   // false restores §CPE_BUILDUP_WORK_PACED
  var _wpSched = null, _wpTried = false;

  // ══ §CPE_BUILDUP_ONSET_BLEND (2026-08-27, CINEMA_PATH_EDITOR.md §CPE_BUILDUP_ONSET_BURST) ═════
  // Re-raised by the user after §CPE_BUILDUP_ONSET_BURST (2026-08-13) was deprioritized, not fixed:
  // "the movie is not reflecting the build up construction speed on the very first day... captures
  // frames right away to days past... first few secs should take on Day 0 as most 4D rush onset."
  // §CPE_BUILDUP_EVEN_TEMPO's day counter is still correct system-wide (kept, unchanged below) but a
  // schedule that clusters completions early still LOOKS bursty under a pure calendar cursor —
  // measured then: Duplex, 24.6% of the whole building already placed 5.5s into a 55s film. This is
  // the minimal fix the prior write-up named and left unbuilt ("blend the cursor toward the
  // already-present element-paced formula only within roughly the first ~10s of film... fading back
  // to pure calendar-linear after") — scoped exactly to the user's own ask ("correct only the first
  // 10 secs"), never reopening "two mechanisms compete for the whole film"
  // (§CPE_BUILDUP_EVEN_TEMPO's own reason for retiring §CPE_BUILDUP_WORK_PACED as the default).
  var ONSET_BLEND_SEC = 10;        // film seconds; user's own scoping, not invented
  var _wpOnsetTried = false;       // separate one-shot arm flag — independent of _wpTried, which
                                   // already gates BOTH the even-tempo mode-log AND the (unused
                                   // while even-tempo is on) full-film work-pacing arm below; reusing
                                   // it here would make _workPacingArm()'s own `_wpTried = true` first
                                   // line silently suppress the even-tempo mode-log this same call
                                   // still needs to print.

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

  // The cursor this frame should ask for. Pure function of (tFilm, bkState, totalSec) — `totalSec`
  // is a per-plan constant (the film's own designed length), identical for preview and bake of the
  // same film, so preview and bake still cannot diverge and two runs of the same film still ask for
  // identical cursors. `totalSec` is optional (older call sites omit it) — onset blend simply stays
  // off when it is not supplied, same DEGRADE-DON'T-DISABLE contract every other lever in this file
  // already follows.
  function _workCursorAt(tFilm, bkState, totalSec) {
    var t = Math.max(0, Math.min(1, tFilm));
    var calMs = bkState.projectStart + t * (bkState.projectEnd - bkState.projectStart);
    // §CPE_BUILDUP_EVEN_TEMPO — the straight line, before any schedule is consulted. Gated ahead of
    // _workPacingArm() so an even-tempo film never even arms work pacing: arming logs a mode line
    // that would then describe a pacing that is not in force, which is exactly the kind of log that
    // costs a live debugging round-trip.
    if (BUILDUP_EVEN_TEMPO) {
      // §CPE_BUILDUP_ONSET_BLEND — onsetU is the ONSET_BLEND_SEC window expressed as a tFilm
      // fraction of THIS film (so "10 seconds" means the same thing on a 30s and a 300s bake),
      // capped at half the film so a very short test/preview clip can't blend past its midpoint.
      var onsetU = (totalSec > 0) ? Math.min(0.5, ONSET_BLEND_SEC / totalSec) : 0;
      if (onsetU > 0 && t < onsetU) {
        if (!_wpOnsetTried) { _wpOnsetTried = true; _workPacingArm(); }
        if (_wpSched) {
          var _k = Math.max(1, Math.min(_wpSched.total, Math.round(t * _wpSched.total)));
          var elMs = _wpSched.ends[_k - 1];
          // w: 0 at t=0 (fully element-paced, matching the burst's own true completion order) ->
          // 1 at t=onsetU (fully calendar-linear, handing off to §CPE_BUILDUP_EVEN_TEMPO cleanly —
          // blendedMs === calMs exactly at the handoff instant, no seam).
          var w = t / onsetU;
          var blendedMs = elMs + (calMs - elMs) * w;
          if (!_wpTried) {
            _wpTried = true;
            console.log('§CPE_BUILDUP_PACING mode=even-calendar+onset-blend (§CPE_BUILDUP_ONSET_BLEND) ' +
              'onsetSec=' + ONSET_BLEND_SEC + '/' + totalSec.toFixed(1) + ' onsetU=' + onsetU.toFixed(4) +
              ' — first ' + ONSET_BLEND_SEC + 's blend toward element-paced order, fading to pure ' +
              'calendar by t=' + onsetU.toFixed(4) + '; day counter and the rest of the film unaffected');
          }
          return blendedMs;
        }
        // Work schedule unavailable (older time_machine.js / no usable schedule) — DEGRADE to pure
        // calendar exactly as §CPE_BUILDUP_EVEN_TEMPO always has; _workPacingArm() already logged why.
      }
      if (!_wpTried) {
        _wpTried = true;
        console.log('§CPE_BUILDUP_PACING mode=even-calendar (§CPE_BUILDUP_EVEN_TEMPO) — every film ' +
          'second advances the SAME number of days; dwell/tempo is the path editor\'s job (sticks + timings)' +
          (onsetU > 0 ? ' (onset-blend window armed but no usable work schedule — see §CPE_BUILDUP_PACING arm log above)'
                      : ' (onset-blend inactive — no totalSec passed by this caller)'));
      }
      return calMs;
    }
    if (!_wpTried) _workPacingArm();
    if (!_wpSched) return bkState.projectStart + t * (bkState.projectEnd - bkState.projectStart);
    if (t <= 0) return _wpSched.projectStart;
    if (t >= 1) return _wpSched.projectEnd;
    // k-th completion. `ends` is sorted, so this is the instant at which exactly k ops are done.
    var k = Math.round(t * _wpSched.total);
    if (k < 1) return _wpSched.projectStart;
    if (k >= _wpSched.total) return _wpSched.projectEnd;
    return _wpSched.ends[k - 1];
  }

  function _workPacingReset() { _wpSched = null; _wpTried = false; _wpOnsetTried = false; _fcIdx = null; }

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
    // §CPE_DISCIPLINE_REVEAL (2026-08-14, real defect found on a Hospital bake — user: "2nd round
    // seems to cut over way before the stop stick without finishing the full buildup"). The reveal
    // round exists to show off the FINISHED building; topping out at plan.beats.rise (orbit start,
    // unchanged from §CPE_BUILDUP_TOPOUT above) leaves buildup only ~tO/tR complete when the round
    // BEGINS, since the round itself now sits between tO and tR and pushed tR back.
    // §CPE_DISCIPLINE_REVEAL_PULLOUT (2026-08-14, pull-out restructure) — per the spec file's own
    // wording, buildup's 100%-complete moment moves to the END of the pull-out sub-beat (tP), not the
    // instant of arrival (tO): completing exactly AT arrival was itself the bug this restructure
    // fixes (the user's "way before" complaint), and completing "way after" (the pre-#1353 bug) is
    // the other failure mode this must not reintroduce — tP sits deliberately between the two.
    // `plan.beats.pullout` degrades to `plan.beats.out` (DEGRADE, DON'T DISABLE — this lane's own
    // rule, see §GHOST_GROUND's comment) for an older cached plan built before this restructure.
    if (plan && plan.beats && plan.beats.reveal > plan.beats.out &&
        plan.beats.out > 0 && plan.beats.out < 1) {
      var _tp = (plan.beats.pullout != null && plan.beats.pullout > plan.beats.out &&
                 plan.beats.pullout < 1) ? plan.beats.pullout : plan.beats.out;
      var _src = (_tp === plan.beats.pullout) ? 'plan.beats.pullout (reveal round active)'
                                               : 'plan.beats.out (reveal round active, no pullout on plan)';
      return { u: _tp, src: _src };
    }
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
    // §CPE_BUILDUP_EVEN_TEMPO (2026-08-06) — the elements domain only exists when WORK PACING is
    // what maps tFilm to a cursor. With even tempo in force `_workCursorAt` is calendar-linear, so
    // computing the threshold in elements-fraction puts it in a domain `tFilm` is not in — which is
    // precisely the #1148 defect the block above was written to kill, reintroduced from the other
    // side. Measured when this was missed: threshold firstT=0.0027 (elements) against a real cursor
    // crossing at t=0.0083 (calendar), so the ground began un-ghosting ~2 frames of 400 BEFORE the
    // first above-ground element was placed, and witness_cpe_ghost_ground.js G-GG-12a went red.
    // Skipping the force-arm entirely also keeps a §CPE_BUILDUP_PACING mode=work line out of an
    // even-tempo log, where it would describe a pacing that is not in force.
    if (!BUILDUP_EVEN_TEMPO) {
      if (!_wpTried) _workPacingArm();  // force-arm early so this bake's OWN schedule is what the
                                        // threshold is computed from, not a race with frame 0.
    } else {
      elementsFirstTSrc = 'n/a — even tempo, tFilm is in the calendar domain (§CPE_BUILDUP_EVEN_TEMPO)';
    }
    if (!BUILDUP_EVEN_TEMPO && sched.firstAboveMs != null && _wpSched && _wpSched.total) {
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

  // MAXQ_V changelog (2026-08-06: moved out of the console.log, same treatment as CPE_V in
  // cinema_path_editor.js — the full history was printing on every page load; kept here verbatim,
  // nothing dropped). Version NOT bumped by that move alone — this is a formatting-only change,
  // zero behaviour touched (cinema_maxq.js's bake loop is deliberately untouched by the whole
  // §CPE_SCRUB/§CPE_VIEWFINDER/§CPE_AIM_PIN lane — see those features' own witness gates that grep
  // this file for zero references to their hooks).
  // §GHOST_GROUND_LIVE_TRIGGER fixes #1148 stuck-at-floor regression — the trigger now compares the
  //   REAL cursor to firstAboveMs directly (same clock, epoch ms) instead of pre-converting
  //   firstAboveMs into a calendar-fraction and comparing it against tFilm, which
  //   §CPE_BUILDUP_WORK_PACED (same day) had turned into an ELEMENTS-placed fraction — two
  //   different clocks; adds §GHOST_GROUND_TRIGGER_FIRED (one-shot, exact frame the trigger fires)
  //   and §GHOST_GROUND_TICK (periodic, every ~5 film-seconds while still ghosted) so a future
  //   session never has to re-instrument this file blind again.
  // §CPE_GHOST_GROUND_TRIGGER history: #1110 first-above-ground-element, #1112 5% above-ground-SHARE
  //   ratio, #1148 reverted to #1110 (still broken live until this fix), keeping the #1113-1115
  //   hardening (degrade-not-disable, refusal logging, lazy arm-on-first-tick).
  // §CPE_BUILDUP_WORK_PACED the film advances by ELEMENTS PLACED, not by calendar days — 10% of the
  //   film is 10% of the building on any model.
  // §CPE_BUILDUP_FOLLOW_TM — the buildup PLAYS the Time Machine timeline, it does not author one.
  // §CPE_PREVIEW_AFTER_RETIRED — OK records, no rehearsal either side of the editor.
  // §CPE_PREVIEW_REDUNDANT pre-editor rehearsal removed.
  // §CPE_CLIP in/out window remaps poseAt + scales frames.
  // §MAXQ_HIDDEN_PAUSE — a hidden tab parks the bake instead of ruining it.
  // §MAXQ_QUALITY health line.
  var MAXQ_V = 'v22';
  console.log('§MAXQ_LOADED ' + MAXQ_V + ' — full changelog moved to this file\'s own comment above (search any §TAG)');
  var MAXQ_N_FRAMES = 360, MAXQ_FPS = 15;  // 24s clip (360/15) — opts-overridable
  // ══ §MAXQ_FRAME_BUDGET (bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md §R10) ═══════════════════
  // A BAKE and a STILL are not the same job, and they were paying the same bill. Alt+S is ONE frame
  // a human studies; a bake is thousands that flick past at 15 fps. Both were folding
  // 16 TAA + 24 AO = 40 composer renders per frame — MEASURED as 85% of Hospital's perFrameMs=1989
  // (§STILL_REFINE ~1,200 = 62%, §PHOTO_AO ~450 = 23%) and 137,880 composer renders for one film.
  // These are the ONLY two numbers that move the bake clock; the session record already says not to
  // expect HUD or smoothing work to touch it.
  // Chosen by MEASUREMENT, not by taste — witness_maxq_frame_budget.js + score_frame_budget.py,
  // HHS_Office_Federated, one SEEDED page load per condition, scored against a CONTROL run at the
  // full 16/24 on its own fresh load. Noise floor RMS 0.21 (0-255 luma):
  //     taa=12 ao=16  28 renders  RMS 0.21   AT THE FLOOR
  //     taa= 8 ao=12  20 renders  RMS 0.24   AT THE FLOOR   <-- shipped
  //     taa= 8 ao= 8  16 renders  RMS 0.37   AT THE FLOOR
  //     taa= 4 ao= 8  12 renders  RMS 21.33  DISTINGUISHABLE — a real loss, rejected
  // So 40 renders and 20 renders are the SAME IMAGE to within a fifth of one luma level, and the
  // floor is real: 4/8 is 100x above it, which is what a genuine difference looks like here.
  // 8/8 also measured at the floor and would be 55%. Shipping 8/12 anyway — one AO step of MARGIN,
  // because this is ONE pose on ONE building and AO is exactly what interior corners lean on. The
  // margin costs 75 ms/frame (1,164 vs 1,089); that is the deliberate price of the sample size.
  // Alt+S is UNTOUCHED: A._stillBudget is set only around the bake's frame loop and cleared on
  // every exit path, so a still keeps all 40 renders.
  var MAXQ_STILL_BUDGET = { taa: 8, ao: 12 };
  // §129.20 IDEA, NOT IMPLEMENTED (2026-09-18, red1: "during the freeze, can we save timings during
  // the bake by copying similar frames?") — genuinely worth investigating given the cost breakdown
  // just above: TAA+AO composer renders are ~85% of per-frame cost, and during a load-path hold
  // (§129.1) the CAMERA never moves and the backdrop is fully faded/static (§129.14/§129.17) — the
  // textbook case a cached/reused render would pay off on. NOT a free win, though: the 3D scene is
  // NOT static for the WHOLE hold —
  //   (a) the section-cut/whiten colour lerp is still ramping during the first/last `_cutFadeSec`
  //       of the hold (§129.16/§129.19, `_sectionCutApply`'s own per-frame colour lerp),
  //   (b) `_revealStackStep` solidifies one more hop at fixed pacing through MOST of the hold, a
  //       real geometry/material change each step, not just at the very start.
  // The safe caching window is therefore only BETWEEN two consecutive hop-reveal steps, once the
  // arm-side colour fade has finished — cache the converged 3D/composer render there, keyed on "did
  // the hop-reveal state or the cut/whiten `t` change since last frame", and re-composite ONLY the
  // 2D ladder/HUD overlay (which changes every frame regardless) on top of the cached bitmap. Falls
  // back to a real render on ANY frame where the cache key changed. Not attempted this session —
  // flagging the idea + the real cost numbers so a future pass doesn't have to re-derive either.
  var SETTLE_MS = 250;   // teardown→restage settle. Flicker fix, PoC-proven: without it the next
                         // staging captures mid-restore sun-tint/exposure values as "original"
                         // and the whole building oscillates color frame-to-frame.
  var IDB_NAME = 'bim_ootb_cinema_maxq', IDB_STORE = 'frames';
  var _active = false, _cancel = false;
  // §MAXQ_STAGE_KEEP / R1: guid→object index for the §SHADOW_FRONTIER_AT_CAPTURE check — built
  // lazily per _metaGen inside the bake loop, freed with _workPacingReset() so the Maps don't
  // outlive the bake.
  var _fcIdx = null;
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
  // §MAXQ_FRAME_BUDGET — the bake's cheaper fold must never outlive the bake. Paired with every
  // _wakeRelease() call site, which is this file's existing "the run is over" marker.
  function _bakeBudgetRelease() { try { window.APP._stillBudget = null; } catch (e) {} }
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
  // ══ §129.6 item 4 — §HUD_LAYOUT registry (2026-09-15) ══════════════════════════════════════════
  // Any HUD drawer that paints a rect THIS frame calls A._hudLayoutRegister(name,x,y,w,h) — reset
  // once per frame (top of _captureFrame, below) so a stale rect can never survive into the next
  // frame's check. Overlap excludes pure nesting (one rect fully containing another is intentional
  // structure — e.g. a row inside its own panel — not a layout defect; the defect class this
  // witness exists to catch is two UNRELATED rects spanning/crossing each other, exactly what
  // window.__hudForceOverlap constructs on demand).
  function _hudRectsOverlap(a, b) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
  function _hudRectContains(parent, child) {
    return child.x >= parent.x && child.y >= parent.y &&
      child.x + child.w <= parent.x + parent.w && child.y + child.h <= parent.y + parent.h;
  }
  // Plain module-scope functions, never assigned onto `A` at SCRIPT-LOAD time (window.APP may not
  // exist yet when this IIFE first runs, depending on script order) — _captureFrame below assigns
  // them onto A itself, every frame, cheap and idempotent, only once a bake is actually live.
  // §HUD FIX (2026-09-15, real HHS bake): `parentName` (optional 6th arg) replaces the earlier
  // auto-detected "fully nested = not an overlap" heuristic with an EXPLICIT declaration — a child
  // registered against a real parent is never counted as overlapping THAT parent (intentional
  // structure, e.g. a row inside its own panel), but if it does not fully fit inside that parent's
  // own rect, that is `overflow`, a real defect (the real bake's own pie.ledger: 306px inside a
  // 173px panel) — checked in the witness below, never silently absorbed into "not an overlap".
  function _hudLayoutRegisterImpl(name, x, y, w, h, parentName, truncated) {
    var A2 = window.APP;
    if (!A2._hudLayoutRects) A2._hudLayoutRects = [];
    // §129.7 item 5 (2026-09-16) CONTROL WART FIX: force the overlap by moving pie.ledger onto
    // pie.cost — NOT onto the roster any more. Roster is FOCUS-suppressed during the hold (§129.6
    // item 8), so forcing onto it required the tap to ALSO set __lpNoFocusHold=1 just to make roster
    // register a rect at all — which then made §LOADPATH_FOCUS fail as a side effect (roster
    // "painted" during the hold), defeating the point of testing §HUD_LAYOUT in isolation. pie.cost
    // is never FOCUS-gated (it is one of the frozen HUD status rows that stays up through the whole
    // hold, per item 8's own text) and it registers on the SAME frame, one row before pie.ledger
    // (cpe_resource_panel.js's own row order) — so it is always there to collide onto without
    // touching FOCUS gating at all. Falls back to roster only if pie.cost was not registered this
    // frame (cost odometer off).
    if (window.__hudForceOverlap) {
      var pairCandidates = { 'pie.ledger': ['pie.cost', 'roster'], 'pie.cost': ['pie.ledger'],
        'roster': ['pie.ledger'] }[name];
      if (pairCandidates) {
        for (var pc = 0; pc < pairCandidates.length; pc++) {
          var other = A2._hudLayoutRects.filter(function (r) { return r.name === pairCandidates[pc]; })[0];
          if (other) { x = other.x; y = other.y; w = other.w; h = other.h; break; }
        }
      }
    }
    A2._hudLayoutRects.push({ name: name, x: x, y: y, w: w, h: h, parent: parentName || null, truncated: !!truncated });
  }
  // `h` (ROUND 13 item D, NEW param) — the frame height, needed to check `rowFontPx` against the
  // pre-Round-10 FORMULA (itself proportional to frame height, never a fixed pixel constant).
  // `tag` (Finding 1 broadened fix, 2026-09-16, NEW param, default '§HUD_LAYOUT') — lets the SAME
  // function print under a second name, '§HUD_LAYOUT_ARM', for the arm-frame sample (see the two
  // call sites in _captureFrame below). Same computation either way; only the log line's own tag differs.
  function _hudLayoutWitnessImpl(h, tag) {
    tag = tag || '§HUD_LAYOUT';
    var A2 = window.APP, rects = A2._hudLayoutRects || [], overlaps = 0, overflow = 0;
    var byName = {}; rects.forEach(function (r) { byName[r.name] = r; });
    rects.forEach(function (r) {
      if (r.parent && byName[r.parent] && !_hudRectContains(byName[r.parent], r)) overflow++;
    });
    for (var i = 0; i < rects.length; i++) for (var j = i + 1; j < rects.length; j++) {
      var a = rects[i], b = rects[j];
      // ROUND 12 item 3 (2026-09-16, real HHS bake: overlaps=78 from 13 placeholder rects all
      // registered at the SAME 0,0,1,1 marker) — a placeholder-sized rect (_drawUnlessHold's own
      // "something ran, no real geometry" marker convention, w<=1 and h<=1) is never real content
      // and must never count toward overlaps, however many of them happen to coincide.
      if ((a.w <= 1 && a.h <= 1) || (b.w <= 1 && b.h <= 1)) continue;
      if (a.parent === b.name || b.parent === a.name) continue;   // declared parent/child — never an overlap (overflow, above, is that pair's own check)
      if (_hudRectsOverlap(a, b)) overlaps++;
    }
    // §129.7 item 4 — rows whose measured text width exceeded their available width BEFORE any
    // fitting (the drawer's own honest self-report via the 7th A._hudLayoutRegister arg), never a
    // second, re-measured opinion here.
    var truncated = rects.filter(function (r) { return r.truncated; }).length;
    var cost = byName['pie.cost'], ledger = byName['pie.ledger'];
    var pieBand = byName['pie.band'], panel = byName['resource-panel'];
    // Finding 1 broadened fix (2026-09-16) — cost/ledger/pieBand/panel ALL absent means the resource
    // panel simply did not draw THIS frame (e.g. the mid-hold §HUD_LAYOUT sample, taken after §129.8
    // item 4b's FOCUS fade has taken hud.pie to alpha 0 — see _drawUnlessHold/resourcePanelComposite-
    // OntoCanvas's own opacity>0 guard). `orderOk`/`pieExclusive`/`rowsFullWidth` below used to default
    // to a bare `true` in that case — a vacuous pass, never a real check of anything. They now say
    // 'INCONCLUSIVE' instead, honestly, same convention as this project's other INCONCLUSIVE witnesses
    // (§129.4 PRIMAL LAW clause 4). The NEW arm-frame sample (tag='§HUD_LAYOUT_ARM', fired while
    // A._loadPathHudAlpha is still 1, before the fade starts) is the one that gets real values.
    var hudFaded = !cost && !ledger && !pieBand && !panel;
    // §129.6 item 6b — cost must sit fully above ledger (cost.y + cost.h <= ledger.y), checked
    // geometrically from the SAME registered rects, never a second layout opinion.
    var orderOk = hudFaded ? 'INCONCLUSIVE' : (!(cost && ledger) || (cost.y + cost.h <= ledger.y));
    // §129.7 item 8a (2026-09-16) — `pieExclusive`: no OTHER registered rect intersects the pie's
    // own band (`pie.band`, cpe_resource_panel.js's own registration). Reuses the SAME overlap test
    // and the SAME declared-parent/child exclusion the generic loop above already applies — a rect
    // parented to something else entirely (e.g. `pie.list`, a SIBLING under `resource-panel`, not a
    // child of `pie.band`) is still checked against `pie.band`; `pie.band`'s OWN declared parent
    // (`resource-panel`, the whole outer panel — always nested around it, never "beside" it) is
    // excluded too, else a fully-containing parent would always read as a false overlap.
    var pieExclusive = hudFaded ? 'INCONCLUSIVE' : true;
    if (!hudFaded && pieBand) {
      for (var pk = 0; pk < rects.length; pk++) {
        var pr = rects[pk];
        if (pr.name === 'pie.band' || pr.parent === 'pie.band' || pr.name === pieBand.parent) continue;
        if (_hudRectsOverlap(pieBand, pr)) { pieExclusive = false; break; }
      }
    }
    // §129.7 item 8d — `rowsFullWidth`: pie.cost/pie.ledger (whichever registered this frame) get
    // the SAME allocated width as each other (cpe_resource_panel.js now registers the ALLOCATED
    // full-inner-width column, never the variable measured text width — see its own comment) and
    // that width is most of the panel's own (a generous 0.7 threshold, robust to the exact pad
    // constant cpe_resource_panel.js uses — never re-derived here — while still clearly telling
    // apart "full width below the pie" from the old ~44%-squeezed side column).
    function isFullWidth(r) { return !!(r && panel && r.w >= panel.w * 0.7); }
    var rowsFullWidth = hudFaded ? 'INCONCLUSIVE' : ((!cost || isFullWidth(cost)) && (!ledger || isFullWidth(ledger)) &&
      (!cost || !ledger || cost.w === ledger.w));
    // ROUND 13 item D (2026-09-16, user: "the other text lines are too large. Keep them same size
    // as before, allow the pie only to grow") — `rowFontPx` is the REAL font px cpe_resource_panel.
    // js's own `_drawList` used THIS frame (`A._resPanelRowFontPx`, stashed there — never read back
    // from a flag); checked against the PRE-ROUND-10 FORMULA read from git history of that file
    // (HEAD's own `_drawList`: `fs = Math.max(9, Math.round(bh*0.085))` where `bh = Math.round(h*
    // 0.24)` — never re-typed as a fixed pixel constant, since the value is itself proportional to
    // frame height `h`). `pieBandH` is read straight off the ALREADY-registered `pie.band` rect's
    // own height (cpe_resource_panel.js's own registration) — never a second, re-derived number.
    var expectedRowFontPx = Math.max(9, Math.round(Math.round((h || 0) * 0.24) * 0.085));
    var rowFontPx = A2._resPanelRowFontPx;
    var fontOk = (rowFontPx == null) || (rowFontPx === expectedRowFontPx);
    var pieBandH = pieBand ? pieBand.h : null;
    // ROUND 16 item 1 (§129.9 item 1, 2026-09-16, red1: resource-panel read 173x272 vs 173x115 pre-
    // Round-10 — "gigantic") — `resourcePanelH` is the REAL registered `resource-panel` rect height,
    // checked against a FRESH recompute of cpe_resource_panel.js's own `_box()` formula (pieBandH +
    // pad + shownRows*rowH0+listHeaderH + pad*0.4, using ONLY `h` and `A2._resPanelShownRows` — the
    // live row count that function itself stashed, NEVER read back from `panel.h` itself, which
    // would be a tautology) — FAILs if any reserved worst-case space survives (the panel would then
    // read TALLER than this formula predicts for the rows actually shown).
    // ROUND 20 (2026-09-16, red1 ruling — MERGES Cost/Ledger back into this SAME panel, superseding
    // Round 16 item 1's separate `hud.fiveD` box): the recompute now ALSO adds the cost/ledger rows'
    // own content-driven height, off `A2._resPanelClRows` (the live count cpe_resource_panel.js's own
    // `resourcePanelCompositeOntoCanvas` stashed THIS frame — same non-tautological discipline as
    // `shownRows`), so a reserved worst-case surviving for EITHER the trade list OR the cost/ledger
    // rows still fails this check.
    var panelH = panel ? panel.h : null;
    var shownRows = A2._resPanelShownRows;
    var clRows = A2._resPanelClRows;
    var expectedPanelH = null, panelHOk = true;
    if (panelH != null && shownRows != null && pieBandH != null) {
      var _bh0 = Math.round((h || 0) * 0.24), _fs0 = Math.max(9, Math.round(_bh0 * 0.085)),
          _rowH0 = Math.round(_fs0 * 1.55), _pad = Math.round(_bh0 * 0.10),
          _listHeaderH = Math.round(_fs0 * 0.7 + _rowH0 * 0.95);
      var _rows = Math.max(0, Math.min(8, shownRows));
      var _listRowsH = _rows > 0 ? (_listHeaderH + _rows * _rowH0) : 0;
      var _clN = (clRows != null) ? Math.max(0, clRows) : 0;
      var _clRowsH = _clN > 0 ? Math.round(_pad * 0.5 + _clN * _rowH0) : 0;
      expectedPanelH = Math.round(pieBandH + _pad + _listRowsH + _clRowsH + _pad * 0.4);
      panelHOk = (panelH === expectedPanelH);
    }
    // ROUND 4 item 2, REVISED RULING (2026-09-16, red1): the panel does not widen and a truncated
    // (ellipsis-clipped) row is ACCEPTABLE by design — `truncated` is printed for visibility but no
    // longer gates PASS/FAIL; `overflow` (a registered rect actually leaving its panel) still does.
    var ok = overlaps === 0 && overflow === 0 && !!orderOk && fontOk && panelHOk;
    console.log(tag + ' items=[' + rects.map(function (r) {
      return r.name + ':' + Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.w) + ',' + Math.round(r.h);
    }).join(' ') + '] overlaps=' + overlaps + ' overflow=' + overflow + ' truncated=' + truncated +
      (cost && ledger ? ' costAboveLedger=' + orderOk : '') +
      ' pieExclusive=' + pieExclusive + ' rowsFullWidth=' + rowsFullWidth +
      ' rowFontPx=' + (rowFontPx == null ? 'n/a' : rowFontPx) + '(expect ' + expectedRowFontPx + ')' +
      ' pieBandH=' + (pieBandH == null ? 'n/a' : Math.round(pieBandH)) +
      ' resourcePanelH=' + (panelH == null ? 'n/a' : panelH) + '(expect ' + (expectedPanelH == null ? 'n/a' : expectedPanelH) + ')' +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
  }
  // §129.7 item 8c (2026-09-16) — §HUD_LAYOUT_STABLE: sample the registry EVERY frame (never just
  // mid-hold — the pie/cost/ledger panel is up through the whole buildup, not only a load-path
  // hold) for pie.cost/pie.ledger's own Y and the panel's own H. A min==max range across the WHOLE
  // bake is the falsifiable proof the panel's height and the pinned rows' Y truly never move —
  // called once per frame from _captureFrame, printed once at end of bake (see the frame loop's own
  // post-loop summary prints, e.g. §CPE_PIE_HOLD/§CPE_STATS_TAIL, right below it).
  // ROUND 20 (2026-09-16, red1 ruling — Cost/Ledger MERGED back into the resource panel's own box,
  // SUPERSEDING Round 16 item 1's separate `hud.fiveD`, which no longer exists) — `fiveDY` is GONE:
  // there is no more independently-positioned box to require frame-invariant. What that field was
  // protecting against (§129.7 item 8's own complaint: "the running new line...jumps up and down")
  // is now, by red1's own explicit ruling tonight, the CORRECT, intended behaviour — content-driven
  // sizing means ledgerY/costY (drawn right after the trade list) move WHENEVER the trade list's own
  // row count changes across the buildup, same reason `panelH` already stopped gating `ok` in Round
  // 16. Requiring them stable here would be requiring the exact fixed worst-case reservation tonight's
  // ruling rejected — so they stay PRINTED (visibility) but NEVER gate `ok` again.
  // What DOES still hold, unconditionally, by `_box()`'s own formula (`bw`/`x` are pure functions of
  // frame height + corner/stackY alone, NEVER of row count or content) is the panel's own X anchor —
  // `panelX` replaces `fiveDY` as the one field this witness still requires stable, so a real
  // regression (the whole box drifting sideways, corner flipping mid-bake, etc.) is still caught.
  var _hudStableLedgerY = null, _hudStableCostY = null, _hudStablePanelH = null, _hudStablePanelX = null;
  // Fix (2026-09-17, red1: "solve systematically, ensure it is WITNESSED" — the rolling-cards
  // inflation bug (cpe_resource_panel.js's `bigStatsCompositeOntoCanvas`) was invisible to every
  // existing witness because the ONE thing that checks `resource-panel`'s height against a fresh
  // formula recompute (`expectedPanelH`/`panelHOk`, in `_hudLayoutWitnessImpl` below) only ever runs
  // during the load-path hold — never during the separate reveal-round/rolling-cards phase where
  // this bug actually lived. Rather than run the full formula every single frame (red1's own
  // question: "why check every frame if it's a loop? check before and after"), this samples on
  // CHANGE ONLY — same "once per CHANGE, never per frame" discipline this file's own HUD registry
  // logging already follows elsewhere. A bug that's wrong for a whole repeating phase is wrong on
  // the FIRST frame of that phase, which is exactly when a content-state change fires this.
  var _hudPanelHCheckedKey = null, _hudPanelHEverFailed = false, _hudPanelHStatesChecked = 0;
  // `h` (real frame height, the SAME value `_hudLayoutWitnessImpl` takes as its own param) is passed
  // through from `_captureFrame`'s own scope — never reverse-derived from a registered rect (rounding
  // round-trips through `_box()`'s own multi-step formula are lossy and would produce false positives
  // that aren't real bugs).
  function _hudPanelHCheckOnChange(A2, h, panel, pieBandH) {
    if (!panel || pieBandH == null || !(h > 0)) return;
    var shownRows = A2._resPanelShownRows, clRows = A2._resPanelClRows;
    if (shownRows == null) return;
    var key = panel.h + '|' + h + '|' + shownRows + '|' + clRows;
    if (key === _hudPanelHCheckedKey) return;   // same content state as last frame — nothing new to prove
    _hudPanelHCheckedKey = key;
    _hudPanelHStatesChecked++;
    // Same pure formula as `_hudLayoutWitnessImpl` (§HUD_LAYOUT/§HUD_LAYOUT_ARM) and `_box()` itself
    // (cpe_resource_panel.js) — kept in sync deliberately, never read back from `panel.h`/`pieBandH`
    // themselves (that would be a tautology).
    var _bh0 = Math.round(h * 0.24), _fs0 = Math.max(9, Math.round(_bh0 * 0.085)),
        _rowH0 = Math.round(_fs0 * 1.55), _pad = Math.round(_bh0 * 0.10),
        _listHeaderH = Math.round(_fs0 * 0.7 + _rowH0 * 0.95);
    var _rows = Math.max(0, Math.min(8, shownRows));
    var _listRowsH = _rows > 0 ? (_listHeaderH + _rows * _rowH0) : 0;
    var _clN = (clRows != null) ? Math.max(0, clRows) : 0;
    var _clRowsH = _clN > 0 ? Math.round(_pad * 0.5 + _clN * _rowH0) : 0;
    var expected = Math.round(pieBandH + _pad + _listRowsH + _clRowsH + _pad * 0.4);
    if (panel.h !== expected) _hudPanelHEverFailed = true;
  }
  function _hudLayoutStableSampleImpl(h) {
    var A2 = window.APP, rects = (A2 && A2._hudLayoutRects) || [], byName = {};
    rects.forEach(function (r) { byName[r.name] = r; });
    var panel = byName['resource-panel'], ledger = byName['pie.ledger'], cost = byName['pie.cost'];
    var pieBand = byName['pie.band'];
    function widen(range, v) { return range ? [Math.min(range[0], v), Math.max(range[1], v)] : [v, v]; }
    if (panel) { _hudStablePanelH = widen(_hudStablePanelH, panel.h); _hudStablePanelX = widen(_hudStablePanelX, panel.x); }
    if (ledger) _hudStableLedgerY = widen(_hudStableLedgerY, ledger.y);
    if (cost) _hudStableCostY = widen(_hudStableCostY, cost.y);
    _hudPanelHCheckOnChange(A2, h, panel, pieBand ? pieBand.h : null);
  }
  function _hudLayoutStablePrintImpl() {
    function fmt(range) { return range ? '[' + range[0].toFixed(1) + ',' + range[1].toFixed(1) + ']' : '?'; }
    function stable(range) { return !range || range[0] === range[1]; }
    // ROUND 16 item 1 / ROUND 20 — `panelH`/`ledgerY`/`costY` are all now PRINTED but NO LONGER GATE
    // `ok`: the resource panel's own height (and everything drawn after the trade list inside it) is
    // SUPPOSED to track the rows actually shown each frame (Round 16's own fix, now also covering
    // Cost/Ledger — "the panel's height is pie band + the rows actually shown", never a fixed
    // worst-case reservation), so a real, healthy bake legitimately produces min!=max ranges on all
    // three now. `panelX` is the one field still required stable — see the block comment above.
    // Fix (2026-09-17, red1: "solve systematically... ensure it is WITNESSED") — `_hudPanelHCheckOnChange`
    // (above) has been silently accumulating a real correctness check (the same no-reserved-space
    // formula `_hudLayoutWitnessImpl`'s own `panelHOk` uses, just change-detected instead of run every
    // frame) across EVERY distinct content-state this whole bake ever showed — including the reveal-
    // round/rolling-cards phase the load-path hold's own witness never samples. It was computed and
    // never printed: exactly the "code ran, nothing proves it" gap this project keeps getting burned
    // by. `panelHFormulaOk` DOES gate `ok` (unlike the min/max ranges above, which are allowed to move)
    // — it is never allowed to be wrong, at any content state, anywhere in the film.
    var panelHVacuous = (_hudPanelHStatesChecked === 0);
    var panelHFormulaOk = panelHVacuous ? null : !_hudPanelHEverFailed;
    var ok = stable(_hudStablePanelX) && (panelHVacuous || panelHFormulaOk);
    console.log('§HUD_LAYOUT_STABLE ledgerY=' + fmt(_hudStableLedgerY) + ' costY=' + fmt(_hudStableCostY) +
      ' panelH=' + fmt(_hudStablePanelH) + ' panelX=' + fmt(_hudStablePanelX) +
      ' panelHFormula=' + (panelHVacuous ? 'INCONCLUSIVE reason=never-registered' : (panelHFormulaOk ? 'PASS' : 'FAIL')) +
      ' statesChecked=' + _hudPanelHStatesChecked +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
  }
  // §LOADPATH_FOCUS — the NAMED overlays item 8 lists ("off" unless this frame registered a rect).
  // §129.8 item 4b (amendment) — hud.status/hud.pie/hud.pathmap ADDED: "no status box, no pie panel
  // ... no path map/compass" now supersedes §129.6 item 8's old "status box stays" exemption.
  var _FOCUS_NAMES = ['measure.datum', 'measure.cues', 'measure.linear', 'measure.slab',
    'measure.indoor', 'measure.flyout', 'measure.rulefindings', 'measure.box', 'clash.labels',
    'roomtitle.fallback', 'daycounter', 'roster', 'hud.status', 'hud.pie', 'hud.pathmap'];
  // ROUND 12 item 3 (2026-09-16, real HHS bake) — "the FOCUS witness reads 'painted' from a real
  // non-empty rect only": with `_drawUnlessHold`'s own fix below (register ONLY when something was
  // actually visible), a name's presence in the registry already means alpha was > 0 when it ran —
  // no separate alpha re-check needed here any more; a name simply absent from the registry is
  // "off". `w>0 && h>0` is kept as a belt-and-suspenders filter in case anything ever registers a
  // placeholder through a path other than `_drawUnlessHold`.
  function _hudLayoutFocusWitnessImpl() {
    var A2 = window.APP, rects = A2._hudLayoutRects || [];
    var byName = {}; rects.forEach(function (r) { if (r.w > 0 && r.h > 0) byName[r.name] = true; });
    var painted = 0;
    var parts = _FOCUS_NAMES.map(function (n) {
      var isPainted = !!byName[n];
      if (isPainted) painted++;
      return n + ':' + (isPainted ? 'painted' : 'off');
    });
    var alpha = (A2._loadPathHudAlpha != null) ? A2._loadPathHudAlpha : 1;
    // ROUND 16 item 2 (§129.9 item 2, 2026-09-16, real HHS bake: the datum overlay drew twice, once
    // completely outside `_drawUnlessHold`'s own fade wrapper — a witness reading the REGISTRY alone
    // (`painted`) cannot see that, since the unwrapped call never registers a rect either way) —
    // `_lpUnwrappedDrawCount` is the REAL count of fillText/fillRect/strokeText/drawImage calls the
    // capture ctx received THIS frame outside both `A._inHudFadeWrapper` (every `_drawUnlessHold`
    // call, while genuinely faded) and `A._inLoadPathComposite` (load path's own composite, which by
    // design keeps drawing unwrapped through the hold) — "the witness that reads the frame, not a
    // wrapper." `window.__lpNoFocusHold=1` forces `_drawUnlessHold`'s own `faded` to false (alpha
    // pinned to 1), so nothing is genuinely wrapped that frame and every draw counts — the control's
    // own proof this reads real draw calls, not the flag alone.
    // `(loadpath-own)` is load-path's OWN composite (ladder/card) — by explicit, confirmed ruling
    // ("the ladder and info card are part of the frozen scene, not HUD — they stay on through the
    // freeze") it is SUPPOSED to paint at full alpha through the hold. Only an UNEXPECTED clobber
    // (a real HUD layer painting despite alpha=0) should fail this witness.
    var clobberLayers = Object.keys(_lpAlphaAtDraw).filter(function (k) { return k !== '(loadpath-own)'; });
    var ok = painted === 0 && _lpUnwrappedDrawCount === 0 && clobberLayers.length === 0;
    console.log('§LOADPATH_FOCUS overlays=[' + parts.join(' ') + '] painted=' + painted + ' hudAlpha=' + alpha.toFixed(2) +
      ' unwrappedDraws=' + _lpUnwrappedDrawCount +
      ' alphaClobber=[' + clobberLayers.map(function (k) { return k + ':' + _lpAlphaAtDraw[k].count + 'x@maxAlpha=' + _lpAlphaAtDraw[k].maxAlpha.toFixed(2); }).join(',') + ']' +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
    // Coordinator addition (2026-09-16) — stashed so cpe_load_path.js's own §LOADPATH_BACKDROP
    // witness (fired later, at release) can print ONE tied-together confirmation spanning BOTH halves
    // of "no other layers HUDs, background, sun lit sky, ground" — this witness's own mid-hold verdict
    // read back there as §LOADPATH_CONTEXT_OFF, never re-derived or re-checked a second way.
    A2._loadPathFocusLastResult = { ok: ok, painted: painted, unwrappedDraws: _lpUnwrappedDrawCount };
  }
  // ROUND 16 item 2 — instrument the capture ctx's own draw methods for the duration of a hold
  // frame's composite pass. `A2._inHudFadeWrapper` is true only while `_drawUnlessHold` is genuinely
  // fading a call (see its own comment); `A2._inLoadPathComposite` is true only while `A.
  // loadPathCompositeOntoCanvas` itself is running. A call outside BOTH is, by definition, a
  // composite call that bypassed the hold-fade discipline entirely.
  var _lpUnwrappedDrawCount = 0;
  var _lpCtxInstrument = null;   // {ctx, originals} while installed, else null
  // §129 FIX 5 (2026-09-17) — the ORIGINAL instrument only proved a draw call happened while
  // `_inHudFadeWrapper` was true; it never checked `ctx.globalAlpha` at the ACTUAL moment of that
  // call. A compositor that takes its own opacity/state and sets `ctx.globalAlpha` ABSOLUTELY
  // (the exact risk ROUND 13 item C's own comment names, only partly fixed) still counts as
  // "wrapped" here even while painting fully opaque — invisible to this witness either way. This
  // now also records the REAL globalAlpha seen at each call, named by which `_drawUnlessHold` layer
  // (if any) is currently active, so a clobbering compositor is named, not just suspected.
  var _lpAlphaAtDraw = {};
  function _lpInstallDrawInstrument(ctx) {
    if (!ctx || _lpCtxInstrument) return;
    var methods = ['fillText', 'fillRect', 'strokeText', 'drawImage'];
    var originals = {};
    methods.forEach(function (m) {
      if (typeof ctx[m] !== 'function') return;
      originals[m] = ctx[m];
      ctx[m] = function () {
        var A2 = window.APP;
        if (!(A2 && (A2._inHudFadeWrapper || A2._inLoadPathComposite))) _lpUnwrappedDrawCount++;
        var layer = (A2 && A2._drawUnlessHoldCurrentName) || (A2 && A2._inLoadPathComposite ? '(loadpath-own)' : '(unwrapped)');
        var ga = ctx.globalAlpha;
        if (ga > 0.02) {   // a real, visible paint despite whatever this frame's fade thinks alpha is
          if (!_lpAlphaAtDraw[layer]) _lpAlphaAtDraw[layer] = { count: 0, maxAlpha: 0 };
          _lpAlphaAtDraw[layer].count++;
          if (ga > _lpAlphaAtDraw[layer].maxAlpha) _lpAlphaAtDraw[layer].maxAlpha = ga;
        }
        return originals[m].apply(ctx, arguments);
      };
    });
    _lpCtxInstrument = { ctx: ctx, originals: originals };
  }
  function _lpUninstallDrawInstrument() {
    if (!_lpCtxInstrument) return;
    var ctx = _lpCtxInstrument.ctx, originals = _lpCtxInstrument.originals;
    Object.keys(originals).forEach(function (m) { ctx[m] = originals[m]; });
    _lpCtxInstrument = null;
  }
  // ══ §129.6 item 8 / §129.8 item 4b — FOCUS: "everything else is OFF during the hold" ══════════
  // Wraps a HUD/overlay draw call that has its own real-time animation (never one that is already a
  // pure function of the — now frozen during hold — tFilm, which needs no wrapping at all).
  // AMENDED (§129.8 item 4b, 2026-09-16): the call is NEVER skipped — it always runs (so it can fade
  // smoothly, never pop) at `ctx.globalAlpha *= A._loadPathHudAlpha` for the duration of the call,
  // restored immediately after.
  // ROUND 12 item 3 (2026-09-16, real HHS bake: overlaps=78 — 13 placeholder rects, ALL registered
  // at the same 0,0,1,1 marker, because the previous round registered UNCONDITIONALLY even at alpha
  // 0) — "a drawer that painted nothing must not register a rect": the placeholder is registered
  // ONLY when `alpha > 0` (something was genuinely, even if faintly, visible this frame). A fully
  // faded-out drawer (the whole stack-show middle of the hold) now registers NOTHING, which is
  // exactly what both §HUD_LAYOUT's overlap count and §LOADPATH_FOCUS's own "painted" need.
  // window.__lpNoFocusHold=1 forces alpha=1 (full visibility, always registers) — the control
  // §LOADPATH_FOCUS's own FAIL depends on. `A._captureCtx` is set once per frame by _captureFrame.
  // §129.55 A (2026-09-20) — `boxFn` (NEW, optional) returns THIS frame's real rect for this layer.
  // Until now every layer wrapped here registered only the 0,0,1,1 placeholder below, which the
  // §HUD_LAYOUT witness skips by design (w<=1 && h<=1) — so seven overlays were in the registry by
  // NAME only and contributed nothing to `overlaps`/`overflow`. That is how §129.52 (the stat card
  // drawn on top of the pie panel) sat under a green overlaps=0 and had to be found by eye.
  // A `boxFn` returning a real box (w>1 && h>1) registers THAT instead. No boxFn, or a degenerate
  // box, keeps the placeholder exactly as before — and the `alpha > 0` guard ("a drawer that painted
  // nothing must not register a rect") still gates both cases, unchanged.
  // ══ §ESCAPE_ROUTE_HUD_SUPPRESS — the overlays that CEASE while the escape route has the frame ══
  // red1, 2026-09-20 after seeing the clip: "While Escape Route, the other overlays have to cease.
  // Their work is sufficient and allowed full focus on EscRoute mgmt." — then, on being asked which:
  // "I don't mean the clock Sun stuff as it's needed.. I meant the Sanity and clashes".
  // WHAT CEASES: every `measure.*` layer and every `clash.*` layer — datum, cues, linear, slab,
  // indoor, flyout, rulefindings, box, and the clash labels with their counts. All of it is
  // FINDINGS signage about other rules, and the escape route is itself a findings beat — two
  // rulebooks arguing in one frame is the crowding he is reacting to.
  // WHEN: from two seconds before the STOREY REVEAL opens (red1: "off when the storey reveal
  // starts" plus "give 2 more secs back to see other overlays going off") through to the end of
  // the film, covering the escape beat with it. Both triggers feed the one decision below.
  // WHAT STAYS: the sun clock, the sun-compass readout, the day counter, the path box and the pie.
  // ⚠ THIS IS NOT THE RETIRED GATE'S LIST — it is very nearly its inverse. The old `_hudGate()`
  // cleared the sun clock, the compass readout, the path box and the pie, which are exactly the
  // four red1 now says are needed. Only the SHAPE of that mechanism is reused.
  // A._escRouteHudSuppress is set and maintained by cpe_escape_route.js — it is how the module
  // reports "my window is open" — so this gate reads a flag that already exists rather than adding
  // a second trigger. Gated in the one wrapper both layers already pass through, so there is a
  // single place that decides and a witness can assert it by name.
  // A PREDICATE, NOT A LIST. red1: "cease those overlays during ending orbit, as user has seen
  // enough" — Measure, Sanity and clashes, from the onset of the storey reveal.
  // The first cut named two layers of nine and was correct only by luck: the stale "Floor area"
  // box red1 chased all morning is `measure.box`, which was NOT in that list and went quiet only
  // because §SLAB_LABEL_STALE cleared its source. A named list also invites the tenth layer to
  // arrive by accident rather than by decision, which is exactly how §75 rotted into a half-fix.
  // Nothing in the closing orbit carries NEW measurement — every beat feeding these layers runs
  // earlier — so ceasing the whole family costs no live information.
  var ESC_SUPPRESS_RX = /^(measure\.|clash\.)/;
  // ══ THE OTHER HALF: WHAT THESE BEATS DRAW **ON THE BUILDING** ═══════════════════════════════
  // red1, 2026-09-20, after watching the 12:25 clip: "Make the overlay shine thru of beams cease
  // then. They are showing and disturbing the scene which now has other new stuff to do ie Storey
  // Reveal and then EscRoute. Even if not, it can just go on for 2 secs and no more as user has
  // seen enough and wana enjoy the finale of whole landed building."
  // THE GATE ABOVE ONLY EVER COVERED THE 2D HALF. `measure.datum` stopped drawing its chip and
  // §FINDINGS_CEASE said so — while `flythruDatumAt` kept setting `_grp.visible` from its OWN life
  // curve every frame, so the datum's depthTest:false uprights and storey bands went on shining
  // through the building to the final frame. The chips ceasing made that MORE obvious, not less:
  // the geometry was left with nothing to explain it.
  // ⚠ THE GATE IS A PREDICATE, NOT A LIST (2026-09-20). It used to hide four names —
  // flythruDatum, flythruCue, indoorBeats, slabBeat — and red1 watched a clip that CONTAINED that
  // fix and said "the glow thru beams still persists!". A list of four can never catch the fifth,
  // and the honest answer to "what else is still drawing?" is not to go and measure it: it is to
  // stop the code emitting. red1: "why such measures? It is GIGO.. if u dont stop the code from
  // emitting."
  // So the rule is now the DRAW CONTRACT itself. Shining through the building is what
  // `depthTest:false` MEANS in this viewer — cpe_flythru_dims.js states it as A.FLYTHRU_DRAW_CONTRACT
  // and clash_film.js, cpe_slab_beat.js, cpe_flythru_cues.js, cpe_flythru_datum.js, ghostglass.js,
  // grid_contours.js, grid_door_arcs.js, grid_dim_chains.js and hba_lens.js all use it. From the
  // moment the closing beats open, ANY object in the scene drawing under that contract is switched
  // off, whoever added it and whether or not anybody remembered it exists. A tenth module added
  // next month is covered the day it lands.
  // Building geometry is never depthTest:false, so nothing the film is ABOUT is reachable by this.
  // ONE EXEMPTION, and it is the beat that is actually on screen: the escape route's own room glow
  // is depthTest:false by design (cpe_escape_route.js §ESCAPE_ROUTE_NO_XRAY — "the room glow is
  // depthTest:false, so [it] still read[s] through the building"), so a blind sweep would switch
  // off the very thing the closing orbit exists to show. It is exempt BY NAME, it disposes itself
  // at beat exit, and W-CEASE asserts there is exactly one exemption and that it is that beat's.
  // HIDDEN, NEVER DISPOSED — each beat's own `.visible` returns the moment the gate lifts, the same
  // non-destructive shape clashFilm.setVisible already uses.
  // TWO ARMS, because they catch different things and the union is what red1 asked for.
  // ARM 1 — the NAMES. A beat's group can hold parts that depth-test normally (cpe_indoor_beats'
  // hall tint is painted ON the floor and shines through nothing), and those are still "an overlay
  // on the building" under his rule — "Its last second is like a finale. It should not have any
  // overlay on the building." A predicate on the draw contract alone would leave them on.
  // ARM 2 — the CONTRACT. The names can only ever cover beats somebody remembered; arm 2 covers
  // every module that shines through, including the ones nobody has thought of yet.
  // ══ §FILM_LAYER — ONE SWITCH PER LAYER, AND THE SAME SWITCH FOR ITS 2D AND ITS 3D ════════════
  // red1, 2026-09-20: "it be good to control each layer thru a proper mechanism."
  // THE DEFECT THIS REPLACES. A film layer had TWO unrelated controls. Its chip was drawn through
  // `_drawUnlessHold(name, ...)` and gated by `_escSuppresses(name)`; its GEOMETRY was a group the
  // module added to A.scene and drove from its own life curve, consulting nothing. So the gate
  // could report `§FINDINGS_CEASE layer=measure.datum` truthfully while the datum's uprights went
  // on shining through the building, and the master flag `A._flythruDatumOn` — which appears only
  // in the 2D chain of this file — could not reach them either. Two halves of one layer, two
  // switches, and only one of them wired to the rule.
  // THE MECHANISM. A module registers whatever it puts in the scene under the SAME layer name its
  // 2D half already uses:  A.filmLayer('measure.datum', _grp).  From then on one predicate governs
  // both halves: `_escSuppresses(name)` decides the chip AND the geometry, on the same frame, for
  // the same reason. A layer cannot half-cease any more, because there is no second switch left to
  // forget.
  // IT ONLY EVER SUPPRESSES. The gate writes `visible = false` and never `true`, so a beat's own
  // life curve still owns when it appears — the registry takes nothing over, it only takes away.
  // The name is the contract: anything not matching /^(measure\.|clash\.)/ is simply never gated,
  // which is why the sun clock, the compass and the day counter need no exemption.
  // ⚠ THIS SCOPE HAS NO `A`. cinema_maxq.js is a bare IIFE — every function inside it opens with
  // its own `var A = window.APP`. An `A.filmLayer = ...` written here reads an undeclared `A` at
  // MODULE LOAD, throws, and the module never finishes loading: the bake then sits at
  // §IDLE_GATE park forever with no error that names the cause. `node --check` passes it, because
  // an undeclared READ is valid syntax — the same trap that ate `var _tnFilm` in §129.61.
  // So the registry is a local function here and is ATTACHED to APP below, where A exists.
  function _filmLayerRegister(name, obj) {
    var A2 = window.APP;
    if (!A2 || !name || !obj) return obj;
    A2._filmLayers = A2._filmLayers || [];
    obj.userData = obj.userData || {};
    obj.userData.filmLayer = name;            // the sweep reads this to NAME an offender
    for (var i = 0; i < A2._filmLayers.length; i++) if (A2._filmLayers[i].obj === obj) return obj;
    A2._filmLayers.push({ name: name, obj: obj });
    console.log('§FILM_LAYER registered layer="' + name + '" object="' + (obj.name || obj.type) +
      '" — its 2D half and its geometry now cease on one rule');
    return obj;
  }
  function _ceaseRegistered() {
    var A2 = window.APP; if (!A2 || !A2._filmLayers) return 0;
    var n = 0;
    for (var i = 0; i < A2._filmLayers.length; i++) {
      var e = A2._filmLayers[i];
      if (!e.obj || !e.obj.visible) continue;
      if (!_escSuppresses(e.name)) continue;
      e.obj.visible = false; n++;
      A2._cease3DSeen = A2._cease3DSeen || {};
      if (!A2._cease3DSeen[e.name]) {
        A2._cease3DSeen[e.name] = 0;
        console.log('§FINDINGS_CEASE_3D layer="' + e.name + '" object="' + (e.obj.name || e.obj.type) +
          '" hidden by its OWN layer switch — the same rule that stopped its chip, on the same frame');
      }
      A2._cease3DSeen[e.name]++;
    }
    return n;
  }
  var CEASE_3D_GROUPS = ['flythruDatum', 'flythruCue', 'indoorBeats', 'slabBeat'];
  var CEASE_3D_EXEMPT_RX = /^escapeRouteGlow/;
  function _ceaseOwnerName(o) {
    // The OUTERMOST named ancestor: the nearest one is usually an anonymous mesh, and what the log
    // has to name is the MODULE that put this in the scene.
    var owner = '', p = o, hops = 0;
    while (p && hops++ < 32) { if (p.name) owner = p.name; p = p.parent; }
    return owner || ('(unnamed ' + (o.type || 'Object3D') + ')');
  }
  function _ceaseLayerTag(o) {
    // A registered ancestor is what names this object. Walked upward, because a module registers
    // its GROUP and the material that shines through is on a mesh several levels down.
    var p = o, hops = 0;
    while (p && hops++ < 32) { if (p.userData && p.userData.filmLayer) return p.userData.filmLayer; p = p.parent; }
    return null;
  }
  function _ceaseShinesThrough(o) {
    var m = o.material; if (!m) return false;
    var mats = Array.isArray(m) ? m : [m];
    for (var i = 0; i < mats.length; i++) if (mats[i] && mats[i].depthTest === false) return true;
    return false;
  }
  function _cease3D() {
    var A2 = window.APP;
    if (!A2 || !A2.scene || !A2._findingsHudSuppress) return;
    var hidNow = 0, kept = 0, unreg = 0, fresh = [];
    A2._cease3DSeen = A2._cease3DSeen || {};
    // ══ §RULE_TINT_CEASE — THE STRUCTURAL SANITY OVERLAY COMES DOWN ═════════════════════════════
    // red1, repeatedly: "the overlay of Sanity Structural/Safety still lingering in the building",
    // "those yellow beams were appearing during the Structural Sanity from first seconds".
    // WHAT IT IS, read in the source, not guessed. rule_findings_film.js:367 calls
    // A.showRuleModeTint(...{shineThrough:true}) while the Sanity beat runs. rule_checklist.js:518
    // builds one InstancedMesh per colour of translucent boxes over every flagged element and
    // A.scene.add()s them (:587) — `§RULE_TINT_ENTER elements=390 colors=2 shineThrough=true
    // renderOrder=900 depthTest=false` in every bake log. Those are the yellow cages on the beams.
    // WHY THEY NEVER LEFT. The only teardown is A.exitRuleModeTint (rule_checklist.js:649) and its
    // ONLY caller in the whole viewer was showRuleModeTint itself (:520), replacing a previous
    // tint. The film never called it. The single per-frame control it had was
    // A.ruleTintShowOnly(show) — which does not hide anything, it zero-scales the instances NOT in
    // `show` — and that call lives inside A.ruleFindingsFilmCompositeOntoCanvas, which is drawn
    // through _drawUnlessHold('measure.rulefindings', ...). So when the cease switched that layer
    // off, the one hand that was scaling the boxes each frame stopped, and they FROZE at full size
    // on the building to the final frame. Ceasing the chip is what made the boxes permanent.
    // ⚠ NOTHING HERE TOUCHES THE STOREY REVEAL'S TINT. That is a different mechanism in a
    // different module (cpe_storey_reveal.js _applyTint/_restoreTint recolours the building's OWN
    // materials) with its own restore, and it is not in scope.
    // This teardown is DESTRUCTIVE where the rest of the gate only hides — on purpose: it is the
    // module's own exit, it disposes its meshes and it puts the flagged elements' real geometry
    // back, which is what the finale needs. One shot, guarded by _ruleTintActive.
    if (A2._ruleTintActive && typeof A2.exitRuleModeTint === 'function') {
      var _rtMeshes = (A2._ruleTintMeshes || []).length;
      var _rtHidden = A2.collectMeshes
        ? A2.collectMeshes(function (o) { return o.userData && o.userData._ruleTintHidden; }).length : -1;
      try { A2.exitRuleModeTint(); } catch (eRT) { console.log('§RULE_TINT_CEASE threw: ' + eRT.message); }
      var _rtLeft = (A2._ruleTintMeshes || []).length;
      var _rtStill = A2.collectMeshes
        ? A2.collectMeshes(function (o) { return o.userData && o.userData._ruleTintHidden; }).length : -1;
      var _rtOk = (_rtLeft === 0 && _rtStill === 0 && !A2._ruleTintActive);
      console.log('§RULE_TINT_CEASE removed=' + _rtMeshes + ' tint meshes, restored=' + _rtHidden +
        ' flagged elements — left=' + _rtLeft + ' stillHidden=' + _rtStill +
        ' active=' + (!!A2._ruleTintActive) + ' => ' + (_rtOk ? 'PASS' : 'FAIL') +
        ' (the Structural Sanity boxes; NOT the storey reveal tint, which is cpe_storey_reveal.js)');
    }
    // ARM 0 — §FILM_LAYER. Every layer that registered its geometry ceases on its OWN switch, the
    // same one that stops its chip. This is the mechanism; the two arms below are the safety net
    // for anything that has not been wired to it yet.
    hidNow += _ceaseRegistered();
    // ARM 1 — the named beat groups, whole, whatever their materials do.
    for (var g = 0; g < CEASE_3D_GROUPS.length; g++) {
      var go = A2.scene.getObjectByName ? A2.scene.getObjectByName(CEASE_3D_GROUPS[g]) : null;
      if (!go || !go.visible) continue;
      go.visible = false; hidNow++;
      if (!A2._cease3DSeen[CEASE_3D_GROUPS[g]]) { A2._cease3DSeen[CEASE_3D_GROUPS[g]] = 0; fresh.push({ n: CEASE_3D_GROUPS[g], by: 'named beat group' }); }
      A2._cease3DSeen[CEASE_3D_GROUPS[g]]++;
    }
    // ARM 2 — everything else still drawing under the shine-through contract.
    try {
      A2.scene.traverseVisible(function (o) {
        if (!_ceaseShinesThrough(o)) return;
        var owner = _ceaseOwnerName(o);
        if (CEASE_3D_EXEMPT_RX.test(owner) || CEASE_3D_EXEMPT_RX.test(o.name || '')) { kept++; return; }
        // A registered object names itself. Anything the net catches WITHOUT a layer name is a
        // layer nobody wired to the mechanism — the log says so in those words, so the next person
        // reads a defect rather than "(unnamed Sprite)" and a mystery.
        var tag = _ceaseLayerTag(o);
        if (!tag) {
          unreg++;
          // FINGERPRINT, not a guess. An unregistered offender has no layer name by definition, so
          // the line has to carry enough to identify the module that made it without a second bake:
          // the ancestor chain, the renderOrder (clash_film uses 998/999, the escape glow 1004/1005,
          // the flythru contract 900) and the material's own colour.
          var chain = [], pc = o, ch = 0;
          while (pc && ch++ < 6) { chain.push((pc.name || pc.type)); pc = pc.parent; }
          var m0 = Array.isArray(o.material) ? o.material[0] : o.material;
          tag = 'UNREGISTERED ' + owner + ' {' + chain.join('<') + ' renderOrder=' + (o.renderOrder || 0) +
                ' mat=' + ((m0 && m0.type) || '?') +
                ((m0 && m0.color && m0.color.getHexString) ? ' #' + m0.color.getHexString() : '') + '}';
        }
        o.visible = false; hidNow++;
        if (!A2._cease3DSeen[tag]) { A2._cease3DSeen[tag] = 0; fresh.push({ n: tag, by: 'depthTest:false draw contract (the net, not a switch)' }); }
        A2._cease3DSeen[tag]++;
      });
    } catch (eC3) { console.log('§FINDINGS_CEASE_3D sweep threw: ' + eC3.message); return; }
    for (var f = 0; f < fresh.length; f++) {
      console.log('§FINDINGS_CEASE_3D group="' + fresh[f].n + '" hidden, found by the ' + fresh[f].by +
        ' — it was drawing ON the building, which the 2D gate never reached. Hidden, not disposed:' +
        ' the beat\'s own visibility returns the moment the gate lifts.');
    }
    // ONE line per CHANGE, never one per frame: in steady state the sweep finds the same objects
    // every frame and a log that repeated 193 times would drown the run it is meant to explain.
    var keptFirst = (kept > 0 && !A2._cease3DKeptSeen);
    if (keptFirst) A2._cease3DKeptSeen = 1;
    if (!fresh.length && !keptFirst) return;
    console.log('§FINDINGS_CEASE_3D sweep hid=' + hidNow + ' exempt=' + kept +
      ' unregistered=' + unreg + ' (exempt is the live beat\'s own glow; unregistered>0 means a' +
      ' layer is still relying on the net instead of its own switch) layers=[' +
      Object.keys(A2._cease3DSeen).join(' | ') + ']');
  }
  function _escSuppresses(name) {
    var A2 = window.APP;
    if (!A2 || !ESC_SUPPRESS_RX.test(name)) return false;
    // TWO triggers, ONE decision. `_escRouteHudSuppress` is the escape route's own window;
    // `_findingsHudSuppress` opens two seconds before the storey reveal and does not close, so the
    // chips cannot flash back on in the ~1.2 s gap between beats.rise and the escape window.
    return !!(A2._escRouteHudSuppress || A2._findingsHudSuppress);
  }
  function _drawUnlessHold(name, fn, boxFn) {
    var A2 = window.APP;
    // Suppressed overlays register a 1x1 placeholder exactly as an absent box does, so §HUD_LAYOUT
    // still has a row for them and _rowAdvance reads a zero-size box — the row collapses and the
    // card below gets the space, which is the point of ceding the frame.
    if (_escSuppresses(name)) {
      if (A2) {
        if (A2._hudLayoutRegister) A2._hudLayoutRegister(name, 0, 0, 1, 1);
        if (!A2._hudCompositeAlphaSample) A2._hudCompositeAlphaSample = {};
        A2._hudCompositeAlphaSample[name] = 0;
        A2._escSuppressedThisFrame = (A2._escSuppressedThisFrame || 0) + 1;
        // §FINDINGS_CEASE — the bake SAYS this happened, once, naming the layers and the trigger.
        // red1 asked for it in as many words: "WITNESS logging must be present for those big
        // request ie ceasing of M/C/S overlays during storey reveal start." A gate that is only
        // provable by a node witness is not provable from the film that shipped.
        A2._ceaseSeen = A2._ceaseSeen || {};
        if (!A2._ceaseSeen[name]) {
          A2._ceaseSeen[name] = 1;
          console.log('§FINDINGS_CEASE layer=' + name + ' ceased' +
            ' trigger=' + (A2._escRouteHudSuppress && !A2._findingsHudSuppress ? 'escape-route-window'
              : (A2._findingsHudSuppress ? 'storey-reveal-onset' : 'unknown')) +
            ' — Measure/Sanity/clash signage stands down for the closing movement (red1: "cease' +
            ' those overlays during ending orbit, as user has seen enough"). Layers ceased so far=' +
            Object.keys(A2._ceaseSeen).length);
        }
      }
      return;
    }
    var forced = !!window.__lpNoFocusHold;
    var alpha = forced ? 1 : ((A2 && A2._loadPathHudAlpha != null) ? A2._loadPathHudAlpha : 1);
    var ctx2 = A2 && A2._captureCtx;
    var faded = ctx2 && alpha < 1;
    if (faded) { ctx2.save(); ctx2.globalAlpha = ctx2.globalAlpha * alpha; }
    // ROUND 13 item C — `alpha` is now handed to `fn` itself: several compositors this wraps
    // (resourcePanel/bigStats/dayCounter/pathOverview/flythruCues) take their OWN `opacity`
    // parameter and set `ctx.globalAlpha` straight from it, an ABSOLUTE assignment that silently
    // clobbers the ambient `ctx2.globalAlpha *= alpha` set just above — those call sites now pass
    // `alpha` through instead of a hardcoded `1`, so the SAME number governs both.
    // ROUND 16 item 2 — `_inHudFadeWrapper` is true only while GENUINELY faded (`faded`, not just
    // "inside this function"): under `window.__lpNoFocusHold=1`, `alpha` is pinned to 1 so `faded`
    // is false here too, and the draws below are correctly left UNEXCLUDED from the frame-truth
    // count — the control's own proof.
    if (A2) { A2._inHudFadeWrapper = faded; A2._drawUnlessHoldCurrentName = name; }
    fn(alpha);
    if (A2) { A2._inHudFadeWrapper = false; A2._drawUnlessHoldCurrentName = null; }
    if (faded) ctx2.restore();
    if (alpha > 0 && A2 && A2._hudLayoutRegister) {
      // §129.55 A — the drawer's own published rect when it has one, read AFTER fn() so it is this
      // frame's, never a neighbour's. try/catch for the same never-kills-a-bake contract every
      // other optional HUD read here keeps.
      var _rb = null;
      if (boxFn) { try { _rb = boxFn(); } catch (eRB) { _rb = null; } }
      if (_rb && _rb.w > 1 && _rb.h > 1) A2._hudLayoutRegister(name, _rb.x, _rb.y, _rb.w, _rb.h);
      else A2._hudLayoutRegister(name, 0, 0, 1, 1);
    }
    // ROUND 13 item C — record the alpha THIS call actually used, per layer name, per frame (reset
    // every frame in _captureFrame alongside A._hudLayoutRects) — the real number the §LOADPATH_
    // HUD_FADE witness now reads, instead of re-deriving one from the formula alone.
    if (A2) { if (!A2._hudCompositeAlphaSample) A2._hudCompositeAlphaSample = {}; A2._hudCompositeAlphaSample[name] = alpha; }
  }
  // §129.1 FREEZE bridge, published for OTHER lanes (georef/sun-compass, bim-ootb#1751/#1752):
  // main's own `_hudHold` reads this off window and falls back to drawing at full opacity when it
  // is absent, so the compass/clock overlays respect the load-path freeze the moment this branch
  // merges — no edit needed on their side. One line, beside the definition, as they asked.
  if (typeof window !== 'undefined') window.__drawUnlessHold = _drawUnlessHold;

  // ══ §HUD_SCALE (2026-09-19) — ONE sizing law for every bake overlay ═════════════════════════
  // red1, after watching the same film at 854x480 and 1920x1080: "it's too big in low res and too
  // small in hi res". Every overlay in this viewer sized itself as a CONSTANT FRACTION of frame
  // height, which keeps text the same PROPORTION at every resolution — and proportion is not
  // legibility. A 480-tall frame carries little scene detail, so a 2.6% caption dominates it; a
  // 2160-tall frame is dense, and the same 2.6% vanishes into it. Constant pixels are worse in the
  // other direction, which is the trap `13 * k` fell into with its 1.6 ceiling (§129.36).
  // So the FRACTION ITSELF rises with resolution — gently, as h^0.35 about a 1080 anchor, and
  // clamped at both ends so no resolution can run away:
  //     480 -> 1.96% of frame height   720 -> 2.26%   1080 -> 2.60%   1440 -> 2.87%   2160 -> 3.17%
  //   (for the 0.026 family; every caller keeps its own 1080 anchor, so their RELATIVE sizes —
  //    counter against readout against clock caption — are exactly as they were tuned.)
  // Published on `window` rather than `A` for the same reason `__drawUnlessHold` is: this IIFE runs
  // at script load, when window.APP may not exist yet, and every caller reads it at DRAW time.
  // Each caller falls back to its own old formula when this is absent, so a page that loads an
  // overlay without cinema_maxq still draws.
  function _hudFontPx(h, k1080, minPx) {
    var hh = h || 1080;
    var k = k1080 * Math.pow(hh / 1080, 0.35);
    var lo = k1080 * 0.70, hi = k1080 * 1.22;
    if (k < lo) k = lo; else if (k > hi) k = hi;
    return Math.max(minPx || 9, Math.round(hh * k));
  }
  if (typeof window !== 'undefined') window.__hudFontPx = _hudFontPx;
  // §129.1 FREEZE bridge, RESOLVED SIDE (merge of origin/main, 2026-09-19). The sun-compass lane
  // built against a main with no freeze beat, so it called this through `window.__drawUnlessHold`
  // with a "draw at full opacity" fallback. Both lanes now live in THIS file, so the indirection is
  // gone: `_hudHold` is the real wrapper, called directly. The window publish above stays for any
  // other lane still building against main.
  function _hudHold(name, fn, boxFn) { return _drawUnlessHold(name, fn, boxFn); }   // §129.55 B — must forward boxFn; suncompass.clock/readout go through here
  // ══ §FRAME_COST (2026-09-19, LARGE_DB_BAKE.md §8.2 item 1) — is this frame paying for the
  // MODEL or for ITSELF? ════════════════════════════════════════════════════════════════════════
  // red1: "study how to reduce hi element DB as a frame is only a limited set". MEASURED at
  // identical settings on 2026-09-19: HHS (6,880 elements) 0.54 s/frame, Terminal (48,428) 0.86,
  // LTU (122,330) 2.55 — and within ONE LTU bake the rate went 0.64 -> 2.75 s/frame as the buildup
  // filled the scene in. Cost tracks what the scene HOLDS. What no log has ever said is how much
  // of that the renderer was ALREADY throwing away, and that single number decides whether culling
  // work is worth anything at all: if `drawn` is already a small fraction of `held`, the cost is
  // somewhere else and §8.3's levers are dead on arrival. So this is measured BEFORE anything is
  // built, and it is allowed to kill the idea.
  //
  // Cheap by construction: it runs only on the frames §MAXQ_FRAME already logs (throttled to
  // MAXQ_LOG_MS), never per frame, so the measurement cannot distort what it measures.
  // `calls`/`triangles` are three.js's own per-render counters and describe the LAST render of the
  // still-refine burst, not the sum of all 20 — the burst multiplies whatever this number is.
  function _logFrameCost(i, nFrames, perFrameMs) {
    try {
      var A2 = window.APP;
      if (!A2 || !A2.scene || !A2.camera || typeof THREE === 'undefined') return;
      var held = 0, vis = 0, inFrustum = 0, instanced = 0, instancedCount = 0;
      var cam = A2.camera;
      cam.updateMatrixWorld();
      var _m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      var _fr = new THREE.Frustum().setFromProjectionMatrix(_m);
      var _sph = new THREE.Sphere();
      A2.scene.traverse(function (o) {
        if (!o.isMesh && !o.isInstancedMesh) return;
        held++;
        if (o.isInstancedMesh) { instanced++; instancedCount += (o.count || 0); }
        if (!o.visible) return;
        // a hidden ancestor hides this too — `visible` alone would over-count
        for (var p = o.parent; p; p = p.parent) { if (!p.visible) return; }
        vis++;
        var g = o.geometry;
        if (!g) return;
        if (!g.boundingSphere) { try { g.computeBoundingSphere(); } catch (e) { return; } }
        if (!g.boundingSphere) return;
        _sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
        if (_fr.intersectsSphere(_sph)) inFrustum++;
      });
      var inf = (A2.renderer && A2.renderer.info && A2.renderer.info.render) || null;
      var pct = function (a, b) { return b ? (100 * a / b).toFixed(1) : '0.0'; };
      console.log('§FRAME_COST i=' + i + '/' + nFrames + ' perFrameMs=' + Math.round(perFrameMs) +
        ' held=' + held + ' visible=' + vis + ' inFrustum=' + inFrustum +
        ' frustumPct=' + pct(inFrustum, vis) + '%ofVisible' +
        ' instancedMeshes=' + instanced + ' instances=' + instancedCount +
        ' lastRenderCalls=' + (inf ? inf.calls : 'n/a') + ' lastRenderTris=' + (inf ? inf.triangles : 'n/a') +
        ' — frustumPct is the number that decides LARGE_DB_BAKE.md §8: high means the renderer is' +
        ' already submitting most of the model every frame and culling is worth building; low means' +
        ' it is culling well already and the cost is elsewhere.');
    } catch (e) {
      if (!window.__frameCostWarned) { window.__frameCostWarned = true;
        console.warn('§FRAME_COST unavailable: ' + (e && e.message) + ' — measurement only, bake unaffected'); }
    }
  }
  // §ESCAPE_ROUTE_HUD_SUPPRESS is WIRED — `_escSuppresses` above says what ceases (the Sanity
  // rule-findings chips and the clash labels) and what keeps drawing (the sun clock, the compass
  // readout, the day counter, the path box, the pie). These are working decisions red1 adjusts as
  // he sees results; this comment states what the code does, not how it got here.
  // ⚠ ONE THING THAT IS NOT SUPPRESSION: the Escape Route card occupies the bigStats slot for its
  // window, the same slot the tail/storey/measure cards already take turns in. One slot holds one
  // card; that is the chain's existing behaviour.
  async function _captureFrame(w, h, titleInfo, dayInfo, ovInfo, resInfo, statInfo, lblInfo, statusSrc, escInfo, escCardInfo) {
    var _fcFilmSec = (window.APP && window.APP._flythruFilmSec) || 0;
    var A = window.APP;
    A._hudLayoutRects = [];   // §HUD_LAYOUT — fresh registry every frame, never carries a stale rect
    A._hudCompositeAlphaSample = {};   // ROUND 13 item C — fresh per frame, keyed by _drawUnlessHold's own name
    A._hudLayoutRegister = _hudLayoutRegisterImpl;
    A._hudLayoutWitness = _hudLayoutWitnessImpl;
    A._hudLayoutFocusWitness = _hudLayoutFocusWitnessImpl;
    // §40.1 — the Measure queue is per FRAME. Reset before the beat compositors run so a
    // posting can never survive into the next frame's box.
    if (A.filmBoxesMeasureReset) A.filmBoxesMeasureReset();
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    A._captureCtx = ctx;   // §129.8 item 4b — the ONE ctx _drawUnlessHold's HUD alpha fade applies to
    // §DATUM_DECOUPLE (prompts/MEP_CLASH_REVEAL_MOVIE.md §53) — bisect-only mode, NOT the normal path.
    // No GPU render, no other overlay: the source PNG already carries everything except the datum
    // (baked with its two draw entry points stubbed, out/tap_datum_off.js). Isolates whether the
    // defect is in the function's own math/state or in something about the live GPU bake loop.
    if (A._burninDatumDir) {
      var _bIdx = A._burninFrameIdx || 0;
      var _bUrl = A._burninDatumDir + 'frame_' + String(_bIdx).padStart(5, '0') + '.png';
      var _bImg = await new Promise(function (resolve, reject) {
        var im = new Image();
        im.onload = function () { resolve(im); };
        im.onerror = function () { reject(new Error('§DATUM_DECOUPLE_ERR frame load failed: ' + _bUrl)); };
        im.src = _bUrl;
      });
      ctx.drawImage(_bImg, 0, 0, w, h);
      // ROUND 16 item 2 (2026-09-16, §129.9 item 2) — DELETED: this call drew the datum overlay
      // UNCONDITIONALLY, outside `_drawUnlessHold`'s own hold-fade wrapper (the SAME overlay is
      // drawn again below, correctly wrapped, on the normal live-render path) — an unwrapped
      // composite call that would survive a load-path hold undetected by any alpha check. §53's own
      // bisect-only decouple mode does not need the datum burned into its diagnostic frames at all;
      // if it ever does again, it must go through the SAME wrapper as everything else, never a
      // second unwrapped call.
      if (A.loadPathCompositeOntoCanvas) {
        try { A.loadPathCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eLPD) { console.warn('§LOADPATH_DRAW_ERR failed (burn-in): ' + (eLPD && eLPD.message)); }
      }
      if (A.ledgerTickerCompositeOntoCanvas) {
        try { A.ledgerTickerCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eLTD) { console.warn('§LEDGER_TICKER_DRAW_ERR failed (burn-in): ' + (eLTD && eLTD.message)); }
      }
      if (_bIdx === 0 || _bIdx % 100 === 0) console.log('§DATUM_DECOUPLE_FRAME i=' + _bIdx + ' src=' + _bUrl);
      return new Promise(function (res) { c.toBlob(res, 'image/webp', 0.92); });
    }
    // §129 DIAGNOSTIC (2026-09-17, red1: "not a single change is evident" — re-checking with real
    // frame reads, not another blind bake) — sample LIVE scene state at the EXACT instant this
    // frame's render actually happens, immediately before it, from the SAME `A.scene` traversal the
    // apply-side code used. Every apply-side witness (§LOADPATH_WHITEN, §LOADPATH_BACKDROP) reads
    // its OWN bookkeeping arrays right after mutating them — never disproves that the mutation
    // reached the object actually drawn. This does.
    if (A._loadPathHoldFrameActive && A._loadPathDiagSample) {
      try { A._loadPathDiagSample('pre-render'); } catch (eLPD2) { console.warn('§LOADPATH_DIAG_ERR ' + (eLPD2 && eLPD2.message)); }
    }
    if (A._composer) A._composer.render();
    ctx.drawImage(A.renderer.domElement, 0, 0, w, h);
    // §129 DIAGNOSTIC (2026-09-17) — GROUND TRUTH pixel readback, right after the 3D scene lands in
    // the 2D capture canvas, before any HUD/overlay draws touch it. Every prior check (apply-side
    // witnesses, the live pre-render state sample above) proves JS OBJECT STATE, never proves a
    // PHOTON actually changed. This reads the real encoded pixels themselves, a 5x5 median sample at
    // 5 fixed fractional points across the frame (building-heavy regions in the sighted stills), on
    // hold frames only, so a real change (or its total absence) is undeniable either way.
    try {
      var _pxPts = [[0.30, 0.55], [0.45, 0.65], [0.60, 0.45], [0.20, 0.75], [0.70, 0.70],
        [0.53, 0.87], [0.62, 0.92], [0.05, 0.42], [0.10, 0.50], [0.85, 0.60], [0.784, 0.77],
        [0.913, 0.031], [0.95, 0.08], [0.80, 0.15], [0.41, 0.21], [0.35, 0.12]];
      var _pxOut = [];
      for (var _pp = 0; _pp < _pxPts.length; _pp++) {
        var _px = Math.round(_pxPts[_pp][0] * w), _py = Math.round(_pxPts[_pp][1] * h);
        var _d = ctx.getImageData(_px, _py, 1, 1).data;
        _pxOut.push(_px + ',' + _py + '=' + _d[0] + ',' + _d[1] + ',' + _d[2]);
      }
      console.log('§LOADPATH_PIXEL_DIAG_PRE_HUD hold=' + !!A._loadPathHoldFrameActive + ' hudAlpha=' + (A._loadPathHudAlpha == null ? 'n/a' : A._loadPathHudAlpha.toFixed(3)) + ' ' + _pxOut.join(' '));
      if (A._loadPathHoldFrameActive && A._loadPathMidHoldThisFrame && !A._loadPathDiagRaycastFired && A._loadPathDiagRaycast) {
        A._loadPathDiagRaycastFired = true;
        var _ndcPts = _pxPts.map(function (fp) { return [fp[0] * 2 - 1, 1 - fp[1] * 2]; });
        A._loadPathDiagRaycast(_ndcPts, 'midHold');
      }
    } catch (ePxD) { console.warn('§LOADPATH_PIXEL_DIAG_ERR ' + (ePxD && ePxD.message)); }
    // ROUND 16 item 2 — instrument the capture ctx for this frame's WHOLE HUD/overlay composite
    // pass, ONLY on a hold frame (never the cost of a per-frame wrapper on every other frame): the
    // base scene render just above is deliberately OUTSIDE this window (it is not a HUD overlay and
    // must never be fade-gated). Uninstalled right after §LOADPATH_FOCUS reads the count, below.
    var _lpInstrumentedThisFrame = !!A._loadPathHoldFrameActive;
    _lpUnwrappedDrawCount = 0;
    _lpAlphaAtDraw = {};
    if (_lpInstrumentedThisFrame) _lpInstallDrawInstrument(ctx);
    // §CLASH_FILM_P2 — the clash-pair labels, FIRST in the 2D pass: they are scene-anchored and
    // wander, the corner HUD below is fixed furniture, so the HUD must always paint over a label.
    // Same never-kills-a-bake contract as every other overlay here.
    // §FLYTHRU_DIM_CUE — the measurement marking. Composited here because the bake captures this
    // 2D context, not the WebGL canvas: a marking drawn in 3D text would not survive the capture.
    // §FLYTHRU_DATUM (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §24) — the opening setting-out
    // drawing: grid bubbles, bay chains and level rules laid IN THE MODEL'S OWN PLANES.
    // ⚠ Until now this layer existed only in scripts/snap_timeline.js: it had never been composited
    // by a real bake, so no Alt-C film has ever carried it. Same never-kills-a-bake contract as the
    // overlays around it, and gated by the Measure checkbox rather than always-on.
    // ⚠ _captureFrame is its OWN function, not a closure over the bake body — which is exactly why
    // _fcFilmSec above is read off window.APP rather than captured. The datum's two values cross the
    // same way; declaring them in the bake body would have compiled cleanly and thrown at run time.
    // §129.6 item 8 FOCUS — every overlay below with its OWN real-time animation is wrapped in
    // _drawUnlessHold so it paints nothing at all on a hold frame (window.__lpNoFocusHold=1 forces
    // it through, for the control). load path + the (now no-op) ledger ticker composite are NEVER
    // wrapped — load path is the one thing that keeps animating through the hold by design.
    if (A._flythruDatumOn && A.flythruDatumCompositeOntoCanvas) {
      _drawUnlessHold('measure.datum', function () {
        try { A.flythruDatumCompositeOntoCanvas(ctx, w, h, _fcFilmSec, A._flythruFilmSecFull || 0); }
        catch (eFDM) { if (!A._flythruDatumWarned) { A._flythruDatumWarned = true; console.warn('§FLYTHRU_DATUM_DRAW failed: ' + (eFDM && eFDM.message)); } }
      });
    }
    if (A.flythruCuesCompositeOntoCanvas) {
      _drawUnlessHold('measure.cues', function (a) {
        // ROUND 13 item C — `a` (the ambient hold-fade alpha) is now passed through as the cue
        // layer's own external multiplier (flythruCuesCompositeOntoCanvas's 5th param, NEW), since
        // its internal `ctx.globalAlpha = a.opacity` (its own cue fade-in/out) is an absolute
        // assignment that would otherwise clobber the ambient alpha `_drawUnlessHold` set before
        // this call.
        try { A.flythruCuesCompositeOntoCanvas(ctx, w, h, _fcFilmSec, a); }
        catch (eFDC) { if (!A._flythruDimWarned) { A._flythruDimWarned = true; console.warn('§FLYTHRU_DIM_DRAW failed: ' + (eFDC && eFDC.message)); } }
      });
    }
    // §HUD FIX (2026-09-15, real HHS bake: the label ladder collided with the pie/resource panel)
    // — A.loadPathCompositeOntoCanvas/A.ledgerTickerCompositeOntoCanvas (the latter a no-op since
    // §129.6 item 6b) MOVED to the END of this function (see below, right before the §HUD_LAYOUT/
    // §LOADPATH_FOCUS trigger): the label ladder's OWN column-placement algorithm now reads
    // A._hudLayoutRects to avoid every rect already registered THIS frame, which only works if
    // status-box/resource-panel/roster have already drawn (and registered) by the time it runs.
    // §LINEAR_BEAT (§27) — the column/beam dimension cues, same 2D pass, same never-kills-a-bake contract.
    if (A._flythruDatumOn && A.linearBeatCompositeOntoCanvas) {
      _drawUnlessHold('measure.linear', function () {
        try { A.linearBeatCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eLBC) { if (!A._linearBeatWarned) { A._linearBeatWarned = true; console.warn('§LINEAR_BEAT_DRAW failed: ' + (eLBC && eLBC.message)); } }
      });
    }
    // §SLAB_BEAT (§40.2) — the plate's surface area posts into the Measure queue here, in the 2D
    // pass, for the same reason every other beat does: this is the only point that reaches the
    // exported bytes. Its in-model marks (tint + box outline) are 3D and already in the frame.
    if (A._flythruDatumOn && A.slabBeatCompositeOntoCanvas) {
      _drawUnlessHold('measure.slab', function () {
        try { A.slabBeatCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eSBC) { if (!A._slabBeatWarned) { A._slabBeatWarned = true; console.warn('§SLAB_BEAT_DRAW failed: ' + (eSBC && eSBC.message)); } }
      });
    }
    if (A._flythruDatumOn && A.indoorBeatsCompositeOntoCanvas) {
      _drawUnlessHold('measure.indoor', function () {
        try { A.indoorBeatsCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eIBC) { if (!A._indoorBeatsWarned) { A._indoorBeatsWarned = true; console.warn('§INDOOR_BEAT_DRAW failed: ' + (eIBC && eIBC.message)); } }
      });
    }
    if (A._flythruDatumOn && A.flyoutBeatsCompositeOntoCanvas) {
      _drawUnlessHold('measure.flyout', function () {
        try { A.flyoutBeatsCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
        catch (eFBC) { if (!A._flyoutBeatsWarned) { A._flyoutBeatsWarned = true; console.warn('§FLYOUT_BEAT_DRAW failed: ' + (eFBC && eFBC.message)); } }
      });
    }
    if (A._flythruDatumOn && A.ruleFindingsFilmCompositeOntoCanvas) {
      _drawUnlessHold('measure.rulefindings', function (a) {
        try { A.ruleFindingsFilmCompositeOntoCanvas(ctx, w, h, _fcFilmSec, a); }
        catch (eRFC) { if (!A._ruleFindingsFilmWarned) { A._ruleFindingsFilmWarned = true; console.warn('§RULE_FILM_DRAW failed: ' + (eRFC && eRFC.message)); } }
      });
    }
    // §ESCAPE_ROUTE_REVEAL — the dotted route and its two leader labels. Scene-anchored like the
    // clash labels above it and drawn in the same 2D pass for the same reason (§P2.2): this is the
    // only layer that reaches the exported bytes. Before the corner HUD, which is fixed furniture.
    if (escInfo && A.escapeRouteCompositeOntoCanvas) try {
      A.escapeRouteCompositeOntoCanvas(ctx, w, h, escInfo);
    } catch (eERd) {
      if (!A._escDrawErrLogged) { A._escDrawErrLogged = true;
        console.warn('§ESCAPE_ROUTE_ERR draw: ' + eERd.message + ' — route skipped, frames continue'); }
    }
    // §STATUS_BOX — the centred lower-third caption plate is NOT drawn here. It was, from a
    // keep-both merge resolution in d63c59d6, and the exported frame then carried BOTH the
    // right-hand status box AND the bar that box replaced (§38.1b: "REPLACES the centred
    // lower-third caption plate for the bake ... only the exported frame stops using it"). red1
    // saw it: "there is an old Measure status bottom bar which we first moved to the HUD, but that
    // copy still there in this clip."
    // ⚠ WORSE THAN A DUPLICATE. That call sat OUTSIDE _drawUnlessHold, so it registered no rect
    // (which is how §HUD_LAYOUT never saw two captions), it did not fade with the load-path freeze
    // when every other overlay does, and it would have ignored the §FINDINGS_HUD_CLEAR gate, which
    // lives inside that wrapper.
    // The surviving draw is the `else` of `if (A.filmBoxesDrawStatus)` further down — the fallback
    // for a build where the status box is absent. Deleting this one alone would have taken the
    // escape-route caption off screen with it (checked: filmBoxesDrawStatus exists in a bake, so
    // that else never runs), which is why `_erCap` now rides the status box's Reveal row.
    if (lblInfo && lblInfo.placed && lblInfo.placed.length && A.clashLabelsCompositeOntoCanvas) {
      _drawUnlessHold('clash.labels', function (a) {
        try { A.clashLabelsCompositeOntoCanvas(ctx, w, h, lblInfo.placed, a); }
        catch (eCLd) {
          if (!A._clashLblDrawErrLogged) { A._clashLblDrawErrLogged = true;
            console.warn('§CLASH_LABELS_ERR draw: ' + eCLd.message + ' — labels skipped, frames continue'); }
        }
      });
    }
    // §MEASURE_BOX (§38.1a, §40.1) — every Measure beat above posted into the queue instead of
    // hanging a roaming plate off its subject; ONE fixed panel draws them, and draws NOTHING when
    // nothing posted. After the beats (so the queue is complete), before the HUD furniture.
    // §ESCAPE_PANEL_SLOT — ONE SLOT, ONE OCCUPANT. red1: "And the old opposing HUD is replaced."
    // While the Escape Route card holds this corner (its window plus its linger) the Measure box
    // does not draw there at all — the same rotating-occupant model the bigStats slot already uses
    // for the pie, the tail cards and the storey card. This is a REPLACEMENT, not a coexistence:
    // two panels in one corner is the crowding the move exists to end.
    // The Measure box takes the slot back by simply drawing again once escCardInfo is null. Whether
    // it SHOULD come back during the closing orbit is red1's call; with §SLAB_LABEL_STALE in place
    // the slab label has already stood down by then, so in practice the corner stays clear.
    if (A.filmBoxesDrawMeasure && !escCardInfo) {
      _drawUnlessHold('measure.box', function () {
        try { A.filmBoxesDrawMeasure(ctx, w, h, null, _fcFilmSec); }
        catch (eMB) { if (!A._measureBoxWarned) { A._measureBoxWarned = true; console.warn('§MEASURE_BOX draw failed: ' + (eMB && eMB.message)); } }
      }, function () { return A.filmBoxesMeasureLastBox; });   // §129.55 C
    }
    // §STATUS_BOX (§38.1b, §40.1) — REPLACES the centred lower-third caption plate for the bake.
    // A.roomTitleCompositeOntoCanvas is untouched and still serves the live editor preview and its
    // six witnesses; only the exported frame stops using it, because that plate sized itself to its
    // own text and re-centred every frame — the "status that flickers around" the user named.
    // §129.8 item 4b — SUPERSEDES §129.6 item 8's old "status box stays, frozen" exemption ("during
    // the freeze, completely remove any HUD"): the status box now fades with everything else.
    if (A.filmBoxesDrawStatus) {
      _drawUnlessHold('hud.status', function () {
        try { A.filmBoxesDrawStatus(ctx, w, h, A.filmBoxesStatusRows(statusSrc)); }
        catch (eSB) { if (!A._statusBoxWarned) { A._statusBoxWarned = true; console.warn('§STATUS_BOX draw failed: ' + (eSB && eSB.message)); } }
      }, function () { return A.filmBoxesStatusLastBox; });   // §129.55 C
    } else if (titleInfo && titleInfo.opacity > 0 && A.roomTitleCompositeOntoCanvas) {
      _drawUnlessHold('roomtitle.fallback', function () { A.roomTitleCompositeOntoCanvas(ctx, w, h, titleInfo.name, titleInfo.opacity); });
    }
    // §HUD_ROW — the day counter used to draw here, alone, before the column below it was even
    // measured. It is now the first member of the top ROW assembled further down, so its width
    // is known to the boxes beside it. Nothing else moved.
    // §SUN_COMPASS (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §7) — the "N" and the day-of-
    // year ride the ROSE in world space; the sun-angle readout is a fixed bottom-left pill.
    // ⚠ Read off A.sunCompassInfo() rather than taken as a 9th parameter, for the reason the
    // §FLYTHRU_DATUM note above gives: _captureFrame is its own function, not a closure over the
    // bake body. The bake loop already called A.sunCompassAt(_bkMs) for THIS frame, so the state
    // it reads is this frame's, not a neighbour's. Same never-kills-a-bake contract.
    // §CPE_PATH_OVERVIEW — drawn LAST so its backdrop-blur samples the finished frame and never
    // smears the caption or the counter into its own glass. `ovInfo.pose` is the REAL pose this
    // frame was rendered with, captured by the caller immediately before this call.
    // §CPE_RESOURCE_PANEL — drawn between the counter and the overview, one column, one corner.
    // Same never-kills-a-bake contract as the box below it.
    // §CPE_HUD_ORDER (2026-08-30, user after seeing a real baked frame): counter -> PATH BOX -> pie.
    // The path box answers "where am I", which a viewer tracks continuously, so it sits directly
    // under the clock; the pie is a readout you consult rather than follow, so it goes below.
    // ONE running offset builds the column so the three can never overlap or leave a gap.
    // ══ §HUD_ROW (2026-09-19) — ONE TOP ROW, then everything else below it ══════════════════
    // red1, after a 1080p frame: "align the clock, data, day counter in a single row ... put the
    // cam path map same row too? in that way it will always have room for its 4D5D HUD below it".
    //
    // WHAT WAS WRONG: these four were ONE VERTICAL COLUMN (counter -> clock -> readout -> path
    // map -> pie -> storey card). At 1920x1080 the column ran past the frame: measured on the
    // delivered film, the path map's plate cut straight through the storey card's top row and the
    // pie panel sat on what was left. Taller frames made it worse, not better, because every box
    // is a fraction of frame HEIGHT and the column is their SUM — the one arrangement that cannot
    // buy room by baking bigger.
    //
    // WHAT IT IS NOW: the four read-at-a-glance boxes run ACROSS the top in one row, and the
    // column below starts under the tallest of them. The row spends width, which a 16:9 frame has
    // in surplus, instead of height, which it does not.
    //
    // ORDER, from the anchored corner inward: day counter (the headline figure, so it keeps the
    // corner it has always had), clock, sun readout, path map (widest, so it trails). `_rowX` is
    // the running X offset each box is pushed inward by — the exact X twin of the `_stackY` this
    // code already used, and each overlay applies it against its OWN corner, so a left-hand corner
    // preference still builds the row left-to-right without a second code path.
    //
    // WIDTHS COME FROM THE DRAWERS, NOT FROM A SECOND OPINION HERE. Each compositor publishes the
    // rect it actually painted (A.dayCounterLastBox and friends) because two of these four size
    // themselves by MEASURING TEXT, which the caller cannot do without measuring it twice and
    // drifting. Same "one owner of that arithmetic" rule as dayCounterBoxSize.
    var _gapY = Math.round(h * 0.012);
    var _gapX = Math.round(h * 0.014);
    var _rowX = 0, _rowH = 0;
    // Cleared every frame: a compositor that draws nothing (faded out mid-hold, or switched off)
    // returns early and leaves its LastBox untouched, and a STALE rect would reserve row width for
    // a box that is not on screen. Absent must read as absent.
    A.dayCounterLastBox = A.sunClockLastBox = A.sunReadoutLastBox = A.pathOverviewLastBox = null;
    var _rowPos = (dayInfo && dayInfo.pos) || 'tr';
    function _rowAdvance(box) {
      if (!box || !(box.w > 0)) return;          // drew nothing — reserve nothing
      _rowX += box.w + _gapX;
      if (box.h > _rowH) _rowH = box.h;
    }

    // ORDER ALONG THE ROW, from the anchored corner inward (red1, 2026-09-19: "I meant the cam
    // path map to be edge most not centred so it's aligned to the pie 4D5D HUD as was before. It's
    // the new compass clock stuff that is added on top to centre"):
    //     [edge] path map -> day counter -> clock -> sun readout [toward centre]
    // The path map keeps the corner it has always had, so it and the pie panel beneath it share one
    // right edge exactly as they did when they were a column. Everything ADDED since — the counter
    // and the two sun boxes — grows inward from it, so the newest overlays are the ones that move.
    // §CPE_PATH_OVERVIEW — EDGE-MOST, so it stays column-aligned with the pie panel below it. Drawn LAST of the four so its
    // backdrop blur samples a finished frame and never smears its neighbours into its own glass.
    // §129.8 item 4b — it fades with everything else during the hold ("no path map/compass ... no
    // pie panel"), same `_drawUnlessHold` mechanism; `a` is passed as its own opacity param for the
    // absolute-assignment reason above.
    if (ovInfo && ovInfo.ov && A.pathOverviewCompositeOntoCanvas) {
      _drawUnlessHold('hud.pathmap', function (a) {
        try {
          A.pathOverviewCompositeOntoCanvas(ctx, w, h, ovInfo.ov, ovInfo.pose, a, ovInfo.pos, 0, _rowX);
        } catch (eOvD) {
          if (!A._ovDrawErrLogged) { A._ovDrawErrLogged = true;
            console.warn('§CPE_PATH_OVERVIEW_ERR draw: ' + eOvD.message + ' — box skipped, frames continue'); }
        }
      }, function () { return A.pathOverviewLastBox; });   // §129.55 B — the rect _rowAdvance already reads, now also registered
      _rowAdvance(A.pathOverviewLastBox);
    }
    if (dayInfo && dayInfo.pos !== 'off' && A.dayCounterCompositeOntoCanvas) {
      // ROUND 13 item C — `a` passed as dayCounter's own `opacity` param (its `ctx.globalAlpha = op`
      // is an absolute assignment from that param, was clobbering the ambient hold-fade alpha).
      _drawUnlessHold('daycounter', function (a) {
        A.dayCounterCompositeOntoCanvas(ctx, w, h, dayInfo, a, dayInfo.pos, _rowX);
      }, function () { return A.dayCounterLastBox; });   // §129.55 B
      _rowAdvance(A.dayCounterLastBox);
    }
    // §SUN_CLOCK — the analogue face for the hour this frame is lit at. It keeps the day counter's
    // corner (§CPE_HUD_STACK: one preference for the whole group, not a corner per overlay) and now
    // sits BESIDE the counter rather than under it. Wrapped in _drawUnlessHold like every other HUD
    // box, so the §129.1 load-path FREEZE clears it with the rest (red1: "Freeze removes all other
    // overlays including geo-ref"). `a` is the hold alpha, passed through as the compositor's own
    // opacity per ROUND 13 item C — a compositor that assigns globalAlpha absolutely would
    // otherwise clobber the ambient fade set by the wrapper.
    if (A._sunCompassOn && A.sunClockCompositeOntoCanvas && A.sunCompassInfo) {
      _hudHold('suncompass.clock', function (a) {
        try {
          A.sunClockCompositeOntoCanvas(ctx, w, h, A.sunCompassInfo(), a, _rowPos, 0, _rowX);
        } catch (eClk) { if (!A._sunClockWarned) { A._sunClockWarned = true;
          console.warn('§SUN_CLOCK_DRAW failed: ' + (eClk && eClk.message)); } }
      }, function () { return A.sunClockLastBox; });   // §129.55 B
      _rowAdvance(A.sunClockLastBox);
    }
    // §SUN_COMPASS readout — date / sun angles / facade, next along the row (red1: "same line as
    // the Day counter? Clock, the azimuth thing, and the 4D day counter"). It was bottom-left and
    // was drawing underneath the loadpath session's own room box there.
    if (A._sunCompassOn && A.sunCompassCompositeOntoCanvas && A.sunCompassInfo) {
      _hudHold('suncompass.readout', function (a) {
        try {
          A.sunCompassCompositeOntoCanvas(ctx, w, h, A.sunCompassInfo(), a, _rowPos, 0, _rowX);
        } catch (eSCd) { if (!A._sunCompassDrawWarned) { A._sunCompassDrawWarned = true;
          console.warn('§SUN_COMPASS_DRAW failed: ' + (eSCd && eSCd.message)); } }
      }, function () { return A.sunReadoutLastBox; });   // §129.55 B
      _rowAdvance(A.sunReadoutLastBox);
    }
    // Everything below the row — the pie panel, the storey card — starts under the TALLEST member,
    // not under a sum. An empty row (all four off) leaves _rowH at 0 and the column starts at the
    // margin exactly as it did before any of this existed.
    var _stackY = _rowH ? _rowH + _gapY : 0;
    // §129.52 — cleared each frame for the same reason the row boxes are: a panel that draws
    // nothing this frame must reserve nothing, and a stale rect would push the card below it down
    // past a panel that is not on screen.
    A.resourcePanelLastBox = null;
    A.bigStatsLastBox = null;
    // ══ §HUD_STACK_ORDER (2026-09-21) — THE FIXED-HEIGHT CARD GOES FIRST ════════════════════════
    // red1: "the 2nd HUD is obscured by the first. Since the 1st HUD is dynamic height depending on
    // Resource pax working on site, i suggest it be swapped with the 2nd HUD so it does not cover
    // when taller in height."
    // He is right, and for a reason the old order could not fix by measuring harder: the resource
    // panel's height is a function of the CREW ON SITE that day, so it changes frame to frame. Put
    // it first and every frame has to get the advance exactly right or it covers its neighbour; put
    // it LAST and it grows into empty space, where being wrong costs nothing. A variable-height
    // panel should never have a neighbour below it.
    // §129.52's advance stays — it is still needed, it is just no longer load-bearing.
    //
    // ⚠ NO boxFn IS PASSED HERE, AND THAT IS DELIBERATE. `_drawUnlessHold(name, fn, boxFn)` can
    // register a real rect, but these two drawers already register their own under `resource-panel`
    // and `stats-panel` — witness_hud_layout_coverage.js:124 exempts `hud.pie`/`roster` for exactly
    // that reason, and says a second registration would be "the same rect twice — a permanent false
    // FAIL". I tried adding one and the witness's own comment is what caught it.
    if (statInfo && statInfo.shown && A.bigStatsCompositeOntoCanvas) {
      _drawUnlessHold('roster', function (a) {
        // §CPE_PIE_HOLD — statInfo.held is the composition the pie holds beside the card.
        try { A.bigStatsCompositeOntoCanvas(ctx, w, h, statInfo.shown, a, statInfo.pos, _stackY, statInfo.held); }
        catch (eBs) {
          if (!A._bsDrawErrLogged) { A._bsDrawErrLogged = true;
            console.warn('§CPE_BIG_STATS_ERR draw: ' + eBs.message + ' — card skipped, frames continue'); }
        }
      });
    }
    if (A.bigStatsLastBox && A.bigStatsLastBox.h > 0) {
      _stackY += A.bigStatsLastBox.h + _gapY;
    }
    if (resInfo && resInfo.info && A.resourcePanelCompositeOntoCanvas) {
      _drawUnlessHold('hud.pie', function (a) {
        try { A.resourcePanelCompositeOntoCanvas(ctx, w, h, resInfo.info, a, resInfo.pos, _stackY); }
        catch (eRp) {
          if (!A._resDrawErrLogged) { A._resDrawErrLogged = true;
            console.warn('§CPE_RESOURCE_PANEL_ERR draw: ' + eRp.message + ' — panel skipped, frames continue'); }
        }
      });
    }
    if (A.resourcePanelLastBox && A.resourcePanelLastBox.h > 0) {
      _stackY += A.resourcePanelLastBox.h + _gapY;
    }
    if (escCardInfo && escCardInfo.shown && A.bigStatsCompositeOntoCanvas) {
      _drawUnlessHold('escroute.card', function (a) {
        try { A.bigStatsCompositeOntoCanvas(ctx, w, h, escCardInfo.shown, a, escCardInfo.pos, 0, null); }
        catch (eEc) {
          if (!A._escCardDrawErrLogged) { A._escCardDrawErrLogged = true;
            console.warn('§ESCAPE_CARD_ERR draw: ' + eEc.message + ' — card skipped, frames continue'); }
        }
      }, function () { return A.bigStatsLastBox; });
    }
    // §129.55 D/E — `roster` deliberately keeps its 0,0,1,1 placeholder, for the SAME reason
    // `hud.pie` does: the card's real rect is already in the registry, registered by the drawer
    // itself as `stats-panel` (cpe_resource_panel.js, beside its own `_plate` call) so its held pie
    // can declare it as parent. Giving this wrapper a `boxFn` too would put the IDENTICAL rect in
    // the registry under a second name — a rect overlapping itself, a permanent false FAIL.
    // §HUD FIX — load path/ledger composite draw LAST, so the label ladder's own column-placement
    // can read every OTHER HUD rect (status box, resource panel, pie.cost/ledger, roster) already
    // registered this frame and avoid them (item 5's own "avoid every registered HUD rect").
    // ROUND 16 item 2 — `_inLoadPathComposite` is true for the WHOLE call: load path is the one
    // overlay that keeps drawing unwrapped through the hold BY DESIGN (never `_drawUnlessHold`), so
    // its own draws must never count toward `unwrappedDraws`.
    if (A.loadPathCompositeOntoCanvas) {
      A._inLoadPathComposite = true;
      try { A.loadPathCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
      catch (eLPC) { if (!A._loadPathDrawWarned) { A._loadPathDrawWarned = true; console.warn('§LOADPATH_DRAW_ERR ' + (eLPC && eLPC.message)); } }
      A._inLoadPathComposite = false;
    }
    if (A.ledgerTickerCompositeOntoCanvas) {
      try { A.ledgerTickerCompositeOntoCanvas(ctx, w, h, _fcFilmSec); }
      catch (eLTC) { if (!A._ledgerTickerDrawWarned) { A._ledgerTickerDrawWarned = true; console.warn('§LEDGER_TICKER_DRAW_ERR ' + (eLTC && eLTC.message)); } }
    }
    // §129.6 items 4/8 — once per hold (the SAME mid-hold frame cpe_load_path.js's own
    // _visibleWitness/_framingWitness fire on, via A._loadPathMidHoldThisFrame), print §HUD_LAYOUT
    // and §LOADPATH_FOCUS from the registry every drawer above just finished populating THIS frame.
    // Finding 1 broadened fix (2026-09-16) — the ARM-frame §HUD_LAYOUT_ARM sample: fires once, on the
    // same frame cpe_load_path.js's own loadPathApplyVisual just armed the hold (A._loadPathHudAlpha
    // is still 1 there — the fade hasn't started — so the resource panel legitimately draws and
    // registers real pie.cost/pie.ledger/roster/pie.band rects THIS frame, unlike the mid-hold sample
    // below where §129.8 item 4b's FOCUS fade has taken it to nothing).
    if (A._loadPathArmFrameThisFrame) {
      A._loadPathArmFrameThisFrame = false;
      if (A._hudLayoutWitness) A._hudLayoutWitness(h, '§HUD_LAYOUT_ARM');
    }
    if (A._loadPathMidHoldThisFrame) {
      A._loadPathMidHoldThisFrame = false;
      if (A._hudLayoutWitness) A._hudLayoutWitness(h);   // ROUND 13 item D — h needed for the rowFontPx formula check
      if (A._hudLayoutFocusWitness) A._hudLayoutFocusWitness();
    }
    // ROUND 16 item 2 — uninstall the instrumentation for this frame (installed right after the
    // base scene render, above), regardless of whether the FOCUS witness actually fired this frame
    // (it only fires once per hold, at the mid-hold moment) — never leak the wrapper into the next
    // frame's ctx methods.
    if (_lpInstrumentedThisFrame) _lpUninstallDrawInstrument();
    // §129.7 item 8c — §HUD_LAYOUT_STABLE sampling: EVERY frame, never gated on the load-path hold
    // (the resource panel is up through the whole buildup) — see _hudLayoutStableSampleImpl above.
    _hudLayoutStableSampleImpl(h);
    // §129 FIX 6 (2026-09-17) — REAL root cause of the earlier "PRE_HUD" sample always reading
    // black/correct while the actual encoded frame still showed full HUD: that sample ran right
    // after the 3D scene composited, BEFORE any `_drawUnlessHold` HUD call below it in this SAME
    // function had run — it could never have caught a HUD clobber even in principle, only ever
    // proved the 3D scene layer. THIS sample runs here, at the true end of compositing, on the SAME
    // canvas `c` that `toBlob` is about to encode — the only point that can prove what the shipped
    // frame actually contains.
    // §129 FIX 8 (2026-09-17) — red1: "silhouette building openings and sky/ground seems to not
    // return" post-release. Extended this same true-end-of-compositing sample to ALSO fire for a
    // short window AFTER release (tracked via `A._loadPathRestoreCount`, incremented once at the
    // exact release frame), not just during the hold — the earlier version could only ever prove the
    // FADE-IN side, never whether the fade-OUT (release) genuinely completes. Also logs `A._sky`'s
    // own live `.visible` directly, since that's a binary hide/show this beat owns, separate from
    // the backdrop's own continuous opacity fade for ordinary materials.
    if (A._loadPathHoldFrameActive) {
      A._lp129PostReleaseFrameCount = null;   // still held — no post-release window open yet
    } else if (A._loadPathRestoreCount > 0) {
      A._lp129PostReleaseFrameCount = (A._lp129PostReleaseFrameCount == null) ? 0 : A._lp129PostReleaseFrameCount + 1;
    }
    if (A._loadPathHoldFrameActive || (A._lp129PostReleaseFrameCount != null && A._lp129PostReleaseFrameCount <= 15)) {
      try {
        var _pxPts2 = [[0.30, 0.55], [0.45, 0.65], [0.60, 0.45], [0.20, 0.75], [0.70, 0.70],
          [0.53, 0.87], [0.62, 0.92], [0.05, 0.42], [0.10, 0.50], [0.85, 0.60], [0.784, 0.77],
          [0.913, 0.031], [0.95, 0.08], [0.80, 0.15], [0.41, 0.21], [0.35, 0.12]];
        var _pxOut2 = [];
        for (var _pp2 = 0; _pp2 < _pxPts2.length; _pp2++) {
          var _px2 = Math.round(_pxPts2[_pp2][0] * w), _py2 = Math.round(_pxPts2[_pp2][1] * h);
          var _d2 = ctx.getImageData(_px2, _py2, 1, 1).data;
          _pxOut2.push(_px2 + ',' + _py2 + '=' + _d2[0] + ',' + _d2[1] + ',' + _d2[2]);
        }
        console.log('§LOADPATH_PIXEL_DIAG_FINAL hold=' + !!A._loadPathHoldFrameActive + ' postRelFrame=' + (A._lp129PostReleaseFrameCount == null ? 'n/a' : A._lp129PostReleaseFrameCount) +
          ' hudAlpha=' + (A._loadPathHudAlpha == null ? 'n/a' : A._loadPathHudAlpha.toFixed(3)) +
          ' skyVisible=' + (A._sky ? A._sky.visible : 'no-sky') + ' ' + _pxOut2.join(' '));
        // §129.12 — the pixel readback above proves the black patch persists post-release, but not
        // WHAT object is there (that's what `r71` left unresolved). Raycast the SAME points, at a
        // few frames spread across the post-release window (the camera has resumed moving by now,
        // unlike the frozen-arm-camera mid-hold raycast, so each of these is its own real sample,
        // not a repeat) — cheap, diagnostic-only, matches the proven mid-hold identification pattern.
        if (A._lp129PostReleaseFrameCount != null && A._loadPathDiagRaycast &&
            (A._lp129PostReleaseFrameCount === 1 || A._lp129PostReleaseFrameCount === 5 ||
             A._lp129PostReleaseFrameCount === 11)) {
          var _ndcPts2 = _pxPts2.map(function (fp) { return [fp[0] * 2 - 1, 1 - fp[1] * 2]; });
          A._loadPathDiagRaycast(_ndcPts2, 'postRelFrame=' + A._lp129PostReleaseFrameCount);
        }
      } catch (ePxD2) { console.warn('§LOADPATH_PIXEL_DIAG_FINAL_ERR ' + (ePxD2 && ePxD2.message)); }
    }
    // §ESCAPE_ROUTE_HUD_RESERVE — the column's real bottom THIS frame, stashed for the next
    // frame's plate placement. Measured here because this is the only place that knows it: the sun
    // clock and the compass readout return their own drawn heights and nothing else can predict
    // them. One frame stale by construction (placement runs just before this capture), which moves
    // a plate by whatever the column grew in 1/24 s — in practice zero, since these boxes are fixed
    // furniture. The first frame has no measurement and falls back to reserving the whole column.
    A._hudStackBottom = _stackY + (statInfo && statInfo.shown ? Math.round(h * 0.24) : 0);
    // §129.61 MERGE — their unconditional bigStats draw was DROPPED here, not kept: ours already
    // draws the same card through _drawUnlessHold('roster', ...) above, which is hold-aware and
    // registers `stats-panel` for §HUD_LAYOUT (§129.55). Keeping both would have composited the
    // card TWICE per frame. Their A._hudStackBottom stash just above IS kept — it is the new thing.
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

      var usPerFrame = 1e6 / fps, gop = Math.max(1, Math.round(fps * 2));
      for (var i = 0; i < framesDone; i++) {
        // §129 FIX 7 (2026-09-17) — every prior stage (live capture-time readback, IDB storage,
        // THIS SAME stitch loop's own readback right after createImageBitmap) proved the correct,
        // per-frame-distinct pixel data reaches this point — yet the final decoded MP4 still showed
        // stale/wrong content on frames well past the first. A FRESH canvas per iteration (was one
        // canvas object REUSED across all `framesDone` VideoFrame constructions) rules out a known
        // class of WebCodecs/hardware-encoder issue where reusing the same canvas/GPU-texture source
        // object across encode() calls can let the encoder treat it as "unchanged" and skip a real
        // texture re-upload — cheap insurance, no logic changed, only the object identity per frame.
        var cv = document.createElement('canvas');
        cv.width = ew; cv.height = eh;
        var cx = cv.getContext('2d');
        var bmp = await createImageBitmap(await _idbGet(db, i));
        cx.drawImage(bmp, 0, 0);
        bmp.close();
        // §129 FIX 7 (2026-09-17) — isolating whether the discrepancy (encoded output still showing
        // full HUD on frames the live capture-time diagnostic confirmed suppressed) is a CAPTURE bug
        // or a STITCH/encode bug: read back the SAME diagnostic pixel from what was ACTUALLY PULLED
        // OUT OF IDB right here, at the exact point it gets handed to the encoder — the one spot nol
        // further transform (beyond H.264 encoding itself) can explain a difference from this point on.
        if (i >= 20 && i <= 82 && window.__lpDebugStitchPixels) {
          try {
            var _sd = cx.getImageData(Math.round(0.784 * ew), Math.round(0.77 * eh), 1, 1).data;
            console.log('§STITCH_PIXEL_DIAG i=' + i + ' 784x770frac=' + _sd[0] + ',' + _sd[1] + ',' + _sd[2]);
          } catch (eSD) {}
        }
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
      var _dlName = 'BIM_MaxQ_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.mp4';
      // §CLI_SILENT_BAKE item 3 — the a.click() below is INERT headless. When a scripted runner
      // installed __maxqDeliverBlob, hand it the finished bytes so node writes + asserts the file.
      if (typeof window.__maxqDeliverBlob === 'function') {
        try {
          await window.__maxqDeliverBlob(blob, _dlName, 'video/mp4');
          window.__maxqDeliveredBytes = blob.size;
          console.log('§MAXQ_DELIVERED bytes=' + blob.size + ' name=' + _dlName);
        } catch (eDl) { console.warn('§MAXQ_DELIVER_FAIL ' + eDl.message); }
      } else {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = _dlName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
      }
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
    var _dlName = 'BIM_MaxQ_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.webm';
    // §CLI_SILENT_BAKE item 3 — same delivery seam as _stitchMp4: the fallback container must be
    // capturable headlessly too (§MAXQ_MP4_FALLBACK is expected there, not a blocker).
    if (typeof window.__maxqDeliverBlob === 'function') {
      try {
        await window.__maxqDeliverBlob(blob, _dlName, mime);
        window.__maxqDeliveredBytes = blob.size;
        console.log('§MAXQ_DELIVERED bytes=' + blob.size + ' name=' + _dlName);
      } catch (eDl2) { console.warn('§MAXQ_DELIVER_FAIL ' + eDl2.message); }
    } else {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = _dlName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
    }
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
    // §DATUM_DECOUPLE (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §53) — bisect-only mode. When set,
    // _captureFrame skips its own GPU render and every OTHER 2D overlay (already baked into the source
    // clip) and draws only the datum layer on top of a pre-extracted clean frame. Reset every run so a
    // stale flag from a prior burn-in bake can never leak into a normal one.
    A._burninDatumDir = opts.burninDatumDir || null;
    if (A._burninDatumDir) console.log('§DATUM_DECOUPLE dir=' + A._burninDatumDir + ' — skipping GPU render + every non-datum overlay this run');
    _active = true; _cancel = false;
    // §MAXQ_HIDDEN_PAUSE / §MAXQ_QUALITY counters are per-RUN, not per-session — a second bake must
    // not inherit the first one's pauses or its unconverged count and report someone else's health.
    _hiddenMsTotal = 0; _hiddenPauses = 0; _unconverged = 0;
    A._maxqActive = true;   // mirror for the cinema icon's busy/done check (panels.js)
    // §MAXQ_FRAME_BUDGET — the bake's still fold, cheaper than Alt+S's. Cleared on every exit path
    // below (_bakeBudgetRelease), so a still after a bake is never quietly degraded.
    // LARGE_DB_BAKE.md §2 L3 — the delivery budget (8/12) is the single biggest wall-time knob on a
    // large building (~1.7s of every LTU/Hospital frame is these re-renders) but was not reachable
    // from the CLI. opts.stillBudget (cli_silent_bake.js's --still-budget taa,ao) overrides it for a
    // quick-check bake; no flag on the CLI is byte-identical to before this change.
    var _sb = (opts.stillBudget && opts.stillBudget.taa != null && opts.stillBudget.ao != null)
      ? opts.stillBudget : MAXQ_STILL_BUDGET;
    A._stillBudget = { taa: _sb.taa, ao: _sb.ao };
    console.log('§MAXQ_FRAME_BUDGET taa=' + A._stillBudget.taa + ' ao=' + A._stillBudget.ao +
      ' renders/frame=' + (A._stillBudget.taa + A._stillBudget.ao) + ' (was 16+24=40) — bake only,' +
      ' Alt+S stills keep the full fold' + (_sb !== MAXQ_STILL_BUDGET ? ' (CLI override)' : ''));
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
      _wakeRelease(); _dampRelease(); _bakeBudgetRelease();
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
    var _clip = null, _buildup = false, _bkState = null, _roomTitle = false, _titleSegs = null, _reveal = false;
    var _loadPath = false;   // §129.1 LOAD PATH — geological-section beat held at topout
    var _ledger = false;     // §129.2 LEDGER TICKER — kernel-ops verification HUD during the buildup
    var _costOdo = false;    // §129.5 COST ODOMETER — running cost/hours figure beside the resource chart
    // §129.6 item 1 — CLOCK FREEZE state. 0/-1 = no hold this bake (byte-identical to pre-fix
    // behaviour). Set once, right after A.loadPathBuild, from A._loadPathWindow.
    var _lpNFramesOriginal = 0, _lpArmTn = null, _lpFramesInserted = 0, _lpHoldFrameStart = -1;
    var _lpArmFrameTn = null, _lpArmTnMatch = true;   // ROUND 9 item 1 — see _lpFrameForArmTn below
    // Per-frame camera-step log for §LOADPATH_RESUME (index -> distance from the PREVIOUS frame's
    // camera position) plus the frame index at which loadPathApplyVisual's own _restore() fired
    // (the "release"/first-resumed frame) — tracked every frame regardless of __lpNoClockFreeze, so
    // the witness works whether the fix is active or the control is reproducing the old bug.
    var _lpCamSteps = [], _lpPrevCamPos = null, _lpResumeAtIndex = -1, _lpPrevRestoreCount = 0;
    // LARGE_DB_BAKE.md §2 L4 — a frame-exact subset of the FULL film's own tn_i = i/(N-1) grid
    // (unlike --clip, whose n frames re-derive tn_i = i/(n-1) across [in,out] — NOT a subset of the
    // full film's own frame grid, see §0's Clip-to-frame mapping note). Lets K bakes on K ports
    // split one long film into disjoint frame ranges and concat byte-identical output.
    var _frameRange = null;   // { a, b, total } once resolved below
    var _clash = false;   // §CLASH_FILM_P1 — mesh-true clash pairs as persistent world content
    var _measure = false;      // §FLYTHRU_DATUM — Alt-C 'Measure' checkbox
    // §ESCAPE_ROUTE_REVEAL (bim-compiler prompts/ESCAPE_ROUTE_REVEAL.md) — the worst-case room's
    // real escape route, traced during the closing orbit. OFF unless asked for, so every saved
    // path re-bakes byte-identically. cpe_escape_route.js owns every decision this flag arms.
    var _escapeRoute = false;
    var _sunCompass = false;   // §SUN_COMPASS — the true-north ground rose; OFF unless requested
    // §SUN_COMPASS — the cursor handed to the rose each frame. NULL when the film has no buildup,
    // which is a real state the module handles; it is never defaulted to "now".
    var _sunCompassMs = null;
    var _sunDate = '';   // §SUN_DAY — yyyy-mm-dd to light the whole film on one day, or '' to follow
    // §CPE_PATH_OVERVIEW — prepared ONCE (the box is static by design, the user's own word), then
    // only the camera head is projected per frame. Rides the Label ON checkbox: the user's ruling
    // was "It is user's choice as its the Label ON option", so it needs no toggle of its own.
    var _ovPath = null, _ovPos = 'tl', _resOps = null, _bigCards = null;
    // §CPE_STATS_TAIL — the Reveal 2nd round's film fraction, read off the plan's own topout.
    var _revealU = null;
    var _dayPos = 'tr';
    function _tFilm(tNorm) { return _clip ? _clip.in + tNorm * (_clip.out - _clip.in) : tNorm; }
    // ROUND 9 item 1 (2026-09-16, real Terminal r8diag bake) — map a WHOLE-FILM `armTn` to the
    // frame index through the EXACT SAME grid the frame loop itself steps `_tn`/`_tnFilm` through
    // (below, near `_frameRange`/`_lpFramesInserted`) — never a bare `armTn*(N-1)`, which silently
    // assumed the clip's clip-local tn (`i/(n-1)`) WAS the whole-film tn. Proven wrong on Terminal
    // (--clip 0.1508:0.2032, 44 frames): armTn=0.1851 -> old formula round(0.1851*43)=8, whose own
    // tFilm is 0.1508+0.0524*8/43=0.160549 (exactly the wrong §LOADPATH_RESUME tFilmArm logged) —
    // the correct frame is round((0.1851-0.1508)/0.0524*43)=28. `nOrig` is the CLIP's/this run's own
    // frame count (`_lpNFramesOriginal`, captured before the hold's frames are spliced in).
    function _lpFrameForArmTn(armTn, nOrig) {
      var n1 = Math.max(1, nOrig - 1), frame, step, armFrameTn;
      if (_frameRange) {
        // Loop grid: _tn = (_frameRange.a + i) / (_frameRange.total - 1) — already whole-film.
        var fr1 = Math.max(1, _frameRange.total - 1);
        frame = Math.round(armTn * fr1 - _frameRange.a);
        step = 1 / fr1;
      } else if (_clip && _clip.out > _clip.in) {
        // Loop grid: _tn = i/(n-1) (clip-local), _tnFilm = _clip.in + _tn*(_clip.out-_clip.in).
        frame = Math.round((armTn - _clip.in) / (_clip.out - _clip.in) * n1);
        step = (_clip.out - _clip.in) / n1;
      } else {
        // Loop grid: _tn = i/(n-1), whole film, no clip/frame-range remap.
        frame = Math.round(armTn * n1);
        step = 1 / n1;
      }
      frame = Math.max(0, Math.min(nOrig - 1, frame));
      armFrameTn = _frameRange ? (_frameRange.a + frame) / Math.max(1, _frameRange.total - 1)
        : _clip ? (_clip.in + (frame / n1) * (_clip.out - _clip.in))
        : (frame / n1);
      return { frame: frame, armFrameTn: armFrameTn, step: step };
    }
    // §129.27 (2026-09-18, red1, re-stated after §129.18 drifted off it: "the HUD and overlays
    // fades off in a sec [after cut-in]... not same as the background... that needs to cut out" /
    // "the fade in by HUD happens before the freeze cuts back... within the last sec of the freeze
    // duration... don't fade them back after the cut, before") — HUD is the ONLY thing that still
    // eases; backdrop and the section-cut/whiten are both an INSTANT step now (§129.24/§129.27,
    // cpe_load_path.js), so HUD no longer shares a timing formula with them (that sharing, §129.18,
    // is exactly what desynced this: it made HUD start its return AT release, same as the OLD
    // ramping backdrop — but backdrop doesn't ramp any more, so HUD kept fading in AFTER an already-
    // instant cut, backwards from what red1 asked for). `_hudFadeT` below ramps OUT over the FIRST
    // `fadeSec` of `elapsed` (unchanged — arm side was always agreed correct) and back IN over the
    // LAST `fadeSec` of the hold's own known total `durSec` — front-loaded, so alpha is already 1
    // exactly AT the release instant, before the building's own instant cut, never after it.
    var HUD_FADE_SEC = 1.0;   // §129.16 (2026-09-18, red1: "same with the fade back in, a full sec")
    // ROUND 12 item 2 — the real hold's own durSec, snapshotted every hold frame (see the main
    // loop's own A._loadPathHudAlpha computation) so the END-OF-BAKE witness below can still read it
    // after A.loadPathDispose() has already nulled the live A._loadPathWindow.
    var _lpLastHoldDurSec = null;
    // ROUND 13 item C (2026-09-16, real HHS bake sighting: `§LOADPATH_HUD_FADE fadeOutFrames=5
    // alphaMid=0` / `§LOADPATH_FOCUS painted=0 hudAlpha=0.00` printed while the HUD was plainly on
    // screen through the freeze) — the analytic witness below asserted a property of the FORMULA
    // that drives `A._loadPathHudAlpha`, never the alpha actually used at the compositor calls that
    // put each HUD layer into the encoded frame (several of those — resourcePanel/bigStats/
    // dayCounter/pathOverview — take their OWN `opacity` parameter and set `ctx.globalAlpha`
    // straight from it, which silently overrode whatever ambient alpha `_drawUnlessHold` had set
    // before calling them; the call sites were passing a hardcoded `1`, never the real fade value).
    // `_lpMidHoldCompositeAlpha` snapshots the REAL per-layer alpha `_drawUnlessHold` recorded
    // (`A._hudCompositeAlphaSample`, fresh every frame) at whichever frame lands CLOSEST to the
    // hold's own middle (never a re-derived "is this the middle" guess — tracked by comparing
    // |elapsedSec - durSec/2| against the best seen so far, every hold frame).
    var _lpMidHoldCompositeAlpha = null, _lpMidHoldBestDistSec = Infinity;
    // §129.27 — pure, own-copy formula again (the §129.18 "share A._loadPathFadeT with backdrop"
    // idea is retired for HUD specifically — backdrop/cut no longer ramp at all, so there is nothing
    // left to share). `durSec` (the hold's own known total length, fixed since BUILD) drives the
    // release-side window instead of a detected `releaseFSec` — front-loading REQUIRES knowing the
    // release point in advance, which `durSec` gives for free and a live `fSec` does not.
    function _hudFadeT(elapsed, inWindow, durSec, fadeSec) {
      if (!(fadeSec > 0)) return inWindow ? 1 : 0;
      if (!inWindow || elapsed == null) return 0;   // outside the hold entirely — nothing suppressed
      var tArm = Math.max(0, Math.min(1, elapsed / fadeSec));                // ramps 0->1 over the FIRST fadeSec
      var tRelease = Math.max(0, Math.min(1, (durSec - elapsed) / fadeSec)); // ramps 1->0 over the LAST fadeSec
      return Math.min(tArm, tRelease);   // whichever edge is currently binding; degrades gracefully if durSec < 2*fadeSec
    }
    // ROUND 13 item C (2026-09-16) — SUPERSEDES the old purely-analytic witness ("a witness that
    // reads a flag instead of the composite is not a witness of the frame", per the real HHS
    // sighting: `alphaMid=0`/`painted=0` printed while the HUD was plainly on screen). `alphaMid`
    // and `compositeAlpha=[…]` come from `_lpMidHoldCompositeAlpha` — the REAL per-layer alpha
    // `_drawUnlessHold` applied at whatever compositor call actually put each HUD layer into the
    // encoded frame, sampled at the hold's own middle frame — never re-derived from the formula
    // alone. `window.__lpHudNoFade=1` (hard cut) must read `fadeOutFrames=0 => FAIL`; `window.
    // __lpNoFocusHold=1` (forces alpha=1 always) must now ALSO fail via `compositeAlpha` reading
    // non-zero at mid-hold, never just via §LOADPATH_FOCUS's own separate check.
    function _hudFadeWitnessPrint() {
      // ROUND 12 item 2 — read the SNAPSHOT (taken every hold frame, before dispose could clear the
      // live A._loadPathWindow), never A._loadPathWindow itself at this point in the bake.
      var durSec = _lpLastHoldDurSec;
      if (!(durSec > 0)) return;   // no hold this bake — nothing to witness
      var noFade = !!window.__lpHudNoFade;
      var fadeSecNow = A._loadPathFadeSecFor ? A._loadPathFadeSecFor(durSec) : HUD_FADE_SEC;
      var fadeOutFrames = noFade ? 0 : Math.max(1, Math.round(fadeSecNow * fps));
      var fadeInFrames = fadeOutFrames;
      // §129.27 — front-loaded release: `alphaAtRelease` must be back to `1` (fully visible) AT
      // `elapsed===durSec` now, the OPPOSITE of §129.18's "0 at release" expectation, because the
      // fade-in is required to finish BEFORE the cut, not start at it. `alphaJustBeforeFadeIn`
      // (evaluated at the fade-in window's own start, `durSec - fadeSecNow`) proves the HUD is still
      // genuinely suppressed right up until that window opens — not fading early. `alphaMidFadeIn`
      // (the window's own midpoint) proves this is a real ramp, not a snap disguised as one.
      var alphaAtRelease, alphaJustBeforeFadeIn, alphaMidFadeIn;
      if (noFade) {
        alphaAtRelease = 1; alphaJustBeforeFadeIn = 1; alphaMidFadeIn = 1;   // hard cut: already fully switched by release, nothing gradual to check
      } else {
        alphaAtRelease = 1 - _hudFadeT(durSec, true, durSec, fadeSecNow);
        alphaJustBeforeFadeIn = 1 - _hudFadeT(durSec - fadeSecNow, true, durSec, fadeSecNow);
        alphaMidFadeIn = 1 - _hudFadeT(durSec - fadeSecNow / 2, true, durSec, fadeSecNow);
      }
      var sample = _lpMidHoldCompositeAlpha, compositeStr, alphaMid, compositeOk;
      if (!sample) {
        // Never invent a PASS with no real sample — an absent snapshot means the mid-hold frame's
        // own composite calls were never observed (e.g. this bake never actually reached _captureFrame
        // during the hold), which is itself something to FAIL on, not paper over.
        compositeStr = 'UNSAMPLED'; alphaMid = null; compositeOk = false;
      } else {
        var names = Object.keys(sample).sort();
        alphaMid = names.length ? Math.max.apply(null, names.map(function (n) { return sample[n]; })) : 0;
        compositeOk = names.length > 0 && names.every(function (n) { return sample[n] === 0; });
        compositeStr = '[' + names.map(function (n) { return n + ':' + sample[n].toFixed(2); }).join(',') + ']';
      }
      var expectJustBefore = noFade ? 1 : 0, expectMid = noFade ? 1 : 0.5;
      var ok = fadeOutFrames > 0 && fadeInFrames > 0 && alphaAtRelease === 1 &&
        Math.abs(alphaJustBeforeFadeIn - expectJustBefore) < 1e-6 &&
        Math.abs(alphaMidFadeIn - expectMid) < 1e-6 && compositeOk;
      console.log('§LOADPATH_HUD_FADE fadeOutFrames=' + fadeOutFrames + ' alphaMid=' + (alphaMid == null ? 'n/a' : alphaMid.toFixed(2)) +
        ' fadeInFrames=' + fadeInFrames + ' alphaAtRelease=' + alphaAtRelease +
        ' alphaJustBeforeFadeIn=' + alphaJustBeforeFadeIn.toFixed(2) + ' alphaMidFadeIn=' + alphaMidFadeIn.toFixed(2) +
        ' compositeAlpha=' + compositeStr + ' => ' + (ok ? 'PASS' : 'FAIL'));
    }
    // §ESCAPE_ROUTE_REVEAL (merged 2026-09-20) — the pose lookup is SPLIT so the escape beat can
    // ease the camera in FILM time without disturbing anything that asks in tNorm. `poseAt` is
    // byte-identical to what it was: the same body, with `_tFilm` applied first.
    function poseAtFilm(tF) {
      if (plan) return plan.poseAt(tF);
      var az = az0 + tF * Math.PI * 2;
      return { x: tgt.x + radius * Math.cos(az), y: tgt.y + height, z: tgt.z + radius * Math.sin(az),
               tx: tgt.x, ty: tgt.y, tz: tgt.z };
    }
    function poseAt(tNorm) { return poseAtFilm(_tFilm(tNorm)); }

    // §57.5 (2026-09-11, user: "go ahead with that frames spacing into a jump") — smooth the
    // camera's LOOK DIRECTION across a small tNorm window around each captured frame. Does NOT
    // touch position or any beat's own duration.
    // MEASURED root cause: a beat whose own real-seconds span is shorter than one frame's tNorm
    // step (found: HHS's dive->spin handoff, an 87 deg gaze snap in a single frame —
    // out/HHS_lowres_v2_2026-09-11_poses.json frames 40->41, reproduced identically on a second,
    // independent bake) gets its whole turn skipped between the two frames straddling it.
    // poseAt's own math is continuous (Beat 1's end target and Beat 2's start target agree
    // exactly at tD — verified by hand against the source); the problem is purely that no
    // frame's own tNorm ever lands inside that beat's narrow window, so its motion never
    // appears in any exported frame at all.
    // Blending GAZE_BLEND_N samples' DIRECTION (yaw/pitch, wrap-safe — never raw target points:
    // averaging points can walk THROUGH the camera on some geometries, the exact bug
    // §CINEMA_TURN_SLERP / _cinemaGazeBlend above already found and fixed at a different seam in
    // this same file) spreads that motion across the frames whose windows overlap it, instead of
    // losing it entirely. Position is untouched — MEASURED position is already continuous
    // everywhere this was found, and blending it too would needlessly soften the carefully-paced
    // dive/walk/orbit speed tuning (§CPE_PACE_SWING and friends) for no benefit.
    // NOT a duration floor: §CPE_SETTLE_HOLD (2026-08-04) already settled that a beat with
    // nothing to turn through stays zero-length ("no hard coded" pause) — this is a sampling fix
    // at the capture step, not a timing change, and leaves every beat's own duration untouched.
    var GAZE_BLEND_N = 5;                 // odd: the frame's own exact tNorm is always one sample
    function _blendedGazeTarget(tn, pos, origDist) {
      // nFrames is read HERE, not precomputed at declaration time — it gets reassigned more than
      // once during setup (natural pacing §CPE_PACING, clip-window rescale) and this function
      // isn't actually invoked until the frame loop below, by which point nFrames already holds
      // its FINAL value. A precomputed half-width would silently use a stale/wrong one.
      // LARGE_DB_BAKE.md §2 L4 (found via §L4_PLAN_DUMP bisection, 2026-09-15): "1.5 frame-widths"
      // means 1.5 widths of a FULL-FILM frame — in --frame-range mode nFrames is this RUN's local
      // slice count (b-a), not the film's, so this blended THE WRONG WIDTH (17%-37% of the whole
      // film's tNorm range instead of ~0.17%), averaging gaze direction over a huge, run-size-
      // dependent arc instead of a tiny neighborhood. Camera POSITION (pure _tn) matched between
      // two --frame-range runs of the same global frame; only the LOOK-AT target diverged — this is
      // why. A normal/--clip bake is unaffected: _frameRange is null there, same as before.
      var gazeBlendHalf = 1.5 / Math.max(1, (_frameRange ? _frameRange.total : nFrames) - 1);   // ~1.5 frame-widths either side
      var refYaw = null, sumYaw = 0, sumPit = 0;
      for (var k = 0; k < GAZE_BLEND_N; k++) {
        var frac = (GAZE_BLEND_N === 1) ? 0 : (k / (GAZE_BLEND_N - 1) - 0.5) * 2;   // -1..1
        var t = Math.max(0, Math.min(1, tn + frac * gazeBlendHalf));
        var p = poseAt(t);
        var dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
        var yaw = Math.atan2(dz, dx), pit = Math.atan2(dy, Math.hypot(dx, dz));
        if (refYaw === null) refYaw = yaw;
        var dYawK = yaw - refYaw;
        dYawK -= 2 * Math.PI * Math.round(dYawK / (2 * Math.PI));   // shortest way — same rule _cinemaGazeBlend uses
        sumYaw += refYaw + dYawK; sumPit += pit;
      }
      var ayaw = sumYaw / GAZE_BLEND_N, apit = sumPit / GAZE_BLEND_N, cp = Math.cos(apit);
      return { tx: pos.x + Math.cos(ayaw) * origDist * cp, ty: pos.y + Math.sin(apit) * origDist, tz: pos.z + Math.sin(ayaw) * origDist * cp };
    }
    // ROUND 7 (2026-09-16, real Terminal bake: PICK's own shot-search/visibility used the RAW
    // `plan.poseAt(tn)` pose — no gaze blend — so it evaluated a camera orientation the bake never
    // actually renders; FRAMING reads the REAL, live (gaze-blended) camera and disagreed). Exposes
    // the EXACT pose the frame loop builds (`pose = poseAt(_tn); ...; pose.tx/ty/tz = blended`, line
    // ~2163) for cpe_load_path.js's own hold-point search and PICK to probe against — never a
    // second, re-derived camera model. Operates in WHOLE-FILM tn (cpe_load_path.js's own convention
    // — `shot.tNorm`/`topoutU` are already whole-film fractions, matching its existing direct
    // `plan.poseAt(tn)` calls), so it calls `plan.poseAt` DIRECTLY here, never the clip-relative
    // `poseAt()`/`_tFilm()` wrapper the frame loop's own `_tn` uses — reusing THAT wrapper for a
    // whole-film tn would double-apply (or wrongly skip) the clip remap. A normal (no --clip) bake
    // is identical either way (`_tFilm` is the identity then), so this only matters under --clip.
    A._bakeCameraPoseAt = function (tn) {
      if (!plan || typeof plan.poseAt !== 'function') return null;
      var pose = plan.poseAt(tn);
      if (!pose) return null;
      var gazeDist = Math.hypot(pose.tx - pose.x, pose.ty - pose.y, pose.tz - pose.z);
      var gazeBlendHalf = 1.5 / Math.max(1, (_frameRange ? _frameRange.total : nFrames) - 1);
      var refYaw = null, sumYaw = 0, sumPit = 0, samples = 0;
      for (var k = 0; k < GAZE_BLEND_N; k++) {
        var frac = (GAZE_BLEND_N === 1) ? 0 : (k / (GAZE_BLEND_N - 1) - 0.5) * 2;
        var t = Math.max(0, Math.min(1, tn + frac * gazeBlendHalf));
        var p = plan.poseAt(t);
        if (!p) continue;
        samples++;
        var dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
        var yaw = Math.atan2(dz, dx), pit = Math.atan2(dy, Math.hypot(dx, dz));
        if (refYaw === null) refYaw = yaw;
        var dYawK = yaw - refYaw;
        dYawK -= 2 * Math.PI * Math.round(dYawK / (2 * Math.PI));
        sumYaw += refYaw + dYawK; sumPit += pit;
      }
      if (!samples) return { x: pose.x, y: pose.y, z: pose.z, tx: pose.tx, ty: pose.ty, tz: pose.tz };
      var ayaw = sumYaw / samples, apit = sumPit / samples, cp = Math.cos(apit);
      return { x: pose.x, y: pose.y, z: pose.z,
        tx: pose.x + Math.cos(ayaw) * gazeDist * cp, ty: pose.y + Math.sin(apit) * gazeDist, tz: pose.z + Math.sin(ayaw) * gazeDist * cp };
    };
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
      _wakeRelease(); _dampRelease(); _bakeBudgetRelease();
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
    var _cpeRes = null;
    if (A.cinemaPathEditor && plan && plan.waypoints && opts.editor !== false && !opts.override) {
      A._maxqActive = false;
      _wakeRelease(); _dampRelease(); _bakeBudgetRelease();
      console.log('§CPE_LOCKS released for editing (maxqActive=false, wake+damping released)');
      _status('🎬 Edit the path, then OK to record');
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
        _wakeRelease(); _dampRelease(); _bakeBudgetRelease();
        return;
      }
      if (!(_cpeRes && _cpeRes.override)) {
        // Guardrail 2: OK with no edit re-uses the plan object computed before the editor opened —
        // literally the same object, so the film is byte-identical to one recorded without the
        // editor existing. The default cost of this feature is one click and nothing else.
        console.log('§CPE_APPLIED none — derived plan unchanged (guardrail 2: OK is a no-op)');
      }
    } else if (opts.override) {
      // ══ §CLI_SILENT_BAKE item 2 (spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md) — a
      // scripted bake hands the stored override straight in, and it becomes the SAME _cpeRes shape
      // the editor returns, so the application block below runs unchanged for both sources: one
      // code path, no second format, no drift. The editor path stays byte-identical (its gate
      // above merely adds `&& !opts.override`).
      var _ovIn = opts.override;
      var _durIn;
      if (opts.frames) {
        // An explicit frame count wins outright — durationSec must reproduce it exactly, because
        // the application block below re-derives nFrames from durationSec (round-trip identity).
        _durIn = nFrames / fps;
      } else {
        _durIn = (typeof _ovIn._total === 'number' && isFinite(_ovIn._total) && _ovIn._total > 0)
          ? _ovIn._total : nFrames / fps;
        // §CPE_PACING, applied to the OVERRIDE plan: a stored _total that predates caller-added
        // reveal/hose flags must still buy those beats real frames — the plan's own naturalTotal
        // is the authority, same contract as the derived path above.
        try {
          var _pIn = A.cinemaPathPlan(_durIn, _ovIn);
          if (_pIn && _pIn.naturalTotal && isFinite(_pIn.naturalTotal) && _pIn.naturalTotal > 0)
            _durIn = _pIn.naturalTotal;
        } catch (eOvP) { console.warn('§MAXQ_OVERRIDE_IN plan-probe failed: ' + eOvP.message); }
      }
      _cpeRes = { action: 'ok', override: _ovIn, durationSec: _durIn, saved: false };
      console.log('§MAXQ_OVERRIDE_IN source=' + (opts.overrideSource || 'caller') +
        ' bands=' + (_ovIn.bands ? _ovIn.bands.length : 0) +
        ' hoseOps=' + (_ovIn.hose ? _ovIn.hose.length : 0) +
        ' buildup=' + (_ovIn.buildup ? 1 : 0) + ' roomTitle=' + (_ovIn.roomTitle ? 1 : 0) +
        ' reveal=' + (_ovIn.reveal ? 1 : 0) + ' durationSec=' + _durIn.toFixed(1));
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
        // LARGE_DB_BAKE.md §2 L4 — `--frame-range a:b` wins over `--clip` when both are given
        // (the CLI itself already refuses to accept both). Renders exactly frames a..b-1 of the
        // FULL film at THAT film's own tn_i = i/(N-1) step; poseAt/_tFilm are never touched, so a
        // frame rendered here and the same frame rendered in a K=1 full bake take the identical path.
        if (opts.frameRange) {
          var _fr = opts.frameRange;
          if (_fr.b > nFrames) throw new Error('§FRAME_RANGE_OOB b=' + _fr.b + ' > full film frames=' + nFrames);
          _frameRange = { a: _fr.a, b: _fr.b, total: nFrames };
          nFrames = _fr.b - _fr.a;
          console.log('§FRAME_RANGE a=' + _frameRange.a + ' b=' + _frameRange.b +
            ' totalFullFilmFrames=' + _frameRange.total + ' rendersThisRun=' + nFrames +
            ' (frame-exact subset of the FULL film, not a --clip remap)');
        // §CPE_CLIP: a clip is fewer frames of the SAME film, so the frame count scales with the
        // window — not the duration, which the editor already derived for the whole path.
        } else if (_ov.clip && _ov.clip.out > _ov.clip.in) {
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
        // §CPE_DISCIPLINE_REVEAL Mechanism C (prompts/CINEMA_DISCIPLINE_REVEAL.md) — both the round
        // and its visuals are real. effects.js's _cinemaPathPlan/poseAt inserts the retrace via this
        // same _ov.reveal flag, transparently to this file (plan.poseAt already returns the extended
        // film); A.cpeRevealApplyVisual(plan,_tn), called from the per-frame loop below, drives the
        // ARC/STR hide via A.filterDiscs. _reveal itself is only captured here for logging.
        _reveal = !!_ov.reveal;
        // §CLASH_FILM_P1 (MEP_CLASH_REVEAL_MOVIE.md) — clash_film.js builds the mesh-true pair set
        // ONCE below, before the frame loop; it is static world content, not per-frame work.
        _clash = !!_ov.clash;
        // §FLYTHRU_DATUM — the Measure overlay, authored beside Clash in the Alt-C panel.
        _measure = !!_ov.measure;
        // §129.31 (2026-09-18, red1: "give it its own checkbox") SUPERSEDES §129 GATING (2026-09-15)'s
        // fold-under-Measure: that made an unrelated checkbox ("setting-out drawing") silently gate a
        // completely different feature. Load path now has its own Alt-C checkbox (`_ov.loadPath`,
        // cinema_path_editor.js). Explicit wins outright — true or false, independent of Measure.
        // UNDEFINED (every path saved before this checkbox existed — the field is simply absent from
        // their stored override JSON, `__maxqBake`'s own merge never touches it) falls back to the
        // OLD `!!_measure` behaviour, so no bake made before today silently loses the feature.
        _loadPath = (_ov.loadPath !== undefined) ? !!_ov.loadPath : !!_measure;
        // §129.6 item 6b (2026-09-15) SUPERSEDES the original fold-under-measure: Cost/Ledger are now
        // rows of the pie-chart HUD (cpe_resource_panel.js), gated by the SAME toggle as the
        // "4D/5D" (--label/--4d5d) checkbox — NOT --measure. The load path 3D effect itself is
        // untouched, still `_measure`-gated above. `--no-ledger`/`--no-cost` remain control-only
        // overrides.
        _ledger = !!_roomTitle && (_ov.ledger !== false);
        _costOdo = !!_roomTitle && (_ov.cost !== false);
        // §ESCAPE_ROUTE_REVEAL — its own flag, its own beat inside the closing orbit.
        _escapeRoute = !!_ov.escapeRoute;
        // §SUN_COMPASS — its own flag, NOT folded into Measure. The datum draws the model's own
        // setting-out grid; this draws the model's relationship to the planet. They answer
        // different questions and a viewer may well want one without the other.
        _sunCompass = !!_ov.sunCompass;
        // §SUN_DAY — '' (or absent) means follow the 4D timeline's own dates, which is what every
        // saved path predating this field carries, so none of them re-bake differently.
        _sunDate = _ov.sunDate || '';
        if (_reveal) console.log('§CPE_REVEAL flag=on — retrace round + ARC/STR reveal are real ' +
          '(spec: prompts/CINEMA_DISCIPLINE_REVEAL.md)');
        // §CPE_DAY_COUNTER_POS — the editor's corner choice. Absent (an older saved plan, or a bake
        // that never opened the editor) means TOP RIGHT, which is what shipped, so nothing re-bakes
        // differently by accident.
        _dayPos = _ov.dayCounter || 'tr';
        // §CPE_PATH_OVERVIEW — follows the DAY COUNTER's corner by default (§CPE_HUD_STACK):
        // the user's ruling is one top/down/left/right preference for the whole column, not a
        // separate corner per overlay.
        _ovPos = _ov.pathOverview || _dayPos;   // §CPE_HUD_STACK: one corner preference for the column
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
        } else if (typeof window.tmHasExistingSchedule === 'function' && !(await window.tmHasExistingSchedule())) {
          // §CPE_BUILDUP_REQUIRE_TM_FIRST — never let the movie button generate a building's FIRST
          // schedule; that's Time Machine's job, once, so the user actually sees the buildup before
          // it's baked. A visible status (not just a console warning) since this is a one-time thing
          // the user needs to go DO, not a background detail.
          console.warn('§CPE_BUILDUP_SKIP reason=no schedule generated yet — open Time Machine first');
          _status('🎬 Open Time Machine first to build the construction schedule — baking without it this time');
          await _sleep(2000);
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
            _revealU = _top.u;   // §CPE_STATS_TAIL — where the Reveal 2nd round starts
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
      var _lblInfo = null;   // §CLASH_FILM_P2 — this frame's placed labels, same per-bake scoping as _dayInfo
      // §CPE_ROOM_TITLE — one coarse pre-pass over the WHOLE (already clip/buildup-resolved) frame
      // count, not a per-frame room query: nFrames/fps here is the bake's actual, final duration
      // (§CPE_CLIP has already resized it above), so the timeline never disagrees with what's about
      // to be captured.
      if (_roomTitle && plan && A.roomTitleBuildTimeline) {
        try { _titleSegs = A.roomTitleBuildTimeline(plan, nFrames / fps); }
        catch (eT) { console.warn('§CPE_ROOM_TITLE_ERR ' + eT.message); _titleSegs = null; }
      }
      t0 = _etaPrev = performance.now();
      // §CPE_PATH_OVERVIEW — prepared ONCE here, never in the loop. The projection, the path
      // polyline and the envelope are all static by design, so the per-frame cost is two projected
      // points (camera position + look target) and a triangle. Gated on the Label ON checkbox per
      // the user's ruling. The envelope traverse is a single Box3 pass at bake START — one ~48k
      // element walk against a multi-minute bake, not a per-frame cost.
      // §CPE_PATH_OVERVIEW_NEVER_KILLS_A_BAKE (2026-08-30 — real failure, user's HHS bake aborted
      // here). This block referenced `_ovCam`, a variable an earlier edit of mine had deleted along
      // with the Box3 envelope traverse it belonged to. The ReferenceError threw between
      // §CPE_ROOM_TITLE_COLLECTIVE and the frame loop, so a 3,048-frame bake set up staging, the
      // schedule, the buildup and the captions — then stopped without capturing a single frame and
      // without printing a §CPE_PATH_OVERVIEW line at all. The missing log line is what located it.
      //
      // The variable is fixed below, but the REAL fix is this try/catch: a decorative corner box
      // must never be able to abort a bake. Any failure here now costs the box, not the film.
      try {
        if (_roomTitle && A.pathOverviewPrepare && plan && plan.waypoints) {
          // Framing is the crafted stick span only (§CPE_PATH_OVERVIEW_FRAME, user ruling), so no
          // camera trajectory is sampled or passed — the head is clamped to the panel edge instead.
          _ovPath = A.pathOverviewPrepare(plan, null, null);
          console.log('§CPE_PATH_OVERVIEW ' + (_ovPath
            ? ('on waypoints=' + _ovPath.wpCount + ' pos=' + _ovPos)
            : 'INCONCLUSIVE reason=no-path-to-draw (plan has <2 waypoints) — box omitted, not blank'));
        } else if (!_roomTitle) {
          console.log('§CPE_PATH_OVERVIEW off — rides the Label ON checkbox, which is off for this bake');
        }
      } catch (eOv) {
        _ovPath = null;
        console.warn('§CPE_PATH_OVERVIEW_ERR ' + eOv.message + ' — box disabled, bake continues');
      }
      // §CPE_RESOURCE_PANEL — the ops snapshot is taken ONCE (read-only copy, §TM_OPS_SNAPSHOT);
      // per frame only the day's composition is recomputed, and the pie bitmap is cached on dayKey.
      // Rides the same Label ON checkbox and refuses honestly when there is no schedule to read.
      try {
        if (_roomTitle && A.resourcePanelAt && typeof window.tmOpsSnapshot === 'function' && _bkState) {
          A._resHoldFrames = 0; A._resHoldLogged = false;   // §CPE_PIE_HOLD counts are per-bake
          A._statTailFrames = 0; A._statTailLogged = false; // §CPE_STATS_TAIL, same
          A._measureCardLast = null;                        // §MEASURE_BUILDING_CARD, same per-bake reset
          A._clashLblStopped = false;                       // §CLASH_LABELS_STOP, same per-bake reset
          _resOps = window.tmOpsSnapshot();
          console.log('§CPE_RESOURCE_PANEL ' + (_resOps && _resOps.length
            ? ('on ops=' + _resOps.length + ' rates=' + (!!(window.LABOR_RATES)) + ' pos=' + _ovPos)
            : 'INCONCLUSIVE reason=no-ops — panel omitted, not blank'));
        } else if (_roomTitle) {
          console.log('§CPE_RESOURCE_PANEL INCONCLUSIVE reason=' +
            (!_bkState ? 'no-buildup-timeline' : 'no-ops-snapshot') + ' — panel omitted, not blank');
        }
      } catch (eR) { _resOps = null; console.warn('§CPE_RESOURCE_PANEL_ERR ' + eR.message + ' — panel disabled, bake continues'); }
      // ══ §CLASH_FILM_P1 — build the markers ONCE, before the first frame ═══════════════════
      // Deliberately BEFORE the loop and never inside it: the narrow phase costs ~2 s on Terminal,
      // and the pair set is static. The markers are a FORECAST (§3b) — they stand from frame 0 over
      // empty ground while the buildup rises around them, so nothing here consults the TM cursor.
      // §CLASH_HUD_ORDER (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md §PENDING.5 item A — ROOT CAUSE of the
      // user's "HUD left out Clash stats" report on the full 195.8s film): this block used to run
      // AFTER §CPE_BIG_STATS below, so `bigStatsBuild()` always read `A.clashFilm.stats().built ===
      // false` on a fresh page load — the clash film had not been built yet — and §CLASH_HUD_CARD was
      // silently dropped on EVERY first bake of a tab, `--clash` and pair count notwithstanding. Moved
      // here, BEFORE §CPE_BIG_STATS, so the card sees the real, already-judged stats.
      // LARGE_DB_BAKE.md §2 L4 — same invariant the --clip branch already protects ("a full bake is
      // unchanged, _filmSecFull === nFrames / fps when no clip is set", see the comment near
      // _workCursorAt below): in frame-range mode `nFrames` has ALREADY been narrowed to this run's
      // slice (b-a), so falling through to the plain `nFrames / fps` here silently fed every
      // absolute-seconds effect below (clash timing, ghost-ground fade, flythru cues, slab/indoor
      // beats — all keyed off `_tnFilm * _filmSecFull`) the wrong film length. FOUND via the
      // §FRAME_HASH seam witness: a=780 rendered completely different pixels under b=781 vs b=785.
      var _filmSecFull = _frameRange ? (_frameRange.total / fps)
        : (_clip && _clip.out > _clip.in) ? (nFrames / (_clip.out - _clip.in)) / fps : nFrames / fps;
      // §FLYTHRU_CUES — baseline measurement cues (B1/B2/B4/B5). Built once, placed against the
      // REAL camera path. Never allowed to kill a bake: same try/catch contract as every overlay here.
      if (A.flythruCuesBuild) {
        try { A.flythruCuesBuild(plan, _filmSecFull); }
        catch (eFC) { console.warn('§FLYTHRU_CUES_BUILD failed: ' + (eFC && eFC.message) + ' — cues disabled for this bake'); }
      }
      // §129.6 item 1 (2026-09-15, after a real HHS bake showed a camera "resume jump"):
      // §LOADPATH_WINDOW_SHIFT is WITHDRAWN — pushing `_revealU` forward left `_tn`/`_tnFilm`
      // free to keep advancing during the hold (sun arc, buildup cursor, everything driven off
      // tFilm), so release snapped the camera to wherever the film had moved on to. The hold now
      // FREEZES THE FILM CLOCK instead: `_lpFramesInserted` extra frames are SPLICED into the
      // timeline at the arm point (`_lpHoldFrameStart`), the delivered film is longer by the hold
      // (red1: "I don't mind it adds few secs"), and `_tn` (below) is remapped so it holds constant
      // at the arm value for exactly those inserted frames, then resumes from that SAME value —
      // never shifting any OTHER beat's own boundary.
      if (_loadPath && A.loadPathBuild) {
        try {
          A.loadPathBuild(plan, _filmSecFull, _revealU, A.db, w, h, fps);   // §129.7 items 3+6 — real output px/fps
          // Finding 4 fix (2026-09-16) — `!window.__lpNoClockFreeze` DROPPED from this condition: the
          // frame-splice/insertion setup below (armTn/holdFrameStart/framesInserted/nFrames inflation,
          // the §LOADPATH_HOLD_INSERT log) must run whenever a hold window exists, regardless of the
          // control — the hold must still visibly happen (still spliced in) under __lpNoClockFreeze.
          // ONLY the separate "hold `_tn` constant during those inserted frames" remap, below near
          // `_lpHoldCtl`, keeps the `!window.__lpNoClockFreeze` gate — that is the one piece this
          // control is meant to defeat, letting the film clock keep advancing under a still-pinned
          // camera pose (cpe_load_path.js's own armPose re-assert, unconditional on this control) so a
          // resume jump reappears, exactly reproducing the pre-splice bug for §LOADPATH_RESUME's own
          // stepAtResume/maxStepElsewhere witness to measure.
          if (A._loadPathWindow && A._loadPathWindow.durSec > 0) {
            _lpNFramesOriginal = nFrames;
            _lpArmTn = _filmSecFull > 0 ? A._loadPathWindow.holdStartSec / _filmSecFull : 0;
            _lpFramesInserted = Math.max(1, Math.round(A._loadPathWindow.durSec * fps));
            // ROUND 9 item 1 — through the SAME grid the frame loop uses (--clip / --frame-range /
            // full film), never a bare armTn*(N-1) (see _lpFrameForArmTn above).
            var _lpGrid = _lpFrameForArmTn(_lpArmTn, _lpNFramesOriginal);
            _lpHoldFrameStart = _lpGrid.frame;
            _lpArmFrameTn = _lpGrid.armFrameTn;
            _lpArmTnMatch = Math.abs(_lpArmFrameTn - _lpArmTn) <= _lpGrid.step + 1e-9;
            A._loadPathArmFrameTn = _lpArmFrameTn; A._loadPathArmTnMatch = _lpArmTnMatch;
            nFrames = _lpNFramesOriginal + _lpFramesInserted;
            console.log('§LOADPATH_HOLD_INSERT armTn=' + _lpArmTn.toFixed(4) + ' holdFrameStart=' + _lpHoldFrameStart +
              ' armFrameTn=' + _lpArmFrameTn.toFixed(6) + ' armTnMatch=' + _lpArmTnMatch +
              ' framesInserted=' + _lpFramesInserted + ' nFramesOriginal=' + _lpNFramesOriginal + ' nFrames=' + nFrames +
              (_lpArmTnMatch ? '' : ' => FAIL'));
          }
        } catch (eLPB) { console.warn('§LOADPATH_BUILD_ERR ' + (eLPB && eLPB.message) + ' — load path disabled for this bake'); }
      }
      // §129.2 LEDGER TICKER — built once here, AFTER load path's own window shift above, so the
      // ticker's topout marker lands at the SAME boundary the film actually reaches (§129 preamble
      // order: LOAD PATH hold -> LEDGER seal moment -> stats round). Never re-verifies per frame —
      // one async verifyChainIncremental pass, then the buildup window just paints the count-up.
      if (_ledger && A.ledgerTickerBuild) {
        try { A.ledgerTickerBuild(plan, _filmSecFull, _revealU, A.db); }
        catch (eLTB) { console.warn('§LEDGER_TICKER_BUILD_ERR ' + (eLTB && eLTB.message) + ' — ledger ticker disabled for this bake'); }
      }
      // §FLYTHRU_DATUM — built once from the DB, so it stands at frame one whatever the buildup has
      // reached. Only when Measure is on; a bake without it must cost nothing.
      A._flythruFilmSecFull = _filmSecFull;
      A._flythruDatumOn = !!_measure;
      A.filmLayer = _filmLayerRegister;   // §FILM_LAYER — attached HERE, where A exists (see its note above)
      // §129.6 item 6b — Cost/Ledger pie-chart-HUD rows, gate only (the resource panel itself
      // always runs); the actual rows draw in cpe_resource_panel.js's own
      // resourcePanelCompositeOntoCanvas, reading these two flags (independently, so --no-cost/
      // --no-ledger keep working as separate control overrides even though both share the same
      // parent 4D/5D toggle).
      A._costOdometerOn = !!_costOdo;
      A._pieLedgerOn = !!_ledger;
      A._costOdometerFinalFired = false;   // per-bake reset — a stale true from an earlier bake this same page must never suppress the INCONCLUSIVE line
      if (_measure && A.flythruDatumBuild) {
        try { A.flythruDatumBuild(); }
        catch (eFDB) { console.warn('§FLYTHRU_DATUM_BUILD failed: ' + (eFDB && eFDB.message) + ' — the film bakes without the datum'); }
        // §37.2 — the datum's second life over the finished building, on the pull-out→flyback stretch.
        try { if (A.flythruDatumSetLife2 && plan && plan.beats) A.flythruDatumSetLife2(plan.beats.flyback * _filmSecFull, (plan.beats.rise - ((plan.storeyReveal && plan.storeyReveal.on && plan.storeyReveal.windowFrac > 0) ? plan.storeyReveal.windowFrac : 0)) * _filmSecFull); } catch (eL2) {}
      }
      // §SUN_COMPASS (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §7) — the true-north rose on
      // the ground, built once from the DB like the datum. OFF unless asked for: it is new, and an
      // overlay that appears in every existing plan's re-bake would silently change films the user
      // already signed off. `sunCompassBuild` returns null and SAYS why (no lat/long, no extent)
      // rather than drawing a rose it cannot justify, and this flag follows that answer so
      // _captureFrame does not have to re-ask every frame.
      A._sunCompassOn = false;
      // §SUN_DAY — set BEFORE the build so the very first frame is already on the pinned day.
      if (_sunCompass && A.sunCompassSetDate) {
        try { A.sunCompassSetDate(_sunDate); } catch (eSD2) {}
      }
      if (_sunCompass && A.sunCompassBuild) {
        // §PLACE — start the city table loading BEFORE the frame loop, so the geo-ref plate has
        // its innermost row from frame 0. Awaited, not fire-and-forget: a table that arrives on
        // frame 200 would put a row on screen halfway through the film, which reads as a glitch.
        // It never blocks for long (one local file, 1.14 MB gzipped) and a failure is silent by
        // design — placeTableLoad resolves null and the row is simply absent.
        if (A.placeTableLoad) { try { await A.placeTableLoad(); } catch (ePT) {} }
        try { A._sunCompassOn = !!A.sunCompassBuild(); }
        catch (eSCB) { console.warn('§SUN_COMPASS_BUILD failed: ' + (eSCB && eSCB.message) + ' — the film bakes without the compass'); }
      } else if (!_sunCompass) {
        console.log('§SUN_COMPASS off — not requested for this bake');
      }
      // §SLAB_BEAT (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §26) — ONE floor plate marked as it
      // is laid: depth-tested tint + X, shine-through label. Rides Measure with the datum. Needs the
      // buildup state (nothing pops without it) and the SAME cursor clock the loop below drives
      // (buildupTAt + buildupCursorAt with nFrames/fps), so the pop second it computes is the frame
      // the film shows. Same never-kills-a-bake contract as its neighbours.
      if (_measure && A.slabBeatBuild) {
        try { A.slabBeatBuild(plan, _filmSecFull, _bkState, _filmSecFull); }
        catch (eSB) { console.warn('§SLAB_BEAT_BUILD failed: ' + (eSB && eSB.message) + ' — the film bakes without the slab beat'); }
      }
      // §LINEAR_BEAT (§27) — one column + one beam during the dive, slots clear of the plate's. Rides Measure.
      if (_measure && A.linearBeatBuild) {
        try { A.linearBeatBuild(plan, _filmSecFull, _bkState, _filmSecFull); }
        catch (eLB) { console.warn('§LINEAR_BEAT_BUILD failed: ' + (eLB && eLB.message) + ' — the film bakes without the linear beat'); }
      }
      // §INDOOR_BEATS (§29) — hall walkable area, stair going, door type, clear height, inside the dive→out window. Rides Measure.
      if (_measure && A.indoorBeatsBuild) {
        try { A.indoorBeatsBuild(plan, _filmSecFull, _bkState); }
        catch (eIB) { console.warn('§INDOOR_BEAT_BUILD failed: ' + (eIB && eIB.message) + ' — the film bakes without the indoor beats'); }
      }
      // §FLYOUT_BEATS (§38.2 / §40.3) — wing spans + roof-edge-to-sill on the clean pull-out canvas.
      // LAST of the Measure builders on purpose: it reads every other layer's taken windows (§14
      // across layers) and must therefore be built after them.
      if (_measure && A.flyoutBeatsBuild) {
        try { A.flyoutBeatsBuild(plan, _filmSecFull); }
        catch (eFB2) { console.warn('§FLYOUT_BEAT_BUILD failed: ' + (eFB2 && eFB2.message) + ' — the film bakes without the fly-out beats'); }
      }
      // §RULE_FILM (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §59) — Structural Sanity + Egress
      // findings, scheduled into the storey-reveal window built above. Async (fetches rules JSON,
      // may lazy-load RoomGraph), so awaited like §CLASH_FILM_BUILD below.
      if (_measure && A.ruleFindingsFilmBuild) {
        try { await A.ruleFindingsFilmBuild(A.dbQuery, plan); }
        catch (eRF) { console.warn('§RULE_FILM_BUILD failed: ' + (eRF && eRF.message) + ' — the film bakes without rule findings'); }
      }
      if (_clash && A.clashFilm && A.clashFilm.build) {
        try { await A.clashFilm.build(); }
        catch (eCF) { console.warn('§CLASH_FILM_BUILD failed: ' + (eCF && eCF.message) + ' — the film bakes without markers'); }
        // §CLASH_FILM_P2 — fresh hysteresis/fade state per bake; a previous bake's "near" set must
        // not leak into this one's first frame.
        if (A.clashLabels && A.clashLabels.reset) try { A.clashLabels.reset(); } catch (eCLr) {}
      } else if (_clash) {
        console.warn('§CLASH_FILM_BUILD INCONCLUSIVE reason=clash_film.js not loaded — nothing judged');
      }
      // §CPE_BIG_STATS — the second half's cards, built ONCE from real sources. The pie answers
      // "who is on site today", which is dead after §CPE_BUILDUP_TOPOUT: construction has finished
      // and no trade is active, so the panel drew nothing for the whole reveal round. Runs AFTER
      // §CLASH_FILM_P1 above (§CLASH_HUD_ORDER) so the clash/disc-pair cards see a built film.
      var _pairCards = [];
      try {
        if (_roomTitle && A.bigStatsBuild && _bkState) {
          _bigCards = A.bigStatsBuild(_resOps, _bkState.projectStart, _bkState.projectEnd);
          _pairCards = (_bigCards || []).filter(function (c) { return c && c.discPairKey; });
        }
      } catch (eBS) { _bigCards = null; console.warn('§CPE_BIG_STATS_ERR ' + eBS.message + ' — cards disabled, bake continues'); }
      // §HUD_BOX / §STATUS_BOX / §MEASURE_BOX (§38.1b, §40.1) — the three rectangles are decided ONCE
      // here, from which HUD members THIS bake has, and never again. Per-frame arming would put the
      // status box back on the move the moment the day counter or the pie dropped out for a stretch,
      // which is the whole defect. The stats slot is reserved whenever the labels are on: four
      // different contents take that slot over a film (roster, stat cards, storey-reveal card,
      // measure card) and they all sit at the same stack offset.
      if (A.filmBoxesArm) {
        try {
          A.filmBoxesArm(w, h, { pos: _ovPos,
                                 day: (_dayPos !== 'off' && !!_bkState && !!A.dayCounterAt),
                                 overview: !!_ovPath,
                                 stats: !!_roomTitle });
        } catch (eFB) { console.warn('§FILM_BOXES_ARM_ERR ' + eFB.message + ' — boxes fall back to the old caption plate'); }
      }
      // §CLASH_HUD_PULLBACK_WINDOW (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md §PENDING.5 item C) — derived
      // from the SAME beat fractions/seconds effects.js already computes on `plan`, never re-baked or
      // hardcoded. beats.reveal(tV)/beats.rise(tR) bound the combined tail+pullback span; reveal.tailSec
      // / reveal.riseSec are the UNFOLDED seconds of the tail-caption sub-phase and the true pull-back
      // sub-phase §CPE_DISCIPLINE_REVEAL_PULLOUT's own comment says are blended across that span.
      // tailShare recovers where the tail's caption-cycling ends and the true pull-back begins.
      // Window ends 5s before orbit (plan.beats.rise) per this task's own boundary rule — the sibling
      // storey-reveal lane owns everything from there on.
      var _pullbackU = null;
      if (_clash && plan && plan.beats && plan.durationSec > 0 &&
          plan.beats.reveal != null && plan.beats.rise != null && plan.beats.rise > plan.beats.reveal) {
        var _tV = plan.beats.reveal, _tR = plan.beats.rise;
        var _tailSec = (plan.reveal && plan.reveal.tailSec) || 0;
        var _riseSec = (plan.reveal && plan.reveal.riseSec) || (plan.sec && plan.sec.rise) || 0;
        var _tailShare = (_tailSec + _riseSec) > 0 ? _tailSec / (_tailSec + _riseSec) : 0;
        var _pbStart = _tV + _tailShare * (_tR - _tV);
        var _pbEnd = _tR - (5 / plan.durationSec);
        if (_pbEnd > _pbStart) {
          _pullbackU = { start: _pbStart, end: _pbEnd };
          console.log('§CLASH_HUD_PULLBACK_WINDOW start=' + _pbStart.toFixed(3) + ' end=' + _pbEnd.toFixed(3) +
            ' (tV=' + _tV.toFixed(3) + ' tR=' + _tR.toFixed(3) + ' tailSec=' + _tailSec.toFixed(1) +
            ' riseSec=' + _riseSec.toFixed(1) + ' tailShare=' + _tailShare.toFixed(3) +
            ' durationSec=' + plan.durationSec.toFixed(1) + ' pairCards=' + _pairCards.length +
            ') — 5s before orbit reserved for the storey-reveal lane');
        } else {
          // §CLASH_WINDOW_DIAGNOSTIC (MEP_CLASH_REVEAL_MOVIE.md §66, 2026-09-11) — the old message said
          // "window-too-short" for what is really an INVERSION: the fixed 5s reservation above is
          // larger than the whole pullback sub-phase, so end lands BEFORE start. Same family as
          // §60.4 — a constant tuned on long films degenerating on short ones. Skipping stays correct
          // (clamping the reservation would leave ~0.25s per pair card, unreadable), but the numbers
          // have to be here or a reader cannot tell this is a fact about the film's beat geometry
          // rather than a defect. Real HHS: span 4.03s vs a 5.0s reservation.
          var _spanSec = (_tR - _pbStart) * plan.durationSec;
          var _shortfall = (_pbStart - _pbEnd) * plan.durationSec;
          console.log('§CLASH_HUD_PULLBACK_WINDOW INCONCLUSIVE reason=' +
            (_pbEnd < _pbStart ? 'reservation-exceeds-span' : 'window-too-short') +
            ' start=' + _pbStart.toFixed(3) + ' end=' + _pbEnd.toFixed(3) +
            ' pullbackSpanSec=' + _spanSec.toFixed(2) + ' reservedSec=5.00 shortBySec=' + _shortfall.toFixed(2) +
            ' pairCards=' + _pairCards.length + ' durationSec=' + plan.durationSec.toFixed(1) +
            ' — the 5s storey-reveal reservation is wider than this film\'s whole pullback;' +
            ' disc-pair highlight/cards skipped (a clamped window would give ' +
            (_pairCards.length ? (_spanSec / _pairCards.length).toFixed(2) : '0') + 's per card, unreadable)');
        }
      } else if (_clash) {
        console.log('§CLASH_HUD_PULLBACK_WINDOW INCONCLUSIVE reason=' +
          (!plan ? 'no-plan' : (!plan.beats ? 'no-beats-on-plan' : 'bad-beats')) +
          ' — disc-pair highlight/cards skipped for this bake');
      }
      // §CLASH_DISC_ARRIVAL (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md — user: "align the respective DISC
      // pull out with a focussed DISC by DISC clash set"). Built ONCE per bake off clash_film.js's
      // already-judged pairs and effects.js's OWN parade order (plan.reveal.discs) — never a second
      // ordering derived here, so the clash sets cannot drift from the order the camera reveals.
      var _arrival = null, _arrivalByDisc = {};
      if (_clash && A.clashFilm && A.clashFilm.discArrivalSchedule &&
          plan && plan.reveal && plan.reveal.discs && plan.reveal.discs.length) {
        try {
          _arrival = A.clashFilm.discArrivalSchedule(plan.reveal.discs);
          if (_arrival) _arrival.slots.forEach(function (sl) { _arrivalByDisc[sl.disc] = sl; });
        } catch (eAR) { console.warn('§CLASH_DISC_ARRIVAL failed: ' + eAR.message + ' — parade runs without clash sync'); }
      } else if (_clash) {
        console.log('§CLASH_DISC_ARRIVAL INCONCLUSIVE reason=' +
          (!A.clashFilm || !A.clashFilm.discArrivalSchedule ? 'clash_film-too-old'
            : 'no-reveal-discs-on-plan') + ' — disc parade runs without clash sync');
      }
      // Backdrop pairs (ARC|STR — both disciplines are the shell, which the parade excludes by design)
      // belong to no parade slot. They land at the START of the pullback rotation instead, which is the
      // exact instant the shell comes back SOLID (cpeRevealVisualAt returns null from there on). Done by
      // ORDERING the existing card array, not by a new branch: bigStatsAt walks it in order.
      if (_arrival && _arrival.backdrop.keys.length && _pairCards.length) {
        var _bd = {}; _arrival.backdrop.keys.forEach(function (k) { _bd[k] = 1; });
        _pairCards = _pairCards.slice().sort(function (x, y) {
          return (_bd[y.discPairKey] ? 1 : 0) - (_bd[x.discPairKey] ? 1 : 0);
        });
        console.log('§CLASH_DISC_ARRIVAL pullback card order (backdrop first) [' +
          _pairCards.map(function (c) { return c.discPairKey; }).join(' ') + ']');
      }
      // §MEASURE_BUILDING_CARD — the film's last 3 seconds (the closing roll-to-stop) show the
      // whole-building Measure figures. Queried once per bake, never per frame.
      // The CLOSING ORBIT belongs to the Measure totals, start to finish. (User, after watching the
      // 2026-09-06 ending bake: "The very last quick orbit the cards return to clash info. They should
      // be playing the Measure totals stats.") It previously took only the last 3s, so the normal
      // all-card rotation — clash cards included — played over the rest of the orbit, which is exactly
      // what the user saw. The window is now the whole orbit beat, [beats.rise, 1] — also the one span
      // the storey reveal never touches (it ends AT beats.rise), so the two cannot overlap.
      var _measureCards = null;
      try { if (A.buildingMeasureCards) _measureCards = A.buildingMeasureCards(); }
      catch (eMB) { console.warn('§MEASURE_BUILDING_CARD failed: ' + eMB.message + ' — final cards skipped'); }
      var _measureU = (_measureCards && _measureCards.length && plan && plan.beats &&
                       plan.beats.rise > 0 && plan.beats.rise < 1) ? plan.beats.rise : null;
      if (_measureU != null) {
        console.log('§MEASURE_BUILDING_CARD window=[' + _measureU.toFixed(4) + ',1] cards=' + _measureCards.length +
          ' (the whole closing orbit, ' + ((1 - _measureU) * plan.durationSec).toFixed(1) + 's, ' +
          (((1 - _measureU) * plan.durationSec) / _measureCards.length).toFixed(1) + 's per card)');
      } else if (_measureCards) {
        console.log('§MEASURE_BUILDING_CARD INCONCLUSIVE reason=no-usable-rise-beat — closing cards skipped');
      }
      A._clashHudHighlightLast = null;   // per-bake reset — a prior bake's held highlight must not leak in
      // §129.57 frame-reuse state — per bake, never module-level, so a second bake in the same
      // page can never be handed the previous bake's last frame.
      var _lastFrameKey = null, _lastFrameBlob = null, _frameReuseRun = 0, _frameReuseTotal = 0;
      var _prevVisualRev = -1;   // §129.57 — last frame's A._loadPathVisualRev; see the key's own note
      var _frameReuseRuns = 0;
      // ══ §ESCAPE_ROUTE_REVEAL — built ONCE, here, never per frame. It Dijkstras every room to its
      // nearest exit to find the worst case (see cpe_escape_route.js §SELECTION), which is real work
      // and must not land in the frame budget. A null return is a stated reason in the log, and every
      // per-frame call below then no-ops: DEGRADE, DON'T DISABLE.
      var _escRec = null;
      if (_escapeRoute && A.escapeRouteBuild) {
        // §ESCAPE_ROUTE_BREACH — the SAME rulebook the Egress panel reads (rates/egress_rules.json
        // plus whatever jurisdiction overlay is selected), never a re-typed threshold. Loaded
        // BEFORE the build so the record carries its flag from the first frame. A failure here
        // leaves the film with no breach flag, which is the honest degrade — never a guessed limit.
        if (A.loadRuleSet && A.escapeRouteSetRules) {
          try { var _er = await A.loadRuleSet('egress'); A.escapeRouteSetRules(_er.rules, _er.source); }
          catch (eRL) { console.warn('§ESCAPE_ROUTE_RULES load failed: ' + (eRL && eRL.message) + ' — no breach flag this bake'); }
        }
        try { _escRec = A.escapeRouteBuild(); }
        catch (eER) { console.warn('§ESCAPE_ROUTE_BUILD failed: ' + eER.message + ' — the reveal is inert this bake'); }
        var _escWin = (A.escapeRouteWindow && plan) ? A.escapeRouteWindow(plan) : null;
        if (_escRec && _escWin && plan && plan.durationSec > 0) {
          console.log('§ESCAPE_ROUTE_WINDOW film=[' + _escWin.start.toFixed(4) + ',' + _escWin.end.toFixed(4) + ']' +
            ' = ' + (_escWin.start * plan.durationSec).toFixed(1) + 's..' + (_escWin.end * plan.durationSec).toFixed(1) + 's' +
            ' of ' + plan.durationSec.toFixed(1) + 's (inside the closing orbit [' + plan.beats.rise.toFixed(4) +
            ',1]; the storey reveal ends AT beats.rise and the §MEASURE_BUILDING_CARD roll keeps the tail, so' +
            ' neither can collide with this)' +
            (_escWin.capped ? ' — length CAPPED to the ' + ((_escWin.end - _escWin.start) * plan.durationSec).toFixed(1) + 's ceiling' : ''));
        } else if (_escRec) {
          console.log('§ESCAPE_ROUTE_WINDOW INCONCLUSIVE reason=no-usable-rise-beat — the reveal has nowhere to play');
        }
      }
      for (var i = 0; i < nFrames; i++) {
        if (_cancel) { console.log('§MAXQ_CANCEL i=' + i); break; }
        // §MAXQ_CONTEXT_LOSS: scene.js's webglcontextlost handler (§S266) sets this — capturing
        // further frames now would just save blank/black canvas with no error, silently corrupting
        // the tail of the movie. Stop here and salvage whatever was captured before the loss,
        // same treatment as the IDB-connection-lost path below.
        if (A._webglContextLost) { _glLost = true; console.log('§MAXQ_GL_LOST i=' + i + ' salvaging ' + framesDone + ' already-captured frames'); break; }
        // §MAXQ_STAGE_KEEP (CPE_4D_PERF_MEM_FINDINGS.md §2c/R1, Witness: witness_maxq_stage_keep.js):
        // keepStaging=true — the photo staging (ground/puddles/HDRI/fog/sky) is per-BAKE state; only
        // the TAA/AO accumulation is per-frame. Tearing staging down here and rebuilding it in the
        // startStillRefine below cost the whole teardown→restage cycle on every frame (the measured
        // §BAKE_FAST_PATH_COST "~660ms/frame unaccounted"). Per-frame sun still moves: _sunArcStep
        // below calls updateSky + shadowMap.needsUpdate itself. The end-of-bake stopStillRefine
        // calls stay full-teardown, so the scene restore on exit is unchanged.
        if (A._stillRefineActive) A.stopStillRefine(true, true);
        // §MAXQ_HIDDEN_PAUSE: park BEFORE the cook, not after. Waiting here means the frame is
        // begun with the tab already visible, so the fold has a real rAF loop to converge on.
        await _awaitVisible('frame ' + i + '/' + nFrames);
        // §DATUM_DECOUPLE — _raf2 waits for two real rAF ticks, falling back to a 1500ms timeout if
        // none fire. With no _composer.render() to composite, Chromium never schedules a real rAF for
        // this page, so BOTH _raf2 calls below hit their fallback every frame — MEASURED: exactly the
        // ~3s dead gap between frames (out/L2_burnin_2026-09-09.log, i=60→61 etc, zero log lines in
        // the gap). Skip them; there is no compositor tick to sync a static PNG draw against.
        if (!A._burninDatumDir) await _raf2('frame ' + i + ' settle');
        // §MAXQ_STAGE_KEEP: SETTLE_MS existed to keep the NEXT staging from capturing mid-restore
        // sun-tint/exposure values as "original" (see its declaration). With staging kept alive
        // there is no restore in flight — sleep only when staging is actually down (frame 0, or a
        // teardown forced by an interaction mid-bake).
        if (!A._photoStagingOn) await _sleep(SETTLE_MS);
        _freezeRandom();
        // LARGE_DB_BAKE.md §2 L4 — in frame-range mode tNorm is the FULL film's own i/(N-1), offset
        // by the range's start, so a frame at global index g renders identically whether this run
        // covers [0,N) in one bake or [g,g+1) as one slice of a K-way split.
        // §129.6 item 1 — CLOCK FREEZE: when a hold was armed (_lpFramesInserted>0), splice
        // `_lpFramesInserted` frames at `_lpHoldFrameStart` that hold `_tn` CONSTANT at the arm
        // value, then resume the ORIGINAL (pre-insertion) tn progression from EXACTLY that same
        // point — never skipping or re-visiting an original frame. Byte-identical to the old
        // `i/(nFrames-1)` mapping when no hold armed (_lpFramesInserted===0). `_lpHoldCtl` is the
        // explicit, unambiguous "is THIS frame a hold frame" signal cpe_load_path.js's own
        // loadPathApplyVisual now takes instead of re-deriving window membership from (now frozen)
        // tNorm — never computed when frame-range mode is active (a separate large-DB-bake concern,
        // untouched by this fix).
        // Finding 4 fix (2026-09-16) — `!window.__lpNoClockFreeze` ADDED to the "hold `_tn` constant"
        // branch's own condition (it used to live only on whether frames got inserted at all, up at
        // the loadPathBuild call site, which is now unconditional — see that site's own comment).
        // Frames are still spliced in (nFrames/`_lpFramesInserted` are unchanged by this control), so
        // this branch's index ranges are still correct; under the control, EVERY frame — including
        // the spliced-in ones — now falls through to the `else` below, using the SAME plain, ever-
        // advancing `i/(nFrames-1)` mapping the "no hold armed" case always used, with `_lpHoldCtl`
        // left `null` throughout (cpe_load_path.js's own loadPathApplyVisual already has a dedicated,
        // pre-existing fallback for a falsy holdCtl: re-derive window membership from the now-
        // continuously-advancing `fSec` itself — "reproducing the pre-fix behaviour exactly, on
        // purpose, for that control", per its own comment). The camera still visually holds (armPose
        // is re-asserted every frame that fallback says is `inWindow`), but `_tn`/`_tnFilm` keep
        // moving underneath for the WHOLE, now-longer, inserted span — exactly the old "film clock
        // free to keep advancing during the hold" bug — so release snaps the camera to wherever
        // `poseAt(_tn)` has moved on to, reproducing the resume jump §LOADPATH_RESUME's stepAtResume/
        // maxStepElsewhere fields measure.
        var _lpHoldCtl = null, _tn;
        if (_frameRange) {
          _tn = (_frameRange.a + i) / (_frameRange.total - 1);
        } else if (_lpFramesInserted > 0 && !window.__lpNoClockFreeze && i >= _lpHoldFrameStart) {
          if (i < _lpHoldFrameStart + _lpFramesInserted) {
            _tn = _lpNFramesOriginal > 1 ? _lpHoldFrameStart / (_lpNFramesOriginal - 1) : 0;
            _lpHoldCtl = { inHold: true, elapsedSec: (i - _lpHoldFrameStart) / fps };
          } else {
            var _iShifted = i - _lpFramesInserted;
            _tn = _lpNFramesOriginal > 1 ? _iShifted / (_lpNFramesOriginal - 1) : 0;
            _lpHoldCtl = { inHold: false, elapsedSec: null };
          }
        } else {
          // PRE-HOLD frames (i < _lpHoldFrameStart), once a hold has been armed THIS bake, must
          // still divide by the ORIGINAL frame count — `nFrames` was already inflated by
          // `_lpFramesInserted` at the loadPathBuild call site above, and dividing by the inflated
          // total here would silently COMPRESS every frame before the hold (caught by the node dry
          // run, scratchpad/test_clock_freeze.js — a real defect, not a hypothetical one).
          // Finding 4 fix — under `__lpNoClockFreeze` this `else` now ALSO covers what would have
          // been the inserted-hold-frame range (the `if` above no longer matches any frame in that
          // case), so it must divide by the INFLATED `nFrames`, never `_lpNFramesOriginal`, for `_tn`
          // to advance plainly and continuously straight through that span — the whole point of the
          // control. `_lpHoldCtl` is deliberately left `null` here too (never an explicit
          // `{inHold:false}`), so cpe_load_path.js's own fSec-based fallback — not an explicit "not in
          // the hold" signal — decides window membership every frame, including inside that span.
          var _lpDenom = (_lpFramesInserted > 0 && !window.__lpNoClockFreeze) ? _lpNFramesOriginal : nFrames;
          _tn = _lpDenom > 1 ? i / (_lpDenom - 1) : 0;
          if (_lpFramesInserted > 0 && !window.__lpNoClockFreeze) _lpHoldCtl = { inHold: false, elapsedSec: null };   // pre-hold frames, once a hold exists this bake
        }
        // ROUND 19 (2026-09-16, __lpNoClockFreeze regression: real HHS bake, load-path's own STACK
        // reveal stalled at 3/5 and VISIBLE onward never fired) — a SECOND, frame-index-only hold
        // signal, kept fully separate from `_lpHoldCtl` above: unlike `_lpHoldCtl` (left `null`
        // throughout under the control, by Finding 4's own design, so cpe_load_path.js falls back to
        // fSec-based window membership for the camera/clock-jump measurement), `_lpFrameHoldCtl` is
        // ALWAYS derived purely from the loop index `i` against `_lpHoldFrameStart`/`_lpFramesInserted`
        // — the frame-splice boundaries, which `__lpNoClockFreeze` never touches (Finding 4 left the
        // splice/insertion itself unconditional). Passed to loadPathApplyVisual as a NEW, 4th argument
        // so cpe_load_path.js can use it ONLY as its own internal reveal-pacing (STACK/VISIBLE/FRAMING/
        // .../arm+release cycle) fallback when `holdCtl` is falsy — never assigned into `_lpHoldCtl`
        // itself, so Finding 1's own A._loadPathHoldFrameActive/A._loadPathHudAlpha reads (both keyed
        // on `_lpHoldCtl` a few lines below, item 4b's FOCUS fade) are byte-identical, untouched.
        var _lpFrameHoldCtl = (!_frameRange && _lpFramesInserted > 0)
          ? ((i >= _lpHoldFrameStart && i < _lpHoldFrameStart + _lpFramesInserted)
              ? { inHold: true, elapsedSec: (i - _lpHoldFrameStart) / fps }
              : { inHold: false, elapsedSec: null })
          : null;
        // §129.61 FIX — the film-fraction assignment below was DROPPED by the merge. It is the film
        // fraction 40+ call sites below depend on, so every one of them would have thrown
        // ReferenceError on frame 0 and killed the bake. node --check cannot see an undeclared
        // read; W-ESC-4f ("_tnFilm is assigned exactly ONCE per frame") caught it — which is the
        // argument for pulling a peer's witness fixes BEFORE consolidating, not after.
        // It must be assigned here, above the pose ease, because the ease reads it.
        var _tnFilm = _tFilm(_tn);
        // §ESCAPE_ROUTE_REVEAL (merged) — their camera ease, on OUR `_tn`. Ours is the
        // hold-aware clock (§129.57 / the inserted freeze frames depend on it); theirs was the
        // plain i/(nFrames-1), which would have thrown the load-path freeze away. poseAt(_tn)
        // was exactly poseAtFilm(_tFilm(_tn)), so routing through poseAtFilm changes nothing
        // when the ease is off.
        var _poseFilmT = (_escapeRoute && A.escapeRouteEaseFilmT) ? A.escapeRouteEaseFilmT(plan, _tnFilm) : _tnFilm;
        var pose = poseAtFilm(_poseFilmT);  // tNorm hits 1.0 on the last frame so the pull-back completes
        var _gazeDist = Math.hypot(pose.tx - pose.x, pose.ty - pose.y, pose.tz - pose.z);
        // ══ §CAM_FACE_CLOCK (2026-09-20) — THE FACE RIDES THE SAME CLOCK AS THE BODY ═══════════
        // red1, twice: "the scene path seems to veer a bit off during the EscRoute. Check the
        // slowing down that time did not skew the cam face path." Then, after EASE_K was lowered:
        // "the path still veers."
        // MEASURED off the bake's own pose tap (`<out>_poses.json`, 81da0ca6, 846 frames — the bake
        // saying what it rendered, not a pixel): the camera's face ran up to 42.21° off the building
        // centre at frame 775, putting the look-at target 95.7 m off, and came back to 0.01° by
        // frame 833. Zero at both ends of the window, 42° in the middle — the building slides out of
        // frame and returns.
        // CAUSE: this line passed `_tn`, the RAW clock, while `pose` above came from `_poseFilmT`,
        // the EASED one. `_blendedGazeTarget` takes the yaw/pitch of poseAt(raw) and re-projects a
        // target from the eased POSITION — so the camera stood where the ease put it and faced where
        // it would have been looking had there been no ease. The closing orbit sweeps a full 360°
        // across this window, so a lead of k/4 of the window IS a facing error of k/4 × 360°:
        // 54° predicted at EASE_K=0.60 against 42° measured, and ~22° still left at 0.25. Lowering
        // the constant could only ever have divided the veer by 2.4; it could not remove it.
        // FIX: one clock. `_tFilm` is affine, so its inverse is exact, and with both ends on the
        // eased time the warp becomes a PURE REPARAMETRISATION — the camera runs the same curve
        // through space, faster then slower, and cannot leave it at any k. Pacing is untouched.
        // ⚠ This reverses W-ESC-4h ("_poseFilmT is handed to nothing but the pose"), which is what
        // held the two clocks apart. W-ESC-4i still holds the other side: the sun arc, the sun
        // compass, the day counter and the buildup cursor all still read the REAL film fraction.
        var _poseTn = (_clip && _clip.out > _clip.in) ? (_poseFilmT - _clip.in) / (_clip.out - _clip.in) : _poseFilmT;
        var _gazeB = _blendedGazeTarget(_poseTn, pose, _gazeDist);   // §57.5 — direction only, position untouched
        pose.tx = _gazeB.tx; pose.ty = _gazeB.ty; pose.tz = _gazeB.tz;
        var _stickNow = stickApproachAt(_tn);  // §CPE_STICK_APPROACH — null unless the path has sticks
        A.camera.position.set(pose.x, pose.y, pose.z);
        A.controls.target.set(pose.tx, pose.ty, pose.tz);
        A.controls.update();
        // §CLI_SILENT_BAKE item 4 — dev pose tap: undefined in every user session. A scripted
        // runner records the REAL pose each frame and asserts it numerically against the stored
        // path (a bake that runs but ignores the passed path is the silent failure this catches).
        if (typeof window.__maxqPoseTap === 'function')
          try { window.__maxqPoseTap(i, pose.x, pose.y, pose.z, pose.tx, pose.ty, pose.tz); } catch (ePT) {}
        if (A._updateCamLight) A._updateCamLight(pose.tx, pose.ty, pose.tz);
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
          // §CPE_CLIP_BUILDUP_FILM_T (2026-09-08, found by witness_slab_beat.js's cursor cross-check against the
          // 3 s Clash+Measure bake): this passed `nFrames / fps` — the CLIP's length once §CPE_CLIP has scaled
          // nFrames — so the §CPE_BUILDUP_ONSET_BLEND window read onsetU = min(0.5, 10/3.0) = 0.5 on a 3 s
          // clip and 10/195.8 on the full film: a clip laid the building on a different clock from the film
          // it claims to be a window of. Third instance of the same class (§CPE_CLIP_REVEAL_FILM_T,
          // §CPE_CLIP_SUN_ARC_FILM_T): a clip is fewer frames of the SAME film, so the blend reads the FULL
          // film's seconds. A full bake is unchanged (_filmSecFull === nFrames / fps when no clip is set).
          var _bkMs = _workCursorAt(_bkT, _bkState, _filmSecFull);
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
          _sunCompassMs = _bkMs;   // §SUN_COMPASS — see the hoisted call below
          var _ggO = _ghostGroundAt(_bkT, _filmSecFull, _bkState, _bkMs);   // §CPE_CLIP_BUILDUP_FILM_T — same class: the fade is in FILM seconds
          // ══ §CPE_BUILDUP_PLACED (MEP_CLASH_REVEAL_MOVIE.md §88.3/§88.6e) ═══════════════════════
          // The frame number lives HERE; what is actually on screen for a watched guid lives in the
          // Time Machine's traverse. This is the seam. Read every frame (so no state change is
          // missed between two §CPE_BUILDUP samples 60 frames apart) but LOG only on change — a
          // 4,699-frame Hospital bake costs a handful of lines, not 4,699 × |watch|.
          if (typeof window.tmWatchState === 'function') {
            var _bdNow = window.tmWatchState();
            if (_bdNow) {
              if (!A._bdSeenLast) A._bdSeenLast = {};
              for (var _bdG in _bdNow) {
                var _bdS = _bdNow[_bdG];
                var _bdK = _bdS.op + '|' + _bdS.mesh + '|' + _bdS.visible + '|' + _bdS.host + '|' + _bdS.y;
                if (A._bdSeenLast[_bdG] === _bdK) continue;
                A._bdSeenLast[_bdG] = _bdK;
                console.log('§CPE_BUILDUP_PLACED frame=' + i + '/' + nFrames + ' guid=' + _bdG +
                  ' cls=' + _bdS.cls + ' storey="' + _bdS.storey + '"' +
                  ' op=' + _bdS.op + ' mesh=' + _bdS.mesh + ' visible=' + _bdS.visible +
                  ' host=' + _bdS.host + ' y=' + _bdS.y +
                  ' groundY=' + (A.ground ? A.ground.position.y.toFixed(3) : 'n/a') +
                  (_ggO == null ? '' : ' groundOpacity=' + _ggO.toFixed(3)) +
                  (_bdS.mesh === 'MISSING' ? ' — scheduled, but NO mesh in the scene carries this guid'
                   : _bdS.visible ? ' — drawn' : ' — mesh exists, left hidden'));
              }
              if (!A._bdEverDrawn) A._bdEverDrawn = {};
              for (var _bdG2 in _bdNow) if (_bdNow[_bdG2].visible) A._bdEverDrawn[_bdG2] = i;
              // §88.5's "what DONE looks like": one line a grep can settle the question on.
              if (i === nFrames - 1) {
                var _bdAll = Object.keys(_bdNow), _bdNever = [];
                for (var _bdI = 0; _bdI < _bdAll.length; _bdI++)
                  if (A._bdEverDrawn[_bdAll[_bdI]] === undefined)
                    _bdNever.push(_bdAll[_bdI] + '(' + _bdNow[_bdAll[_bdI]].storey + ',' + _bdNow[_bdAll[_bdI]].mesh + ')');
                console.log('§CPE_BUILDUP_PLACED_SUMMARY watched=' + _bdAll.length +
                  ' drawn=' + (_bdAll.length - _bdNever.length) +
                  ' neverDrawn=' + (_bdNever.length ? '[' + _bdNever.join(' ') + ']' : 'none'));
              }
            }
          }
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
        // §SUN_COMPASS — HOISTED OUT OF THE BUILDUP BLOCK ON PURPOSE (fixed 2026-09-19).
        // ⚠ This call used to sit inside `if (_buildup && _bkState)`, next to the day counter,
        // because it reads the same `_bkMs`. That was wrong and it failed SILENTLY: a film baked
        // with the buildup off never called it, so `A.sunCompassInfo()` stayed null, `_captureFrame`
        // composited nothing, and the sun ray never moved — while `§SUN_COMPASS built` still printed
        // at arm time and every witness still passed. Found by looking at a real baked frame
        // (Hospital, buildup=0): the log said the rose was built and the picture had no overlay on
        // it. The wiring witnesses could not catch it because they call sunCompassAt directly.
        // ⚠ §6 IS STILL KEPT. There is no second date source: `_sunCompassMs` is `_bkMs` when the
        // buildup is driving, and NULL otherwise — because without a buildup cinema_maxq never
        // populates `_bkState`, so no 4D cursor exists to read. The module draws the rose and
        // suppresses the sun in that case rather than inventing a date; see §SUN_COMPASS_NO_CURSOR.
        // ⚠ THE FILM FRACTION IS A SECOND INPUT, not decoration. The compass sweeps the solar hour
        // from morning to late afternoon across the film (§SUN_ONE film clock) so the sun arcs
        // over the building the way the old scripted 55°→6° did — except real. `_tFilm(_tn)` and
        // not `_tn`, for the reason §CPE_CLIP_REVEAL_FILM_T names: a clip is fewer frames of the
        // SAME film, so a clipped bake must light its frames at the hours that stretch of film
        // really has, not replay a whole day inside a 23-frame window.
        if (A._sunCompassOn && A.sunCompassAt) {
          try { A.sunCompassAt(_sunCompassMs, _tFilm(_tn)); }
          catch (eSCA) { if (!A._sunCompassAtWarned) { A._sunCompassAtWarned = true;
            console.warn('§SUN_COMPASS_AT failed frame=' + i + ': ' + (eSCA && eSCA.message)); } }
        }
        // §CPE_DISCIPLINE_REVEAL Mechanism C — pure function of (plan, tNorm), same call the preview
        // loop makes (cinema_path_editor.js's _previewFly) so bake and preview cannot diverge. No-op
        // (returns immediately, does nothing) when reveal is off or tNorm is outside the round.
        // §CPE_CLIP_REVEAL_FILM_T (2026-09-04, found by §SDC's clipped bake — PHOTOREAL_STILL_RENDER.md
        // §BME.8): the Reveal, its lights-off phase and its caption are functions of the FILM's
        // fraction, and a clip is fewer frames of the SAME film (§CPE_CLIP). Feeding them the clip-
        // local _tn played the whole Reveal round inside a 23-frame window. A full bake is unchanged
        // (_tFilm(_tn) === _tn when no clip is set).
        // (_tnFilm is computed at the top of this iteration — see §ESCAPE_ROUTE_CAMERA_EASE there.)
        if (A.cpeRevealApplyVisual) A.cpeRevealApplyVisual(plan, _tnFilm);
        if (A.cpeArchFadeApplyVisual) A.cpeArchFadeApplyVisual(plan, _tnFilm);   // §57.4-REAL-FADE
        // §STOREY_HIGHLIGHT_REVEAL — the storey tint, windowed to the LAST 5s of `pullback` (ending
        // at plan.beats.rise, the orbit's own start — NOT the orbit beat itself). Pure function of
        // (plan, tNorm), null outside that narrow window by construction, so this can never fire
        // inside the disc-reveal round's own tail above. Same "one pure function, two callers" call
        // cinema_path_editor.js's preview step() makes.
        // §116 (user, 2026-09-13): "Better just hide them all at pull out or last stick as not really
        // needed." The per-storey light gate (§115) capped the SELECTION but the fixtures were still
        // reading as clutter on frames, so the ruling is simpler and absolute: from the LAST STICK
        // (beats.out — where the walk ends and the pull-out begins) to the end of the film, the
        // interior fixtures are OFF. By that point the camera is outside and climbing away; their
        // only contribution is glow in rooms nobody is looking into.
        // §118 — TWO separate facts, deliberately. `_ilPastStick` is WHEN THE WITNESS CHECKS (are we
        // past the last stick?); `_interiorLightsOff` is WHETHER THE GATE IS APPLIED. Tying the
        // witness to the gate flag would make the falsifiability control silence the very check it
        // exists to trip, and a check that switches itself off with the fix is not a check.
        A._ilPastStick = !!(plan && plan.beats && _tnFilm >= plan.beats.out);
        // §129.41 (2026-09-19, red1: "restore back night lighting only after storey build so when
        // dusk or dark its windows are lighted") — §116's ruling is NARROWED, not undone. It said
        // the fixtures are off "from the last stick to the END of the film", and its reason was
        // that they read as clutter while the camera is outside and climbing away. That reason
        // stops holding once the building tops out: from there the film is a closing orbit around a
        // FINISHED building, and the sun this lane now drives is genuinely setting (§SUN_ONE on the
        // HHS bake of this date: elevation 34.7 deg at tNorm 0 down to 1.4 deg at tNorm 1). A dark
        // building at dusk is not restraint, it is an unlit model.
        // So the off-window is now [beats.out, topoutU) instead of [beats.out, end]. `topoutU` is
        // NOT a new number: it is _buildupTopoutU's own, the same fraction the buildup already
        // completes at and the same one §CPE_BUILDUP_TOPOUT prints. Nothing before the last stick
        // changes, which is the part of §116 that was never in question.
        // §129.47 (2026-09-19, red1 on the Hospital film: "Lighting did not cease during Storeys
        // reveal. It can only resume after all storeys returned.") — §129.41 tied the relight to
        // _buildupTopoutU, and that is the WRONG CLOCK when the reveal round is on. MEASURED on
        // Hospital: §INTERIOR_LIGHTS_BOUNDARY lastStickFrac=0.3530 topoutFrac=0.3607
        // src=plan.beats.pullout — an off-window 0.77% of the film wide. The fixtures came back at
        // 36% and stayed on for the remaining 64%, which is the whole reveal round AND the whole
        // storey reveal. With the reveal round OFF, topout is the orbit boundary and §129.41 looked
        // right; with it on, topout moves to the pull-out and the window collapses.
        // The relight point is now the ORBIT START (plan.beats.rise), which is where the storey
        // reveal's own window ends — cpe_storey_reveal.js windows itself to the last seconds of the
        // pull-back "ending at plan.beats.rise, the orbit's own start". So the lights come back when
        // the storeys have returned and the camera is circling the finished building, which is
        // exactly red1's rule, and it no longer depends on where the buildup happens to complete.
        var _ilTopU = (plan && plan.beats && typeof plan.beats.rise === 'number')
          ? plan.beats.rise
          : ((plan && plan.beats) ? _buildupTopoutU(plan).u : null);
        var _ilTop = (_ilTopU != null) ? { u: _ilTopU, src: (plan && plan.beats && typeof plan.beats.rise === 'number') ? 'plan.beats.rise (orbit start = storey reveal end)' : 'topoutU-fallback' } : null;
        A._ilPastTopout = !!(_ilTop && _tnFilm >= _ilTop.u);
        if (plan && plan.beats && !A._ilBoundaryLogged) {
          A._ilBoundaryLogged = true;
          console.log('§INTERIOR_LIGHTS_BOUNDARY lastStickFrac=' + plan.beats.out.toFixed(4) +
            ' relightFrac=' + (_ilTop ? _ilTop.u.toFixed(4) : 'n/a') + ' src=' + (_ilTop ? _ilTop.src : 'n/a') +
            ' offWindowPctOfFilm=' + (_ilTop ? (100 * (_ilTop.u - plan.beats.out)).toFixed(1) : 'n/a') + '%' +
            ' (§129.41 — fixtures ON before the last stick, OFF through the pull-out while the' +
            ' building is still rising, and ON AGAIN from topout to the end so the windows are lit' +
            ' at dusk; a bake clipped entirely below the first boundary must show no' +
            ' §INTERIOR_LIGHTS_OFF line at all)');
        }
        // Two controls, both falsifiable: __ilForceOn defeats the gate outright (§118's own), and
        // __ilNoRelight restores §116's original "off to the end" so the relight can be proved to be
        // the thing that lit the windows, rather than assumed.
        A._interiorLightsOff = A._ilPastStick &&
          !(A._ilPastTopout && !(typeof window !== 'undefined' && window.__ilNoRelight)) &&
          !(typeof window !== 'undefined' && window.__ilForceOn);
        // §117's witness runs just before capture (search §INTERIOR_LIGHTS_WITNESS), not here:
        // sampled at this point it would read the PREVIOUS frame's lighting and report a phantom
        // FAIL on the first gated frame. Measured — that is exactly what the first version did.
        if (A.storeyRevealApplyVisual) A.storeyRevealApplyVisual(plan, _tnFilm);
        // §STOREY_SECTION_CUT — NOT key-gated like ApplyVisual above: the plane constant moves
        // every frame, so it cannot ride the slot key (§94.3).
        if (A.storeyRevealApplyCut) A.storeyRevealApplyCut(plan, _tnFilm);
        // §129.1/§129.6 item 1 LOAD PATH — arms/holds/restores itself off `_lpHoldCtl` (new,
        // explicit) when this bake armed a hold, else falls back to its own tNorm*filmSecFull
        // self-determination (old behaviour, exactly reproduced under __lpNoClockFreeze).
        // A._loadPathHoldFrameActive is item 8's own FOCUS flag — read by _drawUnlessHold above.
        A._loadPathHoldFrameActive = !!(_lpHoldCtl && _lpHoldCtl.inHold);
        // §129.8 item 4b (amendment, 2026-09-16) — the GLOBAL HUD alpha every _drawUnlessHold call
        // reads: 1 outside the hold; a fade curve (never a hard cut) across the hold's own edges —
        // see _hudFadeT below. window.__lpHudNoFade=1 forces the hard-cut shape the control's own
        // §LOADPATH_HUD_FADE FAIL depends on.
        // §129.27 (2026-09-18, red1 — see this file's own `_hudFadeT` comment above for the full
        // history) — HUD alpha is back to its own dedicated formula, decoupled from backdrop/cut
        // (which are instant now, nothing left to share a curve with). Front-loaded: ramps out over
        // the first `fadeSec` of `elapsed` after arm, back in over the LAST `fadeSec` of the hold's
        // own known `durSec` — finishing at alpha=1 exactly at release, before the building's cut.
        if (A._loadPathWindow && A._loadPathWindow.durSec > 0) {
          var _hudInWindow = !!(_lpHoldCtl && _lpHoldCtl.inHold);
          if (window.__lpHudNoFade) {
            A._loadPathHudAlpha = _hudInWindow ? 0 : 1;
          } else {
            var _hudElapsed = _lpHoldCtl ? _lpHoldCtl.elapsedSec : null;
            var _hudFadeSecNow = A._loadPathFadeSecFor(A._loadPathWindow.durSec);
            A._loadPathHudAlpha = 1 - _hudFadeT(_hudElapsed, _hudInWindow, A._loadPathWindow.durSec, _hudFadeSecNow);
          }
          // ROUND 12 item 2 (2026-09-16, real HHS bake: §LOADPATH_HUD_FADE never printed) —
          // A.loadPathDispose() (called right after the frame loop, BEFORE the end-of-bake summary
          // prints) nulls A._loadPathWindow, so the end-of-bake witness's own `A._loadPathWindow.
          // durSec > 0` guard always failed silently. Snapshot the real hold's own durSec here, every
          // hold frame (cheap, idempotent), so the witness reads THIS instead of the (by then
          // cleared) live window.
          _lpLastHoldDurSec = A._loadPathWindow.durSec;
        } else {
          A._loadPathHudAlpha = 1;
        }
        if (_loadPath && A.loadPathApplyVisual) A.loadPathApplyVisual(plan, _tnFilm, _lpHoldCtl, _lpFrameHoldCtl);
        // §129.6 item 1 — per-frame camera-step log + resume-frame detection for §LOADPATH_RESUME,
        // tracked every frame this beat is active regardless of __lpNoClockFreeze (the witness must
        // work whether the fix is on or the control is reproducing the old bug). Read AFTER the
        // call above so armPose's own re-assert (or its release) has already applied for this frame.
        if (_loadPath && A.camera) {
          var _lpCurCamPos = { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z };
          var _lpStep = _lpPrevCamPos ? Math.hypot(_lpCurCamPos.x - _lpPrevCamPos.x,
            _lpCurCamPos.y - _lpPrevCamPos.y, _lpCurCamPos.z - _lpPrevCamPos.z) : 0;
          _lpCamSteps[i] = _lpStep;
          _lpPrevCamPos = _lpCurCamPos;
          var _lpRestoreCount = A._loadPathRestoreCount || 0;
          if (_lpRestoreCount > _lpPrevRestoreCount) { _lpResumeAtIndex = i; }
          _lpPrevRestoreCount = _lpRestoreCount;
        }
        // §129.2 LEDGER TICKER — per-frame: paints the count-up against its own build-time window,
        // never re-verifies (same no-op-outside-window contract as its neighbours).
        if (_ledger && A.ledgerTickerApplyVisual) A.ledgerTickerApplyVisual(plan, _tnFilm);
        // §ESCAPE_ROUTE_REVEAL — the room shine-through, the scoped x-ray and the overlay-
        // suppression flag (§2 item 7), all on the REAL film fraction. Same "one pure-ish function,
        // two callers" contract as the storey reveal directly above. With the flag off it is never
        // called at all; the forced restore on every bake exit path below is what guarantees the
        // x-ray and the room meshes can never be left engaged.
        if (_escapeRoute && A.escapeRouteApplyVisual) A.escapeRouteApplyVisual(plan, _tnFilm);
        // §FLYTHRU_DATUM — the 3D half: the grid and level rules fade on the same schedule the 2D
        // annotation uses, and depth-test normally so the rising build occludes them (§17.5).
        if (_measure && A.flythruDatumAt) {
          try { A.flythruDatumAt(_tnFilm * _filmSecFull, _filmSecFull); }
          catch (eFDA) { if (!A._flythruDatumAtWarned) { A._flythruDatumAtWarned = true; console.warn('§FLYTHRU_DATUM_AT failed frame=' + i + ': ' + (eFDA && eFDA.message)); } }
        }
        // §SLAB_BEAT — envelope + label lifetime, same film clock as the datum above.
        if (_measure && A.slabBeatAt) {
          // §SLAB_LABEL_STALE — asked BEFORE the beat's own update, so a frame in the closing
          // movement never re-posts the build-up's slab figures. See cpe_slab_beat.js for why the
          // bound is §FINDINGS_HUD_CLEAR and not a new clock.
          try { if (A.slabBeatLabelStaleCheck) A.slabBeatLabelStaleCheck(_tnFilm * _filmSecFull); } catch (eSS) {}
          try { A.slabBeatAt(_tnFilm * _filmSecFull); }
          catch (eSBA) { if (!A._slabBeatAtWarned) { A._slabBeatAtWarned = true; console.warn('§SLAB_BEAT_AT failed frame=' + i + ': ' + (eSBA && eSBA.message)); } }
        }
        // §129 FIX 4 (2026-09-17, root cause of "not a single change is evident" after every whiten/
        // backdrop/cap fix landed) — `indoorHallTint`, a floor-decal annotation this beat's own
        // classification never sees (no guid, `excludeFromAO` — its own comment: "annotation, not a
        // surface"), was found via raycast+visibility-chain diagnosis rendering the exact persistent
        // colour red1 kept reporting. It becomes visible and opaque partway through a beat driven
        // purely by `_tnFilm` — which the load-path hold FREEZES at a constant value — so it settles
        // at one non-zero opacity and calls this EVERY hold frame recomputing that SAME value, AFTER
        // `loadPathApplyVisual`'s own backdrop fade already ran this frame (call order above) — the
        // last write each frame is always this one, winning every single time regardless of what the
        // backdrop fade just set. Skipping the call outright during the hold (never touching its
        // internal state, no risk of leaving it mid-animation — `_tnFilm` is frozen anyway, so a
        // skipped frame is not a lost frame of real motion) lets the backdrop's own top-up/fade be
        // the last word once it discovers this newly-visible mesh.
        if (_measure && A.indoorBeatsAt && !A._loadPathHoldFrameActive) {
          try { A.indoorBeatsAt(_tnFilm * _filmSecFull); }
          catch (eIBA) { if (!A._indoorBeatsAtWarned) { A._indoorBeatsAtWarned = true; console.warn('§INDOOR_BEAT_AT failed frame=' + i + ': ' + (eIBA && eIBA.message)); } }
        }
        if (A.flythruCuesApplyVisual) {
          try { A._flythruFilmSec = _tnFilm * _filmSecFull; A.flythruCuesApplyVisual(A._flythruFilmSec); }
          catch (eFV) { if (!A._flythruCueWarned) { A._flythruCueWarned = true; console.warn('§FLYTHRU_CUE_VISUAL failed frame=' + i + ': ' + (eFV && eFV.message)); } }
        }
        // §CLASH_FILM_P1 (§4) — the pulse is a pure function of FILM seconds, never
        // performance.now(), so a 15 fps and a 24 fps bake of the same film pulse identically and a
        // re-bake is reproducible. Per-instance, so phase 2 can hold a labelled pair solid while the
        // rest keep breathing (§4b). No TM predicate here: the markers are a forecast (§3b).
        // §CLASH_FILM_P2 — the label selector runs BEFORE clashFilm.update so the fade it writes
        // (labelled → solid) lands in THIS frame's marker colours. Proximity + hysteresis + screen-
        // space placement only; it reads the camera and never moves it (ruling 3). The record is
        // handed to _captureFrame below, which draws it in the 2D pass (§P2.2).
        _lblInfo = null;
        // §CLASH_LABELS_STOP_AT_DISC_STATS (2026-09-06, user: "the lingering clash pair pop ups have to
        // end during DISCs stats"). The per-pair [tol/clash mm] pop-ups belong to the FIRST pass, where
        // the camera is close and each label names the pair under the lens. From beats.reveal onward
        // the film is telling a different story — whole SETS of clashes lit by trade, with the count in
        // the HUD — and individual pop-ups compete with the very stats they are meant to support.
        // Cut them at beats.reveal (the parade start), once, and reset so no placed label lingers.
        // DEGRADE, DON'T DISABLE: a plan with no usable reveal beat keeps the old always-on behaviour.
        var _lblStop = (plan && plan.beats && plan.beats.reveal > 0 && plan.beats.reveal < 1)
          ? plan.beats.reveal : null;
        if (_lblStop != null && _tnFilm >= _lblStop) {
          if (!A._clashLblStopped) {
            A._clashLblStopped = true;
            if (A.clashLabels && A.clashLabels.reset) try { A.clashLabels.reset(); } catch (eCLx) {}
            console.log('§CLASH_LABELS_STOP frame=' + i + ' tn=' + _tnFilm.toFixed(4) +
              ' — per-pair pop-ups end here; the disc stats own the screen from the parade on');
          }
        } else if (_clash && A.clashLabels && A.clashLabels.update) {
          try { _lblInfo = A.clashLabels.update(A.camera, _tnFilm * _filmSecFull, w, h, i); }
          catch (eCL) { if (!A._clashLblErrLogged) { A._clashLblErrLogged = true;
            console.warn('§CLASH_LABELS_ERR update: ' + eCL.message + ' — labels skipped, frames continue'); } }
        }
        // §CLASH_FILM_SKY_WASH: the camera goes with it — update() clamps each marker to a constant
        // small SCREEN size from this frame's distance. Guarded: a marker fault must not kill the
        // bake, and the finally's dispose (below) covers the case where it does throw.
        if (_clash && A.clashFilm && A.clashFilm.update) {
          try { A.clashFilm.update(_tnFilm * _filmSecFull, A.camera); }
          catch (eCFu) { if (!A._clashFilmUpdateWarned) { A._clashFilmUpdateWarned = true; console.warn('§CLASH_FILM_UPDATE failed frame=' + i + ': ' + (eCFu && eCFu.message) + ' — markers frozen for the rest of the bake'); } }
        }
        // §CPE_TAIL_LIGHTS_ALL_ONLY (2026-09-04, user: "during last part each DISCipline reveal, the
        // lights are all turned ON that obscures the delicate items scene. Should turn on only during
        // ALL DISCs"). Set BEFORE _applyPhotoStaging runs for this frame — staging is what turns the
        // night lights on and rebuilds the glow, so the flag has to be in place when it does, not
        // after. The answer comes from effects.js's own pure phase function, never re-derived here:
        // the bake, the editor preview and the witness all read the same one.
        A._cpeRevealLightsOff = A.cpeRevealLightsOffAt ? A.cpeRevealLightsOffAt(plan, _tnFilm) : false;
        if (A._cpeRevealLightsOff !== A._cpeRevealLightsOffLast) {
          A._cpeRevealLightsOffLast = A._cpeRevealLightsOff;
          console.log('§CPE_TAIL_LIGHTS_ALL_ONLY frame=' + i + '/' + nFrames + ' lights=' +
            (A._cpeRevealLightsOff ? 'OFF (one-discipline slot — the trade reads on its own)'
                                   : 'ON (not a one-discipline slot)'));
        }
        // §DATUM_DECOUPLE — no real render happens in this mode (§53), so there is no fold to
        // converge: starting it would just accumulate against a canvas nothing ever reads, and
        // §IDLE_GATE's general idle-parking (which normally sees per-frame _composer.render() calls
        // as activity) stalls it forever — MEASURED, first burn-in attempt hung 0 frames/580s+.
        if (!A._burninDatumDir) A.startStillRefine();
        // §SUN_ARC_STOMP_FIX (found live, 2026-08-11 — user report "not high noon" on a real
        // HHS_Office_Federated bake): startStillRefine() calls _applyPhotoStaging() synchronously,
        // which unconditionally re-runs A.updateSky(PHOTO_SUN_ELEVATION, ...) — the FIXED dusk
        // value — every frame (staging is torn down and rebuilt every frame, not once per bake).
        // Calling _sunArcStep() before startStillRefine() (as originally shipped in #1284) meant
        // every frame's noon-to-dusk elevation got immediately overwritten back to the static dusk
        // angle before the frame was ever captured — the arc never reached the output at all, only
        // ever the ORIGINAL fixed 6°. Moving the call to AFTER startStillRefine() re-asserts the
        // correct per-frame elevation once the staging reset has already happened.
        // §CPE_CLIP_SUN_ARC_FILM_T (2026-09-05, found in the §CLASH_FILM demo clip's own log): the arc
        // was fed the CLIP-LOCAL _tn, so a --clip bake swept the full 55°→6° arc inside its own
        // frames wherever the clip sat in the film (measured: elevation 55.0→6.0 across a 206-frame
        // clip at film 0.66–0.73). Same bug class §CPE_CLIP_REVEAL_FILM_T fixed for the Reveal above:
        // a clip is fewer frames of the SAME film, so the sun reads the film fraction. A full bake is
        // unchanged (_tFilm(_tn) === _tn when no clip is set).
        // §SUN_ARC_TOPOUT_SNAP REVERTED (2026-09-06): the sun reads the film fraction alone — the linear
        // 55°→6° arc is the film's own dusk. _revealU still drives the Reveal round and the fill pin below.
        if (A._sunArcStep) A._sunArcStep(_tnFilm);
        // §SUN_ARC_FILL / §BAKE_FILL_PIN (2026-09-05, effects.js, witness_sun_arc_fill.js): the interior
        // fill — ambient, hemi, fixture point-light scale/budget — is PINNED to the Alt+S baseline on
        // every frame, whatever the arc above just did to the sun (user ruling: "letting alt-s normal,
        // and sunlite is brighter"). Runs AFTER _sunArcStep and AFTER startStillRefine, so it is the
        // last word on the fill before this frame's capture. Bake-only by this gate; sun position/
        // intensity/shadow are not touched by it. Fed _tnFilm, same §CPE_CLIP_SUN_ARC_FILM_T reason —
        // its elevation fallback/log label must read the film fraction under a --clip bake too.
        // §PL_TOPOUT_UNPIN — _revealU exactly as _sunArcStep gets it: past topout the fixtures ease to their
        // tuned night intensity; before it (or with no plan beats) the pin is byte-identical to before.
        if (A._maxqActive && A._sunArcFillPin) A._sunArcFillPin(_tnFilm, _revealU);
        var ok = A._burninDatumDir ? true : await _waitFoldDone(30000, 'cook of frame ' + i + '/' + nFrames);
        if (!A._burninDatumDir) await _raf2('frame ' + i + ' capture');
        // §SHADOW_FRONTIER_AT_CAPTURE (2026-08-12) — the real answer, checked at the real moment:
        // does the actively-installing (frontier) geometry have castShadow=true right now, right
        // before this exact frame gets saved? Only logs when there's something under construction
        // to check (self-throttling). window.__tmFrontierGuidsNow is set by time_machine.js's own
        // renderAtTime(), the same tick that just ran inside _raf2() above.
        if (window.__tmFrontierGuidsNow && window.__tmFrontierGuidsNow.size > 0) {
          var _fGuids = window.__tmFrontierGuidsNow;
          var _fTrue = 0, _fFalse = 0, _fMatched = 0;
          var _fBatchTrue = 0, _fBatchFalse = 0, _fBatchObjs = 0;
          // §MAXQ_STAGE_KEEP / R1 (CPE_4D_PERF_MEM_FINDINGS.md §2c): the answer this check gives is
          // unchanged, but a full scene.traverse with a linear _batchMeta/_instanceMeta scan per
          // batched object ran EVERY captured frame. Index guid→object ONCE per _metaGen (the same
          // staleness key TM's own event index uses — streaming/re-stream bumps it, sprite churn
          // does not), then answer each frame from the frontier set alone (O(frontier), not
          // O(scene×slots)). Counting semantics preserved exactly: individual meshes tally per
          // MESH; a batched/instanced object tallies ONCE if ANY of its slots is frontier — the
          // same batch-wide-castShadow caveat as before (see the retained comment below).
          // Steel beams/columns (isSteel, time_machine.js) are the most likely frontier class
          // to be batched/instanced, not individually meshed -- castShadow there is a BATCH-wide
          // flag (shared by every slot in that object, frontier or not), so this reports the
          // batch's own flag whenever ANY of its slots is currently a frontier guid, not a
          // per-instance answer -- the finest-grained truth this rendering architecture allows.
          if (!_fcIdx || _fcIdx.gen !== A._metaGen) {
            var _fcT0 = performance.now();
            _fcIdx = { gen: A._metaGen, mesh: new Map(), group: new Map() };
            A.scene.traverse(function(o) {
              // Same branch precedence as the traverse this replaces: an isMesh with its own
              // userData.guid answers as an individual mesh first (BatchedMesh/InstancedMesh
              // included, matching the original's first-branch test); its slot guids still
              // register below so the batch answer exists for OTHER frontier slots.
              if (o.isMesh && o.userData && o.userData.guid) {
                var _ml = _fcIdx.mesh.get(o.userData.guid);
                if (_ml) _ml.push(o); else _fcIdx.mesh.set(o.userData.guid, [o]);
              }
              if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
                var _bm = A._batchMeta[o.id];
                for (var _bi = 0; _bi < _bm.length; _bi++)
                  if (!_fcIdx.group.has(_bm[_bi].guid)) _fcIdx.group.set(_bm[_bi].guid, o);
              } else if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
                var _im = A._instanceMeta[o.id];
                for (var _ii = 0; _ii < _im.length; _ii++)
                  if (!_fcIdx.group.has(_im[_ii].guid)) _fcIdx.group.set(_im[_ii].guid, o);
              }
            });
            console.log('§SHADOW_FRONTIER_IDX built gen=' + _fcIdx.gen + ' meshGuids=' + _fcIdx.mesh.size +
              ' groupGuids=' + _fcIdx.group.size + ' ms=' + (performance.now() - _fcT0).toFixed(1));
          }
          var _fSeenGroups = new Set();
          // §VAC / §R14.1 (CPE_4D_PERF_MEM_STUDY.md): _fUnmatched counts the third outcome this
          // forEach always had and never reported — a frontier guid present in NEITHER index.
          // Without it, "frontierGuids=10 batchObjsContainingFrontier=4" cannot distinguish six
          // guids DEDUPED into already-seen batch objects from six guids the indexes never had
          // (the streamed set is 63,182 guids; TM places 63,417 — a 235-guid gap that nothing on
          // disk can currently attribute). This is a counter on an existing else-branch, not a
          // new measurement.
          var _fUnmatched = 0;
          _fGuids.forEach(function(g) {
            var _ml = _fcIdx.mesh.get(g);
            if (_ml) { for (var _mi = 0; _mi < _ml.length; _mi++) { _fMatched++; if (_ml[_mi].castShadow) _fTrue++; else _fFalse++; } return; }
            var _go = _fcIdx.group.get(g);
            if (_go) { if (!_fSeenGroups.has(_go)) { _fSeenGroups.add(_go); _fBatchObjs++; if (_go.castShadow) _fBatchTrue++; else _fBatchFalse++; } return; }
            _fUnmatched++;
          });
          // §VAC V1 — the singleMesh_* triplet is VACUOUS whenever the single-mesh index is empty,
          // and on a device that took the fast batched path it always is. MEASURED, s5_hospital.log
          // (2,027 frames): §SHADOW_FRONTIER_IDX meshGuids=0 groupGuids=63182, §BATCHED_FAIL count 0,
          // §RENDERER_CAPS multi_draw=on — so all three streaming.js fallbacks that give a lone
          // THREE.Mesh a userData.guid (BatchedMesh ctor throw / BatchedMesh unavailable / oversized
          // spill) were never taken. The matcher is NOT broken: it is a Map.get against a Map of
          // size 0. Printing three bare zeros made 286 firings look like a judged result; they were
          // never a result. The batch half of the line IS judging (batchObjsContainingFrontier was
          // non-zero on every one of those 286 firings) and is printed unchanged.
          var _fSingle = (_fcIdx.mesh.size === 0)
            ? 'singleMesh=VACUOUS (no individually-meshed elements in this scene — §SHADOW_FRONTIER_IDX meshGuids=0; all geometry is batched/instanced)'
            : 'singleMesh_matched=' + _fMatched + ' castShadowTrue=' + _fTrue + ' castShadowFalse=' + _fFalse;
          console.log('§SHADOW_FRONTIER_AT_CAPTURE frame=' + i + ' frontierGuids=' + _fGuids.size +
            ' ' + _fSingle +
            ' batchObjsContainingFrontier=' + _fBatchObjs + ' batchCastShadowTrue=' + _fBatchTrue + ' batchCastShadowFalse=' + _fBatchFalse +
            ' unmatched=' + _fUnmatched +
            ((_fcIdx.mesh.size === 0 && _fBatchObjs === 0) ? ' VERDICT=INCONCLUSIVE (nothing judged this frame)' : ''));
        }
        _restoreRandom();
        // A timeout can now only mean a genuinely slow frame, since hidden time no longer counts
        // against the budget. Counted rather than merely warned: the total is what lets the run
        // state its own health at the end instead of leaving a degraded film to look identical to
        // a good one.
        if (!ok) { _unconverged++; console.warn('§MAXQ_FRAME_TIMEOUT i=' + i + ' — capturing as-is (UNCONVERGED, count=' + _unconverged + ')'); }
        // §CPE_DISCIPLINE_REVEAL_PULLOUT: the tail's disc-parade caption REPLACES the room title for
        // exactly its slots ('tail-one'/'tail-all') — pure function of (plan, tNorm), checked FIRST so
        // it can override; returns null everywhere else (round 1, pull-out, round 2, rise proper), in
        // which case the normal room-title lookup below runs untouched. Same call the preview tick
        // makes (cpe_room_title.js's roomTitleLiveTick) so bake and preview cannot diverge.
        // §40.1 — each source is asked EXACTLY ONCE and kept separately, then two things are built
        // from the same answers: `_statusSrc` (the four fixed §STATUS_BOX rows) and `_titleInfo`
        // (the old single-winner caption, still needed for the DOM status line below and for the
        // fallback path when cpe_film_boxes.js failed to load). Asking twice would double-log
        // §FLYTHRU_CUE_ON and §STOREY_REVEAL_TIMING.
        var _srReveal = (A.cpeRevealCaptionAt) ? A.cpeRevealCaptionAt(plan, _tnFilm) : null;
        var _srStorey = (A.storeyRevealCaptionAt) ? A.storeyRevealCaptionAt(plan, _tnFilm) : null;
        var _srRoom = (_titleSegs && A.roomTitleOpacityAt) ? A.roomTitleOpacityAt(_titleSegs, i / fps) : null;
        // §FLYTHRU_CUES caption — it used to ride the ROOM-TITLE renderer. §40.1 moves it to the
        // Measure box (cpe_flythru_cues.js posts it there); it is asked here only so the DOM status
        // line and the no-boxes fallback keep the behaviour they had.
        var _srCue = null;
        if (A.flythruCueCaptionAt) { try { _srCue = A.flythruCueCaptionAt(_tnFilm * _filmSecFull); } catch (eFCap) {} }
        // the frontier phase was smuggled into the room caption as " [phase]" by roomTitleFinalText,
        // which is what made that plate resize mid-shot. It gets its own fixed row now.
        // §STOREY_INFO_NOT_IN_HUB (2026-09-10, user: "the storey by storey info should not be in
        // the HUB but in that extra right bottom side info panel consistent with other measures") —
        // _srStorey is still computed above (keeps its own §STOREY_REVEAL_TIMING logging alive) but
        // deliberately excluded from both the STATUS_BOX's four fixed rows and the single-winner
        // caption fallback. storeyRevealStatCardAt's own card.label already carries the storey name
        // ('doors · ' + vis.storey) through the SAME bottom-right bigStats panel every other measure
        // card uses (§CPE_HUD_ORDER) — that is now the ONLY place storey info appears on screen.
        // §75 (2026-09-12, user: "Just the storey sub title is blank, take it from the long
        // truncating line"). The Room row was carrying the storey AND the rooms in one line —
        // "Level 1 ≈ Hall/Corridor 1, ≈ Hall/Corridor 2, Level 4 ≈ Hall/Corridor 4" — which
        // truncated, while the Storey row beside it sat empty. cpe_room_title.js now hands back the
        // two halves separately (split where the line is COMPOSED, never by re-parsing it), so each
        // row shows its own part and the room line is roughly half as long.
        var _srStoreyRow = (_srRoom && _srRoom.storeyName)
          ? { name: _srRoom.storeyName, opacity: _srRoom.opacity } : _srStorey;
        var _srRoomRow = (_srRoom && _srRoom.roomName)
          ? { name: _srRoom.roomName, opacity: _srRoom.opacity } : _srRoom;
        var _erCapRow = (_escRec && A.escapeRouteCaptionAt) ? A.escapeRouteCaptionAt(plan, _tnFilm) : null;
        // §STATUS_BOX owns the captions in a bake, so the escape caption goes in the Reveal row —
        // during its window the escape route IS the reveal, and it outranks the storey reveal for
        // the same reason it outranks it in the _titleInfo chain below. Without this the caption
        // would simply vanish with the duplicated lower-third bar deleted above.
        var _statusSrc = { storey: _srStoreyRow, room: _srRoomRow, buildup: A.tmFrontierPhase || '',
                           reveal: _erCapRow || _srReveal };
        // §ESCAPE_ROUTE_REVEAL (merged) — the escape caption OUTRANKS reveal/storey while its
        // window is open, which is the precedence their own chain had. Everything else keeps
        // ours: _srReveal/_srCue/_srRoom and the _statusSrc rows above are untouched.
        // §75 HALF-APPLIED (found 2026-09-20). §75 split the room title into its two halves and
        // wired the split into the STATUS BOX above — then left this chain reading `_srRoom`, the
        // pre-§75 COMBINED string. Evidence, from clip_1127.log and its frames: the status box got
        // Storey="Level 4, Level 1" Room="≈ Hall/Corridor 2, …" while the caption read
        // "Level 1 ≈ Hall/Corridor 4, ≈ Hall/Corridor 5 +3" — storey and rooms glued together,
        // exactly the format §75 retired, running off the right edge at 854 px.
        var _titleInfo = _erCapRow || _srReveal || _srCue || _srRoomRow || null;
        // §CPE_PATH_OVERVIEW — the pose is read HERE, after every camera write for this frame and
        // immediately before the capture, so the head marks the shot that was actually rendered.
        // §CPE_POV_MARKER's rule (cinema_path_editor.js:3789): read the REAL transform, never
        // re-derive it from the path parameter.
        var _ovInfo = null;
        if (_ovPath && A.camera) {
          _ovInfo = { ov: _ovPath, pos: _ovPos,
                      pose: { pos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
                              target: (A.controls && A.controls.target)
                                ? { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z }
                                : null } };
        }
        // §CPE_BIG_STATS — ONE panel slot, two answers. While trades are working it is the
        // composition pie; once the programme has topped out (nothing is being built, so the pie is
        // honestly empty) the same slot revolves big headline numbers instead. The switch is the
        // pie's OWN emptiness, not a hardcoded film fraction — a building whose work runs to the
        // last frame keeps the pie the whole way, with no second opinion about when topout was.
        // §CPE_PIE_HOLD + §CPE_STATS_TAIL — TWO ROUNDS, and the user's ruling is that they behave
        // differently (2026-08-30): "In the first round, if nothing is added, that last info holds
        // and wait till a new one arrives, not intersperse" … "[the highlights] should all be in
        // play during the 'Reveal' 2nd round."
        //   ROUND 1 (buildup, u < topoutU): the panel is the schedule and NOTHING rotates. If the
        //     day has no staffed op the last real composition HOLDS until a new one arrives.
        //   ROUND 2 (the Reveal, u >= topoutU): the schedule has topped out and the counter is
        //     pinned — MEASURED at ≈125 s of the user's 229.8 s Hospital film — so the whole set of
        //     highlights revolves here, with the roster as one of the slots so nothing is lost.
        // The boundary is the plan's own topout (§CPE_BUILDUP_TOPOUT), not a new constant. With no
        // plan beats to read it degrades to "the ops can no longer change" — DEGRADE, DON'T DISABLE.
        var _resInfo = null, _statInfo = null, _holdInfo = null;
        if (_resOps && _bkState && A.resourcePanelHoldAt) {
          _holdInfo = A.resourcePanelHoldAt(_bkMs, _resOps, _bkState.projectStart, _bkState.projectEnd);
        }
        // §HUD FIX (2026-09-15) — §COST_ODOMETER's own logic/logging (day-tracking, the FINAL
        // check) runs HERE, unconditionally, every frame this far — NEVER inside the resource
        // panel's own draw path, which stops being called once the film enters the Reveal/stats
        // round (a real HHS bake showed 8 day= lines and NO FINAL at all: the panel had already
        // swapped to the stats card by the time progress crossed 1.0). The DRAW path (cpe_resource_panel.js's
        // own _pieCostLedgerRows) only ever reads the cached result now.
        if (_costOdo && A.costOdometerTick) { try { A.costOdometerTick(_holdInfo); } catch (eCoT) { console.warn('§COST_ODOMETER_TICK_ERR ' + (eCoT && eCoT.message)); } }
        // §CPE_STATS_TAIL_CLIP (2026-09-06) — compare the FILM fraction, not the clip-local one.
        // `_revealU` is a fraction of the WHOLE film (it comes off the plan's own topout beat), so
        // testing it against `i/(nFrames-1)` — which runs 0..1 across whatever slice was baked — put
        // the Reveal round at the wrong instant on every `--clip` run: a clip of the film's last 20%
        // did not enter the Reveal round until 64% of the way through itself. Same clip-local-vs-film
        // confusion §BME.8 fixed a few lines above for the reveal visuals; `_tnFilm` is already that
        // corrected value, and `_tFilm(_tn) === _tn` when no clip is set, so a FULL bake is unchanged.
        var _inReveal = (_revealU != null)
          ? (nFrames > 1 ? _tnFilm >= _revealU : false)
          : !!(_resOps && _bkState && A.resourcePanelFrozenAt &&
               A.resourcePanelFrozenAt(_bkMs, _resOps, _bkState.projectStart, _bkState.projectEnd));
        if (!_inReveal) {
          if (_holdInfo) _resInfo = { info: _holdInfo, pos: _ovPos };   // round 1: hold, never rotate
        } else if (A.tailPanelAt) {
          // ══ §CPE_ROSTER_NOT_A_HIGHLIGHT (2026-09-04, user) ═══════════════════════════════════
          // USER: "the last card during buildUP gives way to rotating slides highlights. But the
          // last buildUp went along as part of the highlights. That slide of last buildup, drop
          // that only. Let highlights be just highlights which are fine."
          // §CPE_STATS_TAIL made the held crew roster ONE OF the revolving slots so that "nothing
          // the panel used to say is lost to the cards". That reasoning was about round 1's
          // content not vanishing — but the roster IS round 1: it is the build-up's last live
          // composition, frozen. Carrying it into the Reveal rotation puts a build-up slide in
          // among the finished-building highlights, which is the one thing the Reveal round exists
          // to stop doing. The crew is not lost: it holds, un-rotated, for the whole of round 1
          // (the `if (!_inReveal)` branch above), which is where it means something.
          // `_holdInfo` is still COMPUTED above because round 1 needs it — only the Reveal round's
          // rotation stops receiving it. Passing null makes tailPanelAt's own `hasRoster` false, so
          // the rotation is the cards and nothing else; no new constant, no second boundary.
          // ⚠ DEGRADE NOTE: with no cards built (§CPE_BIG_STATS INCONCLUSIVE — no source), the tail
          // rotation is now EMPTY and the panel is omitted, where before the roster alone would
          // have kept it on screen. That is the user's ruling ("just highlights"), and the §-line
          // below names it rather than leaving a blank corner unexplained.
          // §CLASH_HUD_PULLBACK_WINDOW / item C (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md §PENDING.5) —
          // inside the pullback sub-window the tail rotation is FORCED to just the disc-pair cards,
          // one discipline pair at a time, and clash_film.js's own highlight (setFade) is driven from
          // the SAME shown card the SAME frame — "the highlighted markers and the flashed number are
          // the same fact, not two unrelated timers" (dispatch wording). Outside the window (or with
          // no disc-pair cards to show) the normal all-card rotation below runs exactly as it always
          // has, and any held highlight is explicitly released on the transition out.
          var _si;
          // §CLASH_DISC_ARRIVAL — during the tail's disc parade the clash set is driven off the parade's
          // OWN clock (A.cpeRevealVisualAt, the same pure function the camera/caption already use), not a
          // second window: when the parade slot shows discipline D, the pairs D BRINGS WITH IT light solid
          // and the HUD flashes that trade's count. A slot whose trade brings no clash (PLB on Hospital)
          // shows no clash card at all and clears the highlight — per the user's ruling that a 0 is not
          // worth a card here ("the idea with HUD is to be best effort and it is abstract, align to what
          // is been shown"), the same §VACUOUS rule bigStatsBuild already holds every card to.
          var _pv = (_arrival && A.cpeRevealVisualAt) ? A.cpeRevealVisualAt(plan, _tnFilm) : null;
          var _paradeSlot = null, _paradeKeys = null, _paradeCard = null;
          if (_pv && _pv.phase === 'tail-one' && _pv.discs && _pv.discs.length) {
            _paradeSlot = _arrivalByDisc[_pv.discs[0]] || null;
            if (_paradeSlot && _paradeSlot.count > 0) {
              _paradeKeys = _paradeSlot.keys;
              _paradeCard = { big: String(_paradeSlot.count),
                label: (A.cpeRevealDiscLabel ? A.cpeRevealDiscLabel(_paradeSlot.disc) : _paradeSlot.disc) + ' clashes',
                sub: _paradeSlot.running + ' of ' + _arrival.total + ' so far',
                src: 'clash_film pairs, assigned to the later-arriving trade' };
            }
          } else if (_pv && _pv.phase === 'tail-all' && _arrival) {
            // Services all on screen together — hold every parade-assigned set solid, show the subtotal.
            _paradeKeys = [];
            _arrival.slots.forEach(function (sl) { _paradeKeys = _paradeKeys.concat(sl.keys); });
            if (_paradeKeys.length) {
              _paradeCard = { big: String(_arrival.slots[_arrival.slots.length - 1].running),
                label: 'services clashes', sub: 'all trades installed',
                src: 'clash_film pairs, parade slots summed' };
            } else { _paradeKeys = null; }
          }
          var _inPullback = !!(_pullbackU && _tnFilm >= _pullbackU.start && _tnFilm < _pullbackU.end);
          if (_paradeCard) {
            _si = { card: _paradeCard, idx: (_paradeSlot ? _paradeSlot.idx : 0),
                    n: (_arrival ? _arrival.slots.length : 1), opacity: 1 };
            var _pk = 'PARADE:' + (_paradeSlot ? _paradeSlot.disc : 'ALL');
            if (A._clashHudHighlightLast !== _pk && A.clashFilm && A.clashFilm.highlightDiscPair) {
              var _ph = A.clashFilm.highlightDiscPair(_paradeKeys);
              A._clashHudHighlightLast = _pk;
              console.log('§CLASH_DISC_ARRIVAL_HIGHLIGHT frame=' + i + ' slot=' + _pk +
                ' keys=[' + _paradeKeys.join('+') + '] count=' + _paradeCard.big +
                ' groupSize=' + (_ph && _ph.groupSize) + ' changed=' + (_ph && _ph.changed));
            }
          } else if (_pv && (_pv.phase === 'tail-one' || _pv.phase === 'tail-all')) {
            // A parade slot with nothing to show (e.g. PLB): no clash card, no held highlight.
            _si = A.tailPanelAt(_bigCards, i / fps, null);
            if (A.clashFilm && A.clashFilm.highlightDiscPair && A._clashHudHighlightLast != null) {
              A.clashFilm.highlightDiscPair(null);
              console.log('§CLASH_DISC_ARRIVAL_HIGHLIGHT frame=' + i + ' slot=PARADE:' +
                (_pv.discs && _pv.discs[0]) + ' keys=[] count=0 — no clash for this trade, back to ambient');
              A._clashHudHighlightLast = null;
            }
          } else if (_inPullback && _pairCards.length) {
            // §CPE_CARD_SPAN — index off the WINDOW, not the absolute film clock. bigStatsAt made the
            // pullback open on whatever card the global rotation happened to be at (measured on the
            // 2026-09-06 ending bake: ELEC|STR for 0.6s before reaching the intended ARC|STR) and
            // 7 cards x 4.5s overran the 25.9s window, cutting the tail of the list and repeating the
            // first. bigStatsAtSpan walks all of them exactly once, so the backdrop card really does
            // land as the shell comes back solid.
            _si = A.bigStatsAtSpan(_pairCards, (_tnFilm - _pullbackU.start) / (_pullbackU.end - _pullbackU.start));
            if (_si && _si.card && A.clashFilm && A.clashFilm.highlightDiscPair) {
              if (A._clashHudHighlightLast !== _si.card.discPairKey) {
                var _hl = A.clashFilm.highlightDiscPair(_si.card.discPairKey);
                A._clashHudHighlightLast = _si.card.discPairKey;
                console.log('§CLASH_HUD_HIGHLIGHT frame=' + i + ' pair=' + _si.card.discPairKey +
                  ' groupSize=' + (_hl && _hl.groupSize) + ' changed=' + (_hl && _hl.changed));
              }
            }
          } else {
            _si = A.tailPanelAt(_bigCards, i / fps, null);
            if (_clash && A.clashFilm && A.clashFilm.highlightDiscPair && A._clashHudHighlightLast != null) {
              A.clashFilm.highlightDiscPair(null);   // leaving the window — drop back to ambient pulsing
              console.log('§CLASH_HUD_HIGHLIGHT frame=' + i + ' pair=null (window exited/no pair cards) — back to ambient');
              A._clashHudHighlightLast = null;
            }
          }
          if (!A._statTailRosterLogged) {
            A._statTailRosterLogged = true;
            console.log('§CPE_ROSTER_NOT_A_HIGHLIGHT reveal rotation slots=' +
              (_bigCards ? _bigCards.length : 0) + ' (cards only; the held build-up roster is NOT' +
              ' one of them — it holds through round 1 instead)' +
              (_bigCards && _bigCards.length ? '' : ' — NO CARDS: the tail panel is omitted entirely'));
          }
          if (_si) {
            // §CPE_PIE_FLYOUT_DROP (2026-09-01, user: "during last fly out, the last pie is not
            // needed. Remove to give max space to the revolving highlights."): in the Reveal round
            // the held pie is NOT drawn — held:null — so the cards and the roster slot take the
            // full panel width. The boundary is THIS branch's own _inReveal (topoutU / ops-frozen
            // degrade), no new constant, so the drop can never diverge from the rotation. Round 1
            // is untouched: §CPE_PIE_HOLD still owns every frame before the boundary. The crew is
            // NOT lost — it holds, un-rotated, for the whole of round 1. (Until 2026-09-04 the
            // roster also rode along as a revolving slot here; §CPE_ROSTER_NOT_A_HIGHLIGHT above
            // removed it — a build-up slide is not a finished-building highlight.)
            _statInfo = { shown: _si, pos: _ovPos, held: null };
            A._statTailFrames = (A._statTailFrames || 0) + 1;
            if (!A._statTailLogged) {
              A._statTailLogged = true;
              console.log('§CPE_STATS_TAIL reveal round entered at frame ' + i + '/' + nFrames +
                ' u=' + (nFrames > 1 ? (i / (nFrames - 1)).toFixed(3) : '1.000') +
                ' boundary=' + (_revealU != null ? 'topoutU ' + _revealU.toFixed(3) : 'ops-frozen (no plan beats)') +
                ' slots=' + _si.n + ' (roster' + (_bigCards ? ' + ' + _bigCards.length + ' cards' : ', NO cards built') + ')' +
                ' pie=dropped (§CPE_PIE_FLYOUT_DROP)');
            }
          } else if (_holdInfo) {
            _resInfo = { info: _holdInfo, pos: _ovPos };   // nothing to revolve — hold, never blank
          }
        }
        // §STOREY_HIGHLIGHT_REVEAL — takes over the SAME panel slot for exactly the narrow last-5s-
        // of-pullback window (ending at plan.beats.rise). Shaped identically to the `_si`/_statInfo branch above
        // (A.bigStatsCompositeOntoCanvas reads `.shown.card`/`.idx`/`.n`/`.opacity` either way), so no
        // new draw code is needed — only which content occupies the slot changes. `_resInfo` is
        // already null here by construction (it is only ever set in the `!_inReveal` branch far
        // above, and this window opens well after `_inReveal` goes true), so no second corner panel
        // can appear alongside it.
        if (A.storeyRevealStatCardAt) {
          var _srCard = A.storeyRevealStatCardAt(plan, _tnFilm);
          if (_srCard) _statInfo = { shown: _srCard, pos: _ovPos, held: null };
        }
        // §MEASURE_BUILDING_CARD — the closing roll-to-stop. Last override in the chain, and its window
        // (the final 3s) is past beats.rise, so it cannot collide with the storey block above (which
        // ends AT beats.rise) or with either clash window. Same _statInfo shape, no new draw code.
        if (_measureU != null && _tnFilm >= _measureU) {
          var _mc = A.bigStatsAtSpan(_measureCards, (_tnFilm - _measureU) / (1 - _measureU));
          if (_mc) {
            _statInfo = { shown: _mc, pos: _ovPos, held: null };
            if (A._measureCardLast !== _mc.idx) {
              A._measureCardLast = _mc.idx;
              console.log('§MEASURE_BUILDING_CARD frame=' + i + '/' + nFrames + ' tn=' + _tnFilm.toFixed(4) +
                ' card=' + (_mc.idx + 1) + '/' + _mc.n + ' — ' + _mc.card.big + ' ' + _mc.card.label);
            }
          }
        }
        window.APP._burninFrameIdx = i;   // §DATUM_DECOUPLE — which pre-extracted clean PNG this frame loads
        // §117 WITNESS (user: "Don't you WITNESS log to prove that it's not working?") — §113's
        // witness covers the CUT and proved nothing about lighting, which is exactly why §115's
        // per-storey cap read as working in the log while fixture GLOW was still on screen: the
        // PointLights and the glow sprites are two different object families and only one was being
        // counted. This counts every interior emitter there is, from the live scene, and must read
        // zero on every frame after the last stick. It reads the PREVIOUS frame's writes, which is
        // what makes it independent of the gate's own arithmetic rather than a restatement of it.
        if (A._ilPastStick) {
          var _wPool = 0, _wNav = 0;
          if (A._nightBakePool) for (var _wi = 0; _wi < A._nightBakePool.length; _wi++) {
            if (A._nightBakePool[_wi].intensity > 0) _wPool++;
          }
          if (A._nightLightByPos && A._nightLightByPos.forEach) {
            A._nightLightByPos.forEach(function (l) { if (l && l.intensity > 0) _wNav++; });
          }
          var _wGlow = A._glowStagedCount || 0;
          // §118 — FOUR families, not three. The first version counted pool lights, nav lights and
          // the sprite cloud, reported PASS, and fixtures were still visibly lit: the lens quad and
          // the emissive fixture materials were never in the count. A witness that cannot see a
          // family cannot fail on it.
          var _wLens = A._glowLensLive ? 1 : 0;
          var _wEmis = 0;
          if (A._nightGlowMats) for (var _ge = 0; _ge < A._nightGlowMats.length; _ge++) {
            var _gm = A._nightGlowMats[_ge].mat;
            if (_gm && _gm.emissiveIntensity > 0 && _gm.emissive && _gm.emissive.getHex() !== 0) _wEmis++;
          }
          var _wKey = _wPool + '/' + _wNav + '/' + _wGlow + '/' + _wLens + '/' + _wEmis;
          if (A._ilWitnessKey !== _wKey) {
            A._ilWitnessKey = _wKey;
            console.log('§INTERIOR_LIGHTS_WITNESS poolLit=' + _wPool + '/' +
              ((A._nightBakePool && A._nightBakePool.length) || 0) + ' navLit=' + _wNav +
              ' glowSpritesStaged=' + _wGlow + ' lensQuadLive=' + _wLens +
              ' emissiveMatsLit=' + _wEmis + '/' + ((A._nightGlowMats && A._nightGlowMats.length) || 0) +
              ' => ' +
              // §129.41 (2026-09-19) — THE RULE THIS WITNESS CHECKS HAS CHANGED, so the verdict has
              // to change with it or it fails on the very behaviour red1 asked for. Under §116 the
              // bar was "nothing interior emits after the last stick", full stop; the relight makes
              // that true only up to topout. Past topout the CORRECT answer is the opposite — the
              // windows are meant to be lit at dusk — so a zero there is the failure and a non-zero
              // is the pass. Same five families, same denominators, the expectation flips with the
              // beat. Leaving the old assertion in place would have meant a red line on every
              // future bake and a witness nobody trusts, which is worse than no witness.
              // §129.49 (2026-09-19, red1: "get proper WITNESS logging in") — THE OLD BAR WAS TOO
              // LOW AND IT HID A REAL BUG FOR A WHOLE DAY. "Something is emitting" passed while
              // emissiveMatsLit was 0/4 on HHS and 0/8 on Hospital, because the pool lights were on
              // and one lit family was enough to carry the verdict. §129.48's fault — the relight
              // restoring PRE-GLOW DARK values — was printed in that field on every one of those
              // frames and the verdict said PASS over the top of it.
              // A family with members and none lit is now a FAIL on its own, named. Each family
              // prints over its own denominator so a zero can still be told from an absent family:
              // absent (denominator 0) is not judged, which is the VACUOUS case, not a pass.
              (A._ilPastTopout
                ? ((function () {
                    var fam = [['pool', _wPool, (A._nightBakePool && A._nightBakePool.length) || 0],
                               ['nav', _wNav, (A._nightLightByPos && A._nightLightByPos.size) || 0],
                               ['emissiveMats', _wEmis, (A._nightGlowMats && A._nightGlowMats.length) || 0]];
                    var dark = fam.filter(function (f) { return f[2] > 0 && f[1] === 0; });
                    var judged = fam.filter(function (f) { return f[2] > 0; });
                    if (!judged.length) return 'INCONCLUSIVE — past topout and no interior emitter family' +
                      ' exists on this building at all; nothing judged, not a pass.';
                    if (dark.length) return 'FAIL — past topout and ' +
                      dark.map(function (f) { return f[0] + ' is 0/' + f[2]; }).join(', ') +
                      '. A family with members and none lit is the defect (§129.48: the relight used to' +
                      ' restore the PRE-GLOW values, i.e. darkness, and say "restored"). Another family' +
                      ' being lit does NOT cover for it — that is how this hid.';
                    return 'PASS (past topout: every interior family that exists is lit — ' +
                      judged.map(function (f) { return f[0] + ' ' + f[1] + '/' + f[2]; }).join(', ') + ')';
                  })())
                : ((_wPool + _wNav + _wGlow + _wLens + _wEmis === 0)
                    ? 'PASS (between the last stick and topout, no interior emitter of any family is on)'
                    : 'FAIL — something interior is still emitting. Each count prints over its own' +
                      ' DENOMINATOR so a zero can be told apart from an absent family (a vacuous pass).')));
          }
        } else A._ilWitnessKey = null;
        // ══ §129.57 FRAME REUSE (2026-09-20) ══════════════════════════════════════════════════
        // MEASURED on the 09-20 Hospital hi-res bake's own §FRAME_HASH sequence: 199 of the 265
        // load-path freeze frames are BYTE-IDENTICAL to the frame before them, and 0 frames
        // anywhere else in the film are. Each of those 199 cost 6,892 ms — 22.9 min of GPU time
        // re-deriving bytes that already existed. Inside the hold the camera is pinned at armPose,
        // the sun is frozen (§SUN_ONE elevation=26.5 on all 264 samples) and the scene moves by 8
        // objects across the whole window.
        //
        // So: when nothing that drives the picture has moved, hand the encoder the PREVIOUS blob
        // and skip _captureFrame entirely — base render, the 20-render still fold (taa=8 ao=12)
        // and the HUD draw together, not a part of it.
        //
        // The key never GUESSES what the load path animates. `A._loadPathVisualRev` is a counter
        // the load-path module bumps only where it genuinely mutated something (see its own note
        // at _revealStackStep). If a future edit animates something every frame, the counter moves
        // every frame and reuse turns itself off with no change here.
        //
        // GATED TO THE HOLD, matching the measurement exactly. window.__noFrameReuse=1 disables it
        // — the control W-FRAME-REUSE's own FAIL leg depends on.
        // §129.61 MERGE — their §ESCAPE_ROUTE card/frame computation was MOVED UP to here.
        // On their branch it sat just above their own _captureFrame call; on ours that call is
        // inside §129.57's reuse if/else, so leaving it there computed _escInfo AFTER the frame
        // that needed it and duplicated the capture. It also has to run before the reuse key is
        // built, since _statInfo is what it overrides.

        // §ESCAPE_ROUTE_REVEAL — the titled card. LAST override in the chain on purpose: the
        // §MEASURE_BUILDING_CARD roll above owns the whole orbit beat, and this window lies inside
        // it, so the escape card has to be the one that wins for its own span and hand the slot
        // straight back afterwards. Same _statInfo shape, so no new panel drawing exists.
        // AFTER every beat's own per-frame update (the datum, the cues, the indoor beats and the
        // slab all write `.visible` themselves) and BEFORE the capture, so the last word on what
        // reaches the frame is the cease rule's.
        _cease3D();
        var _escInfo = null, _escCardInfo = null;
        if (_escRec && A.escapeRouteStatCardAt) {
          var _ec = A.escapeRouteStatCardAt(plan, _tnFilm);
          if (_ec) {
            // ══ §ESCAPE_PANEL_SLOT (2026-09-20) ═══════════════════════════════════════════════
            // red1: "EscRoute should be taking over the opposing bottom HUD as it is no longer
            // having any new content. This leaves the main HUD to continue displaying its overall
            // building info." Then: "I mean, retain the same coloring. Just use that opposing HUD."
            // It used to overwrite `_statInfo`, which EVICTED the building card from the HUD column
            // for the whole escape window. Now it draws in the corner diagonally opposite — the one
            // the Measure panel takes — and `_statInfo` is left alone, so the route runs on one side
            // and 440 doors / 22,031,100 total cost on the other, which is what he asked for.
            // The corner comes from cpe_film_boxes.js's own OPP map, not a second copy of it.
            // ⚠ The prerequisite for sharing this corner was §SLAB_LABEL_STALE: the slab beat
            // re-posted its label every frame to the end of the film, so the Measure box never
            // yielded the slot and never could.
            _escCardInfo = { shown: _ec,
                             pos: (A.filmBoxesOppositeCorner ? A.filmBoxesOppositeCorner(_ovPos) : 'bl') };
            if (A.escapeRouteFrameAt) {
              // §ESCAPE_ROUTE_HUD_RESERVE — the corner column this frame, so the two scene-anchored
              // plates keep out of it (red1: the panel "must find an empty spot"). Since the
              // suppression was retired the column holds EVERY box again — day counter, sun clock,
              // compass readout, path box, pie/card — so the reserve is the whole strip down to the
              // bottom _captureFrame measured last frame (A._hudStackBottom), not two boxes.
              var _escReserved = A.escapeRouteReservedRects
                ? A.escapeRouteReservedRects(w, h, _ovPos, A._hudStackBottom) : [];
              try { _escInfo = A.escapeRouteFrameAt(plan, _tnFilm, A.camera, w, h, _escReserved); }
              catch (eEF) { if (!A._escFrameWarned) { A._escFrameWarned = true;
                console.warn('§ESCAPE_ROUTE_FRAME failed frame=' + i + ': ' + (eEF && eEF.message)); } }
            }
            if (_escInfo && (i % 10 === 0 || _escInfo.progress >= 1) && !A._escLoggedFull) {
              if (_escInfo.progress >= 1) A._escLoggedFull = true;
              console.log('§ESCAPE_ROUTE_DRAW frame=' + i + '/' + nFrames + ' tn=' + _tnFilm.toFixed(4) +
                ' progress=' + _escInfo.progress.toFixed(4) +
                ' drawn=' + _escInfo.drawnM.toFixed(2) + 'm of ' + _escRec.walkM.toFixed(2) + 'm' +
                ' steps=~' + _escInfo.steps + ' walk=' + Math.round(_escInfo.walkSec) + 's' +
                ' pts=' + _escInfo.screen.length + ' labels=' + _escInfo.labels.length +
                ' alpha=' + _escInfo.alpha.toFixed(2) + ' reserved=' + _escReserved.length +
                ' plateCollisions=' + _escInfo.labels.map(function (L) { return L.collisions; }).join('/'));
            }
          }
        }
        var _reuseKey = null;
        if (!window.__noFrameReuse && _lpHoldCtl && _lpHoldCtl.inHold && _lastFrameBlob) {
          var _rp = A.camera ? A.camera.position : null;
          var _rt = (A.controls && A.controls.target) ? A.controls.target : null;
          // `rev` AND `prevRev`. A load-path mutation lands in the picture ONE FRAME LATE — the
          // visual is applied in this loop and the change shows up in the next frame's render.
          // MEASURED: keying on `rev` alone reused at frames 1948, 1972, 1996, 2020 … each exactly
          // one after a hop step, and the real bake's own hashes say every one of those frames
          // DIFFERED from its predecessor. Caught by W-FRAME-REUSE's replay leg before any bake.
          // Carrying the previous frame's rev forces a render on the step frame and the one after
          // it, which is the same off-by-one §129.50 hit with the DLOD proxy ("ARC was coming back
          // one frame later").
          _reuseKey = 'h1|' + (A._loadPathHudAlpha == null ? 1 : +A._loadPathHudAlpha).toFixed(6) +
            '|rev' + (A._loadPathVisualRev || 0) + '+' + _prevVisualRev +
            '|p' + (_rp ? _rp.x.toFixed(4) + ',' + _rp.y.toFixed(4) + ',' + _rp.z.toFixed(4) : '-') +
            '|t' + (_rt ? _rt.x.toFixed(4) + ',' + _rt.y.toFixed(4) + ',' + _rt.z.toFixed(4) : '-') +
            '|s' + ((A.sunCompassInfo && A.sunCompassInfo()) ? (+A.sunCompassInfo().elevation).toFixed(3) : '-') +
            '|d' + (_dayInfo && _dayInfo.text != null ? String(_dayInfo.text) : '-');
        }
        _prevVisualRev = (A._loadPathVisualRev || 0);
        var blob;
        if (_reuseKey !== null && _reuseKey === _lastFrameKey) {
          blob = _lastFrameBlob;
          _frameReuseRun++; _frameReuseTotal++;
        } else {
          if (_frameReuseRun > 0) {
            _frameReuseRuns++;
            console.log('§FRAME_REUSE run ended at i=' + i + ' reused=' + _frameReuseRun +
              ' consecutive frame(s) — identical picture, encoder handed the same blob');
            _frameReuseRun = 0;
          }
          blob = await _captureFrame(w, h, _titleInfo, _dayInfo, _ovInfo, _resInfo, _statInfo, _lblInfo, _statusSrc, _escInfo, _escCardInfo);
          _lastFrameKey = _reuseKey; _lastFrameBlob = blob;
        }
        // ROUND 13 item C — track whichever frame lands CLOSEST to the hold's own middle
        // (|elapsedSec - durSec/2|, never a re-derived "is this the middle" guess) and snapshot the
        // REAL per-layer composite alpha `_captureFrame`'s own `_drawUnlessHold` calls just recorded
        // for THIS frame (`A._hudCompositeAlphaSample`) — read by `_hudFadeWitnessPrint` at the end
        // of the bake, since `A.loadPathDispose()` clears the live hold state before that print runs.
        if (_lpHoldCtl && _lpHoldCtl.inHold && A._loadPathWindow && A._loadPathWindow.durSec > 0) {
          var _lpMidDist = Math.abs(_lpHoldCtl.elapsedSec - A._loadPathWindow.durSec / 2);
          if (_lpMidDist < _lpMidHoldBestDistSec) {
            _lpMidHoldBestDistSec = _lpMidDist;
            _lpMidHoldCompositeAlpha = Object.assign({}, A._hudCompositeAlphaSample || {});
          }
        }
        // LARGE_DB_BAKE.md §2 L4 — seam-equivalence witness: hash the ENCODED bytes of this frame,
        // keyed by its GLOBAL index in the full film (not this run's local i), so a K=1 bake and a
        // --frame-range slice of the same span can be diffed frame-for-frame without decoding video.
        try {
          var _fhBuf = await blob.arrayBuffer();
          var _fhDig = await crypto.subtle.digest('SHA-256', _fhBuf);
          var _fhHex = Array.prototype.map.call(new Uint8Array(_fhDig), function(b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, 16);
          console.log('§FRAME_HASH i=' + (_frameRange ? _frameRange.a + i : i) + ' sha=' + _fhHex);
        } catch (eFh) { console.warn('§FRAME_HASH_ERR ' + eFh.message); }
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
          _logFrameCost(i, nFrames, _per);
        }
      }
      // §129.6 item 1 WITNESS — §LOADPATH_RESUME: b==a (the film really did resume from the SAME
      // tFilm it froze at) and stepAtResume <= maxStepElsewhere (no threshold constant — the
      // release step must be no bigger than the largest step ANYWHERE ELSE in this same bake, real
      // camera-position deltas from the poses the bake actually set, never a guessed number).
      if (_loadPath && _lpResumeAtIndex >= 0) {
        var _lpA = A._loadPathArmTFilm, _lpB = A._loadPathReleaseTFilm;
        var _lpStepAtResume = _lpCamSteps[_lpResumeAtIndex] || 0;
        var _lpMaxElsewhere = 0;
        for (var _lpSi = 0; _lpSi < _lpCamSteps.length; _lpSi++) {
          if (_lpSi === _lpResumeAtIndex) continue;
          if (_lpCamSteps[_lpSi] > _lpMaxElsewhere) _lpMaxElsewhere = _lpCamSteps[_lpSi];
        }
        var _lpTFilmOk = (_lpA != null && _lpB != null && _lpA === _lpB);
        var _lpStepOk = _lpStepAtResume <= _lpMaxElsewhere;
        console.log('§LOADPATH_RESUME tFilmArm=' + (_lpA == null ? '?' : _lpA.toFixed(6)) +
          ' tFilmRelease=' + (_lpB == null ? '?' : _lpB.toFixed(6)) + ' framesInserted=' + _lpFramesInserted +
          ' stepAtResume=' + _lpStepAtResume.toFixed(4) + ' maxStepElsewhere=' + _lpMaxElsewhere.toFixed(4) +
          ' => ' + (_lpTFilmOk && _lpStepOk ? 'PASS' : 'FAIL'));
      }
      // §HUD FIX (2026-09-15) — §COST_ODOMETER_FINAL must say something, never nothing: a clip that
      // ends BEFORE topout (progress never reaches 1.0) legitimately never fires the FINAL check
      // inside A.costOdometerTick — printed here, once, at the true end of the bake, so a log reader
      // never has to infer "silence" as a pass.
      if (_costOdo && !A._costOdometerFinalFired) {
        console.log('§COST_ODOMETER_FINAL INCONCLUSIVE reason=no-final-frame');
      }
      if (A._stillRefineActive) A.stopStillRefine(true);
      _restoreRandom();
      // §CPE_BUILDUP: hand the user's Time Machine back exactly as it was. Every loop exit — normal
      // end, cancel, GL loss, IDB loss — passes through here, so the re-keyed order can never
      // outlive the bake and silently become what the timeline slider scrubs.
      if (_bkState && typeof window.tmRestoreDerivedOrder === 'function') {
        window.tmRestoreDerivedOrder(); _bkState = null;
      }
      // §CPE_BUILDUP_ACTIVATE_POPS_PANEL: same contract — a bake that silently turned Time Machine
      // on (tmActivateForBake, no real Play involved) must silently turn it back off, or the scene
      // is left mid-construction with nothing offering to restore it (the panel was never shown, so
      // there's no close button to do it).
      try { if (typeof window.tmDeactivateIfBakeOwned === 'function') window.tmDeactivateIfBakeOwned(); } catch (eTM) {}
      // §CPE_GHOST_GROUND: same contract, same exit — a ghosted ground left behind would follow the
      // user into normal navigation for the rest of the session.
      try { _ghostGroundRestore(); } catch (eGG) {}
      // §CPE_DISCIPLINE_REVEAL: same contract — ARC/STR left hidden after a bake would follow the
      // user into normal navigation. plan=null is the explicit "force restore" signal.
      try { if (A.cpeRevealApplyVisual) A.cpeRevealApplyVisual(null, 0); } catch (eRV) {}
      try { if (A.cpeArchFadeApplyVisual) A.cpeArchFadeApplyVisual(null, 0); } catch (eRVf) {}
      // §STOREY_HIGHLIGHT_REVEAL: same contract — a tinted storey left glowing after a bake would
      // follow the user into normal navigation. plan=null forces the restore.
      A._interiorLightsOff = false; A._ilBoundaryLogged = false;     // §116 restore
      // §SUN_ONE_ALL_DARK — judged over the WHOLE run, so it cannot be a per-frame warning.
      // A film dark end to end is real in polar winter and a mistake everywhere else.
      try { if (A._sunCompassOn && A.sunCompassDarkReport) A.sunCompassDarkReport(); } catch (eSD) {}
      try { if (A.storeyRevealApplyVisual) A.storeyRevealApplyVisual(null, 0); } catch (eSR) {}
      try { if (A.storeyRevealApplyCut) A.storeyRevealApplyCut(null, 0); } catch (eSC) {}
      // §129.1 LOAD PATH: same contract — a lit stack / clip plane left behind after a bake would
      // follow the user into normal navigation. plan=null forces the restore.
      try { if (A.loadPathApplyVisual) A.loadPathApplyVisual(null, 0); } catch (eLP) {}
      // §129.57 end-of-bake census. A saving nobody can read back out of the log is not a saving
      // anybody can check — and a reuse count of 0 on a film that HAS a load-path freeze is the
      // FAIL signal (the key is too fine, or the hold never armed), not a quiet non-event.
      if (_frameReuseRun > 0) { _frameReuseRuns++; }
      console.log('§FRAME_REUSE_TOTAL reused=' + _frameReuseTotal + '/' + framesDone +
        ' runs=' + _frameReuseRuns + ' rendered=' + (framesDone - _frameReuseTotal) +
        ' disabled=' + (window.__noFrameReuse ? 1 : 0) +
        ' — ' + (window.__noFrameReuse ? 'reuse OFF by flag (control run)'
          : (_frameReuseTotal > 0 ? 'each reused frame is the previous encoded blob, byte-identical by construction'
             : 'INCONCLUSIVE: nothing was reused — no load-path hold in this film, or the key moved every frame')));
      try { if (A.loadPathDispose) A.loadPathDispose(); } catch (eLPd) {}
      try { if (A.ledgerTickerDispose) A.ledgerTickerDispose(); } catch (eLTd) {}
      // §ESCAPE_ROUTE_REVEAL — the forced restore. Runs unconditionally, NOT behind _escapeRoute:
      // by the time it arrives the film has normally already left the window, and a flag read here
      // could differ from the one that engaged the x-ray. Drops the room meshes, puts x-ray back if
      // WE turned it on, and clears the HUD-suppression flag so the next bake starts clean.
      try { if (A.escapeRouteApplyVisual) A.escapeRouteApplyVisual(null, 0); } catch (eER1) {}
      try { if (A.flythruCuesDispose) A.flythruCuesDispose(); } catch (eFD) {}
      try { if (A.slabBeatDispose) A.slabBeatDispose(); } catch (eSBD) {}   // §SLAB_BEAT — restores the tint, removes X + label
      try { if (A.linearBeatDispose) A.linearBeatDispose(); } catch (eLBD) {}
      try { if (A.indoorBeatsDispose) A.indoorBeatsDispose(); } catch (eIBD) {}
      try { if (A.flyoutBeatsDispose) A.flyoutBeatsDispose(); } catch (eFBD) {}
      _workPacingReset();
      // §CLASH_FILM_P2 — say what the labels did over the whole film (VACUOUS if the camera never
      // came within 4 m of a pair), then release the selector's state with the markers.
      if (_clash && A.clashLabels && A.clashLabels.summary) { try { A.clashLabels.summary(framesDone); A.clashLabels.reset(); } catch (eCLs) {} }
      // §ESCAPE_ROUTE_SUMMARY — one line, and it says VACUOUS out loud when the window never opened
      // on a captured frame (a clip that misses it), because a film that never drew the route proves
      // nothing about it. Read the log, not the video.
      if (_escapeRoute && A.escapeRouteSummary) { try { A.escapeRouteSummary(framesDone); } catch (eERs) {} }
      // §CLASH_FILM_P1 — the markers are bake content; never let them survive into the user's scene.
      if (_clash && A.clashFilm && A.clashFilm.dispose) { try { A.clashFilm.dispose(); } catch (eCFd) {} }
      // §CPE_PIE_HOLD — say how much of the film the pie HELD a past composition rather than
      // showing today's. A bake where this equals framesDone means no day was ever staffed and the
      // whole panel was a hold: that is a schedule problem, not a HUD one, and must be visible.
      console.log('§CPE_PIE_HOLD heldFrames=' + (A._resHoldFrames || 0) + '/' + framesDone +
        (framesDone ? ' (' + Math.round((A._resHoldFrames || 0) / framesDone * 100) + '% of the film)' : '') +
        ((A._resHoldFrames || 0) === 0 ? ' — trades were active for every frame, the pie was never held'
          : ((A._resHoldFrames || 0) >= framesDone ? ' ⚠ NO frame had a live crew — the pie held throughout'
             : ' — pie holds the last real crew through the silent tail')));
      // §CPE_STATS_TAIL — how much of the film the Reveal round reclaimed. 0 on a bake whose plan
      // has no topout AND whose ops never freeze: that is the case where the dead tail stays dead.
      console.log('§CPE_STATS_TAIL revolvedFrames=' + (A._statTailFrames || 0) + '/' + framesDone +
        (framesDone ? ' (' + Math.round((A._statTailFrames || 0) / framesDone * 100) + '% of the film)' : '') +
        ((A._statTailFrames || 0) === 0
          ? ' — the Reveal round never revolved: no topout on the plan and the ops never froze'
          : ' — highlights in play for the whole Reveal round, roster included'));
      // §129.7 item 8c — §HUD_LAYOUT_STABLE: end-of-bake verdict from the per-frame sampling above.
      _hudLayoutStablePrintImpl();
      // §129.8 item 4b (amendment) — §LOADPATH_HUD_FADE: end-of-bake, analytic (see its own comment).
      _hudFadeWitnessPrint();
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
      // §CPE_BUILDUP_ACTIVATE_POPS_PANEL: same restore on the THROW path — see the in-try comment above.
      try { if (window.tmDeactivateIfBakeOwned) window.tmDeactivateIfBakeOwned(); } catch (eTM2) {}
      try { _ghostGroundRestore(); } catch (e4) {}
      try { if (A.cpeRevealApplyVisual) A.cpeRevealApplyVisual(null, 0); } catch (eRV2) {}
      try { if (A.cpeArchFadeApplyVisual) A.cpeArchFadeApplyVisual(null, 0); } catch (eRVf2) {}
      A._interiorLightsOff = false; A._ilBoundaryLogged = false;     // §116 restore
      try { if (A.storeyRevealApplyVisual) A.storeyRevealApplyVisual(null, 0); } catch (eSR2) {}
      try { if (A.storeyRevealApplyCut) A.storeyRevealApplyCut(null, 0); } catch (eSC2) {}
      try { if (A.loadPathApplyVisual) A.loadPathApplyVisual(null, 0); } catch (eLP2) {}
      try { if (A.loadPathDispose) A.loadPathDispose(); } catch (eLPd2) {}
      try { if (A.ledgerTickerDispose) A.ledgerTickerDispose(); } catch (eLTd2) {}
      try { if (A.escapeRouteApplyVisual) A.escapeRouteApplyVisual(null, 0); } catch (eER2) {}
      try { if (A.flythruCuesDispose) A.flythruCuesDispose(); } catch (eFD2) {}
      try { if (A.slabBeatDispose) A.slabBeatDispose(); } catch (eSBD2) {}
      try { if (A.linearBeatDispose) A.linearBeatDispose(); } catch (eLBD2) {}
      try { if (A.indoorBeatsDispose) A.indoorBeatsDispose(); } catch (eIBD2) {}
      try { if (A.flyoutBeatsDispose) A.flyoutBeatsDispose(); } catch (eFBD2) {}
      try { _workPacingReset(); } catch (e5) {}
      // §CLASH_FILM_P1 — same restore on the THROW path (review of #1678): a throw inside the loop
      // skips the in-try dispose above and would leave the marker InstancedMeshes in the user's
      // scene. dispose() is idempotent, so after a normal exit this is a silent no-op.
      try { if (A.clashFilm && A.clashFilm.dispose) A.clashFilm.dispose(); } catch (eCFd2) {}
      // §CLASH_FILM_P2 — same: a thrown loop leaves the label's hysteresis/fade state for the next bake otherwise.
      try { if (A.clashLabels && A.clashLabels.reset) A.clashLabels.reset(); } catch (eCLr2) {}
      // §40.1 — a second bake, or the live editor preview, must not inherit THIS bake's armed
      // rectangles: a different frame size or a different corner would then draw into stale boxes.
      try { if (A.filmBoxesDisarm) A.filmBoxesDisarm(); } catch (eFBd) {}
      // Recoverability FIRST: clearing the store can itself block for seconds behind the very
      // zombie connection that failed this run, and until these flags reset the next Alt+C is
      // swallowed as a cancel-toggle. Cleanup must never gate the ability to retry.
      _active = false; _cancel = false;
      A._maxqActive = false;
      _wakeRelease(); _dampRelease(); _bakeBudgetRelease();
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
      // ══ §CLI_SILENT_BAKE item 1 (spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md) — dev-only
      // scripted entry, defined ONLY when the launcher pre-set __MAXQ_SILENT before any page
      // script ran (puppeteer evaluateOnNewDocument), so no user session ever sees it. Resolves
      // the stored path — object | named IndexedDB plan | the building DB's own cinema_path
      // table — into the ONE _buildOverride() shape and hands it to start(). No second schema.
      if (window.__MAXQ_SILENT) window.__maxqBake = async function(o) {
        o = o || {};
        var a = window.APP;
        var ov = null, src = null;
        if (o.override) { ov = o.override; src = 'caller-object'; }
        else if (o.name) {
          var bld = a.activeBuilding || a.buildingName || 'building';
          var rec = await new Promise(function(res, rej) {
            var rq = indexedDB.open('bim_ootb_cinema_paths', 1);
            rq.onupgradeneeded = function() {
              var d = rq.result;
              if (!d.objectStoreNames.contains('paths')) d.createObjectStore('paths', { keyPath: 'key' });
            };
            rq.onsuccess = function() {
              var db = rq.result;
              try {
                var g = db.transaction('paths', 'readonly').objectStore('paths').get(bld + '|' + o.name);
                g.onsuccess = function() { db.close(); res(g.result || null); };
                g.onerror = function() { db.close(); rej(g.error || new Error('idb-get-failed')); };
              } catch (e) { db.close(); rej(e); }
            };
            rq.onerror = function() { rej(rq.error || new Error('idb-open-failed')); };
          });
          if (!rec || !rec.override) throw new Error('no stored plan "' + o.name + '" for building ' + bld);
          ov = rec.override; src = 'idb:' + bld + '|' + o.name;
        } else {
          // The PORTABLE store: trigger effects.js's own lazy _cpeLoadFromDb via a throwaway
          // plan, then read the staged result — the shipped loader, never a re-implementation.
          // Guard FIRST: _cpeLoadFromDb latches _cpeLoaded=true on entry, so probing before the
          // DB is open would permanently blind this session to the stored path (found live on the
          // very first CLI smoke run, 2026-09-01 — the runner's readiness wait raced the load).
          if (!a.db) throw new Error('building DB not open yet — wait for load before __maxqBake');
          if (typeof a.cinemaPathPlan === 'function') try { a.cinemaPathPlan(60); } catch (ePl) {}
          var staged = (a._getCinemaPathEdit && a._getCinemaPathEdit()) || null;
          if (!staged) throw new Error('no stored path: cinema_path table absent/empty and no plan named');
          ov = staged; src = 'db:cinema_path';
        }
        // Shallow copy before the flag-merge so a staged holder (A._cinemaPathEdit) is never
        // mutated (§CPE_HOLDER_INTEGRITY, same reasoning as _buildOverride's deep copies).
        var ov2 = {}; for (var k in ov) ov2[k] = ov[k]; ov = ov2;
        if (o.flags) ['buildup', 'roomTitle', 'reveal', 'dayCounter', 'clash', 'measure', 'storeyReveal', 'loadPath', 'ledger', 'cost', 'sunCompass', 'sunDate', 'escapeRoute'].forEach(function(fk) {   // §FLYTHRU_DATUM §28.1: 'measure' was missing — a CLI --measure was silently dropped; §129 GATING added 'ledger'/'cost' (2026-09-15)
          if (o.flags[fk] !== undefined) ov[fk] = o.flags[fk];
        });
        // §SDC (2026-09-04, PHOTOREAL_STILL_RENDER.md §BME.7): a dev clip window rides the same
        // §CPE_CLIP field the editor writes, so the loop below needs no second notion of a window.
        if (o.clip && +o.clip.out > +o.clip.in) ov.clip = { in: +o.clip.in, out: +o.clip.out };
        window.__maxqResolvedOverride = ov;   // for the runner's post-bake pose assertion
        console.log('§CLI_BAKE_RESOLVED source=' + src + ' bands=' + (ov.bands ? ov.bands.length : 0) +
          (ov.clip ? ' clip=' + ov.clip.in + '→' + ov.clip.out : '') +
          ' total=' + (ov._total != null ? (+ov._total).toFixed(1) : '?') + 's' +
          ' buildup=' + (ov.buildup ? 1 : 0) + ' roomTitle=' + (ov.roomTitle ? 1 : 0) +
          ' reveal=' + (ov.reveal ? 1 : 0) + ' dayCounter=' + (ov.dayCounter || 'tr') +
          // §CLI_BAKE_CLASH_CENSUS (2026-09-19, red1: "Is Clashes overlay on too?") — `clash` rode
          // the override through _buildOverride and the flag list, and was the ONE overlay this
          // census never printed. So no bake log could answer that question: you had to read the
          // command line, or look at frames. Every other flag here is reported; this one is now too.
          ' clash=' + (ov.clash ? 1 : 0) +
          ' escapeRoute=' + (ov.escapeRoute ? 1 : 0) +
          ' storeyReveal=' + (ov.storeyReveal ? 1 : 0) + ' measure=' + (ov.measure ? 1 : 0) +
          ' loadPath=' + (ov.loadPath ? 1 : 0) + ' ledger=' + (ov.ledger ? 1 : 0) + ' cost=' + (ov.cost ? 1 : 0) +
          ' sunCompass=' + (ov.sunCompass ? 1 : 0) + ' sunDate=' + (ov.sunDate || '-'));
        await start({ editor: false, preview: false, override: ov, overrideSource: src,
                      frames: o.frames, fps: o.fps, forceWebm: o.forceWebm,
                      burninDatumDir: o.burninDatumDir,   // §DATUM_DECOUPLE — was silently dropped here
                      stillBudget: o.stillBudget,   // LARGE_DB_BAKE.md §2 L3 — CLI --still-budget override
                      frameRange: o.frameRange });   // LARGE_DB_BAKE.md §2 L4 — CLI --frame-range override
        return { source: src, deliveredBytes: window.__maxqDeliveredBytes || 0 };
      };
      clearInterval(_attach);
    }
  }, 500);
})();
