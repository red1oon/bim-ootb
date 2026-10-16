// effects family — part `composer` (original effects.js lines 10–463).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/effects.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as FXS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__effectsParts = (typeof window !== 'undefined' ? window : globalThis).__effectsParts || {};
(typeof window !== 'undefined' ? window : globalThis).__effectsParts.composer = async function* __split_effects_composer(FXS, A, renderer, scene, camera) {
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  FXS._setTriplanarActive = _setTriplanarActive;
  FXS._nearRealEntourage = _nearRealEntourage;
  FXS._carColorFor = _carColorFor;
  FXS._loadCarGeometry = _loadCarGeometry;
  FXS._updateCamLight = _updateCamLight;
  FXS._updateCamTorch = _updateCamTorch;
  Object.defineProperty(FXS, '_stillRefineRAF', { get: function () { return _stillRefineRAF; }, set: function (v) { _stillRefineRAF = v; }, enumerable: true });
  Object.defineProperty(FXS, '_stillSig', { get: function () { return _stillSig; }, set: function (v) { _stillSig = v; }, enumerable: true });
  Object.defineProperty(FXS, '_stillRestartLogged', { get: function () { return _stillRestartLogged; }, set: function (v) { _stillRestartLogged = v; }, enumerable: true });
  Object.defineProperty(FXS, '_stillRefineStartMs', { get: function () { return _stillRefineStartMs; }, set: function (v) { _stillRefineStartMs = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoPropsBuilding', { get: function () { return _photoPropsBuilding; }, set: function (v) { _photoPropsBuilding = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoUplights', { get: function () { return _photoUplights; }, set: function (v) { _photoUplights = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoSkyline', { get: function () { return _photoSkyline; }, set: function (v) { _photoSkyline = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoSkylineLights', { get: function () { return _photoSkylineLights; }, set: function (v) { _photoSkylineLights = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoStaffage', { get: function () { return _photoStaffage; }, set: function (v) { _photoStaffage = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoStaffagePeople', { get: function () { return _photoStaffagePeople; }, set: function (v) { _photoStaffagePeople = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoStaffageInFrame', { get: function () { return _photoStaffageInFrame; }, set: function (v) { _photoStaffageInFrame = v; }, enumerable: true });
  Object.defineProperty(FXS, '_staffageGroundY', { get: function () { return _staffageGroundY; }, set: function (v) { _staffageGroundY = v; }, enumerable: true });
  Object.defineProperty(FXS, '_realPeopleExist', { get: function () { return _realPeopleExist; }, set: function (v) { _realPeopleExist = v; }, enumerable: true });
  Object.defineProperty(FXS, '_realDedup', { get: function () { return _realDedup; }, set: function (v) { _realDedup = v; }, enumerable: true });
  Object.defineProperty(FXS, '_rejReal', { get: function () { return _rejReal; }, set: function (v) { _rejReal = v; }, enumerable: true });
  Object.defineProperty(FXS, '_staffageTexCache', { get: function () { return _staffageTexCache; }, set: function (v) { _staffageTexCache = v; }, enumerable: true });
  Object.defineProperty(FXS, '_STAFFAGE_TEX_CAP', { get: function () { return _STAFFAGE_TEX_CAP; }, set: function (v) { _STAFFAGE_TEX_CAP = v; }, enumerable: true });
  Object.defineProperty(FXS, '_STAFFAGE_BASE', { get: function () { return _STAFFAGE_BASE; }, set: function (v) { _STAFFAGE_BASE = v; }, enumerable: true });
  Object.defineProperty(FXS, '_STAFFAGE_PEOPLE', { get: function () { return _STAFFAGE_PEOPLE; }, set: function (v) { _STAFFAGE_PEOPLE = v; }, enumerable: true });
  Object.defineProperty(FXS, '_STAFFAGE_TREES', { get: function () { return _STAFFAGE_TREES; }, set: function (v) { _STAFFAGE_TREES = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoFacadeLights', { get: function () { return _photoFacadeLights; }, set: function (v) { _photoFacadeLights = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_FACADE_UP_BASE', { get: function () { return PHOTO_FACADE_UP_BASE; }, set: function (v) { PHOTO_FACADE_UP_BASE = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_FACADE_DOWN_BASE', { get: function () { return PHOTO_FACADE_DOWN_BASE; }, set: function (v) { PHOTO_FACADE_DOWN_BASE = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CAM_LIGHT_COLOR', { get: function () { return CAM_LIGHT_COLOR; }, set: function (v) { CAM_LIGHT_COLOR = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CAM_LIGHT_INTENSITY', { get: function () { return CAM_LIGHT_INTENSITY; }, set: function (v) { CAM_LIGHT_INTENSITY = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CAM_LIGHT_DISTANCE', { get: function () { return CAM_LIGHT_DISTANCE; }, set: function (v) { CAM_LIGHT_DISTANCE = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CAM_LIGHT_DECAY', { get: function () { return CAM_LIGHT_DECAY; }, set: function (v) { CAM_LIGHT_DECAY = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CAM_LIGHT_FORWARD_OFFSET', { get: function () { return CAM_LIGHT_FORWARD_OFFSET; }, set: function (v) { CAM_LIGHT_FORWARD_OFFSET = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SKYLINE_RADIUS_MULT', { get: function () { return PHOTO_SKYLINE_RADIUS_MULT; }, set: function (v) { PHOTO_SKYLINE_RADIUS_MULT = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SKYLINE_BOX_MARGIN', { get: function () { return PHOTO_SKYLINE_BOX_MARGIN; }, set: function (v) { PHOTO_SKYLINE_BOX_MARGIN = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_FACADE_WARM_UP', { get: function () { return PHOTO_FACADE_WARM_UP; }, set: function (v) { PHOTO_FACADE_WARM_UP = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_FACADE_WARM_DOWN', { get: function () { return PHOTO_FACADE_WARM_DOWN; }, set: function (v) { PHOTO_FACADE_WARM_DOWN = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_FACADE_COOL_UP', { get: function () { return PHOTO_FACADE_COOL_UP; }, set: function (v) { PHOTO_FACADE_COOL_UP = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_FACADE_COOL_DOWN', { get: function () { return PHOTO_FACADE_COOL_DOWN; }, set: function (v) { PHOTO_FACADE_COOL_DOWN = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_FACADE_DIM_FRACTION', { get: function () { return PHOTO_FACADE_DIM_FRACTION; }, set: function (v) { PHOTO_FACADE_DIM_FRACTION = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_BACK_ACCENT_BOOST', { get: function () { return PHOTO_BACK_ACCENT_BOOST; }, set: function (v) { PHOTO_BACK_ACCENT_BOOST = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoRoofCorners', { get: function () { return _photoRoofCorners; }, set: function (v) { _photoRoofCorners = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoRoofSpotA', { get: function () { return _photoRoofSpotA; }, set: function (v) { _photoRoofSpotA = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoRoofSpotB', { get: function () { return _photoRoofSpotB; }, set: function (v) { _photoRoofSpotB = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoSparkles', { get: function () { return _photoSparkles; }, set: function (v) { _photoSparkles = v; }, enumerable: true });
  Object.defineProperty(FXS, '_sparkleTexCache', { get: function () { return _sparkleTexCache; }, set: function (v) { _sparkleTexCache = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SPARKLE_DOT_MIN', { get: function () { return PHOTO_SPARKLE_DOT_MIN; }, set: function (v) { PHOTO_SPARKLE_DOT_MIN = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SPARKLE_SCALE_MAX', { get: function () { return PHOTO_SPARKLE_SCALE_MAX; }, set: function (v) { PHOTO_SPARKLE_SCALE_MAX = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SPARKLE_FACING_MIN', { get: function () { return PHOTO_SPARKLE_FACING_MIN; }, set: function (v) { PHOTO_SPARKLE_FACING_MIN = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SPARKLE_FLAT_CLASSES', { get: function () { return PHOTO_SPARKLE_FLAT_CLASSES; }, set: function (v) { PHOTO_SPARKLE_FLAT_CLASSES = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SPARKLE_ROUND_CLASSES', { get: function () { return PHOTO_SPARKLE_ROUND_CLASSES; }, set: function (v) { PHOTO_SPARKLE_ROUND_CLASSES = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SPARKLE_DOT_MIN_FLAT', { get: function () { return PHOTO_SPARKLE_DOT_MIN_FLAT; }, set: function (v) { PHOTO_SPARKLE_DOT_MIN_FLAT = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SPARKLE_DOT_MIN_ROUND', { get: function () { return PHOTO_SPARKLE_DOT_MIN_ROUND; }, set: function (v) { PHOTO_SPARKLE_DOT_MIN_ROUND = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SPARKLE_CAP', { get: function () { return PHOTO_SPARKLE_CAP; }, set: function (v) { PHOTO_SPARKLE_CAP = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order

  A._composer = null;
  A._ssaoPass = null;

  // ══ §AO_EXCLUDE (2026-09-09, MEP_CLASH_REVEAL_MOVIE.md §46 — MEASURED, not guessed) ══════════════
  // An AO pass renders its OWN depth/normal prepass of the scene. It does that with an override
  // material (SSAOPass) or its own depth shader (N8AO), and BOTH ignore per-object material flags —
  // `depthWrite:false` included. So annotation geometry added to the scene is written into the AO
  // buffer as SOLID surface, and the whole picture's ambient occlusion is computed against it.
  // MEASURED on the 1080p Hospital film: 42 frames of |ΔY|>15 inside §FLYTHRU_DATUM_LIFE2's
  // 148.70-169.10 s window with Measure on, 0 with --no-measure; frame-for-frame against that twin
  // the Measure film swings 39..104 around a steady 56 — whole-frame error in BOTH directions,
  // which is what a polluted AO buffer looks like.
  // ⚠ WHICH PASS: the bake's AO is §PHOTO_AO's **N8AOPass**, not SSAOPass (which ships
  // `enabled = false`). Wrapping the wrong one is a no-op that LOOKS like a fix — so this helper is
  // applied to every AO pass we construct, and each logs §AO_EXCLUDE the first time it hides anything.
  // Opt-in: geometry that SHOULD occlude simply does not set `userData.excludeFromAO`.
  A._aoExcludeWrap = function (pass, label, sceneRef) {
    if (!pass || typeof pass.render !== 'function' || pass.__aoExcludeWrapped) return pass;
    pass.__aoExcludeWrapped = true;
    var orig = pass.render.bind(pass), hidden = [], logged = false;
    pass.render = function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
      hidden.length = 0;
      try {
        sceneRef.traverse(function (o) {
          if (o.visible && o.userData && o.userData.excludeFromAO) { o.visible = false; hidden.push(o); }
        });
      } catch (e) { /* the guard must never cost a frame */ }
      if (hidden.length && !logged) {
        logged = true;
        console.log('§AO_EXCLUDE pass=' + label + ' objects=' + hidden.length + ' [' +
          hidden.map(function (o) { return o.name || '(unnamed)'; }).join(' ') +
          '] — hidden for the AO depth prepass only; the beauty pass and TAA fold still see them');
      }
      try { orig(renderer, writeBuffer, readBuffer, deltaTime, maskActive); }
      finally { for (var i = 0; i < hidden.length; i++) hidden[i].visible = true; }
    };
    return pass;
  };
  A._outlinePass = null;
  A._composerEnabled = false;

  // §EFFECTS_SKIP: Mobile — no EffectComposer creation, zero GPU allocation
  var _isMobile = (navigator.maxTouchPoints > 0 && window.screen.width < 1024);
  if (_isMobile) {
    console.log('§EFFECTS_SKIP mobile — direct render only');
    A.toggleSSAO = function() {};
    A.setOutline = function() {};
    return { __splitReturn: true };
  }

  try {
    // §S277c: Parallel import — all 6 addons load concurrently, not sequentially
    var [_ecMod, _rpMod, _taaMod, _ssaoMod, _outMod, _opMod, _blMod] = await Promise.all([
      import('./lib/EffectComposer.js'),
      import('./lib/RenderPass.js'),
      import('./lib/TAARenderPass.js'),
      import('./lib/SSAOPass.js'),
      import('./lib/OutlinePass.js'),
      import('./lib/OutputPass.js'),
      import('./lib/BloomPass.js')
    ]);

    // §129 OPEN ITEM (2026-09-17) — the load-path section-cut's solid cap needs a stencil buffer on
    // whatever render target the SCENE GEOMETRY actually rasterizes into. That is NOT the canvas
    // (renderer.getContext() has one, `stencilBuffer:true` since `viewer/scene.js`'s WebGLRenderer
    // constructor — but that context is never where the geometry pass writes): TAARenderPass below
    // renders into EffectComposer's OWN internal WebGLRenderTarget, and EffectComposer.js's own
    // default-target branch creates it with only `{type: HalfFloatType}` — stencilBuffer defaults to
    // false on a WebGLRenderTarget, same as any other. Real bake proof this mattered: `§LOADPATH_CUT_CAP`
    // read `stencilBuffer=true` (the canvas) and reported PASS while the cap never actually rendered —
    // a witness that checked the wrong buffer. Pass an explicit stencil-enabled target so
    // EffectComposer uses IT (and clones it for its second buffer) instead of its own stencil-less default.
    var _composerRT = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight,
      { type: THREE.HalfFloatType, stencilBuffer: true });
    var _composer = new _ecMod.EffectComposer(renderer, _composerRT);
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
    A._aoExcludeWrap(_ssaoPass, 'SSAOPass', scene);   // §AO_EXCLUDE — usually disabled, wrapped anyway
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

    // Pass 4: §PHOTO_BLOOM — BEFORE OutputPass, so it runs in linear HDR where an emissive material
    // with toneMapped=false genuinely exceeds 1.0 and the threshold means something. After tone
    // mapping everything is clamped into 0-1 and there is nothing left to find.
    //
    // OFF during navigation, ON only for the Alt+S still (see startStillRefine). Same discipline as
    // Layer 3's triplanar PBR: a bake can afford a few ms a frame, a 60fps orbit cannot, and this
    // renders 7 extra full-screen draws (bright + 3 levels x 2 blur directions) plus a composite.
    // §BLOOM_TEMPER (2026-07-27, user: "bloom also overshot its not nice"). It was strength 0.9 at
    // threshold 1.0, and the fixture bloom sprites (then written at gain 3.0) sat three times over
    // the threshold, then amplified nearly 1:1 — 1272 of them plus 4103 window lights on Hospital.
    // Those sprites were REMOVED (§GLOW_LAYERS_OFF, 2026-09-25); the settings below are unchanged.
    // Two dials, moved together: raise the BAR so only genuine sources qualify (a night-glow surface
    // at emissiveIntensity 0.8 no longer does), and halve the AMOUNT so the ones that do qualify
    // spread rather than flare. Exit signs stay at gain 0.9, still deliberately under the bar.
    var _bloomPass = new _blMod.BloomPass(window.innerWidth, window.innerHeight,
      { strength: 0.45, threshold: 1.2, knee: 0.6 });
    _bloomPass.enabled = false;
    _composer.addPass(_bloomPass);

    // Pass 5: Output — tone mapping + color space
    var _outputPass = new _opMod.OutputPass();
    _composer.addPass(_outputPass);

    A._composer = _composer;
    A._bloomPass = _bloomPass;
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
  var _stillSig = '', _stillRestartLogged = false;  // §STILL_REFINE_RESTART pose guard state
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
  // §PHOTO_STAGING_PROPS (2026-07-15, POC — presentation only, explicitly authorized fabricated
  // staging, not extracted BIM data, not touching any real logic/geometry the compiler produces).
  // Building-only ground uplights + roof-mounted downlights (both washing the wall — a common
  // real facade night-lighting technique, per user) + a distant skyline silhouette with sparkled
  // window-lights — all anchored to THIS building's own real bbox/position (queried fresh, not
  // invented numbers) even though the fixtures themselves are fabricated. Built once per building
  // (cached, rebuilt only if the active building changes), then just shown/hidden each photoshoot
  // — cheap: a handful of point lights + one Points sparkle field, no shadow-casting, no new
  // texture/loader dependencies.
  // §PHOTO_EDGE_DROPPED (2026-07-15, user ask): the roofline edge-lining is REMOVED — even after
  // fixing the "cached from a stale camera angle" bug, the bbox-rectangle approximation for this
  // L-shaped building still didn't read as connected to the real geometry ("floating around").
  // Not worth the complexity for a POC; ground+roof wall-wash lighting covers the same "evening
  // facade" mood more simply and reliably.
  // §PHOTO_FACING (2026-07-15, resume-brief item 1): the 4 uniform corner pairs above spread
  // the wall-wash evenly around the whole footprint, which is NOT what the user's stated goal
  // ("artificial lights are placed to light up the facade facing camera") asks for. Switched to
  // one uplight+downlight pair per FOOTPRINT EDGE (not corner) — each pair sits at its edge's own
  // midpoint, so it washes exactly one facade — and each pair's intensity is recomputed FRESH
  // every photoshoot trigger (never cached across triggers, only the fixture geometry/position is
  // cached per-building) from the CURRENT camera position, reusing the exact dot-product-of-
  // outward-normal-vs-camera-direction math already proven correct for the now-removed edge-
  // lining (see git history commit cd8df02 — that MATH was right, only the line-mesh rendering
  // of it was dropped for looking disconnected on an L-shaped bbox). A point light has no such
  // "floating line" failure mode, so the same facing math is safe to reuse here.
  var _photoPropsBuilding = null;
  var _photoUplights = [], _photoSkyline = null, _photoSkylineLights = null;
  // §PHOTO_STAFFAGE (PHOTOREAL_STILL_RENDER.md §SPEC 2026-07-17 Part A — the sourced-sprite half of
  // the two-path design): buildings that HAVE real RPC entourage get the material pass in
  // streaming.js (§ENTOURAGE); every OTHER building (the 9 census buildings + every user-uploaded
  // IFC with no entourage) gets these CC0/free billboard cutouts instead. Camera-facing THREE.Sprite
  // imposters — the industry-normal staffage technique (Enscape/Twinmotion). Presentation RESULT
  // stage, added on Alt+S only, auto-reverting on teardown, same standing as the dusk props above.
  // Placement is derived at runtime from this building's own real bbox + real IfcDoor positions —
  // nothing hardcoded, general to any building (the hard constraint repeated throughout this spec).
  var _photoStaffage = null;          // THREE.Group of all staffage sprites
  var _photoStaffagePeople = [];      // people sprites only — pitch-gated (foreshorten from above)
  var _photoStaffageInFrame = [];     // interior in-view figures — re-placed to the current camera view
  var _staffageGroundY = null;        // three-space y of the RENDERED ground plane — feet anchor here
  var _realPeopleExist = false;       // set by _buildStaffage — building already has real RPC entourage
  // §STAFFAGE_REAL_DEDUP (2026-07-19, STAFFAGE_WALKABLE_PLACEMENT.md spec S1 — user: "always room to
  // plant"): real RPC entourage no longer SUPPRESSES a whole synthetic kind (that guaranteed permanent
  // zeros — BimWhale forever 0/0, Hospital forever 0 trees while its 20 real ones sit on the Level-3
  // terrace, never street-visible). The anti-duplication intent is now SPATIAL: real entourage
  // positions collected here per _buildStaffage() call; no synthetic candidate may land within its
  // kind's clash radius of a real one. 3D distance on purpose — a street-level tree 14m BELOW a real
  // terrace tree at the same XY is not a duplicate.
  var _realDedup = [];                // [[THREE.Vector3, radius], ...] — real entourage positions
  var _rejReal = 0;                   // per-build counter: candidates rejected for real-entourage overlap
  function _nearRealEntourage(threePos) {
    for (var ri = 0; ri < _realDedup.length; ri++) {
      if (_realDedup[ri][0].distanceTo(threePos) < _realDedup[ri][1]) { _rejReal++; return true; }
    }
    return false;
  }
  var _staffageTexCache = {};
  // §STAFFAGE_TEX_CAP (housekeeping/sqljs-close-leaks): the cache's key space is strictly bounded
  // by the static roster (12 files — _STAFFAGE_PEOPLE 6 + _STAFFAGE_TREES 6; a DB-saved file name
  // outside the roster never reaches _staffageTex, _restoreStaffageInstances drops it via its
  // `if (!entry) return`), and session-lifetime caching is the documented design
  // (§PHOTO_STAFFAGE_PRELOAD below: cutouts are building-independent, "loaded once per session" so
  // the second Alt+P is instant). There is deliberately NO clear-on-teardown: _disposeStaffage()
  // keeps textures cached across building switches by design, and clearRouteCache()'s trigger
  // (Find-panel open, navigate_find.js) is semantically unrelated to staffage. So: a dormant size
  // cap at 2x roster instead — it can only ever fire if a future change makes the key space dynamic,
  // at which point oldest-in is disposed+evicted (three.js re-uploads from tex.image if a live
  // sprite still references an evicted texture, so eviction can never break a rendered sprite).
  var _STAFFAGE_TEX_CAP = 24;
  var _STAFFAGE_BASE = 'textures/staffage/';
  // §STAFFAGE_OFFLINE (2026-07-18): adding/removing a `file:` entry below or in _STAFFAGE_TREES?
  // Mirror it in viewer/sw.js's STAFFAGE_ASSETS list too. These pngs load via _STAFFAGE_BASE, not
  // one of sw.js's normal precached paths, so a file only listed here silently falls through to
  // cacheFirst()'s catch-all — works fine online, synthesizes a 503 when actually offline (the
  // fetch fails and there's nothing cached to fall back to). This bit the original 12-file ship
  // (PR #845): the textures existed and worked live, but were never added to sw.js, so offline mode
  // (and the "Make available offline" button) silently shipped without them. Fixed in
  // fix/staffage-offline-precache — keep both lists in sync from here on.
  // {file, h(real-world metres)}; width derived from the loaded image's aspect ratio, not hardcoded.
  // role: 'stand' = at entrances; 'sit' = on real furniture (chairs); 'walk' = in circulation
  // (aisles / open floor CLEAR of furniture — a walker standing among chairs reads wrong, user:
  // "walking in chairs").
  // §STAFFAGE_FACING (2026-07-17, user: "the lady with bags... facing to the building. The guy
  // facing to us can be inside"): a THREE.Sprite billboard always rotates flat-on to the camera —
  // the PHOTO CONTENT itself never changes with viewing angle, so whether a cutout "reads" as
  // approaching or facing the viewer is fixed the moment the asset is chosen, not something the
  // engine can rotate per-shot. Determined by actually looking at each PNG (not guessed): 'away' =
  // shot from behind (walking/gesture poses — reads as moving away from the camera, i.e. toward
  // whatever is beyond her in the shot); 'toward' = shot face-on (the casual male — reads as
  // looking straight at the camera); 'side' = profile/3-4 view (sitting poses). Placement uses this
  // to route each pose to where its fixed orientation actually makes sense (see _buildStaffage's
  // entrance loop and _updateInFrameInterior).
  var _STAFFAGE_PEOPLE = [
    { file: 'people/person_standing_casual_male.png',    h: 1.75, role: 'stand', facing: 'toward' },
    { file: 'people/person_standing_gesture_female.png', h: 1.70, role: 'stand', facing: 'away' },
    { file: 'people/person_walking_shopping_female.png', h: 1.70, role: 'walk',  facing: 'away' },
    { file: 'people/person_walking_gym_female.png',      h: 1.70, role: 'walk',  facing: 'away' },
    { file: 'people/person_sitting_formal_male.png',     h: 1.20, role: 'sit',   facing: 'side' },
    { file: 'people/person_sitting_casual_female.png',   h: 1.15, role: 'sit',   facing: 'side' }
  ];
  // pad = fraction of the PNG that is transparent BELOW the visible trunk base (measured from the
  // actual cutouts). The sprite is bottom-anchored, so without this the trunk floats pad*h above
  // ground (poplar's 20% = ~2.2m float). Seat each tree by lowering it pad*h so the trunk meets
  // the ground; the empty image bottom then falls below the ground plane (clipped, invisible).
  var _STAFFAGE_TREES = [
    { file: 'trees/tree_oak_big.png',        h: 9.5,  pad: 0.022 },
    { file: 'trees/tree_linden_big_old.png', h: 10.0, pad: 0.065 },
    { file: 'trees/tree_poplar.png',         h: 11.0, pad: 0.200 },
    { file: 'trees/tree_oak_young.png',      h: 6.0,  pad: 0.062 },
    { file: 'trees/tree_beech.png',          h: 7.0,  pad: 0.043 },
    { file: 'trees/tree_linden_city.png',    h: 8.0,  pad: 0.038 }
  ];
  // §STAFFAGE_CAR_MESH (2026-07-18, user: "we wana use the car IFCs already in our project"): a
  // real vehicle mesh — NOT a sourced cutout photo — extracted once from BimWhale_Advanced's own
  // real IFC geometry (component_geometries, geometry_hash 8c0e2517038456a4, a real "M_RPC Beetle"
  // instance) and vendored as a small binary (props/car_beetle.bin). See that file's NOTICE.txt for
  // full provenance. Local/object-space geometry (confirmed: two different guids in the source
  // building share this exact hash with different center_x/y/z — proves the mesh is placement-
  // independent, the same shared-geometry+per-instance-transform pattern streaming.js already uses,
  // just reused ACROSS buildings here instead of within one). Real bbox ~2.42 x 3.93 x 1.51m.
  var _CAR_BIN_URL = _STAFFAGE_BASE + 'props/car_beetle.bin';
  // §STAFFAGE_CAR_COLOR (user: "cars should have different metalic colour assigned", and 2026-07-19:
  // "cars supposed to be different colours each time one is added... It was so, but it breaks back")
  // — a small real paint-shade palette, metalness bumped up from the old flat grey (0.15->0.55,
  // genuinely metallic paint reads glossier under envMap). Colour is DETERMINISTIC per
  // (building, carOrdinal): the building hash picks the starting palette slot, each added car steps
  // to the next slot — consecutive cars ALWAYS differ, and Save/Restore reproduces the same colours
  // because staffage_instances rows preserve order (the car's ordinal IS recoverable at restore;
  // no colour column needed). Hashing only the building (the previous state) made every car in one
  // building identical — the regression this fixes (STAFFAGE_WALKABLE_PLACEMENT.md spec S3).
  var _CAR_COLORS = [
    [0.74, 0.76, 0.79], [0.65, 0.10, 0.10], [0.08, 0.16, 0.42], [0.10, 0.10, 0.10],
    [0.95, 0.95, 0.93], [0.15, 0.35, 0.18], [0.55, 0.30, 0.05]
  ];
  function _carColorFor(buildingName, carIdx) {
    var s = String(buildingName || 'default'), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var c = _CAR_COLORS[(h + (carIdx || 0)) % _CAR_COLORS.length];
    return new THREE.Color(c[0], c[1], c[2]);
  }
  var _carGeometry = null, _carGeometryPromise = null;
  function _loadCarGeometry() {
    if (_carGeometry) return Promise.resolve(_carGeometry);
    if (_carGeometryPromise) return _carGeometryPromise;
    _carGeometryPromise = fetch(_CAR_BIN_URL).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
      var dv = new DataView(buf);
      var vCount = dv.getUint32(0, true), iCount = dv.getUint32(4, true);
      var rawVerts = new Float32Array(buf, 8, vCount * 3);
      var idx = new Uint32Array(buf, 8 + vCount * 3 * 4, iCount);
      // §STAFFAGE_CAR_MESH_AXIS_FIX (2026-07-18, user: "upright and half buried"): the raw BLOB
      // stores vertices in IFC-native axes (X-east, Y-north, Z-up — the SAME convention every
      // other extracted element uses), but this app's THREE.js scene is Y-up, and A.ifc2three
      // remaps every OTHER position (x, z, -y) to account for that. Feeding these raw vertices
      // straight into a BufferGeometry skipped that remap — the car's real LENGTH axis (IFC Y,
      // 3.93m) rendered as vertical and its real HEIGHT (IFC Z, 1.51m) rendered as horizontal
      // depth, i.e. the car appeared standing on its trunk. Apply the identical remap used
      // everywhere else in this codebase, per-vertex, once, at load time.
      var verts = new Float32Array(vCount * 3);
      for (var vi = 0; vi < vCount; vi++) {
        verts[vi * 3] = rawVerts[vi * 3];
        verts[vi * 3 + 1] = rawVerts[vi * 3 + 2];
        verts[vi * 3 + 2] = -rawVerts[vi * 3 + 1];
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();
      // §STAFFAGE_CAR_MESH_CULL_FIX (2026-07-18, user: "still no cars" — confirmed live via
      // scene-graph inspection: the mesh existed, visible=true, correct material/position, but
      // never actually rendered on ANY building). Root cause: BufferGeometry never gets a
      // boundingSphere unless computeBoundingSphere() is called explicitly — three.js's frustum
      // culling treats a null boundingSphere as "never intersects," so the renderer silently
      // dropped this mesh from every frame regardless of camera position. `visible` and
      // `frustumCulled` were never the problem; the missing bounding volume was.
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      _carGeometry = geo;
      console.log('§STAFFAGE_CAR_MESH loaded verts=' + vCount + ' tris=' + (iCount / 3));
      return geo;
    }).catch(function(e) { console.warn('§STAFFAGE_CAR_MESH_FAIL ' + e.message); return null; });
    return _carGeometryPromise;
  }
  var _photoFacadeLights = [];  // [{mid:{x,z}(three), normalThree:{x,z}, up:PointLight, down:PointLight}]
  var PHOTO_FACADE_UP_BASE = 9, PHOTO_FACADE_DOWN_BASE = 7;
  // §CAM_LIGHT (user ask, 2026-08-11: LTU_AHouse MaxQ frames go near-black or blown-white when the
  // cinema camera passes close to geometry — measured via real luminance extraction on
  // BIM_MaxQ_LTU_AHouse_1786345850390.mp4, 12/76 sampled frames >15% near-black pixels). Root cause:
  // fixture PLs (A._nightLights, real IfcLightFixture positions + synthetic per-storey fallback,
  // tools.js §S259) are ROOM-anchored, not camera-anchored — a fixture lighting the kitchen does
  // nothing for a camera pressed against a wall on the far side of the building. A short-range
  // PointLight riding the camera fixes exactly that case. Direct light only, same as every other
  // light already in this scene (no bounce anywhere in this pipeline — see PHOTOREAL_STILL_RENDER.md
  // GI history) and deliberately SHORT distance so it is a no-op anywhere the camera isn't already
  // close to a surface — not a general-purpose fill light, not meant to change any establishing shot.
  var CAM_LIGHT_COLOR = 0xffdca8, CAM_LIGHT_INTENSITY = 3, CAM_LIGHT_DISTANCE = 4, CAM_LIGHT_DECAY = 2;
  var CAM_LIGHT_FORWARD_OFFSET = 0.4;  // metres in front of the camera, toward the look target — off
                                        // the lens itself so it doesn't floodlight whatever the near
                                        // clip plane happens to be pressed against.
  // Called once per captured/previewed frame, AFTER camera.position/controls.target are set for that
  // frame (cinema_maxq.js's bake loop, effects.js's live Cinema Orbit step()) — same pose, no extra
  // scene query. No-ops when A._camLight doesn't exist (i.e. outside photo staging).
  function _updateCamLight(tx, ty, tz) {
    if (!A._camLight) return;
    var cx = A.camera.position.x, cy = A.camera.position.y, cz = A.camera.position.z;
    var dx = tx - cx, dy = ty - cy, dz = tz - cz;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    A._camLight.position.set(
      cx + (dx / len) * CAM_LIGHT_FORWARD_OFFSET,
      cy + (dy / len) * CAM_LIGHT_FORWARD_OFFSET,
      cz + (dz / len) * CAM_LIGHT_FORWARD_OFFSET
    );
  }
  A._updateCamLight = _updateCamLight;
  // §CAM_TORCH (§LIGHT_ONE_SCALE L1b): a rated handheld torch, offset right/up of the lens, aimed at the look target, casting a
  // shadow. Intensity in scene units = peak cd / luxPer (the one calibration), decay 2 (inverse square), no range cut. Unbound to
  // zones (sourced_light binds only sky portals among spots) — a torch lights whatever its beam and shadow map reach.
  function _updateCamTorch(tx, ty, tz) {
    var T = A._camTorch; if (!T || !T.parent) return;
    var c = A.camera.position, f = new THREE.Vector3(tx - c.x, ty - c.y, tz - c.z).normalize(), up = new THREE.Vector3(0, 1, 0);
    var r = new THREE.Vector3().crossVectors(f, up); if (r.lengthSq() < 1e-8) r.set(1, 0, 0); r.normalize(); var u = new THREE.Vector3().crossVectors(r, f);
    var TL = window.LightLaw.TORCH;
    T.position.copy(c).addScaledVector(r, TL.offsetRightM).addScaledVector(u, TL.offsetUpM);
    T.target.position.set(tx, ty, tz); T.target.updateMatrixWorld(); T.updateMatrixWorld();
  }
  A._updateCamTorch = _updateCamTorch;
  // §PHOTO_SKYLINE_SHADOW_FRUSTUM: shared with _enablePhotoShadows()'s frustum sizing below (search
  // the same name there) so the two can never drift apart again the way they did at introduction —
  // both the skyline ring's placement radius AND the shadow-camera frustum need the SAME multiplier
  // applied to the SAME envelope; before this fix each recomputed its own value independently, and
  // the frustum one never got the 2.2x term at all (see the DONE record in
  // prompts/PHOTOREAL_STILL_RENDER.md for the measured before/after numbers and the regression check).
  var PHOTO_SKYLINE_RADIUS_MULT = 2.2;
  // Half of the skyline box's widest possible footprint (bw = 18 + Math.random()*32, max 50, half
  // 25) plus a small margin, so a box isn't clipped right at its own edge when its CENTER sits just
  // inside the frustum bound.
  var PHOTO_SKYLINE_BOX_MARGIN = 30;
  // §FACADE_WARM_COOL — the two illuminants this scene already declares (PHOTO_SUN_COLOR warm,
  // PHOTO_HEMI_SKY_COLOR cool dusk sky). Warm pair unchanged from what shipped; cool pair chosen
  // LUMINANCE-MATCHED to it (0.728 vs 0.714, 0.825 vs 0.837 — within 2%) so the split is purely
  // chromatic and no facade gets brighter. See the assignment block for the full reasoning.
  var PHOTO_FACADE_WARM_UP = 0xffaa55, PHOTO_FACADE_WARM_DOWN = 0xffcf9a;
  var PHOTO_FACADE_COOL_UP = 0x8cc0ff, PHOTO_FACADE_COOL_DOWN = 0xb0d8ff;
  A._facadeWarmCool = true;   // console kill-switch for the A/B: APP._facadeWarmCool = false
  var PHOTO_FACADE_DIM_FRACTION = 0.3;  // non-facing facades still lit, just weaker — not pitch dark
  var PHOTO_BACK_ACCENT_BOOST = 1.8;  // user ask: "ground based spotlights too" on the back portion —
                                       // paired with the roof-corner twin spot, not just the dim baseline
  var _photoRoofCorners = [], _photoRoofSpotA = null, _photoRoofSpotB = null;
  var _photoSparkles = [];  // [{sprite:THREE.Sprite, mid3:{x,y,z}(three), normalThree:{x,z}}]
  var _sparkleTexCache = null;
  var PHOTO_SPARKLE_DOT_MIN = 0.90;   // half-vector/normal alignment needed before any glint shows
  var PHOTO_SPARKLE_SCALE_MAX = 8;    // world-units sprite size at perfect alignment
  var PHOTO_SPARKLE_FACING_MIN = 0.15; // facade must be roughly camera-facing, not edge-on/behind
  // §PHOTO_SPARKLE_REBUILD (2026-07-16, user spec, RESUME BRIEF "sparkle needs a rebuild"):
  // Terminal exposed a real bug — "it moves opposite to the angle of attack" — because the old
  // 4-point model used INVENTED bbox-rectangle midpoints/normals that don't match Terminal's real
  // curved/angled facades at all. Fix sources real candidate points from actual geometry instead:
  //  FLAT (IfcWall/IfcWallStandardCase/IfcWindow): real per-element outward normal via simple
  //   trig — local thickness axis (the shorter of bbox_x/bbox_y) rotated by the element's own
  //   rotation_z. Verified empirically this session against real rendered geometry (raycast the
  //   actual mesh, compare face normals) that the correct convention is THREE.rotation.y =
  //   +rotation_z (no sign flip) — the SAME Euler streaming.js/_buildShapeMeshes already use to
  //   PLACE these meshes, confirmed consistent across ~20 real Terminal wall samples. Outward
  //   sign resolved against the building centroid.
  //  ROUNDED (IfcCurtainWall/IfcPlate/IfcMember): confirmed empirically this session that
  //   rotation_z is UNINFORMATIVE for these classes — every IfcPlate on Terminal shares one
  //   constant rotation_x/y/z (the dome's curve is baked into the mesh geometry itself, not
  //   exposed via the rotation columns). The physically-correct general fallback for ANY
  //   curved/domed envelope is the RADIAL direction from the building's own horizontal centroid
  //   to the element — still "simple trigonometry" per the user's own effort ceiling. This is
  //   also the principled version of "rounded surfaces accept a wider angle": a curved surface's
  //   true normal sweeps continuously, so a coarse sample point on it SHOULD get a wider
  //   acceptance cone — that's why the class gets one, not an arbitrary tuning knob.
  var PHOTO_SPARKLE_FLAT_CLASSES = "'IfcWall','IfcWallStandardCase','IfcWindow'";
  var PHOTO_SPARKLE_ROUND_CLASSES = "'IfcCurtainWall','IfcPlate','IfcMember'";
  var PHOTO_SPARKLE_DOT_MIN_FLAT = 0.90;   // flat mirror — narrow band
  var PHOTO_SPARKLE_DOT_MIN_ROUND = 0.55;  // rounded edge/frame — wide band ("shot out a bit")
  var PHOTO_SPARKLE_CAP = 24;
};
