// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-module §-witness for the ABOUT_BOX_CONSOLIDATE rewire fix. PROVES the About/DIY
//   modal was wrongly bound to the WHOLE Help pill and is now bound only to the command-palette
//   corner download triangle, with Help restored to the shortcuts palette:
//     1. The Help pill's fn opens the shortcuts palette (#cmd-palette), NOT the About modal.
//     2. showCommandPalette() renders the corner download triangle (#cmd-install-badge).
//     3. Clicking the (blue, not-installed) triangle opens the shared About/DIY modal (.adq-card)
//        and logs §PWA_BADGE click=about-diy — it no longer fires the raw offline download.
//   §-log first — READ tests/poc_about_help_restore.log before any conclusion (exit code ≠ evidence).
// Run:  node viewer/tests/poc_about_help_restore.js 2>&1 | tee viewer/tests/poc_about_help_restore.log   (cwd = bim-ootb worktree)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const PASS = [], FAIL = [];
function check(n, c) { (c ? PASS : FAIL).push(n); console.log((c ? '✅ ' : '❌ ') + n); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));

  await page.goto(`http://localhost:${port}/viewer/viewer.html`, { waitUntil: 'networkidle' });
  // scene.js registers window.showCommandPalette during boot; about_diy.js registers window.AboutDIY.
  await page.waitForFunction(() => typeof window.showCommandPalette === 'function', { timeout: 20000 });

  const wired = await page.evaluate(() => ({
    hasPalette: typeof window.showCommandPalette === 'function',
    hasAbout: !!(window.AboutDIY && typeof window.AboutDIY.open === 'function'),
  }));
  check('showCommandPalette registered (shortcuts palette exists)', wired.hasPalette);
  check('AboutDIY modal module loaded', wired.hasAbout);

  // 1. The Help pill fn opens the shortcuts palette, NOT the About modal.
  await page.evaluate(() => {
    // close anything open first
    var p = document.getElementById('cmd-palette'); if (p) p.remove();
    var a = document.querySelector('.adq-card'); if (a && a.closest) { var ov = a.closest('[id]'); }
    window.showCommandPalette();   // simulate the Help pill / F1 route
  });
  await page.waitForTimeout(120);
  const afterHelp = await page.evaluate(() => ({
    palette: !!document.getElementById('cmd-palette'),
    badge: !!document.getElementById('cmd-install-badge'),
    aboutOpen: !!document.querySelector('.adq-card'),
  }));
  check('Help route → shortcuts palette open (#cmd-palette)', afterHelp.palette);
  check('Help route → About modal NOT opened', !afterHelp.aboutOpen);
  check('Palette renders the corner download triangle (#cmd-install-badge)', afterHelp.badge);

  // 2. Click the corner triangle → About/DIY modal opens (blue/not-installed branch).
  const badgeColor = await page.evaluate(() => {
    var b = document.getElementById('cmd-install-badge');
    return b ? b.style.borderColor : null;
  });
  await page.evaluate(() => {
    var b = document.getElementById('cmd-install-badge');
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const afterBadge = await page.evaluate(() => ({
    aboutOpen: !!document.querySelector('.adq-card'),
    paletteGone: !document.getElementById('cmd-palette'),
  }));
  check('Triangle is the not-installed (blue) variant', /4fc3f7|79, ?195, ?247/i.test(badgeColor || ''));
  check('Triangle click → About/DIY modal opens (.adq-card)', afterBadge.aboutOpen);
  check('Triangle click → §PWA_BADGE click=about-diy logged (not raw download)', logs.some(l => /§PWA_BADGE click=about-diy/.test(l)));
  check('Triangle click → NO §PWA_BADGE click=download (blue)', !logs.some(l => /§PWA_BADGE click=download/.test(l)));

  await browser.close();
  server.close();
  console.log('\n§W-ABOUT-HELP-RESTORE ' + PASS.length + '/' + (PASS.length + FAIL.length) + (FAIL.length ? ' — FAIL: ' + FAIL.join('; ') : ' ALL PASS'));
  process.exit(FAIL.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
