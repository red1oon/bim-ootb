#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
//
// gen_poc_shards.js — PoC tenant SHARD generator for SAP / Oracle / MS Dynamics (IMPORT_EXPAND_POC.md §P-1).
//   Emits THREE master-only overlay shards proving "master tables can be matched" for sources that have no
//   delegate agent yet: erp/14-sap.db · erp/15-oracle.db · erp/16-dynamics.db. The AD frame recipe (stamp7,
//   clone/ins, SystemAdmin frame, tenant Client/Org/Role/User frame, SCOPE=CL*1000 / DOC=CL*100000 banding,
//   role-102 window grants) is CLONED VERBATIM from tests/gen_ad_odoo.js — the proven 12-odoo.db generator.
//
//   ⚠ PoC SOURCING (honest, labeled in the UI too): no live SAP/Oracle/Dynamics exists here, so each shard
//   carries that vendor's DOCUMENTED PUBLIC DEMO MODEL — reference data, not a live extraction:
//     • 14 "SAP Flights"     — SAP NetWeaver ABAP **SFLIGHT** reference model: SCARR carriers → C_BPartner,
//                              SPFLI flight connections → M_Product (service).
//     • 15 "Oracle Scott"    — Oracle's canonical **EMP/DEPT (SCOTT)** reference schema (shipped with every
//                              Oracle DB): DEPT → C_BP_Group, EMP → C_BPartner (employees).
//     • 16 "Dynamics Cronus" — Dynamics 365 Business Central **CRONUS** demo company: furniture items →
//                              M_Product, customers → C_BPartner.
//   The production path for these sources remains a delegate agent (like migrate_agent.js / odoo_agent);
//   this PoC shows the MASTER-TABLE MAPPING + login-able tenant frame, nothing more. No documents/posting.
//
//   §-log first.  Run:  node tests/gen_poc_shards.js 2>&1 | tee tests/gen_poc_shards.log   (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path');
var initSqlJs;
try { initSqlJs = require(__dirname + '/../../tests/node_modules/sql.js'); }
catch (e) { initSqlJs = require(process.env.HOME + '/bim-ootb/tests/node_modules/sql.js'); }

var SEED = process.env.AD_SEED || path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db');
var OUTDIR = process.env.SHARD_OUTDIR || path.join(__dirname, '..');
var MIG_TS = process.env.MIGRATION_TS || '2026-06-13 00:00:00';   // fixed migration stamp (deterministic)
var MIG_BY = '10';                                                // the System user doing the migration

// ── the documented demo models (typed-in REFERENCE data, cited above — the PoC source of truth) ──
var SCARR = [  // SFLIGHT carriers: [carrid, carrname, currency]
  ['AA', 'American Airlines', 'USD'], ['AC', 'Air Canada', 'CAD'], ['AF', 'Air France', 'EUR'],
  ['AZ', 'Alitalia', 'EUR'], ['BA', 'British Airways', 'GBP'], ['CO', 'Continental Airlines', 'USD'],
  ['DL', 'Delta Airlines', 'USD'], ['JL', 'Japan Airlines', 'JPY'], ['LH', 'Lufthansa', 'EUR'],
  ['NW', 'Northwest Airlines', 'USD'], ['QF', 'Qantas Airways', 'AUD'], ['SQ', 'Singapore Airlines', 'SGD'],
  ['SR', 'Swissair', 'CHF'], ['UA', 'United Airlines', 'USD']
];
var SPFLI = [  // SFLIGHT connections: [carrid, connid, from, to]
  ['AA', '0017', 'NEW YORK', 'SAN FRANCISCO'], ['AZ', '0555', 'ROME', 'FRANKFURT'],
  ['DL', '0106', 'NEW YORK', 'FRANKFURT'], ['JL', '0407', 'TOKYO', 'FRANKFURT'],
  ['LH', '0400', 'FRANKFURT', 'NEW YORK'], ['LH', '0402', 'FRANKFURT', 'NEW YORK'],
  ['LH', '2402', 'FRANKFURT', 'BERLIN'], ['QF', '0005', 'SINGAPORE', 'FRANKFURT'],
  ['SQ', '0026', 'SINGAPORE', 'FRANKFURT'], ['UA', '0941', 'FRANKFURT', 'SAN FRANCISCO']
];
var DEPT = [   // SCOTT departments: [deptno, dname, loc]
  [10, 'ACCOUNTING', 'NEW YORK'], [20, 'RESEARCH', 'DALLAS'], [30, 'SALES', 'CHICAGO'], [40, 'OPERATIONS', 'BOSTON']
];
var EMP = [    // SCOTT employees: [empno, ename, job, deptno]
  [7369, 'SMITH', 'CLERK', 20], [7499, 'ALLEN', 'SALESMAN', 30], [7521, 'WARD', 'SALESMAN', 30],
  [7566, 'JONES', 'MANAGER', 20], [7654, 'MARTIN', 'SALESMAN', 30], [7698, 'BLAKE', 'MANAGER', 30],
  [7782, 'CLARK', 'MANAGER', 10], [7788, 'SCOTT', 'ANALYST', 20], [7839, 'KING', 'PRESIDENT', 10],
  [7844, 'TURNER', 'SALESMAN', 30], [7876, 'ADAMS', 'CLERK', 20], [7900, 'JAMES', 'CLERK', 30],
  [7902, 'FORD', 'ANALYST', 20], [7934, 'MILLER', 'CLERK', 10]
];
var CRONUS_ITEMS = [  // BC CRONUS items: [no, description]
  ['1896-S', 'ATHENS Desk'], ['1900-S', 'PARIS Guest Chair, black'], ['1906-S', 'ATHENS Mobile Pedestal'],
  ['1908-S', 'LONDON Swivel Chair, blue'], ['1920-S', 'ANTWERP Conference Table'], ['1928-S', 'AMSTERDAM Lamp'],
  ['1960-S', 'ROME Guest Chair, green'], ['1964-S', 'TOKYO Guest Chair, blue'], ['1968-S', 'MEXICO Swivel Chair, black'],
  ['1972-S', 'MUNICH Swivel Chair, yellow'], ['1980-S', 'MOSCOW Swivel Chair, red'], ['1988-S', 'SEOUL Guest Chair, red'],
  ['1996-S', 'ATLANTA Whiteboard, base'], ['2000-S', 'SYDNEY Swivel Chair, green']
];
var CRONUS_CUST = [   // BC CRONUS customers: [no, name]
  ['10000', 'Adatum Corporation'], ['20000', 'Trey Research'], ['30000', 'School of Fine Art'],
  ['40000', 'Alpine Ski House'], ['50000', 'Relecloud']
];

function exec(db, s, p) { return db.exec(s, p || []); }
function rowObj(db, s, p) { var r = exec(db, s, p); if (!r.length) return null; var o = {}; r[0].columns.forEach(function (c, i) { o[c] = r[0].values[0][i]; }); return o; }
function tableCols(db, t) { return exec(db, "SELECT name FROM pragma_table_info('" + t + "')")[0].values.map(function (r) { return r[0]; }); }

(async function () {
  function L(m) { console.log(m); }
  L('\n══ GEN-POC-SHARDS — SAP(14) · Oracle(15) · Dynamics(16) master-matching PoC tenants ══\n');
  var SQL = await initSqlJs();
  var base = new SQL.Database(new Uint8Array(fs.readFileSync(SEED)));

  // build ONE shard for a tenant def — the gen_ad_odoo frame recipe, master-only payload
  function buildShard(def) {
    var shard = new SQL.Database();
    var schemaDone = {};
    function ensureSchema(t) { if (schemaDone[t]) return; var s = rowObj(base, "SELECT sql FROM sqlite_master WHERE type='table' AND name=? COLLATE NOCASE", [t]); if (!s) throw new Error('no base table ' + t); shard.run(s.sql); schemaDone[t] = tableCols(shard, t); }
    function stamp7(obj, cl, org) {
      obj.AD_Client_ID = cl; obj.AD_Org_ID = org; obj.IsActive = 'Y';
      obj.Created = MIG_TS; obj.CreatedBy = MIG_BY; obj.Updated = MIG_TS; obj.UpdatedBy = MIG_BY;
      return obj;
    }
    function ins(t, obj) {
      ensureSchema(t);
      var lc = {}; schemaDone[t].forEach(function (c) { lc[c.toLowerCase()] = c; });
      var out = {}; Object.keys(obj).forEach(function (k) { var c = lc[k.toLowerCase()]; if (c) out[c] = obj[k]; });
      var ks = Object.keys(out), ph = ks.map(function () { return '?'; }).join(',');
      shard.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ph + ')', ks.map(function (k) { return out[k]; }));
    }
    function clone(t, whereSql, overrides, cl, org) {
      var src = rowObj(base, 'SELECT * FROM ' + t + ' WHERE ' + whereSql);
      if (!src) throw new Error('clone src not found ' + t + ' ' + whereSql);
      Object.keys(overrides).forEach(function (k) { src[k] = overrides[k]; });
      ins(t, stamp7(src, cl, org));
    }

    // SystemAdmin frame (identical to gen_ad_odoo §3)
    var SAROLE = 1000000;
    clone('AD_Client', 'AD_Client_ID=11', { AD_Client_ID: 0, Value: 'System', Name: 'System', Description: 'System (cross-client)' }, 0, 0);
    clone('AD_Role', 'AD_Role_ID=102', { AD_Role_ID: SAROLE, Name: 'System Administrator', Description: 'System Administrator', UserLevel: 'S  ', IsAccessAllOrgs: 'Y', IsClientAdministrator: 'N' }, 0, 0);
    clone('AD_User', 'AD_User_ID=10', {}, 0, 0);
    ins('AD_User_Roles', stamp7({ AD_User_ID: 10, AD_Role_ID: SAROLE }, 0, 0));
    ins('AD_Role_OrgAccess', stamp7({ AD_Role_ID: SAROLE, AD_Org_ID: 0 }, 0, 0));

    // tenant frame (identical to gen_ad_odoo §4, fixed CL per def — user dictated SAP=14)
    var CL = def.client, SCOPE = CL * 1000, DOC = CL * 100000;
    var ORG = SCOPE, ROLE = SCOPE, USER = SCOPE, TENANT = def.tenant;
    clone('AD_Client', 'AD_Client_ID=11', { AD_Client_ID: CL, Value: TENANT, Name: TENANT, Description: def.desc }, CL, 0);
    clone('AD_Org', 'AD_Org_ID=11', { AD_Org_ID: ORG, Value: TENANT + ' HQ', Name: TENANT + ' HQ', Description: def.desc }, CL, ORG);
    clone('AD_Role', 'AD_Role_ID=102', { AD_Role_ID: ROLE, Name: TENANT + ' Admin', Description: TENANT + ' Admin' }, CL, 0);
    clone('AD_User', 'AD_User_ID=101', { AD_User_ID: USER, Name: TENANT + ' Admin' }, CL, 0);
    ins('AD_User_Roles', stamp7({ AD_User_ID: USER, AD_Role_ID: ROLE }, CL, 0));
    ins('AD_Role_OrgAccess', stamp7({ AD_Role_ID: ROLE, AD_Org_ID: ORG }, CL, ORG));
    var waCols = tableCols(base, 'AD_Window_Access');
    var waRows = exec(base, 'SELECT ' + waCols.join(',') + ' FROM AD_Window_Access WHERE AD_Role_ID=102');
    var nWA = 0;
    if (waRows.length) waRows[0].values.forEach(function (vals) {
      var o = {}; waCols.forEach(function (c, i) { o[c] = vals[i]; });
      ins('AD_Window_Access', stamp7(Object.assign({}, o, { AD_Role_ID: ROLE }), CL, 0)); nWA++;
      ins('AD_Window_Access', stamp7(Object.assign({}, o, { AD_Role_ID: SAROLE }), 0, 0));
    });

    // master payload — the def maps its documented model into AD master tables
    var counts = def.masters({ ins: ins, stamp7: stamp7, CL: CL, ORG: ORG, DOC: DOC, SCOPE: SCOPE });

    var buf = Buffer.from(shard.export());
    var out = path.join(OUTDIR, def.file);
    fs.writeFileSync(out, buf);
    shard.close();
    L('§GEN-POC shard=' + def.file + ' client=' + CL + ' "' + TENANT + '" source="' + def.source + '"'
      + ' frame=ok window-grants=' + nWA + 'x2 masters={' + Object.keys(counts).map(function (k) { return k + ':' + counts[k]; }).join(' ') + '}'
      + ' bytes=' + buf.length);
    return counts;
  }

  var DEFS = [
    { file: '14-sap.db', client: 14, tenant: 'SAP Flights',
      desc: 'PoC — SAP NetWeaver SFLIGHT reference model (documented demo data, master mapping only)',
      source: 'SAP SFLIGHT (SCARR/SPFLI)',
      masters: function (x) {
        var n = { C_BPartner: 0, M_Product_Category: 0, M_Product: 0 };
        SCARR.forEach(function (c, i) {
          x.ins('C_BPartner', x.stamp7({ C_BPartner_ID: x.DOC + 1 + i, Value: 'SAP-' + c[0], Name: c[1],
            IsCustomer: 'N', IsVendor: 'Y', IsEmployee: 'N',
            Description: 'SFLIGHT SCARR carrier ' + c[0] + ' · currency ' + c[2] }, x.CL, x.ORG)); n.C_BPartner++;
        });
        var CAT = x.SCOPE + 1;
        x.ins('M_Product_Category', x.stamp7({ M_Product_Category_ID: CAT, Value: 'SFLIGHT', Name: 'Flight Connections' }, x.CL, 0)); n.M_Product_Category++;
        SPFLI.forEach(function (f, i) {
          x.ins('M_Product', x.stamp7({ M_Product_ID: x.DOC + 100 + i, Value: 'SAP-' + f[0] + '-' + f[1],
            Name: f[0] + ' ' + f[1] + ' ' + f[2] + ' - ' + f[3], M_Product_Category_ID: CAT,
            ProductType: 'S', C_UOM_ID: 100, Description: 'SFLIGHT SPFLI connection' }, x.CL, x.ORG)); n.M_Product++;
        });
        return n;
      } },
    { file: '15-oracle.db', client: 15, tenant: 'Oracle Scott',
      desc: 'PoC — Oracle canonical EMP/DEPT (SCOTT) reference schema (documented demo data, master mapping only)',
      source: 'Oracle SCOTT (EMP/DEPT)',
      masters: function (x) {
        var n = { C_BP_Group: 0, C_BPartner: 0 };
        var gid = {};
        DEPT.forEach(function (d, i) {
          gid[d[0]] = x.SCOPE + 1 + i;
          x.ins('C_BP_Group', x.stamp7({ C_BP_Group_ID: gid[d[0]], Value: String(d[0]), Name: d[1],
            Description: 'SCOTT DEPT · ' + d[2], IsDefault: i === 0 ? 'Y' : 'N' }, x.CL, 0)); n.C_BP_Group++;
        });
        EMP.forEach(function (e) {
          x.ins('C_BPartner', x.stamp7({ C_BPartner_ID: x.DOC + e[0], Value: 'ORA-' + e[0], Name: e[1],
            IsCustomer: 'N', IsVendor: 'N', IsEmployee: 'Y', C_BP_Group_ID: gid[e[3]],
            Description: 'SCOTT EMP · ' + e[2] + ' · dept ' + e[3] }, x.CL, x.ORG)); n.C_BPartner++;
        });
        return n;
      } },
    { file: '16-dynamics.db', client: 16, tenant: 'Dynamics Cronus',
      desc: 'PoC — Dynamics 365 Business Central CRONUS demo company (documented demo data, master mapping only)',
      source: 'Dynamics BC CRONUS (items/customers)',
      masters: function (x) {
        var n = { M_Product_Category: 0, M_Product: 0, C_BPartner: 0 };
        var CAT = x.SCOPE + 1;
        x.ins('M_Product_Category', x.stamp7({ M_Product_Category_ID: CAT, Value: 'CRONUS', Name: 'CRONUS Furniture' }, x.CL, 0)); n.M_Product_Category++;
        CRONUS_ITEMS.forEach(function (it, i) {
          x.ins('M_Product', x.stamp7({ M_Product_ID: x.DOC + 100 + i, Value: it[0], Name: it[1],
            M_Product_Category_ID: CAT, ProductType: 'I', C_UOM_ID: 100,
            Description: 'CRONUS item' }, x.CL, x.ORG)); n.M_Product++;
        });
        CRONUS_CUST.forEach(function (c, i) {
          x.ins('C_BPartner', x.stamp7({ C_BPartner_ID: x.DOC + 1 + i, Value: 'CRONUS-' + c[0], Name: c[1],
            IsCustomer: 'Y', IsVendor: 'N', IsEmployee: 'N',
            Description: 'CRONUS customer ' + c[0] }, x.CL, x.ORG)); n.C_BPartner++;
        });
        return n;
      } }
  ];

  DEFS.forEach(function (def) { buildShard(def); });
  base.close();
  L('\n§GEN-POC DONE shards=3 (14-sap.db, 15-oracle.db, 16-dynamics.db) — frames + masters only, no documents.');
})().catch(function (e) { console.error('§GEN-POC FAIL ' + e.message); process.exit(1); });
