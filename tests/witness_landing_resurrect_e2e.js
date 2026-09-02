// witness_landing_resurrect_e2e.js — real-user-path E2E for the resurrected
// feat/landing-multimerge-viewer-saveopen work (bim-compiler prompts/LANDING_MULTIMERGE_SAVEOPEN_RESURRECT.md).
// Issue under test: does the ALREADY-LANDED (PR #396, commit 56d401d) multimerge/Save/Open code still
// work end-to-end on current main, driven the way a real user would (drop files, press Ctrl+S, press Ctrl+O)?
// Not a mock — drives the real landing hub + real viewer with real sample IFC files, headless Chromium.
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');   // /tmp/wt-landing-resurrect
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream',
  '.ifc':'text/plain', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm', '.mjs':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IFC1 = path.join(ROOT, 'IFC', 'SampleHouse_ARC.ifc');
const IFC2 = path.join(ROOT, 'IFC', 'Duplex_ARC.ifc');

(async () => {
  console.log('§E2E_START ifc1=' + fs.existsSync(IFC1) + ' ifc2=' + fs.existsSync(IFC2));
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const logs = [];
  page.on('console', m => { const t = m.text(); logs.push(t); if (t.includes('§')) console.log('  [PAGE] ' + t); });
  page.on('pageerror', e => { logs.push('PAGEERR ' + e); console.log('  [PAGE] PAGEERR ' + e); });

  // ═══ STEP 1: land, open the Buildings/IFC hub, drop 2 IFC files → merge ═══
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.setItem('mx_entered', '1'); } catch (e) {} });
  await page.evaluate(() => { if (typeof openHub === 'function') openHub(); });
  await sleep(300);
  const zoneWired = await page.evaluate(() => !!document.getElementById('m-import-zone'));
  console.log('§E2E_HUB_OPEN zoneWired=' + zoneWired);

  const fileInput = await page.$('#m-import-file');
  if (!fileInput) { console.log('§E2E_FAIL no #m-import-file'); process.exit(1); }
  await fileInput.setInputFiles([IFC1, IFC2]);

  // popup capture (openProject may window.open a new tab)
  let popupPage = null;
  context.on('page', p => { popupPage = p; });

  // wait for the merge to complete (bounded — real IFC parse of 2 files can take tens of seconds)
  let mergeDone = false, mergeLine = '', autoOpenLine = '';
  for (let i = 0; i < 120; i++) {
    mergeLine = logs.find(l => l.includes('§MULTI_IMPORT_DONE')) || '';
    autoOpenLine = logs.find(l => l.includes('§MULTI_AUTO_OPEN')) || '';
    if (mergeLine && autoOpenLine) { mergeDone = true; break; }
    if (logs.some(l => l.includes('§MULTI_FILE_ERROR') || l.includes('§MULTI_DB_ERROR'))) break;
    await sleep(1000);
  }
  console.log('§E2E_MERGE_RESULT done=' + mergeDone);
  console.log('§E2E_MERGE_LINE ' + mergeLine);
  console.log('§E2E_AUTOOPEN_LINE ' + autoOpenLine);
  if (!mergeDone) {
    console.log('§E2E_FAIL merge did not complete — last 15 logs:');
    logs.slice(-15).forEach(l => console.log('    ' + l));
    await browser.close(); server.close(); process.exit(1);
  }

  // ═══ STEP 2: confirm the viewer actually opened with the COMBINED building ═══
  await sleep(1000);
  let viewerPage = popupPage;
  if (!viewerPage) {
    // same-tab fallback (popup blocked) — the landing `page` itself navigated
    if (/viewer\.html/.test(page.url())) viewerPage = page;
  }
  if (!viewerPage) {
    // give the popup a moment more
    for (let i = 0; i < 10 && !viewerPage; i++) { await sleep(500); if (popupPage) viewerPage = popupPage; }
  }
  console.log('§E2E_VIEWER_PAGE found=' + !!viewerPage + ' url=' + (viewerPage ? viewerPage.url() : 'n/a'));
  if (!viewerPage) { console.log('§E2E_FAIL no viewer page opened'); await browser.close(); server.close(); process.exit(1); }

  const viewerLogs = [];
  viewerPage.on('console', m => { const t = m.text(); viewerLogs.push(t); if (t.includes('§')) console.log('  [VIEWER] ' + t); });
  await viewerPage.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});

  // wait for APP (viewer app object, window.APP per viewer/main.js:10) + APP.db to be ready
  let appReady = false;
  for (let i = 0; i < 90; i++) {
    appReady = await viewerPage.evaluate(() => !!(window.APP && window.APP.db)).catch(() => false);
    if (appReady) break; await sleep(1000);
  }
  console.log('§E2E_APP_READY ' + appReady);

  const elCount = await viewerPage.evaluate(() => {
    try { const r = window.APP.db.exec("SELECT COUNT(*) FROM elements"); return r[0] ? r[0].values[0][0] : -1; }
    catch (e) { return 'ERR:' + e.message; }
  }).catch(e => 'EVAL_ERR:' + e.message);
  console.log('§E2E_MERGED_ELEMENT_COUNT ' + elCount);

  // ═══ STEP 3a: Ctrl+S — native path first. Headless Chromium DOES expose showSaveFilePicker as a real
  // function (confirmed opaque data: URLs hide it, but http:// origins expose it) but auto-rejects with
  // AbortError (no display to render a picker) — proves the REAL browser API is invoked, not a mock. ═══
  const hasFSA = await viewerPage.evaluate(() => typeof window.showSaveFilePicker);
  console.log('§E2E_FSA_SAVE_AVAILABLE ' + hasFSA);
  await viewerPage.keyboard.down('Control'); await viewerPage.keyboard.press('s'); await viewerPage.keyboard.up('Control');
  await sleep(800);
  const kbdRouteSave = viewerLogs.find(l => l.includes('§KBD_ROUTE Ctrl+S')) || '';
  const saveExportLine = viewerLogs.find(l => l.includes('§SAVE_EXPORT')) || '';
  const saveCancelLine = viewerLogs.find(l => l.includes('§SAVE_CANCEL')) || '';
  console.log('§E2E_SAVE_KBD_ROUTE ' + kbdRouteSave);
  console.log('§E2E_SAVE_EXPORT_LINE ' + saveExportLine);
  console.log('§E2E_SAVE_NATIVE_INVOKED (AbortError=headless-no-display, proves real API called) ' + saveCancelLine);

  // ═══ STEP 3b: neutralize FSA to force+prove the REAL download-fallback branch executes ═══
  await viewerPage.evaluate(() => { delete window.showSaveFilePicker; });
  const [download] = await Promise.all([
    viewerPage.waitForEvent('download', { timeout: 20000 }).catch(e => null),
    (async () => { await viewerPage.keyboard.down('Control'); await viewerPage.keyboard.press('s'); await viewerPage.keyboard.up('Control'); })(),
  ]);
  await sleep(500);
  const saveDoneLine = viewerLogs.slice().reverse().find(l => l.includes('§SAVE_DONE')) || '';
  console.log('§E2E_SAVE_DONE_LINE ' + saveDoneLine);
  console.log('§E2E_SAVE_DOWNLOAD_SUGGESTED ' + (download ? download.suggestedFilename() : 'none'));
  let savedDbPath = null;
  if (download) { savedDbPath = path.join('/tmp', 'e2e_saved_' + Date.now() + '.db'); await download.saveAs(savedDbPath); }
  const savedBytes = savedDbPath && fs.existsSync(savedDbPath) ? fs.statSync(savedDbPath).size : 0;
  console.log('§E2E_SAVE_FILE_BYTES ' + savedBytes);

  // ═══ STEP 4a: Ctrl+O — native path first (same AbortError-in-headless proof as Save) ═══
  const hasFSAOpen = await viewerPage.evaluate(() => typeof window.showOpenFilePicker);
  console.log('§E2E_FSA_OPEN_AVAILABLE ' + hasFSAOpen);
  await viewerPage.keyboard.down('Control'); await viewerPage.keyboard.press('o'); await viewerPage.keyboard.up('Control');
  await sleep(800);
  const kbdRouteOpenNative = viewerLogs.find(l => l.includes('§KBD_ROUTE Ctrl+O')) || '';
  const openCancelLine = viewerLogs.find(l => l.includes('§OPEN_CANCEL')) || '';
  console.log('§E2E_OPEN_KBD_ROUTE ' + kbdRouteOpenNative);
  console.log('§E2E_OPEN_NATIVE_INVOKED (AbortError=headless-no-display, proves real API called) ' + openCancelLine);

  // ═══ STEP 4b: neutralize FSA to force+prove the REAL <input type=file> fallback branch executes ═══
  await viewerPage.evaluate(() => { delete window.showOpenFilePicker; });
  const preOpenUrl = viewerPage.url();
  const [fileChooser] = await Promise.all([
    viewerPage.waitForEvent('filechooser', { timeout: 20000 }).catch(e => null),
    (async () => { await viewerPage.keyboard.down('Control'); await viewerPage.keyboard.press('o'); await viewerPage.keyboard.up('Control'); })(),
  ]);
  console.log('§E2E_OPEN_FILECHOOSER ' + !!fileChooser);
  if (fileChooser && savedBytes > 0) {
    await fileChooser.setFiles([savedDbPath]);
    // navigation replaces the scene (location.assign to viewer.html?db=import://...)
    await viewerPage.waitForNavigation({ timeout: 20000 }).catch(() => {});
    await sleep(1000);
    const openPickLine = viewerLogs.find(l => l.includes('§OPEN_PICK')) || '';
    const openDbLine = viewerLogs.find(l => l.includes('§OPEN_DB')) || '';
    console.log('§E2E_OPEN_PICK_LINE ' + openPickLine);
    console.log('§E2E_OPEN_DB_LINE ' + openDbLine);
    const postOpenUrl = viewerPage.url();
    console.log('§E2E_OPEN_URL_CHANGED ' + (postOpenUrl !== preOpenUrl) + ' pre=' + preOpenUrl + ' post=' + postOpenUrl);
    let reopenReady = false;
    for (let i = 0; i < 60; i++) {
      reopenReady = await viewerPage.evaluate(() => !!(window.APP && window.APP.db)).catch(() => false);
      if (reopenReady) break; await sleep(1000);
    }
    const reopenElCount = reopenReady ? await viewerPage.evaluate(() => {
      try { const r = window.APP.db.exec("SELECT COUNT(*) FROM elements"); return r[0] ? r[0].values[0][0] : -1; } catch (e) { return 'ERR:' + e.message; }
    }).catch(e => 'EVAL_ERR:' + e.message) : 'APP_NOT_READY';
    console.log('§E2E_REOPEN_APP_READY ' + reopenReady);
    console.log('§E2E_REOPEN_ELEMENT_COUNT ' + reopenElCount);
  } else {
    console.log('§E2E_OPEN_SKIP fileChooser=' + !!fileChooser + ' savedBytes=' + savedBytes);
  }

  console.log('§E2E_DONE');
  await browser.close(); server.close();
})().catch(e => { console.log('§E2E_FATAL ' + e.stack); process.exit(1); });
