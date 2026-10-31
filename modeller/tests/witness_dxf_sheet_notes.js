#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SHEET-NOTES: prompts/DXF2BIM_ARCHITECT_REVIEW.md §D101 D4. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the shed's DETAILS sheet is read by the structure gate for its general notes (casting ratios, schedules: §L29) and never refused, yet both panels
 * showed it red ("NO ROLE", "markings name no role (view=undefined, missing VIEW)") and the Sheets section counted it in "1 need input" — a qualifying set that looked broken on film.
 *   N1 the real Modeller headless, the CLI-marked shed opened: the gate lists DETAILS as a notes sheet; the 2D panel's chip for it reads NOTES (not .none), its line is the neutral
 *      "general notes read: n" (n > 0), no red why-line; the meta editor's chip reads NOTES and the Sheets section says "complete" (0 need input).
 *   N2 FALSIFIER: the same page with the gate's notes list emptied (sabotage of the input) -> the chip is NO ROLE again and the Sheets section counts 1 need input.
 *   N0 no page errors.
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> MISSING input (exit 2).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
const files = fs.existsSync(MK) ? fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f)) : [];
if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets in ' + MK + ' (SHED_MARKED), found ' + files.length); process.exit(2); }
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
(async () => {
  const puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
  const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(buf); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), errs = [];
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 }); pg.on('pageerror', e => { errs.push(String(e).slice(0, 160)); console.log('§PAGEERR ' + String(e).slice(0, 160)); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI', { timeout: 120000 }); await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict && window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.R', { timeout: 240000 });
    await new Promise(r => setTimeout(r, 1500));
    const read = () => pg.evaluate(() => { const U = window.DxfImportUI.state, n = U.gate.R.bodies && U.gate.R.bodies.notes, nm = (U.sheets || []).map(s => s.name).find(x => /DETAILS/i.test(x)) || null;
      const row = nm && document.querySelector('#dxf-panel .dxf-row[data-sheet="' + nm.replace(/"/g, '\\"') + '"]'), chip = row && row.querySelector('.dxf-role'), why = row && row.nextElementSibling;
      const E = window.DxfMetaEditor; E.show(); const si = E.state.sheets.findIndex(s => s.name === nm), card = document.querySelector('#dm-panel [data-card="' + si + '"] .dm-role'), head = document.querySelector('#dm-panel .dm-sh[data-sec="sheets"] .cnt');
      return { gateOk: U.gate.ok, notesSheets: n ? n.sheets : null, nm, chip: chip && chip.textContent, chipNone: !!(chip && chip.classList.contains('none')), why: why && why.classList.contains('dxf-why') ? why.textContent : null,
        whyNeutral: !!(why && why.getAttribute('data-notes-sheet')), meChip: card && card.textContent, meNeed: !!(card && card.classList.contains('need')), sheetsHead: head && head.textContent }; });
    const a = await read(); console.log('§SHEET-NOTES ' + JSON.stringify(a));
    ok('N1 DETAILS is a notes sheet of a qualifying set: 2D chip NOTES, neutral "general notes read: n>0", meta chip NOTES, Sheets section complete', a.gateOk && (a.notesSheets || []).indexOf(a.nm) >= 0 && a.chip === 'NOTES' && !a.chipNone &&
      a.whyNeutral && /general notes read: [1-9]/.test(a.why || '') && a.meChip === 'NOTES' && !a.meNeed && a.sheetsHead === 'complete', JSON.stringify(a));
    await pg.evaluate(() => { const U = window.DxfImportUI.state; U.gate.R.bodies.notes = { sheets: [], rows: [], schedules: null }; });
    const b = await pg.evaluate(() => { window.DxfMetaEditor.show(); const E = window.DxfMetaEditor, si = E.state.sheets.findIndex(s => /DETAILS/i.test(s.name)), card = document.querySelector('#dm-panel [data-card="' + si + '"] .dm-role'), head = document.querySelector('#dm-panel .dm-sh[data-sec="sheets"] .cnt');
      return { meChip: card && card.textContent, meNeed: !!(card && card.classList.contains('need')), sheetsHead: head && head.textContent }; });
    ok('N2 FALSIFIER with the gate\'s notes list emptied the sheet is NO ROLE again and counted (' + JSON.stringify(b) + ')', b.meChip === 'NO ROLE' && b.meNeed && /^1 need input/.test(b.sheetsHead || ''), '');
    ok('N0 no page errors', errs.length === 0, 'errors=' + errs.length);
  } catch (e) { ok('N run', false, 'crash ' + String(e && e.stack || e).slice(0, 300)); }
  await br.close(); srv.close();
  console.log(fail ? '§VERDICT FAIL W-SHEET-NOTES judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-SHEET-NOTES judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0);
})();
