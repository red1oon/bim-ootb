// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-ERP-FIRST-SETUP — the "set up a brand-new ERP from scratch" journey a first-time Odoo / iDempiere user
//   expects, EXECUTED step by step in a real headless browser (software rendering, --disable-gpu) over the served
//   bundle. Spec + the checklist this judges: bim-compiler prompts/ERP_FIRST_SETUP_GUIDE.md §FS1 (S01..S26).
//   THE ISSUE this test proves/disproves, per step: can a new user do THIS step today, measured by a value
//   (record count, option count, §-line, status text) — never by a screenshot. Each step prints exactly one
//     §FIRST-SETUP step=Sxx verdict=VERIFIED|GAP|INCONCLUSIVE claim="…" evidence=…
//   and is compared with the spec's pinned EXPECT verdict. A step that changed either way prints DRIFT and the
//   run exits 1 — so a fixed gap and a regressed step are both LOUD (PRIMAL LAW §4: a vacuous population prints
//   INCONCLUSIVE, never VERIFIED).
// §-log first — READ tests/poc_erp_first_setup_live.log (verdicts) and tests/poc_erp_first_setup_live.page.log
//   (every console line the page printed) before any conclusion. Exit code is not evidence.
// Run:  node tests/poc_erp_first_setup_live.js        (cwd = bim-ootb/erp; serves the REPO ROOT so ../common resolves)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const REPO = path.join(__dirname, '..', '..');
const LOGF = path.join(__dirname, 'poc_erp_first_setup_live.log');
const PAGELOGF = path.join(__dirname, 'poc_erp_first_setup_live.page.log');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream',
  '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.zip': 'application/zip' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(REPO, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': buf.length }); res.end(buf);
  });
});

// The spec's pinned verdicts (ERP_FIRST_SETUP_GUIDE.md §FS1 "Exp." column). V/G/I. Change ONLY with the spec.
const EXPECT = { S01: 'V', S02: 'V', S03: 'V', S04: 'V', S05: 'V', S06: 'V', S07: 'V', S08: 'G', S09: 'G', S10: 'V',
  S11: 'V', S11b: 'G', S12: 'V', S13: 'V', S14: 'V', S15: 'V', S16: 'V', S17: 'V', S18: 'V', S19: 'V', S20: 'V', S21: 'V',
  S22: 'V', S23: 'V', S24: 'G', S24b: 'G', S25a: 'V', S25b: 'G', S26: 'G' };
// FIX-A (§FS2) flips S08 + S09 to V. The witness reads which genesis it is judging from the served file itself.
// FS-1 (§FS2c) pinned S07 + S15 to V: the born tenant carries MSetup's 42 doc types (MSetup.java:710-831).
// FS-5 (§FS2d) pinned S14 to V: FK pickers carry MRole.addAccessSQL's client clause (MLookupFactory.java:270).
// FS-6 (§FS2e) pinned S17 to V: CalloutOrder.product derives price/UOM/tax on a session-created order, by value.
// FS-7 (§FS2f) pinned S20 to V: a session-typed order's Complete runs MOrder.completeIt's fan-out rule (two arms).
// FS-2/3/4 (§FS2g) pinned S04, S06, S12, S13 to V: currency choice (MYR picked + asserted), 12 periods, tax category, payment term.

const OUT = [];
const say = (s) => { OUT.push(s); console.log(s); };
const RES = [];
function step(id, verdict, claim, evidence) {
  const v = { V: 'VERIFIED', G: 'GAP', I: 'INCONCLUSIVE' }[verdict];
  RES.push({ id, verdict, claim, evidence });
  say('§FIRST-SETUP step=' + id + ' verdict=' + v + ' claim="' + claim + '" evidence=' + String(evidence).replace(/\s+/g, ' ').slice(0, 420));
}

const PAGELOG = [], ERRS = [];
const since = (n, re) => PAGELOG.slice(n).filter(l => re.test(l));
const last = (n, re) => since(n, re).pop() || '';

async function q(page, sql) {
  return page.evaluate(s => { try { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; } catch (e) { return 'ERR ' + e.message; } }, sql);
}
async function one(page, sql) { const r = await q(page, sql); return Array.isArray(r) && r.length ? r[0][0] : r; }
async function status(page) { return page.$eval('#idmp-status', e => e.innerText).catch(() => ''); }
async function opts(page, col) {
  return page.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', o => o.map(x => ({ v: x.value, t: x.text }))).catch(() => []);
}
async function openWin(page, base, login, win) {
  await page.goto(base + '/idempiere.html?login=' + encodeURIComponent(login) + '&window=' + win, { waitUntil: 'load' });
  await page.waitForSelector('#idmp-toolbar button[title^="New record"]', { timeout: 20000 });
  await page.waitForTimeout(900);
}
async function clickNew(page) {
  await page.click('#idmp-toolbar button[title^="New record"]');
  await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 });
  await page.waitForTimeout(700);
}
async function save(page) { await page.click('#idmp-toolbar button[title^="Save"]'); await page.waitForTimeout(1400); }
async function setSel(page, col, val) { await page.selectOption('#idmp-inline-mount select[data-col="' + col + '"]', String(val)); await page.waitForTimeout(250); }
async function fillBlur(page, col, val) {
  const loc = page.locator('#idmp-inline-mount input[data-col="' + col + '"]').first();
  await loc.fill(String(val)); await loc.blur().catch(() => {}); await page.waitForTimeout(250);
}
const recCount = (s) => { const m = /(\d+) records|Record \d+ of (\d+)/.exec(s || ''); return m ? Number(m[1] || m[2]) : (/0 records/.test(s) ? 0 : null); };
const tipOf = (page, table, id) => page.evaluate(([t, i]) => new Promise(res => {
  const c = window.__crud; if (!c || !c.readTip) return res('no-crud');
  const f = () => { try { res(c.readTip(t, i)); } catch (e) { res('ERR ' + e.message); } };
  if (typeof c.withSidecar === 'function') c.withSidecar(f); else f();
}), [table, id]);

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });   // software rendering ONLY
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('console', m => PAGELOG.push(m.text()));
  page.on('pageerror', e => { ERRS.push(String(e)); PAGELOG.push('PAGEERR ' + e); });
  page.on('dialog', async d => { PAGELOG.push('DIALOG ' + d.message()); await d.accept(); });
  const seedBytes = { n: null };
  page.on('response', r => { if (/\/erp\/ad_seed\.db/.test(r.url())) seedBytes.n = Number(r.headers()['content-length'] || 0) || null; });
  const genesisSrc = fs.readFileSync(path.join(REPO, 'erp', 'genesis.js'), 'utf8');
  const fixA = /FIX-A/.test(genesisSrc);
  say('§W-ERP-FIRST-SETUP start served=' + REPO + ' genesis FIX-A=' + (fixA ? 'present' : 'absent') + ' gpu=disabled');
  if (fixA) { EXPECT.S08 = 'V'; EXPECT.S09 = 'V'; }
  const fixB = /FS2 FIX-B/.test(fs.readFileSync(path.join(REPO, 'erp', 'idempiere.html'), 'utf8'));
  say('§W-ERP-FIRST-SETUP trial-balance FIX-B=' + (fixB ? 'present' : 'absent'));
  if (fixB) EXPECT.S24 = 'V';

  // ── S01 first load ───────────────────────────────────────────────────────────────────────────────────────────
  try {
    await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
    await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
    seedBytes.n = null;
    const n0 = PAGELOG.length;
    await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
    const boot = last(n0, /§IDEMPIERE boot db=/);
    step('S01', /db=network/.test(boot) && seedBytes.n > 1e6 ? 'V' : 'I', 'a cold first load fetches the ERP data file and boots',
      'seedBytes=' + seedBytes.n + ' (' + (seedBytes.n / 1048576).toFixed(1) + ' MiB) ' + boot);
  } catch (e) { step('S01', 'I', 'first load', 'harness: ' + e.message); }

  // ── S02 login model ──────────────────────────────────────────────────────────────────────────────────────────
  try {
    await page.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 20000 });
    const tenants = await page.$$eval('#idmp-login-clients .nm', e => e.map(x => x.textContent.trim()));
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('System'))");
    await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
    const users = await page.$$eval('#idmp-login-users .nm', e => e.map(x => x.textContent.trim()));
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('System'))");
    await page.waitForSelector('#idmp-login-step2:visible', { timeout: 8000 });
    const step2 = (await page.$eval('#idmp-login-step2', e => e.innerText)).replace(/\s+/g, ' ');
    step('S02', tenants.length >= 2 && users.length >= 1 && /ROLE/i.test(step2) ? 'V' : 'G',
      'login walks tenant -> user -> role/organisation', 'tenants=' + tenants.length + '[' + tenants.join(',') + '] users(System)=' + users.length + ' step2="' + step2.slice(0, 120) + '"');
  } catch (e) { step('S02', 'I', 'login model', 'harness: ' + e.message); }

  // ── S03..S07 create a new company (System → Initial Tenant Setup) ──────────────────────────────────────────────
  let CID = null;
  const NAME = 'FirstCo', ADMIN = 'owner';
  try {
    await page.click('#idmp-login-ok');
    await page.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0, null, { timeout: 10000 });
    await page.evaluate(() => document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(r => { if (!r.parentElement.classList.contains('open')) r.click(); }));
    await page.click("#idmp-tree .idmp-row.leaf:has(.nm:text-is('Initial Tenant Setup'))", { timeout: 6000 });
    await page.waitForSelector('[data-genesis-create]', { timeout: 8000 });
    const ccy = await page.$$eval('.idmp-procpane select option', o => o.map(x => x.text));
    await page.fill('[data-genesis-name]', NAME); await page.fill('[data-genesis-admin]', ADMIN);
    // FS-3: pick a NON-default currency so the run proves the choice is carried, not just listed.
    const PICK = Number(await one(page, "SELECT C_Currency_ID FROM C_Currency WHERE ISO_Code='MYR' AND IsActive='Y'"));
    await page.selectOption('[data-genesis-currency]', String(PICK)).catch(() => {});
    const activeCcy = Number(await one(page, "SELECT COUNT(*) FROM C_Currency WHERE IsActive='Y'"));
    const n0 = PAGELOG.length;
    await page.click('[data-genesis-create]');
    await page.waitForSelector('[data-genesis-enter]', { timeout: 25000 });
    CID = Number(await one(page, "SELECT AD_Client_ID FROM AD_Client WHERE Name='" + NAME + "'"));
    const created = last(n0, /§W-GENESIS-SYSADMIN-LIVE created client=/);
    await page.click('[data-genesis-enter]');
    await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
    const users = await page.$$eval('#idmp-login-users .nm', e => e.map(x => x.textContent.trim()));
    step('S03', CID >= 17 && users.indexOf(ADMIN) >= 0 ? 'V' : 'G', 'System -> Initial Tenant Setup -> name + admin -> a new, enterable company',
      'client=' + CID + ' ' + created + ' enterUsers=[' + users.join(',') + ']');
    const asCcy = Number(await one(page, 'SELECT C_Currency_ID FROM C_AcctSchema WHERE AD_Client_ID=' + CID));
    const plCcy = Number(await one(page, 'SELECT C_Currency_ID FROM M_PriceList WHERE AD_Client_ID=' + CID));
    step('S04', ccy.length > 1 && ccy.length === activeCcy && PICK > 0 && asCcy === PICK && plCcy === PICK ? 'V' : 'G', 'the setup form lets the user pick the company currency (and the pick is used)',
      'currencyOptions=' + ccy.length + ' (oracle active C_Currency=' + activeCcy + ') picked=MYR(' + PICK + ') acctSchemaCcy=' + asCcy + ' priceListCcy=' + plCcy + ' first=[' + ccy.slice(0, 3).join(' | ') + ']');
    const coa = Number(await one(page, 'SELECT COUNT(*) FROM C_ElementValue WHERE AD_Client_ID=' + CID));
    step('S05', coa === 311 ? 'V' : (coa ? 'G' : 'I'), 'the new company has the iDempiere default chart of accounts', 'C_ElementValue=' + coa);
    const per = await q(page, 'SELECT p.Name, p.StartDate, p.EndDate FROM C_Period p WHERE p.AD_Client_ID=' + CID + ' ORDER BY p.StartDate');
    const yr = await one(page, 'SELECT FiscalYear FROM C_Year WHERE AD_Client_ID=' + CID);
    const thisYear = String(new Date().getFullYear());
    const yy = thisYear.slice(2);
    const ends = Array.isArray(per) && per.length === 12 && per[0][0] === 'Jan-' + yy && per[0][1] === thisYear + '-01-01' && per[0][2] === thisYear + '-01-31' &&
      per[11][0] === 'Dec-' + yy && per[11][1] === thisYear + '-12-01' && per[11][2] === thisYear + '-12-31';
    step('S06', Array.isArray(per) && per.length === 12 && String(yr) === thisYear && ends ? 'V' : 'G',
      'a calendar with 12 monthly periods for the current year (MYear.java:250)', 'year=' + yr + ' (today ' + thisYear + ') periods=' + (Array.isArray(per) ? per.length : per) + ' ' + JSON.stringify(per).slice(0, 120));
    const dts = await q(page, 'SELECT DocBaseType FROM C_DocType WHERE AD_Client_ID=' + CID);
    const dbt = Array.isArray(dts) ? dts.map(r => r[0]) : [];
    const need = ['SOO', 'POO', 'MMS', 'MMR', 'ARI', 'API', 'ARR', 'APP', 'GLJ'];
    const missing = need.filter(x => dbt.indexOf(x) < 0);
    // BY VALUE: MSetup.java:710-831 makes exactly 42 doc types (spec §FS2c) — not "≥ 1", so a partial port fails.
    step('S07', missing.length === 0 && dbt.length === 42 ? 'V' : 'G', 'document types for orders, shipments, receipts, invoices, payments, journals exist (MSetup: 42)',
      'docTypes=' + dbt.length + ' (oracle 42) [' + dbt.join(',') + '] missing=[' + missing.join(',') + ']');
  } catch (e) { step('S03', 'I', 'create a new company', 'harness: ' + e.message); }

  // ── S08 + S10 own org offered; create a customer ──────────────────────────────────────────────────────────────
  const HQ = CID ? await one(page, 'SELECT AD_Org_ID FROM AD_Org WHERE AD_Client_ID=' + CID + ' ORDER BY AD_Org_ID LIMIT 1') : null;
  async function createBP(kind, value, name) {
    await openWin(page, base, ADMIN, 123);
    const before = recCount(await status(page));
    await clickNew(page);
    const orgs = await opts(page, 'ad_org_id');
    const own = orgs.find(o => String(o.v) === String(HQ));
    const grp = (await opts(page, 'c_bp_group_id')).find(o => /\(\d+\)$/.test(o.t) && Number(/\((\d+)\)$/.exec(o.t)[1]) >= CID * 100000);
    await setSel(page, 'ad_org_id', own ? own.v : '0');
    if (grp) await setSel(page, 'c_bp_group_id', grp.v);
    await fillBlur(page, 'value', value); await fillBlur(page, 'name', name);
    await page.check('#idmp-inline-mount input[data-col="' + kind + '"]');
    const n0 = PAGELOG.length; await save(page);
    const gridIds = await page.$$eval('.idmp-grid tbody tr[data-ad-record]', e => e.map(x => x.getAttribute('data-ad-record')));
    return { before, after: recCount(await status(page)), gridIds, own: !!own, orgN: orgs.length, grp: grp ? grp.t : null,
      val: last(n0, /§CRUD validate key=c_bpartner/), per: last(n0, /§CRUD-PERSIST key=c_bpartner/) };
  }
  try {
    const c = await createBP('iscustomer', 'C-001', 'Acme Retail Sdn Bhd');
    step('S08', c.own ? 'V' : 'G', 'the new company\'s own organization is offered on a new record', 'HQ=' + HQ + ' inOrgPicker=' + c.own + ' orgOptions=' + c.orgN);
    step('S10', /verb=create ok/.test(c.val) && c.per && c.after === (c.before || 0) + 1 ? 'V' : 'G',
      'create a customer in the new company (org ' + (c.own ? 'HQ' : '*') + ')', 'group=' + c.grp + ' ' + c.val.slice(0, 80) + ' persist=' + !!c.per + ' records ' + c.before + '->' + c.after + ' gridIds=[' + c.gridIds.join(',') + ']');
    const v = await createBP('isvendor', 'V-001', 'Kedai Bekalan Sdn Bhd');
    const dup = v.gridIds.filter((x, i, a) => a.indexOf(x) !== i);
    step('S11', /verb=create ok/.test(v.val) && v.per ? 'V' : 'G',
      'create a vendor in the new company', v.val.slice(0, 80) + ' persist=' + !!v.per + ' records ' + v.before + '->' + v.after + ' gridIds=[' + v.gridIds.join(',') + ']');
    step('S11b', v.gridIds.length ? (dup.length ? 'G' : 'V') : 'I', 'right after a second New+Save, the list shows each record once',
      'gridIds=[' + v.gridIds.join(',') + '] duplicates=[' + dup.join(',') + '] statusCount=' + v.after);
  } catch (e) { step('S08', 'I', 'own org / customer', 'harness: ' + e.message); }

  // ── S09 setup defaults visible in their own windows (count AFTER S10/S11 minus the two we made) ──────────────
  try {
    const seen = {};
    for (const [w, label] of [[146, 'PriceList'], [117, 'Calendar'], [139, 'Warehouse']]) {
      await page.goto(base + '/idempiere.html?login=' + ADMIN + '&window=' + w, { waitUntil: 'load' });
      await page.waitForTimeout(1300); seen[label] = recCount(await status(page));
    }
    await openWin(page, base, ADMIN, 123); seen.BPartner = recCount(await status(page));
    const rowsBP = Number(await one(page, 'SELECT COUNT(*) FROM C_BPartner WHERE AD_Client_ID=' + CID));
    const allVisible = seen.PriceList >= 1 && seen.Calendar >= 1 && seen.BPartner >= rowsBP + 2;
    step('S09', allVisible ? 'V' : 'G', 'the masters setup created (BP, price list, calendar) show in their own windows',
      'gridRecords=' + JSON.stringify(seen) + ' setupBProws=' + rowsBP + ' (+2 made in S10/S11)');
  } catch (e) { step('S09', 'I', 'setup defaults visible', 'harness: ' + e.message); }

  // ── S12 product needs a tax category of this tenant ────────────────────────────────────────────────────────────
  try {
    await openWin(page, base, ADMIN, 140); await clickNew(page);
    const tc = await opts(page, 'c_taxcategory_id');
    const mine = [];
    for (const o of tc) { if (!o.v) continue; const c = await one(page, 'SELECT AD_Client_ID FROM C_TaxCategory WHERE C_TaxCategory_ID=' + Number(o.v)); if (Number(c) === CID) mine.push(o.t); }
    const rows = Number(await one(page, 'SELECT COUNT(*) FROM C_TaxCategory WHERE AD_Client_ID=' + CID));
    const prodCat = Number(await one(page, 'SELECT C_TaxCategory_ID FROM M_Product WHERE AD_Client_ID=' + CID + ' ORDER BY M_Product_ID LIMIT 1'));
    const ownCat = Number(await one(page, 'SELECT C_TaxCategory_ID FROM C_TaxCategory WHERE AD_Client_ID=' + CID + ' ORDER BY C_TaxCategory_ID LIMIT 1'));
    step('S12', mine.length && rows === 1 && prodCat === ownCat && ownCat > 0 ? 'V' : 'G', 'a product can take a tax category of the new company (MSetup.java:1227-1275)',
      'C_TaxCategory(rows for client)=' + rows + ' pickerOptions=' + tc.filter(o => o.v).map(o => o.t).join('|') + ' ofThisTenant=' + mine.length + ' setupProductCategory=' + prodCat + ' ownCategory=' + ownCat);
  } catch (e) { step('S12', 'I', 'product tax category', 'harness: ' + e.message); }

  // ── S13 payment terms ────────────────────────────────────────────────────────────────────────────────────────
  try {
    const pt = Number(await one(page, 'SELECT COUNT(*) FROM C_PaymentTerm WHERE AD_Client_ID=' + CID));
    const ptRow = await q(page, 'SELECT Value, Name, NetDays, IsDefault FROM C_PaymentTerm WHERE AD_Client_ID=' + CID);
    const ptOk = pt === 1 && Array.isArray(ptRow) && ptRow[0][0] === 'Immediate' && ptRow[0][1] === 'Immediate' && Number(ptRow[0][2]) === 0 && ptRow[0][3] === 'Y';
    step('S13', ptOk ? 'V' : 'G', 'the new company has a payment term (MSetup.java:1418-1426 inserts Immediate)', 'C_PaymentTerm=' + pt + ' ' + JSON.stringify(ptRow));
  } catch (e) { step('S13', 'I', 'payment term', 'harness: ' + e.message); }

  // ── S14 + S15 sales order in the NEW company ─────────────────────────────────────────────────────────────────
  try {
    await openWin(page, base, ADMIN, 143); await clickNew(page);
    const bp = (await opts(page, 'c_bpartner_id')).filter(o => o.v);
    const byClient = {};
    for (const o of bp) { const c = await one(page, 'SELECT AD_Client_ID FROM C_BPartner WHERE C_BPartner_ID=' + Number(o.v)); byClient[c] = (byClient[c] || 0) + 1; }
    const foreign = Object.keys(byClient).filter(c => Number(c) !== 0 && Number(c) !== CID).reduce((a, c) => a + byClient[c], 0);
    // NON-VACUOUS: the tenant's OWN setup BP must still be offered — a filter that empties the picker is not a pass.
    const own = byClient[CID] || 0;
    step('S14', bp.length ? (foreign === 0 && own >= 1 ? 'V' : 'G') : 'I', 'pickers offer only this company\'s (and shared) records',
      'BP picker n=' + bp.length + ' byClient=' + JSON.stringify(byClient) + ' foreign=' + foreign + ' own=' + own +
      ' (iDempiere: MRole.addAccessSQL on every lookup) ' + last(0, /§FK-ACCESS col=c_bpartner_id/).slice(0, 120));
    const dt = (await opts(page, 'c_doctypetarget_id')).filter(o => o.v);
    // Independent oracle = val rule 133 re-run as SQL over THIS client's rows (IsSOTrx='Y' on the SO window).
    const want = Number(await one(page, "SELECT COUNT(*) FROM C_DocType WHERE DocBaseType IN ('SOO','POO') AND IsSOTrx='Y' AND COALESCE(DocSubTypeSO,' ')<>'RM' AND IsActive='Y' AND AD_Client_ID=" + CID));
    // NEGATIVE CONTROL: an offered doc type owned by ANOTHER client would make the count pass while being wrong.
    let foreignDt = 0;
    for (const o of dt) { const c = await one(page, 'SELECT AD_Client_ID FROM C_DocType WHERE C_DocType_ID=' + Number(o.v)); if (Number(c) !== CID) foreignDt++; }
    step('S15', !want ? 'G' : (dt.length === want && foreignDt === 0 ? 'V' : 'G'), 'a sales order can be typed in the new company (needs a sales doc type)',
      'targetDocTypeOptions=' + dt.length + ' oracle(valrule133 sql)=' + want + ' foreignClientOptions=' + foreignDt + ' [' + dt.map(o => o.t).join('|') + '] ' + last(0, /§VALRULE col=c_doctypetarget_id/).slice(0, 120));
  } catch (e) { step('S14', 'I', 'SO in new company', 'harness: ' + e.message); }

  // ── S16..S21 order-to-cash in the demo company (GardenWorld) ─────────────────────────────────────────────────
  async function newOrder(win, bpId, dtRe, lineTab, prod, qty, price, negProd) {
    const r = {};
    await openWin(page, base, 'GardenAdmin', win); await clickNew(page);
    await setSel(page, 'c_bpartner_id', bpId); await page.waitForTimeout(300);
    const dt = (await opts(page, 'c_doctypetarget_id')).find(o => dtRe.test(o.t));
    if (dt) await setSel(page, 'c_doctypetarget_id', dt.v);
    let n0 = PAGELOG.length; await save(page);
    r.hdr = last(n0, /§CRUD validate key=c_order /); r.hdrPersist = last(n0, /§CRUD-PERSIST key=c_order /);
    r.id = Number((/§CRUD-CREATE-SEL table=c_order id=(-?\d+)/.exec(last(n0, /§CRUD-CREATE-SEL table=c_order/)) || [])[1]);
    await page.click('#idmp-tabstrip >> text=' + lineTab); await page.waitForTimeout(900);
    await clickNew(page);
    if (negProd) {   // NEGATIVE CONTROL first: a product with NO row in the price-list version must derive no price
      n0 = PAGELOG.length; await setSel(page, 'm_product_id', negProd);
      r.negCallout = last(n0, /§CRUD-CALLOUT table=c_orderline col=m_product_id/); r.negPrice = last(n0, /§FS6-PRICE/);
    }
    n0 = PAGELOG.length;
    await setSel(page, 'm_product_id', prod); await fillBlur(page, 'qtyentered', qty);
    r.fs6 = since(n0, /§FS6-(PRICE|TAX)/).join(' | ');
    r.callout = last(n0, /§CRUD-CALLOUT table=c_orderline col=m_product_id/);
    r.autoFilled = await page.evaluate(() => { const g = c => { const e = document.querySelector('#idmp-inline-mount [data-col="' + c + '"]'); return e ? e.value : null; };
      return { priceentered: g('priceentered'), c_uom_id: g('c_uom_id'), c_tax_id: g('c_tax_id') }; });
    const uom = (await opts(page, 'c_uom_id')).find(o => /^Each/.test(o.t)); const tax = (await opts(page, 'c_tax_id')).find(o => /^Standard \(104\)/.test(o.t));
    if (uom) await setSel(page, 'c_uom_id', uom.v); if (tax) await setSel(page, 'c_tax_id', tax.v);
    await fillBlur(page, 'priceentered', price);
    await page.locator('#idmp-inline-mount input[data-col="priceactual"]').first().fill(String(price)).catch(() => {});
    n0 = PAGELOG.length; await save(page);
    r.line = last(n0, /§CRUD validate key=c_orderline/);
    await page.click('#idmp-tabstrip .idmp-adtab >> nth=0'); await page.waitForTimeout(900);
    await page.evaluate((i) => { const tr = [...document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')].find(x => Number(x.getAttribute('data-ad-record')) === i); if (tr) tr.click(); }, r.id);
    await page.waitForTimeout(900);
    r.actions = await page.$$eval('[data-doc-action]', e => e.map(x => x.getAttribute('data-doc-action')));
    n0 = PAGELOG.length;
    await page.click('[data-doc-action="CO"]').catch(() => {}); await page.waitForTimeout(2600);
    r.co = last(n0, /§CRUD process committed key=c_order/); r.fan = last(n0, /§SO-COMPLETE|§SO-FANOUT/); r.fanout = last(n0, /§SO-FANOUT/);
    return r;
  }
  let SO = null;
  try {
    // ORACLE for S17, computed here by SQL, independent of crud_overlay's code path (spec §FS2e):
    //   price = M_ProductPrice.PriceStd in the newest version (ValidFrom <= today) of BP 118's price list;
    //   UOM   = M_Product.C_UOM_ID;  tax = Tax.get restated as ONE query (category, not a child, not PO-only,
    //   from = AD_OrgInfo(org 11) location, to = DeliveryViaRule default 'P' → warehouse 103's location
    //   (Tax.java:539-542), 0 = wildcard, ORDER BY NULLS LAST as Postgres), else the first IsDefault tax.
    const plv = await one(page, "SELECT M_PriceList_Version_ID FROM M_PriceList_Version WHERE M_PriceList_ID=(SELECT M_PriceList_ID FROM C_BPartner WHERE C_BPartner_ID=118) AND date(ValidFrom)<=date('now') ORDER BY ValidFrom DESC LIMIT 1");
    const negProd = await one(page, "SELECT M_Product_ID FROM M_Product WHERE AD_Client_ID=11 AND IsActive='Y' AND IsSummary='N' AND M_Product_ID NOT IN (SELECT M_Product_ID FROM M_ProductPrice WHERE M_PriceList_Version_ID=" + Number(plv) + ") ORDER BY M_Product_ID LIMIT 1");
    SO = await newOrder(143, 118, /^Standard Order/, 'Order Line', 123, 2, 61.75, negProd);
    step('S16', /verb=create ok/.test(SO.hdr) && SO.hdrPersist && SO.id ? 'V' : 'G', 'type a sales order header (demo company)', SO.hdr.slice(0, 80) + ' id=' + SO.id);
    const oPrice = Number(await one(page, 'SELECT PriceStd FROM M_ProductPrice WHERE M_Product_ID=123 AND M_PriceList_Version_ID=' + Number(plv)));
    const oUom = Number(await one(page, 'SELECT C_UOM_ID FROM M_Product WHERE M_Product_ID=123'));
    const lc = async (sql) => { const r = await q(page, sql); return Array.isArray(r) && r.length ? { c: Number(r[0][0]) || 0, r: Number(r[0][1]) || 0 } : null; };
    const from = await lc('SELECT c.C_Country_ID, c.C_Region_ID FROM AD_OrgInfo oi JOIN C_Location c ON c.C_Location_ID=oi.C_Location_ID WHERE oi.AD_Org_ID=11');
    const to = await lc('SELECT c.C_Country_ID, c.C_Region_ID FROM M_Warehouse w JOIN C_Location c ON c.C_Location_ID=w.C_Location_ID WHERE w.M_Warehouse_ID=103');
    const ord = ' ORDER BY C_Country_ID IS NULL, C_Country_ID, C_Region_ID IS NULL, C_Region_ID, To_Country_ID IS NULL, To_Country_ID, To_Region_ID IS NULL, To_Region_ID, ValidFrom DESC LIMIT 1';
    const taxBase = "FROM C_Tax WHERE AD_Client_ID=11 AND IsActive='Y' AND COALESCE(Parent_Tax_ID,0)=0 AND COALESCE(SOPOType,'B')<>'P'";
    let oTax = (from && to) ? Number(await one(page, 'SELECT C_Tax_ID ' + taxBase + ' AND C_TaxCategory_ID=(SELECT C_TaxCategory_ID FROM M_Product WHERE M_Product_ID=123)' +
      ' AND COALESCE(C_CountryGroupFrom_ID,0)=0 AND COALESCE(C_CountryGroupTo_ID,0)=0 AND COALESCE(C_Country_ID,0) IN (0,' + from.c + ') AND COALESCE(C_Region_ID,0) IN (0,' + from.r + ')' +
      ' AND COALESCE(To_Country_ID,0) IN (0,' + to.c + ') AND COALESCE(To_Region_ID,0) IN (0,' + to.r + ") AND date(ValidFrom)<=date('now')" + ord)) : 0;
    if (!oTax) oTax = Number(await one(page, 'SELECT C_Tax_ID ' + taxBase + " AND IsDefault='Y'" + ord));
    const dj = (line) => { const m = /derived=(\{[^}]*\})/.exec(line || ''); try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; } };
    const d = dj(SO.callout) || {}, dn = dj(SO.negCallout);
    const okVal = d.PriceEntered === oPrice && d.C_UOM_ID === oUom && d.C_Tax_ID === oTax && oPrice > 0 && oUom > 0 && oTax > 0;
    const okNeg = !!dn && dn.PriceEntered === undefined;      // no price row → no price, never a guess
    step('S17', !SO.callout ? 'I' : (okVal && okNeg ? 'V' : 'G'), 'choosing the product fills price / UOM / tax on a NEW order\'s line (CalloutOrder.product + tax)',
      'derived={PriceEntered:' + d.PriceEntered + ',C_UOM_ID:' + d.C_UOM_ID + ',C_Tax_ID:' + d.C_Tax_ID + '} oracle={price:' + oPrice + ' (plv ' + plv + '),uom:' + oUom + ',tax:' + oTax +
      '} negControl(product ' + negProd + ')=' + JSON.stringify(dn) + ' autoFilled=' + JSON.stringify(SO.autoFilled) + ' ' + SO.fs6.slice(0, 160));
    step('S18', /verb=create ok/.test(SO.line) ? 'V' : 'G', 'the line saves once UOM, tax and price are typed', SO.line.slice(0, 160));
    step('S19', /to=CO verifyChain=ok/.test(SO.co) ? 'V' : 'G', 'Complete the order (signed)', 'actions=[' + SO.actions.join(',') + '] ' + SO.co.slice(0, 200));
    // S20 — two arms, both on orders typed THIS session (spec §FS2f). Expected doc counts come from the doc type
    // row by SQL through MOrder.completeIt's rule (MOrder.java:2178,2198-2200,2254-2259), not from the code under test.
    const fanOf = (line) => { const m = /policy\(io,inv\)=([YN]),([YN]).*engineOps=(\d+)/.exec(line || ''); return m ? { io: m[1], inv: m[2], ops: Number(m[3]) } : null; };
    const expectFor = async (name) => {
      const r = await q(page, "SELECT DocSubTypeSO, IsAutoGenerateInout, IsAutoGenerateInvoice FROM C_DocType WHERE AD_Client_ID=11 AND Name='" + name + "'");
      if (!Array.isArray(r) || !r.length) return null;
      const st = String(r[0][0] || ''), io = /^(WI|WP|WR)$/.test(st) || (st === 'PR' && r[0][1] === 'Y'), inv = /^(WR|WI)$/.test(st) || (st === 'PR' && r[0][2] === 'Y');
      return { io: io ? 'Y' : 'N', inv: inv ? 'Y' : 'N', perDoc: 2 };   // 1 header + 1 line (each arm types ONE line)
    };
    const coOps = (line) => { const m = /ops=(\d+)/.exec(line || ''); return m ? Number(m[1]) : null; };
    const eSO = await expectFor('Standard Order'), fSO = fanOf(SO.fanout);
    // arm (a) NEGATIVE CONTROL: Standard Order must generate NOTHING (iDempiere: Generate Shipments/Invoices later)
    const armA = !!(eSO && fSO && fSO.io === eSO.io && fSO.inv === eSO.inv && fSO.ops === 0 && coOps(SO.co) === 1);
    const POS = await newOrder(143, 118, /^POS Order/, 'Order Line', 123, 1, 61.75);
    const ePOS = await expectFor('POS Order'), fPOS = fanOf(POS.fanout);
    const wantPOS = ePOS ? (ePOS.io === 'Y' ? ePOS.perDoc : 0) + (ePOS.inv === 'Y' ? ePOS.perDoc : 0) : null;
    // arm (b): POS Order (WR) → shipment + invoice, and the signed group carries them: ops = 1 status + engine ops
    const armB = !!(ePOS && fPOS && fPOS.io === ePOS.io && fPOS.inv === ePOS.inv && wantPOS > 0 && fPOS.ops === wantPOS && coOps(POS.co) === 1 + wantPOS);
    step('S20', !fSO && !fPOS ? (/not in bundle|not found/.test(SO.fan) ? 'G' : 'I') : (armA && armB ? 'V' : 'G'),
      'Complete on a NEW order runs iDempiere\'s completeIt fan-out (Standard Order: none; POS Order: shipment + invoice)',
      'SO: expect=' + JSON.stringify(eSO) + ' got=' + JSON.stringify(fSO) + ' commitOps=' + coOps(SO.co) + ' | POS: expect=' + JSON.stringify(ePOS) + ' wantOps=' + wantPOS +
      ' got=' + JSON.stringify(fPOS) + ' commitOps=' + coOps(POS.co) + ' | ' + (POS.fanout || SO.fan).slice(0, 140) + ' | ' + POS.fan.slice(0, 90));
    await page.goto(base + '/idempiere.html?login=GardenAdmin&window=143', { waitUntil: 'load' }); await page.waitForTimeout(2000);
    const tip = await tipOf(page, 'c_order', SO.id);
    step('S21', tip === 'CO' ? 'V' : 'G', 'the completed order survives a reload', 'readTip(c_order,' + SO.id + ')=' + tip);
  } catch (e) { step('S16', 'I', 'O2C demo', 'harness: ' + e.message); }

  // ── S22 purchase order (demo company) ────────────────────────────────────────────────────────────────────────
  try {
    const PO = await newOrder(181, 114, /^Purchase Order/, 'PO Line', 124, 5, 40);
    step('S22', /verb=create ok/.test(PO.hdr) && /verb=create ok/.test(PO.line) && /to=CO verifyChain=ok/.test(PO.co) ? 'V' : 'G',
      'type + complete a purchase order (demo company)', 'hdr=' + PO.hdr.slice(0, 50) + ' line=' + PO.line.slice(0, 50) + ' ' + PO.co.slice(0, 120) + ' fanout=' + PO.fan.slice(0, 90));
  } catch (e) { step('S22', 'I', 'PO demo', 'harness: ' + e.message); }

  // ── S23 posting preview on a seeded invoice ─────────────────────────────────────────────────────────────────
  try {
    await page.goto(base + '/idempiere.html?login=GardenAdmin&window=167', { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const n0 = PAGELOG.length;
    await page.evaluate(() => { const b = document.querySelector('.idmp-posted-btn'); if (b) b.click(); }); await page.waitForTimeout(1500);
    const pv = last(n0, /§PREVIEW-LIVE/);
    step('S23', /balanced=true/.test(pv) && /coverage=complete/.test(pv) ? 'V' : (pv ? 'G' : 'I'), 'see the journal an invoice posts (Posted button)', pv.slice(0, 200));
  } catch (e) { step('S23', 'I', 'posting preview', 'harness: ' + e.message); }

  // ── S24 trial balance — judged against an INDEPENDENT oracle: TrialBalance.java:161 (C_AcctSchema_ID=param) +
  //    :400 (Fact_Acct WHERE AD_Client_ID=<login client>), re-derived here as one GROUP BY over the same fact_acct.
  try {
    const n0 = PAGELOG.length;
    await page.goto(base + '/idempiere.html?login=GardenAdmin&process=310', { waitUntil: 'load' }); await page.waitForTimeout(2200);
    const open = last(n0, /§AD-PROC-LIVE open proc=310/);
    const asId = await one(page, 'SELECT C_AcctSchema_ID FROM C_AcctSchema WHERE AD_Client_ID=11 ORDER BY C_AcctSchema_ID LIMIT 1');
    const paramTag = await page.$eval('[data-proc-param="C_AcctSchema_ID"]', e => e.tagName + (e.type ? ':' + e.type : '')).catch(() => 'absent');
    await page.fill('[data-proc-param="C_AcctSchema_ID"]', String(asId)).catch(() => {});
    await page.click('button[data-proc-run]').catch(() => {});
    await page.waitForTimeout(2500);
    const disp = last(n0, /§AD-PROC-LIVE proc=310 /);
    const shown = await page.evaluate(() => {
      const t = document.querySelector('.idmp-procresult table'); if (!t) return null;
      const rows = [...t.querySelectorAll('tr')].filter(tr => tr.querySelector('td')).map(tr => [...tr.cells].map(c => c.textContent.trim()));
      const num = s => Number(String(s).replace(/,/g, '')) || 0;
      return { n: rows.length, dr: rows.reduce((a, r) => a + num(r[2]), 0), cr: rows.reduce((a, r) => a + num(r[3]), 0) };
    });
    const orc = await q(page, 'SELECT COUNT(DISTINCT Account_ID), ROUND(SUM(AmtAcctDr),2), ROUND(SUM(AmtAcctCr),2) FROM Fact_Acct WHERE AD_Client_ID=11 AND C_AcctSchema_ID=' + Number(asId));
    const o = Array.isArray(orc) && orc.length ? { n: orc[0][0], dr: orc[0][1], cr: orc[0][2] } : null;
    const match = shown && o && shown.n === o.n && Math.abs(shown.dr - o.dr) < 0.005 && Math.abs(shown.cr - o.cr) < 0.005;
    step('S24', !disp ? 'I' : (match ? 'V' : 'G'), 'Trial Balance = this company\'s facts in the chosen accounting schema (TrialBalance.java:161,400)',
      open.slice(0, 60) + ' | ' + disp.slice(0, 90) + ' | shown=' + JSON.stringify(shown && { n: shown.n, dr: +shown.dr.toFixed(2), cr: +shown.cr.toFixed(2) }) +
      ' oracle(client=11,schema=' + asId + ')=' + JSON.stringify(o));
    step('S24b', /^SELECT/.test(paramTag) ? 'V' : 'G', 'the Accounting Schema parameter is a picker (AD_Reference 19 TableDir), not a raw-id text box',
      'C_AcctSchema_ID param control=' + paramTag + ' (ad_process_para ref=19, no DefaultValue)');
  } catch (e) { step('S24', 'I', 'trial balance', 'harness: ' + e.message); }

  // ── S25 import ───────────────────────────────────────────────────────────────────────────────────────────────
  try {
    await page.evaluate(() => window.AboutDIY && window.AboutDIY.open()); await page.waitForTimeout(500);
    await page.click('.adq-segb[data-tab="diy"]').catch(() => {}); await page.waitForTimeout(600);
    const diy = await page.$eval('#adq-body', e => e.innerText).catch(() => '');
    const agents = ['odoo_agent.zip', 'Odoo', 'iDempiere', 'SAP', 'Oracle', 'Dynamics'].filter(s => diy.indexOf(s) >= 0);
    step('S25a', agents.length >= 3 ? 'V' : 'G', 'Help -> Run it yourself offers the data-in agents', 'found=[' + agents.join(',') + '] chars=' + diy.length);
    await page.goto(base + '/idempiere.html?login=GardenAdmin&window=172', { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const st = await status(page);
    step('S25b', /not in curated seed|table-not-in-seed/.test(st + last(0, /§IDEMPIERE tab=.*I_BPartner/)) ? 'G' : 'V',
      'the iDempiere-style Import Business Partner window can take rows', 'status="' + st + '"');
  } catch (e) { step('S25a', 'I', 'import', 'harness: ' + e.message); }

  // ── S26 backup ───────────────────────────────────────────────────────────────────────────────────────────────
  try {
    const has = await page.evaluate(() => !!(window.ErpPersist && window.ErpPersist.backup));
    step('S26', has ? 'V' : 'G', 'a signed backup / restore of my company is offered on the ERP page',
      'window.ErpPersist on idempiere.html=' + has + ' (erp_persist_ui.js is loaded only by glassbowl.html)');
  } catch (e) { step('S26', 'I', 'backup', 'harness: ' + e.message); }

  // ── verdict ──────────────────────────────────────────────────────────────────────────────────────────────────
  const cnt = { V: 0, G: 0, I: 0 }; RES.forEach(r => cnt[r.verdict]++);
  const drift = RES.filter(r => EXPECT[r.id] && EXPECT[r.id] !== r.verdict);
  const missing = Object.keys(EXPECT).filter(k => !RES.some(r => r.id === k));
  say('\n§W-ERP-FIRST-SETUP summary steps=' + RES.length + ' VERIFIED=' + cnt.V + ' GAP=' + cnt.G + ' INCONCLUSIVE=' + cnt.I +
    ' pageErrors=' + ERRS.length + (ERRS.length ? ' first="' + ERRS[0].slice(0, 120) + '"' : ''));
  drift.forEach(r => say('§FIRST-SETUP DRIFT step=' + r.id + ' expected=' + EXPECT[r.id] + ' got=' + r.verdict));
  missing.forEach(k => say('§FIRST-SETUP DRIFT step=' + k + ' expected=' + EXPECT[k] + ' got=NOT-RUN'));
  const ok = !drift.length && !missing.length;
  say(ok ? '🟢 W-ERP-FIRST-SETUP PASS — every step matches the spec\'s pinned verdict (' + cnt.V + ' verified, ' + cnt.G + ' named gaps)'
         : '🔴 W-ERP-FIRST-SETUP DRIFT — ' + (drift.length + missing.length) + ' step(s) differ from the spec; read the lines above');
  fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); fs.writeFileSync(PAGELOGF, PAGELOG.join('\n') + '\n');
  await browser.close(); server.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('test error', e); try { fs.writeFileSync(LOGF, OUT.join('\n') + '\nHARNESS ERROR ' + e.stack + '\n'); } catch (_) {} server.close(); process.exit(2); });
