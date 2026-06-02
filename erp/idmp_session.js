// idmp_session.js — iDempiere login / Role·Client·Org session fold (renderer #1).
// Implementing docs/IDEMPIERE_RENDERER_SPEC.md §3b + §3b.1 — Witness: §IDEMPIERE-LOGIN.
// Pure folds over ad_seed.db (AD_User, AD_User_Roles, AD_Role, AD_Client, AD_Role_OrgAccess,
// AD_Org, AD_Window_Access). No DOM, no writes — the SAME calls the headless witness makes.
// HONEST: no server → identity/context SELECTION, not password auth (docs §3b honest framing).
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  // db.exec → array of {column,value} row objects (mirrors ad_data.readRecords shape).
  function rows(db, sql, params) {
    var r = db.exec(sql, params || []);
    if (!r.length) return [];
    var cols = r[0].columns;
    return r[0].values.map(function (v) {
      var o = {}; for (var i = 0; i < cols.length; i++) o[cols[i]] = v[i]; return o;
    });
  }
  function num(v) { return v == null ? null : Number(v); }

  // ── Step 1: the login user list (all 8 AD_User rows; hasRoles flags seed reality) ──
  // Only users with an AD_User_Roles row can proceed (faithful to iDempiere). Role-less
  // users are returned too so the UI can NAME them disabled, not silently drop them.
  function listUsers(db) {
    var us = rows(db,
      'SELECT u.AD_User_ID AS id, u.Name AS name, u.AD_Client_ID AS clientId, ' +
      '  (SELECT COUNT(*) FROM AD_User_Roles ur WHERE ur.AD_User_ID = u.AD_User_ID) AS nRoles ' +
      'FROM AD_User u WHERE u.IsActive = \'Y\' ORDER BY u.AD_User_ID');
    var out = us.map(function (u) {
      return { id: num(u.id), name: (u.name || '').trim(), clientId: num(u.clientId), hasRoles: num(u.nRoles) > 0 };
    });
    var withRoles = out.filter(function (u) { return u.hasRoles; }).length;
    console.log('§IDMP-SESSION listUsers users=' + out.length + ' withRoles=' + withRoles + ' source=ad_user/ad_user_roles');
    return out;
  }

  // ── Step 2: roles for a user (the Role dropdown) ──
  function rolesForUser(db, userId) {
    var rs = rows(db,
      'SELECT r.AD_Role_ID AS id, r.Name AS name, r.AD_Client_ID AS clientId ' +
      'FROM AD_User_Roles ur JOIN AD_Role r ON ur.AD_Role_ID = r.AD_Role_ID ' +
      'WHERE ur.AD_User_ID = ? AND r.IsActive = \'Y\' ORDER BY r.Name', [userId]);
    var out = rs.map(function (r) { return { id: num(r.id), name: (r.name || '').trim(), clientId: num(r.clientId) }; });
    console.log('§IDMP-SESSION rolesForUser user=' + userId + ' roles=' + out.length + ' source=ad_user_roles/ad_role');
    return out;
  }

  // ── Step 3: the client a role fixes (AD_Role.AD_Client_ID → AD_Client) ──
  function clientFor(db, roleId) {
    var c = rows(db,
      'SELECT cl.AD_Client_ID AS id, cl.Name AS name FROM AD_Role r ' +
      'JOIN AD_Client cl ON r.AD_Client_ID = cl.AD_Client_ID WHERE r.AD_Role_ID = ?', [roleId]);
    var out = c.length ? { id: num(c[0].id), name: (c[0].name || '').trim() } : null;
    console.log('§IDMP-SESSION clientFor role=' + roleId + ' client=' + (out ? out.name + '(' + out.id + ')' : 'none') + ' source=ad_role/ad_client');
    return out;
  }

  // ── Step 4: orgs a role may access (AD_Role_OrgAccess LEFT JOIN AD_Org). ──
  // Org 0 = "*" (All accessible) is a real grant row in AD_Role_OrgAccess but has NO AD_Org row
  // (the iDempiere "*" convention, like client 0 = System) — so it is LEFT-joined and kept, named
  // "*" from convention, not invented. AD_Role_OrgAccess is the driver so org 0 is never dropped.
  function orgsForRole(db, roleId) {
    var os = rows(db,
      'SELECT oa.AD_Org_ID AS id, o.Name AS name FROM AD_Role_OrgAccess oa ' +
      'LEFT JOIN AD_Org o ON oa.AD_Org_ID = o.AD_Org_ID ' +
      'WHERE oa.AD_Role_ID = ? AND oa.IsActive = \'Y\' ORDER BY oa.AD_Org_ID', [roleId]);
    var out = os.map(function (o) {
      var id = num(o.id);
      return { id: id, name: id === 0 ? '* (All accessible)' : (o.name || '').trim() };
    });
    console.log('§IDMP-SESSION orgsForRole role=' + roleId + ' orgs=' + out.length + ' source=ad_role_orgaccess/ad_org');
    return out;
  }

  // ── role-scope: the set of AD_Window_IDs the role may open (AD_Window_Access) ──
  function accessibleWindows(db, roleId) {
    var ws = rows(db,
      'SELECT DISTINCT AD_Window_ID AS id FROM AD_Window_Access ' +
      'WHERE AD_Role_ID = ? AND IsActive = \'Y\'', [roleId]);
    var set = {};
    ws.forEach(function (w) { if (w.id != null) set[Number(w.id)] = 1; });
    console.log('§IDMP-SESSION accessibleWindows role=' + roleId + ' windows=' + Object.keys(set).length + ' source=ad_window_access');
    return set;
  }

  // ── prune the AD_Menu tree to the role's accessible windows ──
  // Hide action='W' leaves whose windowId ∉ winSet; then drop summary folders left empty.
  // Non-W leaves (P/R/F/X/I/T) are NOT access-scoped here (§3b.1 bounded scope). Returns a
  // new pruned tree (input is not mutated) plus visible/total W-window counts.
  function scopeMenu(roots, winSet) {
    var total = {}, visible = {};
    function prune(node) {
      var isFolder = node.isSummary || (node.children && node.children.length);
      if (isFolder) {
        var kids = (node.children || []).map(prune).filter(Boolean);
        if (!kids.length) return null;                       // empty folder → drop
        var copy = {}; for (var k in node) copy[k] = node[k];
        copy.children = kids; return copy;
      }
      if (node.action === 'W' && node.windowId != null) {
        var wid = Number(node.windowId); total[wid] = 1;
        if (!winSet[wid]) return null;                       // window the role can't open → drop
        visible[wid] = 1;
      }
      return node;
    }
    var tree = (roots || []).map(prune).filter(Boolean);
    var out = { tree: tree, visible: Object.keys(visible).length, total: Object.keys(total).length };
    console.log('§IDMP-SESSION scopeMenu visibleWindows=' + out.visible + '/' + out.total + ' roots=' + tree.length);
    return out;
  }

  // ── compose the full login context (used by the page + the witness) ──
  // Picks the user's first role unless roleId given; client is fixed by the role; org defaults
  // to the first accessible (often 0=All). Returns the session object + the scoped menu counts.
  function buildContext(db, userId, opts) {
    opts = opts || {};
    var roles = rolesForUser(db, userId);
    if (!roles.length) { console.log('§IDMP-SESSION buildContext user=' + userId + ' NO-ROLES (cannot log in)'); return null; }
    var role = roles.filter(function (r) { return r.id === opts.roleId; })[0] || roles[0];
    var client = clientFor(db, role.id);
    var orgs = orgsForRole(db, role.id);
    var org = orgs.filter(function (o) { return o.id === opts.orgId; })[0] || orgs[0] || null;
    var users = listUsers(db);
    var user = users.filter(function (u) { return u.id === Number(userId); })[0] || { id: Number(userId), name: '#' + userId };
    var winSet = accessibleWindows(db, role.id);
    return {
      user: user, role: role, client: client, org: org,
      roles: roles, orgs: orgs, winSet: winSet
    };
  }

  var IdmpSession = {
    listUsers: listUsers,
    rolesForUser: rolesForUser,
    clientFor: clientFor,
    orgsForRole: orgsForRole,
    accessibleWindows: accessibleWindows,
    scopeMenu: scopeMenu,
    buildContext: buildContext
  };

  if (typeof window !== 'undefined') window.IdmpSession = IdmpSession;
  if (typeof module !== 'undefined' && module.exports) module.exports = IdmpSession;

  console.log('§IDMP-SESSION_LOADED v1');
})();
