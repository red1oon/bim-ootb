// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-MESHPORT witness (§INSTANCED-TINT — P1, the live lens actually PAINTS, 2026-07-01).
//   The whitebox log on the real HHS model said `tintedMeshes=0` even though every lens RESOLVED
//   (leaseRoomsResolved=3/3): HHS renders 716 INSTANCED groups, so a room's contained member is keyed
//   `APP.guidMap['<meshId>_<slot>']` (an instance/batch slot), NOT the bare `<meshId>`. The old MeshPort looked
//   up `A.guidMap[obj.id]` (bare only) → it matched NONE of the instanced/batched members → nothing tinted.
//   This test drives the REAL viewer/hba_lens.js buildMeshPort through stub THREE InstancedMesh/BatchedMesh
//   objects keyed exactly like the live viewer (streaming.js `iMesh.id + '_' + instanceIndex`) and asserts:
//   the fix reverse-indexes the `_N` suffix, tints the right instance via setColorAt, and restoreAll reverts —
//   so tintedMeshes > 0 on instanced geometry. It NAMES the bug (instanced/batched members were invisible to
//   the port) and proves the fix without a browser. Run:  node hr_bim_asset/tests/witness_meshport.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-MESHPORT ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- minimal THREE shim: only Color (the port uses new THREE.Color() for per-slot setColorAt). -------------
function Color() { this._h = 0xffffff; }
Color.prototype.setHex = function (v) { this._h = v >>> 0; return this; };
Color.prototype.getHex = function () { return this._h; };
Color.prototype.setRGB = function (r, g, b) { this._h = ((r * 255) << 16) | ((g * 255) << 8) | (b * 255); return this; };
global.THREE = { Color: Color };

// the engine + the REAL adapter (node branch returns before the DOM gate) — same load path as witness_wire.js
global.self = global;
self.HbaWatermark = require('../watermark');
self.HbaModels = require('../models');
self.HbaBinding = require('../binding');
self.HbaOverlay = require('../overlay');
self.HbaLens = require('../lens');
self.HbaTimeline = require('../timeline');
var HBALens = require('../../viewer/hba_lens');
var B = self.HbaBinding;

// ---- stub meshes keyed exactly like the live viewer ------------------------------------------------------
function mat() { var h = 0; return { emissive: { getHex: function () { return h; }, setHex: function (v) { h = v; } }, opacity: 1, transparent: false }; }
function regMesh(id) { return { id: id, isMesh: true, material: mat() }; }
function instMesh(id) {                                   // InstancedMesh: per-instance colour via setColorAt
  return { id: id, isMesh: true, isInstancedMesh: true, instanceColor: null, _c: {},
    setColorAt: function (i, col) { if (!this.instanceColor) this.instanceColor = { needsUpdate: false }; this._c[i] = col.getHex(); },
    getColorAt: function (i, col) { col.setHex(this._c[i] != null ? this._c[i] : 0xffffff); return col; } };
}
function batchMesh(id) {                                  // BatchedMesh: per-slot colour via setColorAt
  return { id: id, isMesh: true, isBatchedMesh: true, _c: {},
    setColorAt: function (i, col) { this._c[i] = col.getHex(); },
    getColorAt: function (i, col) { col.setHex(this._c[i] != null ? this._c[i] : 0xffffff); return col; } };
}
function makeAPP(guidMap, meshes, roomMembers) {
  return { guidMap: guidMap, _hbaRoomMembers: roomMembers || null, status: { textContent: '' }, _dirty: 0,
    markDirty: function () { this._dirty++; }, collectMeshes: function (pred) { return meshes.filter(pred); } };
}

// A room (NOT rendered) whose 3 contained members ARE rendered as: one regular mesh, one INSTANCED slot, one
// BATCHED slot — the exact mix the §REAL-BIND path produces on the live model. guidMap keys mirror streaming.js:
//   regular  → '<id>'         instanced → '<id>_<instanceIndex>'      batched → '<id>_<slotId>'
var REG = 'MEMBER_REG', INST = 'MEMBER_INST', BAT = 'MEMBER_BATCH';
var rMesh = regMesh(4012), iMesh = instMesh(7000), bMesh = batchMesh(8000), other = regMesh(9999);
var guidMap = {};
guidMap['4012'] = REG;            // regular mesh → bare key
guidMap['7000_3'] = INST;         // instanced mesh 7000, instance #3
guidMap['8000_5'] = BAT;          // batched mesh 8000, slot #5
guidMap['9999'] = 'UNRELATED';    // an element NOT in the room (must stay untouched)
var roomMembers = { 'RM_TEST': [REG, INST, BAT] };
var A = makeAPP(guidMap, [rMesh, iMesh, bMesh, other], roomMembers);

// ---- M0 — THE BUG (pre-fix port behaviour): the OLD lookup `A.guidMap[obj.id]` (bare id) matches ONLY the
//   regular mesh; the instanced + batched members are invisible to it → only 1 of 3 members would tint.
var oldHits = [rMesh, iMesh, bMesh, other].filter(function (m) {
  var set = { 'MEMBER_REG': 1, 'MEMBER_INST': 1, 'MEMBER_BATCH': 1 };
  return set[A.guidMap[m.id]];                            // bare-id lookup — the old meshesFor()
}).length;
ok('M0-bug-bare-lookup-misses-instanced', oldHits === 1,
  'pre-fix: bare `guidMap[obj.id]` matches ONLY the regular member (1/3) — instanced(7000_3)+batched(8000_5) keys are invisible (this is why tintedMeshes=0)');

// ---- M1 — guidTargets reverse-indexes the `_N` suffix: 3 targets, correct slots (instanced/batched carry slot).
var tgt = B.guidTargets([REG, INST, BAT], guidMap);
var byGuid = {}; tgt.forEach(function (t) { byGuid[t.guid] = t; });
ok('M1-targets-resolve-slots', tgt.length === 3
  && byGuid[REG].meshId === 4012 && byGuid[REG].slot === null
  && byGuid[INST].meshId === 7000 && byGuid[INST].slot === 3
  && byGuid[BAT].meshId === 8000 && byGuid[BAT].slot === 5,
  'guidTargets handles the `_N` suffix → 3 targets: regular(slot=null), instanced(7000 slot 3), batched(8000 slot 5) — ' + JSON.stringify(tgt));

// ---- M2 — the REAL port tints ALL THREE members (regular emissive + instanced/batched setColorAt). tintedMeshes>0.
var GREEN = parseInt('2e7d32', 16);
var port = HBALens.buildMeshPort(A, {});
port.setTint('RM_TEST', '#2e7d32');
ok('M2-tints-all-member-kinds',
  rMesh.material.emissive.getHex() === GREEN && iMesh._c[3] === GREEN && bMesh._c[5] === GREEN
  && iMesh.instanceColor && iMesh.instanceColor.needsUpdate === true && port.tintedCount() === 3,
  'setTint paints the regular mesh (emissive) AND the instanced instance #3 AND the batched slot #5 (setColorAt) → tintedMeshes=' + port.tintedCount() + ' (was 0 pre-fix)');

// ---- M3 — non-invent: the unrelated element (not in the room) is NEVER touched, and other instances stay white.
ok('M3-noninvent-untouched', other.material.emissive.getHex() === 0 && iMesh._c[0] === undefined && iMesh._c[4] === undefined,
  'the unrelated mesh (9999) and every NON-member instance of 7000 stay untouched (no faked tint)');

// ---- M4 — restore: every touched target reverts (emissive→0, instanced/batched slot→white identity), count→0.
port.restoreAll();
var iBack = new Color(); iMesh.getColorAt(3, iBack);
var bBack = new Color(); bMesh.getColorAt(5, bBack);
ok('M4-restore-zero-residue',
  rMesh.material.emissive.getHex() === 0 && iBack.getHex() === 0xffffff && bBack.getHex() === 0xffffff
  && port.tintedCount() === 0 && A._dirty > 0,
  'restoreAll reverts the regular emissive AND the instanced/batched slots to identity white → zero residue, tintedMeshes=0, markDirty fired');

// ---- M5 — gate honesty: a room whose members are NOT rendered → 0 targets → 0 tints (no paint without data).
var ghost = HBALens.buildMeshPort(makeAPP(guidMap, [rMesh, iMesh, bMesh, other], { 'RM_GHOST': ['NOT-RENDERED-1'] }), {});
ghost.setTint('RM_GHOST', '#2e7d32');
ok('M5-no-data-no-paint', ghost.tintedCount() === 0,
  'a room with no rendered member tints nothing (the honest no-data path — never a fabricated highlight)');

// ---- M6 — THE APPLYOVERLAY SEAM (the gap the synthetic witnesses MISSED, live tintedMeshes=0). The real engine
//   applyOverlay must drive setTint from the LINKED ZONE list. A linked zone is an un-rendered ROOM (its guid is
//   NOT in allGuids()), so the old `allGuids ∩ linked` intersection was empty → 0 paint. Here RM_TEST is NOT a
//   rendered guid; its members ARE (incl. instanced/batched). applyOverlay(port, plan) must still tint all 3.
var O = self.HbaOverlay;
var A2 = makeAPP(guidMap, [regMesh(4012), instMesh(7000), batchMesh(8000), regMesh(9999)], roomMembers);
var roomIsRendered = A2.collectMeshes(function (o) { return o.isMesh; }).some(function (m) { return A2.guidMap[m.id] === 'RM_TEST'; });
var port2 = HBALens.buildMeshPort(A2, {});
var n = O.applyOverlay(port2, { linked: ['RM_TEST'], tints: { 'RM_TEST': { color: '#2e7d32' } } });
ok('M6-applyOverlay-tints-unrendered-room', roomIsRendered === false && n === 1 && port2.tintedCount() === 3,
  'applyOverlay drives setTint from the linked ZONE (RM_TEST, NOT a rendered guid) → its 3 rendered members tint, tintedMeshes=' + port2.tintedCount() + ' (was 0 — the live bug the synthetic witnesses masked)');

// ---- M7 — and toggling OFF via the seam (clearOverlay/restoreAll) leaves zero residue on instanced/batched too.
O.clearOverlay(port2);
ok('M7-applyOverlay-restore', port2.tintedCount() === 0,
  'clearOverlay restores every tinted member (regular + instanced/batched) → zero residue');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-MESHPORT ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
