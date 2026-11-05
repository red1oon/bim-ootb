#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SQL-CLOCK (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.33). Headless CPU Chromium on the REAL erp/idempiere.html, signed in. READ THE LOG: verdict = §SQL_CLOCK_VERDICT.
// THE ISSUE it proves/disproves: "SQL SYSDATE in the twin is the UTC day, where legacy's is the server's local day, so east of UTC, until the offset has passed, every measure and default reading it is a day behind
//   (W-DASH-SYNC, 07:43 +08: Average Delay 180 vs legacy 181)". Two zones at the far ends of the clock, so that at any instant at least one has a local day other than UTC's; a zone whose day equals UTC's proves nothing and is not counted.
// Break (MUST FAIL): SQL_CLOCK_BREAK=1 puts the UTC clock back after sign-in, the state before the fix.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.SQL_CLOCK_BREAK === '1', log = console.log;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain', '.zip': 'application/zip' };
let judged = 0, fails = 0, differing = 0;
const ck = (n, ok, info) => { judged++; if (!ok) fails++; log('  §SQL_CLOCK ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  try {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      const c = await browser.newContext({ timezoneId: tz }), p = await c.newPage();
      await p.goto('http://localhost:' + server.address().port + '/erp/idempiere.html', { waitUntil: 'networkidle' });
      await p.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 20000 });
      await p.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await p.waitForSelector('#idmp-login-step1:visible'); await p.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await p.waitForSelector('#idmp-login-step2:visible'); await p.click('#idmp-login-ok');
      await p.waitForSelector('#idmp-home', { timeout: 30000 }); await p.waitForTimeout(800);
      if (BREAK) await p.evaluate(() => { const R = window.AdCallout.RUNTIME; R.now = function () { return Date.now(); }; window.AdCallout.Env.now = R.now; });
      const r = await p.evaluate(() => { const d = new Date(), pad = n => ('0' + n).slice(-2), local = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), one = s => window.__idmpDb.exec(s)[0].values[0][0];
        return { local, utc: d.toISOString().slice(0, 10), sysdate: String(one(window.AdCallout.convertSql('SELECT SYSDATE'))), trunc: String(one(window.AdCallout.convertSql('SELECT TRUNC(SYSDATE)'))).slice(0, 10), between: one("SELECT daysbetween(trunc(statement_timestamp()),'" + local + " 00:00:00')") }; });
      log('§SQL_CLOCK zone=' + tz + ' ' + JSON.stringify(r));
      if (r.local === r.utc) { log('  §SQL_CLOCK ' + tz + ' not counted: its day equals UTC\'s now, so it cannot tell the two clocks apart'); await c.close(); continue; }
      differing++;
      ck(tz + ': SYSDATE is the local day, not UTC\'s', r.sysdate.slice(0, 10) === r.local, { local: r.local, utc: r.utc, sysdate: r.sysdate });
      ck(tz + ': TRUNC(SYSDATE) is the local day', r.trunc === r.local, r.trunc);
      ck(tz + ': days between TRUNC(SYSDATE) and the local day = 0 (what Average Delay computes)', Number(r.between) === 0, r.between);
      await c.close();
    }
  } catch (e) { ck('crash', false, String(e && e.stack || e).slice(0, 400)); } finally { await browser.close(); server.close(); }
  const v = fails ? 'FAIL' : differing ? 'PASS' : 'INCONCLUSIVE';
  log('§SQL_CLOCK_VERDICT ' + v + ' judged=' + judged + ' failed=' + fails + ' zonesJudged=' + differing);
  process.exit(fails ? 1 : differing ? 0 : 2);
})();
