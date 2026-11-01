#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PROPS-PANEL: prompts/DXF2BIM_ARCHITECT_REVIEW.md U1. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: clicking a part in the Modeller said only "selected feature #N"; the drawing evidence the converter attached (notes, schedule, sizes and their
 * sources, sheet + handle) was visible only by exporting the IFC and reading its text. The Properties panel must show, for the selected part, exactly what its IFC carries — no more, no less.
 *   P1 every one of the shed's bodies: PropsPanel.rowsFor rows = the IFC writer's element (Dxf2Ifc.fromEls) as written (Dxf2Ifc.written: empty values are not in the file): every pset key/value exactly once, the head = class / name / ObjectType / PredefinedType / material
 *   P2 the converted IFC itself (shared extractor -> element_dxf2bim) carries the same key/values for a footing, a beam and a bar (the panel = the IFC, not only the writer's input)
 *   P3 THE PAGE (headless Modeller): open the marked shed, Complete, Convert, select a footing -> panel visible with Note_CastingRatio 1:1.5:3 (NoteSource ...#2E2) and Note_fc_MPa 24 (...#2E1);
 *      another part -> its own rows; x closes; select(null) -> hidden; 0 page errors (BROWSER=0 skips P3-P5, printed)
 *   P4 FALSIFIER: a part with no body behind it (a wall authored after Convert; and a fid absent from the bridge in Node) -> source "other", no evidence groups
 *   P5 layout: at 1440 x 900 the panel's box overlaps no other visible fixed panel (boxes printed)
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> MISSING input (exit 2).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2bim_cli.js')), PP = require(path.join(M, 'props_panel.js')), IFC = require(path.join(M, 'dxf2ifc.js'));
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
const files = fs.existsSync(MK) ? fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f)) : [];
if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets in ' + MK + ' (SHED_MARKED), found ' + files.length); process.exit(2); }
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
(async () => {
  const r1 = C.run(C.parseArgs(['--sheets', ...files, '--out', fs.mkdtempSync(path.join(os.tmpdir(), 'w_props_')), '--pack', 'pwd2024_bd', '--complete']), () => {}), R = r1.out.gate.R;
  const bridge = {}; R.els.forEach((e, i) => { bridge[1000 + i] = 'dxf-' + e.guid; });
  const ctx = { guidByFid: bridge, R, Dxf2Ifc: IFC, ifcClassOf: () => 'IfcWall' }, W = IFC.fromEls(R.els, R.ST);
  // P1
  let bad = [], nRows = 0;
  R.els.forEach((e, i) => {
    const m = PP.rowsFor(1000 + i, ctx), w = W[i], flat = []; m.groups.forEach(G => G.rows.forEach(r => flat.push(r)));
    const want = IFC.written(w.props).map(k => [k, String(w.props[k])]), keys = flat.map(r => r[0]);
    const same = m.source === 'drawing' && flat.length === want.length && new Set(keys).size === keys.length && want.every(([k, v]) => flat.some(r => r[0] === k && r[1] === v)) &&
      JSON.stringify(m.head.map(h => h[1])) === JSON.stringify([w['class'], w.name, w.objectType || '—', w.predefined || '—', w.material || '—']);
    nRows += flat.length; if (!same && bad.length < 3) bad.push(e.guid);
  });
  const foot = R.els.findIndex(e => e['class'] === 'IfcFooting'), mf = PP.rowsFor(1000 + foot, ctx);
  console.log('  ' + PP.logLine(mf) + ' groups: ' + mf.groups.map(G => G.title + ' ' + G.rows.length).join(', '));
  ok('P1 all ' + R.els.length + ' bodies: the panel rows = the IFC writer\'s element (' + nRows + ' pset rows, each once; head = class/name/ObjectType/PredefinedType/material)', bad.length === 0 && R.els.length > 0, bad.join(' '));
  // P4 (Node half)
  const mo = PP.rowsFor(424242, ctx);
  // P2: the IFC itself
  const WI = require('web-ifc'), api = new WI.IfcAPI(); await api.Init(); const SQL = await require('sql.js')(), Core = require(path.join(M, 'dxf2bim', 'ifc_extract_core.js'));
  const built = await C.buildIfc(r1), db = new SQL.Database();
  await Core.extractToDb({ WebIFC: WI, ifcApi: api, ifcData: new Uint8Array(built.bytes), db: Core.sqljsDb(db), Buf: Core.browserBuf, buildingName: 'MODEL', sourceName: 'model.ifc', log: () => {} });
  const ev = {}; (db.exec('SELECT guid, name, value FROM element_dxf2bim')[0] || { values: [] }).values.forEach(r => { (ev[r[0]] = ev[r[0]] || {})[r[1]] = r[2]; }); db.close();
  const bySrc = {}; Object.keys(ev).forEach(g => { if (ev[g].SourceGuid) bySrc[ev[g].SourceGuid] = ev[g]; });
  const pick = ['IfcFooting', 'IfcBeam', 'IfcMember'].map(c => R.els.findIndex(e => e['class'] === c)), p2 = pick.map(i => {
    const m = PP.rowsFor(1000 + i, ctx), flat = []; m.groups.forEach(G => G.rows.forEach(r => flat.push(r))); const I = bySrc[R.els[i].guid] || {};
    return { cls: R.els[i]['class'], rows: flat.length, ifc: Object.keys(I).length, same: flat.length === Object.keys(I).length && flat.every(([k, v]) => I[k] === v) };
  });
  console.log('  P2 ' + JSON.stringify(p2));
  ok('P2 the converted IFC carries the panel\'s key/values for a footing, a beam and a bar (element_dxf2bim, read by the shared extractor)', p2.every(x => x.same && x.rows > 0), '');
  if (process.env.BROWSER === '0') { console.log('§PROPS_PAGE_SKIP BROWSER=0 — P3 and P5 not judged; P4 judged in Node only');
    ok('P4 FALSIFIER (Node) a fid with no body -> source ' + mo.source + ', evidence groups ' + mo.groups.length, mo.source === 'other' && mo.groups.length === 0, ''); return done(); }
  await page(R, mo).then(() => done(), e => { ok('P3 THE PAGE', false, 'crash ' + String(e && e.stack || e).slice(0, 300)); done(); });
})();
async function page(R, mo) {
  const http = require('http'), ROOT = path.join(__dirname, '..', '..'), puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(buf); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), errs = [], props = [];
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 }); pg.on('pageerror', e => { errs.push(String(e).slice(0, 160)); console.log('§PAGEERR ' + String(e).slice(0, 160)); });
    pg.on('console', m => { const t = m.text(); if (/^§PROPS/.test(t)) { props.push(t); console.log('  page ' + t.slice(0, 200)); } });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.PropsPanel', { timeout: 120000 }); await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 });
    await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 2500));
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 180000 }); await new Promise(r => setTimeout(r, 1500));
    const hiddenAtStart = await pg.evaluate(() => { const p = document.getElementById('pp-panel'); return !p || p.style.display === 'none'; });
    const read = () => pg.evaluate(() => { const p = document.getElementById('pp-panel'); if (!p || p.style.display === 'none') return { shown: false };
      const kv = {}; p.querySelectorAll('.pp-r').forEach(r => { kv[r.getAttribute('data-pp-key')] = r.querySelector('b').textContent; }); const b = p.getBoundingClientRect();
      return { shown: true, kv, note: !!p.querySelector('[data-pp-note]'), groups: p.querySelectorAll('[data-pp-group]').length, box: [b.left, b.top, b.right, b.bottom].map(Math.round) }; });
    const fidOf = cls => pg.evaluate(c => { const U = window.DxfImportUI.state, fb = U.last.fidByGuid; const e = U.gate.R.els.find(x => x['class'] === c && fb['dxf-' + x.guid] != null); return e ? fb['dxf-' + e.guid] : null; }, cls);
    const fF = await fidOf('IfcFooting'), fB = await fidOf('IfcBeam');
    await pg.evaluate(f => window.Bonsai.select(f), fF); const a = await read();
    // P5 layout, while the footing is shown: every other visible fixed element that is a panel (box > 60 x 60 px)
    const boxes = await pg.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(e => e.id !== 'pp-panel' && !e.closest('#pp-panel') && getComputedStyle(e).position === 'fixed' && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden')
      .map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.className || e.tagName, b: [b.left, b.top, b.right, b.bottom].map(Math.round) }; }).filter(x => x.b[2] - x.b[0] > 60 && x.b[3] - x.b[1] > 60 && x.id !== 'bar'));
    await pg.evaluate(f => window.Bonsai.select(f), fB); const b = await read();
    await pg.evaluate(() => document.getElementById('pp-close').click()); const c = await read();
    await pg.evaluate(() => window.Bonsai.select(null)); const d = await read();
    const wall = await pg.evaluate(async () => { const w = await window.Bonsai.oplog.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 }); window.Bonsai.select(w.id); return w.id; });
    await new Promise(r => setTimeout(r, 300)); const e = await read();
    console.log('  page footing fid=' + fF + ' ' + JSON.stringify(a.kv && { CR: a.kv.Note_CastingRatio, CRs: a.kv.NoteSource_CastingRatio, fc: a.kv.Note_fc_MPa, fcs: a.kv.NoteSource_fc_MPa, cls: a.kv['IFC class'] }) + ' box=' + JSON.stringify(a.box));
    console.log('  page beam fid=' + fB + ' class=' + (b.kv && b.kv['IFC class']) + ' handle=' + (b.kv && b.kv.SourceHandle) + '; after x shown=' + c.shown + '; select(null) shown=' + d.shown + '; wall fid=' + wall + ' note=' + e.note + ' groups=' + e.groups);
    ok('P3 THE PAGE hidden before any pick (' + hiddenAtStart + '); a footing -> Note_CastingRatio ' + (a.kv && a.kv.Note_CastingRatio) + ' (' + (a.kv && a.kv.NoteSource_CastingRatio) + '), Note_fc_MPa ' + (a.kv && a.kv.Note_fc_MPa) + ' (' + (a.kv && a.kv.NoteSource_fc_MPa) + '); a beam -> its own rows; x closes; select(null) hides; page errors ' + errs.length,
      hiddenAtStart && a.shown && a.kv.Note_CastingRatio === '1:1.5:3' && /5_DETAILS_marked\.dxf#2E2$/.test(a.kv.NoteSource_CastingRatio) && a.kv.Note_fc_MPa === '24' && /#2E1$/.test(a.kv.NoteSource_fc_MPa) && a.kv['IFC class'] === 'IfcFooting' &&
      b.shown && b.kv['IFC class'] === 'IfcBeam' && b.kv.Note_CastingRatio === undefined && !c.shown && !d.shown && errs.length === 0 && props.length >= 2, '');
    ok('P4 FALSIFIER a part with no body: Node fid absent -> ' + mo.source + ' (' + mo.groups.length + ' groups); the page\'s authored wall -> the "no drawing evidence" line, ' + e.groups + ' evidence groups',
      mo.source === 'other' && mo.groups.length === 0 && e.shown && e.note && e.groups === 0, '');
    const over = boxes.filter(x => !(x.b[2] <= a.box[0] || x.b[0] >= a.box[2] || x.b[3] <= a.box[1] || x.b[1] >= a.box[3]));
    console.log('  P5 panel ' + JSON.stringify(a.box) + ' vs ' + boxes.length + ' visible fixed panels: ' + boxes.map(x => x.id + JSON.stringify(x.b)).join(' ').slice(0, 600));
    ok('P5 layout at 1440 x 900: the panel overlaps none of the ' + boxes.length + ' other visible fixed panels' + (over.length ? ' (overlaps ' + over.map(x => x.id).join(',') + ')' : ''), a.shown && boxes.length > 0 && over.length === 0, '');
  } finally { await br.close(); srv.close(); }
}
function done() { console.log(fail ? '§VERDICT FAIL W-PROPS-PANEL judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-PROPS-PANEL judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0); }
