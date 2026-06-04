#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
//
// gen_ad_odoo.js — RENDERER #2 demo seed generator (delegate-to-install, NON-INVENT).
//   Produces erp/ad_odoo.db = ad_seed.db (the shared AD dictionary = the renderer FRAMEWORK, Install's gift)
//   + a NEW tenant **Client 12 "Odoo"** carrying REAL rows pulled LIVE from the running odoodemo (Odoo 17,
//   :8069): the product catalog, the SO S00023 O2C chain (partner, order+lines, invoice). The AD *frame*
//   (client/org/role/user/window-access) is CLONED from GardenWorld (client 11) — copy-a-pattern, the
//   "framework any new ERP plugs into" — NOT invented. Business values (names, qtys, prices, amounts, the SO
//   number, the dates) are all real Odoo rows. The same iDempiere renderer (AD windows) then shows Client 12.
//   Demo:  idempiere.html?seed=ad_odoo.db&window=140   → login Odoo Admin → Product catalog → Graph.
//   §-log first.  Run:  node tests/gen_ad_odoo.js 2>&1 | tee tests/gen_ad_odoo.log   (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var initSqlJs = require('sql.js');
var ROOT = path.join(__dirname, '..');

var ODB = process.env.ODOO_DB || 'odoodemo', OL = 'admin', OP = 'admin';
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

// ── tiny sql.js row helpers ───────────────────────────────────────────────────
function exec(db, s, p) { return db.exec(s, p || []); }
function rowObj(db, s, p) { var r = exec(db, s, p); if (!r.length) return null; var o = {}; r[0].columns.forEach(function (c, i) { o[c] = r[0].values[0][i]; }); return o; }
function cols(db, t) { return exec(db, "SELECT name FROM pragma_table_info('" + t + "')")[0].values.map(function (r) { return r[0]; }); }
function insert(db, t, obj) {
  // normalize keys to the table's REAL column case (case varies per table); on collision the LAST key set
  // wins — clone() applies overrides AFTER the source row, so overrides win. Unknown keys are dropped.
  var lc = {}; cols(db, t).forEach(function (c) { lc[c.toLowerCase()] = c; });
  var out = {}; Object.keys(obj).forEach(function (k) { var c = lc[k.toLowerCase()]; if (c) out[c] = obj[k]; });
  var ks = Object.keys(out), ph = ks.map(function () { return '?'; }).join(',');
  db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ph + ')', ks.map(function (k) { return out[k]; }));
}
// clone ONE real row (whereSql) into the same table with `overrides` applied — guarantees every column the
// dictionary expects is present (we copy a real tenant's row; copy-a-pattern, not invent).
function clone(db, t, whereSql, overrides) {
  var src = rowObj(db, 'SELECT * FROM ' + t + ' WHERE ' + whereSql);
  if (!src) throw new Error('clone src not found: ' + t + ' ' + whereSql);
  Object.keys(overrides).forEach(function (k) { src[k] = overrides[k]; });
  insert(db, t, src); return src;
}

(async function () {
  var log = []; function L(m) { console.log(m); log.push(m); }
  L('\n══ GEN-AD-ODOO — clone GardenWorld frame → Client 12 "Odoo" + live odoodemo data ══\n');

  // ── 1. live Odoo pull (real rows only) ──
  var uid = await rpc('common', 'login', [ODB, OL, OP]);
  if (!uid) { L('§GEN-AD-ODOO FAIL auth'); process.exit(1); }
  var ex = function (model, meth, args, kw) { return rpc('object', 'execute_kw', [ODB, uid, OP, model, meth, args, kw || {}]); };
  var prods = await ex('product.product', 'search_read', [[['sale_ok', '=', true]]], { fields: ['id', 'name', 'type', 'list_price', 'categ_id'], limit: 200 });
  var so = (await ex('sale.order', 'search_read', [[['name', '=', 'S00023']]], { fields: ['id', 'name', 'state', 'date_order', 'amount_untaxed', 'amount_total', 'partner_id'] }))[0];
  var sol = await ex('sale.order.line', 'search_read', [[['order_id', '=', so.id], ['display_type', '=', false]]], { fields: ['product_id', 'product_uom_qty', 'qty_delivered', 'qty_invoiced', 'price_unit', 'price_subtotal'] });
  var inv = (await ex('account.move', 'search_read', [[['invoice_origin', '=', so.name], ['move_type', '=', 'out_invoice']]], { fields: ['id', 'name', 'state', 'invoice_date', 'amount_untaxed', 'amount_total', 'payment_state'] }))[0];
  L('   live: products=' + prods.length + ' SO=' + so.name + ' lines=' + sol.length + ' invoice=' + (inv && inv.name) + ' total=' + (so.amount_total));

  // ── 2. open the shared dictionary db (the framework) ──
  var SQL = await initSqlJs();
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ROOT, 'ad_seed.db'))));

  // ── 3. clone the GardenWorld(11) tenant frame → Client 12 "Odoo" ──
  var CL = 12, ORG = 12000, ROLE = 12000, USER = 12000;
  clone(db, 'AD_Client', 'AD_Client_ID=11', { AD_Client_ID: CL, Value: 'Odoo', Name: 'Odoo', Description: 'Migrated from odoodemo (Odoo 17)' });
  clone(db, 'AD_Org', 'AD_Org_ID=11', { AD_Org_ID: ORG, AD_Client_ID: CL, Value: 'Odoo HQ', Name: 'Odoo HQ', Description: 'Odoo tenant org' });
  clone(db, 'AD_Role', 'AD_Role_ID=102', { AD_Role_ID: ROLE, AD_Client_ID: CL, Name: 'Odoo Admin', Description: 'Odoo Admin' });
  clone(db, 'AD_User', 'AD_User_ID=101', { AD_User_ID: USER, AD_Client_ID: CL, Name: 'Odoo Admin' });
  // link user→role, role→org (clone a sample row's full shape, override the keys)
  var urSample = rowObj(db, 'SELECT * FROM AD_User_Roles LIMIT 1');
  Object.keys(urSample).forEach(function (k) { if (/_id$/i.test(k)) urSample[k] = null; });
  urSample.AD_User_ID = USER; urSample.AD_Role_ID = ROLE; urSample.AD_Client_ID = CL; urSample.AD_Org_ID = 0;
  if ('isactive' in urSample) urSample.isactive = 'Y'; if ('IsActive' in urSample) urSample.IsActive = 'Y';
  insert(db, 'AD_User_Roles', urSample);
  var oaSample = rowObj(db, 'SELECT * FROM AD_Role_OrgAccess LIMIT 1');
  oaSample.AD_Role_ID = ROLE; oaSample.AD_Org_ID = ORG; oaSample.AD_Client_ID = CL;
  if ('isactive' in oaSample) oaSample.isactive = 'Y'; if ('IsActive' in oaSample) oaSample.IsActive = 'Y';
  insert(db, 'AD_Role_OrgAccess', oaSample);
  // window access: clone EVERY role-102 grant onto the new role (same windows visible)
  var waCols = cols(db, 'AD_Window_Access');
  var waRows = exec(db, 'SELECT ' + waCols.join(',') + ' FROM AD_Window_Access WHERE AD_Role_ID=102');
  var nWA = 0;
  if (waRows.length) waRows[0].values.forEach(function (vals) {
    var o = {}; waCols.forEach(function (c, i) { o[c] = vals[i]; });
    o.AD_Role_ID = ROLE; if ('AD_Client_ID' in o) o.AD_Client_ID = CL;
    insert(db, 'AD_Window_Access', o); nWA++;
  });
  L('   cloned frame: Client ' + CL + ', Org ' + ORG + ', Role ' + ROLE + ', User ' + USER + ', window-grants=' + nWA);

  // ── 3b. PROPER PRACTICE — a System Administrator role (client 0) is where tenant SETUP/migration happens
  //    (cross-client). The seed had none (SuperUser defaulted into GardenWorld); add it and grant it to the
  //    existing System user (id 10, client 0) so ?login=System lands in real SystemAdmin mode. ──
  // the seed has no AD_Client row for id 0 (the System client) — clientFor() on a client-0 role needs it.
  if (!rowObj(db, 'SELECT 1 FROM AD_Client WHERE AD_Client_ID=0'))
    clone(db, 'AD_Client', 'AD_Client_ID=11', { AD_Client_ID: 0, Value: 'System', Name: 'System', Description: 'System (cross-client)' });
  var SAROLE = 1000000;
  clone(db, 'AD_Role', 'AD_Role_ID=102', { AD_Role_ID: SAROLE, AD_Client_ID: 0, Name: 'System Administrator',
    Description: 'System Administrator', UserLevel: 'S  ', IsAccessAllOrgs: 'Y', IsClientAdministrator: 'N' });
  var saUR = rowObj(db, 'SELECT * FROM AD_User_Roles LIMIT 1');
  saUR.AD_User_ID = 10; saUR.AD_Role_ID = SAROLE; saUR.AD_Client_ID = 0; saUR.AD_Org_ID = 0; saUR.IsActive = 'Y';
  insert(db, 'AD_User_Roles', saUR);
  var saOA = rowObj(db, 'SELECT * FROM AD_Role_OrgAccess LIMIT 1');
  saOA.AD_Role_ID = SAROLE; saOA.AD_Org_ID = 0; saOA.AD_Client_ID = 0; saOA.IsActive = 'Y';
  insert(db, 'AD_Role_OrgAccess', saOA);
  if (waRows.length) waRows[0].values.forEach(function (vals) { var o = {}; waCols.forEach(function (c, i) { o[c] = vals[i]; });
    o.AD_Role_ID = SAROLE; if ('AD_Client_ID' in o) o.AD_Client_ID = 0; insert(db, 'AD_Window_Access', o); });
  L('   SystemAdmin: role ' + SAROLE + ' (client 0) granted to System user 10 — the proper migration mode');

  // ── 4. real Odoo DATA under Client 12 ──
  // 4a. categories (distinct Odoo leaf categ → one M_Product_Category)
  var catId = {}, nextCat = 12001;
  prods.forEach(function (p) { var leaf = (p.categ_id && p.categ_id[1] || 'Odoo').split('/').pop().trim();
    if (!catId[leaf]) { catId[leaf] = nextCat++; insert(db, 'M_Product_Category', { M_Product_Category_ID: catId[leaf], AD_Client_ID: CL, Name: leaf, Value: leaf, IsActive: 'Y' }); } });
  // 4b. products (real name/category/type)
  var pidMap = {}, nextP = 1200000, nProd = 0;
  prods.forEach(function (p) { var leaf = (p.categ_id && p.categ_id[1] || 'Odoo').split('/').pop().trim();
    var pid = nextP++; pidMap[p.id] = pid;
    insert(db, 'M_Product', { M_Product_ID: pid, AD_Client_ID: CL, AD_Org_ID: ORG, Value: 'ODOO-' + p.id, Name: p.name,
      M_Product_Category_ID: catId[leaf], ProductType: (p.type === 'service' ? 'S' : 'I'), C_UOM_ID: 100, IsActive: 'Y' }); nProd++; });
  L('   products=' + nProd + ' categories=' + Object.keys(catId).length + ' [' + Object.keys(catId).join(', ') + ']');

  // 4c. the customer (real partner) + the SO S00023 chain
  var BP = 1200001;
  insert(db, 'C_BPartner', { C_BPartner_ID: BP, AD_Client_ID: CL, AD_Org_ID: ORG, Value: 'ODOO-BP-' + so.partner_id[0],
    Name: so.partner_id[1], IsCustomer: 'Y', IsVendor: 'N', IsEmployee: 'N', IsActive: 'Y' });
  var ORD = 1200001;
  insert(db, 'C_Order', { C_Order_ID: ORD, AD_Client_ID: CL, AD_Org_ID: ORG, DocumentNo: so.name, DocStatus: 'CO',
    IsSOTrx: 'Y', DateOrdered: String(so.date_order).slice(0, 10), C_BPartner_ID: BP, C_Currency_ID: 100,
    GrandTotal: so.amount_total, TotalLines: so.amount_untaxed, Description: 'Migrated from odoodemo', IsActive: 'Y' });
  sol.forEach(function (l, i) { insert(db, 'C_OrderLine', { C_OrderLine_ID: ORD * 100 + i + 1, AD_Client_ID: CL, AD_Org_ID: ORG,
    C_Order_ID: ORD, Line: (i + 1) * 10, M_Product_ID: pidMap[l.product_id[0]] || null, QtyOrdered: l.product_uom_qty,
    QtyDelivered: l.qty_delivered, QtyInvoiced: l.qty_invoiced, PriceActual: l.price_unit, LineNetAmt: l.price_subtotal, C_UOM_ID: 100, IsActive: 'Y' }); });
  // 4d. the invoice
  if (inv) { var INV = 1200001;
    insert(db, 'C_Invoice', { C_Invoice_ID: INV, AD_Client_ID: CL, AD_Org_ID: ORG, DocumentNo: inv.name, DocStatus: 'CO',
      IsSOTrx: 'Y', DateInvoiced: String(inv.invoice_date).slice(0, 10), C_BPartner_ID: BP, C_Currency_ID: 100,
      GrandTotal: inv.amount_total, TotalLines: inv.amount_untaxed, Description: 'Migrated from odoodemo · ' + inv.payment_state,
      C_Order_ID: ORD, IsActive: 'Y' }); }
  L('   SO ' + so.name + ' (CO) + ' + sol.length + ' lines, customer "' + so.partner_id[1] + '", invoice ' + (inv && inv.name));

  // ── 5. write the seed ──
  var out = path.join(ROOT, 'ad_odoo.db');
  fs.writeFileSync(out, Buffer.from(db.export()));
  // sanity read-back
  var pc = rowObj(db, 'SELECT COUNT(*) n FROM M_Product WHERE AD_Client_ID=12').n;
  var uc = rowObj(db, "SELECT COUNT(*) n FROM AD_User u JOIN AD_User_Roles ur ON ur.AD_User_ID=u.AD_User_ID WHERE u.AD_Client_ID=12").n;
  L('\n§GEN-AD-ODOO wrote ad_odoo.db bytes=' + fs.statSync(out).size + ' client12.products=' + pc + ' client12.loginUsers=' + uc + ' SO=' + so.name);
  L('§GEN-AD-ODOO ' + (pc === prods.length && uc === 1 ? 'PASS' : 'FAIL') + ' (demo: idempiere.html?seed=ad_odoo.db&window=140)\n');
  fs.writeFileSync(path.join(__dirname, 'gen_ad_odoo.log'), log.join('\n'));
  process.exit(pc === prods.length && uc === 1 ? 0 : 1);
})().catch(function (e) { console.error('§GEN-AD-ODOO ERROR', e.message); process.exit(2); });
