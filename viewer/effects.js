/**
 * BIM OOTB — effects.js — EffectComposer post-processing pipeline
 * Extracted from scene.js (S278 Phase 3)
 * SSAO + OutlinePass + OutputPass. Desktop only — skipped on mobile.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// Implementing S278_REFACTOR_CLASH_PANELS.md §Phase 3 — Witness: W-EFFECTS
async function setupEffects(A, renderer, scene, camera) {
  A._composer = null;
  A._ssaoPass = null;
  A._outlinePass = null;
  A._composerEnabled = false;

  // §EFFECTS_SKIP: Mobile — no EffectComposer creation, zero GPU allocation
  var _isMobile = (navigator.maxTouchPoints > 0 && window.screen.width < 1024);
  if (_isMobile) {
    console.log('§EFFECTS_SKIP mobile — direct render only');
    A.toggleSSAO = function() {};
    A.setOutline = function() {};
    return;
  }

  try {
    // §S277c: Parallel import — all 6 addons load concurrently, not sequentially
    var [_ecMod, _rpMod, _taaMod, _ssaoMod, _outMod, _opMod] = await Promise.all([
      import('./lib/EffectComposer.js'),
      import('./lib/RenderPass.js'),
      import('./lib/TAARenderPass.js'),
      import('./lib/SSAOPass.js'),
      import('./lib/OutlinePass.js'),
      import('./lib/OutputPass.js')
    ]);

    var _composer = new _ecMod.EffectComposer(renderer);
    _composer.setSize(window.innerWidth, window.innerHeight);
    _composer.setPixelRatio(renderer.getPixelRatio());

    // §NIGHT-STILL-REFINE (2026-07-15, user ask): Pass 1 is a TAARenderPass instead of a plain
    // RenderPass — with `.accumulate=false` (default) it behaves identically to RenderPass, zero
    // added cost during normal navigation. `A.startStillRefine()` below flips accumulate=true and
    // drives 16 jittered-camera accumulation samples across idle frames to build a crisp
    // supersampled still; any interaction (markDirty, wrapped below) cancels it immediately.
    var _renderPass = new _taaMod.TAARenderPass(scene, camera);
    _composer.addPass(_renderPass);

    // Pass 2: SSAO — contact shadows in room corners, pipe junctions
    var _ssaoPass = new _ssaoMod.SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    _ssaoPass.kernelRadius = 0.5;    // 0.5m — architectural scale
    _ssaoPass.minDistance = 0.001;
    _ssaoPass.maxDistance = 0.1;
    _ssaoPass.enabled = false;  // off by default — toggled with Shadow or UI
    _composer.addPass(_ssaoPass);

    // Pass 3: Outline — mesh silhouette on pick/clash/find
    var _outlinePass = new _outMod.OutlinePass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera
    );
    _outlinePass.edgeStrength = 3;
    _outlinePass.edgeGlow = 0;
    _outlinePass.edgeThickness = 1.5;
    _outlinePass.visibleEdgeColor.set(0xff8c00);  // orange pick
    _outlinePass.hiddenEdgeColor.set(0xff4400);
    _outlinePass.enabled = false;  // enabled on demand by pick/clash
    _composer.addPass(_outlinePass);

    // Pass 4: Output — tone mapping + color space
    var _outputPass = new _opMod.OutputPass();
    _composer.addPass(_outputPass);

    A._composer = _composer;
    A._ssaoPass = _ssaoPass;
    A._outlinePass = _outlinePass;
    A._renderPass = _renderPass;
    A._taaPass = _renderPass;
    console.log('§EFFECTS_INIT loaded — TAARenderPass + SSAO + Outline + Output');
  } catch(e) {
    console.warn('§EFFECTS_INIT_FAIL ' + e.message + ' — falling back to direct render');
    A._composer = null;
  }

  // §S277c: Toggle SSAO (called from Shadow toggle or UI)
  A.toggleSSAO = function(on) {
    if (!A._ssaoPass) return;
    A._ssaoPass.enabled = on;
    A._composerEnabled = on || (A._outlinePass && A._outlinePass.enabled);
    console.log('§SSAO toggle=' + on);
  };

  // §S277c: Set outline targets (called from pick/clash/find)
  A.setOutline = function(objects, color) {
    if (!A._outlinePass) return;
    A._outlinePass.selectedObjects = objects || [];
    if (color) A._outlinePass.visibleEdgeColor.set(color);
    A._outlinePass.enabled = objects && objects.length > 0;
    A._composerEnabled = A._outlinePass.enabled || (A._ssaoPass && A._ssaoPass.enabled);
  };

  // §NIGHT-STILL-REFINE (2026-07-15, user ask): progressive TAA still — accumulates 16 jittered
  // samples across idle frames into a crisp supersampled image, cancels on any interaction.
  A._stillRefineActive = false;
  var _stillRefineRAF = null;
  var _stillRefinePrevComposerEnabled = false;
  // §STILL_REFINE_TEARDOWN (2026-07-15, real-user bug): natural completion used to skip this —
  // A._taaPass.accumulate stayed true and A._composerEnabled stayed forced-on forever afterward,
  // so every subsequent normal render kept re-painting the FROZEN accumulated image instead of a
  // fresh live frame (accumulateIndex>=16 short-circuits TAARenderPass's sampling loop but still
  // re-blends the stale _sampleRenderTarget). That's exactly the "blurred/multi-shot after moving
  // the camera" the user hit live. Both the done-path and the cancel-path must reset the SAME
  // state — only the log line differs.
  // §TRIPLANAR: the actual uTriActive toggle now lives in each material's own onBeforeRender
  // (streaming.js §TRIPLANAR_RECOMPILE_FIX — self-heals across shader recompiles, which a
  // one-time push from here cannot). This just counts registered materials for the perf log.
  var _stillRefineStartMs = 0;
  function _setTriplanarActive(active) {
    return (A._triplanarMaterials || []).length;
  }
  function _teardownStillRefine(reason) {
    A._stillRefineActive = false;
    if (_stillRefineRAF) { cancelAnimationFrame(_stillRefineRAF); _stillRefineRAF = null; }
    if (A._taaPass) { A._taaPass.accumulate = false; A._taaPass.accumulateIndex = -1; }
    A._composerEnabled = _stillRefinePrevComposerEnabled;
    var n = _setTriplanarActive(false);
    var ms = _stillRefineStartMs ? Math.round(performance.now() - _stillRefineStartMs) : 0;
    console.log('§STILL_REFINE ' + reason + ' elapsedMs=' + ms);
    if (n > 0) console.log('§TRIPLANAR_PERF ms=' + ms + ' materials=' + n);
  }
  A.startStillRefine = function() {
    if (!A._composer || !A._taaPass || A._stillRefineActive) return;
    A._stillRefineActive = true;
    _stillRefinePrevComposerEnabled = A._composerEnabled;
    A._composerEnabled = true;
    A._taaPass.accumulate = true;
    A._taaPass.accumulateIndex = -1;
    _stillRefineStartMs = performance.now();
    var _triCount = _setTriplanarActive(true);
    console.log('§STILL_REFINE start samples=16 triplanarMaterials=' + _triCount);
    function step() {
      if (!A._stillRefineActive) return;
      A._composer.render();
      var idx = A._taaPass.accumulateIndex;
      if (idx >= 16) { _teardownStillRefine('done accumulateIndex=' + idx); return; }
      _stillRefineRAF = requestAnimationFrame(step);
    }
    _stillRefineRAF = requestAnimationFrame(step);
  };
  A.stopStillRefine = function() {
    if (!A._stillRefineActive) return;
    _teardownStillRefine('cancelled (interaction)');
  };
  A.toggleStillRefine = function() {
    if (A._stillRefineActive) A.stopStillRefine(); else A.startStillRefine();
  };
  // §STILL_REFINE cancellation lives in main.js, on the actual pointerdown/wheel/controls-start
  // signals — NOT here on markDirty. Confirmed live (2026-07-15, real user) that markDirty fires
  // from far more than "user touched the canvas" (e.g. the history bar's own event-sniffer
  // refreshing itself right after logging the very Alt+S keypress that started the refine),
  // which self-cancelled the refine within the same keypress. Precise interaction signals only.
}
