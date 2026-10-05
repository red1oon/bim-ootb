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
const EXPECT = { S01: 'V', S02: 'V', S03: 'V', S04: 'V', S05: 'V', S05b: 'V', S06: 'V', S07: 'V', S08: 'G', S09: 'G', S10: 'V', S10b: 'V',
  S11: 'V', S11b: 'V', S12: 'V', S13: 'V', S14: 'V', S15: 'V', S15b: 'V', S16: 'V', S16b: 'V', S16c: 'V', S17: 'V', S18: 'V', S19: 'V', S20: 'V', S20b: 'V', S21: 'V',
  S22: 'V', S23: 'V', S24: 'G', S24b: 'V', S24c: 'V', S25a: 'V', S25b: 'V', S26: 'V' };
// FIX-A (§FS2) flips S08 + S09 to V. The witness reads which genesis it is judging from the served file itself.
// FS-1 (§FS2c) pinned S07 + S15 to V: the born tenant carries MSetup's 42 doc types (MSetup.java:710-831).
// FS-5 (§FS2d) pinned S14 to V: FK pickers carry MRole.addAccessSQL's client clause (MLookupFactory.java:270).
// FS-6 (§FS2e) pinned S17 to V: CalloutOrder.product derives price/UOM/tax on a session-created order, by value.
// FS-7 (§FS2f) pinned S20 to V: a session-typed order's Complete runs MOrder.completeIt's fan-out rule (two arms).
// FS-9 (§FS2i) pinned S24b to V: a TableDir process parameter is a client-scoped picker.
// FS-8 (§FS2h) pinned S11b to V: the commit refold is idempotent; the grid == a reload's count.
// FS-18 (§FS2p) pinned S05b to V: a tenant from the user's CoA file; the file's chart + key map, a missing key refused.
// FS-17 (§FS2o) pinned S26 to V: Backup → wipe → tampered copy rejected → Restore round-trips (ops, tip, BPs).
// FS-16 (§FS2n) pinned S25b to V: CSV → loader → I_BPartner → ImportBPartner → BPs == the CSV.
// FS-15 (§FS2m) pinned S20b to V: the POS order's invoice + shipment are readable and posted; facts == oracle.
// FS-14 (§FS2l) pinned S24c to V: Aging buckets == the re-derived oracle at two statement dates; vacuity control INCONCLUSIVE.
// FS-13 (§FS2k) pinned S10b to V: the Location editor commits a C_Location; the customer's order header then saves.
// FS-12 (§FS2j) pinned S15b to V: a NEW tenant's order prices its line from the setup price list and completes.
// §GT (ERP_IDEMPIERE_UX_PARITY.md §GT.3) pinned S16b + S16c to V: an unsaved header autosaves on the Line tab; the Line tab
//   counts ONLY its order's rows (per-row c_order_id via the §GT-SNAP seam) — closes the scope-blind newOrder() path (§MD).
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
    const ccy = await page.$$eval('[data-genesis-currency] option', o => o.map(x => x.text));   // FS-12: the pane now also has a Country select
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

  let S11B = null;
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
    S11B = { gridIds: v.gridIds, dup, statusCount: v.after };   // judged in the S09 block against a fresh reload (the oracle)
  } catch (e) { step('S08', 'I', 'own org / customer', 'harness: ' + e.message); }

  // ── S09 setup defaults visible in their own windows (count AFTER S10/S11 minus the two we made) ──────────────
  try {
    const seen = {};
    for (const [w, label] of [[146, 'PriceList'], [117, 'Calendar'], [139, 'Warehouse']]) {
      await page.goto(base + '/idempiere.html?login=' + ADMIN + '&window=' + w, { waitUntil: 'load' });
      await page.waitForTimeout(1300); seen[label] = recCount(await status(page));
    }
    await openWin(page, base, ADMIN, 123); seen.BPartner = recCount(await status(page));
    if (S11B) step('S11b', S11B.gridIds.length ? (!S11B.dup.length && S11B.gridIds.length === seen.BPartner && S11B.statusCount === seen.BPartner ? 'V' : 'G') : 'I',
      'right after a second New+Save, the list shows each record once (== what a reload shows)',
      'gridIds=[' + S11B.gridIds.join(',') + '] duplicates=[' + S11B.dup.join(',') + '] statusCount=' + S11B.statusCount + ' reloadCount=' + seen.BPartner);
    const rowsBP = Number(await one(page, 'SELECT COUNT(*) FROM C_BPartner WHERE AD_Client_ID=' + CID));
    const allVisible = seen.PriceList >= 1 && seen.Calendar >= 1 && seen.BPartner >= rowsBP + 2;
    step('S09', allVisible ? 'V' : 'G', 'the masters setup created (BP, price list, calendar) show in their own windows',
      'gridRecords=' + JSON.stringify(seen) + ' setupBProws=' + rowsBP + ' (+2 made in S10/S11)');
  } catch (e) { step('S09', 'I', 'setup defaults visible', 'harness: ' + e.message); }

  // ── S10b the customer gets an address (Location editor, FS-13 §FS2k) and can then be ordered for ─────────────────
  //    BY VALUE: the C_Location the editor commits == the typed address; the BP location points at it and is named by
  //    makeUnique level 0 (= City); the Sales Order header for that customer then persists with C_BPartner_Location_ID ==
  //    that BP location. NEGATIVE CONTROL first: the same header BEFORE the address exists must be rejected.
  const tipRow = (table, id) => page.evaluate(([t, i]) => {
    const c = window.__crud; if (!c || !c.kernelDb || !c.core) return null; const sdb = c.kernelDb(); if (!sdb) return null;
    const r = c.core.listTip(sdb, t, t + '_id', [], null); const row = ((r && r.rows) || []).find(x => String(x[t + '_id']) === String(i)); return row || null;
  }, [table, id]);
  async function soHeaderFor(bpId) {
    await openWin(page, base, ADMIN, 143); await clickNew(page);
    await setSel(page, 'c_bpartner_id', bpId).catch(() => {}); await page.waitForTimeout(300);
    const dt = (await opts(page, 'c_doctypetarget_id')).find(o => /^Standard Order/.test(o.t)); if (dt) await setSel(page, 'c_doctypetarget_id', dt.v);
    const n0 = PAGELOG.length; await save(page);
    return { val: last(n0, /§CRUD validate key=c_order |§AD-MODELVAL-LIVE table=c_order verb=create verdict=REJECT/), per: last(n0, /§CRUD-PERSIST key=c_order /),
      mv: last(n0, /§AD-MODELVAL-LIVE table=c_order verb=create/) };
  }
  try {
    await openWin(page, base, ADMIN, 143); await clickNew(page);
    const cust = (await opts(page, 'c_bpartner_id')).find(o => /^Acme Retail/.test(o.t));
    const custId = cust ? cust.v : null;
    const neg = custId ? await soHeaderFor(custId) : null;
    await openWin(page, base, ADMIN, 123);
    const clicked = await page.evaluate((i) => { const tr = [...document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')].find(x => String(x.getAttribute('data-ad-record')) === String(i)); if (tr) { tr.click(); return true; } return false; }, custId);
    await page.waitForTimeout(900);
    const selName = await page.$eval('#idmp-inline-mount [data-col="name"]', e => e.value).catch(() => null);
    await page.click('#idmp-tabstrip >> text=Location'); await page.waitForTimeout(900);
    await clickNew(page);
    const ADDR = { address1: 'Jalan Ampang 1', city: 'Kuala Lumpur', postal: '50450' };
    const MY = Number(await one(page, "SELECT C_Country_ID FROM C_Country WHERE CountryCode='MY'"));
    await page.click('#idmp-inline-mount [data-loc-edit="c_location_id"]'); await page.waitForTimeout(500);
    for (const k of Object.keys(ADDR)) await page.fill('#idmp-inline-mount [data-loc="' + k + '"]', ADDR[k]);
    await page.selectOption('#idmp-inline-mount [data-loc="c_country_id"]', String(MY));
    let n0 = PAGELOG.length;
    await page.click('#idmp-inline-mount [data-loc-ok="c_location_id"]'); await page.waitForTimeout(1500);
    const locLine = last(n0, /§LOC-EDITOR created/);
    const locId = Number((/id=(-?\d+)/.exec(locLine) || [])[1]);
    const locRow = locId ? await tipRow('c_location', locId) : null;
    const locOk = !!locRow && locRow.address1 === ADDR.address1 && locRow.city === ADDR.city && locRow.postal === ADDR.postal && Number(locRow.c_country_id) === MY;
    n0 = PAGELOG.length; await save(page);
    const blVal = last(n0, /§CRUD validate key=c_bpartner_location /), blPer = last(n0, /§CRUD-PERSIST key=c_bpartner_location /);
    const blId = Number((/§CRUD-CREATE-SEL table=c_bpartner_location id=(-?\d+)/.exec(last(n0, /§CRUD-CREATE-SEL table=c_bpartner_location/)) || [])[1]);
    const blRow = blId ? await tipRow('c_bpartner_location', blId) : null;
    const blOk = !!blRow && Number(blRow.c_location_id) === locId && String(blRow.c_bpartner_id) === String(custId) && blRow.name === ADDR.city;
    const pos = custId ? await soHeaderFor(custId) : null;
    const derivedLoc = Number((/"c_bpartner_location_id":(-?\d+)/.exec(pos ? pos.mv : '') || [])[1]);
    const negOk = !!neg && !neg.per && /REJECT/.test(neg.val + neg.mv);
    const posOk = !!pos && /verb=create ok/.test(pos.val) && !!pos.per && derivedLoc === blId;
    say('§S10b-DETAIL clicked=' + clicked + ' selName=' + selName + ' bpLocRow=' + JSON.stringify(blRow) + ' locRow=' + JSON.stringify(locRow) + ' after=' + JSON.stringify(pos));
    step('S10b', !custId ? 'I' : (locOk && /verb=create ok/.test(blVal) && blPer && blOk && negOk && posOk ? 'V' : 'G'),
      'the customer gets an address (Location editor) and a sales order header for it then saves',
      'cust=' + custId + ' before: ' + (neg ? (neg.val || neg.mv).slice(0, 110) : '-') + ' | ' + (locLine.slice(0, 160) || 'no §LOC-EDITOR line') + ' tipRow=' + JSON.stringify(locRow && { a1: locRow.address1, city: locRow.city, postal: locRow.postal, ctry: locRow.c_country_id }) +
      ' | bpLoc ' + blVal.slice(0, 60) + ' persist=' + !!blPer + ' id=' + blId + ' row=' + JSON.stringify(blRow && { loc: blRow.c_location_id, bp: blRow.c_bpartner_id, name: blRow.name }) +
      ' | after: ' + (pos ? pos.val.slice(0, 60) + ' persist=' + !!pos.per + ' c_bpartner_location_id=' + derivedLoc : '-'));
  } catch (e) { step('S10b', 'I', 'customer address + order', 'harness: ' + e.message); }

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
  async function newOrder(win, bpId, dtRe, lineTab, prod, qty, price, negProd, login, autosave) {
    const r = {};
    const gtSnap = () => page.evaluate(() => window.IdmpGridTab ? window.IdmpGridTab.snapshot() : null).catch(() => null);
    await openWin(page, base, login || 'GardenAdmin', win); await clickNew(page);
    r.newPriceList = await page.$eval('#idmp-inline-mount [data-col="m_pricelist_id"]', e => e.value).catch(() => null);
    await setSel(page, 'c_bpartner_id', bpId); await page.waitForTimeout(300);
    const dt = (await opts(page, 'c_doctypetarget_id')).find(o => dtRe.test(o.t));
    if (dt) await setSel(page, 'c_doctypetarget_id', dt.v);
    let n0 = PAGELOG.length; if (!autosave) await save(page);
    // §GT S16b: with autosave the header is NOT saved here — the Line-tab click must save it (AbstractADWindowContent.saveAndNavigate)
    if (autosave) { await page.click('#idmp-tabstrip >> text=' + lineTab); await page.waitForTimeout(1600); r.autosave = last(n0, /§GT-NAV autosave table=C_Order verdict=/); }
    r.hdr = last(n0, /§CRUD validate key=c_order /); r.hdrPersist = last(n0, /§CRUD-PERSIST key=c_order /);
    r.id = Number((/§CRUD-CREATE-SEL table=c_order id=(-?\d+)/.exec(last(n0, /§CRUD-CREATE-SEL table=c_order/)) || [])[1]);
    if (!autosave) { await page.click('#idmp-tabstrip >> text=' + lineTab); await page.waitForTimeout(900); }
    r.snap0 = await gtSnap();   // §GT S16c: the Line tab of THIS order before its line — rows per parent, not a log line
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
    await page.waitForTimeout(400); r.snap1 = await gtSnap();
    await page.click('#idmp-tabstrip .idmp-adtab >> nth=0'); await page.waitForTimeout(900);
    await page.evaluate((i) => { const tr = [...document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')].find(x => Number(x.getAttribute('data-ad-record')) === i); if (tr) tr.click(); }, r.id);
    await page.waitForTimeout(900);
    r.actions = await page.$$eval('[data-doc-action]', e => e.map(x => x.getAttribute('data-doc-action')));
    n0 = PAGELOG.length;
    await page.click('[data-doc-action="CO"]').catch(() => {}); await page.waitForTimeout(2600);
    r.co = last(n0, /§CRUD process committed key=c_order/); r.fan = last(n0, /§SO-COMPLETE|§SO-FANOUT/); r.fanout = last(n0, /§SO-FANOUT/);
    return r;
  }
  // ── S15b a sales order in the NEW company prices its line and completes (FS-12, spec §FS2j) ────────────────────
  //    ORACLE by SQL, independent of the page's code path: price list = the client's IsDefault one (Login.loadDefault →
  //    GridField stage 5), version ValidFrom <= today → M_ProductPrice.PriceStd; UOM = M_Product.C_UOM_ID; tax = the
  //    tenant's tax of the product's category whose from/to countries match (org location → warehouse location, the
  //    DeliveryViaRule 'P' default, Tax.java:539-542), else its IsDefault tax. NEGATIVE CONTROL: the price list the line
  //    priced from must belong to THIS client (a borrowed GardenWorld list would also give a number).
  try {
    const bpN = Number(await one(page, "SELECT C_BPartner_ID FROM C_BPartner WHERE AD_Client_ID=" + CID + " AND Name='Standard BP'"));
    const prodN = Number(await one(page, 'SELECT M_Product_ID FROM M_Product WHERE AD_Client_ID=' + CID + ' ORDER BY M_Product_ID LIMIT 1'));
    const plN = Number(await one(page, "SELECT M_PriceList_ID FROM M_PriceList WHERE IsDefault='Y' AND IsActive='Y' AND AD_Client_ID IN (0," + CID + ') ORDER BY AD_Client_ID DESC, AD_Org_ID DESC, M_PriceList_ID LIMIT 1'));
    const plvN = Number(await one(page, 'SELECT M_PriceList_Version_ID FROM M_PriceList_Version WHERE M_PriceList_ID=' + plN + " AND date(ValidFrom)<=date('now') ORDER BY ValidFrom DESC LIMIT 1"));
    const oP = Number(await one(page, 'SELECT PriceStd FROM M_ProductPrice WHERE M_Product_ID=' + prodN + ' AND M_PriceList_Version_ID=' + plvN));
    const oU = Number(await one(page, 'SELECT C_UOM_ID FROM M_Product WHERE M_Product_ID=' + prodN));
    const cr = async (sql) => { const r = await q(page, sql); return Array.isArray(r) && r.length ? { c: Number(r[0][0]) || 0, r: Number(r[0][1]) || 0 } : null; };
    const fromL = await cr('SELECT c.C_Country_ID, c.C_Region_ID FROM AD_OrgInfo oi JOIN C_Location c ON c.C_Location_ID=oi.C_Location_ID WHERE oi.AD_Org_ID=' + Number(HQ));
    const toL = await cr('SELECT c.C_Country_ID, c.C_Region_ID FROM M_Warehouse w JOIN C_Location c ON c.C_Location_ID=w.C_Location_ID WHERE w.AD_Client_ID=' + CID + ' ORDER BY w.M_Warehouse_ID LIMIT 1');
    const tb = "FROM C_Tax WHERE AD_Client_ID=" + CID + " AND IsActive='Y' AND COALESCE(Parent_Tax_ID,0)=0 AND COALESCE(SOPOType,'B')<>'P'";
    const ordT = ' ORDER BY C_Country_ID IS NULL, C_Country_ID, C_Region_ID IS NULL, C_Region_ID, To_Country_ID IS NULL, To_Country_ID, To_Region_ID IS NULL, To_Region_ID, ValidFrom DESC LIMIT 1';
    let oT = (fromL && toL) ? Number(await one(page, 'SELECT C_Tax_ID ' + tb + ' AND C_TaxCategory_ID=(SELECT C_TaxCategory_ID FROM M_Product WHERE M_Product_ID=' + prodN + ')' +
      ' AND COALESCE(C_Country_ID,0) IN (0,' + fromL.c + ') AND COALESCE(C_Region_ID,0) IN (0,' + fromL.r + ') AND COALESCE(To_Country_ID,0) IN (0,' + toL.c + ') AND COALESCE(To_Region_ID,0) IN (0,' + toL.r + ')' +
      " AND (ValidFrom IS NULL OR date(ValidFrom)<=date('now'))" + ordT)) : 0;
    if (!oT) oT = Number(await one(page, 'SELECT C_Tax_ID ' + tb + " AND IsDefault='Y'" + ordT));
    // iDempiere fact (spec §FS2j): MSetup's list is NOT a sales list (MPriceList.setInitialDefaults IsSOPriceList=N), so the
    // SO window's validated lookup (val rule 271) drops the #M_PriceList_ID default (GridTable.dataNew → validateValueNoDirect)
    // and the order has no price list. The user's step — as in iDempiere — is to tick "Sales Price list" on it once.
    await openWin(page, base, ADMIN, 146);
    await page.evaluate((i) => { const tr = [...document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')].find(x => Number(x.getAttribute('data-ad-record')) === i); if (tr) tr.click(); }, plN);
    await page.waitForTimeout(900);
    let n0 = PAGELOG.length;
    await page.check('#idmp-inline-mount input[data-col="issopricelist"]').catch(() => {});
    await page.waitForTimeout(300); await save(page);
    const plUpd = last(n0, /§CRUD validate key=m_pricelist /), plPer = last(n0, /§CRUD-PERSIST key=m_pricelist /);
    const NT = await newOrder(143, bpN, /^Standard Order/, 'Order Line', prodN, 2, oP || 1, null, ADMIN);
    const djN = (line) => { const m = /derived=(\{[^}]*\})/.exec(line || ''); try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; } };
    const dN = djN(NT.callout) || {};
    const plUsed = Number((/§FS6-PRICE [^|]*pricelist=(\d+)/.exec(NT.fs6) || [])[1]);
    const plCli = plUsed ? Number(await one(page, 'SELECT AD_Client_ID FROM M_PriceList WHERE M_PriceList_ID=' + plUsed)) : null;
    const okN = oP > 0 && oU > 0 && oT > 0 && dN.PriceEntered === oP && dN.C_UOM_ID === oU && dN.C_Tax_ID === oT && plUsed === plN && plCli === CID;
    const coN = /to=CO verifyChain=ok/.test(NT.co);
    step('S15b', !CID || !bpN || !prodN ? 'I' : (okN && /verb=update ok/.test(plUpd) && /verb=create ok/.test(NT.hdr) && /verb=create ok/.test(NT.line) && coN ? 'V' : 'G'),
      'a sales order in the NEW company prices its line (price/UOM/tax == oracle) and completes',
      'markSalesList=' + plUpd.slice(0, 50) + ' persist=' + !!plPer + ' client=' + CID + ' bp=' + bpN + ' product=' + prodN + ' newRecordPriceList=' + NT.newPriceList + ' derived={PriceEntered:' + dN.PriceEntered + ',C_UOM_ID:' + dN.C_UOM_ID + ',C_Tax_ID:' + dN.C_Tax_ID +
      '} oracle={pl:' + plN + ',plv:' + plvN + ',price:' + oP + ',uom:' + oU + ',tax:' + oT + '} pricedFrom(pl=' + plUsed + ',client=' + plCli + ') hdr=' + NT.hdr.slice(0, 60) +
      ' line=' + NT.line.slice(0, 60) + ' ' + NT.co.slice(0, 120) + ' | ' + NT.fs6.slice(0, 200));
  } catch (e) { step('S15b', 'I', 'SO in the new company', 'harness: ' + e.message); }

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
    const POS = await newOrder(143, 118, /^POS Order/, 'Order Line', 123, 1, 61.75, null, null, true);
    // §GT S16b/S16c — the 2nd order of the session: header typed, NOT saved, Line tab clicked; then its Line tab counted per row
    step('S16b', /verdict=saved/.test(POS.autosave || '') && /verb=create ok/.test(POS.hdr) && POS.id ? 'V' : 'G', 'an unsaved order header is saved when the user clicks the Line tab',
      (POS.autosave || '(no §GT-NAV autosave line)').slice(0, 140) + ' hdr=' + POS.hdr.slice(0, 60) + ' id=' + POS.id);
    const own = s => s ? s.rows.filter(x => String(x.link) === String(POS.id)).length : -1;
    const okC = !!(POS.snap0 && POS.snap1 && SO && SO.id && POS.id !== SO.id && POS.snap0.rows.length === 0 && POS.snap1.rows.length === 1 && own(POS.snap1) === 1 && String(POS.snap1.linkValue) === String(POS.id));
    step('S16c', !POS.snap0 || !POS.snap1 ? 'I' : (okC ? 'V' : 'G'), 'the Line tab shows only this order\'s lines (after another order got a line this session)',
      'firstOrder=' + (SO && SO.id) + ' thisOrder=' + POS.id + ' before={rows:' + (POS.snap0 ? POS.snap0.rows.length : '?') + ',link:' + (POS.snap0 ? POS.snap0.linkColumn + '=' + POS.snap0.linkValue : '?') + '}' +
      ' after={rows:' + (POS.snap1 ? POS.snap1.rows.length : '?') + ',own:' + own(POS.snap1) + ',ids:' + (POS.snap1 ? JSON.stringify(POS.snap1.rows.map(x => x.pk + '→' + x.link)) : '?') + '}');
    const ePOS = await expectFor('POS Order'), fPOS = fanOf(POS.fanout);
    const wantPOS = ePOS ? (ePOS.io === 'Y' ? ePOS.perDoc : 0) + (ePOS.inv === 'Y' ? ePOS.perDoc : 0) : null;
    // arm (b): POS Order (WR) → shipment + invoice, and the signed group carries them: ops = 1 status + engine ops
    // FS-15 (§FS2m): the commit now carries the BUILT documents: per doc 1 header + 1 line, + 1 C_InvoiceTax for the one
    // tax of the one line typed → crudOps = wantPOS + (inv ? 1 : 0); the engine's decision count (engineOps) is unchanged.
    const crudOf = (line) => { const m = /crudOps=(\d+)/.exec(line || ''); return m ? Number(m[1]) : null; };
    const wantCrud = ePOS ? wantPOS + (ePOS.inv === 'Y' ? 1 : 0) : null;
    const armB = !!(ePOS && fPOS && fPOS.io === ePOS.io && fPOS.inv === ePOS.inv && wantPOS > 0 && fPOS.ops === wantPOS && crudOf(POS.fanout) === wantCrud && coOps(POS.co) === 1 + wantCrud);
    step('S20', !fSO && !fPOS ? (/not in bundle|not found/.test(SO.fan) ? 'G' : 'I') : (armA && armB ? 'V' : 'G'),
      'Complete on a NEW order runs iDempiere\'s completeIt fan-out (Standard Order: none; POS Order: shipment + invoice)',
      'SO: expect=' + JSON.stringify(eSO) + ' got=' + JSON.stringify(fSO) + ' commitOps=' + coOps(SO.co) + ' | POS: expect=' + JSON.stringify(ePOS) + ' wantOps=' + wantPOS +
      ' got=' + JSON.stringify(fPOS) + ' commitOps=' + coOps(POS.co) + ' | ' + (POS.fanout || SO.fan).slice(0, 140) + ' | ' + POS.fan.slice(0, 90));
    // ── S20b (FS-15 §FS2m) the POS order's new invoice + shipment are readable documents and are posted — BY VALUE against an
    //    oracle computed here by SQL: accounts from the acct tables Doc_* reads (C_BP_Customer_Acct, M_Product_Acct, C_Tax_Acct →
    //    C_ValidCombination.Account_ID), amounts from the typed qty × price, the tax rate, and M_Cost (schema costing method).
    try {
      for (let i = 0; i < 30 && !since(0, /§GL-POST-COMMIT/).length; i++) await page.waitForTimeout(300);
      const glLines = since(0, /§GL-POST /), glCommit = last(0, /§GL-POST-COMMIT/);
      const inv = glLines.map(l => /table=c_invoice id=(-?\d+)/.exec(l)).filter(Boolean).map(m => Number(m[1])).pop();
      const shp = glLines.map(l => /table=m_inout id=(-?\d+)/.exec(l)).filter(Boolean).map(m => Number(m[1])).pop();
      const ih = inv ? await tipRow('c_invoice', inv) : null, sh = shp ? await tipRow('m_inout', shp) : null;
      const facts = await page.evaluate(() => { const c = window.__crud; const sdb = c.kernelDb(); const r = c.core.listTip(sdb, 'fact_acct', 'fact_acct_id', [], null); return (r && r.rows) || []; });
      const fx = (tbl, id) => facts.filter(f => Number(f.ad_table_id) === tbl && Number(f.record_id) === id).map(f => [Number(f.account_id), Number(f.amtacctdr), Number(f.amtacctcr)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const vc = async (sql) => Number(await one(page, 'SELECT vc.Account_ID FROM C_ValidCombination vc WHERE vc.C_ValidCombination_ID=(' + sql + ')'));
      const AS = 101, price = 61.75, qty = 1;
      const rate = Number(await one(page, 'SELECT Rate FROM C_Tax WHERE C_Tax_ID=104')), tax = Math.round(price * qty * rate) / 100;
      const aRcv = await vc('SELECT C_Receivable_Acct FROM C_BP_Customer_Acct WHERE C_BPartner_ID=118 AND C_AcctSchema_ID=' + AS);
      const aRev = await vc('SELECT P_Revenue_Acct FROM M_Product_Acct WHERE M_Product_ID=123 AND C_AcctSchema_ID=' + AS);
      const aCogs = await vc('SELECT P_Cogs_Acct FROM M_Product_Acct WHERE M_Product_ID=123 AND C_AcctSchema_ID=' + AS);
      const aAsset = await vc('SELECT P_Asset_Acct FROM M_Product_Acct WHERE M_Product_ID=123 AND C_AcctSchema_ID=' + AS);
      const aTax = await vc('SELECT T_Due_Acct FROM C_Tax_Acct WHERE C_Tax_ID=104 AND C_AcctSchema_ID=' + AS);
      const cost = Number(await one(page, "SELECT c.CurrentCostPrice FROM M_Cost c JOIN M_CostElement e ON e.M_CostElement_ID=c.M_CostElement_ID WHERE c.M_Product_ID=123 AND c.C_AcctSchema_ID=" + AS +
        " AND e.CostElementType='M' AND e.CostingMethod=(SELECT CostingMethod FROM C_AcctSchema WHERE C_AcctSchema_ID=" + AS + ") AND c.AD_Org_ID=0"));
      const gt = Math.round((price * qty + tax) * 100) / 100;
      const oInv = [[aRcv, gt, 0], [aRev, 0, price * qty]].concat(tax ? [[aTax, 0, tax]] : []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const oShp = [[aCogs, Math.round(cost * qty * 100) / 100, 0], [aAsset, 0, Math.round(cost * qty * 100) / 100]].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const fInv = inv ? fx(318, inv) : [], fShp = shp ? fx(319, shp) : [];
      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const bal = (f) => Math.abs(f.reduce((x, r) => x + r[1] - r[2], 0)) < 0.005;
      const dtInv = Number(await one(page, "SELECT C_DocTypeInvoice_ID FROM C_DocType WHERE AD_Client_ID=11 AND Name='POS Order'"));
      const readable = !!ih && Number(ih.c_bpartner_id) === 118 && Number(ih.c_doctype_id) === dtInv && Math.abs(Number(ih.grandtotal) - gt) < 0.005 && !!sh && Number(sh.c_bpartner_id) === 118;
      const posted = ih && ih.posted === 'Y' && sh && sh.posted === 'Y';
      say('§S20b-DETAIL inv=' + JSON.stringify(ih) + ' shp=' + JSON.stringify(sh) + ' factsInv=' + JSON.stringify(fInv) + ' oracleInv=' + JSON.stringify(oInv) + ' factsShp=' + JSON.stringify(fShp) + ' oracleShp=' + JSON.stringify(oShp) + ' cost=' + cost);
      step('S20b', !inv && !shp ? 'G' : (readable && posted && fInv.length && fShp.length && eq(fInv, oInv) && eq(fShp, oShp) && bal(fInv) && bal(fShp) && cost > 0 ? 'V' : 'G'),
        'the invoice + shipment Complete creates are readable documents and are posted (fact_acct == oracle, balanced)',
        'invoice=' + inv + ' gt=' + (ih && ih.grandtotal) + ' posted=' + (ih && ih.posted) + ' facts=' + JSON.stringify(fInv) + ' oracle=' + JSON.stringify(oInv) +
        ' | shipment=' + shp + ' posted=' + (sh && sh.posted) + ' facts=' + JSON.stringify(fShp) + ' oracle=' + JSON.stringify(oShp) + ' | ' + glCommit.slice(0, 90));
    } catch (e) { step('S20b', 'I', 'posting of Complete-created docs', 'harness: ' + e.message); }
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
    const pOpts = /^SELECT/.test(paramTag) ? await page.$$eval('[data-proc-param="C_AcctSchema_ID"] option', o => o.map(x => x.value).filter(Boolean)) : [];
    if (/^SELECT/.test(paramTag)) await page.selectOption('[data-proc-param="C_AcctSchema_ID"]', String(asId)).catch(() => {});
    else await page.fill('[data-proc-param="C_AcctSchema_ID"]', String(asId)).catch(() => {});
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
    // Oracle: MLookupFactory TableDir + MRole client clause, as SQL; NEGATIVE CONTROL: no option of another client.
    const wantN = Number(await one(page, "SELECT COUNT(*) FROM C_AcctSchema WHERE IsActive='Y' AND AD_Client_ID IN (0,11)"));
    let foreignOpt = 0;
    for (const v of pOpts) { const c = await one(page, 'SELECT AD_Client_ID FROM C_AcctSchema WHERE C_AcctSchema_ID=' + Number(v)); if (Number(c) !== 0 && Number(c) !== 11) foreignOpt++; }
    step('S24b', /^SELECT/.test(paramTag) && pOpts.length === wantN && wantN > 0 && foreignOpt === 0 ? 'V' : 'G', 'the Accounting Schema parameter is a picker (AD_Reference 19 TableDir), not a raw-id text box',
      'C_AcctSchema_ID param control=' + paramTag + ' options=' + pOpts.length + ' [' + pOpts.join(',') + '] oracle=' + wantN + ' foreignClientOptions=' + foreignOpt + ' ' + last(n0, /§PROC-PARAM-PICKER col=C_AcctSchema_ID/).slice(0, 120));
  } catch (e) { step('S24', 'I', 'trial balance', 'harness: ' + e.message); }

  // ── S24c Aging (AD_Process 238) — FS-14 spec §FS2l. ORACLE re-derived here from the bundle rows (not the page's code):
  //    open SO invoices of client 11 (CO/CL, IsPaid=N): no pay schedule → open = GrandTotal×(CM?-1:1) − Σ allocations×(AP?-1:1),
  //    due = DateInvoiced + NetDays (a fixed-due term in the population makes the oracle INCONCLUSIVE, never guessed);
  //    pay-schedule invoices → one item per valid schedule, allocations consume schedules by DueDate; daysDue = statement − due;
  //    buckets: ≤0 → Not yet due, 1-7, 8-30, 31-60, 61-90, ≥91 (MAging.add bounds). Two statement dates; vacuity control.
  async function runAging(stmt, bp) {
    const n0 = PAGELOG.length;
    await page.goto(base + '/idempiere.html?login=GardenAdmin&process=238', { waitUntil: 'load' }); await page.waitForTimeout(2000);
    if (stmt) await page.fill('[data-proc-param="StatementDate"]', stmt).catch(() => {});
    if (bp) await page.fill('[data-proc-param="C_BPartner_ID"]', String(bp)).catch(() => {});
    await page.click('button[data-proc-run]').catch(() => {}); await page.waitForTimeout(1800);
    // the page prints one total row PER CURRENCY; the oracle sums amounts only, so the judge adds the total rows up.
    const shown = await page.evaluate(() => { const trs = [...document.querySelectorAll('table[data-aging] tr[data-aging-total]')]; if (!trs.length) return null;
      const o = { totalRows: trs.length }; trs.forEach(tr => tr.querySelectorAll('td[data-k]').forEach(td => { const k = td.getAttribute('data-k'); if (k === 'bpname' || k === 'iso') return;
        o[k] = Math.round(((o[k] || 0) + (Number(td.textContent) || 0)) * 100) / 100; })); return o; });
    return { line: last(n0, /§AGING /), disp: last(n0, /§AD-PROC-LIVE proc=238 /), shown };
  }
  async function agingOracle(stmt, bpOnly) {
    const day = (x) => Math.floor(Date.parse(String(x).slice(0, 10) + 'T00:00:00Z') / 86400000);
    const td = new Date(), today = td.getFullYear() + '-' + ('0' + (td.getMonth() + 1)).slice(-2) + '-' + ('0' + td.getDate()).slice(-2);
    const S = day(stmt || today), items = [];
    const inv = await q(page, "SELECT i.C_Invoice_ID, i.GrandTotal, i.IsPayScheduleValid, i.DateInvoiced, t.NetDays, t.IsDueFixed, d.DocBaseType, i.C_BPartner_ID FROM C_Invoice i " +
      "JOIN C_DocType d ON d.C_DocType_ID=i.C_DocType_ID LEFT JOIN C_PaymentTerm t ON t.C_PaymentTerm_ID=i.C_PaymentTerm_ID WHERE i.AD_Client_ID=11 AND i.IsSOTrx='Y' AND i.IsPaid='N' AND i.DocStatus IN ('CO','CL')" +
      (bpOnly ? ' AND i.C_BPartner_ID=' + Number(bpOnly) : ''));
    let fixed = 0;
    for (const r of (Array.isArray(inv) ? inv : [])) {
      const [id, gt, sched, dinv, net, fx, dbt] = r; const cm = String(dbt).charAt(2) === 'C' ? -1 : 1, ap = String(dbt).charAt(1) === 'P' ? -1 : 1;
      const paid = Number(await one(page, "SELECT COALESCE(SUM((al.Amount+al.DiscountAmt+al.WriteOffAmt)),0) FROM C_AllocationLine al JOIN C_AllocationHdr a ON a.C_AllocationHdr_ID=al.C_AllocationHdr_ID WHERE a.IsActive='Y' AND al.C_Invoice_ID=" + id)) * ap;
      if (sched !== 'Y') { if (fx === 'Y') fixed++; const open = Math.round((gt * cm - paid) * 100) / 100; if (open) items.push({ id, due: day(dinv) + Number(net || 0), open }); }
      else { let rem = paid; const ss = await q(page, "SELECT C_InvoicePaySchedule_ID, DueAmt, DueDate FROM C_InvoicePaySchedule WHERE IsValid='Y' AND C_Invoice_ID=" + id + ' ORDER BY DueDate');
        for (const [sid, amt, dd] of ss) { const o = Math.max(0, Math.round((amt * cm - rem) * 100) / 100); rem = Math.max(0, rem - amt); if (o) items.push({ id: id + '/' + sid, due: day(dd), open: o }); } }
    }
    const b = { openamt: 0, dueamt: 0, pastdue1_7: 0, pastdue8_30: 0, pastdue31_60: 0, pastdue61_90: 0, pastdue91_plus: 0, pastdueamt: 0 };
    items.forEach(it => { const dd = S - it.due, a = it.open; b.openamt += a;
      if (dd <= 0) b.dueamt += a; else { b.pastdueamt += a; if (dd <= 7) b.pastdue1_7 += a; else if (dd <= 30) b.pastdue8_30 += a; else if (dd <= 60) b.pastdue31_60 += a; else if (dd <= 90) b.pastdue61_90 += a; else b.pastdue91_plus += a; } });
    Object.keys(b).forEach(k => { b[k] = Math.round(b[k] * 100) / 100; });
    return { items: items.length, fixed, b, ids: items.map(x => x.id + ':' + (S - x.due)) };
  }
  const agingJudge = (shown, o) => !o || o.fixed ? 'I' : (o.items === 0 ? 'I' : (shown && Object.keys(o.b).every(k => Math.abs((shown[k] || 0) - o.b[k]) < 0.005) ? 'V' : 'G'));
  try {
    const A = await runAging(null, null), oA = await agingOracle(null);
    const B = await runAging('2003-11-15', null), oB = await agingOracle('2003-11-15');
    const bucketsB = Object.keys(oB.b).filter(k => k !== 'openamt' && k !== 'pastdueamt' && oB.b[k]).length;
    // VACUITY CONTROL: a customer with no open invoice — the same judge MUST refuse to verify (INCONCLUSIVE).
    const vbp = Number(await one(page, "SELECT C_BPartner_ID FROM C_BPartner WHERE AD_Client_ID=11 AND IsCustomer='Y' AND C_BPartner_ID NOT IN (SELECT C_BPartner_ID FROM C_Invoice WHERE IsPaid='N' AND AD_Client_ID=11) ORDER BY C_BPartner_ID LIMIT 1"));
    const V = await runAging(null, vbp), oV = await agingOracle(null, vbp);
    const vVerdict = agingJudge(V.shown, oV);
    say('§AGING-VACUOUS bp=' + vbp + ' oracleItems=' + oV.items + ' shown=' + JSON.stringify(V.shown) + ' ' + V.line.slice(0, 90) + ' verdict=' + ({ V: 'VERIFIED', G: 'GAP', I: 'INCONCLUSIVE' })[vVerdict]);
    const jA = agingJudge(A.shown, oA), jB = agingJudge(B.shown, oB);
    say('§S24c-DETAIL today ' + A.line.slice(0, 300) + ' | stmt ' + B.line.slice(0, 300) + ' | oracleB=' + JSON.stringify(oB));
    step('S24c', jA === 'V' && jB === 'V' && bucketsB >= 3 && vVerdict === 'I' ? 'V' : (A.disp && A.shown ? 'G' : (/dispatched=N/.test(A.disp) ? 'G' : 'I')),
      'Aging (process 238) buckets the open invoices exactly as iDempiere does (two statement dates)',
      'today: shown=' + JSON.stringify(A.shown) + ' oracle=' + JSON.stringify(oA.b) + ' items=' + oA.items + ' | 2003-11-15: shown=' + JSON.stringify(B.shown) + ' oracle=' + JSON.stringify(oB.b) +
      ' bucketsWithMoney=' + bucketsB + ' items=[' + oB.ids.join(',') + '] | vacuous=' + vVerdict + ' | ' + A.disp.slice(0, 80));
  } catch (e) { step('S24c', 'I', 'aging', 'harness: ' + e.message); }

  // ── S25 import ───────────────────────────────────────────────────────────────────────────────────────────────
  try {
    await page.evaluate(() => window.AboutDIY && window.AboutDIY.open()); await page.waitForTimeout(500);
    await page.click('.adq-segb[data-tab="diy"]').catch(() => {}); await page.waitForTimeout(600);
    const diy = await page.$eval('#adq-body', e => e.innerText).catch(() => '');
    const agents = ['odoo_agent.zip', 'Odoo', 'iDempiere', 'SAP', 'Oracle', 'Dynamics'].filter(s => diy.indexOf(s) >= 0);
    step('S25a', agents.length >= 3 ? 'V' : 'G', 'Help -> Run it yourself offers the data-in agents', 'found=[' + agents.join(',') + '] chars=' + diy.length);
    // S25b — FS-16 (§FS2n): CSV → Import File Loader (AD_Form 101, format "Example BPartner") → window 172 lists the staging
    //   rows → process 194 ImportBPartner → business partners. ORACLE = the CSV itself, parsed here independently.
    const CSV = ['IMP-001,Ali Ahmad,Jalan Satu 1,Los Angeles,CA,90001,555-0101', '"IMP-002, East","Siti Daud",Lorong Dua 2,Boston,MA,02101,555-0102',
      'IMP-003,Tan Ah Kow,Jalan Tiga 3,Concord,NH,03301,555-0103'];
    const csvSplit = (l) => { const out = []; let cur = '', qd = false; for (let i = 0; i < l.length; i++) { const ch = l[i];
      if (qd) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') qd = false; else cur += ch; }
      else if (ch === '"') qd = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
    const WANT = CSV.map(l => { const f = csvSplit(l); return { value: f[0], contact: f[1], address1: f[2], city: f[3], region: f[4], postal: f[5] }; });
    await page.goto(base + '/idempiere.html?login=GardenAdmin&window=172', { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const st0 = await status(page), before = recCount(st0);
    let n0 = PAGELOG.length;
    await page.goto(base + '/idempiere.html?login=GardenAdmin', { waitUntil: 'load' }); await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(r => { if (!r.parentElement.classList.contains('open')) r.click(); }));
    await page.click("#idmp-tree .idmp-row.leaf:has(.nm:text-is('Import File Loader'))", { timeout: 6000 });
    await page.waitForSelector('[data-imp-file]', { timeout: 8000 });
    await page.selectOption('[data-imp-format]', { label: 'Example BPartner → I_BPartner' }).catch(() => {});
    await page.setInputFiles('[data-imp-file]', { name: 'bp.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV.join('\n') + '\n') });
    await page.waitForTimeout(800);
    const preview = last(n0, /§IMPLOADER preview/);
    await page.click('[data-imp-save]'); await page.waitForTimeout(1800);
    const saved = last(n0, /§IMPLOADER saved/);
    await page.goto(base + '/idempiere.html?login=GardenAdmin&window=172', { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const after = recCount(await status(page));
    n0 = PAGELOG.length;
    const runImport = async () => {
      const m0 = PAGELOG.length;
      await page.goto(base + '/idempiere.html?login=GardenAdmin&process=194', { waitUntil: 'load' }); await page.waitForTimeout(2000);
      await page.selectOption('[data-proc-param="AD_Client_ID"]', '11').catch(() => {});
      await page.selectOption('[data-proc-param="IsValidateOnly"]', 'N').catch(() => {});
      await page.click('button[data-proc-run]').catch(() => {}); await page.waitForTimeout(2500);
      return { imp: last(m0, /§IMPORT-BP /), commit: last(m0, /§PROC-COMMIT proc=194/) };
    };
    const R1 = await runImport();
    const bpsTip = await page.evaluate(() => { const c = window.__crud; const sdb = c.kernelDb(); const g = (t) => ((c.core.listTip(sdb, t, t + '_id', [], null) || {}).rows || []);
      return { bp: g('c_bpartner'), bpl: g('c_bpartner_location'), loc: g('c_location'), usr: g('ad_user'), stg: g('i_bpartner') }; });
    const regionId = {}; for (const w of WANT) regionId[w.region] = Number(await one(page, "SELECT C_Region_ID FROM C_Region WHERE C_Country_ID=100 AND Name='" + w.region + "'"));
    const checks = WANT.map(w => {
      const bp = bpsTip.bp.find(b => b.value === w.value);
      const bpl = bp && bpsTip.bpl.find(x => String(x.c_bpartner_id) === String(bp.c_bpartner_id));
      const loc = bpl && bpsTip.loc.find(x => String(x.c_location_id) === String(bpl.c_location_id));
      const usr = bp && bpsTip.usr.find(x => String(x.c_bpartner_id) === String(bp.c_bpartner_id));
      return !!(bp && bp.name === w.value && Number(bp.ad_client_id) === 11 && loc && loc.address1 === w.address1 && loc.city === w.city && loc.postal === w.postal &&
        Number(loc.c_country_id) === 100 && Number(loc.c_region_id) === regionId[w.region] && usr && usr.name === w.contact);
    });
    const stgDone = bpsTip.stg.filter(r => r.i_isimported === 'Y' && WANT.some(w => w.value === r.value)).length;
    const R2 = await runImport();                                             // NEGATIVE CONTROL: nothing left to import
    const ins = (l) => Number((/inserted=(\d+)/.exec(l || '') || [])[1]), errs = (l) => Number((/errors=(\d+)/.exec(l || '') || [])[1]);
    say('§S25b-DETAIL preview=' + preview.slice(0, 120) + ' | ' + saved.slice(0, 120) + ' | window172 ' + before + '->' + after + ' | run1 ' + R1.imp.slice(0, 160) + ' ' + R1.commit.slice(0, 90) +
      ' | perRow=' + JSON.stringify(checks) + ' stagingImported=' + stgDone + ' | run2 ' + R2.imp.slice(0, 120));
    step('S25b', /rows=3 committed=true/.test(saved) && after === (before || 0) + 3 && ins(R1.imp) === 3 && errs(R1.imp) === 0 && /committed=true/.test(R1.commit) &&
      checks.every(Boolean) && stgDone === 3 && ins(R2.imp) === 0 ? 'V' : 'G',
      'a CSV goes through the Import File Loader into Import Business Partner and becomes business partners',
      'loaded=' + (/rows=(\d+)/.exec(saved) || [])[1] + ' window172 ' + before + '->' + after + ' import ' + R1.imp.slice(13, 120) + ' perRow=' + JSON.stringify(checks) +
      ' stagingImported=' + stgDone + ' rerun inserted=' + ins(R2.imp));
  } catch (e) { step('S25a', 'I', 'import', 'harness: ' + e.message); }

  // ── S26 backup ───────────────────────────────────────────────────────────────────────────────────────────────
  // FS-17 (§FS2o): Backup through the UI → the file's ops == the live kernel_ops; WIPE the sidecar (proven: 0 ops); a TAMPERED copy
  //   is rejected and adopts nothing (negative control); Restore through the UI → same op count, same tip, same session BPs.
  const sideState = () => page.evaluate(() => new Promise(res => { const c = window.__crud; if (!c || !c.withSidecar) return res(null);
    c.withSidecar(async (db) => { if (!db) return res({ ops: 0, tip: null, bps: [] }); const n = db.exec('SELECT COUNT(*) FROM kernel_ops'); let tip = null;
      try { const v = await window.KernelOps.verifyChain(db); tip = v && v.tip; } catch (e) {}
      const r = c.core.listTip(db, 'c_bpartner', 'c_bpartner_id', [], null); res({ ops: n.length ? n[0].values[0][0] : 0, tip, bps: ((r && r.rows) || []).map(x => x.c_bpartner_id).sort() }); }); }));
  const openDiy = async () => { await page.evaluate(() => window.AboutDIY && window.AboutDIY.open()); await page.waitForTimeout(400);
    await page.click('.adq-segb[data-tab="diy"]').catch(() => {}); await page.waitForTimeout(600); };
  try {
    await page.goto(base + '/idempiere.html?login=GardenAdmin', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    const has = await page.evaluate(() => !!(window.ErpPersist && window.ErpPersist.backup));
    const S0 = await sideState();
    await openDiy();
    const mounted = await page.$$eval('[data-erp-backup] .persist-ctl', e => e.length).catch(() => 0);
    let n0 = PAGELOG.length;
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('[data-erp-backup] .persist-btn')]);
    const snapTxt = fs.readFileSync(await dl.path(), 'utf8'), snap = JSON.parse(snapTxt);
    const bLine = last(n0, /§INTEG-WIRE-B backup/);
    // WIPE — delete the sidecar store from a same-origin page with no ERP loaded, then prove it is empty.
    await page.goto(base + '/manifest.json', { waitUntil: 'load' });
    const wiped = await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('glassbowl_kernel_ops'); q.onsuccess = () => r('ok'); q.onerror = () => r('err'); q.onblocked = () => r('blocked'); }));
    await page.goto(base + '/idempiere.html?login=GardenAdmin', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    const S1 = await sideState();
    // NEGATIVE CONTROL — one op's parameters altered: restore must REJECT and adopt nothing.
    const bad = JSON.parse(snapTxt); const k = bad.ops.findIndex(o => o.op_type === 'CRUD_CREATE');
    if (k >= 0) { const prm = JSON.parse(bad.ops[k].parameters); prm.fields = Object.assign({}, prm.fields, { name: 'TAMPERED' }); bad.ops[k].parameters = JSON.stringify(prm); }
    const neg = await page.evaluate((b) => window.ErpPersist.restore(b).then(r => ({ ok: r.ok, tipOk: r.tipOk, sigOk: r.sigOk, reason: r.reason })).catch(e => ({ err: e.message })), bad);
    const S1b = await sideState();
    await openDiy();
    n0 = PAGELOG.length;
    await page.setInputFiles('[data-erp-backup] .persist-ctl input[type=file]', { name: 'erp-backup.json', mimeType: 'application/json', buffer: Buffer.from(snapTxt) });
    for (let i = 0; i < 40 && !since(n0, /§INTEG-WIRE-B restored|restore validate tipMatch=false/).length; i++) await page.waitForTimeout(250);
    const rLine = last(n0, /§INTEG-WIRE-B restore validate/), restored = last(n0, /§INTEG-WIRE-B restored/);
    const S2 = await sideState();
    await page.waitForTimeout(800);                                             // let the restore's persist() land
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2500);
    const S3 = await sideState();                                               // the restored books survive a reload
    const ok = S3 && S3.ops === S0.ops && S3.tip === S0.tip && JSON.stringify(S3.bps) === JSON.stringify(S0.bps) && has && mounted === 1 && snap.ops.length === S0.ops && snap.tip === S0.tip && S0.ops > 0 && wiped === 'ok' && S1.ops === 0 &&
      neg && neg.ok === false && S1b.ops === 0 && /tipMatch=true sigValid=true/.test(rLine) && !!restored && S2.ops === S0.ops && S2.tip === S0.tip &&
      JSON.stringify(S2.bps) === JSON.stringify(S0.bps) && S0.bps.length > 0;
    say('§S26-DETAIL before=' + JSON.stringify({ ops: S0.ops, tip: S0.tip && S0.tip.slice(0, 12), bps: S0.bps.length }) + ' file={ops:' + snap.ops.length + ',tip:' + String(snap.tip).slice(0, 12) + ',fp:' + snap.fp + '} wipe=' + wiped +
      ' afterWipe=' + S1.ops + ' tampered=' + JSON.stringify(neg) + ' afterTamper=' + S1b.ops + ' | ' + rLine.slice(0, 120) + ' | after=' + JSON.stringify({ ops: S2.ops, tip: S2.tip && S2.tip.slice(0, 12), bps: S2.bps.length }) + ' | afterReload=' + JSON.stringify(S3 && { ops: S3.ops, tip: S3.tip && S3.tip.slice(0, 12), bps: S3.bps.length }));
    step('S26', ok ? 'V' : (has ? 'G' : 'G'), 'a signed backup / restore of my company is offered on the ERP page and round-trips',
      'ErpPersist=' + has + ' control=' + mounted + ' backupOps=' + snap.ops.length + '/' + S0.ops + ' wipe→' + S1.ops + ' tamper=' + (neg && neg.ok === false ? 'REJECTED(' + (neg.tipOk === false ? 'tip' : 'sig') + ')' : JSON.stringify(neg)) +
      ' restoreOps=' + S2.ops + ' reloadOps=' + (S3 && S3.ops) + ' tipEqual=' + (S2.tip === S0.tip) + ' bpsEqual=' + (JSON.stringify(S2.bps) === JSON.stringify(S0.bps)) + ' (' + S0.bps.length + ') ' + bLine.slice(0, 80));
  } catch (e) { step('S26', 'I', 'backup', 'harness: ' + e.message); }

  // ── S05b own chart of accounts (FS-18, spec §FS2p) — a SECOND tenant from iDempiere's own AccountingUS.csv subset. ─────────
  //    ORACLE from the file, parsed HERE (csv rows with a Default_Account): distinct Values = the chart; each required key →
  //    that line's Value. NEGATIVE CONTROL first: the file minus its C_RECEIVABLE_ACCT line must be refused, creating nothing.
  try {
    const coaTxt = fs.readFileSync(path.join(__dirname, 'fixtures', 'coa_small_AccountingUS.csv'), 'utf8');
    const csvRow = (l) => { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') q = false; else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
    const fileLines = coaTxt.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('[')).map(csvRow).filter(r => (r[7] || '').trim());
    const keyVal = {}; fileLines.forEach(r => { keyVal[r[7].trim().toUpperCase()] = r[0].trim(); });
    const distinct = new Set(fileLines.map(r => r[0].trim())).size;
    const reqKeys = await q(page, "SELECT upper(c.ColumnName), t.TableName FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE t.TableName IN ('C_AcctSchema_GL','C_AcctSchema_Default') AND c.AD_Reference_ID=25 AND c.IsActive='Y'");
    const openWizard = async () => {
      await page.goto(base + '/idempiere.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 20000 });
      await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('System'))"); await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
      await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('System'))"); await page.waitForSelector('#idmp-login-step2:visible', { timeout: 8000 });
      await page.click('#idmp-login-ok');
      await page.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0, null, { timeout: 10000 });
      await page.evaluate(() => document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(r => { if (!r.parentElement.classList.contains('open')) r.click(); }));
      await page.click("#idmp-tree .idmp-row.leaf:has(.nm:text-is('Initial Tenant Setup'))", { timeout: 6000 });
      await page.waitForSelector('[data-genesis-create]', { timeout: 8000 });
    };
    const bad = coaTxt.split(/\r?\n/).filter(l => !/"C_RECEIVABLE_ACCT"/.test(l)).join('\n');
    await openWizard();
    await page.fill('[data-genesis-name]', 'CoaBadCo'); await page.fill('[data-genesis-admin]', 'coabad');
    await page.selectOption('[data-genesis-coa]', 'file');
    await page.setInputFiles('[data-genesis-coafile]', { name: 'coa_bad.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) }); await page.waitForTimeout(600);
    await page.click('[data-genesis-create]'); await page.waitForTimeout(1500);
    const badMsg = await page.$eval('[data-genesis-error]', e => e.textContent).catch(() => '');
    const badClient = Number(await one(page, "SELECT COUNT(*) FROM AD_Client WHERE Name='CoaBadCo'"));
    await openWizard();
    await page.fill('[data-genesis-name]', 'CoaCo'); await page.fill('[data-genesis-admin]', 'coaowner');
    await page.selectOption('[data-genesis-coa]', 'file');
    let n0 = PAGELOG.length;
    await page.setInputFiles('[data-genesis-coafile]', { name: 'coa_small_AccountingUS.csv', mimeType: 'text/csv', buffer: Buffer.from(coaTxt) }); await page.waitForTimeout(600);
    await page.click('[data-genesis-create]');
    await page.waitForSelector('[data-genesis-enter]', { timeout: 25000 });
    const CID2 = Number(await one(page, "SELECT AD_Client_ID FROM AD_Client WHERE Name='CoaCo'"));
    const evN = Number(await one(page, 'SELECT COUNT(*) FROM C_ElementValue WHERE AD_Client_ID=' + CID2));
    let wrong = [], checked = 0;
    for (const [k, tbl] of (Array.isArray(reqKeys) ? reqKeys : [])) {
      const v = await one(page, 'SELECT ev.Value FROM ' + tbl + ' d JOIN C_ValidCombination vc ON vc.C_ValidCombination_ID=d.' + k + ' JOIN C_ElementValue ev ON ev.C_ElementValue_ID=vc.Account_ID WHERE d.AD_Client_ID=' + CID2);
      checked++; if (String(v) !== String(keyVal[k])) wrong.push(k + ':' + v + '≠' + keyVal[k]);
    }
    say('§S05b-DETAIL ' + since(n0, /§GENESIS-COA/).join(' | ').slice(0, 300) + ' | wrongKeys=' + JSON.stringify(wrong.slice(0, 8)));
    step('S05b', CID2 >= 17 && evN === distinct && distinct === 53 && checked === (reqKeys.length || -1) && checked > 0 && !wrong.length &&
      /Account not defined: C_RECEIVABLE_ACCT/.test(badMsg) && badClient === 0 ? 'V' : 'G',
      'Initial Tenant Setup can load your own chart of accounts file (iDempiere AccountingUS format)',
      'client=' + CID2 + ' C_ElementValue=' + evN + ' (file distinct values ' + distinct + ', rows ' + fileLines.length + ') requiredKeys checked=' + checked + ' wrong=' + wrong.length +
      ' | negative (no C_RECEIVABLE_ACCT): "' + String(badMsg).slice(0, 80) + '" clientsCreated=' + badClient);
  } catch (e) { step('S05b', 'I', 'own chart of accounts', 'harness: ' + e.message); }

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
