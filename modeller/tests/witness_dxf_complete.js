#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-COMPLETE: prompts/DXF2BIM_MODELLER_LANE.md §L13.2. Read the log after every run; exit code is not evidence.
 * Issue proved: the user can ask the product to COMPLETE a building at best effort. A structure set with its columns and end gables gets, on one tick, the floor slab and the gabled roof
 * it implies; they are amber (derived), listed as yellow defaults, and become real IfcSlab / IfcRoof inserts on Convert. Unticking removes them again.
 *   K1 without the tick: 4 columns + 4 panels = 8 bodies, no slab, no roof   K2 tick: +1 IfcSlab +2 IfcRoof, the four synth.* defaults listed   K3 Convert: 11 inserts incl. IfcSlab/IfcRoof, derived ones carry the amber colour 0xffb347
 *   K4 untick: back to 8 bodies and the synth defaults are gone
 * Input is written here (tiny synthetic DXF); no local material needed.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { runE2E } = require('./e2e_harness');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'complete-'));
const g = (c, v) => c + '\n' + v + '\n';
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const tx = (t, x, y) => g(0, 'TEXT') + g(8, 'Tex') + g(10, x) + g(20, y) + g(30, 0) + g(40, 20) + g(1, t);
const LD = (h, pts) => g(0, 'LEADER') + g(5, h) + g(8, 'Dim') + g(100, 'AcDbLeader') + g(76, pts.length) + pts.map(p => g(10, p[0]) + g(20, p[1]) + g(30, 0)).join('');
const poly = (layer, x0, y0, x1, y1, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, 4) + g(70, 1) + g(10, x0) + g(20, y0) + g(10, x1) + g(20, y0) + g(10, x1) + g(20, y1) + g(10, x0) + g(20, y1);
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const lbox = (layer, x0, y0, x1, y1) => line(layer, x0, y0, x1, y0) + line(layer, x1, y0, x1, y1) + line(layer, x1, y1, x0, y1) + line(layer, x0, y1, x0, y0);
const hatch = (handle, vs) => g(0, 'HATCH') + g(5, handle) + g(8, 'Wall') + g(100, 'AcDbHatch') + g(10, 0) + g(20, 0) + g(30, 0) + g(2, 'BLOCKS') + g(70, 0) + g(71, 0) + g(91, 1) + g(92, 3) + g(72, 0) + g(73, 1) + g(93, vs.length) + vs.map(v => g(10, v[0]) + g(20, v[1])).join('') + g(97, 0) + g(75, 1) + g(76, 1) + g(98, 0);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 7000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 4150], ['@LAYER=Col,column']];
const cols = []; [850, 6850].forEach(x => [0, 4000].forEach(y => cols.push([x, y])));
const SOUTH = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=S'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 7000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Col,column']];
const END = (face, name) => [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=' + face], ['@HAXIS=+Y'], ['@UNITS=mm'], ['@NAME=' + name], ['@GRIDH=1', 150, 0], ['@GRIDH=2', 4150, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Wall,panel']];
const endBody = hatch('H1', [[150, 0], [4150, 0], [4150, 3000], [150, 3000]]) + LD('L1', [[500, 1000], [700, -300], [900, -300]]) + tx('10" Brick Wall', 900, -300) + hatch('H2', [[150, 3000], [4150, 3000], [2150, 3500]]) + LD('L2', [[2150, 3200], [2500, 3800], [2800, 3800]]) + tx('5" Brick Wall', 2800, 3800);
const f = (n, t) => { const p = path.join(dir, n); fs.writeFileSync(p, t); return p; };
runE2E('W-DXF-COMPLETE', async (t) => {
  const pg = t.pg;
  const open = async (files) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 120000 }); await t.sleep(900); };
  const st = () => pg.evaluate(() => { const g = window.DxfImportUI.state.gate, els = (g && g.R && g.R.els) || []; const c = {}; els.forEach(e => { c[e.class] = (c[e.class] || 0) + 1; });
    return { structure: g && g.structure || null, classes: c, prov: els.filter(e => /^synth-/.test(e.guid)).map(e => e.prov), defaults: (window.DxfImportUI.state.defaults || []).map(d => d.key).filter(k => /^synth\./.test(k)), cb: !!document.getElementById('dxf-complete'), checked: !!(document.getElementById('dxf-complete') || {}).checked }; });
  const tick = async (v) => { await pg.evaluate((val) => { const c = document.getElementById('dxf-complete'); if (c.checked !== val) c.click(); }, v); await t.sleep(900); };
  await open([f('plan.dxf', doc(cols.map(([x, y], i) => poly('Col', x, y, x + 300, y + 300, 'C' + i)).join(''), PLAN)), f('south.dxf', doc(lbox('Col', 850, 0, 1150, 3000) + lbox('Col', 6850, 0, 7150, 3000), SOUTH)), f('west.dxf', doc(endBody, END('minX', 'W'))), f('east.dxf', doc(endBody, END('maxX', 'E')))]);
  let s = await st();
  t.assert('K1 without the tick: 4 columns + 4 panels = 8 bodies, no slab, no roof; the checkbox is offered (structure set)', s.structure && s.structure.bodies === 8 && !s.classes.IfcSlab && !s.classes.IfcRoof && s.cb && !s.checked, JSON.stringify(s));
  await tick(true); s = await st(); console.log('state K2', JSON.stringify(s));
  t.assert('K2 ticked: + 1 IfcSlab + 2 IfcRoof (11 bodies), all derived, the four synth.* defaults listed', s.structure && s.structure.bodies === 11 && s.classes.IfcSlab === 1 && s.classes.IfcRoof === 2 && s.prov.length === 3 && s.prov.every(p => p === 'derived') && ['synth.slab.thickness', 'synth.slab.footprint', 'synth.roof.sheet_thickness', 'synth.roof.overhang'].every(k => s.defaults.includes(k)), JSON.stringify(s));
  const before = await t.oplog();
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 60000 }); await t.sleep(900);
  const after = await t.oplog(), conv = await pg.evaluate(() => { const L = window.DxfImportUI.state.last; return { counts: L.counts, n: L.nInserts }; });
  const lastOp = await t.lastOp(), P1 = lastOp && (lastOp.parameters || lastOp.params) || {};
  t.assert('K3 real Convert: 11 inserts incl. 1 IfcSlab and 2 IfcRoof on Level 1', conv.n === 11 && conv.counts['Level 1/IfcSlab'] === 1 && conv.counts['Level 1/IfcRoof'] === 2 && after.len - before.len === 11, JSON.stringify(conv));
  t.assert('K3b the last insert (a synthetic roof sheet) carries the AMBER colour 0xffb347 and provenance derived, IfcRoof', P1.color === 0xffb347 && P1.provenance && P1.provenance.prov_kind === 'derived' && P1.provenance.ifc && P1.provenance.ifc.ifc_class === 'IfcRoof', JSON.stringify({ color: P1.color, prov: P1.provenance && P1.provenance.prov_kind }));
  await tick(false); s = await st();
  t.assert('K4 unticked: back to 8 bodies and the synth.* defaults are gone', s.structure && s.structure.bodies === 8 && s.defaults.length === 0 && !s.checked, JSON.stringify(s));
});
