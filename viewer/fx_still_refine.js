// effects family — part `still_refine` (original effects.js lines 5175–6659).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/effects.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as FXS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__effectsParts = (typeof window !== 'undefined' ? window : globalThis).__effectsParts || {};
(typeof window !== 'undefined' ? window : globalThis).__effectsParts.still_refine = function* __split_effects_still_refine(FXS, A, renderer, scene, camera) {
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  FXS._vacLog = _vacLog;
  FXS._teardownStillRefine = _teardownStillRefine;
  Object.defineProperty(FXS, '_autoStageOn', { get: function () { return _autoStageOn; }, set: function (v) { _autoStageOn = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_N_FRAMES', { get: function () { return CINEMA_N_FRAMES; }, set: function (v) { CINEMA_N_FRAMES = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_FPS', { get: function () { return CINEMA_FPS; }, set: function (v) { CINEMA_FPS = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_SSAA_LEVEL', { get: function () { return CINEMA_SSAA_LEVEL; }, set: function (v) { CINEMA_SSAA_LEVEL = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cinemaSsaaPass', { get: function () { return _cinemaSsaaPass; }, set: function (v) { _cinemaSsaaPass = v; }, enumerable: true });
  Object.defineProperty(FXS, '_cinemaSsaaImportFailed', { get: function () { return _cinemaSsaaImportFailed; }, set: function (v) { _cinemaSsaaImportFailed = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_PULLBACK_START', { get: function () { return CINEMA_PULLBACK_START; }, set: function (v) { CINEMA_PULLBACK_START = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_PULLBACK_SCALE', { get: function () { return CINEMA_PULLBACK_SCALE; }, set: function (v) { CINEMA_PULLBACK_SCALE = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_ELLIPTICITY', { get: function () { return CINEMA_ELLIPTICITY; }, set: function (v) { CINEMA_ELLIPTICITY = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_TILT_MIN_DEG', { get: function () { return CINEMA_TILT_MIN_DEG; }, set: function (v) { CINEMA_TILT_MIN_DEG = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_TILT_MAX_DEG', { get: function () { return CINEMA_TILT_MAX_DEG; }, set: function (v) { CINEMA_TILT_MAX_DEG = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_RADIUS_MIN_FACTOR', { get: function () { return CINEMA_RADIUS_MIN_FACTOR; }, set: function (v) { CINEMA_RADIUS_MIN_FACTOR = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_RADIUS_MAX_FACTOR', { get: function () { return CINEMA_RADIUS_MAX_FACTOR; }, set: function (v) { CINEMA_RADIUS_MAX_FACTOR = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_FILL_MARGIN', { get: function () { return CINEMA_FILL_MARGIN; }, set: function (v) { CINEMA_FILL_MARGIN = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_DIVE_SEC', { get: function () { return CINEMA_DIVE_SEC; }, set: function (v) { CINEMA_DIVE_SEC = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_SPIN_SEC', { get: function () { return CINEMA_SPIN_SEC; }, set: function (v) { CINEMA_SPIN_SEC = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_OUT_SEC', { get: function () { return CINEMA_OUT_SEC; }, set: function (v) { CINEMA_OUT_SEC = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_RISE_SEC', { get: function () { return CINEMA_RISE_SEC; }, set: function (v) { CINEMA_RISE_SEC = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_TURN_OVERLAP', { get: function () { return CINEMA_TURN_OVERLAP; }, set: function (v) { CINEMA_TURN_OVERLAP = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_TURN_OVERLAP_MAX', { get: function () { return CINEMA_TURN_OVERLAP_MAX; }, set: function (v) { CINEMA_TURN_OVERLAP_MAX = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_TURN_ANTIPODAL_RAD', { get: function () { return CINEMA_TURN_ANTIPODAL_RAD; }, set: function (v) { CINEMA_TURN_ANTIPODAL_RAD = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_EYE_M', { get: function () { return CINEMA_EYE_M; }, set: function (v) { CINEMA_EYE_M = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_LOOKDOWN_DEG', { get: function () { return CINEMA_LOOKDOWN_DEG; }, set: function (v) { CINEMA_LOOKDOWN_DEG = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_SUN_GUARD_DEG', { get: function () { return CINEMA_SUN_GUARD_DEG; }, set: function (v) { CINEMA_SUN_GUARD_DEG = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_FLAT_HOLD_SEC', { get: function () { return CINEMA_FLAT_HOLD_SEC; }, set: function (v) { CINEMA_FLAT_HOLD_SEC = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_DESCENT_MIN_SEC', { get: function () { return CINEMA_DESCENT_MIN_SEC; }, set: function (v) { CINEMA_DESCENT_MIN_SEC = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_FLAT_TILT_DEG', { get: function () { return CINEMA_FLAT_TILT_DEG; }, set: function (v) { CINEMA_FLAT_TILT_DEG = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_CLIMB_MIN_SEC', { get: function () { return CINEMA_CLIMB_MIN_SEC; }, set: function (v) { CINEMA_CLIMB_MIN_SEC = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_END_DECEL_SEC', { get: function () { return CINEMA_END_DECEL_SEC; }, set: function (v) { CINEMA_END_DECEL_SEC = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_FAN_RAYS', { get: function () { return CINEMA_FAN_RAYS; }, set: function (v) { CINEMA_FAN_RAYS = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_FAN_FAR', { get: function () { return CINEMA_FAN_FAR; }, set: function (v) { CINEMA_FAN_FAR = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_FAN_NUDGE_MAX', { get: function () { return CINEMA_FAN_NUDGE_MAX; }, set: function (v) { CINEMA_FAN_NUDGE_MAX = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CINEMA_ENCLOSED_THRESHOLD', { get: function () { return CINEMA_ENCLOSED_THRESHOLD; }, set: function (v) { CINEMA_ENCLOSED_THRESHOLD = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order

  // §STILL_REFINE_FREEZE (2026-07-15, user-observed): on a real GPU, 16 samples finish in
  // ~150ms — reverting composer/textures/sky the instant accumulation naturally completes made
  // the whole effect flash past almost invisibly, nothing like how Night/Shadow mode normally
  // stay on until you explicitly turn them off. Natural completion now only stops the RAF
  // stepping loop and logs the timing — composer/triplanar/photo-staging all stay exactly as
  // accumulated (the finished still stays frozen on screen) until a REAL interaction fires
  // A.stopStillRefine() (main.js's pointerdown/wheel/controls-start hooks). Only that path does
  // the full revert.
  function _finishStillRefine(idx) {
    if (FXS._stillRefineRAF) { cancelAnimationFrame(FXS._stillRefineRAF); FXS._stillRefineRAF = null; }
    // §PHOTO_SHADOW_FINALCAPTURE: guarantee the frame that AO/SSGI (and MaxQ's capture) inherit
    // was checked fresh, regardless of whether the skip-gate happened to skip the last accumulation
    // tick — see effects.js _reassertPhotoShadowCoverage's `force` param.
    FXS._reassertPhotoShadowCoverage(true);
    var ms = FXS._stillRefineStartMs ? Math.round(performance.now() - FXS._stillRefineStartMs) : 0;
    console.log('§STILL_REFINE done accumulateIndex=' + idx + ' elapsedMs=' + ms + ' (frozen — stays until interaction)');
    // §FAULT: one self-check line per press, at the FINISHED still (at staging end the lamps that later switch off were still on:
    // extLightsDay=191 there against 31 after the press)
    if (!A._maxqActive && window.StillFault) { try { window.StillFault.report(A); } catch (eF) { console.warn('§FAULT report failed: ' + eF.message); } }
    if (!A._maxqActive) { try { _fixtureEmissiveCount(); } catch (eFE) { console.warn('§FIXTURE_EMISSIVE failed: ' + eFE.message); } }   // once per Alt+S, at the staged still
    FXS._stillShadowRendersReport(ms);
    // §PHOTO_SSGI (2026-07-17): the frozen still now folds in real bounce-light GI (effects_gi_poc.js
    // §PHOTO_SSGI, still-quality knobs) — the AO-only fold stays as the fallback whenever the SSGI
    // bundle/effect is unavailable or disabled (A._stillSSGIEnabled=false), so Alt+S never regresses
    // below its previous behavior.
    if (typeof A.startStillSSGIPhase === 'function') {
      A.startStillSSGIPhase().then(function(engaged) { if (!engaged) _startStillAOPhase(); })
        .catch(function(e) { console.warn('§PHOTO_SSGI_FAIL ' + e.message + ' — falling back to AO fold'); _startStillAOPhase(); });
    } else {
      _startStillAOPhase();  // §PHOTO_AO: fold N8AO contact-shadow into the finished still (no-op if unavailable)
    }
  }

  // §PHOTO_AO (2026-07-16, Task 1 — one keypress: the Alt+S still now INCLUDES N8AO ambient
  // occlusion, no separate Alt+G needed. Alt+G stays a fully standalone preview, untouched):
  // n8ao ships TWO variants — N8AOPostPass (pmndrs composer, used by effects_gi_poc.js) and
  // N8AOPass (three.js NATIVE EffectComposer) — the vendored bundle was rebuilt (same esbuild
  // command, --external:three) to also export N8AOPass, and it extends the SAME lib/Pass.js the
  // importmap already maps, so it slots straight into A._composer's pass array.
  //
  // WHY AN ADAPTER, AND WHY ONLY AFTER THE FREEZE (the double-scene-render problem): both
  // TAARenderPass and N8AOPass are scene-RENDERING passes, not screen-space filters — chained
  // naively, N8AO's own beauty render (single-sample, un-jittered) would REPLACE the 16-sample
  // TAA image it sits after, throwing away the supersampling. Instead:
  //   1. The adapter pass below sits between TAA and OutputPass, disabled during normal
  //      navigation and during the 16-sample accumulation itself (zero cost, zero interplay).
  //   2. When the TAA still FREEZES (16 clean samples — §STILL_REFINE_RESTART guarantees a
  //      still camera), the adapter turns on: it primes N8AO's beautyRenderTarget DEPTH with one
  //      real scene render, then per frame copies the frozen TAA image (readBuffer) into the
  //      beauty COLOR (depth-untouched fullscreen copy) and runs N8AO with autoRenderBeauty=false
  //      — so the AO is computed from real scene depth but composited over the crisp TAA image.
  //   3. Because the camera is frozen, N8AO's accumulate mode refines the AO over
  //      STILL_AO_FRAMES frames with NO further scene renders at all (depth is primed once) —
  //      each frame costs only the AO/denoise/composite quads, then the still freezes WITH AO.
  // OutputPass still runs last, so AO composites in linear light (gammaCorrection=false).
  var STILL_AO_ENABLED = true;
  var STILL_AO_FRAMES = 24;       // n8ao accumulates 1 AO sample-set per still frame; 24 ≈ converged
  var STILL_TAA_FRAMES = 16;      // TAA accumulateIndex target — the other half of the still fold

  // ══ §MAXQ_FRAME_BUDGET (bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md §R10) ═══════════════════
  // THESE TWO NUMBERS ARE THE BAKE CLOCK. Every exported MaxQ frame pays a full still fold:
  // STILL_TAA_FRAMES + STILL_AO_FRAMES = 16 + 24 = 40 composer renders. MEASURED on Hospital
  // (3,447 frames, perFrameMs=1989): §STILL_REFINE ~1,200 ms = 62% and §PHOTO_AO ~450 ms = 23% —
  // 85% of the frame, and 137,880 composer renders for one film. Nothing else in the pipeline is
  // worth touching for bake speed; the session record already says so in as many words.
  //
  // A BAKE and a STILL are not the same job. An Alt+S still is ONE frame a human studies, so it
  // keeps the full 40. A bake is thousands of frames that flick past at 15 fps, where TAA and AO
  // convergence past a point is invisible and simply costs hours. So the budget is overridable, and
  // ONLY the bake overrides it — A._stillBudget is set by cinema_maxq around the frame loop and
  // cleared on every exit path, so Alt+S is bit-for-bit unchanged.
  //
  // Read ONCE per fold into a local: a budget that changed mid-loop would split a single frame
  // across two settings and make the film inconsistent frame to frame.
  function _stillBudget() {
    var b = A._stillBudget;
    return { taa: (b && b.taa > 0) ? Math.round(b.taa) : STILL_TAA_FRAMES,
             ao:  (b && b.ao  > 0) ? Math.round(b.ao)  : STILL_AO_FRAMES };
  }
  // §PHOTO_AO_TUNE (2026-07-16, real-GPU A/B at STILL quality — PHOTO_AO_TUNE_r{8_i6,5_i4,3_i4,
  // 1p5_i3}_2026-07-16.png, identical frozen pose/beauty, only AO varied): radius=8/intensity=6 was
  // kept THEN — the earlier "broad mottle / reads busy" verdict it was compared against was
  // measured over LIVE navigation (raw, unconverged single-frame AO), and at still quality the same
  // radius read as clean contact shadow instead. Smaller radii (3/1.5) were near-invisible at
  // whole-building establishing distance in that same test.
  // §PHOTO_AO_DARK (2026-08-13, user live verdict: "Alt-G too dark... affecting Alt-S and movie" —
  // full trace in prompts/PHOTOREAL_STILL_RENDER.md §PHOTO_AO_TUNING): the 2026-07-16 test compared
  // this radius/intensity against a WORSE (raw-noise) baseline, at ONE lighting condition, and
  // never against the darkness the user is now flagging directly, nor against §SUN_ARC's dusk
  // sweep (shipped 2026-08-11, after this constant was set) which compounds AO darkening on the
  // dim half of every Alt+C film. A live user verdict on "look" supersedes an old A/B per this
  // project's standing rule (the look is the user's call) — first pass: radius 8→4, intensity 6→2.
  // §PHOTO_AO_SCALE (2026-08-13, same-day follow-up, user: "far off well lighted, up close dark"):
  // the flat retune above didn't fix this — it's a distance-scale problem, not overall strength. A
  // FIXED WORLD-SPACE radius (metres) spans the whole visible wall up close but is a barely-visible
  // contact band far away; no single metre value is right at both distances. Switched to n8ao's
  // `screenSpaceRadius` mode (their README: aoRadius becomes SCREEN PIXELS, recommended 16-64, and
  // the effective world radius self-scales with camera distance so the AO reads a consistent size
  // on screen) — same change applied to the standalone Alt+G preview (effects_gi_poc.js).
  // `distanceFalloff` (never set before — was n8ao's own default of 1) set to their documented 0.2
  // for this mode. Denoise raised toward n8ao's own library defaults (aoSamples 8/16, denoiseSamples
  // 4/12→8, denoiseRadius 6→12 below) to cut residual noise too — free here, this is an offline
  // accumulate, not a real-time cost. First-pass pixel radius, like every other value here — verify
  // live on the next round trip, not with a synthetic re-A/B.
  // §PHOTO_AO_EDGE (2026-08-13, same-day 3rd round: user, after §PHOTO_AO_SCALE cleared the
  // darkness, "completely no edge corner shadow"): intensity had been sitting at 2 (down from the
  // original 6) since the first retune and was never revisited when the radius mechanism changed —
  // too weak to read at all once the broad-area darkening was gone. One controlled step up, not
  // back to 6. STILL_AO_RADIUS left unchanged — single-variable change, easy to read next round.
  var STILL_AO_RADIUS = 32;       // pixels (screenSpaceRadius mode), not metres
  var STILL_AO_INTENSITY = 4;
  var _stillAOPromise = null, _stillAORAF = null, _stillAODepthDirty = true;
  function _buildStillAO() {
    return Promise.all([
      import('./lib/postprocessing-n8ao.bundle.js'),
      import('./lib/Pass.js'),
      import('./lib/CopyShader.js')
    ]).then(function(mods) {
      var bundle = mods[0], passMod = mods[1], copyMod = mods[2];
      if (!bundle.N8AOPass) { console.warn('§PHOTO_AO_INIT_FAIL bundle has no N8AOPass export'); return null; }
      var rt = A._composer.renderTarget1;  // composer buffer size INCLUDES pixelRatio — match it exactly
      var n8 = new bundle.N8AOPass(scene, camera, rt.width, rt.height);
      A._aoExcludeWrap(n8, 'N8AOPass', scene);   // §AO_EXCLUDE — THIS is the pass the bake runs (§PHOTO_AO)
      n8.configuration.autoRenderBeauty = false;  // beauty = the frozen TAA image, injected by the adapter
      n8.autoDetectTransparency = false;          // transparency machinery only works with autoRenderBeauty;
                                                  // left on it would feed EMPTY transparency targets to the
                                                  // compositer the first frame a transparent material streams in
      n8.configuration.gammaCorrection = false;   // OutputPass tone-maps after this pass — stay linear
      n8.configuration.accumulate = true;         // camera is frozen during the AO phase — refine, don't flicker
      n8.configuration.screenSpaceRadius = true;  // §PHOTO_AO_SCALE: radius scales with camera distance
      n8.configuration.aoRadius = STILL_AO_RADIUS;
      n8.configuration.distanceFalloff = 0.2;     // n8ao's documented value for screenSpaceRadius mode
      n8.configuration.intensity = STILL_AO_INTENSITY;
      n8.configuration.aoSamples = 8;
      // §SUN_SHADOW_DROWNED (2026-08-13): user, watching a Clinic Alt+C bake, "the sun's cast
      // shadow loses its corner where it meets roof beams" at the sun-arc's high-elevation start —
      // then, after ruling out shadow-map/indoor-outdoor causes: "the new alt-G noise adding to
      // alt-S during daytime... drowns out the shadows" and confirmed via code read that Alt+G
      // (effects_gi_poc.js) never got #1331's denoise bump — it is STILL denoiseSamples=4/
      // denoiseRadius=6 there (n8ao's own "moving camera gets noise cancellation from motion for
      // free" case), only Alt+S/Alt+C's static 24-frame converge got doubled to 8/12. Witnessed:
      // reverting to Alt+G's 6 alone measured +9.9% contrast at a real Clinic exterior beam-foot
      // shadow junction (123.75->135.97, prompts/PHOTOREAL_STILL_RENDER.md §SUN_SHADOW_DROWNED).
      // User's own call: not a full revert (risks reintroducing the pre-#1331 dark/noisy-indoors
      // complaint that #1331 shipped to fix) — "ever so slight" step up from Alt+G's 6/4, not a
      // midpoint. 4->5, 6->7: visibly closer to Alt+G's baseline than to the current 8/12.
      n8.configuration.denoiseSamples = 5;
      n8.configuration.denoiseRadius = 7;
      n8.configuration.halfRes = false;           // still-frame quality
      n8.renderToScreen = false;
      var copyMat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(copyMod.CopyShader.uniforms),
        vertexShader: copyMod.CopyShader.vertexShader,
        fragmentShader: copyMod.CopyShader.fragmentShader,
        depthTest: false, depthWrite: false, blending: THREE.NoBlending
      });
      var copyQuad = new passMod.FullScreenQuad(copyMat);

      // §SUN_SHADOW_RESTORE (2026-08-14, prompts/PHOTOREAL_STILL_RENDER.md §SUN_SHADOW_DROWNED):
      // N8AO's denoiseRadius=7 blur (untouched — user ruling "denoise is already perfect, don't
      // disturb it") smears the composited image across the sun-cast shadow's boundary the same as
      // it legitimately smooths ordinary AO contact-shadow noise elsewhere. The frozen pre-AO TAA
      // beauty (readBuffer) still has that boundary crisp — it is never destroyed by this adapter
      // (see the §PHOTO_AO comment trail above). Fix: reconstruct world position per-pixel from
      // n8's own depth texture (already computed, camera frozen so it's stable for all
      // STILL_AO_FRAMES) + camera inverse-projection/view, transform into A.sun.shadow.camera's
      // clip space via A.sun.shadow.matrix (three.js's own light-space transform, computed once at
      // staging — untouched), and sample A.sun.shadow.map.texture the same way three.js's own basic
      // (non-PCF) getShadow() shader chunk does — mirrored from
      // viewer/lib/three.module.min.js's `shadowmap_pars_fragment` ShaderChunk, not hand-derived:
      // `shadowCoord.z += shadowBias; shadow = step(shadowCoord.z, texture2D(shadowMap,
      // shadowCoord.xy).r)`. A screen-space neighbor tap on this raw, unblurred shadow term (not
      // the AO term) finds where it changes sharply — the true sun-shadow BOUNDARY, not its
      // interior and not an ordinary AO contact crease (those never touch A.sun.shadow.matrix's
      // frustum test at all, so they read a uniform, edge-free shadow term and get zero mask). That
      // mask blends the AO-composited color back toward the pre-AO sharp color, restoring edge
      // sharpness. N8AOPass itself is redirected to render into a scratch target (aoScratchRT)
      // instead of the real writeBuffer ONLY when this restore path is live, so the mask/blend
      // shader can write directly into writeBuffer with no read/write feedback loop and no extra
      // copy pass — one new full-screen shader draw total, only during the AO-converge frames.
      var STILL_SHADOW_RESTORE_ENABLED = true;
      var STILL_SHADOW_RESTORE_KERNEL_PX = 4;   // screen-space neighbor-tap radius, texels — wide
                                                 // enough to counter denoiseRadius=7's blur footprint
                                                 // at NORMAL sun incidence. §SUN_SHADOW_GRAZE_SCALE
                                                 // below widens this per-pixel when the sun grazes
                                                 // the surface (low N.L) — see kScale in the shader.
      var STILL_SHADOW_RESTORE_STRENGTH = 1.0;  // 1.0 = fully restore sharp color at a detected edge
      var STILL_SHADOW_RESTORE_KERNEL_MAX_SCALE = 4.0;  // cap on how far kScale can widen kernelPx —
                                                 // bounds worst-case tap cost (8 taps * this factor)
                                                 // and keeps the mask from smearing across unrelated
                                                 // geometry at near-90 deg grazing incidence
      var shadowRestoreMat = null, shadowRestoreQuad = null, aoScratchRT = null, _srLoggedFor = null;
      if (STILL_SHADOW_RESTORE_ENABLED) {
        var _srFrag = [
          'uniform sampler2D tAO;',
          'uniform sampler2D tSharp;',
          'uniform sampler2D tDepth;',
          // §SUN_SHADOW_RESTORE_DEPTH (2026-09-24): the DEPTH texture through a shadow sampler. It used to read
          // map.texture — the RGBA8 colour attachment, not depth — so the step below never fired (measured:
          // 0 of 1,439,424 px shadowed at a 10 deg sun) and the pass was inert. PCFShadowMap gives the depth
          // texture a compareFunction, so it must be read the way three's own PCF shader reads it.
          'uniform sampler2DShadow tShadowMap;',
          'uniform mat4 shadowMatrix;',
          'uniform mat4 projectionMatrixInv;',
          'uniform mat4 viewMatrixInv;',
          'uniform vec2 resolution;',
          'uniform float shadowBias;',
          'uniform float strength;',
          'uniform float kernelPx;',
          'uniform float kernelMaxScale;',
          'uniform vec3 sunDir;',   // world-space direction FROM the surface TOWARD the sun
          'varying vec2 vUv;',
          // Mirrors three.js shadowmap_pars_fragment's basic (non-PCF) getShadow(): world pos from
          // depth, into light clip space via shadowMatrix, compare against the shadow map depth.
          'float shadowAt(vec2 uv) {',
          '  float d = texture2D(tDepth, uv).r;',
          '  if (d >= 1.0) return 1.0;',                       // sky/background — never a shadow edge
          '  vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);',
          '  vec4 viewPos = projectionMatrixInv * ndc; viewPos /= viewPos.w;',
          '  vec4 worldPos = viewMatrixInv * viewPos;',
          '  vec4 sc = shadowMatrix * worldPos; sc.xyz /= sc.w;',
          '  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;',
          '  sc.z += shadowBias;',
          '  return texture(tShadowMap, vec3(sc.xy, sc.z));',   // 1 = lit, 0 = shadowed (hardware compare)
          '}',
          'vec3 worldPosAt(vec2 uv) {',
          '  float d = texture2D(tDepth, uv).r;',
          '  vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);',
          '  vec4 viewPos = projectionMatrixInv * ndc; viewPos /= viewPos.w;',
          '  return (viewMatrixInv * viewPos).xyz;',
          '}',
          'void main() {',
          '  float sC = shadowAt(vUv);',
          // §SUN_SHADOW_GRAZE_SCALE (2026-08-14): kernelPx=4 was tuned against a near-face-on wall
          // boundary — a horizontal slab lit at low sun elevation has the SAME world-space shadow-map
          // texel width, but the light hits it at near-grazing incidence (low N.L), which is where
          // §PHOTO_SHADOW_BIAS already widens worldBias to ~2m to avoid acne (grazeElev-scaled, see
          // _reassertPhotoShadowCoverage). The restore kernel had no equivalent scaling — it stayed a
          // flat 4px everywhere, so it under-searches exactly where the boundary is widest. Reconstruct
          // a screen-space normal via derivatives of the depth-reconstructed world position (no extra
          // normal buffer needed — cheap, and correct per-PIXEL, unlike a single per-frame sun-elevation
          // scalar: a wall and a slab can both be in frame at the same elevation with very different N.L).
          '  vec3 wp0 = worldPosAt(vUv);',
          '  vec3 nrm = normalize(cross(dFdx(wp0), dFdy(wp0)));',
          '  float NdotL = abs(dot(nrm, normalize(sunDir)));',
          '  float kScale = clamp(1.0 / max(NdotL, 1.0 / kernelMaxScale), 1.0, kernelMaxScale);',
          '  vec2 o = (1.0 / resolution) * kernelPx * kScale;',
          '  float edge = 0.0;',
          '  edge = max(edge, abs(sC - shadowAt(vUv + vec2( o.x, 0.0))));',
          '  edge = max(edge, abs(sC - shadowAt(vUv + vec2(-o.x, 0.0))));',
          '  edge = max(edge, abs(sC - shadowAt(vUv + vec2(0.0,  o.y))));',
          '  edge = max(edge, abs(sC - shadowAt(vUv + vec2(0.0, -o.y))));',
          '  edge = max(edge, abs(sC - shadowAt(vUv + vec2( o.x,  o.y))));',
          '  edge = max(edge, abs(sC - shadowAt(vUv + vec2(-o.x,  o.y))));',
          '  edge = max(edge, abs(sC - shadowAt(vUv + vec2( o.x, -o.y))));',
          '  edge = max(edge, abs(sC - shadowAt(vUv + vec2(-o.x, -o.y))));',
          '  vec4 aoColor = texture2D(tAO, vUv);',
          '  vec4 sharpColor = texture2D(tSharp, vUv);',
          '  gl_FragColor = mix(aoColor, sharpColor, edge * strength);',
          '}'
        ].join('\n');
        shadowRestoreMat = new THREE.ShaderMaterial({
          uniforms: {
            tAO: { value: null }, tSharp: { value: null }, tDepth: { value: null },
            tShadowMap: { value: null },
            shadowMatrix: { value: new THREE.Matrix4() },
            projectionMatrixInv: { value: new THREE.Matrix4() },
            viewMatrixInv: { value: new THREE.Matrix4() },
            resolution: { value: new THREE.Vector2(rt.width, rt.height) },
            shadowBias: { value: 0 },
            strength: { value: STILL_SHADOW_RESTORE_STRENGTH },
            kernelPx: { value: STILL_SHADOW_RESTORE_KERNEL_PX },
            kernelMaxScale: { value: STILL_SHADOW_RESTORE_KERNEL_MAX_SCALE },
            sunDir: { value: new THREE.Vector3(0, 1, 0) }
          },
          vertexShader: copyMod.CopyShader.vertexShader,  // same uv-passthrough as copyMat above
          fragmentShader: _srFrag,
          depthTest: false, depthWrite: false, blending: THREE.NoBlending,
          extensions: { derivatives: true }  // dFdx/dFdy for §SUN_SHADOW_GRAZE_SCALE's screen-space normal
        });
        shadowRestoreQuad = new passMod.FullScreenQuad(shadowRestoreMat);
        aoScratchRT = new THREE.WebGLRenderTarget(rt.width, rt.height,
          { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
        console.log('§SUN_SHADOW_RESTORE_INIT_OK kernelPx=' + STILL_SHADOW_RESTORE_KERNEL_PX +
          ' strength=' + STILL_SHADOW_RESTORE_STRENGTH + ' kernelMaxScale=' + STILL_SHADOW_RESTORE_KERNEL_MAX_SCALE +
          ' (§SUN_SHADOW_GRAZE_SCALE — kernel now widens per-pixel at grazing sun incidence)');
      }

      // §ZERO Z10 AO_INDIRECT (PHOTOREAL_STILL_RENDER.md "### Z10 SPEC", option A): in 'shader' mode N8AO renders the AO ONLY
      // (renderMode 1) into this private target while the screen keeps the TAA frame; the materials then read it for their
      // indirect terms in a second TAA phase (sourced_light.js aoPatch). Half float, no depth, the composer's size.
      var aoOnlyRT = new THREE.WebGLRenderTarget(rt.width, rt.height, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
      var adapter = {
        n8: n8,                // §LAMP_CONTACT_SHADOW: the phase-1 depth (n8.beautyRenderTarget.depthTexture) feeds the lamp contact march
        aoOnly: false,         // §ZERO Z10: true = write N8AO's AO into aoOnlyRT, pass the TAA frame through unchanged
        aoOnlyRT: aoOnlyRT,
        aoIndRT: aoOnlyRT,     // §AO_LAMPS_FURNITURE: the indirect AO (law radius); aoLampRT = the lamp-only AO (furniture radius)
        aoLampRT: new THREE.WebGLRenderTarget(rt.width, rt.height, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false }),
        enabled: false,        // §PHOTO_AO_GATE: disabled = EffectComposer skips it entirely — the
                               // zero-cost-when-off discipline everything else in this file follows
        needsSwap: true, clear: false, renderToScreen: false,
        setSize: function(w, h) {
          n8.setSize(w, h);
          _stillAODepthDirty = true;
          if (aoScratchRT) aoScratchRT.setSize(w, h);
          aoOnlyRT.setSize(w, h);   // §ZERO Z10
          if (adapter.aoLampRT) adapter.aoLampRT.setSize(w, h);   // §AO_LAMPS_FURNITURE
          if (shadowRestoreMat) shadowRestoreMat.uniforms.resolution.value.set(w, h);
        },
        render: function(renderer2, writeBuffer, readBuffer) {
          if (_stillAODepthDirty) {
            // Depth prime: ONE real scene render into n8ao's beauty target — we need its DEPTH
            // texture for the AO; the color it writes is overwritten by the TAA copy right below.
            // Re-primed on resize and whenever markDirty fires while active (§PHOTO_AO_STREAM
            // re-assert — geometry streaming in later must reach the depth buffer too).
            renderer2.setRenderTarget(n8.beautyRenderTarget);
            renderer2.clear(true, true, true);
            renderer2.render(scene, camera);
            n8.firstFrame();
            _stillAODepthDirty = false;
          }
          // Inject the TAA output as the AO composite's beauty color. autoClear must be off —
          // a clear here would wipe the depth we just primed (the copy quad itself writes no depth).
          var oldAutoClear = renderer2.autoClear;
          renderer2.autoClear = false;
          copyMat.uniforms.tDiffuse.value = readBuffer.texture;
          renderer2.setRenderTarget(n8.beautyRenderTarget);
          copyQuad.render(renderer2);
          renderer2.autoClear = oldAutoClear;
          n8.renderToScreen = false;
          if (adapter.aoOnly) {   // §ZERO Z10: AO into the private target; the frame on screen stays the TAA image (no restore pass —
            n8.render(renderer2, adapter.aoOnlyRT, readBuffer);   // §AO_LAMPS_FURNITURE: swappable (phase 1b writes the lamp AO)   // direct light is never multiplied by AO in this mode, nothing to restore)
            var oac = renderer2.autoClear; renderer2.autoClear = false;
            copyMat.uniforms.tDiffuse.value = readBuffer.texture; renderer2.setRenderTarget(writeBuffer); copyQuad.render(renderer2);
            renderer2.autoClear = oac;
            return;
          }
          // §SUN_SHADOW_RESTORE: only reroute N8AO's output into the scratch target (and pay for
          // the extra mask/blend pass) when a real sun shadow is actually available to restore —
          // otherwise this is byte-identical to the pre-existing n8.render(..., writeBuffer, ...).
          // A._sunShadowRestoreEnabled is a live, runtime-toggleable override (default FALSE since 2026-09-24) — same
          // shape as A._shadowOn etc — so a same-session witness A/B can flip it after AO has
          // already converged (n8's own accumulation is untouched by this pass's output routing)
          // without needing two separate page loads / two separate builds.
          var canRestore = STILL_SHADOW_RESTORE_ENABLED && A._sunShadowRestoreEnabled !== false &&
            shadowRestoreMat && A.sun && A.sun.castShadow && A.sun.shadow && A.sun.shadow.map;
          // §SUN_SHADOW_RESTORE_DEPTH: no depth texture = nothing honest to read; stand down, never fall back
          // to the colour attachment. One line per shadow map, so a still says which source it used.
          var _srDepth = canRestore ? A.sun.shadow.map.depthTexture : null;
          if (canRestore && _srLoggedFor !== A.sun.shadow.map) {
            _srLoggedFor = A.sun.shadow.map;
            console.log('§SUN_SHADOW_RESTORE_SRC ' + (_srDepth ? 'depthTexture compare=' + _srDepth.compareFunction +
              ' size=' + (_srDepth.image ? _srDepth.image.width + 'x' + _srDepth.image.height : '?') : 'none — pass stands down'));
          }
          if (!_srDepth) canRestore = false;
          if (canRestore) {
            n8.render(renderer2, aoScratchRT, readBuffer);
            var u = shadowRestoreMat.uniforms;
            u.tAO.value = aoScratchRT.texture;
            u.tSharp.value = readBuffer.texture;
            u.tDepth.value = n8.beautyRenderTarget.depthTexture;
            u.tShadowMap.value = _srDepth;   // §SUN_SHADOW_RESTORE_DEPTH
            u.shadowMatrix.value.copy(A.sun.shadow.matrix);
            u.projectionMatrixInv.value.copy(camera.projectionMatrixInverse);
            u.viewMatrixInv.value.copy(camera.matrixWorld);
            u.shadowBias.value = A.sun.shadow.bias;
            // §SUN_SHADOW_GRAZE_SCALE: direction FROM the scene TOWARD the sun, world-space — the
            // shader takes abs(dot(surfaceNormal, this)), so the sign convention doesn't matter,
            // only the axis. Recomputed every frame since §SUN_ARC_STEP moves the sun during a bake.
            var _sunTx = A.sun.target ? A.sun.target.position.x : 0;
            var _sunTy = A.sun.target ? A.sun.target.position.y : 0;
            var _sunTz = A.sun.target ? A.sun.target.position.z : 0;
            u.sunDir.value.set(A.sun.position.x - _sunTx, A.sun.position.y - _sunTy,
              A.sun.position.z - _sunTz).normalize();
            renderer2.setRenderTarget(writeBuffer);
            shadowRestoreQuad.render(renderer2);
          } else {
            n8.render(renderer2, writeBuffer, readBuffer);
          }
        }
      };
      A._composer.insertPass(adapter, 1);  // directly after the TAA pass, before (disabled) SSAO/Outline + OutputPass
      A._stillAOPass = n8;                 // diagnostics/tests — closure state is otherwise invisible
      A._stillAOAdapter = adapter;
      A._shadowRestoreMat = shadowRestoreMat;  // §SUN_SHADOW_RESTORE diagnostics/witness
      // §SUN_SHADOW_RESTORE_OFF_DEFAULT (2026-09-24): with §SUN_SHADOW_RESTORE_DEPTH the pass finally fires,
      // and it pastes blocky halos around shadows and makes the stair-step read MORE clearly (Hospital,
      // 10 deg sun: edge band 36% of the frame). Default OFF = the look before today (the pass was inert
      // since 2026-08-14). The fix stays; A._sunShadowRestoreEnabled = true turns it on. Tuning is red1's call.
      if (A._sunShadowRestoreEnabled === undefined) A._sunShadowRestoreEnabled = false;
      console.log('§SUN_SHADOW_RESTORE ' + (A._sunShadowRestoreEnabled ? 'ON' : 'OFF (default) — set APP._sunShadowRestoreEnabled=true to enable'));
      // §PHOTO_AO_STREAM re-assert (same landmine as §GI_POC_STALE_FIX): anything that changes the
      // scene while the still is frozen-with-AO (streaming, xray, selection) goes through
      // A.markDirty — chain onto it (effects_gi_poc.js wraps it the same way; the wraps compose)
      // so the depth buffer is re-primed and the AO accumulation reset instead of blending stale.
      if (A.markDirty) {
        var _origMD = A.markDirty;
        A.markDirty = function() {
          if (adapter.enabled) { _stillAODepthDirty = true; n8.firstFrame(); }
          return _origMD.apply(A, arguments);
        };
      }
      console.log('§PHOTO_AO_INIT_OK N8AOPass in native composer chain (lazy) size=' + rt.width + 'x' + rt.height);
      return { pass: n8, adapter: adapter };
    }).catch(function(e) {
      console.warn('§PHOTO_AO_INIT_FAIL ' + e.message);
      _stillAOPromise = null;  // don't latch a transient load failure (same lesson as §GI_BUILD_RETRY)
      return null;
    });
  }
  function _ensureStillAO() {
    if (!_stillAOPromise) _stillAOPromise = _buildStillAO();
    return _stillAOPromise;
  }
  function _stopStillAOPhase(reason) {
    if (_stillAORAF) { cancelAnimationFrame(_stillAORAF); _stillAORAF = null; }
    if (_aoIndirectBound && window.SourcedLight && window.SourcedLight.aoSet) {   // §ZERO Z10: materials back to AO 1 (dummy texture, x = 0)
      _aoIndirectBound = false; window.SourcedLight.aoSet(A, null, false); if (window.SourcedLight.csSet) window.SourcedLight.csSet(A, null, null); console.log('§AO_INDIRECT released (' + reason + ')'); }
    if (A._stillAOAdapter) A._stillAOAdapter.aoOnly = false;
    if (A._stillAOAdapter && A._stillAOAdapter.enabled) {
      A._stillAOAdapter.enabled = false;
      console.log('§PHOTO_AO off (' + reason + ') — pass disabled, zero cost during normal nav');
    }
  }
  // ══ §ZERO Z10 AO_INDIRECT (PHOTOREAL_STILL_RENDER.md "### Z10 SPEC") ═══════════════════════════════════════════════════════
  // legacy    — a film (A._maxqActive) or &aoindirect=0: today's composite and today's values, re-set here every phase so a still
  //             never leaks its config into a film (Z13 inherits the approved still later).
  // shader    — stills with the aomap patch installed: N8AO world radius (LightLaw.AO), AO only -> materials' indirect terms.
  // composite — stills without the patch (&sourced=0 / link-fail fallback): the old composite with the LAW radius/power only.
  var _aoIndirectBound = false;
  function _aoIndirectConfigure(ao) {
    var c = ao.pass.configuration, law = window.LightLaw && window.LightLaw.AO;
    var off = !!A._maxqActive || /[?&]aoindirect=0/.test(location.search) || !law;
    var patched = !!(window.SourcedLight && window.SourcedLight.aoPatched && window.SourcedLight.aoPatched());
    var mode = off ? 'legacy' : (patched ? 'shader' : 'composite');
    if (mode === 'legacy') {
      c.screenSpaceRadius = true; c.aoRadius = STILL_AO_RADIUS; c.distanceFalloff = 0.2; c.intensity = STILL_AO_INTENSITY; c.renderMode = 0;
      ao.adapter.aoOnly = false;
    } else {
      c.screenSpaceRadius = false; c.aoRadius = law.radiusM; c.distanceFalloff = law.falloff; c.intensity = law.power;
      c.renderMode = (mode === 'shader') ? 1 : 0; ao.adapter.aoOnly = (mode === 'shader');
    }
    if (!off || /[?&]aoindirect=0/.test(location.search)) console.log('§AO_INDIRECT mode=' + mode + ' radius=' + c.aoRadius + (c.screenSpaceRadius ? 'px' : 'm') +
      ' power=' + c.intensity + ' falloff=' + c.distanceFalloff + ' patch=' + (patched ? 1 : 0) + (mode === 'composite' ? ' (world-radius step only: aomap patch not installed)' : ''));
    return mode;
  }
  // §AO_LAMPS_FURNITURE (bim-compiler PHOTOREAL_STILL_RENDER.md §SEAT_SHADOW, red1 "Go" 2026-10-01): the lamp term gets its OWN AO, world radius
  // DERIVED from the building's furniture heights (90th percentile of element_transforms.bbox_z over IfcFurniture/IfcFurnishingElement,
  // clamped 0.5..1.5 m): many ceiling luminaires ~ one broad overhead source, whose visibility is what hemispheric AO measures; the 0.5 m law
  // radius cannot see a 0.74 m table top (§CONTACT_BOUNCE 09-28: 1-2 %). Indirect AO keeps the law radius. &aolampr=m overrides, 0 = off.
  var _aoLampRCache = {};
  function _aoLampRadius() {
    var m = /[?&]aolampr=([0-9.]+)/.exec(location.search); if (m) return { r: Math.min(1.5, +m[1]), src: '&aolampr' };
    if (!/[?&]aolampr=auto/.test(location.search) && A._stillAoLamps !== true) return { r: 0, src: 'default off (measured no gain 2026-10-01: Terminal seats/open 1.08 -> 1.07 at 0.75 m, 1.08 at 1.5 m; &aolampr=auto|m = on)' };
    var b = A.activeBuilding || '?'; if (_aoLampRCache[b]) return _aoLampRCache[b];
    var res = { r: 0, src: 'no furniture' };
    try { var q = A.dbQuery("SELECT t.bbox_z FROM elements_meta e JOIN element_transforms t ON t.guid = e.guid WHERE e.ifc_class IN ('IfcFurniture','IfcFurnishingElement') AND t.bbox_z > 0 ORDER BY t.bbox_z");
      if (q && q.length) { var p90 = +q[Math.min(q.length - 1, Math.floor(0.9 * q.length))][0]; res = { r: Math.max(0.5, Math.min(1.5, p90)), src: 'furniture p90 ' + p90.toFixed(2) + ' m of ' + q.length }; } }
    catch (e) { res = { r: 0, src: 'query failed: ' + e.message }; }
    return (_aoLampRCache[b] = res);
  }
  function _aoLampPhase(ao, t0, f0, aoFrames) {
    var law = window.LightLaw && window.LightLaw.AO, R = _aoLampRadius(), base = ao.pass.configuration.aoRadius;
    if (!(R.r > base + 0.05)) { console.log('§AO_LAMPS_FURNITURE skip r=' + R.r + ' (' + R.src + ') — lamps use the law AO'); ao.adapter.aoLampReady = false; _aoIndirectTaa2(ao, t0, f0); return; }
    var t1 = performance.now(), sig = _camSig(), k = 0;
    ao.adapter.aoOnlyRT = ao.adapter.aoLampRT; ao.pass.configuration.aoRadius = R.r; ao.pass.firstFrame();
    (function stepL() {
      _stillAORAF = null;
      if (!A._stillRefineActive || !ao.adapter.enabled) { ao.adapter.aoOnlyRT = ao.adapter.aoIndRT; ao.pass.configuration.aoRadius = base; return; }
      if (_camSig() !== sig) { sig = _camSig(); _stillAODepthDirty = true; }
      A._composer.render(); k++;
      if (k >= aoFrames) {
        ao.adapter.aoOnlyRT = ao.adapter.aoIndRT; ao.pass.configuration.aoRadius = base; ao.adapter.aoLampReady = true;
        console.log('§AO_LAMPS_FURNITURE on r=' + R.r.toFixed(2) + 'm (' + R.src + ') indirectR=' + base + 'm frames=' + k + ' ms=' + Math.round(performance.now() - t1));
        _aoIndirectTaa2(ao, t0, f0); return;
      }
      _stillAORAF = requestAnimationFrame(stepL);
    })();
  }
  function _aoIndirectTaa2(ao, t0, aoFrames) {
    ao.adapter.enabled = false; ao.adapter.aoOnly = false;   // the AO buffer is final; the frame is rebuilt with it inside the lighting
    var SL = window.SourcedLight, rtA = ao.adapter.aoOnlyRT;
    var nb = SL.aoSet(A, rtA.texture, false, rtA.width, rtA.height, ao.adapter.aoLampReady ? ao.adapter.aoLampRT.texture : null);   // bind the texture on every live program (x stays 0); §AO_LAMPS_FURNITURE lamp AO
    if (SL.csSet) { try { SL.csSet(A, ao.adapter.n8 && ao.adapter.n8.beautyRenderTarget && ao.adapter.n8.beautyRenderTarget.depthTexture, A.camera); } catch (eCS) { console.warn('§LAMP_CONTACT failed: ' + eCS.message); } }
    _aoIndirectBound = true;
    if (nb <= 0) { console.warn('§AO_INDIRECT no patched program took the AO (bound=' + nb + ') — frame kept without AO'); A._stillRefineBusy = false; return; }
    var taaN = _stillBudget().taa, sig = _camSig(), k = 0, t2 = performance.now();
    A._taaPass.accumulateIndex = -1;
    (function stepT() {
      _stillAORAF = null;
      if (!A._stillRefineActive || !_aoIndirectBound) return;   // torn down mid-phase
      if (_camSig() !== sig) { console.log('§AO_INDIRECT cam-moved during the second TAA — AO buffer is stale, frame kept as rendered'); A._stillRefineBusy = false; return; }
      SL.aoOn(true);   // x = 1 only around the composer render (no other render samples the screen AO)
      A._composer.render();
      k++;
      if (A._taaPass.accumulateIndex >= taaN) {
        // stays ON for the frozen frame (a later composer render is the TAA short-circuit of this same accumulation); released at teardown
        console.log('§AO_INDIRECT done mode=shader boundMats=' + nb + ' aoFrames=' + aoFrames + ' taa2=' + k + ' taa2Ms=' + Math.round(performance.now() - t2) +
          ' totalMs=' + Math.round(performance.now() - t0) + ' radiusM=' + ao.pass.configuration.aoRadius + ' power=' + ao.pass.configuration.intensity);
        A._stillRefineBusy = false;
        return;
      }
      SL.aoOn(false);
      _stillAORAF = requestAnimationFrame(stepT);
    })();
  }
  function _startStillAOPhase() {
    // §CINEMA_ROW_BUSY: every early-return below is a real "nothing more will converge" exit for
    // THIS still — clear busy here rather than guess a timeout (a fixed timer either fires too
    // early on a genuinely slow machine — the exact case this flag exists for — or leaves busy
    // stuck true too long on a fast one; explicit exit coverage has neither failure mode).
    if (!STILL_AO_ENABLED || !A._composer) { A._stillRefineBusy = false; return; }
    var t0 = performance.now();
    _ensureStillAO().then(function(ao) {
      if (!ao) { A._stillRefineBusy = false; return; }
      // the world may have moved on during the async import — only fold AO into a still that is
      // still frozen, and never fight the GI composer or the cinema loop for the canvas
      if (!A._stillRefineActive || FXS._stillRefineRAF || A._giComposerActive || FXS._cinemaActive) { A._stillRefineBusy = false; return; }
      _stillAODepthDirty = true;
      var _aoMode = _aoIndirectConfigure(ao);   // §ZERO Z10 — 'shader' | 'composite' | 'legacy', config set per phase
      ao.pass.firstFrame();
      ao.adapter.enabled = true;
      var sig = _camSig(), f = 0, renderMs = 0;
      var _aoFrames = _stillBudget().ao;    // §MAXQ_FRAME_BUDGET — read once, cannot split this fold
      console.log('§PHOTO_AO start frames=' + _aoFrames + ' radius=' + ao.pass.configuration.aoRadius + (ao.pass.configuration.screenSpaceRadius ? 'px' : 'm') +
        ' intensity=' + ao.pass.configuration.intensity + ' mode=' + _aoMode + ' denoiseRadius=' + ao.pass.configuration.denoiseRadius +
        ' denoiseSamples=' + ao.pass.configuration.denoiseSamples + ' (still-only fold — Alt+G untouched)');
      (function stepAO() {
        _stillAORAF = null;
        if (!A._stillRefineActive || !ao.adapter.enabled) return;  // torn down mid-phase
        var s = _camSig();
        if (s !== sig) { sig = s; _stillAODepthDirty = true; }  // late damping/programmatic nudge:
        // re-prime depth; n8ao itself resets its AO accumulation on the view-matrix change
        var r0 = performance.now();
        A._composer.render();
        renderMs += performance.now() - r0;
        f++;
        if (f === 1) _stillSay('shading corners (ambient occlusion)…');   // §STILL_STATUS_STEPS
        if (f >= _aoFrames) {
          console.log('§PHOTO_AO done frames=' + f + ' totalMs=' + Math.round(performance.now() - t0) +
            ' avgRenderMs=' + (renderMs / f).toFixed(1) + ' mode=' + _aoMode + (_aoMode === 'shader' ? ' (AO buffer ready — second TAA phase next)' : ' (frozen with AO — stays until interaction)'));
          if (_aoMode === 'shader') { _aoLampPhase(ao, t0, f, _aoFrames); return; }   // §AO_LAMPS_FURNITURE, then §ZERO Z10's second TAA
          A._stillRefineBusy = false;   // §CINEMA_ROW_BUSY: real completion — icon drops "processing"
          return;
        }
        _stillAORAF = requestAnimationFrame(stepAO);
      })();
    });
  }
  // §VAC V2 / §R14.1 — run-length state for the per-frame still-fold tags. A MaxQ bake tears the
  // staging down and rebuilds it on every frame, so each of these lines fired 1,700-2,000 times
  // per bake with an identical verdict. The verdicts are all still emitted; a run is emitted once
  // with its repeat count, which is the same information in ~three orders of magnitude less log.
  var _vacNightLights = { last: null, n: 0 };
  function _vacLog(st, line, note) {
    if (line !== st.last) {
      if (st.n > 0) console.log(st.last.split(' ')[0] + ' repeats=' + st.n + ' (identical, suppressed' + (st.note ? ' — ' + st.note : '') + ')');
      console.log(line);
      st.last = line; st.n = 0; st.note = note;
    } else {
      st.n++;
      // Bounded heartbeat — a run that never ends (the bake exits mid-run) must still prove the
      // code is running and say how long the run is. §VAC V2: compress, never drop.
      if (st.n % 250 === 0) console.log(line.split(' ')[0] + ' still identical — repeats=' + st.n + (note ? ' (' + note + ')' : ''));
    }
  }
  // §VAC V2 — flush any open run at a REAL still exit, so the last run is never lost to the end of
  // the log. Called from _teardownStillRefine's !keepStaging branch (a bake-frame cancel passes
  // keepStaging=true and must NOT flush — that is the middle of a run, not the end of one).
  function _vacFlushStillTags() {
    var _all = [_vacNightLights, FXS._vacGroundWetness];
    for (var _vi = 0; _vi < _all.length; _vi++) {
      var st = _all[_vi];
      if (st.n > 0 && st.last) console.log(st.last.split(' ')[0] + ' repeats=' + st.n + ' (identical, suppressed — flushed at still exit)');
      st.last = null; st.n = 0;
    }
  }
  // §STILL_RES (2026-09-24, red1: "The Alt-S, can we bump up its resolution?") — the still renders at a preset height
  // independent of the window: renderer + composer pixelRatio raised for the still (the canvas keeps its CSS size, the
  // browser shows it downscaled), restored on every exit (all funnel through _teardownStillRefine). The bounce reads the
  // canvas's drawing buffer, so it follows. &stillres=window|1080p|1440p|4k / APP._stillRes; default `window` (= today)
  // until the cost per preset is measured (watchdog). Never below the window. Alt+S only.
  var STILL_RES_H = { '1080p': 1080, '1440p': 1440, '4k': 2160 };
  var _stillResSavedPR = null;
  function _stillResApply() {
    if (A._maxqActive || !A.renderer || !A._composer) return;
    var m = /[?&]stillres=([a-z0-9]+)/i.exec(location.search);
    // §STILL_RES_DEFAULT_1440 (red1 2026-09-30 "hi res still as default if it cost little"; MEASURED on the 8 GB card, v1513, OOM 0):
    // window 1685x874 vs 1440p 2776x1440 — Terminal press 114 -> 194 s, Hospital 271 -> 298 s, bounce 9.2 -> 11.0 s / 97 -> 94 s, blown
    // unchanged; 4k FAILS the bounce pass (15 / 358,369 WebGPU errors) -> default 1440p, &stillres=window for the quick size.
    var preset = String((typeof A._stillRes === 'string') ? A._stillRes : (m ? m[1] : '1440p')).toLowerCase();
    var pr0 = A.renderer.getPixelRatio(), cssW = window.innerWidth, cssH = window.innerHeight;
    var tH = STILL_RES_H[preset] || 0, pr = Math.max(pr0, tH ? tH / cssH : pr0);
    A._stillResPreset = tH ? preset : 'window';   // gi_still.js keeps today's bounce cap for `window`
    var gl = A.renderer.getContext(), maxRB = gl ? gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) : 16384;
    pr = Math.min(pr, maxRB / Math.max(cssW, cssH));
    if (pr !== pr0) {
      _stillResSavedPR = pr0;
      A.renderer.setPixelRatio(pr);
      A._composer.setPixelRatio(pr); A._composer.setSize(cssW, cssH);
      if (A._ssaoPass) { A._ssaoPass.width = cssW; A._ssaoPass.height = cssH; }
    }
    var bw = A.renderer.domElement.width, bh = A.renderer.domElement.height, px = bw * bh;
    // Rough GPU estimate, formula stated, not measured: composer 2 half-float RGBA + depth/stencil (24 B/px), TAA
    // accumulate + sample half-float (16 B/px), SSAO/normal targets (~16 B/px), canvas + preserved copy (8 B/px) = 64 B/px.
    console.log('§STILL_RES preset=' + preset + ' target=' + bw + 'x' + bh + ' css=' + cssW + 'x' + cssH + ' pixelRatio=' + pr0.toFixed(3) + '->' + pr.toFixed(3) +
      ' px=' + (px / 1e6).toFixed(2) + 'MP estGpuMB~' + Math.round(px * 64 / 1048576) + ' (64 B/px rough; excludes the 8192 sun map)' + (preset in STILL_RES_H || preset === 'window' ? '' : ' (unknown preset, window used)'));
  }
  function _stillResRestore() {
    if (_stillResSavedPR === null || !A.renderer) return;
    var pr = _stillResSavedPR; _stillResSavedPR = null;
    A.renderer.setPixelRatio(pr);
    if (A._composer) { A._composer.setPixelRatio(pr); A._composer.setSize(window.innerWidth, window.innerHeight); }
    if (A._ssaoPass) { A._ssaoPass.width = window.innerWidth; A._ssaoPass.height = window.innerHeight; }
    console.log('§STILL_RES restored pixelRatio=' + pr.toFixed(3) + ' buffer=' + A.renderer.domElement.width + 'x' + A.renderer.domElement.height);
    if (A.markDirty) A.markDirty();
  }
  function _teardownStillRefine(reason, keepStaging) {
    _stillResRestore();
    if (!keepStaging) _stillLock(false);   // §STILL_LOCK — released with the still
    A._stillRefineActive = false;
    A._stillRefineBusy = false;   // §CINEMA_ROW_BUSY safety net — any exit path clears "processing"
    if (!keepStaging) _vacFlushStillTags();   // §VAC V2 — end of a real still, close any open run
    if (FXS._stillRefineRAF) { cancelAnimationFrame(FXS._stillRefineRAF); FXS._stillRefineRAF = null; }
    if (A._taaPass) { A._taaPass.accumulate = false; A._taaPass.accumulateIndex = -1; }
    _stopStillAOPhase(reason);  // §PHOTO_AO: disable the still-only AO pass on ANY exit path
    // §PHOTO_EMBER / §PHOTO_BLOOM: same rule, and this is the ONLY place they are turned off —
    // every cancel, interaction and cinema handoff funnels through here, so a glowing building can
    // never outlive its still. Restoring the materials matters more than disabling the pass: an
    // emissive left on would follow the user back into navigation.
    if (A._bloomPass) A._bloomPass.enabled = false;
    _emberOff();
    if (typeof A._fixtureFaceRestore === 'function') A._fixtureFaceRestore();   // §FIXTURE_FACE (Z25): whole-mesh emissive back for nav/films
    // §NIGHT_STILL_LIGHTS: hand the navigation budget back, or the still's raised set follows the
    // user into their next orbit and the frame rate goes with it. Compares against the CURRENT nav
    // default (A._nightMaxLightsNav), not a stale literal, so §NIGHT_LIGHT_BUDGET_UP-style tuning
    // never silently breaks this reset.
    // W3(A) 2026-10-03: a FILM frame's soft cancel (keepStaging, A._maxqActive) skips this hand-back. The next frame's refine start
    // re-raises the budget at once, so restoring nav here only rebuilt the pool every frame (§LAMP_CAP_CHURN 30->0->30, 12,307 lines
    // in one LTU film) for a state no frame was ever rendered in. The film's own end (keepStaging false) still hands it back.
    if (!(keepStaging && A._maxqActive) && A._nightMaxLights !== A._nightMaxLightsNav && typeof A._nightUpdateLights === 'function') {
      A._nightMaxLights = A._nightMaxLightsNav;
      A._nightNearFadeFloor = 0.3;
      A._nightPLScale = 1.0;   // §STAGED_PL_CUT — nav Night Mode back to full tuned intensity
      if ((A._nightLights && A._nightLights.length) || (A._lampDataUsed && A._nightMode)) A._nightUpdateLights();   // §LAMP_UNCAPPED: data path left no point lights
    }
    // §PHOTO_SSGI: same rule — a fold-engaged SSGI must not outlive the still (a pre-existing
    // Alt+J preview survives, only dropped back to nav-quality knobs; see effects_gi_poc.js).
    if (typeof A.stopStillSSGIPhase === 'function') A.stopStillSSGIPhase(reason);
    // §GI_HANDOFF_GHOST_FIX (2026-07-16): RECOMPUTE the composer state instead of blind-restoring
    // a value saved at start — still-refine and toggleGIPreview each saved/restored
    // _composerEnabled, and the pairs interleave (Alt+S → Alt+G on → camera move soft-cancels the
    // still → Alt+G off restores a pre-GI value that no longer reflects reality), stranding
    // _composerEnabled. The truth is derivable at any moment with the same formula toggleSSAO/
    // setOutline already use: enabled iff SSAO or Outline actually need the composer.
    A._composerEnabled = !!((A._outlinePass && A._outlinePass.enabled) || (A._ssaoPass && A._ssaoPass.enabled));
    var n = FXS._setTriplanarActive(false);
    // §STAGE1_ORBIT_PERSIST (2026-07-16, user spec — "auto stage: #1 when orbiting, #2 when
    // static"): a pure camera-move cancel (orbit-drag-start, wheel-zoom) should drop the crisp
    // TAA-supersample polish (that part is a structural requirement of TAA — see the conversation
    // this session on why it can't survive continuous motion) WITHOUT reverting the mood staging
    // (dusk sky/ground/shadows) — the user explicitly wants staging to persist through navigation,
    // only breaking on an actual selection. `keepStaging` lets the camera-move callers opt out of
    // `_teardownPhotoStaging()` while selection/explicit-Alt+S-off callers still get the full
    // revert unchanged.
    if (!keepStaging) FXS._teardownPhotoStaging();
    var ms = FXS._stillRefineStartMs ? Math.round(performance.now() - FXS._stillRefineStartMs) : 0;
    console.log('§STILL_REFINE ' + reason + ' elapsedMs=' + ms + (keepStaging ? ' (staging kept)' : ''));
    if (n > 0) console.log('§TRIPLANAR_PERF ms=' + ms + ' materials=' + n);
  }
  A._getPhotoSparkles = function() { return FXS._photoSparkles; };  // diagnostic accessors — closures
  A._getPhotoSkyline = function() { return FXS._photoSkyline; };    // always read the CURRENT value
  A._reassertPhotoSparkles = FXS._reassertPhotoSparkles;  // exposed for orbit/camera-driven test scripts —
                                                        // sparkle visibility is camera-position-dependent
                                                        // and the natural step() loop stops re-evaluating
                                                        // it once still-refine freezes.

  // ══ §PHOTO_EMBER (PHOTOREAL_STILL_RENDER.md) — the luminaires light up for the still.
  //
  // User, 2026-07-27: "Can we get light to emit from those fixtures. Scene still too dark drab."
  // Measured first, and the measurement is why this is emissive+bloom TOGETHER rather than emissive
  // alone: at one Alt+C pose, glow-only moved mean luminance 56.13 -> 56.13, i.e. not at all. A
  // luminaire is a handful of pixels and nothing spreads its energy, so raising emissiveIntensity
  // only makes the same few pixels whiter. Bloom is what turns a bright pixel into a lamp.
  //
  // DETECTION is a vocabulary over element_name, NOT the IFC class, and NOT a bare '%light%':
  //   - class is inconsistent across buildings — Terminal/Hospital use IfcLightFixture, the Clinic
  //     uses IfcFlowTerminal, so keying on the class finds ZERO luminaires in the Clinic.
  //   - '%light%' also matches 236 "M_Lighting Switches" and 28 "M_Lighting and Appliance
  //     Panelboard" in that same building. Measured: 1105 naive matches vs 841 real luminaires.
  // Save/restore mirrors ghostglass.js, which already does exactly this per material.
  //
  // Instanced/batched meshes share one material across every element drawn by them, so emissive
  // cannot be per-instance — measured collateral on the Clinic is 33 non-luminaire elements out of
  // 8408. Reported rather than hidden; it is a footnote, not a defect to discover later.
  // ══ §PHOTO_EMBER_DISARMED (2026-07-27) — OFF by default, deliberately, pending a dedicated
  // session. Shipped and reverted the same day: on Hospital the user got black rectangles and lit
  // wall panels, because 1216 luminaires resolve to only SEVEN shared materials in a 63,182-element
  // building (batched/instanced meshes share one material across everything they draw). An
  // exclusivity guard was written and DOES cut the collateral — measured on the Clinic, 6 materials
  // -> 4 applied, 2 skipped — but that only proves the approach cannot reach most fixtures either:
  // the same sharing that causes the damage is what the fixtures are drawn with. Per-material
  // emissive is the wrong mechanism at this scale and needs replacing, not tuning.
  // Set A._emberEnabled = true to re-arm for experiments. See
  // bim-compiler prompts/NIGHT_AND_FIXTURE_LIGHTING.md §NEXT SESSION.
  A._emberEnabled = false;
  // Must stay identical to the vocabulary in tools.js A._loadNightFixtures — see §NIGHT_EXIT_SIGNS
  // there for why the last three are in the list and what they are measured to add.
  var EMBER_WORDS = ['light', 'troffer', 'downlight', 'luminaire', 'lamp', 'sconce', 'pendant',
                     'exit sign', 'keluar', 'signage'];
  var EMBER_NOT   = ['switch', 'receptacle', 'panelboard', 'socket', 'outlet'];
  var _emberMats = null;
  function _emberOn() {
    if (!A._emberEnabled) return;                    // §PHOTO_EMBER_DISARMED
    if (_emberMats || typeof A.dbQuery !== 'function') return;
    var like = function(w, j) { return w.map(function(x) { return "lower(element_name) LIKE '%" + x + "%'"; }).join(j); };
    var rows;
    try {
      rows = A.dbQuery("SELECT guid FROM elements_meta WHERE (" + like(EMBER_WORDS, ' OR ') +
                       ") AND NOT (" + like(EMBER_NOT, ' OR ') + ")") || [];
    } catch (e) { console.warn('§PHOTO_EMBER query failed: ' + e.message); return; }
    if (!rows.length) { console.log('§PHOTO_EMBER no luminaires in this building — nothing to light'); return; }
    var want = Object.create(null);
    for (var i = 0; i < rows.length; i++) want[rows[i][0]] = 1;
    var ids = Object.create(null), hits = 0;
    for (var k in A.guidMap) if (want[A.guidMap[k]]) { ids[parseInt(String(k).split('_')[0], 10)] = 1; hits++; }
    // ══ §PHOTO_EMBER_EXCLUSIVE (2026-07-27, user live on Hospital: black boxes + "lighting up wall
    // panels"). Their log is the whole diagnosis:
    //     §PHOTO_EMBER lit 1216 luminaires -> 1216 guidMap hits, 86 meshes, 7 materials
    // SEVEN materials for 1216 luminaires in a 63,182-element building. Batched/instanced meshes
    // share one material across everything drawn by them, so those 7 are shared with thousands of
    // NON-luminaires — walls, beams, railings — and emissive+toneMapped=false lit every one of
    // them. The black rectangles are the same cause: a TRANSPARENT panel sharing one of those
    // materials renders black once tone mapping is bypassed on it.
    //
    // The Clinic hid this: 33 collateral elements out of 8408 read as a footnote, and the number
    // was reported but not acted on. At Hospital scale the same ratio is a broken render. So the
    // rule is now exclusivity, not counting: a material is lit ONLY if every element drawn with it
    // is a luminaire. Anything shared is skipped and SAID so, because fewer lit fixtures is a
    // visible, explicable outcome and glowing walls is not.
    var meshLum = Object.create(null), meshAll = Object.create(null);
    for (var k2 in A.guidMap) {
      var id2 = parseInt(String(k2).split('_')[0], 10);
      meshAll[id2] = (meshAll[id2] || 0) + 1;
      if (want[A.guidMap[k2]]) meshLum[id2] = (meshLum[id2] || 0) + 1;
    }
    // A material is disqualified by ANY mesh that uses it and carries a non-luminaire.
    var matShared = Object.create(null);
    A.collectMeshes(function(o) { return o.isMesh; }).forEach(function(o) {
      var mixed = (meshAll[o.id] || 0) > (meshLum[o.id] || 0);
      if (!mixed) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m) {
        if (m) matShared[m.uuid] = 1;
      });
    });

    _emberMats = [];
    var seen = Object.create(null), meshes = 0, skipped = 0;
    A.collectMeshes(function(o) { return o.isMesh; }).forEach(function(o) {
      if (!ids[o.id]) return;
      meshes++;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m) {
        if (!m || !m.emissive || seen[m.uuid]) return;
        seen[m.uuid] = 1;
        if (matShared[m.uuid]) { skipped++; return; }   // shared with non-luminaires — leave it alone
        _emberMats.push({ m: m, e: m.emissive.getHex(), i: m.emissiveIntensity || 0, tm: m.toneMapped !== false });
        // Warm white, STATED not measured. Terminal's family names carry wattage and colour temp
        // ("2 X 28W ... cw"); the Clinic's carry neither, so a per-kind default is the honest
        // fallback and it is declared here rather than tuned silently per building.
        // toneMapped=false is what pushes the surface above 1.0 in linear space so the bloom
        // threshold can find it at all.
        m.emissive.setHex(0xfff2d0);
        m.emissiveIntensity = 3.0;
        m.toneMapped = false;
        m.needsUpdate = true;
      });
    });
    console.log('§PHOTO_EMBER lit ' + rows.length + ' luminaires -> ' + hits + ' guidMap hits, ' +
      meshes + ' meshes, ' + _emberMats.length + ' materials, ' + skipped +
      ' SKIPPED as shared with non-luminaires (§PHOTO_EMBER_EXCLUSIVE — a shared material would ' +
      'light walls, beams and railings, and black out any transparent panel sharing it)' +
      ' (bloom threshold ' +
      (A._bloomPass ? A._bloomPass.threshold : '?') + ', strength ' + (A._bloomPass ? A._bloomPass.strength : '?') + ')');
  }
  function _emberOff() {
    if (!_emberMats) return;
    _emberMats.forEach(function(r) {
      r.m.emissive.setHex(r.e); r.m.emissiveIntensity = r.i; r.m.toneMapped = r.tm; r.m.needsUpdate = true;
    });
    console.log('§PHOTO_EMBER restored ' + _emberMats.length + ' materials');
    _emberMats = null;
  }

  // §GLOW_LAYERS_OFF (2026-09-25, red1: "I mean remove completely") — the two decorative glow layers
  // that sat here (the fixture bloom-sprite cloud and the fitted lens quads, both staged only from
  // startStillRefine) are DELETED, code and all. Fixtures glow by their own emissive material
  // (§STILL_GLOW, §LAMP_SHAPE_COLOUR) and light the room by the real point lights; nothing else.

  // ══ §FIXTURE_EMISSIVE (2026-09-25, §GLOW_LAYERS_OFF step 2 — COUNT ONLY) ═════════════════════
  // With the glow layers gone, a lamp glows only if its OWN drawn mesh carries an emissive material.
  // This counts how many do, at the staged still, so the follow-up knows how many lamps (K) have no
  // emissive mesh and would need a small emissive shape (from bbox_x/bbox_y/rotation_z — __bw/__bd/
  // __rz on the fixture list). Nothing is built here.
  //   lamp      = one entry of A._nightFixtureWorldPositions() (the list the point lights use)
  //   withMesh  = its guid maps (A.guidMap: key "<objectId>" or "<objectId>_<slot>" -> guid) to a
  //               scene object whose material (any of an array) has emissive non-black AND
  //               emissiveIntensity > 0
  //   withoutMesh = the rest: noDrawn (guid not drawn at all / synthetic fixture with no guid) +
  //               notEmissive (drawn, no emissive material)
  // byClass = { ifc_class: [lamps, withMesh, withoutMesh, withMeshWhenLampsOn] }. lampsOff= says whether
  // §STILL_GLOW zeroed the lamp emissive for this still (daylight, camera outside) — then withMesh is 0 by
  // rule, so withMeshWhenLampsOn= also counts a drawn material that night glow lit as a lamp
  // (A._nightGlowMats entry, not glazing, glow colour non-black and glow intensity > 0): what the same
  // lamps show once the lamps are on. K for the follow-up = lamps - withMeshWhenLampsOn.
  function _fixtureEmissiveCount() {
    if (typeof A._nightFixtureWorldPositions !== 'function' || !A.guidMap || !A.scene) return null;
    var pos = A._nightFixtureWorldPositions() || [];
    var want = {}, i;
    for (i = 0; i < pos.length; i++) if (pos[i].__guid) want[pos[i].__guid] = 1;
    var keysByGuid = {};
    for (var k in A.guidMap) {
      var g = A.guidMap[k];
      if (want[g]) (keysByGuid[g] || (keysByGuid[g] = [])).push(k);
    }
    var cls = {};
    if (A.db && pos.length) {
      try {
        var gl = Object.keys(want);
        for (var c0 = 0; c0 < gl.length; c0 += 500) {
          var chunk = gl.slice(c0, c0 + 500).map(function(x) { return "'" + String(x).replace(/'/g, "''") + "'"; }).join(',');
          var r = A.db.exec('SELECT guid, ifc_class FROM elements_meta WHERE guid IN (' + chunk + ')');
          if (r && r[0]) r[0].values.forEach(function(row) { cls[row[0]] = row[1]; });
        }
      } catch (e) { /* class is a label only; the counts do not depend on it */ }
    }
    function emissiveOn(m) {
      return !!(m && m.emissive && m.emissive.getHex && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0);
    }
    var lampGlow = new Set();
    (A._nightGlowMats || []).forEach(function(g) { if (g && g.mat && !g.win && g.glowE && g.glowEI > 0) lampGlow.add(g.mat); });
    var objCache = {}, objCacheOn = {};
    function objEmissive(id, whenOn) {
      var cache = whenOn ? objCacheOn : objCache;
      if (id in cache) return cache[id];
      var o = A.scene.getObjectById(id), v = null;
      if (o) {
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        v = ms.some(function(m) { return emissiveOn(m) || (whenOn && lampGlow.has(m)); });
      }
      cache[id] = v;   // null = not in the scene, true/false = drawn with / without emissive
      return v;
    }
    var N = pos.length, M = 0, MOn = 0, noDrawn = 0, notEmissive = 0, byClass = {};
    for (i = 0; i < pos.length; i++) {
      var p = pos[i], c = (p.__guid && cls[p.__guid]) || (p.__guid ? '?' : 'synthetic');
      var row = byClass[c] || (byClass[c] = [0, 0, 0, 0]);
      row[0]++;
      var ks = p.__guid ? keysByGuid[p.__guid] : null, drawn = false, lit = false;
      if (ks) for (var j = 0; j < ks.length; j++) {
        var v = objEmissive(parseInt(String(ks[j]).split('_')[0], 10));
        if (v !== null) drawn = true;
        if (v) { lit = true; break; }
      }
      if (lit) { M++; row[1]++; }
      else { row[2]++; if (drawn) notEmissive++; else noDrawn++; }
      var litOn = lit;
      if (!litOn && ks) for (var j2 = 0; j2 < ks.length; j2++) {
        if (objEmissive(parseInt(String(ks[j2]).split('_')[0], 10), true)) { litOn = true; break; }
      }
      if (litOn) { MOn++; row[3]++; }
    }
    var bld = (/[?&]db=[^&]*\/([^\/&]+?)(_extracted)?\.db/.exec(location.search) || [])[1] || '?';
    var out = { bld: bld, lamps: N, withMesh: M, withoutMesh: N - M, noDrawn: noDrawn, notEmissive: notEmissive,
      withMeshWhenLampsOn: MOn, lampsOff: !!A._stillLampsOff, byClass: byClass };
    console.log('§FIXTURE_EMISSIVE bld=' + bld + ' lamps=' + N + ' withMesh=' + M + ' withoutMesh=' + (N - M) +
      ' byClass=' + JSON.stringify(byClass) + ' (withoutMesh = noDrawn ' + noDrawn + ' + notEmissive ' + notEmissive +
      '; lampsOff=' + (A._stillLampsOff ? 1 : 0) + ') withMeshWhenLampsOn=' + MOn + ' K=' + (N - MOn) +
      ' (byClass = [lamps, withMesh, withoutMesh, withMeshWhenLampsOn]; count only, no shapes built)');
    return out;
  }
  A._fixtureEmissiveCount = _fixtureEmissiveCount;

  A.startStillRefine = function() {
    if (!A._composer || !A._taaPass || A._stillRefineActive) return;
    // §GI_EXCLUSION (review finding 5): the GI preview composer and this TAA composer both render
    // the canvas — Alt+S's own RAF renders A._composer while the main loop prefers _giComposer,
    // so both active at once fight over every frame. One at a time.
    if (A._giComposerActive && typeof A.toggleGIPreview === 'function') A.toggleGIPreview(false);
    // §STILL_OVERLAY_GUARD (red1 2026-09-29: "a guard not to allow the canvas to be in x-ray or other overlay mode"): a still is
    // lighting truth, so it never renders through X-Ray (transparent geometry) or the ghost bbox shell (Alt+Z cycle / Find lens) —
    // the same reset the film path does (cinema_maxq.js §CINEMA_XRAY_RESET / §CINEMA_GHOST_RESET). Logged every press.
    var _ovX = !!A.xrayOn, _ovG = typeof window.ghostXrayOn === 'function' && !!window.ghostXrayOn();
    if (_ovG && typeof A.resetCinemaGhostLens === 'function') A.resetCinemaGhostLens();
    if (A.xrayOn && typeof A.toggleXray === 'function') A.toggleXray();
    var _ovGAfter = typeof window.ghostXrayOn === 'function' && !!window.ghostXrayOn();
    console.log('§STILL_OVERLAY_GUARD xray=' + (_ovX ? 'on->' + (A.xrayOn ? 'STILL ON' : 'off') : 'off') + ' ghost=' + (_ovG ? 'on->' + (_ovGAfter ? 'STILL ON' : 'off') : 'off') +
      ((A.xrayOn || _ovGAfter) ? ' FAIL (overlay could not be cleared)' : ' OK'));
    A._stillRefineActive = true;
    // §CINEMA_ROW_BUSY (2026-07-18, user ask: "processing..." feedback, slower machines take a
    // few secs): distinct from _stillRefineActive, which stays true for the WHOLE frozen-still
    // lifetime (converging AND showing the finished result) — this is true only while the 16-sample
    // TAA + AO/SSGI fold is still actually converging. Cleared at every real completion point
    // (_startStillAOPhase's f>=STILL_AO_FRAMES branch, the SSGI done callback) and as a safety net
    // in _teardownStillRefine (every cancel/interaction/cinema-handoff exit), so it can never get
    // stuck true.
    A._stillRefineBusy = true;
    // §PHOTO_EMBER + §PHOTO_BLOOM: both are STILL-ONLY, same discipline as Layer 3's triplanar PBR.
    // Navigation keeps the cheap chain; the frozen still can afford 7 extra full-screen draws.
    // §BLOOM_DEFAULT_OFF (2026-07-27) — bloom is OFF by default, and that is the revert the user
    // asked for: "black boxes were never there.. remove the impact". Set A._bloomOff = false to try
    // it again; §BLOOM_TEMPER's 1.2/0.45 and the depth-test fix in BloomPass.js both remain.
    // §GLOW_LAYERS_OFF (2026-09-25): the pass used to be gated on "ember OR glow sprites enabled";
    // the sprites were always enabled, so that term was always true. With the sprites deleted the
    // gate is just the bloom switch — same behaviour as before, one fewer dead input.
    if (A._bloomOff === undefined) A._bloomOff = true;
    if (A._bloomPass) A._bloomPass.enabled = !A._bloomOff;
    _emberOn();          // §PHOTO_EMBER_DISARMED — no-op unless deliberately re-armed
    // §GLOW_LAYERS_OFF (2026-09-25, red1: "I mean remove completely"): this was the ONE place the
    // still staged the two decorative glow layers (bloom sprites for exit signs + fitted lens quads).
    // Both are deleted. Films call startStillRefine per baked frame, so the film path is the same
    // call site — nothing to smooth. What stays: the fixtures' own emissive + the real point lights.
    // §FIXTURE_EMISSIVE (count only) is logged after staging, see _fixtureEmissiveCount.
    // KEPT from the deleted sprite path: it was the place that registered TM's overlay sync on a
    // building with no billboard nameplate, and tools.js §NIGHT_BUILDUP_GATE reads A._tmIsVisible
    // from it (without this, a buildup film would light every lamp from frame 0). Idempotent.
    if (A._tmOverlayRegister) A._tmOverlayRegister();
    A._composerEnabled = true;   // teardown RECOMPUTES from SSAO/Outline state (§GI_HANDOFF_GHOST_FIX) — no save needed
    A._taaPass.accumulate = true;
    A._taaPass.accumulateIndex = -1;
    FXS._stillRefineStartMs = performance.now();
    // §STILL_REFINE_RESTART (2026-07-16, Task 3 — light-ghosting root causes (a) damping glide,
    // (b) grace-window-swallowed cancel, (c) Fly-mode programmatic motion): capture the pose
    // signature the accumulation starts from; step() below restarts the accumulation whenever the
    // pose changes mid-run. Event-driven cancels stay as the fast path — this is the mechanism-
    // level safety net beneath them: a frozen still can only ever be produced by a camera that
    // was genuinely still for the whole 16-sample run.
    FXS._stillSig = _camSig();
    FXS._stillRestartLogged = false;
    var _triCount = FXS._setTriplanarActive(true);
    _stillResApply();   // §STILL_RES — before staging, so TAA/AO/composer targets allocate once at the still's size
    FXS._applyPhotoStaging();
    // §NIGHT_STILL_LIGHTS_ORDER (2026-09-05, found by witness_sun_arc_fill.js on a Hospital CLI bake —
    // §SUN_ARC_FILL poolLit=30 on frame 0, 50 on every later frame): the block below used to sit
    // ABOVE _applyPhotoStaging(). On the FIRST entry of a photo cycle night mode is not on yet, so
    // `A._nightLights.length` was 0, the still budget was never raised, and staging's own
    // toggleNightMode() then built the lights at the NAVIGATION budget (30, near-fade floor 0.3).
    // That is a cold Alt+S (the branch effects.js §STAGED_PL_CUT already recorded as "proven to not
    // fire on this path", 2026-08-16) and frame 0 of every bake; frames ≥1, with staging kept
    // alive, took the intended 50 / 1.0. Ordering it AFTER staging makes the still budget real on
    // the first entry too — Alt+S and frame 0 now light exactly as the §NIGHT_LIGHT_BUDGET_UP
    // directive ("during alt-s throw all in, up to 50") described.
    // §NIGHT_STILL_LIGHTS: if night mode is on, the still gets 4x the point lights. 12 is a 60fps
    // navigation budget (every light costs per-pixel work on every lit material every frame); a
    // frozen still renders once and then sits there, so that budget does not apply to it. The
    // user's report is that the night lights "have been weak" — part of that is simply that a
    // 841-fixture building was being lit by 12 of them.
    // §NIGHT_STILL_LIGHTS_REGATE (2026-07-27, found answering "how many POL did we employ?"): this
    // was gated on A._emberEnabled, which §PHOTO_EMBER_DISARMED set to false — so the 48-light still
    // budget had been DEAD CODE ever since, and every Alt+S still was lit by the 12-light NAVIGATION
    // budget. Re-arming it made Alt+S measurably heavier (user: "alt-s also getting heavy";
    // §STILL_REFINE elapsedMs 4496 -> 6560 on Hospital), which is exactly what 4x the point lights
    // costs: per-fragment lighting on every lit material, plus a shader recompile when the count
    // changes. It shipped OFF by default for that reason.
    // §NIGHT_LIGHT_BUDGET_UP (2026-08-07): RE-ARMED — user directive explicitly accepts this cost
    // ("we got speed... throw all in, up to 50 as it is baking"), see tools.js A._nightStillBoost.
    if (A._nightStillBoost &&
        ((A._nightLights && A._nightLights.length) || A._lampDataOn) && typeof A._nightUpdateLights === 'function') {   // §LAMP_UNCAPPED: no point lights on the data path
      A._nightMaxLights = A._nightMaxLightsStill;
      A._nightNearFadeFloor = A._nightNearFadeFloorStill;   // §NIGHT_NEAR_FADE — no proximity penalty
      A._nightPLScale = A._nightPLScaleStill || 1;          // §STAGED_PL_CUT — staging-only intensity cut
      // §CPE_TAIL_LIGHTS_ALL_ONLY — a 'tail-one' slot is lit by the room, not by the lamps. Scale 0
      // rather than a pool teardown on purpose: §NIGHT_BAKE_POOL froze the point-light COUNT for the
      // whole bake precisely because changing it recompiles every shader in the scene (13-53 s per
      // frame, measured), and an intensity is a uniform. Same reason the pool's own unused slots
      // ride at 0 instead of being removed.
      if (A._cpeRevealLightsOff) A._nightPLScale = 0;
      if (A._stillLampsOff && !A._filmParity) A._nightPLScale = 0;   // §STILL_GLOW (films: the flag alone zeroes the lamps, tools.js — the staged scale must survive for when the camera goes back inside) — daylight still, camera outside: lamps off (a uniform, no recompile)
      // §SUN_ARC_FILL — this is the per-frame staged value (0.5 cut, or 0 in a lights-off slot) that
      // the bake's fill compensation scales from; stashed here, where the rule lives, not re-derived.
      A._nightPLScaleStaged = A._nightPLScale;
      A._nightUpdateLights();
      // ### ALTS-ALL FIX 1: the lamp remeter moved below (SourcedLight.meterFinal, once per still, unconditional, on the final scene)
      if (!A._maxqActive) {
        // §LIGHT_STACK (red1: "or the points of light are added up?"): at the floor point under the view centre, how many
        // lamps reach it above 5% of the strongest, and the summed lamp irradiance vs the single strongest (three's own
        // point-light falloff, no angle term: an upper bound). 
        try {
          var _rc = new THREE.Raycaster(); _rc.setFromCamera(new THREE.Vector2(0, 0), A.camera);
          var _tg = []; A.scene.traverse(function(o) { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A._sky) _tg.push(o); });
          var _hit = _rc.intersectObjects(_tg, false)[0];
          if (_hit) {
            var P = _hit.point, vals = [];
            FXS._stillLampList().forEach(function(l) { if (!(l.intensity > 0)) return; var d = Math.max(0.01, l.position.distanceTo(P));
              var att = 1 / Math.max(Math.pow(d, l.decay), 0.01); if (l.distance > 0) att *= Math.pow(Math.max(0, Math.min(1, 1 - Math.pow(d / l.distance, 4))), 2);
              vals.push(l.intensity * att); });
            vals.sort(function(a, b) { return b - a; });
            var _pk = vals[0] || 0, _sum = vals.reduce(function(a, b) { return a + b; }, 0), _n5 = vals.filter(function(v) { return v > 0.05 * _pk; }).length;
            console.log('§LIGHT_STACK point=(' + P.x.toFixed(1) + ',' + P.y.toFixed(1) + ',' + P.z.toFixed(1) + ') lampsLit=' + vals.length + ' reachingOver5pctOfPeak=' + _n5 +
              ' sum=' + _sum.toFixed(3) + ' strongest=' + _pk.toFixed(3) + ' sum/strongest=' + (_pk ? (_sum / _pk).toFixed(1) : '-') + ' exposure=' + A.renderer.toneMappingExposure.toFixed(3) +
              ' sky(hemi)=' + A.hemi.intensity.toFixed(3));
          }
        } catch (eLS) { console.warn('§LIGHT_STACK failed: ' + eLS.message); }
        console.log('§STILL_LIGHT_PAD lamps=' + A._nightLights.length + ' pads=' + (A._nightPadLights || []).length + ' total=' + (A._nightLights.length + (A._nightPadLights || []).length) + ' cap=' + A._stillLampCap);
        var _dlSum = 0, _dlOn = 0;
        var _dll = FXS._stillLampList(); _dll.forEach(function(l) { _dlSum += l.intensity; if (l.intensity > 0) _dlOn++; });
        console.log('§STILL_DIALS_LAMPS lamps=' + A._stillLampMul + ' decay=' + A._stillLampDecayNow + ' plScale=' + A._nightPLScale +
          ' lit=' + _dlOn + '/' + _dll.length + ' sum=' + _dlSum.toFixed(3) + (A._lampDataOn ? ' (lamp data, uncapped)' : ''));
      }
      // §VAC V2 / §R14.1: MEASURED s5_hospital.log — 2,026 firings, ONE distinct line
      // (`raised to 200 lights, near-fade floor 1 …`). The re-raise itself is required every
      // frame (the still budget is handed back to nav on every teardown, just below), so the
      // WORK stays; only the identical line is run-length reported.
      _vacLog(_vacNightLights, '§NIGHT_STILL_LIGHTS raised to ' + A._nightLights.length +
        ' lights, near-fade floor ' + A._nightNearFadeFloorStill + ' (was 0.3), plScale ' +
        A._nightPLScale + ' (§STAGED_PL_CUT) for the still',
        'the still budget is re-raised every frame; the values did not change');
    }
    // §MAXQ_FRAME_BUDGET — read the fold's budget ONCE here; a change mid-fold would split one
    // frame across two settings. A bake sets A._stillBudget; Alt+S leaves it null and gets 16/24.
    var _taaFrames = _stillBudget().taa;
    if (!A._maxqActive && window.GlassFresnel && window.GlassFresnel.capture) { try { window.GlassFresnel.capture(A); } catch (eGE) { console.warn('§GLASS_ENV failed: ' + eGE.message); } }   // §GLASS_ENV: staged scene, lights final
    if (!A._maxqActive && window.GlassFresnel && window.GlassFresnel.planar) { try { window.GlassFresnel.planar(A); } catch (eGP) { console.warn('§GLASS_PLANAR failed: ' + eGP.message); } }   // §GLASS_PLANAR_REFL: per-plane mirror tiles after the cube
    // §METER one reading per still (### ALTS-ALL FIX 1): the ONE exposure reading, on the FINAL staged scene — after the lamp rebuild,
    // the ground reassert (§GROUND_COLOR_ORDER_FIX), torch, albedo and the glass env capture; SourcedLight.stage() only logged a §METER_DIAG.
    // §FIXTURE_FACE (Z25): the lamps were just reborn (ver bump above) — sync the lamp texture NOW (§LAMP_EN scales the I the
    // faces read) instead of on the first rendered frame, then write the emitting faces; both before the meter and the first
    // TAA sample, so the meter reads the final scene and no sample carries the whole-mesh glow. Alt+S only (films: uFixFace 0).
    if (!A._maxqActive && window.SourcedLight && window.SourcedLight.lampSync) { try { window.SourcedLight.lampSync(A); } catch (eLS2) { console.warn('§FIXTURE_FACE lampSync failed: ' + eLS2.message); } }
    if (!A._maxqActive && typeof A._fixtureFaceApply === 'function') { try { A._fixtureFaceApply(); } catch (eFF) { console.warn('§FIXTURE_FACE failed: ' + eFF.message); } }
    if (!A._maxqActive && window.SourcedLight && window.SourcedLight.meterFinal) { try { window.SourcedLight.meterFinal(A); } catch (eMF) { console.warn('§METER final failed: ' + eMF.message); } }
    console.log('§STILL_REFINE start samples=' + _taaFrames + ' triplanarMaterials=' + _triCount +
      (A._stillBudget ? ' §MAXQ_FRAME_BUDGET taa=' + _taaFrames + ' ao=' + _stillBudget().ao +
       ' (bake budget — Alt+S stills are unaffected)' : ''));
    // §PHOTO_ENVMAP_STALE safety net: the fresh dusk env map is 2s-throttled (scene.js
    // A.updateSky), but a fast/cached accumulate can finish (and stop calling _reassertPhotoEnvMap
    // via step() below) before that 2s elapses — one extra guaranteed pass past the throttle
    // window, independent of whether the accumulate loop is still running.
    // §BAKE_LEAN L2 (&bakelean=1, films only): the env-map / glow safety timers below are armed ONCE per film, not once per frame (a film
    // re-enters here every frame with the still kept active, so each frame used to add another 60 s interval: ~25 live at once).
    var _leanArm = !(A._maxqActive && /[?&]bakelean=1/.test(location.search) && A._leanTimersArmed);
    if (A._maxqActive && /[?&]bakelean=1/.test(location.search)) { if (!A._leanTimersArmed) console.log('§BAKE_LEAN timers armed once for this film'); A._leanTimersArmed = true; }
    if (_leanArm) setTimeout(function() { if (A._stillRefineActive) FXS._reassertPhotoEnvMap(); }, 2200);
    // §NIGHT_GLOW_REASSERT safety net: the per-frame reassert in step() below only runs while the
    // 16-sample accumulation RAF loop is active — that loop stops (by design, "freezes" the still)
    // long before a large building finishes streaming (confirmed this session: 20-30s+ under load,
    // far past the ~150ms-2s accumulation itself). A one-off extra pass (like envMap's above)
    // isn't enough on a slow-loading building — this repeats independently every 3s for up to a
    // minute, for as long as photo mode stays active (A._stillRefineActive, which per the
    // still-refine-freeze behavior stays true until a REAL interaction tears it down).
    if (_leanArm) (function() {
      var _tries = 0;
      var _glowInterval = setInterval(function() {
        _tries++;
        if (!A._stillRefineActive || _tries > 20) { clearInterval(_glowInterval); return; }
        FXS._reassertPhotoGlow();
      }, 3000);
    })();
    function step() {
      if (!A._stillRefineActive) return;
      // §PHOTO_STREAMING_RACE: re-catch any mesh/material that streamed in AFTER the initial
      // push above (see comment block near _reassertPhotoShadowCoverage) — idempotent, cheap.
      FXS._reassertPhotoShadowCoverage();
      FXS._reassertPhotoMatBoost();
      FXS._reassertPhotoEnvMap();
      FXS._reassertPhotoSparkles();
      FXS._reassertPhotoGlow();
      // §STILL_REFINE_RESTART (Task 3): pose-signature guard INSIDE the accumulation loop — the
      // event-driven cancels miss (a) OrbitControls inertial damping still gliding when Alt+S is
      // pressed (no events fire during the glide), (b) a drag/wheel begun inside the 500ms grace
      // window (its cancel is swallowed, and no FURTHER 'start' events fire while it continues),
      // and (c) Fly-mode/programmatic camera motion (no pointer events at all — the user flies
      // with Alt+G and this loop can be running underneath). Any pose change mid-run restarts the
      // accumulation from the current pose instead of blending across the motion — TAA samples
      // can never straddle two poses, so a smeared freeze is structurally impossible. The grace
      // window itself stays (it still absorbs the keypress nudge); this makes it harmless.
      var _sigNow = _camSig();
      if (_sigNow !== FXS._stillSig) {
        A._taaPass.accumulateIndex = -1;
        FXS._stillSig = _sigNow;
        if (!FXS._stillRestartLogged) {  // once per motion burst, not per frame
          console.log('§STILL_REFINE_RESTART cam-moved — accumulation restarted');
          FXS._stillRestartLogged = true;
        }
      } else {
        FXS._stillRestartLogged = false;
      }
      A._composer.render();
      var idx = A._taaPass.accumulateIndex;
      if (idx === 1) _stillSay('compiling shaders done — smoothing edges…');   // §STILL_STATUS_STEPS
      if (idx >= _taaFrames) { _finishStillRefine(idx); return; }   // §MAXQ_FRAME_BUDGET
      FXS._stillRefineRAF = requestAnimationFrame(step);
    }
    FXS._stillRefineRAF = requestAnimationFrame(step);
  };
  // §STILL_REFINE_GRACE (2026-07-15, user-observed): pressing Alt+S can itself nudge the mouse
  // a hair (reaching for the shortcut), and cancellation is wired to real pointerdown/wheel/
  // controls-start signals — so the still-refine could self-cancel within the same gesture that
  // triggered it, making the effect nearly impossible to actually see. Absorb that incidental
  // nudge with a short grace window; a real subsequent interaction still cancels normally.
  var STILL_REFINE_GRACE_MS = 500;
  // `keepStaging` (§MAXQ_STAGE_KEEP — CPE_4D_PERF_MEM_FINDINGS.md §2c/R1, Witness:
  // witness_maxq_stage_keep.js): the MaxQ bake loop stops/restarts the refine EVERY frame; passing
  // keepStaging=true lets it keep _applyPhotoStaging's per-BAKE state (ground/puddles/HDRI/fog/sky)
  // alive across frames instead of tearing it down and rebuilding it per frame. Per-FRAME lighting
  // still updates via _sunArcStep (it calls updateSky + shadowMap.needsUpdate itself). Every
  // non-bake caller omits the arg and keeps the full-teardown behavior unchanged.
  A.stopStillRefine = function(force, keepStaging) {
    if (!A._stillRefineActive) {
      // §STAGE2_DISARM (review finding 6): during soft-park a real selection/UI interaction must
      // kill the whole cycle AND revert the kept-alive staging — otherwise the dusk mood silently
      // outlives the photoshoot. §AUTO_STAGE2_DISABLED: with the idle timer permanently disarmed,
      // _autoStageOn is never true anymore — soft-park is now signalled by the kept-alive staging
      // itself (_photoStagingOn), so key the branch off that (the timer check kept for the day
      // the flag is re-enabled).
      if (_autoStageOn || FXS._photoStagingOn) { _autoStageArm(false); _teardownStillRefine('cancelled (interaction during soft-park)'); }
      return;
    }
    if (!force && FXS._stillRefineStartMs && (performance.now() - FXS._stillRefineStartMs) < STILL_REFINE_GRACE_MS) return;
    _autoStageArm(false);  // explicit/selection-driven stop cancels the auto re-arm too
    _teardownStillRefine('cancelled (interaction)', keepStaging);
  };
  // §STAGE1_STAGE2 (2026-07-16, sandbox spike — feat/ssgi-composer-poc — NOT the shipped Alt+S
  // path, an experimental auto-staging layer on top of it): "Stage 1" = mood persists through
  // camera movement, only the TAA-crisp polish drops (structural requirement, see conversation).
  // "Stage 2" = after AUTO_STAGE_IDLE_MS of no interaction while staging is still kept-alive,
  // automatically re-trigger the full still-refine polish — matching the user's "#1 when
  // orbiting, #2 when static after 3 sec" spec exactly, without needing a repeated Alt+S press.
  var AUTO_STAGE_IDLE_MS = 3000;
  // §AUTO_STAGE2_DISABLED (2026-07-16, user directive: "if the auto Alt-S is the issue then
  // disable it — let user Alt-S manually."): the Stage-2 idle auto-refire is OFF. Stage 1 keeps
  // its behavior (camera movement drops the TAA polish but KEEPS the dusk staging); the re-polish
  // is now a manual Alt+S press when the user settles (staging re-apply is a no-op skip via
  // §PHOTO_DOUBLE_APPLY_GUARD, so the repress only restarts the TAA accumulation). The arming/
  // fire machinery below is kept intact behind this flag in case it returns later — with the
  // flag false, §AUTO_STAGE2 can never fire (_autoStageArm coerces every arm to a disarm).
  var AUTO_STAGE2_ENABLED = false;
  var _autoStageTimer = null, _autoStageOn = false;
  // §STAGE2_MIDDRAG_FIX (2026-07-16, review finding 6 + live user report "ghosting has returned
  // when Alt-S"): the idle timer used to count 3s from the FIRST camera move only — its re-arm
  // path was dead code (callers gated on _stillRefineActive, false during soft-park), so a held
  // drag / zoom sequence longer than 3s got Stage 2 re-fired MID-MOTION: TAA accumulated 16
  // samples over a moving camera (the 500ms grace window swallowing any cancel) and froze on a
  // fully smeared image. Fix: track real camera motion via OrbitControls 'change' and only fire
  // once the camera has been genuinely still for the full idle window; if not idle yet, re-check
  // for the remainder instead of firing.
  var _lastCamMoveMs = 0, _camMoveHooked = false, _lastCamSig = '';
  function _hookCamMove() {
    if (_camMoveHooked || !A.controls) return;
    _camMoveHooked = true;
    A.controls.addEventListener('change', function() { _lastCamMoveMs = performance.now(); });
  }
  // Hard guarantee independent of any event plumbing: the camera's actual pose. Stage 2 may only
  // fire when this signature is IDENTICAL across a full idle window — even if the 'change'
  // listener were ever detached/rebound (controls swap), a moving camera can never pass this gate.
  function _camSig() {
    if (!A.camera) return '';
    var p = A.camera.position, q = A.camera.quaternion;
    return p.x.toFixed(4) + ',' + p.y.toFixed(4) + ',' + p.z.toFixed(4) + ',' +
           q.x.toFixed(5) + ',' + q.y.toFixed(5) + ',' + q.z.toFixed(5) + ',' + q.w.toFixed(5);
  }
  // read-only diagnostic, same pattern as A._getPhotoSparkles — closure state is otherwise invisible
  A._getAutoStageState = function() {
    return { hooked: _camMoveHooked, armed: _autoStageOn, timer: !!_autoStageTimer,
             idleForMs: Math.round(performance.now() - _lastCamMoveMs) };
  };
  function _autoStageArm(on) {
    if (on && !AUTO_STAGE2_ENABLED) on = false;  // §AUTO_STAGE2_DISABLED — every arm becomes a disarm
    _autoStageOn = on;
    A._photoAutoStageOn = on;  // read by main.js's interaction handlers (soft-park re-arm/disarm)
    if (_autoStageTimer) { clearTimeout(_autoStageTimer); _autoStageTimer = null; }
    if (!on) return;
    _hookCamMove();
    _lastCamMoveMs = performance.now();  // arming IS an interaction — restart the idle window
    _lastCamSig = _camSig();
    _autoStageTimer = setTimeout(function _fire() {
      _autoStageTimer = null;
      if (!_autoStageOn || A._stillRefineActive) return;
      var sig = _camSig();
      if (sig !== _lastCamSig) {  // camera pose changed since last check — wait a full fresh window
        _lastCamSig = sig;
        _autoStageTimer = setTimeout(_fire, AUTO_STAGE_IDLE_MS);
        return;
      }
      var idleFor = performance.now() - _lastCamMoveMs;
      if (idleFor < AUTO_STAGE_IDLE_MS) { _autoStageTimer = setTimeout(_fire, AUTO_STAGE_IDLE_MS - idleFor); return; }
      A.startStillRefine();
      // Auto-fire has no physical keypress nudge to absorb — backdate past the grace window so a
      // real interaction can cancel INSTANTLY (the grace exists only for the manual Alt+S reach).
      FXS._stillRefineStartMs = performance.now() - STILL_REFINE_GRACE_MS;
      console.log('§AUTO_STAGE2 idle-triggered');
    }, AUTO_STAGE_IDLE_MS);
  }
  // §GI_EXCLUSION (review finding 5): the GI preview composer and the TAA composer must not both
  // drive the canvas. Called by effects_gi_poc.js on GI-on: stop an in-flight accumulation RAF
  // and disarm the Stage-2 auto-restage (its refire would yank GI off again via startStillRefine's
  // own guard) — but KEEP photo mode itself (frozen-still state, dusk staging, triplanar textures,
  // all keyed to A._stillRefineActive): GI preview over the staged scene is the POC's whole point.
  // A camera move during GI preview re-enters the normal Stage-1/2 cycle, which turns GI off at
  // the next Stage-2 fire — deliberate, deterministic, escapable.
  A.pauseStillRefineForGI = function() {
    _autoStageArm(false);
    if (FXS._stillRefineRAF) {
      cancelAnimationFrame(FXS._stillRefineRAF); FXS._stillRefineRAF = null;
      console.log('§STILL_REFINE accumulation paused (GI preview)');
    }
    // §GI_HANDOFF_GHOST_FIX (2026-07-16, user narrowed the light-ghosting live: "it happens after
    // Alt-G"): this used to cancel only the RAF and leave A._taaPass.accumulate=true with a stale
    // accumulateIndex. When Alt+G was later toggled OFF, _composerEnabled came back and the MAIN
    // loop rendered the TAA pass every frame with accumulate still true — TAARenderPass kept
    // re-presenting/blending its stale accumulation buffer across a moving camera: exactly a
    // light ghost, appearing only after an Alt+G round-trip. The GI render replaces the still
    // anyway (and Stage-2 auto-refire is disabled — the user re-presses Alt+S manually for a
    // fresh polish), so fully drop the accumulation state here, not just the stepping loop.
    if (A._taaPass) { A._taaPass.accumulate = false; A._taaPass.accumulateIndex = -1; }
    // §PHOTO_AO: the still-AO pass composites over the (now dropped) frozen TAA image — a GI
    // handoff must disable it too, or the native composer would come back compositing stale AO.
    _stopStillAOPhase('GI preview');
  };
  // §STAGE1: camera-move-only cancel — drops TAA polish, KEEPS staging, arms the Stage-2 idle timer.
  A.softStopStillRefine = function() {
    if (!A._stillRefineActive) { _autoStageArm(true); return; }  // already soft-parked — just re-arm
    if (FXS._stillRefineStartMs && (performance.now() - FXS._stillRefineStartMs) < STILL_REFINE_GRACE_MS) return;
    _teardownStillRefine('soft-cancel (camera move)', true);
    _autoStageArm(true);
  };
  // §STAGE1_STUCK_FIX (2026-07-16, real-user report — "could not shake out of shadow mode, had
  // to hard reset"): root cause — _teardownStillRefine unconditionally sets A._stillRefineActive
  // = false even on the SOFT path (Stage 1: TAA paused, staging kept, idle-timer armed for
  // Stage 2). toggleStillRefine only ever checked _stillRefineActive, so pressing Alt+S while in
  // that in-between state saw "false" and called startStillRefine() again instead of truly
  // turning off — Alt+S could START the cycle but could never STOP it once Stage 1/2 began
  // auto-cycling; only a non-canvas click (full teardown) or a hard reload could escape. Fix:
  // toggle off whenever EITHER actively refining OR the auto-stage loop is armed, not just the
  // former — Alt+S is now a reliable off-switch in every state of this feature.
  A.toggleStillRefine = function() {
    if (A._stillRefineActive || _autoStageOn) {
      _autoStageArm(false);
      _teardownStillRefine('cancelled (Alt+S toggle off)');
    } else {
      A.startStillRefine();
    }
  };
  // §STILL_STATUS_FIRST (2026-09-24, red1: the Alt+S status must appear at once) — startStillRefine()
  // stages synchronously (~5 s on red1's desktop), so nothing could paint until it returned. The USER
  // entry points (scene.js Alt+S, panels.js button) come here: show the status, let one frame commit,
  // THEN start. Programmatic callers (bake, witnesses) keep the synchronous toggleStillRefine above.
  var _stillUIPending = false;
  // §STILL_STATUS_STEPS: update our own status line only while it is ours (gi_still.js takes the same element over later)
  function _stillSay(what) {
    if (A._maxqActive) return;
    var el = document.getElementById('gi-still-toast');
    if (el && el.dataset.stillStatus === '1' && el.style.display !== 'none' && /preparing/.test(el.textContent)) el.textContent = 'Alt+S still — preparing: ' + what;
  }
  function _stillToast(msg) {
    var el = document.getElementById('gi-still-toast');   // same element/style as gi_still.js's toast
    if (!el) {
      el = document.createElement('div'); el.id = 'gi-still-toast';
      el.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:100000;' +
        'background:rgba(20,22,28,.92);color:#e8eaf0;padding:10px 16px;border-radius:8px;font:14px/1.4 system-ui;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.45)';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.display = 'block';
    return el;
  }
  // §STILL_LOCK (red1): from a UI start until the still is released, only Esc does anything. A capture-phase window
  // listener swallows pointer/touch/wheel/contextmenu/dblclick outside the bounce overlay (its Save PNG / Close stay
  // live) and every key but Escape. Esc closes the overlay and tears the still down.
  var _lockOn = false, _lockBlocked = 0;
  var _LOCK_EVENTS = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchmove', 'touchend'];
  function _lockSwallow(e) {
    if (!_lockOn) return;
    var ov = document.getElementById('gi-still-overlay');
    if (ov && ov.contains(e.target)) return;   // Save PNG / Close keep working
    if (e.type === 'pointermove' || e.type === 'touchmove') { e.stopImmediatePropagation(); return; }   // not counted: too many
    e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); _lockBlocked++;
  }
  function _lockKey(e) {
    if (!_lockOn) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation(); e.preventDefault();
      _stillExit('esc');
      return;
    }
    e.stopImmediatePropagation(); e.preventDefault(); _lockBlocked++;
  }
  function _stillLock(on) {
    if (on === _lockOn) return;
    _lockOn = on; A._stillLockOn = on;   // main.js's interaction-cancel paths read this
    if (on) {
      _lockBlocked = 0;
      _LOCK_EVENTS.forEach(function(t) { window.addEventListener(t, _lockSwallow, { capture: true, passive: false }); });
      window.addEventListener('keydown', _lockKey, true);
      console.log('§STILL_LOCK on (only Esc exits)');
    } else {
      _LOCK_EVENTS.forEach(function(t) { window.removeEventListener(t, _lockSwallow, { capture: true }); });
      window.removeEventListener('keydown', _lockKey, true);
      console.log('§STILL_LOCK off blocked=' + _lockBlocked);
    }
  }
  A._stillLockRelease = function() { _stillLock(false); };
  // §STILL_EXIT_NAV: the ONE way out of a still. The Esc key, the bounce overlay's Close button and gi_still.js's own
  // Esc listener all call this. The Close button used to remove the picture only, leaving §STILL_LOCK on and the still
  // staged, so every click after it was swallowed and red1 had to refresh.
  function _stillExit(via) {
    var ov = document.getElementById('gi-still-overlay'); if (ov) ov.remove();
    if (window.__giStillEsc) { window.removeEventListener('keydown', window.__giStillEsc, true); window.__giStillEsc = null; }   // §STILL_ESC_LEAK (gi_still.js)
    var wasLocked = _lockOn;
    _stillLock(false);
    var torn = !!(A._stillRefineActive || _autoStageOn || FXS._photoStagingOn);
    if (torn) { _autoStageArm(false); _teardownStillRefine('cancelled (Esc)'); }
    console.log('§STILL_EXIT via=' + via + ' wasLocked=' + (wasLocked ? 1 : 0) + ' tornDown=' + (torn ? 1 : 0));
  }
  A.stillExit = _stillExit;
  A.toggleStillRefineUI = function() {
    if (A._stillRefineActive || _autoStageOn) { A.toggleStillRefine(); return; }
    if (_stillUIPending) return;
    // §STILL_GUARD REMOVED (red1, 2026-09-24: "let it load normally, it's a user learning curve"). The lock stays.
    _stillLock(true);
    _stillUIPending = true;
    var t0 = performance.now();
    var el = _stillToast('Alt+S still — preparing…');
    el.dataset.stillStatus = '1';   // gi_still.js overwrites the text when it takes over; we only hide our own
    console.log('§STILL_STATUS painted t=' + t0.toFixed(1));
    requestAnimationFrame(function() {
      console.log('§STILL_STATUS frame t=' + performance.now().toFixed(1));
      setTimeout(async function() {
        // §STILL_GLOW (watcher): the inside/outside test should use the building's ROOMS, not the up-ray, whenever the
        // building has rooms. They compile lazily (navigate bundle), so compile them here, after the status has
        // painted and before staging, the same way the film path does (§CINEMA_ROOMS).
        var tR = performance.now();
        try {
          if (!A._navigateLoaded) _stillSay('loading the room data (once per page)…');
          if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { A._navLoadedBy = 'still'; await A.loadNavigate(); }   // M2: the ghost=1 auto-shell must not arm from this load
          if (typeof A.ensureRooms === 'function') await A.ensureRooms({});
          console.log('§STILL_ROOMS ready ms=' + (performance.now() - tR).toFixed(0));
        } catch (eR) { console.warn('§STILL_ROOMS ensureRooms failed: ' + eR.message + ' — the inside test falls back to the up-ray'); }
        var t2 = performance.now();
        console.log('§STILL_STATUS stagingStart t=' + t2.toFixed(1) + ' gap=' + (t2 - t0).toFixed(1) + 'ms (rooms ' + (t2 - tR).toFixed(0) + 'ms)');
        _stillUIPending = false;
        // §STILL_STATUS_STEPS (red1 2026-09-26: "the long wait ... should be more descriptive"): name the step, say when it is
        // the one-time build for this building (light zones + sky field are cached per building), and let it paint first —
        // staging itself is one blocking call, so the text cannot change during it.
        var _LZ = window.LightZones;
        // §ZONE_IDB_CACHE: read this building's stored zone grid + sky field (IndexedDB) before the blocking staging call
        if (_LZ && _LZ.prime) { try { await _LZ.prime(A); } catch (eZP) { console.warn('§ZONE_IDB_CACHE prime failed: ' + eZP.message); } }
        if (window.SourcedLight && window.SourcedLight.primeSpaceUses) { try { await window.SourcedLight.primeSpaceUses(A); } catch (eSU) { console.warn('§SPACE_USES failed: ' + eSU.message); } }   // §LAMP_EN by real room use
        var _cached = !!(_LZ && _LZ.get && ((_LZ.get() && _LZ.get().bld === A.activeBuilding) || (_LZ.primed && _LZ.primed(A))));
        var _last = A._stillStageMsLast ? ' — last time ' + Math.max(1, Math.round(A._stillStageMsLast / 1000)) + ' s' : '';
        _stillSay(_cached ? 'lights, sky and shadows' + _last + '…'
                          : 'first time for this building: mapping rooms into light zones and measuring how much sky each spot sees (cached after this)…');
        await new Promise(function(r) { requestAnimationFrame(function() { requestAnimationFrame(r); }); });
        try { A.startStillRefine(); } finally {
          var iv = setInterval(function() {
            if (A._stillRefineActive && A._stillRefineBusy) return;
            clearInterval(iv);
            var e2 = document.getElementById('gi-still-toast');
            if (e2 && e2.dataset.stillStatus === '1' && /preparing/.test(e2.textContent)) e2.style.display = 'none';
          }, 250);
        }
      }, 0);
    });
  };

  // §CINEMA_ORBIT (2026-07-16, user spec): the "Cinema pill" 360 fly-around, wired to a real
  // button this time (Palette panel), not just a test script. Camera strategy per the user's own
  // words: begin from wherever the camera already is ("so he can spawn his preferred line of
  // attack"), a slightly elliptical path, pivot stays at the real building bbox center.
  // §CINEMA_FILL (2026-07-16, user spec — "cam must ... draw as near until main building fills
  // whole screen frame ... Ignore any non ARC elements outside frame. Solves LTU too far"): the
  // fill-frame distance below is real perspective-camera trigonometry (R / tan(halfFOV)), not a
  // guessed constant, and both it and the orbit band come from the ARC-DISCIPLINE-ONLY bbox
  // (_buildingBBoxArc) — LTU's scattered non-ARC exterior MEP piping was inflating the envelope and
  // keeping the camera parked too far to ever genuinely fill the frame. General to any building
  // (falls back to the whole bbox when a building has zero ARC-tagged rows), nothing LTU-specific.
  // (The push-in/hold/band-ease PHASES this comment used to describe are retired — §CINEMA_SIMPLE
  // below replaced them with the one routine. The fill distance and ARC bbox survive; they are what
  // size the orbit.)
  // §CINEMA_SSAA (2026-07-18): 15→24fps (film cadence), MEASURED not guessed — §CINEMA_PERF with
  // SSAA level 2 attached converged to avgFrameMs=18.0 (~55fps loop) on this project's RTX 4060
  // Laptop GPU (headless Chromium, ANGLE, Duplex @1280x800) — ~2.3x headroom over the 41.7ms/24fps
  // budget. Heavier buildings/viewports will differ: §CINEMA_PERF telemetry below is the ongoing
  // witness. N_FRAMES scaled 360→576 so total duration stays ~24s (576/24).
  var CINEMA_N_FRAMES = 576, CINEMA_FPS = 24;      // 24s (576/24) — total HELD fixed (2026-07-24,
                                                    // user: "External orbit giving way was made
                                                    // clear from first request"). Dive+out below grew
                                                    // 4→6s each; the exterior orbit absorbs that by
                                                    // shrinking (~12s → ~8s), not the total duration.
  var CINEMA_SSAA_LEVEL = 2;  // 2^2 = 4 jittered sub-pixel scene renders per frame (SSAARenderPass caps at 5)
  var _cinemaSsaaPass = null, _cinemaSsaaImportFailed = false;  // lazy singleton, reused across recordings
  var CINEMA_PULLBACK_START = 0.80, CINEMA_PULLBACK_SCALE = 1.4;
  var CINEMA_ELLIPTICITY = 0.15;
  var CINEMA_TILT_MIN_DEG = 8, CINEMA_TILT_MAX_DEG = 45;
  var CINEMA_RADIUS_MIN_FACTOR = 0.9, CINEMA_RADIUS_MAX_FACTOR = 2.5;  // x ARC envelope
  var CINEMA_FILL_MARGIN = 1.0;  // no padding — loose-axis trig alone already gives "almost full screen"
  // §CINEMA_SWOOP is RETIRED with the rest of the multi-phase orbit (§CINEMA_SIMPLE). Its job —
  // "pass low, facing the glint, at least once" — is now inherent: the exterior act orbits a full
  // 360° at a single tilt, so it crosses the sun azimuth exactly once regardless, and the Sun is
  // handled explicitly by the §CINEMA_SUN hold on the 45° look-down instead of by a tilt dip.
  // §CINEMA_SIMPLE (2026-07-20, user dictation — bim-compiler prompts/PHOTOREAL_STILL_RENDER.md
  // §CINEMA_SIMPLE + its addenda). ONE routine, same script for every film, every building, every
  // start pose:
  //   pivot on the real building → 4s ease to eye level at the centre of the largest interior
  //   space (heading PRESERVED) → the clock is up, spin to find the way out → travel out through
  //   the exit that start pose chose → rise onto the orbit band with the 45° look-down (held if
  //   the Sun sits on that heading) → standard orbit + pull-back ending.
  //
  // RETIRED IN THIS PASS, deliberately — user verdict "No all those gimmicky way". The earlier
  // §CINEMA_AUTHORED_POSE / §CINEMA_RECIPROCAL / §CINEMA_ANCHOR sections of that prompt file are
  // HISTORY of a rejected direction, not spec. Do not resurrect:
  //   • the ι/α/γ authored-pose scalar layer and its §CINEMA_POSE_AUTHORED mapping;
  //   • CINEMA_ANCHOR_CHARACTER / CINEMA_ANCHOR_RADIUS_M / _cinemaPickCharacter / _cinemaAnchor
  //     and every `character.*` use (railing=wobbly, lamp=spin, wall=mundane verbs) + §CINEMA_ANCHOR;
  //   • the `reciprocal` ending block, CINEMA_PULLAWAY_GAIN, the Act III handoff branch and
  //     §CINEMA_RECIPROCAL — which is also where the measured ~10.8m per-frame step at t≈0.80 lived;
  //   • the §CINEMA_THEME envelope, whose only job was gating that character layer;
  //   • _cinemaFloorContext's slab-stack storey height (slab-stack(46) → storeyH=1.91 on Terminal:
  //     mezzanines and ramps counted as storeys). Eye level now comes from a REAL downward raycast
  //     against rendered triangles — no storey-derived height survives anywhere in this path.
  //
  // The start pose still shapes the film, but EMERGENTLY through geometry rather than through a
  // parameter table: it decides where you settle and which way you are facing at t=4s, and THAT
  // decides which exit you take, which side you emerge on, and which facade the exterior act sees.
  var CINEMA_DIVE_SEC = 6;      // FIXED — never clamped, never distance-proportional. Start far →
                                // hard zoom in; start near → the same gesture reads slow and
                                // graceful. That is the ONE authoring lever left (§CINEMA_SIMPLE
                                // "the dive is TIME-BOXED"). Do not "fix" the rush on big buildings.
                                // §CINEMA_TIMING_672 (2026-07-24, user: "6/6 to give more ease and
                                // ensure smooth transitions... no sharp switch of frame pov"): 4→6.
  var CINEMA_SPIN_SEC = 2;      // the spin IS the search for the way out, not decoration
  var CINEMA_OUT_SEC  = 6;      // travel out through the chosen exit — §CINEMA_TIMING_672: 4→6, same reason as DIVE above
  var CINEMA_RISE_SEC = 2;      // rise onto the orbit band / the 45° look-down
  // §CINEMA_BEAT_OVERLAP: the turn-to-face-the-building starts blending in during the LAST
  // CINEMA_TURN_OVERLAP fraction of the walk-out (Beat 3), reaching CINEMA_TURN_OVERLAP_MAX by the
  // time the walk ends, so Beat 4 continues the turn rather than starting a fresh spin from zero.
  // §CINEMA_EXIT_BREATHE (2026-07-26, live user report): "the 11-13 sec, the camera rush and turns
  // too rapidly. It should allow some more seconds into 15th sec to exit and not turn until the
  // 15th sec to look back after exiting a building."
  // The "more seconds to exit" half is ALREADY DELIVERED by §CINEMA_TIMING_672 above (OUT 4→6, so
  // the 24s film now walks out 8-14s and completes the look-back at 16s). CINEMA_OUT_SEC is
  // deliberately NOT raised again here — measured, 7s would push the look-back's completion to 17s,
  // past the 15th second the user asked for. Only the overlap moves: 0.4 → 0.25, so the look-back
  // does not begin while still walking out of the door (window opens 11.9s, not 11.3s). Deliberately
  // KEPT non-zero — §CINEMA_BEAT_OVERLAP exists so Beat 4 continues a turn already in motion.
  // §CPE_LOOK_HOME — NOT DONE, and deliberately not done by widening this number.
  // User (2026-07-27): "the cam when leaving building must look to building centre (all
  // gracefully)", then narrowed it: "the only concern is when leaving building OUTER WALL".
  // Widening this fraction to 0.75 was tried and REVERTED: it starts the blend while the camera is
  // still inside, so the gaze stops aiming at the next waypoint and G10 broke (Terminal wp1
  // aimErr=36.5deg against a 25 cap). The trigger is the WALL CROSSING, not a fraction of the walk
  // — `exitOuter` is already computed in the plan, so the crossing point is available to key off.
  // It also did NOT help the jerk: 21.6 -> 20.2 only, so it buys nothing to rush it.
  //
  // This is also the jerk fix the pacing could not reach. deg/frame = (deg/metre) x (metres/frame),
  // and every attempt so far fought the SECOND term against a 1.6x range that MEASURED saturated at
  // both rails (vRange=[0.63,1.60] against a [0.63,1.60] clamp) while Hospital still turned 21.6
  // deg/frame. This attacks the FIRST term instead: the pivot is a FIXED point, so aiming at it has
  // no path curvature in it at all, while a path look-ahead inherits every wiggle of the route.
  // The larger the blend weight, the less of the walk's own noise reaches the gaze.
  var CINEMA_TURN_OVERLAP = 0.25, CINEMA_TURN_OVERLAP_MAX = 0.5;
  // §CINEMA_TURN_SLERP: within this of a dead-180° turn the "short way" is undefined — see
  // _cinemaGazeBlend for why that case is the COMMON one, not the corner case.
  var CINEMA_TURN_ANTIPODAL_RAD = 179.5 * Math.PI / 180;
  var CINEMA_EYE_M = 1.7;       // standing eye height above the floor actually under that point
  var CINEMA_LOOKDOWN_DEG = 45; // the exterior act's look-down angle
  var CINEMA_SUN_GUARD_DEG = 35;// Sun within this of the emergence heading → hold the look-down
  // §CINEMA_SWOOP → §CINEMA_FLAT_ENDING (R3 fix, 2026-07-20, reinstated then REDESIGNED same day per
  // live-trial feedback: "the last part of orbit... should go last 5 secs at least to be flat eye
  // level without the wobble. Catch the Sun is luck but from above then level then back above is not
  // cinematic smooth."). The first cut (a brief mid-loop dip that climbed BACK UP to the 45° look-
  // down afterward) was exactly the "wobble" the user is describing — reinstating the OLD pre-#902
  // dip-and-recover shape was the wrong target. The film must instead settle to level ONCE and stay
  // there: the Sun-catch and the final level-off are the SAME event, not two. Where in the loop the
  // camera's own azimuth crosses the Sun's (`swoopU`, computed below) is an emergent consequence of
  // the chosen exit — which the user's OWN start position/facing already drives (§CINEMA_EXIT) — so
  // that stays the "aim" lever; what changes here is that the OUTCOME is always a single monotonic
  // glide down to flat, never a re-climb, regardless of where that crossing lands in the loop.
  var CINEMA_FLAT_HOLD_SEC = 5;    // the mandated minimum: dead flat for at least this long, always
  var CINEMA_DESCENT_MIN_SEC = 3;  // the glide itself is never instant, even when it has to start late
  var CINEMA_FLAT_TILT_DEG = 0;    // the ending's target — literally flat, per the user's own words
  // §CINEMA_SUN_ORDER (2026-07-20 Phase 3 spec): the sun-first branch's mirror of CLIMB vs the
  // sun-last branch's DESCENT — the climb after catching the reflection is never instant either.
  var CINEMA_CLIMB_MIN_SEC = 3;
  // §CINEMA_END_DECEL (overall "no abruptness" rule): the whole camera motion — not just tilt —
  // eases to a stop in the final stretch instead of cutting while still actively orbiting.
  // §CINEMA_TIMING_672 (2026-07-24, user: "ensure last 3 sec is a roll to stop"): 2→3. The orbit
  // itself shrank to ~8s (dive/out grew, orbit gives way — see CINEMA_N_FRAMES above), so the cap
  // this divides against (below, at the use site) was raised too — see that comment.
  var CINEMA_END_DECEL_SEC = 3;  // same duration used symmetrically at orbit start too — see use site
  var CINEMA_FAN_RAYS = 32;     // BVH horizontal fan: "am I facing a wall / where is open"
  var CINEMA_FAN_FAR = 60;      // metres; no hit inside this = open in that bearing
  var CINEMA_FAN_NUDGE_MAX = 3; // metres the settle point may slide toward the open side
  var CINEMA_ENCLOSED_THRESHOLD = 0.6;
};
