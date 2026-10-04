#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §IMPORT_FEEDBACK (2026-10-05, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §Z)
// Scope: an IFC import started from the VIEWER (viewer.html has no import card) must show progress on the viewer's status
// line from the first moment. Read the log after every run — the exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: user, 2026-10-05: "During opening of IFCs import it should give status feedback in progress.
// It takes some time before doing so". Cause: import.js wrote only to #import-status / #import-progress-bar, absent on
// viewer.html. GREEN = the status line changes within 1 s of the import call, keeps changing (percent rising), and the
// longest silent gap is reported as a number. RED on main = no import text on the status line before the import ends.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load/import failed), RED CONTROL. Env: ROOT · IFC_DIR · GPU · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const IFC_DIR = process.env.IFC_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC', 'IFC');
const FILES = fs.readdirSync(IFC_DIR).filter(f => /\.ifc$/i.test(f)).sort();
const GPU = process.env.GPU || 'sw', PORT = +(process.env.PORT || 8580);
const LOG = process.env.LOG || '/tmp/witness_import_feedback.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream', '.ifc': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let fp = u.startsWith('/__ifc/') ? path.join(IFC_DIR, u.slice(7)) : path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cif-')), protocolTimeout: 3600000, args: ['--no-sandbox'].concat(gpuArgs) });
  const page = await browser.newPage();
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  let R = null;
  try {
    await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.importMultiIFC && window.APP.status, { timeout: 300000, polling: 500 });
    // realistic: the user opens files after the current model has loaded (else its own download lines interleave)
    await page.waitForFunction(() => { const A = window.APP; return A.activeBuilding && A.buildingsRendered && A.buildingsRendered.has(A.activeBuilding) && !A.streaming; }, { timeout: 600000, polling: 1000 }).catch(() => {});
    R = await page.evaluate(async (names) => {
      const A = window.APP, files = [];
      for (const n of names) files.push(new File([await (await fetch('/__ifc/' + encodeURIComponent(n))).blob()], n));
      const seen = []; let t0 = 0;
      const mo = new MutationObserver(() => { seen.push({ t: performance.now() - t0, text: A.status.textContent }); });
      mo.observe(A.status, { childList: true, characterData: true, subtree: true });
      t0 = performance.now();
      const out = await A.importMultiIFC(files);
      const tEnd = performance.now() - t0; mo.disconnect();
      return { key: out && out.key, tEnd, seen };
    }, FILES);
  } catch (e) { log('§CIF verdict=INCONCLUSIVE reason=' + e.message); process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (!R) { logStream.end(); return; }
  const imp = R.seen.filter(s => /^(Merging \d+ IFC|Reading \d+\/\d+:|\d+\/\d+: \S+\.ifc|Building merged|Merged \d+ files)/i.test(s.text));
  const other = R.seen.filter(s => imp.indexOf(s) < 0);
  let gap = 0, gapAt = ''; for (let i = 1; i < imp.length; i++) if (imp[i].t - imp[i - 1].t > gap) { gap = imp[i].t - imp[i - 1].t; gapAt = imp[i - 1].text; }
  if (imp.length) gap = Math.max(gap, R.tEnd - imp[imp.length - 1].t > gap && !/Merged/.test(imp[imp.length - 1].text) ? R.tEnd - imp[imp.length - 1].t : gap);
  const pcts = imp.map(s => (s.text.match(/\((\d+)%\)/) || [])[1]).filter(Boolean).map(Number);
  const row = { otherLines: other.length, otherSample: other.slice(0, 3).map(s => s.text.slice(0, 60)), key: R.key, totalS: +(R.tEnd / 1000).toFixed(1), updates: imp.length, firstS: imp.length ? +(imp[0].t / 1000).toFixed(2) : null,
    longestSilentS: +(gap / 1000).toFixed(1), silentAfter: gapAt.slice(0, 90), pctFirst: pcts[0], pctLast: pcts[pcts.length - 1], pctMonotonic: pcts.every((p, i) => !i || p >= pcts[i - 1]), last: imp.length ? imp[imp.length - 1].text : '' };
  log('§CIF ' + JSON.stringify(row));
  imp.slice(0, 6).concat(imp.slice(-3)).forEach(s => log('§CIF_STATUS t=' + (s.t / 1000).toFixed(2) + 's ' + s.text.slice(0, 110)));
  Witness('import_feedback')
    .population(() => [row])
    .schema({ type: 'object', required: ['updates', 'firstS', 'longestSilentS'] })
    .invariant('import text on the viewer status line within 1 s of the call', rs => rs.every(r => r.firstS !== null && r.firstS <= 1))
    .invariant('status keeps updating (≥ 20 import lines) with a rising percent', rs => rs.every(r => r.updates >= 20 && r.pctMonotonic && r.pctLast > r.pctFirst))
    .invariant('ends on the merged result line', rs => rs.every(r => /Merged/.test(r.last)))
    .redControl(rs => rs.map(r => Object.assign(r, { firstS: null })))
    .run();
  logStream.end();
})();
