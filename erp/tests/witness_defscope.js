#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DEFSCOPE (bim-compiler prompts/FINANCIALS_GROUNDING.md §DEFSCOPE-SPEC, census risks #3 + #4). READ THE LOG after every run: every verdict is a §DEFSCOPE-CHECK line; a PASS with judged=0 is INCONCLUSIVE.
// THE ISSUE it proves/disproves: (D) the default pickers (ad_modelval.js MOrder/MInvoice/MPayment/MMovement/MJournal/MBankStatement/MRequisition, model_order.js default UOM) took ANOTHER client's DocType / PriceList / PaymentTerm /
//   ConversionType / UOM (unscoped `ORDER BY id LIMIT 1`); (P) the posting projection / cost layer (doc_poster.js costQtyUpdates, costUpdatesForMatchPO, costAt, inventory, FX) walked EVERY tenant's accounting schemas
//   and cost elements and fell back to client 11's FX rate. Legacy: MDocType.getOfDocBaseType :70, MPriceList.getDefault :111, MOrder :1322, MConversionType.getDefault :53, MUOM.getDefault_UOM_ID :90,
//   MAcctSchema.getClientAcctSchema :132-165, MCostElement.getMaterialCostElement :56-70, MConversionRate :229-252.
//   TENANT MATRIX: GW (client 11, control) + BORN (genesis) + MIG (genesis + the Odoo fixture migrated), each given its OWN differing rows (default doctypes, price lists, payment term, conversion type, UOM, FX rate, cost elements,
//   a cost row); every default / posting projection is compared, as numbers, to INDEPENDENT SQL written from the legacy query text (client X), never to the code under test.
// MUTANT = the old code: ERP_DIR=<worktree of origin/main>/erp node erp/tests/witness_defscope.js must FAIL (red); the fixed tree must PASS. Nothing judged -> INCONCLUSIVE.
// Command: node erp/tests/witness_defscope.js 2>&1 | tee /tmp/count_logs/mig_defscope.log   (WS_ID_LAW=synthetic runs the page id law)
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.ERP_DIR || path.join(__dirname, '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-10');
// MUTANTS (each re-removes one scope on a COPY of erp/ and re-runs this witness against it; the verdict must be FAIL, named below):
//   noclient_default (clientDefault + default UOM ignore the client) -> D ; schemas_all (_activeSchemas ignores the client) -> P ship/inventory/matchpo ;
//   ce_any (cost elements of any client) -> P ship/costAt/matchpo ; fx11 (fxRate falls back to client 11) -> P fx
if (process.env.MUT && !process.env.DEFSCOPE_MUTATED) {
  var cp = require('child_process'), tmp0 = path.join(require('os').tmpdir(), 'defscope_mut_' + process.env.MUT), tmp = path.join(tmp0, 'erp'), EDIT = function (f, a, b) { var fp = path.join(tmp, f), t = fs.readFileSync(fp, 'utf8'); if (t.indexOf(a) < 0) throw new Error('mutant anchor missing in ' + f + ': ' + a); fs.writeFileSync(fp, t.split(a).join(b)); };
  fs.rmSync(tmp0, { recursive: true, force: true }); fs.cpSync(ERP, tmp, { recursive: true }); fs.cpSync(path.join(ERP, '..', 'common'), path.join(tmp0, 'common'), { recursive: true });
  if (process.env.MUT === 'noclient_default') { EDIT('ad_modelval.js', "'ad_client_id IN (0,?)' : 'ad_client_id=?'", "'? IS NOT NULL' : '? IS NOT NULL'"); EDIT('model_order.js', 'AND ad_client_id IN (0,?) ORDER BY ad_client_id DESC, c_uom_id', 'AND ? IS NOT NULL ORDER BY c_uom_id'); }
  else if (process.env.MUT === 'schemas_all') EDIT('doc_poster.js', "['s.ad_client_id=?']", "['? IS NOT NULL']");
  else if (process.env.MUT === 'ce_any') { EDIT('doc_poster.js', "WHERE ad_client_id=? AND costelementtype='M'", "WHERE ? IS NOT NULL AND costelementtype='M'"); EDIT('doc_poster.js', "WHERE ad_client_id=? AND costingmethod='A'", "WHERE ? IS NOT NULL AND costingmethod='A'"); EDIT('doc_poster.js', "WHERE ad_client_id=? AND costingmethod=? ORDER BY", "WHERE ? IS NOT NULL AND costingmethod=? ORDER BY"); }
  else if (process.env.MUT === 'fx11') EDIT('doc_poster.js', 'num(clientId || 0)', 'num(clientId || 11)');
  else throw new Error('unknown MUT ' + process.env.MUT);
  var rr = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { ERP_DIR: tmp, DEFSCOPE_MUTATED: '1' }), encoding: 'utf8', maxBuffer: 1 << 28 }); process.stdout.write(rr.stdout || ''); process.stderr.write(rr.stderr || '');
  console.log('§DEFSCOPE-MUTANT ' + process.env.MUT + ' -> child rc=' + rr.status + ' (must be 1 = FAIL)'); process.exit(rr.status === 1 ? 0 : 3);
}
var _log = console.log, SHIPPED = []; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§(MIG-|E1-STOCK|ODOO-FORM run|IMPORT_|PROC-)/.test(l)) SHIPPED.push(l); if (/^§(DBG|DEFSCOPE)/.test(l)) _log(l); };
function say(s) { _log(s); }
(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  ['ImportInventory.js', 'ImportGLJournal.js', 'ImportInvoice.js', 'InOutGenerate.js', 'InvoiceGenerate.js'].forEach(function (f) { try { require(path.join(ERP, 'processes', f)); } catch (e) { say('§TRD-LOAD ' + f + ' not loadable: ' + e.message); } });
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  function birth(name) {
    var born = G.birthTenant({ clientName: name, currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: name.replace(/\W/g, '') + 'Admin', dateAcct: '2026-11-10', countryId: 100 });
    var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
    G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-10 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
    var R = rb.refs; return { clientId: R.clientId, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:migration-recover' };
  }
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host);
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate.mjs')).href)); await reg.startBundle('org.kernel.odoo.migrate');
  var CLS = 'org.kernel.odoo.MigrateFromOdoo', D = AF.get(CLS);
  var wbuf = fs.readFileSync(path.join(FIXD, 'odoo_migration.xlsx')), man = JSON.parse(fs.readFileSync(path.join(FIXD, 'manifest.json'), 'utf8')), EXP = JSON.parse(fs.readFileSync(path.join(FIXD, 'odoo_export.json'), 'utf8'));
  function files(exp) { return { Files: [{ name: 'odoo_export.json', size: 1, data: exp || EXP }] }; }   // the CURRENT flow: odoo_export.json alone (the whole book from the engine, stock cost included); the older workbook path carries no cost
  var CUT = EXP.manifest.cutover, ANS = { Units: 'Each', Days: 'Day', Hours: 'Hour' };
  function session(S, loginDate) {
    var withT = function (fn) { return fn(k.q, Object.assign(k.env(S), { date: loginDate + ' 00:00:00' })); };
    return { S: S, rows: function (params, cur) { return AF.read(withT, function (trx) { return D.rows(trx, params, cur); }); },
      execute: function (params, cur) { var r = AF.execute(withT, CLS, params, cur); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'open_balances' }); return r; },
      after: function (params, cur) { var r = AF.executeAfter(withT, CLS, params, cur); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'open_balances' }); return r; } };
  }
  function answer(rs) { return rs.map(function (r) { var o = { key: r.key, selected: r.selected }; if (r.erpunit !== undefined) { var u = r.item.replace(/^Unit: /, ''); o.erpunit = ANS[u] != null ? ANS[u] : r.erpunit; } return o; }); }
  function n(C, t) { return q('SELECT count(*) AS n FROM ' + t + ' WHERE ad_client_id=?', [C])[0].n; }
  function full(S, exp) { var ses = S._ses, f = files(exp), cur = answer(ses.rows(f, null)), r = ses.execute(f, cur), a = r.ok ? ses.after(f, cur) : { ok: false, msg: 'stage 1 refused: ' + r.msg }; return { r: r, a: a, rows: ses.rows(f, cur) }; }
  function mk(name) { var T = birth(name); T._ses = session(T, '2026-11-11'); return T; }

  // ── verdict machinery ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  var CASES = {}, ALL = { judged: 0, failed: 0, vacuous: 0 }, MUT = process.env.MUT || '';
  function J(x) { return JSON.stringify(x); }
  function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
    say('  §DEFSCOPE-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 900))); }
  function vacuous(cs, key, why) { ALL.vacuous++; say('  §DEFSCOPE-VACUOUS case=' + cs + ' key=' + key + ' (not judged) ' + why); }
  var MV = require(path.join(ERP, 'ad_modelval.js')), P = require(path.join(ERP, 'doc_poster.js'));
  var flat = function (a) { return [].concat.apply([], [].slice.call(a)).filter(function (v) { return v !== undefined; }); };
  var pdb = { prepare: function (sql) { return { get: function () { return q(sql, flat(arguments))[0]; }, all: function () { return q(sql, flat(arguments)); } }; } };   // doc_poster's better-sqlite shape over the kernel db
  function ins(t, row) { var cs = Object.keys(row); db.run('INSERT INTO ' + t + ' (' + cs.join(',') + ') VALUES (' + cs.map(function () { return '?'; }).join(',') + ')', cs.map(function (c) { return row[c] === undefined ? null : row[c]; })); }
  var SEQ = 9000000; function nid() { return ++SEQ; }
  function clone(t, where, wp, over) { var r = q('SELECT * FROM ' + t + ' WHERE ' + where, wp)[0]; if (!r) throw new Error('clone: no ' + t + ' row for ' + where); Object.assign(r, over);
    if (r[t + '_uu'] !== undefined) r[t + '_uu'] = 'defscope-' + nid(); ins(t, r); return r; }
  var one = function (sql, p) { var r = q(sql, p || [])[0]; return r ? Object.assign({}, r) : null; };
  var val = function (sql, p) { var r = one(sql, p); if (!r) return null; var k = Object.keys(r)[0]; return r[k] == null ? null : Number(r[k]); };
  function hook(name) { var f = null; Object.keys(MV.REGISTRY).forEach(function (t) { Object.keys(MV.REGISTRY[t]).forEach(function (ti) { MV.REGISTRY[t][ti].forEach(function (e) { if (e.name === name && !f) f = e; }); }); }); return f; }
  function fire(name, rec, ctx) { var h = hook(name); if (!h) return { missing: true }; var info = { table: 'x', record: rec, derived: {} }, err = h.fn(ctx || {}, info); return { err: err, d: info.derived }; }

  // ── GW PRISTINE (before any tenant exists): the origin/main-equivalent golden picks of the control tenant ───────────────────────────────────────────
  // ── D: every default block, per tenant, vs INDEPENDENT SQL of the legacy query ────────────────────────────────────────────────────────────────
  // [hook, record(T), ctx, derived key, expected-SQL(T) -> [sql, params], clientOK(sys)]
  var NE = "docbasetype=? AND isactive='Y'";
  var PR = [
    ['MOrder.docTypeTargetDefault.SO', 'MOrder.docTypeTargetDefault', function (T) { return { ad_client_id: T.C, ad_org_id: T.O }; }, { issotrx: 'Y' }, 'c_doctypetarget_id', function (T) { return ["SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='SOO' AND docsubtypeso='SO' AND isactive='Y' ORDER BY c_doctype_id", [T.C]]; }],
    ['MOrder.docTypeTargetDefault.PO', 'MOrder.docTypeTargetDefault', function (T) { return { ad_client_id: T.C, ad_org_id: T.O }; }, { issotrx: 'N' }, 'c_doctypetarget_id', function (T) { return ["SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='POO' AND docsubtypeso IS NULL AND isactive='Y' ORDER BY c_doctype_id", [T.C]]; }],
    ['MOrder.paymentTermDefault', 'MOrder.paymentTermDefault', function (T) { return { ad_client_id: T.C }; }, {}, 'c_paymentterm_id', function (T) { return ["SELECT c_paymentterm_id FROM c_paymentterm WHERE ad_client_id=? AND isdefault='Y' AND isactive='Y' ORDER BY c_paymentterm_id", [T.C]]; }],
    ['MOrder.priceListDefault.SO (already scoped: control)', 'MOrder.priceListDefault', function (T) { return { ad_client_id: T.C, issotrx: 'Y' }; }, {}, 'm_pricelist_id', function (T) { return ["SELECT m_pricelist_id FROM m_pricelist WHERE ad_client_id=? AND isdefault='Y' AND issopricelist='Y' AND isactive='Y' ORDER BY m_pricelist_id", [T.C]]; }],
    ['MInvoice.priceListDefault.SO', 'MInvoice.priceListDefault', function (T) { return { ad_client_id: T.C, issotrx: 'Y' }; }, {}, 'm_pricelist_id', function (T) { return ["SELECT m_pricelist_id FROM m_pricelist WHERE ad_client_id=? AND issopricelist='Y' AND isactive='Y' ORDER BY isdefault DESC, m_pricelist_id", [T.C]]; }],
    ['MInvoice.priceListDefault.PO', 'MInvoice.priceListDefault', function (T) { return { ad_client_id: T.C, issotrx: 'N' }; }, {}, 'm_pricelist_id', function (T) { return ["SELECT m_pricelist_id FROM m_pricelist WHERE ad_client_id=? AND issopricelist='N' AND isactive='Y' ORDER BY isdefault DESC, m_pricelist_id", [T.C]]; }],
    ['MInvoice.docTypeTargetDefault.ARI', 'MInvoice.docTypeTargetDefault', function (T) { return { ad_client_id: T.C, ad_org_id: T.O, issotrx: 'Y' }; }, {}, 'c_doctypetarget_id', function (T) { return ["SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='ARI' AND ad_org_id IN (0,?) AND isactive='Y' ORDER BY isdefault DESC, ad_org_id DESC, c_doctype_id", [T.C, T.O]]; }],
    ['MInvoice.docTypeTargetDefault.API', 'MInvoice.docTypeTargetDefault', function (T) { return { ad_client_id: T.C, ad_org_id: T.O, issotrx: 'N' }; }, {}, 'c_doctypetarget_id', function (T) { return ["SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='API' AND ad_org_id IN (0,?) AND isactive='Y' ORDER BY isdefault DESC, ad_org_id DESC, c_doctype_id", [T.C, T.O]]; }],
    ['MInvoice.paymentTermDefault', 'MInvoice.paymentTermDefault', function (T) { return { ad_client_id: T.C }; }, {}, 'c_paymentterm_id', function (T) { return ["SELECT c_paymentterm_id FROM c_paymentterm WHERE ad_client_id=? AND isdefault='Y' AND isactive='Y' ORDER BY c_paymentterm_id", [T.C]]; }],
    ['MPayment.docTypeReceipt.ARR', 'MPayment.docTypeReceipt', function (T) { return { ad_client_id: T.C, isreceipt: 'Y' }; }, {}, 'c_doctype_id', function (T) { return ["SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='ARR' AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id", [T.C]]; }],
    ['MPayment.docTypeReceipt.APP', 'MPayment.docTypeReceipt', function (T) { return { ad_client_id: T.C, isreceipt: 'N' }; }, {}, 'c_doctype_id', function (T) { return ["SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='APP' AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id", [T.C]]; }],
    ['MMovement.docTypeDefault', 'MMovement.docTypeDefault', function (T) { return { ad_client_id: T.C }; }, {}, 'c_doctype_id', function (T) { return ["SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='MMM' AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id", [T.C]]; }],
    ['MBankStatement.docTypeDefault', 'MBankStatement.docTypeDefault', function (T) { return { ad_client_id: T.C }; }, {}, 'c_doctype_id', function (T) { return ["SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='CMB' AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id", [T.C]]; }],
    ['MRequisition.priceListDefault', 'MRequisition.priceListDefault', function (T) { return { ad_client_id: T.C }; }, {}, 'm_pricelist_id', function (T) { return ["SELECT COALESCE((SELECT m_pricelist_id FROM m_pricelist WHERE ad_client_id=? AND isdefault='Y' AND issopricelist='N' AND isactive='Y' ORDER BY m_pricelist_id LIMIT 1), (SELECT m_pricelist_id FROM m_pricelist WHERE ad_client_id=? AND isdefault='Y' AND issopricelist='Y' AND isactive='Y' ORDER BY m_pricelist_id LIMIT 1))", [T.C, T.C]]; }],
    ['MJournal.conversionTypeDefault', 'MJournal.conversionTypeDefault', function (T) { return { ad_client_id: T.C }; }, {}, 'c_conversiontype_id', function (T) { return ["SELECT c_conversiontype_id FROM c_conversiontype WHERE ad_client_id IN (0,?) AND isactive='Y' ORDER BY isdefault DESC, ad_client_id DESC", [T.C]]; }]
  ];
  var pairsOf = function (ups) { return ups.map(function (u) { return u.c_acctschema_id + '/' + u.m_costelement_id; }).sort(); };
  var GW0 = {}, TEN0 = { C: 11, O: 11 };
  PR.forEach(function (p) { var r = fire(p[1], p[2](TEN0), p[3]); GW0[p[0]] = r.missing ? 'missing' : (r.d[p[4]] == null ? null : Number(r.d[p[4]])); });
  var GWS0 = pairsOf(P.costQtyUpdates(pdb, 100));
  say('§DEFSCOPE-GOLDEN-PRISTINE gw_picks=' + J(GW0) + ' gw_ship_pairs=' + J(GWS0));
  // ── the tenants: GW (control), BORN, MIG (migrated) ───────────────────────────────────────────────────────────────────────────────────────────
  var BORN = birth('Alpha Co'), MIGT = mk('Trade Co'), FM = full(MIGT);
  say('§DEFSCOPE-SETUP born=' + BORN.clientId + ' migrated=' + MIGT.clientId + ' stage1=' + FM.r.ok + ' stage2=' + FM.a.ok + ' shipped=' + SHIPPED.length);
  var TEN = [{ name: 'GW', C: 11, O: 11, S: { clientId: 11, orgId: 11, userId: 100, roleId: 102 } },
             { name: 'BORN', C: BORN.clientId, O: BORN.orgId, S: BORN }, { name: 'MIG', C: MIGT.clientId, O: MIGT.orgId, S: MIGT }];
  // give every non-GW tenant ITS OWN differing rows (ids above every GW id; GW is never edited)
  function differ(T) {
    var C = T.C, O = T.O;
    [['SOO', "docsubtypeso='SO'"], ['POO', 'docsubtypeso IS NULL'], ['ARI', '1=1'], ['API', '1=1'], ['ARR', '1=1'], ['APP', '1=1'], ['MMM', '1=1'], ['CMB', '1=1']].forEach(function (b) {
      clone('c_doctype', "ad_client_id=11 AND docbasetype=? AND " + b[1] + " ORDER BY c_doctype_id LIMIT 1", [b[0]], { c_doctype_id: nid(), ad_client_id: C, ad_org_id: 0, isdefault: 'Y', name: 'DEFSCOPE ' + b[0] + ' ' + C, printname: 'DEFSCOPE ' + b[0] + ' ' + C, isactive: 'Y' }); });
    clone('m_pricelist', 'm_pricelist_id=101', [], { m_pricelist_id: nid(), ad_client_id: C, ad_org_id: 0, isdefault: 'Y', issopricelist: 'Y', isactive: 'Y', name: 'DEFSCOPE SO ' + C });
    clone('m_pricelist', 'm_pricelist_id=102', [], { m_pricelist_id: nid(), ad_client_id: C, ad_org_id: 0, isdefault: 'Y', issopricelist: 'N', isactive: 'Y', name: 'DEFSCOPE PO ' + C });
    clone('c_paymentterm', 'c_paymentterm_id=105', [], { c_paymentterm_id: nid(), ad_client_id: C, ad_org_id: 0, isdefault: 'Y', isactive: 'Y', name: 'DEFSCOPE PT ' + C, value: 'DEFSCOPE' + C });
    clone('c_conversiontype', 'c_conversiontype_id=114', [], { c_conversiontype_id: nid(), ad_client_id: C, ad_org_id: 0, isdefault: 'Y', isactive: 'Y', name: 'DEFSCOPE CT ' + C, value: 'DEFSCOPE' + C });
    clone('c_uom', 'c_uom_id=100', [], { c_uom_id: nid(), ad_client_id: C, ad_org_id: 0, isdefault: 'Y', isactive: 'Y', name: 'DEFSCOPE UOM ' + C, x12de355: 'DS' + (C % 100), uomsymbol: 'DS' });
    clone('c_conversion_rate', 'c_currency_id=100 AND c_currency_id_to=102 AND ad_client_id=11 ORDER BY multiplyrate DESC', [], { c_conversion_rate_id: nid(), ad_client_id: C, ad_org_id: 0, multiplyrate: 0.5, dividerate: 2 });
  }
  TEN.filter(function (t) { return t.C !== 11; }).forEach(differ);

  var GWPICK = {}, nBlocks = PR.length;
  PR.forEach(function (p) { TEN.forEach(function (T) {
    var key = p[0] + '@' + T.name, exp = (function () { var e = p[5](T); return val(e[0], e[1]); })(), expGW = (function () { var e = p[5](TEN[0]); return val(e[0], e[1]); })();
    var r = fire(p[1], p[2](T), p[3]); if (r.missing) { check('D', key, 'the hook ' + p[1] + ' is registered', false, { missing: true }); return; }
    var got = r.d[p[4]] == null ? null : Number(r.d[p[4]]);
    if (T.name === 'GW') { GWPICK[p[0]] = got; check('D', key, 'GW control: after the tenants exist the hook still picks exactly the legacy-query row of client 11 AND the pristine pick of origin/main (' + J(GW0[p[0]]) + ')', got === exp && got === GW0[p[0]], { got: got, exp: exp, pristine: GW0[p[0]] }); return; }
    if (exp === expGW) { vacuous('D', key, 'tenant expectation equals GW expectation (' + exp + '): an unscoped query could not be told apart'); return; }
    var owner = got == null ? null : val('SELECT ad_client_id FROM ' + ({ c_doctypetarget_id: 'c_doctype', c_doctype_id: 'c_doctype', c_paymentterm_id: 'c_paymentterm', m_pricelist_id: 'm_pricelist', c_conversiontype_id: 'c_conversiontype' })[p[4]] + ' WHERE ' + ({ c_doctypetarget_id: 'c_doctype_id', c_doctype_id: 'c_doctype_id', c_paymentterm_id: 'c_paymentterm_id', m_pricelist_id: 'm_pricelist_id', c_conversiontype_id: 'c_conversiontype_id' })[p[4]] + '=?', [got]);
    check('D', key, 'tenant ' + T.name + ' (client ' + T.C + ') default == independent legacy SQL (' + exp + '), owned by client ' + T.C + (p[1] === 'MJournal.conversionTypeDefault' ? ' or System' : ''), got === exp && (got == null || owner === T.C || (p[1] === 'MJournal.conversionTypeDefault' && owner === 0)), { got: got, exp: exp, owner: owner, gw: expGW });
  }); });
  // UOM (model_order.js m_inoutline.beforeSave: MUOM.getDefault_UOM_ID): a real m_inoutline save-hook on a shipment of the tenant
  TEN.forEach(function (T) {
    var io = clone('m_inout', 'm_inout_id=100', [], { m_inout_id: nid(), ad_client_id: T.C, ad_org_id: T.O, processed: 'N', docstatus: 'DR', documentno: 'DEFSCOPE' + T.C });
    var trx = new ML.Trx(k.q, Object.assign(k.env(T.S), { date: '2026-11-11 00:00:00' })), l = { m_inout_id: io.m_inout_id, ad_client_id: T.C, ad_org_id: T.O, qtyentered: 1, movementqty: 1 };
    try { ML.MODEL.m_inoutline.beforeSave(trx, l, true); } catch (e) { /* later validation may refuse; only the default UOM is judged */ }
    var exp = val("SELECT c_uom_id FROM c_uom WHERE ad_client_id IN (0,?) AND isdefault='Y' AND isactive='Y' ORDER BY ad_client_id DESC, c_uom_id", [T.C]), got = l.c_uom_id == null ? null : Number(l.c_uom_id);
    var expGW = val("SELECT c_uom_id FROM c_uom WHERE ad_client_id IN (0,11) AND isdefault='Y' AND isactive='Y' ORDER BY ad_client_id DESC, c_uom_id", []);
    if (T.name !== 'GW' && exp === expGW) return vacuous('D', 'MInOutLine.defaultUOM@' + T.name, 'same as GW');
    check('D', 'MInOutLine.defaultUOM@' + T.name, 'default UOM == MUOM.getDefault_UOM_ID (client ' + T.C + ' else System) ' + exp, got === exp, { got: got, exp: exp });
  });
  nBlocks += 1;

  // ── P: posting projection / cost layer on documents of the tenant ─────────────────────────────────────────────────────────────────────────────
  var snapGW = function () { return J([q('SELECT COUNT(*) n, SUM(currentcostprice) p, SUM(currentqty) qq FROM m_cost WHERE ad_client_id=11')[0], q('SELECT COUNT(*) n FROM fact_acct WHERE ad_client_id=11')[0]]); };
  var gw0 = snapGW();
  var elemsOf = function (C) { return q("SELECT m_costelement_id AS e FROM m_costelement WHERE ad_client_id=? AND costelementtype='M' AND costingmethod IS NOT NULL AND costingmethod<>'' AND isactive='Y'", [C]).map(function (r) { return r.e; }); };
  var schemasOf = function (C) { return q("SELECT s.c_acctschema_id AS s FROM c_acctschema s WHERE s.ad_client_id=? AND s.isactive='Y' AND EXISTS (SELECT 1 FROM c_acctschema_gl g WHERE g.c_acctschema_id=s.c_acctschema_id) AND EXISTS (SELECT 1 FROM c_acctschema_default d WHERE d.c_acctschema_id=s.c_acctschema_id)", [C]).map(function (r) { return r.s; }); };
  var expPairs = function (C) { var o = []; schemasOf(C).forEach(function (s) { elemsOf(C).forEach(function (e) { o.push(s + '/' + e); }); }); return o.sort(); };
  var GWP = {};
  TEN.forEach(function (T) {
    var C = T.C, sch = schemasOf(C), els = elemsOf(C);
    if (T.name === 'GW') {   // GW control: an existing GW shipment and Physical Inventory
      var u = P.costQtyUpdates(pdb, 100); GWP.ship = pairsOf(u);
      check('P', 'ship@GW', 'GW control: costQtyUpdates(shipment 100) touches exactly GW schemas x GW material elements (' + expPairs(11).length + ' pairs) and the pristine pairs of origin/main', J(pairsOf(u)) === J(expPairs(11)) && J(pairsOf(u)) === J(GWS0) && expPairs(11).length > 0, { got: pairsOf(u).length, exp: expPairs(11).length });
      return;
    }
    if (!sch.length || !els.length) return vacuous('P', 'ship@' + T.name, 'tenant has no schema/material element');
    // the tenant's own product, a cost row under ITS schema + element, a shipment and a Physical Inventory of ITS client
    var cat = val('SELECT m_product_category_id FROM m_product_category WHERE ad_client_id=? ORDER BY m_product_category_id', [C]);
    var prod = clone('m_product', 'm_product_id=136', [], { m_product_id: nid(), ad_client_id: C, ad_org_id: 0, value: 'DS' + C, name: 'DEFSCOPE prod ' + C, m_product_category_id: cat, isstocked: 'Y', producttype: 'I' });
    var as = one('SELECT * FROM c_acctschema WHERE c_acctschema_id=?', [sch[0]]);
    els.forEach(function (e) { clone('m_cost', 'ad_client_id=11 AND m_costelement_id=100 AND c_acctschema_id=101 LIMIT 1', [], { ad_client_id: C, ad_org_id: 0, m_product_id: prod.m_product_id, c_acctschema_id: sch[0], m_costtype_id: as.m_costtype_id, m_costelement_id: e, currentcostprice: 7.5, currentqty: 100, cumulatedamt: 750, cumulatedqty: 100 }); });
    var io = clone('m_inout', 'm_inout_id=100', [], { m_inout_id: nid(), ad_client_id: C, ad_org_id: T.O, documentno: 'DS-SHIP-' + C });
    q('SELECT 1').length; var il = q('SELECT * FROM m_inoutline WHERE m_inout_id=100')[0]; il.m_inoutline_id = nid(); il.m_inout_id = io.m_inout_id; il.ad_client_id = C; il.m_product_id = prod.m_product_id; il.movementqty = 3; if (il.m_inoutline_uu !== undefined) il.m_inoutline_uu = 'defscope-' + nid(); ins('m_inoutline', il);
    var ups = P.costQtyUpdates(pdb, io.m_inout_id), got = pairsOf(ups), exp = expPairs(C);
    check('P', 'ship@' + T.name, 'costQtyUpdates(shipment of ' + T.name + ') touches exactly its OWN schemas x material elements (' + exp.length + ' pairs), none of client 11 / the other tenants', J(got) === J(exp) && exp.length > 0, { got: got, exp: exp });
    var foreign = ups.filter(function (x) { return schemasOf(C).indexOf(x.c_acctschema_id) < 0; }).length;
    check('P', 'ship-foreign@' + T.name, 'no cost update of the shipment points at a schema of another client', foreign === 0, { foreign: foreign });
    // costAt: the cost element resolved for the tenant's schema is the tenant's own (price 7.5 from ITS m_cost row; GW element 100/... would read no row)
    var meth = as.costingmethod, ownEl = val("SELECT m_costelement_id FROM m_costelement WHERE ad_client_id=? AND costingmethod=? ORDER BY m_costelement_id", [C, meth]), ca = P.costAt(pdb, prod.m_product_id, 2, sch[0], null);
    check('P', 'costAt@' + T.name, 'costAt(product x2, tenant schema, method ' + meth + ') == 2 x 7.5 from the tenant\'s own element ' + ownEl + ' (15.0000)', ownEl != null && Number(ca) === 15, { got: ca, ownEl: ownEl });
    // Physical Inventory: the tenant's product has cost under ITS schema; another tenant's schema must not refuse the document nor be walked
    var inv = clone('m_inventory', 'm_inventory_id=100', [], { m_inventory_id: nid(), ad_client_id: C, ad_org_id: T.O, documentno: 'DS-INV-' + C });
    var line = q('SELECT * FROM m_inventoryline WHERE m_inventory_id=100')[0]; line.m_inventoryline_id = nid(); line.m_inventory_id = inv.m_inventory_id; line.ad_client_id = C; line.m_product_id = prod.m_product_id; line.qtybook = 0; line.qtycount = 4; if (line.m_inventoryline_uu !== undefined) line.m_inventoryline_uu = 'defscope-' + nid(); ins('m_inventoryline', line);
    var iu = P.costQtyUpdatesFor(pdb, 'M_Inventory', inv.m_inventory_id);
    check('P', 'inventory@' + T.name, 'costQtyUpdatesFor(M_Inventory of ' + T.name + ') is not refused by another tenant\'s schema and touches only its own pairs', J(pairsOf(iu)) === J(exp) && exp.length > 0, { got: pairsOf(iu), exp: exp });
    // FX: a rate that exists for client 11 ONLY (301 -> 100) is never used for this tenant; its own rate (100 -> 102) is
    var onlyGW = val('SELECT COUNT(*) FROM c_conversion_rate WHERE c_currency_id=301 AND c_currency_id_to=100 AND ad_client_id<>11', []), rGWonly = P.fxRate(pdb, 301, 100, '2026-11-11', C, 0), rOwn = P.fxRate(pdb, 100, 102, '2026-11-11', C, 0), rNoClient = P.fxRate(pdb, 301, 100, '2026-11-11', undefined, 0);
    var ownRate = val('SELECT multiplyrate FROM c_conversion_rate WHERE ad_client_id=? AND c_currency_id=100 AND c_currency_id_to=102', [C]);
    check('P', 'fx@' + T.name, 'fxRate for ' + T.name + ': GW-only pair -> none; own pair -> own rate ' + ownRate + '; NO client given -> never client 11\'s rate', onlyGW === 0 && rGWonly == null && Number(rOwn) === ownRate && rNoClient == null, { rGWonly: rGWonly, rOwn: rOwn, ownRate: ownRate, rNoClient: rNoClient });
    // MatchPO (Average PO): the tenant's schema is set to Average PO with ITS own A element; the cost element + FX come from the tenant
    db.run("UPDATE c_acctschema SET costingmethod='A' WHERE c_acctschema_id=?", [sch[0]]);
    var aEl = clone('m_costelement', 'm_costelement_id=103', [], { m_costelement_id: nid(), ad_client_id: C, ad_org_id: 0, name: 'DEFSCOPE Average PO ' + C, costingmethod: 'A', costelementtype: 'M' });
    clone('m_cost', 'ad_client_id=11 AND m_costelement_id=100 AND c_acctschema_id=101 LIMIT 1', [], { ad_client_id: C, ad_org_id: 0, m_product_id: prod.m_product_id, c_acctschema_id: sch[0], m_costtype_id: as.m_costtype_id, m_costelement_id: aEl.m_costelement_id, currentcostprice: 10, currentqty: 10, cumulatedamt: 100, cumulatedqty: 10 });
    var mp0 = q('SELECT * FROM m_matchpo WHERE m_inoutline_id IS NOT NULL ORDER BY m_matchpo_id')[0], ol0 = q('SELECT * FROM c_orderline WHERE c_orderline_id=?', [mp0.c_orderline_id])[0], o0 = q('SELECT * FROM c_order WHERE c_order_id=?', [ol0.c_order_id])[0];
    var il1 = q('SELECT * FROM m_inoutline WHERE m_inoutline_id=?', [mp0.m_inoutline_id])[0], io1 = q('SELECT * FROM m_inout WHERE m_inout_id=?', [il1.m_inout_id])[0];
    var o1 = clone('c_order', 'c_order_id=?', [o0.c_order_id], { c_order_id: nid(), ad_client_id: C, ad_org_id: T.O, documentno: 'DS-PO-' + C }), ol1 = clone('c_orderline', 'c_orderline_id=?', [ol0.c_orderline_id], { c_orderline_id: nid(), c_order_id: o1.c_order_id, ad_client_id: C, ad_org_id: T.O, m_product_id: prod.m_product_id });
    var io2 = clone('m_inout', 'm_inout_id=?', [io1.m_inout_id], { m_inout_id: nid(), ad_client_id: C, ad_org_id: T.O, documentno: 'DS-MR-' + C }), il2 = clone('m_inoutline', 'm_inoutline_id=?', [il1.m_inoutline_id], { m_inoutline_id: nid(), m_inout_id: io2.m_inout_id, ad_client_id: C, m_product_id: prod.m_product_id, c_orderline_id: ol1.c_orderline_id });
    var mp1 = clone('m_matchpo', 'm_matchpo_id=?', [mp0.m_matchpo_id], { m_matchpo_id: nid(), ad_client_id: C, ad_org_id: T.O, c_orderline_id: ol1.c_orderline_id, m_inoutline_id: il2.m_inoutline_id, m_product_id: prod.m_product_id, documentno: 'DS-MP-' + C });
    var mu = P.costUpdatesForMatchPO(pdb, mp1.m_matchpo_id), mpn = (mu.updates || []).length, bad = (mu.updates || []).filter(function (x) { return schemasOf(C).indexOf(x.c_acctschema_id) < 0 || x.m_costelement_id !== aEl.m_costelement_id; }).length;
    say('§DEFSCOPE-MATCHPO ' + T.name + ' updates=' + mpn + ' absent=' + J(mu.absent) + ' schemaMethod=' + J(q('SELECT costingmethod FROM c_acctschema WHERE c_acctschema_id=?', [sch[0]])[0]));
    check('P', 'matchpo@' + T.name, 'costUpdatesForMatchPO(match of ' + T.name + ') yields >=1 update, all under the tenant\'s own schema and its OWN Average PO element ' + aEl.m_costelement_id + ' (none of client 11\'s element 103)', mpn >= 1 && bad === 0, { updates: mpn, bad: bad, absent: mu.absent });
  });
  var gw1 = snapGW(); check('P', 'GW-untouched', 'GardenWorld m_cost + fact_acct rows byte-equal before/after the whole tenant matrix', gw0 === gw1, { before: gw0, after: gw1 });
  // GW control: golden shipment pairs captured from origin/main (94b5d60b) before the change
  say('§DEFSCOPE-GOLDEN gw_ship_pairs=' + J(GWP.ship) + ' gw_picks=' + J(GWPICK));
  Object.keys(CASES).forEach(function (cs) { var c = CASES[cs]; say('§DEFSCOPE-' + cs + ' judged=' + c.judged + ' failed=' + c.failed); });
  var v = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§DEFSCOPE-VERDICT ' + v + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' blocks=' + nBlocks + ' tenants=' + TEN.length + ' vacuous=' + ALL.vacuous + ' erp=' + ERP + (MUT ? ' mut=' + MUT : ''));
  process.exit(v === 'FAIL' ? 1 : 0);
})().catch(function (e) { _log('§DEFSCOPE-VERDICT FAIL crashed ' + (e && e.stack)); process.exit(2); });
