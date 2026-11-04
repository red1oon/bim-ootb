#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-AIRGAP (prompts/DXF2BIM_MODELLER_LANE.md §L33). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: "works offline after first visit" (sw.js) was false for local DXFs: opening them failed at once with no network, and Convert could hang for ever.
// Each scenario uses its own browser profile. Online phase, then the server gone and the WHOLE browser, service worker included, behind a dead proxy; the cut itself is witnessed (page.setOfflineMode does not reach a service worker).
//   V one visit only: the page loads with no script failure, the shed opens and qualifies, Convert REPORTS the missing kernel, commits nothing, does not hang
//   P the shed used once online (open, Convert, IFC export): offline it converts to the same count and exports IFC
//   L a set with library fills used once online (HOUSE_DIR, typed sheets): offline no GAP:lod400_library_unreachable, and the same blocking codes as online
// VACUOUS (exit 2) when an input is missing; INCONCLUSIVE (exit 2) when the cut is not real, or OCI cannot be reached in L's online phase. CPU GL only.
// usage: NODE_PATH=~/bim-compiler/node_modules [HOUSE_DIR=<dir>] node modeller/tests/witness_dxf_airgap.js [V] [P] [L]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), SHED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked'), HOUSE = process.env.HOUSE_DIR || '';
let fails = 0, judged = 0, inconclusive = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms)), want = process.argv.slice(2).length ? process.argv.slice(2) : ['V', 'P', 'L'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const GL = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], list = d => fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f));
const openSet = async (pg, files) => { await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; document.getElementById('b-open').click(); }); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
  const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
  await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfMetaEditor && !window.DxfMetaEditor.state.busy && document.getElementById("dxf-convert")', { timeout: 180000 }); await sleep(1500);
  return pg.evaluate(() => { const g = window.DxfImportUI.state.gate, v = g.verdict, c = {}; (v ? v.blocking : []).forEach(b => { c[b.code] = (c[b.code] || 0) + 1; }); return { ok: g.ok, sheets: window.DxfImportUI.state.sheets.length, verdict: v && v.verdict, codes: c, lib: !!g.lib }; }); };
const convert = async pg => { await pg.evaluate(() => document.getElementById('dxf-convert').click());   // returns the end state; a hang is judged, not waited out
  const end = await pg.waitForFunction(() => { const U = window.DxfImportUI.state, s = document.getElementById('dxf-status'); return (U.last && U.last.nInserts > 0) || (s && /Convert failed/.test(s.textContent)); }, { timeout: 240000 }).then(() => true).catch(() => false); await sleep(1500);
  return pg.evaluate(e => { const U = window.DxfImportUI.state, s = document.getElementById('dxf-status'); return { ended: e, n: U.last ? U.last.nInserts : 0, oplog: window.Bonsai.oplog.length, status: s ? s.textContent.slice(0, 200) : '' }; }, end); };
const ifc = async pg => { await pg.evaluate(() => document.getElementById('b-export').click()); await pg.waitForSelector('.me-row[data-key="ifc"]', { visible: true }); await pg.evaluate(() => document.querySelector('.me-row[data-key="ifc"]').click());
  await pg.waitForFunction(() => /IFC exported|FAIL /.test(document.getElementById('stat').textContent), { timeout: 240000 }).catch(() => {}); return pg.evaluate(() => document.getElementById('stat').textContent.slice(0, 120)); };
async function scenario(id, setDir, online) {
  const PORT = 19000 + Math.floor(Math.random() * 3000), UDD = fs.mkdtempSync(path.join(process.env.WITNESS_TMP || os.tmpdir(), 'airgap-'));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  const socks = new Set(); srv.on('connection', c => { socks.add(c); c.on('close', () => socks.delete(c)); }); await new Promise(z => srv.listen(PORT, '127.0.0.1', z));
  const U = 'http://127.0.0.1:' + PORT + '/modeller/modeller.html', launch = extra => puppeteer.launch({ headless: 'new', userDataDir: UDD, protocolTimeout: 600000, args: GL.concat(extra || []) });
  const page = async br => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); return pg; };
  let br = await launch(), pg = await page(br); await pg.goto(U, { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI', { timeout: 120000 });
  await pg.evaluate(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 120 && !navigator.serviceWorker.controller; i++) await new Promise(z => setTimeout(z, 500)); }); await sleep(5000);
  const onl = online ? await online(pg) : null; console.log('§ONLINE ' + id + ' ' + JSON.stringify(onl)); await sleep(2000);
  await br.close(); await new Promise(z => { srv.close(z); socks.forEach(c => c.destroy()); });
  br = await launch(['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>']); pg = await page(br);
  const bad = [], errs = []; pg.on('response', r => { if (r.status() >= 500 && /\.js(\?|$)/.test(r.url())) bad.push(r.url().replace(/^.*?:\d+/, '').split('?')[0]); }); pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto(U, { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI', { timeout: 120000 });
  const cut = await pg.evaluate(async () => { const t = async u => { try { await fetch(u, { mode: 'no-cors', cache: 'no-store' }); return 'reached'; } catch (e) { return 'blocked'; } }; return [await t('https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/dxf2bim/library/p' + Date.now()), await t('https://example.com/?' + Date.now()), await t('/__none' + Date.now())]; });
  if (cut.some(c => c !== 'blocked')) { console.log('§INCONCLUSIVE ' + id + ' the network was not really cut ' + cut); inconclusive++; await br.close(); return null; }
  console.log('§CUT ' + id + ' OCI, outside host and origin all blocked');
  return { pg, br, onl, bad, errs, done: async () => { await br.close(); fs.rmSync(UDD, { recursive: true, force: true }); } };
}
(async () => {
  if (!fs.existsSync(SHED) || list(SHED).length !== 9) { console.log('§VACUOUS the 9 marked shed sheets are missing: ' + SHED); process.exit(2); }
  if (want.includes('V')) { const s = await scenario('V', SHED, null); if (s) { const { pg } = s;
    const scripts = s.bad.filter(u => !/\/lib\/kernel\//.test(u));
    ok('V1 one visit, air gap: the page loads with no page script failing (only the kernel stays deferred, owner\'s call)', scripts.length === 0, 'failed=' + JSON.stringify(scripts) + ' deferred failed=' + (s.bad.length - scripts.length));
    const g = await openSet(pg, list(SHED)); ok('V2 the local shed DXFs open and qualify with no network', g.ok && g.sheets === 9 && g.verdict === 'qualifies', JSON.stringify(g));
    const c = await convert(pg); ok('V3 Convert without the kernel ends, reports the reason, and leaves nothing committed (it used to hang for ever)', c.ended && c.n === 0 && c.oplog === 0 && /kernel/i.test(c.status), JSON.stringify(c));
    ok('V4 0 page errors', s.errs.length === 0, s.errs.join(' | ').slice(0, 300)); await s.done(); } }
  if (want.includes('P')) { const s = await scenario('P', SHED, async pg => { const g = await openSet(pg, list(SHED)), c = await convert(pg), i = await ifc(pg); return { g: g.ok, n: c.n, oplog: c.oplog, ifc: i }; }); if (s) { const { pg, onl } = s;
    if (!onl.n) { console.log('§INCONCLUSIVE P the online Convert built nothing ' + JSON.stringify(onl)); inconclusive++; } else {
      const g = await openSet(pg, list(SHED)), c = await convert(pg); ok('P1 used once online: offline it opens, qualifies and converts to the same count', g.ok && c.ended && c.n === onl.n, 'online n=' + onl.n + ' offline ' + JSON.stringify(c));
      const i = await ifc(pg); ok('P2 IFC export works offline', /IFC exported/.test(i), i + ' | online: ' + onl.ifc); ok('P3 0 page errors', s.errs.length === 0, s.errs.join(' | ').slice(0, 300)); } await s.done(); } }
  if (want.includes('L')) { if (!HOUSE || !fs.existsSync(HOUSE)) { console.log('§VACUOUS L: HOUSE_DIR unset or missing'); inconclusive++; } else { const s = await scenario('L', HOUSE, async pg => openSet(pg, list(HOUSE))); if (s) { const { pg, onl } = s;
    if (!onl.lib || onl.codes['GAP:lod400_library_unreachable']) { console.log('§INCONCLUSIVE L OCI was not reached in the online phase ' + JSON.stringify(onl)); inconclusive++; } else {
      const g = await openSet(pg, list(HOUSE)); ok('L1 a library set used once online: offline the library comes from the cache, no lod400_library_unreachable', g.lib && !g.codes['GAP:lod400_library_unreachable'], JSON.stringify(g));
      ok('L2 offline it judges the same as online: the same blocking codes and counts', JSON.stringify(g.codes) === JSON.stringify(onl.codes), 'online ' + JSON.stringify(onl.codes)); } await s.done(); } } }
  const v = inconclusive ? 'INCONCLUSIVE' : fails ? 'FAIL' : judged ? 'PASS' : 'VACUOUS'; console.log('§RESULT judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive + ' ' + v); process.exit(fails ? 1 : inconclusive || !judged ? 2 : 0);
})().catch(e => { console.log('§ERROR ' + (e && e.stack || e)); process.exit(3); });
