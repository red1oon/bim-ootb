#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MIGRATE-ENGINE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ENGINE-D-SPEC). READ THE LOG: every verdict is a §MIGE line; the exit code is not the evidence.
// THE ISSUE it proves/disproves: can ONE engine + a JSON template (data, no code) replace a hand-written source converter WITHOUT changing a single cell the user loads?
//   First converter re-expressed: SAP Business One (erp/plugins/sap_migrate_convert.mjs) as erp/migrate/templates/sap-b1-10.json.
// SPEC (written before the code):
//   LOAD   the template loads; 6 malformed templates (unknown operator, unknown block key, forward sheet reference, undeclared variable, unknown sheet, bad group) are REFUSED, each named.
//   GUIDE  SAP's guide fixture through the mock Service Layer + the real agent (as W-SAP-MIGRATE): the SHIPPED convert (engine + template) == the frozen hand converter
//          (erp/tests/fixtures/sap_convert_reference.mjs, the oracle) cell for cell; manifest (all but "tool") and provenance equal.
//   DIFF   the guide prints almost no record (no address, price, bin or stock), so GUIDE alone is scope-blind: N seeded generated exports — built only from the field names the agent reads
//          and the SAP enum member names the converter tests (cLid, itFixedAssets, tYES, at_Other, pdt_None …), a TEST INPUT for the equality of two implementations, never shown
//          as business data — fed to BOTH; every differing cell printed. COVER: each converter branch the run hit; a branch never hit = INCONCLUSIVE, never PASS.
//   MUTANT one rule changed in a COPY of the template → DIFF must find a difference (a diff that cannot fail is not a witness).
//   FIELD  every "$Field" the template reads from a top-level set is one the agent reads (its SETS model) — a field outside it is NAMED.
//   BC-*   the same four claims for Business Central (templates/bc-w1.json vs the frozen hand converter erp/tests/fixtures/bc_convert_reference.mjs): BC-GUIDE on Microsoft's demo
//          company (Contoso), BC-DIFF on packages generated from Contoso's own rows (sampled, fields blanked, codes repeated, links broken), BC-MUTANT.
// Command: node erp/tests/witness_migrate_engine.js 2>&1 | tee /tmp/count_logs/migrate_engine.log      (MIGE_N=<cases> to change the DIFF size, default 400)
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sap_b1_guide', 'rows.json'), 'utf8'));
var _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §MIGE-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info).slice(0, 1500))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§MIGE-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
// canonical form: keys sorted, undefined-valued keys dropped (what a JSON consumer of the result sees)
function canon(x) { if (Array.isArray(x)) return x.map(canon); if (x && typeof x === 'object') { var o = {}; Object.keys(x).sort().forEach(function (k) { if (x[k] !== undefined) o[k] = canon(x[k]); }); return o; } return x; }
function same(a, b) { return J(canon(a)) === J(canon(b)); }
// every difference between two results: book cells, manifest keys, provenance rows
function diff(a, b) {
  var d = [];
  a.book.forEach(function (sh, i) { var sb = b.book[i] || { rows: [] }; if (sh.name !== sb.name) d.push({ where: 'sheet ' + i, conv: sh.name, engine: sb.name });
    var n = Math.max(sh.rows.length, sb.rows.length); for (var r = 0; r < n; r++) { var ra = sh.rows[r] || [], rb = sb.rows[r] || [], m = Math.max(ra.length, rb.length);
      for (var c = 0; c < m; c++) if (ra[c] !== rb[c]) d.push({ where: sh.name + ' row ' + r + ' col ' + ((sh.rows[0] || [])[c] || c), conv: ra[c], engine: rb[c] }); } });
  var ma = Object.assign({}, a.manifest), mb = Object.assign({}, b.manifest); delete ma.tool; delete mb.tool;
  Object.keys(Object.assign({}, ma, mb)).forEach(function (k) { if (!same(ma[k], mb[k])) d.push({ where: 'manifest.' + k, conv: ma[k], engine: mb[k] }); });
  Object.keys(Object.assign({}, a.provenance, b.provenance)).forEach(function (k) { var pa = a.provenance[k] || [], pb = b.provenance[k] || [];
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) if (!same(pa[i], pb[i])) { d.push({ where: 'provenance.' + k + '[' + i + ']', conv: pa[i], engine: pb[i] }); break; } });
  return d;
}
// seeded generator (mulberry32): a test input only, values = field-name tokens + the enum members the converter tests
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gen(seed, SETS) {
  var R = mulberry32(seed), pick = function (a) { return a[Math.floor(R() * a.length)]; }, n = function (k) { return Math.floor(R() * (k + 1)); }, range = function (k) { var o = []; for (var i = 0; i < k; i++) o.push(i); return o; };
  var maybe = function (v) { return pick([v, v, v, undefined, null, '']); }, YN = ['tYES', 'tNO', 'Y', 'N', 1, '1', 0, undefined, null];
  var shuffle = function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  var S = {};
  S.UnitOfMeasurements = range(n(3)).map(function (i) { return { AbsEntry: i + 1, Code: maybe('UOM' + i), InternationalSymbol: maybe('EA') }; });
  S.PaymentTermsTypes = range(n(3)).map(function (i) { return { GroupNumber: pick([i, String(i), -1 - i]), PaymentTermsGroupName: maybe('Term' + i), NumberOfAdditionalDays: pick([undefined, null, 0, 30, '15']),
    NumberOfAdditionalMonths: pick([undefined, null, 0, 1, '0', '2']), StartFrom: pick([undefined, '', 'pdt_None', 'pdt_MonthEnd', 'pdt_HalfMonth', 'pdt_StartOfMonth']) }; });
  S.ItemGroups = range(n(3)).map(function (i) { return { Number: 100 + i, GroupName: maybe('Group' + i) }; });
  S.ChartOfAccounts = range(n(4)).map(function (i) { return { Code: pick(['A' + i, '_SYS0000000008' + i]), Name: maybe('Account' + i), AccountType: pick(['at_Revenues', 'at_Expenses', 'at_Other', undefined]), ActiveAccount: pick(YN) }; });
  S.BusinessPartners = range(n(4)).map(function (i) { return { CardCode: pick(['c' + i, 'c' + i, 'c' + i + 'x'.repeat(45)]), CardName: maybe('customer c' + i), CardType: pick(['cCustomer', 'cSupplier', 'cLid', 'C', 'S', 'L']),
    FederalTaxID: maybe('T' + i), Phone1: maybe('P1'), Phone2: maybe('P2'), Cellular: maybe('CEL'), EmailAddress: maybe('e' + i + '@x'), ContactPerson: maybe('CP' + i), Valid: pick(YN), Frozen: pick(YN),
    BPAddresses: pick([undefined, range(n(3)).map(function (j) { return { AddressType: pick(['bo_BillTo', 'bo_ShipTo']), AddressName: pick(['A', 'B']), Street: maybe('S' + j), Block: maybe('B'), City: maybe('C'),
      ZipCode: maybe('Z'), State: maybe('ST'), County: maybe('CO'), Country: pick(['US', 'MY', '', undefined]) }; })]),
    ContactEmployees: pick([undefined, range(n(3)).map(function (j) { return { Name: maybe('N' + j), E_Mail: maybe('m@x'), Phone1: maybe('1'), MobilePhone: maybe('2'), Active: pick(YN) }; })]) }; });
  S.Items = range(n(5)).map(function (i) { return { ItemCode: 'i00' + i, ItemName: maybe('i00' + i + ' name'), ForeignName: maybe('F'), ItemsGroupCode: pick([undefined, null, 100, 101, 999]),
    ItemType: pick(['itItems', 'itLabor', 'itTravel', 'itFixedAssets', undefined]), InventoryItem: pick(YN), BarCode: maybe('BC' + i), Mainsupplier: pick([undefined, '', 'c0', 'c1', 'nobody']),
    SupplierCatalogNo: maybe('SC' + i), Valid: pick(YN), Frozen: pick(YN), InventoryUOM: maybe('UOM0'), SalesUnitWeight: pick([undefined, 1.5, 0]), SalesUnitVolume: pick([undefined, 2, '']),
    ItemPrices: range(n(3)).map(function () { return { PriceList: pick([1, 2, 3, '1']), Price: pick([undefined, null, 0, 10, '9.5']) }; }),
    ItemWarehouseInfoCollection: range(n(4)).map(function () { return { WarehouseCode: pick(['01', '02', '99']), InStock: pick([0, 1, 2.5, '3', undefined, 0.1, 0.2, 0.1234567]) }; }) }; });
  S.PriceLists = shuffle([1, 2, 3]).slice(0, n(3)).map(function (no) { return { PriceListNo: no, PriceListName: maybe('List ' + no), DefaultPrimeCurrency: pick(['USD', '', undefined]), Active: pick(YN) }; });
  S.Warehouses = shuffle(['01', '02', '03']).slice(0, n(3)).map(function (c) { return { WarehouseCode: c, WarehouseName: maybe('WH ' + c), Street: maybe('S'), Block: maybe('B'), City: maybe('C'), ZipCode: maybe('Z'),
    County: maybe('CO'), State: maybe('ST'), Country: pick(['US', '', undefined]), Inactive: pick(YN) }; });
  S.BinLocations = range(n(3)).map(function (j) { return { AbsEntry: j + 1, Warehouse: pick(['01', '02', '99']), BinCode: maybe('BIN' + j), Inactive: pick(YN) }; });
  var sets = {}; Object.keys(SETS).forEach(function (k) { var fl = SETS[k].fields, miss = R() < 0.15 ? [pick(fl)] : [], ms = R() < 0.05;
    sets[k] = ms ? { type: null, missing_set: true } : { type: SETS[k].type, count: S[k].length, rows: S[k].length, fields_read: fl.filter(function (f) { return miss.indexOf(f) < 0; }), fields_missing: miss }; if (ms) S[k] = []; });
  return { exp: { manifest: { tool: 'erp/sap_agent/agent.js', format: R() < 0.04 ? 'something-else' : 'sap-b1-export-v1', alpha: true, company: pick(['SBODEMOUS', '']), version: pick(['1000190', '', undefined]),
      metadata: pick([null, { sha256: 'ab'.repeat(32) }]), sets: sets }, sets: S, admin: pick([{ LocalCurrency: 'USD', Country: 'US' }, { LocalCurrency: '', Country: '' }, undefined]) },
    opts: { cutover: pick(['2026-11-09', '2026-12-31', '']), priceList: pick([undefined, undefined, null, 1, '2', 3, 7]) } };
}
// which converter branches a case hit (read from the CONVERTER's own result + its input — the engine is not consulted)
function branches(exp, opts, c) {
  var m = c.manifest, H = {}, hit = function (k, v) { if (v) H[k] = 1; }, ref = function (sh) { return (m.refused || []).some(function (r) { return r.sheet === sh; }); };
  var note = function (re) { return (m.notes || []).some(function (x) { return re.test(x); }); }, pat = function (t, col) { return (m.patches || []).some(function (p) { return p.table === t && p.column === col; }); };
  var rows = function (t) { var i = Object.keys(c.provenance).indexOf(t); return c.book[i] ? c.book[i].rows.slice(1) : []; };
  var col = function (t, h, v) { var i = Object.keys(c.provenance).indexOf(t), k = c.book[i] ? c.book[i].rows[0].indexOf(h) : -1; return k >= 0 && rows(t).some(function (r) { return v === null ? r[k] !== '' : r[k] === v; }); };
  hit('refuse:lead', ref('C_BPartner')); hit('refuse:fixed-asset', ref('M_Product')); hit('refuse:po-no-supplier', ref('M_Product_PO')); hit('refuse:wh-no-country', ref('M_Warehouse'));
  hit('refuse:bin-no-wh', ref('M_Locator')); hit('refuse:stock-no-wh', ref('M_InventoryLine'));
  hit('note:complex-term', note(/payment term\(s\)/)); hit('note:at_Other', note(/balance-sheet accounts/)); hit('note:non-inventory', note(/not inventory items/));
  hit('note:missing-set', note(/publishes no/)); hit('note:missing-field', note(/your server lacks/));
  hit('patch:vendor-product-no', pat('M_Product_PO', 'VendorProductNo')); hit('patch:multi-pricelist', pat('M_PriceList', 'Name')); hit('patch:no-country', pat('C_Location', 'C_Country_ID'));
  hit('patch:uom-default', pat('M_Product', 'C_UOM_ID')); hit('patch:category-default', pat('M_Product', 'M_Product_Category_ID')); hit('rename:key-cut', (m.renamed || []).length);
  hit('problem:not-an-export', (m.problems || []).some(function (p) { return /not a file/.test(p); })); hit('problem:no-currency', (m.problems || []).some(function (p) { return /no currency/.test(p); }));
  hit('user:card-contact', (c.provenance.AD_User || []).some(function (p) { return p.part === 'card contact'; })); hit('user:contact-person', (c.provenance.AD_User || []).some(function (p) { return p.sap === 'ContactEmployees'; }));
  var addr = 0; (exp.sets.BusinessPartners || []).forEach(function (b) { if (/^(cLid|L)$/.test(String(b.CardType))) return; (b.BPAddresses || []).forEach(function (a) { if (a.Street || a.Block || a.City || a.ZipCode || a.Country) addr++; }); });
  hit('location:dedupe', addr > (c.provenance.C_Location || []).filter(function (p) { return /^bp\//.test(p.sap); }).length);
  hit('location:warehouse', (c.provenance.C_Location || []).some(function (p) { return /^wh\//.test(p.sap); }));
  var pairs = {}; (exp.sets.Items || []).forEach(function (i) { if (i.ItemType === 'itFixedAssets') return; (i.ItemWarehouseInfoCollection || []).forEach(function (w) { if (Number(w.InStock || 0)) { var k = w.WarehouseCode + '|' + i.ItemCode; pairs[k] = (pairs[k] || 0) + 1; } }); });
  hit('stock:sum-of-several', rows('M_InventoryLine').length && Object.keys(pairs).some(function (k) { return pairs[k] > 1; }));
  hit('stock:line', rows('M_InventoryLine').length); hit('price:row', rows('M_ProductPrice').length); hit('locator:bin', (c.provenance.M_Locator || []).some(function (p) { return p.sap === 'BinLocations'; }));
  hit('pricelist:preferred-not-lowest', m.priceList && opts.priceList != null && String(opts.priceList) === m.priceList && m.priceList !== String(Math.min.apply(null, (exp.sets.PriceLists || []).map(function (p) { return Number(p.PriceListNo); }))));
  hit('term:netdays', col('C_PaymentTerm', 'NetDays', null)); hit('account:summary', col('C_ElementValue', 'IsSummary', 'Y'));
  hit('bp:inactive', col('C_BPartner', 'IsActive', 'N')); hit('product:service', col('M_Product', 'ProductType', 'S'));
  return H;
}
var ALL_BRANCHES = ['refuse:lead', 'refuse:fixed-asset', 'refuse:po-no-supplier', 'refuse:wh-no-country', 'refuse:bin-no-wh', 'refuse:stock-no-wh', 'note:complex-term', 'note:at_Other', 'note:non-inventory',
  'note:missing-set', 'note:missing-field', 'patch:vendor-product-no', 'patch:multi-pricelist', 'patch:no-country', 'patch:uom-default', 'patch:category-default', 'rename:key-cut', 'problem:not-an-export',
  'problem:no-currency', 'user:card-contact', 'user:contact-person', 'location:dedupe', 'location:warehouse', 'stock:sum-of-several', 'stock:line', 'price:row', 'locator:bin', 'pricelist:preferred-not-lowest',
  'term:netdays', 'account:summary', 'bp:inactive', 'product:service'];

(async function main() {
  var CV = await import(url.pathToFileURL(path.join(__dirname, 'fixtures', 'sap_convert_reference.mjs')).href), SHIP = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'sap_migrate_convert.mjs')).href), EN = await import(url.pathToFileURL(path.join(ERP, 'migrate', 'engine.mjs')).href);
  var CN = await import(url.pathToFileURL(path.join(ERP, 'migrate', 'connectors', 'export_json.mjs')).href), AG = require(path.join(ERP, 'sap_agent', 'agent.js')), MOCK = require(path.join(__dirname, 'sap_sl_mock.js'));
  var TPL = JSON.parse(fs.readFileSync(path.join(ERP, 'migrate', 'templates', 'sap-b1-10.json'), 'utf8'));
  var engine = function (tpl, exp, opts) { return EN.run(tpl, CN.exportJson(exp, tpl.connector), { CUTOVER: (opts && opts.cutover) || '', PRICE_LIST: opts ? opts.priceList : null }); };
  var convert = function (exp, opts) { return CV.convert(exp, opts); };          // the ORACLE: the hand converter as it shipped (#2774), frozen as a test fixture
  var shipped = function (exp, opts) { return SHIP.convert(exp, opts); };       // what the browser form calls today: engine + templates/sap-b1-10.json
  check('LOAD', 'shipped-is-engine', 'plugins/sap_migrate_convert.mjs runs the engine on the template file (its TEMPLATE is the JSON on disk), not a hand mapping', same(SHIP.TEMPLATE, TPL) && !/T\('BusinessPartners'\)/.test(fs.readFileSync(path.join(ERP, 'plugins', 'sap_migrate_convert.mjs'), 'utf8')), null);

  // ═══ LOAD ═══
  var loaded = true, why = ''; try { EN.load(TPL); } catch (e) { loaded = false; why = e.message; }
  check('LOAD', 'template', 'sap-b1-10.json loads: every operator, block key, sheet, variable, let, def and valueMap is in the closed sets', loaded, why);
  var C = function () { return JSON.parse(JSON.stringify(TPL)); }, BAD = [
    ['unknown-op', function (t) { t.entities.C_UOM.fields.Name = { eval: '$Code' }; }, /unknown operator "eval"/],
    ['unknown-key', function (t) { t.entities.C_UOM.script = 'x'; }, /unknown block key "script"/],
    ['forward-ref', function (t) { t.entities.C_BPartner.refuse[0].when = { exists: ['M_Warehouse', 'Value', '$CardCode'] }; }, /before it is produced/],
    ['undeclared-var', function (t) { t.entities.C_UOM.fields.Name = '${SERVER}'; }, /\$\{SERVER\} is not declared/],
    ['unknown-sheet', function (t) { t.entities.C_Order = { from: 'Orders', fields: {} }; }, /"C_Order" is not a target sheet/],
    ['bad-group', function (t) { t.entities.M_Inventory.group = { by: [], sort: true }; }, /group\.by: a list/]];
  BAD.forEach(function (b) { var t = C(); b[1](t); var msg = ''; try { EN.load(t); } catch (e) { msg = e.message; }
    check('LOAD', b[0], 'a template with a ' + b[0] + ' is REFUSED at load, naming it', b[2].test(msg), msg || 'loaded'); if (msg) say('  §MIGE-REFUSED ' + b[0] + ' "' + msg + '"'); });
  verdict('LOAD');

  // ═══ FIELD ═══
  var model = {}; Object.keys(AG.SETS).forEach(function (k) { model[k] = AG.SETS[k].fields; });
  var fc = EN.fieldCheck(TPL, model), outside = fc.filter(function (f) { return !f.ok || !f.known; });
  fc.filter(function (f) { return !f.ok || !f.known; }).forEach(function (f) { say('  §MIG-FIELD missing set=' + f.set + ' field=' + f.field + (f.known ? '' : ' (set unknown to the agent)')); });
  check('FIELD', 'template⊆agent', 'every one of the ' + fc.length + ' top-level "$Field"s the template reads is a field the agent asks the server for', fc.length > 0 && !outside.length, outside);
  verdict('FIELD');

  // ═══ GUIDE ═══
  var mk = await MOCK.start(FX), exp = await AG.run({ url: mk.url, company: 'SBODEMOUS', user: 'manager', password: 'mock', page: 1 }, null, function () {}); mk.close();
  var CUT = '2026-11-09', a = convert(exp, { cutover: CUT }), b = shipped(exp, { cutover: CUT }), dg = diff(a, b);
  say('§MIGE-GUIDE sheets=' + a.book.length + ' rows=' + a.book.map(function (s) { return s.rows.length - 1; }).join(',') + ' cells=' + a.book.reduce(function (n, s) { return n + s.rows.length * s.rows[0].length; }, 0));
  check('GUIDE', 'book', 'engine book == converter book, cell for cell, on SAP\'s guide fixture', !dg.filter(function (x) { return !/^manifest|^provenance/.test(x.where); }).length, dg.slice(0, 10));
  check('GUIDE', 'manifest', 'manifest equal (patches, refused, notes, problems, sheets, sap_sets, cutover, currency …; "tool" names the implementation and is excluded)', !dg.filter(function (x) { return /^manifest/.test(x.where); }).length, dg.filter(function (x) { return /^manifest/.test(x.where); }).slice(0, 5));
  check('GUIDE', 'provenance', 'provenance equal, row by row', !dg.filter(function (x) { return /^provenance/.test(x.where); }).length, dg.filter(function (x) { return /^provenance/.test(x.where); }).slice(0, 5));
  verdict('GUIDE');

  // ═══ DIFF ═══
  var N = Number(process.env.MIGE_N || 400), bad = 0, firstBad = null, cover = {}, cells = 0;
  for (var i = 1; i <= N; i++) { var g = gen(i, AG.SETS), ca = convert(g.exp, g.opts), cb = shipped(g.exp, g.opts), d = diff(ca, cb);
    cells += ca.book.reduce(function (n, s) { return n + s.rows.length * s.rows[0].length; }, 0);
    Object.keys(branches(g.exp, g.opts, ca)).forEach(function (k) { cover[k] = (cover[k] || 0) + 1; });
    if (d.length) { bad++; if (!firstBad) firstBad = { seed: i, opts: g.opts, diffs: d.slice(0, 12) }; } }
  if (firstBad) say('  §MIGE-DIFF first seed=' + firstBad.seed + ' ' + J(firstBad).slice(0, 3000));
  say('§MIGE-DIFF cases=' + N + ' cells=' + cells + ' differing_cases=' + bad);
  check('DIFF', 'equal', 'on ' + N + ' seeded exports the engine result == the converter result (book cells, manifest, provenance)', bad === 0, firstBad);
  ALL_BRANCHES.forEach(function (k) { if (cover[k]) say('  §MIGE-COVER branch=' + k + ' cases=' + cover[k]); else say('  §MIGE-COVER branch=' + k + ' INCONCLUSIVE — no case hit it'); });
  var missed = ALL_BRANCHES.filter(function (k) { return !cover[k]; });
  say('§MIGE-COVER hit=' + (ALL_BRANCHES.length - missed.length) + '/' + ALL_BRANCHES.length + (missed.length ? ' INCONCLUSIVE=' + missed.join(',') : ''));
  verdict('DIFF');

  // ═══ MUTANT ═══
  var MUT = [
    ['lead-refusal-removed', function (t) { delete t.entities.C_BPartner.refuse; }],
    ['customer-role-swapped', function (t) { t.entities.C_BPartner.fields.IsCustomer = { if: [{ in: [{ str: '$CardType' }, ['cSupplier', 'S']] }, 'Y', 'N'] }; }],
    ['location-unique-dropped', function (t) { t.entities.C_Location.forEach(function (bk) { delete bk.unique; }); }],
    ['stock-rounding-2', function (t) { t.entities.M_InventoryLine.group.sum.QtyCount.places = 2; }],
    ['pricelist-prefer-ignored', function (t) { delete t.let.PL.pick.prefer; }]];
  var M = Math.min(N, 200);
  MUT.forEach(function (mu) { var t = C(); mu[1](t); var found = 0; for (var i = 1; i <= M && !found; i++) { var g = gen(i, AG.SETS); if (diff(convert(g.exp, g.opts), engine(t, g.exp, g.opts)).length) found = i; }
    check('MUTANT', mu[0], 'the template with "' + mu[0] + '" differs from the converter on some seed ≤ ' + M + ' (the DIFF can fail)', found > 0, 'no seed found a difference'); if (found) say('  §MIGE-MUTANT ' + mu[0] + ' caught at seed=' + found); });
  verdict('MUTANT');

  // ═══════════ BUSINESS CENTRAL: templates/bc-w1.json vs the frozen hand converter (erp/tests/fixtures/bc_convert_reference.mjs) ═══════════
  var XLSX = require(path.join(ERP, 'xlsx.mini.min.js')), BFX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bc_package_contoso', 'rows.json'), 'utf8'));
  var BMODEL = (await import(url.pathToFileURL(path.join(ERP, 'plugins', 'bc_model.mjs')).href)).default, BSHIP = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'bc_migrate_convert.mjs')).href);
  var BREF = await import(url.pathToFileURL(path.join(__dirname, 'fixtures', 'bc_convert_reference.mjs')).href), BTPL = JSON.parse(fs.readFileSync(path.join(ERP, 'migrate', 'templates', 'bc-w1.json'), 'utf8'));
  var BCN = await import(url.pathToFileURL(path.join(ERP, 'migrate', 'connectors', 'bc_package.mjs')).href);
  var bengine = function (tpl, pkg, opts) { return EN.run(tpl, BCN.bcPackage(pkg, BMODEL, tpl.connector), { CUTOVER: (opts && opts.cutover) || '' }); };
  var bbuf = require(path.join(__dirname, 'bc_package_writer.js')).write(XLSX, BMODEL, BFX, 'CONTOSO-ALPHA'), BPKG = BSHIP.readPackage(XLSX.read(bbuf), BMODEL);
  var lb = true, lbw = ''; try { EN.load(BTPL); } catch (e) { lb = false; lbw = e.message; }
  check('BC-LOAD', 'template', 'bc-w1.json loads (closed sets, no forward reference)', lb, lbw);
  check('BC-LOAD', 'shipped-is-engine', 'plugins/bc_migrate_convert.mjs runs the engine on the template file, not a hand mapping', same(BSHIP.TEMPLATE, BTPL) && !/T\(27\)\.forEach/.test(fs.readFileSync(path.join(ERP, 'plugins', 'bc_migrate_convert.mjs'), 'utf8')), null);
  var bmodel = {}; Object.keys(BMODEL.tables).forEach(function (id) { bmodel[id] = BMODEL.tables[id].fields.map(function (f) { return f.name; }); });
  var bfc = EN.fieldCheck(BTPL, bmodel), bout = bfc.filter(function (f) { return !f.ok || !f.known; });
  bout.forEach(function (f) { say('  §MIG-FIELD missing set=' + f.set + ' field=' + f.field + (f.known ? '' : ' (table unknown to the model)')); });
  check('BC-LOAD', 'fields⊆model', 'every one of the ' + bfc.length + ' "$Field"s read from a BC table is a field of that table in Microsoft\'s published model (bc_model.mjs)', bfc.length > 0 && !bout.length, bout);
  verdict('BC-LOAD');
  ['2026-11-09', ''].forEach(function (cut) { var a = BREF.convert(BPKG, BMODEL, { cutover: cut }), b = BSHIP.convert(BPKG, BMODEL, { cutover: cut }), d = diff(a, b);
    say('§MIGE-BC-GUIDE cutover=' + (cut || '(none)') + ' rows=' + a.book.map(function (s) { return s.rows.length - 1; }).join(',') + ' cells=' + a.book.reduce(function (n, s) { return n + s.rows.length * s.rows[0].length; }, 0) + ' differing=' + d.length);
    check('BC-GUIDE', 'contoso-' + (cut || 'nocut'), 'Microsoft\'s demo company (Contoso, ' + Object.keys(BPKG.tables).length + ' tables): shipped convert (engine + bc-w1.json) == the frozen hand converter — book, manifest, provenance', !d.length, d.slice(0, 10)); });
  verdict('BC-GUIDE');
  // generated packages: Contoso's own rows, sampled and edited (fields blanked, codes repeated, links broken) — a test input for the equality of two implementations only
  function bgen(seed) {
    var R = mulberry32(seed), pick = function (a) { return a[Math.floor(R() * a.length)]; }, P = JSON.parse(JSON.stringify(BPKG)), T = P.tables;
    var ids = function (id) { return (T[id] ? T[id].rows : []).map(function (r) { return r['No.'] || r.Code; }); };
    var KEY = { 'No.': 1, Code: 1, 'Customer No.': 1, 'Item No.': 1 };   // a table's primary key is always filled in a BC export: never blanked
    Object.keys(T).forEach(function (id) { T[id].rows = T[id].rows.filter(function () { return R() < 0.6; }).map(function (r) { Object.keys(r).forEach(function (k) { if (!KEY[k] && !(id === '7354' && k === 'Location Code') && R() < 0.08) delete r[k]; }); return r; }); });
    (T[3] || { rows: [] }).rows.forEach(function (r) { r['Due Date Calculation'] = pick(['30D', '<14D>', 'CM', '1M+8D', '', undefined, '7d']); });
    (T[15] || { rows: [] }).rows.forEach(function (r) { if (R() < 0.3) r['Account Category'] = pick([' ', 'Assets', 'Cost of Goods Sold', 'Income', undefined, 'Bogus']); if (R() < 0.3) r['Account Type'] = pick(['Posting', 'Heading', 'Total', undefined]); });
    var custNos = ids(18);
    (T[23] || { rows: [] }).rows.forEach(function (r) { if (R() < 0.3 && custNos.length) r['No.'] = pick(custNos); });
    [18, 23].forEach(function (id) { (T[id] || { rows: [] }).rows.forEach(function (r) { if (R() < 0.4) r.Blocked = pick(id === 18 ? [' ', 'Ship', 'Invoice', 'All'] : [' ', 'Payment', 'All']); if (R() < 0.1) r['No.'] = 'N' + 'x'.repeat(41) + seed;
      if (R() < 0.3) { delete r.Address; delete r['Address 2']; delete r.City; delete r['Post Code']; } if (R() < 0.3) delete r['Country/Region Code']; if (R() < 0.2) r['Phone No.'] = '555'; }); });
    (T[222] || { rows: [] }).rows.forEach(function (r) { if (R() < 0.2) r['Customer No.'] = 'NOT-A-CUSTOMER'; if (R() < 0.3) delete r['Country/Region Code']; });
    var itemNos = ids(27), vendNos = ids(23);
    (T[27] || { rows: [] }).rows.forEach(function (r) { if (R() < 0.3) r.Type = pick(['Inventory', 'Service', 'Non-Inventory', undefined]); if (R() < 0.3) r.Blocked = pick(['true', 'false', 'Yes', ' 1 ', undefined]);
      if (R() < 0.3) r['Vendor No.'] = pick(vendNos.concat(['NO-VENDOR', undefined])); if (R() < 0.3) delete r['Vendor Item No.']; if (R() < 0.2) delete r['Item Category Code']; });
    if (itemNos.length && vendNos.length) T[99] = { caption: 'Item Vendor', sheet: 'Item Vendor', fields: [], rows: Array.from({ length: Math.floor(R() * 6) }, function () { return { 'Item No.': pick(itemNos.concat(['NO-ITEM'])), 'Vendor No.': pick(vendNos.concat(['NO-VENDOR'])), 'Vendor Item No.': pick(['VI1', undefined]) }; }) };
    var cats = ids(5722); (T[5722] || { rows: [] }).rows.forEach(function (r) { if (R() < 0.3) r['Parent Category'] = pick(cats.concat(['MISSING', undefined])); });
    (T[14] || { rows: [] }).rows.forEach(function (r) { if (R() < 0.4) { delete r.Address; delete r['Address 2']; delete r.City; delete r['Post Code']; delete r['Country/Region Code']; } });
    var locs = ids(14);
    (T[7354] || { rows: [] }).rows.forEach(function (r) { if (R() < 0.2) r['Location Code'] = 'NO-LOC'; });
    (T[32] || { rows: [] }).rows.forEach(function (r) { if (R() < 0.15) delete r['Location Code']; if (R() < 0.1) delete r['Posting Date']; if (R() < 0.15) r['Posting Date'] = '2030-01-01'; if (R() < 0.2) r.Quantity = pick(['-5', '0', '2.5', '0.1', '0.2']); });
    if (T[32] && T[32].rows.length && R() < 0.5) { var e = T[32].rows[0]; T[32].rows.push(Object.assign({}, e, { Quantity: String(-Number(e.Quantity || 0)) })); }   // a pair that sums to zero
    if (R() < 0.1) delete T[98]; else if (T[98] && T[98].rows[0] && R() < 0.1) delete T[98].rows[0]['LCY Code'];
    if (R() < 0.15) delete T[79]; else if (T[79] && T[79].rows[0] && R() < 0.3) { var c = T[79].rows[0]; delete c.Address; delete c['Address 2']; delete c.City; delete c['Post Code']; if (R() < 0.5) delete c['Country/Region Code']; }
    void locs; return { pkg: P, opts: { cutover: pick(['2026-11-09', '', '2020-01-01', '2026-01-15']) } };
  }
  function bbranches(g, c) {
    var m = c.manifest, H = {}, hit = function (k, v) { if (v) H[k] = 1; }, ref = function (sh) { return (m.refused || []).some(function (r) { return r.sheet === sh; }); };
    var note = function (re) { return (m.notes || []).some(function (x) { return re.test(x); }); }, pat = function (t, col) { return (m.patches || []).some(function (p) { return p.table === t && p.column === col; }); };
    var rows = function (t) { return c.book[ORDERI(t)].rows.slice(1); }, col = function (t, h, v) { var k = c.book[ORDERI(t)].rows[0].indexOf(h); return rows(t).some(function (r) { return v === null ? r[k] !== '' : r[k] === v; }); };
    hit('refuse:shipto-no-customer', ref('C_BPartner_Location')); hit('refuse:po-missing', ref('M_Product_PO')); hit('refuse:bin-no-location', ref('M_Locator')); hit('refuse:undated-entry', ref('M_InventoryLine'));
    hit('note:complex-term', note(/due-date formula/)); hit('note:no-category', note(/no Account Category/)); hit('note:no-category>8', note(/no Account Category.* …\)/)); hit('note:partly-blocked', note(/partly blocked/));
    hit('note:non-inventory', note(/Non-Inventory/)); hit('note:after-cutover', note(/after the cutover/));
    hit('patch:no-location', pat('M_Warehouse', 'Value')); hit('patch:warehouse-no-address', pat('M_Warehouse', 'C_Location_ID')); hit('patch:no-country', pat('C_Location', 'C_Country_ID'));
    hit('patch:vendor-product-no', pat('M_Product_PO', 'VendorProductNo')); hit('patch:category-default', pat('M_Product', 'M_Product_Category_ID'));
    hit('rename:same-no-customer-vendor', (m.renamed || []).some(function (r) { return /the same No\./.test(r.why); })); hit('rename:key-cut', (m.renamed || []).some(function (r) { return /longer than/.test(r.why); }));
    hit('problem:no-gl-setup', (m.problems || []).some(function (p) { return /Add the table/.test(p); })); hit('problem:no-lcy', (m.problems || []).some(function (p) { return /no LCY Code/.test(p); }));
    hit('location:company-address', (c.provenance.C_Location || []).some(function (p) { return p.bc === '79/company'; })); hit('location:ship-to', (c.provenance.C_Location || []).some(function (p) { return /^222\//.test(p.bc); }));
    var wNoAddr = (c.provenance.M_Warehouse || []).length - (c.provenance.C_Location || []).filter(function (p) { return /^14\//.test(p.bc); }).length; hit('location:company-shared', wNoAddr > 1 && (c.provenance.C_Location || []).some(function (p) { return p.bc === '79/company'; }));
    hit('category:parent-first', (c.provenance.M_Product_Category || []).length > 1 && col('M_Product_Category', 'M_Product_Category_Parent_ID>Value', null));
    var e32 = (g.pkg.tables[32] || { rows: [] }).rows, k = {}; e32.forEach(function (e) { var kk = (e['Location Code'] || '') + '|' + e['Item No.']; k[kk] = (k[kk] || 0) + 1; });
    hit('stock:sum-of-several', Object.keys(k).some(function (x) { return k[x] > 1; }) && rows('M_InventoryLine').length);
    hit('stock:zero-sum-dropped', (c.provenance.M_Inventory || []).length && rows('M_InventoryLine').length < Object.keys(k).length);
    hit('stock:no-location', (c.provenance.M_Inventory || []).some(function (p) { return p.key === ''; }));
    hit('price:row', rows('M_ProductPrice').length); hit('account:summary', col('C_ElementValue', 'IsSummary', 'Y')); hit('bp:inactive', col('C_BPartner', 'IsActive', 'N'));
    hit('product:service', col('M_Product', 'ProductType', 'S')); hit('product:inactive', col('M_Product', 'IsActive', 'N')); hit('term:netdays', col('C_PaymentTerm', 'NetDays', null));
    hit('po:item-vendor-table', (c.provenance.M_Product_PO || []).some(function (p) { return p.bc === 99; })); hit('user:contact', rows('AD_User').length);
    return H;
  }
  var ORDERI = function (t) { return CV.ORDER.indexOf(t); };
  var BALL = ['refuse:shipto-no-customer', 'refuse:po-missing', 'refuse:bin-no-location', 'refuse:undated-entry', 'note:complex-term', 'note:no-category', 'note:no-category>8', 'note:partly-blocked', 'note:non-inventory',
    'note:after-cutover', 'patch:no-location', 'patch:warehouse-no-address', 'patch:no-country', 'patch:vendor-product-no', 'patch:category-default', 'rename:same-no-customer-vendor', 'rename:key-cut',
    'problem:no-gl-setup', 'problem:no-lcy', 'location:company-address', 'location:ship-to', 'location:company-shared', 'category:parent-first', 'stock:sum-of-several', 'stock:zero-sum-dropped', 'stock:no-location',
    'price:row', 'account:summary', 'bp:inactive', 'product:service', 'product:inactive', 'term:netdays', 'po:item-vendor-table', 'user:contact'];
  var BN = Number(process.env.MIGE_BC_N || 300), bbad = 0, bfirst = null, bcover = {}, bcells = 0;
  for (var bi = 1; bi <= BN; bi++) { var bg = bgen(bi), ba = BREF.convert(bg.pkg, BMODEL, bg.opts), bb = BSHIP.convert(bg.pkg, BMODEL, bg.opts), bd = diff(ba, bb);
    bcells += ba.book.reduce(function (n, s) { return n + s.rows.length * s.rows[0].length; }, 0); Object.keys(bbranches(bg, ba)).forEach(function (k) { bcover[k] = (bcover[k] || 0) + 1; });
    if (bd.length) { bbad++; if (!bfirst) bfirst = { seed: bi, opts: bg.opts, diffs: bd.slice(0, 12) }; } }
  if (bfirst) say('  §MIGE-BC-DIFF first seed=' + bfirst.seed + ' ' + J(bfirst).slice(0, 3000));
  say('§MIGE-BC-DIFF cases=' + BN + ' cells=' + bcells + ' differing_cases=' + bbad);
  check('BC-DIFF', 'equal', 'on ' + BN + ' generated packages the engine result == the hand converter result (book cells, manifest, provenance)', bbad === 0, bfirst);
  BALL.forEach(function (k) { say('  §MIGE-BC-COVER branch=' + k + (bcover[k] ? ' cases=' + bcover[k] : ' INCONCLUSIVE — no case hit it')); });
  var bmissed = BALL.filter(function (k) { return !bcover[k]; }); missed = missed.concat(bmissed.map(function (k) { return 'bc:' + k; }));
  say('§MIGE-BC-COVER hit=' + (BALL.length - bmissed.length) + '/' + BALL.length + (bmissed.length ? ' INCONCLUSIVE=' + bmissed.join(',') : ''));
  verdict('BC-DIFF');
  var BMUT = [
    ['rename-removed', function (t) { t.entities.C_BPartner.forEach(function (b) { delete b.rename; }); }],
    ['zero-sum-kept', function (t) { delete t.entities.M_InventoryLine.group.having; }],
    ['po-once-removed', function (t) { t.entities.M_Product_PO.forEach(function (b) { delete b.once; }); }],
    ['category-sort-removed', function (t) { delete t.entities.M_Product_Category.sort; }],
    ['later-counted-as-refusal', function (t) { var r = t.entities.M_InventoryLine.refuse[1]; delete r.silent; r.why = 'later'; }],
    ['company-address-ignored', function (t) { t.defs.coAddr = false; }]];
  BMUT.forEach(function (mu) { var t = JSON.parse(JSON.stringify(BTPL)); mu[1](t); var found = 0; for (var i = 1; i <= Math.min(BN, 200) && !found; i++) { var g = bgen(i); if (diff(BREF.convert(g.pkg, BMODEL, g.opts), bengine(t, g.pkg, g.opts)).length) found = i; }
    check('BC-MUTANT', mu[0], 'the template with "' + mu[0] + '" differs from the hand converter on some generated package (the BC diff can fail)', found > 0, 'no seed found a difference'); if (found) say('  §MIGE-MUTANT bc:' + mu[0] + ' caught at seed=' + found); });
  verdict('BC-MUTANT');

  // ═══ ODOO-OPEN (§E3C-SPEC): the open balances at the cut-over — templates/odoo-17.json on the agent's RAW odoo_export.json ═══
  // There is no hand converter to equal here (the mapping was never hand code), so the oracle is this witness's own plain reading of §E3C-SPEC 1(c), computed straight from the raw
  // rows — never through the engine. OPEN = the recorded export of the live demo (fixtures/odoo_export_2026-11-10); OPEN-GEN = seeded variants of those rows (a currency changed,
  // a partner held or unknown, a move split in two lines, a long number, a zero balance) so the branches the demo never shows are judged too; OPEN-MUTANT = the template damaged.
  var OTPL = JSON.parse(fs.readFileSync(path.join(ERP, 'migrate', 'templates', 'odoo-17.json'), 'utf8')), OEXP = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'odoo_export_2026-11-10', 'odoo_export.json'), 'utf8'));
  var oengine = function (tpl, exp) { return EN.run(tpl, CN.exportJson(exp, tpl.connector), {}); };
  var cents = function (v) { return Math.round(Number(v) * 100); };
  function oracle(exp) {
    var V0 = OTPL.variables, acct = {}, pk = {}, mv = {}; exp.sets['account.account'].forEach(function (a) { acct[a.id] = a; }); exp.sets.partner_keys.forEach(function (k) { pk[k.id] = k; }); exp.sets.open_moves.forEach(function (m) { mv[m.id] = m; });
    var CLS = { asset_receivable: 'AR', liability_payable: 'AP', asset_cash: 'BANK' }, CLEAR = { AR: V0.AR_CLEARING, AP: V0.AP_CLEARING, BANK: V0.BANK_CLEARING }, cls = { AR: 0, AP: 0, BANK: 0 };
    var journal = []; exp.sets.tb.forEach(function (r) { var c = cents(r.balance); if (!c) return; var k = CLS[acct[r.account_id].account_type]; if (k) cls[k] += c;
      journal.push([k ? CLEAR[k] : acct[r.account_id].code, c > 0 ? c : 0, c < 0 ? -c : 0]); });
    var KIND = { out_invoice: ['AR Invoice', 'Y', 1], out_refund: ['AR Credit Memo', 'Y', -1], in_invoice: ['AP Invoice', 'N', -1], in_refund: ['AP CreditMemo', 'N', 1] };
    var byMove = {}, order = [], refused = 0, left = { AR: 0, AP: 0 };
    exp.sets.open_lines.forEach(function (l) { var K = KIND[l.move_type], p = pk[l.partner_id], k = CLS[acct[l.account_id].account_type];
      if (!K || String(l.currency_id) !== String(l.company_currency_id) || !p || p.held || !p.value || String(l.move_name).length > 30) { refused++; left[k] += cents(l.amount_residual); return; }
      if (!byMove[l.move_id]) { byMove[l.move_id] = { no: l.move_name, type: K[0], so: K[1], bp: p.value, date: l.invoice_date || l.date, term: String((mv[l.move_id] || {}).invoice_payment_term_id__name || '').slice(0, 40),
        charge: K[1] === 'Y' ? V0.CHARGE_AR : V0.CHARGE_AP, amt: 0, cls: k, sign: K[2] }; order.push(l.move_id); }
      byMove[l.move_id].amt += cents(l.amount_residual) * K[2]; });
    return { journal: journal, cls: cls, invoices: order.map(function (id) { return byMove[id]; }), refused: refused, left: left };
  }
  function judgeOpen(tpl, exp) {   // -> the list of claims that do NOT hold (empty = the template maps this export exactly)
    var bad = [], r; try { r = oengine(tpl, exp); } catch (e) { return ['threw: ' + e.message]; }
    var O = oracle(exp), sh = function (t) { return r.book.filter(function (b) { return b.name.slice(2) === t; })[0]; }, G = sh('I_GLJournal'), I = sh('I_Invoice');
    if (!G || !I) return ['no open sheets'];
    var gx = function (h) { return G.rows[0].indexOf(h); }, ix = function (h) { return I.rows[0].indexOf(h); }, gr = G.rows.slice(1), ir = I.rows.slice(1), cut = exp.manifest.cutover;
    var dr = gr.reduce(function (n, x) { return n + cents(x[gx('AmtSourceDr')]); }, 0), cr = gr.reduce(function (n, x) { return n + cents(x[gx('AmtSourceCr')]); }, 0);
    var tbBalanced = !exp.sets.tb.reduce(function (n, x) { return n + cents(x.balance); }, 0);
    if (tbBalanced && dr !== cr) bad.push('journal-balanced dr=' + dr + ' cr=' + cr);
    if (J(gr.map(function (x) { return [x[gx('AccountValue')], cents(x[gx('AmtSourceDr')]), cents(x[gx('AmtSourceCr')])]; })) !== J(O.journal)) bad.push('journal-per-account');
    if (gr.some(function (x) { return x[gx('DateAcct')] !== cut || x[gx('DocTypeName')] !== 'GL Journal' || x[gx('CategoryName')] !== 'Manual' || x[gx('PostingType')] !== 'A' || x[gx('I_IsImported')] !== 'N' || x[gx('ISO_Code')] !== exp.manifest.currency; })) bad.push('journal-header');
    if (new Set(gr.map(function (x) { return x[gx('BatchDocumentNo')] + '|' + x[gx('JournalDocumentNo')]; })).size > 1) bad.push('journal-one-batch');
    var got = ir.map(function (x) { return [x[ix('DocumentNo')], x[ix('DocTypeName')], x[ix('IsSOTrx')], x[ix('BPartnerValue')], x[ix('DateInvoiced')], x[ix('PaymentTermValue')], x[ix('ChargeName')], cents(x[ix('PriceActual')])]; });
    var want = O.invoices.map(function (v) { return [v.no, v.type, v.so, v.bp, v.date, v.term, v.charge, v.amt]; });
    if (J(got) !== J(want)) bad.push('invoice-per-move');
    if (ir.some(function (x) { return x[ix('DateAcct')] !== cut || x[ix('QtyOrdered')] !== '1' || x[ix('TaxIndicator')] !== tpl.variables.TAX_NONE || x[ix('I_IsImported')] !== 'N'; })) bad.push('invoice-line');
    var refN = (r.manifest.refused || []).filter(function (x) { return x.sheet === 'I_Invoice'; }).reduce(function (n, x) { return n + x.n; }, 0);
    if (refN !== O.refused) bad.push('refused n=' + refN + ' oracle=' + O.refused);
    // the arithmetic that makes the clearing accounts end at zero: journal(class) == Σ documents of the class (signed) + what was refused
    ['AR', 'AP'].forEach(function (k) { var docs = O.invoices.filter(function (v) { return v.cls === k; }).reduce(function (n, v) { return n + v.amt * v.sign; }, 0);
      var jr = gr.filter(function (x) { return x[gx('AccountValue')] === tpl.variables[k + '_CLEARING']; }).reduce(function (n, x) { return n + cents(x[gx('AmtSourceDr')]) - cents(x[gx('AmtSourceCr')]); }, 0);
      if (jr !== O.cls[k]) bad.push('class-' + k + ' journal=' + jr + ' source=' + O.cls[k]);
      var lines = exp.sets.open_lines.filter(function (l) { return ({ asset_receivable: 'AR', liability_payable: 'AP' })[(exp.sets['account.account'].filter(function (a) { return a.id === l.account_id; })[0] || {}).account_type] === k; }).reduce(function (n, l) { return n + cents(l.amount_residual); }, 0);
      if (docs + O.left[k] !== lines) bad.push('open-' + k + ' docs=' + docs + ' left=' + O.left[k] + ' lines=' + lines); });
    if (r.book.slice(0, 17).some(function (b) { return b.rows.length !== 1; })) bad.push('masters-touched');
    return bad;
  }
  var ol = true, olw = ''; try { EN.load(OTPL); } catch (e) { ol = false; olw = e.message; }
  check('ODOO-OPEN', 'template', 'odoo-17.json loads (find / round / abs / sumSet and the two open sheets are in the closed sets)', ol, olw);
  var OC = function () { return JSON.parse(JSON.stringify(OTPL)); };
  [['find-arity', function (t) { t.defs.bpValue = { find: ['partner_keys', 'id', '$partner_id'] }; }, /find takes 4 argument/],
   ['unknown-open-sheet', function (t) { t.entities.I_Payment = { from: 'open_lines', fields: {} }; }, /"I_Payment" is not a target sheet/],
   ['open-forward-ref', function (t) { t.entities.I_GLJournal.where = { count: 'I_Invoice' }; }, /before it is produced/],
   ['open-bad-column', function (t) { t.entities.I_Invoice.fields.GrandTotal = 1; }, /"GrandTotal" is not a column of I_Invoice/]].forEach(function (b) { var t = OC(); b[1](t); var msg = ''; try { EN.load(t); } catch (e) { msg = e.message; }
    check('ODOO-OPEN', b[0], 'a template with a ' + b[0] + ' is REFUSED at load, naming it', b[2].test(msg), msg || 'loaded'); });
  var ocn = CN.exportJson(OEXP, OTPL.connector), ofc = EN.fieldCheck(OTPL, ocn.model).filter(function (f) { return !f.ok || !f.known; });
  check('ODOO-OPEN', 'fields', 'every $Field the template reads is a field the agent said it read (manifest.sets[].fields_read) — nothing guessed', ofc.length === 0 && ocn.problems.length === 0, { outside: ofc, problems: ocn.problems });
  var or0 = oengine(OTPL, OEXP), oo = oracle(OEXP), ob = judgeOpen(OTPL, OEXP);
  say('§MIGE-ODOO-OPEN recorded: tb_rows=' + OEXP.sets.tb.length + ' journal_lines=' + oo.journal.length + ' AR=' + (oo.cls.AR / 100).toFixed(2) + ' AP=' + (oo.cls.AP / 100).toFixed(2) + ' BANK=' + (oo.cls.BANK / 100).toFixed(2) +
    ' open_lines=' + OEXP.sets.open_lines.length + ' documents=' + oo.invoices.length + ' refused=' + oo.refused + ' left_AR=' + (oo.left.AR / 100).toFixed(2) + ' left_AP=' + (oo.left.AP / 100).toFixed(2) + ' sheets=' + or0.book.slice(17).map(function (b) { return b.name + ':' + (b.rows.length - 1); }).join(','));
  check('ODOO-OPEN', 'recorded', 'on the recorded export every claim of §E3C-SPEC 1(c) holds against the oracle computed from the raw rows: journal balanced, per account, one batch at the cut-over; one document per open invoice / credit note with its own number, date, partner, kind, charge and unpaid amount; refused lines counted; journal(AR/AP) == documents + refused (the clearing arithmetic); the 17 master sheets untouched', ob.length === 0, ob);
  check('ODOO-OPEN', 'non-vacuous', 'the recorded export really carries what is judged: >= 1 journal line per class AR / AP / BANK, >= 1 document of each of the 4 kinds, >= 1 refused line', !!oo.cls.AR && !!oo.cls.AP && !!oo.cls.BANK && ['AR Invoice', 'AR Credit Memo', 'AP Invoice', 'AP CreditMemo'].every(function (k) { return oo.invoices.some(function (v) { return v.type === k; }); }) && oo.refused > 0, { cls: oo.cls, refused: oo.refused });
  check('ODOO-OPEN', 'manifest', 'the manifest lists the two open sheets with their tables and row counts, names the refusal and says in a note what stays on the clearing accounts', or0.manifest.sheets.length === 19 && or0.manifest.sheets[17].table === 'I_GLJournal' && or0.manifest.sheets[17].rows === oo.journal.length && or0.manifest.sheets[18].table === 'I_Invoice' && or0.manifest.sheets[18].rows === oo.invoices.length && (or0.manifest.refused || []).length === 1 && (or0.manifest.notes || []).some(function (n) { return /NOT brought in/.test(n); }), { sheets: or0.manifest.sheets.slice(17), refused: or0.manifest.refused, notes: or0.manifest.notes });
  check('ODOO-OPEN', 'masters-only-templates', 'a template without open entities still returns exactly 17 sheets (SAP guide run above: ' + b.book.length + ')', b.book.length === 17, b.book.length);
  verdict('ODOO-OPEN');
  // OPEN-GEN: seeded variants of the recorded rows
  function ogen(seed) { var R = mulberry32(seed), e = JSON.parse(JSON.stringify(OEXP)), hit = {}, L = e.sets.open_lines, pick = function (a) { return a[Math.floor(R() * a.length)]; };
    if (R() < 0.5) { pick(L).currency_id = 999; hit.foreign = 1; }
    if (R() < 0.5) { var l1 = pick(L); e.sets.partner_keys.filter(function (k) { return k.id === l1.partner_id; })[0].held = 'internal-user'; hit.held = 1; }
    if (R() < 0.4) { var l2 = pick(L); l2.partner_id = 987654; hit.noPartner = 1; }
    if (R() < 0.4) { var l3 = pick(L); var nm = l3.move_name + '/A-VERY-LONG-DOCUMENT-NUMBER-SUFFIX'; L.forEach(function (x) { if (x.move_id === l3.move_id) x.move_name = nm; }); hit.longNo = 1; }
    if (R() < 0.7) { var l4 = pick(L.filter(function (x) { return x.move_type !== 'entry'; })), half = Math.round(l4.amount_residual * 50) / 100, c = Object.assign({}, l4, { id: 100000 + seed, amount_residual: Math.round((l4.amount_residual - half) * 100) / 100 }); l4.amount_residual = half; L.push(c); hit.twoLines = 1; }
    if (R() < 0.5) { var t = pick(e.sets.tb), u = pick(e.sets.tb.filter(function (x) { return x !== t; })); u.balance = Math.round((u.balance + t.balance) * 100) / 100; t.balance = 0; hit.zeroBalance = 1; }
    if (R() < 0.5) { var t2 = pick(e.sets.tb); t2.balance = t2.balance + 1e-9; hit.floatNoise = 1; }
    if (R() < 0.3) { L.forEach(function (x) { if (x.move_type === 'entry') x.move_type = 'out_invoice'; }); hit.noEntry = 1; }
    return { exp: e, hit: hit }; }
  var ON = Math.min(N, 300), obad = 0, ofirst = null, ocover = {}, OALL = ['foreign', 'held', 'noPartner', 'longNo', 'twoLines', 'zeroBalance', 'floatNoise', 'noEntry'];
  for (var oi = 1; oi <= ON; oi++) { var og = ogen(oi), oj = judgeOpen(OTPL, og.exp); Object.keys(og.hit).forEach(function (k) { ocover[k] = (ocover[k] || 0) + 1; }); if (oj.length) { obad++; if (!ofirst) ofirst = { seed: oi, hit: og.hit, bad: oj }; } }
  OALL.forEach(function (k) { say('  §MIGE-ODOO-COVER branch=' + k + ' cases=' + (ocover[k] || 0)); });
  var omissed = OALL.filter(function (k) { return !ocover[k]; }); missed = missed.concat(omissed.map(function (k) { return 'odoo:' + k; }));
  say('§MIGE-ODOO-GEN cases=' + ON + ' differing_cases=' + obad + ' cover=' + (OALL.length - omissed.length) + '/' + OALL.length);
  check('ODOO-OPEN-GEN', 'variants', ON + ' seeded variants of the recorded rows (foreign currency, held / unknown partner, long number, a move in two lines, a zero balance, float noise, no manual entry): the template equals the oracle on every one', obad === 0, ofirst);
  verdict('ODOO-OPEN-GEN');
  [['class-map-entry-removed', function (t) { delete t.valueMaps.acctClass.asset_receivable; }],
   ['credit-note-sign-flipped', function (t) { t.valueMaps.sign.out_refund = 1; }],
   ['group-removed', function (t) { delete t.entities.I_Invoice.group; }],
   ['entry-refusal-removed', function (t) { t.entities.I_Invoice.refuse.shift(); }],
   ['foreign-refusal-removed', function (t) { t.entities.I_Invoice.refuse.splice(1, 1); }],
   ['held-refusal-removed', function (t) { t.entities.I_Invoice.refuse.splice(2, 1); }],
   ['round-removed', function (t) { t.defs.bal = '$balance'; }],
   ['zero-balance-kept', function (t) { delete t.entities.I_GLJournal.where; }],
   ['dateacct-is-the-invoice-date', function (t) { t.entities.I_Invoice.fields.DateAcct = '$date'; }],
   ['credit-side-dropped', function (t) { t.entities.I_GLJournal.fields.AmtSourceCr = 0; }]].forEach(function (mu) { var t = OC(); mu[1](t); var found = judgeOpen(t, OEXP).length ? 'recorded' : 0;
    for (var i = 1; i <= ON && !found; i++) { if (judgeOpen(t, ogen(i).exp).length) found = 'seed=' + i; }
    check('ODOO-OPEN-MUTANT', mu[0], 'the template with "' + mu[0] + '" breaks a claim on the recorded export or on a variant (the open-balance checks can fail)', !!found, 'no case found a difference'); if (found) say('  §MIGE-MUTANT odoo:' + mu[0] + ' caught at ' + found); });
  verdict('ODOO-OPEN-MUTANT');

  // ═══ ODOO-REF (§ODOO-ENGINE-SPEC O1): the agent's RAW master sets + the frozen oracle (fixtures/odoo_convert_reference.mjs = the mapping half of export.js, moved verbatim) ═══
  // Issue proven: the mapping was moved out of the agent WITHOUT changing a cell — convert(raw odoo_export.json) == the workbook, manifest.json and provenance.json the agent wrote in the
  // same run. The oracle is never edited to pass; template work (O2) is judged against it. ODOO-REF = the live demo (odoodemo); ODOO-REF-MESSY = the messy copy, only if it was recorded.
  var CONV = await import(url.pathToFileURL(path.join(__dirname, 'fixtures', 'odoo_convert_reference.mjs')).href);
  function refBook(file) { var wb = XLSX.read(fs.readFileSync(file)); return wb.SheetNames.map(function (n) { return { name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true }) }; }); }
  function refDiff(book, ref) {   // every differing cell: sheet, row, column, both values (as the workbook shows them: strings)
    var d = [], n = Math.max(book.length, ref.length);
    for (var si = 0; si < n; si++) { var a = book[si], b = ref[si]; if (!a || !b || a.name !== b.name) { d.push({ sheet: (a || {}).name + ' vs ' + (b || {}).name, why: 'sheet missing or renamed' }); continue; }
      var rn = Math.max(a.rows.length, b.rows.length); for (var ri = 0; ri < rn; ri++) { var ra = a.rows[ri] || [], rb = b.rows[ri] || [], cn = Math.max(ra.length, rb.length);
        for (var ci = 0; ci < cn; ci++) { var va = ra[ci] === undefined || ra[ci] === null ? '' : String(ra[ci]), vb = rb[ci] === undefined || rb[ci] === null ? '' : String(rb[ci]);
          if (va !== vb) d.push({ sheet: a.name, row: ri + 1, col: ci + 1, header: (a.rows[0] || [])[ci], oracle: va, workbook: vb }); } } }
    return d;
  }
  var jr = function (x) { return canon(JSON.parse(JSON.stringify(x))); };
  function refJudge(dir, exp, r) {   // -> { book: [differences], manifest: [differing keys], provenance: [differing sheets] }
    var refM = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), refP = JSON.parse(fs.readFileSync(path.join(dir, 'provenance.json'), 'utf8')), mk = [];
    Object.keys(Object.assign({}, refM, r.manifest)).forEach(function (k) { if (k !== 'tool' && !same(jr(r.manifest[k]), refM[k])) mk.push(k); });
    var pv = Object.keys(Object.assign({}, refP, r.provenance)).filter(function (k) { return !same(jr(r.provenance[k]), refP[k]); });
    return { book: refDiff(r.book, refBook(path.join(dir, 'odoo_migration.xlsx'))), manifest: mk, provenance: pv, refM: refM };
  }
  function refCase(cs, dir) {
    var exp = JSON.parse(fs.readFileSync(path.join(dir, 'odoo_export.json'), 'utf8')), r = CONV.convert(exp), j = refJudge(dir, exp, r);
    say('§MIGE-' + cs + ' dir=' + path.basename(dir) + ' sheets=' + r.book.length + ' rows=' + r.book.reduce(function (n, s) { return n + s.rows.length - 1; }, 0) + ' book_diffs=' + j.book.length + ' manifest_diffs=' + j.manifest.length + ' provenance_diffs=' + j.provenance.length);
    j.book.slice(0, 40).forEach(function (x) { say('  §MIGE-' + cs + '-CELL ' + J(x)); });
    check(cs, 'book', 'convert(odoo_export.json) equals the recorded odoo_migration.xlsx, all 17 sheets, cell for cell (cells compared as the strings the workbook shows)', r.book.length === 17 && j.book.length === 0, j.book.slice(0, 5));
    check(cs, 'manifest', 'convert(...).manifest equals manifest.json on every key except "tool" (format, workbook, odoo_version, db, cutover, currency, company, company_id, other_companies, sheets, source_counts, patches, renamed, held, notes, self_check_fails)', j.manifest.length === 0, j.manifest);
    check(cs, 'provenance', 'convert(...).provenance equals provenance.json (every sheet row -> its Odoo record)', j.provenance.length === 0, j.provenance);
    var filled = r.book.filter(function (s) { return s.rows.length > 1; }).length;
    check(cs, 'non-vacuous', 'the recording really carries what is judged: rows in >= 15 of the 17 sheets, >= 1 patch, >= 1 held partner, >= 1 note', filled >= 15 && j.refM.patches.length >= 1 && j.refM.held.length >= 1 && j.refM.notes.length >= 1, { filled: filled, patches: j.refM.patches.length, held: j.refM.held.length, notes: j.refM.notes.length });
    var muts = [['every partner\'s VAT number changed', function (e) { e.sets['res.partner'].forEach(function (x) { x.vat = 'CHANGED'; }); }],
      ['a product archived', function (e) { e.sets['product.product'].filter(function (x) { return x.active; })[0].active = false; }],
      ['a payment term renamed', function (e) { e.sets['account.payment.term'][0].name = e.sets['account.payment.term'][0].name + ' (changed)'; }]];
    muts.forEach(function (m) { var e2 = JSON.parse(JSON.stringify(exp)); m[1](e2); var j2 = refJudge(dir, e2, CONV.convert(e2)), n = j2.book.length + j2.manifest.length + j2.provenance.length;
      check(cs, 'falsifier', 'with one mapping input changed (' + m[0] + ') the equality check FAILS (a check that cannot fail is not a witness)', n > 0, { book: j2.book.length, manifest: j2.manifest, provenance: j2.provenance.length }); });
    verdict(cs);
  }
  refCase('ODOO-REF', path.join(__dirname, 'fixtures', 'odoo_export_2026-11-10'));
  var MESSY = path.join(__dirname, 'fixtures', 'odoo_export_messy_2026-11-10');
  if (fs.existsSync(path.join(MESSY, 'odoo_export.json'))) refCase('ODOO-REF-MESSY', MESSY);
  else say('§MIGE-ODOO-REF-MESSY verdict=INCONCLUSIVE (database not on this Odoo)');

  var V = ['LOAD', 'FIELD', 'GUIDE', 'DIFF', 'MUTANT', 'BC-LOAD', 'BC-GUIDE', 'BC-DIFF', 'BC-MUTANT', 'ODOO-OPEN', 'ODOO-OPEN-GEN', 'ODOO-OPEN-MUTANT', 'ODOO-REF'].map(function (k) { var c = CASES[k] || {}; return !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; });
  var overall = V.indexOf('FAIL') >= 0 ? 'FAIL' : (V.indexOf('INCONCLUSIVE') >= 0 || missed.length) ? 'INCONCLUSIVE' : 'PASS';
  say('§MIGE verdict=' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + (missed.length ? ' (DIFF coverage gaps: ' + missed.length + ')' : ''));
  process.exit(overall === 'FAIL' ? 1 : 0);
})().catch(function (e) { say('§MIGE verdict=FAIL threw ' + (e && e.stack || e)); process.exit(1); });
