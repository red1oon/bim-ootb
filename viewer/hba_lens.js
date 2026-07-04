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
  function HBA() { return { O: G.HbaOverlay, B: G.HbaBinding, M: G.HbaModels, L: G.HbaLens, T: G.HbaTimeline, A: G.HbaAttendance, OC: G.HbaOccupancy, AD: G.HbaAdPayroll, Lv: G.HbaLeave, ADT: G.HbaAdTenancy, ADA: G.HbaAdAttendance, ADB: G.HbaAdBom, IoT: G.HbaIot }; }
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
      // P7 — seed a (watermarked, demonstrator) payroll spec so the Payslip pane has data on a building that
      // carries rooms (mirrors the occupancy/attendance/request gate above). Payroll identity (c_bpartner_id)
      // has NO spatial binding to check (unlike Occupancy/Asset) — reuses the SAME EMP001/EMP002 baseline
      // already accepted by witness_ad_payroll.js, not a per-building invention.
      if (!A._hbaPayrollSpec && h.AD && h.AD.demoSpec && rooms.length) {
        A._hbaPayrollSpec = h.AD.demoSpec();
        console.log('§HBA_PAY seeded payroll spec — ' + A._hbaPayrollSpec.employees.length + ' employees, period ' + A._hbaPayrollSpec.period + ' (demonstrator)');
      }
      // P8 — seed a (watermarked, demonstrator) leave spec so the Leave pane has data, same reasoning as
      // Payroll above (no spatial guid to resolve). Reuses the SAME employee identities as the payroll spec
      // (EMP001/EMP002) and the SAME accrue/take schedule already accepted by witness_leave.js, per employee.
      if (!A._hbaLeaveSpec && h.Lv && h.Lv.demoLog && h.AD && h.AD.demoSpec && rooms.length) {
        var payEmps = h.AD.demoSpec().employees;
        var leaveEmps = payEmps.map(function (e) { return { id: e.name, name: e.name }; });
        var leaveLogs = {}; leaveEmps.forEach(function (e) { leaveLogs[e.id] = h.Lv.demoLog(e.id); });
        A._hbaLeaveSpec = { period: null, policy: null, locale: 'en', employees: leaveEmps, log: leaveLogs };
        console.log('§HBA_LEAVE seeded leave spec — ' + leaveEmps.length + ' employees (demonstrator)');
      }
      // §P10-BUILD/§P10a — compile the WHOLE building's tenancy+strata into native AD shapes (Warehouse/
      // Locator/Product/Subscription) so the Tenancy pane has data on a building that carries rooms. Uses the
      // model's OWN building name (A.buildingName, honest fallback to a generic label) — never invented.
      if (!A._hbaTenancySpec && h.ADT && h.ADT.compileBuilding && h.M && rooms.length) {
        A._hbaTenancySpec = h.ADT.compileBuilding(A.buildingName || 'This Building', rooms, h.M.records('Tenancy'), h.M.records('Strata'));
        console.log('§HBA_TEN compiled tenancy spec — units=' + A._hbaTenancySpec.units + ' subscriptions=' + A._hbaTenancySpec.subscriptions.length + ' skipped=' + A._hbaTenancySpec.skipped.length);
      }
      // §P11 — compile each REAL room into a native S_Resource header row (Dashboard's "hover a Resource"
      // deep-link needs a real numeric s_resource_id per room; see occupancy.js compileResources header).
      // §DESIGN-RESOURCE-AVAILABILITY (Stage 2) — thread the SAME signed occupancy replay (A._hbaOccupancyLog,
      // seeded just above) so isavailable/percentutilization are the room's REAL availability, not a hardcoded 'Y'.
      if (!A._hbaResourceSpec && h.OC && h.OC.compileResources && rooms.length) {
        A._hbaResourceSpec = h.OC.compileResources(rooms, { log: A._hbaOccupancyLog || null,
          period: period(A), periods: [period(A)],
          storeyOf: function (g) { return (A._hbaStoreyOf && A._hbaStoreyOf[g]) || 'Unknown'; } });
        var unavail = A._hbaResourceSpec.resources.filter(function (r) { return r.row.isavailable === 'N'; }).length;
        console.log('§HBA_RES compiled ' + A._hbaResourceSpec.resources.length + ' S_Resource rows from ' + rooms.length + ' rooms (real availability: ' + unavail + ' unavailable, percentutilization threaded)');
      }
      // §STAGE2 — now that the literal specs are seeded, attempt ERP-governance (async ad_seed.db load →
      // re-compile the ERP-sourced specs off real rows). ADDITIVE: a failure leaves the literal specs standing.
      _ensureErpGovern(A);
    } catch (e) { /* no spatial_structure → honest no-op (density falls back to S?) */ }
  }

  // period helper — current month YYYY-MM (the overlay's "now"); host may override via A._hbaPeriod.
  function period(A) {
    if (A && A._hbaPeriod) return A._hbaPeriod;
    var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  // §STAGE2 (RESUME_HBA_ERP_GOVERNED_DISPLAY.md Stage 2) — the ERP-GOVERNANCE seam. ADDITIVE + ZERO-IMPACT:
  // the seeding gate above already seeds LITERAL specs (unchanged — panes work immediately, every existing
  // witness/behaviour intact). This lazily loads the REAL erp/ad_seed.db (the SAME db navigate_find.js's
  // _ensureErpDb loads) and, ONCE it is available, RE-COMPILES the governable specs (payroll identities,
  // tenancy warehouse/locators, attendance→C_Attendance) off the real seeded rows, then swaps them in. If the
  // SQL factory / cachedFetch seam is absent (off the ERP-capable page), or the fetch fails, or the db lacks
  // the HHS rows, NOTHING changes — the literal specs stand (the fallback the module builders guarantee).
  var _erpDb = null, _erpTried = false;
  function _erpQueryFrom(db) {
    return function (sql, params) {                         // SYNC reader → [{col:val,…}] row-objects
      var r = db.exec(sql, params || []); if (!r.length) return [];
      var cs = r[0].columns;
      return r[0].values.map(function (v) { var o = {}; cs.forEach(function (c, i) { o[c] = v[i]; }); return o; });
    };
  }
  function _ensureErpGovern(A) {
    if (_erpTried || !A) return;                            // one attempt per session (governance is monotonic)
    _erpTried = true;
    var SQL = A._SQL || G.SQL || G._SQL_CACHED;             // viewer caches the sql.js factory as A._SQL; absent off the ERP page
    var fetchDb = A.cachedFetch || (G.APP && G.APP.cachedFetch);
    if (!SQL || typeof fetchDb !== 'function') { console.log('§HBA_GOVERN skip — no SQL/cachedFetch seam (literal specs stand)'); return; }
    Promise.resolve(fetchDb('../erp/ad_seed.db'))
      .then(function (buf) {
        _erpDb = new SQL.Database(new Uint8Array(buf));
        var eq = _erpQueryFrom(_erpDb);
        A.erpQuery = eq;                                    // expose the sync seam (Stage 3 panes/lenses reuse it)
        _regovern(A, eq);
      })
      .catch(function (e) { console.log('§HBA_GOVERN skip — ad_seed.db load failed: ' + e.message + ' (literal specs stand)'); });
  }
  // recompute ONLY the ERP-sourced specs off the real rows and swap them in (idempotent). The signed op-logs /
  // leave / request specs are untouched. Honest no-op per spec if a dependency (rooms/engine) is missing.
  // the REAL building name — the warehouse MATCH KEY (Value). A.buildingName is unset in the streaming path,
  // so EXTRACT it from the model's own project_metadata (the SAME source seed_hba_erp.js pinned the warehouse
  // Value from — 'HHS_Office_Federated'); honest fallback to A.buildingName only when the model lacks the row.
  function _buildingName(A) {
    try {
      if (typeof A.dbQuery === 'function') {
        var rows = A.dbQuery("SELECT value FROM project_metadata WHERE key='building_name'");
        if (rows && rows[0] && rows[0][0]) return rows[0][0];
      }
    } catch (e) { /* no project_metadata → honest fallback below */ }
    return A.buildingName || 'This Building';
  }
  function _regovern(A, eq) {
    var h = HBA(), n = 0, bname = _buildingName(A);
    if (h.AD && h.AD.demoSpec) { A._hbaPayrollSpec = h.AD.demoSpec(eq); n++; }
    if (h.ADT && h.ADT.compileBuilding && h.M && A._hbaRooms) {
      A._hbaTenancySpec = h.ADT.compileBuilding(bname, A._hbaRooms,
        h.M.records('Tenancy'), h.M.records('Strata'), { erpQuery: eq });
      n++;
    }
    // §PREREQUISITE retarget (RESUME_HBA_ERP_STAGE3.md) — compile the signed presence sessions onto the REAL
    // NATIVE S_ResourceAssignment shape (resource map from the real seeded S_Resource rows — the Mary-
    // Consultant pattern; the invented C_Attendance is retired). The ZONE stays a BIM op-log fact, carried in
    // the spec's `spatial` view-trace. Sessions whose employee has no real S_Resource are honestly SKIPPED.
    if (h.ADA && h.A && A._hbaAttendanceLog && A._hbaRooms) {
      var sessions = h.A.sessions(A._hbaAttendanceLog, period(A));
      var resRows = eq('SELECT S_Resource_ID AS s_resource_id, Value AS value FROM S_Resource WHERE AD_User_ID IS NOT NULL AND IsActive=?', ['Y']);
      // exposed standalone (not just folded into compileAttendance) so OTHER panes needing employee→S_Resource
      // (e.g. the Leave pane's §2026-07-04 thread C click-through) reuse the SAME real-row-sourced map, never
      // re-query/re-derive it themselves.
      A._hbaEmpResourceMap = h.ADA.resourceMapFromResources(resRows);
      A._hbaAttendanceSpec = h.ADA.compileAttendance(sessions, { resourceMap: A._hbaEmpResourceMap });
      n++;
    }
    // §BOM-ERP-CENTERED — read the BIM BOM as a LENS over the real seeded pp_product_bom (ad_bom.readBom), the
    // ERP being the authority (never the Java m_bom). Scoped to THIS building's warehouse. Stage 3 renders a
    // BOM pane off this spec; here we make the governed lens data available. Honest empty if no 'B' BOMs.
    if (h.ADB && h.ADB.readBom) {
      var whId = (A._hbaTenancySpec && A._hbaTenancySpec.warehouse) ? A._hbaTenancySpec.warehouse.m_warehouse_id : null;
      A._hbaBomSpec = h.ADB.readBom(eq, whId != null ? { m_warehouse_id: whId } : {});
      n++;
    }
    console.log('§HBA_GOVERN on — re-compiled ' + n + ' governable spec(s) off real ad_seed.db (payroll _governed='
      + !!(A._hbaPayrollSpec && A._hbaPayrollSpec._governed)
      + ' warehouse=' + (A._hbaTenancySpec ? A._hbaTenancySpec.warehouse.m_warehouse_id : 'n/a')
      + ' S_ResourceAssignment=' + (A._hbaAttendanceSpec ? (A._hbaAttendanceSpec.rows.length + '/' + (A._hbaAttendanceSpec.rows.length + A._hbaAttendanceSpec.skipped.length)) : 'n/a')
      + ' BOM=' + (A._hbaBomSpec ? (A._hbaBomSpec.assemblies.length + ' assemblies') : 'n/a') + ')');
    if (A.markDirty) A.markDirty();
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
    barChart:  '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    banknote:  '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    calendar:  '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    fileText:  '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    box:       '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>'
  };
  var FAMILY = [
    { kind: 'lens', mode: 'occupancy',   icon: 'doorOpen',   label: 'Occupancy',    detail: 'Availability — occupied / expiring / vacant / unavailable (incl. lease status)' },
    { kind: 'lens', mode: 'presence',    icon: 'footprints', label: 'Presence',     detail: 'Live headcount-by-zone from signed check-ins — click opens the roster, click a person to zoom' },
    { kind: 'lens', mode: 'class',       icon: 'layers',     label: 'Unit class',   detail: 'Use-class — residential / commercial / office' },
    { kind: 'lens', mode: 'maintenance', icon: 'cpu',        label: 'Assets / IoT', detail: 'Equipment maintenance due — click opens 24h sensor charts + CCTV mockup + billing' },
    { kind: 'pane', id:   'tenancy',     icon: 'fileText',   label: 'Tenancy / AD', detail: 'Lease/strata compiled to native AD (Warehouse/Locator/Product/Subscription)' },
    { kind: 'pane', id:   'bom',         icon: 'box',        label: 'BIM BOM',      detail: 'Room assemblies → component lines, read as a lens over native pp_product_bom (ERP is the authority)' },
    { kind: 'pane', id:   'dash',        icon: 'barChart',   label: 'Dashboard',    detail: 'Occupancy / availability / ticket-aging charts (extra pane)' },
    { kind: 'pane', id:   'payslip',     icon: 'banknote',   label: 'Payslip',      detail: 'Payroll run → per-employee payslip (glass-box, watermarked)' },
    { kind: 'pane', id:   'leave',       icon: 'calendar',   label: 'Leave',        detail: 'Leave balance & statement — accrual/take replay (glass-box)' }
  ];
  // pane entries route by `id` to their own additive pane module (dash→HBADashPane, payslip→HBAPayslipPane,
  // leave→HBALeavePane, tenancy→HBATenancyPane) — a small registry instead of hardcoding one pane name, so
  // adding a pane never touches the lens/toggle path.
  var PANE_GLOBALS = { dash: 'HBADashPane', payslip: 'HBAPayslipPane', leave: 'HBALeavePane', tenancy: 'HBATenancyPane', bom: 'HBABomPane' };
  function paneFor(f) { return G[PANE_GLOBALS[f.id]]; }
  function _entryActive(f) {
    return f.kind === 'pane' ? !!(paneFor(f) && paneFor(f).isActive && paneFor(f).isActive()) : isActive(f.mode);
  }
  function _entryAvailable(A, f) {
    return f.kind === 'pane' ? !!(paneFor(f) && paneFor(f).detect && paneFor(f).detect(A)) : detect(A, f.mode);
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
  function activateLens(A, entry) { if (entry.kind === 'pane') { var p = paneFor(entry); if (p) p.toggle(A); } else { toggle(A, entry.mode); } }

  // remove every child via removeChild/remove (NOT `.innerHTML = ''` — matches the codebase's own convention,
  // see hba_leave.js/hba_payslip.js headers: innerHTML-clearing isn't reliable across the lightweight witness
  // DOM stub used by every node test in this repo).
  function _clear(el) { while (el.children && el.children.length) { var c = el.children[0]; if (c.remove) c.remove(); else el.removeChild(c); } }

  function _closePresenceDrawer() {
    if (typeof document === 'undefined') return;
    var ex = document.getElementById('hba-presence-drawer'); if (ex) ex.remove();
  }

  // §P10a shared fly-to primitive (user 2026-07-02) — the Tenancy pane row-click AND the Presence roster
  // row-click AND the smart-search hits all fly through this ONE function (no duplicate camera code).
  // Centroid via the REAL-BIND idiom (zoneMeshGuids over A.guidMap+_hbaRoomMembers — same as buildMeshPort
  // above); flight = the navigate_find direction-preserving ease-lerp idiom, reimplemented here (hba_lens.js
  // is host-injected/additive — it cannot reach into navigate_find's private closure). Returns
  // {flew, guid, center} synchronously (witnessable without a real THREE/camera) and, when a real
  // camera+controls+THREE ARE present, also performs the actual browser fly. Honest no-op (logged, flew:false)
  // when the zone has no rendered members in THIS building — never a fabricated position.
  // world position for one guidTargets() resolution — slot===null is a whole regular/merged mesh (getWorldPosition);
  // a non-null slot is one instance/batch index within an InstancedMesh/BatchedMesh (§INSTANCED-TINT's `_N` suffix)
  // — those carry NO per-instance Object3D, so the position must come from getMatrixAt() premultiplied by the
  // mesh's own matrixWorld, the SAME math buildMeshPort's setTint already relies on for per-slot tinting.
  function _posForTarget(m, slot) {
    if (slot == null) {
      if (m.getWorldPosition && typeof THREE !== 'undefined') { var wp = new THREE.Vector3(); m.getWorldPosition(wp); return wp; }
      return m.position || null;
    }
    if (m.getMatrixAt && typeof THREE !== 'undefined') {
      var mat = new THREE.Matrix4(); m.getMatrixAt(slot, mat);
      if (m.matrixWorld) mat.premultiply(m.matrixWorld);
      return new THREE.Vector3().setFromMatrixPosition(mat);
    }
    return null;
  }

  // opts.dist (§2026-07-05c, user: "zooms to the device, not too near — surrounding") — the establishing-shot
  // distance from the target centroid; default 8 (unchanged, every pre-existing caller). IoT's device zoom
  // passes a larger value so the surrounding context (the room/plant/entrance the device sits in) stays visible
  // — a "wow, here's the room this thing lives in" shot, not a nose-to-the-mesh close-up.
  function flyToZone(A, guid, opts) {
    opts = opts || {};
    if (!A || !A.guidMap || !ready()) { console.log('§HBA_FLY no-op guid=' + guid + ' (no engine/guidMap)'); return { flew: false, reason: 'no-engine' }; }
    var want = HBA().B.zoneMeshGuids(guid, A.guidMap, A._hbaRoomMembers || null);
    if (!want.length) { console.log('§HBA_FLY no-op guid=' + guid + ' (no rendered members)'); return { flew: false, reason: 'no-members' }; }
    var pts = [];
    // §INSTANCED-TINT reuse — the SAME meshId/slot resolution buildMeshPort uses for tinting (the naive
    // `userData.guid` match below misses every instanced/batched target — HHS's 716 instanced groups are
    // exactly the bug this was silently eating: "no matching mesh" on a real building with real members).
    if (A.collectMeshes) {
      var targets = HBA().B.guidTargets(want, A.guidMap);
      if (targets.length) {
        var byId = {};
        A.collectMeshes(function (o) { return o.isMesh || o.isInstancedMesh || o.isBatchedMesh; }).forEach(function (o) { byId[o.id] = o; });
        targets.forEach(function (t) {
          var m = byId[t.meshId]; if (!m) return;
          var p = _posForTarget(m, t.slot); if (p) pts.push(p);
        });
      }
      if (!pts.length) {   // fallback — plain userData.guid match (regular meshes, and node-witness mocks)
        var set = {}; want.forEach(function (g) { set[g] = true; });
        A.collectMeshes(function (o) { return o.userData && set[o.userData.guid]; }).forEach(function (o) { if (o.position) pts.push(o.position); });
      }
    }
    if (!pts.length) { console.log('§HBA_FLY no-op guid=' + guid + ' (no matching mesh)'); return { flew: false, reason: 'no-mesh' }; }
    var cx = 0, cy = 0, cz = 0;
    pts.forEach(function (p) { cx += p.x; cy += p.y; cz += p.z; });
    var n = pts.length, center = { x: cx / n, y: cy / n, z: cz / n };
    if (A.camera && A.controls && typeof THREE !== 'undefined' && typeof requestAnimationFrame === 'function') {
      var c3 = new THREE.Vector3(center.x, center.y, center.z), dist = opts.dist || 8;
      var end = c3.clone().add(new THREE.Vector3(0.5, 0.5, 0.7).normalize().multiplyScalar(dist));
      var start = A.camera.position.clone(), t = 0;
      (function anim() {
        t += 0.05; if (t > 1) t = 1;
        var e = 1 - Math.pow(1 - t, 3);
        A.camera.position.lerpVectors(start, end, e);
        A.controls.target.copy(c3);
        A.controls.update();
        if (A.markDirty) A.markDirty();
        if (t < 1) requestAnimationFrame(anim);
      })();
      // a brief highlight pulse at the destination — so the fly is unmistakably "here's the thing", not just a
      // camera move to an empty-looking spot. Reuses buildMeshPort's own tint math (regular + instanced/batched);
      // self-restoring, so it never leaves a stray tint behind (zero residue, same discipline as every HBA lens).
      var pulsePort = buildMeshPort(A);
      pulsePort.setTint(guid, 0xffcc00);
      setTimeout(function () { pulsePort.restoreAll(); }, 1600);
    }
    console.log('§HBA_FLY guid=' + guid + ' center=(' + center.x.toFixed(1) + ',' + center.y.toFixed(1) + ',' + center.z.toFixed(1) + ')');
    return { flew: true, guid: want[0], center: center };
  }

  // §P11 (RESUME_HR_BIM_ASSET.md §P11, user 2026-07-02) — cross-app deep-link from an HBA pane into the real
  // iDempiere ERP UI, reusing the SAME URL shape navigate_find.js's `_surfaceExistingOrder` already proved
  // (`../erp/idempiere.html?client=garden&window=<AD_Window_ID>&record=<pk>`), NOT a new mechanism. Every id
  // below was LOOKED UP from this repo's own `build/erp/ad_full.db` (`SELECT AD_Window_ID,Name FROM AD_Window`),
  // never guessed — RESOURCE=236 "Resource" (table S_Resource), PAYROLL_MOVEMENT=53042 "Payroll Movement"
  // (table HR_Movement), SUBSCRIPTION=316 "Subscription" (table C_Subscription), ORDER=143 "Sales Order"
  // (table C_Order, issotrx='Y' matches iot.js's compiled order header). ONE shared source so every pane wires
  // the same numbers instead of re-typing them.
  // PAYROLL_CONCEPT=53036 "Payroll Concept Catalog" (table HR_Concept) — Leave has NO native AD table of its
  // own anywhere (verified §CRITICAL P8 finding, re-checked here) so a per-entry link would be invented; what
  // IS real is the "Leave without pay" pay-element identity (hr_concept_id) an unpaid entry feeds INTO — the
  // Leave pane links there, never to a fabricated leave-record window.
  // BOM=53006 "Bill of Materials and Formula" (table PP_Product_BOM) — looked up live in both ad_seed.db and
  // bim-compiler build/erp/ad_full.db (2026-07-03), the §STAGE3 BOM pane's per-assembly deep-link.
  // USER=108 "User" (table AD_User) — §2026-07-04 thread B: Presence's forward link, record=ad_user_id (always
  // populated on every MODELS.Official row, unlike c_bpartner_id which is null for the demo tenant records).
  // CONSTRUCTION=7800000 "Construction" (table M_Warehouse) — §2026-07-04 thread A: a SECOND AD_Window minted
  // over the same M_Warehouse row window 139 already covers (scripts/seed_hba_construction.js), same
  // established iDempiere convention as C_BPartner's 10 distinct windows over one table. record=m_warehouse_id.
  var AD_WINDOWS = { RESOURCE: 236, PAYROLL_MOVEMENT: 53042, SUBSCRIPTION: 316, ORDER: 143, PAYROLL_CONCEPT: 53036,
                     BOM: 53006, USER: 108, CONSTRUCTION: 7800000 };
  function erpLink(windowId, record) {
    if (windowId == null || record == null) return null;
    return '../erp/idempiere.html?client=garden&window=' + windowId + '&record=' + encodeURIComponent(record);
  }

  // §P10a — Presence roster (user 2026-07-02): a second small drawer beside the FM drawer, listing every
  // attendance session for the current period. Person resolved via MODELS.Official by attendance's own
  // `employee` id — an honest miss shows the bare code, never a fabricated name (attendance's auto-generated
  // overflow employees past EMP-4 have no Official row on purpose — see models.js Official header). Row click
  // flies the camera to the person's zone via flyToZone.
  function openPresenceDrawer(A) {
    if (typeof document === 'undefined') return null;
    _closePresenceDrawer();
    var h = HBA();
    var log = (A && A._hbaAttendanceLog) || [];
    // §STAGE3.1 (RESUME_HBA_ERP_STAGE3.md item 1) — GOVERNED read: when _regovern has compiled the sessions
    // onto the real native S_ResourceAssignment rows (A._hbaAttendanceSpec), the roster renders THOSE rows —
    // check-in/out, hours (Qty) and the maker-checker IsConfirmed come from the governed spec. The ZONE stays
    // the BIM op-log fact (room-granularity call): each row joins back to its zone via the spec's `spatial`
    // view-trace, keyed by the row PK — so fly-to-zone still works without a fabricated room FK. Honest-open
    // preserved (NULL AssignDateTo → 'checked in …'). Ungoverned (no ERP db) → the raw signed-op-log fold,
    // byte-identical to the pre-Stage-3 drawer.
    var gov = (A && A._hbaAttendanceSpec && A._hbaAttendanceSpec.rows && A._hbaAttendanceSpec.spatial) ? A._hbaAttendanceSpec : null;
    var sess;
    if (gov) {
      var zoneByRa = {}; gov.spatial.forEach(function (sp) { zoneByRa[sp.s_resourceassignment_id] = sp; });
      sess = gov.rows.map(function (r) {
        var sp = zoneByRa[r.s_resourceassignment_id] || {};
        return { employee: sp.employee != null ? sp.employee : r.name, zone: sp.zone, in: r.assigndatefrom,
                 out: r.assigndateto, hours: r.qty, confirmed: r.isconfirmed, open: r.assigndateto == null };
      });
    } else {
      sess = (h.A && h.A.sessions) ? h.A.sessions(log, period(A)) : [];
    }
    var d = document.createElement('div'); d.id = 'hba-presence-drawer';
    d.style.cssText = 'position:fixed;z-index:10000;right:326px;top:50%;transform:translateY(-50%);background:#0e1b2a;'
      + 'color:#fff;border-radius:10px;padding:8px;box-shadow:0 8px 28px rgba(0,0,0,.45);font:13px/1.3 system-ui,sans-serif;'
      + 'min-width:220px;max-height:70vh;overflow:auto;';
    var hdr = document.createElement('div'); hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 4px 8px;';
    var title = document.createElement('span'); title.textContent = 'Presence — ' + sess.length + (sess.length === 1 ? ' session' : ' sessions')
      + (gov ? ' · ERP-governed' : '');
    title.style.cssText = 'font-weight:700;opacity:.85;';
    var closeBtn = document.createElement('button'); closeBtn.textContent = '✕'; closeBtn.title = 'Close';
    closeBtn.style.cssText = 'background:transparent;border:0;color:#fff;opacity:.6;cursor:pointer;font-size:14px;line-height:1;padding:2px 4px;';
    closeBtn.addEventListener('click', function () { d.remove(); });
    hdr.appendChild(title); hdr.appendChild(closeBtn); d.appendChild(hdr);
    if (!sess.length) {
      var empty = document.createElement('div'); empty.textContent = 'No check-ins in this building/period.'; empty.style.cssText = 'padding:8px;opacity:.6;';
      d.appendChild(empty);
    }
    sess.forEach(function (s) {
      var official = h.M ? h.M.officialByName(s.employee) : null;
      var label = official ? official.name + (official.phone ? ' · ' + official.phone : '') : s.employee;
      var storey = (A._hbaStoreyOf && A._hbaStoreyOf[s.zone]) || null;
      // §2026-07-04 thread B — the one HBA entity with no bidirectional click-through (every other pane
      // carries an "open ↗"). Forward link only: AD_User.ad_user_id is always populated on every real
      // MODELS.Official row (unlike c_bpartner_id, null for the demo tenant records) — so this is the
      // honest, always-resolvable target, never a fabricated fallback.
      var row = document.createElement('div');
      row.setAttribute('data-employee', s.employee); row.setAttribute('data-zone', s.zone); row.setAttribute('data-label', label);
      row.style.cssText = 'position:relative;display:block;width:100%;text-align:left;border:0;border-radius:8px;margin:2px 0;'
        + 'padding:8px 10px;color:#fff;cursor:pointer;background:transparent;box-sizing:border-box;';
      // governed rows carry the REAL Qty hours + IsConfirmed maker-checker state; the raw fold has neither.
      var govBadge = gov ? ((s.hours != null ? ' · ' + s.hours + 'h' : '') + (s.open ? '' : (s.confirmed === 'Y' ? ' · ✓' : ' · unconfirmed'))) : '';
      row.innerHTML = '<div style="font-weight:600">' + label + '</div>'
        + '<div style="opacity:.7;font-size:11px">' + (storey ? storey + ' · ' : '') + (s.open ? 'checked in ' + s.in : s.in + ' → ' + s.out) + govBadge + '</div>';
      if (official && official.ad_user_id != null) {
        var a = document.createElement('a');
        a.href = erpLink(AD_WINDOWS.USER, official.ad_user_id);
        a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'open ↗';
        a.title = 'Open ' + official.name + ' in iDempiere (AD_User)';
        a.style.cssText = 'position:absolute;right:10px;top:8px;color:#4fc3f7;text-decoration:none;font-size:11px;';
        a.addEventListener('click', function (e) { e.stopPropagation(); });
        row.appendChild(a);
      }
      row.addEventListener('click', function () { flyToZone(A, s.zone); });
      d.appendChild(row);
    });
    if (gov && gov.skipped && gov.skipped.length) {   // honest: sessions whose identity had no real S_Resource
      var sk = document.createElement('div'); sk.textContent = gov.skipped.length + ' session(s) skipped — no real S_Resource (never fabricated)';
      sk.style.cssText = 'padding:6px 8px;opacity:.6;font-size:11px;color:#ffab91;';
      d.appendChild(sk);
    }
    document.body.appendChild(d);
    console.log('§HBA_PRESENCE_DRAWER open — ' + sess.length + ' sessions' + (gov ? ' (ERP-governed S_ResourceAssignment, skipped=' + gov.skipped.length + ')' : ' (op-log fold)'));
    return d;
  }

  // §P10a smart search — Room name/storey (A._hbaRooms, the SAME data Find's own Storey/Room tree reads —
  // bindStoreysFromModel populates it) + AD_User name/email/phone. Intentionally redundant with Find's own
  // search index (its tree lives in a private closure inside navigate_find.js, not exported — true reuse isn't
  // mechanically available); user accepted the duplication for this POC. Honest empty on no match.
  function _renderSearch(A, q, resultsEl) {
    _clear(resultsEl);
    q = (q || '').trim().toLowerCase();
    if (!q) return;
    function hit(s) { return s && String(s).toLowerCase().indexOf(q) >= 0; }
    var rooms = (A._hbaRooms || []).filter(function (r) { return hit(r.name) || hit(r.guid) || hit(r.storey); }).slice(0, 5);
    var people = (HBA().M ? HBA().M.records('Official') : []).filter(function (o) { return hit(o.name) || hit(o.phone) || hit(o.email); }).slice(0, 5);
    if (!rooms.length && !people.length) {
      var empty = document.createElement('div'); empty.textContent = 'No match.';
      empty.style.cssText = 'padding:4px 8px;opacity:.5;font-size:12px;'; resultsEl.appendChild(empty); return;
    }
    function resultRow(text, onClick) {
      var row = document.createElement('button'); row.textContent = text;
      row.style.cssText = 'display:block;width:100%;text-align:left;border:0;border-radius:6px;margin:1px 0;'
        + 'padding:5px 8px;color:#fff;cursor:pointer;background:#132436;font-size:12px;';
      row.addEventListener('click', onClick);
      resultsEl.appendChild(row);
    }
    rooms.forEach(function (r) {
      resultRow('Room · ' + (r.name || r.guid) + (r.storey ? ' · ' + r.storey : ''), function () { flyToZone(A, r.guid); });
    });
    people.forEach(function (o) {
      resultRow('Person · ' + o.name + (o.phone ? ' · ' + o.phone : ''), function () {
        var log = (A && A._hbaAttendanceLog) || [];
        var h = HBA();
        var sess = (h.A && h.A.sessions) ? h.A.sessions(log, period(A)) : [];
        var openSess = sess.filter(function (s) { return s.employee === o.name && s.open; })[0];
        if (openSess) flyToZone(A, openSess.zone);
        else console.log('§HBA_SEARCH ' + o.name + ' has no open session in this period (no zone to fly to)');
      });
    });
  }

  // the thin BROWSER renderer — a small drawer of the family entries; available → clickable, unavailable →
  // greyed (wake-aware), active → highlighted. §P10a (user 2026-07-02): close is DELIBERATE ONLY — the ✕
  // button or re-tapping the pill (familyActive() toggle); a row click activates its lens/pane and re-renders
  // the row list IN PLACE, it never removes the drawer. Persistent container + `_renderRows` inner rebuild (no
  // remove/recreate flicker). A top search box flies the camera to a match via the shared flyToZone. No node
  // path (returns if no document).
  function _renderRows(A, d, rowsEl) {
    _clear(rowsEl);
    availableLenses(A).forEach(function (e) {
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
      if (e.available) row.addEventListener('click', function () {
        activateLens(A, e);
        if (e.mode === 'presence') { if (isActive('presence')) openPresenceDrawer(A); else _closePresenceDrawer(); }
        if (e.mode === 'maintenance' && G.HBAIotPane) G.HBAIotPane.toggle(A);   // §P10b — tint stays, IoT sensor/CCTV/billing pane opens alongside
        _renderRows(A, d, rowsEl);                          // refresh highlight/badges — drawer stays open (§P10a point 2)
        if (A.markDirty) A.markDirty();
      });
      rowsEl.appendChild(row);
    });
  }
  function openFamilyDrawer(A) {
    if (typeof document === 'undefined') return null;
    var ex = document.getElementById('hba-fm-drawer'); if (ex) { ex.remove(); _closePresenceDrawer(); return null; }
    var d = document.createElement('div'); d.id = 'hba-fm-drawer';
    d.style.cssText = 'position:fixed;z-index:10000;right:64px;top:50%;transform:translateY(-50%);background:#0e1b2a;'
      + 'color:#fff;border-radius:10px;padding:8px;box-shadow:0 8px 28px rgba(0,0,0,.45);font:13px/1.3 system-ui,sans-serif;min-width:250px;';

    var hdr = document.createElement('div'); hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 4px 8px;';
    var title = document.createElement('span'); title.textContent = 'Human-Asset'; title.style.cssText = 'font-weight:700;opacity:.85;';
    var closeBtn = document.createElement('button'); closeBtn.textContent = '✕'; closeBtn.title = 'Close'; closeBtn.setAttribute('data-role', 'close');
    closeBtn.style.cssText = 'background:transparent;border:0;color:#fff;opacity:.6;cursor:pointer;font-size:14px;line-height:1;padding:2px 4px;';
    closeBtn.addEventListener('click', function () { d.remove(); _closePresenceDrawer(); });
    hdr.appendChild(title); hdr.appendChild(closeBtn);
    d.appendChild(hdr);

    var searchWrap = document.createElement('div'); searchWrap.style.cssText = 'padding:0 4px 8px;';
    var search = document.createElement('input'); search.type = 'text'; search.id = 'hba-fm-search';
    search.placeholder = 'Search room no / name / phone…';
    search.style.cssText = 'width:100%;box-sizing:border-box;background:#132436;color:#fff;border:1px solid #2b415a;'
      + 'border-radius:6px;padding:6px 8px;font:12px system-ui,sans-serif;';
    var results = document.createElement('div'); results.id = 'hba-fm-search-results'; results.style.cssText = 'margin-top:4px;';
    search.addEventListener('input', function () { _renderSearch(A, search.value, results); });
    searchWrap.appendChild(search); searchWrap.appendChild(results);
    d.appendChild(searchWrap);

    var rows = document.createElement('div'); rows.id = 'hba-fm-rows';
    d.appendChild(rows);
    _renderRows(A, d, rows);

    document.body.appendChild(d);
    console.log('§HBA_FM drawer open — ' + availableLenses(A).filter(function (x) { return x.available; }).length + '/' + FAMILY.length + ' lenses available');
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
    familyActive: familyActive, activateLens: activateLens, openFamilyDrawer: openFamilyDrawer, FAMILY: FAMILY, _ready: ready,
    flyToZone: flyToZone, openPresenceDrawer: openPresenceDrawer, closePresenceDrawer: _closePresenceDrawer,
    erpLink: erpLink, AD_WINDOWS: AD_WINDOWS,
    _regovern: _regovern, _buildingName: _buildingName, _ensureErpGovern: _ensureErpGovern,
    _consumeFindGuid: _consumeFindGuid };  // §STAGE2 / §2026-07-04c — witness hooks (additive)
  if (typeof module === 'object' && module.exports) { module.exports = G.HBALens; return; }   // node witness — no DOM gate

  // ---- DATA-GATE poll (mirrors viewer/wh_walk.js): flip the pill icons ON only when a lens detects ------
  // a real binding in the loaded building, then rebuild the pill. No data → icons stay hidden (no clutter).
  // §HBA_GATE_FIX (RESUME_OVERLAY_PILL_ICONS.md) — geometry streams incrementally; guidMap goes non-empty
  // long before every element has arrived (bbox-first flush order), so gating on "any keys" caught the model
  // half-streamed and settled the family list too early (observed: only [dash] available, FM never lit).
  // §2026-07-04c — consume the ERP→BIM reverse Zoom-Across's finer scope (viewer/config.js A.FIND_GUID, set
  // from ?find=<guid|employee-code>, erp/idempiere.html _zoomScope()). Two paths, neither fabricates a
  // position: (1) A.FIND_GUID resolves to a rendered mesh member → flyToZone flies directly (its own honest
  // no-op covers "no such member"); (2) it doesn't (a bare employee code, e.g. "EMP001", carries no rendered
  // guid) → resolve via that employee's OPEN attendance session zone — the SAME BIM-side view-trace fact the
  // erp/idempiere.html ad_user branch explicitly couldn't reach from ERP data alone (§2026-07-04c Gap 1) — and
  // fly there instead. An unresolvable code is logged, never silently dropped.
  function _consumeFindGuid(A) {
    if (!A || !A.FIND_GUID) return;
    var direct = flyToZone(A, A.FIND_GUID);
    if (direct.flew) { console.log('§HBA_FIND_GUID flew directly guid=' + A.FIND_GUID); return; }
    var h = HBA();
    var sess = (h.A && A._hbaAttendanceLog) ? h.A.sessions(A._hbaAttendanceLog, period(A)) : [];
    var open = sess.filter(function (s) { return s.employee === A.FIND_GUID && s.open; })[0];
    if (open && open.zone) {
      var viaAtt = flyToZone(A, open.zone);
      console.log('§HBA_FIND_GUID employee=' + A.FIND_GUID + ' → open session zone=' + open.zone + ' flew=' + viaAtt.flew);
    } else {
      console.log('§HBA_FIND_GUID no-op code=' + A.FIND_GUID + ' (not a rendered guid, no open attendance session)');
    }
  }

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
    _consumeFindGuid(A);       // §2026-07-04c — the reverse Zoom-Across's finer scope (viewer/config.js A.FIND_GUID)
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
