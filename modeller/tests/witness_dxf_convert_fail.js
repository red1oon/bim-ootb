#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-CONVERT-FAIL (prompts/DXF2BIM_FOUNDATION_LANE.md §D83, architect review R7-9). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: an exception inside Convert reached the console only (the panel kept the gate's line) and a throw after the commit left the bodies in the op-log unsaid.
//   CF1 a throw BEFORE the commit: the status says `Convert failed: W-PROBE-1 (nothing was built)`, the op-log length is unchanged, the log line says stage=before-commit undone=0.
//   CF2 a throw AFTER the commit: the status says `Convert failed: W-PROBE-2 (undone)`, the op-log length is back to before, the log line says stage=after-commit undone=1.
//   CF3 the stubs removed, the same click converts (state.last.nInserts > 0, status `Converted: ...`): the guard does not stand in the way of a good run.
//   CF0 no page errors.
// Falsifier: on the code before §D83, CF1 and CF2 fail (the status is unchanged, CF2's op-log has grown).
// Set: the CLI-marked shed (SHED_MARKED_DIR, default ~/Videos/dxf2bim_film_work/why/cli/marked; local material, absent -> MISSING input). It qualifies on any machine: a structure set has no
// library fills (the marked Duplex is refused here by 12 GAP:lod400_not_in_subset windows without the local library subset, measured 2026-10-26).
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_convert_fail.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
(async () => {
  const files = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)) : [];
  if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets in ' + MARKED + ' (SHED_MARKED_DIR), found ' + files.length); process.exit(2); }
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [], clog = [];
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 });
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/^§DXF-CONVERT/.test(t)) { clog.push(t); if (/failed|counts=/.test(t)) console.log('  ' + t.slice(0, 220)); } });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok && document.getElementById("dxf-convert") && !document.getElementById("dxf-convert").disabled', { timeout: 240000 }).catch(async () => { const g = await pg.evaluate(() => { const st = window.DxfImportUI.state, g = st.gate, b = document.getElementById('dxf-convert');
      return { sheets: (st.sheets || []).length, gate: !!g, ok: g && g.ok, refused: g && g.refused, blocking: g && g.verdict && (g.verdict.blocking || []).slice(0, 6).map(x => x.code + ' ' + (x.sheet || '')), btn: !!b, disabled: b && b.disabled, status: (document.getElementById('dxf-status') || {}).textContent }; });
      throw new Error('the gate did not qualify: ' + JSON.stringify(g).slice(0, 600)); }); await sleep(800);
    const snap = () => pg.evaluate(() => ({ n: window.Bonsai.oplog.length, status: (document.getElementById('dxf-status') || {}).textContent || '' }));
    const click = async (want) => { const c0 = clog.length; await pg.click('#dxf-convert');
      await pg.waitForFunction(w => ((document.getElementById('dxf-status') || {}).textContent || '').indexOf(w) === 0, { timeout: 180000 }, want).catch(() => {}); await sleep(600); return clog.slice(c0).filter(t => / failed stage=/.test(t)).pop() || ''; };
    console.log('  gate qualifies; status before: ' + (await snap()).status.slice(0, 120));
    // CF1 before the commit
    const a0 = await snap();
    await pg.evaluate(() => { const I = window.Dxf2BimImport; window.__toOps = I.toOps; I.toOps = function () { throw new Error('W-PROBE-1'); }; });
    const l1 = await click('Convert failed'), a1 = await snap();
    ok('CF1 a throw before the commit is said in the panel, nothing is built', a1.status === 'Convert failed: W-PROBE-1 (nothing was built)' && a1.n === a0.n && /stage=before-commit undone=0 /.test(l1), 'status="' + a1.status + '" oplog ' + a0.n + '->' + a1.n + ' log="' + l1.slice(0, 160) + '"');
    await pg.evaluate(() => { window.Dxf2BimImport.toOps = window.__toOps; });
    // CF2 after the commit
    const b0 = await snap();
    await pg.evaluate(() => { window.__frameSel = window.Bonsai.frameSelection; window.Bonsai.frameSelection = function () { throw new Error('W-PROBE-2'); }; });
    const l2 = await click('Convert failed'), b1 = await snap();
    ok('CF2 a throw after the commit is said in the panel and the gesture is undone', b1.status === 'Convert failed: W-PROBE-2 (undone)' && b1.n === b0.n && /stage=after-commit undone=1 /.test(l2), 'status="' + b1.status + '" oplog ' + b0.n + '->' + b1.n + ' log="' + l2.slice(0, 160) + '"');
    await pg.evaluate(() => { window.Bonsai.frameSelection = window.__frameSel; });
    // CF3 the good run
    const c0 = await snap(); await click('Converted'); const c1 = await snap(), last = await pg.evaluate(() => window.DxfImportUI.state.last ? window.DxfImportUI.state.last.nInserts : 0);
    ok('CF3 with the stubs removed the same click converts', last > 0 && c1.n > c0.n && c1.status.indexOf('Converted: ') === 0, 'inserts=' + last + ' oplog ' + c0.n + '->' + c1.n + ' status="' + c1.status.slice(0, 100) + '"');
    ok('CF0 no page errors', errs.length === 0, 'errors=' + errs.length);
  } catch (e) { ok('CF run', false, 'threw ' + (e && e.stack || e).toString().slice(0, 300)); }
  await br.close(); srv.close();
  console.log('§W-CONVERT-FAIL ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
})();
