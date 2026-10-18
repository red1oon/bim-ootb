#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-PANELS: prompts/DXF2BIM_MODELLER_LANE.md §L11.2. Read the log after every run; exit code is not evidence.
 * Issue proved: wall panels drawn as ELEVATION HATCHES (the shed's gable ends) are reachable through the product: a layer that holds only hatches is LISTED in the editor (dxf-parser does not see
 * hatches), typing it `panel` makes a structure set, the thickness comes from the drawing's leader label, and Convert puts IfcWall panels on the canvas.
 *   P1 the hatch-only layer Wall is listed on the ELEV sheet and offers `panel`   P2 CONTROL untyped -> no structure verdict   P3 typed panel -> structure set, 2 bodies (lower 10", gable 5"), 0 blocking
 *   P4 Convert: 2 IfcWall inserts, provenance.ifc IfcWall   P5 the round trip: the saved (marked) sheets carry the typed layer and give the same 2 panels
 * Input is written here (tiny synthetic DXF); no local material needed.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { runE2E } = require('./e2e_harness');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panels-'));
const g = (c, v) => c + '\n' + v + '\n';
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const tx = (t, x, y) => g(0, 'TEXT') + g(8, 'Tex') + g(10, x) + g(20, y) + g(30, 0) + g(40, 20) + g(1, t);
const LD = (h, pts) => g(0, 'LEADER') + g(5, h) + g(8, 'Dim') + g(100, 'AcDbLeader') + g(76, pts.length) + pts.map(p => g(10, p[0]) + g(20, p[1]) + g(30, 0)).join('');
const hatch = (handle, layer, vs) => g(0, 'HATCH') + g(5, handle) + g(8, layer) + g(100, 'AcDbHatch') + g(10, 0) + g(20, 0) + g(30, 0) + g(2, 'BLOCKS') + g(70, 0) + g(71, 0) + g(91, 1) + g(92, 3) + g(72, 0) + g(73, 1) + g(93, vs.length) + vs.map(v => g(10, v[0]) + g(20, v[1])).join('') + g(97, 0) + g(75, 1) + g(76, 1) + g(98, 0);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 4000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 2150]];
const WEST = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minX'], ['@HAXIS=+Y'], ['@UNITS=mm'], ['@NAME=W'], ['@GRIDH=1', 150, 0], ['@GRIDH=2', 2150, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000]];
const westBody = hatch('H1', 'Wall', [[150, 0], [2150, 0], [2150, 2000], [150, 2000]]) + LD('L1', [[500, 1000], [700, -300], [900, -300]]) + tx('10" Brick Wall', 900, -300) +
  hatch('H2', 'Wall', [[150, 2000], [2150, 2000], [1150, 2500]]) + LD('L2', [[1150, 2200], [1500, 2800], [1800, 2800]]) + tx('5" Brick Wall', 1800, 2800);
const f = (n, t) => { const p = path.join(dir, n); fs.writeFileSync(p, t); return p; };
runE2E('W-DXF-PANELS', async (t) => {
  const pg = t.pg;
  const open = async (files) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 120000 }); await t.sleep(700); };
  const idle = async () => { await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 120000 }); await t.sleep(500); };
  const layersOpen = async () => { await pg.evaluate(() => { const s = window.DxfMetaEditor.state; if (!s.sec.layers) document.querySelector('#dm-panel .dm-sh[data-sec="layers"]').click(); }); await t.sleep(300); };
  const opts = (role, layer) => pg.evaluate((r, l) => { const s = document.querySelector('#dm-panel [data-layer-row="' + r + '|' + l + '"] select'); return s ? [...s.options].map(o => o.text) : null; }, role, layer);
  const choose = async (role, layer, v) => { await pg.select('#dm-panel [data-layer-row="' + role + '|' + layer + '"] select', v); await idle(); };
  const gate = () => pg.evaluate(() => { const g = window.DxfImportUI.state.gate, v = g.verdict, els = (g.R && g.R.els) || []; return { ok: g.ok, structure: g.structure || null, blocking: v ? v.blocking.length : -1, th: els.map(e => e.size && e.size.t && Math.round(e.size.t.number * 1000)).sort(), classes: els.map(e => e.class) }; });
  await open([f('plan.dxf', doc('', PLAN)), f('west.dxf', doc(westBody, WEST))]); await layersOpen();
  const o = await opts('elev', 'Wall');
  t.assert('P1 the layer that holds only hatches (Wall) is listed on the ELEV sheet and offers `panel`', !!o && o.includes('panel'), JSON.stringify(o));
  let s = await gate();
  t.assert('P2 CONTROL layer untyped -> no structure verdict', s.structure === null, JSON.stringify(s));
  await choose('elev', 'Wall', 'panel'); s = await gate(); console.log('state P3', JSON.stringify(s));
  t.assert('P3 Wall typed `panel` -> STRUCTURE set: 2 panels (254 mm lower from the 10" leader label, 127 mm gable from the 5" one), 0 blocking, IfcWall', s.structure && s.structure.bodies === 2 && s.blocking === 0 && JSON.stringify(s.th) === JSON.stringify([127, 254]) && s.classes.every(c => c === 'IfcWall'), JSON.stringify(s));
  const before = await t.oplog();
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 60000 }); await t.sleep(800);
  const after = await t.oplog(), conv = await pg.evaluate(() => { const L = window.DxfImportUI.state.last; return { counts: L.counts, n: L.nInserts }; }), lastOp = await t.lastOp(), P1 = lastOp && (lastOp.parameters || lastOp.params) || {};
  t.assert('P4 real Convert: 2 IfcWall inserts on Level 1, provenance.ifc IfcWall', conv.n === 2 && conv.counts['Level 1/IfcWall'] === 2 && after.len - before.len === 2 && P1.provenance && P1.provenance.ifc && P1.provenance.ifc.ifc_class === 'IfcWall', JSON.stringify(conv));
  const eff = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(sh => ({ name: sh.name, text: window.DxfMetaEditor.effText(sh) })));
  await open(eff.map(x => f('rt_' + x.name, x.text)));
  const s5 = await gate();
  t.assert('P5 round trip: the saved (marked) sheets state the typed hatch layer themselves -> the same 2 panels with no UI choice', s5.structure && s5.structure.bodies === 2 && JSON.stringify(s5.th) === JSON.stringify([127, 254]), JSON.stringify(s5));
});
