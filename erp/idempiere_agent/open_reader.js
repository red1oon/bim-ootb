#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — open_reader.js: the OPEN-BALANCES READER of a LEGACY iDempiere source (read only). Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §IDEMPIERE-OPEN-SPEC
//   (the three facts + peculiarities P1-P12). Witness: erp/tests/witness_idempiere_open.js (§IDO-*). READ THE LOG: §IDO-READ lines; the exit code is not evidence.
// Writes idempiere_open.json (format idempiere-open-json-v1) = { manifest, sets: { tb, open_items, banks } }; erp/migrate/templates/idempiere-open.json turns it into the open sheets
//   (I_GLJournal, I_Invoice, C_Bank, C_BankAccount, I_BankStatement) the ERP-neutral loader (plugins/open_balances.mjs) already knows.
// READ ONLY: the session is opened with default_transaction_read_only=on; only SELECTs are sent. The PASSWORD is never a flag and never printed: it is read from the environment
//   (PGPASSWORD / IDEMPIERE_PGPASSWORD) by psql itself (docker exec -e PGPASSWORD passes the NAME, not the value).
// Deterministic: no clock, no random (the cut-over date is an input).
// Usage: node open_reader.js --cutover 2026-12-31 [--db idempiere] [--client 11] [--user adempiere] [--container postgres | --host H --port P] [--schema N] [--out idempiere_open.json]
'use strict';
var cp = require('child_process'), fs = require('fs'), path = require('path');

var FORMAT = 'idempiere-open-json-v1';
function lit(v) { return "'" + String(v).replace(/'/g, "''") + "'"; }
function int(v) { var n = Number(v); if (!isFinite(n) || Math.floor(n) !== n) throw new Error('not an integer: ' + v); return n; }

// makeRunner(o) -> run(sql) -> array of row objects. One psql call per query; the result is ONE json document (json_agg), so no text parsing.
function makeRunner(o) {
  o = o || {};
  var env = Object.assign({}, process.env, { PGOPTIONS: '-c default_transaction_read_only=on' });
  if (!env.PGPASSWORD && env.IDEMPIERE_PGPASSWORD) env.PGPASSWORD = env.IDEMPIERE_PGPASSWORD;
  var base = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-U', o.user || 'adempiere', '-d', o.db || 'idempiere'];
  return function run(sql) {
    var wrapped = "SET search_path TO adempiere; SELECT COALESCE(json_agg(t), '[]'::json) FROM (" + sql + ') t;';
    var cmd, args;
    if (o.host) { cmd = 'psql'; args = ['-h', o.host, '-p', String(o.port || 5432)].concat(base, ['-c', wrapped]); }
    else { cmd = 'docker'; args = ['exec', '-e', 'PGPASSWORD', '-e', 'PGOPTIONS', o.container || 'postgres', 'psql'].concat(base, ['-c', wrapped]); }
    var out = cp.execFileSync(cmd, args, { env: env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });   // stderr (invoiceOpen's RAISE NOTICE) is not data
    return JSON.parse(out.replace(/^SET\s*/, ''));   // json_agg prints one document over several lines
  };
}

// readOpen(run, { client, cutover, schema? }) -> { manifest, sets }
function readOpen(run, o) {
  var C = int(o.client), D = lit(o.cutover), NEXT = "(" + D + "::date + 1)", say = o.say || function (l) { console.log(l); };
  var ci = run('SELECT ci.c_acctschema1_id AS schema_id, c.name AS client_name FROM ad_clientinfo ci JOIN ad_client c ON c.ad_client_id=ci.ad_client_id WHERE ci.ad_client_id=' + C)[0];
  if (!ci) throw new Error('client ' + C + ' not found');
  var S = int(o.schema || ci.schema_id);
  var sch = run('SELECT a.c_acctschema_id AS id, a.name, cu.iso_code AS iso, cu.stdprecision AS places, cu.c_currency_id AS cur FROM c_acctschema a JOIN c_currency cu ON cu.c_currency_id=a.c_currency_id WHERE a.ad_client_id=' + C + ' ORDER BY a.c_acctschema_id');
  var P = sch.filter(function (s) { return s.id === S; })[0];
  if (!P) throw new Error('accounting schema ' + S + ' is not a schema of client ' + C);
  var problems = [], notes = [];
  // ── account classes (spec: Account classes). ids of C_ElementValue ──
  function accts(sql) { return run('SELECT DISTINCT vc.account_id AS id FROM c_validcombination vc WHERE vc.c_validcombination_id IN (' + sql + ')').map(function (r) { return r.id; }); }
  var AR = accts('SELECT c_receivable_acct FROM c_bp_group_acct WHERE c_acctschema_id=' + S + ' AND ad_client_id=' + C + ' UNION SELECT c_receivable_acct FROM c_bp_customer_acct WHERE c_acctschema_id=' + S + ' AND ad_client_id=' + C + ' UNION SELECT c_receivable_acct FROM c_acctschema_default WHERE c_acctschema_id=' + S);
  var AP = accts('SELECT v_liability_acct FROM c_bp_group_acct WHERE c_acctschema_id=' + S + ' AND ad_client_id=' + C + ' UNION SELECT v_liability_acct FROM c_bp_vendor_acct WHERE c_acctschema_id=' + S + ' AND ad_client_id=' + C + ' UNION SELECT v_liability_acct FROM c_acctschema_default WHERE c_acctschema_id=' + S);
  var BK = accts('SELECT b_asset_acct FROM c_bankaccount_acct WHERE c_acctschema_id=' + S + ' AND ad_client_id=' + C);
  var cls = {}; [['AR', AR], ['AP', AP], ['BANK', BK]].forEach(function (p) { p[1].forEach(function (id) { if (cls[id] && cls[id] !== p[0]) problems.push('account ' + id + ' is both ' + cls[id] + ' and ' + p[0] + ' control: not routed, decide it by hand (spec: an account in two classes is refused)'); cls[id] = p[0]; }); });
  // ── fact 1: the trial balance ──
  var tb = run('SELECT ev.c_elementvalue_id AS account_id, ev.value AS code, ev.name AS name, ev.accounttype AS account_type, SUM(f.amtacctdr - f.amtacctcr) AS balance, COUNT(*) AS lines ' +
    'FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_client_id=' + C + ' AND f.c_acctschema_id=' + S + " AND f.postingtype='A' AND f.dateacct < " + NEXT + ' GROUP BY ev.c_elementvalue_id, ev.value, ev.name, ev.accounttype ORDER BY ev.value')
    .map(function (r) { r.class = cls[r.account_id] || ''; return r; });
  // ── fact 2: the open items (legacy invoiceOpen, spec: Open items) ──
  var ctl = AR.concat(AP).concat([0]).join(',');
  var items = run('SELECT i.c_invoice_id AS invoice_id, i.documentno, dt.docbasetype AS base, i.issotrx, i.docstatus, i.posted, to_char(i.dateinvoiced, \'YYYY-MM-DD\') AS dateinvoiced, to_char(i.dateacct, \'YYYY-MM-DD\') AS dateacct, ' +
    'cu.iso_code AS iso, i.grandtotal, invoiceopen(i.c_invoice_id, 0) AS open_amount, bp.value AS bp_value, bp.name AS bp_name, bp.taxid AS bp_taxid, bp.iscustomer, bp.isvendor, ' +
    'pt.value AS term_value, pt.name AS term_name, pt.netdays AS term_days, pl.name AS pricelist_name, pl.issopricelist AS pricelist_so, ' +
    '(SELECT COALESCE(SUM(f.amtacctdr - f.amtacctcr), 0) FROM fact_acct f WHERE f.ad_table_id=318 AND f.record_id=i.c_invoice_id AND f.c_acctschema_id=' + S + " AND f.postingtype='A' AND f.account_id IN (" + ctl + ')) AS control_amt ' +
    'FROM c_invoice i JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id JOIN c_currency cu ON cu.c_currency_id=i.c_currency_id JOIN c_bpartner bp ON bp.c_bpartner_id=i.c_bpartner_id LEFT JOIN c_paymentterm pt ON pt.c_paymentterm_id=i.c_paymentterm_id LEFT JOIN m_pricelist pl ON pl.m_pricelist_id=i.m_pricelist_id ' +
    "WHERE i.ad_client_id=" + C + " AND i.docstatus IN ('CO','CL') AND i.ispaid='N' AND i.isactive='Y' AND i.dateacct < " + NEXT + ' ORDER BY i.documentno, i.c_invoice_id');
  // the partner locations the open invoices sit on (legacy ImportInvoice needs a BP location: "ERR=No BP Location"); the invoice's OWN location is the source fact
  var locs = run('SELECT DISTINCT ON (bl.c_bpartner_location_id) bp.value AS bp_value, bl.c_bpartner_location_id AS bploc_id, bl.name AS loc_name, l.c_location_id AS location_id, l.address1, l.address2, l.city, l.postal, COALESCE(r.name, l.regionname) AS region, co.countrycode AS country ' +
    'FROM c_invoice i JOIN c_bpartner bp ON bp.c_bpartner_id=i.c_bpartner_id JOIN c_bpartner_location bl ON bl.c_bpartner_location_id=i.c_bpartner_location_id JOIN c_location l ON l.c_location_id=bl.c_location_id JOIN c_country co ON co.c_country_id=l.c_country_id LEFT JOIN c_region r ON r.c_region_id=l.c_region_id ' +
    "WHERE i.ad_client_id=" + C + " AND i.docstatus IN ('CO','CL') AND i.ispaid='N' AND i.isactive='Y' AND i.dateacct < " + NEXT + ' ORDER BY bl.c_bpartner_location_id');
  var zero = items.filter(function (r) { return Number(r.open_amount) === 0; }).length;
  items = items.filter(function (r) { return Number(r.open_amount) !== 0; });
  var paidOpen = run("SELECT COUNT(*) AS n FROM c_invoice i WHERE i.ad_client_id=" + C + " AND i.docstatus IN ('CO','CL') AND i.ispaid='Y' AND i.dateacct < " + NEXT + ' AND invoiceopen(i.c_invoice_id, 0) <> 0')[0].n;
  // ── fact 3: the bank balances ──
  var banks = run('SELECT ba.c_bankaccount_id AS bankaccount_id, ba.value, ba.name, ba.accountno, ba.bankaccounttype, ba.currentbalance, cu.iso_code AS iso, b.name AS bank_name, b.routingno, b.swiftcode, ev.value AS asset_code ' +
    'FROM c_bankaccount ba JOIN c_bank b ON b.c_bank_id=ba.c_bank_id JOIN c_currency cu ON cu.c_currency_id=ba.c_currency_id ' +
    'LEFT JOIN c_bankaccount_acct bc ON bc.c_bankaccount_id=ba.c_bankaccount_id AND bc.c_acctschema_id=' + S + ' LEFT JOIN c_validcombination vc ON vc.c_validcombination_id=bc.b_asset_acct LEFT JOIN c_elementvalue ev ON ev.c_elementvalue_id=vc.account_id ' +
    "WHERE ba.ad_client_id=" + C + " AND ba.isactive='Y' ORDER BY ba.accountno, ba.c_bankaccount_id");
  // ── P10: activity after the cut-over (invoiceOpen has no date parameter: the source must be frozen) ──
  var after = {
    fact_acct: run('SELECT COUNT(*) AS n FROM fact_acct WHERE ad_client_id=' + C + ' AND c_acctschema_id=' + S + " AND postingtype='A' AND dateacct >= " + NEXT)[0].n,
    invoices: run("SELECT COUNT(*) AS n FROM c_invoice WHERE ad_client_id=" + C + " AND docstatus IN ('CO','CL') AND dateacct >= " + NEXT)[0].n,
    allocations: run("SELECT COUNT(*) AS n FROM c_allocationhdr WHERE ad_client_id=" + C + " AND docstatus IN ('CO','CL') AND dateacct >= " + NEXT)[0].n };
  if (after.fact_acct || after.invoices || after.allocations) problems.push('source-not-frozen: the legacy books hold postings dated after the cut-over ' + o.cutover + ' (fact_acct ' + after.fact_acct + ', invoices ' + after.invoices + ', allocations ' + after.allocations +
    '); invoiceOpen has no date parameter, so open amounts are as of today. Cut over at a date after the last posting, or freeze the source first.');
  var other = sch.filter(function (s) { return s.id !== S; }).map(function (s) { return { id: s.id, name: s.name, currency: s.iso,
    fact_rows: run('SELECT COUNT(*) AS n FROM fact_acct WHERE ad_client_id=' + C + ' AND c_acctschema_id=' + s.id + " AND postingtype='A' AND dateacct < " + NEXT)[0].n }; });
  if (other.length) notes.push('Accounting schemas not moved (spec P6): ' + other.map(function (s) { return s.id + ' ' + s.name + ' (' + s.currency + ', ' + s.fact_rows + ' fact rows)'; }).join('; ') + '.');
  var mf = { format: FORMAT, db: o.db || '', client: C, client_name: ci.client_name, company_name: ci.client_name, acctschema: S, acctschema_name: P.name, cutover: String(o.cutover).slice(0, 10), currency: P.iso, currency_places: P.places,
    classes: { AR: AR.length, AP: AP.length, BANK: BK.length }, after_cutover: after, anomalies: { open_zero_skipped: zero, paid_but_open: paidOpen }, other_schemas: other, problems: problems, notes: notes,
    sets: { tb: { count: tb.length }, open_items: { count: items.length }, partner_locations: { count: locs.length }, banks: { count: banks.length } } };
  say('§IDO-READ client=' + C + ' schema=' + S + ' cutover=' + mf.cutover + ' currency=' + P.iso + ' tb_accounts=' + tb.length + ' tb_sum=' + tb.reduce(function (n, r) { return n + Math.round(Number(r.balance) * 100); }, 0) / 100 +
    ' classes=' + JSON.stringify(mf.classes) + ' open_items=' + items.length + ' open_zero_skipped=' + zero + ' paid_but_open=' + paidOpen + ' banks=' + banks.length + ' other_schemas=' + other.length + ' after_cutover=' + JSON.stringify(after) + ' problems=' + problems.length);
  problems.forEach(function (p) { say('§IDO-READ problem ' + p); });
  return { manifest: mf, sets: { tb: tb, open_items: items, partner_locations: locs, banks: banks } };
}

module.exports = { FORMAT: FORMAT, makeRunner: makeRunner, readOpen: readOpen };

if (require.main === module) {
  var a = process.argv.slice(2), get = function (k, d) { var i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  if (a.indexOf('--password') >= 0) { console.error('§IDO-READ refused: the password is never a flag. Set PGPASSWORD (or IDEMPIERE_PGPASSWORD) in the environment.'); process.exit(2); }
  var cut = get('cutover');
  if (!/^\d{4}-\d\d-\d\d$/.test(cut || '')) { console.error('usage: node open_reader.js --cutover YYYY-MM-DD [--db D] [--client N] [--user U] [--container C | --host H --port P] [--schema N] [--out FILE]'); process.exit(2); }
  var db = get('db', 'idempiere'), run = makeRunner({ db: db, user: get('user'), container: get('container'), host: get('host'), port: get('port') });
  var r = readOpen(run, { client: get('client', '11'), cutover: cut, schema: get('schema'), db: db });
  var out = get('out', path.join(process.cwd(), 'idempiere_open.json')); fs.writeFileSync(out, JSON.stringify(r, null, 1));
  console.log('§IDO-READ wrote ' + out);
}
