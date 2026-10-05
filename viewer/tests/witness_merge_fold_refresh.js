#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §MERGE_FOLD_REFRESH (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MERGED_DB)
// Scope: Open→Merge of a DB whose elements belong to a building name ALREADY in the scene (the BIM partner's
// GEOTECH/CHAINAGE/GABION/EARTHWORK/ROW files fold into "JELAPANG"). Read the log after every run.
//
// ISSUE THIS PROVES OR DISPROVES: "the merged elements are not in the Find panel" — the only Find refresh after a
// merge was streaming.js §MERGE_CONTRACT (fires after a NEW building streams); a fold into an existing name has
// added=[] → no stream → an open Find tree keeps the pre-merge counts. Also checks the folded elements are DRAWN
// (registered in a scene mesh), since the same added=[] path queues nothing to stream.
// GREEN = open Find tree total grows by exactly the folded count AND every folded guid is registered in a mesh.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load/merge failed or source DB empty), RED (tree or canvas short).
// Env: ROOT · BLD (default JELAPANG_AFTER) · BLD_DIR · SRC (partner-only .db, building = JELAPANG) · GPU · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'JELAPANG_AFTER';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const SRC = process.env.SRC;
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8578);
const LOG = process.env.LOG || '/tmp/witness_merge_fold_refresh.log';
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
  if (!SRC || !fs.existsSync(SRC)) { log('§MFR_VERDICT INCONCLUSIVE reason=no_SRC_db'); process.exit(2); }
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
    await page.evaluate(() => window.APP.loadNavigate());
    await page.evaluate(() => window.APP.openFindPanel(''));
    await new Promise(r => setTimeout(r, 1500));
    const treeTotal = () => page.evaluate(() => { let n = 0; document.querySelectorAll('#find-tree > *').forEach(e => { const m = /\((\d+)\)\s*$/.exec((e.textContent || '').trim()); if (m) n += +m[1]; }); return n; });
    const t0 = await treeTotal();
    const merged = await page.evaluate(async () => {
      const A = window.APP, b = new Uint8Array(await (await fetch('/__src.db')).arrayBuffer());
      const src = new A._SQL.Database(b); const guids = src.exec('SELECT guid FROM elements_meta')[0]; src.close();
      window.__mfrGuids = guids ? guids.values.map(r => r[0]) : [];
      const ok = await A._mergeDbIntoScene('partners_only.db', b);
      return { ok, n: window.__mfrGuids.length, dbN: A.db.exec('SELECT COUNT(*) FROM elements_meta')[0].values[0][0] };
    });
    await idle(page);
    await new Promise(r => setTimeout(r, 1500));
    const t1 = await treeTotal();
    const reg = await page.evaluate(() => { const A = window.APP, s = new Set();
      for (const id in (A._batchMeta || {})) (A._batchMeta[id] || []).forEach(e => s.add(e.guid));
      for (const id in (A._instanceMeta || {})) (A._instanceMeta[id] || []).forEach(e => s.add(e.guid));
      for (const id in (A._mergedMeta || {})) (A._mergedMeta[id] || []).forEach(e => s.add(e.guid));
      for (const id in (A.guidMap || {})) s.add(A.guidMap[id]);
      return window.__mfrGuids.filter(g => s.has(g)).length; });
    log(`§MFR_TREE before=${t0} after=${t1} grew=${t1 - t0} folded=${merged.n} merge_ok=${merged.ok} db_rows=${merged.dbN}`);
    log(`§MFR_CANVAS folded=${merged.n} registered=${reg}`);
    if (!merged.ok || !merged.n || !t0) verdict = 'INCONCLUSIVE';
    else if (t1 - t0 === merged.n && reg === merged.n) { verdict = 'GREEN'; code = 0; }
    else { verdict = 'RED' + (t1 - t0 !== merged.n ? ' tree_stale' : '') + (reg !== merged.n ? ' not_drawn=' + (merged.n - reg) : ''); code = 1; }
  } catch (e) { log('§MFR_ERR ' + e.message); }
  log('§MFR_VERDICT ' + verdict);
  await browser.close(); server.close(); out.end(); process.exit(code);
})();
