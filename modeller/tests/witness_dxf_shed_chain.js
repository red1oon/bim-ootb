#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SHED-CHAIN: prompts/DXF2BIM_MODELLER_LANE.md §L26. Read the log after every run; exit code is not evidence.
 * Issue proved or disproved: the WHOLE shed (the eight real sheets, 448 bodies) goes from the settings sheets through the PAGE to a 3D canvas in standard material colours with per-mesh
 * metadata, out as IFC4 -> the usual extractor DB (material name, colour, Pset_Dxf2Bim rows), and opens in the Viewer and on the 4D/5D page (boq_charts) with the same 448 elements.
 *   S1 page: open the marked sheets, tick Complete, Convert -> 448 inserts with provenance.ifc (class, type name, material, colour, props)   S2 canvas colours = the palette (8 distinct), toggle lens
 *   S3 IFC4 -> DB: 448 elements, material_name 448, rgba = the palette, element_dxf2bim Provenance 448   S4 Viewer opens the DB: 448 elements, Find IfcWall 41, screenshot
 *   S5 boq_charts (4D/5D) opens the DB: schedule tasks > 0, BOQ lines > 0   CONTROL: an IFC written without the styles gives ONE colour (the witness can see the gap)
 * Needs the local shed sheets (SKIP without) and web-ifc + sql.js (NODE_PATH).
 */
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const SHD = path.join(os.homedir(), 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets') + '/';
if (!fs.existsSync(SHD + '0_FLOOR_PLAN.dxf')) { console.log('SKIP: shed sheets not found at ' + SHD); process.exit(0); }
const { runE2E } = require('./e2e_harness');
const M = path.join(__dirname, '..'), ROOT = path.join(M, '..'), OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'shedchain-'));
const NAME = 'ShedChain_extracted.db', VDB = path.join(ROOT, 'viewer', 'buildings', NAME);
// the product CLI writes the settings sheets (the same marked DXFs the page's Save writes): the ALLARGS line of witness_dxf_cli.js C31 + the door frames
const SHEETS = ['0_FLOOR_PLAN', '1S_ELEV_SOUTH', '1N_ELEV_NORTH', '2_ELEV_WEST', '7_ELEV_EAST', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '8_SECTION_AA_TRUSS'].map(x => SHD + x + '.dxf');
const A = [path.join(M, 'dxf2bim_cli.js'), '--sheets'].concat(SHEETS, ['--out', OUT, '--complete', '--ifc', '--accept-suggestions', '--set', 'SHED', '--level', '0',
  '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '1N_ELEV:0.6096@-3895.2', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--datum', '8_SECTION:0.6096@-3726.416',
  '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--layer', 'elev:Wall=panel', '--layer', 'elev:Rod=fan', '--layer', 'elev:Dim=net', '--layer', 'plan:Rod=doorswing@0_FLOOR', '--layer', 'section:Fo=bar', '--layer', 'elev:Win=elevdoor',
  '--bodyz', 'footing=-1.4478,-1.143', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794']);
const cli = cp.spawnSync('node', A, { encoding: 'utf8' });
console.log('CLI rc=' + cli.status + ' ' + ((cli.stdout.match(/§CLI result .*/) || [''])[0]).replace(/ out=\S+/, '').slice(0, 120));
const marked = fs.readdirSync(path.join(OUT, 'marked')).sort().map(f => path.join(OUT, 'marked', f));
runE2E('W-SHED-CHAIN', async (t) => {
  const pg = t.pg, sleep = t.sleep;
  const open = async (files) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 180000 }); await sleep(1500); };
  const TM = {}; const lap = (k, t0) => { TM[k] = +((Date.now() - t0) / 1000).toFixed(2); console.log('§TIMING ' + k + ' ' + TM[k] + ' s'); };
  let T0 = Date.now(); await open(marked); lap('open_8_sheets_to_verdict', T0);
  await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await sleep(2500);
  const bodies = await pg.evaluate(() => { const g = window.DxfImportUI.state.gate; return g && g.structure ? g.structure.bodies : -1; });
  const before = await t.oplog(); T0 = Date.now();
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 120000 }); lap('convert_click_to_448_inserts', T0); await sleep(2500);
  const after = await t.oplog(), conv = await pg.evaluate(() => ({ n: window.DxfImportUI.state.last.nInserts }));
  const ops = await pg.evaluate(() => window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT').slice(-448).map(o => { const P = o.parameters || o.params || {}; const pv = P.provenance || {}; return { c: P.color, cls: P.ifc_class, ifc: pv.ifc || null, prov: pv.prov_kind || null }; }));
  const cols = {}; ops.forEach(o => { const k = o.ifc && o.ifc.material || 'none'; (cols[k] = cols[k] || new Set()).add(o.c); });
  t.assert('S1 Convert puts ' + 448 + ' inserts on the canvas, each with provenance.ifc (class, type name, material, colour, props)', bodies === 448 && conv.n === 448 && after.len - before.len === 448 && ops.length === 448 && ops.every(o => o.ifc && o.ifc.material && o.ifc.colour && o.ifc.props && o.ifc.props.Provenance), JSON.stringify({ bodies, inserts: conv.n, ops: ops.length }));
  const distinct = new Set(ops.map(o => o.c));
  t.assert('S2 the canvas colour is the material\'s standard colour: 8 distinct colours, one per material (concrete / brick / roofing / netting / fan / door / steel section / steel plate), none amber or red', distinct.size === 8 && !distinct.has(0xffb347) && !distinct.has(0xff2d2d) && Object.values(cols).every(s => s.size === 1), JSON.stringify(Object.fromEntries(Object.entries(cols).map(([k, s]) => [k, [...s].map(c => '0x' + c.toString(16))]))));
  // the canvas as the person sees it: panels closed, zoom to fit
  await pg.evaluate(() => { document.querySelectorAll('#dxf-panel .dxf-x, #dm-panel .dm-x, #dm-panel [data-act="close"]').forEach(b => b.click()); }); await sleep(500);
  const fit = await pg.$('#b-fit'); if (fit) { await fit.click(); await sleep(1500); }
  await t.shot('canvas');
  // IFC4 from the page's own writer
  T0 = Date.now();
  const ifcT = await pg.evaluate(async () => { const r = await window.Bonsai.ifc.build(); let s = ''; const b = r.bytes; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return s; });
  lap('ifc4_export_in_page', T0);
  const ifcPath = path.join(OUT, 'page.ifc'); fs.writeFileSync(ifcPath, Buffer.from(ifcT, 'latin1'));
  const nStyled = (ifcT.match(/IFCSTYLEDITEM\(/g) || []).length, nPset = (ifcT.match(/IFCPROPERTYSET\(/g) || []).length;
  t.assert('S2b the page\'s IFC4 carries a styled item and a Pset_Dxf2Bim for every product', nStyled === 448 && nPset === 448 && /Pset_Dxf2Bim/.test(ifcT), 'styledItems=' + nStyled + ' psets=' + nPset);
  // extractor (the shared core, sql.js) -> DB
  const WebIFC = require('web-ifc'), initSqlJs = require('sql.js'), Core = require(path.join(M, 'dxf2bim', 'ifc_extract_core.js'));
  const extract = async (file) => { const SQL = await initSqlJs(), api = new WebIFC.IfcAPI(); await api.Init(); const sdb = new SQL.Database();
    await Core.extractToDb({ WebIFC, ifcApi: api, ifcData: new Uint8Array(fs.readFileSync(file)), db: Core.sqljsDb(sdb), Buf: Core.browserBuf, buildingName: 'ShedChain', sourceName: path.basename(file), log: () => {} }); return sdb; };
  const q = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : []; };
  T0 = Date.now(); const db = await extract(ifcPath); lap('ifc_to_db_extract_sqljs', T0); console.log('§SIZE ifc_bytes=' + fs.statSync(ifcPath).size + ' db_bytes=' + db.export().length);
  const n = q(db, 'select count(*) n from elements_meta')[0].n, mn = q(db, 'select count(*) n from elements_meta where material_name is not null')[0].n, rg = q(db, 'select distinct material_rgba r from elements_meta').map(r => r.r), pv = q(db, "select count(*) n from element_dxf2bim where name='Provenance'")[0].n;
  t.assert('S3 IFC4 -> the usual extractor: 448 elements, material_name on all 448, material_rgba = the palette (8 distinct, not one beige), element_dxf2bim Provenance on all 448', n === 448 && mn === 448 && rg.length === 8 && !rg.includes('0.920,0.900,0.850,1.000') && pv === 448, `elements=${n} material_name=${mn} colours=${rg.length} provenance=${pv}`);
  const SQLw = await initSqlJs(); fs.writeFileSync(VDB, Buffer.from(db.export()));
  try {
    // CONTROL: the CLI/page writers without styles -> one colour (the old behaviour) — the extractor of an unstyled IFC
    const un = ifcT.replace(/#\d+=IFCSTYLEDITEM\([^;]*;\n?/g, ''); const up = path.join(OUT, 'unstyled.ifc'); fs.writeFileSync(up, Buffer.from(un, 'latin1'));
    const dbu = await extract(up), ur = q(dbu, 'select distinct material_rgba r from elements_meta').map(r => r.r);
    t.assert('S3c CONTROL the same IFC without its styled items extracts to ONE colour (the witness can see the missing colours)', ur.length === 1 && ur[0] === '0.920,0.900,0.850,1.000', JSON.stringify(ur));
    // the Viewer
    const base = pg.url().replace(/\/modeller\/.*$/, '');
    const vp = await pg.browser().newPage(); await vp.setViewport({ width: 1280, height: 860 }); const vlog = []; vp.on('console', m => { const x = m.text(); if (/^§/.test(x)) vlog.push(x); }); vp.on('pageerror', e => vlog.push('PAGEERROR ' + String(e).slice(0, 160)));
    await vp.goto(base + '/viewer/viewer.html?db=buildings/' + NAME, { waitUntil: 'load', timeout: 120000 });
    T0 = Date.now(); await vp.waitForFunction('window.APP && window.APP.db && window.APP.dbQuery', { timeout: 240000 }); await vp.waitForFunction(() => /DONE/.test(document.body.innerText || ''), { timeout: 240000 }); lap('viewer_open_to_rendered', T0); await sleep(6000);
    const vv = await vp.evaluate(() => { const r = window.APP.dbQuery("SELECT count(*) n FROM elements_meta"), w = window.APP.dbQuery("SELECT count(*) n FROM elements_meta WHERE ifc_class='IfcWall'"), c = window.APP.dbQuery("SELECT count(DISTINCT material_rgba) n FROM elements_meta"); const f = x => (x && x[0] && (x[0].n !== undefined ? x[0].n : x[0][0])) ; return { n: f(r), w: f(w), c: f(c) }; });
    await vp.screenshot({ path: path.join(OUT, 'viewer.png') }); fs.copyFileSync(path.join(OUT, 'viewer.png'), path.join(__dirname, 'e2e_shots', 'W-SHED-CHAIN-viewer.png'));
    t.assert('S4 the Viewer opens the DB: 448 elements, 41 walls, 8 distinct colours, no page error', vv.n === 448 && vv.w === 41 && vv.c === 8 && !vlog.some(l => /^PAGEERROR/.test(l)), JSON.stringify(vv) + ' ' + vlog.filter(l => /^PAGEERROR/.test(l)).join(';'));
    await vp.close();
    // 4D/5D page
    const bp = await pg.browser().newPage(); await bp.setViewport({ width: 1400, height: 900 }); const blog = []; bp.on('console', m => { const x = m.text(); if (/^§/.test(x)) blog.push(x); }); bp.on('pageerror', e => blog.push('PAGEERROR ' + String(e).slice(0, 160)));
    await bp.goto(base + '/viewer/boq_charts.html?db=buildings/' + NAME, { waitUntil: 'load', timeout: 120000 }); await sleep(20000);
    const sch = blog.filter(l => /^§SCHEDULE:/.test(l)).pop() || '', tasks = +((/(\d+) tasks/.exec(sch) || [])[1] || 0), days = +((/(\d+) calendar days/.exec(sch) || [])[1] || 0);
    await bp.screenshot({ path: path.join(__dirname, 'e2e_shots', 'W-SHED-CHAIN-4d5d.png') });
    const txt = await bp.evaluate(() => document.body.innerText.slice(0, 3000));
    t.assert('S5 the 4D/5D page (boq_charts) opens on the DB: a schedule of tasks over calendar days, no page error', tasks > 0 && days > 0 && !blog.some(l => /^PAGEERROR/.test(l)), sch + ' | ' + blog.filter(l => /^PAGEERROR/.test(l)).join(';'));
    console.log('  4D/5D page text: ' + txt.replace(/\s+/g, ' ').slice(0, 400)); await bp.close();
  } finally { try { fs.unlinkSync(VDB); } catch (e) {} }
}, { width: 1400, height: 900 });
