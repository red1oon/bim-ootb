#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BC-MIGRATE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §BC-SPEC). READ THE LOG: every verdict is a §BCM line; the exit code is not the evidence.
// THE ISSUE it proves/disproves (owner: "infer 3rd party ERP data model … rather than need a live service … a stub ready for alpha testers feedback from WITNESS logging"): with NO live
//   Business Central, can a BC company's own export (a RapidStart configuration package, BC's "Export to Excel") be read and loaded into a born tenant, using only what Microsoft
//   publishes (BCApps, MIT)? Fixture: Microsoft's own demo company (Contoso / CRONUS values) extracted from the dataset source by erp/tools/gen_bc_contoso_fixture.js, written here in
//   BC's Excel layout (ConfigExcelExchange.Codeunit.al: row 1 package/caption/TABLE ID, row 3 captions, data from row 4). What this CANNOT prove: that a live BC writes exactly this —
//   the CONN case says INCONCLUSIVE until an alpha tester's file is run (the alpha report is how it reports back).
// Command: node erp/tests/witness_bc_migrate.js
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), FIX = path.join(__dirname, 'fixtures', 'bc_package_contoso', 'rows.json'), BCAPPS = process.env.BCAPPS || path.join(process.env.HOME || '', '.cache', 'bcapps', 'repo');
var _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §BCM-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info).slice(0, 900))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§BCM-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }

(async function main() {
  var MODEL = (await import(url.pathToFileURL(path.join(ERP, 'plugins', 'bc_model.mjs')).href)).default, CV = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'bc_migrate_convert.mjs')).href);
  var XLSX = require(path.join(ERP, 'xlsx.mini.min.js')), FX = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  say('§BCM-MODEL microsoft/BCApps@' + MODEL.commit + ' tables=' + Object.keys(MODEL.tables).length + ' · fixture tables=' + Object.keys(FX.rows).length + ' demo-today=' + FX.today);

  // ═══ MODEL: the generated model equals the published .al files (re-read here) — needs the checkout; without it this case is INCONCLUSIVE, said so ═══
  var base = path.join(BCAPPS, 'src', 'Layers', 'W1', 'BaseApp');
  if (fs.existsSync(base)) {
    var head = require('child_process').execSync('git -C ' + J(BCAPPS) + ' rev-parse HEAD').toString().trim(), bad = [], n = 0;
    Object.keys(MODEL.tables).forEach(function (id) { var t = MODEL.tables[id], src = fs.readFileSync(path.join(BCAPPS, t.file), 'utf8');
      t.fields.forEach(function (f) { n++; var re = new RegExp('field\\(' + f.id + ';\\s*("[^"]+"|[^;]+);\\s*([^)\\r\\n]+?)\\)'), m = re.exec(src);
        if (!m) { bad.push(id + '.' + f.id + ' missing'); return; } var nm = m[1].replace(/^"|"$/g, '').trim(), lm = /\[(\d+)\]/.exec(m[2]);
        if (nm !== f.name || (f.len || null) !== (lm ? Number(lm[1]) : null)) bad.push(id + '.' + f.id + ' ' + nm + '/' + (lm && lm[1]) + ' vs ' + f.name + '/' + f.len); }); });
    check('MODEL', 'equals-source', 'every one of the ' + n + ' fields (id, name, length) in bc_model.mjs is in the .al file it names, checkout ' + head.slice(0, 8) + ' == model ' + String(MODEL.commit).slice(0, 8), head === MODEL.commit && bad.length === 0, { head: head, bad: bad.slice(0, 5) });
  } else say('§BCM-MODEL no BCApps checkout at ' + BCAPPS + ' — the model-vs-source case is not judged here');
  verdict('MODEL');

  // ═══ PACKAGE: the fixture written in BC's own layout (first sheet = caption, others "<id> <caption>" cut to 31; A1/B1/C1; captions on row 3; data from row 4), through SheetJS and back ═══
  var buf = require(path.join(__dirname, 'bc_package_writer.js')).write(XLSX, MODEL, FX, 'CONTOSO-ALPHA'), WB = XLSX.read(buf);
  var pkg = CV.readPackage(WB, MODEL), ids = Object.keys(FX.rows).filter(function (id) { return MODEL.tables[id]; });
  say('§BCM-PACKAGE sheets=' + WB.SheetNames.length + ' ' + J(WB.SheetNames) + ' bytes=' + buf.length);
  check('PACKAGE', 'identified', 'every sheet is identified by its table id in C1 (' + ids.length + ' tables), none skipped', ids.every(function (id) { return pkg.tables[id] && pkg.tables[id].rows.length === FX.rows[id].filter(function (r) { return Object.keys(r).some(function (k) { return k !== '_src' && r[k] !== '' && r[k] != null; }); }).length; }) && pkg.skipped.length === 0,
    { tables: Object.keys(pkg.tables), skipped: pkg.skipped });
  check('PACKAGE', 'headers', 'every row-3 caption is a field of its table in the model — 0 unknown headers over ' + Object.keys(pkg.tables).reduce(function (s, id) { return s + pkg.tables[id].fields.length; }, 0) + ' columns', pkg.unknown.length === 0, pkg.unknown.slice(0, 5));
  // falsifier: one header in another language is NAMED, not guessed
  var WB2 = XLSX.read(buf), cs = WB2.Sheets[WB2.SheetNames.filter(function (n) { return WB2.Sheets[n].C1 && String(WB2.Sheets[n].C1.v) === '18'; })[0]], nmCell = Object.keys(cs).filter(function (a) { return /^[A-Z]+3$/.test(a) && cs[a].v === 'Name'; })[0];
  cs[nmCell] = { t: 's', v: 'Nom' }; var pkg2 = CV.readPackage(WB2, MODEL);
  check('PACKAGE', 'falsifier-header', 'a header BC wrote in another language ("Nom") is listed as unknown and its column is not read', pkg2.unknown.some(function (u) { return u.table === 18 && u.header === 'Nom'; }) && pkg2.tables[18].rows.every(function (r) { return r.Name === undefined; }), pkg2.unknown);
  verdict('PACKAGE');

  // ═══ CONVERT: the 17-sheet workbook; every BC row in exactly one place; the BC rules applied ═══
  var CUT = '2026-11-09', c = CV.convert(pkg, MODEL, { cutover: CUT }), byT = {}; c.book.forEach(function (s, i) { byT[CV.ORDER[i]] = s.rows; });
  say('§BCM-CONVERT ' + J(c.manifest.sheets.map(function (s) { return s.table + '=' + s.rows; })) + ' problems=' + J(c.manifest.problems) + ' refused=' + J(c.manifest.refused) + ' renamed=' + c.manifest.renamed.length);
  var nC = pkg.tables[18].rows.length, nV = pkg.tables[23].rows.length;
  check('CONVERT', 'partners', 'customers ' + nC + ' + vendors ' + nV + ' = C_BPartner rows; a vendor No. that is also a customer No. is renamed "<No.> (Vendor)" and listed', byT.C_BPartner.length - 1 === nC + nV &&
    c.manifest.renamed.filter(function (r) { return r.table === 'C_BPartner'; }).every(function (r) { return / \(Vendor\)$/.test(r.erp); }), { bp: byT.C_BPartner.length - 1, renamed: c.manifest.renamed.slice(0, 3) });
  check('CONVERT', 'items', 'every Item is one M_Product row and one sale price (Unit Price in GL Setup\'s LCY ' + c.manifest.currency + ')', byT.M_Product.length - 1 === pkg.tables[27].rows.length && byT.M_ProductPrice.length - 1 === pkg.tables[27].rows.length && c.manifest.currency === 'GBP', {});
  var cats = byT.C_ElementValue.slice(1), ati = byT.C_ElementValue[0].indexOf('AccountType');
  check('CONVERT', 'accounts', 'G/L accounts: Account Category → A/L/O/R/E (' + cats.filter(function (r) { return r[ati]; }).length + ' of ' + cats.length + ' typed)', cats.length === pkg.tables[15].rows.length && cats.some(function (r) { return r[ati] === 'A'; }) && cats.some(function (r) { return r[ati] === 'R'; }), {});
  var qt = 0; pkg.tables[32].rows.forEach(function (e) { if (String(e['Posting Date']).slice(0, 10) <= CUT) qt += Number(e.Quantity); }); var qs = byT.M_InventoryLine.slice(1).reduce(function (s, r) { return s + Number(r[3]); }, 0);
  check('CONVERT', 'stock', 'opening stock = Σ Quantity of the item ledger entries up to the cutover (' + qt + ') = Σ QtyCount of the lines (' + qs + ')', qt > 0 && Math.abs(qt - qs) < 1e-6, { qt: qt, qs: qs });
  verdict('CONVERT');

  // ═══ LOAD: the BC form on a born tenant — suggested units, summary == result, refusals named ═══
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  try { require(path.join(ERP, 'processes', 'ImportInventory.js')); } catch (e) { say('§E1-STOCK ImportInventory.js not loadable: ' + e.message); }
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  var born = G.birthTenant({ clientName: 'CRONUS Alpha', currencyId: 102, currencyIso: 'GBP', currencyPrecision: 2, adminUser: 'cronusAdmin', dateAcct: CUT, countryId: 100 });
  var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
  G.mergeGenesisInto(rb.groups, shim, { now: CUT + ' 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
  var R = rb.refs, CID = R.clientId, S = { clientId: CID, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:bc-migrate' };
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF, import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host), st = null;
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'bc_migrate.mjs')).href)); st = await reg.startBundle('org.kernel.bc.migrate');
  var F = q('SELECT classname AS c FROM ad_form WHERE ad_form_id=9543001')[0], M = q('SELECT action AS a, ad_form_id AS f FROM ad_menu WHERE ad_menu_id=9543001')[0];
  check('LOAD', 'plug', 'the bundle starts ACTIVE: AD_Form 9543001 names the class the form engine has, the menu leaf opens it', st && st.state === 'ACTIVE' && F && F.c === 'org.kernel.bc.MigrateFromBC' && !!AF.get(F.c) && M && M.a === 'X' && M.f === 9543001, { st: st, F: F, M: M });
  var D = AF.get('org.kernel.bc.MigrateFromBC'), withT = function (fn) { return fn(k.q, k.env(S)); };
  var P = { Files: [{ name: 'CRONUS package.xlsx', size: buf.length, data: XLSX.read(buf) }], Cutover: CUT };
  function rows(cur) { return AF.read(withT, function (trx) { return D.rows(trx, P, cur); }); }
  var r1 = rows(null), units = r1.filter(function (r) { return /^Unit: /.test(r.item); });
  say('§BCM-UNITS ' + J(units.map(function (u) { return u.item + '=' + J(u.erpunit) + ' (' + u.infile + ') ' + u.reason; })));
  var erpByCode = {}; q("SELECT name, x12de355 AS x FROM c_uom WHERE ad_client_id IN (0,?) AND isactive='Y'", [CID]).forEach(function (u) { (erpByCode[u.x] = erpByCode[u.x] || []).push(u.name); });
  var sugg = units.filter(function (u) { return u.erpunit; }), bcUom = {}; pkg.tables[204].rows.forEach(function (u) { bcUom[u.Code] = u['International Standard Code']; });
  check('LOAD', 'unit-suggest', 'a BC unit whose International Standard Code is the X12DE355 of exactly one ERP unit is SUGGESTED as that unit (' + sugg.map(function (u) { return u.item.slice(6) + '→' + u.erpunit; }).join(', ') + ')',
    sugg.length > 0 && sugg.every(function (u) { var code = bcUom[u.item.slice(6)]; return erpByCode[code] && erpByCode[code].length === 1 && erpByCode[code][0] === u.erpunit; }), { units: units });
  var cur = r1.map(function (r) { var o = { key: r.key, selected: r.selected }; if (r.erpunit !== undefined) o.erpunit = r.erpunit || 'Each'; return o; });   // the tester's answer for the rest: Each
  var r2 = rows(cur), sh = r2.filter(function (r) { return r.key > 100 && r.key < 900; }), TABLES = c.manifest.sheets.map(function (s) { return s.table; });
  function counts() { var o = {}; TABLES.forEach(function (t) { o[t] = q('SELECT count(*) AS n FROM ' + t.toLowerCase() + ' WHERE ad_client_id=?', [CID])[0].n; }); return o; }
  var C0 = counts(), predicted = {}; sh.forEach(function (s) { predicted[s.item] = s.will; });
  say('§BCM-SUMMARY ' + J(sh.map(function (s) { return s.item + ' file=' + s.infile + ' will=' + s.will + ' refused=' + s.refused + (s.refused ? ' (' + String(s.reason).slice(0, 160) + ')' : ''); })));
  (r2.filter(function (r) { return /^⚠/.test(r.item); })).forEach(function (p) { say('§BCM-PROBLEM ' + p.item); });
  var res = AF.execute(withT, 'org.kernel.bc.MigrateFromBC', P, cur);
  if (res.ok && res.ops && res.ops.length) k.commit(S, res.ops, { ws: 'bc_migrate' });
  var r2 = res.ok ? AF.executeAfter(withT, 'org.kernel.bc.MigrateFromBC', P, cur) : { ok: false, ops: [], msg: 'stage 1 refused' };
  if (r2.ok && r2.ops && r2.ops.length) k.commit(S, r2.ops, { ws: 'bc_migrate' });
  say('§BCM-AFTER ok=' + r2.ok + ' ops=' + (r2.ops || []).length + ' msg=' + String(r2.msg).slice(0, 300));
  if (res.ok) { var STK = require(path.join(__dirname, 'opening_stock_check.js'))(q, CID, byT.M_InventoryLine[0], byT.M_InventoryLine.slice(1), say, 'BC'); STK.judged ? [] : say('§BCM-STOCK verdict=INCONCLUSIVE nothing judged');
    STK.judged && check('STOCK', 'opening-stock', 'the opening stock is completed: DocStatus CO, on-hand == QtyCount, m_transaction present (' + STK.judged + ' rules judged, ' + STK.failed + ' failed)', STK.judged > 0 && STK.failed === 0, STK); }
  var C1 = counts(), gain = {}; TABLES.forEach(function (t) { gain[t] = C1[t] - C0[t]; });
  say('§BCM-RUN ok=' + res.ok + ' ops=' + (res.ops || []).length + ' msg=' + String(res.msg).slice(0, 400) + ' gain=' + J(gain));
  check('LOAD', 'summary==result', 'Process gains exactly what the summary predicted, on every one of the 17 tables (refusals included in the prediction)', res.ok && TABLES.every(function (t) { return gain[t] === predicted[t]; }), { gain: gain, predicted: predicted, msg: String(res.msg).slice(0, 300) });
  var refusedN = sh.reduce(function (n, s) { return n + (s.refused || 0); }, 0), filed = sh.filter(function (s) { return s.item !== 'C_UOM'; }).reduce(function (n, s) { return n + (Number(s.infile) || 0); }, 0);
  check('LOAD', 'coverage', 'the share of the package that loads, measured (not a pass bar): ' + (filed - refusedN) + ' of ' + filed + ' rows; every refusal names its reason', sh.every(function (s) { return !s.refused || s.reason; }), {});
  var adatum = q("SELECT b.value, l.address1, l.postal, c.countrycode FROM c_bpartner b JOIN c_bpartner_location bl ON bl.c_bpartner_id=b.c_bpartner_id JOIN c_location l ON l.c_location_id=bl.c_location_id JOIN c_country c ON c.c_country_id=l.c_country_id WHERE b.ad_client_id=? AND b.name='Adatum Corporation'", [CID]);
  var ship10000 = pkg.tables[222].rows.filter(function (r) { return r['Customer No.'] === '10000'; }).length;
  check('LOAD', 'record', "Microsoft's demo customer 10000 Adatum Corporation arrives with its own address (Station Road, 21 · CB1 2FB · GB) and its " + ship10000 + ' ship-to addresses as further locations',
    adatum.length === 1 + ship10000 && adatum.some(function (a) { return a.address1 === 'Station Road, 21' && a.postal === 'CB1 2FB' && a.countrycode === 'GB'; }), adatum);
  verdict('LOAD'); verdict('STOCK');

  // ═══ ALPHA: the report a tester pastes back holds counts and schema, no customer value ═══
  var rep = CV.alphaReport(c.manifest, res.msg).join('\n'), vals = {}, SCHEMA = {};   // schema words (table/field captions and names, option and enum values) are not customer data
  Object.keys(MODEL.tables).forEach(function (id) { var t = MODEL.tables[id]; SCHEMA[t.caption] = SCHEMA[t.name] = 1; t.fields.forEach(function (f) { SCHEMA[f.caption] = SCHEMA[f.name] = 1;
    (f.enumValues || []).forEach(function (e) { SCHEMA[e.name] = SCHEMA[e.caption] = 1; }); (f.options || []).concat(f.optionCaptions || []).forEach(function (o) { SCHEMA[o] = 1; }); }); });
  Object.keys(FX.rows).forEach(function (id) { FX.rows[id].forEach(function (r) { Object.keys(r).forEach(function (f) { var v = r[f]; if (f !== '_src' && typeof v === 'string' && v.length >= 5 && !/^\d+$/.test(v) && !SCHEMA[v]) vals[v] = 1; }); }); });
  function esc(v) { return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }   // a value counts as leaked when it stands as its own token (not inside a schema word like "Country/Region")
  var leaked = Object.keys(vals).filter(function (v) { return new RegExp('(^|[^A-Za-z0-9/])' + esc(v) + '([^A-Za-z0-9/]|$)').test(rep); });
  rep.split('\n').forEach(function (l) { say('  ' + l); });
  say('§BCM-ALPHA lines=' + rep.split('\n').length + ' values-checked=' + Object.keys(vals).length + ' leaked=' + leaked.length);
  check('ALPHA', 'no-values', 'none of the ' + Object.keys(vals).length + ' text values of the package (names, addresses, e-mails …) appears in the alpha report', leaked.length === 0, leaked.slice(0, 5));
  var unmasked = 'refused: no C_BPartner with Value="' + 'Adatum Corporation' + '"';
  check('ALPHA', 'falsifier-mask', 'a reason with a quoted value comes out masked (mask) — and unmasked it WOULD leak', CV.mask(unmasked).indexOf('Adatum') < 0 && unmasked.indexOf('Adatum') >= 0, CV.mask(unmasked));
  check('ALPHA', 'useful', 'the report names every BC table read, its rows and headers, every target sheet and every patch', c.manifest.bc_tables.every(function (t) { return rep.indexOf('table=' + t.id + ' ') >= 0; }) && /§BC-ALPHA sheet=09M_Product rows=/.test(rep) && /§BC-ALPHA patch C_Location\.C_Location_UU/.test(rep), {});
  verdict('ALPHA');

  // ═══ WIRING + CONN ═══
  var rd = function (f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } };
  check('WIRING', 'precache', 'sw.js precaches the bundle, its form, the converter and the model; plugin_overlay installs it stopped', ['bc_migrate.mjs', 'bc_migrate_form.mjs', 'bc_migrate_convert.mjs', 'bc_model.mjs'].every(function (f) { return rd('sw.js').indexOf("'plugins/" + f + "'") >= 0; }) &&
    /INSTALL_ONLY = \[[^\]]*'plugins\/bc_migrate\.mjs'/.test(rd('plugin_overlay.js')), {});
  verdict('WIRING');
  say('§BCM-CONN verdict=INCONCLUSIVE — no live Business Central here: the package is built in BC\'s layout from Microsoft\'s source, not exported by a running BC. An alpha tester\'s file closes this.');

  var v = ['MODEL', 'PACKAGE', 'CONVERT', 'LOAD', 'ALPHA', 'WIRING'].map(verdict), all = v.indexOf('FAIL') >= 0 ? 'FAIL' : 'PASS';
  say('§BCM-VERDICT ' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(v) + ' (CONN INCONCLUSIVE by construction)');
  process.exit(all === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§BCM-ERROR ' + (e && (e.stack || e.message))); process.exit(2); });
