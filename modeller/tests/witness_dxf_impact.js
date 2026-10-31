#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-IMPACT: prompts/DXF2BIM_ARCHITECT_REVIEW.md §D99 P2 SPEC. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the defaults list showed the used settings as equals while two carry almost all the assumed value and most move nothing; a person
 * hunts through equals. The ranking must come from MEASURING each option through the real pipeline, never from a hand list.
 *   I1 RANK      — on the shed (--complete, pwd2024_bd) the top two are synth.slab.thickness and section.spacing, with the deltas the pipeline gives for them (re-run here
 *                  independently: run() with that one --choice vs without).
 *   I2 INERT     — the settings whose every option moves neither bill, own weight nor bodies are exactly the inert set; each inert row's tries are all 0.
 *   I3 ONE OWNER — the CLI's §IMPACT lines are the module's own tries (one line per try, the same numbers).
 *   I4 FALSIFIER — synth.roof.overhang (wired into dxf2synth) is NOT inert; a stated-by-the-drawing setting is skipped, never ranked.
 *   (§D99 P2 step 2: the page)
 *   I5 PAGE RUN  — Dxf2Impact.pageRun (the Modeller's own chain: readSheet with the choices -> Dxf2Structure.judge with the page's ref/defaultsRef -> RegReport.billAndLoad) on the
 *                  same marked shed ranks as the CLI: same active keys in order, same top option and deltas per row, same inert set.
 *   I6 THE PAGE  — the real Modeller headless: open, Complete, Convert; no §IMPACT line before the click; Element defaults ▸ Measure impact with pwd2024_bd -> the rendered ranked rows
 *                  (order, option, Δ bill) = the CLI's; the collapsed inert line holds the CLI's inert keys; a later choice marks it stale; 0 page errors. BROWSER=0 skips (printed).
 *   I7 FALSIFIER — pageRun with the choice dropped (sabotage) does not match the CLI (I5's comparison goes RED on it).
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> §SKIP.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const MOD = f => require(path.join(__dirname, '..', f));
const M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2bim_cli.js'));
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
if (!fs.existsSync(MK)) { console.log('§SKIP W-IMPACT no marked shed set at ' + MK); process.exit(0); }
const files = fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f));
const args = extra => C.parseArgs(['--sheets', ...files, '--out', path.join(os.tmpdir(), 'w_impact_' + process.pid), '--pack', 'pwd2024_bd', '--complete', ...extra]);
const lines = [], I = C.impact(args([]), l => lines.push(l));
lines.filter(l => /§IMPACT_RANK/.test(l)).forEach(l => console.log('  ' + l));
const total = extra => { const r = C.run(args(extra), () => {}); return { t: r.bill.totals.amount, n: r.out.gate.R.els.length }; }, b = total([]);
// I1
const top2 = I.active.slice(0, 2).map(r => r.key), d = k => { const r = I.rows.find(x => x.key === k); return r.top; };
const s = total(['--choice', 'synth.slab.thickness=' + d('synth.slab.thickness').option]), p = total(['--choice', 'section.spacing=' + d('section.spacing').option]);
ok('I1 RANK top two = ' + top2.join(', ') + '; their deltas = an independent run with that one choice (' + d('synth.slab.thickness').dBill.toFixed(2) + ' / ' + d('section.spacing').dBill.toFixed(2) + ' BDT)',
  top2[0] === 'synth.slab.thickness' && top2[1] === 'section.spacing' && Math.abs((s.t - b.t) - d('synth.slab.thickness').dBill) < 1e-6 && Math.abs((p.t - b.t) - d('section.spacing').dBill) < 1e-6 && (p.n - b.n) === d('section.spacing').dBodies,
  'independent ' + (s.t - b.t).toFixed(2) + ' / ' + (p.t - b.t).toFixed(2) + ' bodies ' + (p.n - b.n));
// I2
const inert = I.inert.map(r => r.key).sort();
ok('I2 INERT ' + inert.length + ' settings move nothing (' + inert.join(', ') + '): every try 0 on bill, weight, bodies; every active row moves at least one',
  inert.length > 0 && I.inert.every(r => r.tries.every(t => Math.abs(t.dBill) < 1e-6 && Math.abs(t.dKN) < 1e-6 && t.dBodies === 0)) && I.active.every(r => r.tries.some(t => Math.abs(t.dBill) >= 1e-6 || Math.abs(t.dKN) >= 1e-6 || t.dBodies !== 0)),
  'active=' + I.active.map(r => r.key + ':' + r.top.dBill.toFixed(0) + '/' + r.top.dKN.toFixed(2) + 'kN').join(','));
// I3
const L = lines.filter(l => /^§IMPACT key=/.test(l)), tries = I.rows.reduce((n, r) => n + r.tries.length, 0);
const same = I.rows.every(r => r.tries.every(t => L.some(l => l.indexOf('key=' + r.key + ' ') > 0 && l.indexOf('option=' + t.option + ' dBill=' + t.dBill.toFixed(2) + ' ') > 0)));
ok('I3 ONE OWNER the §IMPACT lines (' + L.length + ') = the module\'s tries (' + tries + '), same numbers', L.length === tries && same, '');
// I4
const ov = I.rows.find(r => r.key === 'synth.roof.overhang');
ok('I4 FALSIFIER synth.roof.overhang is active (' + (ov && ov.top.dBill.toFixed(2)) + ' BDT at ' + (ov && ov.top.option) + '); skipped ' + I.skipped.length + ' (' + I.skipped.map(x => x.key + ': ' + x.why).join('; ') + ')',
  ov && !ov.inert && I.skipped.every(x => !I.rows.some(r => r.key === x.key)), '');
// I5 + I7: the page's chain, in Node, on the CLI's effective sheets (the marked files as the CLI reads them)
const R0 = C.run(args([]), () => {}), J = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const D = { I: MOD('dxf2bim_import.js'), B: MOD('dxf2bodies.js'), ST: MOD('dxf2structure.js'), RG: MOD('reg_report.js'), LS: MOD('load_summary.js'), BL: MOD('dxf2bill.js'), prep: MOD('dxf2prep.js'),
  effText: sh => sh.text, complete: true, ref: J('synthetic_ref.json'), defaultsRef: J('element_defaults.json'), pack: J('../viewer/rates/pwd2024_bd.json'), packName: 'pwd2024_bd' };
const Z = MOD('dxf2impact.js'), sig = X => JSON.stringify({ a: X.active.map(r => [r.key, String(r.top.option), r.top.dBill.toFixed(2), r.top.dKN.toFixed(2), r.top.dBodies]), i: X.inert.map(r => r.key).sort() });
const quiet = fn => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
const P5 = quiet(() => Z.rank(R0.out.gate.R.defaults_table, {}, Z.pageRun(D, R0.eff))), cliSig = sig(I);
ok('I5 PAGE RUN Dxf2Impact.pageRun ranks as the CLI (' + P5.active.length + ' active, ' + P5.inert.length + ' inert)', sig(P5) === cliSig, sig(P5) === cliSig ? '' : 'page ' + sig(P5).slice(0, 300) + ' | cli ' + cliSig.slice(0, 300));
const run7 = Z.pageRun(D, R0.eff), P7 = quiet(() => Z.rank(R0.out.gate.R.defaults_table, {}, () => run7({})));
ok('I7 FALSIFIER pageRun with the choice dropped does not match the CLI (I5 can fail)', sig(P7) !== cliSig, 'sabotage active=' + P7.active.length);
// I6: the real page
if (process.env.BROWSER === '0' || files.length !== 9) { console.log('§IMPACT_PAGE_SKIP ' + (files.length !== 9 ? 'marked sheets missing' : 'BROWSER=0') + ' — I6 not judged'); done(); }
else page6().then(() => done(), e => { ok('I6 THE PAGE', false, 'crash ' + String(e && e.message || e).slice(0, 200)); done(); });
async function page6() {
  const http = require('http'), ROOT = path.join(__dirname, '..', '..'), puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(buf); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), errs = [], imp = [];
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 }); pg.on('pageerror', e => { errs.push(String(e).slice(0, 160)); console.log('§PAGEERR ' + String(e).slice(0, 160)); });
    pg.on('console', m => { const t = m.text(); if (/^§IMPACT/.test(t)) imp.push(t); if (/^§IMPACT_RANK|impact /.test(t)) console.log('  page ' + t.slice(0, 240)); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI', { timeout: 120000 }); await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 });
    await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 2500));
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 180000 }); await new Promise(r => setTimeout(r, 1500));
    const before = imp.length;
    await pg.evaluate(() => { const S = window.DxfMetaEditor.state; S.sec.edefaults = true; window.DxfMetaEditor.show(); });
    await pg.waitForSelector('#dm-impact-go', { timeout: 30000 }); const loadedBefore = await pg.evaluate(() => !!window.Dxf2Impact);
    await pg.evaluate(() => document.getElementById('dm-impact-go').click());   // first click: the owners load and the pack picker shows (the pack is a choice, shown before any run)
    await pg.waitForSelector('#dm-impact-pack option', { timeout: 60000 }); const afterLoad = imp.length;
    await pg.evaluate(() => { const s = document.getElementById('dm-impact-pack'); s.value = 'pwd2024_bd'; document.getElementById('dm-impact-go').click(); });
    await pg.waitForFunction('window.DxfMetaEditor.state.impact && window.DxfMetaEditor.state.impact.res && window.DxfMetaEditor.state.impact.pack === "pwd2024_bd"', { timeout: 240000, polling: 500 });
    console.log('  page owners loaded before the click=' + loadedBefore + ' §IMPACT lines after the loading click=' + (afterLoad - before));
    await pg.waitForSelector('[data-impact-row]', { timeout: 30000 });
    const seen = await pg.evaluate(() => ({ rows: Array.prototype.map.call(document.querySelectorAll('[data-impact-row]'), e => [e.getAttribute('data-impact-row'), e.getAttribute('data-impact-option'), e.getAttribute('data-impact-dbill')]),
      inert: Array.prototype.map.call(document.querySelectorAll('[data-impact-inert] [data-edef]'), e => e.getAttribute('data-edef')).sort(), n: (document.querySelector('[data-impact-inert]') || {}).getAttribute ? document.querySelector('[data-impact-inert]').getAttribute('data-impact-inert') : null }));
    const want = I.active.map(r => [r.key, String(r.top.option), r.top.dBill.toFixed(2)]), wantInert = I.inert.map(r => r.key).sort();
    ok('I6 THE PAGE no §IMPACT before the click (' + before + '); Measure impact -> rows ' + JSON.stringify(seen.rows.map(r => r[0])) + ' = the CLI\'s (order, option, Δ bill); inert line ' + seen.n + ' = ' + wantInert.length,
      before === 0 && !loadedBefore && JSON.stringify(seen.rows) === JSON.stringify(want) && JSON.stringify(seen.inert) === JSON.stringify(wantInert) && String(seen.n) === String(wantInert.length) && errs.length === 0,
      'page ' + JSON.stringify(seen).slice(0, 400) + ' | cli ' + JSON.stringify(want).slice(0, 300) + ' | errors ' + errs.length);
    await pg.evaluate(() => { const S = window.DxfMetaEditor.state; S.defaultChoices = Object.assign({}, S.defaultChoices, { 'synth.roof.overhang': '0.6' }); window.DxfMetaEditor.show(); });
    const stale = await pg.evaluate(() => ({ msg: !!document.querySelector('[data-impact-stale]'), rows: document.querySelectorAll('[data-impact-row]').length }));
    ok('I6b STALE a later choice marks the measurement stale and the ranked rows go away', stale.msg && stale.rows === 0, JSON.stringify(stale));
  } finally { await br.close(); srv.close(); }
}
function done() { console.log(fail ? '§VERDICT FAIL W-IMPACT judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-IMPACT judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0); }
