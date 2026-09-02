// arc_editable.js — §ARC-1 (RESUME_ARC_EDITABLE_SUBSTRATE.md): seed the REAL ARC building as gizmo-EDITABLE,
// guid-carrying signed GEOM_INSERT op-rows. This is the substrate the Phase-2 SDG forward-fold cascade rests on:
// before this, the modeller's editable scene was synthetic-only (user inserts/sketches) — real walls/doors existed
// only as walker DATA + overlay markers, so "drag wall → door rides" had no wall to grab.
//
// NON-INVENT: every element's box is its MEASURED bbox at its MEASURED centre (element_transforms); nothing is
// fabricated. The box lands its WORLD CENTRE exactly on center_xyz (place() ground-seat math, rotation-invariant).
// Each seed op carries output_guid = the real IFC guid → the featureId↔guid bridge (kernel_ops.output_guid,
// persisted + replay-stable) that the cascade slice uses to look up swXEdges neighbours by guid.
//
// Dual-export (window + node) like cross_edges.js, so the value witness (W-ARC-EDITABLE) runs pure-node.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./real_geometry.js'));
  else root.ArcEditable = factory(root.RealGeometry);
})(typeof window !== 'undefined' ? window : this, function (RealGeometry) {
  'use strict';
  var TAG = '§ARC';

  // ARC palette by ifc_class — COSMETIC ONLY (colour never touches geometry/position; non-invent geometry holds).
  var PALETTE = {
    IfcWall: 0xb9c4cf, IfcWallStandardCase: 0xb9c4cf, IfcSlab: 0x9aa6b0, IfcRoof: 0x8a94a0,
    IfcDoor: 0xc8a06a, IfcWindow: 0x7fb0c8, IfcCovering: 0xcdd6dd, IfcOpeningElement: 0xff8c42,
    IfcFurniture: 0xa9b8a0, IfcStair: 0x9aa6b0, IfcRailing: 0x9aa6b0, IfcColumn: 0x8f9aa6, IfcBeam: 0x8f9aa6
  };
  function colorFor(cls) { return PALETTE[cls] != null ? PALETTE[cls] : 0xb9c4cf; }

  // §MAT-PARITY (MODELLER_RENDER_MATERIAL_PARITY.md Task 1): elements_meta.material_rgba is the SAME real
  // per-element "r,g,b,a" string viewer/streaming.js reads (A._getMaterial(el.rgba, ...) at ~L739/865/963) —
  // the alpha channel is real IFC-authored transparency (e.g. Duplex's 22 IfcWindow rows carry alpha=0.100,
  // confirmed via sqlite3 on buildings/Duplex_extracted.db). Colour here stays the PALETTE (cosmetic, per
  // colorFor above, unchanged) — this ONLY recovers alpha, mirroring the Viewer's own opacity gate
  // (streaming.js: `if (parts.length >= 4 && parts[3] < 1.0) a = parts[3]`). Malformed/absent → undefined
  // (opaque, today's unchanged behaviour).
  function alphaFor(rgba) {
    if (!rgba || rgba.indexOf(',') < 0) return undefined;
    var parts = rgba.split(',').map(Number);
    return (parts.length >= 4 && parts[3] < 1.0) ? parts[3] : undefined;
  }

  // discipline='ARC' is the canonical filter (VISION-LOCK: ARC = sole edited substrate). When the discipline
  // column is absent/empty, fall back to an ARC-ish class set (LOGGED at the call site — measure-don't-whitelist
  // caveat: this is a discipline-recovery fallback, not a geometry whitelist).
  var ARC_CLASSES = ['IfcWall', 'IfcWallStandardCase', 'IfcDoor', 'IfcWindow', 'IfcSlab', 'IfcRoof',
    'IfcCovering', 'IfcColumn', 'IfcBeam', 'IfcStair', 'IfcRailing', 'IfcFurniture', 'IfcOpeningElement'];

  function _hasDiscipline(db) {
    try { var r = db.exec("SELECT COUNT(*) FROM elements_meta WHERE discipline='ARC'"); return !!(r.length && r[0].values[0][0] > 0); }
    catch (e) { return false; }
  }

  // §LOD400-STALL fix (Bug 1 root cause): some elements_meta schemas (e.g. Terminal_meta.db, built by a
  // different extraction path than *_extracted.db) have NO `id` column — guid is the sole PRIMARY KEY. The
  // seed query used to hardcode `ORDER BY m.id`, which THREW for that schema (sql.js "no such column: m.id"),
  // caught by the caller's .catch() → the WHOLE seed silently committed ZERO ops, forever (Terminal never
  // loaded any geometry, not "slowly" — not at all). Detect column presence at runtime (same PRAGMA pattern
  // as any schema probe) and order by `id` when present — UNCHANGED for Duplex/SampleCastle/SampleHouse (their
  // committed op order/ids stay byte-identical, replay-stable) — else fall back to `guid` (also a stable total
  // order; the featureId↔guid bridge below is guid-keyed, not order-dependent, so this fallback is non-invent).
  function _hasIdColumn(db) {
    try {
      var r = db.exec("PRAGMA table_info(elements_meta)");
      if (!r.length) return false;
      return r[0].values.some(function (v) { return v[1] === 'id'; });
    } catch (e) { return false; }
  }

  // §ANCHOR (RESUME_MODELLER_LOD400_REAL_GEOMETRY.md §START HERE OPEN 1, ✅ APPROVED — USER 2026-07-30 —
  // Witness: W-E2E-VOID-ANCHOR): does elements_meta carry the `is_anchor` column (void-consumed hosts
  // persisted by the extractor / the self-heal patch)? Runtime schema detection, same PRAGMA pattern as
  // _hasIdColumn above — every resident WITHOUT the column takes ZERO new code paths (hasAnchor=false ⇒
  // the seed query and loop are byte-identical to before this change).
  function _hasAnchorColumn(db) {
    try {
      var r = db.exec("PRAGMA table_info(elements_meta)");
      if (!r.length) return false;
      return r[0].values.some(function (v) { return v[1] === 'is_anchor'; });
    } catch (e) { return false; }
  }

  // §LAYER-GATE — the Modeller half of §LOD400-ENVELOPE-GATE (bim-compiler
  // RESUME_MODELLER_LOD400_REAL_GEOMETRY.md §LOD400-ENVELOPE, user directive 2026-07-29: "the NO
  // FALLBACK rule must never be broken.. simple throws exception and hard fail"). An element whose
  // source authored N material layers but whose resolved mesh is one undifferentiated envelope solid
  // is a FALLBACK presented as real geometry — it must be REFUSED (skip + console.error), never
  // rendered. Runtime schema detection, same pattern as _hasIdColumn/_hasAnchorColumn: the gate only
  // ARMS when the resident's ARC db actually carries `rel_material_layer_set` rows (shipped by the
  // patches/<db>.sql self-heal loader — Duplex today) — every other resident (incl. SampleCastle,
  // whose layer tables are deliberately NOT shipping while its `sporenkap` refusal stands) takes
  // ZERO new code paths. The per-layer geometry truth lives in the geo store's
  // `component_geometry_layers` index (rebuilt *_geo.db, scripts/gen_layered_geo_db.py).
  // §LAYER-SOLID-SEED (CUT_GATE_CSG_SPEC.md §THE CALL): gate.layerRanges carries the ACTUAL
  // (face_start,face_count) triangle range per layer, keyed by geometry_hash — this is what lets the
  // cut-seed path build one REAL OCCT solid per authored layer (buildTriFace+sewAndSolidify) instead of
  // an idealized box. Additive to the existing armed/multiLayer/layeredHashes fields above — every
  // pre-existing consumer of this gate (the envelope-refuse check) is untouched.
  function _layerGate(db, geoDb) {
    var gate = { armed: false, multiLayer: {}, layeredHashes: {}, layerRanges: {}, nMulti: 0, nHashes: 0 };
    try {
      if (!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rel_material_layer_set'").length) return gate;
      var r = db.exec("SELECT element_guid, layer_count, layer_set_name FROM rel_material_layer_set WHERE layer_count > 1");
      if (r.length) r[0].values.forEach(function (v) { gate.multiLayer[v[0]] = { n: v[1], set: v[2] }; gate.nMulti++; });
      if (geoDb.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='component_geometry_layers'").length) {
        var lr = geoDb.exec("SELECT DISTINCT geometry_hash FROM component_geometry_layers");
        if (lr.length) lr[0].values.forEach(function (v) { gate.layeredHashes[v[0]] = true; gate.nHashes++; });
        var lrr = geoDb.exec("SELECT geometry_hash, layer_seq, face_start, face_count FROM component_geometry_layers " +
          "WHERE face_count > 0 ORDER BY geometry_hash, layer_seq");
        if (lrr.length) lrr[0].values.forEach(function (v) {
          var hash = v[0], start = v[2], count = v[3];
          (gate.layerRanges[hash] || (gate.layerRanges[hash] = [])).push({ start: start, count: count });
        });
      }
      gate.armed = gate.nMulti > 0;
    } catch (e) {
      // a failed probe is an infra fault, not evidence about the geometry — stay disarmed but say so
      // LOUDLY (console.error, not warn: warn is hidden by DevTools' default filter — §GEO-SERVED lesson)
      console.error(TAG + ' §LAYER-GATE probe failed — gate DISARMED for this seed: ' + (e && e.message));
      gate.armed = false;
    }
    return gate;
  }

  // ── §LOD-300 CATALOG MIRROR (Bug-2 "illegal LOD200 geometry" — honest PARTIAL fix, user-approved scope). This
  // mirrors ONLY hash+ifc_class+bbox (NOT the mesh v/f blobs — no invention/duplication of geometry data) for the
  // exactly-3 REAL-mesh items in bonsai_library.js's CATALOG (Column/Beam/Door). MUST stay byte-identical to that
  // CATALOG's hash+bbox — if bonsai_library.js's CATALOG ever changes, update this mirror too (a drift here only
  // silently STOPS matching, it can never render a wrong mesh: foldInsert always re-resolves the real mesh from the
  // REAL catalog by hash at fold time; this mirror only decides WHICH hash, if any, to stamp on a seed op).
  // Kept local (not imported) so this module stays a pure DB-reader, dual-exportable to node with no browser deps
  // (fetch/document/atob) — see bonsai_library.js CATALOG for the source of truth.
  var LOD300_CATALOG = [
    { hash: '3e6348624e89b507', ifc_class: 'IfcColumn', bbox: [-0.225, 0.225, -0.4, 0.4, -2.0, 2.0] },
    { hash: '9cbb780e8801984f', ifc_class: 'IfcBeam', bbox: [-2.75, 2.75, -0.15, 0.15, -0.3, 0.3] },
    { hash: 'ed1eee29900658a8', ifc_class: 'IfcDoor', bbox: [-0.89, 0.89, -0.075, 0.075, -1.05, 1.05] }
  ];
  // 5% relative-L1 tolerance on SORTED (w,d,h) dims — data-driven, not invented: measured across
  // Duplex/SampleHouse/SampleCastle_extracted.db (2026-07-01), the ONE genuine structural match (SampleHouse
  // IfcDoor guid 3cUkl32yn9qRSPvBJVyWYp, dims 1.86×0.199×2.11 vs catalog Door 1.78×0.15×2.1) sits at reldist=0.034;
  // every other candidate across all 3 buildings/3 classes is ≥0.074 (SampleCastle IfcBeam) — a clean >2× gap, so
  // 0.05 cleanly separates the one real match from the nearest false positive without hand-tuning to a single case.
  var LOD300_TOL = 0.05;
  function _sorted3(a, b, c) { return [a, b, c].sort(function (x, y) { return x - y; }); }
  // best (lowest-reldist) LOD-300 catalog match for an ifc_class + measured (bx,by,bz), or null if none within tol.
  // Orientation-agnostic (sorted dims): a real element's local w/d/h axes need not align with the catalog's.
  function _matchLod300(cls, bx, by, bz) {
    var dims = _sorted3(bx, by, bz), best = null;
    for (var i = 0; i < LOD300_CATALOG.length; i++) {
      var c = LOD300_CATALOG[i]; if (c.ifc_class !== cls) continue;
      var cb = c.bbox, cd = _sorted3(cb[1] - cb[0], cb[3] - cb[2], cb[5] - cb[4]);
      var dist = Math.abs(dims[0] - cd[0]) + Math.abs(dims[1] - cd[1]) + Math.abs(dims[2] - cd[2]);
      var rel = dist / (cd[0] + cd[1] + cd[2]);
      if (rel <= LOD300_TOL && (!best || rel < best.rel)) best = { hash: c.hash, rel: rel, catBbox: cb };
    }
    return best;
  }

  // buildSeedOps(db) — PURE read of a sql.js *_extracted.db → {ops, skipped, discipline}. Each op is the exact
  // GEOM_INSERT shape foldInsert consumes for a raw-bbox (hash-less) insert.
  //
  // §REAL-GEOM (2026-07-02, "no silent box fallback" — user directive): the building's OWN per-element mesh
  // (component_geometries/base_geometries, keyed by element_instances.geometry_hash — see real_geometry.js)
  // is resolved HERE, once per db, and stamped onto each op as a SEPARATE, ADDITIVE field `params.realGeomHash`
  // — deliberately NOT reusing `params.hash`/`matched`/`unmatched` (the pre-existing LOD300_CATALOG generic-
  // component match, Bug-2's "honest partial fix"). Kept orthogonal so:
  //   (a) LOD300_CATALOG's own matched/unmatched bookkeeping (W-ARC-EDITABLE A9) is untouched byte-for-byte;
  //   (b) a caller that never registers real geometry (any pure-node witness, incl. this file's own) folds
  //       EXACTLY as before — foldInsert only consults `_geom[realGeomHash]` if something registered it there
  //       (bonsai_library.js registerRealGeometry, wired browser-side by str_walker_outliner.js), so old
  //       node-side witnesses are provably unaffected by this addition.
  // HARD-FAIL (no silent box): only fires when THIS db actually carries a geometry substrate (geomTable != null)
  // — i.e. only for a genuinely broken per-element link, never for a resident/fixture that has no geometry
  // tables at all (e.g. Terminal_meta.db's ARC-seed buffer, whose geometry lives in a SEPARATE Terminal_geo.db
  // file — out of scope for this single-db reader; that resident keeps its existing raw-bbox behaviour,
  // unregressed). Measured 2026-07-02: SampleCastle_ARC/SampleHouse/SampleCastle/Duplex extracted.db all have
  // 0 unresolved hashes — this path is a safety net, not the common case.
  // geoDb (optional) — a SEPARATE sql.js Database that carries component_geometries/base_geometries when the
  // building's mesh substrate lives in its own file (§GEO-SPLIT, Terminal_geo.db vs Terminal_meta.db). Defaults
  // to `db` — every existing single-file call site (SampleHouse/Duplex/SampleCastle/SampleCastle-ARC, every
  // pure-node witness) is byte-identical, unchanged.
  // opts (OPTIONAL, §GEOMAP-WIRE audit channel — bim-compiler RESUME_IFC_BOM_GEOMAPPING.md §WIRE-SPEC):
  //   opts.classify = { validate(cls, dims3) } — injected geomap validator (GeomapBridge.gmValidate curried
  //   with the building key). AUDIT-FIRST: this NEVER touches op params/order/count — witness W-GEOMAP-WIRE W1
  //   proves ops byte-identical with/without it. Results land in the returned `geomap` block + §GEOMAP-VALIDATE
  //   logs only. Absent (every pre-existing caller + pure-node witnesses) ⇒ zero new code paths run.
  function buildSeedOps(db, geoDb, opts) {
    opts = opts || {};
    var gm = opts.classify && typeof opts.classify.validate === 'function' ? opts.classify : null;
    var gmAudit = gm ? { checked: 0, flagged: [], noBand: 0 } : null;
    var GM_FLAG_LOG_CAP = 20; // Terminal-scale seeds: log the first N flags individually, summarize the rest
    var hasDisc = _hasDiscipline(db);
    var where = hasDisc ? "m.discipline='ARC'"
      : '(' + ARC_CLASSES.map(function (c) { return "m.ifc_class='" + c + "'"; }).join(' OR ') + ')';
    var hasId = _hasIdColumn(db);
    if (!hasId) _log(TAG + ' §ARC-SEED-SCHEMA elements_meta has no id column — ORDER BY guid fallback (stable, guid-keyed bridge unaffected)');
    // §ANCHOR: select the is_anchor flag when the column exists (else a constant 0 — identical SQL shape,
    // zero behaviour change for every other resident).
    var hasAnchor = _hasAnchorColumn(db);
    var sql = "SELECT m.guid, m.ifc_class, t.center_x, t.center_y, t.center_z, " +
      "t.bbox_x, t.bbox_y, t.bbox_z, t.rotation_x, t.rotation_y, t.rotation_z, m.material_rgba, " +
      (hasAnchor ? "m.is_anchor" : "0") + " FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid = m.guid WHERE " + where + " ORDER BY " + (hasId ? 'm.id' : 'm.guid');
    var r = db.exec(sql), ops = [], skipped = [], matched = 0, unmatched = 0, tilted = 0;
    var geomIdx = RealGeometry ? RealGeometry.buildGeometryIndex(db, geoDb || db) : { table: null, byGuid: {}, resolved: {} };
    var geomAssets = [], geomSeen = {}, realResolved = 0, hardfail = 0;
    // §LAYER-GATE: arm only where the ARC db ships multi-layer edges AND a geometry substrate exists
    // (a meta-only seed renders honest raw boxes and already logs that degradation loudly upstream).
    var layerGate = geomIdx.table ? _layerGate(db, geoDb || db) : { armed: false, multiLayer: {}, layeredHashes: {}, nMulti: 0, nHashes: 0 };
    var layerRefused = 0;
    var anchorOps = [];   // §ANCHOR — collected SEPARATELY, appended AFTER the normal ops (see below)
    if (r.length) r[0].values.forEach(function (v) {
      var guid = v[0], cls = v[1], cx = v[2], cy = v[3], cz = v[4], bx = v[5], by = v[6], bz = v[7], rx = v[8] || 0, ry = v[9] || 0, rz = v[10] || 0, rgba = v[11], isAnchor = v[12] === 1;
      // §ANCHOR branch — BEFORE every count/audit/hardfail below (the user's binding condition: anchors are
      // excluded from EVERY count, pick, and audit). A void-consumed host has NO element_instances row by
      // design (§GEOM-HARDFAIL untouched — nothing to render), so it must never reach that check either.
      // The op is a real GEOM_INSERT with the host's REAL patch-shipped placement+extent, params.anchorOnly
      // ⇒ bonsai_library.js foldInsert / bonsai_kernel.js build it as an INVISIBLE mesh (userData.anchor).
      // NO hash, NO realGeomHash, NO LOD300 match, NO gmAudit, NO matched/unmatched/tilted contribution.
      if (isAnchor) {
        if (cx == null || cy == null || cz == null || !(bx > 0) || !(by > 0) || !(bz > 0)) {
          _log(TAG + ' §ANCHOR-SKIP guid=' + guid + ' class=' + cls + ' degenerate anchor transform — persisted nothing');
          return;
        }
        var ap = { bbox: [-bx / 2, bx / 2, -by / 2, by / 2, -bz / 2, bz / 2], anchorOnly: true,
          provenance: 'void_anchor', ifc_class: cls };
        // identical placement maths to the normal path (yaw-only vs §ARC-3AXIS) — same frame, same seat
        ap.placement = (rx || ry) ? { x: cx, y: cy, z: cz, rotX: rx, rotY: ry, rotZRad: rz }
                                  : { x: cx, y: cy, z: cz - bz / 2, rot: rz * 180 / Math.PI };
        anchorOps.push({ op_type: 'GEOM_INSERT', params: ap, outputGuid: guid });
        _log(TAG + ' §ANCHOR seed guid=' + guid + ' class=' + cls + ' extent=' + bx.toFixed(3) + 'x' + by.toFixed(3) + 'x' + bz.toFixed(3) + 'm (invisible ride anchor)');
        return;
      }
      // §ARC-YAW-ONLY (code-parity audit vs the Viewer): viewer/streaming.js applies the FULL 3-axis Euler
      // (_euler.set(el.rotX, el.rotZ, -el.rotY)) — every rotation_x/y/z column, straight radians. This ARC-seed
      // path only ever fed rotation_z through place()'s single yaw (cos/sin about Z); rotation_x/rotation_y were
      // read nowhere and silently discarded. Real ARC content (walls/columns/slabs) is upright in every building
      // measured so far (Duplex/SampleHouse/SampleCastle: 0 non-zero rotation_x/rotation_y rows) so this has
      // never yet dropped real tilt — but a silent drop is still a drop. Make it an AUDITED, non-invented fact:
      // count + log any element this seed CANNOT represent, instead of pretending yaw-only is the whole story.
      if (rx || ry) tilted++;
      // honest-refuse: never fabricate a box for a NULL/degenerate-bbox element (skipped + logged, excluded from count)
      if (cx == null || cy == null || cz == null || !(bx > 0) || !(by > 0) || !(bz > 0)) {
        skipped.push({ guid: guid, ifc_class: cls, reason: 'no-bbox' }); return;
      }
      // §GEOM-HARDFAIL: this db HAS a geometry substrate but THIS element's own link into it is broken
      // (no instance row / null hash / hash doesn't resolve to a blob) — refuse the element entirely rather
      // than render a normal-looking (but fake) solid-palette box. Safety net only (see block comment above).
      if (geomIdx.table) {
        var linkedHash = geomIdx.byGuid[guid];
        if (linkedHash == null || !geomIdx.resolved[linkedHash]) {
          hardfail++;
          console.error(TAG + ' §GEOM-HARDFAIL guid=' + guid + ' class=' + cls + ' no real geometry — skipped, not rendered');
          skipped.push({ guid: guid, ifc_class: cls, reason: 'no-real-geometry' }); return;
        }
        // §LAYER-GATE refusal (Modeller half of §LOD400-ENVELOPE-GATE): the source authored this
        // element as N material layers, but its resolved mesh carries NO per-layer slab index —
        // that mesh is the forbidden envelope fallback. Refuse loudly, mirror §GEOM-HARDFAIL:
        // console.error + skip, never rendered as real geometry, never softened per-building.
        if (layerGate.armed && layerGate.multiLayer[guid] && !layerGate.layeredHashes[linkedHash]) {
          layerRefused++;
          console.error(TAG + ' §LAYER-ENVELOPE-REFUSE guid=' + guid + ' class=' + cls +
            ' layers=' + layerGate.multiLayer[guid].n + " set='" + layerGate.multiLayer[guid].set +
            "' — authored multi-layer element resolved an envelope-only mesh (no component_geometry_layers rows) — skipped, not rendered (§LOD400-ENVELOPE)");
          skipped.push({ guid: guid, ifc_class: cls, reason: 'envelope-no-layers' }); return;
        }
      }
      // §GEOMAP-VALIDATE (audit-only — see opts.classify contract above): own-class measured-band check on the
      // MEASURED dims. tier 2 ⇒ counted (in-band or flagged with z + why); tier 0 ⇒ noBand (class has no
      // measured band / building has no rules — honest refuse, NOT a flag). Never touches the op below.
      if (gm) {
        var gv = null;
        try { gv = gm.validate(cls, [bx, by, bz]); } catch (e) { gv = null; }
        if (gv && gv.tier === 2) {
          gmAudit.checked++;
          if (!gv.class_or_fact.in_band) {
            gmAudit.flagged.push({ guid: guid, ifc_class: cls, z: gv.class_or_fact.z, why: gv.why });
            if (gmAudit.flagged.length <= GM_FLAG_LOG_CAP) {
              _log(TAG + ' §GEOMAP-VALIDATE FLAG guid=' + guid + ' class=' + cls + ' z=' + gv.class_or_fact.z +
                ' dims=' + bx.toFixed(3) + 'x' + by.toFixed(3) + 'x' + bz.toFixed(3) + 'm outside own-class measured band');
            }
          }
        } else gmAudit.noBand++;
      }
      var bbox = [-bx / 2, bx / 2, -by / 2, by / 2, -bz / 2, bz / 2];   // MEASURED local box, centred in x/y/z (kept
      // on every op regardless of match — audit trail: what was actually measured, vs what mesh got stamped).
      var seatHalfZ = bz / 2;                                          // §LOD-300: seat half-height defaults to MEASURED
      var m = _matchLod300(cls, bx, by, bz);                           // Bug-2 partial fix: try the 3-item real-mesh catalog
      var params = { bbox: bbox, color: colorFor(cls), provenance: 'recovered:extracted', ifc_class: cls, opacity: alphaFor(rgba) };
      if (m) {
        matched++;
        params.hash = m.hash;
        params.lod = '300';                                            // EXPLICIT: foldInsert's P.lod fallback defaults
        // to '200' (bonsai_library.js lodFor) — a hash alone does NOT upgrade LOD; this must be set for the real mesh
        // to actually render (verified: bonsai_library.js:347 `this.lodFor(op.id, P.lod)`).
        // seat on the MATCHED CATALOG's own half-height (not the measured one) so the swapped-in mesh's WORLD
        // CENTRE still lands exactly on the measured (cx,cy,cz) — "same placement, richer mesh" (doctrine §5):
        // the catalog mesh is symmetric about its local origin in x/y/z (verified against its own baked v-buffer),
        // so only the z seat needs compensating for the catalog/measured height difference; x/y are placement-direct.
        seatHalfZ = (m.catBbox[5] - m.catBbox[4]) / 2;
      } else { unmatched++; }
      // §REAL-GEOM: if THIS element's own real mesh resolved (above), it wins over the generic 3-item catalog
      // at FOLD time (bonsai_library.js foldInsert checks realGeomHash before hash/lod) — the element's OWN
      // scanned shape is strictly more faithful than a coincidentally-dimension-matched generic component.
      // NOTE: seatHalfZ here is deliberately left as the box/catalog value computed above (NOT the real mesh's
      // own extent) — placement.z below is computed from THAT seatHalfZ so a caller that never registers real
      // geometry (any pure-node witness) still lands EXACTLY on its existing box/catalog seat, byte-for-byte.
      // Whether real geometry is actually available is only known by the FOLD (registration is browser-side,
      // optional, and may race the first fold) — so foldInsert itself re-derives the true seat and RE-SEATS
      // onto the real mesh's own half-height at fold time (see bonsai_library.js foldInsert §REAL-GEOM).
      if (geomIdx.table) {
        var rHash = geomIdx.byGuid[guid], real = rHash != null ? geomIdx.resolved[rHash] : null;
        if (real) {
          params.realGeomHash = rHash;
          realResolved++;
          // §ARC-ANCHOR: anchorOffset (the blob-local AABB centre recenter() subtracted) rides the ASSET, not
          // the signed op — the fold re-applies it rotated (bonsai_library.js foldInsert §ARC-ANCHOR), so every
          // committed GEOM_INSERT param stays byte-identical to the pre-fix substrate (replay-stable).
          // §LAYER-SOLID-SEED: carry this hash's real per-layer face ranges (if any) alongside the mesh —
          // bonsai_library.js registerRealGeometry stores it; bonsai_kernel.js._insertCutLayerSeed reads it
          // at cut-seed time. null for every hash without authored layers (unchanged behaviour).
          if (!geomSeen[rHash]) { geomSeen[rHash] = true; geomAssets.push({ hash: rHash, ifc_class: cls, bbox: real.bbox, v: real.positions, f: real.faces, anchorOffset: real.anchorOffset, layers: layerGate.layerRanges[rHash] || null }); }
        }
      }
      if (rx || ry) {
        // §ARC-3AXIS: genuine tilt (497/3317 on modeller/SampleCastle_extracted.db, per §ARC-YAW-ONLY audit
        // above) — bbox is already centred at local origin (this function centres it a few lines up), so
        // translate the rotated box directly by the MEASURED centre, no ground-seat step (matches
        // viewer/streaming.js's own compose(pos,quat,scale), which places centres not bottoms). RAW RADIANS
        // throughout — bonsai_library.js's 3-axis branch consumes radians directly, same as the Viewer; do
        // NOT apply the rz*180/Math.PI conversion below, that's only for the DEGREES-based yaw-only path.
        params.placement = { x: cx, y: cy, z: cz, rotX: rx, rotY: ry, rotZRad: rz };
      } else {
        // ground-seat: place() seats local zmin (=-seatHalfZ) at placement.z → world centre z = z + seatHalfZ; set
        // z = cz - seatHalfZ so the world-centre lands EXACTLY on (cx,cy,cz). Yaw about Z is centre-invariant.
        // §ARC-ROT-UNIT fix: element_transforms.rotation_z is stored in RADIANS (the Viewer applies it straight
        // into THREE's native-radian Euler — viewer/streaming.js:748 `_euler.set(el.rotX, el.rotZ, -el.rotY)`,
        // no conversion). bonsai_library.js's place() expects DEGREES (`pl.rot * Math.PI/180`) — every OTHER
        // caller (catalog drops, gizmo GEOM_ROTATE deltas) already feeds it degrees. Passing rz straight through
        // silently shrank every rotated ARC wall's yaw by ~57x (e.g. a true -90° wall rotated only -1.57°) —
        // walls meant to form a perpendicular room corner instead rendered nearly parallel/overlapping (the
        // "geometry hell" screenshot). Convert once here so ARC lands on the SAME true angle the Viewer renders.
        params.placement = { x: cx, y: cy, z: cz - seatHalfZ, rot: rz * 180 / Math.PI };
      }
      ops.push({ op_type: 'GEOM_INSERT', params: params, outputGuid: guid });
    });
    if (gmAudit) {
      var gmRate = gmAudit.checked ? Math.round(1000 * (gmAudit.checked - gmAudit.flagged.length) / gmAudit.checked) / 1000 : null;
      if (gmAudit.flagged.length > GM_FLAG_LOG_CAP) {
        _log(TAG + ' §GEOMAP-VALIDATE ...' + (gmAudit.flagged.length - GM_FLAG_LOG_CAP) + ' more flag(s) suppressed (all carried in the returned geomap.flagged)');
      }
      _log(TAG + ' §GEOMAP-VALIDATE summary checked=' + gmAudit.checked + ' flagged=' + gmAudit.flagged.length +
        ' noBand=' + gmAudit.noBand + ' inBandRate=' + gmRate +
        ' (audit-only: op substrate untouched; measured own-class in-band expectation ~93-96%, see geomap_rules.json)');
      gmAudit.inBandRate = gmRate;
    }
    // §ANCHOR: anchors are APPENDED AFTER the normal ops — two invariants ride on this exact order:
    //   (1) the normal ops' order/content stay BYTE-IDENTICAL to pre-anchor builds (same committed ids
    //       on a fresh session — replay-stable, witness-comparable);
    //   (2) an OLD persisted op-log (idempotent commitSeedGroup returns the PREVIOUS, anchor-less id
    //       list) still pairs ids[i]↔ops[i] correctly in buildBridge — only the tail anchors get no fid
    //       (⇒ stretchRide skips them, exactly the pre-fix behaviour; never a mis-paired bridge).
    if (anchorOps.length) {
      ops = ops.concat(anchorOps);
      _log(TAG + ' §ANCHOR seeded n=' + anchorOps.length + ' (invisible ride anchors — EXCLUDED from every count/pick/audit; logged separately from the ' + (ops.length - anchorOps.length) + ' seeded elements)');
    }
    // §LAYER-GATE honesty line — always printed when armed, refused=0 is the expected/GREEN case once
    // the resident's rebuilt *_geo.db (layer slabs + component_geometry_layers) has actually arrived.
    if (layerGate.armed) _log(TAG + ' §LAYER-GATE armed multiLayer=' + layerGate.nMulti +
      ' layeredHashes=' + layerGate.nHashes + ' refused=' + layerRefused +
      ' (authored multi-layer elements must resolve per-layer slabs — §LOD400-ENVELOPE)');
    return { ops: ops, skipped: skipped, discipline: hasDisc ? 'ARC' : 'fallback', matched: matched, unmatched: unmatched, tilted: tilted,
      geomAssets: geomAssets, realResolved: realResolved, hardfail: hardfail, geomTable: geomIdx.table, geomap: gmAudit,
      anchorN: anchorOps.length, layerGate: layerGate.armed ? { multiLayer: layerGate.nMulti, layeredHashes: layerGate.nHashes } : null,
      layerRefused: layerRefused };
  }

  // buildBridge(ops, ids) — ops[i] committed as kernel_ops row ids[i] (== its featureId). Build both directions
  // and stash on window for O(1) cascade neighbour lookup (guid → swXEdges → neighbour guid → featureId).
  function buildBridge(ops, ids) {
    var fidByGuid = {}, guidByFid = {};
    // §ANCHOR: anchors ARE in the bridge (that is the whole point — stretchRide resolves
    // fidByGuid[host_guid]) but every OTHER consumer must be able to tell them apart, so the anchor
    // guid/fid sets are published alongside (Outliner row marking/click, gate rel, etc. read these).
    var anchorGuids = typeof Set !== 'undefined' ? new Set() : null, anchorFids = anchorGuids ? new Set() : null;
    for (var i = 0; i < ops.length && i < ids.length; i++) {
      fidByGuid[ops[i].outputGuid] = ids[i];
      guidByFid[ids[i]] = ops[i].outputGuid;
      if (anchorGuids && ops[i].params && ops[i].params.anchorOnly) { anchorGuids.add(ops[i].outputGuid); anchorFids.add(ids[i]); }
    }
    if (typeof window !== 'undefined') {
      window.__arcFidByGuid = fidByGuid; window.__arcGuidByFid = guidByFid;
      window.__arcAnchorGuids = anchorGuids; window.__arcAnchorFids = anchorFids;
    }
    return { fidByGuid: fidByGuid, guidByFid: guidByFid, anchorGuids: anchorGuids, anchorFids: anchorFids };
  }

  // seedArc — orchestrator. INJECTED io:
  //   io.commitGroup(opsArray, gid) -> Promise<{ids, committed, idempotent}>   (the only writer)
  //   io.fold()  -> Promise   (optional: redraw the chain after seeding)
  //   io.building -> string   (deterministic gid 'arcseed-<building>' → idempotent re-seed)
  //   io.geoDb -> sql.js Database   (OPTIONAL, §GEO-SPLIT: a SEPARATE db carrying component_geometries/
  //     base_geometries, e.g. Terminal_geo.db vs buildingDb=Terminal_meta.db. Absent/undefined → buildSeedOps
  //     resolves geometry against buildingDb itself, i.e. every existing single-file caller is unaffected.)
  //   io.registerGeometry(assets) -> void   (OPTIONAL: browser-only. Registers the real per-element meshes
  //     resolved by buildSeedOps into the render layer — bonsai_library.js's Library.registerRealGeometry —
  //     BEFORE commit/fold so foldInsert sees them the first time it folds. A caller that omits this (every
  //     pure-node witness today) gets EXACTLY today's raw-bbox/LOD300_CATALOG fold behaviour: realGeomHash is
  //     still stamped on the ops (harmless, unread) but nothing is registered to resolve it against.
  // commits the WHOLE building as ONE op-group (atomic, one hash-chain, idempotent by gid) then folds once.
  async function seedArc(buildingDb, io) {
    io = io || {};
    var name = io.building || 'building';
    // io.classify (OPTIONAL, §GEOMAP-WIRE): threaded straight through to buildSeedOps's audit channel —
    // absent for every pre-existing caller, and provably incapable of altering the committed ops (W1).
    var built = buildSeedOps(buildingDb, io.geoDb, io.classify ? { classify: io.classify } : undefined);
    if (io.registerGeometry && built.geomAssets.length) {
      try { io.registerGeometry(built.geomAssets); } catch (e) { _log(TAG + ' §REAL-GEOM registerGeometry failed ' + (e && e.message)); }
    }
    var gid = 'arcseed-' + name;
    var groupOps = built.ops.map(function (o) { return { op_type: o.op_type, params: o.params, outputGuid: o.outputGuid }; });
    var res = await io.commitGroup(groupOps, gid);
    var ids = (res && res.ids) || [];
    var bridge = buildBridge(built.ops, ids);
    if (io.fold) { try { await io.fold(); } catch (e) { _log(TAG + ' fold after seed failed ' + (e && e.message)); } }
    built.skipped.forEach(function (s) { _log(TAG + ' §ARC-SEED skip guid=' + s.guid + ' class=' + s.ifc_class + ' reason=' + s.reason); });
    // §ANCHOR: every seed/element count below is over the NORMAL ops only — anchors are excluded from
    // every count (the user's binding condition) and carry their own §ANCHOR lines from buildSeedOps.
    // On an idempotent re-open of an OLD (pre-anchor) persisted log, ids may cover only the normal ops.
    var anchorN = built.anchorN || 0, normalN = built.ops.length - anchorN;
    var committedNormal = Math.min(ids.length, normalN);
    _log(TAG + ' §ARC-SEED building=' + name + ' committed=' + committedNormal + ' skipped=' + built.skipped.length +
      ' disc=' + built.discipline + ' idempotent=' + !!(res && res.idempotent));
    // §LOD300-MATCH honesty line (Bug-2 partial fix): matched = real catalog mesh (LOD-300) stamped; unmatched =
    // stays raw-bbox LOD-200 exactly as before — NEVER silently claimed as upgraded. See LOD300_CATALOG/_matchLod300.
    _log(TAG + ' §LOD300-MATCH building=' + name + ' matched=' + built.matched + ' unmatched=' + built.unmatched +
      ' (of ' + normalN + ' seeded; matched ⇒ real catalog mesh LOD-300, unmatched ⇒ raw-bbox LOD-200 unchanged)');
    // §ARC-YAW-ONLY audit (code-parity vs viewer/streaming.js's full 3-axis Euler — see buildSeedOps): tilted=0
    // on every building measured so far (non-invent: logged, never silently assumed) — if this is ever >0, the
    // ARC seed is KNOWINGLY rendering that element upright/untilted (yaw-only), not fabricating a wrong tilt.
    if (built.tilted) _log(TAG + ' §ARC-YAW-ONLY building=' + name + ' tilted=' + built.tilted +
      ' element(s) have non-zero rotation_x/rotation_y that this yaw-only ARC seed CANNOT represent (rendered' +
      ' upright instead) — see viewer/streaming.js for the full-Euler reference this seed does not yet match');
    // §GEOM-HARDFAIL summary — the "no silent box" honesty line: total elements refused (broken geometry link)
    // vs the whole seedable set. 0/N is the expected/measured case for SampleCastle/SampleCastle_ARC/SampleHouse/
    // Duplex (every element_instances.geometry_hash resolves) — a nonzero count is real data-integrity signal.
    _log(TAG + ' §GEOM-HARDFAIL total=' + built.hardfail + ' of ' + (normalN + built.hardfail) +
      ' (geomTable=' + (built.geomTable || 'none') + ' realResolved=' + built.realResolved + '/' + normalN + ')');
    return { committed: committedNormal, skipped: built.skipped.length, ids: ids, bridge: bridge, ops: built.ops,
      matched: built.matched, unmatched: built.unmatched, tilted: built.tilted, realResolved: built.realResolved, hardfail: built.hardfail,
      geomap: built.geomap, anchorN: anchorN, layerGate: built.layerGate, layerRefused: built.layerRefused };
  }

  function _log(m) { if (typeof console !== 'undefined') console.log(m); }

  return { buildSeedOps: buildSeedOps, buildBridge: buildBridge, seedArc: seedArc, colorFor: colorFor, alphaFor: alphaFor, ARC_CLASSES: ARC_CLASSES,
    TAG: TAG, LOD300_CATALOG: LOD300_CATALOG, LOD300_TOL: LOD300_TOL, matchLod300: _matchLod300 };
});
