// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: headless §-witness for idempiere.html LOGIN / Role·Client·Org session (renderer #1).
//   THE CLAIM (docs/IDEMPIERE_RENDERER_SPEC.md §3b/§3b.1): the recognizable iDempiere on-ramp —
//   pick user → Role/Client/Org → role-scoped menu + client/org-scoped data — folds ENTIRELY from
//   real rows in ad_seed.db (AD_User/AD_User_Roles/AD_Role/AD_Client/AD_Role_OrgAccess/AD_Org/
//   AD_Window_Access). No hand-authored identity. This test runs the SAME idmp_session.js folds the
//   page uses, over the SAME ad_seed.db, and asserts each step + that role scope HIDES windows.
//   §-log first — READ the log before any conclusion.
// Run:  node tests/test_idempiere_login.js 2>&1 | tee tests/test_idempiere_login.log   (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path');
var initSqlJs = require('sql.js');
var VIEWER = path.join(__dirname, '..');

global.window = global.window || {};                 // ad_parser + idmp_session are browser IIFEs
var ADParser = require(path.join(VIEWER, 'ad_parser.js'));
var Session = require(path.join(VIEWER, 'idmp_session.js'));

var fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('  ✗ FAIL: ' + msg); } else { console.log('  ✓ ' + msg); } }

(async function () {
  console.log('=== §IDEMPIERE-LOGIN witness — login + Role·Client·Org session folds from the AD ===');
  var SQL = await initSqlJs();
  var buf = fs.readFileSync(path.join(VIEWER, 'ad_seed.db'));
  var db = new SQL.Database(new Uint8Array(buf));

  // ── ISSUE 1: the login user list folds from AD_User; role-less users are NAMED, not dropped ──
  console.log('\n[ISSUE 1] login user list (AD_User) + hasRoles flags seed reality');
  var users = Session.listUsers(db);
  ok(users.length === 8, 'AD_User returns 8 users (got ' + users.length + ')');
  var withRoles = users.filter(function (u) { return u.hasRoles; });
  var without = users.filter(function (u) { return !u.hasRoles; });
  ok(withRoles.length === 4, 'exactly 4 users have roles — can log in (got ' + withRoles.length + ': ' + withRoles.map(function (u) { return u.name; }).join(',') + ')');
  ok(without.length === 4, '4 users have NO roles — disabled, named not dropped (' + without.map(function (u) { return u.name; }).join(',') + ')');

  // ── ISSUE 2: GardenAdmin → roles → client (a role fixes its client) ──
  console.log('\n[ISSUE 2] roles for a user, and the client a role fixes');
  var admin = users.filter(function (u) { return u.name === 'GardenAdmin'; })[0];
  ok(!!admin, 'GardenAdmin present in AD_User');
  var roles = Session.rolesForUser(db, admin.id);
  ok(roles.length === 3, 'GardenAdmin has 3 roles (got ' + roles.length + ': ' + roles.map(function (r) { return r.name; }).join(',') + ')');
  var adminRole = roles.filter(function (r) { return r.name === 'GardenWorld Admin'; })[0];
  ok(!!adminRole, 'role "GardenWorld Admin" available to GardenAdmin');
  var client = Session.clientFor(db, adminRole.id);
  ok(client && client.id === 11 && /GardenWorld/.test(client.name), 'role fixes client = GardenWorld(11) (got ' + (client ? client.name + '(' + client.id + ')' : 'none') + ')');

  // ── ISSUE 3: orgs the role may access; org 0 = "*" (All) offered ──
  console.log('\n[ISSUE 3] org access (AD_Role_OrgAccess), incl. org 0 = "*" (All)');
  var orgs = Session.orgsForRole(db, adminRole.id);
  ok(orgs.length === 10, 'GardenWorld Admin has 10 org-access rows (got ' + orgs.length + ')');
  ok(orgs.some(function (o) { return o.id === 0; }), 'org 0 = "*" (All) is offered for the Admin role');
  ok(orgs.some(function (o) { return o.id === 11 && /HQ/.test(o.name); }), 'org HQ(11) present');

  // ── ISSUE 4: role-scoped menu — AD_Window_Access HIDES windows the role can't open ──
  console.log('\n[ISSUE 4] role-scoped menu (AD_Window_Access prunes the AD_Menu tree)');
  var roots = ADParser.getMenuTree(db);
  var winSetAdmin = Session.accessibleWindows(db, adminRole.id);    // role 102
  var scopedAdmin = Session.scopeMenu(roots, winSetAdmin);
  ok(scopedAdmin.total > 0, 'menu has W-windows to scope (total=' + scopedAdmin.total + ')');
  ok(scopedAdmin.visible < scopedAdmin.total, 'Admin scope HIDES some windows — proves it is a real filter (' + scopedAdmin.visible + '/' + scopedAdmin.total + ')');

  // a LOWER-privilege role must see strictly fewer windows than Admin (proves scope varies by role)
  var userRole = users.filter(function (u) { return u.name === 'GardenUser'; })[0];
  var gUserRoles = Session.rolesForUser(db, userRole.id);
  var plainRole = gUserRoles.filter(function (r) { return r.name === 'GardenWorld User'; })[0];
  ok(!!plainRole, 'role "GardenWorld User" available to GardenUser');
  var scopedUser = Session.scopeMenu(roots, Session.accessibleWindows(db, plainRole.id)); // role 103
  ok(scopedUser.visible < scopedAdmin.visible, 'GardenWorld User sees FEWER windows than Admin (' + scopedUser.visible + ' < ' + scopedAdmin.visible + ') — role scope varies');

  // ── ISSUE 5: buildContext composes the whole session in one fold ──
  console.log('\n[ISSUE 5] buildContext composes user→role→client→org→winSet');
  var ctx = Session.buildContext(db, admin.id, { roleId: adminRole.id, orgId: 11 });
  ok(ctx && ctx.user.name === 'GardenAdmin', 'ctx.user = GardenAdmin');
  ok(ctx.role.name === 'GardenWorld Admin', 'ctx.role = GardenWorld Admin');
  ok(ctx.client.id === 11, 'ctx.client = GardenWorld(11)');
  ok(ctx.org && ctx.org.id === 11, 'ctx.org = HQ(11)');
  ok(Object.keys(ctx.winSet).length > 0, 'ctx.winSet populated (' + Object.keys(ctx.winSet).length + ' windows)');

  // role-less user yields no context (faithful — cannot log in)
  var sys = users.filter(function (u) { return u.name === 'System'; })[0];
  ok(Session.buildContext(db, sys.id) === null, 'role-less user (System) → null context (cannot log in)');

  console.log('\n§IDEMPIERE-LOGIN user=' + ctx.user.name + ' roles=' + roles.length +
    ' client=' + ctx.client.name + '(' + ctx.client.id + ') org=' + ctx.org.name.replace(/\s.*/, '') +
    ' menu-visible=' + scopedAdmin.visible + '/' + scopedAdmin.total +
    ' source=ad_user/ad_role/ad_window_access handAuthored=0');

  console.log('\n=== RESULT: ' + (fails === 0 ? 'ALL PASS — the iDempiere login folds from the AD' : fails + ' FAIL') + ' ===');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL: ' + e.message + '\n' + e.stack); process.exit(1); });
