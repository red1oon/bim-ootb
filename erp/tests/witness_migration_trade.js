#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MIGRATION-TRADE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §TRADE-SPEC, R5). READ THE LOG after every run: every verdict is a §TRD line and the loader's own §MIG-* lines are printed with it; the exit code is not the evidence.
// THE ISSUE it proves/disproves: a company MIGRATED from the Odoo one-file fixture loads - but can it TRADE? ARPAY: a payment received against a MIGRATED open customer invoice allocates it (IsPaid, open amount, partner open balance, books);
//   SALES: a NEW order -> shipment -> invoice -> payment on the migrated products / partners / price list; APPAY: a migrated open vendor bill is paid. Books (Fact_Acct) balance per accounting schema throughout.
//   Shipped paths only: ML.newPO/save/processIt, MPayment.allocateIt, processes InOutGenerate (118) and InvoiceGenerate (119). Expected values: fixture raw rows (open_moves.amount_residual, product list_price) + legacy posting
//   rules (Doc_Payment.java createFacts, Doc_AllocationHdr.java :293-360 / :731-757, Doc_Invoice.java): AR receipt net = Dr BankInTransit / Cr Receivable (UnallocatedCash nets 0); AP payment net = Dr Liability / Cr BankInTransit.
// MUTANTS: MUT=wronginv (payment allocated to the OTHER Gemini invoice) and MUT=unbal (one fact leg dropped before commit) must FAIL. Nothing judged -> INCONCLUSIVE.
// Command: node erp/tests/witness_migration_trade.js 2>&1 | tee /tmp/count_logs/mig_migration_trade.log
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.ERP_DIR || path.join(__dirname, '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-10');
var _log = console.log, SHIPPED = []; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§(MIG-|E1-STOCK|ODOO-FORM run|IMPORT_|PROC-)/.test(l)) SHIPPED.push(l); if (/^§DBG/.test(l)) _log(l); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0, blocked: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §TRD-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1800))); }
// known(): a check whose expectation is legacy-correct but whose fix is NOT in this change (BLOCKED with one owner question). While it fails it is printed as §TRD-BLOCKED, never counted PASS, never hidden;
//   the day it passes it is an ordinary judged check.
function known(cs, key, rule, ok, info, question) { if (ok) return check(cs, key, rule, ok, info); ALL.blocked++; say('  §TRD-BLOCKED case=' + cs + ' key=' + key + ' rule="' + rule + '" got=' + String(J(info)).slice(0, 900) + ' QUESTION="' + question + '"'); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§TRD-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var cents = function (v) { return Math.round(Number(v || 0) * 100); }, money = function (c) { return (c / 100).toFixed(2); };

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
  function files(exp) { return { Files: [{ name: 'odoo_migration.xlsx', size: wbuf.length, data: XLSX.read(wbuf) }, { name: 'manifest.json', size: 1, data: man }, { name: 'odoo_export.json', size: 1, data: exp || EXP }] }; }
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
  say('§TRD-CONFIG mutant=' + (MUT || 'none') + ' erp=' + ERP);
  // ── the migrated tenant ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  var T = mk('Trade Co'), C = T.clientId, M0 = SHIPPED.length, FM = full(T);
  say('§TRD-SETUP migrated: stage1=' + FM.r.ok + ' stage2=' + FM.a.ok + ' ' + String(FM.a.msg).slice(0, 160));
  check('SETUP', 'migrated', 'control: the fixture is migrated (stage 2 "Open balances completed", §MIG-VERIFY PASS judged>0) before any trade is judged', FM.r.ok && FM.a.ok && /Open balances completed/.test(FM.a.msg) && /verdict=PASS judged=[1-9]/.test(ver(M0)), { r: FM.r.msg, a: FM.a.msg });
  // ── raw rows (expected values) ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  var RAW = {}; EXP.sets.open_moves.forEach(function (m) { RAW[m.name] = m; });
  var rawOpen = function (partnerName, types) { return EXP.sets.open_moves.filter(function (m) { return m.partner_id__name === partnerName && types.indexOf(m.move_type) >= 0; }).reduce(function (s, m) { return s + cents(m.amount_residual) * ({ out_invoice: 1, in_invoice: -1, out_refund: -1, in_refund: 1 }[m.move_type]); }, 0); };   // customer open +, vendor open - (iDempiere TotalOpenBalance sign)
  var ITEM = EXP.sets['product.product'].filter(function (p) { return p.default_code === 'E-COM08'; })[0], LISTP = cents(ITEM.list_price);
  var rawQty = EXP.sets['stock.quant'].filter(function (x) { return String(x.product_id__name).indexOf('[E-COM08]') === 0; }).reduce(function (s, x) { return s + Number(x.quantity || 0); }, 0);
  say('§TRD-RAW GemOpen=' + money(rawOpen('Gemini Furniture', ['out_invoice', 'out_refund'])) + ' AcmeOpen=' + money(rawOpen('Acme Corporation', ['out_invoice', 'out_refund'])) + ' ReadyMatOpen=' + money(rawOpen('Ready Mat', ['in_invoice', 'in_refund'])) + ' item_list=' + money(LISTP) + ' item_qty=' + rawQty);
  // ── helpers on the tenant ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function tx(label, fn) {
    var trx = new ML.Trx(k.q, Object.assign(k.env(T), { date: TODAY + ' 00:00:00' })), r;
    try { r = fn(trx) || { ok: true }; } catch (e) { r = { ok: false, error: 'threw: ' + (e && e.message) }; if (process.env.DBG) say(String(e && e.stack).split('\n').slice(0, 8).join('\n')); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [];
    if (MUT === 'unbal' && label === 'arpay') { var dropped = false; ops = ops.filter(function (o) { if (!dropped && o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE' && cents(o.fields.amtacctdr) > 0) { dropped = true; return false; } return true; }); say('§TRD-MUT unbal dropped a debit fact: ' + dropped); }
    if (ok && ops.length) k.commit(T, ops, { ws: 'trade' });
    return Object.assign({}, r, { ok: ok, ops: ops, log: trx.log });
  }
  var inv = function (no) { return q('SELECT * FROM c_invoice WHERE ad_client_id=? AND documentno=?', [C, no])[0]; };
  var bp = function (nm) { return q('SELECT * FROM c_bpartner WHERE ad_client_id=? AND name=?', [C, nm])[0]; };
  function invOpen(id) { var i = q('SELECT grandtotal FROM c_invoice WHERE c_invoice_id=?', [id])[0];   // re-derived: GrandTotal - |completed allocation lines|
    var a = q("SELECT COALESCE(SUM(al.amount+al.discountamt+al.writeoffamt),0) AS s FROM c_allocationline al JOIN c_allocationhdr h ON h.c_allocationhdr_id=al.c_allocationhdr_id WHERE al.c_invoice_id=? AND h.docstatus IN ('CO','CL')", [id])[0].s;
    return cents(i.grandtotal) - Math.abs(cents(a)); }
  function acctOf(vc) { return q('SELECT account_id FROM c_validcombination WHERE c_validcombination_id=?', [vc])[0].account_id; }
  var DEF = q('SELECT * FROM c_acctschema_default WHERE ad_client_id=?', [C])[0], BA = q('SELECT * FROM c_bankaccount_acct WHERE ad_client_id=? AND c_bankaccount_id=1000001', [C])[0];
  var ACC = { REC: acctOf(DEF.c_receivable_acct), LIAB: acctOf(DEF.v_liability_acct), INTR: acctOf(BA.b_intransit_acct), UNAL: acctOf(BA.b_unallocatedcash_acct), PSEL: acctOf(BA.b_paymentselect_acct) };
  var bal = function () { var o = {}; q('SELECT account_id AS a, SUM(amtacctdr)-SUM(amtacctcr) AS b FROM fact_acct WHERE ad_client_id=? GROUP BY account_id', [C]).forEach(function (r) { o[r.a] = cents(r.b); }); return o; };
  var tb = function () { return q('SELECT c_acctschema_id AS s, SUM(amtacctdr)-SUM(amtacctcr) AS b, count(*) AS n FROM fact_acct WHERE ad_client_id=? GROUP BY c_acctschema_id', [C]).map(function (r) { return { s: r.s, c: cents(r.b), n: r.n }; }); };
  var delta = function (b0, b1) { var d = {}; Object.keys(b1).concat(Object.keys(b0)).forEach(function (a) { var x = (b1[a] || 0) - (b0[a] || 0); if (x) d[a] = x; }); return d; };
  var tbOk = function () { var t = tb(); return t.length > 0 && t.every(function (x) { return x.c === 0 && x.n > 0; }); };
  var ARR = q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='ARR' ORDER BY isdefault DESC", [C])[0].d, APP = q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='APP' ORDER BY isdefault DESC", [C])[0].d;
  var lastId = function (t) { return q('SELECT MAX(' + t + '_id) AS m FROM ' + t + ' WHERE ad_client_id=?', [C])[0].m; };   // ids made inside a Trx are provisional: the committed one is the newest row
  function pay(label, o) { return pay0(label, o); }
  function pay0(label, o) {   // MPayment saved as a Draft (one commit, as the window's Save), then the DocAction CO (a second commit, as the Complete button): the poster reads the payment by SQL, so it must be a stored row
    var s1 = tx(label + '-save', function (trx) {
      var p = ML.newPO(trx, 'c_payment', { ad_org_id: T.orgId, c_doctype_id: o.receipt ? ARR : APP, c_bankaccount_id: 1000001, c_bpartner_id: o.bp, c_invoice_id: o.inv, payamt: o.amt, isreceipt: o.receipt ? 'Y' : 'N', c_currency_id: 100, datetrx: TODAY, dateacct: TODAY, docstatus: 'DR', docaction: 'CO' });
      var sv = ML.save(trx, 'c_payment', null, p); return sv.ok ? { ok: true } : { ok: false, error: 'save c_payment: ' + sv.error }; });
    if (!s1.ok) return s1; var id = lastId('c_payment');
    var s2 = tx(label, function (trx) { var r = ML.processIt(trx, 'c_payment', id, 'CO'); return { ok: !!r.ok, error: r.ok ? null : (r.msg || r.status), status: r.status }; });
    s2.id = id; return s2;
  }
  var pstat = function (id) { return q('SELECT docstatus,posted,isallocated,payamt FROM c_payment WHERE c_payment_id=?', [id])[0]; };

  if (process.env.DBG) { say('§DBGX acct rows grp=' + n(C, 'c_bp_group_acct') + ' cust=' + n(C, 'c_bp_customer_acct') + ' vend=' + n(C, 'c_bp_vendor_acct') + ' bp=' + n(C, 'c_bpartner')); say('§DBGX ' + J(q("SELECT s.m_product_id, s.m_locator_id, s.qtyonhand, l.m_warehouse_id FROM m_storageonhand s JOIN m_locator l ON l.m_locator_id=s.m_locator_id WHERE s.ad_client_id=? AND s.m_product_id IN (SELECT m_product_id FROM m_product WHERE value='E-COM08')", [C]))); }
  if (process.env.DBG) { say('§DBGX cost ' + J(q('SELECT m_costelement_id,name,costingmethod,costelementtype FROM m_costelement WHERE ad_client_id=?', [C])) + ' ' + J(q('SELECT count(*) n FROM m_cost WHERE ad_client_id=?', [C])) + ' ' + J(q('SELECT costingmethod,costinglevel,m_costtype_id FROM c_acctschema WHERE ad_client_id=?', [C])) + ' ' + J(q('SELECT * FROM m_costtype WHERE ad_client_id=?', [C]))); }
  var tb0 = tb(); say('§TRD-TB before trading ' + J(tb0));
  check('SETUP', 'tb-start', 'control: the migrated books sum to 0.00 per accounting schema before trading (judged on ' + tb0.length + ' schema(s), >0 facts)', tbOk(), tb0);

  // ═══ ARPAY: receive a payment against a MIGRATED open customer invoice ═══
  var gem = bp('Gemini Furniture'), i6 = inv('INV/2026/00006'), i7 = inv('INV/2026/00007'), want6 = cents(RAW['INV/2026/00006'].amount_residual);
  check('ARPAY', 'migrated-open', 'control: the migrated invoice INV/2026/00006 is Completed, unpaid, GrandTotal = raw residual ' + money(want6) + ', open ' + money(want6) + '; partner open = raw sum ' + money(rawOpen('Gemini Furniture', ['out_invoice', 'out_refund'])),
    i6 && i6.docstatus === 'CO' && i6.ispaid === 'N' && cents(i6.grandtotal) === want6 && invOpen(i6.c_invoice_id) === want6 && cents(gem.totalopenbalance) === rawOpen('Gemini Furniture', ['out_invoice', 'out_refund']), { inv: i6 && [i6.docstatus, i6.ispaid, i6.grandtotal], bp: gem.totalopenbalance });
  var b0 = bal(), target = MUT === 'wronginv' ? i7 : i6, P1 = pay('arpay', { receipt: true, bp: gem.c_bpartner_id, inv: target.c_invoice_id, amt: want6 / 100 });
  say('§TRD-ARPAY payment ok=' + P1.ok + ' err=' + P1.error + ' status=' + P1.status + ' state=' + J(P1.id && pstat(P1.id)));
  check('ARPAY', 'completes', 'the receipt Completes through MPayment.completeIt (DocStatus CO, Posted Y, IsAllocated Y) - the shipped path accepts a payment for a migrated invoice', P1.ok && P1.id && pstat(P1.id).docstatus === 'CO' && pstat(P1.id).posted === 'Y' && pstat(P1.id).isallocated === 'Y', { err: P1.error, st: P1.id && pstat(P1.id) });
  i6 = inv('INV/2026/00006');
  check('ARPAY', 'invoice-paid', 'INV/2026/00006 is Paid (IsPaid Y) and its open amount (GrandTotal - completed allocation lines, re-derived by SQL) is 0.00', i6.ispaid === 'Y' && invOpen(i6.c_invoice_id) === 0, { ispaid: i6.ispaid, open: invOpen(i6.c_invoice_id) });
  check('ARPAY', 'other-untouched', 'the OTHER Gemini invoice INV/2026/00007 is untouched: still unpaid, open ' + money(cents(RAW['INV/2026/00007'].amount_residual)), inv('INV/2026/00007').ispaid === 'N' && invOpen(i7.c_invoice_id) === cents(RAW['INV/2026/00007'].amount_residual), { open: invOpen(i7.c_invoice_id) });
  var wantBal = rawOpen('Gemini Furniture', ['out_invoice', 'out_refund']) - want6;
  check('ARPAY', 'partner-open', 'Gemini Furniture open amount goes from raw 4005.00 to ' + money(wantBal) + ' (raw INV/00007 residual)', cents(bp('Gemini Furniture').totalopenbalance) === wantBal, bp('Gemini Furniture').totalopenbalance);
  if (process.env.DBG) { say('§DBGX alloc ' + J(q('SELECT h.c_allocationhdr_id,h.docstatus,h.posted,h.processed,h.documentno FROM c_allocationhdr h WHERE ad_client_id=?', [C]))); say('§DBGX allocfacts ' + J(q('SELECT record_id,account_id,amtacctdr,amtacctcr FROM fact_acct WHERE ad_table_id=735 AND ad_client_id=?', [C]))); say('§DBGX paylog ' + J((P1.log || []).filter(function (l) { return /ost|ALLOC|alloc|PROC|MODEL/.test(String(l)); }).slice(0, 20))); }
  var d1 = delta(b0, bal()), wd = {}; wd[ACC.REC] = -want6; wd[ACC.INTR] = want6;
  say('§TRD-ARPAY delta by account=' + J(d1) + ' expected=' + J(wd) + ' roles=' + J(ACC));
  check('ARPAY', 'books-move', 'Fact_Acct moves by exactly the payment (Doc_Payment :121-175 + Doc_AllocationHdr :293-360): Receivable -' + money(want6) + ', BankInTransit +' + money(want6) + ', UnallocatedCash 0, nothing else', J(d1) === J(wd), { got: d1, want: wd });
  check('ARPAY', 'tb', 'the books still sum to 0.00 per accounting schema after the receipt', tbOk(), tb());
  // PARTIAL
  var ac = bp('Acme Corporation'), i4 = inv('INV/2026/00004'), r4 = cents(RAW['INV/2026/00004'].amount_residual), part = 100000, acme0 = cents(ac.totalopenbalance);
  var P2 = pay('arpart', { receipt: true, bp: ac.c_bpartner_id, inv: i4.c_invoice_id, amt: part / 100 }), i4b = inv('INV/2026/00004');
  check('ARPAY', 'partial', 'a PARTIAL receipt of ' + money(part) + ' on INV/2026/00004 (raw ' + money(r4) + ') leaves it unpaid with open ' + money(r4 - part) + ' and the partner open ' + money(acme0 - part), P2.ok && i4b.ispaid === 'N' && invOpen(i4.c_invoice_id) === r4 - part && cents(bp('Acme Corporation').totalopenbalance) === acme0 - part, { err: P2.error, ispaid: i4b.ispaid, open: invOpen(i4.c_invoice_id), bp: bp('Acme Corporation').totalopenbalance });
  check('ARPAY', 'tb-partial', 'books sum to 0.00 per schema after the partial receipt', tbOk(), tb());
  verdict('ARPAY');

  // ═══ SALES: a NEW order -> shipment -> invoice -> payment on migrated products / partners / price list ═══
  var prod = q("SELECT * FROM m_product WHERE ad_client_id=? AND value='E-COM08'", [C])[0], PL = q("SELECT m_pricelist_id AS id FROM m_pricelist WHERE ad_client_id=? AND issopricelist='Y'", [C])[0].id, WH = 1700834 && q("SELECT m_warehouse_id AS id FROM m_locator WHERE m_locator_id IN (SELECT m_locator_id FROM m_storageonhand WHERE ad_client_id=? AND m_product_id=?)", [C, prod.m_product_id])[0].id;
  var loc = q('SELECT c_bpartner_location_id AS id FROM c_bpartner_location WHERE c_bpartner_id=?', [gem.c_bpartner_id])[0].id, SO = q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='SOO' AND docsubtypeso='SO'", [C])[0].d;
  var onhand = function () { return Number(q('SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand WHERE ad_client_id=? AND m_product_id=?', [C, prod.m_product_id])[0].s); };
  var PT = q("SELECT c_paymentterm_id AS id FROM c_paymentterm WHERE ad_client_id=? AND isdefault='Y'", [C])[0].id;   // the window's default (Login #C_PaymentTerm_ID / MOrder.java:1314-1328)
  var QTY = 3, oh0 = onhand(), net = QTY * LISTP, TAXR = Number(q('SELECT rate FROM c_tax WHERE c_tax_id=(SELECT c_tax_id FROM c_tax WHERE ad_client_id=? AND isdefault=\'Y\')', [C])[0].rate), taxc = Math.round(net * TAXR / 100), grand = net + taxc;
  check('SALES', 'raw-stock', 'control: opening on-hand of Storage Box equals the raw stock.quant total (' + rawQty + ')', rawQty > 0 && oh0 === rawQty, { oh0: oh0, rawQty: rawQty });
  if (process.env.DBG) say('§DBGX terms ' + J(q('SELECT t.c_paymentterm_id,t.name,t.isdefault,t.isvalid,t.isactive,(SELECT count(*) FROM c_payschedule s WHERE s.c_paymentterm_id=t.c_paymentterm_id) AS sched FROM c_paymentterm t WHERE ad_client_id=?', [C])));
  var bS = bal(), O = tx('order', function (trx) {
    var o = ML.newPO(trx, 'c_order', { ad_org_id: T.orgId, c_doctypetarget_id: SO, c_doctype_id: SO, c_bpartner_id: gem.c_bpartner_id, c_bpartner_location_id: loc, bill_bpartner_id: gem.c_bpartner_id, bill_location_id: loc, m_pricelist_id: PL, c_paymentterm_id: PT, c_currency_id: 100, m_warehouse_id: WH, issotrx: 'Y', docstatus: 'DR', docaction: 'CO', dateordered: TODAY, dateacct: TODAY, datepromised: TODAY });
    var sv = ML.save(trx, 'c_order', null, o); if (!sv.ok) return { ok: false, error: 'save c_order: ' + sv.error };
    var oid = sv.row.c_order_id, l = ML.newPO(trx, 'c_orderline', { c_order_id: oid, ad_org_id: T.orgId, line: 10, m_product_id: prod.m_product_id, c_uom_id: prod.c_uom_id, qtyentered: QTY, qtyordered: QTY, m_warehouse_id: WH, c_currency_id: 100 });
    var sl = ML.save(trx, 'c_orderline', null, l); if (!sl.ok) return { ok: false, error: 'save c_orderline: ' + sl.error };
    var r = ML.processIt(trx, 'c_order', oid, 'CO'); if (process.env.DBG) { var oo = trx.get('c_order', oid); say('§DBGX order ' + J([oo.paymentrule, oo.c_paymentterm_id, oo.grandtotal, oo.ispayschedulevalid, oo.docstatus]) + ' ' + J(r)); }
    return { ok: !!r.ok, error: r.ok ? null : (r.msg || r.status), id: oid };
  });
  if (process.env.DBG) say('§DBGX orderlog ' + J((O.log || []).slice(-12)));
  if (O.ok) O.id = lastId('c_order');
  var ord = O.id && q('SELECT * FROM c_order WHERE c_order_id=?', [O.id])[0], ol = O.id && q('SELECT * FROM c_orderline WHERE c_order_id=?', [O.id])[0];
  say('§TRD-SALES order ok=' + O.ok + ' err=' + O.error + ' status=' + (ord && ord.docstatus) + ' priceactual=' + (ol && ol.priceactual) + ' totallines=' + (ord && ord.totallines) + ' grand=' + (ord && ord.grandtotal));
  check('SALES', 'order-priced', 'the order Completes and the line is priced from the MIGRATED price list: PriceActual = raw list_price ' + money(LISTP) + ', TotalLines = 3 x ' + money(LISTP) + ' = ' + money(net) + ', GrandTotal ' + money(grand) + ' (tax ' + TAXR + '% of the default C_Tax row)', O.ok && ord.docstatus === 'CO' && cents(ol.priceactual) === LISTP && cents(ord.totallines) === net && cents(ord.grandtotal) === grand, { err: O.error, line: ol && [ol.priceactual, ol.linenetamt], ord: ord && [ord.totallines, ord.grandtotal] });
  var run = function (label, pid, params) { return tx(label, function (trx) { var r = AP.runInTrx(trx, pid, { params: Object.assign({ AD_Client_ID: C, AD_Org_ID: T.orgId }, params) }); return { ok: !!(r && r.ok), error: r && r.ok ? null : (r && (r.msg || r.error)), r: r }; }); };
  var SH = run('ship', 118, { M_Warehouse_ID: WH, DocAction: 'CO', ConsolidateDocument: 'Y' }), ios = O.id && q('SELECT * FROM m_inout WHERE c_order_id=?', [O.id]);
  say('§TRD-SALES shipment ok=' + SH.ok + ' err=' + SH.error + ' shipments=' + J((ios || []).map(function (x) { return [x.documentno, x.docstatus, x.posted]; })));
  check('SALES', 'shipment', 'Generate Shipments (process 118) makes ONE Completed shipment for the order and on-hand falls by exactly ' + QTY + ' (' + oh0 + ' -> ' + (oh0 - QTY) + ')', SH.ok && ios.length === 1 && ios[0].docstatus === 'CO' && onhand() === oh0 - QTY, { err: SH.error, ios: ios, oh: onhand() });
  if (process.env.DBG) { say('§DBGX shiplog ' + J((SH.log || []).concat(SH.trxlog || []).slice(-10))); say('§DBGX ordbp ' + J(q('SELECT c_bpartner_id,bill_bpartner_id FROM c_order WHERE c_order_id=?', [O.id])) + ' gem=' + gem.c_bpartner_id); }
  var IV = run('invoice', 119, { DocAction: 'CO', ConsolidateDocument: 'Y', DateInvoiced: TODAY }); var ivs = O.id && q('SELECT * FROM c_invoice WHERE c_order_id=?', [O.id]), nv = ivs && ivs[0];
  say('§TRD-SALES invoice ok=' + IV.ok + ' err=' + IV.error + ' invoices=' + J((ivs || []).map(function (x) { return [x.documentno, x.docstatus, x.posted, x.totallines, x.grandtotal]; })));
  check('SALES', 'invoice', 'Generate Invoices (process 119) makes ONE Completed, Posted invoice: TotalLines ' + money(net) + ', GrandTotal ' + money(grand), IV.ok && ivs.length === 1 && nv.docstatus === 'CO' && nv.posted === 'Y' && cents(nv.totallines) === net && cents(nv.grandtotal) === grand, { err: IV.error, ivs: ivs });
  var fi = nv ? q('SELECT account_id AS a, SUM(amtacctdr)-SUM(amtacctcr) AS b FROM fact_acct WHERE ad_table_id=318 AND record_id=? GROUP BY account_id', [nv.c_invoice_id]) : [], fm = {}; fi.forEach(function (r) { fm[r.a] = cents(r.b); });
  var REV = acctOf(DEF.p_revenue_acct), TAXA = acctOf(q('SELECT t_due_acct AS a FROM c_tax_acct WHERE c_tax_id=(SELECT c_tax_id FROM c_tax WHERE ad_client_id=? AND isdefault=\'Y\')', [C])[0].a), wi = {}; wi[ACC.REC] = grand; wi[REV] = -net; wi[TAXA] = (wi[TAXA] || 0) - taxc;
  check('SALES', 'invoice-facts', 'Doc_Invoice ARI: Dr Receivable ' + money(grand) + ', Cr Revenue ' + money(net) + ', Cr Tax Due ' + money(taxc) + ' (account roles read from the tenant\'s config rows)', J(fm) === J(wi) || (Object.keys(wi).length === Object.keys(fm).length && Object.keys(wi).every(function (a) { return fm[a] === wi[a]; })), { got: fm, want: wi });
  // COST: the shipment of a migrated stocked item (legacy Doc_InOut MMS: Dr COGS / Cr Inventory at the product cost; no cost = "No Costs for <product>", Posted E)
  var sh1 = ios && ios[0], cogsWant = QTY * cents(ITEM.standard_price), shf = sh1 ? q('SELECT account_id AS a, SUM(amtacctdr)-SUM(amtacctcr) AS b FROM fact_acct WHERE ad_table_id=319 AND record_id=? GROUP BY account_id', [sh1.m_inout_id]) : [];
  say('§TRD-COST shipment posted=' + (sh1 && sh1.posted) + ' facts=' + J(shf) + ' raw standard_price=' + money(cents(ITEM.standard_price)) + ' m_cost rows=' + n(C, 'm_cost') + ' m_costelement rows=' + n(C, 'm_costelement'));
  known('COST', 'shipment-posts', 'the shipment posts (Posted Y) with COGS = 3 x raw standard_price ' + money(cents(ITEM.standard_price)) + ' = ' + money(cogsWant) + ' (Dr COGS / Cr Inventory, Doc_InOut MMS): the migration must carry the stock VALUE', sh1 && sh1.posted === 'Y' && shf.some(function (r) { return cents(r.b) === cogsWant; }), { posted: sh1 && sh1.posted, facts: shf },
    'Odoo standard_price is in the raw rows but the cut-over loads no M_Cost / cost element (born tenant has none; ImportInventory IsUpdateCosting is named not-ported): may the migration create the Standard-costing M_Cost rows from standard_price (a Costing Inventory document, ImportInventory.java:524-572), or is stock value out of scope for R5?');
  verdict('COST');
  var PN = nv && pay('salepay', { receipt: true, bp: gem.c_bpartner_id, inv: nv.c_invoice_id, amt: grand / 100 });
  check('SALES', 'paid', 'a receipt of ' + money(grand) + ' against the new invoice Completes and allocates it: IsPaid Y, open 0.00, Gemini open back to ' + money(wantBal), PN && PN.ok && inv(nv.documentno).ispaid === 'Y' && invOpen(nv.c_invoice_id) === 0 && cents(bp('Gemini Furniture').totalopenbalance) === wantBal, { err: PN && PN.error, open: nv && invOpen(nv.c_invoice_id), bp: bp('Gemini Furniture').totalopenbalance });
  check('SALES', 'tb', 'books sum to 0.00 per accounting schema after order -> shipment -> invoice -> payment; the receivable moved by +' + money(grand) + ' - ' + money(grand) + ' = 0 net of the cycle', tbOk() && (bal()[ACC.REC] || 0) - (bS[ACC.REC] || 0) === 0, { tb: tb(), recDelta: (bal()[ACC.REC] || 0) - (bS[ACC.REC] || 0) });
  verdict('SALES');

  // ═══ APPAY: pay a MIGRATED open vendor bill ═══
  var rm = bp('Ready Mat'), b6 = inv('BILL/2026/06/0002'), wantB = cents(RAW['BILL/2026/06/0002'].amount_residual), rm0 = cents(rm.totalopenbalance);
  check('APPAY', 'migrated-open', 'control: migrated bill BILL/2026/06/0002 is Completed, unpaid, open = raw residual ' + money(wantB) + '; vendor open = raw sum -' + money(-rawOpen('Ready Mat', ['in_invoice', 'in_refund'])), b6 && b6.docstatus === 'CO' && b6.ispaid === 'N' && invOpen(b6.c_invoice_id) === wantB && rm0 === rawOpen('Ready Mat', ['in_invoice', 'in_refund']), { rm0: rm0, b6: b6 && [b6.ispaid, b6.grandtotal] });
  var bA = bal(), P3 = pay('appay', { receipt: false, bp: rm.c_bpartner_id, inv: b6.c_invoice_id, amt: wantB / 100 });
  if (process.env.DBG) { say('§DBGX appay ' + J(q('SELECT c_payment_id,c_doctype_id,isreceipt,payamt,docstatus FROM c_payment WHERE c_payment_id=?', [P3.id]))); say('§DBGX appay facts ' + J(q('SELECT ad_table_id,record_id,account_id,amtacctdr,amtacctcr FROM fact_acct WHERE ad_client_id=? AND record_id IN (?,?) AND ad_table_id IN (335,735) ORDER BY fact_acct_id DESC LIMIT 6', [C, P3.id, lastId('c_allocationhdr')]))); }
  say('§TRD-APPAY payment ok=' + P3.ok + ' err=' + P3.error + ' state=' + J(P3.id && pstat(P3.id)));
  var dA = delta(bA, bal()), wA = {}; wA[ACC.LIAB] = wantB; wA[ACC.INTR] = -wantB;
  check('APPAY', 'bill-paid', 'the AP payment Completes (CO, Posted Y) and the bill is Paid with open 0.00', P3.ok && pstat(P3.id).docstatus === 'CO' && pstat(P3.id).posted === 'Y' && inv('BILL/2026/06/0002').ispaid === 'Y' && invOpen(b6.c_invoice_id) === 0, { err: P3.error, st: P3.id && pstat(P3.id) });
  check('APPAY', 'vendor-open', 'Ready Mat open amount goes from raw -11110.15 to ' + money(rm0 + wantB) + ' (raw BILL/10/0002 residual -4513.75)', cents(bp('Ready Mat').totalopenbalance) === rm0 + wantB && rm0 + wantB === -cents(RAW['BILL/2026/10/0002'].amount_residual), bp('Ready Mat').totalopenbalance);
  say('§TRD-APPAY delta by account=' + J(dA) + ' expected=' + J(wA));
  check('APPAY', 'books-move', 'Fact_Acct moves by exactly the payment (Doc_Payment APP + Doc_AllocationHdr): Liability +' + money(wantB) + ' (debit), BankInTransit -' + money(wantB) + ' (credit), PaymentSelect 0', J(dA) === J(wA), { got: dA, want: wA });
  check('APPAY', 'tb', 'books sum to 0.00 per accounting schema after the AP payment', tbOk(), tb());
  verdict('APPAY');

  var CS = ['SETUP', 'ARPAY', 'SALES', 'APPAY'], ALLV = CS.map(function (c) { return CASES[c] ? (CASES[c].failed ? 'FAIL' : 'PASS') : 'INCONCLUSIVE'; });
  say('§TRD-VERDICT ' + (!ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS') + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' blocked=' + ALL.blocked + ' cases=' + J(ALLV));
  process.exit(!ALL.judged ? 3 : ALL.failed ? 1 : 0);
})();
