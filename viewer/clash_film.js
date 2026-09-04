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
    var PEAK = 0.55;               // intensity at full — additive, so this is effectively its alpha
    var MARKER_MIN_M = 0.30, MARKER_MAX_M = 1.20;   // §CLASH_FILM_CONTACT_MARKER — the marker is the
                                   // clash, not the element; clamped so a deep penetration cannot
                                   // grow back into a building-sized box
    var RTREE_WAIT_MS = 120000;    // the clash R-tree is built lazily in-page; a bake must wait for it
    var COL_A = new THREE.Color(1.00, 0.13, 0.10);   // red  — the A-side element of the pair
    var COL_B = new THREE.Color(0.16, 0.44, 1.00);   // blue — the B-side element

    var _meshA = null, _meshB = null;
    var _pairs = [];        // one record per TRUE clash, in instance order
    var _fade = null;       // Float32Array, per PAIR: 0 = ambient (pulsing), 1 = selected (solid)
    var _built = false, _lastPulse = -1, _uploads = 0;

    A.clashFilm = A.clashFilm || {};

    function makeSide(n, colour) {
      var geo = new THREE.BoxGeometry(1, 1, 1);
      var mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending,
        depthTest: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide
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
        var seenPair = {}, allRows = [], broad = 0, discPairs = 0;
        rules.clash_rules.forEach(function (r) {
          var a = r.source && r.source.discipline, b = r.target && r.target.discipline;
          if (!a || !b) return;
          var k = a < b ? a + '|' + b : b + '|' + a;
          if (seenPair[k]) return;
          seenPair[k] = 1; discPairs++;
          var rows;
          // storey = null → the WHOLE building. A film is not a storey view.
          try { rows = A._queryClashesPairRtree(null, rules, a, b, 0, w) || []; }
          catch (e) { console.warn('§CLASH_FILM_BUILD pair=' + k + ' broad-phase failed: ' + e.message); return; }
          broad += rows.length;
          for (var i = 0; i < rows.length; i++) allRows.push(rows[i]);
        });
        if (!allRows.length) {
          console.log('§CLASH_FILM_BUILD discPairs=' + discPairs + ' pairsBroad=0 trueClash=0 VACUOUS — this building has no candidate clashes; nothing is judged');
          _built = true;
          return A.clashFilm.stats();
        }
        return A.clashNarrow.qualifyRows(allRows, { label: 'film' }).then(function (run) {
          var recs = (run && run.pairs) ? run.pairs.filter(function (p) { return p && p.verdict === 'CLASH'; }) : [];
          if (!recs.length) {
            console.log('§CLASH_FILM_BUILD discPairs=' + discPairs + ' pairsBroad=' + broad + ' trueClash=0 VACUOUS — every candidate is CLEAR at mesh level; nothing to draw');
            _built = true;
            return A.clashFilm.stats();
          }
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
          var m4 = new THREE.Matrix4(), sc = new THREE.Matrix4(), placed = 0, skipped = 0;
          var pA = new THREE.Vector3(), pB = new THREE.Vector3(), dir = new THREE.Vector3(), c = new THREE.Vector3();
          for (var i = 0; i < recs.length; i++) {
            var p = recs[i], ta = xf[p.guidA], tb = xf[p.guidB];
            if (!p.contact || !ta || !tb) {
              _meshA.setMatrixAt(i, sc.makeScale(0, 0, 0));
              _meshB.setMatrixAt(i, sc.makeScale(0, 0, 0));
              skipped++; continue;
            }
            A.clashNarrow.worldMatrix(ta, m4); pA.setFromMatrixPosition(m4);
            A.clashNarrow.worldMatrix(tb, m4); pB.setFromMatrixPosition(m4);
            dir.subVectors(pB, pA);
            if (dir.lengthSq() < 1e-9) dir.set(0, 1, 0); else dir.normalize();
            // Size from the PENETRATION (severityM), not the element and not extentM — extentM is
            // how FAR the intersection runs (79 m for a wall-on-foundation join) and would put us
            // straight back to lighting up the building.
            var sM = (typeof p.severityM === 'number' && p.severityM > 0) ? p.severityM : 0.2;
            var box = Math.max(MARKER_MIN_M, Math.min(sM * 2, MARKER_MAX_M));
            c.set(p.contact.x, p.contact.y, p.contact.z);
            sc.makeScale(box, box, box);
            m4.makeTranslation(c.x - dir.x * box * 0.55, c.y - dir.y * box * 0.55, c.z - dir.z * box * 0.55);
            _meshA.setMatrixAt(i, m4.multiply(sc));
            sc.makeScale(box, box, box);
            m4.makeTranslation(c.x + dir.x * box * 0.55, c.y + dir.y * box * 0.55, c.z + dir.z * box * 0.55);
            _meshB.setMatrixAt(i, m4.multiply(sc));
            placed++;
          }
          _meshA.instanceMatrix.needsUpdate = true; _meshB.instanceMatrix.needsUpdate = true;
          A.scene.add(_meshA); A.scene.add(_meshB);
          _built = true; _lastPulse = -1;
          A.clashFilm.update(0);                           // colours before the first render
          var ms = performance.now() - t0;
          console.log('§CLASH_FILM_BUILD discPairs=' + discPairs + ' pairsBroad=' + broad +
            ' trueClash=' + recs.length + ' markers=' + (recs.length * 2) + ' bothPlaced=' + placed +
            ' incomplete=' + skipped + ' falsePositivesExcluded=' + (broad - recs.length) +
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

    A.clashFilm.update = function (filmSeconds) {
      if (!_built || !_meshA || !_pairs.length) return null;
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
        lastPulse: _lastPulse, uploads: _uploads, periodS: PERIOD_S, peak: PEAK,
        riseS: RISE_S, holdS: HOLD_S, fallS: FALL_S, restS: REST_S,
        inScene: !!(_meshA && _meshA.parent) };
    };
    A.clashFilm.pairs = function () { return _pairs; };

    A.clashFilm.dispose = function () {
      [_meshA, _meshB].forEach(function (m) {
        if (!m) return;
        if (m.parent) m.parent.remove(m);
        m.geometry.dispose(); m.material.dispose();
      });
      _meshA = _meshB = null; _pairs = []; _fade = null; _built = false; _lastPulse = -1;
      console.log('§CLASH_FILM_DISPOSE markers released');
    };

    console.log('§CLASH_FILM_INIT wired (no allocation until build)');
  }
}
