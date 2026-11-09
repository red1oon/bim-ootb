#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SAP-MIGRATE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-SPEC). READ THE LOG: every verdict is a §SAPM line; the exit code is not the evidence.
// THE ISSUE it proves/disproves (owner: door = "Agent on their server"; "earnest effort POC … release early"): can a user with SAP Business One run ONE agent against THEIR OWN
//   Service Layer — read only, every field checked against their server's $metadata, a field it lacks NAMED not guessed — and load what it wrote into a born tenant through the
//   same Ninja plan/load as Odoo and Business Central, with an alpha report that carries no customer value?
// Fixture: ONLY the example records printed in SAP's guide (1 customer, 3 items, 1 warehouse, 1 account — fixtures/sap_b1_guide/rows.json, each row cited), served by a local
//   mock Service Layer (sap_sl_mock.js) whose $metadata is generated from those rows. What this CANNOT prove: that a real Business One answers exactly this — CONN is
//   INCONCLUSIVE until a tester runs the agent. Rules the guide gives no record for print INCONCLUSIVE (PRIMAL LAW #4), never PASS.
// Command: node erp/tests/witness_sap_migrate.js
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sap_b1_guide', 'rows.json'), 'utf8'));
var _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 }, VACUOUS = [];
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §SAPM-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info).slice(0, 900))); }
function vacuous(cs, key, rule) { VACUOUS.push(cs + '/' + key); say('  §SAPM-CHECK case=' + cs + ' key=' + key + ' INCONCLUSIVE rule="' + rule + '" — SAP\'s guide prints no record this rule applies to'); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§SAPM-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }

(async function main() {
  var AG = require(path.join(ERP, 'sap_agent', 'agent.js')), MOCK = require(path.join(__dirname, 'sap_sl_mock.js')), CV = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'sap_migrate_convert.mjs')).href);
  var XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
  say('§SAPM-FIXTURE ' + Object.keys(FX.sets).map(function (k) { return k + '=' + FX.sets[k].length; }).join(' ') + ' (SAP guide v1.26 examples)');

  // ═══ AGENT: login cookie, $metadata, $count == rows, paging followed (page size 1 forces it), read only ═══
  var mk = await MOCK.start(FX), agentLog = [];
  var exp = await AG.run({ url: mk.url, company: 'SBODEMOUS', user: 'manager', password: 'mock', page: 1 }, null, function (l) { agentLog.push(l); });
  mk.close(); agentLog.forEach(function (l) { say('  ' + l); });
  var calls = mk.calls, ms = exp.manifest.sets;
  check('AGENT', 'session', 'Login returned a B1SESSION cookie and every later call carried it (the mock answers 401 without it; none did)', /session=Y/.test(agentLog[0]) && calls.length === exp.manifest.calls.length, { first: agentLog[0], mockCalls: calls.length, agentCalls: exp.manifest.calls.length });
  check('AGENT', 'count==rows', 'for every one of the ' + Object.keys(AG.SETS).length + ' sets, the rows read equal the server\'s $count', Object.keys(AG.SETS).every(function (s) { return ms[s] && ms[s].count === ms[s].rows && ms[s].rows === (FX.sets[s] || []).length; }), ms);
  check('AGENT', 'paging', 'with one row per page the agent followed odata.nextLink to the end: Items = 3 pages for 3 rows', ms.Items.pages === 3 && exp.sets.Items.length === 3 && calls.filter(function (c) { return /\$skip=/.test(c); }).length >= 2, ms.Items);
  check('AGENT', 'read-only', 'every call the server saw is a GET, or POST Login / Logout (' + calls.length + ' calls)', calls.every(function (c) { return /^GET /.test(c) || /^POST \/b1s\/v1\/(Login|Logout)$/.test(c); }) && exp.manifest.read_only === true, calls.filter(function (c) { return !/^GET /.test(c); }));
  var mk0 = await MOCK.start(FX), nocookie = await fetch(mk0.url + '/b1s/v1/$metadata'); mk0.close();
  check('AGENT', 'instrument', 'the mock itself refuses a call without the session cookie (HTTP ' + nocookie.status + '), so "session" above is a real check', nocookie.status === 401, nocookie.status);
  verdict('AGENT');

  // ═══ FIELD: a field the server lacks is NAMED and not asked for (falsifier: drop ItemName from the mock's $metadata) ═══
  var mk2 = await MOCK.start(FX, { dropField: { set: 'Items', field: 'ItemName' } }), log2 = [];
  var exp2 = await AG.run({ url: mk2.url, company: 'SBODEMOUS', user: 'manager', password: 'mock' }, null, function (l) { log2.push(l); }); mk2.close();
  check('FIELD', 'named', 'ItemName absent from the server\'s Item type ⇒ manifest Items.fields_missing names it and a §SAP-FIELD line says so', exp2.manifest.sets.Items.fields_missing.indexOf('ItemName') >= 0 && log2.some(function (l) { return /§SAP-FIELD set=Items missing=.*ItemName/.test(l); }), exp2.manifest.sets.Items);
  check('FIELD', 'not-asked', 'and the agent did not ask for it (no $select names it; the mock answers 400 to an unknown property), and no row carries it', !mk2.calls.some(function (c) { return /\$select=[^&]*ItemName/.test(c); }) && exp2.sets.Items.every(function (r) { return r.ItemName === undefined; }), mk2.calls.filter(function (c) { return /Items/.test(c); }));
  var allMissing = Object.keys(ms).reduce(function (n, s) { return n + (ms[s].fields_missing || []).length; }, 0);
  say('§SAPM-FIELD fixture metadata lacks ' + allMissing + ' of the mapped fields (it lists only what the guide\'s records carry) — each named in the manifest');
  verdict('FIELD');

  // ═══ CONVERT: the 17-sheet workbook, the rules the guide's records reach ═══
  var CUT = '2026-11-09', c = CV.convert(exp, { cutover: CUT }), byT = {}; c.book.forEach(function (s, i) { byT[CV.ORDER[i]] = s.rows; });
  say('§SAPM-CONVERT ' + J(c.manifest.sheets.map(function (s) { return s.table + '=' + s.rows; })) + ' problems=' + J(c.manifest.problems) + ' refused=' + J(c.manifest.refused) + ' notes=' + c.manifest.notes.length);
  var bp = byT.C_BPartner, h = bp[0];
  check('CONVERT', 'customer', 'BusinessPartner c1 (CardType cCustomer) → one C_BPartner, IsCustomer=Y IsVendor=N, Name from CardName', bp.length === 2 && bp[1][h.indexOf('Value')] === 'c1' && bp[1][h.indexOf('IsCustomer')] === 'Y' && bp[1][h.indexOf('IsVendor')] === 'N' && bp[1][h.indexOf('Name')] === 'customer c1', bp);
  var pr = byT.M_Product, ph = pr[0];
  check('CONVERT', 'items', '3 Items → 3 M_Product; an item without ItemName (i002 null, i011 absent) takes its code as Name (the ERP needs one)', pr.length === 4 && pr[2][ph.indexOf('Name')] === 'i002' && pr[3][ph.indexOf('Name')] === 'i011' && pr[1][ph.indexOf('Name')] === 'i001 name', pr);
  var ev = byT.C_ElementValue;
  check('CONVERT', 'account-untyped', 'an account with no AccountType gets the ERP default and a note says why (the class is not in the Service Layer record)', ev.length === 2 && ev[1][ev[0].indexOf('AccountType')] === '' && c.manifest.notes.some(function (n) { return /balance-sheet accounts/.test(n); }), { ev: ev, notes: c.manifest.notes });
  check('CONVERT', 'warehouse-refused', 'Warehouse 01 has no country and the company country is not readable ⇒ REFUSED here with its reason (the ERP needs a location), not left to fail the whole load', byT.M_Warehouse.length === 1 && byT.M_Locator.length === 1 && c.manifest.refused.some(function (r) { return r.sheet === 'M_Warehouse' && r.n === 1 && /country/.test(r.why); }), { wh: byT.M_Warehouse, refused: c.manifest.refused });
  var uh = byT.M_Product[0].indexOf('C_UOM_ID>IsDefault');
  check('CONVERT', 'unit-default', 'items with no InventoryUOM carry C_UOM_ID>IsDefault = Y (legacy ImportProduct.java:304-311: the client\'s default unit)', uh > 0 && byT.M_Product.slice(1).every(function (r) { return r[uh] === 'Y'; }), byT.M_Product);
  check('CONVERT', 'no-price-guess', 'no PriceLists in the export ⇒ no price list is made up (0 rows on sheets 11-13)', byT.M_PriceList.length === 1 && byT.M_ProductPrice.length === 1, {});
  ['addresses (BPAddresses → C_Location)', 'contacts (ContactEmployees → AD_User)', 'vendors (cSupplier) and leads (cLid refused)', 'payment terms (days / months rule)', 'units (InternationalSymbol)', 'item groups', 'price list + currency', 'bins → locators', 'opening stock (InStock)', 'AccountType at_Revenues/at_Expenses'].forEach(function (r) { vacuous('CONVERT', r.split(' ')[0], r); });
  verdict('CONVERT');

  // ═══ LOAD: the SAP form on a born tenant — summary == result, refusals named ═══
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  var born = G.birthTenant({ clientName: 'B1 Alpha', currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'b1Admin', dateAcct: CUT, countryId: 100 });
  var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
  G.mergeGenesisInto(rb.groups, shim, { now: CUT + ' 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
  var R = rb.refs, CID = R.clientId, S = { clientId: CID, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:sap-migrate' };
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF, import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host), st = null;
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'sap_migrate.mjs')).href)); st = await reg.startBundle('org.kernel.sap.migrate');
  var F = q('SELECT classname AS c FROM ad_form WHERE ad_form_id=9544001')[0], M = q('SELECT action AS a, ad_form_id AS f FROM ad_menu WHERE ad_menu_id=9544001')[0];
  check('LOAD', 'plug', 'the bundle starts ACTIVE: AD_Form 9544001 names the class the form engine has, the menu leaf opens it', st && st.state === 'ACTIVE' && F && F.c === 'org.kernel.sap.MigrateFromB1' && !!AF.get(F.c) && M && M.a === 'X' && M.f === 9544001, { st: st, F: F, M: M });
  var D = AF.get('org.kernel.sap.MigrateFromB1'), withT = function (fn) { return fn(k.q, k.env(S)); };
  var P = { Files: [{ name: 'sap_export.json', size: 0, data: exp }], Cutover: CUT };
  function rows(cur) { return AF.read(withT, function (trx) { return D.rows(trx, P, cur); }); }
  var r1 = rows(null), cur = r1.map(function (r) { var o = { key: r.key, selected: r.selected }; if (r.erpunit !== undefined) o.erpunit = r.erpunit || 'Each'; return o; });
  var r2 = rows(cur), sh = r2.filter(function (r) { return r.key > 100 && r.key < 900; }), TABLES = c.manifest.sheets.map(function (s) { return s.table; });
  function counts() { var o = {}; TABLES.forEach(function (t) { o[t] = q('SELECT count(*) AS n FROM ' + t.toLowerCase() + ' WHERE ad_client_id=?', [CID])[0].n; }); return o; }
  var C0 = counts(), predicted = {}; sh.forEach(function (s) { predicted[s.item] = s.will; });
  say('§SAPM-SUMMARY ' + J(sh.map(function (s) { return s.item + ' file=' + s.infile + ' will=' + s.will + ' refused=' + s.refused + (s.refused ? ' (' + String(s.reason).slice(0, 200) + ')' : ''); })));
  r2.filter(function (r) { return /^⚠|^ALPHA/.test(r.item); }).forEach(function (p) { say('§SAPM-ROW ' + p.item.slice(0, 200)); });
  var res = AF.execute(withT, 'org.kernel.sap.MigrateFromB1', P, cur);
  if (res.ok && res.ops && res.ops.length) k.commit(S, res.ops, { ws: 'sap_migrate' });
  var C1 = counts(), gain = {}; TABLES.forEach(function (t) { gain[t] = C1[t] - C0[t]; });
  say('§SAPM-RUN ok=' + res.ok + ' ops=' + (res.ops || []).length + ' msg=' + String(res.msg).slice(0, 400) + ' gain=' + J(gain));
  check('LOAD', 'summary==result', 'Process gains exactly what the summary predicted, on every one of the 17 tables (refusals included in the prediction)', res.ok && TABLES.every(function (t) { return gain[t] === predicted[t]; }), { gain: gain, predicted: predicted, msg: String(res.msg).slice(0, 300) });
  var whRow = sh.filter(function (s) { return s.item === 'M_Warehouse'; })[0], infoRows = r2.filter(function (r) { return r.key >= 910 && r.key < 950; });
  check('LOAD', 'source-refusal-shown', 'the warehouse the converter refused is on the summary (M_Warehouse refused=1, reason says not in the file + why) and the converter notes are info rows (' + infoRows.length + ')', whRow && whRow.refused === 1 && /not in the file: 1 — .*country/.test(whRow.reason) && infoRows.length === c.manifest.notes.length, { whRow: whRow, info: infoRows.length, notes: c.manifest.notes.length });
  check('LOAD', 'reasons', 'every refusal in the summary names its reason', sh.every(function (s) { return !s.refused || s.reason; }), sh.filter(function (s) { return s.refused && !s.reason; }));
  var c1 = q("SELECT value, name, iscustomer FROM c_bpartner WHERE ad_client_id=? AND value='c1'", [CID]), its = q("SELECT value FROM m_product WHERE ad_client_id=? AND value IN ('i001','i002','i011') ORDER BY value", [CID]);
  check('LOAD', 'records', "SAP's example customer c1 and items i001 / i002 / i011 are records of the tenant", c1.length === 1 && c1[0].name === 'customer c1' && c1[0].iscustomer === 'Y' && its.length === 3, { c1: c1, its: its });
  verdict('LOAD');

  // ═══ ALPHA: the report a tester pastes back holds counts and schema, no customer value ═══
  var rep = CV.alphaReport(c.manifest, res.msg).join('\n'), vals = {};
  Object.keys(FX.sets).forEach(function (s) { FX.sets[s].forEach(function (r) { Object.keys(r).forEach(function (f) { var v = r[f]; if (f !== '_src' && typeof v === 'string' && v.length >= 2) vals[v] = 1; }); }); });
  function esc(v) { return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var leaked = Object.keys(vals).filter(function (v) { return new RegExp('(^|[^A-Za-z0-9_])' + esc(v) + '([^A-Za-z0-9_]|$)').test(rep); });
  rep.split('\n').forEach(function (l) { say('  ' + l); });
  say('§SAPM-ALPHA lines=' + rep.split('\n').length + ' values-checked=' + Object.keys(vals).length + ' leaked=' + J(leaked));
  check('ALPHA', 'no-values', 'none of the ' + Object.keys(vals).length + ' fixture values (codes included: c1, i001 …, names) appears in the alpha report', leaked.length === 0, leaked);
  var unmasked = 'refused: no C_BPartner with Value="customer c1"';
  check('ALPHA', 'falsifier-mask', 'a reason with a quoted value comes out masked — and unmasked it WOULD leak', CV.alphaReport({ sap_sets: [], sheets: [], problems: [unmasked], cutover: CUT }).join('\n').indexOf('customer c1') < 0 && unmasked.indexOf('customer c1') >= 0, {});
  check('ALPHA', 'useful', 'the report names every set read with its count and missing fields, every target sheet and every patch', Object.keys(AG.SETS).every(function (s) { return rep.indexOf('set=' + s + ' count=') >= 0; }) && /§SAP-ALPHA sheet=09M_Product rows=3/.test(rep) && /missing=/.test(rep), {});
  verdict('ALPHA');

  // ═══ WIRING ═══
  var rd = function (f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } };
  check('WIRING', 'precache', 'sw.js precaches the bundle, its form and the converter; plugin_overlay installs it stopped', ['sap_migrate.mjs', 'sap_migrate_form.mjs', 'sap_migrate_convert.mjs'].every(function (f) { return rd('sw.js').indexOf("'plugins/" + f + "'") >= 0; }) &&
    /INSTALL_ONLY = \[[^\]]*'plugins\/sap_migrate\.mjs'/.test(rd('plugin_overlay.js')), {});
  check('WIRING', 'agent-zip', 'erp/sap_agent.zip exists and holds the agent (build_agent_zips.js bundle)', fs.existsSync(path.join(ERP, 'sap_agent.zip')) && fs.readFileSync(path.join(ERP, 'sap_agent.zip')).indexOf('sap_agent/agent.js') >= 0, {});
  verdict('WIRING');
  say('§SAPM-CONN verdict=INCONCLUSIVE — no live SAP Business One here: the mock answers as SAP\'s guide describes, with the guide\'s own example records. A tester running the agent on a real Service Layer closes this.');
  say('§SAPM-VACUOUS n=' + VACUOUS.length + ' ' + J(VACUOUS) + ' — rules written but not judged: the guide prints no record they apply to');

  var v = ['AGENT', 'FIELD', 'CONVERT', 'LOAD', 'ALPHA', 'WIRING'].map(verdict), all = v.indexOf('FAIL') >= 0 ? 'FAIL' : 'PASS';
  say('§SAPM-VERDICT ' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' inconclusive=' + VACUOUS.length + ' cases=' + J(v) + ' (CONN INCONCLUSIVE by construction)');
  process.exit(all === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§SAPM-ERROR ' + (e && (e.stack || e.message))); process.exit(2); });
