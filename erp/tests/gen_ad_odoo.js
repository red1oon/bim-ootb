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
// SOURCE-OF-TRUTH copy (build/erp/): read the framework ad_seed.db from the deploy repo, write the tenant
// shard alongside this generator (build/erp/12-odoo.db). Both overridable by env. Deploy = sync to bim-ootb.
var SEED = process.env.AD_SEED || path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db');
var OUT = process.env.SHARD_OUT || path.join(__dirname, '12-odoo.db');
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
// next free AD_Client id = one past the highest non-System client already in the base (framework ad_seed has
// GardenWorld(11) → 12; a base already carrying 12/13 → 14). The free-slot default; CLIENT_ID env overrides.
function nextFreeClient(db) { var r = exec(db, 'SELECT COALESCE(MAX(AD_Client_ID),11) m FROM AD_Client WHERE AD_Client_ID>0'); return Number(r[0].values[0][0]) + 1; }

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
  var inv = (await ex('account.move', 'search_read', [[['invoice_origin', '=', so.name], ['move_type', '=', 'out_invoice']]], { fields: ['id', 'name', 'invoice_date', 'amount_untaxed', 'amount_total', 'amount_tax', 'payment_state'] }))[0];
  // ── 1b. POSTING-CONFIG pull (MIGRATE_FULL_MODEL_FRAME §3) — every account from a REAL Odoo column. ──
  //   partner receivable property · product-category income/expense properties · the sale tax + its GL account
  //   (read off the posted invoice AML, the most non-invent source) · the invoice lines (subtotals) + tax amount.
  var partner = (await ex('res.partner', 'read', [[so.partner_id[0]]], { fields: ['id', 'name', 'property_account_receivable_id'] }))[0];
  var ocats = await ex('product.category', 'search_read', [[]], { fields: ['id', 'name', 'property_account_income_categ_id', 'property_account_expense_categ_id'] });
  var saleTax = (await ex('account.tax', 'search_read', [[['type_tax_use', '=', 'sale']]], { fields: ['id', 'name', 'amount'] }))[0];
  // the posted invoice's GL lines = the ORACLE (and the source of the tax account + invoice-line subtotals).
  var aml = inv ? await ex('account.move.line', 'search_read', [[['move_id', '=', inv.id]]], { fields: ['account_id', 'debit', 'credit', 'display_type', 'product_id', 'tax_line_id'] }) : [];
  var invLines = inv ? await ex('account.move.line', 'search_read', [[['move_id', '=', inv.id], ['display_type', '=', 'product']]], { fields: ['product_id', 'price_subtotal'] }) : [];
  var taxAcct = aml.filter(function (l) { return l.display_type === 'tax'; })[0];        // the tax GL account (251000)
  L('   acctcfg: receivable=' + (partner.property_account_receivable_id && partner.property_account_receivable_id[1]) +
    ' incomeCat=' + (ocats[0] && ocats[0].property_account_income_categ_id && ocats[0].property_account_income_categ_id[1]) +
    ' tax=' + (saleTax && saleTax.name) + ' taxAcct=' + (taxAcct && taxAcct.account_id[1]) + ' amlLines=' + aml.length);
  // L1 lifecycle rule population — ALL sale orders (real amount_total + state), gated by "may Complete iff total ≤ T".
  var orders = await ex('sale.order', 'search_read', [[]], { fields: ['id', 'name', 'state', 'date_order', 'amount_total', 'amount_untaxed', 'partner_id'], order: 'amount_total desc', limit: 200 });
  L('   live: products=' + prods.length + ' SO=' + so.name + ' lines=' + sol.length + ' invoice=' + (inv && inv.name) + ' orders=' + orders.length);

  // ── 2. base (framework) + a fresh SHARD db (only the new rows live here) ──
  var SQL = await initSqlJs();
  var base = new SQL.Database(new Uint8Array(fs.readFileSync(SEED)));
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

  // ── 4. the Odoo tenant frame: Client / Org / Role / User / access (cloned from GardenWorld) ──
  // FREE-SLOT ID PICKER (NEW_CLIENT_MGMT.md #2): the client id is no longer hardcoded to 12 — it is CLIENT_ID
  // (caller's choice, e.g. the install UI) or the next free AD_Client id past the base seed (vanilla ad_seed
  // has client 11 → 12; a base already carrying 12,13 → 14). EVERY dependent id derives from CL so two tenants
  // never collide: SCOPE=CL*1000 (org/role/user), DOC=CL*100000 (documents — products/BP/order/invoice/pricelist/
  // tax, each in its own table so they may share DOC+1), ACCT=DOC+50000 (the client's natural accounts live in
  // the upper half of its 100k band → element/validcombination ids are client-scoped, fixing the cross-Odoo-tenant
  // collision where ev id = raw Odoo account id (6,19,…) coincided). NON-INVENT: ids are surrogates; every NAME/
  // VALUE/AMOUNT is still a real Odoo column. For CL=12 the DOCUMENT ids are unchanged (1200000-based).
  var CL = Number(process.env.CLIENT_ID) || nextFreeClient(base);
  var SCOPE = CL * 1000, DOC = CL * 100000, ACCT = DOC + 50000;
  var ORG = SCOPE, ROLE = SCOPE, USER = SCOPE;
  var TENANT = process.env.TENANT_NAME || 'Odoo';
  L('   ALLOC client=' + CL + ' (CLIENT_ID env=' + (process.env.CLIENT_ID || 'unset → next-free') + ') scope=' + SCOPE + ' docBase=' + DOC + ' acctBase=' + ACCT + ' tenant="' + TENANT + '"');
  clone('AD_Client', 'AD_Client_ID=11', { AD_Client_ID: CL, Value: TENANT, Name: TENANT, Description: 'Migrated from odoodemo (Odoo 17)' }, CL, 0);
  clone('AD_Org', 'AD_Org_ID=11', { AD_Org_ID: ORG, Value: TENANT + ' HQ', Name: TENANT + ' HQ', Description: 'Odoo tenant org' }, CL, ORG);
  clone('AD_Role', 'AD_Role_ID=102', { AD_Role_ID: ROLE, Name: TENANT + ' Admin', Description: TENANT + ' Admin' }, CL, 0);
  clone('AD_User', 'AD_User_ID=101', { AD_User_ID: USER, Name: TENANT + ' Admin' }, CL, 0);
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
  L('   frame: System(0)+SysAdmin role, Client ' + CL + ' "' + TENANT + '", window-grants=' + nWA + '×2');

  // ── 5. real Odoo DATA (7-field enforced) ──
  var catId = {}, nextCat = SCOPE + 1;
  prods.forEach(function (p) { var leaf = (p.categ_id && p.categ_id[1] || 'Odoo').split('/').pop().trim();
    if (!catId[leaf]) { catId[leaf] = nextCat++; ins('M_Product_Category', stamp7({ M_Product_Category_ID: catId[leaf], Name: leaf, Value: leaf }, CL, 0)); } });
  var pidMap = {}, nextP = DOC;
  prods.forEach(function (p) { var leaf = (p.categ_id && p.categ_id[1] || 'Odoo').split('/').pop().trim(); var pid = nextP++; pidMap[p.id] = pid;
    ins('M_Product', stamp7({ M_Product_ID: pid, Value: 'ODOO-' + p.id, Name: p.name, M_Product_Category_ID: catId[leaf], ProductType: (p.type === 'service' ? 'S' : 'I'), C_UOM_ID: 100 }, CL, ORG)); });
  // ── 5b. real Odoo list_price → M_ProductPrice (iDempiere-faithful: a Client-12 sales price list + version,
  //        one price row per product carrying the RECORDED Odoo list_price). NON-INVENT: every price is real Odoo.
  var PL = DOC + 1, PLV = DOC + 1;                                  // Odoo sales price list + its current version
  ins('M_PriceList', stamp7({ M_PriceList_ID: PL, Name: 'Odoo Sales', Description: 'Migrated Odoo sales price list', C_Currency_ID: 100, IsSOPriceList: 'Y' }, CL, ORG));
  ins('M_PriceList_Version', stamp7({ M_PriceList_Version_ID: PLV, M_PriceList_ID: PL, Name: 'Odoo Sales (current)', Description: 'Migrated from odoodemo list_price', ValidFrom: MIG_TS }, CL, ORG));
  var priced = 0, pmin = null, pmax = null;
  prods.forEach(function (p) { var pid = pidMap[p.id]; var lp = p.list_price;   // RECORDED Odoo value (may be 0; kept real)
    ins('M_ProductPrice', stamp7({ M_Product_ID: pid, M_PriceList_Version_ID: PLV, PriceList: lp, PriceStd: lp, PriceLimit: lp }, CL, ORG));
    priced++; if (pmin === null || lp < pmin) pmin = lp; if (pmax === null || lp > pmax) pmax = lp; });
  L('§RULE-DATA products=' + prods.length + ' priced=' + priced + ' min=' + pmin + ' max=' + pmax + ' (all real Odoo list_price, 0 invented)');
  var BP = DOC + 1, INV = DOC + 1;
  ins('C_BPartner', stamp7({ C_BPartner_ID: BP, Value: 'ODOO-BP-' + so.partner_id[0], Name: so.partner_id[1], IsCustomer: 'Y', IsVendor: 'N', IsEmployee: 'N' }, CL, ORG));
  var ORD = DOC + 1;
  ins('C_Order', stamp7({ C_Order_ID: ORD, DocumentNo: so.name, DocStatus: 'CO', IsSOTrx: 'Y', DateOrdered: String(so.date_order).slice(0, 10), C_BPartner_ID: BP, C_Currency_ID: 100, GrandTotal: so.amount_total, TotalLines: so.amount_untaxed, Description: 'Migrated from odoodemo' }, CL, ORG));
  sol.forEach(function (l, i) { ins('C_OrderLine', stamp7({ C_OrderLine_ID: ORD * 100 + i + 1, C_Order_ID: ORD, Line: (i + 1) * 10, M_Product_ID: pidMap[l.product_id[0]] || null, QtyOrdered: l.product_uom_qty, QtyDelivered: l.qty_delivered, QtyInvoiced: l.qty_invoiced, PriceActual: l.price_unit, LineNetAmt: l.price_subtotal, C_UOM_ID: 100 }, CL, ORG)); });
  if (inv) ins('C_Invoice', stamp7({ C_Invoice_ID: INV, DocumentNo: inv.name, DocStatus: 'CO', IsSOTrx: 'Y', DateInvoiced: String(inv.invoice_date).slice(0, 10), C_BPartner_ID: BP, C_Currency_ID: 100, GrandTotal: inv.amount_total, TotalLines: inv.amount_untaxed, Description: 'Migrated from odoodemo · ' + inv.payment_state, C_Order_ID: ORD }, CL, ORG));
  L('   data: products=' + prods.length + ' categories=' + Object.keys(catId).length + ' SO=' + so.name + ' customer="' + so.partner_id[1] + '"');

  // ── 5c. real Odoo ORDER population for the L1 lifecycle rule ("when may this Order complete"). Insert every
  //        sale order as C_Order (Client 12) with its real GrandTotal + DocStatus mapped from the Odoo state
  //        (draft/sent→DR, sale→IP — both completable to CO; done→CO; cancel→VO). S00023 stays the detailed CO
  //        showcase above (skipped here, not duplicated). Distinct partners → C_BPartner rows. NON-INVENT.
  var ST = { draft: 'DR', sent: 'DR', sale: 'IP', done: 'CO', cancel: 'VO' };
  var bpMap = {}; bpMap[so.partner_id[0]] = BP;                       // S00023's partner already inserted as BP
  var nextBP = DOC + 2, nextOrd = DOC + 2, omin = null, omax = null, ocount = 0;
  orders.forEach(function (o) {
    if (o.name === so.name) return;                                  // the detailed showcase order — keep it CO above
    var ppid = o.partner_id && o.partner_id[0];
    if (ppid && !bpMap[ppid]) { bpMap[ppid] = nextBP++; ins('C_BPartner', stamp7({ C_BPartner_ID: bpMap[ppid], Value: 'ODOO-BP-' + ppid, Name: o.partner_id[1], IsCustomer: 'Y', IsVendor: 'N', IsEmployee: 'N' }, CL, ORG)); }
    var ds = ST[o.state] || 'DR';
    ins('C_Order', stamp7({ C_Order_ID: nextOrd++, DocumentNo: o.name, DocStatus: ds, IsSOTrx: 'Y', DateOrdered: String(o.date_order).slice(0, 10), C_BPartner_ID: bpMap[ppid] || BP, C_Currency_ID: 100, GrandTotal: o.amount_total, TotalLines: o.amount_untaxed, Description: 'Migrated from odoodemo · state=' + o.state }, CL, ORG));
    if (ds === 'DR' || ds === 'IP') { ocount++; var t = o.amount_total; if (omin === null || t < omin) omin = t; if (omax === null || t > omax) omax = t; }
  });
  L('§RULE-DATA-L1 orders=' + ocount + ' DR+IP=' + ocount + ' min=' + omin + ' max=' + omax + ' (real Odoo order totals, 0 invented)');

  // ── 5d. POSTING CONFIG + richer documents (MIGRATE_FULL_MODEL_FRAME §3-4) — so the FROZEN engine
  //        (doc_poster→post_resolver) resolves the tenant's accounts to the cent and the AD-gated accounting
  //        view renders coverage:complete + balanced. Keyed on c_acctschema_id=101 (the frozen consumer's
  //        default schema) — every ACCOUNT VALUE is a real Odoo column; the schema surrogate is shared engine
  //        infra (exactly as the AD dictionary is shared across clients). NON-INVENT. ──
  var SCHEMA = 101;
  // ensure a C_ElementValue (natural account) + a C_ValidCombination for an Odoo account pair [id,"code name"].
  // returns the C_ValidCombination id (what the master *_acct columns store, mirroring gl_journalline).
  var evSeen = {}, vcSeen = {};
  function acctVC(odooAcct) {
    if (!odooAcct) return null;
    var aid = odooAcct[0], label = String(odooAcct[1] || '');
    var sp = label.indexOf(' '), code = sp < 0 ? label : label.slice(0, sp), nm = sp < 0 ? label : label.slice(sp + 1);
    // client-scope the natural account id: raw Odoo aid (6,19,…) would collide between two Odoo tenants. ev lives
    // in the client's ACCT band (DOC+50000+aid); vc is offset +25000 above ev within the same band. aid is small
    // (Odoo account.account record id), so both stay inside [ACCT, DOC+100000). vc.account_id points to the ev id.
    var evId = ACCT + aid, vc = ACCT + 25000 + aid;
    if (!evSeen[evId]) { ins('c_elementvalue', stamp7({ c_elementvalue_id: evId, value: code, name: nm, accounttype: '', issummary: 'N' }, CL, 0)); evSeen[evId] = 1; }
    if (!vcSeen[vc]) { ins('c_validcombination', stamp7({ c_validcombination_id: vc, account_id: evId }, CL, 0)); vcSeen[vc] = 1; }
    return vc;
  }
  ins('c_acctschema_default', stamp7({ c_acctschema_id: SCHEMA }, CL, 0));
  // BPartner receivable — partner.property_account_receivable_id (one row per migrated customer, here the SO partner).
  var rcvVC = acctVC(partner.property_account_receivable_id);
  if (rcvVC) ins('c_bp_customer_acct', stamp7({ c_bpartner_id: BP, c_acctschema_id: SCHEMA, c_receivable_acct: rcvVC }, CL, 0));
  // Product-category revenue/cogs — category income/expense properties (one row per migrated category).
  var ncfg = 0;
  ocats.forEach(function (oc) {
    var leaf = String(oc.name || 'Odoo').split('/').pop().trim();
    var cid = catId[leaf]; if (cid == null) return;                                   // only categories we emitted
    var revVC = acctVC(oc.property_account_income_categ_id);
    var cogsVC = acctVC(oc.property_account_expense_categ_id);
    ins('m_product_category_acct', stamp7({ m_product_category_id: cid, c_acctschema_id: SCHEMA, p_revenue_acct: revVC, p_cogs_acct: cogsVC, p_asset_acct: cogsVC }, CL, 0));
    ncfg++;
  });
  // Tax — the sale tax + its GL account (read off the posted invoice's tax AML line: 251000 Tax Received).
  var TAXID = DOC + 1, dueVC = taxAcct ? acctVC(taxAcct.account_id) : null;
  ins('c_tax', stamp7({ c_tax_id: TAXID, name: (saleTax && saleTax.name) || 'Tax', rate: (saleTax && saleTax.amount) || 0, issummary: 'N' }, CL, 0));
  if (dueVC) ins('c_tax_acct', stamp7({ c_tax_id: TAXID, c_acctschema_id: SCHEMA, t_due_acct: dueVC, t_credit_acct: dueVC }, CL, 0));
  // ── richer documents: invoice lines (link to the order lines) + invoice tax + order tax, so the C_Order
  //    resolves through its generated INVOICE (the oracle path, == Odoo account.move.line to the cent). ──
  var ninvl = 0;
  if (inv) {
    invLines.forEach(function (l, i) {
      ins('c_invoiceline', stamp7({ c_invoiceline_id: INV * 10 + i + 1, c_invoice_id: INV, c_orderline_id: ORD * 100 + i + 1,
        m_product_id: pidMap[l.product_id && l.product_id[0]] || null, line: (i + 1) * 10, linenetamt: l.price_subtotal }, CL, ORG));
      ninvl++;
    });
    ins('c_invoicetax', stamp7({ c_invoice_id: INV, c_tax_id: TAXID, taxamt: inv.amount_tax }, CL, ORG));
  }
  // order tax (drives the DRAFT-projection path too, when no invoice exists)
  ins('c_ordertax', stamp7({ c_order_id: ORD, c_tax_id: TAXID, taxamt: (inv && inv.amount_tax) || (so.amount_total - so.amount_untaxed) }, CL, ORG));
  L('§MIGRATE-POSTCFG-EMIT schema=' + SCHEMA + ' elementvalues=' + Object.keys(evSeen).length + ' validcombinations=' + Object.keys(vcSeen).length +
    ' bp_cust_acct=' + (rcvVC ? 1 : 0) + ' prodcat_acct=' + ncfg + ' tax_acct=' + (dueVC ? 1 : 0) + ' invoicelines=' + ninvl + ' (0 invented)');

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
  var out = OUT;
  fs.writeFileSync(out, Buffer.from(shard.export()));
  var pc = exec(shard, 'SELECT COUNT(*) n FROM M_Product WHERE AD_Client_ID=' + CL)[0].values[0][0];
  var uc = exec(shard, 'SELECT COUNT(*) n FROM AD_User WHERE AD_Client_ID=' + CL)[0].values[0][0];
  L('\n§GEN-AD-ODOO wrote ' + path.basename(out) + ' bytes=' + fs.statSync(out).size + ' tables=' + Object.keys(schemaDone).length +
    ' client=' + CL + ' products=' + pc + ' 7field-audited-rows=' + audited + ' violations=' + violations);
  var pass = pc === prods.length && uc === 1 && violations === 0;
  L('§GEN-AD-ODOO ' + (pass ? 'PASS' : 'FAIL') + ' (demo: idempiere.html?seed=ad_seed.db&shard=' + path.basename(out) + '&client=' + CL + '&login=' + TENANT + ')\n');
  fs.writeFileSync(path.join(__dirname, 'gen_ad_odoo.log'), log.join('\n'));
  process.exit(pass ? 0 : 1);
})().catch(function (e) { console.error('§GEN-AD-ODOO ERROR', e.message); process.exit(2); });
