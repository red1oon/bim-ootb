// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET GUID BINDING (§BINDING / §RESUME NEXT#1). The resolveGuid JOIN: a lease
//   (or any HBA record) lights a unit on the model ONLY when its unit_guid resolves to a REAL mesh guid in
//   THIS building. NON-INVENT GATE — a non-matching guid makes the lens HONESTLY show un-linked; it never
//   fabricates a binding. Browser real impl = reverse lookup over the viewer's APP.guidMap; witness impl =
//   the extracted room fixture (fixtures/hhs_rooms.json). Pure + deterministic. Read the log after run.
'use strict';

// known guids = the set of real guids of the loaded building. Accepts either:
//   • the extracted room fixture  { rooms:[{guid,...}] }                 (witness / standalone)
//   • a viewer APP.guidMap        { meshId: guid, meshId_N: guid, ... }  (browser, real seam — see NOTE)
//   • an array / Set of guids
// NOTE (non-invent — verified against viewer/streaming.js + ghostglass.js, 2026-06-30): APP.guidMap is
//   keyed meshId→guid; the GUIDS ARE THE VALUES, and instanced meshes carry a `_N` slot suffix on the key.
//   So a plain-object source is read by its VALUES (not keys). The spec §BINDING's "guid→mesh" was inverted.
function knownGuidSet(source) {
  if (source instanceof Set) return source;
  if (Array.isArray(source)) return new Set(source);
  if (source && Array.isArray(source.rooms)) return new Set(source.rooms.map(function (r) { return r.guid; }));
  if (source && typeof source === 'object') return new Set(Object.keys(source).map(function (k) { return source[k]; }));
  return new Set();
}

// resolveGuid — the single non-invent gate. True iff this guid is a real unit in the loaded building.
function resolveGuid(guid, source) { return knownGuidSet(source).has(guid); }

// meshIdForGuid — the REAL viewer reverse lookup: scan APP.guidMap VALUES, return the mesh-id key (the
// handle to tint/zoom/dummy). Returns the FIRST match's key (instanced units may have several `_N` keys);
// null if the guid is not in this building (honest un-linked). Browser tint/zoom uses the returned key.
function meshIdForGuid(guid, guidMap) {
  if (!guidMap || typeof guidMap !== 'object') return null;
  var keys = Object.keys(guidMap);
  for (var i = 0; i < keys.length; i++) if (guidMap[keys[i]] === guid) return keys[i];
  return null;
}

// bindLeases — JOIN HBA records to the building. linked=join hits → lights up; else honest un-linked.
function bindRecords(records, source, guidField) {
  var set = knownGuidSet(source), f = guidField || 'unit_guid';
  return records.map(function (r) {
    var g = r[f], linked = set.has(g);
    return { ref: r.lease_no || r.parcel || r.asset || r.id || g, guid: g, field: f,
             linked: linked, status: linked ? 'linked' : 'unlinked',
             room: null /* filled by enrich() when the fixture carries room meta */, _src: r };
  });
}

// enrich a binding with the REAL room meta (name, centre, occupancy) — extracted, never invented.
function enrich(binding, source) {
  if (!source || !Array.isArray(source.rooms)) return binding;
  var byGuid = {}; source.rooms.forEach(function (rm) { byGuid[rm.guid] = rm; });
  return binding.map(function (b) {
    var rm = byGuid[b.guid] || null;
    return Object.assign({}, b, { room: rm });
  });
}

// §REAL-BIND (2026-07-01) — on a REAL model the rendered meshes carry IFC GlobalIds, but an IfcSpace ROOM is
// usually NOT rendered (it has no mesh). So a lease keyed to a room guid resolves to NOTHING and tints nothing
// (the live-3D gap the whitebox log exposed: roomsInGuidMap=0 on HHS). FIX: a room tints via its rendered
// CONTAINED members (rel_contained_in_space). These two pure helpers carry that logic so it is node-witnessable.
//
// augmentKnown: the resolvable-guid set = every rendered mesh guid PLUS any room that has ≥1 RENDERED member
// (so a lease on that room is honestly "located"). roomMembers = { roomGuid: [memberGuid,...] }.
function augmentKnown(source, roomMembers) {
  var base = knownGuidSet(source);
  if (!roomMembers) return base;
  var out = new Set(base);
  Object.keys(roomMembers).forEach(function (room) {
    var mem = roomMembers[room] || [];
    for (var i = 0; i < mem.length; i++) { if (base.has(mem[i])) { out.add(room); break; } }
  });
  return out;
}
// zoneMeshGuids: the guids to ACTUALLY tint for a zone — the zone itself if it is a rendered mesh, else its
// rendered contained members. NON-INVENT: only guids that exist in the rendered set are returned (never faked).
function zoneMeshGuids(zone, source, roomMembers) {
  var base = knownGuidSet(source);
  if (base.has(zone)) return [zone];
  var mem = (roomMembers && roomMembers[zone]) || [];
  return mem.filter(function (g) { return base.has(g); });
}

// §INSTANCED-TINT (2026-07-01) — reverse the viewer guidMap for a set of want-guids into TINT TARGETS, HANDLING
// the instanced/batched `_N` slot suffix that the naive `guidMap[obj.id]` lookup dropped (the live bug the
// whitebox log exposed: tintedMeshes=0 on HHS's 716 instanced groups — a member mesh is keyed `<meshId>_<slot>`,
// never the bare `<meshId>`, so the old port matched NONE of them). Returns [{ guid, meshId, slot }] where
// slot===null is a whole-mesh (regular/merged) target and slot is the instance/batch index for a per-slot target.
// Pure + deterministic; the browser port maps meshId→THREE object and tints whole-mesh via emissive, per-slot via
// setColorAt. NON-INVENT: only guidMap keys whose VALUE is in the want set become targets.
function guidTargets(wantGuids, guidMap) {
  if (!guidMap || typeof guidMap !== 'object') return [];
  var want = Object.create(null);
  (wantGuids || []).forEach(function (g) { want[g] = 1; });
  var out = [], keys = Object.keys(guidMap);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], g = guidMap[k];
    if (!want[g]) continue;
    var us = k.indexOf('_'), slot = null, meshId = k;     // mesh.id is a plain integer → first '_' splits the suffix
    if (us > 0) {
      var tail = k.slice(us + 1);
      if (/^[0-9]+$/.test(tail)) { slot = parseInt(tail, 10); meshId = k.slice(0, us); }
    }
    out.push({ guid: g, meshId: parseInt(meshId, 10), slot: slot });
  }
  return out;
}

var B = { knownGuidSet: knownGuidSet, resolveGuid: resolveGuid, meshIdForGuid: meshIdForGuid, bindRecords: bindRecords,
          enrich: enrich, augmentKnown: augmentKnown, zoneMeshGuids: zoneMeshGuids, guidTargets: guidTargets };
if (typeof module === 'object' && module.exports) module.exports = B;
else (typeof self !== 'undefined' ? self : this).HbaBinding = B;
