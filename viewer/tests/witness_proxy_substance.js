#!/usr/bin/env node
// WITNESS — proxy_substance: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §PROXY_SUBSTANCE SPEC.
// ISSUE THIS PROVES OR DISPROVES: a colourless IfcBuildingElementProxy rendered the STD_MAT teal flag even when its name or material says what it is
// (Jebel: a stainless mesh roof), and fixing that must be backward compatible: ONLY rows that render the flag today may move, on EVERY building.
// Runs the SHIPPED _getMaterial / _elementVariant / _surfRowOf. Fleet census over every real DB under buildings/ (sqlite3), so it cannot pass empty.
// Command: node viewer/tests/witness_proxy_substance.js
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { loadStreaming, mat, col } = require('./_colour_truth_load.js');
const L = loadStreaming(), A = L.A;
const rows = []; const row = (name, got, want, ok) => rows.push({ name, got: String(got), want: String(want), ok: !!ok });
const fp = m => [col(m), m.roughness, m.metalness, m.envMapIntensity, m.opacity || 1].join('|');
const P = 'IfcBuildingElementProxy', TEAL = '0,0.78,0.78';
// 1. the flag is real today, and the old table is reachable (red control)
A._proxySubstanceOff = true;
row('red control: off -> no variant for a named colourless proxy', A._elementVariant(P, 'MESH', 'Stainless Steel Mesh', ''), '', A._elementVariant(P, 'MESH', 'Stainless Steel Mesh', '') === '');
const flag = mat(A, null, P, '', 'ARC', null, 'Stainless Steel Mesh');
row('red control: off -> teal flag', col(flag), TEAL, col(flag) === TEAL);
A._proxySubstanceOff = false;
// 2. resolver
[['MESH:MESH:1', 'Stainless Steel Mesh', 'proxy:stainless'], ['CABLES:CABLES:1', 'Stainless Steel Cable', 'proxy:stainless'], ['Concrete Bench:Concrete Bench:1', '<Unnamed>', 'proxy:concrete'],
 ['MESH:MESH:1', '<Unnamed>', ''], ['CABLES:CABLES:1', '<Unnamed>', ''], ['Cupboard:Cupboard:1', '<Unnamed>', ''], ['Environment Box', '<Unnamed>', ''], ['Generic Models 7', '<Unnamed>', ''], ['Foo', 'Oak Veneer', 'proxy:timber'], ['Foo', 'Glass Pane', '']].forEach(c => {
  const v = A._elementVariant(P, c[0], c[1], ''); row(`variant "${c[0]}" / "${c[1]}"`, v, c[2], v === c[2]); });
// 3. what each key renders
const st = mat(A, null, P, 'proxy:stainless', 'ARC', null, 'Stainless Steel Mesh');
row('stainless: cited albedo, metal 0 (measured), global envInt, not teal, neutral', fp(st), 'metal 0 env 0.6', st.metalness === 0 && st.envMapIntensity === 0.6 && col(st) !== TEAL && Math.abs(st.color.r - st.color.b) < 0.1);
['concrete:IfcColumn', 'timber:IfcDoor', 'stone:IfcStair', 'metal:IfcMember', 'plaster:IfcCovering'].forEach(k => {
  const [key, cls] = k.split(':'), m = mat(A, null, P, 'proxy:' + key, 'ARC'), c = mat(A, null, cls, '', 'ARC'), S = A._stdMatClasses[cls];
  row(`${key} = the STD_MAT row of ${cls}`, col(m), [S.r, S.g, S.b].map(v => +v.toFixed(6)).join(','), S && col(m) === [S.r, S.g, S.b].map(v => +v.toFixed(6)).join(',') && m.metalness === S.metal); });
// 4. surface row: metal roof = R1 with its texture; not roof = R6; a coloured proxy never moves
A._surfRoofGuids = new Set(['roof']);
const el = (g, v, rgba, m) => ({ guid: g, ifcClass: P, matVariant: v, rgba, matName: m });
row('routed metal on the roof layer = R1', A._surfRowOf(el('roof', 'proxy:stainless', '', 'Stainless Steel Mesh')), 'R1', A._surfRowOf(el('roof', 'proxy:stainless', '', 'Stainless Steel Mesh')) === 'R1');
row('routed metal off the roof = R6', A._surfRowOf(el('x', 'proxy:stainless', '', 'Stainless Steel Mesh')), 'R6', A._surfRowOf(el('x', 'proxy:stainless', '', 'Stainless Steel Mesh')) === 'R6');
row('routed concrete by name = R3', A._surfRowOf(el('x', 'proxy:concrete', '', '<Unnamed>')), 'R3', A._surfRowOf(el('x', 'proxy:concrete', '', '<Unnamed>')) === 'R3');
row('coloured proxy on the roof keeps its row', A._surfRowOf(el('roof', '', '0.5,0.5,0.5,1.000', 'Stainless Steel')), 'R6', A._surfRowOf(el('roof', '', '0.5,0.5,0.5,1.000', 'Stainless Steel')) === 'R6');
// 5. FLEET CENSUS: the backward-compat law, on every real DB
const dirs = [path.join(process.env.DATA_ROOT || path.join(os.homedir(), 'bim-ootb'), 'buildings')];
const dbs = []; dirs.forEach(d => { try { fs.readdirSync(d).filter(f => /_extracted\.db$|^HospitalAjaibPath\.db$/.test(f)).forEach(f => { const p = path.join(d, f); if (fs.statSync(p).size > 1e6) dbs.push(p); }); } catch (e) {} });
if (process.env.EXTRA_DB) process.env.EXTRA_DB.split(':').forEach(p => dbs.push(p));
let total = 0, bad = 0, moved = 0, proxyCol = 0; const movedList = [];
const sep = '\x1f';
dbs.forEach(db => {
  let out = ''; try { out = cp.execFileSync('sqlite3', ['-separator', sep, '-readonly', db, "select ifc_class,element_name,ifnull(material_name,''),ifnull(material_rgba,''),ifnull(discipline,''),count(*) from elements_meta group by 1,2,3,4,5"], { maxBuffer: 1 << 30 }).toString(); } catch (e) { console.log('§PROXY_SUBSTANCE_DB skip ' + path.basename(db) + ' ' + String(e.message).slice(0, 60)); return; }
  let n = 0, m = 0; const seen = {};
  out.split('\n').forEach(line => { if (!line) return; const [cls, name, mn, rgba, disc, cnt] = line.split(sep); n += +cnt; total += +cnt;
    const off = (A._proxySubstanceOff = true, A._elementVariant(cls, name, mn)); A._proxySubstanceOff = false;   // the old 3-arg call = the shipped behaviour
    const on = A._elementVariant(cls, name, mn, rgba);
    if (on === off) return;
    const isFlag = cls === P && !rgba;
    if (!isFlag) { bad += +cnt; console.log('§PROXY_SUBSTANCE_VIOLATION ' + path.basename(db) + ' ' + cls + ' ' + name + ' rgba=' + rgba + ' ' + off + '->' + on); return; }
    m += +cnt; moved += +cnt; const k = on + ' ' + String(name).split(':')[0]; seen[k] = (seen[k] || 0) + +cnt; });
  console.log('§PROXY_SUBSTANCE_DB ' + path.basename(db) + ' rows=' + n + ' moved=' + m + ' ' + JSON.stringify(seen).slice(0, 400));
});
row('census judged a real fleet (not VACUOUS)', dbs.length + ' dbs ' + total + ' rows', '>= 5 dbs, > 100000 rows', dbs.length >= 5 && total > 100000);
row('BACKWARD COMPAT: rows with a colour or another class whose variant moved', bad, 0, bad === 0);
console.log('§PROXY_SUBSTANCE_CENSUS dbs=' + dbs.length + ' rows=' + total + ' moved=' + moved + ' violations=' + bad);
rows.forEach(r => { if (!r.ok) console.log('    FAILED ROW: ' + r.name + ' got=' + r.got + ' want=' + r.want); });
const pass = rows.filter(r => r.ok).length;
console.log('§WITNESS_PROXY_SUBSTANCE ' + (pass === rows.length ? 'PASS' : 'FAIL') + ' ' + pass + '/' + rows.length);
process.exit(pass === rows.length ? 0 : 1);
