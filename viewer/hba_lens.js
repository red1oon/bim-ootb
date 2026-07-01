// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET → VIEWER WIRE (RESUME_HR_BIM_ASSET.md §RESUME NEXT#2). The ONE viewer-core
//   coupling. ADDITIVE + HOST-INJECTED (teams/erp_bridge pattern): imports NOTHING from viewer internals,
//   the host hands it `A` (APP). It binds the WITNESSED HBA engine (hr_bim_asset/overlay.js + binding.js)
//   to the real scene through a MeshPort over A.guidMap. ZERO-IMPACT: if the HBA globals or guidMap are
//   absent it is inert; toggling OFF restores every touched material (no residue). NON-INVENT: a record
//   lights a unit ONLY when its guid resolves to a real mesh (binding.resolveGuid) — else honest no-op.
//   The 3D tint uses the proven emissive pattern (viewer/nlp.js highlightGuids). Read the log after run.
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);

  // the WITNESSED engine (loaded as <script> before this file → self.Hba* globals)
  function HBA() { return { O: G.HbaOverlay, B: G.HbaBinding, M: G.HbaModels, L: G.HbaLens, T: G.HbaTimeline, A: G.HbaAttendance, OC: G.HbaOccupancy }; }
  function ready() { var h = HBA(); return !!(h.O && h.B && h.M); }

  // hex '#2e7d32' | int → int for THREE emissive.setHex
  function toHex(c) { return (typeof c === 'string') ? parseInt(c.replace('#', ''), 16) : c; }

  // ---- the MeshPort: the §RESUME NEXT#2 "MeshPort hook to APP.guidMap" -------------------------------
  // Real impl of the port the overlay engine drives: { allGuids, setTint, setGhost, restoreAll }.
  // A.guidMap is meshId→guid (guids are VALUES; instanced meshes carry `_N` keys) — verified 2026-06-30.
  function buildMeshPort(A, opts) {
    opts = opts || {};
    var touched = [];                                   // [{m, e?|inst?|batch?|o?, ...}] — saved originals for restore
    var _byId = null;                                   // meshId → THREE object (rebuilt each restore cycle)
    // scratch THREE.Color for per-slot (instanced/batched) tint — instanced meshes carry no per-instance emissive,
    // so a single instance is recoloured via setColorAt (DIFFUSE). null in node-without-THREE (regular path only).
    var _C = (typeof THREE !== 'undefined' && THREE.Color) ? new THREE.Color() : null;
    function meshById() {
      if (_byId) return _byId;
      _byId = {};
      A.collectMeshes(function (o) { return o.isMesh || o.isInstancedMesh || o.isBatchedMesh; })
        .forEach(function (o) { _byId[o.id] = o; });
      return _byId;
    }
    function targetsFor(guid) {
      // §REAL-BIND — a zone tints via the zone's own mesh if rendered, else its rendered contained members.
      var want = HBA().B.zoneMeshGuids(guid, A.guidMap, A._hbaRoomMembers || null);
      if (!want.length) return [];
      // §INSTANCED-TINT — reverse-index handling the `_N` slot suffix (the tintedMeshes=0 bug on instanced/batched).
      var byId = meshById(), out = [];
      HBA().B.guidTargets(want, A.guidMap).forEach(function (t) {
        var m = byId[t.meshId]; if (m) out.push({ m: m, slot: t.slot });
      });
      return out;
    }
    return {
      allGuids: function () {                            // every rendered guid (bare + `_N`-keyed instanced/batched)
        var s = {}, gm = A.guidMap || {}; for (var k in gm) { if (gm[k]) s[gm[k]] = 1; } return Object.keys(s);
      },
      setTint: function (guid, color) {
        var hex = toHex(color);
        targetsFor(guid).forEach(function (tt) {
          var m = tt.m;
          if (tt.slot == null) {                         // whole mesh (regular/merged) — emissive glow (nlp.js pattern)
            if (m.material && m.material.emissive) { touched.push({ m: m, e: m.material.emissive.getHex() }); m.material.emissive.setHex(hex); }
          } else if (m.isInstancedMesh && m.setColorAt && _C) {   // one instance — per-instance diffuse colour
            var had = !!m.instanceColor, prev = 0xffffff;          // un-set instanceColor multiplies WHITE (identity)
            if (had) { m.getColorAt(tt.slot, _C); prev = _C.getHex(); }
            touched.push({ m: m, inst: tt.slot, c: prev });
            m.setColorAt(tt.slot, _C.setHex(hex)); m.instanceColor.needsUpdate = true;
          } else if (m.isBatchedMesh && m.setColorAt && _C) {      // one batched slot — per-slot diffuse colour
            var pb = 0xffffff; try { m.getColorAt(tt.slot, _C); pb = _C.getHex(); } catch (e) {}
            touched.push({ m: m, batch: tt.slot, c: pb });
            try { m.setColorAt(tt.slot, _C.setHex(hex)); } catch (e2) {}
          }
        });
      },
      // ghost = de-emphasise the rest. DEFAULT OFF for the first live wire: materials are often SHARED across
      // meshes (instanced/merged) so a blind opacity mutation can over-ghost — enable via opts.ghost once
      // visually verified. The engine still iterates every non-linked guid; this is a safe visual no-op.
      setGhost: function (guid) {
        if (!opts.ghost) return;
        targetsFor(guid).forEach(function (tt) {
          var m = tt.m;                                  // ghost only whole-mesh targets (per-slot opacity not supported)
          if (tt.slot == null && m.material) { touched.push({ m: m, o: m.material.opacity, t: m.material.transparent }); m.material.transparent = true; m.material.opacity = 0.12; }
        });
      },
      restoreAll: function () {
        touched.forEach(function (s) {
          if (s.inst != null && s.m.instanceColor && _C) { s.m.setColorAt(s.inst, _C.setHex(s.c)); s.m.instanceColor.needsUpdate = true; }
          else if (s.batch != null && s.m.setColorAt && _C) { try { s.m.setColorAt(s.batch, _C.setHex(s.c)); } catch (e) {} }
          else if (s.e != null && s.m.material && s.m.material.emissive) s.m.material.emissive.setHex(s.e);
          if (s.o != null && s.m.material) { s.m.material.opacity = s.o; s.m.material.transparent = s.t; }
        });
        touched = []; _byId = null;
        if (A.markDirty) A.markDirty();
      },
      tintedCount: function () { return touched.length; }   // whitebox: # of targets currently tinted (§DIAG truth)
    };
  }

  var _port = null, _active = null;   // current MeshPort + active mode ('tenancy'|'maintenance'|null)

  // §REAL-BIND — the resolvable-guid set for THIS building: rendered mesh guids PLUS rooms that have ≥1 rendered
  // contained member (so a lease on a non-rendered IfcSpace still resolves via its members). Falls back to the
  // raw guidMap when no member map is bound (witnesses / buildings without rel_contained_in_space).
  function _known(A) { return HBA().B.augmentKnown(A.guidMap, A._hbaRoomMembers || null); }

  // detect = the DATA GATE (§BINDING activation): does ANY HBA record of this lens resolve to a real guid
  // in the loaded building? Drives whether the pill icon appears at all (no data → no icon, no clutter).
  function detect(A, mode) {
    if (!ready() || !A || !A.guidMap) return false;
    var h = HBA(), known = _known(A);
    if (mode === 'presence') {                                // §T&A SLICE-2 — gate on a real, located check-in
      if (!h.A) return false;
      var rows = presenceRows(A);
      for (var j = 0; j < rows.length; j++) if (h.B.resolveGuid(rows[j].zone, known)) return true;
      return false;
    }
    if (mode === 'occupancy') {                               // Resource-Assignment — gate on a located room op
      if (!h.OC) return false;
      var orows = occupancyRows(A);
      for (var k = 0; k < orows.length; k++) if (h.B.resolveGuid(orows[k].zone, known)) return true;
      return false;
    }
    if (mode === 'class') {                                   // §CLASS facet — gate on a classifiable, located unit
      var crows = classRows(A);
      for (var m = 0; m < crows.length; m++) if (h.B.resolveGuid(crows[m].zone, known)) return true;
      return false;
    }
    var recs = mode === 'maintenance' ? h.M.records('Asset') : h.M.records('Tenancy');
    var field = mode === 'maintenance' ? 'bim_guid' : 'unit_guid';
    for (var i = 0; i < recs.length; i++) if (h.B.resolveGuid(recs[i][field], known)) return true;
    return false;
  }

  // §T&A SLICE-2 — presence rows for the CURRENT period from the host-injected signed attendance log
  // (A._hbaAttendanceLog; seam, not a viewer-core dependency). Honest empty when no log/engine present.
  function presenceRows(A) {
    var h = HBA();
    if (!h.A || !A) return [];
    var log = A._hbaAttendanceLog || [];
    return h.A.presenceByZone(log, period(A));
  }

  // §CLASS facet (user 2026-07-01) — resolve each leased/owned unit's building-USE class for THIS building.
  // PRIORITY (non-invent): (1) a REAL model IfcSpace predefined_type (A._hbaSpaceClass, mapped from the model
  // in bindStoreysFromModel) — EXTRACTED; (2) the record's declared unit_class — a business datum; (3)
  // 'unclassified' — never guessed. HHS carries no real space-type (all 'INTERNAL') → falls to the declared
  // lease class. Returns [{zone, class}] candidates; the overlay's knownGuids gate scopes them to the building.
  function classOf(guid, declared, A) {
    var m = A && A._hbaSpaceClass;
    if (m && m[guid]) return m[guid];                          // real model class wins when a building has one
    return declared || 'unclassified';                        // declared lease class, else honest unclassified
  }
  function classRows(A) {
    var h = HBA(); if (!h.M || !A) return [];
    var rows = [], seen = {};
    ['Tenancy', 'Strata'].forEach(function (model) {
      h.M.records(model).forEach(function (r) {
        var g = r.unit_guid; if (!g || seen[g]) return; seen[g] = true;
        rows.push({ zone: g, class: classOf(g, r.unit_class, A) });
      });
    });
    return rows;
  }

  // Resource-Assignment — room availability rows for the CURRENT period from the host-injected signed
  // occupancy log (A._hbaOccupancyLog). Honest empty when no log/engine present.
  function occupancyRows(A) {
    var h = HBA();
    if (!h.OC || !A) return [];
    var log = A._hbaOccupancyLog || [];
    return h.OC.lensRows(log, period(A));
  }

  // bind the Find-lens storey index from the LIVE model (rooms→IfcBuildingStorey) so density dots use real
  // storeys — non-invent, honest no-op on a building without spatial_structure. Uses the viewer's A.dbQuery.
  var _storeysBound = false;
  function bindStoreysFromModel(A) {
    var h = HBA();
    if (_storeysBound || !h.L || !h.L.bindStoreys || !A || typeof A.dbQuery !== 'function') return;
    try {
      var rows;
      try {
        rows = A.dbQuery("SELECT s.guid, p.name, s.predefined_type FROM spatial_structure s LEFT JOIN spatial_structure p "
          + "ON s.parent_guid=p.guid AND p.type='IfcBuildingStorey' WHERE s.type='IfcSpace'");
      } catch (eSp) { rows = []; }   // a building with NO spatial_structure (e.g. a warehouse) → §AISLE-ZONES fallback below
      var map = {}; (rows || []).forEach(function (r) { if (r[0] && r[1]) map[r[0]] = r[1]; });
      h.L.bindStoreys(map); _storeysBound = true;
      console.log('§HBA_STOREY bound ' + Object.keys(map).length + ' rooms→storey from model');
      // §CLASS facet — map a REAL IfcSpace predefined_type → our use-class (extracted, non-invent). Only a
      // genuine IfcSpaceTypeEnum use-class counts; INTERNAL/EXTERNAL/COMPILED/NOTDEFINED/USERDEFINED are NOT a
      // use-class → skipped (the class then falls back to the declared lease unit_class). HHS = all INTERNAL.
      var CLS = { RESIDENTIAL: 'residential', OFFICE: 'office', COMMERCIAL: 'commercial', RETAIL: 'commercial', SHOP: 'commercial' };
      var sc = {}; (rows || []).forEach(function (r) { var pt = (r[2] || '').toUpperCase(); if (CLS[pt]) sc[r[0]] = CLS[pt]; });
      A._hbaSpaceClass = sc;
      if (Object.keys(sc).length) console.log('§HBA_CLASS mapped ' + Object.keys(sc).length + ' rooms→use-class from model predefined_type');
      // stash the real rooms + seed a (watermarked, demonstrator) occupancy ledger so the Occupancy lens +
      // Dashboard pane have data on a building that carries rooms. ADDITIVE: sets only A._hba* fields.
      var rooms = Object.keys(map).map(function (g) { return { guid: g, storey: map[g] }; });
      A._hbaRooms = rooms; A._hbaStoreyOf = map;
      // §REAL-BIND — a room is NOT a rendered mesh; tint it via its CONTAINED elements (rel_contained_in_space),
      // which ARE rendered. Build room→members so binding.augmentKnown/zoneMeshGuids can resolve + paint rooms on
      // the live model. Honest no-op if the table is absent. This is the fix for the "lens shows no data" gap.
      try {
        var crows = A.dbQuery("SELECT space_guid, element_guid FROM rel_contained_in_space");
        var mm = {}; (crows || []).forEach(function (r) { if (r[0] && r[1]) { (mm[r[0]] = mm[r[0]] || []).push(r[1]); } });
        A._hbaRoomMembers = mm;
        console.log('§HBA_MEMBERS bound ' + Object.keys(mm).length + ' rooms→contained-element members (rel_contained_in_space)');
      } catch (e) { A._hbaRoomMembers = A._hbaRoomMembers || {}; }
      // §AISLE-ZONES (P3, 2026-07-01 — user: "aisles as zones") — a building with NO IfcSpace rooms (a warehouse:
      // GardenWorld) still groups its elements by a REAL `storey` in elements_meta (SITE/AISLE_A/B/C). Fall back to
      // AISLE-as-ZONE: zone = the aisle (its floor-slab guid is a real rendered element), members = every element
      // guid in that aisle (all real, EXTRACTED — non-invent). Lets the FM lenses + dashboard light a room-less
      // building. Skips SITE (the ground plane). No-op when IfcSpace rooms already exist (HHS) or no elements_meta.
      if (!rooms.length) {
        try {
          var arows = A.dbQuery("SELECT guid, storey FROM elements_meta WHERE storey IS NOT NULL AND storey != '' AND storey != 'SITE'");
          var amap = {}; (arows || []).forEach(function (r) { if (r[0] && r[1]) { (amap[r[1]] = amap[r[1]] || []).push(r[0]); } });
          var aisles = Object.keys(amap).sort();
          if (aisles.length) {
            rooms = aisles.map(function (a) { return { guid: a, storey: a }; });
            var smap = {}; aisles.forEach(function (a) { smap[a] = a; });
            A._hbaRooms = rooms; A._hbaStoreyOf = smap; A._hbaRoomMembers = amap; _storeysBound = true;
            if (h.L && h.L.bindStoreys) h.L.bindStoreys(smap);
            console.log('§HBA_AISLE fallback: ' + aisles.length + ' aisle-zones (no IfcSpace rooms) — ' + aisles.join(',') + ' (members: ' + aisles.map(function (a) { return a + '=' + amap[a].length; }).join(' ') + ')');
          }
        } catch (eA) { /* no elements_meta either → honest no-op */ }
      }
      if (!A._hbaOccupancyLog && h.OC && rooms.length) {
        A._hbaOccupancyLog = h.OC.demoSeed(rooms).log;
        console.log('§HBA_OCC seeded ' + A._hbaOccupancyLog.length + ' assignment ops from ' + rooms.length + ' rooms (demonstrator)');
      }
      // §T&A SLICE-2 PILL — seed a (watermarked-context, demonstrator) signed check-in log over the SAME real
      // rooms for the CURRENT period so the Presence lens + pill light up. Parallel to occupancy; ts derived
      // from period (no Date.now); honest zero headcount on rooms with no check-in. ADDITIVE: sets only A._hba*.
      if (!A._hbaAttendanceLog && h.A && h.A.demoSeed && rooms.length) {
        A._hbaAttendanceLog = h.A.demoSeed(rooms, period(A)).log;
        console.log('§HBA_ATT seeded ' + A._hbaAttendanceLog.length + ' check-in ops from ' + rooms.length + ' rooms (demonstrator, ' + period(A) + ')');
      }
      // §RICH-DEMO (P2) — seed a spread of OPEN service tickets (varied ages) over the SAME real rooms so the
      // Dashboard's ticket-aging doughnut populates all 4 SLA buckets (was empty: Request log unseeded). Gated on
      // the AUGMENTED known set so a ticket resolves via the room's rendered members (non-invent). ADDITIVE.
      if (!A._hbaRequestLog && G.HbaRequest && G.HbaRequest.demoSeed && rooms.length) {
        // gate on the REAL ROOM set (from spatial_structure — fully available now), NOT the rendered-mesh set
        // (guidMap still streams at this point). A ticket's non-invent gate is "is this a real room"; the lens
        // resolves room→rendered-members later at paint time.
        var reqKnown = {}; rooms.forEach(function (r) { reqKnown[r.guid] = r.guid; });
        A._hbaRequestLog = G.HbaRequest.demoSeed(rooms, '2026-05-10T00:00:00Z', reqKnown).log;
        console.log('§HBA_REQ seeded ' + A._hbaRequestLog.length + ' open tickets from ' + rooms.length + ' rooms (demonstrator, aging @2026-05-10)');
      }
    } catch (e) { /* no spatial_structure → honest no-op (density falls back to S?) */ }
  }

  // period helper — current month YYYY-MM (the overlay's "now"); host may override via A._hbaPeriod.
  function period(A) {
    if (A && A._hbaPeriod) return A._hbaPeriod;
    var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  // toggle a lens ON/OFF. ON → drive the WITNESSED engine through the real MeshPort, GATED by A.guidMap so a
  // non-matching guid never tints (honest). OFF (or switching mode) → full restore (zero residue).
  function toggle(A, mode) {
    if (!ready()) { if (A && A.status) A.status.textContent = 'HR overlay not loaded'; return false; }
    if (_port) { _port.restoreAll(); _port = null; }            // clear prior mode first (one mode at a time)
    if (G.HBAAvatars && G.HBAAvatars.isActive()) G.HBAAvatars.unmount(A);   // §AVATAR-LOD — avatars ride the presence lens; clear them with it
    if (_active === mode) { _active = null; console.log('§HBA_LENS off mode=' + mode); if (A.markDirty) A.markDirty(); return false; }
    var h = HBA();
    var known = _known(A);                                                       // §REAL-BIND — rooms resolve via rendered members
    var plan = (mode === 'presence')                                            // §T&A SLICE-2 — reuse the SAME seam
      ? h.O.computePresence(presenceRows(A), { knownGuids: known, period: period(A) })
      : (mode === 'occupancy')                                                  // Resource-Assignment — same seam
        ? h.O.computeOccupancy(occupancyRows(A), { knownGuids: known, period: period(A) })
        : (mode === 'class')                                                     // §CLASS facet — same seam
          ? h.O.computeClassOverlay(classRows(A), { knownGuids: known, classFilter: A._hbaClassFilter || null })
          : h.O.computeOverlay(mode, period(A), { knownGuids: known });          // non-invent gate (all paths)
    _port = buildMeshPort(A, { ghost: false });
    var n = h.O.applyOverlay(_port, plan);
    _active = mode;
    // §AVATAR-LOD (P6) — when Presence lights up, stand a little person in each room where a real check-in put
    // one, with an LOD ladder (dot→mini→full) + hover card. Additive; unmounted above when the lens clears.
    if (mode === 'presence' && G.HBAAvatars) { try { G.HBAAvatars.mount(A); } catch (e) { console.warn('§HBA_AVATARS mount skipped: ' + e.message); } }
    if (A.status) A.status.textContent = 'HR · ' + mode + ' · ' + n + ' unit' + (n === 1 ? '' : 's') + ' lit' + (plan.unlinked.length ? ' (' + plan.unlinked.length + ' un-linked)' : '');
    console.log('§HBA_LENS on mode=' + mode + ' lit=' + n + ' unlinked=' + plan.unlinked.length + ' linked=[' + plan.linked.join(',') + ']');
    if (A.markDirty) A.markDirty();
    return true;
  }

  function isActive(mode) { return _active === mode; }

  // ── §FM-FAMILY (user 2026-07-01) — group the HBA lenses under ONE "FM / Operate" pill to keep the main bar
  //   uncluttered, and make each lens WAKE-AWARE (enabled only when its data exists in the loaded building, else
  //   greyed). De-conflate: Tenancy is folded into Occupancy (occupancy = the op-log superset incl. lease
  //   status), so the family lists DISTINCT questions only. The 'tenancy' engine mode still exists (back-compat
  //   + witnesses) but is no longer a separate surface. `availableLenses` = the pure, witnessed core that drives
  //   both the family-pill gate and the per-entry greying; `openFamilyDrawer` = the thin browser renderer.
  var _ic = {  // self-contained Lucide paths (the drawer owns its icons; no panels.js coupling)
    doorOpen:  '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.562z"/>',
    footprints:'<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
    layers:    '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
    cpu:       '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    barChart:  '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>'
  };
  var FAMILY = [
    { kind: 'lens', mode: 'occupancy',   icon: 'doorOpen',   label: 'Occupancy',    detail: 'Availability — occupied / expiring / vacant / unavailable (incl. lease status)' },
    { kind: 'lens', mode: 'presence',    icon: 'footprints', label: 'Presence',     detail: 'Live headcount-by-zone from signed check-ins' },
    { kind: 'lens', mode: 'class',       icon: 'layers',     label: 'Unit class',   detail: 'Use-class — residential / commercial / office' },
    { kind: 'lens', mode: 'maintenance', icon: 'cpu',        label: 'Assets / IoT', detail: 'Equipment maintenance due — ok / due / overdue' },
    { kind: 'pane', id:   'dash',        icon: 'barChart',   label: 'Dashboard',    detail: 'Occupancy / availability / ticket-aging charts (extra pane)' }
  ];
  function _entryActive(f) {
    return f.kind === 'pane' ? !!(G.HBADashPane && G.HBADashPane.isActive && G.HBADashPane.isActive()) : isActive(f.mode);
  }
  function _entryAvailable(A, f) {
    return f.kind === 'pane' ? !!(G.HBADashPane && G.HBADashPane.detect && G.HBADashPane.detect(A)) : detect(A, f.mode);
  }
  // pure, witnessed: the wake-aware availability + active state of every family entry for THIS building.
  function availableLenses(A) {
    return FAMILY.map(function (f) {
      return { kind: f.kind, mode: f.mode || null, id: f.id || f.mode, icon: f.icon, label: f.label,
               detail: f.detail, available: !!_entryAvailable(A, f), active: !!_entryActive(f) };
    });
  }
  function familyHasData(A) { return availableLenses(A).some(function (x) { return x.available; }); }     // gates the pill
  function familyActive() {
    var drawerOpen = (typeof document !== 'undefined') && !!document.getElementById('hba-fm-drawer');
    return availableLenses(G.APP || G.A || {}).some(function (x) { return x.active; }) || drawerOpen;
  }
  function activateLens(A, entry) { if (entry.kind === 'pane') { if (G.HBADashPane) G.HBADashPane.toggle(A); } else { toggle(A, entry.mode); } }

  // the thin BROWSER renderer — a small drawer of the family entries; available → clickable, unavailable → greyed
  // (wake-aware), active → highlighted. Re-tap the FM pill toggles it shut. No node path (returns if no document).
  function openFamilyDrawer(A) {
    if (typeof document === 'undefined') return null;
    var ex = document.getElementById('hba-fm-drawer'); if (ex) { ex.remove(); return null; }
    var list = availableLenses(A), d = document.createElement('div'); d.id = 'hba-fm-drawer';
    d.style.cssText = 'position:fixed;z-index:10000;right:64px;top:50%;transform:translateY(-50%);background:#0e1b2a;'
      + 'color:#fff;border-radius:10px;padding:8px;box-shadow:0 8px 28px rgba(0,0,0,.45);font:13px/1.3 system-ui,sans-serif;min-width:230px;';
    var hdr = document.createElement('div'); hdr.textContent = 'FM / Operate'; hdr.style.cssText = 'font-weight:700;padding:4px 8px 8px;opacity:.85;';
    d.appendChild(hdr);
    list.forEach(function (e) {
      var row = document.createElement('button'); row.disabled = !e.available;
      row.setAttribute('data-lens', e.id); row.setAttribute('data-available', e.available ? '1' : '0'); row.setAttribute('data-active', e.active ? '1' : '0');
      row.title = e.detail + (e.available ? '' : ' — no data in this building');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;border-radius:8px;margin:2px 0;'
        + 'padding:8px 10px;color:#fff;cursor:' + (e.available ? 'pointer' : 'default') + ';opacity:' + (e.available ? '1' : '0.4')
        + ';background:' + (e.active ? '#1976d2' : 'transparent') + ';';
      row.innerHTML = '<span style="display:inline-flex"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (_ic[e.icon] || '') + '</svg></span>'
        + '<span style="flex:1">' + e.label + '</span>'
        + '<span style="opacity:.7;font-size:11px">' + (e.available ? (e.active ? '● on' : '') : 'no data') + '</span>';
      if (e.available) row.addEventListener('click', function () { activateLens(A, e); d.remove(); if (A.markDirty) A.markDirty(); });
      d.appendChild(row);
    });
    document.body.appendChild(d);
    console.log('§HBA_FM drawer open — ' + list.filter(function (x) { return x.available; }).length + '/' + list.length + ' lenses available');
    return d;
  }

  // §7D / NEXT#4(c): hand the merged 4D editor a DERIVED preventive-maintenance schedule (viewer schema), for
  // assets that bind to a REAL element in THIS building. Non-invent (dates from next_due+pm_cycle, milestones).
  // The TM "Schedule Editor" / importer can fold this without any HBA edit to the editor. Returns null if the
  // timeline engine is absent. Filters to real bindings so nothing un-located is emitted.
  function maintenanceSchedule(A, opts) {
    var h = HBA(); if (!h.T || !h.M) return null;
    var assets = h.M.records('Asset');
    if (A && A.guidMap) assets = assets.filter(function (a) { return h.B.resolveGuid(a.bim_guid, A.guidMap); });
    var sch = h.T.buildSchedule(assets, opts || {});
    console.log('§HBA_PM derived schedule: assets=' + assets.length + ' tasks=' + sch.tasks.length + ' binds=' + sch.task_elements.length + ' skipped=' + sch.skipped.length);
    return sch;
  }

  // §INSTANCED-TINT whitebox accessor — # of mesh targets the ACTIVE lens currently tints (regular emissive +
  // instanced/batched per-slot). The live driver asserts this > 0 (the old emissive-only count missed instanced).
  function tintedCount() { return _port ? _port.tintedCount() : 0; }

  G.HBALens = { detect: detect, toggle: toggle, isActive: isActive, buildMeshPort: buildMeshPort, tintedCount: tintedCount,
    maintenanceSchedule: maintenanceSchedule, availableLenses: availableLenses, familyHasData: familyHasData,
    familyActive: familyActive, activateLens: activateLens, openFamilyDrawer: openFamilyDrawer, FAMILY: FAMILY, _ready: ready };
  if (typeof module === 'object' && module.exports) { module.exports = G.HBALens; return; }   // node witness — no DOM gate

  // ---- DATA-GATE poll (mirrors viewer/wh_walk.js): flip the pill icons ON only when a lens detects ------
  // a real binding in the loaded building, then rebuild the pill. No data → icons stay hidden (no clutter).
  // §HBA_GATE_FIX (RESUME_OVERLAY_PILL_ICONS.md) — geometry streams incrementally; guidMap goes non-empty
  // long before every element has arrived (bbox-first flush order), so gating on "any keys" caught the model
  // half-streamed and settled the family list too early (observed: only [dash] available, FM never lit).
  // A.streaming is the real stream-complete signal (viewer/streaming.js streamTick flips it false once the
  // queue drains) — wait for it before locking in availableLenses(), same non-invent gate, just not premature.
  var _tries = 0, _poll = setInterval(function () {
    _tries++;
    var A = G.APP || G.A;
    // guidMap fills as geometry streams — wait for it (and for the HBA engine to have loaded).
    var hasMesh = A && A.guidMap && Object.keys(A.guidMap).length > 0;
    if (!ready() || !hasMesh) { if (_tries > 240) { clearInterval(_poll); console.warn('§HBA_GATE timeout — engine/guidMap not ready'); } return; }
    if (A.streaming) { if (_tries > 240) { clearInterval(_poll); console.warn('§HBA_GATE timeout — still streaming'); } return; }
    clearInterval(_poll);
    bindStoreysFromModel(A);   // real storeys for the density dots (honest no-op if the model lacks them)
    // ONE family pill (hbaFM) — flip it on when ANY lens has data (familyHasData = the wake-aware gate). The
    // per-lens availability/greying is computed live in the drawer (availableLenses), not on the bar.
    var acts = G._mainPillActions || [], lenses = availableLenses(A), any = familyHasData(A);
    for (var i = 0; i < acts.length; i++) {
      if (acts[i].id === 'hbaFM') { acts[i].pill = any ? undefined : false; }
    }
    if (any && A._buildPill) A._buildPill();
    console.log('§HBA_GATE FM=' + (any ? 'on' : 'off') + ' available=['
      + lenses.filter(function (x) { return x.available; }).map(function (x) { return x.id; }).join(',')
      + '] (guidMap=' + Object.keys(A.guidMap).length + ')');
  }, 500);
})();
