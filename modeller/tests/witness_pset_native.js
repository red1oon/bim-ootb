#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PSET-NATIVE: prompts/DISC_WALK_DRAWN_INTEGRATION.md §12b BUILD slice 1. Read the log after every run.
 * ISSUE IT PROVES OR DISPROVES: the extractor kept only Pset_*Common, so the authoring tool's own property sets (circuits, loads, voltages) and the
 * standard non-Common sets were dropped. They must be kept in element_pset_native, values as written, an SI value only where the evidence states the unit.
 * CLAIMS:
 *   N1 COUNT     rows per set = an independent ifcopenshell count over the same element guids (occurrence overrides type).
 *   N2 ADDITIVE  every other table is identical to an extraction with the reader switched off (ctx.noNativePsets).
 *   N3 UNITS     a typed length = raw value x the file's own length scale; Switch Voltage reads 120 V through the map row;
 *                red control: with no map the same rows have value_si NULL.
 *   N4 NO TABLE  a file with no such set gets no table (stated if the control file has some).
 * Usage: node modeller/tests/witness_pset_native.js [ifc]   (default: the public Ifc2x3_Duplex_MEP.ifc; node + web-ifc + sql.js + python3 ifcopenshell)
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const H = process.env.HOME, req = n => { for (const m of [n, path.join(H, 'bim-compiler/node_modules', n)]) { try { return require(m); } catch (e) {} } throw new Error('missing ' + n); };
const W = req('web-ifc'), initSql = req('sql.js'), Core = require('../dxf2bim/ifc_extract_core.js');
const IFC = process.argv[2] || [path.join(H, 'Projects/bim-compiler/reference/residential/Ifc2x3_Duplex_MEP.ifc'), path.join(H, 'bim-compiler/internal/UNMERGED/Ifc2x3_Duplex_MEP.ifc')].find(f => fs.existsSync(f));
const CTRL = path.join(__dirname, '..', '..', 'IFC', 'SampleHouse_ARC.ifc');
const MAPS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dxf2bim', 'native_maps.json'), 'utf8'));
let pass = 0, fail = 0, inc = 0; const TAG = '§W-PSET-NATIVE';
const verdict = (n, v, x) => { if (v === 'PASS') pass++; else if (v === 'FAIL') fail++; else inc++; console.log(TAG + ' ' + n + ' ' + v + ' ' + x); };
async function extract(file, extra) {
  const SQL = await initSql(), api = new W.IfcAPI(); await api.Init();
  const sqlDb = new SQL.Database(), logs = [];
  await Core.extractToDb(Object.assign({ WebIFC: W, ifcApi: api, ifcData: new Uint8Array(fs.readFileSync(file)), db: Core.sqljsDb(sqlDb), Buf: Core.browserBuf, buildingName: 'MODEL', sourceName: path.basename(file), log: m => logs.push(m) }, extra || {}));
  const q = s => { const r = sqlDb.exec(s); return r.length ? r[0].values : []; };
  return { q, logs, tables: q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(r => r[0]) };
}
const dump = (d, t) => JSON.stringify(d.q('SELECT * FROM "' + t + '" ORDER BY rowid').filter(r => !(t === 'project_metadata' && r[0] === 'import_date')));   // import_date is the run's own clock
(async () => {
  if (!IFC) { verdict('SETUP', 'INCONCLUSIVE', 'the public Duplex MEP IFC was not found'); return done(); }
  const A = await extract(IFC, { nativeMaps: MAPS });
  console.log(TAG + ' ' + (A.logs.filter(l => /§PSET_NATIVE/.test(l))[0] || 'no §PSET_NATIVE line'));
  if (A.tables.indexOf('element_pset_native') < 0) { verdict('N1 COUNT', 'FAIL', 'no element_pset_native table; tables=' + A.tables.length + ' ' + A.logs.filter(l => /FAIL/.test(l)).slice(0, 3).join(' | ')); return done(); }
  // N1: independent count (ifcopenshell), over the guids this extraction holds
  const guids = A.q('SELECT guid FROM elements_meta').map(r => r[0]), gf = path.join(os.tmpdir(), 'wpn_guids_' + process.pid + '.json'); fs.writeFileSync(gf, JSON.stringify(guids));
  const py = `
import ifcopenshell, json, re, sys, collections
f = ifcopenshell.open(sys.argv[1]); want = set(json.load(open(sys.argv[2])))
def ok(n): return n and not re.match(r'^Pset_.*Common$', n) and not re.match(r'^(BIMOOTB_|Dxf2Bim_)', n) and n != 'Pset_Dxf2Bim'
def props(ps): return [p.Name for p in ps.HasProperties if p.is_a('IfcPropertySingleValue') and p.Name and p.NominalValue is not None]
occ = collections.defaultdict(set); typ = collections.defaultdict(set)
for r in f.by_type('IfcRelDefinesByProperties'):
    ps = r.RelatingPropertyDefinition
    if not ps.is_a('IfcPropertySet') or not ok(ps.Name): continue
    for o in r.RelatedObjects:
        if o.GlobalId in want:
            for n in props(ps): occ[o.GlobalId].add((ps.Name, n))
for r in f.by_type('IfcRelDefinesByType'):
    for ps in (r.RelatingType.HasPropertySets or []):
        if not ps.is_a('IfcPropertySet') or not ok(ps.Name): continue
        for o in r.RelatedObjects:
            if o.GlobalId in want:
                for n in props(ps): typ[o.GlobalId].add((ps.Name, n))
c = collections.Counter()
for g in want:
    for k in occ[g] | typ[g]: c[k[0]] += 1
print(json.dumps(c))
`;
  const pr = cp.spawnSync('python3', ['-c', py, IFC, gf], { encoding: 'utf8', maxBuffer: 1 << 26 }); fs.unlinkSync(gf);
  let ind = null; try { ind = JSON.parse(pr.stdout.trim().split('\n').pop()); } catch (e) {}
  const mine = {}; A.q('SELECT pset, count(*) FROM element_pset_native GROUP BY 1').forEach(r => mine[r[0]] = r[1]);
  if (!ind) verdict('N1 COUNT', 'INCONCLUSIVE', 'ifcopenshell count failed: ' + String(pr.stderr).slice(0, 200));
  else { const keys = Array.from(new Set(Object.keys(ind).concat(Object.keys(mine)))).sort(), diff = keys.filter(k => (ind[k] || 0) !== (mine[k] || 0));
    const tot = o => Object.values(o).reduce((a, b) => a + b, 0);
    verdict('N1 COUNT (rows per set = ifcopenshell)', !keys.length ? 'INCONCLUSIVE' : (diff.length ? 'FAIL' : 'PASS'), 'sets=' + keys.length + ' rows=' + tot(mine) + ' independent=' + tot(ind) + ' differing=' + JSON.stringify(diff.slice(0, 6).map(k => k + ':' + (mine[k] || 0) + '/' + (ind[k] || 0)))); }
  // N2: additive
  const B = await extract(IFC, { noNativePsets: true });
  const other = A.tables.filter(t => t !== 'element_pset_native'), changed = other.filter(t => B.tables.indexOf(t) < 0 || dump(A, t) !== dump(B, t));
  verdict('N2 ADDITIVE (every other table identical with the reader off)', (B.tables.indexOf('element_pset_native') >= 0 || B.tables.length !== other.length || changed.length) ? 'FAIL' : 'PASS', 'tables=' + other.length + ' changed=' + JSON.stringify(changed) + ' offHasTable=' + (B.tables.indexOf('element_pset_native') >= 0));
  // N3: units
  const len = A.q("SELECT value, value_si, unit FROM element_pset_native WHERE unit='METRE' AND CAST(value AS REAL)<>0 LIMIT 400"), scale = len.length ? len[0][1] / Number(len[0][0]) : null;
  const lenBad = len.filter(r => Math.abs(r[1] - Number(r[0]) * scale) > 1e-9 * Math.max(1, Math.abs(r[1])));
  const sv = A.q("SELECT value, value_si, unit FROM element_pset_native WHERE name='Switch Voltage'"), svBad = sv.filter(r => r[2] !== 'VOLT' || Math.abs(r[1] - 120) > 1e-6);
  const C = await extract(IFC, {}), svC = C.q("SELECT count(*), count(value_si) FROM element_pset_native WHERE name='Switch Voltage'")[0];
  const unk = A.q("SELECT name, count(*) FROM element_pset_native WHERE pset LIKE '%Electrical%' AND value_si IS NULL AND unit IS NULL AND CAST(value AS REAL)<>0 AND value GLOB '[0-9]*' GROUP BY 1 ORDER BY 2 DESC LIMIT 6");
  console.log(TAG + ' typedLength rows=' + len.length + ' fileScale=' + scale + ' | Switch Voltage rows=' + sv.length + ' sample=' + JSON.stringify(sv[0]) + ' | noMap rows=' + svC[0] + ' withSI=' + svC[1] + ' | electrical numbers left unit-unknown: ' + JSON.stringify(unk));
  verdict('N3 UNITS typed length = value x the file scale', !len.length ? 'INCONCLUSIVE' : (lenBad.length || scale !== 1 ? 'FAIL' : 'PASS'), 'rows=' + len.length + ' scale=' + scale + ' bad=' + lenBad.length + ' (this file states METRE, so scale 1)');
  verdict('N3 UNITS Switch Voltage = 120 V through the map row', !sv.length ? 'INCONCLUSIVE' : (svBad.length ? 'FAIL' : 'PASS'), 'rows=' + sv.length + ' bad=' + svBad.length);
  verdict('N3 red control: no map, no SI value', !svC[0] ? 'INCONCLUSIVE' : (svC[1] === 0 ? 'PASS' : 'FAIL'), 'rows=' + svC[0] + ' withSI=' + svC[1]);
  // N4: a file with no such set
  if (fs.existsSync(CTRL)) { const D = await extract(CTRL, { nativeMaps: MAPS }), has = D.tables.indexOf('element_pset_native') >= 0, n = has ? D.q('SELECT count(*), count(DISTINCT pset) FROM element_pset_native')[0] : [0, 0];
    console.log(TAG + ' control ' + path.basename(CTRL) + ' table=' + has + ' rows=' + n[0] + ' sets=' + n[1] + ' ' + (D.logs.filter(l => /§PSET_NATIVE/.test(l))[0] || ''));
    if (has) console.log(TAG + ' N4 NOT JUDGED: the control file carries ' + n[1] + ' such sets, so it cannot show the no-table case');
    else verdict('N4 NO TABLE (a file with no such set)', 'PASS', 'tables=' + D.tables.length); }
  done();
})().catch(e => { console.log(TAG + ' ERROR ' + (e.stack || e)); inc++; done(); });
function done() { console.log(TAG + '-VERDICT ' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc); process.exit(fail ? 1 : inc ? 2 : 0); }
