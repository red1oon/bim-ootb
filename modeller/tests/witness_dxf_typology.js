// W-TYPOLOGY (prompts/DXF2BIM_MODELLER_LANE.md §L22): building-type plausibility advisories from cited data. Issue: a typology that overrides what is drawn, speaks without a stated type,
// or hard-codes its ranges in code is a guess dressed as a standard. Read the log; exit code is not evidence.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const TY = require('../dxf2typology.js'), REF = require('../element_defaults.json'), FT = 0.3048;
let fail = 0; const lines = [];
const ok = (n, c, i) => { const s = (c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : ''); console.log(s); lines.push(s); if (!c) fail++; };
const box = (cls, x0, y0, x1, y1, z0, z1, kind) => ({ class: cls, kind: kind || cls, z0, z1, vertices: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] });
const house = (wft, withParts) => { const w = wft * FT, e = [box('IfcColumn', 0, 0, 0.3, 0.3, 0, 2), box('IfcColumn', w - 0.3, 0, w, 0.3, 0, 2), box('IfcColumn', 0, 30, 0.3, 30.3, 0, 2), box('IfcColumn', w - 0.3, 30, w, 30.3, 0, 2), box('IfcBeam', 0, 0, w, 0.3, 1.8, 2.1), box('IfcRoof', 0, 0, w, 30, 2.1, 3.3)];
  (withParts || []).forEach(c => e.push(box(c, 1, 1, 2, 2, 0, 1))); return e; };
const code = (r, c) => r.rows.filter(x => x.code === 'TYP:' + c);
const FS = 'Farming Shed';
let r = TY.advise(house(50, ['IfcFan']), 'General'), r2 = TY.advise(house(50, ['IfcFan']), 'No Such Type'), r3 = TY.advise(house(50, ['IfcFan']), null);
ok('TY1 General, an unknown type and no type give no rows: the typology never speaks without a stated type', r.rows.length === 0 && r2.rows.length === 0 && r3.rows.length === 0, JSON.stringify([r.rows.length, r2.rows.length, r3.rows.length]));
r = TY.advise(house(20, ['IfcFan']), FS);
ok('TY2 a 20 ft house reads as the open-sided range, no tunnel row', /open-sided range/.test(code(r, 'width_class')[0].message) && !/environment-controlled class/.test(code(r, 'width_class')[0].message) && code(r, 'tunnel_no_pad').length === 0, code(r, 'width_class')[0].message);
r = TY.advise(house(50, ['IfcFan']), FS);
ok('TY3 a 50 ft house is the environment-controlled class (tunnel features expected)', /environment-controlled class: tunnel features/.test(code(r, 'width_class')[0].message) && r.measured.width_ft === 50, code(r, 'width_class')[0].message);
r = TY.advise(house(30, ['IfcFan']), FS);
ok('TY4 a 30 ft house is between the open-sided and environment-controlled ranges', /between the open-sided range and the environment-controlled class/.test(code(r, 'width_class')[0].message), code(r, 'width_class')[0].message);
r = TY.advise(house(20, ['IfcFan', 'IfcDoor']), FS);
const miss = code(r, 'expected_missing').map(x => x.class).sort();
ok('TY5 an expected class with no body is reported by name; a present one is not', miss.join() === 'IfcCovering,IfcSlab' && /IfcFan 1/.test(code(r, 'expected_present')[0].message) && !miss.includes('IfcFan'), miss.join());
const a = TY.advise(house(50, ['IfcFan']), FS), b = TY.advise(house(50, ['IfcFan', 'IfcCovering']).concat([box('IfcCovering', 3, 3, 4, 4, 0, 1, 'pad')]), FS), c = TY.advise(house(50, []), FS);
ok('TY6 tunnel_no_pad fires with fans and no pad kind; not with a pad; not without fans', code(a, 'tunnel_no_pad').length === 1 && code(b, 'tunnel_no_pad').length === 0 && code(c, 'tunnel_no_pad').length === 0, [code(a, 'tunnel_no_pad').length, code(b, 'tunnel_no_pad').length, code(c, 'tunnel_no_pad').length].join('/'));
r = TY.advise(house(20, ['IfcFan']), FS);
ok('TY7 eave 6.9 ft inside the cited 6-7; centre 10.8 ft inside 10-12, "above/below by N ft" shown when outside', code(r, 'eave_range')[0].message.includes('inside') && code(r, 'centre_range')[0].message.includes('inside'), code(r, 'eave_range')[0].message + ' | ' + code(r, 'centre_range')[0].message);
const hi = house(20); hi[5] = box('IfcRoof', 0, 0, 6, 30, 2.1, 6.0);
r = TY.advise(hi, FS);
ok('TY7b a 6.0 m ridge (19.7 ft) is above the cited 10-12 ft by exactly 7.7 ft', /above by 7\.7 ft/.test(code(r, 'centre_range')[0].message), code(r, 'centre_range')[0].message);
ok('TY8 feet are converted at 0.3048 and the row shows both units', code(TY.advise(house(50, ['IfcFan']), FS), 'width_class')[0].measured_m === 15.2 && TY.advise(house(50, ['IfcFan']), FS).measured.width_ft === 50 && TY.advise(house(50, ['IfcFan']), FS).measured.width_m.toFixed(4) === '15.2400', JSON.stringify(TY.advise(house(50, ['IfcFan']), FS).measured));
ok('TY9 determinism: two runs, identical rows', JSON.stringify(TY.advise(house(50, ['IfcFan']), FS)) === JSON.stringify(TY.advise(house(50, ['IfcFan']), FS)));
const REF3 = JSON.parse(JSON.stringify(REF)); REF3.building_types[FS].typical.width_environment_controlled_ft_min = 80;
ok('TY10 FALSIFIER: the same 50 ft house with the environment-controlled minimum edited to 80 ft is no longer that class, and tunnel_no_pad goes quiet: the DATA, not the code, decides', !/environment-controlled class: tunnel/.test(code(TY.advise(house(50, ['IfcFan']), FS, REF3), 'width_class')[0].message) && code(TY.advise(house(50, ['IfcFan']), FS, REF3), 'tunnel_no_pad').length === 0 && /environment-controlled class: tunnel/.test(code(TY.advise(house(50, ['IfcFan']), FS), 'width_class')[0].message));
// the real shed through the product CLI
const S = path.join(os.homedir(), 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets') + '/';
if (fs.existsSync(S + '0_FLOOR_PLAN.dxf')) {
  const CLI = path.join(__dirname, '..', 'dxf2bim_cli.js'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'typ-'));
  const base = ['--sheets'].concat(['0_FLOOR_PLAN', '1S_ELEV_SOUTH', '1N_ELEV_NORTH', '2_ELEV_WEST', '7_ELEV_EAST', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '8_SECTION_AA_TRUSS'].map(x => S + x + '.dxf'), ['--complete', '--accept-suggestions', '--set', 'SHED', '--level', '0',
    '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '1N_ELEV:0.6096@-3895.2', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--datum', '8_SECTION:0.6096@-3726.416',
    '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--layer', 'elev:Wall=panel', '--layer', 'elev:Rod=fan', '--layer', 'elev:Dim=net', '--layer', 'plan:Rod=doorswing@0_FLOOR', '--layer', 'section:Fo=bar',
    '--bodyz', 'footing=-1.4478,-1.143', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794']);
  const gen = cp.spawnSync('node', [CLI].concat(base, ['--out', path.join(out, 'g')]), { encoding: 'utf8' }), fsr = cp.spawnSync('node', [CLI].concat(base, ['--default', 'building.type=Farming Shed', '--out', path.join(out, 'f')]), { encoding: 'utf8' });
  const vg = JSON.parse(fs.readFileSync(path.join(out, 'g', 'verdict.json'), 'utf8')), vf = JSON.parse(fs.readFileSync(path.join(out, 'f', 'verdict.json'), 'utf8')), tl = fsr.stdout.split('\n').filter(l => /^§TYPOLOGY/.test(l));
  tl.forEach(l => lines.push('  ' + l));
  ok('C-TY1 the real shed without a stated type (General): 0 typology rows; verdict.json carries typology', gen.status === 0 && vg.typology && vg.typology.type === 'General' && vg.typology.rows.length === 0 && /§TYPOLOGY type=General rows=0/.test(gen.stdout), (gen.stdout.match(/§TYPOLOGY.*/) || [''])[0]);
  const rr = k => vf.typology.rows.filter(x => x.code === 'TYP:' + k);
  ok('C-TY2 the real shed as Farming Shed: 51 x 131 ft (columns\' outer faces), environment-controlled class, eave 11.2 ft (4.2 above 6-7), centre 18.7 ft (6.7 above 10-12), all 5 expected classes present, tunnel_no_pad (fans, no pad)', fsr.status === 0 && vf.typology.type === 'Farming Shed' && vf.typology.measured.width_ft === 51 && vf.typology.measured.length_ft === 131 && /environment-controlled class/.test(rr('width_class')[0].message) && /above by 4\.2 ft/.test(rr('eave_range')[0].message) && /above by 6\.7 ft/.test(rr('centre_range')[0].message) && rr('expected_missing').length === 0 && /IfcFan 13/.test(rr('expected_present')[0].message) && rr('tunnel_no_pad').length === 1 && vf.typology.rows.every(x => x.level === 'advisory'), tl.length + ' log lines');
  ok('C-TY3 the typology changes nothing built: the Farming Shed run has the same 448 bodies as the General run (it overrides only the cited defaults, here the doors, never what is drawn)', JSON.parse(fs.readFileSync(path.join(out, 'g', 'bodies.json'), 'utf8')).length === 448 && JSON.parse(fs.readFileSync(path.join(out, 'f', 'bodies.json'), 'utf8')).length === 448 && vf.ok === vg.ok);
} else console.log('SKIP real shed (sheets not found)');
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'logs', 'witness_dxf_typology.log'), lines.join('\n') + '\n');
console.log('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
