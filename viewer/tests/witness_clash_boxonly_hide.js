#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CLASH_BOXONLY_HIDE (2026-10-05, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §V.4)
// Scope: the clash LIST on a real building — rows the mesh test rules out (CLEAR = box-only) are hidden when the
// pair has ≥ display.hide_box_only_above box hits, and kept (struck through) below it.
// Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: user, 2026-10-05: "any thousands means no need to show bbox clashes" —
// JELAPANG DRAINAGE×ROAD = 23,288 box hits, 92 % box-only. RED on main = box-only rows are listed (struck).
// GREEN = above the limit no visible row is CLEAR and the hidden count equals the page's CLEAR count; below the
// limit nothing is hidden. The verdicts come from the production clash_narrow.js on the SAME page rows.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (no load / no rtree / no module), VACUOUS per case (page has no CLEAR
// row, so hiding is unproven), RED CONTROL (witness_kit).
// Env: ROOT · BLD (default JELAPANG_AFTER) · BLD_DIR · GPU=sw|real · PORT · BIG (pair ≥ limit) · SMALL (pair < limit) · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'JELAPANG_AFTER';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8574);
const BIG = (process.env.BIG || 'DRAINAGE,ROAD').split(','), SMALL = (process.env.SMALL || 'SIGNAGE,DRAINAGE').split(',');
const LOG = process.env.LOG || '/tmp/witness_clash_boxonly_hide.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

// in-page: the same calls the matrix cell click makes (clash_matrix.js), then read the rendered list DOM
async function runCase(pair) {
  const A = window.APP, a = pair[0], b = pair[1];
  const rules = await new Promise(r => A._loadClashRules(r));
  const rule = rules.clash_rules.filter(r => (r.source.discipline === a && r.target.discipline === b) || (r.source.discipline === b && r.target.discipline === a))[0];
  if (!rule) return { pair: a + '×' + b, err: 'no rule' };
  rules._activeTolerance = A._clashTolerance(rule);
  if (A._clashRevealActive) A._dismissClashes(true);
  const rows = A._queryClashesPair(null, rules, a, b, 0);
  A._revealClashes(rows, rules, 100, 100, a + ' vs ' + b, rule);
  A._countClashesAsync(rules, a, b);
  await A.clashNarrow.qualifyRows(rows, { label: a + '|' + b, sync: true });
  A._refreshClashList();
  const body = A._clashListDiv.querySelector('#clash-list-body');
  const visIdx = Array.from(body.querySelectorAll('[data-clash-idx]')).map(e => +e.getAttribute('data-clash-idx'));
  const hidEl = body.querySelector('#clash-boxonly-hidden');
  const clear = rows.filter(r => r[9] && r[9].verdict === 'CLEAR').length, clash = rows.filter(r => r[9] && r[9].verdict === 'CLASH').length;
  const out = { pair: a + '×' + b, boxTotal: A._clashPairBoxTotal, limit: rules.display.hide_box_only_above || 0, page: rows.length, clear, clash,
    visible: visIdx.length, visibleClear: visIdx.filter(i => rows[i][9] && rows[i][9].verdict === 'CLEAR').length,
    hiddenText: hidEl ? hidEl.textContent : '', hidden: hidEl ? parseInt(hidEl.textContent, 10) : 0,
    maxVisible: rules.display.max_visible || 20, totalText: (A._clashListDiv.querySelector('#clash-total-count') || {}).textContent || '' };
  A._dismissClashes(true);
  return out;
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cbh-profile-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 30 * 60 * 1000,
    args: ['--no-sandbox', '--window-size=1300,840', '--enable-precise-memory-info'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logStream.write('[con] ' + t + '\n'); if (/§CLASH_BOXONLY_HIDE|§CLASH_COUNT/.test(t)) console.log('  ' + t); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  const cases = [];
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§CBH_NAV ' + url + ' gpu=' + GPU);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 900000, polling: 1000 });
    try { await page.waitForFunction(() => window._bvhReady && !window.APP._bvhRunning && !(window.APP._bvhPending || []).length, { timeout: 600000, polling: 1000 }); } catch (e) { log('§CBH bvh chain did not drain: ' + e.message); }
    await page.evaluate(() => { try { window.APP._ensureClashIndexes(); } catch (e) {} });
    await page.waitForFunction(() => window.APP._clashRtreeReady, { timeout: 600000, polling: 500 });
    const hasModule = await page.evaluate(() => !!(window.APP.clashNarrow && window.APP.clashNarrow.qualifyRows && window.APP._clashTolerance));
    if (!hasModule) { log('§CBH verdict=INCONCLUSIVE reason=clash_narrow or _clashTolerance missing'); process.exitCode = 2; return; }
    for (const [kind, pair] of [['big', BIG], ['small', SMALL]]) {
      const r = await page.evaluate(runCase, pair); r.kind = kind; cases.push(r);
      log('§CBH_CASE ' + kind + ' ' + JSON.stringify(r));
    }
  } catch (e) { log('§CBH verdict=INCONCLUSIVE reason=' + e.message); process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (!cases.length) return;
  const big = rs => rs.filter(r => r.kind === 'big'), small = rs => rs.filter(r => r.kind === 'small');
  cases.forEach(r => { if (!r.clear) log('§CBH_VACUOUS ' + r.kind + ' ' + r.pair + ' page has no CLEAR row — hiding not exercised'); });
  Witness('clash_boxonly_hide')
    .population(() => cases)
    .schema({ type: 'object', required: ['pair', 'boxTotal', 'limit', 'page', 'clear', 'visible', 'visibleClear', 'hidden'],
      properties: { boxTotal: { type: 'integer', minimum: 0 }, page: { type: 'integer', minimum: 1 } } })
    .invariant('big: box total ≥ limit (case is really above the limit)', rs => big(rs).every(r => r.limit > 0 && r.boxTotal >= r.limit))
    .invariant('big: page has CLEAR rows (not VACUOUS)', rs => big(rs).every(r => r.clear > 0))
    .invariant('big: no visible row is box-only', rs => big(rs).every(r => r.visibleClear === 0))
    .invariant('big: hidden count == CLEAR rows on the page', rs => big(rs).every(r => r.hidden === r.clear))
    .invariant('big: visible == min(page − CLEAR, max_visible)', rs => big(rs).every(r => r.visible === Math.min(r.page - r.clear, r.maxVisible)))
    .invariant('small: box total < limit', rs => small(rs).every(r => r.boxTotal < r.limit))
    .invariant('small: nothing hidden, box-only rows still listed', rs => small(rs).every(r => r.hidden === 0 && (r.clear === 0 || r.visibleClear > 0)))
    .invariant('both: header still shows the box Total after the refresh', rs => rs.every(r => r.totalText === 'Total: ' + r.boxTotal))
    .redControl(rs => rs.map(r => r.kind === 'big' ? Object.assign(r, { visibleClear: 1 }) : r))
    .run();
  logStream.end();
})();
