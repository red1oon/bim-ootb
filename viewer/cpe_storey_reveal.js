/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cpe_storey_reveal.js — §STOREY_HIGHLIGHT_REVEAL (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md,
// 2026-09-06 spec + addendum + mid-session user correction). Window is the LAST 5 REAL SECONDS of
// the `pullback` beat, ending exactly where the `orbit` beat begins (plan.beats.rise) — NOT the
// orbit beat itself (a first cut used beats.rise..1, corrected after the user clarified "final 5
// seconds ending before orbit" and a second feature — MEP_CLASH_REVEAL_MOVIE.md's discipline-pair
// clash highlight — claimed the rest of `pullback`). §CINEMA_PACING on a real Hospital bake: natural
// 195.8s = dive 7.9 + spin 0.0 + walk 75.0 + pullout 1.5 + flyback 19.8 + round2 56.0 + tail 10.0 +
// pullback 17.6 + orbit 8.0 — `plan.beats.rise` (fraction 0.9591) is the pullback→orbit boundary
// (effects.js's own `tR = tV + _riseFolded/_shapeTotal`, where the OWN comment names it "orbit
// start"); `plan.storeyReveal.windowFrac` (also computed in effects.js, from `_useSec.rise`, the
// UNFOLDED pullback seconds — not `_riseFolded`, which also contains the tail — so this window can
// never bleed into the tail's own disc-parade caption zone) is the fraction-width of the last 5s of
// that 17.6s pullback. This file fills exactly that narrow window: each storey highlights in
// sequence (a repeating blue/green/yellow/orange tint cycle) while a HUD card shows that storey's
// REAL door count (a complete elements_meta census — always shown, 0 is a genuine fact) and, only
// when the data genuinely exists, a labeled footprint-bbox estimate and a compiled room count
// (room count omitted at 0 — §VACUOUS convention, prompts/4D_MODEL_INTEGRITY.md §E: a 0 that means
// "not measured for this storey" is not a metric worth showing, unlike the door census's real 0s).
//
// NON-INVENT: every number in the stat card is a live query against A.db (elements_meta,
// element_transforms, spatial_structure) — nothing here is computed or guessed. The storey LIST
// itself is not baked into the plan; it is queried live and cached per building, same as
// cpe_room_title.js's own _storeyLadderForGroups().
//
// ONE PURE FUNCTION, TWO CALLERS (this lane's own established discipline — see cpeRevealVisualAt in
// effects.js): A.storeyRevealVisualAt(plan, tNorm) is read identically by the bake loop
// (cinema_maxq.js) and the editor's live preview tick (cinema_path_editor.js's _previewFly step()),
// so bake and preview can never disagree about which storey/color is active at a given film fraction.
function setupCpeStoreyReveal(A) {
  // Blue -> green -> yellow -> orange -> blue (repeats every 4 storeys) — the user's own words,
  // generalized past exactly 5 storeys since real buildings rarely have exactly 5 (Hospital has 8
  // countable levels once Ceiling/TOS pseudo-storeys are excluded — see storeyRevealList below).
  var COLORS = [0x2979ff, 0x00c853, 0xffd600, 0xff6d00];   // blue, green, yellow, orange
  var EMOJI  = ['🔵', '🟢', '🟡', '🟠'];  // 🔵 🟢 🟡 🟠
  // Fade in/out fraction of each storey's own slot — same shape as cpe_resource_panel.js's
  // A.bigStatsAt fade (`min(u,1-u)/0.12`), slightly wider here because a slot can be sub-second
  // (see the spec addendum's dwell-scaling note) and a hard cut reads worse than a fast crossfade.
  var FADE_FRAC = 0.15;
  // §STOREY_REVEAL_FIT (2026-09-06, user ruling: "HUD cards for the last part is at best effort.
  // Been too fast is fine. Need not add more secs to it. We can forego top floors if the time frame
  // does not allow. Qualitative above quantitative.") — the window is FIXED at 5 real seconds and is
  // never widened to fit more storeys. Instead the sequence is TRUNCATED so each storey it does show
  // gets at least MIN_SLOT_SEC of screen time. Hospital measures 8 physical storeys; at 5s that would
  // be 0.63s each, of which FADE_FRAC eats 30% — a colour strobe, not a readable card. Capped at
  // 1.0s minimum the sequence shows the BOTTOM 5 (which is also exactly the blue/green/yellow/orange/
  // blue cycle originally asked for). Dropped from the TOP, per the user's own "forego top floors":
  // the lower storeys are the ones the camera has actually been inside during the film.
  var MIN_SLOT_SEC = 1.0;

  // §STOREY_REVEAL_LIST — the real, ordered set of physical storeys. Excludes ' Ceiling'/' TOS'
  // pseudo-storeys and 'Unknown' (same exclusion elements_meta's own storey column needs elsewhere,
  // e.g. cpe_resource_panel.js's NOT_PLACEHOLDER guard) so the sequence names only storeys a BIM user
  // would call a storey. Ordered by mean element Z — the same real-Z-ladder cpe_room_title.js's
  // _storeyLadderForGroups() already builds (not re-derived differently here; this is a query against
  // the same two tables, kept local because that function is private to cpe_room_title.js).
  var _list = null, _listKey = null;
  A.storeyRevealList = function () {
    var key = (A.activeBuilding || A.currentBuilding || 'bld') + '|' + (A._metaGen || 0);
    if (_list && _listKey === key) return _list;
    var rows = [];
    try {
      rows = A.dbQuery(
        "SELECT m.storey, AVG(COALESCE(t.center_z,0)) FROM elements_meta m " +
        "JOIN element_transforms t ON t.guid=m.guid " +
        "WHERE m.storey IS NOT NULL AND m.storey NOT IN ('','Unknown') " +
        "AND m.storey NOT LIKE '% Ceiling' AND m.storey NOT LIKE '% TOS' " +
        "GROUP BY m.storey");
    } catch (e) { rows = []; }
    _list = (rows || []).map(function (r) { return { name: String(r[0]), z: +r[1] }; });
    _list.sort(function (a, b) { return a.z - b.z; });
    _listKey = key;
    console.log('§STOREY_REVEAL_LIST n=' + _list.length +
      ' storeys=[' + _list.map(function (s) { return s.name; }).join(',') + ']' +
      (_list.length ? '' : ' — VACUOUS: no non-pseudo storey found, reveal will stay off'));
    return _list;
  };

  // §STOREY_REVEAL_STATS — real per-storey queries, cached per (building, storey name). Door count is
  // a COMPLETE census (elements_meta covers every element) so 0 is shown as a genuine fact; footprint
  // is a labeled bbox ESTIMATE (max IfcSlab bbox_x/bbox_y on that storey, same proxy + caveat
  // MEP_CLASH_REVEAL_MOVIE.md's §STOREY_HIGHLIGHT_REVEAL spec already names for the slab footprint);
  // room count comes from the injected/compiled spatial_structure rows (ROOM_INJECTOR_NEEDLE.md) and
  // is OMITTED from the card at 0 — a 0 there means "no room compiled for this storey", not "measured
  // zero rooms", the §VACUOUS distinction the spec addendum draws out explicitly.
  var _stats = {}, _statsKey = null;
  A.storeyRevealStatsFor = function (name) {
    var bkey = (A.activeBuilding || A.currentBuilding || 'bld');
    if (_statsKey !== bkey) { _stats = {}; _statsKey = bkey; }
    if (_stats[name]) return _stats[name];
    var doorCount = 0, bx = null, by = null, roomCount = 0;
    var d = A.dbQueryFirst("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcDoor' AND storey=?", [name]);
    if (d && d[0] != null) doorCount = +d[0];
    var f = A.dbQueryFirst(
      "SELECT MAX(et.bbox_x), MAX(et.bbox_y) FROM elements_meta em " +
      "JOIN element_transforms et ON em.guid=et.guid " +
      "WHERE em.ifc_class='IfcSlab' AND em.storey=?", [name]);
    if (f && f[0] != null && f[1] != null) { bx = +f[0]; by = +f[1]; }
    var r = A.dbQueryFirst(
      "SELECT COUNT(*) FROM spatial_structure sp " +
      "JOIN spatial_structure bs ON bs.guid=sp.parent_guid AND bs.type='IfcBuildingStorey' " +
      "WHERE sp.type='IfcSpace' AND bs.name=?", [name]);
    if (r && r[0] != null) roomCount = +r[0];
    var out = { doorCount: doorCount, bx: bx, by: by, roomCount: roomCount };
    _stats[name] = out;
    console.log('§STOREY_REVEAL_STATS storey="' + name + '" doors=' + doorCount +
      ' footprint=' + (bx != null ? bx.toFixed(1) + 'x' + by.toFixed(1) + 'm(estimate,IfcSlab bbox)' : 'n/a') +
      ' rooms=' + roomCount + (roomCount === 0 ? ' (0 — VACUOUS, card omits the room clause)' : ' compiled'));
    return out;
  };

  // §STOREY_REVEAL_FIT — the storeys this plan actually has room to show, longest-readable-first.
  // DEGRADE, DON'T DISABLE: with no durationSec on the plan (an older cached plan) the window's real
  // seconds are unknowable, so the full list is used unchanged — the previous behaviour, never a
  // silent empty sequence. Logged once per (plan, list) so a truncation is never invisible.
  var _fitLogged = null;
  function _fitList(plan, sr) {
    var full = A.storeyRevealList();
    if (!full.length) return full;
    var winSec = (plan && plan.durationSec > 0) ? sr.windowFrac * plan.durationSec : 0;
    if (!(winSec > 0)) return full;
    var room = Math.max(1, Math.floor(winSec / MIN_SLOT_SEC));
    var out = (full.length > room) ? full.slice(0, room) : full;
    var key = full.length + '/' + out.length + '/' + winSec.toFixed(2);
    if (_fitLogged !== key) {
      _fitLogged = key;
      console.log('§STOREY_REVEAL_FIT windowSec=' + winSec.toFixed(2) + ' minSlotSec=' + MIN_SLOT_SEC +
        ' storeysAvailable=' + full.length + ' shown=' + out.length +
        ' slotSec=' + (winSec / out.length).toFixed(2) +
        (out.length < full.length
          ? ' TRUNCATED dropped=[' + full.slice(out.length).map(function (x) { return x.name; }).join(',') +
            '] (top floors foregone — window is fixed, best effort)'
          : ' (all storeys fit)'));
    }
    return out;
  }

  // §STOREY_REVEAL_VISUAL — pure function of (plan, tNorm). CORRECTED WINDOW (user, 2026-09-06,
  // relayed mid-session): NOT the orbit beat (beats.rise..1) — the LAST `plan.storeyReveal.windowFrac`
  // of the PRECEDING `pullback` beat, ending exactly at beats.rise (orbit start). `windowFrac` is
  // precomputed at plan-build time (effects.js §STOREY_REVEAL_WINDOW, from the real `pullback`
  // seconds measured off §CINEMA_PACING) so this function never needs the film's total seconds.
  // Null everywhere outside that narrow window or when the flag/list is absent — DEGRADE, DON'T
  // DISABLE: an older cached plan with no `storeyReveal` field simply never enters this branch, same
  // contract §CPE_GHOST_GROUND/§CPE_DISCIPLINE_REVEAL already hold themselves to.
  A.storeyRevealVisualAt = function (plan, tNorm) {
    var b = plan && plan.beats, sr = plan && plan.storeyReveal;
    if (!plan || !sr || !sr.on || !(sr.windowFrac > 0) || !b || !(b.rise > 0) || !(b.rise < 1)) return null;
    var winStart = b.rise - sr.windowFrac;
    if (tNorm == null || tNorm <= winStart || tNorm > b.rise) return null;
    var list = _fitList(plan, sr);
    if (!list.length) return null;
    var span = sr.windowFrac;
    var w = Math.min(0.999999, Math.max(0, (tNorm - winStart) / span));   // 0..1 across the whole window
    var slot = 1 / list.length;
    var idx = Math.min(list.length - 1, Math.floor(w / slot));
    var u = (w - idx * slot) / slot;                                     // 0..1 within this storey's slot
    var opacity = Math.max(0, Math.min(1, Math.min(u, 1 - u) / FADE_FRAC));
    return { idx: idx, n: list.length, storey: list[idx].name,
             color: COLORS[idx % COLORS.length], emoji: EMOJI[idx % EMOJI.length],
             u: u, opacity: opacity };
  };

  // §STOREY_REVEAL_CAPTION — replaces the room-title/disc-parade caption for exactly this window;
  // returns null everywhere else so the normal room-title lookup (or the disc-parade override, which
  // by construction never overlaps this window — it lives entirely inside b.reveal..b.rise) runs
  // untouched. Drawn through the SAME A.roomTitleCompositeOntoCanvas the bake/preview already use —
  // no new text-rendering code (cpe_room_title.js header's own rule: one draw routine, WYSIWYG).
  var _lastLoggedIdx = null;
  A.storeyRevealCaptionAt = function (plan, tNorm) {
    var vis = A.storeyRevealVisualAt(plan, tNorm);
    if (!vis) { _lastLoggedIdx = null; return null; }
    if (_lastLoggedIdx !== vis.idx) {
      _lastLoggedIdx = vis.idx;
      console.log('§STOREY_REVEAL_TIMING storey=' + vis.storey.replace(/\s+/g, '_') +
        ' idx=' + vis.idx + '/' + vis.n + ' tNorm=' + tNorm.toFixed(4) +
        ' color=#' + vis.color.toString(16).padStart(6, '0'));
    }
    return { name: vis.emoji + ' ' + vis.storey, opacity: vis.opacity };
  };

  // §STOREY_REVEAL_STATCARD — shaped exactly like cpe_resource_panel.js's `shown` (the `A.tailPanelAt`
  // return value), so it composites through the SAME A.bigStatsCompositeOntoCanvas the highlight-cards
  // rotation already uses — including that function's own progress dots, which double for free as
  // "storey N of M" here. Replaces the normal highlight-card rotation for this window only (the
  // caller nulls the normal statInfo/resInfo when this returns non-null — see cinema_maxq.js).
  A.storeyRevealStatCardAt = function (plan, tNorm) {
    var vis = A.storeyRevealVisualAt(plan, tNorm);
    if (!vis) return null;
    var st = A.storeyRevealStatsFor(vis.storey);
    var subParts = [];
    if (st.bx != null) subParts.push(st.bx.toFixed(1) + '×' + st.by.toFixed(1) + ' m footprint (estimate)');
    if (st.roomCount > 0) subParts.push(st.roomCount + ' room' + (st.roomCount === 1 ? '' : 's') + ' compiled');
    var card = { big: String(st.doorCount), label: 'doors · ' + vis.storey };
    if (subParts.length) card.sub = subParts.join(' · ');
    return { card: card, idx: vis.idx, n: vis.n, opacity: vis.opacity };
  };

  // ══ 3D "lights up" tint — the actual per-storey glow. Mirrors hba_lens.js's proven MeshPort
  // pattern verbatim (setColorAt/getColorAt for Instanced/BatchedMesh diffuse, emissive save/restore
  // for regular meshes, a touched[] list for exact restore) rather than inventing a second tint
  // mechanism — see MEP_CLASH_REVEAL_MOVIE.md's addendum for why this was chosen over a fork of
  // A.filterStorey's hide/show (isolating would hide the "shine THROUGH the whole building" read the
  // spec asks for; a tint keeps the whole building visible while one storey glows the cycle color).
  var _C = (typeof THREE !== 'undefined' && THREE.Color) ? new THREE.Color() : null;
  var _touched = [], _curIdx = null;
  function _restoreTint() {
    _touched.forEach(function (s) {
      if (s.inst != null && s.m.instanceColor && _C) { s.m.setColorAt(s.inst, _C.setHex(s.c)); s.m.instanceColor.needsUpdate = true; }
      else if (s.batch != null && s.m.setColorAt && _C) { try { s.m.setColorAt(s.batch, _C.setHex(s.c)); } catch (e) {} }
      else if (s.e != null && s.m.material && s.m.material.emissive) s.m.material.emissive.setHex(s.e);
    });
    _touched = [];
  }
  function _applyTint(storeyName, hex) {
    if (!_C) return 0;   // node-without-THREE (witness harness) — visual is inert, pacing still testable
    var n = 0;
    // Regular meshes — EXACT same predicate panels.js's A.filterStorey uses (§NAV_FIND_002), so this
    // can never pick up an Instanced/BatchedMesh container by accident (those do not carry a single
    // userData.storey — their per-instance storey lives in A._instanceMeta/_batchMeta instead).
    A.collectMeshes(function (o) { return o.isMesh && o.userData.storey === storeyName; }).forEach(function (o) {
      if (o.material && o.material.emissive) {
        _touched.push({ m: o, e: o.material.emissive.getHex() });
        o.material.emissive.setHex(hex); n++;
      }
    });
    A.collectMeshes(function (o) { return o.isInstancedMesh; }).forEach(function (mesh) {
      var meta = A._instanceMeta && A._instanceMeta[mesh.id];
      if (!meta || !mesh.setColorAt) return;
      var any = false;
      for (var i = 0; i < meta.length; i++) {
        if (meta[i].storey !== storeyName) continue;
        var had = !!mesh.instanceColor, prev = 0xffffff;
        if (had) { mesh.getColorAt(i, _C); prev = _C.getHex(); }
        _touched.push({ m: mesh, inst: i, c: prev });
        mesh.setColorAt(i, _C.setHex(hex)); n++; any = true;
      }
      if (any && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    A.collectMeshes(function (o) { return o.isBatchedMesh; }).forEach(function (mesh) {
      var meta = A._batchMeta && A._batchMeta[mesh.id];
      if (!meta || !mesh.setColorAt) return;
      for (var i = 0; i < meta.length; i++) {
        if (meta[i].storey !== storeyName) continue;
        var pb = 0xffffff;
        try { mesh.getColorAt(meta[i].slotId, _C); pb = _C.getHex(); } catch (e) {}
        _touched.push({ m: mesh, batch: meta[i].slotId, c: pb });
        try { mesh.setColorAt(meta[i].slotId, _C.setHex(hex)); n++; } catch (e2) {}
      }
    });
    console.log('§STOREY_REVEAL_TINT storey="' + storeyName + '" color=#' + hex.toString(16).padStart(6, '0') +
      ' meshesTouched=' + n);
    return n;
  }
  // Called every frame by the bake loop and the preview tick (one pure-ish function, two callers —
  // "pure-ish" because it mutates scene material state, exactly the same contract
  // A.cpeRevealApplyVisual already keeps). `plan`=null (any tNorm) forces a restore-and-exit, the
  // same explicit "force restore" signal cpeRevealApplyVisual(null,0) already uses at every bake/
  // preview exit path.
  A.storeyRevealApplyVisual = function (plan, tNorm) {
    var vis = plan ? A.storeyRevealVisualAt(plan, tNorm) : null;
    var key = vis ? vis.idx : null;
    if (key === _curIdx) return;
    _restoreTint();
    _curIdx = key;
    if (vis) _applyTint(vis.storey, vis.color);
  };
}
if (typeof window !== 'undefined') window.setupCpeStoreyReveal = setupCpeStoreyReveal;
