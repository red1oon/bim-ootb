// capex/tools/film_dash_shots.js — stills for the DASHBOARD-ONLY film (prompts/CAPEX_DASHBOARD.md §5.51). The REAL page (glance + drill-down), headless Chromium, software rendering (no GPU), 1920x1080 at 1500x844 CSS px scaled 1.28.
// Every value a still shows is ALSO read from the DOM and printed (§FILM_DASH_SHOT); the narration's numbers come from these lines, never from the picture. Each shot's page text is grepped with the private list (§FILM_PIXEL_PRIVACY).
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/film_dash_shots.js <legacy_snapshot.json> <outDir> [today=2026-11-11]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const [snapFile, out, TODAY = '2026-11-11'] = process.argv.slice(2), ROOT = path.join(__dirname, '..', '..'), log = console.log;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.png': 'image/png' };
fs.mkdirSync(out, { recursive: true });
(async () => {
  const server = http.createServer((q, r) => { const u = q.url.split('?')[0]; if (u.endsWith('/__snap.json')) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(fs.readFileSync(snapFile)); }
    fs.readFile(path.join(ROOT, decodeURIComponent(u)), (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise(r => server.listen(0, r));
  const br = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), cx = await br.newContext({ viewport: { width: 1500, height: 844 }, deviceScaleFactor: 1.28 }), p = await cx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:' + server.address().port + '/capex/index.html?snapshot=__snap.json&source=legacy&today=' + TODAY, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 });
  await p.selectOption('#fStatus', 'active'); await p.waitForTimeout(600);
  const PGF = process.env.FILM_PRIVATE_GREP_FILE || path.join(process.env.HOME, '.cache/capex_film/private_grep.txt'), RE = fs.existsSync(PGF) ? new RegExp(fs.readFileSync(PGF, 'utf8').trim(), 'i') : null;
  const val = k => p.evaluate(k => { const e = document.querySelector('#view [data-flat="' + k + '"]'); return e ? e.getAttribute('data-value') : null; }, k);
  const shot = async (name, keys, extra) => {
    const f = path.join(out, name + '.png'); await p.screenshot({ path: f });
    const vals = {}; for (const k of keys || []) vals[k] = await val(k);
    log('§FILM_DASH_SHOT ' + name + ' -> ' + f + ' values=' + JSON.stringify(vals) + (extra ? ' ' + extra : ''));
    const txt = await p.evaluate(() => document.body.innerText);
    log('§FILM_PIXEL_PRIVACY ' + name + (RE ? ' chars=' + txt.length + ' hits=' + (RE.test(txt) ? 1 : 0) : ' INCONCLUSIVE no private list'));
  };
  const drill = async (key) => { await p.evaluate(k => document.querySelector('#view [data-drill="' + k + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })), key); await p.waitForTimeout(450); const n = await p.$eval('#drill', d => d.hidden ? -1 : d.querySelectorAll('tbody tr').length); return n; };
  const close = async () => { await p.evaluate(() => { document.getElementById('drill').hidden = true; }); await p.waitForTimeout(200); };
  await shot('d0_glance', ['total_projects', 'active_projects', 'approved_budget', 'actual_cost', 'forecast_cost', 'health', 'schedule']);
  for (const [name, key] of [['d1_drill_approved', 'approved_budget'], ['d2_drill_actual', 'actual_cost'], ['d3_drill_health', 'health:amber']]) {
    const n = await drill(key); await shot(name, [], 'drill=' + key + ' rows=' + n); await close();
  }
  await p.evaluate(() => { document.querySelectorAll('#view details.note').forEach((d, i) => { if (i === 2) d.open = true; }); }); await p.waitForTimeout(250);
  await shot('d4_formula', ['approved_budget']);
  // the left menu, one still per item (each view carries its own one-line lead)
  for (const [name, hash, keys] of [['m1_projects', 'projects', []], ['m2_budget', 'budget', []], ['m3_procurement', 'procurement', ['proc_openpo', 'proc_overcommitted', 'proc_nopo']], ['m4_approvals', 'approvals', ['approvals']], ['m5_handover', 'handover', ['handover_ready', 'handover_done', 'bim_documents']]]) {
    await p.evaluate(h => { location.hash = '#' + h; }, hash); await p.waitForTimeout(700); await shot(name, keys, 'view=' + hash + ' lead=' + JSON.stringify(await p.$eval('#view .lead', e => e.textContent)));
  }
  await p.evaluate(() => { location.hash = '#proc'; });
  log('§FILM_DASH_SHOT_ERRORS ' + errs.length + (errs.length ? ' ' + errs[0].slice(0, 120) : ''));
  await br.close(); server.close();
})();
