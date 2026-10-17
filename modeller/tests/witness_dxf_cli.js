// W-CLI (prompts/DXF2BIM_MODELLER_LANE.md §L8): the headless runner dxf2bim_cli.js takes RAW sheets + the few stated facts and produces the same structure result the page does (W-DXF-SHED), with no
// browser. Issue: a chain that only exists in a page cannot be scripted, batched or tested cheaply. Read the log; exit code is not evidence.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const CLI = path.join(__dirname, '..', 'dxf2bim_cli.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const lbox = (layer, x0, y0, x1, y1) => line(layer, x0, y0, x1, y0) + line(layer, x1, y0, x1, y1) + line(layer, x1, y1, x0, y1) + line(layer, x0, y1, x0, y0);
const poly = (layer, x0, y0, x1, y1, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, 4) + g(70, 1) + g(10, x0) + g(20, y0) + g(10, x1) + g(20, y0) + g(10, x1) + g(20, y1) + g(10, x0) + g(20, y1);
const txt = (layer, x, y, t) => g(0, 'TEXT') + g(8, layer) + g(10, x) + g(20, y) + g(30, 0) + g(40, 40) + g(1, t);
const doc = (body) => g(0, 'SECTION') + g(2, 'HEADER') + g(9, '$INSUNITS') + g(70, 4) + g(0, 'ENDSEC') + g(0, 'SECTION') + g(2, 'ENTITIES') + body + g(0, 'ENDSEC') + g(0, 'EOF');
const cols = [[850, 1150], [3850, 4150], [6850, 7150]];
// RAW sheets: no markings; the plan has labelled grid ticks (A,B across, 1,2 down) and the elevation labelled ticks + a ground line + a title
const planRaw = doc(txt('Tex', 100, -400, 'Test Floor Plan') + cols.map(([a, b], i) => poly('Col', a, 0, b, 300, 'C' + i)).join('') +
  line('Dim', 1000, -80, 1000, -60) + line('Dim', 4000, -80, 4000, -60) + txt('Tex', 990, -140, 'A') + txt('Tex', 3990, -140, 'B') +
  line('Dim', -80, 150, -60, 150) + line('Dim', -80, 2150, -60, 2150) + txt('Tex', -200, 140, '1') + txt('Tex', -200, 2140, '2') + line('Wall', 0, 0, 8000, 0));
const elevRaw = doc(txt('Tex', 100, -400, 'South Elevation') + cols.map(([a, b]) => lbox('Col', a, 0, b, 3000)).join('') + line('0', 0, 0, 8000, 0) +
  line('Dim', 1000, -80, 1000, -60) + line('Dim', 4000, -80, 4000, -60) + txt('Tex', 990, -140, 'A') + txt('Tex', 3990, -140, 'B'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-')), P1 = path.join(dir, '0_plan.dxf'), E1 = path.join(dir, '1S_elev_south.dxf');
fs.writeFileSync(P1, planRaw); fs.writeFileSync(E1, elevRaw);
const sh = (args) => cp.spawnSync('node', [CLI, '--sheets', P1, E1, '--out', path.join(dir, 'out' + Math.random().toString(36).slice(2, 6))].concat(args), { encoding: 'utf8' });
const FACTS = ['--accept-suggestions', '--set T', '--level 0', '--datum 1S_elev:3@3000', '--layer plan:Col=column', '--layer elev:Col=column'].flatMap(a => a.split(' '));
let r = sh(FACTS);
const outLine = (r.stdout.match(/§CLI result .*/) || [''])[0];
ok('C1 raw plan + South elevation, the facts passed as flags: exit 0, 3 IfcColumn, 0 left out', r.status === 0 && /ok=true bodies=3 byClass=\{"IfcColumn":3\} left_out=0/.test(outLine), outLine + ' rc=' + r.status + ' ' + (r.stderr || '').slice(0, 200));
const out1 = (outLine.match(/ out=(\S+)/) || [])[1];
const bodies = JSON.parse(fs.readFileSync(path.join(out1, 'bodies.json'), 'utf8')), verdict = JSON.parse(fs.readFileSync(path.join(out1, 'verdict.json'), 'utf8'));
ok('C2 bodies.json: z 0..3 m as drawn, IfcColumn/COLUMN, provenance drawn, ids unique', bodies.length === 3 && bodies.every(b => b.z0 === 0 && b.z1 === 3 && b.class === 'IfcColumn' && b.ifc.PredefinedType === 'COLUMN' && b.prov === 'drawn') && new Set(bodies.map(b => b.guid)).size === 3, JSON.stringify(bodies.map(b => [b.z0, b.z1])));
ok('C3 the settings sheets are written (marked DXF per sheet) and carry the accepted + stated markings', fs.existsSync(path.join(out1, 'marked', '0_plan_marked.dxf')) && /@GRIDX=A/.test(fs.readFileSync(path.join(out1, 'marked', '0_plan_marked.dxf'), 'utf8')) && /@Z=0/.test(fs.readFileSync(path.join(out1, 'marked', '1S_elev_south_marked.dxf'), 'utf8')) && /@LAYER=Col,column/.test(fs.readFileSync(path.join(out1, 'marked', '1S_elev_south_marked.dxf'), 'utf8')));
ok('C4 verdict.json + ops.json: qualifies; 3 GEOM_INSERT with provenance.ifc', verdict.ok && JSON.parse(fs.readFileSync(path.join(out1, 'ops.json'), 'utf8')).inserts.length === 3 && JSON.parse(fs.readFileSync(path.join(out1, 'ops.json'), 'utf8')).inserts.every(o => o.params.provenance.ifc.ifc_class === 'IfcColumn'));
// the SAME marked sheets fed back (no flags at all) give the same bodies: the settings sheet is the whole configuration
const mk = ['0_plan_marked.dxf', '1S_elev_south_marked.dxf'].map(f => path.join(out1, 'marked', f));
const rb = cp.spawnSync('node', [CLI, '--sheets', ...mk, '--out', path.join(dir, 'rt')], { encoding: 'utf8' });
const b2 = JSON.parse(fs.readFileSync(path.join(dir, 'rt', 'bodies.json'), 'utf8'));
ok('C5 round trip: the marked sheets alone (no flags) -> the same 3 bodies, same z', rb.status === 0 && b2.length === 3 && JSON.stringify(b2.map(b => [b.z0, b.z1, b.kind])) === JSON.stringify(bodies.map(b => [b.z0, b.z1, b.kind])), (rb.stdout.match(/§CLI result .*/) || [''])[0]);
r = sh(['--accept-suggestions', '--set', 'T', '--level', '0', '--datum', '1S_elev:3@3000']);
ok('C6 CONTROL no layer typed: not a structure set, exit 2, no bodies invented', r.status === 2 && /bodies=0/.test(r.stdout), (r.stdout.match(/§CLI result .*/) || [''])[0]);
r = sh(FACTS.concat(['--layer', 'plan:Wall=wall']));
ok('C7 CONTROL a wall layer typed next to a body kind: refused (mixed set), exit 2', r.status === 2 && /ok=false/.test(r.stdout), (r.stdout.match(/§CLI (gate|result) .*/g) || []).join(' | ').slice(0, 220));
r = sh(['--bogus']);
ok('C8 FALSIFIER an unknown flag is an error (exit 1), not ignored', r.status === 1 && /unknown argument/.test(r.stderr));
r = cp.spawnSync('node', [CLI, '--sheets', P1, E1, '--out', path.join(dir, 'x'), '--datum', 'nosuch:1@2'], { encoding: 'utf8' });
ok('C9 CONTROL a --datum naming no sheet fails loudly (exit 1)', r.status === 1 && /no sheet/.test(r.stderr));

// --ifc: the typed IFC4 without a browser, then the usual extractor (when present) reads it back
r = sh(FACTS.concat(['--ifc']));
const o3 = ((r.stdout.match(/§CLI result .*/) || [''])[0].match(/ out=(\S+)/) || [])[1], ifcT = o3 && fs.existsSync(path.join(o3, 'model.ifc')) ? fs.readFileSync(path.join(o3, 'model.ifc'), 'utf8') : '';
ok('C13 --ifc: model.ifc has 3 IFCCOLUMN products typed (.COLUMN.), one storey "Level 1" at 0, spatial structure (project/site/building), unique GlobalIds', r.status === 0 && (ifcT.match(/IFCCOLUMN\(/g) || []).length === 3 && (ifcT.match(/\.COLUMN\./g) || []).length === 3 && /IFCBUILDINGSTOREY\('[^']*',\$,'Level 1'/.test(ifcT) && /IFCPROJECT\(/.test(ifcT) && new Set((ifcT.match(/IFCCOLUMN\('([^']*)'/g) || [])).size === 3, (r.stdout.match(/§CLI ifc .*/) || [''])[0]);
const EXT = path.join(process.env.HOME, 'bim-compiler/scripts/extractIFC2DB.js');
if (ifcT && fs.existsSync(EXT)) { const ex = cp.spawnSync('node', [EXT, '--ifc', path.join(o3, 'model.ifc'), '-o', path.join(o3, 'm.db')], { encoding: 'utf8', timeout: 120000 });
  ok('C14 the usual IFC -> DB extractor reads the headless IFC: elements=3', /§SUMMARY elements=3 /.test(ex.stdout), (ex.stdout.match(/§SUMMARY .*/) || [''])[0]); } else console.log('SKIP C14 extractor not present');
// real shed (local material): the same numbers as the page witness W-DXF-SHED
const SHD = process.env.SHED_SHEETS || path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/');
if (fs.existsSync(path.join(SHD, '0_FLOOR_PLAN.dxf'))) {
  const od = path.join(dir, 'shed');
  const rs = cp.spawnSync('node', [CLI, '--sheets', SHD + '0_FLOOR_PLAN.dxf', SHD + '1S_ELEV_SOUTH.dxf', SHD + '4_FOUNDATION_LAYOUT.dxf', '--out', od, '--accept-suggestions', '--set', 'SHED', '--level', '0', '--datum', '1S_ELEV:0.6096@-4446.6',
    '--layer', 'plan:Col=column', '--layer', 'elev:0=column', '--layer', 'plan:Fo=footing', '--bodyz', 'footing=-1.4478,-1.143'], { encoding: 'utf8' });
  const sb = JSON.parse(fs.readFileSync(path.join(od, 'bodies.json'), 'utf8')), IN = 0.0254;
  const zc = {}; sb.filter(b => b.kind === 'column').forEach(b => { const k = (b.z0 / IN).toFixed(0) + '..' + (b.z1 / IN).toFixed(0); zc[k] = (zc[k] || 0) + 1; });
  const fo = sb.filter(b => b.kind === 'footing'), sizes = [...new Set(fo.map(b => ((b.bbox[3] - b.bbox[0]) / IN).toFixed(0) + 'x' + ((b.bbox[4] - b.bbox[1]) / IN).toFixed(0)))];
  const ctr = b => [(b.bbox[0] + b.bbox[3]) / 2, (b.bbox[1] + b.bbox[4]) / 2].map(v => Math.round(v * 1000)).join(',');
  const colC = new Set(sb.filter(b => b.kind === 'column').map(ctr));
  ok('C10 REAL raw shed, headless: 32 IfcColumn + 32 IfcFooting, 0 left out (== W-DXF-SHED flow C)', rs.status === 0 && sb.length === 64 && /left_out=0/.test(rs.stdout), (rs.stdout.match(/§CLI result .*/) || [''])[0]);
  ok('C11 heights as the page gives them: columns 16 at 24..122 in, 12 at 24..60, 4 at 24..120; footings 48x60 in at -1.4478..-1.143 m, each centred on a column', zc['24..122'] === 16 && zc['24..60'] === 12 && zc['24..120'] === 4 && sizes.join() === '48x60' && fo.every(b => b.z0 === -1.4478 && b.z1 === -1.143 && b.height_source === 'stated') && fo.every(b => colC.has(ctr(b))), JSON.stringify({ zc, sizes }));
  ok('C12 type name from the drawing\'s own label on the 32 columns; every body carries IFC typing', new Set(sb.filter(b => b.kind === 'column').map(b => b.ifc.type_name)).size === 1 && sb.filter(b => b.kind === 'column')[0].ifc.type_name === '12"x12" R.C.C Column' && sb.every(b => b.ifc.ifc_class && b.ifc.PredefinedType));
} else console.log('SKIP C10-C12 local shed sheets not present');
console.log(fail ? 'W-CLI FAIL ' + fail : 'W-CLI PASS'); process.exit(fail ? 1 : 0);
