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
  function _captureFrame(w, h, titleInfo, dayInfo, ovInfo, resInfo, statInfo, lblInfo) {
    var A = window.APP;
    if (A._composer) A._composer.render();
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(A.renderer.domElement, 0, 0, w, h);
    // §CLASH_FILM_P2 — the clash-pair labels, FIRST in the 2D pass: they are scene-anchored and
    // wander, the corner HUD below is fixed furniture, so the HUD must always paint over a label.
    // Same never-kills-a-bake contract as every other overlay here.
    if (lblInfo && lblInfo.placed && lblInfo.placed.length && A.clashLabelsCompositeOntoCanvas) try {
      A.clashLabelsCompositeOntoCanvas(ctx, w, h, lblInfo.placed);
    } catch (eCLd) {
      if (!A._clashLblDrawErrLogged) { A._clashLblDrawErrLogged = true;
        console.warn('§CLASH_LABELS_ERR draw: ' + eCLd.message + ' — labels skipped, frames continue'); }
    }
    if (titleInfo && titleInfo.opacity > 0 && A.roomTitleCompositeOntoCanvas) {
      A.roomTitleCompositeOntoCanvas(ctx, w, h, titleInfo.name, titleInfo.opacity);
    }
    if (dayInfo && dayInfo.pos !== 'off' && A.dayCounterCompositeOntoCanvas) {
      A.dayCounterCompositeOntoCanvas(ctx, w, h, dayInfo, 1, dayInfo.pos);
    }
    // §CPE_PATH_OVERVIEW — drawn LAST so its backdrop-blur samples the finished frame and never
    // smears the caption or the counter into its own glass. `ovInfo.pose` is the REAL pose this
    // frame was rendered with, captured by the caller immediately before this call.
    // §CPE_RESOURCE_PANEL — drawn between the counter and the overview, one column, one corner.
    // Same never-kills-a-bake contract as the box below it.
    // §CPE_HUD_ORDER (2026-08-30, user after seeing a real baked frame): counter -> PATH BOX -> pie.
    // The path box answers "where am I", which a viewer tracks continuously, so it sits directly
    // under the clock; the pie is a readout you consult rather than follow, so it goes below.
    // ONE running offset builds the column so the three can never overlap or leave a gap.
    var _gapY = Math.round(h * 0.012);
    var _stackY = 0;
    if (dayInfo && dayInfo.pos !== 'off' && A.dayCounterBoxSize) _stackY = A.dayCounterBoxSize(h).h + _gapY;
    if (ovInfo && ovInfo.ov && A.pathOverviewCompositeOntoCanvas) try {
      A.pathOverviewCompositeOntoCanvas(ctx, w, h, ovInfo.ov, ovInfo.pose, 1, ovInfo.pos, _stackY);
      _stackY += Math.round(h * 0.20) + _gapY;   // the box's own bh, from cpe_path_overview.js
    } catch (eOvD) {
      if (!A._ovDrawErrLogged) { A._ovDrawErrLogged = true;
        console.warn('§CPE_PATH_OVERVIEW_ERR draw: ' + eOvD.message + ' — box skipped, frames continue'); }
    }
    if (resInfo && resInfo.info && A.resourcePanelCompositeOntoCanvas) try {
      A.resourcePanelCompositeOntoCanvas(ctx, w, h, resInfo.info, 1, resInfo.pos, _stackY);
    } catch (eRp) {
      if (!A._resDrawErrLogged) { A._resDrawErrLogged = true;
        console.warn('§CPE_RESOURCE_PANEL_ERR draw: ' + eRp.message + ' — panel skipped, frames continue'); }
    }
    if (statInfo && statInfo.shown && A.bigStatsCompositeOntoCanvas) try {
      // §CPE_PIE_HOLD — statInfo.held is the composition the pie holds beside the card.
      A.bigStatsCompositeOntoCanvas(ctx, w, h, statInfo.shown, 1, statInfo.pos, _stackY, statInfo.held);
    } catch (eBs) {
      if (!A._bsDrawErrLogged) { A._bsDrawErrLogged = true;
        console.warn('§CPE_BIG_STATS_ERR draw: ' + eBs.message + ' — card skipped, frames continue'); }
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
    _active = true; _cancel = false;
    // §MAXQ_HIDDEN_PAUSE / §MAXQ_QUALITY counters are per-RUN, not per-session — a second bake must
    // not inherit the first one's pauses or its unconverged count and report someone else's health.
    _hiddenMsTotal = 0; _hiddenPauses = 0; _unconverged = 0;
    A._maxqActive = true;   // mirror for the cinema icon's busy/done check (panels.js)
    // §MAXQ_FRAME_BUDGET — the bake's still fold, cheaper than Alt+S's. Cleared on every exit path
    // below (_bakeBudgetRelease), so a still after a bake is never quietly degraded.
    A._stillBudget = { taa: MAXQ_STILL_BUDGET.taa, ao: MAXQ_STILL_BUDGET.ao };
    console.log('§MAXQ_FRAME_BUDGET taa=' + A._stillBudget.taa + ' ao=' + A._stillBudget.ao +
      ' renders/frame=' + (A._stillBudget.taa + A._stillBudget.ao) + ' (was 16+24=40) — bake only,' +
      ' Alt+S stills keep the full fold');
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
    var _clash = false;   // §CLASH_FILM_P1 — mesh-true clash pairs as persistent world content
    // §CPE_PATH_OVERVIEW — prepared ONCE (the box is static by design, the user's own word), then
    // only the camera head is projected per frame. Rides the Label ON checkbox: the user's ruling
    // was "It is user's choice as its the Label ON option", so it needs no toggle of its own.
    var _ovPath = null, _ovPos = 'tl', _resOps = null, _bigCards = null;
    // §CPE_STATS_TAIL — the Reveal 2nd round's film fraction, read off the plan's own topout.
    var _revealU = null;
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
        // §CPE_DISCIPLINE_REVEAL Mechanism C (prompts/CINEMA_DISCIPLINE_REVEAL.md) — both the round
        // and its visuals are real. effects.js's _cinemaPathPlan/poseAt inserts the retrace via this
        // same _ov.reveal flag, transparently to this file (plan.poseAt already returns the extended
        // film); A.cpeRevealApplyVisual(plan,_tn), called from the per-frame loop below, drives the
        // ARC/STR hide via A.filterDiscs. _reveal itself is only captured here for logging.
        _reveal = !!_ov.reveal;
        // §CLASH_FILM_P1 (MEP_CLASH_REVEAL_MOVIE.md) — clash_film.js builds the mesh-true pair set
        // ONCE below, before the frame loop; it is static world content, not per-frame work.
        _clash = !!_ov.clash;
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
          _resOps = window.tmOpsSnapshot();
          console.log('§CPE_RESOURCE_PANEL ' + (_resOps && _resOps.length
            ? ('on ops=' + _resOps.length + ' rates=' + (!!(window.LABOR_RATES)) + ' pos=' + _ovPos)
            : 'INCONCLUSIVE reason=no-ops — panel omitted, not blank'));
        } else if (_roomTitle) {
          console.log('§CPE_RESOURCE_PANEL INCONCLUSIVE reason=' +
            (!_bkState ? 'no-buildup-timeline' : 'no-ops-snapshot') + ' — panel omitted, not blank');
        }
        // §CPE_BIG_STATS — the second half's cards, built ONCE from real sources. The pie answers
        // "who is on site today", which is dead after §CPE_BUILDUP_TOPOUT: construction has finished
        // and no trade is active, so the panel drew nothing for the whole reveal round.
        if (_roomTitle && A.bigStatsBuild && _bkState) {
          _bigCards = A.bigStatsBuild(_resOps, _bkState.projectStart, _bkState.projectEnd);
        }
      } catch (eR) { _resOps = null; _bigCards = null; console.warn('§CPE_RESOURCE_PANEL_ERR ' + eR.message + ' — panel disabled, bake continues'); }
      // ══ §CLASH_FILM_P1 — build the markers ONCE, before the first frame ═══════════════════
      // Deliberately BEFORE the loop and never inside it: the narrow phase costs ~2 s on Terminal,
      // and the pair set is static. The markers are a FORECAST (§3b) — they stand from frame 0 over
      // empty ground while the buildup rises around them, so nothing here consults the TM cursor.
      var _filmSecFull = (_clip && _clip.out > _clip.in) ? (nFrames / (_clip.out - _clip.in)) / fps : nFrames / fps;
      if (_clash && A.clashFilm && A.clashFilm.build) {
        try { await A.clashFilm.build(); }
        catch (eCF) { console.warn('§CLASH_FILM_BUILD failed: ' + (eCF && eCF.message) + ' — the film bakes without markers'); }
        // §CLASH_FILM_P2 — fresh hysteresis/fade state per bake; a previous bake's "near" set must
        // not leak into this one's first frame.
        if (A.clashLabels && A.clashLabels.reset) try { A.clashLabels.reset(); } catch (eCLr) {}
      } else if (_clash) {
        console.warn('§CLASH_FILM_BUILD INCONCLUSIVE reason=clash_film.js not loaded — nothing judged');
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
        await _raf2('frame ' + i + ' settle');
        // §MAXQ_STAGE_KEEP: SETTLE_MS existed to keep the NEXT staging from capturing mid-restore
        // sun-tint/exposure values as "original" (see its declaration). With staging kept alive
        // there is no restore in flight — sleep only when staging is actually down (frame 0, or a
        // teardown forced by an interaction mid-bake).
        if (!A._photoStagingOn) await _sleep(SETTLE_MS);
        _freezeRandom();
        var _tn = nFrames > 1 ? i / (nFrames - 1) : 0;
        var pose = poseAt(_tn);  // tNorm hits 1.0 on the last frame so the pull-back completes
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
          var _bkMs = _workCursorAt(_bkT, _bkState, nFrames / fps);
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
        // §CPE_DISCIPLINE_REVEAL Mechanism C — pure function of (plan, tNorm), same call the preview
        // loop makes (cinema_path_editor.js's _previewFly) so bake and preview cannot diverge. No-op
        // (returns immediately, does nothing) when reveal is off or tNorm is outside the round.
        // §CPE_CLIP_REVEAL_FILM_T (2026-09-04, found by §SDC's clipped bake — PHOTOREAL_STILL_RENDER.md
        // §BME.8): the Reveal, its lights-off phase and its caption are functions of the FILM's
        // fraction, and a clip is fewer frames of the SAME film (§CPE_CLIP). Feeding them the clip-
        // local _tn played the whole Reveal round inside a 23-frame window. A full bake is unchanged
        // (_tFilm(_tn) === _tn when no clip is set).
        var _tnFilm = _tFilm(_tn);
        if (A.cpeRevealApplyVisual) A.cpeRevealApplyVisual(plan, _tnFilm);
        // §CLASH_FILM_P1 (§4) — the pulse is a pure function of FILM seconds, never
        // performance.now(), so a 15 fps and a 24 fps bake of the same film pulse identically and a
        // re-bake is reproducible. Per-instance, so phase 2 can hold a labelled pair solid while the
        // rest keep breathing (§4b). No TM predicate here: the markers are a forecast (§3b).
        // §CLASH_FILM_P2 — the label selector runs BEFORE clashFilm.update so the fade it writes
        // (labelled → solid) lands in THIS frame's marker colours. Proximity + hysteresis + screen-
        // space placement only; it reads the camera and never moves it (ruling 3). The record is
        // handed to _captureFrame below, which draws it in the 2D pass (§P2.2).
        _lblInfo = null;
        if (_clash && A.clashLabels && A.clashLabels.update) {
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
        A.startStillRefine();
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
        if (A._sunArcStep) A._sunArcStep(_tnFilm);
        var ok = await _waitFoldDone(30000, 'cook of frame ' + i + '/' + nFrames);
        await _raf2('frame ' + i + ' capture');
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
        var _titleInfo = (A.cpeRevealCaptionAt) ? A.cpeRevealCaptionAt(plan, _tnFilm) : null;   // §CPE_CLIP_REVEAL_FILM_T
        if (!_titleInfo) {
          _titleInfo = (_titleSegs && A.roomTitleOpacityAt) ? A.roomTitleOpacityAt(_titleSegs, i / fps) : null;
        }
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
        var _inReveal = (_revealU != null)
          ? (nFrames > 1 ? (i / (nFrames - 1)) >= _revealU : false)
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
          var _si = A.tailPanelAt(_bigCards, i / fps, null);
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
        var blob = await _captureFrame(w, h, _titleInfo, _dayInfo, _ovInfo, _resInfo, _statInfo, _lblInfo);
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
      _workPacingReset();
      // §CLASH_FILM_P2 — say what the labels did over the whole film (VACUOUS if the camera never
      // came within 4 m of a pair), then release the selector's state with the markers.
      if (_clash && A.clashLabels && A.clashLabels.summary) { try { A.clashLabels.summary(framesDone); A.clashLabels.reset(); } catch (eCLs) {} }
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
      try { _workPacingReset(); } catch (e5) {}
      // §CLASH_FILM_P1 — same restore on the THROW path (review of #1678): a throw inside the loop
      // skips the in-try dispose above and would leave the marker InstancedMeshes in the user's
      // scene. dispose() is idempotent, so after a normal exit this is a silent no-op.
      try { if (A.clashFilm && A.clashFilm.dispose) A.clashFilm.dispose(); } catch (eCFd2) {}
      // §CLASH_FILM_P2 — same: a thrown loop leaves the label's hysteresis/fade state for the next bake otherwise.
      try { if (A.clashLabels && A.clashLabels.reset) A.clashLabels.reset(); } catch (eCLr2) {}
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
        if (o.flags) ['buildup', 'roomTitle', 'reveal', 'dayCounter', 'clash'].forEach(function(fk) {
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
          ' reveal=' + (ov.reveal ? 1 : 0) + ' dayCounter=' + (ov.dayCounter || 'tr'));
        await start({ editor: false, preview: false, override: ov, overrideSource: src,
                      frames: o.frames, fps: o.fps, forceWebm: o.forceWebm });
        return { source: src, deliveredBytes: window.__maxqDeliveredBytes || 0 };
      };
      clearInterval(_attach);
    }
  }, 500);
})();
