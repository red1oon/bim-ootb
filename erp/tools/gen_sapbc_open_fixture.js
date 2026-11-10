#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — gen_sapbc_open_fixture.js: writes the TEST-SUPPLIED ledgers W-SAPBC-OPEN reads (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-BC-OPEN-SPEC). These are NOT vendor example
//   records (neither SAP's guide nor Microsoft's demo company prints a ledger): they are one small invented economy written twice, once in the SAP Business One Service Layer's shape
//   (tests/fixtures/sapbc_open/sap_rows.json) and once in Business Central's table shape (bc_rows.json, same layout as bc_package_contoso/rows.json). Field NAMES come from SAP's $metadata
//   and Microsoft's BCApps (bc_model.mjs); the VALUES are made up to exercise every peculiarity of the spec. The witness never reads this generator's arithmetic: its oracle re-aggregates the
//   emitted raw rows by an independent path. Deterministic: no clock, no random. Local currency USD, foreign EUR.
//   Peculiarities present: partly paid invoice (101, 102) · credit note (SCN-101 / PCN) · foreign invoice (103) · partner with no address (C3) · on-account payment (C1, no document) ·
//   cancelled invoice (097) · fully paid invoice (099) · foreign bank (1010) · postings after 2026-06-30 (105 + a payment) so an earlier cut-over is "not frozen" (SAP) / date-exact (BC).
'use strict';
var fs = require('fs'), path = require('path');
var OUT = path.join(__dirname, '..', 'tests', 'fixtures', 'sapbc_open');
var ACC = [['1000', 'Cash at Bank', 'at_Other', 'Assets', 'USD'], ['1010', 'Bank EUR', 'at_Other', 'Assets', 'EUR'], ['1100', 'Trade Receivables', 'at_Other', 'Assets', 'USD'], ['1200', 'Inventory', 'at_Other', 'Assets', 'USD'],
  ['2000', 'Trade Payables', 'at_Other', 'Liabilities', 'USD'], ['3000', 'Share Capital', 'at_Other', 'Equity', 'USD'], ['4000', 'Sales Revenue', 'at_Revenues', 'Income', 'USD'], ['5000', 'Cost of Purchases', 'at_Expenses', 'CostofGoodsSold', 'USD']];
var BP = { C1: ['Alpha Customer One', 'C', ['1 Main Street', 'Springfield', '10001', 'US']], C2: ['Beta Customer Two', 'C', ['2 Euro Lane', 'Berlin', '20002', 'DE']], C3: ['Gamma Customer Three', 'C', null],
  V1: ['Delta Vendor One', 'V', ['3 Supply Road', 'Dayton', '30003', 'US']], V2: ['Epsilon Vendor Two', 'V', ['4 Depot Avenue', 'Dayton', '30004', 'US']] };
// journals: [date, memo, [[account, debit, credit, bp, fc]]] ; JdtNum = index + 1
var J = [
  ['2026-01-02', 'Capital', [['1000', 5000, 0], ['1200', 4000, 0], ['3000', 0, 9000]]],
  ['2026-01-03', 'EUR bank opening', [['1010', 320, 0, '', 290], ['3000', 0, 320]]],
  ['2026-02-15', 'SI-097', [['1100', 60, 0, 'C1'], ['4000', 0, 60]]],
  ['2026-02-15', 'SI-097 cancelled', [['4000', 60, 0], ['1100', 0, 60, 'C1']]],
  ['2026-01-20', 'SI-099', [['1100', 250, 0, 'C1'], ['4000', 0, 250]]],
  ['2026-02-01', 'Receipt SI-099', [['1000', 250, 0], ['1100', 0, 250, 'C1']]],
  ['2026-02-01', 'SI-101', [['1100', 1000, 0, 'C1'], ['4000', 0, 1000]]],
  ['2026-02-10', 'SI-102', [['1100', 500, 0, 'C1'], ['4000', 0, 500]]],
  ['2026-03-01', 'Receipt SI-102', [['1000', 200, 0], ['1100', 0, 200, 'C1']]],
  ['2026-03-05', 'SI-103 EUR', [['1100', 270, 0, 'C2', 250], ['4000', 0, 270]]],
  ['2026-03-10', 'SI-104', [['1100', 80, 0, 'C3'], ['4000', 0, 80]]],
  ['2026-04-01', 'SCN-101', [['4000', 100, 0], ['1100', 0, 100, 'C1']]],
  ['2026-04-15', 'On-account receipt C1', [['1000', 150, 0], ['1100', 0, 150, 'C1']]],
  ['2026-02-05', 'PI-201', [['5000', 800, 0], ['2000', 0, 800, 'V1']]],
  ['2026-02-20', 'PI-202', [['5000', 600, 0], ['2000', 0, 600, 'V2']]],
  ['2026-03-20', 'Payment PI-202', [['2000', 100, 0, 'V2'], ['1000', 0, 100]]],
  ['2026-04-05', 'PCN-301', [['2000', 50, 0, 'V1'], ['5000', 0, 50]]],
  ['2026-07-15', 'SI-105', [['1100', 40, 0, 'C1'], ['4000', 0, 40]]],
  ['2026-07-20', 'Receipt SI-101 part', [['1000', 400, 0], ['1100', 0, 400, 'C1']]]
];
// documents: [set, docnum, bp, date, total, paid, jdt, status, {fc, cur, cancelled}]
var DOCS = [
  ['Invoices', 97, 'C1', '2026-02-15', 60, 0, 3, 'bost_Open', { cancelled: true }], ['Invoices', 99, 'C1', '2026-01-20', 250, 250, 5, 'bost_Close'], ['Invoices', 101, 'C1', '2026-02-01', 1000, 400, 7, 'bost_Open'],
  ['Invoices', 102, 'C1', '2026-02-10', 500, 200, 8, 'bost_Open'], ['Invoices', 103, 'C2', '2026-03-05', 270, 0, 10, 'bost_Open', { fc: 250, cur: 'EUR' }], ['Invoices', 104, 'C3', '2026-03-10', 80, 0, 11, 'bost_Open'],
  ['Invoices', 105, 'C1', '2026-07-15', 40, 0, 18, 'bost_Open'], ['CreditNotes', 111, 'C1', '2026-04-01', 100, 0, 12, 'bost_Open'],
  ['PurchaseInvoices', 201, 'V1', '2026-02-05', 800, 0, 14, 'bost_Open'], ['PurchaseInvoices', 202, 'V2', '2026-02-20', 600, 100, 15, 'bost_Open'], ['PurchaseCreditNotes', 301, 'V1', '2026-04-05', 50, 0, 17, 'bost_Open']
];
var nm = function (c) { return BP[c][0]; };
function sap() {
  var sets = {};
  sets.ChartOfAccounts = ACC.map(function (a) { return { Code: a[0], Name: a[1], AccountType: a[2], AcctCurrency: a[4], ActiveAccount: 'tYES', Balance: 0 }; });
  var glBal = {}, bpBal = {}; J.forEach(function (j) { j[2].forEach(function (l) { glBal[l[0]] = (glBal[l[0]] || 0) + l[1] - l[2]; if (l[3]) bpBal[l[3]] = (bpBal[l[3]] || 0) + l[1] - l[2]; }); });
  sets.ChartOfAccounts.forEach(function (a) { a.Balance = glBal[a.Code] || 0; });
  sets.BusinessPartners = Object.keys(BP).map(function (c) { var b = BP[c], o = { CardCode: c, CardName: b[0], CardType: b[1] === 'C' ? 'cCustomer' : 'cSupplier', FederalTaxID: 'TAX-' + c, DebitorAccount: b[1] === 'C' ? '1100' : '2000', Currency: '##', CurrentAccountBalance: b[1] === 'C' ? (bpBal[c] || 0) : (bpBal[c] || 0) };
    o.BPAddresses = b[2] ? [{ AddressName: 'Main', AddressType: 'bo_BillTo', Street: b[2][0], City: b[2][1], ZipCode: b[2][2], Country: b[2][3], State: '', Block: '' }] : []; return o; });
  ['Invoices', 'CreditNotes', 'PurchaseInvoices', 'PurchaseCreditNotes'].forEach(function (s) { var n = 0; sets[s] = DOCS.filter(function (d) { return d[0] === s; }).map(function (d) { var x = d[8] || {}; n++;
    return { DocEntry: { Invoices: 1000, CreditNotes: 2000, PurchaseInvoices: 3000, PurchaseCreditNotes: 4000 }[s] + n, DocNum: d[1], CardCode: d[2], CardName: nm(d[2]), DocDate: d[3], DocDueDate: d[3], DocTotal: d[4], PaidToDate: d[5], DocTotalFc: x.fc || 0, PaidToDateFC: 0,
      DocCurrency: x.cur || 'USD', DocumentStatus: d[7], Cancelled: x.cancelled ? 'tYES' : 'tNO', CancelStatus: x.cancelled ? 'csYes' : 'csNo', TransNum: d[6] }; }); });
  sets.HouseBankAccounts = [{ BankCode: 'BK1', AccNo: 'ACC-1000', Branch: 'BR-001', GLAccount: '1000' }, { BankCode: 'BK2', AccNo: 'ACC-1010-EUR', Branch: 'BR-002', GLAccount: '1010' }];
  sets.Banks = [{ BankCode: 'BK1', BankName: 'First Test Bank', SwiftNo: 'FTBKUS33' }, { BankCode: 'BK2', BankName: 'Euro Test Bank', SwiftNo: 'ETBKDEFF' }];
  sets.JournalEntries = J.map(function (j, i) { return { JdtNum: i + 1, ReferenceDate: j[0], Memo: j[1], JournalEntryLines: j[2].map(function (l, k) { var o = { Line_ID: k, AccountCode: l[0], Debit: l[1], Credit: l[2], ShortName: l[3] || l[0] }; if (l[4]) { o.FCDebit = l[4]; o.FCCredit = 0; o.FCCurrency = 'EUR'; } return o; }) }; });
  return { generator: 'erp/tools/gen_sapbc_open_fixture.js', note: 'TEST-SUPPLIED values, SAP Service Layer shape; not vendor examples', admin: { LocalCurrency: 'USD', Country: 'US', CompanyName: 'Test Co SAP' },
    keys: { ChartOfAccounts: 'Code', BusinessPartners: 'CardCode', Invoices: 'DocEntry', CreditNotes: 'DocEntry', PurchaseInvoices: 'DocEntry', PurchaseCreditNotes: 'DocEntry', HouseBankAccounts: 'AbsoluteEntry', Banks: 'BankCode', JournalEntries: 'JdtNum' }, sets: sets };
}
function bc() {
  var R = {}, e = 0;
  R['98'] = [{ 'LCY Code': 'USD', 'Amount Rounding Precision': 0.01 }]; R['79'] = [{ Name: 'Test Co BC', 'Country/Region Code': 'US' }];
  R['9'] = [{ Code: 'US', Name: 'United States', 'ISO Code': 'US' }, { Code: 'DE', Name: 'Germany', 'ISO Code': 'DE' }];
  R['15'] = ACC.map(function (a) { return { 'No.': a[0], Name: a[1], 'Account Type': 'Posting', 'Account Category': a[3] }; });
  R['92'] = [{ Code: 'CUST-DOM', 'Receivables Account': '1100' }]; R['93'] = [{ Code: 'VEND-DOM', 'Payables Account': '2000' }]; R['277'] = [{ Code: 'BANK-USD', 'G/L Account No.': '1000' }, { Code: 'BANK-EUR', 'G/L Account No.': '1010' }];
  R['18'] = []; R['23'] = []; Object.keys(BP).forEach(function (c) { var b = BP[c], o = { 'No.': c, Name: b[0], 'VAT Registration No.': 'TAX-' + c }; if (b[2]) { o.Address = b[2][0]; o.City = b[2][1]; o['Post Code'] = b[2][2]; o['Country/Region Code'] = b[2][3]; }
    if (b[1] === 'C') { o['Customer Posting Group'] = 'CUST-DOM'; R['18'].push(o); } else { o['Vendor Posting Group'] = 'VEND-DOM'; R['23'].push(o); } });
  R['17'] = []; J.forEach(function (j, i) { j[2].forEach(function (l) { R['17'].push({ 'Entry No.': ++e, 'G/L Account No.': l[0], 'Posting Date': j[0], 'Document No.': j[1], Amount: l[1] - l[2], 'Debit Amount': l[1], 'Credit Amount': l[2], 'Transaction No.': i + 1 }); }); });
  // customer / vendor ledgers. det: [entryNo, kind, date, amount, lcy]
  R['21'] = []; R['379'] = []; R['25'] = []; R['380'] = []; var dn = 0;
  function led(tab, dtab, who, no, bp, date, dtype, docno, cur, open, amt, lcy, apps) {
    var o = { 'Entry No.': no, 'Posting Date': date, 'Document Type': dtype, 'Document No.': docno, 'Currency Code': cur || '', Open: open };
    if (who === 'C') { o['Customer No.'] = bp; o['Customer Posting Group'] = 'CUST-DOM'; } else { o['Vendor No.'] = bp; o['Vendor Posting Group'] = 'VEND-DOM'; } R[tab].push(o);
    var link = who === 'C' ? 'Cust. Ledger Entry No.' : 'Vendor Ledger Entry No.', mk = function (kind, d, a, l) { var x = { 'Entry No.': ++dn, 'Entry Type': kind, 'Posting Date': d, 'Document Type': dtype, 'Document No.': docno, Amount: a, 'Amount (LCY)': l, 'Currency Code': cur || '', 'Excluded from calculation': false };
      x[link] = no; x[who === 'C' ? 'Customer No.' : 'Vendor No.'] = bp; R[dtab].push(x); };
    mk('Initial Entry', date, amt, lcy); (apps || []).forEach(function (a) { mk('Application', a[0], a[1], a[1]); });
  }
  // customers (open flag = as of the fixture's "now"; the witness cross-checks it)
  led('21', '379', 'C', 1, 'C1', '2026-02-15', 'Invoice', 'SI-097', '', false, 60, 60, [['2026-02-15', -60]]);
  led('21', '379', 'C', 2, 'C1', '2026-02-15', 'Credit Memo', 'SCN-097', '', false, -60, -60, [['2026-02-15', 60]]);
  led('21', '379', 'C', 3, 'C1', '2026-01-20', 'Invoice', 'SI-099', '', false, 250, 250, [['2026-02-01', -250]]);
  led('21', '379', 'C', 4, 'C1', '2026-02-01', 'Payment', 'RC-099', '', false, -250, -250, [['2026-02-01', 250]]);
  led('21', '379', 'C', 5, 'C1', '2026-02-01', 'Invoice', 'SI-101', '', true, 1000, 1000, [['2026-07-20', -400]]);
  led('21', '379', 'C', 6, 'C1', '2026-07-20', 'Payment', 'RC-101', '', false, -400, -400, [['2026-07-20', 400]]);
  led('21', '379', 'C', 7, 'C1', '2026-02-10', 'Invoice', 'SI-102', '', true, 500, 500, [['2026-03-01', -200]]);
  led('21', '379', 'C', 8, 'C1', '2026-03-01', 'Payment', 'RC-102', '', false, -200, -200, [['2026-03-01', 200]]);
  led('21', '379', 'C', 9, 'C2', '2026-03-05', 'Invoice', 'SI-103', 'EUR', true, 250, 270, []);
  led('21', '379', 'C', 10, 'C3', '2026-03-10', 'Invoice', 'SI-104', '', true, 80, 80, []);
  led('21', '379', 'C', 11, 'C1', '2026-04-01', 'Credit Memo', 'SCN-101', '', true, -100, -100, []);
  led('21', '379', 'C', 12, 'C1', '2026-04-15', 'Payment', 'RC-ACCT', '', true, -150, -150, []);
  led('21', '379', 'C', 13, 'C1', '2026-07-15', 'Invoice', 'SI-105', '', true, 40, 40, []);
  led('25', '380', 'V', 1, 'V1', '2026-02-05', 'Invoice', 'PI-201', '', true, -800, -800, []);
  led('25', '380', 'V', 2, 'V2', '2026-02-20', 'Invoice', 'PI-202', '', true, -600, -600, [['2026-03-20', 100]]);
  led('25', '380', 'V', 3, 'V2', '2026-03-20', 'Payment', 'PM-202', '', false, 100, 100, [['2026-03-20', -100]]);
  led('25', '380', 'V', 4, 'V1', '2026-04-05', 'Credit Memo', 'PCN-301', '', true, 50, 50, []);
  R['270'] = [{ 'No.': 'BANK1', Name: 'First Test Bank', 'Bank Account No.': 'ACC-1000', 'Bank Acc. Posting Group': 'BANK-USD', 'Transit No.': 'BR-001', 'SWIFT Code': 'FTBKUS33' },
    { 'No.': 'BANK2', Name: 'Euro Test Bank', 'Bank Account No.': 'ACC-1010-EUR', 'Bank Acc. Posting Group': 'BANK-EUR', 'Currency Code': 'EUR', 'Transit No.': 'BR-002', 'SWIFT Code': 'ETBKDEFF' }];
  var be = 0, bl = function (acct, date, doc, amt, lcy, cur) { R['271'].push({ 'Entry No.': ++be, 'Bank Account No.': acct, 'Posting Date': date, 'Document No.': doc, Amount: amt, 'Amount (LCY)': lcy, 'Currency Code': cur || '', Open: true }); };
  R['271'] = []; bl('BANK1', '2026-01-02', 'Capital', 5000, 5000); bl('BANK2', '2026-01-03', 'EUR bank opening', 290, 320, 'EUR'); bl('BANK1', '2026-02-01', 'Receipt SI-099', 250, 250); bl('BANK1', '2026-03-01', 'Receipt SI-102', 200, 200);
  bl('BANK1', '2026-04-15', 'On-account receipt C1', 150, 150); bl('BANK1', '2026-03-20', 'Payment PI-202', -100, -100); bl('BANK1', '2026-07-20', 'Receipt SI-101 part', 400, 400);
  return { generator: 'erp/tools/gen_sapbc_open_fixture.js', note: 'TEST-SUPPLIED values, BC table shape (field names from microsoft/BCApps via bc_model.mjs); not Microsoft demo data', today: '2026-11-10', rows: R };
}
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'sap_rows.json'), JSON.stringify(sap(), null, 1) + '\n'); fs.writeFileSync(path.join(OUT, 'bc_rows.json'), JSON.stringify(bc(), null, 1) + '\n');
console.log('§SBO-FIXTURE wrote ' + OUT + '/{sap_rows,bc_rows}.json');
