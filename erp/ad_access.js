// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_access.js — AD role/access gate (W-ACCESS). The security-layer twin of the op-level
// owner-gate (scripts/poc_distributed.js G-SINGLE-WRITER). Self-contained, no kernel dep.
// Implementing ERP_COVERAGE_MATRIX.md §AD_Role/§AD_Window_Access/§AD_Process_Access/
//   §AD_Form_Access/§AccessLevel/§AD_EntityType — Witness: W-ACCESS
//
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// SPEC (EXTRACT, do NOT invent) — the grants ARE the data; this engine only interprets them.
//   The grant rows + AccessLevel come from build/erp/ad_full.db (lowercase: ad_role, ad_window_access,
//   ad_process_access, ad_form_access, ad_table.accesslevel, ad_entitytype). NEVER hand-author a grant.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// Java home: org.compiere.model.MRole.java (3533 LOC). Ported faithfully:
//   - getWindowAccess  (MRole.java:1610-1693): SELECT AD_Window_ID, IsReadWrite, IsActive FROM
//       AD_Window_Access WHERE AD_Role_ID=?. Result map: row present + IsActive='Y'  -> Boolean(IsReadWrite='Y')
//       (true=read-write, false=read-only); NO row -> null = NOT VISIBLE. An IsActive='N' row REMOVES access.
//   - getProcessAccess (MRole.java:1701-1789): same shape over AD_Process_Access.
//   - getFormAccess    (MRole.java:1888-1972): same shape over AD_Form_Access.
//     (ASP_* subscription filtering is a tenant overlay — not present in this seed; named-deferred.)
//   - canView (MRole.java:2422-2465): record-scope vs AD_Table.AccessLevel using the role UserLevel,
//     a 3-char 'SCO' string (System/Client/Org positions):
//       7 All            -> always view
//       4 SystemOnly     -> requires userLevel[0]=='S'
//       2 ClientOnly     -> requires userLevel[1]=='C'
//       1 Organization   -> requires userLevel[2]=='O'
//       3 Client+Org     -> requires userLevel[1]=='C' OR userLevel[2]=='O'
//       6 System+Client  -> requires userLevel[0]=='S' OR userLevel[1]=='C'
//     AccessLevel is also a BITMASK over {1=Org, 2=Client, 4=System} — 3=1|2, 6=2|4, 7=1|2|4 — which is
//     exactly the SCO-overlap canView encodes; we expose both the bit view (accessLevelBits) and canView.
//   - Org/Client record scope: a role with isAccessAllOrgs='N' may only touch a record whose AD_Org_ID is in
//     its org set (org 0 = '*' shared, always allowed — MRole.getOrgAccess); AD_Client_ID must be in clients.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // AccessLevel bit constants (X_AD_Table.ACCESSLEVEL_*; the value is the bitmask itself).
  var BIT_ORG = 1, BIT_CLIENT = 2, BIT_SYSTEM = 4;

  // accessLevelBits('3') -> {org:true,client:true,system:false}; the level string IS the bitmask value.
  function accessLevelBits(level) {
    var n = parseInt(level, 10) || 0;
    return { org: !!(n & BIT_ORG), client: !!(n & BIT_CLIENT), system: !!(n & BIT_SYSTEM), value: n };
  }

  // canView(userLevel 'SCO', tableAccessLevel) — faithful port of MRole.canView:2422-2465.
  function canView(userLevel, tableLevel) {
    var u = String(userLevel || '   ');
    var S = u.charAt(0), C = u.charAt(1), O = u.charAt(2);
    switch (String(tableLevel)) {
      case '7': return true;                                   // All
      case '4': return S === 'S';                              // System only
      case '2': return C === 'C';                              // Client only
      case '1': return O === 'O';                              // Organization
      case '3': return C === 'C' || O === 'O';                 // Client+Org
      case '6': return S === 'S' || C === 'C';                 // System+Client
      default:  return true;                                   // unknown level -> permissive (matches default branch)
    }
  }

  // ── Role context ────────────────────────────────────────────────────────────────────────────────────
  // A RoleContext wraps the grant maps + scope built from real AD rows (see buildRole below).
  //   { AD_Role_ID, name, userLevel:'SCO', isAccessAllOrgs:bool, orgs:Set, clients:Set,
  //     win:Map<id,bool>, proc:Map<id,bool>, form:Map<id,bool>, entityTypes:Set }
  function RoleContext(o) {
    this.AD_Role_ID    = o.AD_Role_ID;
    this.name          = o.name || ('Role#' + o.AD_Role_ID);
    this.userLevel     = o.userLevel || '   ';
    this.isAccessAllOrgs = !!o.isAccessAllOrgs;
    this.orgs          = toSet(o.orgs);          // org ids the role may touch (0 = '*' shared)
    this.clients       = toSet(o.clients);       // client ids the role belongs to
    this.win           = o.win  || new Map();    // AD_Window_ID  -> isReadWrite(bool)
    this.proc          = o.proc || new Map();    // AD_Process_ID -> isReadWrite(bool)
    this.form          = o.form || new Map();    // AD_Form_ID    -> isReadWrite(bool)
    this.entityTypes   = toSet(o.entityTypes);   // entitytype values the role's dictionary scope allows
    // canUpdate inputs (MRole.java:825-950 loadOrgAccess, :1369 loadTableAccess) — additive, absent = empty
    this.clientId      = o.clientId != null ? o.clientId : null;                 // MRole.getAD_Client_ID
    this.orgAccess     = o.orgAccess || [];      // [{client, org, readOnly}] AD_Role_OrgAccess IsActive='Y'
    this.tableAccess   = o.tableAccess || [];    // [{table, rule, exclude, readOnly}] AD_Table_Access IsActive='Y'
    this.useUserOrgAccess = !!o.useUserOrgAccess;
  }
  function toSet(a) {
    if (a instanceof Set) return a;
    var s = new Set(); (a || []).forEach(function (x) { s.add(x); }); return s;
  }

  // gateWindow / gateProcess / gateForm — the MRole.getXxxAccess verdict.
  //   returns { allowed, readWrite, reason }. allowed=false reason='no-grant' (null map entry).
  function gateAccess(map, id) {
    if (!map.has(id)) return { allowed: false, readWrite: false, reason: 'no-grant' };
    var rw = map.get(id);
    return { allowed: true, readWrite: !!rw, reason: rw ? 'grant-rw' : 'grant-ro' };
  }
  RoleContext.prototype.gateWindow  = function (id) { return gateAccess(this.win,  id); };
  RoleContext.prototype.gateProcess = function (id) { return gateAccess(this.proc, id); };
  RoleContext.prototype.gateForm    = function (id) { return gateAccess(this.form, id); };

  // gateRecord — record-level: AccessLevel (canView) AND org/client scope.
  //   tableAccessLevel from ad_table.accesslevel; record carries {AD_Org_ID, AD_Client_ID}.
  //   reason ∈ {ok, wrong-accesslevel, wrong-org, wrong-client}.
  RoleContext.prototype.gateRecord = function (tableAccessLevel, record) {
    record = record || {};
    if (!canView(this.userLevel, tableAccessLevel))
      return { allowed: false, reason: 'wrong-accesslevel' };
    var org = record.AD_Org_ID, client = record.AD_Client_ID;
    if (client != null && this.clients.size && !this.clients.has(client))
      return { allowed: false, reason: 'wrong-client' };
    // org 0 = shared '*' is always allowed (MRole.getOrgAccess); else must be in the role's org set
    if (!this.isAccessAllOrgs && org != null && org !== 0 && this.orgs.size && !this.orgs.has(org))
      return { allowed: false, reason: 'wrong-org' };
    return { allowed: true, reason: 'ok' };
  };

  // ── canUpdate — the DATA-level write check iDempiere runs on save (not window access).
  // Implementing prompts/TEAMWORK_FRAMEWORK.md §12.7 (CL4) — Witness: W-ADMIT-FOLD.
  // Ported from org.compiere.model.MRole: canUpdate :2335-2390, isClientAccess :1161-1185, isOrgAccess :1246-1267,
  // isTableAccess :1369-1418, isTableAccessLevel :1426-1463. NOT ported (named): isRecordAccess (AD_Record_Access —
  // 0 rows in the seed), summary-org tree expansion in loadOrgAccess, and AD_User_OrgAccess (a role with
  // IsUseUserOrgAccess='Y' is refused fail-closed rather than judged on half the rules).
  RoleContext.prototype.isClientAccess = function (client, rw) {
    if (client === 0 && !rw) return true;                                  // :1163 can always read System
    if (this.isAccessAllOrgs) return this.clientId === client;             // :1167
    for (var i = 0; i < this.orgAccess.length; i++) {
      var a = this.orgAccess[i];
      if (a.client === client) { if (!rw) return true; if (!a.readOnly) return true; }
    }
    return false;
  };
  RoleContext.prototype.isOrgAccess = function (org, rw) {
    if (this.isAccessAllOrgs) return true;                                 // :1248
    if (org === 0 && !rw) return true;                                     // :1250 can always read common org
    for (var i = 0; i < this.orgAccess.length; i++) {
      var a = this.orgAccess[i];
      if (a.org === org) { if (!rw) return true; return !a.readOnly; }
    }
    return false;
  };
  RoleContext.prototype.isTableAccessLevel = function (level, ro) {
    if (ro) return true;                                                   // :1428 role can always read
    if (level == null) return false;
    level = String(level); var ul = this.userLevel;
    if (level === '7') return true;
    if (ul.charAt(0) === 'S' && (level === '4' || level === '6')) return true;
    if (ul.charAt(1) === 'C' && (level === '2' || level === '6')) return true;
    if (ul.charAt(2) === 'O' && (level === '1' || level === '3')) return true;
    return false;
  };
  RoleContext.prototype.isTableAccess = function (tableId, level, ro) {
    if (!this.isTableAccessLevel(level, ro)) return false;
    var has = true;                                                        // :1376 negative list by default
    for (var i = 0; i < this.tableAccess.length; i++) {
      var t = this.tableAccess[i];
      if (t.rule !== 'A') continue;                                        // ACCESSTYPERULE_Accessing only
      if (t.exclude) { if (t.table === tableId) return ro ? t.readOnly : false; }
      else {                                                               // include list: tables outside it get no rw
        has = false;                                                       // (ro default MSysConfig …=false)
        if (t.table === tableId) return ro ? true : !t.readOnly;
      }
    }
    return has;
  };
  RoleContext.prototype.canUpdate = function (client, org, tableId, tableAccessLevel) {
    if (this.useUserOrgAccess) return { allowed: false, reason: 'user-org-access-not-ported' };
    var ul = this.userLevel;
    if (ul.indexOf('S') !== -1) return { allowed: true, reason: 'system' };             // :2340
    var ok = true, miss = '';
    if (client === 0 && org === 0 && ul.charAt(0) !== 'S') { ok = false; miss += 'S'; }
    else if (client !== 0 && org === 0 && ul.charAt(1) !== 'C') {
      if (!(ul.charAt(2) === 'O' && this.isOrgAccess(org, true))) { ok = false; miss += 'C'; }
    } else if (client !== 0 && org !== 0 && ul.charAt(2) !== 'O') { ok = false; miss += 'O'; }
    if (ok) { ok = this.isClientAccess(client, true); miss += 'C'; }                    // :2373
    if (ok) { ok = this.isOrgAccess(org, true); miss = 'W'; }                           // :2379
    if (ok) { ok = this.isTableAccess(tableId, tableAccessLevel, false); if (!ok) miss = 'T'; }
    return { allowed: ok, reason: ok ? 'ok' : 'missing=' + miss };
  };

  // entityTypeAllowed — AD_EntityType dictionary/customization scope (a dictionary object whose
  //   entitytype is outside the role's set is not in scope). Permissive if role declares no set.
  RoleContext.prototype.entityTypeAllowed = function (et) {
    if (!this.entityTypes.size) return true;
    return this.entityTypes.has(et);
  };

  // ── Loader: build a RoleContext by EXTRACTING the real grant rows from an open better-sqlite3 db ──────
  //   db = better-sqlite3 handle on ad_full.db. roleId = ad_role_id. Reads ad_role + the 3 *_access tables,
  //   the role's org access (ad_role_orgaccess if present, else org 0), and the entity types. No invention.
  function buildRole(db, roleId, opts) {
    opts = opts || {};
    var role = db.prepare('SELECT ad_role_id,name,userlevel,isaccessallorgs,ad_client_id,ad_org_id FROM ad_role WHERE ad_role_id=?').get(roleId);
    if (!role) throw new Error('no ad_role row for ' + roleId);
    var win = new Map(), proc = new Map(), form = new Map();
    db.prepare("SELECT ad_window_id AS id, isreadwrite AS rw FROM ad_window_access WHERE ad_role_id=? AND isactive='Y'").all(roleId)
      .forEach(function (r) { win.set(r.id, r.rw === 'Y'); });
    db.prepare("SELECT ad_process_id AS id, isreadwrite AS rw FROM ad_process_access WHERE ad_role_id=? AND isactive='Y'").all(roleId)
      .forEach(function (r) { proc.set(r.id, r.rw === 'Y'); });
    db.prepare("SELECT ad_form_id AS id, isreadwrite AS rw FROM ad_form_access WHERE ad_role_id=? AND isactive='Y'").all(roleId)
      .forEach(function (r) { form.set(r.id, r.rw === 'Y'); });
    // org access: prefer the explicit ad_role_orgaccess table if it exists; else the role's home org + 0.
    var orgs = [];
    var hasOrgAccess = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ad_role_orgaccess'").get();
    if (hasOrgAccess) {
      db.prepare("SELECT ad_org_id AS id FROM ad_role_orgaccess WHERE ad_role_id=? AND isactive='Y'").all(roleId)
        .forEach(function (r) { orgs.push(r.id); });
    }
    if (!orgs.length) orgs = [role.ad_org_id, 0];
    // entity types active in the dictionary (the role's scope is the active set unless overridden).
    // Defensive: ad_entitytype is absent from some trimmed seeds (the browser's ad_seed.db carries the
    // AD-Window/Process/Form/Role surface but not this table) — empty set = entityTypeAllowed permissive
    // (its own documented default), never a hard failure of window/process/form/record gating, which is
    // independent of dictionary-scope filtering. Same defensive-query idiom as idmp_session.js's isShowAcct.
    var entityTypes = opts.entityTypes;
    if (!entityTypes) {
      try { entityTypes = db.prepare("SELECT entitytype AS et FROM ad_entitytype WHERE isactive='Y'").all().map(function (r) { return r.et; }); }
      catch (e) { entityTypes = []; }
    }
    // canUpdate inputs — read-write org access rows and table access rules (MRole.loadOrgAccessRole / loadTableAccess)
    var orgAccess = [], tableAccess = [], useUser = false;
    if (hasOrgAccess) db.prepare("SELECT ad_client_id AS c, ad_org_id AS o, isreadonly AS ro FROM ad_role_orgaccess WHERE ad_role_id=? AND isactive='Y'").all(roleId)
      .forEach(function (r) { orgAccess.push({ client: Number(r.c), org: Number(r.o), readOnly: r.ro === 'Y' }); });
    try { db.prepare("SELECT ad_table_id AS t, accesstyperule AS rule, isexclude AS ex, isreadonly AS ro FROM ad_table_access WHERE ad_role_id=? AND isactive='Y'").all(roleId)
      .forEach(function (r) { tableAccess.push({ table: Number(r.t), rule: r.rule, exclude: r.ex === 'Y', readOnly: r.ro === 'Y' }); }); } catch (eT) { tableAccess = []; }
    try { var uu = db.prepare('SELECT isuseuserorgaccess AS u FROM ad_role WHERE ad_role_id=?').get(roleId); useUser = !!(uu && uu.u === 'Y'); } catch (eU) { useUser = false; }
    return new RoleContext({
      AD_Role_ID: role.ad_role_id, name: role.name, userLevel: role.userlevel,
      isAccessAllOrgs: role.isaccessallorgs === 'Y',
      orgs: orgs, clients: [role.ad_client_id], win: win, proc: proc, form: form, entityTypes: entityTypes,
      clientId: Number(role.ad_client_id), orgAccess: orgAccess, tableAccess: tableAccess, useUserOrgAccess: useUser
    });
  }

  var API = {
    RoleContext: RoleContext, buildRole: buildRole,
    canView: canView, accessLevelBits: accessLevelBits, gateAccess: gateAccess,
    BIT_ORG: BIT_ORG, BIT_CLIENT: BIT_CLIENT, BIT_SYSTEM: BIT_SYSTEM
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness
  if (typeof window !== 'undefined') window.AdAccess = API;                     // browser
  else if (global) global.AdAccess = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
