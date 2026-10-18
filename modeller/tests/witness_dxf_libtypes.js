// W-LIBTYPES (prompts/DXF2BIM_MODELLER_LANE.md §L23): the reference library is organised by Building Type. Issue: a type that is offered components of another type, or a tag that silently
// names nothing, makes the library wrong without a visible failure. Read the log; exit code is not evidence.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const LT = require('../dxf2library_types.js');
const BC = process.env.BIMCOMPILER || path.join(os.homedir(), 'bim-compiler');
const BTJS = path.join(process.env.BTDIR || path.join(BC, 'scripts'), 'library_building_types.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const BT = require(BTJS);
const fams = [{ family_id: 1, n: 'door' }, { family_id: 2, n: 'fan' }, { family_id: 3, n: 'window' }];
const map = { default: ['General'], ad_opening_family: { 2: ['Farming Shed'] } };
let t = BT.tag('ad_opening_family', 'family_id', fams, map);
ok('LT1 an unlisted record carries the default', JSON.stringify(t[0].building_types) === '["General"]' && JSON.stringify(t[2].building_types) === '["General"]');
ok('LT2 an explicit tag is applied (and the input rows are not mutated)', JSON.stringify(t[1].building_types) === '["Farming Shed"]' && fams[1].building_types === undefined);
let msg = null; try { BT.tag('ad_opening_family', 'family_id', fams, { default: ['General'], ad_opening_family: { 9: ['Farming Shed'] } }); } catch (e) { msg = e.message; }
ok('LT3 a tag naming a missing record is refused', /names no such record/.test(msg || ''), msg);
ok('LT4 determinism', JSON.stringify(BT.tag('ad_opening_family', 'family_id', fams, map)) === JSON.stringify(t));
const names = (rows, type) => LT.offered(rows, type).map(r => r.n).join();
ok('LT5 Farming Shed is offered its fan first, then General ones; General sees no fan; an unknown type is General only', names(t, 'Farming Shed') === 'fan,door,window' && names(t, 'General') === 'door,window' && names(t, 'No Such') === 'door,window' && names(t, null) === 'door,window', [names(t, 'Farming Shed'), names(t, 'General'), names(t, 'No Such')].join(' | '));
const t2 = BT.tag('ad_opening_family', 'family_id', fams, { default: ['General'] });
ok('LT6 FALSIFIER: removing the fan\'s tag changes what a Farming Shed is offered', names(t2, 'Farming Shed') === 'door,fan,window' && names(t2, 'Farming Shed') !== names(t, 'Farming Shed'));
const DB = [path.join(BC, 'deploy/component_library.db'), path.join(BC, 'library/component_library.db')].find(f => fs.existsSync(f)), EXP = path.join(process.env.BTDIR || path.join(BC, 'scripts'), 'export_library_subset.js');
if (DB && fs.existsSync(EXP)) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-')), r = cp.spawnSync('node', [EXP, '--full', '--out-dir', out, '--lib', DB], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) ok('LT7 the real library exports with building_types', false, (r.stderr || '').slice(0, 200));
  else { const latest = JSON.parse(fs.readFileSync(path.join(out, 'latest.json'), 'utf8')), idx = JSON.parse(fs.readFileSync(path.join(out, latest.index), 'utf8')), rs = idx.rows.ad_opening_family.concat(idx.rows.ad_wall_type);
    ok('LT7 the real library index carries building_types on every family and wall row; top-level list; counts match the rows', Array.isArray(idx.building_types) && idx.building_types.includes('General') && rs.length > 0 && rs.every(x => Array.isArray(x.building_types) && x.building_types.length) && idx.counts.ad_opening_family === idx.rows.ad_opening_family.length, `families=${idx.rows.ad_opening_family.length} walls=${idx.rows.ad_wall_type.length} types=${JSON.stringify(idx.building_types)}`); }
} else console.log('SKIP LT7 (no library DB / exporter at ' + BC + ')');
console.log('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
