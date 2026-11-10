// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — open_balances.mjs: the OPEN BALANCES of a migration at the cut-over, for EVERY source form (Odoo today; nothing here knows a source system).
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §E3C-SPEC 1(d)+(e) (the method: §B3-SCOUT, iDempiere wiki "Establish Opening Balances") — Witness: W-OPEN-BALANCES
//   (erp/tests/witness_open_balances.js). READ THE LOG: §MIG-* lines.
// The book a source hands over may carry two optional sheets (migrate/workbook.mjs OPEN_HEADERS): I_GLJournal = the trial balance as ONE opening journal, the receivable / payable /
//   bank accounts routed to CLEARING accounts; I_Invoice = every open invoice and credit note as a ONE-line document on an Opening Charge whose account is that clearing account.
//   - problems(trx, open)     refused BEFORE anything runs: the cut-over period is not open (legacy's own gate), no organisation, another currency than the books'.
//   - prerequisites(trx, open) stage 1, through the model, only what is absent, each NAMED: the clearing accounts, the no-tax category + tax, the two Opening Charges and their
//                             C_Charge_Acct -> the clearing account's valid combination. That link is the proof: the journal debits AR Clearing with the receivable balance, every
//                             open invoice credits it through its charge -> zero when everything came across.
//   - complete(trx, open)     stage 2 (own transaction, after stage 1 is committed - the import processes look everything up by SQL): ImportGLJournal 220 -> Complete of the batch
//                             (legacy's import has no DocAction; Complete is the user's step) -> ImportInvoice 207 with DocAction CO -> verify().
//   - verify(trx, open)       §MIG-TB / §MIG-CLEAR / §MIG-OPEN from Fact_Acct and C_Invoice against the sheets; INCONCLUSIVE when nothing was judged; a difference is thrown, named.
// Nothing here INSERTs a document: rows go into the legacy import tables, the legacy import processes make and complete the documents, the documents post themselves.
// Deterministic: no clock, no random.
const GL = typeof window !== 'undefined' ? window : globalThis;
const REQ = GL.ModelTrade && GL.ModelLayer ? null : (await import('node:module')).createRequire(import.meta.url);
const MT = GL.ModelTrade || REQ('../model_trade.js');   // MAccount.get + the period gate (model_trade.js), the twin's ONE copy
const ML = GL.ModelLayer || REQ('../model_layer.js');   // save / newPO / processIt
const JOURNAL_PROCESS = 220, INVOICE_PROCESS = 207, BANKSTMT_PROCESS = 221;   // 221 = ImportBankStatement (§E3D-SPEC)
const BASE = { 'AR Invoice': 'ARI', 'AR Credit Memo': 'ARC', 'AP Invoice': 'API', 'AP CreditMemo': 'APC' };
const SIGN = { ARI: 1, ARC: -1, API: -1, APC: 1 };   // the document's effect on its control account, debit +

function say(trx, line) { if (trx && trx.say) trx.say(line); console.log(line); }
const tableOf = (name) => String(name).replace(/^\d\d/, '');
const cents = (v) => Math.round(Number(v || 0) * 100);
const money = (c) => (c / 100).toFixed(2);
function objs(sheet) { if (!sheet) return []; const H = sheet.rows[0]; return sheet.rows.slice(1).map((r) => { const o = {}; H.forEach((h, i) => { o[h] = r[i]; }); return o; }); }

// openOf(book, cfg) -> null (the book carries no open balances) | { journal[], invoices[], cfg, cutover, currency, baseTypes[] }
//   cfg = the converter's manifest: { clearing: { AR, AP, BANK }, charges: { AR, AP }, tax, cutover, currency }
export function openOf(book, cfg) {
  const find = (t) => (book || []).find((b) => tableOf(b.name) === t), j = find('I_GLJournal'), i = find('I_Invoice');
  const journal = objs(j), invoices = objs(i), statements = objs(find('I_BankStatement')), bankAccounts = objs(find('C_BankAccount'));   // §E3D-SPEC: the opening bank statements + the bank accounts they name
  if (!journal.length && !invoices.length && !statements.length) return null;
  const types = Array.from(new Set(invoices.map((r) => BASE[r.DocTypeName]).filter(Boolean)));
  return { journal, invoices, statements, bankAccounts, cfg: cfg || {}, cutover: String((cfg && cfg.cutover) || (journal[0] && journal[0].DateAcct) || (statements[0] && statements[0].StatementDate) || '').slice(0, 10), currency: (cfg && cfg.currency) || (journal[0] && journal[0].ISO_Code) || '',
    baseTypes: (journal.length ? ['GLJ'] : []).concat(types, statements.length ? ['CMB'] : []) };
}

export function problems(trx, open) {
  const out = [], C = Number(trx.env.client || 0), O = Number(trx.env.org || 0);
  if (!open) return out;
  if (!O) out.push('Open balances: log in with an organisation (not *): the opening journal and the open invoices belong to one.');
  const as = trx.q('SELECT a.c_acctschema_id AS id, c.iso_code AS iso, a.autoperiodcontrol AS auto FROM ad_clientinfo ci JOIN c_acctschema a ON a.c_acctschema_id=ci.c_acctschema1_id JOIN c_currency c ON c.c_currency_id=a.c_currency_id WHERE ci.ad_client_id=?', [C])[0];
  if (!as) { out.push('Open balances: this tenant has no accounting schema.'); return out; }
  if (open.currency && as.iso !== open.currency) out.push('Open balances: the source books are in ' + open.currency + ', this tenant\'s books are in ' + as.iso + ' — a currency change is not handled.');
  if (!open.cutover) out.push('Open balances: the export names no cut-over date.');
  else { const closed = open.baseTypes.filter((b) => !MT.periodOpen(trx, open.cutover, b, O));
    if (closed.length) out.push('Open balances: the period of the cut-over date ' + open.cutover + ' is not open for ' + closed.join(', ') + '. ' +
      (as.auto === 'Y' ? 'Untick "Automatic Period Control" on the Accounting Schema, then open' : 'Open') + ' that period (Calendar Year and Period → the period → Open/Close All), and refresh.'); }
  // legacy dates the journal BATCH today (MJournalBatch.beforeSave :948-961: DateDoc = today, DateAcct = DateDoc) and Complete tests that period too (MJournalBatch.prepareIt)
  const today = String(trx.env.date || '').slice(0, 10);
  if (open.journal.length && today && today !== open.cutover && !MT.periodOpen(trx, today, 'GLJ', O)) out.push('Open balances: the period of today (' + today + ') is not open for GLJ — the journal batch is dated today. ' +
    'Open that period too (create the calendar year first if today has no period).');
  const bad = open.invoices.filter((r) => !BASE[r.DocTypeName]).length; if (bad) out.push('Open balances: ' + bad + ' open document(s) name a document type this loader does not know.');
  return out;
}

// what the prerequisites step WOULD create now (for the summary) - the same test the step itself uses
function missing(trx, open) {
  const C = Number(trx.env.client || 0), cfg = open.cfg, need = [];
  const used = new Set(open.journal.map((r) => r.AccountValue)), clr = cfg.clearing || {};
  Object.keys(clr).forEach((k) => { const v = clr[k]; if (!v) return; const wanted = used.has(v) || ((k === 'AR' || k === 'AP') && open.invoices.length) || (k === 'BANK' && (open.statements || []).length);
    if (wanted && !trx.q('SELECT 1 AS x FROM c_elementvalue WHERE ad_client_id=? AND value=?', [C, v]).length) need.push({ kind: 'account', key: k, value: v }); });
  const bn = (cfg.charges || {}).BANK;   // §E3D-SPEC: the Opening Charge of the opening bank statements, on Bank Clearing
  if (bn && (open.statements || []).some((r) => r['C_Charge_ID>Name'] === bn) && !trx.q('SELECT 1 AS x FROM c_charge WHERE ad_client_id=? AND name=?', [C, bn]).length) need.push({ kind: 'charge', key: 'BANK', value: bn });
  if (open.invoices.length) {
    if (!trx.q('SELECT 1 AS x FROM c_tax WHERE ad_client_id=? AND taxindicator=?', [C, cfg.tax]).length) need.push({ kind: 'tax', value: cfg.tax });
    ['AR', 'AP'].forEach((k) => { const n = (cfg.charges || {})[k]; if (n && open.invoices.some((r) => r.ChargeName === n) && !trx.q('SELECT 1 AS x FROM c_charge WHERE ad_client_id=? AND name=?', [C, n]).length) need.push({ kind: 'charge', key: k, value: n }); });
  }
  return need;
}
export function willCreate(trx, open) { return open ? missing(trx, open).map((n) => (n.kind === 'account' ? 'account ' + n.value + ' (' + n.key + ' clearing)' : n.kind === 'tax' ? 'tax ' + n.value + ' (0 %, exempt) + its tax category' : 'charge "' + n.value + '" → ' + ((open.cfg.clearing || {})[n.key] || '?'))) : []; }

const NAMES = { AR: 'Opening Balance AR Clearing', AP: 'Opening Balance AP Clearing', BANK: 'Opening Balance Bank Clearing', INV: 'Opening Balance Inventory Clearing' };
const TYPES = { AR: 'A', AP: 'L', BANK: 'A', INV: 'A' };
const TAXCAT = 'Opening Balance (no tax)';

// stage 1: create what is absent, through the model (defaults, afterSave accounting rows) - returns the names created
export function prerequisites(trx, open) {
  if (!open) return [];
  const C = Number(trx.env.client || 0), cfg = open.cfg, made = [], need = missing(trx, open);
  if (!need.length) return made;
  const save = (table, values) => { const r = ML.save(trx, table, null, ML.newPO(trx, table, values)); if (!r.ok) throw new Error('Open balances: could not create ' + table + ' — ' + r.error); return r.row; };
  const el = trx.q("SELECT c_element_id AS id FROM c_element WHERE ad_client_id=? AND elementtype='A' AND isactive='Y' ORDER BY c_element_id", [C])[0];
  const as = trx.q('SELECT c_acctschema1_id AS id FROM ad_clientinfo WHERE ad_client_id=?', [C])[0];
  if (!el || !as) throw new Error('Open balances: this tenant has no account element / accounting schema.');
  const evId = {};
  need.filter((n) => n.kind === 'account').forEach((n) => { const r = save('c_elementvalue', { ad_org_id: 0, c_element_id: el.id, value: n.value, name: NAMES[n.key] || n.value, accounttype: TYPES[n.key] || 'A', accountsign: 'N', issummary: 'N',
    description: 'Clearing account of the opening balances (cut-over method): it ends at zero when every open item is in.' }); evId[n.key] = r.c_elementvalue_id; made.push('account ' + n.value); });
  const evOf = (k) => evId[k] || (trx.find('c_elementvalue', { ad_client_id: C, value: (cfg.clearing || {})[k] })[0] || {}).c_elementvalue_id;
  let taxCat = null;
  if (need.some((n) => n.kind === 'tax' || n.kind === 'charge')) {
    taxCat = trx.find('c_taxcategory', { ad_client_id: C, name: TAXCAT })[0] || save('c_taxcategory', { ad_org_id: 0, name: TAXCAT, isdefault: 'N', description: 'Open items brought in at the cut-over carry no tax: it was accounted for in the old system.' });
  }
  need.filter((n) => n.kind === 'tax').forEach((n) => { save('c_tax', { ad_org_id: 0, name: TAXCAT, taxindicator: n.value, rate: 0, istaxexempt: 'Y', c_taxcategory_id: taxCat.c_taxcategory_id, validfrom: '1970-01-01 00:00:00',
    isdocumentlevel: 'Y', issummary: 'N', requirestaxcertificate: 'N', sopotype: 'B', isdefault: 'N', issalestax: 'N' }); made.push('tax ' + n.value); });
  need.filter((n) => n.kind === 'charge').forEach((n) => {
    const ev = evOf(n.key); if (!ev) throw new Error('Open balances: the clearing account ' + (cfg.clearing || {})[n.key] + ' is not there for the charge "' + n.value + '".');
    // the valid combination FIRST: the charge's accounting row (made by MCharge.afterSave) is then pointed at a row that already exists in this transaction
    const vc = MT.MAccount_get(trx, C, as.id, { AD_Org_ID: 0, Account_ID: ev, C_SubAcct_ID: 0, M_Product_ID: 0, C_BPartner_ID: 0, AD_OrgTrx_ID: 0, C_LocFrom_ID: 0, C_LocTo_ID: 0, C_SalesRegion_ID: 0, C_Project_ID: 0, C_Campaign_ID: 0,
      C_Activity_ID: 0, User1_ID: 0, User2_ID: 0, UserElement1_ID: 0, UserElement2_ID: 0 });
    const ch = save('c_charge', { ad_org_id: 0, name: n.value, chargeamt: 0, issametax: 'N', issamecurrency: 'N', istaxincluded: 'N', c_taxcategory_id: taxCat.c_taxcategory_id,
      description: n.key === 'BANK' ? 'Opening bank balances brought in at the cut-over; its account is the BANK clearing account.' : 'Open ' + (n.key === 'AR' ? 'customer' : 'vendor') + ' items brought in at the cut-over; its account is the ' + n.key + ' clearing account.' });
    const ca = trx.find('c_charge_acct', { c_charge_id: ch.c_charge_id, c_acctschema_id: as.id })[0];
    if (!vc || !ca) throw new Error('Open balances: the charge "' + n.value + '" got no accounting row (C_Charge_Acct) or no valid combination.');
    trx.update('c_charge_acct', ca, { ch_expense_acct: vc.c_validcombination_id });
    made.push('charge "' + n.value + '" → ' + (cfg.clearing || {})[n.key]);
  });
  say(trx, '§MIG-PREREQ created=' + made.length + ' ' + JSON.stringify(made));
  return made;
}

// verify(trx, open, done) - the books against the sheets. done = { journals: [gl_journal_id], invoices: [c_invoice_id] } (what stage 2 just made)
export function verify(trx, open, done) {
  const C = Number(trx.env.client || 0), cfg = open.cfg, clr = cfg.clearing || {}, out = { judged: 0, failed: [], lines: [] };
  const line = (l) => { out.lines.push(l); say(trx, l); }, judge = (ok, why) => { out.judged++; if (!ok) out.failed.push(why); };
  // read through the transaction (trx.find / trx.get see the rows this stage has just written; plain SQL would not)
  const evVal = {}, valOf = (id) => (id in evVal ? evVal[id] : (evVal[id] = (trx.get('c_elementvalue', id) || {}).value));
  const fact = (table, ids) => { const m = {}; ids.forEach((id) => trx.find('fact_acct', { ad_table_id: table, record_id: id }).forEach((f) => { const v = valOf(f.account_id); m[v] = (m[v] || 0) + cents(f.amtacctdr) - cents(f.amtacctcr); })); return m; };
  // TB: the journal's books, account by account == the journal sheet
  const want = {}; open.journal.forEach((r) => { want[r.AccountValue] = (want[r.AccountValue] || 0) + cents(r.AmtSourceDr) - cents(r.AmtSourceCr); });
  const got = fact(224, done.journals), accts = Array.from(new Set(Object.keys(want).concat(Object.keys(got)))).sort();
  const off = accts.filter((a) => (want[a] || 0) !== (got[a] || 0));
  if (open.journal.length) { judge(off.length === 0, 'trial balance: ' + off.slice(0, 5).map((a) => a + ' books ' + money(got[a] || 0) + ' sheet ' + money(want[a] || 0)).join('; '));
    line('§MIG-TB accounts=' + accts.length + ' differing=' + off.length + ' sum=' + money(accts.reduce((n, a) => n + (got[a] || 0), 0)) + ' verdict=' + (off.length ? 'FAIL' : 'PASS')); }
  else line('§MIG-TB verdict=INCONCLUSIVE (no opening journal in the book)');
  // CLEAR: journal + open documents together on each clearing account; AR / AP must equal what the converter said it could not bring in (cfg.left, 0 when everything came)
  const inv = fact(318, done.invoices), stm = fact(392, done.statements || []), bal = (a) => (got[a] || 0) + (inv[a] || 0) + (stm[a] || 0), left = cfg.left || {};   // 392 = C_BankStatement
  ['AR', 'AP'].forEach((k) => { if (!clr[k] || !(clr[k] in want)) { line('§MIG-CLEAR ' + k + ' verdict=INCONCLUSIVE (no ' + k + ' balance in the journal)'); return; }
    const b = bal(clr[k]), exp = cents(left[k] || 0); judge(b === exp, k + ' clearing ' + clr[k] + ' is ' + money(b) + ', expected ' + money(exp));
    line('§MIG-CLEAR ' + k + ' account=' + clr[k] + ' balance=' + money(b) + ' expected=' + money(exp) + ' verdict=' + (b === exp ? 'PASS' : 'FAIL')); });
  // BANK (§E3D-SPEC): a book with opening bank statements is judged like AR / AP - Bank Clearing, journal + statements together, ends at what the converter could not bring in (cfg.left.BANK, 0.00 when every
  //   cash account had a bank / cash journal); a book without any (other sources) keeps the old statement of fact
  if ((open.statements || []).length && clr.BANK) {
    if (!(clr.BANK in want)) line('§MIG-CLEAR BANK verdict=INCONCLUSIVE (no bank balance in the journal)');
    else { const b = bal(clr.BANK), exp = cents(left.BANK || 0); judge(b === exp, 'BANK clearing ' + clr.BANK + ' is ' + money(b) + ', expected ' + money(exp));
      line('§MIG-CLEAR BANK account=' + clr.BANK + ' balance=' + money(b) + ' expected=' + money(exp) + ' verdict=' + (b === exp ? 'PASS' : 'FAIL')); }
  } else if (clr.BANK && clr.BANK in want) line('§MIG-CLEAR BANK account=' + clr.BANK + ' balance=' + money(bal(clr.BANK)) + ' state=OPEN (this book carries no opening bank statement: the bank balance waits on this account)');
  // BANK per bank account: the statement is Completed and Posted, the bank account exists with its bank, and the statement's posted amount on the TENANT's bank asset account == the sheet row
  if ((open.statements || []).length) {
    const as = trx.q('SELECT c_acctschema1_id AS id FROM ad_clientinfo WHERE ad_client_id=?', [C])[0] || {}, wantB = {}, gotB = {}, bad = [], bankOf = {}, ba = {};
    open.bankAccounts.forEach((r) => { bankOf[r.AccountNo] = r['C_Bank_ID>Name']; });
    open.statements.forEach((r) => { wantB[r.BankAccountNo] = (wantB[r.BankAccountNo] || 0) + cents(r.StmtAmt); });
    (done.statements || []).forEach((id) => { const st = trx.get('c_bankstatement', id) || {}, acc = trx.get('c_bankaccount', st.c_bankaccount_id) || {}, no = acc.accountno;
      const ac = trx.find('c_bankaccount_acct', { c_bankaccount_id: st.c_bankaccount_id, c_acctschema_id: as.id })[0] || {}, vc = trx.get('c_validcombination', ac.b_asset_acct) || {}, asset = valOf(vc.account_id);
      let net = 0; trx.find('fact_acct', { ad_table_id: 392, record_id: id }).forEach((f) => { if (valOf(f.account_id) === asset && String(f.c_acctschema_id) === String(as.id)) net += cents(f.amtacctdr) - cents(f.amtacctcr); });
      gotB[no] = (gotB[no] || 0) + net; ba[no] = { asset, bal: cents(acc.currentbalance), bank: (trx.get('c_bank', acc.c_bank_id) || {}).name };
      if (st.docstatus !== 'CO' || st.posted !== 'Y') bad.push(String(st.name || id) + ' ' + st.docstatus + ' posted=' + st.posted); });
    const nos = Array.from(new Set(Object.keys(wantB).concat(Object.keys(gotB)))).sort(), off = nos.filter((n) => (wantB[n] || 0) !== (gotB[n] || 0));
    const noBank = nos.filter((n) => !ba[n] || !ba[n].bank || (bankOf[n] != null && ba[n].bank !== String(bankOf[n]).slice(0, 60))), balOff = nos.filter((n) => ba[n] && ba[n].bal !== (wantB[n] || 0));
    judge(off.length === 0, 'bank asset account: ' + off.slice(0, 5).map((n) => n + ' books ' + money(gotB[n] || 0) + ' sheet ' + money(wantB[n] || 0)).join('; '));
    judge(bad.length === 0 && (done.statements || []).length === open.statements.length, 'bank statements: ' + (done.statements || []).length + ' of ' + open.statements.length + ' made; not Completed / unposted: ' + bad.slice(0, 5).join('; '));
    judge(noBank.length === 0 && balOff.length === 0, 'bank accounts: ' + noBank.concat(balOff).slice(0, 5).join('; ') + ' (no bank, or CurrentBalance not the sheet amount)');
    line('§MIG-BANK statements=' + (done.statements || []).length + '/' + open.statements.length + ' accounts=' + nos.length + ' differing=' + off.length + ' not_ok=' + bad.length + ' bank_missing=' + noBank.length + ' balance_off=' + balOff.length +
      ' ' + nos.map((n) => n + '@' + ((ba[n] || {}).asset || '?') + '=' + money(gotB[n] || 0)).join(',') + ' verdict=' + (off.length || bad.length || noBank.length || balOff.length || (done.statements || []).length !== open.statements.length ? 'FAIL' : 'PASS'));
  }
  // OPEN: per business partner, the documents' open amount == the sheet (signed: invoice +, credit memo -; per side)
  const wantP = {}; open.invoices.forEach((r) => { const b = BASE[r.DocTypeName], k = (b[1] === 'R' ? 'AR' : 'AP') + '|' + r.BPartnerValue; wantP[k] = (wantP[k] || 0) + cents(r.PriceActual) * cents(r.QtyOrdered) / 100 * SIGN[b]; });
  const gotP = {}, bad = [];
  done.invoices.forEach((id) => { const i = trx.get('c_invoice', id) || {}, b = (trx.get('c_doctype', i.c_doctype_id) || {}).docbasetype || '', bp = (trx.get('c_bpartner', i.c_bpartner_id) || {}).value;
    const k = (b[1] === 'R' ? 'AR' : 'AP') + '|' + bp; gotP[k] = (gotP[k] || 0) + cents(i.grandtotal) * (SIGN[b] || 0);
    if (i.docstatus !== 'CO' || i.ispaid === 'Y' || i.posted !== 'Y') bad.push(i.documentno + ' ' + i.docstatus + ' paid=' + i.ispaid + ' posted=' + i.posted); });
  const ps = Array.from(new Set(Object.keys(wantP).concat(Object.keys(gotP)))).sort(), offP = ps.filter((p) => (wantP[p] || 0) !== (gotP[p] || 0));
  if (open.invoices.length) { judge(offP.length === 0, 'open items: ' + offP.slice(0, 5).map((p) => p + ' books ' + money(gotP[p] || 0) + ' sheet ' + money(wantP[p] || 0)).join('; '));
    judge(bad.length === 0 && done.invoices.length === open.invoices.length, 'open documents: ' + done.invoices.length + ' of ' + open.invoices.length + ' made; not Completed / paid / unposted: ' + bad.slice(0, 5).join('; '));
    line('§MIG-OPEN documents=' + done.invoices.length + '/' + open.invoices.length + ' partners=' + ps.length + ' differing=' + offP.length + ' not_ok=' + bad.length +
      ' AR=' + money(ps.filter((p) => /^AR/.test(p)).reduce((n, p) => n + (gotP[p] || 0), 0)) + ' AP=' + money(ps.filter((p) => /^AP/.test(p)).reduce((n, p) => n + (gotP[p] || 0), 0)) + ' verdict=' + (offP.length || bad.length || done.invoices.length !== open.invoices.length ? 'FAIL' : 'PASS')); }
  else line('§MIG-OPEN verdict=INCONCLUSIVE (no open document in the book)');
  line('§MIG-VERIFY verdict=' + (!out.judged ? 'INCONCLUSIVE' : out.failed.length ? 'FAIL' : 'PASS') + ' judged=' + out.judged + ' failed=' + out.failed.length);
  return out;
}

// stage 2: the legacy import processes make and complete the documents, then the books are checked. Returns the text for the user ('' = nothing to do).
export function complete(trx, AP, open) {
  const C = Number(trx.env.client || 0), O = Number(trx.env.org || 0);
  const pend = (t, id) => trx.find(t, { ad_client_id: C }).filter((x) => String(x.i_isimported) !== 'Y').map((x) => x[id]);
  const pj = pend('i_gljournal', 'i_gljournal_id'), pi = pend('i_invoice', 'i_invoice_id'), pb = pend('i_bankstatement', 'i_bankstatement_id');
  if (!pj.length && !pi.length && !pb.length) { say(trx, '§MIG-OPENBAL stage=2 nothing to import (no pending I_GLJournal / I_Invoice row): not judged'); return ''; }
  const need = (cls, id) => { if (!AP.JAVA || !AP.JAVA[cls]) throw new Error('Open balances need ' + cls.split('.').pop() + ' (AD_Process ' + id + '), which this host has not loaded.'); };
  const firstErr = (t, ids, idc) => { const b = ids.map((id) => trx.get(t, id)).filter((x) => x && String(x.i_isimported) !== 'Y'); return b.length ? b.length + ' row(s) refused (' + String(b[0].i_errormsg || '').trim() + ')' : ''; };
  const done = { journals: [], invoices: [], statements: [] }, msg = [];
  if (pj.length) {
    need('org.compiere.process.ImportGLJournal', JOURNAL_PROCESS);
    const as = trx.q('SELECT c_acctschema1_id AS id FROM ad_clientinfo WHERE ad_client_id=?', [C])[0];
    const r = AP.runInTrx(trx, JOURNAL_PROCESS, { params: { AD_Client_ID: C, AD_Org_ID: O, C_AcctSchema_ID: as && as.id, IsValidateOnly: 'N', IsImportOnlyNoErrors: 'Y', DeleteOldImported: 'N' } });
    const e = firstErr('i_gljournal', pj); if (!(r && r.ok) || e) throw new Error('The opening journal was not imported: ' + [e, r && !r.ok ? r.summary : ''].filter(Boolean).join(' — ') + '. The masters are loaded; fix the rows and run Import GL Journal again.');
    const rows = pj.map((id) => trx.get('i_gljournal', id)), batches = Array.from(new Set(rows.map((x) => x.gl_journalbatch_id)));
    done.journals = Array.from(new Set(rows.map((x) => x.gl_journal_id)));
    batches.forEach((b) => { const p = ML.processIt(trx, 'gl_journalbatch', b, 'CO'), st = String((trx.get('gl_journalbatch', b) || {}).docstatus);
      if (!(p && p.ok) || st !== 'CO') throw new Error('The opening journal was imported but not Completed (' + ((p && p.msg) || st) + '). Open GL Journal, fix it and Complete it.'); });
    say(trx, '§MIG-OPENBAL journal rows=' + pj.length + ' batches=' + batches.length + ' journals=' + done.journals.length + ' completed=' + batches.length);
    msg.push('opening journal ' + pj.length + ' line(s)');
  }
  if (pi.length) {
    need('org.compiere.process.ImportInvoice', INVOICE_PROCESS);
    const r = AP.runInTrx(trx, INVOICE_PROCESS, { params: { AD_Client_ID: C, AD_Org_ID: O, DocAction: 'CO', DeleteOldImported: 'N' } });
    const e = firstErr('i_invoice', pi); if (!(r && r.ok) || e) throw new Error('The open invoices were not imported: ' + (e || (r && r.summary) || 'Import Invoice refused') + '. Fix the rows and run Import Invoice again.');
    done.invoices = Array.from(new Set(pi.map((id) => trx.get('i_invoice', id).c_invoice_id)));
    say(trx, '§MIG-OPENBAL invoices rows=' + pi.length + ' documents=' + done.invoices.length);
    msg.push(done.invoices.length + ' open document(s)');
  }
  if (pb.length) {   // §E3D-SPEC: the opening bank balance as ONE statement per bank account (ImportBankStatement 221 makes it Drafted; Complete is the user's step, as for the journal)
    need('org.compiere.process.ImportBankStatement', BANKSTMT_PROCESS);
    const r = AP.runInTrx(trx, BANKSTMT_PROCESS, { params: { AD_Client_ID: C, AD_Org_ID: O, C_BankAccount_ID: 0, DeleteOldImported: 'N' } });
    const e = firstErr('i_bankstatement', pb); if (!(r && r.ok) || e) throw new Error('The opening bank statements were not imported: ' + (e || (r && r.summary) || 'Import Bank Statement refused') + '. Fix the rows and run Import Bank Statement again.');
    done.statements = Array.from(new Set(pb.map((id) => trx.get('i_bankstatement', id).c_bankstatement_id)));
    done.statements.forEach((id) => { const p = ML.processIt(trx, 'c_bankstatement', id, 'CO'), st = String((trx.get('c_bankstatement', id) || {}).docstatus);
      if (!(p && p.ok) || st !== 'CO') throw new Error('The opening bank statement was imported but not Completed (' + ((p && p.msg) || st) + '). Open Bank Statement, fix it and Complete it.'); });
    say(trx, '§MIG-OPENBAL statements rows=' + pb.length + ' statements=' + done.statements.length + ' completed=' + done.statements.length);
    msg.push(done.statements.length + ' opening bank statement(s)');
  }
  if (open) { const v = verify(trx, open, done); if (v.failed.length) throw new Error('The open balances were loaded but the books do not match the source: ' + v.failed.join(' · ')); msg.push(v.judged ? 'books checked against the source (' + v.judged + ' checks)' : 'books not checked'); }
  return 'Open balances completed: ' + msg.join(', ') + '.';
}
