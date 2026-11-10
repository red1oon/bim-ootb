#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ODOO-ENGINE-SPEC O3c (the agent cut) — Witness: ODOO-REF / ODOO-GUIDE in erp/tests/witness_migrate_engine.js
//
// export.js — the Odoo READ the user runs on the machine that has Odoo. It writes ONE file, ./odoo_export/odoo_export.json:
//   { manifest: { format, odoo_version, db, cutover, currency, company, ..., sets: { <set>: { count, fields_read, ... } } }, sets: { <set>: rows } }
//   = the RAW rows Odoo returned (a many2one as <field> = id and <field>__name = its name; Odoo's `false` for an empty non-boolean field as null), plus the live Odoo
//   count of every set (the non-invent proof). Nothing is mapped here: the mapping to the ERP's tables is DATA in the browser (erp/migrate/templates/odoo-17.json, run by
//   erp/migrate/engine.mjs) — the user picks this one file in "Migrate from Odoo". The browser ERP never connects to Odoo.
//   No npm dependency — plain Node.
// Run:  node export.js [--host H --port P --db D --login L --cutover YYYY-MM-DD]   (see cli.js; the password is asked, never a flag)
'use strict';
var path = require('path'), fs = require('fs'), http = require('http'), https = require('https');

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
function m2o(v) { return Array.isArray(v) ? v[0] : null; }

// §HARDEN-SPEC H6: every Odoo field this export reads, per model — checked with fields_get BEFORE anything is read, so an Odoo version with other field names stops with its name.
var NEEDS = { 'res.company': ['name', 'partner_id', 'currency_id', 'country_id'], 'res.currency': ['name', 'decimal_places'], 'uom.uom': ['name', 'category_id', 'uom_type', 'factor', 'rounding'],
  'account.payment.term': ['name', 'line_ids'], 'account.payment.term.line': ['payment_id', 'value', 'value_amount', 'nb_days'], 'product.category': ['name', 'complete_name', 'parent_id'],
  'account.account': ['code', 'name', 'account_type', 'group_id', 'reconcile'], 'res.partner': ['name', 'ref', 'is_company', 'parent_id', 'commercial_partner_id', 'type', 'email', 'phone', 'mobile',
  'street', 'street2', 'city', 'state_id', 'zip', 'country_id', 'vat', 'customer_rank', 'supplier_rank', 'active'], 'res.users': ['partner_id'], 'res.country': ['code'],
  'res.country.state': ['name'], 'stock.warehouse': ['name', 'code', 'lot_stock_id', 'partner_id'], 'product.product': ['default_code', 'name', 'categ_id', 'uom_id', 'detailed_type',
  'barcode', 'weight', 'volume', 'description', 'list_price', 'standard_price', 'product_tmpl_id', 'active'], 'product.supplierinfo': ['partner_id', 'product_id', 'product_tmpl_id',
  'price', 'product_code', 'min_qty', 'delay'], 'stock.location': ['complete_name', 'warehouse_id', 'posx', 'posy', 'posz', 'usage', 'active'], 'stock.quant': ['product_id', 'location_id', 'quantity', 'lot_id'],
  'account.move.line': ['move_id', 'move_name', 'move_type', 'partner_id', 'account_id', 'date', 'invoice_date', 'date_maturity', 'balance', 'debit', 'credit', 'amount_residual',
    'amount_residual_currency', 'currency_id', 'company_currency_id', 'payment_id', 'ref', 'name', 'parent_state'],
  'account.move': ['name', 'move_type', 'partner_id', 'commercial_partner_id', 'invoice_date', 'date', 'invoice_date_due', 'invoice_payment_term_id', 'currency_id', 'amount_total',
    'amount_residual', 'ref', 'payment_state'] };

(async function () {
  var cfg = await require('./cli').config();
  HOST = cfg.HOST; PORT = cfg.PORT; HTTPS = cfg.HTTPS; DB = cfg.DB; LOGIN = cfg.LOGIN; PASSWORD = cfg.PASSWORD; CUTOVER = cfg.CUTOVER;
  console.log('§ODOO-EXPORT target db=' + DB + ' host=' + (HTTPS ? 'https://' : '') + HOST + ':' + PORT + ' login=' + LOGIN + ' demo=' + (cfg.demo ? 'Y' : 'N') + ' password=' + cfg.passwordFrom + (cfg.COMPANY ? ' company=' + cfg.COMPANY : ''));
  var fails = 0, counts = {};
  function ok(c, m, d) { if (!c) fails++; console.log('   ' + (c ? '✓' : '✗ FAIL:') + ' ' + m + (d ? ' — ' + d : '')); }
  console.log('\n══ ODOO-EXPORT — raw read of ' + DB + ' @ ' + HOST + ':' + PORT + ' → ' + OUT + '/odoo_export.json (cutover ' + CUTOVER + ') ══\n');
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
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

  var company = (await ex('res.company', 'search_read', [CTX.allowed_company_ids ? [['id', 'in', CTX.allowed_company_ids]] : []], { fields: ['id', 'name', 'partner_id', 'currency_id', 'country_id'], order: 'id' }));
  var iso = company.length ? (await ex('res.currency', 'read', [[m2o(company[0].currency_id)]], { fields: ['name'] }))[0].name : '';
  var heldCo = await ex('res.company', 'search_read', [[]], { fields: ['id', 'name', 'partner_id', 'currency_id', 'country_id'], order: 'id', context: { active_test: false } });   // every company's own partner (H4: the others too)

  // ── the reads: one per source the template maps (slice() also records the live count) ──
  var uoms = await slice('uom.uom', [], ['id', 'name', 'category_id', 'uom_type', 'factor', 'rounding']);
  var terms = await slice('account.payment.term', [], ['id', 'name', 'line_ids']);
  var tlines = await ex('account.payment.term.line', 'search_read', [[]], { fields: ['payment_id', 'value', 'value_amount', 'nb_days'], order: 'id' });
  var cats = await slice('product.category', [], ['id', 'name', 'complete_name', 'parent_id']);
  var groups = await ex('account.group', 'search_count', [[]]);
  // H2: archived partners come along (Odoo active=False), so a contact of an archived company keeps its company
  var pf = ['id', 'name', 'ref', 'is_company', 'parent_id', 'commercial_partner_id', 'type', 'email', 'phone', 'mobile', 'street', 'street2', 'city',
    'state_id', 'zip', 'country_id', 'vat', 'customer_rank', 'supplier_rank', 'active'];
  var partners = await slice('res.partner', [], pf, 'id', { active_test: false });
  var users = await ex('res.users', 'search_read', [[]], { fields: ['partner_id'], context: { active_test: false } });
  var countryIds = [], stateIds = [];
  partners.forEach(function (p) { if (p.country_id) countryIds.push(m2o(p.country_id)); if (p.state_id) stateIds.push(m2o(p.state_id)); });
  var ccRows = [], stRows = [];
  if (countryIds.length) (await ex('res.country', 'read', [Array.from(new Set(countryIds))], { fields: ['code'] })).forEach(function (c) { ccRows.push(c); });
  if (stateIds.length) (await ex('res.country.state', 'read', [Array.from(new Set(stateIds))], { fields: ['name'] })).forEach(function (s) { stRows.push(s); });
  var coCountryRow = company.length && company[0].country_id ? (await ex('res.country', 'read', [[m2o(company[0].country_id)]], { fields: ['code'] }))[0] : null, coCountry = coCountryRow ? coCountryRow.code : '';
  var whs = await slice('stock.warehouse', [], ['id', 'name', 'code', 'lot_stock_id', 'partner_id']);
  var prF = ['id', 'default_code', 'name', 'categ_id', 'uom_id', 'detailed_type', 'barcode', 'weight', 'volume', 'description', 'list_price', 'standard_price', 'product_tmpl_id', 'active'];
  var prods = await slice('product.product', [], prF, 'id', { active_test: false });
  var sellers = await slice('product.supplierinfo', [], ['id', 'partner_id', 'product_id', 'product_tmpl_id', 'price', 'product_code', 'min_qty', 'delay']);
  var locs = await slice('stock.location', [['usage', '=', 'internal']], ['id', 'complete_name', 'warehouse_id', 'posx', 'posy', 'posz', 'active'], 'id', { active_test: false });
  var quants = await slice('stock.quant', [['location_id.usage', '=', 'internal']], ['id', 'product_id', 'location_id', 'quantity', 'lot_id']);

  // ── the raw sets ──
  //   odoo_export.json = { manifest: { ..., sets: { <set>: { count, fields_read, fields_missing, domain } } }, sets: { <set>: rows } } — the shape the migration engine's
  //   export-json connector reads (migrate/connectors/export_json.mjs).
  var RAW = {}, RAWMAN = {}, GROUPED = {};   // GROUPED = a set whose rows are not 1:1 with its count (the trial balance: one row per account; the account groups: count only)
  function flat(model, rows) {
    return rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (k === '__domain') return; var v = r[k], t = TYPES[model] && TYPES[model][k] && TYPES[model][k].type;
      if (Array.isArray(v) && (t === 'many2one' || k === 'account_id' && v.length === 2)) { o[k] = v[0]; o[k + '__name'] = v[1]; }
      else if (v === false && t !== 'boolean') o[k] = null; else o[k] = v; }); return o; });
  }
  function rawSet(name, model, fields, domain, rows, count, grouped) { RAW[name] = rows;
    var read = fields.slice(); fields.forEach(function (f) { var t = TYPES[model] && TYPES[model][f] && TYPES[model][f].type; if (t === 'many2one') read.push(f + '__name'); });   // the name half of a many2one
    RAWMAN[name] = { model: model, count: count, fields_read: read, fields_missing: [], domain: JSON.stringify(domain) }; if (grouped) GROUPED[name] = 1;
    console.log('§ODOO-EXPORT raw set=' + name + ' model=' + model + ' rows=' + rows.length + ' count=' + count); }
  var curRow = company.length ? (await ex('res.currency', 'read', [[m2o(company[0].currency_id)]], { fields: ['name', 'decimal_places'] }))[0] : null;
  rawSet('account.account', 'account.account', ['id', 'code', 'name', 'account_type', 'group_id', 'reconcile'], [],
    flat('account.account', await ex('account.account', 'search_read', [[]], { fields: ['id', 'code', 'name', 'account_type', 'group_id', 'reconcile'], order: 'id' })), await ex('account.account', 'search_count', [[]]));
  var tbDom = [['parent_state', '=', 'posted'], ['date', '<=', CUTOVER]];
  var tbRows = flat('account.move.line', await ex('account.move.line', 'read_group', [tbDom, ['balance:sum', 'debit:sum', 'credit:sum'], ['account_id']], { lazy: false, orderby: 'account_id' }));
  var tbCount = await ex('account.move.line', 'search_count', [tbDom]);
  rawSet('tb', 'account.move.line', ['account_id', 'balance', 'debit', 'credit', '__count'], tbDom, tbRows, tbCount, true);
  var olF = ['id', 'move_id', 'move_name', 'move_type', 'partner_id', 'account_id', 'date', 'invoice_date', 'date_maturity', 'balance', 'amount_residual', 'amount_residual_currency',
    'currency_id', 'company_currency_id', 'payment_id', 'ref', 'name'];
  var olDom = [['parent_state', '=', 'posted'], ['account_id.account_type', 'in', ['asset_receivable', 'liability_payable']], ['amount_residual', '!=', 0], ['date', '<=', CUTOVER]];
  var openLines = flat('account.move.line', await ex('account.move.line', 'search_read', [olDom], { fields: olF, order: 'id' }));
  rawSet('open_lines', 'account.move.line', olF, olDom, openLines, await ex('account.move.line', 'search_count', [olDom]));
  var omF = ['id', 'name', 'move_type', 'partner_id', 'commercial_partner_id', 'invoice_date', 'date', 'invoice_date_due', 'invoice_payment_term_id', 'currency_id', 'amount_total',
    'amount_residual', 'ref', 'payment_state'];
  var omIds = Array.from(new Set(openLines.map(function (l) { return l.move_id; }))).sort(function (a, b) { return a - b; });
  rawSet('open_moves', 'account.move', omF, [['id', 'in', '(the moves of open_lines)']], omIds.length ? flat('account.move', await ex('account.move', 'read', [omIds], { fields: omF })) : [], omIds.length);
  function cnt(model, domain, archived) { return counts[model + ' ' + JSON.stringify(domain) + (archived ? ' (archived too)' : '')]; }
  function mset(model, fields, domain, rows, count, archived) { rawSet(model, model, fields, domain, flat(model, rows), count); if (archived) RAWMAN[model].archived_too = true; }
  mset('uom.uom', ['id', 'name', 'category_id', 'uom_type', 'factor', 'rounding'], [], uoms, cnt('uom.uom', []));
  mset('account.payment.term', ['id', 'name', 'line_ids'], [], terms, cnt('account.payment.term', []));
  mset('account.payment.term.line', ['id', 'payment_id', 'value', 'value_amount', 'nb_days'], [], tlines, await ex('account.payment.term.line', 'search_count', [[]]));
  mset('product.category', ['id', 'name', 'complete_name', 'parent_id'], [], cats, cnt('product.category', []));
  rawSet('account.group', 'account.group', [], [], [], groups, true);   // count only: the mapping needs to know whether the source has account groups
  mset('res.partner', pf, [], partners, cnt('res.partner', [], true), true);
  mset('res.users', ['id', 'partner_id'], [], users, await ex('res.users', 'search_count', [[]], { context: { active_test: false } }), true);
  mset('res.company', ['id', 'name', 'partner_id', 'currency_id', 'country_id'], [], heldCo, await ex('res.company', 'search_count', [[]], { context: { active_test: false } }), true);
  var ccAll = ccRows.slice(); if (coCountryRow && !ccAll.some(function (c) { return c.id === coCountryRow.id; })) ccAll.push(coCountryRow);
  mset('res.country', ['id', 'code'], [['id', 'in', '(the countries of res.partner and of the company)']], ccAll, ccAll.length);
  mset('res.country.state', ['id', 'name'], [['id', 'in', '(the states of res.partner)']], stRows, stRows.length);
  mset('stock.warehouse', ['id', 'name', 'code', 'lot_stock_id', 'partner_id'], [], whs, cnt('stock.warehouse', []));
  mset('product.product', prF, [], prods, cnt('product.product', [], true), true);
  mset('product.supplierinfo', ['id', 'partner_id', 'product_id', 'product_tmpl_id', 'price', 'product_code', 'min_qty', 'delay'], [], sellers, cnt('product.supplierinfo', []));
  mset('stock.location', ['id', 'complete_name', 'warehouse_id', 'posx', 'posy', 'posz', 'active'], [['usage', '=', 'internal']], locs, cnt('stock.location', [['usage', '=', 'internal']], true), true);
  mset('stock.quant', ['id', 'product_id', 'location_id', 'quantity', 'lot_id'], [['location_id.usage', '=', 'internal']], quants, cnt('stock.quant', [['location_id.usage', '=', 'internal']]));
  var tbSum = tbRows.reduce(function (n, r) { return n + r.balance; }, 0), tbLines = tbRows.reduce(function (n, r) { return n + r.__count; }, 0);
  console.log('§ODOO-EXPORT tb accounts=' + tbRows.length + ' lines=' + tbLines + ' count=' + tbCount + ' sum=' + tbSum.toFixed(curRow ? curRow.decimal_places : 2) + ' open_lines=' + openLines.length + ' open_moves=' + omIds.length);
  ok(tbLines === tbCount, 'every posted account.move.line up to the cut-over is in exactly one trial-balance row', tbLines + '==' + tbCount);
  // the door's own check: every set that is read row for row has exactly as many rows as Odoo counted for it (a short read = a silent loss)
  var short = Object.keys(RAWMAN).filter(function (k) { return !GROUPED[k] && RAW[k].length !== RAWMAN[k].count; }).map(function (k) { return k + ' ' + RAW[k].length + '!=' + RAWMAN[k].count; });
  ok(short.length === 0, 'every set read has as many rows as Odoo counted for it', Object.keys(RAWMAN).filter(function (k) { return !GROUPED[k]; }).length + ' sets' + (short.length ? ': ' + short.join(' | ') : ''));
  Object.keys(counts).forEach(function (k) { console.log('§ODOO-EXPORT source ' + k + ' count=' + counts[k]); });
  if (Math.abs(tbSum) >= 0.005) console.log('§ODOO-EXPORT note The trial balance at ' + CUTOVER + ' does not sum to zero (' + tbSum.toFixed(2) + '): the opening journal will be refused as unbalanced until that is explained.');
  if (others.length) console.log('§ODOO-EXPORT note This Odoo has ' + allCo.length + ' companies; this export is ONLY ' + JSON.stringify(company[0].name) + '. Each company moves into its own ERP company — export the others with: ' + otherCmd.join(' | '));

  fs.writeFileSync(path.join(OUT, 'odoo_export.json'), JSON.stringify({ manifest: { tool: 'odoo_agent/export.js', format: 'odoo-export-json-v1', odoo_version: version, db: DB, cutover: CUTOVER,
    currency: iso, currency_places: curRow ? curRow.decimal_places : null, company_id: coId, company_name: company[0].name, company_country_code: coCountry,
    other_companies: others.map(function (c) { return { id: c.id, name: c.name }; }), other_company_commands: otherCmd, sets: RAWMAN }, sets: RAW }, null, 1));
  if (!fails) { fs.rmSync(FINAL, { recursive: true, force: true }); fs.renameSync(OUT, FINAL); }
  var nSets = Object.keys(RAWMAN).length, nRows = Object.keys(RAW).reduce(function (n, k) { return n + RAW[k].length; }, 0);
  console.log('\n' + (fails ? '🔴 ODOO-EXPORT FAIL (' + fails + ') — nothing published; the incomplete files are in ' + OUT : '🟢 ODOO-EXPORT PASS — odoo_export.json (' + nSets + ' sets, ' + nRows + ' rows) written to ' + FINAL));
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
