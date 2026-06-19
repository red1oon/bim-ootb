// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the glass-bubble client logo (Leg 2 of the iDempiere L&F FIDELITY lane —
//   user-supplied doublebubble mark, "kernel within a kernel"). W-GLASS-LOGO PROVES:
//     A — the header brand chip (#idmp-logo) renders the logo IMAGE (logo_glass.png, 36px), not the "A+" text,
//         and the image actually loads (naturalWidth>0) — no broken/grey box on the blue bar.
//     B — the sign-in card mark (.idmp-login-mark) renders the same logo image and it loads.
//     C — 0 pageerrors.
//   §-log first — READ tests/poc_glass_logo_live.log before any conclusion.
// Run:  node tests/poc_glass_logo_live.js 2>&1 | tee tests/poc_glass_logo_live.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.jpg':'image/jpeg', '.css':'text/css', '.wasm':'application/wasm' };
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

  await page.goto(`http://localhost:${port}/idempiere.html?client=garden&window=123`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await page.waitForTimeout(300);

  // ACT B — sign-in card mark is the logo image, loaded.
  const B = await page.evaluate(() => {
    const m = document.querySelector('.idmp-login-mark img');
    return { isImg: !!m, loaded: !!(m && m.complete && m.naturalWidth > 0), src: m ? (m.getAttribute('src') || '') : '' };
  });
  console.log('§GLASS-LOGO-B loginMark isImg=' + B.isImg + ' loaded=' + B.loaded + ' src=' + B.src);
  const actB = B.isImg && B.loaded && /logo_glass\.png/.test(B.src);

  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok', { timeout: 5000 });
  await page.click('#idmp-login-ok');
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 });
  await page.waitForTimeout(800);

  // ACT A — header chip is the logo image, loaded, 36px, no "A+" text.
  const A = await page.evaluate(() => {
    const chip = document.getElementById('idmp-logo');
    const m = chip && chip.querySelector('img');
    return {
      isImg: !!m, loaded: !!(m && m.complete && m.naturalWidth > 0),
      w: m ? Math.round(m.getBoundingClientRect().width) : 0,
      noAplus: !!chip && !/A\+/.test(chip.textContent || ''),
      src: m ? (m.getAttribute('src') || '') : '',
    };
  });
  console.log('§GLASS-LOGO-A headerChip isImg=' + A.isImg + ' loaded=' + A.loaded + ' w=' + A.w + ' noAplusText=' + A.noAplus + ' src=' + A.src);
  const actA = A.isImg && A.loaded && A.w >= 30 && A.noAplus && /logo_glass\.png/.test(A.src);

  await page.screenshot({ path: path.join(__dirname, 'logo_header.png'), clip: { x: 0, y: 0, width: 760, height: 120 } });

  const pass = actA && actB && errs.length === 0;
  console.log('§W-GLASS-LOGO ACT_A=' + actA + ' ACT_B=' + actB + ' pageErrors=' + (errs.length ? errs.slice(0, 2).join('|') : 0));
  console.log('§W-GLASS-LOGO-RESULT ' + (pass ? 'PASS' : 'FAIL'));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-GLASS-LOGO-RESULT FAIL ' + e.message); process.exit(1); });
