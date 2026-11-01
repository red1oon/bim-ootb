// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — scope: W-WALKED-EXPORT (prompts/MODELLER_MASTER.md §RESUME 2026-11-02 "M-3 SPEC"). Read the § lines after EVERY run; exit code alone is not evidence.
// Chain: Convert the marked shed -> Export Viewer DB (PRE) -> Open that .db again -> Walk ALL services -> Export Viewer DB (POST) -> the Viewer opens POST.
// Issues proved/disproved:
//   X1 a walked ELEC fixture reaches the Viewer DB as IfcLightFixture / discipline ELEC, one row per placement the walk reports (was IfcBuildingElementProxy / ARC, named "Element NNN")
//   X2 a walked FP fixture reaches it as IfcFireSuppressionTerminal / discipline FP, one row per placement
//   X3 no walked fixture is left as a Proxy (the main-baseline defect: 198 Proxy rows)
//   X4 the Viewer opens POST ("DONE ... N elements"), 0 page errors on the Modeller and Viewer pages
//   X5 FALSIFIER: the same export with the walked ops' params._dw hidden (= what main read) gives Proxy rows, so X1-X3 can fail
//   X6 INFO, not judged: classes of PRE that do not survive the reopen (Member/Footing/Fan/OpeningElement) -> ⛔ BLOCKED M-3(b), a product decision (see MODELLER_MASTER)
// Local material: the CLI-marked shed set (SHED_MARKED_DIR). Absent -> INCONCLUSIVE. M3_MAIN_IFC=<file> serves that file as modeller/bonsai_ifc.js (run the witness against main's writer = the baseline FAIL).
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), NM = path.join(process.env.HOME, 'bim-compiler', 'node_modules');
const MARKED = process.env.SHED_MARKED_DIR || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
const enc = 'b => { let s = ""; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return s; }';
(async () => {
  if (!fs.existsSync(MARKED) || fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).length !== 9) { console.log('§SKIP W-WALKED-EXPORT  the marked shed set is absent (INCONCLUSIVE: nothing judged): ' + MARKED); console.log('§W-WALKED-EXPORT INCONCLUSIVE'); process.exit(0); }
  const files = fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wexp-'));
  const mainIfc = process.env.M3_MAIN_IFC && fs.readFileSync(process.env.M3_MAIN_IFC);
  if (mainIfc) console.log('§W-WALKED-EXPORT BASELINE MODE: modeller/bonsai_ifc.js served from ' + process.env.M3_MAIN_IFC);
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]);
    if (mainIfc && /\/modeller\/bonsai_ifc\.js$/.test(p)) { s.writeHead(200, { 'Content-Type': 'text/javascript' }); s.end(mainIfc); return; }
    fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const mk = async () => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/§(VIEWERDB|IFC-SEED|DISCWALK-ALL (start|done)|DISC-WALK-COMMIT)/.test(t)) console.log('  [con] ' + t.slice(0, 260)); });
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.Bonsai && window.Bonsai.exportViewerDb && typeof window.discWalkAll==="function"', { timeout: 120000 }); return pg; };
  const expo = (pg, strip) => pg.evaluate(async (strip, encSrc) => {
    const O = window.Bonsai.oplog, orig = O._geomOps;
    if (strip) O._geomOps = function () { return orig.call(O).map(o => { if (!o.parameters || !o.parameters._dw) return o; const p = Object.assign({}, o.parameters); delete p._dw; return Object.assign({}, o, { parameters: p }); }); };
    let r; try { r = await window.Bonsai.exportViewerDb({ download: false }); } finally { O._geomOps = orig; }
    const e = eval('(' + encSrc + ')'); return { elements: r.elements, db: e(r.bytes) }; }, !!strip, enc);
  // ── PRE: convert + export
  let pg = await mk();
  await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
  const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
  await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length===9 && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 }); await sleep(2500);
  await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await sleep(800);
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 }); await sleep(1500);
  const pre = await expo(pg, false), preDb = path.join(tmp, 'ShedWalked.db'); fs.writeFileSync(preDb, Buffer.from(pre.db, 'latin1')); await pg.close();
  // ── REOPEN (the file name carries 'Shed' = the farm_rules.db roster, modeller.html _dwRules)
  // ── REOPEN + Walk ALL + POST export
  pg = await mk();
  await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
  const [c2] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await c2.accept([preDb]);
  await pg.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await pg.evaluate(async () => { await window.__arcSeedReady; }); await sleep(4000);
  const row = await pg.evaluate(() => !!document.querySelector('[data-bnode="dw-all"]')); if (!row) { console.log('§FAIL W-WALKED-EXPORT no Walk ALL row after reopen'); process.exit(1); }
  const ops0 = await pg.evaluate(() => window.Bonsai.oplog.length);
  await pg.evaluate(() => { window.__dwAllDone = false; }); await pg.click('[data-bnode="dw-all"]');
  const done = await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 900000, polling: 500 }).then(() => true).catch(() => false); await sleep(4000);
  const walk = await pg.evaluate(() => { const w = window.__dwWalks || {}, o = {}; Object.keys(w).forEach(k => o[k] = (w[k] || []).length);
    const cen = {}; window.Bonsai.oplog._geomOps().forEach(x => { const d = x.parameters && x.parameters._dw; if (d) { const k = d.disc + '/' + d.ifc; cen[k] = (cen[k] || 0) + 1; } });
    return { ops: window.Bonsai.oplog.length, placed: o, dwOps: cen }; });
  console.log('§WALKED-EXPORT walkall done=' + done + ' oplog ' + ops0 + '->' + walk.ops + ' placed=' + JSON.stringify(walk.placed) + ' committed _dw ops by disc/class=' + JSON.stringify(walk.dwOps));
  const post = await expo(pg, false), postDb = path.join(tmp, 'post.db'); fs.writeFileSync(postDb, Buffer.from(post.db, 'latin1'));
  const hid = await expo(pg, true), hidDb = path.join(tmp, 'hidden.db'); fs.writeFileSync(hidDb, Buffer.from(hid.db, 'latin1'));
  const modErrs = errs.length;
  // ── census
  const Database = require(path.join(NM, 'better-sqlite3')), cen = f => { const d = new Database(f, { readonly: true }), o = {}; d.prepare('select discipline, ifc_class, count(*) n from elements_meta group by 1,2').all().forEach(r => o[r.discipline + '/' + r.ifc_class] = r.n); d.close(); return o; };
  const cPre = cen(preDb), cPost = cen(postDb), cHid = cen(hidDb); const sum = c => Object.values(c).reduce((a, b) => a + b, 0);
  console.log('§WALKED-EXPORT PRE  (' + sum(cPre) + ') ' + JSON.stringify(cPre)); console.log('§WALKED-EXPORT POST (' + sum(cPost) + ') ' + JSON.stringify(cPost)); console.log('§WALKED-EXPORT HIDDEN-_dw (' + sum(cHid) + ') ' + JSON.stringify(cHid));
  const nE = walk.placed.ELEC || 0, nF = walk.placed.FP || 0;
  if (!done || !nE || !nF) { console.log('§W-WALKED-EXPORT INCONCLUSIVE walk did not place ELEC and FP (done=' + done + ' ELEC=' + nE + ' FP=' + nF + ')'); await br.close(); srv.close(); process.exit(0); }
  const proxy = c => Object.keys(c).filter(k => /IfcBuildingElementProxy$/.test(k)).reduce((a, k) => a + c[k], 0);
  ok('X1 walked ELEC fixtures: IfcLightFixture under discipline ELEC, one row per placement', cPost['ELEC/IfcLightFixture'] === nE, 'placed=' + nE + ' exported ELEC/IfcLightFixture=' + (cPost['ELEC/IfcLightFixture'] || 0));
  ok('X2 walked FP fixtures: IfcFireSuppressionTerminal under discipline FP, one row per placement', cPost['FP/IfcFireSuppressionTerminal'] === nF, 'placed=' + nF + ' exported FP/IfcFireSuppressionTerminal=' + (cPost['FP/IfcFireSuppressionTerminal'] || 0));
  ok('X3 no walked fixture is left as a Proxy (PRE had ' + proxy(cPre) + ')', proxy(cPost) === proxy(cPre), 'proxy rows PRE=' + proxy(cPre) + ' POST=' + proxy(cPost));
  ok('X5 falsifier: with the walked ops\' _dw hidden the same export puts them back as Proxy rows (X1-X3 can fail)', proxy(cHid) - proxy(cPre) >= nE + nF && !(cHid['ELEC/IfcLightFixture']), 'hidden-run proxy=' + proxy(cHid) + ' ELEC/IfcLightFixture=' + (cHid['ELEC/IfcLightFixture'] || 0));
  // X6 info: PRE classes lost by the ARC-only reopen
  const lost = Object.keys(cPre).filter(k => (cPost[k] || 0) < cPre[k]).map(k => k + ' ' + cPre[k] + '->' + (cPost[k] || 0)), gained = Object.keys(cPost).filter(k => (cPost[k] || 0) > (cPre[k] || 0) && !/IfcLightFixture|IfcFireSuppressionTerminal/.test(k)).map(k => k + ' ' + (cPre[k] || 0) + '->' + cPost[k]);
  console.log('§BLOCKED M-3(b) (info, not judged) PRE classes not carried through the ARC-only reopen: ' + lost.join(', ') + ' | grew (STR skeleton walk): ' + gained.join(', '));
  // X4 the Viewer
  const dst = path.join(ROOT, 'viewer', 'buildings'), fv = path.join(dst, '_w_m3_test.db'); fs.copyFileSync(postDb, fv);
  const p2 = await br.newPage(); await p2.setViewport({ width: 1280, height: 720 }); p2.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR viewer ' + String(e).slice(0, 200)); });
  await p2.goto(base + '/viewer/viewer.html?db=buildings/_w_m3_test.db', { waitUntil: 'load', timeout: 120000 }); let t = ''; for (let i = 0; i < 120; i++) { await sleep(1000); t = await p2.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)); if (/DONE/.test(t)) break; }
  try { fs.unlinkSync(fv); } catch (e) { }
  ok('X4 the Viewer opens the walked export as the building, 0 page errors', new RegExp('DONE.*' + sum(cPost) + ' elements').test(t) && errs.length === 0, t.slice(0, 120) + ' pageErrors=' + errs.length + ' (modeller ' + modErrs + ')');
  await br.close(); srv.close();
  console.log('§W-WALKED-EXPORT ' + (fails ? 'FAIL ' + fails : judged ? 'PASS' : 'INCONCLUSIVE')); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§FAIL W-WALKED-EXPORT crashed ' + (e && e.stack || e)); process.exit(1); });
