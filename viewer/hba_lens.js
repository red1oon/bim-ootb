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
  function HBA() { return { O: G.HbaOverlay, B: G.HbaBinding, M: G.HbaModels, L: G.HbaLens }; }
  function ready() { var h = HBA(); return !!(h.O && h.B && h.M); }

  // hex '#2e7d32' | int → int for THREE emissive.setHex
  function toHex(c) { return (typeof c === 'string') ? parseInt(c.replace('#', ''), 16) : c; }

  // ---- the MeshPort: the §RESUME NEXT#2 "MeshPort hook to APP.guidMap" -------------------------------
  // Real impl of the port the overlay engine drives: { allGuids, setTint, setGhost, restoreAll }.
  // A.guidMap is meshId→guid (guids are VALUES; instanced meshes carry `_N` keys) — verified 2026-06-30.
  function buildMeshPort(A, opts) {
    opts = opts || {};
    var touched = [];                                   // [{m, e?, o?, t?}] — saved originals for full restore
    function meshes() { return A.collectMeshes(function (o) { return o.isMesh; }); }
    function meshesFor(guid) {
      var out = []; meshes().forEach(function (obj) { if (A.guidMap[obj.id] === guid) out.push(obj); }); return out;
    }
    return {
      allGuids: function () {
        var s = {}; meshes().forEach(function (obj) { var g = A.guidMap[obj.id]; if (g) s[g] = 1; }); return Object.keys(s);
      },
      setTint: function (guid, color) {
        var hex = toHex(color);
        meshesFor(guid).forEach(function (m) {
          if (m.material && m.material.emissive) { touched.push({ m: m, e: m.material.emissive.getHex() }); m.material.emissive.setHex(hex); }
        });
      },
      // ghost = de-emphasise the rest. DEFAULT OFF for the first live wire: materials are often SHARED across
      // meshes (instanced/merged) so a blind opacity mutation can over-ghost — enable via opts.ghost once
      // visually verified. The engine still iterates every non-linked guid; this is a safe visual no-op.
      setGhost: function (guid) {
        if (!opts.ghost) return;
        meshesFor(guid).forEach(function (m) {
          if (m.material) { touched.push({ m: m, o: m.material.opacity, t: m.material.transparent }); m.material.transparent = true; m.material.opacity = 0.12; }
        });
      },
      restoreAll: function () {
        touched.forEach(function (s) {
          if (s.e != null && s.m.material && s.m.material.emissive) s.m.material.emissive.setHex(s.e);
          if (s.o != null && s.m.material) { s.m.material.opacity = s.o; s.m.material.transparent = s.t; }
        });
        touched = [];
        if (A.markDirty) A.markDirty();
      }
    };
  }

  var _port = null, _active = null;   // current MeshPort + active mode ('tenancy'|'maintenance'|null)

  // detect = the DATA GATE (§BINDING activation): does ANY HBA record of this lens resolve to a real guid
  // in the loaded building? Drives whether the pill icon appears at all (no data → no icon, no clutter).
  function detect(A, mode) {
    if (!ready() || !A || !A.guidMap) return false;
    var h = HBA(), recs = mode === 'maintenance' ? h.M.records('Asset') : h.M.records('Tenancy');
    var field = mode === 'maintenance' ? 'bim_guid' : 'unit_guid';
    for (var i = 0; i < recs.length; i++) if (h.B.resolveGuid(recs[i][field], A.guidMap)) return true;
    return false;
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
    if (_active === mode) { _active = null; console.log('§HBA_LENS off mode=' + mode); if (A.markDirty) A.markDirty(); return false; }
    var h = HBA();
    var plan = h.O.computeOverlay(mode, period(A), { knownGuids: A.guidMap });   // non-invent gate
    _port = buildMeshPort(A, { ghost: false });
    var n = h.O.applyOverlay(_port, plan);
    _active = mode;
    if (A.status) A.status.textContent = 'HR · ' + mode + ' · ' + n + ' unit' + (n === 1 ? '' : 's') + ' lit' + (plan.unlinked.length ? ' (' + plan.unlinked.length + ' un-linked)' : '');
    console.log('§HBA_LENS on mode=' + mode + ' lit=' + n + ' unlinked=' + plan.unlinked.length + ' linked=[' + plan.linked.join(',') + ']');
    if (A.markDirty) A.markDirty();
    return true;
  }

  function isActive(mode) { return _active === mode; }

  G.HBALens = { detect: detect, toggle: toggle, isActive: isActive, buildMeshPort: buildMeshPort, _ready: ready };
  if (typeof module === 'object' && module.exports) { module.exports = G.HBALens; return; }   // node witness — no DOM gate

  // ---- DATA-GATE poll (mirrors viewer/wh_walk.js): flip the pill icons ON only when a lens detects ------
  // a real binding in the loaded building, then rebuild the pill. No data → icons stay hidden (no clutter).
  var _tries = 0, _poll = setInterval(function () {
    _tries++;
    var A = G.APP || G.A;
    // guidMap fills as geometry streams — wait for it (and for the HBA engine to have loaded).
    var hasMesh = A && A.guidMap && Object.keys(A.guidMap).length > 0;
    if (!ready() || !hasMesh) { if (_tries > 240) { clearInterval(_poll); console.warn('§HBA_GATE timeout — engine/guidMap not ready'); } return; }
    clearInterval(_poll);
    var acts = G._mainPillActions || [], on = { hbaTenancy: detect(A, 'tenancy'), hbaIot: detect(A, 'maintenance') };
    var any = false;
    for (var i = 0; i < acts.length; i++) {
      if (on.hasOwnProperty(acts[i].id)) { acts[i].pill = on[acts[i].id] ? undefined : false; if (on[acts[i].id]) any = true; }
    }
    if (any && A._buildPill) A._buildPill();
    console.log('§HBA_GATE tenancy=' + (on.hbaTenancy ? 'on' : 'off') + ' iot=' + (on.hbaIot ? 'on' : 'off')
      + ' (guidMap=' + Object.keys(A.guidMap).length + ')');
  }, 500);
})();
