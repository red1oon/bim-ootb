#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DOCNO (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §DOCNO-SPEC). READ THE LOG after every run: every verdict is a §DOCNO line.
// THE ISSUE it proves/disproves: on a MIGRATED tenant two payments got the SAME DocumentNo (10000007 = GardenWorld's DocumentNo_C_Payment). Legacy: MSequence.getDocumentNo(AD_Client_ID, TableName) reads the CLIENT's
//   DocumentNo_<Table> (MSequence.get :864-890 filters AD_Client_ID), makes it when the client has none (createTableSequence :792-833, initial CurrentNext 1000000 = MSequence.setInitialDefaults),
//   then bumps CurrentNext by IncrementNo per document (getDocumentNoFromSeq :330-581). Expected numbers come from the sequence rows as they stand BEFORE the documents (SQL) + the legacy start/increment, never from the code under test.
//   N documents of each type, in ONE transaction and across SEPARATE transactions, on a MIGRATED and a BORN tenant, under the page's id law (WS_ID_LAW=synthetic): distinct, increasing, == start + k*increment.
//   GardenWorld's sequences must not move. MUTANT DOCNO_MUT=nocreate (the old "no table sequence -> no number") is run as a child and must FAIL. The page's own preview/save path is a child (witness_docno_page.js).
// Command: node erp/tests/witness_docno.js 2>&1 | tee /tmp/count_logs/mig_docno.log
'use strict';
process.env.WS_ID_LAW = process.env.WS_ID_LAW || 'synthetic';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.ERP_DIR || path.join(__dirname, '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-10');
var _log = console.log, SHIPPED = []; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§(MIG-|E1-STOCK|ODOO-FORM run|IMPORT_|PROC-)/.test(l)) SHIPPED.push(l); if (/^§DBG/.test(l)) _log(l); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0, blocked: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §DOCNO-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1800))); }
// known(): a check whose expectation is legacy-correct but whose fix is NOT in this change (BLOCKED with one owner question). While it fails it is printed as §DOCNO-BLOCKED, never counted PASS, never hidden;
//   the day it passes it is an ordinary judged check.
function known(cs, key, rule, ok, info, question) { if (ok) return check(cs, key, rule, ok, info); ALL.blocked++; say('  §DOCNO-BLOCKED case=' + cs + ' key=' + key + ' rule="' + rule + '" got=' + String(J(info)).slice(0, 900) + ' QUESTION="' + question + '"'); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§DOCNO-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var cents = function (v) { return Math.round(Number(v || 0) * 100); }, money = function (c) { return (c / 100).toFixed(2); };

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  ['ImportInventory.js', 'ImportGLJournal.js', 'ImportInvoice.js', 'InOutGenerate.js', 'InvoiceGenerate.js'].forEach(function (f) { try { require(path.join(ERP, 'processes', f)); } catch (e) { say('§DOCNO-LOAD ' + f + ' not loadable: ' + e.message); } });
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
  function snap(C) { var o = {}; ['c_bpartner', 'c_elementvalue', 'i_gljournal', 'i_invoice', 'gl_journal', 'c_invoice', 'fact_acct', 'c_charge', 'c_tax'].forEach(function (t) { o[t] = n(C, t); }); return o; }
  // note: AP/AF above

  var OCV = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate_convert.mjs')).href), CLRV = { AR: OCV.TEMPLATE.variables.AR_CLEARING, AP: OCV.TEMPLATE.variables.AP_CLEARING, BANK: OCV.TEMPLATE.variables.BANK_CLEARING };
  var books = function (C) { var o = {}; q('SELECT ev.value AS v, SUM(f.amtacctdr)-SUM(f.amtacctcr) AS b FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_client_id=? GROUP BY ev.value', [C]).forEach(function (r) { o[r.v] = cents(r.b); }); return o; };
  var CT = ['c_bpartner', 'c_bpartner_location', 'c_location', 'c_bank', 'c_bankaccount', 'm_product', 'c_elementvalue', 'i_gljournal', 'i_invoice', 'i_bankstatement', 'gl_journalbatch', 'gl_journal', 'c_invoice', 'c_bankstatement', 'fact_acct', 'c_charge'];
  function snapAll(C) { var o = {}; CT.forEach(function (t) { o[t] = n(C, t); }); return o; }
  var NDOC = Object.keys(EXP.sets.open_lines.reduce(function (m, l) { if ({ out_invoice: 1, out_refund: 1, in_invoice: 1, in_refund: 1 }[l.move_type]) m[l.move_name] = 1; return m; }, {})).length;
  function full(S, exp) { var ses = S._ses, f = files(exp), cur = answer(ses.rows(f, null)), r = ses.execute(f, cur), a = r.ok ? ses.after(f, cur) : { ok: false, msg: 'stage 1 refused: ' + r.msg }; return { r: r, a: a, rows: ses.rows(f, cur) }; }
  function mk(name) { var T = birth(name); T._ses = session(T, '2026-11-11'); return T; }
  var ver = function (m) { return SHIPPED.slice(m).filter(function (l) { return /^§MIG-VERIFY/.test(l); }).pop() || ''; };


  require(path.join(ERP, 'ad_callout.js')).bind(function (sql, p) { return q(sql, p); });   // the callout runtime the page binds (idempiere.html); MOrderLine.setTax -> Tax.getProduct reads through it
  var MUT = process.env.MUT || '', TODAY = '2026-11-11';
  say('§DOCNO-CONFIG mutant=' + (MUT || 'none') + ' erp=' + ERP);
  // ── the migrated tenant ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  var T = mk('Trade Co'), C = T.clientId, M0 = SHIPPED.length, FM = full(T);
  say('§DOCNO-SETUP migrated: stage1=' + FM.r.ok + ' stage2=' + FM.a.ok + ' ' + String(FM.a.msg).slice(0, 160));
  check('SETUP', 'migrated', 'control: the fixture is migrated (stage 2 "Open balances completed", §MIG-VERIFY PASS judged>0) before any trade is judged', FM.r.ok && FM.a.ok && /Open balances completed/.test(FM.a.msg) && /verdict=PASS judged=[1-9]/.test(ver(M0)), { r: FM.r.msg, a: FM.a.msg });
  // ── raw rows (expected values) ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  var RAW = {}; EXP.sets.open_moves.forEach(function (m) { RAW[m.name] = m; });
  var rawOpen = function (partnerName, types) { return EXP.sets.open_moves.filter(function (m) { return m.partner_id__name === partnerName && types.indexOf(m.move_type) >= 0; }).reduce(function (s, m) { return s + cents(m.amount_residual) * ({ out_invoice: 1, in_invoice: -1, out_refund: -1, in_refund: 1 }[m.move_type]); }, 0); };   // customer open +, vendor open - (iDempiere TotalOpenBalance sign)
  var ITEM = EXP.sets['product.product'].filter(function (p) { return p.default_code === 'E-COM08'; })[0], LISTP = cents(ITEM.list_price);
  var rawQty = EXP.sets['stock.quant'].filter(function (x) { return String(x.product_id__name).indexOf('[E-COM08]') === 0; }).reduce(function (s, x) { return s + Number(x.quantity || 0); }, 0);
  say('§DOCNO-RAW GemOpen=' + money(rawOpen('Gemini Furniture', ['out_invoice', 'out_refund'])) + ' AcmeOpen=' + money(rawOpen('Acme Corporation', ['out_invoice', 'out_refund'])) + ' ReadyMatOpen=' + money(rawOpen('Ready Mat', ['in_invoice', 'in_refund'])) + ' item_list=' + money(LISTP) + ' item_qty=' + rawQty);
  // ── helpers on the tenant ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function tx(label, fn) {
    var trx = new ML.Trx(k.q, Object.assign(k.env(T), { date: TODAY + ' 00:00:00' })), r;
    try { r = fn(trx) || { ok: true }; } catch (e) { r = { ok: false, error: 'threw: ' + (e && e.message) }; if (process.env.DBG) say(String(e && e.stack).split('\n').slice(0, 8).join('\n')); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [];
    if (MUT === 'unbal' && label === 'arpay') { var dropped = false; ops = ops.filter(function (o) { if (!dropped && o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE' && cents(o.fields.amtacctdr) > 0) { dropped = true; return false; } return true; }); say('§DOCNO-MUT unbal dropped a debit fact: ' + dropped); }
    if (ok && ops.length) k.commit(T, ops, { ws: 'trade' });
    return Object.assign({}, r, { ok: ok, ops: ops, log: trx.log });
  }
  var inv = function (no) { return q('SELECT * FROM c_invoice WHERE ad_client_id=? AND documentno=?', [C, no])[0]; };
  var bp = function (nm) { return q('SELECT * FROM c_bpartner WHERE ad_client_id=? AND name=?', [C, nm])[0]; };
  function invOpen(id) { var i = q('SELECT grandtotal FROM c_invoice WHERE c_invoice_id=?', [id])[0];   // re-derived: GrandTotal - |completed allocation lines|
    var a = q("SELECT COALESCE(SUM(al.amount+al.discountamt+al.writeoffamt),0) AS s FROM c_allocationline al JOIN c_allocationhdr h ON h.c_allocationhdr_id=al.c_allocationhdr_id WHERE al.c_invoice_id=? AND h.docstatus IN ('CO','CL')", [id])[0].s;
    return cents(i.grandtotal) - Math.abs(cents(a)); }
  function acctOf(vc) { return q('SELECT account_id FROM c_validcombination WHERE c_validcombination_id=?', [vc])[0].account_id; }
  var BAID = q("SELECT c_bankaccount_id AS b FROM c_bankaccount WHERE ad_client_id=? AND accountno='BNK1'", [C])[0].b;
  var DEF = q('SELECT * FROM c_acctschema_default WHERE ad_client_id=?', [C])[0], BA = q('SELECT * FROM c_bankaccount_acct WHERE ad_client_id=? AND c_bankaccount_id=' + BAID + '', [C])[0];
  var ACC = { REC: acctOf(DEF.c_receivable_acct), LIAB: acctOf(DEF.v_liability_acct), INTR: acctOf(BA.b_intransit_acct), UNAL: acctOf(BA.b_unallocatedcash_acct), PSEL: acctOf(BA.b_paymentselect_acct) };
  var bal = function () { var o = {}; q('SELECT account_id AS a, SUM(amtacctdr)-SUM(amtacctcr) AS b FROM fact_acct WHERE ad_client_id=? GROUP BY account_id', [C]).forEach(function (r) { o[r.a] = cents(r.b); }); return o; };
  var tb = function () { return q('SELECT c_acctschema_id AS s, SUM(amtacctdr)-SUM(amtacctcr) AS b, count(*) AS n FROM fact_acct WHERE ad_client_id=? GROUP BY c_acctschema_id', [C]).map(function (r) { return { s: r.s, c: cents(r.b), n: r.n }; }); };
  var delta = function (b0, b1) { var d = {}; Object.keys(b1).concat(Object.keys(b0)).forEach(function (a) { var x = (b1[a] || 0) - (b0[a] || 0); if (x) d[a] = x; }); return d; };
  var tbOk = function () { var t = tb(); return t.length > 0 && t.every(function (x) { return x.c === 0 && x.n > 0; }); };
  var ARR = q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='ARR' ORDER BY isdefault DESC", [C])[0].d, APP = q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='APP' ORDER BY isdefault DESC", [C])[0].d;
  var lastId = function (t) { return q('SELECT ' + t + '_id AS m FROM ' + t + ' WHERE ad_client_id=? ORDER BY ABS(' + t + '_id) DESC LIMIT 1', [C])[0].m; };   // ids made inside a Trx are provisional: the committed one is the newest row
  function pay(label, o) { return pay0(label, o); }
  function pay0(label, o) {   // MPayment saved as a Draft (one commit, as the window's Save), then the DocAction CO (a second commit, as the Complete button): the poster reads the payment by SQL, so it must be a stored row
    var s1 = tx(label + '-save', function (trx) {
      var p = ML.newPO(trx, 'c_payment', { ad_org_id: T.orgId, c_doctype_id: o.receipt ? ARR : APP, c_bankaccount_id: BAID, c_bpartner_id: o.bp, c_invoice_id: o.inv, payamt: o.amt, isreceipt: o.receipt ? 'Y' : 'N', c_currency_id: 100, datetrx: TODAY, dateacct: TODAY, docstatus: 'DR', docaction: 'CO' });
      var sv = ML.save(trx, 'c_payment', null, p); return sv.ok ? { ok: true } : { ok: false, error: 'save c_payment: ' + sv.error }; });
    if (!s1.ok) return s1; var id = lastId('c_payment');
    var s2 = tx(label, function (trx) { var r = ML.processIt(trx, 'c_payment', id, 'CO'); return { ok: !!r.ok, error: r.ok ? null : (r.msg || r.status), status: r.status }; });
    s2.id = id; return s2;
  }
  var pstat = function (id) { return q('SELECT docstatus,posted,isallocated,payamt FROM c_payment WHERE c_payment_id=?', [id])[0]; };

  var LAW = process.env.WS_ID_LAW, N = 3;
  function expectedSeq(trx0, dtId, table) {   // the sequence the NEXT document of this type draws from + its current state, from the rows before
    var d = dtId ? q('SELECT isdocnocontrolled AS c, docnosequence_id AS s FROM c_doctype WHERE c_doctype_id=?', [dtId])[0] : null, sq = null, how;
    if (d && d.c === 'Y' && d.s) { sq = q('SELECT * FROM ad_sequence WHERE ad_sequence_id=?', [d.s])[0]; how = 'doctype-sequence'; }
    else { sq = q("SELECT * FROM ad_sequence WHERE UPPER(name)=UPPER(?) AND istableid='N' AND ad_client_id=?", ['DocumentNo_' + table, C])[0]; how = sq ? 'table-sequence' : 'table-sequence-to-be-created'; }
    return { how: how, start: sq ? Number(sq.currentnext) : 1000000, inc: sq ? Number(sq.incrementno || 1) : 1, pre: sq && sq.prefix || '', suf: sq && sq.suffix || '', pat: sq && sq.decimalpattern || '' };
  }
  var fmt = function (x, k) { var n = String(x.start + k * x.inc); if (x.pat) while (n.length < x.pat.length) n = '0' + n; return x.pre + n + x.suf; };
  function runDoc(tenant, label, table, dtId, makeFields) {
    T = tenant; C = tenant.clientId;
    var pk = table + '_id', ex = expectedSeq(null, dtId, table), ids0 = q('SELECT ' + pk + ' AS i FROM ' + table + ' WHERE ad_client_id=?', [C]).map(function (r) { return r.i; });
    function one(trx, k) { var p = ML.newPO(trx, table, makeFields(k)); var sv = ML.save(trx, table, null, p); return sv.ok ? null : sv.error; }
    var e1 = tx(label + '-one', function (trx) { for (var k = 0; k < N; k++) { var e = one(trx, k); if (e) return { ok: false, error: e }; } return { ok: true }; });
    var errs = [e1.ok ? null : e1.error];
    for (var k = 0; k < N; k++) { var ek = tx(label + '-t' + k, function (trx) { var e = one(trx, N + k); return e ? { ok: false, error: e } : { ok: true }; }); errs.push(ek.ok ? null : ek.error); }
    var rows = q('SELECT ' + pk + ' AS i, documentno AS no FROM ' + table + ' WHERE ad_client_id=?', [C]).filter(function (r) { return ids0.indexOf(r.i) < 0; }).sort(function (a, b) { return Math.abs(a.i) - Math.abs(b.i); });
    var got = rows.map(function (r) { return r.no; }), want = []; for (var m = 0; m < 2 * N; m++) want.push(fmt(ex, m));
    say('§DOCNO-DOCS ' + label + ' how=' + ex.how + ' start=' + ex.start + ' inc=' + ex.inc + ' got=' + J(got) + ' want=' + J(want) + (errs.filter(Boolean).length ? ' errs=' + J(errs.filter(Boolean)) : ''));
    return { got: got, want: want, errs: errs.filter(Boolean), how: ex.how };
  }
  var GWBEFORE = q("SELECT ad_sequence_id AS i, currentnext AS n FROM ad_sequence WHERE ad_client_id=11 ORDER BY ad_sequence_id").map(function (r) { return r.i + ':' + r.n; }).join(',');
  function judgeDocs(cs, label, r) {
    check(cs, label + '-saved', label + ': ' + 2 * N + ' documents save (' + N + ' in ONE transaction, ' + N + ' in separate ones)', r.errs.length === 0 && r.got.length === 2 * N, r);
    check(cs, label + '-distinct', label + ': every DocumentNo is distinct and not empty', r.got.length === 2 * N && r.got.every(function (x) { return x != null && x !== ''; }) && new Set(r.got).size === r.got.length, r.got);
    check(cs, label + '-legacy', label + ': == the legacy sequence run from the same start (' + r.how + '): ' + J(r.want), J(r.got) === J(r.want), { got: r.got, want: r.want });
  }
  var gem = bp('Gemini Furniture'), SO = q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='SOO' AND docsubtypeso='SO'", [C])[0].d;
  var MIG = T, plS = q("SELECT m_pricelist_id AS id FROM m_pricelist WHERE ad_client_id=? AND issopricelist='Y'", [C])[0].id, locG = q('SELECT c_bpartner_location_id AS l FROM c_bpartner_location WHERE c_bpartner_id=?', [gem.c_bpartner_id])[0].l;
  var whM = q('SELECT m_warehouse_id AS w FROM m_warehouse WHERE ad_client_id=? ORDER BY ABS(m_warehouse_id) DESC', [C])[0].w, ptM = q("SELECT c_paymentterm_id AS i FROM c_paymentterm WHERE ad_client_id=? AND isdefault='Y'", [C])[0].i;
  var APPd = APP;
  var orderF = function (dt, bpId, loc, pl, wh, pt, orgId) { return function () { return { ad_org_id: orgId, c_doctypetarget_id: dt, c_doctype_id: dt, c_bpartner_id: bpId, c_bpartner_location_id: loc, bill_bpartner_id: bpId, bill_location_id: loc, m_pricelist_id: pl, c_currency_id: 100, m_warehouse_id: wh, issotrx: 'Y', dateordered: TODAY, dateacct: TODAY, datepromised: TODAY, docstatus: 'DR', docaction: 'CO', c_paymentterm_id: pt }; }; };
  var payF = function (dt, rec, orgId, ba, bpId) { return function (k) { return { ad_org_id: orgId, c_doctype_id: dt, c_bankaccount_id: ba, c_bpartner_id: bpId, payamt: 1 + k, isreceipt: rec, c_currency_id: 100, datetrx: TODAY, dateacct: TODAY, docstatus: 'DR', docaction: 'CO' }; }; };
  // MIGRATED tenant
  judgeDocs('MIGRATED', 'payment-AR-receipt', runDoc(MIG, 'mig-arr', 'c_payment', ARR, payF(ARR, 'Y', MIG.orgId, BAID, gem.c_bpartner_id)));
  judgeDocs('MIGRATED', 'payment-AP', runDoc(MIG, 'mig-app', 'c_payment', APPd, payF(APPd, 'N', MIG.orgId, BAID, gem.c_bpartner_id)));
  judgeDocs('MIGRATED', 'sales-order', runDoc(MIG, 'mig-order', 'c_order', SO, orderF(SO, gem.c_bpartner_id, locG, plS, whM, ptM, MIG.orgId)));
  // the two payment types share ONE table sequence (legacy: DocumentNo_C_Payment per client): the AP run continued where the AR run stopped
  var arrNos = q("SELECT documentno AS no FROM c_payment WHERE ad_client_id=?", [C]).map(function (r) { return r.no; });
  check('MIGRATED', 'payments-one-series', 'all ' + arrNos.length + ' payments of the tenant (receipts + payments) are distinct: they draw from ONE client sequence', arrNos.length === 4 * N && new Set(arrNos).size === arrNos.length, arrNos);
  // BORN tenant (Initial Tenant Setup): no sales price list by legacy MSetup, so the order takes the setup list
  var BORN = mk('Born Co'); T = BORN; C = BORN.clientId;
  var bgem = q("SELECT c_bpartner_id AS id FROM c_bpartner WHERE ad_client_id=? ORDER BY c_bpartner_id", [C])[0], bloc = q('SELECT c_bpartner_location_id AS l FROM c_bpartner_location WHERE c_bpartner_id=?', [bgem.id])[0],
      bpl = q('SELECT m_pricelist_id AS id FROM m_pricelist WHERE ad_client_id=?', [C])[0].id, bwh = q('SELECT m_warehouse_id AS w FROM m_warehouse WHERE ad_client_id=?', [C])[0].w, bso = q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='SOO' AND docsubtypeso='SO'", [C])[0].d,
      bpt = q("SELECT c_paymentterm_id AS i FROM c_paymentterm WHERE ad_client_id=? ORDER BY isdefault DESC", [C])[0];
  if (bloc) judgeDocs('BORN', 'sales-order', runDoc(BORN, 'born-order', 'c_order', bso, orderF(bso, bgem.id, bloc.l, bpl, bwh, bpt && bpt.i, BORN.orgId)));
  else say('§DOCNO-SKIP born tenant has no partner location for an order header');
  var GWAFTER = q("SELECT ad_sequence_id AS i, currentnext AS n FROM ad_sequence WHERE ad_client_id=11 ORDER BY ad_sequence_id").map(function (r) { return r.i + ':' + r.n; }).join(',');
  check('ISOLATION', 'gardenworld-untouched', 'GardenWorld\'s sequences (client 11, e.g. DocumentNo_C_Payment 10000007) did not move while two other tenants numbered documents', GWBEFORE.length > 0 && GWBEFORE === GWAFTER, { before: GWBEFORE.slice(0, 120), after: GWAFTER.slice(0, 120) });
  check('MIGRATED', 'premise-ids', 'control: under the page law the tenant\'s rows are NEGATIVE (the law the defect lived under)', LAW !== 'synthetic' || q('SELECT c_bpartner_id AS i FROM c_bpartner WHERE ad_client_id=?', [MIG.clientId]).some(function (r) { return r.i < 0; }), LAW);
  // children: the page path (must PASS) and the two mutants (must FAIL): the old no-create model and the old no-client page lookup
  var cp = require('child_process');
  function child(file, env) { var r = cp.spawnSync(process.execPath, [path.join(__dirname, file)], { env: Object.assign({}, process.env, env || {}), encoding: 'utf8', timeout: 900000, maxBuffer: 1 << 26 }), out = (r.stdout || '') + (r.stderr || ''),
    v = out.match(/§(?:DOCNOPG|DOCNO)-VERDICT (\w+) judged=(\d+) failed=(\d+)/) || []; fs.writeFileSync('/tmp/count_logs/docno_child_' + file.replace(/\W/g, '_') + (env ? '_mut' : '') + '.log', out); return { verdict: v[1] || 'NONE', judged: Number(v[2] || 0), failed: Number(v[3] || 0) }; }
  if (!process.env.DOCNO_NO_CHILDREN && !process.env.DOCNO_MUT) {
    var PG = child('witness_docno_page.js'), MM = child('witness_docno.js', { DOCNO_MUT: 'nocreate' }), MP = child('witness_docno_page.js', { DOCNO_PAGE_MUT: '1' });
    say('§DOCNO-CHILDREN page=' + J(PG) + ' mutant-model=' + J(MM) + ' mutant-page=' + J(MP));
    check('PAGE', 'payment-window', 'the Payment window on the migrated tenant: two saves, DocumentNo 1000000 then 1000001, GardenWorld untouched (witness_docno_page PASS, judged>0)', PG.verdict === 'PASS' && PG.judged > 0 && PG.failed === 0, PG);
    check('MUTANT', 'model-nocreate', 'MUTANT: the old "no table sequence -> no number" model makes the numbering witness FAIL', MM.verdict === 'FAIL' && MM.failed > 0, MM);
    check('MUTANT', 'page-no-client', 'MUTANT: the old by-name sequence lookup without AD_Client_ID makes the page witness FAIL', MP.verdict === 'FAIL' && MP.failed > 0, MP);
  }
  Object.keys(CASES).forEach(verdict);
  var V = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§DOCNO-VERDICT ' + V + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' law=' + LAW + ' mutant=' + (process.env.DOCNO_MUT || 'none'));
  process.exit(V === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§DOCNO-VERDICT FAIL crashed ' + (e && e.stack || e)); process.exit(1); });
