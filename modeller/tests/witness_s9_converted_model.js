#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-S9-CONVERTED (spec prompts/CAPEX_DASHBOARD.md §5.80). READ THE LOG: verdict = §S9_CONVERTED_VERDICT; the exit code alone is not evidence.
// ISSUE it proves/disproves: "on a model converted from 2D drawings, ERP ▸ Project Order opens an EMPTY panel and throws a page error" (found by the UAT dry run, §5.78 step B4.1: a converted model has no
// opened building database, proj_order_ui.js priced from null). After the fix the panel must say why and name the route that works (Export ▸ Viewer database, then the Viewer's › ERP).
//   N1 the Shed set converts and a part can be picked; the button "ERP ▸ Project Order" shows
//   N2 pressing it: the panel holds the explanation (#s9-nodb, naming Export ▸ Viewer database and › ERP), §S9-NO-BUILDING-DB is logged, and NO Generate button is offered (nothing can be priced)
//   N3 no page error from the press
// S9_CONV_BREAK=1 expects a Generate button on the converted model: N2 must FAIL.
// Local material: the CLI-marked Shed set (SHED_MARKED_DIR); absent -> INCONCLUSIVE, nothing judged. Throw-away headless profile, software GL.
// Usage: SHED_MARKED_DIR=<dir of the 9 marked sheets> node modeller/tests/witness_s9_converted_model.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos/dxf2bim_film_work/why/cli/marked'), BREAK = process.env.S9_CONV_BREAK === '1', log = console.log;
let judged = 0, fails = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §S9_CONVERTED ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
(async () => {
  const files = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)) : [];
  if (files.length !== 9) { log('§S9_CONVERTED_VERDICT INCONCLUSIVE the marked Shed set is absent (' + MARKED + '): nothing judged'); process.exit(0); }
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 's9conv-')), br = await puppeteer.launch({ headless: 'new', userDataDir: prof, protocolTimeout: 600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 }); const errs = [], lines = []; pg.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 160))); pg.on('console', m => { const t = m.text(); if (/§S9/.test(t)) lines.push(t.slice(0, 200)); });
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 }); await sleep(1200);
  await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
  await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
  const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
  await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length===9 && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 300000 }); await sleep(2500);
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 300000 }); await sleep(2500);
  const inserts = await pg.evaluate(() => window.DxfImportUI.state.last.nInserts);
  await pg.click('#dxf-fold').catch(() => {}); if (await pg.$('#dm-close')) await pg.click('#dm-close').catch(() => {}); if (await pg.$('#b-fit')) { await pg.click('#b-fit'); await sleep(1800); }
  const sel = () => pg.evaluate(() => { const B = window.Bonsai, b = document.getElementById('s9-erp-btn'); return { sel: B && B._selSet ? B._selSet.size : 0, btn: b ? b.style.display : 'none', dwBuf: !!window.__dwBuf }; });
  const vp = pg.viewport(); let s = { sel: 0 };
  for (const [dx, dy] of [[0, 0], [60, 20], [-80, 30], [120, -20], [0, 60], [-150, 0], [200, 40]]) { await pg.mouse.click(vp.width / 2 + dx, vp.height / 2 + dy); await sleep(700); s = await sel(); if (s.sel) break; }
  if (!s.sel) { log('§S9_CONVERTED_VERDICT INCONCLUSIVE no part could be picked with the pointer (inserts=' + inserts + '): nothing judged'); await br.close(); srv.close(); process.exit(1); }
  ck('N1 the Shed converts (' + inserts + ' parts), a picked part shows the ERP ▸ Project Order button; the model has no opened building database', s.btn === 'block' && !s.dwBuf, s);
  const e0 = errs.length; await pg.click('#s9-erp-btn'); let p = null; for (let i = 0; i < 40; i++) { await sleep(1000); p = await pg.evaluate(() => { const x = document.getElementById('s9-panel'), n = document.getElementById('s9-nodb'); return { shown: x && x.style.display === 'block', text: x ? x.innerText.replace(/\s+/g, ' ').slice(0, 300) : '', nodb: !!n, gen: !!document.getElementById('s9-generate') }; }); if (p.nodb || p.gen || errs.length > e0) break; }
  if (BREAK) ck('N2 (BREAK: a Generate button is expected on the converted model)', p.gen, p);
  else ck('N2 the panel says why and names the route that works; no Generate button; §S9-NO-BUILDING-DB logged', p.shown && p.nodb && !p.gen && /Export ▸ Viewer database/.test(p.text) && /› ERP/.test(p.text) && lines.some(t => /§S9-NO-BUILDING-DB/.test(t)), { text: p.text.slice(0, 160), log: lines.filter(t => /NO-BUILDING/.test(t)) });
  ck('N3 no page error from the press', errs.length === e0, errs.slice(e0, e0 + 2));
  await br.close(); srv.close(); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  log('§S9_CONVERTED_VERDICT ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (BREAK)' : '')); process.exit(fails || !judged ? 1 : 0);
})().catch(e => { log('§S9_CONVERTED harness ' + (e && e.stack || e)); process.exit(1); });
