#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IDEMPIERE-OPEN (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §IDEMPIERE-OPEN-SPEC). READ THE LOG after every run: every verdict is a §IDO line, the shipped loader's
//   own §MIG-* lines are printed with it, the exit code is not evidence. INCONCLUSIVE (never PASS) when nothing was judged or the legacy source is not reachable.
// THE ISSUE it proves/disproves: after the open-balances READER (erp/idempiere_agent/open_reader.js) reads a LEGACY iDempiere and the neutral loader (plugins/open_balances.mjs) loads its
//   sheets (migrate/templates/idempiere-open.json) into a born twin tenant, are the twin's books the legacy books at the cut-over: trial balance account by account, every clearing account
//   at exactly the amount the spec says is left on it (0.00 when nothing is), open AR/AP per partner, bank per bank account?
// SOURCE / ORACLE = the local legacy iDempiere postgres DB (docker `postgres`, db idempiere_test, client 11 GardenWorld; memory reference_idempiere_source). The ORACLE below is its own SQL
//   (text output, its own join paths, Doc_Invoice's posting rule for the control accounts) - never the reader, the template or the loader. The expected leftover on a clearing account is
//   derived from the source documents' own Fact_Acct lines (the foreign-currency invoice's converted amount), not from the template's `left`.
// CASES (each names what it proves): SOURCE (oracle is reachable and non-empty) · READER (TB/classes/open items/banks == oracle) · FROZEN (earlier cut-over -> source-not-frozen with the oracle's counts)
//   · SHEETS (the neutral sheets carry the oracle's numbers; the foreign invoice is a NAMED refusal) · LOAD (twin tenant: TB, CLEAR, OPEN, BANK from the twin's own tables) · MUTANT (a flipped amount,
//   a dropped open item, a dropped TB account must each FAIL the same comparators; the two that survive the loader's self-consistency are run through a real load).
// COVERAGE GAPS (printed as §IDO-COVERAGE, not hidden): the sample has no credit memo, no partly paid invoice, no foreign bank account, no cash book: those rules are specified, not witnessed here.
// Command: node erp/tests/witness_idempiere_open.js 2>&1 | tee /tmp/count_logs/idempiere_open.log
'use strict';
var fs = require('fs'), path = require('path'), url = require('url'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var _log = console.log, SHIPPED = []; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§(MIG-|E1-STOCK|IMPORT_|PROC-|IDO-READ)/.test(l)) SHIPPED.push(l); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §IDO-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1800))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§IDO-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var cents = function (v) { return Math.round(Number(v || 0) * 100); }, money = function (c) { return (c / 100).toFixed(2); };

// ── the ORACLE: its own psql call, text output (not the reader's JSON path) ──
var DB = process.env.IDEMPIERE_TEST_DB || 'idempiere_test', CLIENT = 11, CONT = process.env.IDEMPIERE_PG_CONTAINER || 'postgres';
function pg(sql) {
  var env = Object.assign({}, process.env, { PGPASSWORD: process.env.IDEMPIERE_PGPASSWORD || process.env.PGPASSWORD || 'adempiere' });   // local dev DB (memory reference_idempiere_source); an environment variable, never a flag
  var out = cp.execFileSync('docker', ['exec', '-e', 'PGPASSWORD', CONT, 'psql', '-X', '-q', '-At', '-F', '|', '-U', 'adempiere', '-d', DB, '-c', 'SET search_path TO adempiere; ' + sql], { env: env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return out.split('\n').filter(function (l) { return l && l !== 'SET'; }).map(function (l) { return l.split('|'); });
}
var SCH = "(SELECT c_acctschema1_id FROM ad_clientinfo WHERE ad_client_id=" + CLIENT + ')';

(async function main() {
  // ═══ SOURCE ═══
  var CUT = '2026-11-10', O = {};
  try {
    O.tb = {}; pg("SELECT ev.value, round(sum(f.amtacctdr)*100)::bigint - round(sum(f.amtacctcr)*100)::bigint FROM c_elementvalue ev JOIN fact_acct f ON f.account_id=ev.c_elementvalue_id WHERE f.ad_client_id=" + CLIENT + ' AND f.c_acctschema_id=' + SCH + " AND f.postingtype='A' AND f.dateacct::date <= '" + CUT + "' GROUP BY ev.value ORDER BY 1").forEach(function (r) { O.tb[r[0]] = Number(r[1]); });
  } catch (e) { say('§IDO-SOURCE unreachable: ' + String(e.message).split('\n')[0]); say('§IDO-VERDICT INCONCLUSIVE judged=0 failed=0 (the legacy iDempiere postgres is not reachable: docker container ' + CONT + ', db ' + DB + ')'); return; }
  // control accounts from Doc_Invoice's posting rule: the receivable/payable line is the invoice's largest Dr (ARI) / Cr (API) line
  O.cls = {}; pg("SELECT DISTINCT ev.value, dt.docbasetype FROM c_invoice i JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id JOIN fact_acct f ON f.ad_table_id=318 AND f.record_id=i.c_invoice_id AND f.c_acctschema_id=" + SCH + ' JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE i.ad_client_id=' + CLIENT +
    " AND ((dt.docbasetype='ARI' AND f.amtacctdr=(SELECT max(g.amtacctdr) FROM fact_acct g WHERE g.ad_table_id=318 AND g.record_id=i.c_invoice_id AND g.c_acctschema_id=f.c_acctschema_id)) OR (dt.docbasetype='API' AND f.amtacctcr=(SELECT max(g.amtacctcr) FROM fact_acct g WHERE g.ad_table_id=318 AND g.record_id=i.c_invoice_id AND g.c_acctschema_id=f.c_acctschema_id)))")
    .forEach(function (r) { O.cls[r[0]] = r[1] === 'ARI' ? 'AR' : 'AP'; });
  pg('SELECT DISTINCT ev.value FROM c_bankaccount_acct bc JOIN c_validcombination vc ON vc.c_validcombination_id=bc.b_asset_acct JOIN c_elementvalue ev ON ev.c_elementvalue_id=vc.account_id WHERE bc.ad_client_id=' + CLIENT + ' AND bc.c_acctschema_id=' + SCH).forEach(function (r) { O.cls[r[0]] = 'BANK'; });
  O.cur = pg('SELECT cu.iso_code FROM c_acctschema a JOIN c_currency cu ON cu.c_currency_id=a.c_currency_id WHERE a.c_acctschema_id=' + SCH)[0][0];
  // open invoices: grand total minus allocations (the arithmetic invoiceOpen documents), NOT the pg function; the foreign ones carry their converted control amount
  O.open = {}; pg("SELECT i.documentno, dt.docbasetype, bp.value, cu.iso_code, i.posted, round((i.grandtotal - COALESCE((SELECT sum(al.amount+al.discountamt+al.writeoffamt) FROM c_allocationline al JOIN c_allocationhdr h ON h.c_allocationhdr_id=al.c_allocationhdr_id WHERE al.c_invoice_id=i.c_invoice_id AND h.isactive='Y'),0))*100)::bigint, " +
    "to_char(i.dateinvoiced,'YYYY-MM-DD'), (SELECT COALESCE(CASE WHEN dt.docbasetype='ARI' THEN round(max(g.amtacctdr)*100) ELSE -round(max(g.amtacctcr)*100) END,0)::bigint FROM fact_acct g WHERE g.ad_table_id=318 AND g.record_id=i.c_invoice_id AND g.c_acctschema_id=" + SCH + ') ' +
    'FROM c_invoice i JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id JOIN c_bpartner bp ON bp.c_bpartner_id=i.c_bpartner_id JOIN c_currency cu ON cu.c_currency_id=i.c_currency_id WHERE i.ad_client_id=' + CLIENT + " AND i.docstatus IN ('CO','CL') AND i.ispaid='N' ORDER BY 1")
    .forEach(function (r) { O.open[r[0]] = { base: r[1], bp: r[2], iso: r[3], posted: r[4], amt: Number(r[5]), date: r[6], ctl: Number(r[7]) }; });
  O.bank = {}; pg("SELECT accountno, round(currentbalance*100)::bigint, c_currency_id FROM c_bankaccount WHERE ad_client_id=" + CLIENT + " AND isactive='Y' ORDER BY 1").forEach(function (r) { O.bank[r[0]] = Number(r[1]); });
  O.after = pg("SELECT (SELECT count(*) FROM fact_acct WHERE ad_client_id=" + CLIENT + ' AND c_acctschema_id=' + SCH + " AND postingtype='A' AND dateacct::date > '2003-01-01'), (SELECT count(*) FROM c_invoice WHERE ad_client_id=" + CLIENT + " AND docstatus IN ('CO','CL') AND dateacct::date > '2003-01-01'), (SELECT count(*) FROM c_allocationhdr WHERE ad_client_id=" + CLIENT + " AND docstatus IN ('CO','CL') AND dateacct::date > '2003-01-01')")[0].map(Number);
  O.partial = pg("SELECT count(*) FROM c_invoice i WHERE ad_client_id=" + CLIENT + " AND ispaid='N' AND EXISTS (SELECT 1 FROM c_allocationline al WHERE al.c_invoice_id=i.c_invoice_id)")[0][0];
  O.cm = pg("SELECT count(*) FROM c_invoice i JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id WHERE i.ad_client_id=" + CLIENT + " AND dt.docbasetype IN ('ARC','APC')")[0][0];
  var clsTotal = { AR: 0, AP: 0, BANK: 0 }; Object.keys(O.tb).forEach(function (a) { if (O.cls[a]) clsTotal[O.cls[a]] += O.tb[a]; });
  var brought = function (d) { return d.iso === O.cur && d.posted === 'Y' && d.amt > 0; };
  var effAR = 0, effAP = 0, leftFgn = { AR: 0, AP: 0 };
  Object.keys(O.open).forEach(function (no) { var d = O.open[no], side = d.base === 'ARI' ? 'AR' : 'AP'; if (brought(d)) { if (side === 'AR') effAR += d.amt; else effAP -= d.amt; } else leftFgn[side] += d.ctl; });
  var glBank = clsTotal.BANK, stmt = Object.keys(O.bank).reduce(function (n, k) { return n + O.bank[k]; }, 0);
  var WANT_LEFT = { AR: leftFgn.AR, AP: leftFgn.AP, BANK: glBank - stmt };   // derived from the SOURCE documents' own postings, independent of the template
  say('§IDO-SOURCE db=' + DB + ' client=' + CLIENT + ' cutover=' + CUT + ' currency=' + O.cur + ' tb_accounts=' + Object.keys(O.tb).length + ' tb_sum=' + money(Object.keys(O.tb).reduce(function (n, a) { return n + O.tb[a]; }, 0)) + ' AR=' + money(clsTotal.AR) + ' AP=' + money(clsTotal.AP) + ' BANK=' + money(clsTotal.BANK) +
    ' open_docs=' + Object.keys(O.open).length + ' brought=' + Object.keys(O.open).filter(function (n) { return brought(O.open[n]); }).length + ' expected_left=' + J({ AR: money(WANT_LEFT.AR), AP: money(WANT_LEFT.AP), BANK: money(WANT_LEFT.BANK) }));
  say('§IDO-COVERAGE credit_memos=' + O.cm + ' partly_paid_open=' + O.partial + ' foreign_invoices=' + Object.keys(O.open).filter(function (n) { return O.open[n].iso !== O.cur; }).length + ' (rules for the absent cases are specified in §IDEMPIERE-OPEN-SPEC, not witnessed by this sample)');
  check('SOURCE', 'reachable', 'the legacy DB answers: a non-empty trial balance, open invoices, bank accounts, and the sample\'s foreign invoice so the leftover rule is exercised', Object.keys(O.tb).length > 0 && Object.keys(O.open).length > 0 && Object.keys(O.bank).length > 0 && WANT_LEFT.AR !== 0, { tb: Object.keys(O.tb).length, open: Object.keys(O.open).length, left: WANT_LEFT });
  check('SOURCE', 'tb-balances', 'the oracle trial balance sums to zero (a balanced ledger; else nothing below means anything)', Object.keys(O.tb).reduce(function (n, a) { return n + O.tb[a]; }, 0) === 0, null);
  check('SOURCE', 'classes', 'the control accounts the legacy posting rule (Doc_Invoice) shows are AR/AP accounts of the TB: at least one AR and one AP', Object.keys(O.cls).some(function (a) { return O.cls[a] === 'AR'; }) && Object.keys(O.cls).some(function (a) { return O.cls[a] === 'AP'; }), O.cls);
  verdict('SOURCE');

  // ═══ READER ═══
  var OR = require(path.join(ERP, 'idempiere_agent', 'open_reader.js'));
  process.env.PGPASSWORD = process.env.PGPASSWORD || process.env.IDEMPIERE_PGPASSWORD || 'adempiere';
  var run = OR.makeRunner({ db: DB, container: CONT }), EXP = OR.readOpen(run, { client: CLIENT, cutover: CUT, db: DB, say: function (l) { SHIPPED.push(l); } });
  SHIPPED.filter(function (l) { return /^§IDO-READ/.test(l); }).forEach(function (l) { say('  shipped> ' + l.slice(0, 400)); });
  function cmpTB(sets) { var got = {}; sets.tb.forEach(function (r) { got[r.code] = cents(r.balance); }); var ks = Array.from(new Set(Object.keys(got).concat(Object.keys(O.tb)))).sort(); return ks.filter(function (a) { return (got[a] || 0) !== (O.tb[a] || 0); }).map(function (a) { return a + ' reader ' + money(got[a] || 0) + ' oracle ' + money(O.tb[a] || 0); }); }
  function cmpClass(sets) { return sets.tb.filter(function (r) { return (r.class || '') !== (O.cls[r.code] || ''); }).map(function (r) { return r.code + ' reader ' + r.class + ' oracle ' + (O.cls[r.code] || ''); }); }
  function cmpOpen(sets) { var got = {}; sets.open_items.forEach(function (r) { got[r.documentno] = r; }); var ks = Array.from(new Set(Object.keys(got).concat(Object.keys(O.open)))).sort();
    return ks.filter(function (n) { var g = got[n], o = O.open[n]; return !g || !o || Math.abs(cents(g.open_amount)) !== Math.abs(o.amt) || g.base !== o.base || g.bp_value !== o.bp || g.iso !== o.iso || g.dateinvoiced !== o.date; }).map(function (n) { return n + ' reader ' + (got[n] ? money(cents(got[n].open_amount)) : 'absent') + ' oracle ' + (O.open[n] ? money(O.open[n].amt) : 'absent'); }); }
  function cmpBank(sets) { var got = {}; sets.banks.forEach(function (r) { got[r.accountno] = cents(r.currentbalance); }); var ks = Array.from(new Set(Object.keys(got).concat(Object.keys(O.bank)))).sort(); return ks.filter(function (a) { return got[a] !== O.bank[a]; }).map(function (a) { return a + ' reader ' + money(got[a] || 0) + ' oracle ' + money(O.bank[a] || 0); }); }
  check('READER', 'tb', 'the reader\'s trial balance == the oracle account by account (' + Object.keys(O.tb).length + ' accounts, posted, DateAcct <= ' + CUT + ', primary schema), and sums to zero', cmpTB(EXP.sets).length === 0 && EXP.sets.tb.reduce(function (n, r) { return n + cents(r.balance); }, 0) === 0, cmpTB(EXP.sets));
  check('READER', 'classes', 'each account is classed AR / AP / BANK / plain as the oracle (posting rule + bank-account asset accounts) says', cmpClass(EXP.sets).length === 0, cmpClass(EXP.sets));
  check('READER', 'open-items', 'the reader\'s open items == the oracle\'s per document: number, kind, partner, currency, date and |open amount| (' + Object.keys(O.open).length + ' documents)', cmpOpen(EXP.sets).length === 0, cmpOpen(EXP.sets));
  check('READER', 'banks', 'the reader\'s bank accounts == the oracle\'s CurrentBalance per account (' + Object.keys(O.bank).length + ')', cmpBank(EXP.sets).length === 0, cmpBank(EXP.sets));
  check('READER', 'other-schema', 'the second accounting schema is NAMED, not moved (P6)', EXP.manifest.other_schemas.length === 1 && EXP.manifest.other_schemas[0].id === 200000 && EXP.manifest.other_schemas[0].fact_rows > 0, EXP.manifest.other_schemas);
  check('READER', 'no-problem', 'a cut-over after the last posting raises no problem and counts nothing after it', EXP.manifest.problems.length === 0 && J(EXP.manifest.after_cutover) === J({ fact_acct: 0, invoices: 0, allocations: 0 }), EXP.manifest);
  var src = fs.readFileSync(path.join(ERP, 'idempiere_agent', 'open_reader.js'), 'utf8');
  check('READER', 'read-only', 'the reader sends only SELECTs inside a read-only session and takes no password flag: default_transaction_read_only=on, no INSERT/UPDATE/DELETE/DROP/ALTER statement text, --password refused', /default_transaction_read_only=on/.test(src) && !/['"`]\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(src.replace(/\/\/.*$/gm, '')) &&
    cp.spawnSync('node', [path.join(ERP, 'idempiere_agent', 'open_reader.js'), '--password', 'x', '--cutover', CUT]).status === 2, null);
  // read-only is also enforced by the server: a write in the same kind of session must be refused
  var wr = ''; try { cp.execFileSync('docker', ['exec', '-e', 'PGPASSWORD', '-e', 'PGOPTIONS', CONT, 'psql', '-X', '-q', '-At', '-U', 'adempiere', '-d', DB, '-c', 'CREATE TEMP TABLE ido_probe(x int)'], { env: Object.assign({}, process.env, { PGOPTIONS: '-c default_transaction_read_only=on' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); wr = 'WRITE-ALLOWED'; } catch (e) { wr = String(e.stderr || e.message); }
  check('READER', 'server-refuses-write', 'the read-only session the reader opens makes the server REFUSE a write (not only the reader\'s promise)', /read-only transaction/i.test(wr), wr.slice(0, 200));
  verdict('READER');

  // ═══ FROZEN ═══
  var EARLY = OR.readOpen(run, { client: CLIENT, cutover: '2003-01-01', db: DB, say: function (l) { SHIPPED.push(l); } });
  var pr = EARLY.manifest.problems.filter(function (p) { return /^source-not-frozen/.test(p); });
  check('FROZEN', 'counts', 'a cut-over (2003-01-01) before later postings raises source-not-frozen naming the oracle\'s counts: fact_acct ' + O.after[0] + ', invoices ' + O.after[1] + ', allocations ' + O.after[2], pr.length === 1 && J(EARLY.manifest.after_cutover) === J({ fact_acct: O.after[0], invoices: O.after[1], allocations: O.after[2] }) && pr[0].indexOf('fact_acct ' + O.after[0]) > 0 && O.after[0] > 0, { pr: pr, got: EARLY.manifest.after_cutover, oracle: O.after });
  verdict('FROZEN');

  // ═══ SHEETS ═══
  var IC = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'idempiere_open_convert.mjs')).href), OB = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'open_balances.mjs')).href);
  var CV = IC.convert(EXP), VARS = IC.TEMPLATE.variables, sheet = function (cv, t) { var b = cv.book.filter(function (x) { return x.name.replace(/^\d\d/, '') === t; })[0]; if (!b) return []; var H = b.rows[0]; return b.rows.slice(1).map(function (r) { var o = {}; H.forEach(function (h, i) { o[h] = r[i]; }); return o; }); };
  var gl = sheet(CV, 'I_GLJournal'), inv = sheet(CV, 'I_Invoice'), stm = sheet(CV, 'I_BankStatement'), glDr = gl.reduce(function (n, r) { return n + cents(r.AmtSourceDr); }, 0), glCr = gl.reduce(function (n, r) { return n + cents(r.AmtSourceCr); }, 0);
  var CLR = { AR: VARS.AR_CLEARING, AP: VARS.AP_CLEARING, BANK: VARS.BANK_CLEARING }, glBy = {}; gl.forEach(function (r) { glBy[r.AccountValue] = (glBy[r.AccountValue] || 0) + cents(r.AmtSourceDr) - cents(r.AmtSourceCr); });
  var plain = Object.keys(O.tb).filter(function (a) { return !O.cls[a] && O.tb[a] !== 0; });
  check('SHEETS', 'journal-balanced', 'the opening journal balances (Dr == Cr) at ' + money(glDr), gl.length > 0 && glDr === glCr, { dr: glDr, cr: glCr });
  check('SHEETS', 'journal-plain', 'every plain account is a journal line under its OWN value with the oracle balance (' + plain.length + ' accounts; unallocated receipts, inventory, tax, P&L are carried: P2/P9/P11)', plain.every(function (a) { return glBy[a] === O.tb[a]; }), plain.filter(function (a) { return glBy[a] !== O.tb[a]; }));
  check('SHEETS', 'journal-clearing', 'every AR / AP / BANK control account is routed to its ONE clearing account: the clearing line == the oracle class total (AR ' + money(clsTotal.AR) + ', AP ' + money(clsTotal.AP) + ', BANK ' + money(clsTotal.BANK) + ') and no control account value appears in the journal (P1)',
    glBy[CLR.AR] === clsTotal.AR && glBy[CLR.AP] === clsTotal.AP && glBy[CLR.BANK] === clsTotal.BANK && Object.keys(O.cls).every(function (a) { return !(a in glBy) || plain.indexOf(a) >= 0; }), { glBy: glBy });
  var broughtNos = Object.keys(O.open).filter(function (n) { return brought(O.open[n]); }).sort(), invNos = inv.map(function (r) { return r.DocumentNo; }).sort();
  check('SHEETS', 'invoices', 'the invoice sheet == the oracle\'s brought-in open documents (' + broughtNos.length + '): number, kind, partner, own date, ONE charge line at the open amount, no tax', J(invNos) === J(broughtNos) && inv.every(function (r) { var o = O.open[r.DocumentNo]; return r.PriceActual !== '' && cents(r.PriceActual) === Math.abs(o.amt) && r.QtyOrdered === '1' && r.BPartnerValue === o.bp && r.DateInvoiced === o.date && r.TaxIndicator === VARS.TAX_NONE && r.DocTypeName === { ARI: 'AR Invoice', API: 'AP Invoice', ARC: 'AR Credit Memo', APC: 'AP CreditMemo' }[o.base]; }), { invNos: invNos, brought: broughtNos });
  var fgn = Object.keys(O.open).filter(function (n) { return O.open[n].iso !== O.cur; }), rf = CV.manifest.refused.filter(function (x) { return x.sheet === 'I_Invoice'; });
  check('SHEETS', 'foreign-refused', 'the foreign-currency invoice(s) ' + J(fgn) + ' are a NAMED refusal (P3), not silently dropped: ' + fgn.length + ' refused with a reason that says the amount stays on the clearing account', rf.length === 1 && rf[0].n === fgn.length && /foreign currency/.test(rf[0].why) && /clearing/.test(rf[0].why), rf);
  check('SHEETS', 'left', 'manifest.left == the amount the SOURCE documents say stays on each clearing account (AR ' + money(WANT_LEFT.AR) + ' = the foreign invoice\'s converted control amount, AP ' + money(WANT_LEFT.AP) + ', BANK ' + money(WANT_LEFT.BANK) + '); that is the template\'s arithmetic matching the postings\' arithmetic',
    cents(CV.manifest.left.AR) === WANT_LEFT.AR && cents(CV.manifest.left.AP) === WANT_LEFT.AP && cents(CV.manifest.left.BANK) === WANT_LEFT.BANK, { got: CV.manifest.left, want: WANT_LEFT });
  var stmNos = Object.keys(O.bank).filter(function (a) { return O.bank[a] !== 0; }).sort();
  check('SHEETS', 'statements', 'one opening bank statement per bank account with a CurrentBalance (' + J(stmNos) + '), amount == the oracle', J(stm.map(function (r) { return r.BankAccountNo; }).sort()) === J(stmNos) && stm.every(function (r) { return cents(r.StmtAmt) === O.bank[r.BankAccountNo]; }), stm);
  check('SHEETS', 'sources-untouched', 'the Odoo / SAP / BC templates are byte-identical to origin/main (this lane adds a source; it changes no other)', cp.spawnSync('git', ['-C', ERP, 'diff', '--quiet', 'origin/main', '--', 'migrate/templates/odoo-17.json', 'migrate/templates/sap-b1-10.json', 'migrate/templates/bc-w1.json', 'migrate/engine.mjs', 'migrate/workbook.mjs']).status === 0, null);   // open_balances.mjs left out 2026-11-10: migrate-recover changes it on purpose (witness_migration_recover.js)
  verdict('SHEETS');

  // ═══ the twin (born tenants, the neutral loader) ═══
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  ['ImportInventory.js', 'ImportGLJournal.js', 'ImportInvoice.js', 'ImportBankStatement.js'].forEach(function (f) { try { require(path.join(ERP, 'processes', f)); } catch (e) { say('§IDO-LOAD ' + f + ' not loadable: ' + e.message); } });
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); }, run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  function birth(name) {
    var born = G.birthTenant({ clientName: name, currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: name.replace(/\W/g, '') + 'Admin', dateAcct: '2026-11-10', countryId: 100 });
    var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
    G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-10 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
    var R = rb.refs; return { clientId: R.clientId, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:idempiere-open' };
  }
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF, import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host);
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate.mjs')).href)); await reg.startBundle('org.kernel.odoo.migrate');   // binds the process engine the shared loader runs through
  var FORM = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate_form.mjs')).href); FORM.bindProcess(AP);
  // a test-side form over the SAME shared pieces the shipped forms use (convert -> OB.openOf/problems -> FORM.load -> OB.complete): no mapping, no verifier of its own
  var CLS = 'org.test.IdempiereOpen', PLAN = function (trx, params) { var cv = IC.convert(params.Files[0].data), open = OB.openOf(cv.book, cv.manifest); return { cv: cv, open: open, problems: cv.manifest.problems.concat(OB.problems(trx, open)) }; };
  AF.register(CLS, { title: 'Test: migrate open balances of a legacy iDempiere', params: [{ name: 'Files', label: 'idempiere_open.json', type: 'file', multiple: true, mandatory: true }], columns: [{ key: 'item', label: 'Item' }],
    rows: function () { return []; },
    run: function (trx, params) { var p = PLAN(trx, params); if (p.problems.length) throw new Error('Not migrated: ' + p.problems.join(' ')); var r = FORM.load(trx, p.cv.book, p.open); if (!r.ok) throw new Error(String(r.summary || 'The load was refused.') + ' ' + J(r.refusals).slice(0, 400)); return 'loaded ' + J(r.perTable); },
    after: function (trx, params) { var p = PLAN(trx, params); return OB.complete(trx, AP, p.open); } });
  function session(S, loginDate) {
    var withT = function (fn) { return fn(k.q, Object.assign(k.env(S), { date: loginDate + ' 00:00:00' })); };
    return { execute: function (params) { var r = AF.execute(withT, CLS, params, []); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'idempiere_open' }); return r; },
      after: function (params) { var r = AF.executeAfter(withT, CLS, params, []); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'idempiere_open' }); return r; } };
  }
  function n(C, t) { return q('SELECT count(*) AS n FROM ' + t + ' WHERE ad_client_id=?', [C])[0].n; }
  function files(exp) { return { Files: [{ name: 'idempiere_open.json', size: 1, data: exp }] }; }
  function loadInto(name, exp) {
    var T = birth(name), C = T.clientId, ses = session(T, '2026-11-11'), mark = SHIPPED.length, r1 = ses.execute(files(exp)), r2 = r1.ok ? ses.after(files(exp)) : { ok: false, msg: 'stage 1 refused: ' + r1.msg };
    return { C: C, r1: r1, r2: r2, ship: SHIPPED.slice(mark).filter(function (l) { return /^§(MIG-|PROC-UNPORTED|PROC-SQL)/.test(l); }) };
  }
  // the twin's books and documents, read from its OWN tables
  function twin(C) {
    var books = {}; q('SELECT ev.value AS v, SUM(f.amtacctdr) AS dr, SUM(f.amtacctcr) AS cr FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_client_id=? GROUP BY ev.value', [C]).forEach(function (r) { books[r.v] = cents(r.dr) - cents(r.cr); });
    var ctl = { AR: 0, AP: 0 }, clr = [CLR.AR, CLR.AP, CLR.BANK];
    q('SELECT ev.value AS v, dt.docbasetype AS b, SUM(f.amtacctdr) AS dr, SUM(f.amtacctcr) AS cr FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id JOIN c_invoice i ON i.c_invoice_id=f.record_id JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id WHERE f.ad_client_id=? AND f.ad_table_id=318 GROUP BY ev.value, dt.docbasetype', [C])
      .forEach(function (r) { if (clr.indexOf(r.v) >= 0 || (O.tb[r.v] !== undefined && !O.cls[r.v])) return; ctl[r.b[1] === 'R' ? 'AR' : 'AP'] += cents(r.dr) - cents(r.cr); });
    var invs = q('SELECT i.documentno AS no, i.docstatus AS s, i.posted AS p, i.ispaid AS paid, i.grandtotal AS total, substr(i.dateinvoiced,1,10) AS d, bp.value AS bp, dt.docbasetype AS b FROM c_invoice i JOIN c_bpartner bp ON bp.c_bpartner_id=i.c_bpartner_id JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id WHERE i.ad_client_id=? ORDER BY i.documentno', [C]);
    var bAcc = q('SELECT ba.accountno AS no, ba.currentbalance AS cb FROM c_bankaccount ba WHERE ba.ad_client_id=? ORDER BY ba.accountno', [C]);
    var asset = (q('SELECT ev.value AS v FROM c_acctschema_default d JOIN c_validcombination vc ON vc.c_validcombination_id=d.b_asset_acct JOIN c_elementvalue ev ON ev.c_elementvalue_id=vc.account_id WHERE d.ad_client_id=?', [C])[0] || {}).v;
    return { books: books, ctl: ctl, invs: invs, bAcc: bAcc, asset: asset, total: Object.keys(books).reduce(function (s, a) { return s + books[a]; }, 0) };
  }
  // the SAME comparators judge the real load and the mutants: a list of differences, empty = the twin is the source
  function cmpTwin(C, srcLeft) {
    var t = twin(C), d = [], SGN = { ARI: 1, ARC: -1, API: -1, APC: 1 };
    plain.forEach(function (a) { if (t.books[a] !== O.tb[a]) d.push('TB plain ' + a + ' twin ' + money(t.books[a] || 0) + ' source ' + money(O.tb[a])); });
    ['AR', 'AP'].forEach(function (s) { var clr = t.books[CLR[s]] || 0; if (clr !== srcLeft[s]) d.push('CLEAR ' + s + ' ' + CLR[s] + ' is ' + money(clr) + ' source says ' + money(srcLeft[s])); if (t.ctl[s] + clr !== clsTotal[s]) d.push('TB ' + s + ' control ' + money(t.ctl[s]) + ' + clearing ' + money(clr) + ' != source class total ' + money(clsTotal[s])); });
    var bc = t.books[CLR.BANK] || 0, bank = t.books[t.asset] || 0; if (bc !== srcLeft.BANK) d.push('CLEAR BANK is ' + money(bc) + ' source says ' + money(srcLeft.BANK)); if (bank + bc !== clsTotal.BANK) d.push('TB BANK asset ' + money(bank) + ' + clearing ' + money(bc) + ' != source ' + money(clsTotal.BANK));
    if (t.total !== 0) d.push('books do not sum to zero: ' + money(t.total));
    var got = {}, want = {}; t.invs.forEach(function (i) { var k2 = (i.b[1] === 'R' ? 'AR' : 'AP') + '|' + i.bp; got[k2] = (got[k2] || 0) + cents(i.total) * SGN[i.b]; });
    Object.keys(O.open).forEach(function (no) { var o = O.open[no]; if (!brought(o)) return; var k2 = (o.base[1] === 'R' ? 'AR' : 'AP') + '|' + o.bp; want[k2] = (want[k2] || 0) + o.amt * SGN[o.base]; });
    Array.from(new Set(Object.keys(got).concat(Object.keys(want)))).sort().forEach(function (p) { if ((got[p] || 0) !== (want[p] || 0)) d.push('OPEN ' + p + ' twin ' + money(got[p] || 0) + ' source ' + money(want[p] || 0)); });
    t.invs.forEach(function (i) { var o = O.open[i.no]; if (!o || o.base !== i.b || o.bp !== i.bp || o.date !== i.d || i.s !== 'CO' || i.p !== 'Y' || i.paid === 'Y') d.push('DOC ' + i.no + ' ' + i.s + '/' + i.p + '/' + i.paid); });
    stmNos.forEach(function (no) { var a = t.bAcc.filter(function (x) { return x.no === no; })[0]; if (!a || cents(a.cb) !== O.bank[no]) d.push('BANK ' + no + ' twin ' + (a ? money(cents(a.cb)) : 'absent') + ' source ' + money(O.bank[no])); });
    return d;
  }

  // ═══ LOAD ═══
  var L = loadInto('Legacy Open Co', EXP), ver = L.ship.filter(function (l) { return /^§MIG-VERIFY/.test(l); }).pop() || '';
  say('§IDO-LOAD client=' + L.C + ' stage1=' + L.r1.ok + ' stage2=' + L.r2.ok + ' msg=' + String(L.r2.msg).slice(0, 300));
  L.ship.forEach(function (l) { say('  shipped> ' + l.slice(0, 330)); });
  check('LOAD', 'stages', 'stage 1 (masters + import rows + prerequisites) and stage 2 (Import GL Journal 220 -> Complete, Import Invoice 207 CO, Import Bank Statement 221 -> Complete, verifier) end without a refusal', L.r1.ok && L.r2.ok && /Open balances completed/.test(String(L.r2.msg)), { r1: L.r1.msg, r2: L.r2.msg });
  check('LOAD', 'shipped-verifier', 'the loader\'s own verifier printed §MIG-VERIFY verdict=PASS with > 0 checks judged', /verdict=PASS judged=[1-9]/.test(ver), ver);
  var dif = L.r2.ok ? cmpTwin(L.C, WANT_LEFT) : ['load did not complete'];
  check('LOAD', 'books-are-the-source', 'the twin\'s own tables vs the oracle: plain accounts exact (' + plain.length + '), AR / AP / BANK control + clearing == the source class total, each clearing == the leftover the source documents imply (AR ' + money(WANT_LEFT.AR) + ', AP ' + money(WANT_LEFT.AP) + ', BANK ' + money(WANT_LEFT.BANK) + '), open AR/AP per partner == the oracle, every document Completed + Posted + not paid, bank CurrentBalance == the oracle, the books sum to 0.00', dif.length === 0, dif);
  var t0 = L.r2.ok ? twin(L.C) : { books: {} };
  check('LOAD', 'clearing-values', 'AR Clearing holds exactly ' + money(WANT_LEFT.AR) + ' (the foreign invoice, named refusal P3), AP Clearing 0.00, Bank Clearing 0.00 - read from Fact_Acct of the twin', (t0.books[CLR.AR] || 0) === WANT_LEFT.AR && (CLR.AP in t0.books) && t0.books[CLR.AP] === 0 && (CLR.BANK in t0.books) && t0.books[CLR.BANK] === 0, { AR: t0.books[CLR.AR], AP: t0.books[CLR.AP], BANK: t0.books[CLR.BANK] });
  verdict('LOAD');

  // ═══ MUTANTS: each must make a comparator FAIL (a witness that cannot fail is no witness) ═══
  var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
  // M1 flip a TB amount on a plain account (a balanced pair would still differ from the oracle)
  var m1 = clone(EXP), pa = m1.sets.tb.filter(function (r) { return !r.class && cents(r.balance) !== 0; })[0]; pa.balance = Number(pa.balance) + 10;
  var d1 = cmpTB(m1.sets); check('MUTANT', 'flip-tb-amount', 'a trial-balance amount flipped by 10.00 on ' + pa.code + ' is caught by the reader comparator, naming that account', d1.length === 1 && d1[0].indexOf(pa.code) === 0, d1);
  // M2 flip an open-item amount
  var m2 = clone(EXP), oi = m2.sets.open_items.filter(function (r) { return r.iso === O.cur; })[0]; oi.open_amount = Number(oi.open_amount) + 7;
  var d2 = cmpOpen(m2.sets); check('MUTANT', 'flip-open-amount', 'an open amount flipped by 7.00 on ' + oi.documentno + ' is caught by the open-item comparator', d2.length === 1 && d2[0].indexOf(oi.documentno) === 0, d2);
  // M3 drop an open item
  var m3 = clone(EXP), dropped = m3.sets.open_items.filter(function (r) { return r.iso === O.cur; })[0]; m3.sets.open_items = m3.sets.open_items.filter(function (r) { return r !== dropped; });
  var d3 = cmpOpen(m3.sets); check('MUTANT', 'drop-open-item', 'a dropped open item (' + dropped.documentno + ') is caught by the open-item comparator', d3.length === 1 && d3[0].indexOf(dropped.documentno) === 0 && /absent/.test(d3[0]), d3);
  // M4 drop a TB account
  var m4 = clone(EXP), da = m4.sets.tb.filter(function (r) { return !r.class && cents(r.balance) !== 0; })[1]; m4.sets.tb = m4.sets.tb.filter(function (r) { return r !== da; });
  var d4 = cmpTB(m4.sets); check('MUTANT', 'drop-tb-account', 'a dropped trial-balance account (' + da.code + ') is caught by the reader comparator', d4.length === 1 && d4[0].indexOf(da.code) === 0, d4);
  // M5 a mislabelled class: the AR control account read as plain
  var m5 = clone(EXP), ca = m5.sets.tb.filter(function (r) { return r.class === 'AR'; })[0]; ca.class = '';
  var d5 = cmpClass(m5.sets); check('MUTANT', 'wrong-class', 'a control account read as plain (' + ca.code + ') is caught by the class comparator', d5.length === 1 && d5[0].indexOf(ca.code) === 0, d5);
  // M6/M7 through a REAL load: the loader checks the sheets against themselves, so a dropped / flipped source item passes the loader and MUST be caught by the oracle comparator on the twin's tables
  var mark6 = SHIPPED.length, L6 = loadInto('Mutant Drop Co', m3), v6 = SHIPPED.slice(mark6).filter(function (l) { return /^§MIG-VERIFY/.test(l); }).pop() || '', dd6 = L6.r2.ok ? cmpTwin(L6.C, WANT_LEFT) : ['(load refused) ' + L6.r2.msg];
  say('§IDO-MUTANT drop-open-item-load stage2=' + L6.r2.ok + ' loader=' + v6.slice(0, 80) + ' oracle_differences=' + J(dd6).slice(0, 400));
  check('MUTANT', 'drop-item-through-load', 'with ' + dropped.documentno + ' removed from the file the loader (self-consistent) completes, but the twin\'s books differ from the oracle: AR/AP clearing and OPEN per partner FAIL', dd6.length > 0 && dd6.some(function (x) { return /^CLEAR|^OPEN|^TB/.test(x); }), dd6);
  var mark7 = SHIPPED.length, L7 = loadInto('Mutant Flip Co', m2), dd7 = L7.r2.ok ? cmpTwin(L7.C, WANT_LEFT) : ['(load refused) ' + L7.r2.msg];
  say('§IDO-MUTANT flip-open-amount-load stage2=' + L7.r2.ok + ' oracle_differences=' + J(dd7).slice(0, 400));
  check('MUTANT', 'flip-amount-through-load', 'with ' + oi.documentno + ' flipped by 7.00 the loader completes, but the twin\'s open amount / clearing differ from the oracle', dd7.length > 0 && dd7.some(function (x) { return /^OPEN|^CLEAR/.test(x); }), dd7);
  verdict('MUTANT');

  var vs = Object.keys(CASES).map(function (c) { return c + '=' + (CASES[c].failed ? 'FAIL' : 'PASS'); }).join(' ');
  var final = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§IDO-VERDICT ' + final + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' (' + vs + ')');
  process.exit(final === 'FAIL' ? 1 : 0);
})().catch(function (e) { say('§IDO-ERROR ' + (e && e.stack || e)); say('§IDO-VERDICT FAIL judged=' + ALL.judged + ' failed=' + (ALL.failed + 1)); process.exit(1); });
