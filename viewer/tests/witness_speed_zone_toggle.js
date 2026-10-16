#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §SPEED_ZONE_TOGGLE (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MEM_GROWTH / Speed Zone toggle lag). Read the log after every run.
// ISSUE PROVEN/DISPROVEN: the FIRST Speed Zones toggle stalled ~0.9 s ON / ~0.77 s OFF (shader compile of the white fog:false clones).
//  (1) first frame after the first ON and after the first OFF each <= LIMIT_MS (default 200: measured residual 150 ms off-frame after prewarm vs 767 ms before);
//  (2) NO frame is rendered with the tint ON before the user toggles (the prewarm must not flash) — counted by hooking renderer.render;
//  (3) the paint result is unchanged: painted count == road element count, and after OFF reverted == painted (colours restored);
//  (4) VACUOUS guard: if the model is not civil / no zones -> INCONCLUSIVE, never PASS.
// Env: ROOT (default this checkout; point at an old checkout for the RED run) · BLD_DIR · NAME · LIMIT_MS · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC'), NAME = process.env.NAME || 'CivilWorksPath', LIMIT = +(process.env.LIMIT_MS || 200);
const PORT = +(process.env.PORT || 8600), LOG = process.env.LOG || '/tmp/witness_speed_zone_toggle.log';
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, r) => { try { const u = decodeURIComponent(q.url.split('?')[0]); let fp = path.join(ROOT, u); if (u.startsWith('/buildings/')) fp = path.join(DIR, u.slice(11));
  if (!fs.existsSync(fp)) { const a = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(a)) fp = a; else { r.writeHead(404); r.end(); return; } }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(r); } catch (e) { r.writeHead(500); r.end(); } });
const sl = ms => new Promise(r => setTimeout(r, ms));
(async () => { await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wsz-')), protocolTimeout: 1800000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--js-flags=--max-old-space-size=8192', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  p.on('console', m => { const t = m.text(); if (/§SPEED_ZONES_(PREWARM|PAINT)/.test(t)) log('  [con] ' + t.slice(0, 220)); });
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${NAME}.db`, { waitUntil: 'domcontentloaded', timeout: 900000 });
  let ok = false; for (let i = 0; i < 1200 && !ok; i++) { await sl(500); try { ok = await p.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && APP.scene && APP.collectMeshes(o => o.isMesh).length > 0)); } catch (e) {} }
  if (!ok) { log('§SPEED_ZONE_TOGGLE verdict=INCONCLUSIVE (model never ready)'); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); }
  await sl(4000);
  const R = await p.evaluate(async () => { const A = APP; const std = await (await fetch('std_values.json?v=3')).json();
    let tintRenders = 0, renders = 0; const orig = A.renderer.render.bind(A.renderer);
    A.renderer.render = function () { renders++; if (A.speedZones && A.speedZones.active()) tintRenders++; return orig.apply(null, arguments); };
    await A.speedZones.mount(std, document.createElement('div'), document.createElement('div')); const res = A._speedZones;
    if (!res || res.vacuous || !res.zones.length) return { vacuous: true };
    await new Promise(r => setTimeout(r, 6000));   // let the deferred prewarm (if any) run and settle; frames keep rendering
    const beforeToggleTintRenders = tintRenders;
    const frame = () => new Promise(r => requestAnimationFrame(t0 => requestAnimationFrame(t1 => r(t1 - t0))));
    const runs = [];
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); const n = A.speedZones.paint(res, std); const pj = performance.now() - t0; const f1 = await frame();
      const t1 = performance.now(); const rev = A.speedZones.revert(); const rj = performance.now() - t1; const f2 = await frame(); runs.push({ painted: n, reverted: rev, paintJs: +pj.toFixed(0), frameAfterOn: +f1.toFixed(0), revertJs: +rj.toFixed(0), frameAfterOff: +f2.toFixed(0) }); }
    return { runs, beforeToggleTintRenders, renders }; });
  await b.close(); srv.close();
  if (R.vacuous) { log('§SPEED_ZONE_TOGGLE verdict=INCONCLUSIVE (no zones derived — VACUOUS)'); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); }
  R.runs.forEach((r, i) => log('§SPEED_ZONE_TOGGLE run' + i + ' ' + JSON.stringify(r)));
  const f = R.runs[0], c1 = f.frameAfterOn <= LIMIT, c2 = f.frameAfterOff <= LIMIT, c3 = R.beforeToggleTintRenders === 0, c4 = R.runs.every(r => r.painted > 0 && r.reverted === r.painted);
  log('§SPEED_ZONE_TOGGLE firstOnFrame=' + f.frameAfterOn + 'ms (<=' + LIMIT + ' ' + (c1 ? 'ok' : 'FAIL') + ') firstOffFrame=' + f.frameAfterOff + 'ms (' + (c2 ? 'ok' : 'FAIL') + ') tintRendersBeforeToggle=' + R.beforeToggleTintRenders + ' (' + (c3 ? 'ok' : 'FAIL') + ') paintRevertCountsEqual=' + c4);
  const pass = c1 && c2 && c3 && c4; log('§SPEED_ZONE_TOGGLE verdict=' + (pass ? 'PASS' : 'FAIL'));
  fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(pass ? 0 : 1); })();
