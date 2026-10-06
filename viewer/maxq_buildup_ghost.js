// cinema_maxq family — part `buildup_ghost` (original cinema_maxq.js lines 9–544).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/cinema_maxq.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as MQS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts = (typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts.buildup_ghost = function* __split_cinema_maxq_buildup_ghost(MQS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  MQS._workCursorAt = _workCursorAt;
  MQS._workPacingReset = _workPacingReset;
  MQS._buildupTopoutU = _buildupTopoutU;
  MQS._buildupTAt = _buildupTAt;
  MQS._ghostGroundArm = _ghostGroundArm;
  MQS._ghostGroundAt = _ghostGroundAt;
  MQS._ghostGroundRestore = _ghostGroundRestore;
  Object.defineProperty(MQS, '_ggSched', { get: function () { return _ggSched; }, set: function (v) { _ggSched = v; }, enumerable: true });
  Object.defineProperty(MQS, '_ggSpan', { get: function () { return _ggSpan; }, set: function (v) { _ggSpan = v; }, enumerable: true });
  Object.defineProperty(MQS, 'MAXQ_N_FRAMES', { get: function () { return MAXQ_N_FRAMES; }, set: function (v) { MAXQ_N_FRAMES = v; }, enumerable: true });
  Object.defineProperty(MQS, 'MAXQ_FPS', { get: function () { return MAXQ_FPS; }, set: function (v) { MAXQ_FPS = v; }, enumerable: true });
  Object.defineProperty(MQS, 'MAXQ_STILL_BUDGET', { get: function () { return MAXQ_STILL_BUDGET; }, set: function (v) { MAXQ_STILL_BUDGET = v; }, enumerable: true });
  Object.defineProperty(MQS, 'SETTLE_MS', { get: function () { return SETTLE_MS; }, set: function (v) { SETTLE_MS = v; }, enumerable: true });
  Object.defineProperty(MQS, 'IDB_NAME', { get: function () { return IDB_NAME; }, set: function (v) { IDB_NAME = v; }, enumerable: true });
  Object.defineProperty(MQS, 'IDB_STORE', { get: function () { return IDB_STORE; }, set: function (v) { IDB_STORE = v; }, enumerable: true });
  Object.defineProperty(MQS, '_active', { get: function () { return _active; }, set: function (v) { _active = v; }, enumerable: true });
  Object.defineProperty(MQS, '_cancel', { get: function () { return _cancel; }, set: function (v) { _cancel = v; }, enumerable: true });
  Object.defineProperty(MQS, '_fcIdx', { get: function () { return _fcIdx; }, set: function (v) { _fcIdx = v; }, enumerable: true });
  Object.defineProperty(MQS, '_wakeLock', { get: function () { return _wakeLock; }, set: function (v) { _wakeLock = v; }, enumerable: true });
  Object.defineProperty(MQS, '_wakeWired', { get: function () { return _wakeWired; }, set: function (v) { _wakeWired = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order

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
    // §ALTC_V3: a road film advances by pieces COMPLETED (the k-th completion at t = k/N), not by calendar days — v2 measured
    // all 5,674 road pieces placed by 4 s because the bridge's heavy structure owns most of the calendar.
    var _civilWork = !!(window.APP && window.APP.isCivilModel && window.APP.isCivilModel());
    if (BUILDUP_EVEN_TEMPO && !_civilWork) {
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
    // §ALTC_V2 V5 (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_V2): a road film tops out at the drive's midpoint —
    // the second half of the drive is the discipline parade (plan.reveal.inDrive, set only for civil models).
    if (plan && plan.reveal && plan.reveal.inDrive && plan.reveal.inDrive.a > 0 && plan.reveal.inDrive.a < 1)
      return { u: plan.reveal.inDrive.a, src: 'plan.reveal.inDrive.a (road film: build-up by the drive midpoint)' };
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
  // §FRAME_COST S5 (2026-10-01, red1: "As seen before … there is no slightly grainier visual"): ao 12 -> 8. 8/8 is the MEASURED row
  // above (RMS 0.37, AT THE FLOOR); 6 was never measured, so not taken. Saves 4 composer renders per frame (~0.2 s at 960x540).
  var MAXQ_STILL_BUDGET = { taa: 8, ao: 8 };
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
};
