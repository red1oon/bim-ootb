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
    spr.userData.staffageFile = entry.file;      // §STAFFAGE_PERSIST: identifies the pose/asset on save
    spr.userData.staffageKind = isPerson ? 'people' : 'tree';
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
  // §STAFFAGE_SHUFFLE (user: "Alt-p uses somewhat random placing so user can experiment repeatedly"
  // — a fresh reload/press should be free to land differently, clash-avoidance is the only real
  // guardrail, not a fixed deterministic order). Fisher-Yates, in place. Shared by exterior
  // (_buildStaffage) and interior (_updateInFrameInterior) candidate selection.
  function _shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
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
  // §STAFFAGE_CLEARANCE (2026-07-20, user: "car and trees cannot appear in Terminal hall when not
  // sufficient open space of a big potting space to contain it" + "indoors should only be pax stand
  // and sit - not clashing with any prop ie not inside a mesh").
  //
  // ROOT CAUSE this replaces: nothing in the placement path ever measured the REAL space around a
  // candidate. Trees had one bbox-window test (`_ceilingOver`: a slab whose bottom sits 2-9m above
  // ground) — Terminal's concourse roof is far higher than 9m, so it sailed through and trees landed
  // in the hall. Cars had NO indoor test whatsoever. People had none either: the exterior pax loop
  // gated only on frustum/occlusion/dedup, so a silhouette-ring point that lands inside a concave
  // wing, or any §STAFFAGE_ZERO_RESCUE spot down the camera-forward ray while the camera is INSIDE
  // the building, put a figure straight through a wall/column. The occupancy grid (walk path only)
  // is bbox-derived and this file already records that bboxes lie (§STAFFAGE_GROUNDSNAP).
  //
  // These probes measure real RENDERED TRIANGLES via the BVH-accelerated raycaster (§BVH_INIT,
  // loader.js) — the same ground truth §STAFFAGE_GROUNDSNAP already trusts over bboxes. NOT the
  // `storey_walkable_raster` table: it ships as a patch for only 3 of 11 buildings and live logs
  // show `§HELPERS_QUERY_ERR no such table: storey_walkable_raster`, so it cannot carry a rule that
  // must hold on every building.
  var _clrRay = new THREE.Raycaster();
  // Real-geometry meshes only — staffage's own sprites/car meshes must never count as an obstruction
  // (and must never read as a "ceiling"). Collected once per press by the caller, not per candidate.
  function _solidMeshes() {
    if (!A.collectMeshes) return [];
    return A.collectMeshes(function(o) {
      return (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible &&
        o.userData.staffageKind === undefined &&
        !(o.parent && _photoStaffage && o.parent === _photoStaffage) &&
        !(A.sky && o === A.sky) && !(A.ground && o === A.ground) &&
        !_isGhostGeometry(o);
    });
  }
  // §BBOX_GHOST_RAYCAST_FILTER (2026-07-20, user: "when it accidentally turned to bbxes mode... it
  // does not check back to solid" — the merged-ghost/streaming-placeholder wireframe boxes could be
  // raycast against by clearance/cinema probes as if they were real walls). Every OTHER raycast
  // consumer already excludes `userData.isBboxPlaceholder` (picking.js, city.js, measure.js) — this
  // file never adopted that convention. The merged-ghost shell tags only its GROUP
  // (`group.userData._mergedGhost`, navigate_find.js `_buildMergedGhost`), not each per-discipline
  // InstancedMesh child, so check the immediate parent too (one level of nesting, verified against
  // the group-building code).
  function _isGhostGeometry(o) {
    return !!(o.userData && o.userData.isBboxPlaceholder) ||
      !!(o.parent && o.parent.userData && o.parent.userData._mergedGhost);
  }
  A._solidMeshes = _solidMeshes;   // exposed for the §BBOX_GHOST_RAYCAST_FILTER witness harness
  function _rayHitDist(meshes, origin, dir, far) {
    if (!meshes.length) return Infinity;
    _clrRay.set(origin, dir);
    _clrRay.far = far;
    var hits;
    try { hits = _clrRay.intersectObjects(meshes, false); } catch (e) { return Infinity; }
    for (var h = 0; h < hits.length; h++) { if (!hits[h].object.isSprite) return hits[h].distance; }
    return Infinity;
  }
  // Height of real geometry directly above a feet position. Infinity = open sky (outdoors, or a
  // genuine open courtyard/atrium void — those legitimately keep their trees). A finite value is the
  // real roof/slab height, at ANY height — this is what the old 2-9m bbox window could not see.
  var _CEIL_PROBE = 120;
  function _ceilingAbove(meshes, feetPos) {
    var o = new THREE.Vector3(feetPos.x, feetPos.y + 0.30, feetPos.z);
    var d = _rayHitDist(meshes, o, new THREE.Vector3(0, 1, 0), _CEIL_PROBE);
    return d === Infinity ? Infinity : d + 0.30;
  }
  // Smallest horizontal distance to real geometry around a feet position, probed at two heights so
  // both low obstructions (desks, ducts, planters) and full-height ones (walls, columns) are caught.
  // Returns `need` when nothing is within `need` (i.e. "at least this clear"), so callers compare
  // against their own required radius without paying for a longer probe than they need.
  // PERF: returns on the FIRST ray that violates `need` — a rejected candidate costs a few rays, not
  // all 32. Measured on Terminal (63k elements, 1377 meshes in scene): §PHOTO_STAFFAGE build_ms 3800
  // -> see the run log; the full fan is only ever paid by candidates that actually get placed (<=4
  // per press). The returned value is then "a" violating distance rather than the global minimum,
  // which is all any caller (and the §STAFFAGE_REJECT log) needs.
  var _CLR_DIRS = 16;
  function _clearRadius(meshes, feetPos, need, heights) {
    var hs = heights || [0.25, 1.20];
    var min = need;
    for (var hi = 0; hi < hs.length; hi++) {
      var o = new THREE.Vector3(feetPos.x, feetPos.y + hs[hi], feetPos.z);
      for (var a = 0; a < _CLR_DIRS; a++) {
        var th = (a / _CLR_DIRS) * Math.PI * 2;
        var d = _rayHitDist(meshes, o, new THREE.Vector3(Math.cos(th), 0, Math.sin(th)), need);
        if (d < min) return d;
      }
    }
    return min;
  }
  // §STAFFAGE_CLEARANCE thresholds — every one of these is a measured requirement of the thing being
  // placed, not a taste call:
  //   PERSON  0.45m — a standing adult's shoulder half-width. Geometry closer than this at ankle or
  //           torso height means the sprite is literally inside a mesh. This is defect (2)'s bar.
  //   TREE    needs OPEN SKY. A tree is an outdoor object; the only indoor case the user allowed is
  //           "a big potting space", and a real planting court is open to the sky — which this probe
  //           reports as Infinity, so courtyards/terraces keep their trees while the Terminal
  //           concourse (finite roof, however high) never gets one. Plus 2.5m canopy clearance.
  //   CAR     needs OPEN SKY — a car is NEVER inside a building (user ruling 2026-07-20: "Cars can
  //           never be in building"). The earlier ≤4.5m-ceiling car-park allowance is RETIRED: it was
  //           only ever proven on its rejection side (no test building had a real covered car park),
  //           and the user's rule is absolute. Same open-sky test as a tree, plus 2.5m body clearance.
  var _CLR_PERSON = 0.45, _CLR_TREE = 2.5, _CLR_CAR = 2.5;
  var _clrRej = {};
  function _clrReject(kind, reason, got, need) {
    _clrRej[kind + ':' + reason] = (_clrRej[kind + ':' + reason] || 0) + 1;
    if (_clrRej[kind + ':' + reason] <= 3) {
      console.log('§STAFFAGE_REJECT kind=' + kind + ' reason=' + reason +
        ' clearance=' + (got === Infinity ? 'sky' : got.toFixed(2) + 'm') + ' needed=' + need);
    }
  }
  // The one gate every placement site calls. `feetPos` is the FINAL world position the sprite/mesh
  // will occupy (feet-anchored — `spr.center.set(0.5,0)`, PR #898), so this tests what actually gets
  // rendered, never an approximation of it.
  function _spaceOK(meshes, kind, feetPos) {
    if (!meshes.length) return true;   // geometry not streamed yet — nothing to prove a clash against
    if (kind === 'pax') {
      var pc = _clearRadius(meshes, feetPos, _CLR_PERSON);
      if (pc < _CLR_PERSON) { _clrReject('pax', 'inside-mesh', pc, _CLR_PERSON + 'm'); return false; }
      return true;
    }
    var ceil = _ceilingAbove(meshes, feetPos);
    if (kind === 'tree') {
      if (ceil !== Infinity) { _clrReject('tree', 'indoor-no-sky', ceil, 'open sky'); return false; }
      var tc = _clearRadius(meshes, feetPos, _CLR_TREE);
      if (tc < _CLR_TREE) { _clrReject('tree', 'canopy-clearance', tc, _CLR_TREE + 'm'); return false; }
      return true;
    }
    if (kind === 'car') {
      if (ceil !== Infinity) { _clrReject('car', 'indoor', ceil, 'open sky'); return false; }
      var cc = _clearRadius(meshes, feetPos, _CLR_CAR);
      if (cc < _CLR_CAR) { _clrReject('car', 'body-clearance', cc, _CLR_CAR + 'm'); return false; }
      return true;
    }
    return true;
  }
  function _clrSummary(tag) {
    var parts = [];
    for (var k in _clrRej) parts.push(k + '=' + _clrRej[k]);
    console.log('§STAFFAGE_CLEAR_SUMMARY ' + tag + ' ' + (parts.length ? parts.join(' ') : 'none'));
    _clrRej = {};
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
    A._photoStaffageGroup = _photoStaffage;   // §STAFFAGE_CLEARANCE witness hook (read-only handle)
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
    // §RPC_M_PREFIX (2026-07-17, found via BimWhale_Advanced): some exports name RPC entourage
    // "M_RPC Male/Female" (metric-template prefix) instead of the bare "RPC Male/Female" seen in
    // Ifc4_Revit — same real content, different export convention (see streaming.js §ENTOURAGE for
    // the matching fix on the material side). Missing this made effects.js think BimWhale had NO
    // real people, so it staffed synthetic sprite-people on top of the real RPC entourage already
    // there — double population.
    var realPeople = _cnt("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcBuildingElementProxy' AND (element_name LIKE 'RPC Male%' OR element_name LIKE 'RPC Female%' OR element_name LIKE 'M_RPC Male%' OR element_name LIKE 'M_RPC Female%')");
    var realTrees = _cnt("SELECT COUNT(*) FROM elements_meta WHERE lower(element_name) LIKE '%tree%'");
    var realCars = _cnt("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcBuildingElementProxy' AND (element_name LIKE 'RPC Beetle%' OR element_name LIKE 'M_RPC Beetle%')");
    var placedP = 0, placedT = 0, placedC = 0, pSrc = 'none';
    _realPeopleExist = realPeople > 0;
    // §STAFFAGE_REAL_DEDUP spec S1: collect real entourage POSITIONS (same name patterns as the
    // counts above, joined to transforms) — the spatial replacement for the removed realX===0 gates.
    _realDedup = []; _rejReal = 0;
    function _collectReal(where, radius) {
      var rows = A.dbQuery("SELECT et.center_x, et.center_y, et.center_z FROM element_transforms et JOIN elements_meta em ON et.guid=em.guid WHERE et.center_x IS NOT NULL AND " + where) || [];
      for (var ri = 0; ri < rows.length; ri++) {
        // ifc2three returns a plain {x,y,z} — wrap in a real Vector3 so distanceTo works.
        var rp = A.ifc2three(rows[ri][0], rows[ri][1], rows[ri][2]);
        _realDedup.push([new THREE.Vector3(rp.x, rp.y, rp.z), radius]);
      }
    }
    if (realPeople) _collectReal("em.ifc_class='IfcBuildingElementProxy' AND (em.element_name LIKE 'RPC Male%' OR em.element_name LIKE 'RPC Female%' OR em.element_name LIKE 'M_RPC Male%' OR em.element_name LIKE 'M_RPC Female%')", 3);
    if (realTrees) _collectReal("lower(em.element_name) LIKE '%tree%'", 4);
    if (realCars) _collectReal("em.ifc_class='IfcBuildingElementProxy' AND (em.element_name LIKE 'RPC Beetle%' OR em.element_name LIKE 'M_RPC Beetle%')", 6);

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

    // §STAFFAGE_FRAME_FOCUSED (2026-07-18 redesign, user: "not populate outside building but focus on
    // where the frame is" + "first Alt-P need only one set... Alt-P again look for free space to do
    // so. Otherwise reducing pop"): every category below is gated on (a) a real candidate spot — same
    // geometry as before, real doors / the measured silhouette ring — AND (b) that spot being VISIBLE
    // in the CURRENT camera frame AND (c) not already covered by something already placed (this
    // function is now ADDITIVE — never clears) — AND capped small per press, so a first press reads
    // as "a few", not "everyone at once"; a later press just tops up whatever's still free/visible.
    var _v2 = new THREE.Vector3();
    // §STAFFAGE_FRAME_OCCLUSION (user: "trees say 3 all appear in scene not behind or obscured by
    // building"): frustum membership alone isn't "actually visible" — a candidate on the far side of
    // the building can still project into the camera's view cone while a wall sits between it and
    // the camera. Cast a ray from the camera to each candidate and reject it if any real building
    // mesh blocks the line of sight first. Collected ONCE per _buildStaffage() call (not per
    // candidate) — real-geometry meshes only, staffage itself excluded (nothing already placed
    // should block a new candidate).
    var _occRay = new THREE.Raycaster();
    var _occMeshes = A.collectMeshes(function(o) {
      return (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible &&
        o.userData.staffageKind === undefined && !(o.parent && o.parent === _photoStaffage);
    });
    // §STAFFAGE_REJECT_WITNESS (diagnosing "Terminal has bad results — 0 pax placed"): split WHY a
    // candidate was rejected — out of frustum vs occluded by real geometry — so a "0 placed" report
    // can be read from the log instead of guessed at. Reset per category by the caller.
    var _rejFrustum = 0, _rejOcclude = 0;
    // §STAFFAGE_CLEARANCE: real-geometry probe set for this press. Deliberately NOT _occMeshes —
    // that list keeps A.sky and A.ground, and an upward ceiling ray would hit the sky dome from
    // every outdoor spot, reporting "indoors" everywhere and rejecting every tree.
    var _solids = _solidMeshes();
    function _inFrame(threePos) {
      _v2.copy(threePos).project(A.camera);
      if (!(Math.abs(_v2.x) < 0.9 && Math.abs(_v2.y) < 0.95 && _v2.z > -1 && _v2.z < 1)) { _rejFrustum++; return false; }
      var camPos = A.camera.position, dist = camPos.distanceTo(threePos);
      if (dist < 0.5 || !_occMeshes.length) return true;   // too close to self-occlude meaningfully
      var dir = new THREE.Vector3().subVectors(threePos, camPos).normalize();
      _occRay.set(camPos, dir);
      _occRay.far = dist - 0.3;   // small epsilon so the candidate's own point doesn't self-reject
      var hits = _occRay.intersectObjects(_occMeshes, false);
      if (hits.length) { _rejOcclude++; return false; }
      return true;
    }
    function _nearExisting(threePos, minDist) {
      for (var ci = 0; ci < _photoStaffage.children.length; ci++) {
        if (_photoStaffage.children[ci].position.distanceTo(threePos) < minDist) return true;
      }
      return false;
    }
    // §STAFFAGE_ZERO_RESCUE (2026-07-19, STAFFAGE_WALKABLE_PLACEMENT.md spec S2 — user: "always
    // room to plant a tree or person or car"): if a kind is still 0 after the normal + wide-fallback
    // passes, walk the camera's ground-forward ray (near→far, small lateral jitter) and place
    // exactly 1 there. Prefer a spot passing the full frame+occlusion check; on total failure use
    // the farthest clash-free spot anyway — a press ending with any kind at 0 is the one forbidden
    // outcome this exists to kill.
    // §STAFFAGE_CLEARANCE amendment to spec S2 (2026-07-20): the rescue now carries the SAME space
    // gate as the normal pass, and its last-resort "place at the farthest clash-free spot anyway"
    // branch only ever considers spots that PASSED that gate. This deliberately supersedes S2's
    // "zero is the only forbidden outcome" for indoor framings — that rule was written for outdoor
    // presses, and it is exactly what put a tree and a car in the Terminal concourse: with the camera
    // inside, every ring candidate is occluded by the building's own wall, so the rescue walked the
    // camera-forward ray straight down the hall and force-placed there. Outdoors nothing changes:
    // the forward ray's spots pass the gate and the guarantee still holds.
    function _zeroRescue(kind, clashR, placeFn) {
      if (!A.camera || !A.modelOffset) return false;
      var fwd = new THREE.Vector3(); A.camera.getWorldDirection(fwd);
      fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
      var side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      var dists = [8, 12, 18, 25], lats = [0, -4, 4, -8, 8];
      var fallback = null;
      for (var di = 0; di < dists.length; di++) {
        for (var li = 0; li < lats.length; li++) {
          var p = new THREE.Vector3().copy(A.camera.position).addScaledVector(fwd, dists[di]).addScaledVector(side, lats[li]);
          var ifcX = p.x + A.modelOffset.x, ifcY = A.modelOffset.y - p.z;   // inverse of ifc2three's XY mapping
          var pos3 = A.ifc2three(ifcX, ifcY, groundZ); pos3.y = _floorThreeY(ifcX, ifcY, groundZ);
          if (_nearExisting(pos3, clashR) || _nearRealEntourage(pos3)) continue;
          if (!_spaceOK(_solids, kind, pos3)) continue;   // §STAFFAGE_CLEARANCE — never rescue into a mesh/hall
          fallback = [ifcX, ifcY];   // ends as the FARTHEST clash-free spot (near→far loop)
          if (!_inFrame(pos3)) continue;
          placeFn(ifcX, ifcY);
          console.log('§STAFFAGE_ZERO_RESCUE kind=' + kind + ' spot=(' + ifcX.toFixed(1) + ',' + ifcY.toFixed(1) + ')');
          return true;
        }
      }
      if (fallback) {
        placeFn(fallback[0], fallback[1]);
        console.log('§STAFFAGE_ZERO_RESCUE kind=' + kind + ' spot=(' + fallback[0].toFixed(1) + ',' + fallback[1].toFixed(1) + ') forced=1');
        return true;
      }
      console.log('§STAFFAGE_ZERO_RESCUE kind=' + kind + ' SKIPPED — no forward spot has the real space for it (see §STAFFAGE_REJECT)');
      return false;
    }
    // §STAFFAGE_FORMULA (user, verbatim: "4 trees, 1 car, 3 standing pax at each Alt-P... cap to
    // avoid clashing... may use up more open space between building and camera view as long in
    // frame... paint own scene... repeatedly adds on without clashing"). These are TARGETS, not
    // guarantees — clash/occlusion/frame checks are the only real limiter ("if can only squeeze in
    // a pax comfortably, then only 1 pax"). Car is no longer a one-time-only placement (latch
    // removed below) — it now follows the exact same additive/capped/random pattern as trees/pax.
    var PAX_CAP = 3, TREE_CAP = 4, CAR_CAP = 1, thisPressPax = 0, thisPressTrees = 0, thisPressCars = 0;

    // §STAFFAGE_REAL_DEDUP spec S1: was `if (realPeople === 0)` — wholesale suppression removed
    // (user: "always room to plant a tree or person or car"); real-overlap now rejected per-candidate.
    {
      // §STAFFAGE_SIT_OUTDOOR_GATE (user: "sitting pax cannot be outside building, only when there
      // are seats") — the exterior/entrance pool is STANDING ONLY: no role='sit' (never outdoors)
      // and no role='walk' either (user: "facade 1 set of standing" — walking figures belong to the
      // interior aisle path, not the entrance/facade).
      // §STAFFAGE_FACADE_FACING (user: "they should be camera facing - facade") — also restrict to
      // facing==='toward' (the face-on shot, reads as looking at the viewer) — the 'away'-facing
      // standing pose is shot from behind and would read as looking away from a facade-facing camera.
      var outsidePoses = _STAFFAGE_PEOPLE.filter(function(p) { return p.role === 'stand' && p.facing === 'toward'; });
      var doors = A.dbQuery("SELECT et.center_x, et.center_y, et.center_z, et.bbox_z, MAX(COALESCE(et.bbox_x,0), COALESCE(et.bbox_y,0)) FROM element_transforms et JOIN elements_meta em ON et.guid=em.guid WHERE em.ifc_class='IfcDoor' AND et.center_x IS NOT NULL") || [];
      var ext = [];
      for (var di = 0; di < doors.length; di++) {
        var dd = doors[di], dex = dd[0] - cx, dey = dd[1] - cy, dr = Math.hypot(dex, dey);
        if (dr >= silR(Math.atan2(dey, dex)) - 3.0) ext.push([dd[0], dd[1], dd[2], dd[3], dd[4] || 0.9]);
      }
      ext.sort(function(a, b) { return (a[2] - b[2]) || (b[4] - a[4]); });   // ground floor, then widest
      // §STAFFAGE_OPEN_SPACE (user: "may use up more open space between building and camera view as
      // long in frame") — multiple step-out distances per door/angle, not just one fixed 2.2m ring,
      // so there's real spatial variety to randomly draw from instead of always the same tight spot.
      var STEP_OUTS = [2.2, 4, 6.5, 9.5];
      var candSpots = [];   // [ifcX, ifcY, refZ]
      // §STAFFAGE_ABSTRACT_GENERALIZE (user: "its not able to be abstract... Terminal has bad
      // results" — root-caused via the new §STAFFAGE_PAX_REJECT witness: Terminal has 135 real
      // doors but only 2 pass the "beyond the measured silhouette" exterior test — silR()'s 96-bin
      // smoothed envelope doesn't track a highly irregular/non-convex footprint (many wings/gates)
      // closely enough, so real exterior doors in local recesses get misclassified as interior,
      // leaving too few candidates (8 total spots) for the occlusion/frustum/clash gates to work
      // with — easy to land on zero. Fix: ALWAYS also generate silhouette-ring candidates (the same
      // mechanism trees already use successfully, robust regardless of footprint complexity)
      // alongside door-anchored ones, instead of only falling back to the ring when zero doors
      // exist at all. Doors are still tried first/preferred (real entrances read better) but the
      // ring pool means a complex building is never starved down to a handful of spots.
      var gfExt = [];
      if (ext.length) {
        var gfz = ext[0][2];
        gfExt = ext.filter(function(e) { return e[2] <= gfz + 4; });   // ground-floor exterior doors
        for (var ei = 0; ei < gfExt.length; ei++) {
          var e = gfExt[ei], ol = Math.hypot(e[0] - cx, e[1] - cy) || 1;
          for (var so = 0; so < STEP_OUTS.length; so++) {
            var stepOut = STEP_OUTS[so];
            candSpots.push([e[0] + ((e[0] - cx) / ol) * stepOut, e[1] + ((e[1] - cy) / ol) * stepOut, e[2]]);
          }
        }
      }
      for (var k2 = 0; k2 < 12; k2++) {
        var pa = (k2 / 12) * Math.PI * 2 + 0.9;
        for (var so2 = 0; so2 < STEP_OUTS.length; so2++) {
          var prad = silR(pa) + 2.5 + STEP_OUTS[so2] - 2.2;
          candSpots.push([cx + Math.cos(pa) * prad, cy + Math.sin(pa) * prad, groundZ]);
        }
      }
      pSrc = gfExt.length ? 'entrance+silhouette' : 'silhouette';
      _shuffle(candSpots);
      var _paxTried = candSpots.length, _rejFBefore = _rejFrustum, _rejOBefore = _rejOcclude, _rejDedup = 0;
      for (var si2 = 0; si2 < candSpots.length && thisPressPax < PAX_CAP; si2++) {
        var sp = candSpots[si2], pos3 = A.ifc2three(sp[0], sp[1], sp[2]); pos3.y = _floorThreeY(sp[0], sp[1], sp[2]);
        var inF = _inFrame(pos3);
        if (!inF) continue;
        if (_nearExisting(pos3, 3)) { _rejDedup++; continue; }
        if (_nearRealEntourage(pos3)) continue;
        // §STAFFAGE_CLEARANCE defect (2): a silhouette-ring spot on a concave footprint (Terminal's
        // wings) sits INSIDE another part of the building — frustum+occlusion never noticed.
        if (!_spaceOK(_solids, 'pax', pos3)) continue;
        var pose = outsidePoses[placedP % outsidePoses.length];
        _placeAt(pose, sp[0], sp[1], sp[2], true);
        placedP++; thisPressPax++;
      }
      console.log('§STAFFAGE_PAX_REJECT tried=' + _paxTried + ' placed=' + thisPressPax + ' rejFrustum=' + (_rejFrustum - _rejFBefore) + ' rejOcclude=' + (_rejOcclude - _rejOBefore) + ' rejDedup=' + _rejDedup);
      if (!thisPressPax) {
        // §STAFFAGE_WIDE_FALLBACK (2026-07-18, user: "the 4/1/2 formula should apply any building"
        // — a real per-building asymmetry found on Terminal-class large/complex buildings: trees'
        // ring (radii 5-20m beyond the silhouette) can clear occlusion/frame where this block's
        // much tighter entrance/silhouette candidates (max ~12m) all fail, silently zeroing people
        // while trees still succeed. One more attempt at trees' same wider spread before accepting
        // zero for this press — not a data-quality fix (doesn't touch door queries or coordinates),
        // just gives every building the same fighting chance trees already have. Live-verified: a
        // moderate-pullback Terminal camera that zeroed people pre-fix now gets pSrc=wide-fallback.
        var wideRadii = [5, 9, 14, 20];
        var wideCand = [];
        for (var wk = 0; wk < 16; wk++) {
          var wpa = (wk / 16) * Math.PI * 2 + 0.4;
          for (var wr = 0; wr < wideRadii.length; wr++) {
            var wrad = silR(wpa) + wideRadii[wr];
            wideCand.push([cx + Math.cos(wpa) * wrad, cy + Math.sin(wpa) * wrad, groundZ]);
          }
        }
        _shuffle(wideCand);
        for (var wi = 0; wi < wideCand.length && thisPressPax < PAX_CAP; wi++) {
          var wsp = wideCand[wi], wpos3 = A.ifc2three(wsp[0], wsp[1], wsp[2]); wpos3.y = _floorThreeY(wsp[0], wsp[1], wsp[2]);
          if (!_inFrame(wpos3) || _nearExisting(wpos3, 3) || _nearRealEntourage(wpos3)) continue;
          if (!_spaceOK(_solids, 'pax', wpos3)) continue;   // §STAFFAGE_CLEARANCE
          var wpose = outsidePoses[placedP % outsidePoses.length];
          _placeAt(wpose, wsp[0], wsp[1], wsp[2], true);
          placedP++; thisPressPax++;
        }
        pSrc = thisPressPax ? 'wide-fallback' : 'none-in-frame';
      }
      if (!thisPressPax) {
        // §STAFFAGE_ZERO_RESCUE spec S2 — the press must not end with 0 pax.
        _zeroRescue('pax', 3, function(ix, iy) {
          var rpose = outsidePoses[placedP % outsidePoses.length];
          _placeAt(rpose, ix, iy, groundZ, true);
          placedP++; thisPressPax++;
        });
        if (thisPressPax) pSrc = 'zero-rescue';
      }
    }

    // Trees: same measured-silhouette ring as before, but only the ones actually IN the current
    // frame get placed, capped small — repeat presses (or looking a different direction) reveal more.
    // §STAFFAGE_REAL_DEDUP spec S1: was `if (realTrees === 0)` — removed (Hospital's 20 real trees
    // are on the Level-3 terrace; suppressing street trees for them left the kind at zero forever).
    {
      // §STAFFAGE_OPEN_SPACE cont.: more angle slots + a spread of radii beyond the silhouette (not
      // just one fixed ring), shuffled — gives real spatial variety to draw from each press.
      var TREE_RADII = [5, 9, 14, 20];
      var treeCand = [];
      for (var t = 0; t < 24; t++) {
        var ta = (t / 24) * Math.PI * 2 + Math.random() * 0.2;
        for (var tr = 0; tr < TREE_RADII.length; tr++) treeCand.push([ta, TREE_RADII[tr]]);
      }
      // §STAFFAGE_TREE_CEILING (user 2026-07-19: "when we alt-P sometimes a tree appears too
      // [inside]") — SUPERSEDED 2026-07-20 by §STAFFAGE_CLEARANCE's `_spaceOK(...,'tree',...)`.
      // The old test asked whether a SLAB BBOX with its bottom 2-9m above ground covered the spot.
      // That is exactly why trees still appeared in the Terminal hall (user: "car and trees cannot
      // appear in Terminal hall"): the concourse roof is far above 9m, so the window never matched,
      // and a bbox is blind to atrium holes anyway (this file's own §STAFFAGE_GROUNDSNAP lesson).
      // The replacement casts a real ray at the sky at any height, so "open courtyards/terraces keep
      // their trees" still holds — an open court returns Infinity — while any roofed space does not.
      var _treeCeilRejected = 0;
      _shuffle(treeCand);
      for (var ti = 0; ti < treeCand.length && thisPressTrees < TREE_CAP; ti++) {
        var ang = treeCand[ti][0], trad = silR(ang) + treeCand[ti][1];
        var tx = cx + Math.cos(ang) * trad, ty = cy + Math.sin(ang) * trad;
        var tpos = A.ifc2three(tx, ty, groundZ); tpos.y = _floorThreeY(tx, ty, groundZ);
        if (!_inFrame(tpos) || _nearExisting(tpos, 4) || _nearRealEntourage(tpos)) continue;
        if (!_spaceOK(_solids, 'tree', tpos)) { _treeCeilRejected++; continue; }
        _placeAt(_STAFFAGE_TREES[Math.floor(Math.random() * _STAFFAGE_TREES.length)], tx, ty, groundZ, false);
        placedT++; thisPressTrees++;
      }
      if (!thisPressTrees) {
        // §STAFFAGE_ZERO_RESCUE spec S2 — the press must not end with 0 trees.
        _zeroRescue('tree', 4, function(ix, iy) {
          _placeAt(_STAFFAGE_TREES[Math.floor(Math.random() * _STAFFAGE_TREES.length)], ix, iy, groundZ, false);
          placedT++; thisPressTrees++;
        });
      }
      if (_treeCeilRejected) console.log('§STAFFAGE_TREE_CEILING rejected=' + _treeCeilRejected + ' (indoor spots)');
    }
    // §STAFFAGE_CAR_MESH: place real car mesh(es) near ground-floor exterior doors when this
    // building has no real vehicle of its own — same real-data-first discipline as people/trees
    // above, just reusing the project's OWN real extracted geometry instead of a photo cutout. A
    // genuine THREE.Mesh (not a billboard), so it casts/receives real shadows like any other solid.
    // §STAFFAGE_FORMULA cont.: no longer a one-time-only placement — additive/capped/random exactly
    // like trees and pax (user: "1 car... at each Alt-P... repeatedly adds on without clashing").
    // §STAFFAGE_REAL_DEDUP spec S1: was `if (realCars === 0)` — removed, same reasoning as above.
    {
      var carDoors = A.dbQuery("SELECT et.center_x, et.center_y, et.center_z FROM element_transforms et JOIN elements_meta em ON et.guid=em.guid WHERE em.ifc_class='IfcDoor' AND et.center_x IS NOT NULL") || [];
      var carExt = [];
      for (var cdi = 0; cdi < carDoors.length; cdi++) {
        var cd = carDoors[cdi], cdx = cd[0] - cx, cdy = cd[1] - cy, cdr = Math.hypot(cdx, cdy);
        if (cdr >= silR(Math.atan2(cdy, cdx)) - 3.0) carExt.push(cd);
      }
      // §STAFFAGE_CAR_CLEARANCE (user: "should be another 2 meters away from wall") 5.5m->7.5m base,
      // plus the same open-space step-out spread used for pax/trees, shuffled for variety.
      var CAR_STEP_OUTS = [7.5, 10, 13];
      var carCand = [];   // [ifcX, ifcY, refZ, angle]
      if (carExt.length) {
        for (var cei = 0; cei < carExt.length; cei++) {
          var cSpot = carExt[cei], col = Math.hypot(cSpot[0] - cx, cSpot[1] - cy) || 1;
          var nrmX = (cSpot[0] - cx) / col, nrmY = (cSpot[1] - cy) / col;
          for (var cso = 0; cso < CAR_STEP_OUTS.length; cso++) {
            var so3 = CAR_STEP_OUTS[cso];
            // Stepped out further than entrance figures (a car needs more clearance) AND offset
            // sideways so it reads as parked near, not blocking, the doorway.
            carCand.push([cSpot[0] + nrmX * so3 + (-nrmY) * 3.0, cSpot[1] + nrmY * so3 + (nrmX) * 3.0, cSpot[2],
              Math.atan2(nrmX, nrmY)]);   // tangent to the radial-out direction — parked alongside, not nose-first
          }
        }
      } else {
        for (var cka = 0; cka < 8; cka++) {
          var pa2 = (cka / 8) * Math.PI * 2 + 0.6;
          for (var cso2 = 0; cso2 < CAR_STEP_OUTS.length; cso2++) {
            var prad2 = silR(pa2) + CAR_STEP_OUTS[cso2];
            carCand.push([cx + Math.cos(pa2) * prad2, cy + Math.sin(pa2) * prad2, groundZ, pa2]);
          }
        }
      }
      // §STAFFAGE_WIDE_FALLBACK (2026-07-18, extracted the placement body into a real function so
      // both the normal-radius attempt and the wide-radius fallback below can share it, instead of
      // duplicating this whole async block): cand = [ifcX, ifcY, refZ, angle].
      function _placeCarAt(cand) {
        var cx2 = cand[0], cy2 = cand[1], cz2 = cand[2], angle = cand[3];
        _loadCarGeometry().then(function(geo) {
          if (!geo || !_photoStaffage) return;
          // §STAFFAGE_CAR_MESH_CULL_FIX: DoubleSide — this mesh's winding order comes from an
          // external IFC extraction pipeline, not authored for three.js directly; FrontSide (the
          // default) silently back-face-culls the ENTIRE mesh if the winding is reversed, which is
          // exactly what was happening (confirmed live: mesh existed, visible=true, correct
          // material/position/boundingSphere, but never rendered on ANY building, ANY angle).
          // §STAFFAGE_CAR_MESH_ALTS_FIX (2026-07-18, user: "car shows up but has no Alt-S
          // effect"): this material was built standalone — never given an envMap (streaming.js's
          // own _getMaterial always sets envMap:A._envMap, envMapIntensity:0.6 on every normal
          // material, viewer/streaming.js:437) and never registered in A._matCache, so it was
          // invisible to BOTH _reassertPhotoEnvMap (refreshes .envMap from the CURRENT dusk env
          // map every reassert tick) and _reassertPhotoMatBoost (the ×3 envMapIntensity/tighter-
          // roughness glossy boost Alt-S applies — this material's roughness=0.4 qualifies,
          // PHOTO_GLOSSY_ROUGHNESS_MAX=0.5). Match the normal convention at creation time AND
          // register in A._matCache so every later Alt-S reassert (dusk sun move, re-toggle)
          // keeps reaching it automatically, exactly like every other material in the scene.
          // §STAFFAGE_CAR_COLOR: ordinal = cumulative cars already placed (pre-increment) — each
          // added car steps to the next palette slot. Per-car material + per-ordinal cache key so
          // Alt-S reasserts reach EVERY car, not just the last one placed.
          var carIdx = (_photoStaffage.userData.counts && _photoStaffage.userData.counts.cars) || 0;
          var mat = new THREE.MeshStandardMaterial({ color: _carColorFor(A.activeBuilding, carIdx), roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide });
          if (A._envMap) { mat.envMap = A._envMap; mat.envMapIntensity = 0.6; }
          if (A._matCache) A._matCache['staffage-car-beetle-' + carIdx] = mat;
          console.log('§STAFFAGE_CAR_COLOR idx=' + carIdx + ' rgb=#' + mat.color.getHexString());
          var mesh = new THREE.Mesh(geo, mat);
          var pos = A.ifc2three(cx2, cy2, cz2);
          // §STAFFAGE_CAR_MESH_GROUND_FIX (2026-07-18, same report, "half buried"): the mesh's
          // local origin sits near its vertical CENTRE (boundingBox.min.y ~ -0.71), not at its
          // wheel-bottom — placing the origin straight at floor level buries roughly half the car.
          // Lift by the (negative) local min so the actual lowest point — not the arbitrary
          // origin — is what touches the floor. Same fix class as the sprite pad-offset already
          // used for tree cutouts, just via boundingBox instead of a hand-measured pad fraction.
          var carLift = geo.boundingBox ? -geo.boundingBox.min.y : 0;
          var _carSlabY = _floorThreeY(cx2, cy2, cz2);
          pos.y = _carSlabY + carLift;
          mesh.position.copy(pos);
          mesh.rotation.y = angle;
          mesh.castShadow = true; mesh.receiveShadow = true;
          mesh.userData.staffageKind = 'car';   // §STAFFAGE_PERSIST: identifies this on save
          _photoStaffage.add(mesh);
          placedC++;
          var _cCounts = _photoStaffage.userData.counts || { people: 0, trees: 0, cars: 0 };
          _photoStaffage.userData.counts = { people: _cCounts.people, trees: _cCounts.trees, cars: _cCounts.cars + 1 };
          console.log('§STAFFAGE_CAR_MESH placed at ifc=(' + cx2.toFixed(1) + ',' + cy2.toFixed(1) + ',' + cz2.toFixed(1) + ') angle=' + angle.toFixed(2));
          // §STAFFAGE_CAR_MESH_GROUND witness (user: "car still a bit afloat") — read these numbers
          // before touching the grounding math: if slabY equals groundY the fallback (no slab found
          // under the car) is what's driving it; if bboxMinY isn't the true lowest local vertex the
          // lift math itself is wrong; if both check out, the "float" is a rendering/shadow-contact
          // read, not a position bug.
          console.log('§STAFFAGE_CAR_MESH_GROUND slabY=' + _carSlabY.toFixed(3) + ' groundY=' + _staffageGroundY.toFixed(3) + ' carLift=' + carLift.toFixed(3) + ' bboxMinY=' + (geo.boundingBox ? geo.boundingBox.min.y.toFixed(3) : 'n/a') + ' bboxMaxY=' + (geo.boundingBox ? geo.boundingBox.max.y.toFixed(3) : 'n/a') + ' finalPosY=' + pos.y.toFixed(3));
          // §STAFFAGE_CAR_MESH_RENDER_RACE (2026-07-18, user: "still no cars" — confirmed live:
          // the mesh existed, visible=true, correct geometry/material, but the canvas never
          // repainted to include it; a direct A.renderer.render() call showed it instantly). This
          // mesh lands asynchronously (after the geometry fetch resolves), well after the
          // synchronous Alt+P population already ran its own markDirty()/render pass and the
          // on-demand loop (main.js §S286) may have already parked. A single markDirty() call here
          // can race the loop's own park check and get lost — same class of bug as this codebase's
          // documented §PHOTO_STREAMING_RACE precedent ("re-assert every changed frame, don't trust
          // a one-shot signal"). Re-assert on two more animation frames to guarantee the loop wakes
          // and actually repaints with the mesh included, however that race lands.
          if (A.markDirty) {
            A.markDirty();
            requestAnimationFrame(function() { if (A.markDirty) A.markDirty(); });
            requestAnimationFrame(function() { requestAnimationFrame(function() { if (A.markDirty) A.markDirty(); }); });
          }
          // Car lands after the initial status paint (async geometry fetch) — refresh it now so
          // the done message's car count isn't stuck at 0 from before the mesh existed.
          _trackStaffageLoading();
        });
      }
      _shuffle(carCand);
      for (var cci = 0; cci < carCand.length && thisPressCars < CAR_CAP; cci++) {
        var ccand = carCand[cci];
        var carPos3 = A.ifc2three(ccand[0], ccand[1], ccand[2]);
        if (!_inFrame(carPos3) || _nearExisting(carPos3, 6) || _nearRealEntourage(carPos3)) continue;
        // §STAFFAGE_CLEARANCE: probe from where the car's wheels will actually sit.
        var carFeet = new THREE.Vector3(carPos3.x, _floorThreeY(ccand[0], ccand[1], ccand[2]), carPos3.z);
        if (!_spaceOK(_solids, 'car', carFeet)) continue;
        thisPressCars++;
        pSrc += '+car';
        _placeCarAt(ccand);
      }
      if (!thisPressCars) {
        // §STAFFAGE_WIDE_FALLBACK (user: "the 4/1/2 formula should apply any building" — same
        // reasoning as the people block above): trees' wider ring (5-20m beyond silhouette) can
        // clear where cars' tighter CAR_STEP_OUTS (7.5-13m) all fail occlusion/frame.
        var wideCarRadii = [14, 20, 26];
        var wideCarCand = [];
        for (var wck = 0; wck < 12; wck++) {
          var wcpa = (wck / 12) * Math.PI * 2 + 0.7;
          for (var wcr = 0; wcr < wideCarRadii.length; wcr++) {
            var wcrad = silR(wcpa) + wideCarRadii[wcr];
            wideCarCand.push([cx + Math.cos(wcpa) * wcrad, cy + Math.sin(wcpa) * wcrad, groundZ, wcpa]);
          }
        }
        _shuffle(wideCarCand);
        for (var wci = 0; wci < wideCarCand.length && thisPressCars < CAR_CAP; wci++) {
          var wccand = wideCarCand[wci];
          var wCarPos3 = A.ifc2three(wccand[0], wccand[1], wccand[2]);
          if (!_inFrame(wCarPos3) || _nearExisting(wCarPos3, 6) || _nearRealEntourage(wCarPos3)) continue;
          var wCarFeet = new THREE.Vector3(wCarPos3.x, _floorThreeY(wccand[0], wccand[1], wccand[2]), wCarPos3.z);
          if (!_spaceOK(_solids, 'car', wCarFeet)) continue;   // §STAFFAGE_CLEARANCE
          thisPressCars++;
          pSrc += '+car-wide';
          _placeCarAt(wccand);
        }
      }
      if (!thisPressCars) {
        // §STAFFAGE_ZERO_RESCUE spec S2 — the press must not end with 0 cars.
        _zeroRescue('car', 6, function(ix, iy) {
          thisPressCars++;
          pSrc += '+car-rescue';
          _placeCarAt([ix, iy, groundZ, Math.random() * Math.PI * 2]);
        });
      }
    }
    if (_photoStaffage.parent !== A.scene) A.scene.add(_photoStaffage);
    // Additive across presses: this call's placedP/placedT are THIS-PRESS-ONLY (see PAX_CAP/TREE_CAP
    // above) — merge onto whatever cumulative total is already on the group from earlier presses.
    var _prevC = _photoStaffage.userData.counts || { people: 0, trees: 0, cars: 0 };
    _photoStaffage.userData.counts = { people: _prevC.people + placedP, trees: _prevC.trees + placedT, cars: _prevC.cars };
    // §-witness the feet-on-ground invariant IN the log (readable from any real session's console,
    // no browser needed): every sprite's feet Y minus the rendered ground Y — must be 0,0.
    var _fMin = Infinity, _fMax = -Infinity;
    _photoStaffage.children.forEach(function(s) { var dy = (s.position.y + (s.userData.baseOffset || 0)) - _staffageGroundY; if (dy < _fMin) _fMin = dy; if (dy > _fMax) _fMax = dy; });
    if (!_photoStaffage.children.length) { _fMin = 0; _fMax = 0; }
    console.log('§PHOTO_STAFFAGE thisPress(people=' + placedP + ' trees=' + placedT + ') cumulative(people=' + _photoStaffage.userData.counts.people + ' trees=' + _photoStaffage.userData.counts.trees + ' cars=' + _photoStaffage.userData.counts.cars + ') pSrc=' + pSrc + ' floor=slab:' + _floorSlab + '/ground:' + _floorGround + ' feetVsGroundY=[' + _fMin.toFixed(2) + ',' + _fMax.toFixed(2) + '] groundY=' + _staffageGroundY.toFixed(2) + ' slabs=' + _slabs.length + ' build_ms=' + (performance.now() - _bt0).toFixed(0) + ' (realPeople=' + realPeople + ' realTrees=' + realTrees + ' realCars=' + realCars + ')');
    // §STAFFAGE_REAL_DEDUP witness (spec S1): how many real entourage positions guarded, how many
    // synthetic candidates they rejected this press.
    console.log('§STAFFAGE_REAL_DEDUP n=' + _realDedup.length + ' rejReal=' + _rejReal);
    _clrSummary('src=exterior solids=' + _solids.length);   // §STAFFAGE_CLEARANCE
  }
  // §PHOTO_STAFFAGE_STATUS (user: "why don't you give a wait-loading status?"): the cutout PNGs
  // load async (~seconds first time), so Alt+P looked like nothing happened. Drive the bottom
  // status bar with a live count — "⏳ Populating… N/M" as textures decode, "✓ Scene populated —
  // P people, T trees" when done. Cached on later toggles → jumps straight to done. No polling:
  // hooks each unique texture's image 'load' event; the sprite also pops in the frame as it loads.
  function _trackStaffageLoading() {
    if (!A.status || !_photoStaffage) { A._populateBusy = false; return; }
    var c = _photoStaffage.userData.counts || { people: 0, trees: 0, cars: 0 };
    var doneMsg = '✓ Scene populated — ' + c.people + ' people, ' + c.trees + ' trees, ' + (c.cars || 0) + ' cars';
    var seen = [], texs = [];
    _photoStaffage.children.forEach(function(s) {
      if (s.material && s.material.map && seen.indexOf(s.material.map) < 0) { seen.push(s.material.map); texs.push(s.material.map); }
    });
    var total = texs.length;
    function loaded() { var n = 0; for (var i = 0; i < texs.length; i++) { var im = texs[i].image; if (im && im.complete && im.naturalWidth) n++; } return n; }
    function paint() {
      var n = loaded();
      if (n >= total) { A.status.textContent = doneMsg; A._populateBusy = false; if (A.markDirty) A.markDirty(); }
      else A.status.textContent = '⏳ Populating scene… ' + n + '/' + total;
    }
    if (!total) { A.status.textContent = doneMsg; A._populateBusy = false; return; }
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
  // §STAFFAGE_PERSIST (2026-07-18, user: "only when save that last scene is stored in DB. If not,
  // discarded"): staffage lives purely in the THREE.js scene graph — nothing auto-persists. Save
  // (scene.js A._exportBuildingDb) calls this right before export to capture whatever's currently
  // placed as plain rows (no THREE/DOM objects crossing the module boundary).
  A._getStaffageInstances = function() {
    if (!_photoStaffage) return [];
    var rows = [];
    _photoStaffage.children.forEach(function(c) {
      var k = c.userData && c.userData.staffageKind; if (!k) return;
      var padY = (k !== 'car' && c.userData.baseOffset) || 0;   // sprites store feet Y minus pad; undo for round-trip
      var ifcX = c.position.x + A.modelOffset.x;
      var ifcZ = (c.position.y + padY) + A.modelOffset.z;
      var ifcY = A.modelOffset.y - c.position.z;
      rows.push([k, c.userData.staffageFile || '', ifcX, ifcY, ifcZ, c.rotation.y || 0]);
    });
    return rows;
  };
  // Rehydrates an EXACT saved set — bypasses all placement/frame math, pixel-perfect restore of
  // whatever was on screen at Save time. Triggered by the first Alt+P press on a building whose DB
  // carries a staffage_instances table (togglePopulate, below).
  A._restoreStaffageInstances = function(rows) {
    if (!rows || !rows.length || !THREE.Sprite) return;
    _photoStaffage = new THREE.Group();
    // §STAFFAGE_CAR_COLOR: car ordinal claimed SYNCHRONOUSLY in row order (the async geometry load
    // below resolves in any order, but the ordinal is captured before it starts) — save row order is
    // preserved, so car #n gets the same palette slot it had when saved. Deterministic round-trip.
    var _restCarIdx = 0;
    rows.forEach(function(r) {
      var kind = r[0], file = r[1], ifcX = r[2], ifcY = r[3], ifcZ = r[4], rotY = r[5];
      var pos = A.ifc2three(ifcX, ifcY, ifcZ);
      if (kind === 'car') {
        var carIdx = _restCarIdx++;
        _loadCarGeometry().then(function(geo) {
          if (!geo || !_photoStaffage) return;
          var mat = new THREE.MeshStandardMaterial({ color: _carColorFor(A.activeBuilding, carIdx), roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide });
          if (A._envMap) { mat.envMap = A._envMap; mat.envMapIntensity = 0.6; }
          if (A._matCache) A._matCache['staffage-car-beetle-' + carIdx] = mat;
          console.log('§STAFFAGE_CAR_COLOR idx=' + carIdx + ' rgb=#' + mat.color.getHexString() + ' src=restore');
          var mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(pos); mesh.rotation.y = rotY;
          mesh.castShadow = true; mesh.receiveShadow = true;
          mesh.userData.staffageKind = 'car';
          _photoStaffage.add(mesh);
          if (A.markDirty) A.markDirty();
        });
        return;
      }
      var pool = kind === 'tree' ? _STAFFAGE_TREES : _STAFFAGE_PEOPLE, entry = null;
      for (var i = 0; i < pool.length; i++) { if (pool[i].file === file) { entry = pool[i]; break; } }
      if (!entry) return;
      _addStaffageSprite(entry, pos, kind === 'people', true);
    });
    _photoStaffage.userData.counts = {
      people: rows.filter(function(r) { return r[0] === 'people'; }).length,
      trees: rows.filter(function(r) { return r[0] === 'tree'; }).length,
      cars: rows.filter(function(r) { return r[0] === 'car'; }).length
    };
    A.scene.add(_photoStaffage);
    _photoStaffage.visible = true;
    console.log('§STAFFAGE_RESTORE rows=' + rows.length);
  };
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
  function _updateInFrameInterior() {
    if (!A.dbQuery || !A.camera || !THREE.Sprite || !_photoStaffage) return;
    // §STAFFAGE_REAL_DEDUP spec S1: was a wholesale `if (_realPeopleExist) return;` skip — removed
    // (user: "always room"); real-people overlap is now rejected per-candidate below, same as the
    // exterior pass. §RPC_M_PREFIX's no-double-population intent survives spatially.
    if (_realPeopleExist) console.log('§PHOTO_STAFFAGE_INTERIOR realPeopleExist=1 (spatial dedup, no wholesale skip)');
    var bbox = _buildingBBoxIfc(); if (!bbox) return;
    var c0 = A.ifc2three(bbox.xMin, bbox.yMin, bbox.zMin), c1 = A.ifc2three(bbox.xMax, bbox.yMax, bbox.zMax);
    var minX = Math.min(c0.x, c1.x), maxX = Math.max(c0.x, c1.x), minZ = Math.min(c0.z, c1.z), maxZ = Math.max(c0.z, c1.z), roofY = Math.max(c0.y, c1.y);
    var cam = A.camera.position;
    var inside = cam.x > minX && cam.x < maxX && cam.z > minZ && cam.z < maxZ && cam.y < roofY + 2;
    if (!inside) { console.log('§PHOTO_STAFFAGE_INTERIOR inside=0'); return; }
    // §STAFFAGE_FRAME_FOCUSED: purely ADDITIVE now (no _disposeInFrame() at top) — de-dup new
    // candidates against whatever's already placed from an earlier press, capped small per press
    // (SIT_CAP/WALK_CAP below), same discipline as _buildStaffage's exterior pass.
    function _nearExistingIF(threePos, minDist) {
      for (var ci = 0; ci < _photoStaffage.children.length; ci++) {
        if (_photoStaffage.children[ci].position.distanceTo(threePos) < minDist) return true;
      }
      return false;
    }
    var SIT_CAP = 2, WALK_CAP = 2;
    // §STAFFAGE_SEAT_CLASS (2026-07-20, user: "sitting figures placed INSIDE tables") — ROOT CAUSE of
    // that defect: this query used to select EVERY IfcFurniture/IfcFurnishingElement row and drop a
    // seated sprite at the chosen element's own center_x/center_y. A table, desk, counter or nurse
    // station is furniture too, so a sit pick could land a figure at the geometric centre of a table
    // — i.e. inside it. Measured on the real shipped DBs (read-only queries, nothing mutated):
    //   Hospital  201 furniture = 160 M_Chair* + 37 M_Table* + 4 nurse stations/info desks
    //             (chairs bbox 0.47-0.68m plan, tables 1.52-2.4m, stations 12.7-25.5m)
    //   Clinic    118 furniture, ZERO seats — all cabinets/countertops
    //   Terminal  176 furniture, canteen tables + desks + one real 'Chair - Desk (2)' family
    // There is NO predefined_type column in elements_meta (schema: guid, ifc_class, element_name,
    // storey, discipline, material_name, material_rgba, building) — so seat-ness must come from the
    // element_name family + the real bbox. Both are extracted, neither is invented.
    //
    // TWO NAMING LANDMINES, both confirmed in real data — do not "simplify" this classifier:
    //  1. `M_Table-Dining Round w Chairs:1525mm Diameter` — 21 Hospital rows are TABLES whose name
    //     contains "Chairs". A naive LIKE '%chair%' calls them chairs and re-creates this exact bug.
    //  2. `Chair - Desk (2)` (Terminal) — a genuine chair whose name contains "Desk". Excluding on
    //     any non-seat token anywhere in the name would wrongly drop it.
    // Resolved by TOKEN POSITION within the Revit family name (the text before the first ':', which
    // is where the family name lives in every DB checked): classification goes to whichever token
    // appears FIRST. "M_Table-..." -> table; "Chair - Desk..." -> chair. Plus a size guard: a single
    // seat is <=1.2m in plan, which drops combined units such as Terminal's
    // `Waiting_Room_Seat_-_4St_1Tbl_3750` (4 seats + 1 table in one 3.75m element — seating, but its
    // centre is the TABLE, so seating a figure there reproduces the bug).
    // NOTE a chair legitimately overlapping a table bbox is NOT this defect: Hospital's dining chairs
    // ring a `M_Table-Dining Round w Chairs` whose bbox spans the whole setting, so 159/160 chair
    // centres fall inside a table bbox by construction. A person seated at a table is supposed to
    // overlap it. The defect is the ANCHOR being a table, which is what this classifier removes.
    // ZERO-CASE IS CORRECT HERE: a building whose furniture carries no seat information (LTU_AHouse's
    // names are bare codes — "-", "WC", "KÖK3"; Clinic is all casework) places NO seated figures.
    // Per this file's own doctrine that is the right outcome — never fabricate a seat position.
    var _SEAT_RE = /chair|seat|stool|sofa|bench|couch|settee|\bstol/i;
    var _NONSEAT_RE = /table|desk|counter|station|cabinet|shelv|shelf|\bbed\b|bord|sk[aå]p|bokhyll|worktop|\btbl\b|entertainment|\btop\b/i;
    function _isSeat(name, bboxX, bboxY) {
      var fam = String(name || '').split(':')[0];
      var s = _SEAT_RE.exec(fam); if (!s) return false;
      var n = _NONSEAT_RE.exec(fam); if (n && n.index < s.index) return false;
      // a real single seat is <=1.2m in plan — guards against combined seat+table units and any
      // oversized assembly that happens to carry a seat token.
      return (bboxX == null || bboxX <= 1.2) && (bboxY == null || bboxY <= 1.2);
    }
    A._staffageIsSeat = _isSeat;   // exposed for the §STAFFAGE_SEAT_CLASS witness harness
    // furniture currently in the view frustum, near the camera
    var furn = A.dbQuery("SELECT et.center_x, et.center_y, et.center_z, et.bbox_z, em.element_name, et.bbox_x, et.bbox_y FROM element_transforms et JOIN elements_meta em ON et.guid=em.guid WHERE em.ifc_class IN ('IfcFurniture','IfcFurnishingElement') AND et.center_x IS NOT NULL") || [];
    var _v = new THREE.Vector3(), cand = [], seatTotal = 0, rejNonSeat = 0;
    for (var i = 0; i < furn.length; i++) {
      var f = furn[i], p = A.ifc2three(f[0], f[1], f[2]);
      // §STAFFAGE_SEAT_CLASS: only a real seat may receive a seated figure.
      if (!_isSeat(f[4], f[5], f[6])) { rejNonSeat++; continue; }
      seatTotal++;
      _v.copy(p).project(A.camera);
      if (Math.abs(_v.x) < 0.9 && Math.abs(_v.y) < 0.95 && _v.z > -1 && _v.z < 1) {
        var dist = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
        if (dist < 16 && !_nearExistingIF(p, 1.5) && !_nearRealEntourage(p)) cand.push([f[0], f[1], f[2], f[3], dist]);
      }
    }
    console.log('§STAFFAGE_SEAT_CLASS furn=' + furn.length + ' seats=' + seatTotal + ' rejNonSeat=' + rejNonSeat + ' inViewSeats=' + cand.length);
    // §STAFFAGE_SHUFFLE: random draw among all in-view/in-range candidates, not always nearest-first
    // — "repeatedly adds on... in random placings" applies indoors too, clash (_spreadPick's minDist)
    // is still the guardrail.
    _shuffle(cand);
    var picked = _spreadPick(cand, SIT_CAP, 2.0);
    // floor slab under each spot (raised/upper storey respected — same logic as _buildStaffage)
    var slabs = A.dbQuery("SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE m.ifc_class IN ('IfcSlab','IfcSlabStandardCase') AND bbox_z IS NOT NULL AND bbox_z < 1.5 AND center_x IS NOT NULL") || [];
    function floorY(x, y, refZ) {
      var best = null;
      for (var s = 0; s < slabs.length; s++) { var sl = slabs[s], top = sl[2] + (sl[5] || 0) / 2; if (top <= refZ + 1.5 && Math.abs(x - sl[0]) <= (sl[3] || 3) / 2 + 0.5 && Math.abs(y - sl[1]) <= (sl[4] || 3) / 2 + 0.5) { if (best === null || top > best) best = top; } }
      return best !== null ? A.ifc2three(x, y, best).y : _staffageGroundY;
    }
    var sitPoses = _STAFFAGE_PEOPLE.filter(function(p) { return p.role === 'sit'; });
    // §STAFFAGE_FACING indoors: the interior circulation pool is normally all 'away'-facing (walks
    // toward whatever's beyond her — reads fine anywhere). Widen it with the one 'toward'-facing
    // pose (the standing casual male — "guy facing cam") so an interior shot can ALSO show someone
    // facing the viewer, same facing-metric already used for the exterior threshold. He lands on
    // whichever occupancy-grid-clear spot the round-robin picks — "where opportunity" — same
    // walk-clear verification as every other candidate, nothing indoors gets less safe.
    var walkPoses = _STAFFAGE_PEOPLE.filter(function(p) { return p.role === 'walk' || (p.role === 'stand' && p.facing === 'toward'); });
    // §STAFFAGE_WALK_FLOOR_FIX (user: "ppl appeared but knee high inside floor"): this value is now
    // ONLY a coarse reference for the occupancy-grid Z-band + the screen-space visibility probe below —
    // it is NOT the final walker Y anymore (that was the bug: every walker in the frame shared ONE
    // furniture-derived floor height, which is wrong the moment a walker's own spot is on a different
    // level than the nearest furniture, or there's no nearby furniture at all and this fell back to
    // `_staffageGroundY` — the building's ABSOLUTE ground floor, sinking anyone on an upper storey).
    // Fall back to the CAMERA's own height instead of the building's ground floor when no furniture is
    // in view — the camera is always on the correct local floor, furniture may not be nearby.
    var floorYval = picked.length ? floorY(picked[0][0], picked[0][1], picked[0][2]) : (cam.y - 1.6);
    var placedSit = 0, placedWalk = 0;
    // SITTING → on the in-view SEAT furniture (real chairs only — see §STAFFAGE_SEAT_CLASS above)
    for (var k = 0; k < picked.length; k++) {
      var s = picked[k], pos = A.ifc2three(s[0], s[1], s[2]); pos.y = floorY(s[0], s[1], s[2]);
      var spr = _addStaffageSprite(sitPoses[k % sitPoses.length], pos, true, true);
      spr.userData.interior = true;
      // §STAFFAGE_SIT_ANCHOR: record the IFC-space seat this figure was placed on, so the witness can
      // re-test every placed sitting figure against the real furniture bboxes independently of the
      // placement search (non-tautological — same discipline as §STAFFAGE_WALK_CLEAR).
      spr.userData.sitAnchorIfc = { x: s[0], y: s[1], z: s[2] };
      _photoStaffageInFrame.push(spr); placedSit++;
      console.log('§STAFFAGE_SIT_ANCHOR ifc=(' + s[0].toFixed(2) + ',' + s[1].toFixed(2) + ') seat=1');
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
    // §STAFFAGE_CAMROOM (2026-07-22): floor was 4m, which in a small/typical room lands past the far
    // wall or inside _CLR_PERSON clearance of it, emptying the candidate pool and reading as "avoids
    // the camera's own room" (prompts/PHOTOREAL_STILL_RENDER.md §SPEC ONLY — Issue 1). Lowered the
    // floor to 1.5m and widened the step so the SAME 5-band spread still reaches all the way to 13m
    // (was 4 bands, 4/7/10/13 — a bare `dd=1.5` with the old step-3 would have DROPPED the 13m band
    // instead of adding a near one, net-losing far-room reach). _spaceOK()'s existing clearance check
    // still rejects anything actually too close to camera/geometry — no new camera-avoidance rule.
    for (var dd = 1.5; dd <= 13; dd += 2.875) {
      // §STAFFAGE_CAMROOM_FAN: lat's old fixed ±4.5m span was tuned for the far band (dd=13, a
      // ~19° half-angle off dead-ahead) — reused verbatim at dd=1.5 it demands a 72° swing, which
      // fails the frustum test on EVERY sample (confirmed live: walkTried/rejectedInObject came out
      // byte-identical before/after the dd-floor-only fix — the new near band contributed zero
      // candidates). Scale the lateral fan with dd so every band keeps roughly the SAME angular
      // cone as the proven far band, instead of a fixed metric width that only works far out.
      var _latMax = dd * (4.5 / 13);
      for (var lat = -_latMax; lat <= _latMax; lat += Math.max(_latMax * 0.66, 0.1)) {
        var wx = cam.x + fwd.x * dd + rightV.x * lat, wz = cam.z + fwd.z * dd + rightV.z * lat;
        _np.set(wx, floorYval + 1.0, wz).project(A.camera);
        if (Math.abs(_np.x) > 0.85 || Math.abs(_np.y) > 0.9 || _np.z < -1 || _np.z > 1) continue;
        aisleWalkTried++;
        var ifcX = wx + A.modelOffset.x, ifcY = -wz + A.modelOffset.y;
        if (aisleGrid.free(ifcX, ifcY, 0.5) && !_nearExistingIF(new THREE.Vector3(wx, floorYval, wz), 2.0)) {
          walkCand.push([wx, wz, Math.hypot(wx - cam.x, wz - cam.z), ifcX, ifcY]);
        } else aisleRejectedInObject++;
      }
    }
    _shuffle(walkCand);   // §STAFFAGE_SHUFFLE — random draw, not always nearest-first
    var wpick = [];
    for (var wi = 0; wi < walkCand.length && wpick.length < WALK_CAP; wi++) {
      var ok = true; for (var wj = 0; wj < wpick.length; wj++) { if (Math.hypot(walkCand[wi][0] - wpick[wj][0], walkCand[wi][1] - wpick[wj][1]) < 3) { ok = false; break; } }
      if (ok) wpick.push(walkCand[wi]);
    }
    // §STAFFAGE_GROUNDSNAP (user 2026-07-19: "standing pax in midair because it was trying to
    // align to a corridor that has empty middle space" — an atrium opening is a HOLE cut inside a
    // big slab's bbox, so the bbox floor lookup reports floor where there is only air). Verify each
    // walker spot with a REAL downward raycast against rendered triangles (BVH-accelerated) and
    // land on the first actual surface below — "look for nearest ground or at least be placed to
    // first open ground to land on". No surface at all → reject the spot.
    var _snapRay = new THREE.Raycaster(); _snapRay.camera = A.camera;
    _snapRay.firstHitOnly = true;
    function _groundSnapY(tx3, fromY, tz3) {
      _snapRay.set(new THREE.Vector3(tx3, fromY, tz3), new THREE.Vector3(0, -1, 0));
      _snapRay.far = 80;
      var hits;
      try { hits = _snapRay.intersectObjects(A.scene.children, true); } catch (e) { return null; }
      for (var hi = 0; hi < hits.length; hi++) {
        var o = hits[hi].object;
        if (o.isSprite) continue;                                    // staffage/sparkle billboards
        if (_photoStaffage && (o === _photoStaffage || o.parent === _photoStaffage)) continue;
        if (A.sky && o === A.sky) continue;
        return hits[hi].point.y;
      }
      return null;
    }
    // §STAFFAGE_CLEARANCE (user: "indoors should only be pax stand and sit - not clashing with any
    // prop ie not inside a mesh"). The occupancy grid above is bbox-derived; a bbox is both too
    // generous (an L-shaped or hollow element blocks cells it does not actually occupy) and too
    // blind (it misses anything the DB's bbox columns misreport, and this file already records that
    // bboxes lie about floors). Re-test every walker's FINAL world position against real triangles.
    var _iSolids = _solidMeshes();
    // §STAFFAGE_SIT_OPEN_FLOOR (R1 fix, 2026-07-20 user ruling): "There are no more sitting pax in
    // the Terminal hall though there are seats. They can always have their seats in open area floor
    // anyway just for semblance." Measured root cause (probe, not eyeballed): Terminal's furniture
    // set has only 4 rows that pass §STAFFAGE_SEAT_CLASS as real single seats out of 176, and this
    // camera's frustum+16m-range test finds ZERO of them in view on every press
    // (`§STAFFAGE_SEAT_CLASS ... inViewSeats=0`) — the real-seat candidate pool is simply too thin,
    // not a clearance-gate rejection (the real-seat loop above has never called `_spaceOK`; the only
    // `pax`-kind rejections logged here are the WALK loop's own, below). User ruling: a seated figure
    // does NOT need a real chair OR an adjacent table — fall back to open floor when real seats are
    // scarce/out of view, up to the same SIT_CAP. Reuses the walk aisle's own candidate pool
    // (already ground-clear via the occupancy grid) so this never needs its own scan, and shares its
    // `_spaceOK('pax',...)` clearance gate — since these figures are NOT anchored to any furniture,
    // that gate correctly applies to them (unlike a real-seat figure, which overlaps its own chair by
    // construction and must never be gated on that overlap — PR #898's exemption stays as-is: no new
    // gate was added to the real-seat loop above, because it was never the cause of this defect).
    var sitFallbackNeed = Math.max(0, SIT_CAP - placedSit);
    var sitFallbackPick = [];
    for (var sfi = 0; sfi < walkCand.length && sitFallbackPick.length < sitFallbackNeed; sfi++) {
      var cwc = walkCand[sfi], clash = false;
      for (var wj2 = 0; wj2 < wpick.length; wj2++) { if (Math.hypot(cwc[0] - wpick[wj2][0], cwc[1] - wpick[wj2][1]) < 3) { clash = true; break; } }
      if (!clash) for (var sj2 = 0; sj2 < sitFallbackPick.length; sj2++) { if (Math.hypot(cwc[0] - sitFallbackPick[sj2][0], cwc[1] - sitFallbackPick[sj2][1]) < 2) { clash = true; break; } }
      if (!clash) sitFallbackPick.push(cwc);
    }
    var placedSitFallback = 0, _sitFbSnapRej = 0, _sitFbClrRej = 0;
    for (var sf = 0; sf < sitFallbackPick.length; sf++) {
      var sfWy = floorY(sitFallbackPick[sf][3], sitFallbackPick[sf][4], ifcFloorZ);
      var sfSnapped = _groundSnapY(sitFallbackPick[sf][0], Math.max(sfWy, floorYval) + 1.8, sitFallbackPick[sf][1]);
      if (sfSnapped === null) { _sitFbSnapRej++; continue; }
      sfWy = sfSnapped;
      if (!_spaceOK(_iSolids, 'pax', new THREE.Vector3(sitFallbackPick[sf][0], sfWy, sitFallbackPick[sf][1]))) { _sitFbClrRej++; continue; }
      var sfSpr = _addStaffageSprite(sitPoses[(placedSit + placedSitFallback) % sitPoses.length],
        new THREE.Vector3(sitFallbackPick[sf][0], sfWy, sitFallbackPick[sf][1]), true, true);
      sfSpr.userData.interior = true;
      sfSpr.userData.sitOpenFloor = true;   // no real seat anchor — semblance only, per user ruling
      _photoStaffageInFrame.push(sfSpr); placedSitFallback++;
    }
    console.log('§STAFFAGE_SIT_FALLBACK need=' + sitFallbackNeed + ' tried=' + sitFallbackPick.length +
      ' placed=' + placedSitFallback + ' rejSnap=' + _sitFbSnapRej + ' rejClearance=' + _sitFbClrRej +
      ' (open-floor semblance, no seat/table required)');
    var _walkClrRej = 0;
    var _walkYLog = [], _snapLanded = 0, _snapRejected = 0;
    for (var m = 0; m < wpick.length; m++) {
      // §STAFFAGE_WALK_FLOOR_FIX cont.: per-candidate floor lookup, same as sitting figures already
      // get above (line ~1227) — NOT the shared floorYval, that was the knee-high bug.
      var wy = floorY(wpick[m][3], wpick[m][4], ifcFloorZ);
      var snapped = _groundSnapY(wpick[m][0], Math.max(wy, floorYval) + 1.8, wpick[m][1]);
      if (snapped === null) { _snapRejected++; continue; }           // nothing below at all — void
      if (snapped < wy - 0.4) _snapLanded++;                        // bbox said floor, rays say void — land below
      wy = snapped;
      // §STAFFAGE_CLEARANCE — final gate on the exact rendered position (feet-anchored sprite).
      if (!_spaceOK(_iSolids, 'pax', new THREE.Vector3(wpick[m][0], wy, wpick[m][1]))) { _walkClrRej++; continue; }
      _walkYLog.push(wy.toFixed(2) + '(camY-1.6=' + (cam.y - 1.6).toFixed(2) + ')');
      var spr2 = _addStaffageSprite(walkPoses[m % walkPoses.length], new THREE.Vector3(wpick[m][0], wy, wpick[m][1]), true, true);
      spr2.userData.interior = true; _photoStaffageInFrame.push(spr2); placedWalk++;
    }
    console.log('§STAFFAGE_GROUNDSNAP checked=' + wpick.length + ' landedLower=' + _snapLanded +
      ' rejectedNoGround=' + _snapRejected);
    // §STAFFAGE_WALK_CLEAR: independently re-verify every PLACED aisle-walker against the same grid.
    var aisleWcOk = 0;
    for (var wv = 0; wv < wpick.length; wv++) {
      var vx = wpick[wv][0] + A.modelOffset.x, vy = -wpick[wv][1] + A.modelOffset.y;
      if (aisleGrid.free(vx, vy, 0.5)) aisleWcOk++;
    }
    console.log('§PHOTO_STAFFAGE_INTERIOR inside=1 inView=' + cand.length + ' sit=' + (placedSit + placedSitFallback) +
      ' (seat=' + placedSit + ' openFloor=' + placedSitFallback + ') walk=' + placedWalk +
      ' walkTried=' + aisleWalkTried + ' rejectedInObject=' + aisleRejectedInObject);
    console.log('§STAFFAGE_WALK_CLEAR src=aisle ok=' + aisleWcOk + '/' + wpick.length);
    console.log('§STAFFAGE_WALK_FLOOR_Y ' + (_walkYLog.length ? _walkYLog.join(' ') : 'none'));
    console.log('§STAFFAGE_WALK_CLEARANCE rejInMesh=' + _walkClrRej + ' placed=' + placedWalk);
    _clrSummary('src=interior solids=' + _iSolids.length);   // §STAFFAGE_CLEARANCE
  }
  var _populateOn = false, _populateBuilding = null;
  // §STAFFAGE_FRAME_FOCUSED (2026-07-18 redesign, user: "Alt-P basically never off, just repopulate
  // what is in new frame" / "if in frame already has props, it can add"): Alt+P is no longer a strict
  // on/off visibility toggle. EVERY press populates/densifies whatever's currently in the camera
  // frame, additively (never clears) — a first press naturally reads as "a few" because both
  // _buildStaffage and _updateInFrameInterior cap new additions small per call; a later press (same
  // frame or a new one after moving) tops up whatever free/visible space is left. Switching buildings
  // still does a full clear+rebuild (via _populateBuilding !== A.activeBuilding below).
  A.togglePopulate = function() {
    var firstEver = !_populateOn;
    _populateOn = true;
    // §CINEMA_ROW_BUSY (2026-07-18, user ask: "processing..." feedback on the icon itself, not
    // just the status bar — slower machines' first cutout-decode can take a few secs). Cleared by
    // _trackStaffageLoading below (every real exit, not a guessed timeout — see that function) once
    // every texture is loaded, the SAME signal that already drives the "⏳ Populating…"→
    // "✓ Scene populated" status-bar text.
    A._populateBusy = true;
    if (A.status) A.status.textContent = '⏳ Populating scene…';
    var freshBuilding = !_photoStaffage || _populateBuilding !== A.activeBuilding;
    if (freshBuilding) {
      _disposeStaffage();
      _populateBuilding = A.activeBuilding;
      // §STAFFAGE_PERSIST restore (user: "only when save that last scene is stored in DB... if not,
      // discarded"): a building saved WITH staffage carries a staffage_instances table (written by
      // A._exportBuildingDb() at Save time). First Alt+P press on such a building rehydrates the
      // EXACT saved set instead of a fresh frame-driven placement. No table (never saved, or saved
      // before this feature existed) → falls through to normal placement, unchanged.
      // §STAFFAGE_QUIET_TABLE_CHECK (user log showed "§HELPERS_QUERY_ERR no such table:
      // staffage_instances" on every building — A.dbQuery's own try/catch swallows the SQL error
      // but still WARNS every time, so a plain try/catch around the SELECT here never helped; the
      // warning fired regardless). Check sqlite_master first — a query that never fails — and only
      // run the SELECT when the table genuinely exists, so the normal "never saved" case is silent.
      var savedRows = null;
      var _hasTable = A.dbQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='staffage_instances'");
      if (_hasTable && _hasTable.length) {
        savedRows = A.dbQuery("SELECT kind,file,ifc_x,ifc_y,ifc_z,rot_y FROM staffage_instances");
      }
      if (savedRows && savedRows.length) {
        A._restoreStaffageInstances(savedRows);
        _lastPeopleVis = null; _updatePeoplePitchGate(); _trackStaffageLoading();
        if (A.markDirty) A.markDirty();
        console.log('§PHOTO_POPULATE press bld=' + A.activeBuilding + ' firstEver=' + firstEver + ' restored=' + savedRows.length);
        return;
      }
    }
    _buildStaffage();                     // additive — trees/pax/car visible in the current frame
    if (_photoStaffage) _photoStaffage.visible = true;
    _updateInFrameInterior();             // additive — sit/walk figures visible in the current frame
    _lastPeopleVis = null;                // force a fresh pitch decision (+ log) on show
    _updatePeoplePitchGate();
    _trackStaffageLoading();              // live "⏳ N/M → ✓ populated" status while cutouts decode
    if (!A._populatePitchHooked && A.controls && A.controls.addEventListener) {
      A.controls.addEventListener('change', function() {
        if (_populateOn && _photoStaffage && _photoStaffage.visible) _updatePeoplePitchGate();
      });
      A._populatePitchHooked = true;       // live pitch gate: recompute as the camera orbits
    }
    if (A.markDirty) A.markDirty();
    console.log('§PHOTO_POPULATE press bld=' + A.activeBuilding + ' firstEver=' + firstEver);
  };
  // §CINEMA_ROW_ICONS: exposes _populateOn for the Palette panel's Alt+P icon button active-state
  // (mirrors A._stillRefineActive, already public — _populateOn wasn't, needed a getter).
  A.populateActive = function() { return _populateOn; };
  // §PHOTO_STAFFAGE_PRELOAD: measured — placement is 5-29ms; the whole first-time wait is decoding
  // the cutout PNGs (~2-6s). Textures are already cached after first use (and sprite objects reused
  // per building), so the SECOND Alt+P is instant — the only thing left is the FIRST. Warm the cache
  // in the background once the page is idle so even the first Alt+P is instant. The 12 cutouts are
  // small (downscaled + palette-quantized), building-independent, loaded once per session.
  (function _schedulePreload() {
    var run = function() {
      try {
        _STAFFAGE_PEOPLE.concat(_STAFFAGE_TREES).forEach(function(e) { _staffageTex(e.file); });
        _loadCarGeometry();
        console.log('§PHOTO_STAFFAGE_PRELOAD warming ' + (_STAFFAGE_PEOPLE.length + _STAFFAGE_TREES.length) + ' cutouts + car mesh');
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
  function _reassertPhotoShadowCoverage(force) {
    if (!_photoShadowSelfEnabled || !A.scene) return;
    var _idx = A.streamIdx || 0, _kids = A.scene.children.length, _vis = A._visibilityGen || 0;
    // §PHOTO_SHADOW_FINALCAPTURE (2026-07-25): the skip-gate below is safe for the accumulation
    // ticks it was built for, but the LAST reassert before a frame is handed off (Alt+S freeze /
    // MaxQ per-frame capture) must never be a skip — a skipped final tick means the captured frame
    // inherits whichever shadow-caster state happened to be cached, not a guaranteed-fresh one.
    // `force` bypasses the gate for exactly that one caller (_finishStillRefine), at the cost of
    // one extra traverse per finished/captured frame, not per tick.
    var _wouldSkip = (_idx === _photoShadowCheckIdx && _kids === _photoShadowCheckKids && _vis === _photoShadowCheckVis);
    if (!force && _wouldSkip) {
      _photoShadowReassertSkips++;
      return;  // nothing streamed, nothing added to the scene, nothing re-filtered — a fresh traverse would find nothing new
    }
    // forcedSaves: how many times THIS SPECIFIC forced call is the only reason a real traverse ran
    // — i.e. the exact case §PHOTO_SHADOW_FINALCAPTURE exists for (a captured frame that would
    // otherwise have inherited a stale/skipped shadow-caster state).
    if (force && _wouldSkip) _photoShadowForcedSaves++;
    _photoShadowCheckIdx = _idx; _photoShadowCheckKids = _kids; _photoShadowCheckVis = _vis;
    _photoShadowReassertRuns++;
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
  // §PHOTO_SHADOW_SKIP (2026-07-25, borrowing nav-DLOD's change-detection idea — see
  // prompts/PHOTOREAL_STILL_RENDER.md 2026-07-24/2026-07-25 SPEC ONLY sections): the reassert
  // traversal below existed to catch geometry/visibility that changed AFTER the initial
  // _enablePhotoShadows() pass — but it ran an unconditional full-scene traverse every single
  // caller frame regardless of whether anything actually changed. Shared by BOTH Alt+S
  // (step(), up to 16 calls) and Alt+C/MaxQ Cinema orbit (step(), up to CINEMA_N_FRAMES=576
  // calls) since both go through this one function — gating it benefits both automatically.
  // Tracks the same three signals the function's own purpose already depends on: streaming
  // progress (A.streamIdx), new top-level scene content (A.scene.children.length, the same
  // signal §PROGRESSIVE_FLUSH already logs as drawCalls), and discipline/storey/isolate
  // visibility edits (A._visibilityGen, bumped by panels.js's 3 visibility-mutation entry
  // points). If all three are unchanged since the last check, a fresh traverse would find
  // zero new objects — skip it, don't do the redundant O(scene) work.
  var _photoShadowCheckIdx = -1, _photoShadowCheckKids = -1, _photoShadowCheckVis = -1;
  var _photoShadowReassertRuns = 0, _photoShadowReassertSkips = 0, _photoShadowForcedSaves = 0;
  function _enablePhotoShadows() {
    if (A._shadowOn) { _photoShadowSelfEnabled = false; return; }  // user's own Shadow mode active — don't touch
    if (!A.sun || !A.renderer || !A.scene) return;
    _photoShadowSelfEnabled = true;
    _photoShadowCheckIdx = -1; _photoShadowCheckKids = -1; _photoShadowCheckVis = -1;
    _photoShadowReassertRuns = 0; _photoShadowReassertSkips = 0; _photoShadowForcedSaves = 0;
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
      else console.log('§PHOTO_SHADOW disabled reassertRuns=' + _photoShadowReassertRuns +
        ' reassertSkips=' + _photoShadowReassertSkips + ' forcedSaves=' + _photoShadowForcedSaves);
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
  var _hdriEnvMap = null, _hdriLoading = false, _hdriPmrem = null, _hdriReadyPromise = null;
  var _photoEnvMapSaved = null;
  // §CINEMA_HDRI_RACE (2026-07-24, user: "the scene capture also has some flicker or snapping at
  // the wrong frame, before the Alt-S fully applied"): _applyPhotoStaging() below kicks this load
  // off fire-and-forget — A.startCinemaOrbit's live Alt+C recording used to call it synchronously
  // then start capturing frame 0 immediately, so the HDRI envMap (real photographed reflections)
  // was still mid-fetch/mid-PMREM-generate on the early frames and popped in whenever the promise
  // happened to resolve — a real snap at a non-deterministic frame, not eyeballing. MaxQ's exporter
  // already avoids this with a "warm-up fold, discarded" (cinema_maxq.js §MAXQ warm-up) — this
  // returns a promise so the live path can await the same readiness before recorder.start() rather
  // than duplicating a fold mechanism it doesn't otherwise need. Always resolves (never rejects) —
  // load failure is a legitimate outcome (fall back to the procedural sky envMap), not a capture-
  // blocking error.
  function _ensureHdriEnvMap() {
    if (_hdriEnvMap) return Promise.resolve(_hdriEnvMap);
    if (_hdriReadyPromise) return _hdriReadyPromise;
    _hdriLoading = true;
    _hdriReadyPromise = Promise.all([import('./lib/HDRLoader.js')]).then(function(mods) {
      var _hdrMod = mods[0];
      if (!_hdrMod.HDRLoader) throw new Error('HDRLoader not exported');
      if (!_hdriPmrem) { _hdriPmrem = new THREE.PMREMGenerator(A.renderer); _hdriPmrem.compileEquirectangularShader(); }
      return new Promise(function(resolve) {
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
          resolve(_hdriEnvMap);
        }, undefined, function(err) {
          _hdriLoading = false;
          console.warn('§LAYER2_HDRI_FAIL ' + (err && err.message ? err.message : err));
          resolve(null);
        });
      });
    }).catch(function(e) {
      _hdriLoading = false;
      console.warn('§LAYER2_HDRI_FAIL ' + e.message);
      return null;
    });
    return _hdriReadyPromise;
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
    // §ALT_FRAME_LUMINANCE: HDRI is now the authoritative envMap for the whole staged session —
    // tell scene.js's updateSky() (called on the next line, and again every subsequent Alt+S/
    // Alt+C frame while staging stays on) not to silently overwrite it with a procedural PMREM
    // regen from its own 2s-throttled setTimeout — see that guard for the full race explanation.
    A._envMapHdriActive = true;
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
    A._envMapHdriActive = false;  // §ALT_FRAME_LUMINANCE: scene.js's throttled regen is safe again
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
    // §PHOTO_SHADOW_FINALCAPTURE: guarantee the frame that AO/SSGI (and MaxQ's capture) inherit
    // was checked fresh, regardless of whether the skip-gate happened to skip the last accumulation
    // tick — see effects.js _reassertPhotoShadowCoverage's `force` param.
    _reassertPhotoShadowCoverage(true);
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
      if (!A._stillRefineActive || _stillRefineRAF || A._giComposerActive || _cinemaActive) { A._stillRefineBusy = false; return; }
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
          A._stillRefineBusy = false;   // §CINEMA_ROW_BUSY: real completion — icon drops "processing"
          return;
        }
        _stillAORAF = requestAnimationFrame(stepAO);
      })();
    });
  }
  function _teardownStillRefine(reason, keepStaging) {
    A._stillRefineActive = false;
    A._stillRefineBusy = false;   // §CINEMA_ROW_BUSY safety net — any exit path clears "processing"
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
    // §CINEMA_ROW_BUSY (2026-07-18, user ask: "processing..." feedback, slower machines take a
    // few secs): distinct from _stillRefineActive, which stays true for the WHOLE frozen-still
    // lifetime (converging AND showing the finished result) — this is true only while the 16-sample
    // TAA + AO/SSGI fold is still actually converging. Cleared at every real completion point
    // (_startStillAOPhase's f>=STILL_AO_FRAMES branch, the SSGI done callback) and as a safety net
    // in _teardownStillRefine (every cancel/interaction/cinema-handoff exit), so it can never get
    // stuck true.
    A._stillRefineBusy = true;
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
  var CINEMA_TURN_OVERLAP = 0.4, CINEMA_TURN_OVERLAP_MAX = 0.5;
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
  var CINEMA_ENCLOSED_THRESHOLD = 0.6; // BVH fan fraction that counts as "genuinely enclosed"
  // Exit cost = dist × (1 − FACE_GAIN·facingDot) × perimFactor. facingDot=+1 (door dead ahead) →
  // (1-GAIN)×dist; facingDot=−1 (door behind you) → (1+GAIN)×dist. This asymmetry is the entire
  // "myriad of paths" mechanism: two poses at the SAME spot facing different ways can pick DIFFERENT
  // doors. MEASURED, not guessed: at 0.3 the swing was only ±30% and proximity drowned it completely
  // — Hospital picked the SAME door from all 6 test poses, Terminal only 2 distinct across 6.
  // §CINEMA_TRAVEL_CLASS split (2026-07-20, Phase 2 spec): GRACEFUL keeps the measured 0.8 (heading
  // genuinely steers — do not lower this one without re-running the exit-divergence probe, a low
  // gain silently collapses the whole feature). RUSHED is deliberately proximity-dominant — "for
  // those just rushing to it... short of time" — the nearest door wins outright regardless of
  // facing; this is an intentional, separate mode for the travelled-to-target case, not a
  // regression of the graceful one.
  var CINEMA_EXIT_FACE_GAIN_GRACEFUL = 0.8;
  var CINEMA_EXIT_FACE_GAIN_RUSHED = 0.1;
  var _cinemaActive = false;
  function _cinemaSmoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  // §EFFECTS_LOADED — effects.js's build fingerprint, so a pasted console can answer "is this
  // live?" by itself. Bump on EVERY behaviour change in this file.
  var EFFECTS_V = 'v12 (§CINEMA_SPACE_MEP_SKIP + §CINEMA_SPACE_ENCLOSED_SKIP + §CINEMA_GHOST_RESET)';
  console.log('§EFFECTS_LOADED ' + EFFECTS_V);

  // Inverse of scene.js's A.ifc2three (IFC X=east,Y=north,Z=up → three X=east,Y=up,Z=south).
  function _cinemaThree2Ifc(x, y, z) {
    var o = A.modelOffset || { x: 0, y: 0, z: 0 };
    return { ix: x + o.x, iy: o.y - z, iz: y + o.z };
  }

  // ══ BVH raycast fan — the ONLY "where is open space" source in this path ═══════════════════
  // storey_walkable_raster is NOT dependable (patch-shipped for 3 of 11 buildings; live logs show
  // `§HELPERS_QUERY_ERR no such table: storey_walkable_raster`). three-mesh-bvh IS monkey-patched
  // into THREE.Mesh.prototype.raycast in every session (§BVH_INIT, loader.js), so a horizontal fan
  // of rays against the REAL rendered triangles answers all three questions the opening asks:
  // "am I facing a wall", "which bearing is the largest empty space", "where is the open centre".
  // Works on every building with no extra data — nothing invented, nothing patch-gated.
  var _cineFanRay = null, _cineFanMeshes = null, _cineFanBld = null;
  function _cinemaFanMeshes() {
    if (_cineFanMeshes && _cineFanBld === A.activeBuilding) return _cineFanMeshes;
    _cineFanMeshes = (typeof A.collectMeshes === 'function') ? A.collectMeshes(function(o) {
      return (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible &&
             !o.isSprite && o.userData.staffageKind === undefined && !(A.sky && o === A.sky) &&
             !_isGhostGeometry(o);
    }) : [];
    _cineFanBld = A.activeBuilding;
    return _cineFanMeshes;
  }
  A._cinemaFanMeshesDebug = _cinemaFanMeshes;   // exposed for the §BBOX_GHOST_RAYCAST_FILTER witness harness
  // Returns { free:[N], bearings:[N], min, max, maxBearing, mean, openDir:{x,z} } — free[i] is the
  // metres of clear air along bearing i (CINEMA_FAN_FAR when nothing was hit).
  // §CINEMA_SPIN_GLAZING (2026-07-22, prompts/PHOTOREAL_STILL_RENDER.md §Issue 2, spin-at-wall):
  // glazing classes for the fan's per-ray hit classification below — "the fan's nearest hit is
  // glazing, not opaque" IS an acceptable outcome per the user's own words ("being near glass with
  // a view IS the marker of a good spot"), reusing the same curtain-wall/window family PHOTO_SPARKLE
  // already classifies for a different feature (§320 above), not a new invented grouping.
  var CINEMA_GLAZING_CLASSES = { IfcWindow: 1, IfcCurtainWall: 1, IfcPlate: 1, IfcMember: 1 };
  function _cinemaHitIsGlazing(hits) {
    if (!hits || !hits.length) return false;
    var o = hits[0].object, cls = o && o.userData && o.userData.ifcClass;
    return !!(cls && CINEMA_GLAZING_CLASSES[cls]);
  }
  function _cinemaFan(pos, nRays) {
    var N = nRays || CINEMA_FAN_RAYS;
    var out = { free: [], bearings: [], glazing: [], min: CINEMA_FAN_FAR, minGlazing: false, max: 0, maxBearing: 0, mean: 0,
                openDir: { x: 0, z: 0 }, rays: N };
    var meshes = _cinemaFanMeshes();
    if (!_cineFanRay) { _cineFanRay = new THREE.Raycaster(); _cineFanRay.firstHitOnly = true; }
    var origin = new THREE.Vector3(pos.x, pos.y, pos.z), dir = new THREE.Vector3();
    var sum = 0;
    for (var i = 0; i < N; i++) {
      var b = (i / N) * Math.PI * 2;
      var d = CINEMA_FAN_FAR, isGlazing = false;
      if (meshes.length) {
        dir.set(Math.cos(b), 0, Math.sin(b));
        _cineFanRay.set(origin, dir);
        _cineFanRay.far = CINEMA_FAN_FAR;
        var hits = null;
        try { hits = _cineFanRay.intersectObjects(meshes, true); } catch (e) { hits = null; }
        if (hits && hits.length) { d = hits[0].distance; isGlazing = _cinemaHitIsGlazing(hits); }
      }
      out.free.push(d); out.bearings.push(b); out.glazing.push(isGlazing); sum += d;
      if (d < out.min) { out.min = d; out.minGlazing = isGlazing; }
      if (d > out.max) { out.max = d; out.maxBearing = b; }
    }
    out.mean = sum / N;
    // Vector toward the more open side — the nudge that turns "in a room" into "in the middle of
    // the room" and, when the pose is nose-to-a-wall, is literally the BACKING AWAY the spec asks
    // for (the wall's bearing contributes a short vector, the open side a long one).
    for (var j = 0; j < N; j++) {
      out.openDir.x += Math.cos(out.bearings[j]) * (out.free[j] - out.mean);
      out.openDir.z += Math.sin(out.bearings[j]) * (out.free[j] - out.mean);
    }
    out.openDir.x /= N; out.openDir.z /= N;
    return out;
  }
  // Real floor under a point: downward raycast against rendered triangles (the §STAFFAGE_GROUNDSNAP
  // convention). Deliberately NOT derived from the slab stack — see the storeyH=1.91 defect above.
  function _cinemaFloorY(x, z, fromY) {
    var meshes = _cinemaFanMeshes();
    if (!meshes.length) return null;
    if (!_cineFanRay) { _cineFanRay = new THREE.Raycaster(); _cineFanRay.firstHitOnly = true; }
    _cineFanRay.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    _cineFanRay.far = 200;
    var hits = null;
    try { hits = _cineFanRay.intersectObjects(meshes, true); } catch (e) { return null; }
    return (hits && hits.length) ? hits[0].point.y : null;
  }
  // §CINEMA_PATH: the ONE shared path plan — flown identically by the live Alt+C capture and by
  // the MaxQ exporter (cinema_maxq.js). Everything derives from the CURRENT camera/sun/building at
  // call time; nothing is hardcoded per building.
  function _cinemaPathPlan(durationSec) {
    var _planT0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    var arcBboxRaw = _buildingBBoxArc();
    var arcBbox = arcBboxRaw || _buildingBBoxIfc();
    var envelope = arcBbox ? Math.max(arcBbox.xMax - arcBbox.xMin, arcBbox.yMax - arcBbox.yMin, 50) : 100;
    var boundingRadius = arcBbox
      ? 0.5 * Math.hypot(arcBbox.xMax - arcBbox.xMin, arcBbox.yMax - arcBbox.yMin, arcBbox.zMax - arcBbox.zMin)
      : envelope * 0.6;
    var radiusMin = envelope * CINEMA_RADIUS_MIN_FACTOR, radiusMax = envelope * CINEMA_RADIUS_MAX_FACTOR;
    var tiltMin = CINEMA_TILT_MIN_DEG * Math.PI / 180, tiltMax = CINEMA_TILT_MAX_DEG * Math.PI / 180;

    // ══ §CINEMA_PIVOT — MUST-FIX-FIRST (2026-07-19 root cause under every other symptom) ═══════
    // WAS: `var tgt = A.controls.target;` UNCONDITIONALLY. After any precision-pivot navigation
    // (`§precision RESET — target replanted 10 units ahead`, fires on the `a` key) the orbit target
    // is a point floating ~1.4m in front of the camera, so the whole film orbited THAT instead of
    // the building — live Terminal evidence: `r0=1.4`, `§MAXQ_START radius=0.3 height=1.4`. Every
    // other number in this plan ("largest space at building CENTRE", the orbit band, the fill
    // distance) is meaningless while the pivot is wrong.
    // NOW: the pivot is the ARC bbox centre. controls.target is accepted ONLY when it is plausibly
    // on/near the building AND not simply parked on the camera's own nose — i.e. it must sit within
    // half the bounding radius of the real centre and be at least a quarter-envelope away from the
    // camera. A replanted 10-units-ahead target fails the second test by construction.
    var camPos0 = { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z };
    var pivot = null, pivotSrc = 'controls-target';
    if (arcBbox && A.ifc2three) {
      var cLo = A.ifc2three(arcBbox.xMin, arcBbox.yMin, arcBbox.zMin);
      var cHi = A.ifc2three(arcBbox.xMax, arcBbox.yMax, arcBbox.zMax);
      pivot = { x: (cLo.x + cHi.x) / 2,
                y: Math.min(cLo.y, cHi.y) + Math.abs(cHi.y - cLo.y) * 0.35,
                z: (cLo.z + cHi.z) / 2 };
      pivotSrc = 'arc-bbox-centre';
    }
    var tgtRaw = A.controls.target;
    var tgtOffCentre = pivot ? Math.hypot(tgtRaw.x - pivot.x, tgtRaw.y - pivot.y, tgtRaw.z - pivot.z) : 0;
    var tgtOffCam = Math.hypot(tgtRaw.x - camPos0.x, tgtRaw.y - camPos0.y, tgtRaw.z - camPos0.z);
    if (!pivot) { pivot = { x: tgtRaw.x, y: tgtRaw.y, z: tgtRaw.z }; pivotSrc = 'controls-target(no-bbox)'; }
    else if (tgtOffCentre < boundingRadius * 0.5 && tgtOffCam > envelope * 0.25) {
      pivot = { x: tgtRaw.x, y: tgtRaw.y, z: tgtRaw.z }; pivotSrc = 'controls-target(plausible)';
    }
    console.log('§CINEMA_PIVOT src=' + pivotSrc + ' pivot=(' + pivot.x.toFixed(1) + ',' + pivot.y.toFixed(1) +
      ',' + pivot.z.toFixed(1) + ') targetOffCentre=' + tgtOffCentre.toFixed(1) +
      ' targetOffCam=' + tgtOffCam.toFixed(1) + ' boundingR=' + boundingRadius.toFixed(1) +
      ' envelope=' + envelope.toFixed(1));

    var dx0 = camPos0.x - pivot.x, dy0 = camPos0.y - pivot.y, dz0 = camPos0.z - pivot.z;
    var horizR0 = Math.hypot(dx0, dz0);
    var base = {
      tx: pivot.x, ty: pivot.y, tz: pivot.z,
      startRadius: Math.hypot(dx0, dy0, dz0),
      startTilt: Math.atan2(dy0, horizR0),
      startAzimuth: Math.atan2(dz0, dx0)
    };
    // Fill-frame distance: real perspective-camera trigonometry, not a guessed constant. Biased to
    // the LOOSER of the vertical/horizontal half-FOV per the original §CINEMA_PUSHIN spec, so the
    // subject genuinely fills the frame rather than sitting comfortably contained.
    var vFovRad = THREE.MathUtils.degToRad(A.camera.fov || 50);
    var aspect = A.camera.aspect || (window.innerWidth / Math.max(1, window.innerHeight));
    var hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
    var looseTan = Math.max(Math.tan(vFovRad / 2), Math.tan(hFovRad / 2));
    var fillDistance = (boundingRadius / Math.max(looseTan, 1e-3)) * CINEMA_FILL_MARGIN;
    var pushInRadius = Math.min(base.startRadius, fillDistance);

    // ══ The user's ACTUAL view at t=0 — §CINEMA_POV continuity ════════════════════════════════
    // The film must begin exactly where the camera is, looking exactly where it looks. Read the
    // camera's real world direction (NOT controls.target, which the pivot fix just proved may be
    // nonsense). yaw0 is load-bearing: it SURVIVES the whole dive (see the ease below).
    var _dir0 = new THREE.Vector3();
    A.camera.getWorldDirection(_dir0);
    if (!isFinite(_dir0.x) || (!_dir0.x && !_dir0.z)) _dir0.set(Math.cos(base.startAzimuth + Math.PI), 0, Math.sin(base.startAzimuth + Math.PI));
    var yaw0 = Math.atan2(_dir0.z, _dir0.x);
    var pitch0 = Math.asin(Math.max(-1, Math.min(1, _dir0.y)));

    // ══ §CINEMA_SPACE — largest interior space, ALWAYS searched (2026-07-20 user ruling: "abandon
    // the 'next largest room' idea... It is disastrous for sure. Just back to original 'go to
    // largest space within 4 sec'. Let user play with it"). No floor-level weighting, no multi-
    // candidate iteration — rank ALL real rooms once by the ORIGINAL area/centrality formula
    // ("largest space NEAREST TO the centre" beats the strict geometric centre — the centroid can
    // land in a service core on a big building), take the single top-ranked room, one enclosure
    // sanity check (never dive into literal open sky, e.g. a roof terrace), fall straight to
    // bbox-centre if that fails — no search through alternates. If the camera happens to already be
    // standing in the chosen room, the ease-in below is naturally a near-no-op: no special
    // "already inside" branch is needed, it falls out of the general case for free (this is also
    // WHY "already inside" and "go to the largest space" are not in tension, despite reading that
    // way at first — settling in place is just what "go to the largest space" does when you're
    // already there).
    var roomGraph = null;
    try { roomGraph = (typeof A.getRoomGraph === 'function') ? A.getRoomGraph() : null; } catch (eG) { roomGraph = null; }
    var spaceCands = [];
    if (roomGraph && roomGraph.nodesByGuid && arcBbox) {
      var ctrIx = (arcBbox.xMin + arcBbox.xMax) / 2, ctrIy = (arcBbox.yMin + arcBbox.yMax) / 2;
      for (var rk in roomGraph.nodesByGuid) {
        var rn = roomGraph.nodesByGuid[rk];
        if (!rn || rn.kind !== 'room' || !rn.rects || !rn.rects.length) continue;
        var ar = 0;
        for (var ri = 0; ri < rn.rects.length; ri++)
          ar += Math.abs(rn.rects[ri].x1 - rn.rects[ri].x0) * Math.abs(rn.rects[ri].y1 - rn.rects[ri].y0);
        if (!(ar > 0)) continue;
        var dCtr = Math.hypot(rn.cx - ctrIx, rn.cy - ctrIy);
        spaceCands.push({ guid: rn.guid, name: rn.name || rn.guid, area: ar, dCtr: dCtr,
                          ifc: { ix: rn.cx, iy: rn.cy, iz: rn.cz },
                          score: ar / (1 + dCtr / Math.max(1, envelope * 0.5)) });
      }
      spaceCands.sort(function(a, b) { return b.score - a.score; });
    }
    var bboxCentre = arcBbox ? { guid: 'bbox-centre', name: 'bbox-centre', area: 0, dCtr: 0, score: -1,
      ifc: { ix: (arcBbox.xMin + arcBbox.xMax) / 2, iy: (arcBbox.yMin + arcBbox.yMax) / 2,
             iz: arcBbox.zMin + (arcBbox.zMax - arcBbox.zMin) * 0.15 } } : null;
    var topCand = spaceCands.length ? spaceCands[0] : bboxCentre;

    var diveIfc = null, diveName = 'centre', diveArea = 0, diveSrc = 'bbox-centre';
    var dive3 = null, floorY = null, settle = null, fan = null, nudgeL = 0, enclosedFrac = 0;

    function _cinemaEvalCand(cand) {
      var c3 = A.ifc2three(cand.ifc.ix, cand.ifc.iy, cand.ifc.iz);
      var fy = _cinemaFloorY(c3.x, c3.z, c3.y + 2.5);
      if (fy === null) fy = _cinemaFloorY(c3.x, c3.z, c3.y + 25);
      if (fy === null && arcBbox) fy = A.ifc2three(0, 0, arcBbox.zMin).y;
      var st = { x: c3.x, y: (fy === null ? c3.y : fy) + CINEMA_EYE_M, z: c3.z };
      var f = _cinemaFan(st, CINEMA_FAN_RAYS);
      var hit = 0;
      for (var fi = 0; fi < f.free.length; fi++) if (f.free[fi] < CINEMA_FAN_FAR - 0.01) hit++;
      return { c3: c3, fy: fy, st: st, f: f, frac: hit / f.free.length };
    }

    // §CINEMA_SPACE_ENCLOSED_SKIP (2026-07-21, user ruling: keep the #925 any-floor "largest space"
    // ranking EXACTLY as-is — no floor weighting, no re-ranking — but stop letting a single
    // disqualified top candidate fall straight to bbox-centre. Real bug, DB-confirmed live on
    // Terminal/Hospital: the #1 candidate can be a SUSPECT_OPEN/genuinely-unenclosed space (measured
    // enclosed=0%), and bbox-centre itself then measured enclosed=0% too — landing the dive nowhere
    // real. This is NOT the "next largest room" iteration the user called disastrous and abandoned in
    // #925 (that combined iteration WITH floor-level re-scoring, so which room won jumped around
    // unpredictably floor to floor). Here the order never changes — same area/centrality score, same
    // sort — this only SKIPS a candidate that fails the existing enclosure sanity check, same threshold
    // that already existed. Bounded to the top 6 (same cap R2 used before #925 removed floor-weighting,
    // reused here for its own sake, not because floor-weighting is back).
    // §CINEMA_SPACE_MEP_SKIP (2026-07-21, user report + DB-confirmed live on Hospital: dive landed
    // in RM_Level_2_20, 270m^2, 97% "enclosed" by the ray-fan — but it's a rooftop MECHANICAL PLANT
    // room, not a habitable space. rel_contained_in_space: 304 IfcPipeFitting + 290 IfcPipeSegment +
    // 49 IfcDuctFitting + 14 IfcDistributionControlElement + 11 IfcFireSuppressionTerminal of ~858
    // total contained (78%), with only 2 IfcSlab elements found anywhere above its footprint — an
    // open plant yard screened by walls, not a real room. §CINEMA_SPACE_ENCLOSED_SKIP's ray-fan is
    // horizontal-only (_cinemaFan: dir.set(cos,0,sin) — no vertical component), so it structurally
    // cannot see "no roof," only "no walls" — walls-for-screening pass it fine. Area/centrality
    // ranking alone can't tell a plant room from a ward either — MEP rooms are often large. This is
    // a SEPARATE disqualifier, same "skip and keep looking" pattern as the enclosure check, not a
    // replacement for it — both must pass.
    var CINEMA_MEP_CLASSES = { IfcPipeFitting: 1, IfcPipeSegment: 1, IfcDuctFitting: 1, IfcDuctSegment: 1,
      IfcDistributionControlElement: 1, IfcFireSuppressionTerminal: 1, IfcFlowTerminal: 1,
      IfcFlowController: 1, IfcFlowFitting: 1, IfcFlowSegment: 1, IfcFlowStorageDevice: 1,
      IfcFlowTreatmentDevice: 1, IfcFlowMovingDevice: 1, IfcEnergyConversionDevice: 1,
      IfcCableSegment: 1, IfcCableFitting: 1, IfcCableCarrierSegment: 1, IfcCableCarrierFitting: 1,
      IfcTank: 1, IfcBoiler: 1, IfcChiller: 1, IfcCompressor: 1, IfcCondenser: 1, IfcCoolingTower: 1,
      IfcPump: 1, IfcFan: 1 };
    var CINEMA_MEP_SKIP_MIN_TOTAL = 20;  // guard against tiny-sample false positives
    var CINEMA_MEP_SKIP_FRACTION = 0.5;  // majority of contained elements are plant/services classes
    function _cinemaMepFraction(guid) {
      var rows = A.dbQuery ? A.dbQuery(
        "SELECT m.ifc_class, COUNT(*) FROM rel_contained_in_space r " +
        "JOIN elements_meta m ON m.guid=r.element_guid WHERE r.space_guid=? GROUP BY m.ifc_class",
        [guid]) : [];
      if (!rows.length) return 0;
      var total = 0, mep = 0;
      for (var i = 0; i < rows.length; i++) {
        total += rows[i][1];
        if (CINEMA_MEP_CLASSES[rows[i][0]]) mep += rows[i][1];
      }
      return total >= CINEMA_MEP_SKIP_MIN_TOTAL ? mep / total : 0;
    }

    var CINEMA_SPACE_TRY_MAX = 6;
    var chosenCand = null, chosenEv = null;
    for (var sci = 0; sci < Math.min(spaceCands.length, CINEMA_SPACE_TRY_MAX); sci++) {
      var sc = spaceCands[sci];
      var scEv = _cinemaEvalCand(sc);
      var mepFrac = _cinemaMepFraction(sc.guid);
      var mepSkip = mepFrac >= CINEMA_MEP_SKIP_FRACTION;
      var okCand = scEv.frac >= CINEMA_ENCLOSED_THRESHOLD && !mepSkip;
      console.log('§CINEMA_SPACE cand=' + sc.guid + ' area=' + sc.area.toFixed(1) +
        ' enclosed=' + (scEv.frac * 100).toFixed(0) + '%' +
        ' mep=' + (mepFrac * 100).toFixed(0) + '% chosen=' + okCand +
        (sci > 0 ? ' (rank=' + (sci + 1) + ', skipped ' + sci + ' disqualified above)' : ''));
      if (okCand) { chosenCand = sc; chosenEv = scEv; break; }
    }
    if (chosenCand) {
      diveIfc = chosenCand.ifc; diveName = chosenCand.name; diveArea = chosenCand.area;
      diveSrc = 'room-graph';
      dive3 = chosenEv.c3; floorY = chosenEv.fy; settle = { x: chosenEv.st.x, y: chosenEv.st.y, z: chosenEv.st.z };
      fan = chosenEv.f; enclosedFrac = chosenEv.frac;
    } else if (bboxCentre) {
      // Every real candidate tried failed enclosure (or none existed) — fall to bbox-centre, same
      // last-resort this always had.
      var evB = _cinemaEvalCand(bboxCentre);
      diveIfc = bboxCentre.ifc; diveName = 'bbox-centre'; diveArea = 0;
      diveSrc = 'bbox-centre (no enclosed candidate among top ' + Math.min(spaceCands.length, CINEMA_SPACE_TRY_MAX) + ')';
      dive3 = evB.c3; floorY = evB.fy; settle = { x: evB.st.x, y: evB.st.y, z: evB.st.z }; fan = evB.f; enclosedFrac = evB.frac;
      console.log('§CINEMA_SPACE cand=bbox-centre area=0.0 enclosed=' + (evB.frac * 100).toFixed(0) + '% chosen=true (fallback)');
    }
    if (!settle) { settle = { x: pivot.x, y: pivot.y, z: pivot.z }; fan = _cinemaFan(settle, CINEMA_FAN_RAYS); }
    // BVH fan nudge: slide toward the open side so we land in the MIDDLE of the space rather than
    // against a wall. Bounded, so it can never wander out of the room. When the pose is nose-to-a-
    // wall this IS the "backing away" the spec asks for.
    // §CINEMA_SPIN_GLAZING (2026-07-22, §Issue 2 spin-at-wall): the 3m cap can leave `settle` still
    // close to geometry in a large/elongated room (root cause named in the spec). Per the user's
    // own words, being close to GLAZING is fine as-is — only extend the nudge when what's actually
    // nearby is opaque (a real wall) AND the true open point is farther than the normal cap allows.
    var nudgeCap = CINEMA_FAN_NUDGE_MAX;
    if (fan.min < CINEMA_FAN_NUDGE_MAX && !fan.minGlazing) nudgeCap = CINEMA_FAN_NUDGE_MAX * 3;
    nudgeL = Math.hypot(fan.openDir.x, fan.openDir.z);
    if (nudgeL > 0.01) {
      var nk = Math.min(1, nudgeCap / nudgeL);
      settle.x += fan.openDir.x * nk; settle.z += fan.openDir.z * nk;
    }
    // "Facing a wall" is not a branch — it is just a short free-distance along yaw0, reported so a
    // pasted console shows WHY the opening backed away. The nudge above IS the backing-away.
    var wallIdx = Math.round(((yaw0 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * fan.rays) % fan.rays;
    // §CINEMA_TRAVEL_CLASS (2026-07-20 user spec, Phase 2): whether a real dive happened (settle far
    // from where the camera started) governs the exit-choice mood downstream — "for those just
    // rushing to it... short of time" (nearest, quick) vs "already there... you have time" (graceful,
    // prefer the facing-matched exit). A near-zero diveDist means "already there" for free — no
    // special-case detection needed, see the §CINEMA_SPACE comment above.
    var diveDist = Math.hypot(settle.x - camPos0.x, settle.y - camPos0.y, settle.z - camPos0.z);
    var CINEMA_TRAVEL_THRESHOLD_M = 3;
    var hadToTravel = diveDist > CINEMA_TRAVEL_THRESHOLD_M;
    console.log('§CINEMA_DIVE src=' + diveSrc + ' space="' + diveName + '" areaM2=' + diveArea.toFixed(1) +
      ' settle=(' + settle.x.toFixed(1) + ',' + settle.y.toFixed(1) + ',' + settle.z.toFixed(1) + ')' +
      ' floorY=' + (floorY === null ? 'n/a' : floorY.toFixed(2)) + ' eye=' + CINEMA_EYE_M +
      ' fanMin=' + fan.min.toFixed(1) + ' fanMax=' + fan.max.toFixed(1) + ' fanMean=' + fan.mean.toFixed(1) +
      ' openBearing=' + (fan.maxBearing * 180 / Math.PI).toFixed(0) + '°' +
      ' facingFree=' + fan.free[wallIdx].toFixed(1) + ' nudge=' + Math.min(nudgeL, nudgeCap).toFixed(2) + 'm' +
      ' fanMinGlazing=' + fan.minGlazing + ' nudgeCap=' + nudgeCap +
      ' enclosed=' + (enclosedFrac * 100).toFixed(0) + '%' +
      ' yaw0=' + (yaw0 * 180 / Math.PI).toFixed(1) + '° pitch0=' + (pitch0 * 180 / Math.PI).toFixed(1) + '°' +
      ' diveDist=' + diveDist.toFixed(1) + 'm');

    // ══ §CINEMA_EXIT — chosen at the 4-second mark by POSITION **and** FACING ══════════════════
    // WAS: one global `entrance = widest-ground-door` for the whole building — every film on a
    // building took the same door, which is exactly what collapsed "a myriad of paths" into one.
    // NOW: per-run, from the REAL door set the room graph already exposes ('exit' nodes = the
    // name-filtered non-room doors, i.e. the ways OUT), scored against where we are standing and
    // which way we are looking at t=4s. Falls back to the DB's IfcDoor rows if a building has no
    // graph. Logged in full so a pasted console explains why a film went the way it did — the user
    // is learning this lever, so the cause must be visible.
    var exitCands = [];
    if (roomGraph && roomGraph.nodesByGuid) {
      for (var ek in roomGraph.nodesByGuid) {
        var en = roomGraph.nodesByGuid[ek];
        if (!en || en.kind !== 'exit' || en.cx == null) continue;
        exitCands.push({ guid: en.guid, name: en.name || en.guid, ifc: { ix: en.cx, iy: en.cy, iz: en.cz } });
      }
    }
    var exitSrc = exitCands.length ? 'room-graph-exit-nodes' : 'db-doors';
    if (!exitCands.length && A.dbQuery) {
      try {
        var drows = A.dbQuery(
          "SELECT et.guid, em.element_name, et.center_x, et.center_y, et.center_z " +
          "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
          "WHERE em.ifc_class LIKE 'IfcDoor%' AND et.center_x IS NOT NULL ORDER BY et.center_z ASC LIMIT 400") || [];
        for (var dj = 0; dj < drows.length; dj++)
          exitCands.push({ guid: drows[dj][0], name: drows[dj][1] || drows[dj][0],
                           ifc: { ix: drows[dj][2], iy: drows[dj][3], iz: drows[dj][4] } });
      } catch (eD) { /* no doors — the facade fallback below covers it */ }
    }
    var chosenExit = null, exitScored = [];
    for (var xi = 0; xi < exitCands.length; xi++) {
      var xp = A.ifc2three(exitCands[xi].ifc.ix, exitCands[xi].ifc.iy, exitCands[xi].ifc.iz);
      var xd = Math.hypot(xp.x - settle.x, xp.z - settle.z);
      if (!(xd > 0.01)) continue;
      var xb = Math.atan2(xp.z - settle.z, xp.x - settle.x);
      var facingDot = Math.cos(xb - yaw0);
      // A door is a way OUT to the degree it sits on the building's PERIMETER — measured, not
      // guessed: distance from the door's own centre to the nearest edge of the real ARC footprint,
      // as a fraction of the footprint's half-width. Deep-interior doors (Duplex's fallback set is
      // all M_Single-Flush room doors) are penalised so the film leaves the building rather than
      // stepping into the next room. Room-graph 'exit' nodes are already the non-room doors, so
      // this only ever refines the DB fallback set.
      var perim = 1;
      if (arcBbox) {
        var eIfc = exitCands[xi].ifc;
        var edge = Math.min(eIfc.ix - arcBbox.xMin, arcBbox.xMax - eIfc.ix,
                            eIfc.iy - arcBbox.yMin, arcBbox.yMax - eIfc.iy);
        var half = Math.max(1, Math.min(arcBbox.xMax - arcBbox.xMin, arcBbox.yMax - arcBbox.yMin) / 2);
        perim = 1 + Math.max(0, Math.min(1, edge / half));   // on the edge → 1.0, dead centre → 2.0
      }
      var faceGain = hadToTravel ? CINEMA_EXIT_FACE_GAIN_RUSHED : CINEMA_EXIT_FACE_GAIN_GRACEFUL;
      var cost = xd * (1 - faceGain * facingDot) * perim;
      var rec = { guid: exitCands[xi].guid, name: exitCands[xi].name, p: xp, dist: xd,
                  bearing: xb, facingDot: facingDot, perim: perim, cost: cost };
      exitScored.push(rec);
      if (!chosenExit || cost < chosenExit.cost) chosenExit = rec;
    }
    if (!chosenExit) {
      // No door data at all → leave through the nearest facade, still from where we settled.
      var fx = (settle.x < pivot.x) ? -1 : 1, fz = (settle.z < pivot.z) ? -1 : 1;
      var useX = Math.abs(settle.x - pivot.x) >= Math.abs(settle.z - pivot.z);
      var fp = { x: useX ? pivot.x + fx * envelope * 0.5 : settle.x, y: settle.y,
                 z: useX ? settle.z : pivot.z + fz * envelope * 0.5 };
      chosenExit = { guid: 'nearest-facade', name: 'nearest-facade', p: fp,
                     dist: Math.hypot(fp.x - settle.x, fp.z - settle.z),
                     bearing: Math.atan2(fp.z - settle.z, fp.x - settle.x), facingDot: 0, cost: 0 };
      exitSrc = 'facade-fallback';
    }
    exitScored.sort(function(a, b) { return a.cost - b.cost; });
    console.log('§CINEMA_EXIT chosen=' + chosenExit.guid + ' name="' + chosenExit.name + '" dist=' +
      chosenExit.dist.toFixed(1) + ' facingDot=' + chosenExit.facingDot.toFixed(3) +
      ' perimFactor=' + (chosenExit.perim || 1).toFixed(2) + ' cost=' +
      chosenExit.cost.toFixed(1) + ' src=' + exitSrc + ' candidates=' + exitScored.length +
      ' runnerUp=' + (exitScored[1] ? exitScored[1].guid + '@' + exitScored[1].cost.toFixed(1) : 'none') +
      ' hadToTravel=' + hadToTravel + ' diveDist=' + diveDist.toFixed(1) + 'm mood=' + (hadToTravel ? 'rushed' : 'graceful'));

    // Route out: ride the building's OWN room/corridor graph when it has one (wall-legal, the same
    // RoomGraph the Fly tour uses); straight line otherwise — then a wall clip is the model's data
    // gap, not the orbit's (settled user doctrine).
    var outWp = [{ x: settle.x, y: settle.y, z: settle.z }], outRoute = 'line';
    try {
      var RG2 = window.RoomGraph;
      if (roomGraph && roomGraph.nodesByGuid && RG2 && RG2.shortestPath && chosenExit.guid.indexOf('EXIT::') === 0) {
        var nearN = null, nearD = 1e18;
        for (var nk2 in roomGraph.nodesByGuid) {
          var nn2 = roomGraph.nodesByGuid[nk2];
          if (!nn2 || nn2.cx == null || (nn2.kind !== 'room' && nn2.kind !== 'circ')) continue;
          var np = A.ifc2three(nn2.cx, nn2.cy, nn2.cz);
          var nd = Math.hypot(np.x - settle.x, np.z - settle.z);
          if (nd < nearD) { nearD = nd; nearN = nn2; }
        }
        if (nearN) {
          var sp2 = RG2.shortestPath(roomGraph, nearN.guid, chosenExit.guid);
          if (sp2 && sp2.path && sp2.path.length) {
            for (var pi = 0; pi < sp2.path.length; pi++) {
              var pn = roomGraph.nodesByGuid[sp2.path[pi]];
              if (!pn || pn.cx == null) continue;
              var pp = A.ifc2three(pn.cx, pn.cy, pn.cz);
              outWp.push({ x: pp.x, y: pp.y + CINEMA_EYE_M, z: pp.z });
            }
            if (outWp.length > 1) outRoute = 'graph';
          }
        }
      }
    } catch (eR) { console.warn('§CINEMA_EXIT route failed: ' + eR.message); }
    outWp.push({ x: chosenExit.p.x, y: chosenExit.p.y + CINEMA_EYE_M * 0.5, z: chosenExit.p.z });
    // Push past the doorway, outward from the pivot, so we genuinely emerge into open air.
    var odx = chosenExit.p.x - pivot.x, odz = chosenExit.p.z - pivot.z;
    var odL = Math.hypot(odx, odz) || 1; odx /= odL; odz /= odL;
    var exitOuter = { x: chosenExit.p.x + odx * Math.max(8, envelope * 0.15),
                      y: chosenExit.p.y + CINEMA_EYE_M,
                      z: chosenExit.p.z + odz * Math.max(8, envelope * 0.15) };
    outWp.push(exitOuter);
    var segLen = [0];
    for (var wi = 1; wi < outWp.length; wi++)
      segLen.push(segLen[wi - 1] + Math.hypot(outWp[wi].x - outWp[wi - 1].x,
                                              outWp[wi].y - outWp[wi - 1].y,
                                              outWp[wi].z - outWp[wi - 1].z));
    var totalLen = segLen[segLen.length - 1] || 1;
    function _outPos(f) {
      var want = Math.max(0, Math.min(1, f)) * totalLen;
      for (var i2 = 1; i2 < outWp.length; i2++) {
        if (want <= segLen[i2] || i2 === outWp.length - 1) {
          var seg = (segLen[i2] - segLen[i2 - 1]) || 1;
          var lf = Math.max(0, Math.min(1, (want - segLen[i2 - 1]) / seg));
          return { x: outWp[i2 - 1].x + (outWp[i2].x - outWp[i2 - 1].x) * lf,
                   y: outWp[i2 - 1].y + (outWp[i2].y - outWp[i2 - 1].y) * lf,
                   z: outWp[i2 - 1].z + (outWp[i2].z - outWp[i2 - 1].z) * lf };
        }
      }
      return outWp[outWp.length - 1];
    }
    // The spin's destination bearing: the FIRST leg of the route out, so the spin ends looking
    // exactly where the walk begins (no seam between the two beats).
    var firstLeg = outWp.length > 1 ? outWp[1] : exitOuter;
    var spinTo = Math.atan2(firstLeg.z - settle.z, firstLeg.x - settle.x);
    var dYaw = spinTo - yaw0;
    while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    // §CINEMA_SPIN_MOTIVATED (2026-07-20 Phase 2 spec — replaces the old "always extend small
    // angles into a full lap" rule): a turn must be MOTIVATED, never forced. User: "if it is facing
    // the nearest exit, [skip the spin, glide straight there]... if the nearest is behind then turn
    // around to it, helps shows around the place." Three cases, by how far off yaw0 already is from
    // the exit's own approach bearing:
    //   - already facing it (within CINEMA_FACING_SKIP_DEG) → no turn at all, dYaw=0. Beat 2 still
    //     plays for its time budget but with no rotation — a graceful settle, not a forced spin.
    //   - roughly BEHIND (beyond CINEMA_BEHIND_DEG) → turn the LONG way around (the old "extend to a
    //     full lap" behaviour survives here specifically, since a longer sweep IS what "helps shows
    //     around the place" for this case).
    //   - anywhere in between → turn directly, no artificial extension.
    var CINEMA_FACING_SKIP_DEG = 20, CINEMA_BEHIND_DEG = 120;
    var dYawAbsDeg = Math.abs(dYaw) * 180 / Math.PI;
    if (dYawAbsDeg < CINEMA_FACING_SKIP_DEG) {
      dYaw = 0;
    } else if (dYawAbsDeg > CINEMA_BEHIND_DEG) {
      dYaw += (dYaw >= 0 ? 1 : -1) * 2 * Math.PI;
    }
    console.log('§CINEMA_SPIN dYawRawDeg=' + dYawAbsDeg.toFixed(1) + ' class=' +
      (dYawAbsDeg < CINEMA_FACING_SKIP_DEG ? 'already-facing(no-spin)' : dYawAbsDeg > CINEMA_BEHIND_DEG ? 'behind(full-lap)' : 'direct-turn') +
      ' finalSpinDeg=' + (dYaw * 180 / Math.PI).toFixed(1));

    // ══ The exterior act — SHAPE depends on whether the Sun-crossing falls in the first or second
    // half of the loop (2026-07-20 Phase 3 spec, user): "a different angle outside will determine
    // if the Sun reflect is happening first or last. If first stay eye level to catch the reflect.
    // Then raise cam to see from above the closing sec rotation of the building. If last, then rise
    // gracefully but catch the reflecting Sun to end, which last 2 sec should slow down not abrupt
    // stop." exitAz (hence swoopU) is an emergent consequence of the chosen exit, itself driven by
    // where the user started/faced — this IS the "angle of start correlates dynamically" lever. ══
    var exitAz = Math.atan2(exitOuter.z - pivot.z, exitOuter.x - pivot.x);
    var sunAz = A.sun ? Math.atan2(A.sun.position.z - pivot.z, A.sun.position.x - pivot.x) : exitAz + Math.PI;
    var lookdownTilt = Math.max(tiltMin, Math.min(tiltMax, CINEMA_LOOKDOWN_DEG * Math.PI / 180));
    var flatTiltRad = THREE.MathUtils.degToRad(CINEMA_FLAT_TILT_DEG);
    var orbitRadius = Math.max(radiusMin, Math.min(radiusMax, fillDistance));

    // ══ Beat boundaries, in normalized time. Fixed SECONDS, so a longer film gets a longer orbit,
    // never a longer dive (§CINEMA_SIMPLE: the dive is time-boxed at 4s and must not be clamped).
    // Computed BEFORE _orbitPose because loopSec (needed to convert the swoop/hold/descent SECONDS
    // constants into this act's own u-domain) depends on tR, and _orbitPose(0) is called immediately
    // after to seed the Beat 4 handoff target. ═══════════════════════════════════════════════════
    var tD = Math.min(0.30, CINEMA_DIVE_SEC / durationSec);
    var tS = Math.min(0.42, tD + CINEMA_SPIN_SEC / durationSec);
    var tO = Math.min(0.62, tS + CINEMA_OUT_SEC / durationSec);
    var tR = Math.min(0.72, tO + CINEMA_RISE_SEC / durationSec);
    console.log('§CINEMA_BEATS dive=' + tD.toFixed(3) + ' spin=' + tS.toFixed(3) + ' out=' + tO.toFixed(3) +
      ' rise=' + tR.toFixed(3) + ' (dur=' + durationSec.toFixed(1) + 's) route=' + outRoute +
      ' waypoints=' + outWp.length + ' pathLen=' + totalLen.toFixed(1) +
      ' spinDeg=' + Math.round(dYaw * 180 / Math.PI));

    var loopSec = Math.max(1e-3, (1 - tR) * durationSec);
    var swoopU = (((sunAz - exitAz) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
    var sunFirst = swoopU < 0.5;
    var flatHoldU = Math.min(0.45, CINEMA_FLAT_HOLD_SEC / loopSec);
    var descentMinU = Math.min(0.30, CINEMA_DESCENT_MIN_SEC / loopSec);
    var climbMinU = Math.min(0.30, CINEMA_CLIMB_MIN_SEC / loopSec);
    var entryTilt, holdU = 0, descentStartU = 1, holdStartU = 1, climbStartU = 0, climbEndU = 0, caughtSun;

    if (sunFirst) {
      // Start FLAT (catch the reflection right away — the camera is flat from u=0 straight through
      // the crossing, not just an instant), THEN climb once to the look-down for the remainder,
      // ending ELEVATED. No flat-ending descent in this branch; the "flat" beat already happened
      // at the OPENING instead of the close.
      entryTilt = flatTiltRad;
      climbStartU = swoopU;
      climbEndU = Math.min(0.95, climbStartU + climbMinU);
      caughtSun = true;
    } else {
      // Rise gracefully early (the original sun-hold logic: don't climb into the look-down while
      // the Sun sits near the EXIT heading, take it right after), cruise at look-down, then glide
      // back DOWN to flat at the Sun-crossing as the finale (§CINEMA_FLAT_ENDING, R3 redesign —
      // replaces the old dip-and-recover swoop; a SINGLE monotonic glide, never a dip that climbs
      // back up). The descent starts AT the crossing when there's room for both the minimum glide
      // and the mandated hold afterward; otherwise as late as that room allows — still monotonic,
      // still ends flat with the full hold, just without the Sun necessarily lining up ("Catch the
      // Sun is luck", per the user's own framing).
      var sunDelta = exitAz - sunAz;
      while (sunDelta > Math.PI) sunDelta -= 2 * Math.PI;
      while (sunDelta < -Math.PI) sunDelta += 2 * Math.PI;
      var sunGuardRad = CINEMA_SUN_GUARD_DEG * Math.PI / 180;
      var sunHold = Math.abs(sunDelta) < sunGuardRad;
      holdU = sunHold ? Math.min(0.35, (sunGuardRad - Math.abs(sunDelta) + sunGuardRad) / (2 * Math.PI)) : 0;
      entryTilt = sunHold ? Math.max(tiltMin, lookdownTilt * 0.35) : lookdownTilt;
      holdStartU = 1 - flatHoldU;
      var latestDescentStartU = Math.max(holdU, holdStartU - descentMinU);
      descentStartU = Math.max(holdU, Math.min(swoopU, latestDescentStartU));
      caughtSun = Math.abs(swoopU - descentStartU) < 1e-6;
    }
    console.log('§CINEMA_SUN_ORDER exitAzDeg=' + (exitAz * 180 / Math.PI).toFixed(1) + ' sunAzDeg=' +
      (sunAz * 180 / Math.PI).toFixed(1) + ' swoopU=' + swoopU.toFixed(3) + ' (~' + (swoopU * loopSec).toFixed(1) +
      's) sunFirst=' + sunFirst + ' loopSec=' + loopSec.toFixed(1) + ' caughtSun=' + caughtSun +
      ' entryTiltDeg=' + (entryTilt * 180 / Math.PI).toFixed(1) + ' lookdownDeg=' + (lookdownTilt * 180 / Math.PI).toFixed(1));
    if (sunFirst) {
      console.log('§CINEMA_RISE_ENDING climbStartU=' + climbStartU.toFixed(3) + ' (~' + (climbStartU * loopSec).toFixed(1) +
        's) climbEndU=' + climbEndU.toFixed(3) + ' (~' + (climbEndU * loopSec).toFixed(1) + 's)');
    } else {
      console.log('§CINEMA_FLAT_ENDING descentStartU=' + descentStartU.toFixed(3) + ' (~' + (descentStartU * loopSec).toFixed(1) +
        's) holdStartU=' + holdStartU.toFixed(3) + ' (~' + (holdStartU * loopSec).toFixed(1) +
        's) flatTiltDeg=' + CINEMA_FLAT_TILT_DEG);
    }

    // §CINEMA_END_DECEL (2026-07-20, overall "no abruptness" rule): the film just CUTS at u=1 while
    // the camera is still actively orbiting at a constant angular rate — that reads as the recording
    // being cut off mid-move, not a deliberate close. Ease the azimuthal rate to zero over the final
    // CINEMA_END_DECEL_SEC instead, so the whole camera motion (not just tilt) settles before the
    // cut. f(t)=t+t^2-t^3 is the unique cubic with f(0)=0, f(1)=1, f'(0)=1, f'(1)=0 — it matches the
    // constant rate=1 coming in from the linear portion and eases exactly to rate=0 by the end, so
    // there is no kink at the window boundary, only at the (now motionless) very end.
    // §CINEMA_TIMING_672 (2026-07-24, user: "ensure last 3 sec is a roll to stop"... "in short, all
    // throughout must be smooth, no jerks"): ONE symmetric ease, same CINEMA_END_DECEL_SEC duration
    // used at BOTH ends — not two separately-tuned mechanisms. Without the start half, Beat 4's
    // straight-line glide (rate=0) handed off directly into Beat 5's constant rotation (rate=1) with
    // an actual instantaneous jump in angular velocity — a real jerk at the orbit's own start, same
    // class of abruptness as the cut this was already built to avoid at the end. Cap raised 0.25→0.4
    // so the full 3s survives now that the orbit itself is shorter (~8s, dive/out grew and the
    // exterior orbit gives way to them — see CINEMA_N_FRAMES above); at loopSec=8, 3/8=0.375 would
    // otherwise get truncated by the old 0.25 ceiling.
    var easeU = Math.min(0.4, CINEMA_END_DECEL_SEC / loopSec);
    function _cinemaEaseCubic(t) { return t + t * t - t * t * t; }  // f(0)=0,f(1)=1,f'(0)=1,f'(1)=0 — no kink against a slope-1 linear run
    function _cinemaAzU(u) {
      if (easeU > 0 && u < easeU) {
        var s = u / easeU;
        return easeU * (1 - _cinemaEaseCubic(1 - s));  // mirror of the cubic below: rate ramps 0→1 into the linear middle
      }
      var u0 = 1 - easeU;
      if (easeU <= 0 || u <= u0) return u;
      var t = (u - u0) / easeU;
      return u0 + easeU * _cinemaEaseCubic(t);  // rate ramps 1→0, the roll to a stop
    }
    console.log('§CINEMA_SMOOTH_ORBIT easeU=' + easeU.toFixed(3) + ' (~' + (easeU * loopSec).toFixed(1) +
      's each end) loopSec=' + loopSec.toFixed(1));

    // ══ The standard ending: one plain orbit off the side we emerged on, with the classic wide
    // pull-back flourish. Same close for EVERY film (§CINEMA_SIMPLE decision 2 — the reciprocal
    // ending is retired). No handoff branch, hence no ~10.8m step. ═══════════════════════════════
    function _orbitPose(u) {
      u = Math.max(0, Math.min(1, u));
      var az = exitAz + _cinemaAzU(u) * Math.PI * 2;
      var tilt, ellOut = 1;
      if (sunFirst) {
        if (u <= climbStartU) {
          tilt = entryTilt;
        } else if (u <= climbEndU) {
          var climbW = _cinemaSmoothstep((u - climbStartU) / Math.max(1e-6, climbEndU - climbStartU));
          tilt = entryTilt + (lookdownTilt - entryTilt) * climbW;
        } else {
          tilt = lookdownTilt;
        }
      } else {
        tilt = entryTilt + (lookdownTilt - entryTilt) * (holdU > 0 ? _cinemaSmoothstep(u / holdU) : 1);
        // §CINEMA_FLAT_ENDING: past descentStartU, ease MONOTONICALLY toward flat and hold — never a
        // separate dip-and-recover. u<descentStartU is untouched; u>=holdStartU is exactly flatTiltRad.
        if (u > descentStartU) {
          var descentW = _cinemaSmoothstep(Math.min(1, (u - descentStartU) / Math.max(1e-6, holdStartU - descentStartU)));
          tilt = tilt + (flatTiltRad - tilt) * descentW;
          ellOut = 1 - descentW;   // the radius wobble ramps OUT across the same glide, dead calm by the hold
        }
      }
      // Ellipse ramps in from exactly 0 at u=0 so the orbit begins precisely where the rise ended,
      // ramps back OUT (ellOut) across the flat-ending glide (sunLast only — sunFirst has no
      // equivalent damping need, its ending is elevated and the end-decel window below already
      // calms the sweep), and is further damped by the universal end-deceleration window.
      var endW = (u > 1 - easeU) ? Math.max(0, 1 - (u - (1 - easeU)) / easeU) : 1;
      var ell = 1 + CINEMA_ELLIPTICITY * _cinemaSmoothstep(u / 0.15) * ellOut * endW * Math.cos(2 * (az - exitAz));
      var radius = orbitRadius * ell;
      if (u > CINEMA_PULLBACK_START) {
        var pb = _cinemaSmoothstep((u - CINEMA_PULLBACK_START) / (1 - CINEMA_PULLBACK_START));
        radius *= 1 + (CINEMA_PULLBACK_SCALE - 1) * pb;
      }
      var hr = radius * Math.cos(tilt);
      return { x: pivot.x + hr * Math.cos(az), y: pivot.y + radius * Math.sin(tilt),
               z: pivot.z + hr * Math.sin(az), tx: pivot.x, ty: pivot.y, tz: pivot.z };
    }
    var orbitStart = _orbitPose(0);

    function poseAt(tNorm) {
      tNorm = Math.max(0, Math.min(1, tNorm));
      if (tNorm <= tD) {
        // ── Beat 1: the 4s ease IN. Position → the settle point; PITCH → level; HEIGHT → eye
        // level; HEADING **UNTOUCHED**. That last one is load-bearing (§CINEMA_SIMPLE call 1): the
        // exit is chosen at t=4s by position AND facing, so if the ease were free to re-aim you at
        // the space centre, every film on a building would face the same way here, pick the same
        // door, and the whole feature would collapse to one film per building.
        var e = _cinemaSmoothstep(tD > 0 ? tNorm / tD : 1);
        var px = camPos0.x + (settle.x - camPos0.x) * e;
        var py = camPos0.y + (settle.y - camPos0.y) * e;
        var pz = camPos0.z + (settle.z - camPos0.z) * e;
        var pit = pitch0 * (1 - e);                       // upside-down / looking-down → upright
        var cp = Math.cos(pit);
        return { x: px, y: py, z: pz,
                 tx: px + Math.cos(yaw0) * 20 * cp, ty: py + Math.sin(pit) * 20, tz: pz + Math.sin(yaw0) * 20 * cp };
      }
      if (tNorm <= tS) {
        // ── Beat 2: the clock is up. Spin in place — the SEARCH for the way out.
        var e2 = _cinemaSmoothstep((tNorm - tD) / Math.max(1e-6, tS - tD));
        var yaw = yaw0 + dYaw * e2;
        return { x: settle.x, y: settle.y, z: settle.z,
                 tx: settle.x + Math.cos(yaw) * 20, ty: settle.y, tz: settle.z + Math.sin(yaw) * 20 };
      }
      if (tNorm <= tO) {
        // ── Beat 3: walk it out through the door the pose chose.
        var e3 = _cinemaSmoothstep((tNorm - tS) / Math.max(1e-6, tO - tS));
        var p3 = _outPos(e3);
        // §CINEMA_TIMING_672 (2026-07-24, user: "no chasing interim targets when exiting building
        // mostly"): 0.06→0.15. Position already moves at constant speed along the route; this
        // lookahead point only steers where the camera LOOKS. On a multi-waypoint room-graph route
        // (a corridor with turns), the instant this window crosses a corner the look-at direction
        // swung hard onto the next segment — a real gaze snap, not just position. A wider window
        // means the look-at is further past any given corner while still approaching it, so the
        // direction change is spread out instead of happening in one frame.
        var ah = _outPos(Math.min(1, e3 + 0.15));
        if (Math.hypot(ah.x - p3.x, ah.z - p3.z) < 0.5) ah = { x: p3.x + odx * 20, y: p3.y, z: p3.z + odz * 20 };
        var ad = Math.hypot(ah.x - p3.x, ah.y - p3.y, ah.z - p3.z) || 1;
        var aheadTx = p3.x + (ah.x - p3.x) / ad * 20, aheadTy = p3.y + (ah.y - p3.y) / ad * 20, aheadTz = p3.z + (ah.z - p3.z) / ad * 20;
        // §CINEMA_BEAT_OVERLAP (2026-07-20, "no abruptness... even the path when reaching outside
        // should not be robotic abrupt stop and turn, it can play while doing both"): start blending
        // the look-at toward the pivot in the LAST CINEMA_TURN_OVERLAP fraction of the walk-out, so
        // Beat 4's turn is a CONTINUATION picked up mid-blend, not a fresh spin starting from zero.
        // Both this ramp-in and Beat 4's ramp-out use smoothstep, so the blend weight is continuous
        // AND has matching (zero) slope at the tO boundary — no kink in the gaze direction.
        var turnW3 = (e3 > 1 - CINEMA_TURN_OVERLAP)
          ? _cinemaSmoothstep((e3 - (1 - CINEMA_TURN_OVERLAP)) / CINEMA_TURN_OVERLAP) * CINEMA_TURN_OVERLAP_MAX
          : 0;
        return { x: p3.x, y: p3.y, z: p3.z,
                 tx: aheadTx + (pivot.x - aheadTx) * turnW3,
                 ty: aheadTy + (pivot.y - aheadTy) * turnW3,
                 tz: aheadTz + (pivot.z - aheadTz) * turnW3 };
      }
      if (tNorm <= tR) {
        // ── Beat 4: turn around to face the building and rise onto the orbit band. Ends EXACTLY
        // on _orbitPose(0), which is what keeps the handoff continuous (the old Act III handoff
        // did not, and measured a ~10.8m single-frame step at t≈0.80). The look-at picks up from
        // CINEMA_TURN_OVERLAP_MAX (where Beat 3 left it) rather than restarting at 0 — see above.
        var e4 = _cinemaSmoothstep((tNorm - tO) / Math.max(1e-6, tR - tO));
        var la = { x: exitOuter.x + odx * 20, y: exitOuter.y, z: exitOuter.z + odz * 20 };
        var turnW4 = CINEMA_TURN_OVERLAP_MAX + (1 - CINEMA_TURN_OVERLAP_MAX) * _cinemaSmoothstep(e4);
        return { x: exitOuter.x + (orbitStart.x - exitOuter.x) * e4,
                 y: exitOuter.y + (orbitStart.y - exitOuter.y) * e4,
                 z: exitOuter.z + (orbitStart.z - exitOuter.z) * e4,
                 tx: la.x + (pivot.x - la.x) * turnW4,
                 ty: la.y + (pivot.y - la.y) * turnW4,
                 tz: la.z + (pivot.z - la.z) * turnW4 };
      }
      // ── Beat 5: the standard ending.
      return _orbitPose((tNorm - tR) / Math.max(1e-6, 1 - tR));
    }

    // Plan cost is dominated by the BVH fans + floor raycasts. Measured on this project's headless
    // ANGLE/SwiftShader rig: Duplex ~20-70ms, Terminal/Hospital ~500-750ms — a one-off cost at the
    // moment Alt+C is pressed, before a 24s recording. Logged so a regression is visible, not guessed.
    console.log('§CINEMA_PLAN_MS ' + (((typeof performance !== 'undefined') ? performance.now() : 0) - _planT0).toFixed(1) +
      ' (fanRays=' + CINEMA_FAN_RAYS + ' spaceCands=' + spaceCands.length + ' exitCands=' + exitScored.length + ')');
    return { base: base, envelope: envelope, arcOnly: !!arcBboxRaw, fillDistance: fillDistance,
             pushInRadius: pushInRadius, radiusMin: radiusMin, radiusMax: radiusMax,
             pivot: pivot, pivotSrc: pivotSrc, settle: settle, exit: chosenExit,
             beats: { dive: tD, spin: tS, out: tO, rise: tR },
             indoor: true, poseAt: poseAt };
  }
  A.cinemaPathPlan = _cinemaPathPlan;   // shared with cinema_maxq.js — see §CINEMA_PATH above
  // §INTERIOR_PACING (FLY_TOUR_CORRIDOR_GRAPH.md, 2026-07-25): exposes the SAME BVH raycast fan
  // §CINEMA_SPACE already trusts as "the ONLY where-is-open-space source" (see the file-header
  // comment above _cinemaFanMeshes) to tour.js's flight-pacing — real measured clearance-to-
  // nearest-surface, not a second invented proximity system. tour.js is the only outside caller.
  A.cinemaFan = _cinemaFan;
  // §INTERIOR_PACING_LOS (2026-07-26, user: "Measure by LOS - what is in front of the middle in
  // the frame, if it is far, fast. Near, slow" — courtyard traversal was still measuring slow
  // because `_cinemaFan`'s min-of-8-rays fires on ANYTHING close in ANY direction, e.g. a low
  // wall or piece of furniture off to the side, even when what's actually ahead in view is wide
  // open). Single forward raycast, same mesh set/raycaster the fan already uses — not a second
  // invented proximity system, just the one ray that matters for pacing: where the camera is
  // heading, not everything around it.
  function _cinemaLookDist(pos, dirX, dirZ) {
    var meshes = _cinemaFanMeshes();
    if (!meshes.length) return CINEMA_FAN_FAR;
    if (!_cineFanRay) { _cineFanRay = new THREE.Raycaster(); _cineFanRay.firstHitOnly = true; }
    var len = Math.hypot(dirX, dirZ);
    if (len < 1e-6) return CINEMA_FAN_FAR;
    _cineFanRay.set(new THREE.Vector3(pos.x, pos.y, pos.z), new THREE.Vector3(dirX / len, 0, dirZ / len));
    _cineFanRay.far = CINEMA_FAN_FAR;
    var hits = null;
    try { hits = _cineFanRay.intersectObjects(meshes, true); } catch (e) { return CINEMA_FAN_FAR; }
    return (hits && hits.length) ? hits[0].distance : CINEMA_FAN_FAR;
  }
  A.cinemaLookDist = _cinemaLookDist;
  // §CINEMA_HDRI_RACE (2026-07-24): exposed so cinema_maxq.js's warm-up (the REAL Alt+C entry
  // point — scene.js's §KBD_ROUTE always finds A.startMaxQualityOrbit and never falls through to
  // A.startCinemaOrbit below) can await the same HDRI readiness this file's own dead-code capture
  // path already does. MaxQ's own warm-up fold (_waitFoldDone) polls the TAA/AO accumulate-fold's
  // busy flag only — a SEPARATE async load from the HDRI texture fetch+PMREM-generate, so the fold
  // can report "done" while the HDRI is still loading, live-confirmed via a real user's own pasted
  // console log (§STILL_REFINE done fired ~2.2s in, §LAYER2_HDRI_READY only later).
  A.ensureHdriEnvMapReady = _ensureHdriEnvMap;
  A.startCinemaOrbit = async function() {
    if (_cinemaActive || A._stillRefineActive || !A.camera || !A.controls || !A.renderer) return;
    if (!A.renderer.domElement.captureStream || typeof MediaRecorder === 'undefined') {
      console.warn('§CINEMA_FAIL captureStream/MediaRecorder unsupported in this browser');
      return;
    }
    _cinemaActive = true;  // claim BEFORE the await below — a second Alt+C during the import tick must not double-start
    // §CINEMA_GHOST_RESET (2026-07-21): same fix as cinema_maxq.js's live Alt+C path — see
    // navigate_find.js §CINEMA_GHOST_RESET. This function is currently dead code (scene.js's
    // §KBD_ROUTE always finds A.startMaxQualityOrbit defined and never falls through here), kept in
    // sync for consistency in case that routing ever changes.
    if (typeof A.resetCinemaGhostLens === 'function') A.resetCinemaGhostLens();
    // §CINEMA_SSAA lazy-load: the module is already in the browser's module map on any load where
    // A._composer exists (TAARenderPass.js imports it), so this resolves from cache in a microtask
    // — no network fetch, works offline.
    if (!_cinemaSsaaPass && !_cinemaSsaaImportFailed && A._composer) {
      try {
        var _ssaaMod = await import('./lib/SSAARenderPass.js');
        _cinemaSsaaPass = new _ssaaMod.SSAARenderPass(A.scene, A.camera);
        _cinemaSsaaPass.sampleLevel = CINEMA_SSAA_LEVEL;
      } catch (e) {
        _cinemaSsaaImportFailed = true;
        console.warn('§CINEMA_SSAA_FAIL import: ' + e.message + ' — recording continues without SSAA');
      }
    }
    // §PHOTO_VARIATION: lock whichever random paint/puddle variation is currently on screen —
    // "once user agrees, press cinema icon, it takes that persisted cache" — so the capture
    // doesn't re-roll mid-recording, and stays locked for the rest of the session.
    _photoVariationLocked = true;
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
    var plan = _cinemaPathPlan(CINEMA_N_FRAMES / CINEMA_FPS);
    var base = plan.base, envelope = plan.envelope;

    // Reuse the exact still-refine staging setup (ground/shadow/sky/sun/fog/addons/sparkle), minus
    // its own TAA-accumulate rAF loop — this function drives its own render loop for the moving
    // camera (accumulating supersamples across motion would just blur/ghost, not help).
    A._stillRefineActive = true;
    A._composerEnabled = true;   // teardown recomputes from SSAO/Outline state (§GI_HANDOFF_GHOST_FIX)
    if (A._taaPass) { A._taaPass.accumulate = false; A._taaPass.accumulateIndex = -1; }
    // §CINEMA_SSAA attach: swap the composer's HEAD pass to spatial supersampling for the length
    // of the recording. SSAA jitters the camera sub-pixel N times WITHIN each frame and averages —
    // the correct quality lever for a continuously moving camera. (Alt+S's TAA accumulates ACROSS
    // frames — under motion that ghosts, which is why accumulate stays hard-off above; settled
    // design, do not re-litigate — bim-compiler prompts/PHOTOREAL_STILL_RENDER.md 2026-07-18.)
    // GI path excluded: N8AO already needs a reduced preset just to be recordable
    // (§GI_CINEMA_PRESET below) — a 4x scene-render multiplier on top would be a slideshow.
    var _cinemaSsaaAttached = false;
    function _cinemaSsaaDetach() {
      if (!_cinemaSsaaAttached) return;
      _cinemaSsaaAttached = false;
      A._composer.removePass(_cinemaSsaaPass);
      if (A._taaPass) A._taaPass.enabled = true;
      console.log('§CINEMA_SSAA off (TAA-as-plain-RenderPass head restored)');
    }
    if (_cinemaSsaaPass && A._composer && !A._giComposerActive) {
      _cinemaSsaaPass.scene = A.scene; _cinemaSsaaPass.camera = A.camera;  // track any rebuild between runs
      var _rt1 = A._composer.renderTarget1;
      if (_rt1) _cinemaSsaaPass.setSize(_rt1.width, _rt1.height);  // window may have resized since last run
      A._composer.insertPass(_cinemaSsaaPass, 0);
      if (A._taaPass) A._taaPass.enabled = false;  // SSAA replaces the head — never render the scene twice
      _cinemaSsaaAttached = true;
      console.log('§CINEMA_SSAA on level=' + CINEMA_SSAA_LEVEL + ' (' + Math.pow(2, CINEMA_SSAA_LEVEL) +
        ' spatial samples/frame, composer head swapped for recording)');
    } else if (A._giComposerActive) {
      console.log('§CINEMA_SSAA skipped — GI composer is the recorded path, §GI_CINEMA_PRESET governs its quality');
    } else {
      console.log('§CINEMA_SSAA unavailable composer=' + !!A._composer + ' importFailed=' + _cinemaSsaaImportFailed);
    }
    _stillRefineStartMs = performance.now();
    var _triCount = _setTriplanarActive(true);
    _applyPhotoStaging();
    // §CINEMA_HDRI_RACE (2026-07-24): wait for the HDRI envMap _applyPhotoStaging() just kicked off
    // (or already-cached, in which case this resolves on the next microtask) so frame 0 doesn't
    // record the OLD procedural-sky envMap and then snap to the real HDRI mid-recording once the
    // fetch/PMREM-generate finishes — the exact "flicker/snapping... before Alt-S fully applied"
    // report. 5s cap (vs MaxQ's 30s) — this is the interactive live-capture path, a slow/broken
    // network should degrade to the procedural envMap rather than stall the recording indefinitely.
    var _hdriWaitMs = 0, _hdriWaitT0 = performance.now();
    await Promise.race([
      _ensureHdriEnvMap(),
      new Promise(function(res) { setTimeout(res, 5000); })
    ]);
    _hdriWaitMs = performance.now() - _hdriWaitT0;
    console.log('§CINEMA_HDRI_RACE waitedMs=' + _hdriWaitMs.toFixed(0) + ' ready=' + !!_hdriEnvMap);
    console.log('§CINEMA_ORBIT start envelope=' + envelope.toFixed(1) + ' arcOnly=' + plan.arcOnly +
      ' fillDistance=' + plan.fillDistance.toFixed(1) + ' pushInRadius=' + plan.pushInRadius.toFixed(1) +
      ' radiusBand=[' + plan.radiusMin.toFixed(1) + ',' + plan.radiusMax.toFixed(1) + '] triplanarMaterials=' + _triCount);

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
    catch (e) { console.warn('§CINEMA_FAIL MediaRecorder ctor: ' + e.message); _cinemaSsaaDetach(); _teardownStillRefine('cinema-fail'); _cinemaActive = false; return; }
    recorder.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function() {
      var blob = new Blob(chunks, { type: mimeType });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'BIM_Cinema_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.webm';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
      console.log('§CINEMA_ORBIT saved size=' + blob.size + ' type=' + mimeType);
      _cinemaSsaaDetach();       // §CINEMA_SSAA: recording over — plain head pass back
      _giCinemaPresetRestore();  // §GI_CINEMA_PRESET: recording over — full-quality GI settings back
      _teardownStillRefine('cinema-orbit-done');
      _cinemaActive = false;
    };
    recorder.start();

    var startMs = performance.now();
    var durationMs = (CINEMA_N_FRAMES / CINEMA_FPS) * 1000;
    var _cinePerfN = 0, _cinePerfMs = 0, _cinePrevFrameMs = 0;  // §CINEMA_PERF frame-time telemetry
    function step() {
      if (!_cinemaActive) { _giCinemaPresetRestore(); _cinemaSsaaDetach(); return; }  // early abort (stopCinemaOrbit) — restore GI + head pass too
      var tNorm = Math.min(1, (performance.now() - startMs) / durationMs);
      // §CINEMA_PATH: pose from the shared plan (§CINEMA_SIMPLE's one routine — dive → spin →
      // out → rise → orbit) — the SAME path the MaxQ exporter flies.
      var pose = plan.poseAt(tNorm);
      A.camera.position.set(pose.x, pose.y, pose.z);
      A.controls.target.set(pose.tx, pose.ty, pose.tz);
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
            ' gi=' + !!A._giComposerActive + ' preset=' + !!_giCinemaSaved +
            ' ssaa=' + (_cinemaSsaaAttached ? CINEMA_SSAA_LEVEL : 0));
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
