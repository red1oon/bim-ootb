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
//   M-3(b) (DECIDED 2026-11-02, MODELLER_MASTER §RESUME 2026-11-02 "M-3(b) SPEC": a walked shed reaches the Viewer with every class intact; authored non-ARC bodies survive Open -> edits/Walk -> Export):
//   X6 every discipline/class of PRE is still in POST at its PRE count (Member 168, Footing 32, Fan 13, OpeningElement 2 were 0 on main); the walked fixtures come on top
//   X7 no doubling: the STR skeleton walk's girders/columns are not exported on top of the authored ones (IfcBeam stays 35, was 46; IfcColumn stays 96)
//   X8 FALSIFIER: the same session exported with the carry OFF fails X6 naming the lost classes (so X6 can fail)
//   X9 resident leg (Duplex, Open -> Export): ARC rows unchanged, the non-ARC rows of the resident's own DB (node truth: modeller/Duplex_ARC.db) are now exported; old (carry off) -> new numbers are logged
//   X6c the carried bodies sit where they were: world bbox of every carried GlobalId in POST = PRE within 1 cm (the renderer's own foldInsert placement, not a re-derived transform)
//   X11 P-X IFC open (Duplex-IFC row): same rule - the opened DB's own non-ARC bodies (page-side SQL on __dwBuf) are exported, ARC unchanged
//   X10 (M3B_HEAVY=1 only, Hospital_ARC 7,471 STR rows): opening adds no scene mesh / op-log row, carried rows = DB truth, heap + vertex cost on the § line
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
    pg.on('console', m => { const t = m.text(); if (/§(VIEWERDB|IFC-SEED|IFC-FILLS|IFC §M3B|DISCWALK-ALL (start|done)|DISC-WALK-COMMIT)/.test(t)) console.log('  [con] ' + t.slice(0, 700)); });
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.Bonsai && window.Bonsai.exportViewerDb && typeof window.discWalkAll==="function"', { timeout: 120000 }); return pg; };
  const expo = (pg, strip, noCarry) => pg.evaluate(async (strip, encSrc, noCarry) => {
    const O = window.Bonsai.oplog, orig = O._geomOps;
    if (strip) O._geomOps = function () { return orig.call(O).map(o => { if (!o.parameters || !o.parameters._dw) return o; const p = Object.assign({}, o.parameters); delete p._dw; return Object.assign({}, o, { parameters: p }); }); };
    let r; try { r = await window.Bonsai.exportViewerDb({ download: false, carry: !noCarry }); } finally { O._geomOps = orig; }
    const e = eval('(' + encSrc + ')'); return { elements: r.elements, db: e(r.bytes) }; }, !!strip, enc, !!noCarry);
  // M-3(b) option comparison (info, not judged; M3B_RESEED_TRIAL=1): the RE-SEED alternative (commit the non-ARC bodies as op-log GEOM_INSERT rows + scene meshes) measured on the page it is run on
  const reseedTrial = (pg, label) => pg.evaluate(async (label) => { const O = window.Bonsai.oplog, A = window.ArcEditable, L = window.Bonsai.library, h = () => Math.round(performance.memory.usedJSHeapSize / 1048576);
    const b0 = { meshes: window.Bonsai.group().children.length, heap: h(), ops: O.length }, t = performance.now();
    const bdb = new window.SQL.Database(new Uint8Array(window.__dwBuf)), gdb = window.__dwGeoBuf ? new window.SQL.Database(new Uint8Array(window.__dwGeoBuf)) : undefined;
    const built = A.buildSeedOps(bdb, gdb, { rest: true, building: 'trial' }); L.registerRealGeometry(built.geomAssets);
    await O.commitSeedGroup(built.ops.map(o => ({ op_type: o.op_type, params: o.params, outputGuid: o.outputGuid })), 'm3b-trial', { verify: false }); await new Promise(r => setTimeout(r, 2000));
    const o = { label, ops: built.ops.length, meshesBefore: b0.meshes, meshesAfter: window.Bonsai.group().children.length, opsBefore: b0.ops, opsAfter: O.length, heapBefore: b0.heap, heapAfter: h(), ms: Math.round(performance.now() - t) }; bdb.close(); if (gdb) gdb.close(); return o; }, label);
  const showTrial = (r) => console.log('§M3B-COMPARE ' + r.label + ' RE-SEED trial (the rejected option): +' + r.ops + ' bodies -> op-log rows ' + r.opsBefore + ' -> ' + r.opsAfter + ', scene meshes ' + r.meshesBefore + ' -> ' + r.meshesAfter + ', JS heap ' + r.heapBefore + ' -> ' + r.heapAfter + ' MB, ' + r.ms + ' ms (pass-through: +0 rows, +0 meshes; its export-time cost is on the §M3B-CARRY line)');
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
  const off = await expo(pg, false, true), offDb = path.join(tmp, 'off.db'); fs.writeFileSync(offDb, Buffer.from(off.db, 'latin1'));
  const modErrs = errs.length;
  // ── census
  const Database = require(path.join(NM, 'better-sqlite3')), cen = f => { const d = new Database(f, { readonly: true }), o = {}; d.prepare('select discipline, ifc_class, count(*) n from elements_meta group by 1,2').all().forEach(r => o[r.discipline + '/' + r.ifc_class] = r.n); d.close(); return o; };
  const cPre = cen(preDb), cPost = cen(postDb), cHid = cen(hidDb), cOff = cen(offDb); const sum = c => Object.values(c).reduce((a, b) => a + b, 0);
  console.log('§WALKED-EXPORT PRE  (' + sum(cPre) + ') ' + JSON.stringify(cPre)); console.log('§WALKED-EXPORT POST (' + sum(cPost) + ') ' + JSON.stringify(cPost)); console.log('§WALKED-EXPORT HIDDEN-_dw (' + sum(cHid) + ') ' + JSON.stringify(cHid));
  console.log('§WALKED-EXPORT CARRY-OFF (' + sum(cOff) + ') ' + JSON.stringify(cOff));
  const nE = walk.placed.ELEC || 0, nF = walk.placed.FP || 0;
  if (!done || !nE || !nF) { console.log('§W-WALKED-EXPORT INCONCLUSIVE walk did not place ELEC and FP (done=' + done + ' ELEC=' + nE + ' FP=' + nF + ')'); await br.close(); srv.close(); process.exit(0); }
  const proxy = c => Object.keys(c).filter(k => /IfcBuildingElementProxy$/.test(k)).reduce((a, k) => a + c[k], 0);
  ok('X1 walked ELEC fixtures: IfcLightFixture under discipline ELEC, one row per placement', cPost['ELEC/IfcLightFixture'] === nE, 'placed=' + nE + ' exported ELEC/IfcLightFixture=' + (cPost['ELEC/IfcLightFixture'] || 0));
  ok('X2 walked FP fixtures: IfcFireSuppressionTerminal under discipline FP, one row per placement', cPost['FP/IfcFireSuppressionTerminal'] === nF, 'placed=' + nF + ' exported FP/IfcFireSuppressionTerminal=' + (cPost['FP/IfcFireSuppressionTerminal'] || 0));
  ok('X3 no walked fixture is left as a Proxy (PRE had ' + proxy(cPre) + ')', proxy(cPost) === proxy(cPre), 'proxy rows PRE=' + proxy(cPre) + ' POST=' + proxy(cPost));
  ok('X5 falsifier: with the walked ops\' _dw hidden the same export puts them back as Proxy rows (X1-X3 can fail)', proxy(cHid) - proxy(cPre) >= nE + nF && !(cHid['ELEC/IfcLightFixture']), 'hidden-run proxy=' + proxy(cHid) + ' ELEC/IfcLightFixture=' + (cHid['ELEC/IfcLightFixture'] || 0));
  // X6/X7/X8 (M-3(b))
  const lostIn = (c) => Object.keys(cPre).filter(k => (c[k] || 0) < cPre[k]).map(k => k + ' ' + cPre[k] + '->' + (c[k] || 0));
  const lost = lostIn(cPost), lostOff = lostIn(cOff);
  ok('X6 every PRE discipline/class is carried through reopen + Walk ALL + export at its PRE count (' + Object.keys(cPre).length + ' classes, ' + sum(cPre) + ' rows)', lost.length === 0 && Object.keys(cPre).length >= 10, lost.length ? 'LOST ' + lost.join(', ') : 'none lost; Member ' + cPost['STR/IfcMember'] + ' Footing ' + cPost['STR/IfcFooting'] + ' Fan ' + cPost['ACMV/IfcFan'] + ' Beam ' + cPost['STR/IfcBeam'] + ' Column ' + cPost['STR/IfcColumn'] + ' OpeningElement ' + cPost['ARC/IfcOpeningElement']);
  ok('X7 no doubling: authored beams/columns are not exported twice (the skeleton walk is skipped where authored bodies are carried)', cPost['STR/IfcBeam'] === cPre['STR/IfcBeam'] && cPost['STR/IfcColumn'] === cPre['STR/IfcColumn'], 'IfcBeam PRE=' + cPre['STR/IfcBeam'] + ' POST=' + cPost['STR/IfcBeam'] + ' (carry off: ' + cOff['STR/IfcBeam'] + '), IfcColumn PRE=' + cPre['STR/IfcColumn'] + ' POST=' + cPost['STR/IfcColumn'] + ' (carry off: ' + cOff['STR/IfcColumn'] + ')');
  ok('X8 falsifier: the same session exported with the carry OFF loses classes (X6 can fail) and the walked fixtures are unaffected', lostOff.length >= 4 && ['STR/IfcMember', 'STR/IfcFooting', 'ACMV/IfcFan'].every(k => !cOff[k]) && cOff['ELEC/IfcLightFixture'] === nE, 'carry-off LOST ' + lostOff.join(', '));
  const q = (f, sql) => { const d = new Database(f, { readonly: true }); const r = d.prepare(sql).get(); d.close(); return r; };
  const gU = q(postDb, 'select count(*) n, count(distinct guid) u from elements_meta'), fills = [q(preDb, 'select count(*) n from rel_fills_host').n, q(postDb, 'select count(*) n from rel_fills_host').n];
  const preNon = new Database(preDb, { readonly: true }).prepare("select guid from elements_meta where discipline<>'ARC' or ifc_class='IfcOpeningElement'").all().map(r => r.guid), pdb = new Database(postDb, { readonly: true }), postG = new Set(pdb.prepare('select guid from elements_meta').all().map(r => r.guid)); pdb.close();
  ok('X6b identity: every GlobalId unique in POST, each carried body keeps its PRE GlobalId, and the opening->host/filling rows (rel_fills_host) come back (carried as cuts built from the rel rows)', gU.n === gU.u && preNon.every(g => postG.has(g)) && fills[0] > 0 && fills[1] === fills[0], 'rows=' + gU.n + ' distinct=' + gU.u + ' carriedGuidsKept=' + preNon.filter(g => postG.has(g)).length + '/' + preNon.length + ' rel_fills_host PRE=' + fills[0] + ' POST=' + fills[1]);
  const bb = (f) => { const d = new Database(f, { readonly: true }), o = {}; d.prepare('select guid,minX,maxX,minY,maxY,minZ,maxZ from element_world_bbox').all().forEach(r => o[r.guid] = [r.minX, r.maxX, r.minY, r.maxY, r.minZ, r.maxZ]); d.close(); return o; };
  const bPre = bb(preDb), bPost = bb(postDb); let worst = 0, cmp = 0; preNon.forEach(g => { if (bPre[g] && bPost[g]) { cmp++; bPre[g].forEach((v, i) => { worst = Math.max(worst, Math.abs(v - bPost[g][i])); }); } });
  ok('X6c carried bodies keep their place: world bbox PRE = POST within 1 cm for every carried GlobalId', cmp >= 300 && worst < 0.01, 'compared=' + cmp + '/' + preNon.length + ' worst deviation=' + worst.toExponential(2) + ' m');
  if (process.env.M3B_RESEED_TRIAL) showTrial(await reseedTrial(pg, 'shed (local .db)'));
  const grew = Object.keys(cPost).filter(k => (cPost[k] || 0) > (cPre[k] || 0)).map(k => k + ' ' + (cPre[k] || 0) + '->' + cPost[k]);
  console.log('§WALKED-EXPORT classes added by the walk: ' + grew.join(', '));
  // X4 the Viewer
  const dst = path.join(ROOT, 'viewer', 'buildings'), fv = path.join(dst, '_w_m3_test.db'); fs.copyFileSync(postDb, fv);
  const p2 = await br.newPage(); await p2.setViewport({ width: 1280, height: 720 }); p2.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR viewer ' + String(e).slice(0, 200)); });
  await p2.goto(base + '/viewer/viewer.html?db=buildings/_w_m3_test.db', { waitUntil: 'load', timeout: 120000 }); let t = ''; for (let i = 0; i < 120; i++) { await sleep(1000); t = await p2.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)); if (/DONE/.test(t)) break; }
  try { fs.unlinkSync(fv); } catch (e) { }
  ok('X4 the Viewer opens the walked export as the building (its element count excludes IfcOpeningElement rows, the Viewer\'s own rule), 0 page errors', new RegExp('DONE.*' + (sum(cPost) - (cPost['ARC/IfcOpeningElement'] || 0)) + ' elements').test(t) && errs.length === 0, t.slice(0, 120) + ' pageErrors=' + errs.length + ' (modeller ' + modErrs + ')');
  // ── X9 resident leg: Duplex Open -> Export, carry off (= main) vs on
  const rp = await mk(); await rp.click('#b-open'); await rp.waitForSelector('#m-open-panel .mo-row[data-key="Duplex"]', { visible: true }); await rp.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await rp.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady && !!window.__dwGeoBuf', { timeout: 240000 }).catch(() => { }); await rp.evaluate(async () => { await window.__arcSeedReady; }); await sleep(4000);
  const rSc = await rp.evaluate(() => ({ meshes: window.Bonsai.group().children.length, ops: window.Bonsai.oplog.length }));
  const rOff = await expo(rp, false, true), rOn = await expo(rp, false, false); const dOff = path.join(tmp, 'duplex_off.db'), dOn = path.join(tmp, 'duplex_on.db'); fs.writeFileSync(dOff, Buffer.from(rOff.db, 'latin1')); fs.writeFileSync(dOn, Buffer.from(rOn.db, 'latin1'));
  const rcOff = cen(dOff), rcOn = cen(dOn), truth = (() => { const d = new Database(path.join(ROOT, 'modeller', 'Duplex_ARC.db'), { readonly: true }); const o = {}; d.prepare("select m.discipline, m.ifc_class, count(*) n from elements_meta m join element_transforms t on t.guid=m.guid join element_instances i on i.guid=m.guid where m.discipline<>'ARC' group by 1,2").all().forEach(r => o[r.discipline + '/' + r.ifc_class] = r.n); d.close(); return o; })();
  console.log('§WALKED-EXPORT RESIDENT Duplex carry-off (' + sum(rcOff) + ') ' + JSON.stringify(rcOff)); console.log('§WALKED-EXPORT RESIDENT Duplex carry-on  (' + sum(rcOn) + ') ' + JSON.stringify(rcOn)); console.log('§WALKED-EXPORT RESIDENT Duplex node truth, non-ARC rows with a body in modeller/Duplex_ARC.db: ' + JSON.stringify(truth) + ' | scene meshes=' + rSc.meshes + ' op-log rows=' + rSc.ops);
  const arcOf = c => Object.keys(c).filter(k => /^ARC\//.test(k)).reduce((a, k) => a + c[k], 0), nonArcOn = Object.keys(rcOn).filter(k => !/^ARC\//.test(k)), truthN = Object.values(truth).reduce((a, b) => a + b, 0);
  if (!sum(rcOff) || !truthN) console.log('§W-WALKED-EXPORT INCONCLUSIVE resident leg: nothing exported or no non-ARC truth (off=' + sum(rcOff) + ' truth=' + truthN + ')');
  else ok('X9 resident (Duplex): same rule - ARC rows unchanged, the resident DB\'s own non-ARC bodies are exported (off ' + sum(rcOff) + ' -> on ' + sum(rcOn) + ')', arcOf(rcOn) === arcOf(rcOff) && nonArcOn.length === Object.keys(truth).length && Object.keys(truth).every(k => rcOn[k] === truth[k]) && !Object.keys(rcOff).some(k => !/^ARC\//.test(k)), 'ARC off=' + arcOf(rcOff) + ' on=' + arcOf(rcOn) + '; non-ARC on=' + nonArcOn.map(k => k + ' ' + rcOn[k]).join(', '));
  // ── X11 P-X IFC open (the same rule on the third door)
  await rp.close(); const ip = await mk(); await ip.click('#b-open'); await ip.waitForSelector('#m-open-panel .mo-row[data-ifc="Duplex-IFC"]', { visible: true }); await ip.click('#m-open-panel .mo-row[data-ifc="Duplex-IFC"]');
  await ip.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await ip.evaluate(async () => { await window.__arcSeedReady; }); await sleep(4000);
  const itruth = await ip.evaluate(() => { const d = new window.SQL.Database(new Uint8Array(window.__dwBuf)), o = {}; const r = d.exec("select m.discipline||'/'||m.ifc_class, count(*) from elements_meta m join element_transforms t on t.guid=m.guid join element_instances i on i.guid=m.guid where m.discipline<>'ARC' group by 1"); if (r.length) r[0].values.forEach(v => o[v[0]] = v[1]); d.close(); return o; });
  const iOff = await expo(ip, false, true), iOn = await expo(ip, false, false), fOff = path.join(tmp, 'ifc_off.db'), fOn = path.join(tmp, 'ifc_on.db'); fs.writeFileSync(fOff, Buffer.from(iOff.db, 'latin1')); fs.writeFileSync(fOn, Buffer.from(iOn.db, 'latin1'));
  const icOff = cen(fOff), icOn = cen(fOn), itN = Object.values(itruth).reduce((a, b) => a + b, 0);
  console.log('§WALKED-EXPORT IFC-OPEN Duplex-IFC carry-off (' + sum(icOff) + ') -> carry-on (' + sum(icOn) + '); DB truth non-ARC bodies ' + JSON.stringify(itruth));
  if (!sum(icOff) || !itN) console.log('§W-WALKED-EXPORT INCONCLUSIVE IFC-open leg: nothing exported or no non-ARC truth (off=' + sum(icOff) + ' truth=' + itN + ')');
  else ok('X11 IFC open (P-X): ARC rows unchanged, the opened DB\'s own non-ARC bodies are exported (off ' + sum(icOff) + ' -> on ' + sum(icOn) + ')', arcOf(icOn) === arcOf(icOff) && Object.keys(itruth).every(k => icOn[k] === itruth[k]) && Object.keys(icOn).filter(k => !/^ARC\//.test(k)).length === Object.keys(itruth).length, 'ARC off=' + arcOf(icOff) + ' on=' + arcOf(icOn) + '; non-ARC on=' + Object.keys(icOn).filter(k => !/^ARC\//.test(k)).map(k => k + ' ' + icOn[k]).join(', '));
  await ip.close();
  if (process.env.M3B_HEAVY) {
    const hp = await mk(); await hp.click('#b-open'); await hp.waitForSelector('#m-open-panel .mo-row[data-key="Hospital"]', { visible: true }); await hp.click('#m-open-panel .mo-row[data-key="Hospital"]');
    await hp.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 600000 }); await hp.evaluate(async () => { await window.__arcSeedReady; }); await sleep(8000);
    const hs = await hp.evaluate(() => ({ meshes: window.Bonsai.group().children.length, ops: window.Bonsai.oplog.length, heap: Math.round(performance.memory.usedJSHeapSize / 1048576) }));
    // census INSIDE the page (the 158 MB DB is not shipped over CDP: the page is rendering 14k meshes in software and that transfer stalls)
    const t1 = Date.now(), hc0 = await hp.evaluate(async () => { const r = await window.Bonsai.exportViewerDb({ download: false, carry: true }), d = new window.SQL.Database(r.bytes), o = {}; d.exec('select discipline||"/"||ifc_class, count(*) from elements_meta group by 1')[0].values.forEach(v => o[v[0]] = v[1]); d.close(); return o; }), tOn = Date.now() - t1; const hc = hc0;
    const htk = (() => { const d = new Database(path.join(ROOT, 'modeller', 'Hospital_ARC.db'), { readonly: true }); const o = {}; d.prepare("select m.discipline d, m.ifc_class c, count(*) n from elements_meta m join element_transforms t on t.guid=m.guid join element_instances i on i.guid=m.guid where m.discipline<>'ARC' group by 1,2").all().forEach(r => o[r.d + '/' + r.c] = r.n); d.close(); return o; })();
    const ht = Object.values(htk).reduce((a, b) => a + b, 0), hNon = Object.keys(htk).reduce((a, k) => a + (hc[k] || 0), 0);   // the extractor files a few ARC-seeded classes outside ARC (DISC_MAP), so judge the DB's own non-ARC keys
    console.log('§WALKED-EXPORT HEAVY Hospital open: scene meshes=' + hs.meshes + ' op-log rows=' + hs.ops + ' heapMB=' + hs.heap + ' | export ms=' + tOn + ' rows=' + Object.values(hc).reduce((x, y) => x + y, 0) + ' non-ARC rows=' + hNon + ' (DB truth with body ' + ht + ')');
    ok('X10 Hospital_ARC: the DB\'s own non-ARC bodies (per discipline/class) are all exported, and Open added no scene mesh/op-log row for them (scene ' + hs.meshes + ' = op-log ' + hs.ops + ')', Object.keys(htk).every(k => hc[k] === htk[k]) && ht > 7000 && hs.meshes === hs.ops, 'carried=' + hNon + ' truth=' + ht + ' ' + JSON.stringify(htk));
  }
  await br.close(); srv.close();
  console.log('§W-WALKED-EXPORT ' + (fails ? 'FAIL ' + fails : judged ? 'PASS' : 'INCONCLUSIVE')); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§FAIL W-WALKED-EXPORT crashed ' + (e && e.stack || e)); process.exit(1); });
