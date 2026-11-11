#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-OPEN-BALANCES (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §E3C-SPEC 1(d)+(e), §3). READ THE LOG after every run: every verdict is a §OB line and the
//   shipped loader's own §MIG-* lines are printed with it; the exit code is not the evidence. INCONCLUSIVE when nothing was judged.
// THE ISSUE it proves/disproves: after "Migrate from Odoo" with the agent's odoo_export.json, are the migrated tenant's BOOKS the source's books at the cut-over — the trial
//   balance account by account, every open customer / vendor invoice and credit note open again per partner, and the clearing accounts back at zero (the cut-over method's own proof,
//   §B3-SCOUT)? Before §E3C a migration brought master data only: no Fact_Acct at all.
// SOURCE = the RECORDED export of the live demo Odoo 17 (fixtures/odoo_export_2026-11-10: workbook + manifest + odoo_export.json, written by erp/odoo_agent/export.js). The ORACLE
//   is computed here from the RAW rows of odoo_export.json (account.move.line totals and open lines as Odoo returned them) — never through the engine, the template or the loader.
// SPEC (claims written before the code; each check names the issue it proves):
//   SUMMARY  before anything is written the form shows the two open sheets (rows predicted), the lines it could not bring in (refused, why), and what it will create; nothing is written.
//   PERIOD   a cut-over whose period is not open (login long after it, Automatic Period Control on) is refused BEFORE anything is written, saying what to do (legacy's own gate).
//   RUN      Process + stage 2: Import GL Journal 220 -> batch Completed; Import Invoice 207 DocAction CO -> every document Completed, Posted, not paid; the loader's own
//            §MIG-VERIFY says PASS.
//   PREREQ   the clearing accounts, the no-tax tax and the two Opening Charges exist once, and each charge's account IS its clearing account (the link the proof rests on).
//   TB       the tenant's books (ALL Fact_Acct of the tenant) == the source trial balance, account by account, for every account that is not receivable / payable / bank;
//            the source's receivable and payable totals sit on the tenant's own control accounts; the bank total sits on the tenant's bank asset account and Bank Clearing is back at 0.00 (§E3D; it waited there, state OPEN, before); sum == 0.
//   CLEAR    AR Clearing == 0 and AP Clearing == 0.
//   OPEN     per partner and side, the open amount of the tenant's documents == the source's open lines; each document keeps its number, its date, its kind; one charge line, no tax.
//   BANK     (§E3D-SPEC) the bank balance comes across as an OPENING BANK STATEMENT per bank / cash journal: the bank and bank account exist (the bank the journal names, else one named after
//            the company; AccountNo = the Odoo account number, else the journal's code), ImportBankStatement 221 made ONE Drafted statement per account, Completed and Posted; Bank Clearing == 0.00
//            (it was 12,444.87, state OPEN); the tenant's bank asset account carries the source balance per bank account; the loader's §MIG-CLEAR BANK / §MIG-BANK / §MIG-VERIFY say PASS.
//            ORACLE = the raw tb + account.journal + res.partner.bank rows. Falsifier: a second trial-balance row of 100.00 on the bank account (balanced elsewhere) that only the journal takes
//            -> the statement is 100.00 short -> stage 2 is refused naming the 100.00 left on Bank Clearing.
//   RERUN    a second Process is refused whole; nothing changes.
//   PERIOD-OPEN (a third tenant, login 2026-12-20, weeks after the cut-over) the user does what legacy asks — unticks Automatic Period Control on the Accounting Schema and opens the
//            cut-over period with Period Status (AD_Process 167); the form still refuses until TODAY's period is open too (legacy dates the journal batch today); then the same
//            files load: stage 2 completes, §MIG-VERIFY says PASS.
//   JSON-ONLY (§ODOO-ENGINE-SPEC O3; a fourth tenant) the SAME export picked as odoo_export.json ALONE — no workbook, no manifest.json: the form builds the whole book from the
//            agent's raw rows through the engine (templates/odoo-17.json). The tenant must end exactly as the workbook tenant did: every one of the 17 master tables the same
//            row count, the same books account by account, the same open amount per partner, §MIG-VERIFY PASS; a file whose set is short of Odoo's own count is refused first.
//   FALSIFY  (a second tenant) one open line removed from the export -> stage 2 is refused and NAMES that exact amount on the clearing account; no journal, no invoice stays.
// Command: node erp/tests/witness_open_balances.js 2>&1 | tee /tmp/count_logs/open_balances.log
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-10');
var _log = console.log, SHIPPED = []; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§(MIG-|E1-STOCK|ODOO-FORM run|IMPORT_|PROC-)/.test(l)) SHIPPED.push(l); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §OB-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1800))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§OB-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var cents = function (v) { return Math.round(Number(v || 0) * 100); }, money = function (c) { return (c / 100).toFixed(2); };

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  ['ImportInventory.js', 'ImportGLJournal.js', 'ImportInvoice.js'].forEach(function (f) { try { require(path.join(ERP, 'processes', f)); } catch (e) { say('§OB-LOAD ' + f + ' not loadable: ' + e.message); } });
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  function birth(name) {
    var born = G.birthTenant({ clientName: name, currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: name.replace(/\W/g, '') + 'Admin', dateAcct: '2026-11-10', countryId: 100 });
    var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
    G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-10 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
    var R = rb.refs; return { clientId: R.clientId, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:open-balances' };
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

  // ── the ORACLE, from the raw rows only ──
  var acct = {}; EXP.sets['account.account'].forEach(function (a) { acct[a.id] = a; });
  var OCONV = await import(url.pathToFileURL(path.join(__dirname, 'fixtures', 'odoo_convert_reference.mjs')).href), exp = EXP;
  var pkey = (function () { var c = OCONV.convert(exp), pv = c.provenance[c.book[4].name] || [], held = {}, val = {}, by = {}, o = {};   // the partner's business-partner Value and "held", from the FROZEN hand mapping (never from the template)
      pv.forEach(function (x, i) { val[x.id] = c.book[4].rows[i + 1][0]; }); (c.manifest.held || []).forEach(function (h) { held[h.id] = h.why; }); exp.sets['res.partner'].forEach(function (p) { by[p.id] = p; });
      exp.sets['res.partner'].forEach(function (p) { var top = by[p.commercial_partner_id] || p; o[p.id] = { id: p.id, value: val[top.id] || '', held: held[p.id] || '' }; }); return o; })();
  var KCLS = { asset_receivable: 'AR', liability_payable: 'AP', asset_cash: 'BANK' }, SRC = { plain: {}, cls: { AR: 0, AP: 0, BANK: 0 } };
  EXP.sets.tb.forEach(function (r) { var c = cents(r.balance), kc = KCLS[acct[r.account_id].account_type]; if (!c) return; if (kc) SRC.cls[kc] += c; else SRC.plain[acct[r.account_id].code] = c; });
  var INVT = { out_invoice: 'ARI', out_refund: 'ARC', in_invoice: 'API', in_refund: 'APC' }, SRCOPEN = {}, SRCDOC = {}, srcEntry = 0;
  EXP.sets.open_lines.forEach(function (l) { var b = INVT[l.move_type]; if (!b) { srcEntry++; return; } var side = b[1] === 'R' ? 'AR' : 'AP', kk = side + '|' + pkey[l.partner_id].value;
    SRCOPEN[kk] = (SRCOPEN[kk] || 0) + cents(l.amount_residual); var d = SRCDOC[l.move_name] = SRCDOC[l.move_name] || { base: b, bp: pkey[l.partner_id].value, date: l.invoice_date || l.date, amt: 0 }; d.amt += Math.abs(cents(l.amount_residual)); });
  say('§OB-SOURCE cutover=' + CUT + ' plain_accounts=' + Object.keys(SRC.plain).length + ' AR=' + money(SRC.cls.AR) + ' AP=' + money(SRC.cls.AP) + ' BANK=' + money(SRC.cls.BANK) + ' open_documents=' + Object.keys(SRCDOC).length + ' open_partners=' + J(Object.keys(SRCOPEN).sort().map(function (p) { return p + '=' + money(SRCOPEN[p]); })) + ' non_invoice_open_lines=' + srcEntry);

  // ═══ PERIOD: login long after the cut-over, Automatic Period Control on ⇒ refused before anything is written ═══
  var T1 = birth('Open Co'), C = T1.clientId, late = session(T1, '2027-02-01'), C0 = snap(C);
  say('§OB-TENANT client=' + C + ' cutover=' + CUT);
  var rl = late.rows(files(), null), lateP = rl.filter(function (r) { return /^⚠ Open balances: the period of the cut-over date/.test(r.item); });
  check('PERIOD', 'refused-summary', 'the summary of a login on 2027-02-01 carries the problem row naming the cut-over date ' + CUT + ', the document base types and the step (untick Automatic Period Control, open the period)', lateP.length === 1 && lateP[0].item.indexOf(CUT) > 0 && /GLJ/.test(lateP[0].item) && /Automatic Period Control/.test(lateP[0].item), { items: rl.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item; }) });
  var el = late.execute(files(), answer(rl));
  check('PERIOD', 'refused-run', 'Process on that login is refused and the tenant is unchanged (no master, no import row, no document)', !el.ok && J(snap(C)) === J(C0), { ok: el.ok, msg: String(el.msg).slice(0, 200), snap: snap(C) });
  verdict('PERIOD');

  // ═══ SUMMARY (login the day after the cut-over: inside Automatic Period Control's window, as a migration AT the cut-over is) ═══
  var ses = session(T1, '2026-11-11'), r1 = ses.rows(files(), null), cur = answer(r1), r2 = ses.rows(files(), cur);
  var item = function (rs, it) { return rs.filter(function (r) { return r.item === it; })[0]; }, gj = item(r2, 'I_GLJournal'), iv = item(r2, 'I_Invoice');
  say('§OB-SUMMARY problems=' + J(r2.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item; })) + ' journal=' + J(gj && [gj.odoo, gj.infile, gj.will, gj.refused]) + ' invoices=' + J(iv && [iv.odoo, iv.infile, iv.will, iv.refused, iv.reason, iv.locked]) + ' info=' + J(r2.filter(function (r) { return /^ℹ/.test(r.item); }).map(function (r) { return r.item; })));
  check('SUMMARY', 'no-problem', 'with the units answered there is no problem row', !r2.some(function (r) { return /^⚠/.test(r.item); }), r2.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item; }));
  check('SUMMARY', 'journal', 'the opening journal is a sheet of the summary: ' + EXP.sets.tb.length + ' lines in the file, all predicted to import', !!gj && gj.infile === EXP.sets.tb.length && gj.will === gj.infile && !gj.refused, gj);
  check('SUMMARY', 'invoices', 'the open documents are a sheet: ' + Object.keys(SRCDOC).length + ' predicted; the ' + srcEntry + ' open lines that are not invoices are shown as refused with the reason; the sheet is locked to the journal', !!iv && iv.infile === Object.keys(SRCDOC).length && iv.will === iv.infile && iv.refused === srcEntry && /not an invoice/.test(iv.reason || '') && iv.locked, iv);
  var info = r2.filter(function (r) { return /^ℹ Will create/.test(r.item); }).map(function (r) { return r.item; });
  check('SUMMARY', 'will-create', 'the summary names what it will create: 3 clearing accounts (AR, AP, bank), the no-tax tax, the 3 Opening Charges (AR, AP, bank — §E3D-SPEC added the bank one)', info.length === 7 && info.filter(function (t) { return /account /.test(t); }).length === 3 && info.filter(function (t) { return /charge /.test(t); }).length === 3 && info.filter(function (t) { return /tax /.test(t); }).length === 1, info);
  var bnkS = ['C_Bank', 'C_BankAccount', 'I_BankStatement'].map(function (t) { return item(r2, t); });
  check('SUMMARY', 'bank-sheets', 'the bank is a sheet of the summary: C_Bank, C_BankAccount, I_BankStatement, every row predicted to import, the statement sheet locked to the journal', bnkS.every(function (x) { return x && x.infile >= 1 && x.will === x.infile && !x.refused; }) && bnkS[2].locked, bnkS);
  check('SUMMARY', 'readonly', 'the summary wrote nothing (same counts before and after)', J(snap(C)) === J(C0), { before: C0, after: snap(C) });
  verdict('SUMMARY');

  // ═══ RUN ═══
  var mark = SHIPPED.length, res = ses.execute(files(), cur), aft = res.ok ? ses.after(files(), cur) : { ok: false, msg: 'stage 1 refused' };
  say('§OB-RUN stage1 ok=' + res.ok + ' msg=' + String(res.msg).slice(0, 260));
  say('§OB-RUN stage2 ok=' + aft.ok + ' msg=' + String(aft.msg).slice(0, 400));
  SHIPPED.slice(mark).filter(function (l) { return /^§(MIG-|PROC-UNPORTED|PROC-SQL)/.test(l); }).forEach(function (l) { say('  shipped> ' + l.slice(0, 330)); });
  var verLine = SHIPPED.slice(mark).filter(function (l) { return /^§MIG-VERIFY/.test(l); }).pop() || '';
  check('RUN', 'stage1', 'Process loads the masters, the import rows and the prerequisites in one transaction', res.ok, res.msg);
  check('RUN', 'stage2', 'stage 2 (Import GL Journal → Complete, Import Invoice CO, the verifier) ends without a refusal and says so', aft.ok && /Open balances completed/.test(String(aft.msg)), aft.msg);
  check('RUN', 'shipped-verifier', 'the loader\'s own verifier printed §MIG-VERIFY verdict=PASS with > 0 checks judged (the shipped log is the primary evidence)', /verdict=PASS judged=[1-9]/.test(verLine), verLine);
  var batches = q('SELECT docstatus AS s, count(*) AS n FROM gl_journalbatch WHERE ad_client_id=? GROUP BY 1', [C]), jr = q('SELECT gl_journal_id AS id, docstatus AS s, posted AS p FROM gl_journal WHERE ad_client_id=?', [C]), jl = n(C, 'gl_journalline');
  check('RUN', 'journal', 'ONE batch, ONE journal, Completed and Posted, with one line per source account that has a balance (' + EXP.sets.tb.length + ')', J(batches) === J([{ s: 'CO', n: 1 }]) && jr.length === 1 && jr[0].s === 'CO' && jr[0].p === 'Y' && jl === EXP.sets.tb.length, { batches: batches, jr: jr, lines: jl });
  var invs = q('SELECT i.c_invoice_id AS id, i.documentno AS no, i.docstatus AS s, i.posted AS p, i.ispaid AS paid, i.grandtotal AS total, i.totallines AS net, substr(i.dateinvoiced,1,10) AS d, substr(i.dateacct,1,10) AS da, bp.value AS bp, dt.docbasetype AS b, ' +
    '(SELECT count(*) FROM c_invoiceline l WHERE l.c_invoice_id=i.c_invoice_id) AS nl, (SELECT count(*) FROM c_invoiceline l WHERE l.c_invoice_id=i.c_invoice_id AND l.c_charge_id IS NOT NULL AND l.m_product_id IS NULL) AS nc, ' +
    '(SELECT COALESCE(SUM(t.taxamt),0) FROM c_invoicetax t WHERE t.c_invoice_id=i.c_invoice_id) AS tax FROM c_invoice i JOIN c_bpartner bp ON bp.c_bpartner_id=i.c_bpartner_id JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id WHERE i.ad_client_id=? ORDER BY i.documentno', [C]);
  var notOk = invs.filter(function (i) { return i.s !== 'CO' || i.p !== 'Y' || i.paid === 'Y'; });
  check('RUN', 'documents', Object.keys(SRCDOC).length + ' documents, every one Completed, Posted, not paid', invs.length === Object.keys(SRCDOC).length && notOk.length === 0, { n: invs.length, notOk: notOk.slice(0, 4) });
  verdict('RUN');

  // ═══ PREREQ ═══
  var VARS = (await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate_convert.mjs')).href)).TEMPLATE.variables;
  var CLR = { AR: VARS.AR_CLEARING, AP: VARS.AP_CLEARING, BANK: VARS.BANK_CLEARING };
  var evs = q('SELECT value, accounttype FROM c_elementvalue WHERE ad_client_id=? AND value IN (?,?,?) ORDER BY value', [C, CLR.AR, CLR.AP, CLR.BANK]);
  var tx = q('SELECT t.rate AS rate, t.istaxexempt AS ex, tc.name AS cat FROM c_tax t JOIN c_taxcategory tc ON tc.c_taxcategory_id=t.c_taxcategory_id WHERE t.ad_client_id=? AND t.taxindicator=?', [C, VARS.TAX_NONE]);
  var chg = q('SELECT ch.name AS name, ev.value AS acct FROM c_charge ch JOIN c_charge_acct ca ON ca.c_charge_id=ch.c_charge_id JOIN c_validcombination vc ON vc.c_validcombination_id=ca.ch_expense_acct JOIN c_elementvalue ev ON ev.c_elementvalue_id=vc.account_id WHERE ch.ad_client_id=? ORDER BY ch.name', [C]);
  check('PREREQ', 'accounts', 'the three clearing accounts exist exactly once each', evs.length === 3, evs);
  check('PREREQ', 'tax', 'ONE tax with TaxIndicator ' + VARS.TAX_NONE + ': rate 0, exempt, in its own tax category', tx.length === 1 && Number(tx[0].rate) === 0 && tx[0].ex === 'Y' && /Opening Balance/.test(tx[0].cat), tx);
  check('PREREQ', 'charge-link', 'the three Opening Charges exist and each charge\'s account IS its clearing account (AP → ' + CLR.AP + ', AR → ' + CLR.AR + ', Bank → ' + CLR.BANK + ') — the link the zero-proof rests on [was two charges before §E3D]', J(chg) === J([{ name: VARS.CHARGE_AP, acct: CLR.AP }, { name: VARS.CHARGE_AR, acct: CLR.AR }, { name: VARS.CHARGE_BANK, acct: CLR.BANK }]), chg);
  verdict('PREREQ');

  // ═══ TB + CLEAR: ALL the tenant's Fact_Acct against the source ═══
  var books = {}; q('SELECT ev.value AS v, SUM(f.amtacctdr) AS dr, SUM(f.amtacctcr) AS cr, COUNT(*) AS n FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_client_id=? GROUP BY ev.value', [C]).forEach(function (r) { books[r.v] = cents(r.dr) - cents(r.cr); });
  var srcCodes = Object.keys(SRC.plain), offPlain = srcCodes.filter(function (a) { return books[a] !== SRC.plain[a]; });
  var bankAsset = (q('SELECT ev.value AS v FROM c_acctschema_default d JOIN c_acctschema a ON a.c_acctschema_id=d.c_acctschema_id JOIN c_validcombination vc ON vc.c_validcombination_id=d.b_asset_acct JOIN c_elementvalue ev ON ev.c_elementvalue_id=vc.account_id WHERE d.ad_client_id=?', [C])[0] || {}).v;   // the tenant's bank asset account (accounting schema default B_Asset_Acct): where a bank statement posts the bank balance
  var clearing = [CLR.AR, CLR.AP, CLR.BANK], control = Object.keys(books).filter(function (a) { return srcCodes.indexOf(a) < 0 && clearing.indexOf(a) < 0; });
  var ctl = {}; q('SELECT ev.value AS v, dt.docbasetype AS b, SUM(f.amtacctdr) AS dr, SUM(f.amtacctcr) AS cr FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id JOIN c_invoice i ON i.c_invoice_id=f.record_id JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id WHERE f.ad_client_id=? AND f.ad_table_id=318 GROUP BY ev.value, dt.docbasetype', [C])
    .forEach(function (r) { if (clearing.indexOf(r.v) >= 0) return; var side = r.b[1] === 'R' ? 'AR' : 'AP'; ctl[side] = (ctl[side] || 0) + cents(r.dr) - cents(r.cr); (ctl[side + '_accounts'] = ctl[side + '_accounts'] || {})[r.v] = 1; });
  var total = Object.keys(books).reduce(function (s, a) { return s + books[a]; }, 0);
  say('§OB-BOOKS accounts=' + Object.keys(books).length + ' plain=' + srcCodes.length + ' differing=' + offPlain.length + ' control=' + J(control) + ' AR_control=' + money(ctl.AR || 0) + ' AP_control=' + money(ctl.AP || 0) +
    ' clearing=' + J(clearing.map(function (a) { return a + '=' + money(books[a] || 0); })) + ' sum=' + money(total));
  check('TB', 'per-account', 'every source account that is not receivable / payable / bank has the same balance in the tenant\'s books (' + srcCodes.length + ' accounts)', srcCodes.length > 0 && offPlain.length === 0, offPlain.map(function (a) { return a + ' books ' + money(books[a] || 0) + ' source ' + money(SRC.plain[a]); }));
  check('TB', 'receivable', 'the source receivable total ' + money(SRC.cls.AR) + ' sits on the tenant\'s receivable control account(s) ' + J(Object.keys(ctl.AR_accounts || {})), SRC.cls.AR !== 0 && (ctl.AR || 0) === SRC.cls.AR, ctl);
  check('TB', 'payable', 'the source payable total ' + money(SRC.cls.AP) + ' sits on the tenant\'s payable control account(s) ' + J(Object.keys(ctl.AP_accounts || {})), SRC.cls.AP !== 0 && (ctl.AP || 0) === SRC.cls.AP, ctl);
  check('TB', 'nothing-else', 'no account other than the source\'s, the control accounts, the clearing accounts and the tenant\'s bank asset account (' + bankAsset + ', where the opening bank statement posts — §E3D-SPEC, was: none) was posted to; the books sum to zero', control.every(function (a) { return (ctl.AR_accounts || {})[a] || (ctl.AP_accounts || {})[a] || a === bankAsset; }) && total === 0, { control: control, total: total });
  check('TB', 'bank-moved', 'RESTATED (was bank-open: the bank total waited on ' + CLR.BANK + ', state OPEN): the bank total ' + money(SRC.cls.BANK) + ' sits on the tenant\'s bank asset account ' + bankAsset + ' and ' + CLR.BANK + ' is back at 0.00', SRC.cls.BANK !== 0 && books[bankAsset] === SRC.cls.BANK && books[CLR.BANK] === 0, { asset: books[bankAsset], clearing: books[CLR.BANK] });
  verdict('TB');
  check('CLEAR', 'AR', 'AR Clearing (' + CLR.AR + ') == 0.00 after the journal and every open customer document (it was posted to: ' + (CLR.AR in books) + ')', (CLR.AR in books) && books[CLR.AR] === 0, books[CLR.AR]);
  check('CLEAR', 'AP', 'AP Clearing (' + CLR.AP + ') == 0.00 after the journal and every open vendor document', (CLR.AP in books) && books[CLR.AP] === 0, books[CLR.AP]);
  verdict('CLEAR');

  // ═══ OPEN ═══
  var SG = { ARI: 1, ARC: -1, API: -1, APC: 1 }, got = {}; invs.forEach(function (i) { var kk = (i.b[1] === 'R' ? 'AR' : 'AP') + '|' + i.bp; got[kk] = (got[kk] || 0) + cents(i.total) * SG[i.b]; });
  var ps = Array.from(new Set(Object.keys(SRCOPEN).concat(Object.keys(got)))).sort(), offP = ps.filter(function (p) { return (SRCOPEN[p] || 0) !== (got[p] || 0); });
  say('§OB-OPEN ' + J(ps.map(function (p) { return p + ' source=' + money(SRCOPEN[p] || 0) + ' tenant=' + money(got[p] || 0); })));
  check('OPEN', 'per-partner', 'per partner and side the tenant\'s open amount == the source\'s open lines (' + ps.length + ' partner/side pairs)', ps.length > 0 && offP.length === 0, offP);
  var offD = invs.filter(function (i) { var d = SRCDOC[i.no]; return !d || d.base !== i.b || d.bp !== i.bp || d.date !== i.d || d.amt !== cents(i.total) || i.da !== CUT || i.nl !== 1 || i.nc !== 1 || cents(i.tax) !== 0 || cents(i.net) !== cents(i.total); });
  check('OPEN', 'per-document', 'each document keeps its Odoo number, kind (ARI / ARC / API / APC), partner and own date; DateAcct = the cut-over; ONE charge line, no product, no tax; total = the unpaid amount', invs.length > 0 && offD.length === 0, offD.slice(0, 3));
  verdict('OPEN');

  // ═══ BANK (§E3D-SPEC): ORACLE = the raw rows (tb, account.account, account.journal, res.partner.bank, res.bank) ═══
  var jr0 = EXP.sets['account.journal'], pbk = {}, bnk = {}, tbc = {}; (EXP.sets['res.partner.bank'] || []).forEach(function (b) { pbk[b.id] = b; }); (EXP.sets['res.bank'] || []).forEach(function (b) { bnk[b.id] = b; });
  EXP.sets.tb.forEach(function (r) { tbc[r.account_id] = (tbc[r.account_id] || 0) + cents(r.balance); });
  var seenAcc = {}, WANT = {}, WACC = [], bankNames = {};
  jr0.forEach(function (j) { var pb = pbk[j.bank_account_id], no = (pb && pb.acc_number) || j.code, bkid = j.bank_id || (pb && pb.bank_id), bkn = (bkid && bnk[bkid] ? bnk[bkid].name : EXP.manifest.company_name);
    bankNames[bkn] = 1; WACC.push({ no: no, name: j.name, bank: bkn, type: j.type === 'cash' ? 'B' : 'C', cur: j.currency_id__name || EXP.manifest.currency });
    var amt = tbc[j.default_account_id] || 0;
    if (acct[j.default_account_id].account_type === 'asset_cash' && amt !== 0 && !seenAcc[j.default_account_id]) { WANT[no] = amt; } seenAcc[j.default_account_id] = 1; });
  var LEFTB = EXP.sets.tb.reduce(function (n, r) { return n + (acct[r.account_id].account_type === 'asset_cash' && !jr0.some(function (j) { return j.default_account_id === r.account_id; }) ? cents(r.balance) : 0); }, 0);
  var bAcc = q('SELECT ba.accountno AS no, ba.name AS name, b.name AS bank, ba.bankaccounttype AS t, cu.iso_code AS iso, ba.currentbalance AS cb, ba.c_bankaccount_id AS id FROM c_bankaccount ba JOIN c_bank b ON b.c_bank_id=ba.c_bank_id JOIN c_currency cu ON cu.c_currency_id=ba.c_currency_id WHERE ba.ad_client_id=? ORDER BY ba.accountno', [C]);
  var bStm = q('SELECT s.c_bankstatement_id AS id, s.docstatus AS s, s.posted AS p, ba.accountno AS no, s.statementdifference AS diff, s.c_doctype_id AS dt FROM c_bankstatement s JOIN c_bankaccount ba ON ba.c_bankaccount_id=s.c_bankaccount_id WHERE s.ad_client_id=?', [C]);
  var bPost = {}; bStm.forEach(function (st) { q('SELECT ev.value AS v, f.amtacctdr AS dr, f.amtacctcr AS cr FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_table_id=392 AND f.record_id=?', [st.id]).forEach(function (f) { if (f.v === bankAsset) bPost[st.no] = (bPost[st.no] || 0) + cents(f.dr) - cents(f.cr); }); });
  var bLines = q('SELECT count(*) AS n, SUM(l.stmtamt) AS a FROM c_bankstatementline l JOIN c_bankstatement s ON s.c_bankstatement_id=l.c_bankstatement_id WHERE s.ad_client_id=? AND l.c_charge_id IS NOT NULL AND l.c_payment_id IS NULL', [C])[0];
  var wantNos = Object.keys(WANT).sort();
  say('§OB-BANK source journals=' + jr0.length + ' accounts=' + J(WACC.map(function (a) { return a.no + '@' + a.bank; })) + ' statements_expected=' + J(wantNos.map(function (n) { return n + '=' + money(WANT[n]); })) + ' left_on_clearing=' + money(LEFTB) + ' tenant_bank_asset=' + bankAsset + ' tenant_accounts=' + J(bAcc.map(function (a) { return a.no + '=' + money(cents(a.cb)); })) + ' posted=' + J(bPost));
  check('BANK', 'masters', 'a bank account exists per bank / cash journal (' + WACC.length + ') under the bank the journal names (else one named after the company), AccountNo = the Odoo account number else the journal code, its own currency, type Checking / Cash by the journal\'s type', J(bAcc.map(function (a) { return [a.no, a.name, a.bank, a.t, a.iso]; })) === J(WACC.slice().sort(function (x, y) { return x.no < y.no ? -1 : x.no > y.no ? 1 : 0; }).map(function (a) { return [a.no, a.name, a.bank, a.type, a.cur]; })) && q('SELECT count(*) AS n FROM c_bank WHERE ad_client_id=? AND isownbank=\'Y\'', [C])[0].n === Object.keys(bankNames).length, { bAcc: bAcc, want: WACC });
  check('BANK', 'statements', 'ONE statement per bank account that had a balance (' + wantNos.length + '), Completed and Posted, with ONE charge line (no payment) = the source balance', wantNos.length > 0 && bStm.length === wantNos.length && bStm.every(function (x) { return x.s === 'CO' && x.p === 'Y' && !!x.dt; }) && bLines.n === wantNos.length && cents(bLines.a) === wantNos.reduce(function (n, x) { return n + WANT[x]; }, 0), { bStm: bStm, bLines: bLines });
  check('BANK', 'clearing', CLR.BANK + ' == ' + money(LEFTB) + ' (the cash accounts that had no bank / cash journal; 0.00 when every one had) — was 12444.87, state OPEN before §E3D', (CLR.BANK in books) && books[CLR.BANK] === LEFTB, books[CLR.BANK]);
  check('BANK', 'asset-per-account', 'the tenant\'s bank asset account ' + bankAsset + ' carries, per bank account, the source bank balance (' + J(wantNos.map(function (n) { return n + '=' + money(WANT[n]); })) + ') and the bank account\'s CurrentBalance is the same', wantNos.length > 0 && wantNos.every(function (n) { var a = bAcc.filter(function (x) { return x.no === n; })[0]; return bPost[n] === WANT[n] && a && cents(a.cb) === WANT[n]; }) && Object.keys(bPost).length === wantNos.length, { bPost: bPost, bAcc: bAcc });
  var bsh = SHIPPED.slice(mark).filter(function (l) { return /^§MIG-(CLEAR BANK|BANK |VERIFY)/.test(l); }), bv = bsh.filter(function (l) { return /^§MIG-VERIFY/.test(l); }).pop() || '';
  say('  shipped> ' + bsh.join('\n  shipped> '));
  check('BANK', 'shipped-lines', 'the loader\'s own lines: §MIG-CLEAR BANK balance=' + money(LEFTB) + ' verdict=PASS (a judged line, no longer state=OPEN), §MIG-BANK verdict=PASS, §MIG-VERIFY verdict=PASS with the two new judged lines (judged=9)', bsh.some(function (l) { return l.indexOf('§MIG-CLEAR BANK') === 0 && l.indexOf('balance=' + money(LEFTB)) > 0 && /verdict=PASS$/.test(l) && !/state=OPEN/.test(l); }) && bsh.some(function (l) { return /^§MIG-BANK statements=\d+\/\d+ .* verdict=PASS$/.test(l); }) && /verdict=PASS judged=9 /.test(bv), bsh);
  // falsifier: a SECOND trial-balance row of 100.00 on the bank account, balanced against the income account, that only the journal takes (the statement reads the first row)
  var T5 = birth('Bank Falsify Co'), C5 = T5.clientId, s5 = session(T5, '2026-11-11'), EXP5 = JSON.parse(JSON.stringify(EXP)), bj = jr0.filter(function (j) { return WANT[(pbk[j.bank_account_id] && pbk[j.bank_account_id].acc_number) || j.code] != null; })[0];
  var tb1 = EXP5.sets.tb.filter(function (r) { return r.account_id === bj.default_account_id; })[0], tb2 = EXP5.sets.tb.filter(function (r) { return acct[r.account_id].account_type === 'income'; })[0];
  EXP5.sets.tb.push(Object.assign({}, tb1, { balance: 100, debit: 100, credit: 0, __count: 1 })); EXP5.sets.tb.push(Object.assign({}, tb2, { balance: -100, debit: 0, credit: 100, __count: 1 }));
  var b1 = s5.rows(files(EXP5), null), bcur = answer(b1), br = s5.execute(files(EXP5), bcur), mark5 = SHIPPED.length, ba5 = br.ok ? s5.after(files(EXP5), bcur) : { ok: false, msg: 'stage 1 refused: ' + br.msg };
  say('§OB-BANK-FALSIFY extra_row=100.00 on ' + tb1.account_id__name + ' stage1=' + br.ok + ' stage2=' + ba5.ok + ' msg=' + String(ba5.msg).slice(0, 300));
  SHIPPED.slice(mark5).filter(function (l) { return /^§MIG-(CLEAR BANK|VERIFY)/.test(l); }).forEach(function (l) { say('  shipped> ' + l.slice(0, 300)); });
  check('BANK', 'falsifier', 'with a bank trial-balance row the statement does not take (100.00), stage 2 is refused and names the 100.00 left on Bank Clearing; nothing stays posted', br.ok && !ba5.ok && /BANK clearing/.test(String(ba5.msg)) && String(ba5.msg).indexOf('is 100.00, expected 0.00') >= 0 && n(C5, 'gl_journal') === 0 && n(C5, 'c_bankstatement') === 0 && n(C5, 'fact_acct') === 0, ba5.msg);
  verdict('BANK');

  // ═══ RERUN ═══
  var C1 = snap(C), res2 = ses.execute(files(), cur);
  // 2026-11-10 migrate-recover (F3): legacy never creates a record twice (unique <table>_uu_idx) and Import* act only on I_IsImported='N'; the repeat is "Nothing to do", not an "ambiguous" refusal (witness_migration_recover.js REPEAT).
  check('RERUN', 'nothing-to-do', 'a second Process of the same file loads nothing: it says "Nothing to do" and the counts do not change', res2.ok && /Nothing to do/.test(String(res2.msg)) && J(snap(C)) === J(C1), { ok: res2.ok, msg: String(res2.msg).slice(0, 200) });
  verdict('RERUN');

  // ═══ FALSIFY: a second tenant, one open line removed from the export ═══
  var T2 = birth('Falsify Co'), C2 = T2.clientId, s2 = session(T2, '2026-11-11'), EXP2 = JSON.parse(JSON.stringify(EXP));
  var gone = EXP2.sets.open_lines.filter(function (l) { return l.move_type === 'out_invoice'; }).pop(); EXP2.sets.open_lines = EXP2.sets.open_lines.filter(function (l) { return l !== gone; });
  var f1 = s2.rows(files(EXP2), null), fcur = answer(f1), fr = s2.execute(files(EXP2), fcur), mark2 = SHIPPED.length, fa = fr.ok ? s2.after(files(EXP2), fcur) : { ok: false, msg: 'stage 1 refused: ' + fr.msg };
  say('§OB-FALSIFY removed=' + gone.move_name + ' amount=' + money(cents(gone.amount_residual)) + ' stage1=' + fr.ok + ' stage2=' + fa.ok + ' msg=' + String(fa.msg).slice(0, 300));
  SHIPPED.slice(mark2).filter(function (l) { return /^§MIG-(CLEAR|VERIFY)/.test(l); }).forEach(function (l) { say('  shipped> ' + l.slice(0, 300)); });
  check('FALSIFY', 'named', 'with ' + gone.move_name + ' (' + money(cents(gone.amount_residual)) + ') missing from the export, stage 2 is refused and names exactly that amount left on AR Clearing', fr.ok && !fa.ok && String(fa.msg).indexOf(money(cents(gone.amount_residual))) >= 0 && /AR clearing/.test(String(fa.msg)), fa.msg);
  check('FALSIFY', 'rolled-back', 'the refused stage 2 left no journal, no invoice and no Fact_Acct in that tenant (the masters stay, as legacy)', n(C2, 'gl_journal') === 0 && n(C2, 'c_invoice') === 0 && n(C2, 'fact_acct') === 0 && n(C2, 'c_bpartner') > 1, snap(C2));
  verdict('FALSIFY');

  // ═══ PERIOD-OPEN: a third tenant, a login weeks after the cut-over; the periods opened the legacy way ═══
  var LATE = '2026-12-20', T3 = birth('Later Co'), C3 = T3.clientId, s3 = session(T3, LATE);
  var perOf = function (d) { return q("SELECT p.c_period_id AS id, p.name AS n FROM c_period p WHERE p.ad_client_id=? AND date(p.startdate)<=date(?) AND date(p.enddate)>=date(?)", [C3, d, d])[0]; }, perCut = perOf(CUT), perNow = perOf(LATE);
  var probs = function (rs) { return rs.filter(function (r) { return /^⚠ Open balances: the period/.test(r.item); }).map(function (r) { return r.item; }); };
  var before3 = probs(s3.rows(files(), null));
  var p167 = q('SELECT classname AS c, name AS n FROM ad_process WHERE ad_process_id=167')[0];
  try { require(path.join(ERP, 'processes', 'PeriodStatus.js')); } catch (e) { say('§OB-LOAD PeriodStatus.js not loadable: ' + e.message); }
  var open167 = function (per, untick) { return k.inTrx(T3, {}, function (trx) { if (untick) { var as = trx.find('c_acctschema', { ad_client_id: C3 })[0]; trx.update('c_acctschema', as, { autoperiodcontrol: 'N' }); }
    var r = AP.runJava(k.q, trx.env, { AD_Process_ID: 167, className: p167.c, title: p167.n, Record_ID: per.id, Table_ID: 142, params: { PeriodAction: 'O' }, trx: trx }); return { ok: !!r.ok, summary: String(r.summary || '') }; }); };
  var o1 = open167(perCut, true), mid3 = probs(s3.rows(files(), null)), o2 = open167(perNow, false);
  var ctl = q("SELECT periodstatus AS s, count(*) AS n FROM c_periodcontrol WHERE c_period_id IN (?,?) GROUP BY 1", [perCut.id, perNow.id]);
  say('§OB-PERIOD-OPEN client=' + C3 + ' login=' + LATE + ' periods=' + perCut.n + ',' + perNow.n + ' problems_before=' + before3.length + ' after_cutover_period_opened=' + J(mid3) + ' process167=' + J([o1.ok, o1.summary, o2.ok, o2.summary]) + ' controls=' + J(ctl));
  var g1 = s3.rows(files(), null), gcur = answer(g1), g2 = s3.rows(files(), gcur), gprob = g2.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item; });
  check('PERIOD-OPEN', 'refused-first', 'the login of ' + LATE + ' (Automatic Period Control on, cut-over ' + CUT + ' more than 2 days back) is refused with the period problem row', before3.length === 1 && before3[0].indexOf(CUT) > 0, before3);
  check('PERIOD-OPEN', 'batch-date', 'with only the cut-over period opened the summary still refuses: legacy dates the journal batch TODAY (MJournalBatch.beforeSave), so today\'s period must be open for GLJ too — named with today\'s date', o1.ok && mid3.length === 1 && mid3[0].indexOf(LATE) > 0 && /GLJ/.test(mid3[0]), { o1: o1, mid3: mid3 });
  check('PERIOD-OPEN', 'problem-gone', 'after Period Status (167) opened ' + perCut.n + ' and ' + perNow.n + ' (controls ' + J(ctl) + '), the summary has no problem row', o2.ok && gprob.length === 0 && ctl.length === 1 && ctl[0].s === 'O', { gprob: gprob, ctl: ctl });
  var mark3 = SHIPPED.length, g3 = s3.execute(files(), gcur), g4 = g3.ok ? s3.after(files(), gcur) : { ok: false, msg: 'stage 1 refused: ' + g3.msg }, ver3 = SHIPPED.slice(mark3).filter(function (l) { return /^§MIG-VERIFY/.test(l); }).pop() || '';
  if (!g4.ok) (g4.log || []).filter(function (l) { return /IMPORT_GLJ|PROC-|MODEL-(ERR|WARN|MSG)|PeriodClosed|Errors/.test(l); }).slice(-16).forEach(function (l) { say('  trxlog> ' + String(l).slice(0, 300)); });
  say('§OB-PERIOD-OPEN stage1=' + g3.ok + ' stage2=' + g4.ok + ' ' + ver3 + ' msg=' + String(g4.msg).slice(0, 200));
  check('PERIOD-OPEN', 'loads', 'the same files then load on that login: stage 2 completes and the loader\'s own §MIG-VERIFY says PASS', g3.ok && g4.ok && /verdict=PASS judged=[1-9]/.test(ver3) && n(C3, 'c_invoice') === Object.keys(SRCDOC).length, { g3: g3.msg, g4: g4.msg, ver3: ver3 });
  verdict('PERIOD-OPEN');

  // ═══ JSON-ONLY: the whole book from odoo_export.json through the engine ═══
  var T4 = birth('Json Co'), C4 = T4.clientId, s4 = session(T4, '2026-11-11'), only = function (exp) { return { Files: [{ name: 'odoo_export.json', size: 1, data: exp || EXP }] }; };
  var MT17 = man.sheets.map(function (x) { return x.table; }), cnt = function (Cx) { var o = {}; MT17.forEach(function (t) { o[t] = n(Cx, t.toLowerCase()); }); return o; };
  var factOf = function (Cx) { var o = {}; q('SELECT ev.value AS v, SUM(f.amtacctdr) AS dr, SUM(f.amtacctcr) AS cr FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_client_id=? GROUP BY ev.value ORDER BY ev.value', [Cx]).forEach(function (r) { o[r.v] = cents(r.dr) - cents(r.cr); }); return o; };
  var openOf = function (Cx) { var o = {}; q('SELECT bp.value AS bp, dt.docbasetype AS b, i.grandtotal AS t FROM c_invoice i JOIN c_bpartner bp ON bp.c_bpartner_id=i.c_bpartner_id JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id WHERE i.ad_client_id=?', [Cx]).forEach(function (r) { var kk = r.b + '|' + r.bp; o[kk] = (o[kk] || 0) + cents(r.t); }); return Object.keys(o).sort().map(function (kk) { return kk + '=' + o[kk]; }); };
  var shortExp = JSON.parse(JSON.stringify(EXP)); shortExp.sets['product.product'].pop();
  var jShort = s4.rows(only(shortExp), null).filter(function (r) { return /^⚠ odoo_export\.json is not complete/.test(r.item); }).map(function (r) { return r.item; });
  check('JSON-ONLY', 'short-file', 'a file whose product.product set holds one row less than Odoo counted is refused before anything runs, naming the set and both numbers', jShort.length === 1 && /product\.product \(Odoo counted \d+, the file holds \d+\)/.test(jShort[0]), jShort);
  var j1 = s4.rows(only(), null), jcur = answer(j1), j2 = s4.rows(only(), jcur), jprob = j2.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item; }), jsheets = j2.filter(function (r) { return r.key > 100 && r.key < 900; });
  check('JSON-ONLY', 'summary', 'with odoo_export.json alone the summary shows the 17 master sheets + the 5 optional sheets (2 open documents, C_Bank, C_BankAccount, I_BankStatement — was 2 before §E3D) and no problem row', jprob.length === 0 && jsheets.length === 22, { jprob: jprob, sheets: jsheets.map(function (x) { return x.item; }) });
  var mark4 = SHIPPED.length, j3 = s4.execute(only(), jcur), j4 = j3.ok ? s4.after(only(), jcur) : { ok: false, msg: 'stage 1 refused: ' + j3.msg }, ver4 = SHIPPED.slice(mark4).filter(function (l) { return /^§MIG-VERIFY/.test(l); }).pop() || '';
  say('§OB-JSON-ONLY client=' + C4 + ' stage1=' + j3.ok + ' stage2=' + j4.ok + ' ' + ver4 + ' msg=' + String(j3.ok ? j4.msg : j3.msg).slice(0, 260));
  check('JSON-ONLY', 'loads', 'Process + stage 2 complete and the loader\'s own §MIG-VERIFY says PASS', j3.ok && j4.ok && /verdict=PASS judged=[1-9]/.test(ver4), { j3: j3.msg, j4: j4.msg });
  var cA = cnt(C), cB = cnt(C4);
  // the engine path ALSO carries the stock value: ONE Cost Adjustment document (Import Inventory IsUpdateCosting, ImportInventory.java:524-572; W-MIGRATION-TRADE COST) with a line per stock row - subtracted, and said, so every other count is still exact
  var caDocs = q("SELECT count(*) AS n FROM m_inventory i JOIN c_doctype d ON d.c_doctype_id=i.c_doctype_id WHERE i.ad_client_id=? AND d.docsubtypeinv='CA'", [C4])[0].n, caLines = q("SELECT count(*) AS n FROM m_inventoryline l JOIN m_inventory i ON i.m_inventory_id=l.m_inventory_id JOIN c_doctype d ON d.c_doctype_id=i.c_doctype_id WHERE l.ad_client_id=? AND d.docsubtypeinv='CA'", [C4])[0].n;
  say('§OB-JSON-ONLY engine path Cost Adjustment documents=' + caDocs + ' lines=' + caLines + ' (not in the workbook path: the older workbook carries no unit cost)');
  cB = Object.assign({}, cB, { M_Inventory: cB.M_Inventory - caDocs, M_InventoryLine: cB.M_InventoryLine - caLines });
  var offT = MT17.filter(function (t) { return cA[t] !== cB[t]; });
  say('§OB-JSON-ONLY tables workbook_path=' + J(cA) + ' engine_path=' + J(cB));
  check('JSON-ONLY', 'same-masters', 'X of N: each of the 17 master tables has the same row count in the tenant loaded from odoo_export.json alone as in the tenant loaded from the agent\'s workbook (X=' + (MT17.length - offT.length) + ' of N=' + MT17.length + ')', MT17.length === 17 && offT.length === 0, offT.map(function (t) { return t + ' workbook ' + cA[t] + ' engine ' + cB[t]; }));
  check('JSON-ONLY', 'same-books', 'the books are the same account by account (' + Object.keys(factOf(C)).length + ' accounts) and the open amount per partner and document kind is the same', J(factOf(C)) === J(factOf(C4)) && Object.keys(factOf(C)).length > 0 && J(openOf(C)) === J(openOf(C4)) && openOf(C).length > 0, { a: factOf(C), b: factOf(C4) });
  verdict('JSON-ONLY');

  var v = ['PERIOD', 'SUMMARY', 'RUN', 'PREREQ', 'TB', 'CLEAR', 'OPEN', 'BANK', 'RERUN', 'FALSIFY', 'PERIOD-OPEN', 'JSON-ONLY'].map(function (c) { var x = CASES[c] || {}; return !x.judged ? 'INCONCLUSIVE' : x.failed ? 'FAIL' : 'PASS'; });
  var all = v.indexOf('FAIL') >= 0 ? 'FAIL' : v.indexOf('INCONCLUSIVE') >= 0 ? 'INCONCLUSIVE' : 'PASS';
  say('§OB-VERDICT ' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(v));
  process.exit(all === 'PASS' ? 0 : all === 'INCONCLUSIVE' ? 3 : 1);
})().catch(function (e) { say('§OB-VERDICT FAIL threw ' + (e && e.stack || e)); process.exit(1); });
