#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-NINJA-MIGRATE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §NINJA-LOADER-SPEC). READ THE LOG after every run: every verdict is a §NM line, the exit code is not
//   the evidence. INCONCLUSIVE when nothing was judged.
// THE ISSUE it proves/disproves (owner, 2026-11-09): "a smaller abstract solution to all data migration ... proof is the Kernel ERP spine of AD data relationship" and "3rd party such as
//   Odoo may miss mandatory table properties and intra-table relationships (_ID, <table>Line master-detail)": the Ninja loader (plugins/ninja_migrate.mjs + ninja_migrate_process.mjs)
//   must load the Odoo export workbook into a FRESHLY BORN tenant through the model layer, all or nothing, with every lookup resolved to the right row of THIS tenant (or System), every
//   master-detail parent set, every mandatory column filled - and refuse what is incomplete instead of saving a broken row.
// Cases: PLUG (bundle loads, ACTIVE, class registered, parameters 4 of 4) · TENANT (born by genesis) · RAW (the export as is: refused for C_UOM.X12DE355, nothing kept, every error named)
//   · RUN (the witness answers the UoM screen as the user would - printed - then loads) · SPINE (lookups, patches, master-detail, mandatory) · RERUN (adds nothing) · FALS (apostrophe
//   loads; ambiguous lookup refused; bad header stops with the legacy text; a missing mandatory is refused).
// Fixture: tests/fixtures/odoo_export_2026-11-09/ = the export bim-compiler W-SHEET-CONTRACT judged (bim-ootb erp/odoo_agent/export.js v3 over the recorded odoodemo).
// Command: node erp/tests/witness_ninja_migrate.js
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-09');
var _log = console.log, SEEN = [];
console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §NM-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info)));
}
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§NM-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var TABLES = ['C_UOM', 'C_PaymentTerm', 'M_Product_Category', 'C_ElementValue', 'C_BPartner', 'C_Location', 'C_BPartner_Location', 'AD_User', 'M_Product', 'M_Product_PO',
  'M_PriceList', 'M_PriceList_Version', 'M_ProductPrice', 'M_Warehouse', 'M_Locator', 'M_Inventory', 'M_InventoryLine'];

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
  // the model files idempiere.html loads (ws_kernel.build loads a subset): the browser's save path, not a thinner one
  var pageModels = (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).map(function (m) { return m.replace('<script src="', ''); });
  pageModels.forEach(function (f) { try { require(path.join(ERP, f)); } catch (e) { say('§NM-MODEL ' + f + ' not loadable in node: ' + e.message); } });
  say('§NM-MODELS page loads ' + pageModels.length + ': ' + pageModels.join(','));
  function q(sql, p) { return k.q(sql, p || []); }
  function one(sql, p) { return q(sql, p)[0] || null; }

  // ═══ TENANT: born by the ported Initial Client Setup ═══
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  var born = G.birthTenant({ clientName: 'Odoo Demo', currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'odooAdmin', dateAcct: '2026-11-09', countryId: 100 });
  var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
  var merged = G.mergeGenesisInto(rb.groups, shim), R = rb.refs, CID = R.clientId;
  G.grantFullAccess(shim, R.roleAdminId, CID, R.orgId);
  var S = { clientId: CID, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:ninja-migrate' };
  say('§NM-TENANT client=' + CID + ' org=' + R.orgId + ' role=' + R.roleAdminId + ' rowsMerged=' + merged);
  check('TENANT', 'born', 'genesis birthed a tenant with its own client, org and admin role', CID > 11 && !!one('SELECT 1 AS x FROM ad_client WHERE ad_client_id=?', [CID]) && R.orgId > 0, { CID: CID, R: R });
  function counts() { var o = {}; TABLES.forEach(function (t) { o[t] = one('SELECT count(*) AS n FROM ' + t.toLowerCase() + ' WHERE ad_client_id=?', [CID]).n; }); return o; }
  var C0 = counts(); say('§NM-TENANT before ' + J(C0));

  // ═══ PLUG: installed on the registry exactly as the host does ═══
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host), mod = null, chunk = null, started = null, err = null;
  try { mod = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href); chunk = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate_process.mjs')).href);
    await reg.installBundle(mod); started = await reg.startBundle('org.idempiere.ninja.migrate'); } catch (e) { err = e && (e.stack || e.message); }
  check('PLUG', 'starts', 'the bundle loads and starts ACTIVE through the generic extension points', !!started && started.state === 'ACTIVE', { started: started, err: err });
  var P = one('SELECT ad_process_id AS id, classname AS c FROM ad_process WHERE ad_process_id=9540001');
  check('PLUG', 'class', 'AD_Process 9540001 names org.idempiere.ninja.process.MigrateExcelData and that class is registered', !!P && P.c === chunk.CLASSNAME && !!AP.JAVA[P.c], { P: P });
  var paras = q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=9540001 AND isactive='Y' ORDER BY seqno").map(function (r) { return r.c; });
  var src = fs.readFileSync(path.join(ERP, 'plugins', 'ninja_migrate_process.mjs'), 'utf8'), used = (src.match(/name === '([A-Za-z_]+)'/g) || []).map(function (s) { return /'([^']+)'/.exec(s)[1]; });
  var X = paras.filter(function (n) { return used.indexOf(n) >= 0; }).length;
  check('PLUG', 'paras', 'the AD_Process_Para are exactly what prepare() reads (X of N = ' + X + ' of ' + paras.length + ', the Java reads 4)', paras.length === 4 && X === 4 && used.length === 4, { paras: paras, used: used });
  var rd = function (f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } };
  check('PLUG', 'wiring', 'the host ships both plugin files (sw.js precache) and installs the bundle STOPPED for the System Administrator (plugin_overlay.js INSTALL_ONLY) - file names only',
    /'plugins\/ninja_migrate\.mjs'/.test(rd('sw.js')) && /'plugins\/ninja_migrate_process\.mjs'/.test(rd('sw.js')) && /INSTALL_ONLY = \[[^\]]*'plugins\/ninja_migrate\.mjs'/.test(rd('plugin_overlay.js')), {});
  verdict('PLUG');

  function run(file, wb, opts) {
    chunk.putFile(file, wb);
    var trx = new ML.Trx(k.q, k.env(S)), r;
    try { r = AP.runInTrx(trx, 9540001, { params: Object.assign({ File_Directory: file, Processed: 'Y' }, opts || {}) }); } catch (e) { r = { ok: false, summary: 'threw: ' + e.message }; }
    var ops = r.ok ? trx.groupOps() : [], ids = [];
    if (r.ok && ops.length && !(opts && opts.dry)) ids = k.commit(S, ops, { ws: 'ninja_migrate' });
    chunk.dropFile(file);
    return { ok: !!r.ok, summary: r.summary, log: trx.log, ops: ops.length, ids: ids };
  }
  var wbFile = XLSX.read(fs.readFileSync(path.join(FIXD, 'odoo_migration.xlsx'))), manifest = JSON.parse(fs.readFileSync(path.join(FIXD, 'manifest.json'), 'utf8'));
  var book = wbFile.SheetNames.map(function (n) { return { name: n, rows: chunk.sheetRows(wbFile.Sheets[n]) }; });
  say('§NM-FIXTURE sheets=' + book.length + ' rows=' + book.map(function (s) { return s.name.slice(0, 2) + '=' + (s.rows.length - 1); }).join(' '));

  // ═══ RAW: the export as is — C_UOM.X12DE355 is blank (no Odoo field) → refused, nothing kept ═══
  guard('RAW', 'refused', 'the raw export is refused whole', function () {
    var r = run('odoo_migration.xlsx', wbFile), C1 = counts();
    var errs = r.log.filter(function (l) { return /^§NINJA-ERR/.test(l); });
    say('§NM-RAW ok=' + r.ok + ' errors=' + errs.length + ' summary=' + String(r.summary).slice(0, 300));
    check('RAW', 'refused', 'the run answers not-ok and the summary says nothing was migrated', !r.ok && /Nothing migrated/.test(String(r.summary)), { ok: r.ok, summary: r.summary });
    check('RAW', 'names-uom', 'the errors name the C_UOM sheet and the empty mandatory X12DE355 (the column Odoo has no field for)', errs.some(function (l) { return /01C_UOM row \d+: C_UOM mandatory .*x12de355/.test(l); }), { first: errs.slice(0, 3) });
    check('RAW', 'nothing-kept', 'all or nothing: the tenant has exactly the rows it had before in all 17 tables', J(C1) === J(C0), { before: C0, after: C1 });
  });
  verdict('RAW');

  // ═══ RUN: the witness answers the UoM screen as the user would (printed), then the loader runs ═══
  var ANSWERS = { Units: { to: 'Each' }, Days: { to: 'Day' }, Hours: { to: 'Hour' } };
  var mp = chunk.mapUom(JSON.parse(JSON.stringify(book)), ANSWERS);
  say('§NM-UOM-ANSWERS (the witness stands in for the user on the B4 UoM screen) ' + J(ANSWERS) + ' → mapped=' + J(mp.mapped) + ' dropped(unused)=' + mp.dropped.length + ' missing=' + J(mp.missing));
  check('RUN', 'mapuom', 'mapUom maps the 3 UoMs the products use and drops the 25 nothing uses', mp.ok && mp.mapped.length === 3 && mp.dropped.length === 25 && mp.book[0].rows.length === 1, { mp: { ok: mp.ok, mapped: mp.mapped, dropped: mp.dropped.length } });
  var mpNo = chunk.mapUom(JSON.parse(JSON.stringify(book)), { Units: { to: 'Each' } });
  check('RUN', 'mapuom-refuses', 'mapUom refuses when a used UoM has no answer (Days, Hours)', !mpNo.ok && mpNo.missing.length === 2, { missing: mpNo.missing });
  // the rows this run added = rowids not there before (rowid: M_Product_PO / M_ProductPrice have composite keys)
  var PRE = {}; TABLES.forEach(function (t) { var lc = t.toLowerCase(); PRE[lc] = q('SELECT rowid AS i FROM ' + lc + ' WHERE ad_client_id=?', [CID]).map(function (r) { return r.i; }); });
  function NEW(lc, alias) { return PRE[lc].length ? ' AND ' + (alias ? alias + '.' : '') + 'rowid NOT IN (' + PRE[lc].join(',') + ')' : ''; }
  var res = run('mapped.xlsx', chunk.bookToWorkbook(mp.book)), C2 = counts();
  var errs2 = res.log.filter(function (l) { return /^§NINJA-ERR/.test(l); });
  say('§NM-RUN ok=' + res.ok + ' ops=' + res.ops + ' summary=' + String(res.summary).slice(0, 400));
  errs2.slice(0, 40).forEach(function (l) { say('   ' + l); });
  res.log.filter(function (l) { return /^§NINJA-(FIX|SKIP|WARN)/.test(l); }).forEach(function (l) { say('   ' + l); });
  check('RUN', 'ok', 'the mapped workbook loads (ok, ops committed)', res.ok && res.ops > 0, { summary: res.summary, errors: errs2.length });
  var sheetRows = {}; mp.book.forEach(function (s) { sheetRows[s.name.replace(/^\d\d/, '')] = s.rows.length - 1; });
  var delta = {}; TABLES.forEach(function (t) { delta[t] = C2[t] - C0[t]; });
  say('§NM-RUN delta ' + J(delta) + ' sheetRows ' + J(sheetRows));
  var off = TABLES.filter(function (t) { return delta[t] !== sheetRows[t]; });
  check('RUN', 'rows', 'every table of the tenant gained exactly its sheet\'s rows (17 tables)', res.ok && off.length === 0, { off: off.map(function (t) { return t + ' ' + delta[t] + '≠' + sheetRows[t]; }) });
  verdict('RUN');

  // ═══ SPINE: the AD relationships of what was loaded ═══
  if (res.ok) {
    var dflt = function (t, w) { return one('SELECT ' + t + '_id AS id FROM ' + t + ' WHERE ad_client_id=? AND ' + w, [CID]); };
    var g = dflt('c_bp_group', "isdefault='Y'"), tc = dflt('c_taxcategory', "isdefault='Y'");
    var bps = q('SELECT value, c_bp_group_id AS g FROM c_bpartner WHERE ad_client_id=? AND created>=(SELECT max(created) FROM c_bpartner WHERE ad_client_id=?)', [CID, CID]);
    var migBp = q('SELECT c_bpartner_id AS id, value, c_bp_group_id AS g FROM c_bpartner WHERE ad_client_id=? AND value IN (' + mp.book[4].rows.slice(1).map(function () { return '?'; }).join(',') + ')', [CID].concat(mp.book[4].rows.slice(1).map(function (r) { return r[0]; })));
    check('SPINE', 'bp-group', 'every migrated partner is in the tenant\'s OWN default group (patch C_BP_Group_ID>IsDefault, ImportBPartner.java:129)', !!g && migBp.length === sheetRows.C_BPartner && migBp.every(function (b) { return b.g === g.id; }), { g: g, bps: migBp.length });
    var prods = q("SELECT value, c_taxcategory_id AS tc, c_uom_id AS u, m_product_category_id AS pc FROM m_product WHERE ad_client_id=?" + NEW('m_product'), [CID]);
    check('SPINE', 'tax-cat', 'every migrated product has the tenant\'s default tax category (patch, ImportProduct.java:415)', !!tc && prods.length === sheetRows.M_Product && prods.every(function (p) { return p.tc === tc.id; }), { tc: tc, n: prods.length });
    var uomOk = prods.every(function (p) { var u = one('SELECT name FROM c_uom WHERE c_uom_id=?', [p.u]); return u && ['Each', 'Day', 'Hour'].indexOf(u.name) >= 0; });
    check('SPINE', 'uom', 'every product points at the System UoM the user chose (Each/Day/Hour)', uomOk, {});
    var catOk = prods.every(function (p) { return !!one('SELECT 1 AS x FROM m_product_category WHERE m_product_category_id=? AND ad_client_id=?', [p.pc, CID]); });
    var cats = q('SELECT value, m_product_category_parent_id AS par FROM m_product_category WHERE ad_client_id=?' + NEW('m_product_category'), [CID]);
    var parOk = cats.every(function (c) { var segs = c.value.split(' / '); if (segs.length === 1) return c.par == null || c.par === 0;
      var p = one('SELECT value FROM m_product_category WHERE m_product_category_id=?', [c.par]); return p && p.value === segs.slice(0, -1).join(' / '); });
    check('SPINE', 'categories', 'products point at migrated categories of THIS tenant, and each category\'s parent is the category its path names (M_Product_Category_Parent_ID>Value)', catOk && parOk && cats.length === sheetRows.M_Product_Category, { catOk: catOk, parOk: parOk, cats: cats.length });
    var el = one("SELECT c_element_id AS id FROM c_element WHERE ad_client_id=? AND elementtype='A'", [CID]);
    var evs = q('SELECT c_element_id AS e FROM c_elementvalue WHERE ad_client_id=? AND value IN (' + mp.book[3].rows.slice(1).map(function () { return '?'; }).join(',') + ') AND name IN (' + mp.book[3].rows.slice(1).map(function () { return '?'; }).join(',') + ')',
      [CID].concat(mp.book[3].rows.slice(1).map(function (r) { return r[0]; })).concat(mp.book[3].rows.slice(1).map(function (r) { return r[1]; })));
    check('SPINE', 'element', 'every migrated account sits in the tenant\'s account element (C_Element_ID>ElementType=A)', !!el && evs.length >= 1 && evs.every(function (e) { return e.e === el.id; }), { el: el, n: evs.length });
    var md = [
      ['C_BPartner_Location → C_BPartner', 'SELECT count(*) AS n FROM c_bpartner_location l JOIN c_bpartner b ON b.c_bpartner_id=l.c_bpartner_id AND b.ad_client_id=l.ad_client_id JOIN c_location c ON c.c_location_id=l.c_location_id WHERE l.ad_client_id=?' + NEW('c_bpartner_location', 'l'), 'C_BPartner_Location'],
      ['AD_User → C_BPartner', 'SELECT count(*) AS n FROM ad_user u JOIN c_bpartner b ON b.c_bpartner_id=u.c_bpartner_id AND b.ad_client_id=u.ad_client_id WHERE u.ad_client_id=?' + NEW('ad_user', 'u'), 'AD_User'],
      ['M_Product_PO → M_Product + C_BPartner', 'SELECT count(*) AS n FROM m_product_po x JOIN m_product p ON p.m_product_id=x.m_product_id AND p.ad_client_id=x.ad_client_id JOIN c_bpartner b ON b.c_bpartner_id=x.c_bpartner_id AND b.ad_client_id=x.ad_client_id WHERE x.ad_client_id=?' + NEW('m_product_po', 'x'), 'M_Product_PO'],
      ['M_ProductPrice → version + product', 'SELECT count(*) AS n FROM m_productprice x JOIN m_pricelist_version v ON v.m_pricelist_version_id=x.m_pricelist_version_id AND v.ad_client_id=x.ad_client_id JOIN m_product p ON p.m_product_id=x.m_product_id WHERE x.ad_client_id=?' + NEW('m_productprice', 'x'), 'M_ProductPrice'],
      ['M_Locator → M_Warehouse', 'SELECT count(*) AS n FROM m_locator l JOIN m_warehouse w ON w.m_warehouse_id=l.m_warehouse_id AND w.ad_client_id=l.ad_client_id WHERE l.ad_client_id=?' + NEW('m_locator', 'l'), 'M_Locator'],
      ['M_InventoryLine → M_Inventory (by DocumentNo)', "SELECT count(*) AS n FROM m_inventoryline l JOIN m_inventory h ON h.m_inventory_id=l.m_inventory_id AND h.ad_client_id=l.ad_client_id AND h.documentno LIKE 'OPEN-%' JOIN m_locator x ON x.m_locator_id=l.m_locator_id WHERE l.ad_client_id=?" + NEW('m_inventoryline', 'l'), 'M_InventoryLine']
    ];
    md.forEach(function (m) { var n = one(m[1], [CID]).n; check('SPINE', 'md:' + m[2], 'master-detail ' + m[0] + ': every detail row points at its parent in this tenant (' + n + ' of ' + sheetRows[m[2]] + ')', n === sheetRows[m[2]], { n: n, want: sheetRows[m[2]] }); });
    var mmi = q("SELECT d.docbasetype AS b FROM m_inventory h JOIN c_doctype d ON d.c_doctype_id=h.c_doctype_id WHERE h.ad_client_id=? AND h.documentno LIKE 'OPEN-%'", [CID]);
    check('SPINE', 'doctype', 'the opening inventories carry a Material Physical Inventory doc type of the tenant (patch C_DocType_ID>DocBaseType=MMI)', mmi.length === sheetRows.M_Inventory && mmi.every(function (d) { return d.b === 'MMI'; }), { mmi: mmi });
    // every AD-mandatory column of every migrated row is filled (read from the dictionary, independent of the loader's own F8)
    var gaps = [], bornGaps = [];
    TABLES.forEach(function (t) {
      var cols = q("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table tb ON tb.ad_table_id=c.ad_table_id WHERE lower(tb.tablename)=? AND c.ismandatory='Y' AND c.isactive='Y' AND coalesce(c.columnsql,'')=''", [t.toLowerCase()])
        .map(function (r) { return r.c; }).filter(function (c) { return k.colsOf(t.toLowerCase()).indexOf(c) >= 0; });
      cols.forEach(function (c) { var w = ' WHERE ad_client_id=? AND (' + c + " IS NULL OR " + c + "='')";
        var n = one('SELECT count(*) AS n FROM ' + t.toLowerCase() + w + NEW(t.toLowerCase()), [CID]).n; if (n) gaps.push(t + '.' + c + '×' + n);
        var b = one('SELECT count(*) AS n FROM ' + t.toLowerCase() + w, [CID]).n - n; if (b) bornGaps.push(t + '.' + c + '×' + b); });
    });
    check('SPINE', 'mandatory', 'no AD-mandatory column is empty on any MIGRATED row of the 17 tables', gaps.length === 0, { gaps: gaps });
    say('§NM-SPINE migrated gaps=' + J(gaps));
    say('§NM-GENESIS-GAPS (rows the born tenant already had, NOT judged here - a genesis finding) n=' + bornGaps.length + ' ' + J(bornGaps));
  }
  verdict('SPINE');

  // ═══ RERUN: the same workbook again adds nothing ═══
  guard('RERUN', 'nothing', 'a second run adds nothing', function () {
    var r = run('again.xlsx', chunk.bookToWorkbook(mp.book)), C3 = counts();
    say('§NM-RERUN ok=' + r.ok + ' summary=' + String(r.summary).slice(0, 200));
    check('RERUN', 'nothing', 'the second run is refused whole and the tenant is unchanged', !r.ok && J(C3) === J(C2), { ok: r.ok, before: C2, after: C3 });
  });
  verdict('RERUN');

  // ═══ FALS: the rules can fail (dry runs: nothing committed) ═══
  function sh(name, rows) { return { name: name, rows: rows }; }
  guard('FALS', 'apostrophe', 'an apostrophe value loads and is found by the next sheet (F1)', function () {
    var r = run('apo.xlsx', chunk.bookToWorkbook([sh('01M_Product_Category', [['Value', 'Name'], ["Kid's Toys", "Kid's Toys"]]),
      sh('02M_Product', [['Value', 'Name', 'M_Product_Category_ID>Value', 'C_UOM_ID', 'C_TaxCategory_ID>IsDefault'], ['KT-1', "O'Brien kite", "Kid's Toys", 'Each', 'Y']])]), { dry: true });
    say('§NM-FALS apostrophe ok=' + r.ok + ' summary=' + String(r.summary).slice(0, 200));
    check('FALS', 'apostrophe', 'Kid\'s Toys / O\'Brien kite load (bound parameters)', r.ok && r.ops >= 2, { r: r.summary });
  });
  guard('FALS', 'ambiguous', 'a Name lookup that matches two rows is refused (F4)', function () {
    var r = run('amb.xlsx', chunk.bookToWorkbook([sh('01C_BP_Group', [['Value', 'Name'], ['T1', 'Twin'], ['T2', 'Twin']]), sh('02C_BPartner', [['Value', 'Name', 'C_BP_Group_ID'], ['AMB-1', 'Ambiguous Co', 'Twin']])]), { dry: true });
    check('FALS', 'ambiguous', 'refused, naming the ambiguity', !r.ok && /ambiguous/.test(String(r.summary)), { r: r.summary });
  });
  guard('FALS', 'header', 'a header that is not a column stops the run with the legacy text', function () {
    var r = run('hdr.xlsx', chunk.bookToWorkbook([sh('01C_BPartner', [['Value', 'NoSuchCol'], ['H-1', 'x']])]), { dry: true });
    check('FALS', 'header', 'refused with "No such column. Check your Excel sheet+column:C_BPartner-NoSuchCol"', !r.ok && /No such column\. Check your Excel sheet\+column:C_BPartner-NoSuchCol/.test(String(r.summary)), { r: r.summary });
  });
  guard('FALS', 'mandatory', 'a partner without a Name (mandatory, no default anywhere) is refused (F8), not saved broken', function () {
    var r = run('mand.xlsx', chunk.bookToWorkbook([sh('01C_BPartner', [['Value', 'TaxID'], ['M-1', 'X-1']])]), { dry: true });
    check('FALS', 'mandatory', 'refused, naming name', !r.ok && /mandatory [a-z_,]*\bname\b/.test(String(r.summary)), { r: r.summary });
  });
  guard('FALS', 'default-group', 'a partner with NO group column takes the tenant default group (legacy MBPartner.getBPGroup :876-886 -> MBPGroup.getDefault)', function () {
    var r = run('grp.xlsx', chunk.bookToWorkbook([sh('01C_BPartner', [['Value', 'Name'], ['G-1', 'Default Group Co']])]), { dry: true });
    check('FALS', 'default-group', 'loads (the model, not the sheet, supplies the default group)', r.ok, { r: r.summary });
  });
  verdict('FALS');

  var v = ['PLUG', 'RAW', 'RUN', 'SPINE', 'RERUN', 'FALS'].map(verdict);
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§NM-VERDICT ' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(v));
  process.exit(all === 'PASS' ? 0 : all === 'INCONCLUSIVE' ? 3 : 1);
})().catch(function (e) { say('§NM-VERDICT FAIL threw ' + (e && e.stack || e)); process.exit(1); });
