// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for ERP_BOTTOM_BAR_AND_LIFECYCLE.md §C — Install/Migrate context-aware lifecycle.
//   GATE-2 (decided): Install + Migrate appear ONLY pre-client (login / tenant picker); HIDDEN once a client
//   is entered. PROVES (issue: "Install/Migrate WRONGLY persist as always-on pills inside the client session"):
//     1. Pre-client (boot, login overlay open): the registry bar shows install + migrate;
//        §IDMP-LIFECYCLE stage=pre-client install=Y migrate=Y.
//     2. After committing a client (pick a user → Log In): install + migrate are GONE from the rail;
//        §IDMP-LIFECYCLE stage=in-client install=context migrate=context.
//     3. The non-lifecycle pills (posted/graph/kanban/rule) are present in BOTH stages (only Install/Migrate move).
//     4. 0 pageerrors.
//   §-log first — READ tests/poc_idmp_lifecycle.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_idmp_lifecycle.js 2>&1 | tee tests/poc_idmp_lifecycle.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});
const pillIds = (page) => page.$$eval('#idmp-pill button[id^="pill-"]', bs => bs.map(b => b.id.replace('pill-', ''))).catch(() => []);

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html?client=garden`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // ── Stage 1: pre-client (login overlay open) ──
  const preIds = await pillIds(page);
  const preLifecycle = [...logs].reverse().find(l => l.startsWith('§IDMP-LIFECYCLE')) || '(none)';
  console.log('§C-PRE pillIds=[' + preIds.join(',') + '] install=' + preIds.includes('install') +
    ' migrate=' + preIds.includes('migrate'));
  console.log('§C-PRE-LOG ' + preLifecycle);

  // ── Commit a client: pick a user WITH roles, then Log In ──
  const picked = await page.evaluate(() => {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#idmp-login-users .idmp-login-user'));
    var r = rows.find(x => !x.classList.contains('disabled'));
    if (r) { r.click(); return (r.querySelector('.nm') || {}).textContent || '?'; }
    return null;
  });
  await page.waitForTimeout(500);
  await page.click('#idmp-login-ok');                          // doLogin → applySession → in-client
  await page.waitForTimeout(1200);

  // ── Stage 2: in-client ──
  const inIds = await pillIds(page);
  const inLifecycle = [...logs].reverse().find(l => l.startsWith('§IDMP-LIFECYCLE')) || '(none)';
  const loginShown = await page.$eval('#idmp-login', el => getComputedStyle(el).display).catch(() => 'gone');
  console.log('§C-IN pickedUser=' + picked + ' loginOverlay=' + loginShown +
    ' pillIds=[' + inIds.join(',') + '] install=' + inIds.includes('install') + ' migrate=' + inIds.includes('migrate'));
  console.log('§C-IN-LOG ' + inLifecycle);

  const KEEP = ['reports','graph','kanban','rule'];   // representative ungated lens pills (posted+preview retired → Posted column/button, W-POSTED-COLUMN)
  const keptBoth = KEEP.every(id => preIds.includes(id) && inIds.includes(id));
  const preOk = preIds.includes('install') && preIds.includes('migrate');
  const inOk = !inIds.includes('install') && !inIds.includes('migrate');
  const logsOk = /stage=pre-client install=Y migrate=Y/.test(preLifecycle) &&
                 /stage=in-client install=context migrate=context/.test(inLifecycle);
  const pass = preOk && inOk && keptBoth && logsOk && errs.length === 0;
  console.log('§C-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' preShowsBoth=' + preOk + ' inHidesBoth=' + inOk + ' keptOthers=' + keptBoth +
    ' logsOk=' + logsOk + ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  await page.screenshot({ path: path.join(__dirname, 'idmp_lifecycle_inclient.png') });
  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})();
