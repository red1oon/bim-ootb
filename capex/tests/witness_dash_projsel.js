#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DASH-PROJSEL (spec prompts/CAPEX_DASHBOARD.md §5.36A). Headless CPU Chromium on the REAL capex/index.html. READ THE LOG: verdict = §DASH_PROJSEL_VERDICT; the exit code is not evidence.
// THE ISSUE it proves/disproves: "the dashboard can show one project only through a URL parameter, with a read-only label: there is no way to pick a project, and no 'All'". Expected values are computed in node from
//   capex/tiles.js over the sample snapshot, independently of the page's draw. D1 the first option is blank 'All Projects' and the tiles equal the unfiltered tiles; D2 picking project X gives the tiles of compute(project=X) AND
//   the tiles a page opened with ?project=X shows; D3 an Org filter that hides X removes X from the list and resets the choice to blank; D4 the list is exactly the projects that pass Org/Category/Status (node-computed).
//   A population too small to judge prints INCONCLUSIVE, never PASS. Break: PROJSEL_BREAK=1 builds the expected list from ALL projects → D4 must FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_dash_projsel.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), T = require('../tiles.js'), SNAP = path.join(ROOT, 'capex/sample/pilot_snapshot.json'), TODAY = '2026-11-04', BREAK = process.env.PROJSEL_BREAK === '1';
const log = console.log; let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §DASH_PROJSEL_W ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const inc = (n, why) => { inconc++; log('  §DASH_PROJSEL_W ' + n + ' INCONCLUSIVE ' + why); };
const finish = () => { const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§DASH_PROJSEL_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (BREAK=1: FAIL expected)' : '')); process.exit(v === 'PASS' ? 0 : 1); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
const base = (p, f) => (!f.org || String(p.AD_Org_ID) === f.org) && (!f.category || p.ProjectCategory === f.category) && ({ all: 1, active: p.IsActive === 'Y' && p.Processed !== 'Y', closed: p.Processed === 'Y', inactive: p.IsActive !== 'Y' }[f.status]);
(async () => {
  if (!fs.existsSync(SNAP)) { log('§DASH_PROJSEL_W no sample file'); return finish(); }
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8')), P = snap.projects;
  const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise(r => server.listen(0, r));
  const br = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), cx = await br.newContext({ viewport: { width: 1640, height: 700 } });
  const errs = [], url = (q) => 'http://localhost:' + server.address().port + '/capex/index.html?snapshot=sample/pilot_snapshot.json&source=legacy&today=' + TODAY + (q || '');
  const open = async (q) => { const p = await cx.newPage(); p.on('pageerror', e => errs.push(String(e))); await p.goto(url(q), { waitUntil: 'load' }); await p.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 40000 }); return p; };
  const flat = (p) => p.evaluate(() => { const o = {}; document.querySelectorAll('#view [data-flat]').forEach(e => { o[e.getAttribute('data-flat')] = e.getAttribute('data-value'); }); return o; });
  const same = (got, want) => { const k = Object.keys(got); const diff = k.filter(x => String(got[x]) !== String(want[x])); return { n: k.length, diff: diff.slice(0, 3).map(x => x + ' page=' + got[x] + ' want=' + want[x]) }; };
  try {
    const p = await open('');
    const opts = await p.$$eval('#fProject option', o => o.map(e => ({ v: e.value, t: e.textContent })));
    log('§DASH_PROJSEL_W projects in the sample=' + P.length + ' options=' + opts.length);
    if (P.length < 2) { inc('D1-D4', 'the sample holds fewer than 2 projects'); await br.close(); server.close(); return finish(); }
    ck('D1a the first option is the blank "All Projects"', opts[0] && opts[0].v === '' && /^All Projects$/.test(opts[0].t), opts[0]);
    let got = await flat(p), want = T.flatten(T.compute(snap, { org: '', category: '', status: 'active', project: '', today: TODAY }).tiles), r = same(got, want);
    if (!r.n) inc('D1b', 'no tile values on the page'); else ck('D1b blank = the unfiltered tiles (Status Active), ' + r.n + ' values', !r.diff.length, r.diff);
    // D4 the list == the projects that pass the filters (node-computed), at two Status values
    for (const status of ['active', 'all']) {
      await p.selectOption('#fStatus', status); await p.waitForTimeout(400);
      const o2 = (await p.$$eval('#fProject option', o => o.map(e => e.value))).filter(Boolean).sort();
      const exp = P.filter(x => x.Value && (BREAK || base(x, { org: '', category: '', status }))).map(x => x.Value).sort();
      ck('D4 Status ' + status + ': the list is exactly the projects that pass the filters', JSON.stringify(o2) === JSON.stringify(exp), { page: o2.length, want: exp.length });
    }
    await p.selectOption('#fStatus', 'active'); await p.waitForTimeout(400);
    // D2 pick a project: page tiles == compute(project=X) == a page opened with ?project=X
    const list = (await p.$$eval('#fProject option', o => o.map(e => e.value))).filter(Boolean);
    const X = list[0];
    if (!X) inc('D2', 'no active project in the sample');
    else {
      await p.selectOption('#fProject', X); await p.waitForTimeout(500);
      got = await flat(p); want = T.flatten(T.compute(snap, { org: '', category: '', status: 'active', project: X, today: TODAY }).tiles); r = same(got, want);
      ck('D2a picking ' + X + ' = compute(project=X)', r.n > 0 && !r.diff.length, r.diff);
      const p2 = await open('&project=' + encodeURIComponent(X)); const got2 = await flat(p2), sel2 = await p2.$eval('#fProject', e => e.value);
      ck('D2b a page opened with ?project=X shows the same tiles and has X selected', sel2 === X && !same(got2, got).diff.length, { selected: sel2 });
      await p2.close();
      // D3 an Org filter that hides X removes it and resets the choice
      const xr = P.find(x => x.Value === X), orgs = await p.$$eval('#fOrg option', o => o.map(e => e.value).filter(Boolean)), other = orgs.find(o => o !== String(xr.AD_Org_ID));
      if (!other) {   // one organization in the sample: Status is the other filter that can hide X
        await p.selectOption('#fStatus', 'closed'); await p.waitForTimeout(500);
        const o3 = await p.$$eval('#fProject option', o => o.map(e => e.value)), cur = await p.$eval('#fProject', e => e.value), hidden = !(xr.Processed === 'Y');
        if (!hidden) inc('D3', 'the chosen project is itself closed'); else ck('D3 a Status filter that hides ' + X + ' removes it from the list and resets the choice to blank', !o3.includes(X) && cur === '', { options: o3.length, selected: cur });
      } else {
        await p.selectOption('#fOrg', other); await p.waitForTimeout(500);
        const o3 = await p.$$eval('#fProject option', o => o.map(e => e.value)), cur = await p.$eval('#fProject', e => e.value);
        ck('D3 an Org filter that hides ' + X + ' removes it from the list and resets the choice to blank', !o3.includes(X) && cur === '', { options: o3.length, selected: cur });
      }
    }
    ck('D0 no page error', errs.length === 0, errs.slice(0, 2));
  } catch (e) { ck('D0 the run', false, String(e).slice(0, 160)); }
  await br.close(); server.close(); finish();
})();
