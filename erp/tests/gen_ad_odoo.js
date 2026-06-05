#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
//
// gen_ad_odoo.js — RENDERER #2 tenant SHARD generator (delegate-to-install, NON-INVENT, SHARD-IN doctrine).
//   AD data is never a baked monolith — it is SHARDED IN. The base ad_seed.db is the installed framework (the
//   shared AD dictionary); this emits a SMALL overlay shard `erp/12-odoo.db` carrying ONLY the new rows for a
//   migrated tenant **Client 12 "Odoo"** + the proper System(0)/SystemAdmin frame. The renderer merges it via
//   idempiere.html?shard=12-odoo.db (rows copied into the base db at load). Rows are pulled LIVE from odoodemo
//   (the product catalog + the SO S00023 O2C chain); business values are real Odoo, the AD frame is CLONED.
//
//   GOOD MIGRATION PRACTICE (enforced here, for ANY source ERP):
//     • the 7 mandatory AD fields on EVERY migrated row — AD_Client_ID, AD_Org_ID, IsActive, Created,
//       CreatedBy, Updated, UpdatedBy (stamp7). CreatedBy/UpdatedBy = the System user (10) doing the migration
//       (migration is a SystemAdmin act); Created/Updated = a fixed migration timestamp (deterministic).
//     • migration runs in SystemAdmin mode (System client 0 + a System Administrator role are part of the shard).
//
//   Demo:  idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=140
//   §-log first.  Run:  node tests/gen_ad_odoo.js 2>&1 | tee tests/gen_ad_odoo.log   (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var initSqlJs = require('sql.js');
var ROOT = path.join(__dirname, '..');
var ODB = process.env.ODOO_DB || 'odoodemo', OL = 'admin', OP = 'admin';
var MIG_TS = process.env.MIGRATION_TS || '2026-06-05 00:00:00';   // fixed migration stamp (deterministic, non-invent)
var MIG_BY = '10';                                                // the System user doing the migration (SystemAdmin)

function rpc(s, m, a) {
  return new Promise(function (res, rej) {
    var b = JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: s, method: m, args: a } });
    var r = http.request({ host: 'localhost', port: 8069, path: '/jsonrpc', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, function (x) {
      var d = ''; x.on('data', function (c) { d += c; }); x.on('end', function () {
        try { var j = JSON.parse(d); j.error ? rej(new Error(JSON.stringify(j.error.data && j.error.data.message || j.error))) : res(j.result); } catch (e) { rej(e); } }); });
    r.on('error', rej); r.write(b); r.end();
  });
}
function exec(db, s, p) { return db.exec(s, p || []); }
function rowObj(db, s, p) { var r = exec(db, s, p); if (!r.length) return null; var o = {}; r[0].columns.forEach(function (c, i) { o[c] = r[0].values[0][i]; }); return o; }
function tableCols(db, t) { return exec(db, "SELECT name FROM pragma_table_info('" + t + "')")[0].values.map(function (r) { return r[0]; }); }

(async function () {
  var log = []; function L(m) { console.log(m); log.push(m); }
  L('\n══ GEN-AD-ODOO — emit tenant SHARD 12-odoo.db (Client 12 "Odoo" + SystemAdmin frame, 7-field enforced) ══\n');

  // ── 1. live Odoo pull ──
  var uid = await rpc('common', 'login', [ODB, OL, OP]);
  if (!uid) { L('§GEN-AD-ODOO FAIL auth'); process.exit(1); }
  var ex = function (model, meth, args, kw) { return rpc('object', 'execute_kw', [ODB, uid, OP, model, meth, args, kw || {}]); };
  var prods = await ex('product.product', 'search_read', [[['sale_ok', '=', true]]], { fields: ['id', 'name', 'type', 'list_price', 'categ_id'], limit: 200 });
  var so = (await ex('sale.order', 'search_read', [[['name', '=', 'S00023']]], { fields: ['id', 'name', 'state', 'date_order', 'amount_untaxed', 'amount_total', 'partner_id'] }))[0];
  var sol = await ex('sale.order.line', 'search_read', [[['order_id', '=', so.id], ['display_type', '=', false]]], { fields: ['product_id', 'product_uom_qty', 'qty_delivered', 'qty_invoiced', 'price_unit', 'price_subtotal'] });
  var inv = (await ex('account.move', 'search_read', [[['invoice_origin', '=', so.name], ['move_type', '=', 'out_invoice']]], { fields: ['id', 'name', 'invoice_date', 'amount_untaxed', 'amount_total', 'payment_state'] }))[0];
  L('   live: products=' + prods.length + ' SO=' + so.name + ' lines=' + sol.length + ' invoice=' + (inv && inv.name));

  // ── 2. base (framework) + a fresh SHARD db (only the new rows live here) ──
  var SQL = await initSqlJs();
  var base = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ROOT, 'ad_seed.db'))));
  var shard = new SQL.Database();
  var schemaDone = {};
  function ensureSchema(t) { if (schemaDone[t]) return; var s = rowObj(base, "SELECT sql FROM sqlite_master WHERE type='table' AND name=? COLLATE NOCASE", [t]); shard.run(s.sql); schemaDone[t] = tableCols(shard, t); }
  // stamp7: enforce the 7 mandatory AD fields on every row (where the column exists). cl/org override the scope.
  function stamp7(obj, cl, org) {
    var s = { AD_Client_ID: cl, AD_Org_ID: org, IsActive: 'Y', Created: MIG_TS, CreatedBy: MIG_BY, Updated: MIG_TS, UpdatedBy: MIG_BY };
    Object.keys(s).forEach(function (k) { if (!(k in obj)) obj[k] = s[k]; else if (k === 'AD_Client_ID' || k === 'AD_Org_ID') { /* keep explicit */ } });
    // explicit cl/org always win for scope
    obj.AD_Client_ID = cl; obj.AD_Org_ID = org; obj.IsActive = 'Y'; obj.Created = MIG_TS; obj.CreatedBy = MIG_BY; obj.Updated = MIG_TS; obj.UpdatedBy = MIG_BY;
    return obj;
  }
  // insert into the SHARD, normalizing keys to the table's real column case (override-wins), dropping unknowns.
  function ins(t, obj) {
    ensureSchema(t);
    var lc = {}; schemaDone[t].forEach(function (c) { lc[c.toLowerCase()] = c; });
    var out = {}; Object.keys(obj).forEach(function (k) { var c = lc[k.toLowerCase()]; if (c) out[c] = obj[k]; });
    var ks = Object.keys(out), ph = ks.map(function () { return '?'; }).join(',');
    shard.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ph + ')', ks.map(function (k) { return out[k]; }));
  }
  // clone a real BASE row into the shard with overrides + the 7-field stamp.
  function clone(t, whereSql, overrides, cl, org) {
    var src = rowObj(base, 'SELECT * FROM ' + t + ' WHERE ' + whereSql);
    if (!src) throw new Error('clone src not found ' + t + ' ' + whereSql);
    Object.keys(overrides).forEach(function (k) { src[k] = overrides[k]; });
    ins(t, stamp7(src, cl, org));
  }

  // ── 3. SystemAdmin frame (proper migration mode): System client(0) + System Administrator role ──
  var SAROLE = 1000000;
  clone('AD_Client', 'AD_Client_ID=11', { AD_Client_ID: 0, Value: 'System', Name: 'System', Description: 'System (cross-client)' }, 0, 0);
  clone('AD_Role', 'AD_Role_ID=102', { AD_Role_ID: SAROLE, Name: 'System Administrator', Description: 'System Administrator', UserLevel: 'S  ', IsAccessAllOrgs: 'Y', IsClientAdministrator: 'N' }, 0, 0);
  // grant System Administrator to the existing System user (10) — copy that user row into the shard too
  clone('AD_User', 'AD_User_ID=10', {}, 0, 0);
  ins('AD_User_Roles', stamp7({ AD_User_ID: 10, AD_Role_ID: SAROLE }, 0, 0));
  ins('AD_Role_OrgAccess', stamp7({ AD_Role_ID: SAROLE, AD_Org_ID: 0 }, 0, 0));

  // ── 4. the Odoo tenant frame: Client 12 / Org / Role / User / access (cloned from GardenWorld) ──
  var CL = 12, ORG = 12000, ROLE = 12000, USER = 12000;
  clone('AD_Client', 'AD_Client_ID=11', { AD_Client_ID: CL, Value: 'Odoo', Name: 'Odoo', Description: 'Migrated from odoodemo (Odoo 17)' }, CL, 0);
  clone('AD_Org', 'AD_Org_ID=11', { AD_Org_ID: ORG, Value: 'Odoo HQ', Name: 'Odoo HQ', Description: 'Odoo tenant org' }, CL, ORG);
  clone('AD_Role', 'AD_Role_ID=102', { AD_Role_ID: ROLE, Name: 'Odoo Admin', Description: 'Odoo Admin' }, CL, 0);
  clone('AD_User', 'AD_User_ID=101', { AD_User_ID: USER, Name: 'Odoo Admin' }, CL, 0);
  ins('AD_User_Roles', stamp7({ AD_User_ID: USER, AD_Role_ID: ROLE }, CL, 0));
  ins('AD_Role_OrgAccess', stamp7({ AD_Role_ID: ROLE, AD_Org_ID: ORG }, CL, ORG));
  // window access: clone every role-102 grant onto BOTH new roles (Odoo Admin + System Administrator)
  var waCols = tableCols(base, 'AD_Window_Access');
  var waRows = exec(base, 'SELECT ' + waCols.join(',') + ' FROM AD_Window_Access WHERE AD_Role_ID=102');
  var nWA = 0;
  if (waRows.length) waRows[0].values.forEach(function (vals) {
    var o = {}; waCols.forEach(function (c, i) { o[c] = vals[i]; });
    ins('AD_Window_Access', stamp7(Object.assign({}, o, { AD_Role_ID: ROLE }), CL, 0)); nWA++;
    ins('AD_Window_Access', stamp7(Object.assign({}, o, { AD_Role_ID: SAROLE }), 0, 0));
  });
  L('   frame: System(0)+SysAdmin role, Client 12 "Odoo", window-grants=' + nWA + '×2');

  // ── 5. real Odoo DATA (7-field enforced) ──
  var catId = {}, nextCat = 12001;
  prods.forEach(function (p) { var leaf = (p.categ_id && p.categ_id[1] || 'Odoo').split('/').pop().trim();
    if (!catId[leaf]) { catId[leaf] = nextCat++; ins('M_Product_Category', stamp7({ M_Product_Category_ID: catId[leaf], Name: leaf, Value: leaf }, CL, 0)); } });
  var pidMap = {}, nextP = 1200000;
  prods.forEach(function (p) { var leaf = (p.categ_id && p.categ_id[1] || 'Odoo').split('/').pop().trim(); var pid = nextP++; pidMap[p.id] = pid;
    ins('M_Product', stamp7({ M_Product_ID: pid, Value: 'ODOO-' + p.id, Name: p.name, M_Product_Category_ID: catId[leaf], ProductType: (p.type === 'service' ? 'S' : 'I'), C_UOM_ID: 100 }, CL, ORG)); });
  // ── 5b. real Odoo list_price → M_ProductPrice (iDempiere-faithful: a Client-12 sales price list + version,
  //        one price row per product carrying the RECORDED Odoo list_price). NON-INVENT: every price is real Odoo.
  var PL = 1200001, PLV = 1200001;                                  // Odoo sales price list + its current version
  ins('M_PriceList', stamp7({ M_PriceList_ID: PL, Name: 'Odoo Sales', Description: 'Migrated Odoo sales price list', C_Currency_ID: 100, IsSOPriceList: 'Y' }, CL, ORG));
  ins('M_PriceList_Version', stamp7({ M_PriceList_Version_ID: PLV, M_PriceList_ID: PL, Name: 'Odoo Sales (current)', Description: 'Migrated from odoodemo list_price', ValidFrom: MIG_TS }, CL, ORG));
  var priced = 0, pmin = null, pmax = null;
  prods.forEach(function (p) { var pid = pidMap[p.id]; var lp = p.list_price;   // RECORDED Odoo value (may be 0; kept real)
    ins('M_ProductPrice', stamp7({ M_Product_ID: pid, M_PriceList_Version_ID: PLV, PriceList: lp, PriceStd: lp, PriceLimit: lp }, CL, ORG));
    priced++; if (pmin === null || lp < pmin) pmin = lp; if (pmax === null || lp > pmax) pmax = lp; });
  L('§RULE-DATA products=' + prods.length + ' priced=' + priced + ' min=' + pmin + ' max=' + pmax + ' (all real Odoo list_price, 0 invented)');
  var BP = 1200001;
  ins('C_BPartner', stamp7({ C_BPartner_ID: BP, Value: 'ODOO-BP-' + so.partner_id[0], Name: so.partner_id[1], IsCustomer: 'Y', IsVendor: 'N', IsEmployee: 'N' }, CL, ORG));
  var ORD = 1200001;
  ins('C_Order', stamp7({ C_Order_ID: ORD, DocumentNo: so.name, DocStatus: 'CO', IsSOTrx: 'Y', DateOrdered: String(so.date_order).slice(0, 10), C_BPartner_ID: BP, C_Currency_ID: 100, GrandTotal: so.amount_total, TotalLines: so.amount_untaxed, Description: 'Migrated from odoodemo' }, CL, ORG));
  sol.forEach(function (l, i) { ins('C_OrderLine', stamp7({ C_OrderLine_ID: ORD * 100 + i + 1, C_Order_ID: ORD, Line: (i + 1) * 10, M_Product_ID: pidMap[l.product_id[0]] || null, QtyOrdered: l.product_uom_qty, QtyDelivered: l.qty_delivered, QtyInvoiced: l.qty_invoiced, PriceActual: l.price_unit, LineNetAmt: l.price_subtotal, C_UOM_ID: 100 }, CL, ORG)); });
  if (inv) ins('C_Invoice', stamp7({ C_Invoice_ID: 1200001, DocumentNo: inv.name, DocStatus: 'CO', IsSOTrx: 'Y', DateInvoiced: String(inv.invoice_date).slice(0, 10), C_BPartner_ID: BP, C_Currency_ID: 100, GrandTotal: inv.amount_total, TotalLines: inv.amount_untaxed, Description: 'Migrated from odoodemo · ' + inv.payment_state, C_Order_ID: ORD }, CL, ORG));
  L('   data: products=' + prods.length + ' categories=' + Object.keys(catId).length + ' SO=' + so.name + ' customer="' + so.partner_id[1] + '"');

  // ── 6. 7-field audit + write the SHARD ──
  var has7 = ['AD_Client_ID', 'AD_Org_ID', 'IsActive', 'Created', 'CreatedBy', 'Updated', 'UpdatedBy'];
  var audited = 0, violations = 0;
  Object.keys(schemaDone).forEach(function (t) {
    var present = has7.filter(function (f) { return schemaDone[t].some(function (c) { return c.toLowerCase() === f.toLowerCase(); }); });
    var rows = exec(shard, 'SELECT COUNT(*) n FROM ' + t)[0].values[0][0];
    // for tables that DO carry the 7 fields, none may be null
    if (present.length === 7) { audited += rows;
      var nulls = exec(shard, 'SELECT COUNT(*) n FROM ' + t + ' WHERE ' + has7.map(function (f) { return f + ' IS NULL'; }).join(' OR '))[0].values[0][0];
      if (nulls > 0) { violations += nulls; L('   ⚠ 7-field VIOLATION ' + t + ' nulls=' + nulls); }
    }
  });
  var out = path.join(ROOT, '12-odoo.db');
  fs.writeFileSync(out, Buffer.from(shard.export()));
  var pc = exec(shard, 'SELECT COUNT(*) n FROM M_Product WHERE AD_Client_ID=12')[0].values[0][0];
  var uc = exec(shard, 'SELECT COUNT(*) n FROM AD_User WHERE AD_Client_ID=12')[0].values[0][0];
  L('\n§GEN-AD-ODOO wrote 12-odoo.db bytes=' + fs.statSync(out).size + ' tables=' + Object.keys(schemaDone).length +
    ' client12.products=' + pc + ' 7field-audited-rows=' + audited + ' violations=' + violations);
  var pass = pc === prods.length && uc === 1 && violations === 0;
  L('§GEN-AD-ODOO ' + (pass ? 'PASS' : 'FAIL') + ' (demo: idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=140)\n');
  fs.writeFileSync(path.join(__dirname, 'gen_ad_odoo.log'), log.join('\n'));
  process.exit(pass ? 0 : 1);
})().catch(function (e) { console.error('§GEN-AD-ODOO ERROR', e.message); process.exit(2); });
