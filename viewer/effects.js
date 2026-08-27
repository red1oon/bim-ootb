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
    var [_ecMod, _rpMod, _taaMod, _ssaoMod, _outMod, _opMod, _blMod] = await Promise.all([
      import('./lib/EffectComposer.js'),
      import('./lib/RenderPass.js'),
      import('./lib/TAARenderPass.js'),
      import('./lib/SSAOPass.js'),
      import('./lib/OutlinePass.js'),
      import('./lib/OutputPass.js'),
      import('./lib/BloomPass.js')
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

    // Pass 4: §PHOTO_BLOOM — BEFORE OutputPass, so it runs in linear HDR where an emissive material
    // with toneMapped=false genuinely exceeds 1.0 and the threshold means something. After tone
    // mapping everything is clamped into 0-1 and there is nothing left to find.
    //
    // OFF during navigation, ON only for the Alt+S still (see startStillRefine). Same discipline as
    // Layer 3's triplanar PBR: a bake can afford a few ms a frame, a 60fps orbit cannot, and this
    // renders 7 extra full-screen draws (bright + 3 levels x 2 blur directions) plus a composite.
    // §BLOOM_TEMPER (2026-07-27, user: "bloom also overshot its not nice"). It was strength 0.9 at
    // threshold 1.0, and §PHOTO_GLOW_SPRITE writes its sprites at gain 3.0 — three times over the
    // threshold, then amplified nearly 1:1. Everything that qualified bloomed hard, and on Hospital
    // that is 1272 sprites plus 4103 window lights.
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
  var CAM_LIGHT_COLOR = 0xfff2e0, CAM_LIGHT_INTENSITY = 3, CAM_LIGHT_DISTANCE = 4, CAM_LIGHT_DECAY = 2;
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
  // §LTU_SUBSURFACE_BBOX (2026-08-16, prompts/CINEMA_PATH_EDITOR.md): both bbox helpers below used
  // raw MIN/MAX(center_z), so a handful of junk-placement rows (LTU: 13 IfcColumn at −5.6…−45.6m,
  // tagged to ABOVE-ground storeys — export garbage, not a basement) sank the orbit pivot
  // (pivot.y = zMin + 0.35·span) ~30m underground and Beat 4/5 flew below the slab. Fence: rows
  // outside p01 − 0.25·(p99−p01) … p99 + 0.25·(p99−p01) of the SAME filtered set are excluded from
  // the aggregate (whole row — a z-junk row shouldn't vote on x/y either). Measured before shipping:
  // healthy buildings are BIT-IDENTICAL through their active path (Hospital ARC+IFC, Terminal ARC:
  // excluded=0, raw==fenced), LTU excludes exactly the 13 junk rows (ARC pivot −23.90 → +3.64).
  // Skipped entirely (raw behavior) for tiny sets (n<100) or degenerate span, where percentiles
  // aren't meaningful. DB rows themselves are untouched — presentation-layer exclusion only.
  function _bboxZFenced(selectFrom, whereClause) {
    var glue = whereClause ? whereClause + ' AND ' : 'WHERE ';
    var raw = A.dbQuery('SELECT MIN(et.center_x), MAX(et.center_x), MIN(et.center_y), MAX(et.center_y), MIN(et.center_z), MAX(et.center_z) ' + selectFrom + ' ' + whereClause);
    if (!raw.length || raw[0][0] == null) return null;
    var out = { xMin: raw[0][0], xMax: raw[0][1], yMin: raw[0][2], yMax: raw[0][3], zMin: raw[0][4], zMax: raw[0][5] };
    try {
      var n = A.dbQuery('SELECT COUNT(*) ' + selectFrom + ' ' + whereClause)[0][0];
      if (n >= 100) {
        var p01 = A.dbQuery('SELECT et.center_z ' + selectFrom + ' ' + whereClause + ' ORDER BY et.center_z LIMIT 1 OFFSET ' + Math.floor(n / 100))[0][0];
        var p99 = A.dbQuery('SELECT et.center_z ' + selectFrom + ' ' + whereClause + ' ORDER BY et.center_z LIMIT 1 OFFSET ' + Math.min(n - 1, Math.floor(n * 99 / 100)))[0][0];
        var span = p99 - p01;
        if (span > 0) {
          var lo = p01 - 0.25 * span, hi = p99 + 0.25 * span;
          if (out.zMin < lo || out.zMax > hi) {
            var f = A.dbQuery('SELECT MIN(et.center_x), MAX(et.center_x), MIN(et.center_y), MAX(et.center_y), MIN(et.center_z), MAX(et.center_z), COUNT(*) ' + selectFrom + ' ' + glue + 'et.center_z >= ' + lo + ' AND et.center_z <= ' + hi);
            if (f.length && f[0][0] != null) {
              console.log('§CINEMA_BBOX_FENCE excluded=' + (n - f[0][6]) + '/' + n + ' rawZ=[' + out.zMin.toFixed(2) + ',' + out.zMax.toFixed(2) + '] fencedZ=[' + f[0][4].toFixed(2) + ',' + f[0][5].toFixed(2) + '] fence=[' + lo.toFixed(2) + ',' + hi.toFixed(2) + ']');
              out = { xMin: f[0][0], xMax: f[0][1], yMin: f[0][2], yMax: f[0][3], zMin: f[0][4], zMax: f[0][5] };
            }
          }
        }
      }
    } catch (e) { /* fence is best-effort — raw bbox stands */ }
    return out;
  }
  function _buildingBBoxIfc() {
    if (!A.dbQuery) return null;
    return _bboxZFenced('FROM element_transforms et', '');
  }
  // §CINEMA_ARC_BBOX (2026-07-16, user ask: "ignore any non ARC elements outside frame" —
  // "solves LTU too far"): the whole-building bbox above includes every discipline, including
  // scattered exterior MEP piping (LTU) that inflates the envelope and pushes the Cinema Orbit's
  // "reasonable band" and fill-frame target far past what the actual architectural volume needs.
  // ARC-only bbox is the real building envelope for framing purposes — general to any building,
  // no hardcoding (a building with zero ARC rows falls back to the whole-building bbox below).
  function _buildingBBoxArc() {
    if (!A.dbQuery) return null;
    return _bboxZFenced('FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid', "WHERE em.discipline = 'ARC'");
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
    var radius = envelope * PHOTO_SKYLINE_RADIUS_MULT;
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
    // §FACADE_WARM_COOL (2026-07-28, user: "do facade colour if it's more realistic and not costly")
    // — Witness: W-FACADE-WARM-COOL. Spec: bim-compiler PHOTOREAL_STILL_RENDER.md §FACADE_COLOUR.
    //
    // REALISM, not theatre. This scene already declares TWO illuminants and then contradicts itself:
    // PHOTO_SUN_COLOR 0xffa55c (warm — a low sun's long air path scatters the blue out) and
    // PHOTO_HEMI_SKY_COLOR 0x6a5a7a (the cool dusk sky dome). A surface that cannot see the sun is
    // lit by the SKY, so it reads cool — that is what every real dusk photograph shows. Yet every
    // facade wash, both roof spots, the sconces and the tree uplights are amber inside a ~30° hue
    // span, so a sun-facing wall and a wall in full shade are painted the same colour. This makes
    // the wash agree with the scene's own two-illuminant model instead of overriding it.
    //
    // FREE. No new light objects, no new draw calls, no shader recompile — a colour is a uniform.
    // The sun azimuth is read from A.sun.position, which A.updateSky() has already repositioned by
    // the time this runs, and the outward normal per edge is already stored in _photoFacadeLights.
    //
    // LUMINANCE-MATCHED ON PURPOSE: Y(warm up 0xffaa55) = 0.714 vs Y(cool up 0x8cc0ff) = 0.728;
    // Y(warm down 0xffcf9a) = 0.837 vs Y(cool down 0xb0d8ff) = 0.825 — within 2%. The split is
    // CHROMATIC, never a brightness change, so it cannot reintroduce the contrast-flattening that
    // §PHOTO_CONTRAST_DIALBACK and §PHOTO_GROUND_WHITE_REVERTED were both reverted for.
    var _sunAz = null, _warmN = 0, _coolN = 0;
    if (A.sun && A._facadeWarmCool !== false) {
      var sx = A.sun.position.x, sz = A.sun.position.z, sl = Math.hypot(sx, sz);
      if (sl > 1e-6) _sunAz = { x: sx / sl, z: sz / sl };   // horizontal direction TOWARD the sun
    }
    _photoFacadeLights.forEach(function(f, i) {
      var facingFrac = Math.max(0, Math.min(1, facings[i]));  // 0 (away/edge-on) .. 1 (directly facing)
      var strength = PHOTO_FACADE_DIM_FRACTION + (1 - PHOTO_FACADE_DIM_FRACTION) * facingFrac;
      if (i === backIdx) strength *= PHOTO_BACK_ACCENT_BOOST;  // ground-based spotlight, back portion
      f.up.intensity = PHOTO_FACADE_UP_BASE * strength;
      f.down.intensity = PHOTO_FACADE_DOWN_BASE * strength;
      // A facade whose OUTWARD normal points toward the sun is the one the sun actually reaches.
      // The OFF branch must REPAINT warm, not merely skip: the lights keep whatever colour the last
      // recompute left on them, so a kill-switch that only stops assigning freezes the split in
      // place instead of undoing it. Found by W-FACADE-WARM-COOL gate 6 — the control gate existed
      // precisely to catch a switch that does not switch.
      var warm = true, toSun = null;
      if (_sunAz) { toSun = f.normalThree.x * _sunAz.x + f.normalThree.z * _sunAz.z; warm = toSun > 0; }
      f.up.color.setHex(warm ? PHOTO_FACADE_WARM_UP : PHOTO_FACADE_COOL_UP);
      f.down.color.setHex(warm ? PHOTO_FACADE_WARM_DOWN : PHOTO_FACADE_COOL_DOWN);
      f.warm = warm; f.toSun = toSun;
      if (warm) _warmN++; else _coolN++;
    });
    if (_sunAz) console.log('§FACADE_WARM_COOL sunAz=' + _sunAz.x.toFixed(3) + ',' + _sunAz.z.toFixed(3) +
      ' warm=' + _warmN + ' cool=' + _coolN + ' dots=' +
      _photoFacadeLights.map(function(f) { return (f.toSun === undefined ? 'n/a' : f.toSun.toFixed(2)); }).join(','));
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
    // §STAFFAGE_TEX_CAP — see the cap's comment at its declaration. Dormant at roster scale
    // (12 keys < 24): fires only if the key space ever becomes dynamic.
    var _tcKeys = Object.keys(_staffageTexCache);
    if (_tcKeys.length >= _STAFFAGE_TEX_CAP) {
      var _evict = _staffageTexCache[_tcKeys[0]];
      if (_evict && typeof _evict.dispose === 'function') { try { _evict.dispose(); } catch (e) {} }
      delete _staffageTexCache[_tcKeys[0]];
      console.log('§STAFFAGE_TEX_EVICT ' + _tcKeys[0] + ' cap=' + _STAFFAGE_TEX_CAP);
    }
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
  // §STAFFAGE_FLOOR_PHANTOM tuning. MIN_LIFT: below this a wrong floor pick is not visible as
  // "in the air", and a coincident-surface ray can self-miss — not worth a false reject. TOL: how
  // far below the bbox's claimed slab top a real triangle may be and still count as that floor.
  var _FLOOR_PHANTOM_MIN_LIFT = 0.75, _FLOOR_PHANTOM_TOL = 0.60;
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
    var _floorSlab = 0, _floorGround = 0, _floorPhantom = 0;
    function _floorThreeY(x, y, refZ) {
      var best = null;
      for (var si = 0; si < _slabs.length; si++) {
        var s = _slabs[si], top = s[2] + (s[5] || 0) / 2;
        if (top <= refZ + 1.5 && Math.abs(x - s[0]) <= (s[3] || 3) / 2 + 0.5 && Math.abs(y - s[1]) <= (s[4] || 3) / 2 + 0.5) {
          if (best === null || top > best) best = top;
        }
      }
      if (best !== null) {
        var slabY = A.ifc2three(x, y, best).y;
        // §STAFFAGE_FLOOR_PHANTOM (2026-07-26, user: "some will stand in air outside first floor").
        // The loop above is a pure AXIS-ALIGNED BBOX test, and this file's own §STAFFAGE_GROUNDSNAP
        // lesson is that BBOXES LIE: an exterior spot can sit inside an upper slab's bounding
        // RECTANGLE while being nowhere near its real geometry — the notch of an L-shaped plate, a
        // courtyard, or just past a facade edge inside the 0.5m tolerance. The spot is then lifted
        // to that floor's height with nothing under it: a figure standing in mid-air outside the
        // building. Same defect class, same remedy already trusted elsewhere in this file — ask the
        // real rendered triangles (BVH raycaster), not the bbox.
        // Only checked when the lift is big enough to actually read as floating; at ground level a
        // coincident-surface ray can self-miss and a false reject would be worse than the symptom.
        var lift = slabY - _staffageGroundY;
        if (lift > _FLOOR_PHANTOM_MIN_LIFT && typeof _solids !== 'undefined' && _solids && _solids.length) {
          var p3 = A.ifc2three(x, y, best);
          _clrRay.set(new THREE.Vector3(p3.x, slabY + 1.0, p3.z), new THREE.Vector3(0, -1, 0));
          _clrRay.far = 1.0 + _FLOOR_PHANTOM_TOL;
          var hits = _clrRay.intersectObjects(_solids, false);
          if (!hits.length) {
            _floorPhantom++;
            console.log('§STAFFAGE_FLOOR_PHANTOM bbox slab at y=' + slabY.toFixed(2) + ' (lift=' +
              lift.toFixed(2) + 'm) has NO real geometry beneath — falling back to groundY=' +
              _staffageGroundY.toFixed(2));
            _floorGround++; return _staffageGroundY;
          }
        }
        _floorSlab++; return slabY;
      }
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
      // §STAFFAGE_OUTSIDE_VARIETY (2026-07-26, user: "Alt-P made outside standing persons the same,
      // should be the diff standing sprites" — live log showed 3 placed and all three the SAME male).
      // The old filter was `role==='stand' && facing==='toward'`, and EXACTLY ONE asset in
      // _STAFFAGE_PEOPLE satisfies both (person_standing_casual_male: the other 'stand' pose is
      // 'away'). So outsidePoses.length was 1 and `placedP % length` was always 0 — every exterior
      // figure on every building was that one cutout. Not intermittent, not a draw-luck artifact.
      // Widening it does NOT re-litigate §STAFFAGE_FACING, it applies it: that doctrine says route
      // each pose where its FIXED orientation makes sense, and its own worked example is "the lady
      // with bags... facing to the building" — an 'away' pose reads as moving toward whatever is
      // beyond her, which outside a building is the building. 'toward' (facing the camera) also
      // reads fine outdoors. Only 'sit' is excluded: there is nothing to sit on out here.
      var outsidePoses = _shuffle(_STAFFAGE_PEOPLE.filter(function(p) { return p.role !== 'sit'; }).slice());
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
      var _outsideUsed = [];
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
        _outsideUsed.push(pose.file.replace('people/person_', '').replace('.png', ''));
        _placeAt(pose, sp[0], sp[1], sp[2], true);
        placedP++; thisPressPax++;
      }
      console.log('§STAFFAGE_OUTSIDE_VARIETY pool=' + outsidePoses.length + ' used=[' + _outsideUsed.join(',') + '] distinct=' + (new Set(_outsideUsed)).size);
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
    console.log('§PHOTO_STAFFAGE thisPress(people=' + placedP + ' trees=' + placedT + ') cumulative(people=' + _photoStaffage.userData.counts.people + ' trees=' + _photoStaffage.userData.counts.trees + ' cars=' + _photoStaffage.userData.counts.cars + ') pSrc=' + pSrc + ' floor=slab:' + _floorSlab + '/ground:' + _floorGround + '/phantom:' + _floorPhantom + ' feetVsGroundY=[' + _fMin.toFixed(2) + ',' + _fMax.toFixed(2) + '] groundY=' + _staffageGroundY.toFixed(2) + ' slabs=' + _slabs.length + ' build_ms=' + (performance.now() - _bt0).toFixed(0) + ' (realPeople=' + realPeople + ' realTrees=' + realTrees + ' realCars=' + realCars + ')');
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
  // ══ §BILLBOARD_ART (2026-07-28, user: "make it pick a png image i can place later in the same
  // DB folder. For now just 'RUANG IKLAN UNTUK DI SEWA'… if no image, it gives that notice.")
  //
  // The billboard PANEL is real BIM data — a genuine IfcBuildingElementProxy injected into the DB
  // (migration/billboards/terminal_billboard.sql), so it is pickable, quantifiable and casts
  // shadows like any other element. The ARTWORK cannot ride that same mesh: component_geometries
  // stores vertices + faces ONLY, with no UV channel anywhere in the extraction pipeline (the same
  // blocker §LAYER 3 had to solve with triplanar), so a texture map has nothing to sample against.
  // So the art is its own quad, sized and placed FROM THE PANEL'S OWN ROW, sitting a few
  // millimetres off its display face. One PlaneGeometry, ONE draw call, its own material shared
  // with nothing — the §PHOTO_GLOW_SPRITE invariant, unbroken.
  //
  // IMAGE SOURCE: <folder of A.DB_URL>/billboard.png — drop the file next to the .db and it is
  // picked up on the next load, no code change. If it is absent or fails to load, the canvas
  // fallback below draws the notice instead, which is the behaviour the user asked for: an empty
  // advertising hoarding advertises itself.
  // ⚠ DEV-FIXTURE GOTCHA (2026-07-28): a fresh `/tmp/wt-*` worktree's buildings/ dir does NOT
  // inherit these image symlinks — each worktree needs its own `billboard.jpg` (or
  // `<DbStem>Billboard.jpg`) symlinked in beside its Terminal_Hi.db, or every load shows this
  // fallback notice instead of the real art. Known-good example: `/tmp/wt-albedo/buildings/`.
  // If you land here debugging "why is my billboard black with Malay text", this is why —
  // see prompts/PHOTOREAL_STILL_RENDER.md §FACADE_SIGNAGE / §BILLBOARD_ALWAYS.
  var BILLBOARD_NOTICE = 'RUANG IKLAN UNTUK DI SEWA';
  var _billboardMesh = null;
  function _billboardFallbackTexture(wm, hm) {
    var W = 1024, H = Math.max(256, Math.round(W * (hm / wm)));
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.fillStyle = '#0d1017'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e8c34a'; g.lineWidth = Math.round(H * 0.035);
    g.strokeRect(g.lineWidth, g.lineWidth, W - g.lineWidth * 2, H - g.lineWidth * 2);
    // Fit the notice to the board rather than guessing a point size — the panel's real aspect
    // comes from its DB bbox, so this stays correct if the sign is ever resized.
    var words = BILLBOARD_NOTICE.split(' '), lines = [words.slice(0, 2).join(' '), words.slice(2).join(' ')];
    var size = Math.round(H * 0.26);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2e6c0';
    for (var pass = 0; pass < 12; pass++) {
      g.font = '700 ' + size + 'px system-ui, sans-serif';
      var widest = Math.max.apply(null, lines.map(function(l) { return g.measureText(l).width; }));
      if (widest <= W * 0.82) break;
      size = Math.round(size * 0.9);
    }
    for (var i = 0; i < lines.length; i++) {
      g.fillText(lines[i], W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.15);
    }
    var tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    console.log('§BILLBOARD_ART fallback notice drawn (' + W + 'x' + H + ') — no billboard.png found');
    return tex;
  }
  // §BILLBOARD_ALWAYS (2026-07-28, user live: "its blank black.. ah i see it, alt-s!!") — the art
  // quad was only ever built from _showPhotoProps(true), so outside Alt+S the panel rendered as its
  // own near-black hoarding body with no face on it, and it looked broken rather than unlit. A sign
  // is a sign all the time; it should not need a photoshoot to have a face. Built once when the
  // model has finished streaming, and _showPhotoProps's call is now just a harmless re-assert
  // (the function is idempotent — it returns immediately if the mesh exists).
  A._billboardAutoBuild = function() {
    if (!A.db || !A.scene) return;
    try { A._buildBillboardArt(); } catch (e) { console.warn('§BILLBOARD_ART auto-build failed: ' + e.message); }
    try { A._buildBillboardNamePlate(); } catch (e) { console.warn('§BILLBOARD_NAME auto-build failed: ' + e.message); }
  };
  A._buildBillboardArt = function() {
    if (_billboardMesh || !A.db || !A.ifc2three) return;
    var rows;
    try {
      rows = A.dbQuery("SELECT t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z " +
        "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
        "WHERE m.element_name LIKE 'BIM_OOTB_Billboard%' LIMIT 1");
    } catch (e) { return; }
    if (!rows || !rows.length) return;
    var r = rows[0], cx = r[0], cy = r[1], cz = r[2], tx = r[3], wy = r[4], hz = r[5];
    // Display face is +X in IFC (the host wall is on the building's x-max facade); nudge 8mm clear
    // of it so the art never z-fights the panel it sits on.
    var p = A.ifc2three(cx + tx / 2 + 0.008, cy, cz);
    var geo = new THREE.PlaneGeometry(wy, hz);
    var mat = new THREE.MeshBasicMaterial({ toneMapped: true, side: THREE.DoubleSide });
    // MeshBasic, not Standard: a sign face reads as self-lit, so it stays legible at dusk without
    // depending on whether the corner floodlights are inside the night light budget this frame.
    // §BILLBOARD_SOURCE — candidates tried in order, first hit wins, then stop. Derived from the
    // DB's own filename rather than hardcoded: "Terminal_Hi.db" -> first token "Terminal" ->
    // TerminalBillboard.jpg. So either `billboard.<ext>` or `<Building>Billboard.<ext>` beside the
    // .db is found without a code change. A._billboardImage overrides everything (console-testable:
    //   APP._setBillboardImage('whatever.jpg')  — swaps the map on the live mesh, no reload).
    var dir = (A.DB_URL || '').replace(/[^/]*$/, '');
    var stem = ((A.DB_URL || '').replace(/^.*\//, '').replace(/\.db$/i, '').split('_')[0]) || 'building';
    var cands = A._billboardImage ? [A._billboardImage.indexOf('/') >= 0 ? A._billboardImage : dir + A._billboardImage]
      : [dir + 'billboard.png', dir + 'billboard.jpg', dir + stem + 'Billboard.jpg', dir + stem + 'Billboard.png'];
    // §BILLBOARD_FIT — the artwork almost never matches the hoarding's aspect (the first real test
    // image was 945x960 = 0.98 against a 2.00 panel, which stretches to twice its width if mapped
    // raw). COVER-fit: scale by the LARGER ratio so the artwork fills the whole hoarding and the
    // overflow is cropped evenly from both edges — user's call ("the script simply crop any pic
    // landed"), and it is the right one for a billboard: a real hoarding is never letterboxed.
    // Aspect is always preserved; only the overflow is lost, never the proportions.
    A._billboardFit = function(img, wm, hm) {
      var W = 1024, H = Math.max(1, Math.round(W * (hm / wm)));
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var g = c.getContext('2d');
      g.fillStyle = '#0d1017'; g.fillRect(0, 0, W, H);
      var s = Math.max(W / img.width, H / img.height);   // COVER: fill the board, crop the overflow
      var dw = img.width * s, dh = img.height * s;
      g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      var tex = new THREE.CanvasTexture(c);
      if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      console.log('§BILLBOARD_FIT src=' + img.width + 'x' + img.height + ' (aspect ' + (img.width / img.height).toFixed(2) +
        ') -> panel ' + W + 'x' + H + ' (aspect ' + (wm / hm).toFixed(2) + ') mode=cover scale=' + s.toFixed(3) + ' cropped=' + (((img.width*s - W)/s).toFixed(0)) + 'x' + (((img.height*s - H)/s).toFixed(0)) + 'px');
      return tex;
    };
    function _tryLoad(list, n) {
      if (n >= list.length) { mat.map = _billboardFallbackTexture(wy, hz); mat.needsUpdate = true; return; }
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function() { mat.map = A._billboardFit(im, wy, hz); mat.needsUpdate = true;
        console.log('§BILLBOARD_ART image=' + list[n]); if (A.markDirty) A.markDirty(); };
      im.onerror = function() { _tryLoad(list, n + 1); };
      im.src = list[n];
    }
    _tryLoad(cands, 0);
    // Live swap for iteration — no reload, no rebuild of the quad.
    A._setBillboardImage = function(u) {
      if (!_billboardMesh) { console.log('§BILLBOARD_ART no mesh yet — press Alt+S once'); return; }
      var full = (u.indexOf('/') >= 0) ? u : dir + u;
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function() { _billboardMesh.material.map = A._billboardFit(im, wy, hz);
        _billboardMesh.material.needsUpdate = true; console.log('§BILLBOARD_ART swapped image=' + full);
        if (A.markDirty) A.markDirty(); };
      im.onerror = function() { console.warn('§BILLBOARD_ART load failed ' + full); };
      im.src = full;
    };
    _billboardMesh = new THREE.Mesh(geo, mat);
    _billboardMesh.position.set(p.x, p.y, p.z);
    _billboardMesh.rotation.y = Math.PI / 2;   // PlaneGeometry normal +Z -> +X, matching the facade
    _billboardMesh.renderOrder = 1;
    A.scene.add(_billboardMesh);
    console.log('§BILLBOARD_ART built ' + wy.toFixed(1) + 'm x ' + hz.toFixed(1) + 'm at ifc(' +
      cx.toFixed(2) + ',' + cy.toFixed(2) + ',' + cz.toFixed(2) + ') candidates=' + cands.length + ' drawCalls=1');
    if (A.markDirty) A.markDirty();
  };

  // Implementing prompts/PHOTOREAL_STILL_RENDER.md §BILLBOARD_NAME_ELEMENT —
  // Witness: W-BILLBOARD-NAME-ELEMENT.
  // SUPERSEDES §BILLBOARD_BUILDING_NAME, which built the whole plate in JS from a config file.
  // That was wrong twice over and the user named both: it had no DB row (so it could never be
  // quantified, costed or schedule-bound) and it was built unconditionally (so it "came on" at
  // frame 0 of a buildup instead of appearing last).
  //
  // THE SPLIT, identical to §BILLBOARD_ART's:
  //   * the plate BODY is a REAL element — guid BB0BIMOOTBNAME000001A, four rows in
  //     elements_meta/element_transforms/element_instances/component_geometries
  //     (migration/billboards/terminal_billboard_nameplate.sql). It streams through the normal
  //     loader like any other row, so Time Machine, picking, 5D and the ERP fold all see it with
  //     no special-casing. NOTHING here builds it.
  //   * only the LETTERING is JS: one always-on-top quad with a canvas texture, own material,
  //     shared with nothing — the same §PHOTO_GLOW_SPRITE invariant the artwork quad relies on.
  //   * config carries the TEXT and nothing else. Geometry comes from the element's own
  //     element_transforms row, read at runtime — config that duplicates DB data is a second
  //     source of truth. `orientation` is gone too: it is derived from the real bbox aspect.
  var _billboardNameMesh = null;
  var _billboardNameGuid = null;
  function _nameplateTexture(text, wm, hm, vertical) {
    var W = vertical ? Math.round(1024 * (wm / hm)) : 1024;
    var H = vertical ? 1024 : Math.max(128, Math.round(1024 * (hm / wm)));
    W = Math.max(128, W);
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.fillStyle = '#0d1017'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e8c34a'; g.lineWidth = Math.round(Math.min(W, H) * 0.03);
    g.strokeRect(g.lineWidth, g.lineWidth, W - g.lineWidth * 2, H - g.lineWidth * 2);
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2e6c0';
    if (vertical) { g.translate(W / 2, H / 2); g.rotate(-Math.PI / 2); }
    var boxSpan = vertical ? H : W, size = Math.round((vertical ? W : H) * 0.55);
    for (var pass = 0; pass < 12; pass++) {
      g.font = '700 ' + size + 'px system-ui, sans-serif';
      if (g.measureText(text).width <= boxSpan * 0.85) break;
      size = Math.round(size * 0.9);
    }
    g.fillText(text, 0, 0);
    g.restore();
    var tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  A._buildBillboardNamePlate = function() {
    if (_billboardNameMesh || !A.db || !A.ifc2three) return;
    var rows;
    try {
      // The plate ELEMENT's own row — found by the same element_name convention _buildBillboardArt
      // uses for the panel, so neither function ever hardcodes a guid.
      rows = A.dbQuery("SELECT m.guid, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z " +
        "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
        "WHERE m.element_name LIKE 'BIM_OOTB_NamePlate%' LIMIT 1");
    } catch (e) { return; }
    if (!rows || !rows.length) {
      console.log('§BILLBOARD_NAME no BIM_OOTB_NamePlate element in this db — ' +
        'apply migration/billboards/terminal_billboard_nameplate.sql'); return;
    }
    var r = rows[0], guid = r[0], cx = r[1], cy = r[2], cz = r[3], tx = r[4], wm = r[5], hm = r[6];
    // Orientation is DERIVED from the element's real bbox, not configured: a plate taller than it
    // is wide gets vertical type, which is what real narrow-pilaster signage does rather than
    // shrinking the letters to fit.
    var vertical = hm > wm;
    var dir = (A.DB_URL || '').replace(/[^/]*$/, '');
    var stem = ((A.DB_URL || '').replace(/^.*\//, '').replace(/\.db$/i, '').split('_')[0]) || 'building';
    fetch(dir + stem + '.config.json').then(function(resp) { return resp.ok ? resp.json() : null; })
      .then(function(cfg) {
        if (!cfg || !cfg.buildingName) {
          console.log('§BILLBOARD_NAME no config/buildingName at ' + dir + stem + '.config.json'); return;
        }
        // 8mm clear of the plate's own +X face, exactly as the artwork quad clears the panel's.
        var p = A.ifc2three(cx + tx / 2 + 0.008, cy, cz);
        var geo = new THREE.PlaneGeometry(wm, hm);
        var mat = new THREE.MeshBasicMaterial({ map: _nameplateTexture(cfg.buildingName, wm, hm, vertical),
          toneMapped: true, side: THREE.DoubleSide });
        _billboardNameMesh = new THREE.Mesh(geo, mat);
        _billboardNameMesh.position.set(p.x, p.y, p.z);
        _billboardNameMesh.rotation.y = Math.PI / 2;   // PlaneGeometry normal +Z -> +X, matching the facade
        _billboardNameMesh.renderOrder = 1;
        // NO userData.guid on purpose — see §TM_OVERLAY_SYNC in time_machine.js. Two scene objects
        // answering to one guid would double-pick in Find/BOM and would take applyHighlight's
        // cyan/orange install tint across the lettering.
        _billboardNameGuid = guid;
        A.scene.add(_billboardNameMesh);
        A._tmOverlayRegister();
        console.log('§BILLBOARD_NAME built guid=' + guid + ' name="' + cfg.buildingName + '" ' +
          wm.toFixed(2) + 'm x ' + hm.toFixed(2) + 'm at ifc(' + cx.toFixed(3) + ',' + cy.toFixed(3) +
          ',' + cz.toFixed(3) + ') vertical=' + vertical + ' drawCalls=1');
        if (A.markDirty) A.markDirty();
      }).catch(function(e) { console.log('§BILLBOARD_NAME fetch failed: ' + e.message); });
  };

  // §TM_OVERLAY_SYNC consumer — see the seam in time_machine.js renderAtTime.
  // This is the fix for the defect the user named ("it shall appear last, not like now it came
  // on"): the lettering carries no userData.guid, so Time Machine's traverse never touched it and
  // it rendered from frame 0 of a buildup. The predicate TM hands over is the SAME placed/frontier/
  // recent state it just applied to the real element, so the overlay cannot drift from it.
  // isVisible === null means TM is off → overlays visible (the sign exists in the finished building).
  //
  // §GLOW_BUILDUP_GATE (2026-08-07): a second consumer — §PHOTO_GLOW_SPRITE below — needs this same
  // per-tick predicate for ~1000 fixture guids, not one billboard guid. window.__tmOverlaySync is a
  // single global slot (TM calls exactly one function), so this is now a tiny fan-out: the raw
  // isVisible fn is cached for on-demand reads (A._tmIsVisible) and broadcast to subscribers
  // (A._tmVisSubscribe) so a buildup bake can withhold a fixture's glow until TM has actually placed
  // it, without effects.js re-deriving placed/frontier/recent itself.
  var _nameVisLast = null;
  var _tmVisListeners = [];
  var _lastTmIsVisible = null;   // latest predicate TM handed over; null when TM isn't driving the scene
  A._tmVisSubscribe = function(fn) { _tmVisListeners.push(fn); };
  // Same default as the billboard branch below: no active TM predicate → everything is visible
  // (Night Mode used outside a buildup bake, or after the buildup has fully completed).
  A._tmIsVisible = function(guid) { return _lastTmIsVisible ? !!_lastTmIsVisible(guid) : true; };
  A._tmOverlayRegister = function() {
    if (window.__tmOverlaySync) return;   // idempotent
    window.__tmOverlaySync = function(isVisible) {
      _lastTmIsVisible = isVisible;
      if (_billboardNameMesh && _billboardNameGuid) {
        var v = isVisible ? !!isVisible(_billboardNameGuid) : true;
        if (v !== _nameVisLast) {     // log + write on CHANGE only, never per tick
          _nameVisLast = v;
          _billboardNameMesh.visible = v;
          console.log('§BILLBOARD_NAME_VIS guid=' + _billboardNameGuid + ' visible=' + v +
            ' tmActive=' + !!isVisible);
          if (A.markDirty) A.markDirty();
        }
      }
      for (var _tvi = 0; _tvi < _tmVisListeners.length; _tvi++) {
        try { _tmVisListeners[_tvi](isVisible); } catch (e) { /* one bad subscriber must not break TM's tick */ }
      }
    };
    // Read-only probe for the witness: what the overlay currently believes.
    A._billboardNameState = function() {
      return { guid: _billboardNameGuid, built: !!_billboardNameMesh,
        visible: _billboardNameMesh ? _billboardNameMesh.visible : null };
    };
  };

  function _showPhotoProps(show) {
    if (show && (!_photoUplights.length || _photoPropsBuilding !== A.activeBuilding)) {
      _disposePhotoProps();
      _buildPhotoProps();
    }
    if (show) _updateFacadeFacingLights();
    if (show) A._buildBillboardArt();   // §BILLBOARD_ART — idempotent; also built outside staging, see §BILLBOARD_ALWAYS
    if (show) A._buildBillboardNamePlate();   // §BILLBOARD_BUILDING_NAME — idempotent re-assert, same as above
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
  // §MOVIE_SHADOW_TM (2026-08-12, user, verbatim: "MAKE SHADOW FOR MOVIE MAKER AS STRONG AS IN TM").
  // These three scales are what made baked shadows read lighter than Time Machine's own shadow play.
  // Measured against scene.js's native lights (sun 4.4, ambient 0.785, hemi 1.257 — TM's sun/fill
  // ratio 4.4/2.042 = 2.155):
  //     was  sun x0.7 = 3.08, ambient x1.15 = 0.903, hemi x1.25 = 1.571  -> ratio 1.245
  //     i.e. 57.8% of TM's contrast, 42% weaker. Two moves compounded — the sun scaled DOWN while
  //     the fill scaled UP (0.7 / 1.2115 = 0.578).
  // Set to 1.0 so the bake uses TM's own balance verbatim; ratio is now 2.155, identical to TM.
  // The old dusk-dimmed values are recorded above, not deleted, because everything else here
  // (PHOTO_SUN_COLOR, the fog/exposure/albedo constants) was tuned against them and is deliberately
  // left untouched — this changes the light BALANCE only, nothing about colour or exposure.
  var PHOTO_SUN_INTENSITY_SCALE = 1.0;  // was 0.7 — §MOVIE_SHADOW_TM, match TM's shadow strength
  var PHOTO_EXPOSURE_SCALE = 0.85;      // slightly underexposed overall — "materials in little light"
  // §PHOTO_EXPOSURE_LIFT (2026-07-27, user: "Scene still too dark drab"). The still was rendering at
  // 0.45 x 0.85 = 0.3825 — about a stop and a half under three.js's default, which is most of why
  // interiors read as drab and why emissive luminaires had so little to show. Lifted here rather
  // than at the renderer default because that default is the DAY NAVIGATION value and the user
  // recalls overexposure from raising it. 2.2x lands the still at ~0.85, bright enough to read
  // without blowing out the sky, and it touches nothing outside the photoshoot.
  // Reverted to 1.0 with §PHOTO_EMBER_DISARMED — the lift was part of the same look and is judged
  // with it, not separately. The arithmetic and the reasoning stay above for the next session.
  var PHOTO_EXPOSURE_LIFT = 1.0;
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
  // §SUN_ARC (user ask, 2026-08-11: "high noon at the start, low angle by the end" — free realism
  // from something the film already has, no new render cost). Alt+S (a single still, no film
  // fraction) keeps PHOTO_SUN_ELEVATION exactly as before — this arc only applies where a tNorm
  // already exists: the MaxQ bake loop (cinema_maxq.js) and the live Cinema Orbit preview
  // (this file's startCinemaOrbit/step()). PHOTO_SUN_ELEVATION_END is deliberately the SAME value
  // Alt+S already uses, so every other dusk-tuned constant (fog dayT blend, ground albedo, exposure
  // cut) still lands on the exact look they were tuned against once the film reaches its last frame.
  var PHOTO_SUN_ELEVATION_START = 55;  // "high noon" look for an establishing open — not 90 (a
                                        // straight-down sun reads flat/shadowless on a building)
  var PHOTO_SUN_ELEVATION_END = PHOTO_SUN_ELEVATION;
  function _sunElevationAt(tNorm) {
    return PHOTO_SUN_ELEVATION_START + (PHOTO_SUN_ELEVATION_END - PHOTO_SUN_ELEVATION_START) * tNorm;
  }
  // updateSky() repositions the sun/sky/fog/lensflare but does NOT touch the shadow map — it has no
  // reason to, every OTHER caller (Time Machine, plain nav) already re-renders continuously. A film
  // with a moving sun does not: shadowMap.autoUpdate is off by default (perf — see streaming.js/
  // effects.js §PHOTO_SHADOW comments), so without this the sky/fog would visibly sweep noon→dusk
  // while every shadow stayed frozen at whatever angle was last baked — worse than not animating at
  // all, since the mismatch reads as a bug rather than a static look. Called every frame the sun
  // moves, right after updateSky(), so no frame captures with a stale shadow angle.
  function _sunArcStep(tNorm) {
    if (!A.updateSky) return;
    var _el = _sunElevationAt(tNorm);
    A.updateSky(_el, PHOTO_SUN_AZIMUTH);
    if (A.renderer) A.renderer.shadowMap.needsUpdate = true;
    console.log('§SUN_ARC_STEP tNorm=' + tNorm.toFixed(3) + ' elevation=' + _el.toFixed(1) +
      ' (start=' + PHOTO_SUN_ELEVATION_START + ' end=' + PHOTO_SUN_ELEVATION_END + ')');
  }
  A._sunArcStep = _sunArcStep;
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
  // ══ §MIRROR_TRUE_REFLECT (PHOTOREAL_STILL_RENDER.md ▶RESUME item 1) — mirrors are IfcFlowTerminal,
  // and STD_MAT.IfcFlowTerminal carries envInt:0.05 (§HOSPITAL_BLUE_TINT/§PIPE_DUCT_BLUE_TINT — a
  // fix meant to kill a blue-sky-tint on pipes/ducts, applied class-wide). That sets
  // mat.userData._photoEnvExempt=true in streaming.js's _getMaterial(), which is
  // _reassertPhotoMatBoost's very FIRST early-return guard below — mirrors get swept up in a fix
  // meant for a different fixture and never get boosted, never get room-probe-eligible, never get a
  // true-mirror roughness. Confirmed exclusive by direct DB query (Clinic): the 22 real
  // "M_Mirror:Mirror 600mm x 900mm" elements carry material_rgba 0.843,0.843,0.843,1.000 — not
  // shared with any other IfcFlowTerminal fixture in the building (grab bars/lights/exit signs/etc
  // all carry distinct rgba values). streaming.js _getMaterial's cacheKey includes rgba+class, so
  // this is a genuinely exclusive material — excluding it from the exemption cannot leak into
  // diffusers/grilles/any other fixture sharing the class. Lookup uses the same
  // name-keyword-query-via-elements_meta pattern as §PHOTO_EMBER's EMBER_WORDS, cached per building.
  var _mirrorMatSet = null, _mirrorMatBuilding = null;
  function _mirrorReflectMats() {
    if (_mirrorMatSet && _mirrorMatBuilding === A.activeBuilding) return _mirrorMatSet;
    _mirrorMatSet = Object.create(null);
    _mirrorMatBuilding = A.activeBuilding;
    if (typeof A.dbQuery !== 'function' || !A.guidMap || !A.collectMeshes) return _mirrorMatSet;
    var rows;
    try {
      rows = A.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class='IfcFlowTerminal' AND lower(element_name) LIKE '%mirror%'") || [];
    } catch (e) { console.warn('§MIRROR_TRUE_REFLECT query failed: ' + e.message); return _mirrorMatSet; }
    if (!rows.length) { console.log('§MIRROR_TRUE_REFLECT bld=' + A.activeBuilding + ' no mirrors — nothing to fix'); return _mirrorMatSet; }
    var want = Object.create(null);
    for (var i = 0; i < rows.length; i++) want[rows[i][0]] = 1;
    var ids = Object.create(null), hits = 0;
    for (var k in A.guidMap) if (want[A.guidMap[k]]) { ids[parseInt(String(k).split('_')[0], 10)] = 1; hits++; }
    var meshes = 0, mats = 0;
    A.collectMeshes(function(o) { return o.isMesh; }).forEach(function(o) {
      if (!ids[o.id]) return;
      meshes++;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m) {
        if (!m || _mirrorMatSet[m.uuid]) return;
        _mirrorMatSet[m.uuid] = m; mats++;
      });
    });
    console.log('§MIRROR_TRUE_REFLECT bld=' + A.activeBuilding + ' guids=' + rows.length +
      ' guidMapHits=' + hits + ' meshes=' + meshes + ' materials=' + mats);
    return _mirrorMatSet;
  }
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
  var PHOTO_HEMI_INTENSITY_SCALE = 1.0;    // was 1.25 — §MOVIE_SHADOW_TM (fill no longer lifted above TM's)
  var PHOTO_AMBIENT_INTENSITY_SCALE = 1.0;  // was 1.15 — §MOVIE_SHADOW_TM (fill no longer lifted above TM's)
  // §GROUND_ALBEDO — the multiplicative lever the two paragraphs above never had. Everything they
  // describe is ADDITIVE (emissive add; hemi/ambient fill), which is exactly why both flattened the
  // cast shadow; this one scales lit and shadowed ground by the same factor. The claim that the
  // ground was "ALREADY rendering at maximum brightness… no tint could ever make it brighter" is
  // wrong: _setGroundColor forces WHITE under a map, and white is the multiplicative identity, not
  // a ceiling. Full analysis + the 52:1 arithmetic: PHOTOREAL_STILL_RENDER.md §GROUND_DARK_RETHINK.
  // MEASURED, not assumed: linear-average luminance of viewer/textures/ground/paved_1k.jpg over a
  // 128x128 downsample, sRGB-decoded — the same method textures/materials/NOTICE.txt already uses
  // to derive each TRIPLANAR_MAT normFactor (concrete 0.723, plaster 0.742, metal 0.535).
  var GROUND_TEX_AVG_LUM = 0.155;
  A._photoGroundAlbedoGain = 2.3;   // 2.3 x 0.155 = 0.36 albedo. Console-tunable for A/B.
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
    var changed = false, _visMeshes = 0, _flippedOn = 0;
    A.scene.traverse(function(o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible) return;
      _visMeshes++;
      if (!o.castShadow) {
        o.castShadow = true; o.receiveShadow = true; changed = true; _flippedOn++;
      }
    });
    if (changed && A.renderer) A.renderer.shadowMap.needsUpdate = true;
    if (force) console.log('§PHOTO_SHADOW_FORCE_REASSERT visMeshes=' + _visMeshes +
      ' flippedOn=' + _flippedOn + ' (0 flipped = every visible mesh already had castShadow on)');
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
      if (!m || !('envMap' in m)) return;
      // §MIRROR_ROOM_PROBE: glossy/metal + mirror materials (flagged once by _reassertPhotoMatBoost
      // below) reflect the local room-probe capture instead of the static sky, once it's built —
      // this function already runs every accumulation tick, so it naturally upgrades them from the
      // sky fallback to the real probe the moment _buildRoomProbe() finishes, no separate loop needed.
      var target = (m.userData && m.userData._photoRoomProbeEligible && _roomProbeRT)
        ? _roomProbeRT.texture : A._envMap;
      if (m.envMap !== target) { m.envMap = target; m.needsUpdate = true; }
    });
  }
  function _reassertPhotoMatBoost() {
    if (!_photoMatBoostActive || !A._matCache) return;
    var mirrorMats = _mirrorReflectMats();  // §MIRROR_TRUE_REFLECT — cached per building, cheap to call every tick
    Object.keys(A._matCache).forEach(function(k) {
      var m = A._matCache[k];
      if (!m) return;
      var isMirror = !!mirrorMats[m.uuid];  // §MIRROR_TRUE_REFLECT — exclusive material, bypasses the exemption below
      if ((m.userData && (m.userData._photoBoosted || (m.userData._photoEnvExempt && !isMirror))) ||
          typeof m.envMapIntensity !== 'number') return;
      // §PHOTO_ENVMAP_DOUBLE_BOOST_FIX (2026-08-15): _photoEnvExempt (streaming.js's per-class
      // §HOSPITAL_BLUE_TINT envInt override) skips this blanket boost entirely — that override was
      // already hand-tuned to fight the sky's blue PMREM reflection on these specific classes;
      // re-boosting on top of it undid the tuning specifically during Alt+S/Alt+G captures.
      var isMetal = typeof m.metalness === 'number' && m.metalness > PHOTO_METAL_THRESHOLD;
      var isGlossy = isMirror || isMetal || (typeof m.roughness === 'number' && m.roughness <= PHOTO_GLOSSY_ROUGHNESS_MAX);
      if (isGlossy) {
        m.userData._photoOrigEnvMapIntensity = m.envMapIntensity;
        m.envMapIntensity = m.envMapIntensity * PHOTO_ENVMAP_BOOST;
        m.userData._photoRoomProbeEligible = true;  // §MIRROR_ROOM_PROBE — read every tick by _reassertPhotoEnvMap above
      }
      if (isMetal || isMirror) {
        m.userData._photoOrigRoughness = m.roughness;
        // §MIRROR_TRUE_REFLECT: a real mirror is near-perfect specular, not tightened-metal —
        // force near-zero roughness instead of the metal scale-down.
        m.roughness = isMirror ? 0.03 : Math.max(0.05, m.roughness * PHOTO_METAL_ROUGHNESS_SCALE);
      }
      // §MIRROR_TRUE_REFLECT_METALNESS (found live 2026-08-16+1 — the roughness-only fix above
      // shipped but user reported "still not reflection in mirror"): STD_MAT.IfcFlowTerminal's
      // metal:0.30 was never touched by the fix above. MeshStandardMaterial's PBR split is driven
      // by metalness, not roughness — at metalness 0.3 the BRDF still blends ~70% diffuse albedo
      // into the output (diffuseColor = albedo*(1-metalness)), so even a perfectly sharp, boosted
      // envMap reflection reads as a faint sheen on top of a mostly-flat grey surface, not a mirror
      // image. Roughness alone controls how BLURRY a reflection is, not how STRONG it is relative
      // to diffuse — the two are independent PBR parameters, and only one was fixed. Force
      // near-1.0 metalness for mirrors specifically (glass/other glossy classes keep their real
      // metalness — this is mirror-only, gated by the same `isMirror` exclusivity as the rest of
      // this fix).
      if (isMirror) {
        m.userData._photoOrigMetalness = m.metalness;
        m.metalness = 0.95;
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
    // §PHOTO_SHADOW_TARGET_CENTRE (2026-08-11, real user report: "no shadow at high noon" on the
    // film's OPENING DIVE beat): was A.controls.target unconditionally — the shadow camera was
    // aimed wherever the VIEW camera currently happens to be looking, not at the building. During
    // an establishing dive the view target drifts far from the building, so the whole shadow
    // frustum (any _env size, any sun angle) could miss the building outright — a DIFFERENT bug
    // from §PHOTO_SUN_SHADOW_REACH above (that one was frustum SIZE; this is frustum POSITION).
    // Same failure shape §CINEMA_PIVOT already found + fixed for the camera orbit pivot itself
    // (this file, _cinemaPathPlan, "WAS: var tgt = A.controls.target; UNCONDITIONALLY") — reusing
    // its proven fix, not reinventing: the real building bbox centre via A.ifc2three(), the
    // established IFC->scene axis transform, not a guessed axis mapping.
    var _ctr = A.controls ? A.controls.target : { x: 0, y: 0, z: 0 };
    var _camTgtForLog = { x: _ctr.x, y: _ctr.y, z: _ctr.z };
    var _shadowBbox = _buildingBBoxArc() || _buildingBBoxIfc();
    var _centreSrc = 'camera-target(FALLBACK, no bbox/ifc2three)';
    if (_shadowBbox && A.ifc2three) {
      var _sLo = A.ifc2three(_shadowBbox.xMin, _shadowBbox.yMin, _shadowBbox.zMin);
      var _sHi = A.ifc2three(_shadowBbox.xMax, _shadowBbox.yMax, _shadowBbox.zMax);
      _ctr = { x: (_sLo.x + _sHi.x) / 2, y: (_sLo.y + _sHi.y) / 2, z: (_sLo.z + _sHi.z) / 2 };
      _centreSrc = 'building-bbox-centre';
    }
    console.log('§PHOTO_SHADOW_TARGET src=' + _centreSrc +
      ' target=(' + _ctr.x.toFixed(1) + ',' + _ctr.y.toFixed(1) + ',' + _ctr.z.toFixed(1) + ')' +
      ' cameraTarget=(' + _camTgtForLog.x.toFixed(1) + ',' + _camTgtForLog.y.toFixed(1) + ',' + _camTgtForLog.z.toFixed(1) + ')' +
      ' drift=' + Math.hypot(_ctr.x - _camTgtForLog.x, _ctr.y - _camTgtForLog.y, _ctr.z - _camTgtForLog.z).toFixed(1));
    A.sun.target.position.copy(_ctr);
    A.sun.target.updateMatrixWorld();
    var _env = 300;
    var _bc = Object.values(A.buildingCentres || {})[0];
    if (_bc && _bc.envelope) _env = Math.ceil(_bc.envelope);
    _env = Math.max(_env, 50);
    // §PHOTO_SKYLINE_SHADOW_FRUSTUM (bug: "the silhouette buildings in distance cannot cast shadows
    // well" — confirmed via real measured numbers, not assumption: HHS_Office_Federated envelope=
    // 68.17m gave a frustum half-width of 69m, but the skyline ring (built in _buildPhotoProps,
    // radius = envelope * PHOTO_SKYLINE_RADIUS_MULT) sits at ~150m — all 36/36 skyline boxes fell
    // entirely outside [-_env,_env] on X and/or Z, so they were clipped from the shadow depth pass
    // before any render, regardless of castShadow. This has been true since the photo-shadow
    // feature's OWN introduction (PR #806, 2026-07-16) — the same commit that set the skyline ring
    // to its current radius multiplier never accounted for it here; not a later drift-apart
    // regression. Recomputed from the SAME real bbox query _buildPhotoProps() itself uses (not read
    // off the built skyline group, which may not exist yet — _enablePhotoShadows() runs BEFORE
    // _buildPhotoProps()/_showPhotoProps(true) in _applyPhotoStaging's call order below, so a
    // group-based read would miss the very first Alt+S press for a building).
    var _skyBbox = _buildingBBoxIfc();
    if (_skyBbox) {
      var _skyEnvelope = Math.max(_skyBbox.xMax - _skyBbox.xMin, _skyBbox.yMax - _skyBbox.yMin, 50);
      var _skyRadius = _skyEnvelope * PHOTO_SKYLINE_RADIUS_MULT;
      _env = Math.max(_env, Math.ceil(_skyRadius + PHOTO_SKYLINE_BOX_MARGIN));
    }
    // §PHOTO_SUN_SHADOW_REACH (2026-08-11, real numbers not eyeballed — see
    // prompts/PHOTOREAL_STILL_RENDER.md §SUN_ARC "study the maths" section): the skyline-only
    // _env above sizes the frustum from the building's FOOTPRINT, never from how far a LOW sun
    // throws a shadow. At dusk (elevation=6°) shadow reach = height/tan(6°) ~ 9.5x the building's
    // own height — for HHS_Office_Federated (height~19.8m) that's ~188m, exceeding the ~180m
    // skyline-only _env, so the shadow's own tip fell outside its shadow camera's frustum and was
    // silently clipped (never rendered, not a shading bug). Measured: a real 52-frame bake showed
    // contrast/dynamic-range declining monotonically toward dusk instead of increasing, consistent
    // with this (scratchpad/analyze_hhs_shadow_frames.py, this session's own witness).
    // Elevation read directly from A.sun.position, not passed in (this function has no elevation
    // param) — scene.js updateSky() sets sun.position = direction * 5000 (a fixed constant, not
    // approximated here), so elevation = asin(y/5000) is exact.
    if (_skyBbox) {
      var _bldgHeight = Math.max(1, _skyBbox.zMax - _skyBbox.zMin);
      var _elevRad = Math.asin(Math.max(-1, Math.min(1, A.sun.position.y / 5000)));
      var _elevDeg = THREE.MathUtils.radToDeg(_elevRad);
      if (_elevDeg > 0.5) {  // guard: at/below horizon, tan() blows up to a meaningless frustum
        var _shadowReach = _bldgHeight / Math.tan(_elevRad);
        var _envBefore = _env;
        _env = Math.max(_env, Math.ceil(_shadowReach + PHOTO_SKYLINE_BOX_MARGIN));
        if (_env !== _envBefore) console.log('§PHOTO_SUN_SHADOW_REACH elevation=' + _elevDeg.toFixed(1) +
          ' bldgHeight=' + _bldgHeight.toFixed(1) + ' shadowReach=' + _shadowReach.toFixed(0) +
          ' env ' + _envBefore + '->' + _env);
      }
    }
    // NOTE: computed AFTER A.updateSky() has already positioned A.sun at the dusk direction (see
    // call order in _applyPhotoStaging below) — using the ORIGINAL toggleShadow() order (frustum
    // math before the sun is repositioned) would size this frustum for the wrong sun distance.
    var _sunDist = A.sun.position.distanceTo(_ctr);
    // §PHOTO_SHADOW_RESOLUTION (2026-08-11, real user report: shadow "has no effect on the top
    // fixtures... not thrown on roof"): §PHOTO_SUN_SHADOW_REACH above correctly widens _env to fit
    // the building's own long shadow at low sun angles, but that widening spreads the SAME fixed
    // texel budget more thinly across a bigger frustum -- small rooftop-scale objects (equipment,
    // fixtures, ~1-2m) end up with only a handful of texels and their shadow washes out under PCF
    // filtering, even though §PHOTO_SHADOW_FRUSTUM_COVERAGE already proves they're geometrically
    // IN the frustum with castShadow=true. Doubling resolution here (2048->4096, 4x memory/render
    // cost for the shadow pass) is deliberately scoped to THIS bake-only path, not A.toggleShadow's
    // own 2048 (tools.js §S288: "quarters the texel cost of every shadow render" -- that number was
    // chosen for a shadow mode active during CONTINUOUS live navigation, a cost/frame every frame;
    // this path only ever runs during a deliberate Alt+S/MaxQ capture, never during normal nav, so
    // the same cost concern does not apply here).
    A.sun.shadow.mapSize.width = 4096;
    A.sun.shadow.mapSize.height = 4096;
    A.sun.shadow.camera.near = Math.max(1, _sunDist * 0.05);
    A.sun.shadow.camera.far = _sunDist * 4;
    A.sun.shadow.camera.left = -_env;
    A.sun.shadow.camera.right = _env;
    A.sun.shadow.camera.top = _env;
    A.sun.shadow.camera.bottom = -_env;
    // §PHOTO_SHADOW_BIAS_SCALE (2026-08-12 — the root cause of §MAIN_BUILDING_SHADOW; every number
    // below was MEASURED live this session on HHS_Office_Federated, none guessed).
    // three.js applies shadow.bias in NORMALISED depth, not metres — shadowmap_pars_fragment.glsl
    // does literally `shadowCoord.z += shadowBias` where z spans [0,1] across the shadow camera's
    // near..far. So the world-space peter-panning it produces is bias * (far - near), and the same
    // constant means completely different things on two different shadow cameras:
    //   A.toggleShadow (tools.js, the path the user confirms has ALWAYS worked, and the path this
    //     one was copied from): it repositions the sun to ctr + env*(0.8,2,0.6), measured
    //     sunDist=150 -> near=7.7 far=617.2, range=609.4 m -> -0.0005 = 0.305 m. Fine.
    //   this path: it must NOT reposition the sun (A.sun.position is what updateSky, the Sky shader
    //     and the lensflare all read — it stays at direction*5000), so measured sunDist=5000 ->
    //     near=250 far=19998, range=19,748 m -> the SAME -0.0005 = 9.874 m. 32.4x.
    // A 9.87 m world bias erases every shadow whose caster->receiver separation along the sun ray
    // is under ~10 m. That separation is casterHeight / sin(elevation), so at the film's 55 deg
    // opening nothing under 8.1 m tall cast anything at all: every rooftop fixture, and the near
    // part of the building's own short ground shadow — while the tall skyline silhouette props
    // cleared it easily, which is exactly the differential the user reported ("shadows only hit
    // the other silhouette, not the HHS Office nor its roof"). Proven by paired A/B on a real
    // render: changing ONLY this line's value, same camera/sun/geometry, darkened 1,665 px at the
    // 55 deg opening and 12,095 px at dusk, and brightened 0 px at either
    // (scratchpad witness_shadow_bias_ab.js — the change only ever ADDS shadow).
    // Fix: hold the WORLD-space bias, don't copy the normalised constant. Floor is toggleShadow's
    // own proven 0.305 m; at grazing sun one shadow texel spans texelWorld/tan(elevation) of depth,
    // so the bias must also clear that or the ground self-shadows (acne). The arc's LOWEST
    // elevation is used because _enablePhotoShadows runs once at staging while _sunArcStep sweeps
    // the sun 55->6 deg afterwards without recomputing this camera — so the bias has to be safe at
    // the worst angle the film reaches, not just at the angle staging happened to see.
    var _shadowRange = A.sun.shadow.camera.far - A.sun.shadow.camera.near;
    var _texelWorld = (2 * _env) / A.sun.shadow.mapSize.width;
    var _grazeRad = THREE.MathUtils.degToRad(Math.max(1, PHOTO_SUN_ELEVATION_END));
    var _worldBias = Math.max(0.305, _texelWorld / Math.tan(_grazeRad));
    A.sun.shadow.bias = -(_worldBias / _shadowRange);
    console.log('§PHOTO_SHADOW_BIAS worldBias=' + _worldBias.toFixed(3) + 'm bias=' + A.sun.shadow.bias.toExponential(3) +
      ' range=' + _shadowRange.toFixed(0) + 'm texel=' + _texelWorld.toFixed(3) + 'm grazeElev=' + PHOTO_SUN_ELEVATION_END +
      ' (was -0.0005 = ' + (0.0005 * _shadowRange).toFixed(2) + 'm, which erased every caster under ' +
      (0.0005 * _shadowRange * Math.sin(THREE.MathUtils.degToRad(PHOTO_SUN_ELEVATION_START))).toFixed(1) +
      'm tall at the arc start)');
    A.sun.shadow.camera.updateProjectionMatrix();
    if (A.ground) A.ground.receiveShadow = true;
    var _shadowList = [];
    A.scene.traverse(function(o) { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) _shadowList.push(o); });
    // §PHOTO_SHADOW_FRUSTUM_COVERAGE (2026-08-11, real user ask: "GIGO code witness logging must
    // reveal" -- not another video/frame-extraction round-trip): direct geometric proof of whether
    // the shadow camera can actually SEE the casting geometry, computed from live scene state, no
    // render needed. A.sun.shadow.updateMatrices() forces the shadow camera's position/matrices to
    // reflect the position/target JUST set above -- normally the renderer does this lazily before
    // its own shadow pass, but nothing has rendered yet at this point in the function, so without
    // this call the frustum test below would run against STALE (previous frame's) camera matrices.
    // §PHOTO_SHADOW_FRUSTUM_STALE_LIGHT (2026-08-12): updateMatrices() reads the shadow camera's
    // position out of light.matrixWorld, NOT light.position — and nothing has refreshed matrixWorld
    // since updateSky moved the sun, so without this line the frustum test can run against the sun's
    // PREVIOUS world position and report a coverage gap that does not exist at render time (the
    // renderer's own scene.updateMatrixWorld runs before its shadow pass). Measured: a load that
    // used A.toggleShadow first, then staged, logged inFrustum=2 outsideFrustum=349 here purely
    // from that staleness, while a clean load logged inFrustum=351 outsideFrustum=0 on identical
    // geometry. time_machine.js's applySunCycle already calls sun.updateMatrixWorld() for the same
    // reason; this path had not. Instrumentation correctness — the render was never affected.
    A.sun.updateMatrixWorld();
    A.sun.shadow.updateMatrices(A.sun);
    var _frustum = new THREE.Frustum();
    _frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(
      A.sun.shadow.camera.projectionMatrix, A.sun.shadow.camera.matrixWorldInverse));
    var _inFrustum = 0, _outFrustum = 0;
    _shadowList.forEach(function(o) {
      if (!o.visible) return;
      if (o.geometry && !o.geometry.boundingSphere && o.geometry.computeBoundingSphere) o.geometry.computeBoundingSphere();
      if (_frustum.intersectsObject(o)) _inFrustum++; else _outFrustum++;
    });
    console.log('§PHOTO_SHADOW_FRUSTUM_COVERAGE inFrustum=' + _inFrustum + ' outsideFrustum=' + _outFrustum +
      ' (outsideFrustum = geometry the shadow camera cannot see right now, regardless of castShadow flags -- ' +
      'nonzero here is a real, unfixed frustum-coverage gap; zero here rules frustum coverage OUT as the cause)');
    var _si = 0;
    (function _chunk() {
      var end = Math.min(_si + 5000, _shadowList.length);
      for (; _si < end; _si++) { var o = _shadowList[_si]; if (o.visible) { o.castShadow = true; o.receiveShadow = true; } }
      A.renderer.shadowMap.needsUpdate = true;
      if (_si < _shadowList.length) setTimeout(_chunk, 0);
      else console.log('§PHOTO_SHADOW enabled casters=' + _shadowList.length + ' sunDist=' + _sunDist.toFixed(0) +
        ' env=' + _env + ' texelPerM=' + (A.sun.shadow.mapSize.width / (2 * _env)).toFixed(1));
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
  var _photoDuskMoodApplied = false;  // §PHOTO_SUN_SEPARATION: snapshot of A._photoDuskMood at
                                       // staging time, so teardown restores exactly what staging
                                       // actually did even if the flag changes mid-session.
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
  // §MIRROR_ROOM_PROBE (2026-08-16, user: "what does it take for mirrors to truly reflect... you
  // may try the single room-representative probe first"): glossy/metal materials only ever
  // reflected the static sky/HDRI env map (A._envMap) — no local reflection of the actual scene
  // existed anywhere (grepped: no CubeCamera/Reflector/WebGLCubeRenderTarget before this). One
  // CubeCamera capture at a representative interior point — same "35% up from the lowest point"
  // heuristic _cinemaPathPlan's own pivot already uses to land inside the building rather than at
  // its exact geometric bbox centre (often void/roof) — 6 renders, ONE-TIME per staging session
  // (this is a frozen still, not real-time navigation), used as envMap for the isGlossy set
  // (_reassertPhotoMatBoost) in place of the sky.
  //
  // A per-element "real mirror" boost (name-keyword vocabulary, e.g. Clinic's own
  // IfcFlowTerminal "M_Mirror:Mirror 600mm x 900mm" — IFC class is inconsistent, not a distinct
  // mirror class) was ATTEMPTED and DROPPED, not shipped: A._matCache (what this whole boost/
  // envmap system reads) only holds materials for INSTANCED/MERGED-tracked elements. Clinic's 22
  // mirror elements render via the BATCHED path instead (confirmed live — the user's own pasted
  // console log shows `§BATCHED_PICK batchId=2`), which shares ONE vertex-coloured material per
  // batch and never registers a `color|class|discipline` entry in _matCache at all — so a
  // per-element mirror boost has NOTHING to attach to for THIS class of element, regardless of how
  // the guid lookup is written. Fixing that needs a batched-mesh-aware boost path, a materially
  // bigger change than "try the room probe first" — named here, not built. Generic glossy/metal
  // materials (pipes, railings, ducts) are NOT affected by this gap in the common case: they're
  // typically large-count/merged/instanced and DO show up in A._matCache normally (verified live
  // on Terminal's real pipe classes — see §MIRROR_ROOM_PROBE_PIPE_CHECK below).
  // §MIRROR_ROOM_PROBE_REUSE (2026-08-16, real bug found+fixed via a headless bisection — dispose+
  // rebuild every Alt+S cycle leaked +1 texture/cycle, compounding: measured C1/C2/C3 exit deltas
  // 25,1,1. Isolating a bare `new WebGLCubeRenderTarget().dispose()` loop OUTSIDE the real staging
  // pipeline showed NO growth (stable), so the leak is specific to disposing the RT while it's
  // real staged materials' active envMap — most likely a material still holding the (about to be
  // disposed) texture reference across a stray render triggers three.js to silently re-upload a
  // fresh GL texture no code then tracks/disposes. Disabling just the build call made the leak
  // disappear entirely (confirms the RT lifecycle, not the material-boost logic, is the cause).
  // Fix: never dispose+rebuild on a normal Alt+S cycle — build ONCE, keep it alive, just re-render
  // its 6 faces on each staging press (same "created once, reused across sessions" discipline this
  // file already uses for A._camLight). Only disposed on a real building switch.
  var _roomProbeRT = null, _roomProbeCam = null, _roomProbeBuilding = null;
  function _buildRoomProbe() {
    var bbox = _buildingBBoxIfc();
    if (!bbox || !A.ifc2three || !A.renderer || !A.scene) return;
    if (_roomProbeRT && _roomProbeBuilding !== A.activeBuilding) _disposeRoomProbe();
    var lo = A.ifc2three(bbox.xMin, bbox.yMin, bbox.zMin);
    var hi = A.ifc2three(bbox.xMax, bbox.yMax, bbox.zMax);
    var pos = {
      x: (lo.x + hi.x) / 2,
      y: Math.min(lo.y, hi.y) + Math.abs(hi.y - lo.y) * 0.35,
      z: (lo.z + hi.z) / 2
    };
    var envelope = Math.max(Math.abs(hi.x - lo.x), Math.abs(hi.z - lo.z), 50);
    var isNew = !_roomProbeRT;
    if (isNew) {
      _roomProbeRT = new THREE.WebGLCubeRenderTarget(128);
      _roomProbeCam = new THREE.CubeCamera(0.5, envelope * 3, _roomProbeRT);
      _roomProbeBuilding = A.activeBuilding;
    }
    _roomProbeCam.position.set(pos.x, pos.y, pos.z);
    _roomProbeCam.update(A.renderer, A.scene);
    console.log('§MIRROR_ROOM_PROBE ' + (isNew ? 'built' : 'reused') + ' pos=(' + pos.x.toFixed(1) +
      ',' + pos.y.toFixed(1) + ',' + pos.z.toFixed(1) + ') envelope=' + envelope.toFixed(1) + ' size=128');
  }
  function _disposeRoomProbe() {
    if (!_roomProbeRT) return;
    _roomProbeRT.dispose();
    _roomProbeRT = null;
    _roomProbeCam = null;
    _roomProbeBuilding = null;
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
      // too dark once the evening exposure/ambient cuts also apply on top of it. Switched to
      // 'paved' (same real asset Shadow mode already uses — concrete look, per user's own
      // suggestion) with a much brighter warm tint.
      // §GROUND_EARTH_DEFAULT (2026-08-16, user: "more realistic even surface feel" — 'paved'
      // carries concrete_floor_01's rectangular slab-joint relief, which is what the §GROUND_DETAIL
      // normal map (#1388) was amplifying through lighting; 'earth' has no such hard rectangular
      // structure). Back to 'earth' for the movie/still bake default — the ORIGINAL "too dark"
      // complaint this section's own §GROUND_ALBEDO gain already fixed (earth's measured mean
      // 0.1599 vs paved's 0.155 GROUND_TEX_AVG_LUM below — near-identical, so the same gain still
      // lands at the same real-dry-ground target albedo, no recalibration needed).
      // §GROUND_ALBEDO (2026-07-28, user: "the Alt+S evening ground is too dark… albedo, try it") —
      // Witness: W-GROUND-ALBEDO. Set BEFORE _applyGroundTexture, because that function calls
      // _setGroundColor itself (with the remembered solid colour) as soon as the texture lands.
      // 2.3 x the map's measured 0.155 average puts the ground at ~0.36 albedo — real dry concrete
      // (0.25-0.40), not the asphalt (0.05-0.12) it renders as today. Live-tunable from the console
      // for the A/B the user asked for: APP._photoGroundAlbedoGain = 1.0 (default look) / 2.3 / 3.5,
      // then Alt+S again. See tools.js §GROUND_ALBEDO for why a gain and not more fill light.
      A._groundAlbedoGain = A._photoGroundAlbedoGain;
      A._applyGroundTexture('earth');
      if (A._setGroundColor) A._setGroundColor(0xd9c39a);  // bright warm sunlit-concrete tone
      console.log('§GROUND_ALBEDO gain=' + A._groundAlbedoGain.toFixed(2) + ' texAvgLum=' +
        GROUND_TEX_AVG_LUM.toFixed(3) + ' effAlbedo=' + (GROUND_TEX_AVG_LUM * A._groundAlbedoGain).toFixed(3) +
        ' color=' + (A.ground.material.color ? A.ground.material.color.r.toFixed(2) : 'n/a') +
        ' map=' + (A.ground.material.map ? 'paved' : 'none'));
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
    // §PHOTO_SUN_SEPARATION (2026-08-15, user: "Sun should be a separation of concern" — the sun's
    // position/colour/intensity is no longer FORCED by staging by default. Alt+S used to always
    // hard-reset the sun to a fixed 6°-elevation dusk (PHOTO_SUN_ELEVATION/PHOTO_SUN_AZIMUTH,
    // still used by the Alt+C movie sun-arc — untouched, see §SUN_ARC above) on every press,
    // regardless of whatever real time-of-day/sun position was already active — the
    // saved/restored _photoSunPosSaved/_photoSunTargetSaved below is proof a real prior position
    // always existed, it was just being thrown away. NEW DEFAULT: leave A.sun exactly where it
    // already is (plain daylight look). User asked to keep the OLD dusk-mood look reachable for
    // A/B comparison, not deleted — set `APP._photoDuskMood = true` before pressing Alt+S to get
    // the old forced-dusk sun + reddish sky drama + amber night-glow package back; leave it
    // false/unset (the default) for plain daylight. Toggle, re-press Alt+S, compare.
    var _duskMood = !!A._photoDuskMood;
    // §PHOTO_SUN_SEPARATION_FIX (2026-08-16): a direct A.sun.position->sunPosition uniform sync
    // was attempted here to fix a sky/shadow mismatch, but shipped WITHOUT live verification and
    // caused a real regression (sky rendered fully black in production) — REVERTED. The mismatch
    // this was trying to fix is still real and still open; the fix needs to be re-derived and
    // actually tested live before shipping again, not guessed at under time pressure. Do not
    // re-add a raw position->uniform copy without checking what Sky.js's sunPosition uniform
    // actually expects (scene.js's own updateSky() builds it via
    // setFromSphericalCoords(1,...), not by normalizing A.sun.position — those may not be
    // equivalent depending on whether A.sun.position carries any offset beyond a pure direction).
    if (A._sky) { A._sky.visible = true; }
    if (_duskMood && A.updateSky) { A.updateSky(PHOTO_SUN_ELEVATION, PHOTO_SUN_AZIMUTH); }
    // §PHOTO_SKY_DRAMA (user ask: "more dramatic sky... reddish clouds in the distance"): Preetham
    // (Sky.js) is a clear-sky atmospheric-scattering model — push turbidity/rayleigh/mie further
    // for the photoshoot only. Dusk-mood only — see §PHOTO_SUN_SEPARATION above.
    if (_duskMood && A._sky) {
      var _su = A._sky.material.uniforms;
      _photoSkyUniSaved = {
        turbidity: _su['turbidity'].value, rayleigh: _su['rayleigh'].value,
        mieCoefficient: _su['mieCoefficient'].value, mieDirectionalG: _su['mieDirectionalG'].value
      };
      _su['turbidity'].value = 8;
      _su['rayleigh'].value = 3.2;
      _su['mieCoefficient'].value = 0.012;
      _su['mieDirectionalG'].value = 0.9;
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
    _enablePhotoShadows();  // real/current sun position (unless _duskMood) — see §PHOTO_SUN_SEPARATION
    // §PHOTO_SUN_SEPARATION_FIX (2026-08-16, user: beam/railing went dark/no-sheen after the
    // separation shipped — "we switched something else off?"). Root cause: toggleNightMode()
    // isn't only a colour toggle, it also loads ~200 supplementary point lights (fixture glow) —
    // real illumination that specular-lit beam/railing (envInt:0, so they get ZERO reflection
    // contribution by design — see the earlier §HOSPITAL_BLUE_TINT fix — and were leaning on these
    // point lights for their visible sheen). Dropping the whole toggle call to kill the WARM TINT
    // also silently killed that illumination. Fix: split the two concerns apart. The point-light
    // toggle + intensity/exposure restore run UNCONDITIONALLY (real illumination, not mood) — only
    // the COLOUR override (the actual warm-dusk tint) stays dusk-mood-only.
    _photoNightWasOn = !!A._nightMode;
    _photoDuskMoodApplied = _duskMood;  // teardown reads this snapshot, not the live flag
    // §STAGED_PL_CUT — set BEFORE toggleNightMode builds the ~200 fixture point lights, so they
    // are born at the cut intensity (the §NIGHT_STILL_LIGHTS boost branch alone was proven to not
    // fire on this path — witness 2026-08-16). Reset unconditionally in _removePhotoStaging.
    A._nightPLScale = A._nightPLScaleStill || 1;
    if (!_photoNightWasOn && A.toggleNightMode) {
      A.toggleNightMode();  // amber fixture glow (synthetic fallback) + window glow — real light sources
      if (A._nightSaved) {  // always undo the moonlight override (dark intensities) — never mood
        A.sun.intensity = A._nightSaved.sunI * PHOTO_SUN_INTENSITY_SCALE;
        A.ambient.intensity = A._nightSaved.ambI * PHOTO_AMBIENT_INTENSITY_SCALE;
        A.hemi.intensity = A._nightSaved.hemiI * PHOTO_HEMI_INTENSITY_SCALE;
        A.renderer.toneMappingExposure = A._nightSaved.exposure * PHOTO_EXPOSURE_SCALE * PHOTO_EXPOSURE_LIFT;
        // Colour is the actual mood — warm dusk tint only with the flag on; real pre-toggle
        // colours (not PHOTO_*_COLOR) otherwise, so plain-daylight stays plain-daylight-coloured.
        if (_duskMood) {
          A.sun.color.setHex(PHOTO_SUN_COLOR);
          A.ambient.color.setHex(PHOTO_AMBIENT_COLOR);
          A.hemi.color.setHex(PHOTO_HEMI_SKY_COLOR);
        } else {
          A.sun.color.setHex(A._nightSaved.sunColor);
          A.ambient.color.setHex(A._nightSaved.ambColor);
          A.hemi.color.setHex(A._nightSaved.hemiSky);
        }
        var _fill = A.ambient.intensity + A.hemi.intensity;
        console.log('§MOVIE_SHADOW_TM sun=' + A.sun.intensity.toFixed(3) +
          ' ambient=' + A.ambient.intensity.toFixed(3) + ' hemi=' + A.hemi.intensity.toFixed(3) +
          ' fill=' + _fill.toFixed(3) + ' sunFillRatio=' + (_fill ? (A.sun.intensity / _fill).toFixed(3) : 'inf') +
          ' (TM native ratio 2.155 — equal means the bake matches TM shadow strength)');
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
    // §GROUND_COLOR_ORDER_FIX (2026-07-28, found by W-GROUND-ALBEDO, not by reading) — the SAME
    // clobber §PHOTO_FOG_ORDER_FIX above documents, on the SAME call, missed for the ground.
    // A.toggleNightMode() (line ~2694, called for its amber-glow mechanism) also does
    // _setGroundColor(0x0a0a15) (tools.js §S277c) as a side effect. The photo ground colour is set
    // ~78 lines EARLIER, so night's moonlight dim always won: 0x0a0a15's channel sum is 41, under
    // the 0x60 night-dim threshold, so the ground rendered at 0x555566 = 0.333 instead of the
    // intended photo-true 1.0. **The evening ground has been rendering at ONE THIRD of the
    // brightness this file thought it set, since §PHOTO_GROUND_LIT shipped — the 0xd9c39a "bright
    // warm sunlit-concrete tone" never reached the material at all.**
    // MEASURED, same run: §GROUND_ALBEDO logged color=2.30 at staging, and the material read 0.333
    // nine seconds later. Re-asserted HERE, after both clobbering calls, exactly like the fog.
    if (A.ground && A._setGroundColor) {
      A._setGroundColor(0xd9c39a);
      console.log('§GROUND_COLOR_ORDER_FIX reasserted color=' + A.ground.material.color.r.toFixed(2) +
        ' gain=' + A._groundAlbedoGain.toFixed(2));
    }
    // §CAM_LIGHT: created once, reused across staging sessions (cheap: one PointLight, no geometry).
    if (!A._camLight) {
      A._camLight = new THREE.PointLight(CAM_LIGHT_COLOR, CAM_LIGHT_INTENSITY, CAM_LIGHT_DISTANCE, CAM_LIGHT_DECAY);
      // A shadow-casting light riding the camera would need its shadow map rebuilt every frame —
      // exactly the per-frame cost this feature must not add (see §CAM_LIGHT note above).
      A._camLight.castShadow = false;
    }
    A.scene.add(A._camLight);
    console.log('§CAM_LIGHT on intensity=' + CAM_LIGHT_INTENSITY + ' distance=' + CAM_LIGHT_DISTANCE +
      ' decay=' + CAM_LIGHT_DECAY + ' forwardOffset=' + CAM_LIGHT_FORWARD_OFFSET);
    _showPhotoProps(true);
    // §MIRROR_ROOM_PROBE: built LAST, after ground/lights/props are all in their staged state, so
    // the capture reflects the real staged look. The FIRST _reassertPhotoMatBoost() call above (at
    // the top of this function) already ran before this exists — those materials fall back to the
    // sky env map for one tick, then upgrade to this probe on the next accumulation frame via
    // _reassertPhotoEnvMap (which runs every tick regardless of the once-only boost flag).
    _buildRoomProbe();
    console.log('§PHOTO_STAGING on nightWasOn=' + _photoNightWasOn);
  }
  function _teardownPhotoStaging() {
    if (!_photoStagingOn) return;  // §PHOTO_DOUBLE_APPLY_GUARD: nothing staged, nothing to revert
    _photoStagingOn = false;
    A._photoStagingOn = false;
    // §CAM_LIGHT: pull it back out of the scene — normal navigation never carries it.
    if (A._camLight) { A.scene.remove(A._camLight); console.log('§CAM_LIGHT off'); }
    // §LAYER2_HDRI: restore the procedural envMap — the real HDRI is still cached for next time,
    // only the active pointer reverts (normal navigation keeps its existing sky-derived look).
    if (_photoEnvMapSaved !== null) { A._envMap = _photoEnvMapSaved; _photoEnvMapSaved = null; }
    A._envMapHdriActive = false;  // §ALT_FRAME_LUMINANCE: scene.js's throttled regen is safe again
    // §PHOTO_SUN_SEPARATION: only undo the night-mode force-on if THIS staging cycle actually
    // applied dusk mood (snapshot, not the live flag — the user may have flipped it mid-session).
    // §PHOTO_SUN_SEPARATION_FIX: night mode is force-toggled on UNCONDITIONALLY now (point lights
    // are real illumination, not mood) — teardown must undo it unconditionally too, or it sticks
    // on after every Alt+S exit outside dusk mode.
    if (!_photoNightWasOn && A.toggleNightMode) A.toggleNightMode();
    // §STAGED_PL_CUT — unconditional reset (the boost-branch reset alone was proven unreachable
    // on this path); if night mode stays on (user had it on pre-staging), rebuild at nav intensity.
    A._nightPLScale = 1.0;
    if (_photoNightWasOn && typeof A._nightUpdateLights === 'function' && A._nightLights && A._nightLights.length) A._nightUpdateLights();
    _photoDuskMoodApplied = false;
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
      // §MIRROR_TRUE_REFLECT_METALNESS: undo the forced near-1.0 metalness, same restore
      // discipline as roughness/envMapIntensity above.
      if (m.userData._photoOrigMetalness !== undefined) {
        m.metalness = m.userData._photoOrigMetalness;
        delete m.userData._photoOrigMetalness;
      }
      delete m.userData._photoBoosted;
      // §MIRROR_ROOM_PROBE: drop back to the sky env map — same "restore what you borrowed" rule
      // as everything else here. The probe's RT itself is DELIBERATELY NOT disposed here (see
      // §MIRROR_ROOM_PROBE_REUSE above) — it stays alive, reused on the next Alt+S press, only
      // freed by _buildRoomProbe() itself on a real building switch.
      delete m.userData._photoRoomProbeEligible;
      if (A._envMap) m.envMap = A._envMap;
      m.needsUpdate = true;
    });
    _photoEnvBoostedMats = [];
    _disablePhotoShadows();
    if (A.ground && A._applyGroundTexture) {
      // §GROUND_ALBEDO: hand the gain back BEFORE restoring, or the lift follows the user out of
      // the photoshoot into normal navigation — the same "restore what you borrowed" rule
      // A._nightMaxLightsStill already has (NIGHT_AND_FIXTURE_LIGHTING.md §constants).
      A._groundAlbedoGain = 1.0;
      A._applyGroundTexture(_photoGroundPrevKey);  // null → clears map, restores flat color
      if (_photoGroundPrevColor != null && A._setGroundColor) A._setGroundColor(_photoGroundPrevColor);
      A.ground.visible = _photoGroundWasVisible;
      console.log('§GROUND_ALBEDO restored gain=' + A._groundAlbedoGain.toFixed(2) +
        ' color=' + (A.ground.material.color ? A.ground.material.color.r.toFixed(2) : 'n/a'));
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
    // §ALTS_MEM_HOG (2026-08-16, measured via headless probe — prompts/PHOTOREAL_STILL_RENDER.md
    // ▶RESUME item 3): was `_showPhotoProps(false)`, which only sets .visible=false on
    // _photoUplights/_photoSkyline/_photoSkylineLights and does nothing at all for _photoSparkles
    // (they stay exactly as the last accumulation frame's sun-glint test left them — up to a few
    // visibly ON in normal daylight nav). Neither path disposes anything — the whole photo-prop
    // tree (up to ~30 PointLights, 40 skyline-box meshes, 1 window-sparkle Points cloud, ~24 glint
    // sprites) stays allocated forever after a REAL Alt+S exit, only freed later by a building
    // switch (_showPhotoProps(true)'s own rebuild guard). Measured on HHS_Office_Federated,
    // headless: renderer.info after startStillRefine()->stopStillRefine(true,false) never returned
    // to baseline — textures +22, geometries +52, programs +36, scene.children +42 net, all
    // surviving the "real exit" path (this function only runs when keepStaging is NOT set — a
    // camera-move soft-park skips it entirely, so this is never the reuse-for-perf case).
    // _disposePhotoProps() is the exact function _showPhotoProps(true) already calls to rebuild on
    // a building switch — reusing it here on real exit correctly frees the GPU resources AND fixes
    // the stray-visible-sparkle bug, at the cost of a rebuild on the next Alt+S press (cheap: a
    // handful of dbQuery calls + <50 objects, not the streaming-heavy path).
    _disposePhotoProps();
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
      var shadowRestoreMat = null, shadowRestoreQuad = null, aoScratchRT = null;
      if (STILL_SHADOW_RESTORE_ENABLED) {
        var _srFrag = [
          'uniform sampler2D tAO;',
          'uniform sampler2D tSharp;',
          'uniform sampler2D tDepth;',
          'uniform sampler2D tShadowMap;',
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
          '  return step(sc.z, texture2D(tShadowMap, sc.xy).r);',
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

      var adapter = {
        enabled: false,        // §PHOTO_AO_GATE: disabled = EffectComposer skips it entirely — the
                               // zero-cost-when-off discipline everything else in this file follows
        needsSwap: true, clear: false, renderToScreen: false,
        setSize: function(w, h) {
          n8.setSize(w, h);
          _stillAODepthDirty = true;
          if (aoScratchRT) aoScratchRT.setSize(w, h);
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
          // §SUN_SHADOW_RESTORE: only reroute N8AO's output into the scratch target (and pay for
          // the extra mask/blend pass) when a real sun shadow is actually available to restore —
          // otherwise this is byte-identical to the pre-existing n8.render(..., writeBuffer, ...).
          // A._sunShadowRestoreEnabled is a live, runtime-toggleable override (default true) — same
          // shape as A._shadowOn etc — so a same-session witness A/B can flip it after AO has
          // already converged (n8's own accumulation is untouched by this pass's output routing)
          // without needing two separate page loads / two separate builds.
          var canRestore = STILL_SHADOW_RESTORE_ENABLED && A._sunShadowRestoreEnabled !== false &&
            shadowRestoreMat && A.sun && A.sun.castShadow && A.sun.shadow && A.sun.shadow.map;
          if (canRestore) {
            n8.render(renderer2, aoScratchRT, readBuffer);
            var u = shadowRestoreMat.uniforms;
            u.tAO.value = aoScratchRT.texture;
            u.tSharp.value = readBuffer.texture;
            u.tDepth.value = n8.beautyRenderTarget.depthTexture;
            u.tShadowMap.value = A.sun.shadow.map.texture;
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
      if (A._sunShadowRestoreEnabled === undefined) A._sunShadowRestoreEnabled = true;
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
        ' intensity=' + STILL_AO_INTENSITY + ' denoiseRadius=' + ao.pass.configuration.denoiseRadius +
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
    // §PHOTO_EMBER / §PHOTO_BLOOM: same rule, and this is the ONLY place they are turned off —
    // every cancel, interaction and cinema handoff funnels through here, so a glowing building can
    // never outlive its still. Restoring the materials matters more than disabling the pass: an
    // emissive left on would follow the user back into navigation.
    if (A._bloomPass) A._bloomPass.enabled = false;
    _emberOff();
    // §GLOW_LENS_QUAD: still-only content — always tear down on a REAL exit (!keepStaging). A
    // bake-frame cancel (keepStaging=true) skips the dispose+rebuild when something is already
    // staged AND the TM-visible fixture count is unchanged since the last stage — unlike the round
    // sprite (camera-dependent eye-offset) and §NIGHT_STILL_LIGHTS (camera-frustum-dependent), the
    // quad's geometry (position/size/yaw) is built ONLY from fixture world data + the TM-visibility
    // gate, never from A.camera — an unchanged visible set means an unchanged quad, byte-identical
    // to what is already staged. §R10, CPE_4D_PERF_MEM_FINDINGS.md §7.
    if (keepStaging && (_glowLensMeshRect || _glowLensMeshRound) &&
        _glowVisibleFixtureCount(A._tmIsVisible) === _glowLensStagedCount) {
      console.log('§GLOW_LENS_QUAD skip (count unchanged ' + _glowLensStagedCount + ')');
    } else {
      _glowLensOff();
    }
    // §GLOW_SPRITE_NAV_OFF (2026-08-07): the round sprite no longer restages for nav — live
    // navigation runs on the real point lights only now (see tools.js toggleNightMode). Still
    // torn down unconditionally so it can never survive into navigation.
    _glowOff();
    // §NIGHT_STILL_LIGHTS: hand the navigation budget back, or the still's raised set follows the
    // user into their next orbit and the frame rate goes with it. Compares against the CURRENT nav
    // default (A._nightMaxLightsNav), not a stale literal, so §NIGHT_LIGHT_BUDGET_UP-style tuning
    // never silently breaks this reset.
    if (A._nightMaxLights !== A._nightMaxLightsNav && typeof A._nightUpdateLights === 'function') {
      A._nightMaxLights = A._nightMaxLightsNav;
      A._nightNearFadeFloor = 0.3;
      A._nightPLScale = 1.0;   // §STAGED_PL_CUT — nav Night Mode back to full tuned intensity
      if (A._nightLights && A._nightLights.length) A._nightUpdateLights();
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

  // ══ §PHOTO_GLOW_SPRITE (bim-compiler prompts/NIGHT_AND_FIXTURE_LIGHTING.md §PHOTO_GLOW_SPRITE)
  //    — Witness: W-GLOW-SPRITE. The replacement for §PHOTO_EMBER, not an addition to it.
  //
  // WHY THE MECHANISM CHANGED. §PHOTO_EMBER set `emissive` on the materials the luminaires are drawn
  // with. On Hospital that was 1216 luminaires resolving to SEVEN materials, because batched and
  // instanced meshes share one material across everything they draw — so the emissive lit walls,
  // beams and railings too, and `toneMapped=false` on a material also used by a TRANSPARENT panel
  // rendered that panel pure black. An exclusivity guard cut the collateral but proved the approach
  // is a dead end: the same sharing that causes the damage is what the fixtures are drawn with, so a
  // correct guard starves the fixtures as well. The problem is not the filter, it is the coupling to
  // scene geometry.
  //
  // Sprites are decoupled from the geometry entirely, so material sharing is IRRELEVANT rather than
  // guarded against — this code touches no scene material at all, which is the property the witness
  // asserts (materialsMutated must be 0). One THREE.Points object = one draw call for every fixture
  // in the building, so the 12/48 light-count budget does not apply: those budget per-fragment
  // LIGHTING work on every lit material, and a Points cloud has no lighting term.
  //
  // Positions and colours come from A._nightFixtureWorldPositions() — the same list, the same
  // vocabulary and the same §NIGHT_LIGHT_MIX colour the point light at that fixture uses, so the
  // sprite and the light agree instead of being two independent decisions.
  A._glowSpriteEnabled = true;
  var GLOW_SPRITE_SIZE = 1.1;   // metres, halo diameter (sizeAttenuation) — sized against a 0.6x1.2m troffer
  var GLOW_GAIN        = 3.0;   // linear-space gain on the vertex colour; BloomPass threshold is 1.0,
                                // so a value at or below 1.0 is invisible to bloom and we are back to
                                // "emissive alone moved mean luminance 56.13 -> 56.13".
  // metres toward the eye. NOT a fudge: the DB gives a fixture's CENTRE and the glow leaves its
  // visible FACE, nearer the camera by about half the fitting's thickness. Without it the fitting's
  // own geometry wins the depth test against a sprite sitting inside it.
  //
  // 0.30 rather than 0.15 is MEASURED, from the occlusion-gap histogram over the Clinic
  // (probe_glow_diag.js, 21 poses pooled, gap = sprite distance minus nearest blocker distance):
  //     <=0.05m 115   <=0.1m 19   <=0.2m 25   <=0.3m 29   <=0.5m 26   <=0.8m 72
  //     <=1.5m 380    <=3m 1173   <=6m 1008   <=12m 2331   >12m 3554
  // The small-gap group is fittings hiding their own glow; everything from ~1.5m out is a lamp
  // genuinely behind a WALL, which MUST stay hidden — so this cannot be fixed by pushing the offset
  // arbitrarily far, and 0.30 clears 188 of the ~286 fitting-occluded without reaching into the
  // architecture band.
  //
  // REJECTED, on cost: a per-sprite raycast that finds the fitting's actual face and sits the glow
  // in front of it. It is more precise and it recovers the whole <=0.8m group, but raycasting
  // against BATCHED meshes walks a lot of geometry per ray — measured at roughly 10k rays in
  // single-digit minutes in the headless rig — so 841 fixtures is a tens-of-seconds stall at
  // still-start, and Hospital's 1216 in a 63,182-element building is worse. A constant that costs
  // nothing and recovers most of the group beats a correct one that stalls the fold.
  var GLOW_EYE_OFFSET  = 0.30;
  // §GLOW_EXIT_SOFT (user: "exit signs should have soft appropriate lighting"). An exit sign is a
  // small backlit panel, not a 600x1200 troffer, and giving it the same halo at the same gain reads
  // as a floodlight over every doorway. GAIN 0.9 is deliberately BELOW the bloom threshold of 1.0 —
  // that is what makes it soft: the sign glows but never blooms, while the luminaires at gain 3.0
  // do. SIZE is a multiplier on GLOW_SPRITE_SIZE, so 0.40 x 1.1m = a ~0.44m halo.
  // Counted on the shipped buildings: Clinic 43 signs, Hospital 57, Terminal 38 (E_Light_Keluar).
  var GLOW_EXIT_GAIN   = 0.9;
  var GLOW_EXIT_SIZE   = 0.40;
  var _glowPoints = null, _glowTex = null;
  var _glowStagedCount = -1;   // §GLOW_BUILDUP_GATE — fixture count the CURRENT cloud was built with

  function _glowTexture() {
    if (_glowTex) return _glowTex;
    var S = 64, c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d');
    var rad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rad.addColorStop(0.00, 'rgba(255,255,255,1)');
    rad.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    rad.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = rad; g.fillRect(0, 0, S, S);
    _glowTex = new THREE.CanvasTexture(c);
    // Left in NoColorSpace deliberately: this is an alpha falloff ramp, not a colour — additive
    // blending multiplies it by the vertex colour, and an sRGB decode here would bend the falloff.
    return _glowTex;
  }

  function _glowOn(filterFn) {
    if (!A._glowSpriteEnabled || _glowPoints) return;
    if (typeof A._nightFixtureWorldPositions !== 'function') return;
    if (A._tmOverlayRegister) A._tmOverlayRegister();   // idempotent — ensures window.__tmOverlaySync exists even without a billboard nameplate
    var allPos = A._nightFixtureWorldPositions();
    if (!allPos || !allPos.length) { console.log('§PHOTO_GLOW_SPRITE no luminaires in this building — nothing to light'); return; }
    // §GLOW_BUILDUP_GATE (2026-08-07, user: MaxQ buildup bakes showed every fixture lit from
    // Day 1 — "all the lights are lighted and not following the buildup schedule"). A fixture with
    // no guid (the synthetic per-storey fallback — no real element to gate against) always glows;
    // a real fixture only glows once Time Machine has actually placed it. A._tmIsVisible defaults
    // to true when TM isn't driving the scene at all, so plain Night Mode (no buildup in progress)
    // is completely unchanged.
    var pos = allPos.filter(function(p) { return p.__guid == null || A._tmIsVisible(p.__guid); });
    // §GLOW_LENS_QUAD (this session's own merge) — optional extra filter, e.g. the still stages
    // ONLY the exit-sign subset here (the quad handles everything else). Applied on TOP of the
    // buildup gate above, not instead of it.
    if (filterFn) pos = pos.filter(filterFn);
    _glowStagedCount = pos.length;
    if (!pos.length) {
      console.log('§PHOTO_GLOW_SPRITE_GATE 0/' + allPos.length + ' fixtures placed yet — nothing to light');
      return;
    }
    // Offset toward the eye, computed ONCE: for a still the camera is frozen, so once is exact; in
    // navigation a 0.15m staleness as the camera moves is below the size of the halo it positions.
    var cam = A.camera.position;
    var xyz = new Float32Array(pos.length * 3), col = new Float32Array(pos.length * 3);
    var siz = new Float32Array(pos.length);
    var c = new THREE.Color();
    var exits = 0;
    for (var i = 0; i < pos.length; i++) {
      var p = pos[i];
      // §GLOW_EMIT_DOWN — drop to the EMITTING FACE first, then nudge toward the eye.
      // The nudge alone was the bug the user caught: "M_Troffer Light not lighted... M_Downlight
      // not lighted", while pendants, sconces, surface-mounted and exit signs all lit fine. Those
      // all HANG BELOW the ceiling; troffers, downlights and plain-recessed are RECESSED FLUSH INTO
      // it. A toward-the-eye offset is nearly HORIZONTAL for any fixture more than a few metres
      // down a corridor, so it slid a recessed sprite sideways and left it buried in the slab —
      // correctly depth-culled, invisible, and only for the recessed families. The one direction
      // that escapes a recessed fitting is DOWN, which is also the direction it emits.
      // p.__drop is half the fitting's real bbox height plus clearance (see tools.js).
      var py = p.y - (p.__drop || 0.12);
      var dx = cam.x - p.x, dy = cam.y - py, dz = cam.z - p.z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var k = GLOW_EYE_OFFSET / d;
      xyz[i * 3] = p.x + dx * k; xyz[i * 3 + 1] = py + dy * k; xyz[i * 3 + 2] = p.z + dz * k;
      var gain = GLOW_GAIN;
      siz[i] = 1.0;
      if (p.__exit) { gain = GLOW_EXIT_GAIN; siz[i] = GLOW_EXIT_SIZE; exits++; }   // §GLOW_EXIT_SOFT
      c.setHex(p.__color === undefined ? 0xffe4b5 : p.__color);
      col[i * 3] = c.r * gain; col[i * 3 + 1] = c.g * gain; col[i * 3 + 2] = c.b * gain;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(xyz, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    var mat = new THREE.PointsMaterial({
      size: GLOW_SPRITE_SIZE,
      sizeAttenuation: true,
      map: _glowTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      // depthTest ON: a lamp behind a wall must not shine through it.
      // depthWrite OFF: two overlapping halos must not occlude each other.
      depthTest: true,
      depthWrite: false,
      // Safe HERE and not safe on a scene material — nothing but these sprites is drawn with it.
      // That asymmetry is exactly what blacked out transparent panels under §PHOTO_EMBER.
      toneMapped: false
    });
    // §GLOW_EXIT_SOFT — PointsMaterial.size is a single uniform for the whole cloud, so per-fixture
    // halo size needs the one-line shader patch below rather than a second Points object. Keeping it
    // to ONE object is the point of the mechanism: one draw call for every fixture in the building.
    mat.onBeforeCompile = function(sh) {
      sh.vertexShader = 'attribute float aSize;\n' +
        sh.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    };
    _glowPoints = new THREE.Points(geo, mat);
    // One object spanning the whole building — never cull the CLOUD. (This does not address the
    // per-point limitation: the GPU clips a point sprite by its centre, so a halo whose fixture is
    // just off-screen still pops rather than fading at the frame edge. Stated in the spec; the fix
    // if it ever reads is a billboarded InstancedMesh quad, same positions and colours.)
    _glowPoints.frustumCulled = false;
    _glowPoints.renderOrder = 999;       // after opaque geometry, so additive lands on a finished frame
    _glowPoints.name = '__glowSprites';
    A.scene.add(_glowPoints);
    console.log('§PHOTO_GLOW_SPRITE staged ' + pos.length + '/' + allPos.length + ' sprites (' + (pos.length - exits) +
      ' luminaires gain ' + GLOW_GAIN + ', ' + exits + ' exit signs gain ' + GLOW_EXIT_GAIN +
      ' x' + GLOW_EXIT_SIZE + ' size — §GLOW_EXIT_SOFT, below the bloom threshold on purpose)' +
      ', 1 draw call, 0 scene materials touched' +
      ' (size ' + GLOW_SPRITE_SIZE + 'm, eye-offset ' + GLOW_EYE_OFFSET + 'm' +
      ', bloom threshold ' + (A._bloomPass ? A._bloomPass.threshold : '?') +
      ', strength ' + (A._bloomPass ? A._bloomPass.strength : '?') + ')');
  }

  function _glowOff() {
    if (!_glowPoints) return;
    var n = _glowPoints.geometry.attributes.position ? _glowPoints.geometry.attributes.position.count : 0;
    A.scene.remove(_glowPoints);
    _glowPoints.geometry.dispose();
    _glowPoints.material.dispose();
    console.log('§PHOTO_GLOW_SPRITE removed ' + n + ' sprites');
    _glowPoints = null;
  }
  A._glowSpriteCount = function() {
    return _glowPoints ? _glowPoints.geometry.attributes.position.count : 0;
  };
  // Staged by NIGHT MODE as well as by the still. The point-light budget (12 nav / 48 still) is a
  // per-fragment lighting cost on every lit material every frame; this is ONE additive draw call for
  // the whole building whether it holds 12 fixtures or 1216, so there is no navigation budget for it
  // to blow and no reason to make the user press Alt+S before their luminaires are lit.
  // Bloom stays still-only — it is 7 extra full-screen draws and that DOES have a 60fps cost.
  A._glowStage   = function() { _glowOn(); };
  A._glowUnstage = function() { _glowOff(); };
  // §GLOW_BUILDUP_GATE restage: while sprites are staged during an active TM buildup, the set of
  // placed fixtures grows tick by tick — rebuild the (small, ≤~1200-point) cloud only when that
  // count actually changes, not on every tick. isVisible === null (TM inactive) always matches
  // "everything" and is a no-op restage the first time it's seen after a buildup ends.
  // §R10 (CPE_4D_PERF_MEM_FINDINGS.md §7): shared with the lens quad's own bake-frame skip-gate
  // below — same predicate, one owner, so the two mechanisms can never disagree on "how many
  // fixtures are visible right now."
  function _glowVisibleFixtureCount(isVisible) {
    var allPos = A._nightFixtureWorldPositions ? A._nightFixtureWorldPositions() : [];
    var n = 0;
    for (var _gi = 0; _gi < allPos.length; _gi++) {
      if (allPos[_gi].__guid == null || !isVisible || isVisible(allPos[_gi].__guid)) n++;
    }
    return n;
  }
  if (typeof A._tmVisSubscribe === 'function') {
    A._tmVisSubscribe(function(isVisible) {
      if (!_glowPoints || !A._nightMode) return;
      var n = _glowVisibleFixtureCount(isVisible);
      if (n === _glowStagedCount) return;
      _glowOff();
      _glowOn();
    });
  }

  // ══ §GLOW_LENS_QUAD (NIGHT_AND_FIXTURE_LIGHTING.md §GLOW_LENS_QUAD verdict, 2026-08-07) ══
  // STILL-RENDER ONLY. User directive 2026-08-07: "only for the render, such realism will be a
  // wow. while night fly thru it is OK" — live navigation/night-mode keeps the round
  // §PHOTO_GLOW_SPRITE halo exactly as it is; this function is never called from there.
  //
  // Replaces the round Points sprite (one fixed size, always a circle) with an InstancedMesh of
  // quads, each sized to ITS OWN fixture's bbox_x x bbox_y and yawed by its own rotation_z, sitting
  // at the emitting face — a 0.6x1.2m troffer seen from below reads as a 0.6x1.2m rectangle of
  // light, not a generic dot floating near it. Same position/colour/eye-offset source as the round
  // sprite (A._nightFixtureWorldPositions) so the two mechanisms never disagree.
  //
  // §GLOW_EXIT_SOFT is deliberately NOT ported here — an exit sign is a small backlit panel, not a
  // lit lens, and stays on the round soft-glow treatment even during the still (skipped below).
  //
  // Simplification, stated not hidden: only rotation_z (yaw about vertical) is applied. Fixtures in
  // the five shipped buildings are ceiling/wall-mounted flat panels — rotation_x/y would matter for
  // a tilted spotlight, which none of the current luminaire vocabulary matches.
  // §GLOW_LENS_SOFT_EDGE (2026-08-13, user: "clumsy fitting" on the hard-edged quad, then "can
  // glowTexture but nor overdo like before too bally" — i.e. soften it, but don't regress to the
  // round/ball look the quad specifically replaced). A plain BLURRED RADIAL texture (like the
  // round sprite's own _glowTexture()) would read as a circle again once composited over a
  // rectangle, which is exactly the "bally" look to avoid. This is a feathered RECTANGLE instead:
  // flat/opaque across the centre, fading to transparent only in a thin border margin — keeps the
  // fitted rectangular silhouette (the whole point of §GLOW_LENS_QUAD) while losing the hard edge.
  var _glowLensTex = null;
  function _glowLensTexture() {
    if (_glowLensTex) return _glowLensTex;
    var S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d');
    var inset = S * 0.17;   // feather margin — centre ~66% of each axis stays fully opaque
    g.filter = 'blur(' + Math.round(S * 0.09) + 'px)';
    g.fillStyle = '#ffffff';
    g.fillRect(inset, inset, S - inset * 2, S - inset * 2);
    _glowLensTex = new THREE.CanvasTexture(c);
    return _glowLensTex;
  }
  // §GLOW_LENS_SHAPE_FIT (2026-08-13, user: "can't it detect if it is gap from the light shape?
  // And fit ie round bottom where appeared?"): bbox_x/bbox_y are already extracted, real,
  // per-fixture data (used for sizing above) — their ASPECT RATIO is a real geometric signal, not
  // a guess: an elongated bbox (troffer/strip) reads as rectangular, a near-square bbox is the
  // shape a round downlight's AABB also produces (a true circle's bbox is a square). Below this
  // threshold, use the round soft texture (reusing _glowTexture(), the round sprite's own — no new
  // asset); at/above it, use the feathered-rectangle texture. Can't distinguish a genuinely square
  // FIXTURE from a round one by bbox alone (both bound to a square) — stated limitation, not
  // hidden; no better shape signal is extracted today, and this is still a real, data-driven split
  // rather than a single one-size-fits-all shape.
  var GLOW_LENS_ROUND_ASPECT = 1.25;
  var _glowLensMeshRect = null, _glowLensMeshRound = null;
  var _glowLensStagedCount = -1;   // §R10 — fixture count the CURRENT quads were built with
  function _glowLensOn() {
    if (_glowLensMeshRect || _glowLensMeshRound) return;
    if (typeof A._nightFixtureWorldPositions !== 'function') return;
    var pos = A._nightFixtureWorldPositions();
    if (!pos || !pos.length) return;
    // §GLOW_LENS_BUILDUP_GATE (2026-08-08): _glowOn's round sprite already withholds a fixture's
    // glow until Time Machine has placed it (§GLOW_BUILDUP_GATE above) — this quad path skipped
    // that filter entirely, so an Alt+C buildup bake (which reaches here every frame via
    // startStillRefine) staged every fixture's quad from frame 1, ignoring the 4D schedule. Same
    // predicate, same guid-null passthrough for the synthetic per-storey/tier-3 fallback.
    pos = pos.filter(function(p) { return p.__guid == null || A._tmIsVisible(p.__guid); });
    // §R10 — recorded BEFORE the zero-check, same placement _glowStagedCount uses above, so a
    // teardown-time comparison sees "0 visible" as a real, stable count rather than "unset".
    _glowLensStagedCount = pos.length;
    if (!pos.length) { console.log('§GLOW_LENS_QUAD_GATE 0 fixtures placed yet — nothing to light'); return; }
    var geo = new THREE.PlaneGeometry(1, 1);
    var matRect = new THREE.MeshBasicMaterial({
      color: 0xffffff, map: _glowLensTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthTest: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide
    });
    var matRound = new THREE.MeshBasicMaterial({
      color: 0xffffff, map: _glowTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthTest: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide
    });
    // Worst-case sized (every fixture could land in either bucket) — .count trims to actual use
    // below, same discipline the single-mesh version already used for pos.length vs quads.
    var meshRect = new THREE.InstancedMesh(geo, matRect, pos.length);
    var meshRound = new THREE.InstancedMesh(geo, matRound, pos.length);
    meshRect.frustumCulled = meshRound.frustumCulled = false;
    meshRect.renderOrder = meshRound.renderOrder = 999;
    meshRect.name = '__glowLensQuadsRect'; meshRound.name = '__glowLensQuadsRound';
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qFace = new THREE.Quaternion();
    var pVec = new THREE.Vector3(), sVec = new THREE.Vector3(), col = new THREE.Color();
    // Plane's default normal is +Z; rotate +90 deg about X so it faces -Y (down, toward the floor —
    // matches §GLOW_EMIT_DOWN, the direction the fixture actually emits and the direction __drop nudges).
    qFace.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    // §GLOW_LENS_CLEARANCE_FIX (2026-08-07): the round sprite's old GLOW_EYE_OFFSET (0.3m TOWARD
    // THE CAMERA) is direction-agnostic for a symmetric dot but visibly shifts an ORIENTED
    // rectangle sideways at any angled view (the Hospital hallway misalignment). A small STRAIGHT
    // DOWN clearance (same axis __drop already uses) clears the depth test against the fixture's
    // own geometry without moving X/Z off the real fixture at all, from any angle.
    var GLOW_LENS_CLEARANCE = 0.03;
    var exits = 0, rectN = 0, roundN = 0, skippedTier2 = 0;
    for (var i = 0; i < pos.length; i++) {
      var p = pos[i];
      if (p.__exit) { exits++; continue; }   // §GLOW_EXIT_SOFT stays on the round sprite — see above
      // §NIGHT_TIER_GATE (2026-08-07, user cascade) — the lens quad only draws for a real named
      // fixture (p.__guid set) or the explicitly-sanctioned presentation-only ceiling plant
      // (p.__presentation) — NOT tier 2's "any overhead element in the room" pick, which the user
      // scoped as light-only ("as source of lite", no quad mentioned for that tier).
      if (p.__guid == null && !p.__presentation) { skippedTier2++; continue; }
      var py = p.y - (p.__drop || 0.12) - GLOW_LENS_CLEARANCE;
      pVec.set(p.x, py, p.z);
      // §GLOW_LENS_NO_DOUBLE_YAW (2026-08-07, next session, numeric witness not visual — see
      // NIGHT_AND_FIXTURE_LIGHTING.md §SESSION HANDOFF "second cause" item): bbox_x/bbox_y from
      // element_transforms are the WORLD-frame AABB, rotation_z ALREADY baked in — proven by
      // Terminal_extracted.db's EmergencyLight_EL3 rows, same fixture reporting bbox swapped
      // (0.168x0.419 at rz=+pi/2 vs 0.419x0.168 at rz=pi). The old code treated (bbox_x,bbox_y) as
      // LOCAL dims and yawed them AGAIN by rotation_z — a no-op at rz=0/pi (why upstairs looked
      // fine) but a 90 deg swap of the quad's world footprint at rz=+-pi/2 (why downstairs didn't
      // fit: FitUpstairs.png). No yaw needed — q stays face-down only.
      q.copy(qFace);
      var w = p.__bw || GLOW_SPRITE_SIZE, h = p.__bd || GLOW_SPRITE_SIZE;
      var aspect = Math.max(w, h) / Math.max(0.001, Math.min(w, h));
      var isRound = aspect < GLOW_LENS_ROUND_ASPECT;
      // Round texture is inscribed in a square plane — size it off the LARGER dimension so the
      // lit circle doesn't undershoot the fixture's actual footprint.
      if (isRound) { var d = Math.max(w, h); sVec.set(d, d, 1); } else { sVec.set(w, h, 1); }
      m4.compose(pVec, q, sVec);
      col.setHex(p.__color === undefined ? 0xffe4b5 : p.__color);
      col.multiplyScalar(GLOW_GAIN);
      if (isRound) {
        meshRound.setMatrixAt(roundN, m4); meshRound.setColorAt(roundN, col); roundN++;
      } else {
        meshRect.setMatrixAt(rectN, m4); meshRect.setColorAt(rectN, col); rectN++;
      }
    }
    meshRect.count = rectN; meshRound.count = roundN;
    meshRect.instanceMatrix.needsUpdate = true; meshRound.instanceMatrix.needsUpdate = true;
    if (meshRect.instanceColor) meshRect.instanceColor.needsUpdate = true;
    if (meshRound.instanceColor) meshRound.instanceColor.needsUpdate = true;
    if (rectN) { A.scene.add(meshRect); _glowLensMeshRect = meshRect; }
    if (roundN) { A.scene.add(meshRound); _glowLensMeshRound = meshRound; }
    console.log('§GLOW_LENS_QUAD staged rect=' + rectN + ' round=' + roundN + ' (' + exits +
      ' exit signs left on the round sprite, ' + skippedTier2 +
      ' tier-2 overhead-picks skipped — PL only, no quad), ' + ((rectN ? 1 : 0) + (roundN ? 1 : 0)) +
      ' draw call(s), 0 scene materials touched');
  }
  function _glowLensOff() {
    if (!_glowLensMeshRect && !_glowLensMeshRound) return;
    // Both meshes share ONE PlaneGeometry instance (built fresh each _glowLensOn() call) —
    // dispose it once, off whichever mesh is present, not per-mesh (double-dispose is harmless in
    // three.js but wasteful/misleading to read).
    (_glowLensMeshRect || _glowLensMeshRound).geometry.dispose();
    if (_glowLensMeshRect) {
      A.scene.remove(_glowLensMeshRect);
      _glowLensMeshRect.material.dispose();
      _glowLensMeshRect = null;
    }
    if (_glowLensMeshRound) {
      A.scene.remove(_glowLensMeshRound);
      _glowLensMeshRound.material.dispose();
      _glowLensMeshRound = null;
    }
    console.log('§GLOW_LENS_QUAD removed');
  }

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
    // §PHOTO_EMBER + §PHOTO_BLOOM: both are STILL-ONLY, same discipline as Layer 3's triplanar PBR.
    // Navigation keeps the cheap chain; the frozen still can afford 7 extra full-screen draws.
    // §PHOTO_BLOOM is REQUIRED by §PHOTO_GLOW_SPRITE, not optional decoration on top of it: the
    // sprites are written above 1.0 in linear space precisely so the bloom threshold can find them,
    // and without the pass they are a handful of bright pixels that spread nothing (measured under
    // §PHOTO_EMBER: emissive alone moved mean luminance 56.13 -> 56.13).
    // §BLOOM_DEFAULT_OFF (2026-07-27) — bloom is OFF by default, and that is the revert the user
    // asked for: "black boxes were never there.. remove the impact", i.e. they are NEW, introduced
    // by this work, not a pre-existing fault. It fits exactly — before §PHOTO_GLOW_SPRITE, ember was
    // disarmed, so _bloomPass.enabled was ALWAYS false and this pass never ran in any build the user
    // had seen. Turning it on for Alt+S is the one new thing in the frame, so it goes back off.
    // Set A._bloomOff = false to try it again; §BLOOM_TEMPER's 1.2/0.45 and the depth-test fix in
    // BloomPass.js both remain, so re-arming it starts from a better place than it left.
    // The sprites do NOT need bloom — it only spreads them.
    if (A._bloomOff === undefined) A._bloomOff = true;
    if (A._bloomPass) A._bloomPass.enabled = !A._bloomOff && (!!A._emberEnabled || !!A._glowSpriteEnabled);
    _emberOn();          // §PHOTO_EMBER_DISARMED — no-op unless deliberately re-armed
    // §GLOW_STILL_RESTORED (2026-08-07): live nav stays PL-only (round sprite stopped staging
    // there earlier, §GLOW_SPRITE_NAV_OFF — unchanged). The still gets the lens quad back, fixed
    // (§GLOW_LENS_CLEARANCE_FIX) + the real point lights it was always getting, now frustum-cased
    // instead of a flat 50-cap (§NIGHT_STILL_FRUSTUM in tools.js). Exit signs keep the round
    // soft-glow subset alongside the quad (§GLOW_EXIT_SOFT — a backlit panel is not a lens).
    _glowOff();
    _glowOn(function(p) { return p.__exit; });
    _glowLensOn();
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
        A._nightLights && A._nightLights.length && typeof A._nightUpdateLights === 'function') {
      A._nightMaxLights = A._nightMaxLightsStill;
      A._nightNearFadeFloor = A._nightNearFadeFloorStill;   // §NIGHT_NEAR_FADE — no proximity penalty
      A._nightPLScale = A._nightPLScaleStill || 1;          // §STAGED_PL_CUT — staging-only intensity cut
      A._nightUpdateLights();
      console.log('§NIGHT_STILL_LIGHTS raised to ' + A._nightLights.length +
        ' lights, near-fade floor ' + A._nightNearFadeFloorStill + ' (was 0.3), plScale ' +
        A._nightPLScale + ' (§STAGED_PL_CUT) for the still');
    }
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
      if (_autoStageOn || _photoStagingOn) { _autoStageArm(false); _teardownStillRefine('cancelled (interaction during soft-park)'); }
      return;
    }
    if (!force && _stillRefineStartMs && (performance.now() - _stillRefineStartMs) < STILL_REFINE_GRACE_MS) return;
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
  var CINEMA_ENCLOSED_THRESHOLD = 0.6; // BVH fan fraction that counts as "genuinely enclosed"

  // ══════════ §CPE_PACING — total duration is DERIVED from real geometry, never a fixed number ══
  // User directive 2026-07-27: "the film's total length should not be a fixed constant... if interior
  // speed is held to a constant m/s, and the exterior pull-back is paced by real distance rather than
  // a fixed duration, then total duration falls out naturally from each building's actual size."
  // Confirmed derived (dive, spin and orbit included) when asked.
  //
  // The model this REPLACES was inverted: total was fixed at nFrames/fps and speed was whatever made
  // the derived walk fit CINEMA_OUT_SEC, so the BIGGER the building the FASTER the camera —
  // measured 2.10 m/s on Duplex against 4.99 on LTU_AHouse. Every rate below is a stated constant
  // and every duration is that rate applied to a MEASURED distance or angle, so a building's size
  // now sets its runtime instead of being squeezed into someone else's.
  // §CPE_PACE_LOS base pace (CINEMA_PATH_EDITOR.md). 1.3 was a literal pedestrian and the user called
  // the result too slow twice. MEASURED from their own runs: a 92.5m Hospital edit spent 71.2s of a
  // 99.5s film walking and baked 1015 frames (~26 min of cook at their measured 1.6s/frame). Their
  // stated expectation is ~15s on Duplex against the 26.1s derived, i.e. ~1.8x faster; 1.3 x 1.8 =
  // 2.34. Stated rate with the arithmetic shown, per this block's own rule that every rate is a
  // stated constant applied to a MEASURED distance — not a taste dial.
  // This is the BASE only. The busyness/noise temperament (§CPE_PACE_LOS, still to build) varies the
  // pace AROUND it within the user's PACE_SWING range; it does not replace this number.
  var CINEMA_WALK_MPS     = 2.3;   // interior pace — was 1.3
  var CINEMA_PULLBACK_MPS = 6.5;   // exterior recede: flying, not walking
  var CINEMA_DIVE_MPS     = 20;    // the approach is a fly-IN; dive distances run 20-150m
  // §CPE_DISCIPLINE_REVEAL pull-out beat (restructure 2026-08-14, bim-compiler prompts/
  // CINEMA_DISCIPLINE_REVEAL.md — see that file's dated section for the full spec). Author's own
  // call, documented there, not user-dictated: 1.5s, matching this file's other beat granularities
  // (the tail's own 2s/discipline slot). Distance is DERIVED from the existing CINEMA_PULLBACK_MPS
  // constant (reused, not a new speed invented) — dist = CINEMA_REVEAL_PULLOUT_SEC * CINEMA_PULLBACK_MPS.
  var CINEMA_REVEAL_PULLOUT_SEC = 1.5;
  // §CPE_DISCIPLINE_REVEAL_FADE (2026-08-16, bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md's
  // dated section). A.filterDiscs/A._applyDiscVisibility (panels.js) is a pure boolean visible
  // toggle across plain/Instanced/BatchedMesh — no per-element opacity channel exists in this
  // pipeline (Instanced/BatchedMesh share ONE material per batch, so animating opacity would fade
  // the WHOLE batch, not just the disc entering/leaving). This is the closest honest approximation
  // to a fade with that real constraint: how long the outgoing and incoming discipline stay visible
  // TOGETHER at each tail-parade boundary before narrowing to just the incoming one. Not a literal
  // dissolve — documented as such in A.cpeRevealVisualAt so it's never mistaken for one later.
  var CPE_REVEAL_FADE_SEC = 0.4;
  // §CPE_NOISE_LAW — the user's ONE pacing dial ("have a speed range… don't overdo it"), and the
  // only knob the noise ratio is allowed to have. Declared here, at module scope, because the law
  // governs EVERY beat: the dive's cost table (built with the plan) and the walk's blended cost
  // both read it, and the walk's copy used to be a local declared 400 lines below the dive.
  // §CPE_PACE_SWING_SOFTEN (2026-08-03) — 1.6 was the SETTLED value out of the widen/narrow jerk
  // trade-off documented above (CINEMA_PATH_EDITOR.md "widen PACE_SWING, accept the stall, or accept
  // more jerk"), but on a real Hospital bake it reads as a genuine over-correction: user, direct
  // tuning request, "soften the noise density×depth ratio that slows the camera walk in busy/dense
  // areas — the slowdown is currently too strict." Measured on Hospital before this change (real
  // §CPE_WALK_BUDGET_NOISE_BLIND line): busy=0.432, swing=1.6 -> busyMult=1.2591, outSec=18.322 (a
  // 29.8m walk raw-budgeted at 14.552s stretched to 18.322s by busyness alone).
  //
  // The user suggested trying 1.3-1.4x — measured, NOT taken as-is: at 1.35 and again at 1.4,
  // witness_cpe_even_turn.js's T5 (§CPE_EVEN_TURN's own fast-side jerk cap, `1.5 * PACE_SWING`)
  // goes RED on Duplex — the walk's real cost-parameterized step hits 3.0x its own mean there, and
  // shrinking the cap below that turns a legitimate fast turn into a flagged discontinuity. This is
  // the same "widen or accept jerk" trade-off the constant's own history already names; narrowing it
  // reopens that trade the other direction. 1.45 is the largest reduction from 1.6 that stays clear
  // of T5 on both regression buildings (Duplex, Terminal) — verified by direct measurement, not
  // picked to make a gate green: 1.4 fails T5 on Duplex, 1.45 does not, on repeated runs.
  // (T6, the SLOW-side floor, is RED at 1.6 too — a pre-existing gap this change did not create and
  // does not fix; out of scope here, noted for whoever picks up §CPE_PACE_FLOOR next.)
  // Keeps the SAME mechanism (busy areas still slow the camera, `w = 1-1/PACE_SWING` in
  // §CPE_EVEN_TURN still derives from this one constant, nothing duplicated) while cutting the
  // busyness CORRECTION (busyMult - 1) by 25%: the same Hospital walk recomputes to
  // busyMult=1.1943, outSec=17.380s (was busyMult=1.2591, outSec=18.322s — measured before/after,
  // prompts/CINEMA_PATH_EDITOR.md 2026-08-03).
  var CINEMA_PACE_SWING = 1.45;
  var CINEMA_TURN_DPS     = 45;    // one rate for BOTH in-place turns: the spin and the orbit lap
  var CINEMA_DIVE_MIN_SEC = 2.5;   // a floor, so a tiny building still gets an arrival rather than a cut
  // §CPE_SETTLE_HOLD (2026-08-04, CORRECTED same day — user: "i never asked for that as it is a
  // user setting in hold field.. so no hard coded"): CINEMA_SPIN_MIN_SEC used to floor EVERY settle
  // at ~1s regardless of whether there was anything to turn toward or any hold configured. The
  // first fix replaced that floor with a small technical minimum (CINEMA_MIN_TURN_SEC, 0.05s) "to
  // avoid a literal zero-length beat" — but that is STILL a hardcoded pause the user never asked
  // for. There is nothing to avoid: `_natTotal` below sums dive+spin+out+rise+orbit, and dive
  // (>=CINEMA_DIVE_MIN_SEC), rise (>=0.5s) and orbit (a fixed 8s) are never zero, so a zero-length
  // spin beat cannot produce a zero-length film or a divide-by-zero anywhere downstream. The spin
  // beat is now PURELY derived: the real time to turn through `_spinDeg` at `CINEMA_TURN_DPS`, plus
  // whatever the user actually typed into the Settle band's Hold field — zero of both is zero.
  var CINEMA_SPIN_MIN_SEC = 0.8;   // kept only as a named historical reference in comments/logs
  // Set by the wrapper when the editor supplies explicit beat seconds; then those win over the
  // derived ones. Nothing else may set it.
  var _cpeSecOverride = false;

  // ══ §CINEMA_PATH_EDITOR — authored path state + corner rounding. Spec:
  // prompts/CINEMA_PATH_EDITOR.md §CINEMA_PATH_EDITOR_MODEL (settled with the user 2026-07-26).
  // _cpeWp is the ONE piece of authored state the plan reads. Null = nothing authored = the plan
  // behaves EXACTLY as it did before this feature existed, which is what makes guardrail 2 ("OK
  // without an edit must be byte-identical to today") true by construction rather than by test.
  var _cpeWp = null;
  var CINEMA_CORNER_ARC_SEGS = 8;    // sample points per rounded corner
  var CINEMA_CORNER_LEG_FRAC = 0.4;  // a corner may never eat more than 40% of either adjoining leg
  // Corner rounding, clearance-bounded (§CINEMA_PATH_EDITOR_MODEL items 5-7). Straight runs pass
  // through verbatim; every interior corner is replaced by a quadratic Bézier that leaves the
  // incoming leg `r` before the waypoint and rejoins the outgoing leg `r` after it, with the
  // waypoint itself as the control point. A quadratic Bézier's furthest excursion from its control
  // point is at u=0.5 and equals 0.25·r·|b̂−â| ≤ r/2 — so the flown curve can never stray more than
  // HALF the measured clearance from the point the user placed. That bound is the G8 claim, and it
  // is why `r` may be taken straight from _cinemaFan.min with no safety fudge factor invented on top.
  function _cinemaRoundCorners(wp) {
    if (!wp || wp.length < 3) return (wp || []).slice();
    var out = [{ x: wp[0].x, y: wp[0].y, z: wp[0].z }], rounded = 0, rMin = 1e9, rMax = 0, unmeasured = 0;
    for (var i = 1; i < wp.length - 1; i++) {
      var p0 = wp[i - 1], p1 = wp[i], p2 = wp[i + 1];
      var ax = p1.x - p0.x, ay = p1.y - p0.y, az = p1.z - p0.z;
      var bx = p2.x - p1.x, by = p2.y - p1.y, bz = p2.z - p1.z;
      var aL = Math.hypot(ax, ay, az), bL = Math.hypot(bx, by, bz);
      if (aL < 1e-4 || bL < 1e-4) { out.push({ x: p1.x, y: p1.y, z: p1.z }); continue; }
      // A waypoint the path runs straight through is not a corner — leave it alone rather than
      // spend a BVH fan on it.
      var dot = (ax * bx + ay * by + az * bz) / (aL * bL);
      var turnDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
      if (turnDeg < 3) { out.push({ x: p1.x, y: p1.y, z: p1.z }); continue; }
      // MEASURED clearance at this corner. Fallback is CINEMA_FAN_NUDGE_MAX — an existing constant
      // that already means "how far the camera may slide about inside a room" — not a new number.
      //
      // ⚠ NO-HIT IS NOT A MEASUREMENT (live Hospital log, 2026-07-27). `_cinemaFan` returns
      // CINEMA_FAN_FAR for a ray that hits nothing, so a fan that hits nothing AT ALL reports
      // min=60.0 — which reads as "60 metres of clearance" but actually means "unknown, the BVH saw
      // no geometry here." Taking it at face value let the rounding radius fall through to the
      // 40%-of-leg cap and cut 7.50m inside a point the user had placed by hand, while G8 passed
      // vacuously by comparing that cut against the same fictional 60m. Treat a full no-hit fan as
      // UNKNOWN and fall back to the same conservative nudge budget as an outright fan failure.
      var clear = CINEMA_FAN_NUDGE_MAX, clearSrc = 'no-bvh';
      try {
        var fanC = _cinemaFan({ x: p1.x, y: p1.y, z: p1.z }, 8);
        if (fanC && isFinite(fanC.min)) {
          if (fanC.min >= CINEMA_FAN_FAR - 0.01) { clearSrc = 'unknown(no-hit)'; }
          else { clear = fanC.min; clearSrc = 'measured'; }
        }
      } catch (eC) { /* no BVH yet → the existing nudge budget stands in */ }
      if (clearSrc !== 'measured') unmeasured++;
      var r = Math.min(clear, aL * CINEMA_CORNER_LEG_FRAC, bL * CINEMA_CORNER_LEG_FRAC);
      if (!(r > 0.01)) { out.push({ x: p1.x, y: p1.y, z: p1.z }); continue; }
      rounded++; rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
      var pA = { x: p1.x - ax / aL * r, y: p1.y - ay / aL * r, z: p1.z - az / aL * r };
      var pB = { x: p1.x + bx / bL * r, y: p1.y + by / bL * r, z: p1.z + bz / bL * r };
      out.push(pA);
      for (var s = 1; s < CINEMA_CORNER_ARC_SEGS; s++) {
        var u = s / CINEMA_CORNER_ARC_SEGS, iu = 1 - u;
        out.push({ x: iu * iu * pA.x + 2 * iu * u * p1.x + u * u * pB.x,
                   y: iu * iu * pA.y + 2 * iu * u * p1.y + u * u * pB.y,
                   z: iu * iu * pA.z + 2 * iu * u * p1.z + u * u * pB.z });
      }
      out.push(pB);
    }
    var last = wp[wp.length - 1];
    out.push({ x: last.x, y: last.y, z: last.z });
    // Throttled: a live drag re-plans on every pointermove, and an unthrottled line here flooded a
    // real user's console with dozens of identical rows per second (observed Hospital, 2026-07-27).
    // Log only when the shape actually changes, plus at most once a second.
    var sig = wp.length + '|' + out.length + '|' + rounded + '|' + rMax.toFixed(2) + '|' + unmeasured;
    var nowMs = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (sig !== _cornersLastSig || nowMs - _cornersLastMs > 1000) {
      _cornersLastSig = sig; _cornersLastMs = nowMs;
      console.log('§CINEMA_CORNERS control=' + wp.length + ' flown=' + out.length + ' rounded=' + rounded +
        ' rMin=' + (rounded ? rMin.toFixed(2) : 'n/a') + ' rMax=' + (rounded ? rMax.toFixed(2) : 'n/a') +
        ' maxDeviation=' + (rounded ? (rMax / 2).toFixed(2) : '0.00') + 'm' +
        ' unmeasuredCorners=' + unmeasured + '/' + rounded +
        (unmeasured ? ' (fan saw no geometry — radius capped at the ' + CINEMA_FAN_NUDGE_MAX + 'm nudge budget, NOT treated as ' + CINEMA_FAN_FAR + 'm of space)' : ' (bound=measured clearance/2)'));
    }
    return out;
  }
  var _cornersLastSig = '', _cornersLastMs = 0;
  A.cinemaRoundCorners = _cinemaRoundCorners;   // witness G7/G8 read this directly

  // ══════════ §CPE_BANDS — rigid straight bands + tangent-matched connectors ══════════
  // Spec: prompts/CINEMA_PATH_EDITOR.md §CPE_BANDS (settled with the user 2026-07-27).
  //
  // A band is a SHORT STRAIGHT segment: {c:{x,y,z} centre, d:{x,y,z} unit direction, len}. User's
  // words: "the bands are short straight parts of the path. When they are moved their length and
  // straightness does not morph." So the band is rigid — dragging an end ROTATES it about the far
  // end, dragging the middle TRANSLATES it, and nothing ever bends or resizes it.
  //
  // WHY bands rather than points: a point carries position only. A band's two ends are a TANGENT,
  // and tangents are what actually shape a curve — "by manipulating that, u can have creative
  // curves". Three bands = six waypoints, but stored and edited as three (user: "in a way the 3
  // bands are actually 6 waypoints... but efficiently folded into 3").
  var _cpeBands = null;
  // §CPE_REPLAN_LAZY (CINEMA_DELIGHT_BATCH.md:40-66 spec; CPE_4D_PERF_MEM_FINDINGS.md §3-R3 —
  // Witness: witness_cpe_replan_lazy.js): the plan prefix (§CINEMA_SPACE candidate scan +
  // §CINEMA_DIVE settle + §CINEMA_EXIT door scoring/route) depends only on the MODEL and the
  // camera basis — §CPE_PREVIEW_DIVERGENCE pins the basis at editor open, so during an editing
  // session the prefix recomputed byte-identically on every band drag (~550ms of the measured
  // 600-1000ms §CPE_REPLAN_SLOW, 8 consecutive drags byte-identical on Terminal). Cache it keyed
  // on (building, _metaGen, camPos, yaw0, pitch0); a key change or A.cinemaPrefixInvalidate()
  // (the "re-derive entry" control) recomputes. The cached §CINEMA_DIVE/§CINEMA_EXIT lines are
  // replayed VERBATIM on a hit — witness_cpe_preview_divergence.js parses them for equality, and
  // equality is exactly what the cache guarantees.
  var _cinemaPrefixCache = null;
  // §CPE_HOSE (spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_HOSE, user 2026-07-28: "what if
  // we make the whole path editable... just dragging a point where the whole path is like a long
  // rubber hose, reacting only by proximity to the point been dragged, and the rest just curves
  // along"). A list of drag OPERATIONS layered on the derived path — never a stored polyline. See
  // _cinemaHoseApply for the arc-length law and §CPE_BANDS rule 6 for why operations, not points.
  var _cpeHose = null;
  // §CPE_DISCIPLINE_REVEAL (bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md, Mechanism C) — whether
  // this bake inserts the retrace reveal round between the walk and the closing orbit. Same wrapper
  // pattern as _cpeHose/_cpeBands above: set from ov.reveal in A.cinemaPathPlan, read inside
  // _cinemaPathPlan's own closure, saved/restored around the call so it never leaks between plans.
  var _cpeReveal = false;
  // §CPE_CONE_ORIENT_ADJUST (bim-compiler prompts/CINEMA_PATH_EDITOR.md, 2026-08-27) — a small list of
  // ANCHORED gaze corrections, independent of bands: each is {pos:{x,y,z}, dir:{x,y,z}, ramp, hold,
  // decay} (world anchor, corrected unit direction, arc-length meters for the ease-in/hold/ease-out
  // envelope). Not band-indexed like `lookAt` — the cone's position is scrub-driven and may sit
  // anywhere along the walk, not necessarily at a band — so this rides its OWN small array on the
  // override, same wrapper pattern as _cpeHose/_cpeBands/_cpeReveal above: set from ov.aimCorrections
  // in A.cinemaPathPlan, read inside _cinemaPathPlan's own closure, saved/restored around the call.
  var _cpeCorrections = null;
  // §CPE_DISCIPLINE_REVEAL — real, measured element counts, same 3-representation enumeration
  // A.filterDiscs already uses (panels.js §NAV_FIND_002) — never an invented discipline list.
  // Outer-scope and A.-exposed (not nested inside _cinemaPathPlan) so BOTH the plan builder here AND
  // cinema_path_editor.js's own _naturalDuration() (the client-side seconds estimate that drives the
  // bake's frame count) read the exact same list — one implementation, not two kept in sync by hand.
  A.cpeRevealDiscsPresent = function() {
    var counts = {};
    function bump(d) { if (d && d !== 'ARC' && d !== 'STR') counts[d] = (counts[d] || 0) + 1; }
    if (typeof A.collectMeshes === 'function') {
      A.collectMeshes(function(o) { return o.isMesh && o.userData && o.userData.disc; })
        .forEach(function(o) { bump(o.userData.disc); });
    }
    var _bmId, _imId;
    for (_bmId in (A._batchMeta || {})) A._batchMeta[_bmId].forEach(function(m) { bump(m.disc); });
    for (_imId in (A._instanceMeta || {})) A._instanceMeta[_imId].forEach(function(m) { bump(m.disc); });
    var discs = Object.keys(counts);
    // §CPE_DISCIPLINE_REVEAL_ORDER (2026-08-16, bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md's
    // dated section). Sort ascending by real average element bbox volume (element_transforms.bbox_x/
    // y/z, guid-joined to elements_meta — the ONLY per-element size data this schema carries;
    // elements_meta itself has no dimension column, confirmed by a read-only extraction check before
    // this was written, not assumed). Finest-grained (smallest average element) disciplines reveal
    // FIRST, while the viewer's attention is freshest. The literal 'MEP' discipline code is forced to
    // the LAST position regardless of its measured size — user's own framing 2026-08-16: MEP reads as
    // "most easily sighted" (large ducts/pipes/cable-trays are obvious even glimpsed briefly), so it
    // doesn't need the early slot the way small/fine disciplines do. Degrades to the original
    // unordered list if A.dbQuery is unavailable or the query fails — DEGRADE, DON'T DISABLE, same
    // rule A.cpeRevealDiscQtyCost (below) already follows.
    if (discs.length > 1 && typeof A.dbQuery === 'function') {
      try {
        var inList = discs.map(function(d) { return "'" + d.replace(/'/g, "''") + "'"; }).join(',');
        var rows = A.dbQuery('SELECT m.discipline, AVG(t.bbox_x * t.bbox_y * t.bbox_z) FROM elements_meta m ' +
          'JOIN element_transforms t ON m.guid = t.guid WHERE m.discipline IN (' + inList + ') ' +
          'AND t.bbox_x IS NOT NULL AND t.bbox_x > 0 GROUP BY m.discipline');
        var avgVol = {};
        (rows || []).forEach(function(r) { avgVol[r[0]] = +r[1]; });
        discs.sort(function(a, b) {
          if (a === 'MEP' && b !== 'MEP') return 1;
          if (b === 'MEP' && a !== 'MEP') return -1;
          var va = avgVol[a], vb = avgVol[b];
          if (va == null && vb == null) return 0;
          if (va == null) return 1;   // no size data for this discipline -> push to end, never invent a rank
          if (vb == null) return -1;
          return va - vb;
        });
        console.log('§CPE_REVEAL_DISC_ORDER [' + discs.map(function(d) {
          return d + '=' + (avgVol[d] != null ? avgVol[d].toFixed(3) : 'n/a'); }).join(',') + ']');
      } catch (e) {
        console.warn('§CPE_REVEAL_DISC_ORDER query failed, using unordered fallback: ' + e.message);
      }
    }
    return discs;
  };
  // §CPE_DISCIPLINE_REVEAL_PULLOUT (restructure 2026-08-14, bim-compiler prompts/
  // CINEMA_DISCIPLINE_REVEAL.md's dated section — supersedes the there-and-back Mechanism C shape).
  // pure function of (plan, tNorm): which visual phase, if any, this instant falls in. Called
  // identically from the bake loop (cinema_maxq.js) and the preview loop (cinema_path_editor.js's
  // _previewFly) so the two can never diverge — same "one poseAt, no state leakage either direction"
  // property this file already relies on elsewhere (§CPE_AIM_SIMPLIFY).
  // Four zones inside [b.out, b.rise]:
  //   pull-out  (b.out .. b.pullout)  — plain, no override (author's call, see spec file: a short
  //                                     transition beat, not part of either "round").
  //   round 2   (b.pullout .. b.reveal) — 'ghost': ARC/STR fully hidden, every non-ARC/STR discipline
  //                                     shown together — UNCHANGED from the original ghost phase.
  //                                     §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16): this span now
  //                                     covers BOTH the fly-back sub-beat (camera retracing the path
  //                                     back to the first stick) AND the forward lap after it — the
  //                                     boundary here is unchanged (still b.pullout..b.reveal), only
  //                                     poseAt's camera motion inside it gained a sub-beat, so no
  //                                     edit was needed in THIS function for that change.
  //   rise/tail (b.reveal .. b.rise, first rv.tailSec seconds) — 'tail-one'/'tail-all': the disc
  //             parade, folded into the EXISTING rise beat's own time budget (see poseAt below —
  //             the camera motion there is the unmodified _beat4Pose, never a new motion).
  //   rise proper (remainder of b.reveal..b.rise) — null: ARC/STR solid again, normal room titles.
  A.cpeRevealVisualAt = function(plan, tNorm) {
    var b = plan && plan.beats, rv = plan && plan.reveal;
    if (!b || !rv || !rv.discs || !rv.discs.length || !(b.reveal > b.out)) return null;
    if (tNorm <= b.out) return null;
    var tP = (b.pullout != null && b.pullout > b.out) ? b.pullout : b.out;
    if (tNorm <= tP) return null;                              // pull-out: plain, no ghost
    if (tNorm <= b.reveal) return { phase: 'ghost', discs: rv.discs.slice() };  // round 2
    if (!(b.rise > b.reveal)) return null;
    var riseSpanSec = (rv.riseSec || 0) + (rv.tailSec || 0);
    if (!(riseSpanSec > 0)) return null;
    var wSec = (tNorm - b.reveal) / (b.rise - b.reveal) * riseSpanSec;
    if (wSec >= rv.tailSec) return null;                        // rise proper: ARC/STR solid again
    var perDisc = 2, n = rv.discs.length;
    var idx = Math.floor(wSec / perDisc);
    if (idx >= n) return { phase: 'tail-all', discs: rv.discs.slice() };
    // §CPE_DISCIPLINE_REVEAL_FADE (2026-08-16): `discs` (caption/key identity) always names the
    // CURRENT slot's own discipline — the caption must never show the outgoing one. `visDiscs` (what
    // A.cpeRevealApplyVisual actually shows) widens to include the PREVIOUS slot's discipline for the
    // first CPE_REVEAL_FADE_SEC of a new slot (idx===0 has no previous slot to overlap with), so the
    // hard swap softens into a brief overlap instead of an instant cut.
    var slotFrac = wSec - idx * perDisc;
    var visDiscs = (slotFrac < CPE_REVEAL_FADE_SEC && idx > 0)
      ? [rv.discs[idx - 1], rv.discs[idx]] : [rv.discs[idx]];
    return { phase: 'tail-one', discs: [rv.discs[idx]], visDiscs: visDiscs };
  };
  // §CPE_DISCIPLINE_REVEAL — a discipline code's human-readable label, reused (not invented) from
  // A.PHASE_MAP (config.js), which already carries friendly names for the common trades
  // ('3-Electrical', '3-Fire Protection', ...) keyed by the SAME discipline codes A.DISC_COLORS/
  // cpeRevealDiscsPresent use. Strips the leading "N-" sort prefix. A discipline PHASE_MAP has no
  // entry for (SAN/VENT/HEAT/VOID are real DISC_COLORS codes with none) degrades to the raw code,
  // never a fabricated label.
  A.cpeRevealDiscLabel = function(d) {
    var p = A.PHASE_MAP && A.PHASE_MAP[d];
    return (p && p.phase) ? p.phase.replace(/^\d+-/, '') : d;
  };
  // §CPE_DISCIPLINE_REVEAL — "good touch" nice-to-have (spec file, 2026-08-14 restructure): a
  // discipline's live element COUNT, and a ROUGH cost estimate reusing A.MATERIAL_COSTS' EXISTING
  // per-ifc_class rates as-is (no new rate invented). This is COUNT × rate per class, summed — NOT
  // the unit-aware linear/area BOQ calculation boq_charts.html already does (bbox-derived length/
  // area quantities via qto_cache) — that is real, more accurate, separate work, named as a
  // follow-on in the spec file rather than reproduced here. Queried once per plan build (cheap:
  // rarely more than a dozen disciplines) via the SAME A.dbQuery elements_meta pattern
  // cpe_room_title.js's _storeyLadderForGroups already uses, cached on plan.reveal so the tail's
  // per-frame caption draw never re-queries the DB.
  A.cpeRevealDiscQtyCost = function(discs) {
    var out = {};
    if (!discs || !discs.length || typeof A.dbQuery !== 'function') return out;
    discs.forEach(function(d) { out[d] = { count: 0, cost: 0 }; });
    try {
      var inList = discs.map(function(d) { return "'" + d.replace(/'/g, "''") + "'"; }).join(',');
      var rows = A.dbQuery('SELECT discipline, ifc_class, COUNT(*) FROM elements_meta ' +
        'WHERE discipline IN (' + inList + ') GROUP BY discipline, ifc_class');
      (rows || []).forEach(function(r) {
        var d = r[0], cls = r[1], n = +r[2];
        if (!out[d]) return;
        out[d].count += n;
        var mc = A.MATERIAL_COSTS[cls];
        if (mc) out[d].cost += n * mc.rate;   // rough: per-element rate, not the unit-aware qty BOQ uses
      });
    } catch (e) { console.warn('§CPE_REVEAL_DISC_QTY_COST query failed: ' + e.message); }
    return out;
  };
  // §CPE_DISCIPLINE_REVEAL — pure function of (plan, tNorm): the caption that REPLACES the room
  // title during the tail's disc-parade slots ('tail-one'/'tail-all'). Returns null everywhere else
  // (round 1, pull-out, round 2, rise proper) so the caller falls through to the NORMAL room-title
  // lookup — room titles are untouched outside the tail, per the spec's item 3. Called identically
  // from the bake (cinema_maxq.js) and the preview tick (cpe_room_title.js's roomTitleLiveTick), same
  // "one pure function, two callers" discipline as cpeRevealVisualAt/cpeRevealApplyVisual above.
  A.cpeRevealCaptionAt = function(plan, tNorm) {
    var vis = A.cpeRevealVisualAt ? A.cpeRevealVisualAt(plan, tNorm) : null;
    if (!vis || (vis.phase !== 'tail-one' && vis.phase !== 'tail-all')) return null;
    var rv = plan.reveal, qc = rv && rv.qtyCost;
    var name;
    if (vis.phase === 'tail-all') {
      name = 'All Disciplines';
    } else {
      var d = vis.discs[0];
      name = A.cpeRevealDiscLabel(d);
      var q = qc && qc[d];
      if (q && q.count) {
        name += ' — ' + q.count + ' element' + (q.count === 1 ? '' : 's');
        if (q.cost > 0) name += ', ~' + Math.round(q.cost).toLocaleString();
      }
    }
    return { name: name, opacity: 1 };
  };
  // Applies the state above to the live scene via A.filterDiscs (panels.js §NAV_FIND_002) — reused
  // as-is, not forked. Snapshots whatever discipline filter the user already had active (Role filter,
  // Find isolate, ...) on first entering the round, and restores EXACTLY that on exit — never a blind
  // "show everything" that would clobber an unrelated filter the user had running before the bake/
  // preview started. Skips the (scene-traversing) _applyDiscVisibility call entirely when nothing
  // actually changed since the last tick — cheap to call every frame.
  A._cpeRevealSavedHidden = null;
  A._cpeRevealVisualKey = null;
  A.cpeRevealApplyVisual = function(plan, tNorm) {
    if (typeof A.filterDiscs !== 'function' || !A.hiddenDiscs) return;
    var st = plan ? A.cpeRevealVisualAt(plan, tNorm) : null;
    // §CPE_DISCIPLINE_REVEAL_FADE: key on visDiscs (what's actually SHOWN), not discs (the caption
    // identity) — within a single tail-one slot, discs[0] never changes but visDiscs does (drops the
    // overlap partner after CPE_REVEAL_FADE_SEC), and that drop must still re-trigger filterDiscs.
    var shown = (st && st.visDiscs) || (st && st.discs);
    var key = st ? (st.phase + ':' + shown.join(',')) : '';
    if (A._cpeRevealVisualKey === key) return;
    if (!st) {
      if (A._cpeRevealSavedHidden) {
        A.hiddenDiscs.clear();
        A._cpeRevealSavedHidden.forEach(function(d) { A.hiddenDiscs.add(d); });
        if (A._applyDiscVisibility) A._applyDiscVisibility();
        A._cpeRevealSavedHidden = null;
      }
    } else {
      if (!A._cpeRevealSavedHidden) A._cpeRevealSavedHidden = new Set(A.hiddenDiscs);
      A.filterDiscs(shown);
    }
    A._cpeRevealVisualKey = key;
  };
  function _cpeBandEnds(b) {
    var h = b.len / 2;
    return [{ x: b.c.x - b.d.x * h, y: b.c.y - b.d.y * h, z: b.c.z - b.d.z * h },
            { x: b.c.x + b.d.x * h, y: b.c.y + b.d.y * h, z: b.c.z + b.d.z * h }];
  }
  // The 6 waypoints the film actually flies through — expanded at plan time, flown, discarded.
  // These are also what the LOS aim rule reads: inside a band "aim at the next waypoint" means aim
  // ALONG the band; at a band's far end it means aim into the next band. Both fall out for free.
  function _cinemaBandWaypoints(bands) {
    var wp = [];
    for (var i = 0; i < bands.length; i++) {
      var e = _cpeBandEnds(bands[i]);
      wp.push(e[0], e[1]);
    }
    return wp;
  }
  A.cinemaBandWaypoints = _cinemaBandWaypoints;

  var CINEMA_CONNECTOR_SEGS = 40;   // samples per connector curve — see G-note below
  var CINEMA_CONNECTOR_K = 0.55;    // Hermite tangent length as a fraction of the connector's span
  // The flown polyline. Bands pass through VERBATIM (rule 2 — never rounded, that would be the
  // morphing the user ruled out). Between two bands runs a cubic Hermite whose end tangents ARE the
  // band directions, so the curve leaves a band along its own direction and arrives at the next
  // along that one's — no kink at the join, which is the entire point ("must adjust so as not to
  // have abrupt breaks").
  // The tangent length scales with the connector's OWN span, so a 5m gap and a 60m gap both read as
  // one continuous curve rather than a tight kink at one end and a lazy arc at the other ("user can
  // drag it to a far end, the path has to bounce back").
  // The bow is then capped by MEASURED clearance, with the same no-hit-is-unknown rule §CPE_LIVE
  // established — a fan that hits nothing reports CINEMA_FAN_FAR, which is not a measurement.
  function _cinemaBandFlow(bands) {
    var out = [], i, s;
    if (!bands || !bands.length) return out;
    var stats = { conn: 0, kMin: 1e9, kMax: 0, bowMax: 0, unmeasured: 0 };
    for (i = 0; i < bands.length; i++) {
      var e = _cpeBandEnds(bands[i]);
      out.push({ x: e[0].x, y: e[0].y, z: e[0].z });
      if (i === bands.length - 1) { out.push({ x: e[1].x, y: e[1].y, z: e[1].z }); break; }
      var nxt = _cpeBandEnds(bands[i + 1]);
      var P0 = e[1], P1 = nxt[0], d0 = bands[i].d, d1 = bands[i + 1].d;
      var span = Math.hypot(P1.x - P0.x, P1.y - P0.y, P1.z - P0.z);
      out.push({ x: P0.x, y: P0.y, z: P0.z });
      if (span < 1e-4) continue;
      // Clearance cap at the join, measured — same source and same unknown-handling as §CPE_LIVE.
      var clear = CINEMA_FAN_NUDGE_MAX, measured = false;
      try {
        var f = _cinemaFan({ x: (P0.x + P1.x) / 2, y: (P0.y + P1.y) / 2, z: (P0.z + P1.z) / 2 }, 8);
        if (f && isFinite(f.min) && f.min < CINEMA_FAN_FAR - 0.01) { clear = f.min; measured = true; }
      } catch (eF) { /* no BVH → conservative budget */ }
      if (!measured) stats.unmeasured++;
      var k = CINEMA_CONNECTOR_K;
      // Shrink k until the curve's furthest excursion from the straight chord fits the clearance.
      // Measured by sampling rather than by a closed form, so the gate can assert the same number.
      var pts, bow;
      for (var attempt = 0; attempt < 8; attempt++) {
        pts = []; bow = 0;
        var m = span * k;
        for (s = 1; s < CINEMA_CONNECTOR_SEGS; s++) {
          var t = s / CINEMA_CONNECTOR_SEGS, t2 = t * t, t3 = t2 * t;
          var h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
          var q = { x: h00 * P0.x + h10 * d0.x * m + h01 * P1.x + h11 * d1.x * m,
                    y: h00 * P0.y + h10 * d0.y * m + h01 * P1.y + h11 * d1.y * m,
                    z: h00 * P0.z + h10 * d0.z * m + h01 * P1.z + h11 * d1.z * m };
          pts.push(q);
          // distance from q to the P0→P1 chord
          var vx = P1.x - P0.x, vy = P1.y - P0.y, vz = P1.z - P0.z;
          var wx = q.x - P0.x, wy = q.y - P0.y, wz = q.z - P0.z;
          var tt = Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / (span * span)));
          bow = Math.max(bow, Math.hypot(wx - vx * tt, wy - vy * tt, wz - vz * tt));
        }
        if (bow <= clear || k < 0.06) break;
        k *= 0.7;
      }
      for (s = 0; s < pts.length; s++) out.push(pts[s]);
      stats.conn++; stats.kMin = Math.min(stats.kMin, k); stats.kMax = Math.max(stats.kMax, k);
      stats.bowMax = Math.max(stats.bowMax, bow);
    }
    var sig = bands.length + '|' + stats.conn + '|' + stats.bowMax.toFixed(2) + '|' + stats.unmeasured;
    var nowB = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (sig !== _bandsLastSig || nowB - _bandsLastMs > 1000) {
      _bandsLastSig = sig; _bandsLastMs = nowB;
      console.log('§CINEMA_BANDS bands=' + bands.length + ' waypoints=' + (bands.length * 2) +
        ' flown=' + out.length + ' connectors=' + stats.conn +
        ' k=[' + (stats.conn ? stats.kMin.toFixed(2) + ',' + stats.kMax.toFixed(2) : 'n/a') + ']' +
        ' maxBow=' + stats.bowMax.toFixed(2) + 'm unmeasuredJoins=' + stats.unmeasured + '/' + stats.conn);
    }
    return out;
  }
  var _bandsLastSig = '', _bandsLastMs = 0;
  A.cinemaBandFlow = _cinemaBandFlow;   // witnesses read this directly

  // ══ §CPE_HOSE — the whole path as a rubber hose ═══════════════════════════════════════════════
  // Each op is { s, r, d }: `s` = WHERE along the path it was grabbed, as a fraction of the path's
  // own arc length; `r` = the reach, in the SAME arc-length fraction; `d` = the world displacement
  // the gesture asked for at the grab point.
  //
  // ⚠ THE LAW (spec §CPE_HOSE.2, non-negotiable): the falloff is measured in ARC LENGTH ALONG THE
  // PATH, never in world distance. A world-space radius deforms an out-and-back path's RETURN leg —
  // two metres away in space, half a film away in time. That is the exact class of bug that got
  // §CPE_DRAG_REACH removed in #1038 ("G-DRAG-3 measured it BREAKING out-and-back"), and a
  // world-distance hose walks it straight back in. W-HOSE-ARC is the gate.
  //
  // Falloff shape: (1-u²)² — the smooth bump. Zero displacement AND zero slope at u=1, so a hosed
  // stretch rejoins the underived path with no kink at either end; and zero slope at u=0, so the
  // grabbed point is a smooth crest rather than a pulled tent-pole. Spec open question 1 said to
  // pick this by trying rather than by argument; this is the default, and it is one line to change.
  //
  // Superposition is deliberate: overlapping ops ADD. Ten small pulls in one region compose into one
  // larger, still-smooth deformation, which is how a hose behaves when you keep working it.
  function _cinemaHoseApply(pts, ops) {
    if (!pts || pts.length < 2 || !ops || !ops.length) return pts;
    var i, k, cum = [0], L = 0;
    for (i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
      cum.push(L);
    }
    if (L <= 1e-6) return pts;
    var out = new Array(pts.length), maxDisp = 0, touched = 0;
    for (i = 0; i < pts.length; i++) {
      var s = cum[i] / L, dx = 0, dy = 0, dz = 0;
      for (k = 0; k < ops.length; k++) {
        var op = ops[k], r = op && op.r;
        if (!op || !op.d || !(r > 1e-9)) continue;
        var u = Math.abs(s - op.s) / r;
        if (u >= 1) continue;
        var g = 1 - u * u; g = g * g;
        dx += op.d.x * g; dy += op.d.y * g; dz += op.d.z * g;
      }
      var m = Math.hypot(dx, dy, dz);
      if (m > 1e-6) { touched++; if (m > maxDisp) maxDisp = m; }
      out[i] = { x: pts[i].x + dx, y: pts[i].y + dy, z: pts[i].z + dz };
    }
    var sigH = ops.length + '|' + maxDisp.toFixed(2) + '|' + touched + '/' + pts.length;
    var nowH = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (sigH !== _hoseLastSig || nowH - _hoseLastMs > 1000) {
      _hoseLastSig = sigH; _hoseLastMs = nowH;
      console.log('§CPE_HOSE ops=' + ops.length + ' pathLen=' + L.toFixed(1) + 'm points=' + pts.length +
        ' deformed=' + touched + ' maxDisp=' + maxDisp.toFixed(2) + 'm' +
        ' falloff=arc-length (NEVER world distance — see #1038 out-and-back)');
    }
    return out;
  }
  var _hoseLastSig = '', _hoseLastMs = 0;
  A.cinemaHoseApply = _cinemaHoseApply;   // W-HOSE-ARC reads this directly

  // §CPE_HOSE_REANCHOR — keep a pull where it was PUT when the curve underneath it changes.
  // An op's `s` is a fraction of the walk's arc length; adding or moving a band changes both the
  // length and the shape of that walk, so the same fraction lands somewhere else and the bulge
  // slides along the path on its own (observed live: the same two ops reporting deformed=57 → 65 →
  // 72 across successive band edits, untouched). Each op therefore also carries `a`, the WORLD point
  // it was authored at on the raw curve; re-projecting that onto the new curve is what makes the
  // edit stable. Returns how many moved, so the caller logs a number instead of guessing.
  // Lives here, beside the apply, so the witness exercises the shipped function.
  function _cinemaHoseReanchor(ops, pts, fracs, skip) {
    if (!ops || !ops.length || !pts || pts.length < 2) return 0;
    var moved = 0;
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      if (!op || op === skip) continue;
      var idx0 = Math.max(0, Math.min(pts.length - 1, Math.round(op.s * (pts.length - 1))));
      if (!op.a) { op.a = { x: pts[idx0].x, y: pts[idx0].y, z: pts[idx0].z }; continue; }
      var best = 0, bd = Infinity;
      for (var i = 0; i < pts.length; i++) {
        var dx = pts[i].x - op.a.x, dy = pts[i].y - op.a.y, dz = pts[i].z - op.a.z;
        var d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      var ns = fracs[best];
      if (Math.abs(ns - op.s) > 1e-4) { moved++; op.s = ns; }
    }
    return moved;
  }
  A.cinemaHoseReanchor = _cinemaHoseReanchor;

  // Seed three bands from a derived plan's three waypoints. Direction at each anchor is the local
  // path tangent (Catmull-Rom style: previous→next), so the seeded bands already lie along the route
  // and the very first render is a no-op-looking curve rather than a scrambled one.
  // Length was 5% of the interior walk ("a stretch say about 5% of the inside") with a 1m floor.
  // It is NOT draggable — rule 4, length is a typed field.
  //
  // §CPE_BAND_REACH (user, 2026-07-27: "make that 'stick' longer as it is hard to grab the right
  // end", and "the stick band should curve along more.. now it is short, if twisted its curve still
  // short.. having more make it more useful to craft"). TWO changes, because the difficulty has two
  // separate causes and the obvious one is not the binding one:
  //
  //  1. The fraction doubles, 5% -> 10%. That is the "curve along more" half — a longer band sweeps
  //     a longer arc when twisted, which is what makes it useful to craft with.
  //
  //  2. A SCREEN-SPACE floor, which is the half that actually fixes "hard to grab the right end".
  //     A band's world length says nothing about how grabbable it is: the view plane sits at the
  //     handle's camera distance, MEASURED at 0.453 m/px on Hospital (0.151 Duplex, 0.227 Terminal),
  //     so a 1.5m band spans ~3 PIXELS there and its three 0.30m handles are individually
  //     SUB-PIXEL. No world-space length chosen for one building can fix that for another — the
  //     seed has to measure the camera. 88px is the span at which the two END handles are one
  //     standard 44px touch target apart, so end-vs-mid is separable by pointer or by finger;
  //     96 for margin. Falls back to the world rule if the camera is not readable.
  var CINEMA_BAND_FRAC = 0.10, CINEMA_BAND_MIN_M = 1.0, CINEMA_BAND_MIN_PX = 96;
  function _cinemaSeedBands(wp, pathLen) {
    if (!wp || wp.length < 2) return null;
    var len = Math.max(CINEMA_BAND_MIN_M, (pathLen || 0) * CINEMA_BAND_FRAC), bands = [];
    // Screen-space floor: metres per pixel in the view plane at the band's own distance is
    // 2·d·tan(fov/2)/viewportHeight — the same geometry the drag itself uses.
    try {
      var _cam = A.camera, _el = A.renderer && A.renderer.domElement;
      if (_cam && _cam.isPerspectiveCamera && _el && _el.clientHeight > 0) {
        var _mid = wp[Math.floor(wp.length / 2)];
        var _d = Math.hypot(_mid.x - _cam.position.x, _mid.y - _cam.position.y, _mid.z - _cam.position.z);
        var _mPerPx = 2 * _d * Math.tan(_cam.fov * Math.PI / 360) / _el.clientHeight;
        var _screenMin = _mPerPx * CINEMA_BAND_MIN_PX;
        // Hard cap as a fraction of the walk. Unclamped, the screen floor is absurd on a big
        // building viewed from far out: MEASURED 43.49m of band on Hospital's 29.8m walk — a stick
        // longer than the path it edits. Beyond this the honest answer is not a bigger stick, it
        // is to zoom in, which §CPE_SCREEN_PLANE already settled as the workflow ("you cannot
        // change height from top-down... some moves take two steps").
        //
        // The cap is set by the CONNECTORS, not by taste. Band length is walk the connectors do
        // not get: three bands at 25% each leave only 25% of the walk to turn every corner in, and
        // that MEASURED 25.2 deg/frame on Terminal against B5's 12 cap — the longer stick bought
        // back the very jerk this lane spent the session removing. 15% leaves 55% for connectors
        // and holds B5. Raising this requires re-running witness_cinema_bands, not judgement.
        var _cap = 0.15 * (pathLen || 0);
        var _want = Math.min(_screenMin, _cap > 0 ? _cap : _screenMin);
        if (isFinite(_want) && _want > len) {
          console.log('§CPE_BAND_REACH screen floor binds: ' + len.toFixed(2) + 'm -> ' +
            _want.toFixed(2) + 'm = ' + (_want / _mPerPx).toFixed(0) + 'px (' +
            _mPerPx.toFixed(3) + ' m/px at ' + _d.toFixed(0) + 'm; wanted ' +
            CINEMA_BAND_MIN_PX + 'px = ' + _screenMin.toFixed(2) + 'm, cap ' + _cap.toFixed(2) + 'm)');
          len = _want;
        }
      }
    } catch (e) {}
    for (var i = 0; i < wp.length; i++) {
      var a = wp[Math.max(0, i - 1)], b = wp[Math.min(wp.length - 1, i + 1)];
      var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      var L = Math.hypot(dx, dy, dz);
      if (L < 1e-4) { dx = 1; dy = 0; dz = 0; L = 1; }
      bands.push({ c: { x: wp[i].x, y: wp[i].y, z: wp[i].z },
                   d: { x: dx / L, y: dy / L, z: dz / L }, len: len });
    }
    return bands;
  }
  A.cinemaSeedBands = _cinemaSeedBands;
  // §CPE_STICK — seed ONE band at an arbitrary point on the flown curve. Same rule as the three
  // seeded bands above: centre on the curve, direction = the LOCAL TANGENT (previous→next), length
  // inherited. That combination is what makes a freshly dropped stick a NO-OP — it lies along the
  // path it was dropped on, so the film does not move until the user moves the stick.
  // Lives here rather than in the editor so the witness exercises the SHIPPED function instead of a
  // re-implementation of it (the failure mode where a gate passes against its own copy of the maths).
  function _cinemaSeedStick(pts, i, len) {
    if (!pts || pts.length < 2) return null;
    var n = pts.length;
    i = Math.max(0, Math.min(n - 1, i | 0));
    var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    var L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) { dx = 1; dy = 0; dz = 0; L = 1; }
    return { c: { x: pts[i].x, y: pts[i].y, z: pts[i].z },
             d: { x: dx / L, y: dy / L, z: dz / L },
             len: (len > 0 ? len : Math.max(CINEMA_BAND_MIN_M, 1)) };
  }
  A.cinemaSeedStick = _cinemaSeedStick;
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
  // §CPE_NOISE_LAW — the FLOORED ease. User, live, 2026-07-27: "also noticing last wpt stalling as
  // the first one ... thus it is not using the noise ratio". They are right, and it is measurable:
  // a beat's raw speed spans 3.66/0.186 = 20x (witness_cpe_noise_law, Duplex dive) and ALL of that
  // is smoothstep, whose derivative 6e(1-e) is exactly ZERO at both ends of every beat. The noise
  // ratio only modulates 1.1-1.5x on top. So the clock governs and the law decorates — the opposite
  // of the ruling — and the zero at each seam IS the stall the user sees at the first and last
  // waypoint.
  //
  // Fix without throwing away the ease: mix in enough linear rate that the ends never reach zero,
  // with the mix taken from the user's OWN dial rather than a new number:
  //     easeF(t) = a·t + (1-a)·smoothstep(t),   a = 1/PACE_SWING
  // giving easeF'(0) = easeF'(1) = a = 1/1.6 (the slow rail exactly) and easeF'(0.5) = 1.19 (well
  // inside the fast rail). Ends at 0->0 and 1->1 unchanged, so no beat boundary moves and no path
  // changes. The ease now spans 1.9x instead of infinity, which leaves the NOISE ratio as the term
  // that actually shapes the film.
  function _cinemaEaseFloored(t) {
    var a = 1 / CINEMA_PACE_SWING;
    return a * Math.max(0, Math.min(1, t)) + (1 - a) * _cinemaSmoothstep(t);
  }
  // §EFFECTS_LOADED — effects.js's build fingerprint, so a pasted console can answer "is this
  // live?" by itself. Bump on EVERY behaviour change in this file. Reorganized to one clause per
  // line 2026-08-04 for readability (no §TAG dropped) — also CAUGHT UP a real gap found while doing
  // that: §CPE_AIM_PIN (Part C) added real behaviour here (`_buildPinZones`/`_pinLookAtAt` inside
  // `_beat3Pose`) but this string was never bumped for it, breaking the file's own "bump on EVERY
  // behaviour change" rule for one release. Fixed now, not left for a future session to rediscover.
  var EFFECTS_V = 'v22 (' +
    '§CPE_DISCIPLINE_REVEAL_FLYBACK new fast eased retrace sub-beat replaces the pull-out->round-2 ' +
      'teleport cut; §CPE_DISCIPLINE_REVEAL_ORDER discs sorted ascending by real avg bbox volume, ' +
      'MEP forced last; §CPE_DISCIPLINE_REVEAL_FADE tail-parade boundaries get a brief overlap ' +
      'window instead of an instant swap; ' +
    '§CPE_AIM_SIMPLIFY §CPE_AIM_DENSITY RETIRED (was: turn toward nearest mass when outside the ' +
      'building with nothing substantial near — a third, independent trigger the user\'s own model ' +
      'never asked for, and the likely source of reported "facing sky" swings); §CPE_AIM_DEPTH is ' +
      'now the SOLE exception to path-follow, and its trigger changed from omnidirectional ' +
      '_aimSoftDensity (fired on ordinary flanking-wall proximity, e.g. mid-corridor) to a single ' +
      'forward raycast along the walk\'s own look-ahead direction (_aimForwardClear) — long hit stays ' +
      'on path regardless of flanking walls, short hit (dead end / storey-crossing pocket) triggers ' +
      'the existing far-facade search unchanged; ' +
    '§CPE_AIM_PIN a pinned band\'s Voronoi zone of the walk overrides path-follow/depth outright ' +
      '(_buildPinZones/_pinLookAtAt inside _beat3Pose); ' +
    '§CPE_PACE_SWING_SOFTEN CINEMA_PACE_SWING 1.6->1.45, direct user tuning request; ' +
    '§CINEMA_LOOKAHEAD_ARC no-threshold look-ahead; ' +
    '§CPE_EVEN_TURN cost-parameterized walk + §CPE_SEAM_CONTINUOUS Beat2→3 opening blend; ' +
    '§STAFFAGE_OUTSIDE_VARIETY + §STAFFAGE_FLOOR_PHANTOM)';
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
  // ══ §CPE_GAZE_ACQUIRE — the cap ACCELERATES when far off-axis and decays onto the subject ═════
  // USER, 2026-08-02: "the cam head turning to face density*depth ... Seems a bit slow during this
  // baking. It be nice if it does so right away gracefully."
  //
  // The limiter above was a FLAT cap, so a 90 deg acquisition cost a dead-constant 2.00 s at one
  // unvarying speed. That is not a slow camera, it is a camera with no acquisition: a real operator
  // whips onto a subject and DECELERATES onto it. "Right away" and "gracefully" are the two halves
  // of that, and a single flat number can express neither.
  //
  // So the allowance is scaled by the RESIDUAL angle — the further off-axis, the more rate it may
  // spend; as it converges the multiplier smoothsteps back to exactly 1.0, which is the shipped
  // behaviour. Peak turn rate is therefore still explicitly bounded (GAZE_ACQUIRE_MAX), still
  // logged every bake, and a gaze already ON its subject moves exactly as it did before — that
  // last property matters: it means this cannot add motion to a settled shot.
  //
  // ⚠ IT MULTIPLIES OVER CINEMA_TURN_DPS, IT DOES NOT REPLACE IT. That constant also prices the
  // spin, the orbit lap and the walk's own turn charge (see _useSec, ~line 5932) — raising it would
  // silently re-time every film ever baked. This is a gaze-only multiplier for exactly that reason.
  //
  // §CPE_GAZE_ACQUIRE_SOFTEN (user, 2026-08-02, on the second Hospital bake): "The cam face turns
  // rather obvious been more pronounced, still OK, was more graceful before." 3x (135 deg/s peak)
  // overshot; 2x (90 deg/s) keeps both halves of the original ask — still strictly faster than
  // the flat 45 deg/s that read as "a bit slow", still decaying to exactly 1.0x on-subject.
  // Pure function of the residual, so poseAt stays order-independent and replans stay identical.
  var GAZE_ACQUIRE_MAX  = 2;                    // peak multiple of the shared CINEMA_TURN_DPS cap
  var GAZE_ACQUIRE_FULL = 60 * Math.PI / 180;   // residual at/above which the full multiple applies
  var GAZE_ACQUIRE_DEAD = 2 * Math.PI / 180;    // below this the gaze IS on target — no boost at all
  function _gazeAcquireCap(residRad, baseMaxAng) {
    var r = Math.abs(residRad);
    if (!(r > GAZE_ACQUIRE_DEAD)) return baseMaxAng;
    var u = Math.min(1, (r - GAZE_ACQUIRE_DEAD) / (GAZE_ACQUIRE_FULL - GAZE_ACQUIRE_DEAD));
    return baseMaxAng * (1 + (GAZE_ACQUIRE_MAX - 1) * _cinemaSmoothstep(u));
  }
  // Exposed for witness_cpe_gaze_acquire.js — the witness drives THIS function, not a copy of the
  // arithmetic, so a change here cannot pass a test that reimplemented the old curve.
  A.gazeAcquireCap = _gazeAcquireCap;
  A.gazeAcquireStep = function (cur, tgt, baseMaxAng) {
    var d = Math.max(-1, Math.min(1, cur.x * tgt.x + cur.y * tgt.y + cur.z * tgt.z));
    return _rotToward(cur, tgt, _gazeAcquireCap(Math.acos(d), baseMaxAng));
  };
  function _rotToward(a, b, maxAng) {
    var d = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    var ang = Math.acos(d);
    if (ang <= maxAng || ang < 1e-9) return b;
    var s = Math.sin(ang);
    if (Math.abs(s) < 1e-9) return b;             // antipodal/degenerate — no stable arc to walk
    var t = maxAng / ang, k0 = Math.sin((1 - t) * ang) / s, k1 = Math.sin(t * ang) / s;
    var x = a.x * k0 + b.x * k1, y = a.y * k0 + b.y * k1, z = a.z * k0 + b.z * k1;
    var L = Math.hypot(x, y, z) || 1;
    return { x: x / L, y: y / L, z: z / L };
  }

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

    // §CPE_REPLAN_LAZY — prefix cache key + hit test (see the module-scope comment at
    // _cinemaPrefixCache). Everything from here to just past `outWp.push(exitOuter)` is the
    // cacheable prefix; the restore branch is at the end of that span.
    var _ppT0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    var _ppKey = (A.activeBuilding || '') + '|' + (A._metaGen || 0) + '|' +
      [camPos0.x, camPos0.y, camPos0.z, yaw0, pitch0].map(function (v) { return v.toFixed(4); }).join(',');
    var _ppHit = !!(_cinemaPrefixCache && _cinemaPrefixCache.key === _ppKey);
    var _ppc = null;
    if (_ppHit) _ppc = JSON.parse(_cinemaPrefixCache.json);
    if (!_ppHit) {

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
    var _ppDiveLine = '§CINEMA_DIVE src=' + diveSrc + ' space="' + diveName + '" areaM2=' + diveArea.toFixed(1) +
      ' settle=(' + settle.x.toFixed(1) + ',' + settle.y.toFixed(1) + ',' + settle.z.toFixed(1) + ')' +
      ' floorY=' + (floorY === null ? 'n/a' : floorY.toFixed(2)) + ' eye=' + CINEMA_EYE_M +
      ' fanMin=' + fan.min.toFixed(1) + ' fanMax=' + fan.max.toFixed(1) + ' fanMean=' + fan.mean.toFixed(1) +
      ' openBearing=' + (fan.maxBearing * 180 / Math.PI).toFixed(0) + '°' +
      ' facingFree=' + fan.free[wallIdx].toFixed(1) + ' nudge=' + Math.min(nudgeL, nudgeCap).toFixed(2) + 'm' +
      ' fanMinGlazing=' + fan.minGlazing + ' nudgeCap=' + nudgeCap +
      ' enclosed=' + (enclosedFrac * 100).toFixed(0) + '%' +
      ' yaw0=' + (yaw0 * 180 / Math.PI).toFixed(1) + '° pitch0=' + (pitch0 * 180 / Math.PI).toFixed(1) + '°' +
      ' diveDist=' + diveDist.toFixed(1) + 'm';
    console.log(_ppDiveLine);

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
    var _ppExitLine = '§CINEMA_EXIT chosen=' + chosenExit.guid + ' name="' + chosenExit.name + '" dist=' +
      chosenExit.dist.toFixed(1) + ' facingDot=' + chosenExit.facingDot.toFixed(3) +
      ' perimFactor=' + (chosenExit.perim || 1).toFixed(2) + ' cost=' +
      chosenExit.cost.toFixed(1) + ' src=' + exitSrc + ' candidates=' + exitScored.length +
      ' runnerUp=' + (exitScored[1] ? exitScored[1].guid + '@' + exitScored[1].cost.toFixed(1) : 'none') +
      ' hadToTravel=' + hadToTravel + ' diveDist=' + diveDist.toFixed(1) + 'm mood=' + (hadToTravel ? 'rushed' : 'graceful');
    console.log(_ppExitLine);

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
    // §CPE_REPLAN_LAZY — store the freshly-computed prefix. JSON round-trip so every later replan
    // gets fresh copies (the suffix mutates outWp; a shared reference would corrupt the cache).
    _cinemaPrefixCache = { key: _ppKey,
      prefixMs: ((typeof performance !== 'undefined') ? performance.now() : 0) - _ppT0,
      json: JSON.stringify({ settle: settle, fan: fan, diveDist: diveDist, hadToTravel: hadToTravel,
        chosenExit: chosenExit, exitSrc: exitSrc, exitScored: exitScored, outWp: outWp,
        outRoute: outRoute, exitOuter: exitOuter, spaceCandsLen: spaceCands.length,
        odx: odx, odz: odz,
        diveLine: _ppDiveLine, exitLine: _ppExitLine }) };
    console.log('§CPE_REPLAN_LAZY miss=1 prefixMs=' + _cinemaPrefixCache.prefixMs.toFixed(1) + ' key=' + _ppKey.slice(0, 40));
    } else {
      // §CPE_REPLAN_LAZY — cache hit: restore every prefix output the suffix consumes and replay
      // the §CINEMA_DIVE/§CINEMA_EXIT lines VERBATIM (identical by construction — the cache key
      // pins every input the prefix reads; witness_cpe_preview_divergence.js keeps parsing them).
      var settle = _ppc.settle, fan = _ppc.fan, diveDist = _ppc.diveDist,
          hadToTravel = _ppc.hadToTravel, chosenExit = _ppc.chosenExit, exitSrc = _ppc.exitSrc,
          exitScored = _ppc.exitScored, outWp = _ppc.outWp, outRoute = _ppc.outRoute,
          exitOuter = _ppc.exitOuter, spaceCands = new Array(_ppc.spaceCandsLen),
          odx = _ppc.odx, odz = _ppc.odz;   // Beat 3/4 outward-push fallback — read by the suffix's
          // gaze fallback and the §Beat-4 seam measurement; the ONE prefix output the first cut of
          // this cache missed (found by witness G-RL-EQUIV at 0.098m divergence, fixed same day).
      console.log(_ppc.diveLine);
      console.log(_ppc.exitLine);
      console.log('§CPE_REPLAN_LAZY hit=1 savedMs=' + _cinemaPrefixCache.prefixMs.toFixed(1) + ' key=' + _ppKey.slice(0, 40));
    }
    // ══ §CINEMA_PATH_EDITOR (prompts/CINEMA_PATH_EDITOR.md §CINEMA_PATH_EDITOR_MODEL item 1):
    // AUTHORED waypoints replace the derived walk-out wholesale. Waypoints are the ONLY authored
    // data in this whole feature — position plus camera height, nothing else. The camera ANGLE is
    // never authored (item 2): it stays LOS toward the next waypoint, which is exactly what _outPos
    // and the existing §CINEMA_TURN_SLERP already derive. That is WHY this feature cannot weaken
    // §CINEMA_TURN_SLERP's witness (item 4) — it changes that law's inputs, never the law.
    var cpeOrbitScale = 1, cpeOrbitDY = 0, cpeFlow = null;
    // §CPE_BANDS: authored BANDS expand to waypoints here — the plan below never needs to know a
    // band existed. Everything downstream (LOS aim, spin bearing, orbit elasticity, the walk-out
    // itself) reads `outWp` exactly as it did for loose waypoints, so bands add a control model
    // without adding a second code path through the plan.
    if (_cpeBands && _cpeBands.length >= 2) {
      _cpeWp = _cinemaBandWaypoints(_cpeBands);
      // §CPE_HOSE applies to the FLOWN polyline, after the bands have produced it: the bands stay
      // rigid (§CPE_BANDS rule 2, settled and untouched) and the hose deforms the curve BETWEEN and
      // AROUND them. `outWp` — the authored control points the rest of the plan reasons about — is
      // deliberately NOT hosed, so routing, the exit choice and the orbit elasticity all still read
      // the authored intent rather than a deformed copy of it.
      cpeFlow = _cinemaHoseApply(_cinemaBandFlow(_cpeBands), _cpeHose);
    }
    if (_cpeWp && _cpeWp.length >= 2) {
      // ══ The LAST waypoint is the orbit's control point, and it acts ELASTICALLY (user, 2026-07-26:
      // "that curve remains static, it is just its waypoint that gets adjusted... it is elastic,
      // relative to its original orbit"). The orbit KEEPS ITS SHAPE — ellipse, Sun-glint swoop, flat
      // hold, decelerating ending, all formula-driven and all already witnessed. The stop row only
      // stretches it: a RATIO on radius and an OFFSET on height, both measured against the derived
      // orbit rather than replacing it.
      // Relative, not absolute, on purpose: a stored path is re-applied later against a plan that
      // may have been derived from a different start pose (hence a different fillDistance). A ratio
      // still means "a bit wider than this building's natural orbit" then; an absolute radius in
      // metres would not.
      // The third lever needs no code at all: `exitAz` below is measured off exitOuter, and it is
      // what decides where the Sun crossing falls in the loop — whether the film catches the
      // reflection early and then rises, or rises into it at the end. Reassigning exitOuter is
      // enough for the stop row to re-shape the orbit's whole mood through existing code.
      var derivedOuter = exitOuter;
      var derivedR = Math.hypot(derivedOuter.x - pivot.x, derivedOuter.z - pivot.z);
      outWp = _cpeWp.map(function(w) { return { x: w.x, y: w.y, z: w.z }; });
      outRoute = 'authored';
      exitOuter = outWp[outWp.length - 1];
      // ── Two things downstream still pointed at the DERIVED route and had to be re-aimed at the
      // authored one. Both were caught by witness numbers, not by reading the code:
      //
      // (a) `settle` — Beats 1-2 (dive, spin) fly to `settle`, which came from the §CINEMA_SPACE
      //     pick, while Beat 3 starts from outWp[0]. Authoring row 0 without this moved only the
      //     walk, so the camera teleported at the beat seam. G3 measured it exactly: a 1.5m
      //     height edit produced dy over the walk-out of [0.000, 1.508] — the 0.000 IS the seam.
      //     Mutated in place because the beat closures captured this object.
      // (b) `odx/odz` — the outward push direction past the doorway. Beat 3's gaze falls back to it
      //     whenever the look-ahead point collapses onto the position (the last half-metre of the
      //     walk, line ~4146), and Beat 4 assumes "(odx,odz) IS the direction Beat 3 ends on". With
      //     an authored path that was still the derived exit's bearing, so the gaze SNAPPED onto it
      //     at the end of the walk: G7 measured 115.2 deg in a single frame — six times worse than
      //     the 19.8 deg/frame whip this feature set out to retire.
      settle.x = outWp[0].x; settle.y = outWp[0].y; settle.z = outWp[0].z;
      var lastLeg = outWp[outWp.length - 1], prevLeg = outWp[outWp.length - 2];
      var lgx = lastLeg.x - prevLeg.x, lgz = lastLeg.z - prevLeg.z;
      var lgL = Math.hypot(lgx, lgz);
      if (lgL > 1e-4) { odx = lgx / lgL; odz = lgz / lgL; }
      var authoredR = Math.hypot(exitOuter.x - pivot.x, exitOuter.z - pivot.z);
      if (derivedR > 0.01) cpeOrbitScale = authoredR / derivedR;
      cpeOrbitDY = exitOuter.y - derivedOuter.y;
      console.log('§CINEMA_PATH_EDIT authored waypoints=' + outWp.length + ' (derived route replaced)' +
        ' orbitScale=' + cpeOrbitScale.toFixed(3) + ' orbitDY=' + cpeOrbitDY.toFixed(2) + 'm');
    }
    // ══ §CINEMA_PATH_EDITOR_MODEL items 5-7: the waypoints are CONTROL points, not corners. The
    // flown curve CUTS INSIDE every corner (user: "yes cut inside"), so a sharp corner is not a
    // state this path can reach — user: "that means there are no 'sharp' corners." The cut is
    // bounded by MEASURED clearance at each waypoint (_cinemaFan.min, this project's single source
    // for "how much open space is here", already trusted by §CINEMA_SPACE), never by a guessed
    // fillet constant: tight room → tight curve, open hall → wide graceful arc.
    // This retires the ungated "D2 walk-out corner whip" (19.8°/frame) the user reported as "about
    // 2 jerks, fast jump at least a frame" — tolerable while the route was derived-and-tame, trivial
    // to hit once waypoints are user-draggable. Gated by G7 (°/frame cap) and G8 (deviation ≤ the
    // measured clearance). `outWp` stays the authored control points (the editor's table and the
    // LOS derivation both read it); `flowWp` is what is actually flown.
    // Bands bring their own flown geometry (straight bands + tangent-matched connectors) and must
    // NOT be run through the corner rounder — rounding a band's interior is exactly the morphing
    // §CPE_BANDS rule 2 forbids. The rounder stays in force for the derived and loose-waypoint
    // paths, which is what keeps G1's byte-identity intact.
    var flowWp = cpeFlow || _cinemaRoundCorners(outWp);
    var segLen = [0];
    for (var wi = 1; wi < flowWp.length; wi++)
      segLen.push(segLen[wi - 1] + Math.hypot(flowWp[wi].x - flowWp[wi - 1].x,
                                              flowWp[wi].y - flowWp[wi - 1].y,
                                              flowWp[wi].z - flowWp[wi - 1].z));
    var totalLen = segLen[segLen.length - 1] || 1;
    function _outPos(f) {
      var want = Math.max(0, Math.min(1, f)) * totalLen;
      for (var i2 = 1; i2 < flowWp.length; i2++) {
        if (want <= segLen[i2] || i2 === flowWp.length - 1) {
          var seg = (segLen[i2] - segLen[i2 - 1]) || 1;
          var lf = Math.max(0, Math.min(1, (want - segLen[i2 - 1]) / seg));
          return { x: flowWp[i2 - 1].x + (flowWp[i2].x - flowWp[i2 - 1].x) * lf,
                   y: flowWp[i2 - 1].y + (flowWp[i2].y - flowWp[i2 - 1].y) * lf,
                   z: flowWp[i2 - 1].z + (flowWp[i2].z - flowWp[i2 - 1].z) * lf };
        }
      }
      return flowWp[flowWp.length - 1];
    }

    // ══ §CPE_AIM_PIN — click-to-pin explicit look-target ═══════════════════════════════════════
    // Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md Part C. A band can now carry `lookAt:
    // {x,y,z}|null`. `_cpeBands` (module scope, set by the A.cinemaPathPlan wrapper above) is
    // fully flattened into `flowWp` by `_cinemaBandFlow` before it ever reaches this closure — no
    // band identity survives that flattening (comment at _cinemaBandFlow's own header) — so there
    // is no existing "which band is e3 in" mapping to reuse. Built once per plan, lazily, the same
    // nearest-point technique `_bandArcS`/`_hitTestPath` already use client-side (cinema_path_
    // editor.js) for the identical question, just run here against the SAME `flowWp` the walk is
    // actually sampled from (so a pin's zone is defined on the exact curve `_outPos` reads, hose
    // pulls and all — not a second, unhosed notion of "where band i is").
    //
    // Zone = the arc-fraction stretch nearer to band i's own centre than to any neighbour's — i.e.
    // the Voronoi partition of the walk by band-centre arc-fraction. This is what makes "the pin
    // always wins locally at its own band, with LOS/density resuming immediately after, no bleed
    // into neighbours" (spec's own recommendation, Part C open question 1) true by CONSTRUCTION:
    // every e3 belongs to exactly one zone, and a zone's aim is decided ONLY by its own band.
    var _pinZones = null;
    function _buildPinZones() {
      _pinZones = [];
      if (!_cpeBands || !_cpeBands.length) return;
      var fracs = _cpeBands.map(function(b) {
        var best = 0, bd = Infinity;
        for (var pi = 0; pi < flowWp.length; pi++) {
          var dx = flowWp[pi].x - b.c.x, dy = flowWp[pi].y - b.c.y, dz = flowWp[pi].z - b.c.z;
          var d = dx * dx + dy * dy + dz * dz;
          if (d < bd) { bd = d; best = pi; }
        }
        return segLen[best] / totalLen;
      });
      for (var bi = 0; bi < _cpeBands.length; bi++) {
        var lo = bi === 0 ? 0 : (fracs[bi - 1] + fracs[bi]) / 2;
        var hi = bi === _cpeBands.length - 1 ? 1 : (fracs[bi] + fracs[bi + 1]) / 2;
        _pinZones.push({ lo: lo, hi: hi, lookAt: _cpeBands[bi].lookAt || null, b: bi });
      }
    }
    // Read-only: the world point a pinned band at this e3 wants looked at, or null when e3 falls in
    // an unpinned band's zone (or there are no bands at all — the derived/loose-waypoint route).
    function _pinLookAtAt(e3) {
      if (_pinZones === null) _buildPinZones();
      for (var zi = 0; zi < _pinZones.length; zi++) {
        var z = _pinZones[zi];
        if (e3 >= z.lo && e3 <= z.hi) return z.lookAt;
      }
      return null;
    }
    A._cpePinZonesDebug = function() { if (_pinZones === null) _buildPinZones(); return _pinZones; };   // witness hook, read-only

    // ══ §CPE_CONE_ORIENT_ADJUST — anchored gaze corrections (2026-08-27) ═══════════════════════════
    // Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_CONE_ORIENT_ADJUST. Studied `_pinLookAtAt`
    // above before writing this: deliberately a DIFFERENT code path, not a reuse of it, because a
    // correction's anchor is NOT band-indexed — the POV cone's position is scrub-driven and may sit
    // anywhere along the walk, not necessarily at a band centre. Same NEAREST-POINT-ON-`flowWp`
    // technique `_buildPinZones` uses for a band's centre, applied to each correction's own captured
    // world anchor instead, so a correction is defined against the SAME real, hosed curve the walk is
    // actually sampled from (never a second, unhosed notion of "where along the path this is").
    //
    // Unlike a pin (a look-AT POINT, recomputed fresh every frame relative to the moving camera), a
    // correction stores a fixed captured DIRECTION — the cone's rotation at the moment the user let
    // go — and is blended in/out by an ASYMMETRIC, ARC-LENGTH-anchored envelope (spec item 5, user's
    // own design): a short ease-in ramp BEHIND the anchor, held at full strength FORWARD from the
    // anchor, then eased back down over a further decay length. Ramp/hold/decay ride on EACH entry
    // (spec item 4's own field list), copied from cinema_path_editor.js's authoring-time constants at
    // commit time — the fallbacks below only cover a malformed/pre-this-feature record.
    var _corrArc = null;
    function _buildCpeCorrArc() {
      _corrArc = [];
      if (!_cpeCorrections || !_cpeCorrections.length || !flowWp.length) return;
      for (var ci = 0; ci < _cpeCorrections.length; ci++) {
        var c = _cpeCorrections[ci];
        if (!c || !c.pos || !c.dir) continue;
        var best = 0, bd = Infinity;
        for (var pi = 0; pi < flowWp.length; pi++) {
          var dx = flowWp[pi].x - c.pos.x, dy = flowWp[pi].y - c.pos.y, dz = flowWp[pi].z - c.pos.z;
          var d = dx * dx + dy * dy + dz * dz;
          if (d < bd) { bd = d; best = pi; }
        }
        var sArc = segLen[best] / totalLen;
        // Fallbacks (2m/12m/6m) mirror cinema_path_editor.js's CPE_CONE_CORR_RAMP_M/HOLD_M/DECAY_M
        // authoring defaults — first-guess numbers, not settled (see that file's own comment; hold/
        // decay raised 2026-08-27 per user feedback after first live use).
        var rampM = (c.ramp != null && isFinite(c.ramp)) ? c.ramp : 2;
        var holdM = (c.hold != null && isFinite(c.hold)) ? c.hold : 8;
        var decayM = (c.decay != null && isFinite(c.decay)) ? c.decay : 5;
        _corrArc.push({ s: sArc, dir: c.dir,
          rampFrac: Math.min(0.45, rampM / Math.max(1e-3, totalLen)),
          holdFrac: holdM / Math.max(1e-3, totalLen),
          decayFrac: decayM / Math.max(1e-3, totalLen) });
      }
    }
    // Read-only: the corrected DIRECTION and blend WEIGHT (0..1) in force at this e3, or null when no
    // correction's window reaches this far. §CPE_CONE_ORIENT_ADJUST item 6 (multiple overlapping
    // corrections — not user-decided): simplest reasonable MVP picked here, flagged for review — the
    // NEAREST anchor (by |e3 - s|) wins outright where more than one window covers the same e3, no
    // cross-correction blending.
    function _cpeCorrectionAt(e3) {
      if (_corrArc === null) _buildCpeCorrArc();
      if (!_corrArc.length) return null;
      var bestC = null, bestDist = Infinity, bestW = 0;
      for (var i = 0; i < _corrArc.length; i++) {
        var c = _corrArc[i];
        var lo = c.s - c.rampFrac, hiHold = c.s + c.holdFrac, hi = hiHold + c.decayFrac;
        if (e3 < lo - 1e-9 || e3 > hi + 1e-9) continue;
        var w;
        if (e3 < c.s) w = _cinemaSmoothstep((e3 - lo) / Math.max(1e-9, c.rampFrac));         // ease-in, 0->1, ends AT the anchor
        else if (e3 <= hiHold) w = 1;                                                        // held, full strength
        else w = 1 - _cinemaSmoothstep((e3 - hiHold) / Math.max(1e-9, c.decayFrac));         // eased back down
        var dist = Math.abs(e3 - c.s);
        if (bestC === null || dist < bestDist) { bestC = c; bestDist = dist; bestW = w; }
      }
      if (!bestC) return null;
      return { dir: bestC.dir, w: bestW };
    }
    // Generic yaw/pitch-lerp direction blend — same technique _dirBlend/_cinemaGazeBlend already use
    // in this file (short-way yaw, linear pitch), simplified to return just a unit direction (no
    // pivot, no antipodal-reference bookkeeping — a corrected gaze and the underlying path-follow gaze
    // are never expected to be near-antipodal, unlike the look-back beat those two already handle).
    function _cpeCorrDirBlend(ax, ay, az, bx, by, bz, w) {
      if (w <= 0) return { x: ax, y: ay, z: az };
      if (w >= 1) return { x: bx, y: by, z: bz };
      var yawA = Math.atan2(az, ax), pitA = Math.atan2(ay, Math.hypot(ax, az));
      var yawB = Math.atan2(bz, bx), pitB = Math.atan2(by, Math.hypot(bx, bz));
      var raw = yawB - yawA;
      var dYaw = raw - 2 * Math.PI * Math.round(raw / (2 * Math.PI));   // short way
      var yaw = yawA + dYaw * w, pit = pitA + (pitB - pitA) * w, cp = Math.cos(pit);
      return { x: Math.cos(yaw) * cp, y: Math.sin(pit), z: Math.sin(yaw) * cp };
    }
    A._cpeCorrectionsDebug = function() { if (_corrArc === null) _buildCpeCorrArc(); return _corrArc; };   // witness hook, read-only
    // Witness hook, read-only: samples the REAL `_beat3Pose(e3)` at an arbitrary arc-fraction —
    // exactly the product function §CPE_CONE_ORIENT_ADJUST's envelope blend runs inside (same
    // precedent as `A._cpePinZonesDebug` above). Lets a witness sample the corrected region's gaze
    // SHAPE directly in the arc-fraction space the envelope is actually defined in, without needing
    // to invert tNorm -> e3 through _evenTurnRemap/_holdMap (private to this closure).
    A._cpeBeat3PoseDebug = function(e3) { return _beat3Pose(e3); };
    // ══ §CINEMA_GAZE_SENSE (2026-07-27) — decide the look-back's turn DIRECTION ONCE per plan.
    // _cinemaGazeBlend used to make this choice PER FRAME: if |dYaw| crossed CINEMA_TURN_ANTIPODAL_RAD
    // it switched from the short way to the +2π way. That test is a step function of the walk
    // direction, so the frame it flips, dYaw moves by 2π and the gaze snaps by 2π × w.
    // MEASURED, not theorised: on a 6-waypoint path the flip lands at e3=0.906, where turnW3=0.341,
    // predicting 2π × 0.341 = 123° in one frame — against 118°/frame actually measured. A latent
    // defect in shipped code that the derived 3-waypoint route simply never reached, because its
    // walk direction never crosses the threshold inside the blend window.
    // Resolving it once, from the geometry at the moment the blend STARTS, keeps the intent (a radial
    // walk-out has no defined short way, so turn the way the orbit itself turns) while making the
    // choice constant for the whole blend — which is what removes the snap.
    var _gzP = _outPos(1 - CINEMA_TURN_OVERLAP);
    var _gzA = _outPos(Math.min(1, (1 - CINEMA_TURN_OVERLAP) + 0.15));
    var _gzRaw = Math.atan2(pivot.z - _gzP.z, pivot.x - _gzP.x) -
                 Math.atan2(_gzA.z - _gzP.z, _gzA.x - _gzP.x);
    var _gzD = _gzRaw;
    while (_gzD > Math.PI) _gzD -= 2 * Math.PI;
    while (_gzD < -Math.PI) _gzD += 2 * Math.PI;
    // The reference delta: short way, with the original antipodal rule applied ONCE here.
    var _gazeRefD = (Math.abs(_gzD) >= CINEMA_TURN_ANTIPODAL_RAD)
      ? ((_gzRaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      : _gzD;
    console.log('§CINEMA_GAZE_SENSE refDeltaDeg=' + (_gazeRefD * 180 / Math.PI).toFixed(1) +
      ' antipodal=' + (Math.abs(_gzD) >= CINEMA_TURN_ANTIPODAL_RAD) +
      ' (branch chosen once; per-frame deltas are taken as the representative NEAREST this)');

    // The spin's destination bearing: the FIRST leg of the route out, so the spin ends looking
    // exactly where the walk begins (no seam between the two beats).
    var firstLeg = outWp.length > 1 ? outWp[1] : exitOuter;
    // §CINEMA_SPIN_BASELINE (2026-07-27): a BEARING needs a horizontal baseline. The next waypoint
    // is normally the door, metres away across the floor, so this is fine — but with §CPE_BANDS the
    // next waypoint is the settle band's own far end, which can be short and near-vertical. Measured
    // on Terminal, whose walk-out climbs ~17m with x/z barely moving: the spin ended on a bearing
    // derived from a ~0m horizontal baseline, disagreeing with the bearing Beat 3 immediately adopts,
    // and the Beat2→3 seam jumped 27 deg in one frame at e3=0.011.
    // Same guard, same 0.5m, same meaning as the look-ahead collapse test below — when there is no
    // horizontal baseline, aim at the point the walk actually looks at as it begins, which makes the
    // seam continuous by construction rather than by tuning. A normal door-length first leg is
    // untouched, so the derived film is unchanged.
    if (Math.hypot(firstLeg.x - settle.x, firstLeg.z - settle.z) < 0.5) {
      firstLeg = _outPos(0.15);
      console.log('§CINEMA_SPIN_BASELINE first leg has no horizontal baseline — spin aims at the ' +
        'walk-start look-ahead instead (' + firstLeg.x.toFixed(2) + ',' + firstLeg.z.toFixed(2) + ')');
    }
    var spinTo = Math.atan2(firstLeg.z - settle.z, firstLeg.x - settle.x);
    // §CPE_SEAM_CONTINUOUS — the direction the walk opens on, sampled here (before the beat
    // seconds) because _openDir/_openDeg below are derived from it. Same look-ahead point and same
    // 0.5m collapse guard Beat 3 itself uses at e3=0, so this is the walk's real opening gaze, not
    // a second guess at it (asserted below against _beat3Pose(0), the pose that actually flies).
    // NOTE: the spin does NOT pay for the pitch — see the _spinDeg comment below for why that was
    // tried, measured, and reverted.
    var _wkP0 = _outPos(0), _wkA0 = _lookAhead(_wkP0, 0);   // ONE look-ahead rule, shared with Beat 3
    var _wkDy = _wkA0.y - _wkP0.y;
    var _wkL = Math.hypot(_wkA0.x - _wkP0.x, _wkDy, _wkA0.z - _wkP0.z) || 1;
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
    //   - roughly BEHIND (beyond CINEMA_BEHIND_DEG) → turn the LONG way around, since a longer sweep
    //     IS what "helps shows around the place" for this case.
    //   - anywhere in between → turn directly, no artificial extension.
    //
    // §CPE_SPIN_WHIP (2026-08-01, user: "reduce the spin whip in the end to be not more than 360
    // degrees") — the behind branch USED to read `dYaw += sign(dYaw) * 2*PI`, i.e. the short way
    // PLUS a whole extra lap: |raw| + 360, which for this class (|raw| in (120,180]) is 480..540
    // degrees. That is the measured 523/534 whip, and it is what the DIVE->SPIN seam report ("it was
    // coming out of the dive towards the edge") localised to. The genuine long way around is the
    // OPPOSITE DIRECTION, not one more lap: |360 - raw|, which lands in [180,240) for this class.
    // Three properties, all checked by witness_cpe_spin_whip.js:
    //   - it ends on the IDENTICAL bearing (yaw0+dYaw === spinTo mod 2PI), so _handYaw/_handDir —
    //     both of which go through cos/sin — are unchanged and Beat 3 still starts exactly where it
    //     did. This is a whip fix, NOT a re-aim (G-SW-3).
    //   - it is still LONGER than the short way for every angle in the class, so
    //     §CINEMA_SPIN_MOTIVATED's "if the nearest is behind then turn around to it" survives
    //     intact — the fix must not degrade into the short turn (G-SW-2).
    //   - the 360 ceiling is now STRUCTURAL, not a clamp: no branch can emit more. `capped` below
    //     is an assertion that cannot trip, printed so the invariant is visible rather than assumed.
    var CINEMA_FACING_SKIP_DEG = 20, CINEMA_BEHIND_DEG = 120;
    var _dYawRawSigned = dYaw;                       // the short way, before any class rewrites it
    var dYawAbsDeg = Math.abs(dYaw) * 180 / Math.PI;
    if (dYawAbsDeg < CINEMA_FACING_SKIP_DEG) {
      dYaw = 0;
    } else if (dYawAbsDeg > CINEMA_BEHIND_DEG) {
      dYaw -= (dYaw >= 0 ? 1 : -1) * 2 * Math.PI;
    }
    var _spinCapped = Math.abs(dYaw) > 2 * Math.PI + 1e-9;
    // The SIGNED short-way angle is logged alongside the unsigned one so "the fix did not move the
    // end bearing" is directly checkable from the log: (rawSigned - final) must be an exact multiple
    // of 360 in every class that spins at all (G-SW-3).
    console.log('§CINEMA_SPIN dYawRawSignedDeg=' + (_dYawRawSigned * 180 / Math.PI).toFixed(1) +
      ' dYawRawDeg=' + dYawAbsDeg.toFixed(1) + ' class=' +
      (dYawAbsDeg < CINEMA_FACING_SKIP_DEG ? 'already-facing(no-spin)' : dYawAbsDeg > CINEMA_BEHIND_DEG ? 'behind(long-way)' : 'direct-turn') +
      ' finalSpinDeg=' + (dYaw * 180 / Math.PI).toFixed(1) +
      ' ceilingDeg=360 capped=' + _spinCapped);

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
    // §CINEMA_PATH_EDITOR: the stop row stretches the orbit elastically. The radius band still
    // clamps the result — that band is what keeps the building framed at all (too close clips, too
    // far is a speck), so a stretch is honoured WITHIN it, never in place of it. Both the requested
    // and the granted value are logged, so a clamp is visible in the log instead of silently
    // swallowing what the user dragged.
    var orbitRadiusWant = fillDistance * cpeOrbitScale;
    var orbitRadius = Math.max(radiusMin, Math.min(radiusMax, orbitRadiusWant));
    if (cpeOrbitScale !== 1 || cpeOrbitDY !== 0)
      console.log('§CINEMA_ORBIT_ELASTIC scale=' + cpeOrbitScale.toFixed(3) +
        ' requested=' + orbitRadiusWant.toFixed(1) + ' granted=' + orbitRadius.toFixed(1) +
        ' band=[' + radiusMin.toFixed(1) + ',' + radiusMax.toFixed(1) + ']' +
        ' clamped=' + (Math.abs(orbitRadius - orbitRadiusWant) > 0.05) + ' dY=' + cpeOrbitDY.toFixed(2) + 'm');

    // ══ Beat boundaries, in normalized time. Fixed SECONDS, so a longer film gets a longer orbit,
    // never a longer dive (§CINEMA_SIMPLE: the dive is time-boxed at 4s and must not be clamped).
    // Computed BEFORE _orbitPose because loopSec (needed to convert the swoop/hold/descent SECONDS
    // constants into this act's own u-domain) depends on tR, and _orbitPose(0) is called immediately
    // after to seed the Beat 4 handoff target. ═══════════════════════════════════════════════════
    // ══ §CPE_PACING — every beat's length is a measured distance or angle over a stated rate.
    // The pull-back is the recede from where the walk ends to the final orbit radius, which is the
    // "pull back from near to the final orbit distance" the user asked for — paced by that real
    // distance instead of a fixed 2s.
    var _pullNearR = Math.hypot(exitOuter.x - pivot.x, exitOuter.z - pivot.z);
    var _pullDist = Math.max(0, orbitRadius - _pullNearR);
    // ⚠ diveDist and dYaw are properties of WHERE THE USER WAS STANDING, not of the building —
    // measured LTU_AHouse: a 746m approach and a 522° spin, because the camera happened to be far
    // out and facing away. Pacing them raw made the runtime depend on the user's pose (LTU came out
    // at 93.6s, of which 37.3s was dive and 11.6s spin), which contradicts the whole point: the
    // total is supposed to fall out of the BUILDING's size. So both are bounded by building-derived
    // quantities — the approach is capped at the envelope, the spin at a half turn (the most that is
    // ever needed to face anywhere) — and only then converted at their stated rates.
    // §CPE_TURN_BUDGET (user, 2026-07-27: "where sudden diff is adverse noise impact and introduce
    // frames to smoothen"). The walk's seconds were derived from DISTANCE alone, so a route that
    // turns 496 deg and one that turns 90 deg over the same metres got the same frame count.
    //
    // Why redistribution alone could never fix this: with N frames fixed, mean turn per frame is
    // Θ/N whatever the parameterization does — §CPE_EVEN_TURN can move WHERE the turning falls but
    // not how much there is per frame on average. MEASURED on Hospital: 495.8 deg over ~122 walk
    // frames = 4 deg/frame mean against a peak of 20, with the speed function already saturated at
    // both rails. Redistribution cannot beat its own mean; only more frames can.
    //
    // So the same noise ratio pays twice: it sets speed WITHIN the walk (the cost parameterization)
    // and it buys the walk's TIME here. Sudden difference ⇒ more frames to smooth it, which is the
    // user's rule stated directly. No new constant — rotation is charged at CINEMA_TURN_DPS, the
    // rate the spin and the orbit lap already turn at, so a degree of turning costs the same
    // wherever it occurs.
    function _walkTurnDeg() {
      var N = 60, prev = null, prevD = null, deg = 0;
      for (var q = 0; q <= N; q++) {
        var p = _outPos(q / N);
        if (prev) {
          var dx = p.x - prev.x, dy = p.y - prev.y, dz = p.z - prev.z;
          var L = Math.hypot(dx, dy, dz);
          if (L > 1e-6) {
            var d = { x: dx / L, y: dy / L, z: dz / L };
            if (prevD) deg += Math.acos(Math.max(-1, Math.min(1,
              d.x * prevD.x + d.y * prevD.y + d.z * prevD.z))) * 180 / Math.PI;
            prevD = d;
          }
        }
        prev = p;
      }
      return deg;
    }
    var _diveEff = Math.min(diveDist, envelope);
    // ══ §CPE_NOISE_LAW (user, 2026-07-27: "the speed of dive to the wp1 is still not using noise
    // ratio" / "it governs thrughout"). The noise ratio is not a walk feature — it is the film's
    // one pacing law, and until now Beat 3 was the only beat that obeyed it. Measured before this
    // change: Hospital's dive/orbit cover 253 m in a 2 s window while its walk covers 1.0 m
    // (witness_cpe_gaze_spin S3), i.e. the beats OUTSIDE the walk ran on a clock with no noise term
    // at all.
    //
    // Busyness = the fraction of the fan that hits ANYTHING within its own range. Open sky reads 0,
    // a room reads 1. It is a DENSITY, not the fan MIN that was retired for the courtyard bug, and
    // it introduces NO new constant: the rays and the range are _cinemaFan's own.
    //
    // ⚠ NOT the ray fan. Two measured reasons, both from this session:
    //   1. The fan is HORIZONTAL only (`_cinemaFan`: dir.set(cos,0,sin)) — a camera 100 m up has
    //      nothing beside it, so a descent reads as empty however busy the building below is.
    //   2. It can be BLIND. On Terminal in the headless rig `_cinemaFanMeshes()` returns ZERO
    //      meshes, so every ray reports the CINEMA_FAN_FAR sentinel and the whole dive measured
    //      0.000 — and §CINEMA_SPACE fell back to bbox-centre for the same reason. A no-hit is not
    //      a measurement (§CPE_LIVE's standing rule).
    // The user's own answer (2026-07-27): "isnt it best to use the bbxes to smell out the frame
    // rate". `element_transforms` is DB truth, always loaded, deterministic on every machine, and
    // it cannot go blind. Counted in IFC space so the 48k rows are never converted — one sample
    // point is converted instead (A.three2ifc).
    var _densPts = null;
    function _densPoints() {
      if (_densPts) return _densPts;
      _densPts = [];
      try {
        // guid appended as a 4th element (index 3) — every existing reader only ever indexes 0/1/2,
        // so this is additive. §CPE_AIM_DEPTH_BUILDUP candidate 2 is the first reader of it, to cross-
        // reference a point against §CPE_BUILDUP's own per-element completion time (tmGuidEndTs()).
        var rows = A.dbQuery('SELECT center_x, center_y, center_z, guid FROM element_transforms');
        for (var i = 0; i < rows.length; i++) _densPts.push(rows[i]);
      } catch (e) {}
      return _densPts;
    }
    // How many elements are within one fan-horizon of this point. CINEMA_FAN_FAR is reused as the
    // neighbourhood radius rather than inventing a second range constant.
    // The radius must be commensurate with how far the BEAT travels. MEASURED: a fixed
    // CINEMA_FAN_FAR (60m) neighbourhood is constant across a 12-36m walk — the walk's noise series
    // came out maxChange=0 on BOTH buildings, i.e. the term was inert and Terminal's 2.27s crawl
    // was untouched. Half the beat's own travel is the natural scale (the neighbourhood turns over
    // roughly once across the beat), capped at the fan horizon so a 250m dive does not read the
    // whole site as one blur. Derived from the path, not picked.
    function _noiseRadius(travel) { return Math.max(3, Math.min(CINEMA_FAN_FAR, travel / 2)); }
    function _densityAt(p, R) {
      var pts = _densPoints();
      if (!pts.length || typeof A.three2ifc !== 'function') return 0;
      var rr = R || CINEMA_FAN_FAR;
      var q = A.three2ifc(p.x, p.y, p.z), R2 = rr * rr, n = 0;
      for (var i = 0; i < pts.length; i++) {
        var dx = pts[i][0] - q.ix, dy = pts[i][1] - q.iy, dz = pts[i][2] - q.iz;
        if (dx * dx + dy * dy + dz * dz < R2) n++;
      }
      return n;
    }

    // ══ §CPE_AIM_GRID — coarse occupancy grid, the shared data §CPE_AIM_DEPTH's subject search reads
    // (§CPE_AIM_SIMPLIFY, 2026-08-13): originally built for §CPE_AIM_DENSITY (user directive
    // 2026-07-28, "when the rope passes the final building perimeter and no substantial building part
    // nearby, then camera turns perpendicular towards the densest nearest part of the building"), which
    // has since been RETIRED (see its marker a few lines below, above _aimDepthWeight's own section).
    // This grid itself stays — §CPE_AIM_DEPTH's subject search (`_aimDepthSubject`) is the sole
    // remaining reader.
    var _aimCells = null;
    // Coarse occupancy grid over the SAME element centroids §CPE_NOISE_LAW already reads — reuse,
    // never a second proximity system (the same rule that made _densityAt reuse _densPoints).
    // Cell size derived from the building, not picked: an eighth of the envelope gives ~8x8 cells
    // across the footprint — coarse enough that a cell means "a part of the building" rather than
    // "an element", fine enough to distinguish a wing from the whole.
    //
    // §CPE_AIM_DEPTH_BUILDUP candidate 2 (2026-08-13): extracted from the old _aimGrid() body so it
    // can be reused over a FILTERED point set (see _aimGridPlaced below), not just the whole-building
    // one — one gridding routine, two callers, never two implementations to keep in sync.
    function _aimGridFrom(pts) {
      var cells = [];
      if (!pts.length) return cells;
      var cs = Math.max(2, envelope / 8), map = {};
      for (var i = 0; i < pts.length; i++) {
        var kx = Math.floor(pts[i][0] / cs), ky = Math.floor(pts[i][1] / cs), kz = Math.floor(pts[i][2] / cs);
        var key = kx + ',' + ky + ',' + kz, c = map[key];
        // zMin/zMax: purely additive to the base n/x/y/z fields. Lets
        // §CPE_AIM_DEPTH tell a wall-like cell (points spread over height) from a floor/ceiling-like
        // one (flat, near-zero height spread) without a second data pass — see zSpan below.
        if (!c) { c = map[key] = { n: 0, x: 0, y: 0, z: 0, zMin: pts[i][2], zMax: pts[i][2] }; cells.push(c); }
        c.n++; c.x += pts[i][0]; c.y += pts[i][1]; c.z += pts[i][2];
        if (pts[i][2] < c.zMin) c.zMin = pts[i][2];
        if (pts[i][2] > c.zMax) c.zMax = pts[i][2];
      }
      for (var j = 0; j < cells.length; j++) {
        var q = cells[j]; q.x /= q.n; q.y /= q.n; q.z /= q.n; q.zSpan = q.zMax - q.zMin;
      }
      return cells;
    }
    function _aimGrid() {
      if (_aimCells) return _aimCells;
      var pts = _densPoints();
      _aimCells = _aimGridFrom(pts);
      console.log('§CPE_AIM_GRID cells=' + _aimCells.length + ' cellSize=' + Math.max(2, envelope / 8).toFixed(1) +
        'm elems=' + pts.length + ' (subject search space for §CPE_AIM_DEPTH)');
      return _aimCells;
    }
    // §CPE_AIM_DEPTH_BUILDUP candidate 2 — the grid over ONLY elements placed by cursorMs, per
    // tmGuidEndTs()'s per-guid completion times. No caching here (unlike _aimGrid's _aimCells): the
    // cursor differs at every probe in §CPE_AIM_DEPTH_BUILDUP's own K=64 series, so each probe needs
    // its own filtered grid — cheap (one pass over the point list) at that probe count.
    var _bkGuidEnds = null, _bkGuidEndsTried = false;
    function _aimGuidEnds() {
      if (_bkGuidEndsTried) return _bkGuidEnds;
      _bkGuidEndsTried = true;
      _bkGuidEnds = (typeof window.tmGuidEndTs === 'function') ? window.tmGuidEndTs() : null;
      return _bkGuidEnds;
    }
    function _aimPlacedPoints(cursorMs) {
      var ends = _aimGuidEnds();
      if (!ends) return null;   // degrade: no completion data — caller falls back to unrestricted
      var pts = _densPoints(), out = [];
      for (var i = 0; i < pts.length; i++) {
        var g = pts[i][3], e = g ? ends[g] : undefined;
        if (e !== undefined && e <= cursorMs) out.push(pts[i]);
      }
      return out;
    }
    // "the densest NEAREST part" — both words are in the directive, so the score carries both:
    // element count divided by distance in envelope units. A big far wing loses to a solid near one,
    // which is what a camera flying past the building should be looking at.
    //
    // ⚠ A WEIGHTED CENTROID, NOT AN ARGMAX — and this is a MEASURED correction, not a preference.
    // The first cut picked the single best-scoring cell. Both trigger terms were continuous, so the
    // blend was smooth, but the SUBJECT was not: as the camera travels, the winning cell flips from
    // one to the next in a single frame and the gaze snaps with it. The witness caught exactly that
    // — peak gaze change 15.8°/frame without the rule against 78.5°/frame with it (W-HOSE A2, on
    // Duplex) — i.e. the rule bought its subject with precisely the jerk §CPE_EVEN_TURN exists to
    // kill. A weight-averaged centre of mass moves continuously with the camera by construction,
    // because every cell's weight varies smoothly with distance and no cell ever "wins".
    // The cubed distance term is what keeps it selective: without it the average drifts toward the
    // centroid of the whole site and stops being the NEAREST part.
    // §CPE_AIM_DENSITY_RETIRED (2026-08-13, bim-compiler prompts/CINEMA_PATH_EDITOR.md
    // §CPE_AIM_SIMPLIFY): this whole rule (_aimSubject/_aimOutsideM/_aimSoftDensity/_aimWeight/
    // _aimBuild/_aimAt/_aimApply — "turn perpendicular toward the nearest mass whenever outside the
    // building with nothing substantial near") is REMOVED, not disabled. User, after a live
    // HHS_Office bake required snatching the stick twice to recover the path: "make formula rather
    // simple: 1. Follow path of camera. 2. Look for depth... 2. is the only exception to 1." This
    // rule was a THIRD, independent trigger the user's own model never asked for, and its omni-
    // directional "nearest mass" pick is the most likely source of the reported "facing sky" swings
    // (a roof/upper-floor cluster is often the nearest mass by pure distance). It also targeted the
    // building-approach case only, which the user confirmed is redundant: "for outside building, the
    // last after stop is already building facing" — Beat 4/5's turn-to-pivot + orbit already faces
    // the building at the end, with no density term involved. §CPE_AIM_DEPTH below is now the ONLY
    // exception to path-follow, and its own trigger was tightened in the same session (see its
    // header) to stop firing on ordinary flanking-wall proximity, e.g. mid-corridor.

    // ══ §CPE_AIM_DEPTH — the SOLE exception to path-follow (§CPE_AIM_SIMPLIFY, 2026-08-13) ══════
    // Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_AIM_DEPTH + §CPE_AIM_SIMPLIFY. Original
    // directive, 2026-07-31: "if it is flying into area with a floor, a left side wall and front
    // wall, it turns to face which is further" ... "if near a wall along a corridor it wont face
    // dense fleeting but look to a more distance facade." Re-confirmed and simplified, 2026-08-13,
    // after a live HHS_Office bake needed the stick snatched back twice to recover the path: "1.
    // Follow path of camera. 2. Look for depth... 2. is the only exception to 1." §CPE_AIM_DENSITY,
    // the rule that used to run alongside this one (turn toward the nearest mass whenever outside
    // the building with nothing substantial near), is RETIRED — see the marker where it used to live,
    // above _aimGrid. Nothing else stands between the walk's own look-ahead and the orbit hand-off.
    //
    // WHY this rule alone: the walk's own look-ahead can aim straight at a close wall a metre away —
    // an ugly "nose against the wall" frame, and a jerk hazard in its own right (a near subject
    // sweeps across the frame far faster than a distant one for the same camera translation, angular
    // rate ~ v/d). Favouring the FAR facade over the near "fleeting" one is the same angular-rate
    // argument §CPE_EVEN_TURN already rests on, applied to WHICH subject is chosen.
    //
    // Reuses _aimGrid/_densPoints (built once per plan) for the SUBJECT search below, weight = n*d
    // (favour FAR) — unchanged by this session. Weighted centroid, not argmax — "the subject must
    // move continuously with the camera" (measured: an argmax subject bought a 78.5°/frame whip).
    //
    // §CPE_AIM_DEPTH_FWD_CLEAR (2026-08-13) — the TRIGGER changed, the search did not. It used to be
    // _aimSoftDensity in a SPHERE around the camera: flanking corridor walls on both sides read as
    // "surrounded" exactly like a real dead end, so an ordinary walk down a hall could fire this rule
    // and turn the camera off the path mid-corridor — contradicting the user's own stated intent
    // ("when user makes a path thru a corridor hall, it doesn't want the cam to be looking away other
    // than the path"). The real signal is not "is there mass nearby", it is "does the path's OWN
    // forward view stay open" — so the trigger is now a single raycast along the walk's own
    // look-ahead direction (`_lookAhead`, the same point the default rule already aims at): a long
    // hit means the corridor/hall keeps running, stay on path regardless of how close the flanking
    // walls are; a short hit means the view ahead itself is about to end (a dead end, or a
    // storey-crossing pocket with a mix of walls), and only then does the rule turn toward depth.
    var _AIM_DEPTH_CLOSE_FRAC = 0.05;   // "adjacent, would be fleeting" radius, a fraction of envelope
                                        // — the SUBJECT SEARCH's own exclusion radius, unchanged.
    var _AIM_DEPTH_SEARCH_FRAC = 0.30;  // how far out still counts as "a nearby facade" — bounds the
                                        // search to the room/corridor scale, not a site-wide reach.
    var _AIM_DEPTH_FWD_CLEAR_FRAC = 0.06;  // how far ahead along the look-ahead direction still
                                        // counts as "open" before the rule fires — deliberately
                                        // smaller than SEARCH_FRAC (that bounds where to look FOR a
                                        // subject once triggered; this bounds when to trigger at all).
    // §CPE_AIM_DEPTH_SCALE (2026-07-31, MEASURED live on Hospital, envelope=147m): a pure
    // envelope-fraction radius is corridor-scale on a small building (Duplex, envelope~15m → 0.75m)
    // but ~7.4m/44m (close/search) on a large one — big enough that "boxed in" was true almost
    // everywhere (§CPE_AIM_DEPTH_SERIES active=65/65, maxBlend=1.00 for the WHOLE walk) and the
    // "furthest facade" search bubble swallowed most of the building, landing near its centroid
    // instead of a specific nearby wall. Absolute-metre clamps keep both radii at real corridor/room
    // scale regardless of building size — the envelope fraction still narrows them on SMALL
    // buildings (where it was already correct), it just can no longer balloon on large ones.
    var _AIM_DEPTH_CLOSE_MIN_M = 1.5, _AIM_DEPTH_CLOSE_MAX_M = 4.5;
    var _AIM_DEPTH_SEARCH_MIN_M = 4.0, _AIM_DEPTH_SEARCH_MAX_M = 18.0;
    var _AIM_DEPTH_FWD_CLEAR_MIN_M = 3.0, _AIM_DEPTH_FWD_CLEAR_MAX_M = 8.0;   // corridor/hall scale —
                                        // same absolute-clamp reasoning as the close/search radii
                                        // above: an envelope fraction alone over/undershoots on very
                                        // small/large buildings (§CPE_AIM_DEPTH_SCALE, unchanged).
    // Single ray along the walk's own look-ahead direction — same BVH raycaster/mesh set _cinemaFan
    // already uses (§INTERIOR_PACING's own header: "the ONLY where-is-open-space source"), extended
    // to a full 3D direction rather than horizontal-only _cinemaLookDist, because a walk can climb
    // toward a ceiling (a storey crossing), not just turn a corner. `_cinemaFanMeshes()` only returns
    // `.visible` meshes, so this is buildup-safe for free — unbuilt elements aren't in the scene to
    // hit, the same reason _cinemaFan/_cinemaLookDist already work correctly during a bake.
    function _aimForwardClear(p, e3) {
      var ah = _lookAhead(p, e3);
      var dx = ah.x - p.x, dy = ah.y - p.y, dz = ah.z - p.z, dL = Math.hypot(dx, dy, dz);
      if (dL < 1e-6) return CINEMA_FAN_FAR;
      var meshes = _cinemaFanMeshes();
      if (!meshes.length) return CINEMA_FAN_FAR;
      if (!_cineFanRay) { _cineFanRay = new THREE.Raycaster(); _cineFanRay.firstHitOnly = true; }
      _cineFanRay.set(new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(dx / dL, dy / dL, dz / dL));
      _cineFanRay.far = CINEMA_FAN_FAR;
      var hits = null;
      try { hits = _cineFanRay.intersectObjects(meshes, true); } catch (e) { return CINEMA_FAN_FAR; }
      return (hits && hits.length) ? hits[0].distance : CINEMA_FAN_FAR;
    }
    // §CPE_AIM_DEPTH_BUILDUP candidate 2 (2026-08-13) — buildup-aware instead of buildup-off. The
    // old guard (kept below in spirit, not in code) skipped this rule entirely during buildup because
    // the subject grid was the WHOLE finished building with no notion of what §CPE_BUILDUP had
    // actually revealed by a given frame. Fix: derive the SAME cursor the real bake/preview would ask
    // for at this probe's e3 (window.tmFollowTimeline / APP.buildupTAt / APP.buildupCursorAt — never
    // a second, independently-derived clock), and restrict the candidate search to elements placed by
    // it (tmGuidEndTs, above). Degrade, not disable: if Time Machine isn't armed yet (e.g. a scrub
    // before the first real Play — §CPE_SCRUB_BUILDUP_SYNC's own documented gap) or the running
    // time_machine.js is old enough to lack tmGuidEndTs, this returns null for that probe exactly as
    // the old unconditional guard did — never faces unbuilt geometry by falling back to the whole
    // building.
    function _aimBuildupCursorAt(e3) {
      if (typeof window.tmFollowTimeline !== 'function' || typeof window.APP === 'undefined' ||
          typeof window.APP.buildupCursorAt !== 'function') return null;
      var bk;
      try { bk = window.tmFollowTimeline(); } catch (e) { bk = null; }
      if (!bk) return null;
      var bkT = (typeof window.APP.buildupTAt === 'function') ? window.APP.buildupTAt(e3, { beats: { rise: tR } }) : e3;
      return window.APP.buildupCursorAt(bkT, bk);
    }
    function _aimDepthWeight(p, e3) {
      if (typeof A.three2ifc !== 'function') return 0;
      var buildupOn = !!(A._cinemaPathEdit && A._cinemaPathEdit.buildup);
      var placedPts = null, cursorMs = null;
      if (buildupOn) {
        cursorMs = _aimBuildupCursorAt(e3 == null ? 0 : e3);
        if (cursorMs == null) return null;               // degrade: no cursor available yet
        placedPts = _aimPlacedPoints(cursorMs);
        if (placedPts == null) return null;               // degrade: no per-guid completion data
      }
      var pIfc = A.three2ifc(p.x, p.y, p.z);
      var Rclose = Math.max(_AIM_DEPTH_CLOSE_MIN_M, Math.min(_AIM_DEPTH_CLOSE_MAX_M, envelope * _AIM_DEPTH_CLOSE_FRAC));
      var clearM = Math.max(_AIM_DEPTH_FWD_CLEAR_MIN_M, Math.min(_AIM_DEPTH_FWD_CLEAR_MAX_M, envelope * _AIM_DEPTH_FWD_CLEAR_FRAC));
      var fwdClear = _aimForwardClear(p, e3 == null ? 0 : e3);
      var w = 1 - _cinemaSmoothstep(Math.min(1, fwdClear / clearM));
      return { w: w, fwdClear: fwdClear, clearM: clearM, R: Rclose, pIfc: pIfc, cells: placedPts ? _aimGridFrom(placedPts) : null };
    }
    // Weighted centroid over cells BEYOND the close radius (excludes the very thing that triggered
    // this — the adjacent, fleeting wall) and within a bounded search bubble, weight = count * distance
    // — reward mass AND depth jointly, so a distant sparse cell and a near-ish empty direction both
    // lose to a real facade that is actually further away.
    // `cellsOverride` — §CPE_AIM_DEPTH_BUILDUP candidate 2: the placed-only grid from _aimDepthWeight
    // above, when buildup is on. Omitted (every other caller), the original whole-building _aimGrid().
    function _aimDepthSubject(pIfc, Rclose, cellsOverride) {
      var cells = cellsOverride || _aimGrid();
      if (!cells.length) return null;
      var Rsearch = Math.max(Rclose * 2, Math.min(_AIM_DEPTH_SEARCH_MAX_M, Math.max(_AIM_DEPTH_SEARCH_MIN_M, envelope * _AIM_DEPTH_SEARCH_FRAC)));
      // §CPE_AIM_DEPTH_VERTICALITY (2026-07-31, MEASURED — the first cut's own witness caught this):
      // a plain weighted centroid over "everything nearby" blends the FLOOR into the average and the
      // subject lands somewhere between the floor and the wall — not on either. "Face the further
      // wall" means a wall, never the floor underfoot. Same grid cell size §CPE_AIM_GRID already
      // derives (an eighth of the envelope), so a wall cell (points spread across several metres of
      // height within one cell) is told from a floor/ceiling cell (all its points at ~one height,
      // near-zero zSpan) with zero new data — reuses zMin/zMax already tracked on the shared grid.
      var minZSpan = Math.max(2, envelope / 8) * 0.3;
      var sx = 0, sy = 0, sz = 0, sw = 0, sn = 0;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (c.zSpan < minZSpan) continue;               // floor/ceiling-like — not a facade
        var d = Math.hypot(c.x - pIfc.ix, c.y - pIfc.iy, c.z - pIfc.iz);
        if (d <= Rclose || d > Rsearch) continue;      // exclude the fleeting-close AND out-of-bubble
        var w = c.n * d;
        sx += c.x * w; sy += c.y * w; sz += c.z * w; sw += w; sn += c.n * w;
      }
      if (sw <= 1e-9) return null;
      return { x: sx / sw, y: sy / sw, z: sz / sw, n: Math.round(sn / sw) };
    }
    // ══ §CPE_AIM_LATCH — once aimed, it REMAINS aimed ══════════════════════════════════════════
    // User, 2026-08-01: "while aimed already at a centre, and when the path continues, it should
    // remain so ... ie at perpendicular angle", and "the last part should be fine as eventually
    // coming to perpendicular ... shall remain so as the last spin is all a 'straight circle'".
    //
    // WHAT THIS IS NOT: it does not touch the perpendicular projection, and it does not freeze the
    // subject. The user was explicit that the density×depth "gravity ... kept tugging at it" is
    // wanted — so the SUBJECT field keeps updating exactly as before. The defect is only that the
    // WEIGHT decays: `A0.w` is re-derived from local density every frame, so leaving the dense
    // pocket slides the gaze back to the look-ahead even though the camera had already committed.
    //
    // The fix is a RUNNING MAXIMUM over the weight field — the aim can strengthen but never weaken.
    // Deliberately not "pin to 1 after a threshold": that needs an engage constant and a ramp to
    // avoid a kink, whereas a running max over an already-smoothed field introduces NO new constant,
    // is monotone by construction, and stays a pure function of e3 (load-bearing — _beat3Pose is
    // documented as a pure function of its own progress, and the witnesses sample it out of order).
    function _aimLatch(w) {
      var o = [], run = 0;
      for (var i = 0; i < w.length; i++) { if (w[i] > run) run = w[i]; o.push(run); }
      return o;
    }
    // Probe-and-smooth over the walk, same idiom as §CPE_AIM_DENSITY's own series — the weight and
    // the subject are FIELDS along the path, rate-limited here rather than evaluated raw per frame.
    var _aimDepthSeries = null;
    function _aimDepthBuild() {
      var K = 64, i, ws = [], hasS = [], sx = [], sy = [], sz = [];
      for (i = 0; i <= K; i++) {
        var p = _outPos(i / K);
        var A0 = _aimDepthWeight(p, i / K);
        var wv = (A0 && A0.w) ? A0.w : 0;
        var sub = (A0 && A0.w > 1e-4) ? _aimDepthSubject(A0.pIfc, A0.R, A0.cells) : null;
        if (A0 && A0.w > 1e-4 && !sub) wv = 0;   // no candidate facade in the bubble → don't trigger
        ws.push(wv);
        hasS.push(sub ? 1 : 0);     // §CPE_STICK_HOLD: where a REAL subject exists (boost gate)
        var prevN = sx.length - 1;
        sx.push(sub ? sub.x : (prevN >= 0 ? sx[prevN] : 0));
        sy.push(sub ? sub.y : (prevN >= 0 ? sy[prevN] : 0));
        sz.push(sub ? sub.z : (prevN >= 0 ? sz[prevN] : 0));
      }
      function smooth(a) {
        var o = [], k = [1, 4, 6, 4, 1], n = a.length;
        for (var j = 0; j < n; j++) {
          var acc = 0, wsum = 0;
          for (var m = -2; m <= 2; m++) {
            var idx = j + m;
            if (idx < 0 || idx >= n) continue;
            acc += a[idx] * k[m + 2]; wsum += k[m + 2];
          }
          o.push(acc / wsum);
        }
        return o;
      }
      _aimDepthSeries = { K: K, has: hasS, w: _aimLatch(smooth(smooth(ws))),
                          x: smooth(smooth(sx)), y: smooth(smooth(sy)), z: smooth(smooth(sz)) };
      var wMax = 0, wN = 0;
      for (i = 0; i <= K; i++) { if (_aimDepthSeries.w[i] > wMax) wMax = _aimDepthSeries.w[i]; if (_aimDepthSeries.w[i] > 0.01) wN++; }
      // §CPE_AIM_DEPTH_BUILDUP candidate 2: report whether buildup-aware restriction actually engaged
      // this build, and on how many of the K probes — the number a live bake log should be read
      // against, not just "buildup was checked".
      var buildupOn = !!(A._cinemaPathEdit && A._cinemaPathEdit.buildup);
      var cursorOk = buildupOn ? (_aimBuildupCursorAt(0) != null) : null;
      console.log('§CPE_AIM_DEPTH_SERIES probes=' + (K + 1) + ' smoothed=2x5tap active=' + wN + '/' + (K + 1) +
        ' maxBlend=' + wMax.toFixed(2) + ' — mirror of §CPE_AIM_SERIES, opposite trigger (boxed-in, not empty)' +
        (buildupOn ? ' buildupAware=' + (cursorOk ? 'yes(restricted to placed elements)' : 'DEGRADED(no TM cursor yet, guard behaves as before)') : ''));
    }
    function _aimDepthAt(e3) {
      if (!_aimDepthSeries) _aimDepthBuild();
      var S = _aimDepthSeries, u = Math.max(0, Math.min(1, e3)) * S.K;
      var j = Math.min(S.K - 1, Math.floor(u)), f = u - j;
      return { w: S.w[j] * (1 - f) + S.w[j + 1] * f,
               // §CPE_STICK_HOLD: nearest-probe presence, deliberately NOT interpolated — `has` is a
               // yes/no fact about whether a subject was found, not a quantity to average.
               has: (f < 0.5 ? S.has[j] : S.has[j + 1]),
               x: S.x[j] * (1 - f) + S.x[j + 1] * f,
               y: S.y[j] * (1 - f) + S.y[j + 1] * f,
               z: S.z[j] * (1 - f) + S.z[j + 1] * f };
    }
    // §CPE_AIM_DEPTH_BUILDUP candidate 2 — read-only test/debug probe, same precedent as
    // cinema_path_editor.js's own `_probe*` hooks: exercises the REAL functions (never a
    // re-implementation) so a witness can assert against the product path directly.
    A._probeAimDepth = function(e3) {
      e3 = e3 == null ? 0 : e3;
      var p = _outPos(e3);
      var A0 = _aimDepthWeight(p, e3);
      if (!A0) return { fired: false, buildupOn: !!(A._cinemaPathEdit && A._cinemaPathEdit.buildup) };
      var sub = A0.w > 1e-4 ? _aimDepthSubject(A0.pIfc, A0.R, A0.cells) : null;
      var placedN = A0.cells ? A0.cells.reduce(function(s, c) { return s + c.n; }, 0) : null;
      return { fired: !!sub, w: A0.w, fwdClear: A0.fwdClear, clearM: A0.clearM, subject: sub,
               restricted: !!A0.cells, placedElems: placedN, cellCount: A0.cells ? A0.cells.length : null,
               buildupOn: !!(A._cinemaPathEdit && A._cinemaPathEdit.buildup) };
    };
    var _aimDepthLast = { logged: 0 };
    function _aimDepthApply(p, T, lx, ly, lz, e3, openU, boost) {
      // Same test-only switch as §CPE_AIM_DENSITY — no production effect, nothing sets it in the app.
      if (A.__cpeAimOff) return null;
      if (typeof A.ifc2three !== 'function' || typeof A.three2ifc !== 'function') return null;
      var A0 = _aimDepthAt(e3 == null ? 0 : e3);
      // §CPE_STICK_HOLD — same rescue and the same `has` gate as §CPE_AIM_DENSITY above.
      if (!A0 || !(Math.max(A0.w, (A0.has > 0.5 ? (boost || 0) : 0)) > 1e-3)) return null;
      var s3 = A.ifc2three(A0.x, A0.y, A0.z);
      var vx = s3.x - p.x, vy = s3.y - p.y, vz = s3.z - p.z;
      var vL = Math.hypot(vx, vy, vz) || 1;
      vx /= vL; vy /= vL; vz /= vL;
      var dot = vx * T.x + vy * T.y + vz * T.z;
      // Same fading (never switching) perpendicular projection as §CPE_AIM_DENSITY — that rule's own
      // comment records TWICE measuring that a hard switch here is the actual jerk source, not the
      // subject choice. Reused verbatim rather than re-risking the same mistake.
      var perpMag = Math.sqrt(Math.max(0, 1 - dot * dot));
      var k = _cinemaSmoothstep(Math.min(1, perpMag / 0.35));
      var px = vx - T.x * dot * k, py = vy - T.y * dot * k, pz = vz - T.z * dot * k;
      var pL = Math.hypot(px, py, pz) || 1;
      px /= pL; py /= pL; pz /= pL;
      // §CPE_AIM_LATCH — outgoing taper removed here for the same reason and by the same mechanism
      // as §CPE_AIM_DENSITY's above (Beat 4 now starts from _beat3EndDir). Kept as a named constant
      // rather than deleted inline so the log line below still reports what it is doing.
      var wSeam = 1;
      // §CPE_AIM_DEPTH_OPEN_TAPER (2026-07-31, user-reported live: "cam turning is too abrupt" —
      // measured via the caller's own §CPE_SEAM_CONTINUOUS witness, seamGapDeg=94.6-100.2, must be
      // ~0). §CPE_AIM_DENSITY already had the OUTGOING taper above (gone by walk→orbit); this rule
      // was missing the INCOMING one — the spin→walk seam (_openU/wOpen, computed by the caller
      // BEFORE either aim rule runs) eases the gaze from wherever the spin left off, but this rule
      // then overrode that eased direction at near-full strength from e3=0 (its own trigger
      // saturates almost everywhere on a dense building), discarding the handoff the instant it
      // happened. Same smoothstep-over-openU shape as the caller's own wOpen — zero rate at the seam.
      var wOpen2 = 1;
      if (e3 != null && openU > 1e-6 && e3 < openU) {
        wOpen2 = _cinemaSmoothstep(e3 / openU);
      }
      var w = Math.max(A0.w, (A0.has > 0.5 ? (boost || 0) : 0)) * wSeam * wOpen2;
      if (!(w > 1e-3)) return null;
      var ax = lx + (px - lx) * w, ay = ly + (py - ly) * w, az = lz + (pz - lz) * w;
      var aL = Math.hypot(ax, ay, az) || 1;
      var nowA = (typeof performance !== 'undefined') ? performance.now() : 0;
      if (nowA - _aimDepthLast.logged > 500) {
        _aimDepthLast.logged = nowA;
        console.log('§CPE_AIM_DEPTH e3=' + (e3 == null ? '?' : e3.toFixed(3)) +
          ' trigger=fwdClear subject=(' + A0.x.toFixed(1) + ',' +
          A0.y.toFixed(1) + ',' + A0.z.toFixed(1) + ')' +
          ' perpDeg=' + (Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI).toFixed(1) +
          ' blend=' + w.toFixed(2) + ' seamTaper=' + wSeam.toFixed(2) + ' openTaper=' + wOpen2.toFixed(2));
      }
      return { x: ax / aL, y: ay / aL, z: az / aL };
    }

    // ⚖ USER RULING 2026-07-27, SETTLED — do not re-derive, do not reintroduce a density term:
    //   "20% density, 80% noise ie rate of change"  →  then, final: "i would say its 100% rate of
    //   change of bbxes".
    // Their reason, verbatim: "because if frame not changing, not matter how dense the animation is
    // not moving makes a boring show". Density is NOT the signal: a dense corridor the camera
    // slides along without the view changing is a still, and lingering on it is the boredom, not
    // the craft. The signal is how fast the bbox neighbourhood CHANGES along the path — so the
    // brake fires at a roofline, a doorway, a wall crossing, and releases on a static frame however
    // full it is. Charging cost by it makes metres-per-frame fall exactly where the change is, so
    // the content crossing the frame per frame comes out EVEN: change is the integrand, even noise
    // is the invariant.
    // ⚖ And the saturation question, asked and answered by the user in the same breath: "when
    // outside building it changes as the building is far off, or it hits the max ... the
    // surrounding panaroma rate of change is consistent for formula. We are in a range, thus no
    // worry." Outside, the signal either flattens (nothing entering the neighbourhood) or pins at
    // the max — and BOTH are harmless because the cost multiplier is bounded by PACE_SWING either
    // way. So there is deliberately NO outside/inside special case, no panorama branch, and no
    // clamp beyond the one the range already provides. Do not add one.
    var NOISE_W_DENSITY = 0, NOISE_W_CHANGE = 1;
    // The dive is a straight LERP, so its arc and its gaze turn are both uniform in e — the blended
    // distance+turn cost that paces the walk is the IDENTITY here and can do nothing. Busyness is
    // the only term that varies along a dive, which is exactly why the user could still see this
    // beat ignoring the law. Cost per metre = 1 + (SWING-1)·busy, so the emptiest stretch runs at
    // most PACE_SWING times the speed of the busiest: the same single dial, the same provable
    // bound, no second knob.
    var _DV_N = 64, _dvC = null, _diveBusy = 0;
    (function _diveNoiseBuild() {
      var i, j, dens = [], series = [];
      var _dvR = _noiseRadius(Math.hypot(settle.x - camPos0.x, settle.y - camPos0.y, settle.z - camPos0.z));
      for (i = 0; i < _DV_N; i++) {
        var e = (i + 0.5) / _DV_N;
        dens.push(_densityAt({ x: camPos0.x + (settle.x - camPos0.x) * e,
                               y: camPos0.y + (settle.y - camPos0.y) * e,
                               z: camPos0.z + (settle.z - camPos0.z) * e }));
      }
      // Rate of change = the central difference of the density series. Both channels are
      // normalised by their OWN maximum, which is what makes this a RATIO (the user's word) rather
      // than a count with a machine-dependent scale — an empty dive and a dense one both span 0..1.
      var chg = [], dMax = 0, cMax = 0;
      for (i = 0; i < _DV_N; i++) {
        var a = dens[Math.max(0, i - 1)], b = dens[Math.min(_DV_N - 1, i + 1)];
        chg.push(Math.abs(b - a));
        if (dens[i] > dMax) dMax = dens[i];
        if (chg[i] > cMax) cMax = chg[i];
      }
      var c = [0], sum = 0, ns = 0, nMax = 0, nMin = 1;
      for (i = 0; i < _DV_N; i++) {
        var noise = NOISE_W_DENSITY * (dMax > 0 ? dens[i] / dMax : 0) +
                    NOISE_W_CHANGE  * (cMax > 0 ? chg[i] / cMax : 0);
        if (i % 8 === 0 || i === _DV_N - 1) series.push(((i + 0.5) / _DV_N).toFixed(2) + ':' + noise.toFixed(2));
        ns += noise; if (noise > nMax) nMax = noise; if (noise < nMin) nMin = noise;
        sum += 1 + (CINEMA_PACE_SWING - 1) * noise;
        c.push(sum);
      }
      if (sum > 1e-9) for (j = 0; j <= _DV_N; j++) c[j] /= sum;
      _dvC = c; _diveBusy = ns / _DV_N;
      var bMin = nMin, bMax = nMax;
      // The delivered speed ratio along the dive, stated as a number rather than claimed: the
      // emptiest sample runs (1+(SWING-1)·bMax)/(1+(SWING-1)·bMin) times faster than the busiest.
      // meshes= is the first thing to read when meanBusy is 0.000: MEASURED on Terminal in the
// headless rig, _cinemaFanMeshes() returns ZERO meshes, so every fan reports the CINEMA_FAN_FAR
      // sentinel, every §CINEMA_SPACE candidate reads enclosed=0%, and the settle falls back to
      // bbox-centre. A busyness of 0 then means "the fan is blind", NOT "the scene is empty" —
      // exactly the §CPE_LIVE rule that a no-hit is not a measurement. The law is inert there by
      // construction (a flat cost table is the identity remap), which is the correct behaviour, but
      // it must be visible rather than look like a passing measurement.
      console.log('§CPE_NOISE_LAW beat=dive src=bbox elems=' + _densPoints().length +
        ' w=' + NOISE_W_DENSITY + '/' + NOISE_W_CHANGE + ' (density/change)' +
        ' meanNoise=' + _diveBusy.toFixed(3) +
        ' busy=' + bMin.toFixed(2) + '..' + bMax.toFixed(2) + ' samples=' + _DV_N +
        ' swing=' + CINEMA_PACE_SWING +
        ' deliveredRange=' + ((1 + (CINEMA_PACE_SWING - 1) * bMax) / (1 + (CINEMA_PACE_SWING - 1) * bMin)).toFixed(2) + 'x' +
        ' series=[' + series.join(' ') + ']' +
        ' — frames spaced by busyness-weighted distance; the dive seconds below are bought by the same number');
    })();
    // Monotone inverse of the dive's cost table — same shape as _evenTurnRemap, one table each.
    function _diveRemap(u) {
      if (!_dvC) return u;
      u = Math.max(0, Math.min(1, u));
      var lo = 0, hi = _DV_N;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (_dvC[mid] <= u) lo = mid; else hi = mid; }
      var c0 = _dvC[lo], c1 = _dvC[hi], f = (c1 - c0 > 1e-12) ? (u - c0) / (c1 - c0) : 0;
      return (lo + Math.max(0, Math.min(1, f))) / _DV_N;
    }
    // §CPE_WALK_BUDGET_NOISE_BLIND (2026-08-01, user: "it shuld be controlled by that noise-speed
    // ratio we setup before to govern thruout"). The walk's SECONDS must see the same content-change
    // signal §CPE_NOISE_LAW already computes for the walk's FRAME SPACING (_evenTurnBuild below) —
    // not a new probe, the SAME central-difference-of-density measurement _densityAt/_noiseRadius
    // already give the dive, just evaluated here because _natSec (next block) needs the scalar
    // before it exists anywhere else.
    //
    // ⚠ Cannot call _beat3Pose(e) directly for this, despite it being the primitive named in the
    // correction — MEASURED by reading, not in the debugger: _beat3Pose reads _openU and _handDir,
    // and both are assigned INSIDE the block this IIFE runs before (_natSec needs _useSec.out, which
    // needs _natSec.out, which is what this scalar feeds). Calling it early would run its gaze blend
    // against two undefined values. It is not needed anyway: _cinemaGazeBlend returns x/y/z UNCHANGED
    // from the position it was given (see its `return { x: px, y: py, z: pz, ... }`), so
    // _beat3Pose(e).x/y/z is byte-identical to _outPos(e).x/y/z for every e — _outPos alone gives the
    // same positions this probe needs, and it has no such dependency (defined at L5005, before any of
    // this). Radius uses `totalLen` (the walk's own travel, already computed) rather than the 240-
    // sample arc length _evenTurnBuild measures later — the same choice the dive already makes
    // (_diveNoiseBuild above uses ITS OWN straight-line travel, not a beat-later refinement of it).
    var _wnkN = 32, _walkBusy = 0;
    (function _walkNoiseBuild() {
      var q, nz = [], nzC = [], nzMax = 0, rad = _noiseRadius(totalLen);
      for (q = 0; q <= _wnkN; q++) nz.push(_densityAt(_outPos(q / _wnkN), rad));
      for (q = 0; q <= _wnkN; q++) {
        var lo = nz[Math.max(0, q - 1)], hi = nz[Math.min(_wnkN, q + 1)];
        nzC.push(Math.abs(hi - lo));
        if (nzC[q] > nzMax) nzMax = nzC[q];
      }
      if (nzMax > 0) {
        var sum = 0;
        for (q = 0; q < nzC.length; q++) sum += nzC[q];
        _walkBusy = (sum / nzC.length) / nzMax;
      }
      console.log('§CPE_NOISE_LAW beat=walk-budget src=bbox probes=' + (_wnkN + 1) +
        ' radius=' + rad.toFixed(1) + 'm elems=' + _densPoints().length +
        ' meanBusy=' + _walkBusy.toFixed(3) + ' maxChange=' + nzMax +
        ' swing=' + CINEMA_PACE_SWING +
        ' — the walk SECONDS below are bought by this number, the same signal that already spaces its frames');
    })();
    // ⚠ §CPE_SEAM_CONTINUOUS — DO NOT add a pitch term to _spinDeg. It was tried this session and
    // reverted: pricing the walk's opening pitch into the spin makes the spin's DURATION depend on
    // the authored path, which shifts every beat fraction before it and breaks G2's "an edit
    // changes nothing before it". _spinDeg stays yaw-only, and the pitch handoff is paid inside the
    // WALK instead (see _beat3Pose's opening blend). This comment previously described the reverted
    // version as if it had shipped — it had not.
    // §CPE_SEAM_CONTINUOUS — the direction the walk WANTS to open on, and the direction the spin
    // actually hands over (level, on the spin's final bearing). The gap between them was being paid
    // in ONE frame at the Beat2->3 seam: MEASURED 81 deg on Terminal, and it did NOT shrink when
    // sampled at 100x density, so it was a true discontinuity that no pacing could ever spread.
    // It is closed inside the WALK (see _beat3Pose) rather than inside the spin, because the walk
    // already owns thousands of frames while the spin's length is derived from its own yaw — paying
    // for it in the spin would make the spin's DURATION depend on the authored path, which shifts
    // every beat fraction before it and breaks G2's "an edit changes nothing before it".
    var _openDir = { x: (_wkA0.x - _wkP0.x) / _wkL, y: _wkDy / _wkL, z: (_wkA0.z - _wkP0.z) / _wkL };
    // §CPE_SPIN_WHIP defect 2 — this used to read `Math.min(180, ...)`. The cap WAS the defect: the
    // spin flew 523 degrees and was billed for 180, the fourth instance of the budget-on-one-number /
    // motion-on-another family (§CPE_HOSE_LENGTH_BLIND, §CPE_WALK_BUDGET_NOISE_BLIND, the dive's
    // envelope cap). Removing it cannot produce a runaway now that defect 1 bounds the motion at 360
    // structurally: the old worst case was 523/45 = 11.6s, the new one is 240/45 = 5.3s.
    var _spinDeg = Math.abs(dYaw) * 180 / Math.PI;
    // §CPE_SPIN_WHIP defect 3 — the spin was the LAST beat with no noise term, in a law the user
    // settled as "it governs thrughout" (§CPE_NOISE_LAW). The dive and the walk below both carry
    // `* (1 + (SWING-1)*busy)`; the spin did not.
    //
    // The measurement problem this solves: the spin TRANSLATES ZERO METRES, so _densityAt(settle) is
    // a constant and the dive's line-probe shape cannot be reused as-is — sampling the same point 32
    // times reads maxChange=0 and the term is inert (the exact failure _noiseRadius' own comment
    // records for the walk at a fixed 60m radius). What DOES change is the neighbourhood the gaze
    // sweeps THROUGH. So probe the ARC exactly as the dive probes its line: points on a ring around
    // `settle` at the bearings the spin actually passes through, same _densityAt, same normalised
    // mean |central difference|, same CINEMA_PACE_SWING dial. No new constant.
    //
    // The radius is the EXISTING rule (_noiseRadius = half the beat's own travel, capped at the fan
    // horizon) applied to the spin's own travel — the arc the gaze sweeps at the fan horizon,
    // |dYaw| * CINEMA_FAN_FAR. Derived from the beat, not picked: a 20-degree turn reads a tight
    // neighbourhood, a 240-degree sweep reads out to the horizon.
    var _SPN_N = 32, _spinBusy = 0, _spinRad = _noiseRadius(Math.abs(dYaw) * CINEMA_FAN_FAR);
    (function _spinNoiseBuild() {
      if (Math.abs(dYaw) < 1e-6) return;   // no-spin class: no arc to probe, busy stays 0
      var q, nz = [], nzC = [], nzMax = 0;
      for (q = 0; q <= _SPN_N; q++) {
        var th = yaw0 + dYaw * (q / _SPN_N);
        nz.push(_densityAt({ x: settle.x + Math.cos(th) * _spinRad, y: settle.y,
                             z: settle.z + Math.sin(th) * _spinRad }, _spinRad));
      }
      for (q = 0; q <= _SPN_N; q++) {
        var lo = nz[Math.max(0, q - 1)], hi = nz[Math.min(_SPN_N, q + 1)];
        nzC.push(Math.abs(hi - lo));
        if (nzC[q] > nzMax) nzMax = nzC[q];
      }
      if (nzMax > 0) {
        var sum = 0;
        for (q = 0; q < nzC.length; q++) sum += nzC[q];
        _spinBusy = (sum / nzC.length) / nzMax;
      }
      console.log('§CPE_NOISE_LAW beat=spin-budget src=bbox-arc probes=' + (_SPN_N + 1) +
        ' radius=' + _spinRad.toFixed(1) + 'm elems=' + _densPoints().length +
        ' meanBusy=' + _spinBusy.toFixed(3) + ' maxChange=' + nzMax +
        ' swing=' + CINEMA_PACE_SWING +
        ' — the spin translates 0m, so its rate-of-change is read along the ARC the gaze sweeps');
    })();
    var _spinBusyMult = 1 + (CINEMA_PACE_SWING - 1) * _spinBusy;
    // ══ §CPE_STICK_HOLD — a per-stick dwell, in seconds ═════════════════════════════════════════
    // User, 2026-08-01: "putting hold at 1 sec (put that as default for the last stick) will teach
    // them 'ah, it slows a sec stop a sec, then ease out while the cam is turning to the building'".
    //
    // AUTHORED TIME. Collected here, BEFORE the noise multiplier is applied to the walk below, and
    // added AFTER it — a hold is a number the user typed, so scaling it by measured busyness would
    // make the panel lie about its own field. This is the §CPE_HOSE_LENGTH_BLIND family's rule
    // (budget one number, motion another) applied before it can bite a fifth time.
    // §CPE_SETTLE_HOLD (2026-08-04): band 0 ("settle" — where the dive lands, before the walk
    // begins) is excluded here and read separately below for the SPIN beat instead. It used to be
    // swept into this loop like every other band, which put its typed seconds into `out` (the
    // WALK's duration) — a number added somewhere the camera never visibly pauses, while the
    // ACTUAL settle pause was a fixed, unconfigurable floor (CINEMA_SPIN_MIN_SEC) the user's Hold
    // field had no effect on at all. `_holds`/`_holdTotal` now cover only the interior walk
    // (bands 1..N-1, including "stop" — the walk's own end point, unlike "settle").
    var _holds = [], _holdTotal = 0;
    if (_cpeBands && _cpeBands.length >= 2) {
      for (var _hb = 1; _hb < _cpeBands.length; _hb++) {
        var _hv = +(_cpeBands[_hb].hold || 0);
        if (isFinite(_hv) && _hv > 0.01) {
          _holds.push({ band: _hb, sec: _hv, c: _cpeBands[_hb].c });
          _holdTotal += _hv;
        }
      }
    }
    var _settleHoldSec = (_cpeBands && _cpeBands.length && isFinite(+_cpeBands[0].hold)) ? Math.max(0, +_cpeBands[0].hold) : 0;
    var _walkTurnDegVal = _walkTurnDeg();
    // ══ §CPE_DISCIPLINE_REVEAL_PULLOUT — the pull-out + repeated-lap restructure (2026-08-14) ═════
    // Spec: bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md, dated section "pull-out restructure".
    // Supersedes the there-and-back Mechanism C shape: NO backward retrace. Camera arrives at the
    // last stick (tO, end of round 1), does a brief pull-out (tP), then flies the SAME path again
    // forward (round 2, tV), then the disc-parade tail — folded into the EXISTING rise beat's own
    // time budget, not a separate beat (see _natSec.rise below and poseAt). A.cpeRevealDiscsPresent
    // (outer scope) is shared with cinema_path_editor.js's own duration estimate (_naturalDuration)
    // — one discipline-count implementation, not two kept in sync by hand.
    var _revealPulloutSec = 0, _revealFlybackSec = 0, _revealRoundSec = 0, _revealTailSec = 0, _revealDiscs = [], _revealQtyCost = {};
    if (_cpeReveal) {
      _revealDiscs = A.cpeRevealDiscsPresent();
      if (_revealDiscs.length) {
        // Pull-out: fixed 1.5s (CINEMA_REVEAL_PULLOUT_SEC, author's call — see the constant's own
        // comment). §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16, bim-compiler prompts/
        // CINEMA_DISCIPLINE_REVEAL.md's dated section): retraces the SAME walked path backward
        // (f:1->0) at CINEMA_PULLBACK_MPS ("flying, not walking" — reused, not a new speed invented)
        // to smooth the old teleport-cut back onto the first stick. Round 2: same pace as the
        // outbound walk, ONE lap forward only — no there-and-back, no authored holds replayed
        // (matches the original Mechanism C's own "not requested" note). Tail: ~2s/discipline + a
        // final 2s all-together — KEPT (see spec file's dated section for why the all-together slot
        // was kept rather than dropped: the user asked for it repeatedly elsewhere in this file's
        // own history, e.g. the ORIGIN ask and the Mechanism B pacing quote).
        _revealPulloutSec = CINEMA_REVEAL_PULLOUT_SEC;
        _revealFlybackSec = totalLen / CINEMA_PULLBACK_MPS;
        _revealRoundSec = totalLen / CINEMA_WALK_MPS;
        _revealTailSec = 2 * _revealDiscs.length + 2;
        _revealQtyCost = A.cpeRevealDiscQtyCost ? A.cpeRevealDiscQtyCost(_revealDiscs) : {};
        console.log('§CPE_REVEAL_ROUND on pulloutSec=' + _revealPulloutSec.toFixed(1) + ' flybackSec=' +
          _revealFlybackSec.toFixed(1) + ' round2Sec=' + _revealRoundSec.toFixed(1) + ' tailSec=' +
          _revealTailSec.toFixed(1) + ' discs=[' + _revealDiscs.join(',') + '] totalSec=' +
          (_revealPulloutSec + _revealFlybackSec + _revealRoundSec + _revealTailSec).toFixed(1));
      } else {
        console.log('§CPE_REVEAL_ROUND skipped — no non-ARC/STR discipline present in this building');
      }
    }
    var _natSec = {
      // §CPE_NOISE_LAW, second half — the same ratio that spaces the frames also BUYS the seconds
      // ("where sudden diff is adverse noise impact and introduce frames to smoothen", the user's
      // rule). A dive that ends deep inside a busy building buys up to PACE_SWING times the seconds
      // of one that drops into an empty yard; redistribution alone could never do this, because with
      // the frame count fixed the mean speed is fixed whatever the parameterization does.
      // §CPE_WALK_BUDGET_NOISE_BLIND CORRECTION (2026-08-01) — this used to say the walk already got
      // this treatment "via _walkTurnDeg". It did not: _walkTurnDeg prices GEOMETRY (degrees turned),
      // not CONTENT (rate of change), so two equal-length equal-turning walks through empty and dense
      // areas billed identically. `out` below now carries the same `* (1 + (SWING-1)*busy)` factor
      // the dive uses, with busy = _walkBusy from _walkNoiseBuild above.
      dive:  Math.max(CINEMA_DIVE_MIN_SEC, _diveEff / CINEMA_DIVE_MPS * (1 + (CINEMA_PACE_SWING - 1) * _diveBusy)),
      // §CPE_SPIN_WHIP — the angle ACTUALLY flown (no 180 cap), at the same rate every other turn in
      // the film is charged, times the same noise multiplier the dive and walk carry.
      // §CPE_SETTLE_HOLD (2026-08-04, corrected): no floor at all — real turn time plus whatever the
      // user typed into the Settle band's Hold field (`_settleHoldSec` above). Both zero -> 0s beat.
      spin:  (_spinDeg / CINEMA_TURN_DPS * _spinBusyMult) + _settleHoldSec,
      // §CPE_WALK_BUDGET_NOISE_BLIND — same shape as the dive above, one law every beat. The `/3`
      // that used to inflate the turn charge as a stand-in for busyness is GONE: a degree now costs
      // CINEMA_TURN_DPS, exactly as the comment above _walkTurnDeg already claims, and busyness
      // (measured, not assumed) does the job the `/3` was faking.
      // §CPE_STICK_HOLD: `+ _holdTotal` sits OUTSIDE the multiplier on purpose — travel is priced by
      // the noise law, a typed hold is priced at face value. Amends §CINEMA_PATH_EDITOR_MODEL rule 9
      // ("constant speed"): speed is constant EXCEPT at authored holds, which is the point of them.
      out:   (totalLen / CINEMA_WALK_MPS + _walkTurnDegVal / CINEMA_TURN_DPS) *
             (1 + (CINEMA_PACE_SWING - 1) * _walkBusy) + _holdTotal,
      // §CPE_DISCIPLINE_REVEAL_PULLOUT: none of pullout/flyback/reveal(round2)/tail are ever part
      // of the user-typed total-seconds override system (no field for any of them in the panel) —
      // always these measured values, computed just above, 0 when off/empty.
      pullout: _revealPulloutSec,
      flyback: _revealFlybackSec,       // §CPE_DISCIPLINE_REVEAL_FLYBACK: retrace back to the first stick
      reveal: _revealRoundSec,          // round 2's own seconds — the repeated forward lap only
      tail:   _revealTailSec,           // folded into `rise` below, not its own beat boundary
      rise:  Math.max(0.5, _pullDist / CINEMA_PULLBACK_MPS),
      orbit: 360 / CINEMA_TURN_DPS
    };
    var _natTotal = _natSec.dive + _natSec.spin + _natSec.out + _natSec.pullout + _natSec.flyback +
                    _natSec.reveal + _natSec.tail + _natSec.rise + _natSec.orbit;
    // Whitebox proof for §CPE_WALK_BUDGET_NOISE_BLIND — every term the formula reads, printed
    // together so a witness can recompute `out` from this line alone and compare against
    // _natSec.out, rather than trusting the arithmetic happened as claimed.
    console.log('§CPE_WALK_BUDGET_NOISE_BLIND totalLen=' + totalLen.toFixed(2) + 'm walkMps=' + CINEMA_WALK_MPS +
      ' turnDeg=' + _walkTurnDegVal.toFixed(1) + ' turnDps=' + CINEMA_TURN_DPS +
      ' travelSec=' + (totalLen / CINEMA_WALK_MPS).toFixed(3) + ' turnSec=' + (_walkTurnDegVal / CINEMA_TURN_DPS).toFixed(3) +
      ' rawSec=' + (totalLen / CINEMA_WALK_MPS + _walkTurnDegVal / CINEMA_TURN_DPS).toFixed(3) +
      ' busy=' + _walkBusy.toFixed(3) + ' swing=' + CINEMA_PACE_SWING +
      ' busyMult=' + (1 + (CINEMA_PACE_SWING - 1) * _walkBusy).toFixed(4) +
      ' outSec=' + _natSec.out.toFixed(3));
    // §CPE_SPIN_WHIP — the same whitebox treatment the walk got: every term the spin's budget reads,
    // printed together, so a witness recomputes spinSec from THIS LINE ALONE and compares against
    // _natSec.spin rather than trusting the arithmetic happened as claimed. `flownDeg` is the angle
    // the camera actually turns (was capped at 180 while the motion ran to 523 — the whole defect),
    // so `flownDeg == |finalSpinDeg| from §CINEMA_SPIN` is itself a checkable invariant.
    console.log('§CPE_SPIN_WHIP flownDeg=' + _spinDeg.toFixed(1) + ' ceilingDeg=360' +
      ' turnDps=' + CINEMA_TURN_DPS + ' rawSec=' + (_spinDeg / CINEMA_TURN_DPS).toFixed(3) +
      ' busy=' + _spinBusy.toFixed(3) + ' swing=' + CINEMA_PACE_SWING +
      ' busyMult=' + _spinBusyMult.toFixed(4) + ' minSec=0(no-floor) settleHoldSec=' + _settleHoldSec.toFixed(3) +
      ' spinSec=' + _natSec.spin.toFixed(3));
    // An explicit override (the editor's "set the total") scales the whole film uniformly; the SHAPE
    // is geometric either way, so the beat fractions are derived-seconds over the natural total and
    // do not depend on durationSec at all. That is what makes "key 20s and everything speeds up
    // uniformly" true by construction.
    var _useSec = _cpeSecOverride
      ? { dive: CINEMA_DIVE_SEC, spin: CINEMA_SPIN_SEC, out: CINEMA_OUT_SEC, rise: CINEMA_RISE_SEC,
          orbit: _natSec.orbit, reveal: _natSec.reveal, pullout: _natSec.pullout,
          flyback: _natSec.flyback, tail: _natSec.tail }
      : _natSec;
    // The pose Beat 2 ends on: level, on the spin's final bearing. Beat 3 must START here.
    var _handYaw = yaw0 + dYaw;
    var _handDir = { x: Math.cos(_handYaw), y: 0, z: Math.sin(_handYaw) };
    var _openDeg = Math.acos(Math.max(-1, Math.min(1,
      _handDir.x * _openDir.x + _handDir.y * _openDir.y + _handDir.z * _openDir.z))) * 180 / Math.PI;
    // How much of the walk the handoff needs, at the project's OWN established turn rate
    // (CINEMA_TURN_DPS — the rate the spin and the orbit lap already use). Not a new constant, and
    // not a fraction picked to make a gate green: it is "how long a graceful turn of this size
    // takes", expressed as a share of the walk's own seconds.
    var _openU = Math.min(1, (_openDeg / CINEMA_TURN_DPS) / Math.max(1e-6, _useSec.out));
    console.log('§CPE_SEAM_CONTINUOUS openDeg=' + _openDeg.toFixed(1) + ' openU=' + _openU.toFixed(4) +
      ' (~' + (_openU * _useSec.out).toFixed(2) + 's of the ' + _useSec.out.toFixed(1) +
      's walk) handoffYawDeg=' + (_handYaw * 180 / Math.PI).toFixed(1));
    // §CPE_DISCIPLINE_REVEAL_PULLOUT — the tail's seconds fold into the RISE beat's SHAPE budget
    // (`_riseFolded`, used only for `_shapeTotal`/tR below) without ever mutating `_useSec.rise`
    // itself. This is what makes the tail's slow-down "blend into" the EXISTING pull-back/rise
    // motion (spec's own words) instead of inventing a second camera behaviour: poseAt's Beat 4
    // branch runs the SAME unmodified _beat4Pose/_cinemaEaseFloored formula across the now-larger
    // [tV,tR] span, so the SAME pull-back distance is covered over MORE time — average speed is
    // measurably, continuously lower for exactly as long as captions are cycling (never frozen —
    // "not pause"), then the beat naturally regains its normal pace for the true rise/orbit hand-off.
    // ⚠ BUG FOUND WHILE TRACING THIS (not shipped): mutating `_useSec.rise` in place — the first cut
    // of this fold — silently poisoned the round-trip the editor depends on. `plan.sec.rise` feeds
    // cinema_path_editor.js's `s.baseSec.rise`, which `_buildOverride()` echoes straight back as the
    // NEXT plan's `riseSec` override; on every REOPEN of an already-saved reveal=ON path (the plan
    // handed to the editor already has _cpeReveal true, per `A._cinemaPathEdit`), that echoed value
    // would already be folded, and folding it AGAIN here double-counts the tail — measurably growing
    // the rise beat on every re-edit. `_riseFolded` keeps the fold entirely local to `_shapeTotal`/tR;
    // `_useSec.rise` (and therefore `sec.rise`/`naturalSec.rise`) stays the TRUE unfolded pull-back
    // budget always, safe to round-trip through the override channel any number of times.
    var _riseFolded = _useSec.rise + (_useSec.tail || 0);
    var _shapeTotal = _useSec.dive + _useSec.spin + _useSec.out + _useSec.pullout + _useSec.flyback +
                       _useSec.reveal + _riseFolded + _useSec.orbit;
    var tD = _useSec.dive / _shapeTotal;
    var tS = tD + _useSec.spin / _shapeTotal;
    var tO = tS + _useSec.out / _shapeTotal;
    // §CPE_DISCIPLINE_REVEAL_PULLOUT: tP is the pull-out sub-beat's own end boundary.
    // §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16): tF is the fly-back's own end boundary — the
    // instant the camera is back on the first stick, replacing the old teleport cut that used to
    // sit right at tP. tV is round 2's own end boundary (the SECOND arrival at the last stick — the
    // real "STOP", per the spec). useSec.pullout/flyback/reveal are all 0 when off or when the
    // building has no non-ARC/STR discipline, which makes tP===tF===tV===tO exactly — every poseAt
    // branch below becomes zero-width and unreachable, and tR (below) folds in a 0 tail too, so an
    // off/empty-building film is byte-identical to before this feature existed (Guardrail 2).
    var tP = tO + _useSec.pullout / _shapeTotal;
    var tF = tP + _useSec.flyback / _shapeTotal;
    var tV = tF + _useSec.reveal / _shapeTotal;
    var tR = tV + _riseFolded / _shapeTotal;   // folded (includes the tail) — see _riseFolded above
    console.log('§CINEMA_PACING natural=' + _natTotal.toFixed(1) + 's = dive ' + _natSec.dive.toFixed(1) +
      ' + spin ' + _natSec.spin.toFixed(1) + ' + walk ' + _natSec.out.toFixed(1) +
      ' + pullout ' + _natSec.pullout.toFixed(1) + ' + flyback ' + _natSec.flyback.toFixed(1) +
      ' + round2 ' + _natSec.reveal.toFixed(1) + ' + tail ' + _natSec.tail.toFixed(1) +
      ' + pullback ' + _natSec.rise.toFixed(1) + ' + orbit ' + _natSec.orbit.toFixed(1) +
      '  (walk ' + totalLen.toFixed(1) + 'm @' + CINEMA_WALK_MPS + 'm/s, dive ' + diveDist.toFixed(1) +
      'm @' + CINEMA_DIVE_MPS + 'm/s, pullback ' + _pullDist.toFixed(1) + 'm @' + CINEMA_PULLBACK_MPS +
      'm/s, dive raw ' + diveDist.toFixed(0) + 'm capped to envelope ' + _diveEff.toFixed(0) +
      'm, spin ' + _spinDeg.toFixed(0) + 'deg flown @' + CINEMA_TURN_DPS + 'deg/s x' +
      _spinBusyMult.toFixed(2) + ' busy)' +
      ' override=' + _cpeSecOverride + ' running=' + durationSec.toFixed(1) + 's');
    console.log('§CINEMA_BEATS dive=' + tD.toFixed(3) + ' spin=' + tS.toFixed(3) + ' out=' + tO.toFixed(3) +
      ' pullout=' + tP.toFixed(3) + ' flyback=' + tF.toFixed(3) + ' round2=' + tV.toFixed(3) +
      ' rise=' + tR.toFixed(3) + ' turnOverlap=' + CINEMA_TURN_OVERLAP +
      ' (dur=' + durationSec.toFixed(1) + 's) route=' + outRoute +
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
      // cpeOrbitDY: the elastic height offset from the authored stop row (§CINEMA_PATH_EDITOR).
      // Additive on the whole loop, so the orbit rides higher or lower while keeping every shape
      // rule above — tilt easing, flat ending, pull-back — exactly as derived. Zero when nothing is
      // authored, so this line is a no-op on the default path.
      return { x: pivot.x + hr * Math.cos(az), y: pivot.y + radius * Math.sin(tilt) + cpeOrbitDY,
               z: pivot.z + hr * Math.sin(az), tx: pivot.x, ty: pivot.y, tz: pivot.z };
    }
    var orbitStart = _orbitPose(0);

    // §CINEMA_TURN_SLERP (2026-07-26 — PHOTOREAL_STILL_RENDER.md §CINEMA_TURN_SLERP). Implementing
    // §CINEMA_TURN_SLERP "the fix" — Witness: witness_cinema_exit_breathe.js G3.
    // Both look-back blends used to LERP THE LOOK-AT POINT from "20m ahead" toward the pivot. On a
    // straight walk-out the pivot sits exactly 180° BEHIND, so that segment runs back THROUGH the
    // camera. Measured on Duplex: the gaze azimuth held 132.3° dead flat all the way in while the
    // gaze distance collapsed 20m → 1.5m, then INVERTED to −47.7° in a single frame. The camera
    // never turned — it snapped, and that one frame is the user's "the camera rush and turns too
    // rapidly". §CINEMA_TIMING_672's wider lookahead spread the CORNER whip; it could not touch
    // this one, because this one is not a corner — it is the look-at point crossing the camera.
    // Rotating the DIRECTION at a fixed 20m range cannot do it: the target never approaches the
    // camera, so there is no singularity left to whip through.
    function _cinemaGazeBlend(px, py, pz, dx, dy, dz, w) {
      var pdx = pivot.x - px, pdy = pivot.y - py, pdz = pivot.z - pz;
      var yawA = Math.atan2(dz, dx),   pitA = Math.atan2(dy, Math.hypot(dx, dz));
      var yawB = Math.atan2(pdz, pdx), pitB = Math.atan2(pdy, Math.hypot(pdx, pdz));
      var raw = yawB - yawA;
      // Dead-antipodal leaves the short way undefined, and on a radial walk-out that is the NORMAL
      // case. Take the + way, which is the direction the exterior orbit itself turns
      // (az = exitAz + _cinemaAzU(u)*2π), so look-back and orbit rotate together. Kept as a modulo
      // of the RAW delta, not a hardcoded +π, so w=1 still lands EXACTLY on the pivot bearing —
      // that exactness is what keeps the Beat 4 → _orbitPose(0) handoff free of a kink.
      // §CINEMA_GAZE_SENSE: take the representative of `raw` NEAREST the per-plan reference delta,
      // rather than wrapping to (-π,π] and then step-testing for antipodal. Wrapping is
      // discontinuous wherever yawB-yawA crosses ±π, and the step test is discontinuous at its own
      // threshold — either one snaps the gaze by 2π × w on the frame it flips. Choosing the nearest
      // representative is continuous as long as the walk direction moves less than π within the
      // blend, which it always does, and it still lands EXACTLY on the pivot bearing at w=1
      // (yawA + (yawB - yawA + 2πk) = yawB modulo a full turn) — the exactness Beat 4's handoff
      // to _orbitPose(0) depends on.
      var dYaw = raw - 2 * Math.PI * Math.round((raw - _gazeRefD) / (2 * Math.PI));
      var yaw = yawA + dYaw * w, pit = pitA + (pitB - pitA) * w, cp = Math.cos(pit);
      return { x: px, y: py, z: pz,
               tx: px + Math.cos(yaw) * 20 * cp, ty: py + Math.sin(pit) * 20, tz: pz + Math.sin(yaw) * 20 * cp };
    }

    function poseAt(tNorm) {
      tNorm = Math.max(0, Math.min(1, tNorm));
      if (tNorm <= tD) {
        // ── Beat 1: the 4s ease IN. Position → the settle point; PITCH → level; HEIGHT → eye
        // level; HEADING **UNTOUCHED**. That last one is load-bearing (§CINEMA_SIMPLE call 1): the
        // exit is chosen at t=4s by position AND facing, so if the ease were free to re-aim you at
        // the space centre, every film on a building would face the same way here, pick the same
        // door, and the whole feature would collapse to one film per building.
        // §CPE_NOISE_LAW: the dive's progress is the eased time fraction run through the busyness
        // cost table, exactly as Beat 3's is run through _evenTurnRemap. Empty sky is crossed fast,
        // the arrival into the building slows — without either end of the beat losing its ease, so
        // the seams stay as smooth as they were.
        var e = _diveRemap(_cinemaEaseFloored(tD > 0 ? tNorm / tD : 1));
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
        // §CPE_EVEN_TURN: the frame's progress along the walk is no longer the eased TIME fraction
        // — it is that fraction run through _evenTurnRemap, which spaces frames evenly in the
        // blended distance+turn metric instead of evenly in distance. See the remap's own comment.
        // §CPE_STICK_HOLD: _holdMap converts the beat's own time fraction (which now INCLUDES the
        // authored dwell) into the travel-time fraction the existing chain expects. Identity when
        // no hold is set, so this is a no-op on every path that has none.
        var w3 = (tNorm - tS) / Math.max(1e-6, tO - tS);
        var e3 = _evenTurnRemap(_cinemaEaseFloored(_holdMap(w3)));
        var p3f = _beat3Pose(e3, w3);
        // §CPE_GAZE_CONSTANT_RATE: position is whatever the walk says; the DIRECTION is the
        // rate-limited one. Splitting them here (rather than inside _beat3Pose) keeps that function
        // the raw signal the cost table samples, so §CPE_EVEN_TURN still measures turn DEMAND.
        var g3 = _gazeRateAt(_spanFracOf(tNorm));
        if (!g3) return p3f;
        return { x: p3f.x, y: p3f.y, z: p3f.z,
                 tx: p3f.x + g3.x * 20, ty: p3f.y + g3.y * 20, tz: p3f.z + g3.z * 20 };
      }
      if (tNorm <= tP) {
        // ── §CPE_DISCIPLINE_REVEAL_PULLOUT: the brief pull-out/dolly-back sub-beat, ONLY when
        // _cpeReveal is on. tP===tO (zero-width, unreachable — the tNorm<=tO branch above already
        // caught everything up to here) whenever reveal is off or the building has no non-ARC/STR
        // discipline, so an off/empty-building film never enters this branch and is byte-identical
        // to before this feature existed.
        return _pullOutPose((tNorm - tO) / Math.max(1e-6, tP - tO));
      }
      if (tNorm <= tF) {
        // ── §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16): fast eased retrace back onto the first
        // stick, replacing the old teleport cut that used to sit right here. tF===tP (zero-width,
        // unreachable) under the same off/empty conditions as tP above.
        return _flyBackPose((tNorm - tP) / Math.max(1e-6, tF - tP));
      }
      if (tNorm <= tV) {
        // ── §CPE_DISCIPLINE_REVEAL_PULLOUT: round 2 — the SAME path flown again, forward only, no
        // retrace. Now starts CLEAN (the fly-back above already put the camera on the first stick),
        // no cut. tV===tF (zero-width, unreachable) under the same off/empty conditions as tP above.
        return _revealPose((tNorm - tF) / Math.max(1e-6, tV - tF));
      }
      if (tNorm <= tR) {
        // ── Beat 4: turn around to face the building and rise onto the orbit band. Ends EXACTLY
        // on _orbitPose(0), which is what keeps the handoff continuous (the old Act III handoff
        // did not, and measured a ~10.8m single-frame step at t≈0.80). The look-at picks up from
        // CINEMA_TURN_OVERLAP_MAX (where Beat 3 left it) rather than restarting at 0 — see above.
        // Boundary is tV, not tO — tV===tO when the reveal round is off/empty, so this formula
        // reduces to today's exactly when there's nothing inserted before it. §CPE_DISCIPLINE_
        // REVEAL_PULLOUT (2026-08-14): this code is UNCHANGED from before the restructure — the
        // disc-parade tail is folded into [tV,tR]'s own (now larger) time budget rather than a new
        // beat, so the SAME e4/_beat4Pose formula covers the same pull-back distance over more
        // seconds, which is the tail's entire "slows down" effect (see _useSec.rise's own comment
        // above — no new camera motion invented for the tail).
        var e4 = _cinemaEaseFloored((tNorm - tV) / Math.max(1e-6, tR - tV));
        var p4f = _beat4Pose(e4);
        // §CPE_GAZE_CONSTANT_RATE spans Beat 3 AND Beat 4 — see _gazeRateBuild. MEASURED: limiting
        // only the walk moved the whip rather than removing it (Terminal 4.1 -> 34.9 deg/frame at
        // u=0.645, which is just past `out` — i.e. INSIDE Beat 4). Beat 4 is where the gaze swings
        // from wherever the aim left it onto the pivot bearing, so it needs the same bound.
        var g4 = _gazeRateAt(_spanFracOf(tNorm));
        if (!g4) return p4f;
        return { x: p4f.x, y: p4f.y, z: p4f.z,
                 tx: p4f.x + g4.x * 20, ty: p4f.y + g4.y * 20, tz: p4f.z + g4.z * 20 };
      }
      return _tailPose(tNorm);
    }
    // ══ §CPE_DISCIPLINE_REVEAL_PULLOUT — pull-out + repeated forward lap (2026-08-14) ══════════════
    // Spec: bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md, dated "pull-out restructure" section.
    // Supersedes the old Mechanism C there-and-back: no backward retrace exists any more. Position
    // reuses _outPos(f) — the SAME curve Beat 3 walks. Deliberately does NOT reuse _beat3Pose's
    // hold/pin/aim-depth machinery — kept isolated per this file's header rule ("touches
    // _cinemaPathPlan as little as possible"), same reasoning the original build already established.
    // Generic gaze-blend helper (same yaw/pitch-lerp technique _cinemaGazeBlend already uses,
    // generalized to an explicit target direction instead of always the pivot — this round looks
    // along the WALK, not at the building centre).
    function _dirBlend(px, py, pz, axd, ayd, azd, bxd, byd, bzd, w) {
      var yawA = Math.atan2(azd, axd), pitA = Math.atan2(ayd, Math.hypot(axd, azd));
      var yawB = Math.atan2(bzd, bxd), pitB = Math.atan2(byd, Math.hypot(bxd, bzd));
      var raw = yawB - yawA;
      var dYaw = raw - 2 * Math.PI * Math.round(raw / (2 * Math.PI));
      var yaw = yawA + dYaw * w, pit = pitA + (pitB - pitA) * w, cp = Math.cos(pit);
      return { x: px, y: py, z: pz,
               tx: px + Math.cos(yaw) * 20 * cp, ty: py + Math.sin(pit) * 20, tz: pz + Math.sin(yaw) * 20 * cp };
    }
    function _revealTravelDir(f, dir) {
      var eps = 1 / 64;
      var pA = _outPos(Math.max(0, f - eps)), pB = _outPos(Math.min(1, f + eps));
      var vx = (pB.x - pA.x) * dir, vy = (pB.y - pA.y) * dir, vz = (pB.z - pA.z) * dir;
      var vL = Math.hypot(vx, vy, vz);
      if (vL < 1e-6) return { x: _beat3EndDir.x, y: _beat3EndDir.y, z: _beat3EndDir.z };
      return { x: vx / vL, y: vy / vL, z: vz / vL };
    }
    // §CPE_GAZE_CONSTANT_RATE interaction (found while witnessing the original build, real MEASURED
    // jump — not assumed): Beat 3/4's ACTUAL rendered gaze at a beat boundary is the RATE-LIMITED
    // signal (_gazeRateAt(_spanFracOf(tNorm))), not the raw _beat3EndDir — the limiter can lag behind
    // the raw signal on a fast turn. Anchoring seam blends to raw _beat3EndDir measured a 63deg
    // instantaneous jump at the tO seam on Duplex (witness_cpe_reveal_round.js). Anchor to what is
    // ACTUALLY on screen at that instant instead.
    function _revealSeamDir(tNorm) {
      var g = _gazeRateAt(_spanFracOf(tNorm));
      return g || _beat3EndDir;
    }
    // First-guess tuning knob (flagged in the original spec, not re-measured for this restructure) —
    // the fraction of round 2 spent blending across its END seam (travel-tangent -> Beat 4's actual
    // e4=0 gaze) instead of pure travel-tangent gaze, so Beat 4's hand-off picks up with zero kink.
    var CPE_REVEAL_SEAM_FRAC = 0.08;
    // §CPE_DISCIPLINE_REVEAL_PULLOUT: the pull-out sub-beat (tO..tP). Author's own call (documented
    // in the spec file, not user-dictated): a straight dolly-back along the NEGATIVE of the "angle of
    // attack" — with gaze held CONSTANT (still looking forward along that same direction, i.e. toward
    // where round 2 will re-enter). No gaze blend: this is the simplest defensible pull-out (position
    // retreats, look direction doesn't change). §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16,
    // bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md's dated section) SUPERSEDES the note that
    // used to be here about round 2 starting with "a clean CUT back to the first stick" — user
    // feedback on a live bake found that cut read as an abrupt, jarring switch. The pull-out itself
    // is UNCHANGED (still gaze-constant, still no blend) — see `_flyBackPose` below for the new
    // sub-beat that now bridges from here to the first stick.
    // ⚠ BUG FOUND BY THE WITNESS (not assumed correct on paper, same discipline the original build's
    // own comments describe): the "angle of attack" direction is the RATE-LIMITED gaze Beat 3 ACTUALLY
    // renders at tO (_revealSeamDir(tO)), not the raw _beat3EndDir — witness_cpe_reveal_pullout.js
    // measured a 78.85deg gap between them on HHS_Office_Federated (the limiter had visibly lagged the
    // raw signal on the walk's final turn). Anchoring to raw _beat3EndDir would have opened the
    // pull-out on a direction that instantly snaps away from what was actually on screen the frame
    // before — exactly the class of bug §CPE_GAZE_CONSTANT_RATE and _revealSeamDir already exist to
    // prevent elsewhere in this same file. Fixed before this was ever shipped.
    function _pullOutPose(w) {
      w = Math.max(0, Math.min(1, w));
      var pt = _outPos(1);                      // the last stick — where round 1 arrives
      var dir = _revealSeamDir(tO);              // the "angle of attack" — the gaze ACTUALLY on screen at tO
      var dist = CINEMA_REVEAL_PULLOUT_SEC * CINEMA_PULLBACK_MPS;   // derived, reuses the pull-back rate
      var e = _cinemaEaseFloored(w);
      var px = pt.x - dir.x * dist * e, py = pt.y - dir.y * dist * e, pz = pt.z - dir.z * dist * e;
      return { x: px, y: py, z: pz, tx: px + dir.x * 20, ty: py + dir.y * 20, tz: pz + dir.z * 20 };
    }
    // §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16) — the sub-beat between the pull-out (tP) and round
    // 2's forward lap (tF), replacing the old teleport cut. Retraces the SAME `_outPos(f)` curve the
    // walk itself already validated as collision-free, backward (f: 1->0) — NOT a straight line
    // between the pull-out's retreated point and the first stick, which would risk clipping through
    // walls at any turn the corridor takes (exactly the class of bug `_revealSeamDir`/
    // §CPE_GAZE_CONSTANT_RATE already exist to prevent elsewhere in this file). Paced at
    // CINEMA_PULLBACK_MPS ("flying, not walking" — reused, not a new speed invented), so this is
    // "fast" relative to round 2's own CINEMA_WALK_MPS retrace, not instant. Position blends from the
    // pull-out's actual final (off-path) point onto the path's f=1 point over the first
    // CPE_REVEAL_SEAM_FRAC width (same seam-blend idiom `_revealPose`'s own ending already uses),
    // then retraces the path for the remainder. Gaze holds at the pull-out's own "angle of attack"
    // (`_revealSeamDir(tO)` — matches pull-out's own constant-gaze choice, no reason to start turning
    // the head before the camera is even back on the path) through the position blend, then blends
    // into the forward travel tangent at f=0 over the FINAL CPE_REVEAL_SEAM_FRAC width, so round 2's
    // own opening gaze picks up with zero kink — same contract _revealPose's own end seam keeps at
    // the Beat 4 handoff.
    function _flyBackPose(w) {
      w = Math.max(0, Math.min(1, w));
      var e = _cinemaEaseFloored(w);
      var holdDir = _revealSeamDir(tO);           // same "angle of attack" the pull-out opened on
      var pOut = _pullOutPose(1);                 // the pull-out's own final point — this beat's start
      var onPath = _outPos(1 - e);                // retrace target at this instant
      var pos;
      if (w < CPE_REVEAL_SEAM_FRAC) {
        var s = _cinemaSmoothstep(w / CPE_REVEAL_SEAM_FRAC);
        pos = { x: pOut.x + (onPath.x - pOut.x) * s, y: pOut.y + (onPath.y - pOut.y) * s,
                z: pOut.z + (onPath.z - pOut.z) * s };
      } else {
        pos = onPath;
      }
      if (w > 1 - CPE_REVEAL_SEAM_FRAC) {
        var endDir = _revealTravelDir(0, 1);      // round 2's own opening gaze
        return _dirBlend(pos.x, pos.y, pos.z, holdDir.x, holdDir.y, holdDir.z,
          endDir.x, endDir.y, endDir.z,
          _cinemaSmoothstep((w - (1 - CPE_REVEAL_SEAM_FRAC)) / CPE_REVEAL_SEAM_FRAC));
      }
      return { x: pos.x, y: pos.y, z: pos.z,
               tx: pos.x + holdDir.x * 20, ty: pos.y + holdDir.y * 20, tz: pos.z + holdDir.z * 20 };
    }
    // §CPE_DISCIPLINE_REVEAL_PULLOUT: round 2 (tF..tV) — the SAME path flown again, forward only
    // (0->1), no there-and-back. Starts CLEAN now — the fly-back above already puts the camera on
    // the first stick with the correct opening gaze, so no cut happens here any more. Only the END
    // is seam-blended, into Beat 4's actual e4=0 gaze, matching every other beat seam in this file
    // (§CPE_GAZE_CONSTANT_RATE).
    function _revealPose(w) {
      w = Math.max(0, Math.min(1, w));
      var e = _cinemaEaseFloored(w);
      var p = _outPos(e), dv = _revealTravelDir(e, 1);
      if (w > 1 - CPE_REVEAL_SEAM_FRAC) {
        var endDir = _revealSeamDir(tV);
        return _dirBlend(p.x, p.y, p.z, dv.x, dv.y, dv.z, endDir.x, endDir.y, endDir.z,
          _cinemaSmoothstep((w - (1 - CPE_REVEAL_SEAM_FRAC)) / CPE_REVEAL_SEAM_FRAC));
      }
      return { x: p.x, y: p.y, z: p.z, tx: p.x + dv.x * 20, ty: p.y + dv.y * 20, tz: p.z + dv.z * 20 };
    }
    function _beat4Pose(e4) {
        var turnW4 = CINEMA_TURN_OVERLAP_MAX + (1 - CINEMA_TURN_OVERLAP_MAX) * _cinemaSmoothstep(e4);
        // (odx,odz) IS the direction Beat 3 ends on — its last route leg is the outward push past
        // the doorway — so e4=0 continues Beat 3's final gaze exactly. At e4=1, turnW4=1 yields the
        // camera→pivot bearing, which is the same orientation _orbitPose(0) produces by aiming at
        // pivot: both seams are continuous by construction, not by tuning.
        // §CPE_AIM_LATCH: opens on _beat3EndDir (Beat 3's measured final gaze) rather than the
        // hardcoded outward push — see that block's comment. At e4=1, turnW4=1 still yields the
        // camera→pivot bearing, so the Beat 4→5 seam is unchanged.
        return _cinemaGazeBlend(exitOuter.x + (orbitStart.x - exitOuter.x) * e4,
                                exitOuter.y + (orbitStart.y - exitOuter.y) * e4,
                                exitOuter.z + (orbitStart.z - exitOuter.z) * e4,
                                _beat3EndDir.x, _beat3EndDir.y, _beat3EndDir.z, turnW4);
    }
    // ── Beat 5: the standard ending.
    function _tailPose(tNorm) {
      return _orbitPose((tNorm - tR) / Math.max(1e-6, 1 - tR));
    }

    // ══ Where the walk is LOOKING at progress u — the one rule, used everywhere. ═══════════════
    // The look-ahead means "where does the path go next". The old guard answered a collapsed
    // look-ahead by SUBSTITUTING a level (odx,odz) bearing 20m out — a different vector, switched
    // to in a single frame. MEASURED on Hospital: the gaze went (-0.230,0.973,-0.019) → (-0.733,
    // 0.000,0.680), 81.0 deg in ONE frame at u=0.312, and it did NOT shrink at 100x sampling
    // density (ratio 1.0x) — a true discontinuity, exactly what §CPE_JERK_DEFINITION item 3 calls
    // a step. The `y` of exactly 0.000 is the substitution's fingerprint.
    //
    // The problem is the THRESHOLD, not the window size. Any rule of the form "if the look-ahead
    // is too close, use something else" has a switch in it, and a switch is a step. Searching
    // forward for the first point clearing a radius is still such a rule — it only made the step
    // smaller (MEASURED: 81.0 → 21.3 deg/frame, still ratio 1.4x at 100x density, still a step),
    // because on a path that folds the first-clearing point can itself jump.
    //
    // So there is no threshold. The look-ahead is the point a fixed ARC LENGTH further along the
    // path. That point always exists and always moves continuously with u, on any path shape,
    // because arc length is monotone in u — a fold-back cannot collapse it and there is nothing to
    // substitute. L is derived, not picked: the same 0.15 of the walk the fraction window meant,
    // now measured in metres so it stops depending on how the parameter happens to be spaced.
    //
    // The (odx,odz) fallback survives for exactly one case: a walk with no length at all, where
    // there is no path to read a direction from. Beat 4 opens on (odx,0,odz), so it is the
    // continuous answer there rather than a substitution.
    var _AH_FRAC = 0.15, _ahN = 240, _ahS = null, _ahL = 0;
    function _ahBuild() {                      // cumulative arc length of the walk, sampled once
      _ahS = [0];
      var prev = _outPos(0), s = 0;
      for (var i = 1; i <= _ahN; i++) {
        var q = _outPos(i / _ahN);
        s += Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z);
        _ahS.push(s); prev = q;
      }
      _ahL = s;
    }
    function _ahArcAt(u) {                     // arc length travelled by parameter u
      if (!_ahS) _ahBuild();
      var t = Math.max(0, Math.min(1, u)) * _ahN, i = Math.min(_ahN - 1, Math.floor(t));
      return _ahS[i] + (_ahS[i + 1] - _ahS[i]) * (t - i);
    }
    function _ahAtArc(s) {                     // the inverse: parameter u at arc length s
      if (!_ahS) _ahBuild();
      if (s <= 0) return 0;
      if (s >= _ahL) return 1;
      var lo = 0, hi = _ahN;
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (_ahS[m] <= s) lo = m; else hi = m; }
      var d = _ahS[hi] - _ahS[lo];
      return (lo + (d > 1e-12 ? (s - _ahS[lo]) / d : 0)) / _ahN;
    }
    function _lookAhead(p, u) {
      if (!_ahS) _ahBuild();
      if (_ahL < 1e-6) return { x: p.x + odx * 20, y: p.y, z: p.z + odz * 20 };
      return _outPos(_ahAtArc(_ahArcAt(u) + _AH_FRAC * _ahL));
    }

    // The walk-out pose as a pure function of its OWN progress e3 ∈ [0,1]. Extracted verbatim out of
    // poseAt so §CPE_EVEN_TURN's cost table can sample the REAL poses — sampling a re-implementation
    // of the gaze rule would let the table and the film drift apart silently.
    function _beat3Pose(e3, w3) {
        // §CPE_STICK_HOLD: w3 is the beat's TIME fraction (e3 is travel). Only the aim weight uses
        // it — see _holdBoostAt. Undefined when the cost-table build calls this, which is correct:
        // that build samples geometry, and a hold changes timing, not the curve.
        var _hBoost = (w3 == null) ? 0 : _holdBoostAt(w3);
        var p3 = _outPos(e3);
        // §CINEMA_TIMING_672 (2026-07-24, user: "no chasing interim targets when exiting building
        // mostly"): 0.06→0.15. Position already moves at constant speed along the route; this
        // lookahead point only steers where the camera LOOKS. On a multi-waypoint room-graph route
        // (a corridor with turns), the instant this window crosses a corner the look-at direction
        // swung hard onto the next segment — a real gaze snap, not just position. A wider window
        // means the look-at is further past any given corner while still approaching it, so the
        // direction change is spread out instead of happening in one frame.
        // §CINEMA_LOOKAHEAD_VERTICAL (2026-07-27): this collapse test used to measure HORIZONTAL
        // distance only, so any near-vertical stretch of path tripped it even though the look-ahead
        // point was metres away — it was simply above rather than ahead. The gaze then snapped from
        // looking up the shaft to the flat (odx,odz) bearing. MEASURED on Terminal, whose walk-out
        // climbs 17m with x/z barely moving: target jumped (-0.80,-6.19,-1.14) → (-21.82,-25.65,
        // -1.67), a 113 deg/frame whip at t=0.411. A 3D test is what the guard actually meant —
        // "has the look-ahead collapsed onto me", not "has it collapsed horizontally".
        var ah = _lookAhead(p3, e3);
        var ad = Math.hypot(ah.x - p3.x, ah.y - p3.y, ah.z - p3.z) || 1;
        // §CPE_SEAM_CONTINUOUS: at e3=0 look EXACTLY where the spin left off, then ease onto the
        // walk's own aim across _openU. Smoothstep, so the rate is zero at the seam and there is no
        // kink against Beat 2's own eased ending. Past _openU this is the untouched walk gaze.
        var _lx = (ah.x - p3.x) / ad, _ly = (ah.y - p3.y) / ad, _lz = (ah.z - p3.z) / ad;
        if (_openU > 1e-6 && e3 < _openU) {
          var wOpen = _cinemaSmoothstep(e3 / _openU);
          _lx = _handDir.x + (_lx - _handDir.x) * wOpen;
          _ly = _handDir.y + (_ly - _handDir.y) * wOpen;
          _lz = _handDir.z + (_lz - _handDir.z) * wOpen;
          var _ll = Math.hypot(_lx, _ly, _lz) || 1;
          _lx /= _ll; _ly /= _ll; _lz /= _ll;
        }
        // §CPE_AIM_PIN: a pin at THIS e3's band wins outright — no path-follow, no depth. Spec
        // Part C open question 1's own recommendation, built as the default (flagged in the DONE
        // block as not explicitly user-confirmed, same treatment §CPE_VIEWFINDER's fps question
        // got): "the pin always wins locally at its own band, resuming immediately after, no bleed
        // into neighbours." Checked BEFORE §CPE_AIM_DEPTH below so a pinned zone never even calls
        // it — the "no bleed" guarantee comes from `_pinLookAtAt` itself (a Voronoi partition by
        // band, see its own comment), not from a blend weight here.
        var _pin = _pinLookAtAt(e3);
        if (_pin) {
          var _pdx = _pin.x - p3.x, _pdy = _pin.y - p3.y, _pdz = _pin.z - p3.z;
          var _pdL = Math.hypot(_pdx, _pdy, _pdz) || 1;
          _lx = _pdx / _pdL; _ly = _pdy / _pdL; _lz = _pdz / _pdL;
        } else {
        // §CPE_AIM_DEPTH (§CPE_AIM_SIMPLIFY, 2026-08-13): the ONLY exception to path-follow —
        // §CPE_AIM_DENSITY, which used to run here first, is retired (see its marker above _aimGrid).
        // Applied AFTER the seam blend (so it can never reopen §CPE_SEAM_CONTINUOUS at e3=0, where
        // its own weight is 0 anyway) and BEFORE the orbit hand-off below, which must stay the last
        // word on the gaze at the end of the walk. Travel direction is the path's own derivative, not
        // the gaze: "perpendicular" is defined against where the camera is GOING.
        // ⚠ The travel direction is the local TREND, not the instantaneous tangent — measured cause
        // of a prior gaze spike. A perpendicular aim is defined RELATIVE to T, so it inherits T's own
        // rate of turn: at a corner in the (hosed, therefore possibly sharp) walk the tangent swings
        // fast, and a gaze locked square to it swings just as fast. A finite difference over ~3% of
        // the walk reads "where the camera is generally heading" instead, which is what "perpendicular
        // to travel" means to a viewer anyway.
        var _eps = 1 / 32;
        var _pA = _outPos(Math.max(0, e3 - _eps)), _pB = _outPos(Math.min(1, e3 + _eps));
        var _tvx = _pB.x - _pA.x, _tvy = _pB.y - _pA.y, _tvz = _pB.z - _pA.z;
        var _tvL = Math.hypot(_tvx, _tvy, _tvz);
        if (_tvL > 1e-6) {
          var _travelDir = { x: _tvx / _tvL, y: _tvy / _tvL, z: _tvz / _tvL };
          var _aimD = _aimDepthApply(p3, _travelDir, _lx, _ly, _lz, e3, _openU, _hBoost);
          if (_aimD) { _lx = _aimD.x; _ly = _aimD.y; _lz = _aimD.z; }
        }
        }
        // §CPE_CONE_ORIENT_ADJUST: a user-dragged correction is the LAST word on the gaze at its own
        // arc-length window, applied AFTER the pin/depth/path-follow chain above — a judgment call,
        // not user-confirmed: the cone shows whatever the CURRENT combined gaze is (pin included), so
        // dragging it corrects whatever is currently there, even inside an already-pinned zone. Zero
        // cost/no-op on every plan with no corrections authored (_cpeCorrectionAt returns null
        // instantly once `_corrArc` is built empty).
        var _corr = _cpeCorrectionAt(e3);
        if (_corr && _corr.w > 0) {
          var _cb = _cpeCorrDirBlend(_lx, _ly, _lz, _corr.dir.x, _corr.dir.y, _corr.dir.z, _corr.w);
          _lx = _cb.x; _ly = _cb.y; _lz = _cb.z;
        }
        // §CINEMA_BEAT_OVERLAP (2026-07-20, "no abruptness... even the path when reaching outside
        // should not be robotic abrupt stop and turn, it can play while doing both"): start blending
        // the look-at toward the pivot in the LAST CINEMA_TURN_OVERLAP fraction of the walk-out, so
        // Beat 4's turn is a CONTINUATION picked up mid-blend, not a fresh spin starting from zero.
        // Both this ramp-in and Beat 4's ramp-out use smoothstep, so the blend weight is continuous
        // AND has matching (zero) slope at the tO boundary — no kink in the gaze direction.
        var turnW3 = (e3 > 1 - CINEMA_TURN_OVERLAP)
          ? _cinemaSmoothstep((e3 - (1 - CINEMA_TURN_OVERLAP)) / CINEMA_TURN_OVERLAP) * CINEMA_TURN_OVERLAP_MAX
          : 0;
        // turnW3=0 reproduces the old pure-walk target exactly (p3 + aheadDir*20) — the walk-out
        // itself is untouched; only the blend that follows changed shape.
        return _cinemaGazeBlend(p3.x, p3.y, p3.z, _lx, _ly, _lz, turnW3);
    }

    // ══ §CPE_EVEN_TURN — the even-out. ═══════════════════════════════════════════════════════════
    // User, 2026-07-27: "no jerk, no cam pos/pov jump.. but even out".
    //
    // What every earlier attempt got wrong: they kept frames evenly spaced in TIME and tried to fix
    // the corner by MULTIPLYING the speed there. deg/frame = (deg/metre) × (metres/frame), and a
    // multiplier bounded by the user's own PACE_SWING can only ever divide the peak by 1.6 — the
    // measured peak was 29.1 deg/frame against a 12 cap, so a 2.4× reduction was needed and no
    // tuning of a bounded multiplier could reach it. That is why H3 moved 29.1 → 29.4: not a bug,
    // an arithmetic ceiling. The three dead ends are recorded in prompts/CINEMA_PATH_EDITOR.md.
    //
    // The fix is to stop treating pace as a correction and make it the PARAMETERIZATION. Step the
    // frames at equal increments of a blended cost
    //
    //     dc = (1-w)·(ds/S) + w·(dθ/Θ)
    //
    // where S is the walk's arc length and Θ its total gaze turn. If frames advanced by a constant
    // Δc, each term would be bounded on its own by construction:
    //
    //     Δθ ≤ Θ/(w·N)         — turn per frame, at most 1/w × the perfectly-even Θ/N
    //     Δs ≤ S/((1-w)·N)     — distance per frame, at most 1/(1-w) × the nominal speed
    //
    // ⚠ Δc IS NOT CONSTANT HERE, and the bounds above are the per-cost-step ones, not what the film
    // delivers. Beat 3 feeds the remap an EASED time fraction — _evenTurnRemap(_cinemaSmoothstep(t))
    // — and smoothstep's derivative peaks at 1.5 at its midpoint, so cost advances at up to 1.5/N
    // per frame and every bound above carries a ×1.5:
    //
    //     Δθ ≤ 1.5·Θ/(w·N)     Δs ≤ 1.5·S/((1-w)·N)
    //
    // So the DELIVERED speed range is 1.5/(1-w) ≈ 2.4×, not 1/(1-w) = 1.6×: against a nominal
    // CINEMA_WALK_MPS of 2.3 the walk peaks near 5.5 m/s, and §CPE_WALK's "2.3 m/s pace" is a MEAN,
    // not the pace. The ease is deliberate (zero rate at both beat seams, so the walk does not start
    // or stop abruptly) — the ×1.5 is the price of it, and it is stated here rather than left for a
    // reader to derive from the fact that the two do not agree.
    //
    // w itself is still not tuned: PACE_SWING = 1.6 is the user's own dial ("have a speed range…
    // don't overdo it") and fixes w = 1 - 1/1.6 = 0.375 exactly. What is NOT yet settled is whether
    // 2.4× is inside what they meant by "don't overdo it" — the gaze half passes comfortably (7.3
    // measured against a 12 cap) but the POSITION half of §CPE_JERK_DEFINITION is still ungated, and
    // gating it is what would turn this from an argument into a measurement.
    // Slow-in-the-turn and pick-up-in-the-open are not imposed by a brake — they are what equal
    // cost stepping DOES, and the brake releases in open space for free because there is no dθ to
    // pay for there.
    // CINEMA_PACE_SWING now lives at module scope (§CPE_NOISE_LAW) — one dial for every beat.
    var _etW = 1 - 1 / CINEMA_PACE_SWING;
    var _etN = 240, _etC = null;
    // §CPE_PACE_FLOOR — a SEPARATE concern from the cost function, and kept separate.
    // _evenTurnBuild decides WHERE the film should slow (the blended cost). This decides HOW SLOW
    // it is ever allowed to get. Mixing them made one loop answer two questions; it is a pure
    // transform on a finished cost table now, testable and removable on its own.
    //
    // The blended cost bounds the fast side and the turn, and stalls on the slow side: MEASURED
    // 5-8% of the ease's own prediction, which is the "2 secs pausing there" the user reported.
    // Rule: cost may not accumulate faster than PACE_SWING x uniform-per-arc — the same statement
    // as "the walk may not run slower than nominal/PACE_SWING".
    // Clamp-then-renormalise does NOT work: rescaling by the shrunk span multiplies every slope by
    // 1/span > 1 and restores exactly what was removed. The removed cost must go to the segments
    // NOT at the cap: water-filling, bisect k with sum(min(k*raw, SWING*dArc)) = 1.
    function _paceFloor(c, ss, S) {
      var n = c.length - 1, raw = [], dA = [], i;
      for (i = 1; i <= n; i++) { raw.push(c[i] - c[i - 1]); dA.push((ss[i] - ss[i - 1]) / S); }
      var sumAt = function (k) {
        var t = 0;
        for (var j = 0; j < raw.length; j++) t += Math.min(k * raw[j], CINEMA_PACE_SWING * dA[j]);
        return t;
      };
      if (sumAt(1e9) < 1) return c;                    // infeasible — leave the cost untouched
      var lo = 0, hi = 1;
      while (sumAt(hi) < 1 && hi < 1e9) hi *= 2;
      for (var it = 0; it < 60; it++) {
        var m = 0.5 * (lo + hi);
        if (sumAt(m) < 1) lo = m; else hi = m;
      }
      var out = [0];
      for (i = 0; i < raw.length; i++) out.push(out[i] + Math.min(hi * raw[i], CINEMA_PACE_SWING * dA[i]));
      var sp = out[n];
      if (sp > 1e-9) for (i = 0; i <= n; i++) out[i] /= sp;
      return out;
    }
    function _evenTurnBuild() {
      var ss = [], ts = [], prev = null, prevD = null, s = 0, th = 0;
      for (var i = 0; i <= _etN; i++) {
        var e = i / _etN, ps = _beat3Pose(e);
        var gx = ps.tx - ps.x, gy = ps.ty - ps.y, gz = ps.tz - ps.z;
        var gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
        if (prev) {
          s += Math.hypot(ps.x - prev.x, ps.y - prev.y, ps.z - prev.z);
          // Angle between successive gaze DIRECTIONS — the full 3D turn, so a pitch whip costs the
          // same as a yaw whip. Measuring yaw alone would leave §CINEMA_LOOKAHEAD_VERTICAL's class
          // of jump unpriced.
          th += Math.acos(Math.max(-1, Math.min(1, gx * prevD.x + gy * prevD.y + gz * prevD.z)));
        }
        ss.push(s); ts.push(th);
        prev = { x: ps.x, y: ps.y, z: ps.z }; prevD = { x: gx, y: gy, z: gz };
      }
      // A walk with no turn in it has no turn to even out: fall back to pure arc length, which is
      // byte-for-byte today's behaviour. Guards ts[i]/Θ against dividing by ~0.
      var w = (th > 1e-3) ? _etW : 0;
      var S = s || 1, T = th || 1;
      // The blended cost — RESTORED after measuring its replacement. A speed heuristic
      // v=f(noise) has no bound on turn-per-frame; this form does, by construction:
      //     dc = (1-w)(ds/S) + w(dθ/Θ)   ⇒   Δθ ≤ Θ/(w·N),  Δs ≤ S/((1-w)·N)
      // The noise-speed version was tried in both per-segment and windowed forms and MEASURED
      // WORSE on the metric that matters (Hospital 11.2 → 16.5 → 18.3 deg/frame), because
      // smoothing the noise removes the slowdown exactly at the corner that needed it. Keep the
      // provable bound; buy the headroom with FRAMES instead (§CPE_TURN_BUDGET).
      // §CPE_NOISE_LAW, the walk's share (user, 2026-07-27: "i thnk the stalls are ok, it may mean
      // a sec or two pause which is fine in the film" ... "but if the noise ratio tempers it a bit
      // also ok"). The stall is ACCEPTED, so this does not remove it — it TEMPERS it, and it does
      // so by finishing the law rather than by adding a second mechanism.
      //
      // The crawl happens where dθ dominates a cost step: the camera turns hard, cost runs out, and
      // metres-per-frame collapses. But a hard turn whose CONTENT is not changing is precisely the
      // "not moving makes a boring show" case — so weight each cost increment by the same bbox rate
      // of change the dive uses. A corner with little change stays cheap (the film keeps moving);
      // a corner where the scene really is turning over still pays. 32 density probes, interpolated
      // across the 240 cost samples — measured at ~15ms on Terminal's 48k rows, against a plan
      // budget already in the hundreds.
      var _nk = 32, nz = [], nzMax = 0, q;
      for (q = 0; q <= _nk; q++) {
        var pq = _beat3Pose(q / _nk);
        nz.push(_densityAt({ x: pq.x, y: pq.y, z: pq.z }, _noiseRadius(s)));
      }
      var nzC = [];
      for (q = 0; q <= _nk; q++) {
        var lo = nz[Math.max(0, q - 1)], hi = nz[Math.min(_nk, q + 1)];
        nzC.push(Math.abs(hi - lo));
        if (nzC[q] > nzMax) nzMax = nzC[q];
      }
      var noiseAt = function (e) {
        var x = Math.max(0, Math.min(_nk, e * _nk)), j = Math.min(_nk - 1, Math.floor(x)), f = x - j;
        return nzMax > 0 ? (nzC[j] * (1 - f) + nzC[j + 1] * f) / nzMax : 0;
      };
      var c = [0], acc = 0;
      for (i = 1; i <= _etN; i++) {
        var dRaw = (1 - w) * ((ss[i] - ss[i - 1]) / S) + w * ((ts[i] - ts[i - 1]) / T);
        acc += dRaw * (1 + (CINEMA_PACE_SWING - 1) * noiseAt((i - 0.5) / _etN));
        c.push(acc);
      }
      if (acc > 1e-9) for (i = 0; i <= _etN; i++) c[i] /= acc;
      c = _paceFloor(c, ss, S);
      _etC = c;
      console.log('§CPE_NOISE_LAW beat=walk src=bbox probes=' + (_nk + 1) +
        ' maxChange=' + nzMax + ' radius=' + _noiseRadius(s).toFixed(1) + 'm elems=' + _densPoints().length +
        ' — tempers the turn-driven crawl: a corner whose CONTENT is not changing stays cheap');
      console.log('§CPE_EVEN_TURN blended-cost, PACE_SWING=' + CINEMA_PACE_SWING +
        ' walkLen=' + s.toFixed(2) + 'm totalTurn=' + (th * 180 / Math.PI).toFixed(1) +
        'deg samples=' + (_etN + 1) +
        ' boundPerFrameTurn=' + (w > 0 ? (th * 180 / Math.PI / w).toFixed(1) + 'deg/N' : 'n/a') +
        ' speedRange=' + (1 / (1 - w)).toFixed(2) + 'x' +
        ' x1.5 more from the smoothstep ease at the beat midpoint');
    }
    // Monotone inverse of the cost table: given uniform progress in cost, return the walk fraction.
    function _evenTurnRemap(u) {
      if (!_etC) return u;
      u = Math.max(0, Math.min(1, u));
      var lo = 0, hi = _etN;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (_etC[mid] <= u) lo = mid; else hi = mid; }
      var c0 = _etC[lo], c1 = _etC[hi], f = (c1 - c0 > 1e-12) ? (u - c0) / (c1 - c0) : 0;
      return (lo + Math.max(0, Math.min(1, f))) / _etN;
    }
    // Assert the seam is actually closed, on the poses that FLY: the angle between Beat 2's last
    // gaze and Beat 3's first. Logged rather than assumed — if a future change reopens it, the
    // number moves off zero here instead of surfacing as a jerk nobody can locate.
    (function () {
      var p0 = _beat3Pose(0);
      var dl = Math.hypot(p0.tx - p0.x, p0.ty - p0.y, p0.tz - p0.z) || 1;
      var d = (p0.tx - p0.x) / dl * _handDir.x + (p0.ty - p0.y) / dl * _handDir.y + (p0.tz - p0.z) / dl * _handDir.z;
      console.log('§CPE_SEAM_CONTINUOUS seamGapDeg=' +
        (Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI).toFixed(3) +
        ' (beat2 end -> beat3 start; must be ~0)');
    })();
    _evenTurnBuild();

    // ══ §CPE_STICK_HOLD, motion half — a raised-cosine RATE DIP, never a flat freeze ════════════
    // A hold must not be a piecewise-flat segment in the time map: that stops the camera with a
    // velocity STEP, which is precisely the discontinuity §CPE_JERK_DEFINITION and §CPE_EVEN_TURN
    // exist to kill, and no amount of pacing downstream can smooth a step. Instead the walk's rate
    // of travel-time consumption r(τ) DIPS smoothly to exactly zero and comes back:
    //
    //     plateau  P = h/2   at r = 0        (the genuine "stop a sec")
    //     ramps    R = h/2   each side, raised cosine
    //     ∫dip     = P + R   = h  EXACTLY    (the hold costs precisely its authored seconds)
    //     window   = 1.5h    total           ("slows a sec, stop a sec, then ease out")
    //
    // No new constant — the shape is fixed by h alone. Velocity is continuous, reaches zero across
    // the plateau, and the cost identity is exact rather than tuned, so G-SH-2/G-SH-3 can both be
    // asserted from the same number.
    //
    // Centring, derived not guessed: the dip is symmetric, so half its integral falls before the
    // centre. For the stop to land ON the stick's midpoint, the centre in BEAT-seconds must be
    //     c_i = u_i·T + Σ_{j<i} h_j + h_i/2
    // where u_i is the travel-time fraction at which the walk reaches that stick. That makes
    // travelElapsed(c_i) = u_i·T identically.
    var _holdMapTab = null, _holdBeatSec = 0, _holdTravelSec = 0;
    function _holdBuild() {
      if (!_holds.length) return;
      // The editor scales TRAVEL by the user's total and leaves the hold authored (_buildOverride),
      // so this subtraction is exact on that path. A hand-written override could still ask for a
      // walk shorter than its own holds; rather than produce negative travel, shrink the holds to
      // fit and SAY SO — a silently-clamped budget is the failure mode this lane keeps re-learning.
      if (_holdTotal >= _useSec.out * 0.9) {
        var _hs = (_useSec.out * 0.9) / _holdTotal;
        console.warn('§CPE_STICK_HOLD holds ' + _holdTotal.toFixed(2) + 's exceed 90% of the ' +
          _useSec.out.toFixed(2) + 's walk — scaled by ' + _hs.toFixed(3) + ' to keep travel positive');
        for (var _hq = 0; _hq < _holds.length; _hq++) _holds[_hq].sec *= _hs;
        _holdTotal *= _hs;
      }
      _holdTravelSec = Math.max(1e-6, _useSec.out - _holdTotal);   // travel only
      _holdBeatSec = _holdTravelSec + _holdTotal;
      // u_i: invert the walk's OWN chain. e3(w) = _evenTurnRemap(_cinemaEaseFloored(w)) is the arc
      // fraction actually flown at time fraction w, and it is monotone — so sample it once and read
      // the inverse off the same table the film uses. Sampling the real chain (not a re-derivation
      // of it) is the same discipline _beat3Pose's own comment records for the cost table.
      var NS = 512, e3s = [], q;
      for (q = 0; q <= NS; q++) e3s.push(_evenTurnRemap(_cinemaEaseFloored(q / NS)));
      for (var i = 0; i < _holds.length; i++) {
        // f: arc fraction of this stick's midpoint, found by search against the flown curve rather
        // than by index arithmetic over outWp — corner rounding and §CPE_HOSE both mean band index
        // and arc position are not the same thing.
        var best = 0, bestD = Infinity;
        for (q = 0; q <= NS; q++) {
          var pf = _outPos(q / NS);
          var dd = Math.hypot(pf.x - _holds[i].c.x, pf.y - _holds[i].c.y, pf.z - _holds[i].c.z);
          if (dd < bestD) { bestD = dd; best = q / NS; }
        }
        _holds[i].f = best; _holds[i].fitM = bestD;
        // w such that e3(w) = f, off the same sampled chain.
        var wq = NS;
        for (q = 0; q <= NS; q++) if (e3s[q] >= best) { wq = q; break; }
        _holds[i].u = wq / NS;
      }
      _holds.sort(function(a, b) { return a.u - b.u; });
      var acc = 0;
      for (i = 0; i < _holds.length; i++) {
        _holds[i].c_beat = _holds[i].u * _holdTravelSec + acc + _holds[i].sec / 2;
        acc += _holds[i].sec;
      }
      // Integrate r = 1 - Σdip over beat-seconds into a monotone table: beat fraction → travel
      // fraction, which is exactly what the chain below wants as its input.
      var NT = 2048, tab = [0], travel = 0, dt = _holdBeatSec / NT;
      for (q = 1; q <= NT; q++) {
        var tau = (q - 0.5) * dt, dip = 0;
        for (i = 0; i < _holds.length; i++) {
          var h = _holds[i].sec, a = Math.abs(tau - _holds[i].c_beat);
          if (a <= h / 4) dip += 1;
          else if (a <= 3 * h / 4) dip += 0.5 * (1 + Math.cos(Math.PI * (a - h / 4) / (h / 2)));
        }
        travel += Math.max(0, 1 - Math.min(1, dip)) * dt;
        tab.push(travel);
      }
      var span = tab[NT] || 1;
      for (q = 0; q <= NT; q++) tab[q] /= span;                    // → [0,1] travel fraction
      _holdMapTab = tab;
      console.log('§CPE_STICK_HOLD holds=' + _holds.length + ' totalSec=' + _holdTotal.toFixed(2) +
        ' travelSec=' + _holdTravelSec.toFixed(2) + ' beatSec=' + _holdBeatSec.toFixed(2) +
        ' stops=[' + _holds.map(function(o) {
          return 'band' + o.band + '@u=' + o.u.toFixed(3) + '/' + o.sec.toFixed(2) + 's(fit' +
                 o.fitM.toFixed(2) + 'm)'; }).join(' ') + ']' +
        ' — plateau h/2 at zero rate, cosine ramps h/2, integral == authored seconds');
    }
    // ══ §CPE_STICK_HOLD, the half that makes the hold WORTH buying ══════════════════════════════
    // MEASURED, and it is the whole point of the feature: with the position frozen the gaze froze
    // too — 0.02 deg of rotation across a parked 18-sample stop (G-SH-5, first green run of the
    // motion half). The cause is structural, not a bug in the dip: every gaze rule in Beat 3 is
    // indexed by e3, the TRAVEL fraction, and travel is exactly what a hold stops. So the camera
    // stopped and stared, which is not what the user asked for — "it slows a sec stop a sec, then
    // ease out WHILE THE CAM IS TURNING TO THE BUILDING".
    //
    // The fix splits the two indices, which is the §CPE_GAZE_CONSTANT_RATE idea in the small:
    // the SUBJECT stays indexed by position (e3) — correct, we are parked, the nearby mass has not
    // changed — while the aim's WEIGHT advances on TIME (w3). Across a hold the weight ramps to 1,
    // so the gaze rotates from the look-ahead onto the density×depth subject using the seconds the
    // hold just bought. §CPE_AIM_LATCH's running max then keeps it there once the path resumes,
    // which is the user's "when the path continues, it should remain so".
    //
    // Monotone by construction (smoothstep up to the dip centre, 1 thereafter), so it can only ever
    // strengthen the aim — it composes with the latch rather than fighting it. Still a pure function
    // of tNorm, so poseAt stays order-independent.
    function _holdBoostAt(w3) {
      if (!_holds.length || !_holdBeatSec) return 0;
      var tau = Math.max(0, Math.min(1, w3)) * _holdBeatSec, best = 0;
      for (var i = 0; i < _holds.length; i++) {
        var h = _holds[i].sec, c = _holds[i].c_beat, start = c - 0.75 * h;
        if (tau <= start) continue;
        var v = (tau >= c) ? 1 : _cinemaSmoothstep((tau - start) / Math.max(1e-6, c - start));
        if (v > best) best = v;
      }
      return best;
    }
    // Beat-time fraction → travel-time fraction. Identity when nothing is held, so a path with no
    // holds is byte-identical to before this feature existed (G-SH-8).
    function _holdMap(w) {
      if (!_holdMapTab) return w;
      var t = Math.max(0, Math.min(1, w)) * (_holdMapTab.length - 1);
      var i = Math.min(_holdMapTab.length - 2, Math.floor(t));
      return _holdMapTab[i] + (_holdMapTab[i + 1] - _holdMapTab[i]) * (t - i);
    }
    _holdBuild();

    // ══ §CPE_GAZE_CONSTANT_RATE — the gaze may never turn faster than the film's own turn rate ═══
    // MEASURED CAUSE (this session, G-SH-4): removing §CPE_AIM_LATCH's outgoing taper exposed a
    // 29.01 deg/sample gaze whip at w=0.850 on Hospital, against 2.62 there on origin/main. The
    // taper had been MASKING a fast swing inside the walk — not merely smoothing the Beat 4 hand-off
    // as its own comment claimed. Re-tapering would undo the user's "the turning should be thruout,
    // till the end of clip", so the swing is bounded at its cause instead.
    //
    // The law: the composed gaze — look-ahead, seam blend, §CPE_AIM_DEPTH's exception, all
    // of it — is sampled in TIME and rate-limited to CINEMA_TURN_DPS, the rate the spin, the orbit
    // lap and the walk's own turn charge are ALREADY priced at. Not a new constant, and not a new
    // opinion about how fast a camera should turn: it is the number this film already uses
    // everywhere else, finally applied to the thing that actually rotates.
    //
    // Sampled in TIME, not in e3 — with §CPE_STICK_HOLD a hold makes travel stop while time runs, so
    // a limit expressed per unit of travel would be unbounded exactly where the camera is parked and
    // turning, which is the one place this feature deliberately creates rotation.
    //
    // Forward-only, so it LAGS rather than anticipating; that is correct for a camera operator and
    // it is safe here because §CPE_AIM_LATCH already made Beat 4 open on Beat 3's real final gaze,
    // so wherever the limiter leaves the gaze, the hand-off follows it. Pure function of w3 — no
    // per-frame state, so poseAt stays order-independent and replans stay byte-identical.
    // The limiter spans Beat 3 AND Beat 4 as ONE continuous stretch of film — [tS, tR]. Limiting
    // only the walk was measured to MOVE the whip rather than remove it: Terminal went 4.1 -> 34.9
    // deg/frame at u=0.645, and `out` there is 0.6442, so the peak had simply relocated into Beat 4,
    // which is exactly where the gaze swings from wherever the aim rule left it onto the pivot
    // bearing. One span, one bound, no seam for a whip to hide in.
    function _spanFracOf(tNorm) {
      return (tNorm - tS) / Math.max(1e-6, tR - tS);
    }
    var _gazeLim = null, _gazeLimN = 512;
    function _gazeRateBuild() {
      var i, raw = [], sp, tt, e, p, dx, dy, dz, L;
      for (i = 0; i <= _gazeLimN; i++) {
        sp = i / _gazeLimN;
        tt = tS + (tR - tS) * sp;
        if (tt <= tO) {
          var w3b = (tt - tS) / Math.max(1e-6, tO - tS);
          e = _evenTurnRemap(_cinemaEaseFloored(_holdMap(w3b)));
          p = _beat3Pose(e, w3b);
        } else {
          // §CPE_DISCIPLINE_REVEAL: Beat 4's real boundary is tV (not tO) whenever the reveal round
          // is inserted — MUST match poseAt's own Beat 4 formula below or this table's Beat 4 portion
          // (the only portion _spanFracOf ever actually looks up above tO — see that function's own
          // comment) samples the wrong e4 entirely. tt in (tO,tV] clamps to e4=0 (_cinemaEaseFloored
          // clamps internally) — dead, never-queried table entries, not wrong ones, since _spanFracOf
          // only ever produces indices in [tS,tO] or [tV,tR], never inside the gap itself.
          p = _beat4Pose(_cinemaEaseFloored((tt - tV) / Math.max(1e-6, tR - tV)));
        }
        dx = p.tx - p.x; dy = p.ty - p.y; dz = p.tz - p.z;
        L = Math.hypot(dx, dy, dz) || 1;
        raw.push({ x: dx / L, y: dy / L, z: dz / L });
      }
      var stepSec = Math.max(1e-6, (tR - tS) * durationSec) / _gazeLimN;
      var maxAng = CINEMA_TURN_DPS * stepSec * Math.PI / 180;
      var lim = [raw[0]], cur = raw[0], rawPeak = 0, limPeak = 0, acqPeakMult = 1;
      for (i = 1; i <= _gazeLimN; i++) {
        var rp = Math.acos(Math.max(-1, Math.min(1,
          raw[i].x * raw[i - 1].x + raw[i].y * raw[i - 1].y + raw[i].z * raw[i - 1].z))) * 180 / Math.PI;
        if (rp > rawPeak) rawPeak = rp;
        var _resid = Math.acos(Math.max(-1, Math.min(1,
          cur.x * raw[i].x + cur.y * raw[i].y + cur.z * raw[i].z)));
        var _cap = _gazeAcquireCap(_resid, maxAng);
        if (_cap / maxAng > acqPeakMult) acqPeakMult = _cap / maxAng;
        var nxt = _rotToward(cur, raw[i], _cap);
        var lp = Math.acos(Math.max(-1, Math.min(1,
          nxt.x * cur.x + nxt.y * cur.y + nxt.z * cur.z))) * 180 / Math.PI;
        if (lp > limPeak) limPeak = lp;
        cur = nxt; lim.push(cur);
      }
      _gazeLim = lim;
      console.log('§CPE_GAZE_CONSTANT_RATE probes=' + (_gazeLimN + 1) + ' spanSec=' + ((tR - tS) * durationSec).toFixed(2) +
        ' (beats 3+4) walkSec=' + _useSec.out.toFixed(2) +
        ' capDps=' + CINEMA_TURN_DPS + ' capPerProbeDeg=' + (maxAng * 180 / Math.PI).toFixed(3) +
        ' rawPeakDeg=' + rawPeak.toFixed(2) + ' limitedPeakDeg=' + limPeak.toFixed(2) +
        ' rawPeakDps=' + (rawPeak / stepSec).toFixed(1) + ' limitedPeakDps=' + (limPeak / stepSec).toFixed(1) +
        ' acquirePeakMult=' + acqPeakMult.toFixed(2) + 'x (max ' + GAZE_ACQUIRE_MAX + 'x)' +
        ' — the composed gaze, bounded at the rate the spin and orbit already turn at');
    }
    function _gazeRateAt(w) {
      if (!_gazeLim) return null;
      var t = Math.max(0, Math.min(1, w)) * _gazeLimN;
      var i = Math.min(_gazeLimN - 1, Math.floor(t)), f = t - i;
      var a = _gazeLim[i], b = _gazeLim[i + 1];
      // nlerp: adjacent samples are at most capPerProbeDeg apart by construction, so the chord error
      // is negligible and slerp would buy nothing but a trig call per frame.
      var x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
      var L = Math.hypot(x, y, z) || 1;
      return { x: x / L, y: y / L, z: z / L };
    }
    // §CPE_AIM_LATCH — Beat 3's REAL final gaze direction, sampled from the pose that actually flies.
    // Beat 4 used to open on the hardcoded (odx,0,odz) outward push, justified by the comment
    // "(odx,odz) IS the direction Beat 3 ends on". That was true only while the aim rules were
    // tapered to zero before e3=1; with the taper gone it is false, and believing it is exactly the
    // 88.4 deg/frame seam snap the taper was introduced to hide. Sampled, never assumed.
    // ⚠ This is the RAW Beat 3 ending, and it must be: _gazeRateBuild samples _beat4Pose, which reads
    // this, so it has to exist BEFORE the limiter is built (an earlier cut read the limited series
    // here and _beat3EndDir was `undefined` at build time). It is also the right value — its job is
    // to make Beat 4's RAW signal continuous with Beat 3's RAW signal, and the limiter, which now
    // spans both beats as one stretch, smooths the composition afterwards.
    var _b3e = _beat3Pose(1, 1);
    var _b3dx = _b3e.tx - _b3e.x, _b3dy = _b3e.ty - _b3e.y, _b3dz = _b3e.tz - _b3e.z;
    var _b3dL = Math.hypot(_b3dx, _b3dy, _b3dz) || 1;
    var _beat3EndDir = { x: _b3dx / _b3dL, y: _b3dy / _b3dL, z: _b3dz / _b3dL };
    var _b3Off = Math.acos(Math.max(-1, Math.min(1, _beat3EndDir.x * odx + _beat3EndDir.z * odz))) * 180 / Math.PI;
    console.log('§CPE_AIM_LATCH beat3EndDir=(' + _beat3EndDir.x.toFixed(3) + ',' + _beat3EndDir.y.toFixed(3) +
      ',' + _beat3EndDir.z.toFixed(3) + ') offOutwardDeg=' + _b3Off.toFixed(1) +
      ' — Beat 4 opens on THIS, not on (odx,odz); offOutwardDeg is exactly the seam snap the old taper hid');
    _gazeRateBuild();

    // ══ §CPE_STICK_APPROACH — "which stick is the camera heading toward", for the MaxQ bake HUD ══
    // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_STICK_APPROACH. A "stick" is a band the user
    // explicitly dropped (`_stick===true`, §CPE_REOPEN_NODE's rule — settle/exit-door/stop bands are
    // never sticks even though they are also entries in `bands`). `_s` is each stick's arc-length
    // fraction along the WALK (0=settle end, 1=stop end), recorded at spawn time
    // (cinema_path_editor.js `hit.s`) and already carried through the override → plan round-trip
    // above — no new authored field, just reading what's already there.
    //
    // The position-in-the-walk a given frame is AT is `e3` — exactly the number Beat 3's own poseAt
    // branch computes at effects.js "var e3 = _evenTurnRemap(_cinemaEaseFloored(_holdMap(w3)));"
    // (the walk's live arc-fraction chain, holds included). Reusing that chain rather than a second
    // one is deliberate: a stick with a hold on it dwells in TIME without advancing arc, and only the
    // real chain (via `_holdMap`) knows that — a naive time-fraction estimate would report the camera
    // "past" a held stick while it is still parked in front of it.
    var _stickList = [];
    if (_cpeBands) {
      for (var _sb = 0; _sb < _cpeBands.length; _sb++) {
        if (_cpeBands[_sb]._stick) _stickList.push({ index: _stickList.length + 1, s: +(_cpeBands[_sb]._s || 0) });
      }
    }
    function _stickApproachAt(tNorm) {
      if (!_stickList.length) return null;
      tNorm = Math.max(0, Math.min(1, tNorm));
      var e3;
      if (tNorm <= tS) e3 = 0;          // dive/spin: still heading for the first stick
      else if (tNorm >= tO) e3 = 1;     // rise/orbit: the walk (and every stick on it) is behind us
      else {
        var w3 = (tNorm - tS) / Math.max(1e-6, tO - tS);
        e3 = _evenTurnRemap(_cinemaEaseFloored(_holdMap(w3)));
      }
      for (var i = 0; i < _stickList.length; i++) {
        if (_stickList[i].s >= e3 - 1e-6) return { index: _stickList[i].index, count: _stickList.length, s: _stickList[i].s, e3: e3 };
      }
      return null; // past the last stick — nothing left to approach
    }
    if (_stickList.length) console.log('§CPE_STICK_APPROACH sticks=' + _stickList.length +
      ' s=[' + _stickList.map(function(o) { return o.s.toFixed(3); }).join(',') + ']');

    // Plan cost is dominated by the BVH fans + floor raycasts. Measured on this project's headless
    // ANGLE/SwiftShader rig: Duplex ~20-70ms, Terminal/Hospital ~500-750ms — a one-off cost at the
    // moment Alt+C is pressed, before a 24s recording. Logged so a regression is visible, not guessed.
    console.log('§CINEMA_PLAN_MS ' + (((typeof performance !== 'undefined') ? performance.now() : 0) - _planT0).toFixed(1) +
      ' (fanRays=' + CINEMA_FAN_RAYS + ' spaceCands=' + spaceCands.length + ' exitCands=' + exitScored.length + ')');
    return { base: base, envelope: envelope, arcOnly: !!arcBboxRaw, fillDistance: fillDistance,
             pushInRadius: pushInRadius, radiusMin: radiusMin, radiusMax: radiusMax,
             pivot: pivot, pivotSrc: pivotSrc, settle: settle, exit: chosenExit,
             beats: { dive: tD, spin: tS, out: tO, pullout: tP, flyback: tF, reveal: tV, rise: tR },
             // §CPE_DISCIPLINE_REVEAL_PULLOUT — the pacing info A.cpeRevealVisualAt(plan, tNorm) and
             // A.cpeRevealCaptionAt(plan, tNorm) need to compute which visual phase/caption a given
             // tNorm falls in, exposed here rather than recomputed (or duplicated) outside this
             // closure. `riseSec` is the UNFOLDED pull-back budget (matches beats.rise minus the
             // folded tail) — cpeRevealVisualAt needs it separately to find the tail/rise-proper split
             // inside the now-larger [tV,tR] span. `qtyCost` is the "good touch" nice-to-have (see
             // A.cpeRevealDiscQtyCost's own comment) — {} when the DB query is unavailable/failed.
             reveal: { discs: _revealDiscs, pulloutSec: _revealPulloutSec, roundSec: _revealRoundSec,
                       tailSec: _revealTailSec, riseSec: _useSec.rise, qtyCost: _revealQtyCost },
             // §CINEMA_PATH_EDITOR: the editor's table renders `waypoints` (authored control points,
             // NOT the rounded flown polyline) and re-times off `pathLen`. `sec` echoes the beat
             // seconds actually in force for this plan so the editor never has to guess them back
             // out of the normalized beat fractions.
             waypoints: outWp.map(function(w) { return { x: w.x, y: w.y, z: w.z }; }),
             // §CPE_REOPEN_NODE: `_stick`/`_s` ride along. The plan is what the editor RE-OPENS from
             // (cinema_path_editor.js:1454), so dropping them here made a re-opened path fall back to
             // "every middle band is a stick" — which mislabels seeded bands and, now that colour
             // follows provenance, would paint them as nodes the user never added. Measured RED by
             // witness_cpe_reopen_node.js G-RN-3 with only the editor side of this fix in place.
             bands: _cpeBands ? _cpeBands.map(function(b) {
               // §CPE_STICK_HOLD rides along for the same reason `_stick`/`_s` do (§CPE_REOPEN_NODE):
               // the plan is what the editor RE-OPENS from, so a dropped field silently resets the
               // user's typed hold to 0 on the next OK.
               // §CPE_AIM_PIN rides along for the same reason: the plan is what the editor
               // RE-OPENS from, so a dropped field would silently un-pin every band on the next OK.
               return { c: { x: b.c.x, y: b.c.y, z: b.c.z }, d: { x: b.d.x, y: b.d.y, z: b.d.z }, len: b.len,
                        hold: +(b.hold || 0), _stick: b._stick, _s: b._s,
                        lookAt: b.lookAt ? { x: b.lookAt.x, y: b.lookAt.y, z: b.lookAt.z } : null };
             }) : null,
             // §CPE_CONE_ORIENT_ADJUST rides along for the same §CPE_REOPEN_NODE reason as `bands`
             // above: the plan is what the editor RE-OPENS from, so a dropped field would silently
             // discard every corrected gaze on the next OK.
             aimCorrections: _cpeCorrections ? _cpeCorrections.map(function(c) {
               return { pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z }, dir: { x: c.dir.x, y: c.dir.y, z: c.dir.z },
                        ramp: +(c.ramp != null ? c.ramp : 2), hold: +(c.hold != null ? c.hold : 5),
                        decay: +(c.decay != null ? c.decay : 4) };
             }) : null,
             flownPoints: flowWp.length, pathLen: totalLen, route: outRoute, authored: outRoute === 'authored',
             sec: { dive: _useSec.dive, spin: _useSec.spin, out: _useSec.out, pullout: _useSec.pullout,
                    flyback: _useSec.flyback, reveal: _useSec.reveal, rise: _useSec.rise },
             naturalSec: _natSec, naturalTotal: _natTotal,
             eyeM: CINEMA_EYE_M, lookdownDeg: CINEMA_LOOKDOWN_DEG, durationSec: durationSec,
             indoor: true, poseAt: poseAt,
             // §CPE_STICK_APPROACH: stickCount=0 (the common case — no editor bands, or bands with no
             // user-dropped sticks) means the bake HUD adds nothing; stickApproachAt(tNorm) returns
             // {index, count, s, e3} for the next stick ahead, or null once the walk is past all of them.
             stickCount: _stickList.length, stickApproachAt: _stickApproachAt };
  }
  // ══ §CINEMA_PATH_EDITOR — the override seam. Deliberately a THIN WRAPPER rather than edits inside
  // _cinemaPathPlan: the plan function is 600+ lines and its §CINEMA_SPACE block is another session's
  // working set (see the spec's DO-NOT-REMOVE header), so this feature touches it as little as
  // possible. The overridable inputs are module-level `var`s in this same IIFE, so they can be set,
  // the untouched plan called, and restored in `finally`.
  // Guardrail 2 falls out for free: with no override this calls _cinemaPathPlan(durationSec) with
  // every global at its original value — the same function with the same inputs, so "OK without an
  // edit is byte-identical to today" is a property of the code, not a hope pinned on a test.
  var _CPE_KEYS = [['diveSec', 'CINEMA_DIVE_SEC'], ['spinSec', 'CINEMA_SPIN_SEC'],
                   ['outSec', 'CINEMA_OUT_SEC'], ['riseSec', 'CINEMA_RISE_SEC'],
                   ['eyeM', 'CINEMA_EYE_M'], ['lookdownDeg', 'CINEMA_LOOKDOWN_DEG']];
  function _cpeSet(name, v) {
    if (name === 'CINEMA_DIVE_SEC') CINEMA_DIVE_SEC = v;
    else if (name === 'CINEMA_SPIN_SEC') CINEMA_SPIN_SEC = v;
    else if (name === 'CINEMA_OUT_SEC') CINEMA_OUT_SEC = v;
    else if (name === 'CINEMA_RISE_SEC') CINEMA_RISE_SEC = v;
    else if (name === 'CINEMA_EYE_M') CINEMA_EYE_M = v;
    else if (name === 'CINEMA_LOOKDOWN_DEG') CINEMA_LOOKDOWN_DEG = v;
  }
  function _cpeGet(name) {
    return name === 'CINEMA_DIVE_SEC' ? CINEMA_DIVE_SEC : name === 'CINEMA_SPIN_SEC' ? CINEMA_SPIN_SEC :
           name === 'CINEMA_OUT_SEC' ? CINEMA_OUT_SEC : name === 'CINEMA_RISE_SEC' ? CINEMA_RISE_SEC :
           name === 'CINEMA_EYE_M' ? CINEMA_EYE_M : CINEMA_LOOKDOWN_DEG;
  }
  // ── §CINEMA_PATH_EDITOR persistence, read side. Restored LAZILY at first plan rather than at load:
  // the plan is the only consumer, so there is no window in which a stored path could be missed, and
  // it needs no hook in the load path at all. (This is deliberately NOT the staffage bug the spec
  // lists — staffage restores on first Alt+P, which is a *user action* and therefore genuinely too
  // late; a plan-time restore happens before the first thing that could observe it.)
  var _cpeLoaded = false;
  function _cpeLoadFromDb() {
    if (_cpeLoaded) return;
    _cpeLoaded = true;
    try {
      if (!A.dbQuery) return;
      var has = A.dbQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='cinema_path'");
      if (!has || !has.length) { console.log('§CINEMA_PATH_RESTORE none (no cinema_path table) — derived path'); return; }
      // §CPE_STICK_HOLD: hold_sec was appended after §CPE_PATH_NOT_PORTABLE shipped, so a .db saved
      // by an older build simply does not have the column and SELECTing it would throw — taking the
      // WHOLE path down over an optional field. Probe the table's own columns first and only ask for
      // what is there. Missing column == every hold 0, which is the documented default anyway.
      var _hasHold = false;
      try {
        var ti = A.dbQuery("PRAGMA table_info(cinema_path)");
        for (var _ti = 0; _ti < (ti || []).length; _ti++) if (ti[_ti][1] === 'hold_sec') _hasHold = true;
      } catch (eTi) {}
      var rows = A.dbQuery("SELECT seq,ifc_x,ifc_y,ifc_z,dir_x,dir_y,dir_z,len," +
        "total_sec,dive_sec,spin_sec,out_sec,rise_sec," +
        (_hasHold ? "hold_sec" : "0 AS hold_sec") + " FROM cinema_path ORDER BY seq");
      if (!rows || rows.length < 2) { console.log('§CINEMA_PATH_RESTORE none (0 rows) — derived path'); return; }
      // §CPE_BANDS: rebuilt as bands, so the rigid-straight invariant is restored with the data
      // rather than re-imposed by convention.
      var bands = rows.map(function(r) {
        var p = A.ifc2three(r[1], r[2], r[3]);
        var d = A.ifc2threeDir(r[4], r[5], r[6]);
        var L = Math.hypot(d.x, d.y, d.z) || 1;
        return { c: { x: p.x, y: p.y, z: p.z }, d: { x: d.x / L, y: d.y / L, z: d.z / L }, len: r[7],
                 hold: +(r[13] || 0) };
      });
      A._cinemaPathEdit = { bands: bands, diveSec: rows[0][9], spinSec: rows[0][10],
                            outSec: rows[0][11], riseSec: rows[0][12], _total: rows[0][8] };
      console.log('§CINEMA_PATH_RESTORE bands=' + bands.length + ' total=' + rows[0][8].toFixed(1) +
        's holdCol=' + _hasHold + ' holds=' + bands.filter(function(b) { return b.hold > 0.01; }).length +
        ' — authored path in force');
    } catch (e) { console.warn('§CINEMA_PATH_RESTORE_FAIL ' + e.message); }
  }
  // Staged by the editor's "Save this path"; read by scene.js `_writeCinemaPathTable` at export.
  A.stageCinemaPath = function(ov) {
    A._cinemaPathEdit = ov;
    // Same stale-field species as §CPE_OK_CRASH (cinema_maxq.js:507), caught while answering the
    // user's "how do I open a saved path?": §CPE_BANDS made the override carry `bands`, so this line
    // printed a flat `waypoints=0` for every save — guarded, so it never threw, and therefore never
    // got noticed. A log that lies about the thing it is reporting is worse than no log.
    console.log('§CINEMA_PATH_STAGE bands=' + (ov && ov.bands ? ov.bands.length : 0) +
      ' waypoints=' + (ov && ov.bands ? ov.bands.length * 2 : (ov && ov.waypoints ? ov.waypoints.length : 0)) +
      ' total=' + (ov && ov._total ? ov._total.toFixed(1) : '?') + 's' +
      ' — STAGED ONLY; Ctrl+S (Save Building) writes the cinema_path table into the .db');
  };
  A._getCinemaPathEdit = function() { return A._cinemaPathEdit || null; };
  A.clearCinemaPath = function() { A._cinemaPathEdit = null; console.log('§CINEMA_PATH_CLEAR authored path dropped'); };

  // ══ §CPE_PREVIEW_DIVERGENCE (CINEMA_PATH_EDITOR.md) — the plan reads A.camera.position and
  // A.controls.target directly, so it silently depends on WHERE THE USER IS LOOKING FROM at the
  // moment it is called. Measured live (user, Hospital, 2026-07-27): while editing, the orbited-in
  // camera gave targetOffCam=16.7 — under envelope*0.25=36.9, so §CINEMA_PIVOT stayed
  // `arc-bbox-centre` (dive 14.2m, spin 0.0deg). On OK the editor restores the camera it captured at
  // open, targetOffCam became 54.0 — over the threshold, so the SAME building planned
  // `controls-target(plausible)` at the origin: dive 77.2m, spin 118.1deg, facingDot 0.980 -> -0.471.
  // The user previewed a film with no spin and baked one that turns 118 degrees at the start.
  // FIX: an explicit camera basis. Same "set, call the untouched plan, restore in finally" pattern
  // the beat-second overrides above already use — the plan function itself stays untouched.
  // Nothing here moves the camera as far as any renderer is concerned: the swap and the restore
  // happen inside one synchronous call with no frame in between.
  // §CPE_BASIS_HALF_PIN (user's Hospital console, 2026-07-27 — "drag still jumps"). This pinned the
  // camera's POSITION and the orbit TARGET but never re-aimed the camera, and yaw0/pitch0 are read
  // from A.camera.getWorldDirection() — the camera's ROTATION, which this left untouched. So every
  // editor re-plan ran with the pinned position and whatever rotation the user had orbited to,
  // while the bake (finish() sets position + target + controls.update(), which DOES re-aim) ran
  // with the real basis. MEASURED in their log, same session, same edit:
  //     editing: yaw0=-88.9 pitch0=-16.9  exit facingDot=+0.456  spin -35.3 deg
  //     baking : yaw0=+91.5 pitch0=-81.0  exit facingDot=-0.450  spin 504.3 deg class=behind(full-lap)
  // A DIFFERENT exit door and a full extra lap of spin — the film they authored was not the film
  // that baked, which is the very thing §CPE_PREVIEW_DIVERGENCE was supposed to have closed. It was
  // only half closed: half a pin is not a pin.
  function _withCamBasis(basis, fn) {
    if (!basis) return fn();
    var c = A.camera, t = A.controls.target;
    var sp = { x: c.position.x, y: c.position.y, z: c.position.z };
    var st = { x: t.x, y: t.y, z: t.z };
    var sq = c.quaternion.clone();
    c.position.set(basis.px, basis.py, basis.pz);
    t.set(basis.tx, basis.ty, basis.tz);
    // The half that was missing: re-aim at the pinned target so getWorldDirection() reports the
    // basis being pinned, not the live orbit. updateMatrixWorld because the plan reads world state
    // within this same task, before any render tick would have refreshed it.
    c.lookAt(basis.tx, basis.ty, basis.tz);
    c.updateMatrixWorld(true);
    try { return fn(); }
    finally {
      c.position.set(sp.x, sp.y, sp.z); t.set(st.x, st.y, st.z);
      c.quaternion.copy(sq); c.updateMatrixWorld(true);
    }
  }

  // §CPE_REPLAN_LAZY — the "re-derive entry" control (the spec's own ask: re-deriving the entry is
  // a real thing the user may WANT — a different room to dive into, a different exit door — it just
  // must not happen eight times by accident while dragging a stick).
  A.cinemaPrefixInvalidate = function(reason) {
    _cinemaPrefixCache = null;
    console.log('§CPE_REPLAN_LAZY invalidated reason=' + (reason || 'manual'));
  };

  A.cinemaPathPlan = function(durationSec, ov) {
    // `undefined` means "use whatever is stored/staged"; an explicit null means "derived, ignore any
    // stored edit" — the G5 control path needs that distinction to be expressible.
    if (ov === undefined) { _cpeLoadFromDb(); ov = A._cinemaPathEdit || null; }
    if (!ov) return _cinemaPathPlan(durationSec);
    if (ov._camBasis) return _withCamBasis(ov._camBasis, function() {
      var o = {}; for (var q in ov) if (q !== '_camBasis') o[q] = ov[q];
      return A.cinemaPathPlan(durationSec, o);
    });
    var saved = [], i, savedSecOv = _cpeSecOverride;
    _cpeSecOverride = ['diveSec', 'spinSec', 'outSec', 'riseSec']
      .some(function(k) { return ov[k] != null && isFinite(ov[k]); });
    for (i = 0; i < _CPE_KEYS.length; i++) {
      var k = _CPE_KEYS[i][0], g = _CPE_KEYS[i][1];
      saved.push(_cpeGet(g));
      if (ov[k] != null && isFinite(ov[k])) _cpeSet(g, ov[k]);
    }
    var savedWp = _cpeWp, savedBands = _cpeBands, savedHose = _cpeHose, savedReveal = _cpeReveal,
        savedCorr = _cpeCorrections;
    // §CPE_HOSE: ops ride the same override object the editor already stages and saves, so a hosed
    // path travels through Save / reload / bake by the existing seam — no second persistence path.
    _cpeHose = (ov.hose && ov.hose.length) ? ov.hose : null;
    if (ov.waypoints && ov.waypoints.length >= 2) _cpeWp = ov.waypoints;
    // §CPE_BANDS takes precedence: bands EXPAND to waypoints inside the plan, so passing both would
    // be ambiguous. Bands win because they carry the rigidity constraint that loose points cannot.
    if (ov.bands && ov.bands.length >= 2) { _cpeBands = ov.bands; _cpeWp = null; }
    _cpeReveal = !!ov.reveal;
    // §CPE_CONE_ORIENT_ADJUST: same wrapper pattern as hose/reveal above — a plain array of plain
    // correction objects, no rigidity/expansion concept like bands, so no precedence rule is needed.
    _cpeCorrections = (ov.aimCorrections && ov.aimCorrections.length) ? ov.aimCorrections : null;
    try {
      return _cinemaPathPlan(durationSec);
    } finally {
      for (i = 0; i < _CPE_KEYS.length; i++) _cpeSet(_CPE_KEYS[i][1], saved[i]);
      _cpeWp = savedWp; _cpeBands = savedBands; _cpeHose = savedHose; _cpeSecOverride = savedSecOv;
      _cpeReveal = savedReveal; _cpeCorrections = savedCorr;
    }
  };
  A.cinemaPathPlanDerived = _cinemaPathPlan;   // unwrapped, for G1's byte-identity comparison
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
    // §CINEMA_DAMPING_BLEED (2026-07-26, user: "a slight twitch at the first second of the movie,
    // where the screen size is adjusted slightly narrower. Tested on two buildings it is so").
    // A recording is a FULLY AUTHORED camera — cinemaPathPlan owns every pose. But step() below does
    // camera.position.set(pose) → controls.update(), and OrbitControls.update() recomputes the
    // position from its OWN spherical state with the dampened deltas applied, OVERWRITING the pose
    // that was just authored. With scene.js's enableDamping/dampingFactor=0.08, the residual left by
    // whatever navigation the user did immediately before pressing Alt+C bleeds into the film:
    // measured 1.637% of the look distance at frame 0, decaying by exactly 0.92 = 1 - dampingFactor
    // per frame, i.e. ~1-2s to become invisible. That is the reported twitch.
    // Damping is an INTERACTION affordance; it has no business editing an authored pose. Hold it off
    // for the run and flush the residual here, BEFORE frame 0. update() is still called every frame
    // (it has other duties) — with damping off it applies zeroed deltas and preserves the pose
    // exactly. Restored on every exit path below, next to the SSAA detach.
    var _dampSaved = A.controls.enableDamping, _dampHeld = false;
    function _cinemaDampRelease() {
      if (!_dampHeld) return;
      _dampHeld = false; A.controls.enableDamping = _dampSaved;
      console.log('§CINEMA_DAMPING_BLEED released (enableDamping restored to ' + _dampSaved + ')');
    }
    A.controls.enableDamping = false; _dampHeld = true;
    // One-off flush: with damping off, update() applies the ENTIRE remaining delta at once instead
    // of 8% of it per frame (measured 13.3m on a fresh drag). That is exactly what we want, and it
    // is harmless here — it lands BEFORE the first authored pose, which overwrites the position
    // outright. Doing it after frame 0 would put that whole jump INSIDE the film.
    A.controls.update();
    console.log('§CINEMA_DAMPING_BLEED held (enableDamping ' + _dampSaved + ' -> false for the recording)');

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
    catch (e) { console.warn('§CINEMA_FAIL MediaRecorder ctor: ' + e.message); _cinemaDampRelease(); _cinemaSsaaDetach(); _teardownStillRefine('cinema-fail'); _cinemaActive = false; return; }
    recorder.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function() {
      var blob = new Blob(chunks, { type: mimeType });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'BIM_Cinema_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.webm';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
      console.log('§CINEMA_ORBIT saved size=' + blob.size + ' type=' + mimeType);
      _cinemaDampRelease();      // §CINEMA_DAMPING_BLEED: recording over — user's damping back
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
      if (!_cinemaActive) { _giCinemaPresetRestore(); _cinemaDampRelease(); _cinemaSsaaDetach(); return; }  // early abort (stopCinemaOrbit) — restore GI + head pass + damping too
      var tNorm = Math.min(1, (performance.now() - startMs) / durationMs);
      // §CINEMA_PATH: pose from the shared plan (§CINEMA_SIMPLE's one routine — dive → spin →
      // out → rise → orbit) — the SAME path the MaxQ exporter flies.
      var pose = plan.poseAt(tNorm);
      A.camera.position.set(pose.x, pose.y, pose.z);
      A.controls.target.set(pose.tx, pose.ty, pose.tz);
      A.controls.update();
      _updateCamLight(pose.tx, pose.ty, pose.tz);
      _sunArcStep(tNorm);
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
