#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon  SPDX-License-Identifier: MIT
// W-DOOR-URLS, the browser leg (bim-compiler prompts/SHEET_FRONT_DOOR.md §15.3): in headless Chromium the short address typed lands on the real page
// with ?query and #hash kept and adds no Back entry; the row on each page opens the next page. Issue exposed: a door that does not land, or traps Back.
// Run: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_door_urls_page.js            (serves this tree under /bim-ootb/)
//      DOORURL_URL=https://red1oon.github.io/bim-ootb/ env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_door_urls_page.js   (the deployed site)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..');
const PUP = require(process.env.DOORURL_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer'));
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]);
  if (!u.startsWith('/bim-ootb/')) { r.writeHead(404); return r.end(); }
  u = u.slice(9);
  let f = path.join(ROOT, u);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
    if (!u.endsWith('/')) { r.writeHead(301, { Location: '/bim-ootb' + u + '/' }); return r.end(); }
    f = path.join(f, 'index.html');
  }
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
srv.listen(0, async () => {
  const B = process.env.DOORURL_URL || ('http://127.0.0.1:' + srv.address().port + '/bim-ootb/');
  console.log('§DOORURL-BROWSER-SITE ' + B);
  const br = await PUP.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  let fail = 0, judged = 0;
  const p = await br.newPage();
  const bp = await br.newPage(); await bp.goto(B + 'erp/sheet_addin/history.html', { waitUntil: 'domcontentloaded' }); const BASE = await bp.evaluate(() => history.length); await bp.close();
  console.log('§DOORURL-BROWSER-BASE historyLength of a direct visit=' + BASE + ' (a door that adds no Back entry reads the same)');
  for (const [short, want, cur] of [['history/?a=1#b', 'erp/sheet_addin/history.html?a=1#b', 'Sheet history'], ['file-it', 'erp/sheet_addin/file_it.html', 'File it'], ['pdf/', 'pdf/', 'PDF']]) {
    const fresh = await br.newPage();
    await fresh.goto(B + short, { waitUntil: 'domcontentloaded' });
    await fresh.waitForFunction((w) => location.href.endsWith(w), { timeout: 8000 }, want).catch(() => {});
    const got = fresh.url().slice(B.length);
    const c = await fresh.$eval('nav.apps [aria-current=page]', (e) => e.textContent).catch(() => null);
    const hist = await fresh.evaluate(() => history.length);
    const ok = got === want && c === cur && hist === BASE; judged++; if (!ok) fail++;
    console.log('§DOORURL-BROWSER typed=/bim-ootb/' + short + ' landed=/bim-ootb/' + got + ' current="' + c + '" historyLength=' + hist + ' ' + (ok ? 'PASS' : 'FAIL'));
    await fresh.close();
  }
  await p.goto(B + 'pdf/', { waitUntil: 'domcontentloaded' });
  for (const [click, want] of [['Sheet history', 'erp/sheet_addin/history.html'], ['File it', 'erp/sheet_addin/file_it.html'], ['PDF', 'pdf/']]) {
    const [a] = await p.$$('xpath/.//nav[@class="apps"]//a[text()="' + click + '"]');
    if (!a) { judged++; fail++; console.log('§DOORURL-BROWSER-ROW clicked="' + click + '" NO LINK FAIL'); continue; }
    await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded' }), a.click()]);
    const got = p.url().slice(B.length); const ok = got === want; judged++; if (!ok) fail++;
    console.log('§DOORURL-BROWSER-ROW clicked="' + click + '" landed=/bim-ootb/' + got + ' ' + (ok ? 'PASS' : 'FAIL'));
  }
  console.log('§DOORURL-BROWSER-VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fail ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + fail + ' site=' + (process.env.DOORURL_URL ? 'LIVE' : 'local tree'));
  await br.close(); srv.close(); process.exit(fail ? 1 : 0);
});
