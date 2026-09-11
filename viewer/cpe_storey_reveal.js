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
  // Fraction of each storey's slot the tint is actually LIT (the rest is the dark rest phase above).
  var LIT_FRAC = 0.72;

  // §STOREY_REVEAL_LIST — the real, ordered set of physical storeys. Excludes ' Ceiling'/' TOS'
  // pseudo-storeys and 'Unknown' (same exclusion elements_meta's own storey column needs elsewhere,
  // e.g. cpe_resource_panel.js's NOT_PLACEHOLDER guard) so the sequence names only storeys a BIM user
  // would call a storey. Ordered by mean element Z — the same real-Z-ladder cpe_room_title.js's
  // _storeyLadderForGroups() already builds (not re-derived differently here; this is a query against
  // the same two tables, kept local because that function is private to cpe_room_title.js).
  // §STOREY_REVEAL_REAL_STOREYS_ONLY (2026-09-11, MEP_CLASH_REVEAL_MOVIE.md §60.1 — user: the reveal
  // highlights are "still not satisfactory"). The three string filters above are NECESSARY but not
  // SUFFICIENT: `elements_meta.storey` is a free-text label an exporter writes per element, not the
  // IFC spatial hierarchy. MEASURED on the canonical ~/Downloads/HHS_Office_Federated_silent.db —
  // `spatial_structure` holds exactly 3 `IfcBuildingStorey` rows (Level 1/2/3) while `elements_meta`
  // also carries `storey='Roof Level'` on 45 elements (22 IfcFlowSegment, 10 IfcFlowFitting, 7
  // IfcSlab, 5 IfcBuildingElementProxy, 1 IfcEnergyConversionDevice — ZERO walls, ZERO doors, ZERO
  // IfcSpace, no storey_walkable_raster row). That is rooftop MEP, not an occupiable storey, and it
  // was taking a full reveal slot: on the 2026-09-11 HHS bake that is 1.01s of a 4.03s window (25%)
  // spent on `§STOREY_REVEAL_TINT storey="Roof Level" meshesTouched=0` — a card reading "0 doors"
  // over a building with nothing lit (0 tinted pixels on screen, every frame of the slot, measured).
  // It also silently defeated §STOREY_REVEAL_LAST_STAYS_LIT, whose whole purpose is that the window
  // must not END dark: the storey it kept "lit" lit nothing.
  // So: intersect with the names the model ITSELF calls `IfcBuildingStorey`. Same table/type predicate
  // cpe_storey_reveal.js's own room-count query already trusts (`bs.type='IfcBuildingStorey'` in
  // storeyRevealStatsFor below) — EXTRACT, don't invent a second notion of "is a storey".
  // DEGRADE, DON'T DISABLE, twice over: a DB whose `spatial_structure` declares NO storey at all (an
  // older export) keeps the pre-fix list untouched, and a cross-check that would empty the list
  // entirely (label/name drift between the two tables) is REFUSED and falls back to the full list —
  // a silent zero-storey reveal is never an acceptable outcome of a filter. Both cases are logged.
  // CROSS-BUILDING SAFETY, checked before writing this: ~/Downloads/Hospital_silent.db declares 64
  // `IfcBuildingStorey` rows covering Level 1..7A, so every storey Hospital shows today survives.
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
    var all = (rows || []).map(function (r) { return { name: String(r[0]), z: +r[1] }; });
    all.sort(function (a, b) { return a.z - b.z; });
    var declared = null;
    try {
      var sr = A.dbQuery(
        "SELECT name FROM spatial_structure WHERE type='IfcBuildingStorey' " +
        "AND name IS NOT NULL AND name <> ''") || [];
      if (sr.length) { declared = {}; sr.forEach(function (r) { declared[String(r[0])] = true; }); }
    } catch (eS) { declared = null; }
    var dropped = [], note = '';
    if (declared) {
      var kept = all.filter(function (s) {
        if (declared[s.name]) return true;
        dropped.push(s.name); return false;
      });
      if (kept.length) { _list = kept; }
      else {
        _list = all; dropped = [];
        note = ' — CROSS-CHECK REFUSED: spatial_structure declares storeys but none matches an' +
               ' elements_meta storey label (name drift); keeping the full list rather than' +
               ' emptying the reveal';
      }
    } else {
      _list = all;
      note = ' (spatial_structure declares no IfcBuildingStorey — no cross-check, pre-§60.1 behaviour)';
    }
    _listKey = key;
    console.log('§STOREY_REVEAL_LIST n=' + _list.length +
      ' storeys=[' + _list.map(function (s) { return s.name; }).join(',') + ']' +
      (dropped.length ? ' dropped=[' + dropped.join(',') + ']' +
        ' (§60.1 — labelled on elements but NOT an IfcBuildingStorey in spatial_structure,' +
        ' so not a reveal slot)' : '') + note +
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
    // §37.1 (MEP_CLASH_REVEAL_MOVIE.md W6) — the walkable area, from the same storey_walkable_raster §29's hall uses:
    // mesh-derived, absent from the IFC, the figure a BIM audience leans in at. null when the storey has no raster.
    var walk = null;
    try {
      var FM = window.FlythruMaths, SR = window.StoreyRaster;
      if (FM && SR && typeof A.dbQuery === 'function') {
        var wr = A.dbQuery('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster WHERE storey=?', [name]) || [];
        if (wr.length) walk = FM.ftRasterArea(SR.fromRow(wr[0]));
      }
    } catch (eW) { walk = null; }
    var out = { doorCount: doorCount, bx: bx, by: by, roomCount: roomCount, walk: walk };
    _stats[name] = out;
    console.log('§STOREY_REVEAL_STATS storey="' + name + '" doors=' + doorCount +
      ' walkable=' + (walk != null ? walk.toFixed(0) + 'm2 (storey_walkable_raster)' : 'n/a (no raster — clause omitted)') +
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
    // §STOREY_REVEAL_PULSE (2026-09-06, user: "it should be shine thru and then cease, not persist")
    // — each storey OWNS its slot but only GLOWS for the first LIT_FRAC of it; the tail of the slot is
    // dark, so the sequence reads as a series of separate pulses instead of one colour handing
    // straight over to the next with the building never returning to rest. The card/caption keep
    // running through the dark part (the stats are what the beat is for), only the 3D tint ceases.
    // §STOREY_REVEAL_LAST_STAYS_LIT (2026-09-10, user: "at the end of highlight it seems to color
    // dark over whole building or parts. IT should not, or retain its coloring to original.") — the
    // §STOREY_REVEAL_PULSE cease-per-slot above is right for storey N handing over to storey N+1 (a
    // dark beat reads as a beat, not a fault), but the LAST storey has no next colour to hand over to
    // — its own dark tail was the whole building sitting in the x-ray wash with nothing lit, right
    // before the hard cut to orbit. The final storey simply never enters its dark phase, so the glow
    // (and the x-ray shine-through it needs) carries straight through to the window's end.
    var isLast = idx === list.length - 1;
    return { idx: idx, n: list.length, storey: list[idx].name,
             color: COLORS[idx % COLORS.length], emoji: EMOJI[idx % EMOJI.length],
             u: u, opacity: opacity, dark: (!isLast && u > LIT_FRAC) };
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
    if (st.walk != null && st.walk > 0) subParts.push('walkable ' + Math.round(st.walk).toLocaleString('en-US') + ' m²');   // §37.1 — first, it is the figure the IFC lacks
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
  var _touched = [], _curIdx = null, _clones = [];

  // §FACADE_ONLY_TINT (2026-09-10, user: "Yes. My original request prior" — confirming: tint just
  // the storey's FACADE, no x-ray, no dimming, no see-through of the rest of the building). An
  // orbiting exterior camera already sees a storey's exterior wall directly — nothing needs to
  // become transparent for that. NON-INVENT: facade membership is a live geometric test (does the
  // wall's own bbox touch the building's own overall footprint boundary), not a guessed IFC flag —
  // this DB has no IsExternal property to read (checked: 0 hits for IsExternal/is_external in the
  // whole viewer). Reuses the SAME structural-class set flythruDatumBuild's own footprint query uses,
  // so the "outer edge" this measures against is the one already accepted as this building's extent.
  var _facadeGuids = {}, _facadeKey = null;
  // §FACADE_RASTER_BOUNDARY (2026-09-11, user: "still not highlighting much to be seen" — §55.6/
  // §56.2/§57.2, reinforced three times) — MEASURED DEFECT #3 with the AABB-edge method below: even
  // after §FACADE_PER_STOREY_FIX and §FACADE_WALL_ONLY_FOOTPRINT, it only ever catches walls sitting
  // flush with the storey's own bounding RECTANGLE's four flat sides — on Hospital's real (tapering,
  // non-rectangular) footprint this measured 1.8-8.4% of a main floor's own wall AREA (Level 1: 3
  // walls / 260 m² of 14,328 m²) — a bounding box is a poor proxy for an irregular perimeter.
  // FIX: reuse `storey_walkable_raster` (§29's own hall raster, already built and shipped — EXTRACT,
  // don't invent a second geometry pass) to find the TRUE walkable/outside boundary. Flood-fill the
  // raster's NON-walkable cells starting from the grid's own border (standard "outside vs enclosed
  // hole" technique) to separate genuine exterior void from interior voids (shafts, wall cores) —
  // then a wall is facade if a small neighbourhood (±FACADE_RASTER_MARGIN cells) around its centre
  // touches BOTH a walkable cell and an "outside" cell, i.e. it sits exactly on that boundary.
  // MEASURED (Hospital, offline replay of this exact algorithm before shipping it): Level 1
  // 3->27 walls / 260->2,673 m² (1.8%->18.7%), Level 3 10->23 walls (8.4%->7.7% area, same order —
  // MORE of the true perimeter, spread across more, smaller real segments). Level 7 (a tiny
  // penthouse) REGRESSED on its own (78.3%->19.7%) — its raster reads ~60% "walkable" over a grid
  // far larger than the room itself, a data quirk in that one storey's raster, not a bug in this
  // algorithm — so the two methods are UNIONED, never one replacing the other: this can only ADD
  // real coverage the AABB method misses, and can never lose coverage the AABB method already had,
  // regardless of a given storey's raster quality. DEGRADE, DON'T DISABLE: no raster for a storey
  // (or no window.StoreyRaster loaded) falls back to the AABB method alone, byte-identical to before.
  var FACADE_RASTER_MARGIN = 2;   // cells either side of a wall's centre (~0.5m at the shipped 0.25m res)
  function _facadeAabbEdgeGuids(storeyName) {
    var set = {};
    var TOL = 0.5;   // metres — construction tolerance only, now that the footprint is wall-derived
    var rows = A.dbQuery(
      "WITH footprint AS (" +
      "  SELECT MIN(t.center_x-t.bbox_x/2) minX, MAX(t.center_x+t.bbox_x/2) maxX," +
      "         MIN(t.center_y-t.bbox_y/2) minY, MAX(t.center_y+t.bbox_y/2) maxY" +
      "  FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid" +
      "  WHERE m.storey=? AND m.ifc_class IN ('IfcWall','IfcWallStandardCase','IfcCurtainWall')" +
      ")" +
      "SELECT m.guid FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid, footprint f " +
      "WHERE m.storey=? AND m.ifc_class IN ('IfcWall','IfcWallStandardCase','IfcCurtainWall') AND (" +
      "  ABS((t.center_x-t.bbox_x/2)-f.minX) < ? OR ABS((t.center_x+t.bbox_x/2)-f.maxX) < ? OR" +
      "  ABS((t.center_y-t.bbox_y/2)-f.minY) < ? OR ABS((t.center_y+t.bbox_y/2)-f.maxY) < ?" +
      ")", [storeyName, storeyName, TOL, TOL, TOL, TOL]) || [];
    rows.forEach(function (r) { set[r[0]] = true; });
    return set;
  }
  function _outsideMaskFor(raster) {
    var SR = window.StoreyRaster, cols = raster.cols, rows = raster.rows;
    var outside = new Uint8Array(cols * rows), q = [];
    function tryPush(c, r) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      var idx = r * cols + c;
      if (outside[idx] || SR.getBit(raster.bits, cols, c, r)) return;   // walkable — not "outside"
      outside[idx] = 1; q.push([c, r]);
    }
    for (var c = 0; c < cols; c++) { tryPush(c, 0); tryPush(c, rows - 1); }
    for (var r = 0; r < rows; r++) { tryPush(0, r); tryPush(cols - 1, r); }
    var head = 0;
    while (head < q.length) { var p = q[head++]; tryPush(p[0] + 1, p[1]); tryPush(p[0] - 1, p[1]); tryPush(p[0], p[1] + 1); tryPush(p[0], p[1] - 1); }
    return outside;
  }
  function _facadeRasterGuids(storeyName, raster) {
    var SR = window.StoreyRaster, set = {};
    var outside = _outsideMaskFor(raster);
    var walls = A.dbQuery(
      "SELECT m.guid, t.center_x, t.center_y FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.storey=? AND m.ifc_class IN ('IfcWall','IfcWallStandardCase','IfcCurtainWall')", [storeyName]) || [];
    walls.forEach(function (w) {
      var guid = w[0], cx = +w[1], cy = +w[2];
      var cc = Math.floor((cx - raster.x0) / raster.res), rr = Math.floor((cy - raster.y0) / raster.res);
      var hasWalkable = false, hasOutside = false;
      for (var dr = -FACADE_RASTER_MARGIN; dr <= FACADE_RASTER_MARGIN && !(hasWalkable && hasOutside); dr++) {
        for (var dc = -FACADE_RASTER_MARGIN; dc <= FACADE_RASTER_MARGIN && !(hasWalkable && hasOutside); dc++) {
          var c = cc + dc, r = rr + dr;
          if (c < 0 || r < 0 || c >= raster.cols || r >= raster.rows) { hasOutside = true; continue; }
          if (SR.getBit(raster.bits, raster.cols, c, r)) hasWalkable = true;
          else if (outside[r * raster.cols + c]) hasOutside = true;
        }
      }
      if (hasWalkable && hasOutside) set[guid] = true;
    });
    return set;
  }
  function _facadeGuidsFor(storeyName) {
    var bkey = (A.activeBuilding || A.currentBuilding || 'bld');
    if (_facadeKey !== bkey) { _facadeGuids = {}; _facadeKey = bkey; }
    if (_facadeGuids[storeyName]) return _facadeGuids[storeyName];
    var set = {}, aabbN = 0, rasterN = 0, method = 'aabb-only';
    try {
      var aabbSet = _facadeAabbEdgeGuids(storeyName);
      aabbN = Object.keys(aabbSet).length;
      Object.keys(aabbSet).forEach(function (g) { set[g] = true; });
      var SR = window.StoreyRaster;
      if (SR && typeof SR.getBit === 'function') {
        var wr = A.dbQuery('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster WHERE storey=?', [storeyName]) || [];
        if (wr.length) {
          var rasterSet = _facadeRasterGuids(storeyName, SR.fromRow(wr[0]));
          rasterN = Object.keys(rasterSet).length;
          Object.keys(rasterSet).forEach(function (g) { set[g] = true; });
          method = 'aabb-union-raster';
        }
      }
    } catch (e) { console.log('§FACADE_ONLY_TINT query failed for storey="' + storeyName + '": ' + e.message); }
    var n = Object.keys(set).length;
    console.log('§FACADE_ONLY_TINT storey="' + storeyName + '" method=' + method + ' facadeWalls=' + n +
      ' (aabb=' + aabbN + ' raster=' + rasterN + ')' +
      (n === 0 ? ' — VACUOUS: no wall on this storey touches the building footprint edge, nothing will tint' : ''));
    _facadeGuids[storeyName] = set;
    return set;
  }
  function _restoreTint() {
    _touched.forEach(function (s) {
      if (s.inst != null && s.m.instanceColor && _C) { s.m.setColorAt(s.inst, _C.setHex(s.c)); s.m.instanceColor.needsUpdate = true; }
      else if (s.batch != null && s.m.setColorAt && _C) { try { s.m.setColorAt(s.batch, _C.setHex(s.c)); } catch (e) {} }
      else if (s.mat) s.m.material = s.mat;   // regular mesh: put the ORIGINAL material object back
    });
    _touched = [];
    _clones.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    _clones = [];
  }
  function _applyTint(storeyName, hex) {
    if (!_C) return 0;   // node-without-THREE (witness harness) — visual is inert, pacing still testable
    var n = 0;
    // Regular meshes — EXACT same predicate panels.js's A.filterStorey uses (§NAV_FIND_002), so this
    // can never pick up an Instanced/BatchedMesh container by accident (those do not carry a single
    // userData.storey — their per-instance storey lives in A._instanceMeta/_batchMeta instead).
    // §STOREY_REVEAL_TINT_SHARED_MATERIAL (2026-09-06 — the bug the user saw: "not marking by storey
    // but whole building"). Materials in this viewer are SHARED and cached (A._matCache; A.toggleXray
    // walks that same cache), so writing `o.material.emissive` for one storey's meshes repainted every
    // OTHER mesh using the same material — the whole building. It also made the restore a no-op: the
    // second mesh sharing a material saved the ALREADY-TINTED value as its "original", so the last
    // write on restore put the tint back and the colour persisted.
    // Fix: give the storey its OWN material. Cloned ONCE PER DISTINCT MATERIAL (not per mesh — that
    // would be thousands of clones), assigned to just this storey's meshes, disposed on restore, and
    // the original material object put straight back. Per-object, exactly like the partition
    // A.filterStorey uses (obj.visible / filterInstancedMesh / filterBatchedMesh, panels.js:711) —
    // which never had this problem precisely because visibility is per-object and emissive is not.
    // opacity=1 on the clone keeps the lit facade SOLID and fully opaque — §FACADE_ONLY_TINT means
    // the rest of the building needs no special treatment at all (no x-ray, no dim); it is simply
    // left alone, already visible or occluded exactly like any other geometry in the film.
    var facadeGuids = _facadeGuidsFor(storeyName);
    var _matMap = (typeof Map !== 'undefined') ? new Map() : null;
    A.collectMeshes(function (o) { return o.isMesh && o.userData.storey === storeyName && facadeGuids[o.userData.guid]; }).forEach(function (o) {
      if (!o.material || Array.isArray(o.material) || !o.material.emissive || !o.material.clone) return;
      var orig = o.material, cl = _matMap ? _matMap.get(orig) : null;
      if (!cl) {
        cl = orig.clone();
        cl.emissive.setHex(hex);
        cl.transparent = false; cl.opacity = 1;
        if (_matMap) _matMap.set(orig, cl);
        _clones.push(cl);
      }
      _touched.push({ m: o, mat: orig });
      o.material = cl; n++;
    });
    A.collectMeshes(function (o) { return o.isInstancedMesh; }).forEach(function (mesh) {
      var meta = A._instanceMeta && A._instanceMeta[mesh.id];
      if (!meta || !mesh.setColorAt) return;
      var any = false;
      for (var i = 0; i < meta.length; i++) {
        if (meta[i].storey !== storeyName || !facadeGuids[meta[i].guid]) continue;
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
        if (meta[i].storey !== storeyName || !facadeGuids[meta[i].guid]) continue;
        var pb = 0xffffff;
        try { mesh.getColorAt(meta[i].slotId, _C); pb = _C.getHex(); } catch (e) {}
        _touched.push({ m: mesh, batch: meta[i].slotId, c: pb });
        try { mesh.setColorAt(meta[i].slotId, _C.setHex(hex)); n++; } catch (e2) {}
      }
    });
    console.log('§STOREY_REVEAL_TINT storey="' + storeyName + '" color=#' + hex.toString(16).padStart(6, '0') +
      ' meshesTouched=' + n + ' clonedMaterials=' + _clones.length);
    return n;
  }

  // §FACADE_ONLY_REVERT_XRAY (2026-09-10, user, after seeing the darken-above approach fail on
  // lighting-direction unevenness: "Yes. My original request prior" — confirming the ORIGINAL ask
  // was always just "highlight the storey's facade", not "reveal it through the rest of the
  // building"). Both x-ray (§STOREY_REVEAL_XRAY, tried first) and darken-above
  // (§STOREY_REVEAL_DIM_ABOVE, tried second) existed ONLY to make an otherwise-hidden storey visible
  // from outside a solid building. Neither is needed once the tint is scoped to facade/exterior-wall
  // elements (§FACADE_ONLY_TINT above): a storey's exterior wall is already the outermost, camera-
  // visible surface on any exterior orbit shot — nothing needs to become see-through or dimmed for
  // it to be seen. So: no x-ray, no darkening, no transparency, no per-pixel/per-triangle cost during
  // this window at all — it now runs at the SAME cost as any other beat. Normal occlusion applies
  // like anywhere else in the film: if a facade happens to be hidden from a given camera angle, it
  // is simply hidden, the same as any other geometry — no special-casing.
  var _markersHidden = false;
  function _hideMarkers() {
    if (!_markersHidden && A.clashFilm && A.clashFilm.setVisible) {
      if (A.clashFilm.setVisible(false)) {
        _markersHidden = true;
        console.log('§STOREY_REVEAL_MARKERS_OFF clash markers hidden — stats own the closing beats');
      }
    }
  }
  function _restoreMarkers() {
    if (_markersHidden && A.clashFilm && A.clashFilm.setVisible) {
      A.clashFilm.setVisible(true);
      console.log('§STOREY_REVEAL_MARKERS_OFF clash markers restored (bake/preview exit)');
    }
    _markersHidden = false;
  }

  A.storeyRevealApplyVisual = function (plan, tNorm) {
    // plan===null is the FORCED restore (every bake/preview exit path, including the throw path).
    // It must run unconditionally: by the time it arrives the film has normally already left the
    // window, so _curIdx is null and the key check below would return early — leaving the clash
    // markers hidden for the NEXT bake. Restore first, then fall through to the normal no-op.
    if (!plan) { _restoreTint(); _curIdx = null; _restoreMarkers(); return; }
    var vis = A.storeyRevealVisualAt(plan, tNorm);
    // A dark slot keeps its own key so the tint is actually taken DOWN between storeys (the "cease").
    // The last storey never reports dark (§STOREY_REVEAL_LAST_STAYS_LIT), so this key never flips to
    // its 'd' form for it — the tint rides to the window's end instead of ceasing.
    var key = vis ? (vis.idx + (vis.dark ? 'd' : 'l')) : null;
    if (key === _curIdx) return;
    _restoreTint();
    _curIdx = key;
    if (vis) {
      _hideMarkers();
      if (!vis.dark) _applyTint(vis.storey, vis.color);
    }
    // vis===null but plan truthy: the film simply moved on to the orbit. No action needed — the
    // tint block above already restored on its own key change, and markers intentionally STAY
    // hidden (only the forced-restore path above un-hides them) — that is the whole point of
    // §STOREY_REVEAL_MARKERS_OFF: once hidden, they stay hidden for the rest of the film.
  };
}
if (typeof window !== 'undefined') window.setupCpeStoreyReveal = setupCpeStoreyReveal;
// Dual-mode, same convention rule_findings_film.js already uses — lets witness_storey_reveal_list.js
// exercise A.storeyRevealList against a real in-memory sql.js DB in Node. The browser path is
// unchanged: `window.setupCpeStoreyReveal` above is still what viewer/main.js loads.
if (typeof module !== 'undefined' && module.exports) module.exports = setupCpeStoreyReveal;
