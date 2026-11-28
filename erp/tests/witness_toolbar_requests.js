// ⚠ DO NOT REMOVE — W-TOOLBAR-REQUESTS (bim-compiler prompts/MOBILE_PERF.md WO-35: the Requests toolbar button works like legacy iDempiere's, on every window). READ THE LOG after every run
//   (the §W-TOOLBAR-REQUESTS lines are the verdicts; the exit code is not evidence). Real page, headless Chromium, SOFTWARE rendering only (--disable-gpu), never headed.
// ORACLE (read, never guessed): WRequest.java (the popup: :109-137 menu + counts, :153-197 the restriction each entry opens window 232 with, :204-211 onNew), MRequest.getRequestCount :1049-1119,
//   MRequest.newRequest :1160-1205, AbstractADWindowContent.onRequests :3516-3527 + enableRequests(!isNewRow) :2272-2275, ADWindowToolbar :281/:307/:854-857; the message texts from the legacy
//   dictionary (docker exec postgres psql -U adempiere -d idempiere, SELECT only). Expected values below are WRITTEN HERE with the Java line beside each, never read back from the code under test.
// THE ISSUES this proves or disproves:
//   Q1 SWEEP    the button is ENABLED on a saved record of every window/tab in the dictionary whose table has a single key column (N from ad_seed.db by this file's own SQL; tabs with no row are
//               counted no_row, windows the login role cannot open unreachable - never PASS; judged = 0 -> INCONCLUSIVE)
//   Q2 COUNTS   the popup's "(n)" figures on a record with k requests == an independent SQL count (the WRequest/MRequest query written out by hand here), across 0 / active only / active + closed
//   Q3 PREFILL  "Create New Request" opens window 232 on a NEW row carrying AD_Table_ID, Record_ID, Record_UU and exactly the context columns MRequest.newRequest sets, for 6 tables it covers and 2 it
//               does not (incl. a C_ProjectLine); the module's two Java chains also equal the chains PARSED OUT of MRequest.java
//   Q4 SAVE     a request saved as type "Site Task" with a Standard Response keeps those links and then counts in the popup of the record it was issued from (+1)
//   Q5 DISABLED the button is disabled on an unsaved New row and on a tab with no row, enabled on a saved row of a tab with NO key (AbstractADWindowContent :2272-2275 asks only "new or empty")
//   Q6 L&F      the popup entries' texts == AD_Message RequestNew / RequestActive / RequestAll, in the order of WRequest :111-137; the More-popup label == AD_Message Requests
//   R1 RED      the prefill table emptied -> Q3's judge FAILS.   R2 RED the count WHERE without the record filter -> Q2's judge FAILS.
// PARITY (read-only): the count query of MRequest.getRequestCount run on the legacy pilot's database (SELECT only) for the same records == the popup figures of the twin on the same seed data.
// Run: node erp/tests/witness_toolbar_requests.js > erp/tests/witness_toolbar_requests.log   (TBR_WORKERS=4; TBR_ONLY=123,143 limits the sweep; TBR_PART=sweep|rest|all)
'use strict';
const os = require('os'), http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const initSqlJs = require(process.env.SQLJS || (os.homedir() + '/bim-ootb/node_modules/sql.js'));
const REPO = path.join(__dirname, '..', '..');
const PAGELOGF = path.join(__dirname, 'witness_toolbar_requests.page.log');
const PART = process.env.TBR_PART || 'all', WORKERS = Number(process.env.TBR_WORKERS || 4);
const JAVA_MREQ = os.homedir() + '/idempiere-dev-setup/idempiere/org.adempiere.base/src/org/compiere/model/MRequest.java';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(REPO, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': buf.length }); res.end(buf); });
});
const PAGELOG = []; const say = s => console.log(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pg = sql => cp.execFileSync('docker', ['exec', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere', '-Atc', sql], { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();   // READ ONLY: SELECTs only

// ── the judges (pure; each red control feeds a deliberately wrong input and must get FAIL) ──
const CTX = ['c_bpartner_id', 'ad_user_id', 'c_project_id', 'a_asset_id', 'c_order_id', 'c_invoice_id', 'm_product_id', 'c_payment_id', 'm_inout_id', 'm_rma_id', 'c_campaign_id', 'r_requestrelated_id'];
// Q3: the stored row equals the expectation on AD_Table_ID, Record_ID, Record_UU and EVERY context column (a column the Java does not set must be empty)
function judgePrefill(row, exp) {
  const bad = [];
  ['ad_table_id', 'record_id'].forEach(c => { if (Number(row[c]) !== Number(exp[c])) bad.push(c + ' got ' + row[c] + ' want ' + exp[c]); });
  if ((row.record_uu || null) !== (exp.record_uu || null)) bad.push('record_uu got ' + row.record_uu + ' want ' + exp.record_uu);
  CTX.forEach(c => { const want = exp[c] == null ? null : Number(exp[c]), got = row[c] == null ? null : Number(row[c]); if (got !== want) bad.push(c + ' got ' + got + ' want ' + want); });
  return bad.length ? { v: 'FAIL', bad } : { v: 'PASS', bad };
}
// Q2: the popup's entries == the entries computed from the independent counts (labels from the legacy message texts, WRequest :111-137 order and conditions)
function judgeCounts(popupTexts, counts, msg) {
  const [inactive, active] = counts, want = [msg.RequestNew];
  if (active > 0) want.push(msg.RequestActive + ' (' + active + ')');
  if (inactive > 0) want.push(msg.RequestAll + ' (' + (active + inactive) + ')');
  return JSON.stringify(popupTexts) === JSON.stringify(want) ? { v: 'PASS', want } : { v: 'FAIL', want, got: popupTexts };
}
const judgeEnabled = (hasRow, disabled) => hasRow ? (disabled ? 'FAIL' : 'PASS') : 'NOROW';

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(REPO, 'erp', 'ad_seed.db'))));
  const Q = (s, p) => { const r = p ? db.exec(s, p) : db.exec(s); return r.length ? r[0].values : []; };
  const has = t => Q("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)", [t]).length > 0;
  const access = (role, w) => Q("SELECT 1 FROM AD_Window_Access WHERE AD_Role_ID=? AND AD_Window_ID=? AND IsActive='Y'", [role, w]).length > 0;
  const tableIdOf = n => Number(Q("SELECT AD_Table_ID FROM AD_Table WHERE lower(TableName)=lower(?)", [n])[0][0]);

  // ── population from the dictionary: every active tab of every active window, with the number of IsKey columns of its table ──
  const TABS = [];
  for (const [wid, wname] of Q("SELECT AD_Window_ID, Name FROM AD_Window WHERE IsActive='Y' ORDER BY AD_Window_ID")) {
    Q("SELECT t.AD_Tab_ID, t.Name, tb.TableName, tb.AD_Table_ID, (SELECT COUNT(*) FROM AD_Column c WHERE c.AD_Table_ID=tb.AD_Table_ID AND c.IsKey='Y' AND c.IsActive='Y') FROM AD_Tab t JOIN AD_Table tb ON tb.AD_Table_ID=t.AD_Table_ID WHERE t.AD_Window_ID=? AND t.IsActive='Y' ORDER BY t.SeqNo", [wid])
      .forEach(([tid, tname, table, tableId, keys], idx) => TABS.push({ wid, wname, idx, tid, tname, table, tableId, keys: Number(keys), single: Number(keys) === 1, inSeed: has(table) }));
  }
  const SINGLE = TABS.filter(t => t.single), NOKEY = TABS.filter(t => t.keys === 0);
  say('§W-TOOLBAR-REQUESTS population tabs=' + TABS.length + ' single-key(N)=' + SINGLE.length + ' no-key=' + NOKEY.length + ' multi-key=' + (TABS.length - SINGLE.length - NOKEY.length) + ' windows=' + new Set(SINGLE.map(t => t.wid)).size + ' (ad_seed.db, this witness\'s own SQL)');
  const loginFor = wid => access(102, wid) ? 'GardenAdmin' : null;   // ?login= takes the user's first role (SuperUser's first role is 102 too); a window outside role 102 cannot be opened by an unattended login: counted unreachable, never passed

  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp/idempiere.html';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--disable-gpu-compositing'] });
  const CHECKS = {}, RED = {};
  const check = (id, v, why) => { CHECKS[id] = v; say('§W-TOOLBAR-REQUESTS-CHECK ' + id + ' ' + v + (why ? ' — ' + why : '')); };

  async function newPage(tag) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage(); const PL = [];
    page.on('console', m => { const t = m.text(); PL.push(t); PAGELOG.push('[' + tag + '] ' + t); });
    page.on('pageerror', e => { PL.push('PAGEERR ' + e); PAGELOG.push('[' + tag + '] PAGEERR ' + e); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    return { ctx, page, PL };
  }
  async function openWin(page, login, wid, record, tmo) {
    for (let g = 0; g < 3; g++) {
      try { await page.goto('about:blank'); await page.goto(base + '?login=' + login + '&window=' + wid + (record != null ? '&record=' + record : ''), { waitUntil: 'load' }); break; }
      catch (e) { if (g === 2) throw e; await sleep(1500); }
    }
    await page.waitForFunction(() => document.querySelector('#idmp-toolbar button[data-tb="new"]') && window.IdmpGridTab, null, { timeout: tmo || 40000 });
    await sleep(900);
  }
  const clickTab = async (page, i) => { for (let a = 0; ; a++) { try { const ok = await page.evaluate(k => { const t = document.querySelectorAll('#idmp-tabstrip .idmp-adtab')[k]; if (!t) return false; t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); t.click(); return true; }, i); if (!ok) throw new Error('no tab ' + i); break; } catch (e) { if (a >= 1) throw e; await sleep(1500); } } await sleep(900); };   // a strip with many tabs overflows: click through the DOM
  const snap = page => page.evaluate(() => window.IdmpGridTab.snapshot());
  // the Requests button lives in the More popup (AD_ToolBarButton 200055 IsShowMore='Y'): open it, read the row, close it again
  // (the page closes a popup with a one-shot document click listener; to close one without a real click, fire that click so no listener is left to kill the next popup)
  const clickAway = async page => { await sleep(40); await page.evaluate(() => document.dispatchEvent(new MouseEvent('click', { bubbles: true }))); };
  const reqBtn = async page => {
    const o = await page.evaluate(() => {
      const m = document.querySelector('#idmp-toolbar button[data-tb="showmore"]'); if (!m) return null;
      m.click(); const r = document.querySelector('#idmp-tb-more [data-tb-more="requests"]'); return r ? { disabled: r.disabled, label: r.textContent } : { missing: true };
    });
    await clickAway(page); await page.evaluate(() => { const p = document.getElementById('idmp-tb-more'); if (p) p.remove(); });
    return o && o.missing ? null : o;
  };
  // the popup: More -> Requests (real clicks), the entries read from the DOM
  async function openPopup(page) {
    await closePopup(page);
    await page.click('#idmp-toolbar button[data-tb="showmore"]', { timeout: 8000 }); await sleep(250);
    const dis = await page.$eval('#idmp-tb-more [data-tb-more="requests"]', b => b.disabled);
    if (dis) { await clickAway(page); await page.evaluate(() => { const p = document.getElementById('idmp-tb-more'); if (p) p.remove(); }); return null; }
    await page.click('#idmp-tb-more [data-tb-more="requests"]', { timeout: 8000 }); await sleep(450);
    return page.$$eval('#idmp-req-pop [data-req]', bs => bs.map(b => ({ id: b.getAttribute('data-req'), text: b.textContent.trim() })));
  }
  const closePopup = async page => { await clickAway(page); await page.evaluate(() => { const o = document.getElementById('idmp-req-pop'); if (o) o.remove(); }); };
  const tip = (page, sql) => page.evaluate(s => window.__crud.withModelTrx(q => q(s, [])), sql);
  const setFld = (page, col, val) => page.evaluate(([c, v]) => { const e = document.querySelector('#idmp-inline-mount select[data-col="' + c + '"], #idmp-inline-mount input[data-col="' + c + '"]'); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; }, [col, String(val)]);
  const getFld = (page, col) => page.evaluate(c => { const e = document.querySelector('#idmp-inline-mount select[data-col="' + c + '"], #idmp-inline-mount input[data-col="' + c + '"]'); return e ? e.value : null; }, col);

  // ════════ Q1 sweep ════════
  if (PART === 'all' || PART === 'sweep') {
    const ONLY = process.env.TBR_ONLY ? process.env.TBR_ONLY.split(',').map(Number) : null;
    const allWins = [...new Set(TABS.map(t => t.wid))].filter(w => !ONLY || ONLY.includes(w)), wins = allWins.filter(loginFor);
    const R = { judged: 0, pass: 0, no_row: 0, unreachable: 0, not_opened: 0, bad: [], stale: [], winFail: [], nk: { judged: 0, enabled: 0, no_row: 0, bad: [] } };
    R.unreachable = SINGLE.filter(t => allWins.includes(t.wid) && !loginFor(t.wid)).length;
    const queue = wins.slice(); const tabsOf = w => TABS.filter(t => t.wid === w);
    async function worker(k) {
      let { ctx, page } = await newPage('s' + k);
      while (queue.length) {
        const w = queue.shift(), T = tabsOf(w), tm = Date.now(), done = new Set();
        const miss = t => { if (!done.has(t.idx)) { done.add(t.idx); if (t.single) R.not_opened++; } };
        try {
          if (page.isClosed()) { try { await ctx.close(); } catch (e) { /* gone */ } ({ ctx, page } = await newPage('s' + k + 'r')); }
          await openWin(page, loginFor(w), w, null, 14000);
          const nTabs = await page.$$eval('#idmp-tabstrip .idmp-adtab', e => e.length);
          for (const t of T) {
            try {
              if (t.idx >= nTabs) { miss(t); continue; }
              if (t.idx > 0) await clickTab(page, t.idx); else await sleep(300);
              let sn = null; try { sn = await snap(page); } catch (e) { /* tab did not render */ }
              if (!sn || String(sn.table).toLowerCase() !== String(t.table).toLowerCase()) { miss(t); continue; }
              const hasRow = sn.rows.length > 0 && sn.currentKey != null && !sn.newMode, hasAny = sn.rows.length > 0 && !sn.newMode;
              let b = await reqBtn(page);
              if (!b) { miss(t); continue; }
              done.add(t.idx);
              if (t.single) {
                let v = judgeEnabled(hasRow, b.disabled);
                if (v === 'FAIL') { await page.click('#idmp-toolbar button[data-tb="refresh"]', { timeout: 4000 }).catch(() => {}); await sleep(1500); b = await reqBtn(page); if (b && !b.disabled) { R.stale.push(w + ':' + t.tname + ':' + t.table); v = 'STALE'; } }
                if (v === 'NOROW') R.no_row++; else if (v === 'STALE') { /* counted apart, never PASS */ } else { R.judged++; if (v === 'PASS') R.pass++; else R.bad.push(w + ':' + t.tname + ':' + t.table); }
              } else if (t.keys === 0) {   // Q5: a tab with NO key column: legacy still enables the button on a saved row (the Java asks only new/empty)
                if (!hasAny) R.nk.no_row++; else { R.nk.judged++; if (!b.disabled) R.nk.enabled++; else R.nk.bad.push(w + ':' + t.tname + ':' + t.table); }
              }
            } catch (e) { miss(t); R.winFail.push(w + ':' + t.tname + ':tab:' + String(e && e.message || e).split('\n')[0].slice(0, 60)); }
          }
        } catch (e) { T.forEach(miss); R.winFail.push(w + ':' + String(e && e.message || e).split('\n')[0].slice(0, 80)); }
        say('§W-TOOLBAR-REQUESTS-SWEEP window=' + w + ' tabs=' + T.length + ' ms=' + (Date.now() - tm));
      }
      try { await ctx.close(); } catch (e) { /* gone */ }
    }
    await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)));
    say('§TOOLBAR_REQUESTS windows=' + new Set(SINGLE.map(t => t.wid)).size + ' tabs=' + SINGLE.length + ' judged=' + R.judged + ' pass=' + R.pass + ' no_row=' + R.no_row + ' unreachable=' + R.unreachable + ' not_opened=' + R.not_opened + ' stale=' + R.stale.length + ' fail=' + R.bad.length);
    if (R.bad.length) say('§W-TOOLBAR-REQUESTS-SWEEP enabled-expected-but-disabled: ' + R.bad.slice(0, 40).join(' ; '));
    if (R.stale.length) say('§W-TOOLBAR-REQUESTS-SWEEP stale (disabled until a Refresh; not counted as pass): ' + R.stale.slice(0, 40).join(' ; '));
    if (R.winFail.length) say('§W-TOOLBAR-REQUESTS-SWEEP window/tab failures: ' + R.winFail.slice(0, 20).join(' ; '));
    say('§W-TOOLBAR-REQUESTS-NOKEY tabs judged=' + R.nk.judged + ' enabled=' + R.nk.enabled + ' no_row=' + R.nk.no_row + ' disabled=' + R.nk.bad.length + (R.nk.bad.length ? ' ' + R.nk.bad.slice(0, 10).join(' ; ') : ''));
    SWEEP = R;
    if (R.judged === 0) check('Q1', 'INCONCLUSIVE', 'judged=0'); else check('Q1', (R.bad.length === 0 && R.stale.length === 0 && R.not_opened === 0 && R.winFail.length === 0) ? 'PASS' : 'FAIL', 'pass=' + R.pass + ' of judged=' + R.judged + ' (no_row=' + R.no_row + ' unreachable=' + R.unreachable + ' not_opened=' + R.not_opened + ' stale=' + R.stale.length + ')');
  }

  // ════════ Q2..Q6, R1, R2, PARITY ════════
  if (PART === 'all' || PART === 'rest') {
    // legacy message texts (the oracle), SELECT only
    const msg = {}; pg("SELECT value || '|' || msgtext FROM ad_message WHERE ad_client_id=0 AND value IN ('RequestNew','RequestActive','RequestAll','Requests')").split('\n').forEach(l => { const i = l.indexOf('|'); msg[l.slice(0, i)] = l.slice(i + 1); });
    say('§W-TOOLBAR-REQUESTS-MSG oracle(legacy AD_Message)=' + JSON.stringify(msg));
    const { page, PL } = await newPage('rest');
    const seedRow = (t, k, id) => { const r = db.exec('SELECT * FROM ' + t + ' WHERE ' + k + '=' + id); return r.length ? Object.fromEntries(r[0].columns.map((c, i) => [c.toLowerCase(), r[0].values[0][i]])) : null; };
    const tabHasCol = (tabId, col) => Q("SELECT 1 FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE f.AD_Tab_ID=? AND f.IsActive='Y' AND lower(c.ColumnName)=lower(?)", [tabId, col]).length > 0;
    const stored = async id => (await tip(page, 'SELECT * FROM r_request WHERE r_request_id=' + id))[0] || null;
    // create a request from the record on screen: popup -> Create New Request -> type Site Task + a Standard Response (+ optional status) -> Save. Returns {id, preForm, popup}
    async function issueRequest(o) {
      const popup = await openPopup(page); if (!popup) return { err: 'button disabled' };
      await page.click('#idmp-req-pop [data-req="new"]'); await page.waitForSelector('.idmp-form-new #idmp-inline-mount .cfrow', { timeout: 15000 }); await sleep(900);
      const preForm = { ad_table_id: await getFld(page, 'ad_table_id'), record_id: await getFld(page, 'record_id'), record_uu: await getFld(page, 'record_uu') };
      await setFld(page, 'summary', o.summary); await setFld(page, 'r_requesttype_id', 990001); await setFld(page, 'r_standardresponse_id', 100); if (o.status) await setFld(page, 'r_status_id', o.status); await sleep(400);
      const n = PL.length;
      await page.evaluate(() => document.querySelector('#idmp-inline-mount .ic-vb[data-v="save"]').click());
      for (let i = 0; i < 40 && !PL.slice(n).some(l => /^§CRUD-PERSIST key=r_request .*op=CRUD_CREATE/.test(l)); i++) await sleep(250);
      await sleep(700);
      const sn = await snap(page), id = sn.currentKey;
      return { id, preForm, popup, saved: PL.slice(n).some(l => /^§CRUD-PERSIST key=r_request .*op=CRUD_CREATE/.test(l)), window: sn.window };
    }
    const popupTexts = pop => pop && pop.map(e => e.text);
    const sameCtx = row => CTX.map(c => c + '=' + row[c]).filter(s => !/=null$/.test(s)).join(',');

    // ── Q2 counts (+ Q6 texts): Sales Order 101 has no request; issue 2 active, then 1 closed (status Verified: IsClosed -> Processed=Y, model layer) ──
    const O2 = 101, O2uu = seedRow('c_order', 'c_order_id', O2).c_order_uu, T_ORDER = tableIdOf('C_Order');
    const goOrder = async (rec, tab) => { await openWin(page, 'GardenAdmin', 143, rec); if (tab) await clickTab(page, tab); };
    // the independent count: MRequest.getRequestCount :1057-1110 written out for C_Order (table 259): (AD_Table_ID=? AND Record_UU=?) OR C_Order_ID=?  [Record_UU used when the row has a UU, :1060-1066]
    const indep = async (tableId, uu, col, rec) => { const rows = await tip(page, "SELECT Processed AS p, COUNT(*) AS n FROM R_Request WHERE (AD_Table_ID=" + tableId + " AND Record_UU='" + uu + "') OR " + col + "=" + rec + " GROUP BY Processed ORDER BY Processed DESC");
      return rows.reduce((c, r) => { c[r.p === 'Y' ? 0 : 1] += Number(r.n); return c; }, [0, 0]); };
    const q2 = [], q6 = [];
    const stateCheck = async label => {
      await goOrder(O2); const pop = await openPopup(page), c = await indep(T_ORDER, O2uu, 'C_Order_ID', O2), j = judgeCounts(popupTexts(pop), c, msg);
      q2.push(j.v + ' ' + label + ' counts[inactive,active]=' + JSON.stringify(c) + ' popup=' + JSON.stringify(popupTexts(pop))); q6.push({ label, pop, j }); await closePopup(page); return { pop, c, j };
    };
    let s0 = await stateCheck('k=0');
    const a1 = await issueRequest({ summary: 'WO35 q2 a1' }); const a2 = await goOrder(O2).then(() => issueRequest({ summary: 'WO35 q2 a2' }));
    let s2 = await stateCheck('k=2 active');
    const cl = await goOrder(O2).then(() => issueRequest({ summary: 'WO35 q2 closed', status: 990005 }));
    let s3 = await stateCheck('k=3 (2 active + 1 closed)');
    say('§W-TOOLBAR-REQUESTS-Q2 created=' + JSON.stringify([a1.id, a2.id, cl.id]) + ' states: ' + q2.join(' || '));
    const q2ok = [s0, s2, s3].every(s => s.j.v === 'PASS') && s0.c[0] + s0.c[1] === 0 && s2.c[1] === 2 && s3.c[0] === 1 && s3.c[1] === 2 && popupTexts(s0.pop).length === 1 && popupTexts(s2.pop).length === 2 && popupTexts(s3.pop).length === 3;
    check('Q2', q2ok ? 'PASS' : 'FAIL', q2.join(' | '));

    // ── R2: the count WHERE without the record filter -> the same judge must say FAIL ──
    await goOrder(O2); await page.evaluate(() => { window.__sv = window.AdToolbar.requests.where; window.AdToolbar.requests.where = function () { return '1=1'; }; });
    const popR2 = await openPopup(page), cR2 = await indep(T_ORDER, O2uu, 'C_Order_ID', O2), jR2 = judgeCounts(popupTexts(popR2), cR2, msg);
    await closePopup(page); await page.evaluate(() => { window.AdToolbar.requests.where = window.__sv; });
    say('§W-TOOLBAR-REQUESTS-R2 count WHERE without the record filter: judge=' + jR2.v + ' popup=' + JSON.stringify(popupTexts(popR2)) + ' independent=' + JSON.stringify(cR2)); RED.R2 = jR2.v === 'FAIL';

    // ── Q6 L&F: entries' texts == the legacy messages, in WRequest order; the More row label; (state k=3 shows all three entries) ──
    const lf = [];
    const ent3 = popupTexts(s3.pop), exp3 = [msg.RequestNew, msg.RequestActive + ' (2)', msg.RequestAll + ' (3)'];
    if (JSON.stringify(ent3) !== JSON.stringify(exp3)) lf.push('entries ' + JSON.stringify(ent3) + ' != ' + JSON.stringify(exp3));
    const ids3 = s3.pop.map(e => e.id); if (JSON.stringify(ids3) !== JSON.stringify(['new', 'active', 'all'])) lf.push('order ' + ids3);
    await goOrder(O2); const rb = await reqBtn(page); if (!rb || rb.label.trim() !== msg.Requests) lf.push('More label ' + JSON.stringify(rb) + ' != ' + msg.Requests);
    const tt = await page.evaluate(() => { const m = document.querySelector('#idmp-toolbar button[data-tb="showmore"]'); return m ? m.title : null; });
    say('§W-TOOLBAR-REQUESTS-Q6 entries=' + JSON.stringify(ent3) + ' ids=' + JSON.stringify(ids3) + ' moreLabel=' + JSON.stringify(rb) + ' oracle=' + JSON.stringify(msg));
    check('Q6', lf.length === 0 ? 'PASS' : 'FAIL', lf.join(' | ') || 'entries, order and More label equal the legacy AD_Message texts');

    // ── Q3 prefill (+ Q4 save/count) ──
    // expected = MRequest.newRequest written here: AD_Table_ID/Record_ID/Record_UU :1162-1164; C_BPartner_ID of the current row :1166-1167 (onRequests :3520-3523: only when the TAB has that field);
    // then the one column of the table's branch :1169-1198, or the C_Order_ID of an order line :1199-1205. Each case lists its Java line.
    const bpOf = (tabId, row) => (tabHasCol(tabId, 'C_BPartner_ID') && row.c_bpartner_id != null) ? Number(row.c_bpartner_id) : null;
    const prodRec = Q("SELECT M_Product_ID FROM M_Product WHERE AD_Client_ID=11 ORDER BY M_Product_ID LIMIT 1")[0][0];
    const lineRec = Q("SELECT l.C_OrderLine_ID, l.C_Order_ID FROM C_OrderLine l WHERE l.C_Order_ID=100 ORDER BY l.Line, l.C_OrderLine_ID LIMIT 1")[0];
    const CASES = [
      { name: 'C_BPartner', win: 123, rec: 120, tab: 0, t: 'C_BPartner', k: 'c_bpartner_id', col: { c_bpartner_id: 120 }, java: 'MRequest.java:1169-1170 (C_BPartner_ID = Record_ID; :1166-1167 gives the same value)' },
      { name: 'AD_User', win: 108, rec: 105, tab: 0, t: 'AD_User', k: 'ad_user_id', col: { ad_user_id: 105 }, java: 'MRequest.java:1171-1172 (AD_User_ID = Record_ID); the user row\'s C_BPartner_ID only if the tab has the field' },
      { name: 'C_Project', win: 130, rec: 101, tab: 0, t: 'C_Project', k: 'c_project_id', col: { c_project_id: 101 }, java: 'MRequest.java:1174-1175' },
      { name: 'C_Order', win: 143, rec: 102, tab: 0, t: 'C_Order', k: 'c_order_id', col: { c_order_id: 102 }, java: 'MRequest.java:1179-1180 + :1166-1167 (the order\'s C_BPartner_ID)' },
      { name: 'M_Product', win: 140, rec: prodRec, tab: 0, t: 'M_Product', k: 'm_product_id', col: { m_product_id: prodRec }, java: 'MRequest.java:1184-1185' },
      { name: 'C_OrderLine', win: 143, rec: 100, tab: 1, t: 'C_OrderLine', k: 'c_orderline_id', line: lineRec, col: { c_order_id: lineRec[1] }, java: 'MRequest.java:1199-1205 (C_Order_ID of the line; nothing else of the line)' },
      { name: 'M_Warehouse (not covered)', win: 139, rec: Q("SELECT M_Warehouse_ID FROM M_Warehouse WHERE AD_Client_ID=11 ORDER BY 1 LIMIT 1")[0][0], tab: 0, t: 'M_Warehouse', k: 'm_warehouse_id', col: {}, java: 'no branch in MRequest.newRequest :1161-1205: only :1162-1164 (+ :1166-1167 if the tab has C_BPartner_ID)' },
      { name: 'C_ProjectLine (not covered)', win: 130, rec: 101, tab: 1, t: 'C_ProjectLine', k: 'c_projectline_id', col: {}, java: 'no C_ProjectLine branch: AD_Table_ID/Record_ID/Record_UU only; NOT C_Project_ID, NOT M_Product_ID, NOT C_Order_ID of the line' }
    ];
    const q3 = [], q4 = [], created = {};
    async function runCase(cs, o) {
      o = o || {};
      await openWin(page, 'GardenAdmin', cs.win, cs.rec); if (cs.tab) await clickTab(page, cs.tab);
      if (o.afterNav) await o.afterNav();   // a page reload drops an in-page patch, so a red control patches AFTER the navigation
      const sn = await snap(page); const recId = sn.currentKey;   // the tab's current row
      if (String(sn.table).toLowerCase() !== cs.t.toLowerCase()) return { err: 'tab shows ' + sn.table + ' not ' + cs.t };
      const row = seedRow(cs.t, cs.k, recId); if (!row) return { err: 'no seed row ' + cs.t + '#' + recId };
      const tid = tableIdOf(cs.t), tabId = (TABS.find(t => t.wid === cs.win && t.idx === cs.tab) || {}).tid;
      const uu = row[cs.t.toLowerCase() + '_uu'] || null;
      const exp = { ad_table_id: tid, record_id: Number(recId), record_uu: uu };
      CTX.forEach(c => { exp[c] = null; });
      const bp = (o.noBp) ? null : bpOf(tabId, row); if (bp != null) exp.c_bpartner_id = bp;
      Object.keys(cs.col).forEach(c => { exp[c] = cs.col[c]; });
      if (cs.line) exp.c_order_id = Number(row.c_order_id);   // the line's own C_Order_ID, from the seed row
      // popup count BEFORE (independent query on the record's own where, per the Java chain written out above)
      const orCol = { AD_User: ['AD_User_ID', 'SalesRep_ID'], C_BPartner: ['C_BPartner_ID'], C_Order: ['C_Order_ID'], C_Invoice: ['C_Invoice_ID'], C_Payment: ['C_Payment_ID'], M_Product: ['M_Product_ID'], C_Project: ['C_Project_ID'], C_Campaign: ['C_Campaign_ID'], A_Asset: ['A_Asset_ID'] }[cs.t] || [];
      const w = "(AD_Table_ID=" + tid + (uu ? " AND Record_UU='" + uu + "'" : " AND Record_ID=" + recId) + ")" + orCol.map(c => ' OR ' + c + '=' + recId).join('');
      const cnt = async () => { const rows = await tip(page, 'SELECT COUNT(*) AS n FROM R_Request WHERE (' + w + ") AND Processed='N'"); return Number(rows[0].n); };
      const before = await cnt();
      const r = await issueRequest({ summary: 'WO35 ' + cs.name });
      if (r.err) return { err: r.err };
      const rowS = await stored(r.id); const after = await cnt();
      // re-open the origin record's popup: the active entry must show before+1
      await openWin(page, 'GardenAdmin', cs.win, cs.rec); if (cs.tab) await clickTab(page, cs.tab);
      const pop = await openPopup(page); await closePopup(page);
      const act = (pop || []).find(e => e.id === 'active');
      return { exp, rowS, preForm: r.preForm, before, after, popAfter: act ? act.text : null, popBefore: r.popup.find(e => e.id === 'active') ? r.popup.find(e => e.id === 'active').text : null, recId, java: cs.java };
    }
    for (const cs of CASES) {
      let res; try { res = await runCase(cs); } catch (e) { res = { err: String(e && e.message || e).split('\n')[0].slice(0, 120) }; }
      if (res.err) { q3.push('INCONCLUSIVE ' + cs.name + ' ' + res.err); q4.push('INCONCLUSIVE ' + cs.name + ' ' + res.err); continue; }
      const j = judgePrefill(res.rowS || {}, res.exp);
      const pf = []; if (Number(res.preForm.ad_table_id) !== res.exp.ad_table_id) pf.push('form ad_table_id ' + res.preForm.ad_table_id); if (Number(res.preForm.record_id) !== res.exp.record_id) pf.push('form record_id ' + res.preForm.record_id); if ((res.preForm.record_uu || null) !== (res.exp.record_uu || null)) pf.push('form record_uu ' + res.preForm.record_uu);
      q3.push((j.v === 'PASS' && !pf.length ? 'PASS ' : 'FAIL ') + cs.name + ' {' + sameCtx(res.rowS || {}) + ' table=' + (res.rowS || {}).ad_table_id + ' record=' + (res.rowS || {}).record_id + '} [' + res.java + ']' + (j.bad.length || pf.length ? ' BAD ' + j.bad.concat(pf).join('; ') : ''));
      // Q4: stored links (type Site Task 990001, Standard Response 100) and the popup count of the origin record +1
      const q4bad = []; const rs = res.rowS || {};
      if (Number(rs.r_requesttype_id) !== 990001) q4bad.push('type ' + rs.r_requesttype_id); if (Number(rs.r_standardresponse_id) !== 100) q4bad.push('standard response ' + rs.r_standardresponse_id);
      if (res.after !== res.before + 1) q4bad.push('independent active count ' + res.before + ' -> ' + res.after); if (!res.popAfter || res.popAfter !== msg.RequestActive + ' (' + res.after + ')') q4bad.push('popup after ' + res.popAfter + ' want ' + msg.RequestActive + ' (' + res.after + ')');
      q4.push((q4bad.length ? 'FAIL ' : 'PASS ') + cs.name + ' active ' + res.before + '->' + res.after + ' popup="' + res.popAfter + '" type=' + rs.r_requesttype_id + ' stdresp=' + rs.r_standardresponse_id + (q4bad.length ? ' BAD ' + q4bad.join('; ') : ''));
      created[cs.name] = res;
    }
    q3.forEach(l => say('§W-TOOLBAR-REQUESTS-Q3 ' + l)); q4.forEach(l => say('§W-TOOLBAR-REQUESTS-Q4 ' + l));
    // the two Java chains PARSED out of MRequest.java == the module's data (a drift guard on the lists themselves)
    const src = fs.readFileSync(JAVA_MREQ, 'utf8'), CLS = { MUser: 'ad_user', MBPartner: 'c_bpartner', MOrder: 'c_order', MInvoice: 'c_invoice', MPayment: 'c_payment', MProduct: 'm_product', MProject: 'c_project', MCampaign: 'c_campaign', MAsset: 'a_asset', MInOut: 'm_inout', MRMA: 'm_rma', MRequest: 'r_request', MOrderLine: 'c_orderline' };
    const cut = (a, b) => { const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i)); };
    const orJava = {}; for (const m of cut('whereClause.append("(AD_Table_ID=?");', 'String sql = "SELECT Processed').matchAll(/AD_Table_ID == (\w+)\.Table_ID\)\s*\{\s*whereClause\.append\("((?: OR \w+=\?)+)"\)/g)) orJava[CLS[m[1]]] = [...m[2].matchAll(/OR (\w+)=\?/g)].map(x => x[1]);
    const pfJava = {}; for (const m of cut('public static void newRequest(GridTab tab, int AD_Table_ID, int Record_ID, String Record_UU', '}\t//\tMRequest').matchAll(/AD_Table_ID == (\w+)\.Table_ID\)\s*\n?\s*tab\.setValue\((?:"(\w+)"|MRequest\.COLUMNNAME_(\w+)),/g)) pfJava[CLS[m[1]]] = m[2] || m[3];
    const modOr = await page.evaluate(() => window.AdToolbar.requests.COUNT_OR), modPf = await page.evaluate(() => window.AdToolbar.requests.PREFILL), modRow = await page.evaluate(() => window.AdToolbar.requests.PREFILL_FROM_ROW);
    const same = (a, b) => JSON.stringify(Object.keys(a).sort().map(k => [k.toLowerCase(), [].concat(a[k]).join(',').toLowerCase()])) === JSON.stringify(Object.keys(b).sort().map(k => [k.toLowerCase(), [].concat(b[k]).join(',').toLowerCase()]));
    const chainBad = []; if (!same(orJava, modOr)) chainBad.push('count chain java=' + JSON.stringify(orJava) + ' module=' + JSON.stringify(modOr)); if (!same(pfJava, modPf)) chainBad.push('prefill chain java=' + JSON.stringify(pfJava) + ' module=' + JSON.stringify(modPf));
    if (!/MOrderLine\.Table_ID[\s\S]{0,200}COLUMNNAME_C_Order_ID/.test(src) || JSON.stringify(modRow) !== '{"c_orderline":"C_Order_ID"}') chainBad.push('order-line branch ' + JSON.stringify(modRow));
    say('§W-TOOLBAR-REQUESTS-Q3 java chains parsed from MRequest.java: count-OR tables=' + Object.keys(orJava).length + ' prefill tables=' + Object.keys(pfJava).length + ' + C_OrderLine branch' + (chainBad.length ? ' DIFFER ' + chainBad.join(' | ') : ' == the module\'s data'));
    const q3ok = q3.length === CASES.length && q3.every(l => l.startsWith('PASS')) && !chainBad.length;
    check('Q3', q3.some(l => l.startsWith('INCONCLUSIVE')) ? 'INCONCLUSIVE' : (q3ok ? 'PASS' : 'FAIL'), 'cases=' + q3.length + ' pass=' + q3.filter(l => l.startsWith('PASS')).length + (chainBad.length ? ' chains differ' : ' chains equal the Java'));
    check('Q4', q4.some(l => l.startsWith('INCONCLUSIVE')) ? 'INCONCLUSIVE' : (q4.length === CASES.length && q4.every(l => l.startsWith('PASS')) ? 'PASS' : 'FAIL'), 'cases=' + q4.length + ' pass=' + q4.filter(l => l.startsWith('PASS')).length);

    // ── R1: the prefill table emptied -> Q3's judge FAILS on the C_Order case ──
    let r1 = null; try { r1 = await runCase(Object.assign({}, CASES[3], { rec: 108, col: { c_order_id: 108 } }), { afterNav: () => page.evaluate(() => { window.__svPf = Object.assign({}, window.AdToolbar.requests.PREFILL); Object.keys(window.AdToolbar.requests.PREFILL).forEach(k => delete window.AdToolbar.requests.PREFILL[k]); }) }); } catch (e) { r1 = { err: String(e && e.message || e).slice(0, 100) }; }
    const jR1 = r1 && !r1.err ? judgePrefill(r1.rowS || {}, r1.exp) : { v: 'INCONCLUSIVE', bad: [r1 && r1.err] };
    say('§W-TOOLBAR-REQUESTS-R1 prefill table emptied: judge=' + jR1.v + ' ' + JSON.stringify(jR1.bad)); RED.R1 = jR1.v === 'FAIL';

    // ── Q5 disabled states ──
    const q5 = [];
    await openWin(page, 'GardenAdmin', 123, 120); const bSaved = await reqBtn(page);
    if (!bSaved || bSaved.disabled) q5.push('saved BP row: button ' + JSON.stringify(bSaved));
    await page.click('#idmp-toolbar button[data-tb="new"]'); await page.waitForSelector('.idmp-form-new #idmp-inline-mount .cfrow', { timeout: 15000 }); await sleep(600);
    const bNew = await reqBtn(page); if (!bNew || !bNew.disabled) q5.push('unsaved New row: button ' + JSON.stringify(bNew) + ' (AbstractADWindowContent :2272-2275 disables it)');
    await page.evaluate(() => { const b = document.querySelector('#idmp-inline-mount .ic-vb[data-v="ignore"]'); if (b) b.click(); }); await sleep(900);
    // a tab with no row (GridTab rowCount == 0, :2272): the Project Line tab of a Project that has no line, found in the seed by SQL
    let emptyFound = null;
    const noLine = Q("SELECT C_Project_ID FROM C_Project p WHERE AD_Client_ID=11 AND NOT EXISTS (SELECT 1 FROM C_ProjectLine l WHERE l.C_Project_ID=p.C_Project_ID) ORDER BY 1 LIMIT 1")[0];
    if (noLine) { await openWin(page, 'GardenAdmin', 130, noLine[0]); await clickTab(page, 1); const sn = await snap(page); if (String(sn.table).toLowerCase() === 'c_projectline' && sn.rows.length === 0 && !sn.newMode) emptyFound = { t: { wid: 130, tname: 'Project Line of project ' + noLine[0] }, b: await reqBtn(page) }; }
    if (!emptyFound) q5.push('INCONCLUSIVE no empty tab found'); else if (!emptyFound.b || !emptyFound.b.disabled) q5.push('tab with no row ' + emptyFound.t.wid + ':' + emptyFound.t.tname + ' button ' + JSON.stringify(emptyFound.b));
    say('§W-TOOLBAR-REQUESTS-Q5 saved-row enabled=' + (bSaved && !bSaved.disabled) + ' new-row disabled=' + (bNew && bNew.disabled) + ' empty-tab=' + (emptyFound ? emptyFound.t.wid + ':' + emptyFound.t.tname + ' disabled=' + (emptyFound.b && emptyFound.b.disabled) : 'none') + ' no-key tabs (sweep): ' + (typeof SWEEP !== 'undefined' && SWEEP ? 'judged=' + SWEEP.nk.judged + ' enabled=' + SWEEP.nk.enabled + ' disabled=' + SWEEP.nk.bad.length : 'sweep not run') + ' [Java: legacy does not disable on a missing key]');
    const nkBad = (typeof SWEEP !== 'undefined' && SWEEP) ? (SWEEP.nk.bad.length || SWEEP.nk.judged === 0) : false;
    check('Q5', q5.some(l => l.startsWith('INCONCLUSIVE')) ? 'INCONCLUSIVE' : (q5.length === 0 && !nkBad ? 'PASS' : 'FAIL'), q5.join(' | ') || ('new-row and empty-tab disabled, saved row enabled' + ((typeof SWEEP !== 'undefined' && SWEEP) ? ', no-key tabs enabled ' + SWEEP.nk.enabled + '/' + SWEEP.nk.judged : '')));

    // ── PARITY (read-only): the legacy pilot's own database through MRequest.getRequestCount's SQL vs the twin's popup, on records both hold ──
    try {
      const { page: p2 } = await newPage('parity'); const PAR = [
        { win: 123, rec: 120, t: 'C_BPartner', or: ['C_BPartner_ID'] }, { win: 123, rec: 117, t: 'C_BPartner', or: ['C_BPartner_ID'] }, { win: 108, rec: 105, t: 'AD_User', or: ['AD_User_ID', 'SalesRep_ID'] },
        { win: 108, rec: 101, t: 'AD_User', or: ['AD_User_ID', 'SalesRep_ID'] }, { win: 143, rec: 100, t: 'C_Order', or: ['C_Order_ID'] }, { win: 130, rec: 101, t: 'C_Project', or: ['C_Project_ID'] }];
      let eq = 0, tot = 0; const lines = [];
      for (const P of PAR) {
        await openWin(p2, 'GardenAdmin', P.win, P.rec); const pop = await (async () => { await p2.click('#idmp-toolbar button[data-tb="showmore"]'); await sleep(250); await p2.click('#idmp-tb-more [data-tb-more="requests"]'); await sleep(450); return p2.$$eval('#idmp-req-pop [data-req]', bs => bs.map(b => b.textContent.trim())); })();
        const act = (pop.find(t => t.startsWith(msg.RequestActive)) || '').replace(/^.*\((\d+)\)$/, '$1'), all = (pop.find(t => t.startsWith(msg.RequestAll)) || '').replace(/^.*\((\d+)\)$/, '$1');
        const tw = [Number(all || act || 0) - Number(act || 0), Number(act || 0)];   // [inactive, active]
        const tbl = P.t.toLowerCase(), uu = pg('SELECT ' + tbl + '_uu FROM ' + tbl + ' WHERE ' + tbl + '_id=' + P.rec);
        const tidL = Number(pg("SELECT ad_table_id FROM ad_table WHERE tablename='" + P.t + "'"));
        const where = "(AD_Table_ID=" + tidL + (uu ? " AND Record_UU='" + uu + "'" : " AND Record_ID=" + P.rec) + ")" + P.or.map(c => ' OR ' + c + '=' + P.rec).join('');
        const lg = [0, 0]; pg('SELECT Processed || chr(124) || COUNT(*) FROM R_Request WHERE ' + where + ' GROUP BY Processed').split('\n').filter(Boolean).forEach(l => { const [pf, n] = l.split('|'); lg[pf === 'Y' ? 0 : 1] += Number(n); });
        tot++; const ok = lg[0] === tw[0] && lg[1] === tw[1]; if (ok) eq++; lines.push((ok ? 'EQ ' : 'NE ') + P.t + '#' + P.rec + ' legacy[inactive,active]=' + JSON.stringify(lg) + ' twin=' + JSON.stringify(tw));
      }
      say('§W-TOOLBAR-REQUESTS-PARITY legacy=pilot database via docker psql (SELECT only; the MRequest.getRequestCount SQL, not the WebService harness) records=' + tot + ' equal=' + eq + ' | ' + lines.join(' | '));
    } catch (e) { say('§W-TOOLBAR-REQUESTS-PARITY not run: ' + String(e && e.message || e).split('\n')[0]); }
  }

  // ── verdict ──
  const ids = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'].filter(i => PART === 'all' || (PART === 'sweep' ? i === 'Q1' : i !== 'Q1'));
  const fails = ids.filter(i => CHECKS[i] === 'FAIL').length, inc = ids.filter(i => CHECKS[i] !== 'PASS' && CHECKS[i] !== 'FAIL').length;
  const redN = ['R1', 'R2'].filter(k => RED[k] === true).length, redOf = PART === 'sweep' ? 0 : 2;
  const verdict = fails ? 'FAIL' : (inc || redN < redOf) ? 'INCONCLUSIVE' : 'PASS';
  say('§W-TOOLBAR-REQUESTS checks=' + ids.length + ' fail=' + fails + (inc ? ' inconclusive=' + inc : '') + ' red=' + redN + '/' + redOf + ' verdict=' + verdict);
  try { fs.writeFileSync(PAGELOGF, PAGELOG.join('\n')); } catch (e) { /* log dir */ }
  await browser.close(); server.close();
  process.exit(verdict === 'PASS' ? 0 : 1);
})();
var SWEEP = null;
