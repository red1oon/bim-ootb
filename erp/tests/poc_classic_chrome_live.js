// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the CLASSIC-CHROME L&F flip (user steer 2026-06-18 "truly maintain
//   iDempiere L&F"). W-CLASSIC-CHROME (Leg 1). PROVES:
//     A — the classic iDempiere ADWindow toolbar (#idmp-toolbar) is VISIBLE on a record window and carries the
//         standard CRUD verbs New / Copy / Delete (Save/Save&New/Ignore surface while editing; Process ▶ when
//         the record has a legal FSM set). body has NO `idmp-clean` (red pill / "just the pill" mode is retired).
//     B — the pill rail no longer carries the red pill OR the form-CRUD pills (formnew/formedit/formdel/
//         formsave/formproc) — pills are OOTB extras only.
//     C — clicking the toolbar New starts an inline create form (the seam still works → no forked verb).
//   0 pageerrors. §-log first — READ tests/poc_classic_chrome_live.log before any conclusion.
// Run:  node tests/poc_classic_chrome_live.js 2>&1 | tee tests/poc_classic_chrome_live.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html?client=garden&window=143`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok', { timeout: 5000 });
  await page.click('#idmp-login-ok');
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 });
  await page.waitForTimeout(1000);

  // ACT A — classic toolbar visible + standard verbs, no idmp-clean
  const A = await page.evaluate(() => {
    const tb = document.getElementById('idmp-toolbar');
    const vis = tb && getComputedStyle(tb).display !== 'none' && tb.offsetParent !== null;
    const labels = tb ? Array.from(tb.querySelectorAll('button')).map(b => (b.textContent || '').trim() || b.title) : [];
    return { clean: document.body.classList.contains('idmp-clean'), toolbarVisible: !!vis, labels };
  });
  const hasVerb = (re) => A.labels.some(l => re.test(l));
  console.log('§CLASSIC-CHROME-A toolbarVisible=' + A.toolbarVisible + ' idmp-clean=' + A.clean + ' verbs=' + JSON.stringify(A.labels));
  const actA = A.toolbarVisible && !A.clean && hasVerb(/New/i) && hasVerb(/Copy/i) && hasVerb(/Delete/i);

  // ACT B — pill rail carries no red pill / no form-CRUD pills
  const B = await page.evaluate(() => {
    const ids = ['redpill', 'formnew', 'formedit', 'formdel', 'formsave', 'formproc'];
    const present = ids.filter(id => !!document.getElementById('pill-' + id));
    const allPills = Array.from(document.querySelectorAll('#idmp-pill button')).map(b => b.id);
    return { offending: present, allPills };
  });
  console.log('§CLASSIC-CHROME-B offending-pills=' + JSON.stringify(B.offending) + ' rail=' + JSON.stringify(B.allPills));
  const actB = B.offending.length === 0;

  // ACT C — toolbar New starts an inline create form
  await page.evaluate(() => {
    const tb = document.getElementById('idmp-toolbar');
    const nb = tb && Array.from(tb.querySelectorAll('button')).find(b => /New/i.test((b.textContent || '') + ' ' + b.title));
    if (nb) nb.click();
  });
  await page.waitForTimeout(900);
  const C = await page.evaluate(() => !!document.getElementById('idmp-inline-mount'));
  console.log('§CLASSIC-CHROME-C new-opens-inline-create=' + C);
  const actC = C;

  await page.screenshot({ path: path.join(__dirname, 'classic_chrome.png'), fullPage: false });

  const pass = actA && actB && actC && errs.length === 0;
  console.log('§W-CLASSIC-CHROME ACT_A=' + actA + ' ACT_B=' + actB + ' ACT_C=' + actC + ' pageErrors=' + (errs.length ? errs.slice(0,2).join('|') : 0));
  console.log('§W-CLASSIC-CHROME-RESULT ' + (pass ? 'PASS' : 'FAIL'));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-CLASSIC-CHROME-RESULT FAIL ' + e.message); process.exit(1); });
