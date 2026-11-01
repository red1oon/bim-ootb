#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ANALYTICAL-IFC: prompts/DXF2BIM_ARCHITECT_REVIEW.md §D105. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the analytical model (§D103) was built from the converter's in-memory bodies, so it worked only for a converted 2D set and nobody could say the IFC carries
 * enough. If the model is built from the IFC alone (IFC -> the shared extractor -> Dxf2Analytical.fromDb -> build), then (P1) the DXF route through the IFC must give the SAME model.std and
 * analytical.json the retired direct route gave, (P2) any other IFC on this machine must go through the same code and say honestly what it states and what it lacks, (P3) taking a fact out of the
 * IFC must make its finding appear and never a guessed value, (P4) the old W-ANALYTICAL claims hold on this route (that witness now runs through the IFC).
 *   P1 PARITY: the shed through the IFC = the FROZEN direct-route fixture (modeller/tests/fixtures/analytical_shed_direct.std / .json, written by the retired route + the two build-level changes named in
 *      §D105 RESULT): model.std AND analytical.json byte-identical; and the direct route is gone (no build(R.els…) call in the CLI or the page)
 *   P2 OTHER IFCs: every IFC found on this machine (list below; none downloaded, none committed) -> per model: members by class, joints, supports, dangling, sections stated / from the box / assumed / missing,
 *      f'c stated / missing. INCONCLUSIVE where the model states no section; the invariant "every member end is a support, shared, or a listed dangling end" must hold on every model that builds
 *   P3 FALSIFIER: (a) f'c property renamed away in the shed IFC -> 131 findings, no concrete E; (b) the Size_ properties renamed away -> the column sections come from the box (same numbers, source text changes);
 *      (c) the whole evidence pset renamed away (a plain IFC) -> still builds, f'c findings, SourceGuid gone (IFC GlobalId used)
 *      (d) §D106 (session 17 review): the members' stated material renamed to "Timber section" -> no member is written as STEEL; each such bar body gets a material_unknown finding and no E
 *          (before §D106 every IfcMember was steel whatever its material); the member count is unchanged
 *   P2 with no other IFC on the machine prints §INCONCLUSIVE and is not counted as a PASS (PRIMAL LAW 4)
 *   P5 (U6) THE PAGE: Export ▸ Analytical model on the converted shed, and on a fresh page from the shed's .ifc chosen in the file chooser -> both .std = the fixture byte for byte; 0 page errors (BROWSER=0: not judged, printed)
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> MISSING input (exit 2). P2 models: IFC_MODELS (colon-separated paths) else the built-in list; a missing file is reported SKIPPED.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2bim_cli.js')), AN = require(path.join(M, 'dxf2analytical.js')), LS = require(path.join(M, 'load_summary.js'));
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
const files = fs.existsSync(MK) ? fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f)) : [];
if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets in ' + MK + ' (SHED_MARKED), found ' + files.length); process.exit(2); }
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const HOME = os.homedir(), SRC = path.join(HOME, 'bim-compiler');
const MODELS = (process.env.IFC_MODELS ? process.env.IFC_MODELS.split(':') : [
  path.join(SRC, 'reference/infrastructure/Building-Structural.ifc'), path.join(SRC, 'internal/UNMERGED/opensourceBIM_HHS_Office_construction2.ifc'), path.join(SRC, 'internal/UNMERGED/Ifc4_Revit_STR.ifc'),
  path.join(SRC, 'internal/sources/Ifc2x3_Duplex_Architecture.ifc'), path.join(SRC, 'internal/sources/Ifc4_SampleHouse.ifc'), path.join(SRC, 'internal/UNMERGED/Clinic_Structural_IFC2x3.ifc')]);
(async () => {
  const WI = require('web-ifc'), api = new WI.IfcAPI(); await api.Init(); const SQL = await require('sql.js')(), Core = require(path.join(M, 'dxf2bim', 'ifc_extract_core.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w_analytical_ifc_'));
  const r1 = C.run(C.parseArgs(['--sheets', ...files, '--out', tmp, '--pack', 'pwd2024_bd', '--complete']), () => {}), R = r1.out.gate.R, values = {}, sources = {};
  R.defaults_table.forEach(x => { values[x.key] = x.value; sources[x.key] = x.source; });
  const via = bytes => AN.fromIfc({ ifcBytes: bytes, WebIFC: WI, ifcApi: api, SQL, Core, LS, values, sources });
  const built = await C.buildIfc(r1), bytes = new Uint8Array(built.bytes), m1 = await via(bytes);

  // P1
  const FX = path.join(__dirname, 'fixtures'), fStd = fs.readFileSync(path.join(FX, 'analytical_shed_direct.std'), 'utf8'), fJs = fs.readFileSync(path.join(FX, 'analytical_shed_direct.json'), 'utf8');
  const std = AN.toStaad(m1), js = AN.toJSON(m1), firstDiff = (a, b) => { const A = a.split('\n'), B = b.split('\n'); for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) return 'line ' + (i + 1) + ': ' + String(A[i]).slice(0, 80) + ' | ' + String(B[i]).slice(0, 80); return 'none'; };
  console.log('  ' + m1.log[0] + '\n  ' + m1.log[1].slice(0, 260));
  console.log('  P1 model.std ' + Buffer.byteLength(std) + ' bytes vs fixture ' + Buffer.byteLength(fStd) + ' (first difference: ' + firstDiff(std, fStd) + '); analytical.json ' + Buffer.byteLength(js) + ' vs ' + Buffer.byteLength(fJs) + ' (first difference: ' + firstDiff(js, fJs) + ')');
  const cliSrc = fs.readFileSync(path.join(M, 'dxf2bim_cli.js'), 'utf8'), pageSrc = fs.readFileSync(path.join(M, 'modeller.html'), 'utf8'), direct = /\.build\(\s*R\.els/;
  ok('P1 PARITY: the shed through the IFC = the retired direct route: model.std ' + Buffer.byteLength(std) + ' bytes and analytical.json ' + Buffer.byteLength(js) + ' bytes byte-identical; no direct build(R.els) call remains in the CLI or the page',
    std === fStd && js === fJs && !direct.test(cliSrc) && !/Dxf2Analytical\.build\(\s*R\.els/.test(pageSrc) && /fromIfc/.test(cliSrc), '');

  // P3
  const txt = Buffer.from(bytes).toString('latin1'), strip = (names) => new Uint8Array(Buffer.from(names.reduce((t, n) => t.split("'" + n + "'").join("'" + n.slice(0, -1) + "_'"), txt), 'latin1'));
  const secFrom = (m, cls) => Array.from(new Set(m.members.filter(q => q.class === cls).map(q => m.sections[q.section].from)));
  const a = await via(strip(['Note_fc_MPa'])), fcF = a.findings.filter(f => f.code === 'fc_missing').length, concA = Object.keys(a.materials).filter(k => /^CONC/.test(k)).length;
  ok('P3a f\'c renamed away in the shed IFC: ' + fcF + ' fc_missing findings (one per concrete member), concrete materials ' + concA + ' (E not guessed), steel kept, members unchanged ' + a.members.length + ' = ' + m1.members.length, fcF === 131 && concA === 0 && !!a.materials.STEEL && a.members.length === m1.members.length, '');
  const b = await via(strip(['Size_x', 'Size_y', 'Size_w', 'Size_d'])), colFrom = secFrom(b, 'IfcColumn').join(' / '), colFrom1 = secFrom(m1, 'IfcColumn').join(' / ');
  const boxOnly = Object.keys(b.sections).filter(k => b.sections[k].kind === 'rect').every(k => /box/.test(b.sections[k].from));
  ok('P3b Size_ properties renamed away: the rectangle sections now say "' + colFrom + '" (was "' + colFrom1 + '"); the member count is unchanged (' + b.members.length + '), every rect section is sourced to the box', boxOnly && /box/.test(colFrom) && /stated size/.test(colFrom1) && b.members.length === m1.members.length, '');
  const c = await via(strip(['SourceGuid', 'Kind', 'Note_fc_MPa', 'SourceHandle', 'SourceSheet', 'Z0', 'Z1', 'Size_x', 'Size_y', 'Size_w', 'Size_d', 'Size_t']));
  console.log('  P3c evidence names renamed away: ' + c.log[1].slice(0, 200));
  ok('P3c a plain IFC (no SourceGuid / Kind / handles / f\'c / sizes): still builds ' + c.members.length + ' members, GlobalId used as the guid (' + (c.members[0] && c.members[0].guid.length) + ' chars), f\'c findings ' + c.findings.filter(f => f.code === 'fc_missing').length + ', no refusal',
    !c.refused && c.members.length > 0 && c.members.every(q => q.guid.length === 22) && c.findings.some(f => f.code === 'fc_missing'), '');

  const steelBars = new Set(m1.members.filter(q => q.material === 'STEEL').map(q => q.guid)).size;
  const dd = await via(new Uint8Array(Buffer.from(txt.split("'Steel section'").join("'Timber section'"), 'latin1'))), steelD = dd.members.filter(q => q.material === 'STEEL').length;
  const unkD = dd.findings.filter(f => f.code === 'material_unknown' && /Timber section/.test(f.message)).length;
  console.log('  P3d members as timber: STEEL members ' + steelD + ' (was ' + m1.members.filter(q => q.material === 'STEEL').length + '), material_unknown findings ' + unkD + ' = steel bar bodies ' + steelBars + ', materials ' + Object.keys(dd.materials).join(','));
  ok('P3d the members stated as "Timber section": 0 written as STEEL, ' + unkD + ' material_unknown findings (one per bar body, ' + steelBars + '), no STEEL material, members unchanged ' + dd.members.length + ' = ' + m1.members.length,
    steelBars > 0 && steelD === 0 && unkD === steelBars && !dd.materials.STEEL && dd.members.length === m1.members.length, '');

  // P2
  console.log('  P2 other IFCs (IFC_MODELS to override the list):');
  const rows = []; let allInvariant = true, ran = 0;
  for (const f of MODELS) {
    const name = path.basename(f);
    if (!fs.existsSync(f)) { rows.push({ name, verdict: 'SKIPPED (file not on this machine)' }); continue; }
    const t0 = Date.now(), reg = C.registryValues();
    let m; try { m = await AN.fromIfc({ ifcBytes: new Uint8Array(fs.readFileSync(f)), WebIFC: WI, ifcApi: api, SQL, Core, LS, values: reg.values, sources: reg.sources }); } catch (e) { rows.push({ name, verdict: 'ERROR ' + String(e && e.message).slice(0, 80) }); allInvariant = false; continue; }
    ran++;
    if (m.refused) { rows.push({ name, verdict: 'INCONCLUSIVE (refused: ' + m.refused + ')', elements: m.input ? m.input.elements : 0, members: 0, by: {}, joints: 0, supports: 0, dangling: 0, stated: 0, box: 0, asm: 0, noSec: 0, fcOk: 0, fcMiss: 0, left: 0, secs: ((Date.now() - t0) / 1000).toFixed(1) }); continue; }
    const by = {}; m.members.forEach(q => { by[q.class] = (by[q.class] || 0) + 1; });
    const secs = Object.keys(m.sections).map(k => m.sections[k]), cnt = re => secs.filter(s => re.test(s.from)).reduce((n, s) => n + s.members, 0);
    const stated = cnt(/stated size|label/), box = cnt(/box/), asm = cnt(/assumed/), noSec = m.findings.filter(x => x.code === 'no_section').length;
    const concM = m.members.filter(q => q.class !== 'IfcMember').length, fcOk = m.members.filter(q => q.material && /^CONC/.test(q.material)).length, fcMiss = m.findings.filter(x => x.code === 'fc_missing').length;
    const deg = {}; m.members.forEach(q => { deg[q.n1] = (deg[q.n1] || 0) + 1; deg[q.n2] = (deg[q.n2] || 0) + 1; });
    const sup = new Set(m.supports.map(s => s.node)), listed = new Set(m.dangling.map(d => d.node)), inv = Object.keys(deg).map(Number).every(n => sup.has(n) || deg[n] >= 2 || listed.has(n));
    if (m.members.length && !inv) allInvariant = false;
    const verdict = m.refused ? 'INCONCLUSIVE (refused: ' + m.refused + ')' : stated === 0 ? 'INCONCLUSIVE (no section stated: ' + box + ' from the geometry box, ' + asm + ' assumed, ' + noSec + ' with none)' : 'MODEL';
    rows.push({ name, elements: m.input.elements, members: m.members.length, by, joints: m.nodes.length, supports: m.supports.length, dangling: m.dangling.length, stated, box, asm, noSec, fcOk, fcMiss, left: m.leftOut.length, verdict, secs: ((Date.now() - t0) / 1000).toFixed(1) });
  }
  rows.forEach(r => console.log(r.members === undefined ? '     ' + r.name + ': ' + r.verdict : '     ' + r.name + ': elements ' + r.elements + ', members ' + r.members + ' ' + JSON.stringify(r.by) + ', joints ' + r.joints + ', supports ' + r.supports + ', dangling ' + r.dangling +
    ', sections stated ' + r.stated + ' / box ' + r.box + ' / assumed ' + r.asm + ' / none ' + r.noSec + ', f\'c on ' + r.fcOk + ' members, missing ' + r.fcMiss + ', leftOut ' + r.left + ' -> ' + r.verdict + ' (' + r.secs + ' s)'));
  const withMembers = rows.filter(r => r.members > 0).length;
  if (!ran) console.log('  §INCONCLUSIVE P2 no other IFC on this machine: nothing judged, not counted as a PASS');
  else ok('P2 ' + ran + ' other IFC(s) went through the same code (' + withMembers + ' with members); the joint invariant holds on every one; INCONCLUSIVE verdicts are printed above, not hidden', allInvariant && rows.every(r => !/^ERROR/.test(r.verdict)), '');
  // P5 (U6) the page
  if (process.env.BROWSER === '0') console.log('§ANALYTICAL_PAGE_SKIP BROWSER=0 — P5 not judged');
  else { const ifcPath = path.join(tmp, 'shed.ifc'); fs.writeFileSync(ifcPath, Buffer.from(bytes));
    try { await page5(ifcPath, fStd); } catch (e) { ok('P5 THE PAGE', false, 'crash ' + String(e && e.stack || e).slice(0, 300)); } }
  console.log((fail ? '§W-ANALYTICAL-IFC FAIL ' + fail : judged ? '§W-ANALYTICAL-IFC PASS ' + judged + '/0' + (ran ? '' : ' (P2 INCONCLUSIVE)') : '§W-ANALYTICAL-IFC INCONCLUSIVE nothing judged'));
  process.exit(fail ? 1 : 0);
})();
async function page5(ifcPath, fStd) {
  const http = require('http'), ROOT = path.join(__dirname, '..', '..'), puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(buf); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), errs = [];
  const URLx = 'http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html';
  const open = async () => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 }); pg.on('pageerror', e => { errs.push(String(e).slice(0, 160)); console.log('§PAGEERR ' + String(e).slice(0, 160)); });
    pg.on('console', m => { const t = m.text(); if (/^§ANALYTICAL members/.test(t)) console.log('  page ' + t.slice(0, 160)); });
    await pg.evaluateOnNewDocument(() => { const o = URL.createObjectURL.bind(URL); window.__blobs = []; URL.createObjectURL = b => { if (b instanceof Blob) window.__blobs.push(b); return o(b); }; });
    await pg.goto(URLx, { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI', { timeout: 120000 }); return pg; };
  const stdOf = async (pg, chooseFile) => {
    const n0 = await pg.evaluate(() => window.__blobs.length), ch = chooseFile ? pg.waitForFileChooser({ timeout: 120000 }).then(c => c.accept([chooseFile])) : null;
    const dis = await pg.evaluate(() => document.getElementById('b-export').disabled); if (dis) throw new Error('#b-export is disabled: Export ▸ Analytical model unreachable');
    await pg.click('#b-export');
    await pg.waitForSelector('#m-export-panel .me-row[data-key="analytical"]', { visible: true }); await pg.click('#m-export-panel .me-row[data-key="analytical"]'); if (ch) await ch;
    await pg.waitForFunction(n => window.__blobs.length > n && window.__blobs[window.__blobs.length - 1].type === 'text/plain', { timeout: 300000, polling: 500 }, n0);
    return pg.evaluate(async () => ({ txt: await window.__blobs[window.__blobs.length - 1].text(), stat: (document.getElementById('stat') || {}).textContent || '' })); };
  try {
    const pg = await open(); await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 });
    await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 2500));
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 180000 }); await new Promise(r => setTimeout(r, 1500));
    const a = await stdOf(pg, null);
    const pg2 = await open(), b = await stdOf(pg2, ifcPath);
    console.log('  P5 set route ' + Buffer.byteLength(a.txt) + ' bytes, status "' + a.stat.slice(0, 120) + '"; fresh page + chosen .ifc ' + Buffer.byteLength(b.txt) + ' bytes; fixture ' + Buffer.byteLength(fStd));
    ok('P5 THE PAGE Export ▸ Analytical model: the converted set -> ' + Buffer.byteLength(a.txt) + ' bytes, a fresh page + the shed .ifc -> ' + Buffer.byteLength(b.txt) + ' bytes, both = the fixture byte for byte; status names 337 / 319 / 32; page errors ' + errs.length,
      a.txt === fStd && b.txt === fStd && /members=337\s+joints=319\s+supports=32/.test(a.stat) && errs.length === 0, '');
  } finally { await br.close(); srv.close(); }
}
