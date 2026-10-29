#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-L29 (prompts/DXF2BIM_MODELLER_LANE.md §L29): details-sheet notes + the below-grade column, on the REAL shed sheets (SKIP without them). READ THE LOG; exit code alone is not evidence.
// Issues proved/disproved: N1-N4 a details sheet's stated grades and casting ratios reach exactly the bodies they name (and a set without the sheet carries none); H1-H3 the below-grade column exists only when its section is stated, stands from the footing top to grade.
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_l29.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const CLI = path.join(__dirname, '..', 'dxf2bim_cli.js'), SHD = path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets') + '/';
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + ' ' + (m || '')); if (!c) fails++; };
if (!fs.existsSync(SHD + '5_DETAILS.dxf')) { console.log('§SKIP W-L29 no real sheets at ' + SHD); process.exit(0); }
const DP = require('dxf-parser'), N = require('../dxf2notes.js');
const rows = N.read([{ name: '5_DETAILS.dxf', dxf: new (DP.default || DP)().parseSync(fs.readFileSync(SHD + '5_DETAILS.dxf', 'utf8')) }]).rows.map(r => r.key + '=' + r.value + '@' + r.kinds.join('+')).sort();
ok('N1 notes reader: exactly fc, fy, two casting ratios', JSON.stringify(rows) === JSON.stringify(['CastingRatio=1:1.5:3@gradebeam+footing+column', 'CastingRatio=1:2:4@slab', 'fc_MPa=24@concrete', 'fy_MPa=500@concrete']), JSON.stringify(rows));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l29-'));
const base = ['0_FLOOR_PLAN', '1S_ELEV_SOUTH', '1N_ELEV_NORTH', '2_ELEV_WEST', '7_ELEV_EAST', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '8_SECTION_AA_TRUSS'];
const run = (name, extraSheets, extra) => { const o = path.join(dir, name), r = cp.spawnSync('node', [CLI, '--sheets'].concat(base.concat(extraSheets).map(n => SHD + n + '.dxf'), ['--out', o, '--complete', '--ifc', '--accept-suggestions', '--set', 'SHED', '--level', '0',
  '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '1N_ELEV:0.6096@-3895.2', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--datum', '8_SECTION:0.6096@-3726.416',
  '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--layer', 'elev:Wall=panel', '--layer', 'elev:Rod=fan', '--layer', 'elev:Dim=net', '--layer', 'plan:Rod=doorswing@0_FLOOR', '--layer', 'section:Fo=bar', '--layer', 'elev:Win=elevdoor',
  '--bodyz', 'footing=-1.4478,-1.143', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794'], extra || []), { encoding: 'utf8' });
  const line = (r.stdout.match(/§CLI result .*/) || [''])[0]; console.log('  ' + name + ': ' + line.replace(/ out=\S+/, '') + (r.status ? ' rc=' + r.status + (r.stderr || '').slice(0, 200) : ''));
  return { line, bodies: JSON.parse(fs.readFileSync(path.join(o, 'bodies.json'), 'utf8')), ops: JSON.parse(fs.readFileSync(path.join(o, 'ops.json'), 'utf8')).inserts, ifc: fs.readFileSync(path.join(o, 'model.ifc'), 'utf8'), rc: r.status }; };
const A = run('with-details', ['5_DETAILS'], ['--default', 'synth.column.belowgrade.size=0.3556']), B = run('no-details', [], []), C = run('details-size-zero', ['5_DETAILS'], ['--default', 'synth.column.belowgrade.size=0']);
const props = r => r.ops.map(o => o.params.provenance.ifc.props), kindOf = (r, k) => props(r).filter(p => p.Kind === k);
const all = (a, f) => a.length > 0 && a.every(f);
ok('N2 accepted + scoped: concrete bodies fc 24 / fy 500; columns+footings 1:1.5:3; slab 1:2:4; beams no ratio; panels no note', A.rc === 0 && /ok=true/.test(A.line) &&
  all(['column', 'footing', 'beam', 'slab'].flatMap(k => kindOf(A, k)), p => p.Note_fc_MPa === '24' && p.Note_fy_MPa === '500' && /^5_DETAILS\.dxf#/.test(p.NoteSource_fc_MPa)) &&
  all(kindOf(A, 'column').concat(kindOf(A, 'footing')), p => p.Note_CastingRatio === '1:1.5:3') && all(kindOf(A, 'slab'), p => p.Note_CastingRatio === '1:2:4') &&
  all(kindOf(A, 'beam'), p => p.Note_CastingRatio === undefined) && all(kindOf(A, 'panel'), p => !Object.keys(p).some(k => /^Note/.test(k))), A.line.slice(0, 60));
ok('N3 control: without 5_DETAILS no body carries a Note_ prop', B.rc === 0 && !props(B).some(p => Object.keys(p).some(k => /^Note/.test(k))), 'bodies ' + B.bodies.length);
const cols = r => r.bodies.filter(b => b.kind === 'column').length;
ok('H1 size stated: 448 -> 512 bodies, columns 32 -> 96', B.bodies.length === 448 && A.bodies.length === 512 && cols(B) === 32 && cols(A) === 96, B.bodies.length + ' -> ' + A.bodies.length + ', columns ' + cols(B) + ' -> ' + cols(A));
const foot = A.bodies.filter(b => b.kind === 'footing'), bel = A.bodies.filter(b => /^synth-colbelow-/.test(b.guid)), stub = A.bodies.filter(b => /^synth-colstub-/.test(b.guid)), baseCols = A.bodies.filter(b => b.kind === 'column' && !/^synth-/.test(b.guid));
const zf = Math.max.apply(null, foot.map(f => f.z1)), mm = (a, b) => Math.abs(a - b) < 0.001;
ok('H2 below body: footing top -> base - 0.6096 within 1 mm; sizes 0.3556 stated / 0.3048 inherited', bel.length === 32 && stub.length === 32 && all(bel, b => mm(b.z0, zf) && mm(b.z1, baseCols[0].z0 - 0.6096) && b.size.x.number === 0.3556 && b.size.x.source === 'stated') && all(stub, b => mm(b.z0, baseCols[0].z0 - 0.6096) && mm(b.z1, baseCols[0].z0) && b.size.x.number === 0.3048 && b.size.x.source === 'inherited'), 'below z ' + (bel[0] && bel[0].z0) + '..' + (bel[0] && bel[0].z1));
ok('H3 control: size stated 0 (beats the schedule, §L30) -> 448 bodies, no synth-col body', C.bodies.length === 448 && !C.bodies.some(b => /^synth-col/.test(b.guid)), 'bodies ' + C.bodies.length);
ok('N4 model.ifc carries the Note_ properties', /Note_fc_MPa/.test(A.ifc) && /Note_CastingRatio/.test(A.ifc) && !/Note_fc_MPa/.test(B.ifc), 'fc rows ' + (A.ifc.match(/Note_fc_MPa/g) || []).length);
// P1 the PAGE (the real Modeller) on the marked settings sheets the CLI wrote (5_DETAILS included): accepted, Complete + Convert -> 512 inserts, the notes on a column's provenance
(async () => {
  const http = require('http'), ROOT = path.join(__dirname, '..', '..'), puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1600, height: 900 }); pg.on('pageerror', e => console.log('§PAGEERR ' + String(e).slice(0, 200)));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    const mdir = path.join(dir, 'with-details', 'marked'), files = fs.readdirSync(mdir).sort().map(f => path.join(mdir, f));
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 }); await new Promise(r => setTimeout(r, 1500));
    await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 2500));
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 });
    const r = await pg.evaluate(() => { const o = window.Bonsai.oplog._geomOps().filter(x => x.op_type === 'GEOM_INSERT'), P = x => x.parameters || x.params || {}, pr = x => (P(x).provenance && P(x).provenance.ifc && P(x).provenance.ifc.props) || {}; return { n: window.DxfImportUI.state.last.nInserts, cols: o.filter(x => pr(x).Kind === 'column').length, noted: o.filter(x => pr(x).Note_fc_MPa === '24').length, panelNoted: o.filter(x => pr(x).Kind === 'panel' && pr(x).Note_fc_MPa).length }; });
    ok('P1 page: marked sheets incl. 5_DETAILS accepted; Convert = 511 inserts (512 bodies less the one wall join, §D88 B), 96 columns, notes on concrete bodies only', r.n === 511 && r.cols === 96 && r.noted > 0 && r.panelNoted === 0, JSON.stringify(r));
  } catch (e) { ok('P1 page', false, String(e && e.stack || e).slice(0, 300)); } finally { await br.close(); srv.close(); }
  console.log('§W-L29 ' + (fails ? 'FAIL ' + fails : 'PASS')); process.exit(fails ? 1 : 0);
})();
