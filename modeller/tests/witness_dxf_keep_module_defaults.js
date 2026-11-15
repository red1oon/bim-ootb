#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-KEEP (bim-ootb prompts/DXF2BIM_FOUNDATION_LANE.md §D103). READ THE LOG: the §KEEP lines carry the evidence, the exit code does not.
// THE ISSUE IT PROVES OR DISPROVES: "Keep this value" / "Accept all" did not clear the yellow rows that the READING MODULES add with DEF.assume (panel.thickness_inherited, section.bar.size, section.plate.thickness):
//   they were re-listed as open defaults on every re-feed (UAT dry run 2026-11-14: 14 -> 3 and never 0).
//   K0 non-vacuous: the set opens with open default rows, among them the module-level ones.
//   K1 Keep on ONE module-level row clears that row and only that row.
//   K2 Accept all leaves 0 open default rows, every key kept, the verdict unchanged.
//   K3 keeping changes nothing the model is built from: Convert after Accept all gives the same element count as Convert with nothing accepted.
//   KEEP_BREAK=1 sets window.__dmNoKeepModule (the old behaviour): K1 and K2 must FAIL.
// Set: SHED_MARKED_DIR = the nine marked Shed sheets (private: SKIP without). Usage: SHED_MARKED_DIR=<dir> NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_keep_module_defaults.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..'), DIR = process.env.SHED_MARKED_DIR || '', BREAK = process.env.KEEP_BREAK === '1', MODULE_KEYS = ['panel.thickness_inherited', 'section.bar.size', 'section.plate.thickness'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
let judged = 0, fails = 0; const say = s => console.log(s), ck = (id, c, i) => { judged++; if (!c) fails++; say('§KEEP ' + id + ' ' + (c ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(i).slice(0, 400)); };
(async () => {
  if (!DIR || !fs.existsSync(DIR)) { say('§KEEP SKIP no SHED_MARKED_DIR (private set)'); process.exit(0); }
  const files = fs.readdirSync(DIR).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(DIR, f));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); }); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const LAUNCH = () => puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let br = await LAUNCH();
  async function load() { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.on('pageerror', e => say('§KEEP PAGEERR ' + String(e).slice(0, 160)));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    if (BREAK) await pg.evaluate(() => { window.__dmNoKeepModule = true; });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 120000 }); await sleep(2000); return pg; }
  const open = pg => pg.evaluate(() => (window.DxfImportUI.state.defaults || []).filter(r => r.kind === 'default').map(r => r.key));
  const verdict = pg => pg.evaluate(() => window.DxfMetaEditor.state.verdict.verdict);
  const stat = pg => pg.evaluate(() => { const e = document.querySelector('#dxf-status,.dxf-status,#ip-status'); return e ? e.innerText : ''; });
  const convert = async pg => { await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await pg.waitForFunction(() => { const b = document.getElementById('dxf-convert'); return b && !b.disabled; }, { timeout: 60000 }); await sleep(3000); await pg.evaluate(() => document.getElementById('dxf-convert').click());
    for (let i = 0; i < 180; i++) { const m = (await stat(pg)).match(/Converted: (\d+) elements/); if (m) return Number(m[1]); await sleep(500); } return null; };
  // run 1: K0, K1 (Keep one module-level row), then K2 (Accept all)
  let pg = await load(); const v0 = await verdict(pg), o0 = await open(pg);
  ck('K0 non-vacuous: open default rows incl. the module-level ones', o0.length > 0 && MODULE_KEYS.every(k => o0.includes(k)), { open: o0.length, hasModuleKeys: MODULE_KEYS.filter(k => o0.includes(k)) });
  await pg.evaluate(() => { const r = Array.from(document.querySelectorAll('#dm-yellows .dm-pr[data-tier]')).find(x => /^panel\.thickness_inherited/.test(x.innerText.trim())); r.querySelector('[data-act="defkeep"]').click(); }); await sleep(3500);
  const o1 = await open(pg); ck('K1 Keep on panel.thickness_inherited clears that row and only it', !o1.includes('panel.thickness_inherited') && o1.length === o0.length - 1, { before: o0.length, after: o1.length, stillOpen: MODULE_KEYS.filter(k => o1.includes(k)) });
  await pg.evaluate(() => { const b = document.querySelector('#dm-yellows [data-act="acceptall"]'); if (b) b.click(); }); await sleep(3500);
  const o2 = await open(pg), v2 = await verdict(pg); ck('K2 Accept all leaves 0 open default rows, the verdict is unchanged', o2.length === 0 && v2 === v0, { open: o2, verdict: v0 + ' -> ' + v2 });
  const nKept = BREAK ? null : await convert(pg); await pg.close(); await br.close(); br = await LAUNCH();   // a fresh browser for the run that touches nothing (a second page in the same one never reported its Convert)
  // run 2: nothing accepted -> Convert
  if (!BREAK) { pg = await load(); const nOpen = await convert(pg); ck('K3 Convert after Accept all == Convert with nothing accepted', nKept === nOpen && nKept > 0, { accepted: nKept, untouched: nOpen }); await pg.close(); }
  await br.close(); srv.close();
  const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE'; say('§KEEP_VERDICT ' + v + ' judged=' + judged + ' fails=' + fails + (BREAK ? ' (BREAK: K1+K2 must FAIL)' : '')); process.exit(fails ? 1 : 0);
})().catch(e => { say('§KEEP STOPPED ' + (e.stack || e).toString().slice(0, 400)); process.exit(1); });
