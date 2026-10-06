// navigate_find family — part `room` (original navigate_find.js lines 1848–2847).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/navigate_find.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as NF.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts = (typeof window !== 'undefined' ? window : globalThis).__navigateFindParts || {};
(typeof window !== 'undefined' ? window : globalThis).__navigateFindParts.room = function* __split_navigate_find_room(NF, A, nav, getStartNavigation) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  NF._buildShapeMeshes = _buildShapeMeshes;
  NF._dimXrayTo = _dimXrayTo;
  NF._exteriorGuids = _exteriorGuids;
  NF._roomLensReset = _roomLensReset;
  NF._roomLensOn = _roomLensOn;
  NF._zoomToBox = _zoomToBox;
  NF._zoomToBoxFill = _zoomToBoxFill;
  NF._zoomToGroup = _zoomToGroup;
  NF._roomSelect = _roomSelect;
  NF._clearCategoryReveal = _clearCategoryReveal;
  NF._revealCategoryGroup = _revealCategoryGroup;
  NF._subToggleRow = _subToggleRow;
  Object.defineProperty(NF, '_USE_SHELL', { get: function () { return _USE_SHELL; }, set: function (v) { _USE_SHELL = v; }, enumerable: true });
  Object.defineProperty(NF, '_roomVolCache', { get: function () { return _roomVolCache; }, set: function (v) { _roomVolCache = v; }, enumerable: true });
  Object.defineProperty(NF, '_roomVolCacheBld', { get: function () { return _roomVolCacheBld; }, set: function (v) { _roomVolCacheBld = v; }, enumerable: true });
  Object.defineProperty(NF, '_categoryRevealOn', { get: function () { return _categoryRevealOn; }, set: function (v) { _categoryRevealOn = v; }, enumerable: true });
  Object.defineProperty(NF, '_revealDoorMeshes', { get: function () { return _revealDoorMeshes; }, set: function (v) { _revealDoorMeshes = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order
     // exposed for witnesses (S7)

    // solidOpacity (optional): for the kept-solid CONTEXT build (color==null), render it at this
    // opacity instead of fully opaque. Room lens passes 0.3 so the selected room shows THROUGH its
    // enclosing floor; Material/Type/Phase drills omit it → context stays solid (1.0), as before.
    // colorOpacity (optional, color path): render the highlight colour SEE-THROUGH at this opacity
    // (transparent, depthWrite off) instead of flat opaque — the "usual mesh highlight" look so the
    // item's real material reads through it. null → opaque (legacy).
    function _buildShapeMeshes(set, color, solidOpacity, colorOpacity, clipPlanes) {
      if (!A.scene || typeof THREE === 'undefined' || !A.ifc2three || !A.meshCache || !set || !set.size) return 0;
      // §PERF: a room/item is a handful of guids — fetch ONLY those (instant) instead of marshalling the
      // whole 122k join through sql.js (the multi-second freeze on the first sub-panel click). Big groups
      // (a storey) still use the cached full join. Threshold keeps the IN-list SQL small.
      var rows = (set.size <= 1500) ? NF._instRowsForSet(set) : NF._getInstanceRows();
      if (!rows.length) return 0;
      var groups = {}, total = 0, missing = 0;
      for (var i = 0; i < rows.length && total < NF._HL_CAP; i++) {
        var r = rows[i];
        if (r[2] == null || !set.has(r[0])) continue;
        var hash = r[1];
        if (!hash || !A.meshCache[hash]) { missing++; continue; }
        var key = color != null ? hash : (hash + '|' + (r[8] || '_'));
        if (!groups[key]) groups[key] = { hash: hash, rgba: r[8], ifc: r[9], els: [] };
        groups[key].els.push(r); total++;
      }
      // colorOpacity set → see-through highlight that SHINES THROUGH occluders (depthTest off) so the
      // small final item stays visible even zoomed-out / behind other geometry.
      var cyan = color != null ? new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide,
        transparent: colorOpacity != null, opacity: colorOpacity != null ? colorOpacity : 1,
        depthWrite: colorOpacity == null, depthTest: colorOpacity == null,
        clippingPlanes: clipPlanes || null, clipIntersection: false }) : null;
      var made = 0, m4 = new THREE.Matrix4(), eu = new THREE.Euler(),
          q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
      for (var k in groups) {
        var g = groups[k], geo = A.meshCache[g.hash];
        var mat;
        if (cyan) mat = cyan;
        else {
          var base = A._getMaterial ? A._getMaterial(g.rgba, g.ifc) : null;
          mat = base ? base.clone() : new THREE.MeshStandardMaterial({ color: 0xcccccc });
          if (solidOpacity != null && solidOpacity < 1) {
            // §DEPTH ghost (0.2 ancestor): SHINE THROUGH the hidden base. The dimmed base is opacity-0
            // but still writes depth → it OCCLUDED this 0.2 overlay (deeper group "showed only solid,
            // no 0.2"). depthTest off + low renderOrder draws it under the solid focus, through the
            // invisible base. (Witnessed: ghost 0.20 dT0 dW0 ro1; Hospital intermediate anc=[0.2×N].)
            mat.transparent = true; mat.opacity = solidOpacity; mat.depthWrite = false; mat.depthTest = false;
          } else {
            mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
          }
          if (clipPlanes) { mat.clippingPlanes = clipPlanes; mat.clipIntersection = false; }  // §ROOM-CLIP
        }
        var inst = new THREE.InstancedMesh(geo, mat, g.els.length);
        inst.frustumCulled = false;
        for (var j = 0; j < g.els.length; j++) {
          var e = g.els[j], p = A.ifc2three(e[2], e[3], e[4]);
          pos.set(p.x, p.y, p.z);
          eu.set(e[5] || 0, e[7] || 0, -(e[6] || 0));
          q.setFromEuler(eu); m4.compose(pos, q, sc);
          inst.setMatrixAt(j, m4);
        }
        inst.instanceMatrix.needsUpdate = true;
        // ghost(0.2)=1 draws first (under), solid focus=2, cyan shine=3 on top
        inst.renderOrder = color != null ? 3 : ((solidOpacity != null && solidOpacity < 1) ? 1 : 2);
        inst.userData._shapeOverlay = true;
        // §UNIFIED-SELECT: map each overlay instance back to its real element guid so a 3D tap on
        // the overlay (picking.js instanced path) resolves the element — this is what lets a re-tap
        // on a focused/selected element DESELECT it (the overlay sits over the x-ray-dimmed base, so
        // without this the tap hits a guid-less mesh and the toggle never fires). Cleared in
        // _clearShapeOverlays. inst.id is globally unique → never collides with real scene meshes.
        A._instanceMeta = A._instanceMeta || {};
        A._instanceMeta[inst.id] = g.els.map(function (e) { return { guid: e[0] }; });
        A.scene.add(inst);
        NF._shapeOverlays.push({ mesh: inst, disposeMat: true }); // clones are ours to dispose
        made += g.els.length;
      }
      if (missing) console.log('[RP-C] §SHAPE_MISS hashes_not_streamed=' + missing + ' (set=' + set.size + ')');
      return made;
    }

    // §RP: drop the x-rayed rest to a given opacity (phase drill wants 0.2, harder than the
    // default 0.3). toggleXray already stored _origOpacity, so X-Ray OFF still restores to 1.
    // Our shape overlays use fresh materials (not in _matCache / flagged) → unaffected.
    function _dimXrayTo(op) {
      if (!A.xrayOn) return;
      var c = A._matCache || {}, ks = Object.keys(c), n = 0, samp = [];
      if (ks.length) {
        ks.forEach(function(k) { var m = c[k]; if (m) { m.transparent = true; m.opacity = op; m.needsUpdate = true; n++; } });
        for (var z = 0; z < Math.min(4, ks.length); z++) { var mm = c[ks[z]]; if (mm) samp.push(mm.opacity.toFixed(2) + (mm.transparent ? 'T' : 'F')); }
      } else if (A.scene) {
        A.scene.traverse(function(o) {
          if (o.isMesh && o.material && !(o.userData && (o.userData._shapeOverlay || o.userData._hlOverlay))) {
            o.material.transparent = true; o.material.opacity = op; o.material.needsUpdate = true; n++;
            if (samp.length < 4) samp.push(o.material.opacity.toFixed(2) + (o.material.transparent ? 'T' : 'F'));
          }
        });
      }
      // §-log the READBACK (actual post-set opacity) — proves the dim really took to `op` (test reads this).
      console.log('[RP-TB] §XRAY_DIM opacity=' + op + ' mats=' + (ks.length ? n : 'scene:' + n) +
        ' readback=[' + samp.join(',') + '] cache=' + ks.length + ' xrayOn=' + A.xrayOn);
      if (A.markDirty) A.markDirty();
    }

    function _clearRoomBoxes() {
      NF._roomBoxes.forEach(function(rb) {
        if (rb.mesh) {
          if (rb.mesh.parent) rb.mesh.parent.remove(rb.mesh);
          if (rb.mesh.geometry) rb.mesh.geometry.dispose();
          if (rb.mesh.material) rb.mesh.material.dispose();
        }
      });
      NF._roomBoxes = [];
    }

    var _USE_SHELL = false;                                   // §SHELL: parked — bbox-boundary too sparse (28 elems); needs class/PVS
    // §SHELL: the building's OUTFACING shell — elements whose bbox touches the outer building bbox (within
    // MARGIN of any of the 6 faces): exterior walls, floor + roof slabs. The deep interior (MEP, furniture
    // — the triangle-heavy occluded bulk) is excluded. Inline + cached per building. The dim context then
    // renders ONLY these (hidden rest = zero draw) → far fewer triangles, the real lever (geometry, not fill).
    var _extCache = null, _extBld = null;
    function _exteriorGuids() {
      if (_extCache && _extBld === A.activeBuilding) return _extCache;
      var set = new Set();
      try {
        var rows = A.dbQuery("SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z" +
          " FROM element_transforms WHERE center_x IS NOT NULL") || [];
        var minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i], cx = r[1], cy = r[2], cz = r[3], hx = (r[4] || 0) / 2, hy = (r[5] || 0) / 2, hz = (r[6] || 0) / 2;
          if (cx - hx < minx) minx = cx - hx; if (cy - hy < miny) miny = cy - hy; if (cz - hz < minz) minz = cz - hz;
          if (cx + hx > maxx) maxx = cx + hx; if (cy + hy > maxy) maxy = cy + hy; if (cz + hz > maxz) maxz = cz + hz;
        }
        var M = 1.5;
        for (var j = 0; j < rows.length; j++) {
          var e = rows[j], ex = e[1], ey = e[2], ez = e[3], bx = (e[4] || 0) / 2, by = (e[5] || 0) / 2, bz = (e[6] || 0) / 2;
          if (ex - bx <= minx + M || ex + bx >= maxx - M || ey - by <= miny + M ||
              ey + by >= maxy - M || ez - bz <= minz + M || ez + bz >= maxz - M) set.add(e[0]);
        }
      } catch ( err) { console.warn('[RP-TB] §SHELL_ERR', err.message); }
      _extCache = set; _extBld = A.activeBuilding;
      console.log('[RP-TB] §SHELL exterior=' + set.size + ' (outfacing-shell dim context)');
      return set;
    }

    // §ROOM_LENS_TAXONOMY (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §2): category → shell/cuboid color
    // pair (fill, wire). 'habitable' keeps the purple this file already used for the single
    // selected-room cuboid (§ROOM-CUBOID below) — now a real per-CATEGORY color, not just a
    // selection-only accent. 'corridor' keeps the pre-existing default blue (was every room's
    // fixed default before this change — now deliberate, corridor-only). 'utilities' is a muted
    // dark grey — reads as "present, low-priority" without an alarming/error connotation.
    // §DEEP-PALETTE (2026-07-15l, user-reported live pre-deploy test on a large building, this
    // session): the bulk room-shine-through shell (_drawRoomShell below) always draws at a fixed
    // 10% opacity — tuned against the dark x-ray-dimmed backdrop, where a faint pastel tint reads
    // fine. The desktop bbox-shell default (§DESKTOP-BBOX-THRESHOLD, this same session) puts large
    // buildings on a much LIGHTER wireframe backdrop instead — the same 10% wash of a pastel hue
    // (0x9c6ade etc.) blends toward near-white there ("bland whitish", user's own words). Fix:
    // deepen the base hues themselves (user's own pick over a mode-aware-opacity/outline
    // alternative) so even a thin 10% wash still carries visible color against a light background.
    // `wire` (the SELECTED single room's bright cuboid border, §ROOM-CUBOID) is untouched — it
    // already renders near-opaque, not the washed-out case this fixes, and a lighter wire against a
    // now-deeper fill is if anything MORE legible than before.
    var ROOM_CATEGORY_COLORS = {
      habitable: { fill: 0x6a1b9a, wire: 0xd8b4fe },
      corridor: { fill: 0x0277bd, wire: 0x7fd6fb },
      restroom: { fill: 0x6d4c41, wire: 0xbcaaa4 },   // §RESTROOM-CLASS: wet sanitary room = brown (Material brown 600/200)
      kitchen: { fill: 0xff8f00, wire: 0xffe082 },    // §KITCHEN-CLASS: food-service room = amber (Material amber 800/200)
      bedroom: { fill: 0x00796b, wire: 0x80cbc4 },    // §BEDROOM-CLASS: sleeping room = teal (Material teal 700/200)
      utilities: { fill: 0x212121, wire: 0x5a5a5a }
    };
    function _categoryColor(category) {
      return ROOM_CATEGORY_COLORS[category] || ROOM_CATEGORY_COLORS.habitable;
    }
    // §RP-SHELL (option 3): a room's drawable OUTLINE is its IfcSpace volume (center+size), not a
    // mesh. Draw it as a translucent shine-through box so the Room axis shows the room MAP and a
    // selected room reads as a bright shell with its contents dimmer inside.
    function _drawRoomShell(center, size, opacity, color) {
      if (!A.scene || typeof THREE === 'undefined') return null;
      var geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      var mat = new THREE.MeshBasicMaterial({ color: color || 0x4fc3f7, transparent: true,
        opacity: opacity, depthWrite: false, side: THREE.DoubleSide });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(center);
      mesh.renderOrder = 998;           // over the x-rayed model, under the cyan item overlay (999)
      mesh.userData._roomShell = true;
      A.scene.add(mesh);
      return mesh;
    }
    // §ROOM-CUBOID-STALE-FIX (2026-07-13, user-reported screenshot RoomOverSize.png): every call
    // pushed a NEW fill/wire/wireOuter trio into `_roomBoxes` under the SAME fixed guid keys, but
    // never removed the PREVIOUS trio first — the dim-other-shells pass in _roomSelect() (which
    // runs before this) only lowers old cuboid meshes to opacity 0.04, it never disposes them, so
    // an earlier-selected (possibly larger) room's cuboid lingered in the scene as a faint ghost
    // box — most visible in its wireframe (depthTest:false → always draws on top regardless of
    // opacity). Strip any existing cuboid entries first so exactly ONE selected-room cuboid exists.
    function _clearRoomCuboid() {
      var kept = [];
      NF._roomBoxes.forEach(function(rb) {
        if (rb.guid === '_cuboidFill' || rb.guid === '_cuboidFillGlow' || rb.guid === '_cuboidWireOuter' || rb.guid === '_cuboidWire' || rb.guid === '_cuboidDoor') {
          if (rb.mesh) {
            if (rb.mesh.parent) rb.mesh.parent.remove(rb.mesh);
            if (rb.mesh.geometry) rb.mesh.geometry.dispose();
            if (rb.mesh.material) rb.mesh.material.dispose();
          }
        } else kept.push(rb);
      });
      NF._roomBoxes = kept;
    }
    // §ROOM-CUBOID: the SELECTED room as a crisp soft-purple box — faint translucent fill + a bright
    // WIREFRAME of the 12 cuboid edges that shines THROUGH geometry (depthTest off), so the room
    // reads as a clean volume from any angle. Both tracked in _roomBoxes for disposal.
    // §FILL-SHINE-THROUGH (2026-07-15p, user-reported live testing: "it highlights with the box
    // shines thru, but the purplish interiors does not"): the wire border already sets
    // `depthTest: false` (shines through occluding geometry, see lineMat below) but the fill's
    // MeshBasicMaterial never set depthTest at all — defaults to true, so it's occluded by any
    // real wall/floor in front of it, unlike its own border. Same §BORDER_STRONG "duplicate mesh
    // underneath" trick this function already uses for the wire, applied to the fill: a dim
    // depthTest:false glow layer draws first (always visible, ~90% of the crisp opacity — the
    // user's own "-10%" ask), then the normal depth-tested fill draws on top at full opacity
    // wherever genuinely unoccluded. Net: dim-but-visible through walls, brighter where actually
    // in view — a real depth cue, "always shines thru" per the user's own framing. True per-layer
    // graduated falloff (their stretch "-5% per additional layer") would need real depth-peeling
    // (multi-pass, real GPU cost) for an effect a human eye won't reliably distinguish past one
    // tier anyway — this two-tier version gets the same PERCEIVED result far more cheaply.
    // §SELECT-PULSE (2026-07-15o, user's own pick, "cheap doesn't bog or lag"): a brief settle-in
    // pulse on selection — starts oversized/dim, eases down to resting scale/opacity over 300ms —
    // draws the eye to what just got picked instead of an instant flat cut. Pure JS scale/opacity
    // tween, same requestAnimationFrame + generation-counter pattern _lerpCam already uses (a
    // newer pulse or a fresh _clearRoomCuboid supersedes any in-flight one — never two competing
    // animations, never a leaked rAF loop after the mesh is gone).
    var _pulseId = 0;
    // §ROOM_SELECT_DOORS (2026-07-26, user ask: "when we zoom to particular room it is just a box
    // purple without its accompanying door... let's have that too since its free" — free because
    // _spawnDoorMeshesForRooms already exists for the category-reveal case; a single selected room
    // is just a 1-guid call to the SAME function, not new logic): roomGuid is optional so every
    // existing caller that doesn't pass one keeps working with no door drawn, unchanged.
    function _drawRoomCuboid(center, size, category, roomGuid) {
      if (!A.scene || typeof THREE === 'undefined') return;
      _clearRoomCuboid();
      var myPulse = ++_pulseId;
      var cc = _categoryColor(category); // §ROOM_LENS_TAXONOMY: selected room reads as a BRIGHTER
      // version of its own category color (purple/blue/dark), not a 4th unrelated fixed hue.
      var boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
      var FILL_GLOW_RATIO = 0.9; // §FILL-SHINE-THROUGH: dim layer = 90% of the crisp layer's opacity
      var glowMat = new THREE.MeshBasicMaterial({ color: cc.fill, transparent: true, opacity: 0.5 * FILL_GLOW_RATIO,
        depthWrite: false, depthTest: false, side: THREE.DoubleSide });
      var fillGlow = new THREE.Mesh(boxGeo, glowMat); fillGlow.position.copy(center);
      fillGlow.renderOrder = 997; fillGlow.userData._roomShell = true; // draws first — always visible through walls
      A.scene.add(fillGlow); NF._roomBoxes.push({ guid: '_cuboidFillGlow', mesh: fillGlow });
      var fillMat = new THREE.MeshBasicMaterial({ color: cc.fill, transparent: true, opacity: 0.5,
        depthWrite: false, side: THREE.DoubleSide });
      var fill = new THREE.Mesh(boxGeo, fillMat); fill.position.copy(center);
      fill.renderOrder = 998; fill.userData._roomShell = true; // draws after — depth-tested, full opacity only where genuinely unoccluded
      A.scene.add(fill); NF._roomBoxes.push({ guid: '_cuboidFill', mesh: fill });
      var edges = new THREE.EdgesGeometry(boxGeo);
      var lineMat = new THREE.LineBasicMaterial({ color: cc.wire, transparent: true, opacity: 1.0, depthTest: false });
      var wire = new THREE.LineSegments(edges, lineMat); wire.position.copy(center);
      // §BORDER_STRONG: LineBasicMaterial.linewidth is silently ignored by nearly every browser/GPU
      // (WebGL spec limitation) -- a real 1px line reads as weak against a busy scene no matter the
      // opacity. Fake a thicker border with a second, slightly-scaled duplicate wireframe underneath.
      var wire2 = new THREE.LineSegments(edges, lineMat.clone());
      wire2.material.opacity = 0.5;
      wire2.scale.set(1.015, 1.015, 1.015);
      wire2.position.copy(center);
      wire2.renderOrder = 1001; wire2.userData._roomShell = true;
      A.scene.add(wire2); NF._roomBoxes.push({ guid: '_cuboidWireOuter', mesh: wire2 });
      wire.renderOrder = 1002; wire.userData._roomShell = true;
      A.scene.add(wire); NF._roomBoxes.push({ guid: '_cuboidWire', mesh: wire });

      if (roomGuid) {
        var doorMeshes = _spawnDoorMeshesForRooms([roomGuid]);
        doorMeshes.forEach(function(m) { NF._roomBoxes.push({ guid: '_cuboidDoor', mesh: m }); });
        console.log('[RP-TA] §ROOM_SELECT_DOORS guid=' + roomGuid + ' doors=' + doorMeshes.length);
      }

      var restFillOp = 0.5, restWireScale = 1.0, restWire2Scale = 1.015, overshoot = 0.09;
      var t = 0;
      function pulseFrame() {
        if (myPulse !== _pulseId) return; // superseded — a newer selection or a reset already took over
        t += 0.06; if (t > 1) t = 1;
        var e = 1 - Math.pow(1 - t, 3); // ease-out, matches _lerpCam's easing
        var k = (1 - e); // 1 at start, 0 at rest
        fill.material.opacity = restFillOp + k * 0.3;              // starts brighter (0.8), settles to 0.5
        fillGlow.material.opacity = (restFillOp + k * 0.3) * FILL_GLOW_RATIO; // stays proportional to the crisp layer
        wire.scale.setScalar(restWireScale + k * overshoot);       // starts oversized, eases down to resting scale
        wire2.scale.setScalar(restWire2Scale + k * overshoot);
        if (A.markDirty) A.markDirty();
        if (t < 1) requestAnimationFrame(pulseFrame);
        else { fill.material.opacity = restFillOp; fillGlow.material.opacity = restFillOp * FILL_GLOW_RATIO; wire.scale.setScalar(restWireScale); wire2.scale.setScalar(restWire2Scale); if (A.markDirty) A.markDirty(); }
      }
      requestAnimationFrame(pulseFrame);
    }

    // §ROOM-SHELL (user): the room's REAL bounding surfaces — the walls/floor/ceiling most exposed to
    // the cuboid. Per face, pick the element adjacent to that face plane (within BAND) with the most
    // overlap over the face span; for the 2 horizontal faces, the largest flat plate below (floor) and
    // above (ceiling). Same bbox-adjacency maths the flood-fill uses. Coords are IFC (the DB space).
    // rw = [name, parentName, cx,cy,cz, sx,sy,sz] from spatial_structure.
    function _roomBoundingGuids(rw) {
      var set = new Set();
      if (!rw || rw[2] == null || rw[5] == null || !A.dbQuery) return set;
      var cx = rw[2], cy = rw[3], cz = rw[4], hx = (rw[5] || 0) / 2, hy = (rw[6] || 0) / 2, hz = (rw[7] || 0) / 2;
      var BAND = 0.9, rows = [];
      try {
        rows = A.dbQuery(
          "SELECT m.guid, m.ifc_class, t.center_x,t.center_y,t.center_z, t.bbox_x,t.bbox_y,t.bbox_z" +
          " FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid" +
          " WHERE (m.ifc_class LIKE 'IfcWall%' OR m.ifc_class LIKE 'IfcSlab%' OR m.ifc_class LIKE 'IfcCovering%' OR m.ifc_class LIKE 'IfcRoof%')" +
          // §ROOM-AABB: candidate if its BBOX overlaps the room's expanded box (center may be far away —
          // a storey-spanning floor slab must still qualify). center-proximity missed those → no floor.
          " AND t.center_x - t.bbox_x/2 <= ? AND t.center_x + t.bbox_x/2 >= ?" +
          " AND t.center_y - t.bbox_y/2 <= ? AND t.center_y + t.bbox_y/2 >= ?" +
          " AND t.center_z - t.bbox_z/2 <= ? AND t.center_z + t.bbox_z/2 >= ?",
          [cx + hx + BAND, cx - hx - BAND, cy + hy + BAND, cy - hy - BAND, cz + hz + BAND, cz - hz - BAND]) || [];
      } catch (e) { console.warn('[RP-TA] §ROOM_BOUND_ERR', e.message); return set; }
      var faces = {}, ovl = function (a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); };
      function pick(k, g, s) { if (s > 0 && (!faces[k] || s > faces[k].s)) faces[k] = { g: g, s: s }; }
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i], ic = r[1] || '', ex = r[2], ey = r[3], ez = r[4], bx = r[5] || 0, by = r[6] || 0, bz = r[7] || 0;
        var x0 = ex - bx / 2, x1 = ex + bx / 2, y0 = ey - by / 2, y1 = ey + by / 2;
        if (ic.indexOf('Wall') >= 0) {
          if (bx >= by) {                                  // X-running wall → bounds a Y face
            var oX = ovl(x0, x1, cx - hx, cx + hx);
            if (Math.abs(ey - (cy - hy)) <= BAND) pick('yMin', r[0], oX);
            if (Math.abs(ey - (cy + hy)) <= BAND) pick('yMax', r[0], oX);
          } else {                                         // Y-running wall → bounds an X face
            var oY = ovl(y0, y1, cy - hy, cy + hy);
            if (Math.abs(ex - (cx - hx)) <= BAND) pick('xMin', r[0], oY);
            if (Math.abs(ex - (cx + hx)) <= BAND) pick('xMax', r[0], oY);
          }
        } else if (bz < Math.min(bx, by)) {                // flat plate → floor (below) / ceiling (above)
          var area = ovl(x0, x1, cx - hx, cx + hx) * ovl(y0, y1, cy - hy, cy + hy);
          if (area > 0) { if (ez <= cz) pick('floor', r[0], area + (cz - ez)); else pick('ceil', r[0], area + (ez - cz)); }
        }
      }
      var fk = []; for (var k in faces) { set.add(faces[k].g); fk.push(k); }
      console.log('[RP-TA] §ROOM_BOUND faces=[' + fk.join(',') + '] n=' + set.size + ' from ' + rows.length + ' candidates');
      return set;
    }
    // §ROOM-CLIP: 6 world-space planes at the cuboid faces (+margin) so a picked bounding mesh renders
    // ONLY its in-room portion — a storey floor slab / long wall is trimmed to this room. THREE.Plane
    // keeps points where normal·p + constant ≥ 0; inward normals + clipIntersection=false → inside box.
    function _boxClipPlanes(center, size, m) {
      if (typeof THREE === 'undefined') return null;
      m = m || 0;
      var c = center, hx = size.x / 2 + m, hy = size.y / 2 + m, hz = size.z / 2 + m;
      return [
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), c.x + hx),
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -(c.x - hx)),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), c.y + hy),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -(c.y - hy)),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), c.z + hz),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -(c.z - hz))
      ];
    }
    // All IfcSpace volumes mapped to Three space (IFC size → Three: x→x, z→y, y→z — bbox parity).
    // §ROOM-HAB (VIEWER_FIND_PANEL_ROOM_ACCURACY.md Task 1): filters out non-habitable spaces
    // (Roof/Shaft/Void/Plant/... voids, real OR synthetic) via the shared window.RoomHabitability
    // classifier (common/room_habitability.js, ported from disc_walker.js's spaceHabitable()) —
    // this is a DISPLAY filter only, distinct from the Modeller's stricter real-vs-synthetic
    // (RM_/≈ prefix) exclusion; the Room Lens intentionally still shows synthetic compile_rooms.py
    // rooms, it just must not show one labelled Roof/Shaft/etc as if it were a normal room.
    // §MULTI-RECT (ROOM_INJECTION_HYBRID.md §8/§9): a compiled room may be N spatial_structure rows
    // (one per sub-rectangle) sharing `room_guid` — the LOGICAL room key. Group by it (falling back
    // to `guid` for real IfcSpace / pre-§8 data with no room_guid column) so the Room Lens renders
    // the UNION of a room's sub-rect boxes, not one undersized/border-hugging inscribed rectangle
    // and not N disconnected boxes each masquerading as its own room. Ports the SAME guarded-query +
    // grouping shape already proven by `viewer/hba_lens.js` `bindStoreysFromModel` (W-HBA-MULTIRECT
    // 6/6) — that is the reference pattern for this fix, not re-derived from scratch. Returns a FLAT
    // array (one entry per sub-rect box, `guid` = the LOGICAL room guid so callers can group/count
    // by it) — habitability is evaluated ONCE per logical room (name/predefined_type/object_type are
    // identical across a room's sub-rect set per §8's own design), never per sub-rect.
    // §ROOM-VOL-CACHE (2026-07-15n, user-reported "panel tabbing refresh" lag + user's own
    // "queries perhaps need to pre stored lazily" diagnosis — correct instinct, same gap this
    // session already closed for the Phase axis via _phaseCache): unlike _phaseCache/
    // _probeCacheResult, _allRoomVolumes() had NO cache at all — the full SQL query + per-room
    // habitability/utility classification (measured live on Terminal: 30-60ms) reran from
    // scratch on EVERY single Room-axis entry, not just the first. The THREE.Mesh shells
    // themselves still get disposed+recreated each entry (_clearRoomBoxes() in _roomLensOn(),
    // unavoidable — meshes are scene-owned, not reusable across a dispose cycle) but that part
    // alone measured only ~3-4ms; caching the query+classification result removes the other
    // 30-60ms. Same invalidation convention as _phaseCache/_probeCacheResult: reset only on a
    // fresh openFindPanel() (building may have changed) or a real data change (needle-inject),
    // never on a plain axis re-entry within one open session.
    var _roomVolCache = null, _roomVolCacheBld = null;
    function _allRoomVolumes() {
      if (_roomVolCache && _roomVolCacheBld === A.activeBuilding) {
        console.log('[RP-TA] §ROOM_VOL_CACHE_HIT boxes=' + _roomVolCache.length);
        return _roomVolCache;
      }
      var _t0 = (performance && performance.now) ? performance.now() : 0; // §PERF_PROBE (2026-07-15j, §13)
      var out = [];
      if (!A.ifc2three || typeof THREE === 'undefined') return out;
      var RH = window.RoomHabitability;
      var env = RH ? RH.envelopeFromTransforms(A.dbQuery) : null;
      var excluded = 0;
      try {
        var rows;
        // §MULTI-RECT guard: A.dbQuery (viewer/helpers.js) never THROWS on a bad column reference —
        // it catches internally and returns [] (logging §HELPERS_QUERY_ERR), unlike the try/catch
        // double-query shape hba_lens.js uses in the Modeller context. Selecting a nonexistent
        // `room_guid` column here would therefore silently return ZERO rows with no fallback ever
        // firing — verified directly this session (pre-§8 DBs regressed to boxes=0 until this was
        // fixed). Probe the column via PRAGMA table_info first instead (same technique
        // `_probeLenses()` already uses a few lines up in this file for `center_x`/`size_x`).
        var hasRoomGuid = false;
        try {
          var ssCols = A.dbQuery("PRAGMA table_info(spatial_structure)");
          hasRoomGuid = ssCols.some(function(c) { return c[1] === 'room_guid'; });
        } catch (eCols) { /* hasRoomGuid stays false */ }
        rows = A.dbQuery("SELECT s.guid, s.name, s.center_x, s.center_y, s.center_z, s.size_x, s.size_y, s.size_z," +
          " s.object_type, s.predefined_type" + (hasRoomGuid ? ", s.room_guid" : ", NULL") + ", p.name" +
          " FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid" +
          " WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL AND s.size_x IS NOT NULL");
        var groups = {}, order = [];
        (rows || []).forEach(function(r) {
          var lg = r[10] || r[0];   // logical room guid: room_guid, falling back to this row's own guid
          if (!groups[lg]) {
            groups[lg] = { guid: lg, name: r[1],
              // §ROOM-TYPE-FALLTHROUGH: object_type is 'COMPILED' for every synthetic room — no single
              // field reliably carries the habitability keyword (verified directly: some synthetic sets
              // tag the void in `name` only — e.g. buildings/Duplex_extracted.db's "≈ Roof R1" with
              // predefined_type generically 'INTERNAL' — others tag it in predefined_type — e.g. HHS's
              // 'INTERNAL_DOORPART'). Join object_type/predefined_type/name and let spaceHabitable's
              // token match find the keyword wherever it actually is — never invents a label, just
              // widens which already-real field is checked. Representative fields (name/type) come from
              // the FIRST row seen for this logical guid — identical across the set per §8's own design.
              label: [r[8], r[9], r[1]].filter(Boolean).join(' '), z1: -Infinity, rects: [],
              cx: r[2], cy: r[3], sx: r[5], sy: r[6], storey: r[11] || '' };
            order.push(lg);
          }
          var g = groups[lg];
          var z1 = r[4] + (r[7] || 0) / 2;
          if (z1 > g.z1) g.z1 = z1;   // conservative: if ANY sub-rect pokes above the envelope, check catches it
          g.rects.push({ cx: r[2], cy: r[3], cz: r[4], sx: r[5], sy: r[6], sz: r[7] });
        });
        // §ROOM_LENS_TAXONOMY (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §2/§10): category per logical
        // room, for the room-shell FILL COLOR (not the Type-tree list — that's computed
        // independently in _buildRoomTree(), same underlying signals, deliberately not unified
        // into one shared cache yet — a follow-up cleanup, not a correctness issue, since both call
        // the SAME deterministic classifiers on the SAME data and can never disagree).
        // 'corridor'/'restroom'/'utilities' each get a distinct shell color; every other real room
        // stays 'habitable'. §RESTROOM-CLASS (2026-07-17): a wet sanitary room (toilet/WC/bathroom)
        // is now its OWN brown hue — it reads as a different KIND of space from a living room at a
        // glance, matching the richer Type-tree sub-category it always carried.
        var corridorLabelsShell = NF._corridorLabelsFor();
        // §UTILITY-CONTENT-BATCH (2026-07-15, real perf fix — see room_habitability.js's own
        // comment for the Hospital hang this replaces): ONE batched classification call for every
        // logical room, not one call per room — was 2 SQL queries PER ROOM (600+ on Hospital's 311
        // rooms), now exactly 2 total regardless of building size.
        var utilityShellGuids = {};
        if (RH && RH.classifyUtilityRooms) {
          try {
            var shellRoomDescs = order.map(function(lg) {
              var g = groups[lg];
              return { guid: lg, cx: g.cx, cy: g.cy, sx: g.sx, sy: g.sy, storey: g.storey };
            });
            utilityShellGuids = RH.classifyUtilityRooms(shellRoomDescs, A.dbQuery);
          } catch (eUcShell) { /* leave everything habitable — never invent */ }
        }
        order.forEach(function(lg) {
          var g = groups[lg];
          if (RH) {
            var v = RH.spaceHabitable({ label: g.label, z1: g.z1 }, env);
            if (!v.ok) {
              excluded++;
              console.log('[RP-TA] §ROOM_VOL_NONHAB ' + (g.name || g.guid) + ' (' + g.guid + ') excluded — ' + v.why);
              return;
            }
          }
          var category = 'habitable';
          // Most-specific wins: corridor (spatial) first — a corridor is never a named room; then
          // the labelled room types (restroom/kitchen/bedroom, mutually exclusive by name); then
          // the generic utility/void spatial signal last. Everything else stays 'habitable'.
          if (corridorLabelsShell[lg]) category = 'corridor';
          else if (RH && RH.classifyRestroom && RH.classifyRestroom(g.label)) category = 'restroom';
          else if (RH && RH.classifyKitchen && RH.classifyKitchen(g.label)) category = 'kitchen';
          else if (RH && RH.classifyBedroom && RH.classifyBedroom(g.label)) category = 'bedroom';
          else if (utilityShellGuids[lg]) category = 'utilities';
          g.rects.forEach(function(rc) {
            var c = A.ifc2three(rc.cx, rc.cy, rc.cz);
            out.push({ guid: g.guid, name: g.name, category: category,
              center: new THREE.Vector3(c.x, c.y, c.z),
              size: new THREE.Vector3(Math.max(rc.sx || 0.3, 0.3), Math.max(rc.sz || 0.3, 0.3), Math.max(rc.sy || 0.3, 0.3)) });
          });
        });
        var kept = order.length - excluded;
        // Key names kept BACKWARD-COMPATIBLE with witness_room_lens_hab.js's existing
        // /habitable=(\d+) excluded=(\d+)/ regex (habitable = logical ROOM count, same semantic as
        // before this fix, when 1 row = 1 room); `boxes=` is the NEW field — sub-rect box count,
        // equal to habitable on any single-rect building (regression signal) and > habitable only
        // where §8 multi-rect data exists.
        console.log('[RP-TA] §ROOM_VOL_COUNT habitable=' + kept + ' excluded=' + excluded +
          ' boxes=' + out.length + (RH ? '' : ' (RoomHabitability NOT loaded — filter skipped)'));
        console.log('[RP-TA] §PERF_PROBE _allRoomVolumes ms=' + ((performance && performance.now) ? (performance.now() - _t0).toFixed(1) : '?')); // §13
        _roomVolCache = out; _roomVolCacheBld = A.activeBuilding; // §ROOM-VOL-CACHE: only the clean success path is cached
        return out;
      } catch (e) { console.warn('[RP-TA] §ROOM_VOL_ERR', e.message); }
      console.log('[RP-TA] §ROOM_VOL_COUNT habitable=' + out.length + ' excluded=' + excluded +
        ' boxes=' + out.length + (RH ? '' : ' (RoomHabitability NOT loaded — filter skipped)'));
      console.log('[RP-TA] §PERF_PROBE _allRoomVolumes ms=' + ((performance && performance.now) ? (performance.now() - _t0).toFixed(1) : '?')); // §13
      return out; // exception path — never cached, so the next entry retries fresh rather than sticking with a partial result
    }

    // §FLYTHRU_ROOMS (2026-09-07) — exposed for cpe_flythru_cues.js. Read-only handle to the SAME
    // cached function the Room Lens uses; no behaviour change here, and the cue layer must never
    // get its own second room query (prompts/MEP_CLASH_REVEAL_MOVIE.md §10.2).
    A.allRoomVolumes = _allRoomVolumes;

    // Remove boxes, restore opacity (turn X-Ray off if WE turned it on), drop outline.
    function _roomLensReset() {
      _clearRoomBoxes();
      if (A.setOutline) A.setOutline([]);
      if (A.filterByGuids) A.filterByGuids(null);  // §SHELL: un-hide the base (shell-mode or old _USE_SHELL)
      // §ROOM-LENS-BBOX-DEFAULT teardown: symmetric with the bbox-shell branch _roomLensOn() below
      // takes on a large building — same lensOwned convention _highlightLensReset() already uses.
      if (NF._mgLensOwned && NF._mergedGhost) {
        NF._mergedGhost.visible = false; NF._mgLensOwned = false;
        console.log('[MG] §ROOM_LENS_BBOX_RESET hidden (lens-owned)');
      }
      if (A.xrayOn && NF._roomXrayWasOff && A.toggleXray) A.toggleXray(); // WE turned x-ray on → turn it off (restores _origOpacity=1)
      else if (A.xrayOn) _dimXrayTo(0.3); // §XRAY_UNDISTURB: user had Alt+Z on before Find → our _dimXrayTo(0.12) lingers; put the normal 0.3 back
      NF._roomXrayWasOff = false;
      if (A.markDirty) A.markDirty();
    }

    // §RP-SHELL (option 3): the Room axis ghosts the building and draws EVERY room as a
    // shine-through shell (IfcSpace volume) — the instant room map. Tapping a room brightens its
    // shell + dims its contents inside it (see _roomSelect). Shells live in _roomBoxes, disposed
    // on reset/axis-switch.
    // §ROOM-LENS-BBOX-DEFAULT (2026-07-15m, user-reported live pre-deploy "large overhead low
    // speed" on a real large building): this always used to force full x-ray + dim EVERY real
    // element to 0.12 opacity — a genuine PER-FRAME GPU render cost (thousands of individually
    // x-rayed meshes redrawn every orbit/pan frame), not something the earlier §PERF_PROBE JS
    // timers could see (those measure one-shot synchronous JS work, not ongoing paint cost). The
    // Room axis is this feature's own most-used view, yet it never picked up the desktop
    // bbox-shell default (§DESKTOP-BBOX-THRESHOLD) — that only covered _drillSelect()'s group-tap
    // path, a completely separate function. Fix: large buildings now get the SAME light bbox-
    // wireframe ghost + hidden real geometry _drillSelect() already uses, instead of x-ray-dim —
    // real geometry rendering drops from thousands of individually-shaded meshes to one instanced
    // wireframe draw call per discipline (measured 115ms ONE-TIME build cost on Terminal's 34446
    // envelope boxes, cached per building thereafter) plus zero ongoing x-ray shading cost.
    function _roomLensOn() {
      var _rlT0 = (performance && performance.now) ? performance.now() : 0; // §PERF_PROBE (2026-07-15j, §13)
      _clearRoomBoxes();
      var _large = (typeof NF._isLargeBuilding === 'function') && NF._isLargeBuilding();
      if (_large && A.filterByGuids) {
        var _mg = (NF._mergedGhost && NF._mergedGhostBld === A.activeBuilding) ? NF._mergedGhost : NF._buildMergedGhost();
        if (_mg) {
          _mg.visible = true; NF._mgLensOwned = true;
          A.filterByGuids(new Set()); // hide every real mesh — bbox ghost is the surrounding context
          console.log('[MG] §ROOM_LENS_BBOX_DEFAULT large building → bbox ghost instead of x-ray-dim');
        } else { // bbox build failed (deps missing) — fall back to the proven x-ray path, never worse
          if (!A.xrayOn && A.toggleXray) { A.toggleXray(); NF._roomXrayWasOff = true; }
          _dimXrayTo(0.12);
        }
      } else {
        if (!A.xrayOn && A.toggleXray) { A.toggleXray(); NF._roomXrayWasOff = true; } // ghost the rest
        _dimXrayTo(0.12);
      }
      var vols = _allRoomVolumes();
      // §MULTI-RECT: `vols` is FLAT (one entry per sub-rect box; `guid` is the LOGICAL room guid).
      // Draw one shell per sub-rect (their union IS the room's real footprint) but count ROOMS by
      // distinct guid — same "N rects = ONE logical room" convention W-ROOM-FILL/W-HBA-MULTIRECT
      // already proved for hba_lens.js's outline drawing.
      var rooms = {}, catCounts = {}, synCount = 0;
      vols.forEach(function(v) {
        var fillColor = _categoryColor(v.category).fill;
        // §SYNTHETIC-HONESTY (WalkerDoctrine §14: a computed/approximate room must never be
        // presented as real): a compiled room (guid 'RM_…' or an '≈'-prefixed name) is drawn
        // FAINTER than a real extracted IfcSpace, so the wash itself signals data provenance.
        var syn = /^RM_/.test(v.guid || '') || /^\s*≈/.test(v.name || '');
        if (syn) synCount++;
        var mesh = _drawRoomShell(v.center, v.size, syn ? 0.06 : 0.12, fillColor);
        if (mesh) NF._roomBoxes.push({ guid: v.guid, name: v.name, mesh: mesh, center: v.center, size: v.size, category: v.category, synthetic: syn });
        rooms[v.guid] = true;
        catCounts[v.category] = (catCounts[v.category] || 0) + 1;
      });
      console.log('[RP-TA] §ROOM_LENS_CATEGORY habitable=' + (catCounts.habitable || 0) +
        ' corridor=' + (catCounts.corridor || 0) + ' restroom=' + (catCounts.restroom || 0) +
        ' kitchen=' + (catCounts.kitchen || 0) + ' bedroom=' + (catCounts.bedroom || 0) +
        ' utilities=' + (catCounts.utilities || 0) + ' | synthetic=' + synCount + ' real=' + (vols.length - synCount));
      if (A.markDirty) A.markDirty();
      console.log('[RP-TA] §ROOM_LENS mode=shell rooms=' + Object.keys(rooms).length +
        ' shells=' + NF._roomBoxes.length + ' (all rooms shine-through; building ghost=0.12)');
      console.log('[RP-TA] §PERF_PROBE _roomLensOn total_ms=' + ((performance && performance.now) ? (performance.now() - _rlT0).toFixed(1) : '?')); // §13
    }

    // §RP zoom-to-fit: frame the camera on a box (center+size, Three units). Reuses the
    // proven camera-lerp from diff.js zoomToGuid, but is box-based (works for rooms/phases/
    // elements that live in batched/instanced meshes, which zoomToGuid can't find). markDirty
    // every frame — the §S286 idle gate parks the loop, so the move won't render without it.
    // Shared camera fly-to: lerp to `dist` units from `center` along the standard iso offset,
    // easing over ~0.3s. markDirty each frame — the §S286 idle gate parks the loop otherwise.
    var _lerpId = 0, _lerpHooked = false;
    function _lerpCam(center, dist) {
      if (!A.camera || !A.controls || typeof THREE === 'undefined') return;
      // §FLY-YIELD: the moment the user grabs the controls (OrbitControls 'start'), cancel any in-flight
      // fly — otherwise the lerp keeps writing target+position and fights the pull ("hits back").
      if (!_lerpHooked && A.controls.addEventListener) {
        A.controls.addEventListener('start', function() { _lerpId++; });
        _lerpHooked = true;
      }
      var myId = ++_lerpId;                          // a newer fly or a user grab supersedes this one
      var end = center.clone().add(new THREE.Vector3(0.5, 0.5, 0.7).normalize().multiplyScalar(dist));
      var start = A.camera.position.clone();
      var t = 0;
      function anim() {
        if (myId !== _lerpId) return;                // superseded / user took over → stop writing the camera
        t += 0.04; if (t > 1) t = 1;
        var e = 1 - Math.pow(1 - t, 3);
        A.camera.position.lerpVectors(start, end, e);
        A.controls.target.copy(center);
        A.controls.update();
        if (A.markDirty) A.markDirty();
        if (t < 1) requestAnimationFrame(anim);
      }
      anim();
    }
    // Item zoom: maxDim*factor heuristic — a tight frame on a small lit item.
    function _zoomToBox(center, size, factor) {
      _lerpCam(center, Math.max(size.x, size.y, size.z) * (factor || 3) + 1);  // §FILL: small pad
    }
    // §DEPTH box-fit: distance so the box's PROJECTED extent fills the frame from the iso view
    // angle. The old bounding-SPHERE fit overshot (the box sits small inside its sphere → "doesn't
    // fill the screen"); this projects the 8 corners onto the camera right/up/forward basis and fits
    // width AND height to the frustum — so a whole storey/phase/material/room actually FILLS the view.
    function _fitDistForBox(size) {
      var dir = new THREE.Vector3(0.5, 0.5, 0.7).normalize();   // matches _lerpCam offset direction
      var fwd = dir.clone().negate();
      var right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      var up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      var hx = size.x / 2, hy = size.y / 2, hz = size.z / 2, hW = 0, hH = 0, hD = 0, c = new THREE.Vector3();
      for (var sx = -1; sx <= 1; sx += 2) for (var sy = -1; sy <= 1; sy += 2) for (var sz = -1; sz <= 1; sz += 2) {
        c.set(sx * hx, sy * hy, sz * hz);
        hW = Math.max(hW, Math.abs(c.dot(right))); hH = Math.max(hH, Math.abs(c.dot(up))); hD = Math.max(hD, Math.abs(c.dot(fwd)));
      }
      var tanV = Math.tan((A.camera.fov || 50) * Math.PI / 360);  // tan(fov/2)
      var tanH = tanV * (A.camera.aspect || 1);
      // Fit the box's CENTER cross-section so it FILLS the frame. Only a SMALL fraction of the
      // half-depth is added (full hD pushed the camera way back on elongated storeys → "doesn't
      // fill"); 0.3·hD keeps the near face off the near-plane without losing the fill. 1.03 breathing.
      return (Math.max(hH / tanV, hW / tanH) + hD * 0.3) * 1.03;
    }
    function _zoomToBoxFill(center, size, tag, mult) {
      if (!A.camera || !size) return false;
      var dist = _fitDistForBox(size) * (mult || 1);   // mult>1 pulls the camera back (room picks: not too near)
      _lerpCam(center, dist);
      console.log('[RP-TB] §' + (tag || 'GROUP_ZOOM') + ' fill dist=' + dist.toFixed(1) + ' mult=' + (mult || 1) +
        ' size=' + size.x.toFixed(1) + 'x' + size.y.toFixed(1) + 'x' + size.z.toFixed(1));
      return true;
    }
    function _zoomToGroup(set) {
      var bb = NF._bboxOfGuids(set); if (!bb || !A.camera) return false;
      return _zoomToBoxFill(bb.center, bb.size, 'GROUP_ZOOM');
    }

    // §ROOM-GUID-AWARE (2026-07-13, real bug found live: user-reported a multi-rect room's
    // Find-panel selection binding to one small SUB-RECT instead of the room's own overall extent
    // — reported symptoms "still too small" + "shifted into a wall" both traced to this). Verified
    // on real data: HHS alone has 18/70 logical rooms split across 2-4 spatial_structure rows
    // (§MULTI-RECT, a real, intentional compile feature for L-shaped/irregular rooms) sharing one
    // `room_guid`, e.g. RM_Level_1_12 (9.95x7.96m, the real room) + RM_Level_1_12b (2.0x1.7m, a
    // small offshoot ~7m away) both named "≈ Level 1 R12" — clicking either shows only ONE piece.
    // This is the SAME gap ROOM_INTELLIGENCE_SCOREBOARD.md already named ("_roomSelect() sibling
    // function still not room_guid-aware") — not a new invention, a previously-flagged fix landing
    // now. Shared by both callers (WalkerDoctrine §10: one function, not two separate point-fixes)
    // — mirrors the SAME room_guid-probe + fallback shape _allRoomVolumes() already uses correctly
    // for the Room Lens shell view, just computing a UNION bbox (min/max corner across every
    // sub-rect) instead of keeping each sub-rect as its own shell. Byte-identical fallback for any
    // schema/row without room_guid (older DBs, real non-compiled IfcSpace rows): falls through to
    // the exact single-row query this replaces.
    function _roomUnionBBox(guid) {
      if (!guid || !A.dbQuery) return null;
      var hasRoomGuid = false;
      try {
        var ssCols = A.dbQuery("PRAGMA table_info(spatial_structure)");
        hasRoomGuid = ssCols.some(function(c) { return c[1] === 'room_guid'; });
      } catch (eCols) { /* hasRoomGuid stays false -> single-row fallback below */ }
      // §ROOM-GUID-AWARE robustness: `guid` may be EITHER the group's canonical room_guid OR one
      // individual sub-rect's own guid (e.g. a scene click resolving to "RM_Level_1_12b" directly,
      // not via the now-deduped Find-panel list) — resolve to the canonical logical guid FIRST,
      // then union every row sharing it, so the result is correct regardless of which guid a caller
      // happens to pass. Caught by direct verification (node, this session): querying by a sub-rect's
      // own guid without this resolve step returned rectCount=1 (that one sub-rect only), not the
      // room's full union.
      var logicalGuid = guid;
      if (hasRoomGuid) {
        try {
          var rg = A.dbQuery("SELECT room_guid FROM spatial_structure WHERE guid = ? AND type='IfcSpace'", [guid]);
          if (rg.length && rg[0][0]) logicalGuid = rg[0][0];
        } catch (eRg) {}
      }
      var rows;
      try {
        rows = A.dbQuery("SELECT s.guid, s.name, p.name, s.center_x, s.center_y, s.center_z, s.size_x, s.size_y, s.size_z" +
          " FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid" +
          " WHERE s.type='IfcSpace' AND (s.guid = ?" + (hasRoomGuid ? " OR s.room_guid = ?" : "") + ")",
          hasRoomGuid ? [logicalGuid, logicalGuid] : [logicalGuid]);
      } catch (e) { console.warn('[RP-TA] §ROOM_UNION_ERR', e.message); return null; }
      if (!rows || !rows.length) return null;
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      var name = rows[0][1], storey = rows[0][2];
      rows.forEach(function (r) {
        var cx = r[3], cy = r[4], cz = r[5], sx = r[6] || 0, sy = r[7] || 0, sz = r[8] || 0;
        if (cx == null) return;
        x0 = Math.min(x0, cx - sx / 2); x1 = Math.max(x1, cx + sx / 2);
        y0 = Math.min(y0, cy - sy / 2); y1 = Math.max(y1, cy + sy / 2);
        z0 = Math.min(z0, cz - sz / 2); z1 = Math.max(z1, cz + sz / 2);
      });
      if (!isFinite(x0)) return null;
      var out = { name: name, storey: storey, rectCount: rows.length,
        cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0 };
      console.log('[RP-TA] §ROOM_UNION_BBOX guid=' + guid + ' rects=' + out.rectCount +
        ' box=' + out.sx.toFixed(2) + 'x' + out.sy.toFixed(2) + 'x' + out.sz.toFixed(2) +
        ' center=' + out.cx.toFixed(2) + ',' + out.cy.toFixed(2) + ',' + out.cz.toFixed(2));
      return out;
    }

    // §RP-SHAPE: tap a room → light its real CONTENTS (rel_contained_in_space) in cyan,
    // keep that storey solid, rest at 0.2 (same drill as Phase/Material). No box.
    // §CORRIDOR-ROOM-BACKPROP (2026-07-14): a `CORRIDOR_ROOM::*` guid has NO spatial_structure row
    // — it's a synthetic room node injected by room_graph.js's buildGraph() for a real, door+wall-
    // verified hallway bucket that room-compilation never turned into a room. _roomUnionBBox()
    // would correctly return null for it (nothing to query), so build the SAME {name,storey,
    // rectCount,cx,cy,cz,sx,sy,sz} shape directly from the room graph's own node instead — real
    // measured position/span either way, just a different (in-memory, not DB) source. sz (height)
    // has no measured real ceiling for a synthetic hallway node — per user steer (2026-07-14): this
    // box is for PATH-OF-MOVEMENT first, not volumetric/ceiling accuracy, so a 2.0m human-clearance
    // height is enough even where the real ceiling is much taller (a foyer/atrium-fronted corridor,
    // say) — same movement-clearance convention as common/hallway_backbone.js's STAIR_CLEARANCE.
    // Real ceiling height (for equipment placement etc) is Modeller's job later, not this walkway box.
    var CORRIDOR_BOX_CLEARANCE_HEIGHT = 2.0;
    function _corridorRoomBBox(guid) {
      var graph = NF._roomGraphFor();
      var n = graph && graph.nodesByGuid && graph.nodesByGuid[guid];
      if (!n || n.kind !== 'room' || !n.rects || !n.rects.length) return null;
      var rc = n.rects[0];
      return { name: n.name, storey: n.storey, rectCount: 1,
        cx: n.cx, cy: n.cy, cz: n.cz, sx: rc.x1 - rc.x0, sy: rc.y1 - rc.y0, sz: CORRIDOR_BOX_CLEARANCE_HEIGHT };
    }

    function _roomSelect(guid) {
      if (_categoryRevealOn) _clearCategoryReveal(); // a leaf tap commits to one room — any active headline reveal is now stale
      var set = new Set(), name = guid, storeySet = null, zoomBox = null;
      var isCorridorRoom = guid.indexOf('CORRIDOR_ROOM::') === 0;
      if (!isCorridorRoom) { try { NF._surfaceConstructionLink(guid, guid); } catch (e) {} }
      try {
        var rw = isCorridorRoom ? _corridorRoomBBox(guid) : _roomUnionBBox(guid);
        if (rw) { name = rw.name || guid; var storey = rw.storey;
          if (storey) { storeySet = new Set();
            A.dbQuery("SELECT guid FROM elements_meta WHERE storey = ?", [storey])
              .forEach(function(r) { storeySet.add(r[0]); }); }
          // §ROOM_ZOOM: frame the room's VOLUME (center+size from spatial_structure, UNIONED across
          // every §MULTI-RECT sub-rect this logical room owns), not its few contained elements — a
          // 2-element room would otherwise zoom to a tiny erroneous frame.
          if (rw.cx != null && rw.sx != null && A.ifc2three && typeof THREE !== 'undefined') {
            var cc = A.ifc2three(rw.cx, rw.cy, rw.cz);  // IFC size → Three: x→x, z→y, y→z (bbox parity)
            zoomBox = { center: new THREE.Vector3(cc.x, cc.y, cc.z),
              size: new THREE.Vector3(Math.max(rw.sx || 0.5, 0.5), Math.max(rw.sz || 0.5, 0.5), Math.max(rw.sy || 0.5, 0.5)) };
          }
        }
      } catch (e) { console.warn('[RP-TA] §ROOM_SELECT_ERR', e.message); }
      // dim every overview shell so the picked room stands alone
      NF._roomBoxes.forEach(function(rb) {
        if (rb.mesh && rb.mesh.material) { rb.mesh.material.opacity = 0.04; rb.mesh.material.needsUpdate = true; }
      });
      // §ROOM_HIGHLIGHT (2026-07-12, VIEWER_FIND_PANEL_ROOM_ACCURACY.md §8): the abstract single-box
      // cuboid (_drawRoomCuboid — ONE mesh, no seams) is now the PRIMARY highlight whenever the room's
      // volume (zoomBox) is known. The real-bounding-element lookup (_roomBoundingGuids) still runs and
      // still drives the storey-dim/x-ray/zoom-to-fit side effects via _drillSelect — it's just no
      // longer what LIGHTS UP: multiple adjacent real elements each getting their own yellow fill/
      // silhouette read as fragmented "cut" seams where they meet. Real-element highlight only remains
      // the default when no room volume is available to draw a cuboid from.
      // §ROOM-GUID-AWARE: _roomBoundingGuids expects the array shape [name,parentName,cx,cy,cz,sx,sy,sz]
      // — build it from the UNION bbox (rw, above) so real-wall lookup scans the room's whole footprint,
      // not just one sub-rect.
      var bound = _roomBoundingGuids(rw ? [rw.name, null, rw.cx, rw.cy, rw.cz, rw.sx, rw.sy, rw.sz] : null);
      // §ROOM_LENS_TAXONOMY: a CORRIDOR_ROOM::* guid IS a corridor by construction (no lookup
      // needed — it never has a _roomBoxes shell entry since _allRoomVolumes() only queries real
      // spatial_structure rows); every other room's category was already computed once by
      // _roomLensOn() and lives on its _roomBoxes entry — reuse it, never recompute.
      var selCategory = 'habitable';
      if (isCorridorRoom) selCategory = 'corridor';
      else { var rbMatch = NF._roomBoxes.filter(function(rb) { return rb.guid === guid; })[0];
        if (rbMatch && rbMatch.category) selCategory = rbMatch.category; }
      // §CUBOID-PAINT-ORDER (2026-07-15, user-reported live testing: "purple does not shine thru
      // in solid or x-ray mode, only bbox mode"): _drawRoomCuboid()'s shine-through trick
      // (depthTest:false + a high renderOrder, both the §BORDER_STRONG wire and #797's
      // §FILL-SHINE-THROUGH glow) only controls PAINT ORDER when the renderer actually sorts by
      // renderOrder. Selecting a room in the Find panel ALWAYS auto-enables X-Ray if it wasn't
      // already on (see the `!A.xrayOn && A.toggleXray` calls a few lines below, inside
      // _drillSelect's caller chain) — and A.toggleXray() sets `A.renderer.sortObjects =
      // !A.xrayOn` (viewer/tools.js, a real perf optimization for X-Ray's many-material update).
      // With sortObjects FALSE, three.js ignores renderOrder entirely and paints in raw
      // scene-graph traversal order instead — so whichever mesh was ADDED to the scene LAST wins
      // the pixel, regardless of renderOrder. _drawRoomCuboid() used to run BEFORE _drillSelect()
      // below, so the cuboid was added FIRST and _drillSelect's own context/ghost overlay meshes
      // (added after) painted OVER it — hiding the "shines through" glow specifically in the
      // sortObjects=false state this feature normally runs in. "Bbox" mode only looked unaffected
      // because it replaces most real geometry with thin wireframes, leaving little solid pixel
      // coverage to reveal the same underlying bug. Fix: call _drillSelect FIRST so the cuboid is
      // always the LAST thing added to the scene each selection — correct on top regardless of
      // sortObjects state, no change to the X-Ray perf optimization itself.
      if (bound.size && zoomBox) {
        var _clip = _boxClipPlanes(zoomBox.center, zoomBox.size, 0.7);   // confine the ancestor shell to the cuboid (+0.7m)
        console.log('[RP-TA] §ROOM_HIGHLIGHT mode=cuboid guid=' + guid + ' bound=' + bound.size +
          ' box=' + zoomBox.size.x.toFixed(1) + 'x' + zoomBox.size.y.toFixed(1) + 'x' + zoomBox.size.z.toFixed(1) + ' margin=0.7');
        NF._drillSelect(bound, name, 'ROOM_SELECT', { isItem: true, parentSet: storeySet, zoomBox: zoomBox, clipPlanes: _clip, zoomMult: 1.8, suppressHighlight: true });
        _drawRoomCuboid(zoomBox.center, zoomBox.size, selCategory, guid);
      } else if (bound.size) {
        console.log('[RP-TA] §ROOM_HIGHLIGHT mode=bounding-elements guid=' + guid + ' (no zoomBox available)');
        NF._drillSelect(bound, name, 'ROOM_SELECT', { isItem: true, parentSet: storeySet, zoomBox: zoomBox, zoomMult: 1.8 });
      } else {
        console.log('[RP-TA] §ROOM_HIGHLIGHT mode=' + (zoomBox ? 'cuboid' : 'cuboid-fallback') + ' guid=' + guid + ' (no bounding mesh found)');
        NF._drillSelect(storeySet || new Set([guid]), name, 'ROOM_SELECT', { isItem: false, zoomBox: zoomBox });
        if (zoomBox) _drawRoomCuboid(zoomBox.center, zoomBox.size, selCategory, guid);
      }
    }

    // §ROOM_LENS_TAXONOMY (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §3/§9, 2026-07-15): a NEW, lightweight
    // "reveal" for a Storey or Type headline tap — camera stays put, that group's own room-shell
    // boxes brighten to their real category color, every real door serving those rooms lights up
    // brown, tapping the SAME headline again clears it. This REPLACES the old _roomGroupSelect
    // isolate-drill for normal room headers specifically (user's own framing: today's immediate
    // zoom/isolate on a header tap is premature for someone still building a mental map of the
    // floor — the reveal is the lighter first move; a single ROOM's leaf tap keeps the existing
    // zoom-in unchanged, see _roomSelect). Raw Parts-migrated groups (Stairs/Lift-Shaft/Plant-Room)
    // still use `_isolatePartsGroup` at the header level (see the render loop below) — those were
    // never IfcSpace rows, there's no room-shell/category concept to reveal for them.
    var _categoryRevealOn = null;   // null | the currently-revealed group key (gk)
    var _revealDoorMeshes = [];     // brown door-marker meshes, disposed on toggle-off/switch
    function _clearCategoryReveal() {
      _revealDoorMeshes.forEach(function(m) {
        if (m.parent) m.parent.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      });
      _revealDoorMeshes = [];
      // §CORRIDOR-REVEAL-SHELL: a shell _revealCategoryGroup added for a backprop CORRIDOR_ROOM::*
      // guid was never part of the base Room Lens batch (_roomLensOn never draws one for it) — DROP
      // it entirely here rather than just dimming, or it lingers as a phantom faint box forever
      // (until the whole lens resets on axis-switch/panel-close, a much later teardown).
      var kept = [];
      NF._roomBoxes.forEach(function(rb) {
        if (rb.mesh && rb.mesh.userData && rb.mesh.userData._revealAdded) {
          if (rb.mesh.parent) rb.mesh.parent.remove(rb.mesh);
          if (rb.mesh.geometry) rb.mesh.geometry.dispose();
          if (rb.mesh.material) rb.mesh.material.dispose();
          return;
        }
        if (rb.mesh && rb.mesh.material && rb.mesh.userData && rb.mesh.userData._roomShell) {
          rb.mesh.material.opacity = 0.10;   // §RP-SHELL's own baseline shine-through opacity
          rb.mesh.material.needsUpdate = true;
        }
        kept.push(rb);
      });
      NF._roomBoxes = kept;
      _categoryRevealOn = null;
      if (A.markDirty) A.markDirty();
    }
    // Real door positions for a set of room guids — reuses room_graph.js's ALREADY-COMPUTED
    // door-to-room edges (E1/E2/E9, each carrying the door's own real guid/position via its
    // 'doorwp' node) instead of a new query; never invented, same graph the Path sub-mode uses.
    function _doorPositionsForRooms(guids) {
      var graph = NF._roomGraphFor();
      if (!graph) return [];
      var guidSet = {}; guids.forEach(function(g) { guidSet[g] = true; });
      var seen = {}, out = [];
      graph.edges.forEach(function(e) {
        if (!e.doorGuid || seen[e.doorGuid]) return;
        if (!guidSet[e.a] && !guidSet[e.b]) return;
        seen[e.doorGuid] = true;
        var n = graph.nodesByGuid[e.doorGuid];
        if (n) out.push({ guid: e.doorGuid, x: n.cx, y: n.cy, z: n.cz || 0 });
      });
      // §DOOR-REAL-BOX (2026-07-15k, ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §5/§12 "real door mesh/box
      // instead of a sphere marker"): one batched query for every door's REAL measured footprint
      // (bbox_x/bbox_y, real leaf width) + yaw (rotation_z) — same discipline as classifyUtilityRooms
      // just above (never one query per marker). Never invents a size: a door missing a row here
      // just keeps its position with sizeX/sizeY/yaw undefined, and the caller falls back to the
      // old sphere for that one marker only (never a fabricated box dimension).
      if (out.length && A.dbQuery) {
        try {
          var ph = out.map(function() { return '?'; }).join(',');
          var rows = A.dbQuery('SELECT guid, bbox_x, bbox_y, bbox_z, rotation_z FROM element_transforms WHERE guid IN (' + ph + ')',
            out.map(function(o) { return o.guid; }));
          var byGuid = {};
          rows.forEach(function(r) { byGuid[r[0]] = { sizeX: r[1], sizeY: r[2], sizeZ: r[3], yaw: r[4] }; });
          out.forEach(function(o) {
            var d = byGuid[o.guid];
            if (d) { o.sizeX = d.sizeX; o.sizeY = d.sizeY; o.sizeZ = d.sizeZ; o.yaw = d.yaw; }
          });
        } catch (e) { console.warn('[RP-TA] §DOOR_BOX_DIM_ERR', e.message); }
      }
      return out;
    }
    // §DOOR-REAL-BOX (factored out 2026-07-26 so a SINGLE room's own select can reuse it too, not
    // just a whole-category reveal — see _drawRoomCuboid's call below): a box sized to the door's
    // own real bbox_x/bbox_y/bbox_z + yawed by its real rotation_z reads as an actual door leaf, not
    // an arbitrary sphere — real measured data, not invented. Every door SHARES one geometry+material
    // per (sizeX,sizeY,sizeZ) combo would be ideal but doors legitimately vary in size
    // building-to-building; a fresh BoxGeometry per marker is cheap (both callers cap this at a
    // handful of rooms' worth of doors, never the whole building) and disposal is the CALLER's job
    // (each caller tracks the returned meshes in its own array). Same fixed 0x8d5524 brown regardless
    // of which category/room is revealing them — including Restrooms, whose own shell fill (0x6d4c41,
    // ROOM_CATEGORY_COLORS above) is a close brown too; not fixed here, just noting the low-contrast
    // case exists (user asked, 2026-07-26) in case a future pass wants a distinct door hue instead.
    function _spawnDoorMeshesForRooms(guids) {
      var doorPositions = _doorPositionsForRooms(guids);
      var meshes = [];
      if (A.scene && A.ifc2three && typeof THREE !== 'undefined' && doorPositions.length) {
        var sphereGeo = null; // lazy singleton fallback, only built if a door is missing dims
        var doorMat = new THREE.MeshBasicMaterial({ color: 0x8d5524, transparent: true, opacity: 0.85, depthTest: false });
        var boxCount = 0, sphereCount = 0;
        doorPositions.forEach(function(p) {
          var c = A.ifc2three(p.x, p.y, p.z);
          var m;
          if (p.sizeX > 0 && p.sizeY > 0) {
            var geo = new THREE.BoxGeometry(p.sizeX, (p.sizeZ > 0 ? p.sizeZ : 2.0), p.sizeY);
            m = new THREE.Mesh(geo, doorMat);
            m.rotation.y = -(p.yaw || 0); // ifc2three's Y-up convention: yaw sign flips vs. IFC's Z-up rotation_z
            boxCount++;
          } else {
            if (!sphereGeo) sphereGeo = new THREE.SphereGeometry(0.2, 10, 10);
            m = new THREE.Mesh(sphereGeo, doorMat);
            sphereCount++;
          }
          m.position.set(c.x, c.y + 0.05, c.z);
          m.renderOrder = 1002;
          m.userData._doorMarker = true; // §-verifiable: witnesses can traverse the scene for this tag rather than guessing by color/position
          A.scene.add(m);
          meshes.push(m);
        });
        console.log('[RP-TA] §DOOR_MARKER_SHAPE boxes=' + boxCount + ' spheres(no-real-dims-fallback)=' + sphereCount);
      }
      return meshes;
    }
    function _revealCategoryGroup(gk, groupRooms) {
      if (_categoryRevealOn === gk) { _clearCategoryReveal(); console.log('[RP-TA] §CATEGORY_REVEAL off gk="' + gk + '"'); return; }
      _clearCategoryReveal(); // mutually exclusive — switching categories clears the previous one first
      var guidSet = {};
      (groupRooms || []).forEach(function(rm) { guidSet[rm.key] = true; });
      var brightened = 0, matchedGuids = {};
      NF._roomBoxes.forEach(function(rb) {
        if (rb.mesh && rb.mesh.material && guidSet[rb.guid]) {
          rb.mesh.material.opacity = 0.55;   // same "brightened" level _drawPathHighlight already uses for path-member shells
          rb.mesh.material.needsUpdate = true;
          brightened++;
          matchedGuids[rb.guid] = true;
        }
      });
      // §CORRIDOR-REVEAL-SHELL (2026-07-26, user-reported live testing: tapping "Hall / Corridor"
      // lit doors brown but left every shell dark — confirmed in a live console capture,
      // `§CATEGORY_REVEAL on gk="Hall / Corridor" rooms=0 doors=59`): a `CORRIDOR_ROOM::*` guid (the
      // §CORRIDOR-ROOM-BACKPROP synthetic hallway bucket, real door+wall-verified but with NO
      // spatial_structure row) never gets a shell in `_roomBoxes` — `_allRoomVolumes()` only queries
      // real rows, same reason `_roomSelect` needs its own `isCorridorRoom`/`_corridorRoomBBox`
      // branch instead of the normal `_roomBoxes` lookup. The `rooms=0` case above is exactly a
      // Hall/Corridor group made ENTIRELY of these backprop entries — nothing in `_roomBoxes` could
      // ever match. Draw a fresh shell for each unmatched member here, same helper `_roomSelect`
      // already uses for the single-room case — real measured position/span, not invented — and
      // start it already brightened (0.55) since it's created FOR this reveal, never dim-then-skip.
      var addedShells = 0;
      Object.keys(guidSet).forEach(function(g) {
        if (matchedGuids[g] || g.indexOf('CORRIDOR_ROOM::') !== 0) return;
        var rw = _corridorRoomBBox(g);
        if (!rw || rw.cx == null || rw.sx == null || !A.ifc2three || typeof THREE === 'undefined') return;
        var cc = A.ifc2three(rw.cx, rw.cy, rw.cz);
        var center = new THREE.Vector3(cc.x, cc.y, cc.z);
        var size = new THREE.Vector3(Math.max(rw.sx || 0.5, 0.5), Math.max(rw.sz || 0.5, 0.5), Math.max(rw.sy || 0.5, 0.5));
        var mesh = _drawRoomShell(center, size, 0.55, _categoryColor('corridor').fill);
        if (mesh) {
          mesh.userData._revealAdded = true; // §CORRIDOR-REVEAL-SHELL: never part of the base Room Lens batch — _clearCategoryReveal must DISPOSE it, not just dim it, or it leaks into every later view
          NF._roomBoxes.push({ guid: g, name: rw.name, mesh: mesh, center: center, size: size, category: 'corridor' });
          addedShells++; brightened++;
        }
      });
      _revealDoorMeshes = _spawnDoorMeshesForRooms(Object.keys(guidSet));
      _categoryRevealOn = gk;
      if (A.markDirty) A.markDirty();
      console.log('[RP-TA] §CATEGORY_REVEAL on gk="' + gk + '" rooms=' + brightened + ' addedShells=' + addedShells + ' doors=' + _revealDoorMeshes.length);
    }

    // §RP sub-toggle row [A | B | ...] — a small N-pill regroup control inside a lens tree.
    // §7 (VIEWER_FIND_PANEL_ROOM_ACCURACY.md): generalized from a fixed 2-pill signature to an
    // options array so the Room axis could grow a 3rd "Path" pill without a second control type.
    // Old (labelA,valA,labelB,valB,current,onPick) call shape still works — normalized below.
    function _subToggleRow(a, b, c, d, e, f) {
      var options, current, onPick;
      if (Array.isArray(a)) { options = a; current = b; onPick = c; }
      else { options = [{ label: a, val: b }, { label: c, val: d }]; current = e; onPick = f; }
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;padding:6px 10px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.05)';
      var hint = document.createElement('span');
      hint.style.cssText = 'font-size:10px;color:#888;margin-right:2px';
      hint.textContent = NF._t('ui_lens_group', 'group:');
      row.appendChild(hint);
      options.forEach(function(o) {
        var on = (current === o.val);
        var btn = document.createElement('button');
        btn.textContent = o.label;
        btn.style.cssText = 'padding:3px 10px;font-size:10px;font-weight:700;border-radius:5px;cursor:pointer;white-space:nowrap;' +
          'border:1px solid rgba(79,195,247,' + (on ? '0.7' : '0.25') + ');' +
          'background:rgba(79,195,247,' + (on ? '0.25' : '0.08') + ');color:' + (on ? '#fff' : '#4fc3f7') + ';';
        btn.addEventListener('pointerup', function(e) { e.stopPropagation(); onPick(o.val); });
        row.appendChild(btn);
      });
      return row;
    }
};
