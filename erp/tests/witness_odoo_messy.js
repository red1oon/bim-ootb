#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ODOO-MESSY, load half (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §HARDEN-SPEC). READ THE LOG after every run: every verdict is a §OM line; the exit
//   code is not the evidence. INCONCLUSIVE when a case's records are not in the fixture (nothing to judge).
// THE ISSUE it proves/disproves (owner: "harden the migration process so that real users will find it easy"): a REAL Odoo's data — not the demo company — must arrive whole and
//   linked. Measured before the fix: a customer with a country but no street, two customers on one street (both: the address was found by its street text), a contact of an archived
//   company (crash) each stopped the export. This witness loads the export of those states (fixture: bim-compiler's odoo_messy = a copy of odoodemo + 8 states Odoo itself allows,
//   applied through Odoo's ORM; export.js after §HARDEN-SPEC H1-H6) through the "Migrate from Odoo" form into a newly born tenant and checks each state in the ERP's own tables.
//   The export half (live/recorded Odoo, old vs new exporter) is bim-compiler scripts/poc_odoo_messy.js.
// Command: node erp/tests/witness_odoo_messy.js
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_messy_2026-11-09');
var _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §OM-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§OM-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  var born = G.birthTenant({ clientName: 'Messy Co', currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'messyAdmin', dateAcct: '2026-11-09', countryId: 100 });
  var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
  G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-09 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
  var R = rb.refs, CID = R.clientId, S = { clientId: CID, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:odoo-messy' };
  say('§OM-TENANT client=' + CID);
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host);
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate.mjs')).href)); await reg.startBundle('org.kernel.odoo.migrate');
  await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate_form.mjs')).href);

  var withT = function (fn) { return fn(k.q, k.env(S)); }, D = AF.get('org.kernel.odoo.MigrateFromOdoo');
  var wbuf = fs.readFileSync(path.join(FIXD, 'odoo_migration.xlsx')), man = JSON.parse(fs.readFileSync(path.join(FIXD, 'manifest.json'), 'utf8')), prov = JSON.parse(fs.readFileSync(path.join(FIXD, 'provenance.json'), 'utf8'));
  var book = XLSX.read(wbuf);
  function files(wb) { return { Files: [{ name: 'odoo_migration.xlsx', size: wbuf.length, data: wb || XLSX.read(wbuf) }, { name: 'manifest.json', size: 1, data: man }] }; }
  function rows(params, current) { return AF.read(withT, function (trx) { return D.rows(trx, params, current); }); }
  var ANS = { Units: 'Each', Days: 'Day', Hours: 'Hour' };
  function answer(rs) { return rs.map(function (r) { var o = { key: r.key, selected: r.selected }; if (r.erpunit !== undefined) o.erpunit = ANS[r.item.replace(/^Unit: /, '')] != null ? ANS[r.item.replace(/^Unit: /, '')] : r.erpunit; return o; }); }
  var TABLES = man.sheets.map(function (s) { return s.table; });
  function counts() { var o = {}; TABLES.forEach(function (t) { o[t] = q('SELECT count(*) AS n FROM ' + t.toLowerCase() + ' WHERE ad_client_id=?', [CID])[0].n; }); return o; }
  function sheetRows(table) { var nm = man.sheets.filter(function (s) { return s.table === table; })[0].sheet; return XLSX.utils.sheet_to_json(book.Sheets[nm], { header: 1, defval: '' }); }

  // ═══ FALSIFIER first (on a copy): an address whose C_Location_UU is blanked ⇒ the summary refuses the rows that point at it — the UU is what links an address ═══
  var r1 = rows(files(), null), cur = answer(r1);
  var bad = XLSX.read(wbuf), locName = man.sheets.filter(function (s) { return s.table === 'C_Location'; })[0].sheet, ls = bad.Sheets[locName], lh = sheetRows('C_Location')[0], uc = lh.indexOf('C_Location_UU');
  var a1 = XLSX.utils.encode_cell({ r: 1, c: uc }); ls[a1] = { t: 's', v: '' };
  var rf = rows(files(bad), cur).filter(function (r) { return r.key > 100 && r.key < 900; }), bplF = rf.filter(function (r) { return r.item === 'C_BPartner_Location'; })[0];
  say('§OM-FALSIFIER blank C_Location_UU row 2 → C_BPartner_Location ' + J({ will: bplF.will, refused: bplF.refused, reason: bplF.reason }));
  check('FALS', 'uu-links', 'a blanked C_Location_UU makes the summary refuse the address row(s) that point at it (the address is found by its UU, not its street)', bplF.refused >= 1, bplF);
  verdict('FALS');

  // ═══ LOAD: the whole messy export, every sheet ticked ⇒ predicted == gained on all 17 tables, refused 0 ═══
  var r2 = rows(files(), cur), sh = r2.filter(function (r) { return r.key > 100 && r.key < 900; }), C0 = counts(), predicted = {};
  sh.forEach(function (s) { predicted[s.item] = s.will; });
  var refused = sh.filter(function (s) { return s.refused; });
  say('§OM-SUMMARY ' + J(sh.map(function (s) { return s.item + ' file=' + s.infile + ' will=' + s.will + ' refused=' + s.refused + (s.refused ? ' (' + s.reason + ')' : ''); })));
  var res = AF.execute(withT, 'org.kernel.odoo.MigrateFromOdoo', files(), cur);
  if (res.ok && res.ops && res.ops.length) k.commit(S, res.ops, { ws: 'odoo_messy' });
  var C1 = counts(), gain = {}; TABLES.forEach(function (t) { gain[t] = C1[t] - C0[t]; });
  say('§OM-LOAD ok=' + res.ok + ' ops=' + (res.ops || []).length + ' gain=' + J(gain));
  check('LOAD', 'clean', 'the summary refuses no row of the messy export', !r2.some(function (r) { return /^⚠/.test(r.item); }) && refused.length === 0, refused);
  check('LOAD', 'summary==result', 'every one of the 17 tables gained exactly the prediction (except units, which map), = the rows in the file', res.ok &&
    TABLES.every(function (t) { return gain[t] === predicted[t]; }) && sh.every(function (s) { return s.item === 'C_UOM' || s.will === s.infile; }), { gain: gain, predicted: predicted, msg: String(res.msg).slice(0, 300) });
  verdict('LOAD');

  function bp(name) { return q("SELECT c_bpartner_id AS id, value, isactive FROM c_bpartner WHERE ad_client_id=? AND name=?", [CID, name]); }
  function locsOf(id) { return q("SELECT l.c_location_id AS id, l.address1 AS a1, l.city, l.c_country_id AS cty, l.c_location_uu AS uu FROM c_bpartner_location b JOIN c_location l ON l.c_location_id=b.c_location_id WHERE b.c_bpartner_id=? ORDER BY l.c_location_id", [id]); }
  var MY = (q("SELECT c_country_id AS id FROM c_country WHERE countrycode='MY'")[0] || {}).id;
  // ═══ M1: a customer with a country and no street ═══
  var m1 = bp('Country Only Sdn Bhd');
  if (m1.length) { var l1 = locsOf(m1[0].id); check('M1', 'no-street', 'the customer has its address: no street, country MY', l1.length === 1 && !l1[0].a1 && l1[0].cty === MY, l1); }
  verdict('M1');
  // ═══ M2: two customers on the same street ═══
  var n = bp('Branch North'), s = bp('Branch South');
  if (n.length && s.length) { var ln = locsOf(n[0].id), lsx = locsOf(s[0].id);
    check('M2', 'own-address', 'each branch has its OWN address row, same street, its own city', ln.length === 1 && lsx.length === 1 && ln[0].id !== lsx[0].id && ln[0].a1 === lsx[0].a1 && ln[0].city !== lsx[0].city, { ln: ln, ls: lsx }); }
  verdict('M2');
  // ═══ M3: a contact whose company is archived ═══
  var o = bp('Old Trading Co'), ann = q("SELECT c_bpartner_id AS b FROM ad_user WHERE ad_client_id=? AND name='Ann Old'", [CID]);
  if (o.length) check('M3', 'inactive-parent', 'the archived company is INACTIVE in the ERP and its contact sits under it', o[0].isactive === 'N' && ann.length === 1 && ann[0].b === o[0].id, { o: o, ann: ann });
  verdict('M3');
  // ═══ M4 / M8: repeated codes — the renamed rows (manifest.renamed) are all there, and the code's first holder kept it ═══
  var ren = man.renamed || [], tab = { C_BPartner: 'c_bpartner', M_Product: 'm_product', M_Locator: 'm_locator', M_Product_Category: 'm_product_category' };
  ['M_Product', 'C_BPartner'].forEach(function (t, i) { var cs = i ? 'M8' : 'M4', rr = ren.filter(function (r) { return r.table === t && /^repeats/.test(r.why); });
    rr.forEach(function (r) { var got = q('SELECT count(*) AS n FROM ' + tab[t] + ' WHERE ad_client_id=? AND value=?', [CID, r.erp])[0].n, kept = q('SELECT count(*) AS n FROM ' + tab[t] + ' WHERE ad_client_id=? AND value=?', [CID, r.odoo])[0].n;
      check(cs, 'renamed-' + r.odoo_id, t + ' ' + J(r.odoo) + ' repeats in Odoo: odoo id ' + r.odoo_id + ' is ' + J(r.erp) + ', the first holder keeps ' + J(r.odoo), got === 1 && kept === 1, { got: got, kept: kept }); });
    verdict(cs); });
  // ═══ M5: an archived product with stock ═══
  var pRows = sheetRows('M_Product'), ph = pRows[0], pIdx = man.sheets.filter(function (x) { return x.table === 'M_Product'; })[0].sheet;
  var arch = prov[pIdx].map(function (p, i) { return { odoo: p, row: pRows[i + 1] }; }).filter(function (x) { return x.odoo.active === false; });
  var ilRows = sheetRows('M_InventoryLine'), ilP = ilRows[0].indexOf('M_Product_ID>Value');
  arch.filter(function (x) { return ilRows.slice(1).some(function (r) { return r[ilP] === x.row[ph.indexOf('Value')]; }); }).forEach(function (x) {
    var v = x.row[ph.indexOf('Value')], pr = q('SELECT m_product_id AS id, isactive FROM m_product WHERE ad_client_id=? AND value=?', [CID, v]);
    var lines = pr.length ? q('SELECT count(*) AS n FROM m_inventoryline WHERE m_product_id=?', [pr[0].id])[0].n : 0;
    check('M5', 'archived-' + v, 'archived Odoo product ' + v + ' is INACTIVE in the ERP and its opening stock line points at it', pr.length === 1 && pr[0].isactive === 'N' && lines >= 1, { pr: pr, lines: lines }); });
  verdict('M5');
  // ═══ M6: several companies — the export took ONE (manifest), its others named ═══
  check('M6', 'one-company', 'the manifest names the ONE Odoo company exported and the others to export separately', man.company && man.company.length === 1 && (man.other_companies || []).length >= 1 &&
    (man.notes || []).some(function (t) { return /--company/.test(t); }), { company: man.company, others: man.other_companies });
  verdict('M6');
  // ═══ M7: a delivery address on the parent's own street ═══
  var m7 = bp('Same Street Co');
  if (m7.length) { var l7 = locsOf(m7[0].id); check('M7', 'two-addresses', 'the company keeps its own address AND the delivery address on the same street, as two rows', l7.length === 2 && l7[0].id !== l7[1].id && l7[0].a1 === l7[1].a1, l7); }
  verdict('M7');
  // ═══ LEN: a key longer than the ERP column (Odoo location paths) arrives cut with its Odoo id, and the stock lines still find it ═══
  var cut = ren.filter(function (r) { return /^longer/.test(r.why); });
  cut.forEach(function (r) { var got = q('SELECT count(*) AS n, max(length(value)) AS len FROM ' + tab[r.table] + ' WHERE ad_client_id=? AND value=?', [CID, r.erp])[0];
    check('LEN', 'cut-' + r.odoo_id, r.table + ' ' + J(r.odoo) + ' (' + r.odoo.length + ' chars) arrives as ' + J(r.erp) + ' within the ERP length', got.n === 1 && got.len <= 40, got); });
  verdict('LEN');
  // ═══ UU: every address carries the export's id (the identity survives into the ERP) ═══
  var uus = sheetRows('C_Location').slice(1).map(function (r) { return r[uc]; }), have = q('SELECT c_location_uu AS u FROM c_location WHERE ad_client_id=?', [CID]).map(function (r) { return r.u; });
  check('UU', 'carried', 'all ' + uus.length + ' C_Location_UU of the export are in the tenant', uus.length > 0 && uus.every(function (u) { return have.indexOf(u) >= 0; }), { missing: uus.filter(function (u) { return have.indexOf(u) < 0; }).slice(0, 3) });
  verdict('UU');

  var v = ['FALS', 'LOAD', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'LEN', 'UU'].map(verdict);
  var all = v.indexOf('FAIL') >= 0 ? 'FAIL' : v.indexOf('INCONCLUSIVE') >= 0 ? 'INCONCLUSIVE' : 'PASS';
  say('§OM-VERDICT ' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(v));
  process.exit(all === 'PASS' ? 0 : all === 'INCONCLUSIVE' ? 3 : 1);
})().catch(function (e) { say('§OM-ERROR ' + (e && (e.stack || e.message))); process.exit(2); });
