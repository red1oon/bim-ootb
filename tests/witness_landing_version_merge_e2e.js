// witness_landing_version_merge_e2e.js — real-user-path E2E for the §VERSION_MERGE catalog-similarity
// popup (bim-compiler prompts/LANDING_VERSION_MERGE_PROMPT.md). Sits alongside
// witness_landing_resurrect_e2e.js (same harness: real headless Chromium, real <input type=file> drop events,
// real IndexedDB — no internal function calls, no mocked DB).
//
// Decision under test (assistant DEFAULT pick while user was away from keyboard — flagged for confirmation,
// not a hard sign-off): similarity = stem match IGNORING a trailing version-ish suffix (_v2, (1), -copy,
// _final, etc — see _stripVersionSuffix() in import_own.js for the exact pattern list).
//
// Drives 4 sequential drops on the SAME landing-page catalog:
//   1. SampleHouse_ARC.ifc            → catalog empty → NOMATCH → new record (baseline)
//   2. SampleHouse_ARC_v2.ifc         → stem matches (v2-suffix stripped) → popup → ACCEPT → merges into (1)
//   3. Duplex_ARC.ifc                 → different building → NOMATCH → new, separate record
//   4. SampleHouse_ARC_final.ifc      → stem matches (final-suffix stripped) → popup → DECLINE → new, separate
//                                        record; record (1)'s versions[] must stay untouched at 2.
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');   // /tmp/wt-landing-version-merge
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream',
  '.ifc':'text/plain', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm', '.mjs':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IFC_BASE   = path.join(ROOT, 'IFC', 'SampleHouse_ARC.ifc');
const IFC_DUPLEX = path.join(ROOT, 'IFC', 'Duplex_ARC.ifc');
const IFC_V2     = path.join(ROOT, 'tests', 'fixtures', 'SampleHouse_ARC_v2.ifc');
const IFC_FINAL  = path.join(ROOT, 'tests', 'fixtures', 'SampleHouse_ARC_final.ifc');

(async () => {
  console.log('§E2E_START base=' + fs.existsSync(IFC_BASE) + ' duplex=' + fs.existsSync(IFC_DUPLEX) +
    ' v2=' + fs.existsSync(IFC_V2) + ' final=' + fs.existsSync(IFC_FINAL));
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true });
  let page = await context.newPage();

  let logs = [];
  let pendingDialogAction = null;   // 'accept' | 'decline' | null
  const popups = [];
  context.on('page', p => { if (p !== page) popups.push(p); });

  function wireConsole(pg) {
    pg.on('console', m => { const t = m.text(); logs.push(t); if (t.includes('§')) console.log('  [PAGE] ' + t); });
    pg.on('dialog', async dialog => {
      console.log('  [DIALOG] ' + dialog.message().replace(/\n/g, ' | '));
      const act = pendingDialogAction; pendingDialogAction = null;
      if (act === 'accept') await dialog.accept();
      else if (act === 'decline') await dialog.dismiss();
      else { console.log('§E2E_UNEXPECTED_DIALOG ' + dialog.message()); await dialog.dismiss(); }
    });
  }
  wireConsole(page);

  async function gotoLanding() {
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => { try { localStorage.setItem('mx_entered', '1'); } catch (e) {} });
    await page.evaluate(() => { if (typeof openHub === 'function') openHub(); });
    await sleep(300);
    const zoneWired = await page.evaluate(() => !!document.getElementById('m-import-zone'));
    return zoneWired;
  }

  async function waitForLog(pred, timeoutSec) {
    for (let i = 0; i < timeoutSec; i++) {
      const hit = logs.find(pred);
      if (hit) return hit;
      await sleep(1000);
    }
    return null;
  }

  // ═══ STEP 1: baseline import — catalog empty → NOMATCH, becomes the record we'll merge into ═══
  const wired1 = await gotoLanding();
  console.log('§E2E_HUB_OPEN_1 zoneWired=' + wired1);
  let fileInput = await page.$('#m-import-file');
  if (!fileInput) { console.log('§E2E_FAIL no #m-import-file (step1)'); process.exit(1); }
  await fileInput.setInputFiles([IFC_BASE]);
  const nomatch1 = await waitForLog(l => l.includes('§VERSION_MERGE_NOMATCH') && l.includes('SampleHouse_ARC.ifc'), 30);
  console.log('§E2E_STEP1_NOMATCH ' + nomatch1);
  const saved1 = await waitForLog(l => l.includes('§IMPORT_SAVED') && l.includes('key=SampleHouse_ARC.ifc'), 90);
  const autoOpen1 = await waitForLog(l => l.includes('§IMPORT_AUTO_OPEN') && l.includes('key=SampleHouse_ARC.ifc'), 30);
  console.log('§E2E_STEP1_SAVED ' + saved1);
  console.log('§E2E_STEP1_AUTOOPEN ' + autoOpen1);
  if (!nomatch1 || !saved1) { console.log('§E2E_FAIL step1 did not complete — last 15 logs:'); logs.slice(-15).forEach(l => console.log('    ' + l)); await browser.close(); server.close(); process.exit(1); }

  // ═══ STEP 2: SampleHouse_ARC_v2.ifc — stem matches after stripping "_v2" → popup → ACCEPT (merge) ═══
  logs = [];
  const wired2 = await gotoLanding();
  console.log('§E2E_HUB_OPEN_2 zoneWired=' + wired2);
  fileInput = await page.$('#m-import-file');
  pendingDialogAction = 'accept';
  await fileInput.setInputFiles([IFC_V2]);
  const pending2 = await waitForLog(l => l.includes('§VERSION_MERGE_ACCEPT_PENDING'), 30);
  console.log('§E2E_STEP2_PENDING ' + pending2);
  const accept2 = await waitForLog(l => l.includes('§VERSION_MERGE_ACCEPT ') && l.includes('existingKey=SampleHouse_ARC.ifc'), 90);
  console.log('§E2E_STEP2_ACCEPT ' + accept2);
  const autoOpen2 = await waitForLog(l => l.includes('§IMPORT_AUTO_OPEN') && l.includes('key=SampleHouse_ARC.ifc'), 30);
  console.log('§E2E_STEP2_AUTOOPEN ' + autoOpen2);
  if (!pending2 || !accept2) { console.log('§E2E_FAIL step2 did not complete — last 20 logs:'); logs.slice(-20).forEach(l => console.log('    ' + l)); await browser.close(); server.close(); process.exit(1); }

  // Direct IDB read (same landing page, same origin) — proves the SAME record now has 2 versions.
  const rec2 = await page.evaluate(async () => {
    const r = await getProject('SampleHouse_ARC.ifc');
    return r ? { versions: r.versions.length, latestVersion: r.latestVersion, versionKeys: r.versions.map(v => v.key) } : null;
  });
  console.log('§E2E_STEP2_RECORD versions=' + (rec2 && rec2.versions) + ' latestVersion=' + (rec2 && rec2.latestVersion) +
    ' versionKeys=' + (rec2 && rec2.versionKeys.join(',')));
  const popupOpenedAfterAccept = popups.length > 0 || /viewer\.html/.test(page.url());
  console.log('§E2E_STEP2_VIEWER_OPENED ' + popupOpenedAfterAccept + ' popups=' + popups.length + ' url=' + page.url());

  // ═══ STEP 3: Duplex_ARC.ifc — genuinely different building → NOMATCH → new, separate record ═══
  logs = [];
  const wired3 = await gotoLanding();
  console.log('§E2E_HUB_OPEN_3 zoneWired=' + wired3);
  fileInput = await page.$('#m-import-file');
  await fileInput.setInputFiles([IFC_DUPLEX]);
  const nomatch3 = await waitForLog(l => l.includes('§VERSION_MERGE_NOMATCH') && l.includes('Duplex_ARC.ifc'), 30);
  console.log('§E2E_STEP3_NOMATCH ' + nomatch3);
  const saved3 = await waitForLog(l => l.includes('§IMPORT_SAVED') && l.includes('key=Duplex_ARC.ifc'), 90);
  console.log('§E2E_STEP3_SAVED ' + saved3);
  if (!nomatch3 || !saved3) { console.log('§E2E_FAIL step3 did not complete — last 15 logs:'); logs.slice(-15).forEach(l => console.log('    ' + l)); await browser.close(); server.close(); process.exit(1); }

  // ═══ STEP 4: SampleHouse_ARC_final.ifc — stem matches after stripping "_final" → popup → DECLINE ═══
  logs = [];
  const wired4 = await gotoLanding();
  console.log('§E2E_HUB_OPEN_4 zoneWired=' + wired4);
  fileInput = await page.$('#m-import-file');
  pendingDialogAction = 'decline';
  await fileInput.setInputFiles([IFC_FINAL]);
  const decline4 = await waitForLog(l => l.includes('§VERSION_MERGE_DECLINE') && l.includes('key=SampleHouse_ARC_final.ifc'), 30);
  console.log('§E2E_STEP4_DECLINE ' + decline4);
  const saved4 = await waitForLog(l => l.includes('§IMPORT_SAVED') && l.includes('key=SampleHouse_ARC_final.ifc'), 90);
  console.log('§E2E_STEP4_SAVED ' + saved4);
  if (!decline4 || !saved4) { console.log('§E2E_FAIL step4 did not complete — last 15 logs:'); logs.slice(-15).forEach(l => console.log('    ' + l)); await browser.close(); server.close(); process.exit(1); }

  // Confirm decline created a genuinely SEPARATE record and did NOT touch the merged one.
  const rec4pair = await page.evaluate(async () => {
    const merged = await getProject('SampleHouse_ARC.ifc');
    const declined = await getProject('SampleHouse_ARC_final.ifc');
    return {
      mergedVersions: merged ? merged.versions.length : -1,
      mergedLatest: merged ? merged.latestVersion : -1,
      declinedExists: !!declined,
      declinedVersions: declined ? declined.versions.length : -1,
      declinedIsSeparateKey: !!declined && declined !== merged,
    };
  });
  console.log('§E2E_STEP4_MERGED_UNCHANGED versions=' + rec4pair.mergedVersions + ' latestVersion=' + rec4pair.mergedLatest);
  console.log('§E2E_STEP4_DECLINED_SEPARATE exists=' + rec4pair.declinedExists + ' versions=' + rec4pair.declinedVersions);

  // ═══ RESULT ═══
  const pass =
    !!nomatch1 && !!saved1 &&
    !!pending2 && !!accept2 && rec2 && rec2.versions === 2 && rec2.latestVersion === 1 &&
    !!nomatch3 && !!saved3 &&
    !!decline4 && !!saved4 &&
    rec4pair.mergedVersions === 2 && rec4pair.mergedLatest === 1 &&
    rec4pair.declinedExists && rec4pair.declinedVersions === 1;
  console.log('§E2E_RESULT pass=' + pass);
  console.log('§E2E_DONE');
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('§E2E_FATAL ' + e.stack); process.exit(1); });
