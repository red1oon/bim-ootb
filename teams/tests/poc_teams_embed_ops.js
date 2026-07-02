// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-EMBED-OPS (teams/ROADMAP.md §S9 follow-up).
//   PROVES: the gated embed's data feed (teams/erp/teams_embed_ops.js) maps the LIVE iDempiere model
//   into canonical Teams ops with ZERO invention — and the existing folds (erp_optics.involvement,
//   dot_layer.dotLayerModel) light up with the REAL names/roles/projects, NOT seeded literals.
//
//   ISSUE EACH TEST NAMES (CLAUDE.md — a test must name what it proves/disproves):
//     T1 author resolves to a REAL AD_User.Name (GardenAdmin/GardenUser) — proves: no invented actor.
//     T2 role resolves to a REAL ad_role.name (GardenWorld Admin/User)    — proves: live AD_Role join works.
//     T3 target is a REAL HHS IfcSpace room guid OR the HHS_Office project — proves: building+doc anchors.
//     T4 NON-INVENT: an unknown ad_user_id → `unlinked`, never a faked name — proves: the guard holds.
//     T5 involvement(perDoc) participants are the REAL employee names      — proves: end-to-end fold.
//     T6 dotLayerModel person dots colour-by-signer over the real anchors  — proves: optic consumes the feed.
//   Read the log after every run (Log Mandate). Real data only — fails honestly if ad_seed.db drifts.
'use strict';
var path = require('path');
var fs = require('fs');
function reqSql() {
  var tries = ['sql.js', '/home/red1/bim-ootb/node_modules/sql.js',
               path.join(__dirname, '..', '..', 'node_modules', 'sql.js'),
               path.join(__dirname, '..', '..', 'tests', 'node_modules', 'sql.js')];
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (e) {} }
  throw new Error('sql.js not resolvable');
}
var Adapter = require(path.join(__dirname, '..', 'erp', 'teams_embed_ops.js'));
var Optics  = require(path.join(__dirname, '..', 'erp', 'erp_optics.js'));
var DotLayer = require(path.join(__dirname, '..', 'overlay', 'dot_layer.js'));

// REAL ad_seed.db (the iDempiere Application Dictionary seed) — resolve from the checkout.
function findSeedDb() {
  var tries = [path.join(__dirname, '..', '..', 'erp', 'ad_seed.db'),
               '/tmp/wt-redpill/erp/ad_seed.db', '/home/red1/bim-ootb/erp/ad_seed.db'];
  for (var i = 0; i < tries.length; i++) if (fs.existsSync(tries[i])) return tries[i];
  throw new Error('ad_seed.db not found — needs the real iDempiere AD seed');
}

// REAL HHS_Office rooms (IfcSpace guids) from the HR lane fixture, else the known guids.
function hhsRooms() {
  var tries = ['/tmp/wt-hr/hr_bim_asset/fixtures/hhs_rooms.json'];
  for (var i = 0; i < tries.length; i++) {
    try { var j = JSON.parse(fs.readFileSync(tries[i], 'utf8')); if (j.rooms) return j.rooms.map(function (r) { return r.guid; }); } catch (e) {}
  }
  return ['RM_Level_1_1', 'RM_Level_1_2', 'RM_Level_1_3'];   // honest fallback (still REAL guids)
}

var pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log('   🟢 ' + name + (detail ? '  — ' + detail : '')); } else { fail++; console.log('   ⛔ ' + name + (detail ? '  — ' + detail : '')); } }

(async function () {
  var SQL = await reqSql()();
  var db = new SQL.Database(fs.readFileSync(findSeedDb()));
  var rooms = hhsRooms();

  console.log('\n═══ W-EMBED-OPS — live iDempiere model → canonical Teams ops (NON-INVENT) ═══\n');

  // 1) inject the HHS_Office C_Project doc-anchor (mockup metadata).
  var hhsProj = Adapter.ensureHhsProject(db);
  // 2) seed FK-ONLY team_activity using REAL GardenWorld employee ids + REAL HHS rooms.
  //    101 GardenAdmin (C_BPartner 113, IsEmployee=Y) role 102 GardenWorld Admin
  //    102 GardenUser  (C_BPartner 119, IsEmployee=Y) role 103 GardenWorld User
  var seeded = Adapter.seedTeamActivity(db, [
    { ts: 1000, ad_user_id: 101, ad_role_id: 102, c_project_id: hhsProj, bim_guid: rooms[0], verb: 'ASSIGN', cls: 'doc' },
    { ts: 2000, ad_user_id: 102, ad_role_id: 103, c_project_id: hhsProj, bim_guid: rooms[1], verb: 'PREPARE', cls: 'doc' },
    { ts: 3000, ad_user_id: 101, ad_role_id: 102, c_project_id: hhsProj, bim_guid: rooms[1], verb: 'APPROVE', cls: 'doc' },
    { ts: 4000, ad_user_id: 102, ad_role_id: 103, c_project_id: hhsProj, verb: 'POST', cls: 'doc' }, // ERP-doc lens (no room → C_Project)
    { ts: 5000, ad_user_id: 102, ad_role_id: 103, c_project_id: hhsProj, bim_guid: rooms[0], verb: 'PIN', cls: 'annot', params: { msg: 'check clearance', pinId: 'p1' } },
    { ts: 6000, ad_user_id: 99999, ad_role_id: null, c_project_id: hhsProj, bim_guid: rooms[2], verb: 'POST', cls: 'doc' } // unknown user → unlinked
  ]);
  console.log('   · seeded HHS_Office project id=' + hhsProj + ', team_activity rows=' + seeded + ', rooms=' + rooms.length);

  var ops = Adapter.buildOps(db);
  console.log('   · canonical ops built=' + ops.length);

  // T1 — author is a REAL AD_User.Name
  var authors = ops.filter(function (o) { return !o.unlinked; }).map(function (o) { return o.author; });
  ok('T1 author = REAL AD_User.Name', authors.indexOf('GardenAdmin') >= 0 && authors.indexOf('GardenUser') >= 0,
     'authors=' + JSON.stringify(Array.from(new Set(authors))));

  // T2 — role is a REAL ad_role.name
  var roles = Array.from(new Set(ops.map(function (o) { return o.role; }).filter(Boolean)));
  ok('T2 role = REAL ad_role.name', roles.indexOf('GardenWorld Admin') >= 0 && roles.indexOf('GardenWorld User') >= 0,
     'roles=' + JSON.stringify(roles));

  // T3 — target is a REAL HHS room guid OR the HHS_Office project
  var roomOp = ops.filter(function (o) { return o.target === rooms[0] || o.target === rooms[1]; });
  var projOp = ops.filter(function (o) { return o.target === 'C_Project:HHS_Office'; });
  ok('T3 target = REAL HHS room guid (building lens)', roomOp.length >= 2, 'room-anchored=' + roomOp.length + ' e.g. ' + (roomOp[0] && roomOp[0].target));
  ok('T3 target = HHS_Office project (ERP-doc lens)', projOp.length >= 1, 'project-anchored=' + projOp.length + ' (' + (projOp[0] && projOp[0].project) + ')');

  // T4 — NON-INVENT guard: unknown ad_user_id → unlinked, never a faked name
  var bad = ops.filter(function (o) { return o.unlinked; });
  ok('T4 unknown ad_user_id → unlinked (no faked name)', bad.length === 1 && /unlinked user/.test(bad[0].author),
     'unlinked=' + bad.length + ' author=' + (bad[0] && bad[0].author));

  // T5 — involvement participants are the REAL employee names
  var inv = Optics.involvement(ops, {});
  var projDoc = inv.perDoc['C_Project:HHS_Office'];
  ok('T5 involvement participants = REAL employees', !!projDoc && projDoc.participants.indexOf('GardenUser') >= 0,
     projDoc ? 'C_Project:HHS_Office participants=' + JSON.stringify(projDoc.participants) : 'no perDoc');

  // T6 — dot_layer person dots over the real anchors, colour=signer (deterministic per author)
  var model = DotLayer.dotLayerModel(ops, { on: true, maxVisible: 2 });
  var roomCluster = model.clusters.filter(function (c) { return c.anchor === rooms[1] && c.kind === 'person'; })[0];
  var colorStable = roomCluster && roomCluster.dots.every(function (d) { return /^(#|hsl|rgb)/.test(d.color); })
    && new Set(roomCluster.dots.map(function (d) { return d.color; })).size === roomCluster.dots.length; // distinct signer ⇒ distinct colour
  ok('T6 dotLayer person dots on real room anchor', !!roomCluster && roomCluster.count >= 1 && colorStable,
     roomCluster ? rooms[1] + ' → ' + roomCluster.count + ' person dot(s), colours=' + JSON.stringify(roomCluster.dots.map(function (d) { return d.initials + d.color; })) : 'no cluster');

  console.log('\n' + (fail === 0 ? '✅ W-EMBED-OPS ' + pass + '/' + pass + ' PASS' : '⛔ W-EMBED-OPS ' + pass + ' pass / ' + fail + ' FAIL'));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.log('⛔ W-EMBED-OPS threw: ' + e.stack); process.exit(1); });
