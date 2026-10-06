// cpe_load_path family — part `backdrop_diag` (original cpe_load_path.js lines 2833–3187).
// Split mechanically from the single file (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §5, 2026-10-06). The only edits:
// names shared across parts are reached through LP (the one shared object setupCpeLoadPath creates), and top-level
// `var` statements run as assignments in phase 2 (their names are hoisted to this part, as before). Load order and the
// two-phase setup live in cpe_load_path.js. Witness: viewer/tests/witness_cpe_load_path_surface.js (W-LP-SURFACE).
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts = (typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts.backdrop_diag = function __lpPart_backdrop_diag(A, LP) {
  'use strict';
  // literal-valued constants, verbatim (evaluating a literal earlier changes nothing)
  var _bdSeen = null;

  // ══ §129.7 item 6 (2026-09-16, user: "the background earth, silhouette and sky to disappear in
  // black... add it, fade in and out"; sharpened by the coordinator: the fade rides the FILM CLOCK
  // in MOVING film — ~0.5s BEFORE arm (ending black exactly at arm) and ~0.5s AFTER release
  // (starting black exactly at release); the FROZEN hold itself is a constant (same tFilm as arm,
  // nothing to interpolate) ══════════════════════════════════════════════════════════════════════
  // Pure — `fSec`/`holdStartSec`/`holdEndSec` all in the SAME real-seconds units _lp already uses
  // (holdStartSec/holdEndSec are the PLANNED hold window, known from the hold-point search at BUILD
  // time — no need to wait for arm to actually happen to start the pre-arm fade). Node-dry-runnable
  // with plain numbers, same convention as _ladderLayout/_freeVerticalSpan above.
  // Fix (2026-09-16, 3rd investigation into §LOADPATH_BACKDROP_DIAG's appliedBlackOnce staying
  // false all the way to release, confirmed via §LOADPATH_BACKDROP_FSEC_DIAG's own numbers against
  // a real HHS bake) — the live `fSec` a caller passes is whatever frame cinema_maxq.js's own
  // frame-splice actually rendered, which `_lpFrameForArmTn` (cinema_maxq.js:1648, `Math.round`)
  // grid-snaps to the NEAREST frame of the CONTINUOUS, unsnapped `holdStartSec`/`holdEndSec` this
  // pure formula compares against — by construction up to half a frame's worth of real seconds off,
  // either side. The old strict `<`/`<=` boundary never returned exactly 1 for the WHOLE hold
  // whenever the snap rounded short — root-caused from code + real bake numbers, not guessed.
  // `eps` = one frame's duration at THIS hold's own fps (2x the max 0.5-frame snap error — a
  // comfortable margin that still fails a real multi-frame regression, never so loose it would mask
  // one). `fps` is optional (falls back to 24) so every existing/other caller (node dry runs
  // included) keeps working unchanged — this stays pure/dry-runnable with plain numbers.
  // §129.14 FIX (2026-09-18, real bake evidence, `§LOADPATH_FSEC_DIAG`/`§LOADPATH_BACKDROP_APPLY_
  // DIAG` on HHS_loadpath_r76-r79) — the ramp-OUT used to compare live `fSec` against the ABSOLUTE
  // `holdEndSec`. That is correct ONLY if `fSec` advances continuously through the whole hold. It
  // doesn't: the beat's own clock-freeze (§129.6 item 1, cinema_maxq.js) PINS `fSec` at `holdStartSec`
  // for the entire spliced hold, then resumes counting UP FROM THAT SAME PINNED VALUE once released —
  // so `fSec` has to count through the WHOLE `(holdEndSec-holdStartSec)` span AGAIN, in real POST-
  // RELEASE film-time, before it ever crosses `holdEndSec` and the ramp even starts. Measured: a
  // 6-second hold left the backdrop (52/52 items, `_bd.items`) pinned at `opacity=0` for ~6 more real
  // seconds after the camera had already visually resumed moving — not the intended 0.5s symmetric
  // fade. `A._sky`'s own SEPARATE hide/show restore (not fSec-gated at all, flipped instantly at the
  // real frame-splice release) was never affected — which is why sky/ground LOOKED fine in the prior
  // session's diagnostic while this opacity-driven population (skyline silhouette boxes etc) stayed
  // black. Fix: ramp OUT from the TRUE release moment (`releaseFSec`, the real fSec captured once at
  // the frame-splice release trigger, `A._loadPathReleaseTFilm * _lp.filmSecFull` — see call site),
  // never from the stale `holdEndSec` threshold `fSec` may take seconds to naturally reach.
  // §129.17 FIX (2026-09-18, red1: "the back[drop] still wipes as it is not grouped together with
  // HUD/overlay that does fade off/on... the fade back in also shows the background cuts in without
  // syncing with the rest" / "ensure it is same fade effect, not a wipe") — the arm-side fade used to
  // run BEFORE arm (`[holdStartSec-fadeSec, holdStartSec]`, driven by the continuously-advancing
  // pre-arm `fSec`), finishing to fully black BEFORE the hold visually starts at all. CONFIRMED via a
  // real extracted frame (HHS_loadpath_r81, one frame before arm): the skyline was already solid
  // black while the building/HUD were still completely normal — a full fadeSec of "nothing else is
  // moving yet" before anything else even begins its own transition, which reads as an abrupt,
  // disconnected cut rather than one unified fade. Cut/whiten structurally CANNOT fade in before arm
  // (its clones/cut plane don't exist until arm builds them — §129 OPEN ITEM's own comment) and HUD's
  // own fade-out already starts AT arm, so the fix brings backdrop into that SAME window instead:
  // driven by `elapsed` (the hold's own internal clock, correctly advances even while `fSec` is
  // frozen — see §129.14's own root-cause writeup for why `fSec` alone can't drive an arm-side ramp)
  // exactly like `_cutT` already does, not by `fSec`. Still a genuine OPACITY fade throughout, same
  // mechanism as before and same as HUD/cut-whiten's own colour lerp — only the TIMING WINDOW moved,
  // never becoming a geometric wipe. The RELEASE side is untouched: it already starts AT true release
  // (§129.14/§129.16), matching cut/whiten's own release timing, and `fSec` correctly advances again
  // post-release so the original fSec-driven mechanism is still the right tool there.
  function _backdropFadeT(elapsed, inWindow, fSec, fadeSec, releaseFSec) {
    if (!(fadeSec > 0)) return 0;
    if (releaseFSec != null) return Math.max(0, Math.min(1, 1 - (fSec - releaseFSec) / fadeSec));
    if (!inWindow || elapsed == null) return 0;   // not armed yet — nothing to fade, matches cut/whiten
    return Math.max(0, Math.min(1, elapsed / fadeSec));   // same curve as cut/whiten's own _cutT
  }   // persists across calls — lets _backdropTopUp() know what's already captured
  function _backdropCapture() {
    if (LP._bd) return LP._bd;
    var objs = LP._allElseObjects();
    var items = [];
    _bdSeen = (typeof Set !== 'undefined') ? new Set() : null;
    function addMat(m) {
      if (!m) return;
      if (_bdSeen) { if (_bdSeen.has(m)) return; _bdSeen.add(m); }   // shared materials (e.g. cached staffage) fade once, not N times
      items.push({ mat: m, opacity: (m.opacity != null ? m.opacity : 1), transparent: !!m.transparent });
    }
    objs.forEach(function (o) {
      var mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach(addMat);
    });
    LP._bd = { items: items, objCount: objs.length, renderer: null };
    if (A.renderer && typeof A.renderer.getClearColor === 'function' && typeof THREE !== 'undefined') {
      var c = new THREE.Color(); A.renderer.getClearColor(c);
      LP._bd.renderer = { color: c.clone(), alpha: (typeof A.renderer.getClearAlpha === 'function') ? A.renderer.getClearAlpha() : 1 };
    }
    console.log('§LOADPATH_BACKDROP_POPULATION allElseCount=' + LP._bd.objCount + ' materials=' + LP._bd.items.length);
    return LP._bd;
  }
  // Fix (2026-09-17, red1: "background complete fade off" — root-caused via a real diagnostic, not
  // guessed: a real bake showed `pointsInScene=0` at the exact moment `_backdropCapture()` ran, even
  // though `§PHOTO_PROPS built windowLights=4824` had already fired earlier — the skyline-lights/
  // glow-points objects genuinely did not exist/weren't visible yet at this hold's OWN first capture,
  // which `loadPathBuild` deliberately takes early, well before any fade — see `_bd`'s own comment for
  // why re-capturing OPACITY mid-fade is unsafe (ROUND 16). But that comment ALSO says the POPULATION
  // scan alone is safe to redo at any point — this is exactly that, done as narrowly as possible: a
  // TOP-UP, called only while `t` is still EXACTLY 0 (nothing has started fading for ANY object yet,
  // by definition, since `_backdropFadeT` returns 0 strictly before the ramp begins) — finds any
  // object `_allElseObjects()` now returns that ISN'T already in `_bd.items` (photo-staging settling
  // late, or any future case of a background object appearing after this hold's own build), and adds
  // it with its CURRENT (genuinely still-unfaded, because t=0 guarantees nothing touched it yet)
  // opacity as its baseline. NEVER touches an already-captured entry — additive only.
  function _backdropTopUp() {
    if (!LP._bd || !_bdSeen) return;
    var objs = LP._allElseObjects();
    var added = 0;
    objs.forEach(function (o) {
      var mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach(function (m) {
        if (!m || _bdSeen.has(m)) return;
        _bdSeen.add(m);
        LP._bd.items.push({ mat: m, opacity: (m.opacity != null ? m.opacity : 1), transparent: !!m.transparent });
        added++;
      });
    });
    if (added > 0) {
      LP._bd.objCount = objs.length;
      console.log('§LOADPATH_BACKDROP_POPULATION_TOPUP added=' + added + ' allElseCount=' + LP._bd.objCount + ' materials=' + LP._bd.items.length);
    }
  }
  // `t`: 0 = normal, 1 = fully black. Fades OPACITY toward 0 (revealing the renderer's own clear
  // colour, which is lerped toward black in lockstep) rather than guessing at each shader's own
  // colour math (A._sky is a physically-based Sky shader with no simple "diffuse colour" to lerp).
  // Control `window.__lpBackdropNoRestore=1` — stops RE-PINNING the frozen black state once reached
  // (real hold frames never need re-pinning since nothing else touches these materials during a
  // FOCUS-suppressed hold; this control exists purely so a dry run can prove the witness catches a
  // broken pin: perturb the materials mid-hold, and without re-pinning the perturbation survives to
  // the release-frame snapshot, so `restored=false`).
  function _backdropApply(t) {
    // ROUND 16 item 3 (§129.9 item 3, 2026-09-16, user: "Would fade to black helps?" — yes) — the
    // §129.7 item 6 backdrop fade now applies in BOTH look modes: sky/ground/context silhouette fade
    // to black before the freeze and back after release exactly as ghost mode always did; the
    // building itself is untouched here (shine-through's own clones render on top, depthTest=false,
    // renderOrder above everything — they stay lit and visible regardless of the backdrop's own
    // opacity). Previously gated to `_lookGhost()` only ("no need to fade off background" — SUPERSEDED
    // by this round's own ruling); `t` is still computed and passed every frame (pure, cheap)
    // regardless of mode, so the caller needs no branch of its own.
    var bd = _backdropCapture();
    // Fix (2026-09-17) — was gated to `t === 0` only ("nothing has started fading for anything yet").
    // That misses anything that turns visible LATER, mid-hold (`indoorHallTint` — a floor-decal
    // annotation driven by its own `_tnFilm`-based beat, settling opaque well after t first reached
    // 1). `_backdropTopUp`'s own logic already only ADDS objects never seen before, captured at
    // THEIR OWN current (real, untouched) opacity — safe at any t, not just t===0, which is why this
    // is a widened gate, not a new mechanism. Running it every frame is the only way to catch
    // something that appears at an arbitrary point during the hold, not just right at its start.
    _backdropTopUp();
    // Finding-2 re-fix (2026-09-16) — the guard used to read `t >= 1 && noRestore && appliedOnce`,
    // which only suppresses re-pinning while STILL fully black. By the release/witness-check frame,
    // `t` has usually already dropped below 1 (fade-out under way), so THIS frame's own normal apply
    // silently re-pins the correct value from the frozen original before the witness ever reads the
    // material — erasing an external perturbation's evidence one frame before it can be measured.
    // Once black has been reached once under this control, skip re-pinning for the REST of the
    // hold's lifecycle (not just while t>=1), so a mid-hold perturbation survives all the way to the
    // release-frame §LOADPATH_BACKDROP snapshot as the control's own doc comment always intended.
    if (window.__lpBackdropNoRestore && A._loadPathBackdropAppliedBlackOnce) return;
    var reachedBlack = (t >= 1);
    if (reachedBlack) A._loadPathBackdropAppliedBlackOnce = true;
    var op = 1 - t;
    bd.items.forEach(function (e) { e.mat.transparent = true; e.mat.opacity = op * e.opacity; });
    if (bd.renderer && A.renderer && typeof A.renderer.setClearColor === 'function' && typeof THREE !== 'undefined') {
      var black = new THREE.Color(0, 0, 0);
      A.renderer.setClearColor(bd.renderer.color.clone().lerp(black, t), bd.renderer.alpha);
    }
    // §129.14 — root-caused the black patch to `_backdropFadeT`'s ramp-out being keyed to `fSec`
    // recrossing `holdEndSec`, which the clock-freeze made take almost a full extra hold-duration of
    // real post-release time (see that function's own comment + the fix at its call site). Kept as a
    // standing regression witness, cheap, capped: `staleDespiteHighBaseline` should now settle to 0
    // within a handful of post-release frames, not ride at 46/52 for 20+ frames the way it did pre-fix.
    if (A._loadPathRestoreCount > 0 && !A._loadPathHoldFrameActive) {
      if (!A._lp129BackdropApplyLogCount) A._lp129BackdropApplyLogCount = 0;
      if (A._lp129BackdropApplyLogCount < 20) {
        A._lp129BackdropApplyLogCount++;
        var _stale = 0, _atZero = 0;
        bd.items.forEach(function (e) { if (e.opacity >= 0.5 && e.mat.opacity <= 0.01) _stale++; if (e.mat.opacity <= 0.01) _atZero++; });
        console.log('§LOADPATH_BACKDROP_APPLY_DIAG t=' + t.toFixed(4) + ' op=' + op.toFixed(4) +
          ' items=' + bd.items.length + ' atZeroOpacityNow=' + _atZero +
          ' staleDespiteHighBaseline=' + _stale + ' restoreCount=' + A._loadPathRestoreCount);
      }
    }
    // Coordinator addition (2026-09-16) — sample the LIVE material state at the black point, ONCE,
    // the first real frame it actually happens: not "the formula says t=1", the MATERIALS themselves,
    // read back right after the assignment above. EPS is opacity noise tolerance only (float rounding
    // through `op*e.opacity`), never a visibility threshold.
    if (reachedBlack && !LP._blackSample) {
      var EPS = 0.01, faded = 0;
      bd.items.forEach(function (e) { if (e.mat.opacity <= EPS) faded++; });
      LP._blackSample = { faded: faded, total: bd.items.length };
    }
  }
  function _backdropSnapshot() {
    var bd = _backdropCapture();
    return bd.items.map(function (e) { return +e.mat.opacity.toFixed(4); });
  }
  // ROUND 4 item 3 (2026-09-16) — the EXPECTED snapshot for a given fade fraction `t`, computed
  // fresh from the captured ORIGINALS (never a live read), for the "same-frame" restored check
  // below: what the live material SHOULD show at this exact `t`, independent of when it is asked.
  function _backdropExpected(t) {
    var bd = _backdropCapture();
    return bd.items.map(function (e) { return +((1 - t) * e.opacity).toFixed(4); });
  }
  function _backdropRestore() {
    if (!LP._bd) return;
    LP._bd.items.forEach(function (e) { e.mat.opacity = e.opacity; e.mat.transparent = e.transparent; });
    if (LP._bd.renderer && A.renderer && typeof A.renderer.setClearColor === 'function') A.renderer.setClearColor(LP._bd.renderer.color, LP._bd.renderer.alpha);
  }
  // WITNESS `§LOADPATH_BACKDROP allElseCount=N allElseAtBlack=n/N fadeInFrames=k black=… fadeOutFrames=m
  // restored=… => PASS|FAIL|INCONCLUSIVE`, fired once, at release. `black`: the pure formula reads 1
  // at holdStartSec (arm) AND at midSec (hold's own middle frame, already computed once by
  // `A.loadPathBuild` as `_lp.midSec`) — a real regression guard, not a tautology: it would catch a
  // future off-by-one on the frozen-branch boundary. ROUND 4 item 3 (2026-09-16, real Terminal bake:
  // `restored=false` on a run with nothing actually broken) — the ORIGINAL `restored` compared the
  // arm snapshot against the release snapshot: two DIFFERENT tFilm moments (the release frame's OWN
  // fSec can land past `holdEndSec` by a partial frame, so its own correct `t` is already < 1 —
  // legitimately, not a bug) — "a moving target", never reliably equal even when nothing is wrong.
  // Fixed: `restored` now recomputes the EXPECTED opacity for the RELEASE FRAME'S OWN fSec (fresh
  // from the pure formula, via `_backdropExpected`) and compares it against the LIVE material's
  // CURRENT (same-instant) state — "is the backdrop what the film's own clock says it should be right
  // now", immune to which exact moment happens to be "release". Both `expected`/`live` are now arrays
  // over the FULL generalized population (`bd.items`, ground included), so `restored` proves the
  // broadened population is put back, not just ground/sky as before.
  // `allElseCount`/`allElseAtBlack` (coordinator addition, 2026-09-16) — PRIMAL LAW clause 4 (never a
  // vacuous pass): an empty population makes every check below vacuously true, so it reads
  // INCONCLUSIVE, never a silent PASS. `allElseAtBlack` reports the LIVE material sample taken in
  // `_backdropApply` at the real black point (`_blackSample`), never re-derived from the formula.
  function _backdropWitness(lp, releaseFSec) {
    // ROUND 16 item 3 — the backdrop fade (and this witness) now runs in BOTH look modes; the old
    // shine-through INCONCLUSIVE early-return is REMOVED (§129.8 item 1's "no need to fade off
    // background" is superseded by this round's own ruling — see _backdropApply's own comment).
    var fps = lp.fps || 24;
    var k = Math.max(1, Math.round(LP.BACKDROP_FADE_SEC * fps));
    var m = k;   // same fadeSec both directions by design; kept separate for a future asymmetric ruling
    // §129.17 — `blackAtArm` is no longer a meaningful check under the new elapsed-driven arm-side
    // fade: AT the exact arm instant elapsed=0, so `t` is DEFINED to read 0 there now (the fade's own
    // starting point, by design — checking "black at arm" the old way would be a tautological FAIL
    // against the very fix just made). The real regression guard is the hold's own MIDDLE: well past
    // one fadeSec into any hold long enough to have a middle at all, `t` must have reached 1.
    var midElapsed = lp.midSec - lp.holdStartSec;
    var black = _backdropFadeT(midElapsed, true, null, LP.BACKDROP_FADE_SEC, null) === 1;
    // §129.24 — backdrop no longer ramps at release at all (see `_backdropApply(inWindow?1:0)`'s own
    // call site comment): the moment release happens, `inWindow` is ALREADY false, so the live `t` is
    // ALREADY `0` — instant, matching the building's own instant clip. `tRelease` is fixed at 0
    // rather than re-derived from `_backdropFadeT`'s own ramp formula (which no longer drives the
    // live value at all) — using the old formula here would assert a ramp that the real code hasn't
    // run since this fix, a stale expectation, not a real regression guard.
    var tRelease = 0;
    var expected = _backdropExpected(tRelease), live = _backdropSnapshot();
    var restored = JSON.stringify(expected) === JSON.stringify(live);
    var bd = _backdropCapture();
    var vacuous = bd.objCount === 0;
    var atBlackStr = LP._blackSample ? (LP._blackSample.faded + '/' + LP._blackSample.total) : 'unsampled';
    var allElseFadedOk = !vacuous && !!LP._blackSample && (LP._blackSample.faded === LP._blackSample.total);
    var verdict = vacuous ? 'INCONCLUSIVE' : ((black && restored && allElseFadedOk) ? 'PASS' : 'FAIL');
    console.log('§LOADPATH_BACKDROP allElseCount=' + bd.objCount + ' allElseAtBlack=' + atBlackStr + ' faded' +
      ' fadeInFrames=' + k + ' black=' + black + ' fadeOutFrames=' + m +
      ' restored=' + restored + ' => ' + verdict);
    // Coordinator addition (2026-09-16) — ONE tied-together confirmation spanning BOTH halves of "no
    // other layers HUDs, background, sun lit sky, ground": HUD suppression (§LOADPATH_FOCUS, sampled
    // mid-hold by cinema_maxq.js, stashed on A._loadPathFocusLastResult) and backdrop/context fade
    // (this witness), read together so neither half has to be trusted/cross-referenced alone.
    var focus = A._loadPathFocusLastResult;
    var focusStr = focus ? ((focus.ok ? 'PASS' : 'FAIL') + '(painted=' + focus.painted + ' unwrappedDraws=' + focus.unwrappedDraws + ')') : 'n/a';
    var backdropStr = verdict + '(allElseCount=' + bd.objCount + ' allElseAtBlack=' + atBlackStr + ' restored=' + restored + ')';
    var bothOk = !!focus && focus.ok && verdict === 'PASS';
    console.log('§LOADPATH_CONTEXT_OFF hud=' + focusStr + ' backdrop=' + backdropStr + ' => ' + (bothOk ? 'PASS' : (vacuous || !focus ? 'INCONCLUSIVE' : 'FAIL')));
    return { ok: verdict === 'PASS', verdict: verdict };
  }
  // §129 DIAGNOSTIC (2026-09-17) — called by cinema_maxq.js's _captureFrame, IMMEDIATELY before the
  // render call that produces the actual encoded pixel, on hold frames only. Samples LIVE state off
  // the SAME arrays the apply-side witnesses already trust (_whitenTouched, _bd), from THIS SAME
  // closure — the only question left after every apply-side witness passed: is the mutated object
  // still the one about to be drawn, still mutated, right now, not undone by anything in between.
  function _diagSampleOne(w) {
    if (!w) return null;
    var m = w.mesh.material;
    return { kind: w.mesh.isInstancedMesh ? 'instanced' : (w.mesh.isBatchedMesh ? 'batched' : 'regular'),
      hasClone: m !== w.mat, color: m && m.color ? m.color.toArray() : null,
      clip: !!(m && m.clippingPlanes && m.clippingPlanes.length),
      visible: !!w.mesh.visible, inScene: !!(A.scene && w.mesh.parent),
      renderOrder: w.mesh.renderOrder, type: m ? m.type : null };
  }

  // phase-1 exports: other parts reach these through LP (same function objects, same identity)
  LP._backdropApply = _backdropApply;
  LP._backdropWitness = _backdropWitness;

  return function () {   // phase 2: this part's setup statements, in original order
  // Reuses whatever the film already has for backdrop/context — GENERALIZED 2026-09-16 (red1 direct
  // ruling: "ALL ELSE FADE OFF", superseding the old hand-picked ground/sky/skyline-only list): every
  // object `_allElseObjects()` returns (ground/sky/skyline/staffage/props/anything else that is not
  // this beat's own clone and not a recognized building element — see that function's own comment)
  // PLUS the renderer's own clear colour — NO new scene objects, NO enumerated exceptions.
  // Captured ONCE per hold build (lazily — first real call is `loadPathApplyVisual`'s own frame 0,
  // always well before any fade, since `A.loadPathBuild` runs "once, before the frame loop" and
  // resets `_bd`/`_blackSample` to null right there — see its own reset lines). Deliberately NOT
  // folded into `_resetRayCache()` (which ALSO runs at ARM, mid-fade, inside `_pickTwoStacks` — line
  // ~1173 above): re-capturing "original" opacities from materials that are already faded toward
  // black at that instant would corrupt every original this fade needs for the rest of the hold. The
  // POPULATION enumeration (`_allElseObjects()`, cheap identification only, no opacity read) is safe
  // to redo at either point; the OPACITY snapshot below is only ever taken here, at the one safe time.
  LP._bd = null;
  // §LOADPATH_BACKDROP live-at-black sample (coordinator addition, 2026-09-16) — populated ONCE by
  // `_backdropApply`, the FIRST real playback frame this hold's own fade actually reaches t=1, so the
  // witness (fired later, at release) can report the TRUE live material state at the black point —
  // not just that the pure `_backdropFadeT` formula says t should be 1 there. Reset alongside `_bd`.
  LP._blackSample = null;
  A._loadPathBackdropFadeT = _backdropFadeT; A.loadPathBackdropApply = _backdropApply;
  A.loadPathBackdropRestore = _backdropRestore; A._loadPathBackdropSnapshot = _backdropSnapshot;
  A._loadPathBackdropWitness = _backdropWitness; A._loadPathBackdropExpected = _backdropExpected;
  // §129.18 built `A._loadPathFadeT` as ONE shared ramp formula for backdrop, cut/whiten, and HUD —
  // superseded by §129.24/§129.27: backdrop and cut/whiten are both instant now (nothing left to
  // ramp), and HUD went back to its own dedicated formula (`_hudFadeT`, cinema_maxq.js) since
  // front-loading its release side needs the hold's own known `durSec`, not a detected `releaseFSec`.
  // The ONLY remaining caller of `_backdropFadeT` is `_backdropWitness`'s own arm-side "black by
  // midSec" check, a few lines below — kept as export in case a future diagnostic wants the pure
  // formula again, not because anything live still shares it.
  A._loadPathFadeT = _backdropFadeT;
  // Still genuinely shared — HUD's own fadeSec (cinema_maxq.js) reads this SAME cap so a hold too
  // short to fit a full fadeSec both ways degrades identically everywhere, one place, not per-caller.
  A._loadPathFadeSecFor = function (durSec) { return Math.min(LP.BACKDROP_FADE_SEC, (durSec || 0) / 2); };
  // §129 DIAGNOSTIC (2026-09-17) — DEFINITIVE pixel-to-object identification: raycast from the FROZEN
  // arm camera through the exact same NDC points the pixel-readback diagnostic samples, so "what is
  // actually at this screen point" is answered by real geometry, never guessed from a screenshot.
  A._loadPathDiagRaycast = function (ndcPairs, tag) {
    if (typeof THREE === 'undefined' || !A.camera || !A.scene) return;
    var ray = new THREE.Raycaster();
    var out = [];
    ndcPairs.forEach(function (p) {
      ray.setFromCamera(new THREE.Vector2(p[0], p[1]), A.camera);
      var hits = ray.intersectObjects(A.scene.children, true);
      // FIX (2026-09-17) — three.js's own Raycaster does NOT check `.visible` at all by default
      // (`Object3D.raycast` has no visibility gate; that's only applied by `traverseVisible`, never
      // by the raycaster) — it happily reports hits on objects this beat has explicitly hidden
      // (`obj.visible=false` in the unbatch fix). Every earlier reading of this diagnostic implicitly
      // assumed "raycast hit" meant "what the viewer sees" — true only while nothing was hidden yet.
      // Now checks the FULL ancestor chain's visibility, the same thing the renderer actually honours.
      function _visibleChain(o) { while (o) { if (o.visible === false) return false; o = o.parent; } return true; }
      // Raycasting has no concept of the stencil test — it would hit the cap plane's full geometric
      // extent regardless of where its FRAGMENT SHADER gets stencil-rejected (drawing nothing there).
      // Skip this beat's own overlay objects (stack clones AND the cap/stencil-companion meshes,
      // all flagged `_loadPathClone`) to find what a VIEWER actually sees exposed at this point.
      var h = null;
      for (var _hi = 0; _hi < hits.length; _hi++) {
        if (!(hits[_hi].object.userData && hits[_hi].object.userData._loadPathClone) && _visibleChain(hits[_hi].object)) { h = hits[_hi]; break; }
      }
      if (!h) {
        out.push(p.join(',') + '=miss(all ' + hits.length + ' hits were _loadPathClone or invisible: ' +
          hits.slice(0, 5).map(function (hh) { return (hh.object.name || hh.object.type) + (hh.object.visible === false ? '[hidden]' : ''); }).join(',') + ')');
        return;
      }
      var o = h.object;
      var isWhitened = LP._whitenTouched.some(function (t) { return t.mesh === o; });
      var g = null;
      try { g = A._loadPathIsBuildingElementObj ? A._loadPathIsBuildingElementObj(o) : null; } catch (e) {}
      // The intersection's OWN reported slot (`h.instanceId` for InstancedMesh, `h.batchId` for
      // BatchedMesh — whichever three.js's Raycaster actually populates for this hit) is the REAL
      // slot the renderer draws at this screen point. Read its LIVE colour right now via the SAME
      // getColorAt API this whole fix is built on, and separately check whether that exact slot
      // number is even a KEY in the reverse-index this fix enumerated — if it is not, the fix wrote
      // to the wrong universe of slots entirely.
      var realSlot = (h.instanceId != null) ? h.instanceId : (h.batchId != null ? h.batchId : null);
      var slotColorHex = 'n/a', wasInMap = 'n/a';
      if (realSlot != null && o.getColorAt) {
        try {
          if (!LP._whitenTmpColor && typeof THREE !== 'undefined') LP._whitenTmpColor = new THREE.Color();
          o.getColorAt(realSlot, LP._whitenTmpColor);
          slotColorHex = LP._whitenTmpColor.getHexString();
        } catch (eGc) { slotColorHex = 'err:' + eGc.message; }
        var _sm = LP._revInstanceIndex[o.id] || LP._revBatchIndex[o.id];
        wasInMap = !!(_sm && Object.prototype.hasOwnProperty.call(_sm, realSlot));
      }
      out.push(p.join(',') + '=' + (o.name || o.type) + '|instanced=' + !!o.isInstancedMesh +
        '|batched=' + !!o.isBatchedMesh + '|isStackClone=' + !!(o.userData && o.userData._loadPathClone) +
        '|isBuildingElem=' + g + '|inWhitenTouched=' + isWhitened + '|matType=' + (o.material && o.material.type) +
        '|matColor=' + (o.material && o.material.color ? o.material.color.getHexString() : 'n/a') +
        '|realSlot=' + realSlot + '|slotColorNow=' + slotColorHex + '|slotWasNeutralized=' + wasInMap +
        '|vertexColors=' + (o.material && o.material.vertexColors) +
        '|geomHasColorAttr=' + !!(o.geometry && o.geometry.attributes && o.geometry.attributes.color) +
        '|hasColorsTexture=' + !!(o._colorsTexture) + '|colorsTextureNeedsUpdate=' + (o._colorsTexture ? o._colorsTexture.needsUpdate : 'n/a') +
        '|matUUID=' + (o.material && o.material.uuid) + '|origMatUUID=' + (function(){var tt=LP._whitenTouched.filter(function(x){return x.mesh===o;})[0]; return tt?tt.mat.uuid:'n/a';})() +
        '|setColorAtSrc=' + (o.setColorAt ? o.setColorAt.toString().slice(0, 300) : 'n/a') +
        '|isBatchedMeshCtor=' + (o.constructor && o.constructor.name) +
        '|instanceMeta=' + (function () { var im = A._instanceMeta && A._instanceMeta[o.id]; var rec = im && realSlot != null ? im[realSlot] : null; return rec ? JSON.stringify(rec) : (im ? 'no-rec-for-slot' : 'no-instanceMeta-for-mesh'); })() +
        '|inBackdropPop=' + (function () { if (!LP._bd) return 'backdrop-never-captured'; return LP._bd.items.some(function (it) { return it.mat === o.material; }); })() +
        // §129.12 — the black-patch raycast (postRelFrame extension) hit a dark MeshBasicMaterial
        // that could either be a genuinely dark asset (correct) or one stuck opacity~0/transparent
        // against the black clear colour (the sky/indoorHallTint bug class) — matColor alone can't
        // tell those apart, opacity/transparent/the backdrop's OWN captured baseline for this exact
        // material can.
        '|liveOpacity=' + (o.material ? o.material.opacity : 'n/a') + '|liveTransparent=' + (o.material ? o.material.transparent : 'n/a') +
        '|bdCaptured=' + (function () { if (!LP._bd) return 'n/a'; var it = LP._bd.items.filter(function (x) { return x.mat === o.material; })[0]; return it ? ('origOpacity=' + it.opacity + ' origTransparent=' + it.transparent) : 'not-in-pop'; })() +
        // §129.14 — decisive check for the black-patch theory: is this literally one of the 40
        // photo-staging skyline silhouette boxes (`_buildPhotoProps`, effects.js)? `objUUID` (the
        // MESH's own uuid, never reused/cloned anywhere in this codebase) proves same-object-across-
        // frames vs two-different-adjacent-boxes, which `matUUID` alone can't (nothing clones
        // backdrop-population materials, so a differing matUUID across samples can only mean a
        // different object was hit, not a swapped material on the same one).
        '|objUUID=' + o.uuid + '|inPhotoSkyline=' + (A._getPhotoSkyline && A._getPhotoSkyline() ? (o.parent === A._getPhotoSkyline()) : 'no-skyline-group') +
        '|objVisible=' + o.visible + '|parentVisible=' + (o.parent ? o.parent.visible : 'no-parent'));
    });
    console.log('§LOADPATH_DIAG_RAYCAST' + (tag ? ' ' + tag : '') + ' ' + out.join(' '));
  };
  A._loadPathDiagSample = function (tag) {
    var regular = null, instanced = null, batched = null, nReg = 0, nInst = 0, nBatch = 0;
    for (var i = 0; i < LP._whitenTouched.length; i++) {
      var t = LP._whitenTouched[i];
      if (t.mesh.isInstancedMesh) { nInst++; if (!instanced) instanced = t; }
      else if (t.mesh.isBatchedMesh) { nBatch++; if (!batched) batched = t; }
      else { nReg++; if (!regular) regular = t; }
    }
    var b = LP._bd && LP._bd.items[0];
    var bLive = b ? { opacity: b.mat.opacity, transparent: b.mat.transparent } : null;
    console.log('§LOADPATH_DIAG tag=' + tag + ' armed=' + (LP._lp && LP._lp.armed) +
      ' whitenTouchedN=' + LP._whitenTouched.length + ' byType=regular:' + nReg + '/instanced:' + nInst + '/batched:' + nBatch +
      ' regular=' + JSON.stringify(_diagSampleOne(regular)) +
      ' instanced=' + JSON.stringify(_diagSampleOne(instanced)) +
      ' batched=' + JSON.stringify(_diagSampleOne(batched)) +
      ' backdropItemsN=' + (LP._bd ? LP._bd.items.length : 'n/a') + ' bdSample0=' + JSON.stringify(bLive) +
      ' capMeshesN=' + LP._capMeshes.length + ' localClippingEnabled=' + (A.renderer && A.renderer.localClippingEnabled) +
      ' sectionCutLiveDepth=' + (LP._lp && LP._lp.sectionCut ? LP._lp.sectionCut.liveDepth : 'n/a'));
  };
  };
};
