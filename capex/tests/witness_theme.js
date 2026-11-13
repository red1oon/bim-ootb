#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-THEME (spec prompts/CAPEX_DASHBOARD.md §5.53). Real page, headless CPU Chromium. READ THE LOG: verdict = §THEME_VERDICT; the exit code alone is not evidence.
// ISSUE it proves/disproves: "a theme (skin or layout) changes a number, drops a project, or draws a mark where the data says otherwise". T1-T8 are in the spec. THEME_BREAK=1 moves one bubble 5 points: T3 must FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_theme.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), T = require('./pa_harness.js'), SNAP = path.join(ROOT, 'capex/sample/pilot_snapshot.json'), TODAY = '2026-11-04', BREAK = process.env.THEME_BREAK === '1';
(async () => { await require('./pa_harness.js').init({ quiet: true });   // §5.75 step 3: the numbers come from the PA rows (pa_harness.js), not the hand formulas in tiles.js
const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8')), log = console.log; let judged = 0, fails = 0, inc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §THEME ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const incon = (n, w) => { inc++; log('  §THEME ' + n + ' INCONCLUSIVE ' + w); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const R = T.compute(snap, { org: '', category: '', status: 'active', project: '', today: TODAY }), WANT = T.flatten(R.tiles), D = R.drill;
const dn = x => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)) / 864e5, tn = dn(TODAY);
const late = id => snap.phases.filter(p => p.C_Project_ID == id && p.IsComplete !== 'Y' && p.EndDate && p.EndDate.slice(0, 10) < TODAY).reduce((m, p) => Math.max(m, tn - dn(p.EndDate.slice(0, 10))), 0);
const rows = D.active_projects, plotted = rows.filter(r => Number(r.planned) > 0), notPlotted = rows.length - plotted.length;
function lum(c) { const m = c.match(/\d+(\.\d+)?/g).map(Number), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); }
const cr = (a, b) => { const x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + .05) / (lo + .05); };
(async () => {
  const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise(r => server.listen(0, r));
  const br = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), base = 'http://localhost:' + server.address().port + '/capex/index.html?snapshot=sample/pilot_snapshot.json&source=legacy&today=' + TODAY, errs = [];
  const open = async (cx, q) => { const p = await cx.newPage(); p.on('pageerror', e => errs.push(String(e))); await p.goto(base + (q || ''), { waitUntil: 'load' }); await p.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 }); await p.waitForTimeout(500); return p; };
  const flat = p => p.evaluate(() => { const o = {}; document.querySelectorAll('#view [data-flat]').forEach(e => { o[e.getAttribute('data-flat')] = e.getAttribute('data-value'); }); return o; });
  try {
    const cx = await br.newContext({ viewport: { width: 1500, height: 844 } });
    // T1 numbers equal in all four combinations
    for (const th of ['classic', 'executive']) for (const sk of ['light', 'dark']) {
      const p = await open(cx, '&theme=' + th + '&skin=' + sk), got = await flat(p), keys = Object.keys(got), bad = keys.filter(k => String(got[k]) !== String(WANT[k])), at = await p.evaluate(() => [document.body.getAttribute('data-skin'), document.getElementById('view').getAttribute('data-theme')]);
      ck('T1 [' + th + '/' + sk + '] ' + keys.length + ' drawn numbers == flatten(); the page really is in that theme/skin', keys.length >= 5 && !bad.length && at[0] === sk && at[1] === th, bad.slice(0, 3).concat(at)); await p.close();
    }
    const p = await open(cx, '&theme=executive&skin=light');
    // T2 segments and bubbles
    const seg = await p.$$eval('#view .xseg [data-drill^="health:"]', els => els.map(e => [e.getAttribute('data-drill'), Number(e.textContent.trim())])), segBad = seg.filter(([k, n]) => n !== (D[k] || []).length);
    ck('T2a health segments == the Health tile buckets (' + seg.map(s => s.join('=')).join(' ') + ')', seg.length === 4 && !segBad.length, segBad);
    const bubs = await p.$$eval('#view circle.bub', els => els.map(e => ({ id: e.getAttribute('data-open-project'), late: Number(e.getAttribute('data-late')), pct: Number(e.getAttribute('data-spentpct')), cx: Number(e.getAttribute('cx')), cy: Number(e.getAttribute('cy')), nudged: e.getAttribute('data-nudged') === '1' })));
    const np = await p.$eval('#view .notplotted', e => Number(e.getAttribute('data-n')));
    if (!plotted.length) incon('T2b', 'no plottable project in the sample'); else ck('T2b plotted (' + bubs.length + ') + not plotted (' + np + ') == active projects (' + rows.length + ')', bubs.length === plotted.length && np === notPlotted && bubs.length + np === rows.length, { bubs: bubs.length, np });
    // T3 each bubble's numbers == its row; the DRAWN position follows the axis (two gridlines give the scale)
    const gl = await p.$$eval('#view line.xgrid', els => els.map(e => [Number(e.getAttribute('data-v')), Number(e.getAttribute('y1'))]));
    const g0 = gl.find(g => g[0] === 0), g100 = gl.find(g => g[0] === 100);
    if (BREAK && bubs.length) await p.evaluate(() => { const c = document.querySelector('#view circle.bub'); c.setAttribute('cy', String(Number(c.getAttribute('cy')) + 5)); });
    const live = await p.$$eval('#view circle.bub', els => els.map(e => Number(e.getAttribute('cy')))), tipBad = [];
    for (let i = 0; i < bubs.length; i++) {
      const b = bubs[i], r = rows.find(x => String(x.id) === String(b.id)), exp = Number(r.spent || 0) / Number(r.planned) * 100, ey = g0 && g100 ? g0[1] + (g100[1] - g0[1]) * exp / 100 : NaN;
      if (Math.abs(b.pct - exp) > .06 || b.late !== late(b.id) || !(Math.abs(live[i] - ey) < .6)) tipBad.push(r.Value + ' pct=' + b.pct + '/' + exp.toFixed(1) + ' late=' + b.late + '/' + late(b.id) + ' cy=' + live[i] + '/' + (isNaN(ey) ? 'n/a' : ey.toFixed(1)));
      await p.evaluate(id => { const e = document.querySelector('#view circle.bub[data-open-project="' + id + '"]'); e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); e.dispatchEvent(new Event('focus')); }, b.id);
      const t = await p.$eval('#tip', e => ({ pl: e.getAttribute('data-planned'), sp: e.getAttribute('data-spent'), la: e.getAttribute('data-late'), v: !e.hidden }));
      if (!t.v || Number(t.pl) !== Number(r.planned) || Number(t.sp) !== Number(r.spent || 0) || Number(t.la) !== late(b.id)) tipBad.push(r.Value + ' tooltip ' + JSON.stringify(t));
    }
    if (!bubs.length) incon('T3', 'nothing plotted'); else ck('T3 ' + bubs.length + ' bubbles: data-* == the drill row, the drawn y follows the axis, the tooltip numbers == the row', tipBad.length === 0, tipBad.slice(0, 3));
    // T4 click opens the panel with exactly the right rows
    const open1 = async sel => { await p.evaluate(s => document.querySelector(s).dispatchEvent(new MouseEvent('click', { bubbles: true })), sel); await p.waitForTimeout(300); return p.$eval('#drill', d => d.hidden ? -1 : d.querySelectorAll('tbody tr').length); };
    const nBub = bubs.length ? await open1('#view circle.bub') : -2, nSeg = await open1('#view .xseg [data-drill="health:amber"]'), nAtt = await open1('#view .att-row');
    ck('T4 click: a bubble opens its 1 project, the Amber segment opens ' + (D['health:amber'] || []).length + ', an attention row opens 1', (bubs.length ? nBub === 1 : true) && nSeg === (D['health:amber'] || []).length && nAtt === 1, { nBub, nSeg, nAtt });
    await p.evaluate(() => { document.getElementById('drill').hidden = true; });
    // T5 the table view
    await p.evaluate(() => document.getElementById('mapTableBtn').click()); await p.waitForTimeout(200);
    const tb = await p.$$eval('#mapTable tbody tr', r => r.length), vis = await p.$eval('#mapTable', e => getComputedStyle(e).display !== 'none');
    ck('T5 Table view shows the same ' + bubs.length + ' projects as the bubbles', vis && tb === bubs.length, { tb, vis });
    // T8 segment label contrast in both skins (white/dark label on the status fill)
    const cs = {}; for (const sk of ['light', 'dark']) { const q = await open(cx, '&theme=executive&skin=' + sk); cs[sk] = await q.$$eval('#view .xseg [data-drill^="health:"]', els => els.map(e => { const c = getComputedStyle(e); return [e.getAttribute('data-drill'), c.color, c.backgroundColor]; })); await q.close(); }
    const lowC = []; Object.keys(cs).forEach(sk => cs[sk].forEach(([k, fg, bg]) => { const c = cr(fg, bg); if (c < 3) lowC.push(sk + ' ' + k + ' ' + c.toFixed(2)); }));
    ck('T8 every health segment label has contrast >= 3:1 on its fill, in both skins (' + (cs.light.length + cs.dark.length) + ' labels)', cs.light.length === 4 && cs.dark.length === 4 && !lowC.length, lowC);
    // T7 preference survives a reload; blocked storage leaves the default
    const c2 = await br.newContext({ viewport: { width: 1500, height: 844 } }); const a = await open(c2, '&theme=executive&skin=dark'); await a.close();
    const b2 = await c2.newPage(); await b2.goto(base, { waitUntil: 'load' }); await b2.waitForFunction(() => window.__capex && window.__capex.rendered); await b2.waitForTimeout(400);
    const rem = await b2.evaluate(() => [document.body.getAttribute('data-skin'), document.getElementById('view').getAttribute('data-theme')]);
    const c3 = await br.newContext({ viewport: { width: 1500, height: 844 } }); await c3.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const b3 = await c3.newPage(); b3.on('pageerror', e => errs.push(String(e))); await b3.goto(base, { waitUntil: 'load' }); await b3.waitForFunction(() => window.__capex && window.__capex.rendered); await b3.waitForTimeout(300);
    const blk = await b3.evaluate(() => [document.body.getAttribute('data-skin'), document.getElementById('view').getAttribute('data-theme')]);
    ck('T7 the choice is remembered across a reload (' + rem.join('/') + ') and blocked storage falls back to the default (' + blk.join('/') + ') without a page error', rem[0] === 'dark' && rem[1] === 'executive' && blk[0] === 'light' && blk[1] === 'classic' && !errs.length, { rem, blk, errs: errs.slice(0, 2) });
  } catch (e) { ck('T run', false, String(e).slice(0, 250)); }
  await br.close(); server.close();
  const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§THEME_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1);
})();

})().catch(function (e) { console.log('§PA_HARNESS_CRASH ' + (e && e.stack || e)); process.exit(1); });