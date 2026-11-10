// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — migrate/connectors/bc_open.mjs: the OPEN-BALANCES READER of a Dynamics 365 Business Central configuration package, ALPHA. Implementing bim-compiler
//   prompts/MIGRATE_INSTALL_TENANT.md §SAP-BC-OPEN-SPEC (BC: facts + peculiarities B1-B11). Witness: erp/tests/witness_sapbc_open.js (§SBO-*). READ THE LOG: §BC-OPEN lines.
//   Never run on a real company: the oracle is a test-supplied package's raw rows (CONN INCONCLUSIVE by construction).
// INPUT: what connectors/bc_package.mjs already reads (BC's own "Export to Excel" of the tables listed in the spec; the model is microsoft/BCApps@616174f6, W1 BaseApp).
// OUTPUT: { manifest, sets: { tb, open_items, partner_locations, banks } } - the SAME neutral shape the iDempiere and SAP readers write; templates/bc-w1-open.json maps it to the open sheets.
// Remaining amount at D is SUM(Detailed Cust./Vendor Ledg. Entry."Amount (LCY)") dated <= D (the formula of the FlowField CustLedgerEntry.Table.al:174-181 / VendorLedgerEntry.Table.al:122-129,
//   re-derived from real table fields because it is UNCLEAR whether a package carries FlowFields): open at D = remaining <> 0, so BC's open state is date-exact (no frozen-source problem).
// Bank balance = SUM(Bank Account Ledger Entry.Amount) per account (the definition of Bank Account.Balance, BankAccount.Table.al:445-452).
// Pure: no I/O, no clock, no random. Browser + node. Amounts are summed in integer cents.
import { enumName } from './bc_package.mjs';
const CAT = { Assets: 'A', Liabilities: 'L', Equity: 'O', Income: 'R', CostofGoodsSold: 'E', Expense: 'E' };   // the same map bc-w1.json uses for G/L Account.Account Category

export const FORMAT = 'bc-open-json-v1';
export const NEED = { 15: 'G/L Account', 17: 'G/L Entry', 21: 'Cust. Ledger Entry', 25: 'Vendor Ledger Entry', 92: 'Customer Posting Group', 93: 'Vendor Posting Group', 98: 'General Ledger Setup',
  270: 'Bank Account', 271: 'Bank Account Ledger Entry', 277: 'Bank Account Posting Group', 379: 'Detailed Cust. Ledg. Entry', 380: 'Detailed Vendor Ledg. Entry' };
const s = (v) => (v == null ? '' : String(v));
const cents = (v) => Math.round(Number(v || 0) * 100);
const money = (c) => c / 100;
const day = (v) => s(v).slice(0, 10);
const yes = (v) => v === true || v === 'true' || v === '1' || v === 'Yes';
const BASES = { ARI: { issotrx: 'Y', sign: 1 }, ARC: { issotrx: 'Y', sign: -1 }, API: { issotrx: 'N', sign: 1 }, APC: { issotrx: 'N', sign: -1 } };

// readOpen(pkg, model, { cutover, say }) -> { manifest, sets }.  pkg = readPackage(...) output
export function readOpen(pkg, model, o) {
  const D = s(o && o.cutover), say = (o && o.say) || (() => {}), problems = [], notes = [];
  const rows = (id) => (pkg.tables[id] ? pkg.tables[id].rows : []);
  const empty = (why) => ({ manifest: { format: FORMAT, tool: 'erp/migrate/connectors/bc_open.mjs', alpha: true, db: s(pkg.code), company_name: '', client_name: '', cutover: D, currency: '', currency_places: 2, classes: {}, after_cutover: {}, anomalies: {}, other_schemas: [], problems: [why], notes, counts: {}, model: { commit: model.commit } },
    sets: { tb: [], open_items: [], partner_locations: [], banks: [] } });
  if (!/^\d{4}-\d\d-\d\d$/.test(D)) return empty('The cut-over date must be YYYY-MM-DD.');
  const missing = Object.keys(NEED).filter((id) => !pkg.tables[id]);
  if (missing.length) { const w = 'table-missing: the package lacks ' + missing.map((id) => id + ' ' + NEED[id]).join(', ') + ' - the open balances cannot be read (nothing is guessed)'; say('§BC-OPEN problem ' + w); return empty(w); }
  const LCY = s(rows(98)[0] && rows(98)[0]['LCY Code']);
  if (!LCY) problems.push('local-currency-unknown: General Ledger Setup carries no LCY Code - the books\' currency is not guessed');
  const prec = Number(rows(98)[0] && rows(98)[0]['Amount Rounding Precision']), places = prec > 0 && prec < 1 ? Math.round(-Math.log10(prec)) : 2;
  const co = rows(79)[0] || {};
  // ── accounts and classes (spec: Account classes) ──
  const chart = {}; rows(15).forEach((a) => { chart[a['No.']] = a; });
  const cust = {}; rows(18).forEach((c) => { cust[c['No.']] = c; });
  const vend = {}; rows(23).forEach((c) => { vend[c['No.']] = c; });
  const pgAR = {}; rows(92).forEach((g) => { pgAR[g.Code] = g['Receivables Account']; });
  const pgAP = {}; rows(93).forEach((g) => { pgAP[g.Code] = g['Payables Account']; });
  const pgBK = {}; rows(277).forEach((g) => { pgBK[g.Code] = g['G/L Account No.']; });
  const cls = {};
  const classify = (acct, c, who) => { if (!acct) return; if (cls[acct] && cls[acct] !== c) problems.push('account ' + acct + ' is both ' + cls[acct] + ' and ' + c + ' control (' + who + ') - not guessed'); else cls[acct] = c; };
  const used = (list, field, map, c, tag) => { const seen = {}; list.forEach((r) => { const g = s(r[field]); if (!g || seen[g]) return; seen[g] = 1; if (!(g in map)) problems.push('posting-group-unknown: ' + tag + ' uses posting group ' + g + ', which the package does not carry'); else classify(map[g], c, tag + ' posting group ' + g); }); };
  used(rows(18).concat(rows(21)), 'Customer Posting Group', pgAR, 'AR', 'customers');
  used(rows(23).concat(rows(25)), 'Vendor Posting Group', pgAP, 'AP', 'vendors');
  used(rows(270), 'Bank Acc. Posting Group', pgBK, 'BANK', 'bank accounts');
  // ── fact 1: the trial balance (G/L Entry Amount up to D) ──
  const bal = {}, nl = {}, unknown = {}; let afterGl = 0;
  rows(17).forEach((e) => { const a = s(e['G/L Account No.']); if (day(e['Posting Date']) > D) { afterGl++; return; } if (!chart[a]) unknown[a] = 1; bal[a] = (bal[a] || 0) + cents(e.Amount); nl[a] = (nl[a] || 0) + 1; });
  Object.keys(unknown).forEach((a) => problems.push('unknown-account: G/L entries name account ' + a + ', which is not in the G/L Account table'));
  const tb = Object.keys(bal).sort().map((a) => ({ account_id: a, code: a, name: s((chart[a] || {}).Name) || a, account_type: CAT[enumName(model, 15, 'Account Category', s((chart[a] || {})['Account Category']))] || '', balance: money(bal[a]), lines: nl[a], class: cls[a] || '' }));
  // ── fact 2: the open items (remaining at D from the detailed entries) ──
  const detSum = (det, link) => { const m = {}; det.forEach((d) => { if (day(d['Posting Date']) > D || yes(d['Excluded from calculation'])) return; const k = s(d[link]); m[k] = (m[k] || 0) + cents(d['Amount (LCY)']); }); return m; };
  const cRem = detSum(rows(379), 'Cust. Ledger Entry No.'), vRem = detSum(rows(380), 'Vendor Ledger Entry No.');
  const items = [], locBy = {}; let zero = 0, flagDiffer = 0;
  const side = (list, rem, who, bpMap, noF, grp) => list.forEach((e) => {
    if (day(e['Posting Date']) > D) return;
    const r = rem[s(e['Entry No.'])] || 0; if (r === 0) { zero++; return; }
    if ((r !== 0) !== yes(e.Open)) flagDiffer++;   // the Open flag is as of now; only a cross-check
    const dt = enumName(model, who === 'C' ? 21 : 25, 'Document Type', s(e['Document Type'])).trim();
    const base = dt === 'Invoice' ? (who === 'C' ? 'ARI' : 'API') : dt === 'Credit Memo' ? (who === 'C' ? 'ARC' : 'APC') : '';
    const bp = bpMap[s(e[noF])] || {}, hasAd = !!(s(bp.Address) || s(bp.City) || s(bp['Post Code']) || s(bp['Country/Region Code'])), foreign = !!s(e['Currency Code']);
    const openC = who === 'C' ? r : -r;   // invoice > 0, credit memo < 0 on both sides
    items.push({ invoice_id: s(e['Entry No.']), documentno: s(e['Document No.']), base, issotrx: who === 'C' ? 'Y' : 'N', docstatus: 'CO', posted: 'Y', dateinvoiced: day(e['Posting Date']), dateacct: day(e['Posting Date']),
      iso: foreign ? s(e['Currency Code']) : LCY, grandtotal: money(openC), open_amount: money(openC), bp_value: s(e[noF]), bp_name: s(bp.Name || e['Customer Name'] || e['Vendor Name']), bp_taxid: s(bp['VAT Registration No.']),
      iscustomer: who === 'C' ? 'Y' : 'N', isvendor: who === 'V' ? 'Y' : 'N', term_value: '', term_name: '', term_days: '', pricelist_name: '', pricelist_so: who === 'C' ? 'Y' : 'N', has_location: hasAd ? 'Y' : 'N', doc_type_caption: dt });
    if (hasAd && !locBy[who + s(e[noF])]) locBy[who + s(e[noF])] = { who, no: s(e[noF]), bp };
  });
  side(rows(21), cRem, 'C', cust, 'Customer No.'); side(rows(25), vRem, 'V', vend, 'Vendor No.');
  const iso2 = {}; rows(9).forEach((c) => { iso2[c.Code] = s(c['ISO Code']); });
  const cc = (code) => { const c = s(code); return iso2[c] || (/^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : ''); };
  const locs = Object.keys(locBy).sort().map((k) => { const l = locBy[k], b = l.bp, id = (l.who === 'C' ? 'C/' : 'V/') + l.no;
    return { bp_value: l.no, bploc_id: id, loc_name: s(b.City) || l.no, location_id: id, address1: s(b.Address), address2: s(b['Address 2']), city: s(b.City), postal: s(b['Post Code']), region: '', country: cc(b['Country/Region Code']) }; });
  // ── fact 3: the bank balances (bank ledger sum per account up to D) ──
  const bk = {}; rows(271).forEach((e) => { if (day(e['Posting Date']) > D) return; const a = s(e['Bank Account No.']); bk[a] = (bk[a] || 0) + cents(e.Amount); });
  const banks = rows(270).slice().sort((a, b) => (s(a['No.']) < s(b['No.']) ? -1 : 1)).map((b) => ({ bankaccount_id: s(b['No.']), value: s(b['No.']), name: s(b.Name) || s(b['No.']), accountno: s(b['Bank Account No.']) || s(b['No.']),
    bankaccounttype: 'C', currentbalance: money(bk[s(b['No.'])] || 0), iso: s(b['Currency Code']) || LCY, bank_name: s(b.Name) || s(b['No.']), routingno: s(b['Transit No.']) || s(b['Bank Branch No.']), swiftcode: s(b['SWIFT Code']), asset_code: s(pgBK[s(b['Bank Acc. Posting Group'])]) }));
  // B7: bank ledger vs the G/L account of its posting group (a difference stays on Bank clearing)
  const glOf = {}; banks.forEach((b) => { if (b.iso === LCY && b.asset_code) glOf[b.asset_code] = (glOf[b.asset_code] || 0) + cents(b.currentbalance); });
  const gld = Object.keys(glOf).filter((a) => glOf[a] !== (bal[a] || 0)).length;
  if (gld) notes.push('bank-gl-differs: ' + gld + ' bank G/L account(s) differ from the sum of their bank ledger entries (manual G/L postings or unreconciled entries, B7) - the difference stays on the Bank clearing account');
  if (flagDiffer) notes.push('open-flag-differs: ' + flagDiffer + ' ledger entr' + (flagDiffer === 1 ? 'y has' : 'ies have') + ' an Open flag different from "remaining at the cut-over is not zero" (entries closed or opened after the cut-over); the cut-over date is used, not the flag');
  notes.push('currency-places: ' + places + (prec > 0 ? ' (General Ledger Setup Amount Rounding Precision)' : ' assumed'));
  const classN = (c) => Object.keys(cls).filter((a) => cls[a] === c).length;
  const mf = { format: FORMAT, tool: 'erp/migrate/connectors/bc_open.mjs', alpha: true, db: s(pkg.code), company_name: s(co.Name), client_name: s(co.Name) || s(pkg.code), cutover: D, currency: LCY, currency_places: places,
    classes: { AR: classN('AR'), AP: classN('AP'), BANK: classN('BANK') }, after_cutover: { gl_entries: afterGl }, anomalies: { open_zero_skipped: zero, open_flag_differs: flagDiffer }, other_schemas: [], problems, notes,
    counts: { tb: tb.length, open_items: items.length, partner_locations: locs.length, banks: banks.length }, model: { source: model.source, commit: model.commit } };
  say('§BC-OPEN package=' + s(pkg.code) + ' cutover=' + D + ' currency=' + LCY + ' tb_accounts=' + tb.length + ' tb_sum=' + (tb.reduce((n, r) => n + cents(r.balance), 0) / 100).toFixed(2) + ' classes=' + JSON.stringify(mf.classes) +
    ' open_items=' + items.length + ' open_zero_skipped=' + zero + ' banks=' + banks.length + ' gl_entries_after_cutover=' + afterGl + ' problems=' + problems.length);
  problems.forEach((p) => say('§BC-OPEN problem ' + p));
  return { manifest: mf, sets: { tb, open_items: items, partner_locations: locs, banks } };
}
