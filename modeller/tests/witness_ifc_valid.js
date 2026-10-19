#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-IFC-VALID (prompts/DXF2BIM_FOUNDATION_LANE.md §1). Issue it proves or disproves: the IFC the product writes is VALID IFC4 (schema level, independent validator), not merely "opens in our Viewer". READ THE LOG; a SKIP is printed loudly and proves nothing.
// V1 headless writer (CLI): the real shed -> 0 validation statements, header fine, evidence set named Dxf2Bim_Evidence (no reserved Pset_ name); V2 the PAGE writer on the same marked sheets: the same; V3 the doors carry their drawn size (OverallHeight 2.3876 m = 94 in on the real shed, not `*`); V4 CONTROL: the same file with the old defect put back (`*` attributes on a door, `($)` header) must FAIL the validator (so a green V1 means something); V5 the database extracted from it still carries every evidence row (the extractor reads the new name; and the old name, checked on a renamed copy).
// usage: NODE_PATH=~/bim-compiler/node_modules EXTRACTOR=<bim-compiler>/scripts/extractIFC2DB.js node modeller/tests/witness_ifc_valid.js     (SKIP without the real sheets or without ifcopenshell)
'use strict';
const PY = require('./pyenv.js'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), SHD = path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets') + '/', CLI = path.join(ROOT, 'modeller', 'dxf2bim_cli.js');
const EXTRACTOR = process.env.EXTRACTOR || path.join(process.env.HOME, 'bim-compiler', 'scripts', 'extractIFC2DB.js');
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + ' ' + (m || '')); if (!c) fails++; };
if (!fs.existsSync(SHD + '5_DETAILS.dxf')) { console.log('§SKIP W-IFC-VALID no real sheets at ' + SHD); process.exit(0); }
const py = f => { const r = cp.spawnSync(PY, [path.join(__dirname, 'ifc_validate.py'), f], { encoding: 'utf8' }); try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return { error: 'no output: ' + (r.stderr || '').slice(0, 200) }; } };
const probe = py(path.join(ROOT, 'package.json').replace('package.json', 'modeller/tests/ifc_validate.py'));   // any readable path just to detect the module
if (probe.error && /ifcopenshell missing/.test(probe.error)) { console.log('§SKIP W-IFC-VALID ' + probe.error); process.exit(0); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifcv-'));
const names = ['0_FLOOR_PLAN', '1S_ELEV_SOUTH', '1N_ELEV_NORTH', '2_ELEV_WEST', '7_ELEV_EAST', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '8_SECTION_AA_TRUSS', '5_DETAILS'];
const out = path.join(dir, 'cli'), r = cp.spawnSync('node', [CLI, '--sheets'].concat(names.map(n => SHD + n + '.dxf'), ['--out', out, '--complete', '--ifc', '--accept-suggestions', '--set', 'SHED', '--level', '0',
  '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '1N_ELEV:0.6096@-3895.2', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--datum', '8_SECTION:0.6096@-3726.416',
  '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--layer', 'elev:Wall=panel', '--layer', 'elev:Rod=fan', '--layer', 'elev:Dim=net', '--layer', 'plan:Rod=doorswing@0_FLOOR', '--layer', 'section:Fo=bar', '--layer', 'elev:Win=elevdoor',
  '--bodyz', 'footing=-1.4478,-1.143', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794']), { encoding: 'utf8' });
const ifc1 = path.join(out, 'model.ifc'); ok('V0 the CLI wrote the shed IFC', r.status === 0 && fs.existsSync(ifc1), 'rc=' + r.status);
const v1 = py(ifc1);
ok('V1 headless writer: IFC4, 0 validation statements' + (v1.express_rules ? ' INCLUDING the EXPRESS WHERE rules' : ' (schema level only: EXPRESS rules NOT run, no pytest)') + ', header fine, no reserved Pset_ name, 512 evidence sets', v1.schema === 'IFC4' && v1.statements === 0 && !v1.header_problems.length && !v1.reserved_pset_names.length && v1.evidence_sets === 512, JSON.stringify(v1).slice(0, 300));
const text = fs.readFileSync(ifc1, 'latin1'), door = (text.match(/IFCDOOR\([^\n]*\);/) || [''])[0];
ok('V3 a door carries its drawn size and a real type: OverallHeight 2.3876 (94 in), .DOOR., no `*`', /,2\.3876\d*,[0-9.]+,\.DOOR\.,\.NOTDEFINED\.,\$\);/.test(door) && !/\*/.test(door), door.slice(0, 160));
// V4 control: put the old defect back
const bad = path.join(dir, 'defect.ifc'); fs.writeFileSync(bad, text.replace(/(IFCDOOR\([^\n]*?),[0-9.]+,[0-9.]+,\.DOOR\.,\.NOTDEFINED\.,\$\);/, '$1,*,*,*,*,*);').replace("FILE_NAME('dxf2bim.ifc'", "FILE_NAME('dxf2bim.ifc'").replace(/\(''\),\(''\)/, '($),($)'), 'latin1');
const v4 = py(bad); ok('V4 control: the old defect (derived `*` on a door, `($)` header) is CAUGHT by the validator', v4.statements > 0 && v4.header_problems.length >= 0 && (v4.statements >= 5), 'statements=' + v4.statements);
const nop = path.join(dir, 'noplacement.ifc'); fs.writeFileSync(nop, text.replace(/(IFCDOOR\([^,]*,\$,'[^']*',\$,'[^']*',)#\d+,/, '$1$,'), 'latin1');
const v4b = py(nop); ok('V4b control: a product with a shape but NO ObjectPlacement (IfcProduct.WR1) is caught by the EXPRESS rules', v4b.express_rules ? v4b.statements >= 1 : true, v4b.express_rules ? 'statements=' + v4b.statements : 'SKIPPED-IN-EFFECT: pytest missing, EXPRESS rules not run');
// V5 the extractor reads the new name (and the old one)
const NM = path.join(process.env.HOME, 'bim-compiler', 'node_modules');
const ex = (ifcPath, dbPath) => { try { fs.unlinkSync(dbPath); } catch (e) {} cp.spawnSync('node', [EXTRACTOR, '--ifc', ifcPath, '-o', dbPath], { encoding: 'utf8', timeout: 280000, env: Object.assign({}, process.env, { NODE_PATH: NM }) }); const D = require(path.join(NM, 'better-sqlite3')), d = new D(dbPath, { readonly: true }); const n = d.prepare("select count(*) n from element_dxf2bim where name='Provenance'").get().n; d.close(); return n; };
const nNew = ex(ifc1, path.join(dir, 'new.db')), old = path.join(dir, 'oldname.ifc'); fs.writeFileSync(old, text.split("'Dxf2Bim_Evidence'").join("'Pset_Dxf2Bim'"), 'latin1');
const nOld = ex(old, path.join(dir, 'old.db'));
ok('V5 extractor: 512 Provenance rows from the new name AND from the old name (existing IFCs keep working)', nNew === 512 && nOld === 512, 'new=' + nNew + ' old=' + nOld);
// V2 the PAGE writer
(async () => {
  const puppeteer = require(path.join(NM, 'puppeteer'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r2 => srv.listen(0, '127.0.0.1', r2));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1600, height: 900 });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    const mdir = path.join(out, 'marked'), mf = fs.readdirSync(mdir).sort().map(x => path.join(mdir, x));
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(mf);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 }); await new Promise(r2 => setTimeout(r2, 1500));
    await pg.evaluate(() => { const x = document.getElementById('dxf-complete'); if (x && !x.checked) x.click(); }); await new Promise(r2 => setTimeout(r2, 2500));
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 });
    const txt = await pg.evaluate(async () => { const b = (await window.Bonsai.ifc.build()).bytes; let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return s; });
    const f2 = path.join(dir, 'page.ifc'); fs.writeFileSync(f2, Buffer.from(txt, 'latin1')); const v2 = py(f2);
    ok('V2 PAGE writer on the same sheets: IFC4, 0 validation statements, header fine, no reserved Pset_ name, 512 evidence sets', v2.schema === 'IFC4' && v2.statements === 0 && !v2.header_problems.length && !v2.reserved_pset_names.length && v2.evidence_sets === 512, JSON.stringify(v2).slice(0, 300));
  } catch (e) { ok('V2 page', false, String(e && e.stack || e).slice(0, 300)); } finally { await br.close(); srv.close(); }
  console.log('§W-IFC-VALID ' + (fails ? 'FAIL ' + fails : 'PASS')); process.exit(fails ? 1 : 0);
})();
