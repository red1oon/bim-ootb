// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* location_axis.js — Implementing bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S50.1.b
 * (user ruling 2026-08-21: the support graph is RETIRED; precedence is carried by
 * (location, trade) ordering — rooms injection is the location axis).
 *
 * THE ONE RUNTIME LOCATION PASS (§S32.4 contract, all five clauses):
 *   read-only     — only db.exec()/SELECT via RoomWalker/LevelDeriver readers; this file contains
 *                   no db.run call (grep it) and RoomWalker.compileRooms is the compute-only half
 *                   (writeRooms is never called here).
 *   once per load — the db-heavy parts (level lookups, fresh room compile, containment index) are
 *                   memoized per db object; per-call work is per-element assignment only.
 *   TOTAL         — every element gets a location: a compiled room where its XY centre falls in
 *                   one (the writeRooms containment join, exported from room_walker.js — identical
 *                   math, not re-derived), else the derived LEVEL itself ('L<idx>'). LevelDeriver
 *                   (§S35, gate-passed: 100% coverage 7/7, T4=0) supplies the vertical; T4
 *                   (non-finite geometry) is counted and reported, never silently defaulted.
 *   reports       — §LOC_AXIS coverage per building: how many elements landed in a compiled room,
 *                   how many are level-only, and how many persisted RM_/declared-IFC containment
 *                   rows exist (reported, not used — see below).
 *   guard         — §LOC_AXIS_GUARD prints which branches were REACHABLE on this data, so a 0 can
 *                   be told apart from a branch that never ran.
 *
 * WHY PERSISTED rel_contained_in_space ROWS ARE REPORTED BUT NOT USED (measured 2026-08-21,
 * probe_s50_early — §S50.2): the shipped fleet carries ZERO IFC-declared containment; every
 * existing row is an RM_ room persisted by an EARLIER walker version (rooms_meta stamp absent).
 * Filing against them would mix walker versions across buildings. This pass compiles FRESH with
 * the current RoomWalker (v3) in memory — one algorithm, one version, uniform fleet, nothing
 * written — which is also exactly what the Room lens does when it sees a stale version stamp.
 *
 * Room level: a room's location owns its vertical position — an element contained in a room takes
 * the room's level (geomIdx of the room's own z anchor on the level grid, §S50.1.g). Declared-IFC
 * rooms would get this via LevelDeriver T1 (space -> parent storey); compiled rooms get it here.
 */
(function (global) {
  'use strict';
  var TAG = '§LOC_AXIS';

  function deps() {
    var RW = global.RoomWalker || (typeof RoomWalker !== 'undefined' ? RoomWalker : null);
    var LD = global.LevelDeriver || (typeof LevelDeriver !== 'undefined' ? LevelDeriver : null);
    return { RW: RW, LD: LD };
  }

  // per-db memo of the heavy, element-independent parts (WeakMap: a reopened db recomputes)
  var _memo = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

  function _dbSide(db) {
    if (_memo && _memo.has(db)) return _memo.get(db);
    var d = deps();
    var out = { ok: false, reason: '' };
    if (!d.LD) { out.reason = 'LevelDeriver missing'; if (_memo) _memo.set(db, out); return out; }
    var L = d.LD.readLookups(db);
    var persisted = { rm: 0, ifc: 0 };
    try {
      var pr = db.exec("SELECT COUNT(*), SUM(CASE WHEN space_guid NOT LIKE 'RM_%' THEN 1 ELSE 0 END) FROM rel_contained_in_space");
      if (pr.length) { var t = pr[0].values[0]; persisted.ifc = t[1] || 0; persisted.rm = t[0] - persisted.ifc; }
    } catch (e) { /* no table — fine */ }
    var rooms = [], suspects = 0, compileMs = 0, joinKey = null, byFloor = {};
    if (d.RW && d.RW.compileRooms && d.RW._makeJoinKey && d.RW._canonicalFloor) {
      var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      var compiled = d.RW.compileRooms(db);
      compileMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
      compiled.rooms.forEach(function (r) { if (r.suspect) suspects++; else rooms.push(r); });
      // the writeRooms containment join, via the exported helpers — identical math, no re-derivation
      var acc = {};
      rooms.forEach(function (r) {
        var cf = d.RW._canonicalFloor(r.storey);
        if (cf !== null) (acc[cf] = acc[cf] || []).push(r.cz);
      });
      var anchors = {};
      Object.keys(acc).forEach(function (cf) {
        var v = acc[cf];
        anchors[cf] = v.reduce(function (s, x) { return s + x; }, 0) / v.length;
      });
      joinKey = d.RW._makeJoinKey(anchors);
      rooms.forEach(function (r) { var k = joinKey(r.storey, r.cz); (byFloor[k] = byFloor[k] || []).push(r); });
    }
    out = { ok: true, L: L, rooms: rooms, suspects: suspects, compileMs: compileMs,
            joinKey: joinKey, byFloor: byFloor, persisted: persisted,
            roomWalkerPresent: !!(d.RW && d.RW.compileRooms) };
    if (_memo) _memo.set(db, out);
    return out;
  }

  // derive(db, elements, opts) -> { lvlOf: {guid: gridIdx|-1}, locOf: {guid: roomGuid|'L<idx>'},
  //   roomed: {guid:1}, grid, gridSource, stats } — elements accept bz/tz or base_z/top_z.
  function derive(db, elements, opts) {
    opts = opts || {};
    var label = opts.label || 'building';
    var d = deps();
    var S = _dbSide(db);
    var n = elements.length || 1;
    var norm = elements.map(function (e) {
      return { guid: e.guid, cls: e.cls,
               base_z: (e.base_z != null ? e.base_z : e.bz), top_z: (e.top_z != null ? e.top_z : e.tz),
               x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1 };
    });
    if (!S.ok) {
      // total fallback: no LevelDeriver — every element is level 'L0'. Loud, never silent.
      console.log(TAG + ' ' + label + ' DEGRADED (' + S.reason + ') — every element filed level-only; ' +
        'the cell gate will see repr computed on a flat axis and route to the graph engine');
      var lvl0 = {}, loc0 = {};
      norm.forEach(function (e) { lvl0[e.guid] = 0; loc0[e.guid] = 'L0'; });
      return { lvlOf: lvl0, locOf: loc0, roomed: {}, grid: [], gridSource: 'none',
               stats: { n: elements.length, inRoom: 0, levelOnly: elements.length, t4: 0, degraded: S.reason } };
    }
    var G = d.LD.buildGrid(S.L, norm);
    G.medGap = d.LD.medianGap(G.grid);
    var lvlOf = {}, locOf = {}, roomed = {};
    var t4 = 0, inRoom = 0;
    // room level = geomIdx of the room's own z anchor (§S50.1.g: the location owns the vertical)
    var roomLvl = {};
    S.rooms.forEach(function (r) { roomLvl[r.guid] = G.grid.length ? d.LD.geomIdx(G.grid, r.cz) : -1; });
    norm.forEach(function (e) {
      var r = d.LD.levelFor(e, S.L.rawStorey[e.guid], S.L, G);
      var lvl = (r.idx == null ? -1 : r.idx);
      if (r.tier === 'T4') t4++;
      var room = null;
      if (S.joinKey) {
        var cz = (e.base_z + e.top_z) / 2;
        var cand = S.byFloor[S.joinKey(S.L.rawStorey[e.guid], cz)] || [];
        var ex = (e.x0 + e.x1) / 2, ey = (e.y0 + e.y1) / 2;
        for (var i = 0; i < cand.length; i++) {
          var rm = cand[i], rcs = rm.rects || [rm];
          for (var q = 0; q < rcs.length; q++) {
            if (Math.abs(ex - rcs[q].cx) <= rcs[q].sx / 2 && Math.abs(ey - rcs[q].cy) <= rcs[q].sy / 2) { room = rm; break; }
          }
          if (room) break;
        }
      }
      if (room) {
        inRoom++;
        roomed[e.guid] = 1;
        lvlOf[e.guid] = roomLvl[room.guid];
        locOf[e.guid] = room.guid;
      } else {
        lvlOf[e.guid] = lvl;
        locOf[e.guid] = 'L' + lvl;
      }
    });
    console.log(TAG + ' ' + label + ' population=' + elements.length + ' (ALL scheduled elements handed in — not a subset)' +
      ' declaredIFC=' + S.persisted.ifc + ' persistedRM=' + S.persisted.rm + ' (reported, not used — version-skewed prior compile)' +
      ' freshCompiledRooms=' + S.rooms.length + ' (+' + S.suspects + ' suspect excluded)' +
      ' elementsInCompiledRoom=' + inRoom + ' (' + (100 * inRoom / n).toFixed(2) + '%)' +
      ' levelOnly=' + (elements.length - inRoom) + ' (' + (100 * (elements.length - inRoom) / n).toFixed(2) + '%)' +
      ' lvlT4=' + t4 + ' lvlGridSource=' + G.source + ' compileMs=' + S.compileMs);
    console.log(TAG + '_GUARD ' + label +
      ' roomWalker=' + (S.roomWalkerPresent ? 'present' : 'ABSENT — compiled-room branch UNREACHABLE, every element level-only') +
      ' levelGrid=' + (G.grid.length ? G.grid.length + ' lines (' + G.source + ')' : 'EMPTY') +
      ' roomBranchFired=' + (inRoom > 0 ? 'YES' : 'NO — 0 elements in rooms on this data (0 is a measurement here only if roomWalker=present)') +
      ' t4Counted=' + t4);
    return { lvlOf: lvlOf, locOf: locOf, roomed: roomed, grid: G.grid, gridSource: G.source,
             stats: { n: elements.length, inRoom: inRoom, levelOnly: elements.length - inRoom, t4: t4,
                      rooms: S.rooms.length, suspects: S.suspects, persisted: S.persisted, compileMs: S.compileMs } };
  }

  var API = { derive: derive, _dbSide: _dbSide };
  global.LocationAxis = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof console !== 'undefined') console.log(TAG + ' module loaded');
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
