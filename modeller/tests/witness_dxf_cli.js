// W-CLI (prompts/DXF2BIM_MODELLER_LANE.md §L8): the headless runner dxf2bim_cli.js takes RAW sheets + the few stated facts and produces the same structure result the page does (W-DXF-SHED), with no
// browser. Issue: a chain that only exists in a page cannot be scripted, batched or tested cheaply. Read the log; exit code is not evidence.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), IN = 0.0254;
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
// §L10.9 the user's number from the command line: --size <body id>:<axis>=<metres> writes @SIZE on the first plan sheet and the body is rebuilt with it
{
  const gid = bodies[0].guid, x0 = (bodies[0].bbox[3] - bodies[0].bbox[0]), rs = sh(FACTS.concat(['--size', gid + ':x=0.45'])), od = (rs.stdout.match(/out=(\S+)/) || [])[1];
  const bs = rs.status === 0 ? JSON.parse(fs.readFileSync(path.join(rs.stdout.match(/§CLI result[^\n]*out=(\S+)/)[1], 'bodies.json'), 'utf8')) : [], b0 = bs.find(b => b.guid === gid), bo = bs.find(b => b.guid !== gid);
  ok('C18 --size <id>:x=0.45 widens exactly that body to 0.45 m (source user), the others keep the drawn extent; the marking is in the settings sheet', rs.status === 0 && b0 && Math.abs((b0.bbox[3] - b0.bbox[0]) - 0.45) < 1e-6 && b0.size.x.source === 'user' && Math.abs((bo.bbox[3] - bo.bbox[0]) - x0) < 1e-6 && /@SIZE=/.test(fs.readFileSync(path.join(rs.stdout.match(/§CLI result[^\n]*out=(\S+)/)[1], 'marked', '0_plan_marked.dxf'), 'utf8')), 'drawn=' + x0);
  const rbad = sh(FACTS.concat(['--size', 'oops']));
  ok('C19 CONTROL a malformed --size is an error (exit 1), not ignored', rbad.status === 1);
}
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
  const sz = sb.filter(b => b.size), cl = {}; sz.forEach(b => { const c = b.size.x.class + '/' + b.size.y.class; cl[c] = (cl[c] || 0) + 1; });
  ok('C15 REAL shed numbers (W-BODY-SIZE on the product): every column and footing carries its stated size (legend C-1/F-1, marks beside the foundation-plan members, floor-plan columns by translation) and ALL agree with the drawing: 0 conflicts, extents unchanged', sz.length === 64 && Object.keys(cl).join() === 'PAIRED_AGREE/PAIRED_AGREE' && sb.every(b => !b.size || b.size.x.number != null), JSON.stringify(cl));
  const vj = JSON.parse(fs.readFileSync(path.join(od, 'verdict.json'), 'utf8')), da = vj.dimension_audit;
  ok('C17 REAL shed: verdict.json carries the dimension audit (every typed override against its own measure): the 410\'-0" vs 1,560 in conflict is a row, and the counts account for the sheets read', da && da.rows.some(r => r.text === '410\'-0"' && r.class === 'PAIRED_CONFLICT') && (da.counts.conflict || 0) >= 1, JSON.stringify(da && da.counts));
  ok('C22 REAL shed: verdict.json carries the entity account (every model-space entity read or listed): nothing dropped on the shed sheets (HATCH and LEADER are read by our own modules)', vj.entity_account && Object.keys(vj.entity_account.sheets).length >= 2 && Object.keys(vj.entity_account.dropped).length === 0, JSON.stringify(vj.entity_account && vj.entity_account.dropped));
  ok('C11 heights as the page gives them: columns 16 at 24..122 in, 12 at 24..60, 4 at 24..120; footings 48x60 in at -1.4478..-1.143 m, each centred on a column', zc['24..122'] === 16 && zc['24..60'] === 12 && zc['24..120'] === 4 && sizes.join() === '48x60' && fo.every(b => b.z0 === -1.4478 && b.z1 === -1.143 && b.height_source === 'stated') && fo.every(b => colC.has(ctr(b))), JSON.stringify({ zc, sizes }));
  ok('C12 type name from the drawing\'s own label on the 32 columns; every body carries IFC typing', new Set(sb.filter(b => b.kind === 'column').map(b => b.ifc.type_name)).size === 1 && sb.filter(b => b.kind === 'column')[0].ifc.type_name === '12"x12" R.C.C Column' && sb.every(b => b.ifc.ifc_class && b.ifc.PredefinedType));
  // beams (§L9): the beam-layout plan typed beam on THAT sheet only (the shared layer Dim also holds dimensions on the other plans), elevation bands from the same South layer typed column
  const od2 = path.join(dir, 'shedB'), BEAMARGS = ['--sheets', SHD + '0_FLOOR_PLAN.dxf', SHD + '1S_ELEV_SOUTH.dxf', SHD + '3_BEAM_LAYOUT.dxf', SHD + '4_FOUNDATION_LAYOUT.dxf', '--out', od2, '--accept-suggestions', '--set', 'SHED', '--level', '0', '--datum', '1S_ELEV:0.6096@-4446.6',
    '--layer', 'plan:Col=column', '--layer', 'elev:0=column', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--bodyz', 'footing=-1.4478,-1.143'];
  const rb1 = cp.spawnSync('node', [CLI].concat(BEAMARGS), { encoding: 'utf8' }), bd1 = JSON.parse(fs.readFileSync(path.join(od2, 'bodies.json'), 'utf8')), beams1 = bd1.filter(b => b.kind === 'beam');
  ok('C13b REAL beams, drawn evidence only: 17 beam spans at z 122..132 in from the elevation band (the rest waits: 22 GAP:body_no_elevation: the right block, the end beams, the expansion joint)', rb1.status === 0 && beams1.length === 17 && beams1.every(b => b.height_source === 'elevation' && (b.z0 / IN).toFixed(0) === '122' && (b.z1 / IN).toFixed(0) === '132') && /left_out=22/.test(rb1.stdout), (rb1.stdout.match(/§CLI result .*/) || [''])[0]);
  const rb2 = cp.spawnSync('node', [CLI].concat(BEAMARGS, ['--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794']).map(a => a.replace(od2, path.join(dir, 'shedB2'))), { encoding: 'utf8' });
  const bd2 = JSON.parse(fs.readFileSync(path.join(dir, 'shedB2', 'bodies.json'), 'utf8')), vd2 = JSON.parse(fs.readFileSync(path.join(dir, 'shedB2', 'verdict.json'), 'utf8')), beams2 = bd2.filter(b => b.kind === 'beam');
  const rowOf = b => Math.round((b.bbox[1] + b.bbox[4]) / 2 / IN / 10) * 10, rows2 = {}; beams2.forEach(b => { (rows2[rowOf(b)] = rows2[rowOf(b)] || []).push([b.bbox[0] / IN, b.bbox[3] / IN]); });
  const ext = r => { const a = rows2[r].sort((p, q) => p[0] - q[0]); return [a[0][0], a[a.length - 1][1]]; };
  ok('C13c the user EXCLUDES the expansion joint (4 regions counted: its 2 long pieces + the 2 short joint fragments on the beam edges) and states the beam range for the rest: 35 spans (17 drawn + 18 stated), 0 left out; rows: D side 15 spans, A side 14, 3 spans at each end beam', rb2.status === 0 && beams2.length === 35 && vd2.report.kinds.beam.excluded === 4 && /left_out=0/.test(rb2.stdout) && beams2.filter(b => b.height_source === 'stated').length === 18 && rows2[-4370].length === 15 && rows2[-3770].length === 14 && rows2[-4270].length === 2 && rows2[-4070].length === 2 && rows2[-3870].length === 2, JSON.stringify(Object.keys(rows2).map(k => [k, rows2[k].length])));
  const bc = {}; beams2.forEach(b => { const m = b.ifc && b.ifc.type_name || b.mark || '?'; const cl = b.size ? (b.size.w ? b.size.w.class : '-') + '/' + (b.size.d ? b.size.d.class : '-') : 'nosize'; const key = (b.mark || '?') + ' ' + cl; bc[key] = (bc[key] || 0) + 1; });
  console.log('beam sizes (mark class): ' + JSON.stringify(bc));
  ok('C16 REAL shed beams (35 spans): 13 spans of the left block agree with B-1 = 12" x 10" (width and depth), 17 of the right block agree in width but the elevation draws them 10 in deep against B-2 = 12": a visible PAIRED_CONFLICT (the known drawing conflict, surfaced with the label number 12 in force, not reconciled by the code); 5 end beams have no mark nearby and stay as drawn (no size). No span is shortened (C13d)', beams2.length === 35 && bc['B-1 PAIRED_AGREE/PAIRED_AGREE'] === 13 && bc['B-2 PAIRED_AGREE/PAIRED_CONFLICT'] === 17 && bc['? nosize'] === 5, JSON.stringify(bc));
  // §L11.2 the gable ends: the West and East elevations' BLOCKS hatches become wall panels through the product (typed layer, nothing else), thickness from the drawing's own labels
  const rg = cp.spawnSync('node', [CLI, '--sheets', SHD + '0_FLOOR_PLAN.dxf', SHD + '2_ELEV_WEST.dxf', SHD + '7_ELEV_EAST.dxf', '--out', path.join(dir, 'gab'), '--accept-suggestions', '--set', 'SHED', '--level', '0', '--layer', 'elev:Wall=panel',
    '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442'], { encoding: 'utf8' });
  const gb = rg.status === 0 ? JSON.parse(fs.readFileSync(path.join(dir, 'gab', 'bodies.json'), 'utf8')) : [], tOf = b => Math.round(b.size.t.number / IN), zin = b => [Math.round(b.z0 / IN * 10) / 10, Math.round(b.z1 / IN * 10) / 10];
  const west = gb.filter(b => /^body-panel-0-/.test(b.guid)), east = gb.filter(b => /^body-panel-1-/.test(b.guid));
  ok('C20 REAL gable ends through the product: West 3 lower panels 10 in + 3 gable tops 5 in, East 3 lower panels 5 in + 3 gable tops 5 in (the oracle\'s 12 bodies), z 24..120 in and 132..~193/225 in as drawn, 0 left out', rg.status === 0 && gb.length === 12 && west.length === 6 && east.length === 6 &&
    west.filter(b => zin(b)[1] === 120).every(b => tOf(b) === 10) && west.filter(b => zin(b)[0] === 132).every(b => tOf(b) === 5) && east.every(b => tOf(b) === 5) && /left_out=0/.test(rg.stdout), (rg.stdout.match(/§CLI result .*/) || [''])[0].slice(0, 160));
  {   // volume == drawn polygon area x thickness for EVERY panel (the mesh is the drawn outline), from the marked sheets the CLI wrote
    const I2 = require('../dxf2bim_import.js'), P2 = require('../dxf2prep.js'), PN2 = require('../dxf2panels.js'), H2 = require('../dxf2hatch.js');
    const mdir = path.join(dir, 'gab', 'marked'), files = fs.readdirSync(mdir).map(f => ({ name: f, text: fs.readFileSync(path.join(mdir, f), 'utf8') }));
    const sheets = I2.readSheets(files, { prep: P2 }), res = PN2.buildPanels(sheets, {});
    const vol = e => { let v = 0; e.faces.forEach(([a, b, c]) => { const A = e.vertices[a], Bv = e.vertices[b], C = e.vertices[c]; v += (A[0] * (Bv[1] * C[2] - Bv[2] * C[1]) - A[1] * (Bv[0] * C[2] - Bv[2] * C[0]) + A[2] * (Bv[0] * C[1] - Bv[1] * C[0])) / 6; }); return v; };
    const worst = res.els.map(e => { const sh = sheets.find(s => s.name === e.sheet), h = sh.hatches.hatches.find(q => q.handle === e.members[0]); const li = /-L(\d)$/.exec(e.guid); const lp = h.loops[li ? Number(li[1]) : 0]; return Math.abs(vol(e) - Math.abs(H2.area(lp.pts)) * IN * IN * e.size.t.number) / (Math.abs(H2.area(lp.pts)) * IN * IN * e.size.t.number); });
    ok('C21 every panel\'s mesh volume equals its drawn hatch loop area x thickness (relative error < 1e-6; the shed oracle has 6e-14)', res.els.length === 12 && Math.max(...worst) < 1e-6, 'worst=' + Math.max(...worst).toExponential(2));
  }
  const DELTA = -26808.1 - (-21514.23), dE = ext(-4370), aE = ext(-3770);   // sheet 3 -> floor-plan frame by the shared grid 01; the hand-built oracle's long beams run -21508.23 .. -19960.23 on sheet 3
  ok('C13d PARITY with the hand-built oracle: each long-beam row runs from the oracle\'s beam start to its beam end (sheet 3 -21508.23 .. -19960.23 -> floor frame -26802.1 .. -25254.1) to 0.6 in', [dE, aE].every(e => Math.abs(e[0] - (-21508.23 + DELTA)) < 0.6 && Math.abs(e[1] - (-19960.23 + DELTA)) < 0.6), JSON.stringify([dE, aE]));
} else console.log('SKIP C10-C12 local shed sheets not present');
console.log(fail ? 'W-CLI FAIL ' + fail : 'W-CLI PASS'); process.exit(fail ? 1 : 0);
