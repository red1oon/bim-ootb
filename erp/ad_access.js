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
    return new RoleContext({
      AD_Role_ID: role.ad_role_id, name: role.name, userLevel: role.userlevel,
      isAccessAllOrgs: role.isaccessallorgs === 'Y',
      orgs: orgs, clients: [role.ad_client_id], win: win, proc: proc, form: form, entityTypes: entityTypes
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
