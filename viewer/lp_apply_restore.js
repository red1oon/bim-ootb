// cpe_load_path family — part `apply_restore` (original cpe_load_path.js lines 3188–3848).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/cpe_load_path.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as LPS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts = (typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts.apply_restore = function* __split_cpe_load_path_apply_restore(LPS, A) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  LPS._forceRestore = _forceRestore;
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


  A.loadPathApplyVisual = function (plan, tNorm, holdCtl, frameHoldCtl) {
    try {
      if (plan === null) { _forceRestore(); return; }
      if (!LPS._lp || !LPS._lp.ok) return;
      var fSec = tNorm * LPS._lp.filmSecFull;
      // §129.6 item 1 (2026-09-15, after a real HHS bake showed a camera "resume jump"): window
      // membership and elapsed-hold-time come from cinema_maxq.js's own explicit `holdCtl`
      // ({inHold, elapsedSec}) — its own loop-index bookkeeping around the FROZEN/inserted hold
      // frames — NEVER re-derived from `fSec`, which the SAME fix freezes at the arm value for the
      // whole hold (so fSec is constant throughout and can no longer drive the reveal's own elapsed
      // time). `holdCtl` falsy (control tap `__lpNoClockFreeze`, or an old/other caller) used to fall
      // all the way back to the ORIGINAL fSec-based self-determination, reproducing the pre-fix
      // behaviour exactly, on purpose, for that control — see ROUND 19 below for why that fallback
      // alone was still wrong for THIS function's own internal pacing.
      // ROUND 19 (2026-09-16) — `frameHoldCtl` (new, optional 4th param) is cinema_maxq.js's own
      // frame-index-only signal, derived purely from the loop index against the frame-splice
      // boundaries (`_lpHoldFrameStart`/`_lpFramesInserted`), which __lpNoClockFreeze never touches
      // (Finding 4 left the splice/insertion itself unconditional). A continuously-advancing
      // (unfrozen) fSec blows past holdEndSec in only a handful of real rendered frames under that
      // control — long before all the spliced-in hold frames have rendered — starving this beat's
      // OWN internal reveal (STACK stalling partway, VISIBLE/FRAMING/... never reached) of the hold
      // frames it needs. When `holdCtl` is falsy but `frameHoldCtl` is supplied, window membership/
      // elapsed for THIS function's own arm/reveal/release cycle paces off the frame splice instead
      // of fSec; the arm/release tNorm stashed for §LOADPATH_RESUME is untouched — only the
      // reveal-pacing source changes. A caller supplying neither (old/other caller, node dry run)
      // keeps the original fSec fallback.
      var inWindow, elapsed;
      if (holdCtl) { inWindow = !!holdCtl.inHold; elapsed = holdCtl.elapsedSec; }
      else if (frameHoldCtl) { inWindow = !!frameHoldCtl.inHold; elapsed = frameHoldCtl.elapsedSec; }
      else { inWindow = fSec >= LPS._lp.holdStartSec && fSec < LPS._lp.holdEndSec; elapsed = fSec - LPS._lp.holdStartSec; }
      LPS._lp.holdElapsed = inWindow ? elapsed : null;   // §FREEZE_ANIM — the one clock every freeze panel's reveal reads (PERFORMANCE_AS_CLASH.md §19.4)
      // §129.24/§129.27 (2026-09-18, red1: "the background sky ground, building that needs to cut
      // out... separate from HUD overlays that fades off/on") — backdrop AND cut/whiten (below) are
      // both an instant step at the EXACT SAME moment (`inWindow`, arm/release) — the building's own
      // near-side facade pop is structurally instant (§129.22: per-container shared materials, no
      // cheap per-element fade), so backdrop stopped fighting it instead of running its own smooth
      // ramp next to an instant pop. HUD is the only thing that still eases (cinema_maxq.js's own
      // `_hudFadeT`, front-loaded so it finishes before release, never straddling this cut).
      // §129.33 (2026-09-19, red1: "let go of the ground... it's going out of its bound loop") — a
      // REAL, confirmed-via-full-movie-bake bug: this call used to run unconditionally EVERY FRAME OF
      // THE WHOLE FILM, the instant load-path finished building (which needs no playback progress at
      // all, just the pre-computed plan — effectively from frame 0). Outside its own hold it always
      // passed `t=0`, which still forces `mat.transparent=true` and re-pins `mat.opacity` on the
      // entire ground/sky/backdrop population every single frame, for the ENTIRE rest of the film —
      // permanently blocking whatever ELSE legitimately wants to animate those same materials (ground
      // opacity ramping in during construction, the day-to-dusk sun arc's own lighting response, etc).
      // A real Hospital full-movie bake showed the collateral damage directly: ground fine during the
      // actual hold (this call was always correctly scoped THERE), but forced into a stuck, wrong look
      // everywhere else in the film once something else tried to touch it. Whiten/cut (below) already
      // only acts between arm and release and cleanly disposes after — this call now matches that same
      // discipline: skip entirely outside `inWindow`/`_lp.armed`, so `_backdropCapture()`'s own lazy
      // first call happens AT ARM (a deliberate, stable moment — matching how whiten captures ITS OWN
      // "before" state) instead of racing whatever else the scene is doing at essentially frame 0, and
      // load-path releases the ground for good the instant `_restore()` clears `_lp.armed`.
      if (inWindow || LPS._lp.armed) LPS._backdropApply(inWindow ? 1 : 0);
      if (inWindow && !LPS._lp.armed) {
        LPS._lp.armed = true;
        A._loadPathVisualRev = (A._loadPathVisualRev || 0) + 1;   // §129.57 — the arm changes everything on screen
        // §129.16/§129.27 — the ladder/card vanish EXACTLY at true release, same frame `_lp.armed`
        // itself goes false again now (§129.27 collapsed the old "stays armed past release to sweep
        // the cut/whiten back" delay to a single instant) — kept as its own flag anyway (not just
        // `_lp.armed`) since `A.loadPathCompositeOntoCanvas` gates on it and a dedicated flag is
        // cheap insurance if release ever needs to span more than one frame again.
        LPS._lp.showLadder = true;
        // FIX (2026-09-17, found by tracing `A.startStillRefine()` — called EVERY frame of every
        // bake, `viewer/cinema_maxq.js` — which sets `A._taaPass.accumulate = true` unconditionally.
        // During normal navigation the camera keeps moving every frame, so accumulation has nothing
        // stable to build on; during THIS hold the camera is deliberately frozen for many seconds —
        // exactly the condition TAA accumulation is designed to exploit for quality. TAA has no
        // concept of "the material just changed" — it only resets on camera/geometry motion. Every
        // apply-side witness in this file proved the JS object state (material.color, per-slot
        // colour, clippingPlanes) was correct; a raycast+getColorAt cross-check at mid-hold confirmed
        // the exact slot the renderer draws was genuinely white. Only the ENCODED PIXEL disagreed —
        // because TAA kept blending in dozens of pre-change (real colour) samples, each new white
        // sample contributing a shrinking fraction, never converging within the hold. Resetting the
        // accumulation index the instant the hold arms (and every frame the fade is still moving,
        // below) makes the accumulator start fresh from the NEW state instead of diluting it forever.
        if (A._taaPass) A._taaPass.accumulateIndex = -1;
        // §129.6 item 1 — the tFilm value AT ARM, exposed for cinema_maxq.js's own §LOADPATH_RESUME
        // witness (a single source of truth: whatever tNorm actually was on THIS call, whether the
        // clock-freeze fix or the __lpNoClockFreeze control is in effect).
        A._loadPathArmTFilm = tNorm;
        LPS._lp.cursorAtEntry = (typeof window.tmGetState === 'function') ? window.tmGetState().cursor : null;
        // §129.8 item 4b — snapshot the HUD registry RIGHT NOW, before anything below can move on:
        // this is the ARM frame, the last frame cinema_maxq.js's own _captureFrame ran every OTHER
        // HUD drawer on before calling into load path (drawn LAST, see its own §HUD FIX comment) —
        // so A._hudLayoutRects already holds "what was on screen just before the freeze" (item 4b's
        // own wording for the underHud test), never the (about to be suppressed) hold-frame registry.
        LPS._lp.armHudRects = (A._hudLayoutRects || []).slice();
        // Finding 1 broadened fix (2026-09-16) — trigger cinema_maxq.js's own §HUD_LAYOUT_ARM sample
        // (same convention as A._loadPathMidHoldThisFrame below): THIS frame's own _captureFrame call
        // (still to come, later in the SAME bake-loop iteration) resets+repopulates A._hudLayoutRects
        // fresh, and at elapsedSec===0 the FOCUS fade (A._loadPathHudAlpha) hasn't started yet, so the
        // resource panel actually draws and registers real rects this frame — a real sample, not the
        // vacuous one the mid-hold witness gets once FOCUS fades everything out.
        A._loadPathArmFrameThisFrame = true;
        // ══ §129.8 items 2/3 — FINAL PICK AT ARM, ON THE LIVE CAMERA, TWO STACKS, OCCLUSION-SCORED.
        // Supersedes ROUND 9's single-chain live re-pick (same principle: WHEN stays the probe-based
        // hold-point search's own answer, `shot.tNorm`, already baked into `holdStartSec` at BUILD;
        // only WHICH CHAIN(S) light up is decided here) — now over the FULL candidate pool
        // (`_lp.validCandidates`), scored by real raycast occlusion x screen area (`_pickTwoStacks`),
        // never the probe-pose frustum-only ranking BUILD used only to size `durSec`. Runs BEFORE
        // `_buildChainClones`, so the clones/labels built for this hold are always the FINAL pick.
        (function () {
          var picked = (A.camera && LPS._lp.validCandidates && LPS._lp.validCandidates.length)
            ? LPS._pickTwoStacks(LPS._lp.items, LPS._lp.validCandidates, A.camera, LPS._lp.outW, LPS._lp.outH, LPS._lp.armHudRects, LPS._lp.buildingBox)
            // ROUND 14 — this fallback never even reaches _pickTwoStacks (no camera/candidates at
            // all), so it carries the SAME diagnostic field shape (never `undefined` on the print
            // line below) with honest zeros/none rather than omitting them.
            : { near: null, far: null, farReason: 'no-camera-or-candidates', pickSource: 'none',
                raycastBlind: false, blindReason: null, tier: null, visKey: null, raysCast: 0, hitsTotal: 0, selfHits: 0, universe: 0,
                validTotal: (LPS._lp.validCandidates ? LPS._lp.validCandidates.length : 0), scored: 0 };
          function hopsUpFrom(chainIdx) {
            var d = LPS._chainDrawnInfo(chainIdx);
            var up = d.drawnIdx.slice().reverse().map(function (i, k) {
              return { guid: LPS._lp.items[i].guid, cls: LPS._lp.items[i].cls, storey: LPS._lp.items[i].storey, idx: i, k: k };
            });
            up.forEach(function (h, k) { h.hex = LPS._hexForHop(k, up.length); });
            return { hopsUp: up, chainIdx: chainIdx, drawnInfo: d };
          }
          function fmtPick(s) { return s ? (LPS._lp.items[s.idx].guid + '(' + s.score.toFixed(1) + ',' + s.dist.toFixed(1) + ')') : 'none'; }
          // ROUND 12 item 1 — the rule that actually decided the pick, printed on the SAME line:
          // visibleHops=K/N (majority) (K = hops with unoccluded>=0.5 and not under the arm HUD) and
          // memberVis=[...] (every hop's own unoccluded, chain/top-down order — the exact numbers
          // §LOADPATH_FRAMING later reports too, never a second, disagreeing count).
          // ROUND 13/15 — reads `picked.visKey`, the count `_pickTwoStacks`'s own tier logic ACTUALLY
          // ranked by (never re-derived from `raycastBlind` alone — ROUND 15's own tier 2 also ranks
          // by `visibleHopsFrustum` while NOT blind, which the old `raycastBlind`-only re-derivation
          // could not tell apart from tier 1).
          function fmtVisibleHops(s) {
            if (!s) return 'n/a';
            var key = picked.visKey || 'visibleHopsMajority';
            return s[key] + '/' + s.chain.length + ' (' + (key === 'visibleHopsFrustum' ? 'frustum' : 'majority') + ')';
          }
          // ROUND 18 — `h.unoccluded` reads `null` on the new raycast-universe-too-large fallback
          // (occlusion genuinely never tested there) — print `n/a`, never a fabricated number.
          function fmtMemberVis(s) { return s ? '[' + s.perHop.map(function (h) { return h.unoccluded == null ? 'n/a' : h.unoccluded.toFixed(2); }).join(',') + ']' : '[]'; }
          // ROUND 15 item 1 — the class+guid of hop 0's dominant occluder (chain order, i.e. the
          // TOP of the drawn chain per _pick's own top-down convention — never re-ordered to ground-
          // up here), or `none` when hop 0 has no genuine (closer-than-the-box-face) occluder.
          function fmtOccluder(s) {
            if (!s || !s.perHop || !s.perHop.length) return 'none';
            var occ = s.perHop[0].dominantOccluder;
            return occ ? ((occ.cls || 'unknown') + ':' + occ.guid) : 'none';
          }
          if (picked.near) {
            var nb = hopsUpFrom(picked.near.chain);
            LPS._lp.pickItem = LPS._lp.items[picked.near.idx];
            LPS._lp.hopsUp = nb.hopsUp;
            LPS._lp.nearScore = picked.near; LPS._lp.memberVis = picked.near.perHop;
            LPS._printChainWitness(LPS._lp.items, LPS._lp.pickItem, nb.chainIdx, nb.drawnInfo, 'live');
          }
          if (picked.far) {
            var fb = hopsUpFrom(picked.far.chain);
            var farPickItem = LPS._lp.items[picked.far.idx];
            LPS._lp.far = { name: 'far', pickItem: farPickItem, hopsUp: fb.hopsUp, chainBox: null,
              revealedHops: 0, stackOk: undefined, durSec: LPS._lp.farDurSec, score: picked.far,
              memberVis: picked.far.perHop };
            LPS._printChainWitness(LPS._lp.items, farPickItem, fb.chainIdx, fb.drawnInfo, 'live');
          } else {
            LPS._lp.far = null;
          }
          // ROUND 13 addendum — `pickSource` now comes straight from `_pickTwoStacks` itself
          // (`live` / `probe-fallback reason=raycast-blind(...)` / `none`), never re-derived here
          // from `picked.near` alone — that re-derivation is exactly what silently printed `none`
          // while a stack was actually drawn, on the real HHS BatchedMesh bake.
          // ROUND 14 (2026-09-16, real HHS R13 bake: NO §LOADPATH_VISIBILITY line at all, so the
          // raw totals behind the pick were never visible in the log) — `raysCast=`/`hitsTotal=`/
          // `selfHits=`/`universe=` now print on EVERY arm, unconditionally (not just when blind),
          // straight from `_pickTwoStacks`'s own return — the single source of truth, never a
          // second, re-derived count.
          console.log('§LOADPATH_PICK stacks=' + (picked.far ? 2 : 1) +
            ' near=' + fmtPick(picked.near) + (picked.far ? ' far=' + fmtPick(picked.far) : '') +
            (picked.farReason ? ' farReason=' + picked.farReason : '') +
            ' pickSource=' + picked.pickSource +
            // §129.42 — the printed rule must name the key it actually leads with, or the log
            // says one thing while the comparator does another.
            ' rankBy=' + (picked.visKey ? ('storeySpan,' + picked.visKey + ',depth,' + (window.__lpPickOccluded ? 'occludedScore' : 'score')) : 'n/a') +
            ' nearSpan=' + ((picked.near && picked.near.storeySpan) || 0) +
            ' bestSpanAvail=' + (picked.bestSpanAvail || 0) +
            // ROUND 17 — `scored=`/`validTotal=` make the ARM-TIME cap visible on the SAME line as the
            // pick it produced: `scored` is how many candidates actually went through the expensive
            // _scoreChain/raycast pass (capped at SCORE_TOP_N), `validTotal` is _pick's own full,
            // unfiltered `valid` count (never itself capped) — `scored < validTotal` is the fix firing.
            ' scored=' + picked.scored + '/' + picked.validTotal +
            ' raysCast=' + picked.raysCast + ' hitsTotal=' + picked.hitsTotal + ' selfHits=' + picked.selfHits + ' universe=' + picked.universe +
            ' visibleHops=' + fmtVisibleHops(picked.near) + ' memberVis=' + fmtMemberVis(picked.near) +
            ' hop0Occluder=' + fmtOccluder(picked.near) +
            (picked.far ? ' farVisibleHops=' + fmtVisibleHops(picked.far) + ' farMemberVis=' + fmtMemberVis(picked.far) +
              ' farHop0Occluder=' + fmtOccluder(picked.far) : ''));
        })();
        // §129.8 item 1 — SHINE-THROUGH LOOK witness, once per arm: mode, and the ghost/clip/fade
        // fields this beat's own witnesses (§LOADPATH_VISIBLE) must all read 0/false for in shine
        // mode (FAIL if any survives — checked from real state, not the mode flag alone).
        // §132 §LOADPATH_TWINS (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §132): the SAME load path elsewhere in the model.
        try { LPS._lp.twins = LPS._pickTwins(); } catch (eTw) { LPS._lp.twins = []; console.warn('§LOADPATH_TWINS_ERR ' + (eTw && eTw.message)); }
        var nClones = LPS._buildChainClones(LPS._lp.hopsUp);
        var nClonesFar = LPS._lp.far ? LPS._buildChainClones(LPS._lp.far.hopsUp) : 0;
        LPS._fetchHopScheduleCost(LPS._lp.hopsUp);
        if (LPS._lp.far) LPS._fetchHopScheduleCost(LPS._lp.far.hopsUp);
        // §129.4 v8b WHEN — the camera cut is WITHDRAWN. Capture the film's OWN pose exactly once,
        // at arm, and hold it verbatim through the whole window (re-asserted every hold frame below,
        // never fitted/dollied/cut). `_lp.armPose` is the single source of truth HOLD's own
        // `cameraMoved` witness checks against at restore.
        // ROUND 6 (2026-09-16, real Terminal bake) — ORIENTATION is now the camera's own REAL
        // quaternion, captured directly, NEVER `A.controls.target`: cinema_maxq drives the bake
        // camera's position/orientation itself every frame and never keeps controls.target in sync,
        // so on Terminal's site coordinates that target was stale/wrong — re-asserting "position +
        // look at controls.target" during the hold silently re-aimed the REAL camera away from the
        // building every single hold frame, a visible defect `cameraMoved` (position-only) could
        // never see. `armSource` records whether a real quaternion was actually captured — printed
        // on §LOADPATH_HOLD; per the ruling, there is no fallback to controls.target at all, ever.
        var armQuat = (A.camera && A.camera.quaternion && A.camera.quaternion.clone) ? A.camera.quaternion.clone() : null;
        LPS._lp.armSource = armQuat ? 'quaternion' : 'none';
        LPS._lp.armPose = (A.camera && armQuat) ? {
          x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z, quaternion: armQuat
        } : null;
        LPS._lp.lastHoldPose = LPS._lp.armPose ? { x: LPS._lp.armPose.x, y: LPS._lp.armPose.y, z: LPS._lp.armPose.z, quaternion: armQuat.clone() } : null;
        // §129.4 v6 note (still true in v8b) — ONE Box3 per stack, computed ONCE here (never a
        // second, separately-timed _chainWorldBBox() call) — used by the cut-plane placement (ghost
        // mode only) and by the ladder's own "which side" decision (both modes).
        LPS._lp.chainBox = LPS._chainWorldBBox(LPS._lp.hopsUp);
        if (LPS._lp.far) LPS._lp.far.chainBox = LPS._chainWorldBBox(LPS._lp.far.hopsUp);
        var camPos3 = (LPS._lp.armPose && typeof THREE !== 'undefined')
          ? new THREE.Vector3(LPS._lp.armPose.x, LPS._lp.armPose.y, LPS._lp.armPose.z) : null;
        var plane = null, sectionCut = null;
        if (LPS._lookGhost()) {
          // §129.7 items 6-7 / §129.1 CUT, kept behind window.__lpLookGhost=1. ONE clip plane,
          // facing the camera, placed just in front of the (near stack's) chain's nearest face —
          // applied ONLY to this beat's own ghost material clones, never A.sectionPlane.
          plane = (LPS._lp.chainBox && camPos3) ? LPS._placeCutPlane(LPS._lp.chainBox, LPS._lp.buildingBox, camPos3) : null;
          LPS._lp.ghostResult = LPS._applyGhost(plane);
        } else {
          // §129.8 item 1 — SHINE-THROUGH: the building is NEVER ghosted, NEVER clipped. ROUND 16
          // item 3 — the backdrop IS now faded in this mode too (_backdropApply above runs
          // unconditionally, no longer gated to ghost mode — see its own comment).
          LPS._lp.ghostResult = { n: 0, hiddenN: 0 };
          // §129 OPEN ITEM (2026-09-17) — SECTION-CUT, shine mode only (this is the look the stack's
          // "reads as thin" diagnosis is about). Plane just behind the near stack's own chain; near
          // side (everything but the stack, which is never in this population — see _applyWhiten's
          // own `_loadPathClone` exclusion) is cut away. `window.__lpNoSectionCut=1` kills it for an
          // A/B, same convention as every other control tap in this file.
          // §LOADPATH_STACK_ONLY (2026-10-01, red1: "it is supposed to identify the stack only and draw that only.. no context
          // background other than the overlay info panel … Yes cut off that 13s stuff!"): the freeze hides the building instead of the
          // white cut-away (which un-packed 63,059 pieces = ~13 s/frame). No cut plane, no whiten, no cap, no un-pack.
          // &lpcontext=1 / APP._lpContext=true = the previous white cut-away look.
          LPS._lp.stackOnly = !/[?&]lpcontext=1/.test(location.search) && A._lpContext !== true;
          sectionCut = (!LPS._lp.stackOnly && !window.__lpNoSectionCut && LPS._lp.chainBox && camPos3) ? LPS._placeSectionCutPlane(LPS._lp.chainBox, camPos3) : null;
          if (sectionCut && A.renderer) A.renderer.localClippingEnabled = true;
          // Exposed so `_visibleWitness` can tell "this beat's own intentional section-cut
          // population" apart from an unexpected/leftover clip plane elsewhere in the scene —
          // the pre-129-OPEN-ITEM witness invariant ("shine mode clips nothing") is retired,
          // not deleted: it becomes "shine mode clips nothing IT DIDN'T MEAN TO".
          LPS._lp.sectionCutPlane = sectionCut ? sectionCut.plane : null;
          LPS._lp.sectionCut = sectionCut;   // full object (viewDir/camPos/planeDepth) — the per-frame fade needs all of it, not just the plane
        }
        // Locked spec 2026-09-17 item 4 — WHITEN, regardless of mode (never gated behind
        // _lookGhost()): runs AFTER the branch above so it clones whatever obj.material IS right
        // now (the ghost clone in ghost mode, the true original in shine mode). Restored in the
        // opposite order — _restoreWhiten() before _restoreGhost() — in _restore()/_forceRestore().
        // §129 OPEN ITEM — the section-cut plane (shine mode only) rides the SAME whiten pass: "the
        // cut surface and everything behind it get the concrete/white treatment" (red1's own words).
        if (LPS._lp.stackOnly) {
          LPS._lp.whitenResult = { n: 0, stackOnly: true };
          LPS._lpStackOnlyHidden = [];
          A.scene.traverse(function (o) {
            if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isLine || o.isLineSegments || o.isPoints || o.isSprite)) return;
            if (!o.visible || (o.userData && o.userData._loadPathClone)) return;
            o.visible = false; LPS._lpStackOnlyHidden.push(o);
          });
          A._lpStackOnly = true;
          console.log('§LOADPATH_STACK_ONLY hidden=' + LPS._lpStackOnlyHidden.length + ' stacks=' + (1 + (LPS._lp.far ? 1 : 0) + (LPS._lp.twins ? LPS._lp.twins.length : 0)) +
            ' (building + 3D overlays hidden for the freeze; stack clones + 2D info panel only; exposure held; &lpcontext=1 = white cut-away)');
        } else LPS._lp.whitenResult = LPS._applyWhiten(sectionCut ? sectionCut.plane : null);
        // ROUND 16 item 3 — `backdropFaded` is now true in BOTH modes (_backdropApply's own gate on
        // `_lookGhost()` is removed); `ghosted`/`clipped` stay mode-specific (shine mode never
        // ghosts/clips the building itself, only the backdrop).
        console.log('§LOADPATH_LOOK mode=' + LPS._lp.lookMode + ' ghosted=' + (LPS._lookGhost() ? 'n/a' : 0) +
          ' clipped=' + (LPS._lookGhost() ? (plane ? 1 : 0) : 0) + ' backdropFaded=true' +
          ' => ' + (LPS._lookGhost() || (LPS._lp.ghostResult.n === 0 && !plane) ? 'PASS' : 'FAIL'));
        // §129 OPEN ITEM WITNESS — (a) plane sits strictly behind the chain's own farthest corner
        // (marginM > 0, by construction of the eps in _placeSectionCutPlane, but asserted here from
        // the REAL numbers, not assumed); (b) every whitened clone actually carries the plane
        // (clippedCount === whitenResult.n — nothing "everything else" escapes the cut); (d) the
        // stack's own clones carry NO clipping plane at all (stackClipped must be 0 — the stack is
        // provably unaffected). (c), the solid-cap-not-a-hole requirement, is asserted separately by
        // §LOADPATH_CUT_CAP right below (structural: the companion/cap objects genuinely exist with
        // the right stencil wiring — never a pixel readback, per this project's own FUNDAMENTAL LAW).
        if (!LPS._lookGhost()) {
          if (!sectionCut) {
            console.log('§LOADPATH_CUT ' + (LPS._lp.stackOnly ? 'OFF reason=stack-only (building hidden, nothing to cut)' : 'INCONCLUSIVE reason=' + (window.__lpNoSectionCut ? 'control-off' : 'no-chainbox-or-campos')));
          } else {
            var _cutMarginM = sectionCut.planeDepth - sectionCut.farDepth;
            var _cutClippedN = LPS._whitenTouched.filter(function (t) {
              return t.mesh.material && t.mesh.material.clippingPlanes && t.mesh.material.clippingPlanes.indexOf(sectionCut.plane) !== -1;
            }).length;
            var _cutStackTouched = 0;
            A.collectMeshes(function (o) { return !!(o.userData && o.userData._loadPathClone); }).forEach(function (o) {
              if (o.material && o.material.clippingPlanes && o.material.clippingPlanes.length) _cutStackTouched++;
            });
            var _cutOk = _cutMarginM > 0 && _cutClippedN === LPS._lp.whitenResult.n && _cutStackTouched === 0;
            console.log('§LOADPATH_CUT marginM=' + _cutMarginM.toFixed(3) + ' clippedCount=' + _cutClippedN + '/' + LPS._lp.whitenResult.n +
              ' stackClipped=' + _cutStackTouched + ' => ' + (LPS._lp.whitenResult.n === 0 ? 'INCONCLUSIVE reason=nothing-whitened' : (_cutOk ? 'PASS' : 'FAIL')));
            // §129 OPEN ITEM — CAP. "Must produce a genuinely SOLID-looking cut face, not a hole"
            // (red1's own words). Built only when there is something real to cap (whitenResult.n>0).
            // FIX (2026-09-17, found by re-deriving from code after red1 reported the cap wasn't
            // showing up despite this witness reading PASS): checking `renderer.getContext()`'s own
            // attributes proves the CANVAS has a stencil buffer, but when `A._composer` exists
            // (confirmed live every bake — `§EFFECTS_INIT loaded`), the scene geometry never renders
            // to that canvas directly - TAARenderPass renders it into EffectComposer's OWN internal
            // WebGLRenderTarget first (`viewer/effects.js`'s own `_composer.render()` call site,
            // `c.toBlob()` only reads the canvas AFTER that composite). EffectComposer.js's default
            // render target is built with only `{type: HalfFloatType}` - stencilBuffer defaults false
            // on any WebGLRenderTarget, same as ever other one in this codebase. The witness was
            // checking a buffer the geometry pass never touches. Now checks the REAL target: the
            // composer's own renderTarget1 when a composer is active, the canvas context otherwise.
            var _hasStencil = A._composer && A._composer.renderTarget1
              ? !!A._composer.renderTarget1.stencilBuffer
              : !!((A.renderer && A.renderer.getContext) ? A.renderer.getContext().getContextAttributes().stencil : false);
            LPS._lp.cutCapResult = (LPS._lp.whitenResult.n > 0 && _hasStencil) ? LPS._buildCutCap(sectionCut.plane, LPS._lp.buildingBox) : { covered: 0, batchedSkipped: 0, capBuilt: false };
            var _capExpected = LPS._lp.whitenResult.n; // every whitened, non-batched touch should get a stencil companion pair
            var _capOk = _hasStencil && LPS._lp.cutCapResult.capBuilt && (LPS._lp.cutCapResult.covered + LPS._lp.cutCapResult.batchedSkipped) === _capExpected;
            console.log('§LOADPATH_CUT_CAP composerActive=' + !!A._composer + ' stencilBuffer=' + _hasStencil + ' covered=' + LPS._lp.cutCapResult.covered + '/' + _capExpected +
              ' batchedSkipped=' + LPS._lp.cutCapResult.batchedSkipped + ' capBuilt=' + LPS._lp.cutCapResult.capBuilt +
              ' => ' + (LPS._lp.whitenResult.n === 0 ? 'INCONCLUSIVE reason=nothing-whitened' : (!_hasStencil ? 'FAIL reason=no-stencil-buffer' : (_capOk ? 'PASS' : 'FAIL'))));
            // §129 FIX 3 — unbatch every BatchedMesh container this pass whitened into individual,
            // ordinary Mesh clones (see the function's own comment for why). Runs after the cap so
            // the cap's own coverage accounting above still reports the CONTAINER-level truth
            // (`batchedSkipped`) unchanged — this is an independent, additional pass, not a
            // replacement for it.
            LPS._lp.batchUnpackResult = LPS._buildBatchedElementClones();
            if (!/[?&]lpcull=0/.test(location.search)) { try { LPS._lp.viewCull = LPS._cullBatchedClonesToView(); } catch (eVC) { console.warn('§LOADPATH_VIEW_CULL failed ' + (eVC && eVC.message) + ' — all pieces drawn as before'); } }
            var _bu = LPS._lp.batchUnpackResult;
            console.log('§LOADPATH_BATCH_UNPACK containers=' + _bu.containers + ' elements=' + _bu.elements +
              ' elementsFailed=' + _bu.elementsFailed +
              ' => ' + (_bu.containers === 0 ? 'INCONCLUSIVE reason=no-batched-containers' : (_bu.elements > 0 ? 'PASS' : 'FAIL')));
            // §129 DIAGNOSTIC BISECTION (2026-09-17) — the unbatch above hides the ENTIRE source
            // container (proven, `containersShown` restore count matches) yet the suspect pixels are
            // STILL byte-identical, meaning whatever is visible there was never that container. Next
            // bisection: hide EVERY top-level scene child except this beat's own overlay, to find out
            // whether the colour is coming from geometry at all or from something else entirely
            // (background/post-process). window.__lpDebugHideAll=1, temporary, removed once answered.
            if (window.__lpDebugHideAll && A.scene) {
              A._lpDebugHidden = [];
              A.scene.children.forEach(function (c) {
                if (c.visible && !(c.userData && c.userData._loadPathClone)) { A._lpDebugHidden.push(c); c.visible = false; }
              });
              console.log('§LOADPATH_DEBUG_HIDE_ALL hidden=' + A._lpDebugHidden.length);
            }
          }
        }
        console.log('§LOADPATH_ARM hop=' + LPS._lp.hopsUp.length + '/' + LPS._lp.hopsUp.length +
          (LPS._lp.far ? ' farHop=' + LPS._lp.far.hopsUp.length + '/' + LPS._lp.far.hopsUp.length : '') +
          ' clones=' + nClones + '/' + LPS._lp.hopsUp.length +
          (LPS._lp.far ? ' farClones=' + nClonesFar + '/' + LPS._lp.far.hopsUp.length : '') +
          ' ghosted=' + Math.max(0, LPS._lp.ghostResult.n - LPS._lp.ghostResult.hiddenN) +
          ' hidden=' + LPS._lp.ghostResult.hiddenN + ' entryCursor=' + LPS._lp.cursorAtEntry +
          ' armPose=' + (LPS._lp.armPose ? '[' + LPS._lp.armPose.x.toFixed(2) + ',' + LPS._lp.armPose.y.toFixed(2) + ',' + LPS._lp.armPose.z.toFixed(2) + ']' : '?') +
          ' clipPlane=' + (plane ? 'set' : 'none'));
        LPS._clonesWitness(LPS._lp.hopsUp, LPS._lp.pickItem, 'near');   // ROUND 5 item 2 — right after the clones this frame just built
        if (LPS._lp.far) LPS._clonesWitness(LPS._lp.far.hopsUp, LPS._lp.far.pickItem, 'far');
      }
      if (inWindow) {
        // §129.4 v8b WHEN — re-assert the ARM pose every frame (overriding whatever beat owns this
        // tNorm range would otherwise have set a few lines earlier in the bake loop — same
        // insertion-order guarantee v3-v7 already relied on). No fit, no dolly: HOLD verbatim.
        // ROUND 6 — position + quaternion, set DIRECTLY on the camera; A.controls is NEVER touched
        // here (no .target.set, no .update()) — that OrbitControls-style re-derivation from a target
        // is exactly what could silently re-aim the real camera off a stale target every hold frame.
        if (LPS._lp.armPose && A.camera && A.camera.quaternion) {
          A.camera.position.set(LPS._lp.armPose.x, LPS._lp.armPose.y, LPS._lp.armPose.z);
          A.camera.quaternion.copy(LPS._lp.armPose.quaternion);
          if (A.camera.updateMatrixWorld) A.camera.updateMatrixWorld();
          LPS._lp.lastHoldPose = { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z,
            quaternion: A.camera.quaternion.clone() };
        }
        // §129.27 SUPERSEDES this section's own earlier history (§129 OPEN ITEM through §129.24) of
        // chasing a symmetric COLOUR ramp for cut/whiten at both ends — red1's final ruling is that
        // cut/whiten (like backdrop) is an instant step, not a fade, at both arm and release; only
        // HUD still eases. See `_lp.sectionCut` handling just below (arm) and the release branch
        // further down in this function for the current, instant behaviour.
        // FIX (2026-09-17) — `indoorHallTint` (and any sibling 3D-space measure/indoor annotation
        // mesh, e.g. `slabBeatOutline`) proved that relying on the BACKDROP'S OPACITY fade alone is
        // not fully reliable for these: `.visible` and `material.opacity` are separate properties,
        // and a mesh mid-fade (or whose own beat keeps nudging its opacity) can still leave a faint,
        // colour-shifting blend on screen even while "faded" by the numbers. HIDE THEM OUTRIGHT
        // instead — the same "hide, don't just fade" fix already proven for the batched/instanced
        // whiten population — belt-and-suspenders on top of the backdrop fade, not a replacement
        // for it (backdrop still owns their real opacity/restore bookkeeping).
        // Runs EVERY hold frame, not once at arm — the whole reason `indoorHallTint` slipped through
        // in the first place was a beat becoming visible/opaque MID-HOLD, after a one-time scan had
        // already run (the exact same class of bug already fixed once for the backdrop's own
        // population top-up). `if (o.visible)` naturally skips anything already hidden by this same
        // loop on an earlier frame — cheap, idempotent, no need for a separate one-shot gate.
        if (!LPS._lp.indoorAnnotHidden) LPS._lp.indoorAnnotHidden = [];
        ['indoorBeats', 'slabBeat'].forEach(function (gname) {
          var grp = A.scene && A.scene.children.filter(function (c) { return c.name === gname; })[0];
          if (grp) grp.traverse(function (o) {
            if (o.visible) { LPS._lp.indoorAnnotHidden.push(o); o.visible = false; }
          });
        });
        // §129.11 follow-up (2026-09-17) — a patch of un-faded sky, top-right of frame, confirmed via
        // raycast (`§LOADPATH_DIAG_RAYCAST ... matType=ShaderMaterial ... isBatchedMeshCtor=Sky`) to
        // be `A._sky` itself: three.js's physically-based Sky shader computes its own colour from
        // atmosphere uniforms (turbidity/rayleigh/sun position) and, like most sky-dome shaders,
        // outputs a hardcoded opaque alpha in its own fragment shader — it never reads three.js's
        // generic `material.opacity` uniform at all, so `_backdropApply`'s opacity fade (correct for
        // every ordinary material) has provably no effect on it. Same fix as everything else in this
        // block: hide it outright rather than rely on a fade mechanism it was never wired to obey.
        if (A._sky && A._sky.visible) { LPS._lp.indoorAnnotHidden.push(A._sky); A._sky.visible = false; }
        if (LPS._lp.sectionCut) {
          // §129.27 (2026-09-18, red1: "the background sky ground, building that needs to cut
          // out" — not a fade like HUD/overlays) — cut/whiten is now an INSTANT step, matching
          // backdrop's own `inWindow?1:0` (§129.24). The 1s colour ramp this used to share with HUD
          // (§129.18) is retired for this beat; only HUD still eases (cinema_maxq.js's `_hudFadeT`).
          var _cutT = 1;
          LPS._sectionCutApply(LPS._lp.sectionCut, _cutT, LPS._lp.buildingBox);
          // WITNESS, first hold frame only — proves depth AND colour are ALREADY at target the
          // instant the hold arms, same "expected vs live, same instant" discipline `_backdropWitness`
          // uses. `sampleColorAtTarget` reads ONE representative whitened clone's live colour (not a
          // screenshot — the material's own numeric `.color` fields).
          if (!LPS._lp.cutFadeStartWitnessFired) {
            LPS._lp.cutFadeStartWitnessFired = true;
            var _depthAtFinalInstantly = Math.abs(LPS._lp.sectionCut.liveDepth - LPS._lp.sectionCut.planeDepth) < 1e-6;
            var _sample = LPS._whitenColorPairs[0];
            // Distance-from-TARGET (§129 concrete-grey, not literal white any more) rather than a
            // hardcoded ">0.999 = white" threshold — this must stay correct whatever the target
            // colour is, without a second edit here every time the look changes.
            var _colorAtTarget = _sample && LPS._WHITE_COLOR ? (Math.abs(_sample.clone.color.r - LPS._WHITE_COLOR.r) < 0.02 &&
              Math.abs(_sample.clone.color.g - LPS._WHITE_COLOR.g) < 0.02 && Math.abs(_sample.clone.color.b - LPS._WHITE_COLOR.b) < 0.02) : null;
            console.log('§LOADPATH_CUT_FADE_START elapsed=' + elapsed.toFixed(3) + ' t=' + _cutT.toFixed(3) +
              ' depthAtFinalInstantly=' + _depthAtFinalInstantly +
              ' colorAtTargetInstantly=' + (_colorAtTarget == null ? 'n/a' : _colorAtTarget) +
              ' => ' + (_sample == null ? 'INCONCLUSIVE reason=nothing-whitened' : ((_depthAtFinalInstantly && _colorAtTarget) ? 'PASS' : 'FAIL')));
          }
        }
        // §129.8 item 3 — TWO STACKS, FAR then NEAR, back to back within the ONE hold: FAR gets
        // `[0, farDurSec)` of `elapsed`, NEAR gets the rest. FAR is driven to its OWN full reveal
        // once its window has passed (never left mid-reveal because a frame landed exactly on the
        // boundary), then NEAR takes over — same "no-op once fully revealed" idempotence
        // `_revealStackStep` already guarantees, so calling both every hold frame is always safe.
        var farDurSec = LPS._lp.far ? LPS._lp.far.durSec : 0;
        if (LPS._lp.far) LPS._revealStackStep(LPS._lp.far, Math.min(elapsed, farDurSec));
        if (elapsed >= farDurSec) LPS._revealStackStep(LPS._lp, elapsed - farDurSec);
        if (LPS._lp.twins && LPS._lp.twins.length && elapsed >= farDurSec) LPS._lp.twins.forEach(function (tw) { LPS._revealStackStep(tw, elapsed - farDurSec); });   // §132: rise WITH the near stack
        if (LPS._lp.twins && LPS._lp.twins.length) { var _lagT = 0; LPS._lp.twins.forEach(function (tw) { _lagT = Math.max(_lagT, Math.abs((tw.revealedHops || 0) - (LPS._lp.revealedHops || 0))); }); LPS._lp.twinMaxLag = Math.max(LPS._lp.twinMaxLag || 0, _lagT); }
        if (!LPS._lp.midFired && elapsed >= LPS._lp.durSec / 2) {
          LPS._lp.midFired = true;
          A._loadPathMidHoldThisFrame = true;   // §129.6 items 4/8 — cinema_maxq.js's own §HUD_LAYOUT/§LOADPATH_FOCUS trigger, same frame
          LPS._visibleWitness(LPS._lp, 'near');
          LPS._framingWitness(LPS._lp, 'near');
          if (LPS._lp.far) { LPS._visibleWitness(LPS._lp.far, 'far'); LPS._framingWitness(LPS._lp.far, 'far'); }
          // §129 OPEN ITEM — by mid-hold the fade-in (fadeSec, well under half a normal hold) must be
          // COMPLETE: the cut sits at its real final depth and the whitened clones are genuinely
          // white, not still mid-ramp. Same expected-vs-live discipline as the start witness above.
          if (LPS._lp.sectionCut) {
            var _depthAtFinal = Math.abs(LPS._lp.sectionCut.liveDepth - LPS._lp.sectionCut.planeDepth) < 1e-6;
            var _sampleMid = LPS._whitenColorPairs[0];
            var _isWhiteNow = _sampleMid && LPS._WHITE_COLOR ? (Math.abs(_sampleMid.clone.color.r - LPS._WHITE_COLOR.r) < 0.02 &&
              Math.abs(_sampleMid.clone.color.g - LPS._WHITE_COLOR.g) < 0.02 && Math.abs(_sampleMid.clone.color.b - LPS._WHITE_COLOR.b) < 0.02) : null;
            console.log('§LOADPATH_CUT_FADE_MID elapsed=' + elapsed.toFixed(3) + ' depthAtFinal=' + _depthAtFinal +
              ' atTargetColor=' + (_isWhiteNow == null ? 'n/a' : _isWhiteNow) +
              ' => ' + (_sampleMid == null ? 'INCONCLUSIVE reason=nothing-whitened' : ((_depthAtFinal && _isWhiteNow) ? 'PASS' : 'FAIL')));
          }
        }
        if (typeof window.tmGetState === 'function') {
          var cur = window.tmGetState().cursor;
          if (LPS._lp.cursorAtEntry != null && cur !== LPS._lp.cursorAtEntry) LPS._lp.holdBroke = true;
        }
      } else if (LPS._lp.armed) {
        // §129.27 (2026-09-18, red1: "clean cut to full building must, with background sky ground
        // behind it... don't fade them back after the cut, before" — HUD's own front-loaded fade-in
        // finishes BEFORE this point, see cinema_maxq.js's `_hudFadeT`) — release is ONE frame again,
        // superseding §129.16's "stays armed past release to sweep back" delay. That delay is the
        // most likely cause of the reported black-frame glitch at switch-back: for up to a full
        // `fadeSec` after the "release" the camera had already resumed moving while the cut cap /
        // unbatched clones / whitened materials were STILL live, un-torn-down, viewed from an angle
        // the frozen geometry was never built for. Collapsing arm and release to true instants
        // removes that window outright — ladder/card vanishing, the release-tFilm/restoreCount
        // signals, the backdrop witness, the sky/indoor-annotation restore, the cut/whiten snap-back,
        // AND the real geometry teardown (`_restore`) all now happen on the SAME true-release frame.
        if (LPS._lp.showLadder) {
          A._loadPathReleaseTFilm = tNorm;   // §129.6 item 1 — the tFilm value AT RELEASE, same source-of-truth contract as arm
          A._loadPathRestoreCount = (A._loadPathRestoreCount || 0) + 1;   // cinema_maxq.js's own resume-frame detector
          // §129.7 item 6 — first moving-film frame after release: the "first fade-out frame", exactly
          // when both the arm snapshot and this release snapshot exist, so the witness fires here once.
          if (!LPS._lp.backdropWitnessFired) {
            LPS._lp.backdropWitnessFired = true;
            LPS._backdropWitness(LPS._lp, fSec);
          }
          LPS._lp.showLadder = false;   // ladder/card vanish now — unchanged, already-proven timing
          var _iaN2 = (LPS._lp.indoorAnnotHidden || []).length;
          (LPS._lp.indoorAnnotHidden || []).forEach(function (o) { o.visible = true; });
          console.log('§LOADPATH_INDOOR_ANNOT_RESTORE hiddenShown=' + _iaN2 +
            ' => ' + (_iaN2 === 0 ? 'INCONCLUSIVE reason=nothing-hidden' : 'PASS'));
          LPS._lp.indoorAnnotHidden = null;
        }
        if (LPS._lp.sectionCut) {
          // WITNESS, mirrors §LOADPATH_CUT_FADE_START — proves depth AND colour are ALREADY back to
          // original the instant release happens, same frame as the real teardown below, no gap.
          var _depthUnchanged = Math.abs(LPS._lp.sectionCut.liveDepth - LPS._lp.sectionCut.planeDepth) < 1e-6;
          LPS._sectionCutApply(LPS._lp.sectionCut, 0, LPS._lp.buildingBox);
          var _sampleEnd = LPS._whitenColorPairs[0];
          var _colorBackToOrig = _sampleEnd ? (Math.abs(_sampleEnd.clone.color.r - _sampleEnd.orig.r) < 0.02 &&
            Math.abs(_sampleEnd.clone.color.g - _sampleEnd.orig.g) < 0.02 && Math.abs(_sampleEnd.clone.color.b - _sampleEnd.orig.b) < 0.02) : null;
          console.log('§LOADPATH_CUT_FADE_END instant=true depthUnchanged=' + _depthUnchanged +
            ' colorBackToOrig=' + (_colorBackToOrig == null ? 'n/a' : _colorBackToOrig) +
            ' => ' + (_sampleEnd == null ? 'INCONCLUSIVE reason=nothing-whitened' : ((_depthUnchanged && _colorBackToOrig) ? 'PASS' : 'FAIL')));
        }
        _restore(fSec);
      }
    } catch (e) { LPS._err('APPLY', e); }
  };

  function _restore(exitFSec) {
    try { LPS._unhideStackOnly(); } catch (eSO) { console.warn('§LOADPATH_STACK_ONLY_RESTORE failed ' + (eSO && eSO.message)); }
    // §129.4 PRIMAL LAW clause 4 — a witness must be able to say INCONCLUSIVE, not just PASS/FAIL,
    // when nothing was actually judged (no Time Machine cursor to compare against).
    var haveCursor = (typeof window.tmGetState === 'function') && LPS._lp.cursorAtEntry != null;
    var cursorAfter = (typeof window.tmGetState === 'function') ? window.tmGetState().cursor : null;
    // §129.4 v8b HOLD — cameraMoved: the LAST hold frame's live pose (captured on every per-frame
    // re-assert above) compared to the pose captured once at arm. Re-asserted every frame, so this
    // is trivially false unless something else perturbs the camera between the last re-assert and
    // this exit frame (e.g. OrbitControls damping) — the falsifiable proof the hold actually held.
    // ROUND 6 — now ALSO checks quaternion drift (angleTo), never just position: the real Terminal
    // defect (the hold re-aiming the camera via a stale A.controls.target every frame) moved
    // ORIENTATION only, which the old position-only check could never have caught even if it had
    // still been running the old code — "cameraMoved=false compares against the same wrong pose".
    var cameraMoved = false;
    if (LPS._lp.armPose && LPS._lp.lastHoldPose) {
      var EPS_P = 1e-6, EPS_ANG = 1e-6;
      cameraMoved = Math.abs(LPS._lp.lastHoldPose.x - LPS._lp.armPose.x) > EPS_P ||
        Math.abs(LPS._lp.lastHoldPose.y - LPS._lp.armPose.y) > EPS_P ||
        Math.abs(LPS._lp.lastHoldPose.z - LPS._lp.armPose.z) > EPS_P;
      if (!cameraMoved && LPS._lp.armPose.quaternion && LPS._lp.lastHoldPose.quaternion &&
          typeof LPS._lp.armPose.quaternion.angleTo === 'function') {
        cameraMoved = LPS._lp.armPose.quaternion.angleTo(LPS._lp.lastHoldPose.quaternion) > EPS_ANG;
      }
    }
    // §LOADPATH_HOLD gains camPos=/camDir=/armSource= (ROUND 6 item 4) — camDir is the LAST HOLD
    // frame's own forward vector, derived from its captured quaternion (never the live camera at
    // _restore() time, which by now may already be driving the NEXT beat's own pose). If a real
    // quaternion was never captured at arm, there is no trustworthy orientation to check at all —
    // INCONCLUSIVE, never a silent pass on an unproven claim, and never a fallback to
    // A.controls.target (per this round's own ruling).
    var camPos = LPS._lp.lastHoldPose ? [LPS._lp.lastHoldPose.x, LPS._lp.lastHoldPose.y, LPS._lp.lastHoldPose.z] : null;
    var camDir = (LPS._lp.lastHoldPose && LPS._lp.lastHoldPose.quaternion && typeof THREE !== 'undefined')
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(LPS._lp.lastHoldPose.quaternion) : null;
    var armSource = LPS._lp.armSource || 'none';
    // ROUND 9 item 1 — cinema_maxq.js's own frame-grid mapping (`_lpFrameForArmTn`) is the single
    // source of truth for "did the hold arm on the frame its own tNorm actually asks for"; read
    // here, never re-derived, so this witness FAILs whenever `§LOADPATH_HOLD_INSERT` already printed
    // `armTnMatch=false => FAIL`. Missing (no hold this bake, or __lpNoClockFreeze) defaults true —
    // never a manufactured FAIL for a value nothing computed.
    var armTnMatch = (A._loadPathArmTnMatch !== false);
    var holdVerdict = (armSource !== 'quaternion') ? 'INCONCLUSIVE reason=controls-target'
      : !haveCursor ? 'INCONCLUSIVE reason=no-tm-cursor'
      : ((!LPS._lp.holdBroke && !cameraMoved && armTnMatch) ? 'PASS' : 'FAIL');
    console.log('§LOADPATH_HOLD tNorm=' + (LPS._lp.holdStartSec / LPS._lp.filmSecFull).toFixed(4) +
      ' shapeSec=' + LPS._lp.durSec.toFixed(2) + ' hops=' + LPS._lp.hopsUp.length +
      (LPS._lp.far ? ' farHops=' + LPS._lp.far.hopsUp.length : '') +
      ' cursorDayBefore=' + LPS._lp.cursorAtEntry + ' cursorDayAfter=' + cursorAfter +
      ' cameraMoved=' + cameraMoved + ' armTnMatch=' + armTnMatch +
      ' camPos=' + (camPos ? '[' + camPos.map(function (v) { return v.toFixed(2); }).join(',') + ']' : '?') +
      ' camDir=' + (camDir ? '[' + camDir.x.toFixed(3) + ',' + camDir.y.toFixed(3) + ',' + camDir.z.toFixed(3) + ']' : '?') +
      ' armSource=' + armSource +
      ' => ' + holdVerdict);
    // v8b RESTORE — the camera is NEVER touched here at all (holds through the whole window, then
    // cinema_maxq.js's own per-frame pose logic simply resumes driving it next frame; "cameraRestored"
    // is gone — HOLD's own cameraMoved above is the fact that owns "did we hold", this function only
    // owns "did we clean up").
    // §129.8 item 3 — BOTH stacks' clones are disposed here (far's too, when it exists); ghost
    // materials are a single shared pass regardless of stack count, unchanged.
    var skip = !!window.__lpSkipRestore;
    var materialsRestored = 0, total = LPS._ghostTouched.length;
    var clonesN = LPS._lp.hopsUp.filter(function (h) { return !!h._cloneMesh; }).length +
      (LPS._lp.far ? LPS._lp.far.hopsUp.filter(function (h) { return !!h._cloneMesh; }).length : 0);
    var clonesReverted = 0;
    if (!skip) {
      // §129 OPEN ITEM — the cap's companion/plane meshes are pure scene additions (never a material
      // swap on a real building object), so they come out FIRST, before anything whiten touches is
      // even considered for restore — order relative to whiten doesn't matter for correctness, but
      // "the newest addition unwinds first" keeps the LIFO discipline this file already uses.
      var _capR = LPS._restoreCutCap();
      var _capApply = LPS._lp.cutCapResult || { covered: 0, batchedSkipped: 0, capBuilt: false };
      var _capVacuous = (_capApply.covered === 0 && !_capApply.capBuilt);
      console.log('§LOADPATH_CUT_CAP_RESTORE companionsRemoved=' + _capR.companionsRemoved + '/' + (_capApply.covered * 2) +
        ' planeRemoved=' + _capR.planeRemoved + '/' + _capApply.capBuilt +
        ' => ' + (_capVacuous ? 'INCONCLUSIVE reason=nothing-capped' : ((_capR.companionsRemoved === _capApply.covered * 2 && _capR.planeRemoved === _capApply.capBuilt) ? 'PASS' : 'FAIL')));
      // §129 FIX 3 — undo the unbatch: dispose the per-element clones, show the original containers
      // again. Independent of whiten/cap restore above — order relative to them doesn't matter.
      var _buR = LPS._restoreBatchedElementClones();
      var _buApply = LPS._lp.batchUnpackResult || { containers: 0, elements: 0 };
      var _buVacuous = (_buApply.containers === 0);
      console.log('§LOADPATH_BATCH_UNPACK_RESTORE clonesRemoved=' + _buR.clonesRemoved + '/' + _buApply.elements +
        ' containersShown=' + _buR.containersShown + '/' + _buApply.containers +
        ' => ' + (_buVacuous ? 'INCONCLUSIVE reason=no-batched-containers' : ((_buR.clonesRemoved === _buApply.elements && _buR.containersShown === _buApply.containers) ? 'PASS' : 'FAIL')));
      // §129.16/§129.27 — the sky/indoor-annotation hide-outright restore fires in the release
      // branch's own `_lp.showLadder` block (its `§LOADPATH_INDOOR_ANNOT_RESTORE` line), same frame
      // as this `_restore()` call now that §129.27 collapsed release back to a single instant.
      // `_lp.indoorAnnotHidden` is already `null` by the time this runs; left un-duplicated rather
      // than printing a second, always-INCONCLUSIVE copy of that line.
      // Locked spec item 4 — undo the whiten wrap BEFORE the ghost restore beneath it (LIFO, same
      // order _applyWhiten/_restoreGhost's own comments spell out); gated by the same __lpSkipRestore
      // control so that control still means "nothing was put back" for the whole pass, not just ghost.
      var _wr = LPS._restoreWhiten();
      // §LOADPATH_WHITEN (2026-09-17) — the ONE real proof that the "building goes concrete/white"
      // ruling actually did something and actually undid it: `whitened` is the apply-time count
      // (`_lp.whitenResult`, stashed at arm — never re-derived here, that would be a tautology),
      // `materialsRestored` is THIS call's own live count. `instanceColorMeshes`/`instRestored` prove
      // the multiplicative-instanceColor risk (this file's own comment on `_applyWhiten`) was actually
      // handled, not just possible in theory — vacuous (nothing to whiten at all) reads INCONCLUSIVE,
      // never a silent PASS, same PRIMAL LAW discipline as every other witness in this file.
      var _wApply = LPS._lp.whitenResult || { n: 0, instanceColorMeshes: 0, batchColorTexNulled: 0 };
      var _whitenVacuous = (_wApply.n === 0);
      var _whitenOk = _whitenVacuous ? null
        : (_wr.n === _wApply.n && _wr.instRestored === _wr.instTotal && _wr.instTotal === _wApply.instanceColorMeshes &&
           _wr.batchTexRestored === _wr.batchTexTotal && _wr.batchTexTotal === _wApply.batchColorTexNulled);
      console.log('§LOADPATH_WHITEN whitened=' + _wApply.n + ' materialsRestored=' + _wr.n + '/' + _wApply.n +
        ' instanceColorMeshes=' + _wApply.instanceColorMeshes + ' instanceColorRestored=' + _wr.instRestored + '/' + _wr.instTotal +
        ' batchColorTexNulled=' + _wApply.batchColorTexNulled + ' batchColorTexRestored=' + _wr.batchTexRestored + '/' + _wr.batchTexTotal +
        ' => ' + (_whitenVacuous ? 'INCONCLUSIVE reason=nothing-to-whiten' : (_whitenOk ? 'PASS' : 'FAIL')));
      materialsRestored += LPS._restoreGhost();
      clonesReverted = LPS._disposeChainClones(LPS._lp.hopsUp) + (LPS._lp.far ? LPS._disposeChainClones(LPS._lp.far.hopsUp) : 0);
      if (LPS._lp.twins && LPS._lp.twins.length) { var _twN = 0; LPS._lp.twins.forEach(function (tw) { _twN += LPS._disposeChainClones(tw.hopsUp); });
        console.log('§LOADPATH_TWINS_SYNC twins=' + LPS._lp.twins.length + ' maxLag=' + (LPS._lp.twinMaxLag || 0) + ' clonesDisposed=' + _twN + ' (maxLag = hops a twin was ever ahead/behind the near stack; 0 = one load path shown N times)'); }
      try { if (typeof A._applyDiscVisibility === 'function') A._applyDiscVisibility(); } catch (e1) {}
      try { if (typeof window.tmSetCursor === 'function') window.__forceFull = true; } catch (e2) {}
    }
    LPS._lp.armed = false; LPS._lp.cursorAtEntry = null; LPS._lp.holdBroke = false; LPS._lp.revealedHops = 0;
    LPS._lp.chainBox = null; LPS._lp.armPose = null; LPS._lp.lastHoldPose = null; LPS._lp.far = null; LPS._lp.sectionCutPlane = null; LPS._lp.sectionCut = null; LPS._lp.cutCapResult = null; LPS._lp.batchUnpackResult = null;
    // §129.4: total===0 means ARM found nothing live to touch at all (a lookup miss, not a restore
    // outcome) — vacuous, not a PASS, per the same PRIMAL LAW clause. `planesLeft` is kept in the
    // print for format continuity — the clip plane always goes with its disposed clone in
    // _restoreGhost(), so a real restore always leaves 0 live.
    var vacuous = (total === 0 && clonesN === 0);
    var restoreVerdict = vacuous ? 'INCONCLUSIVE reason=nothing-touched-at-arm'
      : ((materialsRestored === total && clonesReverted === clonesN) ? 'PASS' : 'FAIL');
    console.log('§LOADPATH_RESTORE materialsRestored=' + materialsRestored + '/' + total +
      ' planesLeft=0 clonesReverted=' + clonesReverted + '/' + clonesN + ' => ' + restoreVerdict);
  }
  function _forceRestore() {
    try { LPS._unhideStackOnly(); } catch (eSO2) {}
    A._loadPathVisualRev = (A._loadPathVisualRev || 0) + 1;   // §129.57 — the release changes everything back
    if (LPS._lp && LPS._lp.armed) { _restore(LPS._lp.holdEndSec); return; }
    // Nothing armed — still clear any leftover touch state defensively (bake-abort safety).
    var hasClones = LPS._lp && LPS._lp.hopsUp && LPS._lp.hopsUp.some(function (h) { return !!h._cloneMesh; });
    var hasFarClones = LPS._lp && LPS._lp.far && LPS._lp.far.hopsUp.some(function (h) { return !!h._cloneMesh; });
    if (LPS._ghostTouched.length || LPS._whitenTouched.length || hasClones || hasFarClones) {
      LPS._restoreCutCap();   // bake-abort safety — same as _restore() above, defensive here too
      LPS._restoreBatchedElementClones();   // same defensive safety net for the unbatch clones
      if (LPS._lp && LPS._lp.indoorAnnotHidden) { LPS._lp.indoorAnnotHidden.forEach(function (o) { o.visible = true; }); LPS._lp.indoorAnnotHidden = null; }
      LPS._restoreWhiten();   // LIFO — before _restoreGhost(), same discipline as _restore() above
      var materialsRestored = LPS._restoreGhost();
      var clonesReverted = (LPS._lp ? LPS._disposeChainClones(LPS._lp.hopsUp) : 0) + (LPS._lp && LPS._lp.far ? LPS._disposeChainClones(LPS._lp.far.hopsUp) : 0) +
        (LPS._lp && LPS._lp.twins ? LPS._lp.twins.reduce(function (s, tw) { return s + LPS._disposeChainClones(tw.hopsUp); }, 0) : 0);
      if (LPS._lp) LPS._lp.far = null;
      console.log('§LOADPATH_RESTORE materialsRestored=' + materialsRestored + '/' + materialsRestored +
        ' planesLeft=0 clonesReverted=' + clonesReverted + '/' + clonesReverted + ' => PASS (forced, nothing armed)');
    }
  }
};
