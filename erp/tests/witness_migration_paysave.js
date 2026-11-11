#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MIGRATION-PAYSAVE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §PAYSAVE-SPEC). READ THE LOG after every run: every verdict is a §PAYSAVE line.
// THE ISSUE it proves/disproves: on a MIGRATED tenant in the live PAGE, saving a Payment in the Payment window was refused "Mandatory: C_BankAccount_ID" (ad_modelval MPayment.bankOrCashbookMandatory, `> 0`, port of
//   MPayment.java:696 `<= 0`) because the page gives every op-log row the SYNTHETIC negative pk (-opId): the migration's bank accounts, partners and invoices are all negative. witness_migration_trade (PASS 26) never saw
//   it: it runs on the headless ws_kernel whose ids are POSITIVE (and hard-codes c_bankaccount_id 1000001) - same model path, WRONG ID LAW. This witness runs the migration under the page's law (WS_ID_LAW=synthetic, ws_kernel newId
//   negative+unique), prints the census of negative ids per table (§PAYSAVE-NEG), then Saves the Payment through ML.save (the validation hooks the window runs) against a MIGRATED bank account / partner / open invoice and
//   asserts the ROWS after (invoice paid, partner open amount from the raw fixture, net facts, trial balance 0.00). MUTANTS: PAYSAVE_MUT=oldcheck (the plain `> 0`) must FAIL; case GHOST (a negative id that is no row) must still be REFUSED.
//   Nothing judged -> INCONCLUSIVE. Command: node erp/tests/witness_migration_paysave.js 2>&1 | tee /tmp/count_logs/mig_migration_paysave.log
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
  say('  §PAYSAVE-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1800))); }
// known(): a check whose expectation is legacy-correct but whose fix is NOT in this change (BLOCKED with one owner question). While it fails it is printed as §PAYSAVE-BLOCKED, never counted PASS, never hidden;
//   the day it passes it is an ordinary judged check.
function known(cs, key, rule, ok, info, question) { if (ok) return check(cs, key, rule, ok, info); ALL.blocked++; say('  §PAYSAVE-BLOCKED case=' + cs + ' key=' + key + ' rule="' + rule + '" got=' + String(J(info)).slice(0, 900) + ' QUESTION="' + question + '"'); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§PAYSAVE-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var cents = function (v) { return Math.round(Number(v || 0) * 100); }, money = function (c) { return (c / 100).toFixed(2); };

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  ['ImportInventory.js', 'ImportGLJournal.js', 'ImportInvoice.js', 'InOutGenerate.js', 'InvoiceGenerate.js'].forEach(function (f) { try { require(path.join(ERP, 'processes', f)); } catch (e) { say('§PAYSAVE-LOAD ' + f + ' not loadable: ' + e.message); } });
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
  say('§PAYSAVE-CONFIG mutant=' + (MUT || 'none') + ' erp=' + ERP);
  // ── the migrated tenant ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  var T = mk('Trade Co'), C = T.clientId, M0 = SHIPPED.length, FM = full(T);
  say('§PAYSAVE-SETUP migrated: stage1=' + FM.r.ok + ' stage2=' + FM.a.ok + ' ' + String(FM.a.msg).slice(0, 160));
  check('SETUP', 'migrated', 'control: the fixture is migrated (stage 2 "Open balances completed", §MIG-VERIFY PASS judged>0) before any trade is judged', FM.r.ok && FM.a.ok && /Open balances completed/.test(FM.a.msg) && /verdict=PASS judged=[1-9]/.test(ver(M0)), { r: FM.r.msg, a: FM.a.msg });
  // ── raw rows (expected values) ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  var RAW = {}; EXP.sets.open_moves.forEach(function (m) { RAW[m.name] = m; });
  var rawOpen = function (partnerName, types) { return EXP.sets.open_moves.filter(function (m) { return m.partner_id__name === partnerName && types.indexOf(m.move_type) >= 0; }).reduce(function (s, m) { return s + cents(m.amount_residual) * ({ out_invoice: 1, in_invoice: -1, out_refund: -1, in_refund: 1 }[m.move_type]); }, 0); };   // customer open +, vendor open - (iDempiere TotalOpenBalance sign)
  var ITEM = EXP.sets['product.product'].filter(function (p) { return p.default_code === 'E-COM08'; })[0], LISTP = cents(ITEM.list_price);
  var rawQty = EXP.sets['stock.quant'].filter(function (x) { return String(x.product_id__name).indexOf('[E-COM08]') === 0; }).reduce(function (s, x) { return s + Number(x.quantity || 0); }, 0);
  say('§PAYSAVE-RAW GemOpen=' + money(rawOpen('Gemini Furniture', ['out_invoice', 'out_refund'])) + ' AcmeOpen=' + money(rawOpen('Acme Corporation', ['out_invoice', 'out_refund'])) + ' ReadyMatOpen=' + money(rawOpen('Ready Mat', ['in_invoice', 'in_refund'])) + ' item_list=' + money(LISTP) + ' item_qty=' + rawQty);
  // ── helpers on the tenant ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function tx(label, fn) {
    var trx = new ML.Trx(k.q, Object.assign(k.env(T), { date: TODAY + ' 00:00:00' })), r;
    try { r = fn(trx) || { ok: true }; } catch (e) { r = { ok: false, error: 'threw: ' + (e && e.message) }; if (process.env.DBG) say(String(e && e.stack).split('\n').slice(0, 8).join('\n')); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [];
    if (MUT === 'unbal' && label === 'arpay') { var dropped = false; ops = ops.filter(function (o) { if (!dropped && o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE' && cents(o.fields.amtacctdr) > 0) { dropped = true; return false; } return true; }); say('§PAYSAVE-MUT unbal dropped a debit fact: ' + dropped); }
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
  var LAW = process.env.WS_ID_LAW;
  var tb0 = tb(); check('SETUP', 'tb-start', 'control: the migrated books sum to 0.00 per accounting schema before the payment (judged on ' + tb0.length + ' schema(s))', tbOk(), tb0);
  // ── census: negative ids left in committed rows of the tenant, per table ──────────────────────────────────────────────────────
  var neg = {}, tot = 0, allT = 0;
  q("SELECT name FROM sqlite_master WHERE type='table'").forEach(function (t) { try { var cols = q('PRAGMA table_info(' + t.name + ')').map(function (c) { return c.name; }), pk = t.name.toLowerCase() + '_id';   // the key column by AD convention (<table>_id)
    cols = cols.map(function (c) { return c.toLowerCase(); }); if (cols.indexOf(pk) < 0 || cols.indexOf('ad_client_id') < 0) return; var r = q('SELECT SUM(' + pk + '<0) AS ng, count(*) AS n FROM ' + t.name + ' WHERE ad_client_id=?', [C])[0];
    if (r.n) allT++; if (r.ng) { neg[t.name.toLowerCase()] = r.ng + '/' + r.n; tot += r.ng; } } catch (e) {} });
  say('§PAYSAVE-NEG law=' + LAW + ' tables_with_rows=' + allT + ' tables_with_negative=' + Object.keys(neg).length + ' rows_negative=' + tot + ' ' + Object.keys(neg).map(function (t) { return t + '=' + neg[t]; }).join(' '));
  var BAR = q('SELECT c_bankaccount_id AS id, c_bank_id AS b FROM c_bankaccount WHERE ad_client_id=?', [C]);
  if (LAW === 'synthetic') check('PREMISE', 'bank-negative', 'control: under the page law every migrated C_BankAccount / C_Bank id is NEGATIVE (the premise of the defect; ' + BAR.length + ' account(s))', BAR.length > 0 && BAR.every(function (r) { return r.id < 0 && r.b < 0; }), BAR);
  else say('§PAYSAVE-NOTE law=' + LAW + ': positive-law control run (the legacy-like ids of the headless kernel)');
  // ── GHOST: a negative id that is NO row must still be refused (the `> 0` rule is not loosened) ────────────────────────────────────
  var gem = bp('Gemini Furniture'), i6 = inv('INV/2026/00006'), i7 = inv('INV/2026/00007'), want6 = cents(RAW['INV/2026/00006'].amount_residual);
  var g = tx('ghost', function (trx) { var p = ML.newPO(trx, 'c_payment', { ad_org_id: T.orgId, c_doctype_id: ARR, c_bankaccount_id: -987654, c_bpartner_id: gem.c_bpartner_id, c_invoice_id: i6.c_invoice_id, payamt: want6 / 100, isreceipt: 'Y', c_currency_id: 100, datetrx: TODAY, dateacct: TODAY, docstatus: 'DR', docaction: 'CO' });
    var sv = ML.save(trx, 'c_payment', null, p); return sv.ok ? { ok: true } : { ok: false, error: sv.error }; });
  say('§PAYSAVE-GHOST ok=' + g.ok + ' err=' + g.error);
  check('GHOST', 'refused', 'a bank account id that is neither positive nor a row of C_BankAccount is still refused: "Mandatory: C_BankAccount_ID" (legacy MPayment.java:696)', g.ok === false && /Mandatory: C_BankAccount_ID/.test(String(g.error)), { ok: g.ok, err: g.error });
  var g0 = tx('ghost0', function (trx) { var p = ML.newPO(trx, 'c_payment', { ad_org_id: T.orgId, c_doctype_id: ARR, c_bankaccount_id: 0, c_bpartner_id: gem.c_bpartner_id, payamt: 1, isreceipt: 'Y', c_currency_id: 100, datetrx: TODAY, dateacct: TODAY, docstatus: 'DR', docaction: 'CO' });
    var sv = ML.save(trx, 'c_payment', null, p); return sv.ok ? { ok: true } : { ok: false, error: sv.error }; });
  check('GHOST', 'zero-refused', 'no bank account (0) is refused "Mandatory: C_BankAccount_ID"', g0.ok === false && /Mandatory.*C_BankAccount_ID/.test(String(g0.error)), { ok: g0.ok, err: g0.error });
  check('GHOST', 'nothing-written', 'the refused saves wrote no C_Payment row', n(C, 'c_payment') === 0, n(C, 'c_payment'));
  // ── PAYSAVE: the Payment Save + Complete on the MIGRATED bank account / partner / open invoice ───────────────────────────────────
  check('PAYSAVE', 'migrated-open', 'control: INV/2026/00006 is a migrated, Completed, unpaid invoice, GrandTotal = raw residual ' + money(want6) + '; partner open = raw sum ' + money(rawOpen('Gemini Furniture', ['out_invoice', 'out_refund'])),
    i6 && i6.docstatus === 'CO' && i6.ispaid === 'N' && cents(i6.grandtotal) === want6 && cents(gem.totalopenbalance) === rawOpen('Gemini Furniture', ['out_invoice', 'out_refund']), { inv: i6 && [i6.docstatus, i6.ispaid, i6.grandtotal], bp: gem.totalopenbalance });
  var b0 = bal(), P1 = pay('paysave', { receipt: true, bp: gem.c_bpartner_id, inv: i6.c_invoice_id, amt: want6 / 100 });
  say('§PAYSAVE-SAVE bank=' + BAID + ' bp=' + gem.c_bpartner_id + ' inv=' + i6.c_invoice_id + ' ok=' + P1.ok + ' err=' + P1.error + ' status=' + P1.status + ' state=' + J(P1.id && pstat(P1.id)));
  check('PAYSAVE', 'saved', 'the Payment SAVES (no "Mandatory: C_BankAccount_ID") against the migrated bank account ' + BAID + ', partner and invoice, and Completes (CO, Posted Y, IsAllocated Y)', P1.ok && P1.id && pstat(P1.id) && pstat(P1.id).docstatus === 'CO' && pstat(P1.id).posted === 'Y' && pstat(P1.id).isallocated === 'Y', { err: P1.error, st: P1.id && pstat(P1.id) });
  var p1 = P1.id ? q('SELECT c_bankaccount_id AS b FROM c_payment WHERE c_payment_id=?', [P1.id])[0] : null;
  check('PAYSAVE', 'row-bank', 'the stored C_Payment row carries the migrated bank account id ' + BAID, !!p1 && Number(p1.b) === Number(BAID), p1);
  i6 = inv('INV/2026/00006'); gem = bp('Gemini Furniture');
  check('PAYSAVE', 'invoice-paid', 'INV/2026/00006 IsPaid Y and open 0.00 (GrandTotal - completed allocation lines, re-derived by SQL)', i6.ispaid === 'Y' && invOpen(i6.c_invoice_id) === 0, { ispaid: i6.ispaid, open: invOpen(i6.c_invoice_id) });
  check('PAYSAVE', 'partner-open', 'Gemini open amount ' + money(rawOpen('Gemini Furniture', ['out_invoice', 'out_refund'])) + ' -> raw INV/00007 residual ' + money(cents(RAW['INV/2026/00007'].amount_residual)), cents(gem.totalopenbalance) === cents(RAW['INV/2026/00007'].amount_residual), { open: gem.totalopenbalance });
  check('PAYSAVE', 'other-untouched', 'the other Gemini invoice INV/2026/00007 is still unpaid, open ' + money(cents(RAW['INV/2026/00007'].amount_residual)), inv('INV/2026/00007').ispaid === 'N' && invOpen(i7.c_invoice_id) === cents(RAW['INV/2026/00007'].amount_residual), { open: invOpen(i7.c_invoice_id) });
  var d1 = delta(b0, bal()), want = {}; want[ACC.REC] = -want6; want[ACC.INTR] = want6;
  check('PAYSAVE', 'net-facts', 'net posting Dr BankInTransit ' + money(want6) + ' / Cr Receivable ' + money(want6) + ', UnallocatedCash 0 (Doc_Payment.java createFacts + Doc_AllocationHdr.java :293-360)', J(d1) === J(want) || (Object.keys(d1).length === 2 && d1[ACC.REC] === -want6 && d1[ACC.INTR] === want6 && !d1[ACC.UNAL]), { d: d1, want: want });
  check('PAYSAVE', 'tb', 'trial balance sums to 0.00 per accounting schema after the payment', tbOk(), tb());
  // ── verdict ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  Object.keys(CASES).forEach(verdict);
  var V = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§PAYSAVE-VERDICT ' + V + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' law=' + LAW + ' mutant=' + (process.env.PAYSAVE_MUT || 'none'));
  process.exit(V === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§PAYSAVE-VERDICT FAIL crashed ' + (e && e.stack || e)); process.exit(1); });
