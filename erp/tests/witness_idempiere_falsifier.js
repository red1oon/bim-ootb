#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IDEMPIERE-FALSIFIER (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §IDEMPIERE-FALSIFIER-SPEC). READ THE LOG after every run: every verdict is a §IDF line and the
//   shipped loader's own §NINJA-* / §E1-STOCK lines are printed with it; the exit code is not the evidence. INCONCLUSIVE when nothing was judged. A FAIL here is a legitimate outcome:
//   this witness BUILDS and MEASURES, it does not adjudicate - every difference is reported with its evidence, none is excused, no check is weakened to turn it green.
// THE ISSUE it proves/disproves: legacy iDempiere rows -> the ONE engine on an IDENTITY template -> the ONE shared form loader -> a born twin tenant: does the tenant hold the SOURCE rows back,
//   sheet by sheet and column by column? Every other migration source is judged against an oracle we wrote; here the oracle is the source itself, so an error anywhere in engine, template
//   generator, form loader or model shows as a difference.
// SOURCE = a RECORDED fixture per legacy tenant (fixtures/idempiere_tenant_{gardenworld,pilot}/rows.json, written read-only by tests/record_idempiere_tenant.js); the witness never touches postgres
//   and says which recording it used. TEMPLATE = migrate/templates/idempiere-identity.json, REGENERATED here by tests/gen_idempiere_identity.js and required byte-equal to the committed file.
// SPEC (claims written before the code; each check names the issue it proves):
//   GEN       the committed identity template is byte-equal to what the generator makes from HEADERS + the dictionary (a hand edit is caught); every lookup header resolved to a table.
//   COUNT     the engine's book has, per sheet, as many rows as the fixture's tenant has rows of that table (the engine dropped or invented none).
//   RUN       the book goes to the shared loader exactly as bc_migrate_form.mjs hands it over (workbook + manifest as `Files` of the Odoo form class, units answered by exact name), stage 1 +
//             stage 2, in a freshly born twin tenant. The loader is all-or-nothing: if it refuses rows, the refusals are collected from its own log (sheet, row, its reason), those rows are
//             taken out of the book and the rest is judged - the refused rows are REPORTED, never hidden.
//   SHEET     per sheet, matched by the sheet's natural key (stated per sheet below): row count, then every one of the sheet's HEADERS columns equal: a lookup column compared by the looked-up
//             alternate value on both sides (never by raw id), numbers numerically, dates by day, Y/N as is. One §IDF-SHEET line per sheet with X of N columns equal; up to 3 §IDF-DIFF per column.
//             A sheet with no source row prints INCONCLUSIVE (no source row) - nothing was judged.
//   FALSIFY-COLUMN  one template field swapped for another source column (in a copy) -> that column is named as differing and was NOT differing before; else the witness is blind.
//   FALSIFY-ROW     one source row dropped from the fixture copy the engine reads (the comparison still reads the full fixture) -> the count check names that sheet.
//   VERDICT   PASS only if every judged column of every sheet is equal and every count matches; otherwise FAIL with the list; INCONCLUSIVE if nothing was judged.
// THE LEAD'S RULING, 2026-11-10 (adjudicated after the first run; evidence file:lines as reported with it):
//   The falsification claim proper: "on every row that loads, every column the 17-sheet contract carries equals the source". No engine defect and no loader defect was found.
//   contract-default-only      C_BPartner.C_BP_Group_ID>IsDefault (workbook.mjs:16; ninja_migrate_process.mjs:214 F6; model_master.js:122-129) and a product whose tax category is not the default (workbook.mjs:19; F8 :226). The sheet can only say "the tenant's default". The generator's Y-or-blank choice is ACCEPTED.
//   unit-not-carried           the form maps a source unit to an existing unit and cannot keep a tenant's own (ninja_migrate_process.mjs:54-59, odoo_migrate_form.mjs:88,111). A FORM GAP, named, not fixed here.
//   key-already-in-tenant      the unique index (model_layer.js:358-371) refuses a key the born tenant already holds: correct; that a real migration then loses the file is a named UX gap.
//   import-inventory-renumbers Import Inventory numbers the document and writes its own Description (ImportInventory.java:392-398, processes/ImportInventory.js:157): M_Inventory.DocumentNo / Description and M_InventoryLine.M_Inventory_ID differ by rule.
//   header-without-lines       a header with no line is not carried by the I_Inventory rewrite (odoo_migrate_form.mjs:147).
//   cascade:<class>            a row refused because its parent row was not carried, for <class>.
//   §IDF-COLUMNS = every judged column on every loaded row equals the source EXCEPT columns of class contract-default-only / import-inventory-renumbers, listed by name with row counts.
//   §IDF-COVERAGE = every source row that did not load is attributed to exactly one class above BY A RULE computed from the data (the born tenant held the key; the row's unit has no twin unit; tax
//   category is not the default; the header has no line; the parent row was not carried), never by a hand list; the per-tenant, per-class totals are PINNED below - a row fitting no class, or a total
//   that differs from the pin, is a FAIL naming it (a later engine / loader change that loses or gains a row is caught).
//   FALSIFY-UNATTRIBUTED  a C_Location row dropped from the BOOK after the engine ran -> COVERAGE must FAIL naming that row as fitting no class.
// Command: node erp/tests/witness_idempiere_falsifier.js 2>&1 | tee /tmp/count_logs/idf_final.log          (export NODE_PATH=/home/red1/bim-ootb/tests/node_modules)
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), FIX = path.join(__dirname, 'fixtures');
// PINNED expected totals per tenant and class (rows not loaded) - measured 2026-11-10, adjudicated by the lead.
var PIN = { GardenWorld: { 'cascade:unit-not-carried': 8, 'header-without-lines': 2, 'key-already-in-tenant': 315, 'unit-not-carried': 12 },
  Pilot: { 'cascade:contract-default-only': 13, 'contract-default-only': 4, 'key-already-in-tenant': 6 } };
// columns allowed to differ, by class (sheet|header) - the ruling above
var EXC = { 'C_BPartner|C_BP_Group_ID>IsDefault': 'contract-default-only', 'M_Inventory|DocumentNo': 'import-inventory-renumbers', 'M_Inventory|Description': 'import-inventory-renumbers', 'M_InventoryLine|M_Inventory_ID': 'import-inventory-renumbers' };
var _log = console.log, SHIPPED = [];
console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§(NINJA|MIG-|E1-STOCK|ODOO-FORM run|IMPORT_|PROC-)/.test(l)) SHIPPED.push(l); };   // captured, then printed by shipped() - the shipped § log is primary evidence
function say(s) { _log(s); }
function J(x) { return JSON.stringify(x); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §IDF-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1500))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§IDF-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
function shipped(mark, re) { SHIPPED.slice(mark).filter(function (l) { return re.test(l); }).forEach(function (l) { say('  shipped> ' + l.slice(0, 300)); }); }

// the natural key per sheet - headers (see HEADERS in migrate/workbook.mjs) whose compared values, joined, identify a row on BOTH sides. STATED, per the spec.
var KEYS = { C_UOM: ['Name'], C_PaymentTerm: ['Value'], M_Product_Category: ['Value'], C_ElementValue: ['Value'], C_BPartner: ['Value'], C_Location: ['C_Location_UU'],
  C_BPartner_Location: ['C_BPartner_ID>Value', 'C_Location_ID>C_Location_UU'], AD_User: ['Name', 'C_BPartner_ID>Value'], M_Product: ['Value'], M_Product_PO: ['M_Product_ID>Value', 'C_BPartner_ID>Value'],
  M_PriceList: ['Name'], M_PriceList_Version: ['M_PriceList_ID', 'Name'], M_ProductPrice: ['M_PriceList_Version_ID', 'M_Product_ID>Value'], M_Warehouse: ['Value'], M_Locator: ['M_Warehouse_ID>Value', 'Value'],
  M_Inventory: ['M_Warehouse_ID>Value', 'MovementDate'], M_InventoryLine: ['M_Inventory_ID', 'M_Locator_ID>Value', 'M_Product_ID>Value'] };
var KEYTXT = { M_ProductPrice: 'price list Name + version Name + product Value', M_Inventory: 'warehouse Value + MovementDate (the importer numbers the loaded documents itself, so DocumentNo cannot be the key)',
  M_InventoryLine: 'the header key (warehouse + date) + locator Value + product Value' };

(async function main() {
  var G = require(path.join(ERP, 'genesis.js')), K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  ['ImportInventory.js', 'ImportGLJournal.js', 'ImportInvoice.js'].forEach(function (f) { try { require(path.join(ERP, 'processes', f)); } catch (e) { say('§IDF-LOAD ' + f + ' not loadable: ' + e.message); } });
  var PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js'));
  var GEN = require('./gen_idempiere_identity.js'), E = await import(url.pathToFileURL(path.join(ERP, 'migrate', 'engine.mjs')).href), CN = await import(url.pathToFileURL(path.join(ERP, 'migrate', 'connectors', 'tenant_rows.mjs')).href);
  var NP = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate_process.mjs')).href);
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  function birth(name, dateAcct) {
    var born = G.birthTenant({ clientName: name, currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: name.replace(/\W/g, '') + 'Admin', dateAcct: dateAcct || '2026-11-10', countryId: 100 });
    var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
    G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-10 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
    var R = rb.refs; return { clientId: R.clientId, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:idempiere-falsifier' };
  }
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host);
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate.mjs')).href)); await reg.startBundle('org.kernel.odoo.migrate');
  var CLS = 'org.kernel.odoo.MigrateFromOdoo', D = AF.get(CLS), LOGIN = '2026-11-10';
  function session(S) {
    var withT = function (fn) { return fn(k.q, Object.assign(k.env(S), { date: LOGIN + ' 00:00:00' })); };
    return { S: S, rows: function (params, cur) { var logs = []; var rs = AF.read(withT, function (trx) { var mark = trx.log.length; var r = D.rows(trx, params, cur); logs = trx.log.slice(mark); return r; }); rs.log = logs; return rs; },
      execute: function (params, cur) { var r = AF.execute(withT, CLS, params, cur); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'idempiere_falsifier' }); return r; },
      after: function (params, cur) { var r = AF.executeAfter(withT, CLS, params, cur); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'idempiere_falsifier' }); return r; } };
  }
  // the units: a source unit that exists by exact name in the twin maps to it (the form already suggests exactly that); anything else stays unanswered and the form says so
  //   No exact name: the harness answers with the ONE twin unit whose name differs only in letter case (a user would pick it from the list), and says so (§IDF-UNIT); none -> unanswered, the form refuses.
  var UNITSAID = {};
  function answer(rs, tag) { return rs.map(function (r) { var o = { key: r.key, selected: r.selected };
    if (r.erpunit !== undefined) { o.erpunit = r.erpunit; var u = String(r.item).replace(/^Unit: /, '');
      if (!o.erpunit) { var opts = (r.options && r.options.erpunit || []).filter(function (n) { return n.toLowerCase() === u.toLowerCase(); }); if (opts.length === 1) o.erpunit = opts[0]; }
      var kk = tag + '|' + u; if (!UNITSAID[kk]) { UNITSAID[kk] = 1; say('§IDF-UNIT tenant=' + tag + ' source_unit=' + J(u) + ' answered=' + J(o.erpunit || '') + ' how=' + (r.erpunit ? 'exact name (the form\'s own suggestion)' : o.erpunit ? 'case-insensitive name match (harness answer)' : 'NO ANSWER POSSIBLE') + ' used_by=' + r.infile); } }
    return o; }); }

  // ═══ GEN ═══
  var A = await GEN.analyse(), genTxt = GEN.render(A), committed = fs.readFileSync(GEN.OUT, 'utf8'), TEMPLATE = JSON.parse(committed);
  var unresolved = []; A.order.forEach(function (s) { A.sheets[s].cols.forEach(function (c) { if (c.kind === 'unresolved') unresolved.push(s + '.' + c.header); }); });
  check('GEN', 'byte-equal', 'idempiere-identity.json is byte-equal to the generator output from HEADERS + the dictionary (' + genTxt.length + ' bytes): no hand edit', genTxt === committed, { generated: genTxt.length, committed: committed.length });
  check('GEN', 'resolved', 'every lookup header resolves to a table by the loader\'s own rule (' + A.order.reduce(function (n, s) { return n + A.sheets[s].cols.filter(function (c) { return c.kind === 'lookup'; }).length; }, 0) + ' lookups)', unresolved.length === 0, unresolved);
  verdict('GEN');

  // column type (the loader's own reading of the AD reference) for numeric / date comparison
  var NUMREF = { 11: 1, 12: 1, 13: 1, 18: 1, 19: 1, 21: 1, 22: 1, 25: 1, 29: 1, 30: 1, 31: 1, 35: 1, 37: 1 }, refCache = {};
  function refOf(table, col) { var kk = table + '|' + col; if (!(kk in refCache)) { var r = q('SELECT c.ad_reference_id AS r FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE upper(t.tablename)=upper(?) AND upper(c.columnname)=upper(?)', [table, col])[0]; refCache[kk] = r ? Number(r.r) : 10; } return refCache[kk]; }
  function tb(n) { return String(n).replace(/^\d\d/, ''); }
  function norm(ref, v) {
    if (v == null || v === '') return '';
    if (ref === 15 || ref === 16) return String(v).slice(0, 10);
    if (NUMREF[ref] && /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(String(v).trim())) return String(Number(String(v).trim()));
    return String(v);
  }

  // ═══ the pipeline: fixture -> engine -> shared loader -> born twin tenant -> compared with the SOURCE rows ═══
  async function pipeline(tag, fxEngine, template, fxCompare, opt) {
    opt = opt || {};
    // the twin's calendar year is the year of the source's opening-stock date (a tenant whose stock was counted in 2004 has a 2004 calendar; the period rule itself is not touched)
    var invDates = fxCompare.tables.m_inventory.rows.filter(function (h) { return String(h.ad_client_id) === String(fxCompare.source.client) && fxCompare.tables.m_inventoryline.rows.some(function (l) { return l.m_inventory_id === h.m_inventory_id; }); }).map(function (h) { return String(h.movementdate).slice(0, 10); }).sort();
    var T = birth(tag.replace(/\W/g, ' ') + ' Co', invDates[0]), C = T.clientId, S = session(T), CLIENT = fxCompare.source.client;
    say('§IDF-TENANT tenant=' + tag + ' source=' + fxCompare.source.db + '/' + CLIENT + ' twin_client=' + C + ' twin_calendar_date=' + (invDates[0] || '2026-11-10 (default)'));
    var eng = E.run(template, CN.tenantRows(fxEngine), {}), book = eng.book.map(function (b) { return { name: b.name, rows: b.rows.map(function (r) { return r.slice(); }) }; });
    var man = JSON.parse(JSON.stringify(eng.manifest)), droppedBook = null;
    if (opt.dropBook) { var db0 = book.find(function (b) { return tb(b.name) === opt.dropBook; }); droppedBook = db0.rows.pop(); db0.rows.length; }   // a row lost AFTER the engine ran, which no class can explain
    // what the twin tenant held before the load (born rows are not "loaded")
    var before = {}; function idOf(sh, r) { return sh === 'M_Product_PO' ? r.m_product_id + '|' + r.c_bpartner_id : r[A.sheets[sh].key]; }
    A.order.forEach(function (sh) { before[sh] = {}; q('SELECT * FROM ' + A.sheets[sh].table + ' WHERE ad_client_id=?', [C]).forEach(function (r) { before[sh][idOf(sh, r)] = 1; }); });
    // run, with refusals taken out and reported (the loader is all-or-nothing)
    var unitNo = {}, refused = {}, blocked = null, cur = null, files, rounds = 0, excluded = {};
    function mk() {
      var b2 = book.map(function (b) { return { name: b.name, rows: b.rows.filter(function (r, i) { return i === 0 || !excluded[b.name + '|' + i]; }) }; });
      var m2 = JSON.parse(JSON.stringify(man)); m2.sheets.forEach(function (s) { var b = b2.find(function (x) { return x.name === s.sheet; }); s.rows = b.rows.length - 1; });
      return { Files: [{ name: 'idempiere_migration.xlsx', size: 0, data: NP.bookToWorkbook(b2) }, { name: 'manifest.json', size: 0, data: m2 }] };
    }
    for (; rounds < 12; rounds++) {
      files = mk(); var r1 = S.rows(files, null); cur = answer(r1, tag);
      // a source unit with no ERP unit to answer with: the form refuses the whole file until answered, so the products using it are taken out and reported (the form has no way to keep a unit of its own)
      var noAns = r1.filter(function (r, i) { return r.erpunit !== undefined && !cur[i].erpunit; }).map(function (r) { return String(r.item).replace(/^Unit: /, ''); }), pb = book.find(function (b) { return /M_Product$/.test(b.name); });
      noAns.forEach(function (u) { unitNo[u] = 1; });
      if (noAns.length && pb) { var ui = pb.rows[0].indexOf('C_UOM_ID'), cu = 0; pb.rows.forEach(function (r, i) { if (i && noAns.indexOf(r[ui]) >= 0 && !excluded[pb.name + '|' + i]) { excluded[pb.name + '|' + i] = 1; cu++;
          (refused[tb(pb.name)] = refused[tb(pb.name)] || []).push({ row: i, cells: pb.rows[0].map(function (h, j) { return h + '=' + r[j]; }).filter(function (x) { return !/=$/.test(x); }).slice(0, 5).join('; '), why: 'unit "' + r[ui] + '" has no ERP unit to answer with (the form refuses the file until every used unit is answered)' }); } });
        if (cu) { files = mk(); r1 = S.rows(files, null); cur = answer(r1, tag); } }
      var r2 = S.rows(files, cur);
      var probs = r2.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item; });
      if (probs.length) { blocked = probs; break; }
      var errs = r2.log.filter(function (l) { return /^§NINJA-ERR /.test(l); });
      if (!errs.length) break;
      var fresh = 0;
      errs.forEach(function (l) { var m = /^§NINJA-ERR (\S+) row (\d+)([\s\S]*)$/.exec(l); if (!m) return; var sh = m[1], ri = Number(m[2]) - 1, tgt = sh, idx = ri;   // spreadsheet row n = rows[n-1]
        if (/I_Inventory$/.test(sh)) { tgt = sh.replace(/I_Inventory$/, 'M_InventoryLine'); idx = ri; }   // the I_Inventory sheet has one row per line, in line order
        var kk = tgt + '|' + idx; if (excluded[kk]) return; excluded[kk] = 1; fresh++;
        var b = book.find(function (x) { return x.name === tgt; }), cells = b ? b.rows[idx] : null, hd = b ? b.rows[0] : [];
        (refused[tb(tgt)] = refused[tb(tgt)] || []).push({ row: idx, cells: cells ? hd.map(function (h, i) { return h + '=' + cells[i]; }).filter(function (x) { return !/=$/.test(x); }).slice(0, 5).join('; ') : '?', why: m[3].trim().replace(/\s*\n\s*/g, ' ').slice(0, 240) }); });
      if (!fresh) break;
    }
    // Import Inventory (stage 2) looks product and locator up by SQL; a line whose product or locator did not make it into the tenant would make it throw and roll the whole stage back - those lines are taken out first and reported
    (function () { var lb = book.find(function (b) { return /M_InventoryLine$/.test(b.name); }), pbk = book.find(function (b) { return /M_Product$/.test(b.name); }), lk = book.find(function (b) { return /M_Locator$/.test(b.name); });
      if (!lb || !pbk || !lk) return;
      var hv = function (b, h) { return b.rows[0].indexOf(h); }, okP = {}, okL = {};
      pbk.rows.forEach(function (r, i) { if (i && !excluded[pbk.name + '|' + i]) okP[r[hv(pbk, 'Value')]] = 1; }); lk.rows.forEach(function (r, i) { if (i && !excluded[lk.name + '|' + i]) okL[r[hv(lk, 'Value')]] = 1; });
      q('SELECT value FROM m_locator WHERE ad_client_id=?', [C]).forEach(function (r) { okL[r.value] = 1; });
      lb.rows.forEach(function (r, i) { if (!i || excluded[lb.name + '|' + i]) return; var pv = r[hv(lb, 'M_Product_ID>Value')], lv = r[hv(lb, 'M_Locator_ID>Value')];
        if (!okP[pv] || !okL[lv]) { excluded[lb.name + '|' + i] = 1; (refused[tb(lb.name)] = refused[tb(lb.name)] || []).push({ row: i, cells: lb.rows[0].map(function (h, j) { return h + '=' + r[j]; }).filter(function (x) { return !/=$/.test(x); }).join('; '), why: 'harness pre-check of Import Inventory\'s own lookups (ImportInventory.java:221-298): ' + (!okP[pv] ? 'product ' + pv + ' is not in the tenant (refused earlier)' : 'locator ' + lv + ' is not in the tenant (refused earlier)') }); } });
      files = mk(); })();
    say('§IDF-RUN tenant=' + tag + ' dry_rounds=' + (rounds + 1) + ' refused_rows=' + Object.keys(refused).reduce(function (n, s) { return n + refused[s].length; }, 0) + (blocked ? ' BLOCKED=' + J(blocked) : ''));
    Object.keys(refused).sort().forEach(function (sh) { var g = {}; refused[sh].forEach(function (x) { var kk = x.why.replace(/Detail: Key.*$/, '').replace(/="[^"]*"/g, '="…"'); (g[kk] = g[kk] || []).push(x); });   // grouped by cause: count + 3 examples
      Object.keys(g).forEach(function (kk) { say('§IDF-REFUSED tenant=' + tag + ' sheet=' + sh + ' rows=' + g[kk].length + ' reason="' + kk.trim() + '"'); g[kk].slice(0, 3).forEach(function (x) { say('  §IDF-REFUSED-EG tenant=' + tag + ' sheet=' + sh + ' row=' + x.row + ' why="' + x.why + '" cells=[' + x.cells + ']'); }); }); });
    var res = { ok: false, msg: 'not run: ' + J(blocked) }, aft = { ok: false, msg: 'stage 1 not done' };
    var mark = SHIPPED.length;
    if (!blocked) { res = S.execute(files, cur);
      // legacy's period rule (MPeriod.isOpen) refuses a document in a closed period: the USER opens the period of the opening-stock date with Period Status (AD_Process 167), as OB's PERIOD-OPEN does. The rule itself is untouched.
      if (res.ok && invDates[0]) { var pr = q("SELECT c_period_id AS id, name AS n FROM c_period WHERE ad_client_id=? AND date(startdate)<=date(?) AND date(enddate)>=date(?)", [C, invDates[0], invDates[0]])[0], p167 = q('SELECT classname AS c, name AS n FROM ad_process WHERE ad_process_id=167')[0];
        try { require(path.join(ERP, 'processes', 'PeriodStatus.js')); } catch (e) { say('§IDF-LOAD PeriodStatus.js not loadable: ' + e.message); }
        var op = pr ? k.inTrx(T, {}, function (trx) { var as = trx.find('c_acctschema', { ad_client_id: C })[0]; trx.update('c_acctschema', as, { autoperiodcontrol: 'N' });   // the user unticks Automatic Period Control, then opens the period (as OB's PERIOD-OPEN)
          var rr = AP.runJava(k.q, trx.env, { AD_Process_ID: 167, className: p167.c, title: p167.n, Record_ID: pr.id, Table_ID: 142, params: { PeriodAction: 'O' }, trx: trx }); return { ok: !!rr.ok, summary: String(rr.summary || '').slice(0, 120) }; }) : null;
        say('§IDF-PERIOD tenant=' + tag + ' opened period=' + J(pr && pr.n) + ' for the opening-stock date ' + invDates[0] + ' (Automatic Period Control unticked first) via Period Status (167): ' + J(op && [op.ok, op.summary])); }
      aft = res.ok ? S.after(files, cur) : { ok: false, msg: 'stage 1 refused' }; }
    say('§IDF-RUN tenant=' + tag + ' stage1 ok=' + res.ok + ' msg=' + String(res.msg).slice(0, 300));
    say('§IDF-RUN tenant=' + tag + ' stage2 ok=' + aft.ok + ' msg=' + String(aft.msg).slice(0, 500));
    shipped(mark, /^§(NINJA-(FIX|DONE|SKIP)|E1-STOCK|PROC-(EXCEPTION|SQL|UNPORTED))/);

    // ── the comparison ──
    var srcT = fxCompare.tables;
    function srcById(table) { var key = table + '_id', m = {}; (srcT[table] ? srcT[table].rows : []).forEach(function (r) { m[r[key]] = r; }); return m; }
    var srcIdx = {}; function srcRow(table, id) { if (!srcIdx[table]) srcIdx[table] = srcById(table); return srcIdx[table][id]; }
    var twinCache = {}; function twinRow(table, id) { var kk = table + '|' + id; if (!(kk in twinCache)) twinCache[kk] = q('SELECT * FROM ' + table + ' WHERE ' + table + '_id=?', [id])[0] || null; return twinCache[kk]; }
    var SIDE = { source: srcRow, loaded: twinRow };
    // the compared value of one header of one row on one side
    function cell(sh, c, row, side) {
      var raw = row[c.col];
      if (c.kind === 'plain') return norm(refOf(sh, c.col), raw);
      if (raw == null || raw === '') return '';
      var t = SIDE[side](c.target, raw); if (!t) return '#NOROW(' + c.target + ' ' + raw + ')';
      return norm(refOf(c.target, c.alt), t[c.alt]);
    }
    function cmpRow(sh, row, side) { var o = {}; A.sheets[sh].cols.forEach(function (c) { o[c.header] = cell(sh, c, row, side); }); return o; }
    function keyOf(sh, row, side) {
      var cm = cmpRow(sh, row, side), parts = KEYS[sh].map(function (h) { return cm[h]; });
      if (sh === 'M_ProductPrice') { var v = SIDE[side]('m_pricelist_version', row.m_pricelist_version_id), l = v ? SIDE[side]('m_pricelist', v.m_pricelist_id) : null; parts.unshift(l ? l.name : '#NOLIST'); }
      if (sh === 'M_InventoryLine') { var h = SIDE[side]('m_inventory', row.m_inventory_id); parts[0] = h ? keyOf('M_Inventory', h, side) : '#NOHEADER'; }
      return parts.join('␟');
    }
    var out = {}, tenantFail = [], clsOf = {}, cov = {}, unattr = [];
    function classify(sh, r, cm, bornHit) {
      if (bornHit) return 'key-already-in-tenant';
      if (sh === 'C_UOM') return 'unit-not-carried';
      if (sh === 'M_Product') { if (unitNo[cm['C_UOM_ID']]) return 'unit-not-carried'; if (cm['C_TaxCategory_ID>IsDefault'] !== 'Y') return 'contract-default-only'; }
      if (sh === 'M_Inventory' && !(srcT.m_inventoryline.rows.some(function (l) { return l.m_inventory_id === r.m_inventory_id; }))) return 'header-without-lines';
      var cols = A.sheets[sh].cols;
      for (var i = 0; i < cols.length; i++) { var c = cols[i]; if (c.kind !== 'lookup' || r[c.col] == null) continue; var pc = clsOf[c.target] && clsOf[c.target][r[c.col]];
        if (pc && pc !== 'key-already-in-tenant') return pc === 'unattributed' ? 'unattributed' : 'cascade:' + pc.replace(/^cascade:/, ''); }   // a parent the born tenant already holds is present: it explains nothing about this row
      return 'unattributed';
    }
    var oneLine = [];
    A.order.forEach(function (sh) {
      var S0 = A.sheets[sh], N = A.headers[sh].length, own = (srcT[S0.table] ? srcT[S0.table].rows : []).filter(function (r) { return String(r.ad_client_id) === String(CLIENT); });
      var loadedRows = q('SELECT * FROM ' + S0.table + ' WHERE ad_client_id=?', [C]).filter(function (r) { return !before[sh][idOf(sh, r)]; });
      var nRef = (refused[sh] || []).length, st = { sheet: sh, source: own.length, loaded: loadedRows.length, refused: nRef, N: N, diffCols: [], matched: 0, unmatchedSource: 0, extraLoaded: 0, dupKeys: 0, examples: {}, nDiff: {}, verdict: '' };
      out[sh] = st;
      if (!own.length) { st.verdict = 'INCONCLUSIVE'; say('§IDF-SHEET tenant=' + tag + ' sheet=' + sh + ' source_rows=0 loaded=' + loadedRows.length + ' refused=' + nRef + ' INCONCLUSIVE (no source row) key=' + KEYS[sh].join('+')); return; }
      var L = {}; loadedRows.forEach(function (r) { var kk = keyOf(sh, r, 'loaded'); (L[kk] = L[kk] || []).push(r); });
      var used = {}, cols = A.sheets[sh].cols, bornByKey = {}; st.preExisting = 0; st.preDiff = {};
      q('SELECT * FROM ' + S0.table + ' WHERE ad_client_id=?', [C]).filter(function (r) { return before[sh][idOf(sh, r)]; }).forEach(function (r) { bornByKey[keyOf(sh, r, 'loaded')] = r; });
      own.forEach(function (r) {
        var kk = keyOf(sh, r, 'source'), list = L[kk]; used[kk] = used[kk] || 0;
        if (list && list.length > 1 && used[kk] === 0) st.dupKeys++;
        var lr = list && list[used[kk]]; if (!lr) { st.unmatchedSource++;
          var cls = classify(sh, r, cmpRow(sh, r, 'source'), !!bornByKey[kk]); (clsOf[S0.table] = clsOf[S0.table] || {})[r[S0.key]] = cls; var cv = cov[cls] = cov[cls] || { rows: 0, sheets: {} }; cv.rows++; cv.sheets[sh] = 1; if (cls === 'unattributed') unattr.push({ sheet: sh, key: kk.replace(/␟/g, ' | ') }); (st.examples.__unmatched = st.examples.__unmatched || []).push(kk.replace(/␟/g, ' | '));
          var pre = bornByKey[kk]; if (pre) { st.preExisting++; var sc0 = cmpRow(sh, r, 'source'), pc0 = cmpRow(sh, pre, 'loaded'); cols.forEach(function (c) { if (sc0[c.header] !== pc0[c.header]) st.preDiff[c.header] = (st.preDiff[c.header] || 0) + 1; }); } return; }
        used[kk]++; st.matched++;
        var sc = cmpRow(sh, r, 'source'), lc = cmpRow(sh, lr, 'loaded');
        cols.forEach(function (c) { if (sc[c.header] !== lc[c.header]) { st.nDiff[c.header] = (st.nDiff[c.header] || 0) + 1; var ex = st.examples[c.header] = st.examples[c.header] || [];
          if (ex.length < 3) ex.push({ key: kk.replace(/␟/g, ' | '), source: sc[c.header], loaded: lc[c.header] }); } });
      });
      Object.keys(L).forEach(function (kk) { var n = L[kk].length - (used[kk] || 0); if (n > 0) st.extraLoaded += n; });
      st.diffCols = A.headers[sh].filter(function (h) { return st.nDiff[h]; });
      var countOk = st.loaded === st.source && st.unmatchedSource === 0 && st.extraLoaded === 0;
      st.verdict = (!st.matched && st.source) ? 'FAIL' : (st.diffCols.length || !countOk) ? 'FAIL' : 'PASS';
      var X = st.matched ? N - st.diffCols.length : 0;
      say('§IDF-SHEET tenant=' + tag + ' sheet=' + sh + ' key=' + KEYS[sh].join('+') + (KEYTXT[sh] ? ' (' + KEYTXT[sh] + ')' : '') + ' source_rows=' + st.source + ' loaded=' + st.loaded + ' refused=' + nRef + ' matched=' + st.matched + ' unmatched_source=' + st.unmatchedSource +
        ' extra_loaded=' + st.extraLoaded + (st.dupKeys ? ' duplicate_keys=' + st.dupKeys : '') + ' count_ok=' + countOk + ' columns X=' + (st.matched ? X : 'unjudged') + ' N=' + N + ' differing_columns=' + J(st.diffCols) + ' verdict=' + st.verdict);
      st.diffCols.forEach(function (h) { st.examples[h].forEach(function (e) { say('§IDF-DIFF tenant=' + tag + ' sheet=' + sh + ' key=' + e.key + ' column=' + h + ' rows_differing=' + st.nDiff[h] + ' source=' + J(e.source) + ' loaded=' + J(e.loaded)); }); });
      if (st.preExisting) say('§IDF-PREEXIST tenant=' + tag + ' sheet=' + sh + ' unmatched_source_rows_already_in_the_born_tenant=' + st.preExisting + ' of_unmatched=' + st.unmatchedSource + ' differing_columns_vs_the_born_row=' + J(st.preDiff));
      if (st.examples.__unmatched) say('§IDF-UNMATCHED tenant=' + tag + ' sheet=' + sh + ' count=' + st.unmatchedSource + ' examples=' + J(st.examples.__unmatched.slice(0, 3)));
    });
    Object.keys(cov).sort().forEach(function (c) { say('§IDF-COVERAGE tenant=' + tag + ' class=' + c + ' rows=' + cov[c].rows + ' sheets=' + J(Object.keys(cov[c].sheets))); });
    unattr.forEach(function (u) { say('§IDF-UNATTRIBUTED tenant=' + tag + ' sheet=' + u.sheet + ' key=' + J(u.key) + ' fits no adjudicated class'); });
    return { cov: cov, unattr: unattr, droppedBook: droppedBook, out: out, refused: refused, blocked: blocked, res: res, aft: aft, eng: eng, tenant: C };
  }

  function covVerdict(cov, pin, unattr) {
    var why = [], names = {}; Object.keys(cov).forEach(function (c) { names[c] = 1; }); Object.keys(pin || {}).forEach(function (c) { names[c] = 1; });
    (unattr || []).forEach(function (u) { why.push('row fits no class: ' + u.sheet + ' ' + J(u.key)); });
    Object.keys(names).sort().forEach(function (c) { if (c === 'unattributed') return; var got = cov[c] ? cov[c].rows : 0, want = pin && pin[c] != null ? pin[c] : 0; if (got !== want) why.push('class ' + c + ' rows=' + got + ' pinned=' + want); });
    return { ok: !why.length, why: why };
  }
  var summary = {};
  var SRC = [['gardenworld', 'GardenWorld'], ['pilot', 'Pilot']];
  var FXS = {};
  for (var si = 0; si < SRC.length; si++) {
    var dir = SRC[si][0], tag = SRC[si][1], fp = path.join(FIX, 'idempiere_tenant_' + dir, 'rows.json'), raw = fs.readFileSync(fp, 'utf8'), fx = JSON.parse(raw); FXS[dir] = fx;
    say('§IDF-SOURCE tenant=' + tag + ' recording=' + path.relative(path.join(ERP, '..'), fp) + ' bytes=' + raw.length + ' db=' + fx.source.db + ' client=' + fx.source.client + ' recorded="' + fx.source.recorded + '" tables=' + Object.keys(fx.tables).length);
    // COUNT: the engine alone
    var engOnly = E.run(TEMPLATE, CN.tenantRows(fx), {}), bad = [];
    engOnly.manifest.sheets.forEach(function (s) { var t = A.sheets[s.table], n = fx.tables[t.table].rows.filter(function (r) { return String(r.ad_client_id) === String(fx.source.client); }).length; if (n !== s.rows) bad.push(s.table + ' fixture=' + n + ' engine=' + s.rows); });
    check('COUNT-' + tag, 'engine-rows', 'the engine\'s book has as many rows per sheet as the fixture\'s tenant has rows of that table (17 sheets)', bad.length === 0 && engOnly.manifest.sheets.length === 17, bad);
    verdict('COUNT-' + tag);
    summary[tag] = await pipeline(tag, fx, TEMPLATE, fx);
  }

  // ═══ falsifiers (GardenWorld) ═══
  var gw = FXS.gardenworld, base = summary.GardenWorld;
  // (i) one template field swapped for another source column
  var CAND = [['M_Product', 'Name', '$value'], ['C_BPartner', 'Name', '$value'], ['M_Warehouse', 'Name', '$value'], ['C_ElementValue', 'Name', '$value']], pick = null;
  CAND.forEach(function (c) { if (pick) return; var S0 = A.sheets[c[0]], rs = gw.tables[S0.table].rows.filter(function (r) { return String(r.ad_client_id) === String(gw.source.client); });
    var field = c[2].slice(1); if (rs.some(function (r) { return String(r[c[1].toLowerCase()]) !== String(r[field]); }) && base.out[c[0]] && base.out[c[0]].diffCols.indexOf(c[1]) < 0 && base.out[c[0]].matched) pick = c; });
  if (!pick) { check('FALSIFY-COLUMN', 'swap', 'no candidate sheet has the column equal in the baseline: the swap cannot be judged', false, 'INCONCLUSIVE - no candidate'); say('§IDF-FALSIFY-COLUMN INCONCLUSIVE no candidate'); }
  else {
    var tpl2 = JSON.parse(committed); tpl2.entities[pick[0]].fields[pick[1]] = pick[2];
    say('§IDF-FALSIFY-COLUMN swap sheet=' + pick[0] + ' column=' + pick[1] + ' now reads ' + pick[2] + ' (baseline: column equal)');
    var f1 = await pipeline('GardenWorld-swap', gw, tpl2, gw), s1 = f1.out[pick[0]];
    check('FALSIFY-COLUMN', 'named', 'with ' + pick[0] + '.' + pick[1] + ' reading ' + pick[2] + ', the witness names ' + pick[1] + ' as a differing column of ' + pick[0] + ' (it was equal in the baseline)', s1 && s1.diffCols.indexOf(pick[1]) >= 0, { sheet: pick[0], diffCols: s1 && s1.diffCols });
    var others = []; Object.keys(f1.out).forEach(function (sh) { if (sh !== pick[0] && f1.out[sh].diffCols.join() !== base.out[sh].diffCols.join()) others.push(sh); });
    check('FALSIFY-COLUMN', 'only-that-sheet', 'no other sheet changed its differing columns because of the swap', others.length === 0, others);
  }
  verdict('FALSIFY-COLUMN');
  // (ii) one source row dropped from the fixture copy the engine reads (a leaf: a payment term nothing in the contract points at)
  var drop = { table: 'c_paymentterm', sheet: 'C_PaymentTerm' }, fx2 = JSON.parse(JSON.stringify(gw)), own2 = fx2.tables[drop.table].rows.filter(function (r) { return String(r.ad_client_id) === String(gw.source.client); }), gone = own2[own2.length - 1];
  fx2.tables[drop.table].rows = fx2.tables[drop.table].rows.filter(function (r) { return r !== gone; });
  say('§IDF-FALSIFY-ROW drop sheet=' + drop.sheet + ' value=' + J(gone.value) + ' from the engine\'s copy of the fixture (the comparison reads the full fixture)');
  var f2 = await pipeline('GardenWorld-drop', fx2, TEMPLATE, gw), s2 = f2.out[drop.sheet];
  var b0 = base.out[drop.sheet];
  check('FALSIFY-ROW', 'count-names-sheet', 'the count check names ' + drop.sheet + ': baseline loaded=' + b0.loaded + ' unmatched=' + b0.unmatchedSource + ' of ' + b0.source + ' source rows; with one row missing from the engine\'s copy it must read loaded=' + (b0.loaded - 1) + ' unmatched=' + (b0.unmatchedSource + 1) + ' and the sheet must FAIL', !!s2 && s2.loaded === b0.loaded - 1 && s2.unmatchedSource === b0.unmatchedSource + 1 && s2.verdict === 'FAIL', s2);
  var o2 = Object.keys(f2.out).filter(function (sh) { return sh !== drop.sheet && (f2.out[sh].loaded !== base.out[sh].loaded || f2.out[sh].unmatchedSource !== base.out[sh].unmatchedSource); });
  check('FALSIFY-ROW', 'only-that-sheet', 'no other sheet changed its loaded count or unmatched count', o2.length === 0, o2);
  verdict('FALSIFY-ROW');

  // (iii) a row lost after the engine ran, which no class can explain
  var lostSheet = 'C_Location', f3 = await pipeline('GardenWorld-lost', gw, TEMPLATE, gw, { dropBook: lostSheet });
  var uuLost = f3.droppedBook ? f3.droppedBook[A.headers[lostSheet].indexOf('C_Location_UU')] : null;
  var cvf = covVerdict(f3.cov, PIN.GardenWorld, f3.unattr);
  say('§IDF-FALSIFY-UNATTRIBUTED dropped from the book after the engine: ' + lostSheet + ' C_Location_UU=' + J(uuLost) + ' -> coverage ok=' + cvf.ok + ' unattributed=' + J(f3.unattr));
  check('FALSIFY-UNATTRIBUTED', 'named', 'COVERAGE FAILs and names the lost ' + lostSheet + ' row (UU ' + uuLost + ') as fitting no class', !cvf.ok && f3.unattr.some(function (u) { return u.sheet === lostSheet && u.key === uuLost; }), { cvf: cvf, unattr: f3.unattr });
  verdict('FALSIFY-UNATTRIBUTED');

  // ═══ COLUMNS ═══
  var colFail = [], nSheets = 0, nCols = 0, nRows = 0, allowed = {}, inconc = [], sheetPass = 0;
  Object.keys(summary).forEach(function (tag) { var s = summary[tag]; if (s.blocked) { colFail.push(tag + ': BLOCKED ' + J(s.blocked)); return; }
    Object.keys(s.out).forEach(function (sh) { var o = s.out[sh]; if (o.verdict === 'INCONCLUSIVE') { inconc.push(tag + '/' + sh); return; } if (!o.matched) return;
      nSheets++; nCols += o.N; nRows += o.matched;
      o.diffCols.forEach(function (h) { var c = EXC[sh + '|' + h]; if (c) { var kk = tag + ' ' + c + ' ' + sh + '.' + h; allowed[kk] = (allowed[kk] || 0) + o.nDiff[h]; } else colFail.push(tag + '/' + sh + '.' + h + ' rows=' + o.nDiff[h]); }); }); });
  Object.keys(allowed).sort().forEach(function (k) { say('§IDF-COLUMNS-ALLOWED ' + k + ' rows=' + allowed[k]); });
  say('§IDF-COLUMNS ' + (nSheets && !colFail.length ? 'PASS' : !nSheets ? 'INCONCLUSIVE' : 'FAIL') + ' sheets_judged=' + nSheets + ' columns_judged=' + nCols + ' rows_compared=' + nRows + ' allowed_by_class=' + J(allowed) + (colFail.length ? ' other_differences=' + J(colFail) : ''));
  // ═══ COVERAGE ═══
  var covFail = [];
  Object.keys(summary).forEach(function (tag) { var s = summary[tag]; if (s.blocked) return; var cv = covVerdict(s.cov, PIN[tag], s.unattr); if (!cv.ok) cv.why.forEach(function (w) { covFail.push(tag + ': ' + w); });
    var extra = Object.keys(s.out).filter(function (sh) { return s.out[sh].extraLoaded; }); if (extra.length) covFail.push(tag + ': loaded rows with no source row in ' + J(extra)); });
  say('§IDF-COVERAGE-VERDICT ' + (covFail.length ? 'FAIL ' + J(covFail) : 'PASS') + ' pinned=' + J(PIN));
  say('§IDF-INCONCLUSIVE sheets (no source row, nothing judged)=' + J(inconc));
  say('§IDF-FALSIFIERS-AND-GEN checks judged=' + ALL.judged + ' failed=' + ALL.failed);
  var v = (!nSheets) ? 'INCONCLUSIVE' : (colFail.length || covFail.length || ALL.failed) ? 'FAIL' : 'PASS';
  say('§IDF-VERDICT ' + v + ' columns=' + (colFail.length ? 'FAIL' : 'PASS') + ' coverage=' + (covFail.length ? 'FAIL' : 'PASS') + ' gen_count_falsifiers_failed=' + ALL.failed);
  process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { _log('§IDF-CRASH ' + (e && e.stack || e)); process.exit(2); });
