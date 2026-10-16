#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §PANELS_COLLAPSED (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md; user 2026-10-09: "panels … all expanded and thus cluttering long"). Read the log after every run.
// ISSUE PROVEN/DISPROVEN: the civil panels (Road standards [+ Speed zones + Chainage sections], Road report) open with EVERY <details> group closed, nothing is lost, and the controls still work.
//  (1) open <details> count inside each panel == 0 after it has mounted;
//  (2) the Speed zones on/off checkbox is VISIBLE while its group is closed, and checking it paints (A.speedZones.active()), unchecking reverts;
//  (3) expanding the Speed zones group reveals the legend with one row per derived zone (content intact, only folded);
//  (5) Earthworks (after Cut & Fill computed: bands folded, count kept) and Roadworks (pending list folded) panels open with 0 groups open;
//  (4) VACUOUS guard: each panel must contain >= 1 <details> (else INCONCLUSIVE — a panel with no groups proves nothing).
// Env: ROOT (default this checkout; old checkout for the RED run) · BLD_DIR · NAME · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC'), NAME = process.env.NAME || 'CivilWorksPath';
const PORT = +(process.env.PORT || 8620), LOG = process.env.LOG || '/tmp/witness_panels_collapsed.log';
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, r) => { try { const u = decodeURIComponent(q.url.split('?')[0]); let fp = path.join(ROOT, u); if (u.startsWith('/buildings/')) fp = path.join(DIR, u.slice(11));
  if (!fs.existsSync(fp)) { const a = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(a)) fp = a; else { r.writeHead(404); r.end(); return; } }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(r); } catch (e) { r.writeHead(500); r.end(); } });
const sl = ms => new Promise(r => setTimeout(r, ms));
(async () => { await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wpc-')), protocolTimeout: 1800000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--js-flags=--max-old-space-size=8192', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${NAME}.db`, { waitUntil: 'domcontentloaded', timeout: 900000 });
  let ok = false; for (let i = 0; i < 1200 && !ok; i++) { await sl(500); try { ok = await p.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && APP.scene && APP.collectMeshes(o => o.isMesh).length > 0)); } catch (e) {} }
  const fin = (c) => { fs.writeFileSync(LOG, out.join('\n') + '\n'); b.close().catch(() => {}); srv.close(); process.exit(c); };
  if (!ok) { log('§PANELS_COLLAPSED verdict=INCONCLUSIVE (model never ready)'); return fin(2); }
  await sl(4000);
  const R = await p.evaluate(async () => { const A = APP, sl = ms => new Promise(r => setTimeout(r, ms)), out = {};
    const stat = id => { const el = document.getElementById(id); if (!el) return null; const ds = el.querySelectorAll('details'); return { groups: ds.length, open: [].filter.call(ds, d => d.open).map(d => d.className || d.getAttribute('data-lvl') || 'details') }; };
    await A.showRoadStandards(); for (let i = 0; i < 40 && !document.querySelector('#road-standards-panel .sz-toggle'); i++) await sl(500); await sl(1500);
    out.standards = stat('road-standards-panel');
    const tg = document.querySelector('#road-standards-panel .sz-toggle'), more = document.querySelector('#road-standards-panel .sz-more');
    if (tg && more) { const r = tg.getBoundingClientRect(); out.toggleVisibleWhileClosed = r.width > 0 && r.height > 0 && !more.open;
      tg.checked = true; tg.dispatchEvent(new Event('change')); await sl(800); out.activeAfterCheck = A.speedZones.active();
      tg.checked = false; tg.dispatchEvent(new Event('change')); await sl(800); out.activeAfterUncheck = A.speedZones.active();
      more.open = true; await sl(300); const leg = more.querySelectorAll('.sz-leg').length; out.legendRows = leg; out.zones = (A._speedZones && A._speedZones.zones.length) || 0; more.open = false; }
    if (A.hideRoadStandards) A.hideRoadStandards('witness');
    await A.showRoadReport(); for (let i = 0; i < 40 && !document.querySelector('#road-report-panel details'); i++) await sl(500); await sl(500);
    out.report = stat('road-report-panel');
    if (A.hideRoadReport) A.hideRoadReport('witness');
    A.showEarthworksPanel(); const cb = document.querySelector('#ew-panel #ew-cutfill-cb'); if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change')); for (let i = 0; i < 240 && !document.querySelector('#ew-panel .ew-band'); i++) await sl(500); await sl(500); }
    out.earth = stat('ew-panel'); out.earthBands = document.querySelectorAll('#ew-panel .ew-band').length;
    A.showRoadworksPanel(); out.road = stat('rw-panel');
    return out; });
  log('§PANELS_COLLAPSED ' + JSON.stringify(R));
  const vac = !R.earth || !R.earth.groups || !R.earthBands || !R.road || !R.road.groups || !R.standards || !R.standards.groups || !R.report || !R.report.groups || !('toggleVisibleWhileClosed' in R);
  if (vac) { log('§PANELS_COLLAPSED verdict=INCONCLUSIVE (a panel/section had no groups or never mounted — VACUOUS)'); return fin(2); }
  const c1 = R.standards.open.length === 0 && R.report.open.length === 0 && R.earth.open.length === 0 && R.road.open.length === 0, c2 = R.toggleVisibleWhileClosed && R.activeAfterCheck === true && R.activeAfterUncheck === false, c3 = R.legendRows === R.zones && R.zones > 0;
  log('§PANELS_COLLAPSED allClosed=' + c1 + ' (standards open=' + JSON.stringify(R.standards.open) + ' report open=' + JSON.stringify(R.report.open) + ' earth groups=' + R.earth.groups + ' open=' + JSON.stringify(R.earth.open) + ' bands=' + R.earthBands + ' roadworks groups=' + R.road.groups + ' open=' + JSON.stringify(R.road.open) + ') toggleWorks=' + c2 + ' legendIntact=' + c3 + ' (' + R.legendRows + '/' + R.zones + ')');
  const pass = c1 && c2 && c3; log('§PANELS_COLLAPSED verdict=' + (pass ? 'PASS' : 'FAIL')); fin(pass ? 0 : 1); })();
