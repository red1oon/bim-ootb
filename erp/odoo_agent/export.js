#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §B1-SPEC — Witness: W-ODOO-EXPORT
//
// export.js — the Odoo MASTER-DATA export the user runs on the machine that has Odoo. It writes ./odoo_export/:
//   one CSV per iDempiere target, header = the iDempiere column names, in LOAD ORDER, plus manifest.json with the live
//   Odoo count of every slice (the non-invent proof). The browser ERP then loads these through iDempiere's own import
//   path (window CSV Import for reference data, the Import File Loader + Import processes for I_* tables).
//   The browser never connects to Odoo. Nothing is invented: every cell is a field of a real Odoo row; where iDempiere
//   needs a value Odoo does not have (UoM X12DE355 code), the cell is left for the user to map in the summary screen.
//   No npm dependency — plain Node.
// Run:  node export.js        env: ODOO_HOST ODOO_PORT ODOO_DB ODOO_LOGIN ODOO_PASSWORD CUTOVER(YYYY-MM-DD, default today)
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');

var HOST = process.env.ODOO_HOST || 'localhost', PORT = Number(process.env.ODOO_PORT || 8069);
var DB = process.env.ODOO_DB || 'odoodemo', LOGIN = process.env.ODOO_LOGIN || 'admin', PASSWORD = process.env.ODOO_PASSWORD || 'admin';
var CUTOVER = process.env.CUTOVER || new Date().toISOString().slice(0, 10);
var OUT = path.join(process.cwd(), process.env.EXPORT_DIR || 'odoo_export');

function rpc(service, method, args) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: service, method: method, args: args } });
    var req = http.request({ host: HOST, port: PORT, path: '/jsonrpc', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, function (res) {
      var d = ''; res.on('data', function (c) { d += c; }); res.on('end', function () {
        try { var j = JSON.parse(d); if (j.error) return reject(new Error(JSON.stringify(j.error.data && j.error.data.message || j.error))); resolve(j.result); }
        catch (e) { reject(e); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}
function cell(v) {
  if (v === null || v === undefined || v === false) return '';
  var s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function m2o(v) { return Array.isArray(v) ? v[0] : null; }

// Odoo account_type → iDempiere AccountType (A asset, L liability, O owner's equity, R revenue, E expense, M memo)
function acctType(t) {
  if (/^asset/.test(t)) return 'A'; if (/^liability/.test(t)) return 'L'; if (/^equity/.test(t)) return 'O';
  if (/^income/.test(t)) return 'R'; if (/^expense/.test(t)) return 'E'; if (t === 'off_balance') return 'M'; return '';
}
// Odoo detailed_type → iDempiere ProductType (I item, S service)
function prodType(t) { return t === 'service' ? 'S' : (t === 'consu' || t === 'product') ? 'I' : ''; }

(async function () {
  var fails = 0, files = [], counts = {}, notes = [];
  function ok(c, m, d) { if (!c) fails++; console.log('   ' + (c ? '✓' : '✗ FAIL:') + ' ' + m + (d ? ' — ' + d : '')); }
  console.log('\n══ ODOO-EXPORT — master data from ' + DB + ' @ ' + HOST + ':' + PORT + ' → ' + OUT + ' (cutover ' + CUTOVER + ') ══\n');
  var uid = await rpc('common', 'login', [DB, LOGIN, PASSWORD]);
  if (!uid) { console.log('§ODOO-EXPORT FAIL auth'); process.exit(1); }
  var ex = function (model, method, args, kw) { return rpc('object', 'execute_kw', [DB, uid, PASSWORD, model, method, args, kw || {}]); };
  var version = (await rpc('common', 'version', [])).server_version;
  async function slice(model, domain, fields, order) {
    counts[model + ' ' + JSON.stringify(domain)] = await ex(model, 'search_count', [domain]);
    return ex(model, 'search_read', [domain], { fields: fields, order: order || 'id' });
  }
  // The CSV header carries ONLY iDempiere columns: legacy refuses a file whose first line is not the template's
  //   CSVHeader (MImportTemplate.validateFile). The odoo_* columns go to provenance.json (row i of the file → Odoo fields).
  var provenance = {};
  function write(name, target, allHeader, rows, sourceKey) {
    var header = allHeader.filter(function (h) { return !/^odoo_/.test(h); }), prov = allHeader.filter(function (h) { return /^odoo_/.test(h); });
    var txt = header.map(cell).join(',') + '\n' + rows.map(function (r) { return header.map(function (h) { return cell(r[h]); }).join(','); }).join('\n') + (rows.length ? '\n' : '');
    fs.writeFileSync(path.join(OUT, name), txt);
    provenance[name] = rows.map(function (r) { var o = {}; prov.forEach(function (h) { if (r[h] !== undefined && r[h] !== '') o[h.slice(5)] = r[h]; }); return o; });
    files.push({ file: name, target: target, rows: rows.length, source: sourceKey });
    console.log('§ODOO-EXPORT file=' + name + ' target=' + target + ' rows=' + rows.length);
  }
  fs.mkdirSync(OUT, { recursive: true });

  var company = (await ex('res.company', 'search_read', [[]], { fields: ['id', 'name', 'partner_id', 'currency_id'], order: 'id' }));
  var iso = company.length ? (await ex('res.currency', 'read', [[m2o(company[0].currency_id)]], { fields: ['name'] }))[0].name : '';

  // 1 UoM → C_UOM (window CSV import). X12DE355 (4-char, mandatory in iDempiere) has no Odoo source: left blank here;
  //   the browser summary screen maps each Odoo UoM to an iDempiere UoM (it knows the tenant's UoMs, this agent does not).
  var uoms = await slice('uom.uom', [], ['id', 'name', 'category_id', 'uom_type', 'factor', 'rounding']);
  write('01_uom.csv', 'C_UOM', ['Name', 'UOMSymbol', 'X12DE355', 'StdPrecision', 'odoo_id', 'odoo_category', 'odoo_uom_type', 'odoo_factor'],
    uoms.map(function (u) { return { Name: u.name, UOMSymbol: u.name.slice(0, 10), X12DE355: '', StdPrecision: '',
      odoo_id: u.id, odoo_category: u.category_id && u.category_id[1], odoo_uom_type: u.uom_type, odoo_factor: u.factor }; }), 'uom.uom []');
  notes.push('C_UOM.X12DE355 is mandatory (4 chars) and Odoo has no such code: the summary screen maps each Odoo UoM to an iDempiere UoM.');

  // 2 Payment terms → C_PaymentTerm. Single-line terms carry NetDays; multi-line terms are listed for C_PaySchedule.
  var terms = await slice('account.payment.term', [], ['id', 'name', 'line_ids']);
  var tlines = await ex('account.payment.term.line', 'search_read', [[]], { fields: ['payment_id', 'value', 'value_amount', 'nb_days'], order: 'id' });
  var multi = 0;
  write('02_payment_terms.csv', 'C_PaymentTerm', ['Value', 'Name', 'NetDays', 'odoo_id', 'odoo_lines'],
    terms.map(function (t) {
      var ls = tlines.filter(function (l) { return m2o(l.payment_id) === t.id; });
      if (ls.length > 1) multi++;
      return { Value: t.name.slice(0, 40), Name: t.name, NetDays: ls.length === 1 ? ls[0].nb_days : '', odoo_id: t.id,
        odoo_lines: JSON.stringify(ls.map(function (l) { return [l.value, l.value_amount, l.nb_days]; })) };
    }), 'account.payment.term []');
  if (multi) notes.push(multi + ' payment term(s) have several installments → C_PaySchedule rows (odoo_lines column), not NetDays.');

  // 3 Product categories → M_Product_Category, parent by Value (Odoo complete_name is unique), parents first.
  var cats = await slice('product.category', [], ['id', 'name', 'complete_name', 'parent_id']);
  var catById = {}; cats.forEach(function (c) { catById[c.id] = c; });
  cats.sort(function (a, b) { return a.complete_name.split(' / ').length - b.complete_name.split(' / ').length || a.id - b.id; });
  write('03_product_categories.csv', 'M_Product_Category', ['Value', 'Name', 'M_Product_Category_Parent_ID[Value]', 'odoo_id'],
    cats.map(function (c) { return { Value: c.complete_name, Name: c.name,
      'M_Product_Category_Parent_ID[Value]': c.parent_id ? catById[m2o(c.parent_id)].complete_name : '', odoo_id: c.id }; }), 'product.category []');

  // 4 Chart of accounts → I_ElementValue. Parent from account.group only when the localisation has groups.
  var accts = await slice('account.account', [], ['id', 'code', 'name', 'account_type', 'group_id']);
  var groups = await ex('account.group', 'search_count', [[]]);
  write('04_accounts.csv', 'I_ElementValue', ['Value', 'Name', 'AccountType', 'AccountSign', 'IsSummary', 'ParentValue', 'odoo_id', 'odoo_account_type'],
    accts.map(function (a) { return { Value: a.code, Name: a.name, AccountType: acctType(a.account_type), AccountSign: 'N', IsSummary: 'N',
      ParentValue: '', odoo_id: a.id, odoo_account_type: a.account_type }; }), 'account.account []');
  if (!groups) notes.push('account.group has 0 rows: the chart of accounts imports flat (no summary parents in the source).');

  // 5 Business partners → I_BPartner. Commercial partners (no parent) = BP rows; contacts (parent set) = contact rows
  //   under the parent's Value. Own company + internal users' partners go to a separate file (open detail, §B1-SPEC).
  var pf = ['id', 'name', 'ref', 'is_company', 'parent_id', 'type', 'email', 'phone', 'mobile', 'street', 'street2', 'city',
    'state_id', 'zip', 'country_id', 'vat', 'customer_rank', 'supplier_rank'];
  var partners = await slice('res.partner', [], pf);
  var users = await ex('res.users', 'search_read', [[]], { fields: ['partner_id'], context: { active_test: false } });
  var internal = {}; company.forEach(function (c) { internal[m2o(c.partner_id)] = 'company'; }); users.forEach(function (u) { internal[m2o(u.partner_id)] = internal[m2o(u.partner_id)] || 'user'; });
  var countryIds = [], stateIds = [];
  partners.forEach(function (p) { if (p.country_id) countryIds.push(m2o(p.country_id)); if (p.state_id) stateIds.push(m2o(p.state_id)); });
  var cc = {}, st = {};
  (await ex('res.country', 'read', [Array.from(new Set(countryIds))], { fields: ['code'] })).forEach(function (c) { cc[c.id] = c.code; });
  if (stateIds.length) (await ex('res.country.state', 'read', [Array.from(new Set(stateIds))], { fields: ['name'] })).forEach(function (s) { st[s.id] = s.name; });
  var byId = {}; partners.forEach(function (p) { byId[p.id] = p; });
  function val(p) { return p.ref || String(p.id); }
  function addr(r, p) { r.Address1 = p.street; r.Address2 = p.street2; r.City = p.city; r.Postal = p.zip;
    r.RegionName = p.state_id ? st[m2o(p.state_id)] : ''; r.CountryCode = p.country_id ? cc[m2o(p.country_id)] : ''; }
  var H = ['Value', 'Name', 'TaxID', 'IsCustomer', 'IsVendor', 'GroupValue', 'Address1', 'Address2', 'City', 'Postal', 'RegionName',
    'CountryCode', 'ContactName', 'EMail', 'Phone', 'Phone2', 'odoo_id', 'odoo_row'];
  var bpRows = [], inRows = [];
  partners.filter(function (p) { return !p.parent_id; }).forEach(function (p) {
    var r = { Value: val(p), Name: p.name, TaxID: p.vat, IsCustomer: p.customer_rank > 0 ? 'Y' : 'N', IsVendor: p.supplier_rank > 0 ? 'Y' : 'N',
      GroupValue: '', EMail: p.email, Phone: p.phone, Phone2: p.mobile, odoo_id: p.id, odoo_row: 'partner' };
    addr(r, p); (internal[p.id] ? inRows : bpRows).push(Object.assign(r, internal[p.id] ? { odoo_row: 'internal-' + internal[p.id] } : {}));
  });
  partners.filter(function (p) { return p.parent_id; }).forEach(function (p) {
    var par = byId[m2o(p.parent_id)];
    var r = { Value: val(par), Name: par.name, ContactName: p.name, EMail: p.email, Phone: p.phone, Phone2: p.mobile, odoo_id: p.id, odoo_row: 'contact:' + p.type };
    if (p.type && p.type !== 'contact') addr(r, p);   // Odoo type=contact copies the parent's address; other types have their own
    (internal[par.id] || internal[p.id] ? inRows : bpRows).push(r);
  });
  write('05_bpartners.csv', 'I_BPartner', H, bpRows, 'res.partner []');
  write('05b_bpartners_internal.csv', 'I_BPartner (own company / users — decide in summary)', H, inRows, 'res.partner []');

  // 6 Products → I_Product. One row per product, plus one per vendor price (product.supplierinfo).
  var prods = await slice('product.product', [], ['id', 'default_code', 'name', 'categ_id', 'uom_id', 'detailed_type', 'barcode', 'weight', 'volume', 'description', 'list_price', 'standard_price', 'seller_ids']);
  var sellers = await slice('product.supplierinfo', [], ['id', 'partner_id', 'product_id', 'product_tmpl_id', 'price', 'product_code', 'min_qty', 'delay']);
  var tmplOf = {}; (await ex('product.product', 'read', [prods.map(function (p) { return p.id; })], { fields: ['product_tmpl_id'] })).forEach(function (p) { tmplOf[p.id] = m2o(p.product_tmpl_id); });
  function pval(p) { return p.default_code || String(p.id); }
  var PH = ['Value', 'Name', 'Description', 'ProductCategory_Value', 'X12DE355', 'odoo_uom', 'ProductType', 'UPC', 'Weight', 'Volume',
    'BPartner_Value', 'PricePO', 'VendorProductNo', 'Order_Min', 'DeliveryTime_Promised', 'odoo_id'];
  var pRows = [];
  prods.forEach(function (p) {
    var base = { Value: pval(p), Name: p.name, Description: p.description, ProductCategory_Value: catById[m2o(p.categ_id)] ? catById[m2o(p.categ_id)].complete_name : '',
      X12DE355: '', odoo_uom: p.uom_id && p.uom_id[1], ProductType: prodType(p.detailed_type), UPC: p.barcode, Weight: p.weight, Volume: p.volume, odoo_id: p.id };
    pRows.push(base);
    sellers.filter(function (s) { return (s.product_id && m2o(s.product_id) === p.id) || (!s.product_id && m2o(s.product_tmpl_id) === tmplOf[p.id]); }).forEach(function (s) {
      var bp = byId[m2o(s.partner_id)];
      pRows.push(Object.assign({}, base, { BPartner_Value: bp ? val(bp.parent_id ? byId[m2o(bp.parent_id)] : bp) : '', PricePO: s.price,
        VendorProductNo: s.product_code, Order_Min: s.min_qty, DeliveryTime_Promised: s.delay }));
    });
  });
  write('06_products.csv', 'I_Product', PH, pRows, 'product.product []');

  // 6b Sale price → I_PriceList (Odoo list_price). Name = where it came from.
  write('06b_pricelist.csv', 'I_PriceList', ['Name', 'IsSOPriceList', 'ISO_Code', 'ValidFrom', 'ProductValue', 'PriceList', 'PriceStd', 'PriceLimit', 'odoo_id'],
    prods.map(function (p) { return { Name: 'Odoo list_price', IsSOPriceList: 'Y', ISO_Code: iso, ValidFrom: CUTOVER, ProductValue: pval(p),
      PriceList: p.list_price, PriceStd: p.list_price, PriceLimit: '', odoo_id: p.id }; }), 'product.product []');

  // 7 Warehouses + locators (window CSV import) and on-hand stock at cutover → I_Inventory.
  var whs = await slice('stock.warehouse', [], ['id', 'name', 'code', 'lot_stock_id']);
  var locs = await slice('stock.location', [['usage', '=', 'internal']], ['id', 'complete_name', 'warehouse_id', 'posx', 'posy', 'posz']);
  var whById = {}; whs.forEach(function (w) { whById[w.id] = w; });
  write('07_warehouses.csv', 'M_Warehouse', ['Value', 'Name', 'odoo_id'], whs.map(function (w) { return { Value: w.code, Name: w.name, odoo_id: w.id }; }), 'stock.warehouse []');
  write('07b_locators.csv', 'M_Locator', ['M_Warehouse_ID[Value]', 'Value', 'X', 'Y', 'Z', 'odoo_id'],
    locs.map(function (l) { return { 'M_Warehouse_ID[Value]': l.warehouse_id ? whById[m2o(l.warehouse_id)].code : '', Value: l.complete_name, X: l.posx, Y: l.posy, Z: l.posz, odoo_id: l.id }; }),
    'stock.location [["usage","=","internal"]]');
  var quants = await slice('stock.quant', [['location_id.usage', '=', 'internal']], ['id', 'product_id', 'location_id', 'quantity', 'lot_id']);
  var prodById = {}; prods.forEach(function (p) { prodById[p.id] = p; });
  var locById = {}; locs.forEach(function (l) { locById[l.id] = l; });
  write('08_onhand.csv', 'I_Inventory', ['WarehouseValue', 'LocatorValue', 'Value', 'Lot', 'QtyCount', 'CurrentCostPrice', 'MovementDate', 'odoo_id'],
    quants.map(function (q) { var l = locById[m2o(q.location_id)], p = prodById[m2o(q.product_id)];
      return { WarehouseValue: l && l.warehouse_id ? whById[m2o(l.warehouse_id)].code : '', LocatorValue: l ? l.complete_name : '',
        Value: p ? pval(p) : '', Lot: q.lot_id && q.lot_id[1], QtyCount: q.quantity, CurrentCostPrice: p ? p.standard_price : '', MovementDate: CUTOVER, odoo_id: q.id }; }),
    'stock.quant [["location_id.usage","=","internal"]]');

  // ── self-check: rows == live counts, keys unique, every reference found in an earlier file ──
  console.log('');
  var nPartnersTop = partners.filter(function (p) { return !p.parent_id; }).length, nContacts = partners.length - nPartnersTop;
  ok(bpRows.length + inRows.length === partners.length, 'every res.partner is one row (' + nPartnersTop + ' partners + ' + nContacts + ' contacts)', (bpRows.length + inRows.length) + '==' + partners.length);
  ok(pRows.filter(function (r) { return !r.BPartner_Value; }).length === prods.length, 'every product.product has its base row', prods.length);
  var catVals = new Set(cats.map(function (c) { return c.complete_name; }));
  var missCat = pRows.filter(function (r) { return !catVals.has(r.ProductCategory_Value); });
  ok(missCat.length === 0, 'every product category is in 03_product_categories.csv', missCat.length + ' missing' + (missCat.length ? ': ' + Array.from(new Set(missCat.map(function (r) { return r.Value; }))).slice(0, 8).join(', ') : ''));
  var bpVals = new Set(bpRows.concat(inRows).filter(function (r) { return r.odoo_row !== undefined && !/^contact/.test(r.odoo_row); }).map(function (r) { return r.Value; }));
  ok(bpVals.size === nPartnersTop, 'partner Values unique', bpVals.size + ' unique of ' + nPartnersTop);
  var pv = new Set(prods.map(pval)); ok(pv.size === prods.length, 'product Values unique', pv.size + ' of ' + prods.length);
  var missLoc = quants.filter(function (q) { return !locById[m2o(q.location_id)]; });
  ok(missLoc.length === 0, 'every on-hand row has its locator in 07b_locators.csv', missLoc.length + ' missing');
  Object.keys(counts).forEach(function (k) { console.log('§ODOO-EXPORT source ' + k + ' count=' + counts[k]); });

  var manifest = { tool: 'odoo_agent/export.js', odoo_version: version, db: DB, cutover: CUTOVER, currency: iso,
    company: company.map(function (c) { return c.name; }), files: files, source_counts: counts, notes: notes, self_check_fails: fails };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(OUT, 'provenance.json'), JSON.stringify(provenance));
  notes.forEach(function (n) { console.log('§ODOO-EXPORT note ' + n); });
  console.log('\n' + (fails ? '🔴 ODOO-EXPORT FAIL (' + fails + ')' : '🟢 ODOO-EXPORT PASS') + ' — ' + files.length + ' files + manifest.json + provenance.json written to ' + OUT);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§ODOO-EXPORT ERROR ' + e.message); process.exit(2); });
