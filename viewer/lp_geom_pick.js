// cpe_load_path family — part `geom_pick` (original cpe_load_path.js lines 1153–2255).
// Split mechanically from the single file (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §5, 2026-10-06). The only edits:
// names shared across parts are reached through LP (the one shared object setupCpeLoadPath creates), and top-level
// `var` statements run as assignments in phase 2 (their names are hoisted to this part, as before). Load order and the
// two-phase setup live in cpe_load_path.js. Witness: viewer/tests/witness_cpe_load_path_surface.js (W-LP-SURFACE).
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts = (typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts.geom_pick = function __lpPart_geom_pick(A, LP) {
  'use strict';
  // literal-valued constants, verbatim (evaluating a literal earlier changes nothing)      // {meshId: {slotId: guid}} — lazily built from A._batchMeta
  // ROUND 15 item 1 — guid -> IFC class, for the `hop0Occluder=IfcWall:guid` diagnostic. Sourced
  // straight from `A._batchMeta`'s own `ifcClass` field (streaming.js's own `_batchMeta[meshId] =
  // [{guid, storey, disc, ifcClass, slotId}, ...]` shape) — never a second DB query in the hot
  // raycast loop. InstancedMesh guids (`A._instanceGuids`, which carries no class field) read as
  // unknown here — disclosed, never invented.
  var _revGuidClass = null;
  // The raycast universe — regular + instanced/batched building meshes, EXCLUDING this beat's own
  // clones (userData._loadPathClone) so a stack can never occlude itself. Cached once per hold
  // (reset at build/dispose), never rebuilt per candidate or per sample point. Fix 1b (ROUND 13,
  // belt AND suspenders): every clone ALSO gets `mesh.raycast = noop` at build time
  // (`_buildChainClones`), so this filter alone is never the only thing standing between a clone
  // and a false self-hit.
  var _rayMeshCache = null;
  // ROUND 15 item 1 (2026-09-16, real HHS R14 bake: raysCast=35158 hitsTotal=30351 selfHits=29 — not
  // blind, rays genuinely hit geometry, but only 0.08% resolve to self, so every candidate read
  // ~0 unoccluded) — root cause: the sample points lie on the member's BOUNDING-BOX faces, not its
  // real surface, so a box-face point routinely sits in EMPTY AIR beyond a non-box-shaped member's
  // actual mass (a thin/rounded/L-shaped member, or simply a box corner past the real solid). The
  // OLD test ("first hit is self, else occluded") then blamed whatever the ray happened to reach
  // next — a wall or slab merely CO-LOCATED with that box-face point, never actually standing between
  // the camera and the member. REDEFINED: a sample is UNOCCLUDED iff the first hit is self, OR the
  // first hit's distance >= (distance camera->sample point - eps) — i.e. NOTHING lies strictly
  // BETWEEN the camera and the box face, regardless of what (or whether anything) is found at or
  // beyond that depth. A true occluder must be CLOSER than the sample point. No hit at all (nothing
  // in the way, up to the far cutoff) also counts as unoccluded — unchanged, never a false negative
  // from a lookup gap.
  var OCCLUSION_EPS = 0.05;

  // v4: the bbox is the clones' OWN geometry-aware THREE.Box3 in scene space (not a padded point
  // cloud) — per instruction, after updateMatrixWorld(true) on each clone.
  // §129.8 item 3 — parameterized (`hopsUp`, defaulting to the NEAR stack's own `_lp.hopsUp` for
  // every pre-existing call site) so the SAME box math serves either stack, never a second copy.
  function _chainWorldBBox(hopsUp) {
    var box = null;
    (hopsUp || LP._lp.hopsUp).forEach(function (h) {
      if (!h._cloneMesh) return;
      h._cloneMesh.updateMatrixWorld(true);
      var b = new THREE.Box3().setFromObject(h._cloneMesh);
      if (!box) box = b; else box.union(b);
    });
    return box;
  }
  // ══ ROUND 5 (2026-09-16, real Terminal bake: PICK said visibleHops=7/7 from DB-metadata boxes,
  // but the CLONE MESHES the film actually draws were somewhere else — none in frustum, two not even
  // solid) ═══════════════════════════════════════════════════════════════════════════════════════
  // "the same path that places the real geometry can never disagree with it": find the SOURCE
  // INSTANCE (container + slot) a guid actually lives in — A._instanceGuids is the ready-made O(1)
  // index streaming.js already maintains for InstancedMesh elements; BatchedMesh elements have no
  // such index (only the reverse A.guidMap[meshId_slotId]->guid), so those fall back to a scoped
  // linear scan of A._batchMeta (done once per hop at ARM/BUILD time, never per-frame). Returns the
  // REAL, currently-rendered world matrix — container.getMatrixAt(index) premultiplied by the
  // container's own matrixWorld — so no independent re-derivation of building offset / ifc2three
  // scale-rotation / any container-level transform can ever disagree with what is actually drawn.
  function _sourceInstance(guid) {
    if (!A.scene || typeof THREE === 'undefined') return null;
    var meshId = null, index = null;
    var hit = A._instanceGuids && A._instanceGuids[guid];
    if (hit) { meshId = hit.meshId; index = hit.instanceIndex; }
    else if (A._batchMeta) {
      for (var mid in A._batchMeta) {
        var arr = A._batchMeta[mid];
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i].guid === guid) { meshId = Number(mid); index = (arr[i].slotId != null) ? arr[i].slotId : i; break; }
        }
        if (meshId != null) break;
      }
    }
    if (meshId == null || index == null) return null;
    var mesh = A.scene.getObjectById(meshId);
    if (!mesh || typeof mesh.getMatrixAt !== 'function') return null;
    if (mesh.updateMatrixWorld) mesh.updateMatrixWorld(true);
    var local = new THREE.Matrix4();
    mesh.getMatrixAt(index, local);
    // §WORLDBOX_DLOD (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md): DLOD culls an off-screen instanced slot by writing a
    // zero-scale matrix (dlod.js) and keeps the real one as _origMatrix. Reading the live matrix then gave a (0,0,0) box and a
    // zero-scale Load Path clone (MEASURED: 25 lamp columns on a road + bridge merge). The placement is the saved one.
    var im = mesh.isInstancedMesh && A._instanceMeta && A._instanceMeta[meshId];
    if (im) {
      var me = (im[index] && im[index].instanceIndex === index) ? im[index] : null;
      if (!me) for (var j = 0; j < im.length; j++) if (im[j] && im[j].instanceIndex === index) { me = im[j]; break; }
      if (me && me._dlodHid && me._origMatrix) { local.copy(me._origMatrix); A._worldBoxDlodRestored = (A._worldBoxDlodRestored || 0) + 1; }
    }
    var world = local.clone().premultiply(mesh.matrixWorld);
    return { mesh: mesh, index: index, world: world };
  }
  // The container's own LOCAL (pre-world) bounding box for one slot — `getBoundingBoxAt` (modern
  // BatchedMesh API) when the container has it, else the shared `geometry.boundingBox` (InstancedMesh
  // — every instance shares one geometry, so this IS that slot's own local box).
  function _sourceLocalBox(mesh, index) {
    var box = new THREE.Box3();
    if (typeof mesh.getBoundingBoxAt === 'function') { mesh.getBoundingBoxAt(index, box); return box; }
    if (mesh.geometry) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.copy(mesh.geometry.boundingBox);
      return box;
    }
    return null;
  }
  // Real world AABB for a guid, from its SOURCE INSTANCE — the SAME box `_buildChainClones` places
  // its clone at and `§LOADPATH_CLONES` measures against. Returns null when no source instance can
  // be found (never falls back to the DB-coordinate math this round replaces — a hop this cannot
  // resolve is simply not counted as visible/measured, rather than risking a second disagreement).
  function _instanceWorldBox(guid) {
    var src = _sourceInstance(guid);
    if (!src) return null;
    var local = _sourceLocalBox(src.mesh, src.index);
    if (!local) return null;
    var world = local.clone().applyMatrix4(src.world);
    if (!isFinite(world.min.x) || !isFinite(world.max.x)) return null;
    return { minX: world.min.x, maxX: world.max.x, minY: world.min.y, maxY: world.max.y,
             minZ: world.min.z, maxZ: world.max.z, _box3: world, _srcWorld: src.world, _srcLocal: local };
  }   // ROUND 7 — direct dry run of the fallback criterion

  // ── v8: world AABBs straight from items[]' own DB-space bbox (x0/x1/y0/y1/bz/tz, already built for
  // the support-physics graph — zero extra DB queries) via A.modelOffset, the SAME axis mapping
  // A.ifc2three uses (X unchanged, Y=IFC Z, Z=-IFC Y — min/max on Z flip because of the negation).
  // No rotation is applied (matches A.ifc2three's own point-only contract) — an approximation for
  // rotated elements, disclosed in §129.4, not invented away. Still used for buildingBox/stackBox
  // (whole-building/whole-chain framing, informational) — NEVER for per-hop visibility any more
  // (ROUND 5 item 4 — see _instanceWorldBox above, which PICK's own visibleHopsOf/minMemberPxOf use). ──
  function _worldAABBFromItem(item) {
    var off = (A.modelOffset) || { x: 0, y: 0, z: 0 };
    return {
      minX: item.x0 - off.x, maxX: item.x1 - off.x,
      minY: item.bz - off.z, maxY: item.tz - off.z,
      minZ: -(item.y1 - off.y), maxZ: -(item.y0 - off.y)
    };
  }
  function _unionAABB(a, b) {
    if (!a) return b; if (!b) return a;
    return { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX),
             minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY),
             minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) };
  }
  function _buildingWorldBBox(items) {
    var box = null;
    for (var i = 0; i < items.length; i++) box = _unionAABB(box, _worldAABBFromItem(items[i]));
    return box;
  }
  function _cornersOfAABB(box) {
    var out = [];
    for (var xi = 0; xi < 2; xi++) for (var yi = 0; yi < 2; yi++) for (var zi = 0; zi < 2; zi++)
      out.push(new THREE.Vector3(xi ? box.maxX : box.minX, yi ? box.maxY : box.minY, zi ? box.maxZ : box.minZ));
    return out;
  }
  // ROUND 6 (2026-09-16, real Terminal bake: FRAMING aimed the camera at A.controls.target — stale/
  // wrong on Terminal's site coordinates, since cinema_maxq drives the bake camera directly and
  // never keeps controls.target in sync — reading `hopsIntersecting=0/7` while PICK's own
  // instance-world-box test, at the SAME shot pose, said 7/7) — the frustum-vs-box test itself is
  // factored out so it can run EITHER against a pushed HYPOTHETICAL pose (PICK's shot-search over
  // `plan.poseAt`, which carries its own real tx/ty/tz — never touches controls.target) OR against
  // the camera's CURRENT, already-correct matrices with no re-aim at all (FRAMING, at the live hold
  // pose — see _projectAABBLive below).
  function _frustumTestAtCurrentPose(box, camera) {
    var corners = _cornersOfAABB(box);
    var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    // v8c HARDENED (review, 2026-09-15, after a real HHS bake showed __lpFrameOff's own
    // hopsIntersecting stuck at 4/5, PASS, even though buildingInFrame correctly read 0.000): the
    // old "intersects" test took the min/max NDC span of all 8 projected corners with no regard to
    // whether a corner was actually IN FRONT of the camera (p.z<=1) — a box thousands of metres off
    // to the side has corners at extreme angles, some BEHIND the camera, whose perspective divide by
    // a near-zero/negative w flips their NDC sign onto essentially arbitrary values; the resulting
    // min/max span routinely covers all of [-1,1] by that artifact alone, reading "intersects=true"
    // for a box nowhere near the frustum. Replaced with a REAL frustum/box test (THREE.Frustum),
    // built from the SAME projectionMatrix/matrixWorldInverse.
    var fr = null;
    if (typeof THREE.Frustum === 'function' && typeof THREE.Matrix4 === 'function' && camera.matrixWorldInverse) {
      var frMat = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      fr = new THREE.Frustum().setFromProjectionMatrix(frMat);
    }
    var intersects;
    if (fr) {
      var fbox = new THREE.Box3(new THREE.Vector3(box.minX, box.minY, box.minZ), new THREE.Vector3(box.maxX, box.maxY, box.maxZ));
      intersects = fr.intersectsBox(fbox);
    }
    // ROUND 7 (2026-09-16, real Terminal bake: §LOADPATH_SHOT's own `buildingInFrame` — the SAME
    // per-corner check `fraction` here feeds — read 0.125 while FRAMING's `intersects`-based test on
    // the SAME pose read a different, frustum-correct picture; "the same corner-vs-frustum
    // inconsistency" as the v8c fix above, just in the OTHER metric this function returns): `fraction`
    // now counts a corner as "in" via `fr.containsPoint(corner)` — a WORLD-SPACE test against the
    // frustum's 6 planes — instead of the old NDC-range-plus-p.z<=1 check, which suffered the exact
    // same perspective-divide sign-flip artifact intersects used to. `containsPoint` cannot flip sign
    // (no perspective divide involved at all), so a corner behind/beside the camera is correctly
    // never counted, and one genuinely inside the frustum volume always is.
    var inCount = 0;
    corners.forEach(function (c) {
      var p = c.clone().project(camera);   // still needed for xmin/xmax/ymin/ymax (ndcHeight) and the stub fallback below
      xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y);
      var inFrustum = fr ? fr.containsPoint(c) : (p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1 && p.z <= 1);
      if (inFrustum) inCount++;
    });
    if (intersects == null) {
      // Fallback for a camera/THREE stub with no Frustum support — the old min/max span test,
      // known-imprecise on off-axis/behind-camera boxes, kept only so a call never throws outright.
      intersects = !(xmax < -1 || xmin > 1 || ymax < -1 || ymin > 1);
    }
    // §129.7 item 3 (2026-09-16) — the NDC y-span of the SAME 8 corners already projected above,
    // for `_memberPxHeight` below (never a second, re-projected opinion of the box's screen size).
    var ndcHeight = (isFinite(ymin) && isFinite(ymax)) ? Math.max(0, ymax - ymin) : null;
    // §129.8 item 2 — the NDC x-span too, for `screenArea` (§LOADPATH_FRAMING's own memberPx and
    // the scoring formula's screenArea) — SAME 8 corners, never a second projection.
    var ndcWidth = (isFinite(xmin) && isFinite(xmax)) ? Math.max(0, xmax - xmin) : null;
    return { fraction: inCount / 8, intersects: intersects, ndcHeight: ndcHeight, ndcWidth: ndcWidth };
  }
  // Corner-in-NDC fraction (0..1 of 8) for `box`, at a HYPOTHETICAL `pose` (a plain
  // {x,y,z,tx,ty,tz} — from `plan.poseAt`, the film's OWN planned position+look-target, NEVER
  // `A.controls.target`) using `camera` as a template (its own fov/aspect/projectionMatrix —
  // position/target/up are pushed to `pose` for the probe, then restored, since this evaluates a
  // CANDIDATE pose the live scene is not actually at — PICK's hold-point search only).
  function _projectAABB(box, pose, camera) {
    if (!camera || typeof THREE === 'undefined' || !camera.lookAt) return null;
    var savedPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    var savedUp = camera.up ? { x: camera.up.x, y: camera.up.y, z: camera.up.z } : null;
    camera.position.set(pose.x, pose.y, pose.z);
    if (camera.up && camera.up.set) camera.up.set(0, 1, 0);
    camera.lookAt(pose.tx, pose.ty, pose.tz);
    if (camera.updateMatrixWorld) camera.updateMatrixWorld();
    var result = _frustumTestAtCurrentPose(box, camera);
    camera.position.set(savedPos.x, savedPos.y, savedPos.z);
    if (savedUp && camera.up && camera.up.set) camera.up.set(savedUp.x, savedUp.y, savedUp.z);
    return result;
  }
  // ROUND 6 — the LIVE-pose test: the camera is ALREADY at its correct, real position+orientation
  // (the hold's own re-assert, item 1 below, put it there) — no pose is pushed, no lookAt, nothing
  // restored. This is what FRAMING projects with now, and the ONLY thing that fixes
  // "hopsIntersecting=0/7 while PICK said 7/7 at the SAME world boxes": the old code was aiming the
  // camera AWAY from the building via a stale A.controls.target before testing.
  function _projectAABBLive(box, camera) {
    if (!camera || typeof THREE === 'undefined') return null;
    if (camera.updateMatrixWorld) camera.updateMatrixWorld();
    return _frustumTestAtCurrentPose(box, camera);
  }
  // §129.7 item 3 — "a thicker member or a nearer one both raise it": the projected bbox HEIGHT in
  // PIXELS of one item at one pose, from the SAME `_projectAABB` NDC math every other visibility
  // check here already uses (`ndcHeight` spans a [-1,1] axis, i.e. 2 NDC units == `outH` px).
  function _memberPxHeight(box, pose, camera, outH) {
    var r = _projectAABB(box, pose, camera);
    if (!r || r.ndcHeight == null) return 0;
    return r.ndcHeight * (outH || 1080) / 2;
  }
  // ROUND 6 — the live-pose counterpart (FRAMING's own memberPx, no re-aim, see _projectAABBLive).
  function _memberPxHeightLive(box, camera, outH) {
    var r = _projectAABBLive(box, camera);
    if (!r || r.ndcHeight == null) return 0;
    return r.ndcHeight * (outH || 1080) / 2;
  }
  // §129.8 item 2 — screenArea (px²) of a box's projection at a live pose. Same NDC math every
  // other visibility check here already uses; never re-derived. Used both by the scoring formula
  // (item 3, screenArea) and by §LOADPATH_FRAMING's own memberPx print.
  function _screenAreaPxLive(box, camera, outW, outH) {
    var r = _projectAABBLive(box, camera);
    if (!r || r.ndcHeight == null || r.ndcWidth == null) return 0;
    return (r.ndcWidth * (outW || 1920) / 2) * (r.ndcHeight * (outH || 1080) / 2);
  }       // {guid: ifcClass}
  function _buildReverseIndexes() {
    LP._revInstanceIndex = {};
    var ig = A._instanceGuids || {};
    for (var g in ig) {
      var hit = ig[g];
      if (hit == null || hit.meshId == null) continue;
      if (!LP._revInstanceIndex[hit.meshId]) LP._revInstanceIndex[hit.meshId] = {};
      LP._revInstanceIndex[hit.meshId][hit.instanceIndex] = g;
    }
    LP._revBatchIndex = {};
    _revGuidClass = {};
    var bm = A._batchMeta || {};
    for (var mid in bm) {
      var arr = bm[mid];
      if (!arr) continue;
      if (!LP._revBatchIndex[mid]) LP._revBatchIndex[mid] = {};
      for (var k = 0; k < arr.length; k++) {
        var rec = arr[k];
        if (!rec) continue;
        var slot = (rec.slotId != null) ? rec.slotId : k;
        LP._revBatchIndex[mid][slot] = rec.guid;
        if (rec.guid != null && rec.ifcClass != null) _revGuidClass[rec.guid] = rec.ifcClass;
      }
    }
  }
  function _classForGuid(guid) {
    if (!_revGuidClass) _buildReverseIndexes();
    return (guid != null && _revGuidClass[guid] != null) ? _revGuidClass[guid] : null;
  }
  // `slotId` — the CALLER passes `hits[0].batchId != null ? hits[0].batchId : hits[0].instanceId`
  // (whichever the real hit actually carries), never `instanceId` alone. O(1) both branches.
  function _reverseGuidFor(object, slotId) {
    if (!LP._revInstanceIndex) _buildReverseIndexes();
    var byIdx = LP._revInstanceIndex[object.id];
    if (byIdx && slotId != null && byIdx[slotId] != null) return byIdx[slotId];
    var byBatch = LP._revBatchIndex[object.id];
    if (byBatch && slotId != null && byBatch[slotId] != null) return byBatch[slotId];
    if (object.userData && object.userData.guid) return object.userData.guid;   // a plain (non-instanced) mesh, best-effort
    return null;
  }
  function _raycastUniverse() {
    if (_rayMeshCache) return _rayMeshCache;
    if (!A.collectMeshes) return (_rayMeshCache = []);
    var regular = A.collectMeshes(function (o) { return o.isMesh && !o.isInstancedMesh && !o.isBatchedMesh && !(o.userData && o.userData._loadPathClone); });
    var instBatch = A.collectMeshes(function (o) { return (o.isInstancedMesh || o.isBatchedMesh) && !(o.userData && o.userData._loadPathClone); });
    _rayMeshCache = regular.concat(instBatch);
    return _rayMeshCache;
  }
  function _resetRayCache() { _rayMeshCache = null; LP._revInstanceIndex = null; LP._revBatchIndex = null; _revGuidClass = null; }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // §LOADPATH_BACKDROP generalized population (2026-09-16, red1 direct ruling: "ALL ELSE FADE OFF" —
  // no enumerated exceptions). "Is this object a real building element" (never faded) vs "is this
  // backdrop/context/staffage/prop" (must fade) is decided by the SAME reverse-guid machinery this
  // file already built for raycast occlusion — never a second, disagreeing classifier:
  //   • InstancedMesh/BatchedMesh: a container is a recognized building-element source iff its own
  //     mesh id has a NON-EMPTY entry in `_revInstanceIndex`/`_revBatchIndex` (built from
  //     A._instanceGuids/A._batchMeta — populated ONLY for real IFC-streamed elements, streaming.js).
  //     An instanced/batched container that resolves NO guids at all (e.g. a city-mode bbox
  //     placeholder, viewer/city.js — a different feature, never expected to coexist with a
  //     load-path beat's own hold, but classified correctly either way by this check rather than by
  //     assuming "any InstancedMesh is building") is therefore NOT exempted from the fade.
  //   • A regular (non-instanced/batched) mesh carrying `userData.isMerged` (streaming.js
  //     §MERGED_GUID) IS a building element despite having no single `userData.guid` of its own —
  //     it groups MULTIPLE real elements' geometry into one mesh, addressed via A._mergedMeta's own
  //     idxStart/idxCount ranges, not a mesh-level guid. Read directly in streaming.js (~L2519) before
  //     writing this check: without it, EVERY merged bucket (any storey/discipline/material group the
  //     compiler chose not to instance) would misclassify as "all else" and fade part of the real
  //     building — the exact risk this file's own task brief warned about, caught by reading the
  //     code, not guessed.
  //   • Otherwise (a plain regular mesh): building element iff `userData.guid` resolves, the SAME
  //     best-effort branch `_reverseGuidFor` itself falls back to for a non-instanced hit.
  function _isBuildingElementObj(obj) {
    if (obj.userData && obj.userData.isMerged) return true;   // streaming.js §MERGED_GUID — real geometry, no single guid
    if (obj.isInstancedMesh || obj.isBatchedMesh) {
      if (!LP._revInstanceIndex) _buildReverseIndexes();
      var byIdx = LP._revInstanceIndex[obj.id];
      if (byIdx && Object.keys(byIdx).length) return true;
      var byBatch = LP._revBatchIndex[obj.id];
      if (byBatch && Object.keys(byBatch).length) return true;
      return false;
    }
    return !!(obj.userData && obj.userData.guid != null);
  }
  // The "all else" population itself — every VISIBLE object A.collectMeshes's traversal reaches that
  // is neither this beat's own clone nor a recognized building element (above). Reuses A.collectMeshes
  // (the SAME universe `_applyGhost`/`_raycastUniverse` already walk — no second scene traversal),
  // broadened to ALSO match THREE.Sprite: staffage people/trees (§STAFFAGE_*, viewer/effects.js
  // §PHOTO_STAFFAGE) are cutout sprites, not meshes, and the user's own ruling explicitly names them
  // ("staffage — people/cars/trees... must ALSO fade off") — dropping them because the reused
  // predicate style elsewhere in this file happens to say `isMesh` only would silently lose the exact
  // coverage this generalization exists to add. The staffage CAR (a real THREE.Mesh, a loaded BufferGeometry,
  // §STAFFAGE_CAR_MESH) and ground/sky/skyline all fall out of "not a building element" naturally —
  // no hand-picked list.
  // A.ground is the ONE object A.collectMeshes itself always excludes ("Excludes ground plane",
  // viewer/helpers.js) — captured explicitly here IN ADDITION, never dropped. A._sky (three.js's own
  // Sky class extends Mesh, added directly via `scene.add(_sky)`) and the photo-skyline's box meshes
  // (THREE.Mesh, added into a THREE.Group that IS in the scene, viewer/effects.js) are both regular,
  // un-guid'd meshes A.collectMeshes's traversal already reaches on its own — verified by reading
  // scene.js/effects.js, not assumed — so neither needs the same explicit add-back A.ground does.
  function _allElseObjects() {
    var out = [];
    if (typeof A.collectMeshes === 'function') {
      A.collectMeshes(function (o) {
        if (o.userData && o.userData._loadPathClone) return false;   // never our own overlay — see _applyGhost's own gate
        if (o.visible === false) return false;                       // fade what is actually shown, never an already-hidden object
        // Fix (2026-09-17, red1: "background complete fade off" — confirmed real, not hypothetical:
        // `effects.js`'s skyline window-light glow (`_photoSkylineLights`, a `THREE.Points` object)
        // is genuinely visible during a load-path hold — `§PHOTO_STAGING on` fires and stays on
        // through the hold in a real bake (HHS_loadpath_r25.log) — and was silently excluded here
        // because this predicate never matched `isPoints`. `collectMeshes` itself does a raw
        // `scene.traverse` with no type pre-filter (helpers.js) — it reaches Points fine, this
        // predicate just never asked for them. `PointsMaterial` has the same standard
        // `.opacity`/`.transparent` fields `_backdropCapture`'s generic fade already reads off any
        // material — no special-casing needed once it's in the population.
        if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isSprite || o.isPoints)) return false;
        return !_isBuildingElementObj(o);
      }).forEach(function (o) { out.push(o); });
    }
    if (A.ground && A.ground.material && A.ground.visible !== false) out.push(A.ground);
    return out;
  }

  // Sample points on the box faces that face `camPos` — up to 3 faces face any exterior point of an
  // AABB; a grid of side*side points per facing face, side = ceil(sqrt(S/facingCount)), so the total
  // is >= S (never fewer — S is a MINIMUM, per the spec's own "sample S points, S >= 9"). Degenerate
  // (camera inside the box — no face faces it) samples all 6 rather than returning zero points.
  function _facingFaceSamples(box, camPos, S) {
    var cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, cz = (box.minZ + box.maxZ) / 2;
    var hx = (box.maxX - box.minX) / 2, hy = (box.maxY - box.minY) / 2, hz = (box.maxZ - box.minZ) / 2;
    var faces = [
      { n: [1, 0, 0], c: [box.maxX, cy, cz], u: [0, 1, 0], v: [0, 0, 1], hu: hy, hv: hz },
      { n: [-1, 0, 0], c: [box.minX, cy, cz], u: [0, 1, 0], v: [0, 0, 1], hu: hy, hv: hz },
      { n: [0, 1, 0], c: [cx, box.maxY, cz], u: [1, 0, 0], v: [0, 0, 1], hu: hx, hv: hz },
      { n: [0, -1, 0], c: [cx, box.minY, cz], u: [1, 0, 0], v: [0, 0, 1], hu: hx, hv: hz },
      { n: [0, 0, 1], c: [cx, cy, box.maxZ], u: [1, 0, 0], v: [0, 1, 0], hu: hx, hv: hy },
      { n: [0, 0, -1], c: [cx, cy, box.minZ], u: [1, 0, 0], v: [0, 1, 0], hu: hx, hv: hy }
    ];
    var facing = faces.filter(function (f) {
      var dx = camPos.x - f.c[0], dy = camPos.y - f.c[1], dz = camPos.z - f.c[2];
      return (dx * f.n[0] + dy * f.n[1] + dz * f.n[2]) > 0;
    });
    if (!facing.length) facing = faces;   // camera inside the box — sample every face, never zero
    var perFace = Math.max(1, Math.ceil(S / facing.length));
    var side = Math.max(1, Math.ceil(Math.sqrt(perFace)));
    var pts = [];
    facing.forEach(function (f) {
      for (var i = 0; i < side; i++) for (var j = 0; j < side; j++) {
        var pu = side > 1 ? (-1 + 2 * i / (side - 1)) : 0, pv = side > 1 ? (-1 + 2 * j / (side - 1)) : 0;
        pts.push({
          x: f.c[0] + f.u[0] * pu * f.hu + f.v[0] * pv * f.hv,
          y: f.c[1] + f.u[1] * pu * f.hu + f.v[1] * pv * f.hv,
          z: f.c[2] + f.u[2] * pu * f.hu + f.v[2] * pv * f.hv
        });
      }
    });
    return pts;
  }
  // S from the box's own screen size — a bigger member on screen gets more samples, never fewer
  // than 9 (the spec's own floor).
  function _sampleCountFor(screenAreaPx) {
    return Math.max(9, Math.min(49, Math.round((screenAreaPx || 0) / 300)));
  }
  function _memberUnoccluded(box, camPos, guid, S) {
    if (typeof THREE === 'undefined' || !THREE.Raycaster) return { unoccluded: 1, S: 0, raysCast: 0, hitsAny: 0, selfHits: 0, dominantOccluder: null };
    var pts = _facingFaceSamples(box, camPos, S);
    if (!pts.length) return { unoccluded: 0, S: 0, raysCast: 0, hitsAny: 0, selfHits: 0, dominantOccluder: null };
    var meshes = _raycastUniverse();
    var rc = new THREE.Raycaster();
    var hitsAny = 0, trueSelfHits = 0, unoccludedCount = 0;
    var occluderTally = {};   // ROUND 15 item 1 — guid -> count, among rays with a genuine (closer) occluder
    pts.forEach(function (p) {
      var dx = p.x - camPos.x, dy = p.y - camPos.y, dz = p.z - camPos.z, len = Math.hypot(dx, dy, dz) || 1e-6;
      rc.set(new THREE.Vector3(camPos.x, camPos.y, camPos.z), new THREE.Vector3(dx / len, dy / len, dz / len));
      if ('far' in rc) rc.far = len + OCCLUSION_EPS;
      var hits = meshes.length ? rc.intersectObjects(meshes, false) : [];
      if (!hits.length) { unoccludedCount++; return; }
      hitsAny++;
      var nearest = hits[0];
      // ROUND 13 Fix 1 — pass whichever slot id the hit actually carries: BatchedMesh hits carry
      // `batchId`, never `instanceId` (InstancedMesh-only); the OLD call here (`instanceId` alone)
      // is the real HHS defect's own root cause.
      var g = _reverseGuidFor(nearest.object, nearest.batchId != null ? nearest.batchId : nearest.instanceId);
      if (g === guid) { trueSelfHits++; unoccludedCount++; return; }
      // ROUND 15 item 1 — the ray reached at least as far as the member's own box-face point without
      // hitting anything CLOSER: the object found at/beyond that depth is not a true occluder (the
      // box-face sample simply lies beyond the member's real, non-box-shaped surface).
      if (nearest.distance >= len - OCCLUSION_EPS) { unoccludedCount++; return; }
      // A genuine occluder: something else is strictly CLOSER to the camera than this box-face point.
      if (g != null) occluderTally[g] = (occluderTally[g] || 0) + 1;
    });
    // Dominant occluder — the guid with the most occluding rays (informational, printed for hop 0 of
    // the drawn stack only; ties broken by first-seen, never a re-derived second opinion).
    var dominantGuid = null, dominantCount = 0;
    for (var og in occluderTally) { if (occluderTally[og] > dominantCount) { dominantGuid = og; dominantCount = occluderTally[og]; } }
    var dominantOccluder = dominantGuid ? { guid: dominantGuid, cls: _classForGuid(dominantGuid), count: dominantCount } : null;
    return { unoccluded: unoccludedCount / pts.length, S: pts.length, raysCast: pts.length, hitsAny: hitsAny,
             selfHits: trueSelfHits, dominantOccluder: dominantOccluder };
  }

  // A member's own screen-space box (px rect, clamped to the frame) — for the `underHud` test.
  function _screenRectPx(box, camera, outW, outH) {
    var corners = _cornersOfAABB(box);
    var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    corners.forEach(function (c) {
      var p = c.clone().project(camera);
      xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y);
    });
    if (!isFinite(xmin) || !isFinite(xmax)) return null;
    var x0 = (Math.max(-1, xmin) * 0.5 + 0.5) * outW, x1 = (Math.min(1, xmax) * 0.5 + 0.5) * outW;
    var y0 = (1 - (Math.min(1, ymax) * 0.5 + 0.5)) * outH, y1 = (1 - (Math.max(-1, ymin) * 0.5 + 0.5)) * outH;
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }
  // §129.8 item 2/4b — a member counts as hidden if its screen box intersects any HUD rect from the
  // ARM-FRAME snapshot (`_lp.armHudRects` — "what was on screen just before the freeze", item 4b's
  // own ruling; never the live, now-suppressed registry mid-hold).
  function _underHud(box, camera, outW, outH, hudRects) {
    if (!hudRects || !hudRects.length) return false;
    var r = _screenRectPx(box, camera, outW, outH);
    if (!r) return false;
    for (var i = 0; i < hudRects.length; i++) {
      var h2 = hudRects[i];
      if (!(r.x + r.w <= h2.x || h2.x + h2.w <= r.x || r.y + r.h <= h2.y || h2.y + h2.h <= r.y)) return true;
    }
    return false;
  }

  // §129.8 item 3, ROUND 12 item 1 (2026-09-16, real HHS bake: PICK chose a 2-hop slab reading
  // memberPx=[1584.9,212.2] memberVis=[0.11,0] over the good 5-hop column ladder — Σ(unoccluded x
  // screenArea) rewards a giant, mostly-hidden member because its huge screenArea alone can outweigh
  // a whole stack of small, genuinely-visible ones) — a hop only counts as VISIBLE (`majorityVisible`)
  // when the MAJORITY of its sampled surface is unoccluded (`unoccluded >= 0.5`) and it is not under
  // the arm-frame HUD; `score`/`occludedScore` are kept (still printed, still the FINAL tie-break)
  // but ranking's PRIMARY key is now the count of majority-visible hops (see `_pickTwoStacks`).
  // Raycasts/projects ONLY hops whose box passes the live frustum test first (§129.8 item 2's own
  // cost discipline); a hop that fails the frustum test contributes 0 and is not raycast at all.
  function _scoreChain(chainIdx, items, camera, outW, outH, hudRects) {
    var perHop = [];
    var score = 0, occludedScore = 0, distSum = 0, distN = 0, visibleHopsMajority = 0, visibleHopsFrustum = 0;
    // ROUND 13 Fix 2 / ROUND 14 — raw ray/hit/self-hit totals, summed across this chain's own hops,
    // for the raycast-blind self-check (see _pickTwoStacks). `hitsAnyTotal` (ROUND 14, NEW) is
    // distinct from `selfHitsTotal` — see _memberUnoccluded's own comment.
    var raysCastTotal = 0, hitsAnyTotal = 0, selfHitsTotal = 0;
    chainIdx.forEach(function (i) {
      var guid = items[i].guid;
      var box = _instanceWorldBox(guid);
      if (!box) { perHop.push({ guid: guid, unoccluded: 0, screenArea: 0, underHud: false, visible: false, majorityVisible: false }); return; }
      var camPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      var fr = _projectAABBLive(box, camera);
      if (!fr || !fr.intersects) { perHop.push({ guid: guid, unoccluded: 0, screenArea: 0, underHud: false, visible: false, majorityVisible: false }); return; }
      // ROUND 13 addendum — the plain frustum-intersects count (the PRE-ROUND-12 rule), kept
      // alongside visibleHopsMajority so `_pickTwoStacks` can fall back to it when the raycast
      // itself is proven blind, never a second re-derivation of "does this hop's box hit the frame".
      visibleHopsFrustum++;
      var screenArea = _screenAreaPxLive(box, camera, outW, outH);
      var S = _sampleCountFor(screenArea);
      var mu = _memberUnoccluded(box, camPos, guid, S);
      var uo = mu.unoccluded;
      raysCastTotal += mu.raysCast; hitsAnyTotal += mu.hitsAny; selfHitsTotal += mu.selfHits;
      var underHud = _underHud(box, camera, outW, outH, hudRects);
      var hopScore = underHud ? 0 : (uo * screenArea);
      score += hopScore;
      occludedScore += (1 - uo);
      var cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, cz = (box.minZ + box.maxZ) / 2;
      distSum += Math.hypot(cx - camPos.x, cy - camPos.y, cz - camPos.z); distN++;
      // ROUND 12 item 1 — MAJORITY visible: unoccluded >= 0.5 (at least half the sampled surface is
      // actually seen) AND not under the HUD. A giant slab at 11% unoccluded is NOT visible by this
      // rule, however large its screenArea.
      var majorityVisible = !underHud && uo >= 0.5;
      if (majorityVisible) visibleHopsMajority++;
      perHop.push({ guid: guid, unoccluded: uo, screenArea: screenArea, underHud: underHud, visible: true, majorityVisible: majorityVisible,
                    dominantOccluder: mu.dominantOccluder });   // ROUND 15 item 1 — for hop0Occluder=
    });
    return { perHop: perHop, score: score, occludedScore: occludedScore, dist: distN ? distSum / distN : Infinity,
             visibleHopsMajority: visibleHopsMajority, visibleHopsFrustum: visibleHopsFrustum,
             raysCast: raysCastTotal, hitsAny: hitsAnyTotal, selfHits: selfHitsTotal };
  }

  // §129.8 item 3 — TWO STACKS. `valid` = every candidate from `_pick` (monotone-descending,
  // ground-ending, >=2 load-bearing hops); scores every one that has >=1 hop passing the frustum
  // test, picks NEAR (best) then FAR (best among candidates whose camera distance exceeds NEAR's by
  // >= the building's own extent along camDir — no threshold constant). `window.__lpOneStack=1`
  // forces FAR out regardless. `window.__lpPickOccluded=1` ranks by occludedScore DESC instead of
  // score DESC — the control's own inversion.
  // §129.8 item 3 — the building's own extent along a view direction: project the 8 corners of
  // `box` onto `dir` (from `pos`), span of the projections. No threshold constant — used both by
  // the build-time provisional FAR estimate (shotPose) and the arm-time FINAL pick (live camera).
  function _extentAlongDir(box, pos, dir) {
    if (!box) return 0;
    var lo = Infinity, hi = -Infinity;
    _cornersOfAABB(box).forEach(function (c) {
      var t = (c.x - pos.x) * dir.x + (c.y - pos.y) * dir.y + (c.z - pos.z) * dir.z;
      if (t < lo) lo = t; if (t > hi) hi = t;
    });
    return Math.max(0, hi - lo);
  }
  // ROUND 12 item 1 — the real comparator: MAJORITY-visible hop count is now the PRIMARY key (never
  // score alone — see _scoreChain's own comment for the real bake that proved score-alone wrong),
  // then total hops (depth), then score/occludedScore as the final tie-break. `window.__lpPickOccluded`
  // inverts the FIRST TWO keys (fewest majority-visible hops, fewest total hops) so the control still
  // deliberately prefers the worse candidate by the SAME rule the real pick now uses, never a
  // different metric that could coincidentally agree with the real rule by accident.
  // ROUND 13 addendum — `visKey` picks which visible-hop count this comparator ranks by
  // ('visibleHopsMajority' normally, 'visibleHopsFrustum' when `_pickTwoStacks` proves the raycast
  // itself is blind) — parameterized so there is only ever ONE comparator, never a second one
  // re-derived for the fallback case.
  function _stackCmp(a, b, occludedMode, visKey) {
    visKey = visKey || 'visibleHopsMajority';
    // §129.42 — STOREY SPAN IS THE FIRST KEY, in both directions. `occludedMode` is the
    // falsifiability control: it must keep preferring the WORSE candidate by the SAME rule the real
    // pick uses, so the new key has to lead there too (fewest storeys crossed), or the control
    // would silently start ranking by a metric the real path no longer leads with.
    var aSpan = a.storeySpan || 0, bSpan = b.storeySpan || 0;
    if (occludedMode) {
      if (aSpan !== bSpan) return aSpan - bSpan;
      if (a[visKey] !== b[visKey]) return a[visKey] - b[visKey];
      if (a.depth !== b.depth) return a.depth - b.depth;
      return b.occludedScore - a.occludedScore;
    }
    if (bSpan !== aSpan) return bSpan - aSpan;
    if (b[visKey] !== a[visKey]) return b[visKey] - a[visKey];
    if (b.depth !== a.depth) return b.depth - a.depth;
    if (b.score !== a.score) return b.score - a.score;
    return a.idx < b.idx ? -1 : (a.idx > b.idx ? 1 : 0);
  }
  // ROUND 17 — the cheap (no-raycast) pre-rank that bounds `_pickTwoStacks`'s expensive scoring pass
  // to SCORE_TOP_N candidates. Reuses the SAME frustum test + screen-area math `_scoreChain` itself
  // runs per hop (`_instanceWorldBox`/`_projectAABBLive`/`_screenAreaPxLive` — never `_memberUnoccluded`,
  // the raycast, which is the actual cost blowing up on Terminal), so this never adds a second,
  // disagreeing notion of "in frame". Primary key mirrors `_pickTwoStacks`'s own qualification rule
  // (both tier 1 and tier 2 require >=2 frustum-visible hops): a candidate that could never qualify
  // (hopsInFrustum<2) ranks lowest and is the first dropped once the pool exceeds the cap. Tie-broken
  // by summed screen area (an upper bound on the eventual score=uo*screenArea, uo in [0,1] — never
  // computed here, only estimated) then camera distance ASC (nearer first, all else equal — same
  // "nearer raises rank" convention `_rankValid`'s own minMemberPx tie-break follows elsewhere in this
  // file). Distance from the candidate's own hop boxes to the camera doubles as "distance to the hold
  // point" here since this runs at ARM, on the live (already-held) camera.
  function _cheapCandidateRank(items, chainIdx, camera, outW, outH) {
    var hopsInFrustum = 0, areaSum = 0, distSum = 0, distN = 0;
    chainIdx.forEach(function (i) {
      var box = _instanceWorldBox(items[i].guid);
      if (!box) return;
      var fr = _projectAABBLive(box, camera);
      if (!fr || !fr.intersects) return;
      hopsInFrustum++;
      areaSum += _screenAreaPxLive(box, camera, outW, outH) || 0;
      var cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, cz = (box.minZ + box.maxZ) / 2;
      distSum += Math.hypot(cx - camera.position.x, cy - camera.position.y, cz - camera.position.z); distN++;
    });
    return { hopsInFrustum: hopsInFrustum, areaSum: areaSum, dist: distN ? distSum / distN : Infinity };
  }
  // Ranks `valid` by the cheap signal above and caps it to `cap` entries — the ONLY gate between
  // `_pick`'s full candidate list and the expensive per-candidate `_scoreChain` pass below. A no-op
  // (returns `valid` itself, unranked) whenever `valid.length <= cap` or there is no live camera to
  // rank against — so a building small enough that this was never a problem (HHS/Hospital/LTU) is
  // byte-for-byte unaffected. Never mutates `valid`.
  function _rankAndCapForScoring(items, valid, camera, outW, outH, cap) {
    if (!camera || valid.length <= cap) return valid;
    var withRank = valid.map(function (c) {
      return { c: c, r: _cheapCandidateRank(items, c.chain, camera, outW, outH) };
    });
    withRank.sort(function (a, b) {
      if (b.r.hopsInFrustum !== a.r.hopsInFrustum) return b.r.hopsInFrustum - a.r.hopsInFrustum;
      if (b.r.areaSum !== a.r.areaSum) return b.r.areaSum - a.r.areaSum;
      return a.r.dist - b.r.dist;
    });
    return withRank.slice(0, cap).map(function (w) { return w.c; });
  }
  function _pickTwoStacks(items, valid, camera, outW, outH, hudRects, buildingBox) {
    var occludedMode = !!window.__lpPickOccluded;
    // ROUND 14 (2026-09-16, real HHS R13 bake: raycast STILL blind after ROUND 13 landed, with NO
    // §LOADPATH_VISIBILITY line at all — meaning ROUND 13's own blind condition, hitsTotal>0 &&
    // selfHits===0, never fired, so the aggregate totals themselves must have read 0) — rebuild the
    // raycast universe/reverse-index HERE, at ARM, immediately before scoring: never rely on
    // whatever `_raycastUniverse()`'s cache happened to capture earlier in this hold's own
    // lifetime — a stale/empty capture from before this hold's chain clones existed (or from a
    // scene not yet fully populated) would otherwise silently stay cached, unrefreshed, for the
    // rest of the hold, since the cache's own contract is "build once, reuse until _resetRayCache()".
    _resetRayCache();
    var universe = _raycastUniverse().length;
    // ROUND 17 — bound the expensive per-candidate raycast pass below to SCORE_TOP_N candidates,
    // cheaply pre-ranked (see `_rankAndCapForScoring` just above); a no-op whenever `valid.length` is
    // already <= SCORE_TOP_N. `validTotal`/`scoredCount` are carried through every return below so a
    // reviewer can see, from the log alone, that the cap fired (and by how much) on a real bake.
    var capped = _rankAndCapForScoring(items, valid, camera, outW, outH, LP.SCORE_TOP_N);
    var validTotal = valid.length, scoredCount = capped.length;
    // ROUND 18 — gate the expensive raycast pass on the RAYCAST UNIVERSE's own total instance count
    // (see `RAYCAST_INSTANCE_BUDGET`'s own comment), not just candidate count: a TEMP diagnostic
    // (since removed) proved Terminal's 40 SCORE_TOP_N-capped candidates still hang forever, because
    // each one's `_scoreChain`/`_memberUnoccluded` raycasts against `_raycastUniverse()`, and
    // Terminal's universe is 1310 OBJECTS but ~49,612 TOTAL INSTANCES (BatchedMesh/InstancedMesh
    // containers each holding tens of thousands of internal instances three.js raycasts one-by-one,
    // no broad-phase acceleration) — computed ONCE here, only when there is something to score, and
    // strictly BEFORE any `_scoreChain` call, so the check itself is cheap and gates the expensive
    // work rather than running after the damage is done.
    if (capped.length > 0) {
      var instanceSum = 0, universeMeshes = _raycastUniverse();
      for (var ui = 0; ui < universeMeshes.length; ui++) {
        var um = universeMeshes[ui];
        instanceSum += (um.isInstancedMesh ? (um.count || 0)
          : um.isBatchedMesh ? ((A._batchMeta && A._batchMeta[um.id] && A._batchMeta[um.id].length) || um.maxInstanceCount || 0)
          : 1);
      }
      if (instanceSum > LP.RAYCAST_INSTANCE_BUDGET) {
        // Raycast universe too large to score even the capped pool — skip `_scoreChain` entirely
        // (never call it, not even once) and fall back to the SAME accepted "can't get a real
        // occlusion answer" path used elsewhere (`pickSource=frustum-fallback`), extended with a new,
        // honest reason distinct from `no-unoccluded-candidate` (that one means tier 1 genuinely
        // found nobody AFTER raycasting — this means raycasting was never attempted at all).
        // `capped` is already ranked best-first by `_rankAndCapForScoring`'s own cheap signal
        // (frustum hop count, then screen area, then camera distance — never re-ranked here); NEAR is
        // simply its first entry. FAR reuses the exact same spacing rule the real path uses just
        // below (`_extentAlongDir` + "camera distance from NEAR >= the building's own extent"), walking
        // `capped` in that same best-first order for the first candidate far enough from NEAR — i.e.
        // the second-best-that's-far-enough, never a second, re-derived notion of "far".
        // Capture the REAL `_cheapCandidateRank` fields (not just `.dist`) — `hopsInFrustum` is the
        // actual measured frustum-visible hop count for this candidate, never an assumed maximum.
        var rankedCapped = capped.map(function (c) {
          var r = _cheapCandidateRank(items, c.chain, camera, outW, outH);
          return { c: c, dist: r.dist, hopsInFrustum: r.hopsInFrustum, areaSum: r.areaSum };
        });
        var fbToStack = function (rc) {
          // Occlusion was NEVER tested on this path (that's the whole point of skipping the raycast
          // pass) — `unoccluded: null` is the honest "not measured" value (not 0, not 1), never a
          // fabricated pass/fail. Every consumer of `perHop[i].unoccluded` (`fmtMemberVis` here, and
          // `_framingWitness`'s own `memberVis` build) must print `n/a` for `null`, never feed it
          // straight into `.toFixed(2)` as if it were a real measurement.
          var perHop = rc.c.chain.map(function (i) {
            return { guid: items[i].guid, unoccluded: null, screenArea: 0, underHud: false, visible: true,
                     majorityVisible: true, dominantOccluder: null };
          });
          return { idx: rc.c.idx, chain: rc.c.chain, depth: rc.c.depth, score: 0, occludedScore: 0,
                   dist: rc.dist, perHop: perHop, visibleHopsMajority: rc.c.chain.length,
                   storeySpan: LP._chainStoreySpan(items, rc.c.chain),
                   visibleHopsFrustum: rc.hopsInFrustum, raysCast: 0, hitsAny: 0, selfHits: 0 };
        };
        // §129.42 FIX (2026-09-19, found on the Terminal bake, not by reading) — THIS PATH NEVER
        // RANKED. `rankedCapped` carries the CHEAP pre-rank's order (hopsInFrustum, screen area,
        // distance) and `rankedCapped[0]` was taken as the winner directly, so `_stackCmp` — and
        // with it storey span — was never applied on the frustum fallback at all. Every large
        // building takes this path (it is the raycast-universe-too-large escape), so §129.42 was
        // inert on exactly the models it matters most for. The log made it worse by printing
        // rankBy=storeySpan,... on this path regardless, and bestSpanAvail=0 because the field was
        // never attached: MEASURED on Terminal, nearSpan=3 bestSpanAvail=0, a chain that happened
        // to span three storeys by luck under a rule the log claimed had chosen it.
        // Now the candidates become stacks FIRST and go through the same one comparator the scored
        // path uses, with visKey 'visibleHopsFrustum' because that is the only visibility this path
        // has honestly measured. `dist` rides along on each stack, so the FAR pick below reads it
        // from the sorted list rather than from the pre-rank's own order.
        var fbStacks = rankedCapped.map(fbToStack);
        fbStacks.sort(function (a, b) { return _stackCmp(a, b, occludedMode, 'visibleHopsFrustum'); });
        var fbBestSpanAvail = fbStacks.reduce(function (m, c) { return Math.max(m, c.storeySpan || 0); }, 0);
        var fbNear = fbStacks[0];
        var fbPickSource = 'frustum-fallback reason=raycast-universe-too-large';
        if (window.__lpOneStack) {
          return { near: fbNear, far: null, farReason: 'one-stack-control', pickSource: fbPickSource,
                   raycastBlind: false, blindReason: null, tier: 2, visKey: 'visibleHopsFrustum',
                   raysCast: 0, hitsTotal: 0, selfHits: 0, universe: universe,
                   validTotal: validTotal, scored: scoredCount, bestSpanAvail: fbBestSpanAvail };
        }
        var fbCamPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        var fbCamDirV = (typeof camera.getWorldDirection === 'function' && typeof THREE !== 'undefined')
          ? camera.getWorldDirection(new THREE.Vector3()) : { x: 0, y: 0, z: -1 };
        var fbExtent = _extentAlongDir(buildingBox, fbCamPos, fbCamDirV);
        var fbFar = null;
        for (var fi = 1; fi < fbStacks.length; fi++) {
          if (fbStacks[fi].dist - fbStacks[0].dist >= fbExtent) { fbFar = fbStacks[fi]; break; }
        }
        return { near: fbNear, far: fbFar, farReason: fbFar ? null : 'none-beyond-depth', extent: fbExtent, bestSpanAvail: fbBestSpanAvail,
                 pickSource: fbPickSource, raycastBlind: false, blindReason: null, tier: 2, visKey: 'visibleHopsFrustum',
                 raysCast: 0, hitsTotal: 0, selfHits: 0, universe: universe,
                 validTotal: validTotal, scored: scoredCount };
      }
    }
    var scored = capped.map(function (c) {
      var s = _scoreChain(c.chain, items, camera, outW, outH, hudRects);
      return { idx: c.idx, chain: c.chain, depth: c.depth, score: s.score, occludedScore: s.occludedScore,
               dist: s.dist, perHop: s.perHop, visibleHopsMajority: s.visibleHopsMajority,
               storeySpan: LP._chainStoreySpan(items, c.chain),
               visibleHopsFrustum: s.visibleHopsFrustum, raysCast: s.raysCast, hitsAny: s.hitsAny, selfHits: s.selfHits };
    });
    // ROUND 13 Fix 2 / ROUND 14 (broadened) — "never silently premised on a lie": sum raw ray/hit/
    // self-hit totals across EVERY candidate BEFORE the visibility-count filter below, so the check
    // still fires even when that filter would otherwise exclude everyone.
    var raysCastTotal = 0, hitsTotal = 0, selfHitsTotal = 0;
    scored.forEach(function (s) { raysCastTotal += s.raysCast; hitsTotal += s.hitsAny; selfHitsTotal += s.selfHits; });
    // ROUND 15 (2026-09-16, real HHS R14 bake: raysCast=35158 hitsTotal=30351 selfHits=29 — NOT
    // "blind" by intent, just genuinely low self-resolution once item 1's redefinition is in play) —
    // `selfHitsTotal===0` is DROPPED from the blind trigger: under item 1's new distance-based
    // occlusion rule, a ray that never precisely lands on a thin/recessed member's own real surface
    // legitimately contributes ZERO self-hits while still correctly reading UNOCCLUDED (it counts
    // toward `unoccludedCount`, never `selfHits`) — so `selfHitsTotal` can be low or exactly 0 for a
    // perfectly healthy, fully-visible candidate, and is no longer a reliable signal of a broken
    // pipeline. `blind` now means ONLY "the raycast infrastructure produced no signal at all":
    // `raysCast===0` (the live frustum test never passed for any hop of any candidate) or
    // `hitsTotal===0` (rays were cast but the universe returned nothing, e.g. truly empty) — a
    // genuinely, fully-occluded-by-real-geometry candidate (hitsTotal high, selfHits low/0) is NOT
    // blind; it is tier 1 legitimately finding nobody, handled by tier 2 below (item 2).
    var blind = scored.length > 0 && (raysCastTotal === 0 || hitsTotal === 0);
    var blindReason = raysCastTotal === 0 ? 'no-rays' : 'no-hits';
    if (blind) {
      console.log('§LOADPATH_VISIBILITY INCONCLUSIVE reason=raycast-blind(' + blindReason + ') raysCast=' + raysCastTotal +
        ' hitsTotal=' + hitsTotal + ' selfHits=' + selfHitsTotal + ' universe=' + universe);
    }
    // ROUND 15 item 2 (2026-09-16, real HHS R14 bake: raysCast=35158 hitsTotal=30351 selfHits=29 —
    // NOT blind by ROUND 14's own definition, yet zero candidates reached >=2 majority-unoccluded
    // hops, so the old two-way blind/not-blind branch fell straight through to `pickSource=none`
    // while the probe stack was still drawn — dishonest) — THREE explicit, honestly labelled tiers,
    // tried in order, applied identically to NEAR and FAR (both are drawn from whichever tier's own
    // `qualified` pool first produces >=2-hop candidates — never a second, independently-tiered
    // search for FAR):
    //   tier 1 — occlusion-scored (`visibleHopsMajority`, the normal/best case), tried FIRST even
    //            when the raw ray totals look thin, since a real bake can have selfHits>0 SOMEWHERE
    //            while genuinely having zero qualifying candidates (this round's own symptom) — that
    //            is tier 1 legitimately finding nobody, not a raycast defect.
    //   tier 2 — frustum-scored (`visibleHopsFrustum`, "the stack shines through occluders by
    //            design"), when tier 1 found nothing AND the raycast itself is NOT blind —
    //            `pickSource=frustum-fallback reason=no-unoccluded-candidate`.
    //   tier 3 — frustum-scored, when the raycast IS blind (ROUND 14's own aggregate check) —
    //            `pickSource=probe-fallback reason=raycast-blind(...)`, unchanged from ROUND 14.
    // `pickSource=none` may only ever print when NO tier's `qualified` pool has anybody at all.
    var tier1 = scored.filter(function (s) { return s.visibleHopsMajority >= 2; });
    var qualified, visKey, tier, tierReason;
    if (!blind && tier1.length) {
      qualified = tier1; visKey = 'visibleHopsMajority'; tier = 1; tierReason = null;
    } else {
      qualified = scored.filter(function (s) { return s.visibleHopsFrustum >= 2; });
      visKey = 'visibleHopsFrustum';
      if (blind) { tier = 3; tierReason = 'raycast-blind(' + blindReason + ')'; }
      else { tier = 2; tierReason = 'no-unoccluded-candidate'; }
    }
    if (!qualified.length) {
      return { near: null, far: null, pickSource: 'none', raycastBlind: blind, blindReason: blind ? blindReason : null,
               raysCast: raysCastTotal, hitsTotal: hitsTotal, selfHits: selfHitsTotal, universe: universe,
               tier: tier, visKey: visKey, validTotal: validTotal, scored: scoredCount,
               farReason: 'no-candidate-with-2-' + (tier === 1 ? 'majority' : 'frustum') + '-visible-hops' };
    }
    qualified.sort(function (a, b) { return _stackCmp(a, b, occludedMode, visKey); });
    // §129.42 — the best span ANY qualified candidate offered, recorded before the winner is taken.
    // If the winner's own span is lower than this, storey span did not decide the pick and the log
    // should be able to say so rather than leave it to be inferred.
    var bestSpanAvail = qualified.reduce(function (m, c) { return Math.max(m, c.storeySpan || 0); }, 0);
    var near = qualified[0];
    // A stack IS drawn here (`near` is real), so `pickSource` must never read `none`.
    var pickSource = tier === 1 ? 'live' : (tier === 2 ? ('frustum-fallback reason=' + tierReason) : ('probe-fallback reason=' + tierReason));
    if (window.__lpOneStack) {
      return { near: near, far: null, farReason: 'one-stack-control', pickSource: pickSource, bestSpanAvail: bestSpanAvail,
               raycastBlind: blind, blindReason: blind ? blindReason : null, tier: tier, visKey: visKey,
               raysCast: raysCastTotal, hitsTotal: hitsTotal, selfHits: selfHitsTotal, universe: universe,
               validTotal: validTotal, scored: scoredCount };
    }
    var camPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    var camDirV = (typeof camera.getWorldDirection === 'function' && typeof THREE !== 'undefined')
      ? camera.getWorldDirection(new THREE.Vector3()) : { x: 0, y: 0, z: -1 };
    var extent = _extentAlongDir(buildingBox, camPos, camDirV);
    var farPool = qualified.slice(1).filter(function (s) { return s.dist - near.dist >= extent; });
    farPool.sort(function (a, b) { return _stackCmp(a, b, occludedMode, visKey); });
    var far = farPool.length ? farPool[0] : null;
    return { near: near, far: far, farReason: far ? null : 'none-beyond-depth', extent: extent, bestSpanAvail: bestSpanAvail,
             pickSource: pickSource, raycastBlind: blind, blindReason: blind ? blindReason : null, tier: tier, visKey: visKey,
             raysCast: raysCastTotal, hitsTotal: hitsTotal, selfHits: selfHitsTotal, universe: universe,
             validTotal: validTotal, scored: scoredCount };
  }

  // ── v8 HOLD-POINT SEARCH — red1's relaxation: not a strict in-shot filter, a SEARCH for the first
  // tNorm (forward from topout) where the WHOLE BUILDING is >=80% in frame (corner fraction — chosen
  // over projected-area overlap for tractability, per §129.4's own disclosure), sampling the film's
  // OWN camera path with no render and no live-camera commitment. The search window is
  // [topoutU, topoutU + HOLD_CAP_SEC/filmSecFull] — this session's own definition of "to the
  // stats-round boundary" (no such variable exists pre-computed; disclosed, not discovered).
  // ROUND 7 (2026-09-16, real Terminal bake) — (a) samples via `A._bakeCameraPoseAt(tn)` (the real,
  // gaze-blended per-frame pose cinema_maxq.js's own frame loop builds) when exposed, never the raw
  // `plan.poseAt(tn)` alone — a hypothetical pose the bake never actually renders is not "the same
  // pose" FRAMING later reads live. (b) when NO sample reaches the 80% rule, falls back to red1's own
  // ruling: the sample where the BEST candidate chain (whichever, at THAT sample, shows the most) has
  // the most hops in the frustum — "so the hold lands where a stack is visible" — printed as
  // `bestVisibleHops=`. `validChains`/`items` (optional — from `pick.valid`, already computed by the
  // time this runs) enable that fallback; omitted, this degrades to the old building-fraction-only
  // fallback (never a null pose or a thrown error). ─────────────────────────────────────────────────
  function _searchHoldPoint(plan, topoutU, filmSecFull, buildingBox, items, validChains) {
    var poseAtFn = (typeof A._bakeCameraPoseAt === 'function') ? A._bakeCameraPoseAt
      : (plan && typeof plan.poseAt === 'function') ? plan.poseAt : null;
    if (!poseAtFn || !A.camera) {
      return { tNorm: topoutU, buildingInFrame: null, best: true, reason: 'no-plan', bestVisibleHops: null };
    }
    var windowU = filmSecFull > 0 ? Math.min(1 - topoutU, LP.HOLD_CAP_SEC / filmSecFull) : 0;
    var bestTn = topoutU, bestF = -1;
    var bestVisTn = topoutU, bestVisHops = -1;
    for (var s = 0; s <= LP.SHOT_SAMPLES; s++) {
      var tn = topoutU + windowU * (s / LP.SHOT_SAMPLES);
      var pose = poseAtFn(tn);
      if (!pose) continue;
      var r = _projectAABB(buildingBox, pose, A.camera);
      if (!r) continue;
      if (r.fraction > bestF) { bestF = r.fraction; bestTn = tn; }
      if (r.fraction >= LP.SHOT_THRESHOLD) return { tNorm: tn, buildingInFrame: r.fraction, best: false, bestVisibleHops: null };
      if (validChains && items) {
        var visHere = 0;
        for (var ci = 0; ci < validChains.length; ci++) {
          var n = 0, chain = validChains[ci].chain;
          for (var hi = 0; hi < chain.length; hi++) {
            var box = _instanceWorldBox(items[chain[hi]].guid);
            if (!box) continue;
            var rr = _projectAABB(box, pose, A.camera);
            if (rr && rr.intersects) n++;
          }
          if (n > visHere) visHere = n;
        }
        if (visHere > bestVisHops) { bestVisHops = visHere; bestVisTn = tn; }
      }
    }
    if (bestVisHops >= 1) {
      return { tNorm: bestVisTn, buildingInFrame: bestF < 0 ? null : bestF, best: true, bestVisibleHops: bestVisHops };
    }
    return { tNorm: bestTn, buildingInFrame: bestF < 0 ? null : bestF, best: true, bestVisibleHops: validChains ? 0 : null };
  }
  // ── v8b HARDENED (review, 2026-09-15, after a real HHS bake showed __lpClipAll leaving
  // beyondVisible=10 => false PASS): the OLD __lpClipAll reference was `_lp.buildingBox`, built from
  // elements_meta/element_transforms DB rows only — but `_applyGhost` ghosts EVERY mesh
  // `A.collectMeshes` finds in the live THREE.js scene (site/context props, helpers, anything not a
  // tracked DB element), which is a LARGER, different population than the DB-derived box. A plane
  // placed behind the small box left real ghosted objects — the ones outside it — on its far side,
  // "surviving" the all-clip control by construction, not by a witness bug. Scans the SAME
  // population `_applyGhost`'s own collectMeshes predicates enumerate (never our own overlay clones),
  // taking each mesh's OWN real-time Box3 (skipping empty/NaN ones — `empty`, logged, never guessed
  // at) — so the plane this control places sits behind literally everything that will be ghosted. ──
  function _ghostPopulationMaxDepth(camPos, viewDir) {
    var maxDepth = -Infinity, seen = 0, empty = 0;
    function scanOne(obj) {
      if (obj.userData && obj.userData._loadPathClone) return;   // never our own overlay
      seen++;
      try {
        var b = new THREE.Box3().setFromObject(obj);
        var finite = isFinite(b.min.x) && isFinite(b.min.y) && isFinite(b.min.z) &&
          isFinite(b.max.x) && isFinite(b.max.y) && isFinite(b.max.z) &&
          b.min.x <= b.max.x && b.min.y <= b.max.y && b.min.z <= b.max.z;
        if (!finite) { empty++; return; }
        _cornersOfAABB({ minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z })
          .forEach(function (c) {
            var depth = c.clone().sub(camPos).dot(viewDir);
            if (depth > maxDepth) maxDepth = depth;
          });
      } catch (e) { empty++; }
    }
    A.collectMeshes(function (o) { return o.isMesh && !o.isInstancedMesh && !o.isBatchedMesh; }).forEach(scanOne);
    A.collectMeshes(function (o) { return o.isInstancedMesh || o.isBatchedMesh; }).forEach(scanOne);
    return { maxDepth: maxDepth, seen: seen, empty: empty };
  }
  // ── v8 CUT (third amendment) — ONE clip plane, facing the camera, placed just in front of the
  // chain's nearest face along the view axis; applied ONLY to this beat's own ghost material clones.
  // `normal = viewDir` (camera -> chainCenter, pointing INTO the scene): three.js keeps the half-space
  // where `normal.dot(p)+constant >= 0`, i.e. the FAR side (beyond the plane) — exactly "remove only
  // what's between the camera and the plane". `__lpClipAll` pushes the plane behind the FARTHEST REAL
  // GHOST CANDIDATE (see `_ghostPopulationMaxDepth` above), not the chain's near face, so nothing
  // survives. ─────────────────────────────────────────────────────────────────────────────────────
  function _placeCutPlane(chainBox, buildingBox, camPos) {
    if (typeof THREE === 'undefined' || !camPos) return null;
    var chainCenter = chainBox.getCenter(new THREE.Vector3());
    var viewDir = chainCenter.clone().sub(camPos);
    if (viewDir.lengthSq && viewDir.lengthSq() < 1e-8) return null;
    viewDir.normalize();
    var size = chainBox.getSize(new THREE.Vector3());
    var eps = Math.max(0.1, Math.hypot(size.x, size.y, size.z) * 0.05);
    var extreme, planeDepth;
    if (window.__lpClipAll) {
      var scan = _ghostPopulationMaxDepth(camPos, viewDir);
      console.log('§LOADPATH_CLIPALL_SCAN seen=' + scan.seen + ' empty=' + scan.empty +
        ' maxDepth=' + (scan.maxDepth === -Infinity ? 'n/a' : scan.maxDepth.toFixed(2)));
      if (scan.seen === 0 || scan.maxDepth === -Infinity) return null;   // nothing real to clip behind
      extreme = scan.maxDepth;
      planeDepth = extreme + eps;
    } else {
      var corners = [chainBox.min, new THREE.Vector3(chainBox.max.x, chainBox.min.y, chainBox.min.z),
       new THREE.Vector3(chainBox.min.x, chainBox.max.y, chainBox.min.z), new THREE.Vector3(chainBox.min.x, chainBox.min.y, chainBox.max.z),
       new THREE.Vector3(chainBox.max.x, chainBox.max.y, chainBox.min.z), new THREE.Vector3(chainBox.max.x, chainBox.min.y, chainBox.max.z),
       new THREE.Vector3(chainBox.min.x, chainBox.max.y, chainBox.max.z), chainBox.max];
      extreme = Infinity;
      corners.forEach(function (c) {
        var depth = c.clone().sub(camPos).dot(viewDir);
        extreme = Math.min(extreme, depth);
      });
      planeDepth = extreme - eps;
    }
    var planePoint = camPos.clone().add(viewDir.clone().multiplyScalar(planeDepth));
    return new THREE.Plane(viewDir.clone(), -viewDir.dot(planePoint));
  }

  // §129 OPEN ITEM (2026-09-17, red1, locked over several turns, "go ahead on 5") — SECTION-CUT.
  // The default-look counterpart of `_placeCutPlane` above: that one places the plane just IN FRONT
  // of the chain (near face - eps), for the OLD ghost-mode look, to hide the near-side facade UP TO
  // the stack. This one places it just BEHIND the chain (far face + eps) so the stack itself sits
  // entirely on the camera side of the plane and is NEVER clipped by it, regardless of its own
  // extent - "never in front of it, never clipping the stack itself" per red1's own words. Same
  // corner-enumeration approach as `_placeCutPlane`'s non-clipAll branch, MAX instead of MIN.
  function _placeSectionCutPlane(chainBox, camPos) {
    if (typeof THREE === 'undefined' || !camPos || !chainBox) return null;
    var chainCenter = chainBox.getCenter(new THREE.Vector3());
    var viewDir = chainCenter.clone().sub(camPos);
    if (viewDir.lengthSq() < 1e-8) return null;
    viewDir.normalize();
    var size = chainBox.getSize(new THREE.Vector3());
    var eps = Math.max(0.1, Math.hypot(size.x, size.y, size.z) * 0.05);
    var corners = _cornersOfAABB({ minX: chainBox.min.x, maxX: chainBox.max.x, minY: chainBox.min.y,
      maxY: chainBox.max.y, minZ: chainBox.min.z, maxZ: chainBox.max.z });
    var extreme = -Infinity;
    corners.forEach(function (c) {
      var depth = c.clone().sub(camPos).dot(viewDir);
      extreme = Math.max(extreme, depth);
    });
    var planeDepth = extreme + eps;
    var planePoint = camPos.clone().add(viewDir.clone().multiplyScalar(planeDepth));
    return { plane: new THREE.Plane(viewDir.clone(), -viewDir.dot(planePoint)), farDepth: extreme, planeDepth: planeDepth,
      viewDir: viewDir.clone(), camPos: camPos.clone() };
  }   // lazily constructed (needs THREE loaded)
  // §129.19 FIX (2026-09-18, red1, after watching r84: "still wipe off away from cam pov... nail it
  // to be a true fade instead") — CONFIRMED via frame-by-frame inspection, not guessed: at only 10%
  // into the arm-side fade, the foreground walkway was already fully cut/whitened while everything
  // farther from camera was still untouched — the unmistakable signature of a boundary physically
  // travelling from `_CUT_DEPTH0` ("a hair in front of the camera") out to `sc.planeDepth` (behind
  // the stack) over the fade window. That IS the wipe: a moving depth boundary is directional and
  // spatially uneven by construction, no matter how smoothly `t` itself ramps or how well its timing
  // is synced with everything else (§129.17/§129.18 already fixed THAT half correctly). The plane
  // now snaps straight to its FINAL resting depth from the first held frame — no sweep, no
  // intermediate position ever rendered — so the geometric cut itself is a single, instant, one-time
  // fact rather than a travelling line. What still eases in over `t` is exactly what already was
  // genuine, uniform (non-directional) fade material: the whiten colour lerp below, unchanged. The
  // net perceived effect is a colour/opacity dissolve into the final cutaway state, not a wipe.
  function _sectionCutApply(sc, t, buildingBox) {
    if (!sc || !sc.plane) return;
    var depth = sc.planeDepth;
    var planePoint = sc.camPos.clone().add(sc.viewDir.clone().multiplyScalar(depth));
    sc.plane.constant = -sc.viewDir.dot(planePoint);
    sc.liveDepth = depth;   // stashed for the witness - the REAL live value the plane was set to, never re-derived
    // Reset TAA accumulation every frame the COLOUR is still moving (t<1) — the target colour
    // changes every one of these frames, so there is nothing stable yet for the accumulator to
    // converge on; letting it accumulate mid-fade would blend a whole sequence of different
    // in-between states together. Once t reaches 1 this simply stops firing (see the `t < 1` guard),
    // and normal accumulation is free to converge on the final, STABLE white state for the rest of
    // the hold — this is a one-time reset per change, not a permanent "never accumulate" switch.
    if (t < 1 && A._taaPass) A._taaPass.accumulateIndex = -1;
    if (typeof THREE !== 'undefined') {
      if (!LP._WHITE_COLOR) LP._WHITE_COLOR = new THREE.Color(LP.CONCRETE_GREY_HEX);   // name kept, value is now the concrete-grey target
      LP._whitenColorPairs.forEach(function (p) { p.clone.color.copy(p.orig).lerp(LP._WHITE_COLOR, t); });
      // FIX (2026-09-17, found via pixel readback + call-order tracing after red1 reported zero
      // visible change) — `A.cpeRevealApplyVisual`/`A.storeyRevealApplyVisual` run EVERY frame,
      // unconditionally, and RE-ASSERT their own discipline/storey tint via the SAME `setColorAt`
      // API this pass neutralized ONCE at arm — earlier in cinema_maxq.js's per-frame call order than
      // this beat, every single hold frame, with zero awareness this hold exists. A one-shot
      // neutralization is therefore overwritten before every render but the arm frame itself (one
      // 0.1s frame, invisible). Must be RE-asserted here, every hold frame, not just at arm — the
      // SAME per-slot backup (`_whitenInstColor`, taken once at arm) is what "original" lerps from.
      if (!LP._whitenTmpColor) LP._whitenTmpColor = new THREE.Color();
      LP._whitenInstColor.forEach(function (rec) {
        for (var _ri = 0; _ri < rec.slots.length; _ri++) {
          var _rs = rec.slots[_ri];
          try { rec.mesh.setColorAt(_rs.idx, LP._whitenTmpColor.setHex(_rs.hex).lerp(LP._WHITE_COLOR, t)); } catch (eReassert) {}
        }
        if (rec.mesh.instanceColor) rec.mesh.instanceColor.needsUpdate = true;
      });
    }
    LP._updateCapPlane(sc.plane, buildingBox);   // cap mesh's own transform tracks the SAME swept plane
    // §129.22 (2026-09-18, red1: "originally it supposed to be concrete surface with cut section...
    // it's not fading along to give better realism") — the cap (the solid concrete cut-face fill,
    // `_buildCutCap`) used to just APPEAR the instant it was built (arm), same abrupt-pop class as
    // the clip plane's own now-removed sweep (§129.19) — it's a genuinely NEW surface, never present
    // before arm, and popping straight to opaque read as the same kind of "abruptly hidden [→ shown]"
    // rather than fading in. Independent material (not shared with any other pass), so unlike the
    // near-side facade population (still an open limitation — see this section's own note below) it
    // can fade cleanly on the SAME `t` as everything else, no per-element sharing problem to solve.
    if (LP._capPlaneMesh && LP._capPlaneMesh.material) {
      LP._capPlaneMesh.material.transparent = true;
      LP._capPlaneMesh.material.opacity = t;
    }
    // NOT fixed this pass, flagged rather than silently left: the NEAR-SIDE facade population (the
    // real building elements the clip plane removes to expose the cross-section) still disappears in
    // one instant step once the plane reaches its fixed final position, because BatchedMesh/
    // InstancedMesh element clones share ONE material per CONTAINER (`_buildBatchedElementClones`,
    // `var cl = obj.material`) — a container's own instances are scattered across near AND far side of
    // the cut plane, so fading that ONE shared opacity would incorrectly also fade out the far-side
    // (revealed) instances that are meant to stay solid. A real per-element fade needs per-element
    // (not per-container) materials, a real cost/architecture change, not attempted here — red1's own
    // "since you can't handle too much we settle for" accepted this trade explicitly.
  }

  // phase-1 exports: other parts reach these through LP (same function objects, same identity)
  LP._chainWorldBBox = _chainWorldBBox;
  LP._sourceInstance = _sourceInstance;
  LP._sourceLocalBox = _sourceLocalBox;
  LP._instanceWorldBox = _instanceWorldBox;
  LP._worldAABBFromItem = _worldAABBFromItem;
  LP._unionAABB = _unionAABB;
  LP._buildingWorldBBox = _buildingWorldBBox;
  LP._projectAABB = _projectAABB;
  LP._projectAABBLive = _projectAABBLive;
  LP._memberPxHeight = _memberPxHeight;
  LP._memberPxHeightLive = _memberPxHeightLive;
  LP._buildReverseIndexes = _buildReverseIndexes;
  LP._resetRayCache = _resetRayCache;
  LP._allElseObjects = _allElseObjects;
  LP._extentAlongDir = _extentAlongDir;
  LP._pickTwoStacks = _pickTwoStacks;
  LP._searchHoldPoint = _searchHoldPoint;
  LP._placeCutPlane = _placeCutPlane;
  LP._placeSectionCutPlane = _placeSectionCutPlane;
  LP._sectionCutApply = _sectionCutApply;

  return function () {   // phase 2: this part's setup statements, in original order
  A._loadPathSourceInstance = _sourceInstance; A._loadPathInstanceWorldBox = _instanceWorldBox;
  A._loadPathSearchHoldPoint = _searchHoldPoint;
  // ROUND 6 — exposed for a direct node dry run proving the OLD (pose-with-controls.target-driven
  // lookAt) vs NEW (live, no-reaim) behaviour on the exact same camera/box.
  A._loadPathProjectAABB = _projectAABB; A._loadPathProjectAABBLive = _projectAABBLive;
  A._loadPathScreenAreaPxLive = _screenAreaPxLive;

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // §129.8 item 2 — VISIBLE = UNOCCLUDED. Raycasts from the camera to sample points on a member's
  // OWN camera-facing box faces, against the REAL building meshes (the SAME universe `_applyGhost`'s
  // own ghost-everything pass already iterates via A.collectMeshes — reused, never a second list),
  // and maps a hit back to a guid the same way `_sourceInstance`'s own forward lookup works,
  // REVERSED. Raycast ONLY at the hold pose, ONCE per candidate that already passed the (cheap)
  // frustum test — never per frame (§129.8 item 2's own "mind cost").
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // ROUND 13 (2026-09-16, real HHS bake: `memberVis=[0,0,0,0,0]` on a frustum-5/5 ladder — a
  // THREE.Raycaster hit against a BatchedMesh carries `hit.batchId`, NEVER `hit.instanceId`; the
  // OLD code below only ever received `instanceId`, so the guid never resolved and every candidate
  // read 0 unoccluded regardless of true occlusion) — BOTH reverse indexes are now built ONCE,
  // together, on first use: `_revInstanceIndex` from A._instanceGuids (InstancedMesh), `_revBatchIndex`
  // from A._batchMeta (BatchedMesh) — never a per-hit linear scan, which the OLD BatchedMesh branch
  // here was doing (a scan of A._batchMeta[object.id] on every single ray).
  LP._revInstanceIndex = null;   // {meshId: {instanceIndex: guid}} — lazily built from A._instanceGuids
  LP._revBatchIndex = null;
  A._loadPathClassForGuid = _classForGuid;
  A._loadPathRaycastUniverse = _raycastUniverse; A._loadPathReverseGuidFor = _reverseGuidFor;
  A._loadPathResetRayCache = _resetRayCache;
  A._loadPathIsBuildingElementObj = _isBuildingElementObj;
  A._loadPathAllElseObjects = _allElseObjects;
  A._loadPathFacingFaceSamples = _facingFaceSamples; A._loadPathMemberUnoccluded = _memberUnoccluded;
  A._loadPathSampleCountFor = _sampleCountFor;
  A._loadPathScreenRectPx = _screenRectPx; A._loadPathUnderHud = _underHud;
  A._loadPathScoreChain = _scoreChain;
  A._loadPathExtentAlongDir = _extentAlongDir;
  A._loadPathStackCmp = _stackCmp;
  A._loadPathCheapCandidateRank = _cheapCandidateRank; A._loadPathRankAndCapForScoring = _rankAndCapForScoring;
  A._loadPathPickTwoStacks = _pickTwoStacks;
  // §129 OPEN ITEM (2026-09-17, red1: "make the clipped fade off too, same 0.5s as the rest fade
  // set") — the cut currently snaps in/out instantly at arm/release while backdrop and HUD both ramp
  // over BACKDROP_FADE_SEC. A hard geometric clip plane has no native "opacity" to fade, and a single
  // material's opacity cannot distinguish the fragments a straddling mesh keeps from the ones it
  // loses (that split only exists per-fragment, at the clip test itself) - so "fade" here means the
  // plane's own DEPTH sweeps from a no-op position (t=0, at the camera - clips nothing real) to its
  // final resting depth (t=1, `sectionCut.planeDepth`) over the SAME t curve `_backdropFadeT` already
  // produces, holds at the final depth through the whole hold, and sweeps back to the no-op depth
  // over the release-side window - a progressive reveal in sync with the backdrop going black and the
  // HUD fading out, never an instant pop. Since `clippingPlanes` arrays hold a REFERENCE to this ONE
  // Plane object everywhere it was attached (412 whitened materials + up to 824 cap-stencil
  // companions), mutating `plane.constant` once per frame re-drives clipping AND stencil-marking
  // for all of them for free - no per-material touch needed after arm. The white colour swap rides
  // the identical t (`Color.lerp(origColal, WHITE, t)`), so the concrete-white look also eases in
  // instead of popping.
  LP._WHITE_COLOR = null;
  };
};
