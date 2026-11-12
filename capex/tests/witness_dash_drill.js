#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DASH-DRILL (spec prompts/CAPEX_DASHBOARD.md §5.49). READ THE LOG: verdict = §DASH_DRILL_VERDICT; exit code alone is not evidence.
// ISSUE it proves/disproves: "a tile or bucket shows a number and nothing behind it". K1 count keys: rows listed == the number the tile shows; K2 money keys: Σ column per currency == the tile; K3 bucket tiles partition the active
// population (each project in exactly one bucket per tile); K4 every bucket the tiles produce has a drill key (denominator from the tile object). DRILL_BREAK=1 drops a project from one list: K1 must FAIL.
// Node part runs tiles.js over the sample snapshot at three Status filters. Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_dash_drill.js
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tiles.js');
const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'sample', 'pilot_snapshot.json'), 'utf8')), TODAY = '2026-11-04', BREAK = process.env.DRILL_BREAK === '1';
let judged = 0, fails = 0, inc_ = 0; const log = console.log;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §DASH_DRILL ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const inc = (n, w) => { inc_++; log('  §DASH_DRILL ' + n + ' INCONCLUSIVE ' + w); };
for (const status of ['active', 'all', 'closed']) {
  const R = T.compute(snap, { org: '', category: '', status, project: '', today: TODAY }), t = R.tiles, D = R.drill, tag = '[' + status + '] ';
  if (!D) { ck(tag + 'K0 compute() returns drill', false); continue; }
  if (BREAK && D['active_projects'] && D['active_projects'].length) D['active_projects'] = D['active_projects'].slice(1);
  const count = {};   // key -> the number the tile shows
  count['total_projects'] = t.total_projects.n; count['active_projects'] = t.active_projects.n; count['completed_year'] = t.completed_year.n;
  ['green', 'amber', 'red', 'none'].forEach(b => { if (t.health && t.health.n != null) count['health:' + b] = t.health[b]; });
  ['ontime', 'delayed', 'atrisk', 'nosched'].forEach(b => { if (t.schedule && t.schedule.n != null) count['schedule:' + b] = t.schedule[b]; });
  ['within', 'over', 'notstarted'].forEach(b => { if (t.budget_status && t.budget_status.n != null) count['budget:' + b] = t.budget_status[b]; });
  if (t.stage && t.stage.stages) Object.keys(t.stage.stages).forEach(k => { count['stage:' + k] = t.stage.stages[k]; });
  if (t.procurement) { count['proc:overcommitted'] = t.procurement.overcommitted.n; if (!t.procurement.nopo.notinstalled) count['proc:nopo'] = t.procurement.nopo.n; if (!t.procurement.openpo.notinstalled) count['proc:openpo'] = t.procurement.openpo.projects; }
  if (t.handover && !t.handover.vacuous) { count['handover:ready'] = t.handover.ready; count['handover:done'] = t.handover.done; }
  Object.keys(count).forEach(k => { const rows = D[k]; if (count[k] === 0 && (!rows || rows.length === 0)) { inc(tag + 'K1 ' + k, 'bucket is 0 on both sides: nothing judged'); return; } ck(tag + 'K1 ' + k + ' list == tile (' + count[k] + ')', !!rows && rows.length === count[k], rows ? rows.length : 'no key'); });
  // K2 money
  // the tile sums the decimals then rounds ONCE (§5.9): use its own summing function over the listed rows, so only the ROW SELECTION is under test
  const sum = (rows, f) => T._sumBy((rows || []).map(r => ({ C_Currency_ID: r.cur === 'none' ? null : r.cur, v: r[f] })), x => x.v);
  [['approved_budget', 'planned', t.approved_budget.cur], ['actual_cost', 'spent', t.actual_cost.cur], ['committed_cost', 'committed', t.committed_cost.cur]].forEach(([k, f, want]) => {
    if (!Object.keys(want).length) return inc(tag + 'K2 ' + k, 'tile has no value (vacuous)');
    const got = sum(D[k], f), bad = Object.keys(want).filter(c => got[c] !== want[c]).concat(Object.keys(got).filter(c => !(c in want)));
    ck(tag + 'K2 ' + k + ' Σ ' + f + ' per currency == tile', bad.length === 0, bad.length ? { got, want } : Object.keys(want).length + ' currency');
  });
  // K3 partition of the active population per bucket tile
  const part = (pfx, bs) => { const seen = {}, rows = [].concat.apply([], bs.map(b => (D[pfx + ':' + b] || []).map(r => r.id))); rows.forEach(i => { seen[i] = (seen[i] || 0) + 1; }); const dup = Object.keys(seen).filter(i => seen[i] > 1); return { n: rows.length, dup }; };
  [['health', ['green', 'amber', 'red', 'none'], t.health], ['schedule', ['ontime', 'delayed', 'atrisk', 'nosched'], t.schedule], ['budget', ['within', 'over', 'notstarted'], t.budget_status]].forEach(([p, bs, tile]) => {
    if (!tile || tile.n == null || !tile.n) return inc(tag + 'K3 ' + p, 'no active population'); const r = part(p, bs); ck(tag + 'K3 ' + p + ' each active project in exactly one bucket (' + r.n + ' of ' + tile.n + ')', r.n === tile.n && !r.dup.length, r.dup.slice(0, 3));
  });
  // K4 denominators: every drill key the tiles imply exists
  const missing = Object.keys(count).filter(k => !(k in D)); ck(tag + 'K4 every bucket the tiles produce has a drill key (' + Object.keys(count).length + ' keys)', missing.length === 0, missing.slice(0, 4));
}
// K5 the real page (headless CPU Chromium): every [data-drill] element opens the panel with exactly the node-computed number of rows, and each row's link opens the ERP Project window on that record
(async () => {
  let chromium; try { ({ chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright')); } catch (e) { inc('K5', 'playwright not found'); return finish(); }
  const http = require('http'), ROOT = path.join(__dirname, '..', '..'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
  const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise(r => server.listen(0, r));
  const br = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), pg = await (await br.newContext({ viewport: { width: 1640, height: 900 } })).newPage(), errs = []; pg.on('pageerror', e => errs.push(String(e)));
  try {
    await pg.goto('http://localhost:' + server.address().port + '/capex/index.html?snapshot=sample/pilot_snapshot.json&source=legacy&today=' + TODAY, { waitUntil: 'load' });
    await pg.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 });
    const want = T.compute(snap, { org: '', category: '', status: 'active', project: '', today: TODAY }).drill;
    const keys = await pg.$$eval('#view [data-drill]', els => els.map(e => e.getAttribute('data-drill')));
    ck('K5a the page offers drill on every count/bucket key it can show (' + keys.length + ' clickable)', keys.length >= 10, keys.length);
    let bad = [], linkBad = [], nonEmpty = 0;
    for (const k of keys) {
      await pg.evaluate(k => { document.querySelector('#view [data-drill="' + k.replace(/"/g, '\\"') + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }, k);
      const n = await pg.$eval('#drill', d => d.hidden ? -1 : d.querySelectorAll('tbody tr').length), exp = (want[k] || []).length;
      if (n !== exp) bad.push(k + ' page=' + n + ' node=' + exp);
      if (exp) { nonEmpty++; const hrefs = await pg.$$eval('#drill tbody a.open', a => a.map(x => x.getAttribute('href'))); hrefs.forEach((h, i) => { if (!new RegExp('Action=Zoom&TableName=C_Project&Record_ID=' + want[k][i].id + '$').test(h)) linkBad.push(k + ' ' + h); }); }
    }
    ck('K5b each click opens the panel with exactly the node-computed rows (' + keys.length + ' keys, ' + nonEmpty + ' non-empty)', bad.length === 0 && nonEmpty > 0, bad.slice(0, 3));
    ck('K5c every row links to its own record in the source system (legacy: WebUI Action=Zoom on C_Project)', linkBad.length === 0 && nonEmpty > 0, linkBad.slice(0, 2));
    for (const hv of ['procurement', 'handover']) {
      await pg.evaluate(h => { location.hash = '#' + h; }, hv); await pg.waitForTimeout(600);
      const vk = await pg.$$eval('#view [data-drill]', els => els.map(e => e.getAttribute('data-drill')));
      let vb = []; for (const k of vk) { await pg.evaluate(k => document.querySelector('#view [data-drill="' + k + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })), k); const n = await pg.$eval('#drill', d => d.hidden ? -1 : d.querySelectorAll('tbody tr').length); if (n !== (want[k] || []).length && !(n === 0 && !(want[k] || []).length)) vb.push(k + ' page=' + n + ' node=' + (want[k] || []).length); }
      ck('K5e the ' + hv + ' view: ' + vk.length + ' clickable rows, each opens exactly its node-computed projects', vk.length >= 2 && vb.length === 0, vb.slice(0, 3));
    }
    ck('K5d no page error', errs.length === 0, errs.slice(0, 2));
  } catch (e) { ck('K5 page run', false, String(e).slice(0, 200)); }
  await br.close(); server.close(); finish();
})();
function finish() { const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§DASH_DRILL_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc_ + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1); }
