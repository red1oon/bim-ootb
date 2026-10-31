#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-EDIT-RATES-LINK (prompts/DXF2BIM_FOUNDATION_LANE.md §D92). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the bay's cost was read out with no way to see or change the rates behind it; the rate editor lives in the Viewer (Settings ▸ Edit Project JSON ▸
// 5D Rate Pack) and whether an edit made there reaches the Modeller's cost had never been shown. Fresh throw-away browser profile, this repo served locally, software GL:
//   R1 viewer.html?rates=pwd2024_bd&edit=rates opens the 5D Rate Pack editor of pwd2024_bd (the Modeller's "Edit rates" link)
//   R2 the IfcColumn rate edited there (saved as json_rates_pwd2024_bd) is the rate the Modeller's bay is priced with (?rates=pwd2024_bd): the column line's rate = the edited rate,
//      its amount = Σ round(rate x qty) of the copied columns; the panel names the pack and its currency
//   R3 falsifier / control: a fresh profile (no saved copy), the same bay prices the columns at the shipped rate (pwd2024_bd.json materials.IfcColumn)
//   R0 0 page errors
// Input: the 9 CLI-marked shed sheets (SHED_MARKED_DIR, default ~/Videos/dxf2bim_film_work/why/cli/marked). Missing input -> MISSING, exit 2.
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_edit_rates_link.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), BigDecimal = require(path.join(ROOT, 'erp', 'bigdecimal.js'));
const MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked'), PACK = 'pwd2024_bd', NEW = 17345;
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream', '.gz': 'application/gzip' };
(async () => {
  const files = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)) : [];
  if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets (' + MARKED + ', found ' + files.length + ')'); process.exit(2); }
  const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', PACK + '.json'), 'utf8')).materials.IfcColumn.rate;
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z)); const base = 'http://127.0.0.1:' + srv.address().port;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'editrates-'));
  const br = await puppeteer.launch({ headless: 'new', userDataDir: prof, protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [], watch = (pg, re) => { pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); }); pg.on('console', m => { const t = m.text(); if (re.test(t)) console.log('  ' + t.slice(0, 240)); }); };
  // the Modeller: open the marked shed, state Farming Shed, Convert, Add a bay at the end; return the bay's column line + the panel's rates text
  const bay = async (ctx) => {
    const pg = await (ctx || br).newPage(); await pg.setViewport({ width: 1440, height: 810 }); watch(pg, /^§DXF-BAY (detail|committed|plan)|§RATE_OVERRIDE|§EDIT_RATES/);
    await pg.goto(base + '/modeller/modeller.html?rates=' + PACK, { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai', { timeout: 120000 });
    await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfMetaEditor && !window.DxfMetaEditor.state.busy', { timeout: 300000 }); await sleep(800);
    await pg.evaluate(async () => { const sh = document.querySelector('#dm-panel [data-act="sec"][data-sec="edefaults"]'); if (!window.DxfMetaEditor.state.sec.edefaults) { sh.click(); await new Promise(r => setTimeout(r, 400)); }
      const row = document.querySelector('#dm-panel [data-edef="building.type"]'), sel = row.querySelector('select'); sel.value = 'Farming Shed'; sel.dispatchEvent(new Event('change', { bubbles: true })); row.querySelector('[data-act="edefset"]').click(); });
    await sleep(1500); await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok && !window.DxfMetaEditor.state.busy', { timeout: 300000 }); await sleep(800);
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 300000 }); await sleep(2500);
    await pg.evaluate(() => document.getElementById('dxf-bay-max').scrollIntoView({ block: 'center' })); await pg.click('#dxf-bay-max');
    await pg.waitForFunction(() => window.DxfImportUI.state.lastBay && window.DxfImportUI.state.lastBay.cost, { timeout: 180000 }); await sleep(1500);
    const R = await pg.evaluate(() => { const L = window.DxfImportUI.state.lastBay, d = document.getElementById('dxf-bay-detail'), ops = window.Bonsai.oplog._geomOps();
      const cols = L.plan.copied.filter(c => c.cls === 'IfcColumn').map(c => { const o = ops.find(q => q.id === c.from), b = o.parameters.bbox; return Math.max(b[1] - b[0], b[3] - b[2], b[5] - b[4]); });
      return { line: (L.cost.lines || []).find(l => l.kind === 'added' && l.cls === 'IfcColumn') || null, cols, pack: window.RATE_TEMPLATE_NAME, cur: window._TRL && window._TRL.cur, rates: d ? ((/Rates: [^\n]*/.exec(d.innerText) || [])[0] || '') : '' }; });
    await pg.close(); return R;
  };
  const amountOf = (rate, qtys) => qtys.reduce((a, q) => a.add(BigDecimal.of(String(rate)).multiply(BigDecimal.of(q.toFixed(6))).setScale(0, BigDecimal.RoundingMode.HALF_UP)), BigDecimal.of('0')).toString();
  try {
    // R1 the deep link
    const pv = await br.newPage(); await pv.setViewport({ width: 1440, height: 900 }); const vlog = []; watch(pv, /§EDIT_RATES_LINK|§RATE_OVERRIDE|§PROPSHEET_SAVE/); pv.on('console', m => vlog.push(m.text()));
    await pv.goto(base + '/viewer/viewer.html?rates=' + PACK + '&edit=rates', { waitUntil: 'load', timeout: 180000 });
    await pv.waitForFunction(() => !!document.getElementById('json-editor-rates_pwd2024_bd'), { timeout: 120000 }).catch(() => {});
    const r1 = await pv.evaluate(() => { const e = document.getElementById('json-editor-rates_pwd2024_bd'); return { open: !!e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0, pack: window.RATE_TEMPLATE_NAME, row: !!document.querySelector('[data-row-id="materials/IfcColumn"]') }; });
    ok('R1 viewer.html?rates=' + PACK + '&edit=rates opens that pack\'s rate editor', r1.open && r1.pack === PACK && r1.row && vlog.some(t => /§EDIT_RATES_LINK opened pack=pwd2024_bd/.test(t)), JSON.stringify(r1) + ' log=' + (vlog.find(t => /§EDIT_RATES_LINK/.test(t)) || 'none'));
    // edit the IfcColumn rate as a person does in that editor (the row's JSON text field + its change event: W-JSON-4D5D-LIVE's own method)
    const t = await pv.evaluate(n => { const row = document.querySelector('[data-row-id="materials/IfcColumn"]'), inp = row && row.querySelector('input[type="text"]'); if (!inp) return 'no field';
      const v = JSON.parse(inp.value); v.rate = n; inp.value = JSON.stringify(v); inp.dispatchEvent(new Event('change', { bubbles: true })); return inp.value; }, NEW);
    await sleep(800); const saved = await pv.evaluate(p => { try { return JSON.parse(localStorage.getItem('json_rates_' + p)).materials.IfcColumn.rate; } catch (e) { return null; } }, PACK);
    console.log('§EDIT-RATES edited field=' + String(t).slice(0, 80) + ' saved=' + saved); await pv.close();
    // R2 the Modeller's bay with the edited copy
    const A = await bay(), wantA = A.line ? amountOf(NEW, A.cols) : 'none';
    ok('R2 the edited column rate prices the Modeller\'s bay: rate ' + NEW + ', amount = Σ round(rate x qty), the panel names the pack', saved === NEW && A.line && A.line.rate === NEW && A.line.amount === wantA && A.pack === PACK && /PWD Bangladesh SoR 2022 \(pwd2024_bd\)/.test(A.rates),
      'line ' + JSON.stringify(A.line) + ' want amount ' + wantA + ' (qty ' + A.cols.map(q => q.toFixed(3)).join('+') + ') | pack ' + A.pack + ' ' + A.cur + ' | "' + A.rates + '"');
    // R3 the copy removed: the shipped rate
    // a FRESH browser context: no saved copy (the control), and no Modeller model saved by R2's page (a second page in R2's profile restored R2's model and converted on top of it:
    // measured 2026-10-28, 4 columns copied instead of 2)
    const fresh = await br.createBrowserContext(); const B = await bay(fresh); await fresh.close(); const wantB = B.line ? amountOf(shipped, B.cols) : 'none';
    ok('R3 control: a profile without the saved copy prices the same bay at the shipped rate ' + shipped + ', the same columns as R2', B.line && B.line.rate === shipped && B.line.amount === wantB && A.line && B.line.n === A.line.n, 'line ' + JSON.stringify(B.line) + ' want amount ' + wantB);
    ok('R0 no page errors', errs.length === 0, 'errors=' + errs.length + (errs[0] ? ' ' + errs[0] : ''));
  } catch (e) { ok('R run', false, 'threw ' + String(e && e.stack || e).slice(0, 300)); }
  await br.close(); srv.close();
  console.log('§W-EDIT-RATES-LINK ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
})();
