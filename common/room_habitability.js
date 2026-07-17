/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * room_habitability.js — §ROOM-HAB shared classifier (VIEWER_FIND_PANEL_ROOM_ACCURACY.md Task 1).
 *
 * Real-vs-NON-HABITABLE-real-or-synthetic space classifier: excludes roof/shaft/plant voids from
 * "this is a room" surfaces (schedule placement AND display) via a label-keyword check + a
 * z-band-above-envelope geometry check. NOT a real-vs-synthetic filter (RM_/≈ prefix exclusion) —
 * that is a SEPARATE, stricter concern `modeller/disc_walker.js`'s `spacesOf()` applies on top of
 * this for placement; the Viewer's Room Lens (display-only, `viewer/navigate_find.js`) intentionally
 * shows synthetic `compile_rooms.py` rooms too (labelled honestly — see Task 3), it just must not
 * show a synthetic OR real "Roof"/"Shaft"/etc as if it were a normal room.
 *
 * PROVENANCE: ported from `modeller/disc_walker.js`'s `spaceHabitable()`/`_substrateEnv()`
 * (proven W-ROOM-HAB 5/5, W-ROOM-HAB-SH 6/6, currently live only on the unmerged bim-ootb branch
 * `fable/modeller-lod400-livewire` — main's disc_walker.js does not have this function yet).
 * Landed here as a NEW shared module rather than copy-pasted inline into navigate_find.js, per
 * VIEWER_FIND_PANEL_ROOM_ACCURACY.md Task 1's "evaluate a real shared module" instruction: both
 * modeller.html and viewer.html load plain <script> globals (no bundler/ES-modules — see the
 * `../common/pill_builder.js` / `../common/history_bar.js` precedent, already loaded by both pages),
 * so a shared `common/` file is a one-line <script> addition per page, not real plumbing.
 * ⚠ FOLLOW-UP FLAG (not done here, out of this task's scope): when `fable/modeller-lod400-livewire`
 * merges, `disc_walker.js` should be updated to delegate to `window.RoomHabitability` instead of
 * keeping its own inline copy of this logic — otherwise the two definitions can drift apart. Left
 * as a flag for whoever merges that branch, not actioned here (this task never touches disc_walker.js
 * on main, which doesn't have the function to refactor yet).
 */
(function () {
  'use strict';
  var ROOT = (typeof window !== 'undefined') ? window : {};

  // Exclude-list is verbatim from ROOM_INJECTION_HYBRID.md §6 S1 — grows only by review against
  // real extractions, never guessed.
  var NONHAB_TYPES = ['ROOF', 'SHAFT', 'VOID', 'PLANT', 'PLANT_ROOM', 'EXTERNAL', 'PODIUM',
    'SILL', 'PARAPET', 'BALCONY'];

  // Geometry signal: a space whose ceiling sits ABOVE the building's entire real-element envelope
  // is not enclosed (Duplex R301 Roof: z1 8.91 vs envelope 6.67; all 20 genuine rooms ≤ 5.61).
  function spaceHabitable(space, env, excludeList) {
    var list = excludeList || NONHAB_TYPES;
    var norm = String(space.label || '').toUpperCase().replace(/[\s]+/g, '_')
      .replace(/[_\s]*\d+$/, '').trim();
    var toks = norm.split('_');
    for (var i = 0; i < list.length; i++)
      if (norm === list[i] || toks.indexOf(list[i]) >= 0) return { ok: false, why: 'label:' + list[i] };
    if (env && env.z1 != null && space.z1 > env.z1 + 0.25)
      return { ok: false, why: 'zband:' + space.z1.toFixed(2) + '>' + env.z1.toFixed(2) };
    return { ok: true };
  }

  // Substrate envelope from element_transforms (the same bbox union both disc_walker.js's
  // _substrateEnv and this classifier's zband check use). Returns null if the table/columns
  // are absent (caller should treat that as "no zband signal", label check still applies).
  function envelopeFromTransforms(dbQueryFn) {
    try {
      var rows = dbQueryFn("SELECT MIN(center_x-bbox_x/2) x0, MAX(center_x+bbox_x/2) x1, " +
        "MIN(center_y-bbox_y/2) y0, MAX(center_y+bbox_y/2) y1, MIN(center_z-bbox_z/2) z0, " +
        "MAX(center_z+bbox_z/2) z1 FROM element_transforms");
      if (!rows || !rows.length || rows[0][5] == null) return null;
      var r = rows[0];
      return { x0: r[0], x1: r[1], y0: r[2], y1: r[3], z0: r[4], z1: r[5] };
    } catch (e) { return null; }
  }

  // §UTILITY-CONTENT (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §10, 2026-07-15): a SECOND, independent
  // non-habitable signal alongside spaceHabitable()'s label/zband check — element COMPOSITION, not
  // label text. Real root cause this exists: Clinic's 8 fullConnectivity() islands (measured
  // 2026-07-15, PR #794) carry a generic "COMPILED INTERNAL" synthetic label with no descriptive
  // space name at all, so the label-keyword check above can never catch them — but their CONTENTS
  // are unambiguous: 6 of the 8 are dominated by ACMV `IfcFlowSegment` rows (a duct/pipe SEGMENT —
  // the signature of ductwork physically ROUTING THROUGH a shaft/riser, distinct from a normal
  // room's occasional terminal diffuser, which is a different ifc_class), 1 is pure
  // STR `IfcFooting` (a foundation void). DELIBERATELY NOT force-fit: the 8th room (Clinic First
  // Floor R56) has neither signal in its own contained elements (just an ordinary structural beam,
  // the same as countless real habitable rooms) — measured, not classified here, rather than
  // padding the count to match an assumed "8/8" story. `DOOR_BUFFER_SLACK`/`rectDist` are the SAME
  // real constant/formula `common/room_graph.js`'s E1/E2 door-matching already uses (not
  // reinvented) — a room with a genuine nearby door is NEVER classified Utilities regardless of
  // its contents (a real ACMV plant room with its own access door is still occupiable/serviced
  // space, not a sealed void).
  var DOOR_BUFFER_SLACK = 0.20;
  function _rectDist(x0, x1, y0, y1, px, py) {
    var dx = Math.max(x0 - px, 0, px - x1);
    var dy = Math.max(y0 - py, 0, py - y1);
    return Math.hypot(dx, dy);
  }
  function _hasNearbyDoor(room, dbQueryFn) {
    var x0 = room.cx - room.sx / 2, x1 = room.cx + room.sx / 2;
    var y0 = room.cy - room.sy / 2, y1 = room.cy + room.sy / 2;
    var doors;
    try {
      doors = dbQueryFn("SELECT t.center_x, t.center_y, t.bbox_x, t.bbox_y FROM elements_meta m " +
        "JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class LIKE 'IfcDoor%' " +
        "AND m.discipline='ARC' AND m.storey=?", [room.storey]) || [];
    } catch (e) { return false; } // no door data at all — treat as "can't tell", caller stays ok:true
    for (var i = 0; i < doors.length; i++) {
      var d = doors[i], buf = Math.max(d[2] || 0, d[3] || 0) / 2 + DOOR_BUFFER_SLACK;
      if (_rectDist(x0, x1, y0, y1, d[0], d[1]) <= buf) return true;
    }
    return false;
  }
  // room: { cx, cy, sx, sy, storey } — same fields buildGraph()'s room nodes already carry
  // (cx/cy center, sx/sy = a rect's x1-x0/y1-y0 — caller's own logical-room union, §MULTI-RECT
  // aware the same way room_graph.js is: pass the room's OWN bbox, not re-derived here).
  // Small 0.3m margin on the containment query — real elements sitting exactly on a wall boundary
  // (measured this session) still count; not a guessed number, matches the scratch query this
  // signal was measured with before being written up.
  function utilityContentClass(room, dbQueryFn) {
    var margin = 0.3;
    var x0 = room.cx - room.sx / 2 - margin, x1 = room.cx + room.sx / 2 + margin;
    var y0 = room.cy - room.sy / 2 - margin, y1 = room.cy + room.sy / 2 + margin;
    var rows;
    try {
      rows = dbQueryFn("SELECT m.discipline, m.ifc_class, COUNT(*) c FROM elements_meta m " +
        "JOIN element_transforms t ON t.guid = m.guid WHERE m.storey=? AND t.center_x BETWEEN ? AND ? " +
        "AND t.center_y BETWEEN ? AND ? GROUP BY m.discipline, m.ifc_class",
        [room.storey, x0, x1, y0, y1]) || [];
    } catch (e) { return { ok: true }; } // no element data — can't classify, never invent
    var hasFlowSegment = rows.some(function (r) { return r[0] === 'ACMV' && /IfcFlowSegment/.test(r[1] || ''); });
    var hasFooting = rows.some(function (r) { return /IfcFooting/.test(r[1] || ''); });
    if (!hasFlowSegment && !hasFooting) return { ok: true };
    if (_hasNearbyDoor(room, dbQueryFn)) return { ok: true }; // real door → serviced space, not a sealed void
    return { ok: false, why: hasFlowSegment ? 'utility:ACMV' : 'utility:footing' };
  }

  // §UTILITY-CONTENT-BATCH (2026-07-15, real perf regression found live — Hospital, 311 rooms/
  // 63182 elements, appeared to HANG): `utilityContentClass()` runs 2 real SQL queries PER ROOM
  // (element-composition range-scan + door-proximity scan) — fine on Clinic/HHS (~100-120 rooms,
  // unnoticeable), but the Viewer calls it once per logical room EVERY time the Room axis is
  // entered, and sql.js (WASM, browser-side) is far slower per-query than the node/better-sqlite3
  // harness this was measured against. On Hospital that's 600+ unbatched range-scans per Room-axis
  // entry — a genuine hang, not a fluke. Fix: batch BOTH queries to run ONCE for the whole building
  // regardless of room count, then classify every room via cheap in-memory loops over the small
  // pre-fetched candidate lists (ACMV IfcFlowSegment/STR IfcFooting elements are always a small
  // minority of a building's elements; same for doors relative to all elements). Same real
  // signal/thresholds as utilityContentClass() above — this does not change WHAT gets classified,
  // only how many queries it costs. utilityContentClass() itself is left in place (single-room
  // ad-hoc use, e.g. a future one-room checker), just no longer called in a per-room loop by the
  // Viewer — see navigate_find.js's §ROOM_LENS_TAXONOMY call sites.
  function classifyUtilityRooms(rooms, dbQueryFn) {
    var out = {};
    if (!rooms || !rooms.length) return out;
    var candidateRows, doorRows;
    try {
      candidateRows = dbQueryFn("SELECT m.discipline, m.ifc_class, m.storey, t.center_x, t.center_y " +
        "FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid " +
        "WHERE (m.discipline='ACMV' AND m.ifc_class LIKE '%IfcFlowSegment%') OR m.ifc_class LIKE '%IfcFooting%'") || [];
    } catch (e) { candidateRows = []; }
    try {
      doorRows = dbQueryFn("SELECT m.storey, t.center_x, t.center_y, t.bbox_x, t.bbox_y FROM elements_meta m " +
        "JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC'") || [];
    } catch (e) { doorRows = []; }
    var candByStorey = {}, doorsByStorey = {};
    candidateRows.forEach(function (r) { (candByStorey[r[2] || ''] = candByStorey[r[2] || ''] || []).push(r); });
    doorRows.forEach(function (r) { (doorsByStorey[r[0] || ''] = doorsByStorey[r[0] || ''] || []).push(r); });
    rooms.forEach(function (room) {
      var margin = 0.3;
      var x0 = room.cx - room.sx / 2 - margin, x1 = room.cx + room.sx / 2 + margin;
      var y0 = room.cy - room.sy / 2 - margin, y1 = room.cy + room.sy / 2 + margin;
      var cands = candByStorey[room.storey || ''] || [];
      var hasFlowSegment = false, hasFooting = false;
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        if (c[3] < x0 || c[3] > x1 || c[4] < y0 || c[4] > y1) continue;
        if (c[0] === 'ACMV' && /IfcFlowSegment/.test(c[1] || '')) hasFlowSegment = true;
        if (/IfcFooting/.test(c[1] || '')) hasFooting = true;
      }
      if (!hasFlowSegment && !hasFooting) return;
      var doors = doorsByStorey[room.storey || ''] || [];
      var rx0 = room.cx - room.sx / 2, rx1 = room.cx + room.sx / 2;
      var ry0 = room.cy - room.sy / 2, ry1 = room.cy + room.sy / 2;
      var nearDoor = false;
      for (var j = 0; j < doors.length; j++) {
        var d = doors[j], buf = Math.max(d[3] || 0, d[4] || 0) / 2 + DOOR_BUFFER_SLACK;
        if (_rectDist(rx0, rx1, ry0, ry1, d[1], d[2]) <= buf) { nearDoor = true; break; }
      }
      if (nearDoor) return; // real door → serviced space, not a sealed void
      out[room.guid] = hasFlowSegment ? 'utility:ACMV' : 'utility:footing';
    });
    return out;
  }

  // §RESTROOM-CLASS (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md — restroom shell hue, 2026-07-17): a wet
  // sanitary room (toilet/WC/bathroom/washroom) gets its own shell color, no longer collapsed into
  // 'habitable'. Deterministic, non-invent: token match on the room's ALREADY-REAL type/name fields
  // (the caller passes g.label = object_type+predefined_type+name joined — same widened-field signal
  // spaceHabitable/utility use; never a fabricated label). Keyword set is drawn from real IFC space
  // naming (Duplex object_type='Bathroom 1/2'; public buildings use Toilet/WC/Restroom/Lavatory).
  // Word-boundary anchored so 'wc'/'bath' don't match inside unrelated words.
  var RESTROOM_RE = /(^|[^a-z])(toilet|rest\s*room|restroom|water\s*closet|wc|lavatory|washroom|bathroom|bath|powder\s*room|en-?suite|ensuite)([^a-z]|$)/i;
  function classifyRestroom(label) {
    if (!label) return false;
    return RESTROOM_RE.test(String(label));
  }

  var API = { spaceHabitable: spaceHabitable, NONHAB_TYPES: NONHAB_TYPES,
    envelopeFromTransforms: envelopeFromTransforms, utilityContentClass: utilityContentClass,
    classifyUtilityRooms: classifyUtilityRooms, classifyRestroom: classifyRestroom };
  ROOT.RoomHabitability = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
