#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-CAPEX-SAMPLE (spec prompts/CAPEX_DASHBOARD.md §5.27). Headless CPU Chromium on the REAL capex/index.html. READ THE LOG: verdict = §CAPEX_SAMPLE_VERDICT; the exit code is not evidence.
// THE ISSUE it proves/disproves: "the guide's populated HTML page shows numbers that are not what the formulas give over the sample's real rows, or the page falls back to the seed". Expected = capex/tiles.js compute over
//   capex/sample/pilot_snapshot.json, computed in node, independently of the page's draw; read from the page's data-flat DOM, per view and at Status Active + All. A tile with nothing in it prints INCONCLUSIVE, never PASS.
// Also prints every quoted value (§CAPEX_SAMPLE_QUOTE) and, with CAPTURE_DIR, the guide's frames. Break: CAPEX_SAMPLE_BREAK=1 expects each value changed → FAIL. Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_capex_sample.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), T = require('../tiles.js'), SNAP = path.join(ROOT, 'capex/sample/pilot_snapshot.json'), TODAY = '2026-11-04', BREAK = process.env.CAPEX_SAMPLE_BREAK === '1', OUT = process.env.CAPTURE_DIR;
const log = console.log; let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §CAPEX_SAMPLE ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const finish = () => { const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§CAPEX_SAMPLE_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (BREAK=1: FAIL expected)' : '')); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 2); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
(async () => {
  if (!fs.existsSync(SNAP)) { log('§CAPEX_SAMPLE no sample file'); finish(); }
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  log('§CAPEX_SAMPLE sample takenAt=' + snap.meta.takenAt + ' ' + ['projects', 'phases', 'tasks', 'lines', 'wf'].map(k => k + '=' + snap[k].length).join(' '));
  const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } if (process.env.SAMPLE_PA_BREAK === '1' && /pilot_snapshot\.json$/.test(f)) { const j = JSON.parse(b); j.pacalc = []; b = Buffer.from(JSON.stringify(j)); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise(r => server.listen(0, r));
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), c = await b.newContext({ viewport: { width: 1640, height: 700 }, deviceScaleFactor: 2 }), p = await c.newPage(), errs = [], nf = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('response', r => { if (r.status() >= 400 && !/_extracted\.db/.test(r.url())) nf.push(r.url()); });
  try {
    await p.goto('http://localhost:' + server.address().port + '/capex/index.html?snapshot=sample/pilot_snapshot.json&source=legacy&today=' + TODAY, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 40000 });
    const cur = await p.evaluate(() => window.__capex.source);
    ck('S1 the page opened the sample, not the seed', cur === 'legacy', cur);
    // §5.75 step 1: the sample carries the server's PA_MeasureCalc rows, so its numbers come from PA rows (not from the tiles.js fallback). SAMPLE_PA_BREAK=1 serves the sample without them -> must FAIL.
    const pa = await p.evaluate(() => window.__capex.pa);
    ck('S1b the sample page computed from PA rows (judged > 0, no error)', !!pa && pa.judged > 0 && pa.errors.length === 0, pa);
    for (const status of ['active', 'all']) {
      await p.selectOption('#fStatus', status); await p.waitForTimeout(500);
      const want = T.flatten(T.compute(snap, { org: '', category: '', status, project: '', today: TODAY }).tiles), got = await p.evaluate(() => { const o = {}; document.querySelectorAll('#view [data-flat]').forEach(e => { o[e.getAttribute('data-flat')] = e.getAttribute('data-value'); }); return o; });
      const keys = Object.keys(got); let same = 0, diff = [];
      keys.forEach(k => { const w = BREAK ? want[k] + '#' : want[k]; if (String(got[k]) === String(w)) same++; else diff.push(k + ' page=' + got[k] + ' want=' + w); });
      ck('S2 status=' + status + ': every drawn tile == tiles.js over the sample', keys.length > 10 && !diff.length, { tiles: keys.length, same, diff: diff.slice(0, 6) });
      Object.keys(want).forEach(k => log('    §CAPEX_SAMPLE_QUOTE status=' + status + ' ' + k + '=' + want[k]));
      if (status === 'active' && OUT) await p.screenshot({ path: OUT + '/capex_page_dashboard.png', fullPage: true });
    }
    await p.selectOption('#fStatus', 'active'); await p.waitForTimeout(300);
    const allNoData = await p.evaluate(() => [...document.querySelectorAll('#view .card')].filter(x => /no data/.test(x.textContent)).map(x => x.querySelector('h3').textContent));
    log('§CAPEX_SAMPLE cards with no data: ' + JSON.stringify(allNoData)); if (allNoData.length) inconc += allNoData.length;
    log('§CAPEX_SAMPLE cards: ' + JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#view .card')].map(x => x.querySelector('h3').textContent + ' :: ' + x.innerText.replace(/\s+/g, ' ').slice(0, 170)))));
    for (const [hash, n] of [['projects', snap.projects.filter(x => x.IsActive === 'Y' && x.Processed === 'N').length], ['budget', snap.projects.filter(x => x.IsActive === 'Y' && x.Processed === 'N').length], ['approvals', null], ['procurement', null], ['handover', null]]) {
      await p.evaluate(h => { location.hash = '#' + h; }, hash); await p.waitForTimeout(500);
      const rows = await p.evaluate(() => document.querySelectorAll('#view tbody tr').length);
      if (n != null) ck('S3 #' + hash + ' lists every active project of the sample', rows === n, { rows, want: n });
      if (OUT) await p.screenshot({ path: OUT + '/capex_page_' + hash + '.png', fullPage: true });
      if (hash === 'procurement' || hash === 'handover') { const t = await p.evaluate(() => document.querySelector('#view').innerText); ck('S4 #' + hash + ' is labelled proposed, and every number on it is on a [data-flat] element (§5.51; was: pending)', /proposed/i.test(t) && (await p.$$eval('#view [data-flat]', e => e.length)) >= 2, t.slice(0, 60)); }
    }
    ck('S5 no page errors, nothing the page needs is missing', !errs.length && !nf.filter(u => !/favicon/.test(u)).length, { errs: errs.slice(0, 3), notFound: nf.slice(0, 4) });
  } catch (e) { ck('flow', false, String(e && e.message || e)); }
  await b.close(); server.close(); finish();
})();
