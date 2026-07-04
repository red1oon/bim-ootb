// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the §2026-07-04 thread B (Presence forward link) + thread C (Leave's
//   Resource click-through) — against the REAL adapter files (hba_lens.js/hba_leave.js) via the
//   hr_bim_asset/demo/fm_panel.html harness (the established HBA smoke page for the Human-Asset drawer).
//   PROVES:
//     - opening Human-Asset → Presence shows a roster row with an "open ↗" link to window=108 (AD_User)
//     - opening Human-Asset → Leave shows a "Resource ↗" link to window=236 (Resource) record=990109 (EMP001)
//     - 0 pageerrors
//   §-log first — READ tests/poc_presence_leave_link_live.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/poc_presence_leave_link_live.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/hr_bim_asset/demo/fm_panel.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const log = [], errs = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', m => log.push('  [console] ' + m.text()));
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-PRESENCE-LEAVE-LINK — Human-Asset drawer, Presence forward link + Leave Resource click-through');

  await page.goto('http://127.0.0.1:' + port + '/hr_bim_asset/demo/fm_panel.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const drawerReady = await page.evaluate(() => !!document.getElementById('hba-fm-drawer'));
  verdict(drawerReady, 'Human-Asset drawer rendered on load (fm_panel.html mock)');

  // ── Presence: click the row → roster drawer opens → its rows carry an "open ↗" AD_User(108) link ──────────
  const presRowExists = await page.evaluate(() => !!document.querySelector('button[data-lens="presence"]'));
  verdict(presRowExists, 'Presence row available in the drawer');
  if (presRowExists) await page.click('button[data-lens="presence"]');
  await page.waitForTimeout(600);
  const presence = await page.evaluate(() => {
    const d = document.getElementById('hba-presence-drawer'); if (!d) return null;
    const rows = Array.from(d.querySelectorAll('[data-employee]'));
    const links = rows.map(r => r.querySelector('a')).filter(Boolean);
    return { rowCount: rows.length, linkCount: links.length, hrefs: links.map(a => a.getAttribute('href')) };
  });
  verdict(!!presence && presence.rowCount > 0, 'Presence roster drawer opened with rows', presence ? ('rows=' + presence.rowCount) : 'absent');
  verdict(!!presence && presence.linkCount === presence.rowCount, 'EVERY presence row carries an "open ↗" link', presence ? ('links=' + presence.linkCount + '/' + presence.rowCount) : '-');
  verdict(!!presence && presence.hrefs.every(h => /window=108&record=\d+/.test(h)), 'every link targets window=108 (AD_User) with a real record id', presence ? presence.hrefs.join(' | ') : '-');

  // ── Leave: click the row → pane opens → "Resource ↗" links to window=236 record=990109 (EMP001) ───────────
  const leaveRowExists = await page.evaluate(() => !!document.querySelector('button[data-lens="leave"]'));
  verdict(leaveRowExists, 'Leave row available in the drawer');
  if (leaveRowExists) await page.click('button[data-lens="leave"]');
  await page.waitForTimeout(600);
  const leave = await page.evaluate(() => {
    const p = document.getElementById('hba-leave-pane'); if (!p) return null;
    const links = Array.from(p.querySelectorAll('a')).filter(a => a.textContent.indexOf('Resource') >= 0);
    return { present: !!p, hrefs: links.map(a => a.getAttribute('href')) };
  });
  verdict(!!leave && leave.present, 'Leave pane opened');
  verdict(!!leave && leave.hrefs.length === 1 && /window=236&record=990109/.test(leave.hrefs[0]),
    'Leave pane shows "Resource ↗" → window=236 (Resource) record=990109 (EMP001, first employee)', leave ? leave.hrefs.join(' | ') : '-');

  verdict(errs.length === 0, '0 pageerrors', errs.length ? errs.slice(0, 3).join(' | ') : 'clean');

  const pass = fails === 0;
  S('\n§W-PRESENCE-LEAVE-LINK ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'poc_presence_leave_link_live.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
