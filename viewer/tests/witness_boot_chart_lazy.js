// ⚠ DO NOT REMOVE — WITNESS W-BOOT-CHART-LAZY (2026-11-28, bim-compiler prompts/MOBILE_PERF.md §P3 STAGE 2 SPEC, move 1)
// ISSUE THIS PROVES OR DISPROVES: Chart.js (lib/chart.umd.min.js, ~205 KB) was fetched and parsed on EVERY viewer boot, phone
// included, while the only consumer in the viewer page is the data-gated FM dashboard (hba_dashboard.js). After the move:
//   B1 no chart.umd request during boot and window.Chart undefined (static half: viewer.html has no chart.umd tag)
//   B2 opening the FM dashboard loads the lib ONCE and draws its charts (§HBA_DASH charts=3 chart_lib=lazy)
//   B3 close → reopen: chart_lib=present, no second request; the close leaves no pane
//   B4 scripts/boot_weight.js eager bytes ≤ pre-move eager bytes − the file's size (pre-move = viewer.html at OLD_REF)
//   RED: viewer.html at OLD_REF (default 2c19610d, before the move) must fail B1's static half.
// §-log first — READ viewer/tests/witness_boot_chart_lazy.log after every run. Run: node viewer/tests/witness_boot_chart_lazy.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), OLD_REF = process.env.OLD_REF || '2c19610d';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const log = []; let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
const hasTag = html => /<script[^>]+src="lib\/chart\.umd\.min\.js/.test(html);
// eager bytes of a viewer.html text, by scripts/boot_weight.js's own rule (comments stripped, local <script src> sizes summed) over today's files
const eager = html => { html = html.replace(/<!--[\s\S]*?-->/g, ''); let n = 0;
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) { if (/^(https?:)?\/\//.test(m[1])) continue; const f = path.normalize(path.join(ROOT, 'viewer', m[1].split('?')[0])); if (fs.existsSync(f)) n += fs.statSync(f).size; } return n; };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } }), page = await ctx.newPage(), cons = [], reqs = [], errs = [];
  page.on('console', m => cons.push(m.text())); page.on('request', q => { if (/chart\.umd/.test(q.url())) reqs.push(q.url()); }); page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?db=buildings/Duplex_extracted.db', { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { await page.waitForTimeout(1000); ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false)).catch(() => false); }
  await page.waitForTimeout(1500);
  const html = fs.readFileSync(path.join(ROOT, 'viewer', 'viewer.html'), 'utf8'), chartAtBoot = await page.evaluate(() => typeof window.Chart);
  verdict(ready && !hasTag(html) && reqs.length === 0 && chartAtBoot === 'undefined', 'B1 no chart.umd at boot (no tag, no request, window.Chart undefined)', 'ready=' + ready + ' tag=' + hasTag(html) + ' requests=' + reqs.length + ' typeof Chart=' + chartAtBoot);
  // B2: open the FM dashboard (empty logs still build the three chart configs)
  const c0 = cons.length, okReady = await page.evaluate(() => !!(window.HBADashPane && HBADashPane._ready()));
  await page.evaluate(() => HBADashPane.toggle(APP));
  for (let i = 0; i < 40 && !cons.slice(c0).some(t => /^§HBA_DASH charts=/.test(t)); i++) await page.waitForTimeout(250);
  const l2 = cons.slice(c0).find(t => /^§HBA_DASH charts=/.test(t)) || '', n2 = reqs.length;
  verdict(okReady && /^§HBA_DASH charts=3 chart_lib=lazy/.test(l2) && n2 === 1, 'B2 first open loads the lib once and draws 3 charts', 'deps_ready=' + okReady + ' "' + l2 + '" requests=' + n2);
  // B3: close, reopen
  await page.evaluate(() => HBADashPane.toggle(APP)); const gone = await page.evaluate(() => !document.getElementById('hba-dash-pane'));
  const c1 = cons.length; await page.evaluate(() => HBADashPane.toggle(APP));
  for (let i = 0; i < 20 && !cons.slice(c1).some(t => /^§HBA_DASH charts=/.test(t)); i++) await page.waitForTimeout(150);
  const l3 = cons.slice(c1).find(t => /^§HBA_DASH charts=/.test(t)) || '';
  verdict(gone && /^§HBA_DASH charts=3 chart_lib=present/.test(l3) && reqs.length === 1 && errs.length === 0, 'B3 close leaves no pane; reopen uses the loaded lib, no second request, no page error', 'gone=' + gone + ' "' + l3 + '" requests=' + reqs.length + ' pageerrors=' + JSON.stringify(errs));
  await browser.close(); server.close();
  // B4 + RED: the pre-move tree
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bcl-')); cp.execSync('git archive ' + OLD_REF + ' viewer/viewer.html | tar -x -C ' + tmp, { cwd: ROOT });
  const oldHtml = fs.readFileSync(path.join(tmp, 'viewer', 'viewer.html'), 'utf8'), size = fs.statSync(path.join(ROOT, 'viewer', 'lib', 'chart.umd.min.js')).size;
  const now = eager(html), before = eager(oldHtml);
  S('§BOOT_CHART eager_before=' + before + ' eager_now=' + now + ' saved=' + (before - now) + ' chart_bytes=' + size + ' (boot_weight.js rule, today\'s files)');
  verdict(before - now >= size, 'B4 eager boot bytes fell by at least the chart lib (' + OLD_REF + ' page vs now)', 'saved=' + (before - now) + ' chart=' + size);
  const redOk = hasTag(oldHtml);
  S('§BOOT_CHART_RED pre-move viewer.html ' + (redOk ? 'FAILS B1 (carries the tag) as required' : 'has no tag (control not detected)'));
  const v = !redOk ? (fails ? 'FAIL' : 'INCONCLUSIVE') : fails ? 'FAIL' : 'PASS';
  S(`§WITNESS_BOOT_CHART_LAZY ${v} judged=${judged} fails=${fails} red_control=${redOk ? 'detected' : 'not detected'}`);
  fs.writeFileSync(path.join(__dirname, 'witness_boot_chart_lazy.log'), log.join('\n') + '\n'); process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { S('§WITNESS_BOOT_CHART_LAZY FAIL fatal=' + (e && e.stack || e)); fs.writeFileSync(path.join(__dirname, 'witness_boot_chart_lazy.log'), log.join('\n') + '\n'); process.exit(1); });
