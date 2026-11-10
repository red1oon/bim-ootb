#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sap_agent/open_reader.js: the OPEN-BALANCES READER of an SAP Business One Service Layer, ALPHA (read only). Implementing bim-compiler
//   prompts/MIGRATE_INSTALL_TENANT.md §SAP-BC-OPEN-SPEC (SAP: facts + peculiarities S1-S15). Witness: erp/tests/witness_sapbc_open.js (§SBO-*). READ THE LOG: §SAP-OPEN lines.
//   Never run on a real company: the witness oracle is a mock Service Layer's raw rows (CONN INCONCLUSIVE by construction). Every field name below was read from SAP's published
//   Service Layer metadata and is re-checked against YOUR server's $metadata before it is asked for (a missing field is named, never guessed).
// Writes sap_open.json (format sap-b1-open-json-v1) = { manifest, sets: { tb, open_items, partner_locations, banks } } - the SAME neutral shape the iDempiere reader writes;
//   erp/migrate/templates/sap-b1-10-open.json turns it into the open sheets (I_GLJournal, I_Invoice, C_Bank, C_BankAccount, I_BankStatement) plugins/open_balances.mjs loads.
// READ ONLY: GET, plus Login / Logout / CompanyService_GetAdminInfo (the same calls agent.js makes). The PASSWORD is never a flag: SAP_PASSWORD, else asked (hidden) by agent.js.
// Deterministic: no clock, no random (the cut-over date is an input). Amounts are summed in integer cents.
// Usage (through the agent):  node agent.js --url https://<server>:50000 --company <CompanyDB> --user <user> --cutover 2026-12-31 [--insecure] [--openfile sap_open.json]
'use strict';
var crypto = require('crypto'), AG = require('./agent.js');

var FORMAT = 'sap-b1-open-json-v1';
// what is read (set -> { fields, required }). Field names: the Service Layer's own $metadata (entity types JournalEntry, ChartOfAccount, BusinessPartner, Document, HouseBankAccount, Bank).
var DOC = ['DocEntry', 'DocNum', 'CardCode', 'CardName', 'DocDate', 'DocDueDate', 'DocTotal', 'PaidToDate', 'DocTotalFc', 'PaidToDateFC', 'DocCurrency', 'DocumentStatus', 'Cancelled', 'CancelStatus', 'TransNum'];
var DOC_REQ = ['DocEntry', 'DocNum', 'CardCode', 'DocDate', 'DocTotal', 'PaidToDate', 'DocumentStatus'];
var SETS = {
  ChartOfAccounts: { fields: ['Code', 'Name', 'AccountType', 'AcctCurrency', 'ActiveAccount', 'Balance'], required: ['Code', 'Name'] },
  BusinessPartners: { fields: ['CardCode', 'CardName', 'CardType', 'FederalTaxID', 'DebitorAccount', 'Currency', 'CurrentAccountBalance', 'BPAddresses'], required: ['CardCode', 'CardType', 'DebitorAccount'] },
  Invoices: { fields: DOC, required: DOC_REQ, base: 'ARI' },
  CreditNotes: { fields: DOC, required: DOC_REQ, base: 'ARC' },
  PurchaseInvoices: { fields: DOC, required: DOC_REQ, base: 'API' },
  PurchaseCreditNotes: { fields: DOC, required: DOC_REQ, base: 'APC' },
  HouseBankAccounts: { fields: ['BankCode', 'AccNo', 'Branch', 'GLAccount'], required: ['AccNo', 'GLAccount'] },
  Banks: { fields: ['BankCode', 'BankName', 'SwiftNo'], required: ['BankCode'] },
  JournalEntries: { fields: null, required: ['JdtNum', 'ReferenceDate', 'JournalEntryLines'] }   // the whole entity (the lines are a collection property; $select on it is not shown in the guide: UNCLEAR, so not used)
};
var BASES = { ARI: { issotrx: 'Y', sign: 1 }, ARC: { issotrx: 'Y', sign: -1 }, API: { issotrx: 'N', sign: 1 }, APC: { issotrx: 'N', sign: -1 } };
var TYPE_MAP = { at_Revenues: 'R', at_Expenses: 'E' };   // at_Other: the ERP default, as the masters converter does (the class is not in the Service Layer record)
var cents = function (v) { return Math.round(Number(v || 0) * 100); };
var money = function (c) { return c / 100; };
var day = function (v) { return String(v || '').slice(0, 10); };
var str = function (v) { return v == null ? '' : String(v); };

// run(opts, fetchImpl, log) -> { manifest, sets }.  opts: { url, company, user, password, page, cutover }
async function run(opts, fetchImpl, log) {
  var F = fetchImpl || fetch, say = log || function (s) { console.log(s); }, D = String(opts.cutover || '');
  if (!/^\d{4}-\d\d-\d\d$/.test(D)) throw new Error('--cutover must be a date, YYYY-MM-DD');
  var base = String(opts.url || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('--url must be the Service Layer address, e.g. https://myserver:50000');
  var root = /\/b1s\/v[12]$/.test(base) ? base : base + '/b1s/v1', origin = /^(https?:\/\/[^/]+)/.exec(root)[1], cookie = '', calls = [];
  async function call(method, p, body, extra) {
    var u = /^https?:/.test(p) ? p : p.charAt(0) === '/' ? origin + p : root + '/' + p, h = Object.assign({ Accept: 'application/json' }, extra || {});
    if (cookie) h.Cookie = cookie; if (body) h['Content-Type'] = 'application/json';
    calls.push(method + ' ' + u.replace(origin, ''));
    var r = await F(u, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined }), txt = await r.text();
    if (!r.ok) { var e = new Error(method + ' ' + u.replace(origin, '') + ' → HTTP ' + r.status + ' ' + txt.slice(0, 300)); e.status = r.status; throw e; }
    return { r: r, txt: txt };
  }
  var li = await call('POST', 'Login', { CompanyDB: opts.company, UserName: opts.user, Password: opts.password });
  var sc = li.r.headers.getSetCookie ? li.r.headers.getSetCookie() : String(li.r.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_]+=)/);
  cookie = sc.map(function (c) { return String(c).split(';')[0].trim(); }).filter(function (c) { return /^(B1SESSION|ROUTEID)=/.test(c); }).join('; ');
  if (!/B1SESSION=/.test(cookie)) throw new Error('Login answered without a B1SESSION cookie - is this a Service Layer address?');
  var raw = {}, msets = {}, problems = [], notes = [], admin = null, md = null;
  try {
    md = await call('GET', '$metadata', null, { Accept: 'application/xml' });
    var meta = AG.readMetadata(md.txt);
    for (var s of Object.keys(SETS)) {
      var spec = SETS[s], ty = meta.sets[s], have = ty && meta.types[ty] ? meta.types[ty] : null, ms = msets[s] = { type: ty || null };
      if (!have) { ms.missing_set = true; raw[s] = []; problems.push('field-missing: your server publishes no ' + s + ' - the open balances cannot be read'); say('§SAP-FIELD set=' + s + ' missing - nothing read'); continue; }
      var want = spec.fields || have, read = want.filter(function (f) { return have.indexOf(f) >= 0; }), miss = want.filter(function (f) { return have.indexOf(f) < 0; });
      ms.fields_read = read; ms.fields_missing = miss;
      if (miss.length) say('§SAP-FIELD set=' + s + ' missing=' + JSON.stringify(miss) + ' - those columns stay empty');
      spec.required.forEach(function (f) { if (have.indexOf(f) < 0) problems.push('field-missing: ' + s + '.' + f + ' is not in your server\'s metadata - the open balances need it'); });
      var cnt = await call('GET', s + '/$count'); ms.count = Number(String(cnt.txt).replace(/[^0-9]/g, '')) || 0;
      var rows = [], next = s + (spec.fields ? '?$select=' + read.join(',') : ''), pages = 0;
      while (next) { var pg = await call('GET', next, null, { Prefer: 'odata.maxpagesize=' + (opts.page || 100) }), j = JSON.parse(pg.txt); pages++;
        (j.value || []).forEach(function (r) { if (!spec.fields) { rows.push(r); return; } var o = {}; read.forEach(function (f) { if (r[f] !== undefined) o[f] = r[f]; }); rows.push(o); });
        next = j['@odata.nextLink'] || j['odata.nextLink'] || ''; if (pages > 100000) throw new Error(s + ': paging did not end'); }
      raw[s] = rows; ms.rows = rows.length; ms.pages = pages;
      say('§SAP-OPEN set=' + s + ' count=' + ms.count + ' rows=' + rows.length + ' pages=' + pages + (ms.count === rows.length ? '' : ' COUNT≠ROWS'));
    }
    if (/Name="CompanyService_GetAdminInfo"/.test(md.txt)) {
      try { var ai = JSON.parse((await call('POST', 'CompanyService_GetAdminInfo')).txt); admin = { LocalCurrency: str(ai.LocalCurrency), Country: str(ai.Country), CompanyName: str(ai.CompanyName) }; }
      catch (e) { notes.push('CompanyService_GetAdminInfo failed (' + String(e.message).slice(0, 100) + ')'); }
    }
  } finally {
    try { await call('POST', 'Logout'); say('§SAP-OPEN logout ok'); } catch (e) { say('§SAP-OPEN logout failed ' + String(e.message).slice(0, 100)); }
  }
  if (!admin || !admin.LocalCurrency) problems.push('local-currency-unknown: CompanyService_GetAdminInfo did not return LocalCurrency - the books\' currency is not guessed');
  var LC = admin ? admin.LocalCurrency : '';
  var isLocal = function (c) { return !c || c === LC; };   // S13: UNCLEAR how DocCurrency spells the local currency; anything else is treated as foreign (left on clearing, named)

  // ── accounts and classes (spec: Account classes) ──
  var chart = {}; raw.ChartOfAccounts.forEach(function (a) { chart[a.Code] = a; });
  var bps = {}; raw.BusinessPartners.forEach(function (b) { bps[b.CardCode] = b; });
  var cls = {}, noCtl = 0;
  function classify(acct, c, who) { if (cls[acct] && cls[acct] !== c) problems.push('account ' + acct + ' is both ' + cls[acct] + ' and ' + c + ' control (' + who + ') - not guessed'); else cls[acct] = c; }
  raw.BusinessPartners.forEach(function (b) {
    if (b.CardType !== 'cCustomer' && b.CardType !== 'cSupplier') return;   // cLid (lead) has no ledger
    if (!b.DebitorAccount) { noCtl++; return; }
    classify(b.DebitorAccount, b.CardType === 'cCustomer' ? 'AR' : 'AP', b.CardCode); });
  if (noCtl) problems.push('control-account-unknown: ' + noCtl + ' business partner(s) have an empty DebitorAccount - their class cannot be told');
  var glOfBank = {}, bankByGl = {};
  raw.HouseBankAccounts.forEach(function (h) { if (!h.GLAccount) return; (bankByGl[h.GLAccount] = bankByGl[h.GLAccount] || []).push(h); classify(h.GLAccount, 'BANK', 'house bank ' + str(h.AccNo)); });
  Object.keys(bankByGl).forEach(function (g) { if (bankByGl[g].length > 1) problems.push('bank-gl-shared: house bank accounts ' + bankByGl[g].map(function (h) { return str(h.AccNo); }).join(', ') + ' share G/L account ' + g + ' - one balance cannot be split between them'); });

  // ── fact 1: the trial balance (journal lines up to D, in cents) ──
  var bal = {}, nl = {}, afterJ = 0, unknown = {};
  raw.JournalEntries.forEach(function (je) {
    var late = day(je.ReferenceDate) > D; if (late) afterJ += (je.JournalEntryLines || []).length;
    if (late) return;
    (je.JournalEntryLines || []).forEach(function (l) { var a = str(l.AccountCode); if (!chart[a]) unknown[a] = 1; bal[a] = (bal[a] || 0) + cents(l.Debit) - cents(l.Credit); nl[a] = (nl[a] || 0) + 1; }); });
  Object.keys(unknown).forEach(function (a) { problems.push('unknown-account: journal lines name AccountCode ' + a + ', which is not in ChartOfAccounts (S12: is AccountCode the control account or the CardCode?)'); });
  var tb = Object.keys(bal).sort().map(function (a) { var c = chart[a] || {}; return { account_id: a, code: a, name: str(c.Name) || a, account_type: TYPE_MAP[c.AccountType] || '', balance: money(bal[a]), lines: nl[a], class: cls[a] || '' }; });
  // ── fact 2: the open items ──
  var items = [], afterD = 0, cancelled = 0, zero = 0, docnos = {}, dup = 0;
  Object.keys(SETS).filter(function (s) { return SETS[s].base; }).forEach(function (s) {
    var B = SETS[s].base, bi = BASES[B];
    raw[s].forEach(function (d) {
      if (day(d.DocDate) > D) { afterD++; return; }
      if (d.Cancelled === 'tYES' || (d.CancelStatus && d.CancelStatus !== 'csNo')) { cancelled++; return; }   // S11
      if (d.DocumentStatus !== 'bost_Open') return;
      var foreign = !isLocal(d.DocCurrency), openC = cents(d.DocTotal) - cents(d.PaidToDate);   // local currency; PaidToDate is as of now
      if (openC === 0) { zero++; return; }
      var bp = bps[d.CardCode] || {}, ad = (bp.BPAddresses || [])[0];
      var no = str(d.DocNum); if (docnos[no]) dup++; docnos[no] = 1;
      items.push({ invoice_id: d.DocEntry, documentno: no, base: B, issotrx: bi.issotrx, docstatus: 'CO', posted: d.TransNum ? 'Y' : 'N', dateinvoiced: day(d.DocDate), dateacct: day(d.DocDate),
        iso: foreign ? str(d.DocCurrency) : LC, grandtotal: money(cents(d.DocTotal) * bi.sign), open_amount: money(openC * bi.sign), bp_value: str(d.CardCode), bp_name: str(d.CardName || bp.CardName),
        bp_taxid: str(bp.FederalTaxID), iscustomer: bp.CardType === 'cCustomer' ? 'Y' : 'N', isvendor: bp.CardType === 'cSupplier' ? 'Y' : 'N',
        term_value: '', term_name: '', term_days: '', pricelist_name: '', pricelist_so: bi.issotrx, has_location: ad ? 'Y' : 'N' }); }); });
  if (dup) notes.push('docno-reused-across-kinds: ' + dup + ' document number(s) are used by more than one document kind (the Service Layer numbers each kind on its own)');
  // partner locations: the first BPAddresses row of each partner that has an open item (S6: none = a named refusal in the template)
  var locs = [], seenBp = {};
  items.forEach(function (it) { if (seenBp[it.bp_value]) return; seenBp[it.bp_value] = 1; var ad = ((bps[it.bp_value] || {}).BPAddresses || [])[0]; if (!ad) return;
    var cc = /^[A-Za-z]{2}$/.test(str(ad.Country)) ? str(ad.Country).toUpperCase() : (admin && /^[A-Za-z]{2}$/.test(admin.Country) ? admin.Country.toUpperCase() : '');
    locs.push({ bp_value: it.bp_value, bploc_id: it.bp_value + '/' + str(ad.AddressName), loc_name: str(ad.AddressName), location_id: it.bp_value + '/' + str(ad.AddressName), address1: str(ad.Street), address2: str(ad.Block), city: str(ad.City), postal: str(ad.ZipCode), region: str(ad.State), country: cc }); });
  // ── fact 3: the bank balances (GL balance of the house bank's account at D, S8) ──
  var bankNames = {}; raw.Banks.forEach(function (b) { bankNames[b.BankCode] = b; });
  var banks = raw.HouseBankAccounts.filter(function (h) { return h.GLAccount; }).sort(function (a, b) { return str(a.AccNo) < str(b.AccNo) ? -1 : 1; }).map(function (h) {
    var ac = (chart[h.GLAccount] || {}).AcctCurrency, bk = bankNames[h.BankCode] || {};
    return { bankaccount_id: str(h.BankCode) + '/' + str(h.AccNo), value: str(h.AccNo), name: str(h.AccNo), accountno: str(h.AccNo), bankaccounttype: 'C', currentbalance: money(bal[h.GLAccount] || 0), iso: isLocal(ac) ? LC : str(ac),
      bank_name: str(bk.BankName) || str(h.BankCode), routingno: str(h.Branch), swiftcode: str(bk.SwiftNo), asset_code: str(h.GLAccount) }; });
  // ── S2: per partner, the balance the Service Layer states vs the open items (counts only; sign convention UNCLEAR, S15 -> absolute values) ──
  var perBp = {}; items.forEach(function (it) { perBp[it.bp_value] = (perBp[it.bp_value] || 0) + cents(it.open_amount); });
  var differs = Object.keys(bps).filter(function (c) { var b = bps[c]; if (b.CurrentAccountBalance == null || !perBp[c]) return false; return Math.abs(cents(b.CurrentAccountBalance)) !== Math.abs(perBp[c]); }).length;
  if (differs) notes.push('bp-balance-differs: ' + differs + ' partner(s) state a CurrentAccountBalance different from their open documents (on-account payments, foreign currency, S2/S15) - the difference stays on the clearing account');
  // ── S10: activity after D ──
  var after = { journal_lines: afterJ, documents: afterD };
  if (afterJ || afterD) problems.push('source-not-frozen: the Business One books hold postings dated after the cut-over ' + D + ' (journal lines ' + afterJ + ', documents ' + afterD + '); PaidToDate is as of today, so open amounts are as of today. Cut over at a date after the last posting, or freeze the source first.');
  var places = 2; notes.push('currency-places-assumed-2: the number of decimals of the local currency is not read; 2 is assumed');
  var mf = { format: FORMAT, tool: 'erp/sap_agent/open_reader.js', alpha: true, db: str(opts.company), company_name: (admin && admin.CompanyName) || str(opts.company), client_name: (admin && admin.CompanyName) || str(opts.company),
    cutover: D, currency: LC, currency_places: places, classes: { AR: Object.keys(cls).filter(function (a) { return cls[a] === 'AR'; }).length, AP: Object.keys(cls).filter(function (a) { return cls[a] === 'AP'; }).length, BANK: Object.keys(cls).filter(function (a) { return cls[a] === 'BANK'; }).length },
    after_cutover: after, anomalies: { open_zero_skipped: zero, cancelled_skipped: cancelled }, other_schemas: [], problems: problems, notes: notes,
    sets: msets, counts: { tb: tb.length, open_items: items.length, partner_locations: locs.length, banks: banks.length }, calls: calls,
    read_only: calls.every(function (c) { return /^GET /.test(c) || /^POST \/b1s\/v[12]\/(Login|Logout|CompanyService_GetAdminInfo)$/.test(c); }),
    metadata_sha256: md ? crypto.createHash('sha256').update(md.txt).digest('hex') : '' };
  say('§SAP-OPEN client=' + mf.db + ' cutover=' + D + ' currency=' + LC + ' tb_accounts=' + tb.length + ' tb_sum=' + (tb.reduce(function (n, r) { return n + cents(r.balance); }, 0) / 100).toFixed(2) + ' classes=' + JSON.stringify(mf.classes) +
    ' open_items=' + items.length + ' open_zero_skipped=' + zero + ' cancelled_skipped=' + cancelled + ' banks=' + banks.length + ' after_cutover=' + JSON.stringify(after) + ' read_only=' + (mf.read_only ? 'Y' : 'N') + ' problems=' + problems.length);
  problems.forEach(function (p) { say('§SAP-OPEN problem ' + p); });
  return { manifest: mf, sets: { tb: tb, open_items: items, partner_locations: locs, banks: banks } };
}

module.exports = { FORMAT: FORMAT, SETS: SETS, run: run };
