#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-NATIVE-CIRCUITS: prompts/DISC_WALK_DRAWN_INTEGRATION.md §12b BUILD slice 2. Read the log after every run.
 * ISSUE IT PROVES OR DISPROVES: the model's own circuit data (panel, circuit number, apparent load) was dropped at extraction; with it kept, a reader
 * must get it by MEANING (native_maps.json prop_map), equal to what the IFC itself states, and report nothing when nothing is stated.
 * CLAIMS: C1 panels / circuits / devices / per-panel counts = an independent ifcopenshell count over the extracted guids.
 *         C2 load_va = the independent sum (raw x 0.09290304), relative error under 1e-6.
 *         C3 red controls: prop_map emptied -> null; unit_map emptied at extraction -> load_va 0 and unitUnknown = the devices carrying a load.
 *         C4 the walker's own line §WALK-ELEC-CIRCUITS carries the same numbers (DiscWalker.elecCircuits).
 * Usage: node modeller/tests/witness_native_circuits.js [ifc]
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const H = process.env.HOME, req = n => { for (const m of [n, path.join(H, 'bim-compiler/node_modules', n)]) { try { return require(m); } catch (e) {} } throw new Error('missing ' + n); };
const W = req('web-ifc'), initSql = req('sql.js'), Core = require('../dxf2bim/ifc_extract_core.js'), NP = require('../native_props.js');
const IFC = process.argv[2] || [path.join(H, 'Projects/bim-compiler/reference/residential/Ifc2x3_Duplex_MEP.ifc'), path.join(H, 'bim-compiler/internal/UNMERGED/Ifc2x3_Duplex_MEP.ifc')].find(f => fs.existsSync(f));
const MAPS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dxf2bim', 'native_maps.json'), 'utf8'));
let pass = 0, fail = 0, inc = 0; const TAG = '§W-NATIVE-CIRCUITS';
const verdict = (n, v, x) => { if (v === 'PASS') pass++; else if (v === 'FAIL') fail++; else inc++; console.log(TAG + ' ' + n + ' ' + v + ' ' + x); };
const done = () => { console.log(TAG + '-VERDICT ' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc); process.exit(fail ? 1 : inc ? 2 : 0); };
async function extract(maps) { const SQL = await initSql(), api = new W.IfcAPI(); await api.Init(); const db = new SQL.Database();
  await Core.extractToDb({ nativeMaps: maps, WebIFC: W, ifcApi: api, ifcData: new Uint8Array(fs.readFileSync(IFC)), db: Core.sqljsDb(db), Buf: Core.browserBuf, buildingName: 'MODEL', sourceName: path.basename(IFC), log: () => {} }); return db; }
(async () => {
  if (!IFC) { verdict('SETUP', 'INCONCLUSIVE', 'the public Duplex MEP IFC was not found'); return done(); }
  const db = await extract(MAPS), got = NP.circuits(db, MAPS);
  console.log(TAG + ' ' + (got ? NP.line(got) : 'circuits=null'));
  const guids = db.exec('SELECT guid FROM elements_meta')[0].values.map(r => r[0]), gf = path.join(os.tmpdir(), 'wnc_' + process.pid + '.json'); fs.writeFileSync(gf, JSON.stringify(guids));
  const py = `
import ifcopenshell, json, sys, collections
f = ifcopenshell.open(sys.argv[1]); want = set(json.load(open(sys.argv[2])))
occ = collections.defaultdict(dict); typ = collections.defaultdict(dict)
def take(ps, o, into):
    for p in ps.HasProperties:
        if p.is_a('IfcPropertySingleValue') and p.NominalValue is not None: into[o.GlobalId][(ps.Name, p.Name)] = p.NominalValue.wrappedValue
for r in f.by_type('IfcRelDefinesByProperties'):
    ps = r.RelatingPropertyDefinition
    if ps.is_a('IfcPropertySet'):
        for o in r.RelatedObjects:
            if o.GlobalId in want: take(ps, o, occ)
for r in f.by_type('IfcRelDefinesByType'):
    for ps in (r.RelatingType.HasPropertySets or []):
        if ps.is_a('IfcPropertySet'):
            for o in r.RelatedObjects:
                if o.GlobalId in want: take(ps, o, typ)
by = collections.Counter(); circ = set(); load = 0.0; dev = 0
for g in want:
    v = dict(typ[g]); v.update(occ[g])
    p = str(v.get(('PSet_Revit_Electrical - Loads', 'Panel'), '') or '').strip()
    if not p: continue
    dev += 1; by[p] += 1; circ.add((p, str(v.get(('PSet_Revit_Electrical - Loads', 'Circuit Number'), ''))))
    a = v.get(('PSet_Revit_Type_Electrical - Loads', 'Apparent Load'))
    if a is not None: load += float(a) * 0.09290304
print(json.dumps({'panels': len(by), 'circuits': len(circ), 'devices': dev, 'load_va': load, 'byPanel': by}))
`;
  const pr = cp.spawnSync('python3', ['-c', py, IFC, gf], { encoding: 'utf8', maxBuffer: 1 << 26 }); fs.unlinkSync(gf);
  let ind = null; try { ind = JSON.parse(pr.stdout.trim().split('\n').pop()); } catch (e) {}
  console.log(TAG + ' independent ' + JSON.stringify(ind) + (ind ? '' : ' ' + String(pr.stderr).slice(0, 300)));
  if (!ind || !got) { verdict('C1 COUNTS', !ind ? 'INCONCLUSIVE' : 'FAIL', 'got=' + JSON.stringify(got)); return done(); }
  const same = got.panels === ind.panels && got.circuits === ind.circuits && got.devices === ind.devices && JSON.stringify(Object.keys(got.byPanel).sort().map(k => [k, got.byPanel[k]])) === JSON.stringify(Object.keys(ind.byPanel).sort().map(k => [k, ind.byPanel[k]]));
  verdict('C1 COUNTS (panels, circuits, devices, per panel = ifcopenshell)', !ind.devices ? 'INCONCLUSIVE' : (same ? 'PASS' : 'FAIL'), 'panels=' + got.panels + '/' + ind.panels + ' circuits=' + got.circuits + '/' + ind.circuits + ' devices=' + got.devices + '/' + ind.devices);
  const rel = Math.abs(got.load_va - ind.load_va) / Math.max(1, Math.abs(ind.load_va));
  verdict('C2 LOAD (sum of apparent load in VA)', !ind.load_va ? 'INCONCLUSIVE' : (rel < 1e-6 && got.unitUnknown === 0 ? 'PASS' : 'FAIL'), 'load_va=' + got.load_va.toFixed(3) + ' independent=' + ind.load_va.toFixed(3) + ' rel=' + rel.toExponential(2) + ' unitUnknown=' + got.unitUnknown);
  const none = NP.circuits(db, { prop_map: [] });
  const db2 = await extract({ unit_map: [], prop_map: MAPS.prop_map }), noUnit = NP.circuits(db2, MAPS), withLoad = db.exec("SELECT count(DISTINCT n.guid) FROM element_pset_native n WHERE n.pset='PSet_Revit_Type_Electrical - Loads' AND n.name='Apparent Load' AND n.guid IN (SELECT guid FROM element_pset_native WHERE pset='PSet_Revit_Electrical - Loads' AND name='Panel' AND trim(value)<>'')")[0].values[0][0];
  verdict('C3 red control: no meaning rows -> nothing reported', none === null ? 'PASS' : 'FAIL', 'result=' + JSON.stringify(none));
  verdict('C3 red control: no unit rows -> load unknown, not zero-by-silence', noUnit && noUnit.load_va === 0 && noUnit.unitUnknown === withLoad && withLoad > 0 ? 'PASS' : 'FAIL', 'load_va=' + (noUnit && noUnit.load_va) + ' unitUnknown=' + (noUnit && noUnit.unitUnknown) + ' devicesWithLoad=' + withLoad);
  // C4 the walker's own line
  const DW = require('../disc_walker.js'), lines = [], ol = console.log; DW.setNativeMaps(MAPS); console.log = m => lines.push(String(m));
  let c4 = null; try { c4 = DW.elecCircuits(db); } finally { console.log = ol; }
  const ln = lines.filter(l => /§WALK-ELEC-CIRCUITS /.test(l))[0] || null; console.log(TAG + ' walker| ' + ln);
  verdict('C4 the walker logs the same numbers', c4 && ln && ln.indexOf('panels=' + ind.panels + ' circuits=' + ind.circuits + ' devices=' + ind.devices + ' ') >= 0 ? 'PASS' : 'FAIL', 'line=' + (ln ? 'present' : 'absent'));
  done();
})().catch(e => { console.log(TAG + ' ERROR ' + (e.stack || e)); inc++; done(); });
