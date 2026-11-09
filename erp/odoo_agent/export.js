#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §EXPORTER-V3-SPEC (+ §NINJA-DECISION, §SHEET-CONTRACT) — Witness: W-SHEET-CONTRACT
//
// export.js — the Odoo MASTER-DATA export the user runs on the machine that has Odoo. It writes ./odoo_export/:
//   odoo_migration.xlsx = ONE workbook in the Ninja MigrateExcelData shape: one sheet per iDempiere TABLE, in load order
//   (sheet name = 2-digit order + TableName), row 1 = AD column names, `Col>AltCol` = look the id up by another column.
//   Plus manifest.json (live Odoo count of every slice = the non-invent proof, the named patches, the held rows) and
//   provenance.json (every sheet row → its Odoo record). The browser ERP loads the workbook; it never connects to Odoo.
//   Nothing is invented: every cell is a field of a real Odoo row, or a PATCH — a value iDempiere requires that Odoo has
//   no field for — filled by the SAME rule the legacy Import process uses (cited per patch) and listed in manifest.patches.
//   No npm dependency — plain Node + the vendored SheetJS file (xlsx.mini.min.js) shipped in the same folder.
// Run:  node export.js [--host H --port P --db D --login L --cutover YYYY-MM-DD]   (see cli.js; the password is asked, never a flag)
'use strict';
var path = require('path'), fs = require('fs'), http = require('http'), https = require('https'), crypto = require('crypto');
var XLSX = require(fs.existsSync(path.join(__dirname, 'xlsx.mini.min.js')) ? './xlsx.mini.min.js' : '../xlsx.mini.min.js');   // zip: same folder; repo: erp/

var HOST, PORT, HTTPS, DB, LOGIN, PASSWORD, CUTOVER, CTX = {};   // set from cli.js (flags / env / demo defaults) when the run starts; CTX = Odoo context on every read (H4)
var FINAL = path.join(process.cwd(), process.env.EXPORT_DIR || 'odoo_export'), OUT = FINAL + '.partial';   // written here, renamed to FINAL only when the run succeeds

function rpc(service, method, args) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: service, method: method, args: args } });
    var req = (HTTPS ? https : http).request({ host: HOST, port: PORT, path: '/jsonrpc', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, function (res) {
      var d = ''; res.on('data', function (c) { d += c; }); res.on('end', function () {
        try { var j = JSON.parse(d); if (j.error) return reject(new Error(JSON.stringify(j.error.data && j.error.data.message || j.error))); resolve(j.result); }
        catch (e) { reject(e); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}
function cell(v) { return (v === null || v === undefined || v === false) ? '' : v; }
function m2o(v) { return Array.isArray(v) ? v[0] : null; }

// §HARDEN-SPEC H1: an address's identity = iDempiere's migration key C_Location_UU (2Pack resolves records by the UU column), as a UUID v5 of the Odoo record —
//   deterministic (same Odoo row, same id on every run) and traceable; the street may be blank or shared.
var UU_NS = 'b1d0f5e2-0d00-5c1a-9a51-6f646f6f6d69';   // the namespace of these ids (fixed; any constant works, it must never change)
function uuid5(name) {
  var ns = Buffer.from(UU_NS.replace(/-/g, ''), 'hex'), h = crypto.createHash('sha1').update(Buffer.concat([ns, Buffer.from(String(name), 'utf8')])).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80; var x = h.slice(0, 16).toString('hex');
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
}
// The ERP's text column lengths (AD_Column.FieldLength, read from the iDempiere 13 pilot dictionary 2026-11-09) for every text column this export writes.
//   Legacy PO.set_Value cuts a longer value (PO.java:1079-1082) — the export does the same so the ERP gets what legacy would keep, and a KEY that other sheets point at is
//   shortened ONCE, consistently, with the Odoo id kept (named patch), so the pointers still find it.
var LEN = { 'AD_User.EMail': 60, 'AD_User.Name': 60, 'AD_User.Phone': 40, 'AD_User.Phone2': 40, 'C_BPartner_Location.Name': 60, 'C_BPartner.Name': 120, 'C_BPartner.TaxID': 20,
  'C_BPartner.Value': 40, 'C_ElementValue.Name': 120, 'C_ElementValue.Value': 40, 'C_Location.Address1': 60, 'C_Location.Address2': 60, 'C_Location.City': 60, 'C_Location.Postal': 10,
  'C_Location.RegionName': 40, 'C_PaymentTerm.Name': 60, 'C_PaymentTerm.Value': 40, 'C_UOM.Name': 60, 'C_UOM.UOMSymbol': 10, 'M_Inventory.Description': 255, 'M_Inventory.DocumentNo': 30,
  'M_Locator.Value': 40, 'M_Locator.X': 60, 'M_Locator.Y': 60, 'M_Locator.Z': 60, 'M_PriceList.Name': 60, 'M_PriceList_Version.Name': 60, 'M_Product_Category.Name': 60,
  'M_Product_Category.Value': 40, 'M_Product.Description': 255, 'M_Product.Name': 255, 'M_Product.UPC': 30, 'M_Product.Value': 510, 'M_Product_PO.VendorProductNo': 40,
  'M_Warehouse.Name': 60, 'M_Warehouse.Value': 40 };
// §HARDEN-SPEC H6: every Odoo field this export reads, per model — checked with fields_get BEFORE anything is read, so an Odoo version with other field names stops with its name.
var NEEDS = { 'res.company': ['name', 'partner_id', 'currency_id', 'country_id'], 'res.currency': ['name', 'decimal_places'], 'uom.uom': ['name', 'category_id', 'uom_type', 'factor', 'rounding'],
  'account.payment.term': ['name', 'line_ids'], 'account.payment.term.line': ['payment_id', 'value', 'value_amount', 'nb_days'], 'product.category': ['name', 'complete_name', 'parent_id'],
  'account.account': ['code', 'name', 'account_type', 'group_id'], 'res.partner': ['name', 'ref', 'is_company', 'parent_id', 'commercial_partner_id', 'type', 'email', 'phone', 'mobile',
  'street', 'street2', 'city', 'state_id', 'zip', 'country_id', 'vat', 'customer_rank', 'supplier_rank', 'active'], 'res.users': ['partner_id'], 'res.country': ['code'],
  'res.country.state': ['name'], 'stock.warehouse': ['name', 'code', 'lot_stock_id', 'partner_id'], 'product.product': ['default_code', 'name', 'categ_id', 'uom_id', 'detailed_type',
  'barcode', 'weight', 'volume', 'description', 'list_price', 'standard_price', 'product_tmpl_id', 'active'], 'product.supplierinfo': ['partner_id', 'product_id', 'product_tmpl_id',
  'price', 'product_code', 'min_qty', 'delay'], 'stock.location': ['complete_name', 'warehouse_id', 'posx', 'posy', 'posz', 'usage', 'active'], 'stock.quant': ['product_id', 'location_id', 'quantity', 'lot_id'],
  // §E3C-SPEC (a): the open balances at the cut-over, shipped RAW in odoo_export.json (the mapping is the browser's: migrate/templates/odoo-17.json)
  'account.move.line': ['move_id', 'move_name', 'move_type', 'partner_id', 'account_id', 'date', 'invoice_date', 'date_maturity', 'balance', 'debit', 'credit', 'amount_residual',
    'amount_residual_currency', 'currency_id', 'company_currency_id', 'payment_id', 'ref', 'name', 'parent_state'],
  'account.move': ['name', 'move_type', 'partner_id', 'commercial_partner_id', 'invoice_date', 'date', 'invoice_date_due', 'invoice_payment_term_id', 'currency_id', 'amount_total',
    'amount_residual', 'ref', 'payment_state', 'state'] };

// Odoo account_type → iDempiere AccountType (A asset, L liability, O owner's equity, R revenue, E expense, M memo)
function acctType(t) {
  if (/^asset/.test(t)) return 'A'; if (/^liability/.test(t)) return 'L'; if (/^equity/.test(t)) return 'O';
  if (/^income/.test(t)) return 'R'; if (/^expense/.test(t)) return 'E'; if (t === 'off_balance') return 'M'; return '';
}
// Odoo detailed_type → iDempiere ProductType (I item, S service)
function prodType(t) { return t === 'service' ? 'S' : (t === 'consu' || t === 'product') ? 'I' : ''; }

(async function () {
  var cfg = await require('./cli').config();
  HOST = cfg.HOST; PORT = cfg.PORT; HTTPS = cfg.HTTPS; DB = cfg.DB; LOGIN = cfg.LOGIN; PASSWORD = cfg.PASSWORD; CUTOVER = cfg.CUTOVER;
  console.log('§ODOO-EXPORT target db=' + DB + ' host=' + (HTTPS ? 'https://' : '') + HOST + ':' + PORT + ' login=' + LOGIN + ' demo=' + (cfg.demo ? 'Y' : 'N') + ' password=' + cfg.passwordFrom + (cfg.COMPANY ? ' company=' + cfg.COMPANY : ''));
  var fails = 0, sheets = [], counts = {}, notes = [], patches = [], held = [], provenance = {};
  function ok(c, m, d) { if (!c) fails++; console.log('   ' + (c ? '✓' : '✗ FAIL:') + ' ' + m + (d ? ' — ' + d : '')); }
  console.log('\n══ ODOO-EXPORT v3 — master data from ' + DB + ' @ ' + HOST + ':' + PORT + ' → ' + OUT + '/odoo_migration.xlsx (cutover ' + CUTOVER + ') ══\n');
  var uid = await rpc('common', 'login', [DB, LOGIN, PASSWORD]);
  if (!uid) { console.log('§ODOO-EXPORT FAIL auth: Odoo did not accept login "' + LOGIN + '" on database "' + DB + '". Check the login, the password (an API key if your Odoo uses a 2-step code) and --db. Nothing was written.'); process.exit(1); }
  var ex = function (model, method, args, kw) { kw = Object.assign({}, kw || {}); kw.context = Object.assign({}, CTX, kw.context || {}); return rpc('object', 'execute_kw', [DB, uid, PASSWORD, model, method, args, kw]); };
  var version = (await rpc('common', 'version', [])).server_version;
  // H6: the fields this export reads exist in THIS Odoo (it is written against Odoo 17's names), checked before any data is read
  var missing = [];
  var TYPES = {};
  for (var model of Object.keys(NEEDS)) { var fg = await ex(model, 'fields_get', [], { attributes: ['type'] }); TYPES[model] = fg; NEEDS[model].forEach(function (f) { if (!fg[f]) missing.push(model + '.' + f); }); }
  if (missing.length) { console.log('§ODOO-EXPORT FAIL version: Odoo ' + version + ' has no ' + missing.join(', ') + ' — this export reads Odoo 17 field names; your version is not supported yet. Nothing was written.'); process.exit(1); }
  console.log('§ODOO-EXPORT version ' + version + ' fields=' + Object.keys(NEEDS).reduce(function (n, m) { return n + NEEDS[m].length; }, 0) + ' all present');
  // H4: one Odoo company = one ERP company. No --company = the login's own company (the one Odoo opens on); the others are named with the command that exports each.
  //   Odoo's allowed_company_ids context then shows exactly that company's data (without it Odoo shows ALL the user's companies — they would be merged into one).
  var allCo = await ex('res.company', 'search_read', [[]], { fields: ['id', 'name'], order: 'id' });
  var coId = cfg.COMPANY ? Number(cfg.COMPANY) : m2o((await ex('res.users', 'read', [[uid]], { fields: ['company_id'] }))[0].company_id);
  if (!allCo.some(function (c) { return c.id === coId; })) { console.log('§ODOO-EXPORT FAIL company: no company with id ' + cfg.COMPANY + ' — the companies are: ' + allCo.map(function (c) { return c.id + ' "' + c.name + '"'; }).join(', ') + '. Nothing was written.'); process.exit(1); }
  CTX.allowed_company_ids = [coId];
  var others = allCo.filter(function (c) { return c.id !== coId; });
  console.log('§ODOO-EXPORT company=' + coId + ' "' + allCo.filter(function (c) { return c.id === coId; })[0].name + '" chosen=' + (cfg.COMPANY ? 'flag' : 'login-default') + ' others=' + others.length);
  var otherCmd = others.map(function (c) { return 'node export.js ' + process.argv.slice(2).filter(function (a, i, all) { return a !== '--company' && all[i - 1] !== '--company'; }).concat(['--company', String(c.id)]).join(' ') + '   (' + c.name + ')'; });
  async function slice(model, domain, fields, order, context) {
    counts[model + ' ' + JSON.stringify(domain) + (context && context.active_test === false ? ' (archived too)' : '')] = await ex(model, 'search_count', [domain], { context: context });
    return ex(model, 'search_read', [domain], { fields: fields, order: order || 'id', context: context });
  }
  // H3 + lengths: the final key per Odoo record. Lowest Odoo id keeps its code; a repeat gets "<code>-<id>"; a key longer than the ERP column is cut and keeps "~<id>".
  var renamed = [];
  function keys(table, column, recs, rawOf) {
    var L = LEN[table + '.' + column] || 1e9, out = {}, seen = {};
    recs.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (r) {
      var raw = String(rawOf(r)), v = raw, why = '';
      if (v.length > L) { v = v.slice(0, L - String(r.id).length - 1) + '~' + r.id; why = 'longer than ' + L; }
      if (seen[v]) { v = (raw + '-' + r.id); why = 'repeats ' + JSON.stringify(raw); if (v.length > L) v = raw.slice(0, L - String(r.id).length - 1) + '-' + r.id; }
      seen[v] = 1; out[r.id] = v;
      if (why) renamed.push({ table: table, column: column, odoo_id: r.id, odoo: raw, erp: v, why: why });
    });
    return out;
  }
  // A sheet = { table, header (AD column names, `Col>Alt` lookups), rows (objects keyed by header), prov (Odoo record per row) }.
  function sheet(table, header, rows, source) {
    var name = String(sheets.length + 1).padStart(2, '0') + table;
    sheets.push({ name: name, table: table, header: header, rows: rows.map(function (r) { return header.map(function (h) { return cell(r[h]); }); }), source: source });
    provenance[name] = rows.map(function (r) { return r._odoo; });
    console.log('§ODOO-EXPORT sheet=' + name + ' rows=' + rows.length + ' cols=' + header.length);
  }
  // A patch = a column iDempiere requires that Odoo has no field for, filled by the legacy Import process's own rule.
  function patch(table, column, cellText, rule, rows) { patches.push({ table: table, column: column, cell: cellText, rule: rule, rows: rows }); }
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

  var company = (await ex('res.company', 'search_read', [CTX.allowed_company_ids ? [['id', 'in', CTX.allowed_company_ids]] : []], { fields: ['id', 'name', 'partner_id', 'currency_id', 'country_id'], order: 'id' }));
  var iso = company.length ? (await ex('res.currency', 'read', [[m2o(company[0].currency_id)]], { fields: ['name'] }))[0].name : '';
  var heldCo = await ex('res.company', 'search_read', [[]], { fields: ['partner_id'], context: { active_test: false } });   // every company's own partner is held (H4: the others too)

  // 01 C_UOM. X12DE355 (mandatory, 4 chars) has no Odoo source → left blank for the ERP form's UoM-mapping step.
  var uoms = await slice('uom.uom', [], ['id', 'name', 'category_id', 'uom_type', 'factor', 'rounding']);
  function prec(r) { if (!(r > 0)) return ''; var p = Math.round(-Math.log10(r)); return p >= 0 ? p : 0; }   // Odoo rounding 0.01 → 2 decimals
  sheet('C_UOM', ['Name', 'UOMSymbol', 'StdPrecision', 'X12DE355'],
    uoms.map(function (u) { return { Name: u.name, UOMSymbol: u.name.slice(0, 10), StdPrecision: prec(u.rounding), X12DE355: '',
      _odoo: { model: 'uom.uom', id: u.id, category: u.category_id && u.category_id[1], uom_type: u.uom_type, factor: u.factor } }; }), 'uom.uom []');
  patch('C_UOM', 'X12DE355', '(blank)', 'no Odoo field: the ERP "Migrate from Odoo" form maps each Odoo UoM to an iDempiere UoM (§B4-SPEC step 2)', uoms.length);

  // 02 C_PaymentTerm. Single-line terms carry NetDays; multi-installment terms are named (C_PaySchedule is not in this set).
  var terms = await slice('account.payment.term', [], ['id', 'name', 'line_ids']);
  var tlines = await ex('account.payment.term.line', 'search_read', [[]], { fields: ['payment_id', 'value', 'value_amount', 'nb_days'], order: 'id' });
  var multi = [];
  sheet('C_PaymentTerm', ['Value', 'Name', 'NetDays'], terms.map(function (t) {
    var ls = tlines.filter(function (l) { return m2o(l.payment_id) === t.id; });
    if (ls.length > 1) multi.push(t.name);
    return { Value: t.name.slice(0, 40), Name: t.name, NetDays: ls.length === 1 ? ls[0].nb_days : '',
      _odoo: { model: 'account.payment.term', id: t.id, lines: ls.map(function (l) { return [l.value, l.value_amount, l.nb_days]; }) } };
  }), 'account.payment.term []');
  if (multi.length) notes.push(multi.length + ' payment term(s) have several installments (' + multi.join('; ') + '): imported as the term only; the installments are in provenance.json for C_PaySchedule.');

  // 03 M_Product_Category, parent by Value (Odoo complete_name is unique; Name is not — two "Saleable"), parents first.
  var cats = await slice('product.category', [], ['id', 'name', 'complete_name', 'parent_id']);
  var catById = {}; cats.forEach(function (c) { catById[c.id] = c; });
  cats.sort(function (a, b) { return a.complete_name.split(' / ').length - b.complete_name.split(' / ').length || a.id - b.id; });
  var catKey = keys('M_Product_Category', 'Value', cats, function (c) { return c.complete_name; });
  sheet('M_Product_Category', ['Value', 'Name', 'M_Product_Category_Parent_ID>Value'], cats.map(function (c) { return { Value: catKey[c.id], Name: c.name,
    'M_Product_Category_Parent_ID>Value': c.parent_id ? catKey[m2o(c.parent_id)] : '', _odoo: { model: 'product.category', id: c.id } }; }), 'product.category []');

  // 04 C_ElementValue (chart of accounts). Parent only from account.group rows; the element = the tenant's account element.
  var accts = await slice('account.account', [], ['id', 'code', 'name', 'account_type', 'group_id']);
  var groups = await ex('account.group', 'search_count', [[]]);
  sheet('C_ElementValue', ['Value', 'Name', 'AccountType', 'AccountSign', 'IsSummary', 'C_Element_ID>ElementType'], accts.map(function (a) { return { Value: a.code, Name: a.name,
    AccountType: acctType(a.account_type), AccountSign: 'N', IsSummary: 'N', 'C_Element_ID>ElementType': 'A', _odoo: { model: 'account.account', id: a.id, account_type: a.account_type } }; }), 'account.account []');
  patch('C_ElementValue', 'C_Element_ID', 'C_Element_ID>ElementType = A', 'ImportAccount.java:130-143 — the account element of the tenant (legacy: the element the user names)', accts.length);
  if (!groups) notes.push('account.group has 0 rows: the chart of accounts imports flat (no summary parents in the source).');

  // 05-08 partners. Commercial partners (no parent) → C_BPartner; their address → C_Location + C_BPartner_Location;
  //   child partners → AD_User under the parent (+ their own address when Odoo type is not "contact", which copies the parent's).
  //   Own company + internal users' partners are HELD (manifest.held) — the user decides on the summary screen (§B1-SPEC).
  // H2: archived partners come along INACTIVE (Odoo active=False = iDempiere IsActive=N), so a contact of an archived company keeps its company
  var pf = ['id', 'name', 'ref', 'is_company', 'parent_id', 'commercial_partner_id', 'type', 'email', 'phone', 'mobile', 'street', 'street2', 'city',
    'state_id', 'zip', 'country_id', 'vat', 'customer_rank', 'supplier_rank', 'active'];
  var partners = await slice('res.partner', [], pf, 'id', { active_test: false });
  var users = await ex('res.users', 'search_read', [[]], { fields: ['partner_id'], context: { active_test: false } });
  var internal = {}; heldCo.forEach(function (c) { internal[m2o(c.partner_id)] = 'company'; }); users.forEach(function (u) { internal[m2o(u.partner_id)] = internal[m2o(u.partner_id)] || 'user'; });
  var countryIds = [], stateIds = [];
  partners.forEach(function (p) { if (p.country_id) countryIds.push(m2o(p.country_id)); if (p.state_id) stateIds.push(m2o(p.state_id)); });
  var cc = {}, st = {};
  if (countryIds.length) (await ex('res.country', 'read', [Array.from(new Set(countryIds))], { fields: ['code'] })).forEach(function (c) { cc[c.id] = c.code; });
  if (stateIds.length) (await ex('res.country.state', 'read', [Array.from(new Set(stateIds))], { fields: ['name'] })).forEach(function (s) { st[s.id] = s.name; });
  var byId = {}; partners.forEach(function (p) { byId[p.id] = p; });
  // a contact belongs to its COMMERCIAL partner (Odoo's commercial_partner_id: the top company, also for an address under a person under a company)
  function top(p) { return byId[m2o(p.commercial_partner_id)] || p; }
  function isHeld(p) { return internal[p.id] || internal[top(p).id]; }
  var bpKey = keys('C_BPartner', 'Value', partners.filter(function (p) { return !isHeld(p) && top(p).id === p.id; }), function (p) { return p.ref || String(p.id); });
  function val(p) { return bpKey[p.id]; }
  function hasAddr(p) { return !!(p.street || p.street2 || p.city || p.zip || p.country_id); }
  var coCountry = company.length && company[0].country_id ? (await ex('res.country', 'read', [[m2o(company[0].country_id)]], { fields: ['code'] }))[0].code : '';
  var locRows = [], bplRows = [], userRows = [], bpRows = [], noCountry = [];
  function addLoc(p, bpValue) {   // one C_Location per Odoo address, identified by C_Location_UU (H1)
    var country = p.country_id ? cc[m2o(p.country_id)] : coCountry;
    if (!p.country_id) noCountry.push(p.id);
    locRows.push({ Address1: p.street, Address2: p.street2, City: p.city, Postal: p.zip, RegionName: p.state_id ? st[m2o(p.state_id)] : '',
      'C_Country_ID>CountryCode': country, C_Location_UU: uuid5(DB + '/res.partner/' + p.id), _odoo: { model: 'res.partner', id: p.id, part: 'address' } });
    if (bpValue) bplRows.push({ 'C_BPartner_ID>Value': bpValue, 'C_Location_ID>C_Location_UU': uuid5(DB + '/res.partner/' + p.id), Name: p.type && p.type !== 'contact' ? p.name || p.type : '',
      _odoo: { model: 'res.partner', id: p.id, part: 'bp-location', type: p.type || 'contact' } });
  }
  partners.forEach(function (p) {
    if (isHeld(p)) { held.push({ model: 'res.partner', id: p.id, name: p.name, why: internal[p.id] ? 'internal-' + internal[p.id] : 'contact of internal-' + internal[top(p).id] }); return; }
    if (top(p).id === p.id) {
      bpRows.push({ Value: val(p), Name: p.name, TaxID: p.vat, IsCustomer: p.customer_rank > 0 ? 'Y' : 'N', IsVendor: p.supplier_rank > 0 ? 'Y' : 'N',
        'C_BP_Group_ID>IsDefault': 'Y', IsActive: p.active ? 'Y' : 'N', _odoo: { model: 'res.partner', id: p.id, part: 'partner', active: p.active } });
      if (hasAddr(p)) addLoc(p, val(p));
    } else {
      var par = top(p);
      userRows.push({ Name: p.name, EMail: p.email, Phone: p.phone, Phone2: p.mobile, 'C_BPartner_ID>Value': val(par), IsActive: p.active ? 'Y' : 'N',
        _odoo: { model: 'res.partner', id: p.id, part: 'contact', type: p.type, parent: m2o(p.parent_id), active: p.active } });
      if (p.type && p.type !== 'contact' && hasAddr(p)) addLoc(p, val(par));
    }
  });
  sheet('C_BPartner', ['Value', 'Name', 'TaxID', 'IsCustomer', 'IsVendor', 'C_BP_Group_ID>IsDefault', 'IsActive'], bpRows, 'res.partner [] (archived too)');
  var archivedBP = bpRows.filter(function (r) { return r.IsActive === 'N'; }).length + userRows.filter(function (r) { return r.IsActive === 'N'; }).length;
  if (archivedBP) notes.push(archivedBP + ' partner(s)/contact(s) are archived in Odoo: they come in INACTIVE (kept for history; nobody can pick them on new documents).');
  patch('C_BPartner', 'C_BP_Group_ID', 'C_BP_Group_ID>IsDefault = Y', "ImportBPartner.java:129-132 — the client's default business partner group", bpRows.length);

  // warehouses' addresses (stock.warehouse.partner_id) are C_Location rows too: M_Warehouse.C_Location_ID is required (§SHEET-CONTRACT)
  var whs = await slice('stock.warehouse', [], ['id', 'name', 'code', 'lot_stock_id', 'partner_id']);
  var whAddr = {};
  whs.forEach(function (w) {
    var p = w.partner_id && (byId[m2o(w.partner_id)]);
    if (p && hasAddr(p)) { whAddr[w.id] = uuid5(DB + '/res.partner/' + p.id); if (!locRows.some(function (l) { return l._odoo.id === p.id; })) addLoc(p, null); }
  });
  sheet('C_Location', ['Address1', 'Address2', 'City', 'Postal', 'RegionName', 'C_Country_ID>CountryCode', 'C_Location_UU'], locRows, 'res.partner [] (addresses)');
  patch('C_Location', 'C_Location_UU', 'UUID v5 of "<db>/res.partner/<id>"', "iDempiere's record key for moving data between systems (2Pack resolves by the _UU column): the address is found by it, not by its street", locRows.length);
  if (noCountry.length) patch('C_Location', 'C_Country_ID', "your Odoo company's country (" + coCountry + ')', 'C_Location.C_Country_ID is mandatory; Odoo left the country empty on res.partner ' + noCountry.join(', ') + ' — check them after the move', noCountry.length);
  sheet('C_BPartner_Location', ['C_BPartner_ID>Value', 'C_Location_ID>C_Location_UU', 'Name'], bplRows, 'res.partner [] (addresses)');
  sheet('AD_User', ['Name', 'EMail', 'Phone', 'Phone2', 'C_BPartner_ID>Value', 'IsActive'], userRows, 'res.partner [] (contacts)');

  // 09 M_Product, 10 M_Product_PO (one row per product.supplierinfo)
  var prods = await slice('product.product', [], ['id', 'default_code', 'name', 'categ_id', 'uom_id', 'detailed_type', 'barcode', 'weight', 'volume', 'description', 'list_price', 'standard_price', 'active'], 'id', { active_test: false });
  var sellers = await slice('product.supplierinfo', [], ['id', 'partner_id', 'product_id', 'product_tmpl_id', 'price', 'product_code', 'min_qty', 'delay']);
  var tmplOf = {}; (await ex('product.product', 'read', [prods.map(function (p) { return p.id; })], { fields: ['product_tmpl_id'], context: { active_test: false } })).forEach(function (p) { tmplOf[p.id] = m2o(p.product_tmpl_id); });
  var prodKey = keys('M_Product', 'Value', prods, function (p) { return p.default_code || String(p.id); });
  function pval(p) { return prodKey[p.id]; }
  sheet('M_Product', ['Value', 'Name', 'Description', 'M_Product_Category_ID>Value', 'C_UOM_ID', 'ProductType', 'UPC', 'Weight', 'Volume', 'C_TaxCategory_ID>IsDefault', 'IsActive'],
    prods.map(function (p) { return { Value: pval(p), Name: p.name, Description: p.description, 'M_Product_Category_ID>Value': catKey[m2o(p.categ_id)] || '',
      C_UOM_ID: p.uom_id && p.uom_id[1], ProductType: prodType(p.detailed_type), UPC: p.barcode, Weight: p.weight, Volume: p.volume, 'C_TaxCategory_ID>IsDefault': 'Y',
      IsActive: p.active ? 'Y' : 'N', _odoo: { model: 'product.product', id: p.id, active: p.active } }; }), 'product.product [] (archived too)');
  var archivedPr = prods.filter(function (p) { return !p.active; }).length;
  if (archivedPr) notes.push(archivedPr + ' product(s) are archived in Odoo: they come in INACTIVE (their stock and vendor prices keep a product to point at).');
  patch('M_Product', 'C_TaxCategory_ID', 'C_TaxCategory_ID>IsDefault = Y', "ImportProduct.java:415 — the client's default tax category", prods.length);
  // ONE row per (product, vendor): legacy has one M_Product_PO per vendor (unique index m_product_po_vendorprodno on C_BPartner_ID+VendorProductNo, found by W-NINJA-MIGRATE);
  //   Odoo's quantity price breaks for the same vendor fold into the row of the lowest minimum quantity, the others stay in provenance (ids) and are named in the notes.
  var poRows = [], vpnPatched = 0, breaks = [];
  prods.forEach(function (p) {
    var byVendor = {};
    sellers.filter(function (s) { return (s.product_id && m2o(s.product_id) === p.id) || (!s.product_id && m2o(s.product_tmpl_id) === tmplOf[p.id]); }).forEach(function (s) {
      var bp = byId[m2o(s.partner_id)], k = bp ? (val(top(bp)) || '') : '';
      (byVendor[k] = byVendor[k] || []).push(s);
    });
    Object.keys(byVendor).sort().forEach(function (k) {
      var ss = byVendor[k].slice().sort(function (a, b) { return (a.min_qty - b.min_qty) || (a.id - b.id); }), s = ss[0];
      if (ss.length > 1) breaks.push(pval(p) + '/' + k + ' ×' + ss.length);
      if (!s.product_code) vpnPatched++;
      poRows.push({ 'M_Product_ID>Value': pval(p), 'C_BPartner_ID>Value': k, PricePO: s.price, VendorProductNo: s.product_code || pval(p),
        Order_Min: s.min_qty, DeliveryTime_Promised: s.delay, _odoo: { model: 'product.supplierinfo', id: s.id, ids: ss.map(function (x) { return x.id; }), product: p.id } });
    });
  });
  if (breaks.length) notes.push(breaks.length + ' product/vendor pair(s) have Odoo quantity price breaks (' + breaks.join(', ') + '): the lowest-quantity price is the vendor price; the breaks are in provenance.json (M_ProductPriceVendorBreak is not in this set).');
  sheet('M_Product_PO', ['M_Product_ID>Value', 'C_BPartner_ID>Value', 'PricePO', 'VendorProductNo', 'Order_Min', 'DeliveryTime_Promised'], poRows, 'product.supplierinfo []');
  if (vpnPatched) patch('M_Product_PO', 'VendorProductNo', "the product's Value", 'ImportProduct.java:393-394 — VendorProductNo=Value when the vendor gave none', vpnPatched);

  // 11-13 the sale price list (Odoo product.list_price) at the cutover date
  var PLNAME = 'Odoo list_price';
  sheet('M_PriceList', ['Name', 'IsSOPriceList', 'C_Currency_ID>ISO_Code'], [{ Name: PLNAME, IsSOPriceList: 'Y', 'C_Currency_ID>ISO_Code': iso, _odoo: { model: 'product.product', field: 'list_price' } }], 'product.product [] (list_price)');
  patch('M_PriceList', 'Name', PLNAME, 'Odoo keeps the sale price on the product (list_price), not in a named list: one list named after that field', 1);
  sheet('M_PriceList_Version', ['M_PriceList_ID', 'Name', 'ValidFrom', 'M_DiscountSchema_ID>DiscountType'],
    [{ M_PriceList_ID: PLNAME, Name: CUTOVER, ValidFrom: CUTOVER, 'M_DiscountSchema_ID>DiscountType': 'P', _odoo: { cutover: CUTOVER } }], 'cutover');
  patch('M_PriceList_Version', 'Name', CUTOVER, 'the cutover date — what the AD default @#Date@ gives a new version in the window', 1);
  patch('M_PriceList_Version', 'M_DiscountSchema_ID', 'M_DiscountSchema_ID>DiscountType = P', 'ImportPriceList.java:97-98 — the first price-list schema of the client', 1);
  sheet('M_ProductPrice', ['M_PriceList_Version_ID', 'M_Product_ID>Value', 'PriceList', 'PriceStd'],
    prods.map(function (p) { return { M_PriceList_Version_ID: CUTOVER, 'M_Product_ID>Value': pval(p), PriceList: p.list_price, PriceStd: p.list_price, _odoo: { model: 'product.product', id: p.id, field: 'list_price' } }; }), 'product.product []');

  // 14-15 warehouses + locators
  var locs = await slice('stock.location', [['usage', '=', 'internal']], ['id', 'complete_name', 'warehouse_id', 'posx', 'posy', 'posz', 'active'], 'id', { active_test: false });
  var locKey = keys('M_Locator', 'Value', locs, function (l) { return l.complete_name; });
  var whById = {}; whs.forEach(function (w) { whById[w.id] = w; });
  sheet('M_Warehouse', ['Value', 'Name', 'C_Location_ID>C_Location_UU'], whs.map(function (w) { return { Value: w.code, Name: w.name, 'C_Location_ID>C_Location_UU': whAddr[w.id] || '',
    _odoo: { model: 'stock.warehouse', id: w.id, partner: m2o(w.partner_id) } }; }), 'stock.warehouse []');
  // X/Y/Z (aisle/bin/level) are unique per warehouse in legacy (index m_location_where, found by W-NINJA-MIGRATE); Odoo's posx/posy/posz are usually all 0. Where a warehouse
  //   repeats a triple, Z takes the Odoo location id (traceable, unique) — a named patch.
  var xyzSeen = {}, zPatched = 0;
  sheet('M_Locator', ['M_Warehouse_ID>Value', 'Value', 'X', 'Y', 'Z', 'IsActive'], locs.map(function (l) {
    var w = l.warehouse_id && whById[m2o(l.warehouse_id)] ? whById[m2o(l.warehouse_id)].code : '', key = w + '|' + l.posx + '|' + l.posy + '|' + l.posz, z = String(l.posz);
    if (xyzSeen[key]) { z = String(l.id); zPatched++; } xyzSeen[key] = 1;
    return { 'M_Warehouse_ID>Value': w, Value: locKey[l.id], X: String(l.posx), Y: String(l.posy), Z: z, IsActive: l.active ? 'Y' : 'N', _odoo: { model: 'stock.location', id: l.id, posz: l.posz, active: l.active } }; }), 'stock.location [["usage","=","internal"]] (archived too)');
  if (zPatched) patch('M_Locator', 'Z', 'the Odoo stock.location id', 'legacy unique index m_location_where (M_Warehouse_ID, X, Y, Z); Odoo repeats posx/posy/posz within the warehouse', zPatched);

  // 16-17 opening stock at cutover: one physical inventory per warehouse, one line per stock.quant
  var quants = await slice('stock.quant', [['location_id.usage', '=', 'internal']], ['id', 'product_id', 'location_id', 'quantity', 'lot_id']);
  var prodById = {}; prods.forEach(function (p) { prodById[p.id] = p; });
  var locById = {}; locs.forEach(function (l) { locById[l.id] = l; });
  function whOfQuant(q) { var l = locById[m2o(q.location_id)]; return l && l.warehouse_id ? whById[m2o(l.warehouse_id)] : null; }
  var invWh = whs.filter(function (w) { return quants.some(function (q) { var x = whOfQuant(q); return x && x.id === w.id; }); });
  function docNo(w) { return 'OPEN-' + w.code + '-' + CUTOVER; }
  sheet('M_Inventory', ['DocumentNo', 'M_Warehouse_ID>Value', 'MovementDate', 'C_DocType_ID>DocSubTypeInv', 'Description'],
    invWh.map(function (w) { return { DocumentNo: docNo(w), 'M_Warehouse_ID>Value': w.code, MovementDate: CUTOVER, 'C_DocType_ID>DocSubTypeInv': 'PI',
      Description: 'Opening stock from Odoo ' + DB + ' at ' + CUTOVER, _odoo: { model: 'stock.warehouse', id: w.id } }; }), 'stock.warehouse [] (with stock)');
  patch('M_Inventory', 'C_DocType_ID', 'C_DocType_ID>DocSubTypeInv = PI', 'MInventory.java:301-304 refuses none; MSetup.java:776 makes ONE Physical Inventory type (DocBaseType MMI, DocSubTypeInv PI) — MMI alone also matches Internal Use and Cost Adjustment', invWh.length);
  patch('M_Inventory', 'DocumentNo', 'OPEN-<warehouse>-<cutover>', 'the lines find their header by DocumentNo (Ninja MigrateExcelData Line rule); legacy would number it from the sequence', invWh.length);
  // ONE line per (locator, product): legacy's unique index m_inventoryline_productlocattr (M_Inventory_ID, M_Locator_ID, M_Product_ID, M_AttributeSetInstance_ID), found by
  //   W-NINJA-MIGRATE. Odoo splits a product's stock by lot; without the lot → attribute-set-instance step the lot quants are SUMMED (every quant id + lot kept in provenance).
  var qLines = [], qByKey = {};
  quants.forEach(function (q) { var l = locById[m2o(q.location_id)], p = prodById[m2o(q.product_id)], w = whOfQuant(q), key = m2o(q.location_id) + '|' + m2o(q.product_id);
    var e = qByKey[key];
    if (!e) { e = qByKey[key] = { M_Inventory_ID: w ? docNo(w) : '', 'M_Locator_ID>Value': l ? locKey[l.id] : '', 'M_Product_ID>Value': p ? pval(p) : '', QtyCount: 0,
      _odoo: { model: 'stock.quant', ids: [], lots: [], cost: p ? p.standard_price : null } }; qLines.push(e); }
    e.QtyCount = Math.round((e.QtyCount + q.quantity) * 1e6) / 1e6; e._odoo.ids.push(q.id); if (q.lot_id) e._odoo.lots.push(q.lot_id[1]); });
  sheet('M_InventoryLine', ['M_Inventory_ID', 'M_Locator_ID>Value', 'M_Product_ID>Value', 'QtyCount'], qLines, 'stock.quant [["location_id.usage","=","internal"]]');
  var summed = qLines.filter(function (e) { return e._odoo.ids.length > 1; });
  if (summed.length) notes.push(summed.length + ' stock line(s) sum several Odoo quants of one product in one location (lots: ' + summed.map(function (e) { return e['M_Product_ID>Value'] + ' ×' + e._odoo.ids.length; }).join(', ') + ').');
  var lots = quants.filter(function (q) { return q.lot_id; }).length, neg = quants.filter(function (q) { return q.quantity < 0; });
  if (lots) notes.push(lots + ' stock line(s) carry an Odoo lot (in provenance.json): the lot → attribute set instance step is not in this set yet.');
  if (neg.length) notes.push(neg.length + ' stock line(s) are NEGATIVE in Odoo (' + neg.map(function (q) { return prodById[m2o(q.product_id)] ? pval(prodById[m2o(q.product_id)]) : q.id; }).join(', ') + '): exported as Odoo has them; the summary screen shows them.');

  // ── §E3C-SPEC (a): the open balances at the cut-over, RAW (door duties only: read, count, name the fields — no mapping here). ──
  //   odoo_export.json = { manifest: { format, sets: { <set>: { count, fields_read, fields_missing, domain } } }, sets: { <set>: rows } } — the shape the migration engine's
  //   export-json connector reads (migrate/connectors/export_json.mjs). A many2one arrives from Odoo as [id, "display name"]: written as <field> = id and <field>__name = the name;
  //   Odoo's `false` for an empty non-boolean field is written as null. Nothing else is changed.
  var RAW = {}, RAWMAN = {};
  function flat(model, rows) {
    return rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (k === '__domain') return; var v = r[k], t = TYPES[model] && TYPES[model][k] && TYPES[model][k].type;
      if (Array.isArray(v) && (t === 'many2one' || k === 'account_id' && v.length === 2)) { o[k] = v[0]; o[k + '__name'] = v[1]; }
      else if (v === false && t !== 'boolean') o[k] = null; else o[k] = v; }); return o; });
  }
  function rawSet(name, model, fields, domain, rows, count) { RAW[name] = rows;
    var read = fields.slice(); fields.forEach(function (f) { var t = TYPES[model] && TYPES[model][f] && TYPES[model][f].type; if (t === 'many2one' && name !== 'partner_keys') read.push(f + '__name'); });   // the name half of a many2one
    RAWMAN[name] = { model: model, count: count, fields_read: read, fields_missing: [], domain: JSON.stringify(domain) };
    console.log('§ODOO-EXPORT raw set=' + name + ' model=' + model + ' rows=' + rows.length + ' count=' + count); }
  var curRow = company.length ? (await ex('res.currency', 'read', [[m2o(company[0].currency_id)]], { fields: ['name', 'decimal_places'] }))[0] : null;
  rawSet('account.account', 'account.account', ['id', 'code', 'name', 'account_type', 'reconcile'], [],
    flat('account.account', await ex('account.account', 'search_read', [[]], { fields: ['id', 'code', 'name', 'account_type', 'reconcile'], order: 'id' })), await ex('account.account', 'search_count', [[]]));
  var tbDom = [['parent_state', '=', 'posted'], ['date', '<=', CUTOVER]];
  var tbRows = flat('account.move.line', await ex('account.move.line', 'read_group', [tbDom, ['balance:sum', 'debit:sum', 'credit:sum'], ['account_id']], { lazy: false, orderby: 'account_id' }));
  var tbCount = await ex('account.move.line', 'search_count', [tbDom]);
  rawSet('tb', 'account.move.line', ['account_id', 'balance', 'debit', 'credit', '__count'], tbDom, tbRows, tbCount);
  var olF = ['id', 'move_id', 'move_name', 'move_type', 'partner_id', 'account_id', 'date', 'invoice_date', 'date_maturity', 'balance', 'amount_residual', 'amount_residual_currency',
    'currency_id', 'company_currency_id', 'payment_id', 'ref', 'name'];
  var olDom = [['parent_state', '=', 'posted'], ['account_id.account_type', 'in', ['asset_receivable', 'liability_payable']], ['amount_residual', '!=', 0], ['date', '<=', CUTOVER]];
  var openLines = flat('account.move.line', await ex('account.move.line', 'search_read', [olDom], { fields: olF, order: 'id' }));
  rawSet('open_lines', 'account.move.line', olF, olDom, openLines, await ex('account.move.line', 'search_count', [olDom]));
  var omF = ['id', 'name', 'move_type', 'partner_id', 'commercial_partner_id', 'invoice_date', 'date', 'invoice_date_due', 'invoice_payment_term_id', 'currency_id', 'amount_total',
    'amount_residual', 'ref', 'payment_state'];
  var omIds = Array.from(new Set(openLines.map(function (l) { return l.move_id; }))).sort(function (a, b) { return a - b; });
  rawSet('open_moves', 'account.move', omF, [['id', 'in', '(the moves of open_lines)']], omIds.length ? flat('account.move', await ex('account.move', 'read', [omIds], { fields: omF })) : [], omIds.length);
  // BRIDGE (deleted when the masters run on the engine): the business partner Value this export's workbook gave each partner's commercial partner, and who is held
  rawSet('partner_keys', 'res.partner', ['id', 'commercial', 'value', 'held'], [], partners.map(function (p) { return { id: p.id, commercial: top(p).id, value: val(top(p)) || '', held: isHeld(p) ? String(isHeld(p)) : '' }; }), partners.length);
  var tbSum = tbRows.reduce(function (n, r) { return n + r.balance; }, 0), tbLines = tbRows.reduce(function (n, r) { return n + r.__count; }, 0);
  console.log('§ODOO-EXPORT tb accounts=' + tbRows.length + ' lines=' + tbLines + ' count=' + tbCount + ' sum=' + tbSum.toFixed(curRow ? curRow.decimal_places : 2) + ' open_lines=' + openLines.length + ' open_moves=' + omIds.length);
  ok(tbLines === tbCount, 'every posted account.move.line up to the cut-over is in exactly one trial-balance row', tbLines + '==' + tbCount);
  if (Math.abs(tbSum) >= 0.005) notes.push('The trial balance at ' + CUTOVER + ' does not sum to zero (' + tbSum.toFixed(2) + '): the opening journal will be refused as unbalanced until that is explained.');

  // ── lengths + renamed keys (H3): text longer than the ERP column is cut as legacy PO.set_Value cuts it (PO.java:1079-1082); keys were already shortened consistently ──
  sheets.forEach(function (s) {
    s.header.forEach(function (h, hi) {
      var L = LEN[s.table + '.' + h]; if (!L) return; var cut = [];
      s.rows.forEach(function (r, ri) { if (typeof r[hi] === 'string' && r[hi].length > L) { cut.push(provenance[s.name][ri] && provenance[s.name][ri].id); r[hi] = r[hi].slice(0, L); } });
      if (cut.length) patch(s.table, h, 'cut to ' + L + ' characters', 'legacy PO.set_Value cuts a value longer than the column (PO.java:1079-1082); Odoo ids ' + cut.join(', '), cut.length);
    });
  });
  var byCol = {}; renamed.forEach(function (r) { (byCol[r.table + '.' + r.column] = byCol[r.table + '.' + r.column] || []).push(r); });
  Object.keys(byCol).forEach(function (k) { var rs = byCol[k], t = k.split('.');
    patch(t[0], t[1], '<code>-<odoo id> or <cut>~<odoo id>', 'the ERP needs one ' + t[1] + ' per company (unique index) and at most ' + (LEN[k] || '-') + ' characters; Odoo has ' +
      rs.map(function (r) { return JSON.stringify(r.odoo) + ' → ' + JSON.stringify(r.erp) + ' (' + r.why + ')'; }).join('; '), rs.length);
    console.log('§ODOO-EXPORT renamed ' + k + ' n=' + rs.length + ' ' + rs.map(function (r) { return r.odoo_id + ':' + r.erp; }).join(' ')); });

  // ── self-check: every source row is in exactly one place, every lookup finds exactly one row of an earlier sheet ──
  console.log('');
  var placed = bpRows.length + userRows.length + held.length;
  ok(placed === partners.length, 'every res.partner is a partner, a contact or held', placed + '==' + partners.length + ' (' + bpRows.length + ' partners, ' + userRows.length + ' contacts, ' + held.length + ' held)');
  ok(sheets.filter(function (s) { return s.table === 'M_Product'; })[0].rows.length === prods.length, 'every product.product is one M_Product row', prods.length);
  var qIn = qLines.reduce(function (n, e) { return n + e._odoo.ids.length; }, 0);
  ok(qIn === quants.length, 'every stock.quant is in exactly one M_InventoryLine row', qIn + '==' + quants.length + ' in ' + qLines.length + ' lines');
  var keyOf = { C_UOM: 'Name', C_PaymentTerm: 'Value', M_Product_Category: 'Value', C_BPartner: 'Value', C_Location: 'Address1', M_Product: 'Value',
    M_PriceList: 'Name', M_PriceList_Version: 'Name', M_Warehouse: 'Value', M_Locator: 'Value', M_Inventory: 'DocumentNo' };
  var bad = [];
  sheets.forEach(function (s, si) {
    s.header.forEach(function (h, hi) {
      var tgt = h.replace(/>.*$/, ''); if (!/_ID$/.test(tgt)) return;
      var t = tgt.replace(/_ID$/, '').replace(/_Parent$/, ''), alt = h.indexOf('>') > 0 ? h.split('>')[1] : (keyOf[t] || 'Name');
      var src = sheets.slice(0, si + 1).filter(function (x) { return x.table === t; })[0];
      if (!src) return;   // a tenant lookup (group, tax category, element, doc type, country, currency, schema): patch / reference data
      var ki = src.header.indexOf(alt);
      if (ki < 0) { bad.push(s.name + '.' + h + ': ' + t + ' has no column ' + alt + ' in its sheet'); return; }
      var vals = {}; src.rows.forEach(function (r) { var v = r[ki]; if (v !== '') vals[v] = (vals[v] || 0) + 1; });
      s.rows.forEach(function (r, ri) { var v = r[hi]; if (v === '' && /Parent/.test(h)) return;
        if (v === '' || vals[v] !== 1) bad.push(s.name + ' row ' + (ri + 2) + ' ' + h + '="' + v + '" matches ' + (vals[v] || 0) + ' row(s) of ' + src.name); });
    });
  });
  ok(bad.length === 0, 'every in-workbook lookup finds exactly one row of an earlier sheet', bad.length + ' bad' + (bad.length ? ': ' + bad.slice(0, 6).join(' | ') : ''));
  Object.keys(counts).forEach(function (k) { console.log('§ODOO-EXPORT source ' + k + ' count=' + counts[k]); });
  patches.forEach(function (p) { console.log('§ODOO-EXPORT patch ' + p.table + '.' + p.column + ' rows=' + p.rows + ' cell="' + p.cell + '" rule=' + p.rule); });

  if (others.length) notes.push('This Odoo has ' + allCo.length + ' companies; this export is ONLY ' + JSON.stringify(company[0].name) + '. Each company moves into its own ERP company — export the others with: ' + otherCmd.join(' | '));
  var wb = XLSX.utils.book_new();
  wb.Props = { Title: 'Odoo migration ' + DB + ' ' + CUTOVER, Author: 'odoo_agent/export.js', CreatedDate: new Date(CUTOVER + 'T00:00:00Z') };   // fixed date → repeatable file
  sheets.forEach(function (s) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([s.header].concat(s.rows)), s.name); });
  fs.writeFileSync(path.join(OUT, 'odoo_migration.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
  var manifest = { tool: 'odoo_agent/export.js', format: 'ninja-workbook-v3', workbook: 'odoo_migration.xlsx', odoo_version: version, db: DB, cutover: CUTOVER, currency: iso,
    company: company.map(function (c) { return c.name; }), company_id: coId, other_companies: others.map(function (c) { return { id: c.id, name: c.name }; }), sheets: sheets.map(function (s) { return { sheet: s.name, table: s.table, rows: s.rows.length, header: s.header, source: s.source }; }),
    source_counts: counts, patches: patches, renamed: renamed, held: held, notes: notes, self_check_fails: fails };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(OUT, 'provenance.json'), JSON.stringify(provenance));
  fs.writeFileSync(path.join(OUT, 'odoo_export.json'), JSON.stringify({ manifest: { tool: 'odoo_agent/export.js', format: 'odoo-export-json-v1', odoo_version: version, db: DB, cutover: CUTOVER,
    currency: iso, currency_places: curRow ? curRow.decimal_places : null, company_id: coId, sets: RAWMAN }, sets: RAW }, null, 1));
  notes.forEach(function (n) { console.log('§ODOO-EXPORT note ' + n); });
  if (!fails) { fs.rmSync(FINAL, { recursive: true, force: true }); fs.renameSync(OUT, FINAL); }
  console.log('\n' + (fails ? '🔴 ODOO-EXPORT FAIL (' + fails + ') — nothing published; the incomplete files are in ' + OUT : '🟢 ODOO-EXPORT PASS — odoo_migration.xlsx (' + sheets.length + ' sheets) + manifest.json + provenance.json + odoo_export.json (open balances) written to ' + FINAL));
  process.exit(fails ? 1 : 0);
})().catch(function (e) {
  try { fs.rmSync(OUT, { recursive: true, force: true }); } catch (x) {}   // a half export must never look like a whole one
  var m = /not allowed to access '([^']+)' \(([a-z0-9_.]+)\)/.exec(e.message || '');
  if (m) {
    console.log('§ODOO-EXPORT FAIL access: the Odoo user cannot read ' + m[1] + ' (' + m[2] + '). Run it with an Odoo login that can read your accounting and stock (an administrator, or a user in the groups Odoo names below). Nothing was written.');
    console.log('   Odoo says: ' + e.message.replace(/\\n|\n/g, ' ').replace(/\\t|\t/g, ''));
    process.exit(1);
  }
  console.log('§ODOO-EXPORT ERROR ' + e.message + ' — nothing was written.'); process.exit(2);
});
