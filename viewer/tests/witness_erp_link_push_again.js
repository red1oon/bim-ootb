// ⚠ DO NOT REMOVE — W-ERP-LINK-PUSH-AGAIN (spec: prompts/CAPEX_DASHBOARD.md "2026-11-23 SPEC — the ERP link names its Project Order; a second push asks Push again?"). READ THE LOG
//   (the page console is written to LOG); an exit code is not evidence.
//   ISSUE: the Find panel's "open ↗" said nothing about WHICH Project Order it opens, and a second "› ERP" ran without asking. Owner 2026-11-23: show the linked Project Order id on the link,
//   and ask "Push again?" before a second push.
//   Drives the REAL Viewer (headless, software GL): Ctrl+O the Shed db, key F, the whole model (Level 1 row) selected, › ERP.
//   K0 the FIRST push does not ask (nothing is linked yet)
//   K1 after the first push the link text matches ^<model> #<n> ↗$, n == the href's record id == the Kernel db's C_Project_ID
//   K2 › ERP again shows the in-page "Push again?" prompt (not a browser dialog) naming "<model> #<n>", and NO push has started
//   K3 Cancel closes it; no new §PROJ_PUSH line; the status line is unchanged
//   K4 › ERP then "Push again" runs the push (a new §PROJ_PUSH line, status "Project Order: 0 lines")
//   K5 Escape on the prompt = Cancel (no push, answer=cancel logged)
//   K6 selecting again in the same page shows the id through _surfaceExistingOrder (route=existing), after the link text was cleared
//   MEASURED, not judged: is the id still shown after a page reload + reopening the model (Kernel store persistence) — printed as §W-ERP-LINK-PUSH-AGAIN MEASURE.
//   INCONCLUSIVE (never PASS) when a reading is missing. Break switch ERP_LINK_BREAK=old serves the pre-change find_erp_push.js (git ref BREAK_REF, default 5a296037) to the page: K1 K2 K3 must FAIL.
//   The legacy route is NOT exercised (no iDempiere may be touched); see the spec for the by-reading cover.
// Run: SHED_DB=<copy of SHED_extracted.db> [ERP_LINK_BREAK=old] LOG=<file> node viewer/tests/witness_erp_link_push_again.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const { kit } = require(path.join(ROOT, 'common', 'door', 'tests', '_kit.js'));
const k = kit('W-ERP-LINK-PUSH-AGAIN');
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const BREAK = process.env.ERP_LINK_BREAK || '', BREAK_REF = process.env.BREAK_REF || '5a296037';
const LOGF = process.env.LOG || path.join(os.tmpdir(), 'witness_erp_link_push_again.log');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
const out = fs.createWriteStream(LOGF); const T0 = Date.now();
const L = m => { out.write('[+' + ((Date.now() - T0) / 1000).toFixed(1) + 's] ' + m + '\n'); };
let OLD = null; if (BREAK === 'old') OLD = cp.execFileSync('git', ['-C', ROOT, 'show', BREAK_REF + ':viewer/find_erp_push.js'], { maxBuffer: 1 << 26 });
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  if (OLD && p === '/viewer/find_erp_push.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(OLD); return; }
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});

(async () => {
  const SHED = process.env.SHED_DB;
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  k.L('serving ' + ROOT + (BREAK ? ' BREAK=' + BREAK + ' (' + BREAK_REF + ')' : ''));
  if (!SHED || !fs.existsSync(SHED)) { k.incon('setup', 'SHED_DB missing: ' + SHED); server.close(); out.end(); k.end(); return; }
  const { chromium } = require(PW);
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-gl=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dialogs = [];
  const URL = 'http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?blank=1&ghost=1';
  async function openAndSelect(tag) {
    const page = await ctx.newPage(), logs = [];
    page.on('console', m => { const t = m.text(); logs.push(t); L('[' + tag + '] ' + t); }); page.on('pageerror', e => L('[' + tag + '] [pageerror] ' + e));
    page.on('dialog', d => { dialogs.push(d.type() + ':' + d.message()); d.dismiss().catch(() => {}); });   // a browser dialog is a defect: recorded, K2 fails on it
    const sleep = ms => page.waitForTimeout(ms);
    const until = async (fn, ms, arg) => { for (let i = 0; i < ms / 250; i++) { const v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; await sleep(250); } return null; };
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction('window.APP && typeof window.APP.openModelDb === "function"', null, { timeout: 240000 }); await sleep(2000);
    await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) {} window.showOpenFilePicker = undefined; });
    await page.mouse.click(900, 640); await sleep(300);
    const fc = page.waitForEvent('filechooser', { timeout: 20000 }); await page.keyboard.press('Control+o'); (await fc).setFiles(SHED);
    await until(() => /DONE/.test(document.getElementById('status').textContent), 360000);
    await page.mouse.click(900, 640); await sleep(300); await page.keyboard.press('f'); await sleep(2500);
    const sel = async () => { await page.locator('#find-tree .find-tree-row[data-find-parent="Level 1"] > span:nth-child(2)').first().click();
      return until(() => /[\d,]+\.\d{2}(?!\d)/.test((document.getElementById('find-selected') || {}).innerText || ''), 120000); };
    return { page, logs, sleep, until, sel, n: re => logs.filter(t => re.test(t)).length, last: re => { for (let i = logs.length - 1; i >= 0; i--) { const m = re.exec(logs[i]); if (m) return m; } return null; } };
  }
  const link = p => p.evaluate(() => { const a = document.getElementById('find-erp-open'); return a ? { shown: getComputedStyle(a).display !== 'none', text: a.textContent.trim(), href: a.getAttribute('href'), title: a.title } : null; });
  const status = p => p.evaluate(() => document.getElementById('status').textContent);
  const prompt = p => p.evaluate(() => { const o = document.getElementById('find-erp-again'); return o ? { text: o.innerText } : null; });
  const PUSH = /§PROJ_PUSH project=/;
  try {
    const S = await openAndSelect('A'), page = S.page;
    if (!await S.sel()) { k.incon('setup', 'the whole-model cost never appeared in the Find bar'); throw new Error('stop'); }
    const env = await page.evaluate(() => ({ bld: APP.activeBuilding }));
    L('env ' + JSON.stringify(env));
    const before = await link(page);
    // K0 first push does not ask
    await page.locator('#find-erp-btn').click(); await S.sleep(1500);
    const k0 = await prompt(page);
    let st1 = null; for (let i = 0; i < 480 && !st1; i++) { const s = await status(page); if (/Project Order: \d+ lines/.test(s)) st1 = s; else await S.sleep(250); }
    for (let i = 0; i < 40 && !(await link(page) || {}).shown; i++) await S.sleep(250);
    const l1 = await link(page), n1 = S.n(PUSH);
    L('first push status="' + st1 + '" link=' + JSON.stringify(l1) + ' pushes=' + n1 + ' linkBefore=' + JSON.stringify(before));
    if (!st1 || !l1 || !l1.shown || n1 < 1) { k.incon('first push', 'no reading: status=' + st1 + ' link=' + JSON.stringify(l1) + ' pushes=' + n1); throw new Error('stop'); }
    k.chk('K0 the first push does not ask (nothing is linked yet)', !k0, k0 ? 'a prompt showed: ' + JSON.stringify(k0) : 'no prompt');
    // K1
    const dbId = await page.evaluate(async () => { const SQL = APP._SQL || window.SQL || window._SQL_CACHED; const st = await ProjOrderState.shared(SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness');
      const r = st.db.exec('SELECT C_Project_ID FROM C_Project WHERE Value=?', [APP.activeBuilding]); return r.length && r[0].values.length ? r[0].values[0][0] : null; });
    const m1 = new RegExp('^' + env.bld + ' #(\\d+) ↗$').exec(l1.text), hrefId = /[?&]record=(\d+)/.exec(l1.href || '');
    k.chk('K1 link text "' + l1.text + '" matches "' + env.bld + ' #<n> ↗"; n == href record == Kernel C_Project_ID', !!m1 && !!hrefId && dbId != null && +m1[1] === +hrefId[1] && +m1[1] === +dbId, 'text=' + l1.text + ' href=' + l1.href + ' db=' + dbId);
    const id = m1 ? m1[1] : (dbId != null ? dbId : '?'), orderName = env.bld + ' #' + id;
    // K2
    const st2 = await status(page); await page.locator('#find-erp-btn').click(); await S.sleep(2500);
    const p2 = await prompt(page);
    k.chk('K2 › ERP again shows the in-page "Push again?" prompt naming "' + orderName + '", no push started, no browser dialog', !!p2 && /Push again\?/.test(p2.text) && p2.text.indexOf(orderName) >= 0 && S.n(PUSH) === n1 && dialogs.length === 0, 'prompt=' + JSON.stringify(p2) + ' pushes=' + S.n(PUSH) + ' dialogs=' + JSON.stringify(dialogs));
    // K3 Cancel
    if (p2) await page.locator('#find-erp-again-cancel').click(); await S.sleep(2000);
    const p3 = await prompt(page), st3 = await status(page);
    k.chk('K3 Cancel closes the prompt; no new §PROJ_PUSH; status line unchanged', !p3 && !!p2 && S.n(PUSH) === n1 && st3 === st2, 'prompt=' + JSON.stringify(p3) + ' pushes=' + S.n(PUSH) + ' status "' + st2 + '" -> "' + st3 + '"');
    // K5 Escape
    await page.locator('#find-erp-btn').click(); await S.sleep(1500); const p5a = await prompt(page);
    if (p5a) await page.keyboard.press('Escape'); await S.sleep(1500);
    const p5 = await prompt(page);
    k.chk('K5 Escape on the prompt = Cancel (prompt gone, no push, answer=cancel logged twice)', !!p5a && !p5 && S.n(PUSH) === n1 && S.n(/§PROJ_PUSH_AGAIN answer=cancel/) === 2, 'opened=' + !!p5a + ' goneAfter=' + !p5 + ' pushes=' + S.n(PUSH) + ' cancels=' + S.n(/§PROJ_PUSH_AGAIN answer=cancel/));
    // K4 Push again
    await page.locator('#find-erp-btn').click(); await S.sleep(1500); const p4a = await prompt(page);
    if (p4a) await page.locator('#find-erp-again-push').click();
    let st4 = null; for (let i = 0; i < 480 && !st4; i++) { const s = await status(page); if (/Project Order: \d+ lines/.test(s) && S.n(PUSH) > n1) st4 = s; else await S.sleep(250); }
    k.chk('K4 › ERP then "Push again" runs the push (a new §PROJ_PUSH, status "Project Order: 0 lines")', !!p4a && S.n(PUSH) === n1 + 1 && /^Project Order: 0 lines/.test(st4 || ''), 'opened=' + !!p4a + ' pushes=' + S.n(PUSH) + ' status="' + st4 + '" answers=' + S.n(/§PROJ_PUSH_AGAIN answer=push/));
    // K6 select again, same page, link text cleared first
    await page.evaluate(() => { const a = document.getElementById('find-erp-open'); a.textContent = 'open ↗'; a.style.display = 'none'; a.removeAttribute('href'); });
    const ex0 = S.n(/§PROJ_LINK_LABEL .*route=existing/);
    let l6 = null; for (let t = 0; t < 3 && !(l6 && l6.shown && S.n(/§PROJ_LINK_LABEL .*route=existing/) > ex0); t++) { await S.sel(); for (let i = 0; i < 24; i++) { l6 = await link(page); if (l6 && l6.shown && S.n(/§PROJ_LINK_LABEL .*route=existing/) > ex0) break; await S.sleep(250); } }
    k.chk('K6 selecting again in the same page shows "' + orderName + ' ↗" via _surfaceExistingOrder (route=existing)', !!l6 && l6.shown && l6.text === orderName + ' ↗' && S.n(/§PROJ_LINK_LABEL .*route=existing/) > ex0, 'link=' + JSON.stringify(l6) + ' existingLines=' + S.n(/§PROJ_LINK_LABEL .*route=existing/));
    // MEASURE: reload + reopen
    await S.sleep(1500); await page.close();
    const R = await openAndSelect('B');
    if (!await R.sel()) k.L('MEASURE reload: selection cost never appeared');
    let lr = null; for (let i = 0; i < 40; i++) { lr = await link(R.page); if (lr && lr.shown) break; await R.sleep(250); }
    k.L('MEASURE after page reload + reopening the model + selecting the whole model: link=' + JSON.stringify(lr) + ' (same browser context; Kernel store = OPFS bim_project_orders.db; persisted lines: ' + R.logs.filter(t => /PROJ_PUSH_PERSIST|PROJ_LINK_EXISTING|PROJ_LINK_LABEL|PROJ_PUSH_DBERR/.test(t)).join(' | ').slice(0, 400) + ')');
  } catch (e) { if (e.message !== 'stop') { k.incon('driver', 'driver error: ' + (e && e.message)); L('ERROR ' + (e && e.stack)); } }
  await browser.close(); server.close(); out.end(); k.end();
})().catch(e => { console.log('§W-ERP-LINK-PUSH-AGAIN ERROR ' + (e && e.stack || e)); process.exit(2); });
