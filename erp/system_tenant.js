// BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
// system_tenant.js — SYSTEM_ADMIN_LANE.md §SA1 (System-only genesis entry). Boot overlay that makes the
//   iDempiere **System** tenant (client 0, role 0 "System Administrator", userlevel 'S') a log-in-able tenant
//   on our surface, so Initial Tenant Setup is reachable the canonical way (System login → menu → wizard) and
//   stays System-only (a client admin cannot create a company). The shipped ad_seed.db has NO System tenant rows
//   (only GardenWorld(11)); this idempotently INSERTs the minimal login surface the engine reads.
//
// NON-INVENT — every value below is EXTRACTED from the idempiere_test oracle (docker postgres), not designed:
//   AD_Client(0,'System',value SYSTEM,Y) · AD_Org(0,'*',Y) · AD_Role(0, client 0, org 0, 'System Administrator',
//   userlevel 'S', Y) · AD_User_Roles(10→0, 100→0, client 0, Y) · AD_Process_Access(53161 InitialClientSetup,
//   role 0, client 0, Y, isreadwrite Y). UUIDs are the real oracle ad_*_uu values.
//
// This is a BOOT OVERLAY (precedent: BimOrdersOverlay / BimEmbed.ensureSeedBimSets) — it never touches the
//   26 MB ad_seed.db binary, runs idempotently every boot (guard on AD_Client 0 already present), and is safe
//   across the idb-cache reload path. SECURITY: 53161 access is granted ONLY to System role 0 (never GardenWorld
//   Admin) — the genesis wizard stays a System Administrator act. Witness: W-GENESIS-SYSADMIN-LIVE.
(function (global) {
  'use strict';

  // Oracle-sourced rows (col→value). Audit cols mirror the seed's GardenWorld rows (createdby 0 / updatedby 100).
  var AUD = { isactive: 'Y', created: '1999-01-01 00:00:00', createdby: 0, updated: '1999-01-01 00:00:00', updatedby: 100 };
  function row(extra) { var r = {}; for (var k in AUD) r[k] = AUD[k]; for (var k2 in extra) r[k2] = extra[k2]; return r; }

  var ROWS = [
    { table: 'AD_Client', row: row({ ad_client_id: 0, ad_org_id: 0, value: 'SYSTEM', name: 'System',
      description: 'System Administrator', ad_client_uu: '11237b53-9592-4af1-b3c5-afd216514b5d' }) },
    { table: 'AD_Org', row: row({ ad_org_id: 0, ad_client_id: 0, value: '*', name: '*',
      ad_org_uu: '3ef41ffc-8ea9-454a-afa2-22949f402ff5' }) },
    { table: 'AD_Role', row: row({ ad_role_id: 0, ad_client_id: 0, ad_org_id: 0, name: 'System Administrator',
      userlevel: 'S', isaccessadvanced: 'Y', isaccessallorgs: 'N', ismasterrole: 'N', roletype: 'SS',
      ismanual: 'N', ad_role_uu: '8e8ffdb2-dd04-4473-9dc7-3185874017e6' }) },
    { table: 'AD_User_Roles', row: row({ ad_user_id: 10, ad_role_id: 0, ad_client_id: 0, ad_org_id: 0,
      ad_user_roles_uu: 'af4e703f-c6da-4d78-97f1-f90a3bf5a6dc' }) },
    { table: 'AD_User_Roles', row: row({ ad_user_id: 100, ad_role_id: 0, ad_client_id: 0, ad_org_id: 0,
      ad_user_roles_uu: 'a6810a39-e784-4cac-a72f-5e33de6822e3' }) },
    // Org access — the System role reaches org 0 "*" (orgsForRole is driven by AD_Role_OrgAccess, so without
    // this row a System login has no selectable org). Real oracle grant.
    { table: 'AD_Role_OrgAccess', row: row({ ad_role_id: 0, ad_org_id: 0, ad_client_id: 0, isreadonly: 'N',
      ad_role_orgaccess_uu: '303630da-ce13-4b2e-a9b2-fb3ae2cad311' }) },
    // The ONLY menu leaf the System role gets in this leg: Initial Tenant Setup (AD_Process 53161). System-only.
    { table: 'AD_Process_Access', row: row({ ad_process_id: 53161, ad_role_id: 0, ad_client_id: 0, ad_org_id: 0,
      isreadwrite: 'Y' }) }
  ];

  // sql.js handle: db.exec(sql) / db.run(sql). Tables are CamelCase but SQLite resolves names case-insensitively,
  // so lowercase row keys merge fine. Column-intersect (PRAGMA table_info) so we never write a col the seed lacks.
  function colsOf(db, table) {
    var set = {};
    try { var pi = db.exec('PRAGMA table_info("' + table + '")');
      if (pi.length) pi[0].values.forEach(function (c) { set[String(c[1]).toLowerCase()] = 1; }); } catch (e) {}
    return set;
  }
  function lit(v) {
    if (v == null) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }

  // ensure(db): idempotent install of the System(0) login surface. Returns rows inserted (0 if already resident).
  function ensure(db) {
    if (!db) return 0;
    // GUARD — once the System tenant is resident (e.g. after a prior boot persisted it to idb), do nothing.
    try { var ex = db.exec('SELECT AD_Client_ID FROM AD_Client WHERE AD_Client_ID=0');
      if (ex.length && ex[0].values.length) { console.log('§SYSTEM-TENANT ensure skip — System(0) already resident'); return 0; } } catch (e) {}
    var n = 0;
    ROWS.forEach(function (spec) {
      var have = colsOf(db, spec.table);
      var cols = [], vals = [];
      Object.keys(spec.row).forEach(function (k) { if (have[k.toLowerCase()]) { cols.push(k); vals.push(lit(spec.row[k])); } });
      if (!cols.length) return;
      try { db.run('INSERT INTO "' + spec.table + '" (' + cols.join(',') + ') VALUES (' + vals.join(',') + ')'); n++; }
      catch (e) { console.log('§SYSTEM-TENANT insert-fail ' + spec.table + ' ' + e.message); }
    });
    console.log('§SYSTEM-TENANT ensure rows=' + n + ' (System tenant 0 + role 0 + user-roles 10/100 + org-access 0 + proc-access 53161) source=idempiere_test');
    return n;
  }

  global.SystemTenant = { ensure: ensure };
})(typeof window !== 'undefined' ? window : this);
