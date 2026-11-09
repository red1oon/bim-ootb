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

  var V = ['LOAD', 'FIELD', 'GUIDE', 'DIFF', 'MUTANT'].map(function (k) { var c = CASES[k] || {}; return !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; });
  var overall = V.indexOf('FAIL') >= 0 ? 'FAIL' : (V.indexOf('INCONCLUSIVE') >= 0 || missed.length) ? 'INCONCLUSIVE' : 'PASS';
  say('§MIGE verdict=' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + (missed.length ? ' (DIFF coverage gaps: ' + missed.length + ')' : ''));
  process.exit(overall === 'FAIL' ? 1 : 0);
})().catch(function (e) { say('§MIGE verdict=FAIL threw ' + (e && e.stack || e)); process.exit(1); });
