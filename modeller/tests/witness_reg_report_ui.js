#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-REG-REPORT-UI: prompts/DXF2BIM_ARCHITECT_REVIEW.md RR.6 (the Modeller's Export ▸ Regulatory Report…). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the report was CLI-only; a page that composes it a second time would drift from the CLI (different engines loaded, a rule
 * "not checkable" only in the browser, a second fact list, another pack). RR.6 makes both run RegReport.fromModel. What could go wrong, one check each:
 *   U1 PARITY       — the page's own assemble() (run here with the same owners, the shed, --complete, pack pwd2024_bd) = the CLI's writeReport, byte for byte once the
 *                     tool line and the model hash (the IFC header carries a timestamp) are masked.
 *   U2 LOAD PATH    — the page's script list, executed in order in a browser-like context (no module, no require), defines every global assemble() reads, and
 *                     EgressSanity finds RoomGraph there (else room rules would read "not checkable" in the browser only).
 *   U3 REFUSE       — no converted bodies -> refused no_bodies, nothing composed.
 *   U4 ONE FACT LIST — the form has exactly one input per RegReport.FACTS key and no fact key is spelled in reg_report_ui.js; an empty box -> "not stated".
 *   U5 MENU + SW    — the Export menu row 'regrep' runs doRegReport, which loads reg_report_ui.js; sw.js precaches reg_report.js + reg_report_ui.js.
 *   U6 FALSIFIER    — soil 150 kPa through the form changes the page (foundations NOT STATED -> PASS/FINDINGS), so U1's equality is not vacuous.
 *   U7 THE PAGE     — the real Modeller (headless, swiftshader): open the marked shed, Complete, Convert, Export ▸ Regulatory Report…, pack pwd2024_bd, Build ->
 *                     the page's report = the CLI's (masked as U1), 0 page errors. BROWSER=0 skips U7 (printed, not judged).
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> INCONCLUSIVE (exit 2).
 * Usage: NODE_PATH=<dir with web-ifc, sql.js> node modeller/tests/witness_reg_report_ui.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..'), M = path.join(ROOT, 'modeller'), V = path.join(ROOT, 'viewer');
const C = require(path.join(M, 'dxf2bim_cli.js')), RG = require(path.join(M, 'reg_report.js')), UI = require(path.join(M, 'reg_report_ui.js'));
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const mask = h => h.replace(/BIMCompiler Modeller DXF2BIM \(sw [^)]*\)/g, 'TOOL').replace(/\b[0-9a-f]{64}\b/g, 'SHA256');
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i >= a.length && a.length === b.length ? 'identical' : 'at ' + i + ': "' + a.slice(i, i + 80) + '" vs "' + b.slice(i, i + 80) + '"'; };
const DATE = '2026-10-31';
function webIfc() { for (const m of ['web-ifc', path.join(os.homedir(), 'bim-compiler/node_modules/web-ifc')]) { try { return require(m); } catch (e) { /* next */ } } throw new Error('needs web-ifc'); }
function sqlJs() { for (const m of ['sql.js', path.join(os.homedir(), 'bim-compiler/node_modules/sql.js')]) { try { return require(m); } catch (e) { /* next */ } } throw new Error('needs sql.js'); }
const quiet = async (fn, keep) => { const orig = console.log; console.log = s => { if (keep && keep.test(String(s))) orig('  ' + String(s).slice(0, 240)); }; try { return await fn(); } finally { console.log = orig; } };
(async () => {
  if (!fs.existsSync(MK)) { console.log('§VERDICT INCONCLUSIVE no marked shed set at ' + MK); process.exit(2); }
  const files = fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f)), out = path.join(os.tmpdir(), 'w_reg_report_ui_' + process.pid);
  const args = C.parseArgs(['--sheets', ...files, '--out', out, '--pack', 'pwd2024_bd', '--complete', '--report']); args.date = DATE;
  const res = await quiet(() => C.run(args)); C.write(res, out); await quiet(() => C.writeIfc(res, out));
  const cli = await quiet(() => C.writeReport(res, out, args), /§REG_REPORT /);
  // the page's deps, resolved the Node way (U2 proves the browser way defines the same names)
  const W = webIfc(), api = new W.IfcAPI(); await api.Init();
  const rj = f => JSON.parse(fs.readFileSync(path.join(V, 'rates', f), 'utf8'));
  const D = { WebIFC: W, ifcApi: api, SQL: await sqlJs()(), Core: require(path.join(M, 'dxf2bim/ifc_extract_core.js')), Dxf2Ifc: require(path.join(M, 'dxf2ifc.js')), RegReport: RG,
    LoadSummary: require(path.join(M, 'load_summary.js')), Dxf2Bill: require(path.join(M, 'dxf2bill.js')), SS: require(path.join(V, 'structural_sanity.js')), ES: require(path.join(V, 'egress_sanity.js')),
    RRp: require(path.join(V, 'rule_report.js')), SR: rj('structural_rules.json'), ER: rj('egress_rules.json'), packJ: rj('pwd2024_bd.json'), ref: JSON.parse(fs.readFileSync(path.join(M, 'synthetic_ref.json'), 'utf8')),
    sha256: b => require('crypto').createHash('sha256').update(b).digest('hex') };
  const page = (facts) => quiet(() => UI.assemble(D, { gate: res.out.gate, sheets: res.read, facts, packName: 'pwd2024_bd', date: DATE, tool: 'BIMCompiler Modeller DXF2BIM (sw x, Modeller)', log: m => console.log(m) }), /§REG_REPORT/);
  // U1
  const P = await page({}), a = mask(cli.html), b = mask(P.html);
  ok('U1 PARITY the page\'s assemble() = the CLI\'s writeReport (' + cli.html.length + ' bytes, tool + hash masked)', a === b, firstDiff(a, b) + ' | verdicts ' + JSON.stringify(P.verdicts));
  // U2
  const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Date, Object, Array, Number, String, Map, Set, Float64Array, Uint8Array, Int32Array, Float32Array, Uint32Array, Int8Array, Uint16Array, Int16Array, Uint8ClampedArray, isFinite, isNaN, parseFloat, parseInt, Infinity, NaN, Promise, Error, RegExp, Symbol, WeakMap };
  sb.self = sb; sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  const loadErr = []; UI.SCRIPTS.forEach(s => { try { vm.runInContext(fs.readFileSync(path.join(M, s), 'utf8'), sb, { filename: s }); } catch (e) { loadErr.push(s + ': ' + e.message); } });
  const miss = UI.GLOBALS.filter(k => !sb[k]);
  ok('U2 LOAD PATH the page\'s ' + UI.SCRIPTS.length + ' scripts, in order, define all ' + UI.GLOBALS.length + ' globals; RoomGraph present for EgressSanity', !loadErr.length && !miss.length,
    'errors=' + JSON.stringify(loadErr).slice(0, 200) + ' missing=' + JSON.stringify(miss));
  // U3
  const lines3 = []; const r3 = await UI.assemble(D, { gate: { R: { els: [] } }, sheets: [], log: m => lines3.push(m) });
  ok('U3 REFUSE no bodies -> refused no_bodies, nothing composed', r3 && r3.refused === 'no_bodies' && !r3.html && lines3.includes('§REG_REPORT refused no_bodies'), JSON.stringify(r3) + ' ' + lines3.join('|'));
  // U4
  const fh = UI.formHtml(RG.FACTS, {}, ['pwd2024_bd'], 'pwd2024_bd'), keys = [...fh.matchAll(/data-fact="([^"]+)"/g)].map(m => m[1]), src = fs.readFileSync(path.join(M, 'reg_report_ui.js'), 'utf8');
  const spelled = RG.FACTS.map(f => f[0]).filter(k => new RegExp('[\'"]' + k + '[\'"]').test(src)), ff = UI.factsFrom({ soil_kPa: '  ', district: 'Dhaka' });
  ok('U4 ONE FACT LIST one input per RegReport.FACTS key (' + keys.length + '), none spelled in reg_report_ui.js, an empty box is left out', JSON.stringify(keys) === JSON.stringify(RG.FACTS.map(f => f[0])) && !spelled.length && JSON.stringify(ff) === '{"district":"Dhaka"}',
    'spelled=' + JSON.stringify(spelled) + ' factsFrom=' + JSON.stringify(ff));
  // U5
  const html = fs.readFileSync(path.join(M, 'modeller.html'), 'utf8'), sw = fs.readFileSync(path.join(M, 'sw.js'), 'utf8');
  const row = /\{ key: 'regrep',[^\n]*run: doRegReport \}/.test(html), fn = /async function doRegReport\(\)[\s\S]{0,400}reg_report_ui\.js/.test(html), pre = /'reg_report\.js'/.test(sw) && /'reg_report_ui\.js'/.test(sw);
  ok('U5 MENU + SW the Export row runs doRegReport, which loads reg_report_ui.js; sw.js precaches both files', row && fn && pre, 'row=' + row + ' handler=' + fn + ' precache=' + pre);
  // U6
  const S = await page({ soil_kPa: '150' });
  ok('U6 FALSIFIER soil 150 kPa through the form: foundations ' + P.verdicts.foundations + ' -> ' + S.verdicts.foundations + ', the page changes', P.verdicts.foundations === 'NOT STATED' && /^(PASS|FINDINGS)/.test(S.verdicts.foundations) && mask(S.html) !== b, '');
  // U7
  if (process.env.BROWSER === '0' || files.length !== 9) console.log('§REG_REPORT_UI_PAGE_SKIP ' + (files.length !== 9 ? 'marked sheets missing' : 'BROWSER=0') + ' — U7 not judged');
  else {
    const http = require('http'), puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(buf); }); });
    await new Promise(z => srv.listen(0, '127.0.0.1', z));
    const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), errs = [];
    try {
      const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.on('pageerror', e => { errs.push(String(e).slice(0, 160)); console.log('§PAGEERR ' + String(e).slice(0, 160)); });
      pg.on('console', m => { const t = m.text(); if (/^§REG_REPORT/.test(t)) console.log('  page ' + t.slice(0, 220)); });
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
      await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI', { timeout: 120000 }); await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
      await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
      const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
      await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 });
      await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 2500));
      await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 180000 }); await new Promise(r => setTimeout(r, 1500));
      await pg.click('#b-export'); await pg.waitForSelector('#m-export-panel .me-row[data-key="regrep"]', { visible: true }); await pg.click('#m-export-panel .me-row[data-key="regrep"]');
      await pg.waitForSelector('#m-regrep-panel #rr-build', { visible: true, timeout: 60000 });
      await pg.evaluate(() => { localStorage.removeItem('dagevu_reg_facts'); document.querySelectorAll('#m-regrep-panel input[data-fact]').forEach(i => { i.value = ''; }); const s = document.getElementById('rr-pack'); s.value = 'pwd2024_bd'; });
      await pg.click('#rr-build'); await pg.waitForFunction('window.RegReportUI.last() && window.RegReportUI.last().html', { timeout: 180000, polling: 500 });   // interval: the report's new tab backgrounds this page and stops rAF polling
      const ph = await pg.evaluate(() => window.RegReportUI.last().html), pv = await pg.evaluate(() => window.RegReportUI.last().verdicts), m7 = mask(ph);
      ok('U7 THE PAGE Export ▸ Regulatory Report… on the converted shed = the CLI\'s report (masked), 0 page errors', m7 === a && errs.length === 0, firstDiff(a, m7) + ' | page verdicts ' + JSON.stringify(pv) + ' | errors ' + errs.length);
    } catch (e) { ok('U7 THE PAGE', false, 'crash ' + String(e && e.message || e).slice(0, 200)); }
    await br.close(); srv.close();
  }
  console.log(fail ? '§VERDICT FAIL W-REG-REPORT-UI judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-REG-REPORT-UI judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1); });
