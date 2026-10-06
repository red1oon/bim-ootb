// effects family — part `props_staffage` (original effects.js lines 468–2542).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/effects.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as FXS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__effectsParts = (typeof window !== 'undefined' ? window : globalThis).__effectsParts || {};
(typeof window !== 'undefined' ? window : globalThis).__effectsParts.props_staffage = function* __split_effects_props_staffage(FXS, A, renderer, scene, camera) {
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  FXS._reassertPhotoGlow = _reassertPhotoGlow;
  FXS._reassertPhotoSparkles = _reassertPhotoSparkles;
  FXS._buildingBBoxIfc = _buildingBBoxIfc;
  FXS._buildingBBoxArc = _buildingBBoxArc;
  FXS._disposePhotoProps = _disposePhotoProps;
  FXS._isGhostGeometry = _isGhostGeometry;
  FXS._showPhotoProps = _showPhotoProps;
  Object.defineProperty(FXS, 'PHOTO_SUN_COLOR', { get: function () { return PHOTO_SUN_COLOR; }, set: function (v) { PHOTO_SUN_COLOR = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_AMBIENT_COLOR', { get: function () { return PHOTO_AMBIENT_COLOR; }, set: function (v) { PHOTO_AMBIENT_COLOR = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_HEMI_SKY_COLOR', { get: function () { return PHOTO_HEMI_SKY_COLOR; }, set: function (v) { PHOTO_HEMI_SKY_COLOR = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SUN_INTENSITY_SCALE', { get: function () { return PHOTO_SUN_INTENSITY_SCALE; }, set: function (v) { PHOTO_SUN_INTENSITY_SCALE = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_EXPOSURE_SCALE', { get: function () { return PHOTO_EXPOSURE_SCALE; }, set: function (v) { PHOTO_EXPOSURE_SCALE = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_EXPOSURE_LIFT', { get: function () { return PHOTO_EXPOSURE_LIFT; }, set: function (v) { PHOTO_EXPOSURE_LIFT = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SUN_ELEVATION', { get: function () { return PHOTO_SUN_ELEVATION; }, set: function (v) { PHOTO_SUN_ELEVATION = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SUN_AZIMUTH', { get: function () { return PHOTO_SUN_AZIMUTH; }, set: function (v) { PHOTO_SUN_AZIMUTH = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SUN_ELEVATION_START', { get: function () { return PHOTO_SUN_ELEVATION_START; }, set: function (v) { PHOTO_SUN_ELEVATION_START = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_SUN_ELEVATION_END', { get: function () { return PHOTO_SUN_ELEVATION_END; }, set: function (v) { PHOTO_SUN_ELEVATION_END = v; }, enumerable: true });
  Object.defineProperty(FXS, 'TOPOUT_SNAP_EASE_U', { get: function () { return TOPOUT_SNAP_EASE_U; }, set: function (v) { TOPOUT_SNAP_EASE_U = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CIVIL_SUN_ELEVATION_START', { get: function () { return CIVIL_SUN_ELEVATION_START; }, set: function (v) { CIVIL_SUN_ELEVATION_START = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order
  // "few points" (user's own ceiling) — modest, clustered, not a per-panel scan
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
      "WHERE em.ifc_class IN (" + FXS.PHOTO_SPARKLE_FLAT_CLASSES + ") " +
      "AND et.bbox_x IS NOT NULL AND et.bbox_y IS NOT NULL AND et.rotation_z IS NOT NULL " +
      "AND MAX(et.bbox_x, et.bbox_y) > 2.0 " +
      "ORDER BY (et.bbox_x * et.bbox_y) DESC LIMIT 300"
    );
    var roundRows = A.dbQuery(
      "SELECT et.center_x, et.center_y, et.center_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.ifc_class IN (" + FXS.PHOTO_SPARKLE_ROUND_CLASSES + ") AND et.center_x IS NOT NULL " +
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
    var capFlat = Math.min(flatKeys.length, Math.ceil(FXS.PHOTO_SPARKLE_CAP * 0.5));
    var capRound = Math.min(roundKeys.length, FXS.PHOTO_SPARKLE_CAP - capFlat);
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
      pts.push({ mid3: posThree, normalThree: { x: wx, z: wz }, dotMin: FXS.PHOTO_SPARKLE_DOT_MIN_FLAT });
    });
    roundKeys.slice(0, capRound).forEach(function(k) {
      var r = roundBuckets[k];
      var posThree = A.ifc2three(r[0], r[1], r[2]);
      var centerThree = A.ifc2three(cx, cy, r[2]);
      var toEl = { x: posThree.x - centerThree.x, z: posThree.z - centerThree.z };
      var len = Math.hypot(toEl.x, toEl.z) || 1;
      pts.push({ mid3: posThree, normalThree: { x: toEl.x / len, z: toEl.z / len }, dotMin: FXS.PHOTO_SPARKLE_DOT_MIN_ROUND });
    });
    return pts;
  }
  function _getSparkleTexture() {
    if (FXS._sparkleTexCache) return FXS._sparkleTexCache;
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
    FXS._sparkleTexCache = new THREE.CanvasTexture(c);
    return FXS._sparkleTexCache;
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
    if (!A.sun || !A.camera || !FXS._photoSparkles.length) return;
    FXS._photoSparkles.forEach(function(s) {
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
      if (hLen < 1e-4 || facingCam < FXS.PHOTO_SPARKLE_FACING_MIN || !sunUp) { s.sprite.visible = false; return; }
      hx /= hLen; hz /= hLen;
      var dotHN = hx * s.normalThree.x + hz * s.normalThree.z;
      // §PHOTO_SPARKLE_REBUILD: rounded/edge-classified points (curtain-wall panels, mullions —
      // real curved-surface normal sweeps continuously) get a lower/wider dotMin than flat wall
      // panels (a true flat mirror only glints within a narrow band) — see _buildSparklePoints.
      var dotMin = (s.dotMin != null) ? s.dotMin : FXS.PHOTO_SPARKLE_DOT_MIN;
      if (dotHN <= dotMin) { s.sprite.visible = false; return; }
      var t = Math.min(1, (dotHN - dotMin) / (1 - dotMin));
      var sc = 1 + t * FXS.PHOTO_SPARKLE_SCALE_MAX;
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
    FXS._photoUplights.forEach(function(l) { A.scene.remove(l); });
    if (FXS._photoSkyline) { A.scene.remove(FXS._photoSkyline); FXS._photoSkyline.children.forEach(function(b) { b.geometry.dispose(); b.material.dispose(); }); }
    if (FXS._photoSkylineLights) { A.scene.remove(FXS._photoSkylineLights); FXS._photoSkylineLights.geometry.dispose(); FXS._photoSkylineLights.material.dispose(); }
    FXS._photoSparkles.forEach(function(s) { A.scene.remove(s.sprite); s.sprite.material.dispose(); });
    FXS._photoUplights = []; FXS._photoFacadeLights = []; FXS._photoSkyline = null; FXS._photoSkylineLights = null;
    FXS._photoRoofCorners = []; FXS._photoRoofSpotA = null; FXS._photoRoofSpotB = null; FXS._photoSparkles = [];
  }
  function _buildPhotoProps() {
    var bbox = _buildingBBoxIfc();
    if (!bbox) return;
    FXS._photoPropsBuilding = A.activeBuilding;
    var cx = (bbox.xMin + bbox.xMax) / 2, cy = (bbox.yMin + bbox.yMax) / 2;
    var w = bbox.xMax - bbox.xMin, d = bbox.yMax - bbox.yMin;
    var groundZ = bbox.zMin, roofZ = bbox.zMax;

    // §NO_PHOTO_PROPS (red1 2026-09-26: "glow bulb ... can't we do away with it?"; ruling PHOTO PROPS: REMOVE COMPLETELY): the
    // fabricated staging lights that stood here are gone — facade up/downlights, roof-corner twin spots, door sconces, tree
    // uplights, the skyline's window-light points and the sun sparkle sprites. Only real sources light a still. The skyline
    // boxes below stay (unlit backdrop geometry, not a source). _photoFacadeLights / _photoRoofSpot* / _photoSparkles stay
    // empty, so their per-press updaters are no-ops.
    // Distant skyline silhouette (full ring — robust to any orbit angle, per user's own
    // "different angle later" expectation) + sparkled window-lights, dusk-city look.
    // §PHOTO_SKYLINE_DENSER (user ask, "we need more building silhouette" — the original radius
    // (envelope*4) put these so far out they subtended almost no visible angle from a normal
    // camera position, reading as tiny specks. Pulled closer + bigger + more of them.
    var envelope = Math.max(w, d, 50);
    var radius = envelope * FXS.PHOTO_SKYLINE_RADIUS_MULT;
    var group = new THREE.Group();
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
      // ### ALTS-ALL FIX 17: the skyline joins the §PHOTO_VARIATION owner (one seed drives every randomized presentation touch) —
      // was Math.random, re-rolled outside the seed on every press (the backdrop behind Terminal glass changed press to press)
      var _sk = (A._photoPaintSeed || 0) * 1000 + i * 3.1;
      var bw = 18 + FXS._seededRand(_sk + 0.11) * 32, bh = 20 + FXS._seededRand(_sk + 0.23) * 60;
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
      var shade = 0.06 + FXS._seededRand(_sk + 0.37) * 0.07;
      var box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(
          shade * 0.9 + warmBoost * 1.3, shade * 0.85 + warmBoost * 0.9, shade * 1.15 + warmBoost * 0.5
        ) }));
      box.position.set(base.x, base.y + bh / 2, base.z);
      group.add(box);
    }
    A.scene.add(group);
    FXS._photoSkyline = group;
    console.log('§PHOTO_PROPS built skylineBoxes=' + group.children.length + ' (no staging lights: §NO_PHOTO_PROPS)');

  }
  // §PHOTO_FACING: recomputed FRESH every call from A.camera's CURRENT position/orientation —
  // deliberately NOT cached alongside the building-level fixture cache above. This is the exact
  // bug already found+fixed once this session for the removed edge-lining (a second Alt+S from a
  // different angle silently reused the first angle's facing) — don't reintroduce it here by
  // caching this result anywhere.
  function _updateFacadeFacingLights() {
    var facings = FXS._photoFacadeLights.map(function(f) {
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
    FXS._photoFacadeLights.forEach(function(f, i) {
      var facingFrac = Math.max(0, Math.min(1, facings[i]));  // 0 (away/edge-on) .. 1 (directly facing)
      var strength = FXS.PHOTO_FACADE_DIM_FRACTION + (1 - FXS.PHOTO_FACADE_DIM_FRACTION) * facingFrac;
      if (i === backIdx) strength *= FXS.PHOTO_BACK_ACCENT_BOOST;  // ground-based spotlight, back portion
      f.up.intensity = FXS.PHOTO_FACADE_UP_BASE * strength;
      f.down.intensity = FXS.PHOTO_FACADE_DOWN_BASE * strength;
      // A facade whose OUTWARD normal points toward the sun is the one the sun actually reaches.
      // The OFF branch must REPAINT warm, not merely skip: the lights keep whatever colour the last
      // recompute left on them, so a kill-switch that only stops assigning freezes the split in
      // place instead of undoing it. Found by W-FACADE-WARM-COOL gate 6 — the control gate existed
      // precisely to catch a switch that does not switch.
      var warm = true, toSun = null;
      if (_sunAz) { toSun = f.normalThree.x * _sunAz.x + f.normalThree.z * _sunAz.z; warm = toSun > 0; }
      f.up.color.setHex(warm ? FXS.PHOTO_FACADE_WARM_UP : FXS.PHOTO_FACADE_COOL_UP);
      f.down.color.setHex(warm ? FXS.PHOTO_FACADE_WARM_DOWN : FXS.PHOTO_FACADE_COOL_DOWN);
      f.warm = warm; f.toSun = toSun;
      if (warm) _warmN++; else _coolN++;
    });
    if (_sunAz) console.log('§FACADE_WARM_COOL sunAz=' + _sunAz.x.toFixed(3) + ',' + _sunAz.z.toFixed(3) +
      ' warm=' + _warmN + ' cool=' + _coolN + ' dots=' +
      FXS._photoFacadeLights.map(function(f) { return (f.toSun === undefined ? 'n/a' : f.toSun.toFixed(2)); }).join(','));
    // Recomputed fresh here alongside the facade wash, same discipline (never cached across triggers).
    if (FXS._photoRoofSpotA && FXS._photoRoofCorners.length === 4 && facings.length === 4) {
      var c1 = FXS._photoRoofCorners[backIdx], c2 = FXS._photoRoofCorners[(backIdx + 1) % 4];
      FXS._photoRoofSpotA.position.set(c1.x, c1.y + 0.5, c1.z);
      FXS._photoRoofSpotB.position.set(c1.x + (c2.x - c1.x) * 0.15, c1.y + 0.4, c1.z + (c2.z - c1.z) * 0.15);
    }
    console.log('§PHOTO_FACING facades=' + FXS._photoFacadeLights.length + ' strengths=' +
      FXS._photoFacadeLights.map(function(f) { return (f.up.intensity / FXS.PHOTO_FACADE_UP_BASE).toFixed(2); }).join(','));
  }
  // §PHOTO_STAFFAGE: load a cutout texture (cached, sRGB), size the sprite from the real image
  // aspect once the pixels are known (no hardcoded widths), anchor its bottom to the ground.
  function _staffageTex(path) {
    if (FXS._staffageTexCache[path]) return FXS._staffageTexCache[path];
    // §STAFFAGE_TEX_CAP — see the cap's comment at its declaration. Dormant at roster scale
    // (12 keys < 24): fires only if the key space ever becomes dynamic.
    var _tcKeys = Object.keys(FXS._staffageTexCache);
    if (_tcKeys.length >= FXS._STAFFAGE_TEX_CAP) {
      var _evict = FXS._staffageTexCache[_tcKeys[0]];
      if (_evict && typeof _evict.dispose === 'function') { try { _evict.dispose(); } catch (e) {} }
      delete FXS._staffageTexCache[_tcKeys[0]];
      console.log('§STAFFAGE_TEX_EVICT ' + _tcKeys[0] + ' cap=' + FXS._STAFFAGE_TEX_CAP);
    }
    var tex = new THREE.TextureLoader().load(FXS._STAFFAGE_BASE + path,
      function() { console.log('§STAFFAGE_TEX_READY ' + path); },
      undefined,
      function() { console.warn('§STAFFAGE_TEX_FAIL ' + path); });
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
    FXS._staffageTexCache[path] = tex;
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
    else if (FXS._staffageGroundY != null) spr.position.y = FXS._staffageGroundY - _padY;
    function _size() {
      var img = tex.image;
      var aspect = (img && img.width && img.height) ? (img.width / img.height) : 0.5;
      spr.scale.set(entry.h * aspect, entry.h, 1);
    }
    var im = tex.image;
    if (im && im.complete && im.naturalWidth) _size();
    else if (im) im.addEventListener('load', _size, { once: true });
    else spr.scale.set(entry.h * 0.5, entry.h, 1);   // provisional until the image arrives
    FXS._photoStaffage.add(spr);
    if (isPerson) FXS._photoStaffagePeople.push(spr);
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
        !(o.parent && FXS._photoStaffage && o.parent === FXS._photoStaffage) &&
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
    FXS._staffageGroundY = (A.ground && typeof A.ground.position.y === 'number') ? A.ground.position.y : A.ifc2three(0, 0, groundZ).y;
    if (!FXS._photoStaffage) FXS._photoStaffage = new THREE.Group();
    A._photoStaffageGroup = FXS._photoStaffage;   // §STAFFAGE_CLEARANCE witness hook (read-only handle)
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
        var lift = slabY - FXS._staffageGroundY;
        if (lift > _FLOOR_PHANTOM_MIN_LIFT && typeof _solids !== 'undefined' && _solids && _solids.length) {
          var p3 = A.ifc2three(x, y, best);
          _clrRay.set(new THREE.Vector3(p3.x, slabY + 1.0, p3.z), new THREE.Vector3(0, -1, 0));
          _clrRay.far = 1.0 + _FLOOR_PHANTOM_TOL;
          var hits = _clrRay.intersectObjects(_solids, false);
          if (!hits.length) {
            _floorPhantom++;
            console.log('§STAFFAGE_FLOOR_PHANTOM bbox slab at y=' + slabY.toFixed(2) + ' (lift=' +
              lift.toFixed(2) + 'm) has NO real geometry beneath — falling back to groundY=' +
              FXS._staffageGroundY.toFixed(2));
            _floorGround++; return FXS._staffageGroundY;
          }
        }
        _floorSlab++; return slabY;
      }
      _floorGround++; return FXS._staffageGroundY;
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
    FXS._realPeopleExist = realPeople > 0;
    // §STAFFAGE_REAL_DEDUP spec S1: collect real entourage POSITIONS (same name patterns as the
    // counts above, joined to transforms) — the spatial replacement for the removed realX===0 gates.
    FXS._realDedup = []; FXS._rejReal = 0;
    function _collectReal(where, radius) {
      var rows = A.dbQuery("SELECT et.center_x, et.center_y, et.center_z FROM element_transforms et JOIN elements_meta em ON et.guid=em.guid WHERE et.center_x IS NOT NULL AND " + where) || [];
      for (var ri = 0; ri < rows.length; ri++) {
        // ifc2three returns a plain {x,y,z} — wrap in a real Vector3 so distanceTo works.
        var rp = A.ifc2three(rows[ri][0], rows[ri][1], rows[ri][2]);
        FXS._realDedup.push([new THREE.Vector3(rp.x, rp.y, rp.z), radius]);
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
        o.userData.staffageKind === undefined && !(o.parent && o.parent === FXS._photoStaffage);
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
      for (var ci = 0; ci < FXS._photoStaffage.children.length; ci++) {
        if (FXS._photoStaffage.children[ci].position.distanceTo(threePos) < minDist) return true;
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
          if (_nearExisting(pos3, clashR) || FXS._nearRealEntourage(pos3)) continue;
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
      var outsidePoses = _shuffle(FXS._STAFFAGE_PEOPLE.filter(function(p) { return p.role !== 'sit'; }).slice());
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
        if (FXS._nearRealEntourage(pos3)) continue;
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
          if (!_inFrame(wpos3) || _nearExisting(wpos3, 3) || FXS._nearRealEntourage(wpos3)) continue;
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
        if (!_inFrame(tpos) || _nearExisting(tpos, 4) || FXS._nearRealEntourage(tpos)) continue;
        if (!_spaceOK(_solids, 'tree', tpos)) { _treeCeilRejected++; continue; }
        _placeAt(FXS._STAFFAGE_TREES[Math.floor(Math.random() * FXS._STAFFAGE_TREES.length)], tx, ty, groundZ, false);
        placedT++; thisPressTrees++;
      }
      if (!thisPressTrees) {
        // §STAFFAGE_ZERO_RESCUE spec S2 — the press must not end with 0 trees.
        _zeroRescue('tree', 4, function(ix, iy) {
          _placeAt(FXS._STAFFAGE_TREES[Math.floor(Math.random() * FXS._STAFFAGE_TREES.length)], ix, iy, groundZ, false);
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
        FXS._loadCarGeometry().then(function(geo) {
          if (!geo || !FXS._photoStaffage) return;
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
          var carIdx = (FXS._photoStaffage.userData.counts && FXS._photoStaffage.userData.counts.cars) || 0;
          var mat = new THREE.MeshStandardMaterial({ color: FXS._carColorFor(A.activeBuilding, carIdx), roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide });
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
          FXS._photoStaffage.add(mesh);
          placedC++;
          var _cCounts = FXS._photoStaffage.userData.counts || { people: 0, trees: 0, cars: 0 };
          FXS._photoStaffage.userData.counts = { people: _cCounts.people, trees: _cCounts.trees, cars: _cCounts.cars + 1 };
          console.log('§STAFFAGE_CAR_MESH placed at ifc=(' + cx2.toFixed(1) + ',' + cy2.toFixed(1) + ',' + cz2.toFixed(1) + ') angle=' + angle.toFixed(2));
          // §STAFFAGE_CAR_MESH_GROUND witness (user: "car still a bit afloat") — read these numbers
          // before touching the grounding math: if slabY equals groundY the fallback (no slab found
          // under the car) is what's driving it; if bboxMinY isn't the true lowest local vertex the
          // lift math itself is wrong; if both check out, the "float" is a rendering/shadow-contact
          // read, not a position bug.
          console.log('§STAFFAGE_CAR_MESH_GROUND slabY=' + _carSlabY.toFixed(3) + ' groundY=' + FXS._staffageGroundY.toFixed(3) + ' carLift=' + carLift.toFixed(3) + ' bboxMinY=' + (geo.boundingBox ? geo.boundingBox.min.y.toFixed(3) : 'n/a') + ' bboxMaxY=' + (geo.boundingBox ? geo.boundingBox.max.y.toFixed(3) : 'n/a') + ' finalPosY=' + pos.y.toFixed(3));
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
        if (!_inFrame(carPos3) || _nearExisting(carPos3, 6) || FXS._nearRealEntourage(carPos3)) continue;
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
          if (!_inFrame(wCarPos3) || _nearExisting(wCarPos3, 6) || FXS._nearRealEntourage(wCarPos3)) continue;
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
    if (FXS._photoStaffage.parent !== A.scene) A.scene.add(FXS._photoStaffage);
    // Additive across presses: this call's placedP/placedT are THIS-PRESS-ONLY (see PAX_CAP/TREE_CAP
    // above) — merge onto whatever cumulative total is already on the group from earlier presses.
    var _prevC = FXS._photoStaffage.userData.counts || { people: 0, trees: 0, cars: 0 };
    FXS._photoStaffage.userData.counts = { people: _prevC.people + placedP, trees: _prevC.trees + placedT, cars: _prevC.cars };
    // §-witness the feet-on-ground invariant IN the log (readable from any real session's console,
    // no browser needed): every sprite's feet Y minus the rendered ground Y — must be 0,0.
    var _fMin = Infinity, _fMax = -Infinity;
    FXS._photoStaffage.children.forEach(function(s) { var dy = (s.position.y + (s.userData.baseOffset || 0)) - FXS._staffageGroundY; if (dy < _fMin) _fMin = dy; if (dy > _fMax) _fMax = dy; });
    if (!FXS._photoStaffage.children.length) { _fMin = 0; _fMax = 0; }
    console.log('§PHOTO_STAFFAGE thisPress(people=' + placedP + ' trees=' + placedT + ') cumulative(people=' + FXS._photoStaffage.userData.counts.people + ' trees=' + FXS._photoStaffage.userData.counts.trees + ' cars=' + FXS._photoStaffage.userData.counts.cars + ') pSrc=' + pSrc + ' floor=slab:' + _floorSlab + '/ground:' + _floorGround + '/phantom:' + _floorPhantom + ' feetVsGroundY=[' + _fMin.toFixed(2) + ',' + _fMax.toFixed(2) + '] groundY=' + FXS._staffageGroundY.toFixed(2) + ' slabs=' + _slabs.length + ' build_ms=' + (performance.now() - _bt0).toFixed(0) + ' (realPeople=' + realPeople + ' realTrees=' + realTrees + ' realCars=' + realCars + ')');
    // §STAFFAGE_REAL_DEDUP witness (spec S1): how many real entourage positions guarded, how many
    // synthetic candidates they rejected this press.
    console.log('§STAFFAGE_REAL_DEDUP n=' + FXS._realDedup.length + ' rejReal=' + FXS._rejReal);
    _clrSummary('src=exterior solids=' + _solids.length);   // §STAFFAGE_CLEARANCE
  }
  // §PHOTO_STAFFAGE_STATUS (user: "why don't you give a wait-loading status?"): the cutout PNGs
  // load async (~seconds first time), so Alt+P looked like nothing happened. Drive the bottom
  // status bar with a live count — "⏳ Populating… N/M" as textures decode, "✓ Scene populated —
  // P people, T trees" when done. Cached on later toggles → jumps straight to done. No polling:
  // hooks each unique texture's image 'load' event; the sprite also pops in the frame as it loads.
  function _trackStaffageLoading() {
    if (!A.status || !FXS._photoStaffage) { A._populateBusy = false; return; }
    var c = FXS._photoStaffage.userData.counts || { people: 0, trees: 0, cars: 0 };
    var doneMsg = '✓ Scene populated — ' + c.people + ' people, ' + c.trees + ' trees, ' + (c.cars || 0) + ' cars';
    var seen = [], texs = [];
    FXS._photoStaffage.children.forEach(function(s) {
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
    if (FXS._photoStaffage) {
      A.scene.remove(FXS._photoStaffage);
      FXS._photoStaffage.children.forEach(function(s) { if (s.material) s.material.dispose(); });
    }
    FXS._photoStaffage = null; FXS._photoStaffagePeople = []; FXS._photoStaffageInFrame = []; _lastPeopleVis = null;
  }
  // §STAFFAGE_PERSIST (2026-07-18, user: "only when save that last scene is stored in DB. If not,
  // discarded"): staffage lives purely in the THREE.js scene graph — nothing auto-persists. Save
  // (scene.js A._exportBuildingDb) calls this right before export to capture whatever's currently
  // placed as plain rows (no THREE/DOM objects crossing the module boundary).
  A._getStaffageInstances = function() {
    if (!FXS._photoStaffage) return [];
    var rows = [];
    FXS._photoStaffage.children.forEach(function(c) {
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
    FXS._photoStaffage = new THREE.Group();
    // §STAFFAGE_CAR_COLOR: car ordinal claimed SYNCHRONOUSLY in row order (the async geometry load
    // below resolves in any order, but the ordinal is captured before it starts) — save row order is
    // preserved, so car #n gets the same palette slot it had when saved. Deterministic round-trip.
    var _restCarIdx = 0;
    rows.forEach(function(r) {
      var kind = r[0], file = r[1], ifcX = r[2], ifcY = r[3], ifcZ = r[4], rotY = r[5];
      var pos = A.ifc2three(ifcX, ifcY, ifcZ);
      if (kind === 'car') {
        var carIdx = _restCarIdx++;
        FXS._loadCarGeometry().then(function(geo) {
          if (!geo || !FXS._photoStaffage) return;
          var mat = new THREE.MeshStandardMaterial({ color: FXS._carColorFor(A.activeBuilding, carIdx), roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide });
          if (A._envMap) { mat.envMap = A._envMap; mat.envMapIntensity = 0.6; }
          if (A._matCache) A._matCache['staffage-car-beetle-' + carIdx] = mat;
          console.log('§STAFFAGE_CAR_COLOR idx=' + carIdx + ' rgb=#' + mat.color.getHexString() + ' src=restore');
          var mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(pos); mesh.rotation.y = rotY;
          mesh.castShadow = true; mesh.receiveShadow = true;
          mesh.userData.staffageKind = 'car';
          FXS._photoStaffage.add(mesh);
          if (A.markDirty) A.markDirty();
        });
        return;
      }
      var pool = kind === 'tree' ? FXS._STAFFAGE_TREES : FXS._STAFFAGE_PEOPLE, entry = null;
      for (var i = 0; i < pool.length; i++) { if (pool[i].file === file) { entry = pool[i]; break; } }
      if (!entry) return;
      _addStaffageSprite(entry, pos, kind === 'people', true);
    });
    FXS._photoStaffage.userData.counts = {
      people: rows.filter(function(r) { return r[0] === 'people'; }).length,
      trees: rows.filter(function(r) { return r[0] === 'tree'; }).length,
      cars: rows.filter(function(r) { return r[0] === 'car'; }).length
    };
    A.scene.add(FXS._photoStaffage);
    FXS._photoStaffage.visible = true;
    console.log('§STAFFAGE_RESTORE rows=' + rows.length);
  };
  // §PHOTO_STAFFAGE: people are spherical billboards — from a steep top-down angle they read as
  // upright figures floating detached from the ground (the aerial-angle failure the spec names).
  // Hide people (only) when the camera looks steeper than ~37deg down; trees tolerate it. Now that
  // Populate is a persistent Alt+P toggle (not frozen to one Alt+S camera), this re-runs on every
  // controls 'change' — so it logs only when the decision FLIPS, not every frame.
  var _lastPeopleVis = null;
  function _updatePeoplePitchGate() {
    if (!FXS._photoStaffagePeople.length || !A.camera) return;
    var fwd = new THREE.Vector3();
    A.camera.getWorldDirection(fwd);
    var down = -fwd.y;                       // 0 = horizontal, 1 = straight down
    var showP = down < 0.72;                 // ~46deg — show at normal establishing angles, hide only
                                             // near top-down where cutout people foreshorten/float
    if (showP === _lastPeopleVis) return;
    FXS._photoStaffagePeople.forEach(function(s) { s.visible = showP; });
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
    if (!A.dbQuery || !A.camera || !THREE.Sprite || !FXS._photoStaffage) return;
    // §STAFFAGE_REAL_DEDUP spec S1: was a wholesale `if (_realPeopleExist) return;` skip — removed
    // (user: "always room"); real-people overlap is now rejected per-candidate below, same as the
    // exterior pass. §RPC_M_PREFIX's no-double-population intent survives spatially.
    if (FXS._realPeopleExist) console.log('§PHOTO_STAFFAGE_INTERIOR realPeopleExist=1 (spatial dedup, no wholesale skip)');
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
      for (var ci = 0; ci < FXS._photoStaffage.children.length; ci++) {
        if (FXS._photoStaffage.children[ci].position.distanceTo(threePos) < minDist) return true;
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
        if (dist < 16 && !_nearExistingIF(p, 1.5) && !FXS._nearRealEntourage(p)) cand.push([f[0], f[1], f[2], f[3], dist]);
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
      return best !== null ? A.ifc2three(x, y, best).y : FXS._staffageGroundY;
    }
    var sitPoses = FXS._STAFFAGE_PEOPLE.filter(function(p) { return p.role === 'sit'; });
    // §STAFFAGE_FACING indoors: the interior circulation pool is normally all 'away'-facing (walks
    // toward whatever's beyond her — reads fine anywhere). Widen it with the one 'toward'-facing
    // pose (the standing casual male — "guy facing cam") so an interior shot can ALSO show someone
    // facing the viewer, same facing-metric already used for the exterior threshold. He lands on
    // whichever occupancy-grid-clear spot the round-robin picks — "where opportunity" — same
    // walk-clear verification as every other candidate, nothing indoors gets less safe.
    var walkPoses = FXS._STAFFAGE_PEOPLE.filter(function(p) { return p.role === 'walk' || (p.role === 'stand' && p.facing === 'toward'); });
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
      FXS._photoStaffageInFrame.push(spr); placedSit++;
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
        if (FXS._photoStaffage && (o === FXS._photoStaffage || o.parent === FXS._photoStaffage)) continue;
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
      FXS._photoStaffageInFrame.push(sfSpr); placedSitFallback++;
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
      spr2.userData.interior = true; FXS._photoStaffageInFrame.push(spr2); placedWalk++;
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
    var freshBuilding = !FXS._photoStaffage || _populateBuilding !== A.activeBuilding;
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
    if (FXS._photoStaffage) FXS._photoStaffage.visible = true;
    _updateInFrameInterior();             // additive — sit/walk figures visible in the current frame
    _lastPeopleVis = null;                // force a fresh pitch decision (+ log) on show
    _updatePeoplePitchGate();
    _trackStaffageLoading();              // live "⏳ N/M → ✓ populated" status while cutouts decode
    if (!A._populatePitchHooked && A.controls && A.controls.addEventListener) {
      A.controls.addEventListener('change', function() {
        if (_populateOn && FXS._photoStaffage && FXS._photoStaffage.visible) _updatePeoplePitchGate();
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
        FXS._STAFFAGE_PEOPLE.concat(FXS._STAFFAGE_TREES).forEach(function(e) { _staffageTex(e.file); });
        FXS._loadCarGeometry();
        console.log('§PHOTO_STAFFAGE_PRELOAD warming ' + (FXS._STAFFAGE_PEOPLE.length + FXS._STAFFAGE_TREES.length) + ' cutouts + car mesh');
      } catch (e) { /* THREE not ready / offline — first Alt+P will load them then */ }
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 6000 });
    else setTimeout(run, 4000);
  })();
  // ══ §PHOTO_PREWARM (§R11, bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md) ══════════════════════
  // User, 2026-09-01, on a real v1111 Hospital session: "it seems slow to come on first time."
  //
  // MEASURED from that session's own log — the FIRST Alt+S costs ~27 s and every one after it ~7 s:
  //   §MEP_SMOOTH_NORMALS ms=8923.6   (once per session, 23,735,190 verts over 1,705 geoms)
  //   §STILL_REFINE done elapsedMs=17933 first vs 6868 second
  //   §PHOTO_AO done totalMs=576      (not worth touching — 2% of the press)
  // The 20 s gap is ALL one-time work that happened to be sitting on the press. Two causes:
  //   1. the smoothing pass itself, 8.9 s;
  //   2. assets arriving DURING the fold — the run logged §STILL_REFINE_RESTART TWICE, with
  //      §LAYER2_HDRI_READY and §GROUND_MAP key=earth landing in between, and every restart throws
  //      away the samples accumulated so far.
  //
  // So this is a SCHEDULING change, not a behaviour change: the same work, done at idle once the
  // model is fully streamed (streaming.js calls this from the point its own comment already calls
  // "the model is fully streamed here"). The staging path KEEPS its own call as a fallback — if
  // prewarm has not run yet, the first Alt+S still does the work itself. DEGRADE, DON'T DISABLE.
  //
  // Idle, not eager: requestIdleCallback with a timeout, the same idiom §PHOTO_STAFFAGE_PRELOAD
  // above already uses, so a user who never presses Alt+S pays nothing on the interactive path.
  A._photoPrewarm = function () {
    if (A._photoPrewarmDone) return false;   // idempotent — streaming can flush more than once
    A._photoPrewarmDone = true;
    var run = function () {
      var t0 = performance.now(), did = [], skipped = [];
      try {
        if (!A._mepSmoothDone && A.mepSmoothNormals) {
          A.mepSmoothNormals(); A._mepSmoothDone = true; did.push('mepSmooth');
        } else skipped.push('mepSmooth(already done)');
      } catch (e) { skipped.push('mepSmooth:' + e.message); }
      // Both of these are cached+idempotent, and both were landing mid-fold and restarting it.
      try { FXS._ensureHdriEnvMap(); did.push('hdri'); } catch (e) { skipped.push('hdri:' + e.message); }
      try {
        // The ground texture is loaded by tools.js on staging; warming the HTTP cache here is the
        // whole cost of it and needs no handle into that module.
        if (typeof fetch === 'function') {
          fetch('textures/ground/earth_1k.jpg', { cache: 'force-cache' }).then(function (r) { return r && r.blob(); })
            .catch(function () {});
          did.push('groundTex');
        }
      } catch (e) { skipped.push('groundTex:' + e.message); }
      console.log('§PHOTO_PREWARM ms=' + Math.round(performance.now() - t0) +
        ' did=[' + did.join(',') + ']' + (skipped.length ? ' skipped=[' + skipped.join(',') + ']' : '') +
        ' — this work is now OFF the first Alt+S press (measured 8,923.6 ms of it on Hospital)');
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 8000 });
    else setTimeout(run, 2000);
    return true;
  };

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
  // with nothing — so it can never light or tint anything else.
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
  //     shared with nothing — the same invariant the artwork quad relies on.
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
  // §GLOW_BUILDUP_GATE (2026-08-07): the raw isVisible fn is cached for on-demand reads
  // (A._tmIsVisible — tools.js's §NIGHT_BUILDUP_GATE reads it) so a buildup bake can withhold a
  // fixture's light until TM has actually placed it, without re-deriving placed/frontier/recent.
  // §GLOW_LAYERS_OFF (2026-09-25): its only per-tick subscriber (the deleted glow-sprite restage)
  // is gone, and the subscriber fan-out with it.
  var _nameVisLast = null;
  var _lastTmIsVisible = null;   // latest predicate TM handed over; null when TM isn't driving the scene
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
    };
    // Read-only probe for the witness: what the overlay currently believes.
    A._billboardNameState = function() {
      return { guid: _billboardNameGuid, built: !!_billboardNameMesh,
        visible: _billboardNameMesh ? _billboardNameMesh.visible : null };
    };
  };

  function _showPhotoProps(show) {
    if (show && (!FXS._photoSkyline || FXS._photoPropsBuilding !== A.activeBuilding)) {   // §NO_PHOTO_PROPS: no uplights any more; key on the skyline
      _disposePhotoProps();
      _buildPhotoProps();
    }
    if (show) _updateFacadeFacingLights();
    if (show) A._buildBillboardArt();   // §BILLBOARD_ART — idempotent; also built outside staging, see §BILLBOARD_ALWAYS
    if (show) A._buildBillboardNamePlate();   // §BILLBOARD_BUILDING_NAME — idempotent re-assert, same as above
    FXS._photoUplights.forEach(function(l) { l.visible = show; });
    if (FXS._photoSkyline) FXS._photoSkyline.visible = show;
    if (FXS._photoSkylineLights) FXS._photoSkylineLights.visible = show;
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
  // §SUN_ARC_TOPOUT_SNAP REVERTED (2026-09-06, user: the linear 55°→6° crawl, including how it reads
  // through the pullout as it reaches dusk, was already correct and was never to be touched — bim-compiler
  // prompts/MEP_CLASH_REVEAL_MOVIE.md §SUN_ARC_TOPOUT_SNAP, REVERTED line). The sun's elevation is the
  // one linear formula of tNorm again, for every caller, no second argument. TOPOUT_SNAP_EASE_U stays:
  // it is the post-topout ease WINDOW that §PL_TOPOUT_UNPIN (_plTopoutWant, the fixtures) reuses; the
  // sun's own arc no longer reads it.
  var TOPOUT_SNAP_EASE_U = 0.08;   // fraction of the whole film a post-topout ease takes (fixtures only)
  // §ALTC_HIGHWAY sun (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_HIGHWAY, user 2026-10-05: "alt-c to give more
  // realistic daytime (perhaps late evening) with lamps on and hitting surface … special treatment for outdoor CW roads"):
  // a civil model's film runs late afternoon → dusk, 15° → the SAME tuned dusk end (6°), so every dusk-tuned constant still
  // lands where it was tuned. Presentation value. Buildings: A.isCivilModel() false → the 55° → 6° arc, unchanged.
  var CIVIL_SUN_ELEVATION_START = 15;
};
