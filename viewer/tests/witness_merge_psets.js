#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §MERGE_PSETS (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MERGE_PSETS)
// Scope: Open→Merge must carry element properties (element_psets) with the elements it brings. Read the log after every run.
//
// ISSUE THIS PROVES OR DISPROVES: "a merged model loses its properties" — Merged.db held 0 element_psets rows for the partner's
// GEOTECH / GABION / CHAINAGE / ROW: scene.js _MERGE_META_TABLES had no element_psets. That table has no unique key, so a
// re-merge must not duplicate rows either.
// Fixture (real rows, no synthesis): LIVE = JELAPANG_AFTER.db with its 138 SIGNAGE elements removed; SRC = those 138 elements
// + their 1,911 property rows. GREEN = merge 1 adds exactly SRC's pset rows; merge 2 of the same SRC adds 0.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (fixtures missing / load or merge failed / SRC has 0 pset rows), RED.
// Env: ROOT · LIVE (dir+name of the live .db) · SRC (.db) · GPU · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const LIVE = process.env.LIVE;
const BLD = LIVE ? path.basename(LIVE, '.db') : '';
const BLD_DIR = LIVE ? path.dirname(LIVE) : '';
const SRC = process.env.SRC;
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8579);
const LOG = process.env.LOG || '/tmp/witness_merge_psets.log';
const out = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { out.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (u === '/__src.db') fp = SRC;
  else if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

const idle = async page => { let stable = 0;
  for (let i = 0; i < 300 && stable < 4; i++) { await new Promise(r => setTimeout(r, 1500));
    stable = (await page.evaluate(() => !!window.APP.streaming || (window.APP._mergePending || []).length > 0)) ? 0 : stable + 1; } };

(async () => {
  if (!SRC || !fs.existsSync(SRC) || !LIVE || !fs.existsSync(LIVE)) { log('§MPS_VERDICT INCONCLUSIVE reason=fixtures_missing'); process.exit(2); }
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mfr-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => out.write('[con] ' + m.text() + '\n'));
  page.on('pageerror', e => out.write('[pageerror] ' + e.message + '\n'));
  let verdict = 'INCONCLUSIVE', code = 2;
  try {
    await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 1800000, polling: 1000 });
    await idle(page);
    const R = await page.evaluate(async () => {
      const A = window.APP, b = new Uint8Array(await (await fetch('/__src.db')).arrayBuffer());
      const src = new A._SQL.Database(b);
      const srcPs = src.exec('SELECT COUNT(*) FROM element_psets')[0].values[0][0];
      const gl = src.exec('SELECT guid FROM elements_meta')[0].values.map(r => "'" + r[0].replace(/'/g, "''") + "'").join(','); src.close();
      const cnt = () => { try { return A.db.exec('SELECT COUNT(*) FROM element_psets WHERE guid IN (' + gl + ')')[0].values[0][0]; } catch (e) { return -1; } };
      const before = cnt();
      const ok1 = await A._mergeDbIntoScene('src_sign.db', b);
      const after1 = cnt();
      const ok2 = await A._mergeDbIntoScene('src_sign.db', b);
      const after2 = cnt();
      return { srcPs, before, ok1, after1, ok2, after2 };
    });
    log('§MPS_COUNTS ' + JSON.stringify(R));
    if (!R.ok1 || !R.srcPs) verdict = 'INCONCLUSIVE';
    else if (R.before === 0 && R.after1 === R.srcPs && R.after2 === R.after1) { verdict = 'GREEN'; code = 0; }
    else { verdict = 'RED' + (R.after1 !== R.srcPs ? ' merge1_added=' + (R.after1 - R.before) + '_of_' + R.srcPs : '') + (R.after2 !== R.after1 ? ' remerge_dup=' + (R.after2 - R.after1) : ''); code = 1; }
  } catch (e) { log('§MPS_ERR ' + e.message); }
  log('§MPS_VERDICT ' + verdict);
  await browser.close(); server.close(); out.end(); process.exit(code);
})();
