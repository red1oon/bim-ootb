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
 *   P5 layout: at 1440 x 900 the panel's box overlaps no other visible fixed panel (boxes printed) and no visible toolbar control has the panel on top of it (elementFromPoint at its centre; at 1024 x 768 with the meta editor open there is no room beside it: the panel must then be ON TOP (overlay flag, visible at its own top) and still cover no control;
 *      first runner run: #b-move was covered, so W-SHED-WALL-EDIT could not enter Move); the same at 1024 x 768
 *   P6 (U7) an opened .db (DXARC.db, the Duplex; DXARC_DB): pick a wall -> class / name / material and its Pset_*Common rows = that guid's rows in the file (sql.js oracle in Node)
 *   P7 (U7; P-X 2026-11-02) a raw .ifc (the Duplex architecture IFC; DUPLEX_IFC) opened in the Modeller: pick a part -> its Pset rows = the shared extractor's
 *      element_pset_common rows for that guid (Node oracle on the same file), read from the OPENED building's DB (source=building): since P-X the open itself is the
 *      shared extractor, so the file is never read a second time (0 §PROPS_IFC_EXTRACT; U7 had one) — a second pick, the same
 *   P8 FALSIFIER (U7): OpenBuildingDb.partOf on a guid the DB lacks -> null, the panel shows no groups
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
  await page(R, mo).catch(e => { ok('P3 THE PAGE', false, 'crash ' + String(e && e.stack || e).slice(0, 300)); });
  await opened().catch(e => { ok('P6 OPENED BUILDING', false, 'crash ' + String(e && e.stack || e).slice(0, 300)); });
  done();
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
    // P5b every visible toolbar control is still the top element at its own centre (nothing of the panel on top of it: the runner caught #b-move covered)
    const covered = await pg.evaluate(() => Array.from(document.querySelectorAll('#bar button, #bar input, #bar select')).filter(b => { const cs = getComputedStyle(b); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.getClientRects().length > 0; }).map(b => { const q = b.getBoundingClientRect(); if (!q.width || !q.height) return null;
      const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return t && t.closest('#pp-panel') ? (b.id || b.title || b.tagName) : null; }).filter(Boolean));
    const nCtl = await pg.evaluate(() => Array.from(document.querySelectorAll('#bar button, #bar input, #bar select')).filter(b => { const cs = getComputedStyle(b); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.getClientRects().length > 0; }).length);
    // P5c the same at 1024 x 768 (the meta editor open): no panel overlap, no control covered
    await pg.setViewport({ width: 1024, height: 768 }); await new Promise(r => setTimeout(r, 400));
    const small = await pg.evaluate(() => { const vis = b => { const cs = getComputedStyle(b); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.getClientRects().length > 0; };
      const P = document.getElementById('pp-panel'), pb = P.getBoundingClientRect(), box = [pb.left, pb.top, pb.right, pb.bottom].map(Math.round);
      const cov = Array.from(document.querySelectorAll('#bar button, #bar input, #bar select')).filter(vis).map(b => { const q = b.getBoundingClientRect(); const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return t && t.closest('#pp-panel') ? b.id : null; }).filter(Boolean);
      const ov = ['bonsai-outliner', 'dxf-panel', 'dm-panel'].map(id => document.getElementById(id)).filter(e => e && vis(e)).map(e => { const q = e.getBoundingClientRect(); return { id: e.id, hit: !(q.right <= pb.left || q.left >= pb.right || q.bottom <= pb.top || q.top >= pb.bottom) }; }).filter(x => x.hit).map(x => x.id);
      return { box, cov, ov, shown: P.style.display === 'block', overlay: P.getAttribute('data-pp-overlay') === '1', top: (() => { const t = document.elementFromPoint((pb.left + pb.right) / 2, pb.top + 12); return !!(t && t.closest('#pp-panel')); })() }; });
    console.log('  P5c 1024 x 768 ' + JSON.stringify(small));
    await pg.setViewport({ width: 1440, height: 900 }); await new Promise(r => setTimeout(r, 400));
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
    ok('P5 layout at 1440 x 900: the panel overlaps none of the ' + boxes.length + ' other visible fixed panels' + (over.length ? ' (overlaps ' + over.map(x => x.id).join(',') + ')' : '') + ' and covers none of the ' + nCtl + ' visible toolbar controls' + (covered.length ? ' (covers ' + covered.join(',') + ')' : ''), a.shown && boxes.length > 0 && over.length === 0 && nCtl > 0 && covered.length === 0 && small.shown && small.cov.length === 0 && (small.ov.length === 0 || (small.overlay && small.top)), 'at 1024 x 768: ' + JSON.stringify(small));
  } finally { await br.close(); srv.close(); }
}
// ---- P6-P8 (U7): an opened building's part, from its own DB; a raw .ifc through the shared extractor ----
async function opened() {
  const DXARC = process.env.DXARC_DB || path.join(os.homedir(), '.cache', 'dxf2bim', 'db', 'DXARC.db'), IFCF = process.env.DUPLEX_IFC || path.join(os.homedir(), 'bim-compiler', 'internal', 'sources', 'Ifc2x3_Duplex_Architecture.ifc');
  if (!fs.existsSync(DXARC) || !fs.existsSync(IFCF)) { console.log('§INCONCLUSIVE P6/P7 input missing: ' + [DXARC, IFCF].filter(f => !fs.existsSync(f)).join(' ')); return; }
  const SQLm = await require('sql.js')(), OB = require(path.join(M, 'open_building_db.js'));
  const pick = db => { const r = db.exec("SELECT p.guid FROM element_pset_common p JOIN elements_meta m ON m.guid = p.guid WHERE m.ifc_class LIKE 'IfcWall%' GROUP BY p.guid ORDER BY count(*) DESC, p.guid LIMIT 1"); return r.length ? r[0].values[0][0] : null; };
  const rowsKey = P => JSON.stringify((P.psets || []).map(r => [r.pset, r.name, String(r.value)]));
  // oracles
  const dbA = new SQLm.Database(fs.readFileSync(DXARC)), gA = pick(dbA), oA = OB.partOf(dbA, gA);
  const WI = require('web-ifc'), api = new WI.IfcAPI(); await api.Init(); const Core = require(path.join(M, 'dxf2bim', 'ifc_extract_core.js')), dbB = new SQLm.Database();
  await Core.extractToDb({ WebIFC: WI, ifcApi: api, ifcData: new Uint8Array(fs.readFileSync(IFCF)), db: Core.sqljsDb(dbB), Buf: Core.browserBuf, buildingName: 'MODEL', sourceName: path.basename(IFCF), log: () => {} });
  const gB = pick(dbB), oB = OB.partOf(dbB, gB);
  console.log('  P6 oracle ' + path.basename(DXARC) + ' guid=' + gA + ' class=' + (oA && oA.meta.ifc_class) + ' psetRows=' + (oA && oA.psets.length) + ' | P7 oracle guid=' + gB + ' psetRows=' + (oB && oB.psets.length));
  ok('P8 FALSIFIER a guid the DB lacks -> partOf null; the panel model of a null part has no groups', OB.partOf(dbA, 'NOT-A-GUID') === null && PP.rowsFor(1, { guidByFid: { 1: 'NOT-A-GUID' }, part: null }).groups.length === 0, '');
  const http = require('http'), ROOT = path.join(__dirname, '..', '..'), puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(buf); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), errs = [], ext = [];
  const openWith = async file => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 }); pg.on('pageerror', e => { errs.push(String(e).slice(0, 160)); console.log('§PAGEERR ' + String(e).slice(0, 160)); });
    pg.on('console', m => { const t = m.text(); if (/^§PROPS_IFC_EXTRACT|^§PSET_COMMON/.test(t)) { ext.push(t); console.log('  page ' + t.slice(0, 200)); } });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.OpenBuildingDb && window.PropsPanel', { timeout: 120000 });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await ch.accept([file]);
    await pg.waitForFunction('window.__dwBuf && window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0', { timeout: 300000, polling: 500 }); await new Promise(r => setTimeout(r, 1500)); return pg; };
  const shown = (pg, guid, src) => pg.evaluate(async (g, src) => { const fid = window.__arcFidByGuid[g]; if (fid == null) return { fid: null }; window.Bonsai.select(fid);
      for (let i = 0; i < 600; i++) { const p = document.getElementById('pp-panel'), s = p && p.querySelector('[data-pp-source]'); if (s && s.getAttribute('data-pp-source') === src) break; await new Promise(r => setTimeout(r, 200)); }
      const p = document.getElementById('pp-panel'), kv = {}, rows = []; let grp = null;
      p.querySelectorAll('.pp-g, .pp-r').forEach(e => { if (e.classList.contains('pp-g')) grp = e.textContent.replace(/ \(.*\)$/, ''); else { const k = e.getAttribute('data-pp-key'), v = e.querySelector('b').textContent; if (grp) rows.push([grp, k, v]); else kv[k] = v; } });
      const s = p.querySelector('[data-pp-source]'); return { fid, src: s && s.getAttribute('data-pp-source'), kv, rows }; }, guid, src);
  try {
    const pa = await openWith(DXARC), a = await shown(pa, gA, 'building');
    const wantA = JSON.stringify(oA.psets.map(r => [r.pset, r.name, String(r.value)]));
    console.log('  P6 page fid=' + a.fid + ' src=' + a.src + ' class=' + a.kv['IFC class'] + ' rows=' + a.rows.length + ' (oracle ' + oA.psets.length + ')');
    ok('P6 an opened .db: the wall\'s class / name / material and its ' + oA.psets.length + ' Pset_*Common rows = the file\'s rows for guid ' + gA,
      a.fid != null && a.src === 'building' && a.kv['IFC class'] === oA.meta.ifc_class && a.kv['Name'] === (oA.meta.element_name || '—') && a.kv['Material'] === (oA.meta.material_name || '—') && JSON.stringify(a.rows) === wantA && oA.psets.length > 0, '');
    await pa.close();
    const pb = await openWith(IFCF), b = await shown(pb, gB, 'building');
    const other = await pb.evaluate(g => Object.keys(window.__arcFidByGuid).find(k => k !== g && !/^dxf-/.test(k)), gB), b2 = await shown(pb, other, 'building');
    const nExt = ext.filter(l => /^§PROPS_IFC_EXTRACT /.test(l)).length, wantB = JSON.stringify(oB.psets.map(r => [r.pset, r.name, String(r.value)]));
    console.log('  P7 page fid=' + b.fid + ' src=' + b.src + ' rows=' + b.rows.length + ' (oracle ' + oB.psets.length + '); second pick src=' + b2.src + '; §PROPS_IFC_EXTRACT lines ' + nExt);
    ok('P7 a raw .ifc opened: the wall\'s ' + oB.psets.length + ' Pset rows = the extractor\'s rows for guid ' + gB + ', read from the opened building\'s DB (P-X: the open is the shared extractor); the file is not read again (' + nExt + ' extract); page errors ' + errs.length,
      b.fid != null && b.src === 'building' && JSON.stringify(b.rows) === wantB && oB.psets.length > 0 && b2.src === 'building' && nExt === 0 && errs.length === 0, '');
  } finally { await br.close(); srv.close(); }
}
function done() { console.log(fail ? '§VERDICT FAIL W-PROPS-PANEL judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-PROPS-PANEL judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0); }
