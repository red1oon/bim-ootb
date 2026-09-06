// ══════════════════════════════════════════════════════════════════════════════════════════════
// §CLASH_FILM_P1 — clash pairs as PERSISTENT WORLD CONTENT in a baked film.
// Implementing bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §CLASH_FILM_P1 — Witness: W-CLASH-FILM
//
// USER (2026-09-04): "where they appear as is thruout the film whether cam pov do come across or not
// is incidental, but when do flying past one, it be impressive to see that red/blue pair" …
// "Those others can just be colored shine thrus pulsing slowly manner."
//
// PHASE 1 IS ITEMS 1-3 ONLY: the flag, the persistent pairs, the pulse. The near-and-facing
// selector, the labels and the leader lines are phase 2 and are NOT here. What phase 1 owes phase 2
// is the per-instance `fade` channel below — see §4b.
//
// ── WHY THE PAIR SET IS THE MESH-TRUE SET, NOT THE BROAD SET ────────────────────────────────────
// Measured on Terminal (bim-ootb #1676, §MESH_NARROWPHASE): broad=5961 → meshTrue=3951, so 33.7% of
// the bounding-box clash list is FALSE. A film is a permanent, shareable artefact: drawing the broad
// set would assert 2,010 clashes that do not exist. Every marker here comes from a record whose
// verdict is CLASH, and the witness asserts exactly that.
//
// ── THE MARKERS ARE A FORECAST, NOT A STATE READOUT (§3b) ───────────────────────────────────────
// USER: "the pulsing pairs will shine thru and off, even though the buildUp has not shown them on
// canvas, so user can note where the clashes are in general and can value its occurence prior".
// So the markers stand from frame 0, over empty ground, while the building rises around them.
// **Nothing in this file may consult A._tmIsVisible or any placement predicate.** That is the whole
// value — seeing where the trouble will be before it is built. A marker that appeared only once its
// elements were placed would say nothing the finished model does not already say.
//
// ── WHY BOXES, AND WHY THE STORED bbox ──────────────────────────────────────────────────────────
// One InstancedMesh of unit boxes per side — red round every A-side element, blue round every
// B-side — is the convention every coordination tool already uses, so it reads as a marker rather
// than pretending to be the element. Drawing the real meshes would need per-element geometry
// resident, which is exactly the memory §CLASH_MEM's `geomPinnedPeak=0` was careful not to hold.
// Placement comes from A.clashNarrow.worldMatrix over A.clashNarrow.loadTransforms — the SAME
// transform path the verdict was computed from — scaled by the STORED bbox_x/y/z. Stated plainly:
// the stored bbox is slightly looser than the real local mesh box (that difference is what rejects
// 10.7% of pairs at the OBB stage), so a marker is a touch larger than its element. That is correct
// for a marker and costs no geometry.
// ══════════════════════════════════════════════════════════════════════════════════════════════
function setupClashFilm(A) {
  'use strict';
  {
    var THREE = window.THREE;
    if (!THREE) return;

    // Pulse, in FILM seconds — never performance.now(), so a 15 fps and a 24 fps bake of the same
    // film pulse identically and a re-bake is reproducible (§4).
    // ══ §CLASH_FILM_PULSE_ENVELOPE (2026-09-05, user, after seeing the first clip) ═══════════════
    // USER: "The pulsing is not well done, the red box seen is not pulsing to fade off. It should
    // come on in 2 secs, hold for a sec, then pulse off for longer as it is just to mark the
    // territory out in the scene."
    // So it is NOT a sine — a sine spends its whole cycle mid-bright and never reads as "off". An
    // asymmetric envelope with a real rest phase does: rise, hold, a LONGER fall, then dark.
    var RISE_S = 2.0, HOLD_S = 1.0, FALL_S = 3.0, REST_S = 2.0;
    var PERIOD_S = RISE_S + HOLD_S + FALL_S + REST_S;   // 8.0 s
    // ══ §CLASH_FILM_SKY_WASH (2026-09-05, user: "IT seems to leak into outside sky etc that floor
    // slab turning light blue" … "is the sky bug fixed?") ═══════════════════════════════════════════
    // MEASURED by diffing a --clash clip against a --no-clash CONTROL of the same window (0.28:0.32,
    // 117 frames): one marker near the lens ballooned to 15.9 % of the frame, and the sky band (top
    // 180 rows) changed on up to 80,161 pixels — additive blending in front of EMPTY sky has nothing
    // to shine through, so the sky just gets brighter and bluer. Two causes, two fixes:
    //   1. the marker was WORLD-sized, so proximity scaled it without bound. Each marker is now
    //      CLAMPED to a constant small SCREEN size (MARKER_MAX_PX of frame height): its world box is
    //      min(severity box, the box that projects to that many pixels at this frame's distance),
    //      recomputed per frame from the camera (the same idea the 2D label uses for its panel).
    //      Far markers are untouched; a near one stops growing instead of filling the frame.
    //   2. PEAK 0.55 → 0.30, so whatever residual does land on sky is faint.
    var PEAK = 0.30;               // intensity at full — additive, so this is effectively its alpha
    var MARKER_MAX_PX = 0.06;      // the screen-size clamp, a fraction of frame HEIGHT (43 px at 720p)
    var MARKER_MIN_M = 0.30, MARKER_MAX_M = 1.20;   // §CLASH_FILM_CONTACT_MARKER — the marker is the
                                   // clash, not the element; clamped so a deep penetration cannot
                                   // grow back into a building-sized box
    var MARKER_FLOOR_M = 0.02;     // a marker AT the lens shrinks toward this, never to a degenerate matrix
    var RTREE_WAIT_MS = 120000;    // the clash R-tree is built lazily in-page; a bake must wait for it
    var COL_A = new THREE.Color(1.00, 0.13, 0.10);   // red  — the A-side element of the pair
    var COL_B = new THREE.Color(0.16, 0.44, 1.00);   // blue — the B-side element

    var _meshA = null, _meshB = null;
    var _pairs = [];        // one record per TRUE clash, in instance order
    var _fade = null;       // Float32Array, per PAIR: 0 = ambient (pulsing), 1 = selected (solid)
    var _built = false, _lastPulse = -1, _uploads = 0;
    // §CLASH_FILM_SKY_WASH — per PAIR: contact (×3), A→B axis (×3), the severity-sized box, the box
    // currently placed. The clamp rewrites a pair's two matrices only when its box actually changes.
    var _ctr = null, _dir = null, _nat = null, _cur = null, _updates = 0, _lastClamp = null;
    // §CLASH_MARKER_OVERLAP_BOX — per PAIR: A's rotation (×4, quaternion), the per-axis clamped extents of
    // the overlap solid in A's frame (×3), the split axis (0..2) and its sign (+1 = blue half on +axis).
    var _rot = null, _ext = null, _ax = null, _sg = null, _legacyBox = 0;
    var _broad = 0;         // §CLASH_HUD_CARD: the bbox-only candidate count the mesh stage judged (0 = nothing judged)
    var _meshTrue = 0, _flat = 0;   // §CLASH_FILM_FLAT_FILTER: the verdict count, and how many flat touches the film dropped
    var _camPos = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _sc = new THREE.Matrix4();
    var _q = new THREE.Quaternion(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _axW = new THREE.Vector3();

    A.clashFilm = A.clashFilm || {};

    // The ONE place a marker pair is placed (§CLASH_MARKER_OVERLAP_BOX, 2026-09-06, MEP_CLASH_REVEAL_MOVIE.md):
    // the ORIENTED BOX OF THE REAL OVERLAP SOLID — centre = overlapCenter, rotation = A's world rotation,
    // per-axis size = the clamped overlapA extents — split into two halves along the A-frame axis most
    // aligned with the A→B direction: red half on A's side, blue on B's (the §CLASH_FILM_CONTACT_MARKER
    // pair reading, kept). `box` is the target LARGEST extent; the whole box scales uniformly by
    // box/naturalM so the per-frame screen clamp (§CLASH_FILM_SKY_WASH) shrinks it toward its centre.
    function placePair(i, box) {
      var i3 = i * 3, i4 = i * 4, k = _ax[i], sg = _sg[i] || 1;
      var s = (_nat[i] > 0) ? box / _nat[i] : 0;
      var ex = _ext[i3] * s, ey = _ext[i3 + 1] * s, ez = _ext[i3 + 2] * s;
      _q.set(_rot[i4], _rot[i4 + 1], _rot[i4 + 2], _rot[i4 + 3]);
      _axW.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0).applyQuaternion(_q);
      var full = k === 0 ? ex : (k === 1 ? ey : ez), half = full / 2, off = full / 4;
      _s3.set(k === 0 ? half : ex, k === 1 ? half : ey, k === 2 ? half : ez);
      _p3.set(_ctr[i3] - _axW.x * off * sg, _ctr[i3 + 1] - _axW.y * off * sg, _ctr[i3 + 2] - _axW.z * off * sg);
      _meshA.setMatrixAt(i, _m4.compose(_p3, _q, _s3));
      _p3.set(_ctr[i3] + _axW.x * off * sg, _ctr[i3 + 1] + _axW.y * off * sg, _ctr[i3 + 2] + _axW.z * off * sg);
      _meshB.setMatrixAt(i, _m4.compose(_p3, _q, _s3));
      _cur[i] = box;
    }

    // ── §CLASH_FILM_SKY_WASH — the screen-size clamp, once per frame. A box of world size s at
    // distance d covers s / (2·d·tan(fov/2)) of the frame height, so the LARGEST box allowed at d is
    // MARKER_MAX_PX · 2 · d · tan(fov/2). camera defaults to the live one so the witness's
    // one-argument update(t) still works; the bake passes its own.
    function screenClamp(camera, viewH) {
      camera = camera || A.camera;
      var h = viewH || (A.renderer && A.renderer.domElement && A.renderer.domElement.height) || 720;
      if (!camera || !_nat) return null;
      camera.updateMatrixWorld(true);
      _camPos.setFromMatrixPosition(camera.matrixWorld);
      var perM = MARKER_MAX_PX * 2 * Math.tan((camera.fov || 60) * Math.PI / 360);
      var clamped = 0, moved = 0, nearest = Infinity, minBox = Infinity, maxBox = 0;
      for (var i = 0; i < _pairs.length; i++) {
        var nat = _nat[i]; if (!(nat > 0)) continue;
        var i3 = i * 3, ddx = _ctr[i3] - _camPos.x, ddy = _ctr[i3 + 1] - _camPos.y, ddz = _ctr[i3 + 2] - _camPos.z;
        var d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        if (d < nearest) nearest = d;
        var cap = Math.max(MARKER_FLOOR_M, d * perM);
        var box = nat < cap ? nat : cap;
        if (box < nat) clamped++;
        if (box < minBox) minBox = box;
        if (box > maxBox) maxBox = box;
        if (Math.abs(box - _cur[i]) > 1e-3) { placePair(i, box); moved++; }
      }
      if (moved) { _meshA.instanceMatrix.needsUpdate = true; _meshB.instanceMatrix.needsUpdate = true; }
      return { clamped: clamped, moved: moved, nearestM: nearest, minBoxM: minBox, maxBoxM: maxBox, capPx: Math.round(MARKER_MAX_PX * h), h: h };
    }

    // ══ §CLASH_FILM_SHINE_THROUGH (2026-09-05, §CLASH_FILM_P3 item 2) ═══════════════════════════
    // THE DEFECT: this material shipped with `depthTest: true` — normal z-testing, so a wall/slab
    // in front of a marker (closer to the camera, already in the depth buffer) correctly occludes
    // it. §CLASH_FILM_P1 was SUPPOSED to give clash markers the same shine-through treatment
    // `measure.js`'s own clash-overlap highlight already has, but the one line that actually does
    // that work — depthTest — was left at its MeshBasicMaterial default-looking `true` instead.
    // THE WORKING PRECEDENT (bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_CLASH_PIN item 2, "the
    // blue/red shine-through already exists — retain it exactly, do not reinvent"): the clash
    // overlap mesh built by `A._flyToClash` (`measure.js:717-720`) uses
    // `depthTest: false, depthWrite: false` with `renderOrder 998/999` for exactly this "shine
    // through walls when passing by" behaviour. Same combination applied here — depthTest false,
    // depthWrite already false, renderOrder already high (900, after ordinary opaque geometry) so
    // by the time this draws, the wall is already in the colour buffer and additive blending lands
    // on top of it rather than being z-rejected.
    // ONE material per side, shared by the WHOLE InstancedMesh — this fixes every pulsing pair in
    // one place, not per-pair (there is no per-pair material to miss one of).
    function makeSide(n, colour) {
      var geo = new THREE.BoxGeometry(1, 1, 1);
      var mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide
      });
      var mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;   // §3b — a forecast is not culled by where the camera happens to look
      mesh.renderOrder = 900;
      mesh.name = 'clashFilm:' + (colour === COL_A ? 'A' : 'B');
      mesh.userData.clashFilmSide = (colour === COL_A ? 'A' : 'B');
      return mesh;
    }

    // ── BUILD: once, at staging. Never per frame — the narrow phase costs ~2 s on Terminal and this
    // is static content; a film that rebuilt it per frame would pay that 4,699 times.
    A.clashFilm.build = function (opts) {
      opts = opts || {};
      if (_built) { console.log('§CLASH_FILM_BUILD already built pairs=' + _pairs.length + ' — no-op'); return Promise.resolve(A.clashFilm.stats()); }
      if (!A.clashNarrow || !A.clashNarrow.qualifyRows) {
        console.warn('§CLASH_FILM_BUILD INCONCLUSIVE reason=clash_narrow.js not loaded — nothing judged');
        return Promise.resolve(null);
      }
      var t0 = performance.now();
      // ── The R-tree is a PRECONDITION, and it is built lazily in the browser, not shipped in the DB.
      // MEASURED 2026-09-04 (the first witness run): without it every discipline pair returned
      // `§CLASH_QUERY_RTREE … hits=0` and the build reported VACUOUS — because
      // _queryClashesPairRtree's per-element `catch (e) { continue; }` turns a missing
      // `elements_rtree` into "no candidates" rather than an error. A bake never opens the clash
      // panel, so nothing else would have built it. Ensure it here and REFUSE with the real reason
      // rather than reporting an empty building.
      return new Promise(function (resolve) {
        if (A._clashRtreeReady) return resolve(true);
        if (A._ensureClashIndexes) { try { A._ensureClashIndexes(); } catch (e) {} }
        var waited = 0;
        var iv = setInterval(function () {
          if (A._clashRtreeReady) { clearInterval(iv); resolve(true); }
          else if ((waited += 250) >= RTREE_WAIT_MS) { clearInterval(iv); resolve(false); }
        }, 250);
      }).then(function (rtreeOk) {
        if (!rtreeOk) {
          console.warn('§CLASH_FILM_BUILD INCONCLUSIVE reason=elements_rtree not ready after ' + (RTREE_WAIT_MS / 1000) +
            's — the broad phase would silently return 0 candidates, which is NOT the same as a building with no clashes');
          return null;
        }
        return new Promise(function (resolve) { A._loadClashRules(function (rules) { resolve(rules); }); });
      }).then(function (rules) {
        if (rules === null) return null;
        if (!rules || !rules.clash_rules) { console.warn('§CLASH_FILM_BUILD INCONCLUSIVE reason=no clash rules'); return null; }
        var w = A._clashWhereParts ? A._clashWhereParts(rules) : null;
        var seenPair = {}, allRows = [], broad = 0, discPairs = 0, tolByPair = {};
        rules.clash_rules.forEach(function (r) {
          var a = r.source && r.source.discipline, b = r.target && r.target.discipline;
          if (!a || !b) return;
          var k = a < b ? a + '|' + b : b + '|' + a;
          if (seenPair[k]) return;
          seenPair[k] = 1; discPairs++;
          // §P2.4 (MEP_CLASH_REVEAL_MOVIE.md, 2026-09-06) — the rule's OWN tolerance in mm, kept per
          // discipline pair; stamped onto every mesh-true pair below for the label's 3rd row. Read
          // from clash_rules.json, never derived here.
          if (typeof r.tolerance_m === 'number') tolByPair[k] = Math.round(r.tolerance_m * 1000);
          var rows;
          // storey = null → the WHOLE building. A film is not a storey view.
          try { rows = A._queryClashesPairRtree(null, rules, a, b, 0, w) || []; }
          catch (e) { console.warn('§CLASH_FILM_BUILD pair=' + k + ' broad-phase failed: ' + e.message); return; }
          broad += rows.length;
          for (var i = 0; i < rows.length; i++) allRows.push(rows[i]);
        });
        _broad = broad;
        if (!allRows.length) {
          console.log('§CLASH_FILM_BUILD discPairs=' + discPairs + ' pairsBroad=0 trueClash=0 VACUOUS — this building has no candidate clashes; nothing is judged');
          _built = true;
          return A.clashFilm.stats();
        }
        return A.clashNarrow.qualifyRows(allRows, { label: 'film' }).then(function (run) {
          var recs = (run && run.pairs) ? run.pairs.filter(function (p) { return p && p.verdict === 'CLASH'; }) : [];
          // §CLASH_FILM_FLAT_FILTER (2026-09-06, Option 3 of §TOUCH_BY_THICKNESS): the FILM drops pairs whose
          // overlap solid is flat (thinnest extent < 1 mm — a touch the segment-length rule still calls
          // CLASH). The narrowphase verdict itself is untouched; this is the film's own set.
          _meshTrue = recs.length;
          recs = recs.filter(function (p) { return p.overlapFlat !== true; });
          _flat = _meshTrue - recs.length;
          if (!recs.length) {
            console.log('§CLASH_FILM_BUILD discPairs=' + discPairs + ' pairsBroad=' + broad + ' trueClash=0 VACUOUS — every candidate is CLEAR at mesh level; nothing to draw');
            _built = true;
            return A.clashFilm.stats();
          }
          // §P2.4 — stamp tolMm (from the rule that produced this discipline pair) onto the pair record;
          // severityM is already on it. The label reads both at draw time. A pair whose discipline pair
          // has no rule tolerance is left unstamped and counted, so the log shows the gap.
          var tolStamped = 0, depthMesh = 0, depthInexact = 0, overlapFlat = 0;
          recs.forEach(function (p) {
            var kk = p.discA < p.discB ? p.discA + '|' + p.discB : p.discB + '|' + p.discA;
            if (tolByPair[kk] != null) { p.tolMm = tolByPair[kk]; tolStamped++; }
            if (typeof p.depthMeshM === 'number') { depthMesh++; if (!p.overlapExact) depthInexact++; if (p.overlapFlat) overlapFlat++; }   // §MESH_OVERLAP_DEPTH
          });
          var guids = [];
          recs.forEach(function (p) { guids.push(p.guidA, p.guidB); });
          var xf = A.clashNarrow.loadTransforms(guids);   // §CLASH_FILM_CONTACT_MARKER: placement only — the element bbox is no longer used
          _pairs = recs;
          _fade = new Float32Array(recs.length);          // phase 1 ships all-ambient (§4b)
          _meshA = makeSide(recs.length, COL_A);
          _meshB = makeSide(recs.length, COL_B);
          // ══ §CLASH_FILM_CONTACT_MARKER (2026-09-05, user, after seeing the first clip) ═════════
          // USER: "The clip is not doing well: whole floor slab is marked as a Clash pair."
          // They were right, and the mesh test was not the problem — every top pair carried
          // `reason=MESH_TRIANGLES_INTERSECT` with real triangle counts. The MARKER was: phase 1
          // drew a box around the WHOLE ELEMENT, so an IfcSlab with bbox_x=98.9 m lit up the entire
          // floor, and an additive box that size washes everything behind it including the sky.
          // MEASURED: 131 of 271 pairs have an element over 15 m; extents run to 79.7 m
          // (an exterior wall meeting its foundation along its whole length).
          //
          // So the marker is now the CLASH, not the element: two small boxes straddling the contact
          // point along the A→B axis — red on A's side, blue on B's — sized from the penetration
          // depth, not the element. Same red/blue pair reading, at the place that is actually wrong.
          // ══ §CLASH_MARKER_OVERLAP_BOX (2026-09-06) — the marker is now the oriented box of the REAL
          // overlap solid (§MESH_OVERLAP_DEPTH's overlapCenter + overlapA, in A's frame, A's rotation from
          // the same worldMatrix the narrowphase used). Per-axis size clamped to [MARKER_MIN_M, MARKER_MAX_M]
          // — the cube's own 0.30/1.20 m rule, per axis: a 25 mm overlap is drawn 0.30 m thick so it is
          // visible; a 5 m through-run is capped at 1.20 m so the marker stays the clash, not the element.
          // A record without the overlap box (none on Hospital) keeps the old severity cube: legacyBox=N.
          var m4 = new THREE.Matrix4(), sc = new THREE.Matrix4(), placed = 0, skipped = 0;
          var pA = new THREE.Vector3(), pB = new THREE.Vector3(), dir = new THREE.Vector3();
          var qA = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), axw = new THREE.Vector3();
          _ctr = new Float32Array(recs.length * 3); _dir = new Float32Array(recs.length * 3);
          _nat = new Float32Array(recs.length); _cur = new Float32Array(recs.length);
          _rot = new Float32Array(recs.length * 4); _ext = new Float32Array(recs.length * 3);
          _ax = new Int8Array(recs.length); _sg = new Int8Array(recs.length); _legacyBox = 0;
          for (var i = 0; i < recs.length; i++) {
            var p = recs[i], ta = xf[p.guidA], tb = xf[p.guidB];
            if (!p.contact || !ta || !tb) {
              _meshA.setMatrixAt(i, sc.makeScale(0, 0, 0));
              _meshB.setMatrixAt(i, sc.makeScale(0, 0, 0));
              _nat[i] = 0; skipped++; continue;
            }
            A.clashNarrow.worldMatrix(ta, m4); pA.setFromMatrixPosition(m4); m4.decompose(tmpP, qA, tmpS);
            A.clashNarrow.worldMatrix(tb, m4); pB.setFromMatrixPosition(m4);
            dir.subVectors(pB, pA);
            if (dir.lengthSq() < 1e-9) dir.set(0, 1, 0); else dir.normalize();
            var hasBox = !!(p.overlapCenter && p.overlapA && p.overlapA.length === 3);
            var e0, e1, e2, c;
            if (hasBox) {
              e0 = Math.max(MARKER_MIN_M, Math.min(p.overlapA[0], MARKER_MAX_M));
              e1 = Math.max(MARKER_MIN_M, Math.min(p.overlapA[1], MARKER_MAX_M));
              e2 = Math.max(MARKER_MIN_M, Math.min(p.overlapA[2], MARKER_MAX_M));
              c = p.overlapCenter;
            } else {
              // legacy: the severity cube at the contact — sized from the PENETRATION (severityM), never the element
              var sM = (typeof p.severityM === 'number' && p.severityM > 0) ? p.severityM : 0.2;
              e0 = e1 = e2 = Math.max(MARKER_MIN_M, Math.min(sM * 2, MARKER_MAX_M));
              c = p.contact; _legacyBox++;
            }
            // split axis: the A-frame axis most aligned with A→B; sign so the blue half lands on B's side
            var bestK = 0, bestD = -1, bestSign = 1;
            for (var k = 0; k < 3; k++) {
              axw.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0).applyQuaternion(qA);
              var dd = axw.dot(dir);
              if (Math.abs(dd) > bestD) { bestD = Math.abs(dd); bestK = k; bestSign = dd < 0 ? -1 : 1; }
            }
            _ctr[i * 3] = c.x; _ctr[i * 3 + 1] = c.y; _ctr[i * 3 + 2] = c.z;
            _dir[i * 3] = dir.x; _dir[i * 3 + 1] = dir.y; _dir[i * 3 + 2] = dir.z;
            _rot[i * 4] = qA.x; _rot[i * 4 + 1] = qA.y; _rot[i * 4 + 2] = qA.z; _rot[i * 4 + 3] = qA.w;
            _ext[i * 3] = e0; _ext[i * 3 + 1] = e1; _ext[i * 3 + 2] = e2;
            _ax[i] = bestK; _sg[i] = bestSign;
            _nat[i] = Math.max(e0, e1, e2);               // the largest clamped extent — the clamp only ever shrinks it
            placePair(i, _nat[i]);
            placed++;
          }
          _meshA.instanceMatrix.needsUpdate = true; _meshB.instanceMatrix.needsUpdate = true;
          A.scene.add(_meshA); A.scene.add(_meshB);
          _built = true; _lastPulse = -1; _updates = 0;
          A.clashFilm.update(0);                           // colours (and the first clamp) before the first render
          var ms = performance.now() - t0;
          console.log('§CLASH_FILM_BUILD discPairs=' + discPairs + ' pairsBroad=' + broad +
            ' trueClash=' + recs.length + ' markers=' + (recs.length * 2) + ' bothPlaced=' + placed +
            ' incomplete=' + skipped + ' falsePositivesExcluded=' + (broad - _meshTrue) + ' flatExcluded=' + _flat + ' legacyBox=' + _legacyBox +
            ' tolStamped=' + tolStamped + '/' + recs.length + ' depthMesh=' + depthMesh + '/' + recs.length + ' depthInexact=' + depthInexact + ' overlapFlat=' + overlapFlat +
            ' ms=' + ms.toFixed(0) + ' (mesh-true set only — the broad set would assert clashes that do not exist)');
          return A.clashFilm.stats();
        });
      });
    };

    // ── UPDATE: one call per frame, driven by FILM seconds (§4).
    // colour = base × mix(pulse(t), 1.0, fade) — per INSTANCE, because a selected pair must hold
    // solid while every other pair keeps breathing (§4b). Phase 2 writes `fade`; nothing else changes.
    // The envelope, in FILM seconds. Returns 0..1. Piecewise and explicit so the shape is readable
    // and the witness can assert each phase rather than trusting a formula.
    function envelope(filmSeconds) {
      var t = (filmSeconds || 0) % PERIOD_S;
      if (t < RISE_S) return t / RISE_S;                                  // come on over 2 s
      t -= RISE_S;
      if (t < HOLD_S) return 1;                                           // hold for 1 s
      t -= HOLD_S;
      if (t < FALL_S) return 1 - (t / FALL_S);                            // fade off over 3 s
      return 0;                                                           // dark for 2 s
    }
    A.clashFilm.envelope = envelope;

    A.clashFilm.update = function (filmSeconds, camera, viewH) {
      if (!_built || !_meshA || !_pairs.length) return null;
      // §CLASH_FILM_SKY_WASH — geometry first (the clamp), then colour. Logged on the first update
      // and every 60th after, and always readable from stats().lastClamp.
      var cl = screenClamp(camera, viewH);
      _updates++;
      if (cl) {
        _lastClamp = cl;
        if (_updates === 1 || _updates % 60 === 0) {
          console.log('§CLASH_FILM_SCREEN_CLAMP update=' + _updates + ' clamped=' + cl.clamped + '/' + _pairs.length +
            ' moved=' + cl.moved + ' nearest=' + (isFinite(cl.nearestM) ? cl.nearestM.toFixed(2) : '-') + 'm box=[' +
            (isFinite(cl.minBoxM) ? cl.minBoxM.toFixed(3) : '-') + '..' + cl.maxBoxM.toFixed(3) + ']m capPx=' + cl.capPx + '@' + cl.h +
            ' peak=' + PEAK + ' (a marker never projects larger than capPx; the rest keep their severity box)');
        }
      }
      var pulse = PEAK * envelope(filmSeconds);
      var ca = _meshA.instanceColor.array, cb = _meshB.instanceColor.array, any = false;
      for (var i = 0; i < _pairs.length; i++) {
        var f = _fade[i], k = pulse + (1 - pulse) * f;     // f=0 → pulsing, f=1 → solid
        var ia = i * 3;
        if (ca[ia] !== COL_A.r * k) any = true;
        ca[ia] = COL_A.r * k; ca[ia + 1] = COL_A.g * k; ca[ia + 2] = COL_A.b * k;
        cb[ia] = COL_B.r * k; cb[ia + 1] = COL_B.g * k; cb[ia + 2] = COL_B.b * k;
      }
      if (any || _lastPulse < 0) {
        _meshA.instanceColor.needsUpdate = true; _meshB.instanceColor.needsUpdate = true; _uploads++;
      }
      _lastPulse = pulse;
      return pulse;
    };

    // Phase-2 hook, and the channel witness W5 exercises in phase 1 so it is proven before it is needed.
    A.clashFilm.setFade = function (index, value) {
      if (!_fade || index < 0 || index >= _fade.length) return false;
      _fade[index] = Math.max(0, Math.min(1, value));
      _lastPulse = -1;   // force the next update to upload
      return true;
    };

    A.clashFilm.stats = function () {
      return { built: _built, pairs: _pairs.length, markers: _pairs.length * 2,
        broad: _broad, meshTrue: _meshTrue, flat: _flat, falseExcluded: Math.max(0, _broad - _meshTrue),   // §CLASH_HUD_CARD / §CLASH_FILM_FLAT_FILTER
        legacyBox: _legacyBox,
        lastPulse: _lastPulse, uploads: _uploads, periodS: PERIOD_S, peak: PEAK,
        riseS: RISE_S, holdS: HOLD_S, fallS: FALL_S, restS: REST_S,
        markerMaxPx: MARKER_MAX_PX, updates: _updates, lastClamp: _lastClamp,
        inScene: !!(_meshA && _meshA.parent) };
    };
    A.clashFilm.pairs = function () { return _pairs; };

    // §CLASH_HUD_PAIR_CARDS (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md §PENDING.5 item B) — the mesh-true
    // pair set, grouped by discipline pair. Same normalize-order convention this file already uses at
    // line ~214/252 (a<b ? a+'|'+b : b+'|'+a) — restated locally rather than importing clash_narrow's
    // private (unexported) `pairIdOf`, so there is one formula, not two names for it. Pure groupby over
    // data qualifyRows already produced — no new judgment, no new geometry query. Cached because the
    // pair set is static per bake (same reason _pairs itself is built once).
    function _discPairKey(p) {
      var a = p.discA || '?', b = p.discB || '?';
      return a < b ? (a + '|' + b) : (b + '|' + a);
    }
    var _byDiscCache = null, _byDiscCacheLen = -1;
    A.clashFilm.statsByDiscPair = function () {
      if (!_built || !_pairs.length) { console.log('§CLASH_HUD_PAIR_CARDS pairs=0 VACUOUS — nothing built to group'); return []; }
      if (_byDiscCache && _byDiscCacheLen === _pairs.length) return _byDiscCache;
      var groups = {}, order = [], i, p, a, b, key;
      for (i = 0; i < _pairs.length; i++) {
        p = _pairs[i]; a = p.discA || '?'; b = p.discB || '?';
        key = a < b ? (a + '|' + b) : (b + '|' + a);
        if (!groups[key]) { groups[key] = { key: key, discA: (a < b ? a : b), discB: (a < b ? b : a), count: 0, indices: [] }; order.push(key); }
        groups[key].count++; groups[key].indices.push(i);
      }
      var out = order.map(function (k) { return groups[k]; }).sort(function (x, y) { return y.count - x.count; });
      console.log('§CLASH_HUD_PAIR_CARDS pairs=' + out.length + ' [' +
        out.map(function (g) { return g.key + '=' + g.count; }).join(' ') + ']');
      _byDiscCache = out; _byDiscCacheLen = _pairs.length;
      return out;
    };

    // §CLASH_HUD_PULLBACK_WINDOW / item C — highlight ONE discipline pair solid, fade the rest to
    // plain ambient pulsing. Pure reuse of the phase-2 per-instance fade channel this file's own
    // header already documents ("a selected pair must hold solid while every other pair keeps
    // breathing") — no second highlight mechanism. key=null clears back to all-ambient (every index 0).
    A.clashFilm.highlightDiscPair = function (key) {
      if (!_built || !_fade || !_pairs.length) return { changed: 0, groupSize: 0 };
      var changed = 0, groupSize = 0, i, want;
      for (i = 0; i < _pairs.length; i++) {
        want = (key != null && _discPairKey(_pairs[i]) === key) ? 1 : 0;
        if (want === 1) groupSize++;
        if (_fade[i] !== want) { A.clashFilm.setFade(i, want); changed++; }
      }
      return { changed: changed, groupSize: groupSize };
    };
    // The severity box of pair i and the box currently placed — what the clamp witness reads.
    A.clashFilm.boxOf = function (i) { return (_nat && i >= 0 && i < _nat.length) ? { naturalM: _nat[i], placedM: _cur[i] } : null; };
    // §CLASH_MARKER_OVERLAP_BOX — what the witness decomposes the instance matrices against
    A.clashFilm.centerOf = function (i) { return (_ctr && i >= 0 && i * 3 < _ctr.length) ? { x: _ctr[i * 3], y: _ctr[i * 3 + 1], z: _ctr[i * 3 + 2] } : null; };
    A.clashFilm.markerOf = function (i) {
      if (!_ext || i < 0 || i >= _nat.length) return null;
      return { ext: [_ext[i * 3], _ext[i * 3 + 1], _ext[i * 3 + 2]], axis: _ax[i], sign: _sg[i], naturalM: _nat[i], placedM: _cur[i], minM: MARKER_MIN_M, maxM: MARKER_MAX_M };
    };

    // IDEMPOTENT: cinema_maxq calls this on the normal exit AND in its outer finally (the THROW
    // path — update() mid-loop can throw), so the second call must be a silent no-op, not a second
    // "released" line that reads as a double release.
    A.clashFilm.dispose = function () {
      if (!_meshA && !_meshB && !_built) return false;
      [_meshA, _meshB].forEach(function (m) {
        if (!m) return;
        if (m.parent) m.parent.remove(m);
        m.geometry.dispose(); m.material.dispose();
      });
      _meshA = _meshB = null; _pairs = []; _fade = null; _built = false; _lastPulse = -1;
      _ctr = _dir = _nat = _cur = null; _rot = _ext = _ax = _sg = null; _legacyBox = 0; _meshTrue = 0; _flat = 0; _updates = 0; _lastClamp = null;
      _byDiscCache = null; _byDiscCacheLen = -1;   // §CLASH_HUD_PAIR_CARDS — a stale group set must not survive dispose
      console.log('§CLASH_FILM_DISPOSE markers released');
      return true;
    };

    console.log('§CLASH_FILM_INIT wired (no allocation until build)');
  }
}
