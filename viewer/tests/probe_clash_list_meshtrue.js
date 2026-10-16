#!/usr/bin/env node
// ⚠ DO NOT REMOVE — PROBE §CLASH_LIST_MESHTRUE (2026-09-04, CLASH_GATE_OBB_NARROWPHASE.md §M.6)
// Wiring check for the PRODUCTION path (not the witness's direct qualifyRows call): the matrix cell
// click flow — _queryClashesPair → _revealClashes → _qualifyClashRows (async, yielding chunks) →
// _refreshClashList — must leave the open list showing `mesh-true n/N` in its header and struck
// `bbox-only` rows in its body. Verdict truth is witness_clash_mesh_narrowphase.js's job; this only
// proves the annotated rows reach the DOM the user sees. Read the log after every run.
// Env: ROOT · BLD (default Terminal) · BLD_DIR · GPU · PORT · LOAD_MS · LOG · PAIR (default ARC|STR)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'Terminal';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8575);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const PAIR = (process.env.PAIR || 'ARC|STR').split('|');
const LOG = process.env.LOG || ('/tmp/probe_clash_list_meshtrue_' + BLD + '.log');
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
function logRaw(l) { logStream.write(l + '\n'); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clm-profile-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 30 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv), args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logRaw('[con] ' + t); if (/§CLASH_(NARROWPHASE|MEM|NARROW_ERR|MATRIX_FILTER|QUERY_RTREE|REVEAL)/.test(t)) console.log('  ' + t); });
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  let verdict = 'INCONCLUSIVE';
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§CLM_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer && window.APP.camera, { timeout: LOAD_MS });
    await page.waitForFunction(() => { const A = window.APP; return A.activeBuilding && A.buildingsRendered && A.buildingsRendered.has(A.activeBuilding) && !A.streaming; }, { timeout: LOAD_MS, polling: 1000 });
    try { await page.waitForFunction(() => window._bvhReady && !window.APP._bvhRunning && !(window.APP._bvhPending || []).length, { timeout: 600000, polling: 1000 }); } catch (e) { logRaw('[wait] bvh: ' + e.message); }
    await page.evaluate(() => window.APP._ensureClashIndexes());
    await page.waitForFunction(() => window.APP._clashRtreeReady, { timeout: 600000, polling: 500 });
    const r = await page.evaluate(async (pair) => {
      const A = window.APP;
      const rules = await new Promise(res => A._loadClashRules(res));
      const rule = rules.clash_rules.find(x => (x.source.discipline === pair[0] && x.target.discipline === pair[1]) || (x.source.discipline === pair[1] && x.target.discipline === pair[0]));
      rules._activeTolerance = rule.tolerance_m || 0.025;
      A._currentClashStorey = null; A._clashPairOffset = 0;
      // the exact production sequence from clash_matrix.js's cell-click handler
      const clashes = A._queryClashesPair(null, rules, pair[0], pair[1], 0);
      A._currentClashes = clashes; A._currentClashPairLabel = pair[0] + ' vs ' + pair[1];
      A._revealClashes(clashes, rules, 20, 20, pair[0] + ' vs ' + pair[1], rule);
      const before = A._clashListDiv ? A._clashListDiv.innerHTML : '';
      const hadMeshTrueBefore = before.indexOf('clash-mesh-true') >= 0;
      A._qualifyClashRows(clashes, pair[0] + '|' + pair[1]);
      // wait for the async chunked run to finish (it re-renders the list when done)
      const t0 = performance.now();
      while (performance.now() - t0 < 60000) { await new Promise(res => setTimeout(res, 100)); if (A.clashNarrow.lastRun && A.clashNarrow.lastRun.label === pair[0] + '|' + pair[1]) break; }
      await new Promise(res => setTimeout(res, 200));
      const div = A._clashListDiv;
      const hdr = div ? div.querySelector('#clash-mesh-true') : null;
      const body = div ? div.querySelector('#clash-list-body') : null;
      const struck = body ? body.querySelectorAll('[data-clash-idx][style*="line-through"]').length : 0;
      const bboxOnly = body ? (body.innerHTML.match(/bbox-only/g) || []).length : 0;
      const ticks = body ? (body.innerHTML.match(/MESH_TRIANGLES_INTERSECT|MESH_CONTAINED/g) || []).length : 0;
      const shownRows = body ? body.querySelectorAll('[data-clash-idx]').length : 0;
      const annotated = clashes.filter(c => c[9] && c[9].verdict).length;
      const clear = clashes.filter(c => c[9] && c[9].verdict === 'CLEAR').length;
      const lr = A.clashNarrow.lastRun;
      return { page: clashes.length, annotated, clear, hadMeshTrueBefore, hdrText: hdr ? hdr.textContent : null, struck, bboxOnly, ticks, shownRows, ms: lr ? lr.ms : null, counts: lr ? lr.counts : null };
    }, PAIR);
    log(`§CLASH_LIST_MESHTRUE pair=${PAIR.join('|')} pageRows=${r.page} annotated=${r.annotated} clear=${r.clear} headerBefore=${r.hadMeshTrueBefore ? 'present' : 'absent'} header="${r.hdrText}" shownRows=${r.shownRows} struckRows=${r.struck} bboxOnlyTags=${r.bboxOnly} tickTags=${r.ticks} qualifyMs=${r.ms}`);
    const expectStruck = Math.min(r.shownRows, r.shownRows) >= 0;
    const ok = r.annotated === r.page && r.hdrText && r.hdrText.indexOf('mesh-true') === 0 && r.struck === r.bboxOnly && (r.clear === 0 || r.struck > 0) && expectStruck;
    verdict = ok ? 'PASS' : 'FAIL';
  } catch (e) { log('§CLM_ERROR ' + (e && e.stack || e)); }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  log('§CLASH_LIST_MESHTRUE verdict=' + verdict);
  if (verdict !== 'PASS') process.exitCode = 1;
  logStream.end();
})();
