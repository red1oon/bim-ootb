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
  var _staffageTexCache = {};
  var _STAFFAGE_BASE = 'textures/staffage/';
  // {file, h(real-world metres)}; width derived from the loaded image's aspect ratio, not hardcoded.
  // role: 'stand' = outside at entrances; 'sit' = on real furniture (chairs); 'walk' = in
  // circulation (aisles / open floor CLEAR of furniture — a walker standing among chairs reads
  // wrong, user: "walking in chairs"). place: 'out'/'in' kept for the outside/inside split.
  var _STAFFAGE_PEOPLE = [
    { file: 'people/person_standing_casual_male.png',    h: 1.75, place: 'out', role: 'stand' },
    { file: 'people/person_standing_gesture_female.png', h: 1.70, place: 'out', role: 'stand' },
    { file: 'people/person_walking_shopping_female.png', h: 1.70, place: 'in',  role: 'walk' },
    { file: 'people/person_walking_gym_female.png',      h: 1.70, place: 'in',  role: 'walk' },
    { file: 'people/person_sitting_formal_male.png',     h: 1.20, place: 'in',  role: 'sit' },
    { file: 'people/person_sitting_casual_female.png',   h: 1.15, place: 'in',  role: 'sit' }
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
  var _photoFacadeLights = [];  // [{mid:{x,z}(three), normalThree:{x,z}, up:PointLight, down:PointLight}]
  var PHOTO_FACADE_UP_BASE = 9, PHOTO_FACADE_DOWN_BASE = 7;
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
  var PHOTO_SPARKLE_CAP = 24;  // "few points" (user's own ceiling) — modest, clustered, not a per-panel scan
  // Real points, orientation-clustered to a small representative sample — never per-triangle/
  // per-panel. flatBucket keys by (15°-rounded facing angle × ~20m position cell); roundBucket
  // keys by 20°-rounded angle-from-centroid — each keeps only the largest/first candidate found,
  // general to any building/footprint shape, nothing hardcoded.
  function _buildSparklePoints(cx, cy) {
    var pts = [];
    if (!A.dbQuery) return pts;
    var flatRows = A.dbQuery(
      "SELECT et.center_x, et.center_y, et.center_z, et.rotation_z, et.bbox_x, et.bbox_y " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.ifc_class IN (" + PHOTO_SPARKLE_FLAT_CLASSES + ") " +
      "AND et.bbox_x IS NOT NULL AND et.bbox_y IS NOT NULL AND et.rotation_z IS NOT NULL " +
      "AND MAX(et.bbox_x, et.bbox_y) > 2.0 " +
      "ORDER BY (et.bbox_x * et.bbox_y) DESC LIMIT 300"
    );
    var roundRows = A.dbQuery(
      "SELECT et.center_x, et.center_y, et.center_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.ifc_class IN (" + PHOTO_SPARKLE_ROUND_CLASSES + ") AND et.center_x IS NOT NULL " +
      "ORDER BY RANDOM() LIMIT 300"
    );
    var flatBuckets = {};
    flatRows.forEach(function(r) {
      var bucketAngle = Math.round(THREE.MathUtils.radToDeg(r[3]) / 15) * 15;
      var key = 'F' + bucketAngle + '_' + Math.round(r[0] / 20) + '_' + Math.round(r[1] / 20);
      if (!flatBuckets[key]) flatBuckets[key] = r;
    });
    var roundBuckets = {};
    roundRows.forEach(function(r) {
      var ang = Math.round(THREE.MathUtils.radToDeg(Math.atan2(r[1] - cy, r[0] - cx)) / 20) * 20;
      var key = 'R' + ang;
      if (!roundBuckets[key]) roundBuckets[key] = r;
    });
    var flatKeys = Object.keys(flatBuckets), roundKeys = Object.keys(roundBuckets);
    var capFlat = Math.min(flatKeys.length, Math.ceil(PHOTO_SPARKLE_CAP * 0.5));
    var capRound = Math.min(roundKeys.length, PHOTO_SPARKLE_CAP - capFlat);
    flatKeys.slice(0, capFlat).forEach(function(k) {
      var r = flatBuckets[k];
      var ex = r[0], ey = r[1], ez = r[2], rz = r[3], bx = r[4], by = r[5];
      var lx = (bx < by) ? 1 : 0, ly = (bx < by) ? 0 : 1;  // local thickness axis
      var localThree = { x: lx, z: -ly };  // ifc2three direction mapping (offset-free)
      // THREE RotationY(+rotation_z) — verified convention, matches streaming.js placement.
      var wx = Math.cos(rz) * localThree.x + Math.sin(rz) * localThree.z;
      var wz = -Math.sin(rz) * localThree.x + Math.cos(rz) * localThree.z;
      var posThree = A.ifc2three(ex, ey, ez);
      var centerThree = A.ifc2three(cx, cy, ez);
      var toEl = { x: posThree.x - centerThree.x, z: posThree.z - centerThree.z };
      if (wx * toEl.x + wz * toEl.z < 0) { wx = -wx; wz = -wz; }  // resolve outward sign
      pts.push({ mid3: posThree, normalThree: { x: wx, z: wz }, dotMin: PHOTO_SPARKLE_DOT_MIN_FLAT });
    });
    roundKeys.slice(0, capRound).forEach(function(k) {
      var r = roundBuckets[k];
      var posThree = A.ifc2three(r[0], r[1], r[2]);
      var centerThree = A.ifc2three(cx, cy, r[2]);
      var toEl = { x: posThree.x - centerThree.x, z: posThree.z - centerThree.z };
      var len = Math.hypot(toEl.x, toEl.z) || 1;
      pts.push({ mid3: posThree, normalThree: { x: toEl.x / len, z: toEl.z / len }, dotMin: PHOTO_SPARKLE_DOT_MIN_ROUND });
    });
    return pts;
  }
  function _getSparkleTexture() {
    if (_sparkleTexCache) return _sparkleTexCache;
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var ctx = c.getContext('2d');
    // Soft warm glow — dominant, matches the user's reference photo (relfectsunlight.jpg).
    var glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 30);
    glow.addColorStop(0, 'rgba(255,250,205,1.0)');
    glow.addColorStop(0.35, 'rgba(255,228,140,0.55)');
    glow.addColorStop(1, 'rgba(255,215,110,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);
    // Thin cross streak — subtle, secondary to the glow ("sharp spikes too" as an accent, not
    // the dominant look).
    function ray() {
      var lg = ctx.createLinearGradient(0, 0, 128, 0);
      lg.addColorStop(0, 'rgba(255,240,180,0)');
      lg.addColorStop(0.5, 'rgba(255,250,215,0.5)');
      lg.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 62, 128, 4);
    }
    ray();
    ctx.save(); ctx.translate(64, 64); ctx.rotate(Math.PI / 2); ctx.translate(-64, -64);
    ray();
    ctx.restore();
    _sparkleTexCache = new THREE.CanvasTexture(c);
    return _sparkleTexCache;
  }
  // §PHOTO_SKYLINE_WINDOW_RECT (2026-07-16, user ask: "rectangles of lights depicting lighted
  // window rather than ghostly"): the skyline's window-light Points cloud used PointsMaterial's
  // default round sprite — reads as fuzzy dots at a distance, not lit windows. Swap ONLY the
  // sprite texture for a soft-edged RECTANGLE (a real window's aspect, not a point) — same Points
  // system, same single draw call, same per-point cost, just a different `map`. Cached once.
  var _skylineWinTexCache = null;
  function _getSkylineWindowTexture() {
    if (_skylineWinTexCache) return _skylineWinTexCache;
    // A THREE.Points sprite's on-screen footprint is always a SQUARE (PointsMaterial has one
    // scalar `size`, no independent width/height) — so the canvas itself is square, and the
    // window PANE is drawn narrower than tall inside it with transparent padding left/right.
    // The visible shape still reads as a rectangular window; only the (fully transparent)
    // billboard bounds are square.
    var N = 96;
    var c = document.createElement('canvas');
    c.width = N; c.height = N;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, N, N);
    function roundedRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    var padX = 26, padY = 8, w = N - padX * 2, h = N - padY * 2;
    // Soft blurred glow first (larger than the pane, gives it a lit-from-within halo)...
    ctx.filter = 'blur(4px)';
    ctx.fillStyle = 'rgba(255,240,190,0.55)';
    roundedRect(padX - 4, padY - 4, w + 8, h + 8, 10);
    ctx.fill();
    // ...then the crisp window pane on top so it still reads as a rectangle, not just a blob.
    ctx.filter = 'none';
    var grad = ctx.createLinearGradient(0, padY, 0, N - padY);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,250,225,0.85)');
    ctx.fillStyle = grad;
    roundedRect(padX, padY, w, h, 4);
    ctx.fill();
    _skylineWinTexCache = new THREE.CanvasTexture(c);
    return _skylineWinTexCache;
  }
  // §PHOTO_SPARKLE reassert: Blinn-Phong half-vector test against each facade's real normal —
  // "the correct angle of attack" (user), the same standard specular-highlight condition a shader
  // computes per-pixel, applied here to one representative point per facade instead. Horizontal-
  // only (x/z), same simplification _updateFacadeFacingLights already uses for facade normals.
  // §NIGHT_GLOW_REASSERT (2026-07-16, real bug — "cannot see the building lights yet"): the
  // window/fixture emissive glow (tools.js A.toggleNightMode) used to be a ONE-TIME pass over
  // A._matCache at the instant it fires — on a still-streaming building (the normal case, Alt+S
  // usually fires long before a large building finishes loading) it only ever caught whichever
  // handful of materials existed at that exact moment, confirmed live as 1 window-glow material
  // on a building with far more real glass. Same streaming-race bug class already fixed twice
  // this session for other systems (triplanar shader uniforms, shadow/envMap) — re-call the
  // (cheap, already-processed-keys-skipped) tools.js function every accumulation/orbit frame.
  function _reassertPhotoGlow() {
    if (A._applyNightGlowToMatCache) A._applyNightGlowToMatCache();
  }
  function _reassertPhotoSparkles() {
    if (!A.sun || !A.camera || !_photoSparkles.length) return;
    _photoSparkles.forEach(function(s) {
      var sdx = A.sun.position.x - s.mid3.x, sdz = A.sun.position.z - s.mid3.z;
      var sLen = Math.hypot(sdx, sdz) || 1;
      sdx /= sLen; sdz /= sLen;
      var cdx = A.camera.position.x - s.mid3.x, cdz = A.camera.position.z - s.mid3.z;
      var cLen = Math.hypot(cdx, cdz) || 1;
      cdx /= cLen; cdz /= cLen;
      var hx = sdx + cdx, hz = sdz + cdz;
      var hLen = Math.hypot(hx, hz);
      var facingCam = cdx * s.normalThree.x + cdz * s.normalThree.z;
      var sunUp = A.sun.position.y > 0;
      if (hLen < 1e-4 || facingCam < PHOTO_SPARKLE_FACING_MIN || !sunUp) { s.sprite.visible = false; return; }
      hx /= hLen; hz /= hLen;
      var dotHN = hx * s.normalThree.x + hz * s.normalThree.z;
      // §PHOTO_SPARKLE_REBUILD: rounded/edge-classified points (curtain-wall panels, mullions —
      // real curved-surface normal sweeps continuously) get a lower/wider dotMin than flat wall
      // panels (a true flat mirror only glints within a narrow band) — see _buildSparklePoints.
      var dotMin = (s.dotMin != null) ? s.dotMin : PHOTO_SPARKLE_DOT_MIN;
      if (dotHN <= dotMin) { s.sprite.visible = false; return; }
      var t = Math.min(1, (dotHN - dotMin) / (1 - dotMin));
      var sc = 1 + t * PHOTO_SPARKLE_SCALE_MAX;
      s.sprite.position.set(s.mid3.x, s.mid3.y, s.mid3.z);
      s.sprite.scale.set(sc, sc, 1);
      s.sprite.material.opacity = t * t;
      s.sprite.visible = true;
    });
  }
  function _buildingBBoxIfc() {
    if (!A.dbQuery) return null;
    var r = A.dbQuery('SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z) FROM element_transforms');
    if (!r.length || r[0][0] == null) return null;
    return { xMin: r[0][0], xMax: r[0][1], yMin: r[0][2], yMax: r[0][3], zMin: r[0][4], zMax: r[0][5] };
  }
  // §CINEMA_ARC_BBOX (2026-07-16, user ask: "ignore any non ARC elements outside frame" —
  // "solves LTU too far"): the whole-building bbox above includes every discipline, including
  // scattered exterior MEP piping (LTU) that inflates the envelope and pushes the Cinema Orbit's
  // "reasonable band" and fill-frame target far past what the actual architectural volume needs.
  // ARC-only bbox is the real building envelope for framing purposes — general to any building,
  // no hardcoding (a building with zero ARC rows falls back to the whole-building bbox below).
  function _buildingBBoxArc() {
    if (!A.dbQuery) return null;
    var r = A.dbQuery(
      "SELECT MIN(et.center_x), MAX(et.center_x), MIN(et.center_y), MAX(et.center_y), MIN(et.center_z), MAX(et.center_z) " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid WHERE em.discipline = 'ARC'"
    );
    if (!r.length || r[0][0] == null) return null;
    return { xMin: r[0][0], xMax: r[0][1], yMin: r[0][2], yMax: r[0][3], zMin: r[0][4], zMax: r[0][5] };
  }
  function _disposePhotoProps() {
    _photoUplights.forEach(function(l) { A.scene.remove(l); });
    if (_photoSkyline) { A.scene.remove(_photoSkyline); _photoSkyline.children.forEach(function(b) { b.geometry.dispose(); b.material.dispose(); }); }
    if (_photoSkylineLights) { A.scene.remove(_photoSkylineLights); _photoSkylineLights.geometry.dispose(); _photoSkylineLights.material.dispose(); }
    _photoSparkles.forEach(function(s) { A.scene.remove(s.sprite); s.sprite.material.dispose(); });
    _photoUplights = []; _photoFacadeLights = []; _photoSkyline = null; _photoSkylineLights = null;
    _photoRoofCorners = []; _photoRoofSpotA = null; _photoRoofSpotB = null; _photoSparkles = [];
  }
  function _buildPhotoProps() {
    var bbox = _buildingBBoxIfc();
    if (!bbox) return;
    _photoPropsBuilding = A.activeBuilding;
    var cx = (bbox.xMin + bbox.xMax) / 2, cy = (bbox.yMin + bbox.yMax) / 2;
    var w = bbox.xMax - bbox.xMin, d = bbox.yMax - bbox.yMin;
    var groundZ = bbox.zMin, roofZ = bbox.zMax;

    // Ground uplight + roof downlight per FOOTPRINT EDGE (4 edges of the bbox rectangle — same
    // approximation the removed edge-lining used, general to any building/any angle since it's
    // derived fresh from this building's own real bbox, not hardcoded). Pair sits at the edge
    // midpoint, inset inward so it reads as washing that specific wall face, not floating past it.
    var inset = Math.min(3, w * 0.1, d * 0.1);
    var corners = [[bbox.xMin, bbox.yMin], [bbox.xMax, bbox.yMin], [bbox.xMax, bbox.yMax], [bbox.xMin, bbox.yMax]];
    var normalsIfc = [[0, -1], [1, 0], [0, 1], [-1, 0]];  // outward normal per edge, IFC XY
    for (var ei = 0; ei < 4; ei++) {
      var c1 = corners[ei], c2 = corners[(ei + 1) % 4];
      var midIfcX = (c1[0] + c2[0]) / 2, midIfcY = (c1[1] + c2[1]) / 2;
      var n = normalsIfc[ei];
      // Pull the fixture position inward along the inward normal so it sits against the wall.
      var fx = midIfcX - n[0] * inset, fy = midIfcY - n[1] * inset;
      var pg = A.ifc2three(fx, fy, groundZ);
      var up = new THREE.PointLight(0xffaa55, PHOTO_FACADE_UP_BASE, 14, 2);
      up.position.set(pg.x, pg.y + 0.3, pg.z);
      A.scene.add(up);
      _photoUplights.push(up);

      var pr = A.ifc2three(fx, fy, roofZ);
      var down = new THREE.PointLight(0xffcf9a, PHOTO_FACADE_DOWN_BASE, 16, 2);
      down.position.set(pr.x, pr.y - 0.3, pr.z);
      A.scene.add(down);
      _photoUplights.push(down);

      var midThree = A.ifc2three(midIfcX, midIfcY, groundZ);
      _photoFacadeLights.push({
        mid: { x: midThree.x, z: midThree.z },
        normalThree: { x: n[0], z: -n[1] },  // ifc2three: three.z = -(ifc.y - offset)
        up: up, down: down
      });
    }

    // §PHOTO_ADDONS (user ask, from RealistHospital.jpeg reference analysis): three discrete,
    // real-data-driven fixtures the reference image relies on, instead of another broad wash —
    // roof-corner twin spotlight, entry-door sconces, tree uplighting. All derived from REAL
    // element positions (doors/vegetation queried fresh), not fabricated placement, addressing
    // the same bbox-approximation weakness Hospital exposed in the facade-wash lights above.
    // Roof-corner twin spotlight: two tiny bright points at ONE roof corner (picked per-trigger,
    // nearest the camera — see _updateRoofCornerSpotlight), matching the reference's single
    // hero highlight rather than uniform coverage.
    _photoRoofCorners = corners.map(function(c) { return A.ifc2three(c[0], c[1], roofZ); });
    var _rc = new THREE.PointLight(0xfff2d0, 10, 10, 1.8);
    var _rc2 = new THREE.PointLight(0xfff2d0, 8, 8, 1.8);
    A.scene.add(_rc); A.scene.add(_rc2);
    _photoRoofSpotA = _rc; _photoRoofSpotB = _rc2;
    _photoUplights.push(_rc, _rc2);  // reuse existing show/hide + dispose list

    // Entry-door sconces: real IfcDoor positions, lowest storeys first (proxy for ground-floor
    // entries — good enough without a full exterior-perimeter check), capped to avoid clutter.
    if (A.dbQuery) {
      var _doors = A.dbQuery(
        "SELECT et.center_x, et.center_y, et.center_z FROM element_transforms et " +
        "JOIN elements_meta em ON et.guid = em.guid WHERE em.ifc_class = 'IfcDoor' " +
        "ORDER BY et.center_z ASC LIMIT 6"
      );
      for (var di = 0; di < _doors.length; di++) {
        var dp = A.ifc2three(_doors[di][0], _doors[di][1], _doors[di][2]);
        var sconce = new THREE.PointLight(0xffcf9a, 4, 6, 1.6);
        sconce.position.set(dp.x, dp.y + 2.1, dp.z);
        A.scene.add(sconce);
        _photoUplights.push(sconce);
      }
    }

    // Tree uplighting: real vegetation elements (name-keyword match — same technique already
    // used to confirm Hospital's 589 real trees exist), capped to a modest sample for perf —
    // reads as "the trees are lit" without a per-tree light-count explosion.
    if (A.dbQuery) {
      var _trees = A.dbQuery(
        "SELECT et.center_x, et.center_y, et.center_z FROM element_transforms et " +
        "JOIN elements_meta em ON et.guid = em.guid " +
        "WHERE lower(em.element_name) LIKE '%tree%' OR lower(em.element_name) LIKE '%plant%' " +
        "LIMIT 15"
      );
      for (var ti = 0; ti < _trees.length; ti++) {
        var tp = A.ifc2three(_trees[ti][0], _trees[ti][1], _trees[ti][2]);
        var treeLight = new THREE.PointLight(0xffddaa, 2.5, 4, 1.8);
        treeLight.position.set(tp.x, tp.y + 0.3, tp.z);
        A.scene.add(treeLight);
        _photoUplights.push(treeLight);
      }
      console.log('§PHOTO_ADDONS doors=' + Math.min(_doors ? _doors.length : 0, 6) + ' trees=' + _trees.length);
    }

    // Distant skyline silhouette (full ring — robust to any orbit angle, per user's own
    // "different angle later" expectation) + sparkled window-lights, dusk-city look.
    // §PHOTO_SKYLINE_DENSER (user ask, "we need more building silhouette" — the original radius
    // (envelope*4) put these so far out they subtended almost no visible angle from a normal
    // camera position, reading as tiny specks. Pulled closer + bigger + more of them.
    var envelope = Math.max(w, d, 50);
    var radius = envelope * 2.2;
    var group = new THREE.Group();
    var winPos = [], winCol = [];
    var N = 40;
    // §PHOTO_SKYLINE_SUN_GAP (user ask, "silhouette buildings too close, obscure the Sun"):
    // computed via real vectors, not a hand-derived angle offset between the skyline loop's
    // IFC-plane angle and the sun's azimuth-driven THREE-space direction (fragile to get right by
    // hand across two different coordinate conventions) — just compare each candidate box's actual
    // THREE-space direction from the building center against the sun's actual THREE-space
    // direction, and skip the box if it falls inside the clearance cone. General to any building/
    // any sun angle, nothing hardcoded.
    var _skyCenterThree = A.ifc2three(cx, cy, groundZ);
    var _sunClearDot = null;
    if (A.sun) {
      var _sLen = Math.hypot(A.sun.position.x, A.sun.position.z);
      if (_sLen > 1) {
        var _sdx = A.sun.position.x / _sLen, _sdz = A.sun.position.z / _sLen;
        _sunClearDot = { x: _sdx, z: _sdz, minDot: Math.cos(THREE.MathUtils.degToRad(18)) };
      }
    }
    for (var i = 0; i < N; i++) {
      var ang = (i / N) * Math.PI * 2;
      var bw = 18 + Math.random() * 32, bh = 20 + Math.random() * 60;
      var bx = cx + Math.cos(ang) * radius, by = cy + Math.sin(ang) * radius;
      var base = A.ifc2three(bx, by, groundZ);
      if (_sunClearDot) {
        var _dx = base.x - _skyCenterThree.x, _dz = base.z - _skyCenterThree.z;
        var _dLen = Math.hypot(_dx, _dz) || 1;
        var _dot = (_dx / _dLen) * _sunClearDot.x + (_dz / _dLen) * _sunClearDot.z;
        if (_dot > _sunClearDot.minDot) continue;  // leave a clear gap for the sun, skip this box
      }
      // §PHOTO_SKYLINE_SUN_REACT (2026-07-16, user ask, "the silhouette if also react to the
      // Sun"): reuses the SAME real sun-direction dot product just computed for the gap-clearance
      // check above — boxes on the sun-facing arc (closer to the sun's own direction, but still
      // outside the clearance cone) get a subtle warm rim-brighten, boxes on the far side of the
      // ring stay exactly as dark/cool as before. General to any building/sun angle, no new query.
      var sunFacing = _sunClearDot ? Math.max(0, _dot) : 0;  // 0 (far side) .. ~0.95 (near the gap edge)
      var warmBoost = sunFacing * 0.10;
      var shade = 0.06 + Math.random() * 0.07;
      var box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(
          shade * 0.9 + warmBoost * 1.3, shade * 0.85 + warmBoost * 0.9, shade * 1.15 + warmBoost * 0.5
        ) }));
      box.position.set(base.x, base.y + bh / 2, base.z);
      group.add(box);
      // §PHOTO_SKYLINE_WINDOW_OCCLUSION (2026-07-16, real bug — "lights not visible on the
      // silhouette buildings"): window-light points used to be scattered randomly through the
      // box's HORIZONTAL FOOTPRINT (both X and Z randomized within bw), which places most of them
      // INSIDE the box's own solid volume — depth-occluded by the box's own nearest opaque wall
      // from any outside viewing angle. Confirmed via screenshot: the Points object existed,
      // visible=true, 4308 points, yet zero were actually visible on any skyline box. Fix: place
      // each point on one of the box's 4 vertical FACE planes (a small outward epsilon so it
      // isn't z-fighting the box's own surface), like a real building's window grid — not
      // scattered through the interior.
      var winCount = Math.floor((bw * bh) / 14);
      for (var wi = 0; wi < winCount; wi++) {
        var face = Math.floor(Math.random() * 4);
        var along = (Math.random() - 0.5) * bw * 0.9;
        var wy = base.y + Math.random() * bh * 0.9 + 2;
        var wx, wz, eps = 0.15;
        if (face === 0) { wx = base.x + bw / 2 + eps; wz = base.z + along; }
        else if (face === 1) { wx = base.x - bw / 2 - eps; wz = base.z + along; }
        else if (face === 2) { wx = base.x + along; wz = base.z + bw / 2 + eps; }
        else { wx = base.x + along; wz = base.z - bw / 2 - eps; }
        winPos.push(wx, wy, wz);
        if (Math.random() > 0.25) winCol.push(1.0, 0.8 + Math.random() * 0.2, 0.5 + Math.random() * 0.3); // warm window
        else winCol.push(0.6, 0.75, 1.0); // occasional cool/blue window
      }
    }
    A.scene.add(group);
    _photoSkyline = group;
    var winGeo = new THREE.BufferGeometry();
    winGeo.setAttribute('position', new THREE.Float32BufferAttribute(winPos, 3));
    winGeo.setAttribute('color', new THREE.Float32BufferAttribute(winCol, 3));
    _photoSkylineLights = new THREE.Points(winGeo, new THREE.PointsMaterial({
      size: 2.4, map: _getSkylineWindowTexture(), alphaTest: 0.02, vertexColors: true,
      sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false
    }));
    A.scene.add(_photoSkylineLights);
    console.log('§PHOTO_PROPS built uplights=' + _photoUplights.length + ' skylineBoxes=' + group.children.length + ' windowLights=' + (winPos.length / 3));

    // §PHOTO_SPARKLE (user ask: "some sparkle where it hits right angle from Sun to surface" —
    // reference `relfectsunlight.jpg`: a soft warm glow, not a hard geometric shape). One sprite
    // per facade-wash edge (reuses the SAME mid/normal already computed above, no new geometry
    // query), reusing the sun's own lensflare technique (canvas radial gradient, additive sprite —
    // scene.js §S277f) rather than a new shader. Visibility/size/opacity driven every reassert
    // tick by the Blinn-Phong half-vector test (dot(normalize(toSun+toCam), facadeNormal)) — the
    // same physically-standard "specular highlight" condition, just applied to a real facade point
    // instead of a per-pixel shader term. A thin cross-streak is layered on top of the glow per
    // "we can have sharp spikes too" — kept subtle so the soft glow (the actual reference) still
    // dominates. (_photoSparkles already cleared by _disposePhotoProps, always called right
    // before this function — see line ~445.)
    var _sparkTex = _getSparkleTexture();
    var sparklePts = _buildSparklePoints(cx, cy);
    var _sparkFlatN = 0, _sparkRoundN = 0;
    if (!sparklePts.length) {
      // Fallback only — a building with no matching IfcWall/CurtainWall/Plate/Member rows at all
      // (rare). Keeps the old invented bbox-rectangle points so sparkle never goes fully empty,
      // same discipline as the door-sconce/tree-uplight addons falling back gracefully above.
      for (var si = 0; si < corners.length; si++) {
        var c1s = corners[si], c2s = corners[(si + 1) % 4];
        var midIfcXs = (c1s[0] + c2s[0]) / 2, midIfcYs = (c1s[1] + c2s[1]) / 2;
        var midHeightThree = A.ifc2three(midIfcXs, midIfcYs, (groundZ + roofZ) / 2);
        var ns = normalsIfc[si];
        sparklePts.push({ mid3: midHeightThree, normalThree: { x: ns[0], z: -ns[1] }, dotMin: PHOTO_SPARKLE_DOT_MIN_FLAT });
      }
    }
    sparklePts.forEach(function(sp) {
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _sparkTex, transparent: true, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending, opacity: 0
      }));
      sprite.visible = false;
      sprite.renderOrder = 997;
      A.scene.add(sprite);
      if (sp.dotMin === PHOTO_SPARKLE_DOT_MIN_ROUND) _sparkRoundN++; else _sparkFlatN++;
      _photoSparkles.push({ sprite: sprite, mid3: sp.mid3, normalThree: sp.normalThree, dotMin: sp.dotMin });
    });
    console.log('§PHOTO_SPARKLE_REBUILD points=' + _photoSparkles.length + ' flat=' + _sparkFlatN + ' round=' + _sparkRoundN);
  }
  // §PHOTO_FACING: recomputed FRESH every call from A.camera's CURRENT position/orientation —
  // deliberately NOT cached alongside the building-level fixture cache above. This is the exact
  // bug already found+fixed once this session for the removed edge-lining (a second Alt+S from a
  // different angle silently reused the first angle's facing) — don't reintroduce it here by
  // caching this result anywhere.
  function _updateFacadeFacingLights() {
    var facings = _photoFacadeLights.map(function(f) {
      var toCam = { x: A.camera.position.x - f.mid.x, z: A.camera.position.z - f.mid.z };
      var tcLen = Math.hypot(toCam.x, toCam.z) || 1;
      return (f.normalThree.x * toCam.x + f.normalThree.z * toCam.z) / tcLen;  // [-1, 1]
    });
    // §PHOTO_ROOF_CORNER (user ask: "standard for the BACK portion of any building" — the twin
    // spotlight AND a stronger ground spotlight belong on the LEAST camera-facing edge, not the
    // front). backIdx computed first so the strength loop below can special-case it.
    var backIdx = 0;
    for (var fi = 1; fi < 4; fi++) { if (facings[fi] < facings[backIdx]) backIdx = fi; }
    _photoFacadeLights.forEach(function(f, i) {
      var facingFrac = Math.max(0, Math.min(1, facings[i]));  // 0 (away/edge-on) .. 1 (directly facing)
      var strength = PHOTO_FACADE_DIM_FRACTION + (1 - PHOTO_FACADE_DIM_FRACTION) * facingFrac;
      if (i === backIdx) strength *= PHOTO_BACK_ACCENT_BOOST;  // ground-based spotlight, back portion
      f.up.intensity = PHOTO_FACADE_UP_BASE * strength;
      f.down.intensity = PHOTO_FACADE_DOWN_BASE * strength;
    });
    // Recomputed fresh here alongside the facade wash, same discipline (never cached across triggers).
    if (_photoRoofSpotA && _photoRoofCorners.length === 4 && facings.length === 4) {
      var c1 = _photoRoofCorners[backIdx], c2 = _photoRoofCorners[(backIdx + 1) % 4];
      _photoRoofSpotA.position.set(c1.x, c1.y + 0.5, c1.z);
      _photoRoofSpotB.position.set(c1.x + (c2.x - c1.x) * 0.15, c1.y + 0.4, c1.z + (c2.z - c1.z) * 0.15);
    }
    console.log('§PHOTO_FACING facades=' + _photoFacadeLights.length + ' strengths=' +
      _photoFacadeLights.map(function(f) { return (f.up.intensity / PHOTO_FACADE_UP_BASE).toFixed(2); }).join(','));
  }
  // §PHOTO_STAFFAGE: load a cutout texture (cached, sRGB), size the sprite from the real image
  // aspect once the pixels are known (no hardcoded widths), anchor its bottom to the ground.
  function _staffageTex(path) {
    if (_staffageTexCache[path]) return _staffageTexCache[path];
    var tex = new THREE.TextureLoader().load(_STAFFAGE_BASE + path,
      function() { console.log('§STAFFAGE_TEX_READY ' + path); },
      undefined,
      function() { console.warn('§STAFFAGE_TEX_FAIL ' + path); });
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
    _staffageTexCache[path] = tex;
    return tex;
  }
  function _addStaffageSprite(entry, threePos, isPerson, keepY) {
    var tex = _staffageTex(entry.file);
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: true }));
    spr.center.set(0.5, 0);                 // anchor bottom-centre → the figure stands on the ground
    spr.position.copy(threePos);
    // §PHOTO_STAFFAGE_GROUNDY (user: "everybody is ~1 foot underground"): feet Z derived from
    // bbox.zMin / furniture-bottom doesn't match the RENDERED ground plane (which sits at
    // _calcGroundY's ground-floor-slab level, ~0.3m higher). Snap every figure's feet to the actual
    // ground plane the user sees, so nobody sinks. Ground-floor placement, so this is the right floor.
    // §PHOTO_STAFFAGE_PAD (user: "some trees floating a bit"): the cutout has transparent padding
    // below its visible base (measured per asset — trees 2-20%, people 0%), so lower it by pad*h so
    // the VISIBLE base sits on the ground. baseOffset lets the witness read the visible base, not the
    // image-bottom anchor.
    var _padY = entry.h * (entry.pad || 0);
    spr.userData.baseOffset = _padY;
    // keepY = interior in-frame figure on an upper storey: keep the given floor Z, don't snap to the
    // building's ground plane (which would drop it to the ground floor). Still apply the pad offset.
    if (keepY) spr.position.y = threePos.y - _padY;
    else if (_staffageGroundY != null) spr.position.y = _staffageGroundY - _padY;
    function _size() {
      var img = tex.image;
      var aspect = (img && img.width && img.height) ? (img.width / img.height) : 0.5;
      spr.scale.set(entry.h * aspect, entry.h, 1);
    }
    var im = tex.image;
    if (im && im.complete && im.naturalWidth) _size();
    else if (im) im.addEventListener('load', _size, { once: true });
    else spr.scale.set(entry.h * 0.5, entry.h, 1);   // provisional until the image arrives
    _photoStaffage.add(spr);
    if (isPerson) _photoStaffagePeople.push(spr);
    return spr;
  }
  // §PHOTO_STAFFAGE: place cutouts derived from THIS building's real bbox + IfcDoor rows, but ONLY
  // for a category the building has NO real entourage for (real RPC people/trees are handled by the
  // streaming.js material pass — placing sprites on top would double them up). General to any
  // building; nothing hardcoded.
  // §PHOTO_STAFFAGE: greedily pick up to n rows [x,y,z,bbox_z] that are at least minDist apart in
  // plan — spreads figures across real furniture instead of clustering them at one crowded spot.
  function _spreadPick(rows, n, minDist) {
    var picked = [];
    for (var i = 0; i < rows.length && picked.length < n; i++) {
      var r = rows[i], ok = true;
      for (var j = 0; j < picked.length; j++) {
        if (Math.hypot(r[0] - picked[j][0], r[1] - picked[j][1]) < minDist) { ok = false; break; }
      }
      if (ok) picked.push(r);
    }
    return picked;
  }
  // §STAFFAGE_OCCUPANCY (prompts/STAFFAGE_WALKABLE_PLACEMENT.md §A — root-cause fix for "walking in
  // objects"): the old walker-clearance test only checked distance from FURNITURE, so a "clear" aisle
  // point could still sit inside a column, against a wall, or inside MEP/equipment. This rasterizes
  // EVERY solid element (all classes except doors/windows/openings/spaces/slabs/roofs/coverings/
  // footings — the non-solid or separately-handled ones) that overlaps a person-height Z band into a
  // coarse 2D grid in IFC plan space, respecting rotation_z for oriented bboxes. A point is free only
  // if it and a clearance ring around it hit no marked cell.
  var _OCC_EXCLUDE_CLASSES = "'IfcDoor','IfcWindow','IfcOpeningElement','IfcSpace','IfcSlab','IfcSlabStandardCase','IfcRoof','IfcCovering','IfcFooting'";
  function _buildOccupancyGrid(zLoIfc, zHiIfc, cell) {
    cell = cell || 0.5;
    var rows = A.dbQuery(
      "SELECT et.center_x, et.center_y, et.bbox_x, et.bbox_y, et.rotation_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.ifc_class NOT IN (" + _OCC_EXCLUDE_CLASSES + ") AND et.center_x IS NOT NULL AND et.bbox_x IS NOT NULL " +
      "AND et.center_z + COALESCE(et.bbox_z,0)/2 > " + zLoIfc + " AND et.center_z - COALESCE(et.bbox_z,0)/2 < " + zHiIfc
    ) || [];
    var cells = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], ex = r[0], ey = r[1], hx = (r[2] || 0.3) / 2, hy = (r[3] || 0.3) / 2, rz = r[4] || 0;
      var cs = Math.cos(rz), sn = Math.sin(rz);
      for (var lx = -hx; lx <= hx + 1e-6; lx += cell) {
        for (var ly = -hy; ly <= hy + 1e-6; ly += cell) {
          var wx = ex + lx * cs - ly * sn, wy = ey + lx * sn + ly * cs;
          cells[Math.round(wx / cell) + ',' + Math.round(wy / cell)] = true;
        }
      }
    }
    return {
      elemCount: rows.length,
      free: function(x, y, clear) {
        clear = clear == null ? 0.5 : clear;
        var n = Math.ceil(clear / cell), ix0 = Math.round(x / cell), iy0 = Math.round(y / cell);
        for (var dx = -n; dx <= n; dx++) {
          for (var dy = -n; dy <= n; dy++) {
            if (Math.hypot(dx * cell, dy * cell) > clear) continue;
            if (cells[(ix0 + dx) + ',' + (iy0 + dy)]) return false;
          }
        }
        return true;
      }
    };
  }
  // §STAFFAGE_OCCUPANCY: a door/candidate point sits INSIDE or AT a solid (a door is set into a wall)
  // — search outward in rings for the nearest free point instead of rejecting outright, so a walker
  // lands beside the doorway/obstacle rather than never being placed. Returns [x,y] or null if nothing
  // free within the search radius.
  function _nudgeFree(grid, x, y, clear) {
    if (grid.free(x, y, clear)) return [x, y];
    for (var rad = 0.4; rad <= 1.6; rad += 0.4) {
      for (var a = 0; a < 8; a++) {
        var ang = a * Math.PI / 4;
        var nx = x + Math.cos(ang) * rad, ny = y + Math.sin(ang) * rad;
        if (grid.free(nx, ny, clear)) return [nx, ny];
      }
    }
    return null;
  }
  function _buildStaffage() {
    if (!A.dbQuery || !THREE.Sprite) return;
    var _bt0 = performance.now();
    var bbox = _buildingBBoxIfc();
    if (!bbox) return;
    var cx = (bbox.xMin + bbox.xMax) / 2, cy = (bbox.yMin + bbox.yMax) / 2;
    var w = bbox.xMax - bbox.xMin, d = bbox.yMax - bbox.yMin, groundZ = bbox.zMin;
    var hx = (w / 2) || 1, hy = (d / 2) || 1, envelope = Math.max(w, d, 30);
    // Anchor feet to the RENDERED ground plane (same level _calcGroundY gives A.ground), not the raw
    // bbox.zMin — otherwise everyone sinks ~1ft below the visible floor (user-reported).
    if (A._calcGroundY) A._calcGroundY();
    _staffageGroundY = (A.ground && typeof A.ground.position.y === 'number') ? A.ground.position.y : A.ifc2three(0, 0, groundZ).y;
    if (!_photoStaffage) _photoStaffage = new THREE.Group();
    // §PHOTO_STAFFAGE_FLOOR (user: "person standing a bit in the raised floor — why not check the
    // floor Z value?"): the single global ground plane is too blunt where a room has a RAISED floor.
    // Look up the actual floor slab under each figure's (x,y) and seat feet on its TOP surface; fall
    // back to the ground plane only where no slab covers that point (outside the building → trees /
    // outside people on the terrain). One slab list, in-memory point-in-footprint test — not a
    // per-figure DB query.
    var _slabs = A.dbQuery("SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE m.ifc_class IN ('IfcSlab','IfcSlabStandardCase') AND t.bbox_z IS NOT NULL AND t.bbox_z < 1.5 AND t.center_x IS NOT NULL") || [];
    var _floorSlab = 0, _floorGround = 0;
    function _floorThreeY(x, y, refZ) {
      var best = null;
      for (var si = 0; si < _slabs.length; si++) {
        var s = _slabs[si], top = s[2] + (s[5] || 0) / 2;
        if (top <= refZ + 1.5 && Math.abs(x - s[0]) <= (s[3] || 3) / 2 + 0.5 && Math.abs(y - s[1]) <= (s[4] || 3) / 2 + 0.5) {
          if (best === null || top > best) best = top;
        }
      }
      if (best !== null) { _floorSlab++; return A.ifc2three(x, y, best).y; }
      _floorGround++; return _staffageGroundY;
    }
    // Place a figure at IFC (x,y), feet on the actual floor slab under it (raised floors respected),
    // pad-corrected. keepY=true tells _addStaffageSprite to trust this Y (no global ground snap).
    function _placeAt(entry, ifcX, ifcY, refZ, isPerson) {
      var pos = A.ifc2three(ifcX, ifcY, refZ);
      pos.y = _floorThreeY(ifcX, ifcY, refZ);
      return _addStaffageSprite(entry, pos, isPerson, true);
    }
    function _cnt(sql) { try { var r = A.dbQuery(sql); return (r && r.length) ? (r[0][0] || 0) : 0; } catch (e) { return 0; } }
    var realPeople = _cnt("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcBuildingElementProxy' AND (element_name LIKE 'RPC Male%' OR element_name LIKE 'RPC Female%')");
    var realTrees = _cnt("SELECT COUNT(*) FROM elements_meta WHERE lower(element_name) LIKE '%tree%'");
    var placedP = 0, placedT = 0, pSrc = 'none';

    // §PHOTO_STAFFAGE_SILHOUETTE (user: "the building has walls you can easily measure instead of
    // throwing" — trees on a bbox ellipse cut through an L-shaped/concave solid and landed inside).
    // MEASURE the real footprint: bin every element by its angle from centre, record the FARTHEST
    // one per direction. silR(angle) then gives the actual building reach that way, so props sit
    // just BEYOND the real walls in whatever direction — concave shapes included. Real geometry,
    // deterministic; clamped so a stray far element can't fling a prop to the horizon.
    var NB = 96, binMax = new Array(NB).fill(0);
    var allPts = A.dbQuery("SELECT center_x, center_y FROM element_transforms WHERE center_x IS NOT NULL") || [];
    for (var pi = 0; pi < allPts.length; pi++) {
      var ex = allPts[pi][0] - cx, ey = allPts[pi][1] - cy, rr = Math.hypot(ex, ey);
      if (!rr) continue;
      var bpi = (((Math.floor((Math.atan2(ey, ex) / (2 * Math.PI)) * NB)) % NB) + NB) % NB;
      if (rr > binMax[bpi]) binMax[bpi] = rr;
    }
    var _silCap = Math.hypot(hx, hy) + 8;
    function silR(a) {
      var bi = (((Math.floor((a / (2 * Math.PI)) * NB)) % NB) + NB) % NB, m = 0;
      for (var k = -1; k <= 1; k++) { var b = (((bi + k) % NB) + NB) % NB; if (binMax[b] > m) m = binMax[b]; }
      return Math.min(m || Math.max(hx, hy), _silCap);
    }

    if (realPeople === 0) {
      var sitPoses = _STAFFAGE_PEOPLE.filter(function(p) { return p.role === 'sit'; });
      var walkPoses = _STAFFAGE_PEOPLE.filter(function(p) { return p.role === 'walk'; });
      var outsidePoses = _STAFFAGE_PEOPLE.filter(function(p) { return p.place === 'out'; });  // the 2 standing
      // §PHOTO_STAFFAGE_SCALE (user: "for a big place multiply the pax at different wings, ends... with
      // so many rooms at least ends and middle"). Counts scale with building size; placement spreads
      // across the footprint so a multi-wing plan gets people at its ends and middle, not clustered.
      var span = w + d, maxExt = Math.max(w, d);
      var nSit = Math.max(2, Math.min(10, Math.round(span / 16)));
      var nWalk = Math.max(1, Math.min(6, Math.round(span / 28)));
      var nStanding = Math.max(2, Math.min(6, Math.round(span / 30)));

      // SITTING → real furniture (chairs), spread across the plan (minDist scales with size).
      var furn = A.dbQuery("SELECT et.center_x, et.center_y, et.center_z, et.bbox_z FROM element_transforms et JOIN elements_meta em ON et.guid=em.guid WHERE em.ifc_class IN ('IfcFurniture','IfcFurnishingElement') AND et.bbox_x IS NOT NULL ORDER BY et.center_z ASC LIMIT 600") || [];
      var insideMinD = Math.max(3.5, Math.min(22, maxExt / Math.max(2, nSit * 0.7)));
      var spots = _spreadPick(furn, nSit, insideMinD);
      if (spots.length) {
        // Furnished building → sitting on chairs + walking in INTERIOR doorways (circulation),
        // never on furniture (user: "walking in chairs... they can just go to corridors"). An
        // interior door sits INSIDE the measured perimeter (radius < silR). No IfcSpace/corridor
        // metadata is extracted, so interior doors are the circulation proxy; a compiled room/
        // corridor spine could refine this later if the user injects rooms.
        pSrc = 'furniture';
        for (var i = 0; i < spots.length; i++) { var s = spots[i]; _placeAt(sitPoses[i % sitPoses.length], s[0], s[1], s[2], true); placedP++; }
        var idoors = A.dbQuery("SELECT et.center_x, et.center_y, et.center_z, et.bbox_z FROM element_transforms et JOIN elements_meta em ON et.guid=em.guid WHERE em.ifc_class='IfcDoor' AND et.center_x IS NOT NULL ORDER BY et.center_z ASC LIMIT 400") || [];
        var interiorDoors = idoors.filter(function(r) { return Math.hypot(r[0] - cx, r[1] - cy) < silR(Math.atan2(r[1] - cy, r[0] - cx)) - 3.0; });
        // §STAFFAGE_OCCUPANCY: a door sits INSIDE a wall — nudge each candidate to the nearest FREE
        // point (occupancy grid banded to that door's own floor) before accepting it, instead of the
        // old "place flat at the door centre" (clips the wall/leaf). One grid built per distinct
        // floor Z among the candidate doors, reused across all doors on that floor.
        var doorWalkTried = interiorDoors.length, doorWalkPlaced = 0, doorRejectedInObject = 0;
        var freeDoorSpots = [], _doorFloorGrids = {};
        for (var di2 = 0; di2 < interiorDoors.length; di2++) {
          var idr = interiorDoors[di2], doorFloorZ = idr[2] - (idr[3] || 2.1) / 2, fkey = Math.round(doorFloorZ);
          if (!_doorFloorGrids[fkey]) _doorFloorGrids[fkey] = _buildOccupancyGrid(doorFloorZ - 0.3, doorFloorZ + 2.0);
          var nudged = _nudgeFree(_doorFloorGrids[fkey], idr[0], idr[1], 0.5);
          if (nudged) freeDoorSpots.push([nudged[0], nudged[1], idr[2], idr[3]]);
          else doorRejectedInObject++;
        }
        var walkSpots = _spreadPick(freeDoorSpots, nWalk, Math.max(4, maxExt / Math.max(2, nWalk)));
        for (var wq = 0; wq < walkSpots.length; wq++) { var wd = walkSpots[wq]; _placeAt(walkPoses[wq % walkPoses.length], wd[0], wd[1], wd[2], true); placedP++; doorWalkPlaced++; }
        if (walkSpots.length) pSrc = 'furniture+walk-door';
        // §STAFFAGE_WALK_CLEAR: independently re-verify every PLACED door-walker against its floor's
        // grid — proves the placement itself is clean, not just the search that produced it.
        var doorWcOk = 0;
        for (var wv = 0; wv < walkSpots.length; wv++) {
          var wvp = walkSpots[wv], wfz = Math.round(wvp[2] - (wvp[3] || 2.1) / 2);
          if (_doorFloorGrids[wfz] && _doorFloorGrids[wfz].free(wvp[0], wvp[1], 0.5)) doorWcOk++;
        }
        console.log('§PHOTO_STAFFAGE_WALKCLEAR src=doors walkTried=' + doorWalkTried + ' walkPlaced=' + doorWalkPlaced + ' rejectedInObject=' + doorRejectedInObject);
        console.log('§STAFFAGE_WALK_CLEAR src=doors ok=' + doorWcOk + '/' + walkSpots.length);
      } else {
        // No furniture (HHS/Esplanades) → sitting/walking have no interior anchor; send them OUTSIDE
        // with the standing figures so they're visible on the ground rather than lost inside.
        pSrc = 'exterior-ground';
        outsidePoses = _STAFFAGE_PEOPLE;
        nStanding = Math.max(nStanding, nSit + nWalk);
      }

      // OUTSIDE figures — at real ENTRANCES. An exterior door sits ON the measured perimeter: its
      // distance from centre ≈ the silhouette in its direction (interior doors sit well inside).
      // Take GROUND-FLOOR exterior doors, then _spreadPick them so figures land at DIFFERENT wings/
      // ends, not all at one entrance. Step each just out of its door, feet on the floor. (IfcSpace/
      // corridor data is not extracted here, so exterior doors are the reliable entrance signal.)
      var no = nStanding;
      var doors = A.dbQuery("SELECT et.center_x, et.center_y, et.center_z, et.bbox_z, MAX(COALESCE(et.bbox_x,0), COALESCE(et.bbox_y,0)) FROM element_transforms et JOIN elements_meta em ON et.guid=em.guid WHERE em.ifc_class='IfcDoor' AND et.center_x IS NOT NULL") || [];
      var ext = [];
      for (var di = 0; di < doors.length; di++) {
        var dd = doors[di], dex = dd[0] - cx, dey = dd[1] - cy, dr = Math.hypot(dex, dey);
        if (dr >= silR(Math.atan2(dey, dex)) - 3.0) ext.push([dd[0], dd[1], dd[2], dd[3], dd[4] || 0.9]);
      }
      ext.sort(function(a, b) { return (a[2] - b[2]) || (b[4] - a[4]); });   // ground floor, then widest
      if (ext.length) {
        var gfz = ext[0][2];
        var gfExt = ext.filter(function(e) { return e[2] <= gfz + 4; });   // ground-floor exterior doors
        var entMinD = Math.max(6, maxExt / Math.max(2, no));
        var picked = _spreadPick(gfExt, no, entMinD);          // spread across wings/ends
        if (!picked.length) picked = gfExt.slice(0, no);
        for (var k = 0; k < no; k++) {
          var e = picked[k % picked.length], ol = Math.hypot(e[0] - cx, e[1] - cy) || 1;
          var lat = Math.floor(k / picked.length) * 1.4;       // extras at the same door step sideways
          var px = e[0] + ((e[0] - cx) / ol) * 1.6 + (-(e[1] - cy) / ol) * lat;
          var py = e[1] + ((e[1] - cy) / ol) * 1.6 + ((e[0] - cx) / ol) * lat;
          _placeAt(outsidePoses[k % outsidePoses.length], px, py, e[2], true);   // floor at the entrance
          placedP++;
        }
        pSrc += '+entrance';
      } else {
        for (var k2 = 0; k2 < no; k2++) {
          var pa = (k2 / no) * Math.PI * 2 + 0.9, prad = silR(pa) + 2.5;
          _placeAt(outsidePoses[k2 % outsidePoses.length], cx + Math.cos(pa) * prad, cy + Math.sin(pa) * prad, groundZ, true);
          placedP++;
        }
        pSrc += '+silhouette';
      }
    }

    // Trees ringed just BEYOND the measured silhouette (never through the walls), count scales with
    // building size (HHS gets ~18, a house ~8).
    if (realTrees === 0) {
      var ntrees = Math.max(8, Math.min(24, Math.round((2 * (w + d)) / 14)));
      for (var t = 0; t < ntrees; t++) {
        var ta = (t / ntrees) * Math.PI * 2 + 0.4;
        var trad = silR(ta) + 5;
        _placeAt(_STAFFAGE_TREES[t % _STAFFAGE_TREES.length], cx + Math.cos(ta) * trad, cy + Math.sin(ta) * trad, groundZ, false);
        placedT++;
      }
    }
    if (_photoStaffage.parent !== A.scene) A.scene.add(_photoStaffage);
    _photoStaffage.userData.counts = { people: placedP, trees: placedT };
    // §-witness the feet-on-ground invariant IN the log (readable from any real session's console,
    // no browser needed): every sprite's feet Y minus the rendered ground Y — must be 0,0.
    var _fMin = Infinity, _fMax = -Infinity;
    _photoStaffage.children.forEach(function(s) { var dy = (s.position.y + (s.userData.baseOffset || 0)) - _staffageGroundY; if (dy < _fMin) _fMin = dy; if (dy > _fMax) _fMax = dy; });
    if (!_photoStaffage.children.length) { _fMin = 0; _fMax = 0; }
    console.log('§PHOTO_STAFFAGE people=' + placedP + ' trees=' + placedT + ' pSrc=' + pSrc + ' floor=slab:' + _floorSlab + '/ground:' + _floorGround + ' feetVsGroundY=[' + _fMin.toFixed(2) + ',' + _fMax.toFixed(2) + '] groundY=' + _staffageGroundY.toFixed(2) + ' slabs=' + _slabs.length + ' build_ms=' + (performance.now() - _bt0).toFixed(0) + ' (realPeople=' + realPeople + ' realTrees=' + realTrees + ')');
  }
  // §PHOTO_STAFFAGE_STATUS (user: "why don't you give a wait-loading status?"): the cutout PNGs
  // load async (~seconds first time), so Alt+P looked like nothing happened. Drive the bottom
  // status bar with a live count — "⏳ Populating… N/M" as textures decode, "✓ Scene populated —
  // P people, T trees" when done. Cached on later toggles → jumps straight to done. No polling:
  // hooks each unique texture's image 'load' event; the sprite also pops in the frame as it loads.
  function _trackStaffageLoading() {
    if (!A.status || !_photoStaffage) return;
    var c = _photoStaffage.userData.counts || { people: 0, trees: 0 };
    var doneMsg = '✓ Scene populated — ' + c.people + ' people, ' + c.trees + ' trees';
    var seen = [], texs = [];
    _photoStaffage.children.forEach(function(s) {
      if (s.material && s.material.map && seen.indexOf(s.material.map) < 0) { seen.push(s.material.map); texs.push(s.material.map); }
    });
    var total = texs.length;
    function loaded() { var n = 0; for (var i = 0; i < texs.length; i++) { var im = texs[i].image; if (im && im.complete && im.naturalWidth) n++; } return n; }
    function paint() {
      var n = loaded();
      if (n >= total) { A.status.textContent = doneMsg; if (A.markDirty) A.markDirty(); }
      else A.status.textContent = '⏳ Populating scene… ' + n + '/' + total;
    }
    if (!total) { A.status.textContent = doneMsg; return; }
    paint();
    texs.forEach(function(t) {
      var im = t.image;
      if (im && !(im.complete && im.naturalWidth)) im.addEventListener('load', paint, { once: true });
    });
  }
  function _disposeStaffage() {
    if (_photoStaffage) {
      A.scene.remove(_photoStaffage);
      _photoStaffage.children.forEach(function(s) { if (s.material) s.material.dispose(); });
    }
    _photoStaffage = null; _photoStaffagePeople = []; _photoStaffageInFrame = []; _lastPeopleVis = null;
  }
  // §PHOTO_STAFFAGE: people are spherical billboards — from a steep top-down angle they read as
  // upright figures floating detached from the ground (the aerial-angle failure the spec names).
  // Hide people (only) when the camera looks steeper than ~37deg down; trees tolerate it. Now that
  // Populate is a persistent Alt+P toggle (not frozen to one Alt+S camera), this re-runs on every
  // controls 'change' — so it logs only when the decision FLIPS, not every frame.
  var _lastPeopleVis = null;
  function _updatePeoplePitchGate() {
    if (!_photoStaffagePeople.length || !A.camera) return;
    var fwd = new THREE.Vector3();
    A.camera.getWorldDirection(fwd);
    var down = -fwd.y;                       // 0 = horizontal, 1 = straight down
    var showP = down < 0.72;                 // ~46deg — show at normal establishing angles, hide only
                                             // near top-down where cutout people foreshorten/float
    if (showP === _lastPeopleVis) return;
    _photoStaffagePeople.forEach(function(s) { s.visible = showP; });
    _lastPeopleVis = showP;
    if (A.markDirty) A.markDirty();
    console.log('§PHOTO_STAFFAGE_PITCH down=' + down.toFixed(2) + ' peopleVisible=' + showP);
  }
  // §PHOTO_POPULATE (2026-07-17, user: separate Alt+P step, "more silent ops, user remembers it
  // once"): staffage is its OWN persistent toggle, decoupled from Alt+S. Alt+S stays a clean
  // still on real geometry only; Alt+P adds/removes the fabricated people+trees layer, stacking
  // with Alt+S or standalone. Toggle (not one-shot), like Night/Shadow/Cinema.
  // §PHOTO_STAFFAGE_INTERIOR (user: "when capturing inside a building also place more people, those
  // sitting, to be in the frame"). When the camera is INSIDE the footprint, drop sitting/walking
  // figures onto real furniture that's currently in view, seated on that furniture's own floor slab
  // (not the ground plane — could be an upper storey). Re-placed to the live camera each time
  // Populate is (re)toggled, so re-pressing Alt+P after moving inside refreshes the framing.
  function _disposeInFrame() {
    _photoStaffageInFrame.forEach(function(s) {
      if (_photoStaffage) _photoStaffage.remove(s);
      var i = _photoStaffagePeople.indexOf(s); if (i >= 0) _photoStaffagePeople.splice(i, 1);
      if (s.material) s.material.dispose();
    });
    _photoStaffageInFrame = [];
  }
  function _updateInFrameInterior() {
    _disposeInFrame();
    if (!A.dbQuery || !A.camera || !THREE.Sprite || !_photoStaffage) return;
    var bbox = _buildingBBoxIfc(); if (!bbox) return;
    var c0 = A.ifc2three(bbox.xMin, bbox.yMin, bbox.zMin), c1 = A.ifc2three(bbox.xMax, bbox.yMax, bbox.zMax);
    var minX = Math.min(c0.x, c1.x), maxX = Math.max(c0.x, c1.x), minZ = Math.min(c0.z, c1.z), maxZ = Math.max(c0.z, c1.z), roofY = Math.max(c0.y, c1.y);
    var cam = A.camera.position;
    var inside = cam.x > minX && cam.x < maxX && cam.z > minZ && cam.z < maxZ && cam.y < roofY + 2;
    if (!inside) { console.log('§PHOTO_STAFFAGE_INTERIOR inside=0'); return; }
    // furniture currently in the view frustum, near the camera
    var furn = A.dbQuery("SELECT et.center_x, et.center_y, et.center_z, et.bbox_z FROM element_transforms et JOIN elements_meta em ON et.guid=em.guid WHERE em.ifc_class IN ('IfcFurniture','IfcFurnishingElement') AND et.center_x IS NOT NULL") || [];
    var _v = new THREE.Vector3(), cand = [];
    for (var i = 0; i < furn.length; i++) {
      var f = furn[i], p = A.ifc2three(f[0], f[1], f[2]);
      _v.copy(p).project(A.camera);
      if (Math.abs(_v.x) < 0.9 && Math.abs(_v.y) < 0.95 && _v.z > -1 && _v.z < 1) {
        var dist = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
        if (dist < 16) cand.push([f[0], f[1], f[2], f[3], dist]);
      }
    }
    cand.sort(function(a, b) { return a[4] - b[4]; });
    var picked = _spreadPick(cand, 5, 2.0);
    // floor slab under each spot (raised/upper storey respected — same logic as _buildStaffage)
    var slabs = A.dbQuery("SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE m.ifc_class IN ('IfcSlab','IfcSlabStandardCase') AND bbox_z IS NOT NULL AND bbox_z < 1.5 AND center_x IS NOT NULL") || [];
    function floorY(x, y, refZ) {
      var best = null;
      for (var s = 0; s < slabs.length; s++) { var sl = slabs[s], top = sl[2] + (sl[5] || 0) / 2; if (top <= refZ + 1.5 && Math.abs(x - sl[0]) <= (sl[3] || 3) / 2 + 0.5 && Math.abs(y - sl[1]) <= (sl[4] || 3) / 2 + 0.5) { if (best === null || top > best) best = top; } }
      return best !== null ? A.ifc2three(x, y, best).y : _staffageGroundY;
    }
    var sitPoses = _STAFFAGE_PEOPLE.filter(function(p) { return p.role === 'sit'; });
    var walkPoses = _STAFFAGE_PEOPLE.filter(function(p) { return p.role === 'walk'; });
    var floorYval = picked.length ? floorY(picked[0][0], picked[0][1], picked[0][2]) : _staffageGroundY;
    var placedSit = 0, placedWalk = 0;
    // SITTING → on the in-view furniture (seated on real chairs)
    for (var k = 0; k < picked.length; k++) {
      var s = picked[k], pos = A.ifc2three(s[0], s[1], s[2]); pos.y = floorY(s[0], s[1], s[2]);
      var spr = _addStaffageSprite(sitPoses[k % sitPoses.length], pos, true, true);
      spr.userData.interior = true; _photoStaffageInFrame.push(spr); placedSit++;
    }
    // WALKING → in the AISLE: floor points ahead of the camera, in view, and clear of EVERY solid
    // (occupancy grid — walls/columns/furniture/equipment/MEP, not just furniture-distance) — so
    // walkers never stand among the chairs (user: "walking in chairs") OR inside a column/wall
    // (§STAFFAGE_OCCUPANCY, prompts/STAFFAGE_WALKABLE_PLACEMENT.md §A). Also naturally populates a
    // corridor view (no solids → the whole floor is clear).
    var fwd = new THREE.Vector3(); A.camera.getWorldDirection(fwd); fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1); fwd.normalize();
    var rightV = new THREE.Vector3(fwd.z, 0, -fwd.x);
    var ifcFloorZ = floorYval + A.modelOffset.z;
    var aisleGrid = _buildOccupancyGrid(ifcFloorZ - 0.3, ifcFloorZ + 2.0);
    var walkCand = [], _np = new THREE.Vector3(), aisleWalkTried = 0, aisleRejectedInObject = 0;
    for (var dd = 4; dd <= 13; dd += 3) {
      for (var lat = -4.5; lat <= 4.5; lat += 3) {
        var wx = cam.x + fwd.x * dd + rightV.x * lat, wz = cam.z + fwd.z * dd + rightV.z * lat;
        _np.set(wx, floorYval + 1.0, wz).project(A.camera);
        if (Math.abs(_np.x) > 0.85 || Math.abs(_np.y) > 0.9 || _np.z < -1 || _np.z > 1) continue;
        aisleWalkTried++;
        var ifcX = wx + A.modelOffset.x, ifcY = -wz + A.modelOffset.y;
        if (aisleGrid.free(ifcX, ifcY, 0.5)) walkCand.push([wx, wz, Math.hypot(wx - cam.x, wz - cam.z)]);
        else aisleRejectedInObject++;
      }
    }
    walkCand.sort(function(a, b) { return a[2] - b[2]; });
    var wpick = [];
    for (var wi = 0; wi < walkCand.length && wpick.length < 2; wi++) {
      var ok = true; for (var wj = 0; wj < wpick.length; wj++) { if (Math.hypot(walkCand[wi][0] - wpick[wj][0], walkCand[wi][1] - wpick[wj][1]) < 3) { ok = false; break; } }
      if (ok) wpick.push(walkCand[wi]);
    }
    for (var m = 0; m < wpick.length; m++) {
      var spr2 = _addStaffageSprite(walkPoses[m % walkPoses.length], new THREE.Vector3(wpick[m][0], floorYval, wpick[m][1]), true, true);
      spr2.userData.interior = true; _photoStaffageInFrame.push(spr2); placedWalk++;
    }
    // §STAFFAGE_WALK_CLEAR: independently re-verify every PLACED aisle-walker against the same grid.
    var aisleWcOk = 0;
    for (var wv = 0; wv < wpick.length; wv++) {
      var vx = wpick[wv][0] + A.modelOffset.x, vy = -wpick[wv][1] + A.modelOffset.y;
      if (aisleGrid.free(vx, vy, 0.5)) aisleWcOk++;
    }
    console.log('§PHOTO_STAFFAGE_INTERIOR inside=1 inView=' + cand.length + ' sit=' + placedSit + ' walk=' + placedWalk + ' walkTried=' + aisleWalkTried + ' rejectedInObject=' + aisleRejectedInObject);
    console.log('§STAFFAGE_WALK_CLEAR src=aisle ok=' + aisleWcOk + '/' + wpick.length);
  }
  var _populateOn = false, _populateBuilding = null;
  A.togglePopulate = function() {
    _populateOn = !_populateOn;
    if (_populateOn) {
      if (A.status) A.status.textContent = '⏳ Populating scene…';
      if (!_photoStaffage || _populateBuilding !== A.activeBuilding) {
        _disposeStaffage();
        _buildStaffage();
        _populateBuilding = A.activeBuilding;
      }
      if (_photoStaffage) _photoStaffage.visible = true;
      _updateInFrameInterior();           // interior shot → drop sitting figures onto in-view furniture
      _lastPeopleVis = null;              // force a fresh pitch decision (+ log) on show
      _updatePeoplePitchGate();
      _trackStaffageLoading();            // live "⏳ N/M → ✓ populated" status while cutouts decode
      if (!A._populatePitchHooked && A.controls && A.controls.addEventListener) {
        A.controls.addEventListener('change', function() {
          if (_populateOn && _photoStaffage && _photoStaffage.visible) _updatePeoplePitchGate();
        });
        A._populatePitchHooked = true;     // live pitch gate: recompute as the camera orbits
      }
    } else if (_photoStaffage) {
      _photoStaffage.visible = false;
      if (A.status) A.status.textContent = 'Populate off';
    }
    if (A.markDirty) A.markDirty();
    console.log('§PHOTO_POPULATE on=' + _populateOn + ' bld=' + A.activeBuilding);
  };
  // §PHOTO_STAFFAGE_PRELOAD: measured — placement is 5-29ms; the whole first-time wait is decoding
  // the cutout PNGs (~2-6s). Textures are already cached after first use (and sprite objects reused
  // per building), so the SECOND Alt+P is instant — the only thing left is the FIRST. Warm the cache
  // in the background once the page is idle so even the first Alt+P is instant. The 12 cutouts are
  // small (downscaled + palette-quantized), building-independent, loaded once per session.
  (function _schedulePreload() {
    var run = function() {
      try {
        _STAFFAGE_PEOPLE.concat(_STAFFAGE_TREES).forEach(function(e) { _staffageTex(e.file); });
        console.log('§PHOTO_STAFFAGE_PRELOAD warming ' + (_STAFFAGE_PEOPLE.length + _STAFFAGE_TREES.length) + ' cutouts');
      } catch (e) { /* THREE not ready / offline — first Alt+P will load them then */ }
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 6000 });
    else setTimeout(run, 4000);
  })();
  function _showPhotoProps(show) {
    if (show && (!_photoUplights.length || _photoPropsBuilding !== A.activeBuilding)) {
      _disposePhotoProps();
      _buildPhotoProps();
    }
    if (show) _updateFacadeFacingLights();
    _photoUplights.forEach(function(l) { l.visible = show; });
    if (_photoSkyline) _photoSkyline.visible = show;
    if (_photoSkylineLights) _photoSkylineLights.visible = show;
  }
  // §PHOTO_STAGING (2026-07-15, POC — presentation only, not extracted BIM data): bundles the
  // sunset sky + amber building glow + the ground/edge/skyline props above into the SAME
  // still-refine trigger, all auto-reverting on teardown exactly like the texture toggle.
  // Reuses A.toggleNightMode()'s existing fixture-glow mechanism (synthetic per-storey fallback
  // already built for buildings with zero real IfcLightFixture data) rather than duplicating it,
  // then immediately restores the non-glow (sun/ambient/hemi/exposure/fog) side effects
  // toggleNightMode also applies — we want the amber glow, not night's moonlight override, since
  // the sunset sky set up above is the intended mood, not full night-black.
  // §PHOTO_STAGING_NO_SHADOW (2026-07-15, user ask): dropped toggleShadow() entirely — sky-only,
  // no ground/shadow-cycling. Simpler, and the sky alone already reads as the target evening mood.
  // §PHOTO_STAGING_GROUND (2026-07-15, user ask): dropping toggleShadow() also hid A.ground
  // entirely (pure black void, user-observed live) — restore a real ground plane directly,
  // using the existing earth texture + a warm dusk tint, without engaging the shadow-cycle
  // machinery. User confirmed this is meant to be an elaborate, deliberately-expensive prep —
  // don't hold back on this just because it's more code than a flat color.
  // §PHOTO_WARM_SUN (resume-brief item 3): the building's own walls used to get the ORIGINAL
  // daytime-neutral sun/ambient/hemi colors restored here — right call to avoid moonlight-blue,
  // but it meant the walls themselves never got a deliberate evening treatment, only the
  // separate light props around them changed. These are global, building-INDEPENDENT constants
  // (no per-building numbers) — a genuine golden-hour warm tint, distinct from both neutral
  // daylight and toggleNightMode's moonlight-blue, applied as a scale/hex-override on top of
  // this building's own saved daytime baseline (A._nightSaved), not a replacement of it.
  var PHOTO_SUN_COLOR = 0xffa55c;       // warm golden-hour sun, not neutral white
  var PHOTO_AMBIENT_COLOR = 0x8a6a55;   // warm dim ambient — shadow side reads dusk-toned, not grey
  var PHOTO_HEMI_SKY_COLOR = 0x6a5a7a;  // dusky violet-warm sky half of the hemi light
  var PHOTO_SUN_INTENSITY_SCALE = 0.7;  // dimmer than full daylight — evening, not noon
  var PHOTO_EXPOSURE_SCALE = 0.85;      // slightly underexposed overall — "materials in little light"
  // §PHOTO_SUN_REFLECTION (user ask, continued session — "get the Sun reflection beautiful
  // realistic surface material impact correct firsts"): three things were found reading the
  // existing sun/sky code rather than adding a new one:
  // 1. A.updateSky(elevation, azimuth) ALREADY repositions the real A.sun DirectionalLight to
  //    match the sky's visual sun disc, AND already drives an existing lensflare sprite
  //    (scene.js §S277f) whose intensity is naturally strongest near the horizon — this IS the
  //    "sun reflection" the user already sees correlate with camera angle. It was never broken.
  // 2. But A.renderer.toneMappingExposure gets scaled down (PHOTO_EXPOSURE_SCALE) for the
  //    "materials in little light" mood — and THREE.SpriteMaterial is tone-mapped by default, so
  //    that same exposure cut was ALSO dimming the lensflare, undercutting exactly the glare a
  //    real dusk photo would still show brightly. Fix: mark the flare sprites toneMapped=false
  //    for the photoshoot only, so exposure affects the building but not the sun glare.
  // 3. A.sun.position/A.sun.target.position were never saved/restored — after a photoshoot, the
  //    sun stayed aimed at the dusk direction forever, silently wrong-lighting normal daytime
  //    navigation afterward. Fixed here alongside the elevation change since it's the same code path.
  var PHOTO_SUN_ELEVATION = 6;    // was 8 — lower = longer/more dramatic dusk shadows, still above
                                   // Preetham's near-black cutoff (TM's own dawn/dusk boost kicks in <10°)
  var PHOTO_SUN_AZIMUTH = 200;
  var PHOTO_ENVMAP_BOOST = 3.0;   // multiply each material's existing envMapIntensity — stronger
                                   // glass/metal reflections without changing overall scene exposure
                                   // (history: 2.2 -> 3.2 -> 4.5 -> 3.0. The 4.5 step, combined with
                                   // the §PHOTO_ENVMAP_STALE fix below finally pointing every
                                   // material at the CORRECT dusk env map, made the glint work for
                                   // the first time — but also overshot: user reported "all shadows
                                   // on building are gone." Root cause of THAT: env-map/IBL
                                   // reflection is NOT shadow-map-occluded in three.js (same class of
                                   // bug as the earlier ground-emissive landmine above) — and the old
                                   // gate below applied the boost to EVERY material, not just
                                   // glass/metal, because `envMapIntensity` defaults to 1.0 (a
                                   // number) on ALL MeshStandardMaterial regardless of roughness, so
                                   // the `typeof m.envMapIntensity !== 'number'` check never actually
                                   // excluded plain concrete/plaster walls. Fixed by gating on
                                   // glossiness below; boost itself also dialed back one notch
                                   // per "glint is slightly too much."
  var PHOTO_GLOSSY_ROUGHNESS_MAX = 0.5;  // only materials this glossy or better (glass ~0.05-0.08,
                                          // tightened/native metal ~0.3-0.5) get the envMap boost —
                                          // excludes concrete/plaster/wood (STD_MAT rough 0.6-0.95),
                                          // whose shadow-darkened diffuse read must stay untouched.
  // §PHOTO_HOTSPOT (user ask: "tiny bright reflect off any part of the building that is steel or
  // smooth... just like a real scene" — the direct-glint effect you get when the sun is roughly
  // behind the camera, reflecting straight back off any glossy surface). envMapIntensity alone
  // boosts the SOFT ambient reflection; a crisp small "hotspot" specular highlight also needs
  // low roughness. Only touches materials already classed metallic (metalness>0.3 — same threshold
  // streaming.js's own STD_MAT table already uses for "metal" elsewhere), not every surface.
  var PHOTO_METAL_THRESHOLD = 0.3;
  var PHOTO_METAL_ROUGHNESS_SCALE = 0.4;  // tighter/brighter specular highlight (was 0.6)
  // §PHOTO_HEMI_FILL (user ask, "Ground still too dark"): re-read _setGroundColor (tools.js) and
  // found the actual bug — when the ground has a texture map (which it does, 'paved'), that
  // function IGNORES whatever hex tint is passed and forces plain WHITE (full brightness, no
  // darkening) as long as the tint's own channel-sum isn't very dark. So the ground was ALREADY
  // rendering at maximum brightness for its given light level — no tint could ever make it
  // brighter than that. The real cause is physical: PHOTO_SUN_ELEVATION=6 degrees is a nearly
  // horizontal ray — a horizontal ground plane's illumination from a directional light scales
  // with sin(elevation) (~10% at 6 degrees), while a VERTICAL facade gets nearly full illumination
  // from the same ray (cos of a near-90-degree incidence) — the dramatic-facade / dim-ground
  // split is real dusk-lighting physics, not a bug. Fix: boost the hemisphere/ambient fill
  // (omnidirectional sky light, doesn't depend on the sun's grazing angle) specifically for the
  // photoshoot, like a photographer's fill card compensating for what direct light can't reach.
  // §PHOTO_CONTRAST_DIALBACK (user reported "Shadows? None on the ground" + roof/ground spotlights
  // not distinctly visible right after 1.6/1.3 shipped): a strong blanket fill flattens the whole
  // scene toward the same brightness, which dilutes the RELATIVE contrast the shadow and the
  // discrete point-light addons depend on to read as distinct. Dialed back — some lift over the
  // raw sin(6 deg) ground darkness, not enough to wash out contrast.
  var PHOTO_HEMI_INTENSITY_SCALE = 1.25;
  var PHOTO_AMBIENT_INTENSITY_SCALE = 1.15;
  var _photoSunPosSaved = null, _photoSunTargetSaved = null;
  var _photoFlarePrevTone = null, _photoHaloPrevTone = null;
  var _photoEnvBoostedMats = [];
  var _photoMatBoostActive = false;
  // §PHOTO_STREAMING_RACE (user ask, continued — "shadows on rooftop still not there"): the
  // original one-shot traverse (both for shadow-casting AND the material envMap/roughness boost)
  // only covers whatever meshes/materials exist in A.scene/A._matCache at the EXACT moment Alt+S
  // fires. Hospital's rooftop content (589 trees, helipad, 567 solar panels — confirmed real via
  // direct DB query, not guessed) may stream/load lazily and not exist yet at that instant — the
  // one-shot push would silently skip them forever, the same class of bug already found+fixed
  // once this session for the triplanar shader uniform (§TRIPLANAR_RECOMPILE_FIX), just not
  // applied here the first time. Fix: re-run both traversals every accumulation frame (idempotent
  // — already-flagged objects/materials are skipped instantly) from startStillRefine's step()
  // loop below, so anything that streams in mid-accumulation still gets caught within the same
  // still-refine, not just at the first instant.
  function _reassertPhotoShadowCoverage() {
    if (!_photoShadowSelfEnabled || !A.scene) return;
    var changed = false;
    A.scene.traverse(function(o) {
      if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && !o.castShadow) {
        o.castShadow = true; o.receiveShadow = true; changed = true;
      }
    });
    if (changed && A.renderer) A.renderer.shadowMap.needsUpdate = true;
  }
  // §PHOTO_ENVMAP_STALE (user ask: "sunlight bounce has not occurred even once" — found the real
  // cause, not a tuning miss): streaming.js assigns each material's `.envMap` ONCE, at streaming
  // time, from whatever `A._envMap` was then — Hospital's 63,182 elements finish streaming almost
  // immediately on page load, long before Alt+S, so every material is permanently locked to the
  // DAYTIME env map baked at startup (sun elevation 45°/azimuth 180°, scene.js:225). The dusk
  // photoshoot repositions the real sun + regenerates a fresh env map (`A.updateSky`'s throttled
  // `_pmrem.fromScene`, scene.js:204-212) but never pushes that new texture back onto existing
  // materials — they kept reflecting a sun that isn't where the dusk scene actually put it, so no
  // camera angle could ever catch a correctly-aligned glint. Fix: refresh `.envMap` from the
  // CURRENT `A._envMap` unconditionally, every reassert tick (cheap reference swap) — decoupled
  // from the one-time `_photoBoosted` intensity/roughness flag below, since the fresh dusk texture
  // can arrive (2s-throttled) well after a material was already flagged boosted.
  function _reassertPhotoEnvMap() {
    if (!A._matCache || !A._envMap) return;
    Object.keys(A._matCache).forEach(function(k) {
      var m = A._matCache[k];
      if (m && 'envMap' in m && m.envMap !== A._envMap) { m.envMap = A._envMap; m.needsUpdate = true; }
    });
  }
  function _reassertPhotoMatBoost() {
    if (!_photoMatBoostActive || !A._matCache) return;
    Object.keys(A._matCache).forEach(function(k) {
      var m = A._matCache[k];
      if (!m || (m.userData && m.userData._photoBoosted) || typeof m.envMapIntensity !== 'number') return;
      var isMetal = typeof m.metalness === 'number' && m.metalness > PHOTO_METAL_THRESHOLD;
      var isGlossy = isMetal || (typeof m.roughness === 'number' && m.roughness <= PHOTO_GLOSSY_ROUGHNESS_MAX);
      if (isGlossy) {
        m.userData._photoOrigEnvMapIntensity = m.envMapIntensity;
        m.envMapIntensity = m.envMapIntensity * PHOTO_ENVMAP_BOOST;
      }
      if (isMetal) {
        m.userData._photoOrigRoughness = m.roughness;
        m.roughness = Math.max(0.05, m.roughness * PHOTO_METAL_ROUGHNESS_SCALE);
      }
      m.userData._photoBoosted = true;
      m.needsUpdate = true;
      if (isGlossy) _photoEnvBoostedMats.push(m);
    });
  }
  // §PHOTO_DUSK_SHADOWS: real shadow-casting at the dusk sun angle (the "long shadow... dramatic
  // Sun at dusk as shown in Time Machine" ask) — reuses time_machine.js's own proven sun-cycle
  // shadow mechanics (real castShadow/receiveShadow traverse + shadow-camera frustum sized to the
  // building envelope), NOT reinvented, just triggered from here instead of the 'h' Shadow pill.
  // If the user's OWN Shadow mode is already on, this leaves it alone entirely — never double-set.
  var _photoShadowSelfEnabled = false;
  function _enablePhotoShadows() {
    if (A._shadowOn) { _photoShadowSelfEnabled = false; return; }  // user's own Shadow mode active — don't touch
    if (!A.sun || !A.renderer || !A.scene) return;
    _photoShadowSelfEnabled = true;
    if (!A._shadowInited) {
      A.renderer.shadowMap.enabled = true;
      A.renderer.shadowMap.type = THREE.PCFShadowMap;
      A.renderer.shadowMap.autoUpdate = (window._shadowAutoUpdate === true);
      A._shadowInited = true;
    }
    A.sun.castShadow = true;
    var _ctr = A.controls ? A.controls.target : { x: 0, y: 0, z: 0 };
    A.sun.target.position.copy(_ctr);
    A.sun.target.updateMatrixWorld();
    var _env = 300;
    var _bc = Object.values(A.buildingCentres || {})[0];
    if (_bc && _bc.envelope) _env = Math.ceil(_bc.envelope);
    _env = Math.max(_env, 50);
    // NOTE: computed AFTER A.updateSky() has already positioned A.sun at the dusk direction (see
    // call order in _applyPhotoStaging below) — using the ORIGINAL toggleShadow() order (frustum
    // math before the sun is repositioned) would size this frustum for the wrong sun distance.
    var _sunDist = A.sun.position.distanceTo(_ctr);
    A.sun.shadow.mapSize.width = 2048;
    A.sun.shadow.mapSize.height = 2048;
    A.sun.shadow.camera.near = Math.max(1, _sunDist * 0.05);
    A.sun.shadow.camera.far = _sunDist * 4;
    A.sun.shadow.camera.left = -_env;
    A.sun.shadow.camera.right = _env;
    A.sun.shadow.camera.top = _env;
    A.sun.shadow.camera.bottom = -_env;
    A.sun.shadow.bias = -0.0005;
    A.sun.shadow.camera.updateProjectionMatrix();
    if (A.ground) A.ground.receiveShadow = true;
    var _shadowList = [];
    A.scene.traverse(function(o) { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) _shadowList.push(o); });
    var _si = 0;
    (function _chunk() {
      var end = Math.min(_si + 5000, _shadowList.length);
      for (; _si < end; _si++) { var o = _shadowList[_si]; if (o.visible) { o.castShadow = true; o.receiveShadow = true; } }
      A.renderer.shadowMap.needsUpdate = true;
      if (_si < _shadowList.length) setTimeout(_chunk, 0);
      else console.log('§PHOTO_SHADOW enabled casters=' + _shadowList.length + ' sunDist=' + _sunDist.toFixed(0) + ' env=' + _env);
    })();
  }
  function _disablePhotoShadows() {
    if (!_photoShadowSelfEnabled) return;
    _photoShadowSelfEnabled = false;
    A.sun.castShadow = false;
    var _unshadowList = [];
    A.scene.traverse(function(o) { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) _unshadowList.push(o); });
    var _ui = 0;
    (function _chunk() {
      var end = Math.min(_ui + 5000, _unshadowList.length);
      for (; _ui < end; _ui++) { _unshadowList[_ui].castShadow = false; _unshadowList[_ui].receiveShadow = false; }
      if (_ui < _unshadowList.length) setTimeout(_chunk, 0);
      else console.log('§PHOTO_SHADOW disabled');
    })();
  }
  var _photoNightWasOn = false, _photoSkyWasVisible = false;
  var _photoStagingOn = false;  // §PHOTO_DOUBLE_APPLY_GUARD — staging applied once per photo cycle
  A._photoStagingOn = false;    // public mirror — with Stage-2 auto-arm disabled (§AUTO_STAGE2_DISABLED)
                                // soft-park is signalled by kept-alive staging alone, and main.js's
                                // interaction gates (_photoCycleEngaged) need to see it to route a
                                // tap/UI-click to the full teardown.
  var _photoGroundWasVisible = false, _photoGroundPrevKey = null, _photoGroundPrevColor = null;
  var _photoFogColorSaved = null, _photoFogDensitySaved = null;
  var _photoSkyUniSaved = null;
  // §PHOTO_VARIATION (2026-07-16, user spec): "each time it is done first time it returns a diff
  // and once user agrees, press 'cinema' icon, it takes that persisted cache." A single random
  // seed (`A._photoPaintSeed`) drives every randomized presentation touch (ground puddle
  // placement here; surface paint jitter in streaming.js's triplanar shader). Re-rolled on every
  // Alt+S trigger while unlocked (so repeated triggers let the user browse different results);
  // A.startCinemaOrbit() locks it so the capture uses whichever variation was on screen when the
  // user pressed the button, and it stays locked for the rest of the session. No explicit clear-
  // on-close/Home code needed: `A._photoPaintSeed` is plain in-memory JS state and Home navigates
  // via a real `location.href` page reload (panels.js), which destroys it for free — matching
  // "clears each time viewer closes or returns to Home" without any extra plumbing.
  var _photoVariationLocked = false;
  function _seededRand(seed) { var s = Math.sin(seed * 12345.6789) * 43758.5453; return s - Math.floor(s); }
  // §PHOTO_PUDDLE (user ask: "wet ground... selective reflection over selective areas" — not an
  // even wet sheen, real puddles). A small fixed count of randomly-placed circular wet patches
  // (seeded, so reproducible while the variation is locked), each lowering roughness/darkening
  // diffuse ONLY inside its radius via a ground-material onBeforeCompile injection — same gated,
  // still-render-only pattern already proven for the triplanar textures (streaming.js), reusing
  // the EXISTING ground envMapIntensity (scene.js, 0.15) rather than adding a new one: lower
  // roughness alone makes a GGX/IBL reflection read sharper/more visible at the same intensity,
  // so this is real reflective play without re-touching the hemi/ambient landmine already
  // documented earlier in this file.
  var PHOTO_PUDDLE_COUNT = 6;
  var _groundPuddleShaderWired = false;
  var _puddleSeedBuilt = null, _puddleCenters = [], _puddleRadii = [];
  function _buildGroundPuddles(cx, cy) {
    var seed = A._photoPaintSeed || 0;
    if (_puddleSeedBuilt === seed && _puddleCenters.length) return;
    _puddleSeedBuilt = seed;
    _puddleCenters = []; _puddleRadii = [];
    var bbox = _buildingBBoxIfc();
    var envelope = bbox ? Math.max(bbox.xMax - bbox.xMin, bbox.yMax - bbox.yMin, 30) : 40;
    for (var i = 0; i < PHOTO_PUDDLE_COUNT; i++) {
      var rx = _seededRand(seed + i * 0.618034 + 0.11) - 0.5;
      var rz = _seededRand(seed + i * 0.618034 + 0.37) - 0.5;
      var rr = _seededRand(seed + i * 0.618034 + 0.59);
      var pos = A.ifc2three(cx + rx * envelope * 1.4, cy + rz * envelope * 1.4, 0);
      _puddleCenters.push({ x: pos.x, z: pos.z });
      _puddleRadii.push(2 + rr * (envelope * 0.09));
    }
  }
  function _applyPuddleUniforms(shader) {
    var n = Math.min(_puddleCenters.length, 8);
    shader.uniforms.uPuddleCount.value = n;
    for (var i = 0; i < n; i++) {
      shader.uniforms.uPuddleCenters.value[i].set(_puddleCenters[i].x, _puddleCenters[i].z);
      shader.uniforms.uPuddleRadii.value[i] = _puddleRadii[i];
    }
  }
  // §GROUND_WETNESS_OVERRIDE (2026-07-17, user: "we have to contain what we want only within S
  // and J. When S is ON, it is all reflective ground... The J reflect dial will control its effect.
  // When J is off, it persists for the session"): 0 = off, 1 = the whole ground at puddle-strength
  // wetness (roughness 0.08, darkened) uniformly, independent of the small random puddle patches
  // (both can coexist — max() below, whichever reads wetter at a given pixel wins). Contained to
  // Alt+S: staging auto-applies a mid-value default (GROUND_WETNESS_STAGE_DEFAULT below) the FIRST
  // time this session, tunable live via Alt+J's "reflect" dial from there — once the user touches
  // it, their value persists for the rest of the session (across S/J toggling, until page reload),
  // never auto-reset back to the default.
  var GROUND_WETNESS_STAGE_DEFAULT = 0.5;
  var _groundWetnessUserSet = false;
  A._groundWetnessOverride = 0;
  A._setGroundWetness = function(v, _isUserAction) {
    _wireGroundPuddleShader();  // safe no-op if already wired (Alt+S may have wired it first)
    A._groundWetnessOverride = Math.max(0, Math.min(1, v));
    if (_isUserAction !== false) _groundWetnessUserSet = true;  // default true — only the internal
    // staging auto-default call below passes false, so it never overrides a user's own choice
    console.log('§GROUND_WETNESS_OVERRIDE value=' + A._groundWetnessOverride + ' userSet=' + _groundWetnessUserSet);
    if (A.markDirty) A.markDirty();
  };
  function _wireGroundPuddleShader() {
    if (_groundPuddleShaderWired || !A.ground) return;
    _groundPuddleShaderWired = true;
    var mat = A.ground.material;
    mat.onBeforeCompile = function(shader) {
      shader.uniforms.uPuddleActive = { value: 0.0 };
      shader.uniforms.uPuddleCount = { value: 0 };
      shader.uniforms.uPuddleCenters = { value: (new Array(8)).fill(null).map(function() { return new THREE.Vector2(); }) };
      shader.uniforms.uPuddleRadii = { value: new Float32Array(8) };
      shader.uniforms.uWetnessOverride = { value: 0.0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorldPos;')
        .replace('#include <worldpos_vertex>', [
          '#include <worldpos_vertex>',
          'vGroundWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        ].join('\n'));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', [
          '#include <common>',
          'varying vec3 vGroundWorldPos;',
          'uniform float uPuddleActive;',
          'uniform int uPuddleCount;',
          'uniform vec2 uPuddleCenters[8];',
          'uniform float uPuddleRadii[8];',
          'uniform float uWetnessOverride;'
        ].join('\n'))
        .replace('#include <roughnessmap_fragment>', [
          '#include <roughnessmap_fragment>',
          'float uGroundWetness = 0.0;',  // declared OUTSIDE the if (top-level in main()) so the
          // later metalnessmap_fragment injection below — which runs after this chunk in three.js's
          // standard MeshStandardMaterial ordering — can read the same value.
          'if (uPuddleActive > 0.5) {',   // uniform branch — near-zero cost when off (normal nav)
          '  float wetness = uWetnessOverride;',  // full-surface base, small puddles can only add to it
          '  for (int pi = 0; pi < 8; pi++) {',
          '    if (pi >= uPuddleCount) break;',
          '    float d = distance(vGroundWorldPos.xz, uPuddleCenters[pi]);',
          '    float w = 1.0 - smoothstep(uPuddleRadii[pi] * 0.55, uPuddleRadii[pi], d);',
          '    wetness = max(wetness, w);',
          '  }',
          '  uGroundWetness = wetness;',
          '  roughnessFactor = mix(roughnessFactor, 0.08, wetness);',
          '  diffuseColor.rgb *= mix(1.0, 0.72, wetness);',  // wet patches read darker/more saturated
          '}'
        ].join('\n'))
        // §WETNESS_METALNESS (2026-07-17, user: "still not auto reflect"): roughness alone stays
        // subtle on a zero-metalness dielectric (real physics — see #822/#824 investigation). Wet
        // areas now also push metalness up, which is what actually makes a puddle read as
        // reflective rather than just "less matte." metalnessmap_fragment runs after
        // roughnessmap_fragment in three.js's standard chunk order, so uGroundWetness is available.
        .replace('#include <metalnessmap_fragment>', [
          '#include <metalnessmap_fragment>',
          'if (uPuddleActive > 0.5) { metalnessFactor = mix(metalnessFactor, 0.85, uGroundWetness); }'
        ].join('\n'));
      // §TRIPLANAR_CLONE_BOMB (see streaming.js): plain property, never userData — userData is
      // JSON-round-tripped by Material.copy() on every clone.
      mat._puddleShader = shader;
      shader.uniforms.uPuddleActive.value = (A._stillRefineActive || A._groundWetnessOverride > 0) ? 1.0 : 0.0;
      shader.uniforms.uWetnessOverride.value = A._groundWetnessOverride;
      _applyPuddleUniforms(shader);
    };
    // §PHOTO_PUDDLE self-heal: same recompile-resets-uniforms landmine already found+fixed once
    // this session for the triplanar shader (§TRIPLANAR_RECOMPILE_FIX) — re-assert every frame
    // instead of relying on a single push at compile time.
    mat.onBeforeRender = function() {
      var sh = mat._puddleShader;
      if (sh) {
        sh.uniforms.uPuddleActive.value = (A._stillRefineActive || A._groundWetnessOverride > 0) ? 1.0 : 0.0;
        sh.uniforms.uWetnessOverride.value = A._groundWetnessOverride;
        _applyPuddleUniforms(sh);
      }
    };
    mat.needsUpdate = true;
  }
  // §LAYER2_HDRI (2026-07-16, PHOTOREAL_STILL_RENDER.md §LAYER 2 — "best effort:benefit ratio of
  // everything in this spec", finally implemented): swaps the procedural Preetham-sky-derived
  // envMap for a REAL photographed HDRI (Poly Haven, CC0 — "Belfast Sunset, Pure Sky", clear dusk
  // sky matching this staging's own dusk mood, no on-ground foreground objects to leak weird
  // reflections) during the photoshoot only. Improves glass/metal reflection quality directly —
  // the flat-gray-glazing gap already flagged. Lazy-loaded once (real HTTP fetch + PMREM cost,
  // ~1.2MB at 1k res — plenty for a reflection source, never displayed at full resolution
  // directly), cached for every subsequent Alt+S. Reuses the EXISTING _reassertPhotoEnvMap() loop
  // (already runs every accumulation frame, decoupled from when A._envMap last changed) to push
  // this onto materials — no new per-frame code needed, just swap the source texture it reads.
  var _hdriEnvMap = null, _hdriLoading = false, _hdriPmrem = null;
  var _photoEnvMapSaved = null;
  function _ensureHdriEnvMap() {
    if (_hdriEnvMap || _hdriLoading) return;
    _hdriLoading = true;
    Promise.all([import('./lib/HDRLoader.js')]).then(function(mods) {
      var _hdrMod = mods[0];
      if (!_hdrMod.HDRLoader) throw new Error('HDRLoader not exported');
      if (!_hdriPmrem) { _hdriPmrem = new THREE.PMREMGenerator(A.renderer); _hdriPmrem.compileEquirectangularShader(); }
      new _hdrMod.HDRLoader().load('textures/hdri/belfast_sunset_puresky_1k.hdr', function(tex) {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        var envRT = _hdriPmrem.fromEquirectangular(tex);
        _hdriEnvMap = envRT.texture;
        tex.dispose();
        _hdriLoading = false;
        console.log('§LAYER2_HDRI_READY belfast_sunset_puresky_1k — real photographed envMap ready');
        // If still mid-photoshoot when the load finally resolves, apply immediately rather than
        // waiting for the next Alt+S — same "don't miss a slow-arriving asset" discipline as the
        // streaming-race fixes elsewhere in this file.
        if (A._stillRefineActive || _autoStageOn) A._envMap = _hdriEnvMap;
      }, undefined, function(err) {
        _hdriLoading = false;
        console.warn('§LAYER2_HDRI_FAIL ' + (err && err.message ? err.message : err));
      });
    }).catch(function(e) {
      _hdriLoading = false;
      console.warn('§LAYER2_HDRI_FAIL ' + e.message);
    });
  }
  function _applyPhotoStaging() {
    // §GROUND_WETNESS_REFIRE_FIX (2026-07-17, live user repro: worked once, then "cannot
    // replicate" on another building, back on the original — still couldn't, "but bit slightly"):
    // this MUST run on every Alt+S press, including a refire — unlike the fog/sun/night-glow
    // staging below, it's cheap, idempotent, and building-independent-safe. It used to sit AFTER
    // the _photoStagingOn early-return, which only fires once per true staging cycle; once staging
    // gets kept alive across a soft-park/building-switch (the guard below's own "Stage-2 refire"
    // case), EVERY later Alt+S — on ANY building — hit that early return and this line never ran
    // again for the rest of the session. Moved above the guard so it's independent of refire state.
    if (!_groundWetnessUserSet) A._setGroundWetness(GROUND_WETNESS_STAGE_DEFAULT, false);
    // §PHOTO_DOUBLE_APPLY_GUARD (2026-07-16, found live during the ghosting-fix verification):
    // a Stage-2 auto-refire calls startStillRefine → here while the soft-park KEPT staging alive —
    // the re-apply then saved the ALREADY-STAGED values (dusk fog/sun/night-glow) as the "original"
    // baseline (log fingerprint: `§PHOTO_STAGING on nightWasOn=true`), so the eventual full
    // teardown "restored" the scene to dusk instead of daytime — staging leaked permanently after
    // exit. Staging is applied once per photo-mode CYCLE; a refire only restarts the TAA polish.
    if (_photoStagingOn) { console.log('§PHOTO_STAGING already on — skip re-apply (Stage-2 refire)'); return; }
    _photoStagingOn = true;
    A._photoStagingOn = true;
    // §PHOTO_VARIATION: roll (or keep locked) the shared seed before anything below reads it.
    if (!_photoVariationLocked || A._photoPaintSeed == null) A._photoPaintSeed = Math.random();
    _wireGroundPuddleShader();
    var _pbbox = _buildingBBoxIfc();
    if (_pbbox) _buildGroundPuddles((_pbbox.xMin + _pbbox.xMax) / 2, (_pbbox.yMin + _pbbox.yMax) / 2);
    console.log('§PHOTO_PAINT_SEED seed=' + A._photoPaintSeed.toFixed(4) + ' locked=' + _photoVariationLocked +
      ' puddles=' + _puddleCenters.length);
    _photoGroundWasVisible = !!(A.ground && A.ground.visible);
    _photoGroundPrevKey = A._groundTexKey || null;
    _photoGroundPrevColor = A._groundSolidColor;
    if (A.ground && A._applyGroundTexture && A._calcGroundY) {
      A.ground.visible = true;
      A._calcGroundY();
      // §PHOTO_GROUND_LIT (user ask, "It is almost black"): was 'earth' + a dark 0x6a5238 tint —
      // too dark once the evening exposure/ambient cuts also apply on top of it. Switched to the
      // existing 'paved' texture (same real asset Shadow mode already uses — concrete look, per
      // user's own suggestion) with a much brighter warm tint. Fancier grass+paved-rectangle
      // pattern is a separate later experiment, not needed just to fix "too dark."
      A._applyGroundTexture('paved');
      if (A._setGroundColor) A._setGroundColor(0xd9c39a);  // bright warm sunlit-concrete tone
      // §PHOTO_GROUND_WHITE_REVERTED (user reported "Shadows? None on the ground" right after
      // this shipped): a flat emissive add is NOT shadow-map-occluded at all in three.js — it
      // washes out relative contrast between the sun's shadowed and lit ground patches, which is
      // likely exactly what killed shadow visibility. Reverted; ground brightness now comes ONLY
      // from real texture + hemi/ambient (both of which DO preserve shadow contrast, since they
      // light shadowed/unshadowed ground unequally) + fog haze at distance (see PHOTO_FOG below).
    }
    // §PHOTO_FOG (user ask: "ground goes dark in distance too much.. can be bright and foggy in
    // the distance"): the scene's default fog (scene.js) is a dark blue-purple (0x1a1a2e) — at
    // Hospital's scale that DARKENS the distant ground further, the opposite of what's wanted.
    // Override with a warm hazy tone matching the dusk horizon for the photoshoot only. Save the
    // ORIGINAL color/density here (before any of this function's changes) so teardown restores the
    // true pre-photoshoot state — the actual override is applied AFTER A.updateSky() below, see
    // §PHOTO_FOG_ORDER_FIX.
    if (A.scene && A.scene.fog) {
      _photoFogColorSaved = A.scene.fog.color.getHex();
      _photoFogDensitySaved = A.scene.fog.density;
    }
    // §LAYER2_HDRI: save whatever envMap was active (the procedural sky-derived one), swap to the
    // real HDRI if already loaded, or kick off the (one-time, cached) load if not yet ready —
    // _ensureHdriEnvMap applies it itself once resolved, per the mid-photoshoot check inside it.
    _photoEnvMapSaved = A._envMap;
    if (_hdriEnvMap) A._envMap = _hdriEnvMap; else _ensureHdriEnvMap();
    _photoSkyWasVisible = !!(A._sky && A._sky.visible);
    if (A.sun) {
      _photoSunPosSaved = A.sun.position.clone();
      _photoSunTargetSaved = A.sun.target.position.clone();
    }
    if (A._sky && A.updateSky) { A._sky.visible = true; A.updateSky(PHOTO_SUN_ELEVATION, PHOTO_SUN_AZIMUTH); }
    // §PHOTO_SKY_DRAMA (user ask: "more dramatic sky... reddish clouds in the distance"): Preetham
    // (Sky.js) is a clear-sky atmospheric-scattering model — it has no cloud geometry/texture at
    // all, so literal cloud SHAPES aren't something this shader can produce (a separate textured-
    // layer feature, not attempted here). What IS real and cheap: push the same uniforms scene.js
    // sets once at startup (turbidity/rayleigh/mie) further for the photoshoot only, richer/more
    // saturated toward the reddish end — scoped here, not touched globally, so normal daytime
    // navigation is unaffected.
    if (A._sky) {
      var _su = A._sky.material.uniforms;
      _photoSkyUniSaved = {
        turbidity: _su['turbidity'].value, rayleigh: _su['rayleigh'].value,
        mieCoefficient: _su['mieCoefficient'].value, mieDirectionalG: _su['mieDirectionalG'].value
      };
      _su['turbidity'].value = 8;         // more haze/color depth (was 4)
      _su['rayleigh'].value = 3.2;        // richer red/orange scatter (was 2)
      _su['mieCoefficient'].value = 0.012; // denser sun-glow bloom in the sky itself (was 0.005)
      _su['mieDirectionalG'].value = 0.9;  // tighter forward-scatter, punchier horizon glow (was 0.8)
    }
    // §PHOTO_SUN_REFLECTION fix 2: keep the lensflare's own brightness independent of the
    // photoshoot's exposure cut (see comment above PHOTO_SUN_ELEVATION).
    if (A._lensflare) {
      _photoFlarePrevTone = A._lensflare.material.toneMapped;
      A._lensflare.material.toneMapped = false;
      A._lensflare.material.needsUpdate = true;
      if (A._lensflare.userData._halo) {
        _photoHaloPrevTone = A._lensflare.userData._halo.material.toneMapped;
        A._lensflare.userData._halo.material.toneMapped = false;
        A._lensflare.userData._halo.material.needsUpdate = true;
      }
    }
    // §PHOTO_SUN_REFLECTION fix 3: boost existing per-material envMapIntensity — stronger
    // glass/metal glint, same free PBR mechanism, no new shader work. Re-asserted every
    // accumulation frame (see _reassertPhotoMatBoost) so streamed-in materials aren't missed.
    _photoEnvBoostedMats = [];
    _photoMatBoostActive = true;
    _reassertPhotoMatBoost();
    _enablePhotoShadows();  // called AFTER updateSky — see note in _enablePhotoShadows
    _photoNightWasOn = !!A._nightMode;
    if (!_photoNightWasOn && A.toggleNightMode) {
      A.toggleNightMode();  // amber fixture glow (synthetic fallback) + window glow
      if (A._nightSaved) {  // undo the moonlight override, but land on a deliberate warm evening
                             // tint (§PHOTO_WARM_SUN) instead of plain neutral-daytime restore
        A.sun.intensity = A._nightSaved.sunI * PHOTO_SUN_INTENSITY_SCALE;
        A.sun.color.setHex(PHOTO_SUN_COLOR);
        // §PHOTO_HEMI_FILL: boosted above the daytime baseline (not just restored to it) — see
        // comment above PHOTO_HEMI_INTENSITY_SCALE for why the ground needs this specifically.
        A.ambient.intensity = A._nightSaved.ambI * PHOTO_AMBIENT_INTENSITY_SCALE;
        A.ambient.color.setHex(PHOTO_AMBIENT_COLOR);
        A.hemi.intensity = A._nightSaved.hemiI * PHOTO_HEMI_INTENSITY_SCALE;
        A.hemi.color.setHex(PHOTO_HEMI_SKY_COLOR);
        A.renderer.toneMappingExposure = A._nightSaved.exposure * PHOTO_EXPOSURE_SCALE;
      }
    }
    // §PHOTO_FOG_ORDER_FIX (2026-07-16, RESUME BRIEF ADDENDUM item 2 — "sky/ground darkness, one
    // root cause?"): confirmed YES, one root cause, and it's a real bug, not just physical dusk
    // dimness. TWO things clobber the warm §PHOTO_FOG color if it's applied any earlier in this
    // function: (1) A.updateSky() (scene.js) sets scene.fog.color itself from a dim elevation-
    // derived blend ("dayT" — at PHOTO_SUN_ELEVATION's low dusk angle, dayT≈0.3, giving a dim
    // blue-grey); (2) A.toggleNightMode() (tools.js §S277c), called just above for its amber-glow
    // mechanism, ALSO sets fog to a near-black moonlight blue as its own side effect — the same
    // side effect this block already undoes for sun/ambient/hemi/exposure ("undo the moonlight
    // override, land on a deliberate warm evening tint") just never included fog. Both run BEFORE
    // this point, so applying the warm override HERE (after both) is the one place it actually
    // sticks — confirmed the fog the user saw was neither dim-blend nor moonlight-blue-corrected,
    // it was whichever of the two ran last. Since fog is the one shared medium touching both the
    // sky's tone and any distant ground pixel, this single clobber explains BOTH "sky too dark"
    // and "ground reflecting off that also" as ONE bug, not two.
    if (A.scene && A.scene.fog) {
      A.scene.fog.color.setHex(0xc9a878);
      A.scene.fog.density = Math.min(A.scene.fog.density, 0.00006);  // lighter haze, not a wall of fog
    }
    _showPhotoProps(true);
    console.log('§PHOTO_STAGING on nightWasOn=' + _photoNightWasOn);
  }
  function _teardownPhotoStaging() {
    if (!_photoStagingOn) return;  // §PHOTO_DOUBLE_APPLY_GUARD: nothing staged, nothing to revert
    _photoStagingOn = false;
    A._photoStagingOn = false;
    // §LAYER2_HDRI: restore the procedural envMap — the real HDRI is still cached for next time,
    // only the active pointer reverts (normal navigation keeps its existing sky-derived look).
    if (_photoEnvMapSaved !== null) { A._envMap = _photoEnvMapSaved; _photoEnvMapSaved = null; }
    if (!_photoNightWasOn && A.toggleNightMode) A.toggleNightMode();  // restores its own saved state
    if (!_photoSkyWasVisible && A._sky) A._sky.visible = false;
    if (A.sun && _photoSunPosSaved) {
      A.sun.position.copy(_photoSunPosSaved);
      A.sun.target.position.copy(_photoSunTargetSaved);
      A.sun.target.updateMatrixWorld();
      _photoSunPosSaved = null; _photoSunTargetSaved = null;
    }
    if (A._lensflare) {
      A._lensflare.material.toneMapped = _photoFlarePrevTone;
      A._lensflare.material.needsUpdate = true;
      if (A._lensflare.userData._halo) {
        A._lensflare.userData._halo.material.toneMapped = _photoHaloPrevTone;
        A._lensflare.userData._halo.material.needsUpdate = true;
      }
    }
    _photoMatBoostActive = false;
    _photoEnvBoostedMats.forEach(function(m) {
      m.envMapIntensity = m.userData._photoOrigEnvMapIntensity;
      delete m.userData._photoOrigEnvMapIntensity;
      if (m.userData._photoOrigRoughness !== undefined) {
        m.roughness = m.userData._photoOrigRoughness;
        delete m.userData._photoOrigRoughness;
      }
      delete m.userData._photoBoosted;
      m.needsUpdate = true;
    });
    _photoEnvBoostedMats = [];
    _disablePhotoShadows();
    if (A.ground && A._applyGroundTexture) {
      A._applyGroundTexture(_photoGroundPrevKey);  // null → clears map, restores flat color
      if (_photoGroundPrevColor != null && A._setGroundColor) A._setGroundColor(_photoGroundPrevColor);
      A.ground.visible = _photoGroundWasVisible;
    }
    if (A.scene && A.scene.fog && _photoFogColorSaved != null) {
      A.scene.fog.color.setHex(_photoFogColorSaved);
      A.scene.fog.density = _photoFogDensitySaved;
      _photoFogColorSaved = null; _photoFogDensitySaved = null;
    }
    if (A._sky && _photoSkyUniSaved) {
      var _su2 = A._sky.material.uniforms;
      _su2['turbidity'].value = _photoSkyUniSaved.turbidity;
      _su2['rayleigh'].value = _photoSkyUniSaved.rayleigh;
      _su2['mieCoefficient'].value = _photoSkyUniSaved.mieCoefficient;
      _su2['mieDirectionalG'].value = _photoSkyUniSaved.mieDirectionalG;
      _photoSkyUniSaved = null;
    }
    _showPhotoProps(false);
    console.log('§PHOTO_STAGING off');
  }
  // §STILL_REFINE_FREEZE (2026-07-15, user-observed): on a real GPU, 16 samples finish in
  // ~150ms — reverting composer/textures/sky the instant accumulation naturally completes made
  // the whole effect flash past almost invisibly, nothing like how Night/Shadow mode normally
  // stay on until you explicitly turn them off. Natural completion now only stops the RAF
  // stepping loop and logs the timing — composer/triplanar/photo-staging all stay exactly as
  // accumulated (the finished still stays frozen on screen) until a REAL interaction fires
  // A.stopStillRefine() (main.js's pointerdown/wheel/controls-start hooks). Only that path does
  // the full revert.
  function _finishStillRefine(idx) {
    if (_stillRefineRAF) { cancelAnimationFrame(_stillRefineRAF); _stillRefineRAF = null; }
    var ms = _stillRefineStartMs ? Math.round(performance.now() - _stillRefineStartMs) : 0;
    console.log('§STILL_REFINE done accumulateIndex=' + idx + ' elapsedMs=' + ms + ' (frozen — stays until interaction)');
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
  // §PHOTO_AO_TUNE (2026-07-16, real-GPU A/B at STILL quality — PHOTO_AO_TUNE_r{8_i6,5_i4,3_i4,
  // 1p5_i3}_2026-07-16.png, identical frozen pose/beauty, only AO varied): radius=8/intensity=6
  // KEPT. The review's earlier "broad mottle / reads busy" verdict was measured over LIVE
  // navigation, where every frame resets the AO accumulation (markDirty→firstFrame) and shows raw
  // single-frame noise — at still quality the accumulation fully converges (24+ frames, frozen
  // camera) and the same radius reads as clean depth: courtyard corners, roof openings, skyline
  // masses, base contact. Smaller radii (3/1.5) are near-invisible at whole-building establishing
  // distance — consistent with §GI_POC_RADIUS_TEST's original sub-pixel finding. Perf at still:
  // r8 ≈ 30ms/frame, r3 ≈ 6.5ms/frame (RTX 4060, 1280x800) — both trivial for a one-shot still.
  var STILL_AO_RADIUS = 8;
  var STILL_AO_INTENSITY = 6;
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
      n8.configuration.autoRenderBeauty = false;  // beauty = the frozen TAA image, injected by the adapter
      n8.autoDetectTransparency = false;          // transparency machinery only works with autoRenderBeauty;
                                                  // left on it would feed EMPTY transparency targets to the
                                                  // compositer the first frame a transparent material streams in
      n8.configuration.gammaCorrection = false;   // OutputPass tone-maps after this pass — stay linear
      n8.configuration.accumulate = true;         // camera is frozen during the AO phase — refine, don't flicker
      n8.configuration.aoRadius = STILL_AO_RADIUS;
      n8.configuration.intensity = STILL_AO_INTENSITY;
      n8.configuration.aoSamples = 8;
      n8.configuration.denoiseSamples = 4;
      n8.configuration.denoiseRadius = 6;
      n8.configuration.halfRes = false;           // still-frame quality
      n8.renderToScreen = false;
      var copyMat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(copyMod.CopyShader.uniforms),
        vertexShader: copyMod.CopyShader.vertexShader,
        fragmentShader: copyMod.CopyShader.fragmentShader,
        depthTest: false, depthWrite: false, blending: THREE.NoBlending
      });
      var copyQuad = new passMod.FullScreenQuad(copyMat);
      var adapter = {
        enabled: false,        // §PHOTO_AO_GATE: disabled = EffectComposer skips it entirely — the
                               // zero-cost-when-off discipline everything else in this file follows
        needsSwap: true, clear: false, renderToScreen: false,
        setSize: function(w, h) { n8.setSize(w, h); _stillAODepthDirty = true; },
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
          n8.render(renderer2, writeBuffer, readBuffer);
        }
      };
      A._composer.insertPass(adapter, 1);  // directly after the TAA pass, before (disabled) SSAO/Outline + OutputPass
      A._stillAOPass = n8;                 // diagnostics/tests — closure state is otherwise invisible
      A._stillAOAdapter = adapter;
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
    if (A._stillAOAdapter && A._stillAOAdapter.enabled) {
      A._stillAOAdapter.enabled = false;
      console.log('§PHOTO_AO off (' + reason + ') — pass disabled, zero cost during normal nav');
    }
  }
  function _startStillAOPhase() {
    if (!STILL_AO_ENABLED || !A._composer) return;
    var t0 = performance.now();
    _ensureStillAO().then(function(ao) {
      if (!ao) return;
      // the world may have moved on during the async import — only fold AO into a still that is
      // still frozen, and never fight the GI composer or the cinema loop for the canvas
      if (!A._stillRefineActive || _stillRefineRAF || A._giComposerActive || _cinemaActive) return;
      _stillAODepthDirty = true;
      ao.pass.firstFrame();
      ao.adapter.enabled = true;
      var sig = _camSig(), f = 0, renderMs = 0;
      console.log('§PHOTO_AO start frames=' + STILL_AO_FRAMES + ' radius=' + STILL_AO_RADIUS +
        ' intensity=' + STILL_AO_INTENSITY + ' (still-only fold — Alt+G untouched)');
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
        if (f >= STILL_AO_FRAMES) {
          console.log('§PHOTO_AO done frames=' + f + ' totalMs=' + Math.round(performance.now() - t0) +
            ' avgRenderMs=' + (renderMs / f).toFixed(1) + ' (frozen with AO — stays until interaction)');
          return;
        }
        _stillAORAF = requestAnimationFrame(stepAO);
      })();
    });
  }
  function _teardownStillRefine(reason, keepStaging) {
    A._stillRefineActive = false;
    if (_stillRefineRAF) { cancelAnimationFrame(_stillRefineRAF); _stillRefineRAF = null; }
    if (A._taaPass) { A._taaPass.accumulate = false; A._taaPass.accumulateIndex = -1; }
    _stopStillAOPhase(reason);  // §PHOTO_AO: disable the still-only AO pass on ANY exit path
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
    var n = _setTriplanarActive(false);
    // §STAGE1_ORBIT_PERSIST (2026-07-16, user spec — "auto stage: #1 when orbiting, #2 when
    // static"): a pure camera-move cancel (orbit-drag-start, wheel-zoom) should drop the crisp
    // TAA-supersample polish (that part is a structural requirement of TAA — see the conversation
    // this session on why it can't survive continuous motion) WITHOUT reverting the mood staging
    // (dusk sky/ground/shadows) — the user explicitly wants staging to persist through navigation,
    // only breaking on an actual selection. `keepStaging` lets the camera-move callers opt out of
    // `_teardownPhotoStaging()` while selection/explicit-Alt+S-off callers still get the full
    // revert unchanged.
    if (!keepStaging) _teardownPhotoStaging();
    var ms = _stillRefineStartMs ? Math.round(performance.now() - _stillRefineStartMs) : 0;
    console.log('§STILL_REFINE ' + reason + ' elapsedMs=' + ms + (keepStaging ? ' (staging kept)' : ''));
    if (n > 0) console.log('§TRIPLANAR_PERF ms=' + ms + ' materials=' + n);
  }
  A._getPhotoSparkles = function() { return _photoSparkles; };  // diagnostic accessors — closures
  A._getPhotoSkyline = function() { return _photoSkyline; };    // always read the CURRENT value
  A._reassertPhotoSparkles = _reassertPhotoSparkles;  // exposed for orbit/camera-driven test scripts —
                                                        // sparkle visibility is camera-position-dependent
                                                        // and the natural step() loop stops re-evaluating
                                                        // it once still-refine freezes.
  A.startStillRefine = function() {
    if (!A._composer || !A._taaPass || A._stillRefineActive) return;
    // §GI_EXCLUSION (review finding 5): the GI preview composer and this TAA composer both render
    // the canvas — Alt+S's own RAF renders A._composer while the main loop prefers _giComposer,
    // so both active at once fight over every frame. One at a time.
    if (A._giComposerActive && typeof A.toggleGIPreview === 'function') A.toggleGIPreview(false);
    A._stillRefineActive = true;
    A._composerEnabled = true;   // teardown RECOMPUTES from SSAO/Outline state (§GI_HANDOFF_GHOST_FIX) — no save needed
    A._taaPass.accumulate = true;
    A._taaPass.accumulateIndex = -1;
    _stillRefineStartMs = performance.now();
    // §STILL_REFINE_RESTART (2026-07-16, Task 3 — light-ghosting root causes (a) damping glide,
    // (b) grace-window-swallowed cancel, (c) Fly-mode programmatic motion): capture the pose
    // signature the accumulation starts from; step() below restarts the accumulation whenever the
    // pose changes mid-run. Event-driven cancels stay as the fast path — this is the mechanism-
    // level safety net beneath them: a frozen still can only ever be produced by a camera that
    // was genuinely still for the whole 16-sample run.
    _stillSig = _camSig();
    _stillRestartLogged = false;
    var _triCount = _setTriplanarActive(true);
    _applyPhotoStaging();
    console.log('§STILL_REFINE start samples=16 triplanarMaterials=' + _triCount);
    // §PHOTO_ENVMAP_STALE safety net: the fresh dusk env map is 2s-throttled (scene.js
    // A.updateSky), but a fast/cached accumulate can finish (and stop calling _reassertPhotoEnvMap
    // via step() below) before that 2s elapses — one extra guaranteed pass past the throttle
    // window, independent of whether the accumulate loop is still running.
    setTimeout(function() { if (A._stillRefineActive) _reassertPhotoEnvMap(); }, 2200);
    // §NIGHT_GLOW_REASSERT safety net: the per-frame reassert in step() below only runs while the
    // 16-sample accumulation RAF loop is active — that loop stops (by design, "freezes" the still)
    // long before a large building finishes streaming (confirmed this session: 20-30s+ under load,
    // far past the ~150ms-2s accumulation itself). A one-off extra pass (like envMap's above)
    // isn't enough on a slow-loading building — this repeats independently every 3s for up to a
    // minute, for as long as photo mode stays active (A._stillRefineActive, which per the
    // still-refine-freeze behavior stays true until a REAL interaction tears it down).
    (function() {
      var _tries = 0;
      var _glowInterval = setInterval(function() {
        _tries++;
        if (!A._stillRefineActive || _tries > 20) { clearInterval(_glowInterval); return; }
        _reassertPhotoGlow();
      }, 3000);
    })();
    function step() {
      if (!A._stillRefineActive) return;
      // §PHOTO_STREAMING_RACE: re-catch any mesh/material that streamed in AFTER the initial
      // push above (see comment block near _reassertPhotoShadowCoverage) — idempotent, cheap.
      _reassertPhotoShadowCoverage();
      _reassertPhotoMatBoost();
      _reassertPhotoEnvMap();
      _reassertPhotoSparkles();
      _reassertPhotoGlow();
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
      if (_sigNow !== _stillSig) {
        A._taaPass.accumulateIndex = -1;
        _stillSig = _sigNow;
        if (!_stillRestartLogged) {  // once per motion burst, not per frame
          console.log('§STILL_REFINE_RESTART cam-moved — accumulation restarted');
          _stillRestartLogged = true;
        }
      } else {
        _stillRestartLogged = false;
      }
      A._composer.render();
      var idx = A._taaPass.accumulateIndex;
      if (idx >= 16) { _finishStillRefine(idx); return; }
      _stillRefineRAF = requestAnimationFrame(step);
    }
    _stillRefineRAF = requestAnimationFrame(step);
  };
  // §STILL_REFINE_GRACE (2026-07-15, user-observed): pressing Alt+S can itself nudge the mouse
  // a hair (reaching for the shortcut), and cancellation is wired to real pointerdown/wheel/
  // controls-start signals — so the still-refine could self-cancel within the same gesture that
  // triggered it, making the effect nearly impossible to actually see. Absorb that incidental
  // nudge with a short grace window; a real subsequent interaction still cancels normally.
  var STILL_REFINE_GRACE_MS = 500;
  A.stopStillRefine = function(force) {
    if (!A._stillRefineActive) {
      // §STAGE2_DISARM (review finding 6): during soft-park a real selection/UI interaction must
      // kill the whole cycle AND revert the kept-alive staging — otherwise the dusk mood silently
      // outlives the photoshoot. §AUTO_STAGE2_DISABLED: with the idle timer permanently disarmed,
      // _autoStageOn is never true anymore — soft-park is now signalled by the kept-alive staging
      // itself (_photoStagingOn), so key the branch off that (the timer check kept for the day
      // the flag is re-enabled).
      if (_autoStageOn || _photoStagingOn) { _autoStageArm(false); _teardownStillRefine('cancelled (interaction during soft-park)'); }
      return;
    }
    if (!force && _stillRefineStartMs && (performance.now() - _stillRefineStartMs) < STILL_REFINE_GRACE_MS) return;
    _autoStageArm(false);  // explicit/selection-driven stop cancels the auto re-arm too
    _teardownStillRefine('cancelled (interaction)');
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
      _stillRefineStartMs = performance.now() - STILL_REFINE_GRACE_MS;
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
    if (_stillRefineRAF) {
      cancelAnimationFrame(_stillRefineRAF); _stillRefineRAF = null;
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
    if (_stillRefineStartMs && (performance.now() - _stillRefineStartMs) < STILL_REFINE_GRACE_MS) return;
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

  // §CINEMA_ORBIT (2026-07-16, user spec): the "Cinema pill" 360 fly-around, wired to a real
  // button this time (Palette panel), not just a test script. Camera strategy per the user's own
  // words: begin from wherever the camera already is ("so he can spawn his preferred line of
  // attack"), a slightly elliptical path, pivot stays at the real building bbox center.
  // §CINEMA_PUSHIN (2026-07-16, user spec — RESUME BRIEF ADDENDUM item 1 + same-day follow-up):
  // "cam must within 3 sec or so draw as near until main building fills whole screen frame, lat[er]
  // 5 sec can draw out. Ignore any non ARC elements outside frame. Solves LTU too far." Two changes
  // from the original ease-only arc:
  //  1. A genuine PUSH-IN beat (not just "correct if outside band"): radius eases from the start
  //     position toward a computed FILL-FRAME distance — the distance at which the building's own
  //     bounding sphere just touches the tighter of the camera's horizontal/vertical FOV, real
  //     perspective-camera trigonometry (R / tan(halfFOV)), not a guessed constant — within the
  //     first CINEMA_PUSHIN_SEC. Never pushes OUTWARD (clamped to min(startRadius, fillDistance)) —
  //     an already-close start is left alone. Brief hold, then eases back out toward the normal
  //     orbit band for the main body + the existing wide pull-back flourish at the very end.
  //  2. Both the fill-frame bounding sphere AND the orbit band are now computed from the ARC-
  //     DISCIPLINE-ONLY bbox (_buildingBBoxArc), not the whole-building bbox — LTU's scattered
  //     non-ARC exterior MEP piping was inflating the envelope and keeping the camera parked too
  //     far to ever genuinely fill the frame. General to any building (falls back to the whole
  //     bbox if a building has zero ARC-tagged rows), nothing hardcoded to LTU specifically.
  var CINEMA_N_FRAMES = 360, CINEMA_FPS = 15;      // 24s
  var CINEMA_PULLBACK_START = 0.80, CINEMA_PULLBACK_SCALE = 1.4;
  var CINEMA_ELLIPTICITY = 0.15;
  var CINEMA_TILT_MIN_DEG = 8, CINEMA_TILT_MAX_DEG = 45;
  var CINEMA_RADIUS_MIN_FACTOR = 0.9, CINEMA_RADIUS_MAX_FACTOR = 2.5;  // x ARC envelope
  var CINEMA_PUSHIN_SEC = 3, CINEMA_HOLD_SEC = 5, CINEMA_BAND_EASE_SEC = 3;
  var CINEMA_FILL_MARGIN = 1.0;  // no padding — loose-axis trig alone already gives "almost full screen"
  // §CINEMA_SWOOP (2026-07-16, user ask: "camera angle has to be at building level to give best
  // effect... make the camera path passing in front of that reflection at building mid angle at
  // least once"): the reflection reads best with the sun roughly BEHIND the camera (the same
  // condition `_reassertPhotoSparkles`'s half-vector test and the envMapIntensity glint boost both
  // key off) — that happens when the camera's AZIMUTH around the target matches the sun's azimuth.
  // A full 360° sweep crosses that azimuth exactly once, guaranteed, regardless of building/sun
  // angle — general, nothing hardcoded. Dip the tilt toward eye/building level in a smooth window
  // around that one crossing, layered on top of whatever the push-in/band/pull-back phase above
  // already computed, so the orbit is guaranteed to pass low and facing the glint at least once.
  var CINEMA_SWOOP_HALF_SEC = 2.0, CINEMA_SWOOP_TILT_DEG = 4;
  var _cinemaActive = false;
  function _cinemaSmoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  A.startCinemaOrbit = function() {
    if (_cinemaActive || A._stillRefineActive || !A.camera || !A.controls || !A.renderer) return;
    if (!A.renderer.domElement.captureStream || typeof MediaRecorder === 'undefined') {
      console.warn('§CINEMA_FAIL captureStream/MediaRecorder unsupported in this browser');
      return;
    }
    // §PHOTO_VARIATION: lock whichever random paint/puddle variation is currently on screen —
    // "once user agrees, press cinema icon, it takes that persisted cache" — so the capture
    // doesn't re-roll mid-recording, and stays locked for the rest of the session.
    _photoVariationLocked = true;
    var arcBboxRaw = _buildingBBoxArc();
    var arcBbox = arcBboxRaw || _buildingBBoxIfc();
    var envelope = arcBbox ? Math.max(arcBbox.xMax - arcBbox.xMin, arcBbox.yMax - arcBbox.yMin, 50) : 100;
    var boundingRadius = arcBbox
      ? 0.5 * Math.hypot(arcBbox.xMax - arcBbox.xMin, arcBbox.yMax - arcBbox.yMin, arcBbox.zMax - arcBbox.zMin)
      : envelope * 0.6;
    var radiusMin = envelope * CINEMA_RADIUS_MIN_FACTOR, radiusMax = envelope * CINEMA_RADIUS_MAX_FACTOR;
    var tiltMin = CINEMA_TILT_MIN_DEG * Math.PI / 180, tiltMax = CINEMA_TILT_MAX_DEG * Math.PI / 180;
    var tgt = A.controls.target;
    var dx0 = A.camera.position.x - tgt.x, dy0 = A.camera.position.y - tgt.y, dz0 = A.camera.position.z - tgt.z;
    var horizR0 = Math.hypot(dx0, dz0);
    var base = {
      tx: tgt.x, ty: tgt.y, tz: tgt.z,
      startRadius: Math.hypot(dx0, dy0, dz0),
      startTilt: Math.atan2(dy0, horizR0),
      startAzimuth: Math.atan2(dz0, dx0)
    };
    var targetTilt = Math.max(tiltMin, Math.min(tiltMax, base.startTilt));
    var targetRadius = Math.max(radiusMin, Math.min(radiusMax, base.startRadius));

    // Fill-frame distance: real perspective-camera trigonometry, not a guessed constant. Per user
    // spec ("ensure it fills almost full screen... some edges may even momentarily be out of
    // frame"), bias to the LOOSER of the vertical/horizontal half-FOV (the wider-angle axis) —
    // this pulls the camera closer than "fit both axes fully," deliberately letting the tighter
    // axis's edges brush past frame at the closest point, in exchange for a genuinely full-screen
    // subject rather than a comfortably-contained one.
    var vFovRad = THREE.MathUtils.degToRad(A.camera.fov || 50);
    var aspect = A.camera.aspect || (window.innerWidth / Math.max(1, window.innerHeight));
    var hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
    var looseTan = Math.max(Math.tan(vFovRad / 2), Math.tan(hFovRad / 2));
    var fillDistance = (boundingRadius / Math.max(looseTan, 1e-3)) * CINEMA_FILL_MARGIN;
    var pushInRadius = Math.min(base.startRadius, fillDistance);  // only ever draws NEARER, never out

    var durationSec = CINEMA_N_FRAMES / CINEMA_FPS;
    var pushInEndT = Math.min(0.4, CINEMA_PUSHIN_SEC / durationSec);
    var holdEndT = Math.min(0.55, CINEMA_HOLD_SEC / durationSec);
    var bandEaseEndT = Math.min(0.7, holdEndT + CINEMA_BAND_EASE_SEC / durationSec);

    // Sun-behind-camera azimuth crossing — the one guaranteed "best reflection" moment in the loop.
    var sunAzimuth = A.sun ? Math.atan2(A.sun.position.z - base.tz, A.sun.position.x - base.tx) : base.startAzimuth;
    var swoopTNorm = (((sunAzimuth - base.startAzimuth) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
    var swoopHalfT = CINEMA_SWOOP_HALF_SEC / durationSec;
    var swoopTiltRad = THREE.MathUtils.degToRad(CINEMA_SWOOP_TILT_DEG);
    console.log('§CINEMA_SWOOP tNorm=' + swoopTNorm.toFixed(3) + ' (~' + (swoopTNorm * durationSec).toFixed(1) + 's)');

    _cinemaActive = true;
    // Reuse the exact still-refine staging setup (ground/shadow/sky/sun/fog/addons/sparkle), minus
    // its own TAA-accumulate rAF loop — this function drives its own render loop for the moving
    // camera (accumulating supersamples across motion would just blur/ghost, not help).
    A._stillRefineActive = true;
    A._composerEnabled = true;   // teardown recomputes from SSAO/Outline state (§GI_HANDOFF_GHOST_FIX)
    if (A._taaPass) { A._taaPass.accumulate = false; A._taaPass.accumulateIndex = -1; }
    _stillRefineStartMs = performance.now();
    var _triCount = _setTriplanarActive(true);
    _applyPhotoStaging();
    console.log('§CINEMA_ORBIT start envelope=' + envelope.toFixed(1) + ' arcOnly=' + !!arcBboxRaw +
      ' fillDistance=' + fillDistance.toFixed(1) + ' pushInRadius=' + pushInRadius.toFixed(1) +
      ' radiusBand=[' + radiusMin.toFixed(1) + ',' + radiusMax.toFixed(1) + '] triplanarMaterials=' + _triCount);

    // §GI_CINEMA_PRESET (2026-07-16, Task 2): N8AO at full-res costs ~317ms/frame on a RTX 4060
    // (measured) — a recording with GI active would be a ~3fps slideshow. While the recording
    // runs WITH GI on, drop N8AO to halfRes + reduced samples/denoise (the recording is motion —
    // per-frame AO fidelity reads far less than in a still), restore the exact prior values when
    // the recording stops. No GI active = nothing saved, nothing touched.
    var _giCinemaSaved = null;
    function _giCinemaPresetRestore() {
      if (!_giCinemaSaved || !A._giN8aoPass) return;
      var cfg = A._giN8aoPass.configuration;
      cfg.halfRes = _giCinemaSaved.halfRes; cfg.aoSamples = _giCinemaSaved.aoSamples;
      cfg.denoiseSamples = _giCinemaSaved.denoiseSamples; cfg.denoiseRadius = _giCinemaSaved.denoiseRadius;
      _giCinemaSaved = null;
      if (typeof A._giN8aoPass.firstFrame === 'function') A._giN8aoPass.firstFrame();
      console.log('§GI_CINEMA_PRESET off (restored halfRes=' + cfg.halfRes + ' aoSamples=' + cfg.aoSamples +
        ' denoiseSamples=' + cfg.denoiseSamples + ' denoiseRadius=' + cfg.denoiseRadius + ')');
    }
    if (A._giComposerActive && A._giN8aoPass) {
      var _giCfg = A._giN8aoPass.configuration;
      _giCinemaSaved = { halfRes: _giCfg.halfRes, aoSamples: _giCfg.aoSamples,
                         denoiseSamples: _giCfg.denoiseSamples, denoiseRadius: _giCfg.denoiseRadius };
      _giCfg.halfRes = true; _giCfg.aoSamples = 4; _giCfg.denoiseSamples = 2; _giCfg.denoiseRadius = 3;
      if (typeof A._giN8aoPass.firstFrame === 'function') A._giN8aoPass.firstFrame();
      console.log('§GI_CINEMA_PRESET on halfRes=true aoSamples=4 denoiseSamples=2 denoiseRadius=3');
    }
    var stream = A.renderer.domElement.captureStream(CINEMA_FPS);
    var chunks = [];
    var mimeType = (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))
      ? 'video/webm;codecs=vp9' : 'video/webm';
    var recorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mimeType }); }
    catch (e) { console.warn('§CINEMA_FAIL MediaRecorder ctor: ' + e.message); _teardownStillRefine('cinema-fail'); _cinemaActive = false; return; }
    recorder.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function() {
      var blob = new Blob(chunks, { type: mimeType });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'BIM_Cinema_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.webm';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
      console.log('§CINEMA_ORBIT saved size=' + blob.size + ' type=' + mimeType);
      _giCinemaPresetRestore();  // §GI_CINEMA_PRESET: recording over — full-quality GI settings back
      _teardownStillRefine('cinema-orbit-done');
      _cinemaActive = false;
    };
    recorder.start();

    var startMs = performance.now();
    var durationMs = (CINEMA_N_FRAMES / CINEMA_FPS) * 1000;
    var _cinePerfN = 0, _cinePerfMs = 0, _cinePrevFrameMs = 0;  // §CINEMA_PERF frame-time telemetry
    function step() {
      if (!_cinemaActive) { _giCinemaPresetRestore(); return; }  // early abort (stopCinemaOrbit) — restore GI too
      var tNorm = Math.min(1, (performance.now() - startMs) / durationMs);
      var azimuth = base.startAzimuth + tNorm * Math.PI * 2;
      // §CINEMA_PUSHIN phases: push in to fill-frame (radius only, tilt held at the user's own
      // starting line of attack) → brief hold → ease back out to the normal orbit band (radius +
      // tilt together) → hold in band through the main body → existing wide pull-back flourish.
      var radius, tilt;
      if (tNorm <= pushInEndT) {
        var eIn = _cinemaSmoothstep(pushInEndT > 0 ? tNorm / pushInEndT : 1);
        radius = base.startRadius + (pushInRadius - base.startRadius) * eIn;
        tilt = base.startTilt;
      } else if (tNorm <= holdEndT) {
        radius = pushInRadius;
        tilt = base.startTilt;
      } else if (tNorm <= bandEaseEndT) {
        var span = bandEaseEndT - holdEndT;
        var eOut = _cinemaSmoothstep(span > 0 ? (tNorm - holdEndT) / span : 1);
        radius = pushInRadius + (targetRadius - pushInRadius) * eOut;
        tilt = base.startTilt + (targetTilt - base.startTilt) * eOut;
      } else {
        radius = targetRadius;
        tilt = targetTilt;
      }
      // §CINEMA_SWOOP: dip toward building-level tilt in a smooth window around the one
      // guaranteed sun-behind-camera crossing, layered on top of whichever phase is active above.
      var swoopDelta = Math.abs(tNorm - swoopTNorm);
      swoopDelta = Math.min(swoopDelta, 1 - swoopDelta);  // wrap-around near tNorm=0/1
      if (swoopHalfT > 0 && swoopDelta < swoopHalfT) {
        var swoopW = 1 - _cinemaSmoothstep(swoopDelta / swoopHalfT);  // 1 at crossing, 0 at window edge
        tilt = tilt + (swoopTiltRad - tilt) * swoopW;
      }
      radius *= 1 + CINEMA_ELLIPTICITY * Math.cos(2 * (azimuth - base.startAzimuth));
      if (tNorm > CINEMA_PULLBACK_START) {
        var p = (tNorm - CINEMA_PULLBACK_START) / (1 - CINEMA_PULLBACK_START);
        radius *= 1 + (CINEMA_PULLBACK_SCALE - 1) * p;
      }
      var horizR = radius * Math.cos(tilt), dy = radius * Math.sin(tilt);
      A.camera.position.set(base.tx + horizR * Math.cos(azimuth), base.ty + dy, base.tz + horizR * Math.sin(azimuth));
      A.controls.target.set(base.tx, base.ty, base.tz);
      A.controls.update();
      _reassertPhotoShadowCoverage();
      _reassertPhotoMatBoost();
      _reassertPhotoEnvMap();
      _reassertPhotoSparkles();
      _reassertPhotoGlow();
      // §GI_CINEMA_PRESET: when GI is active, the GI composer is what the user is seeing (main
      // loop prefers it) — render THAT for the recording; rendering A._composer here as well
      // would have the two composers alternating on the canvas mid-recording (flicker).
      if (A._giComposerActive && A._giComposer) A._giComposer.render();
      else if (A._composer) A._composer.render();
      // §CINEMA_PERF: real frame-time telemetry, logged every 75 frames — the whole point of the
      // preset is recording smoothness, so measure it where it happens, not in a synthetic bench.
      var _nowMs = performance.now();
      if (_cinePrevFrameMs) {
        _cinePerfN++; _cinePerfMs += _nowMs - _cinePrevFrameMs;
        if (_cinePerfN % 75 === 0) {
          console.log('§CINEMA_PERF frames=' + _cinePerfN + ' avgFrameMs=' + (_cinePerfMs / _cinePerfN).toFixed(1) +
            ' gi=' + !!A._giComposerActive + ' preset=' + !!_giCinemaSaved);
        }
      }
      _cinePrevFrameMs = _nowMs;
      if (tNorm >= 1) { recorder.stop(); return; }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };
  A.stopCinemaOrbit = function() { _cinemaActive = false; };  // early-abort hook, e.g. a Stop button

  // §STILL_REFINE cancellation lives in main.js, on the actual pointerdown/wheel/controls-start
  // signals — NOT here on markDirty. Confirmed live (2026-07-15, real user) that markDirty fires
  // from far more than "user touched the canvas" (e.g. the history bar's own event-sniffer
  // refreshing itself right after logging the very Alt+S keypress that started the refine),
  // which self-cancelled the refine within the same keypress. Precise interaction signals only.
}
